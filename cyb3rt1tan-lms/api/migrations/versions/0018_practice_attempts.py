"""Immutable persisted objective practice attempts and scores."""

import sqlalchemy as sa
from alembic import op

revision = "0018_practice_attempts"
down_revision = "0017_assessment_attempts"


def upgrade() -> None:
    op.create_table(
        "practice_attempts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "course_id",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column(
            "question_version_id",
            sa.String(36),
            sa.ForeignKey("question_versions.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("answer", sa.JSON(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("max_points", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("score >= 0", name="ck_practice_attempt_score"),
        sa.CheckConstraint("max_points > 0", name="ck_practice_attempt_max_points"),
        sa.CheckConstraint("score <= max_points", name="ck_practice_attempt_score_max"),
    )
    op.create_index(
        "ix_practice_attempts_user_created", "practice_attempts", ["user_id", "created_at"]
    )
    op.create_index(
        "ix_practice_attempts_course_question",
        "practice_attempts",
        ["course_id", "question_version_id"],
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute("""CREATE FUNCTION guard_practice_attempt_immutable() RETURNS trigger AS $$
            BEGIN RAISE EXCEPTION 'practice attempts are immutable'; END; $$ LANGUAGE plpgsql""")
        op.execute("""CREATE TRIGGER immutable_practice_attempt BEFORE UPDATE OR DELETE
            ON practice_attempts FOR EACH ROW EXECUTE FUNCTION guard_practice_attempt_immutable()""")
        op.execute("""CREATE TRIGGER immutable_practice_attempt_truncate BEFORE TRUNCATE
            ON practice_attempts FOR EACH STATEMENT EXECUTE FUNCTION guard_practice_attempt_immutable()""")


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "DROP TRIGGER IF EXISTS immutable_practice_attempt_truncate ON practice_attempts"
        )
        op.execute("DROP TRIGGER IF EXISTS immutable_practice_attempt ON practice_attempts")
        op.execute("DROP FUNCTION IF EXISTS guard_practice_attempt_immutable()")
    op.drop_index("ix_practice_attempts_course_question", table_name="practice_attempts")
    op.drop_index("ix_practice_attempts_user_created", table_name="practice_attempts")
    op.drop_table("practice_attempts")
