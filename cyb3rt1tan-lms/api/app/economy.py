"""Append-only EXP/Coin wallet reads and immutable rank-policy versions."""

import uuid
from itertools import pairwise

from fastapi import APIRouter, Header, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select

from .auth import DB, Admin, Principal, audit, lock_admin
from .course_access import lock_actor
from .models import (
    EconomyLedger,
    RankPolicy,
    RankRoleTask,
    RankTaskMetricReceipt,
    RankTaskRequest,
    RankTier,
    User,
    UserExpMultiplier,
    now,
)
from .security import utc

router = APIRouter(prefix="/v1")
STAFF_ROLES = {
    "teacher",
    "teachingAssistant",
    "admin",
    "administrativeAssistant",
    "researchAssistant",
}
RANK_METRIC_KEYS = {
    "practice.attempt",
    "practice.correct",
    "attendance.present",
    "lesson.completed",
    "assessment.submitted",
}


class RoleTaskDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    taskKey: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    staffRole: str = Field(
        pattern=r"^(teacher|teachingAssistant|admin|administrativeAssistant|researchAssistant)$"
    )
    title: str = Field(min_length=1, max_length=160)
    requirementType: str = Field(pattern=r"^(metric|manual_review)$")
    eventKey: str | None = Field(default=None, max_length=80)
    targetCount: int | None = Field(default=None, ge=1, le=1_000_000)


class RankTierDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    tierKey: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9._-]+$")
    name: str = Field(min_length=1, max_length=120)
    thresholdExp: int = Field(ge=0, le=2_000_000_000)
    icon: str = Field(default="fa-star", min_length=1, max_length=80)
    color: str = Field(default="#176b87", pattern=r"^#[0-9A-Fa-f]{6}$")
    description: str = Field(default="", max_length=500)
    roleTasks: list[RoleTaskDraft] = Field(default_factory=list, max_length=20)


class RankPolicyDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    track: str = Field(pattern=r"^(student|staff)$")
    tiers: list[RankTierDraft] = Field(min_length=1, max_length=50)


class RankTaskRequestDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    policyId: uuid.UUID
    tierKey: str = Field(min_length=1, max_length=64)
    taskKey: str = Field(min_length=1, max_length=64)
    evidence: str = Field(min_length=20, max_length=1000)


