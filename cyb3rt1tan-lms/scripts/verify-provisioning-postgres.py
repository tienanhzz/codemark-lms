"""Guarded provisioning/export integration; concurrent import commit, no real mail."""

import csv
import hashlib
import io
import json
import os
import sys
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch
from xml.etree import ElementTree as ET

from dotenv import load_dotenv
from sqlalchemy import make_url, select

root = Path(__file__).resolve().parents[1]
load_dotenv(root / ".env")
target = os.environ["TEST_DATABASE_URL"]
if make_url(target).database != "codemark_lms_test" or target == os.environ["DATABASE_URL"]:
    raise SystemExit("Provisioning integration requires codemark_lms_test.")
os.environ.update(DATABASE_URL=target, MIGRATION_DATABASE_URL=target, SMTP_APPROVED="false")
sys.path.insert(0, str(root / "api"))
from fastapi.testclient import TestClient
from app.database import SessionLocal
from app.main import app
from app.models import AcademicTerm, AccountExport, AuditEvent, Course, CourseMembership, CsvImport, Faculty, OutboxMessage, User
from app.security import passwords

origin = {"Origin": "http://127.0.0.1:3100"}
password = "Build01-test-workspace-only!"
suffix = uuid.uuid4().hex[:10]
student_name, assistant_name = "qa.provision.student." + suffix, "qa.provision.assistant." + suffix
with SessionLocal.begin() as db:
    admin_id = db.scalar(select(User.id).where(User.username == "qa.admin"))
    assert admin_id
    faculty = Faculty(id="qa-faculty-" + suffix, names={"en": "QA Faculty", "vi": "QA"})
    term = AcademicTerm(id="qa-term-" + suffix, name="QA Term", starts_at=datetime(2026, 1, 1, tzinfo=UTC),
                        ends_at=datetime(2026, 12, 31, tzinfo=UTC), timezone="UTC")
    db.add_all([faculty, term])
    db.flush()
    course = Course(code="QA-PROVISION-" + suffix, title="QA Provisioning", owner_id=admin_id,
                    term_id=term.id, faculty_id=faculty.id, timezone="UTC")
    student = User(username=student_name, email=student_name + "@example.test", official_name="=1+1 <QA>",
                   institutional_id="001-" + suffix, roles=["student"], password_hash=passwords.hash(password))
    assistant = User(username=assistant_name, email=assistant_name + "@example.test", official_name="QA Assistant",
                     roles=["administrativeAssistant"], password_hash=passwords.hash(password))
    db.add_all([course, student, assistant])
    db.flush()
    course_id, student_id, faculty_id = course.id, student.id, faculty.id

