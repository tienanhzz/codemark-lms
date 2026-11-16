"""Add public homepage announcements, separate from personal notifications."""

import sqlalchemy as sa
from alembic import op

revision = "0050_home_announcements"
down_revision = "0049_notifications"


def upgrade() -> None:
    op.create_table(
        "home_announcements",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("title", sa.String(180), nullable=False),
        sa.Column("body", sa.String(10000), nullable=False),
        sa.Column("author_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("author_role", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("length(title) BETWEEN 1 AND 180", name="ck_home_announcement_title"),
        sa.CheckConstraint("length(body) BETWEEN 1 AND 10000", name="ck_home_announcement_body"),
    )
    op.create_index("ix_home_announcements_created_at", "home_announcements", ["created_at", "id"])


def downgrade() -> None:
    op.drop_index("ix_home_announcements_created_at", table_name="home_announcements")
    op.drop_table("home_announcements")
