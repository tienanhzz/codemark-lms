# BUILD-034 — Socket.IO realtime delivery foundation

**Status:** Done — local foundation acceptance, 2026-11-16. Production deployment
and authenticated visual/keyboard/mobile acceptance remain BUILD-033 release gates.

This records the current Windows execution, not the historical Compose acceptance
in `master-kit (1)/BUILDING_PROCESS.md`.

## Delivered

- Same-origin session-cookie Socket.IO authentication; expired, revoked,
  inactive-user, wrong-origin and MFA-incomplete sessions fail closed. Database
  outages reject new connections and disconnect existing connections during the
  30-second session revalidation without terminating the guard loop.
- Atomic audit/outbox recording, row-lock/skip-locked dispatch and bounded retries.
  Redis publish errors now propagate to the outbox. The upstream library's client
  initialization flag is no longer mistaken for evidence of successful publishing.
  Invalid/private payloads are rejected; exhausted events remain visible to Admin.
- Only generic `{eventId, eventType: "state.changed"}` hints leave the server.
  REST authorization remains authoritative. Runner jobs and domain/private payloads
  are not broadcast. There is no client-controlled room/permission API.
- A shared browser socket validates hint shape, deduplicates recent event IDs,
  reloads REST state after reconnect, and closes after the last subscriber leaves.
  Polling remains a recovery path; Redis Pub/Sub is not a replay log.
- Production uses the page origin, including loopback `next start`. Added Next.js
  polling rewrites and fixed trailing-slash redirect loops. Local development may
  use the development-only direct API origin allowed by its CSP.
- Nginx gateway fixture supports WebSocket upgrades and sticky Engine.IO polling,
  preserves `Host`, bounds upstream waits and disables response buffering for the
  socket path. Production TLS/mTLS deployment template and operational instructions
  are in [deployment](../../deployment/README.md).
- Production Redis configuration requires ACL credentials, `rediss://`, certificate
  and hostname verification and a mounted CA. Environment-specific channels keep
  the isolated acceptance run separate from the active application.
- Admin Redis reachability now uses a real bounded probe. Application shutdown
  cancels session guards/listeners and closes Redis clients.

## Evidence

[BUILD-034-realtime.json](BUILD-034-realtime.json) records the tested source
fingerprint, dirty-tree baseline, counts/status and automatic cleanup. The runner
creates a fresh random PostgreSQL database and two API instances on 8110/8111;
the active application's database and processes are not used as test fixtures.

All four live cases passed:

1. Authenticated fan-out across separate APIs; revoking one session disconnects
   only that client, while both recipients refetch authorized inboxes with 200.
2. Controlled Redis publish failure preserves a durable retry; restoring the
   publisher delivers through both APIs and marks attempt two dispatched.
3. The same authenticated delivery/revocation flow through Nginx WebSocket.
4. The same flow through Nginx polling with sticky routing.

The fresh database and owned test services are removed afterward. No local source
user, password or key is changed. Minimal append-only acceptance audits exist only
inside the disposable database.

The production Next.js proxy additionally passed
`node scripts/verify-next-polling.mjs` after rebuilding the active web runtime:
both `/socket.io/` and `/socket.io` return Engine.IO open packets without redirects,
then close the anonymous transport. This test is now wired into CI after web build.
The gateway JSON predates that final Next.js fix; its source fingerprint accurately
identifies that earlier gateway run, not the subsequent proxy test.

API regression verification: 171 unique tests passed (170 in the full run plus
the SMTP test rerun outside the Windows temporary-directory sandbox); a final
focused 23-test realtime/persistence/MFA/backup pass also succeeded. Web verification:
72 tests, TypeScript, production build and security config checks passed. Ruff,
strict mypy and contract validation passed. Browser app access timed out, so no
authenticated browser or visual acceptance is claimed.

## Reproduce

```powershell
.\cyb3rt1tan-lms\.venv\Scripts\python.exe cyb3rt1tan-lms/scripts/verify-realtime-gateway.py --nginx D:\CodeMark\cyb3rt1tan-lms\.local\tools\nginx-1.30.6\nginx.exe --report cyb3rt1tan-lms/docs/master-kit/BUILD-034-realtime.json
```

The helper refuses occupied test ports and non-local/production targets. It uses
the configured local PostgreSQL creation identity or `RELEASE_DRILL_ADMIN_URL` in
CI; credentials/native logs stay private. Redis must already be available.

Delivery is at least once: a crash between publish and DB commit can cause a
duplicate. Browser deduplication is bounded to 256 recent IDs. Reconnect/periodic
REST refetch repairs missed hints; this build does not promise durable per-user
push delivery, offline replay or exactly-once notifications.
