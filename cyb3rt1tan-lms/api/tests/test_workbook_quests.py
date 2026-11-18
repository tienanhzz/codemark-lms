"""Workbook rules are enforced against trusted events, never client completion flags."""

from datetime import timedelta

from sqlalchemy import select
from test_access import login

from app.models import EconomyLedger, User, now


def catalog(db):
    from app.quest_catalog import install_catalog

    install_catalog(db)
    db.flush()


def test_catalog_exact_roles_and_zero_unconfigured_rewards(clients):
    from app.quest_models import QuestDefinition

    _, _, factory = clients
    with factory.begin() as db:
        catalog(db)
        catalog(db)
        rows = list(db.scalars(select(QuestDefinition)))
        assert len(rows) == 24
        assert sum(row.target_role == "student" for row in rows) == 13
        assert sum(row.target_role == "teacher" for row in rows) == 11
        assert all(row.reward_exp == row.reward_coin == 0 for row in rows)


def test_trusted_forum_thresholds_daily_cap_and_source_replay(clients, monkeypatch):
    from app import quests
    from app.quest_models import QuestCompletion

    _, _, factory = clients
    instant = now()
    monkeypatch.setattr(quests, "now", lambda: instant)
    with factory.begin() as db:
        catalog(db)
        user = db.scalar(select(User).where(User.username == "student"))
        emit = lambda source, text: quests.record_quest_event(
            db,
            user,
            "forum.question.approved",
            source,
            {"content": text, "topic_id": source, "course_id": "course"},
        )
        emit("short", "x" * 49)
        emit("one", "x" * 50)
        emit("one", "x" * 50)
        emit("two", "x" * 50)
        emit("three", "x" * 50)
        assert len(list(db.scalars(select(QuestCompletion)))) == 2
        instant += timedelta(days=1)
        emit("one", "x" * 50)  # Same source never earns again, even after reset.
        emit("four", "x" * 50)
        assert len(list(db.scalars(select(QuestCompletion)))) == 3


def test_upgrade_replaces_base_and_pays_only_incremental_reward(clients):
    from app.quest_models import QuestCompletion, QuestDefinition
    from app.quests import record_quest_event

    _, _, factory = clients
    with factory.begin() as db:
        catalog(db)
        user = db.scalar(select(User).where(User.username == "student"))
        db.get(QuestDefinition, "STU_ASSIGN_ONTIME").reward_exp = 10
        db.get(QuestDefinition, "STU_ASSIGN_EARLY").reward_exp = 30
        deadline = now() + timedelta(days=2)
        record_quest_event(
            db,
            user,
            "assignment.submitted",
            "first",
            {
                "entity_id": "assignment",
                "deadline": deadline.isoformat(),
                "submitted_at": (deadline - timedelta(hours=2)).isoformat(),
            },
        )
        record_quest_event(
            db,
            user,
            "assignment.submitted",
            "early",
            {
                "entity_id": "assignment",
                "deadline": deadline.isoformat(),
                "submitted_at": (deadline - timedelta(hours=25)).isoformat(),
            },
        )
        record_quest_event(
            db,
            user,
            "assignment.submitted",
            "early",
            {
                "entity_id": "assignment",
                "deadline": deadline.isoformat(),
                "submitted_at": (deadline - timedelta(hours=25)).isoformat(),
            },
        )
        rows = list(db.scalars(select(QuestCompletion)))
        assert len(rows) == 1
        assert rows[0].quest_code == "STU_ASSIGN_EARLY"
        assert (
            sum(db.scalars(select(EconomyLedger.delta).where(EconomyLedger.user_id == user.id)))
            == 30
        )


