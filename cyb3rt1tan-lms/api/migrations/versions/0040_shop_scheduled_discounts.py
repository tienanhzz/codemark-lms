"""One scheduled, non-stacking discount per shop item."""

import sqlalchemy as sa
from alembic import op

revision = "0040_shop_scheduled_discounts"
down_revision = "0039_shop_exp_vouchers"


def upgrade() -> None:
    op.add_column(
        "shop_items",
        sa.Column("discount_percent", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("shop_items", sa.Column("discount_starts_at", sa.DateTime(timezone=True)))
    op.add_column("shop_items", sa.Column("discount_ends_at", sa.DateTime(timezone=True)))
    op.create_check_constraint(
        "ck_shop_item_discount_percent",
        "shop_items",
        "discount_percent BETWEEN 0 AND 100",
    )
    op.create_check_constraint(
        "ck_shop_item_discount_window",
        "shop_items",
        "(discount_percent = 0 AND discount_starts_at IS NULL AND discount_ends_at IS NULL) OR "
        "(discount_percent > 0 AND discount_starts_at IS NOT NULL AND discount_ends_at IS NOT NULL "
        "AND discount_ends_at > discount_starts_at)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_shop_item_discount_window", "shop_items", type_="check")
    op.drop_constraint("ck_shop_item_discount_percent", "shop_items", type_="check")
    op.drop_column("shop_items", "discount_ends_at")
    op.drop_column("shop_items", "discount_starts_at")
    op.drop_column("shop_items", "discount_percent")
