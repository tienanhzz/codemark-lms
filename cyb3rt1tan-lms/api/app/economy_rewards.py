"""Trusted EXP reward ledgering with active user multiplier effects."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import EconomyLedger, UserExpMultiplier, now
from .security import utc


def record_exp_reward(
    db: Session,
    *,
    user_id: str,
    amount: int,
    source: str,
    idempotency_key: str,
    reason: str,
    actor_id: str | None = None,
    detail: dict[str, object] | None = None,
    instant: datetime | None = None,
) -> int:
    """Record a configured amount, applying at most x2 while a boost is active."""
    if amount <= 0:
        return 0
    issued_at = utc(instant or now())
    boost = db.scalar(
        select(UserExpMultiplier).where(UserExpMultiplier.user_id == user_id).with_for_update()
    )
    multiplier = (
        boost.multiplier if boost and utc(boost.starts_at) <= issued_at < utc(boost.ends_at) else 1
    )
    credited = amount * multiplier
    ledger_detail = dict(detail or {})
    ledger_detail.update(
        {"baseExp": amount, "multiplier": multiplier, "bonusExp": credited - amount}
    )
    db.add(
        EconomyLedger(
            user_id=user_id,
            currency="exp",
            delta=credited,
            source=source,
            idempotency_key=idempotency_key,
            reason=reason,
            actor_id=actor_id,
            detail=ledger_detail,
        )
    )
    return credited
