"""Student-only and roster-scoped learning overview authorization."""

from datetime import timedelta
from zoneinfo import ZoneInfo

from test_access import login
from test_courses import setup_course

from app.models import now


def test_learning_overview_scopes_student_and_staff_fields(clients):
    admin, student, _factory = clients
    headers, course, _ = setup_course(admin)
    plan = admin.get(f"/v1/courses/{course['id']}/lesson-plan", headers=headers)
    assert plan.status_code == 200
    changed_plan = admin.put(
        f"/v1/courses/{course['id']}/lesson-plan", headers={**headers, "If-Match": plan.headers["etag"]},
        json={"entries": [{"week": "Week 1", "topic": "Foundations", "position": 1}]},
    )
    assert changed_plan.status_code == 200, changed_plan.text
    student_headers = login(student, "student")
    student_id = student.get("/v1/me").json()["id"]
    path = f"/v1/courses/{course['id']}"
    assert admin.post(path + "/enrollments", headers=headers, json={"userId": student_id}).status_code == 201
    assert admin.post(path + "/activate", headers=headers, json={"reason": "Overview fixture"}).status_code == 200
    zone = ZoneInfo("Asia/Bangkok")
    opens = (now() - timedelta(hours=2)).astimezone(zone)
    closes = (now() - timedelta(hours=1)).astimezone(zone)
    window = admin.post(path + "/attendance/windows", headers=headers, json={
        "title": "Overview session", "opensAt": opens.isoformat(), "closesAt": closes.isoformat(),
    })
    assert window.status_code == 201, window.text
    assert admin.post(path + "/attendance/windows/" + window.json()["id"] + "/close", headers=headers).status_code == 200

    start = (now() - timedelta(days=7)).astimezone(zone).isoformat()
    end = (now() + timedelta(minutes=1)).astimezone(zone).isoformat()
    own = student.get("/v1/learning-overview/me", params={"fromAt": start, "toAt": end})
    assert own.status_code == 200 and len(own.json()["items"]) == 1
    own_course = own.json()["items"][0]
    assert own_course["attendance"]["counts"]["absent"] == 1
    assert own_course["practice"]["totalAttempts"] == 0
    assert own_course["lessonProgress"]["availability"] == "available"
    assert own_course["lessonProgress"]["completed"] == 0
    progress_path = path + "/lesson-progress/me"
    progress = student.get(progress_path)
    assert progress.status_code == 200 and progress.json()["total"] == 1
    entry_id = progress.json()["entries"][0]["entryId"]
    marked = student.put(f"{progress_path}/{entry_id}", headers=student_headers, json={"completed": True})
    assert marked.status_code == 200 and marked.json()["completed"] is True
    refreshed = student.get("/v1/learning-overview/me", params={"fromAt": start, "toAt": end})
    assert refreshed.json()["items"][0]["lessonProgress"]["completed"] == 1
    denied = student.get(path + "/learning-overview/" + student_id)
    assert denied.status_code == 403
    staff = admin.get(path + "/learning-overview/" + student_id, params={"fromAt": start, "toAt": end})
    assert staff.status_code == 200 and staff.json()["student"]["officialName"] == "Student"
    assert staff.json()["item"]["attendance"]["counts"]["absent"] == 1
    assert "results" in staff.json()["item"]["assessments"]
