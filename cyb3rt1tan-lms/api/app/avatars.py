"""Bounded static PNG avatars: metadata-free re-encoding and private, reauthorized reads."""

import hashlib
import io
import uuid
import warnings

from fastapi import APIRouter, HTTPException, Request, Response
from PIL import Image, PngImagePlugin, UnidentifiedImageError

from .auth import DB, Principal, audit, lock_principal
from .identity_views import PersonalProfile
from .models import UserAvatar, now
from .self_service import profile

router = APIRouter(prefix="/v1/me")
MAXIMUM = 1000000
SIZE = (512, 512)
PngImagePlugin.MAX_TEXT_CHUNK = 16384
PngImagePlugin.MAX_TEXT_MEMORY = 65536


def sanitized_png(raw: bytes) -> bytes:
    if len(raw) > MAXIMUM:
        raise HTTPException(413, "avatar_too_large")
    if not raw.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(415, "avatar_png_required")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw), formats=["PNG"]) as image:
                if image.size != SIZE or getattr(image, "is_animated", False):
                    raise HTTPException(422, "avatar_dimensions_invalid")
                image.verify()
            with Image.open(io.BytesIO(raw), formats=["PNG"]) as image:
                image.load()
                clean = Image.new("RGBA", SIZE)
                clean.paste(image.convert("RGBA"))
                buffer = io.BytesIO()
                clean.save(buffer, format="PNG", compress_level=6)
                encoded = buffer.getvalue()
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        SyntaxError,
        Image.DecompressionBombWarning,
        Image.DecompressionBombError,
    ):
        raise HTTPException(422, "avatar_invalid") from None
    if len(encoded) > MAXIMUM:
        raise HTTPException(413, "avatar_too_large")
    return encoded


def image_response(avatar: UserAvatar) -> Response:
    return Response(
        avatar.content,
        media_type="image/png",
        headers={
            "Content-Disposition": 'inline; filename="avatar.png"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Cross-Origin-Resource-Policy": "same-origin",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )


def match(request: Request, revision: int) -> None:
    if request.headers.get("if-match") is None:
        raise HTTPException(428, "profile_revision_required")
    if request.headers["if-match"] != f'"{revision}"':
        raise HTTPException(409, "stale_account")


@router.put("/avatar", response_model=PersonalProfile)
async def upload(request: Request, db: DB, user: Principal) -> dict[str, object]:
    if request.headers.get("content-type", "").split(";")[0] != "image/png":
        raise HTTPException(415, "avatar_png_required")
    # Bounded decoding precedes the global lock. Reauthorize and recheck revision before persistence.
    encoded = sanitized_png(await request.body())
    lock_principal(db, request, user)
    match(request, user.revision)
    avatar = db.get(UserAvatar, user.id)
    if avatar is None:
        avatar = UserAvatar(user_id=user.id)
        db.add(avatar)
    avatar.id, avatar.content = str(uuid.uuid4()), encoded
    avatar.digest, avatar.created_at = hashlib.sha256(encoded).hexdigest(), now()
    user.revision += 1
    audit(db, request, "avatar_updated", user, {"avatarId": avatar.id})
    db.flush()
    return profile(db, user)


@router.delete("/avatar", response_model=PersonalProfile)
def remove(request: Request, db: DB, user: Principal) -> dict[str, object]:
    lock_principal(db, request, user)
    match(request, user.revision)
    avatar = db.get(UserAvatar, user.id)
    if avatar is not None:
        db.delete(avatar)
        user.revision += 1
        audit(db, request, "avatar_removed", user, {"avatarId": avatar.id})
        db.flush()
    return profile(db, user)


@router.get("/avatar/{avatar_id}")
def own_avatar(avatar_id: uuid.UUID, request: Request, db: DB, user: Principal) -> Response:
    lock_principal(db, request, user)
    avatar = db.get(UserAvatar, user.id)
    if avatar is None or avatar.id != str(avatar_id):
        raise HTTPException(404, "avatar_not_found")
    return image_response(avatar)
