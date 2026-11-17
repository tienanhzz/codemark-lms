"""Strict public commands for the lesson and question taxonomies."""

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TaxonomyCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")


def stable_id(value: str) -> str:
    value = value.strip()
    if not re.fullmatch(r"[a-z][a-z0-9-]{0,127}", value):
        raise ValueError("Use a stable lowercase slug")
    return value


def localized_names(value: dict[str, str]) -> dict[str, str]:
    names = {key: name.strip() for key, name in value.items()}
    if (
        not names
        or len(names) > 10
        or any(
            not re.fullmatch(r"[a-z]{2}(?:-[A-Z]{2})?", key) or not name or len(name) > 160
            for key, name in names.items()
        )
    ):
        raise ValueError("Provide nonempty localized names")
    return names


class TaxonomyNodeCreate(TaxonomyCommand):
    id: str = Field(min_length=1, max_length=128)
    names: dict[str, str]
    parentId: str | None = Field(default=None, max_length=128)
    sortOrder: int = Field(default=0, ge=0, le=100000)

    _id = field_validator("id")(stable_id)
    _parent = field_validator("parentId")(lambda value: stable_id(value) if value else value)
    _names = field_validator("names")(localized_names)


class TaxonomyNodePatch(TaxonomyCommand):
    names: dict[str, str] | None = None
    parentId: str | None = Field(default=None, max_length=128)
    status: Literal["active", "retired"] | None = None
    sortOrder: int | None = Field(default=None, ge=0, le=100000)

    _parent = field_validator("parentId")(lambda value: stable_id(value) if value else value)
    _names = field_validator("names")(lambda value: localized_names(value) if value else value)


class TaxonomyTagCreate(TaxonomyNodeCreate):
    selectable: bool = True
    applicability: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("applicability")
    @classmethod
    def unique_applicability(cls, values: list[str]) -> list[str]:
        if len(values) != len(set(values)) or any(
            not re.fullmatch(r"[a-z][a-zA-Z0-9_-]{0,39}", value) for value in values
        ):
            raise ValueError("Invalid or duplicate applicability")
        return values


class TaxonomyTagPatch(TaxonomyNodePatch):
    selectable: bool | None = None
    applicability: list[str] | None = Field(default=None, max_length=20)

    @field_validator("applicability")
    @classmethod
    def unique_applicability(cls, values: list[str] | None) -> list[str] | None:
        if values is not None and (
            len(values) != len(set(values))
            or any(not re.fullmatch(r"[a-z][a-zA-Z0-9_-]{0,39}", value) for value in values)
        ):
            raise ValueError("Invalid or duplicate applicability")
        return values


class TaxonomyMerge(TaxonomyCommand):
    targetId: str = Field(min_length=1, max_length=128)

    _target = field_validator("targetId")(stable_id)


class TaxonomySeedCategory(TaxonomyCommand):
    id: str = Field(min_length=1, max_length=128)
    name: dict[str, str]
    parentId: str | None = Field(default=None, max_length=128)
    sortOrder: int = Field(default=0, ge=0, le=100000)
    status: Literal["active"] = "active"

    _id = field_validator("id")(stable_id)
    _parent = field_validator("parentId")(lambda value: stable_id(value) if value else value)
    _name = field_validator("name")(localized_names)


class TaxonomySeedTag(TaxonomySeedCategory):
    appliesTo: list[Literal["lesson", "question"]] = Field(min_length=1, max_length=2)
    selectable: bool = True

    @field_validator("appliesTo")
    @classmethod
    def unique_scopes(
        cls, values: list[Literal["lesson", "question"]]
    ) -> list[Literal["lesson", "question"]]:
        if len(values) != len(set(values)):
            raise ValueError("Duplicate taxonomy scope")
        return values


class TaxonomySeed(TaxonomyCommand):
    expectedCatalogVersion: int = Field(ge=1)
    categories: list[TaxonomySeedCategory] = Field(max_length=200)
    tags: list[TaxonomySeedTag] = Field(max_length=500)


TaxonomyScope = Literal["content", "question"]
