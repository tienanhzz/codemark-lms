"""Exercise authenticated Socket.IO invalidation across two local API instances.

This acceptance helper creates disposable student identities and sessions plus
one minimal immutable audit event/outbox row. It removes the disposable
identities, sessions, and outbox row after the run; the audit event is retained
because audit records are append-only. It requires the configured local
PostgreSQL database, Redis-compatible service, Node web dependencies, and API
instances on ports 8100 and 8101.
"""

from __future__ import annotations

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
from sqlalchemy import delete

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
    token_a = secrets.token_urlsafe(32)
    token_b = secrets.token_urlsafe(32)
    user_ids = [str(uuid.uuid4()), str(uuid.uuid4())]
    outbox_id = str(uuid.uuid4())
    suffix = run_id.hex
    payload: dict[str, object] = {
        "eventId": event_id,
        "action": "realtime_acceptance",
        "requestId": request_id,
    }
    payload_digest = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()

    with SessionLocal.begin() as db:
        db.add_all(
            [
                User(
                    id=user_ids[0],
                    username=f"rt_accept_{suffix}_a",
                    email=f"rt_accept_{suffix}_a@example.invalid",
                    official_name="Realtime Acceptance A",
                    roles=["student"],
                    status="active",
                    password_hash=dummy_hash,
                ),
                User(
                    id=user_ids[1],
                    username=f"rt_accept_{suffix}_b",
                    email=f"rt_accept_{suffix}_b@example.invalid",
                    official_name="Realtime Acceptance B",
                    roles=["student"],
                    status="active",
                    password_hash=dummy_hash,
                ),
            ]
        )
        db.flush()
        for user_id, token in zip(user_ids, (token_a, token_b), strict=True):
            db.add(
                UserSession(
                    token_digest=digest(token),
                    user_id=user_id,
                    csrf_digest=digest(secrets.token_urlsafe(24)),
                    created_at=now(),
                    expires_at=now() + timedelta(minutes=5),
                    mfa_authenticated=True,
                )
            )

    node = shutil.which("node")
    if node is None:
        raise RuntimeError("Node.js is required to use the already-installed Socket.IO client.")
    workspace = Path(__file__).resolve().parents[1]
    env = os.environ.copy()
    env.update(
        REALTIME_TOKEN_A=token_a,
        REALTIME_TOKEN_B=token_b,
        REALTIME_EVENT_ID=event_id,
        REALTIME_ORIGIN=ALLOWED_ORIGIN,
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
    assert process.stdin is not None and process.stdout is not None and process.stderr is not None
    threading.Thread(target=_reader, args=(process.stdout, "stdout", output), daemon=True).start()
    threading.Thread(target=_reader, args=(process.stderr, "stderr", output), daemon=True).start()

    try:
        _next_message(output, "CONNECTED")
        with SessionLocal.begin() as db:
            db.add(
                AuditEvent(
                    id=event_id,
                    actor_id=None,
                    action="realtime_acceptance",
                    request_id=request_id,
                    detail={},
                )
            )
            db.add(
                OutboxMessage(
                    id=outbox_id,
                    audit_event_id=event_id,
                    idempotency_key=f"realtime-acceptance-{run_id}",
                    topic="audit.committed",
                    payload=payload,
                    payload_digest=payload_digest,
                    status="pending",
                    attempts=0,
                    created_at=now(),
                    available_at=now(),
                )
            )

        received_line = _next_message(output, "RECEIVED ", timeout=20)
        result = json.loads(received_line.removeprefix("RECEIVED "))
        expected_payload = {"eventId": event_id, "eventType": "state.changed"}
        if result.get("payloads") != [expected_payload, expected_payload]:
            raise RuntimeError("The two instances did not receive the same minimal hint.")
        if result.get("restStatuses") != [200, 200]:
            raise RuntimeError("A client did not successfully refetch its own inbox.")

        with SessionLocal.begin() as db:
            outbox = db.get(OutboxMessage, outbox_id)
            if outbox is None or outbox.status != "dispatched" or outbox.attempts != 1:
                state = None if outbox is None else (outbox.status, outbox.attempts)
                raise RuntimeError(f"Outbox did not complete exactly once: {state!r}.")
            db.execute(delete(UserSession).where(UserSession.token_digest == digest(token_b)))

        process.stdin.write("REVOKE\n")
        process.stdin.flush()
        disconnect_line = _next_message(output, "DISCONNECTED ", timeout=40)
        disconnect = json.loads(disconnect_line.removeprefix("DISCONNECTED "))
        if not disconnect.get("unaffectedClientConnected"):
            raise RuntimeError("Revoking one session disconnected the other authenticated client.")
        if process.wait(timeout=5) != 0:
            raise RuntimeError("The Node acceptance client exited unsuccessfully.")

        print(
            "PASS: authenticated clients on ports 8100 and 8101 received the same "
            "minimal hint through Redis, refetched their own inbox, and only the "
            "revoked session disconnected; outbox dispatched once."
        )
    finally:
        if process.poll() is None:
            try:
                process.stdin.write("CLOSE\n")
                process.stdin.flush()
            except (BrokenPipeError, OSError):
                pass
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.terminate()
                process.wait(timeout=5)
        with SessionLocal.begin() as db:
            db.execute(delete(OutboxMessage).where(OutboxMessage.id == outbox_id))
            db.execute(
                delete(UserSession).where(
                    UserSession.token_digest.in_((digest(token_a), digest(token_b)))
                )
            )
            db.execute(delete(User).where(User.id.in_(user_ids)))
        redis_client.close()


if __name__ == "__main__":
    verify()
