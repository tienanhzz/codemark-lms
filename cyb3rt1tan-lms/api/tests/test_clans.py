"""Clan cards, one-clan membership, roles and server-awarded Clan EXP."""

from sqlalchemy import select
from test_access import login
from test_courses import setup_course

from app.models import Clan, EconomyLedger, InventoryItem


def _item(admin, headers, key, effect):
    response = admin.post(
        "/v1/admin/shop/items",
        headers=headers,
        json={
            "itemKey": key,
            "name": key.replace("-", " ").title(),
            "priceCoin": 2,
            "stock": 5,
            "purchaseLimit": 2,
            "eligibleRoles": [],
            "effectType": effect,
            "tradeable": False,
        },
    )
    assert response.status_code == 201, response.text
    purchased = admin.post(
        "/v1/shop/purchases",
        headers=headers | {"Idempotency-Key": f"purchase-{key}"},
        json={"itemId": response.json()["id"], "quantity": 1},
    )
    assert purchased.status_code == 201, purchased.text
    return purchased.json()["itemId"]


def _inventory_id(factory, user_id, item_id):
    with factory() as db:
        item = db.scalar(
            select(InventoryItem).where(
                InventoryItem.user_id == user_id, InventoryItem.item_id == item_id
            )
        )
        assert item
        return item.id


