"""Initial identity, preferences, sessions, throttles and immutable audit."""

import sqlalchemy as sa
from alembic import op

revision = "0001_identity"
down_revision = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("username", sa.String(128), nullable=False, unique=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("official_name", sa.String(200), nullable=False),
        sa.Column("nickname", sa.String(100), nullable=True, unique=True),
        sa.Column("roles", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("password_hash", sa.String(512), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "user_sessions",
        sa.Column("token_digest", sa.String(64), primary_key=True),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("csrf_digest", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])
    op.create_table(
        "user_preferences",
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column("settings", sa.JSON(), nullable=False),
    )
    op.create_table(
        "login_rate_limits",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("failures", sa.Integer(), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "audit_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("actor_id", sa.String(36), nullable=True),
        sa.Column("action", sa.String(80), nullable=False),
        sa.Column("request_id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("detail", sa.JSON(), nullable=False),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute("""CREATE FUNCTION reject_audit_mutation() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'Audit events are append-only'; END;
        $$ LANGUAGE plpgsql""")
        op.execute(
            "CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_events "
            "FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation()"
        )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP TRIGGER immutable_audit ON audit_events")
        op.execute("DROP FUNCTION reject_audit_mutation()")
    for table in [
        "audit_events",
        "login_rate_limits",
        "user_preferences",
        "user_sessions",
        "users",
    ]:
        op.drop_table(table)
