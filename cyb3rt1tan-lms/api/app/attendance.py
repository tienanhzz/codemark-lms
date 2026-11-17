"""Course scoped attendance windows and auditable attendance decisions."""

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import DB, Principal, audit
from .course_access import course_for, instant, lock_actor, permissions
from .models import (
    AttendanceExcusal,
    AttendanceHistory,
    AttendanceRecord,
    AttendanceWindow,
    Course,
    CourseMembership,
    User,
    now,
)
from .security import utc

router = APIRouter(prefix="/v1")


class AttendanceInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=160)
    opensAt: datetime
    closesAt: datetime
    lateGraceMinutes: int = Field(default=0, ge=0, le=120)


class CheckIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=20, max_length=128)


class ExcusalInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    reason: str = Field(min_length=1, max_length=1000)


class DecisionInput(ExcusalInput):
    approved: bool


def _record(
    db: Session, window: AttendanceWindow, user_id: str, status: str, actor: str, reason: str = ""
) -> AttendanceRecord:
    record = db.scalar(
        select(AttendanceRecord).where(
            AttendanceRecord.window_id == window.id,
            AttendanceRecord.user_id == user_id,
        )
    )
    if record is None:
        record = AttendanceRecord(
            id=str(uuid.uuid4()),
            window_id=window.id,
            course_id=window.course_id,
            user_id=user_id,
            status=status,
        )
        db.add(record)
        db.flush()
    elif record.status != status:
        record.status = status
        db.flush()
    db.add(
        AttendanceHistory(
            id=str(uuid.uuid4()),
            record_id=record.id,
            revision=record.revision,
            status=status,
            reason=reason,
            actor_id=actor,
        )
    )
    db.flush()
    return record


def _window(
    db: Session, course_id: uuid.UUID, window_id: uuid.UUID, user: Principal
) -> tuple[Course, AttendanceWindow]:
    course = course_for(db, course_id, user)
    window = db.get(AttendanceWindow, str(window_id))
    if not window or window.course_id != course.id:
        raise HTTPException(404, "attendance_window_not_found")
    return course, window


@router.post("/courses/{course_id}/attendance/windows", status_code=201)
def create_window(
    course_id: uuid.UUID, body: AttendanceInput, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "attendance.manage")
    opens, closes = instant(body.opensAt, course.timezone), instant(body.closesAt, course.timezone)
    if closes <= opens or closes - opens > timedelta(days=2):
        raise HTTPException(422, "invalid_attendance_window")
    item = AttendanceWindow(
        id=str(uuid.uuid4()),
        course_id=course.id,
        title=body.title,
        opens_at=opens,
        closes_at=closes,
        late_grace_minutes=body.lateGraceMinutes,
        created_by=user.id,
    )
    db.add(item)
    audit(
        db, request, "attendance_window_created", user, {"courseId": course.id, "windowId": item.id}
    )
    return {
        "id": item.id,
        "title": item.title,
        "opensAt": opens.isoformat(),
        "closesAt": closes.isoformat(),
        "lateGraceMinutes": item.late_grace_minutes,
        "status": item.status,
    }


@router.get("/courses/{course_id}/attendance/windows")
def list_windows(course_id: uuid.UUID, db: DB, user: Principal) -> dict[str, object]:
    course = course_for(db, course_id, user)
    allowed = permissions(db, course, user)
    member = db.get(CourseMembership, (course.id, user.id))
    if "attendance.read" not in allowed and not (
        "student" in user.roles and member and member.status in {"active", "completed"}
    ):
        raise HTTPException(403, "attendance_read_required")
    rows = db.scalars(
        select(AttendanceWindow)
        .where(AttendanceWindow.course_id == course.id)
        .order_by(AttendanceWindow.opens_at.desc())
    )
    return {
        "items": [
            {
                "id": row.id,
                "title": row.title,
                "opensAt": row.opens_at.isoformat(),
                "closesAt": row.closes_at.isoformat(),
                "lateGraceMinutes": row.late_grace_minutes,
                "status": row.status,
            }
            for row in rows
        ]
    }


