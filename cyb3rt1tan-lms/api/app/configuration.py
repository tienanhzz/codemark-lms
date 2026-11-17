"""Credential-safe database configuration and explicit local/test/production boundaries."""

import base64
import binascii
import json
import re
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


@dataclass(frozen=True)
class MfaKeySettings:
    active_id: str | None
    keys: dict[str, bytes]
    legacy_key: bytes | None


def mfa_key_settings(values: Mapping[str, str]) -> MfaKeySettings:
    encoded_ring = values.get("MFA_ENCRYPTION_KEYS", "")
    ring: dict[str, bytes] = {}
    active_id = values.get("MFA_ACTIVE_KEY_ID", "")
    if encoded_ring:
        if len(encoded_ring) > 4096:
            raise ValueError("MFA_ENCRYPTION_KEYS configuration is too large.")
        try:
            parsed = json.loads(encoded_ring)
        except (json.JSONDecodeError, TypeError):
            raise ValueError("Invalid MFA_ENCRYPTION_KEYS configuration.") from None
        if not isinstance(parsed, dict) or not 1 <= len(parsed) <= 8:
            raise ValueError("MFA_ENCRYPTION_KEYS must contain between 1 and 8 keys.")
        for key_id, encoded_key in parsed.items():
            if (
                not isinstance(key_id, str)
                or re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", key_id) is None
                or not isinstance(encoded_key, str)
            ):
                raise ValueError("Invalid MFA_ENCRYPTION_KEYS configuration.")
            ring[key_id] = _decode_mfa_key(encoded_key)
        if active_id not in ring:
            raise ValueError("MFA_ACTIVE_KEY_ID must name a configured MFA key.")
    elif active_id:
        raise ValueError("MFA_ACTIVE_KEY_ID requires MFA_ENCRYPTION_KEYS.")

    encoded_legacy = values.get("MFA_ENCRYPTION_KEY", "")
    legacy_key = _decode_mfa_key(encoded_legacy) if encoded_legacy else None
    if not ring and legacy_key is None:
        raise ValueError("MFA encryption key is not configured.")
    if len(set(ring.values())) != len(ring):
        raise ValueError("MFA key identifiers must refer to distinct key material.")
    return MfaKeySettings(active_id or None, ring, legacy_key)


def _decode_mfa_key(encoded: str) -> bytes:
    try:
        key = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("MFA encryption keys must be base64 for a 32-byte key.") from None
    if len(key) != 32 or base64.b64encode(key).decode("ascii") != encoded:
        raise ValueError("MFA encryption keys must be base64 for a 32-byte key.")
    return key


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
        _validate_production_keys(values)

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


def _validate_production_keys(values: Mapping[str, str]) -> None:
    login_key = values.get("LOGIN_HMAC_KEY", "").encode("utf-8")
    if len(login_key) < 32:
        raise ValueError("Production LOGIN_HMAC_KEY must contain at least 32 bytes.")
    mfa_keys = mfa_key_settings(values)
    key_material = [*mfa_keys.keys.values()]
    if mfa_keys.legacy_key is not None:
        key_material.append(mfa_keys.legacy_key)
    if any(key == login_key for key in key_material):
        raise ValueError("Production LOGIN_HMAC_KEY and MFA_ENCRYPTION_KEY must differ.")
