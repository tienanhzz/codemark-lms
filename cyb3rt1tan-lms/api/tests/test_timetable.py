"""Weekly timetable uses real sessions and live course visibility."""

from datetime import datetime

import pytest
from test_access import login
from test_courses import setup_course, staff_user

from app.models import Course, CourseMembership, CourseStaff, TeachingSession

RANGE = {"fromAt": "2026-11-15T17:00:00Z", "toAt": "2026-11-22T17:00:00Z"}


def add_session(db, course_id, start="2026-11-16T01:00:00+00:00", end="2026-11-16T03:30:00+00:00", **values):
    item = TeachingSession(
        course_id=course_id,
        starts_at=datetime.fromisoformat(start),
        ends_at=datetime.fromisoformat(end),
        timezone="Asia/Bangkok",
        **values,
    )
    db.add(item)
    db.flush()
    return item.id


def test_timetable_requires_login(clients):
    _, student, _ = clients
    assert student.get("/v1/timetable", params=RANGE).status_code == 401


def test_timetable_returns_scheduled_visible_sessions_and_utc_instants(clients):
    admin, student, factory = clients
    _, course, _ = setup_course(admin)
    login(student, "student")
    student_id = student.get("/v1/me").json()["id"]
    with factory.begin() as db:
        current = db.get(Course, course["id"])
        current.status = "active"
        current.lesson_plan = [{"entryId": "week-1", "topic": "Arrays and loops"}]
        db.add(CourseMembership(course_id=course["id"], user_id=student_id, status="active"))
        scheduled = add_session(db, course["id"], plan_entry_id="week-1", room="A201")
        overlap = add_session(db, course["id"], "2026-11-15T16:30:00Z", "2026-11-15T17:30:00Z")
        add_session(db, course["id"], status="cancelled")
        add_session(db, course["id"], "2026-11-22T17:00:00Z", "2026-11-22T18:00:00Z")
        add_session(db, course["id"], "2026-11-15T16:00:00Z", "2026-11-15T17:00:00Z")
        hidden = Course(code="PRIVATE", title="Private course", term_id=course["termId"], timezone="UTC", owner_id=current.owner_id, status="active")
        db.add(hidden)
        db.flush()
        add_session(db, hidden.id)

    result = student.get("/v1/timetable", params=RANGE)
    assert result.status_code == 200, result.text
    assert [item["id"] for item in result.json()["items"]] == [overlap, scheduled]
    assert result.json()["items"][1] == {
        "id": scheduled,
        "courseId": course["id"],
        "courseCode": "CS101",
        "courseTitle": "Introduction",
        "title": "Arrays and loops",
        "startsAt": "2026-11-16T01:00:00+00:00",
        "endsAt": "2026-11-16T03:30:00+00:00",
        "room": "A201",
    }


@pytest.mark.parametrize("status,course_status,archived_from,expected", [
    ("active", "draft", None, False),
    ("withdrawn", "active", None, False),
    ("invited", "active", None, False),
    ("completed", "completed", None, True),
    ("active", "archived", "draft", False),
    ("completed", "archived", "active", True),
])
def test_timetable_rechecks_membership_and_course_state(clients, status, course_status, archived_from, expected):
    admin, student, factory = clients
    _, course, _ = setup_course(admin)
    login(student, "student")
    student_id = student.get("/v1/me").json()["id"]
    with factory.begin() as db:
        current = db.get(Course, course["id"])
        current.status, current.archived_from = course_status, archived_from
        db.add(CourseMembership(course_id=course["id"], user_id=student_id, status=status))
        add_session(db, course["id"])
    result = student.get("/v1/timetable", params=RANGE)
    assert result.status_code == 200
    assert bool(result.json()["items"]) is expected


def test_timetable_staff_access_is_live_and_course_scoped(clients):
    admin, staff, factory = clients
    _, course, _ = setup_course(admin)
    teacher_id = staff_user(factory, "teacher", "teacher")
    login(staff, "teacher")
    with factory.begin() as db:
        db.add(CourseStaff(course_id=course["id"], user_id=teacher_id, role="teacher", active=True))
        add_session(db, course["id"])
    assert len(staff.get("/v1/timetable", params=RANGE).json()["items"]) == 1
    with factory.begin() as db:
        db.get(CourseStaff, (course["id"], teacher_id)).active = False
    assert staff.get("/v1/timetable", params=RANGE).json()["items"] == []
    assert len(admin.get("/v1/timetable", params=RANGE).json()["items"]) == 1


@pytest.mark.parametrize("start,end", [
    ("2026-11-16T00:00:00", "2026-11-23T00:00:00Z"),
    ("2026-11-16T00:00:00Z", "2026-11-23T00:00:00"),
    ("2026-11-16T00:00:00Z", "2026-11-16T00:00:00Z"),
    ("2026-11-16T00:00:00Z", "2026-11-15T00:00:00Z"),
    ("2026-11-16T00:00:00Z", "2026-11-24T00:00:01Z"),
])
def test_timetable_rejects_unbounded_or_naive_ranges(clients, start, end):
    admin, _, _ = clients
    login(admin)
    assert admin.get("/v1/timetable", params={"fromAt": start, "toAt": end}).status_code == 422


def test_timetable_accepts_dst_week_with_explicit_offsets(clients):
    admin, _, _ = clients
    login(admin)
    response = admin.get("/v1/timetable", params={"fromAt": "2026-10-26T00:00:00-04:00", "toAt": "2026-11-02T00:00:00-05:00"})
    assert response.status_code == 200
    assert response.json() == {"items": []}
