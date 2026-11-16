"""Bounded, plain-text inputs for BUILD-03; extra fields are rejected."""

import re
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=240)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)]
CatalogId = Annotated[str, StringConstraints(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$")]
RuleId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9._-]{0,63}$")]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)

    @model_validator(mode="after")
    def plain_text(self) -> "Input":
        def walk(value: object) -> None:
            if isinstance(value, str) and (
                re.search(r"<[^>]*>|!\[.*?\]\(", value) or "\x00" in value
            ):
                raise ValueError("Plain text required")
            if isinstance(value, dict):
                for child in value.values():
                    walk(child)
            if isinstance(value, list):
                for child in value:
                    walk(child)

        walk(self.model_dump())
        return self


class Module(Input):
    moduleCode: str = Field(default="", max_length=80)
    moduleName: str = Field(default="", max_length=240)
    level: str = Field(default="", max_length=80)
    unitOfCredit: float = Field(default=0, ge=0, le=1000)
    prerequisites: list[Text] = Field(default_factory=list, max_length=50)
    suggestedStudyHours: float = Field(default=0, ge=0, le=100000)
    objectives: list[Text] = Field(default_factory=list, max_length=50)
    year: str = Field(default="", max_length=40)
    nature: str = Field(default="", max_length=120)


class CourseCreate(Input):
    courseCode: Annotated[str, StringConstraints(min_length=1, max_length=80)]
    title: Text
    facultyId: CatalogId | None = None
    termId: CatalogId
    timezone: str = Field(min_length=1, max_length=64)
    module: Module = Field(default_factory=Module)


class CoursePatch(Input):
    title: Text | None = None
    facultyId: CatalogId | None = None
    termId: CatalogId | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    module: Module | None = None

    @model_validator(mode="after")
    def nonempty(self) -> "CoursePatch":
        if not self.model_fields_set or any(
            getattr(self, key) is None for key in self.model_fields_set if key != "facultyId"
        ):
            raise ValueError("Nonempty patch required")
        return self


class FacultyCreate(Input):
    facultyId: Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9._-]{0,127}$")]
    names: dict[str, Annotated[str, StringConstraints(min_length=1, max_length=160)]] = Field(
        min_length=1, max_length=20
    )
    sortOrder: int = Field(default=0, ge=0, le=100000)

    @field_validator("names")
    @classmethod
    def locales(cls, value: dict[str, str]) -> dict[str, str]:
        if any(not re.fullmatch(r"[a-z]{2}(?:-[A-Z]{2})?", key) for key in value):
            raise ValueError("Invalid locale")
        return value


class FacultyPatch(Input):
    names: dict[str, Annotated[str, StringConstraints(min_length=1, max_length=160)]] | None = (
        Field(default=None, min_length=1, max_length=20)
    )
    sortOrder: int | None = Field(default=None, ge=0, le=100000)
    status: Literal["active", "retired"] | None = None

    @field_validator("names")
    @classmethod
    def locales(cls, value: dict[str, str] | None) -> dict[str, str] | None:
        return FacultyCreate.locales(value) if value else value


class TermCreate(Input):
    termCode: CatalogId
    name: Text
    startsAt: datetime
    endsAt: datetime
    timezone: str = Field(min_length=1, max_length=64)


class TermPatch(Input):
    name: Text | None = None
    startsAt: datetime | None = None
    endsAt: datetime | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    status: Literal["active", "retired"] | None = None


class StaffGrant(Input):
    userId: UUID
    staffRole: Literal["teacher", "teachingAssistant"]
    ownerTransfer: bool = False
    reason: str = Field(default="", max_length=500)


class PermissionGrant(Input):
    userId: UUID
    permissionKey: str = Field(min_length=1, max_length=80)
    reason: Annotated[str, StringConstraints(min_length=1, max_length=2000)]
    startsAt: datetime | None = None
    expiresAt: datetime | None = None


class Enrollment(Input):
    userId: UUID
    sectionId: str | None = Field(default=None, max_length=128)
    status: Literal["invited", "active"] = "active"


class EnrollmentChange(Input):
    status: Literal["active", "withdrawn", "completed"]
    reason: Annotated[str, StringConstraints(min_length=1, max_length=500)]


