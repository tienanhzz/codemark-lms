"""Preserve stable taxonomy IDs while redirecting merged entries."""

import sqlalchemy as sa
from alembic import op

revision = "0014_taxonomy_redirects"
down_revision = "0013_question_assets"


def upgrade() -> None:
    op.create_table(
        "taxonomy_redirects",
        sa.Column("scope", sa.String(20), primary_key=True),
        sa.Column("node_kind", sa.String(20), primary_key=True),
        sa.Column("source_id", sa.String(128), primary_key=True),
        sa.Column("target_id", sa.String(128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_by",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.CheckConstraint("scope IN ('content','question')", name="ck_taxonomy_redirect_scope"),
        sa.CheckConstraint("node_kind IN ('category','tag')", name="ck_taxonomy_redirect_kind"),
        sa.CheckConstraint("source_id <> target_id", name="ck_taxonomy_redirect_distinct"),
    )


def downgrade() -> None:
    op.drop_table("taxonomy_redirects")
