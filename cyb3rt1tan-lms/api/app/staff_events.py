"""Course staff events with funded prize reserves and deterministic payouts."""

import hashlib
import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import func, select

from .auth import DB, Principal, audit
from .course_access import course_for, lock_actor, period, permissions
from .models import Course, CourseMembership, EconomyLedger, StaffEvent, StaffEventAward, User, now
from .security import utc

router = APIRouter(prefix="/v1")


class StaffEventDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(default="", max_length=1000)
    startsAt: datetime
    endsAt: datetime
    timezone: str = Field(min_length=1, max_length=64)
    prizeBudgetCoin: int = Field(gt=0, le=2_000_000_000)
    awardMode: str = Field(pattern=r"^(winner_takes_all|equal_split)$")


class StaffEventResults(BaseModel):
    model_config = ConfigDict(extra="forbid")
    participantIds: list[uuid.UUID] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def unique_participants(self) -> "StaffEventResults":
        if len(set(self.participantIds)) != len(self.participantIds):
            raise ValueError("duplicate_participant")
        return self


def _coin(db: DB, user_id: str) -> int:
    return int(
        db.scalar(
            select(func.coalesce(func.sum(EconomyLedger.delta), 0)).where(
                EconomyLedger.user_id == user_id,
                EconomyLedger.currency == "coin",
            )
        )
        or 0
    )


def _event_json(db: DB, event: StaffEvent, viewer: Principal) -> dict[str, object]:
    course = db.get(Course, event.course_id)
    can_read_roster = bool(
        course and permissions(db, course, viewer) & {"roster.read", "events.manage"}
    )
    result: dict[str, object] = {
        "id": event.id,
        "courseId": event.course_id,
        "title": event.title,
        "description": event.description,
        "startsAt": utc(event.starts_at).isoformat(),
        "endsAt": utc(event.ends_at).isoformat(),
        "timezone": event.timezone,
        "prizeBudgetCoin": event.prize_budget_coin,
        "awardMode": event.award_mode,
        "status": event.status,
        "organizer": "Course staff" if can_read_roster else None,
        "canManage": bool(course and "events.manage" in permissions(db, course, viewer)),
    }
    if can_read_roster and event.status == "paid":
        rows = db.execute(
            select(StaffEventAward, User)
            .join(User, User.id == StaffEventAward.user_id)
            .where(StaffEventAward.event_id == event.id)
            .order_by(StaffEventAward.placement, User.official_name)
        )
        result["awards"] = [
            {
                "userId": award.user_id,
                "name": user.nickname or user.official_name,
                "placement": award.placement,
                "coinAwarded": award.coin_awarded,
            }
            for award, user in rows
        ]
    return result


@router.get("/courses/{course_id}/staff-events")
def list_staff_events(course_id: uuid.UUID, db: DB, user: Principal) -> dict[str, object]:
    course = course_for(db, course_id, user)
    events = db.scalars(
        select(StaffEvent)
        .where(StaffEvent.course_id == course.id)
        .order_by(StaffEvent.starts_at.desc())
        .limit(100)
    )
    return {"items": [_event_json(db, event, user) for event in events]}


@router.post("/courses/{course_id}/staff-events", status_code=201)
def create_staff_event(
    course_id: uuid.UUID,
    body: StaffEventDraft,
    request: Request,
    db: DB,
    user: Principal,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=160),
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "events.manage", write=True)
    start, end = period(body.startsAt, body.endsAt, body.timezone)
    existing = db.scalar(
        select(StaffEvent).where(
            StaffEvent.organizer_id == user.id,
            StaffEvent.idempotency_key == idempotency_key,
        )
    )
    if existing:
        expected = (
            course.id,
            body.title,
            body.description,
            start,
            end,
            body.timezone,
            body.prizeBudgetCoin,
            body.awardMode,
        )
        actual = (
            existing.course_id,
            existing.title,
            existing.description,
            utc(existing.starts_at),
            utc(existing.ends_at),
            existing.timezone,
            existing.prize_budget_coin,
            existing.award_mode,
        )
        if actual != expected:
            raise HTTPException(409, "idempotency_key_reused")
        return _event_json(db, existing, user)
    if _coin(db, user.id) < body.prizeBudgetCoin:
        raise HTTPException(409, "insufficient_coin")
    event = StaffEvent(
        id=str(uuid.uuid4()),
        course_id=course.id,
        organizer_id=user.id,
        title=body.title,
        description=body.description,
        starts_at=start,
        ends_at=end,
        timezone=body.timezone,
        prize_budget_coin=body.prizeBudgetCoin,
        award_mode=body.awardMode,
        status="funded",
        idempotency_key=idempotency_key,
    )
    db.add(event)
    db.add(
        EconomyLedger(
            user_id=user.id,
            currency="coin",
            delta=-body.prizeBudgetCoin,
            source="staff_event.fund",
            idempotency_key=f"staff-event:{event.id}:fund",
            reason="Fund course event prize reserve",
            actor_id=user.id,
            detail={"eventId": event.id},
        )
    )
    audit(
        db,
        request,
        "staff_event_funded",
        user,
        {
            "eventId": event.id,
            "courseId": course.id,
            "budgetCoin": body.prizeBudgetCoin,
            "awardMode": body.awardMode,
        },
    )
    db.flush()
    return _event_json(db, event, user)


