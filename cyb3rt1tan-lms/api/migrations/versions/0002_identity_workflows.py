"""Identity administration, invitation/import lifecycle and encrypted MFA."""

import uuid

import sqlalchemy as sa
from alembic import op

revision = "0002_identity_workflows"
down_revision = "0001_identity"


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("institutional_id", sa.String(128), nullable=True))
        batch.add_column(sa.Column("revision", sa.Integer(), nullable=False, server_default="1"))
        batch.create_unique_constraint("uq_users_institutional_id", ["institutional_id"])
    op.add_column(
        "user_sessions",
        sa.Column("mfa_authenticated", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("user_sessions", sa.Column("id", sa.String(36), nullable=True))
    connection = op.get_bind()
    for token in connection.execute(sa.text("SELECT token_digest FROM user_sessions")).scalars():
        connection.execute(
            sa.text("UPDATE user_sessions SET id=:id WHERE token_digest=:token"),
            {"id": str(uuid.uuid4()), "token": token},
        )
    with op.batch_alter_table("user_sessions") as batch:
        batch.alter_column("id", nullable=False, existing_type=sa.String(36))
        batch.create_unique_constraint("uq_user_sessions_id", ["id"])
    op.create_table(
        "user_mfa_methods",
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column("encrypted_secret", sa.String(512), nullable=False),
        sa.Column("confirmed", sa.Boolean(), nullable=False),
        sa.Column("pending_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_step", sa.Integer(), nullable=False),
    )
    op.create_table(
        "user_mfa_recovery_codes",
        sa.Column("digest", sa.String(64), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_user_mfa_recovery_codes_user_id", "user_mfa_recovery_codes", ["user_id"])
    op.create_table(
        "user_mfa_challenges",
        sa.Column("digest", sa.String(64), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed", sa.Boolean(), nullable=False),
    )
    op.create_table(
        "mfa_required_roles",
        sa.Column("role", sa.String(40), primary_key=True),
        sa.Column("required", sa.Boolean(), nullable=False),
    )
    op.create_table(
        "user_invitations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("token_digest", sa.String(64), nullable=False, unique=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("role", sa.String(40), nullable=False),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
        ),
        sa.Column("created_by", sa.String(36), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered", sa.Boolean(), nullable=False),
    )
    op.create_table(
        "csv_import_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("actor_id", sa.String(36), nullable=False),
        sa.Column("duplicate_policy", sa.String(10), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("checksum", sa.String(64), nullable=True),
        sa.Column("preview_digest", sa.String(64), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("committed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("summary", sa.JSON(), nullable=True),
        sa.Column("outcomes", sa.JSON(), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
    )


def downgrade() -> None:
    for table in [
        "csv_import_jobs",
        "user_invitations",
        "mfa_required_roles",
        "user_mfa_challenges",
        "user_mfa_recovery_codes",
        "user_mfa_methods",
    ]:
        op.drop_table(table)
    with op.batch_alter_table("user_sessions") as batch:
        batch.drop_constraint("uq_user_sessions_id", type_="unique")
        batch.drop_column("id")
        batch.drop_column("mfa_authenticated")
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("uq_users_institutional_id", type_="unique")
        batch.drop_column("institutional_id")
        batch.drop_column("revision")
