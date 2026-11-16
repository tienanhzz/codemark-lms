"""Support Coin and EXP prices for supported shop items."""

import sqlalchemy as sa
from alembic import op

revision = "0044_shop_exp_prices"
down_revision = "0043_user_equipped_shop_titles"


def upgrade() -> None:
    op.add_column("shop_items", sa.Column("price_exp", sa.Integer(), server_default="0", nullable=False))
    op.drop_constraint("ck_shop_item_values", "shop_items", type_="check")
    op.create_check_constraint(
        "ck_shop_item_values",
        "shop_items",
        "price_coin >= 0 AND price_exp >= 0 AND stock >= 0 AND purchase_limit > 0",
    )
    op.add_column("shop_purchases", sa.Column("total_exp", sa.Integer(), server_default="0", nullable=False))


def downgrade() -> None:
    op.drop_column("shop_purchases", "total_exp")
    op.drop_constraint("ck_shop_item_values", "shop_items", type_="check")
    op.create_check_constraint(
        "ck_shop_item_values",
        "shop_items",
        "price_coin >= 0 AND stock >= 0 AND purchase_limit > 0",
    )
    op.drop_column("shop_items", "price_exp")
