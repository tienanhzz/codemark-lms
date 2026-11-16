# BUILD-032 — Preferences, platform branding, notifications and realtime

**Status:** Active — functional branding and notification workflows are implemented through migration `0049_notifications`; authenticated Redis cross-instance delivery, session revocation, outbox recovery, and local SMTP STARTTLS acceptance now pass. Authenticated browser visual/privacy/keyboard/mobile acceptance remains open.

## Implemented in this increment

- Migration `0048_platform_branding` stores numbered immutable PNG logo versions, checksums, creator/time metadata, and one active version enforced by a partial unique index.
- Admin may list versions, upload a cropped 1024×1024 PNG, activate it, or restore an earlier logo. Every activation is audited; arbitrary CSS and remote logo URLs are not accepted.
- Server checks the PNG signature, byte limit, decoded dimensions and animation state, then re-encodes to strip metadata. Active and versioned logos are served by same-origin API routes with `nosniff`, restrictive CSP and `no-store` caching.
- Admin interface at `/branding` accepts PNG/JPEG/WebP source images, crops locally in a square canvas, and provides keyboard-operable zoom and horizontal/vertical positioning controls. Only the resulting PNG is uploaded. The page shows active version history and restore controls.
- Updated core API OpenAPI and data model contracts for versioned branding endpoints.

## Notifications implemented

- Migration `0049_notifications` adds versioned localized templates, user email/locale preferences, notification records and recipient delivery/read/acknowledgement state with idempotency keys and retry metadata.
- Admin can publish system notices; course staff require `events.manage` and can target the active course roster by section/role. Audience size is bounded and server resolved.
- Critical/emergency notices require in-app acknowledgement and suppress email. In-app delivery cannot be disabled; users may opt out of nonessential email. Each recipient gets a locale-resolved template snapshot.
- `/notifications` is connected for inbox, unread filter, mark-read/acknowledge, preferences, Admin template versioning, scoped sending and delivery summaries.
- A workspace-wide, keyboard-operable modal presents unread critical/emergency notices and requires acknowledgement before dismissal. It follows authenticated users across workspace pages; the notification inbox and modal share one socket connection.
- Email uses an explicit STARTTLS worker with row locking, retry schedule and bounded attempts. It is not automatically run during local verification; no email was sent in this build pass.
- Email requests are marked failed with `smtp_not_configured` immediately unless an explicitly approved SMTP relay is configured; unapproved requests are never left queued for a worker that cannot deliver them.
- The worker supports injected delivery/session dependencies for controlled tests. A local-only SMTP server with a temporary self-signed certificate exercises certificate-verified STARTTLS, envelope/content delivery, bounded retry, terminal failure, and batch bounds without contacting an external domain or sending real mail.
- Authenticated Socket.IO is mounted beside FastAPI. Handshakes require exact same-origin plus a live HttpOnly session and current MFA state; revoked/suspended sessions are disconnected by periodic revalidation. The outbox dispatcher publishes only generic `{eventId,eventType}` invalidation hints after validating the committed audit envelope; it never sends audit detail, notification content, or runner jobs. Redis publish failures retain the outbox row for bounded retry.
- `/notifications` subscribes to `state.changed`, refetches its own recipient-scoped API data and falls back to periodic sync while disconnected. It shows accessible connection state.
- Admin persistence diagnostics now distinguish whether the dispatcher runs and whether its Redis manager is connected.
- Updated API runtime and OpenAPI contracts and added API/UI coverage for policies, idempotency, roster scope, localization and acknowledgement.

## Verification so far

- Full API suite: **162 passed**; Ruff and strict mypy passed across **62 API source files**.
- Web typecheck passed; web suite **64 passed**; production build passed.
- Focused coverage includes same-origin/live-session enforcement, generic-hint field allowlist, authoritative inbox refresh and required critical acknowledgement.
- Both local app PostgreSQL and `codemark_lms_test` report head `0049_notifications`; guarded runs verified private backups, row parity and no schema drift.
- OpenAPI cross-contract validation passed: **199 paths / 230 operations**, 19 schemas and 17 examples.
- After restarting the local runtime with the current source, API readiness returned HTTP 200; the web routes `/`, `/notifications`, and `/branding` returned HTTP 200.
- A live WebSocket/Socket.IO handshake with the correct origin but no session cookie was rejected by namespace authentication.
- Redis-compatible server version 8.2.10 was reachable on `127.0.0.1:6379`. Two authenticated Socket.IO clients on separate API instances (ports 8100 and 8101) received the same allowlisted `{eventId,eventType}` hint; each fetched its recipient-scoped `/v1/me/notifications` REST resource (200). The outbox reached `dispatched` with one attempt. Revoking one session disconnected only that client on the next periodic revalidation; the other stayed connected.
- A controlled publish exception left a second outbox event pending with a scheduled retry. Restoring the real Redis publisher delivered it to clients on both API instances and marked it dispatched on attempt two. See `scripts/verify-realtime-multi-instance.py` and `scripts/verify-realtime-retry-recovery.py`.
- The controlled SMTP acceptance passed against the local, certificate-verified STARTTLS test relay, including delivery and bounded retries. No external email was sent.
- Authenticated browser visual/privacy/keyboard/mobile acceptance is not verified; the available Windows browser is currently rejected by the browser automation URL policy.

## Remaining BUILD-032 acceptance

- Perform authenticated browser visual, privacy, keyboard and mobile review for branding and notifications.


The active logo endpoint returns the expected 404 until an Admin uploads the first logo version.
