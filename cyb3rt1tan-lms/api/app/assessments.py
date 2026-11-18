"""Course scoped assignment/exam authoring and immutable publication snapshots."""

import json
import math
import uuid
from collections.abc import Iterator
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, HTTPException, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .assessment_dto import AssessmentDraft, AttemptAnswers, GradeDraft, TagSelection
from .auth import DB, Principal, audit
from .course_access import course_for, instant, lock_actor, permissions
from .models import (
    Assessment,
    AssessmentAttempt,
    AssessmentGradeRelease,
    AssessmentGradeRevision,
    AssessmentRecipient,
    AssessmentVersion,
    Course,
    CourseMembership,
    Question,
    QuestionVersion,
    QuestionVersionTag,
    TaxonomyTag,
    User,
    now,
)
from .practice import _score as score_objective
from .practice import _validate_answer as validate_objective
from .security import utc

router = APIRouter(prefix="/v1")


def _zone(value: str) -> ZoneInfo:
    try:
        return ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(422, "invalid_timezone") from None


def _json(assessment: Assessment, version: AssessmentVersion | None) -> dict[str, object]:
    return {
        "id": assessment.id,
        "courseId": assessment.course_id,
        "kind": assessment.kind,
        "status": assessment.status,
        "version": assessment.current_version,
        "draft": None
        if version is None
        else {
            "id": version.id,
            "title": version.title,
            "instructions": version.instructions,
            "timezone": version.timezone,
            "opensAt": version.opens_at.isoformat() if version.opens_at else None,
            "closesAt": version.closes_at.isoformat() if version.closes_at else None,
            "durationMinutes": version.duration_minutes,
            "attemptLimit": version.attempt_limit,
            "latePenaltyTiers": version.late_penalty,
            "questionItems": version.question_items,
            "selection": version.selection_criteria or {"mode": "manual"},
            "totalPoints": _total_points(version.question_items),
            "status": version.status,
        },
    }


def _published_json(assessment: Assessment, version: AssessmentVersion) -> dict[str, object]:
    return {
        "id": assessment.id,
        "courseId": assessment.course_id,
        "kind": assessment.kind,
        "status": "published",
        "version": version.version,
        "title": version.title,
        "instructions": version.instructions,
        "timezone": version.timezone,
        "opensAt": version.opens_at.isoformat() if version.opens_at else None,
        "closesAt": version.closes_at.isoformat() if version.closes_at else None,
        "durationMinutes": version.duration_minutes,
        "attemptLimit": version.attempt_limit,
        "latePenaltyTiers": version.late_penalty,
        "questionItems": version.question_items,
        "questionCount": len(version.question_items),
        "totalPoints": _total_points(version.question_items),
    }


def _published_list_json(assessment: Assessment, version: AssessmentVersion) -> dict[str, object]:
    return {
        "id": assessment.id,
        "courseId": assessment.course_id,
        "kind": assessment.kind,
        "status": "published",
        "version": version.version,
        "title": version.title,
        "instructions": version.instructions,
        "timezone": version.timezone,
        "opensAt": version.opens_at.isoformat() if version.opens_at else None,
        "closesAt": version.closes_at.isoformat() if version.closes_at else None,
        "durationMinutes": version.duration_minutes,
        "attemptLimit": version.attempt_limit,
        "latePenaltyTiers": version.late_penalty,
        "questionCount": len(version.question_items),
        "totalPoints": _total_points(version.question_items),
    }


def _total_points(items: list[dict[str, object]]) -> float:
    values = [row.get("points", 0) for row in items]
    return sum(float(value) for value in values if isinstance(value, (int, float)))


def _question_points(question: QuestionVersion) -> float:
    config = question.authoring_config or {}
    if question.question_type == "writing":
        rubric = config.get("rubric")
        if isinstance(rubric, dict) and isinstance(rubric.get("maximumPoints"), (int, float)):
            return float(rubric["maximumPoints"])
    if question.question_type == "fillInTheBlank":
        blanks = config.get("blanks")
        if isinstance(blanks, list):
            return sum(float(row.get("points", 0)) for row in blanks if isinstance(row, dict))
    if question.question_type == "matching":
        pairs = config.get("pairs")
        if isinstance(pairs, list):
            return sum(float(row.get("points", 0)) for row in pairs if isinstance(row, dict))
    if question.question_type in {"readingSet", "listeningSet"}:
        children = config.get("children")
        if isinstance(children, list):
            return sum(float(row.get("points", 0)) for row in children if isinstance(row, dict))
    scoring = config.get("scoring")
    if isinstance(scoring, dict) and isinstance(scoring.get("maximumPoints"), (int, float)):
        return float(scoring["maximumPoints"])
    return 1.0


def _selection_tags(db: Session, selection: TagSelection) -> dict[str, TaxonomyTag]:
    tags = list(
        db.scalars(
            select(TaxonomyTag)
            .where(TaxonomyTag.scope == "question", TaxonomyTag.id.in_(selection.tagIds))
            .with_for_update()
        )
    )
    supported_types = {
        "writing",
        "sentenceRewriting",
        "multipleChoice",
        "multipleSelect",
        "shortAnswer",
        "fillInTheBlank",
        "matching",
        "ordering",
        "trueFalseNotGiven",
        "readingSet",
        "listeningSet",
    }
    if len(tags) != len(selection.tagIds) or any(
        tag.status != "active"
        or not tag.selectable
        or (tag.applicability and not supported_types.intersection(tag.applicability))
        for tag in tags
    ):
        raise HTTPException(422, "assessment_filter_tag_not_applicable")
    return {tag.id: tag for tag in tags}


