"""Bounded supported shop catalog and atomic Coin-to-inventory purchases."""

import re
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import func, or_, select

from .auth import DB, Admin, Principal, audit, lock_admin
from .course_access import lock_actor
from .economy_rewards import record_exp_reward
from .models import (
    EconomyLedger,
    InventoryItem,
    MissionDefinition,
    MissionProgress,
    MissionStreakBoost,
    ShopItem,
    ShopPurchase,
    ShopRefund,
    ShopRefundPolicy,
    UserEquippedShopTitle,
    UserEquippedTitle,
    UserExpMultiplier,
    now,
)
from .security import utc
from .streak_boosts import expire_streak_boost

router = APIRouter(prefix="/v1")
EFFECTS = {
    "cosmetic",
    "title-token",
    "create-clan",
    "rename-clan",
    "practice-boost",
    "exp-voucher",
    "exp-multiplier",
    "streak-boost",
}


class ItemDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    itemKey: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    priceCoin: int = Field(ge=0, le=2_000_000_000)
    priceExp: int = Field(default=0, ge=0, le=2_000_000_000)
    stock: int = Field(ge=0, le=1_000_000)
    purchaseLimit: int = Field(default=1, ge=1, le=100)
    eligibleRoles: list[str] = Field(default_factory=list, max_length=6)
    effectType: str = Field(
        pattern=r"^(cosmetic|title-token|create-clan|rename-clan|practice-boost|exp-voucher|exp-multiplier|streak-boost)$"
    )
    effectConfig: dict[str, object] = Field(default_factory=dict)
    tradeable: bool = False
    discountPercent: int = Field(default=0, ge=0, le=100)
    discountStartsAt: datetime | None = None
    discountEndsAt: datetime | None = None

    @model_validator(mode="after")
    def validate_effect_config(self) -> "ItemDraft":
        if self.effectType == "title-token":
            title = self.effectConfig.get("title")
            if self.tradeable or (
                self.effectConfig
                and (
                    set(self.effectConfig) != {"title"}
                    or not isinstance(title, str)
                    or not title.strip()
                    or len(title) > 80
                )
            ):
                raise ValueError("invalid_shop_title_config")
        elif self.effectType == "exp-voucher":
            amount = self.effectConfig.get("exp")
            if (
                set(self.effectConfig) != {"exp"}
                or not isinstance(amount, int)
                or isinstance(amount, bool)
                or not 1 <= amount <= 2_000_000_000
                or self.tradeable
            ):
                raise ValueError("invalid_exp_voucher_config")
        elif self.effectType == "exp-multiplier":
            multiplier = self.effectConfig.get("multiplier")
            duration = self.effectConfig.get("durationHours")
            if (
                set(self.effectConfig) != {"multiplier", "durationHours"}
                or multiplier != 2
                or isinstance(multiplier, bool)
                or not isinstance(duration, int)
                or isinstance(duration, bool)
                or not 1 <= duration <= 168
                or self.tradeable
            ):
                raise ValueError("invalid_exp_multiplier_config")
        elif self.effectType == "streak-boost":
            mission_id = self.effectConfig.get("missionId")
            duration = self.effectConfig.get("durationHours")
            if (
                set(self.effectConfig) != {"missionId", "durationHours"}
                or not isinstance(mission_id, str)
                or not re.fullmatch(r"[A-Za-z0-9._-]{1,64}", mission_id)
                or not isinstance(duration, int)
                or isinstance(duration, bool)
                or not 1 <= duration <= 168
                or self.tradeable
            ):
                raise ValueError("invalid_streak_boost_config")
        elif self.effectConfig:
            raise ValueError("effect_config_not_supported")
        if self.discountPercent == 0:
            if self.discountStartsAt is not None or self.discountEndsAt is not None:
                raise ValueError("discount_window_requires_discount")
        elif (
            self.discountStartsAt is None
            or self.discountEndsAt is None
            or self.discountStartsAt.tzinfo is None
            or self.discountStartsAt.utcoffset() is None
            or self.discountEndsAt.tzinfo is None
            or self.discountEndsAt.utcoffset() is None
            or utc(self.discountEndsAt) <= utc(self.discountStartsAt)
        ):
            raise ValueError("invalid_discount_window")
        return self


class DiscountDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    discountPercent: int = Field(ge=0, le=100)
    discountStartsAt: datetime | None = None
    discountEndsAt: datetime | None = None

    @model_validator(mode="after")
    def validate_window(self) -> "DiscountDraft":
        if self.discountPercent == 0:
            if self.discountStartsAt is not None or self.discountEndsAt is not None:
                raise ValueError("discount_window_requires_discount")
        elif (
            self.discountStartsAt is None
            or self.discountEndsAt is None
            or self.discountStartsAt.tzinfo is None
            or self.discountStartsAt.utcoffset() is None
            or self.discountEndsAt.tzinfo is None
            or self.discountEndsAt.utcoffset() is None
            or utc(self.discountEndsAt) <= utc(self.discountStartsAt)
        ):
            raise ValueError("invalid_discount_window")
        return self


class PurchaseDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    itemId: uuid.UUID
    quantity: int = Field(default=1, ge=1, le=100)


class RefundPolicyDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool
    refundWindowHours: int = Field(ge=1, le=168)
    unusedOnly: bool = True

    @model_validator(mode="after")
    def require_unused_inventory(self) -> "RefundPolicyDraft":
        if not self.unusedOnly:
            raise ValueError("shop_refunds_require_unused_items")
        return self


class RefundRequestDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    reason: str = Field(min_length=10, max_length=1000)


class RefundDecisionDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: str = Field(pattern=r"^(approve|reject)$")


def _active_refund_policy(db: DB) -> ShopRefundPolicy:
    policy = db.scalar(
        select(ShopRefundPolicy)
        .where(ShopRefundPolicy.status == "active")
        .order_by(ShopRefundPolicy.version.desc())
    )
    if policy is None:
        raise HTTPException(503, "shop_refund_policy_unavailable")
    return policy


def _refund_policy_view(policy: ShopRefundPolicy) -> dict[str, object]:
    return {
        "version": policy.version,
        "enabled": policy.enabled,
        "refundWindowHours": policy.refund_window_hours,
        "unusedOnly": policy.unused_only,
    }


def _refund_view(refund: ShopRefund) -> dict[str, object]:
    return {
        "id": refund.id,
        "purchaseId": refund.purchase_id,
        "userId": refund.user_id,
        "policyVersion": refund.policy_version,
        "reason": refund.reason,
        "status": refund.status,
        "createdAt": utc(refund.created_at).isoformat(),
        "resolvedAt": utc(refund.resolved_at).isoformat() if refund.resolved_at else None,
    }


def _purchase_inventory(
    db: DB, purchase: ShopPurchase, *, lock: bool = False
) -> list[InventoryItem]:
    statement = select(InventoryItem).where(InventoryItem.purchase_id == purchase.id)
    if lock:
        statement = statement.with_for_update()
    return list(db.scalars(statement))


def _refund_ineligibility(db: DB, purchase: ShopPurchase, policy: ShopRefundPolicy) -> str | None:
    if not policy.enabled or not policy.unused_only:
        return "refund_policy_disabled"
    if utc(purchase.created_at) + timedelta(hours=policy.refund_window_hours) <= utc(now()):
        return "refund_window_expired"
    inventory = _purchase_inventory(db, purchase)
    if len(inventory) != purchase.quantity or any(item.status != "available" for item in inventory):
        return "purchase_item_already_used_or_reserved"
    inventory_ids = [item.id for item in inventory]
    if inventory_ids and db.scalar(
        select(UserEquippedShopTitle.inventory_id).where(
            UserEquippedShopTitle.inventory_id.in_(inventory_ids)
        )
    ):
        return "purchase_title_is_equipped"
    return None


def _view(item: ShopItem) -> dict[str, object]:
    instant = utc(now())
    discount_active = bool(
        item.discount_percent
        and item.discount_starts_at
        and item.discount_ends_at
        and utc(item.discount_starts_at) <= instant < utc(item.discount_ends_at)
    )
    current_price = (
        item.price_coin * (100 - item.discount_percent) // 100
        if discount_active
        else item.price_coin
    )
    return {
        "id": item.id,
        "itemKey": item.item_key,
        "name": item.name,
        "description": item.description,
        "priceCoin": item.price_coin,
        "priceExp": item.price_exp,
        "currentPriceCoin": current_price,
        "discountPercent": item.discount_percent,
        "discountStartsAt": utc(item.discount_starts_at).isoformat()
        if item.discount_starts_at
        else None,
        "discountEndsAt": utc(item.discount_ends_at).isoformat() if item.discount_ends_at else None,
        "discountActive": discount_active,
        "status": item.status,
        "stock": item.stock,
        "purchaseLimit": item.purchase_limit,
        "eligibleRoles": item.eligible_roles,
        "effectType": item.effect_type,
        "effectConfig": item.effect_config,
        "tradeable": item.tradeable,
    }