def test_weekly_course_caps_and_end_term_not_before_close(clients, monkeypatch):
    from app import quests
    from app.quest_models import QuestCompletion

    _, _, factory = clients
    instant = now()
    monkeypatch.setattr(quests, "now", lambda: instant)
    with factory.begin() as db:
        catalog(db)
        user = db.scalar(select(User).where(User.username == "admin"))
        user.roles = ["teacher"]
        for index, course in enumerate(["a", "a", "a", "b"]):
            quests.record_quest_event(
                db,
                user,
                "resource.published",
                str(index),
                {
                    "course_id": course,
                    "resource_kind": "lecture",
                    "is_new": True,
                    "entity_id": str(index),
                },
            )
        assert len(list(db.scalars(select(QuestCompletion)))) == 3
        rating = {
            "entity_id": "class",
            "course_id": "a",
            "term_id": "term",
            "term_ended": False,
            "average_rating": 4.5,
            "response_count": 5,
        }
        quests.record_quest_event(db, user, "term.rating.finalized", "before", rating)
        assert len(list(db.scalars(select(QuestCompletion)))) == 3
        rating["term_ended"] = True
        quests.record_quest_event(db, user, "term.rating.finalized", "after", rating)
        quests.record_quest_event(db, user, "term.rating.finalized", "repeat", rating)
        assert len(list(db.scalars(select(QuestCompletion)))) == 4


def test_student_teacher_management_authorization_and_no_self_report(clients):
    admin, student, factory = clients
    ah = login(admin)
    sh = login(student, "student")
    with factory.begin() as db:
        catalog(db)
    items = student.get("/v1/quests/me").json()["items"]
    assert len(items) == 13
    assert all(row["targetRole"] == "student" for row in items)
    assert (
        student.patch(
            "/v1/quests/manage/STU_LOGIN_DAILY", headers=sh, json={"questName": "Unauthorized"}
        ).status_code
        == 403
    )
    assert student.post(
        "/v1/quests/events", headers=sh, json={"questCode": "STU_LOGIN_DAILY"}
    ).status_code in {404, 405}
    assert (
        admin.patch(
            "/v1/quests/manage/LEC_TOP_RATING", headers=ah, json={"questName": "Teacher rating"}
        ).status_code
        == 200
    )
    with factory.begin() as db:
        teacher = db.scalar(select(User).where(User.username == "student"))
        teacher.roles = ["teacher"]
    assert (
        student.patch(
            "/v1/quests/manage/STU_LOGIN_DAILY", headers=sh, json={"questName": "Attendance"}
        ).status_code
        == 200
    )
    assert (
        student.patch(
            "/v1/quests/manage/LEC_TOP_RATING", headers=sh, json={"questName": "Unauthorized"}
        ).status_code
        == 403
    )
    assert all(
        row["targetRole"] == "teacher" for row in student.get("/v1/quests/me").json()["items"]
    )


def test_evidence_requires_independent_authorized_review_and_real_thresholds(clients):
    from app.quest_models import QuestCompletion

    admin, student, factory = clients
    ah = login(admin)
    sh = login(student, "student")
    with factory.begin() as db:
        catalog(db)
    request = student.post(
        "/v1/quests/evidence",
        headers=sh,
        json={
            "questCode": "STU_PEER_REVIEW",
            "entityId": "assigned-review",
            "evidenceUrl": "https://example.test/review/1",
            "description": "Rubric and written feedback submitted for assigned peer review.",
        },
    )
    assert request.status_code == 201, request.text
    eid = request.json()["id"]
    body = {
        "decision": "approved",
        "reviewNote": "Compared rubric and assigned reviewer with original submission.",
        "verifiedData": {
            "content": "x" * 99,
            "assigned": True,
            "rubric_completed": True,
            "peer_user_id": "other",
        },
    }
    assert (
        student.post(f"/v1/quests/evidence/{eid}/review", headers=sh, json=body).status_code == 403
    )
    assert admin.post(f"/v1/quests/evidence/{eid}/review", headers=ah, json=body).status_code == 422
    body["verifiedData"]["content"] = "x" * 100
    assert admin.post(f"/v1/quests/evidence/{eid}/review", headers=ah, json=body).status_code == 200
    assert admin.post(f"/v1/quests/evidence/{eid}/review", headers=ah, json=body).status_code == 409
    with factory() as db:
        assert len(list(db.scalars(select(QuestCompletion)))) == 1
    replay = student.post(
        "/v1/quests/evidence",
        headers=sh,
        json={
            "questCode": "STU_PEER_REVIEW",
            "entityId": "assigned-review",
            "evidenceUrl": "https://example.test/review/changed-url",
            "description": "A second submission of the same original assignment evidence.",
        },
    )
    assert replay.status_code == 409


