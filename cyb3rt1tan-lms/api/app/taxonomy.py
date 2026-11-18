"""Persistent, audited lesson and question taxonomy catalogs."""

from typing import TypeVar, cast

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import DB, Admin, Principal, audit, lock_admin
from .models import (
    Course,
    Question,
    QuestionVersion,
    QuestionVersionTag,
    TaxonomyCatalog,
    TaxonomyCategory,
    TaxonomyRedirect,
    TaxonomyTag,
)
from .taxonomy_dto import (
    TaxonomyMerge,
    TaxonomyNodeCreate,
    TaxonomyNodePatch,
    TaxonomyScope,
    TaxonomySeed,
    TaxonomySeedCategory,
    TaxonomyTagCreate,
    TaxonomyTagPatch,
)

router = APIRouter(prefix="/v1")
TaxonomyModel = type[TaxonomyCategory] | type[TaxonomyTag]
SeedNode = TypeVar("SeedNode", bound=TaxonomySeedCategory)


def catalog(db: Session) -> TaxonomyCatalog:
    item = db.scalar(select(TaxonomyCatalog).where(TaxonomyCatalog.id == "main").with_for_update())
    if item is None:
        item = TaxonomyCatalog(id="main", version=1)
        db.add(item)
        db.flush()
    return item


def nodes_json(
    db: Session, scope: str, user: Principal, include_retired: bool
) -> dict[str, object]:
    if include_retired and "admin" not in user.roles:
        raise HTTPException(403, "forbidden")
    categories = select(TaxonomyCategory).where(TaxonomyCategory.scope == scope)
    tags = select(TaxonomyTag).where(TaxonomyTag.scope == scope)
    if not include_retired:
        categories = categories.where(TaxonomyCategory.status == "active")
        tags = tags.where(TaxonomyTag.status == "active")
    categories = categories.order_by(TaxonomyCategory.sort_order, TaxonomyCategory.id)
    tags = tags.order_by(TaxonomyTag.sort_order, TaxonomyTag.id)
    version = db.get(TaxonomyCatalog, "main")
    include_counts = "admin" in user.roles
    category_counts: dict[str, int] = {}
    tag_counts: dict[str, int] = {}
    if include_counts and scope == "content":
        for plan in db.scalars(select(Course.lesson_plan)):
            for entry in plan:
                values = entry.get("tagIds", [])
                for tag_id in (
                    {value for value in values if isinstance(value, str)}
                    if isinstance(values, list)
                    else set()
                ):
                    tag_counts[tag_id] = tag_counts.get(tag_id, 0) + 1
    if include_counts and scope == "question":
        category_counts = dict(
            db.execute(
                select(
                    QuestionVersion.category_id,
                    func.count(func.distinct(QuestionVersion.question_id)),
                )
                .where(QuestionVersion.category_scope == "question")
                .group_by(QuestionVersion.category_id)
            ).all()
        )
        tag_counts = dict(
            db.execute(
                select(QuestionVersionTag.tag_id, func.count(func.distinct(Question.id)))
                .join(QuestionVersion, QuestionVersion.id == QuestionVersionTag.question_version_id)
                .join(Question, Question.id == QuestionVersion.question_id)
                .where(QuestionVersionTag.tag_scope == "question")
                .group_by(QuestionVersionTag.tag_id)
            ).all()
        )
    category_values: list[dict[str, object]] = []
    for category in db.scalars(categories):
        value: dict[str, object] = {
            "id": category.id,
            "names": category.names,
            "parentId": category.parent_id,
            "status": category.status,
            "sortOrder": category.sort_order,
        }
        if include_counts:
            value["usageCount"] = category_counts.get(category.id, 0)
        category_values.append(value)
    tag_values: list[dict[str, object]] = []
    for item in db.scalars(tags):
        tag = item
        value = {
            "id": tag.id,
            "names": tag.names,
            "parentId": tag.parent_id,
            "status": tag.status,
            "sortOrder": tag.sort_order,
            "selectable": tag.selectable,
            "applicability": tag.applicability,
        }
        if include_counts:
            value["usageCount"] = tag_counts.get(tag.id, 0)
        tag_values.append(value)
    return {
        "scope": scope,
        "catalogVersion": version.version if version else 1,
        "categories": category_values,
        "tags": tag_values,
        "redirects": [
            {"kind": row.node_kind, "sourceId": row.source_id, "targetId": row.target_id}
            for row in db.scalars(select(TaxonomyRedirect).where(TaxonomyRedirect.scope == scope))
        ],
    }


@router.get("/taxonomy")
def content_taxonomy(
    db: DB, user: Principal, includeRetired: bool = Query(default=False)
) -> dict[str, object]:
    return nodes_json(db, "content", user, includeRetired)


@router.get("/question-taxonomy")
def question_taxonomy(
    db: DB, user: Principal, includeRetired: bool = Query(default=False)
) -> dict[str, object]:
    return nodes_json(db, "question", user, includeRetired)


@router.post("/admin/taxonomy/seed", status_code=201)
def seed_taxonomies(body: TaxonomySeed, request: Request, db: DB, user: Admin) -> dict[str, object]:
    lock_admin(db, request, user)
    result = import_catalog(db, body)
    audit(db, request, "taxonomy_seed_imported", user, result)
    return result


def import_catalog(db: Session, body: TaxonomySeed) -> dict[str, object]:
    """Shared atomic importer; callers enforce actor authorization and record audit."""
    record = catalog(db)
    if record.version != body.expectedCatalogVersion:
        raise HTTPException(409, "taxonomy_catalog_version_conflict")
    if db.scalar(select(TaxonomyCategory.id).limit(1)) or db.scalar(
        select(TaxonomyTag.id).limit(1)
    ):
        raise HTTPException(409, "taxonomy_catalog_not_empty")
    category_by_id = {item.id: item for item in body.categories}
    tag_by_id = {item.id: item for item in body.tags}
    if len(category_by_id) != len(body.categories) or len(tag_by_id) != len(body.tags):
        raise HTTPException(422, "taxonomy_seed_duplicate_id")

    def ordered(items: dict[str, SeedNode]) -> list[SeedNode]:
        pending = dict(items)
        result: list[SeedNode] = []
        while pending:
            ready = [
                item
                for item in pending.values()
                if item.parentId is None or item.parentId in {row.id for row in result}
            ]
            if not ready:
                raise HTTPException(422, "taxonomy_seed_invalid_hierarchy")
            for item in sorted(ready, key=lambda row: (row.sortOrder, row.id)):
                result.append(item)
                pending.pop(item.id)
        return result

    category_order = ordered(category_by_id)
    tag_order = ordered(tag_by_id)
    for scope in ("content", "question"):
        for item in category_order:
            db.add(
                TaxonomyCategory(
                    scope=scope,
                    id=item.id,
                    names=item.name,
                    parent_id=item.parentId,
                    status="active",
                    sort_order=item.sortOrder,
                )
            )
    for item in tag_order:
        for applies_to, scope in (("lesson", "content"), ("question", "question")):
            if applies_to in item.appliesTo:
                if item.parentId and not any(
                    row.id == item.parentId and applies_to in row.appliesTo for row in tag_order
                ):
                    raise HTTPException(422, "taxonomy_seed_invalid_hierarchy")
                db.add(
                    TaxonomyTag(
                        scope=scope,
                        id=item.id,
                        names=item.name,
                        parent_id=item.parentId,
                        status="active",
                        sort_order=item.sortOrder,
                        selectable=item.selectable,
                        applicability=[],
                    )
                )
    record.version += 1
    db.flush()
    return {
        "catalogVersion": record.version,
        "categories": len(category_order),
        "tags": len(tag_order),
    }


def check_parent(
    db: Session, model: TaxonomyModel, scope: str, node_id: str, parent_id: str | None
) -> None:
    if parent_id is None:
        return
    if parent_id == node_id:
        raise HTTPException(422, "taxonomy_cycle")
    parent = cast(TaxonomyCategory | TaxonomyTag | None, db.get(model, (scope, parent_id)))
    if parent is None or parent.status != "active":
        raise HTTPException(422, "active_taxonomy_parent_required")
    current: TaxonomyCategory | TaxonomyTag | None = parent
    seen = {node_id}
    while current is not None:
        if current.id in seen:
            raise HTTPException(422, "taxonomy_cycle")
        seen.add(current.id)
        current = (
            cast(TaxonomyCategory | TaxonomyTag | None, db.get(model, (scope, current.parent_id)))
            if current.parent_id
            else None
        )


