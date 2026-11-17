"""Version-pinned assessment recipients and persistent learner attempts."""

import sqlalchemy as sa
from alembic import op

revision = "0017_assessment_attempts"
down_revision = "0016_assessment_authoring"


def upgrade() -> None:
    op.create_table(
        "assessment_recipients",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "assessment_id",
            sa.String(36),
            sa.ForeignKey("assessments.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "version_id",
            sa.String(36),
            sa.ForeignKey("assessment_versions.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("version_id", "user_id", name="uq_assessment_recipient_version_user"),
        sa.CheckConstraint(
            "status IN ('pending','inProgress','submitted')", name="ck_assessment_recipient_status"
        ),
    )
    op.create_index(
        "ix_assessment_recipients_assessment_user",
        "assessment_recipients",
        ["assessment_id", "user_id"],
    )
    op.create_table(
        "assessment_attempts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "recipient_id",
            sa.String(36),
            sa.ForeignKey("assessment_recipients.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("answers", sa.JSON(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deadline", sa.DateTime(timezone=True)),
        sa.Column("submitted_at", sa.DateTime(timezone=True)),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.UniqueConstraint("recipient_id", "attempt_number", name="uq_assessment_attempt_number"),
        sa.CheckConstraint("attempt_number BETWEEN 1 AND 20", name="ck_assessment_attempt_number"),
        sa.CheckConstraint(
            "status IN ('inProgress','submitted','forceSubmitted')",
            name="ck_assessment_attempt_status",
        ),
        sa.CheckConstraint("revision >= 1", name="ck_assessment_attempt_revision"),
    )
    op.create_index(
        "ix_assessment_attempts_recipient_status", "assessment_attempts", ["recipient_id", "status"]
    )


def downgrade() -> None:
    op.drop_index("ix_assessment_attempts_recipient_status", table_name="assessment_attempts")
    op.drop_table("assessment_attempts")
    op.drop_index("ix_assessment_recipients_assessment_user", table_name="assessment_recipients")
    op.drop_table("assessment_recipients")