def test_authenticated_document_reader_requires_server_time_and_only_credits_document_once(
    clients, monkeypatch
):
    from app import quests
    from app.models import AcademicTerm, Course, CourseMembership, CourseResource
    from app.quest_models import QuestCompletion

    admin, student, factory = clients
    ah = login(admin)
    sh = login(student, "student")
    instant = now()
    monkeypatch.setattr(quests, "now", lambda: instant)
    with factory.begin() as db:
        catalog(db)
        admin_user = db.scalar(select(User).where(User.username == "admin"))
        student_user = db.scalar(select(User).where(User.username == "student"))
        db.add(
            AcademicTerm(
                id="reader-term",
                name="Reader term",
                starts_at=instant - timedelta(days=1),
                ends_at=instant + timedelta(days=30),
                timezone="Asia/Ho_Chi_Minh",
            )
        )
        db.flush()
        course = Course(
            code="READER",
            title="Document reader",
            term_id="reader-term",
            timezone="Asia/Ho_Chi_Minh",
            owner_id=admin_user.id,
            status="active",
        )
        db.add(course)
        db.flush()
        db.add(CourseMembership(course_id=course.id, user_id=student_user.id, status="active"))
        document = CourseResource(
            course_id=course.id,
            kind="learningResource",
            title="Slides",
            url="https://example.test/slides.pdf",
            position=0,
        )
        db.add(document)
        db.flush()
        did = document.id
    available = student.get("/v1/quests/resources").json()["items"]
    assert len(available) == 1 and available[0]["id"] == did
    opened = student.post(f"/v1/quests/resources/{did}/views", headers=sh)
    assert opened.status_code == 201, opened.text
    vid = opened.json()["id"]
    assert student.post(f"/v1/quests/resource-views/{vid}/finish", headers=sh).status_code == 409
    assert admin.post(f"/v1/quests/resource-views/{vid}/finish", headers=ah).status_code == 404
    instant += timedelta(seconds=31)
    assert student.post(f"/v1/quests/resource-views/{vid}/finish", headers=sh).status_code == 200
    second = student.post(f"/v1/quests/resources/{did}/views", headers=sh).json()["id"]
    instant += timedelta(seconds=31)
    assert student.post(f"/v1/quests/resource-views/{second}/finish", headers=sh).status_code == 200
    with factory() as db:
        assert (
            len(
                list(
                    db.scalars(
                        select(QuestCompletion).where(QuestCompletion.quest_code == "STU_DOC_VIEW")
                    )
                )
            )
            == 1
        )


def test_learning_streak_requires_login_and_activity_even_when_reward_is_already_capped(
    clients, monkeypatch
):
    from app import quests
    from app.quest_models import QuestCompletion

    _, _, factory = clients
    instant = now()
    monkeypatch.setattr(quests, "now", lambda: instant)
    with factory.begin() as db:
        catalog(db)
        learner = db.scalar(select(User).where(User.username == "student"))
        for index in range(7):
            quests.record_login(db, learner)
            # Same document may be genuinely reread each day; it earns once but remains activity.
            quests.record_quest_event(
                db,
                learner,
                "resource.viewed",
                "document:same",
                {"entity_id": "same-document", "duration_seconds": 30, "resource_exists": True},
            )
            if index < 6:
                assert not list(
                    db.scalars(
                        select(QuestCompletion).where(QuestCompletion.quest_code == "STU_STREAK_7D")
                    )
                )
                instant += timedelta(days=1)
        assert (
            len(
                list(
                    db.scalars(
                        select(QuestCompletion).where(QuestCompletion.quest_code == "STU_STREAK_7D")
                    )
                )
            )
            == 1
        )
        assert (
            len(
                list(
                    db.scalars(
                        select(QuestCompletion).where(QuestCompletion.quest_code == "STU_DOC_VIEW")
                    )
                )
            )
            == 1
        )


