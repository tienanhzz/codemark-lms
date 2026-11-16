# VALIDATION_REPORT

## CI
- Added `.github/workflows/contracts.yml`, triggered by pushes, pull requests, and manual dispatch, with read-only repository permissions.
- The workflow installs pinned Python validation dependencies and runs `scripts/validate_contracts.py`; it also checks whitespace across the event's Git diff.
- The workflow has not yet been observed on GitHub; local execution of the same contract validation command passed.

## Local validation in this change
- `python3 scripts/validate_contracts.py` passed with OpenAPI 3.1 validation: 105 paths and 125 operations, resolved local references, unique operation IDs, complete path parameters, and prose-route consistency.
- All 19 JSON Schemas passed their declared metaschema checks; all 17 paired examples passed validation, including cross-file references.
- Cross-contract checks passed for matching question content/private-config discriminators, taxonomy parent references and cycles, question/lesson tag applicability, unique IDs/positions, student/staff rank thresholds, and code-test/rubric/assessment point totals.
- Per-user preference contract validates supported English/Vietnamese locales, light/dark appearance, and eight unique selectable palette IDs; `/me/preferences` is part of the OpenAPI contract.
- `git diff --check` passed locally.
- Added the accepted security baseline and ADR-0006; this is documentation/specification, not runtime enforcement. User clarification permits package-manager downloads at development/build time while prohibiting third-party CDN/runtime assets and APIs; runtime egress enforcement remains pending.
- Added a permission-scoped Student Learning Overview route and student-progress report contract covering course enrollment, attendance, practice, lessons, assessments, and permission-filtered grades/details.
- Verified that `studentProgress` report requests require `filters.studentId` while other report types remain valid without it.
- Preview JavaScript syntax, settings navigation, preference application and per-user persistence/isolation, HTML ID uniqueness, referenced assets, and the one-to-one mapping between all eight API palettes and preview themes passed local checks.
- Semantic coverage currently validates representative contract examples and selected invariants; authorization, privacy, immutability, idempotency, and broader cross-record behaviors still need executable tests.
- The initial repository baseline contained no runtime source files, dependency manifests, vendored code, or nominated upstream candidates.
- Four skill repositories were statically audited at pinned snapshots. No upstream code was executed or imported; Animate UI is represented by project-authored guidance only, as documented in `SOURCE_AUDIT.md`.
- Added `PRODUCT_REQUIREMENTS.md` from user-approved choices across role-specific pages and workflows. This is a documentation-only specification; it does not claim implementation or functional validation.
- Reconciled the logical model and current discovery contracts with product requirements. OpenAPI/API contracts are specifications, not implementations; migrations, runner deployment, and application behavior remain unimplemented.
- Confirmed initial integration scope is CSV/manual provisioning with email invitations and local authentication; SSO and Moodle are deferred.
- Repository file checks executed via git status.
- Socket.IO/Redis integration was validated in an isolated Compose deployment: two authenticated clients connected to separate API instances and both received the same audited mutation event; an authenticated mutation and WebSocket upgrade also passed through Nginx. The default local Compose stack reached healthy API/PostgreSQL/Redis services and served the frontend with a matching same-origin WebSocket CSP. The disposable test project and its volumes were removed afterward.
- The full API suite, including Redis consumer-group recovery/admission and result-idempotency tests, passed; changed queue/API modules pass Ruff, formatting, and strict mypy. Migration 0014 passed isolated SQLite migration/schema checks; contract validation and both worktree whitespace checks passed. Web typecheck/build validation is unchanged.

## Untested
- Cross-platform install and runtime execution.
- Core APIs and adapter generation behavior.
- CLI/dashboard functional tests.
- Redis Streams publishing and consumer-group admission/recovery, metadata-only dead-lettering, durable job identity, and idempotent result persistence are implemented. Runner execution, authenticated result ingress, production queue monitoring/retention/conformance, and teacher/TA rank policy administration remain unimplemented.
- Taxonomy administration, multi-tag question/lesson workflows, and assignment snapshots (specified only; runtime pending).
- Runtime profile isolation, resource enforcement, grading workers, and exam/assessment workflows (specified only; runtime pending).
