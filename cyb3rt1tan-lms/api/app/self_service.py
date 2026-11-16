"""Self-service identity fields and personal session control; official identity is immutable here."""

import unicodedata
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import select

from .auth import (
    DB,
    Admin,
    Principal,
    audit,
    lock_admin,
    lock_principal,
    public_user,
    throttle,
    verify_password,
)
from .identity_dto import CurrentPassword, IdentityPolicyChange, ProfileChange
from .identity_views import IdentityPolicyView, PersonalProfile, PersonalSessionList
from .models import IdentityPolicy, User, UserAvatar, UserProfile, UserSession, now
from .security import utc

router = APIRouter(prefix="/v1")
RESERVED = {"admin", "administrator", "root", "system", "moderator", "codemark", "support"}


def normalized(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip().casefold()


def policy_view(db: DB) -> dict[str, object]:
    policy = db.get(IdentityPolicy, "identity")
    return {
        "revision": policy.revision if policy else 0,
        "nicknameCooldownDays": policy.nickname_cooldown_days if policy else 7,
        "blockedTerms": policy.blocked_terms if policy else [],
    }


def next_change(db: DB, user: User) -> str | None:
    policy = db.get(IdentityPolicy, "identity")
    days = policy.nickname_cooldown_days if policy else 7
    if user.nickname_changed_at is None:
        return None
    return (utc(user.nickname_changed_at) + timedelta(days=days)).isoformat()


@router.get("/me/profile", response_model=PersonalProfile)
def profile(db: DB, user: Principal) -> dict[str, object]:
    item = db.get(UserProfile, user.id)
    avatar_id = db.scalar(select(UserAvatar.id).where(UserAvatar.user_id == user.id))
    return {
        **public_user(user),
        "revision": user.revision,
        "institutionalId": user.institutional_id,
        "contactEmail": item.contact_email if item else None,
        "phone": item.phone if item else None,
        "about": item.about if item else "",
        "academicTitle": item.academic_title if item else "",
        "showEmailInCourses": item.show_email_in_courses if item else False,
        "nextNicknameChangeAt": next_change(db, user),
        "avatarUploadAvailable": True,
        "avatarUrl": f"/v1/me/avatar/{avatar_id}" if avatar_id else None,
    }


@router.patch("/me/profile", response_model=PersonalProfile)
def update_profile(
    body: ProfileChange, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_principal(db, request, user)
    if user.revision != body.expectedRevision:
        raise HTTPException(409, "stale_account")
    supplied = body.model_fields_set
    requested_nickname = body.nickname if "nickname" in supplied else user.nickname
    nickname = unicodedata.normalize("NFKC", requested_nickname or "").strip() or None
    key = normalized(nickname) if nickname else None
    nickname_changed = nickname != user.nickname
    if nickname_changed:
        next_at = next_change(db, user)
        if next_at is not None and datetime.fromisoformat(next_at) > now():
            raise HTTPException(409, "nickname_cooldown")
        if nickname is not None:
            if not 3 <= len(nickname) <= 32 or not any(c.isalnum() for c in nickname):
                raise HTTPException(422, "invalid_nickname")
            if any(
                not (unicodedata.category(c)[0] in {"L", "N", "M"} or c in " ._-") for c in nickname
            ):
                raise HTTPException(422, "invalid_nickname")
            assert key is not None
            policy = db.get(IdentityPolicy, "identity")
            terms = policy.blocked_terms if policy else []
            if key in RESERVED or any(normalized(term) in key for term in terms):
                raise HTTPException(422, "nickname_blocked")
            if db.scalar(select(User.id).where(User.nickname_key == key, User.id != user.id)):
                raise HTTPException(409, "nickname_unavailable")
        user.nickname, user.nickname_key = nickname, key
        user.nickname_changed_at = now()
    item = db.get(UserProfile, user.id)
    if item is None:
        item = UserProfile(user_id=user.id)
        db.add(item)
    if "contactEmail" in supplied:
        item.contact_email = body.contactEmail
    if "phone" in supplied:
        item.phone = body.phone.strip() if body.phone and body.phone.strip() else None
    if "about" in supplied:
        item.about = body.about.strip()
    if "academicTitle" in supplied:
        item.academic_title = body.academicTitle.strip()
    if "showEmailInCourses" in supplied:
        item.show_email_in_courses = body.showEmailInCourses
    # Profile-only edits also participate in optimistic concurrency.
    user.revision += 1
    audit(db, request, "profile_updated", user, {"nicknameChanged": nickname_changed})
    db.flush()
    return profile(db, user)


@router.get("/admin/identity-policy", response_model=IdentityPolicyView)
def identity_policy(db: DB, admin: Admin) -> dict[str, object]:
    return policy_view(db)


@router.put("/admin/identity-policy", response_model=IdentityPolicyView)
def update_policy(
    body: IdentityPolicyChange, request: Request, db: DB, admin: Admin
) -> dict[str, object]:
    lock_admin(db, request, admin)
    policy = db.get(IdentityPolicy, "identity")
    if (policy.revision if policy else 0) != body.expectedRevision:
        raise HTTPException(409, "stale_account")
    if policy is None:
        policy = IdentityPolicy(id="identity")
        db.add(policy)
    policy.nickname_cooldown_days = body.nicknameCooldownDays
    policy.blocked_terms = sorted({normalized(term) for term in body.blockedTerms})
    audit(db, request, "identity_policy_changed", admin, {"reason": body.reason})
    db.flush()
    return policy_view(db)


@router.get("/me/sessions", response_model=PersonalSessionList)
def personal_sessions(request: Request, db: DB, user: Principal) -> dict[str, object]:
    sessions = db.scalars(
        select(UserSession)
        .where(UserSession.user_id == user.id, UserSession.expires_at > now())
        .order_by(UserSession.created_at.desc())
    )
    return {
        "items": [
            {
                "id": item.id,
                "createdAt": utc(item.created_at).isoformat(),
                "expiresAt": utc(item.expires_at).isoformat(),
                "current": item.token_digest == request.state.session.token_digest,
                "mfaAuthenticated": item.mfa_authenticated,
            }
            for item in sessions
        ]
    }


@router.post("/me/sessions/{session_id}/revoke", status_code=204)
def revoke_personal_session(
    session_id: str,
    body: CurrentPassword,
    request: Request,
    response: Response,
    db: DB,
    user: Principal,
) -> Response:
    # Acquire throttle locks before the shared identity lock, matching login/reset ordering.
    buckets = throttle(db, "session-reauth:" + user.id)
    lock_principal(db, request, user)
    if not verify_password(user, body.current_password):
        for bucket in buckets:
            bucket.failures += 1
        audit(db, request, "session_reauthentication_failed", user)
        db.commit()
        raise HTTPException(400, "invalid_current_password")
    item = db.scalar(
        select(UserSession).where(UserSession.id == session_id, UserSession.user_id == user.id)
    )
    if item is None:
        raise HTTPException(404, "session_not_found")
    is_current = item.token_digest == request.state.session.token_digest
    db.delete(item)
    audit(db, request, "personal_session_revoked", user, {"sessionId": item.id})
    if is_current:
        response.delete_cookie("lms_session", path="/")
        response.delete_cookie("lms_csrf", path="/")
    response.status_code = 204
    return response