def _resolve_selection(db: Session, assessment: Assessment, selection: TagSelection) -> list[str]:
    tags = _selection_tags(db, selection)
    versions = db.scalars(
        select(QuestionVersion)
        .join(Question, Question.id == QuestionVersion.question_id)
        .where(
            Question.course_id == assessment.course_id,
            Question.status == "active",
            QuestionVersion.status == "published",
        )
        .order_by(Question.id, QuestionVersion.version.desc())
        .with_for_update()
    )
    required_use = "practical" if assessment.kind == "assignment" else "exam"
    seen: set[str] = set()
    result = []
    for version in versions:
        if version.question_id in seen:
            continue
        seen.add(version.question_id)
        if version.question_type == "code" or required_use not in version.usage_types:
            continue
        direct_tags = set(
            db.scalars(
                select(QuestionVersionTag.tag_id).where(
                    QuestionVersionTag.question_version_id == version.id,
                    QuestionVersionTag.tag_scope == "question",
                    QuestionVersionTag.tag_id.in_(selection.tagIds),
                )
            )
        )
        applicable_matches = {
            tag_id
            for tag_id in direct_tags
            if not tags[tag_id].applicability or version.question_type in tags[tag_id].applicability
        }
        if (selection.match == "any" and applicable_matches) or (
            selection.match == "all" and applicable_matches == set(selection.tagIds)
        ):
            result.append(version.id)
    if not result:
        raise HTTPException(422, "assessment_filter_no_matches")
    if len(result) > 100:
        raise HTTPException(422, "assessment_filter_too_many_matches")
    return result


def _snapshot_questions(
    db: Session, assessment: Assessment, ids: list[str]
) -> list[dict[str, object]]:
    questions = list(db.scalars(select(QuestionVersion).where(QuestionVersion.id.in_(ids))))
    by_id = {item.id: item for item in questions}
    if len(by_id) != len(ids):
        raise HTTPException(422, "question_version_not_found")
    items: list[dict[str, object]] = []
    required_use = "practical" if assessment.kind == "assignment" else "exam"
    for question_id in ids:
        question = by_id[question_id]
        parent = db.get(Assessment, assessment.id)
        course_id = parent.course_id if parent else assessment.course_id
        if (
            question.status != "published"
            or required_use not in question.usage_types
            or question.question_type == "code"
        ):
            raise HTTPException(422, "question_not_eligible_for_assessment")
        question_parent = db.get(Question, question.question_id)
        if question_parent is None or question_parent.course_id != course_id:
            raise HTTPException(422, "question_course_mismatch")
        points = _question_points(question)
        if points <= 0:
            raise HTTPException(422, "question_has_no_positive_points")
        snapshot: dict[str, object] = {
            "position": len(items) + 1,
            "questionId": question.question_id,
            "questionVersionId": question.id,
            "questionType": question.question_type,
            "title": question.title,
            "prompt": question.prompt,
            "content": question.content,
            "points": points,
        }
        if question.question_type in {"readingSet", "listeningSet"}:
            child_ids = question.content.get("childQuestionVersionIds", [])
            child_config = (
                question.authoring_config.get("children", []) if question.authoring_config else []
            )
            if (
                not isinstance(child_ids, list)
                or not isinstance(child_config, list)
                or len(child_ids) != len(child_config)
            ):
                raise HTTPException(422, "assessment_set_children_invalid")
            child_versions = list(
                db.scalars(select(QuestionVersion).where(QuestionVersion.id.in_(child_ids)))
            )
            children_by_id = {child.id: child for child in child_versions}
            if len(children_by_id) != len(child_ids):
                raise HTTPException(422, "assessment_set_child_not_found")
            children: list[dict[str, object]] = []
            for child_id, child_settings in zip(child_ids, child_config, strict=True):
                child = children_by_id[str(child_id)]
                child_question = db.get(Question, child.question_id)
                if (
                    child.status != "published"
                    or child.question_type in {"code", "readingSet", "listeningSet"}
                    or required_use not in child.usage_types
                    or child_question is None
                    or child_question.course_id != course_id
                ):
                    raise HTTPException(422, "assessment_set_child_not_eligible")
                child_points = (
                    child_settings.get("points") if isinstance(child_settings, dict) else None
                )
                if not isinstance(child_points, (int, float)) or child_points <= 0:
                    raise HTTPException(422, "assessment_set_child_points_invalid")
                children.append(
                    {
                        "questionVersionId": child.id,
                        "questionType": child.question_type,
                        "title": child.title,
                        "prompt": child.prompt,
                        "content": child.content,
                        "points": float(child_points),
                    }
                )
            snapshot["childQuestions"] = children
        items.append(snapshot)
    return items


