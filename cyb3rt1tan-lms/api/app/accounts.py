"""Admin account lifecycle, invitation delivery and one-time acceptance."""

import secrets
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request, Response
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session

from . import mail, mfa
from .auth import (
    DB,
    Admin,
    audit,
    establish,
    lock_admin,
    lock_identity,
    reject,
    revoke_sessions,
    throttle,
)
from .identity_dto import (
    AcceptInvitation,
    InvitationRequest,
    ProvisioningSource,
    Reason,
    Role,
    RoleChange,
)
from .models import Invitation, MfaMethod, User, UserSession, now
from .security import digest, passwords, utc

router = APIRouter(prefix="/v1")


def account(user: User) -> dict[str, object]:
    return {
        "id": user.id,
        "username": user.username,
        "officialName": user.official_name,
        "email": user.email,
        "institutionalId": user.institutional_id,
        "status": user.status,
        "roles": user.roles,
        "facultyId": user.faculty_id,
        "source": user.provisioning_source,
    }


def target(db: Session, user_id: UUID) -> User:
    user = db.get(User, str(user_id))
    if user is None:
        raise HTTPException(404, "account_not_found")
    return user


@router.get("/admin/identity/status")
def identity_status(user: Admin) -> dict[str, bool]:
    try:
        mfa.cipher()
        configured_mfa = True
    except HTTPException:
        configured_mfa = False
    return {"smtpConfigured": mail.configured(), "mfaConfigured": configured_mfa}


@router.get("/admin/users")
def search(
    db: DB,
    user: Admin,
    query: str = Query(default="", max_length=200),
    role: Role | None = None,
    status: str | None = None,
    courseId: str | None = Query(default=None, max_length=36),
    cursor: UUID | None = None,
    pageSize: int = Query(default=25, ge=1, le=100),
    facultyId: str | None = Query(default=None, max_length=128),
    source: ProvisioningSource | None = None,
) -> dict[str, object]:
    if status and status not in {"invited", "active", "suspended", "closed"}:
        raise HTTPException(400, "invalid_status")
    statement = select(User).order_by(User.id)
    if facultyId is not None:
        statement = statement.where(User.faculty_id == facultyId)
    if source is not None:
        statement = statement.where(User.provisioning_source == source)
    if courseId is not None:
        from .models import CourseMembership

        statement = statement.where(
            User.id.in_(
                select(CourseMembership.user_id).where(
                    CourseMembership.course_id == courseId,
                    CourseMembership.status.in_(["active", "invited"]),
                )
            )
        )
    if cursor:
        statement = statement.where(User.id > str(cursor))
    if query:
        term = (
            "%"
            + query.strip().lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            + "%"
        )
        statement = statement.where(
            or_(
                *(
                    func.lower(column).like(term, escape="\\")
                    for column in [
                        User.username,
                        User.email,
                        User.official_name,
                        User.institutional_id,
                    ]
                )
            )
        )
    if status:
        statement = statement.where(User.status == status)
    # Bounded pages with role filtering; never return credentials, tokens or MFA secrets.
    if role:
        statement = statement.where(
            cast(User.roles, String).contains('"' + role + '"', autoescape=True)
        )
    records = list(db.scalars(statement.limit(pageSize + 1)))
    return {
        "items": [account(record) for record in records[:pageSize]],
        "nextCursor": records[pageSize - 1].id if len(records) > pageSize else None,
    }


@router.get("/admin/users/{user_id}")
def detail(user_id: UUID, db: DB, user: Admin) -> dict[str, object]:
    selected = target(db, user_id)
    method = db.get(MfaMethod, selected.id)
    return {
        **account(selected),
        "revision": selected.revision,
        "createdAt": utc(selected.created_at).isoformat(),
        "mfaEnabled": bool(method and method.confirmed),
    }


