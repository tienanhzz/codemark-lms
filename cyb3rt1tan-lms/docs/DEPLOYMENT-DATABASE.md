# Database modes, identities and persistence boundary

PostgreSQL 17 is authoritative. Local development uses the existing loopback instance and separate `codemark_lms`/`codemark_lms_test`; no user data is copied from Java/H2. Private S3-compatible storage/MinIO remains the ADR-0007 deployment target, not an implemented upload service in BUILD-025.

## Runtime configuration

`APP_ENV` accepts `local`, `test`, `production`; default is `local`. SQLite is accepted only as an in-memory database with explicit `APP_ENV=test`. It is not a runtime fallback when PostgreSQL fails.

| Setting | Default | Bound |
| --- | --- | --- |
| DB_POOL_SIZE | 5 | 1–20 |
| DB_MAX_OVERFLOW | 5 | 0–20 |
| DB_POOL_TIMEOUT | 10 seconds | 1–60 |
| DB_STATEMENT_TIMEOUT_MS | 15000 | 1000–120000 |
| DB_LOCK_TIMEOUT_MS | 5000 | 100–30000 |

PostgreSQL connections use pre-ping, recycle after 1800 seconds and a five-second connect timeout. Total connection capacity must account for every API instance/process and the server limit. SQL parameters are hidden, and database configuration repr excludes the URL.

Production configuration requires a `postgresql+psycopg` URL with `sslmode=verify-full` and `sslrootcert`, explicit runtime credentials, HTTPS APP_ORIGIN and Secure cookies. Certificate validity is checked by the driver when connecting; no plaintext/TLS downgrade fallback exists. Production internal HTTP/service TLS, secret delivery/rotation, firewall/egress, storage encryption and release verification remain separate deployment gates.

## Migration identity and privileges

Set `MIGRATION_DATABASE_URL` to a distinct migration login in production. The host/port/database must match the configured runtime target in **every mode**; a test or local migration cannot silently inherit a URL to another database. Production additionally rejects a shared runtime/migrator username. Alembic uses this URL through a non-pooling migration engine. Local mode can use the existing operator-managed identity; this is not production approval.

Production runtime requests check PostgreSQL role/catalog privileges before yielding the transaction. Superuser/create-role/create-db/replication/bypass-RLS, schema CREATE, or audit UPDATE/DELETE/TRUNCATE rights cause fail-closed rejection. These checks do not replace a complete database permission review.

Operator provisioning must establish, outside application startup:

- A migration owner/login with schema evolution rights, a separate API runtime login and a separate worker/dispatcher login when workers are implemented.
- API role USAGE/CONNECT and only required DML; audit INSERT/authorized SELECT without UPDATE/DELETE/TRUNCATE; no object/schema ownership, role administration or ability to disable triggers.
- Outbox INSERT/SELECT for API writes. A future dispatcher may update only delivery/retry state under its own reviewed permissions, not rewrite audit or payload data.
- Controlled default privileges for future migrations, TLS/CA validation, private credential injection and rotation. Do not embed default passwords in SQL examples or source.

No cluster roles or production grants were created/altered automatically in this local build. `productionPrivilegesVerified=false` on the local diagnostics page is intentional. A positive production TLS/least-privilege deployment test remains pending; unit tests and a local-owner deployment cannot establish it.

## Transactions, audit and outbox

The FastAPI DB dependency commits after successful handler execution and rolls back on errors. Implemented mutations use shared `record_audit`: audit and a minimal outbox event are staged in the same transaction as business changes. Bootstrap CLI uses the same helper. Historical audit entries are not backfilled/re-emitted.

Outbox metadata is limited to random event UUID, request UUID and action. It excludes audit detail, reasons, actor identity, credentials/tokens, source code, submissions and answer keys. Payloads are bounded, validated and fingerprinted; an idempotency key cannot silently refer to different metadata. PostgreSQL uniqueness and ON CONFLICT handling cover concurrent retries of the same persisted event.

Audit UPDATE, DELETE and TRUNCATE are blocked by PostgreSQL triggers. The runtime role must also lack mutation/DDL privileges; a database owner can administer triggers and therefore is not an acceptable production runtime identity.

The outbox is durable storage only at this stage. No Redis client, background dispatcher, delivery retry worker or learner-code runner starts with the API. Pending rows remain pending until BUILD-034 implements an authorized transport. Do not mark them dispatched, delete them or trim them merely to make a health indicator green.

`GET /v1/admin/operations/persistence` is read-only/Admin-only/no-store and reports counts, head version and bounded pool settings. It never returns event payloads, idempotency keys, account data or connection secrets. `/operations` shows this live panel separately from preview-only Redis/realtime sections.

## Local upgrade and integration

```powershell
# Run only after isolated test-database verification; stop owned app services first.
.\scripts\runtime-local.ps1 -Action Stop -Service all
.\scripts\upgrade-local.ps1
.\scripts\runtime-local.ps1 -Action Start -Service all
```

The upgrade helper only accepts the expected loopback `codemark_lms`, creates a private backup with the existing `.env` ACL **before** pg_dump writes, upgrades/checks Alembic, and verifies users/sessions/audit/courses row-count parity. Backup files stay ignored in `.local/backups`; local ACL protection is not encryption or a restore drill.

For tests, run `verify-postgres.py`, `verify-identity-postgres.py`, `verify-courses-postgres.py`, then `verify-persistence-postgres.py`. The first resets only the explicitly guarded `codemark_lms_test`; its migration URL is pinned to that same test target. Tests cover migration cycles/drift, rollback, concurrent outbox retries, immutability and payload-free operational access. No email or learner code runs.
