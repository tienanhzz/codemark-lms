"""Party-scoped marketplace disputes and Admin compensating settlement."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_, select

from .auth import DB, Admin, Principal, audit, lock_admin
from .course_access import lock_actor
from .marketplace import _expire_offers_for_listing, _release_offer
from .models import (
    EconomyLedger,
    InventoryItem,
    MarketplaceDispute,
    MarketplaceListing,
    MarketplaceOffer,
    ShopItem,
    User,
    now,
)
from .security import utc

router = APIRouter(prefix="/v1")


class DisputeDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    targetType: str = Field(pattern=r"^(listing|offer)$")
    targetId: uuid.UUID
    reason: str = Field(min_length=10, max_length=1000)


class ResolutionDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    resolution: str = Field(pattern=r"^(uphold|reverse)$")


def _view(row: MarketplaceDispute) -> dict[str, object]:
    return {
        "id": row.id,
        "targetType": row.target_type,
        "targetId": row.target_id,
        "openedById": row.opened_by_id,
        "reason": row.reason,
        "status": row.status,
        "resolution": row.resolution,
        "createdAt": utc(row.created_at).isoformat(),
        "resolvedAt": utc(row.resolved_at).isoformat() if row.resolved_at else None,
    }


def _party(db: DB, row: MarketplaceDispute, user_id: str) -> bool:
    if row.target_type == "listing":
        target = db.get(MarketplaceListing, row.target_id)
        return bool(target and user_id in {target.seller_id, target.buyer_id})
    target_offer = db.get(MarketplaceOffer, row.target_id)
    listing = db.get(MarketplaceListing, target_offer.listing_id) if target_offer else None
    return bool(
        target_offer and listing and user_id in {target_offer.offerer_id, listing.seller_id}
    )


@router.get("/marketplace/history")
def history(db: DB, user: Principal) -> dict[str, object]:
    rows = db.execute(
        select(MarketplaceListing, InventoryItem, ShopItem)
        .join(InventoryItem, InventoryItem.id == MarketplaceListing.inventory_id)
        .join(ShopItem, ShopItem.id == InventoryItem.item_id)
        .where(
            or_(MarketplaceListing.seller_id == user.id, MarketplaceListing.buyer_id == user.id),
            MarketplaceListing.status.in_(["sold", "disputed"]),
        )
        .order_by(MarketplaceListing.created_at.desc())
        .limit(100)
    ).all()
    items = []
    for listing, _inventory, item in rows:
        dispute = db.scalar(
            select(MarketplaceDispute).where(
                MarketplaceDispute.target_type == "listing",
                MarketplaceDispute.target_id == listing.id,
            )
        )
        items.append(
            {
                "id": listing.id,
                "itemName": item.name,
                "priceCoin": listing.price_coin,
                "side": "seller" if listing.seller_id == user.id else "buyer",
                "status": listing.status,
                "disputeStatus": dispute.status if dispute else None,
            }
        )
    return {"items": items}


@router.post("/marketplace/disputes", status_code=201)
def open_dispute(
    body: DisputeDraft, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    target_id = str(body.targetId)
    existing = db.scalar(
        select(MarketplaceDispute).where(
            MarketplaceDispute.target_type == body.targetType,
            MarketplaceDispute.target_id == target_id,
        )
    )
    if existing:
        if existing.status == "open" and _party(db, existing, user.id):
            return _view(existing)
        raise HTTPException(409, "dispute_already_exists")
    if body.targetType == "listing":
        listing = db.scalar(
            select(MarketplaceListing).where(MarketplaceListing.id == target_id).with_for_update()
        )
        if (
            listing is None
            or listing.status != "sold"
            or user.id not in {listing.seller_id, listing.buyer_id}
        ):
            raise HTTPException(404, "disputable_trade_not_found")
        inventory = db.scalar(
            select(InventoryItem).where(InventoryItem.id == listing.inventory_id).with_for_update()
        )
        if (
            inventory is None
            or inventory.user_id != listing.buyer_id
            or inventory.status != "available"
        ):
            raise HTTPException(409, "trade_asset_unavailable")
        inventory.status = "reserved"
        listing.status = "disputed"
    else:
        offer = db.scalar(
            select(MarketplaceOffer).where(MarketplaceOffer.id == target_id).with_for_update()
        )
        listing = db.get(MarketplaceListing, offer.listing_id) if offer else None
        if (
            offer is None
            or listing is None
            or offer.status != "pending"
            or user.id not in {offer.offerer_id, listing.seller_id}
        ):
            raise HTTPException(404, "disputable_offer_not_found")
        offer.status = "disputed"
        listing.status = "disputed"
        _expire_offers_for_listing(db, request, user, listing.id)
    dispute = MarketplaceDispute(
        id=str(uuid.uuid4()),
        target_type=body.targetType,
        target_id=target_id,
        opened_by_id=user.id,
        reason=body.reason,
    )
    db.add(dispute)
    audit(
        db,
        request,
        "marketplace_dispute_opened",
        user,
        {"disputeId": dispute.id, "targetType": body.targetType, "targetId": target_id},
    )
    db.flush()
    return _view(dispute)


@router.get("/marketplace/disputes")
def my_disputes(db: DB, user: Principal) -> dict[str, object]:
    rows = list(
        db.scalars(
            select(MarketplaceDispute).order_by(MarketplaceDispute.created_at.desc()).limit(250)
        )
    )
    return {"items": [_view(row) for row in rows if _party(db, row, user.id)]}


@router.get("/admin/marketplace/disputes")
def admin_disputes(db: DB, user: Admin) -> dict[str, object]:
    rows = db.scalars(
        select(MarketplaceDispute).order_by(MarketplaceDispute.created_at.desc()).limit(250)
    )
    return {"items": [_view(row) for row in rows]}


@router.post("/admin/marketplace/disputes/{dispute_id}/resolutions")
def resolve_dispute(
    dispute_id: uuid.UUID, body: ResolutionDraft, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    lock_admin(db, request, user)
    dispute = db.scalar(
        select(MarketplaceDispute).where(MarketplaceDispute.id == str(dispute_id)).with_for_update()
    )
    if dispute is None:
        raise HTTPException(404, "dispute_not_found")
    if _party(db, dispute, user.id):
        raise HTTPException(403, "dispute_resolver_must_be_independent")
    if dispute.status == "resolved":
        if dispute.resolution == body.resolution:
            return _view(dispute) | {"replayed": True}
        raise HTTPException(409, "dispute_already_resolved")
    if dispute.target_type == "listing":
        listing = db.scalar(
            select(MarketplaceListing)
            .where(MarketplaceListing.id == dispute.target_id)
            .with_for_update()
        )
        if listing is None or listing.status != "disputed" or not listing.buyer_id:
            raise HTTPException(409, "disputed_listing_unavailable")
        inventory = db.scalar(
            select(InventoryItem).where(InventoryItem.id == listing.inventory_id).with_for_update()
        )
        if inventory is None or inventory.status != "reserved":
            raise HTTPException(409, "disputed_asset_unavailable")
        if body.resolution == "uphold":
            inventory.user_id = listing.buyer_id
            listing.status = "sold"
        else:
            inventory.user_id = listing.seller_id
            listing.status = "cancelled"
            db.add_all(
                [
                    EconomyLedger(
                        user_id=listing.buyer_id,
                        currency="coin",
                        delta=listing.price_coin,
                        source="marketplace.dispute.compensation",
                        idempotency_key=f"dispute:{dispute.id}:buyer-refund",
                        reason="Marketplace dispute compensation",
                        actor_id=user.id,
                        detail={"disputeId": dispute.id, "listingId": listing.id},
                    ),
                    EconomyLedger(
                        user_id=listing.seller_id,
                        currency="coin",
                        delta=-(
                            listing.price_coin - (listing.price_coin * listing.fee_percent // 100)
                        ),
                        source="marketplace.dispute.compensation",
                        idempotency_key=f"dispute:{dispute.id}:seller-reversal",
                        reason="Marketplace dispute compensation",
                        actor_id=user.id,
                        detail={
                            "disputeId": dispute.id,
                            "listingId": listing.id,
                            "reversedSellerProceeds": listing.price_coin
                            - (listing.price_coin * listing.fee_percent // 100),
                            "retainedBurnedFee": listing.price_coin * listing.fee_percent // 100,
                        },
                    ),
                ]
            )
        inventory.status = "available"
    else:
        offer = db.scalar(
            select(MarketplaceOffer)
            .where(MarketplaceOffer.id == dispute.target_id)
            .with_for_update()
        )
        listing = (
            db.scalar(
                select(MarketplaceListing)
                .where(MarketplaceListing.id == offer.listing_id)
                .with_for_update()
            )
            if offer
            else None
        )
        if offer is None or listing is None or offer.status != "disputed":
            raise HTTPException(409, "disputed_offer_unavailable")
        if body.resolution == "reverse":
            _release_offer(db, request, user, offer, "rejected")
            target = db.scalar(
                select(InventoryItem)
                .where(InventoryItem.id == listing.inventory_id)
                .with_for_update()
            )
            if utc(listing.expires_at) <= now():
                listing.status = "expired"
                if target and target.status == "reserved":
                    target.status = "available"
            else:
                listing.status = "active"
        else:
            if listing.status != "disputed":
                raise HTTPException(409, "disputed_listing_unavailable")
            target = db.scalar(
                select(InventoryItem)
                .where(InventoryItem.id == listing.inventory_id)
                .with_for_update()
            )
            target_item = db.get(ShopItem, target.item_id) if target else None
            offerer = db.get(User, offer.offerer_id)
            if (
                target is None
                or target.status != "reserved"
                or target_item is None
                or offerer is None
            ):
                raise HTTPException(409, "disputed_asset_unavailable")
            if target_item.eligible_roles and not set(target_item.eligible_roles) & set(
                offerer.roles
            ):
                raise HTTPException(409, "target_item_role_ineligible")
            if offer.offered_inventory_id:
                offered = db.scalar(
                    select(InventoryItem)
                    .where(InventoryItem.id == offer.offered_inventory_id)
                    .with_for_update()
                )
                offered_item = db.get(ShopItem, offered.item_id) if offered else None
                if offered is None or offered.status != "reserved" or offered_item is None:
                    raise HTTPException(409, "offered_asset_unavailable")
                if offered_item.eligible_roles and not set(offered_item.eligible_roles) & set(
                    user.roles
                ):
                    raise HTTPException(409, "offered_item_role_ineligible")
                offered.user_id = listing.seller_id
                offered.status = "available"
            target.user_id = offer.offerer_id
            target.status = "available"
            listing.status = "sold"
            listing.buyer_id = offer.offerer_id
            listing.buyer_idempotency_key = f"dispute:{dispute.id}"
            offer.status = "accepted"
            if offer.offer_coin:
                db.add(
                    EconomyLedger(
                        user_id=listing.seller_id,
                        currency="coin",
                        delta=offer.offer_coin,
                        source="marketplace.dispute.compensation",
                        idempotency_key=f"dispute:{dispute.id}:offer-settlement",
                        reason="Marketplace offer dispute settlement",
                        actor_id=user.id,
                        detail={"disputeId": dispute.id, "offerId": offer.id},
                    )
                )
            _expire_offers_for_listing(db, request, user, listing.id)
    dispute.status = "resolved"
    dispute.resolution = body.resolution
    dispute.resolved_by_id = user.id
    dispute.resolved_at = datetime.now(UTC)
    audit(
        db,
        request,
        "marketplace_dispute_resolved",
        user,
        {
            "disputeId": dispute.id,
            "targetType": dispute.target_type,
            "targetId": dispute.target_id,
            "resolution": body.resolution,
        },
    )
    db.flush()
    return _view(dispute) | {"replayed": False}
