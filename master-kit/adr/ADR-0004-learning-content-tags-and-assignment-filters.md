# ADR-0004: Shared Learning-Content Tags and Assignment Filters

- Status: Accepted
- Date: 2026-11-04

## Context
Teachers need a broad and extensible way to classify lessons and coding questions, including questions that belong to several topics at once (for example, arrays and hash maps). The same classification must support finding questions for student assignments without coupling content to a fixed enum or allowing later edits to silently change an assignment.

## Decision
- Maintain one hierarchical, administrator-managed taxonomy shared by lessons and coding questions. Each taxonomy entry is a reusable tag with a stable ID and localized labels; content references one or more tag IDs.
- Store applicability per tag (`lesson`, `codingQuestion`) and reject inactive, non-assignable, or inapplicable tags when saving content or filtering assignments. Non-assignable nodes are navigation/grouping categories only. Keep labels and category ordering out of content records so taxonomy edits do not require rewriting every lesson/question.
- Treat parent-child links as navigation only. Filtering is performed against the explicitly selected IDs: `any` matches at least one selected tag; `all` requires every selected tag. Descendants are not implicitly included.
- Allow administrators to create, rename, reorder, activate, retire, and re-parent tags. Core enforces unique IDs, valid parent references, no hierarchy cycles, and permission checks. Retire rather than hard-delete tags referenced by content.
- Coding questions support multiple tags. Lessons use the same `tagIds` reference shape.
- Assignment drafts can select questions manually or filter the question bank by tags, with explicit any/all matching. Before publishing, persist the resolved question IDs as a snapshot alongside the selection criteria; subsequent question or taxonomy changes do not silently alter an active assignment.
- Start with the extensible catalog in `contracts/core-api/learning-taxonomy.example.json`; it is sample data and is not a closed list.

## Rationale
Stable IDs and a shared taxonomy enable consistent discovery across lessons and questions. Explicit filter semantics keep search predictable, and a published question snapshot preserves assignment integrity even as administrators evolve the taxonomy.

## Consequences
- Positive: teachers can apply multiple topics to one question and reuse the same taxonomy for lessons and assignment search.
- Positive: administrators can expand or reorganize tags without deploying application code.
- Trade-off: Core needs taxonomy CRUD, validation, search/index support, and tag lifecycle rules; the dashboard needs a hierarchical multi-select picker.
- Trade-off: assignment publication must resolve and persist question IDs transactionally with the assignment state.
- Tag names can be localized without changing the stable IDs used by questions, lessons, or assignments.

## Acceptance criteria for runtime implementation
- A coding question and a lesson can each reference multiple active, applicable tags.
- Admin attempts to create duplicate IDs, invalid parents, cycles, or invalid content references are rejected with actionable errors.
- Any/all question filters match the documented direct-ID semantics.
- Publishing a tag-filtered assignment records the resolved question IDs; later tag/question edits do not change that published set.
- Retired tags remain readable on historical content and assignments, but cannot be newly assigned.