def _make_version(
    db: Session, assessment: Assessment, body: AssessmentDraft, actor_id: str
) -> AssessmentVersion:
    _zone(body.timezone)
    if (body.opensAt is None) != (body.closesAt is None):
        raise HTTPException(422, "schedule_requires_both_bounds")
    opens_at: datetime | None
    closes_at: datetime | None
    if body.opensAt is not None:
        if body.opensAt.tzinfo is None or body.closesAt is None or body.closesAt.tzinfo is None:
            raise HTTPException(422, "explicit_offset_required")
        opens_at = instant(body.opensAt, body.timezone)
        closes_at = instant(body.closesAt, body.timezone)
        if closes_at <= opens_at:
            raise HTTPException(422, "invalid_schedule")
    else:
        opens_at = None
        closes_at = None
    if isinstance(body.selection, TagSelection):
        _selection_tags(db, body.selection)
    ids = body.questionVersionIds
    items = _snapshot_questions(db, assessment, ids)
    return AssessmentVersion(
        assessment_id=assessment.id,
        version=assessment.current_version,
        title=body.title,
        instructions=body.instructions,
        timezone=body.timezone,
        opens_at=opens_at,
        closes_at=closes_at,
        duration_minutes=body.durationMinutes,
        attempt_limit=body.attemptLimit,
        late_penalty=[tier.model_dump() for tier in body.latePenaltyTiers],
        question_items=items,
        selection_criteria=body.selection.model_dump() if body.selection else None,
        status="draft",
        created_by=actor_id,
    )


@router.get("/courses/{course_id}/assessments")
def list_assessments(course_id: uuid.UUID, db: DB, user: Principal) -> dict[str, object]:
    course = course_for(db, course_id, user)
    items = list(
        db.scalars(
            select(Assessment)
            .where(Assessment.course_id == course.id)
            .order_by(Assessment.created_at.desc())
        )
    )
    result = []
    for item in items:
        if "assessment.manage" in permissions(db, course, user):
            version = db.scalar(
                select(AssessmentVersion).where(
                    AssessmentVersion.assessment_id == item.id,
                    AssessmentVersion.version == item.current_version,
                )
            )
            result.append(_json(item, version))
            continue
        if item.status != "published":
            continue
        version = db.scalar(
            select(AssessmentVersion)
            .where(
                AssessmentVersion.assessment_id == item.id, AssessmentVersion.status == "published"
            )
            .order_by(AssessmentVersion.version.desc())
            .limit(1)
        )
        if version is None:
            continue
        recipient_id = db.scalar(
            select(AssessmentRecipient.id).where(
                AssessmentRecipient.assessment_id == item.id,
                AssessmentRecipient.version_id == version.id,
                AssessmentRecipient.user_id == user.id,
            )
        )
        if recipient_id is not None:
            result.append(_published_list_json(item, version))
    return {"items": result}


@router.post("/courses/{course_id}/assessments", status_code=201)
def create_assessment(
    course_id: uuid.UUID,
    body: AssessmentDraft,
    request: Request,
    response: Response,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "assessment.manage", write=True)
    item = Assessment(
        course_id=course.id, kind=body.kind, status="draft", current_version=1, created_by=user.id
    )
    db.add(item)
    db.flush()
    version = _make_version(db, item, body, user.id)
    db.add(version)
    db.flush()
    response.headers["ETag"] = '"1"'
    audit(
        db,
        request,
        "assessment_draft_created",
        user,
        {"assessmentId": item.id, "kind": item.kind, "version": 1},
    )
    return _json(item, version)


@router.put("/courses/{course_id}/assessments/{assessment_id}")
def revise_assessment(
    course_id: uuid.UUID,
    assessment_id: uuid.UUID,
    body: AssessmentDraft,
    request: Request,
    response: Response,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "assessment.manage", write=True)
    item = db.get(Assessment, str(assessment_id), populate_existing=True)
    if item is None or item.course_id != course.id:
        raise HTTPException(404, "assessment_not_found")
    if item.kind != body.kind:
        raise HTTPException(409, "assessment_kind_immutable")
    if request.headers.get("if-match") != f'"{item.current_version}"':
        raise HTTPException(409, "stale_assessment_version")
    current = db.scalar(
        select(AssessmentVersion).where(
            AssessmentVersion.assessment_id == item.id,
            AssessmentVersion.version == item.current_version,
        )
    )
    if current is None:
        raise HTTPException(409, "assessment_version_missing")
    next_version = _make_version(db, item, body, user.id)
    if current.status == "published":
        item.current_version += 1
        next_version.version = item.current_version
        db.add(next_version)
    elif current.status == "draft":
        current.title = next_version.title
        current.instructions = next_version.instructions
        current.timezone = next_version.timezone
        current.opens_at = next_version.opens_at
        current.closes_at = next_version.closes_at
        current.duration_minutes = next_version.duration_minutes
        current.attempt_limit = next_version.attempt_limit
        current.late_penalty = next_version.late_penalty
        current.question_items = next_version.question_items
        current.selection_criteria = next_version.selection_criteria
        next_version = current
    else:
        raise HTTPException(409, "assessment_version_not_editable")
    db.flush()
    response.headers["ETag"] = f'"{item.current_version}"'
    audit(
        db,
        request,
        "assessment_draft_revised",
        user,
        {"assessmentId": item.id, "version": item.current_version},
    )
    return _json(item, next_version)


