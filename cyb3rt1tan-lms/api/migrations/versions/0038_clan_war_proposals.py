"""Course staff Clan War proposals and Admin review queue."""

import sqlalchemy as sa
from alembic import op

revision = "0038_clan_war_proposals"
down_revision = "0037_clan_missions"


def upgrade() -> None:
    op.create_table(
        "clan_war_proposals",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "course_id",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "author_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("description", sa.String(1000), nullable=False, server_default=""),
        sa.Column(
            "clan_a_id",
            sa.String(36),
            sa.ForeignKey("clans.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "clan_b_id",
            sa.String(36),
            sa.ForeignKey("clans.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("reviewed_by_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column("war_id", sa.String(36), sa.ForeignKey("clan_wars.id", ondelete="RESTRICT")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "status IN ('pending','approved','rejected')", name="ck_clan_war_proposal_status"
        ),
        sa.CheckConstraint("clan_a_id <> clan_b_id", name="ck_clan_war_proposal_distinct_clans"),
    )
    op.create_index(
        "ix_clan_war_proposals_status_created", "clan_war_proposals", ["status", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_clan_war_proposals_status_created", table_name="clan_war_proposals")
    op.drop_table("clan_war_proposals")
