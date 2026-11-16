"""Private question authoring with immutable, versioned course questions."""

import uuid
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .auth import DB, Admin, Principal, audit, lock_admin
from .course_access import course_for, lock_actor, permissions
from .models import (
    Course,
    Question,
    QuestionAsset,
    QuestionVersion,
    QuestionVersionTag,
    RuntimeProfileVersion,
    TaxonomyCategory,
    TaxonomyTag,
)
from .question_dto import QuestionDraft, RuntimeProfileDraft
from .question_schemas import runtime_profile_errors, schema_errors

router = APIRouter(prefix="/v1")
QUESTION_TYPES = {
    "code", "writing", "sentenceRewriting", "multipleChoice", "multipleSelect",
    "shortAnswer", "fillInTheBlank", "matching", "ordering", "trueFalseNotGiven",
    "readingSet", "listeningSet",
}


def version_tags(db: Session, version_id: str) -> list[dict[str, object]]:
    tags = list(
        db.scalars(
            select(TaxonomyTag)
            .join(
                QuestionVersionTag,
                (QuestionVersionTag.tag_scope == TaxonomyTag.scope)
                & (QuestionVersionTag.tag_id == TaxonomyTag.id),
            )
            .where(
                QuestionVersionTag.question_version_id == version_id,
                TaxonomyTag.scope == "question",
            )
            .order_by(TaxonomyTag.id)
        )
    )
    return [{"id": item.id, "names": item.names} for item in tags]


def version_json(db: Session, item: QuestionVersion, include_private: bool) -> dict[str, object]:
    result: dict[str, object] = {
        "questionId": item.question_id,
        "questionVersionId": item.id,
        "versionNumber": item.version,
        "questionType": item.question_type,
        "title": item.title,
        "prompt": item.prompt,
        "categoryId": item.category_id,
        "difficulty": item.difficulty,
        "language": item.language,
        "usageTypes": item.usage_types,
        "tags": version_tags(db, item.id),
        "contentSchemaVersion": "1.0",
        "content": item.content,
        "status": item.status,
        "createdAt": item.created_at.isoformat(),
    }
    if include_private:
        result["authoringConfig"] = item.authoring_config
        result["validation"] = item.validation
    return result


def authorize_question(
    db: Session, question_id: uuid.UUID, user: Principal, edit: bool = False
) -> tuple[Question, Course]:
    question = db.get(Question, str(question_id))
    if question is None:
        raise HTTPException(404, "question_not_found")
    course = course_for(db, uuid.UUID(question.course_id), user, "content.author" if edit else None)
    return question, course


def validate_taxonomy(db: Session, body: QuestionDraft) -> None:
    category = db.get(TaxonomyCategory, ("question", body.categoryId))
    if category is None or category.status != "active":
        raise HTTPException(422, "active_question_category_required")
    if body.tagIds:
        tags = list(
            db.scalars(
                select(TaxonomyTag).where(
                    TaxonomyTag.scope == "question",
                    TaxonomyTag.id.in_(body.tagIds),
                    TaxonomyTag.status == "active",
                    TaxonomyTag.selectable.is_(True),
                )
            )
        )
        if len(tags) != len(body.tagIds):
            raise HTTPException(422, "active_question_tags_required")
        for tag in tags:
            if tag.applicability and body.questionType not in tag.applicability:
                raise HTTPException(422, "question_tag_not_applicable")


def create_version(
    db: Session, request: Request, user: Principal, question: Question, body: QuestionDraft, number: int
) -> QuestionVersion:
    validate_taxonomy(db, body)
    version = QuestionVersion(
        id=str(uuid.uuid4()),
        question_id=question.id,
        version=number,
        question_type=body.questionType,
        title=body.title,
        prompt=body.prompt,
        category_scope="question",
        category_id=body.categoryId,
        difficulty=body.difficulty,
        language=body.language,
        usage_types=list(body.usageTypes),
        content=body.content,
        authoring_config=body.authoringConfig,
        status="draft",
        created_by=user.id,
    )
    db.add(version)
    db.flush()
    for tag_id in body.tagIds:
        db.add(QuestionVersionTag(question_version_id=version.id, tag_scope="question", tag_id=tag_id))
    question.latest_version = number
    db.flush()
    audit(
        db,
        request,
        "question_version_created",
        user,
        {"courseId": question.course_id, "questionId": question.id, "versionId": version.id, "version": number},
    )
    return version


def next_version(db: Session, question: Question) -> int:
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        db.execute(select(Question.id).where(Question.id == question.id).with_for_update())
    current = db.scalar(
        select(func.max(QuestionVersion.version)).where(QuestionVersion.question_id == question.id)
    )
    return int(current or 0) + 1


@router.post("/courses/{course_id}/questions", status_code=201)
def create_question(
    course_id: uuid.UUID,
    body: QuestionDraft,
    request: Request,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "content.author", True)
    question = Question(course_id=course.id, created_by=user.id, latest_version=1)
    db.add(question)
    db.flush()
    version = create_version(db, request, user, question, body, 1)
    return version_json(db, version, True)


