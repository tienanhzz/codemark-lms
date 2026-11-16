"""Read-only home highlights from EXP history and evergreen study guidance."""

import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal, TypedDict

from fastapi import APIRouter
from sqlalchemy import String, cast, func, or_, select

from .auth import DB, Principal
from .models import EconomyLedger, User, now

router = APIRouter()


class Localized(TypedDict):
    en: str
    vi: str


class Highlight(TypedDict):
    id: str
    kind: Literal["rank_change", "congratulations", "study_tip"]
    title: Localized
    body: Localized
    createdAt: str | None
    href: str


@dataclass(frozen=True)
class Member:
    id: str
    username: str
    nickname: str | None
    roles: list[str]


def _display(member: Member, role: str) -> str:
    # Match the leaderboard: imported email usernames/nicknames stay private.
    username = member.username if re.fullmatch(r"[A-Za-z0-9._-]{1,128}", member.username) else None
    nickname = member.nickname.strip() if member.nickname else None
    if nickname and "@" in nickname:
        nickname = None
    return (
        nickname or username or f"{'Student' if role == 'student' else 'Teacher'} {member.id[:8]}"
    )


def _positions(scores: dict[str, int], ids: list[str]) -> dict[str, int]:
    """SQL RANK semantics: equal EXP shares a position, then leaves a gap."""
    ordered = sorted((scores[user_id] for user_id in ids), reverse=True)
    positions: dict[int, int] = {}
    for index, score in enumerate(ordered, 1):
        positions.setdefault(score, index)
    return {user_id: positions[scores[user_id]] for user_id in ids}


def _names(names: list[str], locale: str, maximum: int = 6) -> str:
    result = ", ".join(names[:maximum])
    remaining = len(names) - maximum
    if remaining > 0:
        result += f"; and {remaining} others" if locale == "en" else f"; và {remaining} người khác"
    return result


def _tips() -> list[Highlight]:
    return [
        {
            "id": "study-timetable",
            "kind": "study_tip",
            "createdAt": None,
            "href": "/calendar",
            "title": {"en": "Plan your learning week", "vi": "Sắp xếp tuần học của bạn"},
            "body": {
                "en": "Check your weekly timetable and leave time to prepare before each class.",
                "vi": "Xem thời khóa biểu tuần và dành thời gian chuẩn bị trước mỗi buổi học.",
            },
        },
        {
            "id": "study-materials",
            "kind": "study_tip",
            "createdAt": None,
            "href": "/courses",
            "title": {"en": "Prepare your materials", "vi": "Chuẩn bị tài liệu học tập"},
            "body": {
                "en": "Open your course materials, read the next lesson and note questions to discuss.",
                "vi": "Mở tài liệu lớp học, đọc bài tiếp theo và ghi lại câu hỏi cần trao đổi.",
            },
        },
        {
            "id": "study-review",
            "kind": "study_tip",
            "createdAt": None,
            "href": "/courses",
            "title": {"en": "Make time to review", "vi": "Dành thời gian ôn tập"},
            "body": {
                "en": "Review assignment feedback and revisit topics you want to practice further.",
                "vi": "Xem lại phản hồi bài tập và ôn những nội dung bạn muốn luyện tập thêm.",
            },
        },
    ]


