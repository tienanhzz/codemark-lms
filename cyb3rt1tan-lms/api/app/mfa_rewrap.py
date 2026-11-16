"""Transactional helpers for rotating encrypted MFA secrets."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from .mfa import decrypt_secret, encrypt_secret
from .models import MfaMethod


def inspect_mfa_methods(db: Session, active_id: str) -> tuple[int, int]:
    """Decrypt all rows and return (total, rows not encrypted with the active key)."""
    rows = db.scalars(select(MfaMethod)).all()
    for row in rows:
        decrypt_secret(row.user_id, row.encrypted_secret)
    pending = sum(not row.encrypted_secret.startswith(f"v2.{active_id}.") for row in rows)
    return len(rows), pending


def rewrap_mfa_methods(db: Session, active_id: str) -> int:
    """Re-encrypt every MFA row with the active key; caller owns the transaction."""
    rows = db.scalars(select(MfaMethod).with_for_update()).all()
    # Validate every old ciphertext before mutating any ORM object.
    plaintexts = [(row, decrypt_secret(row.user_id, row.encrypted_secret)) for row in rows]
    changed = 0
    for row, plaintext in plaintexts:
        if row.encrypted_secret.startswith(f"v2.{active_id}."):
            continue
        replacement = encrypt_secret(row.user_id, plaintext)
        if not replacement.startswith(f"v2.{active_id}."):
            raise ValueError("Configured active MFA key changed during rewrap.")
        if decrypt_secret(row.user_id, replacement) != plaintext:
            raise ValueError("MFA rewrap verification failed.")
        if row.encrypted_secret != replacement:
            row.encrypted_secret = replacement
            changed += 1
    return changed
