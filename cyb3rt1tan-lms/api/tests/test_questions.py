"""Question schema validation, immutable versions, and safe publication projections."""

import io

from PIL import Image
from test_access import login
from test_courses import setup_course

from app.models import QuestionVersion
from app.question_schemas import schema_errors


def _question_body(category: str, title: str = "Which choice is correct?") -> dict[str, object]:
    return {
        "questionType": "multipleChoice",
        "title": title,
        "prompt": "Select the correct answer.",
        "categoryId": category,
        "difficulty": "newbie",
        "language": "en",
        "usageTypes": ["practice", "exam"],
        "tagIds": ["basics"],
        "content": {
            "contentType": "multipleChoice",
            "choices": [
                {"choiceId": "a", "text": "Answer A"},
                {"choiceId": "b", "text": "Answer B"},
            ],
        },
        "authoringConfig": {"configType": "multipleChoice", "correctChoiceIds": ["a"]},
    }


def test_question_versions_validate_publish_and_hide_private_keys(clients):
    admin, student, factory = clients
    headers, course, _ = setup_course(admin)
    login(student, "student")
    category = admin.post(
        "/v1/admin/question-taxonomy/categories",
        headers=headers,
        json={"id": "basics", "names": {"en": "Basics", "vi": "Cơ bản"}},
    )
    assert category.status_code == 201
    tag = admin.post(
        "/v1/admin/question-taxonomy/tags",
        headers=headers,
        json={"id": "basics", "names": {"en": "Basics", "vi": "Cơ bản"}},
    )
    assert tag.status_code == 201
    student_id = student.get("/v1/me").json()["id"]
    endpoint = f"/v1/courses/{course['id']}"
    assert admin.post(endpoint + "/enrollments", headers=headers, json={"userId": student_id}).status_code == 201
    assert admin.post(endpoint + "/activate", headers=headers, json={"reason": "Question visibility"}).status_code == 200

    draft = admin.post(endpoint + "/questions", headers=headers, json=_question_body("basics"))
    assert draft.status_code == 201, draft.text
    question_id = draft.json()["questionId"]
    version_id = draft.json()["questionVersionId"]
    assert draft.json()["status"] == "draft"
    assert student.get(f"/v1/questions/{question_id}/versions/{version_id}").status_code == 404

    validate = admin.post(f"/v1/questions/{question_id}/versions/{version_id}/validate", headers=headers)
    assert validate.status_code == 200 and validate.json()["valid"], validate.text
    published = admin.post(f"/v1/questions/{question_id}/versions/{version_id}/publish", headers=headers)
    assert published.status_code == 202, published.text

    student_search = student.get(endpoint + "/questions")
    assert student_search.status_code == 200
    student_version = student_search.json()["items"][0]
    assert student_version["status"] == "published"
    assert "authoringConfig" not in student_version
    assert "validation" not in student_version
    private = admin.get(f"/v1/questions/{question_id}/versions/{version_id}")
    assert private.json()["authoringConfig"]["correctChoiceIds"] == ["a"]

    next_draft = _question_body("basics", "Newer draft")
    next_draft["authoringConfig"] = {"configType": "multipleChoice", "correctChoiceIds": ["missing"]}
    second = admin.post(f"/v1/questions/{question_id}/versions", headers=headers, json=next_draft)
    assert second.status_code == 201 and second.json()["versionNumber"] == 2
    invalid = admin.post(
        f"/v1/questions/{question_id}/versions/{second.json()['questionVersionId']}/validate",
        headers=headers,
    )
    assert invalid.status_code == 200 and not invalid.json()["valid"]
    assert any("visible choice" in issue["message"] for issue in invalid.json()["errors"])

    student_search = student.get(endpoint + "/questions?q=correct&tagIds=basics&difficulty=newbie")
    assert len(student_search.json()["items"]) == 1
    assert student_search.json()["items"][0]["versionNumber"] == 1
    with factory() as db:
        assert db.get(QuestionVersion, version_id).status == "published"