def create_node(
    db: Session,
    request: Request,
    user: Principal,
    scope: TaxonomyScope,
    model: TaxonomyModel,
    body: TaxonomyNodeCreate | TaxonomyTagCreate,
    is_tag: bool,
) -> dict[str, object]:
    lock_admin(db, request, user)
    check_parent(db, model, scope, body.id, body.parentId)
    if db.get(model, (scope, body.id)):
        raise HTTPException(409, "taxonomy_id_exists")
    values: dict[str, object] = {
        "scope": scope,
        "id": body.id,
        "names": body.names,
        "parent_id": body.parentId,
        "status": "active",
        "sort_order": body.sortOrder,
    }
    if is_tag and isinstance(body, TaxonomyTagCreate):
        values.update(selectable=body.selectable, applicability=body.applicability)
    item = model(**values)
    db.add(item)
    record = catalog(db)
    record.version += 1
    db.flush()
    audit(
        db,
        request,
        f"{scope}_{'tag' if is_tag else 'category'}_created",
        user,
        {"nodeId": item.id, "catalogVersion": record.version},
    )
    return node_json(item)


def node_json(item: TaxonomyCategory | TaxonomyTag) -> dict[str, object]:
    result: dict[str, object] = {
        "id": item.id,
        "names": item.names,
        "parentId": item.parent_id,
        "status": item.status,
        "sortOrder": item.sort_order,
    }
    if isinstance(item, TaxonomyTag):
        result.update(selectable=item.selectable, applicability=item.applicability)
    return result


def update_node(
    db: Session,
    request: Request,
    user: Principal,
    scope: TaxonomyScope,
    node_id: str,
    model: TaxonomyModel,
    body: TaxonomyNodePatch | TaxonomyTagPatch,
    is_tag: bool,
) -> dict[str, object]:
    lock_admin(db, request, user)
    item = cast(
        TaxonomyCategory | TaxonomyTag | None,
        db.get(model, (scope, node_id), populate_existing=True),
    )
    if item is None:
        raise HTTPException(404, "taxonomy_node_not_found")
    changes = body.model_fields_set
    if not changes:
        raise HTTPException(422, "taxonomy_patch_empty")
    parent_id = body.parentId if "parentId" in changes else item.parent_id
    check_parent(db, model, scope, node_id, parent_id)
    if "status" in changes and body.status == "retired":
        active_child = db.scalar(
            select(model.id).where(
                model.scope == scope,
                model.parent_id == node_id,
                model.status == "active",
            )
        )
        if active_child:
            raise HTTPException(409, "taxonomy_has_active_children")
    for field, column in (
        ("names", "names"),
        ("parentId", "parent_id"),
        ("status", "status"),
        ("sortOrder", "sort_order"),
    ):
        if field in changes:
            setattr(item, column, getattr(body, field))
    if is_tag and isinstance(body, TaxonomyTagPatch):
        tag = cast(TaxonomyTag, item)
        if "selectable" in changes:
            tag.selectable = bool(body.selectable)
        if "applicability" in changes:
            tag.applicability = body.applicability or []
    record = catalog(db)
    record.version += 1
    db.flush()
    audit(
        db,
        request,
        f"{scope}_{'tag' if is_tag else 'category'}_updated",
        user,
        {"nodeId": item.id, "catalogVersion": record.version},
    )
    return node_json(item)