@router.post("/courses/{course_id}/assessments/{assessment_id}/publish", status_code=202)
def publish_assessment(
    course_id: uuid.UUID,
    assessment_id: uuid.UUID,
    request: Request,
    response: Response,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "assessment.manage", write=True)
    item = db.get(Assessment, str(assessment_id), populate_existing=True)
    if item is None or item.course_id != course.id:
        raise HTTPException(404, "assessment_not_found")
    version = db.scalar(
        select(AssessmentVersion).where(
            AssessmentVersion.assessment_id == item.id,
            AssessmentVersion.version == item.current_version,
        )
    )
    if version is None or version.status != "draft":
        raise HTTPException(409, "valid_assessment_draft_required")
    if version.selection_criteria and version.selection_criteria.get("mode") == "tags":
        selection = TagSelection.model_validate(version.selection_criteria)
        ids = _resolve_selection(db, item, selection)
        version.question_items = _snapshot_questions(db, item, ids)
    if not version.question_items:
        raise HTTPException(409, "valid_assessment_draft_required")
    version.status = "published"
    item.status = "published"
    for membership in db.scalars(
        select(CourseMembership).where(
            CourseMembership.course_id == course.id,
            CourseMembership.status == "active",
        )
    ):
        target = db.get(User, membership.user_id)
        if target is None or target.status != "active" or "student" not in target.roles:
            continue
        recipient = db.scalar(
            select(AssessmentRecipient).where(
                AssessmentRecipient.version_id == version.id,
                AssessmentRecipient.user_id == target.id,
            )
        )
        if recipient is None:
            db.add(
                AssessmentRecipient(
                    assessment_id=item.id,
                    version_id=version.id,
                    user_id=target.id,
                    status="pending",
                )
            )
    audit(
        db,
        request,
        "assessment_published",
        user,
        {"assessmentId": item.id, "version": version.version},
    )
    response.headers["ETag"] = f'"{item.current_version}"'
    return _json(item, version)


def _attempt_json(
    attempt: AssessmentAttempt, assessment: Assessment, version: AssessmentVersion
) -> dict[str, object]:
    return {
        "attemptId": attempt.id,
        "attemptNumber": attempt.attempt_number,
        "status": attempt.status,
        "revision": attempt.revision,
        "startedAt": utc(attempt.started_at).isoformat(),
        "deadline": utc(attempt.deadline).isoformat() if attempt.deadline else None,
        "submittedAt": utc(attempt.submitted_at).isoformat() if attempt.submitted_at else None,
        "answers": attempt.answers,
        "assessment": _published_json(assessment, version),
    }


def _automatic_scores(
    db: Session,
    items: list[dict[str, object]],
    answers: dict[str, object],
) -> dict[str, object]:
    result: dict[str, object] = {}
    for item in items:
        question_id = str(item.get("questionVersionId", ""))
        children = item.get("childQuestions")
        if isinstance(children, list):
            parent_answer = answers.get(question_id)
            nested_answers = parent_answer if isinstance(parent_answer, dict) else {}
            result.update(
                _automatic_scores(
                    db,
                    [child for child in children if isinstance(child, dict)],
                    nested_answers,
                )
            )
            continue
        if item.get("questionType") == "writing":
            continue
        question = db.get(QuestionVersion, question_id)
        maximum = item.get("points")
        if question is None or not isinstance(maximum, (int, float)):
            continue
        answer = answers.get(question_id)
        try:
            validate_objective(question, answer)
            raw_score, raw_maximum = score_objective(question, answer)
        except HTTPException:
            raw_score, raw_maximum = 0.0, 1.0
        score = max(0.0, min(float(maximum), float(maximum) * raw_score / max(raw_maximum, 1e-12)))
        result[question_id] = {"score": score, "maxPoints": float(maximum)}
    return result


def _submit_expired(attempt: AssessmentAttempt, recipient: AssessmentRecipient) -> bool:
    if attempt.status != "inProgress" or attempt.deadline is None or utc(attempt.deadline) > now():
        return False
    attempt.status = "forceSubmitted"
    attempt.submitted_at = attempt.deadline
    attempt.revision += 1
    recipient.status = "submitted"
    return True


