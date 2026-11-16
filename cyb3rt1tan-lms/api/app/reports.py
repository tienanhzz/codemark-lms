"""Short-lived, permission-rechecked student progress export jobs."""

import csv
import io
import uuid
from datetime import datetime, timedelta
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import String, cast, select

from .account_exports import csv_safe, xlsx_bytes
from .auth import DB, Principal, audit
from .course_access import course_for, lock_actor
from .learning_overview import _period, _student_course
from .models import Course, CourseMembership, ReportJob, User, now
from .security import utc

router = APIRouter(prefix="/v1/reports")
LIMIT = 10000
HEADERS = [
    "period_from", "period_to", "course_id", "course_code", "course_title", "student_id",
    "student_name", "membership_status", "attendance_availability", "attendance_eligible",
    "present", "late", "absent", "excused", "unrecorded", "attendance_rate_percent",
    "practice_attempts", "practice_unique_questions", "practice_passes", "practice_accuracy_percent",
    "lessons_available", "lessons_completed", "lesson_completion_percent",
    "assessments_assigned", "assessments_started", "assessments_submitted", "assessments_graded",
    "assessments_pending_grading", "assessments_missing_or_overdue", "last_activity_at",
]


class ReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    kind: Literal["studentProgress"]
    format: Literal["csv", "xlsx"]
    fromAt: datetime
    toAt: datetime
    courseId: UUID | None = None
    studentId: UUID | None = None
    reason: str = Field(min_length=5, max_length=500)


def _scopes(db: DB, actor: Principal, course_id: UUID | None, student_id: UUID | None) -> list[tuple[Course, User]]:
    is_student = "student" in actor.roles and not set(actor.roles) & {"admin", "teacher", "teachingAssistant"}
    if is_student:
        selected_student = str(student_id) if student_id else actor.id
        if selected_student != actor.id:
            raise HTTPException(404, "report_not_found")
        statement = select(Course, User).join(CourseMembership, CourseMembership.course_id == Course.id).join(User, User.id == CourseMembership.user_id).where(
            CourseMembership.user_id == actor.id,
            CourseMembership.status.in_(["active", "completed", "withdrawn"]),
        )
        if course_id:
            statement = statement.where(Course.id == str(course_id))
        rows = list(db.execute(statement.order_by(Course.code)))
        if not rows:
            raise HTTPException(404, "report_not_found")
        return [(course, learner) for course, learner in rows]
    if "admin" not in actor.roles and course_id is None:
        raise HTTPException(422, "course_required")
    if course_id:
        course = course_for(db, course_id, actor, "roster.read")
        statement = select(Course, User).join(CourseMembership, CourseMembership.course_id == Course.id).join(User, User.id == CourseMembership.user_id).where(
            Course.id == course.id, CourseMembership.status.in_(["active", "completed", "withdrawn"]), cast(User.roles, String).contains('"student"', autoescape=True),
        )
    else:
        statement = select(Course, User).join(CourseMembership, CourseMembership.course_id == Course.id).join(User, User.id == CourseMembership.user_id).where(
            CourseMembership.status.in_(["active", "completed", "withdrawn"]), cast(User.roles, String).contains('"student"', autoescape=True),
        )
    if student_id:
        statement = statement.where(User.id == str(student_id))
    rows = list(db.execute(statement.order_by(Course.code, User.official_name).limit(LIMIT + 1)))
    if len(rows) > LIMIT:
        raise HTTPException(413, "report_too_many_rows")
    return [(course, learner) for course, learner in rows]


def _flat(period: dict[str, str], course: Course, learner: User, summary: dict[str, object]) -> list[str]:
    attendance = summary["attendance"]
    practice = summary["practice"]
    assessments = summary["assessments"]
    lessons = summary["lessonProgress"]
    assert isinstance(attendance, dict) and isinstance(practice, dict) and isinstance(assessments, dict) and isinstance(lessons, dict)
    counts = attendance.get("counts", {})
    assert isinstance(counts, dict)
    values: list[object] = [
        period["fromAt"], period["toAt"], course.id, course.code, course.title, learner.id,
        learner.official_name, summary["membership"]["status"] if isinstance(summary["membership"], dict) else "",
        attendance.get("availability"), attendance.get("eligibleSessions"),
        *(counts.get(key) for key in ("present", "late", "absent", "excused", "unrecorded")),
        attendance.get("attendanceRate"), practice.get("totalAttempts"), practice.get("uniqueQuestions"),
        practice.get("passes"), practice.get("accuracy"),
        lessons.get("total"), lessons.get("completed"), lessons.get("completionRate"),
        assessments.get("assigned"), assessments.get("started"),
        assessments.get("submitted"), assessments.get("graded"), assessments.get("pendingGrading"),
        assessments.get("missingOrOverdue"), summary.get("lastActivityAt"),
    ]
    return ["" if value is None else str(value) for value in values]


