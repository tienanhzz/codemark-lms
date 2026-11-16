"""Bounded, actor-owned identifying exports. Persist IDs/revisions, never exported PII/files."""

import csv
import io
import unicodedata
import zipfile
from datetime import timedelta
from uuid import UUID
from xml.etree.ElementTree import Element, SubElement, tostring

from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import String, cast, func, or_, select, tuple_
from sqlalchemy.orm import Session

from .auth import DB, Admin, audit, lock_admin
from .identity_dto import AccountExportRequest
from .identity_views import AccountExportCreated
from .models import AccountExport, Course, CourseMembership, User, now
from .security import utc

router = APIRouter(prefix="/v1/admin/account-exports")
LIMIT = 10000
USER_COLUMNS = [
    "institutional_id",
    "username",
    "official_name",
    "email",
    "roles",
    "status",
    "faculty_id",
    "source",
]
ENROLLMENT_COLUMNS = USER_COLUMNS + [
    "course_id",
    "course_code",
    "section_id",
    "enrollment_status",
    "enrollment_source",
    "joined_at",
    "ended_at",
]


def selected_rows(
    db: Session, body: AccountExportRequest
) -> list[tuple[User, CourseMembership | None, Course | None]]:
    statement = select(User)
    if body.query.strip():
        term = (
            "%"
            + body.query.strip()
            .lower()
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
            + "%"
        )
        statement = statement.where(
            or_(
                *[
                    func.lower(field).like(term, escape="\\")
                    for field in [
                        User.username,
                        User.email,
                        User.official_name,
                        User.institutional_id,
                    ]
                ]
            )
        )
    if body.role:
        statement = statement.where(
            cast(User.roles, String).contains('"' + body.role + '"', autoescape=True)
        )
    for field, value in [
        (User.status, body.status),
        (User.faculty_id, body.facultyId),
        (User.provisioning_source, body.source),
    ]:
        if value is not None:
            statement = statement.where(field == value)
    if body.kind == "users":
        if body.courseId:
            statement = statement.where(
                User.id.in_(
                    select(CourseMembership.user_id).where(
                        CourseMembership.course_id == body.courseId,
                        CourseMembership.status.in_(["active", "invited"]),
                    )
                )
            )
        return [
            (user, None, None) for user in db.scalars(statement.order_by(User.id).limit(LIMIT + 1))
        ]
    joined = statement.join(CourseMembership, CourseMembership.user_id == User.id).join(
        Course, Course.id == CourseMembership.course_id
    )
    if body.courseId:
        joined = joined.where(Course.id == body.courseId)
    result = db.execute(
        joined.with_only_columns(User, CourseMembership, Course)
        .order_by(User.id, Course.id)
        .limit(LIMIT + 1)
    )
    return [(user, member, course) for user, member, course in result]


def manifest(
    rows: list[tuple[User, CourseMembership | None, Course | None]],
) -> list[dict[str, object]]:
    return [
        {
            "userId": user.id,
            "revision": user.revision,
            "courseId": course.id if course else None,
            "courseRevision": course.revision if course else None,
            "membershipRevision": member.revision if member else None,
        }
        for user, member, course in rows
    ]


def view(job: AccountExport) -> dict[str, object]:
    return {
        "id": job.id,
        "kind": job.kind,
        "format": job.format,
        "rowCount": len(job.snapshot),
        "expiresAt": utc(job.expires_at).isoformat(),
        "downloadPath": f"/v1/admin/account-exports/{job.id}/download",
    }


@router.post("", status_code=201, response_model=AccountExportCreated)
def create(body: AccountExportRequest, request: Request, db: DB, user: Admin) -> dict[str, object]:
    lock_admin(db, request, user)
    rows = selected_rows(db, body)
    if len(rows) > LIMIT:
        raise HTTPException(413, "export_too_many_rows")
    job = AccountExport(
        actor_id=user.id,
        kind=body.kind,
        format=body.format,
        filters=body.model_dump(exclude={"query", "reason", "kind", "format"}),
        snapshot=manifest(rows),
        expires_at=now() + timedelta(minutes=15),
    )
    db.add(job)
    db.flush()
    audit(
        db,
        request,
        "account_export_created",
        user,
        {
            "exportId": job.id,
            "kind": job.kind,
            "format": job.format,
            "rowCount": len(rows),
            "reason": body.reason,
        },
    )
    return view(job)


def find_job(db: Session, job_id: UUID, user: User) -> AccountExport:
    job = db.get(AccountExport, str(job_id))
    if job is None or job.actor_id != user.id:
        raise HTTPException(404, "export_not_found")
    if utc(job.expires_at) <= now():
        raise HTTPException(410, "export_expired")
    return job


