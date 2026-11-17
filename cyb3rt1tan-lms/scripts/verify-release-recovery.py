"""Read-only source backup, isolated PostgreSQL restore and MFA rotation drill.

Only fresh, randomly named recovery databases may be created or dropped. The
configured application/test database is never migrated, seeded or rewrapped.
Private encrypted artifacts and drill keys stay under the ignored .local tree.
This local drill does not approve production key custody or retention policy.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import secrets
import shutil
import subprocess
import sys
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from cryptography.exceptions import InvalidTag
from dotenv import load_dotenv
from release_evidence import begin_report, fail_report, write_report
from sqlalchemy import create_engine, inspect, make_url, text

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

from app.backup_archive import decrypt_backup, encrypt_backup


def private_directory(path: Path) -> None:
    path.mkdir(mode=0o700, parents=True, exist_ok=False)
    if os.name == "nt":
        identity = subprocess.check_output(["whoami"], text=True).strip()
        subprocess.run(
            [
                "icacls",
                str(path),
                "/inheritance:r",
                "/grant:r",
                f"{identity}:(OI)(CI)F",
                "*S-1-5-18:(OI)(CI)F",
                "*S-1-5-32-544:(OI)(CI)F",
            ],
            check=True,
            capture_output=True,
        )


def manifest(connection: Any) -> dict[str, dict[str, Any]]:
    result = {}
    for table in sorted(inspect(connection).get_table_names()):
        quoted = connection.dialect.identifier_preparer.quote(table)
        hashes = []
        for row in connection.execute(text(f"SELECT * FROM {quoted}")).mappings():
            encoded = json.dumps(dict(row), sort_keys=True, default=str, separators=(",", ":"))
            hashes.append(hashlib.sha256(encoded.encode()).hexdigest())
        result[table] = {
            "rows": len(hashes),
            "sha256": hashlib.sha256("".join(sorted(hashes)).encode()).hexdigest(),
        }
    return result


def pg_command(binary: Path, url: Any, arguments: list[str], data: bytes | None = None) -> bytes:
    result = subprocess.run(
        [
            str(binary),
            "--no-password",
            "-h",
            url.host,
            "-p",
            str(url.port or 5432),
            "-U",
            url.username,
            "-d",
            url.database,
            *arguments,
        ],
        env={**os.environ, "PGPASSWORD": url.password or "", "PGCONNECT_TIMEOUT": "5"},
        input=data,
        capture_output=True,
        timeout=300,
        check=False,
    )
    if result.returncode:
        # Native stderr can contain connection details. Keep it out of public evidence.
        raise RuntimeError(f"{binary.name} failed; no source database changes were made.")
    return result.stdout


def rotate_clone(url: Any, keys_dir: Path) -> dict[str, Any]:
    os.environ["DATABASE_URL"] = url.render_as_string(hide_password=False)
    os.environ["MIGRATION_DATABASE_URL"] = os.environ["DATABASE_URL"]
    os.environ["APP_ENV"] = "local"
    from alembic import command
    from alembic.config import Config

    from app.database import SessionLocal, engine
    from app.mfa import decrypt_secret, encrypt_secret
    from app.mfa_rewrap import inspect_mfa_methods, rewrap_mfa_methods
    from app.models import MfaMethod, User, now
    from app.outbox import record_audit
    from app.security import dummy_hash

    config = Config(str(ROOT / "api/alembic.ini"))
    config.set_main_option("script_location", str(ROOT / "api/migrations"))
    command.check(config)
    from fastapi import HTTPException
    from sqlalchemy import select

    old_environment = {
        name: os.environ.get(name)
        for name in ("MFA_ENCRYPTION_KEY", "MFA_ENCRYPTION_KEYS", "MFA_ACTIVE_KEY_ID")
    }
    ring = json.loads(os.environ.get("MFA_ENCRYPTION_KEYS", "{}"))
    if len(ring) > 6:
        raise ValueError("The drill needs two unused keyring slots.")
    drill_keys = {
        "drill_old": base64.b64encode(secrets.token_bytes(32)).decode(),
        "drill_new": base64.b64encode(secrets.token_bytes(32)).decode(),
    }
    (keys_dir / "rotation-drill.json").write_text(json.dumps(drill_keys), encoding="utf-8")
    try:
        # Exercise both legacy and v2 ciphertext, even when real MFA enrollment is empty.
        with SessionLocal.begin() as db:
            for version in ("legacy", "versioned"):
                user = User(
                    username="restore_" + uuid.uuid4().hex,
                    email=uuid.uuid4().hex + "@example.invalid",
                    official_name="Isolated recovery fixture",
                    roles=["student"],
                    password_hash=dummy_hash,
                    status="active",
                )
                db.add(user)
                db.flush()
                fixture_seed = secrets.token_hex(20)
                if version == "legacy":
                    os.environ.pop("MFA_ENCRYPTION_KEYS", None)
                    os.environ.pop("MFA_ACTIVE_KEY_ID", None)
                else:
                    os.environ["MFA_ENCRYPTION_KEYS"] = json.dumps({**ring, **drill_keys})
                    os.environ["MFA_ACTIVE_KEY_ID"] = "drill_old"
                db.add(
                    MfaMethod(
                        user_id=user.id,
                        encrypted_secret=encrypt_secret(user.id, fixture_seed),
                        confirmed=True,
                        pending_expires_at=now(),
                        last_step=-1,
                    )
                )
        os.environ["MFA_ENCRYPTION_KEYS"] = json.dumps({**ring, **drill_keys})
        os.environ["MFA_ACTIVE_KEY_ID"] = "drill_new"
        with SessionLocal() as db:
            before = {r.user_id: r.encrypted_secret for r in db.scalars(select(MfaMethod))}
            total, pending = inspect_mfa_methods(db, "drill_new")
            assert before == {r.user_id: r.encrypted_secret for r in db.scalars(select(MfaMethod))}
        with SessionLocal.begin() as db:
            changed = rewrap_mfa_methods(db, "drill_new")
            record_audit(
                db,
                str(uuid.uuid4()),
                "mfa_recovery_drill",
                None,
                {"updatedCount": changed},
            )
        with SessionLocal() as db:
            after = {r.user_id: r.encrypted_secret for r in db.scalars(select(MfaMethod))}
            assert total >= 2 and changed == pending
            assert all(value.startswith("v2.drill_new.") for value in after.values())
        with SessionLocal.begin() as db:
            assert rewrap_mfa_methods(db, "drill_new") == 0
        # Losing the new key must fail closed, rather than silently disabling MFA.
        os.environ["MFA_ENCRYPTION_KEYS"] = json.dumps(
            {**ring, "drill_old": drill_keys["drill_old"]}
        )
        os.environ["MFA_ACTIVE_KEY_ID"] = "drill_old"
        try:
            for user_id, value in after.items():
                decrypt_secret(user_id, value)
        except HTTPException:
            pass
        else:
            raise AssertionError("Missing active decryption key did not fail closed.")
        os.environ["MFA_ENCRYPTION_KEYS"] = json.dumps({**ring, **drill_keys})
        os.environ["MFA_ACTIVE_KEY_ID"] = "drill_new"
        for user_id, value in after.items():
            assert decrypt_secret(user_id, value) == decrypt_secret(user_id, before[user_id])
        return {
            "recordsVerified": total,
            "rewrapped": changed,
            "dryRunImmutable": True,
            "repeatApplyNoop": True,
            "missingKeyRejected": True,
            "keyRecoveryVerified": True,
        }
    finally:
        for name, original_value in old_environment.items():
            if original_value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = original_value
        engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", choices=("app", "test"), default="app")
    parser.add_argument("--pg-bin", type=Path)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    report = begin_report(ROOT, args.report, "isolated-local-release-drill")
    if not os.environ.get("DATABASE_URL"):
        load_dotenv(ROOT / ".env")
    if os.environ.get("APP_ENV", "local") not in {"local", "test"}:
        raise ValueError("This isolated drill must not run as a production process.")
    source = make_url(os.environ["DATABASE_URL" if args.source == "app" else "TEST_DATABASE_URL"])
    expected = "codemark_lms" if args.source == "app" else "codemark_lms_test"
    if source.database != expected or source.host not in {"127.0.0.1", "localhost"}:
        raise ValueError("Refusing an unexpected source database.")
    if os.environ.get("RELEASE_DRILL_ADMIN_URL"):
        admin_url = make_url(os.environ["RELEASE_DRILL_ADMIN_URL"])
    else:
        local = json.loads(
            (ROOT.parent / ".tools/postgresql-local/connection.json").read_text(
                encoding="utf-8-sig"
            )
        )
        admin_url = source.set(
            username="postgres", password=local["adminPassword"], database="postgres"
        )
    if (admin_url.host, admin_url.port) != (source.host, source.port):
        raise ValueError("Recovery admin must be on the same local PostgreSQL server.")
    admin_url = admin_url.set(database="postgres")
    pg_bin = args.pg_bin or (ROOT.parent / ".tools/postgresql-17/pgsql/bin")
    suffix = ".exe" if os.name == "nt" else ""
    dump_bin, restore_bin = [pg_bin / (name + suffix) for name in ("pg_dump", "pg_restore")]
    if not dump_bin.exists() or not restore_bin.exists():
        dump_path = shutil.which("pg_dump")
        restore_path = shutil.which("pg_restore")
        if not dump_path or not restore_path:
            raise ValueError("PostgreSQL backup utilities are required.")
        dump_bin, restore_bin = Path(dump_path), Path(restore_path)
    run_id = uuid.uuid4().hex
    private_root = ROOT / ".local/backups" / ("release-drill-" + run_id)
    private_directory(private_root)
    keys_dir = private_root / "keys"
    keys_dir.mkdir(mode=0o700)
    key = secrets.token_bytes(32)
    (keys_dir / "backup-drill.key").write_bytes(key)
    started = time.monotonic()
    source_engine = create_engine(source, hide_parameters=True)
    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT", hide_parameters=True)
    created: list[str] = []
    try:
        with (
            source_engine.connect().execution_options(isolation_level="REPEATABLE READ") as conn,
            conn.begin(),
        ):
            conn.execute(text("SET TRANSACTION READ ONLY"))
            snapshot = conn.scalar(text("SELECT pg_export_snapshot()"))
            original = manifest(conn)
            dump = pg_command(
                dump_bin,
                source,
                ["-Fc", "--no-owner", "--no-acl", f"--snapshot={snapshot}"],
            )
        encrypted = encrypt_backup(dump, key)
        archive_path = private_root / "database.pgdump.aesgcm"
        archive_path.write_bytes(encrypted)
        assert (
            decrypt_backup(archive_path.read_bytes(), (keys_dir / "backup-drill.key").read_bytes())
            == dump
        )
        del dump
        for wrong_archive, wrong_key in (
            (encrypted, secrets.token_bytes(32)),
            (encrypted[:-1] + bytes([encrypted[-1] ^ 1]), key),
        ):
            try:
                decrypt_backup(wrong_archive, wrong_key)
            except InvalidTag:
                continue
            else:
                raise AssertionError("Corrupted backup or incorrect key was accepted.")
        rotation = {}
        for index in range(2):
            name = f"codemark_recovery_{run_id}_{index}"
            with admin_engine.connect() as conn:
                conn.execute(text(f'CREATE DATABASE "{name}" TEMPLATE template0'))
            created.append(name)
            clone_url = admin_url.set(database=name)
            pg_command(
                restore_bin,
                clone_url,
                ["--exit-on-error", "--single-transaction", "--no-owner", "--no-acl"],
                decrypt_backup(archive_path.read_bytes(), key),
            )
            clone_engine = create_engine(clone_url, hide_parameters=True)
            try:
                with clone_engine.connect() as conn:
                    assert manifest(conn) == original, (
                        "Restored rows/schema contents differ from source snapshot."
                    )
            finally:
                clone_engine.dispose()
            if index == 0:
                rotation = rotate_clone(clone_url, keys_dir)
        report.update(
            {
                "status": "passed",
                "recordedAt": datetime.now(UTC).isoformat(),
                "sourceDatabaseReadOnly": True,
                "snapshotConsistent": True,
                "tablesVerified": len(original),
                "rowsVerified": sum(t["rows"] for t in original.values()),
                "encryptedArchiveSha256": hashlib.sha256(encrypted).hexdigest(),
                "wrongKeyRejected": True,
                "tamperingRejected": True,
                "independentRestoresVerified": 2,
                "mfaRotation": rotation,
                "seconds": round(time.monotonic() - started, 2),
                "productionAccepted": False,
            }
        )
    finally:
        source_engine.dispose()
        for name in reversed(created):
            assert name.startswith(f"codemark_recovery_{run_id}_")
            with admin_engine.connect() as conn:
                conn.execute(text(f'DROP DATABASE "{name}" WITH (FORCE)'))
        admin_engine.dispose()
    report["temporaryDatabasesRemoved"] = True
    write_report(args.report, report)
    print(
        "PASS: encrypted snapshot backup, two isolated restores, MFA rotation/key-loss/recovery; source read-only."
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001 - CLI must not leak credential-bearing exceptions
        fail_report(type(error).__name__)
        print(
            f"Release recovery drill stopped: {type(error).__name__}. No source writes were authorized.",
            file=sys.stderr,
        )
        raise SystemExit(1) from None
