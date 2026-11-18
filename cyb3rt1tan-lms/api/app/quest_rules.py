"""Executable workbook conditions. Input is supplied only by trusted domain handlers/reviewers."""

import math
from datetime import datetime, timedelta
from typing import Any

from .models import User
from .security import utc

EVENT_CODES = {
    "attendance.confirmed": ["STU_LOGIN_DAILY"],
    "resource.viewed": ["STU_DOC_VIEW"],
    "learning.streak": ["STU_STREAK_7D"],
    "quiz.completed": ["STU_QUIZ_PASS"],
    "assignment.submitted": ["STU_ASSIGN_ONTIME", "STU_ASSIGN_EARLY"],
    "assessment.perfect": ["STU_PERFECT_SCORE"],
    "forum.question.approved": ["STU_FORUM_ASK"],
    "forum.reply.approved": ["STU_FORUM_REPLY", "LEC_REPLY_24H"],
    "peer_review.completed": ["STU_PEER_REVIEW"],
    "forum.best_answer.selected": ["STU_BEST_ANSWER"],
    "checkpoint.submitted": ["STU_MILESTONE_DRAFT"],
    "module.completed": ["STU_MODULE_100"],
    "resource.published": ["LEC_DOC_UPLOAD", "LEC_CASE_STUDY"],
    "quiz.published": ["LEC_QUIZ_CREATE"],
    "grading.batch.released": ["LEC_GRADE_ONTIME", "LEC_GRADE_FAST"],
    "grading.feedback.completed": ["LEC_DEEP_FEEDBACK"],
    "forum.best_answer.pinned": ["LEC_PIN_ANSWER"],
    "poll.published": ["LEC_POLL_CREATE"],
    "class.deadline.finalized": ["LEC_CLASS_DISCIPLINE"],
    "term.rating.finalized": ["LEC_TOP_RATING"],
}
CODE_EVENT = {code: key for key, codes in EVENT_CODES.items() for code in codes}
FAMILIES = {"STU_ASSIGN_EARLY": "STU_ASSIGN_ONTIME", "LEC_GRADE_FAST": "LEC_GRADE_ONTIME"}
CAPS = {"STU_FORUM_ASK": 2, "STU_FORUM_REPLY": 3, "LEC_DOC_UPLOAD": 2, "LEC_CASE_STUDY": 2}
COURSE_SCOPED = {"LEC_DOC_UPLOAD", "LEC_CASE_STUDY", "LEC_POLL_CREATE"}
ROUTES = {
    "STU_LOGIN_DAILY": "/missions?checkin=1",
    "STU_DOC_VIEW": "/missions?resource=1",
    "STU_STREAK_7D": "/student-overview",
    "STU_QUIZ_PASS": "/missions?evidence=STU_QUIZ_PASS",
    "STU_ASSIGN_ONTIME": "/assessments",
    "STU_ASSIGN_EARLY": "/assessments",
    "STU_PERFECT_SCORE": "/assessments",
    "STU_FORUM_ASK": "/community?compose=question",
    "STU_FORUM_REPLY": "/community?filter=questions",
    "STU_PEER_REVIEW": "/missions?evidence=STU_PEER_REVIEW",
    "STU_BEST_ANSWER": "/community?filter=questions",
    "STU_MILESTONE_DRAFT": "/missions?evidence=STU_MILESTONE_DRAFT",
    "STU_MODULE_100": "/missions?evidence=STU_MODULE_100",
    "LEC_DOC_UPLOAD": "/courses",
    "LEC_CASE_STUDY": "/missions?evidence=LEC_CASE_STUDY",
    "LEC_QUIZ_CREATE": "/missions?evidence=LEC_QUIZ_CREATE",
    "LEC_GRADE_ONTIME": "/grading",
    "LEC_GRADE_FAST": "/grading",
    "LEC_DEEP_FEEDBACK": "/grading",
    "LEC_PIN_ANSWER": "/community?filter=questions",
    "LEC_POLL_CREATE": "/community?compose=poll",
    "LEC_REPLY_24H": "/community?filter=questions",
    "LEC_CLASS_DISCIPLINE": "/missions?evidence=LEC_CLASS_DISCIPLINE",
    "LEC_TOP_RATING": "/missions?evidence=LEC_TOP_RATING",
}
# These workflows have no authoritative LMS entity yet. The UI makes independent review explicit.
REVIEW_REQUIRED = {
    "STU_QUIZ_PASS",
    "STU_PEER_REVIEW",
    "STU_MILESTONE_DRAFT",
    "STU_MODULE_100",
    "LEC_CASE_STUDY",
    "LEC_QUIZ_CREATE",
    "LEC_CLASS_DISCIPLINE",
    "LEC_TOP_RATING",
}


def number(data: dict[str, Any], key: str, default: float = -1) -> float:
    value = data.get(key)
    return (
        float(value)
        if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
        else default
    )


