"""Audited marketplace disputes and frozen escrow resolution records."""

import sqlalchemy as sa
from alembic import op

revision = "0030_marketplace_disputes"
down_revision = "0029_marketplace_offers"


def upgrade() -> None:
    op.drop_constraint("ck_marketplace_offer_status", "marketplace_offers", type_="check")
    op.create_check_constraint(
        "ck_marketplace_offer_status",
        "marketplace_offers",
        "status IN ('pending','accepted','rejected','cancelled','expired','disputed')",
    )
    op.create_table(
        "marketplace_disputes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("target_type", sa.String(16), nullable=False),
        sa.Column("target_id", sa.String(36), nullable=False),
        sa.Column(
            "opened_by_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("reason", sa.String(1000), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("resolution", sa.String(16), nullable=True),
        sa.Column(
            "resolved_by_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "target_type IN ('listing','offer')", name="ck_marketplace_dispute_target_type"
        ),
        sa.CheckConstraint("status IN ('open','resolved')", name="ck_marketplace_dispute_status"),
        sa.UniqueConstraint("target_type", "target_id", name="uq_marketplace_dispute_target"),
    )
    op.create_index(
        "ix_marketplace_dispute_status_created", "marketplace_disputes", ["status", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_marketplace_dispute_status_created", table_name="marketplace_disputes")
    op.drop_table("marketplace_disputes")
    op.drop_constraint("ck_marketplace_offer_status", "marketplace_offers", type_="check")
    op.create_check_constraint(
        "ck_marketplace_offer_status",
        "marketplace_offers",
        "status IN ('pending','accepted','rejected','cancelled','expired')",
    )
