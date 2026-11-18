"""Workbook quest catalog, source receipts and independently reviewed evidence."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, now


class QuestDefinition(Base):
    __tablename__ = "quest_definitions"
    __table_args__ = (
        CheckConstraint("target_role IN ('student','teacher')", name="ck_quest_role"),
        CheckConstraint(
            "reset_type IN ('DAILY','WEEKLY','PER_ENTITY','UPGRADE_TIER','END_OF_TERM')",
            name="ck_quest_reset",
        ),
        CheckConstraint("reward_exp >= 0 AND reward_coin >= 0", name="ck_quest_rewards"),
    )
    quest_code: Mapped[str] = mapped_column(String(64), primary_key=True)
    target_role: Mapped[str] = mapped_column(String(20))
    category: Mapped[str] = mapped_column(String(100))
    quest_name: Mapped[str] = mapped_column(String(240))
    condition_desc: Mapped[str] = mapped_column(String(3000))
    reset_type: Mapped[str] = mapped_column(String(20))
    limit_rule: Mapped[str] = mapped_column(String(1000))
    reward_exp: Mapped[int] = mapped_column(default=0)
    reward_coin: Mapped[int] = mapped_column(default=0)
    active: Mapped[bool] = mapped_column(default=True)
    revision: Mapped[int] = mapped_column(default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class QuestCompletion(Base):
    __tablename__ = "quest_completions"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "group_key", "cycle_key", "slot_key", name="uq_quest_completion_slot"
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    quest_code: Mapped[str] = mapped_column(
        ForeignKey("quest_definitions.quest_code", ondelete="RESTRICT")
    )
    group_key: Mapped[str] = mapped_column(String(64))
    cycle_key: Mapped[str] = mapped_column(String(220))
    slot_key: Mapped[str] = mapped_column(String(200))
    source_event_id: Mapped[str] = mapped_column(String(200))
    base_exp: Mapped[int] = mapped_column(default=0)
    base_coin: Mapped[int] = mapped_column(default=0)
    exp_awarded: Mapped[int] = mapped_column(default=0)
    coin_awarded: Mapped[int] = mapped_column(default=0)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict[str, Any])


class QuestEventReceipt(Base):
    __tablename__ = "quest_event_receipts"
    __table_args__ = (
        UniqueConstraint("user_id", "event_key", "source_event_id", name="uq_quest_event_source"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    event_key: Mapped[str] = mapped_column(String(80))
    source_event_id: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class QuestActivityDay(Base):
    __tablename__ = "quest_activity_days"
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True
    )
    day: Mapped[str] = mapped_column(String(10), primary_key=True)
    logged_in: Mapped[bool] = mapped_column(default=False)
    active: Mapped[bool] = mapped_column(default=False)


class QuestEvidence(Base):
    __tablename__ = "quest_evidence"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','approved','rejected')", name="ck_quest_evidence_status"
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    quest_code: Mapped[str] = mapped_column(
        ForeignKey("quest_definitions.quest_code", ondelete="RESTRICT")
    )
    course_id: Mapped[str | None] = mapped_column(
        ForeignKey("courses.id", ondelete="RESTRICT"), nullable=True
    )
    entity_id: Mapped[str] = mapped_column(String(160))
    evidence_url: Mapped[str] = mapped_column(String(2000))
    description: Mapped[str] = mapped_column(String(4000))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    reviewer_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    review_note: Mapped[str | None] = mapped_column(String(4000), nullable=True)
    verified_data: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class QuestResourceView(Base):
    """Server-timed authenticated view, retaining a resource snapshot across course edits."""

    __tablename__ = "quest_resource_views"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id", ondelete="RESTRICT"))
    resource_id: Mapped[str] = mapped_column(String(36))
    resource_key: Mapped[str] = mapped_column(String(64))
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
