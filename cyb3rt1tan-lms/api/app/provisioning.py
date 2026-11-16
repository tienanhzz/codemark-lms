"""Bounded enrollment CSV validation and shared enrollment write metadata."""

import csv
import io
import unicodedata
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .identity_dto import username_value
from .models import Course, CourseMembership, Faculty, User, now

USER_HEADERS = {"username", "email", "official_name", "institutional_id", "role"}
ENROLLMENT_HEADERS = {"institutional_id", "username", "course_id", "section_id", "status"}


def read_csv(raw: bytes, headers: set[str]) -> list[dict[str, str]]:
    try:
        reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig"), newline=""), strict=True)
        if (
            reader.fieldnames is None
            or len(reader.fieldnames) != len(headers)
            or set(reader.fieldnames) != headers
        ):
            raise HTTPException(422, "csv_header_invalid")
        rows = []
        for row in reader:
            rows.append(row)
            if len(rows) > 500:
                raise HTTPException(413, "csv_too_many_rows")
    except (UnicodeDecodeError, csv.Error):
        raise HTTPException(422, "csv_invalid") from None
    if not rows:
        raise HTTPException(422, "csv_empty")
    return rows


def valid_columns(row: dict[str, str]) -> None:
    if None in row or any(
        value is None
        or not isinstance(value, str)
        or any(unicodedata.category(char) in {"Cc", "Cf", "Cs"} for char in value)
        for value in row.values()
    ):
        raise ValueError("Invalid CSV values")


def enrollment_context(
    db: Session, course_id: str, section: str, user: User | None
) -> tuple[Course, CourseMembership | None]:
    if len(section) > 128:
        raise ValueError("Invalid section")
    course = db.get(Course, str(UUID(course_id)))
    if course is None or course.status not in {"draft", "active"}:
        raise ValueError("Course unavailable")
    item = db.get(CourseMembership, (course.id, user.id)) if user else None
    return course, item


def extras(
    db: Session, row: dict[str, str], user: User | None, roles: list[str]
) -> tuple[dict[str, object], dict[str, object]]:
    faculty_id, course_id, section = (
        row[field].strip() for field in ["faculty_id", "course_id", "section_id"]
    )
    faculty = db.get(Faculty, faculty_id) if faculty_id else None
    if faculty_id and (faculty is None or faculty.status != "active"):
        raise ValueError("Faculty unavailable")
    if section and not course_id:
        raise ValueError("Course required")
    course, item = None, None
    if course_id:
        if "student" not in roles:
            raise ValueError("Student role required for enrollment")
        course, item = enrollment_context(db, course_id, section, user)
    return {
        "faculty_id": faculty_id or None,
        "course_id": course.id if course else None,
        "section_id": section or None,
    }, {
        "facultyId": faculty_id or None,
        "courseId": course.id if course else None,
        "courseRevision": course.revision if course else None,
        "membershipRevision": item.revision if item else None,
    }


def analyze_enrollments(
    db: Session, raw: bytes, policy: str
) -> tuple[
    list[dict[str, object]], list[dict[str, object]], list[dict[str, object]], dict[str, int]
]:
    rows = read_csv(raw, ENROLLMENT_HEADERS)
    values: list[dict[str, object]] = []
    outcomes: list[dict[str, object]] = []
    snapshots: list[dict[str, object]] = []
    counts = {"totalRows": len(rows), "create": 0, "update": 0, "skip": 0, "reject": 0}
    seen = set()
    for number, row in enumerate(rows, 2):
        user, course, item = None, None, None
        errors = []
        data: dict[str, object] = {}
        try:
            valid_columns(row)
            identity, username = row["institutional_id"].strip(), row["username"].strip()
            if len(identity) > 128 or not (identity or username):
                raise ValueError("Identity required")
            by_id = (
                db.scalar(select(User).where(User.institutional_id == identity))
                if identity
                else None
            )
            by_name = (
                db.scalar(select(User).where(User.username == username_value(username)))
                if username
                else None
            )
            user = by_id or by_name
            if (by_id and by_name and by_id.id != by_name.id) or (
                by_name and not by_id and identity and by_name.institutional_id != identity
            ):
                errors.append("identity_conflict")
            if user is None:
                errors.append("account_not_found")
            elif user.status not in {"active", "invited"} or "student" not in user.roles:
                errors.append("ineligible_student")
            status, section = row["status"].strip(), row["section_id"].strip()
            if status not in {"active", "invited", "withdrawn", "completed"}:
                raise ValueError("Invalid enrollment status")
            if status == "active" and user and user.status != "active":
                errors.append("account_inactive")
            course, item = enrollment_context(db, row["course_id"].strip(), section, user)
            if user:
                key = (course.id, user.id)
                if key in seen:
                    errors.append("duplicate_in_file")
                seen.add(key)
            data = {"course_id": course.id, "section_id": section or None, "status": status}
        except (ValueError, TypeError, KeyError):
            errors.append("invalid_enrollment")
        action = (
            "reject"
            if errors
            else "create"
            if item is None
            else "skip"
            if policy == "skip"
            else "update"
        )
        counts[action] += 1
        values.append(data)
        outcomes.append({"rowNumber": number, "action": action, "errorCodes": sorted(set(errors))})
        snapshots.append(
            {
                "userId": user.id if user else None,
                "revision": user.revision if user else None,
                "courseId": course.id if course else None,
                "courseRevision": course.revision if course else None,
                "membershipRevision": item.revision if item else None,
                "action": action,
            }
        )
    return values, outcomes, snapshots, counts


def write_enrollment(
    db: Session, course: Course, user: User, status: str, section: str | None, source: str
) -> None:
    item = db.get(CourseMembership, (course.id, user.id))
    created = item is None
    if item is None:
        item = CourseMembership(course_id=course.id, user_id=user.id, status=status)
        db.add(item)
    if status in {"active", "invited"}:
        if created or item.status not in {"active", "invited"}:
            item.joined_at = now()
        item.ended_at = None
    elif created or item.status != status:
        item.ended_at = now()
    item.status, item.section_id, item.source = status, section, source
    course.revision += 1
