"""Versioned MFA ciphertext and safe rewrap behavior."""

import base64
import json

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app import mfa
from app.mfa_rewrap import inspect_mfa_methods, rewrap_mfa_methods
from app.models import MfaMethod, User, now


def _encoded(value: bytes) -> str:
    return base64.b64encode(value).decode()


def _set_keyring(monkeypatch, active: str) -> None:
    monkeypatch.setenv(
        "MFA_ENCRYPTION_KEYS",
        json.dumps({"old": _encoded(b"o" * 32), "new": _encoded(b"n" * 32)}),
    )
    monkeypatch.setenv("MFA_ACTIVE_KEY_ID", active)


def test_rewrap_reads_legacy_and_versioned_rows_and_writes_active_key(clients, monkeypatch):
    _, _, factory = clients
    legacy_secret = "seed-alpha"
    _encoded_legacy_key = _encoded(b"l" * 32)
    monkeypatch.setenv("MFA_ENCRYPTION_KEY", _encoded_legacy_key)
    monkeypatch.delenv("MFA_ENCRYPTION_KEYS", raising=False)
    monkeypatch.delenv("MFA_ACTIVE_KEY_ID", raising=False)
    with factory() as db:
        user_ids = list(db.scalars(select(User.id).order_by(User.username)))
    legacy_ciphertext = mfa.encrypt_secret(user_ids[0], legacy_secret)

    _set_keyring(monkeypatch, "old")
    versioned_ciphertext = mfa.encrypt_secret(user_ids[1], "seed-beta")
    with factory.begin() as db:
        for user_id, ciphertext in zip(user_ids, [legacy_ciphertext, versioned_ciphertext]):
            db.add(
                MfaMethod(
                    user_id=user_id,
                    encrypted_secret=ciphertext,
                    confirmed=True,
                    pending_expires_at=now(),
                    last_step=-1,
                )
            )

    _set_keyring(monkeypatch, "new")
    with factory() as db:
        before = {row.user_id: row.encrypted_secret for row in db.scalars(select(MfaMethod))}
        assert inspect_mfa_methods(db, "new") == (2, 2)
        assert {
            row.user_id: row.encrypted_secret for row in db.scalars(select(MfaMethod))
        } == before

    with factory.begin() as db:
        assert rewrap_mfa_methods(db, "new") == 2

    with factory() as db:
        rows = db.scalars(select(MfaMethod)).all()
        assert all(row.encrypted_secret.startswith("v2.new.") for row in rows)
        assert {mfa.secret(row) for row in rows} == {legacy_secret, "seed-beta"}
        rewritten = {row.user_id: row.encrypted_secret for row in rows}
    with factory.begin() as db:
        assert rewrap_mfa_methods(db, "new") == 0
    with factory() as db:
        assert {
            row.user_id: row.encrypted_secret for row in db.scalars(select(MfaMethod))
        } == rewritten


def test_rewrap_preflights_all_rows_and_rejects_missing_old_key(clients, monkeypatch):
    _, _, factory = clients
    with factory() as db:
        user_ids = list(db.scalars(select(User.id).order_by(User.username)))
    _set_keyring(monkeypatch, "old")
    ciphertexts = [
        mfa.encrypt_secret(user_id, f"seed-{index}") for index, user_id in enumerate(user_ids)
    ]
    corrupted = ciphertexts[1].replace("v2.old.", "v2.unknown.", 1)
    originals = [ciphertexts[0], corrupted]
    with factory.begin() as db:
        for user_id, ciphertext in zip(user_ids, originals):
            db.add(
                MfaMethod(
                    user_id=user_id,
                    encrypted_secret=ciphertext,
                    confirmed=True,
                    pending_expires_at=now(),
                    last_step=-1,
                )
            )

    _set_keyring(monkeypatch, "new")
    with factory.begin() as db, pytest.raises(HTTPException, match="mfa_key_unavailable"):
        rewrap_mfa_methods(db, "new")
    with factory() as db:
        assert {row.encrypted_secret for row in db.scalars(select(MfaMethod))} == set(originals)

    with factory.begin() as db:
        restored = db.get(MfaMethod, user_ids[1])
        assert restored is not None
        restored.encrypted_secret = ciphertexts[1]
    monkeypatch.setenv("MFA_ENCRYPTION_KEYS", json.dumps({"new": _encoded(b"n" * 32)}))
    monkeypatch.delenv("MFA_ENCRYPTION_KEY")
    with factory() as db, pytest.raises(HTTPException, match="mfa_key_unavailable"):
        inspect_mfa_methods(db, "new")
