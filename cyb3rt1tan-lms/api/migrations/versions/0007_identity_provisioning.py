"""Additive provisioning metadata, enrollment concurrency and PII-free export manifests."""

import sqlalchemy as sa
from alembic import op

revision = "0007_identity_provisioning"
down_revision = "0006_identity_self_service"


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("faculty_id", sa.String(128)))
        batch.create_foreign_key(
            "fk_users_faculty", "faculties", ["faculty_id"], ["id"], ondelete="RESTRICT"
        )
        batch.add_column(
            sa.Column("provisioning_source", sa.String(20), nullable=False, server_default="legacy")
        )
    with op.batch_alter_table("users") as batch:
        batch.alter_column("provisioning_source", server_default=None)
    users = sa.table("users", sa.column("id"), sa.column("provisioning_source"))
    audit = sa.table("audit_events", sa.column("actor_id"), sa.column("action"))
    op.get_bind().execute(
        users.update()
        .where(
            users.c.id.in_(
                sa.select(audit.c.actor_id).where(audit.c.action == "admin_bootstrapped")
            )
        )
        .values(provisioning_source="bootstrap")
    )
    op.create_index("ix_users_faculty_id", "users", ["faculty_id"])
    op.create_index("ix_users_provisioning_source", "users", ["provisioning_source"])
    with op.batch_alter_table("csv_import_jobs") as batch:
        batch.add_column(
            sa.Column("import_kind", sa.String(20), nullable=False, server_default="users")
        )
        batch.add_column(
            sa.Column("template_version", sa.Integer(), nullable=False, server_default="1")
        )
    with op.batch_alter_table("csv_import_jobs") as batch:
        batch.alter_column("import_kind", server_default=None)
        batch.alter_column("template_version", server_default=None)
    with op.batch_alter_table("course_memberships") as batch:
        batch.add_column(
            sa.Column("source", sa.String(20), nullable=False, server_default="legacy")
        )
        batch.add_column(sa.Column("revision", sa.Integer(), nullable=False, server_default="1"))
        batch.add_column(sa.Column("joined_at", sa.DateTime(timezone=True)))
        batch.add_column(sa.Column("ended_at", sa.DateTime(timezone=True)))
    with op.batch_alter_table("course_memberships") as batch:
        batch.alter_column("source", server_default=None)
        batch.alter_column("revision", server_default=None)
    op.create_table(
        "account_exports",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "actor_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("format", sa.String(10), nullable=False),
        sa.Column("filters", sa.JSON(), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("account_exports")
    op.drop_index("ix_users_faculty_id", table_name="users")
    op.drop_index("ix_users_provisioning_source", table_name="users")
    with op.batch_alter_table("course_memberships") as batch:
        for name in ["source", "revision", "joined_at", "ended_at"]:
            batch.drop_column(name)
    with op.batch_alter_table("csv_import_jobs") as batch:
        batch.drop_column("import_kind")
        batch.drop_column("template_version")
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("fk_users_faculty", type_="foreignkey")
        batch.drop_column("faculty_id")
        batch.drop_column("provisioning_source")
