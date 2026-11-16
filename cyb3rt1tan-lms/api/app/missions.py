"""Registered trusted-event mission progression and idempotent rewards."""

import re
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from .auth import DB, Admin, Principal, audit, lock_admin
from .course_access import lock_actor
from .economy_rewards import record_exp_reward
from .models import (
    EconomyLedger,
    MissionDefinition,
    MissionEventReceipt,
    MissionProgress,
    MissionStreakBoost,
    RankTaskMetricReceipt,
    RewardEvent,
    now,
)
from .security import utc
from .streak_boosts import consume_streak_boost, expire_streak_boost

router = APIRouter(prefix="/v1")
ROLES = {
    "student",
    "teacher",
    "teachingAssistant",
    "admin",
    "administrativeAssistant",
    "researchAssistant",
}
EVENT_KEYS = {
    "practice.attempt",
    "practice.correct",
    "attendance.present",
    "lesson.completed",
    "assessment.submitted",
}


class RewardDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    exp: int = Field(default=0, ge=0, le=2_000_000_000)
    coin: int = Field(default=0, ge=0, le=2_000_000_000)


class MissionDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    missionId: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    version: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=160)
    eventKey: str = Field(min_length=1, max_length=80)
    targetCount: int = Field(default=1, ge=1, le=1_000_000)
    cadence: str = Field(default="daily", pattern=r"^(daily|weekly|once)$")
    timeZone: str = Field(default="Asia/Bangkok", min_length=1, max_length=64)
    eligibleRoles: list[str] = Field(default_factory=list, max_length=6)
    reward: RewardDraft = Field(default_factory=RewardDraft)
    startsAt: datetime | None = None
    endsAt: datetime | None = None


def _cycle(item: MissionDefinition, instant: datetime) -> str:
    local = utc(instant).astimezone(ZoneInfo(item.timezone))
    if item.cadence == "once":
        return "once"
    if item.cadence == "weekly":
        year, week, _ = local.isocalendar()
        return f"week:{year}-W{week:02d}"
    return f"day:{local.date().isoformat()}"


def _next_cycle(item: MissionDefinition, instant: datetime) -> datetime:
    local = utc(instant).astimezone(ZoneInfo(item.timezone))
    if item.cadence == "daily":
        boundary = local.date() + timedelta(days=1)
    elif item.cadence == "weekly":
        boundary = local.date() + timedelta(days=7 - local.weekday())
    else:
        return utc(instant)
    return datetime.combine(boundary, time.min, ZoneInfo(item.timezone)).astimezone(
        utc(instant).tzinfo
    )


def _eligible(item: MissionDefinition, roles: list[str]) -> bool:
    return not item.eligible_roles or bool(set(roles) & set(item.eligible_roles))


def _reward(
    db: DB,
    item: MissionDefinition,
    progress: MissionProgress,
    user_id: str,
    source_event_id: str,
    *,
    idempotency_key: str,
    actor_id: str | None = None,
) -> RewardEvent:
    existing = db.scalar(select(RewardEvent).where(RewardEvent.idempotency_key == idempotency_key))
    if existing:
        if (
            existing.user_id != user_id
            or existing.mission_id != item.mission_id
            or existing.mission_version != item.version
        ):
            raise HTTPException(409, "idempotency_key_conflict")
        return existing
    awarded_exp = record_exp_reward(
        db,
        user_id=user_id,
        amount=item.reward_exp,
        source="mission_reward",
        idempotency_key=f"{idempotency_key}:exp",
        reason=item.title,
        actor_id=actor_id,
        detail={"missionId": item.mission_id, "version": item.version},
    )
    event = RewardEvent(
        user_id=user_id,
        mission_id=item.mission_id,
        mission_version=item.version,
        cycle_key=progress.cycle_key,
        source_event_id=source_event_id,
        idempotency_key=idempotency_key,
        exp_awarded=awarded_exp,
        coin_awarded=item.reward_coin,
    )
    db.add(event)
    db.flush()
    for currency, amount in (("coin", item.reward_coin),):
        if amount:
            db.add(
                EconomyLedger(
                    user_id=user_id,
                    currency=currency,
                    delta=amount,
                    source="mission_reward",
                    idempotency_key=f"{idempotency_key}:{currency}",
                    reason=item.title,
                    actor_id=actor_id,
                    detail={"missionId": item.mission_id, "version": item.version},
                )
            )
    return event


