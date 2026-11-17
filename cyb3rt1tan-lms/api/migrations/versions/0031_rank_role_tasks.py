"""Versioned staff-rank task requirements and trusted metric/manual review progress."""

import sqlalchemy as sa
from alembic import op

revision = "0031_rank_role_tasks"
down_revision = "0030_marketplace_disputes"


def upgrade() -> None:
    op.create_table(
        "rank_role_tasks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "policy_id",
            sa.String(36),
            sa.ForeignKey("rank_policies.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("tier_key", sa.String(64), nullable=False),
        sa.Column("staff_role", sa.String(40), nullable=False),
        sa.Column("task_key", sa.String(64), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("requirement_type", sa.String(16), nullable=False),
        sa.Column("event_key", sa.String(80), nullable=True),
        sa.Column("target_count", sa.Integer(), nullable=True),
        sa.CheckConstraint(
            "staff_role IN ('teacher','teachingAssistant','admin','administrativeAssistant','researchAssistant')",
            name="ck_rank_role_task_role",
        ),
        sa.CheckConstraint(
            "requirement_type IN ('metric','manual_review')", name="ck_rank_role_task_type"
        ),
        sa.CheckConstraint(
            "(requirement_type = 'metric' AND event_key IS NOT NULL AND target_count > 0) OR (requirement_type = 'manual_review' AND event_key IS NULL AND target_count IS NULL)",
            name="ck_rank_role_task_requirement",
        ),
        sa.UniqueConstraint(
            "policy_id", "tier_key", "staff_role", "task_key", name="uq_rank_role_task"
        ),
    )
    op.create_index("ix_rank_role_task_policy_tier", "rank_role_tasks", ["policy_id", "tier_key"])
    op.create_table(
        "rank_task_metric_receipts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("event_key", sa.String(80), nullable=False),
        sa.Column("source_event_id", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "user_id", "event_key", "source_event_id", name="uq_rank_metric_receipt"
        ),
    )
    op.create_index(
        "ix_rank_metric_user_event", "rank_task_metric_receipts", ["user_id", "event_key"]
    )
    op.create_table(
        "rank_task_requests",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column(
            "policy_id",
            sa.String(36),
            sa.ForeignKey("rank_policies.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("tier_key", sa.String(64), nullable=False),
        sa.Column("task_key", sa.String(64), nullable=False),
        sa.Column("evidence", sa.String(1000), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("idempotency_key", sa.String(160), nullable=False),
        sa.Column(
            "reviewer_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("reviewer_reason", sa.String(500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending','approved','rejected')", name="ck_rank_task_request_status"
        ),
        sa.UniqueConstraint("user_id", "idempotency_key", name="uq_rank_task_request_idempotency"),
    )
    op.create_index("ix_rank_task_request_status", "rank_task_requests", ["status", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_rank_task_request_status", table_name="rank_task_requests")
    op.drop_table("rank_task_requests")
    op.drop_index("ix_rank_metric_user_event", table_name="rank_task_metric_receipts")
    op.drop_table("rank_task_metric_receipts")
    op.drop_index("ix_rank_role_task_policy_tier", table_name="rank_role_tasks")
    op.drop_table("rank_role_tasks")
