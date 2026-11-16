"""Self-service integration/concurrent token redemption on the disposable DB; never send mail."""

import json
import os
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

from dotenv import load_dotenv
from sqlalchemy import select
from sqlalchemy.engine import make_url

root = Path(__file__).resolve().parents[1]
load_dotenv(root / ".env")
target = os.environ["TEST_DATABASE_URL"]
url = make_url(target)
if url.database != "codemark_lms_test" or target == os.environ["DATABASE_URL"]:
    raise SystemExit("Self-service integration requires codemark_lms_test.")
os.environ["DATABASE_URL"] = target
os.environ["MIGRATION_DATABASE_URL"] = target
sys.path.insert(0, str(root / "api"))

from fastapi.testclient import TestClient
from app.database import SessionLocal
from app.main import app
from app.models import AuditEvent, OutboxMessage, PasswordReset, User, UserSession
from app.security import digest, passwords

origin = {"Origin": "http://127.0.0.1:3100"}
username = "qa.selfservice." + uuid.uuid4().hex[:12]
email = username + "@example.test"
password = "Isolated PostgreSQL fixture password only!"
new_password = "Different PostgreSQL fixture password only!"
with SessionLocal.begin() as db:
    user = User(username=username, email=email, official_name="Disposable self-service user",
                roles=["student"], password_hash=passwords.hash(password))
    db.add(user)
    db.flush()
    user_id = user.id

captured = []
with patch("app.mail.configured", return_value=True), patch(
    "app.mail.deliver_password_reset", side_effect=lambda recipient, token: captured.append((recipient, token))
), TestClient(app) as client:
    assert client.post("/v1/auth/login", headers=origin,
                       json={"username": username, "password": password}).status_code == 200
    headers = {**origin, "X-CSRF-Token": client.cookies["lms_csrf"]}
    profile = client.get("/v1/me/profile").json()
    body = {"expectedRevision": profile["revision"], "nickname": "Learner-" + uuid.uuid4().hex[:8],
            "contactEmail": "private.contact@example.test", "showEmailInCourses": False}
    response = client.patch("/v1/me/profile", headers=headers, json=body)
    assert response.status_code == 200, response.text
    assert response.json()["revision"] > profile["revision"]
    assert client.patch("/v1/me/profile", headers=headers, json=body).status_code == 409
    body.update(expectedRevision=response.json()["revision"], nickname=None)
    assert client.patch("/v1/me/profile", headers=headers, json=body).json()["error"]["code"] == "nickname_cooldown"
    assert client.get("/v1/me/sessions").json()["items"][0]["current"]
    assert client.get("/v1/admin/identity-policy").status_code == 403
    assert client.post("/v1/auth/password-resets", headers=origin, json={"email": email}).status_code == 202
    assert len(captured) == 1
    token = captured[0][1]
    with SessionLocal() as db:
        item = db.scalar(select(PasswordReset).where(PasswordReset.user_id == user_id))
        assert item.delivered and item.token_digest == digest(token)
        assert token not in str(item.__dict__)

    def redeem(_):
        with TestClient(app) as concurrent_client:
            return concurrent_client.post("/v1/auth/password-resets/complete", headers=origin,
                json={"token": token, "new_password": new_password}).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = sorted(executor.map(redeem, range(2)))
    assert results == [204, 400], results
    assert client.get("/v1/me").status_code == 401
    assert client.post("/v1/auth/login", headers=origin,
                       json={"username": username, "password": new_password}).status_code == 200
    headers["X-CSRF-Token"] = client.cookies["lms_csrf"]
    session_id = client.get("/v1/me/sessions").json()["items"][0]["id"]
    assert client.post("/v1/me/sessions/" + session_id + "/revoke", headers=headers,
                       json={"current_password": new_password}).status_code == 204
    assert client.get("/v1/me").status_code == 401

with SessionLocal() as db:
    assert not list(db.scalars(select(UserSession).where(UserSession.user_id == user_id)))
    event = db.scalar(select(AuditEvent).where(AuditEvent.actor_id == user_id,
        AuditEvent.action == "password_reset_completed"))
    assert event and db.scalar(select(OutboxMessage).where(OutboxMessage.audit_event_id == event.id))
    assert token not in str(event.detail) and email not in str(event.detail)

report = {
    "checkedAt": datetime.now(UTC).isoformat(), "result": "pass",
    "database": "codemark_lms_test", "realSMTP": False, "mainDatabaseMutations": False,
    "concurrentResetStatuses": results, "digestOnlyToken": True,
    "profileRevisionCooldown": True, "personalSessionRevocation": True,
    "atomicAuditOutbox": True, "browserVisualQA": False,
}
(root / "docs/master-kit/BUILD-026-validation.json").write_text(json.dumps(report, indent=2) + "\n", "utf-8")
print("PASS: PostgreSQL profile revision/cooldown, digest-only recovery, concurrent single-use redemption, session revocation and atomic audit/outbox. SMTP mocked; main DB unchanged.")