@router.post("/courses/{course_id}/assessments/{assessment_id}/attempts")
def start_attempt(
    course_id: uuid.UUID,
    assessment_id: uuid.UUID,
    request: Request,
    response: Response,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user)
    if "student" not in user.roles:
        raise HTTPException(403, "student_role_required")
    membership = db.get(CourseMembership, (course.id, user.id))
    if membership is None or membership.status != "active":
        raise HTTPException(404, "assessment_not_found")
    item = db.get(Assessment, str(assessment_id))
    if item is None or item.course_id != course.id or item.status != "published":
        raise HTTPException(404, "assessment_not_found")
    version = db.scalar(
        select(AssessmentVersion)
        .where(
            AssessmentVersion.assessment_id == item.id,
            AssessmentVersion.status == "published",
        )
        .order_by(AssessmentVersion.version.desc())
        .limit(1)
    )
    if version is None:
        raise HTTPException(404, "assessment_not_found")
    recipient = db.scalar(
        select(AssessmentRecipient)
        .where(
            AssessmentRecipient.version_id == version.id,
            AssessmentRecipient.user_id == user.id,
        )
        .with_for_update()
    )
    if recipient is None:
        raise HTTPException(404, "assessment_not_found")
    current_time = now()
    if version.opens_at is not None and utc(version.opens_at) > current_time:
        raise HTTPException(409, "assessment_not_open")
    if (
        item.kind == "exam"
        and version.closes_at is not None
        and utc(version.closes_at) <= current_time
    ):
        raise HTTPException(409, "assessment_closed")
    attempts = list(
        db.scalars(
            select(AssessmentAttempt)
            .where(
                AssessmentAttempt.recipient_id == recipient.id,
            )
            .order_by(AssessmentAttempt.attempt_number.desc())
            .with_for_update()
        )
    )
    expired_attempt: AssessmentAttempt | None = None
    for prior in attempts:
        if _submit_expired(prior, recipient):
            expired_attempt = prior
            prior.automatic_scores = _automatic_scores(db, version.question_items, prior.answers)
            audit(
                db,
                request,
                "assessment_attempt_auto_submitted",
                user,
                {
                    "assessmentId": item.id,
                    "attemptId": prior.id,
                    "reason": "deadline_elapsed",
                },
            )
        if prior.status == "inProgress":
            response.headers["ETag"] = f'"{prior.revision}"'
            return _attempt_json(prior, item, version)
    if len(attempts) >= version.attempt_limit:
        if expired_attempt is not None:
            response.headers["ETag"] = f'"{expired_attempt.revision}"'
            return _attempt_json(expired_attempt, item, version)
        raise HTTPException(409, "assessment_attempt_limit_reached")
    started = now()
    deadlines = [
        value
        for value in (
            version.closes_at if item.kind == "exam" else None,
            started + timedelta(minutes=version.duration_minutes)
            if version.duration_minutes
            else None,
        )
        if value is not None
    ]
    attempt = AssessmentAttempt(
        recipient_id=recipient.id,
        attempt_number=len(attempts) + 1,
        status="inProgress",
        answers={},
        started_at=started,
        deadline=min((utc(value) for value in deadlines), default=None),
        revision=1,
    )
    recipient.status = "inProgress"
    db.add(attempt)
    db.flush()
    audit(
        db,
        request,
        "assessment_attempt_started",
        user,
        {
            "assessmentId": item.id,
            "attemptId": attempt.id,
            "attemptNumber": attempt.attempt_number,
        },
    )
    response.status_code = 201
    response.headers["ETag"] = '"1"'
    return _attempt_json(attempt, item, version)


@router.put("/courses/{course_id}/assessments/{assessment_id}/attempts/{attempt_id}/answers")
def save_attempt_answers(
    course_id: uuid.UUID,
    assessment_id: uuid.UUID,
    attempt_id: uuid.UUID,
    body: AttemptAnswers,
    request: Request,
    response: Response,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user)
    attempt = db.scalar(
        select(AssessmentAttempt).where(AssessmentAttempt.id == str(attempt_id)).with_for_update()
    )
    recipient = db.get(AssessmentRecipient, attempt.recipient_id) if attempt else None
    item = db.get(Assessment, recipient.assessment_id) if recipient else None
    version = db.get(AssessmentVersion, recipient.version_id) if recipient else None
    if (
        attempt is None
        or recipient is None
        or item is None
        or version is None
        or item.id != str(assessment_id)
        or item.course_id != course.id
        or recipient.user_id != user.id
    ):
        raise HTTPException(404, "attempt_not_found")
    if _submit_expired(attempt, recipient):
        attempt.automatic_scores = _automatic_scores(db, version.question_items, attempt.answers)
        audit(
            db,
            request,
            "assessment_attempt_auto_submitted",
            user,
            {
                "assessmentId": item.id,
                "attemptId": attempt.id,
                "reason": "deadline_elapsed",
            },
        )
        response.headers["ETag"] = f'"{attempt.revision}"'
        return _attempt_json(attempt, item, version)
    if attempt.status != "inProgress":
        raise HTTPException(409, "attempt_not_editable")
    if request.headers.get("if-match") != f'"{attempt.revision}"':
        raise HTTPException(409, "stale_attempt_revision")
    question_ids = {str(question.get("questionVersionId")) for question in version.question_items}
    if not set(body.answers).issubset(question_ids):
        raise HTTPException(422, "answer_question_not_in_attempt")
    try:
        encoded = json.dumps(body.answers, ensure_ascii=False, separators=(",", ":")).encode(
            "utf-8"
        )
        answer_sizes = [
            len(json.dumps(value, ensure_ascii=False).encode("utf-8"))
            for value in body.answers.values()
        ]
    except (TypeError, ValueError):
        raise HTTPException(422, "invalid_answer_payload") from None
    if len(encoded) > 100_000 or any(size > 16_000 for size in answer_sizes):
        raise HTTPException(413, "answer_payload_too_large")
    attempt.answers = body.answers
    attempt.revision += 1
    response.headers["ETag"] = f'"{attempt.revision}"'
    return _attempt_json(attempt, item, version)


