"""Taxonomy authorization, tree integrity, and audit behavior."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.models import AuditEvent

PASSWORD = "A test password for fixtures only!"
ORIGIN = {"Origin": "http://127.0.0.1:3100"}


def _login(client: TestClient, username: str) -> dict[str, str]:
    assert client.post(
        "/v1/auth/login", headers=ORIGIN, json={"username": username, "password": PASSWORD}
    ).status_code == 200
    return {**ORIGIN, "X-CSRF-Token": client.cookies["lms_csrf"]}


def test_taxonomy_catalogs_are_separate_admin_managed_trees_and_audited(clients):
    admin, student, _ = clients
    headers = _login(admin, "admin")
    student_headers = _login(student, "student")

    initial = admin.get("/v1/question-taxonomy?includeRetired=true").json()
    assert initial["catalogVersion"] == 1
    assert initial["categories"] == [] and initial["tags"] == []
    assert student.get("/v1/question-taxonomy?includeRetired=true").status_code == 403
    assert student.post(
        "/v1/admin/question-taxonomy/categories",
        headers=student_headers,
        json={"id": "algorithms", "names": {"en": "Algorithms", "vi": "Thuật toán"}},
    ).status_code == 403

    category = admin.post(
        "/v1/admin/question-taxonomy/categories",
        headers=headers,
        json={"id": "algorithms", "names": {"en": "Algorithms", "vi": "Thuật toán"}},
    )
    assert category.status_code == 201, category.text
    child = admin.post(
        "/v1/admin/question-taxonomy/categories",
        headers=headers,
        json={
            "id": "sorting",
            "names": {"en": "Sorting", "vi": "Sắp xếp"},
            "parentId": "algorithms",
        },
    )
    assert child.status_code == 201, child.text
    tag = admin.post(
        "/v1/admin/question-taxonomy/tags",
        headers=headers,
        json={
            "id": "stable-sort",
            "names": {"en": "Stable sort", "vi": "Sắp xếp ổn định"},
            "applicability": ["multipleChoice"],
        },
    )
    assert tag.status_code == 201, tag.text

    assert admin.patch(
        "/v1/admin/question-taxonomy/categories/algorithms",
        headers=headers,
        json={"parentId": "sorting"},
    ).status_code == 422
    assert admin.patch(
        "/v1/admin/question-taxonomy/categories/algorithms",
        headers=headers,
        json={"status": "retired"},
    ).status_code == 409
    assert admin.patch(
        "/v1/admin/question-taxonomy/tags/stable-sort",
        headers=headers,
        json={"selectable": False},
    ).status_code == 200

    question = admin.get("/v1/question-taxonomy").json()
    content = admin.get("/v1/taxonomy").json()
    assert question["catalogVersion"] == 5
    assert [row["id"] for row in question["categories"]] == ["algorithms", "sorting"]
    assert question["tags"][0]["selectable"] is False
    assert question["categories"][0]["usageCount"] == 0
    assert content["categories"] == [] and content["tags"] == []
    student_catalog = student.get("/v1/question-taxonomy").json()
    assert [row["id"] for row in student_catalog["categories"]] == ["algorithms", "sorting"]
    assert "usageCount" not in student_catalog["categories"][0]

    with clients[2]() as db:
        actions = [event.action for event in db.query(AuditEvent)]
    assert actions.count("question_category_created") == 2
    assert actions.count("question_tag_created") == 1


def test_taxonomy_merge_keeps_source_id_and_creates_audited_redirect(clients):
    admin, _, _ = clients
    headers = _login(admin, "admin")
    for tag_id, applicability in (("legacy", ["multipleChoice"]), ("core", ["writing"])):
        response = admin.post(
            "/v1/admin/question-taxonomy/tags",
            headers=headers,
            json={"id": tag_id, "names": {"en": tag_id}, "applicability": applicability},
        )
        assert response.status_code == 201, response.text
    merged = admin.post(
        "/v1/admin/question-taxonomy/tags/legacy/merge",
        headers=headers,
        json={"targetId": "core"},
    )
    assert merged.status_code == 200, merged.text
    catalog = admin.get("/v1/question-taxonomy?includeRetired=true").json()
    source = next(tag for tag in catalog["tags"] if tag["id"] == "legacy")
    target = next(tag for tag in catalog["tags"] if tag["id"] == "core")
    assert source["status"] == "retired"
    assert set(target["applicability"]) == {"multipleChoice", "writing"}
    assert catalog["redirects"] == [{"kind": "tag", "sourceId": "legacy", "targetId": "core"}]
    assert admin.post(
        "/v1/admin/question-taxonomy/tags/core/merge",
        headers=headers,
        json={"targetId": "legacy"},
    ).status_code == 409


def test_one_time_taxonomy_seed_requires_expected_version_and_empty_catalog(clients):
    admin, _, _ = clients
    headers = _login(admin, "admin")
    payload = {
        "expectedCatalogVersion": 1,
        "categories": [
            {"id": "foundations", "name": {"en": "Foundations"}, "status": "active"},
            {"id": "logic", "name": {"en": "Logic"}, "parentId": "foundations", "status": "active"},
        ],
        "tags": [
            {"id": "basics", "name": {"en": "Basics"}, "appliesTo": ["lesson", "question"], "status": "active"},
        ],
    }
    seeded = admin.post("/v1/admin/taxonomy/seed", headers=headers, json=payload)
    assert seeded.status_code == 201, seeded.text
    assert seeded.json() == {"catalogVersion": 2, "categories": 2, "tags": 1}
    question = admin.get("/v1/question-taxonomy").json()
    lesson = admin.get("/v1/taxonomy").json()
    assert [node["id"] for node in question["categories"]] == ["foundations", "logic"]
    assert [node["id"] for node in lesson["categories"]] == ["foundations", "logic"]
    assert [node["id"] for node in question["tags"]] == ["basics"]
    assert admin.post("/v1/admin/taxonomy/seed", headers=headers, json=payload).status_code == 409


def test_canonical_master_kit_taxonomy_imports_to_both_trees(clients):
    admin, _, _ = clients
    headers = _login(admin, "admin")
    source = Path(__file__).resolve().parents[2] / "web" / "public" / "learning-taxonomy.example.json"
    payload = json.loads(source.read_text(encoding="utf-8"))
    payload.pop("catalogVersion", None)
    payload["expectedCatalogVersion"] = 1
    imported = admin.post("/v1/admin/taxonomy/seed", headers=headers, json=payload)
    assert imported.status_code == 201, imported.text
    assert imported.json() == {"catalogVersion": 2, "categories": 6, "tags": 67}
    assert len(admin.get("/v1/taxonomy").json()["categories"]) == 6
    assert len(admin.get("/v1/taxonomy").json()["tags"]) == 67
    assert len(admin.get("/v1/question-taxonomy").json()["categories"]) == 6
    assert len(admin.get("/v1/question-taxonomy").json()["tags"]) == 67
