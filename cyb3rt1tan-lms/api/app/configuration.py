"""Credential-safe database configuration and explicit local/test/production boundaries."""

from collections.abc import Mapping
from dataclasses import dataclass, field
from urllib.parse import urlsplit

from sqlalchemy import URL, make_url
from sqlalchemy.exc import ArgumentError


@dataclass(frozen=True)
class DatabaseSettings:
    url: URL = field(repr=False)
    environment: str
    pool_size: int = 5
    max_overflow: int = 5
    pool_timeout: int = 10
    statement_timeout_ms: int = 15000
    lock_timeout_ms: int = 5000


def database_settings(values: Mapping[str, str], target: str | None = None) -> DatabaseSettings:
    environment = values.get("APP_ENV", "local")
    if environment not in {"local", "test", "production"}:
        raise ValueError("APP_ENV must be local, test or production.")
    try:
        url = make_url(target or values.get("DATABASE_URL", ""))
    except (ArgumentError, ValueError, TypeError):
        raise ValueError("Invalid database configuration.") from None
    if url.drivername == "sqlite+pysqlite":
        if environment != "test" or url.database not in {":memory:", ""}:
            raise ValueError("SQLite is allowed only for isolated in-memory tests.")
    elif url.drivername != "postgresql+psycopg":
        raise ValueError("PostgreSQL with psycopg is required.")
    if environment == "production":
        if url.query.get("sslmode") != "verify-full" or not url.query.get("sslrootcert"):
            raise ValueError("Production PostgreSQL requires verify-full TLS and a CA file.")
        if not url.username or not url.password:
            raise ValueError("Production database credentials must be supplied at runtime.")
        origin = urlsplit(values.get("APP_ORIGIN", ""))
        if (
            origin.scheme != "https"
            or not origin.hostname
            or origin.username
            or origin.password
            or origin.query
            or origin.fragment
            or origin.path not in {"", "/"}
        ):
            raise ValueError("Production APP_ORIGIN must be an HTTPS origin.")
        if values.get("COOKIE_SECURE") != "true":
            raise ValueError("Production cookies must be Secure.")

    def bounded(name: str, default: int, low: int, high: int) -> int:
        try:
            result = int(values.get(name, str(default)))
        except ValueError:
            raise ValueError("Invalid bounded database option: " + name) from None
        if not low <= result <= high:
            raise ValueError("Database option out of range: " + name)
        return result

    return DatabaseSettings(
        url,
        environment,
        bounded("DB_POOL_SIZE", 5, 1, 20),
        bounded("DB_MAX_OVERFLOW", 5, 0, 20),
        bounded("DB_POOL_TIMEOUT", 10, 1, 60),
        bounded("DB_STATEMENT_TIMEOUT_MS", 15000, 1000, 120000),
        bounded("DB_LOCK_TIMEOUT_MS", 5000, 100, 30000),
    )
