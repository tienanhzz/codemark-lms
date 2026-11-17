"""Tradeable shop item policy and fixed-price escrow listings."""

import sqlalchemy as sa
from alembic import op

revision = "0028_marketplace_listings"
down_revision = "0027_shop_inventory"


def upgrade() -> None:
    op.add_column(
        "shop_items",
        sa.Column("tradeable", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        "marketplace_listings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "seller_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "inventory_id",
            sa.String(36),
            sa.ForeignKey("inventory_items.id", ondelete="RESTRICT"),
            nullable=False,
            unique=True,
        ),
        sa.Column("price_coin", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "buyer_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
        ),
        sa.Column("buyer_idempotency_key", sa.String(160), nullable=True),
        sa.Column("idempotency_key", sa.String(160), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("price_coin > 0", name="ck_marketplace_listing_price"),
        sa.CheckConstraint(
            "status IN ('active','sold','cancelled','expired','disputed')",
            name="ck_marketplace_listing_status",
        ),
        sa.UniqueConstraint(
            "seller_id", "idempotency_key", name="uq_marketplace_listing_idempotency"
        ),
        sa.UniqueConstraint(
            "buyer_id", "buyer_idempotency_key", name="uq_marketplace_purchase_idempotency"
        ),
    )
    op.create_index(
        "ix_marketplace_listings_status_expiry", "marketplace_listings", ["status", "expires_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_marketplace_listings_status_expiry", table_name="marketplace_listings")
    op.drop_table("marketplace_listings")
    op.drop_column("shop_items", "tradeable")