def record_domain_event(
    db: DB, request: Request, user: Principal, event_key: str, event_id: str
) -> None:
    """Apply one event emitted by a trusted domain handler; clients never call this route."""
    if event_key not in EVENT_KEYS:
        return
    metric_receipt = db.scalar(
        select(RankTaskMetricReceipt.id).where(
            RankTaskMetricReceipt.user_id == user.id,
            RankTaskMetricReceipt.event_key == event_key,
            RankTaskMetricReceipt.source_event_id == event_id,
        )
    )
    if metric_receipt is None:
        db.add(
            RankTaskMetricReceipt(user_id=user.id, event_key=event_key, source_event_id=event_id)
        )
    instant = now()
    active = list(
        db.scalars(
            select(MissionDefinition).where(
                MissionDefinition.status == "active", MissionDefinition.event_key == event_key
            )
        )
    )
    grouped: dict[str, list[MissionDefinition]] = {}
    for definition in active:
        if (
            _eligible(definition, user.roles)
            and (definition.starts_at is None or utc(instant) >= utc(definition.starts_at))
            and (definition.ends_at is None or utc(instant) < utc(definition.ends_at))
        ):
            grouped.setdefault(definition.mission_id, []).append(definition)
    for mission_id, versions in grouped.items():
        cycle_key = _cycle(max(versions, key=lambda item: item.version), instant)
        existing_progress = db.scalar(
            select(MissionProgress)
            .where(
                MissionProgress.user_id == user.id,
                MissionProgress.mission_id == mission_id,
                MissionProgress.cycle_key == cycle_key,
            )
            .order_by(MissionProgress.mission_version)
        )
        pinned = next(
            (
                item
                for item in versions
                if existing_progress and item.version == existing_progress.mission_version
            ),
            None,
        )
        selected_definition = pinned or max(versions, key=lambda item: item.version)
        if existing_progress and existing_progress.status != "active":
            continue
        receipt_key_exists = db.scalar(
            select(MissionEventReceipt.id).where(
                MissionEventReceipt.user_id == user.id,
                MissionEventReceipt.mission_id == mission_id,
                MissionEventReceipt.mission_version == selected_definition.version,
                MissionEventReceipt.source_event_id == event_id,
            )
        )
        if receipt_key_exists:
            continue
        progress = existing_progress or db.scalar(
            select(MissionProgress).where(
                MissionProgress.user_id == user.id,
                MissionProgress.mission_id == mission_id,
                MissionProgress.mission_version == selected_definition.version,
                MissionProgress.cycle_key == cycle_key,
            )
        )
        if progress and progress.status != "active":
            continue
        if progress is None:
            progress = MissionProgress(
                user_id=user.id,
                mission_id=mission_id,
                mission_version=selected_definition.version,
                cycle_key=cycle_key,
            )
            db.add(progress)
            db.flush()
        expire_streak_boost(
            db,
            user_id=user.id,
            mission_id=mission_id,
            cycle_key=cycle_key,
            instant=instant,
        )
        consume_streak_boost(
            db,
            user_id=user.id,
            mission_id=mission_id,
            mission_version=selected_definition.version,
            cycle_key=cycle_key,
            instant=instant,
        )
        db.add(
            MissionEventReceipt(
                user_id=user.id,
                mission_id=mission_id,
                mission_version=selected_definition.version,
                cycle_key=cycle_key,
                source_event_id=event_id,
            )
        )
        progress.progress = min(progress.progress + 1, selected_definition.target_count)
        if progress.progress >= selected_definition.target_count:
            progress.status = "complete"
            progress.completed_at = instant
            if selected_definition.cadence in {"daily", "weekly"}:
                progress.status = "claimed"
                event = _reward(
                    db,
                    selected_definition,
                    progress,
                    user.id,
                    event_id,
                    idempotency_key=f"mission:{mission_id}:v{selected_definition.version}:{cycle_key}",
                )
                audit(
                    db,
                    request,
                    "mission_reward_issued",
                    user,
                    {
                        "missionId": mission_id,
                        "version": selected_definition.version,
                        "exp": event.exp_awarded,
                        "coin": event.coin_awarded,
                    },
                )
    from .achievements import record_achievement_event

    record_achievement_event(db, request, user, event_key, event_id)
    from .clans import record_clan_mission_event

    record_clan_mission_event(db, request, user, event_key, event_id)


