"""Fixed-price marketplace with inventory escrow and append-only Coin settlement."""

import uuid
from datetime import timedelta

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import func, select

from .auth import DB, Admin, Principal, audit, lock_admin
from .course_access import lock_actor
from .models import (
    EconomyLedger,
    InventoryItem,
    MarketplaceListing,
    MarketplaceOffer,
    MarketplacePolicy,
    ShopItem,
    User,
    now,
)
from .security import utc

router = APIRouter(prefix="/v1")


class ListingDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inventoryId: uuid.UUID
    priceCoin: int = Field(gt=0, le=2_000_000_000)
    expiresInHours: int = Field(default=168, ge=1, le=168)


class OfferDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    listingId: uuid.UUID
    offerCoin: int = Field(default=0, ge=0, le=2_000_000_000)
    offeredInventoryId: uuid.UUID | None = None
    expiresInHours: int = Field(default=72, ge=1, le=168)


class OfferDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: str = Field(pattern=r"^(accept|reject)$")


class MarketplacePolicyDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    listingFeePercent: int = Field(ge=0, le=10)
    offerFeePercent: int = Field(ge=0, le=10)
    minPriceCoin: int = Field(ge=1, le=2_000_000_000)
    maxPriceCoin: int = Field(ge=1, le=2_000_000_000)
    maxOfferCoin: int = Field(ge=0, le=2_000_000_000)
    listingExpiryHours: int = Field(ge=1, le=168)
    offerExpiryHours: int = Field(ge=1, le=168)
    maxActiveListings: int = Field(ge=1, le=100)
    maxPendingOffers: int = Field(ge=1, le=100)

    @model_validator(mode="after")
    def validate_bounds(self) -> "MarketplacePolicyDraft":
        if self.maxPriceCoin < self.minPriceCoin:
            raise ValueError("invalid_marketplace_price_range")
        return self


def _active_policy(db: DB) -> MarketplacePolicy:
    policy = db.scalar(
        select(MarketplacePolicy)
        .where(MarketplacePolicy.status == "active")
        .order_by(MarketplacePolicy.version.desc())
    )
    if policy is None:
        raise HTTPException(503, "marketplace_policy_unavailable")
    return policy


def _policy_view(policy: MarketplacePolicy) -> dict[str, object]:
    return {
        "version": policy.version,
        "listingFeePercent": policy.listing_fee_percent,
        "offerFeePercent": policy.offer_fee_percent,
        "minPriceCoin": policy.min_price_coin,
        "maxPriceCoin": policy.max_price_coin,
        "maxOfferCoin": policy.max_offer_coin,
        "listingExpiryHours": policy.listing_expiry_hours,
        "offerExpiryHours": policy.offer_expiry_hours,
        "maxActiveListings": policy.max_active_listings,
        "maxPendingOffers": policy.max_pending_offers,
    }


def _coin(db: DB, user_id: str) -> int:
    return int(
        db.scalar(
            select(func.coalesce(func.sum(EconomyLedger.delta), 0)).where(
                EconomyLedger.user_id == user_id, EconomyLedger.currency == "coin"
            )
        )
        or 0
    )


@router.get("/marketplace/policy")
def get_marketplace_policy(db: DB, _user: Principal) -> dict[str, object]:
    return _policy_view(_active_policy(db))


