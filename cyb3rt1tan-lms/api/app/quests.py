"""Role-scoped workbook quests with trusted receipts and audited evidence review."""

import hashlib
import uuid
from datetime import timedelta
from typing import Any, Literal
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import DB, Principal, audit, lock_identity
from .course_access import course_for, lock_actor, permissions, visibility
from .economy_rewards import record_exp_reward
from .models import (
    AcademicTerm,
    Assessment,
    AssessmentAttempt,
    AssessmentGradeRelease,
    AssessmentRecipient,
    AssessmentVersion,
    Course,
    CourseResource,
    EconomyLedger,
    User,
    now,
)
from .quest_models import (
    QuestActivityDay,
    QuestCompletion,
    QuestDefinition,
    QuestEventReceipt,
    QuestEvidence,
    QuestResourceView,
)
from .quest_rules import (
    CAPS,
    CODE_EVENT,
    COURSE_SCOPED,
    EVENT_CODES,
    FAMILIES,
    REVIEW_REQUIRED,
    ROUTES,
    satisfies,
)
from .security import utc

router = APIRouter(prefix="/v1/quests")
ZONE = ZoneInfo("Asia/Ho_Chi_Minh")


def _own_role(user: User) -> str | None:
    # An administrator manages both catalogs, without being enrolled into either mission list.
    return "teacher" if "teacher" in user.roles else "student" if "student" in user.roles else None


def _can_manage(user: User, target: str) -> bool:
    return "admin" in user.roles or (target == "student" and "teacher" in user.roles)


def _cycle(item: QuestDefinition, data: dict[str, Any]) -> str | None:
    local = utc(now()).astimezone(ZONE)
    if item.reset_type == "DAILY":
        return f"day:{local.date().isoformat()}"
    if item.reset_type == "WEEKLY":
        year, week, _ = local.isocalendar()
        scope = str(data.get("course_id", "")) if item.quest_code in COURSE_SCOPED else ""
        if item.quest_code in COURSE_SCOPED and not scope:
            return None
        return f"week:{year}-W{week:02d}:{scope}"
    entity = str(data.get("entity_id") or data.get("topic_id") or "")
    if not entity:
        return None
    if item.reset_type == "END_OF_TERM":
        term, course = data.get("term_id"), data.get("course_id")
        return f"term:{term}:{course}" if term and course else None
    return f"entity:{entity}"


def _reward(
    db: Session,
    user: User,
    definition: QuestDefinition,
    completion: QuestCompletion,
    source_id: str,
) -> None:
    exp = max(0, definition.reward_exp - completion.base_exp)
    coin = max(0, definition.reward_coin - completion.base_coin)
    key = f"quest:{completion.id}:{definition.quest_code}"
    completion.exp_awarded += record_exp_reward(
        db,
        user_id=user.id,
        amount=exp,
        source="quest_reward",
        idempotency_key=key + ":exp",
        reason=definition.quest_name,
        detail={"questCode": definition.quest_code, "sourceEventId": source_id},
    )
    if coin:
        db.add(
            EconomyLedger(
                user_id=user.id,
                currency="coin",
                delta=coin,
                source="quest_reward",
                idempotency_key=key + ":coin",
                reason=definition.quest_name,
                detail={"questCode": definition.quest_code, "sourceEventId": source_id},
            )
        )
    completion.coin_awarded += coin
    completion.base_exp = max(completion.base_exp, definition.reward_exp)
    completion.base_coin = max(completion.base_coin, definition.reward_coin)


