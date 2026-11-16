"""Versioned Clan missions, shared progress and event receipts."""

import sqlalchemy as sa
from alembic import op

revision = "0037_clan_missions"
down_revision = "0036_clan_wars"


def upgrade() -> None:
    op.create_table(
        "clan_mission_definitions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("mission_id", sa.String(64), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("event_key", sa.String(80), nullable=False),
        sa.Column("target_count", sa.Integer(), nullable=False),
        sa.Column("cadence", sa.String(16), nullable=False, server_default="weekly"),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="Asia/Bangkok"),
        sa.Column("reward_clan_exp", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reward_exp", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reward_coin", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(16), nullable=False, server_default="draft"),
        sa.Column(
            "author_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('draft','active','retired')", name="ck_clan_mission_status"),
        sa.CheckConstraint(
            "target_count > 0 AND reward_clan_exp >= 0 AND reward_exp >= 0 AND reward_coin >= 0",
            name="ck_clan_mission_values",
        ),
        sa.UniqueConstraint("mission_id", "version", name="uq_clan_mission_version"),
    )
    op.create_index(
        "ix_clan_mission_event_status", "clan_mission_definitions", ["event_key", "status"]
    )
    op.create_table(
        "clan_mission_progress",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "clan_id", sa.String(36), sa.ForeignKey("clans.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("mission_id", sa.String(64), nullable=False),
        sa.Column("mission_version", sa.Integer(), nullable=False),
        sa.Column("cycle_key", sa.String(32), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("progress >= 0", name="ck_clan_mission_progress_nonnegative"),
        sa.CheckConstraint(
            "status IN ('active','complete')", name="ck_clan_mission_progress_status"
        ),
        sa.UniqueConstraint(
            "clan_id",
            "mission_id",
            "mission_version",
            "cycle_key",
            name="uq_clan_mission_progress_cycle",
        ),
    )
    op.create_index(
        "ix_clan_mission_progress_clan_cycle", "clan_mission_progress", ["clan_id", "cycle_key"]
    )
    op.create_table(
        "clan_mission_receipts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "clan_id", sa.String(36), sa.ForeignKey("clans.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("mission_id", sa.String(64), nullable=False),
        sa.Column("mission_version", sa.Integer(), nullable=False),
        sa.Column("cycle_key", sa.String(32), nullable=False),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("source_event_id", sa.String(80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "clan_id",
            "mission_id",
            "mission_version",
            "source_event_id",
            name="uq_clan_mission_source_event",
        ),
    )
    op.create_index(
        "ix_clan_mission_receipts_progress",
        "clan_mission_receipts",
        ["clan_id", "mission_id", "cycle_key"],
    )


def downgrade() -> None:
    op.drop_index("ix_clan_mission_receipts_progress", table_name="clan_mission_receipts")
    op.drop_table("clan_mission_receipts")
    op.drop_index("ix_clan_mission_progress_clan_cycle", table_name="clan_mission_progress")
    op.drop_table("clan_mission_progress")
    op.drop_index("ix_clan_mission_event_status", table_name="clan_mission_definitions")
    op.drop_table("clan_mission_definitions")