@router.post("/admin/marketplace/policies", status_code=201)
def publish_marketplace_policy(
    body: MarketplacePolicyDraft, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    lock_admin(db, request, user)
    previous = _active_policy(db)
    previous.status = "retired"
    policy = MarketplacePolicy(
        id=str(uuid.uuid4()),
        version=previous.version + 1,
        status="active",
        listing_fee_percent=body.listingFeePercent,
        offer_fee_percent=body.offerFeePercent,
        min_price_coin=body.minPriceCoin,
        max_price_coin=body.maxPriceCoin,
        max_offer_coin=body.maxOfferCoin,
        listing_expiry_hours=body.listingExpiryHours,
        offer_expiry_hours=body.offerExpiryHours,
        max_active_listings=body.maxActiveListings,
        max_pending_offers=body.maxPendingOffers,
        updated_by=user.id,
    )
    db.add(policy)
    audit(db, request, "marketplace_policy_published", user, _policy_view(policy))
    db.flush()
    return _policy_view(policy)


def _view(row: MarketplaceListing, item: ShopItem, viewer_id: str) -> dict[str, object]:
    return {
        "id": row.id,
        "isMine": row.seller_id == viewer_id,
        "item": {
            "itemKey": item.item_key,
            "name": item.name,
            "description": item.description,
            "effectType": item.effect_type,
        },
        "priceCoin": row.price_coin,
        "feePercent": row.fee_percent,
        "sellerFeeCoin": row.price_coin * row.fee_percent // 100,
        "expiresAt": utc(row.expires_at).isoformat(),
        "status": row.status,
    }


def _release_offer(
    db: DB, request: Request, actor: Principal, offer: MarketplaceOffer, status: str
) -> None:
    offer.status = status
    if offer.offer_coin:
        db.add(
            EconomyLedger(
                user_id=offer.offerer_id,
                currency="coin",
                delta=offer.offer_coin,
                source="marketplace.offer.refund",
                idempotency_key=f"marketplace:offer:{offer.id}:refund",
                reason="Marketplace offer returned",
                actor_id=actor.id,
                detail={"offerId": offer.id},
            )
        )
    if offer.offered_inventory_id:
        inventory = db.scalar(
            select(InventoryItem)
            .where(InventoryItem.id == offer.offered_inventory_id)
            .with_for_update()
        )
        if inventory and inventory.status == "reserved":
            inventory.status = "available"
    audit(db, request, f"marketplace_offer_{status}", actor, {"offerId": offer.id})


def _expire_offers_for_listing(db: DB, request: Request, actor: Principal, listing_id: str) -> None:
    pending = list(
        db.scalars(
            select(MarketplaceOffer)
            .where(MarketplaceOffer.listing_id == listing_id, MarketplaceOffer.status == "pending")
            .with_for_update()
        )
    )
    for offer in pending:
        _release_offer(db, request, actor, offer, "expired")


def _expire_stale_offers(db: DB, request: Request, actor: Principal) -> None:
    pending = list(
        db.scalars(
            select(MarketplaceOffer)
            .where(MarketplaceOffer.status == "pending", MarketplaceOffer.expires_at <= now())
            .with_for_update()
        )
    )
    for offer in pending:
        _release_offer(db, request, actor, offer, "expired")


@router.get("/marketplace/listings")
def listings(request: Request, db: DB, user: Principal) -> dict[str, object]:
    _expire_stale_offers(db, request, user)
    expired = list(
        db.scalars(
            select(MarketplaceListing)
            .where(MarketplaceListing.status == "active", MarketplaceListing.expires_at <= now())
            .with_for_update()
        )
    )
    for listing in expired:
        inventory_item = db.scalar(
            select(InventoryItem).where(InventoryItem.id == listing.inventory_id).with_for_update()
        )
        listing.status = "expired"
        if inventory_item and inventory_item.status == "reserved":
            inventory_item.status = "available"
        audit(
            db,
            request,
            "marketplace_listing_expired",
            user,
            {"listingId": listing.id, "sellerId": listing.seller_id},
        )
        _expire_offers_for_listing(db, request, user, listing.id)
    rows = db.execute(
        select(MarketplaceListing, InventoryItem, ShopItem)
        .join(InventoryItem, InventoryItem.id == MarketplaceListing.inventory_id)
        .join(ShopItem, ShopItem.id == InventoryItem.item_id)
        .where(MarketplaceListing.status == "active", MarketplaceListing.expires_at > now())
        .order_by(MarketplaceListing.created_at.desc())
        .limit(100)
    ).all()
    return {"items": [_view(listing, item, user.id) for listing, _inventory, item in rows]}


@router.post("/marketplace/listings", status_code=201)
def create_listing(
    body: ListingDraft,
    request: Request,
    db: DB,
    user: Principal,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=160),
) -> dict[str, object]:
    lock_actor(db, request, user)
    existing = db.scalar(
        select(MarketplaceListing).where(
            MarketplaceListing.seller_id == user.id,
            MarketplaceListing.idempotency_key == idempotency_key,
        )
    )
    if existing:
        if existing.inventory_id != str(body.inventoryId) or existing.price_coin != body.priceCoin:
            raise HTTPException(409, "idempotency_key_reused")
        inv = db.get(InventoryItem, existing.inventory_id)
        item = db.get(ShopItem, inv.item_id) if inv else None
        if item is None:
            raise HTTPException(409, "listing_item_missing")
        return _view(existing, item, user.id)
    policy = _active_policy(db)
    if not policy.min_price_coin <= body.priceCoin <= policy.max_price_coin:
        raise HTTPException(422, "listing_price_outside_policy")
    active_count = int(
        db.scalar(
            select(func.count())
            .select_from(MarketplaceListing)
            .where(
                MarketplaceListing.seller_id == user.id,
                MarketplaceListing.status == "active",
                MarketplaceListing.expires_at > now(),
            )
        )
        or 0
    )
    if active_count >= policy.max_active_listings:
        raise HTTPException(409, "active_listing_limit_reached")
    owned = db.execute(
        select(InventoryItem, ShopItem)
        .join(ShopItem, ShopItem.id == InventoryItem.item_id)
        .where(InventoryItem.id == str(body.inventoryId), InventoryItem.user_id == user.id)
        .with_for_update()
    ).first()
    if owned is None:
        raise HTTPException(404, "inventory_item_not_found")
    inventory_item, shop_item = owned
    if inventory_item.status != "available" or inventory_item.bound or not shop_item.tradeable:
        raise HTTPException(409, "inventory_item_not_tradeable")
    row = MarketplaceListing(
        id=str(uuid.uuid4()),
        seller_id=user.id,
        inventory_id=inventory_item.id,
        price_coin=body.priceCoin,
        policy_version=policy.version,
        fee_percent=policy.listing_fee_percent,
        expires_at=now() + timedelta(hours=min(body.expiresInHours, policy.listing_expiry_hours)),
        idempotency_key=idempotency_key,
    )
    inventory_item.status = "reserved"
    db.add(row)
    audit(
        db,
        request,
        "marketplace_listing_created",
        user,
        {
            "listingId": row.id,
            "inventoryId": inventory_item.id,
            "priceCoin": row.price_coin,
            "feePercent": row.fee_percent,
            "policyVersion": row.policy_version,
        },
    )
    db.flush()
    return _view(row, shop_item, user.id)