@router.post("/courses/{course_id}/assessments/{assessment_id}/attempts/{attempt_id}/submit")
def submit_attempt(
    course_id: uuid.UUID,
    assessment_id: uuid.UUID,
    attempt_id: uuid.UUID,
    request: Request,
    response: Response,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user)
    attempt = db.scalar(
        select(AssessmentAttempt).where(AssessmentAttempt.id == str(attempt_id)).with_for_update()
    )
    recipient = db.get(AssessmentRecipient, attempt.recipient_id) if attempt else None
    item = db.get(Assessment, recipient.assessment_id) if recipient else None
    version = db.get(AssessmentVersion, recipient.version_id) if recipient else None
    if (
        attempt is None
        or recipient is None
        or item is None
        or version is None
        or item.id != str(assessment_id)
        or item.course_id != course.id
        or recipient.user_id != user.id
    ):
        raise HTTPException(404, "attempt_not_found")
    if attempt.status == "inProgress":
        expired = _submit_expired(attempt, recipient)
        attempt.automatic_scores = _automatic_scores(db, version.question_items, attempt.answers)
        if not expired:
            if request.headers.get("if-match") != f'"{attempt.revision}"':
                raise HTTPException(409, "stale_attempt_revision")
            attempt.status = "submitted"
            attempt.submitted_at = now()
            attempt.revision += 1
            recipient.status = "submitted"
        audit(
            db,
            request,
            "assessment_attempt_auto_submitted" if expired else "assessment_attempt_submitted",
            user,
            {"assessmentId": item.id, "attemptId": attempt.id, "status": attempt.status},
        )
        if attempt.status == "submitted":
            from .missions import record_domain_event

            record_domain_event(db, request, user, "assessment.submitted", attempt.id)
    response.headers["ETag"] = f'"{attempt.revision}"'
    return _attempt_json(attempt, item, version)


def _grade_context(
    db: Session, course_id: uuid.UUID, attempt_id: uuid.UUID, user: User
) -> tuple[Course, AssessmentAttempt, AssessmentRecipient, Assessment, AssessmentVersion]:
    course = course_for(db, course_id, user, "grading.manage")
    attempt = db.get(AssessmentAttempt, str(attempt_id), populate_existing=True)
    recipient = db.get(AssessmentRecipient, attempt.recipient_id) if attempt else None
    assessment = db.get(Assessment, recipient.assessment_id) if recipient else None
    version = db.get(AssessmentVersion, recipient.version_id) if recipient else None
    if (
        attempt is None
        or recipient is None
        or assessment is None
        or version is None
        or assessment.course_id != course.id
    ):
        raise HTTPException(404, "assessment_attempt_not_found")
    return course, attempt, recipient, assessment, version


def _leaf_questions(
    items: list[dict[str, object]], answers: dict[str, object]
) -> Iterator[tuple[dict[str, object], object]]:
    for item in items:
        question_id = str(item.get("questionVersionId", ""))
        children = item.get("childQuestions")
        if isinstance(children, list):
            parent_answer = answers.get(question_id)
            nested = parent_answer if isinstance(parent_answer, dict) else {}
            yield from _leaf_questions(
                [child for child in children if isinstance(child, dict)], nested
            )
        else:
            yield item, answers.get(question_id)


@router.get("/courses/{course_id}/grading/attempts")
def grading_queue(
    course_id: uuid.UUID,
    db: DB,
    user: Principal,
    status: str = Query(default="submitted", pattern="^(submitted|all)$"),
    page: int = Query(default=1, ge=1, le=10000),
    pageSize: int = Query(default=20, ge=1, le=100),
) -> dict[str, object]:
    course = course_for(db, course_id, user, "grading.manage")
    statement = (
        select(AssessmentAttempt, AssessmentRecipient, Assessment)
        .join(AssessmentRecipient, AssessmentRecipient.id == AssessmentAttempt.recipient_id)
        .join(Assessment, Assessment.id == AssessmentRecipient.assessment_id)
        .where(Assessment.course_id == course.id)
    )
    if status == "submitted":
        statement = statement.where(AssessmentAttempt.status.in_(["submitted", "forceSubmitted"]))
    rows = list(
        db.execute(
            statement.order_by(AssessmentAttempt.submitted_at.desc(), AssessmentAttempt.id)
            .offset((page - 1) * pageSize)
            .limit(pageSize + 1)
        )
    )
    has_more = len(rows) > pageSize
    result = []
    for attempt, recipient, assessment in rows[:pageSize]:
        learner = db.get(User, recipient.user_id)
        release = db.scalar(
            select(AssessmentGradeRelease)
            .where(
                AssessmentGradeRelease.attempt_id == attempt.id,
            )
            .order_by(AssessmentGradeRelease.revision.desc())
            .limit(1)
        )
        result.append(
            {
                "attemptId": attempt.id,
                "assessmentId": assessment.id,
                "assessmentKind": assessment.kind,
                "status": attempt.status,
                "attemptNumber": attempt.attempt_number,
                "submittedAt": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
                "learner": {"id": learner.id, "officialName": learner.official_name}
                if learner
                else None,
                "gradeReleased": release is not None,
            }
        )
    return {"items": result, "hasMore": has_more}