def merge_node(
    db: Session,
    request: Request,
    user: Principal,
    scope: TaxonomyScope,
    source_id: str,
    target_id: str,
    model: TaxonomyModel,
    kind: str,
) -> dict[str, object]:
    lock_admin(db, request, user)
    if source_id == target_id:
        raise HTTPException(422, "taxonomy_merge_target_same")
    source = cast(TaxonomyCategory | TaxonomyTag | None, db.get(model, (scope, source_id)))
    target = cast(TaxonomyCategory | TaxonomyTag | None, db.get(model, (scope, target_id)))
    if source is None or target is None:
        raise HTTPException(404, "taxonomy_node_not_found")
    if source.status != "active" or target.status != "active":
        raise HTTPException(409, "taxonomy_merge_requires_active_nodes")
    child = db.scalar(
        select(model.id).where(
            model.scope == scope, model.parent_id == source_id, model.status == "active"
        )
    )
    if child:
        raise HTTPException(409, "taxonomy_has_active_children")
    if db.get(TaxonomyRedirect, (scope, kind, source_id)):
        raise HTTPException(409, "taxonomy_node_already_redirected")
    if isinstance(source, TaxonomyTag) and isinstance(target, TaxonomyTag):
        target.applicability = sorted(set(target.applicability) | set(source.applicability))
        target.selectable = target.selectable or source.selectable
    source.status = "retired"
    db.add(
        TaxonomyRedirect(
            scope=scope,
            node_kind=kind,
            source_id=source_id,
            target_id=target_id,
            created_by=user.id,
        )
    )
    record = catalog(db)
    record.version += 1
    db.flush()
    audit(
        db,
        request,
        f"{scope}_{kind}_merged",
        user,
        {"sourceId": source_id, "targetId": target_id, "catalogVersion": record.version},
    )
    return {"sourceId": source_id, "targetId": target_id, "catalogVersion": record.version}


@router.post("/admin/taxonomy/categories", status_code=201)
def create_content_category(
    body: TaxonomyNodeCreate, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    return create_node(db, request, user, "content", TaxonomyCategory, body, False)


@router.patch("/admin/taxonomy/categories/{node_id}")
def update_content_category(
    node_id: str, body: TaxonomyNodePatch, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    return update_node(db, request, user, "content", node_id, TaxonomyCategory, body, False)


@router.post("/admin/taxonomy/tags", status_code=201)
def create_content_tag(
    body: TaxonomyTagCreate, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    return create_node(db, request, user, "content", TaxonomyTag, body, True)


@router.patch("/admin/taxonomy/tags/{node_id}")
def update_content_tag(
    node_id: str, body: TaxonomyTagPatch, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    return update_node(db, request, user, "content", node_id, TaxonomyTag, body, True)


@router.post("/admin/question-taxonomy/categories", status_code=201)
def create_question_category(
    body: TaxonomyNodeCreate, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    return create_node(db, request, user, "question", TaxonomyCategory, body, False)


@router.patch("/admin/question-taxonomy/categories/{node_id}")
def update_question_category(
    node_id: str, body: TaxonomyNodePatch, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    return update_node(db, request, user, "question", node_id, TaxonomyCategory, body, False)


@router.post("/admin/question-taxonomy/tags", status_code=201)
def create_question_tag(
    body: TaxonomyTagCreate, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    return create_node(db, request, user, "question", TaxonomyTag, body, True)


@router.patch("/admin/question-taxonomy/tags/{node_id}")
def update_question_tag(
    node_id: str, body: TaxonomyTagPatch, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    return update_node(db, request, user, "question", node_id, TaxonomyTag, body, True)


@router.post("/admin/taxonomy/categories/{node_id}/merge")
def merge_content_category(
    node_id: str, body: TaxonomyMerge, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    return merge_node(
        db, request, user, "content", node_id, body.targetId, TaxonomyCategory, "category"
    )


@router.post("/admin/taxonomy/tags/{node_id}/merge")
def merge_content_tag(
    node_id: str, body: TaxonomyMerge, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    return merge_node(db, request, user, "content", node_id, body.targetId, TaxonomyTag, "tag")


@router.post("/admin/question-taxonomy/categories/{node_id}/merge")
def merge_question_category(
    node_id: str, body: TaxonomyMerge, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    return merge_node(
        db, request, user, "question", node_id, body.targetId, TaxonomyCategory, "category"
    )


@router.post("/admin/question-taxonomy/tags/{node_id}/merge")
def merge_question_tag(
    node_id: str, body: TaxonomyMerge, request: Request, db: DB, user: Admin
) -> dict[str, object]:
    return merge_node(db, request, user, "question", node_id, body.targetId, TaxonomyTag, "tag")
