"""Recipient-scoped in-app notices, acknowledgements and sender aggregates."""

import hashlib
import json
import re
import uuid
from typing import Literal

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select

from .auth import DB, Admin, Principal, audit, lock_admin, lock_principal
from .course_access import course_for, lock_actor, permissions
from .mail import configured as mail_configured
from .models import (
    CourseMembership,
    CourseStaff,
    Notification,
    NotificationPreference,
    NotificationRecipient,
    NotificationTemplate,
    User,
    now,
)

router = APIRouter(prefix="/v1")
CHANNELS = {"inApp", "email", "realtime"}


class NotificationTemplateDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    templateId: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    version: int = Field(ge=1)
    eventKey: str = Field(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9._-]+$")
    locale: Literal["en", "vi"]
    mandatory: bool
    channels: list[Literal["inApp", "email", "realtime"]] = Field(min_length=1, max_length=3)
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=4000)

    def validate_policy(self) -> None:
        if len(set(self.channels)) != len(self.channels):
            raise HTTPException(422, "duplicate_notification_channel")
        if self.mandatory and "inApp" not in self.channels:
            raise HTTPException(422, "mandatory_notice_requires_in_app")


class Audience(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scope: Literal["system", "course"]
    courseId: uuid.UUID | None = None
    sectionId: str | None = Field(default=None, min_length=1, max_length=128)
    role: Literal["student", "teacher", "teachingAssistant"] | None = None


class NotificationSendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    eventKey: str = Field(min_length=1, max_length=80)
    audience: Audience
    severity: Literal["ordinary", "critical", "emergency"]
    templateId: str = Field(min_length=1, max_length=64)
    requireAcknowledgement: bool = False


class NotificationPreferencesDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    emailNonessential: bool = True
    inApp: Literal[True] = True
    locale: Literal["en", "vi"] = "en"


def _template_view(item: NotificationTemplate) -> dict[str, object]:
    return {
        "templateId": item.template_id,
        "version": item.version,
        "eventKey": item.event_key,
        "locale": item.locale,
        "mandatory": item.mandatory,
        "channels": item.channels,
        "subject": item.subject,
        "body": item.body,
        "createdAt": item.created_at.isoformat(),
    }


@router.get("/me/notification-preferences")
def get_notification_preferences(db: DB, user: Principal) -> dict[str, object]:
    preference = db.get(NotificationPreference, user.id)
    return {
        "emailNonessential": preference.email_nonessential if preference else True,
        "inApp": True,
        "locale": preference.locale if preference else "en",
    }


@router.put("/me/notification-preferences")
def update_notification_preferences(
    body: NotificationPreferencesDraft, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_principal(db, request, user)
    preference = db.get(NotificationPreference, user.id)
    if preference is None:
        preference = NotificationPreference(user_id=user.id)
        db.add(preference)
    preference.email_nonessential = body.emailNonessential
    preference.locale = body.locale
    preference.updated_at = now()
    audit(db, request, "notification_preferences_updated", user)
    db.flush()
    return {
        "emailNonessential": preference.email_nonessential,
        "inApp": True,
        "locale": preference.locale,
    }


@router.get("/admin/notification-templates")
def list_notification_templates(db: DB, _user: Admin) -> dict[str, object]:
    items = db.scalars(
        select(NotificationTemplate)
        .order_by(
            NotificationTemplate.template_id,
            NotificationTemplate.version.desc(),
            NotificationTemplate.locale,
        )
        .limit(500)
    )
    return {"items": [_template_view(item) for item in items]}


@router.post("/admin/notification-templates", status_code=201)
def create_notification_template(
    body: NotificationTemplateDraft, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    lock_admin(db, request, user)
    body.validate_policy()
    latest = int(
        db.scalar(
            select(func.max(NotificationTemplate.version)).where(
                NotificationTemplate.template_id == body.templateId,
                NotificationTemplate.locale == body.locale,
            )
        )
        or 0
    )
    if body.version != latest + 1:
        raise HTTPException(409, "notification_template_version_mismatch")
    item = NotificationTemplate(
        id=str(uuid.uuid4()),
        template_id=body.templateId,
        version=body.version,
        event_key=body.eventKey,
        locale=body.locale,
        mandatory=body.mandatory,
        channels=body.channels,
        subject=body.subject,
        body=body.body,
        author_id=user.id,
    )
    db.add(item)
    audit(
        db,
        request,
        "notification_template_created",
        user,
        {
            "templateId": item.template_id,
            "version": item.version,
            "locale": item.locale,
            "eventKey": item.event_key,
            "mandatory": item.mandatory,
            "channels": item.channels,
        },
    )
    db.flush()
    return _template_view(item)


def _recipients(db: DB, request: NotificationSendRequest) -> list[User]:
    if request.audience.scope == "system":
        if request.audience.courseId or request.audience.sectionId or request.audience.role:
            raise HTTPException(422, "system_audience_has_no_course_filters")
        return list(
            db.scalars(select(User).where(User.status == "active").order_by(User.id).limit(5000))
        )
    if request.audience.courseId is None:
        raise HTTPException(422, "course_audience_requires_course")
    course_id = str(request.audience.courseId)
    selected: set[str] = set()
    if request.audience.role in {None, "student"}:
        query = select(CourseMembership.user_id).where(
            CourseMembership.course_id == course_id,
            CourseMembership.status == "active",
        )
        if request.audience.sectionId:
            query = query.where(CourseMembership.section_id == request.audience.sectionId)
        selected.update(db.scalars(query))
    if request.audience.sectionId and request.audience.role not in {None, "student"}:
        raise HTTPException(422, "section_filter_only_supports_students")
    if request.audience.role in {None, "teacher", "teachingAssistant"}:
        query = select(CourseStaff.user_id).where(
            CourseStaff.course_id == course_id, CourseStaff.active.is_(True)
        )
        if request.audience.role:
            query = query.where(CourseStaff.role == request.audience.role)
        selected.update(db.scalars(query))
    return (
        list(
            db.scalars(
                select(User).where(User.id.in_(selected), User.status == "active").order_by(User.id)
            )
        )
        if selected
        else []
    )


def _send(
    body: NotificationSendRequest,
    request: Request,
    db: DB,
    user: Principal,
    idempotency_key: str,
    *,
    course_path_id: uuid.UUID | None = None,
) -> dict[str, object]:
    if not re.fullmatch(r"[A-Za-z0-9:._-]{8,160}", idempotency_key):
        raise HTTPException(422, "invalid_idempotency_key")
    if course_path_id is None:
        if "admin" not in user.roles or body.audience.scope != "system":
            raise HTTPException(403, "forbidden")
        lock_admin(db, request, user)
    else:
        lock_actor(db, request, user)
        course = course_for(db, course_path_id, user)
        if body.audience.scope != "course" or body.audience.courseId != course_path_id:
            raise HTTPException(422, "notification_course_scope_mismatch")
        if "events.manage" not in permissions(db, course, user):
            raise HTTPException(403, "forbidden")
    request_digest = hashlib.sha256(
        json.dumps(body.model_dump(mode="json"), sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    existing = db.scalar(
        select(Notification).where(
            Notification.sender_id == user.id, Notification.idempotency_key == idempotency_key
        )
    )
    if existing:
        if existing.request_digest != request_digest:
            raise HTTPException(409, "notification_idempotency_conflict")
        return {
            "id": existing.id,
            "recipientCount": db.scalar(
                select(func.count())
                .select_from(NotificationRecipient)
                .where(NotificationRecipient.notification_id == existing.id)
            )
            or 0,
        }
    query = select(NotificationTemplate).where(
        NotificationTemplate.template_id == body.templateId,
        NotificationTemplate.event_key == body.eventKey,
    )
    preferred_locale = db.get(NotificationPreference, user.id)
    preferred = preferred_locale.locale if preferred_locale else "en"
    template = db.scalar(
        query.where(NotificationTemplate.locale == preferred).order_by(
            NotificationTemplate.version.desc()
        )
    )
    if template is None:
        template = db.scalar(
            query.where(NotificationTemplate.locale == "en").order_by(
                NotificationTemplate.version.desc()
            )
        )
    if template is None:
        raise HTTPException(404, "notification_template_not_found")
    is_critical = body.severity in {"critical", "emergency"}
    channels = list(template.channels)
    if is_critical:
        channels = [channel for channel in channels if channel != "email"]
        if "inApp" not in channels:
            channels.append("inApp")
        if "realtime" not in channels:
            channels.append("realtime")
    mandatory = template.mandatory or is_critical
    require_ack = body.requireAcknowledgement or is_critical
    if mandatory and "inApp" not in channels:
        channels.append("inApp")
    if body.audience.scope == "system":
        users = list(
            db.scalars(select(User).where(User.status == "active").order_by(User.id).limit(5000))
        )
    else:
        users = _recipients(db, body)
    if not users:
        raise HTTPException(422, "notification_audience_empty")
    if len(users) >= 5000:
        raise HTTPException(413, "notification_audience_limit")
    notification = Notification(
        id=str(uuid.uuid4()),
        event_key=body.eventKey,
        template_id=body.templateId,
        severity=body.severity,
        mandatory=mandatory,
        require_acknowledgement=require_ack,
        channels=channels,
        audience_scope=body.audience.scope,
        course_id=str(course_path_id) if course_path_id else None,
        sender_id=user.id,
        idempotency_key=idempotency_key,
        request_digest=request_digest,
        created_at=now(),
    )
    db.add(notification)
    db.flush()
    pref_rows = {
        item.user_id: item
        for item in db.scalars(
            select(NotificationPreference).where(
                NotificationPreference.user_id.in_([item.id for item in users])
            )
        )
    }
    recipients = []
    for recipient in users:
        pref = pref_rows.get(recipient.id)
        recipient_locale = pref.locale if pref else "en"
        localized = None
        if recipient_locale != template.locale:
            localized = db.scalar(
                select(NotificationTemplate)
                .where(
                    NotificationTemplate.template_id == template.template_id,
                    NotificationTemplate.event_key == template.event_key,
                    NotificationTemplate.locale == recipient_locale,
                    NotificationTemplate.mandatory == template.mandatory,
                )
                .order_by(NotificationTemplate.version.desc())
            )
            if localized and set(localized.channels) != set(template.channels):
                localized = None
        message_template = localized or template
        email_status = "not_requested"
        email_last_error = None
        if "email" in channels and not mandatory and pref and not pref.email_nonessential:
            email_status = "suppressed"
        elif "email" in channels:
            if mail_configured():
                email_status = "queued"
            else:
                email_status = "failed"
                email_last_error = "smtp_not_configured"
        recipients.append(
            NotificationRecipient(
                notification_id=notification.id,
                user_id=recipient.id,
                template_version=message_template.version,
                locale=message_template.locale,
                subject=message_template.subject,
                body=message_template.body,
                email_status=email_status,
                email_last_error=email_last_error,
            )
        )
    db.add_all(recipients)
    audit(
        db,
        request,
        "notification_sent",
        user,
        {
            "notificationId": notification.id,
            "eventKey": body.eventKey,
            "scope": body.audience.scope,
            "courseId": notification.course_id,
            "severity": body.severity,
            "recipientCount": len(users),
            "requireAcknowledgement": require_ack,
            "channels": channels,
        },
    )
    db.flush()
    return {"id": notification.id, "recipientCount": len(users)}


@router.post("/admin/notifications", status_code=202)
def send_system_notification(
    body: NotificationSendRequest,
    request: Request,
    db: DB,
    user: Admin,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=160),
) -> dict[str, object]:
    return _send(body, request, db, user, idempotency_key)


@router.post("/courses/{course_id}/notifications", status_code=202)
def send_course_notification(
    course_id: uuid.UUID,
    body: NotificationSendRequest,
    request: Request,
    db: DB,
    user: Principal,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=160),
) -> dict[str, object]:
    return _send(body, request, db, user, idempotency_key, course_path_id=course_id)


@router.get("/me/notifications")
def list_my_notifications(
    db: DB,
    user: Principal,
    cursor: str | None = Query(default=None, max_length=36),
    pageSize: int = Query(default=20, ge=1, le=100),
    unreadOnly: bool = False,
) -> dict[str, object]:
    query = (
        select(NotificationRecipient, Notification)
        .join(Notification, Notification.id == NotificationRecipient.notification_id)
        .where(NotificationRecipient.user_id == user.id)
    )
    if unreadOnly:
        query = query.where(NotificationRecipient.read_at.is_(None))
    if cursor:
        anchor = db.get(NotificationRecipient, cursor)
        if anchor is None or anchor.user_id != user.id:
            raise HTTPException(400, "notification_cursor_invalid")
        query = query.where(NotificationRecipient.created_at < anchor.created_at)
    rows = list(
        db.execute(
            query.order_by(
                NotificationRecipient.created_at.desc(), NotificationRecipient.id.desc()
            ).limit(pageSize + 1)
        )
    )
    more = len(rows) > pageSize
    rows = rows[:pageSize]
    items = [
        {
            "id": recipient.id,
            "notificationId": notice.id,
            "eventKey": notice.event_key,
            "severity": notice.severity,
            "mandatory": notice.mandatory,
            "requireAcknowledgement": notice.require_acknowledgement,
            "channels": notice.channels,
            "locale": recipient.locale,
            "subject": recipient.subject,
            "body": recipient.body,
            "createdAt": recipient.created_at.isoformat(),
            "readAt": recipient.read_at.isoformat() if recipient.read_at else None,
            "acknowledgedAt": recipient.acknowledged_at.isoformat()
            if recipient.acknowledged_at
            else None,
        }
        for recipient, notice in rows
    ]
    return {"items": items, "nextCursor": items[-1]["id"] if more and items else None}


def _my_recipient(
    db: DB, user_id: str, recipient_id: uuid.UUID
) -> tuple[NotificationRecipient, Notification]:
    pair = db.execute(
        select(NotificationRecipient, Notification)
        .join(Notification, Notification.id == NotificationRecipient.notification_id)
        .where(
            NotificationRecipient.id == str(recipient_id), NotificationRecipient.user_id == user_id
        )
        .with_for_update()
    ).first()
    if pair is None:
        raise HTTPException(404, "notification_not_found")
    return pair


@router.post("/me/notifications/{notification_id}/read", status_code=204)
def mark_notification_read(
    notification_id: uuid.UUID, request: Request, db: DB, user: Principal
) -> Response:
    lock_principal(db, request, user)
    recipient, _notice = _my_recipient(db, user.id, notification_id)
    if recipient.read_at is None:
        recipient.read_at = now()
    return Response(status_code=204)


@router.post("/me/notifications/{notification_id}/acknowledgements", status_code=204)
def acknowledge_notification(
    notification_id: uuid.UUID, request: Request, db: DB, user: Principal
) -> Response:
    lock_principal(db, request, user)
    recipient, notice = _my_recipient(db, user.id, notification_id)
    if not notice.require_acknowledgement:
        raise HTTPException(409, "notification_acknowledgement_not_required")
    if recipient.acknowledged_at is None:
        instant = now()
        recipient.read_at = recipient.read_at or instant
        recipient.acknowledged_at = instant
        audit(db, request, "notification_acknowledged", user, {"notificationId": notice.id})
    return Response(status_code=204)


@router.get("/notifications/{notification_id}/delivery-status")
def notification_delivery_status(
    notification_id: uuid.UUID, db: DB, user: Principal
) -> dict[str, object]:
    notice = db.get(Notification, str(notification_id))
    if notice is None:
        raise HTTPException(404, "notification_not_found")
    if notice.sender_id != user.id:
        if notice.course_id is None:
            raise HTTPException(403, "forbidden")
        course = course_for(db, uuid.UUID(notice.course_id), user)
        if "events.manage" not in permissions(db, course, user):
            raise HTTPException(403, "forbidden")
    return {
        "notificationId": notice.id,
        "recipientCount": db.scalar(
            select(func.count())
            .select_from(NotificationRecipient)
            .where(NotificationRecipient.notification_id == notice.id)
        )
        or 0,
        "readCount": db.scalar(
            select(func.count())
            .select_from(NotificationRecipient)
            .where(
                NotificationRecipient.notification_id == notice.id,
                NotificationRecipient.read_at.is_not(None),
            )
        )
        or 0,
        "acknowledgedCount": db.scalar(
            select(func.count())
            .select_from(NotificationRecipient)
            .where(
                NotificationRecipient.notification_id == notice.id,
                NotificationRecipient.acknowledged_at.is_not(None),
            )
        )
        or 0,
        "emailQueued": db.scalar(
            select(func.count())
            .select_from(NotificationRecipient)
            .where(
                NotificationRecipient.notification_id == notice.id,
                NotificationRecipient.email_status == "queued",
            )
        )
        or 0,
        "emailSuppressed": db.scalar(
            select(func.count())
            .select_from(NotificationRecipient)
            .where(
                NotificationRecipient.notification_id == notice.id,
                NotificationRecipient.email_status == "suppressed",
            )
        )
        or 0,
        "emailDelivered": db.scalar(
            select(func.count())
            .select_from(NotificationRecipient)
            .where(
                NotificationRecipient.notification_id == notice.id,
                NotificationRecipient.email_status == "delivered",
            )
        )
        or 0,
        "emailFailed": db.scalar(
            select(func.count())
            .select_from(NotificationRecipient)
            .where(
                NotificationRecipient.notification_id == notice.id,
                NotificationRecipient.email_status == "failed",
            )
        )
        or 0,
        "requireAcknowledgement": notice.require_acknowledgement,
    }