@router.get("/courses/{course_id}/grading/attempts/{attempt_id}")
def grading_detail(
    course_id: uuid.UUID, attempt_id: uuid.UUID, db: DB, user: Principal
) -> dict[str, object]:
    _, attempt, recipient, assessment, version = _grade_context(db, course_id, attempt_id, user)
    grades = {}
    for item, _answer in _leaf_questions(version.question_items, attempt.answers):
        question_id = str(item.get("questionVersionId", ""))
        latest_revision = db.scalar(
            select(func.max(AssessmentGradeRevision.revision)).where(
                AssessmentGradeRevision.attempt_id == attempt.id,
                AssessmentGradeRevision.question_version_id == question_id,
            )
        )
        if latest_revision is not None:
            grades[question_id] = db.scalar(
                select(AssessmentGradeRevision).where(
                    AssessmentGradeRevision.attempt_id == attempt.id,
                    AssessmentGradeRevision.question_version_id == question_id,
                    AssessmentGradeRevision.revision == latest_revision,
                )
            )
    answer_items = []
    for item, answer in _leaf_questions(version.question_items, attempt.answers):
        question_id = str(item.get("questionVersionId", ""))
        question = db.get(QuestionVersion, question_id)
        config = question.authoring_config if question else None
        rubric = config.get("rubric") if isinstance(config, dict) else None
        grade = grades.get(question_id)
        auto = attempt.automatic_scores.get(question_id)
        answer_items.append(
            {
                **item,
                "answer": answer,
                "rubric": rubric if isinstance(rubric, dict) else None,
                "automaticGrade": auto,
                "manualGrade": None
                if grade is None
                else {
                    "revision": grade.revision,
                    "pointsAwarded": grade.points_awarded,
                    "criterionScores": grade.criterion_scores,
                    "feedback": grade.feedback,
                    "createdAt": grade.created_at.isoformat(),
                },
            }
        )
    return {
        "attemptId": attempt.id,
        "assessmentId": assessment.id,
        "assessmentTitle": version.title,
        "attemptNumber": attempt.attempt_number,
        "status": attempt.status,
        "submittedAt": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        "learnerId": recipient.user_id,
        "automaticScores": attempt.automatic_scores,
        "items": answer_items,
    }


