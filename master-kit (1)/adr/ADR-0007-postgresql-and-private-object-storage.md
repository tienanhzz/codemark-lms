# ADR-0007: PostgreSQL and Private Object Storage

- Status: Accepted for the initial application implementation
- Date: 2026-11-08

## Context

The logical data model requires a durable relational source of truth, immutable audit history, transactional outbox delivery, and private storage for user-uploaded assets. Earlier specifications left the PostgreSQL major version and object-storage deployment undecided.

## Decision

- Use PostgreSQL 17 as the initial supported major version. Pin the major version in local and deployment manifests; apply supported minor security updates. Re-evaluate the major version before production release, not during routine application startup.
- Use SQLAlchemy 2 and Alembic for database access and schema evolution. PostgreSQL is authoritative for identities, course/domain records, audit records, outbox events, and financial ledgers. Redis remains rebuildable infrastructure for ephemeral coordination and queue/realtime delivery only.
- Local development may use a developer-managed PostgreSQL instance or the repository's local container configuration. Bind database ports to loopback only; do not use local development credentials in shared or production environments.
- Use a self-hosted, S3-compatible object-storage service (MinIO is the initial deployment target) for private user uploads. Do not use a public bucket or a third-party hosted storage API. Require TLS for service traffic and encryption at rest via managed deployment keys in shared/production environments.
- Keep opaque generated object keys, checksums, normalized media metadata, size, retention classification, uploader, and audit reference in PostgreSQL. Store file bytes outside the database. Serve downloads only through authenticated, authorized same-origin API flows; public object URLs and client-controlled storage keys are prohibited.
- Local tests may use a temporary private filesystem directory where an object-storage service is not required. This is test infrastructure, not a production storage backend or compatibility fallback.
- Application and worker processes use distinct least-privilege PostgreSQL roles. Runtime roles may not alter schema or update/delete append-only audit events. Migrations run as a separate deployment identity.
- Business changes, audit events, and outbox records that describe those changes are committed in the same PostgreSQL transaction. Redis delivery is attempted only after commit; a Redis outage must not lose the durable event.

## Consequences

- PostgreSQL schema constraints and transactions are the final integrity boundary; SQLite is permitted only for isolated unit tests and is not a supported deployment database.
- Object-storage availability, backup, restoration, and key rotation are deployment responsibilities and are release gates.
- This decision does not approve an external email, storage, analytics, or other hosted API.
- Schema migrations and PostgreSQL-specific append-only enforcement must be tested against PostgreSQL before production release.

## References

- [`../contracts/core-api/data-model.md`](../contracts/core-api/data-model.md)
- [`ADR-0002-redis-for-jobs-realtime-and-ephemeral-state.md`](ADR-0002-redis-for-jobs-realtime-and-ephemeral-state.md)
- [`../SECURITY_STANDARDS.md`](../SECURITY_STANDARDS.md)
