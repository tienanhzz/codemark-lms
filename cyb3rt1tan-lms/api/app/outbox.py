"""Atomic audit/outbox recording for audit events and dormant runner dispatch."""

import hashlib
import json
import re
import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from .models import AuditEvent, OutboxMessage, now
from .runner_contract import canonical_json, validate_job


def enqueue(
    db: Session,
    event: AuditEvent,
    key: str,
    payload: dict[str, object],
    topic: str = "audit.committed",
) -> OutboxMessage:
    if not re.fullmatch(r"[a-zA-Z0-9:._-]{1,160}", key):
        raise ValueError("Invalid outbox idempotency key.")
    if topic == "audit.committed":
        if set(payload) != {"eventId", "action", "requestId"}:
            raise ValueError("Outbox payload contains unapproved fields.")
        if payload != {"eventId": event.id, "action": event.action, "requestId": event.request_id}:
            raise ValueError("Outbox metadata must match its audit event.")
        if not isinstance(payload["action"], str) or not re.fullmatch(r"[a-z][a-z0-9_.-]{0,79}", payload["action"]):
            raise ValueError("Invalid outbox action.")
        try:
            uuid.UUID(str(payload["eventId"]))
            uuid.UUID(str(payload["requestId"]))
        except (ValueError, TypeError):
            raise ValueError("Outbox identifiers must be UUIDs.") from None
        serialized_bytes = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
        if len(serialized_bytes) > 1024:
            raise ValueError("Outbox payload exceeds limit.")
    elif topic == "runner.job_requested":
        validate_job(payload)
        if event.action != topic or key != "runner:" + str(payload["jobId"]):
            raise ValueError("Runner outbox metadata mismatch.")
        serialized_bytes = canonical_json(payload)
    else:
        raise ValueError("Unsupported outbox topic.")
    fingerprint = hashlib.sha256(serialized_bytes).hexdigest()
    db.flush()
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        db.execute(
            pg_insert(OutboxMessage)
            .values(
                id=str(uuid.uuid4()),
                audit_event_id=event.id,
                idempotency_key=key,
                topic=topic,
                payload=payload,
                payload_digest=fingerprint,
                status="pending",
                attempts=0,
                created_at=now(),
                available_at=now(),
            )
            .on_conflict_do_nothing(index_elements=["idempotency_key"])
        )
        item = db.scalar(select(OutboxMessage).where(OutboxMessage.idempotency_key == key))
    else:
        item = db.scalar(select(OutboxMessage).where(OutboxMessage.idempotency_key == key))
        if item is None:
            item = OutboxMessage(
                audit_event_id=event.id,
                idempotency_key=key,
                topic=topic,
                payload=payload,
                payload_digest=fingerprint,
            )
            db.add(item)
            db.flush()
    if item is None or item.payload_digest != fingerprint or item.audit_event_id != event.id:
        raise ValueError("Outbox idempotency conflict.")
    return item


def enqueue_runner_job(
    db: Session, request_id: str, actor_id: str | None, envelope: dict[str, object]
) -> OutboxMessage:
    job = validate_job(envelope)
    event = AuditEvent(
        id=str(uuid.uuid4()),
        actor_id=actor_id,
        action="runner.job_requested",
        request_id=request_id,
        detail={"jobId": job["jobId"], "profileId": job["profileId"], "profileVersion": job["profileVersion"]},
    )
    db.add(event)
    db.flush()
    return enqueue(db, event, "runner:" + str(job["jobId"]), job, "runner.job_requested")


def record_audit(
    db: Session,
    request_id: str,
    action: str,
    actor_id: str | None,
    detail: dict[str, object] | None = None,
    ip_digest: str | None = None,
) -> AuditEvent:
    event = AuditEvent(
        id=str(uuid.uuid4()),
        actor_id=actor_id,
        action=action,
        request_id=request_id,
        ip_digest=ip_digest,
        detail=detail or {},
    )
    db.add(event)
    enqueue(
        db,
        event,
        "audit:" + event.id,
        {"eventId": event.id, "action": event.action, "requestId": event.request_id},
    )
    return event
