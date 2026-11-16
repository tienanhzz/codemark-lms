"""Guarded BUILD-025 PostgreSQL checks, including concurrent idempotency and TRUNCATE."""

import os
import sys
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from dotenv import load_dotenv
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import func, make_url, select, text
from sqlalchemy.exc import DBAPIError

root = Path(__file__).resolve().parents[1]
migration_config = Config(str(root / "api/alembic.ini"))
migration_config.set_main_option("script_location", str(root / "api/migrations"))
expected_head = ScriptDirectory.from_config(migration_config).get_current_head()
load_dotenv(root / ".env")
target = os.environ["TEST_DATABASE_URL"]
if (
    make_url(target).database != "codemark_lms_test"
    or target == os.environ["DATABASE_URL"]
):
    raise SystemExit("Persistence integration requires codemark_lms_test.")
os.environ.update(
    {
        "APP_ENV": "test",
        "DATABASE_URL": target,
        "MIGRATION_DATABASE_URL": target,
        "SMTP_APPROVED": "false",
    }
)
sys.path.insert(0, str(root / "api"))
from app.database import SessionLocal, engine
from app.main import app
from app.models import AuditEvent, OutboxMessage, User
from app.outbox import enqueue, record_audit
from fastapi.testclient import TestClient

with engine.connect() as connection:
    assert connection.scalar(text("SHOW statement_timeout")) == "15s"
    assert connection.scalar(text("SHOW lock_timeout")) == "5s"
    assert (
        connection.scalar(text("SELECT version_num FROM alembic_version"))
        == expected_head
    )
    for sql in [
        "UPDATE audit_events SET action='invalid'",
        "DELETE FROM audit_events",
        "TRUNCATE audit_events CASCADE",
    ]:
        try:
            connection.execute(text(sql))
            connection.commit()
            raise AssertionError("Audit mutation was not blocked.")
        except DBAPIError as error:
            connection.rollback()
            assert getattr(error.orig, "sqlstate", None) == "P0001", (
                "Expected the immutability trigger, not another SQL error."
            )

with SessionLocal.begin() as db:
    event = AuditEvent(
        id=str(uuid.uuid4()),
        action="integration_retry",
        request_id=str(uuid.uuid4()),
        detail={},
    )
    db.add(event)
    event_id = event.id
    payload = {
        "eventId": event.id,
        "action": event.action,
        "requestId": event.request_id,
    }
barrier = threading.Barrier(2)


def concurrent_enqueue():
    with SessionLocal.begin() as db:
        event = db.get(AuditEvent, event_id)
        barrier.wait(timeout=10)
        message = enqueue(db, event, "integration:" + event_id, payload)
        return message.id


with ThreadPoolExecutor(max_workers=2) as pool:
    futures = [pool.submit(concurrent_enqueue) for _ in range(2)]
    results = [future.result(timeout=20) for future in futures]
assert results[0] == results[1]
with SessionLocal() as db:
    baseline_events = db.scalar(select(func.count(AuditEvent.id)))
    baseline_messages = db.scalar(select(func.count(OutboxMessage.id)))
    student = db.scalar(select(User).where(User.username == "qa.student"))
    student_id, name = student.id, student.official_name
try:
    with SessionLocal.begin() as db:
        db.get(User, student_id).official_name = "Uncommitted test change"
        record_audit(
            db,
            str(uuid.uuid4()),
            "rollback_test",
            student_id,
            {"private": "not part of outbox"},
        )
        raise RuntimeError("deliberate rollback")
except RuntimeError as error:
    assert str(error) == "deliberate rollback"
with SessionLocal() as db:
    assert db.get(User, student_id).official_name == name
    assert db.scalar(select(func.count(AuditEvent.id))) == baseline_events
    assert db.scalar(select(func.count(OutboxMessage.id))) == baseline_messages
    messages = list(db.scalars(select(OutboxMessage)))
    audit_messages = [message for message in messages if message.topic == "audit.committed"]
    assert all(
        set(message.payload) == {"eventId", "action", "requestId"}
        for message in audit_messages
    )
    assert all(
        message.status == "pending" and message.attempts == 0 for message in audit_messages
    )
    assert (
        db.scalar(
            select(func.count(OutboxMessage.id))
            .outerjoin(AuditEvent, AuditEvent.id == OutboxMessage.audit_event_id)
            .where(AuditEvent.id.is_(None))
        )
        == 0
    )

with TestClient(app) as client:
    assert (
        client.post(
            "/v1/auth/login",
            headers={"Origin": "http://127.0.0.1:3100"},
            json={"username": "qa.admin", "password": "Build01-test-workspace-only!"},
        ).status_code
        == 200
    )
    reply = client.get("/v1/admin/operations/persistence")
    assert reply.status_code == 200 and reply.headers["cache-control"] == "no-store"
    status = reply.json()
    assert status["database"] == "postgresql" and status["migrations"] == [
        expected_head
    ]
    assert status["pending"] > 0 and status["dispatcherEnabled"] is False
    assert all(
        private not in reply.text
        for private in ["password", "token", "payload", "postgresql+psycopg"]
    )
print(
    "PASS: PostgreSQL concurrent outbox idempotency, business/audit/event rollback, UPDATE/DELETE/TRUNCATE immutability, configured timeouts and Admin diagnostics."
)
print(
    "Only the named test DB was changed. No dispatch, email or student-code execution occurred."
)
