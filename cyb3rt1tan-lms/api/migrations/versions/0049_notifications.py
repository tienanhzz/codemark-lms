"""Add versioned notification templates, recipient feed and preferences."""

import sqlalchemy as sa
from alembic import op

revision = "0049_notifications"
down_revision = "0048_platform_branding"


def upgrade() -> None:
    op.create_table(
        "notification_preferences",
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column("email_nonessential", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("locale", sa.String(8), server_default="en", nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("locale IN ('en','vi')", name="ck_notification_preference_locale"),
    )
    op.create_table(
        "notification_templates",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("template_id", sa.String(64), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("event_key", sa.String(80), nullable=False),
        sa.Column("locale", sa.String(8), nullable=False),
        sa.Column("mandatory", sa.Boolean(), nullable=False),
        sa.Column("channels", sa.JSON(), nullable=False),
        sa.Column("subject", sa.String(200), nullable=False),
        sa.Column("body", sa.String(4000), nullable=False),
        sa.Column(
            "author_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("version > 0", name="ck_notification_template_version"),
        sa.CheckConstraint("locale IN ('en','vi')", name="ck_notification_template_locale"),
        sa.UniqueConstraint(
            "template_id", "version", "locale", name="uq_notification_template_version"
        ),
    )
    op.create_index("ix_notification_templates_event_key", "notification_templates", ["event_key"])
    op.create_table(
        "notifications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("event_key", sa.String(80), nullable=False),
        sa.Column("template_id", sa.String(64), nullable=False),
        sa.Column("severity", sa.String(16), nullable=False),
        sa.Column("mandatory", sa.Boolean(), nullable=False),
        sa.Column("require_acknowledgement", sa.Boolean(), nullable=False),
        sa.Column("channels", sa.JSON(), nullable=False),
        sa.Column("audience_scope", sa.String(16), nullable=False),
        sa.Column(
            "course_id",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column(
            "sender_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("idempotency_key", sa.String(160), nullable=False),
        sa.Column("request_digest", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "severity IN ('ordinary','critical','emergency')", name="ck_notification_severity"
        ),
        sa.CheckConstraint(
            "audience_scope IN ('system','course')", name="ck_notification_audience"
        ),
        sa.UniqueConstraint(
            "sender_id", "idempotency_key", name="uq_notification_sender_idempotency"
        ),
    )
    op.create_index("ix_notification_course_created", "notifications", ["course_id", "created_at"])
    op.create_table(
        "notification_recipients",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "notification_id",
            sa.String(36),
            sa.ForeignKey("notifications.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("template_version", sa.Integer(), nullable=False),
        sa.Column("locale", sa.String(8), nullable=False),
        sa.Column("subject", sa.String(200), nullable=False),
        sa.Column("body", sa.String(4000), nullable=False),
        sa.Column("email_status", sa.String(20), server_default="not_requested", nullable=False),
        sa.Column("email_attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("email_next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("email_last_error", sa.String(40), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "email_status IN ('not_requested','queued','sending','delivered','failed','suppressed')",
            name="ck_notification_email_status",
        ),
        sa.UniqueConstraint("notification_id", "user_id", name="uq_notification_recipient"),
    )
    op.create_index(
        "ix_notification_recipient_feed", "notification_recipients", ["user_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_notification_recipient_feed", table_name="notification_recipients")
    op.drop_table("notification_recipients")
    op.drop_index("ix_notification_course_created", table_name="notifications")
    op.drop_table("notifications")
    op.drop_index("ix_notification_templates_event_key", table_name="notification_templates")
    op.drop_table("notification_templates")
    op.drop_table("notification_preferences")