def stamp(data: dict[str, Any], key: str) -> datetime | None:
    value = data.get(key)
    try:
        parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value))
        return utc(parsed) if parsed.tzinfo else None
    except (TypeError, ValueError):
        return None


def satisfies(code: str, user: User, data: dict[str, Any]) -> bool:
    content = str(data.get("content", "")).strip()
    # A role snapshot stops retroactive approval after an author's role changes.
    author_role = data.get("author_role")
    if author_role and author_role != ("student" if code.startswith("STU_") else "teacher"):
        return False
    if code == "STU_LOGIN_DAILY":
        return data.get("confirmed") is True
    if code == "STU_DOC_VIEW":
        return number(data, "duration_seconds") >= 30 and data.get("resource_exists") is True
    if code == "STU_STREAK_7D":
        return data.get("verified_days") == 7
    if code == "STU_QUIZ_PASS":
        return (
            data.get("completed") is True
            and 70 <= number(data, "correct_percent") <= 100
            and number(data, "question_count") > 0
        )
    if code in {"STU_ASSIGN_ONTIME", "STU_ASSIGN_EARLY", "STU_MILESTONE_DRAFT"}:
        submitted, deadline = stamp(data, "submitted_at"), stamp(data, "deadline")
        if not submitted or not deadline or submitted >= deadline:
            return False
        if code == "STU_ASSIGN_EARLY":
            return deadline - submitted >= timedelta(hours=24)
        return code != "STU_MILESTONE_DRAFT" or data.get("checkpoint") is True
    if code == "STU_PERFECT_SCORE":
        return (
            data.get("major_assessment") is True
            and number(data, "max_score") > 0
            and number(data, "score") == number(data, "max_score")
        )
    if code == "STU_FORUM_ASK":
        return len(content) >= 50 and bool(data.get("course_id"))
    if code == "STU_FORUM_REPLY":
        return (
            len(content) >= 80
            and bool(data.get("course_id"))
            and bool(data.get("topic_author_id"))
            and data["topic_author_id"] != user.id
            and data.get("topic_author_role", "student") == "student"
        )
    if code == "STU_PEER_REVIEW":
        return (
            len(content) >= 100
            and data.get("assigned") is True
            and data.get("rubric_completed") is True
            and bool(data.get("peer_user_id"))
            and data["peer_user_id"] != user.id
        )
    if code in {"STU_BEST_ANSWER", "LEC_PIN_ANSWER"}:
        return (
            data.get("selector_authorized") is True
            and bool(data.get("topic_id"))
            and bool(data.get("course_id"))
        )
    if code == "STU_MODULE_100":
        return (
            number(data, "required_documents") > 0
            and number(data, "viewed_documents") == number(data, "required_documents")
            and number(data, "required_assignments") >= 0
            and number(data, "submitted_assignments") == number(data, "required_assignments")
        )
    if code in {"LEC_DOC_UPLOAD", "LEC_CASE_STUDY"}:
        return (
            data.get("is_new") is True
            and bool(data.get("course_id"))
            and data.get("resource_kind") == ("lecture" if code == "LEC_DOC_UPLOAD" else "advanced")
        )
    if code == "LEC_QUIZ_CREATE":
        return data.get("published") is True and number(data, "question_count") >= 10
    if code in {"LEC_GRADE_ONTIME", "LEC_GRADE_FAST"}:
        released, deadline = stamp(data, "released_at"), stamp(data, "deadline")
        return bool(
            released
            and deadline
            and number(data, "total_submissions") > 0
            and number(data, "graded_submissions") == number(data, "total_submissions")
            and released <= deadline + timedelta(hours=48 if code == "LEC_GRADE_FAST" else 120)
        )
    if code == "LEC_DEEP_FEEDBACK":
        feedback = data.get("feedback_items")
        return (
            isinstance(feedback, list)
            and bool(feedback)
            and all(isinstance(item, str) and len(item.strip()) >= 100 for item in feedback)
            and data.get("batch_complete") is True
        )
    if code == "LEC_POLL_CREATE":
        return data.get("published") is True and bool(data.get("course_id"))
    if code == "LEC_REPLY_24H":
        asked, replied = stamp(data, "topic_created_at"), stamp(data, "replied_at")
        return bool(
            asked
            and replied
            and timedelta(0) <= replied - asked <= timedelta(hours=24)
            and content
            and data.get("course_id")
            and data.get("topic_author_id") != user.id
            and data.get("topic_author_role", "student") == "student"
        )
    if code == "LEC_CLASS_DISCIPLINE":
        return (
            data.get("major_lab") is True
            and number(data, "total_students") > 0
            and 0.85 < number(data, "ontime_students") / number(data, "total_students") <= 1
        )
    if code == "LEC_TOP_RATING":
        return (
            data.get("term_ended") is True
            and bool(data.get("term_id"))
            and bool(data.get("course_id"))
            and number(data, "response_count") > 0
            and 4.5 <= number(data, "average_rating") <= 5
        )
    return False
