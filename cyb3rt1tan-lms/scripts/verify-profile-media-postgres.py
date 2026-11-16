"""Guarded PostgreSQL private-profile/media checks; no main data or external mail."""

import io
import json
import os
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv
from PIL import Image, PngImagePlugin
from sqlalchemy import make_url, select

root = Path(__file__).resolve().parents[1]
load_dotenv(root / ".env")
target = os.environ["TEST_DATABASE_URL"]
if make_url(target).database != "codemark_lms_test" or target == os.environ["DATABASE_URL"]:
    raise SystemExit("Profile media integration requires codemark_lms_test.")
os.environ.update(DATABASE_URL=target, MIGRATION_DATABASE_URL=target, SMTP_APPROVED="false")
sys.path.insert(0, str(root / "api"))
from fastapi.testclient import TestClient
from app.database import SessionLocal
from app.main import app
from app.models import AcademicTerm, AuditEvent, Course, CourseMembership, CourseStaff, OutboxMessage, User, UserAvatar, UserProfile
from app.security import passwords

suffix = uuid.uuid4().hex[:8]
password = "Build01-test-workspace-only!"
origin = {"Origin": "http://127.0.0.1:3100"}
with SessionLocal.begin() as db:
    term = AcademicTerm(id="media-term-" + suffix, name="QA Media", starts_at=datetime(2026, 1, 1, tzinfo=UTC), ends_at=datetime(2026, 12, 31, tzinfo=UTC), timezone="UTC")
    db.add(term)
    people = []
    for role in ["teacher", "student", "administrativeAssistant"]:
        user = User(username="qa.media." + role.lower() + suffix, email=role.lower() + suffix + "@example.test", official_name="QA " + role, roles=[role], password_hash=passwords.hash(password))
        db.add(user); people.append(user)
    db.flush()
    teacher, student, assistant = people
    course = Course(code="QA-MEDIA-" + suffix, title="QA Media", term_id=term.id, owner_id=teacher.id, timezone="UTC", status="active")
    hidden = Course(code="QA-HIDDEN-" + suffix, title="Hidden course", term_id=term.id, owner_id=teacher.id, timezone="UTC", status="active")
    db.add_all([course, hidden]); db.flush()
    db.add(CourseStaff(course_id=course.id, user_id=teacher.id, role="teacher"))
    db.add(CourseMembership(course_id=course.id, user_id=student.id, status="active"))
    db.add(UserProfile(user_id=teacher.id, academic_title="Dr", phone="private-phone", contact_email="private@example.test", about="Private biography", show_email_in_courses=False))
    teacher_id, student_id, course_id, hidden_id = teacher.id, student.id, course.id, hidden.id
    names = [person.username for person in people]

buffer = io.BytesIO(); info = PngImagePlugin.PngInfo(); info.add_text("Comment", "Private camera metadata")
Image.new("RGB", (512, 512), "navy").save(buffer, format="PNG", pnginfo=info)
raw = buffer.getvalue()
with TestClient(app) as teacher_client, TestClient(app) as student_client, TestClient(app) as support:
    clients = [teacher_client, student_client, support]
    for client, name in zip(clients, names, strict=True):
        assert client.post("/v1/auth/login", headers=origin, json={"username": name, "password": password}).status_code == 200
    th = {**origin, "X-CSRF-Token": teacher_client.cookies["lms_csrf"]}
    ah = {**origin, "X-CSRF-Token": support.cookies["lms_csrf"]}
    endpoint = "/v1/profile-support/users/" + teacher_id
    accessed = support.post(endpoint + "/access", headers=ah, json={"reason": "Requested correction"})
    assert accessed.status_code == 200 and "roles" not in accessed.json()
    changed = support.patch(endpoint, headers=ah, json={"expectedRevision": accessed.json()["revision"], "reason": "Requested correction", "academicTitle": "Professor"})
    assert changed.status_code == 200
    assert support.patch(endpoint, headers=ah, json={"expectedRevision": changed.json()["revision"], "reason": "Denied consent override", "showEmailInCourses": True}).status_code == 422
    revision = teacher_client.get("/v1/me/profile").json()["revision"]
    image_headers = {**th, "Content-Type": "image/png", "If-Match": f'"{revision}"'}
    def upload(_):
        with TestClient(app) as concurrent:
            concurrent.cookies.update(teacher_client.cookies)
            response = concurrent.put("/v1/me/avatar", headers=image_headers, content=raw)
            return response.status_code
    with ThreadPoolExecutor(max_workers=2) as executor:
        statuses = sorted(executor.map(upload, range(2)))
    assert statuses == [200, 409], statuses
    personal = teacher_client.get("/v1/me/profile").json()
    image = teacher_client.get(personal["avatarUrl"])
    assert image.status_code == 200 and image.headers["cache-control"] == "no-store"
    assert b"Private camera metadata" not in image.content
    assert student_client.get(personal["avatarUrl"]).status_code == 404
    team_path = f"/v1/courses/{course_id}/teaching-team"
    team = student_client.get(team_path)
    assert team.status_code == 200 and hidden_id not in team.text
    assert all(value not in team.text for value in ["private@example.test", "private-phone", "Private biography"])
    profile = team.json()["items"][0]
    assert profile["academicTitle"] == "Professor" and profile["email"] is None
    assert student_client.get(profile["avatarUrl"]).status_code == 200
    assert teacher_client.patch("/v1/me/profile", headers=th, json={"expectedRevision": personal["revision"], "showEmailInCourses": True}).status_code == 200
    assert student_client.get(team_path).json()["items"][0]["email"] is not None
    with SessionLocal.begin() as db:
        db.get(CourseMembership, (course_id, student_id)).status = "withdrawn"
    assert student_client.get(profile["avatarUrl"]).status_code == 404
    latest = teacher_client.get("/v1/me/profile").json()
    assert teacher_client.delete("/v1/me/avatar", headers={**th, "If-Match": f'"{latest["revision"]}"'}).status_code == 200
    assert teacher_client.get(personal["avatarUrl"]).status_code == 404
    with SessionLocal() as db:
        assert db.get(UserAvatar, teacher_id) is None
        events = list(db.scalars(select(AuditEvent).where(AuditEvent.action.in_(["avatar_updated", "avatar_removed", "profile_support_viewed", "profile_support_updated"]))))
        assert len(events) >= 4
        assert all(db.scalar(select(OutboxMessage).where(OutboxMessage.audit_event_id == event.id)) for event in events)

report = {"checkedAt": datetime.now(UTC).isoformat(), "result": "pass", "database": "codemark_lms_test",
    "mainDatabaseMutations": False, "realSMTP": False, "concurrentAvatarStatuses": statuses,
    "supportAllowlistReasonRevision": True, "privateSanitizedPNG": True, "emailPrivacy": True,
    "coursePhotoReauthorization": True, "hiddenCoursesExcluded": True, "atomicAuditOutbox": True, "browserVisualQA": False}
(root / "docs/master-kit/BUILD-026-profile-media-validation.json").write_text(json.dumps(report, indent=2) + "\n", "utf-8")
print("PASS: PostgreSQL support allowlist/reason/revision, concurrent avatar update, metadata-free private PNG, course/email privacy, revoked image access and atomic audit/outbox. Main DB unchanged.")
