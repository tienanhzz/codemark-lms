"""Authenticated community with server enforced publication and course boundaries."""

import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import ColumnElement, and_, func, or_, select

from .auth import DB, Principal, audit
from .community_models import CommunityPost
from .course_access import course_for, lock_actor, permissions, visibility
from .models import Course, CourseStaff, User, now
from .quests import record_quest_event
from .security import utc

router = APIRouter(prefix="/v1/community")


class TopicDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=3, max_length=180)
    kind: Literal["question", "discussion"] = "question"
    body: str = Field(min_length=50, max_length=10000)
    courseId: uuid.UUID | None = None


class AnswerDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    body: str = Field(min_length=80, max_length=10000)


class Moderation(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    decision: Literal["approve", "reject"]
    reason: str = Field(default="", max_length=1000)


class BestAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answerId: uuid.UUID


def _role(user: User) -> str:
    for role in ("admin", "teacher", "student"):
        if role in user.roles:
            return role
    return "staff"


def _reviewer(db: DB, post: CommunityPost, user: User) -> bool:
    if post.author_id == user.id:
        return False
    if "admin" in user.roles:
        return True
    if "teacher" not in user.roles or post.author_role != "student":
        return False
    if post.course_id is None:
        return True
    course = db.get(Course, post.course_id)
    return course is not None and "content.author" in permissions(db, course, user)


def _review_filter(user: User) -> ColumnElement[bool]:
    if "admin" in user.roles:
        return CommunityPost.author_id != user.id
    if "teacher" in user.roles:
        # A course teacher may review only courses they teach, never merely courses they attend.
        taught = select(Course.id).where(
            or_(
                Course.owner_id == user.id,
                Course.id.in_(
                    select(CourseStaff.course_id).where(
                        CourseStaff.user_id == user.id,
                        CourseStaff.active.is_(True),
                        CourseStaff.role == "teacher",
                    )
                ),
            )
        )
        return and_(
            CommunityPost.author_id != user.id,
            CommunityPost.author_role == "student",
            or_(CommunityPost.course_id.is_(None), CommunityPost.course_id.in_(taught)),
        )
    return CommunityPost.id.is_(None)


def _scope(user: User) -> ColumnElement[bool]:
    return or_(
        CommunityPost.course_id.is_(None),
        CommunityPost.course_id.in_(select(Course.id).where(visibility(user))),
    )


def _post(
    db: DB, post_id: uuid.UUID, user: User, topic: bool = False, write: bool = False
) -> CommunityPost:
    post = db.scalar(
        select(CommunityPost).where(CommunityPost.id == str(post_id)).with_for_update()
        if write
        else select(CommunityPost).where(CommunityPost.id == str(post_id))
    )
    if post is None or (topic and post.parent_id is not None):
        raise HTTPException(404, "community_post_not_found")
    if post.course_id:
        course_for(db, uuid.UUID(post.course_id), user, write=write)
    if post.status != "published" and post.author_id != user.id and not _reviewer(db, post, user):
        raise HTTPException(404, "community_post_not_found")
    return post


def _json(db: DB, post: CommunityPost, user: User) -> dict[str, object]:
    author = db.get(User, post.author_id)
    assert author is not None  # Retained by the author foreign key.
    parent = db.get(CommunityPost, post.parent_id) if post.parent_id else None
    course = db.get(Course, post.course_id) if post.course_id else None
    can_best = post.status == "published" and (
        post.author_id == user.id
        or "admin" in user.roles
        or (
            "teacher" in user.roles
            and (not course or "content.author" in permissions(db, course, user))
        )
    )
    return {
        "id": post.id,
        "topicId": post.parent_id or post.id,
        "title": post.title or (parent.title if parent else ""),
        "kind": post.kind,
        "body": post.body,
        "authorName": author.nickname or author.username,
        "authorRole": post.author_role,
        "status": post.status,
        "createdAt": utc(post.created_at).isoformat(),
        "courseId": post.course_id,
        "courseTitle": course.title if course else None,
        "bestAnswerId": post.best_answer_id,
        "canReview": post.status == "pending" and _reviewer(db, post, user),
        "canSelectBest": bool(can_best and post.parent_id is None),
        "moderationReason": post.moderation_reason
        if post.author_id == user.id or _reviewer(db, post, user)
        else "",
        "isOwn": post.author_id == user.id,
    }


def _publish_event(db: DB, post: CommunityPost) -> None:
    author = db.get(User, post.author_id)
    assert author is not None
    if post.parent_id:
        topic = db.get(CommunityPost, post.parent_id)
        assert topic is not None
        record_quest_event(
            db,
            author,
            "forum.reply.approved",
            f"community_reply:{post.id}",
            {
                "content": post.body,
                "topic_id": topic.id,
                "topic_author_id": topic.author_id,
                "topic_author_role": topic.author_role,
                "topic_created_at": utc(topic.created_at).isoformat(),
                "replied_at": utc(post.created_at).isoformat(),
                "created_at": utc(post.created_at).isoformat(),
                "author_role": post.author_role,
                "course_id": post.course_id,
            },
        )
    else:
        if post.kind == "question":
            record_quest_event(
                db,
                author,
                "forum.question.approved",
                f"community_topic:{post.id}",
                {
                    "content": post.body,
                    "topic_id": post.id,
                    "author_role": post.author_role,
                    "course_id": post.course_id,
                },
            )
        if post.kind == "discussion" and post.author_role == "teacher":
            record_quest_event(
                db,
                author,
                "poll.published",
                f"community_topic:{post.id}:discussion",
                {
                    "published": True,
                    "course_id": post.course_id,
                    "entity_id": post.id,
                    "author_role": post.author_role,
                },
            )


@router.get("/topics")
def topics(
    db: DB,
    user: Principal,
    view: Literal["published", "mine", "queue"] = "published",
    status: Literal["all", "pending", "published", "rejected"] = "all",
    q: str = Query(default="", max_length=200),
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=12, ge=1, le=50),
) -> dict[str, object]:
    _role(user)
    filters = [_scope(user)]
    if view == "queue":
        if not set(user.roles) & {"teacher", "admin"}:
            raise HTTPException(403, "community_reviewer_required")
        filters += [CommunityPost.status == "pending", _review_filter(user)]
    else:
        filters += (
            [CommunityPost.author_id == user.id]
            if view == "mine"
            else [CommunityPost.status == "published", CommunityPost.parent_id.is_(None)]
        )
        if view == "mine" and status != "all":
            filters += [CommunityPost.status == status]
    if q.strip():
        filters += [
            or_(
                CommunityPost.title.icontains(q.strip(), autoescape=True),
                CommunityPost.body.icontains(q.strip(), autoescape=True),
            )
        ]
    rows = db.scalars(
        select(CommunityPost)
        .where(*filters)
        .order_by(CommunityPost.created_at.desc(), CommunityPost.id)
        .offset((page - 1) * pageSize)
        .limit(pageSize)
    )
    return {
        "items": [_json(db, post, user) for post in rows],
        "total": db.scalar(select(func.count()).select_from(CommunityPost).where(*filters)),
        "page": page,
        "pageSize": pageSize,
    }


