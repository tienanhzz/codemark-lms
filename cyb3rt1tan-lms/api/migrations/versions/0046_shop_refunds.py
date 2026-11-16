"""Add versioned Shop refund rules and audited purchase refunds."""

from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision = "0046_shop_refunds"
down_revision = "0045_marketplace_policies"


def upgrade() -> None:
    op.add_column(
        "shop_purchases",
        sa.Column("refund_policy_version", sa.Integer(), server_default="1", nullable=False),
    )
    op.drop_constraint("ck_inventory_item_status", "inventory_items", type_="check")
    op.create_check_constraint(
        "ck_inventory_item_status",
        "inventory_items",
        "status IN ('available','reserved','used','refunded')",
    )
    op.create_table(
        "shop_refund_policies",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("refund_window_hours", sa.Integer(), nullable=False),
        sa.Column("unused_only", sa.Boolean(), nullable=False),
        sa.Column("updated_by", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("version > 0", name="ck_shop_refund_policy_version"),
        sa.CheckConstraint("status IN ('active','retired')", name="ck_shop_refund_policy_status"),
        sa.CheckConstraint(
            "refund_window_hours BETWEEN 1 AND 168", name="ck_shop_refund_policy_window"
        ),
        sa.UniqueConstraint("version", name="uq_shop_refund_policy_version"),
    )
    op.create_index(
        "ix_shop_refund_policy_status_version", "shop_refund_policies", ["status", "version"]
    )
    op.create_table(
        "shop_refunds",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("purchase_id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("policy_version", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(1000), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("decision_key", sa.String(160), nullable=True),
        sa.Column("resolved_by_id", sa.String(36), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending','approved','rejected')", name="ck_shop_refund_status"
        ),
        sa.ForeignKeyConstraint(["purchase_id"], ["shop_purchases.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("purchase_id", name="uq_shop_refund_purchase"),
    )
    op.create_index("ix_shop_refund_status_created", "shop_refunds", ["status", "created_at"])
    op.bulk_insert(
        sa.table(
            "shop_refund_policies",
            sa.column("id", sa.String()),
            sa.column("version", sa.Integer()),
            sa.column("status", sa.String()),
            sa.column("enabled", sa.Boolean()),
            sa.column("refund_window_hours", sa.Integer()),
            sa.column("unused_only", sa.Boolean()),
            sa.column("updated_by", sa.String()),
            sa.column("created_at", sa.DateTime(timezone=True)),
        ),
        [
            {
                "id": "00000000-0000-4000-8000-000000000046",
                "version": 1,
                "status": "active",
                "enabled": False,
                "refund_window_hours": 24,
                "unused_only": True,
                "updated_by": "system",
                "created_at": datetime.now(UTC),
            }
        ],
    )


def downgrade() -> None:
    op.drop_index("ix_shop_refund_status_created", table_name="shop_refunds")
    op.drop_table("shop_refunds")
    op.drop_index("ix_shop_refund_policy_status_version", table_name="shop_refund_policies")
    op.drop_table("shop_refund_policies")
    op.drop_constraint("ck_inventory_item_status", "inventory_items", type_="check")
    op.create_check_constraint(
        "ck_inventory_item_status", "inventory_items", "status IN ('available','reserved','used')"
    )
    op.drop_column("shop_purchases", "refund_policy_version")
