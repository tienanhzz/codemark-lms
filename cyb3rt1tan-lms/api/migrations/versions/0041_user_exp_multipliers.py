"""Persist capped, time-limited user EXP multipliers."""

import sqlalchemy as sa
from alembic import op

revision = "0041_user_exp_multipliers"
down_revision = "0040_shop_scheduled_discounts"


def upgrade() -> None:
    op.create_table(
        "user_exp_multipliers",
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column("multiplier", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("multiplier BETWEEN 1 AND 2", name="ck_user_exp_multiplier_value"),
        sa.CheckConstraint("ends_at > starts_at", name="ck_user_exp_multiplier_window"),
    )
    op.create_index("ix_user_exp_multiplier_expiry", "user_exp_multipliers", ["ends_at"])


def downgrade() -> None:
    op.drop_index("ix_user_exp_multiplier_expiry", table_name="user_exp_multipliers")
    op.drop_table("user_exp_multipliers")
