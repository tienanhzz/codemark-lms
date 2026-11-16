"""Authenticated local workspace, account preferences and operational boundaries."""

import asyncio
import re
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from argon2.exceptions import VerificationError
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import RequestResponseEndpoint
from starlette.responses import Response as StarletteResponse

from .auth import (
    ALLOWED_ORIGIN,
    DB,
    Principal,
    audit,
    authenticate,
    lock_principal,
    public_user,
    revoke_sessions,
    throttle,
)
from .database import settings
from .models import AuditEvent, Preference, User, UserAvatar
from .realtime import asgi_app
from .security import passwords, utc


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    dispatcher: asyncio.Task[None] | None = None
    if settings.environment != "test":
        from .realtime_dispatch import dispatcher_loop

        dispatcher = asyncio.create_task(dispatcher_loop())
    try:
        yield
    finally:
        if dispatcher is not None:
            dispatcher.cancel()
            try:
                await dispatcher
            except asyncio.CancelledError:
                pass


app = FastAPI(
    title="CodeMark Core", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan
)
socket_app = asgi_app(app)
PALETTES = Literal[
    "navy-cyan-gold",
    "ocean-teal",
    "indigo-cyan",
    "forest-lime",
    "rose-slate",
    "sunset-coral",
    "violet-amber",
    "graphite-cyan",
]


class Preferences(BaseModel):
    model_config = ConfigDict(extra="forbid")
    locale: Literal["en", "vi"] = "en"
    theme: Literal["light", "dark"] = "light"
    colorPalette: PALETTES = "navy-cyan-gold"
    timeZone: str = Field(default="Asia/Bangkok", max_length=64)
    textScale: Literal["default", "large"] = "default"
    highContrast: bool = False
    reducedMotion: bool = False
    captionsEnabled: bool = False


class Login(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=1024)
    mfa_code: str | None = Field(default=None, pattern=r"^[0-9]{6}$")
    recovery_code: str | None = Field(default=None, min_length=8, max_length=32)


class PasswordChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: str = Field(max_length=1024)
    new_password: str = Field(min_length=12, max_length=128)


@app.exception_handler(IntegrityError)
@app.exception_handler(StaleDataError)
async def write_conflict(request: Request, _error: Exception) -> JSONResponse:
    return JSONResponse(
        {
            "error": {
                "code": "stale_account",
                "message": "The resource changed. Reload before retrying.",
            },
            "requestId": request.state.request_id,
        },
        status_code=409,
    )


@app.middleware("http")
async def request_boundary(
    request: Request, call_next: RequestResponseEndpoint
) -> StarletteResponse:
    request.state.request_id = str(uuid.uuid4())
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        if request.headers.get("origin") != ALLOWED_ORIGIN:
            return JSONResponse(
                {
                    "error": {"code": "origin_rejected", "message": "Origin rejected."},
                    "requestId": request.state.request_id,
                },
                status_code=403,
            )
        chunks = bytearray()
        async for chunk in request.stream():
            chunks.extend(chunk)
            maximum = (
                2000000
                if request.url.path == "/v1/admin/branding/logos"
                else 1000000
                if request.url.path == "/v1/me/avatar"
                or re.fullmatch(
                    r"/v1/admin/csv-imports/[0-9a-f-]{36}/(?:preview|commit)", request.url.path
                )
                else 65536
            )
            if len(chunks) > maximum:
                return JSONResponse(
                    {
                        "error": {"code": "request_too_large", "message": "Request too large."},
                        "requestId": request.state.request_id,
                    },
                    status_code=413,
                )
        request._body = bytes(chunks)
    response = await call_next(request)
    response.headers.update(
        {
            "Cache-Control": "no-store",
            "X-Request-ID": request.state.request_id,
            "X-Content-Type-Options": "nosniff",
        }
    )
    return response


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, error: StarletteHTTPException) -> JSONResponse:
    return JSONResponse(
        {
            "error": {"code": str(error.detail), "message": str(error.detail)},
            "requestId": request.state.request_id,
        },
        status_code=error.status_code,
    )


@app.exception_handler(RequestValidationError)
async def invalid_request(request: Request, _error: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        {
            "error": {"code": "validation_failed", "message": "Check the submitted values."},
            "requestId": request.state.request_id,
        },
        status_code=422,
    )


@app.get("/health/ready")
def ready(db: DB) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ready", "build": "master-kit-local", "database": "postgresql"}


@app.get("/v1/me")
def me(user: Principal, db: DB) -> dict[str, object]:
    avatar_id = db.scalar(select(UserAvatar.id).where(UserAvatar.user_id == user.id))
    return {**public_user(user), "avatarUrl": f"/v1/me/avatar/{avatar_id}" if avatar_id else None}


@app.post("/v1/auth/logout", status_code=204)
def logout(request: Request, response: Response, db: DB, user: Principal) -> Response:
    db.delete(request.state.session)
    audit(db, request, "logout", user)
    response.delete_cookie("lms_session", path="/")
    response.delete_cookie("lms_csrf", path="/")
    response.status_code = 204
    return response


