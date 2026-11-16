"""Payload-free Admin metrics for the dormant runner queue."""

from fastapi import APIRouter, HTTPException, Response
from redis.exceptions import RedisError

from .auth import DB, Admin
from .runner_queue import queue_snapshot, redis_client

router = APIRouter(prefix="/v1")


@router.get("/admin/runner-queue/outbox-metrics")
def runner_queue_metrics(db: DB, user: Admin, response: Response) -> dict[str, int | None]:
    del user
    try:
        client = redis_client()
    except ValueError as exc:
        raise HTTPException(503, "runner_queue_unavailable") from exc
    try:
        result = queue_snapshot(db, client)
    except RedisError as exc:
        raise HTTPException(503, "runner_queue_unavailable") from exc
    finally:
        client.close()
    response.headers["Cache-Control"] = "no-store"
    return result
