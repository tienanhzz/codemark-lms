# ADR-0004: Learning Taxonomy and Assignment Filters

- Status: Accepted, taxonomy shape revised by `PRODUCT_REQUIREMENTS.md` on 2026-11-05
- Date: 2026-11-04

## Context
Teachers need a broad and extensible way to classify lessons and questions, including questions that belong to several topics at once (for example, arrays and hash maps). The taxonomy must support discovery without coupling content to a fixed enum or allowing later edits to silently change an assignment.

## Decision
- Maintain administrator-managed **categories** and **tags** shared across lesson/question discovery. Each question has one primary hierarchical category and may have multiple reusable tags; lessons may have multiple tags. IDs are stable and labels may be localized.
- Keep category hierarchy separate from tags. Category filters offer an explicit include-subcategories option; tag hierarchy is navigation only and does not implicitly include descendants.
- Reject inactive or inapplicable tags when saving content or filtering assignments. Keep labels and category ordering out of content records so taxonomy edits do not require rewriting every lesson/question.
- Allow administrators to create, rename, reorder, activate, retire, merge, and re-parent categories/tags. Core enforces unique IDs, valid parent references, no hierarchy cycles, and permission checks. Retire rather than hard-delete entries referenced by content.
- The existing unified taxonomy JSON seed is legacy scaffolding and must be reconciled into separate category/tag records before migrations.
- Coding questions support multiple tags. Lessons use the same `tagIds` reference shape.
- Assignment drafts can select questions manually or filter the question bank by tags, with explicit any/all matching. Before publishing, persist the resolved question IDs and immutable question-version IDs as an ordered snapshot alongside the selection criteria; subsequent question or taxonomy changes do not silently alter an active assignment.
- Start with the extensible catalog in `contracts/core-api/learning-taxonomy.example.json`; it is sample data and is not a closed list.

## Rationale
Stable IDs and a shared taxonomy enable consistent discovery across lessons and questions. Explicit category/tag filter semantics keep search predictable, and a published question snapshot preserves assignment integrity even as administrators evolve the taxonomy.

## Consequences
- Positive: teachers can apply multiple topics to one question and reuse the same taxonomy for lessons and assignment search.
- Positive: administrators can expand or reorganize tags without deploying application code.
- Trade-off: Core needs separate category/tag CRUD, validation, search/index support, and lifecycle rules; the dashboard needs category and hierarchical multi-tag pickers.
- Trade-off: assignment publication must resolve and persist question IDs transactionally with the assignment state.
- Tag names can be localized without changing the stable IDs used by questions, lessons, or assignments.

## Acceptance criteria for runtime implementation
- A question has one active primary category and multiple active, applicable tags; a lesson can reference multiple active, applicable tags.
- Admin attempts to create duplicate IDs, invalid parents, cycles, or invalid content references are rejected with actionable errors.
- Any/all tag filters match direct tag IDs; category descendants are included only when the explicit option is selected.
- Publishing a tag-filtered assignment records the resolved question/version IDs; later tag/question edits do not change the published set or served question content.
- Retired tags remain readable on historical content and assignments, but cannot be newly assigned.
