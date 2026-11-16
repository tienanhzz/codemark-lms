# AI Development Master Kit

This repository contains the **AI Development Master Kit** foundation.

Current delivery is an initial, phase-based baseline focused on:
- mandatory governance and reporting artifacts,
- modular monorepo structure definition,
- contract-first core API scaffolding,
- ADR-based architectural decision tracking.

Current specifications include Redis-backed job/realtime boundaries, user-facing requirements in `PRODUCT_REQUIREMENTS.md`, configurable ranks/EXP/Coin, a hierarchical category and multi-tag taxonomy, and an initial PostgreSQL relational data model. The seed catalog has six categories and 67 tags; assignments snapshot immutable question versions.

Phase 2 contract work includes the OpenAPI 3.1 specification at `contracts/core-api/openapi.yaml`, covering access policy, courses, all question formats, assessment/grading, account/CSV, attendance, exam incidents, ledger-backed economy/clans, achievements, reports, notifications, and dormant code-runner boundaries. The standalone Local Autograder supports trusted local C, Java, and Python validation only; it is not a sandbox or LMS service. Student-code execution is disabled.

The initial account-provisioning direction is CSV with email invitations and local authentication; SSO and Moodle integration are deferred. Product requirements are specifications, not implemented application behavior.

The repository is still a scaffold: database, APIs, workers, and dashboard workflows have not been implemented.

Security requirements are maintained in `SECURITY_STANDARDS.md`. Dependencies may be installed with their package managers during development/build, but runtime assets must be bundled/self-hosted: no public CDN, remote images/fonts/scripts/styles, telemetry, or third-party hosted API. Runtime outbound network access remains denied by default; authenticated internal LMS APIs and the approved self-hosted mail relay are allowed. Public URLs must not expose sequential database IDs. A standard-cryptography resource-reference service is specified for special cases.

Implementation proceeds incrementally by approved phases.

The original BUILD definitions/history are tracked in [`BUILDING_PROCESS.md`](./BUILDING_PROCESS.md). The current local application now follows those original IDs starting at BUILD-000 in [`../cyb3rt1tan-lms/docs/MASTER-KIT-EXECUTION.md`](../cyb3rt1tan-lms/docs/MASTER-KIT-EXECUTION.md). The former BUILD-013-next statement and short local BUILD-01…09 sequence are superseded. Historical runtime completion is not local acceptance; hosted CI remains part of final release acceptance.

## Contract validation

GitHub Actions runs contract validation on pushes, pull requests, and manual dispatch. The workflow checks the OpenAPI 3.1 document and local references, all JSON Schemas and paired examples, selected cross-contract invariants, and patch whitespace. Run the same validation locally with `python scripts/validate_contracts.py` after installing `requirements-ci.txt`.