def _build_rows(db: DB, actor: Principal, job: ReportJob) -> list[list[str]]:
    filters = job.filters
    course_id = UUID(str(filters["courseId"])) if filters.get("courseId") else None
    student_id = UUID(str(filters["studentId"])) if filters.get("studentId") else None
    start, end = _period(datetime.fromisoformat(str(filters["fromAt"])), datetime.fromisoformat(str(filters["toAt"])))
    scopes = _scopes(db, actor, course_id, student_id)
    rows = [HEADERS]
    for course, learner in scopes:
        # Recheck every included course after the job was created; revocation is immediate.
        if "student" not in actor.roles or set(actor.roles) & {"admin", "teacher", "teachingAssistant"}:
            course_for(db, UUID(course.id), actor, "roster.read")
        summary = _student_course(db, course, learner.id, start, end, actor, learner.id == actor.id and "student" in actor.roles)
        rows.append(_flat({"fromAt": start.isoformat(), "toAt": end.isoformat()}, course, learner, summary))
    return rows


@router.post("", status_code=201)
def create_report(body: ReportRequest, request: Request, db: DB, user: Principal) -> dict[str, object]:
    lock_actor(db, request, user)
    start, end = _period(body.fromAt, body.toAt)
    scopes = _scopes(db, user, body.courseId, body.studentId)
    job = ReportJob(
        id=str(uuid.uuid4()), actor_id=user.id, kind=body.kind, format=body.format,
        filters={"courseId": str(body.courseId) if body.courseId else None,
                 "studentId": str(body.studentId) if body.studentId else None,
                 "fromAt": start.isoformat(), "toAt": end.isoformat(),
                 "reason": body.reason},
        expires_at=now() + timedelta(minutes=15),
    )
    db.add(job)
    audit(db, request, "student_progress_report_created", user,
          {"reportId": job.id, "format": job.format, "rowCount": len(scopes), "courseId": str(body.courseId) if body.courseId else None, "reason": body.reason})
    return {"id": job.id, "kind": job.kind, "format": job.format, "rowCount": len(scopes), "expiresAt": job.expires_at.isoformat(), "downloadPath": f"/v1/reports/{job.id}/download"}


@router.get("")
def list_reports(db: DB, user: Principal) -> dict[str, object]:
    jobs = db.scalars(select(ReportJob).where(ReportJob.actor_id == user.id).order_by(ReportJob.created_at.desc()).limit(50))
    return {"items": [{"id": item.id, "kind": item.kind, "format": item.format, "createdAt": utc(item.created_at).isoformat(), "expiresAt": utc(item.expires_at).isoformat(), "downloadPath": f"/v1/reports/{item.id}/download"} for item in jobs]}


@router.get("/{report_id}/download")
def download_report(report_id: UUID, request: Request, db: DB, user: Principal) -> Response:
    lock_actor(db, request, user)
    job = db.get(ReportJob, str(report_id))
    if not job or job.actor_id != user.id:
        raise HTTPException(404, "report_not_found")
    if utc(job.expires_at) <= now():
        raise HTTPException(410, "report_expired")
    rows = _build_rows(db, user, job)
    if job.format == "csv":
        buffer = io.StringIO(newline="")
        csv.writer(buffer).writerows([[csv_safe(value) for value in row] for row in rows])
        content = buffer.getvalue().encode("utf-8-sig")
        media_type = "text/csv; charset=utf-8"
    else:
        content = xlsx_bytes(rows)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    audit(db, request, "student_progress_report_downloaded", user,
          {"reportId": job.id, "format": job.format, "rowCount": max(0, len(rows) - 1),
           "courseId": job.filters.get("courseId")})
    return Response(content, media_type=media_type,
                    headers={"Content-Disposition": f'attachment; filename="student-progress-{job.id}.{job.format}"',
                             "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})
