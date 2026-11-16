"""Privacy-filtered learning summaries for learners and authorized course staff."""

from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from .auth import DB, Principal
from .course_access import course_for, permissions
from .models import (
    Assessment,
    AssessmentAttempt,
    AssessmentGradeRelease,
    AssessmentRecipient,
    AssessmentVersion,
    AttendanceHistory,
    AttendanceRecord,
    AttendanceWindow,
    Course,
    CourseMembership,
    LessonCompletion,
    PracticeAttempt,
    User,
    now,
)
from .security import utc

router = APIRouter(prefix="/v1")


def _period(fromAt: datetime | None, toAt: datetime | None) -> tuple[datetime, datetime]:
    if (fromAt is None) != (toAt is None):
        raise HTTPException(422, "both_period_bounds_required")
    end = utc(toAt) if toAt else now()
    start = utc(fromAt) if fromAt else end - timedelta(days=30)
    if start >= end:
        raise HTTPException(422, "invalid_period")
    if end - start > timedelta(days=366):
        raise HTTPException(422, "period_too_large")
    return start, end


def _student_course(db: DB, course: Course, learner_id: str, start: datetime, end: datetime, viewer: User, self_view: bool) -> dict[str, object]:
    membership = db.get(CourseMembership, (course.id, learner_id))
    if not membership:
        raise HTTPException(404, "student_not_in_course")
    allowed = permissions(db, course, viewer)
    attendance_allowed = self_view or "attendance.read" in allowed
    grade_allowed = self_view or "grading.manage" in allowed
    windows = list(db.scalars(select(AttendanceWindow).where(
        AttendanceWindow.course_id == course.id,
        AttendanceWindow.opens_at >= start,
        AttendanceWindow.opens_at < end,
    ).order_by(AttendanceWindow.opens_at.desc())))
    window_ids = [window.id for window in windows]
    attendance_rows = list(db.scalars(select(AttendanceRecord).where(
        AttendanceRecord.window_id.in_(window_ids),
        AttendanceRecord.user_id == learner_id,
    ))) if window_ids else []
    eligible_windows = [window for window in windows if window.status == "closed" or utc(window.closes_at) <= now()]
    by_window = {record.window_id: record for record in attendance_rows}
    counts = {status: sum(1 for window in eligible_windows if by_window.get(window.id) and by_window[window.id].status == status) for status in ("present", "late", "absent", "excused")}
    counts["unrecorded"] = sum(1 for window in eligible_windows if window.id not in by_window)
    denominator = len(eligible_windows) - counts["excused"]
    attendance = {
        "availability": "available",
        "eligibleSessions": len(eligible_windows),
        "counts": counts,
        "attendanceRate": round((counts["present"] + counts["late"]) / denominator * 100, 2) if denominator else None,
        "sessions": [{"windowId": window.id, "title": window.title, "opensAt": utc(window.opens_at).isoformat(), "status": by_window[window.id].status if window.id in by_window else "unrecorded"} for window in eligible_windows],
    } if attendance_allowed else {"availability": "not_authorized"}

    practice = list(db.scalars(select(PracticeAttempt).where(
        PracticeAttempt.course_id == course.id,
        PracticeAttempt.user_id == learner_id,
        PracticeAttempt.created_at >= start,
        PracticeAttempt.created_at < end,
    )))
    practice_max = sum(item.max_points for item in practice)
    practice_score = sum(item.score for item in practice)
    practice_summary = {
        "totalAttempts": len(practice),
        "uniqueQuestions": len({item.question_version_id for item in practice}),
        "completions": len(practice),
        "passes": sum(1 for item in practice if item.score >= item.max_points),
        "accuracy": round(practice_score / practice_max * 100, 2) if practice_max else None,
    }

    lessons = [item for item in course.lesson_plan if item.get("status", "published") == "published"]
    lesson_ids = {str(item["entryId"]) for item in lessons}
    completions = list(db.scalars(select(LessonCompletion).where(
        LessonCompletion.course_id == course.id, LessonCompletion.user_id == learner_id,
        LessonCompletion.entry_id.in_(lesson_ids),
        LessonCompletion.completed_at >= start, LessonCompletion.completed_at < end,
    ))) if lesson_ids else []
    completed_ids = {item.entry_id for item in completions}

    recipient_rows = db.execute(
        select(AssessmentRecipient, Assessment, AssessmentVersion)
        .join(Assessment, Assessment.id == AssessmentRecipient.assessment_id)
        .join(AssessmentVersion, AssessmentVersion.id == AssessmentRecipient.version_id)
        .where(AssessmentRecipient.user_id == learner_id, Assessment.course_id == course.id)
    )
    recipients = list(recipient_rows)
    recipient_ids = [recipient.id for recipient, _assessment, _version in recipients]
    attempts = list(db.scalars(select(AssessmentAttempt).where(
        AssessmentAttempt.recipient_id.in_(recipient_ids),
        AssessmentAttempt.started_at >= start,
        AssessmentAttempt.started_at < end,
    ))) if recipient_ids else []
    attempts_by_recipient: dict[str, list[AssessmentAttempt]] = {}
    for attempt in attempts:
        attempts_by_recipient.setdefault(attempt.recipient_id, []).append(attempt)
    releases = list(db.scalars(select(AssessmentGradeRelease).where(AssessmentGradeRelease.attempt_id.in_([attempt.id for attempt in attempts])))) if attempts else []
    released_ids = {release.attempt_id for release in releases}
    submitted = [attempt for attempt in attempts if attempt.status in {"submitted", "forceSubmitted"}]
    overdue = sum(1 for recipient, _assessment, version in recipients
                  if version.closes_at and utc(version.closes_at) < end
                  and not any(attempt.status in {"submitted", "forceSubmitted"} for attempt in attempts_by_recipient.get(recipient.id, [])))
    assessments: dict[str, object] = {
        "assigned": len(recipients),
        "started": sum(1 for values in attempts_by_recipient.values() if values),
        "submitted": len(submitted),
        "graded": sum(1 for attempt in submitted if attempt.id in released_ids),
        "missingOrOverdue": overdue,
        "pendingGrading": sum(1 for attempt in submitted if attempt.id not in released_ids) if grade_allowed else None,
    }
    if grade_allowed:
        assessments["results"] = [{"title": version.title, "kind": assessment.kind,
                                  "dueAt": utc(version.closes_at).isoformat() if version.closes_at else None,
                                  "attemptStatus": max(attempts_by_recipient.get(recipient.id, []), key=lambda item: item.attempt_number).status if attempts_by_recipient.get(recipient.id) else "pending",
                                  "score": next((release.released_score for release in releases if release.attempt_id in {item.id for item in attempts_by_recipient.get(recipient.id, [])}), None),
                                  "maxPoints": next((release.max_points for release in releases if release.attempt_id in {item.id for item in attempts_by_recipient.get(recipient.id, [])}), None)}
                                 for recipient, assessment, version in recipients]

    activity: list[dict[str, str]] = []
    activity.extend({"kind": "practice", "at": utc(item.created_at).isoformat(), "label": "Practice attempt"} for item in practice)
    attendance_history = list(db.scalars(select(AttendanceHistory).where(
        AttendanceHistory.record_id.in_([record.id for record in attendance_rows]),
        AttendanceHistory.created_at >= start,
        AttendanceHistory.created_at < end,
    ))) if attendance_rows else []
    activity.extend({"kind": "attendance", "at": utc(item.created_at).isoformat(), "label": "Attendance: " + item.status} for item in attendance_history)
    activity.extend({"kind": "assessment", "at": utc(item.submitted_at or item.started_at).isoformat(), "label": "Assessment: " + item.status} for item in attempts)
    activity.sort(key=lambda item: item["at"], reverse=True)
    return {
        "courseId": course.id,
        "courseCode": course.code,
        "courseTitle": course.title,
        "membership": {"status": membership.status, "joinedAt": utc(membership.joined_at).isoformat() if membership.joined_at else None, "endedAt": utc(membership.ended_at).isoformat() if membership.ended_at else None},
        "attendance": attendance,
        "practice": practice_summary,
        "lessonProgress": {"availability": "available", "total": len(lessons),
                           "completed": len(completed_ids), "completionRate": round(len(completed_ids) / len(lessons) * 100, 2) if lessons else None},
        "assessments": assessments,
        "lastActivityAt": activity[0]["at"] if activity else None,
        "recentActivity": activity[:20],
    }


