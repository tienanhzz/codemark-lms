"""Automatic scores, append-only manual grading, release snapshots, late policies."""

import sqlalchemy as sa
from alembic import op

revision = "0019_assessment_grading"
down_revision = "0018_practice_attempts"


def upgrade() -> None:
    op.add_column(
        "assessment_versions",
        sa.Column("late_penalty", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )
    op.add_column(
        "assessment_attempts",
        sa.Column("automatic_scores", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )
    op.create_table(
        "assessment_grade_revisions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "attempt_id",
            sa.String(36),
            sa.ForeignKey("assessment_attempts.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "question_version_id",
            sa.String(36),
            sa.ForeignKey("question_versions.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("points_awarded", sa.Float(), nullable=False),
        sa.Column("criterion_scores", sa.JSON(), nullable=False),
        sa.Column("feedback", sa.String(5000), nullable=False),
        sa.Column(
            "grader_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "attempt_id", "question_version_id", "revision", name="uq_assessment_grade_revision"
        ),
        sa.CheckConstraint("revision >= 1", name="ck_assessment_grade_revision"),
        sa.CheckConstraint("points_awarded >= 0", name="ck_assessment_grade_points"),
    )
    op.create_index(
        "ix_assessment_grade_revisions_attempt_question",
        "assessment_grade_revisions",
        ["attempt_id", "question_version_id", "revision"],
    )
    op.create_table(
        "assessment_grade_releases",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "attempt_id",
            sa.String(36),
            sa.ForeignKey("assessment_attempts.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("gross_score", sa.Float(), nullable=False),
        sa.Column("penalty_percent", sa.Float(), nullable=False),
        sa.Column("released_score", sa.Float(), nullable=False),
        sa.Column("max_points", sa.Float(), nullable=False),
        sa.Column("breakdown", sa.JSON(), nullable=False),
        sa.Column(
            "released_by",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("attempt_id", "revision", name="uq_assessment_grade_release_revision"),
        sa.CheckConstraint("revision >= 1", name="ck_assessment_grade_release_revision"),
        sa.CheckConstraint("gross_score >= 0", name="ck_assessment_release_gross_score"),
        sa.CheckConstraint("released_score >= 0", name="ck_assessment_release_score"),
        sa.CheckConstraint("max_points > 0", name="ck_assessment_release_max_points"),
        sa.CheckConstraint(
            "penalty_percent BETWEEN 0 AND 100", name="ck_assessment_release_penalty"
        ),
    )
    op.create_index(
        "ix_assessment_grade_releases_attempt_revision",
        "assessment_grade_releases",
        ["attempt_id", "revision"],
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute("""CREATE FUNCTION guard_assessment_grade_immutable() RETURNS trigger AS $$
            BEGIN RAISE EXCEPTION 'assessment grade records are immutable'; END; $$ LANGUAGE plpgsql""")
        for table in ("assessment_grade_revisions", "assessment_grade_releases"):
            op.execute(
                f"CREATE TRIGGER immutable_{table} BEFORE UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION guard_assessment_grade_immutable()"
            )
            op.execute(
                f"CREATE TRIGGER immutable_{table}_truncate BEFORE TRUNCATE ON {table} FOR EACH STATEMENT EXECUTE FUNCTION guard_assessment_grade_immutable()"
            )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        for table in ("assessment_grade_revisions", "assessment_grade_releases"):
            op.execute(f"DROP TRIGGER IF EXISTS immutable_{table}_truncate ON {table}")
            op.execute(f"DROP TRIGGER IF EXISTS immutable_{table} ON {table}")
        op.execute("DROP FUNCTION IF EXISTS guard_assessment_grade_immutable()")
    op.drop_index(
        "ix_assessment_grade_releases_attempt_revision", table_name="assessment_grade_releases"
    )
    op.drop_table("assessment_grade_releases")
    op.drop_index(
        "ix_assessment_grade_revisions_attempt_question", table_name="assessment_grade_revisions"
    )
    op.drop_table("assessment_grade_revisions")
    op.drop_column("assessment_attempts", "automatic_scores")
    op.drop_column("assessment_versions", "late_penalty")
