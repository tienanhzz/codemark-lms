"""Learner-owned completion marks for the current course lesson plan."""

import uuid

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select

from .auth import DB, Principal, audit
from .models import Course, CourseMembership, LessonCompletion

router = APIRouter(prefix="/v1")


class CompletionUpdate(BaseModel):
    completed: bool


def _entry(course: Course, entry_id: str) -> dict[str, object]:
    entry = next((item for item in course.lesson_plan if item.get("entryId") == entry_id), None)
    if entry is None or entry.get("status", "published") != "published":
        raise HTTPException(404, "lesson_not_found")
    return entry


@router.get("/courses/{course_id}/lesson-progress/me")
def my_progress(course_id: uuid.UUID, db: DB, user: Principal) -> dict[str, object]:
    if "student" not in user.roles:
        raise HTTPException(403, "student_role_required")
    course = db.get(Course, str(course_id))
    membership = db.get(CourseMembership, (str(course_id), user.id))
    if not course or not membership or membership.status not in {"active", "completed"}:
        raise HTTPException(404, "course_not_found")
    entries = [
        item for item in course.lesson_plan if item.get("status", "published") == "published"
    ]
    completed = set(
        db.scalars(
            select(LessonCompletion.entry_id).where(
                LessonCompletion.course_id == course.id,
                LessonCompletion.user_id == user.id,
            )
        )
    )
    return {
        "courseId": course.id,
        "total": len(entries),
        "completed": len(completed & {str(item["entryId"]) for item in entries}),
        "entries": [
            {
                "entryId": item["entryId"],
                "title": item.get("topic", ""),
                "position": item["position"],
                "completed": item["entryId"] in completed,
            }
            for item in entries
        ],
    }


@router.put("/courses/{course_id}/lesson-progress/me/{entry_id}")
def update_progress(
    course_id: uuid.UUID,
    entry_id: str,
    body: CompletionUpdate,
    request: Request,
    db: DB,
    user: Principal,
) -> dict[str, object]:
    if "student" not in user.roles:
        raise HTTPException(403, "student_role_required")
    course = db.get(Course, str(course_id))
    membership = db.get(CourseMembership, (str(course_id), user.id))
    if not course or not membership or membership.status != "active":
        raise HTTPException(404, "course_not_found")
    _entry(course, str(entry_id))
    row = db.scalar(
        select(LessonCompletion).where(
            LessonCompletion.course_id == course.id,
            LessonCompletion.user_id == user.id,
            LessonCompletion.entry_id == str(entry_id),
        )
    )
    if body.completed and row is None:
        row = LessonCompletion(course_id=course.id, user_id=user.id, entry_id=str(entry_id))
        db.add(row)
        db.flush()
        from .missions import record_domain_event

        record_domain_event(db, request, user, "lesson.completed", row.id)
    elif not body.completed and row is not None:
        db.delete(row)
    audit(
        db,
        request,
        "lesson_progress_updated",
        user,
        {"courseId": course.id, "entryId": str(entry_id), "completed": body.completed},
    )
    return {"entryId": str(entry_id), "completed": body.completed}
