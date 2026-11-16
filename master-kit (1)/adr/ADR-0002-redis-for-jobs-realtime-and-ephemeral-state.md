# ADR-0002: Redis for Jobs, Realtime Fan-out, and Ephemeral State

- Status: Partially superseded by ADR-0005 and ADR-0009; Socket.IO is selected in ADR-0005 and Redis Streams runner dispatch in ADR-0009. Redis boundaries and reliability requirements remain active.
- Date: 2026-11-04

## Context
The initial platform needs background job processing, cross-instance realtime delivery, and shared ephemeral coordination without introducing multiple infrastructure products. Redis is suitable for these early runtime needs, but its Pub/Sub delivery is not durable and it must not become the authoritative store for business records.

## Original Node.js package proposal

These were the original package-specific choices. ADR-0005 supersedes BullMQ and the Node Socket.IO Redis adapter for the Python LMS runtime; the Socket.IO protocol and Redis fan-out remain selected:

- Use BullMQ with Redis for background job queues and worker coordination.
- Use Socket.IO with its Node Redis adapter for cross-instance event fan-out.

## Active infrastructure and reliability requirements

- Use Redis for Socket.IO cross-instance fan-out, Redis Streams runner job dispatch, and ephemeral presence/rate limits/short-lived distributed locks; it is not authoritative for business state. Runner dispatch and execution remain separate; see ADR-0009.
- Keep PostgreSQL as the source of truth for business state, rank points, and durable audit data. Persist changes and an outbox record in one database transaction before enqueueing work or publishing notifications.
- Design workers and event consumers for at-least-once processing: handlers must be idempotent, retries bounded, and exhausted jobs observable in a failed-job queue with an operator recovery path.
- Treat realtime notifications as hints, not durable records. Clients must be able to recover current state through Core APIs.
- Deliver relevant Admin/Teacher changes to authorized subscribers across all application instances; "system-wide" means cross-instance reach, not broadcasting private data to every user.
- Separate queue and realtime Redis deployments when practical. If they share a deployment initially, isolate key prefixes and connection pools, monitor workload/capacity separately, and configure persistence/eviction for queue safety. Redis logical databases alone are not an isolation boundary.

## Rationale
This keeps the initial infrastructure small while using fit-for-purpose Redis integrations. PostgreSQL transactions plus an outbox prevent a committed business change from being lost when Redis is temporarily unavailable; idempotency addresses unavoidable redelivery.

## Consequences
- Positive: one initial operational dependency supports workers, realtime fan-out, and lightweight distributed coordination.
- Trade-off: Redis and worker operations require monitoring, persistence/failover configuration, bounded retries, and recovery procedures.
- Trade-off: this is not exactly-once execution. Side effects must be idempotent and durable records remain in PostgreSQL.
- Future scale: split queue and realtime workloads into separate Redis deployments, or replace components, without changing Core domain contracts.

## Acceptance criteria for runtime implementation
- A committed outbox item is retried until dispatch succeeds or is visibly escalated.
- Duplicate job delivery does not duplicate business side effects.
- A Redis outage does not lose committed business state; delayed notifications are recoverable.
- Realtime updates work across multiple application instances, and clients can recover by fetching current state.
- Queue backlog, retries, failed jobs, Redis health, and memory/eviction are observable.
