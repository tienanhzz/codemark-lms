"""Apply and expire one-time, mission-scoped streak card progress."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import MissionProgress, MissionStreakBoost
from .security import utc


def expire_streak_boost(
    db: Session,
    *,
    user_id: str,
    mission_id: str,
    cycle_key: str,
    instant: datetime,
) -> None:
    """Remove only progress granted by an expired boost not yet consumed by an event."""
    boosts = list(
        db.scalars(
            select(MissionStreakBoost)
            .where(
                MissionStreakBoost.user_id == user_id,
                MissionStreakBoost.mission_id == mission_id,
                MissionStreakBoost.cycle_key == cycle_key,
                MissionStreakBoost.consumed_at.is_(None),
                MissionStreakBoost.expired_at.is_(None),
                MissionStreakBoost.expires_at <= instant,
            )
            .with_for_update()
        )
    )
    for boost in boosts:
        progress = db.scalar(
            select(MissionProgress)
            .where(
                MissionProgress.user_id == user_id,
                MissionProgress.mission_id == mission_id,
                MissionProgress.mission_version == boost.mission_version,
                MissionProgress.cycle_key == cycle_key,
            )
            .with_for_update()
        )
        if progress and progress.status == "active":
            removable = min(boost.granted_progress, max(0, progress.progress - boost.base_progress))
            progress.progress -= removable
        boost.expired_at = instant


def consume_streak_boost(
    db: Session,
    *,
    user_id: str,
    mission_id: str,
    mission_version: int,
    cycle_key: str,
    instant: datetime,
) -> bool:
    """Consume the matching boost on the first qualifying mission event."""
    boost = db.scalar(
        select(MissionStreakBoost)
        .where(
            MissionStreakBoost.user_id == user_id,
            MissionStreakBoost.mission_id == mission_id,
            MissionStreakBoost.mission_version == mission_version,
            MissionStreakBoost.cycle_key == cycle_key,
            MissionStreakBoost.consumed_at.is_(None),
            MissionStreakBoost.expired_at.is_(None),
        )
        .with_for_update()
    )
    if boost is None or utc(boost.expires_at) <= utc(instant):
        return False
    boost.consumed_at = instant
    return True
