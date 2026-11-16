"""Synchronize the additive BUILD-026 self-service contract without reformatting older YAML."""

import base64
import os
import re
import sys
from pathlib import Path

import yaml

root = Path(__file__).resolve().parents[1]
os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
os.environ["MIGRATION_DATABASE_URL"] = os.environ["DATABASE_URL"]
os.environ["LOGIN_HMAC_KEY"] = "contract-generation-only-no-authentication-allowed"
os.environ["MFA_ENCRYPTION_KEY"] = base64.b64encode(b"c" * 32).decode()
sys.path.insert(0, str(root / "api"))
from app.main import app

source = root.parent / "master-kit (1)/contracts/core-api/openapi.yaml"
document = source.read_text(encoding="utf-8")
start, end = "  # BEGIN BUILD-026 SELF SERVICE\n", "  # END BUILD-026 SELF SERVICE\n"
schema_start, schema_end = "    # BEGIN IDENTITY SCHEMAS\n", "    # END IDENTITY SCHEMAS\n"
for first, last in [(start, end), (schema_start, schema_end)]:
    if first in document:
        a, b = document.index(first), document.index(last) + len(last)
        document = document[:a] + document[b:]
existing = yaml.safe_load(document)

current_user = existing["components"]["schemas"]["CurrentUser"]
current_user["properties"]["avatarUrl"] = {"type": ["string", "null"]}
replacement = "".join("    " + line + "\n" for line in yaml.safe_dump({"CurrentUser": current_user}, sort_keys=False).splitlines())
document = re.sub(r"(?ms)^    CurrentUser:\n.*?(?=^    [A-Za-z0-9_]+:\n|\Z)", lambda _: replacement, document, count=1)

status_schema = existing["components"]["schemas"]["CsvImportStatus"]
status_schema["properties"].update({"importKind": {"type": "string", "enum": ["users", "enrollments"]},
    "templateVersion": {"type": "integer", "enum": [1, 2]}})
for field in ["importKind", "templateVersion"]:
    if field not in status_schema["required"]:
        status_schema["required"].append(field)
replacement = "".join("    " + line + "\n" for line in yaml.safe_dump({"CsvImportStatus": status_schema}, sort_keys=False).splitlines())
document = re.sub(r"(?ms)^    CsvImportStatus:\n.*?(?=^    [A-Za-z0-9_]+:\n|\Z)", lambda _: replacement, document, count=1)

for path, operations in existing["paths"].items():
    if not path.startswith("/admin/csv-imports"):
        continue
    for method, operation in operations.items():
        if method not in {"get", "post"}:
            continue
        operation["description"] = ("Actor-owned, digest/checksum-bound CSV workflow; raw identity values are not staged. "
            "User imports require Admin: v1 has username,email,official_name,institutional_id,role; v2 adds faculty_id,course_id,section_id. "
            "Enrollment v1 requires Admin or Administrative Assistant and has institutional_id,username,course_id,section_id,status. "
            "Live permissions and relevant user/course/membership revisions are rechecked. At most 1 MB and 500 rows; validate all rows before atomic commit.")
        operation["responses"].pop("501", None)
        if path == "/admin/csv-imports":
            operation["summary"] = "Create an authorized account or enrollment CSV import job"
            operation["responses"]["400"] = {"description": "Unsupported template version"}
    replacement = "".join("  " + line + "\n" for line in yaml.safe_dump({path: operations}, sort_keys=False).splitlines())
    document = re.sub(r"(?ms)^  " + re.escape(path) + r":\n.*?(?=^  /|^components:)", lambda _: replacement, document, count=1)

# Update the two existing, closed account DTOs without rewriting unrelated contract sections.
for name in ["AdminAccountDetail", "AdminAccountSearchResponse"]:
    schema = existing["components"]["schemas"][name]
    target = schema if name == "AdminAccountDetail" else schema["properties"]["items"]["items"]
    target["properties"].update({"facultyId": {"type": ["string", "null"]},
        "source": {"type": "string", "enum": ["legacy", "csv", "invitation", "bootstrap"]}})
    for field in ["facultyId", "source"]:
        if field not in target["required"]:
            target["required"].append(field)
    block = yaml.safe_dump({name: schema}, sort_keys=False, allow_unicode=True)
    replacement = "".join("    " + line + "\n" for line in block.splitlines())
    document = re.sub(r"(?ms)^    " + name + r":\n.*?(?=^    [A-Za-z0-9_]+:\n|\Z)", lambda _: replacement, document, count=1)

account_path = existing["paths"]["/admin/users"]
parameters = account_path["get"].setdefault("parameters", [])
parameters[:] = [item for item in parameters if item.get("name") not in {"source", "facultyId"}]
parameters += [{"name": "facultyId", "in": "query", "schema": {"type": "string", "maxLength": 128}},
               {"name": "source", "in": "query", "schema": {"type": "string", "enum": ["legacy", "csv", "invitation", "bootstrap"]}}]
