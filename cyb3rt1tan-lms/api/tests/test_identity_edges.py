"""Cross-record security and stale-state regressions for identity workflows."""

import base64
from datetime import timedelta

import pytest
from sqlalchemy import select
from test_access import ORIGIN, PASSWORD, login
from test_identity import CSV, enroll, preview

from app import mail
from app.models import Invitation, MfaChallenge, User, now
from app.security import ResourceReferenceCodec


def test_admin_policy_requires_verified_mfa_and_revokes_own_session(clients, monkeypatch):
    admin, _, _ = clients
    _seed, codes = enroll(admin, login(admin), monkeypatch)
    result = admin.post(
        "/v1/auth/login",
        headers=ORIGIN,
        json={"username": "admin", "password": PASSWORD, "recovery_code": codes[0]},
    )
    assert result.status_code == 200
    headers = {**ORIGIN, "X-CSRF-Token": admin.cookies["lms_csrf"]}
    response = admin.put(
        "/v1/admin/security/mfa-policies/admin",
        headers=headers,
        json={"required": True, "reason": "Require staff MFA"},
    )
    assert response.status_code == 200
    assert admin.get("/v1/me").status_code == 401


def test_mfa_bad_key_fails_closed_and_wrong_codes_are_throttled(clients, monkeypatch):
    admin, _, _ = clients
    headers = login(admin)
    monkeypatch.setenv("MFA_ENCRYPTION_KEY", "invalid-key")
    assert (
        admin.post(
            "/v1/me/security/mfa/enrollment", headers=headers, json={"current_password": PASSWORD}
        ).status_code
        == 503
    )
    monkeypatch.setenv("MFA_ENCRYPTION_KEY", base64.b64encode(b"t" * 32).decode())
    assert (
        admin.post(
            "/v1/me/security/mfa/enrollment", headers=headers, json={"current_password": PASSWORD}
        ).status_code
        == 200
    )
    for _ in range(10):
        assert (
            admin.post(
                "/v1/me/security/mfa/enrollment/confirm", headers=headers, json={"code": "000000"}
            ).status_code
            == 400
        )
    assert (
        admin.post(
            "/v1/me/security/mfa/enrollment/confirm", headers=headers, json={"code": "000000"}
        ).status_code
        == 429
    )


def test_session_revocation_invalidates_prelogin_challenges(clients):
    admin, student, factory = clients
    headers = login(admin)
    login(student, "student")
    user_id = student.get("/v1/me").json()["id"]
    with factory.begin() as db:
        db.add(
            MfaChallenge(
                digest="f" * 64,
                user_id=user_id,
                expires_at=now() + timedelta(minutes=10),
                consumed=False,
            )
        )
    assert (
        admin.post(
            f"/v1/admin/users/{user_id}/sessions/revocations",
            headers=headers,
            json={"reason": "Security review"},
        ).status_code
        == 200
    )
    with factory() as db:
        assert not list(db.scalars(select(MfaChallenge)))


def test_expired_invitation_and_unprivileged_invite_are_rejected(clients, monkeypatch):
    admin, student, factory = clients
    headers = login(admin)
    student_headers = login(student, "student")
    monkeypatch.setattr(mail, "configured", lambda: True)
    tokens = []
    monkeypatch.setattr(mail, "deliver_invitation", lambda email, token: tokens.append(token))
    body = {"email": "invited@example.test", "role": "student"}
    assert (
        student.post("/v1/admin/invitations", headers=student_headers, json=body).status_code == 403
    )
    assert admin.post("/v1/admin/invitations", headers=headers, json=body).status_code == 202
    with factory.begin() as db:
        invitation = db.scalar(select(Invitation))
        invitation.expires_at = now() - timedelta(seconds=1)
    assert (
        student.post(
            "/v1/auth/accept-invitation",
            headers=ORIGIN,
            json={
                "token": tokens[0],
                "username": "invitee",
                "official_name": "Invitee",
                "password": PASSWORD,
            },
        ).status_code
        == 401
    )


def test_csv_invited_email_update_revokes_old_recipient_token(clients, monkeypatch):
    admin, student, _ = clients
    headers = login(admin)
    tokens = []
    monkeypatch.setattr(mail, "deliver_invitation", lambda email, token: tokens.append(token))
    for raw in [CSV, CSV.replace("new@example.test", "changed@example.test")]:
        job, result, request_headers = preview(admin, headers, raw)
        request_headers.update(
            {
                "X-Preview-Token": result["previewToken"],
                "X-Duplicate-Policy": "upsert",
                "X-Confirm": "true",
            }
        )
        assert (
            admin.post(
                f"/v1/admin/csv-imports/{job}/commit", headers=request_headers, content=raw
            ).status_code
            == 200
        )
    assert len(tokens) == 2
    body = {
        "token": tokens[0],
        "username": "new.student",
        "official_name": "New Student",
        "password": PASSWORD,
    }
    assert student.post("/v1/auth/accept-invitation", headers=ORIGIN, json=body).status_code == 401
    assert (
        student.post(
            "/v1/auth/accept-invitation", headers=ORIGIN, json={**body, "token": tokens[1]}
        ).status_code
        == 201
    )
    assert student.get("/v1/me").json()["email"] == "changed@example.test"


def test_csv_skip_and_invalid_rows_preserve_accounts(clients):
    admin, _, factory = clients
    headers = login(admin)
    raw = "username,email,official_name,institutional_id,role\nstudent,student@example.test,Changed,,teacher\n"
    job, result, request_headers = preview(admin, headers, raw, "skip")
    assert result["summary"]["skip"] == 1
    request_headers.update(
        {
            "X-Preview-Token": result["previewToken"],
            "X-Duplicate-Policy": "skip",
            "X-Confirm": "true",
        }
    )
    assert (
        admin.post(
            f"/v1/admin/csv-imports/{job}/commit", headers=request_headers, content=raw
        ).status_code
        == 200
    )
    with factory() as db:
        assert db.scalar(select(User).where(User.username == "student")).roles == ["student"]
    raw = CSV + "invalid,student@example.test,Invalid,S002,student\n"
    job, result, request_headers = preview(admin, headers, raw)
    assert result["summary"]["reject"] == 1
    request_headers.update(
        {
            "X-Preview-Token": result["previewToken"],
            "X-Duplicate-Policy": "upsert",
            "X-Confirm": "true",
        }
    )
    assert (
        admin.post(
            f"/v1/admin/csv-imports/{job}/commit", headers=request_headers, content=raw
        ).status_code
        == 409
    )
    with factory() as db:
        assert db.scalar(select(User).where(User.username == "new.student")) is None


def test_resource_reference_rejects_noncanonical_base64():
    codec = ResourceReferenceCodec(b"k" * 32)
    token = codec.encode("course", "id", "scope")
    with pytest.raises(ValueError):
        codec.decode("course", token + "=", "scope")
