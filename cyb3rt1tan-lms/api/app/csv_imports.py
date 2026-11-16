"""Checksum-bound Admin CSV previews and atomic, revision-checked user imports."""

import hashlib
import hmac
import secrets
from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .accounts import deliver, prepare_invitation
from .auth import DB, Provisioner, audit, lock_provisioner, revoke_sessions
from .identity_dto import CsvCreate, email_address, username_value
from .models import Course, CsvImport, Invitation, User, now
from .provisioning import (
    USER_HEADERS,
    analyze_enrollments,
    extras,
    read_csv,
    valid_columns,
    write_enrollment,
)
from .security import ROLES, digest, utc

router = APIRouter(prefix="/v1/admin/csv-imports")


def find_job(db: Session, job_id: UUID, actor: User) -> CsvImport:
    job = db.scalar(select(CsvImport).where(CsvImport.id == str(job_id)).with_for_update())
    if job is None or job.actor_id != actor.id:
        raise HTTPException(404, "import_not_found")
    if job.import_kind == "users" and "admin" not in actor.roles:
        raise HTTPException(403, "forbidden")
    return job


async def csv_body(request: Request) -> tuple[bytes, str]:
    if request.headers.get("content-type", "").split(";")[0] != "text/csv":
        raise HTTPException(400, "csv_content_type_required")
    raw = await request.body()
    if len(raw) > 1000000:
        raise HTTPException(413, "csv_too_large")
    checksum = hashlib.sha256(raw).hexdigest()
    if request.headers.get("x-file-sha256") != checksum:
        raise HTTPException(400, "csv_checksum_mismatch")
    return raw, checksum


def analyze(
    db: Session,
    raw: bytes,
    duplicate_policy: str,
    actor: User,
    kind: str = "users",
    version: int = 1,
) -> tuple[
    list[dict[str, object]], list[dict[str, object]], list[dict[str, object]], dict[str, int]
]:
    if kind == "enrollments":
        return analyze_enrollments(db, raw, duplicate_policy)
    rows = read_csv(
        raw,
        USER_HEADERS | {"faculty_id", "course_id", "section_id"} if version == 2 else USER_HEADERS,
    )
    normalized: list[dict[str, object]] = []
    outcomes: list[dict[str, object]] = []
    snapshots: list[dict[str, object]] = []
    seen: dict[str, set[str]] = {
        field: set() for field in ["username", "email", "institutional_id"]
    }
    summary = {"totalRows": len(rows), "create": 0, "update": 0, "skip": 0, "reject": 0}
    for number, row in enumerate(rows, 2):
        errors: list[str] = []
        account: User | None = None
        values: dict[str, object] = {}
        extra_snapshot: dict[str, object] = {}
        try:
            valid_columns(row)
            username = username_value(row["username"])
            email = email_address(row["email"])
            name = row["official_name"].strip()
            institutional = row["institutional_id"].strip()
            roles = row["role"].strip().split("|")
            if (
                not 1 <= len(name) <= 200
                or len(institutional) > 128
                or not set(roles) <= ROLES
                or len(roles) != len(set(roles))
            ):
                raise ValueError("Invalid identity fields")
            values = {
                "username": username,
                "email": email,
                "official_name": name,
                "institutional_id": institutional or None,
                "roles": roles,
            }
            for field, value in [
                ("username", username),
                ("email", email),
                ("institutional_id", institutional),
            ]:
                if value and value in seen[field]:
                    errors.append("duplicate_in_file")
                seen[field].add(value)
            by_name = db.scalar(select(User).where(User.username == username))
            by_id = (
                db.scalar(select(User).where(User.institutional_id == institutional))
                if institutional
                else None
            )
            account = by_id or by_name
            by_email = db.scalar(select(User).where(User.email == email))
            if by_id and by_name and by_id.id != by_name.id:
                errors.append("identity_conflict")
            if by_email and (account is None or account.id != by_email.id):
                errors.append("email_conflict")
            if account and account.status in {"suspended", "closed"}:
                errors.append("account_inactive")
            if account and account.id == actor.id and "admin" not in roles:
                errors.append("cannot_remove_own_admin")
            if version == 2:
                extra_values, extra_snapshot = extras(db, row, account, roles)
                values.update(extra_values)
        except (ValueError, TypeError, KeyError):
            errors.append("invalid_row")
        action = (
            "reject"
            if errors
            else "create"
            if account is None
            else "skip"
            if duplicate_policy == "skip"
            else "update"
        )
        summary[action] += 1
        outcomes.append({"rowNumber": number, "action": action, "errorCodes": sorted(set(errors))})
        snapshots.append(
            {
                "userId": account.id if account else None,
                "revision": account.revision if account else None,
                "action": action,
                **extra_snapshot,
            }
        )
        normalized.append(values)
    return normalized, outcomes, snapshots, summary