class RankTaskRequestDecision(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    decision: str = Field(pattern=r"^(approve|reject)$")
    reason: str = Field(min_length=10, max_length=500)


def _balance(db: DB, user_id: str, currency: str) -> int:
    return int(
        db.scalar(
            select(func.coalesce(func.sum(EconomyLedger.delta), 0)).where(
                EconomyLedger.user_id == user_id,
                EconomyLedger.currency == currency,
            )
        )
        or 0
    )


def _requirements(
    db: DB, user: Principal, policy: RankPolicy, tier: RankTier
) -> list[dict[str, object]]:
    roles = set(user.roles) & STAFF_ROLES
    if not roles or policy.track != "staff":
        return []
    tasks = db.scalars(
        select(RankRoleTask)
        .where(
            RankRoleTask.policy_id == policy.id,
            RankRoleTask.tier_key == tier.tier_key,
            RankRoleTask.staff_role.in_(roles),
        )
        .order_by(RankRoleTask.staff_role, RankRoleTask.task_key)
    )
    result: list[dict[str, object]] = []
    for task in tasks:
        request_row = None
        if task.requirement_type == "metric":
            progress = int(
                db.scalar(
                    select(func.count())
                    .select_from(RankTaskMetricReceipt)
                    .where(
                        RankTaskMetricReceipt.user_id == user.id,
                        RankTaskMetricReceipt.event_key == task.event_key,
                    )
                )
                or 0
            )
            target = task.target_count or 1
            completed = progress >= target
            request_status = None
        else:
            request_row = db.scalar(
                select(RankTaskRequest)
                .where(
                    RankTaskRequest.user_id == user.id,
                    RankTaskRequest.policy_id == policy.id,
                    RankTaskRequest.tier_key == tier.tier_key,
                    RankTaskRequest.task_key == task.task_key,
                )
                .order_by(RankTaskRequest.created_at.desc())
            )
            progress = 1 if request_row and request_row.status == "approved" else 0
            target = 1
            completed = progress == target
            request_status = request_row.status if request_row else None
        result.append(
            {
                "taskKey": task.task_key,
                "staffRole": task.staff_role,
                "title": task.title,
                "requirementType": task.requirement_type,
                "eventKey": task.event_key,
                "progress": min(progress, target),
                "targetCount": target,
                "completed": completed,
                "requestStatus": request_status,
                "canRequest": task.requirement_type == "manual_review"
                and not completed
                and request_status != "pending",
            }
        )
    return result


def _rank(db: DB, user: Principal, track: str) -> dict[str, object]:
    exp = _balance(db, user.id, "exp")
    policy = db.scalar(
        select(RankPolicy)
        .where(
            RankPolicy.track == track,
            RankPolicy.status == "active",
        )
        .order_by(RankPolicy.version.desc())
    )
    if policy is None:
        return {
            "track": track,
            "exp": exp,
            "policyVersion": None,
            "current": None,
            "next": None,
            "progressPercent": None,
        }
    tiers = list(
        db.scalars(
            select(RankTier).where(RankTier.policy_id == policy.id).order_by(RankTier.threshold_exp)
        )
    )
    task_map = {tier.tier_key: _requirements(db, user, policy, tier) for tier in tiers}
    eligible = [
        tier
        for tier in tiers
        if exp >= tier.threshold_exp and all(item["completed"] for item in task_map[tier.tier_key])
    ]
    current = eligible[-1] if eligible else None
    following = next((tier for tier in tiers if tier not in eligible), None)
    progress = None
    if following:
        if exp >= following.threshold_exp:
            progress = 100.0
        else:
            lower = current.threshold_exp if current else 0
            progress = round((exp - lower) / (following.threshold_exp - lower) * 100, 2)
    return {
        "track": track,
        "exp": exp,
        "policyVersion": policy.version,
        "policyId": policy.id,
        "current": _tier(current) if current else None,
        "next": _tier(following) if following else None,
        "progressPercent": progress,
        "nextRequirements": task_map[following.tier_key] if following else [],
    }


def _tier(item: RankTier) -> dict[str, object]:
    return {
        "key": item.tier_key,
        "name": item.name,
        "thresholdExp": item.threshold_exp,
        "icon": item.icon,
        "color": item.color,
        "description": item.description,
    }


@router.get("/me/wallet")
def my_wallet(db: DB, user: Principal) -> dict[str, object]:
    tracks = []
    if "student" in user.roles:
        tracks.append(_rank(db, user, "student"))
    if set(user.roles) & STAFF_ROLES:
        tracks.append(_rank(db, user, "staff"))
    instant = utc(now())
    boost = db.get(UserExpMultiplier, user.id)
    active_boost = boost is not None and utc(boost.starts_at) <= instant < utc(boost.ends_at)
    return {
        "exp": _balance(db, user.id, "exp"),
        "coin": _balance(db, user.id, "coin"),
        "ranks": tracks,
        "expMultiplier": boost.multiplier if active_boost and boost else 1,
        "expMultiplierEndsAt": utc(boost.ends_at).isoformat() if active_boost and boost else None,
    }


@router.get("/me/ledger")
def my_ledger(
    db: DB,
    user: Principal,
    cursor: uuid.UUID | None = None,
    pageSize: int = Query(default=25, ge=1, le=100),
    currency: str | None = Query(default=None, pattern=r"^(exp|coin)$"),
) -> dict[str, object]:
    statement = select(EconomyLedger).where(EconomyLedger.user_id == user.id)
    if currency:
        statement = statement.where(EconomyLedger.currency == currency)
    if cursor:
        point = db.get(EconomyLedger, str(cursor))
        if point is None or point.user_id != user.id:
            raise HTTPException(422, "invalid_cursor")
        statement = statement.where(
            (EconomyLedger.created_at < point.created_at)
            | ((EconomyLedger.created_at == point.created_at) & (EconomyLedger.id < point.id))
        )
    rows = list(
        db.scalars(
            statement.order_by(EconomyLedger.created_at.desc(), EconomyLedger.id.desc()).limit(
                pageSize + 1
            )
        )
    )
    page = rows[:pageSize]
    return {
        "items": [
            {
                "id": row.id,
                "currency": row.currency,
                "delta": row.delta,
                "source": row.source,
                "reason": row.reason,
                "createdAt": utc(row.created_at).isoformat(),
            }
            for row in page
        ],
        "nextCursor": page[-1].id if len(rows) > pageSize else None,
    }


def _policy_view(db: DB, policy: RankPolicy) -> dict[str, object]:
    tiers = db.scalars(
        select(RankTier).where(RankTier.policy_id == policy.id).order_by(RankTier.position)
    )
    rendered = []
    for tier in tiers:
        tasks = db.scalars(
            select(RankRoleTask)
            .where(
                RankRoleTask.policy_id == policy.id,
                RankRoleTask.tier_key == tier.tier_key,
            )
            .order_by(RankRoleTask.staff_role, RankRoleTask.task_key)
        )
        rendered.append(
            _tier(tier)
            | {
                "position": tier.position,
                "roleTasks": [
                    {
                        "taskKey": task.task_key,
                        "staffRole": task.staff_role,
                        "title": task.title,
                        "requirementType": task.requirement_type,
                        "eventKey": task.event_key,
                        "targetCount": task.target_count,
                    }
                    for task in tasks
                ],
            }
        )
    return {
        "id": policy.id,
        "track": policy.track,
        "version": policy.version,
        "status": policy.status,
        "effectiveAt": utc(policy.effective_at).isoformat() if policy.effective_at else None,
        "tiers": rendered,
    }


@router.get("/admin/rank-policies")
def list_rank_policies(db: DB, user: Admin) -> dict[str, object]:
    policies = db.scalars(select(RankPolicy).order_by(RankPolicy.track, RankPolicy.version.desc()))
    return {"items": [_policy_view(db, policy) for policy in policies]}


@router.post("/admin/rank-policies", status_code=201)
def create_rank_policy(
    body: RankPolicyDraft, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    lock_admin(db, request, user)
    keys = [item.tierKey for item in body.tiers]
    thresholds = [item.thresholdExp for item in body.tiers]
    task_signatures = [
        (tier.tierKey, task.staffRole, task.taskKey)
        for tier in body.tiers
        for task in tier.roleTasks
    ]
    tasks_valid = all(
        body.track == "staff"
        and (
            (
                task.requirementType == "metric"
                and task.eventKey in RANK_METRIC_KEYS
                and task.targetCount is not None
            )
            or (
                task.requirementType == "manual_review"
                and task.eventKey is None
                and task.targetCount is None
            )
        )
        for tier in body.tiers
        for task in tier.roleTasks
    )
    if (
        len(set(keys)) != len(keys)
        or thresholds[0] != 0
        or any(a >= b for a, b in pairwise(thresholds))
        or len(set(task_signatures)) != len(task_signatures)
        or not tasks_valid
    ):
        raise HTTPException(422, "invalid_rank_tier_order")
    version = (
        db.scalar(select(func.max(RankPolicy.version)).where(RankPolicy.track == body.track)) or 0
    ) + 1
    policy = RankPolicy(track=body.track, version=version, status="draft", author_id=user.id)
    db.add(policy)
    db.flush()
    db.add_all(
        [
            RankTier(
                policy_id=policy.id,
                tier_key=tier.tierKey,
                name=tier.name,
                threshold_exp=tier.thresholdExp,
                icon=tier.icon,
                color=tier.color,
                description=tier.description,
                position=index,
            )
            for index, tier in enumerate(body.tiers)
        ]
    )
    db.add_all(
        [
            RankRoleTask(
                policy_id=policy.id,
                tier_key=tier.tierKey,
                staff_role=task.staffRole,
                task_key=task.taskKey,
                title=task.title,
                requirement_type=task.requirementType,
                event_key=task.eventKey,
                target_count=task.targetCount,
            )
            for tier in body.tiers
            for task in tier.roleTasks
        ]
    )
    audit(
        db,
        request,
        "rank_policy_drafted",
        user,
        {
            "policyId": policy.id,
            "track": policy.track,
            "version": version,
            "tierCount": len(body.tiers),
            "roleTaskCount": len(task_signatures),
        },
    )
    db.flush()
    return _policy_view(db, policy)


def _task_request_view(db: DB, row: RankTaskRequest) -> dict[str, object]:
    target = db.get(User, row.user_id)
    task = db.scalar(
        select(RankRoleTask).where(
            RankRoleTask.policy_id == row.policy_id,
            RankRoleTask.tier_key == row.tier_key,
            RankRoleTask.task_key == row.task_key,
        )
    )
    return {
        "id": row.id,
        "userId": row.user_id,
        "username": target.username if target else None,
        "policyId": row.policy_id,
        "tierKey": row.tier_key,
        "taskKey": row.task_key,
        "taskTitle": task.title if task else row.task_key,
        "evidence": row.evidence,
        "status": row.status,
        "reviewerReason": row.reviewer_reason,
        "createdAt": utc(row.created_at).isoformat(),
        "reviewedAt": utc(row.reviewed_at).isoformat() if row.reviewed_at else None,
    }


@router.post("/me/rank-task-requests", status_code=201)
def request_rank_task(
    body: RankTaskRequestDraft,
    request: Request,
    db: DB,
    user: Principal,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=160),
) -> dict[str, object]:
    lock_actor(db, request, user)
    policy = db.get(RankPolicy, str(body.policyId))
    if policy is None or policy.status != "active" or policy.track != "staff":
        raise HTTPException(404, "rank_policy_not_found")
    task = db.scalar(
        select(RankRoleTask).where(
            RankRoleTask.policy_id == policy.id,
            RankRoleTask.tier_key == body.tierKey,
            RankRoleTask.task_key == body.taskKey,
            RankRoleTask.staff_role.in_(set(user.roles) & STAFF_ROLES),
        )
    )
    if task is None or task.requirement_type != "manual_review":
        raise HTTPException(404, "manual_rank_task_not_found")
    prior = db.scalar(
        select(RankTaskRequest).where(
            RankTaskRequest.user_id == user.id, RankTaskRequest.idempotency_key == idempotency_key
        )
    )
    if prior:
        if (
            prior.policy_id != policy.id
            or prior.tier_key != body.tierKey
            or prior.task_key != body.taskKey
            or prior.evidence != body.evidence
        ):
            raise HTTPException(409, "idempotency_key_reused")
        return _task_request_view(db, prior) | {"replayed": True}
    existing = db.scalar(
        select(RankTaskRequest).where(
            RankTaskRequest.user_id == user.id,
            RankTaskRequest.policy_id == policy.id,
            RankTaskRequest.tier_key == body.tierKey,
            RankTaskRequest.task_key == body.taskKey,
            RankTaskRequest.status == "approved",
        )
    )
    if existing:
        raise HTTPException(409, "rank_task_already_approved")
    pending = db.scalar(
        select(RankTaskRequest).where(
            RankTaskRequest.user_id == user.id,
            RankTaskRequest.policy_id == policy.id,
            RankTaskRequest.tier_key == body.tierKey,
            RankTaskRequest.task_key == body.taskKey,
            RankTaskRequest.status == "pending",
        )
    )
    if pending:
        raise HTTPException(409, "rank_task_request_pending")
    row = RankTaskRequest(
        id=str(uuid.uuid4()),
        user_id=user.id,
        policy_id=policy.id,
        tier_key=body.tierKey,
        task_key=body.taskKey,
        evidence=body.evidence,
        idempotency_key=idempotency_key,
    )
    db.add(row)
    audit(
        db,
        request,
        "rank_task_review_requested",
        user,
        {
            "requestId": row.id,
            "policyId": policy.id,
            "tierKey": body.tierKey,
            "taskKey": body.taskKey,
        },
    )
    db.flush()
    return _task_request_view(db, row) | {"replayed": False}


@router.get("/admin/rank-task-requests")
def list_rank_task_requests(
    db: DB,
    user: Admin,
    status: str = Query(default="pending", pattern=r"^(pending|approved|rejected)$"),
) -> dict[str, object]:
    rows = db.scalars(
        select(RankTaskRequest)
        .where(RankTaskRequest.status == status)
        .order_by(RankTaskRequest.created_at.desc())
        .limit(250)
    )
    return {"items": [_task_request_view(db, row) for row in rows]}


@router.post("/admin/rank-task-requests/{request_id}/decisions")
def decide_rank_task_request(
    request_id: uuid.UUID, body: RankTaskRequestDecision, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    lock_admin(db, request, user)
    row = db.scalar(
        select(RankTaskRequest).where(RankTaskRequest.id == str(request_id)).with_for_update()
    )
    if row is None:
        raise HTTPException(404, "rank_task_request_not_found")
    resulting_status = "approved" if body.decision == "approve" else "rejected"
    if row.status != "pending":
        if row.status == resulting_status:
            return _task_request_view(db, row) | {"replayed": True}
        raise HTTPException(409, "rank_task_request_already_decided")
    if row.user_id == user.id:
        raise HTTPException(403, "rank_task_reviewer_must_be_independent")
    row.status = resulting_status
    row.reviewer_id = user.id
    row.reviewer_reason = body.reason
    row.reviewed_at = now()
    audit(
        db,
        request,
        "rank_task_request_decided",
        user,
        {"requestId": row.id, "userId": row.user_id, "decision": body.decision},
    )
    db.flush()
    return _task_request_view(db, row) | {"replayed": False}


@router.post("/admin/rank-policies/{policy_id}/activation")
def activate_rank_policy(
    policy_id: uuid.UUID, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    lock_admin(db, request, user)
    policy = db.get(RankPolicy, str(policy_id))
    if policy is None:
        raise HTTPException(404, "rank_policy_not_found")
    if policy.status != "draft":
        raise HTTPException(409, "rank_policy_immutable")
    tiers = list(
        db.scalars(
            select(RankTier).where(RankTier.policy_id == policy.id).order_by(RankTier.position)
        )
    )
    if (
        not tiers
        or tiers[0].threshold_exp != 0
        or any(a.threshold_exp >= b.threshold_exp for a, b in pairwise(tiers))
    ):
        raise HTTPException(422, "invalid_rank_tier_order")
    previous = list(
        db.scalars(
            select(RankPolicy).where(
                RankPolicy.track == policy.track, RankPolicy.status == "active"
            )
        )
    )
    for item in previous:
        item.status = "retired"
    policy.status = "active"
    policy.effective_at = now()
    audit(
        db,
        request,
        "rank_policy_activated",
        user,
        {"policyId": policy.id, "track": policy.track, "version": policy.version},
    )
    db.flush()
    return _policy_view(db, policy)
