"""Read-only production foundation smoke; never authenticates or mutates account data."""

import json
import re
from datetime import UTC, datetime
from pathlib import Path

import httpx

root = Path(__file__).resolve().parents[1]
routes = [
    "/",
    "/activity",
    "/profile",
    "/security",
    "/settings",
    "/accounts",
    "/imports",
    "/profile-support",
    "/mfa-policy",
    "/accept-invitation",
    "/forgot-password",
    "/reset-password",
    "/courses",
    "/academic-catalogs",
    "/course-rules",
]
assets = set()
with httpx.Client(base_url="http://127.0.0.1:3100", timeout=15) as client:
    for route in routes:
        response = client.get(route)
        assert response.status_code == 200, route
        assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
        assert "unsafe-eval" not in response.headers["content-security-policy"]
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["x-frame-options"] == "DENY"
        assets.update(
            asset
            for asset in re.findall(
                r'(?:src|href)="([^\"]+\.(?:js|css)(?:\?[^\"]*)?)"', response.text
            )
            if asset.startswith("/")
        )
    for asset in sorted(
        assets
        | {"/branding/font.css", "/branding/NotoSans-Regular.ttf", "/favicon.ico"}
    ):
        assert client.get(asset).status_code == 200, asset
    for path in ["/v1/me", "/v1/courses", "/v1/admin/users"]:
        response = client.get(path)
        assert response.status_code == 401, path
        assert response.headers["cache-control"] == "no-store"
        assert response.json()["error"]["code"] == "authentication_required"
    assert client.get("http://127.0.0.1:8100/health/ready").json()["status"] == "ready"
report = {
    "buildId": "BUILD-002",
    "checkedAt": datetime.now(UTC).isoformat(),
    "result": "pass",
    "routes": routes,
    "localBundlesChecked": len(assets),
    "apiReady": True,
    "unauthenticatedProtectedEndpoints": "401",
    "cspHeaders": "pass",
    "authenticatedWorkflowVerification": False,
    "browserVisualQA": False,
    "accountOrDatabaseMutations": False,
}
(root / "docs/master-kit/BUILD-002-http.json").write_text(
    json.dumps(report, indent=2) + "\n", "utf-8"
)
print(
    f"PASS: {len(routes)} production routes, {len(assets)} local bundles, security headers, API readiness and unauthenticated boundaries. Read-only HTTP, not visual QA."
)
