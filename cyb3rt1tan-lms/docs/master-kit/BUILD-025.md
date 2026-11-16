# BUILD-025 — PostgreSQL persistence and security foundation

Execution: `local-master-kit-2026-11-14`, continued 2026-11-15. Reuse existing identity/course migrations and audit/session boundaries; add the missing outbox and deployment configuration instead of recreating the app or accounts.

## Implemented

- Migration **0005_outbox_foundation**, restrictive audit FK, unique audit-event/idempotency references, status/attempt constraints and pending-status index. No historical audit backfill and no learner-code execution.
- Shared atomic audit/outbox helper for existing HTTP mutations and controlled bootstrap; payload-free event metadata, bounded/strict fields and digest comparison. PG ON CONFLICT handles two concurrent transactions retrying the same persisted event.
- PostgreSQL audit protection now covers UPDATE/DELETE/**TRUNCATE**; row counts and history are retained through the additive migration.
- Explicit local/test/production modes, in-memory-test-only SQLite, bounded connection pool/overflow/waits, server statement/lock/connect timeouts and redacted configuration.
- Production verify-full TLS/CA, HTTPS origin/Secure cookie checks, separate migrator identity, same-target guard in all modes, and fail-closed runtime privilege checks. Deployment/permission acceptance itself is not claimed complete.
- Admin-only no-store `/v1/admin/operations/persistence` and connected UI at `/operations`: live database/environment/migration/pool/outbox counts, disabled-dispatcher state, local-production boundary. Redis/realtime status remains preview/unavailable and is not shown as green live health.
- Private backup before main DB migration, count parity for users/sessions/audit/courses, no account/course reseeding; helper scripts safely operate only on verified local processes/targets.
- ADR-0007 PostgreSQL/private-storage design retained. No protected object-storage runtime is introduced in this foundation task.

## Evidence

- **55 API tests**, Ruff check/format, strict mypy pass; tests include TLS/mode/pool/redaction/migration-target checks, transaction rollback, idempotency/payload rejection, role boundaries and source response schema.
- **22 web DOM/timezone tests**, TypeScript and production build pass. Diagnostics tests distinguish live values from service failure rather than fabricate healthy counts.
- Real PostgreSQL 17 migration downgrade/re-upgrade/repeated upgrade/schema drift/audit integration, all prior identity/course flows, concurrent outbox enqueue, business/audit/outbox rollback and UPDATE/DELETE/TRUNCATE rejection pass on isolated test DB.
- Production HTTP smoke via QA proxy passes identity/course/ETag/Student visibility and authenticated persistence diagnostics. All **51 workspace routes**, CSP, unknown-route 404 and unauthenticated 401 pass.
- Source contracts pass: **151 paths / 175 operations**, 19 JSON schemas, 17 examples. Persistence DTO generated from the source contract.
- Main DB upgraded to head **0005_outbox_foundation** with private backup and existing-row count parity; no default Admin/password or sample data added.

Status: **Done for persistence/security-foundation scope** after final deployment smoke. Browser visual/keyboard/mobile, real SMTP delivery, positive production TLS/role provisioning, managed keys, encrypted backup/restore drills and hosted CI remain unverified. Redis dispatch belongs to BUILD-034; this is not a production release or a complete identity/course product acceptance.

Operational/configuration details: [DEPLOYMENT-DATABASE.md](../DEPLOYMENT-DATABASE.md). Next original build: **BUILD-026**, re-evaluate existing identity/UI first, then implement remaining original Product requirements and connected screens.
