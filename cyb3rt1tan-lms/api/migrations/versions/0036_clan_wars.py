"""Admin scheduled Clan Wars and immutable result records."""

import sqlalchemy as sa
from alembic import op

revision = "0036_clan_wars"
down_revision = "0035_clan_visual_effect"


def upgrade() -> None:
    op.create_table(
        "clan_wars",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column(
            "clan_a_id",
            sa.String(36),
            sa.ForeignKey("clans.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "clan_b_id",
            sa.String(36),
            sa.ForeignKey("clans.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="scheduled"),
        sa.Column("winner_clan_id", sa.String(36), sa.ForeignKey("clans.id", ondelete="RESTRICT")),
        sa.Column("outcome", sa.String(16)),
        sa.Column("exp_reward", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_by_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("finalized_by_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finalized_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "status IN ('scheduled','completed','cancelled')", name="ck_clan_war_status"
        ),
        sa.CheckConstraint("clan_a_id <> clan_b_id", name="ck_clan_war_distinct_clans"),
        sa.CheckConstraint("exp_reward >= 0", name="ck_clan_war_reward"),
    )
    op.create_index("ix_clan_wars_status_start", "clan_wars", ["status", "starts_at"])


def downgrade() -> None:
    op.drop_index("ix_clan_wars_status_start", table_name="clan_wars")
    op.drop_table("clan_wars")
