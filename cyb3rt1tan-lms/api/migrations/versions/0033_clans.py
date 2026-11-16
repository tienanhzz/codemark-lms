"""Clan membership, bounded internal roles and append-only Clan EXP."""

import sqlalchemy as sa
from alembic import op

revision = "0033_clans"
down_revision = "0032_staff_events"


def upgrade() -> None:
    op.create_table(
        "clans",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(40), nullable=False),
        sa.Column("name_key", sa.String(80), nullable=False, unique=True),
        sa.Column(
            "owner_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("level", sa.Integer(), nullable=False),
        sa.Column("clan_exp", sa.Integer(), nullable=False),
        sa.Column("member_cap", sa.Integer(), nullable=False),
        sa.Column("icon", sa.String(80), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "member_cap > 0 AND clan_exp >= 0 AND level > 0", name="ck_clan_projection"
        ),
        sa.CheckConstraint("status IN ('active','closed')", name="ck_clan_status"),
    )
    op.create_index("ix_clans_leaderboard", "clans", ["status", "clan_exp", "created_at"])
    op.create_table(
        "clan_memberships",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "clan_id", sa.String(36), sa.ForeignKey("clans.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("role_key", sa.String(64), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('invited','requested','active','rejected','left')",
            name="ck_clan_membership_status",
        ),
        sa.UniqueConstraint("clan_id", "user_id", name="uq_clan_membership_user"),
    )
    op.create_index("ix_clan_membership_user_status", "clan_memberships", ["user_id", "status"])
    op.create_index(
        "uq_clan_one_active_membership",
        "clan_memberships",
        ["user_id"],
        unique=True,
        sqlite_where=sa.text("status = 'active'"),
        postgresql_where=sa.text("status = 'active'"),
    )
    op.create_table(
        "clan_roles",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "clan_id", sa.String(36), sa.ForeignKey("clans.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("role_key", sa.String(64), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("permissions", sa.JSON(), nullable=False),
        sa.UniqueConstraint("clan_id", "role_key", name="uq_clan_role_key"),
    )
    op.create_table(
        "clan_exp_ledger",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "clan_id", sa.String(36), sa.ForeignKey("clans.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("delta", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(80), nullable=False),
        sa.Column("idempotency_key", sa.String(160), nullable=False, unique=True),
        sa.Column(
            "actor_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("delta <> 0", name="ck_clan_exp_delta"),
    )
    op.create_index("ix_clan_exp_ledger_clan_time", "clan_exp_ledger", ["clan_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_clan_exp_ledger_clan_time", table_name="clan_exp_ledger")
    op.drop_table("clan_exp_ledger")
    op.drop_table("clan_roles")
    op.drop_index("uq_clan_one_active_membership", table_name="clan_memberships")
    op.drop_index("ix_clan_membership_user_status", table_name="clan_memberships")
    op.drop_table("clan_memberships")
    op.drop_index("ix_clans_leaderboard", table_name="clans")
    op.drop_table("clans")
