"""Live course authorization: global roles never imply membership in another course."""

from datetime import UTC, datetime
from urllib.parse import urlsplit
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, Request, Response
from sqlalchemy import ColumnElement, or_, select, true
from sqlalchemy.orm import Session

from .auth import lock_identity
from .models import Course, CourseMembership, CoursePermission, CourseStaff, User, UserSession, now
from .security import utc

PERMISSIONS = frozenset(
    {
        "course.read",
        "course.rules.manage",
        "roster.read",
        "content.read",
        "content.author",
        "assessment.manage",
        "grading.manage",
        "attendance.read",
        "attendance.manage",
        "events.manage",
        "exam.monitor",
        "data.export",
    }
)
TA_DEFAULTS = frozenset({"course.read", "roster.read", "content.read", "attendance.read"})


def zone(value: str) -> ZoneInfo:
    try:
        return ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(422, "invalid_timezone") from None


def instant(value: datetime, timezone: str | None = None) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise HTTPException(422, "explicit_offset_required")
    if timezone and value.utcoffset() != value.astimezone(zone(timezone)).utcoffset():
        raise HTTPException(422, "timezone_offset_mismatch")
    return value.astimezone(UTC)


def period(start: datetime, end: datetime, timezone: str) -> tuple[datetime, datetime]:
    zone(timezone)
    first, last = instant(start, timezone), instant(end, timezone)
    if last <= first:
        raise HTTPException(422, "invalid_time_range")
    return first, last


def https_url(value: str | None) -> None:
    if value:
        parsed = urlsplit(value)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or any(ord(c) < 33 for c in value)
        ):
            raise HTTPException(422, "https_url_required")


def lock_actor(db: Session, request: Request, user: User) -> None:
    # Serialize with account-role/suspension and all course mutations; recheck after waiting.
    lock_identity(db)
    db.refresh(user)
    session = db.get(UserSession, request.state.session.token_digest, populate_existing=True)
    if not session or user.status != "active" or utc(session.expires_at) <= now():
        raise HTTPException(401, "authentication_required")
    if request.url.path.startswith("/v1/admin/") and "admin" not in user.roles:
        raise HTTPException(403, "forbidden")


def permissions(db: Session, course: Course, user: User) -> set[str]:
    if user.status != "active":
        return set()
    if "admin" in user.roles or (course.owner_id == user.id and "teacher" in user.roles):
        return {*PERMISSIONS, "course.manage", "enrollment.manage"}
    staff = db.get(CourseStaff, (course.id, user.id))
    if not staff or not staff.active or staff.role not in user.roles:
        return set()
    result = set(PERMISSIONS if staff.role == "teacher" else TA_DEFAULTS)
    grants = db.scalars(
        select(CoursePermission).where(
            CoursePermission.course_id == course.id,
            CoursePermission.user_id == user.id,
            CoursePermission.revoked_at.is_(None),
        )
    )
    for grant in grants:
        if utc(grant.starts_at) <= now() and (
            grant.expires_at is None or utc(grant.expires_at) > now()
        ):
            result.add(grant.key)
    return result


def visible(db: Session, course: Course, user: User) -> bool:
    if "course.read" in permissions(db, course, user):
        return True
    member = db.get(CourseMembership, (course.id, user.id))
    return "student" in user.roles and bool(
        member
        and member.status in {"active", "completed"}
        and course.status != "draft"
        and not (course.status == "archived" and course.archived_from == "draft")
    )


def visibility(user: User) -> ColumnElement[bool]:
    if "admin" in user.roles:
        return true()
    staff_ids = select(CourseStaff.course_id).where(
        CourseStaff.user_id == user.id,
        CourseStaff.active.is_(True),
        CourseStaff.role.in_(user.roles),
    )
    clauses: list[ColumnElement[bool]] = [Course.id.in_(staff_ids)]
    if "teacher" in user.roles:
        clauses.append(Course.owner_id == user.id)
    if "student" in user.roles:
        members = select(CourseMembership.course_id).where(
            CourseMembership.user_id == user.id,
            CourseMembership.status.in_(["active", "completed"]),
        )
        clauses.append(
            Course.id.in_(members)
            & (Course.status != "draft")
            & ~((Course.status == "archived") & (Course.archived_from == "draft"))
        )
    return or_(*clauses)


def course_for(
    db: Session, course_id: UUID, user: User, permission: str | None = None, write: bool = False
) -> Course:
    course = db.get(Course, str(course_id), populate_existing=True)
    if course is None or not visible(db, course, user):
        raise HTTPException(404, "course_not_found")
    if permission and permission not in permissions(db, course, user):
        raise HTTPException(403, "course_permission_required")
    if write and course.status in {"archived", "completed"}:
        raise HTTPException(409, "course_read_only")
    return course


def match(course: Course, request: Request) -> None:
    expected = request.headers.get("if-match")
    if expected is None:
        raise HTTPException(428, "course_revision_required")
    if expected != f'"{course.revision}"':
        raise HTTPException(409, "stale_course")


def course_json(
    db: Session, course: Course, user: User, response: Response | None = None
) -> dict[str, object]:
    if response is not None:
        response.headers["ETag"] = f'"{course.revision}"'
    return {
        "id": course.id,
        "courseCode": course.code,
        "title": course.title,
        "facultyId": course.faculty_id,
        "termId": course.term_id,
        "timezone": course.timezone,
        "module": course.module,
        "ownerId": course.owner_id,
        "status": course.status,
        "revision": course.revision,
        "permissions": sorted(permissions(db, course, user)),
    }


def touch(course: Course) -> None:
    course.revision += 1


def active_user(db: Session, user_id: UUID, role: str) -> User:
    target = db.get(User, str(user_id), populate_existing=True)
    if not target or target.status != "active" or role not in target.roles:
        raise HTTPException(422, "active_role_required")
    return target
