"""Dormant Redis Streams transport and PostgreSQL admission plumbing.

This module never executes source. The consumer persists job identity before
acknowledging a stream entry so redelivery remains safe and idempotent.
"""

import hashlib
import json
import os
import re
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlsplit

from redis import Redis
from redis.exceptions import RedisError, ResponseError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from .models import OutboxMessage, RunnerJobReceipt, RunnerJobResult, now
from .runner_contract import canonical_json, validate_job, validate_result

JOB_STREAM = "cyb3rt1tan:runner:v1:jobs"
WORKER_GROUP = "cyb3rt1tan:runner:v1:workers"
DEAD_LETTER_STREAM = "cyb3rt1tan:runner:v1:dead-letter"
MAX_DISPATCH_ATTEMPTS = 8
MAX_BATCH = 32
CLAIM_IDLE_MS = 60_000


def redis_url(values: dict[str, str] | None = None) -> str:
    values = values or dict(os.environ)
    raw = values.get("RUNNER_REDIS_URL", "")
    if values.get("RUNNER_QUEUE_ENABLED", "false").lower() != "true" or not raw:
        raise ValueError("runner_queue_disabled")
    parsed = urlsplit(raw)
    if parsed.scheme not in {"redis", "rediss"} or not parsed.hostname:
        raise ValueError("runner_redis_url_invalid")
    if (
        not parsed.username
        or parsed.username.lower() in {"default", "redis"}
        or not parsed.password
    ):
        raise ValueError("runner_redis_acl_required")
    if values.get("APP_ENV") == "production" and parsed.scheme != "rediss":
        raise ValueError("runner_redis_tls_required")
    return raw


def redis_client(values: dict[str, str] | None = None) -> Redis:
    return Redis.from_url(
        redis_url(values), decode_responses=True, socket_connect_timeout=2, socket_timeout=3
    )


def retry_delay(attempts: int) -> int:
    exponent = max(0, min(attempts, 8))
    delay = 1 << exponent
    return min(delay, 300)


def dispatch_once(factory: sessionmaker[Session], client: Any, limit: int = MAX_BATCH) -> int:
    dispatched = 0
    with factory() as db:
        rows = list(
            db.scalars(
                select(OutboxMessage)
                .where(
                    OutboxMessage.topic == "runner.job_requested",
                    OutboxMessage.status == "pending",
                    OutboxMessage.available_at <= now(),
                )
                .order_by(OutboxMessage.created_at, OutboxMessage.id)
                .limit(min(max(limit, 1), MAX_BATCH))
                .with_for_update(skip_locked=True)
            )
        )
        for row in rows:
            row.attempts += 1
            try:
                envelope = validate_job(row.payload)
            except (ValueError, TypeError):
                row.status = "exhausted"
                continue
            try:
                client.xadd(
                    JOB_STREAM,
                    {
                        "outboxId": row.id,
                        "jobId": str(envelope["jobId"]),
                        "idempotencyKey": str(envelope["idempotencyKey"]),
                        "payloadDigest": row.payload_digest,
                        "payload": canonical_json(envelope).decode("utf-8"),
                    },
                )
                row.status = "dispatched"
                row.dispatched_at = now()
                dispatched += 1
            except RedisError:
                if row.attempts >= MAX_DISPATCH_ATTEMPTS:
                    row.status = "exhausted"
                else:
                    row.available_at = now() + timedelta(seconds=retry_delay(row.attempts))
        db.commit()
    return dispatched


def ensure_group(client: Any) -> None:
    try:
        client.xgroup_create(JOB_STREAM, WORKER_GROUP, id="0", mkstream=True)
    except ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise


def _metadata(entry_id: str, fields: dict[str, str], failure_code: str) -> dict[str, str]:
    result = {"sourceStreamId": entry_id, "failureCode": failure_code[:80]}
    for key in ("outboxId", "jobId"):
        value = fields.get(key, "")
        try:
            result[key] = str(uuid.UUID(value))
        except (ValueError, TypeError, AttributeError):
            pass
    return result


def _dead_letter_and_ack(
    client: Any, entry_id: str, fields: dict[str, str], failure_code: str
) -> None:
    client.xadd(DEAD_LETTER_STREAM, _metadata(entry_id, fields, failure_code))
    client.xack(JOB_STREAM, WORKER_GROUP, entry_id)


