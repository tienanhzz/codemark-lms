"""Protected, immutable per-course question assets."""

import sqlalchemy as sa
from alembic import op

revision = "0013_question_assets"
down_revision = "0012_question_authoring"


def upgrade() -> None:
    op.create_table(
        "question_assets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "course_id",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("asset_kind", sa.String(30), nullable=False),
        sa.Column("media_type", sa.String(100), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("digest", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "asset_kind IN ('image','audio','referenceSolution','supportFile','transcript')",
            name="ck_question_asset_kind",
        ),
        sa.CheckConstraint("length(content) BETWEEN 1 AND 2000000", name="ck_question_asset_size"),
    )
    op.create_index("ix_question_assets_course_id", "question_assets", ["course_id"])
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            """CREATE FUNCTION guard_question_asset_immutable() RETURNS trigger AS $$
            BEGIN RAISE EXCEPTION 'question assets are immutable'; END;
            $$ LANGUAGE plpgsql"""
        )
        op.execute(
            "CREATE TRIGGER immutable_question_asset BEFORE UPDATE OR DELETE ON question_assets "
            "FOR EACH ROW EXECUTE FUNCTION guard_question_asset_immutable()"
        )
        op.execute(
            """CREATE FUNCTION reject_question_asset_truncate() RETURNS trigger AS $$
            BEGIN RAISE EXCEPTION 'question assets are immutable'; END;
            $$ LANGUAGE plpgsql"""
        )
        op.execute(
            "CREATE TRIGGER immutable_question_asset_truncate BEFORE TRUNCATE ON question_assets "
            "FOR EACH STATEMENT EXECUTE FUNCTION reject_question_asset_truncate()"
        )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS immutable_question_asset_truncate ON question_assets")
        op.execute("DROP TRIGGER IF EXISTS immutable_question_asset ON question_assets")
        op.execute("DROP FUNCTION IF EXISTS reject_question_asset_truncate()")
        op.execute("DROP FUNCTION IF EXISTS guard_question_asset_immutable()")
    op.drop_index("ix_question_assets_course_id", table_name="question_assets")
    op.drop_table("question_assets")
