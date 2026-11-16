"""Persist learner completion of published course lesson-plan entries."""

import sqlalchemy as sa
from alembic import op

revision = "0023_lesson_completion"
down_revision = "0022_learning_reports_audit"


def upgrade() -> None:
    op.create_table(
        "lesson_completions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("course_id", sa.String(36), sa.ForeignKey("courses.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("entry_id", sa.String(64), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("course_id", "user_id", "entry_id", name="uq_lesson_completion_entry"),
    )
    op.create_index("ix_lesson_completions_course_user", "lesson_completions", ["course_id", "user_id"])


def downgrade() -> None:
    op.drop_index("ix_lesson_completions_course_user", table_name="lesson_completions")
    op.drop_table("lesson_completions")
