"""Strict payloads for versioned assignment and exam authoring."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ManualSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["manual"]


class TagSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["tags"]
    tagIds: list[str] = Field(min_length=1, max_length=100)
    match: Literal["any", "all"]

    @model_validator(mode="after")
    def unique_tags(self) -> "TagSelection":
        if len(set(self.tagIds)) != len(self.tagIds):
            raise ValueError("duplicate_tag")
        return self


class AssessmentDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["assignment", "exam"]
    title: str = Field(min_length=1, max_length=240)
    instructions: str = Field(default="", max_length=10000)
    timezone: str = Field(min_length=1, max_length=64)
    opensAt: datetime | None = None
    closesAt: datetime | None = None
    durationMinutes: int | None = Field(default=None, ge=1, le=1440)
    attemptLimit: int = Field(default=1, ge=1, le=20)
    latePenaltyTiers: list["LatePenaltyTier"] = Field(default_factory=list, max_length=20)
    questionVersionIds: list[str] = Field(default_factory=list, max_length=100)
    selection: ManualSelection | TagSelection | None = Field(default=None, discriminator="mode")

    @model_validator(mode="after")
    def validate_range(self) -> "AssessmentDraft":
        if self.opensAt is not None and self.closesAt is not None:
            if self.opensAt.tzinfo is None or self.closesAt.tzinfo is None:
                raise ValueError("schedule_requires_timezone")
            if self.closesAt <= self.opensAt:
                raise ValueError("invalid_schedule")
        if isinstance(self.selection, TagSelection):
            if self.questionVersionIds:
                raise ValueError("tag_selection_cannot_include_manual_questions")
        elif not self.questionVersionIds:
            raise ValueError("manual_selection_requires_questions")
        if len(set(self.questionVersionIds)) != len(self.questionVersionIds):
            raise ValueError("duplicate_question_version")
        thresholds = [tier.afterMinutes for tier in self.latePenaltyTiers]
        if thresholds != sorted(set(thresholds)):
            raise ValueError("late_penalty_tiers_must_increase")
        return self


class LatePenaltyTier(BaseModel):
    model_config = ConfigDict(extra="forbid")
    afterMinutes: int = Field(ge=1, le=43200)
    penaltyPercent: float = Field(ge=0, le=100)


class GradeDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pointsAwarded: float = Field(ge=0)
    criterionScores: dict[str, float] = Field(default_factory=dict, max_length=50)
    feedback: str = Field(default="", max_length=5000)


class AttemptAnswers(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answers: dict[str, object] = Field(max_length=100)