@router.patch("/admin/users/{user_id}/roles")
def roles(
    user_id: UUID, body: RoleChange, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    lock_admin(db, request, user)
    selected = target(db, user_id)
    if selected.revision != body.expectedRevision:
        raise HTTPException(409, "stale_account")
    if selected.id == user.id and "admin" not in body.roles:
        raise HTTPException(409, "cannot_remove_own_admin")
    before = list(selected.roles)
    selected.roles = list(body.roles)
    revoke_sessions(db, selected)
    audit(
        db,
        request,
        "account_roles_changed",
        user,
        {
            "userId": selected.id,
            "beforeRoles": before,
            "afterRoles": selected.roles,
            "reason": body.reason,
        },
    )
    db.flush()
    return {
        **account(selected),
        "revision": selected.revision,
        "createdAt": utc(selected.created_at).isoformat(),
        "mfaEnabled": bool((method := db.get(MfaMethod, selected.id)) and method.confirmed),
    }


@router.post("/admin/users/{user_id}/suspensions")
def suspend(user_id: UUID, body: Reason, request: Request, db: DB, user: Admin) -> dict[str, str]:
    lock_admin(db, request, user)
    selected = target(db, user_id)
    if selected.id == user.id:
        raise HTTPException(409, "cannot_suspend_self")
    if selected.status != "active":
        raise HTTPException(409, "invalid_account_state")
    selected.status = "suspended"
    revoke_sessions(db, selected)
    audit(db, request, "account_suspended", user, {"userId": selected.id, "reason": body.reason})
    return {"id": selected.id, "status": selected.status}


@router.post("/admin/users/{user_id}/restore")
def restore(user_id: UUID, body: Reason, request: Request, db: DB, user: Admin) -> dict[str, str]:
    lock_admin(db, request, user)
    selected = target(db, user_id)
    if selected.status != "suspended":
        raise HTTPException(409, "invalid_account_state")
    selected.status = "active"
    audit(db, request, "account_restored", user, {"userId": selected.id, "reason": body.reason})
    return {"id": selected.id, "status": selected.status}


@router.get("/admin/users/{user_id}/sessions")
def sessions(user_id: UUID, db: DB, user: Admin) -> dict[str, object]:
    selected = target(db, user_id)
    return {
        "items": [
            {
                "id": row.id,
                "createdAt": utc(row.created_at).isoformat(),
                "expiresAt": utc(row.expires_at).isoformat(),
                "mfaAuthenticated": row.mfa_authenticated,
            }
            for row in db.scalars(
                select(UserSession).where(
                    UserSession.user_id == selected.id, UserSession.expires_at > now()
                )
            )
        ]
    }


@router.post("/admin/users/{user_id}/sessions/revocations")
def revoke(user_id: UUID, body: Reason, request: Request, db: DB, user: Admin) -> dict[str, object]:
    lock_admin(db, request, user)
    selected = target(db, user_id)
    count = revoke_sessions(db, selected)
    audit(
        db,
        request,
        "account_sessions_revoked",
        user,
        {"userId": selected.id, "reason": body.reason},
    )
    return {"userId": selected.id, "revokedSessions": count}


@router.post("/admin/users/{user_id}/mfa-resets", status_code=202)
def reset_mfa(
    user_id: UUID, body: Reason, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    lock_admin(db, request, user)
    selected = target(db, user_id)
    if selected.id == user.id:
        raise HTTPException(409, "cannot_reset_own_mfa")
    mfa.reset(db, selected)
    revoke_sessions(db, selected)
    audit(db, request, "account_mfa_reset", user, {"userId": selected.id, "reason": body.reason})
    return {"userId": selected.id, "mfaReset": True}


def prepare_invitation(
    db: Session,
    email: str,
    role: str,
    actor: User,
    user_id: str | None = None,
    expires_at: datetime | None = None,
) -> tuple[Invitation, str]:
    for previous in db.scalars(
        select(Invitation).where(
            Invitation.email == email,
            Invitation.consumed_at.is_(None),
            Invitation.revoked_at.is_(None),
        )
    ):
        if utc(previous.expires_at) > now():
            raise HTTPException(409, "invitation_already_pending")
        previous.revoked_at = now()
    db.flush()
    token = secrets.token_urlsafe(48)
    expires = expires_at or now() + timedelta(days=2)
    if expires.tzinfo is None or not now() < utc(expires) <= now() + timedelta(days=7):
        raise HTTPException(400, "invalid_invitation_expiry")
    invitation = Invitation(
        token_digest=digest(token),
        email=email,
        role=role,
        user_id=user_id,
        created_by=actor.id,
        expires_at=expires,
        delivered=False,
    )
    db.add(invitation)
    db.flush()
    return invitation, token


def deliver(db: Session, request: Request, invitation: Invitation, token: str, actor: User) -> bool:
    try:
        mail.deliver_invitation(invitation.email, token)
    except HTTPException:
        invitation.revoked_at = now()
        audit(db, request, "invitation_delivery_failed", actor, {"invitationId": invitation.id})
        db.commit()
        return False
    invitation.delivered = True
    audit(db, request, "invitation_sent", actor, {"invitationId": invitation.id})
    db.commit()
    return True


@router.post("/admin/invitations", status_code=202)
def invite(body: InvitationRequest, request: Request, db: DB, user: Admin) -> dict[str, str]:
    lock_admin(db, request, user)
    if body.courseId is not None:
        raise HTTPException(501, "course_invitation_unavailable")
    if not mail.configured():
        raise HTTPException(503, "smtp_not_configured")
    existing = db.scalar(select(User).where(User.email == body.email))
    if existing and existing.status != "invited":
        raise HTTPException(409, "account_already_exists")
    if existing and body.role not in existing.roles:
        raise HTTPException(409, "invitation_role_mismatch")
    invitation, token = prepare_invitation(
        db, body.email, body.role, user, existing.id if existing else None, body.expiresAt
    )
    audit(db, request, "invitation_created", user, {"invitationId": invitation.id})
    db.commit()
    if not deliver(db, request, invitation, token, user):
        raise HTTPException(503, "invitation_delivery_failed")
    return {
        "invitationId": invitation.id,
        "expiresAt": utc(invitation.expires_at).isoformat(),
        "deliveryStatus": "sent",
    }


@router.post("/auth/accept-invitation", status_code=201)
def accept(
    body: AcceptInvitation, request: Request, response: Response, db: DB
) -> dict[str, object]:
    buckets = throttle(
        db, "invitation-network:" + (request.client.host if request.client else "local")
    )
    lock_identity(db)
    invitation = db.scalar(
        select(Invitation).where(Invitation.token_digest == digest(body.token)).with_for_update()
    )
    if (
        invitation is None
        or invitation.revoked_at
        or invitation.consumed_at
        or not invitation.delivered
        or utc(invitation.expires_at) <= now()
    ):
        reject(db, buckets, request, "invitation_invalid_or_expired")
    assert invitation is not None
    existing = db.scalar(select(User).where(User.username == body.username))
    user = db.get(User, invitation.user_id) if invitation.user_id else None
    if existing and (user is None or existing.id != user.id):
        raise HTTPException(409, "username_unavailable")
    if user is None:
        if db.scalar(select(User).where(User.email == invitation.email)):
            raise HTTPException(409, "account_already_exists")
        user = User(
            provisioning_source="invitation",
            email=invitation.email,
            roles=[invitation.role],
            username=body.username,
            official_name=body.official_name.strip(),
            password_hash=passwords.hash(body.password),
        )
        db.add(user)
    elif user.status != "invited":
        raise HTTPException(409, "account_already_exists")
    else:
        if user.email != invitation.email or invitation.role not in user.roles:
            raise HTTPException(409, "invitation_invalid_or_expired")
        user.username = body.username
        user.official_name = body.official_name.strip()
        user.password_hash = passwords.hash(body.password)
        user.status = "active"
    if not user.official_name:
        raise HTTPException(422, "validation_failed")
    db.flush()
    invitation.consumed_at = now()
    audit(db, request, "invitation_accepted", user, {"invitationId": invitation.id})
    if mfa.required(db, user):
        return {
            "user": {
                key: value
                for key, value in account(user).items()
                if key in {"id", "username", "officialName", "roles"}
            },
            "mfaEnrollmentRequired": True,
        }
    return establish(db, user, response)
