"""Course resources, immutable grade schemes, and effective Course Rules history."""

import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision = "0010_course_academic_records"
down_revision = "0009_course_schedule_exceptions"


def upgrade() -> None:
    op.create_table(
        "grade_scheme_versions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "course_id",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("components", sa.JSON(), nullable=False),
        sa.Column("bands", sa.JSON(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("course_id", "version", name="uq_course_grade_scheme_version"),
    )
    op.create_index("ix_grade_scheme_versions_course_id", "grade_scheme_versions", ["course_id"])
    op.create_index(
        "uq_grade_scheme_active_per_course",
        "grade_scheme_versions",
        ["course_id"],
        unique=True,
        postgresql_where=sa.text("active = true"),
        sqlite_where=sa.text("active = 1"),
    )
    op.create_table(
        "course_resources",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "course_id",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("title", sa.String(240), nullable=False),
        sa.Column("note", sa.String(2000), nullable=False),
        sa.Column("coverage", sa.String(1000), nullable=False),
        sa.Column("url", sa.String(2000), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.CheckConstraint("position BETWEEN 0 AND 199", name="ck_course_resource_position"),
    )
    op.create_index("ix_course_resources_course_id", "course_resources", ["course_id"])
    op.create_table(
        "course_rule_publications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "course_id",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("template_version", sa.Integer(), nullable=False),
        sa.Column("rules", sa.JSON(), nullable=False),
        sa.Column(
            "published_by",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("course_id", "version", name="uq_course_rule_publication_version"),
    )
    op.create_index(
        "ix_course_rule_publications_course_id", "course_rule_publications", ["course_id"]
    )
    bind = op.get_bind()
    metadata = sa.MetaData()
    courses = sa.Table("courses", metadata, autoload_with=bind)
    templates = sa.Table("course_rule_templates", metadata, autoload_with=bind)
    active = (
        bind.execute(sa.select(templates).where(templates.c.active.is_(True))).mappings().first()
    )
    template_rules = list(active["rules"]) if active else []
    template_version = int(active["version"]) if active else 0
    publications = sa.Table("course_rule_publications", metadata, autoload_with=bind)
    for course in bind.execute(sa.select(courses)).mappings():
        overrides = {item["ruleId"]: item for item in (course["rule_overrides"] or [])}
        rules = []
        for rule in template_rules:
            override = overrides.get(rule["ruleId"])
            if override and override["action"] == "disable":
                continue
            rules.append(
                {
                    **rule,
                    **({"title": override["title"], "body": override["body"]} if override else {}),
                    "source": "override" if override else "shared",
                }
            )
        rules.extend({**item, "source": "custom"} for item in (course["custom_rules"] or []))
        rules.sort(key=lambda item: (int(item["position"]), item["ruleId"]))
        bind.execute(
            publications.insert().values(
                id=str(uuid.uuid4()),
                course_id=course["id"],
                version=1,
                template_version=template_version,
                rules=rules,
                published_by=course["owner_id"],
                published_at=course["created_at"] or datetime.now(UTC),
            )
        )
    if bind.dialect.name == "postgresql":
        op.execute(
            """CREATE FUNCTION guard_grade_scheme_version() RETURNS trigger AS $$
            BEGIN
                IF TG_OP = 'DELETE' OR NEW.course_id IS DISTINCT FROM OLD.course_id
                   OR NEW.version IS DISTINCT FROM OLD.version
                   OR NEW.components::jsonb IS DISTINCT FROM OLD.components::jsonb
                   OR NEW.bands::jsonb IS DISTINCT FROM OLD.bands::jsonb
                   OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
                    RAISE EXCEPTION 'grade_scheme_versions are immutable';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql"""
        )
        op.execute(
            "CREATE TRIGGER immutable_grade_scheme_version BEFORE UPDATE OR DELETE "
            "ON grade_scheme_versions FOR EACH ROW EXECUTE FUNCTION guard_grade_scheme_version()"
        )
        op.execute(
            """CREATE FUNCTION reject_grade_scheme_truncate() RETURNS trigger AS $$
            BEGIN RAISE EXCEPTION 'grade_scheme_versions are immutable'; END;
            $$ LANGUAGE plpgsql"""
        )
        op.execute(
            "CREATE TRIGGER immutable_grade_scheme_truncate BEFORE TRUNCATE "
            "ON grade_scheme_versions FOR EACH STATEMENT EXECUTE FUNCTION reject_grade_scheme_truncate()"
        )
        op.execute(
            """CREATE FUNCTION reject_course_rule_publication_mutation() RETURNS trigger AS $$
            BEGIN RAISE EXCEPTION 'course_rule_publications are immutable'; END;
            $$ LANGUAGE plpgsql"""
        )
        op.execute(
            "CREATE TRIGGER immutable_course_rule_publication BEFORE UPDATE OR DELETE "
            "ON course_rule_publications FOR EACH ROW "
            "EXECUTE FUNCTION reject_course_rule_publication_mutation()"
        )
        op.execute(
            "CREATE TRIGGER immutable_course_rule_publication_truncate BEFORE TRUNCATE "
            "ON course_rule_publications FOR EACH STATEMENT "
            "EXECUTE FUNCTION reject_course_rule_publication_mutation()"
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS immutable_grade_scheme_truncate ON grade_scheme_versions")
        op.execute("DROP FUNCTION IF EXISTS reject_grade_scheme_truncate()")
        op.execute("DROP TRIGGER IF EXISTS immutable_grade_scheme_version ON grade_scheme_versions")
        op.execute("DROP FUNCTION IF EXISTS guard_grade_scheme_version()")
        op.execute(
            "DROP TRIGGER immutable_course_rule_publication_truncate ON course_rule_publications"
        )
        op.execute("DROP TRIGGER immutable_course_rule_publication ON course_rule_publications")
        op.execute("DROP FUNCTION reject_course_rule_publication_mutation()")
    op.drop_index("ix_course_rule_publications_course_id", table_name="course_rule_publications")
    op.drop_table("course_rule_publications")
    op.drop_index("ix_course_resources_course_id", table_name="course_resources")
    op.drop_table("course_resources")
    if "grade_scheme_version_id" in {
        column["name"] for column in inspector.get_columns("courses")
    }:
        op.drop_column("courses", "grade_scheme_version_id")
    if "uq_grade_scheme_active_per_course" in {
        index["name"] for index in inspector.get_indexes("grade_scheme_versions")
    }:
        op.drop_index("uq_grade_scheme_active_per_course", table_name="grade_scheme_versions")
    op.drop_index("ix_grade_scheme_versions_course_id", table_name="grade_scheme_versions")
    op.drop_table("grade_scheme_versions")
