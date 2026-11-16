"""Allow bound purchased titles to use the single equipped-title slot."""

import sqlalchemy as sa
from alembic import op

revision = "0043_user_equipped_shop_titles"
down_revision = "0042_mission_streak_boosts"


def upgrade() -> None:
    op.create_table(
        "user_equipped_shop_titles",
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column(
            "inventory_id",
            sa.String(36),
            sa.ForeignKey("inventory_items.id", ondelete="RESTRICT"),
            nullable=False,
            unique=True,
        ),
        sa.Column("title", sa.String(80), nullable=False),
        sa.Column("equipped_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("user_equipped_shop_titles")
