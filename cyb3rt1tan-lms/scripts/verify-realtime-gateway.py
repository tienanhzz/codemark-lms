"""Two-instance + Nginx WebSocket/polling acceptance in a fresh disposable DB."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
import uuid
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv
from release_evidence import begin_report, fail_report, write_report
from sqlalchemy import create_engine, make_url, text

ROOT = Path(__file__).resolve().parents[1]


def wait_ready(url: str, process: subprocess.Popen[bytes]) -> None:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("Acceptance service exited before becoming ready.")
        try:
            with urllib.request.urlopen(url + "/health/ready", timeout=2) as response:
                if response.status == 200:
                    return
        except (OSError, TimeoutError):
            time.sleep(0.2)
    raise RuntimeError("Acceptance service readiness timed out.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--nginx", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    report = begin_report(ROOT, args.report, "isolated-local-realtime-acceptance")
    if not args.nginx.is_file():
        raise ValueError("An installed Nginx binary is required.")
    for port in (8110, 8111, 3180):
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", port))
    if not os.environ.get("DATABASE_URL"):
        load_dotenv(ROOT / ".env")
    source = make_url(os.environ["DATABASE_URL"])
    if (
        source.host not in {"127.0.0.1", "localhost"}
        or os.environ.get("APP_ENV", "local") == "production"
    ):
        raise ValueError("This acceptance is local-only.")
    if os.environ.get("RELEASE_DRILL_ADMIN_URL"):
        admin = make_url(os.environ["RELEASE_DRILL_ADMIN_URL"])
    else:
        connection = json.loads(
            (ROOT.parent / ".tools/postgresql-local/connection.json").read_text(
                encoding="utf-8-sig"
            )
        )
        admin = source.set(username="postgres", password=connection["adminPassword"])
    if (source.host, source.port) != (admin.host, admin.port):
        raise ValueError("The acceptance administrator must use the same local server.")
    admin = admin.set(database="postgres")
    run_id = uuid.uuid4().hex
    name = "codemark_realtime_" + run_id
    runtime = ROOT / ".local/runtime" / ("realtime-" + run_id)
    runtime.mkdir(parents=True)
    (runtime / "logs").mkdir()
    (runtime / "temp").mkdir()
    config = (ROOT / "deployment/nginx-local.conf").read_text()
    for key, value in {"API_A": "8110", "API_B": "8111", "GATEWAY": "3180"}.items():
        config = config.replace(f"@@{key}@@", value)
    config_path = runtime / "nginx.conf"
    config_path.write_text(config)
    admin_engine = create_engine(admin, isolation_level="AUTOCOMMIT", hide_parameters=True)
    processes: list[subprocess.Popen[bytes]] = []
    files = []
    created = False
    gateway_started = False
    started = time.monotonic()
    try:
        with admin_engine.connect() as conn:
            conn.execute(text(f'CREATE DATABASE "{name}" TEMPLATE template0'))
        created = True
        target = admin.set(database=name).render_as_string(hide_password=False)
        env = {
            **os.environ,
            "DATABASE_URL": target,
            "MIGRATION_DATABASE_URL": target,
            "APP_ENV": "local",
            "APP_ORIGIN": "http://127.0.0.1:3180",
            "COOKIE_SECURE": "false",
            "SOCKETIO_REDIS_CHANNEL": "codemark-acceptance-" + run_id,
            "REALTIME_API_URL_A": "http://127.0.0.1:8110",
            "REALTIME_API_URL_B": "http://127.0.0.1:8111",
        }
        if not shutil.which("node"):
            raise ValueError("Node.js is required for the installed Socket.IO client.")
        with (runtime / "migration.log").open("wb") as log:
            subprocess.run(
                [sys.executable, "-m", "alembic", "upgrade", "head"],
                cwd=ROOT / "api",
                env=env,
                stdout=log,
                stderr=log,
                check=True,
                timeout=90,
            )
        for port in (8110, 8111):
            log = (runtime / f"api-{port}.log").open("wb")
            files.append(log)
            child = subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "uvicorn",
                    "app.main:socket_app",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    str(port),
                    "--no-access-log",
                ],
                cwd=ROOT / "api",
                env=env,
                stdout=log,
                stderr=log,
            )
            processes.append(child)
            wait_ready(f"http://127.0.0.1:{port}", child)
        prefix = runtime.as_posix() + "/"
        nginx_args = [
            str(args.nginx.resolve()),
            "-p",
            prefix,
            "-c",
            config_path.as_posix(),
        ]
        subprocess.run([*nginx_args, "-t"], check=True, capture_output=True, timeout=10)
        gateway_log = (runtime / "gateway.log").open("wb")
        files.append(gateway_log)
        gateway = subprocess.Popen(
            [*nginx_args, "-g", "daemon off;"], stdout=gateway_log, stderr=gateway_log
        )
        processes.append(gateway)
        gateway_started = True
        wait_ready("http://127.0.0.1:3180", gateway)
        checks = []
        cases = [
            ("two-api-fanout-and-revocation", "verify-realtime-multi-instance.py", {}),
            ("publish-retry-and-recovery", "verify-realtime-retry-recovery.py", {}),
            (
                "gateway-websocket-and-revocation",
                "verify-realtime-multi-instance.py",
                {
                    "REALTIME_API_URL_A": "http://127.0.0.1:3180",
                    "REALTIME_API_URL_B": "http://127.0.0.1:3180",
                },
            ),
            (
                "gateway-polling-and-revocation",
                "verify-realtime-multi-instance.py",
                {
                    "REALTIME_API_URL_A": "http://127.0.0.1:3180",
                    "REALTIME_API_URL_B": "http://127.0.0.1:3180",
                    "REALTIME_TRANSPORT": "polling",
                },
            ),
        ]
        for label, helper, extra in cases:
            with (runtime / (label + ".log")).open("wb") as log:
                subprocess.run(
                    [sys.executable, str(ROOT / "scripts" / helper)],
                    cwd=ROOT,
                    env={**env, **extra},
                    stdout=log,
                    stderr=log,
                    check=True,
                    timeout=80,
                )
            checks.append({"check": label, "status": "passed"})
            print("PASS: " + label, flush=True)
        report.update(
            {
                "schemaVersion": 1,
                "scope": "isolated-local-realtime-acceptance",
                "recordedAt": datetime.now(UTC).isoformat(),
                "status": "passed",
                "checks": checks,
                "sourceDatabaseUnchanged": True,
                "seconds": round(time.monotonic() - started, 2),
                "productionAccepted": False,
            }
        )
    finally:
        if gateway_started:
            subprocess.run(
                [*nginx_args, "-s", "quit"],
                check=False,
                capture_output=True,
                timeout=10,
            )
        for child in processes:
            if child.poll() is None:
                child.terminate()
        for child in processes:
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=5)
        for log in files:
            log.close()
        if created:
            assert name == "codemark_realtime_" + run_id
            with admin_engine.connect() as conn:
                conn.execute(text(f'DROP DATABASE "{name}" WITH (FORCE)'))
        admin_engine.dispose()
    report["temporaryDatabaseRemoved"] = True
    write_report(args.report, report)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001 - never print credential-bearing native exceptions
        fail_report(type(error).__name__)
        print(
            f"Realtime acceptance stopped: {type(error).__name__}. See private runtime logs.",
            file=sys.stderr,
        )
        raise SystemExit(1) from None
