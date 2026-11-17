"""Strict commands for versioned question authoring."""

import json
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .taxonomy_dto import stable_id

QuestionType = Literal[
    "code",
    "writing",
    "sentenceRewriting",
    "multipleChoice",
    "multipleSelect",
    "shortAnswer",
    "fillInTheBlank",
    "matching",
    "ordering",
    "trueFalseNotGiven",
    "readingSet",
    "listeningSet",
]
Difficulty = Literal["newbie", "noob", "wannabe", "gatekeeper", "legendary"]
UsageType = Literal["practice", "practical", "exam"]


class QuestionDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    questionType: QuestionType
    title: str = Field(min_length=1, max_length=240)
    prompt: str = Field(min_length=1, max_length=20000)
    categoryId: str = Field(min_length=1, max_length=128)
    difficulty: Difficulty
    language: str = Field(default="en", min_length=2, max_length=20)
    usageTypes: list[UsageType] = Field(min_length=1, max_length=3)
    tagIds: list[str] = Field(default_factory=list, max_length=50)
    content: dict[str, object]
    authoringConfig: dict[str, object] | None = None

    _category = field_validator("categoryId")(stable_id)
    _tags = field_validator("tagIds")(
        lambda values: (
            values
            if len(values) == len(set(values))
            and all(stable_id(value) == value for value in values)
            else (_ for _ in ()).throw(ValueError("Tags must be unique stable IDs"))
        )
    )

    @field_validator("language")
    @classmethod
    def valid_language(cls, value: str) -> str:
        if not re.fullmatch(r"[a-z]{2}(?:-[A-Z]{2})?", value):
            raise ValueError("Language must be a short BCP-47 tag")
        return value

    @field_validator("usageTypes")
    @classmethod
    def unique_usage_types(cls, values: list[UsageType]) -> list[UsageType]:
        if len(values) != len(set(values)):
            raise ValueError("Duplicate usage type")
        return values

    @field_validator("content", "authoringConfig")
    @classmethod
    def bounded_json(cls, value: dict[str, object] | None) -> dict[str, object] | None:
        if value is not None and len(json.dumps(value, ensure_ascii=False)) > 100_000:
            raise ValueError("Question configuration exceeds 100 KB")
        return value


class RuntimeProfileDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    profileId: str = Field(min_length=1, max_length=128)
    language: Literal["java", "c", "cpp", "python"]
    languageVersion: str = Field(min_length=1, max_length=80)
    compilerImage: str | None = Field(default=None, max_length=500)
    imageDigest: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    allowedLibraries: list[str] = Field(default_factory=list, max_length=100)
    resourceCaps: dict[str, int]
    sandbox: dict[str, object]

    @field_validator("profileId")
    @classmethod
    def stable_profile_id(cls, value: str) -> str:
        return stable_id(value)
