"""Reasoned profile assistance with a narrow field allowlist and live role checks."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import func, or_, select

from .auth import DB, Provisioner, audit, lock_provisioner
from .identity_dto import Reason, SupportProfileChange
from .identity_views import SupportPersonList, SupportProfile
from .models import User, UserProfile

router = APIRouter(prefix="/v1/profile-support/users")


def person(user: User) -> dict[str, object]:
    return {
        "id": user.id,
        "username": user.username,
        "officialName": user.official_name,
        "institutionalId": user.institutional_id,
        "status": user.status,
    }


def profile_view(db: DB, user: User) -> dict[str, object]:
    item = db.get(UserProfile, user.id)
    return {
        **person(user),
        "revision": user.revision,
        "contactEmail": item.contact_email if item else None,
        "phone": item.phone if item else None,
        "about": item.about if item else "",
        "academicTitle": item.academic_title if item else "",
    }


def target(db: DB, user_id: UUID) -> User:
    user = db.get(User, str(user_id))
    if user is None:
        raise HTTPException(404, "account_not_found")
    return user


@router.get("", response_model=SupportPersonList)
def search(
    request: Request,
    db: DB,
    user: Provisioner,
    query: str = Query(default="", max_length=200),
    cursor: UUID | None = None,
) -> dict[str, object]:
    lock_provisioner(db, request, user, "profiles")
    term = (
        "%"
        + query.strip().lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        + "%"
    )
    statement = (
        select(User)
        .where(
            or_(
                *[
                    func.lower(field).like(term, escape="\\")
                    for field in [User.username, User.official_name, User.institutional_id]
                ]
            )
        )
        .order_by(User.id)
    )
    if cursor:
        statement = statement.where(User.id > str(cursor))
    items = list(db.scalars(statement.limit(26)))
    return {
        "items": [person(item) for item in items[:25]],
        "nextCursor": items[24].id if len(items) > 25 else None,
    }


@router.post("/{user_id}/access", response_model=SupportProfile)
def access(
    user_id: UUID, body: Reason, request: Request, db: DB, user: Provisioner
) -> dict[str, object]:
    lock_provisioner(db, request, user, "profiles")
    selected = target(db, user_id)
    audit(
        db, request, "profile_support_viewed", user, {"userId": selected.id, "reason": body.reason}
    )
    return profile_view(db, selected)


@router.patch("/{user_id}", response_model=SupportProfile)
def update(
    user_id: UUID, body: SupportProfileChange, request: Request, db: DB, user: Provisioner
) -> dict[str, object]:
    lock_provisioner(db, request, user, "profiles")
    selected = target(db, user_id)
    if selected.status not in {"active", "invited"}:
        raise HTTPException(409, "profile_support_read_only")
    if selected.revision != body.expectedRevision:
        raise HTTPException(409, "stale_account")
    item = db.get(UserProfile, selected.id)
    if item is None:
        item = UserProfile(user_id=selected.id)
        db.add(item)
    allowed = {
        "contactEmail": "contact_email",
        "phone": "phone",
        "about": "about",
        "academicTitle": "academic_title",
    }
    changed = sorted(body.model_fields_set & allowed.keys())
    if not changed:
        raise HTTPException(422, "validation_failed")
    for key in changed:
        value = getattr(body, key)
        setattr(item, allowed[key], value.strip() if isinstance(value, str) else value)
    selected.revision += 1
    audit(
        db,
        request,
        "profile_support_updated",
        user,
        {"userId": selected.id, "fields": changed, "reason": body.reason},
    )
    db.flush()
    return profile_view(db, selected)