@router.post("/topics", status_code=201)
def create_topic(body: TopicDraft, request: Request, db: DB, user: Principal) -> dict[str, object]:
    lock_actor(db, request, user)
    role = _role(user)
    if body.courseId:
        course_for(db, body.courseId, user, write=True)
    post = CommunityPost(
        author_id=user.id,
        author_role=role,
        title=body.title,
        kind=body.kind,
        body=body.body,
        course_id=str(body.courseId) if body.courseId else None,
        status="published" if role == "admin" else "pending",
        published_at=now() if role == "admin" else None,
    )
    db.add(post)
    db.flush()
    if post.status == "published":
        _publish_event(db, post)
    audit(db, request, "community_topic_created", user, {"postId": post.id, "status": post.status})
    return _json(db, post, user)


@router.get("/topics/{topic_id}")
def topic_detail(topic_id: uuid.UUID, db: DB, user: Principal) -> dict[str, object]:
    _role(user)
    return _json(db, _post(db, topic_id, user, topic=True), user)


@router.get("/topics/{topic_id}/answers")
def answers(
    topic_id: uuid.UUID,
    db: DB,
    user: Principal,
    page: int = Query(default=1, ge=1),
    pageSize: int = Query(default=10, ge=1, le=50),
) -> dict[str, object]:
    _role(user)
    topic = _post(db, topic_id, user, topic=True)
    filters = [
        CommunityPost.parent_id == topic.id,
        or_(
            CommunityPost.status == "published",
            CommunityPost.author_id == user.id,
            and_(CommunityPost.status == "pending", _review_filter(user)),
        ),
    ]
    rows = db.scalars(
        select(CommunityPost)
        .where(*filters)
        .order_by(CommunityPost.created_at, CommunityPost.id)
        .offset((page - 1) * pageSize)
        .limit(pageSize)
    )
    return {
        "items": [_json(db, post, user) for post in rows],
        "total": db.scalar(select(func.count()).select_from(CommunityPost).where(*filters)),
        "page": page,
        "pageSize": pageSize,
    }


