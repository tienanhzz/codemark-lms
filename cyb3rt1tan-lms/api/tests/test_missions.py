"""Trusted mission events, cycle progress and reward idempotency."""

from datetime import timedelta

from starlette.requests import Request
from test_access import login

from app.missions import record_domain_event
from app.models import (
    Clan,
    ClanExpLedger,
    ClanMembership,
    EconomyLedger,
    User,
    UserExpMultiplier,
    now,
)


def _request() -> Request:
    request = Request(
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": "/v1/test-event",
            "raw_path": b"/v1/test-event",
            "query_string": b"",
            "headers": [],
            "client": ("127.0.0.1", 4321),
            "server": ("127.0.0.1", 8100),
        }
    )
    request.state.request_id = "f031b5d1-63a6-42ba-8986-49c2bd421119"
    return request


def test_trusted_events_issue_daily_reward_once_and_once_mission_claim_is_idempotent(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    student_headers = login(student, "student")
    daily = admin.post(
        "/v1/admin/missions",
        headers=admin_headers,
        json={
            "missionId": "daily-practice",
            "version": 1,
            "title": "Practice twice",
            "eventKey": "practice.attempt",
            "targetCount": 2,
            "cadence": "daily",
            "timeZone": "Asia/Bangkok",
            "eligibleRoles": ["student"],
            "reward": {"exp": 40, "coin": 5},
        },
    )
    assert daily.status_code == 201, daily.text
    once = admin.post(
        "/v1/admin/missions",
        headers=admin_headers,
        json={
            "missionId": "first-correct",
            "version": 1,
            "title": "First correct answer",
            "eventKey": "practice.correct",
            "targetCount": 1,
            "cadence": "once",
            "timeZone": "Asia/Bangkok",
            "eligibleRoles": ["student"],
            "reward": {"exp": 100, "coin": 0},
        },
    )
    assert once.status_code == 201, once.text
    student_id = student.get("/v1/me").json()["id"]
    with factory() as db:
        instant = now()
        db.add(
            UserExpMultiplier(
                user_id=student_id,
                multiplier=2,
                starts_at=instant,
                ends_at=instant + timedelta(hours=8),
            )
        )
        learner = db.get(User, student_id)
        assert learner
        request = _request()
        record_domain_event(db, request, learner, "practice.attempt", "trusted-attempt-1")
        record_domain_event(db, request, learner, "practice.attempt", "trusted-attempt-1")
        db.commit()
    version_two = admin.post(
        "/v1/admin/missions",
        headers=admin_headers,
        json={
            "missionId": "daily-practice",
            "version": 2,
            "title": "Practice three times",
            "eventKey": "practice.attempt",
            "targetCount": 3,
            "cadence": "daily",
            "timeZone": "Asia/Bangkok",
            "eligibleRoles": ["student"],
            "reward": {"exp": 999, "coin": 0},
        },
    )
    assert version_two.status_code == 201, version_two.text
    with factory() as db:
        learner = db.get(User, student_id)
        assert learner
        request = _request()
        record_domain_event(db, request, learner, "practice.attempt", "trusted-attempt-2")
        record_domain_event(db, request, learner, "practice.attempt", "trusted-attempt-3")
        record_domain_event(db, request, learner, "practice.correct", "trusted-attempt-2")
        db.commit()
    wallet = student.get("/v1/me/wallet", headers=student_headers).json()
    assert wallet["exp"] == 80 and wallet["coin"] == 5
    assert wallet["expMultiplier"] == 2 and wallet["expMultiplierEndsAt"] is not None
    missions = student.get("/v1/me/missions", headers=student_headers)
    assert missions.status_code == 200
    rows = {item["missionId"]: item for item in missions.json()["items"]}
    assert rows["daily-practice"]["progress"] == 2 and rows["daily-practice"]["status"] == "claimed"
    assert rows["daily-practice"]["version"] == 1
    assert rows["first-correct"]["canClaim"] is True
    headers = {**student_headers, "Idempotency-Key": "mission-claim-key-1"}
    claim_path = "/v1/missions/first-correct/claims"
    claim = student.post(claim_path, headers=headers)
    assert claim.status_code == 200, claim.text
    replay = student.post(claim_path, headers=headers)
    assert replay.status_code == 200 and replay.json()["replayed"] is True
    assert student.get("/v1/me/wallet", headers=student_headers).json()["exp"] == 280


def test_admin_rejects_unregistered_mission_event_key(clients):
    admin, _, _ = clients
    headers = login(admin)
    response = admin.post(
        "/v1/admin/missions",
        headers=headers,
        json={
            "missionId": "bad",
            "version": 1,
            "title": "Do anything",
            "eventKey": "client.says.done",
            "reward": {"exp": 100},
        },
    )
    assert response.status_code == 422


def test_clan_missions_progress_from_trusted_events_and_award_once(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    student_headers = login(student, "student")
    student_id = student.get("/v1/me", headers=student_headers).json()["id"]
    clan_id = "00000000-0000-4000-8000-000000000531"
    with factory.begin() as db:
        db.add(Clan(id=clan_id, name="Mission Clan", name_key="mission clan", owner_id=student_id))
        db.add(
            ClanMembership(clan_id=clan_id, user_id=student_id, status="active", role_key="owner")
        )
    draft = admin.post(
        "/v1/admin/clan-missions",
        headers=admin_headers,
        json={
            "missionId": "weekly-clan-practice",
            "title": "Practice as a clan",
            "eventKey": "practice.attempt",
            "targetCount": 2,
            "cadence": "weekly",
            "timeZone": "Asia/Bangkok",
            "rewardClanExp": 30,
            "rewardExp": 15,
            "rewardCoin": 2,
        },
    )
    assert draft.status_code == 201, draft.text
    mission = draft.json()
    active = admin.post(
        f"/v1/admin/clan-missions/{mission['missionId']}/versions/{mission['version']}/activation",
        headers=admin_headers,
    )
    assert active.status_code == 200, active.text
    with factory.begin() as db:
        learner = db.get(User, student_id)
        assert learner
        record_domain_event(db, _request(), learner, "practice.attempt", "trusted-clan-event-1")
    version_two = admin.post(
        "/v1/admin/clan-missions",
        headers=admin_headers,
        json={
            "missionId": "weekly-clan-practice",
            "title": "Practice even more as a clan",
            "eventKey": "practice.attempt",
            "targetCount": 1,
            "cadence": "weekly",
            "timeZone": "Asia/Bangkok",
            "rewardClanExp": 900,
            "rewardExp": 900,
            "rewardCoin": 900,
        },
    )
    assert version_two.status_code == 201, version_two.text
    activated_two = admin.post(
        f"/v1/admin/clan-missions/{mission['missionId']}/versions/2/activation",
        headers=admin_headers,
    )
    assert activated_two.status_code == 200, activated_two.text
    for event_id in ("trusted-clan-event-1", "trusted-clan-event-2", "trusted-clan-event-3"):
        with factory.begin() as db:
            learner = db.get(User, student_id)
            assert learner
            record_domain_event(db, _request(), learner, "practice.attempt", event_id)
    mission_state = student.get("/v1/me/clan-missions", headers=student_headers)
    assert mission_state.status_code == 200
    assert mission_state.json()["items"][0]["version"] == 1
    assert mission_state.json()["items"][0]["progress"] == 2
    assert mission_state.json()["items"][0]["status"] == "complete"
    wallet = student.get("/v1/me/wallet", headers=student_headers).json()
    assert wallet["exp"] == 15 and wallet["coin"] == 2
    with factory() as db:
        clan = db.get(Clan, clan_id)
        assert clan and clan.clan_exp == 30
        assert db.query(ClanExpLedger).filter(ClanExpLedger.source == "clan_mission").count() == 1
        rewards = db.query(EconomyLedger).filter(EconomyLedger.source == "clan_mission").count()
        assert rewards == 2
