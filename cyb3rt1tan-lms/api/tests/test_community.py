"""Community moderation, privacy, course boundaries and trusted events."""

from fastapi.testclient import TestClient
from sqlalchemy import select
from test_access import login
from test_courses import setup_course, staff_user

from app.main import app
from app.models import Course, CourseMembership, User

TOPIC = {
    "title": "How should we approach this problem?",
    "body": "Please explain how to approach this learning problem with a clear example.",
}
ANSWER = {
    "body": "Start by identifying the inputs, then trace each step carefully and compare the result against a small worked example."
}


def test_student_pending_is_private_and_approval_publishes_once(clients, monkeypatch):
    admin, student, _factory = clients
    ah, sh = login(admin), login(student, "student")
    created = student.post("/v1/community/topics", headers=sh, json=TOPIC)
    assert created.status_code == 201, created.text
    topic = created.json()
    assert topic["status"] == "pending"
    assert student.get("/v1/community/topics").json()["total"] == 0
    assert student.get("/v1/community/topics?view=mine").json()["total"] == 1
    assert student.get("/v1/community/topics?view=queue").status_code == 403
    assert "email" not in str(topic)
    assert (
        student.post(
            f"/v1/community/posts/{topic['id']}/moderation",
            headers=sh,
            json={"decision": "approve"},
        ).status_code
        == 403
    )
    calls = []
    monkeypatch.setattr("app.community.record_quest_event", lambda *args: calls.append(args))
    path = f"/v1/community/posts/{topic['id']}/moderation"
    assert admin.post(path, headers=ah, json={"decision": "approve"}).status_code == 200
    assert admin.post(path, headers=ah, json={"decision": "approve"}).status_code == 200
    assert len(calls) == 1
    assert student.get("/v1/community/topics").json()["total"] == 1
    assert student.get("/v1/community/topics?page=0").status_code == 422


def test_teacher_requires_admin_and_cannot_self_approve(clients):
    admin, student, factory = clients
    ah, sh = login(admin), login(student, "student")
    with factory.begin() as db:
        db.scalar(select(User).where(User.username == "student")).roles = ["teacher"]
    topic = student.post("/v1/community/topics", headers=sh, json=TOPIC).json()
    assert topic["status"] == "pending"
    path = f"/v1/community/posts/{topic['id']}/moderation"
    assert student.post(path, headers=sh, json={"decision": "approve"}).status_code == 403
    assert (
        admin.post(
            path, headers=ah, json={"decision": "reject", "reason": "Please add context"}
        ).json()["status"]
        == "rejected"
    )
    assert student.get("/v1/community/topics").json()["total"] == 0
    assert (
        student.get(f"/v1/community/topics/{topic['id']}").json()["moderationReason"]
        == "Please add context"
    )


def test_replies_moderated_nested_and_best_answer_validated(clients, monkeypatch):
    admin, student, _factory = clients
    ah, sh = login(admin), login(student, "student")
    topic = admin.post("/v1/community/topics", headers=ah, json=TOPIC).json()
    answer = student.post(f"/v1/community/topics/{topic['id']}/answers", headers=sh, json=ANSWER)
    assert answer.status_code == 201, answer.text
    answer = answer.json()
    assert answer["status"] == "pending"
    assert admin.get(f"/v1/community/topics/{topic['id']}/answers").json()["total"] == 1
    assert student.get(f"/v1/community/topics/{topic['id']}/answers").json()["total"] == 1
    best = f"/v1/community/topics/{topic['id']}/best-answer"
    assert admin.put(best, headers=ah, json={"answerId": answer["id"]}).status_code == 409
    admin.post(
        f"/v1/community/posts/{answer['id']}/moderation", headers=ah, json={"decision": "approve"}
    )
    calls = []
    monkeypatch.setattr("app.community.record_quest_event", lambda *args: calls.append(args))
    assert admin.put(best, headers=ah, json={"answerId": answer["id"]}).status_code == 200
    assert admin.put(best, headers=ah, json={"answerId": answer["id"]}).status_code == 200
    assert len(calls) == 1
    other = admin.post(
        "/v1/community/topics", headers=ah, json=TOPIC | {"title": "Another topic"}
    ).json()
    assert (
        admin.put(
            f"/v1/community/topics/{other['id']}/best-answer",
            headers=ah,
            json={"answerId": answer["id"]},
        ).status_code
        == 422
    )
    assert student.put(best, headers=sh, json={"answerId": answer["id"]}).status_code == 403


def test_unrelated_users_cannot_read_pending_or_course_content(clients):
    admin, student, factory = clients
    ah, course, _ = setup_course(admin)
    sh = login(student, "student")
    assert (
        student.post(
            "/v1/community/topics", headers=sh, json=TOPIC | {"courseId": course["id"]}
        ).status_code
        == 404
    )
    private = admin.post(
        "/v1/community/topics", headers=ah, json=TOPIC | {"courseId": course["id"]}
    ).json()
    assert student.get(f"/v1/community/topics/{private['id']}").status_code == 404
    assert student.get("/v1/community/topics").json()["total"] == 0
    staff_user(factory, "other", "researchAssistant")
    topic = student.post("/v1/community/topics", headers=sh, json=TOPIC).json()
    with TestClient(app) as other:
        login(other, "other")
        assert other.get(f"/v1/community/topics/{topic['id']}").status_code == 404
        assert other.get("/v1/community/topics?view=mine").json()["total"] == 0
    assert (
        student.post("/v1/community/topics", headers=sh, json=TOPIC | {"body": "short"}).status_code
        == 422
    )


