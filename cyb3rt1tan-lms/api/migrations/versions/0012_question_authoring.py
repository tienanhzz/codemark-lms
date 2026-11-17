"""Versioned question authoring and disabled-by-default runtime metadata."""

import sqlalchemy as sa
from alembic import op

revision = "0012_question_authoring"
down_revision = "0011_taxonomy_catalog"


def upgrade() -> None:
    op.create_table(
        "questions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "course_id",
            sa.String(36),
            sa.ForeignKey("courses.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("latest_version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("latest_version >= 1", name="ck_question_latest_version"),
        sa.CheckConstraint("status IN ('active','retired')", name="ck_question_status"),
    )
    op.create_index("ix_questions_course_id", "questions", ["course_id"])
    op.create_index("ix_questions_created_by", "questions", ["created_by"])
    op.create_index("ix_questions_course_created", "questions", ["course_id", "created_at"])
    op.create_table(
        "question_versions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "question_id",
            sa.String(36),
            sa.ForeignKey("questions.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("question_type", sa.String(40), nullable=False),
        sa.Column("title", sa.String(240), nullable=False),
        sa.Column("prompt", sa.String(20000), nullable=False),
        sa.Column("category_scope", sa.String(20), nullable=False),
        sa.Column("category_id", sa.String(128), nullable=False),
        sa.Column("difficulty", sa.String(20), nullable=False),
        sa.Column("language", sa.String(20), nullable=False),
        sa.Column("usage_types", sa.JSON(), nullable=False),
        sa.Column("content", sa.JSON(), nullable=False),
        sa.Column("authoring_config", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("validation", sa.JSON(), nullable=True),
        sa.Column(
            "created_by",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "question_type IN ('code','writing','sentenceRewriting','multipleChoice','multipleSelect',"
            "'shortAnswer','fillInTheBlank','matching','ordering','trueFalseNotGiven','readingSet','listeningSet')",
            name="ck_question_version_type",
        ),
        sa.CheckConstraint(
            "difficulty IN ('newbie','noob','wannabe','gatekeeper','legendary')",
            name="ck_question_version_difficulty",
        ),
        sa.CheckConstraint(
            "status IN ('draft','validated','published','archived')",
            name="ck_question_version_status",
        ),
        sa.CheckConstraint("version >= 1", name="ck_question_version_number"),
        sa.ForeignKeyConstraint(
            ["category_scope", "category_id"],
            ["taxonomy_categories.scope", "taxonomy_categories.id"],
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint("question_id", "version", name="uq_question_version_number"),
    )
    op.create_index("ix_question_versions_question_id", "question_versions", ["question_id"])
    op.create_index(
        "ix_question_versions_question_status",
        "question_versions",
        ["question_id", "status", "version"],
    )
    op.create_table(
        "question_version_tags",
        sa.Column(
            "question_version_id",
            sa.String(36),
            sa.ForeignKey("question_versions.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column("tag_scope", sa.String(20), primary_key=True),
        sa.Column("tag_id", sa.String(128), primary_key=True),
        sa.ForeignKeyConstraint(
            ["tag_scope", "tag_id"],
            ["taxonomy_tags.scope", "taxonomy_tags.id"],
            ondelete="RESTRICT",
        ),
    )
    op.create_table(
        "runtime_profile_versions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("profile_id", sa.String(128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("profile", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column(
            "created_by",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("version >= 1", name="ck_runtime_profile_version"),
        sa.CheckConstraint(
            "status IN ('draft','test','active','deprecated')", name="ck_runtime_profile_status"
        ),
        sa.UniqueConstraint("profile_id", "version", name="uq_runtime_profile_version"),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            """CREATE FUNCTION guard_question_version_immutable() RETURNS trigger AS $$
            BEGIN
                IF TG_OP = 'DELETE' OR NEW.question_id IS DISTINCT FROM OLD.question_id
                   OR NEW.version IS DISTINCT FROM OLD.version
                   OR NEW.question_type IS DISTINCT FROM OLD.question_type
                   OR NEW.title IS DISTINCT FROM OLD.title OR NEW.prompt IS DISTINCT FROM OLD.prompt
                   OR NEW.category_scope IS DISTINCT FROM OLD.category_scope
                   OR NEW.category_id IS DISTINCT FROM OLD.category_id
                   OR NEW.difficulty IS DISTINCT FROM OLD.difficulty
                   OR NEW.language IS DISTINCT FROM OLD.language
                   OR NEW.usage_types::jsonb IS DISTINCT FROM OLD.usage_types::jsonb
                   OR NEW.content::jsonb IS DISTINCT FROM OLD.content::jsonb
                   OR NEW.authoring_config::jsonb IS DISTINCT FROM OLD.authoring_config::jsonb
                   OR NEW.created_by IS DISTINCT FROM OLD.created_by
                   OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
                    RAISE EXCEPTION 'question version content is immutable';
                END IF;
                IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
                    (OLD.status = 'draft' AND NEW.status = 'validated')
                    OR (OLD.status = 'validated' AND NEW.status = 'published')
                ) THEN
                    RAISE EXCEPTION 'invalid question version status transition';
                END IF;
                IF OLD.status = 'published' AND (
                    NEW.validation::jsonb IS DISTINCT FROM OLD.validation::jsonb
                    OR NEW.validated_at IS DISTINCT FROM OLD.validated_at
                    OR NEW.published_at IS DISTINCT FROM OLD.published_at
                ) THEN
                    RAISE EXCEPTION 'published question version is immutable';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql"""
        )
        op.execute(
            "CREATE TRIGGER immutable_question_version BEFORE UPDATE OR DELETE ON question_versions "
            "FOR EACH ROW EXECUTE FUNCTION guard_question_version_immutable()"
        )
        op.execute(
            """CREATE FUNCTION guard_runtime_profile_immutable() RETURNS trigger AS $$
            BEGIN RAISE EXCEPTION 'runtime profile versions are immutable'; END;
            $$ LANGUAGE plpgsql"""
        )
        op.execute(
            "CREATE TRIGGER immutable_runtime_profile BEFORE UPDATE OR DELETE ON runtime_profile_versions "
            "FOR EACH ROW EXECUTE FUNCTION guard_runtime_profile_immutable()"
        )
        op.execute(
            """CREATE FUNCTION reject_question_version_truncate() RETURNS trigger AS $$
            BEGIN RAISE EXCEPTION 'question versions are immutable'; END;
            $$ LANGUAGE plpgsql"""
        )
        op.execute(
            "CREATE TRIGGER immutable_question_version_truncate BEFORE TRUNCATE ON question_versions "
            "FOR EACH STATEMENT EXECUTE FUNCTION reject_question_version_truncate()"
        )
        op.execute(
            "CREATE TRIGGER immutable_runtime_profile_truncate BEFORE TRUNCATE ON runtime_profile_versions "
            "FOR EACH STATEMENT EXECUTE FUNCTION reject_question_version_truncate()"
        )
        op.execute(
            """CREATE FUNCTION guard_published_question_version_tags() RETURNS trigger AS $$
            DECLARE version_id VARCHAR(36);
            BEGIN
                version_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.question_version_id
                                   ELSE NEW.question_version_id END;
                IF EXISTS (SELECT 1 FROM question_versions WHERE id = version_id AND status = 'published') THEN
                    RAISE EXCEPTION 'published question tags are immutable';
                END IF;
                IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
            END;
            $$ LANGUAGE plpgsql"""
        )
        op.execute(
            "CREATE TRIGGER immutable_published_question_tags BEFORE INSERT OR UPDATE OR DELETE "
            "ON question_version_tags FOR EACH ROW EXECUTE FUNCTION guard_published_question_version_tags()"
        )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        for trigger, table in (
            ("immutable_runtime_profile_truncate", "runtime_profile_versions"),
            ("immutable_question_version_truncate", "question_versions"),
            ("immutable_runtime_profile", "runtime_profile_versions"),
            ("immutable_question_version", "question_versions"),
        ):
            op.execute(f"DROP TRIGGER IF EXISTS {trigger} ON {table}")
        op.execute(
            "DROP TRIGGER IF EXISTS immutable_published_question_tags ON question_version_tags"
        )
        op.execute("DROP FUNCTION IF EXISTS guard_published_question_version_tags()")
        op.execute("DROP FUNCTION IF EXISTS reject_question_version_truncate()")
        op.execute("DROP FUNCTION IF EXISTS guard_runtime_profile_immutable()")
        op.execute("DROP FUNCTION IF EXISTS guard_question_version_immutable()")
    op.drop_table("runtime_profile_versions")
    op.drop_table("question_version_tags")
    op.drop_index("ix_question_versions_question_status", table_name="question_versions")
    op.drop_index("ix_question_versions_question_id", table_name="question_versions")
    op.drop_table("question_versions")
    op.drop_index("ix_questions_course_created", table_name="questions")
    op.drop_index("ix_questions_created_by", table_name="questions")
    op.drop_index("ix_questions_course_id", table_name="questions")
    op.drop_table("questions")
