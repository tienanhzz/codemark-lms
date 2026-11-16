"""Draft 2020-12 schema validators for question content and private scoring data."""

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator  # type: ignore[import-untyped]
from referencing import Registry, Resource

SCHEMA_ROOT = Path(__file__).resolve().parent / "schemas"


@lru_cache(maxsize=1)
def validators() -> tuple[Draft202012Validator, Draft202012Validator, Draft202012Validator]:
    content = json.loads((SCHEMA_ROOT / "question-content.schema.json").read_text("utf-8"))
    authoring = json.loads(
        (SCHEMA_ROOT / "question-authoring-config.schema.json").read_text("utf-8")
    )
    rubric = json.loads((SCHEMA_ROOT / "writing-rubric.schema.json").read_text("utf-8"))
    registry = Registry().with_resource(rubric["$id"], Resource.from_contents(rubric))
    return (
        Draft202012Validator(content),
        Draft202012Validator(authoring, registry=registry),
        Draft202012Validator(rubric),
    )


def runtime_profile_errors(profile: dict[str, Any]) -> list[str]:
    schema = json.loads((SCHEMA_ROOT / "runtime-profile.schema.json").read_text("utf-8"))
    return [error.message for error in Draft202012Validator(schema).iter_errors(profile)]


def schema_errors(
    question_type: str, content: dict[str, Any], config: dict[str, Any] | None
) -> list[dict[str, str]]:
    content_validator, authoring_validator, _ = validators()
    errors: list[dict[str, str]] = []
    for validator, value, field in (
        (content_validator, content, "content"),
        (authoring_validator, config, "authoringConfig"),
    ):
        if value is None:
            errors.append({"path": field, "message": "Required for validation."})
            continue
        for error in validator.iter_errors(value):
            path = ".".join(str(part) for part in error.absolute_path)
            errors.append({"path": f"{field}.{path}" if path else field, "message": error.message})
    if content.get("contentType") != question_type:
        errors.append({"path": "content.contentType", "message": "Must match questionType."})
    if config is not None and config.get("configType") != question_type:
        errors.append({"path": "authoringConfig.configType", "message": "Must match questionType."})
    if question_type in {"multipleChoice", "multipleSelect"} and config is not None:
        choice_ids = [
            item.get("choiceId") for item in content.get("choices", []) if isinstance(item, dict)
        ]
        available = set(choice_ids)
        if len(available) != len(choice_ids):
            errors.append({"path": "content.choices", "message": "Choice IDs must be unique."})
        correct = config.get("correctChoiceIds", [])
        if not set(correct).issubset(available):
            errors.append({"path": "authoringConfig.correctChoiceIds", "message": "Every answer must reference a visible choice."})
        if question_type == "multipleChoice" and isinstance(correct, list) and len(correct) != 1:
            errors.append({"path": "authoringConfig.correctChoiceIds", "message": "Multiple choice requires exactly one correct answer."})
    if question_type == "fillInTheBlank" and config is not None and set(content.get("blankIds", [])) != {
        item.get("blankId") for item in config.get("blanks", []) if isinstance(item, dict)
    }:
        errors.append({"path": "authoringConfig.blanks", "message": "Blank IDs must match the visible prompt."})
    if question_type == "ordering" and config is not None:
        item_ids = [item.get("itemId") for item in content.get("items", []) if isinstance(item, dict)]
        visible = set(item_ids)
        if len(visible) != len(item_ids):
            errors.append({"path": "content.items", "message": "Item IDs must be unique."})
        correct_items = config.get("correctItemIds")
        if not isinstance(correct_items, list) or set(correct_items) != visible:
            errors.append({"path": "authoringConfig.correctItemIds", "message": "The answer must order every visible item exactly once."})
    if question_type == "matching" and config is not None:
        left_ids = [item.get("itemId") for item in content.get("leftItems", []) if isinstance(item, dict)]
        right_ids = [item.get("itemId") for item in content.get("rightItems", []) if isinstance(item, dict)]
        left, right = set(left_ids), set(right_ids)
        if len(left) != len(left_ids) or len(right) != len(right_ids):
            errors.append({"path": "content", "message": "Matching item IDs must be unique on each side."})
        pairs = config.get("pairs", [])
        if any(pair.get("leftItemId") not in left or pair.get("rightItemId") not in right for pair in pairs if isinstance(pair, dict)):
            errors.append({"path": "authoringConfig.pairs", "message": "Every pair must reference a visible item on each side."})
        if question_type == "matching" and config.get("scoringMode") == "allOrNothing" and len(pairs) != len(left):
            errors.append({"path": "authoringConfig.pairs", "message": "All-or-nothing matching must define an answer for every left item."})
    if question_type in {"readingSet", "listeningSet"} and config is not None:
        content_ids = content.get("childQuestionVersionIds", [])
        config_ids = [
            item.get("questionVersionId")
            for item in config.get("children", [])
            if isinstance(item, dict)
        ]
        if content_ids != config_ids:
            errors.append({"path": "authoringConfig.children", "message": "Child version references must match the visible set."})
    return sorted(errors, key=lambda item: (item["path"], item["message"]))