def test_support_staff_can_post_but_need_admin_review(clients):
    admin, student, factory = clients
    ah, sh = login(admin), login(student, "student")
    with factory.begin() as db:
        db.scalar(select(User).where(User.username == "student")).roles = ["teachingAssistant"]
    response = student.post("/v1/community/topics", headers=sh, json=TOPIC)
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "pending"
    assert response.json()["authorRole"] == "staff"
    assert (
        admin.post(
            f"/v1/community/posts/{response.json()['id']}/moderation",
            headers=ah,
            json={"decision": "approve"},
        ).json()["status"]
        == "published"
    )


def test_real_course_quest_credit_waits_for_approval_and_caps_daily(clients):
    from app.quest_catalog import install_catalog
    from app.quest_models import QuestCompletion

    admin, student, factory = clients
    ah, course, _ = setup_course(admin)
    sh = login(student, "student")
    with factory.begin() as db:
        install_catalog(db)
        learner = db.scalar(select(User).where(User.username == "student"))
        db.get(Course, course["id"]).status = "active"
        db.add(CourseMembership(course_id=course["id"], user_id=learner.id, status="active"))
    for index in range(3):
        post = student.post(
            "/v1/community/topics",
            headers=sh,
            json=TOPIC | {"courseId": course["id"], "title": f"Course question {index}"},
        ).json()
        if index == 0:
            with factory() as db:
                assert list(db.scalars(select(QuestCompletion))) == []
        endpoint = f"/v1/community/posts/{post['id']}/moderation"
        assert admin.post(endpoint, headers=ah, json={"decision": "approve"}).status_code == 200
        assert admin.post(endpoint, headers=ah, json={"decision": "approve"}).status_code == 200
    with factory() as db:
        rows = list(db.scalars(select(QuestCompletion)))
        assert len(rows) == 2
        assert all(row.quest_code == "STU_FORUM_ASK" for row in rows)


def test_teacher_discussion_publishes_trusted_poll_event_only_after_admin_approval(
    clients, monkeypatch
):
    admin, student, factory = clients
    ah, sh = login(admin), login(student, "student")
    with factory.begin() as db:
        db.scalar(select(User).where(User.username == "student")).roles = ["teacher"]
    calls = []
    monkeypatch.setattr("app.community.record_quest_event", lambda *args: calls.append(args))
    response = student.post("/v1/community/topics", headers=sh, json=TOPIC | {"kind": "discussion"})
    assert response.status_code == 201, response.text
    assert not calls
    path = f"/v1/community/posts/{response.json()['id']}/moderation"
    assert admin.post(path, headers=ah, json={"decision": "approve"}).status_code == 200
    assert admin.post(path, headers=ah, json={"decision": "approve"}).status_code == 200
    poll = [args for args in calls if args[2] == "poll.published"]
    assert len(poll) == 1
    assert poll[0][4]["published"] is True
    assert poll[0][4]["author_role"] == "teacher"


def test_teacher_can_review_student_but_not_other_teacher_content(clients, monkeypatch):
    admin, student, factory = clients
    ah = login(admin)
    sh = login(student, "student")
    student_post = student.post("/v1/community/topics", headers=sh, json=TOPIC).json()
    staff_user(factory, "teacher", "teacher")
    staff_user(factory, "colleague", "teacher")
    with TestClient(app) as teacher, TestClient(app) as colleague:
        th = login(teacher, "teacher")
        ch = login(colleague, "colleague")
        assert teacher.get("/v1/community/topics?view=queue").json()["total"] == 1
        assert (
            teacher.post(
                f"/v1/community/posts/{student_post['id']}/moderation",
                headers=th,
                json={"decision": "approve"},
            ).status_code
            == 200
        )
        colleague_post = colleague.post("/v1/community/topics", headers=ch, json=TOPIC).json()
        assert teacher.get(f"/v1/community/topics/{colleague_post['id']}").status_code == 404
        assert teacher.get("/v1/community/topics?view=queue").json()["total"] == 0
        answer = admin.post(
            f"/v1/community/topics/{student_post['id']}/answers", headers=ah, json=ANSWER
        ).json()
        calls = []
        monkeypatch.setattr("app.community.record_quest_event", lambda *args: calls.append(args))
        assert (
            teacher.put(
                f"/v1/community/topics/{student_post['id']}/best-answer",
                headers=th,
                json={"answerId": answer["id"]},
            ).status_code
            == 200
        )
        assert (
            not calls
        )  # Display selection is allowed; only student answers qualify for these quests.
