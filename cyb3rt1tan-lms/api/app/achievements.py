"""Versioned trusted-event achievements and earned-title management."""

from itertools import pairwise
from typing import cast

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from .auth import DB, Admin, Principal, audit, lock_admin
from .course_access import lock_actor
from .economy_rewards import record_exp_reward
from .missions import EVENT_KEYS, ROLES
from .models import (
    Achievement,
    AchievementEventReceipt,
    AchievementVersion,
    EconomyLedger,
    UserAchievement,
    UserEquippedShopTitle,
    UserEquippedTitle,
    now,
)

router = APIRouter(prefix="/v1")


class AchievementTierDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    tierKey: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    name: str = Field(min_length=1, max_length=80)
    thresholdCount: int = Field(ge=1, le=1_000_000)
    exp: int = Field(default=0, ge=0, le=2_000_000_000)
    coin: int = Field(default=0, ge=0, le=2_000_000_000)
    title: str | None = Field(default=None, max_length=80)
    icon: str = Field(default="fa-medal", min_length=1, max_length=80)
    color: str = Field(default="#176b87", pattern=r"^#[0-9A-Fa-f]{6}$")


class AchievementDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    achievementId: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    version: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=1000)
    eventKey: str = Field(min_length=1, max_length=80)
    eligibleRoles: list[str] = Field(default_factory=list, max_length=6)
    tiers: list[AchievementTierDraft] = Field(min_length=1, max_length=20)


class EquipTitle(BaseModel):
    model_config = ConfigDict(extra="forbid")
    achievementId: str = Field(min_length=1, max_length=64)
    version: int = Field(ge=1)
    tierKey: str = Field(min_length=1, max_length=64)


def _version_view(
    version: AchievementVersion, progress: UserAchievement | None = None
) -> dict[str, object]:
    unlocked = set(progress.unlocked_tiers if progress else [])
    return {
        "achievementId": version.achievement_id,
        "version": version.version,
        "title": version.title,
        "description": version.description,
        "eventKey": version.event_key,
        "status": version.status,
        "progress": progress.progress if progress else 0,
        "tiers": [{**tier, "unlocked": str(tier["tierKey"]) in unlocked} for tier in version.tiers],
    }


def record_achievement_event(
    db: DB, request: Request, user: Principal, event_key: str, event_id: str
) -> None:
    if event_key not in EVENT_KEYS:
        return
    versions = list(
        db.scalars(
            select(AchievementVersion).where(
                AchievementVersion.event_key == event_key,
                AchievementVersion.status == "active",
            )
        )
    )
    for version in versions:
        if version.eligible_roles and not set(user.roles) & set(version.eligible_roles):
            continue
        duplicate = db.scalar(
            select(AchievementEventReceipt.id).where(
                AchievementEventReceipt.user_id == user.id,
                AchievementEventReceipt.achievement_id == version.achievement_id,
                AchievementEventReceipt.version == version.version,
                AchievementEventReceipt.source_event_id == event_id,
            )
        )
        if duplicate:
            continue
        progress = db.scalar(
            select(UserAchievement).where(
                UserAchievement.user_id == user.id,
                UserAchievement.achievement_id == version.achievement_id,
                UserAchievement.version == version.version,
            )
        )
        if progress is None:
            progress = UserAchievement(
                user_id=user.id,
                achievement_id=version.achievement_id,
                version=version.version,
                unlocked_tiers=[],
            )
            db.add(progress)
            db.flush()
        db.add(
            AchievementEventReceipt(
                user_id=user.id,
                achievement_id=version.achievement_id,
                version=version.version,
                source_event_id=event_id,
            )
        )
        old_count = progress.progress
        progress.progress += 1
        progress.updated_at = now()
        unlocked = list(progress.unlocked_tiers)
        for tier in version.tiers:
            threshold = cast(int, tier["thresholdCount"])
            tier_key = str(tier["tierKey"])
            if old_count < threshold <= progress.progress and tier_key not in unlocked:
                unlocked.append(tier_key)
                for currency, field in (("exp", "exp"), ("coin", "coin")):
                    amount = cast(int, tier[field])
                    if amount:
                        if currency == "exp":
                            record_exp_reward(
                                db,
                                user_id=user.id,
                                amount=amount,
                                source="achievement_reward",
                                idempotency_key=(
                                    f"achievement:{version.achievement_id}:v{version.version}:u:{user.id}"
                                    f":tier:{tier_key}:exp"
                                ),
                                reason=version.title + " · " + str(tier["name"]),
                                detail={
                                    "achievementId": version.achievement_id,
                                    "version": version.version,
                                    "tierKey": tier_key,
                                },
                            )
                            continue
                        db.add(
                            EconomyLedger(
                                user_id=user.id,
                                currency=currency,
                                delta=amount,
                                source="achievement_reward",
                                idempotency_key=f"achievement:{version.achievement_id}:v{version.version}:u:{user.id}:tier:{tier_key}:{currency}",
                                reason=version.title + " · " + str(tier["name"]),
                                detail={
                                    "achievementId": version.achievement_id,
                                    "version": version.version,
                                    "tierKey": tier_key,
                                },
                            )
                        )
                audit(
                    db,
                    request,
                    "achievement_unlocked",
                    user,
                    {
                        "achievementId": version.achievement_id,
                        "version": version.version,
                        "tierKey": tier_key,
                    },
                )
        progress.unlocked_tiers = unlocked


