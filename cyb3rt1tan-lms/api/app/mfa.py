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

from .configuration import MfaKeySettings, mfa_key_settings
from .models import MfaChallenge, MfaMethod, MfaPolicy, RecoveryCode, User, now
from .security import digest, utc


def key_settings() -> MfaKeySettings:
    try:
        return mfa_key_settings(os.environ)
    except (ValueError, TypeError):
        raise HTTPException(503, "mfa_not_configured") from None


def required(db: Session, user: User) -> bool:
    return any(
        policy.required
        for policy in db.scalars(select(MfaPolicy).where(MfaPolicy.role.in_(user.roles)))
    )


def decrypt_secret(user_id: str, encrypted: str) -> str:
    try:
        settings = key_settings()
        if encrypted.startswith("v2."):
            _, key_id, encoded = encrypted.split(".", 2)
            key = settings.keys[key_id]
            payload = base64.b64decode(encoded, validate=True)
            aad = f"codemark:mfa:v2:{key_id}:{user_id}".encode()
        else:
            if settings.legacy_key is None:
                raise ValueError("Legacy MFA key is not configured.")
            key = settings.legacy_key
            payload = base64.b64decode(encrypted, validate=True)
            aad = f"codemark:mfa:v1:{user_id}".encode()
        return AESGCM(key).decrypt(payload[:12], payload[12:], aad).decode()
    except (ValueError, KeyError, InvalidTag):
        raise HTTPException(503, "mfa_key_unavailable") from None


def secret(method: MfaMethod) -> str:
    return decrypt_secret(method.user_id, method.encrypted_secret)


def encrypt_secret(user_id: str, value: str) -> str:
    settings = key_settings()
    if settings.active_id is None:
        if settings.legacy_key is None:
            raise HTTPException(503, "mfa_not_configured")
        nonce = secrets.token_bytes(12)
        payload = nonce + AESGCM(settings.legacy_key).encrypt(
            nonce, value.encode(), f"codemark:mfa:v1:{user_id}".encode()
        )
        return base64.b64encode(payload).decode()

    key_id = settings.active_id
    nonce = secrets.token_bytes(12)
    payload = nonce + AESGCM(settings.keys[key_id]).encrypt(
        nonce, value.encode(), f"codemark:mfa:v2:{key_id}:{user_id}".encode()
    )
    return f"v2.{key_id}." + base64.b64encode(payload).decode()


def begin(db: Session, user: User) -> dict[str, str]:
    existing = db.get(MfaMethod, user.id)
    if existing and existing.confirmed:
        raise HTTPException(409, "mfa_already_enabled")
    seed = pyotp.random_base32()
    encrypted = encrypt_secret(user.id, seed)
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
