"""Persist expiring, mission-scoped streak card progress."""

import sqlalchemy as sa
from alembic import op

revision = "0042_mission_streak_boosts"
down_revision = "0041_user_exp_multipliers"


def upgrade() -> None:
    op.create_table(
        "mission_streak_boosts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("mission_id", sa.String(64), nullable=False),
        sa.Column("mission_version", sa.Integer(), nullable=False),
        sa.Column("cycle_key", sa.String(80), nullable=False),
        sa.Column("base_progress", sa.Integer(), nullable=False),
        sa.Column("granted_progress", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("base_progress >= 0", name="ck_mission_streak_boost_base"),
        sa.CheckConstraint(
            "granted_progress BETWEEN 0 AND 3", name="ck_mission_streak_boost_grant"
        ),
        sa.CheckConstraint("expires_at > created_at", name="ck_mission_streak_boost_expiry"),
        sa.CheckConstraint(
            "consumed_at IS NULL OR expired_at IS NULL",
            name="ck_mission_streak_boost_terminal_state",
        ),
    )
    op.create_index(
        "ix_mission_streak_boost_pending",
        "mission_streak_boosts",
        ["user_id", "mission_id", "expires_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_mission_streak_boost_pending", table_name="mission_streak_boosts")
    op.drop_table("mission_streak_boosts")
