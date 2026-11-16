"""Course staff events with escrowed Coin budgets and approved awards."""

import sqlalchemy as sa
from alembic import op

revision = "0032_staff_events"
down_revision = "0031_rank_role_tasks"


def upgrade() -> None:
    op.create_table(
        "staff_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "course_id",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "organizer_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("description", sa.String(1000), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("prize_budget_coin", sa.Integer(), nullable=False),
        sa.Column("award_mode", sa.String(24), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("idempotency_key", sa.String(160), nullable=False),
        sa.Column("approval_key", sa.String(160), nullable=True),
        sa.Column("results_hash", sa.String(64), nullable=True),
        sa.Column(
            "approved_by_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('funded','paid','cancelled')", name="ck_staff_event_status"),
        sa.CheckConstraint(
            "award_mode IN ('winner_takes_all','equal_split')", name="ck_staff_event_award_mode"
        ),
        sa.CheckConstraint("prize_budget_coin > 0", name="ck_staff_event_budget"),
        sa.CheckConstraint("ends_at > starts_at", name="ck_staff_event_window"),
        sa.UniqueConstraint("organizer_id", "idempotency_key", name="uq_staff_event_idempotency"),
    )
    op.create_index("ix_staff_events_course_status", "staff_events", ["course_id", "status"])
    op.create_table(
        "staff_event_awards",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "event_id",
            sa.String(36),
            sa.ForeignKey("staff_events.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("placement", sa.Integer(), nullable=False),
        sa.Column("coin_awarded", sa.Integer(), nullable=False),
        sa.Column(
            "approved_by_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "placement > 0 AND coin_awarded >= 0", name="ck_staff_event_award_values"
        ),
        sa.UniqueConstraint("event_id", "user_id", name="uq_staff_event_award_participant"),
    )
    op.create_index(
        "ix_staff_event_awards_event_placement", "staff_event_awards", ["event_id", "placement"]
    )


def downgrade() -> None:
    op.drop_index("ix_staff_event_awards_event_placement", table_name="staff_event_awards")
    op.drop_table("staff_event_awards")
    op.drop_index("ix_staff_events_course_status", table_name="staff_events")
    op.drop_table("staff_events")
