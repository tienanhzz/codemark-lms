"""Bounded, idempotent transactional outbox. No historical audit backfill or dispatch."""

import sqlalchemy as sa
from alembic import op

revision = "0005_outbox_foundation"
down_revision = "0004_course_workflows"


def upgrade() -> None:
    op.create_table(
        "outbox_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "audit_event_id",
            sa.String(36),
            sa.ForeignKey("audit_events.id", ondelete="RESTRICT"),
            nullable=False,
            unique=True,
        ),
        sa.Column("idempotency_key", sa.String(160), nullable=False, unique=True),
        sa.Column("topic", sa.String(80), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("payload_digest", sa.String(64), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("dispatched_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "status IN ('pending','dispatched','exhausted')", name="ck_outbox_status"
        ),
        sa.CheckConstraint("attempts >= 0", name="ck_outbox_attempts"),
    )
    op.create_index("ix_outbox_messages_status", "outbox_messages", ["status"])
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "CREATE TRIGGER immutable_audit_truncate BEFORE TRUNCATE ON audit_events FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation()"
        )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP TRIGGER immutable_audit_truncate ON audit_events")
    op.drop_table("outbox_messages")