@router.get("/me/missions")
def my_missions(db: DB, user: Principal) -> dict[str, object]:
    current = now()
    definitions = list(
        db.scalars(
            select(MissionDefinition)
            .where(
                MissionDefinition.status == "active",
                (MissionDefinition.starts_at.is_(None)) | (MissionDefinition.starts_at <= current),
                (MissionDefinition.ends_at.is_(None)) | (MissionDefinition.ends_at > current),
            )
            .order_by(MissionDefinition.mission_id, MissionDefinition.version.desc())
        )
    )
    chosen: dict[str, MissionDefinition] = {}
    for item in definitions:
        if _eligible(item, user.roles):
            chosen.setdefault(item.mission_id, item)
    items: list[dict[str, object]] = []
    for mission_id, latest in chosen.items():
        cycle_key = _cycle(latest, current)
        expire_streak_boost(
            db,
            user_id=user.id,
            mission_id=mission_id,
            cycle_key=cycle_key,
            instant=current,
        )
        progress = db.scalar(
            select(MissionProgress)
            .where(
                MissionProgress.user_id == user.id,
                MissionProgress.mission_id == mission_id,
                MissionProgress.cycle_key == cycle_key,
            )
            .order_by(MissionProgress.mission_version.desc())
        )
        definition = next(
            (
                item
                for item in definitions
                if item.mission_id == mission_id
                and progress
                and item.version == progress.mission_version
            ),
            latest,
        )
        pending_boost = db.scalar(
            select(MissionStreakBoost).where(
                MissionStreakBoost.user_id == user.id,
                MissionStreakBoost.mission_id == mission_id,
                MissionStreakBoost.mission_version == definition.version,
                MissionStreakBoost.cycle_key == cycle_key,
                MissionStreakBoost.consumed_at.is_(None),
                MissionStreakBoost.expired_at.is_(None),
                MissionStreakBoost.expires_at > current,
            )
        )
        items.append(
            {
                "missionId": definition.mission_id,
                "version": definition.version,
                "title": definition.title,
                "eventKey": definition.event_key,
                "targetCount": definition.target_count,
                "cadence": definition.cadence,
                "timeZone": definition.timezone,
                "cycleKey": cycle_key,
                "progress": progress.progress if progress else 0,
                "streakBoostExpiresAt": utc(pending_boost.expires_at).isoformat()
                if pending_boost
                else None,
                "status": progress.status if progress else "active",
                "canClaim": bool(
                    progress and progress.status == "complete" and definition.cadence == "once"
                ),
                "reward": {"exp": definition.reward_exp, "coin": definition.reward_coin},
            }
        )
    return {"items": items}


@router.post("/missions/{mission_id}/claims")
def claim_mission(
    mission_id: str,
    request: Request,
    db: DB,
    user: Principal,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=160),
) -> dict[str, object]:
    lock_actor(db, request, user)
    if not re.fullmatch(r"[A-Za-z0-9:._-]{8,160}", idempotency_key):
        raise HTTPException(422, "invalid_idempotency_key")
    replay = db.scalar(select(RewardEvent).where(RewardEvent.idempotency_key == idempotency_key))
    if replay:
        if replay.user_id != user.id or replay.mission_id != mission_id:
            raise HTTPException(409, "idempotency_key_conflict")
        return {
            "missionId": mission_id,
            "rewardId": replay.id,
            "exp": replay.exp_awarded,
            "coin": replay.coin_awarded,
            "replayed": True,
        }
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
    definition = next((item for item in definitions if _eligible(item, user.roles)), None)
    if not definition or definition.cadence != "once":
        raise HTTPException(404, "claimable_mission_not_found")
    progress = db.scalar(
        select(MissionProgress)
        .where(
            MissionProgress.user_id == user.id,
            MissionProgress.mission_id == mission_id,
            MissionProgress.status == "complete",
        )
        .order_by(MissionProgress.mission_version.desc())
    )
    if not progress:
        raise HTTPException(409, "mission_not_complete")
    selected = next(
        (item for item in definitions if item.version == progress.mission_version), definition
    )
    reward = _reward(
        db, selected, progress, user.id, "claim", idempotency_key=idempotency_key, actor_id=None
    )
    progress.status = "claimed"
    audit(
        db,
        request,
        "mission_reward_claimed",
        user,
        {
            "missionId": mission_id,
            "version": selected.version,
            "exp": reward.exp_awarded,
            "coin": reward.coin_awarded,
        },
    )
    return {
        "missionId": mission_id,
        "rewardId": reward.id,
        "exp": reward.exp_awarded,
        "coin": reward.coin_awarded,
        "replayed": False,
    }


