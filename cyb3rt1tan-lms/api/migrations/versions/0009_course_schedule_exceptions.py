"""Recurring teaching sessions and auditable per-session exceptions."""

import sqlalchemy as sa
from alembic import op

revision = "0009_course_schedule_exceptions"
down_revision = "0008_protected_avatars"


def upgrade() -> None:
    op.add_column("teaching_sessions", sa.Column("recurrence_series_id", sa.String(36)))
    op.add_column("teaching_sessions", sa.Column("recurrence_index", sa.Integer()))
    op.add_column(
        "teaching_sessions",
        sa.Column("status", sa.String(20), nullable=False, server_default="scheduled"),
    )
    op.add_column("teaching_sessions", sa.Column("exception_reason", sa.String(500)))
    op.create_index(
        "ix_teaching_sessions_recurrence_series_id",
        "teaching_sessions",
        ["recurrence_series_id"],
    )
    op.create_check_constraint(
        "ck_teaching_session_status", "teaching_sessions", "status IN ('scheduled','cancelled')"
    )
    op.create_check_constraint(
        "ck_teaching_session_recurrence",
        "teaching_sessions",
        "(recurrence_series_id IS NULL AND recurrence_index IS NULL) OR "
        "(recurrence_series_id IS NOT NULL AND recurrence_index BETWEEN 0 AND 51)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_teaching_session_recurrence", "teaching_sessions", type_="check")
    op.drop_constraint("ck_teaching_session_status", "teaching_sessions", type_="check")
    op.drop_index("ix_teaching_sessions_recurrence_series_id", table_name="teaching_sessions")
    op.drop_column("teaching_sessions", "exception_reason")
    op.drop_column("teaching_sessions", "status")
    op.drop_column("teaching_sessions", "recurrence_index")
    op.drop_column("teaching_sessions", "recurrence_series_id")
