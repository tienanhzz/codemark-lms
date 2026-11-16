"""Exercise a failed outbox publish followed by recovery through live Redis."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import queue
import secrets
import shutil
import subprocess
import sys
import threading
import uuid
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

import redis
from redis.exceptions import RedisError
from sqlalchemy import delete

from app import realtime_dispatch
from app.auth import ALLOWED_ORIGIN
from app.database import SessionLocal
from app.models import AuditEvent, OutboxMessage, User, UserSession, now
from app.realtime import REDIS_URL
from app.security import digest, dummy_hash


def _reader(stream: object, label: str, output: queue.Queue[tuple[str, str]]) -> None:
    for line in stream:  # type: ignore[attr-defined]
        output.put((label, line.rstrip("\r\n")))


def _next_message(
    messages: queue.Queue[tuple[str, str]], expected: str, timeout: float = 20
) -> str:
    while True:
        try:
            label, line = messages.get(timeout=timeout)
        except queue.Empty as exc:
            raise RuntimeError(f"Node acceptance client did not report {expected}.") from exc
        if label == "stderr":
            raise RuntimeError(f"Node acceptance client failed: {line}")
        if not line.startswith(expected):
            raise RuntimeError(f"Unexpected Node acceptance output: {line}")
        return line


def verify() -> None:
    redis_client = redis.Redis.from_url(REDIS_URL, socket_connect_timeout=2, socket_timeout=3)
    redis_client.ping()

    run_id = uuid.uuid4()
    event_id = str(uuid.uuid4())
    request_id = str(uuid.uuid4())
    user_ids = [str(uuid.uuid4()), str(uuid.uuid4())]
    tokens = [secrets.token_urlsafe(32), secrets.token_urlsafe(32)]
    outbox_id = str(uuid.uuid4())
    suffix = run_id.hex
    payload: dict[str, object] = {
        "eventId": event_id,
        "action": "realtime_retry_acceptance",
        "requestId": request_id,
    }
    payload_digest = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    base_time = now()

    with SessionLocal.begin() as db:
        db.add_all(
            [
                User(
                    id=user_ids[0],
                    username=f"rt_retry_{suffix}_a",
                    email=f"rt_retry_{suffix}_a@example.invalid",
                    official_name="Realtime Retry Acceptance A",
                    roles=["student"],
                    status="active",
                    password_hash=dummy_hash,
                ),
                User(
                    id=user_ids[1],
                    username=f"rt_retry_{suffix}_b",
                    email=f"rt_retry_{suffix}_b@example.invalid",
                    official_name="Realtime Retry Acceptance B",
                    roles=["student"],
                    status="active",
                    password_hash=dummy_hash,
                ),
            ]
        )
        db.flush()
        for user_id, token in zip(user_ids, tokens, strict=True):
            db.add(
                UserSession(
                    token_digest=digest(token),
                    user_id=user_id,
                    csrf_digest=digest(secrets.token_urlsafe(24)),
                    created_at=base_time,
                    expires_at=base_time + timedelta(minutes=5),
                    mfa_authenticated=True,
                )
            )

    node = shutil.which("node")
    if node is None:
        raise RuntimeError("Node.js is required to use the already-installed Socket.IO client.")
    workspace = Path(__file__).resolve().parents[1]
    env = os.environ.copy()
    env.update(
        REALTIME_TOKEN_A=tokens[0],
        REALTIME_TOKEN_B=tokens[1],
        REALTIME_EVENT_ID=event_id,
        REALTIME_ORIGIN=ALLOWED_ORIGIN,
        REALTIME_EXIT_ON_RECEIVE="true",
    )
    output: queue.Queue[tuple[str, str]] = queue.Queue()
    process = subprocess.Popen(
        [node, str(workspace / "scripts" / "verify-realtime-socket-clients.mjs")],
        cwd=workspace / "web",
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        env=env,
    )
    assert process.stdout is not None and process.stderr is not None
    threading.Thread(target=_reader, args=(process.stdout, "stdout", output), daemon=True).start()
    threading.Thread(target=_reader, args=(process.stderr, "stderr", output), daemon=True).start()

    try:
        _next_message(output, "CONNECTED")
        with SessionLocal.begin() as db:
            db.add(
                AuditEvent(
                    id=event_id,
                    actor_id=None,
                    action="realtime_retry_acceptance",
                    request_id=request_id,
                    detail={},
                )
            )
            db.add(
                OutboxMessage(
                    id=outbox_id,
                    audit_event_id=event_id,
                    idempotency_key=f"realtime-retry-acceptance-{run_id}",
                    topic="audit.committed",
                    payload=payload,
                    payload_digest=payload_digest,
                    status="pending",
                    attempts=0,
                    created_at=base_time,
                    available_at=base_time + timedelta(seconds=60),
                )
            )

        original_emit = realtime_dispatch.sio.emit
        fake_time = [base_time + timedelta(seconds=61)]
        realtime_dispatch.now = lambda: fake_time[0]
        emit_calls = 0

        async def fail_first_emit(*_args: object, **_kwargs: object) -> None:
            nonlocal emit_calls
            emit_calls += 1
            raise RedisError("controlled realtime acceptance failure")

        realtime_dispatch.sio.emit = fail_first_emit
        if asyncio.run(realtime_dispatch.dispatch_once()) != 1:
            raise RuntimeError("The failed publish did not process the outbox event.")
        with SessionLocal() as db:
            outbox = db.get(OutboxMessage, outbox_id)
            if (
                outbox is None
                or outbox.status != "pending"
                or outbox.attempts != 1
                or outbox.available_at <= base_time
            ):
                state = None if outbox is None else (outbox.status, outbox.attempts)
                raise RuntimeError(f"The failed publish did not schedule a retry: {state!r}.")

        realtime_dispatch.sio.emit = original_emit
        fake_time[0] = base_time + timedelta(seconds=92)
        if asyncio.run(realtime_dispatch.dispatch_once()) != 1:
            raise RuntimeError("The recovered publish did not process the outbox event.")

        received_line = _next_message(output, "RECEIVED ", timeout=20)
        result = json.loads(received_line.removeprefix("RECEIVED "))
        expected_payload = {"eventId": event_id, "eventType": "state.changed"}
        if result.get("payloads") != [expected_payload, expected_payload]:
            raise RuntimeError("The recovered event was not delivered to both instances.")
        if result.get("restStatuses") != [200, 200]:
            raise RuntimeError("Clients did not refetch recipient-scoped inbox data.")
        with SessionLocal() as db:
            outbox = db.get(OutboxMessage, outbox_id)
            if outbox is None or outbox.status != "dispatched" or outbox.attempts != 2:
                state = None if outbox is None else (outbox.status, outbox.attempts)
                raise RuntimeError(f"Outbox did not recover on the second attempt: {state!r}.")

        if process.wait(timeout=5) != 0:
            raise RuntimeError("The Node acceptance client exited unsuccessfully.")
        print(
            "PASS: controlled Redis publish failure left the outbox pending with "
            "one scheduled retry; restored Redis published through both API instances "
            "and marked the outbox dispatched on attempt two."
        )
    finally:
        realtime_dispatch.sio.emit = (
            original_emit if "original_emit" in locals() else realtime_dispatch.sio.emit
        )
        if process.poll() is None:
            try:
                process.terminate()
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        with SessionLocal.begin() as db:
            db.execute(delete(OutboxMessage).where(OutboxMessage.id == outbox_id))
            db.execute(
                delete(UserSession).where(UserSession.token_digest.in_([digest(x) for x in tokens]))
            )
            db.execute(delete(User).where(User.id.in_(user_ids)))
        redis_client.close()


if __name__ == "__main__":
    verify()
