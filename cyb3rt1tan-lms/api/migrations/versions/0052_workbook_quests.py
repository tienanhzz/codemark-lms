"""Role-scoped workbook quests with durable receipts and independently reviewed evidence."""

import sqlalchemy as sa
from alembic import op

revision = "0052_workbook_quests"
down_revision = "0051_assessment_tag_selection"


def upgrade() -> None:
    op.create_table(
        "quest_definitions",
        sa.Column("quest_code", sa.String(64), primary_key=True),
        sa.Column("target_role", sa.String(20), nullable=False),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("quest_name", sa.String(240), nullable=False),
        sa.Column("condition_desc", sa.String(3000), nullable=False),
        sa.Column("reset_type", sa.String(20), nullable=False),
        sa.Column("limit_rule", sa.String(1000), nullable=False),
        sa.Column("reward_exp", sa.Integer(), nullable=False),
        sa.Column("reward_coin", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("target_role IN ('student','teacher')", name="ck_quest_role"),
        sa.CheckConstraint(
            "reset_type IN ('DAILY','WEEKLY','PER_ENTITY','UPGRADE_TIER','END_OF_TERM')",
            name="ck_quest_reset",
        ),
        sa.CheckConstraint("reward_exp >= 0 AND reward_coin >= 0", name="ck_quest_rewards"),
    )
    op.create_table(
        "quest_completions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column(
            "quest_code",
            sa.String(64),
            sa.ForeignKey("quest_definitions.quest_code", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("group_key", sa.String(64), nullable=False),
        sa.Column("cycle_key", sa.String(220), nullable=False),
        sa.Column("slot_key", sa.String(200), nullable=False),
        sa.Column("source_event_id", sa.String(200), nullable=False),
        sa.Column("base_exp", sa.Integer(), nullable=False),
        sa.Column("base_coin", sa.Integer(), nullable=False),
        sa.Column("exp_awarded", sa.Integer(), nullable=False),
        sa.Column("coin_awarded", sa.Integer(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("detail", sa.JSON(), nullable=False),
        sa.UniqueConstraint(
            "user_id", "group_key", "cycle_key", "slot_key", name="uq_quest_completion_slot"
        ),
    )
    op.create_index("ix_quest_completions_user_id", "quest_completions", ["user_id"])
    op.create_table(
        "quest_event_receipts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("event_key", sa.String(80), nullable=False),
        sa.Column("source_event_id", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "user_id", "event_key", "source_event_id", name="uq_quest_event_source"
        ),
    )
    op.create_table(
        "quest_activity_days",
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column("day", sa.String(10), primary_key=True),
        sa.Column("logged_in", sa.Boolean(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
    )
    op.create_table(
        "quest_evidence",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column(
            "quest_code",
            sa.String(64),
            sa.ForeignKey("quest_definitions.quest_code", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "course_id",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("entity_id", sa.String(160), nullable=False),
        sa.Column("evidence_url", sa.String(2000), nullable=False),
        sa.Column("description", sa.String(4000), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column(
            "reviewer_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("review_note", sa.String(4000), nullable=True),
        sa.Column("verified_data", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending','approved','rejected')", name="ck_quest_evidence_status"
        ),
    )
    op.create_index("ix_quest_evidence_user_id", "quest_evidence", ["user_id"])
    op.create_table(
        "quest_resource_views",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column(
            "course_id",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("resource_id", sa.String(36), nullable=False),
        sa.Column("resource_key", sa.String(64), nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_quest_resource_views_user_id", "quest_resource_views", ["user_id"])


def downgrade() -> None:
    op.drop_table("quest_resource_views")
    op.drop_table("quest_evidence")
    op.drop_table("quest_activity_days")
    op.drop_table("quest_event_receipts")
    op.drop_table("quest_completions")
    op.drop_table("quest_definitions")
