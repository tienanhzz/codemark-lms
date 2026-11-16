"""Password recovery, nickname privacy/concurrency and personal session authorization."""

from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from test_access import ORIGIN, PASSWORD, login

from app import mail
from app.models import AuditEvent, MfaMethod, OutboxMessage, PasswordReset, User, UserSession, now
from app.security import digest, passwords

NEW_PASSWORD = "New fixture password, not a real credential!"


def smtp(monkeypatch):
    captured = []
    monkeypatch.setattr(mail, "configured", lambda: True)
    monkeypatch.setattr(
        mail, "deliver_password_reset", lambda email, token: captured.append((email, token))
    )
    return captured


def request_token(client, captured):
    response = client.post(
        "/v1/auth/password-resets", headers=ORIGIN, json={"email": "student@example.test"}
    )
    assert response.status_code == 202, response.text
    assert len(captured) > 0
    return captured[-1][1]


def complete(client, token, password=NEW_PASSWORD):
    return client.post(
        "/v1/auth/password-resets/complete",
        headers=ORIGIN,
        json={"token": token, "new_password": password},
    )


def test_recovery_disabled_origin_and_no_account_enumeration(clients, monkeypatch):
    admin, _, factory = clients
    monkeypatch.setattr(mail, "configured", lambda: False)
    assert admin.get("/v1/auth/recovery/status").json() == {"available": False}
    assert (
        admin.post(
            "/v1/auth/password-resets", headers=ORIGIN, json={"email": "student@example.test"}
        ).status_code
        == 503
    )
    captured = smtp(monkeypatch)
    assert (
        admin.post("/v1/auth/password-resets", json={"email": "student@example.test"}).status_code
        == 403
    )
    bodies = []
    for email in ["student@example.test", "unknown@example.test"]:
        response = admin.post("/v1/auth/password-resets", headers=ORIGIN, json={"email": email})
        assert response.status_code == 202
        bodies.append(response.json())
    assert bodies[0] == bodies[1] and len(captured) == 1
    with factory() as db:
        item = db.scalar(select(PasswordReset))
        assert item.token_digest == digest(captured[0][1]) and item.delivered
        assert captured[0][1] not in repr(item.__dict__)
        for event in db.scalars(select(AuditEvent)):
            assert "@" not in str(event.detail) and captured[0][1] not in str(event.detail)


def test_reset_single_use_revokes_all_sessions_and_retains_mfa(clients, monkeypatch):
    admin, student, factory = clients
    headers = login(student, "student")
    captured = smtp(monkeypatch)
    token = request_token(admin, captured)
    with factory.begin() as db:
        user = db.scalar(select(User).where(User.username == "student"))
        db.add(
            MfaMethod(
                user_id=user.id,
                encrypted_secret="retained",
                confirmed=True,
                pending_expires_at=now(),
                last_step=-1,
            )
        )
    response = complete(admin, token)
    assert response.status_code == 204, response.text
    assert student.get("/v1/me").status_code == 401
    assert complete(admin, token).json()["error"]["code"] == "invalid_reset_token"
    with factory() as db:
        user = db.scalar(select(User).where(User.username == "student"))
        assert passwords.verify(user.password_hash, NEW_PASSWORD)
        assert db.get(MfaMethod, user.id).confirmed
        assert not list(db.scalars(select(UserSession).where(UserSession.user_id == user.id)))
        event = db.scalar(select(AuditEvent).where(AuditEvent.action == "password_reset_completed"))
        assert db.scalar(select(OutboxMessage).where(OutboxMessage.audit_event_id == event.id))
    assert (
        student.post(
            "/v1/me/password",
            headers=headers,
            json={"current_password": PASSWORD, "new_password": NEW_PASSWORD},
        ).status_code
        == 401
    )


