"""Publish committed, metadata-only audit outbox invalidations through Socket.IO."""

import asyncio
import hashlib
import json
import logging
import uuid
from datetime import timedelta

from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from .database import SessionLocal
from .models import OutboxMessage, now
from .realtime import manager, sio

logger = logging.getLogger(__name__)
MAX_ATTEMPTS = 8
BATCH_SIZE = 50


def _invalidation_payload(row: OutboxMessage) -> dict[str, str] | None:
    payload = row.payload
    if row.topic != "audit.committed" or set(payload) != {"eventId", "action", "requestId"}:
        return None
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    if hashlib.sha256(serialized).hexdigest() != row.payload_digest:
        return None
    try:
        event_id = str(uuid.UUID(str(payload["eventId"])))
        uuid.UUID(str(payload["requestId"]))
    except (ValueError, TypeError):
        return None
    action = payload["action"]
    if not isinstance(action, str) or not action:
        return None
    return {"eventId": event_id, "eventType": "state.changed"}


async def dispatch_once() -> int:
    processed = 0
    with SessionLocal.begin() as db:
        rows = list(
            db.scalars(
                select(OutboxMessage)
                .where(
                    OutboxMessage.topic == "audit.committed",
                    OutboxMessage.status == "pending",
                    OutboxMessage.available_at <= now(),
                )
                .order_by(OutboxMessage.created_at, OutboxMessage.id)
                .limit(BATCH_SIZE)
                .with_for_update(skip_locked=True)
            )
        )
        for row in rows:
            payload = _invalidation_payload(row)
            if payload is None:
                row.status = "exhausted"
                processed += 1
                continue
            row.attempts += 1
            try:
                await sio.emit(
                    "state.changed",
                    payload,
                )
                if not manager.connected:
                    raise RuntimeError("Redis realtime transport is unavailable.")
            except (TimeoutError, RedisError, OSError, RuntimeError):
                if row.attempts >= MAX_ATTEMPTS:
                    row.status = "exhausted"
                else:
                    row.available_at = now() + timedelta(
                        seconds=min(3600, 30 * 2 ** (row.attempts - 1))
                    )
                logger.warning("Realtime outbox publish failed; retry scheduled.")
            else:
                row.status = "dispatched"
                row.dispatched_at = now()
            processed += 1
    return processed


async def dispatcher_loop() -> None:
    while True:
        try:
            processed = await dispatch_once()
        except SQLAlchemyError:
            logger.warning("Realtime outbox poll failed; retrying.")
            processed = 0
        await asyncio.sleep(1 if processed else 3)
