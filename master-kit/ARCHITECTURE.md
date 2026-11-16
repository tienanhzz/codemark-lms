# ARCHITECTURE

## Architecture Style
- Modular monorepo
- Core as single source of truth
- Generated agent adapters
- Contract-first interfaces

## Top-level modules
- `modules/core`: business rules, policy hierarchy, orchestration, approvals, audit, state.
- `modules/adapters/*`: generated native configs for Copilot, Claude Code, Cursor.
- `modules/packs`: technology-pack definitions and compatibility rules.
- `modules/skills`: curated registry and approval metadata.
- `modules/mcp-registry`: MCP integration metadata, permissions, and risk tracking.
- `modules/cli`: cross-platform CLI using Core APIs.
- `modules/dashboard`: local web dashboard using Core APIs.

## Dependency direction
- Core is framework-neutral.
- CLI and Dashboard depend on Core contracts.
- Adapters depend on Core contracts and adapter-specific templates only.
- Packs and skills are data/config + validation inputs; they do not own Core policy.

## Runtime infrastructure baseline
- PostgreSQL is the authoritative store for business data, rank policies, rank-point ledger entries, and the transactional outbox.
- Redis is the initial shared infrastructure for BullMQ background jobs, Socket.IO cross-instance fan-out, and ephemeral distributed coordination (presence, rate limits, and short-lived locks).
- Redis is not the source of truth for business state. Persist state changes first, then publish events; use an outbox and idempotent consumers to tolerate retries and duplicate delivery.
- Keep queue and realtime traffic on separate Redis deployments when operationally practical. If sharing one deployment initially, use separate key prefixes, connection pools, capacity limits, and monitoring; do not rely on Redis logical databases for isolation.
- WebSocket delivery is best-effort. Clients recover authoritative state through Core APIs; do not use Pub/Sub as a durable event log.

## Teacher and Teaching Assistant ranks
- Core owns rank calculation and policy validation. Dashboard provides admin CRUD for rank tiers, point thresholds, and role-specific promotion tasks through Core APIs.
- The initial English tier names and example thresholds/tasks are in `contracts/core-api/teacher-rank-policy.example.json`.
- Rank points are season-scoped and recorded in an auditable PostgreSQL ledger. A role is eligible for a tier only after reaching its minimum points and completing every required task for that role.
- Task criteria use trusted backend metrics or an explicit admin review; administrators configure requirements, not arbitrary executable scoring rules.
- Cache rank summaries in Redis only as rebuildable projections. Policy edits are versioned and audited.

## Learning content taxonomy
- Core owns one administrator-managed, hierarchical taxonomy shared by lessons and coding questions. A taxonomy entry is a reusable tag; content may reference multiple tags.
- Questions and lessons store stable tag IDs, not copied labels. Tag labels can be localized, while IDs remain stable across renames.
- The dashboard provides multi-select tag pickers and tag-based question search when preparing assignments. Assignment creation resolves the chosen filter to an explicit question-ID snapshot so later taxonomy or question edits do not silently change work already assigned.
- Tag filters use explicit `any` (a question has at least one selected tag) or `all` (a question has every selected tag) semantics. Matching is against directly assigned tag IDs; category hierarchy is for navigation and does not implicitly include descendants.
- Admins can add, rename, reorder, activate, retire, and re-parent tags. A non-assignable taxonomy node is a grouping-only category; only active, assignable tags can be attached to content or used as assignment filters. Retire rather than hard-delete tags referenced by content; Core validates parent references, prevents cycles, and checks tag applicability to the content type.
- The seed catalog in `contracts/core-api/learning-taxonomy.example.json` is an extensible starting point, not a closed enum. It includes programming basics, data structures and algorithms, software design, databases/backend, testing/quality, and mathematics.

## Status
- Initial structure and contracts created.
- Runtime implementations and admin UI are pending; Redis, queue, realtime, rank, and learning-taxonomy decisions/contracts are specifications, not deployed services.
