"""Add versioned marketplace fees, bounds, volume and expiry policy."""

from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision = "0045_marketplace_policies"
down_revision = "0044_shop_exp_prices"


def upgrade() -> None:
    op.add_column(
        "marketplace_listings",
        sa.Column("policy_version", sa.Integer(), server_default="1", nullable=False),
    )
    op.add_column(
        "marketplace_listings",
        sa.Column("fee_percent", sa.Integer(), server_default="0", nullable=False),
    )
    op.create_check_constraint(
        "ck_marketplace_listing_policy_version", "marketplace_listings", "policy_version > 0"
    )
    op.create_check_constraint(
        "ck_marketplace_listing_fee_percent", "marketplace_listings", "fee_percent BETWEEN 0 AND 10"
    )
    op.add_column(
        "marketplace_offers",
        sa.Column("policy_version", sa.Integer(), server_default="1", nullable=False),
    )
    op.add_column(
        "marketplace_offers",
        sa.Column("fee_percent", sa.Integer(), server_default="0", nullable=False),
    )
    op.create_check_constraint(
        "ck_marketplace_offer_policy_version", "marketplace_offers", "policy_version > 0"
    )
    op.create_check_constraint(
        "ck_marketplace_offer_fee_percent", "marketplace_offers", "fee_percent BETWEEN 0 AND 10"
    )
    op.create_table(
        "marketplace_policies",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("listing_fee_percent", sa.Integer(), nullable=False),
        sa.Column("offer_fee_percent", sa.Integer(), nullable=False),
        sa.Column("min_price_coin", sa.Integer(), nullable=False),
        sa.Column("max_price_coin", sa.Integer(), nullable=False),
        sa.Column("max_offer_coin", sa.Integer(), nullable=False),
        sa.Column("listing_expiry_hours", sa.Integer(), nullable=False),
        sa.Column("offer_expiry_hours", sa.Integer(), nullable=False),
        sa.Column("max_active_listings", sa.Integer(), nullable=False),
        sa.Column("max_pending_offers", sa.Integer(), nullable=False),
        sa.Column("updated_by", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("version > 0", name="ck_marketplace_policy_version"),
        sa.CheckConstraint("status IN ('active','retired')", name="ck_marketplace_policy_status"),
        sa.CheckConstraint(
            "listing_fee_percent BETWEEN 0 AND 10", name="ck_marketplace_listing_fee"
        ),
        sa.CheckConstraint("offer_fee_percent BETWEEN 0 AND 10", name="ck_marketplace_offer_fee"),
        sa.CheckConstraint(
            "min_price_coin > 0 AND max_price_coin >= min_price_coin",
            name="ck_marketplace_policy_price_range",
        ),
        sa.CheckConstraint("max_offer_coin >= 0", name="ck_marketplace_policy_offer_max"),
        sa.CheckConstraint(
            "listing_expiry_hours BETWEEN 1 AND 168", name="ck_marketplace_listing_expiry_hours"
        ),
        sa.CheckConstraint(
            "offer_expiry_hours BETWEEN 1 AND 168", name="ck_marketplace_offer_expiry_hours"
        ),
        sa.CheckConstraint(
            "max_active_listings BETWEEN 1 AND 100", name="ck_marketplace_policy_listing_volume"
        ),
        sa.CheckConstraint(
            "max_pending_offers BETWEEN 1 AND 100", name="ck_marketplace_policy_offer_volume"
        ),
        sa.UniqueConstraint("version", name="uq_marketplace_policy_version"),
    )
    op.create_index(
        "ix_marketplace_policy_status_version", "marketplace_policies", ["status", "version"]
    )
    op.bulk_insert(
        sa.table(
            "marketplace_policies",
            sa.column("id", sa.String()),
            sa.column("version", sa.Integer()),
            sa.column("status", sa.String()),
            sa.column("listing_fee_percent", sa.Integer()),
            sa.column("offer_fee_percent", sa.Integer()),
            sa.column("min_price_coin", sa.Integer()),
            sa.column("max_price_coin", sa.Integer()),
            sa.column("max_offer_coin", sa.Integer()),
            sa.column("listing_expiry_hours", sa.Integer()),
            sa.column("offer_expiry_hours", sa.Integer()),
            sa.column("max_active_listings", sa.Integer()),
            sa.column("max_pending_offers", sa.Integer()),
            sa.column("updated_by", sa.String()),
            sa.column("created_at", sa.DateTime(timezone=True)),
        ),
        [
            {
                "id": "00000000-0000-4000-8000-000000000045",
                "version": 1,
                "status": "active",
                "listing_fee_percent": 0,
                "offer_fee_percent": 0,
                "min_price_coin": 1,
                "max_price_coin": 2_000_000_000,
                "max_offer_coin": 2_000_000_000,
                "listing_expiry_hours": 168,
                "offer_expiry_hours": 168,
                "max_active_listings": 100,
                "max_pending_offers": 100,
                "updated_by": "system",
                "created_at": datetime.now(UTC),
            }
        ],
    )


def downgrade() -> None:
    op.drop_index("ix_marketplace_policy_status_version", table_name="marketplace_policies")
    op.drop_table("marketplace_policies")
    op.drop_constraint("ck_marketplace_offer_fee_percent", "marketplace_offers", type_="check")
    op.drop_constraint("ck_marketplace_offer_policy_version", "marketplace_offers", type_="check")
    op.drop_column("marketplace_offers", "fee_percent")
    op.drop_column("marketplace_offers", "policy_version")
    op.drop_constraint("ck_marketplace_listing_fee_percent", "marketplace_listings", type_="check")
    op.drop_constraint(
        "ck_marketplace_listing_policy_version", "marketplace_listings", type_="check"
    )
    op.drop_column("marketplace_listings", "fee_percent")
    op.drop_column("marketplace_listings", "policy_version")