def admit_entry(
    factory: sessionmaker[Session], client: Any, entry_id: str, fields: dict[str, str]
) -> bool:
    try:
        outbox_id = fields["outboxId"]
        payload_json = fields["payload"]
        payload = validate_job(json.loads(payload_json))
        payload_digest = hashlib.sha256(canonical_json(payload)).hexdigest()
        if (
            payload_digest != fields["payloadDigest"]
            or payload_digest == ""
            or str(payload["jobId"]) != fields["jobId"]
            or str(payload["idempotencyKey"]) != fields["idempotencyKey"]
        ):
            raise ValueError("runner_stream_integrity_mismatch")
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        candidate = exc.args[0] if isinstance(exc, ValueError) and exc.args else ""
        safe_code = (
            candidate
            if isinstance(candidate, str) and re.fullmatch(r"[a-z0-9_]{1,80}", candidate)
            else "runner_envelope_invalid"
        )
        _dead_letter_and_ack(client, entry_id, fields, safe_code)
        return False

    with factory() as db:
        outbox = db.get(OutboxMessage, outbox_id)
        if (
            outbox is None
            or outbox.topic != "runner.job_requested"
            or outbox.payload_digest != payload_digest
            or canonical_json(outbox.payload) != canonical_json(payload)
        ):
            _dead_letter_and_ack(client, entry_id, fields, "runner_outbox_verification_failed")
            return False
        existing = db.get(RunnerJobReceipt, str(payload["jobId"]))
        receipt = RunnerJobReceipt(
            job_id=str(payload["jobId"]),
            outbox_id=outbox.id,
            idempotency_key=str(payload["idempotencyKey"]),
            payload_digest=payload_digest,
        )
        if existing is not None:
            if (
                existing.outbox_id != receipt.outbox_id
                or existing.idempotency_key != receipt.idempotency_key
                or existing.payload_digest != receipt.payload_digest
            ):
                _dead_letter_and_ack(client, entry_id, fields, "runner_job_identity_conflict")
                return False
        else:
            db.add(receipt)
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                committed = db.get(RunnerJobReceipt, receipt.job_id, populate_existing=True)
                if (
                    committed is None
                    or committed.outbox_id != receipt.outbox_id
                    or committed.idempotency_key != receipt.idempotency_key
                    or committed.payload_digest != receipt.payload_digest
                ):
                    _dead_letter_and_ack(client, entry_id, fields, "runner_job_identity_conflict")
                    return False
        client.xack(JOB_STREAM, WORKER_GROUP, entry_id)
        return True


def consume_once(
    factory: sessionmaker[Session], client: Any, consumer: str, count: int = MAX_BATCH
) -> int:
    ensure_group(client)
    processed = 0
    _next, claimed, _deleted = client.xautoclaim(
        JOB_STREAM,
        WORKER_GROUP,
        consumer,
        min_idle_time=CLAIM_IDLE_MS,
        start_id="0-0",
        count=min(count, MAX_BATCH),
    )
    entries = list(claimed or [])
    for entry_id, fields in entries:
        processed += int(admit_entry(factory, client, str(entry_id), fields))
    new_entries = (
        client.xreadgroup(
            WORKER_GROUP,
            consumer,
            {JOB_STREAM: ">"},
            count=min(max(count - len(entries), 0), MAX_BATCH),
            block=1,
        )
        if count > len(entries)
        else []
    )
    for _stream, batch in new_entries or []:
        for entry_id, fields in batch:
            processed += int(admit_entry(factory, client, str(entry_id), fields))
    return processed


def record_result(db: Session, result_value: object) -> RunnerJobResult:
    result = validate_result(result_value)
    job_id = str(result["jobId"])
    if db.get(RunnerJobReceipt, job_id) is None:
        raise ValueError("runner_job_unknown")
    digest = hashlib.sha256(canonical_json(result)).hexdigest()
    existing = db.get(RunnerJobResult, job_id)
    if existing is not None:
        if existing.result_digest != digest:
            raise ValueError("runner_result_conflict")
        return existing
    item = RunnerJobResult(job_id=job_id, result=result, result_digest=digest)
    db.add(item)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        committed = db.get(RunnerJobResult, job_id, populate_existing=True)
        if committed is None or committed.result_digest != digest:
            raise ValueError("runner_result_conflict") from None
        return committed
    return item


def queue_snapshot(db: Session, client: Any) -> dict[str, int | None]:
    length = int(client.xlen(JOB_STREAM))
    dead_letter_length = int(client.xlen(DEAD_LETTER_STREAM))
    try:
        groups = client.xinfo_groups(JOB_STREAM)
    except ResponseError as exc:
        if "no such key" in str(exc).lower() or "nogroup" in str(exc).lower():
            groups = []
        else:
            raise
    group = next((item for item in groups if item.get("name") == WORKER_GROUP), None)
    pending = int(group.get("pending", 0)) if group else 0
    lag = int(group["lag"]) if group and group.get("lag") is not None else None
    consumers = int(group.get("consumers", 0)) if group else 0
    current = datetime.now(UTC)
    pending_count = int(
        db.scalar(
            select(func.count())
            .select_from(OutboxMessage)
            .where(OutboxMessage.topic == "runner.job_requested", OutboxMessage.status == "pending")
        )
        or 0
    )
    exhausted_count = int(
        db.scalar(
            select(func.count())
            .select_from(OutboxMessage)
            .where(
                OutboxMessage.topic == "runner.job_requested", OutboxMessage.status == "exhausted"
            )
        )
        or 0
    )
    oldest_pending = db.scalar(
        select(func.min(OutboxMessage.created_at)).where(
            OutboxMessage.topic == "runner.job_requested", OutboxMessage.status == "pending"
        )
    )
    oldest_exhausted = db.scalar(
        select(func.min(OutboxMessage.created_at)).where(
            OutboxMessage.topic == "runner.job_requested", OutboxMessage.status == "exhausted"
        )
    )

    def age(value: datetime | None) -> int | None:
        if value is None:
            return None
        instant = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
        return max(0, int((current - instant).total_seconds()))

    return {
        "streamLength": length,
        "pending": pending,
        "lag": lag,
        "consumerCount": consumers,
        "deadLetterLength": dead_letter_length,
        "outboxPending": pending_count,
        "outboxExhausted": exhausted_count,
        "oldestPendingAgeSeconds": age(oldest_pending),
        "oldestExhaustedAgeSeconds": age(oldest_exhausted),
    }


def consumer_loop(
    factory: sessionmaker[Session], client: Any, consumer: str, once: bool = False
) -> None:
    delay = 1
    while True:
        try:
            consume_once(factory, client, consumer)
            delay = 1
        except (RedisError, OSError):
            time.sleep(delay)
            delay = min(delay * 2, 30)
        if once:
            return
