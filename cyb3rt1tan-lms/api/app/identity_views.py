"""Public response schemas shared with the master-kit contract and generated web DTOs."""

from typing import Literal

from pydantic import BaseModel


class AccountExportCreated(BaseModel):
    id: str
    kind: Literal["users", "enrollments"]
    format: Literal["csv", "xlsx"]
    rowCount: int
    expiresAt: str
    downloadPath: str


class RecoveryStatus(BaseModel):
    available: bool


class RecoveryRequested(BaseModel):
    message: str


class PersonalProfile(BaseModel):
    id: str
    username: str
    officialName: str
    email: str
    nickname: str | None
    roles: list[str]
    revision: int
    institutionalId: str | None
    contactEmail: str | None
    phone: str | None
    about: str
    academicTitle: str
    showEmailInCourses: bool
    nextNicknameChangeAt: str | None
    avatarUploadAvailable: bool
    avatarUrl: str | None = None


class SupportPerson(BaseModel):
    id: str
    username: str
    officialName: str
    institutionalId: str | None
    status: str


class SupportPersonList(BaseModel):
    items: list[SupportPerson]
    nextCursor: str | None


class SupportProfile(SupportPerson):
    revision: int
    contactEmail: str | None
    phone: str | None
    about: str
    academicTitle: str


class CourseStaffProfile(BaseModel):
    id: str
    officialName: str
    academicTitle: str
    role: Literal["teacher", "teachingAssistant"]
    owner: bool
    email: str | None
    avatarUrl: str | None
    courses: list[dict[str, str]]
    hasMoreCourses: bool = False


class CourseStaffProfiles(BaseModel):
    items: list[CourseStaffProfile]
    nextCursor: str | None


class IdentityPolicyView(BaseModel):
    revision: int
    nicknameCooldownDays: int
    blockedTerms: list[str]


class PersonalSession(BaseModel):
    id: str
    createdAt: str
    expiresAt: str
    current: bool
    mfaAuthenticated: bool


class PersonalSessionList(BaseModel):
    items: list[PersonalSession]
