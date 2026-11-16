"""Additive self-service profiles, nickname policy and digest-only password recovery."""

import unicodedata
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision = "0006_identity_self_service"
down_revision = "0005_outbox_foundation"


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("nickname_key", sa.String(128)))
        batch.add_column(sa.Column("nickname_changed_at", sa.DateTime(timezone=True)))
        batch.create_unique_constraint("uq_users_nickname_key", ["nickname_key"])
    # Preserve old nicknames; fail the transaction on a normalized collision for review.
    users = sa.table(
        "users",
        sa.column("id"),
        sa.column("nickname"),
        sa.column("nickname_key"),
        sa.column("nickname_changed_at"),
    )
    for row in op.get_bind().execute(sa.select(users.c.id, users.c.nickname)):
        if row.nickname:
            key = unicodedata.normalize("NFKC", row.nickname).strip().casefold()
            op.get_bind().execute(
                users.update()
                .where(users.c.id == row.id)
                .values(nickname_key=key, nickname_changed_at=datetime.now(UTC))
            )
    op.create_table(
        "user_profiles",
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column("contact_email", sa.String(320)),
        sa.Column("phone", sa.String(40)),
        sa.Column("about", sa.String(2000), nullable=False),
        sa.Column("academic_title", sa.String(120), nullable=False),
        sa.Column("show_email_in_courses", sa.Boolean(), nullable=False),
    )
    op.create_table(
        "identity_policy",
        sa.Column("id", sa.String(20), primary_key=True),
        sa.Column("nickname_cooldown_days", sa.Integer(), nullable=False),
        sa.Column("blocked_terms", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
    )
    op.create_table(
        "password_resets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("token_digest", sa.String(64), nullable=False, unique=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("credential_digest", sa.String(64), nullable=False),
        sa.Column("email_digest", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("delivered", sa.Boolean(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_password_resets_user_id", "password_resets", ["user_id"])


def downgrade() -> None:
    op.drop_table("password_resets")
    op.drop_table("identity_policy")
    op.drop_table("user_profiles")
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("uq_users_nickname_key", type_="unique")
        batch.drop_column("nickname_changed_at")
        batch.drop_column("nickname_key")
