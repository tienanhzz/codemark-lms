"""Course catalogs, retained academic records, planning and scoped permissions."""

import sqlalchemy as sa
from alembic import op

revision = "0004_course_workflows"
down_revision = "0003_pending_invitation"


def upgrade() -> None:
    op.create_table(
        "faculties",
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column("names", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
    )
    op.create_table(
        "academic_terms",
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column("name", sa.String(240), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
    )
    op.create_table(
        "courses",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("code", sa.String(80), nullable=False, unique=True),
        sa.Column("title", sa.String(240), nullable=False),
        sa.Column("faculty_id", sa.String(128), sa.ForeignKey("faculties.id", ondelete="RESTRICT")),
        sa.Column(
            "term_id",
            sa.String(128),
            sa.ForeignKey("academic_terms.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("module", sa.JSON(), nullable=False),
        sa.Column(
            "owner_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("archived_from", sa.String(20)),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("lesson_plan", sa.JSON(), nullable=False),
        sa.Column("rule_overrides", sa.JSON(), nullable=False),
        sa.Column("custom_rules", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("revision >= 1", name="ck_course_revision"),
        sa.CheckConstraint(
            "status IN ('draft','active','completed','archived')", name="ck_course_status"
        ),
    )
    op.create_table(
        "course_staff",
        sa.Column(
            "course_id",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column("role", sa.String(40), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
    )
    op.create_table(
        "course_memberships",
        sa.Column(
            "course_id",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("section_id", sa.String(128)),
        sa.CheckConstraint(
            "status IN ('invited','active','withdrawn','completed')", name="ck_membership_status"
        ),
    )
    op.create_table(
        "course_permission_grants",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "course_id",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("key", sa.String(80), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
    )
    op.create_index(
        "ix_course_permission_grants_course_id", "course_permission_grants", ["course_id"]
    )
    op.create_table(
        "course_rule_templates",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False, unique=True),
        sa.Column("rules", sa.JSON(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
    )
    op.create_table(
        "teaching_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "course_id",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("section_id", sa.String(128)),
        sa.Column("room", sa.String(240)),
        sa.Column("online_url", sa.String(2000)),
        sa.Column("plan_entry_id", sa.String(64)),
    )
    op.create_index("ix_teaching_sessions_course_id", "teaching_sessions", ["course_id"])


def downgrade() -> None:
    for table in [
        "teaching_sessions",
        "course_rule_templates",
        "course_permission_grants",
        "course_memberships",
        "course_staff",
        "courses",
        "academic_terms",
        "faculties",
    ]:
        op.drop_table(table)
