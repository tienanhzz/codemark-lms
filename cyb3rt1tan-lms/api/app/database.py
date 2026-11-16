"""Environment configuration and bounded database sessions."""

import os
from collections.abc import Iterator
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from .configuration import database_settings

if not os.environ.get("DATABASE_URL") or not os.environ.get("LOGIN_HMAC_KEY"):
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL must be configured; run scripts/configure-local.ps1.")
settings = database_settings(os.environ)


def configured_engine() -> Engine:
    if settings.url.drivername.startswith("sqlite"):
        return create_engine(settings.url, pool_pre_ping=True, hide_parameters=True)
    return create_engine(
        settings.url,
        pool_pre_ping=True,
        hide_parameters=True,
        pool_size=settings.pool_size,
        max_overflow=settings.max_overflow,
        pool_timeout=settings.pool_timeout,
        pool_recycle=1800,
        connect_args={
            "connect_timeout": 5,
            "options": f"-c statement_timeout={settings.statement_timeout_ms} -c lock_timeout={settings.lock_timeout_ms}",
        },
    )


engine = configured_engine()
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def migration_engine() -> Engine:
    target = os.environ.get("MIGRATION_DATABASE_URL")
    if not target:
        if settings.environment == "production":
            raise ValueError("A distinct production migration identity is required.")
        return engine
    migration = database_settings(os.environ, target)
    if (migration.url.host, migration.url.port, migration.url.database) != (
        settings.url.host,
        settings.url.port,
        settings.url.database,
    ):
        raise ValueError("Migration must target the configured runtime database.")
    if settings.environment == "production" and migration.url.username == settings.url.username:
        raise ValueError("Migration identity must be distinct and target the same database.")
    return create_engine(migration.url, poolclass=NullPool, hide_parameters=True)


def database() -> Iterator[Session]:
    with SessionLocal() as session:
        try:
            if settings.environment == "production":
                verify_runtime_role(session)
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise


def verify_runtime_role(session: Session) -> None:
    elevated = session.execute(
        text("""SELECT
      rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls
      OR has_schema_privilege(current_user, current_schema(), 'CREATE')
      OR has_table_privilege(current_user, 'audit_events', 'UPDATE')
      OR has_table_privilege(current_user, 'audit_events', 'DELETE')
      OR has_table_privilege(current_user, 'audit_events', 'TRUNCATE')
      FROM pg_roles WHERE rolname=current_user""")
    ).scalar_one()
    if elevated:
        raise RuntimeError("Production runtime identity violates least-privilege requirements.")
