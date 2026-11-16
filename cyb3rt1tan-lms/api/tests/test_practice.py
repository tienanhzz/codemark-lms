"""Membership-gated objective practice and server-side scoring privacy."""

from test_access import login
from test_courses import setup_course


def test_objective_practice_scores_and_persists_private_answer_only(clients):
    admin, student, factory = clients
    headers, course, _ = setup_course(admin)
    student_headers = login(student, "student")
    assert admin.post("/v1/admin/missions", headers=headers, json={
        "missionId": "practice-event", "version": 1, "title": "Practice once",
        "eventKey": "practice.attempt", "targetCount": 1, "cadence": "daily",
        "eligibleRoles": ["student"], "reward": {"exp": 15},
    }).status_code == 201
    assert admin.post("/v1/admin/missions", headers=headers, json={
        "missionId": "practice-correct", "version": 1, "title": "Get one correct",
        "eventKey": "practice.correct", "targetCount": 1, "cadence": "once",
        "eligibleRoles": ["student"], "reward": {"coin": 2},
    }).status_code == 201
    student_id = student.get("/v1/me").json()["id"]
    path = f"/v1/courses/{course['id']}"
    assert admin.post(path + "/enrollments", headers=headers, json={"userId": student_id}).status_code == 201
    assert admin.post(path + "/activate", headers=headers, json={"reason": "Practice"}).status_code == 200
    assert admin.post("/v1/admin/question-taxonomy/categories", headers=headers, json={
        "id": "practice-basics", "names": {"en": "Practice basics"},
    }).status_code == 201
    draft = admin.post(path + "/questions", headers=headers, json={
        "questionType": "multipleChoice", "title": "Practice question", "prompt": "Choose one.",
        "categoryId": "practice-basics", "difficulty": "newbie", "language": "en",
        "usageTypes": ["practice"], "tagIds": [],
        "content": {"contentType": "multipleChoice", "choices": [
            {"choiceId": "a", "text": "A"}, {"choiceId": "b", "text": "B"},
        ]},
        "authoringConfig": {"configType": "multipleChoice", "correctChoiceIds": ["a"]},
    })
    assert draft.status_code == 201, draft.text
    question_id = draft.json()["questionId"]
    version_id = draft.json()["questionVersionId"]
    assert admin.post(f"/v1/questions/{question_id}/versions/{version_id}/validate", headers=headers).json()["valid"]
    assert admin.post(f"/v1/questions/{question_id}/versions/{version_id}/publish", headers=headers).status_code == 202

    bank = student.get(path + "/practice/questions")
    assert bank.status_code == 200 and len(bank.json()["items"]) == 1
    assert "authoringConfig" not in bank.text and "correctChoiceIds" not in bank.text
    correct = student.post(path + "/practice/attempts", headers=student_headers, json={
        "questionVersionId": version_id, "answer": "a",
    })
    assert correct.status_code == 201, correct.text
    assert correct.json()["score"] == 1 and correct.json()["isCorrect"]
    wrong = student.post(path + "/practice/attempts", headers=student_headers, json={
        "questionVersionId": version_id, "answer": "b",
    })
    assert wrong.status_code == 201 and wrong.json()["score"] == 0 and not wrong.json()["isCorrect"]
    history = student.get(path + "/practice/history")
    assert len(history.json()["items"]) == 2
    wallet = student.get("/v1/me/wallet").json()
    assert wallet["exp"] == 15 and wallet["coin"] == 0
    missions = {item["missionId"]: item for item in student.get("/v1/me/missions").json()["items"]}
    assert missions["practice-event"]["status"] == "claimed"
    assert missions["practice-correct"]["canClaim"] is True
    claim = student.post("/v1/missions/practice-correct/claims", headers={**student_headers, "Idempotency-Key": "practice-claim-key-1"})
    assert claim.status_code == 200 and student.get("/v1/me/wallet").json()["coin"] == 2
    with factory() as db:
        from app.models import PracticeAttempt

        attempts = list(db.query(PracticeAttempt).filter_by(user_id=student_id))
        assert len(attempts) == 2 and {item.score for item in attempts} == {0, 1}


def test_practice_requires_active_course_membership(clients):
    admin, student, _ = clients
    _, course, _ = setup_course(admin)
    login(student, "student")
    assert student.get(f"/v1/courses/{course['id']}/practice/questions").status_code == 404
