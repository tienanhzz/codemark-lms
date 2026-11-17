"""Attendance window, one-time rotating token, absent and excusal workflow."""

from datetime import timedelta
from zoneinfo import ZoneInfo

from test_access import login
from test_courses import setup_course

from app.models import now


def test_attendance_check_in_close_history_and_excusal(clients):
    admin, student, _factory = clients
    headers, course, _ = setup_course(admin)
    student_headers = login(student, "student")
    student_id = student.get("/v1/me").json()["id"]
    path = f"/v1/courses/{course['id']}"
    assert (
        admin.post(path + "/enrollments", headers=headers, json={"userId": student_id}).status_code
        == 201
    )
    assert (
        admin.post(
            path + "/activate", headers=headers, json={"reason": "Attendance test"}
        ).status_code
        == 200
    )
    bangkok = ZoneInfo("Asia/Bangkok")
    start = (now() - timedelta(minutes=1)).astimezone(bangkok).isoformat()
    end = (now() + timedelta(hours=1)).astimezone(bangkok).isoformat()
    created = admin.post(
        path + "/attendance/windows",
        headers=headers,
        json={
            "title": "Lab check-in",
            "opensAt": start,
            "closesAt": end,
            "lateGraceMinutes": 5,
        },
    )
    assert created.status_code == 201, created.text
    window_id = created.json()["id"]
    token1 = admin.post(path + f"/attendance/windows/{window_id}/token", headers=headers)
    assert token1.status_code == 201
    token2 = admin.post(path + f"/attendance/windows/{window_id}/token", headers=headers)
    assert token2.status_code == 201 and token2.json()["token"] != token1.json()["token"]
    checkin = student.post(
        path + f"/attendance/windows/{window_id}/check-in",
        headers=student_headers,
        json={"token": token1.json()["token"]},
    )
    assert checkin.status_code == 422
    checkin = student.post(
        path + f"/attendance/windows/{window_id}/check-in",
        headers=student_headers,
        json={"token": token2.json()["token"]},
    )
    assert checkin.status_code == 201 and checkin.json()["status"] == "present"
    assert (
        student.post(
            path + f"/attendance/windows/{window_id}/check-in",
            headers=student_headers,
            json={"token": token2.json()["token"]},
        ).status_code
        == 409
    )
    visible = student.get(path + f"/attendance/windows/{window_id}/records")
    assert visible.status_code == 200 and visible.json()["items"][0]["status"] == "present"
    assert (
        admin.post(path + f"/attendance/windows/{window_id}/close", headers=headers).json()[
            "markedAbsent"
        ]
        == 0
    )

    absent = admin.post(
        path + "/attendance/windows",
        headers=headers,
        json={
            "title": "Second session",
            "opensAt": start,
            "closesAt": end,
        },
    ).json()
    request = student.post(
        path + f"/attendance/windows/{absent['id']}/excusal",
        headers=student_headers,
        json={"reason": "Medical appointment"},
    )
    assert request.status_code == 201
    assert student.get(path + "/attendance/excusals").json()["items"][0]["status"] == "pending"
    assert (
        admin.post(path + f"/attendance/windows/{absent['id']}/close", headers=headers).json()[
            "markedAbsent"
        ]
        == 1
    )
    absent_rows = student.get(path + f"/attendance/windows/{absent['id']}/records").json()["items"]
    assert absent_rows[0]["status"] == "absent"
    queue = admin.get(path + "/attendance/excusals")
    assert queue.status_code == 200 and queue.json()["items"][0]["reason"] == "Medical appointment"
    decided = admin.post(
        path + f"/attendance/excusals/{request.json()['id']}/decision",
        headers=headers,
        json={"approved": True, "reason": "Evidence reviewed"},
    )
    assert decided.status_code == 200 and decided.json()["status"] == "approved"
    revised = student.get(path + f"/attendance/windows/{absent['id']}/records").json()["items"][0]
    assert revised["status"] == "excused" and revised["revision"] == 2
    corrected = admin.put(
        path + f"/attendance/records/{revised['recordId']}",
        headers=headers,
        json={"status": "present", "reason": "Verified by signed register"},
    )
    assert corrected.status_code == 200 and corrected.json()["revision"] == 3