replacement = "".join("  " + line + "\n" for line in yaml.safe_dump({"/admin/users": account_path}, sort_keys=False).splitlines())
document = re.sub(r"(?ms)^  /admin/users:\n.*?(?=^  /|^components:)", lambda _: replacement, document, count=1)
generated = app.openapi()
paths = {}
public = {"/auth/recovery/status", "/auth/password-resets", "/auth/password-resets/complete"}
selected = public | {
    "/me/profile", "/me/sessions", "/me/sessions/{session_id}/revoke", "/admin/identity-policy"
    , "/admin/account-exports", "/admin/account-exports/{job_id}", "/admin/account-exports/{job_id}/download"
    , "/profile-support/users", "/profile-support/users/{user_id}/access", "/profile-support/users/{user_id}",
    "/me/avatar", "/me/avatar/{avatar_id}", "/courses/{course_id}/teaching-team",
    "/courses/{course_id}/teaching-team/{user_id}/avatar/{avatar_id}"
}
for path in sorted(selected):
    operations = generated["paths"]["/v1" + path]
    for method, operation in operations.items():
        operation["tags"] = ["Access" if path in public else "Accounts"]
        if path in public:
            operation["security"] = []
        if method in {"post", "patch", "put", "delete"} and path not in public:
            operation.setdefault("parameters", []).append({
                "name": "X-CSRF-Token", "in": "header", "required": True,
                "schema": {"type": "string"},
            })
        operation["responses"].pop("422", None)
        errors = {}
        if path not in public:
            errors.update({"401": "Authentication or current MFA required", "403": "Permission denied"})
        if method in {"post", "patch", "put", "delete"}:
            operation.setdefault("parameters", []).append({
                "name": "Origin", "in": "header", "required": True,
                "description": "Must exactly match the configured application origin.",
                "schema": {"type": "string"},
            })
            errors.update({"400": "Invalid credential, session or token", "403": "Origin or CSRF rejected",
                           "422": "Submitted values are invalid; input values are never echoed"})
        if method in {"put", "patch"}:
            errors["409"] = "Revision conflict, nickname unavailable or cooldown active"
        if path in {"/auth/password-resets", "/auth/password-resets/complete", "/me/sessions/{session_id}/revoke"}:
            errors["429"] = "Request rate limit reached"
        if path == "/auth/password-resets":
            errors["503"] = "SMTP is not configured; never depends on account existence"
        if path.endswith("/revoke"):
            errors["404"] = "Session not found among the current user's sessions"
        if path.startswith("/profile-support/users") and "{user_id}" in path:
            errors["404"] = "Account not found"
        if path.startswith("/courses/") and "/teaching-team" in path:
            errors["404"] = "Course or current staff profile is inaccessible"
        image_get = method == "get" and "/avatar/" in path
        if image_get:
            errors["404"] = "Image is unavailable or inaccessible"
            operation["responses"]["200"] = {"description": "Private sanitized image; authorization rechecked, no-store",
                "content": {"image/png": {"schema": {"type": "string", "format": "binary"}}}}
        if path == "/me/avatar":
            operation.setdefault("parameters", []).append({"name": "If-Match", "in": "header", "required": True,
                "description": "Quoted current profile revision", "schema": {"type": "string"}})
            errors.update({"428": "Profile revision required", "409": "Profile changed"})
            if method == "put":
                errors.update({"413": "Image exceeds 1 MB", "415": "PNG required"})
                operation["requestBody"] = {"required": True, "content": {"image/png": {"schema": {"type": "string", "format": "binary"}}}}
        if path.startswith("/admin/account-exports"):
            if method == "post":
                errors["413"] = "Export exceeds the 10000-row limit; narrow the filters"
            else:
                errors.update({"404": "Export not found for this administrator", "410": "Export has expired"})
            if path.endswith("/download"):
                errors["409"] = "Selected records changed; prepare a new export"
                operation["responses"]["200"] = {"description": "Audited, freshly authorized export attachment",
                    "headers": {"Content-Disposition": {"schema": {"type": "string"}}},
                    "content": {mime: {"schema": {"type": "string", "format": "binary"}} for mime in
                        ["text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]}}
        for status, description in errors.items():
            operation["responses"][status] = {"description": description, "content": {
                "application/json": {"schema": {"$ref": "#/components/schemas/ErrorEnvelope"}}
            }}
        if path == "/me/profile" and method == "patch":
            operation["description"] = "Revision-bound partial update. Omitted profile fields remain unchanged; null clears optional values. Official identity fields are forbidden."
    paths[path] = operations

schemas = {}
pending = []


def references(value):
    if isinstance(value, dict):
        if "$ref" in value:
            pending.append(value["$ref"].rsplit("/", 1)[-1])
        for child in value.values():
            references(child)
    elif isinstance(value, list):
        for child in value:
            references(child)


references(paths)
while pending:
    name = pending.pop()
    if name in schemas or name in existing["components"]["schemas"]:
        continue
    schemas[name] = generated["components"]["schemas"][name]
    references(schemas[name])


def indented(value, width):
    return "".join(" " * width + line + "\n" for line in yaml.safe_dump(
        value, sort_keys=False, allow_unicode=True, width=100,
    ).splitlines())


document = document.replace("components:\n", start + indented(paths, 2) + end + "components:\n", 1)
document += schema_start + indented(schemas, 4) + schema_end
source.write_text(document, encoding="utf-8")
print(f"Synchronized {len(paths)} identity paths and {len(schemas)} additive schemas.")
