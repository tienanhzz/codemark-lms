"""Add participant rewards for approved Clan code/writing competitions."""

import sqlalchemy as sa
from alembic import op

revision = "0047_clan_competition_rewards"
down_revision = "0046_shop_refunds"


def upgrade() -> None:
    op.add_column(
        "clan_wars",
        sa.Column("competition_type", sa.String(16), server_default="war", nullable=False),
    )
    op.add_column(
        "clan_wars", sa.Column("reward_exp", sa.Integer(), server_default="0", nullable=False)
    )
    op.add_column(
        "clan_wars", sa.Column("reward_coin", sa.Integer(), server_default="0", nullable=False)
    )
    op.add_column("clan_wars", sa.Column("reward_item_id", sa.String(36), nullable=True))
    op.add_column(
        "clan_wars",
        sa.Column("reward_item_quantity", sa.Integer(), server_default="0", nullable=False),
    )
    op.create_foreign_key(
        "fk_clan_wars_reward_item",
        "clan_wars",
        "shop_items",
        ["reward_item_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        "ck_clan_war_type", "clan_wars", "competition_type IN ('war','code','writing')"
    )
    op.create_check_constraint(
        "ck_clan_war_participant_rewards", "clan_wars", "reward_exp >= 0 AND reward_coin >= 0"
    )
    op.create_check_constraint(
        "ck_clan_war_item_quantity", "clan_wars", "reward_item_quantity BETWEEN 0 AND 10"
    )
    op.add_column(
        "clan_war_proposals",
        sa.Column("competition_type", sa.String(16), server_default="war", nullable=False),
    )
    op.create_check_constraint(
        "ck_clan_war_proposal_type",
        "clan_war_proposals",
        "competition_type IN ('war','code','writing')",
    )
    op.create_table(
        "clan_competition_awards",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "war_id",
            sa.String(36),
            sa.ForeignKey("clan_wars.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "clan_id", sa.String(36), sa.ForeignKey("clans.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("reward_exp", sa.Integer(), nullable=False),
        sa.Column("reward_coin", sa.Integer(), nullable=False),
        sa.Column("item_quantity", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "reward_exp >= 0 AND reward_coin >= 0 AND item_quantity >= 0",
            name="ck_clan_competition_award_amounts",
        ),
        sa.UniqueConstraint("war_id", "user_id", name="uq_clan_competition_award_participant"),
    )
    op.create_index(
        "ix_clan_competition_awards_war", "clan_competition_awards", ["war_id", "clan_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_clan_competition_awards_war", table_name="clan_competition_awards")
    op.drop_table("clan_competition_awards")
    op.drop_constraint("ck_clan_war_proposal_type", "clan_war_proposals", type_="check")
    op.drop_column("clan_war_proposals", "competition_type")
    op.drop_constraint("ck_clan_war_item_quantity", "clan_wars", type_="check")
    op.drop_constraint("ck_clan_war_participant_rewards", "clan_wars", type_="check")
    op.drop_constraint("ck_clan_war_type", "clan_wars", type_="check")
    op.drop_constraint("fk_clan_wars_reward_item", "clan_wars", type_="foreignkey")
    op.drop_column("clan_wars", "reward_item_quantity")
    op.drop_column("clan_wars", "reward_item_id")
    op.drop_column("clan_wars", "reward_coin")
    op.drop_column("clan_wars", "reward_exp")
    op.drop_column("clan_wars", "competition_type")