@router.post("", status_code=201)
def create(body: CsvCreate, request: Request, db: DB, user: Provisioner) -> dict[str, object]:
    lock_provisioner(db, request, user, body.importKind)
    if body.templateVersion not in ({1, 2} if body.importKind == "users" else {1}):
        raise HTTPException(400, "unsupported_template")
    job = CsvImport(
        actor_id=user.id,
        duplicate_policy=body.duplicatePolicy,
        import_kind=body.importKind,
        template_version=body.templateVersion,
        expires_at=now() + timedelta(minutes=30),
    )
    db.add(job)
    db.flush()
    audit(db, request, "csv_import_created", user, {"jobId": job.id})
    return {
        "jobId": job.id,
        "status": "created",
        "expiresAt": utc(job.expires_at).isoformat(),
        "upload": {
            "method": "POST",
            "path": f"/v1/admin/csv-imports/{job.id}/preview",
            "contentType": "text/csv",
            "maximumBytes": 1000000,
        },
    }


@router.post("/{job_id}/preview")
async def preview(job_id: UUID, request: Request, db: DB, user: Provisioner) -> dict[str, object]:
    lock_provisioner(db, request, user, "enrollments")
    job = find_job(db, job_id, user)
    if job.status == "committed" or utc(job.expires_at) <= now():
        raise HTTPException(409, "import_expired_or_committed")
    raw, checksum = await csv_body(request)
    _, outcomes, snapshot, counts = analyze(
        db, raw, job.duplicate_policy, user, job.import_kind, job.template_version
    )
    token = secrets.token_urlsafe(48)
    job.status, job.checksum, job.preview_digest = "previewed", checksum, digest(token)
    job.outcomes, job.snapshot, job.summary = outcomes, snapshot, counts
    job.expires_at = min(utc(job.expires_at), now() + timedelta(minutes=10))
    audit(db, request, "csv_import_previewed", user, {"jobId": job.id})
    return {
        "jobId": job.id,
        "previewToken": token,
        "fileChecksum": checksum,
        "duplicatePolicy": job.duplicate_policy,
        "summary": counts,
        "rows": outcomes,
        "expiresAt": utc(job.expires_at).isoformat(),
    }


