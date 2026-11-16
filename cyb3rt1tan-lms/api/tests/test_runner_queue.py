"""BUILD-028 dormant queue transport/admission; no source execution tests."""

import json
import uuid

import pytest
from redis.exceptions import RedisError, ResponseError
from sqlalchemy import select
from test_access import login

from app.models import AuditEvent, OutboxMessage, RunnerJobReceipt, RunnerJobResult
from app.outbox import enqueue_runner_job
from app.runner_contract import validate_job, validate_result
from app.runner_queue import (
    DEAD_LETTER_STREAM,
    JOB_STREAM,
    WORKER_GROUP,
    consume_once,
    dispatch_once,
    record_result,
    redis_url,
    retry_delay,
)


def job(job_id: str = "job-1") -> dict[str, object]:
    return {
        "jobId": job_id,
        "idempotencyKey": "attempt-1-question-v1" if job_id == "job-1" else "attempt-2-question-v1",
        "attemptId": "attempt-1",
        "questionVersionId": "question-v1",
        "profileId": "python-313",
        "profileVersion": 1,
        "sourceFiles": [{"relativePath": "Main.py", "content": "print('hi')"}],
        "testCaseSetId": "tests-v1",
        "limits": {"wallTimeMs": 1000, "cpuTimeMs": 1000, "memoryBytes": 1048576},
    }


class MemoryStreams:
    def __init__(self) -> None:
        self.streams: dict[str, list[tuple[str, dict[str, str]]]] = {}
        self.groups: set[str] = set()
        self.delivered: set[str] = set()
        self.pending: set[str] = set()
        self.sequence = 0

    def xadd(self, stream: str, fields: dict[str, str]) -> str:
        if getattr(self, "fail_xadd", False):
            raise RedisError("connection failed")
        self.sequence += 1
        entry_id = f"{self.sequence}-0"
        self.streams.setdefault(stream, []).append((entry_id, dict(fields)))
        return entry_id

    def xgroup_create(self, stream: str, group: str, **_kwargs: object) -> None:
        if group in self.groups:
            raise ResponseError("BUSYGROUP Consumer Group name already exists")
        self.groups.add(group)
        self.streams.setdefault(stream, [])

    def xautoclaim(self, *_args: object, **_kwargs: object) -> tuple[str, list[object], list[str]]:
        return "0-0", [], []

    def xreadgroup(self, _group: str, _consumer: str, streams: dict[str, str], **_kwargs: object) -> list[object]:
        stream = next(iter(streams))
        entries = []
        for entry_id, fields in self.streams.get(stream, []):
            if entry_id not in self.delivered:
                self.delivered.add(entry_id)
                self.pending.add(entry_id)
                entries.append((entry_id, dict(fields)))
        return [(stream, entries)] if entries else []

    def xack(self, _stream: str, _group: str, entry_id: str) -> int:
        self.pending.discard(entry_id)
        return 1

    def xlen(self, stream: str) -> int:
        return len(self.streams.get(stream, []))

    def xinfo_groups(self, _stream: str) -> list[dict[str, object]]:
        if WORKER_GROUP not in self.groups:
            return []
        return [{"name": WORKER_GROUP, "pending": len(self.pending), "lag": 0, "consumers": 1}]

    def close(self) -> None:
        return None


def test_runner_envelope_rejects_unsafe_paths_and_unbounded_file_sets():
    assert validate_job(job())["jobId"] == "job-1"
    for path in ("../escape.py", "C:/escape.py", ".env", "a\\b.py", "result.json"):
        invalid = job()
        invalid["sourceFiles"] = [{"relativePath": path, "content": "x"}]
        with pytest.raises(ValueError, match="runner_source_path_invalid"):
            validate_job(invalid)
    duplicate = job()
    duplicate["sourceFiles"] = [
        {"relativePath": "Main.py", "content": "x"},
        {"relativePath": "main.PY", "content": "y"},
    ]
    with pytest.raises(ValueError, match="runner_source_path_duplicate"):
        validate_job(duplicate)


def test_queue_url_requires_named_acl_and_tls_in_production():
    base = {"RUNNER_QUEUE_ENABLED": "true", "APP_ENV": "production"}
    with pytest.raises(ValueError, match="runner_redis_acl_required"):
        redis_url({**base, "RUNNER_REDIS_URL": "rediss://default:secret@redis.test/0"})
    with pytest.raises(ValueError, match="runner_redis_tls_required"):
        redis_url({**base, "RUNNER_REDIS_URL": "redis://worker:secret@redis.test/0"})
    assert redis_url({**base, "RUNNER_REDIS_URL": "rediss://queue_worker:secret@redis.test/0"}).startswith("rediss://")
    assert [retry_delay(value) for value in (0, 1, 2, 9)] == [1, 2, 4, 256]


