"""Admin-only, paginated immutable audit search and audited CSV export."""

import csv
import hashlib
import hmac
import io
import ipaddress
import os
import uuid
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import String, cast, select, tuple_

from .auth import DB, Admin, audit, lock_admin
from .models import AuditEvent
from .security import utc

router = APIRouter(prefix="/v1/admin/audit-events")
KEY = os.environ.get("LOGIN_HMAC_KEY", "").encode("utf-8")


def ip_digest(value: str) -> str:
    try:
        normalized = str(ipaddress.ip_address(value.strip()))
    except ValueError:
        raise HTTPException(422, "invalid_ip_address") from None
    return hmac.new(KEY, normalized.encode("utf-8"), hashlib.sha256).hexdigest()


def filtered(
    db: DB,
    *,
    actorId: UUID | None,
    action: str | None,
    courseId: UUID | None,
    query: str | None,
    ip: str | None,
    fromAt: datetime | None,
    toAt: datetime | None,
    cursor: UUID | None,
    pageSize: int,
) -> list[AuditEvent]:
    statement = select(AuditEvent)
    if actorId:
        statement = statement.where(AuditEvent.actor_id == str(actorId))
    if action:
        statement = statement.where(AuditEvent.action.ilike("%" + action.strip()[:80] + "%"))
    if courseId:
        statement = statement.where(
            cast(AuditEvent.detail, String).contains(str(courseId), autoescape=True)
        )
    if query:
        term = query.strip()[:128]
        statement = statement.where(
            cast(AuditEvent.detail, String).contains(term, autoescape=True)
            | AuditEvent.request_id.contains(term, autoescape=True)
            | AuditEvent.action.contains(term, autoescape=True)
        )
    if ip:
        statement = statement.where(AuditEvent.ip_digest == ip_digest(ip))
    if fromAt:
        if fromAt.tzinfo is None or fromAt.utcoffset() is None:
            raise HTTPException(422, "explicit_offset_required")
        statement = statement.where(AuditEvent.created_at >= utc(fromAt))
    if toAt:
        if toAt.tzinfo is None or toAt.utcoffset() is None:
            raise HTTPException(422, "explicit_offset_required")
        statement = statement.where(AuditEvent.created_at < utc(toAt))
    if fromAt and toAt and utc(fromAt) >= utc(toAt):
        raise HTTPException(422, "invalid_period")
    if cursor:
        point = db.get(AuditEvent, str(cursor))
        if point is None:
            raise HTTPException(422, "invalid_cursor")
        statement = statement.where(
            tuple_(AuditEvent.created_at, AuditEvent.id) < (point.created_at, point.id)
        )
    return list(
        db.scalars(
            statement.order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc()).limit(
                pageSize + 1
            )
        )
    )


def _view(item: AuditEvent, matched_ip: bool) -> dict[str, object]:
    return {
        "id": item.id,
        "actorId": item.actor_id,
        "action": item.action,
        "createdAt": utc(item.created_at).isoformat(),
        "requestId": item.request_id,
        "detail": item.detail,
        "ipMatched": matched_ip,
    }


@router.get("")
def list_events(
    request: Request,
    db: DB,
    user: Admin,
    actorId: UUID | None = None,
    action: str | None = Query(default=None, max_length=80),
    courseId: UUID | None = None,
    query: str | None = Query(default=None, max_length=128),
    ip: str | None = Query(default=None, max_length=64),
    fromAt: datetime | None = None,
    toAt: datetime | None = None,
    cursor: UUID | None = None,
    pageSize: int = Query(default=50, ge=1, le=100),
) -> dict[str, object]:
    lock_admin(db, request, user)
    rows = filtered(
        db,
        actorId=actorId,
        action=action,
        courseId=courseId,
        query=query,
        ip=ip,
        fromAt=fromAt,
        toAt=toAt,
        cursor=cursor,
        pageSize=pageSize,
    )
    return {
        "items": [_view(item, bool(ip)) for item in rows[:pageSize]],
        "nextCursor": rows[pageSize - 1].id if len(rows) > pageSize else None,
    }


class AuditExport(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    actorId: UUID | None = None
    action: str | None = Field(default=None, max_length=80)
    courseId: UUID | None = None
    query: str | None = Field(default=None, max_length=128)
    ip: str | None = Field(default=None, max_length=64)
    fromAt: datetime | None = None
    toAt: datetime | None = None
    reason: str = Field(min_length=5, max_length=500)


@router.post("/export")
def export_events(body: AuditExport, request: Request, db: DB, user: Admin) -> Response:
    lock_admin(db, request, user)
    rows = filtered(
        db,
        actorId=body.actorId,
        action=body.action,
        courseId=body.courseId,
        query=body.query,
        ip=body.ip,
        fromAt=body.fromAt,
        toAt=body.toAt,
        cursor=None,
        pageSize=10000,
    )
    if len(rows) > 10000:
        raise HTTPException(413, "audit_export_too_large")
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer)
    writer.writerow(
        ["event_id", "actor_id", "action", "created_at", "request_id", "detail", "ip_matched"]
    )
    for item in rows:
        writer.writerow(
            [
                item.id,
                item.actor_id or "",
                item.action,
                utc(item.created_at).isoformat(),
                item.request_id,
                str(item.detail),
                bool(body.ip),
            ]
        )
    audit(
        db,
        request,
        "audit_exported",
        user,
        {
            "rowCount": len(rows),
            "reason": body.reason,
            "courseId": str(body.courseId) if body.courseId else None,
        },
    )
    return Response(
        buffer.getvalue().encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="audit-events-{uuid.uuid4()}.csv"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
