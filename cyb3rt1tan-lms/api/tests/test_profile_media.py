"""PII support allowlists, private normalized images and course-profile authorization."""

import io
import struct
import zlib

import pytest
from fastapi.testclient import TestClient
from PIL import Image, PngImagePlugin
from sqlalchemy import select
from test_access import login
from test_courses import setup_course, staff_user
from test_identity_contracts import validate

from app.main import app
from app.models import (
    AuditEvent,
    Course,
    CourseMembership,
    CourseStaff,
    OutboxMessage,
    User,
    UserAvatar,
    UserProfile,
)


def png(size=(512, 512), metadata=False, animated=False):
    buffer = io.BytesIO()
    image = Image.new("RGB", size, "navy")
    info = PngImagePlugin.PngInfo()
    if metadata:
        info.add_text("Comment", "Private camera metadata")
    image.save(
        buffer,
        format="PNG",
        pnginfo=info,
        save_all=animated,
        append_images=[Image.new("RGB", size, "gold")] if animated else [],
    )
    return buffer.getvalue()


def upload(client, headers, raw=None, revision=None):
    if revision is None:
        revision = client.get("/v1/me/profile").json()["revision"]
    return client.put(
        "/v1/me/avatar",
        headers={**headers, "Content-Type": "image/png", "If-Match": f'"{revision}"'},
        content=raw if raw is not None else png(),
    )


def test_support_requires_reason_and_forbids_identity_credentials_privacy_changes(clients):
    admin, student, factory = clients
    ah, sh = login(admin), login(student, "student")
    uid = student.get("/v1/me").json()["id"]
    assert student.get("/v1/profile-support/users").status_code == 403
    listing = admin.get("/v1/profile-support/users?query=student")
    validate("SupportPersonList", listing.json())
    assert listing.json()["items"][0]["id"] == uid
    assert "email" not in listing.text and "roles" not in listing.text
    endpoint = "/v1/profile-support/users/" + uid
    assert admin.post(endpoint + "/access", headers=ah, json={"reason": " "}).status_code == 422
    assert admin.post(endpoint + "/access", json={"reason": "Support request"}).status_code == 403
    response = admin.post(endpoint + "/access", headers=ah, json={"reason": "Support request"})
    validate("SupportProfile", response.json())
    body = {
        "expectedRevision": response.json()["revision"],
        "reason": "Update contact on request",
        "contactEmail": "private@example.test",
    }
    for key, value in [
        ("email", "new@example.test"),
        ("roles", ["admin"]),
        ("password", "forbidden"),
        ("nickname", "newname"),
        ("showEmailInCourses", True),
        ("status", "active"),
        ("officialName", "Changed"),
    ]:
        assert admin.patch(endpoint, headers=ah, json={**body, key: value}).status_code == 422
    assert student.patch(endpoint, headers=sh, json=body).status_code == 403
    response = admin.patch(endpoint, headers=ah, json=body)
    assert response.status_code == 200, response.text
    assert admin.patch(endpoint, headers=ah, json=body).status_code == 409
    with factory() as db:
        target = db.get(User, uid)
        assert target.email == "student@example.test" and target.roles == ["student"]
        assert not db.get(UserProfile, uid).show_email_in_courses
        events = list(
            db.scalars(select(AuditEvent).where(AuditEvent.action.like("profile_support_%")))
        )
        assert len(events) == 2
        assert all("private@example.test" not in str(event.detail) for event in events)
        assert all(
            db.scalar(select(OutboxMessage).where(OutboxMessage.audit_event_id == event.id))
            for event in events
        )


def test_assistant_support_fields_and_live_role_loss_and_suspended_target(clients):
    admin, assistant, factory = clients
    ah = login(admin)
    staff_user(factory, "support", "administrativeAssistant")
    sh = login(assistant, "support")
    user_id = next(
        item["id"]
        for item in admin.get("/v1/admin/users").json()["items"]
        if item["username"] == "student"
    )
    endpoint = "/v1/profile-support/users/" + user_id
    current = assistant.post(
        endpoint + "/access", headers=sh, json={"reason": "Support request"}
    ).json()
    body = {
        "expectedRevision": current["revision"],
        "reason": "Fix profile",
        "phone": "123",
        "about": "Private biography",
        "academicTitle": "Dr",
    }
    assert assistant.patch(endpoint, headers=sh, json=body).status_code == 200
    assert assistant.get("/v1/admin/users").status_code == 403
    assert (
        admin.post(
            "/v1/admin/users/" + user_id + "/suspensions", headers=ah, json={"reason": "Review"}
        ).status_code
        == 200
    )
    current = assistant.post(
        endpoint + "/access", headers=sh, json={"reason": "Review profile"}
    ).json()
    body["expectedRevision"] = current["revision"]
    assert (
        assistant.patch(endpoint, headers=sh, json=body).json()["error"]["code"]
        == "profile_support_read_only"
    )
    with factory.begin() as db:
        db.scalar(select(User).where(User.username == "support")).roles = ["student"]
    assert (
        assistant.post(endpoint + "/access", headers=sh, json={"reason": "Old access"}).status_code
        == 403
    )


