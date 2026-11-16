"""Supported shop catalog, idempotent purchases, and user inventory."""
import sqlalchemy as sa
from alembic import op

revision = "0027_shop_inventory"
down_revision = "0026_achievements"


def upgrade() -> None:
    op.create_table("shop_items",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("item_key", sa.String(64), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False), sa.Column("description", sa.String(500), nullable=False),
        sa.Column("price_coin", sa.Integer(), nullable=False), sa.Column("stock", sa.Integer(), nullable=False),
        sa.Column("purchase_limit", sa.Integer(), nullable=False), sa.Column("eligible_roles", sa.JSON(), nullable=False),
        sa.Column("effect_type", sa.String(40), nullable=False), sa.Column("status", sa.String(16), nullable=False),
        sa.Column("author_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("price_coin >= 0 AND stock >= 0 AND purchase_limit > 0", name="ck_shop_item_values"),
        sa.CheckConstraint("status IN ('active','retired')", name="ck_shop_item_status"))
    op.create_table("shop_purchases",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("item_id", sa.String(36), sa.ForeignKey("shop_items.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False), sa.Column("total_coin", sa.Integer(), nullable=False),
        sa.Column("idempotency_key", sa.String(160), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "idempotency_key", name="uq_shop_purchase_idempotency"))
    op.create_table("inventory_items",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("item_id", sa.String(36), sa.ForeignKey("shop_items.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("purchase_id", sa.String(36), nullable=False), sa.Column("status", sa.String(16), nullable=False),
        sa.Column("bound", sa.Boolean(), nullable=False), sa.Column("acquired_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('available','reserved','used')", name="ck_inventory_item_status"))
    op.create_index("ix_inventory_user_status", "inventory_items", ["user_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_inventory_user_status", table_name="inventory_items")
    op.drop_table("inventory_items")
    op.drop_table("shop_purchases")
    op.drop_table("shop_items")
