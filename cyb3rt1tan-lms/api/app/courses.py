"""Course lifecycle, catalogs, staff, enrollment and scoped grants."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .auth import DB, Admin, Principal, audit
from .course_access import (
    PERMISSIONS,
    active_user,
    course_for,
    course_json,
    instant,
    lock_actor,
    match,
    period,
    permissions,
    touch,
    visibility,
    zone,
)
from .course_dto import (
    CourseCreate,
    CoursePatch,
    Enrollment,
    EnrollmentChange,
    FacultyCreate,
    FacultyPatch,
    PermissionGrant,
    StaffGrant,
    TermCreate,
    TermPatch,
)
from .identity_dto import Reason
from .models import (
    AcademicTerm,
    Course,
    CourseMembership,
    CoursePermission,
    CourseStaff,
    Faculty,
    User,
    now,
)
from .provisioning import write_enrollment
from .security import utc

router = APIRouter(prefix="/v1")


def faculty_json(item: Faculty) -> dict[str, object]:
    return {
        "facultyId": item.id,
        "names": item.names,
        "sortOrder": item.sort_order,
        "status": item.status,
    }


def term_json(item: AcademicTerm) -> dict[str, object]:
    return {
        "termCode": item.id,
        "name": item.name,
        "startsAt": utc(item.starts_at).isoformat(),
        "endsAt": utc(item.ends_at).isoformat(),
        "timezone": item.timezone,
        "status": item.status,
    }


@router.get("/admin/faculties")
def faculties(db: DB, user: Principal, includeRetired: bool = False) -> dict[str, object]:
    statement = select(Faculty).order_by(Faculty.sort_order, Faculty.id)
    if not includeRetired:
        statement = statement.where(Faculty.status == "active")
    return {"items": [faculty_json(item) for item in db.scalars(statement)]}


@router.post("/admin/faculties", status_code=201)
def create_faculty(body: FacultyCreate, request: Request, db: DB, user: Admin) -> dict[str, object]:
    lock_actor(db, request, user)
    if db.get(Faculty, body.facultyId):
        raise HTTPException(409, "catalog_id_exists")
    item = Faculty(id=body.facultyId, names=body.names, sort_order=body.sortOrder, status="active")
    db.add(item)
    audit(db, request, "faculty_created", user, {"facultyId": item.id})
    return faculty_json(item)


@router.patch("/admin/faculties/{faculty_id}")
def edit_faculty(
    faculty_id: str, body: FacultyPatch, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    lock_actor(db, request, user)
    item = db.get(Faculty, faculty_id)
    if not item:
        raise HTTPException(404, "catalog_not_found")
    values = body.model_dump(exclude_unset=True)
    if not values or any(value is None for value in values.values()):
        raise HTTPException(422, "validation_failed")
    for key, value in values.items():
        setattr(item, {"sortOrder": "sort_order"}.get(key, key), value)
    audit(db, request, "faculty_updated", user, {"facultyId": item.id})
    return faculty_json(item)


@router.get("/admin/academic-terms")
def terms(db: DB, user: Principal, includeRetired: bool = False) -> dict[str, object]:
    statement = select(AcademicTerm).order_by(AcademicTerm.starts_at.desc(), AcademicTerm.id)
    if not includeRetired:
        statement = statement.where(AcademicTerm.status == "active")
    return {"items": [term_json(item) for item in db.scalars(statement)]}


@router.post("/admin/academic-terms", status_code=201)
def create_term(body: TermCreate, request: Request, db: DB, user: Admin) -> dict[str, object]:
    lock_actor(db, request, user)
    if db.get(AcademicTerm, body.termCode):
        raise HTTPException(409, "catalog_id_exists")
    start, end = period(body.startsAt, body.endsAt, body.timezone)
    item = AcademicTerm(
        id=body.termCode,
        name=body.name,
        starts_at=start,
        ends_at=end,
        timezone=body.timezone,
        status="active",
    )
    db.add(item)
    audit(db, request, "term_created", user, {"termCode": item.id})
    return term_json(item)


@router.patch("/admin/academic-terms/{term_id}")
def edit_term(
    term_id: str, body: TermPatch, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    lock_actor(db, request, user)
    item = db.get(AcademicTerm, term_id)
    if not item:
        raise HTTPException(404, "catalog_not_found")
    if not body.model_fields_set or any(
        getattr(body, key) is None for key in body.model_fields_set
    ):
        raise HTTPException(422, "validation_failed")
    timezone = body.timezone or item.timezone
    zone(timezone)
    first = instant(body.startsAt, timezone) if body.startsAt else utc(item.starts_at)
    last = instant(body.endsAt, timezone) if body.endsAt else utc(item.ends_at)
    if first >= last:
        raise HTTPException(422, "invalid_time_range")
    item.starts_at, item.ends_at, item.timezone = first, last, timezone
    if body.name is not None:
        item.name = body.name
    if body.status is not None:
        item.status = body.status
    audit(db, request, "term_updated", user, {"termCode": item.id})
    return term_json(item)


def references(db: Session, term_id: str | None, faculty_id: str | None) -> None:
    if term_id is not None:
        term = db.get(AcademicTerm, term_id)
        if term is None or term.status != "active":
            raise HTTPException(422, "active_catalog_required")
    if faculty_id is not None:
        faculty = db.get(Faculty, faculty_id)
        if faculty is None or faculty.status != "active":
            raise HTTPException(422, "active_catalog_required")


@router.get("/courses")
def courses(
    db: DB,
    user: Principal,
    query: str = Query(default="", max_length=200),
    status: str | None = None,
    termId: str | None = None,
    facultyId: str | None = None,
    cursor: UUID | None = None,
    pageSize: int = Query(default=25, ge=1, le=100),
) -> dict[str, object]:
    statement = select(Course).order_by(Course.id)
    if status:
        if status not in {"draft", "active", "completed", "archived"}:
            raise HTTPException(422, "validation_failed")
        statement = statement.where(Course.status == status)
    if termId:
        statement = statement.where(Course.term_id == termId)
    if facultyId:
        statement = statement.where(Course.faculty_id == facultyId)
    if query:
        term = (
            "%" + query.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        )
        statement = statement.where(
            or_(
                func.lower(Course.title).like(term, escape="\\"),
                func.lower(Course.code).like(term, escape="\\"),
            )
        )
    if cursor:
        statement = statement.where(Course.id > str(cursor))
    statement = statement.where(visibility(user))
    items = list(db.scalars(statement.limit(pageSize + 1)))
    return {
        "items": [course_json(db, course, user) for course in items[:pageSize]],
        "nextCursor": items[pageSize - 1].id if len(items) > pageSize else None,
    }


@router.post("/courses", status_code=201)
def create_course(
    body: CourseCreate, request: Request, response: Response, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    if not {"teacher", "admin"}.intersection(user.roles):
        raise HTTPException(403, "forbidden")
    zone(body.timezone)
    references(db, body.termId, body.facultyId)
    if db.scalar(select(Course).where(Course.code == body.courseCode)):
        raise HTTPException(409, "course_code_exists")
    course = Course(
        code=body.courseCode,
        title=body.title,
        term_id=body.termId,
        faculty_id=body.facultyId,
        timezone=body.timezone,
        module=body.module.model_dump(),
        owner_id=user.id,
    )
    db.add(course)
    db.flush()
    if "teacher" in user.roles:
        db.add(CourseStaff(course_id=course.id, user_id=user.id, role="teacher"))
    audit(db, request, "course_created", user, {"courseId": course.id})
    return course_json(db, course, user, response)


@router.get("/courses/{course_id}")
def detail(course_id: UUID, response: Response, db: DB, user: Principal) -> dict[str, object]:
    return course_json(db, course_for(db, course_id, user), user, response)


@router.patch("/courses/{course_id}")
def patch_course(
    course_id: UUID,
    body: CoursePatch,
    request: Request,
    response: Response,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "course.manage", True)
    match(course, request)
    references(db, body.termId, body.facultyId)
    if body.timezone:
        zone(body.timezone)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(course, {"facultyId": "faculty_id", "termId": "term_id"}.get(key, key), value)
    touch(course)
    audit(db, request, "course_updated", user, {"courseId": course.id})
    db.flush()
    return course_json(db, course, user, response)


@router.post("/courses/{course_id}/activate")
@router.post("/courses/{course_id}/complete")
@router.post("/courses/{course_id}/archive")
def lifecycle(
    course_id: UUID, body: Reason, request: Request, response: Response, db: DB, user: Principal
) -> dict[str, object]:
    operation = request.url.path.rsplit("/", 1)[-1]
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "course.manage")
    if operation == "activate" and course.status == "draft":
        references(db, course.term_id, course.faculty_id)
        course.status = "active"
    elif operation == "complete" and course.status == "active":
        course.status = "completed"
    elif operation == "archive" and course.status != "archived":
        course.archived_from, course.status = course.status, "archived"
    else:
        raise HTTPException(409, "invalid_course_transition")
    touch(course)
    audit(db, request, "course_" + operation, user, {"courseId": course.id, "reason": body.reason})
    db.flush()
    return course_json(db, course, user, response)


@router.post("/admin/courses/{course_id}/restore")
def restore_course(
    course_id: UUID, body: Reason, request: Request, response: Response, db: DB, user: Admin
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user)
    if course.status != "archived":
        raise HTTPException(409, "invalid_course_transition")
    course.status, course.archived_from = course.archived_from or "draft", None
    touch(course)
    audit(db, request, "course_restored", user, {"courseId": course.id, "reason": body.reason})
    db.flush()
    return course_json(db, course, user, response)


def person(item: User) -> dict[str, object]:
    return {"userId": item.id, "username": item.username, "officialName": item.official_name}


@router.get("/courses/{course_id}/people")
def candidates(
    course_id: UUID,
    db: DB,
    user: Principal,
    query: str = Query(default="", max_length=200),
    role: str = "student",
) -> dict[str, object]:
    course_for(db, course_id, user, "course.manage")
    if role not in {"student", "teacher", "teachingAssistant"}:
        raise HTTPException(422, "validation_failed")
    from sqlalchemy import String, cast

    statement = (
        select(User)
        .where(
            User.status == "active",
            cast(User.roles, String).contains('"' + role + '"', autoescape=True),
        )
        .order_by(User.username)
    )
    if query:
        statement = statement.where(
            or_(
                User.username.contains(query, autoescape=True),
                User.official_name.contains(query, autoescape=True),
            )
        )
    return {"items": [person(item) for item in db.scalars(statement.limit(25))]}


@router.get("/courses/{course_id}/staff")
def staff(course_id: UUID, db: DB, user: Principal) -> dict[str, object]:
    course = course_for(db, course_id, user, "roster.read")
    records = db.execute(
        select(CourseStaff, User)
        .join(User, User.id == CourseStaff.user_id)
        .where(CourseStaff.course_id == course.id, CourseStaff.active.is_(True))
        .order_by(User.username)
    )
    return {
        "ownerId": course.owner_id,
        "items": [
            {
                **person(account),
                "staffRole": row.role,
                "permissions": sorted(permissions(db, course, account)),
            }
            for row, account in records
        ],
    }


@router.post("/courses/{course_id}/staff", status_code=201)
def add_staff(
    course_id: UUID, body: StaffGrant, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "course.manage", True)
    target = active_user(db, body.userId, body.staffRole)
    if body.ownerTransfer and (body.staffRole != "teacher" or not body.reason.strip()):
        raise HTTPException(422, "owner_transfer_reason_required")
    if target.id == course.owner_id and body.staffRole != "teacher":
        raise HTTPException(409, "course_owner_protected")
    item = db.get(CourseStaff, (course.id, target.id))
    if not item:
        item = CourseStaff(course_id=course.id, user_id=target.id, role=body.staffRole, active=True)
        db.add(item)
    item.role, item.active = body.staffRole, True
    if body.ownerTransfer:
        previous = course.owner_id
        course.owner_id = target.id
        old = db.get(CourseStaff, (course.id, previous))
        if old and previous != target.id:
            old.active = False
            for grant in db.scalars(
                select(CoursePermission).where(
                    CoursePermission.course_id == course.id,
                    CoursePermission.user_id == previous,
                    CoursePermission.revoked_at.is_(None),
                )
            ):
                grant.revoked_at = now()
        audit(
            db,
            request,
            "course_owner_transferred",
            user,
            {
                "courseId": course.id,
                "previousOwnerId": previous,
                "newOwnerId": target.id,
                "reason": body.reason,
            },
        )
    else:
        audit(
            db,
            request,
            "course_staff_added",
            user,
            {"courseId": course.id, "userId": target.id, "role": body.staffRole},
        )
    touch(course)
    return {**person(target), "staffRole": item.role}


@router.delete("/courses/{course_id}/staff/{user_id}", status_code=204)
def remove_staff(
    course_id: UUID, user_id: UUID, body: Reason, request: Request, db: DB, user: Principal
) -> Response:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "course.manage", True)
    if course.owner_id == str(user_id):
        raise HTTPException(409, "course_owner_protected")
    item = db.get(CourseStaff, (course.id, str(user_id)))
    if not item or not item.active:
        raise HTTPException(404, "staff_not_found")
    item.active = False
    for grant in db.scalars(
        select(CoursePermission).where(
            CoursePermission.course_id == course.id,
            CoursePermission.user_id == str(user_id),
            CoursePermission.revoked_at.is_(None),
        )
    ):
        grant.revoked_at = now()
    touch(course)
    audit(
        db,
        request,
        "course_staff_removed",
        user,
        {"courseId": course.id, "userId": str(user_id), "reason": body.reason},
    )
    return Response(status_code=204)


def grant_json(item: CoursePermission) -> dict[str, object]:
    return {
        "id": item.id,
        "userId": item.user_id,
        "permissionKey": item.key,
        "startsAt": utc(item.starts_at).isoformat(),
        "expiresAt": utc(item.expires_at).isoformat() if item.expires_at else None,
        "revokedAt": utc(item.revoked_at).isoformat() if item.revoked_at else None,
    }


@router.get("/courses/{course_id}/permission-grants")
def grants(course_id: UUID, db: DB, user: Principal) -> dict[str, object]:
    course = course_for(db, course_id, user, "course.manage")
    return {
        "allowedKeys": sorted(PERMISSIONS),
        "items": [
            grant_json(item)
            for item in db.scalars(
                select(CoursePermission)
                .where(CoursePermission.course_id == course.id)
                .order_by(CoursePermission.id)
            )
        ],
    }


@router.post("/courses/{course_id}/permission-grants", status_code=201)
def add_grant(
    course_id: UUID, body: PermissionGrant, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "course.manage", True)
    key = {"course.content.author": "content.author", "course.roster.read": "roster.read"}.get(
        body.permissionKey, body.permissionKey
    )
    if key not in PERMISSIONS:
        raise HTTPException(422, "permission_not_allowlisted")
    target = db.get(User, str(body.userId))
    item = db.get(CourseStaff, (course.id, str(body.userId)))
    if (
        not target
        or target.status != "active"
        or not item
        or not item.active
        or item.role not in target.roles
    ):
        raise HTTPException(422, "active_staff_required")
    start = instant(body.startsAt) if body.startsAt else now()
    end = instant(body.expiresAt) if body.expiresAt else None
    if end and (end <= start or end <= now()):
        raise HTTPException(422, "invalid_time_range")
    grant = CoursePermission(
        course_id=course.id, user_id=str(body.userId), key=key, starts_at=start, expires_at=end
    )
    db.add(grant)
    db.flush()
    touch(course)
    audit(
        db,
        request,
        "course_permission_granted",
        user,
        {"courseId": course.id, "grantId": grant.id, "reason": body.reason},
    )
    return grant_json(grant)


@router.delete("/courses/{course_id}/permission-grants/{grant_id}", status_code=204)
def revoke_grant(
    course_id: UUID, grant_id: UUID, body: Reason, request: Request, db: DB, user: Principal
) -> Response:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "course.manage", True)
    grant = db.get(CoursePermission, str(grant_id))
    if not grant or grant.course_id != course.id:
        raise HTTPException(404, "grant_not_found")
    grant.revoked_at = now()
    touch(course)
    audit(
        db,
        request,
        "course_permission_revoked",
        user,
        {"courseId": course.id, "grantId": grant.id, "reason": body.reason},
    )
    return Response(status_code=204)


@router.get("/courses/{course_id}/enrollments")
def roster(
    course_id: UUID,
    db: DB,
    user: Principal,
    status: str | None = None,
    cursor: UUID | None = None,
    pageSize: int = Query(default=25, ge=1, le=100),
) -> dict[str, object]:
    course = course_for(db, course_id, user, "roster.read")
    statement = (
        select(CourseMembership, User)
        .join(User, User.id == CourseMembership.user_id)
        .where(CourseMembership.course_id == course.id)
        .order_by(User.id)
    )
    if status:
        if status not in {"invited", "active", "withdrawn", "completed"}:
            raise HTTPException(422, "validation_failed")
        statement = statement.where(CourseMembership.status == status)
    if cursor:
        statement = statement.where(User.id > str(cursor))
    items = list(db.execute(statement.limit(pageSize + 1)))
    return {
        "items": [
            {**person(account), "status": item.status, "sectionId": item.section_id}
            for item, account in items[:pageSize]
        ],
        "nextCursor": items[pageSize - 1][1].id if len(items) > pageSize else None,
    }


@router.post("/courses/{course_id}/enrollments", status_code=201)
def enroll(
    course_id: UUID, body: Enrollment, request: Request, db: DB, user: Principal
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "enrollment.manage", True)
    target = active_user(db, body.userId, "student")
    item = db.get(CourseMembership, (course.id, target.id))
    if item and item.status in {"active", "invited"}:
        raise HTTPException(409, "already_enrolled")
    write_enrollment(db, course, target, body.status, body.sectionId, "manual")
    item = db.get(CourseMembership, (course.id, target.id))
    assert item is not None
    audit(
        db,
        request,
        "course_student_enrolled",
        user,
        {"courseId": course.id, "userId": target.id, "status": item.status},
    )
    return {**person(target), "status": item.status, "sectionId": item.section_id}


@router.patch("/courses/{course_id}/enrollments/{user_id}")
def change_enrollment(
    course_id: UUID,
    user_id: UUID,
    body: EnrollmentChange,
    request: Request,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    lock_actor(db, request, user)
    course = course_for(db, course_id, user, "enrollment.manage", True)
    item = db.get(CourseMembership, (course.id, str(user_id)))
    if not item:
        raise HTTPException(404, "enrollment_not_found")
    if body.status == "active":
        active_user(db, user_id, "student")
    target = db.get(User, str(user_id))
    assert target is not None
    write_enrollment(db, course, target, body.status, item.section_id, "manual")
    audit(
        db,
        request,
        "course_enrollment_updated",
        user,
        {
            "courseId": course.id,
            "userId": str(user_id),
            "status": item.status,
            "reason": body.reason,
        },
    )
    return {"userId": str(user_id), "status": item.status}
