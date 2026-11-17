"""Achievement progress, reward idempotency and title ownership."""

from starlette.requests import Request
from test_access import login

from app.missions import record_domain_event
from app.models import User


def test_achievement_unlock_posts_reward_once_and_allows_only_earned_titles(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    student_headers = login(student, "student")
    created = admin.post(
        "/v1/admin/achievements",
        headers=admin_headers,
        json={
            "achievementId": "first-correct-answer",
            "version": 1,
            "title": "First correct answer",
            "description": "Answer a practice question correctly.",
            "eventKey": "practice.correct",
            "eligibleRoles": ["student"],
            "tiers": [
                {
                    "tierKey": "bronze",
                    "name": "Bronze",
                    "thresholdCount": 1,
                    "exp": 50,
                    "coin": 5,
                    "title": "Quick Study",
                },
                {"tierKey": "silver", "name": "Silver", "thresholdCount": 5, "exp": 100},
            ],
        },
    )
    assert created.status_code == 201, created.text
    student_id = student.get("/v1/me").json()["id"]
    with factory() as db:
        learner = db.get(User, student_id)
        assert learner
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
        request.state.request_id = "d687ec06-d3a8-4f71-b594-57d7d658910c"
        record_domain_event(db, request, learner, "practice.correct", "correct-attempt-1")
        record_domain_event(db, request, learner, "practice.correct", "correct-attempt-1")
        db.commit()
    result = student.get("/v1/me/achievements", headers=student_headers)
    assert result.status_code == 200
    achievement = result.json()["items"][0]
    assert achievement["progress"] == 1 and achievement["tiers"][0]["unlocked"] is True
    assert achievement["tiers"][1]["unlocked"] is False
    wallet = student.get("/v1/me/wallet", headers=student_headers).json()
    assert wallet["exp"] == 50 and wallet["coin"] == 5
    equipped = student.post(
        "/v1/me/titles/equip",
        headers=student_headers,
        json={
            "achievementId": "first-correct-answer",
            "version": 1,
            "tierKey": "bronze",
        },
    )
    assert equipped.status_code == 200 and equipped.json()["title"] == "Quick Study"
    assert student.get("/v1/me/title").json()["title"] == "Quick Study"
    assert (
        student.post(
            "/v1/me/titles/equip",
            headers=student_headers,
            json={
                "achievementId": "first-correct-answer",
                "version": 1,
                "tierKey": "silver",
            },
        ).status_code
        == 404
    )
    assert student.delete("/v1/me/title", headers=student_headers).status_code == 204
    assert student.get("/v1/me/title").json() is None
