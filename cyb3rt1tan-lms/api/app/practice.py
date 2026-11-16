"""Membership-gated objective practice with private server-side scoring."""

import json
import re
import uuid

from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import Text, func, select
from sqlalchemy.orm import Session

from .auth import DB, Principal, audit
from .course_access import course_for, lock_actor
from .models import CourseMembership, PracticeAttempt, Question, QuestionVersion, User

router = APIRouter(prefix="/v1")
PRACTICE_TYPES = frozenset({
    "multipleChoice", "multipleSelect", "shortAnswer", "sentenceRewriting",
    "fillInTheBlank", "matching", "ordering", "trueFalseNotGiven",
})


class PracticeSubmission(BaseModel):
    model_config = ConfigDict(extra="forbid")
    questionVersionId: uuid.UUID
    answer: object


def _object_list(value: object) -> list[dict[str, object]]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _string_list(value: object) -> list[str]:
    return [item for item in value if isinstance(item, str)] if isinstance(value, list) else []


def _normalize(value: object, modes: list[object]) -> str:
    result = str(value).strip()
    if "collapseWhitespace" in modes:
        result = " ".join(result.split())
    if "ignorePunctuation" in modes:
        result = re.sub(r"[^\w\s]", "", result)
    if "ignoreCase" in modes:
        result = result.casefold()
    return result


def _validate_answer(question: QuestionVersion, answer: object) -> None:
    content = question.content
    question_type = question.question_type
    if question_type in {"multipleChoice", "shortAnswer", "sentenceRewriting", "trueFalseNotGiven"}:
        if not isinstance(answer, str):
            raise HTTPException(422, "practice_answer_type_invalid")
        if question_type == "multipleChoice":
            allowed = {item.get("choiceId") for item in _object_list(content.get("choices"))}
            if answer not in allowed:
                raise HTTPException(422, "practice_choice_invalid")
        if question_type == "trueFalseNotGiven" and answer not in {"true", "false", "notGiven"}:
            raise HTTPException(422, "practice_answer_invalid")
        return
    if question_type == "multipleSelect":
        allowed = {item.get("choiceId") for item in _object_list(content.get("choices"))}
        if not isinstance(answer, list) or any(not isinstance(item, str) or item not in allowed for item in answer) or len(answer) != len(set(answer)):
            raise HTTPException(422, "practice_answer_invalid")
        return
    if question_type == "fillInTheBlank":
        blanks = _string_list(content.get("blankIds"))
        if not isinstance(answer, dict) or any(key not in blanks or not isinstance(value, str) for key, value in answer.items()):
            raise HTTPException(422, "practice_answer_invalid")
        return
    if question_type == "matching":
        left = {item.get("itemId") for item in _object_list(content.get("leftItems"))}
        right = {item.get("itemId") for item in _object_list(content.get("rightItems"))}
        if not isinstance(answer, dict) or any(key not in left or value not in right for key, value in answer.items()):
            raise HTTPException(422, "practice_answer_invalid")
        return
    if question_type == "ordering":
        allowed = {item.get("itemId") for item in _object_list(content.get("items"))}
        if not isinstance(answer, list) or any(not isinstance(item, str) for item in answer) or set(answer) != allowed or len(answer) != len(allowed):
            raise HTTPException(422, "practice_answer_invalid")
        return
    raise HTTPException(422, "practice_question_type_not_supported")