@router.post("/marketplace/listings/{listing_id}/purchases")
def buy_listing(
    listing_id: uuid.UUID,
    request: Request,
    db: DB,
    user: Principal,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=160),
) -> dict[str, object]:
    lock_actor(db, request, user)
    prior = db.scalar(
        select(MarketplaceListing).where(
            MarketplaceListing.buyer_id == user.id,
            MarketplaceListing.buyer_idempotency_key == idempotency_key,
        )
    )
    if prior:
        if prior.id != str(listing_id):
            raise HTTPException(409, "idempotency_key_reused")
        return {
            "listingId": prior.id,
            "status": prior.status,
            "priceCoin": prior.price_coin,
            "feeCoin": prior.price_coin * prior.fee_percent // 100,
            "sellerProceedsCoin": prior.price_coin - (prior.price_coin * prior.fee_percent // 100),
            "replayed": True,
        }
    row = db.scalar(
        select(MarketplaceListing).where(MarketplaceListing.id == str(listing_id)).with_for_update()
    )
    if row is None:
        raise HTTPException(404, "listing_not_found")
    if row.status == "sold" and row.buyer_id == user.id:
        return {
            "listingId": row.id,
            "status": "sold",
            "priceCoin": row.price_coin,
            "feeCoin": row.price_coin * row.fee_percent // 100,
            "sellerProceedsCoin": row.price_coin - (row.price_coin * row.fee_percent // 100),
            "replayed": True,
        }
    if row.status != "active":
        raise HTTPException(409, "listing_unavailable")
    inv_snapshot = db.get(InventoryItem, row.inventory_id)
    item_snapshot = db.get(ShopItem, inv_snapshot.item_id) if inv_snapshot else None
    if item_snapshot is None or (
        item_snapshot.eligible_roles and not set(item_snapshot.eligible_roles) & set(user.roles)
    ):
        raise HTTPException(403, "marketplace_item_role_ineligible")
    inv = db.scalar(
        select(InventoryItem).where(InventoryItem.id == row.inventory_id).with_for_update()
    )
    if utc(row.expires_at) <= now():
        row.status = "expired"
        if inv and inv.status == "reserved":
            inv.status = "available"
        audit(
            db,
            request,
            "marketplace_listing_expired",
            user,
            {"listingId": row.id, "sellerId": row.seller_id},
        )
        _expire_offers_for_listing(db, request, user, row.id)
        db.flush()
        return {"listingId": row.id, "status": "expired", "replayed": False}
    if user.id == row.seller_id:
        raise HTTPException(409, "cannot_buy_own_listing")
    if inv is None or inv.status != "reserved":
        raise HTTPException(409, "escrow_item_unavailable")
    if _coin(db, user.id) < row.price_coin:
        raise HTTPException(409, "insufficient_coin")
    if db.scalar(
        select(EconomyLedger.id).where(
            EconomyLedger.idempotency_key == f"marketplace:{row.id}:buyer:{user.id}"
        )
    ):
        raise HTTPException(409, "settlement_already_recorded")
    row.status = "sold"
    row.buyer_id = user.id
    row.buyer_idempotency_key = idempotency_key
    inv.user_id = user.id
    inv.status = "available"
    _expire_offers_for_listing(db, request, user, row.id)
    fee_coin = row.price_coin * row.fee_percent // 100
    settlement_rows = [
        EconomyLedger(
            user_id=user.id,
            currency="coin",
            delta=-row.price_coin,
            source="marketplace.purchase",
            idempotency_key=f"marketplace:{row.id}:buyer:{user.id}",
            reason="Marketplace purchase",
            actor_id=user.id,
            detail={"listingId": row.id, "sellerId": row.seller_id},
        ),
        EconomyLedger(
            user_id=row.seller_id,
            currency="coin",
            delta=row.price_coin,
            source="marketplace.sale",
            idempotency_key=f"marketplace:{row.id}:seller",
            reason="Marketplace sale",
            actor_id=user.id,
            detail={"listingId": row.id, "buyerId": user.id},
        ),
    ]
    if fee_coin:
        settlement_rows.append(
            EconomyLedger(
                user_id=row.seller_id,
                currency="coin",
                delta=-fee_coin,
                source="marketplace.fee.burn",
                idempotency_key=f"marketplace:{row.id}:seller-fee",
                reason="Marketplace seller fee burned",
                actor_id=user.id,
                detail={
                    "listingId": row.id,
                    "policyVersion": row.policy_version,
                    "feePercent": row.fee_percent,
                },
            )
        )
    db.add_all(settlement_rows)
    audit(
        db,
        request,
        "marketplace_listing_sold",
        user,
        {
            "listingId": row.id,
            "sellerId": row.seller_id,
            "priceCoin": row.price_coin,
            "feeCoin": fee_coin,
            "feePercent": row.fee_percent,
            "policyVersion": row.policy_version,
            "idempotencyKey": idempotency_key,
        },
    )
    db.flush()
    return {
        "listingId": row.id,
        "status": "sold",
        "priceCoin": row.price_coin,
        "feeCoin": fee_coin,
        "sellerProceedsCoin": row.price_coin - fee_coin,
        "replayed": False,
    }


@router.post("/marketplace/listings/{listing_id}/cancellations")
def cancel_listing(
    listing_id: uuid.UUID, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    row = db.scalar(
        select(MarketplaceListing).where(MarketplaceListing.id == str(listing_id)).with_for_update()
    )
    if row is None or row.seller_id != user.id:
        raise HTTPException(404, "listing_not_found")
    if row.status in {"cancelled", "expired"}:
        return {"listingId": row.id, "status": row.status, "replayed": True}
    if row.status != "active":
        raise HTTPException(409, "listing_unavailable")
    row.status = "cancelled" if utc(row.expires_at) > now() else "expired"
    _expire_offers_for_listing(db, request, user, row.id)
    inv = db.scalar(
        select(InventoryItem).where(InventoryItem.id == row.inventory_id).with_for_update()
    )
    if inv and inv.status == "reserved":
        inv.status = "available"
    audit(
        db,
        request,
        "marketplace_listing_cancelled",
        user,
        {"listingId": row.id, "status": row.status},
    )
    db.flush()
    return {"listingId": row.id, "status": row.status}


@router.get("/marketplace/offers")
def offers(request: Request, db: DB, user: Principal) -> dict[str, object]:
    _expire_stale_offers(db, request, user)
    rows = db.execute(
        select(MarketplaceOffer, MarketplaceListing, InventoryItem, ShopItem)
        .join(MarketplaceListing, MarketplaceListing.id == MarketplaceOffer.listing_id)
        .join(InventoryItem, InventoryItem.id == MarketplaceListing.inventory_id)
        .join(ShopItem, ShopItem.id == InventoryItem.item_id)
        .where((MarketplaceOffer.offerer_id == user.id) | (MarketplaceListing.seller_id == user.id))
        .order_by(MarketplaceOffer.created_at.desc())
        .limit(100)
    ).all()
    items = []
    for offer, listing, _inventory, target_item in rows:
        offered_item = (
            db.get(InventoryItem, offer.offered_inventory_id)
            if offer.offered_inventory_id
            else None
        )
        offered_catalog = db.get(ShopItem, offered_item.item_id) if offered_item else None
        items.append(
            {
                "id": offer.id,
                "listingId": listing.id,
                "targetItem": target_item.name,
                "offerCoin": offer.offer_coin,
                "offeredItem": offered_catalog.name if offered_catalog else None,
                "feePercent": offer.fee_percent,
                "sellerFeeCoin": offer.offer_coin * offer.fee_percent // 100,
                "status": offer.status,
                "incoming": listing.seller_id == user.id,
                "expiresAt": utc(offer.expires_at).isoformat(),
            }
        )
    return {"items": items}


@router.post("/marketplace/offers", status_code=201)
def create_offer(
    body: OfferDraft,
    request: Request,
    db: DB,
    user: Principal,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=160),
) -> dict[str, object]:
    lock_actor(db, request, user)
    prior = db.scalar(
        select(MarketplaceOffer).where(
            MarketplaceOffer.offerer_id == user.id,
            MarketplaceOffer.idempotency_key == idempotency_key,
        )
    )
    if prior:
        if (
            prior.listing_id != str(body.listingId)
            or prior.offer_coin != body.offerCoin
            or prior.offered_inventory_id
            != (str(body.offeredInventoryId) if body.offeredInventoryId else None)
        ):
            raise HTTPException(409, "idempotency_key_reused")
        return {"offerId": prior.id, "status": prior.status, "replayed": True}
    listing = db.scalar(
        select(MarketplaceListing)
        .where(MarketplaceListing.id == str(body.listingId))
        .with_for_update()
    )
    if listing is None or listing.status != "active" or utc(listing.expires_at) <= now():
        raise HTTPException(404, "listing_unavailable")
    if listing.seller_id == user.id:
        raise HTTPException(409, "cannot_offer_on_own_listing")
    policy = _active_policy(db)
    if body.offerCoin > policy.max_offer_coin:
        raise HTTPException(422, "offer_price_outside_policy")
    pending_count = int(
        db.scalar(
            select(func.count())
            .select_from(MarketplaceOffer)
            .where(
                MarketplaceOffer.offerer_id == user.id,
                MarketplaceOffer.status == "pending",
                MarketplaceOffer.expires_at > now(),
            )
        )
        or 0
    )
    if pending_count >= policy.max_pending_offers:
        raise HTTPException(409, "pending_offer_limit_reached")
    if body.offerCoin == 0 and body.offeredInventoryId is None:
        raise HTTPException(422, "offer_must_include_coin_or_item")
    offered_item_id = str(body.offeredInventoryId) if body.offeredInventoryId else None
    if offered_item_id == listing.inventory_id:
        raise HTTPException(422, "cannot_offer_target_item")
    if body.offerCoin and _coin(db, user.id) < body.offerCoin:
        raise HTTPException(409, "insufficient_coin")
    offered_inventory = None
    if offered_item_id:
        offered = db.execute(
            select(InventoryItem, ShopItem)
            .join(ShopItem, ShopItem.id == InventoryItem.item_id)
            .where(InventoryItem.id == offered_item_id, InventoryItem.user_id == user.id)
            .with_for_update()
        ).first()
        if offered is None:
            raise HTTPException(404, "offered_inventory_not_found")
        offered_inventory, offered_catalog = offered
        if (
            offered_inventory.status != "available"
            or offered_inventory.bound
            or not offered_catalog.tradeable
        ):
            raise HTTPException(409, "offered_item_not_tradeable")
    offer = MarketplaceOffer(
        id=str(uuid.uuid4()),
        listing_id=listing.id,
        offerer_id=user.id,
        offer_coin=body.offerCoin,
        offered_inventory_id=offered_item_id,
        policy_version=policy.version,
        fee_percent=policy.offer_fee_percent,
        expires_at=min(
            now() + timedelta(hours=min(body.expiresInHours, policy.offer_expiry_hours)),
            utc(listing.expires_at),
        ),
        idempotency_key=idempotency_key,
    )
    if offered_inventory:
        offered_inventory.status = "reserved"
    if body.offerCoin:
        db.add(
            EconomyLedger(
                user_id=user.id,
                currency="coin",
                delta=-body.offerCoin,
                source="marketplace.offer.escrow",
                idempotency_key=f"marketplace:offer:{offer.id}:escrow",
                reason="Coin reserved for marketplace offer",
                actor_id=user.id,
                detail={"offerId": offer.id},
            )
        )
    db.add(offer)
    audit(
        db,
        request,
        "marketplace_offer_created",
        user,
        {
            "offerId": offer.id,
            "listingId": listing.id,
            "offerCoin": offer.offer_coin,
            "offeredInventoryId": offered_item_id,
            "feePercent": offer.fee_percent,
            "policyVersion": offer.policy_version,
        },
    )
    db.flush()
    return {
        "offerId": offer.id,
        "status": offer.status,
        "expiresAt": utc(offer.expires_at).isoformat(),
        "replayed": False,
    }


@router.post("/marketplace/offers/{offer_id}/decisions")
def decide_offer(
    offer_id: uuid.UUID,
    body: OfferDecision,
    request: Request,
    db: DB,
    user: Principal,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=160),
) -> dict[str, object]:
    lock_actor(db, request, user)
    offer = db.scalar(
        select(MarketplaceOffer).where(MarketplaceOffer.id == str(offer_id)).with_for_update()
    )
    if offer is None:
        raise HTTPException(404, "offer_not_found")
    if offer.decision_key == idempotency_key:
        fee_coin = offer.offer_coin * offer.fee_percent // 100 if offer.status == "accepted" else 0
        return {
            "offerId": offer.id,
            "status": offer.status,
            "feeCoin": fee_coin,
            "sellerProceedsCoin": offer.offer_coin - fee_coin,
            "replayed": True,
        }
    if offer.status != "pending":
        raise HTTPException(409, "offer_unavailable")
    listing = db.scalar(
        select(MarketplaceListing)
        .where(MarketplaceListing.id == offer.listing_id)
        .with_for_update()
    )
    if listing is None or listing.seller_id != user.id:
        raise HTTPException(404, "offer_not_found")
    if body.decision == "reject":
        offer.decision_key = idempotency_key
        _release_offer(db, request, user, offer, "rejected")
        db.flush()
        return {"offerId": offer.id, "status": offer.status, "replayed": False}
    if (
        listing.status != "active"
        or utc(listing.expires_at) <= now()
        or utc(offer.expires_at) <= now()
    ):
        offer.status = "expired"
        if listing.status == "active" and utc(listing.expires_at) <= now():
            listing.status = "expired"
            expired_target = db.scalar(
                select(InventoryItem)
                .where(InventoryItem.id == listing.inventory_id)
                .with_for_update()
            )
            if expired_target and expired_target.status == "reserved":
                expired_target.status = "available"
            audit(
                db,
                request,
                "marketplace_listing_expired",
                user,
                {"listingId": listing.id, "sellerId": listing.seller_id},
            )
            _expire_offers_for_listing(db, request, user, listing.id)
        offer.decision_key = idempotency_key
        _release_offer(db, request, user, offer, "expired")
        db.flush()
        return {"offerId": offer.id, "status": offer.status, "replayed": False}
    target = db.scalar(
        select(InventoryItem).where(InventoryItem.id == listing.inventory_id).with_for_update()
    )
    if target is None or target.status != "reserved":
        raise HTTPException(409, "escrow_item_unavailable")
    target_catalog = db.get(ShopItem, target.item_id)
    offerer = db.get(User, offer.offerer_id)
    if (
        target_catalog is None
        or offerer is None
        or (
            target_catalog.eligible_roles
            and not set(target_catalog.eligible_roles) & set(offerer.roles)
        )
    ):
        raise HTTPException(409, "target_item_role_ineligible")
    offered_inventory = None
    if offer.offered_inventory_id:
        offered_inventory = db.scalar(
            select(InventoryItem)
            .where(InventoryItem.id == offer.offered_inventory_id)
            .with_for_update()
        )
        offered_catalog = db.get(ShopItem, offered_inventory.item_id) if offered_inventory else None
        if (
            offered_inventory is None
            or offered_inventory.status != "reserved"
            or offered_catalog is None
        ):
            raise HTTPException(409, "offered_item_unavailable")
        if offered_catalog.eligible_roles and not set(offered_catalog.eligible_roles) & set(
            user.roles
        ):
            raise HTTPException(409, "offered_item_role_ineligible")
        offered_inventory.user_id = user.id
        offered_inventory.status = "available"
    offerer_id = offer.offerer_id
    target.user_id = offerer_id
    target.status = "available"
    listing.status = "sold"
    listing.buyer_id = offerer_id
    listing.buyer_idempotency_key = f"offer:{offer.id}"
    offer.status = "accepted"
    offer.decision_key = idempotency_key
    if offer.offer_coin:
        db.add(
            EconomyLedger(
                user_id=user.id,
                currency="coin",
                delta=offer.offer_coin,
                source="marketplace.offer.sale",
                idempotency_key=f"marketplace:offer:{offer.id}:seller",
                reason="Accepted marketplace offer",
                actor_id=user.id,
                detail={"offerId": offer.id, "listingId": listing.id},
            )
        )
    fee_coin = offer.offer_coin * offer.fee_percent // 100
    if fee_coin:
        db.add(
            EconomyLedger(
                user_id=user.id,
                currency="coin",
                delta=-fee_coin,
                source="marketplace.fee.burn",
                idempotency_key=f"marketplace:offer:{offer.id}:seller-fee",
                reason="Marketplace offer seller fee burned",
                actor_id=user.id,
                detail={
                    "offerId": offer.id,
                    "listingId": listing.id,
                    "policyVersion": offer.policy_version,
                    "feePercent": offer.fee_percent,
                },
            )
        )
    _expire_offers_for_listing(db, request, user, listing.id)
    audit(
        db,
        request,
        "marketplace_offer_accepted",
        user,
        {"offerId": offer.id, "listingId": listing.id, "offererId": offer.offerer_id},
    )
    db.flush()
    return {
        "offerId": offer.id,
        "status": offer.status,
        "feeCoin": fee_coin,
        "sellerProceedsCoin": offer.offer_coin - fee_coin,
        "replayed": False,
    }


@router.post("/marketplace/offers/{offer_id}/cancellations")
def cancel_offer(
    offer_id: uuid.UUID, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    offer = db.scalar(
        select(MarketplaceOffer).where(MarketplaceOffer.id == str(offer_id)).with_for_update()
    )
    if offer is None or offer.offerer_id != user.id:
        raise HTTPException(404, "offer_not_found")
    if offer.status == "cancelled":
        return {"offerId": offer.id, "status": offer.status, "replayed": True}
    if offer.status != "pending":
        raise HTTPException(409, "offer_unavailable")
    _release_offer(db, request, user, offer, "cancelled")
    db.flush()
    return {"offerId": offer.id, "status": offer.status}
