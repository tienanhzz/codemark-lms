"""Private bounded avatar bytes; no public file paths or original uploads."""

import sqlalchemy as sa
from alembic import op

revision = "0008_protected_avatars"
down_revision = "0007_identity_provisioning"


def upgrade() -> None:
    op.create_table(
        "user_avatars",
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column("id", sa.String(36), nullable=False, unique=True),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column("digest", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("length(content) BETWEEN 1 AND 1000000", name="ck_avatar_size"),
    )


def downgrade() -> None:
    op.drop_table("user_avatars")
