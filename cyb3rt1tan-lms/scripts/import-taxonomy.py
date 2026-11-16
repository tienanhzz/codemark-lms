"""One-time, version-checked import of the bundled master-kit taxonomy."""

import argparse
import getpass
import json
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = ROOT / "web" / "public" / "learning-taxonomy.example.json"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default="http://127.0.0.1:8100")
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    args = parser.parse_args()
    username = input("Admin username: ").strip()
    password = getpass.getpass("Admin password: ")
    origin = "http://127.0.0.1:3100"
    with httpx.Client(base_url=args.api_url.rstrip("/"), timeout=30) as client:
        login = client.post("/v1/auth/login", headers={"Origin": origin}, json={"username": username, "password": password})
        if login.status_code != 200:
            print("Admin sign-in failed.")
            return 1
        csrf = client.cookies.get("lms_csrf", "")
        headers = {"Origin": origin, "X-CSRF-Token": csrf}
        current = client.get("/v1/question-taxonomy?includeRetired=true", headers=headers)
        if current.status_code != 200:
            print("Could not read the current catalog version.")
            return 1
        source = json.loads(args.catalog.read_text(encoding="utf-8"))
        source.pop("catalogVersion", None)
        source["expectedCatalogVersion"] = current.json()["catalogVersion"]
        response = client.post("/v1/admin/taxonomy/seed", headers=headers, json=source)
        if response.status_code != 201:
            code = response.json().get("error", {}).get("code", "import_failed")
            print(f"Taxonomy import refused: {code}")
            return 1
        result = response.json()
        print(f"Imported {result['categories']} categories and {result['tags']} tags into both lesson and question catalogs.")
        print(f"New catalog version: {result['catalogVersion']}")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