def test_avatar_reencoding_private_access_revision_replacement_and_deletion(clients):
    admin, student, factory = clients
    ah, _sh = login(admin), login(student, "student")
    rev = admin.get("/v1/me/profile").json()["revision"]
    response = upload(admin, ah, png(metadata=True), rev)
    assert response.status_code == 200, response.text
    value = response.json()
    validate("PersonalProfile", value)
    url = value["avatarUrl"]
    image = admin.get(url)
    assert image.status_code == 200 and image.headers["cache-control"] == "no-store"
    assert image.headers["cross-origin-resource-policy"] == "same-origin"
    assert b"Private camera metadata" not in image.content
    with Image.open(io.BytesIO(image.content)) as decoded:
        assert decoded.size == (512, 512) and not decoded.info
    assert student.get(url).status_code == 404
    assert upload(admin, ah, revision=rev).status_code == 409
    response = upload(admin, ah)
    assert response.json()["avatarUrl"] != url and admin.get(url).status_code == 404
    rev = response.json()["revision"]
    assert admin.delete("/v1/me/avatar", headers=ah).status_code == 428
    response = admin.delete("/v1/me/avatar", headers={**ah, "If-Match": f'"{rev}"'})
    assert response.status_code == 200 and response.json()["avatarUrl"] is None
    with factory() as db:
        assert not list(db.scalars(select(UserAvatar)))
        event = db.scalar(select(AuditEvent).where(AuditEvent.action == "avatar_removed"))
        assert db.scalar(select(OutboxMessage).where(OutboxMessage.audit_event_id == event.id))


@pytest.mark.parametrize(
    "bad", ["svg", "wrong-size", "animated", "malformed", "bomb", "metadata", "too-large"]
)
def test_invalid_images_are_not_persisted(clients, bad):
    admin, _, factory = clients
    headers = login(admin)
    if bad == "svg":
        raw = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    elif bad == "wrong-size":
        raw = png((513, 512))
    elif bad == "animated":
        raw = png(animated=True)
    elif bad == "malformed":
        raw = b"\x89PNG\r\n\x1a\ninvalid"
    elif bad == "too-large":
        raw = b"x" * 1000001
    elif bad == "metadata":
        info = PngImagePlugin.PngInfo()
        info.add_text("large", "x" * 70000, zip=True)
        buffer = io.BytesIO()
        Image.new("RGB", (512, 512)).save(buffer, format="PNG", pnginfo=info)
        raw = buffer.getvalue()
    else:
        data = bytearray(png())
        data[16:24] = struct.pack(">II", 100000, 100000)
        data[29:33] = struct.pack(">I", zlib.crc32(data[12:29]))
        raw = bytes(data)
    assert upload(admin, headers, raw).status_code in {413, 415, 422}
    with factory() as db:
        assert not list(db.scalars(select(UserAvatar)))


def test_avatar_origin_csrf_and_mime_are_enforced(clients):
    admin, _, _ = clients
    headers = login(admin)
    assert (
        admin.put("/v1/me/avatar", content=png(), headers={"Content-Type": "image/png"}).status_code
        == 403
    )
    assert (
        admin.put(
            "/v1/me/avatar",
            content=png(),
            headers={"Origin": headers["Origin"], "Content-Type": "image/png"},
        ).status_code
        == 403
    )
    assert (
        admin.put(
            "/v1/me/avatar", content=png(), headers={**headers, "Content-Type": "image/jpeg"}
        ).status_code
        == 415
    )


def test_teaching_team_email_photo_and_cross_course_privacy(clients):
    admin, student, factory = clients
    _ah, course, _body = setup_course(admin)
    login(student, "student")
    teacher_id = staff_user(factory, "teacher", "teacher")
    student_id = student.get("/v1/me").json()["id"]
    with factory.begin() as db:
        first = db.get(Course, course["id"])
        first.status = "active"
        db.add(CourseStaff(course_id=first.id, user_id=teacher_id, role="teacher"))
        db.add(
            UserProfile(
                user_id=teacher_id,
                academic_title="Dr",
                contact_email="private@example.test",
                phone="private-phone",
                about="private biography",
                show_email_in_courses=False,
            )
        )
        hidden = Course(
            code="SECRET",
            title="Hidden course",
            owner_id=teacher_id,
            term_id=first.term_id,
            timezone="UTC",
            status="active",
        )
        db.add(hidden)
        db.flush()
        hidden_id = hidden.id
    path = "/v1/courses/" + course["id"] + "/teaching-team"
    assert student.get(path).status_code == 404
    with factory.begin() as db:
        db.add(CourseMembership(course_id=course["id"], user_id=student_id, status="active"))
    with TestClient(app) as teacher_client:
        th = login(teacher_client, "teacher")
        photo = upload(teacher_client, th).json()
        value = student.get(path)
        validate("CourseStaffProfiles", value.json())
        profile = value.json()["items"][0]
        assert profile["email"] is None and profile["academicTitle"] == "Dr"
        assert hidden_id not in value.text and "Hidden course" not in value.text
        assert all(
            private not in value.text
            for private in [
                "private@example.test",
                "private-phone",
                "private biography",
                "institutionalId",
            ]
        )
        assert student.get(profile["avatarUrl"]).status_code == 200
        assert student.get(photo["avatarUrl"]).status_code == 404
        revision = teacher_client.get("/v1/me/profile").json()["revision"]
        assert (
            teacher_client.patch(
                "/v1/me/profile",
                headers=th,
                json={"expectedRevision": revision, "showEmailInCourses": True},
            ).status_code
            == 200
        )
        assert student.get(path).json()["items"][0]["email"] == "teacher@example.test"
        with factory.begin() as db:
            db.get(CourseMembership, (course["id"], student_id)).status = "withdrawn"
        assert student.get(profile["avatarUrl"]).status_code == 404
        with factory.begin() as db:
            db.get(User, teacher_id).roles = ["student"]
        assert admin.get(path).json()["items"] == []
        assert admin.get(profile["avatarUrl"]).status_code == 404
