"""Student-progress report authorization and audited audit-log views."""

from datetime import timedelta
from zoneinfo import ZoneInfo

from test_access import login
from test_courses import setup_course

from app.models import now


def test_progress_report_is_private_scoped_and_audited(clients):
    admin, student, _factory = clients
    headers, course, _ = setup_course(admin)
    student_headers = login(student, "student")
    student_id = student.get("/v1/me").json()["id"]
    course_path = f"/v1/courses/{course['id']}"
    assert admin.post(course_path + "/enrollments", headers=headers, json={"userId": student_id}).status_code == 201
    assert admin.post(course_path + "/activate", headers=headers, json={"reason": "Report fixture"}).status_code == 200
    zone = ZoneInfo("Asia/Bangkok")
    start = (now() - timedelta(days=3)).astimezone(zone).isoformat()
    end = (now() + timedelta(minutes=1)).astimezone(zone).isoformat()
    created = admin.post("/v1/reports", headers=headers, json={
        "kind": "studentProgress", "format": "csv", "courseId": course["id"],
        "fromAt": start, "toAt": end, "reason": "Review student progress",
    })
    assert created.status_code == 201, created.text
    report_id = created.json()["id"]
    download = admin.get(f"/v1/reports/{report_id}/download")
    assert download.status_code == 200 and "Student" in download.text
    assert download.headers["cache-control"] == "no-store"
    assert admin.get(f"/v1/reports/{report_id}/download").status_code == 200
    not_owner = student.get(f"/v1/reports/{report_id}/download")
    assert not_owner.status_code == 404
    own_report = student.post("/v1/reports", headers=student_headers, json={
        "kind": "studentProgress", "format": "xlsx", "courseId": course["id"],
        "fromAt": start, "toAt": end, "reason": "My progress copy",
    })
    assert own_report.status_code == 201, own_report.text
    assert student.get(own_report.json()["downloadPath"]).status_code == 200

    audit_page = admin.get("/v1/admin/audit-events", params={"courseId": course["id"], "action": "report"})
    assert audit_page.status_code == 200
    assert any(event["action"] == "student_progress_report_downloaded" for event in audit_page.json()["items"])
    export = admin.post("/v1/admin/audit-events/export", headers=headers, json={
        "courseId": course["id"], "reason": "Audit the report activity",
    })
    assert export.status_code == 200 and "student_progress_report_downloaded" in export.text
    assert export.headers["cache-control"] == "no-store"