def test_source_catalog_exact_text_and_all_rows_have_workflow_or_review_path():
    import hashlib
    import json
    from pathlib import Path

    from app.quest_rules import CODE_EVENT, REVIEW_REQUIRED, ROUTES

    rows = json.loads(
        (Path(__file__).parents[1] / "app/workbook_quests.json").read_text(encoding="utf-8")
    )
    assert len(rows) == 24
    # Digest independently extracted from all seven workbook source columns (sheet4).
    assert (
        hashlib.sha256(
            json.dumps(rows, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        == "174e8ebf979765072fb5ebb081e46655d796d69ff4f1f7f790fff8b669799ab9"
    )
    assert len({row["quest_code"] for row in rows}) == 24
    assert all(row["quest_code"] in CODE_EVENT and row["quest_code"] in ROUTES for row in rows)
    assert {row["reset_type"] for row in rows} == {
        "DAILY",
        "WEEKLY",
        "PER_ENTITY",
        "UPGRADE_TIER",
        "END_OF_TERM",
    }
    assert (
        next(row for row in rows if row["quest_code"] == "STU_DOC_VIEW")["limit_rule"]
        == "1 lần/tài liệu, mở tối thiểu 30 giây"
    )
    assert (
        next(row for row in rows if row["quest_code"] == "LEC_TOP_RATING")["condition_desc"]
        == "Đạt điểm đánh giá hài lòng trung bình từ 4.5/5 sao trở lên"
    )
    assert all(ROUTES[code].startswith("/missions?evidence=") for code in REVIEW_REQUIRED)


def test_teacher_reply_uses_original_response_time_and_rejects_role_change_and_self_reply(clients):
    from app.quest_rules import satisfies

    _, _, factory = clients
    with factory() as db:
        teacher = db.scalar(select(User).where(User.username == "admin"))
        teacher.roles = ["teacher"]
        created = now() - timedelta(days=5)
        facts = {
            "author_role": "teacher",
            "topic_author_role": "student",
            "topic_author_id": "another-student",
            "content": "Helpful explanation",
            "course_id": "course",
            "topic_created_at": created.isoformat(),
            "replied_at": (created + timedelta(hours=24)).isoformat(),
        }
        assert satisfies("LEC_REPLY_24H", teacher, facts)
        assert not satisfies(
            "LEC_REPLY_24H",
            teacher,
            {**facts, "replied_at": (created + timedelta(hours=24, seconds=1)).isoformat()},
        )
        assert not satisfies("LEC_REPLY_24H", teacher, {**facts, "author_role": "student"})
        assert not satisfies("LEC_REPLY_24H", teacher, {**facts, "topic_author_id": teacher.id})


def test_rating_review_requires_actual_course_and_academic_term_end(clients):
    from app.models import AcademicTerm, Course

    admin, student, factory = clients
    ah = login(admin)
    sh = login(student, "student")
    instant = now()
    with factory.begin() as db:
        catalog(db)
        teacher = db.scalar(select(User).where(User.username == "student"))
        teacher.roles = ["teacher"]
        term = AcademicTerm(
            id="rating-term",
            name="Rating term",
            starts_at=instant - timedelta(days=100),
            ends_at=instant + timedelta(days=10),
            timezone="Asia/Ho_Chi_Minh",
        )
        db.add(term)
        db.flush()
        course = Course(
            code="RATING",
            title="Rating course",
            term_id=term.id,
            timezone="Asia/Ho_Chi_Minh",
            owner_id=teacher.id,
            status="active",
        )
        db.add(course)
        db.flush()
        cid = course.id
    evidence = student.post(
        "/v1/quests/evidence",
        headers=sh,
        json={
            "questCode": "LEC_TOP_RATING",
            "entityId": cid,
            "courseId": cid,
            "evidenceUrl": "https://example.test/original-rating-survey",
            "description": "The original end of course satisfaction survey and aggregate responses.",
        },
    )
    assert evidence.status_code == 201, evidence.text
    eid = evidence.json()["id"]
    review = {
        "decision": "approved",
        "reviewNote": "Compared the original survey records and verified all response totals.",
        "verifiedData": {
            "average_rating": 4.5,
            "response_count": 20,
            "term_ended": True,
            "term_id": "forged-client-term",
        },
    }
    assert (
        admin.post(f"/v1/quests/evidence/{eid}/review", headers=ah, json=review).status_code == 422
    )
    with factory.begin() as db:
        db.get(AcademicTerm, "rating-term").ends_at = instant - timedelta(days=1)
    assert (
        admin.post(f"/v1/quests/evidence/{eid}/review", headers=ah, json=review).status_code == 422
    )
    with factory.begin() as db:
        db.get(Course, cid).status = "completed"
    accepted = admin.post(f"/v1/quests/evidence/{eid}/review", headers=ah, json=review)
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["verifiedData"]["term_id"] == "rating-term"
