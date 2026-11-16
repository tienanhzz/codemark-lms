"""Fixed-price escrow reserves an item and settles Coin atomically."""

from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from test_access import PASSWORD, login

from app.main import app
from app.models import (
    EconomyLedger,
    InventoryItem,
    MarketplaceListing,
    MarketplaceOffer,
    User,
    now,
)
from app.security import passwords


def test_tradeable_inventory_escrow_and_fixed_price_settlement(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    student_headers = login(student, "student")
    admin_id = admin.get("/v1/me", headers=admin_headers).json()["id"]
    student_id = student.get("/v1/me", headers=student_headers).json()["id"]
    created = admin.post(
        "/v1/admin/shop/items",
        headers=admin_headers,
        json={
            "itemKey": "market-frame",
            "name": "Market frame",
            "priceCoin": 5,
            "stock": 1,
            "purchaseLimit": 1,
            "eligibleRoles": [],
            "effectType": "cosmetic",
            "tradeable": True,
        },
    )
    assert created.status_code == 201, created.text
    with factory() as db:
        db.add_all(
            [
                EconomyLedger(
                    user_id=student_id,
                    currency="coin",
                    delta=5,
                    source="test.grant",
                    idempotency_key="market-student-funds",
                    reason="test",
                ),
                EconomyLedger(
                    user_id=admin_id,
                    currency="coin",
                    delta=20,
                    source="test.grant",
                    idempotency_key="market-admin-funds",
                    reason="test",
                ),
            ]
        )
        db.commit()
    bought = student.post(
        "/v1/shop/purchases",
        headers=student_headers | {"Idempotency-Key": "market-shop-buy"},
        json={"itemId": created.json()["id"], "quantity": 1},
    )
    assert bought.status_code == 201, bought.text
    with factory() as db:
        inventory = db.scalar(select(InventoryItem).where(InventoryItem.user_id == student_id))
        assert inventory and inventory.bound is False
        inventory_id = inventory.id
    listing = student.post(
        "/v1/marketplace/listings",
        headers=student_headers | {"Idempotency-Key": "market-list-1"},
        json={"inventoryId": inventory_id, "priceCoin": 12, "expiresInHours": 24},
    )
    assert listing.status_code == 201, listing.text
    assert (
        student.get("/v1/me/inventory", headers=student_headers).json()["items"][0]["status"]
        == "reserved"
    )
    result = admin.post(
        f"/v1/marketplace/listings/{listing.json()['id']}/purchases",
        headers=admin_headers | {"Idempotency-Key": "market-settle-1"},
    )
    assert result.status_code == 200, result.text
    replay = admin.post(
        f"/v1/marketplace/listings/{listing.json()['id']}/purchases",
        headers=admin_headers | {"Idempotency-Key": "market-settle-1"},
    )
    assert replay.status_code == 200 and replay.json()["replayed"] is True
    assert student.get("/v1/me/wallet", headers=student_headers).json()["coin"] == 12
    assert admin.get("/v1/me/wallet", headers=admin_headers).json()["coin"] == 8
    assert (
        admin.get("/v1/me/inventory", headers=admin_headers).json()["items"][0]["status"]
        == "available"
    )
    with factory() as db:
        assert (
            db.scalar(
                select(func.count())
                .select_from(MarketplaceListing)
                .where(MarketplaceListing.status == "sold")
            )
            == 1
        )


def test_coin_offer_reserve_refund_reject_and_accept(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    student_headers = login(student, "student")
    policy = admin.post(
        "/v1/admin/marketplace/policies",
        headers=admin_headers,
        json={
            "listingFeePercent": 0,
            "offerFeePercent": 10,
            "minPriceCoin": 1,
            "maxPriceCoin": 2000000000,
            "maxOfferCoin": 100,
            "listingExpiryHours": 168,
            "offerExpiryHours": 24,
            "maxActiveListings": 10,
            "maxPendingOffers": 10,
        },
    )
    assert policy.status_code == 201, policy.text
    admin_id = admin.get("/v1/me", headers=admin_headers).json()["id"]
    student_id = student.get("/v1/me", headers=student_headers).json()["id"]
    item = admin.post(
        "/v1/admin/shop/items",
        headers=admin_headers,
        json={
            "itemKey": "offer-frame",
            "name": "Offer frame",
            "priceCoin": 5,
            "stock": 1,
            "purchaseLimit": 1,
            "eligibleRoles": [],
            "effectType": "cosmetic",
            "tradeable": True,
        },
    )
    assert item.status_code == 201, item.text
    with factory() as db:
        db.add_all(
            [
                EconomyLedger(
                    user_id=admin_id,
                    currency="coin",
                    delta=5,
                    source="test.grant",
                    idempotency_key="offer-admin-funds",
                    reason="test",
                ),
                EconomyLedger(
                    user_id=student_id,
                    currency="coin",
                    delta=50,
                    source="test.grant",
                    idempotency_key="offer-student-funds",
                    reason="test",
                ),
            ]
        )
        db.commit()
    purchase = admin.post(
        "/v1/shop/purchases",
        headers=admin_headers | {"Idempotency-Key": "offer-shop-buy"},
        json={"itemId": item.json()["id"], "quantity": 1},
    )
    assert purchase.status_code == 201, purchase.text
    with factory() as db:
        asset = db.scalar(select(InventoryItem).where(InventoryItem.user_id == admin_id))
        assert asset and asset.bound is False
        asset_id = asset.id
    listing = admin.post(
        "/v1/marketplace/listings",
        headers=admin_headers | {"Idempotency-Key": "offer-list-1"},
        json={"inventoryId": asset_id, "priceCoin": 10},
    )
    assert listing.status_code == 201, listing.text
    offer_data = {"listingId": listing.json()["id"], "offerCoin": 30}
    offer = student.post(
        "/v1/marketplace/offers",
        headers=student_headers | {"Idempotency-Key": "offer-reject-1"},
        json=offer_data,
    )
    assert offer.status_code == 201, offer.text
    assert student.get("/v1/me/wallet", headers=student_headers).json()["coin"] == 20
    rejected = admin.post(
        f"/v1/marketplace/offers/{offer.json()['offerId']}/decisions",
        headers=admin_headers | {"Idempotency-Key": "offer-decision-reject-1"},
        json={"decision": "reject"},
    )
    assert rejected.status_code == 200 and rejected.json()["status"] == "rejected"
    assert student.get("/v1/me/wallet", headers=student_headers).json()["coin"] == 50
    accepted_offer = student.post(
        "/v1/marketplace/offers",
        headers=student_headers | {"Idempotency-Key": "offer-accept-1"},
        json=offer_data,
    )
    assert accepted_offer.status_code == 201, accepted_offer.text
    offer_view = student.get("/v1/marketplace/offers", headers=student_headers).json()["items"][0]
    assert offer_view["feePercent"] == 10 and offer_view["sellerFeeCoin"] == 3
    accepted = admin.post(
        f"/v1/marketplace/offers/{accepted_offer.json()['offerId']}/decisions",
        headers=admin_headers | {"Idempotency-Key": "offer-decision-accept-1"},
        json={"decision": "accept"},
    )
    assert accepted.status_code == 200 and accepted.json()["status"] == "accepted"
    assert accepted.json()["feeCoin"] == 3 and accepted.json()["sellerProceedsCoin"] == 27
    assert student.get("/v1/me/wallet", headers=student_headers).json()["coin"] == 20
    assert admin.get("/v1/me/wallet", headers=admin_headers).json()["coin"] == 27
    assert (
        student.get("/v1/me/inventory", headers=student_headers).json()["items"][0]["status"]
        == "available"
    )


def test_marketplace_policy_is_versioned_and_fees_are_disclosed_and_burned(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    student_headers = login(student, "student")
    admin_id = admin.get("/v1/me", headers=admin_headers).json()["id"]
    student_id = student.get("/v1/me", headers=student_headers).json()["id"]
    policy_payload = {
        "listingFeePercent": 10,
        "offerFeePercent": 10,
        "minPriceCoin": 1,
        "maxPriceCoin": 1000,
        "maxOfferCoin": 500,
        "listingExpiryHours": 48,
        "offerExpiryHours": 24,
        "maxActiveListings": 3,
        "maxPendingOffers": 4,
    }
    published = admin.post(
        "/v1/admin/marketplace/policies", headers=admin_headers, json=policy_payload
    )
    assert published.status_code == 201, published.text
    assert published.json()["version"] == 2
    assert student.get("/v1/marketplace/policy", headers=student_headers).json() == published.json()
    with factory() as db:
        db.add_all(
            [
                EconomyLedger(
                    user_id=student_id,
                    currency="coin",
                    delta=10,
                    source="test.grant",
                    idempotency_key="market-policy-buyer-funds",
                    reason="test",
                ),
                EconomyLedger(
                    user_id=admin_id,
                    currency="coin",
                    delta=25,
                    source="test.grant",
                    idempotency_key="market-policy-seller-funds",
                    reason="test",
                ),
            ]
        )
        db.commit()
    item = admin.post(
        "/v1/admin/shop/items",
        headers=admin_headers,
        json={
            "itemKey": "market-policy-frame",
            "name": "Policy frame",
            "priceCoin": 2,
            "stock": 1,
            "purchaseLimit": 1,
            "eligibleRoles": [],
            "effectType": "cosmetic",
            "tradeable": True,
        },
    )
    assert item.status_code == 201, item.text
    bought = student.post(
        "/v1/shop/purchases",
        headers=student_headers | {"Idempotency-Key": "market-policy-shop"},
        json={"itemId": item.json()["id"], "quantity": 1},
    )
    assert bought.status_code == 201, bought.text
    with factory() as db:
        inventory = db.scalar(select(InventoryItem).where(InventoryItem.user_id == student_id))
        inventory_id = inventory.id
    listing = student.post(
        "/v1/marketplace/listings",
        headers=student_headers | {"Idempotency-Key": "market-policy-list"},
        json={"inventoryId": inventory_id, "priceCoin": 20, "expiresInHours": 168},
    )
    assert listing.status_code == 201, listing.text
    assert listing.json()["feePercent"] == 10 and listing.json()["sellerFeeCoin"] == 2
    result = admin.post(
        f"/v1/marketplace/listings/{listing.json()['id']}/purchases",
        headers=admin_headers | {"Idempotency-Key": "market-policy-purchase"},
    )
    assert result.status_code == 200, result.text
    assert result.json()["feeCoin"] == 2 and result.json()["sellerProceedsCoin"] == 18
    assert student.get("/v1/me/wallet", headers=student_headers).json()["coin"] == 26
    with factory() as db:
        fee = db.scalar(select(EconomyLedger).where(EconomyLedger.source == "marketplace.fee.burn"))
        listing_row = db.scalar(
            select(MarketplaceListing).where(MarketplaceListing.id == listing.json()["id"])
        )
        assert fee and fee.delta == -2 and fee.detail["policyVersion"] == 2
        assert listing_row and listing_row.policy_version == 2 and listing_row.fee_percent == 10


def test_tradeable_item_offer_transfers_both_inventory_items(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    student_headers = login(student, "student")
    admin_id = admin.get("/v1/me", headers=admin_headers).json()["id"]
    student_id = student.get("/v1/me", headers=student_headers).json()["id"]
    target = admin.post(
        "/v1/admin/shop/items",
        headers=admin_headers,
        json={
            "itemKey": "target-trade",
            "name": "Target",
            "priceCoin": 5,
            "stock": 1,
            "purchaseLimit": 1,
            "eligibleRoles": [],
            "effectType": "cosmetic",
            "tradeable": True,
        },
    )
    offered = admin.post(
        "/v1/admin/shop/items",
        headers=admin_headers,
        json={
            "itemKey": "offered-trade",
            "name": "Offered",
            "priceCoin": 2,
            "stock": 1,
            "purchaseLimit": 1,
            "eligibleRoles": [],
            "effectType": "cosmetic",
            "tradeable": True,
        },
    )
    assert target.status_code == offered.status_code == 201
    with factory() as db:
        db.add_all(
            [
                EconomyLedger(
                    user_id=admin_id,
                    currency="coin",
                    delta=5,
                    source="test.grant",
                    idempotency_key="asset-offer-admin-funds",
                    reason="test",
                ),
                EconomyLedger(
                    user_id=student_id,
                    currency="coin",
                    delta=2,
                    source="test.grant",
                    idempotency_key="asset-offer-student-funds",
                    reason="test",
                ),
            ]
        )
        db.commit()
    for client, headers, item in [
        (admin, admin_headers, target),
        (student, student_headers, offered),
    ]:
        response = client.post(
            "/v1/shop/purchases",
            headers=headers | {"Idempotency-Key": f"buy-{item.json()['itemKey']}"},
            json={"itemId": item.json()["id"], "quantity": 1},
        )
        assert response.status_code == 201, response.text
    with factory() as db:
        target_inventory = db.scalar(select(InventoryItem).where(InventoryItem.user_id == admin_id))
        offered_inventory = db.scalar(
            select(InventoryItem).where(InventoryItem.user_id == student_id)
        )
        assert target_inventory and offered_inventory
    listing = admin.post(
        "/v1/marketplace/listings",
        headers=admin_headers | {"Idempotency-Key": "asset-list"},
        json={"inventoryId": target_inventory.id, "priceCoin": 10},
    )
    offer = student.post(
        "/v1/marketplace/offers",
        headers=student_headers | {"Idempotency-Key": "asset-offer"},
        json={
            "listingId": listing.json()["id"],
            "offerCoin": 0,
            "offeredInventoryId": offered_inventory.id,
        },
    )
    assert offer.status_code == 201, offer.text
    accepted = admin.post(
        f"/v1/marketplace/offers/{offer.json()['offerId']}/decisions",
        headers=admin_headers | {"Idempotency-Key": "asset-decision"},
        json={"decision": "accept"},
    )
    assert accepted.status_code == 200, accepted.text
    assert (
        student.get("/v1/me/inventory", headers=student_headers).json()["items"][0]["item"]["name"]
        == "Target"
    )
    assert (
        admin.get("/v1/me/inventory", headers=admin_headers).json()["items"][0]["item"]["name"]
        == "Offered"
    )
    with factory() as db:
        settled = db.get(MarketplaceOffer, offer.json()["offerId"])
        assert settled and settled.status == "accepted"


def test_expired_offer_and_listing_return_escrowed_assets(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    student_headers = login(student, "student")
    admin_id = admin.get("/v1/me", headers=admin_headers).json()["id"]
    student_id = student.get("/v1/me", headers=student_headers).json()["id"]
    item = admin.post(
        "/v1/admin/shop/items",
        headers=admin_headers,
        json={
            "itemKey": "expiry-frame",
            "name": "Expiry frame",
            "priceCoin": 1,
            "stock": 1,
            "purchaseLimit": 1,
            "eligibleRoles": [],
            "effectType": "cosmetic",
            "tradeable": True,
        },
    )
    assert item.status_code == 201, item.text
    with factory() as db:
        target = InventoryItem(
            user_id=admin_id,
            item_id=item.json()["id"],
            purchase_id="test-purchase",
            status="available",
            bound=False,
        )
        db.add_all(
            [
                target,
                EconomyLedger(
                    user_id=student_id,
                    currency="coin",
                    delta=10,
                    source="test.grant",
                    idempotency_key="expiry-offer-funds",
                    reason="test",
                ),
            ]
        )
        db.commit()
        inventory_id = target.id
    listing = admin.post(
        "/v1/marketplace/listings",
        headers=admin_headers | {"Idempotency-Key": "expiry-listing"},
        json={"inventoryId": inventory_id, "priceCoin": 5},
    )
    offer = student.post(
        "/v1/marketplace/offers",
        headers=student_headers | {"Idempotency-Key": "expiry-offer"},
        json={"listingId": listing.json()["id"], "offerCoin": 3},
    )
    assert offer.status_code == 201, offer.text
    with factory() as db:
        db.get(MarketplaceOffer, offer.json()["offerId"]).expires_at = now() - timedelta(minutes=1)
        db.commit()
    assert student.get("/v1/marketplace/offers", headers=student_headers).status_code == 200
    assert student.get("/v1/me/wallet", headers=student_headers).json()["coin"] == 10
    with factory() as db:
        db.get(MarketplaceListing, listing.json()["id"]).expires_at = now() - timedelta(minutes=1)
        db.commit()
    assert student.get("/v1/marketplace/listings", headers=student_headers).json()["items"] == []
    with factory() as db:
        returned = db.get(InventoryItem, inventory_id)
        row = db.get(MarketplaceListing, listing.json()["id"])
        assert row and row.status == "expired" and returned and returned.status == "available"


def test_listing_dispute_freezes_item_and_admin_reverse_appends_compensations(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    student_headers = login(student, "student")
    admin_id = admin.get("/v1/me", headers=admin_headers).json()["id"]
    student_id = student.get("/v1/me", headers=student_headers).json()["id"]
    with factory.begin() as db:
        reviewer = User(
            username="reviewer",
            official_name="Reviewer",
            email="reviewer@example.test",
            roles=["admin"],
            password_hash=passwords.hash(PASSWORD),
        )
        db.add(reviewer)
    item = admin.post(
        "/v1/admin/shop/items",
        headers=admin_headers,
        json={
            "itemKey": "dispute-frame",
            "name": "Dispute frame",
            "priceCoin": 5,
            "stock": 1,
            "purchaseLimit": 1,
            "eligibleRoles": [],
            "effectType": "cosmetic",
            "tradeable": True,
        },
    )
    assert item.status_code == 201, item.text
    with factory() as db:
        db.add_all(
            [
                EconomyLedger(
                    user_id=admin_id,
                    currency="coin",
                    delta=5,
                    source="test.grant",
                    idempotency_key="dispute-admin-funds",
                    reason="test",
                ),
                EconomyLedger(
                    user_id=student_id,
                    currency="coin",
                    delta=20,
                    source="test.grant",
                    idempotency_key="dispute-student-funds",
                    reason="test",
                ),
            ]
        )
        db.commit()
    purchase = admin.post(
        "/v1/shop/purchases",
        headers=admin_headers | {"Idempotency-Key": "dispute-shop-buy"},
        json={"itemId": item.json()["id"], "quantity": 1},
    )
    assert purchase.status_code == 201, purchase.text
    inventory_id = admin.get("/v1/me/inventory", headers=admin_headers).json()["items"][0]["id"]
    listing = admin.post(
        "/v1/marketplace/listings",
        headers=admin_headers | {"Idempotency-Key": "dispute-listing"},
        json={"inventoryId": inventory_id, "priceCoin": 10},
    )
    bought = student.post(
        f"/v1/marketplace/listings/{listing.json()['id']}/purchases",
        headers=student_headers | {"Idempotency-Key": "dispute-buy"},
    )
    assert bought.status_code == 200, bought.text
    dispute = student.post(
        "/v1/marketplace/disputes",
        headers=student_headers,
        json={
            "targetType": "listing",
            "targetId": listing.json()["id"],
            "reason": "The item does not match the listing description.",
        },
    )
    assert dispute.status_code == 201, dispute.text
    assert (
        student.get("/v1/me/inventory", headers=student_headers).json()["items"][0]["status"]
        == "reserved"
    )
    assert (
        admin.post(
            f"/v1/admin/marketplace/disputes/{dispute.json()['id']}/resolutions",
            headers=admin_headers,
            json={"resolution": "reverse"},
        ).status_code
        == 403
    )
    with TestClient(app) as reviewer_client:
        reviewer_headers = login(reviewer_client, "reviewer")
        resolved = reviewer_client.post(
            f"/v1/admin/marketplace/disputes/{dispute.json()['id']}/resolutions",
            headers=reviewer_headers | {"Idempotency-Key": "dispute-resolution-1"},
            json={"resolution": "reverse"},
        )
        assert resolved.status_code == 200, resolved.text
        replay = reviewer_client.post(
            f"/v1/admin/marketplace/disputes/{dispute.json()['id']}/resolutions",
            headers=reviewer_headers | {"Idempotency-Key": "dispute-resolution-2"},
            json={"resolution": "reverse"},
        )
        assert replay.status_code == 200 and replay.json()["replayed"] is True
    assert (
        admin.get("/v1/me/inventory", headers=admin_headers).json()["items"][0]["status"]
        == "available"
    )
    assert admin.get("/v1/me/wallet", headers=admin_headers).json()["coin"] == 0
    assert student.get("/v1/me/wallet", headers=student_headers).json()["coin"] == 20
    with factory() as db:
        compensation_count = db.scalar(
            select(func.count())
            .select_from(EconomyLedger)
            .where(EconomyLedger.source == "marketplace.dispute.compensation")
        )
        assert compensation_count == 2


def test_offer_dispute_freezes_both_escrow_and_listing_purchase(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    student_headers = login(student, "student")
    admin_id = admin.get("/v1/me", headers=admin_headers).json()["id"]
    student_id = student.get("/v1/me", headers=student_headers).json()["id"]
    with factory.begin() as db:
        db.add(
            User(
                username="reviewer-offer",
                official_name="Reviewer",
                email="reviewer-offer@example.test",
                roles=["admin"],
                password_hash=passwords.hash(PASSWORD),
            )
        )
    item = admin.post(
        "/v1/admin/shop/items",
        headers=admin_headers,
        json={
            "itemKey": "offer-dispute-frame",
            "name": "Offer dispute frame",
            "priceCoin": 1,
            "stock": 1,
            "purchaseLimit": 1,
            "eligibleRoles": [],
            "effectType": "cosmetic",
            "tradeable": True,
        },
    )
    assert item.status_code == 201, item.text
    with factory() as db:
        db.add_all(
            [
                EconomyLedger(
                    user_id=admin_id,
                    currency="coin",
                    delta=1,
                    source="test.grant",
                    idempotency_key="offer-dispute-admin-funds",
                    reason="test",
                ),
                EconomyLedger(
                    user_id=student_id,
                    currency="coin",
                    delta=5,
                    source="test.grant",
                    idempotency_key="offer-dispute-student-funds",
                    reason="test",
                ),
            ]
        )
        db.commit()
    purchase = admin.post(
        "/v1/shop/purchases",
        headers=admin_headers | {"Idempotency-Key": "offer-dispute-shop-buy"},
        json={"itemId": item.json()["id"], "quantity": 1},
    )
    inventory_id = admin.get("/v1/me/inventory", headers=admin_headers).json()["items"][0]["id"]
    listing = admin.post(
        "/v1/marketplace/listings",
        headers=admin_headers | {"Idempotency-Key": "offer-dispute-list"},
        json={"inventoryId": inventory_id, "priceCoin": 4},
    )
    assert purchase.status_code == 201 and listing.status_code == 201
    offer = student.post(
        "/v1/marketplace/offers",
        headers=student_headers | {"Idempotency-Key": "offer-dispute-create"},
        json={"listingId": listing.json()["id"], "offerCoin": 2},
    )
    dispute = student.post(
        "/v1/marketplace/disputes",
        headers=student_headers,
        json={
            "targetType": "offer",
            "targetId": offer.json()["offerId"],
            "reason": "The counterparty needs to review the offered item terms.",
        },
    )
    assert offer.status_code == dispute.status_code == 201, dispute.text
    assert student.get("/v1/marketplace/listings", headers=student_headers).json()["items"] == []
    direct_buy = student.post(
        f"/v1/marketplace/listings/{listing.json()['id']}/purchases",
        headers=student_headers | {"Idempotency-Key": "offer-dispute-direct-buy"},
    )
    assert direct_buy.status_code == 409
    assert student.get("/v1/me/wallet", headers=student_headers).json()["coin"] == 3
    with factory() as db:
        frozen_listing = db.get(MarketplaceListing, listing.json()["id"])
        frozen_offer = db.get(MarketplaceOffer, offer.json()["offerId"])
        frozen_item = db.get(InventoryItem, inventory_id)
        assert frozen_listing and frozen_listing.status == "disputed"
        assert frozen_offer and frozen_offer.status == "disputed"
        assert frozen_item and frozen_item.status == "reserved"
    with TestClient(app) as reviewer_client:
        reviewer_headers = login(reviewer_client, "reviewer-offer")
        resolved = reviewer_client.post(
            f"/v1/admin/marketplace/disputes/{dispute.json()['id']}/resolutions",
            headers=reviewer_headers | {"Idempotency-Key": "offer-dispute-resolution"},
            json={"resolution": "reverse"},
        )
        assert resolved.status_code == 200, resolved.text
    assert student.get("/v1/me/wallet", headers=student_headers).json()["coin"] == 5
    assert (
        student.get("/v1/marketplace/listings", headers=student_headers).json()["items"][0]["id"]
        == listing.json()["id"]
    )
    with factory() as db:
        released_offer = db.get(MarketplaceOffer, offer.json()["offerId"])
        released_listing = db.get(MarketplaceListing, listing.json()["id"])
        assert released_offer and released_offer.status == "rejected"
        assert released_listing and released_listing.status == "active"
