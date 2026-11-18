"""Install the bundled Master Kit taxonomy without overwriting an existing catalog."""

import json
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import lock_identity
from .models import TaxonomyCatalog, TaxonomyCategory, TaxonomyTag, User
from .outbox import record_audit
from .taxonomy import import_catalog
from .taxonomy_dto import TaxonomySeed

SOURCE = Path(__file__).resolve().parents[2] / "web/public/learning-taxonomy.example.json"


def install_starter(db: Session, actor: User) -> dict[str, object]:
    lock_identity(db)
    db.refresh(actor)
    if actor.status != "active" or "admin" not in actor.roles:
        raise ValueError("An existing active administrator is required.")
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    source.pop("catalogVersion")
    record = db.get(TaxonomyCatalog, "main")
    body = TaxonomySeed.model_validate(
        {**source, "expectedCatalogVersion": record.version if record else 1}
    )
    categories = list(db.scalars(select(TaxonomyCategory)))
    tags = list(db.scalars(select(TaxonomyTag)))
    if categories or tags:
        expected_categories = {
            (scope, node.id): (node.name, node.parentId, node.sortOrder, node.status)
            for scope in ("content", "question")
            for node in body.categories
        }
        expected_tags: dict[tuple[str, str], tuple[object, ...]] = {
            (scope, node.id): (
                node.name,
                node.parentId,
                node.sortOrder,
                node.status,
                node.selectable,
                [],
            )
            for scope, target in (("content", "lesson"), ("question", "question"))
            for node in body.tags
            if target in node.appliesTo
        }
        actual_categories = {
            (node.scope, node.id): (node.names, node.parent_id, node.sort_order, node.status)
            for node in categories
        }
        actual_tags = {
            (node.scope, node.id): (
                node.names,
                node.parent_id,
                node.sort_order,
                node.status,
                node.selectable,
                node.applicability,
            )
            for node in tags
        }
        if actual_categories != expected_categories or actual_tags != expected_tags:
            raise ValueError(
                "Existing taxonomy differs from the starter; refusing to overwrite it."
            )
        return {
            "catalogVersion": record.version if record else 1,
            "categories": len(body.categories),
            "tags": len(body.tags),
            "installed": False,
        }
    result = import_catalog(db, body)
    record_audit(
        db,
        str(uuid.uuid4()),
        "taxonomy_seed_imported",
        actor.id,
        {**result, "source": "master-kit-canonical"},
    )
    return {**result, "installed": True}
