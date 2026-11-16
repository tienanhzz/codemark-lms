"""BUILD-025 configuration, atomic audit/outbox, redaction and operational boundaries."""

import uuid
from unittest.mock import Mock

import pytest
from sqlalchemy import func, select
from test_access import login
from test_identity_contracts import validate

from app import database as database_module
from app.configuration import database_settings
from app.database import verify_runtime_role
from app.models import AuditEvent, OutboxMessage, User
from app.outbox import enqueue, record_audit


def test_sqlite_requires_explicit_test_mode_and_memory_database():
    for environment in ["local", "production"]:
        with pytest.raises(ValueError, match="SQLite"):
            database_settings(
                {"APP_ENV": environment, "DATABASE_URL": "sqlite+pysqlite:///:memory:"}
            )
    with pytest.raises(ValueError, match="in-memory"):
        database_settings({"APP_ENV": "test", "DATABASE_URL": "sqlite+pysqlite:///data.db"})
    assert (
        database_settings(
            {"APP_ENV": "test", "DATABASE_URL": "sqlite+pysqlite:///:memory:"}
        ).environment
        == "test"
    )


@pytest.mark.parametrize(
    "change",
    [
        {"DATABASE_URL": "postgresql+psycopg://user:private-password@db/lms"},
        {"APP_ORIGIN": "http://lms.example.test"},
        {"COOKIE_SECURE": "false"},
        {"DB_POOL_SIZE": "1000"},
        {"DB_MAX_OVERFLOW": "-1"},
        {"DB_POOL_TIMEOUT": "not-a-number"},
    ],
)
def test_production_rejects_tls_cookie_origin_and_unbounded_pool_configuration(change):
    values = {
        "APP_ENV": "production",
        "DATABASE_URL": "postgresql+psycopg://user:private-password@db/lms?sslmode=verify-full&sslrootcert=/approved/ca.pem",
        "APP_ORIGIN": "https://lms.example.test",
        "COOKIE_SECURE": "true",
        "LOGIN_HMAC_KEY": "unit-test-login-hmac-key-at-least-32-bytes",
        "MFA_ENCRYPTION_KEY": "dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHQ=",
        **change,
    }
    with pytest.raises(ValueError) as error:
        database_settings(values)
    assert "private-password" not in str(error.value)


def test_configuration_repr_never_contains_database_credentials():
    config = database_settings(
        {"DATABASE_URL": "postgresql+psycopg://private-user:private-password@localhost/lms"}
    )
    assert config.pool_size == 5 and config.max_overflow == 5
    assert "private-user" not in repr(config) and "private-password" not in repr(config)
    session = Mock()
    session.execute.return_value.scalar_one.return_value = True
    with pytest.raises(RuntimeError, match="least-privilege"):
        verify_runtime_role(session)
    session.execute.return_value.scalar_one.return_value = False
    verify_runtime_role(session)


def test_migration_target_cannot_cross_database_even_in_local_mode(monkeypatch):
    settings = database_settings(
        {"DATABASE_URL": "postgresql+psycopg://runtime:private@localhost/codemark_lms_test"}
    )
    monkeypatch.setattr(database_module, "settings", settings)
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.setenv(
        "MIGRATION_DATABASE_URL", "postgresql+psycopg://migrator:private@localhost/codemark_lms"
    )
    with pytest.raises(ValueError, match="configured runtime database"):
        database_module.migration_engine()
    monkeypatch.setattr(
        database_module,
        "settings",
        database_settings(
            {
                "APP_ENV": "production",
                "DATABASE_URL": "postgresql+psycopg://runtime:private@localhost/lms?sslmode=verify-full&sslrootcert=/ca",
                "APP_ORIGIN": "https://lms.example.test",
                "COOKIE_SECURE": "true",
                "LOGIN_HMAC_KEY": "unit-test-login-hmac-key-at-least-32-bytes",
                "MFA_ENCRYPTION_KEY": "dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHQ=",
            }
        ),
    )
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("APP_ORIGIN", "https://lms.example.test")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.delenv("MIGRATION_DATABASE_URL")
    with pytest.raises(ValueError, match="distinct production migration"):
        database_module.migration_engine()


def test_business_audit_outbox_roll_back_together(clients):
    _, _, factory = clients
    with pytest.raises(RuntimeError, match="cancel"), factory.begin() as db:
        user = db.scalar(select(User).where(User.username == "student"))
        user.official_name = "Uncommitted change"
        record_audit(
            db, str(uuid.uuid4()), "transaction_test", user.id, {"reason": "private detail"}
        )
        assert db.scalar(select(func.count(OutboxMessage.id))) == 1
        raise RuntimeError("cancel")
    with factory() as db:
        assert db.scalar(select(User).where(User.username == "student")).official_name == "Student"
        assert db.scalar(select(func.count(AuditEvent.id))) == 0
        assert db.scalar(select(func.count(OutboxMessage.id))) == 0


def test_outbox_is_idempotent_and_rejects_sensitive_or_mismatched_payload(clients):
    _, _, factory = clients
    with factory.begin() as db:
        event = record_audit(
            db, str(uuid.uuid4()), "transaction_test", None, {"private": "never in payload"}
        )
        payload = {"eventId": event.id, "action": event.action, "requestId": event.request_id}
        first = enqueue(db, event, "audit:" + event.id, payload)
        second = enqueue(db, event, "audit:" + event.id, payload)
        assert first.id == second.id
        assert db.scalar(select(func.count(OutboxMessage.id))) == 1
        assert "never in payload" not in str(first.payload)
        for invalid in [
            {**payload, "password": "secret"},
            {**payload, "source": "private source"},
            {**payload, "action": "different_action"},
        ]:
            with pytest.raises(ValueError):
                enqueue(db, event, "audit:" + event.id, invalid)


def test_real_mutations_record_payload_safe_outbox_and_admin_only_diagnostics(clients):
    admin, student, factory = clients
    assert admin.get("/v1/admin/operations/persistence").status_code == 401
    headers = login(admin)
    login(student, "student")
    assert student.get("/v1/admin/operations/persistence").status_code == 403
    preferences = admin.get("/v1/me/preferences").json()
    assert (
        admin.put(
            "/v1/me/preferences", headers=headers, json={**preferences, "locale": "vi"}
        ).status_code
        == 200
    )
    response = admin.get("/v1/admin/operations/persistence")
    assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
    validate("PersistenceStatus", response.json())
    assert response.json()["pending"] == 3
    assert response.json()["dispatcherEnabled"] is False
    with factory() as db:
        events = list(db.scalars(select(AuditEvent)))
        messages = list(db.scalars(select(OutboxMessage)))
        assert len(events) == len(messages) == 3
        assert {m.audit_event_id for m in messages} == {e.id for e in events}
        assert all(set(m.payload) == {"eventId", "requestId", "action"} for m in messages)
    for private in [
        "DATABASE_URL",
        "password_hash",
        "token_digest",
        "payload_digest",
        "idempotency_key",
    ]:
        assert private not in response.text
