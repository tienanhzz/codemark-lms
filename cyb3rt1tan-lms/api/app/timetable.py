"""Bounded weekly view of existing teaching sessions visible to the principal."""

from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from .auth import DB, Principal
from .course_access import instant, visibility
from .models import Course, TeachingSession
from .security import utc

router = APIRouter(prefix="/v1")


@router.get("/timetable")
def timetable(
    db: DB,
    user: Principal,
    from_at: Annotated[datetime, Query(alias="fromAt")],
    to_at: Annotated[datetime, Query(alias="toAt")],
) -> dict[str, object]:
    first, last = instant(from_at), instant(to_at)
    # A calendar week can be 169 hours when daylight saving time ends.
    if last <= first or last - first > timedelta(days=8):
        raise HTTPException(422, "invalid_timetable_range")
    rows = db.execute(
        select(TeachingSession, Course)
        .join(Course, TeachingSession.course_id == Course.id)
        .where(
            visibility(user),
            TeachingSession.status == "scheduled",
            TeachingSession.starts_at < last,
            TeachingSession.ends_at > first,
        )
        .order_by(TeachingSession.starts_at, TeachingSession.id)
    )
    items = []
    for session, course in rows:
        topic = next(
            (
                entry.get("topic")
                for entry in course.lesson_plan
                if entry.get("entryId") == session.plan_entry_id
            ),
            None,
        )
        items.append(
            {
                "id": session.id,
                "courseId": course.id,
                "courseCode": course.code,
                "courseTitle": course.title,
                "title": topic or course.title,
                "startsAt": utc(session.starts_at).isoformat(),
                "endsAt": utc(session.ends_at).isoformat(),
                "room": session.room,
            }
        )
    return {"items": items}