def _score(question: QuestionVersion, answer: object) -> tuple[float, float]:
    config = question.authoring_config or {}
    question_type = question.question_type
    if question_type in {"multipleChoice", "trueFalseNotGiven"}:
        expected = config.get("correctChoiceIds") if question_type == "multipleChoice" else config.get("correctValue")
        if isinstance(expected, list):
            correct = answer in expected
        else:
            correct = answer == expected
        return (1.0 if correct else 0.0, 1.0)
    if question_type == "multipleSelect":
        expected = config.get("correctChoiceIds", [])
        if not isinstance(expected, list) or not isinstance(answer, list):
            return 0.0, 1.0
        selected = set(answer)
        correct_set = set(expected)
        if config.get("scoringMode") == "allOrNothing":
            return (1.0 if selected == correct_set else 0.0, 1.0)
        penalty = config.get("incorrectSelectionPenalty", 0)
        penalty_value = float(penalty) if isinstance(penalty, (int, float)) else 0.0
        earned = max(0.0, len(selected & correct_set) - len(selected - correct_set) * penalty_value)
        return min(1.0, earned / max(1, len(correct_set))), 1.0
    if question_type in {"shortAnswer", "sentenceRewriting"}:
        expected = config.get("acceptedAnswers", [])
        normalization = config.get("normalization", [])
        options = normalization if isinstance(normalization, list) else []
        correct = isinstance(expected, list) and any(_normalize(answer, options) == _normalize(value, options) for value in expected)
        return (1.0 if correct else 0.0, 1.0)
    if question_type == "fillInTheBlank":
        blanks = config.get("blanks", [])
        if not isinstance(blanks, list) or not isinstance(answer, dict):
            return 0.0, 1.0
        earned = maximum = 0.0
        for blank in blanks:
            if not isinstance(blank, dict):
                continue
            points = blank.get("points", 0)
            weight = float(points) if isinstance(points, (int, float)) else 0.0
            accepted = blank.get("acceptedAnswers", [])
            norm = blank.get("normalization", [])
            modes = norm if isinstance(norm, list) else []
            maximum += weight
            value = answer.get(str(blank.get("blankId", "")), "")
            if isinstance(accepted, list) and any(_normalize(value, modes) == _normalize(item, modes) for item in accepted):
                earned += weight
        return earned, maximum or 1.0
    if question_type == "matching":
        pairs = config.get("pairs", [])
        if not isinstance(pairs, list) or not isinstance(answer, dict):
            return 0.0, 1.0
        maximum = sum(float(row.get("points", 0)) for row in pairs if isinstance(row, dict))
        earned = sum(float(row.get("points", 0)) for row in pairs if isinstance(row, dict) and answer.get(str(row.get("leftItemId"))) == row.get("rightItemId"))
        return earned, maximum or 1.0
    if question_type == "ordering":
        expected = config.get("correctItemIds", [])
        if not isinstance(expected, list) or not isinstance(answer, list):
            return 0.0, 1.0
        correct_positions = sum(index < len(answer) and answer[index] == item for index, item in enumerate(expected))
        if config.get("scoringMode") == "allOrNothing":
            return (1.0 if answer == expected else 0.0, 1.0)
        return float(correct_positions), float(max(1, len(expected)))
    raise HTTPException(422, "practice_question_type_not_supported")


def _learner(db: Session, course_id: uuid.UUID, user: User) -> None:
    if "student" not in user.roles:
        raise HTTPException(403, "student_role_required")
    membership = db.get(CourseMembership, (str(course_id), user.id))
    if membership is None or membership.status != "active":
        raise HTTPException(404, "course_not_found")


@router.get("/courses/{course_id}/practice/questions")
def practice_questions(
    course_id: uuid.UUID,
    db: DB,
    user: Principal,
    response: Response,
    page: int = Query(default=1, ge=1, le=10000),
    pageSize: int = Query(default=20, ge=1, le=100),
) -> dict[str, object]:
    course = course_for(db, course_id, user)
    _learner(db, course_id, user)
    latest_published = (
        select(QuestionVersion.question_id, func.max(QuestionVersion.version).label("version"))
        .where(QuestionVersion.status == "published")
        .group_by(QuestionVersion.question_id)
        .subquery()
    )
    items = list(db.scalars(
        select(QuestionVersion)
        .join(latest_published, (latest_published.c.question_id == QuestionVersion.question_id) & (latest_published.c.version == QuestionVersion.version))
        .join(Question, Question.id == QuestionVersion.question_id)
        .where(
            Question.course_id == course.id,
            Question.status == "active",
            QuestionVersion.status == "published",
            QuestionVersion.usage_types.cast(Text).ilike('%"practice"%'),
            QuestionVersion.question_type.in_(PRACTICE_TYPES),
        )
        .order_by(QuestionVersion.published_at.desc(), QuestionVersion.id)
        .offset((page - 1) * pageSize)
        .limit(pageSize + 1)
    ))
    has_more = len(items) > pageSize
    response.headers["Cache-Control"] = "no-store"
    return {
        "items": [{
            "questionId": item.question_id,
            "questionVersionId": item.id,
            "questionType": item.question_type,
            "title": item.title,
            "prompt": item.prompt,
            "categoryId": item.category_id,
            "difficulty": item.difficulty,
            "content": item.content,
            "status": item.status,
        } for item in items[:pageSize]],
        "hasMore": has_more,
        "executionAvailable": False,
    }


