"""Guarded local application upgrade with a pre-created private backup and count parity."""

import argparse
import os
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, make_url, text

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--backup", required=True)
parser.add_argument("--target", choices=("app", "test"), default="app")
args = parser.parse_args()
backup = Path(args.backup).resolve()
if (
    backup.parent != (root / ".local/backups").resolve()
    or not backup.is_file()
    or backup.stat().st_size
):
    raise SystemExit(
        "Backup must be a new empty private file in the local backup directory."
    )
load_dotenv(root / ".env")
target_env = "DATABASE_URL" if args.target == "app" else "TEST_DATABASE_URL"
target = os.environ[target_env]
url = make_url(target)
expected_database = "codemark_lms" if args.target == "app" else "codemark_lms_test"
if url.database != expected_database or url.host not in {"127.0.0.1", "localhost"}:
    raise SystemExit("Refusing an unexpected application database target.")
if args.target == "test" and target == os.environ.get("DATABASE_URL"):
    raise SystemExit("Refusing to use the application database as the test target.")
os.environ["DATABASE_URL"] = target
os.environ["MIGRATION_DATABASE_URL"] = target
engine = create_engine(target, hide_parameters=True)
tables = ["users", "user_sessions", "audit_events", "courses"]
with engine.connect() as connection:
    before = {
        name: connection.scalar(text("SELECT count(*) FROM " + name)) for name in tables
    }
result = subprocess.run(
    [
        str(root.parent / ".tools/postgresql-17/pgsql/bin/pg_dump.exe"),
        "-h",
        url.host,
        "-p",
        str(url.port or 5432),
        "-U",
        url.username or "",
        "-d",
        url.database,
        "-Fc",
        "-f",
        str(backup),
    ],
    env={**os.environ, "PGPASSWORD": url.password or ""},
    capture_output=True,
    check=False,
)
if result.returncode or backup.stat().st_size < 100:
    raise SystemExit("Backup failed; migration was not started.")
sys.path.insert(0, str(root / "api"))
from alembic import command
from alembic.config import Config

config = Config(str(root / "api/alembic.ini"))
config.set_main_option("script_location", str(root / "api/migrations"))
command.upgrade(config, "head")
command.check(config)
command.current(config)
with engine.connect() as connection:
    after = {
        name: connection.scalar(text("SELECT count(*) FROM " + name)) for name in tables
    }
assert before == after, "Migration unexpectedly changed existing row counts."
engine.dispose()
print(
    "PASS: private pre-migration backup, head upgrade/schema drift and users/sessions/audit/courses count parity. No reseeding."
)
