"""Leaderboard cohort, immutable EXP, rank and privacy behavior."""

import importlib.util
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from test_access import login

from app.models import (
    AuditEvent,
    Course,
    CourseMembership,
    CourseStaff,
    EconomyLedger,
    RankPolicy,
    RankRoleTask,
    RankTaskMetricReceipt,
    RankTaskRequest,
    RankTier,
    User,
)


def add_user(db, username, roles=None, **values):
    user = User(
        username=username,
        email=username.replace("@", ".") + "@example.test",
        official_name="Private Official Name " + username,
        roles=roles or ["student"],
        password_hash="not-used-by-these-tests",
        **values,
    )
    db.add(user)
    db.flush()
    return user


def award(db, user, delta, key, currency="exp"):
    db.add(
        EconomyLedger(
            user_id=user.id,
            currency=currency,
            delta=delta,
            source="test",
            idempotency_key=key,
            detail={},
        )
    )


def test_leaderboard_requires_session_and_valid_track(clients):
    _, student, _ = clients
    assert student.get("/v1/leaderboard").status_code == 401
    login(student, "student")
    assert student.get("/v1/leaderboard?track=unknown").status_code == 422


def test_student_rank_uses_net_exp_ties_zero_scores_and_global_search_position(clients):
    _, student, factory = clients
    login(student, "student")
    with factory.begin() as db:
        a = add_user(db, "rank-a", nickname="Alpha")
        b = add_user(db, "rank-b", nickname="Bravo")
        c = add_user(db, "rank-c", nickname="Charlie")
        inactive = add_user(db, "rank-disabled", status="disabled")
        staff = add_user(db, "rank-teacher", ["teacher"])
        award(db, a, 150, "a-credit")
        award(db, a, -50, "a-debit")
        award(db, a, 9000, "a-coin", "coin")
        award(db, b, 100, "b-credit")
        award(db, c, 50, "c-credit")
        award(db, inactive, 10000, "inactive-credit")
        award(db, staff, 20000, "staff-credit")
    response = student.get("/v1/leaderboard?track=student")
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["track"] == "student" and data["total"] == 4
    assert [(r["username"], r["position"], r["exp"]) for r in data["items"]] == [
        ("rank-a", 1, 100),
        ("rank-b", 1, 100),
        ("rank-c", 3, 50),
        ("student", 4, 0),
    ]
    filtered = student.get("/v1/leaderboard?track=student&q=CHARLIE").json()
    assert filtered["total"] == 1 and filtered["items"][0]["position"] == 3
    assert student.get("/v1/leaderboard?q=%25").json()["items"] == []
    assert student.get("/v1/leaderboard?q=Private%20Official").json()["items"] == []
    assert "Private Official" not in response.text and "@example.test" not in response.text


def test_staff_is_teacher_only_and_hides_email_usernames(clients):
    _, student, factory = clients
    login(student, "student")
    with factory.begin() as db:
        teacher = add_user(db, "rank-teacher", ["teacher", "teachingAssistant"])
        add_user(db, "rank-ta", ["teachingAssistant"])
        add_user(db, "person@institution.test", ["teacher"])
        add_user(db, "rank-former-teacher", ["teacher"], status="disabled")
        award(db, teacher, 50, "teacher-exp")
    data = student.get("/v1/leaderboard?track=staff").json()
    assert data["total"] == 2
    assert data["items"][0]["username"] == "rank-teacher"
    hidden = data["items"][1]
    assert hidden["username"] is None and hidden["displayName"].startswith("Teacher ")
    assert "@" not in str(data) and "officialName" not in str(data)
    assert student.get("/v1/leaderboard?track=staff&q=institution").json()["items"] == []


def test_unconfigured_rank_artwork_uses_legacy_position_ranges_and_ties(clients):
    _, student, factory = clients
    login(student, "student")
    with factory.begin() as db:
        for index in range(1, 13):
            target = add_user(db, f"position-{index:02d}")
            award(db, target, 1400 - index * 100, f"position-{index}")
    items = student.get("/v1/leaderboard").json()["items"]
    assert [row["tier"]["key"] for row in items] == [
        "master",
        "ruby",
        "diamond",
        "gold",
        "gold",
        "silver",
        "silver",
        "silver",
        "silver",
        "silver",
        "bronze",
        "bronze",
        "bronze",
    ]
    assert all(row["tier"]["source"] == "position" for row in items)
    with factory.begin() as db:
        target = add_user(db, "position-tied")
        award(db, target, 1300, "position-tied")
    tied = student.get("/v1/leaderboard").json()["items"]
    assert tied[0]["position"] == tied[1]["position"] == 1
    assert tied[0]["tier"]["key"] == tied[1]["tier"]["key"] == "master"
    assert tied[2]["tier"]["key"] == "diamond"


