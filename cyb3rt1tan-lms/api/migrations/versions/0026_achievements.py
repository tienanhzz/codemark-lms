"""Versioned event-backed achievements and equipable earned titles."""

import sqlalchemy as sa
from alembic import op

revision = "0026_achievements"
down_revision = "0025_missions_rewards"


def upgrade() -> None:
    op.create_table(
        "achievements",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("current_version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "achievement_versions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "achievement_id",
            sa.String(64),
            sa.ForeignKey("achievements.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("description", sa.String(1000), nullable=False),
        sa.Column("event_key", sa.String(80), nullable=False),
        sa.Column("eligible_roles", sa.JSON(), nullable=False),
        sa.Column("tiers", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column(
            "author_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('active','retired')", name="ck_achievement_version_status"),
        sa.UniqueConstraint("achievement_id", "version", name="uq_achievement_version"),
    )
    op.create_index(
        "ix_achievement_versions_event_status", "achievement_versions", ["event_key", "status"]
    )
    op.create_table(
        "user_achievements",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column(
            "achievement_id",
            sa.String(64),
            sa.ForeignKey("achievements.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("unlocked_tiers", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "user_id", "achievement_id", "version", name="uq_user_achievement_version"
        ),
    )
    op.create_table(
        "achievement_event_receipts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column(
            "achievement_id",
            sa.String(64),
            sa.ForeignKey("achievements.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("source_event_id", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "user_id",
            "achievement_id",
            "version",
            "source_event_id",
            name="uq_achievement_event_receipt",
        ),
    )
    op.create_index(
        "ix_achievement_event_receipts_source",
        "achievement_event_receipts",
        ["achievement_id", "version"],
    )
    op.create_table(
        "user_equipped_titles",
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column(
            "achievement_id",
            sa.String(64),
            sa.ForeignKey("achievements.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("tier_key", sa.String(64), nullable=False),
        sa.Column("title", sa.String(80), nullable=False),
        sa.Column("equipped_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("user_equipped_titles")
    op.drop_index("ix_achievement_event_receipts_source", table_name="achievement_event_receipts")
    op.drop_table("achievement_event_receipts")
    op.drop_table("user_achievements")
    op.drop_index("ix_achievement_versions_event_status", table_name="achievement_versions")
    op.drop_table("achievement_versions")
    op.drop_table("achievements")
