"""Store immutable, audited platform logo versions."""

import sqlalchemy as sa
from alembic import op

revision = "0048_platform_branding"
down_revision = "0047_clan_competition_rewards"


def upgrade() -> None:
    op.create_table(
        "platform_logos",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column("digest", sa.String(64), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column(
            "created_by_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("version > 0", name="ck_platform_logo_version"),
        sa.UniqueConstraint("version", name="uq_platform_logo_version"),
    )
    op.create_index(
        "uq_platform_logo_active",
        "platform_logos",
        ["is_active"],
        unique=True,
        postgresql_where=sa.text("is_active = true"),
        sqlite_where=sa.text("is_active = 1"),
    )


def downgrade() -> None:
    op.drop_index("uq_platform_logo_active", table_name="platform_logos")
    op.drop_table("platform_logos")
