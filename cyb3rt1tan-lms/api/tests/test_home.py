"""Public bulletin isolation, publication permissions and lifecycle."""

from sqlalchemy import select
from test_access import ORIGIN, login

from app.models import AuditEvent, Notification, User


def test_home_is_public_and_never_exposes_recipient_notifications(clients):
    admin, guest, factory = clients
    headers = login(admin)
    with factory.begin() as db:
        author = db.scalar(select(User).where(User.username == "admin"))
        author.nickname = "Public nickname"
        db.add(
            Notification(
                event_key="private.exam",
                template_id="private",
                severity="ordinary",
                mandatory=False,
                require_acknowledgement=False,
                channels=["inApp"],
                audience_scope="system",
                sender_id=author.id,
                idempotency_key="private-only-001",
                request_digest="a" * 64,
            )
        )
    empty = guest.get("/v1/home/announcements")
    assert empty.status_code == 200
    assert empty.json()["items"] == []
    created = admin.post(
        "/v1/home/announcements",
        headers=headers,
        json={"title": " Public update ", "body": " Everyone can read this. "},
    )
    assert created.status_code == 201, created.text
    public = guest.get("/v1/home/announcements").json()
    assert public["total"] == 1
    assert public["items"][0]["title"] == "Public update"
    assert public["items"][0]["authorName"] == "Public nickname"
    assert "email" not in public["items"][0]
    assert "officialName" not in public["items"][0]
    assert "private.exam" not in str(public)
    assert guest.get("/v1/home/announcements?page=0").status_code == 422
    assert guest.get("/v1/home/announcements?pageSize=101").status_code == 422
    with factory() as db:
        assert (
            db.scalar(select(AuditEvent).where(AuditEvent.action == "home_announcement_created"))
            is not None
        )


def test_only_teachers_and_admins_publish_and_teacher_owns_edits(clients):
    admin, student, factory = clients
    payload = {"title": "A class milestone", "body": "Public learning news"}
    assert student.post("/v1/home/announcements", headers=ORIGIN, json=payload).status_code == 401
    student_headers = login(student, "student")
    assert (
        student.post("/v1/home/announcements", headers=student_headers, json=payload).status_code
        == 403
    )
    admin_headers = login(admin)
    admin_post = admin.post("/v1/home/announcements", headers=admin_headers, json=payload).json()
    with factory.begin() as db:
        learner = db.scalar(select(User).where(User.username == "student"))
        learner.roles = ["teacher"]
    teacher_post = student.post("/v1/home/announcements", headers=student_headers, json=payload)
    assert teacher_post.status_code == 201, teacher_post.text
    path = f"/v1/home/announcements/{teacher_post.json()['id']}"
    assert (
        student.put(
            f"/v1/home/announcements/{admin_post['id']}", headers=student_headers, json=payload
        ).status_code
        == 403
    )
    updated = student.put(path, headers=student_headers, json=payload | {"title": "Revised"})
    assert updated.status_code == 200 and updated.json()["title"] == "Revised"
    assert student.put(path, headers=ORIGIN, json=payload).status_code == 403
    assert (
        student.post(
            "/v1/home/announcements", headers=student_headers, json=payload | {"title": " "}
        ).status_code
        == 422
    )
    assert admin.delete(path, headers=admin_headers).status_code == 204
    assert student.put(path, headers=student_headers, json=payload).status_code == 404


def test_public_bulletin_pagination_is_bounded_and_newest_first(clients):
    admin, guest, _ = clients
    headers = login(admin)
    for title in ["First", "Second", "Third"]:
        assert (
            admin.post(
                "/v1/home/announcements",
                headers=headers,
                json={"title": title, "body": "A public post"},
            ).status_code
            == 201
        )
    page = guest.get("/v1/home/announcements?pageSize=2").json()
    assert page["total"] == 3
    assert [item["title"] for item in page["items"]] == ["Third", "Second"]
    tail = guest.get("/v1/home/announcements?page=2&pageSize=2").json()
    assert [item["title"] for item in tail["items"]] == ["First"]
