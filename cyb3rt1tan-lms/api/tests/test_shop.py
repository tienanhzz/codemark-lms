"""Shop purchases debit Coin and grant bound inventory exactly once."""

from datetime import timedelta

from sqlalchemy import func, select
from starlette.requests import Request
from test_access import login

from app.economy_rewards import record_exp_reward
from app.missions import record_domain_event
from app.models import (
    EconomyLedger,
    InventoryItem,
    MissionProgress,
    MissionStreakBoost,
    ShopItem,
    ShopPurchase,
    ShopRefund,
    User,
    UserEquippedShopTitle,
    UserExpMultiplier,
    now,
)


def _trusted_event_request() -> Request:
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


def test_shop_purchase_is_idempotent_and_grants_inventory_atomically(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    student_headers = login(student, "student")
    learner_id = student.get("/v1/me", headers=student_headers).json()["id"]
    item = admin.post(
        "/v1/admin/shop/items",
        headers=admin_headers,
        json={
            "itemKey": "test-frame",
            "name": "Test frame",
            "priceCoin": 20,
            "stock": 2,
            "purchaseLimit": 1,
            "eligibleRoles": ["student"],
            "effectType": "cosmetic",
            "description": "A test cosmetic",
        },
    )
    assert item.status_code == 201, item.text
    with factory() as db:
        db.add(
            EconomyLedger(
                user_id=learner_id,
                currency="coin",
                delta=25,
                source="test.grant",
                idempotency_key="shop-test-grant",
                reason="test",
            )
        )
        db.commit()
    headers = student_headers | {"Idempotency-Key": "shop-test-purchase-1"}
    payload = {"itemId": item.json()["id"], "quantity": 1}
    first = student.post("/v1/shop/purchases", headers=headers, json=payload)
    replay = student.post("/v1/shop/purchases", headers=headers, json=payload)
    assert first.status_code == 201, first.text
    assert replay.status_code == 201 and replay.json()["replayed"] is True
    assert replay.json()["purchaseId"] == first.json()["purchaseId"]
    assert student.get("/v1/me/wallet", headers=student_headers).json()["coin"] == 5
    assert len(student.get("/v1/me/inventory", headers=student_headers).json()["items"]) == 1
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(ShopPurchase)) == 1
        assert (
            db.scalar(
                select(func.count())
                .select_from(InventoryItem)
                .where(InventoryItem.user_id == learner_id)
            )
            == 1
        )
        assert db.get(User, learner_id) is not None


