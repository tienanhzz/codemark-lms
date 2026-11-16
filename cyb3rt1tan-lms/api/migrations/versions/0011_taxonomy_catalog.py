"""Persistent content and question taxonomy catalogs."""

import sqlalchemy as sa
from alembic import op

revision = "0011_taxonomy_catalog"
down_revision = "0010_course_academic_records"


def upgrade() -> None:
    op.create_table(
        "taxonomy_catalog",
        sa.Column("id", sa.String(20), primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.CheckConstraint("version >= 1", name="ck_taxonomy_catalog_version"),
    )
    op.create_table(
        "taxonomy_categories",
        sa.Column("scope", sa.String(20), primary_key=True),
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column("names", sa.JSON(), nullable=False),
        sa.Column("parent_id", sa.String(128), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.CheckConstraint("scope IN ('content','question')", name="ck_taxonomy_category_scope"),
        sa.CheckConstraint("status IN ('active','retired')", name="ck_taxonomy_category_status"),
        sa.ForeignKeyConstraint(
            ["scope", "parent_id"],
            ["taxonomy_categories.scope", "taxonomy_categories.id"],
            ondelete="RESTRICT",
        ),
    )
    op.create_index(
        "ix_taxonomy_categories_scope_parent", "taxonomy_categories", ["scope", "parent_id"]
    )
    op.create_table(
        "taxonomy_tags",
        sa.Column("scope", sa.String(20), primary_key=True),
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column("names", sa.JSON(), nullable=False),
        sa.Column("parent_id", sa.String(128), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("selectable", sa.Boolean(), nullable=False),
        sa.Column("applicability", sa.JSON(), nullable=False),
        sa.CheckConstraint("scope IN ('content','question')", name="ck_taxonomy_tag_scope"),
        sa.CheckConstraint("status IN ('active','retired')", name="ck_taxonomy_tag_status"),
        sa.ForeignKeyConstraint(
            ["scope", "parent_id"],
            ["taxonomy_tags.scope", "taxonomy_tags.id"],
            ondelete="RESTRICT",
        ),
    )
    op.create_index("ix_taxonomy_tags_scope_parent", "taxonomy_tags", ["scope", "parent_id"])
    op.bulk_insert(
        sa.table("taxonomy_catalog", sa.column("id", sa.String), sa.column("version", sa.Integer)),
        [{"id": "main", "version": 1}],
    )


def downgrade() -> None:
    op.drop_index("ix_taxonomy_tags_scope_parent", table_name="taxonomy_tags")
    op.drop_table("taxonomy_tags")
    op.drop_index("ix_taxonomy_categories_scope_parent", table_name="taxonomy_categories")
    op.drop_table("taxonomy_categories")
    op.drop_table("taxonomy_catalog")
