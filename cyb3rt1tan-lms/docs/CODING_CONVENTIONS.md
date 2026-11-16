# Application coding conventions

Canonical standard: [`../../master-kit (1)/CODING_CONVENTIONS.md`](../../master-kit%20%281%29/CODING_CONVENTIONS.md), together with Product, current ADRs, Security Standards and OpenAPI. This file provides the correct local entry point without copying an evolving standard.

- Keep Python APIs/domain code in `api/app`, migrations in `api/migrations`, isolated tests in `api/tests`. SQLAlchemy transactions commit business/audit/outbox state atomically as each domain is implemented.
- Use strict TypeScript, shared accessible components, EN/VI messages, account-scoped preferences and local assets. UI actions do not establish authorization.
- Generate public DTOs with `scripts/generate-types.py`. Do not edit `web/lib/contracts.ts` manually. Additional typed UI view-models must stay consistent with their source contracts and be checked when that domain is completed.
- Ruff format/check, strict mypy, pytest, web DOM tests/typecheck/build and contract validation are baseline checks. Real PostgreSQL integration is required for schema/security changes. Record browser verification separately.
- Dependency locks are `api/requirements.lock`, `web/package-lock.json` and build-only `tooling/security-requirements.lock`. Keep tooling outside runtime environments. Generate SBOM/license inventory with `scripts/foundation-evidence.py`; query feeds only at build time using `scripts/audit-dependencies.py`.
- Never read or print user secrets to populate reports. Ignore `.env`, `.venv`, `.local`/backups, node_modules and build output. No learner-code execution or unreviewed upstream skill installers.
- Execute and report original BUILD IDs through [MASTER-KIT-EXECUTION.md](MASTER-KIT-EXECUTION.md). Historical source Done or a passing preview is not local product completion.
