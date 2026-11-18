"""Moderated community topics and answers."""

import sqlalchemy as sa
from alembic import op

revision = "0053_community"
down_revision = "0052_workbook_quests"


def upgrade() -> None:
    op.create_table(
        "community_posts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "parent_id", sa.String(36), sa.ForeignKey("community_posts.id", ondelete="RESTRICT")
        ),
        sa.Column("course_id", sa.String(36), sa.ForeignKey("courses.id", ondelete="RESTRICT")),
        sa.Column(
            "author_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("author_role", sa.String(20), nullable=False),
        sa.Column("title", sa.String(180), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("body", sa.String(10000), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("reviewed_by", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column("moderation_reason", sa.String(1000), nullable=False),
        sa.Column("best_answer_id", sa.String(36)),
        sa.CheckConstraint(
            "status IN ('pending', 'published', 'rejected')", name="ck_community_status"
        ),
        sa.CheckConstraint(
            "author_role IN ('student', 'teacher', 'admin', 'staff')", name="ck_community_role"
        ),
        sa.CheckConstraint("length(body) BETWEEN 50 AND 10000", name="ck_community_body"),
        sa.CheckConstraint(
            "kind IN ('question', 'discussion', 'answer')", name="ck_community_kind"
        ),
        sa.CheckConstraint(
            "(parent_id IS NULL AND length(title) BETWEEN 3 AND 180 AND kind != 'answer') OR (parent_id IS NOT NULL AND length(body) >= 80 AND kind = 'answer')",
            name="ck_community_content_shape",
        ),
    )
    op.create_index(
        "ix_community_feed", "community_posts", ["parent_id", "status", "created_at", "id"]
    )
    op.create_index("ix_community_author", "community_posts", ["author_id", "created_at"])
    op.create_index("ix_community_posts_course_id", "community_posts", ["course_id"])


def downgrade() -> None:
    op.drop_table("community_posts")
