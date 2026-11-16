"""Update the payload-free BUILD-025 operational DTO without reading runtime secrets."""

import os
import sys
from pathlib import Path

import yaml

root = Path(__file__).resolve().parents[1]
os.environ.update(
    {
        "APP_ENV": "test",
        "DATABASE_URL": "sqlite+pysqlite:///:memory:",
        "LOGIN_HMAC_KEY": "contract-generation-test-only-key-at-least-32",
    }
)
sys.path.insert(0, str(root / "api"))
from app.operations import PersistenceStatus

path = root.parent / "master-kit (1)/contracts/core-api/openapi.yaml"
document = yaml.safe_load(path.read_text("utf-8"))
document["components"]["schemas"]["PersistenceStatus"] = (
    PersistenceStatus.model_json_schema()
)
document["paths"]["/admin/operations/persistence"] = {
    "get": {
        "operationId": "getPersistenceStatus",
        "tags": ["Access"],
        "summary": "Admin-only payload-free PostgreSQL/outbox foundation diagnostics",
        "description": "Read-only no-store counts and configuration bounds. No credentials, payloads, event IDs, queue consumer identities or Redis health claims.",
        "responses": {
            "200": {
                "description": "Current persistence diagnostics.",
                "content": {
                    "application/json": {
                        "schema": {"$ref": "#/components/schemas/PersistenceStatus"}
                    }
                },
            },
            "403": {"$ref": "#/components/responses/Forbidden"},
        },
    }
}
path.write_text(
    yaml.safe_dump(document, sort_keys=False, allow_unicode=True, width=100), "utf-8"
)
print("Updated original BUILD-025 persistence diagnostics contract.")
