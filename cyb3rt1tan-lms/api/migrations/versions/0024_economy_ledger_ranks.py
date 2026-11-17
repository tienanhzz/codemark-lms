"""Append-only EXP/Coin ledger and versioned rank policies."""

import sqlalchemy as sa
from alembic import op

revision = "0024_economy_ledger_ranks"
down_revision = "0023_lesson_completion"


def upgrade() -> None:
    op.create_table(
        "economy_ledger",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("currency", sa.String(8), nullable=False),
        sa.Column("delta", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(80), nullable=False),
        sa.Column("idempotency_key", sa.String(160), nullable=False),
        sa.Column("reason", sa.String(500), nullable=False, server_default=""),
        sa.Column(
            "actor_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
        ),
        sa.Column("detail", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("currency IN ('exp','coin')", name="ck_economy_ledger_currency"),
        sa.CheckConstraint("delta <> 0", name="ck_economy_ledger_nonzero"),
        sa.UniqueConstraint("idempotency_key", name="uq_economy_ledger_idempotency"),
    )
    op.create_index("ix_economy_ledger_user_time", "economy_ledger", ["user_id", "created_at"])
    op.create_index("ix_economy_ledger_user_currency", "economy_ledger", ["user_id", "currency"])
    op.create_table(
        "rank_policies",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("track", sa.String(16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("effective_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "author_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("track IN ('student','staff')", name="ck_rank_policy_track"),
        sa.CheckConstraint("status IN ('draft','active','retired')", name="ck_rank_policy_status"),
        sa.UniqueConstraint("track", "version", name="uq_rank_policy_track_version"),
    )
    op.create_table(
        "rank_tiers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "policy_id",
            sa.String(36),
            sa.ForeignKey("rank_policies.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("tier_key", sa.String(64), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("threshold_exp", sa.Integer(), nullable=False),
        sa.Column("icon", sa.String(80), nullable=False),
        sa.Column("color", sa.String(24), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.CheckConstraint("threshold_exp >= 0", name="ck_rank_tier_threshold"),
        sa.UniqueConstraint("policy_id", "tier_key", name="uq_rank_tier_key"),
        sa.UniqueConstraint("policy_id", "position", name="uq_rank_tier_position"),
    )
    op.create_index("ix_rank_policies_track_status", "rank_policies", ["track", "status"])
    op.create_index("ix_rank_tiers_policy_threshold", "rank_tiers", ["policy_id", "threshold_exp"])


def downgrade() -> None:
    op.drop_index("ix_rank_tiers_policy_threshold", table_name="rank_tiers")
    op.drop_index("ix_rank_policies_track_status", table_name="rank_policies")
    op.drop_table("rank_tiers")
    op.drop_table("rank_policies")
    op.drop_index("ix_economy_ledger_user_currency", table_name="economy_ledger")
    op.drop_index("ix_economy_ledger_user_time", table_name="economy_ledger")
    op.drop_table("economy_ledger")
