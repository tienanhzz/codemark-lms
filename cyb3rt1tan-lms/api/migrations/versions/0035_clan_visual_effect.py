"""Store the active clan level color projection."""

import sqlalchemy as sa
from alembic import op

revision = "0035_clan_visual_effect"
down_revision = "0034_clan_level_policies"


def upgrade() -> None:
    op.add_column(
        "clans",
        sa.Column("color", sa.String(24), nullable=False, server_default="#176b87"),
    )


def downgrade() -> None:
    op.drop_column("clans", "color")
