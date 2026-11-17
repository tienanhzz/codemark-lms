"""Bounded, immutable question asset storage with course authorization."""

import hashlib
import io
import uuid

from fastapi import APIRouter, HTTPException, Request, Response
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select

from .auth import DB, Principal, audit
from .course_access import course_for, permissions
from .models import Question, QuestionAsset, QuestionVersion

router = APIRouter(prefix="/v1")
MAX_BYTES = 2_000_000
AUDIO_TYPES = {"audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4"}
TEXT_TYPES = {"text/plain"}


async def bounded_body(request: Request) -> bytes:
    length = request.headers.get("content-length")
    if length and (not length.isdigit() or int(length) > MAX_BYTES):
        raise HTTPException(413, "question_asset_too_large")
    parts: list[bytes] = []
    size = 0
    async for part in request.stream():
        size += len(part)
        if size > MAX_BYTES:
            raise HTTPException(413, "question_asset_too_large")
        parts.append(part)
    if not size:
        raise HTTPException(422, "question_asset_empty")
    return b"".join(parts)


def normalized_image(content: bytes, content_type: str) -> tuple[bytes, str]:
    expected_format = {"image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WEBP"}.get(
        content_type
    )
    if expected_format is None:
        raise HTTPException(415, "question_asset_mime_mismatch")
    try:
        with Image.open(io.BytesIO(content)) as image:
            if image.format != expected_format or getattr(image, "n_frames", 1) != 1:
                raise HTTPException(415, "question_image_format_unsupported")
            image.verify()
        with Image.open(io.BytesIO(content)) as image:
            normalized = ImageOps.exif_transpose(image)
            if (
                normalized.width < 1
                or normalized.height < 1
                or normalized.width * normalized.height > 16_000_000
            ):
                raise HTTPException(413, "question_image_dimensions_exceeded")
            normalized.load()
            normalized = normalized.convert("RGBA" if "A" in normalized.getbands() else "RGB")
            output = io.BytesIO()
            normalized.save(output, format="PNG", optimize=True)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise HTTPException(415, "question_image_invalid") from exc
    result = output.getvalue()
    if len(result) > MAX_BYTES:
        raise HTTPException(413, "question_asset_too_large")
    return result, "image/png"


def validate_audio(content: bytes, content_type: str) -> None:
    valid = (
        (content_type == "audio/wav" and content[:4] == b"RIFF" and content[8:12] == b"WAVE")
        or (content_type == "audio/ogg" and content.startswith(b"OggS"))
        or (content_type == "audio/mp4" and content[4:8] == b"ftyp")
        or (
            content_type == "audio/mpeg"
            and (
                content.startswith(b"ID3")
                or (len(content) > 1 and content[0] == 0xFF and content[1] & 0xE0 == 0xE0)
            )
        )
    )
    if not valid:
        raise HTTPException(415, "question_audio_invalid")


def validate_text(content: bytes) -> None:
    try:
        value = content.decode("utf-8", errors="strict")
    except UnicodeDecodeError as exc:
        raise HTTPException(415, "question_asset_text_invalid") from exc
    if any(ord(char) == 0 or (ord(char) < 32 and char not in "\r\n\t") for char in value):
        raise HTTPException(415, "question_asset_text_invalid")


@router.post("/courses/{course_id}/question-assets", status_code=201)
async def upload_question_asset(
    course_id: uuid.UUID,
    request: Request,
    db: DB,
    user: Principal,
    response: Response,
) -> dict[str, object]:
    course = course_for(db, course_id, user, "content.author", True)
    kind = request.headers.get("x-question-asset-kind", "")
    if kind not in {"image", "audio", "referenceSolution", "supportFile", "transcript"}:
        raise HTTPException(422, "question_asset_kind_invalid")
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    content = await bounded_body(request)
    if kind == "image":
        content, content_type = normalized_image(content, content_type)
    elif kind == "audio":
        if content_type not in AUDIO_TYPES:
            raise HTTPException(415, "question_asset_mime_mismatch")
        validate_audio(content, content_type)
    else:
        if content_type not in TEXT_TYPES:
            raise HTTPException(415, "question_asset_mime_mismatch")
        validate_text(content)
    item = QuestionAsset(
        id=str(uuid.uuid4()),
        course_id=course.id,
        created_by=user.id,
        asset_kind=kind,
        media_type=content_type,
        content=content,
        size=len(content),
        digest=hashlib.sha256(content).hexdigest(),
    )
    db.add(item)
    db.flush()
    audit(
        db,
        request,
        "question_asset_uploaded",
        user,
        {"courseId": course.id, "assetId": item.id, "kind": kind, "size": item.size},
    )
    response.headers["Cache-Control"] = "no-store"
    return {
        "assetId": item.id,
        "kind": item.asset_kind,
        "mediaType": item.media_type,
        "size": item.size,
        "digest": item.digest,
    }


def contains_id(value: object, asset_id: str) -> bool:
    if value == asset_id:
        return True
    if isinstance(value, dict):
        return any(contains_id(item, asset_id) for item in value.values())
    if isinstance(value, list):
        return any(contains_id(item, asset_id) for item in value)
    return False


@router.get("/question-assets/{asset_id}")
def get_question_asset(
    asset_id: uuid.UUID, db: DB, user: Principal, response: Response
) -> Response:
    item = db.get(QuestionAsset, str(asset_id))
    if item is None:
        raise HTTPException(404, "question_asset_not_found")
    course = course_for(db, uuid.UUID(item.course_id), user)
    can_author = "content.author" in permissions(db, course, user)
    if not can_author:
        if item.asset_kind not in {"image", "audio"}:
            raise HTTPException(404, "question_asset_not_found")
        versions = db.scalars(
            select(QuestionVersion).where(
                QuestionVersion.status == "published",
                QuestionVersion.question_id.in_(
                    select(Question.id).where(Question.course_id == course.id)
                ),
            )
        )
        if not any(contains_id(version.content, item.id) for version in versions):
            raise HTTPException(404, "question_asset_not_found")
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return Response(
        content=item.content,
        media_type=item.media_type,
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )
