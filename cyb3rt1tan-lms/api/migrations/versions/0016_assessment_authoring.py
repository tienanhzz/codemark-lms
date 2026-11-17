"""Persistent versioned assignment/exam drafts and published snapshots."""

import sqlalchemy as sa
from alembic import op

revision = "0016_assessment_authoring"
down_revision = "0015_runner_queue_admission"


def upgrade() -> None:
    op.create_table(
        "assessments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "course_id",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("current_version", sa.Integer(), nullable=False),
        sa.Column(
            "created_by",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('assignment','exam')", name="ck_assessment_kind"),
        sa.CheckConstraint(
            "status IN ('draft','published','archived')", name="ck_assessment_status"
        ),
        sa.CheckConstraint("current_version >= 1", name="ck_assessment_version"),
    )
    op.create_index("ix_assessments_course_status", "assessments", ["course_id", "status"])
    op.create_table(
        "assessment_versions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "assessment_id",
            sa.String(36),
            sa.ForeignKey("assessments.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(240), nullable=False),
        sa.Column("instructions", sa.String(10000), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("opens_at", sa.DateTime(timezone=True)),
        sa.Column("closes_at", sa.DateTime(timezone=True)),
        sa.Column("duration_minutes", sa.Integer()),
        sa.Column("attempt_limit", sa.Integer(), nullable=False),
        sa.Column("question_items", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column(
            "created_by",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("assessment_id", "version", name="uq_assessment_version"),
        sa.CheckConstraint("version >= 1", name="ck_assessment_version_number"),
        sa.CheckConstraint("attempt_limit BETWEEN 1 AND 20", name="ck_assessment_attempt_limit"),
        sa.CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 1440",
            name="ck_assessment_duration",
        ),
        sa.CheckConstraint(
            "status IN ('draft','published','superseded')", name="ck_assessment_version_status"
        ),
    )
    op.create_index(
        "ix_assessment_versions_assessment_status",
        "assessment_versions",
        ["assessment_id", "status"],
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute("""CREATE FUNCTION guard_published_assessment_version() RETURNS trigger AS $$
            BEGIN
              IF OLD.status = 'published' THEN
                RAISE EXCEPTION 'published assessment versions are immutable';
              END IF;
              RETURN COALESCE(NEW, OLD);
            END; $$ LANGUAGE plpgsql""")
        op.execute("""CREATE TRIGGER immutable_published_assessment_version
            BEFORE UPDATE OR DELETE ON assessment_versions FOR EACH ROW
            EXECUTE FUNCTION guard_published_assessment_version()""")


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "DROP TRIGGER IF EXISTS immutable_published_assessment_version ON assessment_versions"
        )
        op.execute("DROP FUNCTION IF EXISTS guard_published_assessment_version()")
    op.drop_index("ix_assessment_versions_assessment_status", table_name="assessment_versions")
    op.drop_table("assessment_versions")
    op.drop_index("ix_assessments_course_status", table_name="assessments")
    op.drop_table("assessments")
