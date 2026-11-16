"""Bounded public identity commands; never accept an Admin-supplied password."""

import re
import unicodedata
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Role = Literal[
    "student",
    "teacher",
    "teachingAssistant",
    "admin",
    "administrativeAssistant",
    "researchAssistant",
]
ProvisioningSource = Literal["legacy", "csv", "invitation", "bootstrap"]


def email_address(value: str) -> str:
    value = value.strip().lower()
    if (
        len(value) > 320
        or any(unicodedata.category(char) in {"Cc", "Cf", "Cs"} for char in value)
        or not re.fullmatch(r"[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+", value)
    ):
        raise ValueError("Invalid email")
    return value


def username_value(value: str) -> str:
    value = value.strip().lower()
    if not re.fullmatch(r"[a-z0-9._-]{3,128}", value):
        raise ValueError("Invalid username")
    return value


class Command(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Reason(Command):
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("reason")
    @classmethod
    def nonempty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Reason required")
        return value.strip()


class RoleChange(Reason):
    roles: list[Role] = Field(min_length=1, max_length=6)
    expectedRevision: int = Field(ge=1)

    @field_validator("roles")
    @classmethod
    def unique_roles(cls, value: list[Role]) -> list[Role]:
        if len(value) != len(set(value)):
            raise ValueError("Duplicate roles")
        return value


class InvitationRequest(Command):
    email: str
    role: Role
    courseId: str | None = None
    expiresAt: datetime | None = None

    _email = field_validator("email")(email_address)


class AcceptInvitation(Command):
    token: str = Field(min_length=40, max_length=128)
    username: str
    official_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=12, max_length=128)
    _username = field_validator("username")(username_value)


class CurrentPassword(Command):
    current_password: str = Field(min_length=1, max_length=1024)


class MfaCode(Command):
    code: str = Field(pattern=r"^[0-9]{6}$")


class MfaDisable(CurrentPassword, MfaCode):
    pass


class SetupToken(Command):
    setup_token: str = Field(min_length=32, max_length=128)


class SetupConfirm(SetupToken, MfaCode):
    pass


class RoleMfaPolicy(Reason):
    required: bool = Field(strict=True)


class CsvCreate(Command):
    importKind: Literal["users", "enrollments"]
    templateVersion: int = Field(ge=1)
    duplicatePolicy: Literal["upsert", "skip"]
    sourceFilename: str | None = Field(default=None, max_length=255)


class AccountExportRequest(Reason):
    kind: Literal["users", "enrollments"]
    format: Literal["csv", "xlsx"]
    query: str = Field(default="", max_length=200)
    role: Role | None = None
    status: Literal["active", "invited", "suspended", "closed"] | None = None
    courseId: str | None = Field(default=None, max_length=36)
    facultyId: str | None = Field(default=None, max_length=128)
    source: ProvisioningSource | None = None


class PasswordResetRequest(Command):
    email: str
    _email = field_validator("email")(email_address)


class PasswordResetComplete(Command):
    token: str = Field(min_length=40, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)

    @field_validator("new_password")
    @classmethod
    def nonblank_password(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Password required")
        return value


class ProfileChange(Command):
    expectedRevision: int = Field(ge=1)
    nickname: str | None = Field(default=None, max_length=100)
    contactEmail: str | None = None
    phone: str | None = Field(default=None, max_length=40)
    about: str = Field(default="", max_length=2000)
    academicTitle: str = Field(default="", max_length=120)
    showEmailInCourses: bool = Field(default=False, strict=True)

    @field_validator("phone", "about", "academicTitle")
    @classmethod
    def plain_text(cls, value: str | None) -> str | None:
        if value and any(
            unicodedata.category(char) in {"Cc", "Cf", "Cs"} and char not in "\n\r\t"
            for char in value
        ):
            raise ValueError("Unsupported control character")
        return value

    @field_validator("contactEmail")
    @classmethod
    def contact_email(cls, value: str | None) -> str | None:
        return email_address(value) if value and value.strip() else None


class IdentityPolicyChange(Reason):
    expectedRevision: int = Field(ge=0)
    nicknameCooldownDays: int = Field(ge=0, le=365)
    blockedTerms: list[str] = Field(max_length=200)

    @field_validator("blockedTerms")
    @classmethod
    def bounded_terms(cls, value: list[str]) -> list[str]:
        if any(not term.strip() or len(term) > 64 for term in value):
            raise ValueError("Blocked terms must be 1 to 64 characters")
        return value


class SupportProfileChange(Reason):
    expectedRevision: int = Field(ge=1)
    contactEmail: str | None = None
    phone: str | None = Field(default=None, max_length=40)
    about: str = Field(default="", max_length=2000)
    academicTitle: str = Field(default="", max_length=120)
    _text = field_validator("phone", "about", "academicTitle")(ProfileChange.plain_text)
    _email = field_validator("contactEmail")(ProfileChange.contact_email)
