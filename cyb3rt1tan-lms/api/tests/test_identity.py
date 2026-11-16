"""BUILD-02 negative access, account lifecycle, encrypted MFA and import invariants."""

import hashlib

import pyotp
from fastapi import HTTPException
from sqlalchemy import select
from test_access import ORIGIN, PASSWORD, login

from app import mail, mfa
from app.models import CsvImport, Invitation, MfaMethod, RecoveryCode, User
from app.security import digest


def identity(client):
    return client.get("/v1/me").json()["id"]


def test_account_admin_boundaries_search_and_redaction(clients):
    admin, student, _ = clients
    login(admin)
    login(student, "student")
    assert student.get("/v1/admin/users").status_code == 403
    response = admin.get("/v1/admin/users?query=student&role=student&status=active")
    assert response.status_code == 200
    assert len(response.json()["items"]) == 1
    assert "password" not in response.text and "token_digest" not in response.text
    assert admin.get("/v1/admin/users?pageSize=101").status_code == 422
    assert admin.get("/v1/admin/users?courseId=missing").json()["items"] == []


def test_suspend_restore_requires_reason_and_revokes_sessions(clients):
    admin, student, _ = clients
    headers = login(admin)
    login(student, "student")
    user_id = identity(student)
    endpoint = f"/v1/admin/users/{user_id}"
    assert (
        admin.post(endpoint + "/suspensions", headers=headers, json={"reason": " "}).status_code
        == 422
    )
    assert (
        admin.post(
            endpoint + "/suspensions", headers=headers, json={"reason": "Review access"}
        ).status_code
        == 200
    )
    assert student.get("/v1/me").status_code == 401
    assert (
        admin.post(
            endpoint + "/restore", headers=headers, json={"reason": "Review completed"}
        ).status_code
        == 200
    )
    assert student.get("/v1/me").status_code == 401
    assert (
        admin.post(
            f"/v1/admin/users/{identity(admin)}/suspensions",
            headers=headers,
            json={"reason": "test"},
        ).status_code
        == 409
    )


def test_roles_are_multiple_revision_checked_and_revoke_access(clients):
    admin, student, _ = clients
    headers = login(admin)
    login(student, "student")
    user_id = identity(student)
    detail = admin.get(f"/v1/admin/users/{user_id}").json()
    body = {
        "roles": ["student", "teacher"],
        "reason": "New teaching assignment",
        "expectedRevision": detail["revision"],
    }
    assert (
        admin.patch(f"/v1/admin/users/{user_id}/roles", headers=headers, json=body).status_code
        == 200
    )
    assert student.get("/v1/me").status_code == 401
    assert (
        admin.patch(f"/v1/admin/users/{user_id}/roles", headers=headers, json=body).status_code
        == 409
    )
    own = admin.get(f"/v1/admin/users/{identity(admin)}").json()
    assert (
        admin.patch(
            f"/v1/admin/users/{own['id']}/roles",
            headers=headers,
            json={**body, "roles": ["student"], "expectedRevision": own["revision"]},
        ).status_code
        == 409
    )