@pytest.mark.parametrize("stale", ["expiry", "email", "password", "undelivered", "suspended"])
def test_reset_rejects_expired_changed_or_undelivered_identity(clients, monkeypatch, stale):
    admin, _, factory = clients
    captured = smtp(monkeypatch)
    token = request_token(admin, captured)
    with factory.begin() as db:
        item = db.scalar(select(PasswordReset))
        user = db.get(User, item.user_id)
        if stale == "expiry":
            item.expires_at = now() - timedelta(seconds=1)
        elif stale == "email":
            user.email = "changed@example.test"
        elif stale == "password":
            user.password_hash = passwords.hash("Changed credential for this fixture!")
        elif stale == "undelivered":
            item.delivered = False
        else:
            user.status = "suspended"
    assert complete(admin, token).status_code == 400


def test_reset_resend_delivery_failure_and_throttling(clients, monkeypatch):
    admin, _, factory = clients
    captured = smtp(monkeypatch)
    old = request_token(admin, captured)
    new = request_token(admin, captured)
    assert old != new and complete(admin, old).status_code == 400

    def fail(*args):
        raise HTTPException(503, "test_delivery_failure")

    monkeypatch.setattr(mail, "deliver_password_reset", fail)
    response = admin.post(
        "/v1/auth/password-resets", headers=ORIGIN, json={"email": "student@example.test"}
    )
    assert response.status_code == 202
    assert complete(admin, new).status_code == 400
    with factory() as db:
        assert all(item.revoked_at for item in db.scalars(select(PasswordReset)))
    for _ in range(7):
        assert (
            admin.post(
                "/v1/auth/password-resets", headers=ORIGIN, json={"email": "unknown@example.test"}
            ).status_code
            == 202
        )
    assert (
        admin.post(
            "/v1/auth/password-resets", headers=ORIGIN, json={"email": "unknown@example.test"}
        ).status_code
        == 429
    )


def test_password_change_and_suspend_restore_invalidate_recovery(clients, monkeypatch):
    admin, student, _ = clients
    aheaders = login(admin)
    sheaders = login(student, "student")
    captured = smtp(monkeypatch)
    token = request_token(admin, captured)
    uid = student.get("/v1/me").json()["id"]
    endpoint = "/v1/admin/users/" + uid
    assert (
        admin.post(
            endpoint + "/suspensions", headers=aheaders, json={"reason": "test review"}
        ).status_code
        == 200
    )
    assert (
        admin.post(
            endpoint + "/restore", headers=aheaders, json={"reason": "test restored"}
        ).status_code
        == 200
    )
    assert complete(admin, token).status_code == 400
    sheaders = login(student, "student")
    token = request_token(admin, captured)
    assert (
        student.post(
            "/v1/me/password",
            headers=sheaders,
            json={"current_password": PASSWORD, "new_password": NEW_PASSWORD},
        ).status_code
        == 204
    )
    assert complete(admin, token).status_code == 400


def test_profile_official_identity_unique_unicode_and_cooldown(clients):
    admin, student, factory = clients
    aheaders, sheaders = login(admin), login(student, "student")
    profile = student.get("/v1/me/profile").json()
    for field, value in [
        ("contactEmail", "bad\x00@example.test"),
        ("about", "bad\x00text"),
        ("phone", "bad\x00phone"),
        ("academicTitle", "bad\u202etitle"),
    ]:
        invalid = {"expectedRevision": profile["revision"], field: value}
        assert student.patch("/v1/me/profile", headers=sheaders, json=invalid).status_code == 422
    update = {
        "expectedRevision": profile["revision"],
        "nickname": "Học viên",
        "contactEmail": "contact@example.test",
        "showEmailInCourses": True,
        "about": "<script>plain text</script>",
    }
    assert (
        student.patch(
            "/v1/me/profile", headers=sheaders, json={**update, "roles": ["admin"]}
        ).status_code
        == 422
    )
    response = student.patch("/v1/me/profile", headers=sheaders, json=update)
    assert response.status_code == 200, response.text
    value = response.json()
    assert value["email"] == "student@example.test" and value["roles"] == ["student"]
    assert value["contactEmail"] == "contact@example.test" and value["nextNicknameChangeAt"]
    from test_identity_contracts import validate

    validate("PersonalProfile", value)
    assert student.patch("/v1/me/profile", headers=sheaders, json=update).status_code == 409
    partial = student.patch(
        "/v1/me/profile",
        headers=sheaders,
        json={"expectedRevision": value["revision"], "phone": "+84 fixture phone"},
    )
    assert partial.status_code == 200
    assert partial.json()["nickname"] == "Học viên"
    assert partial.json()["contactEmail"] == "contact@example.test"
    update["expectedRevision"] = partial.json()["revision"]
    update["nickname"] = None
    assert (
        student.patch("/v1/me/profile", headers=sheaders, json=update).json()["error"]["code"]
        == "nickname_cooldown"
    )
    arev = admin.get("/v1/me/profile").json()["revision"]
    assert (
        admin.patch(
            "/v1/me/profile",
            headers=aheaders,
            json={"expectedRevision": arev, "nickname": "HỌC VIÊN"},
        ).json()["error"]["code"]
        == "nickname_unavailable"
    )
    with factory() as db:
        student_user = db.scalar(select(User).where(User.username == "student"))
        assert student_user.nickname_key == "học viên"
        event = db.scalar(
            select(AuditEvent)
            .where(AuditEvent.action == "profile_updated")
            .order_by(AuditEvent.created_at)
        )
        assert event.detail == {"nicknameChanged": True}


