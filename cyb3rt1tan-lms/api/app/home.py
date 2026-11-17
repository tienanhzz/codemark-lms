"""Public bulletin with explicitly authorized, audited staff publication."""

import uuid

from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select

from .auth import DB, Principal, audit, current, lock_principal
from .home_highlights import router as highlights_router
from .models import HomeAnnouncement, User, now

router = APIRouter(prefix="/v1/home")
router.include_router(highlights_router)


class AnnouncementDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=180)
    body: str = Field(min_length=1, max_length=10000)


def _can_manage(item: HomeAnnouncement, user: User | None) -> bool:
    return bool(
        user and ("admin" in user.roles or ("teacher" in user.roles and item.author_id == user.id))
    )


def _view(item: HomeAnnouncement, author: User, user: User | None) -> dict[str, object]:
    return {
        "id": item.id,
        "title": item.title,
        "body": item.body,
        "createdAt": item.created_at.isoformat(),
        "updatedAt": item.updated_at.isoformat(),
        "authorName": author.nickname or author.username,
        "authorRole": item.author_role,
        "canManage": _can_manage(item, user),
    }


def _publisher(db: DB, request: Request, user: User) -> None:
    lock_principal(db, request, user)
    if not set(user.roles) & {"admin", "teacher"}:
        raise HTTPException(403, "forbidden")


@router.get("/announcements")
def list_announcements(
    request: Request,
    db: DB,
    page: int = Query(1, ge=1, le=100000),
    pageSize: int = Query(10, ge=1, le=100),
) -> dict[str, object]:
    # Authentication only changes edit controls. Expired sessions still see public news.
    user = None
    if request.cookies.get("lms_session"):
        try:
            user = current(request, db)
        except HTTPException as error:
            if error.status_code != 401:
                raise
    total = db.scalar(select(func.count()).select_from(HomeAnnouncement)) or 0
    rows = db.execute(
        select(HomeAnnouncement, User)
        .join(User, HomeAnnouncement.author_id == User.id)
        .order_by(HomeAnnouncement.created_at.desc(), HomeAnnouncement.id.desc())
        .offset((page - 1) * pageSize)
        .limit(pageSize)
    )
    return {
        "items": [_view(item, author, user) for item, author in rows],
        "total": total,
        "page": page,
        "pageSize": pageSize,
    }


@router.post("/announcements", status_code=201)
def create_announcement(
    body: AnnouncementDraft, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    _publisher(db, request, user)
    item = HomeAnnouncement(
        title=body.title,
        body=body.body,
        author_id=user.id,
        author_role="admin" if "admin" in user.roles else "teacher",
    )
    db.add(item)
    db.flush()
    audit(db, request, "home_announcement_created", user, {"announcementId": item.id})
    return _view(item, user, user)


def _owned(db: DB, item_id: uuid.UUID, user: User) -> HomeAnnouncement:
    item = db.scalar(
        select(HomeAnnouncement).where(HomeAnnouncement.id == str(item_id)).with_for_update()
    )
    if item is None:
        raise HTTPException(404, "home_announcement_not_found")
    if not _can_manage(item, user):
        raise HTTPException(403, "forbidden")
    return item


@router.put("/announcements/{item_id}")
def update_announcement(
    item_id: uuid.UUID, body: AnnouncementDraft, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    _publisher(db, request, user)
    item = _owned(db, item_id, user)
    item.title, item.body, item.updated_at = body.title, body.body, now()
    audit(db, request, "home_announcement_updated", user, {"announcementId": item.id})
    db.flush()
    author = db.get(User, item.author_id)
    assert author is not None
    return _view(item, author, user)


@router.delete("/announcements/{item_id}", status_code=204)
def delete_announcement(item_id: uuid.UUID, request: Request, db: DB, user: Principal) -> Response:
    _publisher(db, request, user)
    item = _owned(db, item_id, user)
    audit(db, request, "home_announcement_deleted", user, {"announcementId": item.id})
    db.delete(item)
    return Response(status_code=204)