@router.post("/staff-events/{event_id}/results/approval")
def approve_staff_event_results(
    event_id: uuid.UUID,
    body: StaffEventResults,
    request: Request,
    db: DB,
    user: Principal,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=160),
) -> dict[str, object]:
    lock_actor(db, request, user)
    event = db.scalar(select(StaffEvent).where(StaffEvent.id == str(event_id)).with_for_update())
    if event is None:
        raise HTTPException(404, "staff_event_not_found")
    course = course_for(db, uuid.UUID(event.course_id), user, "events.manage", write=True)
    digest = hashlib.sha256(
        json.dumps([str(item) for item in body.participantIds], separators=(",", ":")).encode()
    ).hexdigest()
    if event.status == "paid":
        if event.approval_key != idempotency_key or event.results_hash != digest:
            raise HTTPException(409, "results_already_approved")
        return {"eventId": event.id, "status": event.status, "replayed": True}
    if event.status != "funded":
        raise HTTPException(409, "staff_event_not_funded")
    if utc(event.ends_at) > now():
        raise HTTPException(409, "event_not_ended")
    if event.award_mode == "winner_takes_all" and len(body.participantIds) != 1:
        raise HTTPException(422, "winner_takes_all_requires_one_participant")
    ids = [str(item) for item in body.participantIds]
    candidates = db.execute(
        select(CourseMembership.user_id, User.roles)
        .join(User, User.id == CourseMembership.user_id)
        .where(
            CourseMembership.course_id == course.id,
            CourseMembership.status == "active",
            User.status == "active",
            User.id.in_(ids),
        )
    )
    eligible = {member_id for member_id, roles in candidates if "student" in roles}
    if eligible != set(ids):
        raise HTTPException(422, "participants_must_be_active_course_students")
    split, remainder = divmod(event.prize_budget_coin, len(ids))
    for placement, participant_id in enumerate(ids, start=1):
        amount = (
            event.prize_budget_coin
            if event.award_mode == "winner_takes_all"
            else split + (1 if placement <= remainder else 0)
        )
        db.add(
            StaffEventAward(
                event_id=event.id,
                user_id=participant_id,
                placement=placement,
                coin_awarded=amount,
                approved_by_id=user.id,
            )
        )
        if amount:
            db.add(
                EconomyLedger(
                    user_id=participant_id,
                    currency="coin",
                    delta=amount,
                    source="staff_event.award",
                    idempotency_key=f"staff-event:{event.id}:award:{participant_id}",
                    reason=f"Prize: {event.title}",
                    actor_id=user.id,
                    detail={"eventId": event.id, "placement": placement},
                )
            )
    event.status = "paid"
    event.approval_key = idempotency_key
    event.results_hash = digest
    event.approved_by_id = user.id
    event.approved_at = now()
    audit(
        db,
        request,
        "staff_event_results_approved",
        user,
        {"eventId": event.id, "participantCount": len(ids), "budgetCoin": event.prize_budget_coin},
    )
    db.flush()
    return {"eventId": event.id, "status": event.status, "replayed": False}


@router.post("/staff-events/{event_id}/cancellations")
def cancel_staff_event(
    event_id: uuid.UUID,
    request: Request,
    db: DB,
    user: Principal,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=160),
) -> dict[str, object]:
    lock_actor(db, request, user)
    event = db.scalar(select(StaffEvent).where(StaffEvent.id == str(event_id)).with_for_update())
    if event is None:
        raise HTTPException(404, "staff_event_not_found")
    course = course_for(db, uuid.UUID(event.course_id), user, "events.manage", write=True)
    if event.status == "cancelled":
        if event.approval_key != idempotency_key:
            raise HTTPException(409, "cancellation_already_recorded")
        return {"eventId": event.id, "status": event.status, "replayed": True}
    if event.status != "funded":
        raise HTTPException(409, "paid_event_cannot_be_cancelled")
    if event.organizer_id != user.id and "admin" not in user.roles:
        raise HTTPException(403, "event_organizer_required")
    event.status = "cancelled"
    event.approval_key = idempotency_key
    event.approved_by_id = user.id
    event.approved_at = now()
    db.add(
        EconomyLedger(
            user_id=event.organizer_id,
            currency="coin",
            delta=event.prize_budget_coin,
            source="staff_event.refund",
            idempotency_key=f"staff-event:{event.id}:refund",
            reason="Refund cancelled course event reserve",
            actor_id=user.id,
            detail={"eventId": event.id},
        )
    )
    audit(db, request, "staff_event_cancelled", user, {"eventId": event.id, "courseId": course.id})
    db.flush()
    return {"eventId": event.id, "status": event.status, "replayed": False}