class PlanEntry(Input):
    entryId: str | None = Field(default=None, min_length=1, max_length=64)
    week: Annotated[str, StringConstraints(min_length=1, max_length=80)]
    topic: Text
    content: LongText = ""
    reading: LongText = ""
    lessonVersionId: str | None = Field(default=None, max_length=64)
    outcomes: list[Text] = Field(default_factory=list, max_length=50)
    estimatedHours: float = Field(default=0, ge=0, le=10000)
    position: int = Field(ge=1, le=500)


class Plan(Input):
    entries: list[PlanEntry] = Field(max_length=100)


class SessionCreate(Input):
    startsAt: datetime
    endsAt: datetime
    timezone: str = Field(min_length=1, max_length=64)
    sectionId: str | None = Field(default=None, max_length=128)
    room: str | None = Field(default=None, max_length=240)
    onlineUrl: str | None = Field(default=None, max_length=2000)
    lessonPlanEntryId: str | None = Field(default=None, max_length=64)


class SessionSeriesCreate(SessionCreate):
    frequency: Literal["daily", "weekly"]
    interval: int = Field(default=1, ge=1, le=4)
    occurrences: int = Field(ge=2, le=52)


class SessionException(Input):
    reason: Annotated[str, StringConstraints(min_length=1, max_length=500)]
    status: Literal["scheduled", "cancelled"] | None = None
    startsAt: datetime | None = None
    endsAt: datetime | None = None
    room: str | None = Field(default=None, max_length=240)
    onlineUrl: str | None = Field(default=None, max_length=2000)
    lessonPlanEntryId: str | None = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def nonempty(self) -> "SessionException":
        if not any(key != "reason" for key in self.model_fields_set):
            raise ValueError("An exception change is required")
        return self


class GradeComponent(Input):
    componentId: Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9._-]{0,63}$")]
    name: Text
    weight: float = Field(ge=0, le=100)
    description: str = Field(default="", max_length=1000)


class GradeBand(Input):
    minimumScore: float = Field(ge=0, le=100)
    label: Annotated[str, StringConstraints(min_length=1, max_length=24)]


class GradeSchemeDraft(Input):
    components: list[GradeComponent] = Field(min_length=1, max_length=50)
    bands: list[GradeBand] = Field(min_length=2, max_length=20)

    @model_validator(mode="after")
    def valid_scheme(self) -> "GradeSchemeDraft":
        if len({item.componentId for item in self.components}) != len(self.components):
            raise ValueError("Duplicate component IDs")
        thresholds = [item.minimumScore for item in self.bands]
        if len(set(thresholds)) != len(thresholds) or 0 not in thresholds or 100 not in thresholds:
            raise ValueError("Grade bands must contain unique 0 and 100 thresholds")
        if len({item.label.casefold() for item in self.bands}) != len(self.bands):
            raise ValueError("Grade labels must be unique")
        return self


class CourseResource(Input):
    kind: Literal["learningResource", "usefulUrl", "software"]
    title: Text
    note: str = Field(default="", max_length=2000)
    coverage: str = Field(default="", max_length=1000)
    url: str | None = Field(default=None, max_length=2000)
    position: int = Field(ge=0, le=199)


class CourseResources(Input):
    items: list[CourseResource] = Field(max_length=200)

    @model_validator(mode="after")
    def unique_positions(self) -> "CourseResources":
        if len({item.position for item in self.items}) != len(self.items):
            raise ValueError("Duplicate resource positions")
        return self


class Rule(Input):
    ruleId: RuleId
    category: Literal[
        "attendance",
        "assignmentSubmission",
        "practice",
        "assessment",
        "classroomConduct",
        "communication",
        "other",
    ]
    title: Annotated[str, StringConstraints(min_length=1, max_length=160)]
    body: Annotated[str, StringConstraints(min_length=1, max_length=5000)]
    position: int = Field(ge=0, le=500)


class TemplateDraft(Input):
    rules: list[Rule] = Field(min_length=1, max_length=100)


class DisableRule(Input):
    ruleId: RuleId
    action: Literal["disable"]


class OverrideRule(Input):
    ruleId: RuleId
    action: Literal["override"]
    title: Annotated[str, StringConstraints(min_length=1, max_length=160)]
    body: Annotated[str, StringConstraints(min_length=1, max_length=5000)]


class RulesDraft(Input):
    expectedTemplateVersion: int = Field(ge=1)
    overrides: list[DisableRule | OverrideRule] = Field(max_length=100)
    customRules: list[Rule] = Field(max_length=100)
