"""Durable runner admission receipts and idempotent result records; no execution."""

import sqlalchemy as sa
from alembic import op

revision = "0015_runner_queue_admission"
down_revision = "0014_taxonomy_redirects"


def upgrade() -> None:
    op.create_table(
        "runner_job_receipts",
        sa.Column("job_id", sa.String(36), primary_key=True),
        sa.Column("outbox_id", sa.String(36), sa.ForeignKey("outbox_messages.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("idempotency_key", sa.String(160), nullable=False),
        sa.Column("payload_digest", sa.String(64), nullable=False),
        sa.Column("admitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("outbox_id", name="uq_runner_receipt_outbox"),
        sa.UniqueConstraint("idempotency_key", name="uq_runner_receipt_idempotency"),
    )
    op.create_table(
        "runner_job_results",
        sa.Column("job_id", sa.String(36), sa.ForeignKey("runner_job_receipts.job_id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.Column("result_digest", sa.String(64), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            """CREATE FUNCTION guard_runner_record_immutable() RETURNS trigger AS $$
            BEGIN RAISE EXCEPTION 'runner admission records are immutable'; END;
            $$ LANGUAGE plpgsql"""
        )
        for table in ("runner_job_receipts", "runner_job_results"):
            op.execute(
                f"CREATE TRIGGER immutable_{table} BEFORE UPDATE OR DELETE ON {table} "
                "FOR EACH ROW EXECUTE FUNCTION guard_runner_record_immutable()"
            )
            op.execute(
                f"CREATE TRIGGER immutable_{table}_truncate BEFORE TRUNCATE ON {table} "
                "FOR EACH STATEMENT EXECUTE FUNCTION guard_runner_record_immutable()"
            )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        for table in ("runner_job_receipts", "runner_job_results"):
            op.execute(f"DROP TRIGGER IF EXISTS immutable_{table}_truncate ON {table}")
            op.execute(f"DROP TRIGGER IF EXISTS immutable_{table} ON {table}")
        op.execute("DROP FUNCTION IF EXISTS guard_runner_record_immutable()")
    op.drop_table("runner_job_results")
    op.drop_table("runner_job_receipts")
