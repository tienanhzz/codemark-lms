"""Wallet privacy, append-only ledger projection and immutable rank policies."""

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from starlette.requests import Request
from test_access import login

from app.main import app
from app.missions import record_domain_event
from app.models import EconomyLedger, RankTaskMetricReceipt, User, now
from app.security import passwords


def test_wallet_ledger_scope_and_rank_policy_activation(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    login(student, "student")
    student_id = student.get("/v1/me").json()["id"]
    with factory.begin() as db:
        db.add_all([
            EconomyLedger(user_id=student_id, currency="exp", delta=120, source="test", idempotency_key="test-exp-1", detail={}, created_at=now()),
            EconomyLedger(user_id=student_id, currency="coin", delta=35, source="test", idempotency_key="test-coin-1", detail={}, created_at=now()),
        ])
    wallet = student.get("/v1/me/wallet")
    assert wallet.status_code == 200
    assert wallet.json()["exp"] == 120 and wallet.json()["coin"] == 35
    assert wallet.json()["ranks"] == [{"track": "student", "exp": 120, "policyVersion": None, "current": None, "next": None, "progressPercent": None}]
    ledger = student.get("/v1/me/ledger", params={"pageSize": 1})
    assert ledger.status_code == 200 and len(ledger.json()["items"]) == 1
    cursor = ledger.json()["nextCursor"]
    assert cursor
    assert student.get("/v1/me/ledger", params={"cursor": cursor}).status_code == 200
    assert admin.get("/v1/me/ledger", params={"cursor": cursor}).status_code == 422

    policy = admin.post("/v1/admin/rank-policies", headers=admin_headers, json={
        "track": "student", "tiers": [
            {"tierKey": "starter", "name": "Starter", "thresholdExp": 0},
            {"tierKey": "scholar", "name": "Scholar", "thresholdExp": 100},
            {"tierKey": "expert", "name": "Expert", "thresholdExp": 500},
        ],
    })
    assert policy.status_code == 201, policy.text
    activation = admin.post(f"/v1/admin/rank-policies/{policy.json()['id']}/activation", headers=admin_headers)
    assert activation.status_code == 200, activation.text
    after = student.get("/v1/me/wallet").json()["ranks"][0]
    assert after["current"]["key"] == "scholar" and after["next"]["key"] == "expert"
    assert after["progressPercent"] == 5
    assert admin.post(f"/v1/admin/rank-policies/{policy.json()['id']}/activation", headers=admin_headers).status_code == 409


def test_rank_policy_rejects_non_increasing_thresholds(clients):
    admin, _, _ = clients
    headers = login(admin)
    response = admin.post("/v1/admin/rank-policies", headers=headers, json={
        "track": "staff", "tiers": [
            {"tierKey": "one", "name": "One", "thresholdExp": 0},
            {"tierKey": "two", "name": "Two", "thresholdExp": 0},
        ],
    })
    assert response.status_code == 422


def test_staff_rank_requires_role_metric_and_approved_manual_review(clients):
    admin, _, factory = clients
    admin_headers = login(admin)
    with factory.begin() as db:
        staff = User(username="teacher-rank", official_name="Teacher Rank", email="teacher-rank@example.test",
                     roles=["teacher"], password_hash=passwords.hash("A test password for fixtures only!"))
        db.add(staff)
    with TestClient(app) as teacher_client:
        teacher_headers = login(teacher_client, "teacher-rank@example.test")
        teacher_id = teacher_client.get("/v1/me", headers=teacher_headers).json()["id"]
        with factory.begin() as db:
            db.add(EconomyLedger(user_id=teacher_id, currency="exp", delta=100, source="test",
                idempotency_key="teacher-rank-exp", detail={}))
        policy = admin.post("/v1/admin/rank-policies", headers=admin_headers, json={
            "track": "staff", "tiers": [
                {"tierKey": "starter", "name": "Starter", "thresholdExp": 0},
                {"tierKey": "mentor", "name": "Mentor", "thresholdExp": 100, "roleTasks": [
                    {"taskKey": "correct-practice", "staffRole": "teacher", "title": "Review practice answers",
                     "requirementType": "metric", "eventKey": "practice.correct", "targetCount": 2},
                    {"taskKey": "course-review", "staffRole": "teacher", "title": "Complete course review",
                     "requirementType": "manual_review"},
                ]},
            ],
        })
        assert policy.status_code == 201, policy.text
        active = admin.post(f"/v1/admin/rank-policies/{policy.json()['id']}/activation", headers=admin_headers)
        assert active.status_code == 200, active.text
        before = teacher_client.get("/v1/me/wallet", headers=teacher_headers).json()["ranks"][0]
        assert before["current"]["key"] == "starter"
        metric = next(item for item in before["nextRequirements"] if item["taskKey"] == "correct-practice")
        assert metric["progress"] == 0 and not metric["completed"]
        with factory() as db:
            actor = db.get(User, teacher_id)
            assert actor
            request = Request({
                "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
                "method": "POST", "scheme": "http", "path": "/v1/trusted-event",
                "raw_path": b"/v1/trusted-event", "query_string": b"", "headers": [],
                "client": ("127.0.0.1", 4321), "server": ("127.0.0.1", 8100),
            })
            request.state.request_id = "83b9f22a-2bf4-4962-bfe9-2ce28b7524a2"
            record_domain_event(db, request, actor, "practice.correct", "rank-metric-1")
            record_domain_event(db, request, actor, "practice.correct", "rank-metric-1")
            record_domain_event(db, request, actor, "practice.correct", "rank-metric-2")
            db.commit()
        with factory() as db:
            assert db.scalar(select(func.count()).select_from(RankTaskMetricReceipt).where(
                RankTaskMetricReceipt.user_id == teacher_id)) == 2
        progress = teacher_client.get("/v1/me/wallet", headers=teacher_headers).json()["ranks"][0]
        assert progress["current"]["key"] == "starter"
        assert next(item for item in progress["nextRequirements"] if item["taskKey"] == "correct-practice")["completed"]
        review_task = next(item for item in progress["nextRequirements"] if item["taskKey"] == "course-review")
        assert review_task["canRequest"]
        requested = teacher_client.post("/v1/me/rank-task-requests", headers=teacher_headers | {"Idempotency-Key": "teacher-review-claim"}, json={
            "policyId": policy.json()["id"], "tierKey": "mentor", "taskKey": "course-review",
            "evidence": "Completed the course review and documented follow-up actions.",
        })
        assert requested.status_code == 201, requested.text
        requests = admin.get("/v1/admin/rank-task-requests?status=pending", headers=admin_headers).json()["items"]
        assert requests[0]["id"] == requested.json()["id"]
        decision = admin.post(f"/v1/admin/rank-task-requests/{requested.json()['id']}/decisions", headers=admin_headers, json={
            "decision": "approve", "reason": "Evidence verified against the course audit record.",
        })
        assert decision.status_code == 200, decision.text
        final = teacher_client.get("/v1/me/wallet", headers=teacher_headers).json()["ranks"][0]
        assert final["current"]["key"] == "mentor"
