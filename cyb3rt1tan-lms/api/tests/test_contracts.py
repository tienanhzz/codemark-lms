"""Verify implemented DTOs against the source contract, including regression checks."""

import importlib.util
import json
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from test_access import login  # noqa: F401

ROOT = Path(__file__).resolve().parents[3]
CONTRACTS = ROOT / "master-kit (1)" / "contracts" / "core-api"
DOCUMENT = yaml.safe_load((CONTRACTS / "openapi.yaml").read_text(encoding="utf-8"))


def test_implemented_response_shapes_match_source_contract(clients):
    admin, _, _ = clients
    login_response = admin.post(
        "/v1/auth/login",
        headers={"Origin": "http://127.0.0.1:3100"},
        json={"username": "admin", "password": "A test password for fixtures only!"},
    )
    responses = [
        ("LoginResponse", login_response.json()),
        ("CurrentUser", admin.get("/v1/me").json()),
        ("WorkspaceSummary", admin.get("/v1/workspace/summary").json()),
    ]
    for name, value in responses:
        Draft202012Validator(
            DOCUMENT["components"]["schemas"][name], format_checker=FormatChecker()
        ).validate(value)
    preferences = json.loads(
        (CONTRACTS / "user-preferences.schema.json").read_text(encoding="utf-8")
    )
    Draft202012Validator(preferences).validate(admin.get("/v1/me/preferences").json())


def test_discriminator_validation_resolves_references_and_allof():
    path = ROOT / "master-kit (1)" / "scripts" / "validate_contracts.py"
    spec = importlib.util.spec_from_file_location("contract_validator", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    content = json.loads((CONTRACTS / "question-content.schema.json").read_text(encoding="utf-8"))
    private = json.loads(
        (CONTRACTS / "question-authoring-config.schema.json").read_text(encoding="utf-8")
    )
    detected = module._schema_discriminators(content, "contentType")
    assert len(detected) == 12
    assert detected == module._schema_discriminators(private, "configType")
    private["$defs"]["code"]["properties"]["configType"]["const"] = "mismatched"
    assert detected != module._schema_discriminators(private, "configType")