def record_quest_event(
    db: Session, user: User, event_key: str, source_id: str, metadata: dict[str, Any]
) -> list[str]:
    """Internal only; caller authenticates domain evidence. Never exposed as an HTTP event route.

    One actor lock serializes limits/rewards; permanent source receipts prevent replays across resets.
    Return the codes newly completed/upgraded. Caller owns the transaction.
    """
    if (
        event_key not in EVENT_CODES
        or not source_id
        or len(source_id) > 200
        or user.status != "active"
    ):
        return []
    lock_identity(db)
    db.flush()
    candidates = list(
        db.scalars(
            select(QuestDefinition).where(
                QuestDefinition.quest_code.in_(EVENT_CODES[event_key]),
                QuestDefinition.active.is_(True),
            )
        )
    )
    eligible = [
        item
        for item in candidates
        if item.target_role == _own_role(user) and satisfies(item.quest_code, user, metadata)
    ]
    if not eligible:
        return []
    if event_key not in {"attendance.confirmed", "learning.streak"}:
        _activity(db, user, active=True)
    if db.scalar(
        select(QuestEventReceipt.id).where(
            QuestEventReceipt.user_id == user.id,
            QuestEventReceipt.event_key == event_key,
            QuestEventReceipt.source_event_id == source_id,
        )
    ):
        return []
    # Pick the higher tier before creating any reward; the two tiers share an entity slot.
    eligible.sort(key=lambda item: item.quest_code in FAMILIES, reverse=True)
    db.add(QuestEventReceipt(user_id=user.id, event_key=event_key, source_event_id=source_id))
    earned: list[str] = []
    seen_groups: set[str] = set()
    for item in eligible:
        group = FAMILIES.get(item.quest_code, item.quest_code)
        cycle = _cycle(item, metadata)
        if group in seen_groups or not cycle:
            continue
        seen_groups.add(group)
        rows = list(
            db.scalars(
                select(QuestCompletion)
                .where(
                    QuestCompletion.user_id == user.id,
                    QuestCompletion.group_key == group,
                    QuestCompletion.cycle_key == cycle,
                )
                .with_for_update()
            )
        )
        entity_cycle = item.reset_type in {"PER_ENTITY", "UPGRADE_TIER", "END_OF_TERM"}
        if rows and entity_cycle:
            completion = rows[0]
            if item.quest_code not in FAMILIES or completion.quest_code == item.quest_code:
                continue
            completion.quest_code = item.quest_code
            completion.source_event_id = source_id
            completion.completed_at = now()
        else:
            if len(rows) >= CAPS.get(item.quest_code, 1):
                continue
            completion = QuestCompletion(
                user_id=user.id,
                quest_code=item.quest_code,
                group_key=group,
                cycle_key=cycle,
                slot_key="entity" if entity_cycle else str(len(rows) + 1),
                source_event_id=source_id,
                base_exp=0,
                base_coin=0,
                exp_awarded=0,
                coin_awarded=0,
                detail={
                    "entityId": metadata.get("entity_id") or metadata.get("topic_id"),
                    "courseId": metadata.get("course_id"),
                },
            )
            db.add(completion)
            db.flush()
        _reward(db, user, item, completion, source_id)
        earned.append(item.quest_code)
        db.flush()
    return earned


def _activity(db: Session, user: User, *, logged_in: bool = False, active: bool = False) -> None:
    day = utc(now()).astimezone(ZONE).date()
    row = db.get(QuestActivityDay, (user.id, day.isoformat()))
    if row is None:
        row = QuestActivityDay(user_id=user.id, day=day.isoformat(), logged_in=False, active=False)
        db.add(row)
    row.logged_in = row.logged_in or logged_in
    row.active = row.active or active
    db.flush()
    days = list(
        db.scalars(
            select(QuestActivityDay).where(
                QuestActivityDay.user_id == user.id,
                QuestActivityDay.day >= (day - timedelta(days=6)).isoformat(),
                QuestActivityDay.day <= day.isoformat(),
                QuestActivityDay.logged_in.is_(True),
                QuestActivityDay.active.is_(True),
            )
        )
    )
    if len(days) == 7:
        record_quest_event(
            db, user, "learning.streak", f"streak:{day.isoformat()}", {"verified_days": 7}
        )


def record_login(db: Session, user: User) -> None:
    """Call after successful authentication, or the explicit daily confirmation endpoint."""
    lock_identity(db)
    if _own_role(user) == "student":
        _activity(db, user, logged_in=True)


def record_assessment_submission(db: Session, user: User, attempt_id: str) -> None:
    attempt = db.get(AssessmentAttempt, attempt_id)
    recipient = db.get(AssessmentRecipient, attempt.recipient_id) if attempt else None
    item = db.get(Assessment, recipient.assessment_id) if recipient else None
    version = db.get(AssessmentVersion, recipient.version_id) if recipient else None
    if (
        not attempt
        or not recipient
        or recipient.user_id != user.id
        or not item
        or not version
        or not attempt.submitted_at
    ):
        return
    # An actual submitted assessment is a learning activity even when it misses a reward condition.
    _activity(db, user, active=True)
    if item.kind == "assignment" and version.closes_at:
        record_quest_event(
            db,
            user,
            "assignment.submitted",
            attempt.id,
            {
                "entity_id": item.id,
                "course_id": item.course_id,
                "submitted_at": utc(attempt.submitted_at).isoformat(),
                "deadline": utc(version.closes_at).isoformat(),
            },
        )


