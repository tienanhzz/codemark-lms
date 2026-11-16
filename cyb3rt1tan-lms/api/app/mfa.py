"""Encrypted TOTP, single-use recovery codes and atomic replay protection."""

import base64
import os
import secrets
import time
from datetime import timedelta

import pyotp
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from .models import MfaChallenge, MfaMethod, MfaPolicy, RecoveryCode, User, now
from .security import digest, utc


def cipher() -> AESGCM:
    try:
        key = base64.b64decode(os.environ.get("MFA_ENCRYPTION_KEY", ""), validate=True)
        if len(key) != 32:
            raise ValueError("Invalid key length")
        return AESGCM(key)
    except (ValueError, TypeError):
        raise HTTPException(503, "mfa_not_configured") from None


def required(db: Session, user: User) -> bool:
    return any(
        policy.required
        for policy in db.scalars(select(MfaPolicy).where(MfaPolicy.role.in_(user.roles)))
    )


def secret(method: MfaMethod) -> str:
    try:
        payload = base64.b64decode(method.encrypted_secret, validate=True)
        return (
            cipher()
            .decrypt(payload[:12], payload[12:], f"codemark:mfa:v1:{method.user_id}".encode())
            .decode()
        )
    except (ValueError, InvalidTag):
        raise HTTPException(503, "mfa_key_unavailable") from None


def begin(db: Session, user: User) -> dict[str, str]:
    existing = db.get(MfaMethod, user.id)
    if existing and existing.confirmed:
        raise HTTPException(409, "mfa_already_enabled")
    seed = pyotp.random_base32()
    nonce = secrets.token_bytes(12)
    encrypted = base64.b64encode(
        nonce + cipher().encrypt(nonce, seed.encode(), f"codemark:mfa:v1:{user.id}".encode())
    ).decode()
    expires = now() + timedelta(minutes=10)
    if existing:
        existing.encrypted_secret = encrypted
        existing.pending_expires_at = expires
        existing.last_step = -1
    else:
        db.add(
            MfaMethod(
                user_id=user.id,
                encrypted_secret=encrypted,
                confirmed=False,
                pending_expires_at=expires,
                last_step=-1,
            )
        )
    return {
        "secret": seed,
        "otpauthUri": pyotp.TOTP(seed).provisioning_uri(name=user.email, issuer_name="CodeMark"),
        "expiresAt": expires.isoformat(),
    }


def current_step() -> int:
    return int(time.time()) // 30


def consume_totp(db: Session, method: MfaMethod, code: str) -> bool:
    totp = pyotp.TOTP(secret(method))
    for step in [current_step(), current_step() - 1, current_step() + 1]:
        if pyotp.utils.strings_equal(totp.at(step * 30), code):
            matched = db.scalar(
                update(MfaMethod)
                .where(MfaMethod.user_id == method.user_id, MfaMethod.last_step < step)
                .values(last_step=step)
                .returning(MfaMethod.user_id)
            )
            return matched is not None
    return False


def verify(db: Session, user: User, code: str | None, recovery: str | None) -> bool:
    method = db.get(MfaMethod, user.id)
    if method is None or not method.confirmed:
        return False
    if code and not recovery:
        return consume_totp(db, method, code)
    if recovery and not code:
        consumed = db.scalar(
            update(RecoveryCode)
            .where(
                RecoveryCode.user_id == user.id,
                RecoveryCode.digest == digest(recovery.strip().upper()),
                RecoveryCode.used_at.is_(None),
            )
            .values(used_at=now())
            .returning(RecoveryCode.digest)
        )
        return consumed is not None
    return False


def confirm(db: Session, user: User, code: str) -> list[str]:
    method = db.get(MfaMethod, user.id)
    if method is None or method.confirmed or utc(method.pending_expires_at) <= now():
        raise HTTPException(400, "mfa_enrollment_expired")
    if not consume_totp(db, method, code):
        raise HTTPException(400, "invalid_mfa_code")
    method.confirmed = True
    db.execute(delete(RecoveryCode).where(RecoveryCode.user_id == user.id))
    codes = [secrets.token_hex(8).upper() for _ in range(10)]
    for recovery in codes:
        db.add(RecoveryCode(digest=digest(recovery), user_id=user.id))
    return codes


def reset(db: Session, user: User) -> None:
    db.execute(delete(MfaChallenge).where(MfaChallenge.user_id == user.id))
    db.execute(delete(RecoveryCode).where(RecoveryCode.user_id == user.id))
    db.execute(delete(MfaMethod).where(MfaMethod.user_id == user.id))
