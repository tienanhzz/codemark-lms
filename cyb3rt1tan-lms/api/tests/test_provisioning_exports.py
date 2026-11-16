"""Atomic CSV enrollment, provisioning boundaries and audited spreadsheet exports."""

import csv
import hashlib
import io
import zipfile
from datetime import timedelta
from xml.etree import ElementTree as ET

import pytest
from sqlalchemy import select
from test_access import ORIGIN, login
from test_courses import setup_course, staff_user
from test_identity_contracts import validate

from app import mail
from app.models import (
    AccountExport,
    AuditEvent,
    Course,
    CourseMembership,
    CsvImport,
    OutboxMessage,
    User,
    now,
)

ENROLLMENT_HEADER = "institutional_id,username,course_id,section_id,status\n"
USER_HEADER = "username,email,official_name,institutional_id,role,faculty_id,course_id,section_id\n"


def preview(client, headers, raw, kind="enrollments", version=1, policy="upsert"):
    response = client.post(
        "/v1/admin/csv-imports",
        headers=headers,
        json={"importKind": kind, "templateVersion": version, "duplicatePolicy": policy},
    )
    assert response.status_code == 201, response.text
    job = response.json()["jobId"]
    request_headers = {
        **headers,
        "Content-Type": "text/csv",
        "X-File-SHA256": hashlib.sha256(raw.encode()).hexdigest(),
    }
    reply = client.post(
        f"/v1/admin/csv-imports/{job}/preview", headers=request_headers, content=raw.encode()
    )
    assert reply.status_code == 200, reply.text
    request_headers.update(
        {
            "X-Preview-Token": reply.json()["previewToken"],
            "X-Confirm": "true",
            "X-Duplicate-Policy": policy,
        }
    )
    return job, reply.json(), request_headers


def commit(client, job, headers, raw):
    return client.post(f"/v1/admin/csv-imports/{job}/commit", headers=headers, content=raw.encode())


def export(client, headers, **kwargs):
    response = client.post(
        "/v1/admin/account-exports",
        headers=headers,
        json={"kind": "users", "format": "csv", "reason": "Institutional review", **kwargs},
    )
    assert response.status_code == 201, response.text
    validate("AccountExportCreated", response.json())
    return response.json()


def test_user_v2_faculty_course_invited_identity_and_no_raw_staging(clients, monkeypatch):
    admin, _, factory = clients
    headers, course, _ = setup_course(admin)
    monkeypatch.setattr(mail, "configured", lambda: False)
    raw = (
        USER_HEADER
        + f"new.student,new@example.test,New Student,S009,student,cs,{course['id']},A1\n"
    )
    job, result, rh = preview(admin, headers, raw, "users", 2)
    assert result["summary"]["create"] == 1
    response = commit(admin, job, rh, raw)
    assert response.status_code == 200, response.text
    assert response.json()["invitationDelivery"]["failed"] == 1
    validate("CsvImportStatus", admin.get("/v1/admin/csv-imports/" + job).json())
    with factory() as db:
        user = db.scalar(select(User).where(User.username == "new.student"))
        assert (
            user.status == "invited"
            and user.faculty_id == "cs"
            and user.provisioning_source == "csv"
        )
        member = db.get(CourseMembership, (course["id"], user.id))
        assert member.status == "invited" and member.source == "csv" and member.joined_at
        stored = db.get(CsvImport, job)
        assert stored.template_version == 2 and stored.import_kind == "users"
        assert "new@example.test" not in repr(stored.__dict__) and "New Student" not in repr(
            stored.__dict__
        )
    response = admin.get("/v1/admin/users?source=csv&facultyId=cs&courseId=" + course["id"])
    assert [item["username"] for item in response.json()["items"]] == ["new.student"]


