"""MFA enrollment and role policy endpoints, including pre-login setup."""

from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import select, update

from . import mfa
from .auth import (
    DB,
    Admin,
    Principal,
    audit,
    establish,
    lock_admin,
    reject,
    revoke_sessions,
    throttle,
    verify_password,
)
from .identity_dto import (
    CurrentPassword,
    MfaCode,
    MfaDisable,
    Role,
    RoleMfaPolicy,
    SetupConfirm,
    SetupToken,
)
from .models import MfaChallenge, MfaMethod, MfaPolicy, User, now
from .security import ROLES, digest, utc

router = APIRouter(prefix="/v1")


@router.get("/me/security/mfa")
def status(db: DB, user: Principal) -> dict[str, bool]:
    method = db.get(MfaMethod, user.id)
    return {
        "enabled": bool(method and method.confirmed),
        "enrollmentPending": bool(
            method and not method.confirmed and utc(method.pending_expires_at) > now()
        ),
    }


@router.post("/me/security/mfa/enrollment")
def start(body: CurrentPassword, request: Request, db: DB, user: Principal) -> dict[str, str]:
    buckets = throttle(db, "mfa:" + user.id)
    if not verify_password(user, body.current_password):
        reject(db, buckets, request, "invalid_current_password", 400)
    result = mfa.begin(db, user)
    audit(db, request, "mfa_enrollment_started", user)
    return result


@router.post("/me/security/mfa/enrollment/confirm")
def confirm(
    body: MfaCode, request: Request, response: Response, db: DB, user: Principal
) -> dict[str, object]:
    buckets = throttle(db, "mfa:" + user.id)
    try:
        codes = mfa.confirm(db, user, body.code)
    except HTTPException as error:
        if error.status_code == 400:
            reject(db, buckets, request, str(error.detail), 400)
        raise
    revoke_sessions(db, user)
    audit(db, request, "mfa_enabled", user)
    response.delete_cookie("lms_session", path="/")
    response.delete_cookie("lms_csrf", path="/")
    return {"enabled": True, "recoveryCodes": codes}


@router.post("/me/security/mfa/disable", status_code=204)
def disable(
    body: MfaDisable, request: Request, response: Response, db: DB, user: Principal
) -> Response:
    buckets = throttle(db, "mfa:" + user.id)
    if mfa.required(db, user):
        raise HTTPException(409, "mfa_required_by_policy")
    if not verify_password(user, body.current_password) or not mfa.verify(
        db, user, body.code, None
    ):
        reject(db, buckets, request, "invalid_mfa_code", 400)
    mfa.reset(db, user)
    revoke_sessions(db, user)
    audit(db, request, "mfa_disabled", user)
    response.delete_cookie("lms_session", path="/")
    response.delete_cookie("lms_csrf", path="/")
    response.status_code = 204
    return response


def challenge_user(db: DB, token: str) -> tuple[MfaChallenge, User]:
    challenge = db.scalar(
        select(MfaChallenge).where(MfaChallenge.digest == digest(token)).with_for_update()
    )
    if challenge is None or challenge.consumed or utc(challenge.expires_at) <= now():
        raise HTTPException(400, "mfa_challenge_expired")
    user = db.get(User, challenge.user_id)
    if user is None or user.status != "active":
        raise HTTPException(400, "mfa_challenge_expired")
    return challenge, user


@router.post("/auth/mfa/enrollment")
def required_start(body: SetupToken, request: Request, db: DB) -> dict[str, str]:
    _, user = challenge_user(db, body.setup_token)
    throttle(db, "mfa:" + user.id)
    result = mfa.begin(db, user)
    audit(db, request, "mfa_enrollment_started", user)
    return result


@router.post("/auth/mfa/enrollment/confirm")
def required_confirm(
    body: SetupConfirm, request: Request, response: Response, db: DB
) -> dict[str, object]:
    challenge, user = challenge_user(db, body.setup_token)
    buckets = throttle(db, "mfa:" + user.id)
    try:
        codes = mfa.confirm(db, user, body.code)
    except HTTPException as error:
        if error.status_code == 400:
            reject(db, buckets, request, str(error.detail), 400)
        raise
    consumed = db.scalar(
        update(MfaChallenge)
        .where(MfaChallenge.digest == challenge.digest, MfaChallenge.consumed.is_(False))
        .values(consumed=True)
        .returning(MfaChallenge.digest)
    )
    if consumed is None:
        raise HTTPException(409, "mfa_challenge_expired")
    revoke_sessions(db, user)
    audit(db, request, "mfa_enabled", user)
    result = establish(db, user, response, True)
    result["recoveryCodes"] = codes
    return result


@router.get("/admin/security/mfa-policies")
def policies(db: DB, user: Admin) -> dict[str, object]:
    stored = {policy.role: policy.required for policy in db.scalars(select(MfaPolicy))}
    return {
        "items": [{"role": role, "required": stored.get(role, False)} for role in sorted(ROLES)]
    }


@router.put("/admin/security/mfa-policies/{role}")
def policy(
    role: Role, body: RoleMfaPolicy, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    lock_admin(db, request, user)
    if role == "admin" and body.required and not request.state.session.mfa_authenticated:
        raise HTTPException(409, "mfa_verified_session_required")
    row = db.get(MfaPolicy, role)
    if row is None:
        db.add(MfaPolicy(role=role, required=body.required))
    else:
        row.required = body.required
    for account in db.scalars(select(User)):
        if role in account.roles:
            revoke_sessions(db, account)
    audit(
        db,
        request,
        "mfa_policy_updated",
        user,
        {"role": role, "required": body.required, "reason": body.reason},
    )
    return {"role": role, "required": body.required}