@router.get("/{job_id}", response_model=AccountExportCreated)
def status(job_id: UUID, request: Request, db: DB, user: Admin) -> dict[str, object]:
    lock_admin(db, request, user)
    return view(find_job(db, job_id, user))


def live_rows(
    db: Session, job: AccountExport
) -> list[tuple[User, CourseMembership | None, Course | None]]:
    ids = {str(item["userId"]) for item in job.snapshot}
    users = {user.id: user for user in db.scalars(select(User).where(User.id.in_(ids)))}
    courses = {
        course.id: course
        for course in db.scalars(
            select(Course).where(
                Course.id.in_({str(item["courseId"]) for item in job.snapshot if item["courseId"]})
            )
        )
    }
    pairs = [
        (str(item["userId"]), str(item["courseId"])) for item in job.snapshot if item["courseId"]
    ]
    members = {
        (item.user_id, item.course_id): item
        for item in db.scalars(
            select(CourseMembership).where(
                tuple_(CourseMembership.user_id, CourseMembership.course_id).in_(pairs)
            )
        )
    }
    rows = []
    for item in job.snapshot:
        user = users.get(str(item["userId"]))
        course = courses.get(str(item["courseId"])) if item["courseId"] else None
        member = (
            members.get((str(item["userId"]), str(item["courseId"]))) if item["courseId"] else None
        )
        if user is None or (job.kind == "enrollments" and (course is None or member is None)):
            raise HTTPException(409, "export_stale")
        rows.append((user, member, course))
    if manifest(rows) != job.snapshot:
        raise HTTPException(409, "export_stale")
    return rows


def cells(rows: list[tuple[User, CourseMembership | None, Course | None]]) -> list[list[str]]:
    result = []
    for user, item, course in rows:
        values = [
            user.institutional_id or "",
            user.username,
            user.official_name,
            user.email,
            "|".join(user.roles),
            user.status,
            user.faculty_id or "",
            user.provisioning_source,
        ]
        if item and course:
            values += [
                course.id,
                course.code,
                item.section_id or "",
                item.status,
                item.source,
                utc(item.joined_at).isoformat() if item.joined_at else "",
                utc(item.ended_at).isoformat() if item.ended_at else "",
            ]
        result.append(values)
    return result


def csv_safe(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).lstrip("\ufeff").lstrip()
    return (
        "'" + value
        if (normalized.startswith(("=", "+", "-", "@")) or value.startswith(("\t", "\r", "\n")))
        else value
    )


def csv_bytes(rows: list[list[str]]) -> bytes:
    buffer = io.StringIO(newline="")
    csv.writer(buffer).writerows([[csv_safe(value) for value in row] for row in rows])
    return buffer.getvalue().encode("utf-8-sig")


def xlsx_bytes(rows: list[list[str]]) -> bytes:
    ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    worksheet = Element("worksheet", xmlns=ns)
    data = SubElement(worksheet, "sheetData")
    for index, values in enumerate(rows, 1):
        row = SubElement(data, "row", r=str(index))
        for value in values:
            cell = SubElement(row, "c", t="inlineStr")
            text = SubElement(SubElement(cell, "is"), "t", {"xml:space": "preserve"})
            text.text = "".join(
                char
                for char in value
                if char in "\n\r\t"
                or (
                    ord(char) >= 32
                    and ord(char) not in {0xFFFE, 0xFFFF}
                    and not 0xD800 <= ord(char) <= 0xDFFF
                )
            )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "[Content_Types].xml",
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
        )
        archive.writestr(
            "_rels/.rels",
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        )
        archive.writestr(
            "xl/workbook.xml",
            f'<workbook xmlns="{ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Accounts" sheetId="1" r:id="rId1"/></sheets></workbook>',
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        )
        archive.writestr(
            "xl/worksheets/sheet1.xml", tostring(worksheet, encoding="utf-8", xml_declaration=True)
        )
    return buffer.getvalue()


@router.get("/{job_id}/download")
def download(job_id: UUID, request: Request, db: DB, user: Admin) -> Response:
    lock_admin(db, request, user)
    job = find_job(db, job_id, user)
    rows = live_rows(db, job)
    values = [ENROLLMENT_COLUMNS if job.kind == "enrollments" else USER_COLUMNS] + cells(rows)
    data = csv_bytes(values) if job.format == "csv" else xlsx_bytes(values)
    audit(
        db,
        request,
        "account_export_downloaded",
        user,
        {"exportId": job.id, "kind": job.kind, "rowCount": len(rows)},
    )
    return Response(
        data,
        media_type="text/csv; charset=utf-8"
        if job.format == "csv"
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="codemark-{job.id}.{job.format}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