def test_course_rank_scopes_members_and_teacher_staff_before_assigning_positions(clients):
    from test_courses import setup_course

    admin, student, factory = clients
    _, course, _ = setup_course(admin)
    login(student, "student")
    with factory.begin() as db:
        viewer = db.scalar(select(User).where(User.username == "student"))
        participant = add_user(db, "course-player")
        outsider = add_user(db, "outside-player")
        withdrawn = add_user(db, "withdrawn-player")
        owner = add_user(db, "course-owner", ["teacher"])
        teacher = add_user(db, "course-teacher", ["teacher"])
        inactive_staff = add_user(db, "inactive-staff", ["teacher"])
        assistant = add_user(db, "course-assistant", ["teacher", "teachingAssistant"])
        target = db.get(Course, course["id"])
        target.status, target.owner_id = "active", owner.id
        for member, status in [
            (viewer, "active"),
            (participant, "completed"),
            (withdrawn, "withdrawn"),
        ]:
            db.add(CourseMembership(course_id=target.id, user_id=member.id, status=status))
        for member, role, active in [
            (teacher, "teacher", True),
            (inactive_staff, "teacher", False),
            (assistant, "teachingAssistant", True),
        ]:
            db.add(CourseStaff(course_id=target.id, user_id=member.id, role=role, active=active))
        for member, score in [
            (viewer, 20),
            (participant, 10),
            (outsider, 1000),
            (withdrawn, 900),
            (owner, 100),
            (teacher, 200),
            (inactive_staff, 900),
            (assistant, 800),
        ]:
            award(db, member, score, "scoped-" + member.username)
    endpoint = "/v1/leaderboard?courseId=" + course["id"]
    response = student.get(endpoint)
    assert response.status_code == 200, response.text
    assert [(r["username"], r["position"]) for r in response.json()["items"]] == [
        ("student", 1),
        ("course-player", 2),
    ]
    assert student.get(endpoint + "&q=course-player").json()["items"][0]["position"] == 2
    staff = student.get(endpoint + "&track=staff").json()
    assert staff["total"] == 2
    assert [(r["username"], r["position"]) for r in staff["items"]] == [
        ("course-teacher", 1),
        ("course-owner", 2),
    ]


def test_course_rank_rejects_invisible_missing_or_invalid_courses(clients):
    from test_courses import setup_course

    admin, student, _ = clients
    _, course, _ = setup_course(admin)
    login(student, "student")
    assert student.get("/v1/leaderboard?courseId=" + course["id"]).status_code == 404
    assert student.get("/v1/leaderboard?courseId=" + str(uuid4())).status_code == 404
    assert student.get("/v1/leaderboard?courseId=bad").status_code == 422


