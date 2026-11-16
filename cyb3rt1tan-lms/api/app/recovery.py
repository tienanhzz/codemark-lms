"""Single-use password recovery; SMTP work follows the generic public response."""

import secrets
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.orm import Session

from . import mail
from .auth import DB, audit, lock_identity, revoke_sessions, throttle, verify_password
from .identity_dto import PasswordResetComplete, PasswordResetRequest
from .identity_views import RecoveryRequested, RecoveryStatus
from .models import PasswordReset, User, now
from .outbox import record_audit
from .security import digest, passwords, utc

router = APIRouter(prefix="/v1/auth")


def revoke_resets(db: Session, user_id: str) -> None:
    for item in db.scalars(
        select(PasswordReset).where(
            PasswordReset.user_id == user_id,
            PasswordReset.consumed_at.is_(None),
            PasswordReset.revoked_at.is_(None),
        )
    ):
        item.revoked_at = now()


def eligible(item: PasswordReset, user: User | None) -> bool:
    return bool(
        user is not None
        and user.status == "active"
        and not item.consumed_at
        and not item.revoked_at
        and utc(item.expires_at) > now()
        and item.credential_digest == digest(user.password_hash)
        and item.email_digest == digest(user.email)
    )


def deliver_reset(engine: Engine, reset_id: str, token: str, request_id: str) -> None:
    # Raw token exists only in process memory. Failed/crashed delivery cannot be redeemed.
    with Session(engine) as db:
        item = db.get(PasswordReset, reset_id)
        user = db.get(User, item.user_id) if item else None
        if item is None or user is None or not eligible(item, user):
            return
        recipient = user.email
    delivered = False
    try:
        mail.deliver_password_reset(recipient, token)
        delivered = True
    except HTTPException:
        pass
    with Session(engine) as db, db.begin():
        lock_identity(db)
        item = db.get(PasswordReset, reset_id)
        user = db.get(User, item.user_id) if item else None
        if item is None:
            return
        if delivered and eligible(item, user):
            item.delivered = True
        else:
            item.revoked_at = now()
        record_audit(
            db,
            request_id,
            "password_reset_delivered" if item.delivered else "password_reset_delivery_failed",
            None,
            {"resetId": item.id},
        )


@router.get("/recovery/status", response_model=RecoveryStatus)
def recovery_status() -> dict[str, bool]:
    return {"available": mail.configured()}


@router.post("/password-resets", status_code=202, response_model=RecoveryRequested)
def request_reset(
    body: PasswordResetRequest, request: Request, background: BackgroundTasks, db: DB
) -> dict[str, str]:
    if not mail.configured():
        raise HTTPException(503, "smtp_not_configured")
    network = request.client.host if request.client else "local"
    for bucket in throttle(db, "reset-account:" + body.email, "reset-network:" + network):
        bucket.failures += 1
    lock_identity(db)
    user = db.scalar(select(User).where(User.email == body.email, User.status == "active"))
    if user is not None:
        revoke_resets(db, user.id)
        token = secrets.token_urlsafe(48)
        item = PasswordReset(
            token_digest=digest(token),
            user_id=user.id,
            credential_digest=digest(user.password_hash),
            email_digest=digest(user.email),
            expires_at=now() + timedelta(minutes=30),
        )
        db.add(item)
        db.flush()
        bind = db.get_bind()
        engine = bind.engine if isinstance(bind, Connection) else bind
        background.add_task(deliver_reset, engine, item.id, token, request.state.request_id)
    # Same status/body and audit for known, unknown and inactive addresses; no PII in audit.
    audit(db, request, "password_reset_requested")
    return {"message": "If an eligible account exists, recovery instructions will be sent."}


@router.post("/password-resets/complete", status_code=204)
def complete_reset(
    body: PasswordResetComplete, request: Request, response: Response, db: DB
) -> Response:
    network = request.client.host if request.client else "local"
    buckets = throttle(db, "reset-complete:" + network)
    lock_identity(db)
    item = db.scalar(
        select(PasswordReset)
        .where(PasswordReset.token_digest == digest(body.token))
        .with_for_update()
    )
    user = db.get(User, item.user_id) if item else None
    if item is None or not item.delivered or not eligible(item, user):
        for bucket in buckets:
            bucket.failures += 1
        audit(db, request, "password_reset_rejected")
        db.commit()
        raise HTTPException(400, "invalid_reset_token")
    assert user is not None
    if verify_password(user, body.new_password):
        raise HTTPException(400, "password_must_differ")
    user.password_hash = passwords.hash(body.new_password)
    item.consumed_at = now()
    db.flush()
    revoke_resets(db, user.id)
    revoked = revoke_sessions(db, user)
    audit(db, request, "password_reset_completed", user, {"revokedSessions": revoked})
    response.delete_cookie("lms_session", path="/")
    response.delete_cookie("lms_csrf", path="/")
    response.status_code = 204
    return response