def test_clan_create_join_role_rename_and_admin_exp(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    student_headers = login(student, "student")
    admin_id = admin.get("/v1/me", headers=admin_headers).json()["id"]
    student_id = student.get("/v1/me", headers=student_headers).json()["id"]
    with factory.begin() as db:
        db.add(
            EconomyLedger(
                user_id=admin_id,
                currency="coin",
                delta=10,
                source="test.grant",
                idempotency_key="clan-test-funds",
                reason="test",
            )
        )
    create_item_id = _item(admin, admin_headers, "clan-create-card", "create-clan")
    rename_item_id = _item(admin, admin_headers, "clan-rename-card", "rename-clan")
    create_inv = _inventory_id(factory, admin_id, create_item_id)
    rename_inv = _inventory_id(factory, admin_id, rename_item_id)
    clan = admin.post(
        "/v1/clans",
        headers=admin_headers,
        json={"name": "Cyan Scholars", "inventoryId": create_inv},
    )
    assert clan.status_code == 201, clan.text
    clan_id = clan.json()["id"]
    assert clan.json()["memberCount"] == 1
    policy = admin.post(
        "/v1/admin/clan-policies",
        headers=admin_headers,
        json={
            "levels": [
                {
                    "level": 1,
                    "thresholdExp": 0,
                    "memberCap": 20,
                    "icon": "fa-shield",
                    "color": "#176b87",
                },
                {
                    "level": 2,
                    "thresholdExp": 100,
                    "memberCap": 25,
                    "icon": "fa-crown",
                    "color": "#c79425",
                },
                {
                    "level": 3,
                    "thresholdExp": 300,
                    "memberCap": 30,
                    "icon": "fa-dragon",
                    "color": "#af4b3e",
                },
            ]
        },
    )
    assert policy.status_code == 201, policy.text
    activated_policy = admin.post(
        f"/v1/admin/clan-policies/{policy.json()['id']}/activation", headers=admin_headers
    )
    assert activated_policy.status_code == 200, activated_policy.text
    with factory() as db:
        assert db.get(InventoryItem, create_inv).status == "used"
    candidates = admin.get(
        f"/v1/clans/{clan_id}/invite-candidates?query=student", headers=admin_headers
    )
    assert candidates.status_code == 200, candidates.text
    assert any(item["userId"] == student_id for item in candidates.json()["items"])
    assert (
        student.post(f"/v1/clans/{clan_id}/join-requests", headers=student_headers).status_code
        == 201
    )
    state = admin.get(f"/v1/clans/{clan_id}", headers=admin_headers).json()
    request_id = state["pending"][0]["id"]
    approved = admin.post(
        f"/v1/clans/{clan_id}/membership-decisions",
        headers=admin_headers,
        json={"requestId": request_id, "decision": "approve"},
    )
    assert approved.status_code == 200 and approved.json()["status"] == "active"
    role = admin.post(
        f"/v1/clans/{clan_id}/roles",
        headers=admin_headers,
        json={"roleKey": "steward", "name": "Steward", "permissions": ["activities.manage"]},
    )
    assert role.status_code == 201, role.text
    assert (
        admin.put(
            f"/v1/clans/{clan_id}/members/{student_id}/role",
            headers=admin_headers,
            json={"roleKey": "steward"},
        ).status_code
        == 200
    )
    renamed = admin.post(
        f"/v1/clans/{clan_id}/rename",
        headers=admin_headers,
        json={"newName": "Cyan Builders", "inventoryId": rename_inv},
    )
    assert renamed.status_code == 200 and renamed.json()["name"] == "Cyan Builders"
    collision = student.post(f"/v1/clans/{clan_id}/join-requests", headers=student_headers)
    assert collision.status_code == 409
    exp = admin.post(
        f"/v1/admin/clans/{clan_id}/exp",
        headers=admin_headers | {"Idempotency-Key": "clan-exp-award-1"},
        json={"delta": 500, "reason": "Approved clan mission reward"},
    )
    assert exp.status_code == 200 and exp.json()["level"] == 3
    replay = admin.post(
        f"/v1/admin/clans/{clan_id}/exp",
        headers=admin_headers | {"Idempotency-Key": "clan-exp-award-1"},
        json={"delta": 500, "reason": "Approved clan mission reward"},
    )
    assert replay.status_code == 200 and replay.json()["replayed"] is True
    leaderboard = student.get("/v1/clans/leaderboard", headers=student_headers)
    assert leaderboard.status_code == 200 and leaderboard.json()["items"][0]["clanExp"] == 500
    assert student.get(f"/v1/clans/{clan_id}", headers=student_headers).json()["isMember"] is True
    transfer = admin.post(
        f"/v1/clans/{clan_id}/owner-transfer",
        headers=admin_headers,
        json={"userId": student_id},
    )
    assert transfer.status_code == 200 and transfer.json()["ownerId"] == student_id
    assert admin.post(f"/v1/clans/{clan_id}/leave", headers=admin_headers).status_code == 200


def test_clan_policy_requires_level_one_zero_threshold(clients):
    admin, _, _ = clients
    headers = login(admin)
    invalid = admin.post(
        "/v1/admin/clan-policies",
        headers=headers,
        json={
            "levels": [
                {"level": 1, "thresholdExp": 50, "memberCap": 20},
            ]
        },
    )
    assert invalid.status_code == 422


def test_clan_name_and_effect_type_are_enforced(clients):
    admin, _, factory = clients
    headers = login(admin)
    user_id = admin.get("/v1/me", headers=headers).json()["id"]
    with factory.begin() as db:
        db.add(
            EconomyLedger(
                user_id=user_id,
                currency="coin",
                delta=5,
                source="test.grant",
                idempotency_key="clan-negative-funds",
                reason="test",
            )
        )
    item_id = _item(admin, headers, "clan-invalid-card", "cosmetic")
    inventory_id = _inventory_id(factory, user_id, item_id)
    assert (
        admin.post(
            "/v1/clans", headers=headers, json={"name": "admin", "inventoryId": inventory_id}
        ).status_code
        == 422
    )
    valid_name = admin.post(
        "/v1/clans", headers=headers, json={"name": "A Good Clan", "inventoryId": inventory_id}
    )
    assert valid_name.status_code == 409


def test_admin_clan_war_result_awards_once_and_updates_record(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    student_headers = login(student, "student")
    admin_id = admin.get("/v1/me", headers=admin_headers).json()["id"]
    student_id = student.get("/v1/me", headers=student_headers).json()["id"]
    with factory.begin() as db:
        db.add_all(
            [
                EconomyLedger(
                    user_id=admin_id,
                    currency="coin",
                    delta=10,
                    source="test.grant",
                    idempotency_key="war-funds-a",
                    reason="test",
                ),
                EconomyLedger(
                    user_id=student_id,
                    currency="coin",
                    delta=10,
                    source="test.grant",
                    idempotency_key="war-funds-b",
                    reason="test",
                ),
            ]
        )
    a_item = _item(admin, admin_headers, "war-clan-card-a", "create-clan")
    b_catalog = admin.post(
        "/v1/admin/shop/items",
        headers=admin_headers,
        json={
            "itemKey": "war-clan-card-b",
            "name": "War clan card B",
            "priceCoin": 2,
            "stock": 5,
            "purchaseLimit": 2,
            "eligibleRoles": [],
            "effectType": "create-clan",
            "tradeable": False,
        },
    )
    assert b_catalog.status_code == 201, b_catalog.text
    b_purchase = student.post(
        "/v1/shop/purchases",
        headers=student_headers | {"Idempotency-Key": "war-buy-clan-b"},
        json={"itemId": b_catalog.json()["id"], "quantity": 1},
    )
    assert b_purchase.status_code == 201, b_purchase.text
    a_inv = _inventory_id(factory, admin_id, a_item)
    b_inv = _inventory_id(factory, student_id, b_purchase.json()["itemId"])
    a = admin.post(
        "/v1/clans", headers=admin_headers, json={"name": "War Alpha", "inventoryId": a_inv}
    )
    b = student.post(
        "/v1/clans", headers=student_headers, json={"name": "War Bravo", "inventoryId": b_inv}
    )
    assert a.status_code == b.status_code == 201
    reward_item = admin.post(
        "/v1/admin/shop/items",
        headers=admin_headers,
        json={
            "itemKey": "war-participant-prize",
            "name": "Competition prize",
            "priceCoin": 0,
            "stock": 2,
            "purchaseLimit": 10,
            "eligibleRoles": [],
            "effectType": "cosmetic",
            "tradeable": False,
        },
    )
    assert reward_item.status_code == 201, reward_item.text
    war = admin.post(
        "/v1/admin/clan-wars",
        headers=admin_headers,
        json={
            "title": "Opening match",
            "clanAId": a.json()["id"],
            "clanBId": b.json()["id"],
            "startsAt": "2020-01-01T00:00:00Z",
            "expReward": 80,
            "competitionType": "code",
            "rewardExp": 10,
            "rewardCoin": 2,
            "rewardItemId": reward_item.json()["id"],
            "rewardItemQuantity": 1,
        },
    )
    assert war.status_code == 201, war.text
    result_url = f"/v1/admin/clan-wars/{war.json()['id']}/results"
    invalid_participant = admin.post(
        result_url,
        headers=admin_headers,
        json={
            "outcome": "clan_a",
            "participantIds": ["00000000-0000-4000-8000-000000009999"],
        },
    )
    assert invalid_participant.status_code == 422
    result_body = {"outcome": "clan_a", "participantIds": [admin_id, student_id]}
    saved = admin.post(result_url, headers=admin_headers, json=result_body)
    assert saved.status_code == 200, saved.text
    replay = admin.post(result_url, headers=admin_headers, json=result_body)
    assert replay.status_code == 200 and replay.json()["status"] == "completed"
    assert replay.json()["participantsAwarded"] == 2
    record = student.get("/v1/clans/leaderboard", headers=student_headers).json()["items"]
    alpha = next(item for item in record if item["clanId"] == a.json()["id"])
    assert alpha["warRecord"] == {"wins": 1, "losses": 0, "draws": 0}
    assert alpha["clanExp"] == 80
    assert admin.get("/v1/me/wallet", headers=admin_headers).json()["exp"] == 10
    assert student.get("/v1/me/wallet", headers=student_headers).json()["exp"] == 10
    assert admin.get("/v1/me/wallet", headers=admin_headers).json()["coin"] == 10
    assert student.get("/v1/me/wallet", headers=student_headers).json()["coin"] == 10
    with factory() as db:
        assert db.scalar(
            select(InventoryItem).where(
                InventoryItem.user_id == admin_id,
                InventoryItem.item_id == reward_item.json()["id"],
                InventoryItem.status == "available",
            )
        )
        assert db.scalar(
            select(InventoryItem).where(
                InventoryItem.user_id == student_id,
                InventoryItem.item_id == reward_item.json()["id"],
                InventoryItem.status == "available",
            )
        )


def test_course_staff_clan_war_proposal_requires_admin_decision(clients):
    admin, student, factory = clients
    admin_headers, course, _ = setup_course(admin)
    admin_id = admin.get("/v1/me", headers=admin_headers).json()["id"]
    a_id = "00000000-0000-4000-8000-000000000541"
    b_id = "00000000-0000-4000-8000-000000000542"
    with factory.begin() as db:
        db.add_all(
            [
                Clan(id=a_id, name="Proposal Alpha", name_key="proposal alpha", owner_id=admin_id),
                Clan(id=b_id, name="Proposal Bravo", name_key="proposal bravo", owner_id=admin_id),
            ]
        )
    body = {
        "title": "Course championship",
        "description": "End of term Clan event.",
        "clanAId": a_id,
        "clanBId": b_id,
        "startsAt": "2020-01-01T00:00:00Z",
    }
    proposal_response = admin.post(
        f"/v1/courses/{course['id']}/clan-war-proposals", headers=admin_headers, json=body
    )
    assert proposal_response.status_code == 201, proposal_response.text
    proposal_id = proposal_response.json()["id"]
    pending = admin.get("/v1/admin/clan-war-proposals", headers=admin_headers)
    assert pending.status_code == 200 and len(pending.json()["items"]) == 1
    decision_url = f"/v1/admin/clan-war-proposals/{proposal_id}/decisions"
    approved = admin.post(
        decision_url, headers=admin_headers, json={"decision": "approve", "expReward": 55}
    )
    assert approved.status_code == 200, approved.text
    replay = admin.post(
        decision_url, headers=admin_headers, json={"decision": "approve", "expReward": 0}
    )
    assert replay.status_code == 200 and replay.json()["warId"] == approved.json()["warId"]
    wars = admin.get("/v1/clan-wars", headers=admin_headers).json()["items"]
    assert len(wars) == 1 and wars[0]["expReward"] == 55
    student_response = student.post(
        f"/v1/courses/{course['id']}/clan-war-proposals",
        headers=login(student, "student"),
        json=body,
    )
    assert student_response.status_code == 404