def test_leaderboard_current_tier_honors_staff_manual_and_metric_requirements(clients):
    _, student, factory = clients
    login(student, "student")
    with factory.begin() as db:
        actor = db.scalar(select(User).where(User.username == "admin"))
        teacher = add_user(db, "rank-teacher", ["teacher"])
        award(db, teacher, 150, "teacher-tier-exp")
        policy = RankPolicy(track="staff", version=1, status="active", author_id=actor.id)
        db.add(policy)
        db.flush()
        db.add_all(
            [
                RankTier(
                    policy_id=policy.id,
                    tier_key="starter",
                    name="Starter",
                    threshold_exp=0,
                    icon="fa-star",
                    color="#176b87",
                    description="",
                    position=0,
                ),
                RankTier(
                    policy_id=policy.id,
                    tier_key="mentor",
                    name="Mentor",
                    threshold_exp=100,
                    icon="fa-star",
                    color="#176b87",
                    description="",
                    position=1,
                ),
                RankRoleTask(
                    policy_id=policy.id,
                    tier_key="mentor",
                    staff_role="teacher",
                    task_key="review",
                    title="Review",
                    requirement_type="manual_review",
                ),
                RankRoleTask(
                    policy_id=policy.id,
                    tier_key="mentor",
                    staff_role="teacher",
                    task_key="practice",
                    title="Practice",
                    requirement_type="metric",
                    event_key="practice.correct",
                    target_count=2,
                ),
            ]
        )
        teacher_id, policy_id, actor_id = teacher.id, policy.id, actor.id
    before = student.get("/v1/leaderboard?track=staff").json()["items"][0]
    assert before["exp"] == 150 and before["tier"]["key"] == "starter"
    with factory.begin() as db:
        db.add(
            RankTaskRequest(
                user_id=teacher_id,
                policy_id=policy_id,
                tier_key="mentor",
                task_key="review",
                evidence="Reviewed test evidence",
                idempotency_key="approved-review",
                status="approved",
                reviewer_id=actor_id,
                reviewer_reason="Verified test evidence",
            )
        )
        db.add_all(
            [
                RankTaskMetricReceipt(
                    user_id=teacher_id, event_key="practice.correct", source_event_id="teacher-one"
                ),
                RankTaskMetricReceipt(
                    user_id=teacher_id,
                    event_key="practice.attempt",
                    source_event_id="teacher-unrelated",
                ),
                RankTaskMetricReceipt(
                    user_id=actor_id,
                    event_key="practice.correct",
                    source_event_id="other-person-one",
                ),
            ]
        )
    pending = student.get("/v1/leaderboard?track=staff").json()["items"][0]
    assert pending["tier"]["key"] == "starter"
    with factory.begin() as db:
        db.add(
            RankTaskMetricReceipt(
                user_id=teacher_id, event_key="practice.correct", source_event_id="teacher-two"
            )
        )
    after = student.get("/v1/leaderboard?track=staff").json()["items"][0]
    assert after["tier"]["key"] == "mentor"


def seed_module():
    path = Path(__file__).resolve().parents[2] / "scripts/seed-leaderboard.py"
    spec = importlib.util.spec_from_file_location("seed_leaderboard", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_demo_seed_is_idempotent_and_keeps_existing_passwords(clients):
    _, _, factory = clients
    module = seed_module()
    with factory.begin() as db:
        actor = db.scalar(select(User).where(User.username == "admin"))
        result = module.seed_accounts(db, actor)
        assert (
            db.scalar(select(User).where(User.username == "test.student01")).institutional_id
            == "2025000001"
        )
        assert result["created"] == 40 and result["ledgerEntries"] == 38
    with factory.begin() as db:
        user = db.scalar(select(User).where(User.username == "test.student01"))
        user.password_hash = "changed-password-must-remain"
    with factory.begin() as db:
        actor = db.scalar(select(User).where(User.username == "admin"))
        result = module.seed_accounts(db, actor)
        assert result["created"] == 0 and result["ledgerEntries"] == 0
        user = db.scalar(select(User).where(User.username == "test.student01"))
        assert user.password_hash == "changed-password-must-remain"
        assert db.scalar(select(func.count()).select_from(User)) == 42
        assert db.scalar(select(func.count()).select_from(EconomyLedger)) == 38
        assert (
            db.scalar(
                select(func.count())
                .select_from(AuditEvent)
                .where(AuditEvent.action == "leaderboard_demo_seeded")
            )
            == 2
        )


def test_demo_seed_refuses_existing_non_demo_account(clients):
    _, _, factory = clients
    module = seed_module()
    with factory.begin() as db:
        actor = db.scalar(select(User).where(User.username == "admin"))
        add_user(db, "test.student01")
        with pytest.raises(ValueError, match="not a leaderboard demo account"):
            module.seed_accounts(db, actor)


def test_credential_reference_is_private_readable_and_preserved_on_rerun(tmp_path):
    module = seed_module()
    path = tmp_path / "accounts.txt"
    module.write_credentials(path)
    content = path.read_text(encoding="utf-8")
    assert "test.student30" in content and "test.teacher10" in content
    path.write_text("User updated credential reference", encoding="utf-8")
    module.write_credentials(path)
    assert path.read_text(encoding="utf-8") == "User updated credential reference"


def test_credential_write_failure_does_not_leave_an_empty_reference(tmp_path, monkeypatch):
    module = seed_module()
    path = tmp_path / "accounts.txt"

    def fail_write(*_args):
        raise OSError("simulated disk failure")

    monkeypatch.setattr(module.os, "write", fail_write)
    with pytest.raises(OSError, match="simulated disk failure"):
        module.write_credentials(path)
    assert not path.exists()
