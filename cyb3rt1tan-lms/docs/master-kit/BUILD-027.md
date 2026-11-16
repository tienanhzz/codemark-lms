# BUILD-027 — Course lifecycle and planning

**Status:** Done — local functional scope, 2026-11-15
**Source:** `master-kit (1)/PRODUCT_REQUIREMENTS.md`, `master-kit (1)/API_CONTRACTS.md`, `master-kit (1)/BUILDING_PROCESS.md`

## Completed scope

- Course lifecycle, catalog, staff, enrollment, permission grants, lesson plans, and Course Rules remain persisted and permission checked.
- Sessions support daily/weekly recurrence in the course timezone, DST-safe local times, and audited per-session cancel/reschedule exceptions.
- Course planning UI has Calendar and List views, recurrence creation, exception editing, loading/error/empty states, accessible controls, and EN/VI copy.
- Course overview exposes modules, learning resources, useful links, software, and assessment projection through live API reads and revision-checked writes.
- Grade schemes use per-course immutable numbered versions, validated component weights and conversion bands, and a publication workflow connected to the UI.
- Effective Course Rules are snapshotted per course as append-only publications. The UI shows version/template/date and supports bounded history pagination.

## Validation

- API: 98 passed; web: 46 passed; Ruff check, TypeScript typecheck, and Next production build passed.
- PostgreSQL migration downgrade/upgrade/repeat/head/drift passed on `codemark_lms_test`; course workflow integration passed for recurring sessions, exceptions, resources, grade scheme publication, Course Rules history, and archive retention.
- PostgreSQL triggers rejected mutation of published grade scheme content and Course Rules snapshots. The JSON comparison uses `jsonb` casts because PostgreSQL has no equality operator for `json`.
- OpenAPI source validation passed: 172 paths, 199 operations, 19 schemas, 17 examples, 57 source documents.
- Main `codemark_lms` upgraded through 0010 after private backup. Migration verification confirmed parity for users, sessions, audit events, and courses; no reseed/reset occurred.
- HTTP verification passed for 54 workspace routes and 15 production/foundation routes, including security headers and authentication boundaries.
- Browser visual, keyboard, and mobile inspection remains pending; HTTP/DOM evidence does not replace it.

Evidence: [BUILD-027-validation.json](BUILD-027-validation.json)
