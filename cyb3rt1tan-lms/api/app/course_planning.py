"""Versioned rules, editable lesson plans and timezone-validated teaching sessions."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, cast
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import DB, Admin, Principal, audit
from .course_access import course_for, https_url, instant, lock_actor, match, period, touch
from .course_dto import (
    Plan,
    RulesDraft,
    SessionCreate,
    SessionException,
    SessionSeriesCreate,
    TemplateDraft,
)
from .models import Course, CourseRulePublication, RuleTemplate, TaxonomyTag, TeachingSession
from .security import utc

router = APIRouter(prefix="/v1")


def active_template(db: Session) -> RuleTemplate | None:
    return db.scalar(select(RuleTemplate).where(RuleTemplate.active.is_(True)))


def template_json(item: RuleTemplate | None) -> dict[str, object]:
    return {
        "id": item.id if item else None,
        "version": item.version if item else 0,
        "rules": item.rules if item else [],
        "active": bool(item and item.active),
    }


def unique(values: list[object]) -> None:
    if len(values) != len(set(values)):
        raise HTTPException(422, "duplicate_entry")


@router.get("/admin/course-rule-templates")
def get_template(db: DB, user: Admin) -> dict[str, object]:
    return {
        "active": template_json(active_template(db)),
        "drafts": [
            template_json(item)
            for item in db.scalars(
                select(RuleTemplate)
                .where(RuleTemplate.active.is_(False))
                .order_by(RuleTemplate.version.desc())
            )
        ],
    }


@router.post("/admin/course-rule-templates", status_code=201)
def draft_template(body: TemplateDraft, request: Request, db: DB, user: Admin) -> dict[str, object]:
    lock_actor(db, request, user)
    unique([rule.ruleId for rule in body.rules])
    unique([rule.position for rule in body.rules])
    version = (db.scalar(select(func.max(RuleTemplate.version))) or 0) + 1
    item = RuleTemplate(
        version=version, rules=[rule.model_dump() for rule in body.rules], active=False
    )
    db.add(item)
    db.flush()
    audit(
        db,
        request,
        "course_rule_template_created",
        user,
        {"templateId": item.id, "version": item.version},
    )
    return template_json(item)


@router.post("/admin/course-rule-templates/{template_id}/activate")
def activate_template(
    template_id: uuid.UUID, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    lock_actor(db, request, user)
    item = db.get(RuleTemplate, str(template_id))
    if not item:
        raise HTTPException(404, "template_not_found")
    ids = {rule["ruleId"] for rule in item.rules}
    for course in db.scalars(select(Course)):
        if any(override["ruleId"] not in ids for override in course.rule_overrides):
            raise HTTPException(409, "template_would_orphan_override")
        if any(rule["ruleId"] in ids for rule in course.custom_rules):
            raise HTTPException(409, "custom_rule_id_conflict")
    previous = active_template(db)
    if previous:
        previous.active = False
        db.flush()
    item.active = True
    db.flush()
    courses = list(db.scalars(select(Course).order_by(Course.id)))
    for course in courses:
        publish_effective(db, course, user)
    audit(
        db,
        request,
        "course_rule_template_activated",
        user,
        {"templateId": item.id, "version": item.version, "coursesPublished": len(courses)},
    )
    return template_json(item)


def effective(db: Session, course: Course) -> dict[str, object]:
    template = active_template(db)
    overrides = {item["ruleId"]: item for item in course.rule_overrides}
    rules = []
    for rule in template.rules if template else []:
        override = overrides.get(rule["ruleId"])
        if override and override["action"] == "disable":
            continue
        rules.append(
            {
                **rule,
                **({"title": override["title"], "body": override["body"]} if override else {}),
                "source": "override" if override else "shared",
            }
        )
    rules.extend({**rule, "source": "custom"} for rule in course.custom_rules)
    return {
        "templateVersion": template.version if template else 0,
        "publicationVersion": db.scalar(
            select(func.max(CourseRulePublication.version)).where(
                CourseRulePublication.course_id == course.id
            )
        )
        or 0,
        "revision": course.revision,
        "rules": sorted(rules, key=lambda rule: (int(str(rule["position"])), str(rule["ruleId"]))),
        "overrides": course.rule_overrides,
        "customRules": course.custom_rules,
        "sharedRules": template.rules if template else [],
    }


def publish_effective(db: Session, course: Course, user: Principal) -> CourseRulePublication:
    version = (
        db.scalar(
            select(func.max(CourseRulePublication.version)).where(
                CourseRulePublication.course_id == course.id
            )
        )
        or 0
    ) + 1
    current = effective(db, course)
    template = active_template(db)
    publication = CourseRulePublication(
        course_id=course.id,
        version=version,
        template_version=template.version if template else 0,
        rules=current["rules"],
        published_by=user.id,
    )
    db.add(publication)
    db.flush()
    return publication


@router.get("/courses/{course_id}/rules/history")
def rule_history(
    course_id: uuid.UUID,
    db: DB,
    user: Principal,
    before: Annotated[int | None, Query(ge=1)] = None,
) -> dict[str, object]:
    course = course_for(db, course_id, user)
    statement = select(CourseRulePublication).where(CourseRulePublication.course_id == course.id)
    if before:
        statement = statement.where(CourseRulePublication.version < before)
    items = list(db.scalars(statement.order_by(CourseRulePublication.version.desc()).limit(26)))
    more = len(items) > 25
    items = items[:25]
    return {
        "items": [
            {
                "version": item.version,
                "templateVersion": item.template_version,
                "publishedAt": utc(item.published_at).isoformat(),
                "rules": item.rules,
            }
            for item in items
        ],
        "nextBefore": items[-1].version if more and items else None,
    }


@router.get("/courses/{course_id}/rules")
def get_rules(
    course_id: uuid.UUID, response: Response, db: DB, user: Principal
) -> dict[str, object]:
    course = course_for(db, course_id, user)
    response.headers["ETag"] = f'"{course.revision}"'
    return effective(db, course)


@router.put("/courses/{course_id}/rules")
def save_rules(
    course_id: uuid.UUID,
    body: RulesDraft,
    request: Request,
    response: Response,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "course.rules.manage", True)
    match(course, request)
    template = active_template(db)
    if not template or template.version != body.expectedTemplateVersion:
        raise HTTPException(409, "stale_rule_template")
    ids = {rule["ruleId"] for rule in template.rules}
    unique([rule.ruleId for rule in body.overrides])
    unique([rule.ruleId for rule in body.customRules])
    if any(rule.ruleId not in ids for rule in body.overrides):
        raise HTTPException(422, "unknown_rule_id")
    if any(rule.ruleId in ids for rule in body.customRules):
        raise HTTPException(422, "custom_rule_id_conflict")
    course.rule_overrides = [rule.model_dump() for rule in body.overrides]
    course.custom_rules = [rule.model_dump() for rule in body.customRules]
    touch(course)
    publication = publish_effective(db, course, user)
    audit(
        db,
        request,
        "course_rules_updated",
        user,
        {
            "courseId": course.id,
            "templateVersion": template.version,
            "publicationVersion": publication.version,
        },
    )
    db.flush()
    response.headers["ETag"] = f'"{course.revision}"'
    return effective(db, course)


@router.get("/courses/{course_id}/lesson-plan")
def get_plan(
    course_id: uuid.UUID, response: Response, db: DB, user: Principal
) -> dict[str, object]:
    course = course_for(db, course_id, user)
    response.headers["ETag"] = f'"{course.revision}"'
    return {"entries": course.lesson_plan, "revision": course.revision}


@router.put("/courses/{course_id}/lesson-plan")
def save_plan(
    course_id: uuid.UUID, body: Plan, request: Request, response: Response, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "content.author", True)
    match(course, request)
    previous_ids = {entry["entryId"] for entry in course.lesson_plan}
    retained = [entry.entryId for entry in body.entries if entry.entryId]
    unique(list(retained))
    unique([entry.position for entry in body.entries])
    if any(entry_id not in previous_ids for entry_id in retained):
        raise HTTPException(422, "unknown_plan_entry")
    scheduled = set(
        db.scalars(
            select(TeachingSession.plan_entry_id).where(
                TeachingSession.course_id == course.id, TeachingSession.plan_entry_id.is_not(None)
            )
        )
    )
    if scheduled - set(retained):
        raise HTTPException(409, "scheduled_plan_entry_required")
    previous_tags = {
        entry["entryId"]: set(cast(list[str], entry.get("tagIds", [])))
        for entry in course.lesson_plan
    }
    for entry in body.entries:
        existing = previous_tags.get(entry.entryId, set())
        for tag_id in set(entry.tagIds) - existing:
            tag = db.get(TaxonomyTag, ("content", tag_id))
            if tag is None or tag.status != "active" or not tag.selectable:
                raise HTTPException(422, "active_lesson_tags_required")
            if tag.applicability and "lesson" not in tag.applicability:
                raise HTTPException(422, "lesson_tag_not_applicable")
    course.lesson_plan = sorted(
        [
            {**entry.model_dump(), "entryId": entry.entryId or str(uuid.uuid4())}
            for entry in body.entries
        ],
        key=lambda entry: int(str(entry["position"])),
    )
    touch(course)
    audit(
        db,
        request,
        "course_lesson_plan_updated",
        user,
        {"courseId": course.id, "entryCount": len(body.entries)},
    )
    db.flush()
    response.headers["ETag"] = f'"{course.revision}"'
    return {"entries": course.lesson_plan, "revision": course.revision}


def session_json(item: TeachingSession) -> dict[str, object]:
    return {
        "id": item.id,
        "startsAt": utc(item.starts_at).isoformat(),
        "endsAt": utc(item.ends_at).isoformat(),
        "timezone": item.timezone,
        "sectionId": item.section_id,
        "room": item.room,
        "onlineUrl": item.online_url,
        "lessonPlanEntryId": item.plan_entry_id,
        "status": item.status,
        "recurrenceSeriesId": item.recurrence_series_id,
        "recurrenceIndex": item.recurrence_index,
    }


@router.get("/courses/{course_id}/sessions")
def sessions(
    course_id: uuid.UUID,
    db: DB,
    user: Principal,
    start: Annotated[datetime | None, Query(alias="from")] = None,
    end: Annotated[datetime | None, Query(alias="to")] = None,
) -> dict[str, object]:
    course = course_for(db, course_id, user)
    statement = select(TeachingSession).where(TeachingSession.course_id == course.id)
    first = instant(start) if start else None
    last = instant(end) if end else None
    if first and last and first >= last:
        raise HTTPException(422, "invalid_time_range")
    if first:
        statement = statement.where(TeachingSession.starts_at >= first)
    if last:
        statement = statement.where(TeachingSession.starts_at < last)
    return {
        "items": [
            session_json(item)
            for item in db.scalars(
                statement.order_by(TeachingSession.starts_at, TeachingSession.id)
            )
        ]
    }


@router.post("/courses/{course_id}/sessions", status_code=201)
def add_session(
    course_id: uuid.UUID, body: SessionCreate, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "content.author", True)
    start, end = period(body.startsAt, body.endsAt, body.timezone)
    https_url(body.onlineUrl)
    if body.lessonPlanEntryId and body.lessonPlanEntryId not in {
        entry["entryId"] for entry in course.lesson_plan
    }:
        raise HTTPException(422, "unknown_plan_entry")
    item = TeachingSession(
        course_id=course.id,
        starts_at=start,
        ends_at=end,
        timezone=body.timezone,
        section_id=body.sectionId,
        room=body.room,
        online_url=body.onlineUrl,
        plan_entry_id=body.lessonPlanEntryId,
    )
    db.add(item)
    touch(course)
    db.flush()
    audit(
        db, request, "course_session_created", user, {"courseId": course.id, "sessionId": item.id}
    )
    return session_json(item)


def _wall_time(value: datetime, timezone: ZoneInfo) -> datetime:
    wall = value.replace(tzinfo=None)
    candidate = wall.replace(tzinfo=timezone)
    if candidate.astimezone(UTC).astimezone(timezone).replace(tzinfo=None) != wall:
        raise HTTPException(422, "recurrence_hits_dst_gap")
    return candidate


@router.post("/courses/{course_id}/session-series", status_code=201)
def add_session_series(
    course_id: uuid.UUID,
    body: SessionSeriesCreate,
    request: Request,
    response: Response,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "content.author", True)
    match(course, request)
    first, last = period(body.startsAt, body.endsAt, body.timezone)
    https_url(body.onlineUrl)
    if body.lessonPlanEntryId and body.lessonPlanEntryId not in {
        entry["entryId"] for entry in course.lesson_plan
    }:
        raise HTTPException(422, "unknown_plan_entry")
    zone = ZoneInfo(body.timezone)
    local_start = body.startsAt.astimezone(zone).replace(tzinfo=None)
    local_end = body.endsAt.astimezone(zone).replace(tzinfo=None)
    wall_duration = local_end - local_start
    if wall_duration <= timedelta(0) or wall_duration > timedelta(days=1):
        raise HTTPException(422, "invalid_session_duration")
    series_id = str(uuid.uuid4())
    created: list[TeachingSession] = []
    step_days = (1 if body.frequency == "daily" else 7) * body.interval
    for index in range(body.occurrences):
        offset = timedelta(days=step_days * index)
        starts_at = _wall_time(local_start + offset, zone).astimezone(UTC)
        ends_at = _wall_time(local_start + offset + wall_duration, zone).astimezone(UTC)
        if ends_at <= starts_at:
            raise HTTPException(422, "invalid_session_duration")
        if index == 0 and (starts_at != first or ends_at != last):
            raise HTTPException(422, "timezone_offset_mismatch")
        created.append(
            TeachingSession(
                course_id=course.id,
                starts_at=starts_at,
                ends_at=ends_at,
                timezone=body.timezone,
                section_id=body.sectionId,
                room=body.room,
                online_url=body.onlineUrl,
                plan_entry_id=body.lessonPlanEntryId,
                recurrence_series_id=series_id,
                recurrence_index=index,
            )
        )
    db.add_all(created)
    touch(course)
    db.flush()
    audit(
        db,
        request,
        "course_session_series_created",
        user,
        {"courseId": course.id, "seriesId": series_id, "count": len(created)},
    )
    response.headers["ETag"] = f'"{course.revision}"'
    return {"seriesId": series_id, "items": [session_json(item) for item in created]}


@router.patch("/courses/{course_id}/sessions/{session_id}")
def change_session(
    course_id: uuid.UUID,
    session_id: uuid.UUID,
    body: SessionException,
    request: Request,
    response: Response,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "content.author", True)
    match(course, request)
    item = db.get(TeachingSession, str(session_id), populate_existing=True)
    if not item or item.course_id != course.id:
        raise HTTPException(404, "session_not_found")
    fields = body.model_fields_set
    if body.startsAt is not None or body.endsAt is not None:
        start_value = body.startsAt or item.starts_at
        end_value = body.endsAt or item.ends_at
        item.starts_at, item.ends_at = period(start_value, end_value, item.timezone)
    if "room" in fields:
        item.room = body.room
    if "onlineUrl" in fields:
        https_url(body.onlineUrl)
        item.online_url = body.onlineUrl
    if "lessonPlanEntryId" in fields:
        if body.lessonPlanEntryId and body.lessonPlanEntryId not in {
            entry["entryId"] for entry in course.lesson_plan
        }:
            raise HTTPException(422, "unknown_plan_entry")
        item.plan_entry_id = body.lessonPlanEntryId
    if body.status:
        item.status = body.status
    item.exception_reason = body.reason
    touch(course)
    db.flush()
    audit(
        db,
        request,
        "course_session_exception_recorded",
        user,
        {
            "courseId": course.id,
            "sessionId": item.id,
            "seriesId": item.recurrence_series_id,
            "status": item.status,
            "reason": body.reason,
        },
    )
    response.headers["ETag"] = f'"{course.revision}"'
    return session_json(item)