def record_resource_publication(db: Session, user: User, resource: CourseResource) -> None:
    if resource.kind != "learningResource" or not resource.url:
        return
    # URL identity survives bulk resource-list replacement and title/position edits.
    key = hashlib.sha256(f"{resource.course_id}:{resource.url}".encode()).hexdigest()
    record_quest_event(
        db,
        user,
        "resource.published",
        f"resource:{key}",
        {
            "entity_id": key,
            "course_id": resource.course_id,
            "resource_kind": "lecture",
            "is_new": True,
        },
    )


def record_grade_release(db: Session, teacher: User, release: AssessmentGradeRelease) -> None:
    attempt = db.get(AssessmentAttempt, release.attempt_id)
    recipient = db.get(AssessmentRecipient, attempt.recipient_id) if attempt else None
    item = db.get(Assessment, recipient.assessment_id) if recipient else None
    version = db.get(AssessmentVersion, recipient.version_id) if recipient else None
    learner = db.get(User, recipient.user_id) if recipient else None
    if not attempt or not recipient or not item or not version or not learner:
        return
    record_quest_event(
        db,
        learner,
        "assessment.perfect",
        release.id,
        {
            "entity_id": item.id,
            "course_id": item.course_id,
            "major_assessment": True,
            "score": release.released_score,
            "max_score": release.max_points,
        },
    )
    if item.kind != "assignment" or not version.closes_at or utc(now()) < utc(version.closes_at):
        return
    submissions = list(
        db.scalars(
            select(AssessmentAttempt)
            .join(AssessmentRecipient, AssessmentRecipient.id == AssessmentAttempt.recipient_id)
            .where(
                AssessmentRecipient.version_id == version.id,
                AssessmentAttempt.status.in_(["submitted", "forceSubmitted"]),
            )
        )
    )
    # Each learner counts once; use the latest submitted attempt and its latest published grade.
    latest: dict[str, AssessmentAttempt] = {}
    for submitted in submissions:
        prior = latest.get(submitted.recipient_id)
        if prior is None or submitted.attempt_number > prior.attempt_number:
            latest[submitted.recipient_id] = submitted
    releases = [
        db.scalar(
            select(AssessmentGradeRelease)
            .where(AssessmentGradeRelease.attempt_id == submitted.id)
            .order_by(AssessmentGradeRelease.revision.desc())
        )
        for submitted in latest.values()
    ]
    if not releases or any(row is None for row in releases):
        return
    completed_releases = [row for row in releases if row is not None]
    data = {
        "entity_id": item.id,
        "course_id": item.course_id,
        "deadline": utc(version.closes_at).isoformat(),
        "released_at": max(utc(row.released_at) for row in completed_releases).isoformat(),
        "total_submissions": len(releases),
        "graded_submissions": len(releases),
    }
    record_quest_event(db, teacher, "grading.batch.released", f"batch:{item.id}:{release.id}", data)
    feedback_items = [
        "\n".join(
            str(entry.get("feedback", "")) for entry in row.breakdown if entry.get("feedback")
        )
        for row in completed_releases
    ]
    record_quest_event(
        db,
        teacher,
        "grading.feedback.completed",
        f"feedback:{item.id}:{release.id}",
        {**data, "batch_complete": True, "feedback_items": feedback_items},
    )


def _definition_json(item: QuestDefinition) -> dict[str, Any]:
    return {
        "questCode": item.quest_code,
        "targetRole": item.target_role,
        "category": item.category,
        "questName": item.quest_name,
        "conditionDesc": item.condition_desc,
        "resetType": item.reset_type,
        "limitRule": item.limit_rule,
        "reward": {"exp": item.reward_exp, "coin": item.reward_coin},
        "active": item.active,
        "revision": item.revision,
        "actionHref": ROUTES[item.quest_code],
        "reviewRequired": item.quest_code in REVIEW_REQUIRED,
    }


