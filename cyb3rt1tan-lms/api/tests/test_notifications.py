"""Notification preference, sender, recipient, acknowledgement and idempotency lifecycle."""

from sqlalchemy import select
from test_access import login
from test_courses import setup_course

from app.models import CourseMembership, Notification, NotificationRecipient


def test_system_critical_notice_is_scoped_idempotent_and_acknowledged(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    student_headers = login(student, "student")
    assert admin.get("/v1/me/notification-preferences").json() == {
        "emailNonessential": True,
        "inApp": True,
        "locale": "en",
    }
    saved = student.put(
        "/v1/me/notification-preferences",
        headers=student_headers,
        json={"emailNonessential": False, "inApp": True, "locale": "vi"},
    )
    assert saved.status_code == 200 and saved.json()["locale"] == "vi"
    assert (
        student.put(
            "/v1/me/notification-preferences",
            headers=student_headers,
            json={"emailNonessential": False, "inApp": False, "locale": "vi"},
        ).status_code
        == 422
    )

    template = admin.post(
        "/v1/admin/notification-templates",
        headers=admin_headers,
        json={
            "templateId": "security-maintenance",
            "version": 1,
            "eventKey": "security.maintenance",
            "locale": "en",
            "mandatory": False,
            "channels": ["email"],
            "subject": "Security maintenance",
            "body": "A scheduled security update is in progress.",
        },
    )
    assert template.status_code == 201, template.text
    assert (
        admin.post(
            "/v1/admin/notification-templates",
            headers=admin_headers,
            json={key: value for key, value in template.json().items() if key != "createdAt"},
        ).status_code
        == 409
    )

    headers = admin_headers | {"Idempotency-Key": "critical-notice-001"}
    body = {
        "eventKey": "security.maintenance",
        "audience": {"scope": "system"},
        "severity": "critical",
        "templateId": "security-maintenance",
    }
    sent = admin.post("/v1/admin/notifications", headers=headers, json=body)
    assert sent.status_code == 202, sent.text
    replay = admin.post("/v1/admin/notifications", headers=headers, json=body)
    assert replay.status_code == 202 and replay.json() == sent.json()
    conflict = admin.post(
        "/v1/admin/notifications", headers=headers, json=body | {"severity": "ordinary"}
    )
    assert conflict.status_code == 409

    feed = student.get("/v1/me/notifications?unreadOnly=true", headers=student_headers)
    assert feed.status_code == 200 and len(feed.json()["items"]) == 1
    notice = feed.json()["items"][0]
    assert notice["severity"] == "critical"
    assert notice["requireAcknowledgement"] is True
    assert "email" not in notice["channels"] and "inApp" in notice["channels"]
    assert (
        student.post(
            f"/v1/me/notifications/{notice['id']}/acknowledgements", headers=student_headers
        ).status_code
        == 204
    )
    assert (
        student.post(
            f"/v1/me/notifications/{notice['id']}/acknowledgements", headers=student_headers
        ).status_code
        == 204
    )
    assert (
        student.get("/v1/me/notifications?unreadOnly=true", headers=student_headers).json()["items"]
        == []
    )

    status = admin.get(
        f"/v1/notifications/{sent.json()['id']}/delivery-status", headers=admin_headers
    )
    assert status.status_code == 200
    assert status.json()["recipientCount"] == 2
    assert status.json()["acknowledgedCount"] == 1
    assert status.json()["emailQueued"] == 0
    assert status.json()["emailSuppressed"] == 0
    with factory() as db:
        rows = list(
            db.scalars(
                select(NotificationRecipient).where(
                    NotificationRecipient.notification_id == sent.json()["id"]
                )
            )
        )
        assert len(rows) == 2
        assert len({row.id for row in rows}) == 2
        assert db.get(Notification, sent.json()["id"]) is not None


def test_course_notice_targets_active_roster_and_uses_recipient_locale(clients):
    admin, student, factory = clients
    admin_headers, course, _course_draft = setup_course(admin)
    student_headers = login(student, "student")
    student_id = student.get("/v1/me", headers=student_headers).json()["id"]
    with factory.begin() as db:
        db.add(CourseMembership(course_id=course["id"], user_id=student_id, status="active"))
    student.put(
        "/v1/me/notification-preferences",
        headers=student_headers,
        json={"emailNonessential": False, "inApp": True, "locale": "vi"},
    )
    for language, subject, text in [
        ("en", "Course update", "The schedule changed."),
        ("vi", "Cáº­p nháº­t khÃ³a há»c", "Lá»‹ch há»c Ä‘Ã£ thay Ä‘á»•i."),
    ]:
        created = admin.post(
            "/v1/admin/notification-templates",
            headers=admin_headers,
            json={
                "templateId": "course-update",
                "version": 1,
                "eventKey": "course.schedule_changed",
                "locale": language,
                "mandatory": False,
                "channels": ["inApp", "email"],
                "subject": subject,
                "body": text,
            },
        )
        assert created.status_code == 201, created.text
    payload = {
        "eventKey": "course.schedule_changed",
        "audience": {"scope": "course", "courseId": course["id"], "role": "student"},
        "severity": "ordinary",
        "templateId": "course-update",
        "requireAcknowledgement": False,
    }
    sent = admin.post(
        f"/v1/courses/{course['id']}/notifications",
        headers=admin_headers | {"Idempotency-Key": "course-update-001"},
        json=payload,
    )
    assert sent.status_code == 202 and sent.json()["recipientCount"] == 1
    feed = student.get("/v1/me/notifications", headers=student_headers).json()["items"]
    assert len(feed) == 1 and feed[0]["subject"] == "Cáº­p nháº­t khÃ³a há»c"
    status = admin.get(
        f"/v1/notifications/{sent.json()['id']}/delivery-status", headers=admin_headers
    ).json()
    assert status["recipientCount"] == 1 and status["emailSuppressed"] == 1
    assert (
        student.post(
            f"/v1/courses/{course['id']}/notifications",
            headers=student_headers | {"Idempotency-Key": "course-update-denied"},
            json=payload,
        ).status_code
        == 404
    )


def test_email_requested_without_approved_relay_fails_immediately(clients, monkeypatch):
    admin, _student, factory = clients
    for key in ("SMTP_APPROVED", "SMTP_HOST", "SMTP_FROM"):
        monkeypatch.delenv(key, raising=False)
    headers = login(admin)
    created = admin.post(
        "/v1/admin/notification-templates",
        headers=headers,
        json={
            "templateId": "local-relay-required",
            "version": 1,
            "eventKey": "system.announcement",
            "locale": "en",
            "mandatory": False,
            "channels": ["inApp", "email"],
            "subject": "Local announcement",
            "body": "This notice stays in app when relay setup is absent.",
        },
    )
    assert created.status_code == 201, created.text
    sent = admin.post(
        "/v1/admin/notifications",
        headers=headers | {"Idempotency-Key": "no-relay-notice-001"},
        json={
            "eventKey": "system.announcement",
            "audience": {"scope": "system"},
            "severity": "ordinary",
            "templateId": "local-relay-required",
        },
    )
    assert sent.status_code == 202, sent.text
    delivery = admin.get(
        f"/v1/notifications/{sent.json()['id']}/delivery-status", headers=headers
    ).json()
    assert delivery["emailFailed"] == 2
    assert delivery["emailQueued"] == 0
    with factory() as db:
        recipients = list(
            db.scalars(
                select(NotificationRecipient).where(
                    NotificationRecipient.notification_id == sent.json()["id"]
                )
            )
        )
        assert len(recipients) == 2
        assert {item.email_last_error for item in recipients} == {"smtp_not_configured"}