def test_admin_policy_revision_filtering_and_zero_cooldown(clients):
    admin, student, _ = clients
    ah, sh = login(admin), login(student, "student")
    assert student.get("/v1/admin/identity-policy").status_code == 403
    policy = admin.get("/v1/admin/identity-policy").json()
    body = {
        "expectedRevision": policy["revision"],
        "nicknameCooldownDays": 0,
        "blockedTerms": ["badword"],
        "reason": "Test policy",
    }
    assert admin.put("/v1/admin/identity-policy", headers=ah, json=body).status_code == 200
    assert admin.put("/v1/admin/identity-policy", headers=ah, json=body).status_code == 409
    rev = student.get("/v1/me/profile").json()["revision"]
    for nickname in ["ＡＤＭＩＮ", "myBADword", "ab", "abc\u202e", "___"]:
        response = student.patch(
            "/v1/me/profile", headers=sh, json={"expectedRevision": rev, "nickname": nickname}
        )
        assert response.status_code == 422, nickname
    response = student.patch(
        "/v1/me/profile", headers=sh, json={"expectedRevision": rev, "nickname": "Allowed"}
    )
    assert response.status_code == 200
    response = student.patch(
        "/v1/me/profile",
        headers=sh,
        json={"expectedRevision": response.json()["revision"], "nickname": "Changed"},
    )
    assert response.status_code == 200


def test_personal_sessions_require_owner_password_csrf_and_revoke(clients):
    admin, student, _factory = clients
    _ah, sh = login(admin), login(student, "student")
    ast = admin.get("/v1/me/sessions").json()["items"][0]
    sst = student.get("/v1/me/sessions").json()["items"][0]
    assert ast["current"] and "token" not in str(ast)
    url = "/v1/me/sessions/" + ast["id"] + "/revoke"
    assert student.post(url, headers=sh, json={"current_password": PASSWORD}).status_code == 404
    url = "/v1/me/sessions/" + sst["id"] + "/revoke"
    assert student.post(url, headers=ORIGIN, json={"current_password": PASSWORD}).status_code == 403
    assert student.post(url, headers=sh, json={"current_password": "incorrect"}).status_code == 400
    assert student.post(url, headers=sh, json={"current_password": PASSWORD}).status_code == 204
    assert student.get("/v1/me").status_code == 401
    assert admin.get("/v1/me").status_code == 200


def test_profile_update_refreshes_expired_session_after_wait(clients, monkeypatch):
    admin, _, _factory = clients
    headers = login(admin)
    profile = admin.get("/v1/me/profile").json()
    from app import auth

    original = auth.lock_identity

    def expire(db):
        original(db)
        session = db.scalar(select(UserSession))
        session.expires_at = now() - timedelta(seconds=1)
        db.flush()

    monkeypatch.setattr(auth, "lock_identity", expire)
    response = admin.patch(
        "/v1/me/profile",
        headers=headers,
        json={"expectedRevision": profile["revision"], "nickname": "Expired"},
    )
    assert response.status_code == 401
