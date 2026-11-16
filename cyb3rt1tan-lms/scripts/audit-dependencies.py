"""Build-time feed queries; record failed/skipped coverage without claiming a clean scan."""

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

root = Path(__file__).resolve().parents[1]
output = root / "docs/master-kit"
parser = argparse.ArgumentParser()
parser.add_argument(
    "--auditor-python",
    default=str(root.parent / ".tools/master-kit-audit/Scripts/python.exe"),
)
args = parser.parse_args()
output.mkdir(parents=True, exist_ok=True)
report = {
    "buildId": "BUILD-002",
    "checkedAt": datetime.now(UTC).isoformat(),
    "purpose": "Development/build dependency review only; no runtime external calls enabled.",
    "python": {},
    "node": {},
}


def save(name: str, value: object) -> None:
    (output / name).write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", "utf-8"
    )


python_file = output / "python-audit.json"
save(
    "python-audit.json",
    {
        "dependencies": [],
        "error": "Audit not completed; do not reuse a previous report.",
    },
)
result = subprocess.run(
    [
        args.auditor_python,
        "-m",
        "pip_audit",
        "--requirement",
        str(root / "api/requirements.lock"),
        "--disable-pip",
        "--no-deps",
        "--strict",
        "--progress-spinner",
        "off",
        "--timeout",
        "20",
        "--cache-dir",
        str(root / ".local/audit-cache"),
        "--format",
        "json",
        "--output",
        str(python_file),
    ],
    check=False,
    capture_output=True,
    text=True,
    encoding="utf-8",
)
try:
    data = json.loads(python_file.read_text("utf-8"))
except (OSError, json.JSONDecodeError):
    data = {}
dependencies = data.get("dependencies", [])
skipped = [
    {"name": item["name"], "reason": item["skip_reason"]}
    for item in dependencies
    if item.get("skip_reason")
]
issues = sum(len(item.get("vulns", [])) for item in dependencies)
python_ok = result.returncode == 0 and bool(dependencies) and not skipped
report["python"] = {
    "status": "pass" if python_ok else "findings-or-unavailable",
    "exitCode": result.returncode,
    "packagesReported": len(dependencies),
    "vulnerabilityRecords": issues,
    "skipped": skipped,
    "source": "pip-audit 2.10.1 / PyPI advisory feed",
    "report": "python-audit.json" if python_file.exists() else None,
}
npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
if not npm:
    raise SystemExit("npm is required for the Node audit.")
result = subprocess.run(
    [npm, "audit", "--omit=dev", "--json"],
    cwd=root / "web",
    check=False,
    capture_output=True,
    text=True,
    encoding="utf-8",
)
try:
    data = json.loads(result.stdout)
except json.JSONDecodeError:
    data = {"error": {"code": "AUDIT_FEED_UNAVAILABLE"}}
save("node-runtime-audit.json", data)
node_ok = result.returncode == 0 and "error" not in data and "metadata" in data
report["node"] = {
    "status": "pass" if node_ok else "findings-or-unavailable",
    "exitCode": result.returncode,
    "scope": "runtime (--omit=dev)",
    "counts": data.get("metadata", {}).get("vulnerabilities", {}),
    "source": "npm registry audit feed",
    "report": "node-runtime-audit.json",
}
all_result = subprocess.run(
    [npm, "audit", "--json"],
    cwd=root / "web",
    check=False,
    capture_output=True,
    text=True,
    encoding="utf-8",
)
try:
    all_data = json.loads(all_result.stdout)
except json.JSONDecodeError:
    all_data = {"error": {"code": "AUDIT_FEED_UNAVAILABLE"}}
save("node-all-audit.json", all_data)
all_ok = (
    all_result.returncode == 0 and "error" not in all_data and "metadata" in all_data
)
report["nodeAll"] = {
    "status": "pass" if all_ok else "findings-or-unavailable",
    "exitCode": all_result.returncode,
    "scope": "runtime and development",
    "counts": all_data.get("metadata", {}).get("vulnerabilities", {}),
    "report": "node-all-audit.json",
}
report["releaseAcceptance"] = (
    "pending: feed results do not establish production security, license approval or runtime egress"
)
save("BUILD-002-audits.json", report)
print(
    "Python audit:",
    report["python"]["status"],
    "packages:",
    len(dependencies),
    "records:",
    issues,
    "skipped:",
    len(skipped),
)
print("Node runtime audit:", report["node"]["status"], report["node"]["counts"])
print(
    "Node all-dependency audit:",
    report["nodeAll"]["status"],
    report["nodeAll"]["counts"],
)
if not python_ok or not node_ok or not all_ok:
    print(
        "Audit coverage is incomplete or has findings; see BUILD-002-audits.json. Not a clean release scan."
    )
    sys.exit(1)