@router.get("/me/achievements")
def my_achievements(db: DB, user: Principal) -> dict[str, object]:
    versions = list(
        db.scalars(
            select(AchievementVersion)
            .where(
                AchievementVersion.status == "active",
            )
            .order_by(AchievementVersion.achievement_id)
        )
    )
    progress_rows = list(
        db.scalars(select(UserAchievement).where(UserAchievement.user_id == user.id))
    )
    progress_by_key = {(item.achievement_id, item.version): item for item in progress_rows}
    return {
        "items": [
            _version_view(item, progress_by_key.get((item.achievement_id, item.version)))
            for item in versions
        ]
    }


@router.get("/me/title")
def my_title(db: DB, user: Principal) -> dict[str, object] | None:
    shop_item = db.get(UserEquippedShopTitle, user.id)
    if shop_item:
        return {
            "title": shop_item.title,
            "source": "shop",
            "inventoryId": shop_item.inventory_id,
        }
    item = db.get(UserEquippedTitle, user.id)
    return (
        {
            "title": item.title,
            "achievementId": item.achievement_id,
            "version": item.version,
            "tierKey": item.tier_key,
            "source": "achievement",
        }
        if item
        else None
    )


@router.post("/me/titles/equip")
def equip_title(body: EquipTitle, request: Request, db: DB, user: Principal) -> dict[str, object]:
    lock_actor(db, request, user)
    progress = db.scalar(
        select(UserAchievement).where(
            UserAchievement.user_id == user.id,
            UserAchievement.achievement_id == body.achievementId,
            UserAchievement.version == body.version,
        )
    )
    if not progress or body.tierKey not in progress.unlocked_tiers:
        raise HTTPException(404, "earned_title_not_found")
    version = db.scalar(
        select(AchievementVersion).where(
            AchievementVersion.achievement_id == body.achievementId,
            AchievementVersion.version == body.version,
        )
    )
    tier = (
        next((item for item in version.tiers if item["tierKey"] == body.tierKey), None)
        if version
        else None
    )
    if not tier or not tier.get("title"):
        raise HTTPException(422, "achievement_tier_has_no_title")
    equipped = db.get(UserEquippedTitle, user.id)
    if equipped is None:
        equipped = UserEquippedTitle(
            user_id=user.id,
            achievement_id=body.achievementId,
            version=body.version,
            tier_key=body.tierKey,
            title=str(tier["title"]),
        )
        db.add(equipped)
    else:
        equipped.achievement_id = body.achievementId
        equipped.version = body.version
        equipped.tier_key = body.tierKey
        equipped.title = str(tier["title"])
        equipped.equipped_at = now()
    shop_title = db.get(UserEquippedShopTitle, user.id)
    if shop_title:
        db.delete(shop_title)
    audit(
        db,
        request,
        "achievement_title_equipped",
        user,
        {
            "achievementId": body.achievementId,
            "version": body.version,
            "tierKey": body.tierKey,
        },
    )
    return {
        "title": equipped.title,
        "achievementId": equipped.achievement_id,
        "version": equipped.version,
        "tierKey": equipped.tier_key,
    }


@router.delete("/me/title", status_code=204)
def clear_title(request: Request, db: DB, user: Principal) -> None:
    lock_actor(db, request, user)
    item = db.get(UserEquippedTitle, user.id)
    shop_item = db.get(UserEquippedShopTitle, user.id)
    if item or shop_item:
        if item:
            db.delete(item)
        if shop_item:
            db.delete(shop_item)
        audit(db, request, "achievement_title_cleared", user)


@router.get("/admin/achievements")
def list_achievements(db: DB, user: Admin) -> dict[str, object]:
    items = db.scalars(
        select(AchievementVersion).order_by(
            AchievementVersion.achievement_id, AchievementVersion.version.desc()
        )
    )
    return {"items": [_version_view(item) for item in items]}


@router.post("/admin/achievements", status_code=201)
def create_achievement(
    body: AchievementDraft, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    lock_admin(db, request, user)
    thresholds = [item.thresholdCount for item in body.tiers]
    keys = [item.tierKey for item in body.tiers]
    if (
        body.eventKey not in EVENT_KEYS
        or any(role not in ROLES for role in body.eligibleRoles)
        or len(set(body.eligibleRoles)) != len(body.eligibleRoles)
        or len(set(keys)) != len(keys)
        or any(left >= right for left, right in pairwise(thresholds))
    ):
        raise HTTPException(422, "invalid_achievement_policy")
    item = db.get(Achievement, body.achievementId)
    latest = item.current_version if item else 0
    if body.version != latest + 1:
        raise HTTPException(409, "achievement_version_conflict")
    if item is None:
        item = Achievement(id=body.achievementId, current_version=body.version)
        db.add(item)
    else:
        previous = db.scalar(
            select(AchievementVersion).where(
                AchievementVersion.achievement_id == item.id,
                AchievementVersion.version == item.current_version,
            )
        )
        if previous:
            previous.status = "retired"
        item.current_version = body.version
    version = AchievementVersion(
        achievement_id=item.id,
        version=body.version,
        title=body.title,
        description=body.description,
        event_key=body.eventKey,
        eligible_roles=body.eligibleRoles,
        tiers=[tier.model_dump() for tier in body.tiers],
        status="active",
        author_id=user.id,
    )
    db.add(version)
    audit(
        db,
        request,
        "achievement_version_created",
        user,
        {
            "achievementId": body.achievementId,
            "version": body.version,
            "eventKey": body.eventKey,
            "tierCount": len(body.tiers),
        },
    )
    return _version_view(version)
