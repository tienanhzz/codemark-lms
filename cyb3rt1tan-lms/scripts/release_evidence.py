"""Source-bound, credential-free local acceptance reports."""

import hashlib
import json
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

_active: tuple[Path, dict[str, Any]] | None = None


def begin_report(root: Path, path: Path, scope: str) -> dict[str, Any]:
    global _active
    sources = [
        "cyb3rt1tan-lms/api",
        "cyb3rt1tan-lms/web",
        "cyb3rt1tan-lms/scripts",
        "cyb3rt1tan-lms/deployment",
        ".github/workflows",
    ]
    repository = root.parent
    paths = (
        subprocess.check_output(
            [
                "git",
                "ls-files",
                "--cached",
                "--others",
                "--exclude-standard",
                "-z",
                "--",
                *sources,
            ],
            cwd=repository,
        )
        .decode()
        .split("\0")
    )
    fingerprint = hashlib.sha256()
    for relative in sorted(set(paths) - {""}):
        source = repository / relative
        if source.is_file():
            fingerprint.update(relative.encode() + b"\0" + source.read_bytes() + b"\0")
    report = {
        "schemaVersion": 1,
        "scope": scope,
        "status": "running",
        "recordedAt": datetime.now(UTC).isoformat(),
        "baselineCommit": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=root, text=True
        ).strip(),
        "workingTreeDirty": bool(
            subprocess.check_output(
                ["git", "status", "--porcelain", "--", *sources], cwd=repository
            )
        ),
        "sourceFingerprintSha256": fingerprint.hexdigest(),
        "productionAccepted": False,
    }
    write_report(path, report)
    _active = path, report
    return report


def fail_report(error_type: str) -> None:
    if _active is not None:
        path, report = _active
        report.update(status="failed", failureType=error_type, productionAccepted=False)
        write_report(path, report)


def write_report(path: Path, report: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