with TestClient(app) as admin, TestClient(app) as assistant:
    for client, username in [(admin, "qa.admin"), (assistant, assistant_name)]:
        assert client.post("/v1/auth/login", headers=origin, json={"username": username, "password": password}).status_code == 200
    ah = {**origin, "X-CSRF-Token": admin.cookies["lms_csrf"]}
    sh = {**origin, "X-CSRF-Token": assistant.cookies["lms_csrf"]}

    def preview(client, headers, raw, kind, version=1):
        response = client.post("/v1/admin/csv-imports", headers=headers,
            json={"importKind": kind, "templateVersion": version, "duplicatePolicy": "upsert"})
        assert response.status_code == 201, response.text
        job_id = response.json()["jobId"]
        rh = {**headers, "Content-Type": "text/csv", "X-File-SHA256": hashlib.sha256(raw.encode()).hexdigest()}
        response = client.post(f"/v1/admin/csv-imports/{job_id}/preview", headers=rh, content=raw.encode())
        assert response.status_code == 200 and response.json()["summary"]["reject"] == 0, response.text
        rh.update({"X-Preview-Token": response.json()["previewToken"], "X-Confirm": "true", "X-Duplicate-Policy": "upsert"})
        return job_id, rh

    raw = f"institutional_id,username,course_id,section_id,status\n,{student_name},{course_id},A1,active\n"
    job_id, rh = preview(assistant, sh, raw, "enrollments")
    def commit(_):
        with TestClient(app) as concurrent:
            concurrent.cookies.update(assistant.cookies)
            return concurrent.post(f"/v1/admin/csv-imports/{job_id}/commit", headers=rh, content=raw.encode()).status_code
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = sorted(executor.map(commit, range(2)))
    assert results == [200, 409], results
    assert assistant.get("/v1/courses/" + course_id + "/enrollments").status_code == 404
    assert assistant.post("/v1/admin/csv-imports", headers=sh,
        json={"importKind": "users", "templateVersion": 1, "duplicatePolicy": "upsert"}).status_code == 403

    new_name = "qa.imported." + suffix
    users_raw = "username,email,official_name,institutional_id,role,faculty_id,course_id,section_id\n" + f"{new_name},{new_name}@example.test,QA Invited,S-{suffix},student,{faculty_id},{course_id},B2\n"
    user_job, user_rh = preview(admin, ah, users_raw, "users", 2)
    with patch("app.mail.smtplib.SMTP", side_effect=AssertionError("SMTP transport must not be called")):
        response = admin.post(f"/v1/admin/csv-imports/{user_job}/commit", headers=user_rh, content=users_raw.encode())
    assert response.status_code == 200 and response.json()["invitationDelivery"]["failed"] == 1, response.text
    assert admin.get(f"/v1/admin/users?source=csv&facultyId={faculty_id}").json()["items"][0]["username"] == new_name

    export_ids = []
    for kind, format in [("users", "csv"), ("users", "xlsx"), ("enrollments", "csv")]:
        response = admin.post("/v1/admin/account-exports", headers=ah, json={
            "kind": kind, "format": format, "query": student_name, "reason": "Isolated QA review"})
        assert response.status_code == 201, response.text
        job = response.json()
        export_ids.append(job["id"])
        assert job["rowCount"] == 1
        downloaded = admin.get(job["downloadPath"])
        assert downloaded.status_code == 200 and downloaded.headers["cache-control"] == "no-store"
        assert assistant.get(job["downloadPath"]).status_code == 403
        if format == "csv":
            rows = list(csv.reader(io.StringIO(downloaded.content.decode("utf-8-sig"))))
            assert rows[1][2] == "'=1+1 <QA>"
        else:
            with zipfile.ZipFile(io.BytesIO(downloaded.content)) as archive:
                worksheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
                assert not worksheet.findall(".//{*}f")
    with SessionLocal.begin() as db:
        assert db.get(CsvImport, job_id).status == "committed"
        member = db.get(CourseMembership, (course_id, student_id))
        assert member.source == "csv" and member.joined_at and member.revision == 1
        for job_id in export_ids:
            job = db.get(AccountExport, job_id)
            assert student_name not in str(job.__dict__)
        member.section_id = "changed"
    assert admin.get(f"/v1/admin/account-exports/{export_ids[-1]}/download").status_code == 409
    with SessionLocal.begin() as db:
        db.get(AccountExport, export_ids[0]).expires_at = datetime.now(UTC) - timedelta(seconds=1)
        events = list(db.scalars(select(AuditEvent).where(AuditEvent.action == "account_export_downloaded")))
        assert len(events) >= 3
        assert all(db.scalar(select(OutboxMessage).where(OutboxMessage.audit_event_id == event.id)) for event in events)
    assert admin.get(f"/v1/admin/account-exports/{export_ids[0]}/download").status_code == 410

report = {"checkedAt": datetime.now(UTC).isoformat(), "result": "pass", "database": "codemark_lms_test",
          "mainDatabaseMutations": False, "realSMTP": False, "concurrentCommitStatuses": results,
          "extendedAccountCSV": True, "assistantEnrollmentBoundary": True, "auditedCSVandXLSX": True,
          "exportExpiryStalenessAuthorization": True, "formulaSafety": True, "browserVisualQA": False}
(root / "docs/master-kit/BUILD-026-provisioning-validation.json").write_text(json.dumps(report, indent=2) + "\n", "utf-8")
print("PASS: PostgreSQL v2 user/enrollment CSV, assistant scope, concurrent commit exactly once, CSV/XLSX export audit/expiry/staleness/formula protection. No main DB changes or real email.")
