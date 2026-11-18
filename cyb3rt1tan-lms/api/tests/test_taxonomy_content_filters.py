"""Explicit category filtering and validated lesson taxonomy references."""

from test_courses import setup_course
from test_questions import _question_body


def test_category_descendants_require_explicit_option(clients):
    admin, _, _ = clients
    headers, course, _ = setup_course(admin)
    for node_id, parent in [("root", None), ("child", "root"), ("grandchild", "child")]:
        response = admin.post(
            "/v1/admin/question-taxonomy/categories",
            headers=headers,
            json={"id": node_id, "names": {"en": node_id}, "parentId": parent},
        )
        assert response.status_code == 201, response.text
    endpoint = f"/v1/courses/{course['id']}/questions"
    for category in ("root", "child", "grandchild"):
        body = _question_body(category, category)
        body["tagIds"] = []
        assert admin.post(endpoint, headers=headers, json=body).status_code == 201
    direct = admin.get(endpoint, params={"categoryId": "root"})
    assert [item["title"] for item in direct.json()["items"]] == ["root"]
    expanded = admin.get(endpoint, params={"categoryId": "root", "includeSubcategories": "true"})
    assert {item["title"] for item in expanded.json()["items"]} == {"root", "child", "grandchild"}


def test_lesson_tags_validate_new_references_and_keep_historical_retired_tags(clients):
    admin, _, _ = clients
    headers, course, _ = setup_course(admin)
    endpoint = f"/v1/courses/{course['id']}/lesson-plan"
    for node_id, extra in [
        ("lesson-topic", {}),
        ("navigation", {"selectable": False}),
        ("wrong-kind", {"applicability": ["multipleChoice"]}),
    ]:
        assert (
            admin.post(
                "/v1/admin/taxonomy/tags",
                headers=headers,
                json={"id": node_id, "names": {"en": node_id}, **extra},
            ).status_code
            == 201
        )

    def save(entries, revision=1):
        return admin.put(
            endpoint, headers={**headers, "If-Match": f'"{revision}"'}, json={"entries": entries}
        )

    entry = {"week": "1", "topic": "Arrays", "position": 1, "tagIds": ["lesson-topic"]}
    for rejected in (["missing"], ["navigation"], ["wrong-kind"], ["lesson-topic", "lesson-topic"]):
        response = save([{**entry, "tagIds": rejected}])
        assert response.status_code == 422, response.text
    saved = save([entry])
    assert saved.status_code == 200, saved.text
    stored = saved.json()["entries"][0]
    assert stored["tagIds"] == ["lesson-topic"]
    assert (
        admin.patch(
            "/v1/admin/taxonomy/tags/lesson-topic", headers=headers, json={"status": "retired"}
        ).status_code
        == 200
    )
    updated = save([{**stored, "topic": "Updated lesson"}], saved.json()["revision"])
    assert updated.status_code == 200, updated.text
    assert updated.json()["entries"][0]["tagIds"] == ["lesson-topic"]
    rejected = save(
        [updated.json()["entries"][0], {**entry, "position": 2}], updated.json()["revision"]
    )
    assert rejected.status_code == 422, rejected.text
    counts = admin.get("/v1/taxonomy?includeRetired=true").json()
    assert next(tag for tag in counts["tags"] if tag["id"] == "lesson-topic")["usageCount"] == 1
