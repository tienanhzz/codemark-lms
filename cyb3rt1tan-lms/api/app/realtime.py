"""Authenticated Socket.IO invalidation hints backed by the shared Redis manager."""

import asyncio
import os
from collections.abc import Mapping
from http.cookies import CookieError, SimpleCookie
from typing import Any

import socketio  # type: ignore[import-untyped]
from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from .auth import ALLOWED_ORIGIN
from .database import SessionLocal
from .models import User, UserSession, now
from .security import digest, utc

REDIS_URL = os.environ.get("SOCKETIO_REDIS_URL", "redis://127.0.0.1:6379/0")
manager = socketio.AsyncRedisManager(
    REDIS_URL,
    channel="codemark-lms-realtime",
    redis_options={"socket_connect_timeout": 2, "socket_timeout": 3},
)
sio = socketio.AsyncServer(
    async_mode="asgi",
    client_manager=manager,
    cors_allowed_origins=[ALLOWED_ORIGIN],
    cors_credentials=True,
    logger=False,
    engineio_logger=False,
)
_connections: dict[str, str] = {}
_connections_lock = asyncio.Lock()
_guard_task: asyncio.Task[None] | None = None


def _authenticated_session(
    cookie_header: str,
    origin: str,
    session_factory: sessionmaker[Session] = SessionLocal,
) -> tuple[str, str] | None:
    if origin != ALLOWED_ORIGIN:
        return None
    cookies = SimpleCookie()
    try:
        cookies.load(cookie_header)
    except (CookieError, TypeError, ValueError):
        return None
    session_cookie = cookies.get("lms_session")
    if session_cookie is None or not session_cookie.value:
        return None
    session_digest = digest(session_cookie.value)
    with session_factory() as db:
        session = db.get(UserSession, session_digest)
        if session is None or utc(session.expires_at) <= now():
            return None
        user = db.get(User, session.user_id)
        if user is None or user.status != "active":
            return None
        from .mfa import required

        try:
            if required(db, user) and not session.mfa_authenticated:
                return None
        except (HTTPException, SQLAlchemyError):
            return None
        return user.id, session_digest


def _session_is_active(
    session_digest: str, session_factory: sessionmaker[Session] = SessionLocal
) -> bool:
    with session_factory() as db:
        session = db.get(UserSession, session_digest)
        if session is None or utc(session.expires_at) <= now():
            return False
        user = db.get(User, session.user_id)
        if user is None or user.status != "active":
            return False
        from .mfa import required

        try:
            return not required(db, user) or session.mfa_authenticated
        except (HTTPException, SQLAlchemyError):
            return False


async def _guard_sessions() -> None:
    global _guard_task
    try:
        while True:
            await asyncio.sleep(30)
            async with _connections_lock:
                current = list(_connections.items())
            if not current:
                return
            for sid, session_digest in current:
                active = await asyncio.to_thread(_session_is_active, session_digest)
                if not active:
                    await sio.disconnect(sid)
    finally:
        _guard_task = None


@sio.event  # type: ignore[untyped-decorator]
async def connect(sid: str, environ: Mapping[str, Any], auth: Any = None) -> bool:
    del auth  # Credentials are accepted only from the same-origin HttpOnly session cookie.
    identity = await asyncio.to_thread(
        _authenticated_session,
        str(environ.get("HTTP_COOKIE", "")),
        str(environ.get("HTTP_ORIGIN", "")),
    )
    if identity is None:
        return False
    _user_id, session_digest = identity
    async with _connections_lock:
        _connections[sid] = session_digest
    await sio.save_session(sid, {"sessionDigest": session_digest})
    global _guard_task
    if _guard_task is None or _guard_task.done():
        _guard_task = asyncio.create_task(_guard_sessions())
    return True


@sio.event  # type: ignore[untyped-decorator]
async def disconnect(sid: str, _reason: str | None = None) -> None:
    async with _connections_lock:
        _connections.pop(sid, None)


def asgi_app(other_asgi_app: Any) -> Any:
    return socketio.ASGIApp(sio, other_asgi_app=other_asgi_app, socketio_path="socket.io")