@router.get("/learning-overview/me")
def my_learning_overview(
    db: DB, user: Principal, courseId: UUID | None = None,
    fromAt: datetime | None = None, toAt: datetime | None = None,
) -> dict[str, object]:
    if "student" not in user.roles:
        raise HTTPException(403, "student_role_required")
    start, end = _period(fromAt, toAt)
    statement = select(Course, CourseMembership).join(CourseMembership, CourseMembership.course_id == Course.id).where(
        CourseMembership.user_id == user.id,
        CourseMembership.status.in_(["active", "completed", "withdrawn"]),
    ).order_by(Course.code)
    if courseId:
        statement = statement.where(Course.id == str(courseId))
    results = db.execute(statement)
    items = [_student_course(db, course, user.id, start, end, user, True) for course, _membership in results]
    return {"period": {"fromAt": start.isoformat(), "toAt": end.isoformat()}, "items": items}


@router.get("/courses/{course_id}/learning-overview/{student_id}")
def course_student_learning_overview(
    course_id: UUID, student_id: UUID, db: DB, user: Principal,
    fromAt: datetime | None = None, toAt: datetime | None = None,
) -> dict[str, object]:
    start, end = _period(fromAt, toAt)
    course = course_for(db, course_id, user, "roster.read")
    learner = db.get(User, str(student_id))
    if not learner or "student" not in learner.roles or learner.status != "active":
        raise HTTPException(404, "student_not_found")
    summary = _student_course(db, course, learner.id, start, end, user, False)
    return {"period": {"fromAt": start.isoformat(), "toAt": end.isoformat()}, "student": {"id": learner.id, "officialName": learner.official_name, "institutionalId": learner.institutional_id}, "item": summary}
