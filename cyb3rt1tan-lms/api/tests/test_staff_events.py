"""Funded course events pay only approved active course students."""

from datetime import timedelta

from sqlalchemy import func, select
from test_access import login
from test_courses import setup_course

from app.models import EconomyLedger, StaffEvent, StaffEventAward, now


def test_staff_event_funding_payout_replay_and_cancel_refund(clients):
    admin, student, factory = clients
    login(admin)
    student_headers = login(student, "student")
    admin_headers, course, _ = setup_course(admin)
    student_id = student.get("/v1/me", headers=student_headers).json()["id"]
    enroll = admin.post(
        f"/v1/courses/{course['id']}/enrollments",
        headers=admin_headers,
        json={"userId": student_id},
    )
    assert enroll.status_code == 201, enroll.text
    assert (
        admin.post(
            f"/v1/courses/{course['id']}/activate", headers=admin_headers, json={"reason": "Ready"}
        ).status_code
        == 200
    )
    admin_id = admin.get("/v1/me", headers=admin_headers).json()["id"]
    with factory.begin() as db:
        db.add(
            EconomyLedger(
                user_id=admin_id,
                currency="coin",
                delta=50,
                source="test.grant",
                idempotency_key="staff-event-test-funds",
                reason="test",
            )
        )
    event_body = {
        "title": "Course showcase",
        "description": "Present completed work.",
        "startsAt": (now() - timedelta(days=2)).isoformat(),
        "endsAt": (now() - timedelta(days=1)).isoformat(),
        "timezone": "UTC",
        "prizeBudgetCoin": 11,
        "awardMode": "equal_split",
    }
    event = admin.post(
        f"/v1/courses/{course['id']}/staff-events",
        headers=admin_headers | {"Idempotency-Key": "staff-event-create-1"},
        json=event_body,
    )
    assert event.status_code == 201, event.text
    assert admin.get("/v1/me/wallet", headers=admin_headers).json()["coin"] == 39
    replay_create = admin.post(
        f"/v1/courses/{course['id']}/staff-events",
        headers=admin_headers | {"Idempotency-Key": "staff-event-create-1"},
        json=event_body,
    )
    assert replay_create.status_code == 201
    approved = admin.post(
        f"/v1/staff-events/{event.json()['id']}/results/approval",
        headers=admin_headers | {"Idempotency-Key": "staff-event-results-1"},
        json={"participantIds": [student_id]},
    )
    assert approved.status_code == 200, approved.text
    replay = admin.post(
        f"/v1/staff-events/{event.json()['id']}/results/approval",
        headers=admin_headers | {"Idempotency-Key": "staff-event-results-1"},
        json={"participantIds": [student_id]},
    )
    assert replay.status_code == 200 and replay.json()["replayed"] is True
    assert student.get("/v1/me/wallet", headers=student_headers).json()["coin"] == 11
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(StaffEventAward)) == 1
        assert (
            db.scalar(
                select(func.count())
                .select_from(EconomyLedger)
                .where(EconomyLedger.source == "staff_event.award")
            )
            == 1
        )


def test_staff_event_cancel_refunds_reserve_and_rejects_early_results(clients):
    admin, student, factory = clients
    login(admin)
    admin_headers, course, _ = setup_course(admin)
    admin_id = admin.get("/v1/me", headers=admin_headers).json()["id"]
    with factory.begin() as db:
        db.add(
            EconomyLedger(
                user_id=admin_id,
                currency="coin",
                delta=20,
                source="test.grant",
                idempotency_key="staff-event-cancel-funds",
                reason="test",
            )
        )
    event = admin.post(
        f"/v1/courses/{course['id']}/staff-events",
        headers=admin_headers | {"Idempotency-Key": "staff-event-cancel-create"},
        json={
            "title": "Upcoming event",
            "description": "",
            "startsAt": (now() + timedelta(days=1)).isoformat(),
            "endsAt": (now() + timedelta(days=2)).isoformat(),
            "timezone": "UTC",
            "prizeBudgetCoin": 9,
            "awardMode": "winner_takes_all",
        },
    )
    assert event.status_code == 201, event.text
    student_headers = login(student, "student")
    student_id = student.get("/v1/me", headers=student_headers).json()["id"]
    early = admin.post(
        f"/v1/staff-events/{event.json()['id']}/results/approval",
        headers=admin_headers | {"Idempotency-Key": "staff-event-cancel-early"},
        json={"participantIds": [student_id]},
    )
    assert early.status_code == 409 and early.json()["error"]["code"] == "event_not_ended"
    cancelled = admin.post(
        f"/v1/staff-events/{event.json()['id']}/cancellations",
        headers=admin_headers | {"Idempotency-Key": "staff-event-cancel-decision"},
    )
    assert cancelled.status_code == 200, cancelled.text
    replay = admin.post(
        f"/v1/staff-events/{event.json()['id']}/cancellations",
        headers=admin_headers | {"Idempotency-Key": "staff-event-cancel-decision"},
    )
    assert replay.status_code == 200 and replay.json()["replayed"] is True
    assert admin.get("/v1/me/wallet", headers=admin_headers).json()["coin"] == 20
    with factory() as db:
        stored = db.get(StaffEvent, event.json()["id"])
        assert stored and stored.status == "cancelled"
