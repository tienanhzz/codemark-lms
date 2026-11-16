"""Audited platform logo versions with bounded decoding and same-origin reads."""

import hashlib
import io
import uuid
import warnings

from fastapi import APIRouter, HTTPException, Request, Response
from PIL import Image, UnidentifiedImageError
from sqlalchemy import func, select

from .auth import DB, Admin, audit, lock_admin
from .models import PlatformLogo, now

router = APIRouter(prefix="/v1")
MAX_BYTES = 2_000_000
SIZE = (1024, 1024)


def normalize_logo(raw: bytes) -> bytes:
    if not raw or len(raw) > MAX_BYTES or not raw.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(415, "cropped_png_required")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw), formats=["PNG"]) as image:
                if image.size != SIZE or getattr(image, "n_frames", 1) != 1:
                    raise HTTPException(422, "logo_dimensions_invalid")
                image.verify()
            with Image.open(io.BytesIO(raw), formats=["PNG"]) as image:
                image.load()
                mode = "RGBA" if "A" in image.getbands() else "RGB"
                clean = Image.new(mode, SIZE)
                clean.paste(image.convert(mode))
                output = io.BytesIO()
                clean.save(output, format="PNG", optimize=True)
                encoded = output.getvalue()
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        SyntaxError,
        Image.DecompressionBombWarning,
        Image.DecompressionBombError,
    ):
        raise HTTPException(422, "logo_image_invalid") from None
    if len(encoded) > MAX_BYTES:
        raise HTTPException(413, "logo_too_large")
    return encoded


def image_response(logo: PlatformLogo, *, immutable: bool = False) -> Response:
    return Response(
        logo.content,
        media_type="image/png",
        headers={
            "Content-Disposition": 'inline; filename="platform-logo.png"',
            "Cache-Control": "public, max-age=31536000, immutable" if immutable else "no-store",
            "X-Content-Type-Options": "nosniff",
            "Cross-Origin-Resource-Policy": "same-origin",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )


@router.get("/branding/logo")
def active_logo(db: DB) -> Response:
    logo = db.scalar(select(PlatformLogo).where(PlatformLogo.is_active.is_(True)))
    if logo is None:
        raise HTTPException(404, "platform_logo_not_configured")
    return image_response(logo)


@router.get("/branding/logos/{logo_id}")
def versioned_logo(logo_id: uuid.UUID, db: DB) -> Response:
    logo = db.get(PlatformLogo, str(logo_id))
    if logo is None:
        raise HTTPException(404, "platform_logo_not_found")
    return image_response(logo, immutable=True)


@router.get("/admin/branding/logos")
def logo_history(db: DB, _user: Admin) -> dict[str, object]:
    items = db.scalars(select(PlatformLogo).order_by(PlatformLogo.version.desc()).limit(100))
    return {
        "items": [
            {
                "id": logo.id,
                "version": logo.version,
                "digest": logo.digest,
                "isActive": logo.is_active,
                "createdAt": logo.created_at.isoformat(),
                "url": f"/v1/branding/logos/{logo.id}",
            }
            for logo in items
        ]
    }


@router.post("/admin/branding/logos", status_code=201)
async def upload_logo(request: Request, db: DB, user: Admin) -> dict[str, object]:
    if request.headers.get("content-type", "").split(";")[0].lower() != "image/png":
        raise HTTPException(415, "cropped_png_required")
    raw = await request.body()
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "logo_too_large")
    encoded = normalize_logo(raw)
    lock_admin(db, request, user)
    version = int(db.scalar(select(func.max(PlatformLogo.version))) or 0) + 1
    current = db.scalars(
        select(PlatformLogo).where(PlatformLogo.is_active.is_(True)).with_for_update()
    )
    for logo in current:
        logo.is_active = False
    db.flush()
    logo = PlatformLogo(
        id=str(uuid.uuid4()),
        version=version,
        content=encoded,
        digest=hashlib.sha256(encoded).hexdigest(),
        is_active=True,
        created_by_id=user.id,
        created_at=now(),
    )
    db.add(logo)
    audit(
        db,
        request,
        "platform_logo_activated",
        user,
        {"logoId": logo.id, "version": version, "digest": logo.digest},
    )
    db.flush()
    return {
        "id": logo.id,
        "version": logo.version,
        "digest": logo.digest,
        "isActive": logo.is_active,
        "createdAt": logo.created_at.isoformat(),
        "url": f"/v1/branding/logos/{logo.id}",
    }


@router.post("/admin/branding/logos/{logo_id}/activation")
def activate_logo(logo_id: uuid.UUID, request: Request, db: DB, user: Admin) -> dict[str, object]:
    lock_admin(db, request, user)
    logo = db.scalar(select(PlatformLogo).where(PlatformLogo.id == str(logo_id)).with_for_update())
    if logo is None:
        raise HTTPException(404, "platform_logo_not_found")
    if not logo.is_active:
        current = db.scalars(
            select(PlatformLogo).where(PlatformLogo.is_active.is_(True)).with_for_update()
        )
        for item in current:
            item.is_active = False
        db.flush()
        logo.is_active = True
        audit(
            db,
            request,
            "platform_logo_activated",
            user,
            {"logoId": logo.id, "version": logo.version, "digest": logo.digest},
        )
        db.flush()
    return {
        "id": logo.id,
        "version": logo.version,
        "digest": logo.digest,
        "isActive": logo.is_active,
        "createdAt": logo.created_at.isoformat(),
        "url": f"/v1/branding/logos/{logo.id}",
    }
