"""Enforce one live invitation per normalized recipient at the database boundary."""

import sqlalchemy as sa
from alembic import op

revision = "0003_pending_invitation"
down_revision = "0002_identity_workflows"


def upgrade() -> None:
    predicate = sa.text("consumed_at IS NULL AND revoked_at IS NULL")
    op.create_index(
        "uq_invitation_pending_email",
        "user_invitations",
        ["email"],
        unique=True,
        postgresql_where=predicate,
        sqlite_where=predicate,
    )


def downgrade() -> None:
    op.drop_index("uq_invitation_pending_email", table_name="user_invitations")