def test_code_question_is_never_published_and_runtime_profiles_are_draft_only(clients):
    admin, _, _ = clients
    headers, course, _ = setup_course(admin)
    assert admin.post(
        "/v1/admin/question-taxonomy/categories",
        headers=headers,
        json={"id": "code-basics", "names": {"en": "Code basics"}},
    ).status_code == 201
    body = {
        "questionType": "code",
        "title": "Write a program",
        "prompt": "Return the input.",
        "categoryId": "code-basics",
        "difficulty": "noob",
        "usageTypes": ["practice"],
        "tagIds": [],
        "content": {
            "contentType": "code", "submissionModes": ["editor"],
            "wrapperKind": "program", "runtimeProfileId": "python-313",
        },
        "authoringConfig": {
            "configType": "code", "referenceSolutionAssetId": "ref-solution",
            "testCases": [{"testCaseId": "case-1", "position": 1, "representation": "inputOutput", "input": "1", "expectedOutput": "1", "display": "hide", "points": 1}],
            "scoring": {"mode": "allOrNothing", "maximumPoints": 1, "showCheckButton": False, "wrongCheckPenalty": 0, "scoreFloor": 0},
        },
    }
    draft = admin.post(f"/v1/courses/{course['id']}/questions", headers=headers, json=body)
    assert draft.status_code == 201, draft.text
    qid, vid = draft.json()["questionId"], draft.json()["questionVersionId"]
    checked = admin.post(f"/v1/questions/{qid}/versions/{vid}/validate", headers=headers)
    assert not checked.json()["valid"]
    assert admin.post(f"/v1/questions/{qid}/versions/{vid}/publish", headers=headers).status_code == 409

    profile = {
        "profileId": "python-313", "language": "python", "languageVersion": "3.13",
        "imageDigest": "sha256:" + "a" * 64, "allowedLibraries": [],
        "resourceCaps": {"wallTimeMs": 1000, "cpuTimeMs": 1000, "memoryBytes": 1048576, "maxSourceBytes": 65536},
        "sandbox": {"network": "disabled", "nonRootUser": True, "readOnlyRootFilesystem": True, "dropAllCapabilities": True, "ephemeralWorkspace": True, "secretMounts": False},
    }
    first = admin.post("/v1/admin/runtime-profiles", headers=headers, json=profile)
    second = admin.post("/v1/admin/runtime-profiles", headers=headers, json=profile)
    assert first.status_code == second.status_code == 201, (first.text, second.text)
    assert first.json()["profile"]["version"] == 1 and second.json()["profile"]["version"] == 2
    listing = admin.get("/v1/admin/runtime-profiles").json()
    assert listing["executionAvailable"] is False and len(listing["items"]) == 2
    assert admin.get("/v1/admin/runtime-profiles").json()["items"][0]["profile"]["status"] == "draft"


