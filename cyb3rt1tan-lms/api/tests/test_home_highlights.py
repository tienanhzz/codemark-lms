"""Authenticated home highlights are factual, bounded ledger projections."""

from datetime import timedelta

from sqlalchemy import func, select
from test_access import login

from app.models import AuditEvent, EconomyLedger, HomeAnnouncement, Notification, User, now


def add_user(db, name, roles=None, **values):
    user = User(
        username=name,
        email=name.replace("@", ".") + "@example.test",
        official_name="Private Official " + name,
        password_hash="unused",
        roles=roles or ["student"],
        **values,
    )
    db.add(user)
    db.flush()
    return user


def award(db, user, amount, key, *, minutes=1, days=0, currency="exp"):
    db.add(
        EconomyLedger(
            user_id=user.id,
            currency=currency,
            delta=amount,
            source="test",
            idempotency_key=key,
            detail={},
            created_at=now() - timedelta(days=days, minutes=minutes),
        )
    )


def test_home_highlights_require_an_active_session(clients):
    _, student, factory = clients
    assert student.get("/v1/home/highlights").status_code == 401
    login(student, "student")
    assert student.get("/v1/home/highlights").status_code == 200
    with factory.begin() as db:
        db.scalar(select(User).where(User.username == "student")).status = "disabled"
    assert student.get("/v1/home/highlights").status_code == 401


def test_real_top_five_entry_reports_improvement_and_displaced_positions(clients):
    _, student, factory = clients
    login(student, "student")
    with factory.begin() as db:
        users = [
            add_user(db, name) for name in ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Fox"]
        ]
        for index, user in enumerate(users):
            award(db, user, 100 - index * 10, "initial-" + user.username, days=60)
        award(db, users[5], 25, "fox-enters")
    response = student.get("/v1/home/highlights")
    assert response.status_code == 200, response.text
    cards = response.json()["items"]
    movements = [card for card in cards if card["kind"] == "rank_change"]
    assert len(movements) == 1
    movement = movements[0]
    assert "Fox (#6 → #4)" in movement["body"]["en"]
    assert "Delta (#4 → #5)" in movement["body"]["en"]
    assert "Echo (#5 → #6)" in movement["body"]["en"]
    assert "Congratulations" in movement["body"]["en"]
    assert movement["createdAt"] and movement["href"] == "/leaderboard"
    assert movement["body"]["vi"] and movement["title"]["vi"]
    assert any(card["kind"] == "congratulations" for card in cards)
    assert len([card for card in cards if card["kind"] == "study_tip"]) == 3
    assert len(cards) <= 8


def test_debit_reports_a_real_fall_out_of_top_five(clients):
    _, student, factory = clients
    login(student, "student")
    with factory.begin() as db:
        users = [add_user(db, "player-" + str(index)) for index in range(6)]
        for index, user in enumerate(users):
            award(db, user, 100 - index * 10, "initial-" + user.username, days=60)
        award(db, users[0], -55, "leader-falls")
    movement = next(
        card
        for card in student.get("/v1/home/highlights").json()["items"]
        if card["kind"] == "rank_change"
    )
    assert "player-0 (#1 → #6)" in movement["body"]["en"]
    assert "player-5 (#6 → #5)" in movement["body"]["en"]


def test_teacher_movement_links_to_the_teacher_board(clients):
    _, student, factory = clients
    login(student, "student")
    with factory.begin() as db:
        leader = add_user(db, "teacher-leader", ["teacher"])
        challenger = add_user(db, "teacher-challenger", ["teacher"])
        award(db, leader, 100, "teacher-leader-old", days=60)
        award(db, challenger, 50, "teacher-challenger-old", days=60)
        award(db, challenger, 100, "teacher-challenger-up")
    cards = student.get("/v1/home/highlights").json()["items"]
    movement = next(card for card in cards if card["kind"] == "rank_change")
    assert movement["href"] == "/leaderboard?track=staff"