@router.post("/questions/{question_id}/versions", status_code=201)
def create_question_version(
    question_id: uuid.UUID,
    body: QuestionDraft,
    request: Request,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    question, _ = authorize_question(db, question_id, user, edit=True)
    if question.status != "active":
        raise HTTPException(409, "question_retired")
    version = create_version(db, request, user, question, body, next_version(db, question))
    return version_json(db, version, True)


@router.get("/courses/{course_id}/questions")
def search_questions(
    course_id: uuid.UUID,
    db: DB,
    user: Principal,
    response: Response,
    q: str = Query(default="", max_length=200),
    categoryId: str | None = None,
    tagIds: list[str] | None = None,
    tagMatch: Literal["any", "all"] = "any",
    questionType: str | None = None,
    difficulty: str | None = None,
    language: str | None = None,
    status: str | None = None,
    page: int = Query(default=1, ge=1, le=10000),
    pageSize: int = Query(default=20, ge=1, le=100),
) -> dict[str, object]:
    course = course_for(db, course_id, user)
    staff = "content.author" in permissions(db, course, user)
    published_only = not staff
    tag_ids = tagIds or []
    latest_query = (
        select(QuestionVersion.question_id, func.max(QuestionVersion.version).label("version"))
        .group_by(QuestionVersion.question_id)
    )
    if published_only:
        latest_query = latest_query.where(QuestionVersion.status == "published")
    latest = latest_query.subquery()
    statement = (
        select(QuestionVersion)
        .join(latest, (latest.c.question_id == QuestionVersion.question_id) & (latest.c.version == QuestionVersion.version))
        .join(Question, Question.id == QuestionVersion.question_id)
        .where(Question.course_id == course.id, Question.status == "active")
    )
    if q.strip():
        pattern = f"%{q.strip()}%"
        statement = statement.where(or_(QuestionVersion.title.ilike(pattern), QuestionVersion.prompt.ilike(pattern)))
    if categoryId:
        statement = statement.where(QuestionVersion.category_id == categoryId)
    if questionType:
        if questionType not in QUESTION_TYPES:
            raise HTTPException(422, "invalid_question_type")
        statement = statement.where(QuestionVersion.question_type == questionType)
    if difficulty:
        if difficulty not in {"newbie", "noob", "wannabe", "gatekeeper", "legendary"}:
            raise HTTPException(422, "invalid_question_difficulty")
        statement = statement.where(QuestionVersion.difficulty == difficulty)
    if language:
        statement = statement.where(QuestionVersion.language == language)
    if status and staff:
        statement = statement.where(QuestionVersion.status == status)
    if tag_ids:
        if len(tag_ids) > 20 or len(tag_ids) != len(set(tag_ids)):
            raise HTTPException(422, "invalid_tag_filter")
        matching = select(QuestionVersionTag.question_version_id).where(
            QuestionVersionTag.tag_scope == "question", QuestionVersionTag.tag_id.in_(tag_ids)
        )
        if tagMatch == "all":
            matching = matching.group_by(QuestionVersionTag.question_version_id).having(
                func.count(func.distinct(QuestionVersionTag.tag_id)) == len(tag_ids)
            )
        statement = statement.where(QuestionVersion.id.in_(matching))
    versions = list(
        db.scalars(
            statement.order_by(QuestionVersion.created_at.desc(), QuestionVersion.id)
            .offset((page - 1) * pageSize)
            .limit(pageSize + 1)
        )
    )
    has_more = len(versions) > pageSize
    values = [version_json(db, item, staff) for item in versions[:pageSize]]
    if response is not None:
        response.headers["Cache-Control"] = "no-store"
    return {"items": values, "page": page, "pageSize": pageSize, "hasMore": has_more, "executionAvailable": False}


@router.get("/questions/{question_id}/versions/{version_id}")
def get_question_version(
    question_id: uuid.UUID,
    version_id: uuid.UUID,
    db: DB,
    user: Principal,
    response: Response,
) -> dict[str, object]:
    question, _ = authorize_question(db, question_id, user)
    item = db.get(QuestionVersion, str(version_id))
    if item is None or item.question_id != question.id:
        raise HTTPException(404, "question_version_not_found")
    staff = False
    try:
        course_for(db, uuid.UUID(question.course_id), user, "content.author")
        staff = True
    except HTTPException:
        pass
    if not staff and item.status != "published":
        raise HTTPException(404, "question_version_not_found")
    response.headers["Cache-Control"] = "no-store"
    return version_json(db, item, staff)


@router.post("/questions/{question_id}/versions/{version_id}/validate")
def validate_question_version(
    question_id: uuid.UUID,
    version_id: uuid.UUID,
    request: Request,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    question, _ = authorize_question(db, question_id, user, edit=True)
    item = db.get(QuestionVersion, str(version_id), populate_existing=True)
    if item is None or item.question_id != question.id:
        raise HTTPException(404, "question_version_not_found")
    if item.status != "draft":
        raise HTTPException(409, "question_version_not_draft")
    errors = schema_errors(item.question_type, item.content, item.authoring_config)
    if item.question_type == "code":
        asset_id = item.authoring_config.get("referenceSolutionAssetId") if item.authoring_config else None
        asset = db.get(QuestionAsset, str(asset_id)) if asset_id else None
        if asset is None or asset.course_id != question.course_id or asset.asset_kind != "referenceSolution":
            errors.append({"path": "authoringConfig.referenceSolutionAssetId", "message": "Upload a protected reference solution to this course."})
        errors.append({"path": "authoringConfig.referenceSolutionAssetId", "message": "Protected reference-solution assets and offline test validation are not configured."})
    if item.question_type == "listeningSet":
        asset_id = item.content.get("audioAssetId")
        asset = db.get(QuestionAsset, str(asset_id)) if isinstance(asset_id, str) else None
        if asset is None or asset.course_id != question.course_id or asset.asset_kind != "audio":
            errors.append({"path": "content.audioAssetId", "message": "Upload a protected audio asset to this course."})
    if item.question_type in {"readingSet", "listeningSet"}:
        child_ids = item.content.get("childQuestionVersionIds", [])
        if isinstance(child_ids, list) and child_ids:
            children = list(
                db.scalars(
                    select(QuestionVersion)
                    .join(Question, Question.id == QuestionVersion.question_id)
                    .where(
                        QuestionVersion.id.in_(child_ids),
                        QuestionVersion.status == "published",
                        Question.course_id == question.course_id,
                        QuestionVersion.question_type.in_({
                            "multipleChoice", "multipleSelect", "shortAnswer", "fillInTheBlank",
                            "matching", "ordering", "trueFalseNotGiven",
                        }),
                    )
                )
            )
            if len(children) != len(child_ids):
                errors.append({"path": "content.childQuestionVersionIds", "message": "Every child must be a published objective question in this course."})
    if not errors:
        item.status = "validated"
        item.validation = {"valid": True, "errors": []}
        item.validated_at = datetime.now(UTC)
    else:
        item.validation = {"valid": False, "errors": errors}
    audit(
        db,
        request,
        "question_version_validated",
        user,
        {"questionId": question.id, "versionId": item.id, "valid": not errors},
    )
    return {"valid": not errors, "errors": errors, "status": item.status}


@router.post("/questions/{question_id}/versions/{version_id}/publish", status_code=202)
def publish_question_version(
    question_id: uuid.UUID,
    version_id: uuid.UUID,
    request: Request,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    question, _ = authorize_question(db, question_id, user, edit=True)
    item = db.get(QuestionVersion, str(version_id), populate_existing=True)
    if item is None or item.question_id != question.id:
        raise HTTPException(404, "question_version_not_found")
    if item.status != "validated":
        raise HTTPException(409, "question_must_validate_before_publish")
    if item.question_type == "code":
        raise HTTPException(409, "code_publication_disabled")
    item.status = "published"
    item.published_at = datetime.now(UTC)
    audit(db, request, "question_version_published", user, {"questionId": question.id, "versionId": item.id})
    return {"questionId": question.id, "questionVersionId": item.id, "status": item.status, "publishedAt": item.published_at.isoformat(), "executionAvailable": False}


@router.get("/admin/runtime-profiles")
def list_runtime_profiles(db: DB, user: Admin) -> dict[str, object]:
    items = list(
        db.scalars(select(RuntimeProfileVersion).order_by(RuntimeProfileVersion.profile_id, RuntimeProfileVersion.version.desc()))
    )
    return {"items": [runtime_profile_json(item) for item in items], "executionAvailable": False}


def runtime_profile_json(item: RuntimeProfileVersion) -> dict[str, object]:
    return {"profile": item.profile, "createdAt": item.created_at.isoformat(), "executionAvailable": False}


@router.post("/admin/runtime-profiles", status_code=201)
def create_runtime_profile(
    body: RuntimeProfileDraft, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    lock_admin(db, request, user)
    versions = list(
        db.scalars(
            select(RuntimeProfileVersion).where(RuntimeProfileVersion.profile_id == body.profileId)
        )
    )
    version_number = max((item.version for item in versions), default=0) + 1
    profile: dict[str, object] = body.model_dump(exclude_none=True)
    profile.update(version=version_number, status="draft")
    errors = runtime_profile_errors(profile)
    if errors:
        raise HTTPException(422, "runtime_profile_invalid")
    item = RuntimeProfileVersion(
        profile_id=body.profileId,
        version=version_number,
        profile=profile,
        status="draft",
        created_by=user.id,
    )
    db.add(item)
    db.flush()
    audit(db, request, "runtime_profile_draft_created", user, {"profileId": body.profileId, "version": version_number})
    return runtime_profile_json(item)