@router.get("/me")
def mine(db: DB, user: Principal) -> dict[str, Any]:
    definitions = list(
        db.scalars(
            select(QuestDefinition)
            .where(QuestDefinition.target_role == _own_role(user), QuestDefinition.active.is_(True))
            .order_by(QuestDefinition.quest_code)
        )
    )
    completions = list(
        db.scalars(select(QuestCompletion).where(QuestCompletion.user_id == user.id))
    )
    result = []
    for item in definitions:
        matching = [row for row in completions if row.quest_code == item.quest_code]
        if item.reset_type in {"DAILY", "WEEKLY"}:
            cycle = _cycle(item, {"course_id": ""})
            if item.quest_code in COURSE_SCOPED:
                prefix = str(_cycle(item, {"course_id": "_"})).rsplit(":", 1)[0] + ":"
                matching = [row for row in matching if row.cycle_key.startswith(prefix)]
            else:
                matching = [row for row in matching if row.cycle_key == cycle]
        count = len(matching)
        # Entity-specific quests remain actionable for further assignments/documents/topics.
        capped = item.reset_type in {"DAILY", "WEEKLY"} and item.quest_code not in COURSE_SCOPED
        completed = bool(count)
        result.append(
            {
                **_definition_json(item),
                "progress": count,
                "targetCount": 1,
                "cycleLimit": CAPS.get(item.quest_code, 1),
                "status": "complete" if completed else "active",
                "canContinue": not capped or count < CAPS.get(item.quest_code, 1),
                "completionCount": count,
            }
        )
    activity = db.get(QuestActivityDay, (user.id, utc(now()).astimezone(ZONE).date().isoformat()))
    return {
        "items": result,
        "canManage": any(_can_manage(user, role) for role in ["student", "teacher"]),
        "activityToday": bool(activity and activity.active),
    }


@router.post("/check-in")
def check_in(request: Request, db: DB, user: Principal) -> dict[str, Any]:
    lock_actor(db, request, user)
    if _own_role(user) != "student":
        raise HTTPException(403, "student_role_required")
    record_login(db, user)
    day = utc(now()).astimezone(ZONE).date().isoformat()
    earned = record_quest_event(
        db, user, "attendance.confirmed", f"checkin:{day}", {"confirmed": True}
    )
    audit(db, request, "quest_daily_checkin", user, {"day": day, "newCompletion": bool(earned)})
    return {"status": "complete", "replayed": not bool(earned)}


@router.get("/resources")
def resources(db: DB, user: Principal) -> dict[str, Any]:
    if _own_role(user) != "student":
        raise HTTPException(403, "student_role_required")
    rows = db.execute(
        select(CourseResource, Course)
        .join(Course, Course.id == CourseResource.course_id)
        .where(
            visibility(user),
            CourseResource.kind == "learningResource",
            CourseResource.url.is_not(None),
        )
        .order_by(Course.code, CourseResource.position)
    )
    return {
        "items": [
            {
                "id": resource.id,
                "courseId": course.id,
                "courseTitle": course.title,
                "title": resource.title,
                "url": resource.url,
            }
            for resource, course in rows
        ]
    }


@router.post("/resources/{resource_id}/views", status_code=201)
def open_resource(
    resource_id: uuid.UUID, request: Request, db: DB, user: Principal
) -> dict[str, Any]:
    lock_actor(db, request, user)
    if _own_role(user) != "student":
        raise HTTPException(403, "student_role_required")
    resource = db.get(CourseResource, str(resource_id))
    if not resource or resource.kind != "learningResource" or not resource.url:
        raise HTTPException(404, "document_not_found")
    course_for(db, uuid.UUID(resource.course_id), user)
    fingerprint = hashlib.sha256(f"{resource.course_id}:{resource.url}".encode()).hexdigest()
    ticket = QuestResourceView(
        user_id=user.id,
        course_id=resource.course_id,
        resource_id=resource.id,
        resource_key=fingerprint,
    )
    db.add(ticket)
    db.flush()
    audit(
        db, request, "quest_document_opened", user, {"viewId": ticket.id, "resourceId": resource.id}
    )
    return {
        "id": ticket.id,
        "url": resource.url,
        "title": resource.title,
        "openedAt": utc(ticket.opened_at).isoformat(),
        "minimumSeconds": 30,
    }


@router.post("/resource-views/{view_id}/finish")
def finish_resource(
    view_id: uuid.UUID, request: Request, db: DB, user: Principal
) -> dict[str, Any]:
    lock_actor(db, request, user)
    ticket = db.get(QuestResourceView, str(view_id))
    if not ticket or ticket.user_id != user.id or _own_role(user) != "student":
        raise HTTPException(404, "document_view_not_found")
    course_for(db, uuid.UUID(ticket.course_id), user)
    seconds = (utc(now()) - utc(ticket.opened_at)).total_seconds()
    if seconds < 30:
        raise HTTPException(409, "document_minimum_30_seconds")
    if not ticket.completed_at:
        earned = record_quest_event(
            db,
            user,
            "resource.viewed",
            f"document:{ticket.resource_key}",
            {
                "entity_id": ticket.resource_key,
                "course_id": ticket.course_id,
                "duration_seconds": seconds,
                "resource_exists": True,
            },
        )
        ticket.completed_at = now()
        audit(
            db,
            request,
            "quest_document_view_verified",
            user,
            {
                "viewId": ticket.id,
                "resourceId": ticket.resource_id,
                "seconds": seconds,
                "newCompletion": bool(earned),
            },
        )
    return {"status": "complete"}


