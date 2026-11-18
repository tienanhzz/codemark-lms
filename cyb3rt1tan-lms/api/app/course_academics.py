"""Course resources and immutable Admin-configured grade scheme versions."""

import uuid

from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import func, select

from .auth import DB, Principal, audit
from .course_access import course_for, https_url, lock_actor, match, touch
from .course_dto import CourseResources, GradeSchemeDraft
from .models import CourseResource, GradeSchemeVersion

router = APIRouter(prefix="/v1")


def scheme_json(item: GradeSchemeVersion | None) -> dict[str, object]:
    return {
        "id": item.id if item else None,
        "version": item.version if item else 0,
        "components": item.components if item else [],
        "bands": item.bands if item else [],
        "active": bool(item and item.active),
    }


def weight_total(components: list[dict[str, object]]) -> float:
    return sum(
        weight
        for component in components
        if isinstance((weight := component.get("weight")), (int, float))
    )


def active_scheme(db: DB, course_id: str) -> GradeSchemeVersion | None:
    return db.scalar(
        select(GradeSchemeVersion).where(
            GradeSchemeVersion.course_id == course_id, GradeSchemeVersion.active.is_(True)
        )
    )


@router.get("/courses/{course_id}/grade-schemes")
def list_grade_schemes(course_id: uuid.UUID, db: DB, user: Principal) -> dict[str, object]:
    course = course_for(db, course_id, user)
    return {
        "active": scheme_json(active_scheme(db, course.id)),
        "items": [
            scheme_json(item)
            for item in db.scalars(
                select(GradeSchemeVersion)
                .where(GradeSchemeVersion.course_id == course.id)
                .order_by(GradeSchemeVersion.version.desc())
            )
        ],
    }


@router.post("/courses/{course_id}/grade-schemes", status_code=201)
def create_grade_scheme(
    course_id: uuid.UUID,
    body: GradeSchemeDraft,
    request: Request,
    response: Response,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "content.author", True)
    match(course, request)
    version = (
        db.scalar(
            select(func.max(GradeSchemeVersion.version)).where(
                GradeSchemeVersion.course_id == course.id
            )
        )
        or 0
    ) + 1
    item = GradeSchemeVersion(
        course_id=course.id,
        version=version,
        components=[component.model_dump() for component in body.components],
        bands=[band.model_dump() for band in body.bands],
        active=False,
    )
    db.add(item)
    touch(course)
    db.flush()
    audit(
        db,
        request,
        "grade_scheme_created",
        user,
        {"courseId": course.id, "schemeId": item.id, "version": version},
    )
    response.headers["ETag"] = f'"{course.revision}"'
    return scheme_json(item)


@router.post("/courses/{course_id}/grade-schemes/{schemeVersionId}/publish", status_code=202)
def publish_grade_scheme(
    course_id: uuid.UUID,
    schemeVersionId: uuid.UUID,
    request: Request,
    response: Response,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "content.author", True)
    match(course, request)
    item = db.get(GradeSchemeVersion, str(schemeVersionId), populate_existing=True)
    if not item or item.course_id != course.id:
        raise HTTPException(404, "grade_scheme_not_found")
    if abs(weight_total(item.components) - 100.0) > 0.001:
        raise HTTPException(422, "grade_weights_must_total_100")
    previous = active_scheme(db, course.id)
    if previous:
        previous.active = False
        db.flush()
    item.active = True
    touch(course)
    db.flush()
    audit(
        db,
        request,
        "grade_scheme_published",
        user,
        {"courseId": course.id, "schemeId": item.id, "version": item.version},
    )
    response.headers["ETag"] = f'"{course.revision}"'
    return scheme_json(item)


def resource_json(item: CourseResource) -> dict[str, object]:
    return {
        "id": item.id,
        "kind": item.kind,
        "title": item.title,
        "note": item.note,
        "coverage": item.coverage,
        "url": item.url,
        "position": item.position,
    }


@router.get("/courses/{course_id}/resources")
def list_resources(course_id: uuid.UUID, db: DB, user: Principal) -> dict[str, object]:
    course = course_for(db, course_id, user)
    items = db.scalars(
        select(CourseResource)
        .where(CourseResource.course_id == course.id)
        .order_by(CourseResource.position, CourseResource.id)
    )
    return {"items": [resource_json(item) for item in items], "revision": course.revision}


@router.put("/courses/{course_id}/resources")
def replace_resources(
    course_id: uuid.UUID,
    body: CourseResources,
    request: Request,
    response: Response,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "content.author", True)
    match(course, request)
    for item in body.items:
        https_url(item.url)
        if item.kind == "usefulUrl" and not item.url:
            raise HTTPException(422, "resource_url_required")
    prior_urls = set(
        db.scalars(select(CourseResource.url).where(CourseResource.course_id == course.id))
    )
    db.query(CourseResource).filter(CourseResource.course_id == course.id).delete()
    resources = [CourseResource(course_id=course.id, **item.model_dump()) for item in body.items]
    db.add_all(resources)
    touch(course)
    db.flush()
    from .quests import record_resource_publication

    for resource in resources:
        if resource.url and resource.url not in prior_urls:
            record_resource_publication(db, user, resource)
    audit(
        db,
        request,
        "course_resources_updated",
        user,
        {"courseId": course.id, "resourceCount": len(resources)},
    )
    response.headers["ETag"] = f'"{course.revision}"'
    return {"items": [resource_json(item) for item in resources], "revision": course.revision}


@router.get("/courses/{course_id}/grade-scheme")
def course_grade_scheme(course_id: uuid.UUID, db: DB, user: Principal) -> dict[str, object]:
    course = course_for(db, course_id, user)
    item = active_scheme(db, course.id)
    return scheme_json(item)
