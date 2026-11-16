"""Admin-configured Clan EXP levels, member caps and visual effects."""

import sqlalchemy as sa
from alembic import op

revision = "0034_clan_level_policies"
down_revision = "0033_clans"


def upgrade() -> None:
    op.add_column(
        "clan_exp_ledger",
        sa.Column("reason", sa.String(500), nullable=False, server_default=sa.text("''")),
    )
    op.create_table(
        "clan_policies",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column(
            "author_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('draft','active','retired')", name="ck_clan_policy_status"),
        sa.UniqueConstraint("version", name="uq_clan_policy_version"),
    )
    op.create_index("ix_clan_policy_status", "clan_policies", ["status"])
    op.create_table(
        "clan_level_rules",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "policy_id",
            sa.String(36),
            sa.ForeignKey("clan_policies.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("level", sa.Integer(), nullable=False),
        sa.Column("threshold_exp", sa.Integer(), nullable=False),
        sa.Column("member_cap", sa.Integer(), nullable=False),
        sa.Column("icon", sa.String(80), nullable=False),
        sa.Column("color", sa.String(24), nullable=False),
        sa.CheckConstraint(
            "level > 0 AND threshold_exp >= 0 AND member_cap > 0", name="ck_clan_level_rule_values"
        ),
        sa.UniqueConstraint("policy_id", "level", name="uq_clan_level_rule_level"),
        sa.UniqueConstraint("policy_id", "threshold_exp", name="uq_clan_level_rule_threshold"),
    )
    op.create_index(
        "ix_clan_level_rule_policy_threshold", "clan_level_rules", ["policy_id", "threshold_exp"]
    )


def downgrade() -> None:
    op.drop_index("ix_clan_level_rule_policy_threshold", table_name="clan_level_rules")
    op.drop_table("clan_level_rules")
    op.drop_index("ix_clan_policy_status", table_name="clan_policies")
    op.drop_table("clan_policies")
    op.drop_column("clan_exp_ledger", "reason")