@router.get("/admin/missions")
def list_missions(db: DB, user: Admin) -> dict[str, object]:
    items = db.scalars(
        select(MissionDefinition).order_by(
            MissionDefinition.mission_id, MissionDefinition.version.desc()
        )
    )
    return {
        "items": [
            {
                "missionId": item.mission_id,
                "version": item.version,
                "title": item.title,
                "eventKey": item.event_key,
                "targetCount": item.target_count,
                "cadence": item.cadence,
                "timeZone": item.timezone,
                "eligibleRoles": item.eligible_roles,
                "reward": {"exp": item.reward_exp, "coin": item.reward_coin},
                "status": item.status,
            }
            for item in items
        ]
    }


@router.post("/admin/missions", status_code=201)
def create_mission(body: MissionDraft, request: Request, db: DB, user: Admin) -> dict[str, object]:
    lock_admin(db, request, user)
    if (
        body.eventKey not in EVENT_KEYS
        or len(set(body.eligibleRoles)) != len(body.eligibleRoles)
        or any(role not in ROLES for role in body.eligibleRoles)
    ):
        raise HTTPException(422, "unsupported_mission_policy")
    try:
        ZoneInfo(body.timeZone)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(422, "invalid_timezone") from None
    if (body.startsAt and (body.startsAt.tzinfo is None or body.startsAt.utcoffset() is None)) or (
        body.endsAt and (body.endsAt.tzinfo is None or body.endsAt.utcoffset() is None)
    ):
        raise HTTPException(422, "explicit_offset_required")
    if body.startsAt and body.endsAt and utc(body.endsAt) <= utc(body.startsAt):
        raise HTTPException(422, "invalid_mission_window")
    latest_policy = db.scalar(
        select(MissionDefinition)
        .where(
            MissionDefinition.mission_id == body.missionId,
        )
        .order_by(MissionDefinition.version.desc())
    )
    latest = latest_policy.version if latest_policy else 0
    if body.version != latest + 1:
        raise HTTPException(409, "mission_version_conflict")
    effective_start = utc(body.startsAt) if body.startsAt else None
    if latest_policy:
        if body.cadence != latest_policy.cadence or body.timeZone != latest_policy.timezone:
            raise HTTPException(409, "mission_cycle_policy_immutable")
        cycle_start = _next_cycle(latest_policy, now())
        effective_start = max(effective_start, cycle_start) if effective_start else cycle_start
    if effective_start and body.endsAt and utc(body.endsAt) <= effective_start:
        raise HTTPException(422, "invalid_mission_window")
    item = MissionDefinition(
        mission_id=body.missionId,
        version=body.version,
        title=body.title,
        event_key=body.eventKey,
        target_count=body.targetCount,
        cadence=body.cadence,
        timezone=body.timeZone,
        eligible_roles=body.eligibleRoles,
        reward_exp=body.reward.exp,
        reward_coin=body.reward.coin,
        starts_at=effective_start,
        ends_at=utc(body.endsAt) if body.endsAt else None,
        status="active",
        author_id=user.id,
    )
    db.add(item)
    audit(
        db,
        request,
        "mission_version_created",
        user,
        {
            "missionId": item.mission_id,
            "version": item.version,
            "eventKey": item.event_key,
            "cadence": item.cadence,
        },
    )
    return {"missionId": item.mission_id, "version": item.version, "status": item.status}