@router.put("/courses/{course_id}/grading/attempts/{attempt_id}/questions/{question_version_id}")
def grade_question(
    course_id: uuid.UUID,
    attempt_id: uuid.UUID,
    question_version_id: uuid.UUID,
    body: GradeDraft,
    request: Request,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    _, attempt, _recipient, assessment, version = _grade_context(db, course_id, attempt_id, user)
    if attempt.status not in {"submitted", "forceSubmitted"}:
        raise HTTPException(409, "attempt_not_submitted")
    item = next(
        (
            question
            for question, _answer in _leaf_questions(version.question_items, attempt.answers)
            if question.get("questionVersionId") == str(question_version_id)
        ),
        None,
    )
    if item is None:
        raise HTTPException(404, "question_not_in_attempt")
    if item.get("questionType") != "writing":
        raise HTTPException(422, "manual_grading_not_supported_for_question")
    maximum = item.get("points")
    if not isinstance(maximum, (int, float)) or body.pointsAwarded > maximum:
        raise HTTPException(422, "grade_exceeds_question_points")
    rubric = None
    pinned = db.get(QuestionVersion, str(question_version_id))
    config = pinned.authoring_config if pinned else None
    if isinstance(config, dict) and isinstance(config.get("rubric"), dict):
        rubric = config["rubric"]
    criteria = rubric.get("criteria", []) if isinstance(rubric, dict) else []
    criterion_scores = body.criterionScores
    if criteria:
        by_id = {
            criterion.get("criterionId"): criterion
            for criterion in criteria
            if isinstance(criterion, dict)
        }
        if set(criterion_scores) != set(by_id):
            raise HTTPException(422, "all_rubric_criteria_required")
        if any(
            score < 0 or score > by_id[key].get("points", 0)
            for key, score in criterion_scores.items()
        ):
            raise HTTPException(422, "rubric_score_out_of_range")
        if abs(sum(criterion_scores.values()) - body.pointsAwarded) > 1e-7:
            raise HTTPException(422, "rubric_total_mismatch")
    elif criterion_scores:
        raise HTTPException(422, "rubric_not_configured")
    revision = (
        db.scalar(
            select(func.max(AssessmentGradeRevision.revision)).where(
                AssessmentGradeRevision.attempt_id == attempt.id,
                AssessmentGradeRevision.question_version_id == str(question_version_id),
            )
        )
        or 0
    ) + 1
    grade = AssessmentGradeRevision(
        attempt_id=attempt.id,
        question_version_id=str(question_version_id),
        revision=revision,
        points_awarded=body.pointsAwarded,
        criterion_scores=criterion_scores,
        feedback=body.feedback,
        grader_id=user.id,
    )
    db.add(grade)
    db.flush()
    audit(
        db,
        request,
        "assessment_question_graded",
        user,
        {
            "assessmentId": assessment.id,
            "attemptId": attempt.id,
            "questionVersionId": str(question_version_id),
            "revision": revision,
            "pointsAwarded": body.pointsAwarded,
        },
    )
    return {
        "questionVersionId": str(question_version_id),
        "revision": revision,
        "pointsAwarded": body.pointsAwarded,
        "criterionScores": criterion_scores,
    }


@router.post("/courses/{course_id}/grading/attempts/{attempt_id}/release", status_code=201)
def release_grade(
    course_id: uuid.UUID,
    attempt_id: uuid.UUID,
    request: Request,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    _, attempt, _recipient, assessment, version = _grade_context(db, course_id, attempt_id, user)
    if attempt.status not in {"submitted", "forceSubmitted"}:
        raise HTTPException(409, "attempt_not_submitted")
    leaf_items = list(_leaf_questions(version.question_items, attempt.answers))
    manual_items = [item for item, _answer in leaf_items if item.get("questionType") == "writing"]
    grades: dict[str, AssessmentGradeRevision] = {}
    for item in manual_items:
        question_id = str(item.get("questionVersionId", ""))
        latest_revision = db.scalar(
            select(func.max(AssessmentGradeRevision.revision)).where(
                AssessmentGradeRevision.attempt_id == attempt.id,
                AssessmentGradeRevision.question_version_id == question_id,
            )
        )
        if latest_revision is None:
            raise HTTPException(409, "manual_grading_incomplete")
        grade = db.scalar(
            select(AssessmentGradeRevision).where(
                AssessmentGradeRevision.attempt_id == attempt.id,
                AssessmentGradeRevision.question_version_id == question_id,
                AssessmentGradeRevision.revision == latest_revision,
            )
        )
        if grade is None:
            raise HTTPException(409, "manual_grading_incomplete")
        grades[question_id] = grade
    breakdown: list[dict[str, object]] = []
    gross = 0.0
    maximum = 0.0
    for item, _answer in leaf_items:
        question_id = str(item.get("questionVersionId", ""))
        points = item.get("points", 0)
        max_points = float(points) if isinstance(points, (int, float)) else 0.0
        maximum += max_points
        if item.get("questionType") == "writing":
            grade = grades[question_id]
            score = grade.points_awarded
            breakdown.append(
                {
                    "questionVersionId": question_id,
                    "score": score,
                    "maxPoints": max_points,
                    "feedback": grade.feedback,
                    "criterionScores": grade.criterion_scores,
                }
            )
        else:
            automatic = attempt.automatic_scores.get(question_id)
            score_value = automatic.get("score", 0) if isinstance(automatic, dict) else 0
            score = float(score_value) if isinstance(score_value, (int, float)) else 0.0
            breakdown.append(
                {
                    "questionVersionId": question_id,
                    "score": score,
                    "maxPoints": max_points,
                    "feedback": "",
                }
            )
        gross += score
    if maximum <= 0:
        raise HTTPException(409, "assessment_max_points_invalid")
    penalty = 0.0
    if assessment.kind == "assignment" and version.closes_at and attempt.submitted_at:
        late_minutes = max(
            0, math.ceil((utc(attempt.submitted_at) - utc(version.closes_at)).total_seconds() / 60)
        )
        tier_rows = [
            (threshold, row)
            for row in version.late_penalty
            if isinstance((threshold := row.get("afterMinutes")), int)
        ]
        for threshold, tier in sorted(tier_rows, key=lambda row: row[0]):
            percent = tier.get("penaltyPercent")
            if isinstance(percent, (int, float)) and late_minutes >= threshold:
                penalty = float(percent)
    released_score = round(max(0.0, gross * (1 - penalty / 100)), 4)
    revision = (
        db.scalar(
            select(func.max(AssessmentGradeRelease.revision)).where(
                AssessmentGradeRelease.attempt_id == attempt.id
            )
        )
        or 0
    ) + 1
    release = AssessmentGradeRelease(
        attempt_id=attempt.id,
        revision=revision,
        gross_score=gross,
        penalty_percent=penalty,
        released_score=released_score,
        max_points=maximum,
        breakdown=breakdown,
        released_by=user.id,
    )
    db.add(release)
    db.flush()
    from .quests import record_grade_release

    record_grade_release(db, user, release)
    audit(
        db,
        request,
        "assessment_grade_released",
        user,
        {
            "assessmentId": assessment.id,
            "attemptId": attempt.id,
            "revision": revision,
            "score": released_score,
            "maxPoints": maximum,
            "penaltyPercent": penalty,
        },
    )
    return {
        "attemptId": attempt.id,
        "revision": revision,
        "grossScore": gross,
        "penaltyPercent": penalty,
        "releasedScore": released_score,
        "maxPoints": maximum,
    }


@router.get("/courses/{course_id}/released-grades")
def released_grades(course_id: uuid.UUID, db: DB, user: Principal) -> dict[str, object]:
    course = course_for(db, course_id, user)
    if "student" not in user.roles:
        raise HTTPException(403, "student_role_required")
    rows = db.execute(
        select(
            AssessmentGradeRelease,
            AssessmentAttempt,
            AssessmentRecipient,
            Assessment,
            AssessmentVersion,
        )
        .join(AssessmentAttempt, AssessmentAttempt.id == AssessmentGradeRelease.attempt_id)
        .join(AssessmentRecipient, AssessmentRecipient.id == AssessmentAttempt.recipient_id)
        .join(Assessment, Assessment.id == AssessmentRecipient.assessment_id)
        .join(AssessmentVersion, AssessmentVersion.id == AssessmentRecipient.version_id)
        .where(AssessmentRecipient.user_id == user.id, Assessment.course_id == course.id)
        .order_by(AssessmentGradeRelease.released_at.desc())
    )
    latest: dict[
        str,
        tuple[
            AssessmentGradeRelease,
            AssessmentAttempt,
            AssessmentRecipient,
            Assessment,
            AssessmentVersion,
        ],
    ] = {}
    for row in rows:
        release, attempt, recipient, assessment, version = row
        if attempt.id not in latest:
            latest[attempt.id] = (release, attempt, recipient, assessment, version)
    return {
        "items": [
            {
                "attemptId": attempt.id,
                "assessmentId": assessment.id,
                "title": version.title,
                "kind": assessment.kind,
                "revision": release.revision,
                "score": release.released_score,
                "grossScore": release.gross_score,
                "maxPoints": release.max_points,
                "penaltyPercent": release.penalty_percent,
                "breakdown": release.breakdown,
                "releasedAt": release.released_at.isoformat(),
            }
            for release, attempt, _recipient, assessment, version in latest.values()
        ]
    }
