"""Course scoped assessment authoring and immutable question snapshots."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from test_access import login
from test_courses import setup_course

from app.models import AssessmentAttempt, AssessmentVersion, now


def test_assessment_authoring_publishes_versioned_safe_question_snapshot(clients):
    admin, student, factory = clients
    headers, course, _ = setup_course(admin)
    student_headers = login(student, "student")
    student_id = student.get("/v1/me").json()["id"]
    course_path = f"/v1/courses/{course['id']}"
    assert admin.post(course_path + "/enrollments", headers=headers, json={"userId": student_id}).status_code == 201
    assert admin.post(course_path + "/activate", headers=headers, json={"reason": "Assessment delivery"}).status_code == 200
    category = admin.post(
        "/v1/admin/question-taxonomy/categories",
        headers=headers,
        json={"id": "assessment-basics", "names": {"en": "Assessment basics"}},
    )
    assert category.status_code == 201
    question_body = {
        "questionType": "multipleChoice",
        "title": "Safe question",
        "prompt": "Choose one.",
        "categoryId": "assessment-basics",
        "difficulty": "newbie",
        "language": "en",
        "usageTypes": ["exam"],
        "tagIds": [],
        "content": {
            "contentType": "multipleChoice",
            "choices": [{"choiceId": "a", "text": "A"}, {"choiceId": "b", "text": "B"}],
        },
        "authoringConfig": {"configType": "multipleChoice", "correctChoiceIds": ["a"]},
    }
    question = admin.post(course_path + "/questions", headers=headers, json=question_body)
    assert question.status_code == 201, question.text
    question_id = question.json()["questionId"]
    version_id = question.json()["questionVersionId"]
    assert admin.post(
        f"/v1/questions/{question_id}/versions/{version_id}/validate", headers=headers
    ).json()["valid"]
    assert admin.post(
        f"/v1/questions/{question_id}/versions/{version_id}/publish", headers=headers
    ).status_code == 202

    body = {
        "kind": "exam",
        "title": "Midterm",
        "instructions": "Read carefully.",
        "timezone": "Asia/Bangkok",
        "durationMinutes": 60,
        "attemptLimit": 1,
        "questionVersionIds": [version_id],
    }
    response = admin.post(course_path + "/assessments", headers=headers, json=body)
    assert response.status_code == 201, response.text
    assessment_id = response.json()["id"]
    assert "authoringConfig" not in response.text
    assert response.json()["draft"]["questionItems"][0]["content"] == question_body["content"]
    assert admin.post(
        course_path + f"/assessments/{assessment_id}/publish", headers=headers
    ).status_code == 202
    published_for_student = student.get(course_path + "/assessments").json()["items"][0]
    assert published_for_student["status"] == "published" and published_for_student["version"] == 1
    assert published_for_student["title"] == "Midterm"
    assert "questionItems" not in published_for_student
    assert student.get("/v1/workspace/summary").json()["metrics"]["assessments"] == 1
    started = student.post(course_path + f"/assessments/{assessment_id}/attempts", headers=student_headers)
    assert started.status_code == 201, started.text
    assert started.json()["assessment"]["questionItems"][0]["questionVersionId"] == version_id
    attempt_id = started.json()["attemptId"]
    resumed = student.post(course_path + f"/assessments/{assessment_id}/attempts", headers=student_headers)
    assert resumed.status_code == 200 and resumed.json()["attemptId"] == attempt_id
    saved = student.put(
        course_path + f"/assessments/{assessment_id}/attempts/{attempt_id}/answers",
        headers={**student_headers, "If-Match": '"1"'},
        json={"answers": {version_id: "a"}},
    )
    assert saved.status_code == 200 and saved.json()["revision"] == 2
    stale = student.put(
        course_path + f"/assessments/{assessment_id}/attempts/{attempt_id}/answers",
        headers={**student_headers, "If-Match": '"1"'},
        json={"answers": {}},
    )
    assert stale.status_code == 409
    submitted = student.post(
        course_path + f"/assessments/{assessment_id}/attempts/{attempt_id}/submit",
        headers={**student_headers, "If-Match": '"2"'},
    )
    assert submitted.status_code == 200 and submitted.json()["status"] == "submitted"
    assert student.get("/v1/workspace/summary").json()["metrics"]["assessments"] == 0
    assert student.post(course_path + f"/assessments/{assessment_id}/attempts", headers=student_headers).status_code == 409
    body["title"] = "Midterm revised"
    revised = admin.put(
        course_path + f"/assessments/{assessment_id}",
        headers={**headers, "If-Match": '"1"'},
        json=body,
    )
    assert revised.status_code == 200 and revised.json()["version"] == 2, revised.text
    # Learners continue to receive the last published snapshot while a new draft is in progress.
    learner_view = student.get(course_path + "/assessments").json()["items"][0]
    assert learner_view["version"] == 1 and learner_view["title"] == "Midterm"
    assert admin.post(
        course_path + f"/assessments/{assessment_id}/publish", headers=headers
    ).status_code == 202
    with factory() as db:
        versions = list(db.query(AssessmentVersion).filter_by(assessment_id=assessment_id).order_by(AssessmentVersion.version))
        assert [item.status for item in versions] == ["published", "published"]
    final_learner_view = student.get(course_path + "/assessments").json()["items"][0]
    assert final_learner_view["version"] == 2 and final_learner_view["title"] == "Midterm revised"
    second_version_attempt = student.post(course_path + f"/assessments/{assessment_id}/attempts", headers=student_headers)
    assert second_version_attempt.status_code == 201 and second_version_attempt.json()["attemptNumber"] == 1
    with factory() as db:
        active_attempt = db.get(AssessmentAttempt, second_version_attempt.json()["attemptId"])
        assert active_attempt is not None
        active_attempt.deadline = now() - timedelta(seconds=1)
        db.commit()
    forced = student.post(course_path + f"/assessments/{assessment_id}/attempts", headers=student_headers)
    assert forced.status_code == 200 and forced.json()["status"] == "forceSubmitted"
    assert forced.json()["submittedAt"] == forced.json()["deadline"]
    with factory() as db:
        stored = db.query(AssessmentVersion).filter_by(assessment_id=assessment_id, version=1).one()
        assert stored.status == "published"
        assert "correctChoiceIds" not in str(stored.question_items)


def test_assessment_rejects_wrong_question_use_and_stale_revision(clients):
    admin, _, _ = clients
    headers, course, _ = setup_course(admin)
    assert admin.post(
        "/v1/admin/question-taxonomy/categories",
        headers=headers,
        json={"id": "assignment-basics", "names": {"en": "Assignment basics"}},
    ).status_code == 201
    draft = admin.post(f"/v1/courses/{course['id']}/questions", headers=headers, json={
        "questionType": "multipleChoice", "title": "Practice only", "prompt": "Choose.",
        "categoryId": "assignment-basics", "difficulty": "newbie", "language": "en",
        "usageTypes": ["practice"], "tagIds": [],
        "content": {"contentType": "multipleChoice", "choices": [
            {"choiceId": "a", "text": "A"}, {"choiceId": "b", "text": "B"}]},
        "authoringConfig": {"configType": "multipleChoice", "correctChoiceIds": ["a"]},
    })
    question_id, version_id = draft.json()["questionId"], draft.json()["questionVersionId"]
    assert admin.post(f"/v1/questions/{question_id}/versions/{version_id}/validate", headers=headers).json()["valid"]
    assert admin.post(f"/v1/questions/{question_id}/versions/{version_id}/publish", headers=headers).status_code == 202
    invalid = admin.post(f"/v1/courses/{course['id']}/assessments", headers=headers, json={
        "kind": "exam", "title": "Invalid", "timezone": "Asia/Bangkok",
        "questionVersionIds": [version_id],
    })
    assert invalid.status_code == 422
    assert admin.get(f"/v1/courses/{course['id']}/assessments").json()["items"] == []


def test_assignment_writing_grade_late_penalty_and_release_projection(clients):
    admin, student, _ = clients
    headers, course, _ = setup_course(admin)
    student_headers = login(student, "student")
    student_id = student.get("/v1/me").json()["id"]
    path = f"/v1/courses/{course['id']}"
    assert admin.post(path + "/enrollments", headers=headers, json={"userId": student_id}).status_code == 201
    assert admin.post(path + "/activate", headers=headers, json={"reason": "Writing assignment"}).status_code == 200
    assert admin.post("/v1/admin/question-taxonomy/categories", headers=headers, json={
        "id": "writing-grade", "names": {"en": "Writing grade"},
    }).status_code == 201
    question = admin.post(path + "/questions", headers=headers, json={
        "questionType": "writing", "title": "Short essay", "prompt": "Write a response.",
        "categoryId": "writing-grade", "difficulty": "newbie", "language": "en",
        "usageTypes": ["practical"], "tagIds": [],
        "content": {"contentType": "writing", "responseMode": "plainText", "maximumResponseLength": 3000},
        "authoringConfig": {"configType": "writing", "rubric": {
            "rubricId": "essay-v1", "version": 1, "maximumPoints": 5,
            "criteria": [
                {"criterionId": "clarity", "title": "Clarity", "points": 3, "position": 1},
                {"criterionId": "support", "title": "Support", "points": 2, "position": 2},
            ],
        }},
    })
    assert question.status_code == 201, question.text
    question_id, question_version = question.json()["questionId"], question.json()["questionVersionId"]
    assert admin.post(f"/v1/questions/{question_id}/versions/{question_version}/validate", headers=headers).json()["valid"]
    assert admin.post(f"/v1/questions/{question_id}/versions/{question_version}/publish", headers=headers).status_code == 202
    zone = ZoneInfo("Asia/Bangkok")
    due = datetime.now(zone) - timedelta(hours=1)
    body = {
        "kind": "assignment", "title": "Essay assignment", "instructions": "Write clearly.",
        "timezone": "Asia/Bangkok", "opensAt": (due - timedelta(days=1)).isoformat(),
        "closesAt": due.isoformat(), "attemptLimit": 1,
        "latePenaltyTiers": [{"afterMinutes": 30, "penaltyPercent": 20}],
        "questionVersionIds": [question_version],
    }
    assignment = admin.post(path + "/assessments", headers=headers, json=body)
    assert assignment.status_code == 201, assignment.text
    assignment_id = assignment.json()["id"]
    assert admin.post(path + f"/assessments/{assignment_id}/publish", headers=headers).status_code == 202
    assert student.get(path + "/released-grades").json()["items"] == []
    started = student.post(path + f"/assessments/{assignment_id}/attempts", headers=student_headers)
    assert started.status_code == 201, started.text
    attempt_id = started.json()["attemptId"]
    saved = student.put(path + f"/assessments/{assignment_id}/attempts/{attempt_id}/answers",
        headers={**student_headers, "If-Match": '"1"'}, json={"answers": {question_version: "A thoughtful answer."}})
    assert saved.status_code == 200
    submitted = student.post(path + f"/assessments/{assignment_id}/attempts/{attempt_id}/submit",
        headers={**student_headers, "If-Match": '"2"'})
    assert submitted.status_code == 200 and submitted.json()["status"] == "submitted"
    detail = admin.get(path + f"/grading/attempts/{attempt_id}")
    assert detail.status_code == 200 and detail.json()["items"][0]["rubric"]["maximumPoints"] == 5
    incomplete = admin.post(path + f"/grading/attempts/{attempt_id}/release", headers=headers)
    assert incomplete.status_code == 409
    graded = admin.put(path + f"/grading/attempts/{attempt_id}/questions/{question_version}", headers=headers, json={
        "pointsAwarded": 3, "criterionScores": {"clarity": 2, "support": 1}, "feedback": "Good structure.",
    })
    assert graded.status_code == 200, graded.text
    released = admin.post(path + f"/grading/attempts/{attempt_id}/release", headers=headers)
    assert released.status_code == 201, released.text
    assert released.json()["grossScore"] == 3 and released.json()["penaltyPercent"] == 20
    assert released.json()["releasedScore"] == 2.4
    projection = student.get(path + "/released-grades")
    assert projection.status_code == 200 and projection.json()["items"][0]["score"] == 2.4
    assert projection.json()["items"][0]["breakdown"][0]["feedback"] == "Good structure."
