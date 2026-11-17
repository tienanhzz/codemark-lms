"""Persistent attendance windows, records, history and excusal decisions."""

import sqlalchemy as sa
from alembic import op

revision = "0020_attendance"
down_revision = "0019_assessment_grading"


def upgrade() -> None:
    op.create_table(
        "attendance_windows",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "course_id",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("opens_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closes_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("token_digest", sa.String(64)),
        sa.Column("token_expires_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column(
            "created_by",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status IN ('open','closed')", name="ck_attendance_window_status"),
        sa.CheckConstraint("closes_at > opens_at", name="ck_attendance_window_time"),
    )
    op.create_index(
        "ix_attendance_windows_course_time", "attendance_windows", ["course_id", "opens_at"]
    )
    op.create_table(
        "attendance_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "window_id",
            sa.String(36),
            sa.ForeignKey("attendance_windows.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "course_id",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("checked_at", sa.DateTime(timezone=True)),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.UniqueConstraint("window_id", "user_id", name="uq_attendance_record_window_user"),
        sa.CheckConstraint(
            "status IN ('present','late','absent','excused')", name="ck_attendance_record_status"
        ),
    )
    op.create_index(
        "ix_attendance_records_course_user", "attendance_records", ["course_id", "user_id"]
    )
    op.create_table(
        "attendance_history",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "record_id",
            sa.String(36),
            sa.ForeignKey("attendance_records.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("reason", sa.String(1000), nullable=False),
        sa.Column(
            "actor_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_attendance_history_record_id", "attendance_history", ["record_id"])
    op.create_table(
        "attendance_excusal_requests",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "record_id",
            sa.String(36),
            sa.ForeignKey("attendance_records.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("reason", sa.String(1000), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("decision_reason", sa.String(1000), nullable=False),
        sa.Column("decided_by", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "status IN ('pending','approved','denied')", name="ck_attendance_excusal_status"
        ),
    )
    op.create_index(
        "ix_attendance_excusal_requests_record_id", "attendance_excusal_requests", ["record_id"]
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute("""CREATE FUNCTION reject_attendance_history_mutation() RETURNS trigger AS $$
            BEGIN RAISE EXCEPTION 'attendance history is immutable'; END; $$ LANGUAGE plpgsql""")
        op.execute(
            "CREATE TRIGGER immutable_attendance_history BEFORE UPDATE OR DELETE ON attendance_history FOR EACH ROW EXECUTE FUNCTION reject_attendance_history_mutation()"
        )
        op.execute(
            "CREATE TRIGGER immutable_attendance_history_truncate BEFORE TRUNCATE ON attendance_history FOR EACH STATEMENT EXECUTE FUNCTION reject_attendance_history_mutation()"
        )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "DROP TRIGGER IF EXISTS immutable_attendance_history_truncate ON attendance_history"
        )
        op.execute("DROP TRIGGER IF EXISTS immutable_attendance_history ON attendance_history")
        op.execute("DROP FUNCTION IF EXISTS reject_attendance_history_mutation()")
    op.drop_index(
        "ix_attendance_excusal_requests_record_id", table_name="attendance_excusal_requests"
    )
    op.drop_table("attendance_excusal_requests")
    op.drop_index("ix_attendance_history_record_id", table_name="attendance_history")
    op.drop_table("attendance_history")
    op.drop_index("ix_attendance_records_course_user", table_name="attendance_records")
    op.drop_table("attendance_records")
    op.drop_index("ix_attendance_windows_course_time", table_name="attendance_windows")
    op.drop_table("attendance_windows")