@router.post("/topics/{topic_id}/answers", status_code=201)
def create_answer(
    topic_id: uuid.UUID, body: AnswerDraft, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    role = _role(user)
    topic = _post(db, topic_id, user, topic=True, write=True)
    if topic.status != "published":
        raise HTTPException(409, "community_topic_not_published")
    post = CommunityPost(
        parent_id=topic.id,
        course_id=topic.course_id,
        author_id=user.id,
        author_role=role,
        body=body.body,
        status="published" if role == "admin" else "pending",
        kind="answer",
        published_at=now() if role == "admin" else None,
    )
    db.add(post)
    db.flush()
    if post.status == "published":
        _publish_event(db, post)
    audit(db, request, "community_answer_created", user, {"postId": post.id, "topicId": topic.id})
    return _json(db, post, user)


@router.post("/posts/{post_id}/moderation")
def moderate(
    post_id: uuid.UUID, body: Moderation, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    post = _post(db, post_id, user, write=True)
    if not _reviewer(db, post, user):
        raise HTTPException(403, "community_reviewer_required")
    target = "published" if body.decision == "approve" else "rejected"
    if post.status == target:
        return _json(db, post, user)
    if post.status != "pending":
        raise HTTPException(409, "community_already_reviewed")
    post.status, post.reviewed_by, post.moderation_reason = target, user.id, body.reason
    if target == "published":
        post.published_at = now()
        _publish_event(db, post)
    audit(
        db, request, "community_post_reviewed", user, {"postId": post.id, "decision": body.decision}
    )
    db.flush()
    return _json(db, post, user)


@router.put("/topics/{topic_id}/best-answer")
def best_answer(
    topic_id: uuid.UUID, body: BestAnswer, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    topic = _post(db, topic_id, user, topic=True, write=True)
    if not _json(db, topic, user)["canSelectBest"]:
        raise HTTPException(403, "community_best_answer_forbidden")
    answer = db.get(CommunityPost, str(body.answerId))
    if answer is None or answer.parent_id != topic.id:
        raise HTTPException(422, "community_answer_topic_mismatch")
    if answer.status != "published":
        raise HTTPException(409, "community_answer_not_published")
    if topic.best_answer_id == answer.id:
        return _json(db, topic, user)
    if topic.best_answer_id:
        raise HTTPException(409, "community_best_answer_already_selected")
    topic.best_answer_id = answer.id
    metadata = {
        "topic_id": topic.id,
        "selected_by_id": user.id,
        "answer_author_id": answer.author_id,
        "selector_authorized": True,
        "course_id": topic.course_id,
        "author_role": answer.author_role,
    }
    answer_author = db.get(User, answer.author_id)
    assert answer_author is not None
    if answer.author_role == "student" and answer.author_id != user.id:
        record_quest_event(
            db,
            answer_author,
            "forum.best_answer.selected",
            f"community_reply:{answer.id}:best",
            metadata,
        )
    if "teacher" in user.roles and answer.author_role == "student" and answer.author_id != user.id:
        record_quest_event(
            db,
            user,
            "forum.best_answer.pinned",
            f"community_topic:{topic.id}:pin",
            {**metadata, "author_role": "teacher"},
        )
    audit(
        db,
        request,
        "community_best_answer_selected",
        user,
        {"topicId": topic.id, "answerId": answer.id},
    )
    db.flush()
    return _json(db, topic, user)
