"""Shared authentication, authorization and security audit boundaries."""

import hashlib
import hmac
import os
import secrets
from datetime import timedelta
from typing import Annotated

from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from . import mfa
from .database import database
from .models import LoginThrottle, MfaChallenge, MfaMethod, PasswordReset, User, UserSession, now
from .outbox import record_audit
from .security import digest, dummy_hash, passwords, utc

DB = Annotated[Session, Depends(database, scope="function")]
ALLOWED_ORIGIN = os.environ.get("APP_ORIGIN", "http://127.0.0.1:3100")
HMAC_KEY = os.environ.get("LOGIN_HMAC_KEY", "")
if len(HMAC_KEY) < 32:
    raise RuntimeError("A dedicated LOGIN_HMAC_KEY of at least 32 characters is required.")
SECURE = os.environ.get("COOKIE_SECURE", "false") == "true"


def audit(
    db: Session,
    request: Request,
    action: str,
    user: User | None = None,
    detail: dict[str, object] | None = None,
) -> None:
    ip_digest = None
    if request.client and request.client.host:
        ip_digest = hmac.new(
            HMAC_KEY.encode("utf-8"), request.client.host.encode("utf-8"), hashlib.sha256
        ).hexdigest()
    record_audit(db, request.state.request_id, action, user.id if user else None, detail, ip_digest)


def public_user(user: User) -> dict[str, object]:
    return {
        "id": user.id,
        "username": user.username,
        "officialName": user.official_name,
        "email": user.email,
        "nickname": user.nickname,
        "roles": user.roles,
    }


def current(request: Request, db: DB) -> User:
    token = request.cookies.get("lms_session", "")
    session = db.get(UserSession, digest(token)) if token else None
    if session is None or utc(session.expires_at) <= now():
        raise HTTPException(401, "authentication_required")
    user = db.get(User, session.user_id)
    if user is None or user.status != "active":
        raise HTTPException(401, "authentication_required")
    if mfa.required(db, user) and not session.mfa_authenticated:
        raise HTTPException(401, "mfa_authentication_required")
    if request.method not in {"GET", "HEAD"}:
        csrf = request.headers.get("x-csrf-token", "")
        if not hmac.compare_digest(digest(csrf), session.csrf_digest):
            raise HTTPException(403, "csrf_rejected")
    request.state.session = session
    return user


Principal = Annotated[User, Depends(current, scope="function")]


def administrator(user: Principal) -> User:
    if "admin" not in user.roles:
        raise HTTPException(403, "forbidden")
    return user


Admin = Annotated[User, Depends(administrator, scope="function")]


def provisioner(user: Principal) -> User:
    if not set(user.roles) & {"admin", "administrativeAssistant"}:
        raise HTTPException(403, "forbidden")
    return user


Provisioner = Annotated[User, Depends(provisioner, scope="function")]


def lock_provisioner(db: Session, request: Request, user: User, kind: str) -> None:
    lock_principal(db, request, user)
    if "admin" not in user.roles and (
        kind == "users" or "administrativeAssistant" not in user.roles
    ):
        raise HTTPException(403, "forbidden")


def lock_identity(db: Session) -> None:
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(124091071)"))


def revoke_sessions(db: Session, user: User) -> int:
    sessions = list(db.scalars(select(UserSession).where(UserSession.user_id == user.id)))
    active = sum(utc(session.expires_at) > now() for session in sessions)
    for session in sessions:
        db.delete(session)
    db.execute(delete(MfaChallenge).where(MfaChallenge.user_id == user.id))
    for reset in db.scalars(
        select(PasswordReset).where(
            PasswordReset.user_id == user.id,
            PasswordReset.consumed_at.is_(None),
            PasswordReset.revoked_at.is_(None),
        )
    ):
        reset.revoked_at = now()
    return active