def test_dispatch_admit_duplicate_and_result_are_idempotent(clients):
    _, _, factory = clients
    client = MemoryStreams()
    request_id = str(uuid.uuid4())
    with factory.begin() as db:
        message = enqueue_runner_job(db, request_id, "admin-id", job())
        outbox_id = message.id
    assert dispatch_once(factory, client) == 1
    assert client.streams[JOB_STREAM][0][1]["outboxId"] == outbox_id
    assert "print('hi')" in client.streams[JOB_STREAM][0][1]["payload"]

    assert consume_once(factory, client, "qa-consumer") == 1
    with factory() as db:
        receipt = db.get(RunnerJobReceipt, "job-1")
        outbox = db.get(OutboxMessage, outbox_id)
        event = db.scalar(select(AuditEvent).where(AuditEvent.action == "runner.job_requested"))
        assert receipt is not None and receipt.outbox_id == outbox_id
        assert outbox is not None and outbox.status == "dispatched"
        assert event is not None and "print('hi')" not in str(event.detail)

    duplicate = dict(client.streams[JOB_STREAM][0][1])
    client.xadd(JOB_STREAM, duplicate)
    assert consume_once(factory, client, "qa-consumer") == 1
    result = {
        "jobId": "job-1",
        "status": "completed",
        "finishedAt": "2026-11-15T10:00:00Z",
        "testResults": [{"testCaseId": "case-1", "passed": True, "awardedPoints": 1}],
    }
    assert validate_result(result)["jobId"] == "job-1"
    with factory.begin() as db:
        first = record_result(db, result)
        second = record_result(db, result)
        assert first.result_digest == second.result_digest
    with factory() as db:
        assert db.get(RunnerJobResult, "job-1") is not None
        conflicting = {**result, "status": "runtimeError"}
        with pytest.raises(ValueError, match="runner_result_conflict"):
            record_result(db, conflicting)


def test_dispatch_retries_redis_failures_and_exhausts_invalid_outbox(clients):
    _, _, factory = clients
    with factory.begin() as db:
        failed = enqueue_runner_job(db, str(uuid.uuid4()), None, job())
        invalid = enqueue_runner_job(db, str(uuid.uuid4()), None, job("job-2"))
        invalid.payload = {"source": "malformed"}
        invalid_id = invalid.id
    client = MemoryStreams()
    client.fail_xadd = True
    assert dispatch_once(factory, client) == 0
    with factory() as db:
        failed_row = db.get(OutboxMessage, failed.id)
        invalid_row = db.get(OutboxMessage, invalid_id)
        assert failed_row is not None and failed_row.status == "pending" and failed_row.attempts == 1
        assert invalid_row is not None and invalid_row.status == "exhausted" and invalid_row.attempts == 1


def test_invalid_stream_message_dead_letters_metadata_only(clients):
    _, _, factory = clients
    client = MemoryStreams()
    client.xgroup_create(JOB_STREAM, WORKER_GROUP, id="0", mkstream=True)
    fields = {
        "outboxId": str(uuid.uuid4()),
        "jobId": "job-unsafe-source-fragment",
        "idempotencyKey": "unsafe",
        "payloadDigest": "0" * 64,
        "payload": json.dumps({**job(), "privateSource": "never copy to dead letter"}),
    }
    client.xadd(JOB_STREAM, fields)
    assert consume_once(factory, client, "qa-consumer") == 0
    dead = client.streams[DEAD_LETTER_STREAM][0][1]
    assert "payload" not in dead and "privateSource" not in str(dead)
    assert "jobId" not in dead


def test_admin_queue_metrics_fail_closed_and_never_expose_payload(clients, monkeypatch):
    import app.runner_queue_routes as routes

    admin, student, _ = clients
    assert admin.get("/v1/admin/runner-queue/outbox-metrics").status_code == 401
    login(student, "student")
    assert student.get("/v1/admin/runner-queue/outbox-metrics").status_code == 403
    headers = login(admin, "admin")
    unavailable = admin.get("/v1/admin/runner-queue/outbox-metrics", headers=headers)
    assert unavailable.status_code == 503 and unavailable.json()["error"]["code"] == "runner_queue_unavailable"

    memory = MemoryStreams()
    monkeypatch.setattr(routes, "redis_client", lambda: memory)
    metrics = admin.get("/v1/admin/runner-queue/outbox-metrics", headers=headers)
    assert metrics.status_code == 200 and metrics.headers["cache-control"] == "no-store"
    assert metrics.json()["streamLength"] == 0
    assert "consumerCount" in metrics.json() and "payload" not in metrics.text
    assert not memory.groups
