"""Retain draft selection criteria alongside immutable publication snapshots."""

import sqlalchemy as sa
from alembic import op

revision = "0051_assessment_tag_selection"
down_revision = "0050_home_announcements"


def upgrade() -> None:
    op.add_column("assessment_versions", sa.Column("selection_criteria", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("assessment_versions", "selection_criteria")
