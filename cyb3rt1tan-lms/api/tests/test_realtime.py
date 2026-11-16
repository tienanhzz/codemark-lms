"""Socket authentication and metadata-only realtime outbox checks."""

import hashlib
import json
import uuid

from sqlalchemy import delete
from test_access import login

from app.auth import ALLOWED_ORIGIN
from app.models import OutboxMessage, UserSession
from app.realtime import _authenticated_session, _session_is_active
from app.realtime_dispatch import _invalidation_payload
from app.security import digest


def test_socket_requires_same_origin_live_authenticated_session(clients):
    admin, _, factory = clients
    login(admin)
    token = admin.cookies["lms_session"]
    cookie_header = "lms_session=" + token

    identity = _authenticated_session(cookie_header, ALLOWED_ORIGIN, factory)
    assert identity is not None
    assert identity[1] == digest(token)
    assert _authenticated_session(cookie_header, "https://attacker.example", factory) is None
    assert _authenticated_session("", ALLOWED_ORIGIN, factory) is None
    assert _session_is_active(digest(token), factory)

    with factory.begin() as db:
        db.execute(delete(UserSession).where(UserSession.token_digest == digest(token)))
    assert not _session_is_active(digest(token), factory)


def test_realtime_outbox_drops_private_audit_fields():
    event_id = str(uuid.uuid4())
    request_id = str(uuid.uuid4())
    payload = {"eventId": event_id, "action": "notification_sent", "requestId": request_id}
    fingerprint = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    row = OutboxMessage(topic="audit.committed", payload=payload, payload_digest=fingerprint)

    assert _invalidation_payload(row) == {"eventId": event_id, "eventType": "state.changed"}
    row.payload = {**payload, "studentEmail": "private@example.test"}
    assert _invalidation_payload(row) is None