def test_question_assets_are_bounded_immutable_and_course_scoped(clients):
    admin, student, _ = clients
    headers, course, _ = setup_course(admin)
    login(student, "student")
    endpoint = f"/v1/courses/{course['id']}/question-assets"
    upload = admin.post(
        endpoint,
        headers={**headers, "Content-Type": "audio/ogg", "X-Question-Asset-Kind": "audio"},
        content=b"OggS-test-audio",
    )
    assert upload.status_code == 201, upload.text
    item = upload.json()
    assert item["kind"] == "audio" and item["size"] == len(b"OggS-test-audio")
    assert admin.get(f"/v1/question-assets/{item['assetId']}").content == b"OggS-test-audio"
    assert admin.get(f"/v1/question-assets/{item['assetId']}").headers["cache-control"] == "no-store"
    assert student.get(f"/v1/question-assets/{item['assetId']}").status_code == 404

    invalid = admin.post(
        endpoint,
        headers={**headers, "Content-Type": "audio/ogg", "X-Question-Asset-Kind": "audio"},
        content=b"not audio",
    )
    assert invalid.status_code == 415
    image = io.BytesIO()
    Image.new("RGB", (1, 1), "white").save(image, format="PNG")
    mismatched = admin.post(
        endpoint,
        headers={**headers, "Content-Type": "image/jpeg", "X-Question-Asset-Kind": "image"},
        content=image.getvalue(),
    )
    assert mismatched.status_code == 415
    too_large = admin.post(
        endpoint,
        headers={**headers, "Content-Type": "text/plain", "X-Question-Asset-Kind": "transcript"},
        content=b"x" * 2_000_001,
    )
    assert too_large.status_code == 413

    login(student, "student")
    category = admin.post(
        "/v1/admin/question-taxonomy/categories",
        headers=headers,
        json={"id": "basics", "names": {"en": "Basics"}},
    )
    assert category.status_code == 201
    tag = admin.post(
        "/v1/admin/question-taxonomy/tags",
        headers=headers,
        json={"id": "basics", "names": {"en": "Basics"}},
    )
    assert tag.status_code == 201
    student_id = student.get("/v1/me").json()["id"]
    course_endpoint = f"/v1/courses/{course['id']}"
    assert admin.post(course_endpoint + "/enrollments", headers=headers, json={"userId": student_id}).status_code == 201
    assert admin.post(course_endpoint + "/activate", headers=headers, json={"reason": "Published listening set"}).status_code == 200
    child = admin.post(course_endpoint + "/questions", headers=headers, json=_question_body("basics"))
    assert child.status_code == 201, child.text
    child_id, child_version = child.json()["questionId"], child.json()["questionVersionId"]
    assert admin.post(f"/v1/questions/{child_id}/versions/{child_version}/validate", headers=headers).json()["valid"]
    assert admin.post(f"/v1/questions/{child_id}/versions/{child_version}/publish", headers=headers).status_code == 202
    listening = {
        "questionType": "listeningSet", "title": "Listen and answer", "prompt": "Listen carefully.",
        "categoryId": "basics", "difficulty": "newbie", "language": "en", "usageTypes": ["practice"], "tagIds": [],
        "content": {"contentType": "listeningSet", "audioAssetId": item["assetId"], "childQuestionVersionIds": [child_version], "playLimit": 2},
        "authoringConfig": {"configType": "listeningSet", "children": [{"questionVersionId": child_version, "questionType": "multipleChoice", "points": 1}]},
    }
    draft = admin.post(course_endpoint + "/questions", headers=headers, json=listening)
    listen_id, listen_version = draft.json()["questionId"], draft.json()["questionVersionId"]
    checked = admin.post(f"/v1/questions/{listen_id}/versions/{listen_version}/validate", headers=headers)
    assert checked.json()["valid"], checked.text
    assert admin.post(f"/v1/questions/{listen_id}/versions/{listen_version}/publish", headers=headers).status_code == 202
    assert student.get(f"/v1/question-assets/{item['assetId']}").content == b"OggS-test-audio"


def test_matching_authoring_references_only_visible_items():
    content = {
        "contentType": "matching",
        "leftItems": [{"itemId": "l1", "text": "One"}, {"itemId": "l2", "text": "Two"}],
        "rightItems": [{"itemId": "r1", "text": "First"}, {"itemId": "r2", "text": "Second"}],
    }
    config = {
        "configType": "matching",
        "pairs": [{"leftItemId": "l1", "rightItemId": "r1", "points": 1}],
        "scoringMode": "allOrNothing",
    }
    errors = schema_errors("matching", content, config)
    assert any("every left item" in item["message"] for item in errors)
    config["pairs"].append({"leftItemId": "l2", "rightItemId": "missing", "points": 1})
    errors = schema_errors("matching", content, config)
    assert any("visible item" in item["message"] for item in errors)
