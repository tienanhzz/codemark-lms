# ADR-0009: Redis Streams for Runner Job Dispatch

- Status: Accepted as dormant transport/admission plumbing only; no code-execution consumer is approved
- Date: 2026-11-12

## Context

The application already depends on the pinned Python `redis` client and uses Redis for authenticated Socket.IO fan-out. The former gVisor proposal is superseded for the initial scope by ADR-0010, which permits only trusted local author-validation and explicitly does not execute learner code. This ADR records queue transport/admission code already implemented; it does not select or authorize an execution service.

Redis Streams was selected for the implemented initial job transport, independent of any approval to execute code.

## Decision

- Use Redis Streams with a dedicated `cyb3rt1tan:runner:v1:jobs` key namespace. This reuses the already pinned Redis client and does not add a Python queue package.
- PostgreSQL remains the source of truth. Persist a strictly validated runner envelope in the existing transactional outbox with its business mutation. The API instances dispatch committed `runner.job_requested` records to the stream; realtime outbox delivery explicitly excludes these private execution records.
- Dispatch is at-least-once, not exactly-once. A failure after Redis accepted `XADD` but before PostgreSQL recorded dispatch may produce a duplicate stream entry. The eventual consumer must deduplicate by server-issued job/idempotency identity before any execution or result side effect.
- A standalone consumer group (`cyb3rt1tan:runner:v1:workers`) reclaims idle pending entries with `XAUTOCLAIM`, verifies stream content against the PostgreSQL outbox, durably records the job identity, then acknowledges the stream entry. Database commit precedes `XACK`; unique job/outbox/idempotency constraints make redelivery safe, including concurrent duplicate receipt inserts verified by committed identity and payload digest.
- Invalid entries go to `cyb3rt1tan:runner:v1:dead-letter` with metadata only; source payloads are not copied to the dead-letter stream. Redis connection retries use capped exponential delay, and transient database failures remain pending for later reclaim. This admission process does not execute code.
- Migration 0014 adds durable job receipt and one-result-per-job tables. The internal result recorder validates the existing result contract, rejects unknown jobs/conflicting duplicates, and treats identical result retries as idempotent. No HTTP callback or worker authentication contract exists yet.
- Bound envelope size, file count, per-file size, and relative file paths before dispatch. Never log the payload: it may contain student source. The worker must revalidate every field and enforce profile limits independently.
- Payload-free snapshots expose main-stream length, group pending count/lag/consumer count, dead-letter length, PostgreSQL outbox retryable-pending/exhausted counts, and separate ages for the oldest retryable and exhausted event. Consumer identities are not exposed. Do not trim messages until all configured groups have acknowledged them and retention policy permits removal. Production queue monitoring/alerts, retention, execution-attempt policy, and operator recovery remain deployment gates.
- Require authenticated TLS Redis connections using a named, non-default ACL user with least-privilege command/key permissions, persistence and no-eviction policy for the queue deployment, queue-specific monitoring/alerts, and a separate Redis deployment or isolated connection pools and resource budgets when practical. Production application configuration rejects Redis URLs without named ACL credentials, but deployment ACL rules and durability still require independent validation. Realtime Pub/Sub and queue delivery are distinct reliability domains.
- Keep the consumer limited to admission/receipt plumbing; do not start a code-execution consumer in local Compose or any deployment. The former gVisor staging requirement is not active. Any future learner-code execution requires a new product/security decision.

## Operations and recovery

- Alert on sustained consumer-group lag, a growing pending count, an outbox dispatch backlog, dead-letter growth, and PostgreSQL outbox entries that reach `OUTBOX_MAX_ATTEMPTS`. Snapshot values contain counts only; alerts and dashboards must not query or render payload fields.
- The implemented `GET /v1/admin/runner-queue/outbox-metrics` endpoint exposes PostgreSQL outbox counts/ages and Redis stream/group/dead-letter counts to authenticated Admins, honors the configured Admin MFA requirement, and disables caching. Collection is read-only and does not create the consumer group; consumer names, source/job payloads, and alert delivery are not exposed.
- A consumer restart is the normal pending-entry recovery mechanism: `XAUTOCLAIM` returns idle entries and the PostgreSQL receipt makes admission idempotent. Do not manually `XACK` pending work to clear a backlog.
- An exhausted outbox entry remains undispatched in PostgreSQL. Investigate its stable outbox ID and failure code, restore the underlying Redis/DB condition, and use an audited recovery procedure that preserves idempotency. Do not mark an event dispatched or delete it to silence an alert.
- Dead-letter records intentionally omit source payloads. Correlate by source stream ID/outbox ID, inspect the authoritative PostgreSQL outbox record under restricted access, correct the cause, and republish only through a reviewed, idempotent procedure. Never replay by copying arbitrary Redis payloads into the live stream.
- Do not configure approximate `MAXLEN`/`MINID` trimming or delete runner stream keys as routine maintenance. Define retention only after measuring all consumer groups and pending entries; preserve unacknowledged work and required source records. Validate encrypted backups, restore procedures, expiry/legal-hold policy, and failover semantics in the target deployment before enabling jobs.

## Rationale

Redis Streams provides persisted, replayable stream entries and consumer-group pending state while reusing the current Redis dependency. The PostgreSQL outbox closes the database/queue dual-write gap. This approach supports an incremental implementation without pretending Redis Pub/Sub is durable or claiming exactly-once execution.

## Consequences

- The implementation includes a transactional-outbox publisher, separate consumer-group admission/reclaim, a metadata-only dead-letter path, durable job identity, idempotent result persistence, and a payload-free queue snapshot. It has no approved code execution, worker identity, authenticated result ingress, automated dashboards/alerts, or production execution service.
- Redis Streams can grow without bound if consumers or retention are not operated. Production capacity, persistence, no-eviction behavior, backup/failover semantics, monitoring, and safe trimming must be validated before workload enablement.
- Source code is present in the queue payload. Queue access and backups are sensitive data boundaries; use TLS, least-privilege ACLs, restricted operators, retention controls, and payload-free logs.
- If queue reliability or scale requirements outgrow Redis Streams, replace the transport without changing the PostgreSQL job/outbox contract.

## References

- [`ADR-0002-redis-for-jobs-realtime-and-ephemeral-state.md`](ADR-0002-redis-for-jobs-realtime-and-ephemeral-state.md)
- [`ADR-0010-local-trusted-source-autograder.md`](ADR-0010-local-trusted-source-autograder.md)
- [`../CODE_RUNNER_THREAT_MODEL.md`](../CODE_RUNNER_THREAT_MODEL.md)
- [`../contracts/core-api/code-runner.schema.json`](../contracts/core-api/code-runner.schema.json)
