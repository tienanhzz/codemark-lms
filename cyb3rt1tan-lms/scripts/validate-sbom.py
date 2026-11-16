"""Validate generated dependency SBOM with the scanner's bundled CycloneDX schema."""

import json
from datetime import UTC, datetime
from pathlib import Path

from cyclonedx.schema import SchemaVersion
from cyclonedx.validation.json import JsonStrictValidator

root = Path(__file__).resolve().parents[1]
target = root / "docs/master-kit/dependency-sbom.cdx.json"
result = JsonStrictValidator(SchemaVersion.V1_6).validate_str(
    target.read_text("utf-8"), all_errors=True
)
failures = list(result) if result else []
report = {
    "checkedAt": datetime.now(UTC).isoformat(),
    "result": "fail" if failures else "pass",
    "schema": "CycloneDX 1.6 bundled with cyclonedx-python-lib 11.12.0",
    "externalSchemaFetch": False,
    "errors": [str(error) for error in failures],
}
(target.parent / "BUILD-002-sbom-validation.json").write_text(
    json.dumps(report, indent=2) + "\n", "utf-8"
)
if failures:
    raise SystemExit(
        "SBOM schema validation failed; see BUILD-002-sbom-validation.json."
    )
print("PASS: dependency SBOM validates against bundled CycloneDX 1.6 JSON schema.")