def test_enrollment_upsert_skip_stale_replay_and_dates(clients):
    admin, _, factory = clients
    headers, course, _ = setup_course(admin)
    raw = ENROLLMENT_HEADER + f",student,{course['id']},A1,active\n"
    job, value, rh = preview(admin, headers, raw)
    assert value["summary"]["create"] == 1
    assert commit(admin, job, rh, raw).status_code == 200
    assert commit(admin, job, rh, raw).status_code == 409
    job, value, rh = preview(
        admin, headers, raw.replace("A1,active", "A2,withdrawn"), policy="skip"
    )
    assert value["summary"]["skip"] == 1
    assert commit(admin, job, rh, raw.replace("A1,active", "A2,withdrawn")).status_code == 200
    with factory() as db:
        user = db.scalar(select(User).where(User.username == "student"))
        member = db.get(CourseMembership, (course["id"], user.id))
        assert member.section_id == "A1" and member.status == "active" and member.ended_at is None
    withdrawn = raw.replace("A1,active", "A2,withdrawn")
    job, _, rh = preview(admin, headers, withdrawn)
    with factory.begin() as db:
        db.get(Course, course["id"]).title = "Changed after preview"
    assert commit(admin, job, rh, withdrawn).json()["error"]["code"] == "csv_preview_changed"
    job, _, rh = preview(admin, headers, withdrawn)
    assert commit(admin, job, rh, withdrawn).status_code == 200
    with factory() as db:
        member = db.scalar(select(CourseMembership))
        assert member.status == "withdrawn" and member.ended_at and member.revision > 1
        end_time = member.ended_at
    job, _, rh = preview(admin, headers, withdrawn)
    assert commit(admin, job, rh, withdrawn).status_code == 200
    with factory() as db:
        assert db.scalar(select(CourseMembership)).ended_at == end_time


@pytest.mark.parametrize(
    "suffix", ["teacher", "unknown", "bad-status", "duplicate", "archived", "conflict", "control"]
)
def test_enrollment_rejections_are_atomic_and_pii_free(clients, suffix):
    admin, _, factory = clients
    headers, course, _ = setup_course(admin)
    username, status, section = "student", "active", "A1"
    if suffix == "teacher":
        username = "admin"
    if suffix == "unknown":
        username = "missing"
    if suffix == "bad-status":
        status = "teacher"
    if suffix == "control":
        section = "bad\x00section"
    if suffix == "archived":
        with factory.begin() as db:
            db.get(Course, course["id"]).status = "archived"
    identity = "S-unknown" if suffix == "conflict" else ""
    raw = ENROLLMENT_HEADER + f"{identity},{username},{course['id']},{section},{status}\n"
    if suffix == "duplicate":
        raw += f",student,{course['id']},A2,active\n"
    job, value, rh = preview(admin, headers, raw)
    assert value["summary"]["reject"] > 0
    assert username not in str(value["rows"]) and "S-unknown" not in str(value["rows"])
    assert commit(admin, job, rh, raw).status_code == 409
    with factory() as db:
        assert not list(db.scalars(select(CourseMembership)))


def test_assistant_can_only_import_enrollments_and_permissions_are_live(clients):
    admin, assistant, factory = clients
    _headers, course, _ = setup_course(admin)
    staff_user(factory, "assistant", "administrativeAssistant")
    ah = login(assistant, "assistant")
    assert (
        assistant.post(
            "/v1/admin/csv-imports",
            headers=ah,
            json={"importKind": "users", "templateVersion": 1, "duplicatePolicy": "upsert"},
        ).status_code
        == 403
    )
    raw = ENROLLMENT_HEADER + f",student,{course['id']},A1,active\n"
    job, _, rh = preview(assistant, ah, raw)
    assert admin.get("/v1/admin/csv-imports/" + job).status_code == 404
    with factory.begin() as db:
        user = db.scalar(select(User).where(User.username == "assistant"))
        user.roles = ["student"]
    assert commit(assistant, job, rh, raw).status_code == 403
    assert assistant.get("/v1/admin/account-exports/missing").status_code in {403, 422}
    assert assistant.get("/v1/courses/" + course["id"] + "/enrollments").status_code == 404