def test_shop_refund_policy_reserves_items_and_approval_restores_coin_exp_and_stock(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    student_headers = login(student, "student")
    learner_id = student.get("/v1/me", headers=student_headers).json()["id"]
    published = admin.post(
        "/v1/admin/shop/refund-policies",
        headers=admin_headers,
        json={
            "enabled": True,
            "refundWindowHours": 48,
            "unusedOnly": True,
        },
    )
    assert published.status_code == 201, published.text
    assert published.json() == {
        "version": 2,
        "enabled": True,
        "refundWindowHours": 48,
        "unusedOnly": True,
    }
    item = admin.post(
        "/v1/admin/shop/items",
        headers=admin_headers,
        json={
            "itemKey": "refundable-dual-item",
            "name": "Refundable item",
            "priceCoin": 7,
            "priceExp": 20,
            "stock": 2,
            "purchaseLimit": 1,
            "eligibleRoles": ["student"],
            "effectType": "cosmetic",
        },
    )
    assert item.status_code == 201, item.text
    with factory() as db:
        db.add_all(
            [
                EconomyLedger(
                    user_id=learner_id,
                    currency="coin",
                    delta=10,
                    source="test.grant",
                    idempotency_key="refund-coin-grant",
                    reason="test",
                ),
                EconomyLedger(
                    user_id=learner_id,
                    currency="exp",
                    delta=30,
                    source="test.grant",
                    idempotency_key="refund-exp-grant",
                    reason="test",
                ),
            ]
        )
        db.commit()
    purchase = student.post(
        "/v1/shop/purchases",
        headers=student_headers
        | {
            "Idempotency-Key": "refund-shop-purchase-1",
        },
        json={"itemId": item.json()["id"], "quantity": 1},
    )
    assert purchase.status_code == 201, purchase.text
    with factory() as db:
        saved_purchase = db.get(ShopPurchase, purchase.json()["purchaseId"])
        assert saved_purchase and saved_purchase.refund_policy_version == 2
    request_headers = student_headers
    refund_response = student.post(
        f"/v1/shop/purchases/{purchase.json()['purchaseId']}/refund-requests",
        headers=request_headers,
        json={"reason": "The item was purchased by mistake."},
    )
    assert refund_response.status_code == 201, refund_response.text
    assert refund_response.json()["status"] == "pending"
    assert (
        student.get("/v1/me/inventory", headers=student_headers).json()["items"][0]["status"]
        == "reserved"
    )
    queue = admin.get("/v1/admin/shop/refunds", headers=admin_headers)
    assert queue.status_code == 200 and queue.json()["items"][0]["itemName"] == "Refundable item"
    decision_headers = admin_headers | {"Idempotency-Key": "refund-review-decision-1"}
    path = f"/v1/admin/shop/refunds/{refund_response.json()['id']}/decisions"
    approved = admin.post(path, headers=decision_headers, json={"decision": "approve"})
    replay = admin.post(path, headers=decision_headers, json={"decision": "approve"})
    assert approved.status_code == replay.status_code == 200
    assert approved.json()["status"] == "approved" and replay.json()["replayed"] is True
    assert student.get("/v1/me/wallet", headers=student_headers).json()["coin"] == 10
    assert student.get("/v1/me/wallet", headers=student_headers).json()["exp"] == 30
    with factory() as db:
        refund_row = db.get(ShopRefund, refund_response.json()["id"])
        shop_item = db.get(ShopItem, item.json()["id"])
        assert refund_row and refund_row.status == "approved"
        assert shop_item and shop_item.stock == 2
        assert (
            db.scalar(select(InventoryItem).where(InventoryItem.user_id == learner_id)).status
            == "refunded"
        )
        credits = list(
            db.scalars(
                select(EconomyLedger).where(
                    EconomyLedger.user_id == learner_id, EconomyLedger.source == "shop.refund"
                )
            )
        )
        assert {(row.currency, row.delta) for row in credits} == {("coin", 7), ("exp", 20)}
    repurchase = student.post(
        "/v1/shop/purchases",
        headers=student_headers | {"Idempotency-Key": "refund-shop-repurchase-1"},
        json={"itemId": item.json()["id"], "quantity": 1},
    )
    assert repurchase.status_code == 201, repurchase.text


def test_shop_title_charges_coin_and_exp_atomically(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    student_headers = login(student, "student")
    student_id = student.get("/v1/me", headers=student_headers).json()["id"]
    item = admin.post(
        "/v1/admin/shop/items",
        headers=admin_headers,
        json={
            "itemKey": "dual-currency-title",
            "name": "Dual price title",
            "priceCoin": 2,
            "priceExp": 50,
            "stock": 2,
            "purchaseLimit": 2,
            "eligibleRoles": ["student"],
            "effectType": "title-token",
            "effectConfig": {"title": "Veteran Learner"},
        },
    )
    assert item.status_code == 201, item.text
    assert item.json()["priceExp"] == 50
    with factory.begin() as db:
        db.add_all(
            [
                EconomyLedger(
                    user_id=student_id,
                    currency="coin",
                    delta=10,
                    source="test.grant",
                    idempotency_key="dual-price-coin-funds",
                    reason="test",
                ),
                EconomyLedger(
                    user_id=student_id,
                    currency="exp",
                    delta=60,
                    source="test.grant",
                    idempotency_key="dual-price-exp-funds",
                    reason="test",
                ),
            ]
        )
    purchase = student.post(
        "/v1/shop/purchases",
        headers=student_headers | {"Idempotency-Key": "dual-price-first"},
        json={"itemId": item.json()["id"], "quantity": 1},
    )
    assert purchase.status_code == 201, purchase.text
    assert purchase.json()["totalCoin"] == 2 and purchase.json()["totalExp"] == 50
    insufficient = student.post(
        "/v1/shop/purchases",
        headers=student_headers | {"Idempotency-Key": "dual-price-second"},
        json={"itemId": item.json()["id"], "quantity": 1},
    )
    assert insufficient.status_code == 409, insufficient.text
    wallet = student.get("/v1/me/wallet", headers=student_headers).json()
    assert wallet["coin"] == 8 and wallet["exp"] == 10
    with factory() as db:
        rows = db.scalars(
            select(EconomyLedger).where(
                EconomyLedger.user_id == student_id,
                EconomyLedger.source == "shop.purchase",
            )
        ).all()
        assert len(rows) == 2
        assert {row.currency: row.delta for row in rows} == {"coin": -2, "exp": -50}


def test_exp_voucher_uses_configured_server_amount_once(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    student_headers = login(student, "student")
    learner_id = student.get("/v1/me", headers=student_headers).json()["id"]
    item = admin.post(
        "/v1/admin/shop/items",
        headers=admin_headers,
        json={
            "itemKey": "test-exp-voucher",
            "name": "Test EXP Voucher",
            "priceCoin": 5,
            "stock": 1,
            "purchaseLimit": 1,
            "eligibleRoles": ["student"],
            "effectType": "exp-voucher",
            "effectConfig": {"exp": 650},
            "tradeable": False,
        },
    )
    assert item.status_code == 201, item.text
    with factory.begin() as db:
        db.add(
            EconomyLedger(
                user_id=learner_id,
                currency="coin",
                delta=10,
                source="test.grant",
                idempotency_key="voucher-test-funds",
                reason="test",
            )
        )
    purchase = student.post(
        "/v1/shop/purchases",
        headers=student_headers | {"Idempotency-Key": "voucher-test-purchase"},
        json={"itemId": item.json()["id"], "quantity": 1},
    )
    assert purchase.status_code == 201, purchase.text
    with factory() as db:
        inventory_item = db.scalar(select(InventoryItem).where(InventoryItem.user_id == learner_id))
        assert inventory_item
        inventory_id = inventory_item.id
    first = student.post(f"/v1/inventory/{inventory_id}/activations", headers=student_headers)
    assert first.status_code == 200, first.text
    replay = student.post(f"/v1/inventory/{inventory_id}/activations", headers=student_headers)
    assert replay.status_code == 409
    assert student.get("/v1/me/wallet", headers=student_headers).json()["exp"] == 650
    with factory() as db:
        rows = db.scalars(
            select(EconomyLedger).where(
                EconomyLedger.user_id == learner_id, EconomyLedger.source == "shop.exp_voucher"
            )
        ).all()
        assert len(rows) == 1 and rows[0].delta == 650


def test_exp_voucher_config_is_allowlisted_and_bound(clients):
    admin, _, _ = clients
    headers = login(admin)
    base = {
        "itemKey": "unsafe-voucher",
        "name": "Voucher",
        "priceCoin": 1,
        "stock": 1,
        "purchaseLimit": 1,
        "effectType": "exp-voucher",
    }
    extra = admin.post(
        "/v1/admin/shop/items",
        headers=headers,
        json={**base, "effectConfig": {"exp": 10, "script": "grant_admin"}},
    )
    transferable = admin.post(
        "/v1/admin/shop/items",
        headers=headers,
        json={
            **base,
            "itemKey": "tradable-voucher",
            "effectConfig": {"exp": 10},
            "tradeable": True,
        },
    )
    assert extra.status_code == 422
    assert transferable.status_code == 422


def test_scheduled_shop_discount_prices_purchase_server_side_and_can_be_cleared(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    student_headers = login(student, "student")
    learner_id = student.get("/v1/me", headers=student_headers).json()["id"]
    start = now() - timedelta(minutes=5)
    end = now() + timedelta(hours=1)
    item = admin.post(
        "/v1/admin/shop/items",
        headers=admin_headers,
        json={
            "itemKey": "scheduled-discount",
            "name": "Scheduled discount",
            "priceCoin": 80,
            "stock": 2,
            "purchaseLimit": 2,
            "eligibleRoles": ["student"],
            "effectType": "cosmetic",
            "discountPercent": 50,
            "discountStartsAt": start.isoformat(),
            "discountEndsAt": end.isoformat(),
        },
    )
    assert item.status_code == 201, item.text
    assert item.json()["currentPriceCoin"] == 40 and item.json()["discountActive"] is True
    with factory.begin() as db:
        db.add(
            EconomyLedger(
                user_id=learner_id,
                currency="coin",
                delta=100,
                source="test.grant",
                idempotency_key="discount-test-funds",
                reason="test",
            )
        )
    catalog = student.get("/v1/shop/items", headers=student_headers).json()["items"]
    discounted = next(row for row in catalog if row["id"] == item.json()["id"])
    assert discounted["priceCoin"] == 80 and discounted["currentPriceCoin"] == 40
    purchased = student.post(
        "/v1/shop/purchases",
        headers=student_headers | {"Idempotency-Key": "discount-purchase"},
        json={"itemId": item.json()["id"], "quantity": 1},
    )
    assert purchased.status_code == 201, purchased.text
    assert purchased.json()["unitPriceCoin"] == 40 and purchased.json()["totalCoin"] == 40
    assert student.get("/v1/me/wallet", headers=student_headers).json()["coin"] == 60
    cleared = admin.patch(
        f"/v1/admin/shop/items/{item.json()['id']}/discount",
        headers=admin_headers,
        json={"discountPercent": 0},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["discountActive"] is False and cleared.json()["currentPriceCoin"] == 80


def test_shop_discount_rejects_missing_or_invalid_time_window(clients):
    admin, _, _ = clients
    headers = login(admin)
    base = {
        "itemKey": "invalid-discount",
        "name": "Invalid",
        "priceCoin": 80,
        "stock": 1,
        "purchaseLimit": 1,
        "effectType": "cosmetic",
        "discountPercent": 10,
    }
    missing = admin.post("/v1/admin/shop/items", headers=headers, json=base)
    reversed_window = admin.post(
        "/v1/admin/shop/items",
        headers=headers,
        json={
            **base,
            "itemKey": "reversed-discount",
            "discountStartsAt": "2026-11-17T00:00:00Z",
            "discountEndsAt": "2026-11-16T00:00:00Z",
        },
    )
    assert missing.status_code == 422
    assert reversed_window.status_code == 422


def test_exp_multiplier_item_extends_boost_and_doubles_trusted_exp(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    student_headers = login(student, "student")
    learner_id = student.get("/v1/me", headers=student_headers).json()["id"]
    item = admin.post(
        "/v1/admin/shop/items",
        headers=admin_headers,
        json={
            "itemKey": "test-exp-multiplier",
            "name": "Test x2 EXP",
            "priceCoin": 5,
            "stock": 2,
            "purchaseLimit": 2,
            "eligibleRoles": ["student"],
            "effectType": "exp-multiplier",
            "effectConfig": {"multiplier": 2, "durationHours": 8},
            "tradeable": False,
        },
    )
    assert item.status_code == 201, item.text
    with factory.begin() as db:
        db.add(
            EconomyLedger(
                user_id=learner_id,
                currency="coin",
                delta=20,
                source="test.grant",
                idempotency_key="multiplier-test-funds",
                reason="test",
            )
        )
    for purchase_index in range(2):
        purchase = student.post(
            "/v1/shop/purchases",
            headers=student_headers
            | {"Idempotency-Key": f"multiplier-test-purchase-{purchase_index}"},
            json={"itemId": item.json()["id"], "quantity": 1},
        )
        assert purchase.status_code == 201, purchase.text
    with factory() as db:
        inventory_ids = list(
            db.scalars(
                select(InventoryItem.id)
                .where(InventoryItem.user_id == learner_id)
                .order_by(InventoryItem.acquired_at)
            )
        )
    assert len(inventory_ids) == 2
    first = student.post(f"/v1/inventory/{inventory_ids[0]}/activations", headers=student_headers)
    assert first.status_code == 200, first.text
    first_end = first.json()["endsAt"]
    assert student.get("/v1/me/wallet", headers=student_headers).json()["expMultiplier"] == 2
    second = student.post(f"/v1/inventory/{inventory_ids[1]}/activations", headers=student_headers)
    assert second.status_code == 200, second.text
    assert second.json()["endsAt"] > first_end
    with factory.begin() as db:
        credited = record_exp_reward(
            db,
            user_id=learner_id,
            amount=100,
            source="test.multiplied_reward",
            idempotency_key="test-multiplied-reward",
            reason="test reward",
        )
        assert credited == 200
    wallet = student.get("/v1/me/wallet", headers=student_headers).json()
    assert wallet["exp"] == 200
    assert wallet["expMultiplier"] == 2 and wallet["expMultiplierEndsAt"] is not None
    with factory() as db:
        boost = db.get(UserExpMultiplier, learner_id)
        assert boost is not None and boost.multiplier == 2
        rows = db.scalars(
            select(EconomyLedger).where(
                EconomyLedger.user_id == learner_id,
                EconomyLedger.idempotency_key == "test-multiplied-reward",
            )
        ).all()
        assert len(rows) == 1 and rows[0].delta == 200


def test_exp_multiplier_configuration_is_bound_and_restricted_to_x2(clients):
    admin, _, _ = clients
    headers = login(admin)
    base = {
        "itemKey": "unsafe-exp-multiplier",
        "name": "Timed boost",
        "priceCoin": 1,
        "stock": 1,
        "purchaseLimit": 1,
        "effectType": "exp-multiplier",
    }
    extra = admin.post(
        "/v1/admin/shop/items",
        headers=headers,
        json={
            **base,
            "effectConfig": {"multiplier": 2, "durationHours": 8, "script": "grant_admin"},
        },
    )
    transferable = admin.post(
        "/v1/admin/shop/items",
        headers=headers,
        json={
            **base,
            "itemKey": "tradable-exp-multiplier",
            "effectConfig": {"multiplier": 2, "durationHours": 8},
            "tradeable": True,
        },
    )
    too_high = admin.post(
        "/v1/admin/shop/items",
        headers=headers,
        json={
            **base,
            "itemKey": "uncapped-exp-multiplier",
            "effectConfig": {"multiplier": 3, "durationHours": 8},
        },
    )
    assert extra.status_code == 422
    assert transferable.status_code == 422
    assert too_high.status_code == 422


def test_streak_boost_sets_three_and_rewards_only_after_next_mission_event(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    student_headers = login(student, "student")
    student_id = student.get("/v1/me", headers=student_headers).json()["id"]
    mission = admin.post(
        "/v1/admin/missions",
        headers=admin_headers,
        json={
            "missionId": "streak-target",
            "version": 1,
            "title": "Practice four times",
            "eventKey": "practice.attempt",
            "targetCount": 4,
            "cadence": "daily",
            "timeZone": "Asia/Bangkok",
            "eligibleRoles": ["student"],
            "reward": {"exp": 40, "coin": 5},
        },
    )
    assert mission.status_code == 201, mission.text
    item = admin.post(
        "/v1/admin/shop/items",
        headers=admin_headers,
        json={
            "itemKey": "test-streak-card",
            "name": "Practice streak card",
            "priceCoin": 5,
            "stock": 1,
            "purchaseLimit": 1,
            "eligibleRoles": ["student"],
            "effectType": "streak-boost",
            "effectConfig": {"missionId": "streak-target", "durationHours": 1},
            "tradeable": False,
        },
    )
    assert item.status_code == 201, item.text
    with factory.begin() as db:
        db.add(
            EconomyLedger(
                user_id=student_id,
                currency="coin",
                delta=10,
                source="test.grant",
                idempotency_key="streak-card-test-funds",
                reason="test",
            )
        )
    bought = student.post(
        "/v1/shop/purchases",
        headers=student_headers | {"Idempotency-Key": "streak-card-test-purchase"},
        json={"itemId": item.json()["id"], "quantity": 1},
    )
    assert bought.status_code == 201, bought.text
    inventory_id = student.get("/v1/me/inventory", headers=student_headers).json()["items"][0]["id"]
    activated = student.post(f"/v1/inventory/{inventory_id}/activations", headers=student_headers)
    assert activated.status_code == 200, activated.text
    assert activated.json()["progress"] == 3
    assert student.get("/v1/me/wallet", headers=student_headers).json()["exp"] == 0
    with factory.begin() as db:
        learner = db.get(User, student_id)
        assert learner
        record_domain_event(
            db, _trusted_event_request(), learner, "practice.attempt", "streak-next-action"
        )
    wallet = student.get("/v1/me/wallet", headers=student_headers).json()
    assert wallet["exp"] == 40 and wallet["coin"] == 10
    with factory() as db:
        boost = db.scalar(
            select(MissionStreakBoost).where(MissionStreakBoost.user_id == student_id)
        )
        progress = db.scalar(select(MissionProgress).where(MissionProgress.user_id == student_id))
        assert boost and boost.consumed_at is not None and boost.expired_at is None
        assert progress and progress.progress == 4 and progress.status == "claimed"


def test_expired_streak_card_removes_only_its_granted_progress(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    student_headers = login(student, "student")
    student_id = student.get("/v1/me", headers=student_headers).json()["id"]
    mission = admin.post(
        "/v1/admin/missions",
        headers=admin_headers,
        json={
            "missionId": "streak-expiry-target",
            "version": 1,
            "title": "Practice four times",
            "eventKey": "practice.attempt",
            "targetCount": 4,
            "cadence": "daily",
            "timeZone": "Asia/Bangkok",
            "eligibleRoles": ["student"],
            "reward": {"exp": 40, "coin": 0},
        },
    )
    assert mission.status_code == 201, mission.text
    with factory.begin() as db:
        learner = db.get(User, student_id)
        assert learner
        for index in range(2):
            record_domain_event(
                db,
                _trusted_event_request(),
                learner,
                "practice.attempt",
                f"streak-expiry-base-{index}",
            )
        db.add(
            EconomyLedger(
                user_id=student_id,
                currency="coin",
                delta=10,
                source="test.grant",
                idempotency_key="streak-expiry-funds",
                reason="test",
            )
        )
    item = admin.post(
        "/v1/admin/shop/items",
        headers=admin_headers,
        json={
            "itemKey": "test-expiring-streak-card",
            "name": "Short streak card",
            "priceCoin": 5,
            "stock": 1,
            "purchaseLimit": 1,
            "eligibleRoles": ["student"],
            "effectType": "streak-boost",
            "effectConfig": {"missionId": "streak-expiry-target", "durationHours": 1},
            "tradeable": False,
        },
    )
    assert item.status_code == 201, item.text
    bought = student.post(
        "/v1/shop/purchases",
        headers=student_headers | {"Idempotency-Key": "streak-expiry-purchase"},
        json={"itemId": item.json()["id"], "quantity": 1},
    )
    assert bought.status_code == 201, bought.text
    inventory_id = student.get("/v1/me/inventory", headers=student_headers).json()["items"][0]["id"]
    activated = student.post(f"/v1/inventory/{inventory_id}/activations", headers=student_headers)
    assert activated.status_code == 200 and activated.json()["progress"] == 3
    with factory.begin() as db:
        boost = db.scalar(
            select(MissionStreakBoost).where(MissionStreakBoost.user_id == student_id)
        )
        assert boost
        boost.created_at = now() - timedelta(hours=2)
        boost.expires_at = now() - timedelta(seconds=1)
    missions = student.get("/v1/me/missions", headers=student_headers)
    target = next(
        row for row in missions.json()["items"] if row["missionId"] == "streak-expiry-target"
    )
    assert target["progress"] == 2 and target["streakBoostExpiresAt"] is None
    with factory() as db:
        boost = db.scalar(
            select(MissionStreakBoost).where(MissionStreakBoost.user_id == student_id)
        )
        progress = db.scalar(select(MissionProgress).where(MissionProgress.user_id == student_id))
        assert boost and boost.expired_at is not None and boost.consumed_at is None
        assert progress and progress.progress == 2


def test_purchased_title_can_be_equipped_cleared_and_equipped_again(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    student_headers = login(student, "student")
    student_id = student.get("/v1/me", headers=student_headers).json()["id"]
    title_item = admin.post(
        "/v1/admin/shop/items",
        headers=admin_headers,
        json={
            "itemKey": "test-shop-title",
            "name": "Aurora Title",
            "priceCoin": 5,
            "stock": 1,
            "purchaseLimit": 1,
            "eligibleRoles": ["student"],
            "effectType": "title-token",
            "effectConfig": {"title": "Aurora Scholar"},
            "tradeable": False,
        },
    )
    assert title_item.status_code == 201, title_item.text
    tradable = admin.post(
        "/v1/admin/shop/items",
        headers=admin_headers,
        json={
            "itemKey": "tradable-shop-title",
            "name": "Tradable title",
            "priceCoin": 5,
            "stock": 1,
            "purchaseLimit": 1,
            "effectType": "title-token",
            "effectConfig": {"title": "Should reject"},
            "tradeable": True,
        },
    )
    assert tradable.status_code == 422
    with factory.begin() as db:
        db.add(
            EconomyLedger(
                user_id=student_id,
                currency="coin",
                delta=5,
                source="test.grant",
                idempotency_key="shop-title-test-funds",
                reason="test",
            )
        )
    purchase = student.post(
        "/v1/shop/purchases",
        headers=student_headers | {"Idempotency-Key": "shop-title-test-purchase"},
        json={"itemId": title_item.json()["id"], "quantity": 1},
    )
    assert purchase.status_code == 201, purchase.text
    inventory_id = student.get("/v1/me/inventory", headers=student_headers).json()["items"][0]["id"]
    first = student.post(f"/v1/inventory/{inventory_id}/activations", headers=student_headers)
    assert first.status_code == 200 and first.json()["equipped"] is True
    assert student.get("/v1/me/title", headers=student_headers).json() == {
        "title": "Aurora Scholar",
        "source": "shop",
        "inventoryId": inventory_id,
    }
    inventory = student.get("/v1/me/inventory", headers=student_headers).json()["items"][0]
    assert inventory["status"] == "available" and inventory["equipped"] is True
    assert student.delete("/v1/me/title", headers=student_headers).status_code == 204
    assert student.get("/v1/me/title", headers=student_headers).json() is None
    again = student.post(f"/v1/inventory/{inventory_id}/activations", headers=student_headers)
    assert again.status_code == 200
    with factory() as db:
        assert db.scalar(
            select(UserEquippedShopTitle).where(UserEquippedShopTitle.user_id == student_id)
        )
