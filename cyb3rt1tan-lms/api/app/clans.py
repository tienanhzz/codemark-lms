"""Clan membership, internal permissions, approved Clan EXP and leaderboard."""

import re
import unicodedata
import uuid
from datetime import datetime
from itertools import pairwise
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Header, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import String, cast, func, or_, select

from .auth import DB, Admin, Principal, audit, lock_admin
from .course_access import course_for, lock_actor
from .economy_rewards import record_exp_reward
from .models import (
    Clan,
    ClanCompetitionAward,
    ClanExpLedger,
    ClanLevelRule,
    ClanMembership,
    ClanMissionDefinition,
    ClanMissionProgress,
    ClanMissionReceipt,
    ClanPolicy,
    ClanRole,
    ClanWar,
    ClanWarProposal,
    Course,
    EconomyLedger,
    InventoryItem,
    ShopItem,
    User,
    now,
)
from .security import utc

router = APIRouter(prefix="/v1")
INTERNAL_PERMISSIONS = {"membership.manage", "roles.manage", "activities.manage"}
LEVELS = (
    (1, 0, "fa-shield", "#176b87"),
    (2, 100, "fa-shield-halved", "#378b91"),
    (3, 500, "fa-chess-knight", "#c79425"),
    (4, 1500, "fa-crown", "#a45b91"),
    (5, 4000, "fa-dragon", "#af4b3e"),
)
RESERVED_NAMES = {"admin", "administrator", "moderator", "system", "codemark", "support"}


class ClanCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=3, max_length=40)
    inventoryId: uuid.UUID


class ClanInvitation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    userId: uuid.UUID


class MembershipDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    requestId: uuid.UUID
    decision: str = Field(pattern=r"^(approve|reject)$")


