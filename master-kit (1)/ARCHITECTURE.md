# ARCHITECTURE

## Architecture Style
- Modular monorepo
- Core as single source of truth
- Generated agent adapters
- Contract-first interfaces
- Application backend: Python 3.13 + FastAPI, with SQLAlchemy 2 and Alembic for PostgreSQL persistence/migrations (ADR-0005).
- Role-based web interface: Next.js, Tailwind CSS, and Font Awesome (user-approved).

## Top-level modules
- `modules/core`: business rules, policy hierarchy, orchestration, approvals, audit, state.
- Core domain scope includes identity/access, courses/content/assessments, execution grading, attendance, EXP/Coin economy, ranks, achievements, marketplace, clans, and notifications.
- Security baseline, including dependency review, runtime network egress, cryptography, and opaque references, is defined in `SECURITY_STANDARDS.md` and ADR-0006.
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
- PostgreSQL is the authoritative store for business data, versioned policies, EXP/Coin ledgers, audit data, and the transactional outbox.
- Redis is the initial shared infrastructure target for background jobs, cross-instance realtime fan-out, and ephemeral distributed coordination (presence, rate limits, and short-lived locks). Realtime is implemented with `python-socketio` (`AsyncServer`/ASGI integration), `AsyncRedisManager`, browser `socket.io-client`, a PostgreSQL transactional outbox dispatcher, and an Nginx load balancer in the local multi-instance deployment. Redis Streams runner dispatch includes an at-least-once outbox publisher, a standalone consumer group with pending reclaim, metadata-only dead-lettering, durable job identity, idempotent result persistence, and a payload-free queue snapshot (ADR-0009). Runner execution, operator dashboards/alerts, retention operations, and deployment validation remain pending.
- Socket.IO runs over TLS for browser connections and complements, rather than replaces, HTTP REST APIs. It delivers relevant committed Admin/Teacher changes across all instances to authorized user/course/resource subscribers; it must not broadcast private data to every client.
- Redis is not the source of truth for business state. Persist state changes first, then publish events; use an outbox and idempotent consumers to tolerate retries and duplicate delivery.
- Keep queue and realtime traffic on separate Redis deployments when operationally practical. If sharing one deployment initially, use separate key prefixes, connection pools, capacity limits, and monitoring; do not rely on Redis logical databases for isolation.
- Socket.IO delivery is best-effort. Clients recover authoritative state through Core APIs; do not use Pub/Sub as a durable event log. Persist domain changes and outbox records atomically before publishing minimal event/revision hints; enforce session, origin, room/subscription authorization and revalidate access changes.
- Runtime components have no public Internet egress by default. Dependencies may be installed from approved package registries during development/build, but runtime packages and static assets are bundled/self-hosted. No external CDN, third-party API, telemetry, or remote runtime asset is permitted. Authenticated calls between this LMS's own services are allowed.
- `tools/local_autograder` is an installable reusable library with an optional CLI for trusted C, Java, and Python source. It includes a non-executing, configurable static policy analyzer, but that analysis is heuristic and cannot establish safety. Grading execution requires explicit trusted-source confirmation, runs as the developer's OS user, and is not a sandbox; never pass student/untrusted source to it or wire execution into LMS/API/worker services (ADR-0010). Student-code execution and automated grading remain disabled. ADR-0008's gVisor proposal is historical/superseded for the initial scope; any future untrusted-code execution needs a new product/security decision.
- Public URLs and API contracts use random non-sequential resource IDs, never database sequence values. A shared backend `ResourceReferenceCodec` may produce authenticated-encryption references for special concealment needs; opaque identifiers do not grant access and every operation still passes server-side authorization.

## EXP, rank, and economy
- All roles may earn EXP and Coin. EXP drives two separate, Admin-managed rank tracks: Student and staff. Student rank labels are a separate academic-style set; staff tiers use English League-style labels and may have role-specific criteria.
- There are no rank seasons. Rank is derived from the current EXP balance; EXP spending or an audited deduction may lower rank. EXP and Coin changes use append-only, idempotent ledgers; no client may directly mutate balances.
- Mission, streak, reward, item, marketplace, and clan policies are versioned and audited. Mission changes apply from the next cycle. Coins reserved for offers or events are escrowed and settle/return atomically.
- Core validates rank thresholds, role eligibility, reward provenance, transaction fees, item effects, and authorization. Configurable effects are selected from supported server-defined types, not arbitrary scripts.
- Redis may cache rank/leaderboard summaries as rebuildable projections; PostgreSQL remains authoritative.

## Learning content taxonomy
- Core owns administrator-managed categories and tags. Each question has one primary hierarchical category and may reference multiple reusable tags.
- Questions store a stable category ID and multiple tag IDs; lessons use stable tag IDs. Labels can be localized, while IDs remain stable across renames.
- The dashboard provides multi-select tag pickers and tag-based question search when preparing assignments. Assignment publication resolves the chosen filter to an ordered snapshot of question IDs and immutable question-version IDs so later taxonomy or question edits do not silently change work already assigned.
- Tag filters use explicit `any` (a question has at least one selected tag) or `all` (a question has every selected tag) semantics. Tag parentage is for navigation only. Category filtering has an explicit include-subcategories option; descendants are not implicit unless that option is selected.
- Admins can add, rename, reorder, activate, retire, and re-parent categories/tags. Categories are navigational and are not attached in place of tags. Only active, applicable tags can be attached to content or used as tag filters. Retire rather than hard-delete entries referenced by content; Core validates parent references, prevents cycles, and checks tag applicability.
- The seed catalog in `contracts/core-api/learning-taxonomy.example.json` contains six categories and 67 tags. It is an extensible starting point, not a closed enum.

## Status
- Initial structure and contracts created.
- Screen-level product requirements are recorded in `PRODUCT_REQUIREMENTS.md`; no SSO or Moodle integration is planned initially, and account/course provisioning starts with audited CSV workflows.
- Runtime implementation is partial: the identity/course/taxonomy/question API foundations, Socket.IO/Redis realtime delivery, Redis Streams runner queue plumbing, assessment delivery increment, and standalone trusted-source Local Autograder have runtime implementations. The Local Autograder is not part of the LMS request path and does not execute learner code. Student-code execution/grading, authenticated result ingress, other background jobs, ranks/economy, and most Admin UI workflows remain pending.