@router.get("/manage")
def manage(db: DB, user: Principal) -> dict[str, Any]:
    if not _can_manage(user, "student"):
        raise HTTPException(403, "forbidden")
    items = db.scalars(
        select(QuestDefinition).order_by(QuestDefinition.target_role, QuestDefinition.quest_code)
    )
    return {
        "items": [_definition_json(item) for item in items if _can_manage(user, item.target_role)]
    }


class QuestEdit(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    questName: str | None = Field(default=None, min_length=1, max_length=240)
    category: str | None = Field(default=None, min_length=1, max_length=100)
    conditionDesc: str | None = Field(default=None, min_length=1, max_length=3000)
    rewardExp: int | None = Field(default=None, ge=0, le=2_000_000_000)
    rewardCoin: int | None = Field(default=None, ge=0, le=2_000_000_000)
    active: bool | None = None
    revision: int | None = Field(default=None, ge=1)


@router.patch("/manage/{quest_code}")
def edit(
    quest_code: str, body: QuestEdit, request: Request, db: DB, user: Principal
) -> dict[str, Any]:
    lock_actor(db, request, user)
    item = db.get(QuestDefinition, quest_code)
    if item is None:
        raise HTTPException(404, "quest_not_found")
    if not _can_manage(user, item.target_role):
        raise HTTPException(403, "forbidden")
    if body.revision is not None and body.revision != item.revision:
        raise HTTPException(409, "stale_quest_revision")
    fields = {
        "questName": "quest_name",
        "category": "category",
        "conditionDesc": "condition_desc",
        "rewardExp": "reward_exp",
        "rewardCoin": "reward_coin",
        "active": "active",
    }
    for key, value in body.model_dump(exclude_unset=True).items():
        if key in fields and value is not None:
            setattr(item, fields[key], value)
    item.revision += 1
    item.updated_at = now()
    audit(
        db,
        request,
        "quest_definition_updated",
        user,
        {
            "questCode": quest_code,
            "revision": item.revision,
            "changes": body.model_dump(exclude_unset=True),
        },
    )
    return _definition_json(item)


class EvidenceDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    questCode: str = Field(max_length=64)
    entityId: str = Field(min_length=1, max_length=160)
    courseId: str | None = Field(default=None, max_length=36)
    evidenceUrl: str = Field(min_length=10, max_length=2000)
    description: str = Field(min_length=30, max_length=4000)


class EvidenceReview(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    decision: Literal["approved", "rejected"]
    reviewNote: str = Field(min_length=30, max_length=4000)
    verifiedData: dict[str, Any] = Field(default_factory=dict[str, Any])


def _evidence_json(item: QuestEvidence) -> dict[str, Any]:
    return {
        "id": item.id,
        "userId": item.user_id,
        "questCode": item.quest_code,
        "courseId": item.course_id,
        "entityId": item.entity_id,
        "evidenceUrl": item.evidence_url,
        "description": item.description,
        "status": item.status,
        "reviewNote": item.review_note,
        "verifiedData": item.verified_data,
        "reviewerId": item.reviewer_id,
        "createdAt": utc(item.created_at).isoformat(),
    }


@router.post("/evidence", status_code=201)
def submit_evidence(
    body: EvidenceDraft, request: Request, db: DB, user: Principal
) -> dict[str, Any]:
    lock_actor(db, request, user)
    definition = db.get(QuestDefinition, body.questCode)
    if not definition or definition.target_role != _own_role(user) or not definition.active:
        raise HTTPException(404, "quest_not_found")
    if body.questCode not in REVIEW_REQUIRED:
        raise HTTPException(422, "trusted_activity_required")
    parsed = urlsplit(body.evidenceUrl)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise HTTPException(422, "https_evidence_required")
    if body.courseId:
        try:
            course_for(db, uuid.UUID(body.courseId), user)
        except ValueError:
            raise HTTPException(422, "invalid_course_id") from None
    duplicate = db.scalar(
        select(QuestEvidence).where(
            QuestEvidence.user_id == user.id,
            QuestEvidence.quest_code == body.questCode,
            QuestEvidence.entity_id == body.entityId,
            QuestEvidence.status == "pending",
        )
    )
    if duplicate:
        return _evidence_json(duplicate)
    approved = db.scalar(
        select(QuestEvidence.id).where(
            QuestEvidence.user_id == user.id,
            QuestEvidence.quest_code == body.questCode,
            QuestEvidence.entity_id == body.entityId,
            QuestEvidence.course_id == body.courseId,
            QuestEvidence.status == "approved",
        )
    )
    if approved:
        raise HTTPException(409, "evidence_entity_already_approved")
    item = QuestEvidence(
        user_id=user.id,
        quest_code=body.questCode,
        entity_id=body.entityId,
        course_id=body.courseId,
        evidence_url=body.evidenceUrl,
        description=body.description,
    )
    db.add(item)
    db.flush()
    audit(
        db,
        request,
        "quest_evidence_submitted",
        user,
        {"evidenceId": item.id, "questCode": item.quest_code, "evidenceUrl": item.evidence_url},
    )
    return _evidence_json(item)


@router.get("/evidence")
def evidence_list(db: DB, user: Principal, review: bool = False) -> dict[str, Any]:
    records = list(
        db.scalars(select(QuestEvidence).order_by(QuestEvidence.created_at.desc()).limit(500))
    )
    output = []
    for item in records:
        definition = db.get(QuestDefinition, item.quest_code)
        if definition is None:
            continue
        if review:
            if item.user_id == user.id or not _can_manage(user, definition.target_role):
                continue
            if "admin" not in user.roles:
                course = db.get(Course, item.course_id) if item.course_id else None
                if course is None or "grading.manage" not in permissions(db, course, user):
                    continue
        elif item.user_id != user.id:
            continue
        output.append(_evidence_json(item))
    return {"items": output}


@router.post("/evidence/{evidence_id}/review")
def review_evidence(
    evidence_id: str, body: EvidenceReview, request: Request, db: DB, user: Principal
) -> dict[str, Any]:
    lock_actor(db, request, user)
    item = db.get(QuestEvidence, evidence_id)
    if not item:
        raise HTTPException(404, "evidence_not_found")
    definition = db.get(QuestDefinition, item.quest_code)
    if definition is None:
        raise HTTPException(404, "quest_not_found")
    if user.id == item.user_id or not _can_manage(user, definition.target_role):
        raise HTTPException(403, "independent_authorized_reviewer_required")
    if "admin" not in user.roles:
        course = db.get(Course, item.course_id) if item.course_id else None
        if not course or "grading.manage" not in permissions(db, course, user):
            raise HTTPException(403, "course_reviewer_required")
    if item.status != "pending":
        raise HTTPException(409, "evidence_already_reviewed")
    learner = db.get(User, item.user_id)
    if learner is None:
        raise HTTPException(404, "beneficiary_not_found")
    data = {
        **body.verifiedData,
        "entity_id": item.entity_id,
        "course_id": item.course_id or body.verifiedData.get("course_id"),
    }
    if body.decision == "approved":
        if item.quest_code == "LEC_TOP_RATING":
            course = db.get(Course, item.course_id) if item.course_id else None
            term = db.get(AcademicTerm, course.term_id) if course else None
            if (
                not course
                or not term
                or course.status not in {"completed", "archived"}
                or course.status == "archived"
                and course.archived_from != "completed"
                or utc(term.ends_at) > utc(now())
            ):
                raise HTTPException(422, "course_and_term_must_have_ended")
            data.update({"term_id": term.id, "term_ended": True, "course_id": course.id})
        if (
            definition.target_role != _own_role(learner)
            or not definition.active
            or not satisfies(item.quest_code, learner, data)
        ):
            raise HTTPException(422, "verified_evidence_does_not_meet_condition")
        source = hashlib.sha256(
            f"{CODE_EVENT[item.quest_code]}:{item.course_id or ''}:{item.entity_id}".encode()
        ).hexdigest()
        record_quest_event(db, learner, CODE_EVENT[item.quest_code], f"evidence:{source}", data)
    item.status = body.decision
    item.review_note = body.reviewNote
    item.verified_data = data
    item.reviewer_id = user.id
    item.reviewed_at = now()
    audit(
        db,
        request,
        "quest_evidence_reviewed",
        user,
        {
            "evidenceId": item.id,
            "questCode": item.quest_code,
            "beneficiaryId": item.user_id,
            "decision": item.status,
            "reviewNote": item.review_note,
            "verifiedData": data,
        },
    )
    return _evidence_json(item)
