"""Strict bounded validation for dormant internal runner envelopes."""

import json
import re
from functools import lru_cache
from pathlib import PurePosixPath
from typing import Any, cast

from jsonschema import Draft202012Validator, FormatChecker  # type: ignore[import-untyped]
from referencing import Registry, Resource

from .question_schemas import SCHEMA_ROOT

MAX_ENVELOPE_BYTES = 4_000_000
MAX_SOURCE_FILES = 20
MAX_FILE_BYTES = 1_048_576
MAX_TOTAL_SOURCE_BYTES = 3_000_000
RESERVED_NAMES = {"runner-control.json", "result.json", "metadata.json"}


@lru_cache(maxsize=1)
def runner_schema() -> dict[str, Any]:
    return cast(
        dict[str, Any],
        json.loads((SCHEMA_ROOT / "code-runner.schema.json").read_text(encoding="utf-8")),
    )


def validator(definition: str) -> Draft202012Validator:
    schema = runner_schema()
    return Draft202012Validator(
        {"$schema": schema["$schema"], "$ref": f"{schema['$id']}#/$defs/{definition}"},
        registry=Registry().with_resource(schema["$id"], Resource.from_contents(schema)),
        format_checker=FormatChecker() if definition == "result" else None,
    )


def canonical_json(value: dict[str, Any]) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )


def validate_job(value: object) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise TypeError("runner_job_invalid")
    errors = sorted(
        validator("job").iter_errors(value), key=lambda item: ".".join(map(str, item.absolute_path))
    )
    if errors:
        raise ValueError("runner_job_invalid")
    if len(canonical_json(value)) > MAX_ENVELOPE_BYTES:
        raise ValueError("runner_job_too_large")
    if not isinstance(value.get("jobId"), str) or not re.fullmatch(
        r"[A-Za-z0-9:._-]{1,36}", value["jobId"]
    ):
        raise ValueError("runner_job_id_invalid")
    if not re.fullmatch(r"[A-Za-z0-9:._-]{1,160}", value["idempotencyKey"]):
        raise ValueError("runner_idempotency_invalid")
    files = value["sourceFiles"]
    if len(files) > MAX_SOURCE_FILES:
        raise ValueError("runner_file_count_exceeded")
    seen: set[str] = set()
    total = 0
    for item in files:
        path = item["relativePath"]
        pure = PurePosixPath(path)
        folded_parts = [part.casefold() for part in pure.parts]
        if (
            "\\" in path
            or ":" in path
            or pure.is_absolute()
            or pure.as_posix() != path
            or any(part in {"", ".", ".."} for part in pure.parts)
            or any(ord(char) < 32 for char in path)
            or any(part in {".env", ".git"} for part in folded_parts)
            or pure.name.casefold() in RESERVED_NAMES
        ):
            raise ValueError("runner_source_path_invalid")
        key = "/".join(folded_parts)
        if key in seen:
            raise ValueError("runner_source_path_duplicate")
        seen.add(key)
        size = len(item["content"].encode("utf-8"))
        if size > MAX_FILE_BYTES:
            raise ValueError("runner_source_file_too_large")
        total += size
    if total > MAX_TOTAL_SOURCE_BYTES:
        raise ValueError("runner_source_total_too_large")
    return value


def validate_result(value: object) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise TypeError("runner_result_invalid")
    errors = sorted(
        validator("result").iter_errors(value),
        key=lambda item: ".".join(map(str, item.absolute_path)),
    )
    if errors or len(canonical_json(value)) > 256_000:
        raise ValueError("runner_result_invalid")
    if not isinstance(value.get("jobId"), str) or not re.fullmatch(
        r"[A-Za-z0-9:._-]{1,36}", value["jobId"]
    ):
        raise ValueError("runner_job_id_invalid")
    return value
