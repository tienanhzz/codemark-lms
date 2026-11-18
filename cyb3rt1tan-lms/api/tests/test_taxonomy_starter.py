"""Canonical installation is exact, local-operation friendly and non-destructive."""

import json
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.models import AuditEvent, TaxonomyCatalog, TaxonomyTag, User
from app.taxonomy_starter import install_starter


def test_starter_has_all_legacy_ids_and_preserves_localized_metadata(clients):
    _, _, factory = clients
    root = Path(__file__).resolve().parents[3]
    legacy = json.loads(
        (root / "master-kit/contracts/core-api/learning-taxonomy.example.json").read_text(
            encoding="utf-8"
        )
    )
    canonical = json.loads(
        (root / "master-kit (1)/contracts/core-api/learning-taxonomy.example.json").read_text(
            encoding="utf-8"
        )
    )
    assert {n["id"] for n in legacy["tags"]} == {
        n["id"] for n in canonical["categories"] + canonical["tags"]
    }
    with factory.begin() as db:
        actor = db.scalar(select(User).where(User.username == "admin"))
        result = install_starter(db, actor)
        assert result == {"catalogVersion": 2, "categories": 6, "tags": 67, "installed": True}
        for scope in ["content", "question"]:
            rows = {
                row.id: row
                for row in db.scalars(select(TaxonomyTag).where(TaxonomyTag.scope == scope))
            }
            assert len(rows) == 67
            for expected in canonical["tags"]:
                row = rows[expected["id"]]
                assert (row.names, row.parent_id, row.selectable, row.sort_order) == (
                    expected["name"],
                    expected["parentId"],
                    expected["selectable"],
                    expected["sortOrder"],
                )
                assert row.status == "active" and row.applicability == []


def test_starter_repeat_is_read_only_and_never_overwrites_admin_edits(clients):
    _, _, factory = clients
    with factory.begin() as db:
        actor = db.scalar(select(User).where(User.username == "admin"))
        install_starter(db, actor)
    with factory.begin() as db:
        actor = db.scalar(select(User).where(User.username == "admin"))
        before = db.scalar(select(func.count()).select_from(AuditEvent))
        assert install_starter(db, actor)["installed"] is False
        assert db.scalar(select(func.count()).select_from(AuditEvent)) == before
        db.get(TaxonomyTag, ("question", "arrays")).names = {
            "en": "Custom arrays",
            "vi": "Mảng tùy chỉnh",
        }
    with factory.begin() as db:
        actor = db.scalar(select(User).where(User.username == "admin"))
        with pytest.raises(ValueError, match="differs"):
            install_starter(db, actor)
        assert db.get(TaxonomyTag, ("question", "arrays")).names["en"] == "Custom arrays"
        assert db.get(TaxonomyCatalog, "main").version == 2


def test_starter_requires_active_admin_and_refuses_partial_catalog(clients):
    _, _, factory = clients
    with factory.begin() as db:
        student = db.scalar(select(User).where(User.username == "student"))
        with pytest.raises(ValueError, match="active administrator"):
            install_starter(db, student)
        actor = db.scalar(select(User).where(User.username == "admin"))
        db.add(TaxonomyTag(scope="question", id="custom", names={"en": "Custom"}, applicability=[]))
        db.flush()
        with pytest.raises(ValueError, match="differs"):
            install_starter(db, actor)
