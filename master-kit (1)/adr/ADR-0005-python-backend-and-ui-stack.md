# ADR-0005: Python Backend and Next.js LMS Interface

- Status: Accepted; Socket.IO realtime and Redis Streams runner-job dispatch are selected; see ADR-0009 for publisher/consumer plumbing and remaining worker/operations gates.
- Date: 2026-11-06

## Context

The application repository `cyb3rt1tan-lms` contains the user-facing introduction and design preview, while `master-kit` is the specification source. The user selected Python for the backend and Next.js, Tailwind CSS, and Font Awesome for the interface. Dependencies may be installed through package managers during development/build. Runtime CDN assets and third-party APIs remain prohibited by `SECURITY_STANDARDS.md`.

The existing Redis ADR originally specified BullMQ and the Node Socket.IO Redis adapter. BullMQ is Node.js-only and cannot be used directly by a Python backend. Realtime must reach browser clients immediately across application instances while preserving database authority, authorization, and recovery through Core APIs.

## Decision

- Use Python 3.13 and FastAPI for the HTTP API foundation.
- Use SQLAlchemy 2 for persistence abstractions and Alembic for migration tooling; PostgreSQL remains the authoritative store.
- Use Next.js 16 with React 19, TypeScript, Tailwind CSS 3, and Font Awesome 6 for the web application. Pin package versions in lockfiles; bundle/self-host runtime assets.
- Use `python-socketio` (`AsyncServer` with its ASGI integration) for the FastAPI-side Socket.IO server, its `AsyncRedisManager` for cross-instance fan-out, and `socket.io-client` for the browser. Runtime dependencies are pinned in the API and web lockfiles.
- Keep HTTP REST/Core APIs for commands and authoritative reads. Use Socket.IO over TLS (`wss`) for realtime notifications; it is not raw TCP and does not replace REST. Socket.IO's permitted transport negotiation is handled by the library.
- Publish committed Admin/Teacher changes to all relevant connected clients across instances, scoped to authorized user/course/resource subscribers. Emit only event IDs, event type, resource IDs, and revision/version hints; clients fetch current authorized state through Core APIs.
- Keep the OpenAPI 3.1 contract in `contracts/core-api/openapi.yaml` as the API source of truth. Disable framework-generated interactive API docs unless locally bundled assets are provided and checked against the contract.
- Use Redis Streams for runner-job dispatch through the existing pinned Python Redis client and PostgreSQL transactional outbox (ADR-0009). Publisher and separate consumer-group admission/recovery plumbing are implemented; execution, production operations, and deployment approval remain pending.
- Defer object storage, production secret manager, code-runner isolation, and deployment architecture to separate threat/operations decisions.

## Rationale

FastAPI supports the already-approved Python backend and provides an ASGI application boundary for `python-socketio`. Socket.IO provides reconnect/event semantics shared by Python server and JavaScript clients; Redis fan-out connects multiple server instances. SQLAlchemy/Alembic fit the PostgreSQL data model and migration requirements. The frontend stack follows the user's selection while allowing local bundling of all fonts, icons, scripts, and styles.

## Consequences

- This supersedes BullMQ and the Node Socket.IO Redis adapter as package choices for the Python service; ADR-0002's Redis durability boundaries, outbox, retry, and recovery requirements remain active.
- Socket.IO/Redis realtime integration uses a PostgreSQL outbox and a Redis-backed manager across API instances. Local Compose provides two API instances behind Nginx. Runner-job dispatch uses a separate PostgreSQL outbox publisher and standalone consumer-group admission process; it is at-least-once and does not execute code.
- All mutations remain HTTP/Core operations; database changes and outbox records commit atomically before a realtime hint is published. Authenticate sockets with the LMS session, validate origin, authorize every subscription/room, and revoke or revalidate subscriptions after access changes. Never trust a client-supplied room or use realtime delivery as authorization.
- Redis Pub/Sub and Socket.IO delivery are best-effort. Reconnects and missed events must recover via authorized REST reads; event payloads must not include secrets, answer content, hidden tests, or unnecessary PII.
- Dependencies are not limited to those preinstalled on a development machine. `BUILDING_PROCESS.md` tracks manifest/lockfile management, dependency review, and install validation.
- No palette/theme is approved as a permanent system default; retain user-selectable alternatives.

## References

- [`ADR-0002`](./ADR-0002-redis-for-jobs-realtime-and-ephemeral-state.md)
- [`ADR-0009`](./ADR-0009-redis-streams-runner-job-queue.md)
- [`ADR-0006`](./ADR-0006-offline-dependencies-and-opaque-resource-references.md)
- [`ARCHITECTURE.md`](../ARCHITECTURE.md)
- [`SECURITY_STANDARDS.md`](../SECURITY_STANDARDS.md)
- [`BUILDING_PROCESS.md`](../BUILDING_PROCESS.md)