def enroll(client, headers, monkeypatch):
    monkeypatch.setattr(mfa, "current_step", lambda: 20000000)
    response = client.post(
        "/v1/me/security/mfa/enrollment", headers=headers, json={"current_password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    seed = response.json()["secret"]
    code = pyotp.TOTP(seed).at(20000000 * 30)
    confirmation = client.post(
        "/v1/me/security/mfa/enrollment/confirm", headers=headers, json={"code": code}
    )
    assert confirmation.status_code == 200, confirmation.text
    return seed, confirmation.json()["recoveryCodes"]


def test_mfa_enrollment_encryption_replay_recovery_and_revocation(clients, monkeypatch):
    admin, _, factory = clients
    headers = login(admin)
    seed, codes = enroll(admin, headers, monkeypatch)
    assert len(codes) == 10 and all(len(code) == 16 for code in codes)
    assert admin.get("/v1/me").status_code == 401
    with factory() as db:
        method = db.scalar(select(MfaMethod))
        assert seed not in method.encrypted_secret
        assert len(list(db.scalars(select(RecoveryCode)))) == 10
        assert all(code != codes[0] for code in db.scalars(select(RecoveryCode.digest)))
    payload = {"username": "admin", "password": PASSWORD}
    assert admin.post("/v1/auth/login", headers=ORIGIN, json=payload).status_code == 401
    # Enrollment consumed this time step, so a copied code cannot authenticate again.
    assert (
        admin.post(
            "/v1/auth/login",
            headers=ORIGIN,
            json={**payload, "mfa_code": pyotp.TOTP(seed).at(20000000 * 30)},
        ).status_code
        == 401
    )
    assert (
        admin.post(
            "/v1/auth/login", headers=ORIGIN, json={**payload, "recovery_code": codes[0]}
        ).status_code
        == 200
    )
    assert (
        admin.post(
            "/v1/auth/login", headers=ORIGIN, json={**payload, "recovery_code": codes[0]}
        ).status_code
        == 401
    )
    monkeypatch.setattr(mfa, "current_step", lambda: 20000001)
    assert (
        admin.post(
            "/v1/auth/login",
            headers=ORIGIN,
            json={**payload, "mfa_code": pyotp.TOTP(seed).at(20000001 * 30)},
        ).status_code
        == 200
    )


def test_required_mfa_has_prelogin_challenge_and_no_session_until_confirmed(clients, monkeypatch):
    admin, student, _factory = clients
    headers = login(admin)
    assert (
        admin.put(
            "/v1/admin/security/mfa-policies/admin",
            headers=headers,
            json={"required": True, "reason": "Security policy"},
        ).status_code
        == 409
    )
    assert (
        admin.put(
            "/v1/admin/security/mfa-policies/student",
            headers=headers,
            json={"required": True, "reason": "Security policy"},
        ).status_code
        == 200
    )
    response = student.post(
        "/v1/auth/login", headers=ORIGIN, json={"username": "student", "password": PASSWORD}
    )
    assert response.status_code == 202
    assert student.get("/v1/me").status_code == 401
    token = response.json()["mfaSetupToken"]
    assert (
        student.post(
            "/v1/auth/mfa/enrollment", headers=ORIGIN, json={"setup_token": "x" * 48}
        ).status_code
        == 400
    )
    start = student.post("/v1/auth/mfa/enrollment", headers=ORIGIN, json={"setup_token": token})
    assert start.status_code == 200
    monkeypatch.setattr(mfa, "current_step", lambda: 20000010)
    payload = {"setup_token": token, "code": pyotp.TOTP(start.json()["secret"]).at(20000010 * 30)}
    response = student.post("/v1/auth/mfa/enrollment/confirm", headers=ORIGIN, json=payload)
    assert response.status_code == 200
    assert student.get("/v1/me").status_code == 200
    assert (
        student.post("/v1/auth/mfa/enrollment/confirm", headers=ORIGIN, json=payload).status_code
        == 400
    )


def test_invitation_digest_only_acceptance_and_replay(clients, monkeypatch):
    admin, student, factory = clients
    headers = login(admin)
    delivered = []
    monkeypatch.setattr(mail, "configured", lambda: True)
    monkeypatch.setattr(
        mail, "deliver_invitation", lambda email, token: delivered.append((email, token))
    )
    response = admin.post(
        "/v1/admin/invitations",
        headers=headers,
        json={"email": "new@example.test", "role": "student"},
    )
    assert response.status_code == 202
    token = delivered[0][1]
    assert token not in response.text
    with factory() as db:
        invitation = db.scalar(select(Invitation))
        assert invitation.token_digest == digest(token)
    payload = {
        "token": token,
        "username": "new.student",
        "official_name": "New Student",
        "password": PASSWORD,
    }
    assert (
        student.post("/v1/auth/accept-invitation", headers=ORIGIN, json=payload).status_code == 201
    )
    assert student.get("/v1/me").json()["roles"] == ["student"]
    assert (
        student.post("/v1/auth/accept-invitation", headers=ORIGIN, json=payload).status_code == 401
    )


def test_mail_failure_revokes_invitation_and_unconfigured_delivery_fails_closed(
    clients, monkeypatch
):
    admin, _, factory = clients
    headers = login(admin)
    monkeypatch.setattr(mail, "configured", lambda: False)
    payload = {"email": "new@example.test", "role": "student"}
    assert admin.post("/v1/admin/invitations", headers=headers, json=payload).status_code == 503
    monkeypatch.setattr(mail, "configured", lambda: True)

    def fail(*args):
        raise HTTPException(503, "invitation_delivery_failed")

    monkeypatch.setattr(mail, "deliver_invitation", fail)
    assert admin.post("/v1/admin/invitations", headers=headers, json=payload).status_code == 503
    with factory() as db:
        assert db.scalar(select(Invitation)).revoked_at is not None


CSV = "username,email,official_name,institutional_id,role\nnew.student,new@example.test,New Student,S001,student\n"


def preview(client, headers, raw=CSV, policy="upsert"):
    response = client.post(
        "/v1/admin/csv-imports",
        headers=headers,
        json={"importKind": "users", "templateVersion": 1, "duplicatePolicy": policy},
    )
    assert response.status_code == 201
    job = response.json()["jobId"]
    raw_headers = {
        **headers,
        "Content-Type": "text/csv",
        "X-File-SHA256": hashlib.sha256(raw.encode()).hexdigest(),
    }
    response = client.post(
        f"/v1/admin/csv-imports/{job}/preview", headers=raw_headers, content=raw.encode()
    )
    assert response.status_code == 200, response.text
    return job, response.json(), raw_headers


def test_csv_preview_commit_checksum_replay_and_no_raw_identity_staging(clients, monkeypatch):
    admin, _, factory = clients
    headers = login(admin)
    delivered = []
    monkeypatch.setattr(mail, "deliver_invitation", lambda email, token: delivered.append(token))
    job, result, raw_headers = preview(admin, headers)
    assert result["summary"]["create"] == 1
    with factory() as db:
        stored = db.get(CsvImport, job)
        assert "new@example.test" not in str(stored.outcomes) + str(stored.snapshot)
        assert result["previewToken"] != stored.preview_digest
    commit_headers = {
        **raw_headers,
        "X-Preview-Token": result["previewToken"],
        "X-Duplicate-Policy": "upsert",
        "X-Confirm": "true",
    }
    response = admin.post(
        f"/v1/admin/csv-imports/{job}/commit", headers=commit_headers, content=CSV
    )
    assert response.status_code == 200, response.text
    assert response.json()["invitationDelivery"]["sent"] == 1
    assert (
        admin.post(
            f"/v1/admin/csv-imports/{job}/commit", headers=commit_headers, content=CSV
        ).status_code
        == 409
    )
    with factory() as db:
        assert db.scalar(select(User).where(User.username == "new.student")).status == "invited"


def test_csv_rejects_email_merge_duplicates_stale_preview_and_password_columns(clients):
    admin, _, factory = clients
    headers = login(admin)
    raw = CSV.replace("new@example.test", "student@example.test")
    _, result, _ = preview(admin, headers, raw)
    assert result["summary"]["reject"] == 1
    raw = CSV + CSV.splitlines()[1] + "\n"
    _, result, _ = preview(admin, headers, raw)
    assert result["summary"]["reject"] == 1
    raw = "username,email,official_name,institutional_id,role\nstudent,student@example.test,Student,,student\n"
    job, result, raw_headers = preview(admin, headers, raw)
    with factory.begin() as db:
        student = db.scalar(select(User).where(User.username == "student"))
        student.official_name = "Changed after preview"
    commit_headers = {
        **raw_headers,
        "X-Preview-Token": result["previewToken"],
        "X-Duplicate-Policy": "upsert",
        "X-Confirm": "true",
    }
    assert (
        admin.post(
            f"/v1/admin/csv-imports/{job}/commit", headers=commit_headers, content=raw
        ).status_code
        == 409
    )


def test_smtp_requires_starttls_and_fragment_token(monkeypatch):
    events = []

    class Server:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def ehlo(self):
            events.append("ehlo")

        def starttls(self, context):
            events.append("tls")

        def send_message(self, message):
            events.append("send")
            assert "/accept-invitation#token=" in message.get_content()

    monkeypatch.setenv("SMTP_APPROVED", "true")
    monkeypatch.setenv("SMTP_HOST", "relay.example.test")
    monkeypatch.setenv("SMTP_FROM", "accounts@example.test")
    monkeypatch.delenv("SMTP_USERNAME", raising=False)
    monkeypatch.setattr(mail.smtplib, "SMTP", Server)
    mail.deliver_invitation("new@example.test", "a" * 64)
    assert events == ["ehlo", "tls", "ehlo", "send"]
