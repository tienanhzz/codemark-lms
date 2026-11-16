"""Behavior and negative cases for the BUILD-01 authentication boundary."""

import base64
import os
from datetime import timedelta

os.environ["MFA_ENCRYPTION_KEY"] = base64.b64encode(b"t" * 32).decode()
os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
os.environ["LOGIN_HMAC_KEY"] = "test-only-key-with-at-least-32-characters"

import pytest
from cryptography.exceptions import InvalidTag
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models import AuditEvent, Preference, UserSession, now
from app.security import ResourceReferenceCodec, digest

ORIGIN = {"Origin": "http://127.0.0.1:3100"}
PASSWORD = "A test password for fixtures only!"


def login(client: TestClient, username: str = "admin") -> dict[str, str]:
    response = client.post(
        "/v1/auth/login", headers=ORIGIN, json={"username": "9999000001" if username == "student" else username, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {**ORIGIN, "X-CSRF-Token": client.cookies["lms_csrf"]}


def test_protected_endpoints_require_authentication(clients):
    admin, _, _ = clients
    for route in ["/v1/me", "/v1/me/preferences", "/v1/workspace/summary"]:
        response = admin.get(route)
        assert response.status_code == 401
        assert response.json()["requestId"]
        assert response.headers["cache-control"] == "no-store"


def test_cookie_and_storage_do_not_persist_bearer_tokens(clients):
    admin, _, factory = clients
    login(admin)
    cookie = admin.cookies["lms_session"]
    with factory() as db:
        stored = db.get(UserSession, digest(cookie))
        assert stored is not None
        assert stored.token_digest != cookie
        assert stored.csrf_digest != admin.cookies["lms_csrf"]
    response = admin.get("/v1/me")
    assert response.json()["roles"] == ["admin"]
    assert "password_hash" not in response.text


def test_bad_credentials_are_generic_and_counted(clients):
    admin, _, _ = clients
    for _ in range(10):
        response = admin.post(
            "/v1/auth/login", headers=ORIGIN, json={"username": "admin", "password": "wrong"}
        )
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "invalid_credentials"
    response = admin.post(
        "/v1/auth/login", headers=ORIGIN, json={"username": "admin", "password": PASSWORD}
    )
    assert response.status_code == 429


def test_csrf_and_origin_are_required_for_cookie_mutations(clients):
    admin, _, _ = clients
    headers = login(admin)
    settings = admin.get("/v1/me/preferences").json()
    assert admin.put("/v1/me/preferences", headers=ORIGIN, json=settings).status_code == 403
    assert (
        admin.put(
            "/v1/me/preferences", headers={**headers, "Origin": "https://evil.test"}, json=settings
        ).status_code
        == 403
    )
    assert admin.put("/v1/me/preferences", headers=headers, json=settings).status_code == 200


def test_preferences_are_validated_isolated_and_persistent(clients):
    admin, student, factory = clients
    headers = login(admin)
    login(student, "student")
    settings = admin.get("/v1/me/preferences").json()
    settings.update({"locale": "vi", "theme": "dark", "colorPalette": "forest-lime"})
    assert admin.put("/v1/me/preferences", headers=headers, json=settings).status_code == 200
    assert admin.get("/v1/me/preferences").json()["locale"] == "vi"
    assert student.get("/v1/me/preferences").json()["locale"] == "en"
    with factory() as db:
        assert len(list(db.scalars(select(Preference)))) == 1
    for invalid in [
        {"roles": ["admin"]},
        {"locale": "xx"},
        {"colorPalette": "unknown"},
        {"timeZone": "not/a-zone"},
    ]:
        assert (
            admin.put(
                "/v1/me/preferences", headers=headers, json={**settings, **invalid}
            ).status_code
            == 422
        )
    assert student.get("/v1/me").json()["roles"] == ["student"]


def test_non_admin_does_not_receive_global_counts_or_others_activity(clients):
    admin, student, _ = clients
    login(admin)
    login(student, "student")
    summary = student.get("/v1/workspace/summary").json()
    assert "accounts" not in summary["metrics"]
    assert summary["isAdmin"] is False
    assert len(summary["activity"]) == 1
    assert admin.get("/v1/workspace/summary").json()["metrics"]["accounts"] == 2


def test_logout_revokes_server_session(clients):
    admin, _, factory = clients
    headers = login(admin)
    token = admin.cookies["lms_session"]
    assert admin.post("/v1/auth/logout", headers=headers).status_code == 204
    assert admin.get("/v1/me").status_code == 401
    with factory() as db:
        assert db.get(UserSession, digest(token)) is None


def test_expired_session_is_rejected(clients):
    admin, _, factory = clients
    login(admin)
    with factory.begin() as db:
        session = db.get(UserSession, digest(admin.cookies["lms_session"]))
        session.expires_at = now() - timedelta(seconds=1)
    assert admin.get("/v1/me").status_code == 401


def test_password_change_rejects_bad_current_and_revokes_other_sessions(clients):
    admin, other, _ = clients
    headers = login(admin)
    login(other)
    payload = {
        "current_password": PASSWORD,
        "new_password": "A different sufficiently long password!",
    }
    assert (
        admin.post(
            "/v1/me/password", headers=headers, json={**payload, "current_password": "wrong"}
        ).status_code
        == 400
    )
    assert admin.post("/v1/me/password", headers=headers, json=payload).status_code == 204
    assert other.get("/v1/me").status_code == 401
    assert admin.get("/v1/me").status_code == 401


def test_audit_is_immutable_and_contains_no_credentials(clients):
    admin, _, factory = clients
    login(admin)
    with factory() as db:
        event = db.scalar(select(AuditEvent))
        assert PASSWORD not in str(event.detail)
        assert admin.cookies["lms_session"] not in str(event.detail)
        event.action = "tampered"
        with pytest.raises(ValueError, match="append-only"):
            db.flush()


def test_request_validation_does_not_echo_passwords(clients):
    admin, _, _ = clients
    response = admin.post(
        "/v1/auth/login",
        headers=ORIGIN,
        json={"username": "admin", "password": PASSWORD, "roles": ["admin"]},
    )
    assert response.status_code == 422
    assert PASSWORD not in response.text
    assert admin.post("/v1/auth/login", headers=ORIGIN, content=b"x" * 66000).status_code == 413


def test_reference_codec_rejects_tampering_and_wrong_context():
    codec = ResourceReferenceCodec(b"a" * 32)
    token = codec.encode("course", "private-id", "scope-a")
    assert "private-id" not in token
    assert codec.decode("course", token, "scope-a") == "private-id"
    assert codec.encode("course", "private-id", "scope-a") != token
    for kind, value, scope in [
        ("user", token, "scope-a"),
        ("course", token, "scope-b"),
        ("course", token[:-3] + ("A" if token[-3] != "A" else "B") + token[-2:], "scope-a"),
    ]:
        with pytest.raises(InvalidTag):
            codec.decode(kind, value, scope)