@app.post("/v1/me/password", status_code=204)
def change_password(
    body: PasswordChange, request: Request, response: Response, db: DB, user: Principal
) -> Response:
    buckets = throttle(db, "password-reauth:" + user.id)
    lock_principal(db, request, user)
    try:
        passwords.verify(user.password_hash, body.current_password)
    except VerificationError:
        for bucket in buckets:
            bucket.failures += 1
        audit(db, request, "password_reauthentication_failed", user)
        db.commit()
        raise HTTPException(400, "invalid_current_password") from None
    if not body.new_password.strip():
        raise HTTPException(422, "validation_failed")
    if body.new_password == body.current_password:
        raise HTTPException(400, "password_must_differ")
    user.password_hash = passwords.hash(body.new_password)
    from .recovery import revoke_resets

    revoke_resets(db, user.id)
    revoke_sessions(db, user)
    audit(db, request, "password_changed", user)
    response.delete_cookie("lms_session", path="/")
    response.delete_cookie("lms_csrf", path="/")
    response.status_code = 204
    return response


@app.get("/v1/me/preferences")
def get_preferences(db: DB, user: Principal) -> dict[str, object]:
    preference = db.get(Preference, user.id)
    return preference.settings if preference else Preferences().model_dump()


@app.put("/v1/me/preferences")
def set_preferences(
    body: Preferences, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    try:
        ZoneInfo(body.timeZone)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(422, "invalid_timezone") from None
    preference = db.get(Preference, user.id)
    if preference is None:
        preference = Preference(user_id=user.id, settings={})
        db.add(preference)
    preference.settings = body.model_dump()
    audit(db, request, "preferences_updated", user)
    return preference.settings


@app.get("/v1/workspace/summary")
def summary(db: DB, user: Principal) -> dict[str, object]:
    from .courses import courses

    course_items = courses(db, user, query="", pageSize=5)["items"]
    from .course_access import visibility
    from .models import Assessment, AssessmentRecipient, Course

    count = db.scalar(select(func.count(Course.id)).where(visibility(user))) or 0
    admin = "admin" in user.roles
    if admin:
        assessment_count = db.scalar(select(func.count(Assessment.id))) or 0
    elif "student" in user.roles:
        assessment_count = (
            db.scalar(
                select(func.count(func.distinct(AssessmentRecipient.assessment_id))).where(
                    AssessmentRecipient.user_id == user.id,
                    AssessmentRecipient.status.in_(["pending", "inProgress"]),
                )
            )
            or 0
        )
    else:
        assessment_count = (
            db.scalar(
                select(func.count(Assessment.id)).where(
                    Assessment.course_id.in_(select(Course.id).where(visibility(user)))
                )
            )
            or 0
        )
    result: dict[str, object] = {
        "build": "master-kit-local",
        "courses": course_items,
        "activity": [],
        "metrics": {"courses": count, "assessments": assessment_count},
        "isAdmin": admin,
    }
    if admin:
        result["metrics"] = {
            "accounts": db.scalar(select(func.count(User.id)).where(User.status == "active")),
            "courses": count,
            "assessments": assessment_count,
        }
        events = db.scalars(select(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(8))
    else:
        events = db.scalars(
            select(AuditEvent)
            .where(AuditEvent.actor_id == user.id)
            .order_by(AuditEvent.created_at.desc())
            .limit(8)
        )
    result["activity"] = [
        {"id": e.id, "action": e.action, "createdAt": utc(e.created_at).isoformat()} for e in events
    ]
    return result


@app.post("/v1/auth/login")
def login(body: Login, request: Request, response: Response, db: DB) -> dict[str, object]:
    return authenticate(
        db, request, response, body.username, body.password, body.mfa_code, body.recovery_code
    )


from .account_exports import router as exports_router
from .accounts import router as accounts_router
from .achievements import router as achievements_router
from .assessments import router as assessments_router
from .attendance import router as attendance_router
from .audit_views import router as audit_views_router
from .avatars import router as avatars_router
from .branding import router as branding_router
from .clans import router as clans_router
from .course_academics import router as academics_router
from .course_planning import router as planning_router
from .courses import router as course_router
from .csv_imports import router as csv_router
from .economy import router as economy_router
from .learning_overview import router as learning_overview_router
from .lesson_progress import router as lesson_progress_router
from .marketplace import router as marketplace_router
from .marketplace_disputes import router as marketplace_disputes_router
from .mfa_routes import router as mfa_router
from .missions import router as missions_router
from .notifications import router as notifications_router
from .operations import router as operations_router
from .practice import router as practice_router
from .profile_support import router as support_router
from .question_assets import router as question_assets_router
from .questions import router as questions_router
from .recovery import router as recovery_router
from .reports import router as reports_router
from .runner_queue_routes import router as runner_queue_router
from .self_service import router as self_service_router
from .shop import router as shop_router
from .staff_events import router as staff_events_router
from .taxonomy import router as taxonomy_router
from .teaching_team import router as team_router

app.include_router(accounts_router)
app.include_router(achievements_router)
app.include_router(attendance_router)
app.include_router(learning_overview_router)
app.include_router(lesson_progress_router)
app.include_router(reports_router)
app.include_router(assessments_router)
app.include_router(audit_views_router)
app.include_router(economy_router)
app.include_router(missions_router)
app.include_router(marketplace_router)
app.include_router(marketplace_disputes_router)
app.include_router(notifications_router)
app.include_router(shop_router)
app.include_router(staff_events_router)
app.include_router(exports_router)
app.include_router(mfa_router)
app.include_router(csv_router)
app.include_router(course_router)
app.include_router(planning_router)
app.include_router(clans_router)
app.include_router(academics_router)
app.include_router(operations_router)
app.include_router(practice_router)
app.include_router(recovery_router)
app.include_router(self_service_router)
app.include_router(avatars_router)
app.include_router(branding_router)
app.include_router(support_router)
app.include_router(team_router)
app.include_router(taxonomy_router)
app.include_router(questions_router)
app.include_router(question_assets_router)
app.include_router(runner_queue_router)