@router.post("/courses/{course_id}/practice/attempts", status_code=201)
def submit_practice(
    course_id: uuid.UUID,
    body: PracticeSubmission,
    request: Request,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user)
    _learner(db, course_id, user)
    question = db.get(QuestionVersion, str(body.questionVersionId))
    parent = db.get(Question, question.question_id) if question else None
    if (
        question is None
        or parent is None
        or parent.course_id != course.id
        or question.status != "published"
        or "practice" not in question.usage_types
        or question.question_type not in PRACTICE_TYPES
    ):
        raise HTTPException(404, "practice_question_not_found")
    try:
        encoded = json.dumps(body.answer, ensure_ascii=False, separators=(",", ":")).encode()
    except (TypeError, ValueError):
        raise HTTPException(422, "invalid_practice_answer") from None
    if len(encoded) > 16_000:
        raise HTTPException(413, "practice_answer_too_large")
    _validate_answer(question, body.answer)
    points, maximum = _score(question, body.answer)
    if maximum <= 0:
        raise HTTPException(409, "practice_question_invalid_scoring")
    attempt = PracticeAttempt(
        course_id=course.id,
        user_id=user.id,
        question_version_id=question.id,
        answer=body.answer,
        score=min(max(points, 0.0), maximum),
        max_points=maximum,
    )
    db.add(attempt)
    db.flush()
    audit(db, request, "practice_attempt_submitted", user, {
        "courseId": course.id,
        "attemptId": attempt.id,
        "questionVersionId": question.id,
        "score": attempt.score,
        "maxPoints": attempt.max_points,
    })
    from .missions import record_domain_event

    record_domain_event(db, request, user, "practice.attempt", attempt.id)
    if attempt.score == attempt.max_points:
        record_domain_event(db, request, user, "practice.correct", attempt.id)
    return {
        "attemptId": attempt.id,
        "questionVersionId": question.id,
        "score": attempt.score,
        "maxPoints": attempt.max_points,
        "isCorrect": attempt.score == attempt.max_points,
        "createdAt": attempt.created_at.isoformat(),
    }


@router.get("/courses/{course_id}/practice/history")
def practice_history(
    course_id: uuid.UUID,
    db: DB,
    user: Principal,
    page: int = Query(default=1, ge=1, le=10000),
    pageSize: int = Query(default=20, ge=1, le=100),
) -> dict[str, object]:
    course = course_for(db, course_id, user)
    _learner(db, course_id, user)
    attempts = list(db.scalars(
        select(PracticeAttempt)
        .where(PracticeAttempt.course_id == course.id, PracticeAttempt.user_id == user.id)
        .order_by(PracticeAttempt.created_at.desc(), PracticeAttempt.id)
        .offset((page - 1) * pageSize)
        .limit(pageSize + 1)
    ))
    has_more = len(attempts) > pageSize
    return {"items": [{
        "attemptId": item.id,
        "questionVersionId": item.question_version_id,
        "score": item.score,
        "maxPoints": item.max_points,
        "createdAt": item.created_at.isoformat(),
    } for item in attempts[:pageSize]], "hasMore": has_more}
