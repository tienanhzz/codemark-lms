"""BUILD-000 source baseline: validate contracts and fingerprint specification files only."""

import hashlib
import json
import re
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import unquote

root = Path(__file__).resolve().parents[1]
source = root.parent / "master-kit (1)"
output = root / "docs/master-kit"
required = [
    "BUILDING_PROCESS.md",
    "PRODUCT_REQUIREMENTS.md",
    "ARCHITECTURE.md",
    "SECURITY_STANDARDS.md",
    "CODING_CONVENTIONS.md",
    "DECISIONS.md",
    "DESIGN_SYSTEM_PROPOSAL.md",
    "ROADMAP.md",
    "contracts/core-api/data-model.md",
    "contracts/core-api/API_CONTRACTS.md",
    "contracts/core-api/openapi.yaml",
    "adr/ADR-0010-local-trusted-source-autograder.md",
]
for name in required:
    if not (source / name).is_file():
        raise SystemExit("Missing source: " + name)

files = sorted(
    {source / name for name in required}
    | set((source / "adr").glob("*.md"))
    | set((source / "contracts/core-api").glob("*.json"))
)
result = subprocess.run(
    [sys.executable, str(source / "scripts/validate_contracts.py")],
    check=False,
    capture_output=True,
    text=True,
    encoding="utf-8",
)
if result.returncode:
    print(result.stdout)
    print(result.stderr, file=sys.stderr)
    raise SystemExit(result.returncode)
counts = re.search(
    r"\((\d+) paths, (\d+) operations\), (\d+) JSON Schemas, (\d+) examples",
    result.stdout,
)
if not counts:
    raise SystemExit(
        "Contract validator passed without recognized evidence counts; review output."
    )
plan = (root / "docs/MASTER-KIT-EXECUTION.md").read_text("utf-8")
expected = [
    "000",
    "001",
    "002",
    "012",
    "024",
    "025",
    "026",
    "027",
    "028",
    "029",
    "030",
    "031",
    "034",
    "032",
    "033",
]
actual = re.findall(r"^\| \d+ \| BUILD-(\d{3}) \|", plan, re.MULTILINE)
if actual != expected:
    raise SystemExit(
        "Execution table differs from the recorded original-ID dependency order."
    )
fingerprints = [
    {
        "path": file.relative_to(source).as_posix(),
        "sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
        "bytes": file.stat().st_size,
    }
    for file in files
]
timestamp = datetime.now(UTC).isoformat()
output.mkdir(parents=True, exist_ok=True)
(output / "source-baseline.json").write_text(
    json.dumps(
        {
            "execution": "local-master-kit-2026-11-14",
            "capturedAt": timestamp,
            "source": "master-kit (1)",
            "files": fingerprints,
        },
        ensure_ascii=False,
        indent=2,
    )
    + "\n",
    "utf-8",
)
report = {
    "buildId": "BUILD-000",
    "execution": "local-master-kit-2026-11-14",
    "checkedAt": timestamp,
    "result": "pass",
    "checks": {
        "sourceInventory": True,
        "originalBuildOrder": True,
        "contracts": True,
        "traceabilityDocument": "docs/master-kit/BUILD-000.md",
    },
    "counts": dict(
        zip(
            ["paths", "operations", "jsonSchemas", "examples"],
            map(int, counts.groups()),
        )
    ),
    "runtimeVerification": False,
    "uiScope": "No product screen in specification BUILD-000",
    "notes": [
        "Historical Done labels do not establish local runtime completion.",
        "Future domain implementation and browser visual QA remain pending.",
    ],
}
(output / "BUILD-000-validation.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + "\n", "utf-8"
)

# BUILD-001 validates the user documentation against real route source and local links.
readme = (root / "README.md").read_text("utf-8")
link_files = [
    root / "README.md",
    root / "docs/MASTER-KIT-EXECUTION.md",
    root / "docs/CODING_CONVENTIONS.md",
    root / "docs/master-kit/BUILD-000.md",
    root / "docs/master-kit/BUILD-001.md",
    root / "docs/master-kit/BUILD-002.md",
]
link_count = 0
for file in link_files:
    for link in re.finditer(r"\]\((?:<([^>]+)>|([^\)]+))\)", file.read_text("utf-8")):
        target = link[1] or link[2]
        if "://" in target or target.startswith("#"):
            continue
        target = unquote(target.split("#", 1)[0])
        if not (file.parent / target).resolve().exists():
            raise SystemExit(
                "Broken documentation link: " + file.name + " -> " + target
            )
        link_count += 1
views = set(
    re.findall(r"'([a-z-]+)'", (root / "web/app/[view]/page.tsx").read_text("utf-8"))
)
views.update(
    re.findall(
        r"\bid:\s*['\"]([a-z-]+)['\"]",
        (root / "web/lib/workspaceCatalog.ts").read_text("utf-8"),
    )
)
routes = set(re.findall(r"`(/[^`\s]*)`", readme))
for route in routes:
    view = route.split("#", 1)[0].removeprefix("/")
    if view and view not in views and view != "v1":
        raise SystemExit("README lists a route absent from source: " + route)
(output / "BUILD-001-validation.json").write_text(
    json.dumps(
        {
            "buildId": "BUILD-001",
            "execution": "local-master-kit-2026-11-14",
            "checkedAt": timestamp,
            "result": "pass",
            "localLinksChecked": link_count,
            "readmeRoutesChecked": sorted(routes),
            "runtimeOrBrowserVerification": False,
        },
        ensure_ascii=False,
        indent=2,
    )
    + "\n",
    "utf-8",
)
print(result.stdout.strip())
print(
    f"PASS BUILD-000: {len(files)} source documents/contracts fingerprinted; original build IDs and traceability recorded. No runtime/UI completion inferred."
)
