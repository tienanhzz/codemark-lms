"""Course-authorized staff profiles and photos; private contact fields never project."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request, Response
from sqlalchemy import ColumnElement, String, and_, cast, or_, select

from .auth import DB, Principal, lock_principal
from .avatars import image_response
from .course_access import course_for, visibility
from .identity_views import CourseStaffProfiles
from .models import Course, CourseStaff, User, UserAvatar, UserProfile

router = APIRouter(prefix="/v1/courses")


def teacher(user: User) -> bool:
    return user.status == "active" and "teacher" in user.roles


def staff_role(db: DB, course: Course, target: User) -> str | None:
    if target.status != "active":
        return None
    if target.id == course.owner_id and teacher(target):
        return "teacher"
    item = db.get(CourseStaff, (course.id, target.id))
    return (
        item.role
        if item
        and item.active
        and item.role in {"teacher", "teachingAssistant"}
        and item.role in target.roles
        else None
    )


def taught_courses(db: DB, viewer: User, target: User) -> list[Course]:
    staff_ids = select(CourseStaff.course_id).where(
        CourseStaff.user_id == target.id,
        CourseStaff.active.is_(True),
        CourseStaff.role.in_(
            [role for role in target.roles if role in {"teacher", "teachingAssistant"}]
        ),
    )
    clauses: list[ColumnElement[bool]] = [Course.id.in_(staff_ids)]
    if teacher(target):
        clauses.append(Course.owner_id == target.id)
    return list(
        db.scalars(
            select(Course).where(visibility(viewer), or_(*clauses)).order_by(Course.id).limit(26)
        )
    )


@router.get("/{course_id}/teaching-team", response_model=CourseStaffProfiles)
def profiles(
    course_id: UUID,
    request: Request,
    db: DB,
    user: Principal,
    cursor: UUID | None = None,
    pageSize: int = Query(default=25, ge=1, le=50),
) -> dict[str, object]:
    lock_principal(db, request, user)
    course = course_for(db, course_id, user)
    roles = cast(User.roles, String)
    statement = (
        select(User)
        .outerjoin(
            CourseStaff,
            and_(
                CourseStaff.user_id == User.id,
                CourseStaff.course_id == course.id,
                CourseStaff.active.is_(True),
            ),
        )
        .where(
            User.status == "active",
            or_(
                and_(User.id == course.owner_id, roles.contains('"teacher"', autoescape=True)),
                and_(CourseStaff.role == "teacher", roles.contains('"teacher"', autoescape=True)),
                and_(
                    CourseStaff.role == "teachingAssistant",
                    roles.contains('"teachingAssistant"', autoescape=True),
                ),
            ),
        )
        .order_by(User.id)
    )
    if cursor:
        statement = statement.where(User.id > str(cursor))
    targets = list(db.scalars(statement.limit(pageSize + 1)))
    items = []
    for target in targets[:pageSize]:
        item = db.get(UserProfile, target.id)
        avatar_id = db.scalar(select(UserAvatar.id).where(UserAvatar.user_id == target.id))
        courses = taught_courses(db, user, target)
        items.append(
            {
                "id": target.id,
                "officialName": target.official_name,
                "academicTitle": item.academic_title if item else "",
                "role": staff_role(db, course, target),
                "owner": target.id == course.owner_id,
                "email": target.email if item and item.show_email_in_courses else None,
                "avatarUrl": f"/v1/courses/{course.id}/teaching-team/{target.id}/avatar/{avatar_id}"
                if avatar_id
                else None,
                "courses": [
                    {"id": c.id, "courseCode": c.code, "title": c.title} for c in courses[:25]
                ],
                "hasMoreCourses": len(courses) > 25,
            }
        )
    return {
        "items": items,
        "nextCursor": targets[pageSize - 1].id if len(targets) > pageSize else None,
    }


@router.get("/{course_id}/teaching-team/{user_id}/avatar/{avatar_id}")
def photo(
    course_id: UUID, user_id: UUID, avatar_id: UUID, request: Request, db: DB, user: Principal
) -> Response:
    lock_principal(db, request, user)
    course = course_for(db, course_id, user)
    target = db.get(User, str(user_id))
    if target is None or staff_role(db, course, target) is None:
        raise HTTPException(404, "avatar_not_found")
    avatar = db.get(UserAvatar, target.id)
    if avatar is None or avatar.id != str(avatar_id):
        raise HTTPException(404, "avatar_not_found")
    return image_response(avatar)
