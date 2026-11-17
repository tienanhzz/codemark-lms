"""Support pre-close excusals and attendance late-grace policy."""

import sqlalchemy as sa
from alembic import op

revision = "0021_attendance_lifecycle"
down_revision = "0020_attendance"


def upgrade() -> None:
    op.add_column(
        "attendance_windows",
        sa.Column("late_grace_minutes", sa.Integer(), nullable=False, server_default="0"),
    )
    op.alter_column(
        "attendance_excusal_requests", "record_id", existing_type=sa.String(36), nullable=True
    )
    op.add_column(
        "attendance_excusal_requests",
        sa.Column(
            "window_id",
            sa.String(36),
            sa.ForeignKey("attendance_windows.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )
    op.execute(
        "UPDATE attendance_excusal_requests SET window_id = attendance_records.window_id FROM attendance_records WHERE attendance_records.id = attendance_excusal_requests.record_id"
    )
    op.alter_column("attendance_excusal_requests", "window_id", nullable=False)
    op.create_index(
        "ix_attendance_excusal_requests_window_id", "attendance_excusal_requests", ["window_id"]
    )


def downgrade() -> None:
    op.drop_index(
        "ix_attendance_excusal_requests_window_id", table_name="attendance_excusal_requests"
    )
    op.drop_column("attendance_excusal_requests", "window_id")
    op.alter_column(
        "attendance_excusal_requests", "record_id", existing_type=sa.String(36), nullable=False
    )
    op.drop_column("attendance_windows", "late_grace_minutes")
