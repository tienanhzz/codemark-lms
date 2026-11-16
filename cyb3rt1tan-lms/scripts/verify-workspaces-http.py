"""Read-only HTTP coverage of declared live/preview workspace routes."""

import json
import re
from datetime import UTC, datetime
from pathlib import Path

import httpx

root = Path(__file__).resolve().parents[1]
catalog = (root / "web/lib/workspaceCatalog.ts").read_text("utf-8")
preview_ids = re.findall(r"\bid:\s*['\"]([a-z-]+)['\"]", catalog)
base = [
    "activity",
    "courses",
    "academic-catalogs",
    "course-rules",
    "profile",
    "security",
    "settings",
    "accounts",
    "imports",
    "profile-support",
    "mfa-policy",
    "accept-invitation",
    "forgot-password",
    "reset-password",
]
routes = ["/"] + ["/" + value for value in base + preview_ids]
with httpx.Client(base_url="http://127.0.0.1:3100", timeout=20) as client:
    for route in routes:
        reply = client.get(route)
        assert reply.status_code == 200, (route, reply.status_code)
        assert "frame-ancestors 'none'" in reply.headers["content-security-policy"]
        assert "unsafe-eval" not in reply.headers["content-security-policy"]
    assert client.get("/not-a-workspace").status_code == 404
    assert client.get("/v1/me").status_code == 401
report = {
    "checkedAt": datetime.now(UTC).isoformat(),
    "result": "pass",
    "routes": routes,
    "previewRoutes": preview_ids,
    "authenticatedWorkflowVerification": False,
    "browserVisualQA": False,
    "businessDataMutations": False,
}
(root / "docs/master-kit/workspaces-http.json").write_text(
    json.dumps(report, indent=2) + "\n", "utf-8"
)
print(
    f"PASS: {len(routes)} workspace HTTP routes, CSP, unknown-route 404 and authentication boundary. No login or data mutation."
)
