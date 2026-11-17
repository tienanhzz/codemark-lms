"""Permission scoped reports, short-lived report jobs and privacy-safe audit IP index."""

import sqlalchemy as sa
from alembic import op

revision = "0022_learning_reports_audit"
down_revision = "0021_attendance_lifecycle"


def upgrade() -> None:
    op.add_column("audit_events", sa.Column("ip_digest", sa.String(64), nullable=True))
    op.create_index("ix_audit_events_ip_digest", "audit_events", ["ip_digest"])
    op.create_table(
        "report_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "actor_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("format", sa.String(10), nullable=False),
        sa.Column("filters", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("format IN ('csv','xlsx')", name="ck_report_job_format"),
        sa.CheckConstraint("expires_at > created_at", name="ck_report_job_expiry"),
    )
    op.create_index("ix_report_jobs_actor_created", "report_jobs", ["actor_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_report_jobs_actor_created", table_name="report_jobs")
    op.drop_table("report_jobs")
    op.drop_index("ix_audit_events_ip_digest", table_name="audit_events")
    op.drop_column("audit_events", "ip_digest")