def verify_password(user: User, password: str) -> bool:
    try:
        return passwords.verify(user.password_hash or dummy_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def lock_principal(db: Session, request: Request, user: User) -> None:
    lock_identity(db)
    db.refresh(user)
    live = db.scalar(
        select(UserSession)
        .where(UserSession.token_digest == request.state.session.token_digest)
        .execution_options(populate_existing=True)
    )
    if live is None or utc(live.expires_at) <= now() or user.status != "active":
        raise HTTPException(401, "authentication_required")
    if mfa.required(db, user) and not live.mfa_authenticated:
        raise HTTPException(401, "mfa_authentication_required")


def lock_admin(db: Session, request: Request, user: User) -> None:
    lock_principal(db, request, user)
    if "admin" not in user.roles:
        raise HTTPException(403, "forbidden")


def throttle(db: Session, *scopes: str) -> list[LoginThrottle]:
    buckets = []
    for scope in sorted(scopes):
        key = hmac.new(HMAC_KEY.encode(), scope.encode(), "sha256").hexdigest()
        if db.bind is not None and db.bind.dialect.name == "postgresql":
            db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": int(key[:15], 16)})
        bucket = db.get(LoginThrottle, key)
        if bucket is None:
            bucket = LoginThrottle(key=key, failures=0, window_start=now())
            db.add(bucket)
        elif utc(bucket.window_start) + timedelta(minutes=15) <= now():
            bucket.failures = 0
            bucket.window_start = now()
        if bucket.failures >= 10:
            raise HTTPException(429, "login_rate_limited")
        buckets.append(bucket)
    return buckets


def reject(
    db: Session,
    buckets: list[LoginThrottle],
    request: Request,
    code: str = "invalid_credentials",
    status: int = 401,
) -> None:
    for bucket in buckets:
        bucket.failures += 1
    audit(db, request, "login_failed")
    db.commit()
    raise HTTPException(status, code)


def establish(
    db: Session, user: User, response: Response, verified_mfa: bool = False
) -> dict[str, object]:
    token, csrf = secrets.token_urlsafe(48), secrets.token_urlsafe(32)
    db.add(
        UserSession(
            token_digest=digest(token),
            user_id=user.id,
            csrf_digest=digest(csrf),
            expires_at=now() + timedelta(hours=8),
            mfa_authenticated=verified_mfa,
        )
    )
    for name, value, hidden in [("lms_session", token, True), ("lms_csrf", csrf, False)]:
        response.set_cookie(
            name, value, max_age=28800, httponly=hidden, secure=SECURE, samesite="strict", path="/"
        )
    return {
        "user": {
            key: value
            for key, value in public_user(user).items()
            if key in {"id", "username", "officialName", "roles"}
        }
    }


def login_account(db: Session, identifier: str) -> User | None:
    """Resolve the role's login identifier; reject cross-account ambiguity."""
    identifier = identifier.strip()
    normalized = identifier.lower()
    candidates: dict[str, User] = {}
    by_code = db.scalar(select(User).where(User.institutional_id == identifier))
    if by_code is not None and "student" in by_code.roles:
        candidates[by_code.id] = by_code
    by_name = db.scalar(select(User).where(User.username == normalized))
    if by_name is not None and "student" not in by_name.roles:
        candidates[by_name.id] = by_name
    for by_email in db.scalars(select(User).where(func.lower(User.email) == normalized)):
        if "teacher" in by_email.roles and "student" not in by_email.roles:
            candidates[by_email.id] = by_email
    return next(iter(candidates.values())) if len(candidates) == 1 else None


def authenticate(
    db: Session,
    request: Request,
    response: Response,
    username: str,
    password: str,
    code: str | None,
    recovery: str | None,
) -> dict[str, object]:
    identifier = username.strip()
    username = identifier.lower()
    network = request.client.host if request.client else "local"
    buckets = throttle(db, "account:" + username, "network:" + network)
    user = login_account(db, identifier)
    if user is None:
        try:
            passwords.verify(dummy_hash, password)
        except VerificationError:
            pass
        reject(db, buckets, request)
    assert user is not None
    if not verify_password(user, password) or user.status != "active":
        reject(db, buckets, request)
    method = db.get(MfaMethod, user.id)
    verified = False
    if method and method.confirmed:
        verified = mfa.verify(db, user, code, recovery)
        if not verified:
            reject(db, buckets, request)
    elif mfa.required(db, user):
        token = secrets.token_urlsafe(48)
        db.add(
            MfaChallenge(
                digest=digest(token),
                user_id=user.id,
                expires_at=now() + timedelta(minutes=10),
                consumed=False,
            )
        )
        for bucket in buckets:
            bucket.failures += 1
        response.status_code = 202
        return {"mfaSetupToken": token, "expiresInSeconds": 600}
    for bucket in buckets:
        bucket.failures = 0
    audit(db, request, "login", user)
    return establish(db, user, response, verified)
