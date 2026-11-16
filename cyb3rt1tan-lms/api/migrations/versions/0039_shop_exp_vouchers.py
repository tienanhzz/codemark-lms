"""Supported configurable EXP voucher item effect."""

import sqlalchemy as sa
from alembic import op

revision = "0039_shop_exp_vouchers"
down_revision = "0038_clan_war_proposals"


def upgrade() -> None:
    op.add_column(
        "shop_items",
        sa.Column("effect_config", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )


def downgrade() -> None:
    op.drop_column("shop_items", "effect_config")
