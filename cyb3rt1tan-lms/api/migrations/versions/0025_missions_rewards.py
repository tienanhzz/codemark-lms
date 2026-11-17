"""Versioned registered-key missions and idempotent reward progress."""

import sqlalchemy as sa
from alembic import op

revision = "0025_missions_rewards"
down_revision = "0024_economy_ledger_ranks"


def upgrade() -> None:
    op.create_table(
        "mission_definitions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("mission_id", sa.String(64), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("event_key", sa.String(80), nullable=False),
        sa.Column("target_count", sa.Integer(), nullable=False),
        sa.Column("cadence", sa.String(16), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("eligible_roles", sa.JSON(), nullable=False),
        sa.Column("reward_exp", sa.Integer(), nullable=False),
        sa.Column("reward_coin", sa.Integer(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column(
            "author_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("cadence IN ('daily','weekly','once')", name="ck_mission_cadence"),
        sa.CheckConstraint("status IN ('active','retired')", name="ck_mission_status"),
        sa.CheckConstraint("target_count > 0", name="ck_mission_target"),
        sa.CheckConstraint("reward_exp >= 0 AND reward_coin >= 0", name="ck_mission_reward"),
        sa.CheckConstraint(
            "ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at", name="ck_mission_window"
        ),
        sa.UniqueConstraint("mission_id", "version", name="uq_mission_definition_version"),
    )
    op.create_index(
        "ix_mission_definitions_event_status", "mission_definitions", ["event_key", "status"]
    )
    op.create_table(
        "mission_progress",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("mission_id", sa.String(64), nullable=False),
        sa.Column("mission_version", sa.Integer(), nullable=False),
        sa.Column("cycle_key", sa.String(80), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("progress >= 0", name="ck_mission_progress_nonnegative"),
        sa.CheckConstraint(
            "status IN ('active','complete','claimed')", name="ck_mission_progress_status"
        ),
        sa.UniqueConstraint(
            "user_id",
            "mission_id",
            "mission_version",
            "cycle_key",
            name="uq_mission_progress_cycle",
        ),
    )
    op.create_index("ix_mission_progress_user_cycle", "mission_progress", ["user_id", "cycle_key"])
    op.create_table(
        "mission_event_receipts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("mission_id", sa.String(64), nullable=False),
        sa.Column("mission_version", sa.Integer(), nullable=False),
        sa.Column("cycle_key", sa.String(80), nullable=False),
        sa.Column("source_event_id", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "user_id",
            "mission_id",
            "mission_version",
            "source_event_id",
            name="uq_mission_event_receipt",
        ),
    )
    op.create_index(
        "ix_mission_event_receipts_cycle", "mission_event_receipts", ["mission_id", "cycle_key"]
    )
    op.create_table(
        "reward_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("mission_id", sa.String(64), nullable=False),
        sa.Column("mission_version", sa.Integer(), nullable=False),
        sa.Column("cycle_key", sa.String(80), nullable=False),
        sa.Column("source_event_id", sa.String(64), nullable=False),
        sa.Column("idempotency_key", sa.String(160), nullable=False),
        sa.Column("exp_awarded", sa.Integer(), nullable=False),
        sa.Column("coin_awarded", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("idempotency_key", name="uq_reward_event_idempotency"),
    )
    op.create_index("ix_reward_events_user_created", "reward_events", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_reward_events_user_created", table_name="reward_events")
    op.drop_table("reward_events")
    op.drop_index("ix_mission_event_receipts_cycle", table_name="mission_event_receipts")
    op.drop_table("mission_event_receipts")
    op.drop_index("ix_mission_progress_user_cycle", table_name="mission_progress")
    op.drop_table("mission_progress")
    op.drop_index("ix_mission_definitions_event_status", table_name="mission_definitions")
    op.drop_table("mission_definitions")
