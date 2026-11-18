"""Identity, per-user presentation preferences and append-only audit."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    LargeBinary,
    String,
    UniqueConstraint,
    event,
    text,
)
from sqlalchemy import (
    inspect as sa_inspect,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def now() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class HomeAnnouncement(Base):
    """Explicit public posts, separate from recipient-scoped notifications."""

    __tablename__ = "home_announcements"
    __table_args__ = (
        CheckConstraint("length(title) BETWEEN 1 AND 180", name="ck_home_announcement_title"),
        CheckConstraint("length(body) BETWEEN 1 AND 10000", name="ck_home_announcement_body"),
        Index("ix_home_announcements_created_at", "created_at", "id"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(180))
    body: Mapped[str] = mapped_column(String(10000))
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    author_role: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username: Mapped[str] = mapped_column(String(128), unique=True)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    institutional_id: Mapped[str | None] = mapped_column(String(128), nullable=True, unique=True)
    faculty_id: Mapped[str | None] = mapped_column(
        ForeignKey("faculties.id", ondelete="RESTRICT"), index=True
    )
    provisioning_source: Mapped[str] = mapped_column(String(20), default="legacy", index=True)
    official_name: Mapped[str] = mapped_column(String(200))
    nickname: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True)
    nickname_key: Mapped[str | None] = mapped_column(String(128), nullable=True, unique=True)
    nickname_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    roles: Mapped[list[str]] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), default="active")
    password_hash: Mapped[str] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    revision: Mapped[int] = mapped_column(default=1)
    __mapper_args__ = {"version_id_col": revision}  # noqa: RUF012


class UserSession(Base):
    __tablename__ = "user_sessions"
    id: Mapped[str] = mapped_column(String(36), default=lambda: str(uuid.uuid4()), unique=True)
    token_digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    csrf_digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    mfa_authenticated: Mapped[bool] = mapped_column(default=False)


class UserProfile(Base):
    __tablename__ = "user_profiles"
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True
    )
    contact_email: Mapped[str | None] = mapped_column(String(320))
    phone: Mapped[str | None] = mapped_column(String(40))
    about: Mapped[str] = mapped_column(String(2000), default="")
    academic_title: Mapped[str] = mapped_column(String(120), default="")
    show_email_in_courses: Mapped[bool] = mapped_column(default=False)


class UserAvatar(Base):
    __tablename__ = "user_avatars"
    __table_args__ = (
        CheckConstraint("length(content) BETWEEN 1 AND 1000000", name="ck_avatar_size"),
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True
    )
    id: Mapped[str] = mapped_column(String(36), unique=True, default=lambda: str(uuid.uuid4()))
    content: Mapped[bytes] = mapped_column(LargeBinary)
    digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class IdentityPolicy(Base):
    __tablename__ = "identity_policy"
    id: Mapped[str] = mapped_column(String(20), primary_key=True, default="identity")
    nickname_cooldown_days: Mapped[int] = mapped_column(default=7)
    blocked_terms: Mapped[list[str]] = mapped_column(JSON, default=list)
    revision: Mapped[int] = mapped_column(default=1)
    __mapper_args__ = {"version_id_col": revision}  # noqa: RUF012


class PasswordReset(Base):
    __tablename__ = "password_resets"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    token_digest: Mapped[str] = mapped_column(String(64), unique=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    credential_digest: Mapped[str] = mapped_column(String(64))
    email_digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    delivered: Mapped[bool] = mapped_column(default=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Preference(Base):
    __tablename__ = "user_preferences"
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True
    )
    settings: Mapped[dict[str, object]] = mapped_column(JSON)


class PlatformLogo(Base):
    __tablename__ = "platform_logos"
    __table_args__ = (
        CheckConstraint("version > 0", name="ck_platform_logo_version"),
        UniqueConstraint("version", name="uq_platform_logo_version"),
        Index(
            "uq_platform_logo_active",
            "is_active",
            unique=True,
            sqlite_where=text("is_active = 1"),
            postgresql_where=text("is_active = true"),
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    version: Mapped[int] = mapped_column()
    content: Mapped[bytes] = mapped_column(LargeBinary)
    digest: Mapped[str] = mapped_column(String(64))
    is_active: Mapped[bool] = mapped_column(default=False, server_default=text("false"))
    created_by_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"
    __table_args__ = (
        CheckConstraint("locale IN ('en','vi')", name="ck_notification_preference_locale"),
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True
    )
    email_nonessential: Mapped[bool] = mapped_column(default=True, server_default=text("true"))
    locale: Mapped[str] = mapped_column(String(8), default="en", server_default="en")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class NotificationTemplate(Base):
    __tablename__ = "notification_templates"
    __table_args__ = (
        UniqueConstraint(
            "template_id", "version", "locale", name="uq_notification_template_version"
        ),
        CheckConstraint("version > 0", name="ck_notification_template_version"),
        CheckConstraint("locale IN ('en','vi')", name="ck_notification_template_locale"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    template_id: Mapped[str] = mapped_column(String(64))
    version: Mapped[int] = mapped_column()
    event_key: Mapped[str] = mapped_column(String(80), index=True)
    locale: Mapped[str] = mapped_column(String(8))
    mandatory: Mapped[bool] = mapped_column(default=False)
    channels: Mapped[list[str]] = mapped_column(JSON)
    subject: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(String(4000))
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        UniqueConstraint("sender_id", "idempotency_key", name="uq_notification_sender_idempotency"),
        CheckConstraint(
            "severity IN ('ordinary','critical','emergency')", name="ck_notification_severity"
        ),
        CheckConstraint("audience_scope IN ('system','course')", name="ck_notification_audience"),
        Index("ix_notification_course_created", "course_id", "created_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    event_key: Mapped[str] = mapped_column(String(80))
    template_id: Mapped[str] = mapped_column(String(64))
    severity: Mapped[str] = mapped_column(String(16))
    mandatory: Mapped[bool] = mapped_column(default=False)
    require_acknowledgement: Mapped[bool] = mapped_column(default=False)
    channels: Mapped[list[str]] = mapped_column(JSON)
    audience_scope: Mapped[str] = mapped_column(String(16))
    course_id: Mapped[str | None] = mapped_column(
        ForeignKey("courses.id", ondelete="RESTRICT"), nullable=True
    )
    sender_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    idempotency_key: Mapped[str] = mapped_column(String(160))
    request_digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class NotificationRecipient(Base):
    __tablename__ = "notification_recipients"
    __table_args__ = (
        UniqueConstraint("notification_id", "user_id", name="uq_notification_recipient"),
        CheckConstraint(
            "email_status IN ('not_requested','queued','sending','delivered','failed','suppressed')",
            name="ck_notification_email_status",
        ),
        Index("ix_notification_recipient_feed", "user_id", "created_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    notification_id: Mapped[str] = mapped_column(
        ForeignKey("notifications.id", ondelete="RESTRICT")
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    template_version: Mapped[int] = mapped_column()
    locale: Mapped[str] = mapped_column(String(8))
    subject: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(String(4000))
    email_status: Mapped[str] = mapped_column(
        String(20), default="not_requested", server_default="not_requested"
    )
    email_attempts: Mapped[int] = mapped_column(default=0, server_default="0")
    email_next_attempt_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    email_last_error: Mapped[str | None] = mapped_column(String(40), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class LoginThrottle(Base):
    __tablename__ = "login_rate_limits"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    failures: Mapped[int] = mapped_column(default=0)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    action: Mapped[str] = mapped_column(String(80))
    request_id: Mapped[str] = mapped_column(String(36))
    ip_digest: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    detail: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)


class OutboxMessage(Base):
    __tablename__ = "outbox_messages"
    __table_args__ = (
        CheckConstraint("status IN ('pending','dispatched','exhausted')", name="ck_outbox_status"),
        CheckConstraint("attempts >= 0", name="ck_outbox_attempts"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    audit_event_id: Mapped[str] = mapped_column(
        ForeignKey("audit_events.id", ondelete="RESTRICT"), unique=True
    )
    idempotency_key: Mapped[str] = mapped_column(String(160), unique=True)
    topic: Mapped[str] = mapped_column(String(80))
    payload: Mapped[dict[str, object]] = mapped_column(JSON)
    payload_digest: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    attempts: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class RunnerJobReceipt(Base):
    __tablename__ = "runner_job_receipts"
    __table_args__ = (
        UniqueConstraint("outbox_id", name="uq_runner_receipt_outbox"),
        UniqueConstraint("idempotency_key", name="uq_runner_receipt_idempotency"),
    )
    job_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    outbox_id: Mapped[str] = mapped_column(ForeignKey("outbox_messages.id", ondelete="RESTRICT"))
    idempotency_key: Mapped[str] = mapped_column(String(160))
    payload_digest: Mapped[str] = mapped_column(String(64))
    admitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class RunnerJobResult(Base):
    __tablename__ = "runner_job_results"
    job_id: Mapped[str] = mapped_column(
        ForeignKey("runner_job_receipts.job_id", ondelete="RESTRICT"), primary_key=True
    )
    result: Mapped[dict[str, object]] = mapped_column(JSON)
    result_digest: Mapped[str] = mapped_column(String(64))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class MfaMethod(Base):
    __tablename__ = "user_mfa_methods"
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True
    )
    encrypted_secret: Mapped[str] = mapped_column(String(512))
    confirmed: Mapped[bool] = mapped_column(default=False)
    pending_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_step: Mapped[int] = mapped_column(default=-1)


class RecoveryCode(Base):
    __tablename__ = "user_mfa_recovery_codes"
    digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MfaChallenge(Base):
    __tablename__ = "user_mfa_challenges"
    digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed: Mapped[bool] = mapped_column(default=False)


class MfaPolicy(Base):
    __tablename__ = "mfa_required_roles"
    role: Mapped[str] = mapped_column(String(40), primary_key=True)
    required: Mapped[bool] = mapped_column(default=False)


class Invitation(Base):
    __tablename__ = "user_invitations"
    __table_args__ = (
        Index(
            "uq_invitation_pending_email",
            "email",
            unique=True,
            postgresql_where=text("consumed_at IS NULL AND revoked_at IS NULL"),
            sqlite_where=text("consumed_at IS NULL AND revoked_at IS NULL"),
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    token_digest: Mapped[str] = mapped_column(String(64), unique=True)
    email: Mapped[str] = mapped_column(String(320))
    role: Mapped[str] = mapped_column(String(40))
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    created_by: Mapped[str] = mapped_column(String(36))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered: Mapped[bool] = mapped_column(default=False)


class CsvImport(Base):
    __tablename__ = "csv_import_jobs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    actor_id: Mapped[str] = mapped_column(String(36))
    duplicate_policy: Mapped[str] = mapped_column(String(10))
    import_kind: Mapped[str] = mapped_column(String(20), default="users")
    template_version: Mapped[int] = mapped_column(default=1)
    status: Mapped[str] = mapped_column(String(20), default="created")
    checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    preview_digest: Mapped[str | None] = mapped_column(String(64), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    committed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    summary: Mapped[dict[str, int] | None] = mapped_column(JSON, nullable=True)
    outcomes: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list)
    snapshot: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list)


class AccountExport(Base):
    __tablename__ = "account_exports"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    kind: Mapped[str] = mapped_column(String(20))
    format: Mapped[str] = mapped_column(String(10))
    filters: Mapped[dict[str, object]] = mapped_column(JSON)
    snapshot: Mapped[list[dict[str, object]]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ReportJob(Base):
    __tablename__ = "report_jobs"
    __table_args__ = (
        CheckConstraint("format IN ('csv','xlsx')", name="ck_report_job_format"),
        CheckConstraint("expires_at > created_at", name="ck_report_job_expiry"),
        Index("ix_report_jobs_actor_created", "actor_id", "created_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    kind: Mapped[str] = mapped_column(String(40))
    format: Mapped[str] = mapped_column(String(10))
    filters: Mapped[dict[str, object]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Faculty(Base):
    __tablename__ = "faculties"
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    names: Mapped[dict[str, str]] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), default="active")
    sort_order: Mapped[int] = mapped_column(default=0)


class AcademicTerm(Base):
    __tablename__ = "academic_terms"
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    name: Mapped[str] = mapped_column(String(240))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    timezone: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(20), default="active")


class Course(Base):
    __tablename__ = "courses"
    __table_args__ = (
        CheckConstraint("revision >= 1", name="ck_course_revision"),
        CheckConstraint(
            "status IN ('draft','active','completed','archived')", name="ck_course_status"
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code: Mapped[str] = mapped_column(String(80), unique=True)
    title: Mapped[str] = mapped_column(String(240))
    faculty_id: Mapped[str | None] = mapped_column(
        ForeignKey("faculties.id", ondelete="RESTRICT"), nullable=True
    )
    term_id: Mapped[str] = mapped_column(ForeignKey("academic_terms.id", ondelete="RESTRICT"))
    timezone: Mapped[str] = mapped_column(String(64))
    module: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    archived_from: Mapped[str | None] = mapped_column(String(20), nullable=True)
    revision: Mapped[int] = mapped_column(default=1)
    lesson_plan: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list)
    rule_overrides: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list)
    custom_rules: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    __mapper_args__ = {"version_id_col": revision}  # noqa: RUF012


class CourseStaff(Base):
    __tablename__ = "course_staff"
    course_id: Mapped[str] = mapped_column(
        ForeignKey("courses.id", ondelete="RESTRICT"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(40))
    active: Mapped[bool] = mapped_column(default=True)


class CourseMembership(Base):
    __tablename__ = "course_memberships"
    __table_args__ = (
        CheckConstraint(
            "status IN ('invited','active','withdrawn','completed')", name="ck_membership_status"
        ),
    )
    course_id: Mapped[str] = mapped_column(
        ForeignKey("courses.id", ondelete="RESTRICT"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True
    )
    status: Mapped[str] = mapped_column(String(20))
    section_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="manual")
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revision: Mapped[int] = mapped_column(default=1)
    __mapper_args__ = {"version_id_col": revision}  # noqa: RUF012


class LessonCompletion(Base):
    __tablename__ = "lesson_completions"
    __table_args__ = (
        UniqueConstraint("course_id", "user_id", "entry_id", name="uq_lesson_completion_entry"),
        Index("ix_lesson_completions_course_user", "course_id", "user_id"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id", ondelete="RESTRICT"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    entry_id: Mapped[str] = mapped_column(String(64))
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class EconomyLedger(Base):
    __tablename__ = "economy_ledger"
    __table_args__ = (
        CheckConstraint("currency IN ('exp','coin')", name="ck_economy_ledger_currency"),
        CheckConstraint("delta <> 0", name="ck_economy_ledger_nonzero"),
        UniqueConstraint("idempotency_key", name="uq_economy_ledger_idempotency"),
        Index("ix_economy_ledger_user_time", "user_id", "created_at"),
        Index("ix_economy_ledger_user_currency", "user_id", "currency"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    currency: Mapped[str] = mapped_column(String(8))
    delta: Mapped[int] = mapped_column()
    source: Mapped[str] = mapped_column(String(80))
    idempotency_key: Mapped[str] = mapped_column(String(160))
    reason: Mapped[str] = mapped_column(String(500), default="")
    actor_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    detail: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ShopItem(Base):
    __tablename__ = "shop_items"
    __table_args__ = (
        CheckConstraint(
            "price_coin >= 0 AND price_exp >= 0 AND stock >= 0 AND purchase_limit > 0",
            name="ck_shop_item_values",
        ),
        CheckConstraint("status IN ('active','retired')", name="ck_shop_item_status"),
        CheckConstraint("discount_percent BETWEEN 0 AND 100", name="ck_shop_item_discount_percent"),
        CheckConstraint(
            "(discount_percent = 0 AND discount_starts_at IS NULL AND discount_ends_at IS NULL) OR "
            "(discount_percent > 0 AND discount_starts_at IS NOT NULL AND discount_ends_at IS NOT NULL "
            "AND discount_ends_at > discount_starts_at)",
            name="ck_shop_item_discount_window",
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    item_key: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(500), default="")
    price_coin: Mapped[int] = mapped_column()
    price_exp: Mapped[int] = mapped_column(default=0, server_default="0")
    stock: Mapped[int] = mapped_column(default=0)
    purchase_limit: Mapped[int] = mapped_column(default=1)
    eligible_roles: Mapped[list[str]] = mapped_column(JSON, default=list)
    effect_type: Mapped[str] = mapped_column(String(40))
    effect_config: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    discount_percent: Mapped[int] = mapped_column(default=0, server_default="0")
    discount_starts_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    discount_ends_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    tradeable: Mapped[bool] = mapped_column(default=False)
    status: Mapped[str] = mapped_column(String(16), default="active")
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class InventoryItem(Base):
    __tablename__ = "inventory_items"
    __table_args__ = (
        CheckConstraint(
            "status IN ('available','reserved','used','refunded')", name="ck_inventory_item_status"
        ),
        Index("ix_inventory_user_status", "user_id", "status"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    item_id: Mapped[str] = mapped_column(ForeignKey("shop_items.id", ondelete="RESTRICT"))
    purchase_id: Mapped[str] = mapped_column(String(36))
    status: Mapped[str] = mapped_column(String(16), default="available")
    bound: Mapped[bool] = mapped_column(default=True)
    acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class UserExpMultiplier(Base):
    __tablename__ = "user_exp_multipliers"
    __table_args__ = (
        CheckConstraint("multiplier BETWEEN 1 AND 2", name="ck_user_exp_multiplier_value"),
        CheckConstraint("ends_at > starts_at", name="ck_user_exp_multiplier_window"),
        Index("ix_user_exp_multiplier_expiry", "ends_at"),
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True
    )
    multiplier: Mapped[int] = mapped_column(default=2)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class MissionStreakBoost(Base):
    __tablename__ = "mission_streak_boosts"
    __table_args__ = (
        CheckConstraint("base_progress >= 0", name="ck_mission_streak_boost_base"),
        CheckConstraint("granted_progress BETWEEN 0 AND 3", name="ck_mission_streak_boost_grant"),
        CheckConstraint("expires_at > created_at", name="ck_mission_streak_boost_expiry"),
        CheckConstraint(
            "consumed_at IS NULL OR expired_at IS NULL",
            name="ck_mission_streak_boost_terminal_state",
        ),
        Index("ix_mission_streak_boost_pending", "user_id", "mission_id", "expires_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    mission_id: Mapped[str] = mapped_column(String(64))
    mission_version: Mapped[int] = mapped_column()
    cycle_key: Mapped[str] = mapped_column(String(80))
    base_progress: Mapped[int] = mapped_column()
    granted_progress: Mapped[int] = mapped_column()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class UserEquippedShopTitle(Base):
    __tablename__ = "user_equipped_shop_titles"
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True
    )
    inventory_id: Mapped[str] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="RESTRICT"), unique=True
    )
    title: Mapped[str] = mapped_column(String(80))
    equipped_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ShopPurchase(Base):
    __tablename__ = "shop_purchases"
    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="uq_shop_purchase_idempotency"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    item_id: Mapped[str] = mapped_column(ForeignKey("shop_items.id", ondelete="RESTRICT"))
    quantity: Mapped[int] = mapped_column()
    total_coin: Mapped[int] = mapped_column()
    total_exp: Mapped[int] = mapped_column(default=0, server_default="0")
    refund_policy_version: Mapped[int] = mapped_column(default=1, server_default="1")
    idempotency_key: Mapped[str] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ShopRefundPolicy(Base):
    __tablename__ = "shop_refund_policies"
    __table_args__ = (
        CheckConstraint("version > 0", name="ck_shop_refund_policy_version"),
        CheckConstraint("status IN ('active','retired')", name="ck_shop_refund_policy_status"),
        CheckConstraint(
            "refund_window_hours BETWEEN 1 AND 168", name="ck_shop_refund_policy_window"
        ),
        UniqueConstraint("version", name="uq_shop_refund_policy_version"),
        Index("ix_shop_refund_policy_status_version", "status", "version"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    version: Mapped[int] = mapped_column()
    status: Mapped[str] = mapped_column(String(16), default="active")
    enabled: Mapped[bool] = mapped_column(default=False)
    refund_window_hours: Mapped[int] = mapped_column(default=24)
    unused_only: Mapped[bool] = mapped_column(default=True)
    updated_by: Mapped[str] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ShopRefund(Base):
    __tablename__ = "shop_refunds"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','approved','rejected')", name="ck_shop_refund_status"
        ),
        UniqueConstraint("purchase_id", name="uq_shop_refund_purchase"),
        Index("ix_shop_refund_status_created", "status", "created_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    purchase_id: Mapped[str] = mapped_column(ForeignKey("shop_purchases.id", ondelete="RESTRICT"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    policy_version: Mapped[int] = mapped_column()
    reason: Mapped[str] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(16), default="pending")
    decision_key: Mapped[str | None] = mapped_column(String(160), nullable=True)
    resolved_by_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class MarketplaceListing(Base):
    __tablename__ = "marketplace_listings"
    __table_args__ = (
        CheckConstraint("price_coin > 0", name="ck_marketplace_listing_price"),
        CheckConstraint("policy_version > 0", name="ck_marketplace_listing_policy_version"),
        CheckConstraint("fee_percent BETWEEN 0 AND 10", name="ck_marketplace_listing_fee_percent"),
        CheckConstraint(
            "status IN ('active','sold','cancelled','expired','disputed')",
            name="ck_marketplace_listing_status",
        ),
        UniqueConstraint("seller_id", "idempotency_key", name="uq_marketplace_listing_idempotency"),
        UniqueConstraint(
            "buyer_id", "buyer_idempotency_key", name="uq_marketplace_purchase_idempotency"
        ),
        Index("ix_marketplace_listings_status_expiry", "status", "expires_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    seller_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    inventory_id: Mapped[str] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="RESTRICT"), unique=True
    )
    price_coin: Mapped[int] = mapped_column()
    policy_version: Mapped[int] = mapped_column(default=1, server_default="1")
    fee_percent: Mapped[int] = mapped_column(default=0, server_default="0")
    status: Mapped[str] = mapped_column(String(16), default="active")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    buyer_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    buyer_idempotency_key: Mapped[str | None] = mapped_column(String(160), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class MarketplaceOffer(Base):
    __tablename__ = "marketplace_offers"
    __table_args__ = (
        CheckConstraint("offer_coin >= 0", name="ck_marketplace_offer_coin"),
        CheckConstraint("policy_version > 0", name="ck_marketplace_offer_policy_version"),
        CheckConstraint("fee_percent BETWEEN 0 AND 10", name="ck_marketplace_offer_fee_percent"),
        CheckConstraint(
            "status IN ('pending','accepted','rejected','cancelled','expired','disputed')",
            name="ck_marketplace_offer_status",
        ),
        CheckConstraint(
            "offer_coin > 0 OR offered_inventory_id IS NOT NULL", name="ck_marketplace_offer_assets"
        ),
        UniqueConstraint("offerer_id", "idempotency_key", name="uq_marketplace_offer_idempotency"),
        Index("ix_marketplace_offers_listing_status", "listing_id", "status"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    listing_id: Mapped[str] = mapped_column(
        ForeignKey("marketplace_listings.id", ondelete="RESTRICT")
    )
    offerer_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    offer_coin: Mapped[int] = mapped_column(default=0)
    policy_version: Mapped[int] = mapped_column(default=1, server_default="1")
    fee_percent: Mapped[int] = mapped_column(default=0, server_default="0")
    offered_inventory_id: Mapped[str | None] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="RESTRICT"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(16), default="pending")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    idempotency_key: Mapped[str] = mapped_column(String(160))
    decision_key: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class MarketplacePolicy(Base):
    __tablename__ = "marketplace_policies"
    __table_args__ = (
        CheckConstraint("version > 0", name="ck_marketplace_policy_version"),
        CheckConstraint("status IN ('active','retired')", name="ck_marketplace_policy_status"),
        CheckConstraint("listing_fee_percent BETWEEN 0 AND 10", name="ck_marketplace_listing_fee"),
        CheckConstraint("offer_fee_percent BETWEEN 0 AND 10", name="ck_marketplace_offer_fee"),
        CheckConstraint(
            "min_price_coin > 0 AND max_price_coin >= min_price_coin",
            name="ck_marketplace_policy_price_range",
        ),
        CheckConstraint("max_offer_coin >= 0", name="ck_marketplace_policy_offer_max"),
        CheckConstraint(
            "listing_expiry_hours BETWEEN 1 AND 168", name="ck_marketplace_listing_expiry_hours"
        ),
        CheckConstraint(
            "offer_expiry_hours BETWEEN 1 AND 168", name="ck_marketplace_offer_expiry_hours"
        ),
        CheckConstraint(
            "max_active_listings BETWEEN 1 AND 100", name="ck_marketplace_policy_listing_volume"
        ),
        CheckConstraint(
            "max_pending_offers BETWEEN 1 AND 100", name="ck_marketplace_policy_offer_volume"
        ),
        UniqueConstraint("version", name="uq_marketplace_policy_version"),
        Index("ix_marketplace_policy_status_version", "status", "version"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    version: Mapped[int] = mapped_column()
    status: Mapped[str] = mapped_column(String(16), default="active")
    listing_fee_percent: Mapped[int] = mapped_column(default=0)
    offer_fee_percent: Mapped[int] = mapped_column(default=0)
    min_price_coin: Mapped[int] = mapped_column(default=1)
    max_price_coin: Mapped[int] = mapped_column(default=2_000_000_000)
    max_offer_coin: Mapped[int] = mapped_column(default=2_000_000_000)
    listing_expiry_hours: Mapped[int] = mapped_column(default=168)
    offer_expiry_hours: Mapped[int] = mapped_column(default=168)
    max_active_listings: Mapped[int] = mapped_column(default=100)
    max_pending_offers: Mapped[int] = mapped_column(default=100)
    updated_by: Mapped[str] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class MarketplaceDispute(Base):
    __tablename__ = "marketplace_disputes"
    __table_args__ = (
        CheckConstraint(
            "target_type IN ('listing','offer')", name="ck_marketplace_dispute_target_type"
        ),
        CheckConstraint("status IN ('open','resolved')", name="ck_marketplace_dispute_status"),
        UniqueConstraint("target_type", "target_id", name="uq_marketplace_dispute_target"),
        Index("ix_marketplace_dispute_status_created", "status", "created_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    target_type: Mapped[str] = mapped_column(String(16))
    target_id: Mapped[str] = mapped_column(String(36))
    opened_by_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    reason: Mapped[str] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(16), default="open")
    resolution: Mapped[str | None] = mapped_column(String(16), nullable=True)
    resolved_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class RankPolicy(Base):
    __tablename__ = "rank_policies"
    __table_args__ = (
        CheckConstraint("track IN ('student','staff')", name="ck_rank_policy_track"),
        CheckConstraint("status IN ('draft','active','retired')", name="ck_rank_policy_status"),
        UniqueConstraint("track", "version", name="uq_rank_policy_track_version"),
        Index("ix_rank_policies_track_status", "track", "status"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    track: Mapped[str] = mapped_column(String(16))
    version: Mapped[int] = mapped_column()
    status: Mapped[str] = mapped_column(String(16), default="draft")
    effective_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class RankTier(Base):
    __tablename__ = "rank_tiers"
    __table_args__ = (
        CheckConstraint("threshold_exp >= 0", name="ck_rank_tier_threshold"),
        UniqueConstraint("policy_id", "tier_key", name="uq_rank_tier_key"),
        UniqueConstraint("policy_id", "position", name="uq_rank_tier_position"),
        Index("ix_rank_tiers_policy_threshold", "policy_id", "threshold_exp"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    policy_id: Mapped[str] = mapped_column(ForeignKey("rank_policies.id", ondelete="RESTRICT"))
    tier_key: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(120))
    threshold_exp: Mapped[int] = mapped_column()
    icon: Mapped[str] = mapped_column(String(80), default="fa-star")
    color: Mapped[str] = mapped_column(String(24), default="#176b87")
    description: Mapped[str] = mapped_column(String(500), default="")
    position: Mapped[int] = mapped_column()


class RankRoleTask(Base):
    __tablename__ = "rank_role_tasks"
    __table_args__ = (
        CheckConstraint(
            "staff_role IN ('teacher','teachingAssistant','admin','administrativeAssistant','researchAssistant')",
            name="ck_rank_role_task_role",
        ),
        CheckConstraint(
            "requirement_type IN ('metric','manual_review')", name="ck_rank_role_task_type"
        ),
        CheckConstraint(
            "(requirement_type = 'metric' AND event_key IS NOT NULL AND target_count > 0) OR (requirement_type = 'manual_review' AND event_key IS NULL AND target_count IS NULL)",
            name="ck_rank_role_task_requirement",
        ),
        UniqueConstraint(
            "policy_id", "tier_key", "staff_role", "task_key", name="uq_rank_role_task"
        ),
        Index("ix_rank_role_task_policy_tier", "policy_id", "tier_key"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    policy_id: Mapped[str] = mapped_column(ForeignKey("rank_policies.id", ondelete="RESTRICT"))
    tier_key: Mapped[str] = mapped_column(String(64))
    staff_role: Mapped[str] = mapped_column(String(40))
    task_key: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(160))
    requirement_type: Mapped[str] = mapped_column(String(16))
    event_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    target_count: Mapped[int | None] = mapped_column(nullable=True)


class RankTaskMetricReceipt(Base):
    __tablename__ = "rank_task_metric_receipts"
    __table_args__ = (
        UniqueConstraint("user_id", "event_key", "source_event_id", name="uq_rank_metric_receipt"),
        Index("ix_rank_metric_user_event", "user_id", "event_key"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    event_key: Mapped[str] = mapped_column(String(80))
    source_event_id: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class RankTaskRequest(Base):
    __tablename__ = "rank_task_requests"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','approved','rejected')", name="ck_rank_task_request_status"
        ),
        UniqueConstraint("user_id", "idempotency_key", name="uq_rank_task_request_idempotency"),
        Index("ix_rank_task_request_status", "status", "created_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    policy_id: Mapped[str] = mapped_column(ForeignKey("rank_policies.id", ondelete="RESTRICT"))
    tier_key: Mapped[str] = mapped_column(String(64))
    task_key: Mapped[str] = mapped_column(String(64))
    evidence: Mapped[str] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(16), default="pending")
    idempotency_key: Mapped[str] = mapped_column(String(160))
    reviewer_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    reviewer_reason: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class StaffEvent(Base):
    __tablename__ = "staff_events"
    __table_args__ = (
        CheckConstraint("status IN ('funded','paid','cancelled')", name="ck_staff_event_status"),
        CheckConstraint(
            "award_mode IN ('winner_takes_all','equal_split')", name="ck_staff_event_award_mode"
        ),
        CheckConstraint("prize_budget_coin > 0", name="ck_staff_event_budget"),
        CheckConstraint("ends_at > starts_at", name="ck_staff_event_window"),
        UniqueConstraint("organizer_id", "idempotency_key", name="uq_staff_event_idempotency"),
        Index("ix_staff_events_course_status", "course_id", "status"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id", ondelete="RESTRICT"))
    organizer_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(String(1000), default="")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    timezone: Mapped[str] = mapped_column(String(64))
    prize_budget_coin: Mapped[int] = mapped_column()
    award_mode: Mapped[str] = mapped_column(String(24))
    status: Mapped[str] = mapped_column(String(16), default="funded")
    idempotency_key: Mapped[str] = mapped_column(String(160))
    approval_key: Mapped[str | None] = mapped_column(String(160), nullable=True)
    results_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    approved_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class StaffEventAward(Base):
    __tablename__ = "staff_event_awards"
    __table_args__ = (
        CheckConstraint("placement > 0 AND coin_awarded >= 0", name="ck_staff_event_award_values"),
        UniqueConstraint("event_id", "user_id", name="uq_staff_event_award_participant"),
        Index("ix_staff_event_awards_event_placement", "event_id", "placement"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    event_id: Mapped[str] = mapped_column(ForeignKey("staff_events.id", ondelete="RESTRICT"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    placement: Mapped[int] = mapped_column()
    coin_awarded: Mapped[int] = mapped_column()
    approved_by_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Clan(Base):
    __tablename__ = "clans"
    __table_args__ = (
        CheckConstraint(
            "member_cap > 0 AND clan_exp >= 0 AND level > 0", name="ck_clan_projection"
        ),
        CheckConstraint("status IN ('active','closed')", name="ck_clan_status"),
        Index("ix_clans_leaderboard", "status", "clan_exp", "created_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(40))
    name_key: Mapped[str] = mapped_column(String(80), unique=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    level: Mapped[int] = mapped_column(default=1)
    clan_exp: Mapped[int] = mapped_column(default=0)
    member_cap: Mapped[int] = mapped_column(default=20)
    icon: Mapped[str] = mapped_column(String(80), default="fa-shield")
    color: Mapped[str] = mapped_column(String(24), default="#176b87", server_default="#176b87")
    status: Mapped[str] = mapped_column(String(16), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ClanMembership(Base):
    __tablename__ = "clan_memberships"
    __table_args__ = (
        CheckConstraint(
            "status IN ('invited','requested','active','rejected','left')",
            name="ck_clan_membership_status",
        ),
        UniqueConstraint("clan_id", "user_id", name="uq_clan_membership_user"),
        Index("ix_clan_membership_user_status", "user_id", "status"),
        Index(
            "uq_clan_one_active_membership",
            "user_id",
            unique=True,
            sqlite_where=text("status = 'active'"),
            postgresql_where=text("status = 'active'"),
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clan_id: Mapped[str] = mapped_column(ForeignKey("clans.id", ondelete="RESTRICT"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(String(16))
    role_key: Mapped[str] = mapped_column(String(64), default="member")
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ClanRole(Base):
    __tablename__ = "clan_roles"
    __table_args__ = (UniqueConstraint("clan_id", "role_key", name="uq_clan_role_key"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clan_id: Mapped[str] = mapped_column(ForeignKey("clans.id", ondelete="RESTRICT"))
    role_key: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(80))
    permissions: Mapped[list[str]] = mapped_column(JSON, default=list)


class ClanExpLedger(Base):
    __tablename__ = "clan_exp_ledger"
    __table_args__ = (
        CheckConstraint("delta <> 0", name="ck_clan_exp_delta"),
        Index("ix_clan_exp_ledger_clan_time", "clan_id", "created_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clan_id: Mapped[str] = mapped_column(ForeignKey("clans.id", ondelete="RESTRICT"))
    delta: Mapped[int] = mapped_column()
    source: Mapped[str] = mapped_column(String(80))
    idempotency_key: Mapped[str] = mapped_column(String(160), unique=True)
    reason: Mapped[str] = mapped_column(String(500), default="", server_default=text("''"))
    actor_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ClanPolicy(Base):
    __tablename__ = "clan_policies"
    __table_args__ = (
        CheckConstraint("status IN ('draft','active','retired')", name="ck_clan_policy_status"),
        UniqueConstraint("version", name="uq_clan_policy_version"),
        Index("ix_clan_policy_status", "status"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    version: Mapped[int] = mapped_column()
    status: Mapped[str] = mapped_column(String(16), default="draft")
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ClanLevelRule(Base):
    __tablename__ = "clan_level_rules"
    __table_args__ = (
        CheckConstraint(
            "level > 0 AND threshold_exp >= 0 AND member_cap > 0", name="ck_clan_level_rule_values"
        ),
        UniqueConstraint("policy_id", "level", name="uq_clan_level_rule_level"),
        UniqueConstraint("policy_id", "threshold_exp", name="uq_clan_level_rule_threshold"),
        Index("ix_clan_level_rule_policy_threshold", "policy_id", "threshold_exp"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    policy_id: Mapped[str] = mapped_column(ForeignKey("clan_policies.id", ondelete="RESTRICT"))
    level: Mapped[int] = mapped_column()
    threshold_exp: Mapped[int] = mapped_column()
    member_cap: Mapped[int] = mapped_column()
    icon: Mapped[str] = mapped_column(String(80), default="fa-shield")
    color: Mapped[str] = mapped_column(String(24), default="#176b87")


class ClanWar(Base):
    __tablename__ = "clan_wars"
    __table_args__ = (
        CheckConstraint(
            "status IN ('scheduled','completed','cancelled')", name="ck_clan_war_status"
        ),
        CheckConstraint("clan_a_id <> clan_b_id", name="ck_clan_war_distinct_clans"),
        CheckConstraint("exp_reward >= 0", name="ck_clan_war_reward"),
        CheckConstraint("competition_type IN ('war','code','writing')", name="ck_clan_war_type"),
        CheckConstraint(
            "reward_exp >= 0 AND reward_coin >= 0", name="ck_clan_war_participant_rewards"
        ),
        CheckConstraint("reward_item_quantity BETWEEN 0 AND 10", name="ck_clan_war_item_quantity"),
        Index("ix_clan_wars_status_start", "status", "starts_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(160))
    clan_a_id: Mapped[str] = mapped_column(ForeignKey("clans.id", ondelete="RESTRICT"))
    clan_b_id: Mapped[str] = mapped_column(ForeignKey("clans.id", ondelete="RESTRICT"))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    competition_type: Mapped[str] = mapped_column(String(16), default="war", server_default="war")
    status: Mapped[str] = mapped_column(String(16), default="scheduled")
    winner_clan_id: Mapped[str | None] = mapped_column(
        ForeignKey("clans.id", ondelete="RESTRICT"), nullable=True
    )
    outcome: Mapped[str | None] = mapped_column(String(16), nullable=True)
    exp_reward: Mapped[int] = mapped_column(default=0)
    reward_exp: Mapped[int] = mapped_column(default=0, server_default="0")
    reward_coin: Mapped[int] = mapped_column(default=0, server_default="0")
    reward_item_id: Mapped[str | None] = mapped_column(
        ForeignKey("shop_items.id", ondelete="RESTRICT"), nullable=True
    )
    reward_item_quantity: Mapped[int] = mapped_column(default=0, server_default="0")
    created_by_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    finalized_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ClanCompetitionAward(Base):
    __tablename__ = "clan_competition_awards"
    __table_args__ = (
        UniqueConstraint("war_id", "user_id", name="uq_clan_competition_award_participant"),
        CheckConstraint(
            "reward_exp >= 0 AND reward_coin >= 0 AND item_quantity >= 0",
            name="ck_clan_competition_award_amounts",
        ),
        Index("ix_clan_competition_awards_war", "war_id", "clan_id"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    war_id: Mapped[str] = mapped_column(ForeignKey("clan_wars.id", ondelete="RESTRICT"))
    clan_id: Mapped[str] = mapped_column(ForeignKey("clans.id", ondelete="RESTRICT"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    reward_exp: Mapped[int] = mapped_column(default=0)
    reward_coin: Mapped[int] = mapped_column(default=0)
    item_quantity: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ClanMissionDefinition(Base):
    __tablename__ = "clan_mission_definitions"
    __table_args__ = (
        CheckConstraint("status IN ('draft','active','retired')", name="ck_clan_mission_status"),
        CheckConstraint(
            "target_count > 0 AND reward_clan_exp >= 0 AND reward_exp >= 0 AND reward_coin >= 0",
            name="ck_clan_mission_values",
        ),
        UniqueConstraint("mission_id", "version", name="uq_clan_mission_version"),
        Index("ix_clan_mission_event_status", "event_key", "status"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    mission_id: Mapped[str] = mapped_column(String(64))
    version: Mapped[int] = mapped_column()
    title: Mapped[str] = mapped_column(String(160))
    event_key: Mapped[str] = mapped_column(String(80))
    target_count: Mapped[int] = mapped_column()
    cadence: Mapped[str] = mapped_column(String(16), default="weekly")
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Bangkok")
    reward_clan_exp: Mapped[int] = mapped_column(default=0)
    reward_exp: Mapped[int] = mapped_column(default=0)
    reward_coin: Mapped[int] = mapped_column(default=0)
    status: Mapped[str] = mapped_column(String(16), default="draft")
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ClanMissionProgress(Base):
    __tablename__ = "clan_mission_progress"
    __table_args__ = (
        UniqueConstraint(
            "clan_id",
            "mission_id",
            "mission_version",
            "cycle_key",
            name="uq_clan_mission_progress_cycle",
        ),
        CheckConstraint("progress >= 0", name="ck_clan_mission_progress_nonnegative"),
        CheckConstraint("status IN ('active','complete')", name="ck_clan_mission_progress_status"),
        Index("ix_clan_mission_progress_clan_cycle", "clan_id", "cycle_key"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clan_id: Mapped[str] = mapped_column(ForeignKey("clans.id", ondelete="RESTRICT"))
    mission_id: Mapped[str] = mapped_column(String(64))
    mission_version: Mapped[int] = mapped_column()
    cycle_key: Mapped[str] = mapped_column(String(32))
    progress: Mapped[int] = mapped_column(default=0)
    status: Mapped[str] = mapped_column(String(16), default="active")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ClanMissionReceipt(Base):
    __tablename__ = "clan_mission_receipts"
    __table_args__ = (
        UniqueConstraint(
            "clan_id",
            "mission_id",
            "mission_version",
            "source_event_id",
            name="uq_clan_mission_source_event",
        ),
        Index("ix_clan_mission_receipts_progress", "clan_id", "mission_id", "cycle_key"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clan_id: Mapped[str] = mapped_column(ForeignKey("clans.id", ondelete="RESTRICT"))
    mission_id: Mapped[str] = mapped_column(String(64))
    mission_version: Mapped[int] = mapped_column()
    cycle_key: Mapped[str] = mapped_column(String(32))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    source_event_id: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ClanWarProposal(Base):
    __tablename__ = "clan_war_proposals"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','approved','rejected')", name="ck_clan_war_proposal_status"
        ),
        CheckConstraint("clan_a_id <> clan_b_id", name="ck_clan_war_proposal_distinct_clans"),
        CheckConstraint(
            "competition_type IN ('war','code','writing')", name="ck_clan_war_proposal_type"
        ),
        Index("ix_clan_war_proposals_status_created", "status", "created_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id", ondelete="RESTRICT"))
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(String(1000), default="", server_default="")
    clan_a_id: Mapped[str] = mapped_column(ForeignKey("clans.id", ondelete="RESTRICT"))
    clan_b_id: Mapped[str] = mapped_column(ForeignKey("clans.id", ondelete="RESTRICT"))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    competition_type: Mapped[str] = mapped_column(String(16), default="war", server_default="war")
    status: Mapped[str] = mapped_column(String(16), default="pending")
    reviewed_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    war_id: Mapped[str | None] = mapped_column(
        ForeignKey("clan_wars.id", ondelete="RESTRICT"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MissionDefinition(Base):
    __tablename__ = "mission_definitions"
    __table_args__ = (
        CheckConstraint("cadence IN ('daily','weekly','once')", name="ck_mission_cadence"),
        CheckConstraint("status IN ('active','retired')", name="ck_mission_status"),
        CheckConstraint("target_count > 0", name="ck_mission_target"),
        CheckConstraint("reward_exp >= 0 AND reward_coin >= 0", name="ck_mission_reward"),
        CheckConstraint(
            "ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at", name="ck_mission_window"
        ),
        UniqueConstraint("mission_id", "version", name="uq_mission_definition_version"),
        Index("ix_mission_definitions_event_status", "event_key", "status"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    mission_id: Mapped[str] = mapped_column(String(64))
    version: Mapped[int] = mapped_column()
    title: Mapped[str] = mapped_column(String(160))
    event_key: Mapped[str] = mapped_column(String(80))
    target_count: Mapped[int] = mapped_column()
    cadence: Mapped[str] = mapped_column(String(16))
    timezone: Mapped[str] = mapped_column(String(64))
    eligible_roles: Mapped[list[str]] = mapped_column(JSON, default=list)
    reward_exp: Mapped[int] = mapped_column(default=0)
    reward_coin: Mapped[int] = mapped_column(default=0)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active")
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class MissionProgress(Base):
    __tablename__ = "mission_progress"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "mission_id",
            "mission_version",
            "cycle_key",
            name="uq_mission_progress_cycle",
        ),
        CheckConstraint("progress >= 0", name="ck_mission_progress_nonnegative"),
        CheckConstraint(
            "status IN ('active','complete','claimed')", name="ck_mission_progress_status"
        ),
        Index("ix_mission_progress_user_cycle", "user_id", "cycle_key"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    mission_id: Mapped[str] = mapped_column(String(64))
    mission_version: Mapped[int] = mapped_column()
    cycle_key: Mapped[str] = mapped_column(String(80))
    progress: Mapped[int] = mapped_column(default=0)
    status: Mapped[str] = mapped_column(String(16), default="active")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MissionEventReceipt(Base):
    __tablename__ = "mission_event_receipts"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "mission_id",
            "mission_version",
            "source_event_id",
            name="uq_mission_event_receipt",
        ),
        Index("ix_mission_event_receipts_cycle", "mission_id", "cycle_key"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    mission_id: Mapped[str] = mapped_column(String(64))
    mission_version: Mapped[int] = mapped_column()
    cycle_key: Mapped[str] = mapped_column(String(80))
    source_event_id: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class RewardEvent(Base):
    __tablename__ = "reward_events"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_reward_event_idempotency"),
        Index("ix_reward_events_user_created", "user_id", "created_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    mission_id: Mapped[str] = mapped_column(String(64))
    mission_version: Mapped[int] = mapped_column()
    cycle_key: Mapped[str] = mapped_column(String(80))
    source_event_id: Mapped[str] = mapped_column(String(64))
    idempotency_key: Mapped[str] = mapped_column(String(160))
    exp_awarded: Mapped[int] = mapped_column(default=0)
    coin_awarded: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Achievement(Base):
    __tablename__ = "achievements"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    current_version: Mapped[int] = mapped_column(default=1)
    status: Mapped[str] = mapped_column(String(16), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AchievementVersion(Base):
    __tablename__ = "achievement_versions"
    __table_args__ = (
        UniqueConstraint("achievement_id", "version", name="uq_achievement_version"),
        CheckConstraint("status IN ('active','retired')", name="ck_achievement_version_status"),
        Index("ix_achievement_versions_event_status", "event_key", "status"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    achievement_id: Mapped[str] = mapped_column(ForeignKey("achievements.id", ondelete="RESTRICT"))
    version: Mapped[int] = mapped_column()
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(String(1000), default="")
    event_key: Mapped[str] = mapped_column(String(80))
    eligible_roles: Mapped[list[str]] = mapped_column(JSON, default=list)
    tiers: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(16), default="active")
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class UserAchievement(Base):
    __tablename__ = "user_achievements"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "achievement_id", "version", name="uq_user_achievement_version"
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    achievement_id: Mapped[str] = mapped_column(ForeignKey("achievements.id", ondelete="RESTRICT"))
    version: Mapped[int] = mapped_column()
    progress: Mapped[int] = mapped_column(default=0)
    unlocked_tiers: Mapped[list[str]] = mapped_column(JSON, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AchievementEventReceipt(Base):
    __tablename__ = "achievement_event_receipts"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "achievement_id",
            "version",
            "source_event_id",
            name="uq_achievement_event_receipt",
        ),
        Index("ix_achievement_event_receipts_source", "achievement_id", "version"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    achievement_id: Mapped[str] = mapped_column(ForeignKey("achievements.id", ondelete="RESTRICT"))
    version: Mapped[int] = mapped_column()
    source_event_id: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class UserEquippedTitle(Base):
    __tablename__ = "user_equipped_titles"
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True
    )
    achievement_id: Mapped[str] = mapped_column(ForeignKey("achievements.id", ondelete="RESTRICT"))
    version: Mapped[int] = mapped_column()
    tier_key: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(80))
    equipped_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AttendanceWindow(Base):
    __tablename__ = "attendance_windows"
    __table_args__ = (
        CheckConstraint("status IN ('open','closed')", name="ck_attendance_window_status"),
        CheckConstraint("closes_at > opens_at", name="ck_attendance_window_time"),
        Index("ix_attendance_windows_course_time", "course_id", "opens_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id", ondelete="RESTRICT"))
    title: Mapped[str] = mapped_column(String(160))
    opens_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    closes_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    late_grace_minutes: Mapped[int] = mapped_column(default=0)
    token_digest: Mapped[str | None] = mapped_column(String(64), nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), default="open")
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    __table_args__ = (
        UniqueConstraint("window_id", "user_id", name="uq_attendance_record_window_user"),
        CheckConstraint(
            "status IN ('present','late','absent','excused')", name="ck_attendance_record_status"
        ),
        Index("ix_attendance_records_course_user", "course_id", "user_id"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    window_id: Mapped[str] = mapped_column(ForeignKey("attendance_windows.id", ondelete="RESTRICT"))
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id", ondelete="RESTRICT"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(String(20))
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revision: Mapped[int] = mapped_column(default=1)
    __mapper_args__ = {"version_id_col": revision}  # noqa: RUF012


class AttendanceHistory(Base):
    __tablename__ = "attendance_history"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    record_id: Mapped[str] = mapped_column(
        ForeignKey("attendance_records.id", ondelete="RESTRICT"), index=True
    )
    revision: Mapped[int] = mapped_column()
    status: Mapped[str] = mapped_column(String(20))
    reason: Mapped[str] = mapped_column(String(1000), default="")
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AttendanceExcusal(Base):
    __tablename__ = "attendance_excusal_requests"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','approved','denied')", name="ck_attendance_excusal_status"
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    record_id: Mapped[str | None] = mapped_column(
        ForeignKey("attendance_records.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    window_id: Mapped[str] = mapped_column(
        ForeignKey("attendance_windows.id", ondelete="RESTRICT"), index=True
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    reason: Mapped[str] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    decision_reason: Mapped[str] = mapped_column(String(1000), default="")
    decided_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CoursePermission(Base):
    __tablename__ = "course_permission_grants"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id: Mapped[str] = mapped_column(
        ForeignKey("courses.id", ondelete="RESTRICT"), index=True
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    key: Mapped[str] = mapped_column(String(80))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class RuleTemplate(Base):
    __tablename__ = "course_rule_templates"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    version: Mapped[int] = mapped_column(unique=True)
    rules: Mapped[list[dict[str, object]]] = mapped_column(JSON)
    active: Mapped[bool] = mapped_column(default=False)


class TaxonomyCatalog(Base):
    __tablename__ = "taxonomy_catalog"
    id: Mapped[str] = mapped_column(String(20), primary_key=True, default="main")
    version: Mapped[int] = mapped_column(default=1)


class TaxonomyCategory(Base):
    __tablename__ = "taxonomy_categories"
    __table_args__ = (
        CheckConstraint("scope IN ('content','question')", name="ck_taxonomy_category_scope"),
        CheckConstraint("status IN ('active','retired')", name="ck_taxonomy_category_status"),
        ForeignKeyConstraint(
            ["scope", "parent_id"],
            ["taxonomy_categories.scope", "taxonomy_categories.id"],
            ondelete="RESTRICT",
        ),
        Index("ix_taxonomy_categories_scope_parent", "scope", "parent_id"),
    )
    scope: Mapped[str] = mapped_column(String(20), primary_key=True)
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    names: Mapped[dict[str, str]] = mapped_column(JSON)
    parent_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")
    sort_order: Mapped[int] = mapped_column(default=0)


class TaxonomyTag(Base):
    __tablename__ = "taxonomy_tags"
    __table_args__ = (
        CheckConstraint("scope IN ('content','question')", name="ck_taxonomy_tag_scope"),
        CheckConstraint("status IN ('active','retired')", name="ck_taxonomy_tag_status"),
        ForeignKeyConstraint(
            ["scope", "parent_id"],
            ["taxonomy_tags.scope", "taxonomy_tags.id"],
            ondelete="RESTRICT",
        ),
        Index("ix_taxonomy_tags_scope_parent", "scope", "parent_id"),
    )
    scope: Mapped[str] = mapped_column(String(20), primary_key=True)
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    names: Mapped[dict[str, str]] = mapped_column(JSON)
    parent_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")
    sort_order: Mapped[int] = mapped_column(default=0)
    selectable: Mapped[bool] = mapped_column(default=True)
    applicability: Mapped[list[str]] = mapped_column(JSON, default=list)


class TaxonomyRedirect(Base):
    __tablename__ = "taxonomy_redirects"
    __table_args__ = (
        CheckConstraint("scope IN ('content','question')", name="ck_taxonomy_redirect_scope"),
        CheckConstraint("node_kind IN ('category','tag')", name="ck_taxonomy_redirect_kind"),
        CheckConstraint("source_id <> target_id", name="ck_taxonomy_redirect_distinct"),
    )
    scope: Mapped[str] = mapped_column(String(20), primary_key=True)
    node_kind: Mapped[str] = mapped_column(String(20), primary_key=True)
    source_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    target_id: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))


class Question(Base):
    __tablename__ = "questions"
    __table_args__ = (
        CheckConstraint("latest_version >= 1", name="ck_question_latest_version"),
        CheckConstraint("status IN ('active','retired')", name="ck_question_status"),
        Index("ix_questions_course_created", "course_id", "created_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id: Mapped[str] = mapped_column(
        ForeignKey("courses.id", ondelete="RESTRICT"), index=True
    )
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    latest_version: Mapped[int] = mapped_column(default=1)
    status: Mapped[str] = mapped_column(String(20), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class QuestionVersion(Base):
    __tablename__ = "question_versions"
    __table_args__ = (
        CheckConstraint(
            "question_type IN ('code','writing','sentenceRewriting','multipleChoice',"
            "'multipleSelect','shortAnswer','fillInTheBlank','matching','ordering',"
            "'trueFalseNotGiven','readingSet','listeningSet')",
            name="ck_question_version_type",
        ),
        CheckConstraint(
            "difficulty IN ('newbie','noob','wannabe','gatekeeper','legendary')",
            name="ck_question_version_difficulty",
        ),
        CheckConstraint(
            "status IN ('draft','validated','published','archived')",
            name="ck_question_version_status",
        ),
        CheckConstraint("version >= 1", name="ck_question_version_number"),
        ForeignKeyConstraint(
            ["category_scope", "category_id"],
            ["taxonomy_categories.scope", "taxonomy_categories.id"],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("question_id", "version", name="uq_question_version_number"),
        Index("ix_question_versions_question_status", "question_id", "status", "version"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    question_id: Mapped[str] = mapped_column(
        ForeignKey("questions.id", ondelete="RESTRICT"), index=True
    )
    version: Mapped[int] = mapped_column()
    question_type: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(240))
    prompt: Mapped[str] = mapped_column(String(20000))
    category_scope: Mapped[str] = mapped_column(String(20), default="question")
    category_id: Mapped[str] = mapped_column(String(128))
    difficulty: Mapped[str] = mapped_column(String(20))
    language: Mapped[str] = mapped_column(String(20), default="en")
    usage_types: Mapped[list[str]] = mapped_column(JSON)
    content: Mapped[dict[str, object]] = mapped_column(JSON)
    authoring_config: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    validation: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class QuestionVersionTag(Base):
    __tablename__ = "question_version_tags"
    __table_args__ = (
        ForeignKeyConstraint(
            ["tag_scope", "tag_id"],
            ["taxonomy_tags.scope", "taxonomy_tags.id"],
            ondelete="RESTRICT",
        ),
    )
    question_version_id: Mapped[str] = mapped_column(
        ForeignKey("question_versions.id", ondelete="RESTRICT"), primary_key=True
    )
    tag_scope: Mapped[str] = mapped_column(String(20), primary_key=True, default="question")
    tag_id: Mapped[str] = mapped_column(String(128), primary_key=True)


class Assessment(Base):
    """Assignment/exam aggregate; versions carry immutable published snapshots."""

    __tablename__ = "assessments"
    __table_args__ = (
        CheckConstraint("kind IN ('assignment','exam')", name="ck_assessment_kind"),
        CheckConstraint("status IN ('draft','published','archived')", name="ck_assessment_status"),
        CheckConstraint("current_version >= 1", name="ck_assessment_version"),
        Index("ix_assessments_course_status", "course_id", "status"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id", ondelete="RESTRICT"))
    kind: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    current_version: Mapped[int] = mapped_column(default=1)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AssessmentVersion(Base):
    __tablename__ = "assessment_versions"
    __table_args__ = (
        UniqueConstraint("assessment_id", "version", name="uq_assessment_version"),
        CheckConstraint("version >= 1", name="ck_assessment_version_number"),
        CheckConstraint("attempt_limit BETWEEN 1 AND 20", name="ck_assessment_attempt_limit"),
        CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 1440",
            name="ck_assessment_duration",
        ),
        CheckConstraint(
            "status IN ('draft','published','superseded')", name="ck_assessment_version_status"
        ),
        Index("ix_assessment_versions_assessment_status", "assessment_id", "status"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assessment_id: Mapped[str] = mapped_column(ForeignKey("assessments.id", ondelete="RESTRICT"))
    version: Mapped[int] = mapped_column()
    title: Mapped[str] = mapped_column(String(240))
    instructions: Mapped[str] = mapped_column(String(10000), default="")
    timezone: Mapped[str] = mapped_column(String(64))
    opens_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_minutes: Mapped[int | None] = mapped_column(nullable=True)
    attempt_limit: Mapped[int] = mapped_column(default=1)
    late_penalty: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list)
    selection_criteria: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    question_items: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AssessmentRecipient(Base):
    __tablename__ = "assessment_recipients"
    __table_args__ = (
        UniqueConstraint("version_id", "user_id", name="uq_assessment_recipient_version_user"),
        CheckConstraint(
            "status IN ('pending','inProgress','submitted')", name="ck_assessment_recipient_status"
        ),
        Index("ix_assessment_recipients_assessment_user", "assessment_id", "user_id"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assessment_id: Mapped[str] = mapped_column(ForeignKey("assessments.id", ondelete="RESTRICT"))
    version_id: Mapped[str] = mapped_column(
        ForeignKey("assessment_versions.id", ondelete="RESTRICT")
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AssessmentAttempt(Base):
    __tablename__ = "assessment_attempts"
    __table_args__ = (
        UniqueConstraint("recipient_id", "attempt_number", name="uq_assessment_attempt_number"),
        CheckConstraint("attempt_number BETWEEN 1 AND 20", name="ck_assessment_attempt_number"),
        CheckConstraint(
            "status IN ('inProgress','submitted','forceSubmitted')",
            name="ck_assessment_attempt_status",
        ),
        CheckConstraint("revision >= 1", name="ck_assessment_attempt_revision"),
        Index("ix_assessment_attempts_recipient_status", "recipient_id", "status"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    recipient_id: Mapped[str] = mapped_column(
        ForeignKey("assessment_recipients.id", ondelete="RESTRICT")
    )
    attempt_number: Mapped[int] = mapped_column()
    status: Mapped[str] = mapped_column(String(20), default="inProgress")
    answers: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    automatic_scores: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revision: Mapped[int] = mapped_column(default=1)


class AssessmentGradeRevision(Base):
    __tablename__ = "assessment_grade_revisions"
    __table_args__ = (
        UniqueConstraint(
            "attempt_id", "question_version_id", "revision", name="uq_assessment_grade_revision"
        ),
        CheckConstraint("revision >= 1", name="ck_assessment_grade_revision"),
        CheckConstraint("points_awarded >= 0", name="ck_assessment_grade_points"),
        Index(
            "ix_assessment_grade_revisions_attempt_question",
            "attempt_id",
            "question_version_id",
            "revision",
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    attempt_id: Mapped[str] = mapped_column(
        ForeignKey("assessment_attempts.id", ondelete="RESTRICT")
    )
    question_version_id: Mapped[str] = mapped_column(
        ForeignKey("question_versions.id", ondelete="RESTRICT")
    )
    revision: Mapped[int] = mapped_column()
    points_awarded: Mapped[float] = mapped_column()
    criterion_scores: Mapped[dict[str, float]] = mapped_column(JSON, default=dict)
    feedback: Mapped[str] = mapped_column(String(5000), default="")
    grader_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AssessmentGradeRelease(Base):
    __tablename__ = "assessment_grade_releases"
    __table_args__ = (
        UniqueConstraint("attempt_id", "revision", name="uq_assessment_grade_release_revision"),
        CheckConstraint("revision >= 1", name="ck_assessment_grade_release_revision"),
        CheckConstraint("gross_score >= 0", name="ck_assessment_release_gross_score"),
        CheckConstraint("released_score >= 0", name="ck_assessment_release_score"),
        CheckConstraint("max_points > 0", name="ck_assessment_release_max_points"),
        CheckConstraint("penalty_percent BETWEEN 0 AND 100", name="ck_assessment_release_penalty"),
        Index("ix_assessment_grade_releases_attempt_revision", "attempt_id", "revision"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    attempt_id: Mapped[str] = mapped_column(
        ForeignKey("assessment_attempts.id", ondelete="RESTRICT")
    )
    revision: Mapped[int] = mapped_column()
    gross_score: Mapped[float] = mapped_column()
    penalty_percent: Mapped[float] = mapped_column(default=0)
    released_score: Mapped[float] = mapped_column()
    max_points: Mapped[float] = mapped_column()
    breakdown: Mapped[list[dict[str, object]]] = mapped_column(JSON)
    released_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    released_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


@event.listens_for(AssessmentGradeRevision, "before_update")
@event.listens_for(AssessmentGradeRevision, "before_delete")
@event.listens_for(AssessmentGradeRelease, "before_update")
@event.listens_for(AssessmentGradeRelease, "before_delete")
def immutable_assessment_grade(*_args: object) -> None:
    raise ValueError("Assessment grade records are immutable.")


class PracticeAttempt(Base):
    __tablename__ = "practice_attempts"
    __table_args__ = (
        CheckConstraint("score >= 0", name="ck_practice_attempt_score"),
        CheckConstraint("max_points > 0", name="ck_practice_attempt_max_points"),
        CheckConstraint("score <= max_points", name="ck_practice_attempt_score_max"),
        Index("ix_practice_attempts_user_created", "user_id", "created_at"),
        Index("ix_practice_attempts_course_question", "course_id", "question_version_id"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id", ondelete="RESTRICT"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    question_version_id: Mapped[str] = mapped_column(
        ForeignKey("question_versions.id", ondelete="RESTRICT")
    )
    answer: Mapped[object] = mapped_column(JSON)
    score: Mapped[float] = mapped_column()
    max_points: Mapped[float] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


@event.listens_for(PracticeAttempt, "before_update")
@event.listens_for(PracticeAttempt, "before_delete")
def immutable_practice_attempt(*_args: object) -> None:
    raise ValueError("Practice attempts are immutable.")


class RuntimeProfileVersion(Base):
    __tablename__ = "runtime_profile_versions"
    __table_args__ = (
        CheckConstraint("version >= 1", name="ck_runtime_profile_version"),
        CheckConstraint(
            "status IN ('draft','test','active','deprecated')", name="ck_runtime_profile_status"
        ),
        UniqueConstraint("profile_id", "version", name="uq_runtime_profile_version"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    profile_id: Mapped[str] = mapped_column(String(128))
    version: Mapped[int] = mapped_column()
    profile: Mapped[dict[str, object]] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class QuestionAsset(Base):
    __tablename__ = "question_assets"
    __table_args__ = (
        CheckConstraint(
            "asset_kind IN ('image','audio','referenceSolution','supportFile','transcript')",
            name="ck_question_asset_kind",
        ),
        CheckConstraint("length(content) BETWEEN 1 AND 2000000", name="ck_question_asset_size"),
        Index("ix_question_assets_course_id", "course_id"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id", ondelete="RESTRICT"))
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    asset_kind: Mapped[str] = mapped_column(String(30))
    media_type: Mapped[str] = mapped_column(String(100))
    content: Mapped[bytes] = mapped_column(LargeBinary)
    size: Mapped[int] = mapped_column()
    digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


@event.listens_for(QuestionAsset, "before_update")
@event.listens_for(QuestionAsset, "before_delete")
def immutable_question_asset(*_args: object) -> None:
    raise ValueError("Question assets are immutable.")


@event.listens_for(QuestionVersion, "before_update")
def guard_question_version_update(
    _mapper: object, _connection: object, target: QuestionVersion
) -> None:
    immutable = (
        "question_id",
        "version",
        "question_type",
        "title",
        "prompt",
        "category_scope",
        "category_id",
        "difficulty",
        "language",
        "usage_types",
        "content",
        "authoring_config",
        "created_by",
        "created_at",
    )
    state = sa_inspect(target)
    if any(state.attrs[name].history.has_changes() for name in immutable):
        raise ValueError("Question version content is immutable; create a new version.")
    status_history = state.attrs.status.history
    if status_history.has_changes():
        old_status = status_history.deleted[0] if status_history.deleted else target.status
        if (old_status, target.status) not in {("draft", "validated"), ("validated", "published")}:
            raise ValueError("Question version status cannot move backwards or skip validation.")


@event.listens_for(QuestionVersion, "before_delete")
def immutable_question_version_delete(*_args: object) -> None:
    raise ValueError("Question versions are immutable and cannot be deleted.")


@event.listens_for(RuntimeProfileVersion, "before_update")
@event.listens_for(RuntimeProfileVersion, "before_delete")
def immutable_runtime_profile(*_args: object) -> None:
    raise ValueError("Runtime profile versions are immutable.")


class GradeSchemeVersion(Base):
    __tablename__ = "grade_scheme_versions"
    __table_args__ = (
        UniqueConstraint("course_id", "version", name="uq_course_grade_scheme_version"),
        Index(
            "uq_grade_scheme_active_per_course",
            "course_id",
            unique=True,
            postgresql_where=text("active = true"),
            sqlite_where=text("active = 1"),
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id: Mapped[str] = mapped_column(
        ForeignKey("courses.id", ondelete="RESTRICT"), index=True
    )
    version: Mapped[int] = mapped_column()
    components: Mapped[list[dict[str, object]]] = mapped_column(JSON)
    bands: Mapped[list[dict[str, object]]] = mapped_column(JSON)
    active: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class CourseResource(Base):
    __tablename__ = "course_resources"
    __table_args__ = (
        CheckConstraint("position BETWEEN 0 AND 199", name="ck_course_resource_position"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id: Mapped[str] = mapped_column(
        ForeignKey("courses.id", ondelete="RESTRICT"), index=True
    )
    kind: Mapped[str] = mapped_column(String(30))
    title: Mapped[str] = mapped_column(String(240))
    note: Mapped[str] = mapped_column(String(2000), default="")
    coverage: Mapped[str] = mapped_column(String(1000), default="")
    url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    position: Mapped[int] = mapped_column(default=0)


class CourseRulePublication(Base):
    __tablename__ = "course_rule_publications"
    __table_args__ = (
        UniqueConstraint("course_id", "version", name="uq_course_rule_publication_version"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id: Mapped[str] = mapped_column(
        ForeignKey("courses.id", ondelete="RESTRICT"), index=True
    )
    version: Mapped[int] = mapped_column()
    template_version: Mapped[int] = mapped_column()
    rules: Mapped[list[dict[str, object]]] = mapped_column(JSON)
    published_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


@event.listens_for(CourseRulePublication, "before_update")
@event.listens_for(CourseRulePublication, "before_delete")
def immutable_course_rule_publication(*_args: object) -> None:
    raise ValueError("Course Rule publications are immutable.")


class TeachingSession(Base):
    __tablename__ = "teaching_sessions"
    __table_args__ = (
        CheckConstraint("status IN ('scheduled','cancelled')", name="ck_teaching_session_status"),
        CheckConstraint(
            "(recurrence_series_id IS NULL AND recurrence_index IS NULL) OR "
            "(recurrence_series_id IS NOT NULL AND recurrence_index BETWEEN 0 AND 51)",
            name="ck_teaching_session_recurrence",
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id: Mapped[str] = mapped_column(
        ForeignKey("courses.id", ondelete="RESTRICT"), index=True
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    timezone: Mapped[str] = mapped_column(String(64))
    section_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    room: Mapped[str | None] = mapped_column(String(240), nullable=True)
    online_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    plan_entry_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    recurrence_series_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    recurrence_index: Mapped[int | None] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="scheduled")
    exception_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)


@event.listens_for(AuditEvent, "before_update")
@event.listens_for(AuditEvent, "before_delete")
def immutable_audit(*_args: object) -> None:
    raise ValueError("Audit records are append-only.")