def test_competition_rank_ties_do_not_invent_moves_from_display_order(clients):
    _, student, factory = clients
    login(student, "student")
    with factory.begin() as db:
        alpha, bravo, charlie = [add_user(db, name) for name in ["Alpha", "Bravo", "Charlie"]]
        for user, score in [(alpha, 100), (bravo, 100), (charlie, 50)]:
            award(db, user, score, "initial-" + user.username, days=60)
        award(db, charlie, 50, "charlie-ties", minutes=2)
    movement = next(
        card
        for card in student.get("/v1/home/highlights").json()["items"]
        if card["kind"] == "rank_change"
    )
    assert "Charlie (#3 → #1)" in movement["body"]["en"]
    assert "Alpha" not in movement["body"]["en"]
    assert "Bravo" not in movement["body"]["en"]
    with factory.begin() as db:
        award(db, charlie, 10, "charlie-leads")
    newest = next(
        card
        for card in student.get("/v1/home/highlights").json()["items"]
        if card["kind"] == "rank_change"
    )
    assert "Alpha (#1 → #2)" in newest["body"]["en"]
    assert "Bravo (#1 → #2)" in newest["body"]["en"]
    assert "Charlie" not in newest["body"]["en"]


def test_highlights_share_leaderboard_privacy_and_current_cohorts(clients):
    _, student, factory = clients
    login(student, "student")
    with factory.begin() as db:
        unsafe = add_user(
            db, "person@institution.test", ["teacher"], nickname="nickname@private.test"
        )
        safe = add_user(db, "safe-teacher", ["teacher"], nickname="Mentor")
        inactive = add_user(db, "Disabled", status="disabled")
        assistant = add_user(db, "Assistant", ["teachingAssistant"])
        admin = db.scalar(select(User).where(User.username == "admin"))
        for index, user in enumerate([unsafe, safe, inactive, assistant, admin]):
            award(db, user, 100 + index, "initial-" + str(index), days=60)
        award(db, safe, 1, "mentor-improves")
        award(db, safe, 9999, "coin-is-not-exp", currency="coin")
    response = student.get("/v1/home/highlights")
    assert response.status_code == 200
    text = response.text
    assert "Mentor" in text and "Teacher " in text
    for private in ["@", "Private Official", "officialName", "Disabled", "Assistant", "admin"]:
        assert private not in text


def test_empty_scores_have_only_honest_system_guidance(clients):
    _, student, _ = clients
    login(student, "student")
    cards = student.get("/v1/home/highlights").json()["items"]
    assert len(cards) == 3
    assert {card["kind"] for card in cards} == {"study_tip"}
    assert {card["href"] for card in cards} == {"/calendar", "/courses"}
    assert all(card["createdAt"] is None for card in cards)


def test_unchanged_position_and_events_outside_latest_fifty_create_no_movement(clients):
    _, student, factory = clients
    login(student, "student")
    with factory.begin() as db:
        user = add_user(db, "Leader")
        award(db, user, 100, "old-entry", minutes=70)
        for index in range(60):
            award(db, user, 1, "stable-" + str(index), minutes=60 - index)
    cards = student.get("/v1/home/highlights").json()["items"]
    assert not any(card["kind"] == "rank_change" for card in cards)
    assert any(card["kind"] == "congratulations" for card in cards)


def test_repeated_reads_are_stable_and_write_no_notifications_or_ledger_entries(clients):
    _, student, factory = clients
    login(student, "student")
    with factory.begin() as db:
        user = add_user(db, "Reader")
        award(db, user, 10, "reader-entry")

    def counts():
        with factory() as db:
            return tuple(
                db.scalar(select(func.count()).select_from(model))
                for model in [EconomyLedger, AuditEvent, HomeAnnouncement, Notification, User]
            )

    before = counts()
    first = student.get("/v1/home/highlights").json()
    assert student.get("/v1/home/highlights").json() == first
    assert counts() == before
