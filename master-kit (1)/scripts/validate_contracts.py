#!/usr/bin/env python3
"""Validate the repository's machine-readable API and data contracts."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.validators import validator_for
from openapi_spec_validator import validate
from referencing import Registry, Resource


ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "contracts" / "core-api"
OPENAPI_PATH = CONTRACTS / "openapi.yaml"
HTTP_METHODS = {"get", "post", "put", "patch", "delete", "options", "head", "trace"}


class ValidationError(Exception):
    """Raised when a cross-contract invariant is violated."""


class UniqueKeyLoader(yaml.SafeLoader):
    """Safe YAML loader that rejects duplicate mapping keys."""


def _construct_unique_mapping(
    loader: UniqueKeyLoader, node: yaml.MappingNode, deep: bool = False
) -> dict[Any, Any]:
    loader.flatten_mapping(node)
    result: dict[Any, Any] = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in result:
            raise ValidationError(f"duplicate YAML key: {key!r}")
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


UniqueKeyLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _construct_unique_mapping
)


def fail(message: str) -> None:
    raise ValidationError(message)


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"{path.relative_to(ROOT)}: {error}")


def check_schema_document(path: Path, schema: dict[str, Any]) -> None:
    validator_class = validator_for(schema)
    try:
        validator_class.check_schema(schema)
    except Exception as error:
        fail(f"{path.relative_to(ROOT)} is not a valid JSON Schema: {error}")


def validate_json_schemas() -> tuple[dict[str, dict[str, Any]], int]:
    schemas: dict[str, dict[str, Any]] = {}
    for path in sorted(CONTRACTS.glob("*.schema.json")):
        schema = load_json(path)
        if not isinstance(schema, dict):
            fail(f"{path.name} must contain a JSON object schema")
        check_schema_document(path, schema)
        schemas[path.name] = schema

    registry = Registry().with_resources(
        (schema["$id"], Resource.from_contents(schema))
        for schema in schemas.values()
        if isinstance(schema.get("$id"), str)
    )
    examples = sorted(CONTRACTS.glob("*.example.json"))
    for example_path in examples:
        schema_name = example_path.name.removesuffix(".example.json") + ".schema.json"
        schema = schemas.get(schema_name)
        if schema is None:
            fail(f"{example_path.name} has no matching {schema_name}")
        validator_class = validator_for(schema)
        validator = validator_class(
            schema,
            registry=registry,
            format_checker=FormatChecker(),
        )
        errors = sorted(
            validator.iter_errors(load_json(example_path)),
            key=lambda error: list(map(str, error.absolute_path)),
        )
        if errors:
            error = errors[0]
            location = ".".join(map(str, error.absolute_path)) or "<root>"
            fail(f"{example_path.name} at {location}: {error.message}")

    return schemas, len(examples)


def _schema_discriminators(schema: dict[str, Any], property_name: str) -> set[str]:
    values: set[str] = set()

    def visit(branch: dict[str, Any], seen: frozenset[str] = frozenset()) -> None:
        reference = branch.get("$ref")
        if isinstance(reference, str):
            if not reference.startswith("#/") or reference in seen:
                fail(f"unsupported or cyclic discriminator reference: {reference}")
            target: Any = schema
            for token in reference[2:].split("/"):
                token = token.replace("~1", "/").replace("~0", "~")
                target = target.get(token) if isinstance(target, dict) else None
            if not isinstance(target, dict):
                fail(f"unresolved discriminator reference: {reference}")
            visit(target, seen | {reference})
        value = branch.get("properties", {}).get(property_name, {}).get("const")
        if isinstance(value, str):
            values.add(value)
        for composition in ("oneOf", "anyOf", "allOf"):
            for child in branch.get(composition, []):
                visit(child, seen)

    visit(schema)
    return values


def validate_openapi() -> tuple[dict[str, Any], int, int]:
    try:
        with OPENAPI_PATH.open(encoding="utf-8") as source:
            document = yaml.load(source, Loader=UniqueKeyLoader)
    except (OSError, yaml.YAMLError, ValidationError) as error:
        fail(f"openapi.yaml could not be parsed: {error}")
    if not isinstance(document, dict):
        fail("openapi.yaml must contain a mapping")

    try:
        validate(document, base_uri=OPENAPI_PATH.as_uri())
    except Exception as error:
        fail(f"OpenAPI validation failed: {error}")

    operation_ids: set[str] = set()
    operation_count = 0
    for path, path_item in document.get("paths", {}).items():
        if not isinstance(path_item, dict):
            fail(f"OpenAPI path {path} must contain a mapping")
        expected_parameters = set(re.findall(r"{([^}]+)}", path))
        for method, operation in path_item.items():
            if method.lower() not in HTTP_METHODS:
                continue
            operation_count += 1
            operation_id = operation.get("operationId")
            if not isinstance(operation_id, str) or not operation_id:
                fail(f"{method.upper()} {path} is missing operationId")
            if operation_id in operation_ids:
                fail(f"duplicate OpenAPI operationId: {operation_id}")
            operation_ids.add(operation_id)
            if not operation.get("responses"):
                fail(f"{method.upper()} {path} is missing responses")

            parameters = list(path_item.get("parameters", []))
            parameters.extend(operation.get("parameters", []))
            resolved_path_parameters: set[str] = set()
            for parameter in parameters:
                if "$ref" in parameter:
                    reference = parameter["$ref"]
                    if reference.startswith("#/"):
                        target: Any = document
                        for token in reference[2:].split("/"):
                            token = token.replace("~1", "/").replace("~0", "~")
                            target = target.get(token) if isinstance(target, dict) else None
                        parameter = target
                if (
                    isinstance(parameter, dict)
                    and parameter.get("in") == "path"
                    and isinstance(parameter.get("name"), str)
                ):
                    resolved_path_parameters.add(parameter["name"])
            if resolved_path_parameters != expected_parameters:
                fail(
                    f"{method.upper()} {path} path parameters "
                    f"{sorted(resolved_path_parameters)} do not match "
                    f"{sorted(expected_parameters)}"
                )

    if operation_count == 0:
        fail("OpenAPI document contains no operations")

    for name, schema in document.get("components", {}).get("schemas", {}).items():
        if "$ref" not in schema:
            check_schema_document(OPENAPI_PATH, schema)

    prose_contract = CONTRACTS / "API_CONTRACTS.md"
    prose = prose_contract.read_text(encoding="utf-8")
    openapi_routes = {
        (method.upper(), f"/v1{path}")
        for path, path_item in document.get("paths", {}).items()
        for method in path_item
        if method.lower() in HTTP_METHODS
    }
    prose_routes = re.findall(
        r"^\|\s*`(GET|POST|PUT|PATCH|DELETE)\s+([^`]+)`\s*\|",
        prose,
        re.MULTILINE,
    )
    missing_routes = [
        (method, route)
        for method, route in prose_routes
        if (method, route) not in openapi_routes
        and route != "/v1/courses/{courseId}/permission-decisions"
    ]
    if missing_routes:
        fail(f"prose API routes missing from OpenAPI: {missing_routes}")

    return document, len(document.get("paths", {})), operation_count


def _assert_unique(values: list[Any], label: str) -> None:
    if len(values) != len(set(values)):
        fail(f"{label} must be unique")


def _assert_strictly_increasing(items: list[dict[str, Any]], label: str) -> None:
    thresholds = [item["minimumExp"] for item in items]
    if not thresholds or thresholds[0] != 0:
        fail(f"{label} must start at 0 EXP")
    if any(current <= previous for previous, current in zip(thresholds, thresholds[1:])):
        fail(f"{label} EXP thresholds must be strictly increasing")


def validate_taxonomy_and_rank() -> None:
    taxonomy = load_json(CONTRACTS / "learning-taxonomy.example.json")
    categories = taxonomy["categories"]
    tags = taxonomy["tags"]
    category_ids = [item["id"] for item in categories]
    tag_ids = [item["id"] for item in tags]
    _assert_unique(category_ids, "category IDs")
    _assert_unique(tag_ids, "tag IDs")

    category_by_id = {item["id"]: item for item in categories}
    tag_by_id = {item["id"]: item for item in tags}
    for category in categories:
        parent_id = category["parentId"]
        if parent_id is not None and parent_id not in category_by_id:
            fail(f"category {category['id']} references unknown parent {parent_id}")
        visited: set[str] = set()
        current = category
        while current["parentId"] is not None:
            current_id = current["id"]
            if current_id in visited:
                fail(f"category hierarchy contains a cycle at {current_id}")
            visited.add(current_id)
            current = category_by_id[current["parentId"]]

    for tag in tags:
        parent_id = tag["parentId"]
        if parent_id is not None and parent_id not in tag_by_id:
            fail(f"tag {tag['id']} references unknown parent {parent_id}")
        visited: set[str] = set()
        current = tag
        while current["parentId"] is not None:
            current_id = current["id"]
            if current_id in visited:
                fail(f"tag hierarchy contains a cycle at {current_id}")
            visited.add(current_id)
            current = tag_by_id[current["parentId"]]

    for filename in (
        "coding-question.example.json",
        "question-version.example.json",
        "lesson.example.json",
    ):
        record = load_json(CONTRACTS / filename)
        category_id = record.get("categoryId")
        if category_id is not None and category_id not in category_by_id:
            fail(f"{filename} references an unknown category")
        applicable_to = "lesson" if filename == "lesson.example.json" else "question"
        for tag_id in record["tagIds"]:
            tag = tag_by_id.get(tag_id)
            if tag is None or applicable_to not in tag["appliesTo"]:
                fail(f"{filename} references invalid or inapplicable tag {tag_id}")

    ranks = load_json(CONTRACTS / "teacher-rank-policy.example.json")["tracks"]
    _assert_strictly_increasing(ranks["student"], "student rank track")
    _assert_strictly_increasing(ranks["staff"], "staff rank track")
    for track_name, tiers in ranks.items():
        _assert_unique([tier["id"] for tier in tiers], f"{track_name} rank IDs")


def validate_question_and_scoring(schemas: dict[str, dict[str, Any]]) -> None:
    content_types = _schema_discriminators(
        schemas["question-content.schema.json"], "contentType"
    )
    config_types = _schema_discriminators(
        schemas["question-authoring-config.schema.json"], "configType"
    )
    if not content_types or content_types != config_types:
        fail(
            "question content/private config types differ: "
            f"{sorted(content_types)} vs {sorted(config_types)}"
        )

    version = load_json(CONTRACTS / "question-version.example.json")
    if (
        version["questionType"] != version["content"]["contentType"]
        or version["questionType"] != version["authoringConfig"]["configType"]
    ):
        fail("question-version example has mismatched content/config discriminators")
    taxonomy = load_json(CONTRACTS / "learning-taxonomy.example.json")
    category_ids = {item["id"] for item in taxonomy["categories"]}
    tag_by_id = {item["id"]: item for item in taxonomy["tags"]}
    if version["categoryId"] not in category_ids:
        fail("question-version example references an unknown category")
    for tag_id in version["tagIds"]:
        tag = tag_by_id.get(tag_id)
        if tag is None or "question" not in tag["appliesTo"]:
            fail(f"question-version example references invalid or inapplicable tag {tag_id}")

    config = version["authoringConfig"]
    if config["configType"] == "code":
        test_cases = config["testCases"]
        _assert_unique([case["testCaseId"] for case in test_cases], "code test case IDs")
        _assert_unique([case["position"] for case in test_cases], "code test case positions")
        points = sum(case["points"] for case in test_cases)
        if points != config["scoring"]["maximumPoints"]:
            fail("code test case points do not sum to scoring.maximumPoints")

    rubric = load_json(CONTRACTS / "writing-rubric.example.json")
    _assert_unique(
        [criterion["criterionId"] for criterion in rubric["criteria"]],
        "rubric criterion IDs",
    )
    _assert_unique(
        [criterion["position"] for criterion in rubric["criteria"]],
        "rubric criterion positions",
    )
    if sum(criterion["points"] for criterion in rubric["criteria"]) != rubric["maximumPoints"]:
        fail("writing rubric criterion points do not sum to maximumPoints")

    assessment = load_json(CONTRACTS / "assessment-version.example.json")
    _assert_unique(
        [item["position"] for item in assessment["items"]],
        "assessment item positions",
    )
    if (
        sum(item["maximumPoints"] for item in assessment["items"])
        != assessment["gradingPolicy"]["maximumPoints"]
    ):
        fail("assessment item points do not sum to gradingPolicy.maximumPoints")

    preferences_schema = schemas["user-preferences.schema.json"]
    preference_properties = preferences_schema["properties"]
    palette_ids = preference_properties["colorPalette"]["enum"]
    _assert_unique(palette_ids, "user preference palette IDs")
    if len(palette_ids) < 3:
        fail("user preferences must expose at least three selectable palettes")
    if set(preference_properties["locale"]["enum"]) != {"en", "vi"}:
        fail("user preference locales do not match the currently supported UI locales")
    if set(preference_properties["theme"]["enum"]) != {"light", "dark"}:
        fail("user preference themes must include light and dark")
    preference_example = load_json(CONTRACTS / "user-preferences.example.json")
    if preference_example["colorPalette"] not in palette_ids:
        fail("user preference example uses an unsupported palette")


def main() -> int:
    try:
        schemas, example_count = validate_json_schemas()
        openapi, path_count, operation_count = validate_openapi()
        validate_taxonomy_and_rank()
        validate_question_and_scoring(schemas)
    except (ValidationError, KeyError, TypeError, ValueError) as error:
        print(f"Contract validation failed: {error}", file=sys.stderr)
        return 1

    print(
        "Contract validation passed: "
        f"OpenAPI 3.1 ({path_count} paths, {operation_count} operations), "
        f"{len(schemas)} JSON Schemas, {example_count} examples, "
        "and cross-contract invariants."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
