"""Coin/item escrow offers for fixed-price marketplace listings."""
import sqlalchemy as sa
from alembic import op

revision = "0029_marketplace_offers"
down_revision = "0028_marketplace_listings"


def upgrade() -> None:
    op.create_table(
        "marketplace_offers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("listing_id", sa.String(36), sa.ForeignKey("marketplace_listings.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("offerer_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("offer_coin", sa.Integer(), nullable=False),
        sa.Column("offered_inventory_id", sa.String(36), sa.ForeignKey("inventory_items.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("idempotency_key", sa.String(160), nullable=False),
        sa.Column("decision_key", sa.String(160), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("offer_coin >= 0", name="ck_marketplace_offer_coin"),
        sa.CheckConstraint("status IN ('pending','accepted','rejected','cancelled','expired')", name="ck_marketplace_offer_status"),
        sa.CheckConstraint("offer_coin > 0 OR offered_inventory_id IS NOT NULL", name="ck_marketplace_offer_assets"),
        sa.UniqueConstraint("offerer_id", "idempotency_key", name="uq_marketplace_offer_idempotency"),
    )
    op.create_index("ix_marketplace_offers_listing_status", "marketplace_offers", ["listing_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_marketplace_offers_listing_status", table_name="marketplace_offers")
    op.drop_table("marketplace_offers")