class ClanRename(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    newName: str = Field(min_length=3, max_length=40)
    inventoryId: uuid.UUID


class RoleDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    roleKey: str = Field(min_length=2, max_length=64, pattern=r"^[a-zA-Z0-9._-]+$")
    name: str = Field(min_length=2, max_length=80)
    permissions: list[str] = Field(default_factory=list, max_length=3)


class RoleAssignment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    roleKey: str = Field(min_length=2, max_length=64)


class OwnerTransfer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    userId: uuid.UUID


class ClanExpGrant(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    delta: int = Field(gt=0, le=2_000_000_000)
    reason: str = Field(min_length=10, max_length=500)


class ClanLevelDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    level: int = Field(ge=1, le=100)
    thresholdExp: int = Field(ge=0, le=2_000_000_000)
    memberCap: int = Field(ge=1, le=1000)
    icon: str = Field(default="fa-shield", min_length=1, max_length=80, pattern=r"^fa-[a-z0-9-]+$")
    color: str = Field(default="#176b87", pattern=r"^#[0-9A-Fa-f]{6}$")


class ClanPolicyDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    levels: list[ClanLevelDraft] = Field(min_length=1, max_length=100)


class ClanWarDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=3, max_length=160)
    clanAId: uuid.UUID
    clanBId: uuid.UUID
    startsAt: datetime
    expReward: int = Field(default=0, ge=0, le=2_000_000_000)
    competitionType: str = Field(default="war", pattern=r"^(war|code|writing)$")
    rewardExp: int = Field(default=0, ge=0, le=2_000_000_000)
    rewardCoin: int = Field(default=0, ge=0, le=2_000_000_000)
    rewardItemId: uuid.UUID | None = None
    rewardItemQuantity: int = Field(default=0, ge=0, le=10)

    @model_validator(mode="after")
    def validate_competition_rewards(self) -> "ClanWarDraft":
        if (self.rewardItemId is None) != (self.rewardItemQuantity == 0):
            raise ValueError("reward_item_and_quantity_must_be_configured_together")
        if self.competitionType == "war" and (
            self.rewardExp or self.rewardCoin or self.rewardItemId
        ):
            raise ValueError("participant_rewards_require_code_or_writing_competition")
        return self


class ClanWarResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    outcome: str = Field(pattern=r"^(clan_a|clan_b|draw|cancelled)$")
    participantIds: list[uuid.UUID] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def unique_participants(self) -> "ClanWarResult":
        if len(set(self.participantIds)) != len(self.participantIds):
            raise ValueError("duplicate_competition_participant")
        if self.outcome == "cancelled" and self.participantIds:
            raise ValueError("cancelled_competition_has_no_participants")
        return self


class ClanMissionDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    missionId: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    title: str = Field(min_length=1, max_length=160)
    eventKey: str = Field(
        pattern=r"^(practice.attempt|practice.correct|attendance.present|lesson.completed|assessment.submitted)$"
    )
    targetCount: int = Field(ge=1, le=1_000_000)
    cadence: str = Field(default="weekly", pattern=r"^(daily|weekly|once)$")
    timeZone: str = Field(default="Asia/Bangkok", min_length=1, max_length=64)
    rewardClanExp: int = Field(default=0, ge=0, le=2_000_000_000)
    rewardExp: int = Field(default=0, ge=0, le=2_000_000_000)
    rewardCoin: int = Field(default=0, ge=0, le=2_000_000_000)


class ClanWarProposalDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(default="", max_length=1000)
    clanAId: uuid.UUID
    clanBId: uuid.UUID
    startsAt: datetime
    competitionType: str = Field(default="war", pattern=r"^(war|code|writing)$")


class ClanWarProposalDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: str = Field(pattern=r"^(approve|reject)$")
    expReward: int = Field(default=0, ge=0, le=2_000_000_000)
    rewardExp: int = Field(default=0, ge=0, le=2_000_000_000)
    rewardCoin: int = Field(default=0, ge=0, le=2_000_000_000)
    rewardItemId: uuid.UUID | None = None
    rewardItemQuantity: int = Field(default=0, ge=0, le=10)

    @model_validator(mode="after")
    def validate_item_reward(self) -> "ClanWarProposalDecision":
        if (self.rewardItemId is None) != (self.rewardItemQuantity == 0):
            raise ValueError("reward_item_and_quantity_must_be_configured_together")
        return self


def _name(value: str) -> tuple[str, str]:
    name = unicodedata.normalize("NFC", " ".join(value.split()))
    if not re.fullmatch(r"[\w -]{3,40}", name, flags=re.UNICODE):
        raise HTTPException(422, "invalid_clan_name")
    key = name.casefold()
    if key in RESERVED_NAMES:
        raise HTTPException(422, "clan_name_rejected")
    return name, key


def _member(db: DB, clan_id: str, user_id: str) -> ClanMembership | None:
    return db.scalar(
        select(ClanMembership).where(
            ClanMembership.clan_id == clan_id,
            ClanMembership.user_id == user_id,
            ClanMembership.status == "active",
        )
    )


def _permissions(db: DB, clan: Clan, user: Principal) -> set[str]:
    if user.id == clan.owner_id:
        return set(INTERNAL_PERMISSIONS)
    membership = _member(db, clan.id, user.id)
    if not membership:
        return set()
    role = db.scalar(
        select(ClanRole).where(
            ClanRole.clan_id == clan.id,
            ClanRole.role_key == membership.role_key,
        )
    )
    return set(role.permissions if role else []) & INTERNAL_PERMISSIONS


def _view(db: DB, clan: Clan, user: Principal, include_members: bool = False) -> dict[str, object]:
    count = int(
        db.scalar(
            select(func.count())
            .select_from(ClanMembership)
            .where(
                ClanMembership.clan_id == clan.id,
                ClanMembership.status == "active",
            )
        )
        or 0
    )
    result: dict[str, object] = {
        "id": clan.id,
        "name": clan.name,
        "ownerId": clan.owner_id,
        "level": clan.level,
        "clanExp": clan.clan_exp,
        "memberCount": count,
        "memberCap": clan.member_cap,
        "icon": clan.icon,
        "color": clan.color,
        "createdAt": utc(clan.created_at).isoformat(),
        "isMember": _member(db, clan.id, user.id) is not None,
        "canManageMembership": "membership.manage" in _permissions(db, clan, user),
        "canManageRoles": "roles.manage" in _permissions(db, clan, user),
    }
    if include_members and _member(db, clan.id, user.id):
        members = db.execute(
            select(ClanMembership, User)
            .join(User, User.id == ClanMembership.user_id)
            .where(ClanMembership.clan_id == clan.id, ClanMembership.status == "active")
            .order_by(ClanMembership.joined_at, User.official_name)
        )
        result["members"] = [
            {
                "userId": member.user_id,
                "name": account.nickname or account.official_name,
                "roleKey": member.role_key,
                "isOwner": member.user_id == clan.owner_id,
            }
            for member, account in members
        ]
        if "membership.manage" in _permissions(db, clan, user):
            pending = db.execute(
                select(ClanMembership, User)
                .join(User, User.id == ClanMembership.user_id)
                .where(
                    ClanMembership.clan_id == clan.id,
                    ClanMembership.status.in_(["requested", "invited"]),
                )
                .order_by(ClanMembership.created_at)
            )
            result["pending"] = [
                {
                    "id": item.id,
                    "userId": item.user_id,
                    "name": account.nickname or account.official_name,
                    "username": account.username,
                    "status": item.status,
                }
                for item, account in pending
            ]
        result["roles"] = [
            {"roleKey": role.role_key, "name": role.name, "permissions": role.permissions}
            for role in db.scalars(
                select(ClanRole).where(ClanRole.clan_id == clan.id).order_by(ClanRole.role_key)
            )
        ]
    else:
        own = db.scalar(
            select(ClanMembership).where(
                ClanMembership.clan_id == clan.id,
                ClanMembership.user_id == user.id,
                ClanMembership.status.in_(["invited", "requested"]),
            )
        )
        if own:
            result["myRequest"] = {"id": own.id, "status": own.status}
    return result


def _consume_card(db: DB, user: Principal, inventory_id: uuid.UUID, effect: str) -> None:
    pair = db.execute(
        select(InventoryItem, ShopItem)
        .join(ShopItem, ShopItem.id == InventoryItem.item_id)
        .where(InventoryItem.id == str(inventory_id), InventoryItem.user_id == user.id)
        .with_for_update()
    ).first()
    if not pair:
        raise HTTPException(404, "inventory_item_not_found")
    inventory, item = pair
    if inventory.status != "available" or not inventory.bound or item.effect_type != effect:
        raise HTTPException(409, "eligible_clan_card_required")
    inventory.status = "used"


def _sync_level(db: DB, clan: Clan) -> None:
    policy = db.scalar(select(ClanPolicy).where(ClanPolicy.status == "active"))
    if policy:
        configured = list(
            db.scalars(
                select(ClanLevelRule)
                .where(ClanLevelRule.policy_id == policy.id)
                .order_by(ClanLevelRule.level)
            )
        )
        levels = [rule for rule in configured if clan.clan_exp >= rule.threshold_exp]
        if levels:
            current = levels[-1]
            clan.level, clan.member_cap, clan.icon, clan.color = (
                current.level,
                current.member_cap,
                current.icon,
                current.color,
            )
        return
    fallback_levels = [item for item in LEVELS if clan.clan_exp >= item[1]]
    clan.level, _threshold, clan.icon, clan.color = fallback_levels[-1]
    clan.member_cap = min(100, 20 + (clan.level - 1) * 5)


@router.get("/clans")
def list_clans(db: DB, user: Principal) -> dict[str, object]:
    rows = db.scalars(
        select(Clan)
        .where(Clan.status == "active")
        .order_by(Clan.clan_exp.desc(), Clan.created_at, Clan.id)
        .limit(100)
    )
    return {"items": [_view(db, clan, user) for clan in rows]}


@router.get("/clans/leaderboard")
def clan_leaderboard(db: DB, user: Principal) -> dict[str, object]:
    rows = db.scalars(
        select(Clan)
        .where(Clan.status == "active")
        .order_by(Clan.clan_exp.desc(), Clan.created_at, Clan.id)
        .limit(100)
    )
    return {
        "items": [
            {
                "rank": index,
                "clanId": clan.id,
                "name": clan.name,
                "level": clan.level,
                "clanExp": clan.clan_exp,
                "memberCount": int(
                    db.scalar(
                        select(func.count())
                        .select_from(ClanMembership)
                        .where(ClanMembership.clan_id == clan.id, ClanMembership.status == "active")
                    )
                    or 0
                ),
                "memberCap": clan.member_cap,
                "icon": clan.icon,
                "color": clan.color,
                "warRecord": _war_record(db, clan.id),
            }
            for index, clan in enumerate(rows, start=1)
        ]
    }


def _war_record(db: DB, clan_id: str) -> dict[str, int]:
    rows = db.scalars(
        select(ClanWar).where(
            ClanWar.status == "completed",
            or_(ClanWar.clan_a_id == clan_id, ClanWar.clan_b_id == clan_id),
        )
    )
    record = {"wins": 0, "losses": 0, "draws": 0}
    for war in rows:
        if war.outcome == "draw":
            record["draws"] += 1
        elif war.winner_clan_id == clan_id:
            record["wins"] += 1
        else:
            record["losses"] += 1
    return record


@router.get("/clan-wars")
def list_clan_wars(db: DB, _user: Principal) -> dict[str, object]:
    wars = db.scalars(select(ClanWar).order_by(ClanWar.starts_at.desc(), ClanWar.id).limit(100))
    return {"items": [_war_view(db, war) for war in wars]}


@router.get("/admin/clan-wars/{war_id}/participants")
def clan_war_participants(war_id: uuid.UUID, db: DB, _user: Admin) -> dict[str, object]:
    war = db.get(ClanWar, str(war_id))
    if war is None:
        raise HTTPException(404, "clan_war_not_found")
    rows = db.execute(
        select(ClanMembership.clan_id, ClanMembership.user_id, User.official_name, User.nickname)
        .join(User, User.id == ClanMembership.user_id)
        .where(
            ClanMembership.clan_id.in_([war.clan_a_id, war.clan_b_id]),
            ClanMembership.status == "active",
            User.status == "active",
        )
        .order_by(ClanMembership.clan_id, User.official_name, User.id)
    )
    return {
        "items": [
            {"userId": user_id, "clanId": clan_id, "name": nickname or official_name}
            for clan_id, user_id, official_name, nickname in rows
        ]
    }


def _war_view(db: DB, war: ClanWar) -> dict[str, object]:
    a = db.get(Clan, war.clan_a_id)
    b = db.get(Clan, war.clan_b_id)
    reward_item = db.get(ShopItem, war.reward_item_id) if war.reward_item_id else None
    award_count = int(
        db.scalar(
            select(func.count())
            .select_from(ClanCompetitionAward)
            .where(ClanCompetitionAward.war_id == war.id)
        )
        or 0
    )
    return {
        "id": war.id,
        "title": war.title,
        "clanA": {"id": war.clan_a_id, "name": a.name if a else ""},
        "clanB": {"id": war.clan_b_id, "name": b.name if b else ""},
        "startsAt": utc(war.starts_at).isoformat(),
        "status": war.status,
        "outcome": war.outcome,
        "winnerClanId": war.winner_clan_id,
        "expReward": war.exp_reward,
        "competitionType": war.competition_type,
        "participantReward": {
            "exp": war.reward_exp,
            "coin": war.reward_coin,
            "itemName": reward_item.name if reward_item else None,
            "itemQuantity": war.reward_item_quantity,
        },
        "participantsAwarded": award_count,
    }


def _reward_item(
    db: DB,
    competition_type: str,
    reward_exp: int,
    reward_coin: int,
    reward_item_id: uuid.UUID | None,
    reward_item_quantity: int,
) -> ShopItem | None:
    if competition_type == "war" and (reward_exp or reward_coin or reward_item_id):
        raise HTTPException(422, "participant_rewards_require_code_or_writing_competition")
    if (reward_item_id is None) != (reward_item_quantity == 0):
        raise HTTPException(422, "reward_item_and_quantity_must_be_configured_together")
    if reward_item_id is None:
        return None
    item = db.scalar(
        select(ShopItem)
        .where(ShopItem.id == str(reward_item_id), ShopItem.status == "active")
        .with_for_update()
    )
    if item is None:
        raise HTTPException(422, "competition_reward_item_unavailable")
    return item


@router.post("/admin/clan-wars", status_code=201)
def create_clan_war(body: ClanWarDraft, request: Request, db: DB, user: Admin) -> dict[str, object]:
    lock_admin(db, request, user)
    a = db.scalar(select(Clan).where(Clan.id == str(body.clanAId), Clan.status == "active"))
    b = db.scalar(select(Clan).where(Clan.id == str(body.clanBId), Clan.status == "active"))
    if not a or not b or a.id == b.id:
        raise HTTPException(422, "two_distinct_active_clans_required")
    if body.startsAt.tzinfo is None:
        raise HTTPException(422, "timezone_required")
    reward_item = _reward_item(
        db,
        body.competitionType,
        body.rewardExp,
        body.rewardCoin,
        body.rewardItemId,
        body.rewardItemQuantity,
    )
    war = ClanWar(
        title=body.title,
        clan_a_id=a.id,
        clan_b_id=b.id,
        starts_at=body.startsAt,
        competition_type=body.competitionType,
        exp_reward=body.expReward,
        reward_exp=body.rewardExp,
        reward_coin=body.rewardCoin,
        reward_item_id=reward_item.id if reward_item else None,
        reward_item_quantity=body.rewardItemQuantity,
        created_by_id=user.id,
    )
    db.add(war)
    db.flush()
    audit(
        db, request, "clan_war_scheduled", user, {"warId": war.id, "clanAId": a.id, "clanBId": b.id}
    )
    return _war_view(db, war)


@router.post("/admin/clan-wars/{war_id}/results")
def finalize_clan_war(
    war_id: uuid.UUID, body: ClanWarResult, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    lock_admin(db, request, user)
    war = db.scalar(select(ClanWar).where(ClanWar.id == str(war_id)).with_for_update())
    if not war:
        raise HTTPException(404, "clan_war_not_found")
    if war.status != "scheduled":
        prior_participants = set(
            db.scalars(
                select(ClanCompetitionAward.user_id).where(ClanCompetitionAward.war_id == war.id)
            )
        )
        if war.outcome == body.outcome and prior_participants == {
            str(item) for item in body.participantIds
        }:
            return _war_view(db, war)
        raise HTTPException(409, "clan_war_already_finalized")
    if utc(war.starts_at) > utc(now()):
        raise HTTPException(409, "clan_war_not_started")
    participant_ids = {str(item) for item in body.participantIds}
    if war.competition_type == "war" and participant_ids:
        raise HTTPException(422, "participants_require_code_or_writing_competition")
    has_participant_reward = bool(war.reward_exp or war.reward_coin or war.reward_item_id)
    if body.outcome != "cancelled" and has_participant_reward and not participant_ids:
        raise HTTPException(422, "competition_participants_required_for_rewards")
    participants: dict[str, tuple[str, list[str]]] = {}
    if participant_ids:
        rows = db.execute(
            select(ClanMembership.clan_id, ClanMembership.user_id, User.roles)
            .join(User, User.id == ClanMembership.user_id)
            .where(
                ClanMembership.clan_id.in_([war.clan_a_id, war.clan_b_id]),
                ClanMembership.status == "active",
                User.status == "active",
                User.id.in_(participant_ids),
            )
        )
        participants = {user_id: (clan_id, roles) for clan_id, user_id, roles in rows}
        if participants.keys() != participant_ids:
            raise HTTPException(422, "participants_must_be_active_members_of_competing_clans")
    reward_item = None
    if body.outcome != "cancelled" and war.reward_item_id:
        reward_item = db.scalar(
            select(ShopItem)
            .where(ShopItem.id == war.reward_item_id, ShopItem.status == "active")
            .with_for_update()
        )
        total_item_quantity = len(participant_ids) * war.reward_item_quantity
        if reward_item is None or reward_item.stock < total_item_quantity:
            raise HTTPException(409, "competition_reward_item_stock_unavailable")
        if reward_item.eligible_roles and any(
            not set(reward_item.eligible_roles) & set(roles) for _, roles in participants.values()
        ):
            raise HTTPException(422, "competition_reward_item_role_ineligible")
    if body.outcome == "cancelled":
        war.status = "cancelled"
        war.outcome = "cancelled"
    else:
        war.status = "completed"
        war.outcome = body.outcome
        if body.outcome in {"clan_a", "clan_b"}:
            winner_id = war.clan_a_id if body.outcome == "clan_a" else war.clan_b_id
            war.winner_clan_id = winner_id
            winner = db.scalar(select(Clan).where(Clan.id == winner_id).with_for_update())
            assert winner is not None
            if war.exp_reward:
                winner.clan_exp += war.exp_reward
                _sync_level(db, winner)
                db.add(
                    ClanExpLedger(
                        clan_id=winner.id,
                        delta=war.exp_reward,
                        source="clan_war.win",
                        idempotency_key=f"clan-war:{war.id}:winner",
                        reason=war.title,
                        actor_id=user.id,
                    )
                )
        else:
            for clan_id, amount, suffix in (
                (war.clan_a_id, war.exp_reward // 2, "a"),
                (war.clan_b_id, war.exp_reward // 2, "b"),
            ):
                if amount:
                    clan = db.scalar(select(Clan).where(Clan.id == clan_id).with_for_update())
                    assert clan is not None
                    clan.clan_exp += amount
                    _sync_level(db, clan)
                    db.add(
                        ClanExpLedger(
                            clan_id=clan.id,
                            delta=amount,
                            source="clan_war.draw",
                            idempotency_key=f"clan-war:{war.id}:{suffix}",
                            reason=war.title,
                            actor_id=user.id,
                        )
                    )
        if reward_item and war.reward_item_quantity:
            reward_item.stock -= len(participant_ids) * war.reward_item_quantity
        for participant_id, (clan_id, _roles) in participants.items():
            if war.reward_exp:
                record_exp_reward(
                    db,
                    user_id=participant_id,
                    amount=war.reward_exp,
                    source="clan_competition.exp_award",
                    idempotency_key=f"clan-war:{war.id}:participant:{participant_id}:exp",
                    reason=war.title,
                    actor_id=user.id,
                    detail={
                        "warId": war.id,
                        "competitionType": war.competition_type,
                        "clanId": clan_id,
                    },
                )
            if war.reward_coin:
                db.add(
                    EconomyLedger(
                        user_id=participant_id,
                        currency="coin",
                        delta=war.reward_coin,
                        source="clan_competition.coin_award",
                        idempotency_key=f"clan-war:{war.id}:participant:{participant_id}:coin",
                        reason=war.title,
                        actor_id=user.id,
                        detail={
                            "warId": war.id,
                            "competitionType": war.competition_type,
                            "clanId": clan_id,
                        },
                    )
                )
            if reward_item and war.reward_item_quantity:
                db.add_all(
                    [
                        InventoryItem(
                            user_id=participant_id,
                            item_id=reward_item.id,
                            purchase_id=str(
                                uuid.uuid5(
                                    uuid.NAMESPACE_URL,
                                    f"clan-competition:{war.id}:{participant_id}",
                                )
                            ),
                            bound=True,
                        )
                        for _ in range(war.reward_item_quantity)
                    ]
                )
            db.add(
                ClanCompetitionAward(
                    war_id=war.id,
                    clan_id=clan_id,
                    user_id=participant_id,
                    reward_exp=war.reward_exp,
                    reward_coin=war.reward_coin,
                    item_quantity=war.reward_item_quantity if reward_item else 0,
                )
            )
    war.finalized_by_id = user.id
    war.finalized_at = now()
    audit(
        db,
        request,
        "clan_war_finalized",
        user,
        {
            "warId": war.id,
            "outcome": body.outcome,
            "expReward": war.exp_reward,
            "competitionType": war.competition_type,
            "participantCount": len(participant_ids),
            "participantExp": war.reward_exp,
            "participantCoin": war.reward_coin,
            "rewardItemId": war.reward_item_id,
        },
    )
    db.flush()
    return _war_view(db, war)


def _proposal_view(db: DB, proposal: ClanWarProposal) -> dict[str, object]:
    course = db.get(Course, proposal.course_id)
    a = db.get(Clan, proposal.clan_a_id)
    b = db.get(Clan, proposal.clan_b_id)
    author = db.get(User, proposal.author_id)
    return {
        "id": proposal.id,
        "courseId": proposal.course_id,
        "courseTitle": course.title if course else "",
        "authorName": author.nickname or author.official_name if author else "",
        "title": proposal.title,
        "description": proposal.description,
        "clanA": {"id": proposal.clan_a_id, "name": a.name if a else ""},
        "clanB": {"id": proposal.clan_b_id, "name": b.name if b else ""},
        "startsAt": utc(proposal.starts_at).isoformat(),
        "competitionType": proposal.competition_type,
        "status": proposal.status,
        "warId": proposal.war_id,
    }


@router.post("/courses/{course_id}/clan-war-proposals", status_code=201)
def create_clan_war_proposal(
    course_id: uuid.UUID, body: ClanWarProposalDraft, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "events.manage", write=True)
    if body.startsAt.tzinfo is None or body.startsAt.utcoffset() is None:
        raise HTTPException(422, "explicit_offset_required")
    first = db.scalar(select(Clan).where(Clan.id == str(body.clanAId), Clan.status == "active"))
    second = db.scalar(select(Clan).where(Clan.id == str(body.clanBId), Clan.status == "active"))
    if not first or not second or first.id == second.id:
        raise HTTPException(422, "two_distinct_active_clans_required")
    proposal = ClanWarProposal(
        course_id=course.id,
        author_id=user.id,
        title=body.title,
        description=body.description,
        clan_a_id=first.id,
        clan_b_id=second.id,
        starts_at=body.startsAt,
        competition_type=body.competitionType,
    )
    db.add(proposal)
    db.flush()
    audit(
        db,
        request,
        "clan_war_proposed",
        user,
        {
            "proposalId": proposal.id,
            "courseId": course.id,
            "clanAId": first.id,
            "clanBId": second.id,
        },
    )
    return _proposal_view(db, proposal)


@router.get("/admin/clan-war-proposals")
def list_clan_war_proposals(db: DB, _user: Admin, status: str = "pending") -> dict[str, object]:
    if status not in {"pending", "approved", "rejected", "all"}:
        raise HTTPException(422, "invalid_proposal_status")
    query = select(ClanWarProposal).order_by(ClanWarProposal.created_at.desc()).limit(100)
    if status != "all":
        query = query.where(ClanWarProposal.status == status)
    return {"items": [_proposal_view(db, item) for item in db.scalars(query)]}


@router.post("/admin/clan-war-proposals/{proposal_id}/decisions")
def decide_clan_war_proposal(
    proposal_id: uuid.UUID, body: ClanWarProposalDecision, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    lock_admin(db, request, user)
    proposal = db.scalar(
        select(ClanWarProposal).where(ClanWarProposal.id == str(proposal_id)).with_for_update()
    )
    if not proposal:
        raise HTTPException(404, "clan_war_proposal_not_found")
    expected = "approved" if body.decision == "approve" else "rejected"
    if proposal.status != "pending":
        if proposal.status == expected:
            return _proposal_view(db, proposal)
        raise HTTPException(409, "proposal_already_decided")
    if body.decision == "approve":
        reward_item = _reward_item(
            db,
            proposal.competition_type,
            body.rewardExp,
            body.rewardCoin,
            body.rewardItemId,
            body.rewardItemQuantity,
        )
        war = ClanWar(
            title=proposal.title,
            clan_a_id=proposal.clan_a_id,
            clan_b_id=proposal.clan_b_id,
            starts_at=proposal.starts_at,
            competition_type=proposal.competition_type,
            exp_reward=body.expReward,
            reward_exp=body.rewardExp,
            reward_coin=body.rewardCoin,
            reward_item_id=reward_item.id if reward_item else None,
            reward_item_quantity=body.rewardItemQuantity,
            created_by_id=user.id,
        )
        db.add(war)
        db.flush()
        proposal.war_id = war.id
    proposal.status = expected
    proposal.reviewed_by_id = user.id
    proposal.reviewed_at = now()
    audit(
        db,
        request,
        "clan_war_proposal_decided",
        user,
        {
            "proposalId": proposal.id,
            "decision": body.decision,
            "warId": proposal.war_id,
            "expReward": body.expReward if body.decision == "approve" else 0,
        },
    )
    db.flush()
    return _proposal_view(db, proposal)


def _mission_cycle(mission: ClanMissionDefinition, instant: datetime) -> str:
    local = utc(instant).astimezone(ZoneInfo(mission.timezone))
    if mission.cadence == "once":
        return "once"
    if mission.cadence == "weekly":
        year, week, _ = local.isocalendar()
        return f"week:{year}-W{week:02d}"
    return f"day:{local.date().isoformat()}"


def record_clan_mission_event(
    db: DB, request: Request, user: Principal, event_key: str, event_id: str
) -> None:
    """Progress system Clan missions only from trusted domain-event handlers."""
    membership = db.scalar(
        select(ClanMembership).where(
            ClanMembership.user_id == user.id, ClanMembership.status == "active"
        )
    )
    if not membership:
        return
    clan = db.scalar(
        select(Clan).where(Clan.id == membership.clan_id, Clan.status == "active").with_for_update()
    )
    if not clan:
        return
    definitions = list(
        db.scalars(
            select(ClanMissionDefinition)
            .where(
                ClanMissionDefinition.status == "active",
                ClanMissionDefinition.event_key == event_key,
            )
            .order_by(ClanMissionDefinition.mission_id, ClanMissionDefinition.version.desc())
        )
    )
    active_latest: dict[str, ClanMissionDefinition] = {}
    for definition in definitions:
        active_latest.setdefault(definition.mission_id, definition)
    instant = now()
    for mission_id, active_definition in active_latest.items():
        cycle = _mission_cycle(active_definition, instant)
        progress = db.scalar(
            select(ClanMissionProgress)
            .where(
                ClanMissionProgress.clan_id == clan.id,
                ClanMissionProgress.mission_id == mission_id,
                ClanMissionProgress.cycle_key == cycle,
            )
            .order_by(ClanMissionProgress.mission_version.desc())
            .with_for_update()
        )
        definition = active_definition
        if progress:
            pinned = db.scalar(
                select(ClanMissionDefinition).where(
                    ClanMissionDefinition.mission_id == mission_id,
                    ClanMissionDefinition.version == progress.mission_version,
                )
            )
            if pinned:
                definition = pinned
        prior = db.scalar(
            select(ClanMissionReceipt.id).where(
                ClanMissionReceipt.clan_id == clan.id,
                ClanMissionReceipt.mission_id == definition.mission_id,
                ClanMissionReceipt.mission_version == definition.version,
                ClanMissionReceipt.source_event_id == event_id,
            )
        )
        if prior:
            continue
        if progress and progress.status == "complete":
            continue
        if progress is None:
            progress = ClanMissionProgress(
                clan_id=clan.id,
                mission_id=definition.mission_id,
                mission_version=definition.version,
                cycle_key=cycle,
            )
            db.add(progress)
            db.flush()
        db.add(
            ClanMissionReceipt(
                clan_id=clan.id,
                mission_id=definition.mission_id,
                mission_version=definition.version,
                cycle_key=cycle,
                user_id=user.id,
                source_event_id=event_id,
            )
        )
        progress.progress = min(progress.progress + 1, definition.target_count)
        if progress.progress < definition.target_count:
            continue
        progress.status = "complete"
        progress.completed_at = instant
        clan.clan_exp += definition.reward_clan_exp
        _sync_level(db, clan)
        reward_key = f"clan-mission:{definition.mission_id}:v{definition.version}:{clan.id}:{cycle}"
        if definition.reward_clan_exp:
            db.add(
                ClanExpLedger(
                    clan_id=clan.id,
                    delta=definition.reward_clan_exp,
                    source="clan_mission",
                    idempotency_key=f"{reward_key}:clan",
                    reason=definition.title,
                    actor_id=None,
                )
            )
        actual_participant_exp = record_exp_reward(
            db,
            user_id=user.id,
            amount=definition.reward_exp,
            source="clan_mission",
            idempotency_key=f"{reward_key}:{user.id}:exp",
            reason=definition.title,
            detail={"clanId": clan.id, "missionId": definition.mission_id},
        )
        if definition.reward_coin:
            db.add(
                EconomyLedger(
                    user_id=user.id,
                    currency="coin",
                    delta=definition.reward_coin,
                    source="clan_mission",
                    idempotency_key=f"{reward_key}:{user.id}:coin",
                    reason=definition.title,
                    detail={"clanId": clan.id, "missionId": definition.mission_id},
                )
            )
        audit(
            db,
            request,
            "clan_mission_completed",
            user,
            {
                "clanId": clan.id,
                "missionId": definition.mission_id,
                "version": definition.version,
                "clanExp": definition.reward_clan_exp,
                "participantExp": actual_participant_exp,
                "participantCoin": definition.reward_coin,
            },
        )


@router.get("/me/clan-missions")
def my_clan_missions(db: DB, user: Principal) -> dict[str, object]:
    membership = db.scalar(
        select(ClanMembership).where(
            ClanMembership.user_id == user.id, ClanMembership.status == "active"
        )
    )
    if not membership:
        return {"clanId": None, "items": []}
    definitions = db.scalars(
        select(ClanMissionDefinition)
        .where(ClanMissionDefinition.status.in_(["active", "retired"]))
        .order_by(ClanMissionDefinition.mission_id, ClanMissionDefinition.version.desc())
    )
    instant = now()
    items: list[dict[str, object]] = []
    newest: dict[str, ClanMissionDefinition] = {}
    for definition in definitions:
        newest.setdefault(definition.mission_id, definition)
    for mission_id, active_definition in newest.items():
        cycle = _mission_cycle(active_definition, instant)
        progress = db.scalar(
            select(ClanMissionProgress)
            .where(
                ClanMissionProgress.clan_id == membership.clan_id,
                ClanMissionProgress.mission_id == mission_id,
                ClanMissionProgress.cycle_key == cycle,
            )
            .order_by(ClanMissionProgress.mission_version.desc())
        )
        definition = active_definition
        if progress:
            pinned = db.scalar(
                select(ClanMissionDefinition).where(
                    ClanMissionDefinition.mission_id == mission_id,
                    ClanMissionDefinition.version == progress.mission_version,
                )
            )
            if pinned:
                definition = pinned
        items.append(
            {
                "missionId": definition.mission_id,
                "version": definition.version,
                "title": definition.title,
                "eventKey": definition.event_key,
                "targetCount": definition.target_count,
                "progress": progress.progress if progress else 0,
                "status": progress.status if progress else "active",
                "cycle": cycle,
                "reward": {
                    "clanExp": definition.reward_clan_exp,
                    "exp": definition.reward_exp,
                    "coin": definition.reward_coin,
                },
            }
        )
    return {"clanId": membership.clan_id, "items": items}


@router.get("/admin/clan-missions")
def list_clan_missions(db: DB, _user: Admin) -> dict[str, object]:
    definitions = db.scalars(
        select(ClanMissionDefinition).order_by(
            ClanMissionDefinition.mission_id, ClanMissionDefinition.version.desc()
        )
    )
    return {"items": [_clan_mission_view(item) for item in definitions]}


def _clan_mission_view(item: ClanMissionDefinition) -> dict[str, object]:
    return {
        "id": item.id,
        "missionId": item.mission_id,
        "version": item.version,
        "title": item.title,
        "eventKey": item.event_key,
        "targetCount": item.target_count,
        "cadence": item.cadence,
        "timeZone": item.timezone,
        "reward": {
            "clanExp": item.reward_clan_exp,
            "exp": item.reward_exp,
            "coin": item.reward_coin,
        },
        "status": item.status,
    }


@router.post("/admin/clan-missions", status_code=201)
def create_clan_mission(
    body: ClanMissionDraft, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    lock_admin(db, request, user)
    try:
        ZoneInfo(body.timeZone)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(422, "invalid_timezone") from None
    latest = db.scalar(
        select(ClanMissionDefinition)
        .where(ClanMissionDefinition.mission_id == body.missionId)
        .order_by(ClanMissionDefinition.version.desc())
    )
    item = ClanMissionDefinition(
        mission_id=body.missionId,
        version=(latest.version if latest else 0) + 1,
        title=body.title,
        event_key=body.eventKey,
        target_count=body.targetCount,
        cadence=body.cadence,
        timezone=body.timeZone,
        reward_clan_exp=body.rewardClanExp,
        reward_exp=body.rewardExp,
        reward_coin=body.rewardCoin,
        author_id=user.id,
        status="draft",
    )
    db.add(item)
    db.flush()
    audit(
        db,
        request,
        "clan_mission_version_created",
        user,
        {"missionId": item.mission_id, "version": item.version},
    )
    return _clan_mission_view(item)


@router.post("/admin/clan-missions/{mission_id}/versions/{version}/activation")
def activate_clan_mission(
    mission_id: str, version: int, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    lock_admin(db, request, user)
    item = db.scalar(
        select(ClanMissionDefinition)
        .where(
            ClanMissionDefinition.mission_id == mission_id, ClanMissionDefinition.version == version
        )
        .with_for_update()
    )
    if not item:
        raise HTTPException(404, "clan_mission_not_found")
    db.query(ClanMissionDefinition).filter(
        ClanMissionDefinition.mission_id == mission_id, ClanMissionDefinition.status == "active"
    ).update({"status": "retired"}, synchronize_session=False)
    item.status = "active"
    audit(
        db, request, "clan_mission_activated", user, {"missionId": mission_id, "version": version}
    )
    db.flush()
    return _clan_mission_view(item)


@router.post("/clans", status_code=201)
def create_clan(body: ClanCreate, request: Request, db: DB, user: Principal) -> dict[str, object]:
    lock_actor(db, request, user)
    name, key = _name(body.name)
    if db.scalar(select(Clan.id).where(Clan.name_key == key)):
        raise HTTPException(409, "clan_name_unavailable")
    if db.scalar(
        select(ClanMembership.id).where(
            ClanMembership.user_id == user.id, ClanMembership.status == "active"
        )
    ):
        raise HTTPException(409, "already_in_clan")
    if db.scalar(select(Clan.owner_id).where(Clan.owner_id == user.id, Clan.status == "active")):
        raise HTTPException(409, "already_owns_clan")
    _consume_card(db, user, body.inventoryId, "create-clan")
    clan = Clan(
        id=str(uuid.uuid4()),
        name=name,
        name_key=key,
        owner_id=user.id,
        level=1,
        clan_exp=0,
        member_cap=20,
        icon=LEVELS[0][2],
        color=LEVELS[0][3],
        status="active",
    )
    _sync_level(db, clan)
    db.add(clan)
    db.add(
        ClanMembership(
            clan_id=clan.id, user_id=user.id, status="active", role_key="owner", joined_at=now()
        )
    )
    db.add_all(
        [
            ClanRole(
                clan_id=clan.id,
                role_key="owner",
                name="Owner",
                permissions=sorted(INTERNAL_PERMISSIONS),
            ),
            ClanRole(clan_id=clan.id, role_key="member", name="Member", permissions=[]),
        ]
    )
    audit(
        db,
        request,
        "clan_created",
        user,
        {"clanId": clan.id, "name": name, "inventoryId": str(body.inventoryId)},
    )
    db.flush()
    return _view(db, clan, user, include_members=True)


@router.get("/clans/{clan_id}")
def get_clan(clan_id: uuid.UUID, db: DB, user: Principal) -> dict[str, object]:
    clan = db.get(Clan, str(clan_id))
    if not clan or clan.status != "active":
        raise HTTPException(404, "clan_not_found")
    return _view(db, clan, user, include_members=True)


@router.post("/clans/{clan_id}/invitations", status_code=201)
def invite_member(
    clan_id: uuid.UUID, body: ClanInvitation, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    clan = db.scalar(select(Clan).where(Clan.id == str(clan_id)).with_for_update())
    if not clan or clan.status != "active":
        raise HTTPException(404, "clan_not_found")
    if "membership.manage" not in _permissions(db, clan, user):
        raise HTTPException(403, "clan_permission_required")
    target = db.get(User, str(body.userId))
    if not target or target.status != "active":
        raise HTTPException(404, "active_user_not_found")
    if db.scalar(
        select(ClanMembership.id).where(
            ClanMembership.user_id == target.id, ClanMembership.status == "active"
        )
    ):
        raise HTTPException(409, "target_already_in_clan")
    prior = db.scalar(
        select(ClanMembership).where(
            ClanMembership.clan_id == clan.id, ClanMembership.user_id == target.id
        )
    )
    if prior and prior.status in {"invited", "requested"}:
        return {"requestId": prior.id, "status": prior.status, "replayed": True}
    if prior:
        prior.status = "invited"
        audit(db, request, "clan_member_invited", user, {"clanId": clan.id, "userId": target.id})
        return {"requestId": prior.id, "status": prior.status, "replayed": False}
    reserved_value = db.scalar(
        select(func.count())
        .select_from(ClanMembership)
        .where(ClanMembership.clan_id == clan.id, ClanMembership.status.in_(["active", "invited"]))
    )
    reserved = int(reserved_value or 0)
    if reserved >= clan.member_cap:
        raise HTTPException(409, "clan_member_cap_reached")
    item = ClanMembership(clan_id=clan.id, user_id=target.id, status="invited", role_key="member")
    db.add(item)
    audit(db, request, "clan_member_invited", user, {"clanId": clan.id, "userId": target.id})
    db.flush()
    return {"requestId": item.id, "status": item.status, "replayed": False}


@router.get("/clans/{clan_id}/invite-candidates")
def invite_candidates(
    clan_id: uuid.UUID,
    db: DB,
    user: Principal,
    query: str = Query(min_length=2, max_length=100),
) -> dict[str, object]:
    clan = db.get(Clan, str(clan_id))
    if not clan or "membership.manage" not in _permissions(db, clan, user):
        raise HTTPException(403, "clan_permission_required")
    pattern = f"%{query.strip()}%"
    active_clans = select(ClanMembership.user_id).where(ClanMembership.status == "active")
    matches = db.scalars(
        select(User)
        .where(
            User.status == "active",
            cast(User.roles, String).contains("student"),
            ~User.id.in_(active_clans),
            or_(User.username.ilike(pattern), User.official_name.ilike(pattern)),
        )
        .order_by(User.official_name, User.id)
        .limit(20)
    )
    return {
        "items": [
            {
                "userId": item.id,
                "username": item.username,
                "name": item.nickname or item.official_name,
            }
            for item in matches
        ]
    }


@router.post("/clans/{clan_id}/join-requests", status_code=201)
def request_membership(
    clan_id: uuid.UUID, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    clan = db.get(Clan, str(clan_id))
    if not clan or clan.status != "active":
        raise HTTPException(404, "clan_not_found")
    if _member(db, clan.id, user.id):
        raise HTTPException(409, "already_in_clan")
    if db.scalar(
        select(ClanMembership.id).where(
            ClanMembership.user_id == user.id, ClanMembership.status == "active"
        )
    ):
        raise HTTPException(409, "already_in_clan")
    prior = db.scalar(
        select(ClanMembership).where(
            ClanMembership.clan_id == clan.id, ClanMembership.user_id == user.id
        )
    )
    if prior and prior.status in {"requested", "invited"}:
        return {"requestId": prior.id, "status": prior.status, "replayed": True}
    if prior:
        prior.status = "requested"
        audit(db, request, "clan_join_requested", user, {"clanId": clan.id})
        return {"requestId": prior.id, "status": prior.status, "replayed": False}
    item = ClanMembership(clan_id=clan.id, user_id=user.id, status="requested", role_key="member")
    db.add(item)
    audit(db, request, "clan_join_requested", user, {"clanId": clan.id})
    db.flush()
    return {"requestId": item.id, "status": item.status, "replayed": False}


@router.post("/clans/{clan_id}/membership-decisions")
def decide_membership(
    clan_id: uuid.UUID, body: MembershipDecision, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    clan = db.scalar(select(Clan).where(Clan.id == str(clan_id)).with_for_update())
    if not clan:
        raise HTTPException(404, "clan_not_found")
    item = db.scalar(
        select(ClanMembership)
        .where(ClanMembership.id == str(body.requestId), ClanMembership.clan_id == clan.id)
        .with_for_update()
    )
    if not item or item.status not in {"invited", "requested"}:
        raise HTTPException(404, "clan_membership_request_not_found")
    if item.status == "invited" and item.user_id == user.id:
        allowed = True
    else:
        allowed = "membership.manage" in _permissions(db, clan, user)
    if not allowed:
        raise HTTPException(403, "clan_permission_required")
    if body.decision == "approve":
        if item.status == "invited" and item.user_id != user.id:
            raise HTTPException(409, "invitation_requires_member_acceptance")
        if item.status == "requested" and item.user_id == user.id:
            raise HTTPException(403, "clan_owner_decision_required")
        if db.scalar(
            select(ClanMembership.id).where(
                ClanMembership.user_id == item.user_id, ClanMembership.status == "active"
            )
        ):
            raise HTTPException(409, "user_already_in_clan")
        active_count = int(
            db.scalar(
                select(func.count())
                .select_from(ClanMembership)
                .where(ClanMembership.clan_id == clan.id, ClanMembership.status == "active")
            )
            or 0
        )
        if active_count >= clan.member_cap:
            raise HTTPException(409, "clan_member_cap_reached")
        item.status = "active"
        item.joined_at = now()
    else:
        item.status = "rejected"
    audit(
        db,
        request,
        f"clan_membership_{body.decision}",
        user,
        {"clanId": clan.id, "userId": item.user_id, "requestId": item.id},
    )
    return {"requestId": item.id, "status": item.status}


@router.post("/clans/{clan_id}/rename")
def rename_clan(
    clan_id: uuid.UUID, body: ClanRename, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    clan = db.scalar(select(Clan).where(Clan.id == str(clan_id)).with_for_update())
    if not clan or clan.status != "active":
        raise HTTPException(404, "clan_not_found")
    if clan.owner_id != user.id:
        raise HTTPException(403, "clan_owner_required")
    name, key = _name(body.newName)
    if db.scalar(select(Clan.id).where(Clan.name_key == key, Clan.id != clan.id)):
        raise HTTPException(409, "clan_name_unavailable")
    _consume_card(db, user, body.inventoryId, "rename-clan")
    previous = clan.name
    clan.name, clan.name_key = name, key
    audit(
        db,
        request,
        "clan_renamed",
        user,
        {
            "clanId": clan.id,
            "previousName": previous,
            "newName": name,
            "inventoryId": str(body.inventoryId),
        },
    )
    return _view(db, clan, user, include_members=True)


@router.post("/clans/{clan_id}/roles", status_code=201)
def create_role(
    clan_id: uuid.UUID, body: RoleDraft, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    clan = db.get(Clan, str(clan_id))
    if not clan or not _member(db, clan.id, user.id):
        raise HTTPException(404, "clan_not_found")
    if "roles.manage" not in _permissions(db, clan, user):
        raise HTTPException(403, "clan_permission_required")
    if body.roleKey in {"owner", "member"} or db.scalar(
        select(ClanRole.id).where(ClanRole.clan_id == clan.id, ClanRole.role_key == body.roleKey)
    ):
        raise HTTPException(409, "clan_role_key_unavailable")
    if not set(body.permissions) <= INTERNAL_PERMISSIONS:
        raise HTTPException(422, "invalid_clan_permission")
    role = ClanRole(
        clan_id=clan.id,
        role_key=body.roleKey,
        name=body.name,
        permissions=sorted(set(body.permissions)),
    )
    db.add(role)
    audit(
        db,
        request,
        "clan_role_created",
        user,
        {"clanId": clan.id, "roleKey": role.role_key, "permissions": role.permissions},
    )
    db.flush()
    return {"roleKey": role.role_key, "name": role.name, "permissions": role.permissions}


@router.put("/clans/{clan_id}/members/{target_id}/role")
def assign_role(
    clan_id: uuid.UUID,
    target_id: uuid.UUID,
    body: RoleAssignment,
    request: Request,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    clan = db.get(Clan, str(clan_id))
    if not clan or "roles.manage" not in _permissions(db, clan, user):
        raise HTTPException(403, "clan_permission_required")
    membership = db.scalar(
        select(ClanMembership)
        .where(
            ClanMembership.clan_id == clan.id,
            ClanMembership.user_id == str(target_id),
            ClanMembership.status == "active",
        )
        .with_for_update()
    )
    role = db.scalar(
        select(ClanRole).where(ClanRole.clan_id == clan.id, ClanRole.role_key == body.roleKey)
    )
    if membership is None or role is None or membership.user_id == clan.owner_id:
        raise HTTPException(404, "clan_member_or_role_not_found")
    previous = membership.role_key
    membership.role_key = role.role_key
    audit(
        db,
        request,
        "clan_member_role_assigned",
        user,
        {
            "clanId": clan.id,
            "userId": membership.user_id,
            "previousRole": previous,
            "roleKey": role.role_key,
        },
    )
    return {"userId": membership.user_id, "roleKey": membership.role_key}


@router.post("/clans/{clan_id}/leave")
def leave_clan(clan_id: uuid.UUID, request: Request, db: DB, user: Principal) -> dict[str, object]:
    lock_actor(db, request, user)
    item = db.scalar(
        select(ClanMembership)
        .where(
            ClanMembership.clan_id == str(clan_id),
            ClanMembership.user_id == user.id,
            ClanMembership.status == "active",
        )
        .with_for_update()
    )
    if not item:
        raise HTTPException(404, "clan_membership_not_found")
    clan = db.get(Clan, item.clan_id)
    if clan and clan.owner_id == user.id:
        raise HTTPException(409, "owner_must_transfer_before_leaving")
    item.status = "left"
    audit(db, request, "clan_member_left", user, {"clanId": str(clan_id)})
    return {"status": item.status}


@router.post("/clans/{clan_id}/owner-transfer")
def transfer_clan_owner(
    clan_id: uuid.UUID, body: OwnerTransfer, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    clan = db.scalar(select(Clan).where(Clan.id == str(clan_id)).with_for_update())
    if not clan or clan.status != "active":
        raise HTTPException(404, "clan_not_found")
    if clan.owner_id != user.id:
        raise HTTPException(403, "clan_owner_required")
    target = db.scalar(
        select(ClanMembership)
        .where(
            ClanMembership.clan_id == clan.id,
            ClanMembership.user_id == str(body.userId),
            ClanMembership.status == "active",
        )
        .with_for_update()
    )
    current_owner = db.scalar(
        select(ClanMembership)
        .where(
            ClanMembership.clan_id == clan.id,
            ClanMembership.user_id == user.id,
            ClanMembership.status == "active",
        )
        .with_for_update()
    )
    if not target or target.user_id == user.id or not current_owner:
        raise HTTPException(422, "active_clan_member_required")
    previous_owner_id = clan.owner_id
    clan.owner_id = target.user_id
    current_owner.role_key = "member"
    target.role_key = "owner"
    audit(
        db,
        request,
        "clan_owner_transferred",
        user,
        {
            "clanId": clan.id,
            "previousOwnerId": previous_owner_id,
            "newOwnerId": target.user_id,
        },
    )
    return {"clanId": clan.id, "ownerId": clan.owner_id}


def _policy_view(db: DB, policy: ClanPolicy) -> dict[str, object]:
    levels = db.scalars(
        select(ClanLevelRule)
        .where(ClanLevelRule.policy_id == policy.id)
        .order_by(ClanLevelRule.level)
    )
    return {
        "id": policy.id,
        "version": policy.version,
        "status": policy.status,
        "levels": [
            {
                "level": item.level,
                "thresholdExp": item.threshold_exp,
                "memberCap": item.member_cap,
                "icon": item.icon,
                "color": item.color,
            }
            for item in levels
        ],
    }


@router.get("/admin/clan-policies")
def clan_policies(db: DB, _user: Admin) -> dict[str, object]:
    rows = db.scalars(select(ClanPolicy).order_by(ClanPolicy.version.desc()).limit(20))
    return {"items": [_policy_view(db, policy) for policy in rows]}


@router.post("/admin/clan-policies", status_code=201)
def create_clan_policy(
    body: ClanPolicyDraft, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    lock_admin(db, request, user)
    levels = sorted(body.levels, key=lambda item: item.level)
    if levels[0].level != 1 or levels[0].thresholdExp != 0:
        raise HTTPException(422, "clan_policy_must_start_at_level_one")
    if any(item.level != index for index, item in enumerate(levels, start=1)):
        raise HTTPException(422, "clan_policy_levels_must_be_consecutive")
    if any(right.thresholdExp <= left.thresholdExp for left, right in pairwise(levels)):
        raise HTTPException(422, "clan_policy_thresholds_must_increase")
    version = int(db.scalar(select(func.max(ClanPolicy.version))) or 0) + 1
    policy = ClanPolicy(id=str(uuid.uuid4()), version=version, status="draft", author_id=user.id)
    db.add(policy)
    db.add_all(
        [
            ClanLevelRule(
                policy_id=policy.id,
                level=item.level,
                threshold_exp=item.thresholdExp,
                member_cap=item.memberCap,
                icon=item.icon,
                color=item.color,
            )
            for item in levels
        ]
    )
    audit(
        db,
        request,
        "clan_policy_draft_created",
        user,
        {"policyId": policy.id, "version": version, "levels": len(levels)},
    )
    db.flush()
    return _policy_view(db, policy)


@router.post("/admin/clan-policies/{policy_id}/activation")
def activate_clan_policy(
    policy_id: uuid.UUID, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    lock_admin(db, request, user)
    policy = db.scalar(select(ClanPolicy).where(ClanPolicy.id == str(policy_id)).with_for_update())
    if not policy or policy.status != "draft":
        raise HTTPException(409, "clan_policy_not_draft")
    rules = list(
        db.scalars(
            select(ClanLevelRule)
            .where(ClanLevelRule.policy_id == policy.id)
            .order_by(ClanLevelRule.level)
        )
    )
    if not rules or rules[0].level != 1 or rules[0].threshold_exp != 0:
        raise HTTPException(409, "clan_policy_invalid")
    clans = list(db.scalars(select(Clan).where(Clan.status == "active").with_for_update()))
    for clan in clans:
        next_rule = next(
            (item for item in reversed(rules) if clan.clan_exp >= item.threshold_exp), None
        )
        if next_rule is None:
            raise HTTPException(409, "clan_policy_invalid")
        member_count = int(
            db.scalar(
                select(func.count())
                .select_from(ClanMembership)
                .where(ClanMembership.clan_id == clan.id, ClanMembership.status == "active")
            )
            or 0
        )
        if next_rule.member_cap < member_count:
            raise HTTPException(409, "clan_policy_cap_below_existing_members")
    for old in db.scalars(
        select(ClanPolicy).where(ClanPolicy.status == "active").with_for_update()
    ):
        old.status = "retired"
    policy.status = "active"
    for clan in clans:
        _sync_level(db, clan)
    audit(
        db,
        request,
        "clan_policy_activated",
        user,
        {"policyId": policy.id, "version": policy.version},
    )
    db.flush()
    return _policy_view(db, policy)


@router.post("/admin/clans/{clan_id}/exp")
def grant_clan_exp(
    clan_id: uuid.UUID,
    body: ClanExpGrant,
    request: Request,
    db: DB,
    user: Admin,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=160),
) -> dict[str, object]:
    lock_admin(db, request, user)
    clan = db.scalar(select(Clan).where(Clan.id == str(clan_id)).with_for_update())
    if not clan or clan.status != "active":
        raise HTTPException(404, "clan_not_found")
    prior = db.scalar(select(ClanExpLedger).where(ClanExpLedger.idempotency_key == idempotency_key))
    if prior:
        if prior.clan_id != clan.id or prior.delta != body.delta or prior.reason != body.reason:
            raise HTTPException(409, "idempotency_key_reused")
        return {"clanId": clan.id, "clanExp": clan.clan_exp, "level": clan.level, "replayed": True}
    clan.clan_exp += body.delta
    _sync_level(db, clan)
    db.add(
        ClanExpLedger(
            clan_id=clan.id,
            delta=body.delta,
            source="admin.clan_mission",
            idempotency_key=idempotency_key,
            reason=body.reason,
            actor_id=user.id,
        )
    )
    audit(
        db,
        request,
        "clan_exp_awarded",
        user,
        {"clanId": clan.id, "delta": body.delta, "reason": body.reason, "level": clan.level},
    )
    return {"clanId": clan.id, "clanExp": clan.clan_exp, "level": clan.level, "replayed": False}
