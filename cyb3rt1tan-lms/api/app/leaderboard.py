"""Authenticated, privacy-safe rankings projected from the immutable EXP ledger."""

import re
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import String, cast, func, or_, select

from .auth import DB, Principal
from .course_access import course_for
from .economy import _tier
from .models import (
    CourseMembership,
    CourseStaff,
    EconomyLedger,
    RankPolicy,
    RankRoleTask,
    RankTaskMetricReceipt,
    RankTaskRequest,
    RankTier,
    User,
)

router = APIRouter(prefix="/v1")


def _position_tier(position: int) -> dict[str, object]:
    # Legacy six-rank artwork is positional, not a made-up EXP policy.
    ranges = [
        (1, "master", "#6b21a8"),
        (2, "ruby", "#9f1239"),
        (3, "diamond", "#075985"),
        (5, "gold", "#854d0e"),
        (10, "silver", "#475569"),
    ]
    key, color = next(
        ((key, color) for maximum, key, color in ranges if position <= maximum),
        ("bronze", "#9a3412"),
    )
    return {
        "key": key,
        "name": key.title(),
        "color": color,
        "icon": "fa-ranking-star",
        "thresholdExp": 0,
        "description": "Position-based leaderboard rank",
        "source": "position",
    }


def _tiers_for_users(
    db: DB, track: str, users: list[tuple[User, int, int]]
) -> dict[str, dict[str, object] | None]:
    policy = db.scalar(
        select(RankPolicy)
        .where(RankPolicy.track == track, RankPolicy.status == "active")
        .order_by(RankPolicy.version.desc())
        .limit(1)
    )
    if policy is None:
        return {user.id: _position_tier(position) for user, _, position in users}
    if not users:
        return {}
    tiers = list(
        db.scalars(
            select(RankTier).where(RankTier.policy_id == policy.id).order_by(RankTier.threshold_exp)
        )
    )
    tasks = (
        list(db.scalars(select(RankRoleTask).where(RankRoleTask.policy_id == policy.id)))
        if track == "staff"
        else []
    )
    metrics: dict[tuple[str, str], int] = {}
    reviews: dict[tuple[str, str, str], str] = {}
    if tasks:
        ids = [user.id for user, _, _ in users]
        metrics = {
            (user_id, event_key): count
            for user_id, event_key, count in db.execute(
                select(RankTaskMetricReceipt.user_id, RankTaskMetricReceipt.event_key, func.count())
                .where(RankTaskMetricReceipt.user_id.in_(ids))
                .group_by(RankTaskMetricReceipt.user_id, RankTaskMetricReceipt.event_key)
            )
        }
        for request in db.scalars(
            select(RankTaskRequest)
            .where(RankTaskRequest.policy_id == policy.id, RankTaskRequest.user_id.in_(ids))
            .order_by(RankTaskRequest.created_at.desc(), RankTaskRequest.id.desc())
        ):
            reviews.setdefault(
                (request.user_id, request.tier_key, request.task_key), request.status
            )
    result: dict[str, dict[str, object] | None] = {}
    for user, exp, _ in users:
        eligible = [
            tier
            for tier in tiers
            if exp >= tier.threshold_exp
            and all(
                (
                    metrics.get((user.id, task.event_key or ""), 0) >= (task.target_count or 1)
                    if task.requirement_type == "metric"
                    else reviews.get((user.id, tier.tier_key, task.task_key)) == "approved"
                )
                for task in tasks
                if task.tier_key == tier.tier_key and task.staff_role in user.roles
            )
        ]
        result[user.id] = _tier(eligible[-1]) if eligible else None
    return result


@router.get("/leaderboard")
def leaderboard(
    db: DB,
    user: Principal,
    track: Literal["student", "staff"] = "student",
    q: str = Query(default="", max_length=100),
    course_id: Annotated[UUID | None, Query(alias="courseId")] = None,
) -> dict[str, object]:
    role = "student" if track == "student" else "teacher"
    cohort = [User.status == "active", cast(User.roles, String).contains(f'"{role}"')]
    if course_id is not None:
        course = course_for(db, course_id, user)
        if track == "student":
            members = select(CourseMembership.user_id).where(
                CourseMembership.course_id == course.id,
                CourseMembership.status.in_(["active", "completed"]),
            )
            cohort.append(User.id.in_(members))
        else:
            teachers = select(CourseStaff.user_id).where(
                CourseStaff.course_id == course.id,
                CourseStaff.role == "teacher",
                CourseStaff.active.is_(True),
            )
            cohort.append(or_(User.id == course.owner_id, User.id.in_(teachers)))
    balances = (
        select(
            EconomyLedger.user_id.label("user_id"),
            func.sum(EconomyLedger.delta).label("exp"),
        )
        .where(EconomyLedger.currency == "exp")
        .group_by(EconomyLedger.user_id)
        .subquery()
    )
    exp = func.coalesce(balances.c.exp, 0)
    rows = db.execute(
        select(User, exp, func.rank().over(order_by=exp.desc()))
        .outerjoin(balances, balances.c.user_id == User.id)
        .where(*cohort)
        .order_by(exp.desc(), User.username, User.id)
    )
    ranked = [(target, int(score), int(position)) for target, score, position in rows]
    tiers = _tiers_for_users(db, track, ranked)
    query = q.strip().casefold()
    items = []
    for target, score, position in ranked:
        # Imported legacy usernames may be email addresses; never publish those.
        username = (
            target.username if re.fullmatch(r"[A-Za-z0-9._-]{1,128}", target.username) else None
        )
        nickname = target.nickname.strip() if target.nickname else None
        if nickname and "@" in nickname:
            nickname = None
        display = (
            nickname
            or username
            or f"{'Student' if track == 'student' else 'Teacher'} {target.id[:8]}"
        )
        if query and query not in display.casefold() and query not in (username or "").casefold():
            continue
        items.append(
            {
                "position": position,
                "userId": target.id,
                "displayName": display,
                "username": username,
                "exp": score,
                "tier": tiers.get(target.id),
            }
        )
    return {"items": items, "total": len(items), "track": track}