def _effective_price(item: ShopItem, instant: datetime) -> int:
    if (
        item.discount_percent
        and item.discount_starts_at
        and item.discount_ends_at
        and utc(item.discount_starts_at) <= utc(instant) < utc(item.discount_ends_at)
    ):
        return item.price_coin * (100 - item.discount_percent) // 100
    return item.price_coin


@router.get("/shop/items")
def catalog(db: DB, user: Principal) -> dict[str, object]:
    rows = db.scalars(
        select(ShopItem)
        .where(ShopItem.status == "active", ShopItem.stock > 0)
        .order_by(ShopItem.name)
    )
    return {
        "items": [
            _view(item)
            for item in rows
            if not item.eligible_roles or set(item.eligible_roles) & set(user.roles)
        ]
    }


@router.get("/admin/shop/items")
def admin_catalog(db: DB, _user: Admin) -> dict[str, object]:
    rows = db.scalars(select(ShopItem).order_by(ShopItem.name, ShopItem.id))
    return {"items": [_view(item) for item in rows]}


@router.get("/shop/refund-policy")
def refund_policy(db: DB, _user: Principal) -> dict[str, object]:
    return _refund_policy_view(_active_refund_policy(db))


@router.post("/admin/shop/refund-policies", status_code=201)
def publish_refund_policy(
    body: RefundPolicyDraft, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    lock_admin(db, request, user)
    previous = _active_refund_policy(db)
    previous.status = "retired"
    policy = ShopRefundPolicy(
        id=str(uuid.uuid4()),
        version=previous.version + 1,
        status="active",
        enabled=body.enabled,
        refund_window_hours=body.refundWindowHours,
        unused_only=body.unusedOnly,
        updated_by=user.id,
    )
    db.add(policy)
    audit(db, request, "shop_refund_policy_published", user, _refund_policy_view(policy))
    db.flush()
    return _refund_policy_view(policy)


@router.get("/me/shop/purchases")
def my_purchases(db: DB, user: Principal) -> dict[str, object]:
    rows = db.execute(
        select(ShopPurchase, ShopItem)
        .join(ShopItem, ShopItem.id == ShopPurchase.item_id)
        .where(ShopPurchase.user_id == user.id)
        .order_by(ShopPurchase.created_at.desc())
        .limit(100)
    ).all()
    items = []
    for purchase_row, shop_item in rows:
        policy = db.scalar(
            select(ShopRefundPolicy).where(
                ShopRefundPolicy.version == purchase_row.refund_policy_version
            )
        )
        refund = db.scalar(select(ShopRefund).where(ShopRefund.purchase_id == purchase_row.id))
        eligibility = (
            _refund_ineligibility(db, purchase_row, policy)
            if policy
            else "refund_policy_unavailable"
        )
        items.append(
            {
                "id": purchase_row.id,
                "itemName": shop_item.name,
                "quantity": purchase_row.quantity,
                "totalCoin": purchase_row.total_coin,
                "totalExp": purchase_row.total_exp,
                "createdAt": utc(purchase_row.created_at).isoformat(),
                "refund": _refund_view(refund) if refund else None,
                "canRequestRefund": refund is None and eligibility is None,
                "refundUnavailableReason": None if refund or eligibility is None else eligibility,
            }
        )
    return {"items": items}


@router.post("/shop/purchases/{purchase_id}/refund-requests", status_code=201)
def request_purchase_refund(
    purchase_id: uuid.UUID, body: RefundRequestDraft, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    purchase_row = db.scalar(
        select(ShopPurchase)
        .where(ShopPurchase.id == str(purchase_id), ShopPurchase.user_id == user.id)
        .with_for_update()
    )
    if purchase_row is None:
        raise HTTPException(404, "shop_purchase_not_found")
    existing = db.scalar(select(ShopRefund).where(ShopRefund.purchase_id == purchase_row.id))
    if existing:
        return _refund_view(existing) | {"replayed": True}
    policy = db.scalar(
        select(ShopRefundPolicy).where(
            ShopRefundPolicy.version == purchase_row.refund_policy_version
        )
    )
    if policy is None:
        raise HTTPException(409, "shop_refund_policy_unavailable")
    reason = _refund_ineligibility(db, purchase_row, policy)
    if reason:
        raise HTTPException(409, reason)
    inventory = _purchase_inventory(db, purchase_row, lock=True)
    for owned in inventory:
        owned.status = "reserved"
    refund = ShopRefund(
        id=str(uuid.uuid4()),
        purchase_id=purchase_row.id,
        user_id=user.id,
        policy_version=policy.version,
        reason=body.reason,
    )
    db.add(refund)
    audit(
        db,
        request,
        "shop_refund_requested",
        user,
        {"refundId": refund.id, "purchaseId": purchase_row.id, "policyVersion": policy.version},
    )
    db.flush()
    return _refund_view(refund) | {"replayed": False}


@router.get("/admin/shop/refunds")
def admin_refunds(db: DB, _user: Admin) -> dict[str, object]:
    rows = db.scalars(
        select(ShopRefund)
        .where(ShopRefund.status == "pending")
        .order_by(ShopRefund.created_at)
        .limit(250)
    )
    items = []
    for refund in rows:
        purchase_row = db.get(ShopPurchase, refund.purchase_id)
        shop_item = db.get(ShopItem, purchase_row.item_id) if purchase_row else None
        items.append(
            _refund_view(refund)
            | {
                "itemName": shop_item.name if shop_item else "Unavailable item",
                "totalCoin": purchase_row.total_coin if purchase_row else 0,
                "totalExp": purchase_row.total_exp if purchase_row else 0,
            }
        )
    return {"items": items}


@router.post("/admin/shop/refunds/{refund_id}/decisions")
def decide_refund(
    refund_id: uuid.UUID,
    body: RefundDecisionDraft,
    request: Request,
    db: DB,
    user: Admin,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=160),
) -> dict[str, object]:
    lock_admin(db, request, user)
    refund = db.scalar(select(ShopRefund).where(ShopRefund.id == str(refund_id)).with_for_update())
    if refund is None:
        raise HTTPException(404, "shop_refund_not_found")
    if refund.decision_key == idempotency_key:
        return _refund_view(refund) | {"replayed": True}
    if refund.status != "pending":
        raise HTTPException(409, "shop_refund_unavailable")
    purchase_row = db.scalar(
        select(ShopPurchase).where(ShopPurchase.id == refund.purchase_id).with_for_update()
    )
    if purchase_row is None:
        raise HTTPException(409, "shop_purchase_unavailable")
    inventory = _purchase_inventory(db, purchase_row, lock=True)
    if len(inventory) != purchase_row.quantity or any(
        owned.status != "reserved" for owned in inventory
    ):
        raise HTTPException(409, "shop_refund_inventory_unavailable")
    refund.decision_key = idempotency_key
    refund.resolved_by_id = user.id
    refund.resolved_at = utc(now())
    if body.decision == "approve":
        shop_item = db.scalar(
            select(ShopItem).where(ShopItem.id == purchase_row.item_id).with_for_update()
        )
        if shop_item is None:
            raise HTTPException(409, "shop_item_unavailable")
        for owned in inventory:
            owned.status = "refunded"
        shop_item.stock += purchase_row.quantity
        if purchase_row.total_coin:
            db.add(
                EconomyLedger(
                    user_id=purchase_row.user_id,
                    currency="coin",
                    delta=purchase_row.total_coin,
                    source="shop.refund",
                    idempotency_key=f"shop:refund:{refund.id}:coin",
                    reason="Approved shop purchase refund",
                    actor_id=user.id,
                    detail={
                        "refundId": refund.id,
                        "purchaseId": purchase_row.id,
                        "policyVersion": refund.policy_version,
                    },
                )
            )
        if purchase_row.total_exp:
            db.add(
                EconomyLedger(
                    user_id=purchase_row.user_id,
                    currency="exp",
                    delta=purchase_row.total_exp,
                    source="shop.refund",
                    idempotency_key=f"shop:refund:{refund.id}:exp",
                    reason="Approved shop purchase refund",
                    actor_id=user.id,
                    detail={
                        "refundId": refund.id,
                        "purchaseId": purchase_row.id,
                        "policyVersion": refund.policy_version,
                    },
                )
            )
        refund.status = "approved"
    else:
        for owned in inventory:
            owned.status = "available"
        refund.status = "rejected"
    audit(
        db,
        request,
        "shop_refund_decided",
        user,
        {
            "refundId": refund.id,
            "purchaseId": purchase_row.id,
            "decision": body.decision,
            "status": refund.status,
            "coin": purchase_row.total_coin if body.decision == "approve" else 0,
            "exp": purchase_row.total_exp if body.decision == "approve" else 0,
        },
    )
    db.flush()
    return _refund_view(refund) | {"replayed": False}


@router.get("/me/inventory")
def inventory(db: DB, user: Principal) -> dict[str, object]:
    rows = db.execute(
        select(InventoryItem, ShopItem)
        .join(ShopItem, ShopItem.id == InventoryItem.item_id)
        .where(InventoryItem.user_id == user.id)
        .order_by(InventoryItem.acquired_at.desc())
    ).all()
    equipped_title_ids = set(
        db.scalars(
            select(UserEquippedShopTitle.inventory_id).where(
                UserEquippedShopTitle.user_id == user.id
            )
        )
    )
    return {
        "items": [
            {
                "id": item.id,
                "status": item.status,
                "bound": item.bound,
                "equipped": item.id in equipped_title_ids,
                "acquiredAt": utc(item.acquired_at).isoformat(),
                "item": _view(shop),
            }
            for item, shop in rows
        ]
    }


@router.post("/admin/shop/items", status_code=201)
def create_item(body: ItemDraft, request: Request, db: DB, user: Admin) -> dict[str, object]:
    lock_admin(db, request, user)
    if body.effectType not in EFFECTS:
        raise HTTPException(422, "unsupported_effect")
    if db.scalar(select(ShopItem.id).where(ShopItem.item_key == body.itemKey)):
        raise HTTPException(409, "item_key_exists")
    if body.effectType == "streak-boost":
        mission = db.scalar(
            select(MissionDefinition)
            .where(
                MissionDefinition.mission_id == str(body.effectConfig["missionId"]),
                MissionDefinition.status == "active",
            )
            .order_by(MissionDefinition.version.desc())
        )
        if (
            mission is None
            or mission.target_count < 4
            or (
                mission.eligible_roles
                and body.eligibleRoles
                and not set(mission.eligible_roles) & set(body.eligibleRoles)
            )
        ):
            raise HTTPException(422, "streak_boost_requires_active_mission_target_of_four_or_more")
    item = ShopItem(
        id=str(uuid.uuid4()),
        item_key=body.itemKey,
        name=body.name,
        description=body.description,
        price_coin=body.priceCoin,
        price_exp=body.priceExp,
        stock=body.stock,
        purchase_limit=body.purchaseLimit,
        eligible_roles=body.eligibleRoles,
        effect_type=body.effectType,
        effect_config=body.effectConfig,
        discount_percent=body.discountPercent,
        discount_starts_at=utc(body.discountStartsAt) if body.discountStartsAt else None,
        discount_ends_at=utc(body.discountEndsAt) if body.discountEndsAt else None,
        tradeable=body.tradeable,
        author_id=user.id,
    )
    db.add(item)
    audit(
        db, request, "shop_item_created", user, {"itemId": item.id, "effectType": item.effect_type}
    )
    db.flush()
    return _view(item)


@router.patch("/admin/shop/items/{item_id}/discount")
def update_item_discount(
    item_id: uuid.UUID, body: DiscountDraft, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    lock_admin(db, request, user)
    item = db.scalar(select(ShopItem).where(ShopItem.id == str(item_id)).with_for_update())
    if item is None:
        raise HTTPException(404, "shop_item_not_found")
    previous = {
        "percent": item.discount_percent,
        "startsAt": utc(item.discount_starts_at).isoformat() if item.discount_starts_at else None,
        "endsAt": utc(item.discount_ends_at).isoformat() if item.discount_ends_at else None,
    }
    item.discount_percent = body.discountPercent
    item.discount_starts_at = utc(body.discountStartsAt) if body.discountStartsAt else None
    item.discount_ends_at = utc(body.discountEndsAt) if body.discountEndsAt else None
    audit(
        db,
        request,
        "shop_item_discount_updated",
        user,
        {
            "itemId": item.id,
            "previous": previous,
            "percent": item.discount_percent,
            "startsAt": utc(item.discount_starts_at).isoformat()
            if item.discount_starts_at
            else None,
            "endsAt": utc(item.discount_ends_at).isoformat() if item.discount_ends_at else None,
        },
    )
    db.flush()
    return _view(item)


@router.post("/shop/purchases", status_code=201)
def purchase(
    body: PurchaseDraft,
    request: Request,
    db: DB,
    user: Principal,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=160),
) -> dict[str, object]:
    lock_actor(db, request, user)
    prior = db.scalar(
        select(ShopPurchase).where(
            ShopPurchase.user_id == user.id, ShopPurchase.idempotency_key == idempotency_key
        )
    )
    if prior:
        if prior.item_id != str(body.itemId) or prior.quantity != body.quantity:
            raise HTTPException(409, "idempotency_key_reused")
        return {
            "purchaseId": prior.id,
            "itemId": prior.item_id,
            "quantity": prior.quantity,
            "totalCoin": prior.total_coin,
            "totalExp": prior.total_exp,
            "replayed": True,
        }
    item = db.scalar(select(ShopItem).where(ShopItem.id == str(body.itemId)).with_for_update())
    if item is None or item.status != "active":
        raise HTTPException(404, "shop_item_unavailable")
    if item.eligible_roles and not set(item.eligible_roles) & set(user.roles):
        raise HTTPException(403, "shop_item_role_ineligible")
    if item.stock < body.quantity:
        raise HTTPException(409, "shop_item_out_of_stock")
    purchased = (
        db.scalar(
            select(func.coalesce(func.sum(ShopPurchase.quantity), 0))
            .outerjoin(ShopRefund, ShopRefund.purchase_id == ShopPurchase.id)
            .where(
                ShopPurchase.user_id == user.id,
                ShopPurchase.item_id == item.id,
                or_(ShopRefund.id.is_(None), ShopRefund.status != "approved"),
            )
        )
        or 0
    )
    if purchased + body.quantity > item.purchase_limit:
        raise HTTPException(409, "purchase_limit_exceeded")
    unit_price = _effective_price(item, now())
    total_coin = unit_price * body.quantity
    total_exp = item.price_exp * body.quantity
    coin_balance = (
        db.scalar(
            select(func.coalesce(func.sum(EconomyLedger.delta), 0)).where(
                EconomyLedger.user_id == user.id, EconomyLedger.currency == "coin"
            )
        )
        or 0
    )
    if coin_balance < total_coin:
        raise HTTPException(409, "insufficient_coin")
    exp_balance = (
        db.scalar(
            select(func.coalesce(func.sum(EconomyLedger.delta), 0)).where(
                EconomyLedger.user_id == user.id, EconomyLedger.currency == "exp"
            )
        )
        or 0
    )
    if exp_balance < total_exp:
        raise HTTPException(409, "insufficient_exp")
    purchase_id = str(uuid.uuid4())
    refund_policy = _active_refund_policy(db)
    item.stock -= body.quantity
    db.add(
        ShopPurchase(
            id=purchase_id,
            user_id=user.id,
            item_id=item.id,
            quantity=body.quantity,
            total_coin=total_coin,
            total_exp=total_exp,
            refund_policy_version=refund_policy.version,
            idempotency_key=idempotency_key,
        )
    )
    if total_coin:
        db.add(
            EconomyLedger(
                user_id=user.id,
                currency="coin",
                delta=-total_coin,
                source="shop.purchase",
                idempotency_key=f"shop:{purchase_id}:coin",
                reason=f"Purchase {item.name}",
                actor_id=user.id,
                detail={"itemId": item.id, "quantity": body.quantity, "totalCoin": total_coin},
            )
        )
    if total_exp:
        db.add(
            EconomyLedger(
                user_id=user.id,
                currency="exp",
                delta=-total_exp,
                source="shop.purchase",
                idempotency_key=f"shop:{purchase_id}:exp",
                reason=f"Purchase {item.name}",
                actor_id=user.id,
                detail={"itemId": item.id, "quantity": body.quantity, "totalExp": total_exp},
            )
        )
    db.add_all(
        [
            InventoryItem(
                user_id=user.id, item_id=item.id, purchase_id=purchase_id, bound=not item.tradeable
            )
            for _ in range(body.quantity)
        ]
    )
    audit(
        db,
        request,
        "shop_purchase_completed",
        user,
        {
            "purchaseId": purchase_id,
            "itemId": item.id,
            "quantity": body.quantity,
            "totalCoin": total_coin,
            "totalExp": total_exp,
            "unitPriceCoin": unit_price,
            "discountPercent": item.discount_percent if unit_price < item.price_coin else 0,
        },
    )
    db.flush()
    return {
        "purchaseId": purchase_id,
        "itemId": item.id,
        "quantity": body.quantity,
        "totalCoin": total_coin,
        "totalExp": total_exp,
        "unitPriceCoin": unit_price,
        "discountPercent": item.discount_percent if unit_price < item.price_coin else 0,
        "replayed": False,
    }


@router.post("/inventory/{inventory_id}/activations")
def activate(
    inventory_id: uuid.UUID, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    owned = db.execute(
        select(InventoryItem, ShopItem)
        .join(ShopItem, ShopItem.id == InventoryItem.item_id)
        .where(InventoryItem.id == str(inventory_id), InventoryItem.user_id == user.id)
        .with_for_update()
    ).first()
    if owned is None:
        raise HTTPException(404, "inventory_item_not_found")
    item, shop = owned
    if item.status != "available":
        raise HTTPException(409, "inventory_item_unavailable")
    if shop.effect_type not in {
        "cosmetic",
        "title-token",
        "practice-boost",
        "exp-voucher",
        "exp-multiplier",
        "streak-boost",
    }:
        raise HTTPException(422, "effect_requires_domain_workflow")
    result: dict[str, object] = {"id": item.id, "status": "used", "effectType": shop.effect_type}
    if shop.effect_type == "title-token":
        configured_title = shop.effect_config.get("title", shop.name)
        if (
            item.bound is False
            or not isinstance(configured_title, str)
            or not configured_title.strip()
            or len(configured_title) > 80
        ):
            raise HTTPException(409, "shop_effect_configuration_invalid")
        equipped = db.get(UserEquippedShopTitle, user.id)
        if equipped is None:
            equipped = UserEquippedShopTitle(
                user_id=user.id,
                inventory_id=item.id,
                title=configured_title.strip(),
            )
            db.add(equipped)
        else:
            equipped.inventory_id = item.id
            equipped.title = configured_title.strip()
            equipped.equipped_at = utc(now())
        earned_title = db.get(UserEquippedTitle, user.id)
        if earned_title:
            db.delete(earned_title)
        result.update({"status": "available", "title": equipped.title, "equipped": True})
    if shop.effect_type == "exp-voucher":
        amount = shop.effect_config.get("exp")
        if not isinstance(amount, int) or isinstance(amount, bool) or amount <= 0:
            raise HTTPException(409, "shop_effect_configuration_invalid")
        record_exp_reward(
            db,
            user_id=user.id,
            amount=amount,
            source="shop.exp_voucher",
            idempotency_key=f"shop:activation:{item.id}:exp",
            reason=f"Redeem {shop.name}",
            actor_id=user.id,
            detail={"inventoryId": item.id, "itemId": shop.id},
        )
    if shop.effect_type == "exp-multiplier":
        multiplier = shop.effect_config.get("multiplier")
        duration_hours = shop.effect_config.get("durationHours")
        if (
            multiplier != 2
            or isinstance(multiplier, bool)
            or not isinstance(duration_hours, int)
            or isinstance(duration_hours, bool)
            or not 1 <= duration_hours <= 168
            or item.bound is False
        ):
            raise HTTPException(409, "shop_effect_configuration_invalid")
        instant = utc(now())
        boost = db.scalar(
            select(UserExpMultiplier).where(UserExpMultiplier.user_id == user.id).with_for_update()
        )
        end_from = max(instant, utc(boost.ends_at)) if boost else instant
        boost_end = end_from + timedelta(hours=duration_hours)
        if boost:
            if utc(boost.ends_at) <= instant:
                boost.starts_at = instant
            boost.multiplier = min(2, max(boost.multiplier, multiplier))
            boost.ends_at = boost_end
            boost.updated_at = instant
        else:
            boost = UserExpMultiplier(
                user_id=user.id,
                multiplier=multiplier,
                starts_at=instant,
                ends_at=boost_end,
                updated_at=instant,
            )
            db.add(boost)
        result["multiplier"] = boost.multiplier
        result["endsAt"] = utc(boost.ends_at).isoformat()
    if shop.effect_type == "streak-boost":
        mission_id = shop.effect_config.get("missionId")
        duration_hours = shop.effect_config.get("durationHours")
        if (
            not isinstance(mission_id, str)
            or not isinstance(duration_hours, int)
            or isinstance(duration_hours, bool)
            or not 1 <= duration_hours <= 168
            or item.bound is False
        ):
            raise HTTPException(409, "shop_effect_configuration_invalid")
        from .missions import _cycle

        instant = utc(now())
        definitions = list(
            db.scalars(
                select(MissionDefinition)
                .where(
                    MissionDefinition.mission_id == mission_id,
                    MissionDefinition.status == "active",
                )
                .order_by(MissionDefinition.version.desc())
            )
        )
        if not definitions:
            raise HTTPException(409, "streak_boost_mission_unavailable")
        provisional_cycle = _cycle(definitions[0], instant)
        existing_progress = db.scalar(
            select(MissionProgress)
            .where(
                MissionProgress.user_id == user.id,
                MissionProgress.mission_id == mission_id,
                MissionProgress.cycle_key == provisional_cycle,
            )
            .order_by(MissionProgress.mission_version.desc())
            .with_for_update()
        )
        mission = next(
            (
                row
                for row in definitions
                if existing_progress and row.version == existing_progress.mission_version
            ),
            definitions[0],
        )
        if mission.target_count < 4:
            raise HTTPException(409, "streak_boost_mission_target_unavailable")
        if mission.eligible_roles and not set(mission.eligible_roles) & set(user.roles):
            raise HTTPException(403, "streak_boost_mission_role_ineligible")
        cycle_key = _cycle(mission, instant)
        expire_streak_boost(
            db, user_id=user.id, mission_id=mission_id, cycle_key=cycle_key, instant=instant
        )
        pending = db.scalar(
            select(MissionStreakBoost.id)
            .where(
                MissionStreakBoost.user_id == user.id,
                MissionStreakBoost.mission_id == mission_id,
                MissionStreakBoost.cycle_key == cycle_key,
                MissionStreakBoost.consumed_at.is_(None),
                MissionStreakBoost.expired_at.is_(None),
                MissionStreakBoost.expires_at > instant,
            )
            .with_for_update()
        )
        if pending:
            raise HTTPException(409, "streak_boost_already_active")
        progress = existing_progress or db.scalar(
            select(MissionProgress)
            .where(
                MissionProgress.user_id == user.id,
                MissionProgress.mission_id == mission_id,
                MissionProgress.mission_version == mission.version,
                MissionProgress.cycle_key == cycle_key,
            )
            .with_for_update()
        )
        if progress and progress.status != "active":
            raise HTTPException(409, "streak_boost_mission_already_complete")
        if progress is None:
            progress = MissionProgress(
                user_id=user.id,
                mission_id=mission_id,
                mission_version=mission.version,
                cycle_key=cycle_key,
            )
            db.add(progress)
            db.flush()
        base_progress = progress.progress
        granted_progress = max(0, 3 - base_progress)
        progress.progress += granted_progress
        expires_at = instant + timedelta(hours=duration_hours)
        db.add(
            MissionStreakBoost(
                user_id=user.id,
                mission_id=mission_id,
                mission_version=mission.version,
                cycle_key=cycle_key,
                base_progress=base_progress,
                granted_progress=granted_progress,
                expires_at=expires_at,
            )
        )
        result.update(
            {
                "missionId": mission_id,
                "progress": progress.progress,
                "expiresAt": expires_at.isoformat(),
            }
        )
    if shop.effect_type != "title-token":
        item.status = "used"
    audit(
        db,
        request,
        "inventory_item_activated",
        user,
        {
            "inventoryId": item.id,
            "effectType": shop.effect_type,
            "multiplier": result.get("multiplier"),
            "endsAt": result.get("endsAt"),
            "missionId": result.get("missionId"),
            "expiresAt": result.get("expiresAt"),
        },
    )
    db.flush()
    return result