def test_exports_download_csv_filters_formula_protection_and_audit(clients):
    admin, _, factory = clients
    headers = login(admin)
    with factory.begin() as db:
        user = db.scalar(select(User).where(User.username == "student"))
        user.official_name = '  =HYPERLINK("https://example.test")'
        user.provisioning_source = "csv"
    job = export(admin, headers, query="student@example.test", source="csv")
    assert job["rowCount"] == 1
    reply = admin.get(job["downloadPath"])
    assert reply.status_code == 200 and reply.headers["cache-control"] == "no-store"
    assert "attachment" in reply.headers["content-disposition"]
    rows = list(csv.reader(io.StringIO(reply.content.decode("utf-8-sig"))))
    assert rows[1][2].startswith("'  =")
    assert all(field not in rows[0] for field in ["password_hash", "contact_email", "mfa"])
    with factory() as db:
        stored = db.get(AccountExport, job["id"])
        assert "student@example.test" not in str(stored.__dict__) and "HYPERLINK" not in str(
            stored.snapshot
        )
        events = list(
            db.scalars(
                select(AuditEvent).where(
                    AuditEvent.action.in_(["account_export_created", "account_export_downloaded"])
                )
            )
        )
        assert len(events) == 2
        assert all(
            db.scalar(select(OutboxMessage).where(OutboxMessage.audit_event_id == event.id))
            for event in events
        )


def test_xlsx_export_preserves_text_and_contains_no_formulas_or_external_relationships(clients):
    admin, _, factory = clients
    headers = login(admin)
    with factory.begin() as db:
        user = db.scalar(select(User).where(User.username == "student"))
        user.institutional_id = "00123"
        user.official_name = "=1+1 <Unicode Ω>"
    job = export(admin, headers, format="xlsx", query="student")
    reply = admin.get(job["downloadPath"])
    assert reply.status_code == 200
    with zipfile.ZipFile(io.BytesIO(reply.content)) as archive:
        ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        worksheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        assert not worksheet.findall(".//m:f", ns)
        strings = [node.text for node in worksheet.findall(".//m:t", ns)]
        assert "00123" in strings and "=1+1 <Unicode Ω>" in strings
        assert all(node.attrib["t"] == "inlineStr" for node in worksheet.findall(".//m:c", ns))
        for name in archive.namelist():
            ET.fromstring(archive.read(name))
            if name.endswith(".rels"):
                assert b'TargetMode="External"' not in archive.read(name)


def test_exports_live_authorization_ownership_expiry_revision_and_limits(clients, monkeypatch):
    admin, student, factory = clients
    headers = login(admin)
    sh = login(student, "student")
    assert (
        student.post(
            "/v1/admin/account-exports",
            headers=sh,
            json={"kind": "users", "format": "csv", "reason": "test"},
        ).status_code
        == 403
    )
    assert (
        admin.post(
            "/v1/admin/account-exports",
            headers=ORIGIN,
            json={"kind": "users", "format": "csv", "reason": "test"},
        ).status_code
        == 403
    )
    job = export(admin, headers)
    with factory.begin() as db:
        user = db.scalar(select(User).where(User.username == "student"))
        user.email = "changed@example.test"
    assert admin.get(job["downloadPath"]).json()["error"]["code"] == "export_stale"
    job = export(admin, headers)
    with factory.begin() as db:
        db.get(AccountExport, job["id"]).expires_at = now() - timedelta(seconds=1)
    assert admin.get(job["downloadPath"]).status_code == 410
    job = export(admin, headers)
    with factory.begin() as db:
        other = db.scalar(select(User).where(User.username == "student"))
        other.roles = ["admin"]
    assert student.get(job["downloadPath"]).status_code == 404
    with factory.begin() as db:
        owner = db.scalar(select(User).where(User.username == "admin"))
        owner.roles = ["student"]
    assert admin.get(job["downloadPath"]).status_code == 403
    from app import account_exports

    monkeypatch.setattr(account_exports, "LIMIT", 1)
    response = student.post(
        "/v1/admin/account-exports",
        headers=sh,
        json={"kind": "users", "format": "csv", "reason": "test"},
    )
    assert response.status_code == 413


def test_enrollment_export_detects_section_changes(clients):
    admin, _, factory = clients
    headers, course, _ = setup_course(admin)
    raw = ENROLLMENT_HEADER + f",student,{course['id']},A1,active\n"
    job_id, _, rh = preview(admin, headers, raw)
    assert commit(admin, job_id, rh, raw).status_code == 200
    job = export(admin, headers, kind="enrollments", courseId=course["id"])
    assert job["rowCount"] == 1
    reply = admin.get(job["downloadPath"])
    assert reply.status_code == 200 and "enrollment_source" in reply.text and "A1" in reply.text
    with factory.begin() as db:
        db.scalar(select(CourseMembership)).section_id = "Changed"
    assert admin.get(job["downloadPath"]).json()["error"]["code"] == "export_stale"
