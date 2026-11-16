# BUILD-028 — Taxonomy and question authoring

**Local status: Implemented; local deployment and visual QA in progress**

Implemented increments:

- Separate persistent lesson/question category and tag trees, localized labels, applicability/selectability, catalog versions, audit records, retirement safeguards and merge redirects.
- Course-scoped question bank search and immutable numbered drafts, strict bundled schemas, type-specific answer/reference validation, validation and publication transitions, and Student-safe projections.
- Protected per-course question assets with a 2 MB limit, content checks, image re-encoding, immutable PostgreSQL triggers and role/course access. Listening sets can publish after child and audio validation. Code questions remain drafts; execution is unavailable.
- Immutable Admin runtime-profile Draft metadata and connected bilingual Taxonomy, Question Bank and Runtime Profiles screens.
- Version-checked, one-time Admin import of the bundled 6-category/67-tag catalog, exposed in the UI and through `scripts/import-taxonomy.py`; both lesson and question trees are populated atomically, and populated catalogs are not overwritten.
- Redis Streams transport plumbing backed by the PostgreSQL transactional outbox: bounded envelopes and safe paths, capped dispatch retry/exhaustion, consumer group reclaim, outbox digest verification, durable admission before ack, metadata-only dead-letter entries, idempotent result storage, and payload-free Admin queue metrics. Dispatcher/consumer are explicit CLI processes, are not attached to API startup, and never execute code.
- Queue operations status is connected to the Admin workspace with loading/unavailable states, responsive layout and EN/VI labels. Queue remains disabled by default; Redis is not installed/running locally and no live Redis transport was exercised.

Verification completed:

- API: 114 tests pass; focused queue/persistence and BUILD-029 authoring/attempt tests pass.
- Web: 51 tests pass, TypeScript check and Next.js production build pass.
- Ruff and strict mypy pass.
- PostgreSQL migration cycle through 0017, repeated upgrade and schema drift pass. Course integration validates taxonomy merge/redirect, question authoring, Listening publication/audio access, queue admission/result/deduplication/dead-letter metrics, immutable records, assessment recipients/attempt start/autosave/submit, runtime metadata, question/version/asset guards and BUILD-027 workflows. Redis transport uses an in-memory test double.
- Main local `codemark_lms` upgraded through 0017 with a private pre-migration backup and users/sessions/audit/courses count parity; no reset, reseed, or account creation. The catalog is still empty and requires an authenticated Admin import.
- Master-kit contract validator passes: OpenAPI 3.1, 172 paths / 199 operations, 19 schemas and 17 examples.

Student-code execution and runtime-profile activation remain disabled. Confirming the canonical catalog in the main local database and browser visual, keyboard and mobile inspection remain pending. Redis live-service/reconnect verification is pending because no Redis server is installed locally.