@router.post("/courses/{course_id}/attendance/windows/{window_id}/token", status_code=201)
def rotate_token(
    course_id: uuid.UUID, window_id: uuid.UUID, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    _course, window = _window(db, course_id, window_id, user)
    if "attendance.manage" not in permissions(db, _course, user):
        raise HTTPException(403, "attendance_manage_required")
    if window.status != "open" or now() >= utc(window.closes_at):
        raise HTTPException(409, "attendance_window_closed")
    token = secrets.token_urlsafe(32)
    window.token_digest = hashlib.sha256(token.encode()).hexdigest()
    window.token_expires_at = min(utc(window.closes_at), now() + timedelta(minutes=5))
    audit(
        db,
        request,
        "attendance_token_rotated",
        user,
        {"courseId": window.course_id, "windowId": window.id},
    )
    return {"token": token, "expiresAt": window.token_expires_at.isoformat()}


@router.post("/courses/{course_id}/attendance/windows/{window_id}/check-in", status_code=201)
def check_in(
    course_id: uuid.UUID,
    window_id: uuid.UUID,
    body: CheckIn,
    request: Request,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    course, window = _window(db, course_id, window_id, user)
    member = db.get(CourseMembership, (course.id, user.id))
    if "student" not in user.roles or not member or member.status != "active":
        raise HTTPException(403, "active_student_membership_required")
    current = now()
    if window.status != "open" or current < utc(window.opens_at) or current > utc(window.closes_at):
        raise HTTPException(409, "attendance_window_not_available")
    if (
        not window.token_digest
        or not window.token_expires_at
        or current > utc(window.token_expires_at)
        or not secrets.compare_digest(
            window.token_digest, hashlib.sha256(body.token.encode()).hexdigest()
        )
    ):
        raise HTTPException(422, "attendance_token_invalid")
    if db.scalar(
        select(AttendanceExcusal.id).where(
            AttendanceExcusal.window_id == window.id,
            AttendanceExcusal.user_id == user.id,
            AttendanceExcusal.status == "pending",
        )
    ):
        raise HTTPException(409, "excusal_pending")
    if db.scalar(
        select(AttendanceRecord.id).where(
            AttendanceRecord.window_id == window.id, AttendanceRecord.user_id == user.id
        )
    ):
        raise HTTPException(409, "attendance_already_recorded")
    status = (
        "late"
        if current > utc(window.opens_at) + timedelta(minutes=window.late_grace_minutes)
        else "present"
    )
    record = AttendanceRecord(
        id=str(uuid.uuid4()),
        window_id=window.id,
        course_id=course.id,
        user_id=user.id,
        status=status,
        checked_at=current,
    )
    db.add(record)
    db.flush()
    db.add(
        AttendanceHistory(
            id=str(uuid.uuid4()),
            record_id=record.id,
            revision=record.revision,
            status=status,
            reason="student_check_in",
            actor_id=user.id,
        )
    )
    audit(
        db,
        request,
        "attendance_checked_in",
        user,
        {"courseId": course.id, "windowId": window.id, "status": status},
    )
    from .missions import record_domain_event

    record_domain_event(db, request, user, "attendance.present", record.id)
    return {"status": record.status, "checkedAt": current.isoformat()}


@router.post("/courses/{course_id}/attendance/windows/{window_id}/close")
def close_window(
    course_id: uuid.UUID, window_id: uuid.UUID, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    course, window = _window(db, course_id, window_id, user)
    if "attendance.manage" not in permissions(db, course, user):
        raise HTTPException(403, "attendance_manage_required")
    if window.status == "closed":
        return {"status": "closed", "markedAbsent": 0}
    members = db.scalars(
        select(CourseMembership).where(
            CourseMembership.course_id == course.id, CourseMembership.status == "active"
        )
    )
    marked = 0
    for member in members:
        if not db.scalar(
            select(AttendanceRecord.id).where(
                AttendanceRecord.window_id == window.id, AttendanceRecord.user_id == member.user_id
            )
        ):
            _record(db, window, member.user_id, "absent", user.id, "window_closed")
            marked += 1
    window.status, window.closed_at, window.token_digest = "closed", now(), None
    audit(
        db,
        request,
        "attendance_window_closed",
        user,
        {"courseId": course.id, "windowId": window.id, "markedAbsent": marked},
    )
    return {"status": "closed", "markedAbsent": marked}


@router.get("/courses/{course_id}/attendance/windows/{window_id}/records")
def records(
    course_id: uuid.UUID, window_id: uuid.UUID, db: DB, user: Principal
) -> dict[str, object]:
    course, window = _window(db, course_id, window_id, user)
    staff_read = "attendance.read" in permissions(db, course, user)
    member = db.get(CourseMembership, (course.id, user.id))
    if not staff_read and not (
        "student" in user.roles and member and member.status in {"active", "completed"}
    ):
        raise HTTPException(403, "attendance_read_required")
    statement = (
        select(AttendanceRecord, User)
        .join(User, User.id == AttendanceRecord.user_id)
        .where(AttendanceRecord.window_id == window.id)
    )
    if not staff_read:
        statement = statement.where(AttendanceRecord.user_id == user.id)
    rows = db.execute(statement.order_by(User.official_name))
    return {
        "items": [
            {
                "recordId": record.id,
                "userId": learner.id,
                "officialName": learner.official_name,
                "status": record.status,
                "checkedAt": record.checked_at.isoformat() if record.checked_at else None,
                "revision": record.revision,
            }
            for record, learner in rows
        ]
    }


@router.post("/courses/{course_id}/attendance/windows/{window_id}/excusal", status_code=201)
def request_excusal(
    course_id: uuid.UUID,
    window_id: uuid.UUID,
    body: ExcusalInput,
    request: Request,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    course, window = _window(db, course_id, window_id, user)
    member = db.get(CourseMembership, (course.id, user.id))
    if "student" not in user.roles or not member or member.status != "active":
        raise HTTPException(403, "active_student_membership_required")
    current = now()
    if window.status != "open" or current > utc(window.closes_at):
        raise HTTPException(409, "excusal_not_available")
    record = db.scalar(
        select(AttendanceRecord).where(
            AttendanceRecord.window_id == window.id, AttendanceRecord.user_id == user.id
        )
    )
    if record and record.status not in {"absent", "late"}:
        raise HTTPException(409, "excusal_not_available")
    pending = db.scalar(
        select(AttendanceExcusal.id).where(
            AttendanceExcusal.window_id == window.id,
            AttendanceExcusal.user_id == user.id,
            AttendanceExcusal.status == "pending",
        )
    )
    if pending:
        raise HTTPException(409, "excusal_already_pending")
    item = AttendanceExcusal(
        id=str(uuid.uuid4()),
        record_id=record.id if record else None,
        window_id=window.id,
        user_id=user.id,
        reason=body.reason,
    )
    db.add(item)
    audit(
        db,
        request,
        "attendance_excusal_requested",
        user,
        {"courseId": course.id, "requestId": item.id},
    )
    return {"id": item.id, "status": item.status}


@router.get("/courses/{course_id}/attendance/excusals")
def list_excusals(course_id: uuid.UUID, db: DB, user: Principal) -> dict[str, object]:
    course = course_for(db, course_id, user)
    staff_read = "attendance.manage" in permissions(db, course, user)
    member = db.get(CourseMembership, (course.id, user.id))
    if not staff_read and not (
        "student" in user.roles and member and member.status in {"active", "completed"}
    ):
        raise HTTPException(403, "attendance_read_required")
    rows = db.execute(
        select(AttendanceExcusal, AttendanceWindow, User)
        .join(AttendanceWindow, AttendanceWindow.id == AttendanceExcusal.window_id)
        .join(User, User.id == AttendanceExcusal.user_id)
        .where(AttendanceWindow.course_id == course.id)
        .order_by(AttendanceExcusal.created_at.desc())
    )
    if not staff_read:
        rows = db.execute(
            select(AttendanceExcusal, AttendanceWindow, User)
            .join(AttendanceWindow, AttendanceWindow.id == AttendanceExcusal.window_id)
            .join(User, User.id == AttendanceExcusal.user_id)
            .where(AttendanceWindow.course_id == course.id, AttendanceExcusal.user_id == user.id)
            .order_by(AttendanceExcusal.created_at.desc())
        )
    return {
        "items": [
            {
                "id": item.id,
                "recordId": item.record_id,
                "windowId": window.id,
                "officialName": learner.official_name,
                "reason": item.reason,
                "status": item.status,
                "createdAt": item.created_at.isoformat(),
            }
            for item, window, learner in rows
        ]
    }


@router.post("/courses/{course_id}/attendance/excusals/{request_id}/decision")
def decide_excusal(
    course_id: uuid.UUID,
    request_id: uuid.UUID,
    body: DecisionInput,
    request: Request,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "attendance.manage")
    item = db.get(AttendanceExcusal, str(request_id))
    window = db.get(AttendanceWindow, item.window_id) if item else None
    if not item or not window or window.course_id != course.id:
        raise HTTPException(404, "excusal_not_found")
    if item.status != "pending":
        raise HTTPException(409, "excusal_already_decided")
    item.status = "approved" if body.approved else "denied"
    item.decision_reason, item.decided_by, item.decided_at = body.reason, user.id, now()
    if body.approved:
        record = db.get(AttendanceRecord, item.record_id) if item.record_id else None
        record = (
            _record(db, window, item.user_id, "excused", user.id, body.reason)
            if record is None or record.status != "excused"
            else record
        )
        item.record_id = record.id
    audit(
        db,
        request,
        "attendance_excusal_decided",
        user,
        {"courseId": course.id, "requestId": item.id, "decision": item.status},
    )
    return {"id": item.id, "status": item.status}


class RecordCorrection(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    status: str = Field(pattern="^(present|late|absent|excused)$")
    reason: str = Field(min_length=1, max_length=1000)


@router.put("/courses/{course_id}/attendance/records/{record_id}")
def correct_record(
    course_id: uuid.UUID,
    record_id: uuid.UUID,
    body: RecordCorrection,
    request: Request,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "attendance.manage")
    record = db.get(AttendanceRecord, str(record_id))
    if not record or record.course_id != course.id:
        raise HTTPException(404, "attendance_record_not_found")
    if record.status == body.status:
        raise HTTPException(409, "attendance_status_unchanged")
    record.status = body.status
    db.flush()
    db.add(
        AttendanceHistory(
            id=str(uuid.uuid4()),
            record_id=record.id,
            revision=record.revision,
            status=body.status,
            reason=body.reason,
            actor_id=user.id,
        )
    )
    audit(
        db,
        request,
        "attendance_record_corrected",
        user,
        {
            "courseId": course.id,
            "recordId": record.id,
            "status": body.status,
            "reason": body.reason,
            "revision": record.revision,
        },
    )
    return {"recordId": record.id, "status": record.status, "revision": record.revision}