@router.post("/{job_id}/commit")
async def commit(job_id: UUID, request: Request, db: DB, user: Provisioner) -> dict[str, object]:
    lock_provisioner(db, request, user, "enrollments")
    job = find_job(db, job_id, user)
    raw, checksum = await csv_body(request)
    if (
        job.status != "previewed"
        or utc(job.expires_at) <= now()
        or checksum != job.checksum
        or not job.preview_digest
        or not hmac.compare_digest(
            digest(request.headers.get("x-preview-token", "")), job.preview_digest
        )
        or request.headers.get("x-duplicate-policy") != job.duplicate_policy
        or request.headers.get("x-confirm") != "true"
    ):
        raise HTTPException(409, "invalid_or_expired_preview")
    values, outcomes, snapshot, counts = analyze(
        db, raw, job.duplicate_policy, user, job.import_kind, job.template_version
    )
    if counts["reject"] or snapshot != job.snapshot or outcomes != job.outcomes:
        raise HTTPException(409, "csv_preview_changed")
    invitations = []
    for data, row in zip(values, snapshot, strict=True):
        if row["action"] == "skip":
            continue
        selected = db.get(User, row["userId"]) if row["userId"] else None
        if job.import_kind == "enrollments":
            assert selected is not None
            course = db.get(Course, str(data["course_id"]))
            assert course is not None
            write_enrollment(
                db,
                course,
                selected,
                str(data["status"]),
                str(data["section_id"]) if data["section_id"] is not None else None,
                "csv",
            )
            audit(
                db,
                request,
                "csv_enrollment_applied",
                user,
                {
                    "jobId": job.id,
                    "courseId": course.id,
                    "userId": selected.id,
                    "status": str(data["status"]),
                },
            )
            db.flush()
            continue
        if selected is None:
            selected = User(
                username=str(data["username"]),
                email=str(data["email"]),
                official_name=str(data["official_name"]),
                institutional_id=data["institutional_id"],
                roles=[str(role) for role in data["roles"]]
                if isinstance(data["roles"], list)
                else [],
                status="invited",
                password_hash="",
                provisioning_source="csv",
            )
            db.add(selected)
            db.flush()
            audit(
                db,
                request,
                "csv_account_created",
                user,
                {"jobId": job.id, "userId": selected.id, "roles": selected.roles},
            )
            invitations.append(
                prepare_invitation(db, selected.email, selected.roles[0], user, selected.id)
            )
        else:
            before_roles = list(selected.roles)
            for field in ["username", "email", "official_name", "institutional_id", "roles"]:
                setattr(selected, field, data[field])
            selected.provisioning_source = "csv"
            revoke_sessions(db, selected)
            if selected.status == "invited":
                for old_invitation in db.scalars(
                    select(Invitation).where(
                        Invitation.user_id == selected.id,
                        Invitation.consumed_at.is_(None),
                        Invitation.revoked_at.is_(None),
                    )
                ):
                    old_invitation.revoked_at = now()
                db.flush()
                invitations.append(
                    prepare_invitation(db, selected.email, selected.roles[0], user, selected.id)
                )
            audit(
                db,
                request,
                "csv_account_updated",
                user,
                {
                    "jobId": job.id,
                    "userId": selected.id,
                    "beforeRoles": before_roles,
                    "afterRoles": selected.roles,
                },
            )
        if job.template_version == 2:
            selected.faculty_id = (
                str(data["faculty_id"]) if data["faculty_id"] is not None else None
            )
            if data["course_id"]:
                course = db.get(Course, str(data["course_id"]))
                assert course is not None
                write_enrollment(
                    db,
                    course,
                    selected,
                    "active" if selected.status == "active" else "invited",
                    str(data["section_id"]) if data["section_id"] is not None else None,
                    "csv",
                )
                audit(
                    db,
                    request,
                    "csv_enrollment_applied",
                    user,
                    {"jobId": job.id, "courseId": course.id, "userId": selected.id},
                )
        db.flush()
    job.status, job.committed_at, job.preview_digest = "committed", now(), None
    job.summary = counts
    audit(db, request, "csv_import_committed", user, {"jobId": job.id, "summary": counts})
    db.commit()
    sent = sum(deliver(db, request, invitation, token, user) for invitation, token in invitations)
    return {
        "jobId": job.id,
        "status": "committed",
        "summary": counts,
        "invitationDelivery": {"sent": sent, "failed": len(invitations) - sent},
        "committedAt": utc(job.committed_at).isoformat() if job.committed_at else None,
    }


@router.get("/{job_id}")
def status(job_id: UUID, request: Request, db: DB, user: Provisioner) -> dict[str, object]:
    lock_provisioner(db, request, user, "enrollments")
    job = find_job(db, job_id, user)
    return {
        "jobId": job.id,
        "status": job.status,
        "importKind": job.import_kind,
        "templateVersion": job.template_version,
        "summary": job.summary,
        "expiresAt": utc(job.expires_at).isoformat(),
        "committedAt": utc(job.committed_at).isoformat() if job.committed_at else None,
    }
