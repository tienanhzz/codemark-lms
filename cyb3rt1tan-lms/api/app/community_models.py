"""Moderated community content, separate from public announcements."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, now


class CommunityPost(Base):
    __tablename__ = "community_posts"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'published', 'rejected')", name="ck_community_status"
        ),
        CheckConstraint(
            "author_role IN ('student', 'teacher', 'admin', 'staff')", name="ck_community_role"
        ),
        CheckConstraint("length(body) BETWEEN 50 AND 10000", name="ck_community_body"),
        CheckConstraint("kind IN ('question', 'discussion', 'answer')", name="ck_community_kind"),
        CheckConstraint(
            "(parent_id IS NULL AND length(title) BETWEEN 3 AND 180 AND kind != 'answer') OR (parent_id IS NOT NULL AND length(body) >= 80 AND kind = 'answer')",
            name="ck_community_content_shape",
        ),
        Index("ix_community_feed", "parent_id", "status", "created_at", "id"),
        Index("ix_community_author", "author_id", "created_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("community_posts.id", ondelete="RESTRICT")
    )
    course_id: Mapped[str | None] = mapped_column(
        ForeignKey("courses.id", ondelete="RESTRICT"), index=True
    )
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    author_role: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(180), default="")
    kind: Mapped[str] = mapped_column(String(20), default="question")
    body: Mapped[str] = mapped_column(String(10000))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    moderation_reason: Mapped[str] = mapped_column(String(1000), default="")
    best_answer_id: Mapped[str | None] = mapped_column(String(36))