@router.get("/highlights")
def home_highlights(db: DB, user: Principal) -> dict[str, list[Highlight]]:
    # Both the balances and bounded history are read in ONE SQL statement so a
    # concurrent award cannot be present in only one side of the reconstruction.
    cohort = [
        User.status == "active",
        or_(
            cast(User.roles, String).contains('"student"'),
            cast(User.roles, String).contains('"teacher"'),
        ),
    ]
    recent = (
        select(
            EconomyLedger.id, EconomyLedger.user_id, EconomyLedger.delta, EconomyLedger.created_at
        )
        .join(User, User.id == EconomyLedger.user_id)
        .where(
            *cohort,
            EconomyLedger.currency == "exp",
            EconomyLedger.created_at >= now() - timedelta(days=30),
        )
        .order_by(EconomyLedger.created_at.desc(), EconomyLedger.id.desc())
        .limit(50)
        .subquery()
    )
    balances = (
        select(EconomyLedger.user_id, func.sum(EconomyLedger.delta).label("exp"))
        .where(EconomyLedger.currency == "exp")
        .group_by(EconomyLedger.user_id)
        .subquery()
    )
    rows = db.execute(
        select(
            User.id,
            User.username,
            User.nickname,
            User.roles,
            func.coalesce(balances.c.exp, 0),
            recent.c.id,
            recent.c.delta,
            recent.c.created_at,
        )
        .outerjoin(balances, balances.c.user_id == User.id)
        .outerjoin(recent, recent.c.user_id == User.id)
        .where(*cohort)
    )
    members: dict[str, Member] = {}
    scores: dict[str, int] = {}
    events: dict[str, tuple[str, int, datetime]] = {}
    for user_id, username, nickname, roles, score, event_id, delta, created_at in rows:
        members[user_id] = Member(user_id, username, nickname, roles)
        scores[user_id] = int(score)
        if event_id:
            events[event_id] = (user_id, int(delta), created_at)
    cohorts = {
        role: [member.id for member in members.values() if role in member.roles]
        for role in ["student", "teacher"]
    }
    summaries: list[Highlight] = []
    for role, ids in cohorts.items():
        positions = _positions(scores, ids)
        leaders = sorted(
            (member_id for member_id in ids if positions[member_id] <= 5 and scores[member_id] > 0),
            key=lambda member_id: (-scores[member_id], members[member_id].username, member_id),
        )
        if not leaders:
            continue
        names = [_display(members[member_id], role) for member_id in leaders]
        summaries.append(
            {
                "id": f"top-five-{role}",
                "kind": "congratulations",
                "createdAt": None,
                "href": "/leaderboard" if role == "student" else "/leaderboard?track=staff",
                "title": {
                    "en": f"Congratulations to the {'Student' if role == 'student' else 'Teacher'} Top 5",
                    "vi": f"Chúc mừng Top 5 {'sinh viên' if role == 'student' else 'giảng viên'}",
                },
                "body": {
                    "en": "Recognizing the current EXP standings: " + _names(names, "en", 5) + ".",
                    "vi": "Ghi nhận thứ hạng EXP hiện tại: " + _names(names, "vi", 5) + ".",
                },
            }
        )
    movements: list[Highlight] = []
    for event_id, (target_id, delta, created_at) in sorted(
        events.items(), key=lambda entry: (entry[1][2], entry[0]), reverse=True
    ):
        after = {role: _positions(scores, ids) for role, ids in cohorts.items()}
        scores[target_id] -= delta
        parts: dict[str, list[str]] = {"en": [], "vi": []}
        changed_roles: list[str] = []
        for role, ids in cohorts.items():
            if role not in members[target_id].roles:
                continue
            before = _positions(scores, ids)
            changed = [
                member_id
                for member_id in ids
                if before[member_id] != after[role][member_id]
                and min(before[member_id], after[role][member_id]) <= 5
            ]
            if not changed:
                continue
            changed_roles.append(role)
            changed.sort(
                key=lambda member_id: (
                    after[role][member_id] >= before[member_id],
                    after[role][member_id],
                    members[member_id].username,
                    member_id,
                )
            )
            names = [
                f"{_display(members[member_id], role)} "
                f"(#{before[member_id]} → #{after[role][member_id]})"
                for member_id in changed
            ]
            improved = [
                member_id for member_id in changed if after[role][member_id] < before[member_id]
            ]
            parts["en"].append(
                f"{'Student' if role == 'student' else 'Teacher'} positions: {_names(names, 'en')}."
                + (" Congratulations on moving up!" if improved else "")
            )
            parts["vi"].append(
                f"Thứ hạng {'sinh viên' if role == 'student' else 'giảng viên'}: {_names(names, 'vi')}."
                + (" Chúc mừng những bước tiến mới!" if improved else "")
            )
        if parts["en"]:
            movements.append(
                {
                    "id": f"rank-event-{event_id}",
                    "kind": "rank_change",
                    "title": {"en": "Top 5 positions changed", "vi": "Thay đổi thứ hạng Top 5"},
                    "body": {"en": " ".join(parts["en"]), "vi": " ".join(parts["vi"])},
                    "createdAt": created_at.isoformat(),
                    "href": "/leaderboard?track=staff"
                    if changed_roles == ["teacher"]
                    else "/leaderboard",
                }
            )
        if len(movements) >= 5 - len(summaries):
            break
    return {"items": movements + summaries + _tips()}
