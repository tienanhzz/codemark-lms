# BUILD-033 — scoped security/privacy review and release checklist

Review date: 2026-11-16. Scope: the current release controls, MFA recovery and
Socket.IO foundation. Target: [OWASP ASVS 5.0.0 Level 2](https://asvs.owasp.org/).
This is a source/test review and an evidence index, not independent ASVS
certification or security-owner approval of the entire LMS.

| Area | Evidence / finding | Acceptance |
| --- | --- | --- |
| Authentication/MFA | Cookie-only socket identity; origin, active user, expiration, revocation and MFA checks; DB-outage fail-closed tests | Local tests passed |
| Authorization/privacy | Hints contain only a random event ID and fixed event type; authorized recipient REST refetch tested across APIs/gateway; private audit fields and runner payloads excluded | Local foundation passed; full product privacy-owner review pending |
| Durable delivery | Found Socket.IO's initialized-client flag could mask failed publication; added a propagating publisher and tested retry/exhaustion/recovery | Fixed and tested |
| Reconnection | Found missing reconnect REST recovery; added refetch and bounded duplicate suppression | Fixed and tested |
| Same-origin CSP/proxy | Found production loopback bypass and trailing-slash redirect loop; production now uses same-origin polling or gateway WebSocket | Fixed; live proxy/gateway tests passed |
| Server lifecycle | DB failures no longer kill the session guard; shutdown closes Redis/session tasks; runtime script safely skips already-exited owned child processes | Tests and local restart passed |
| Redis service security | Production rejects plaintext/no-ACL Redis and TLS query overrides; requires CA and hostname validation | Config tests passed; deployment certificates/ACLs unverified |
| Database privileges | Production verify-full TLS, separate migrator and runtime-role guards already implemented | Source tests passed; actual production grants/ownership unverified |
| Backup confidentiality/integrity | AES-256-GCM from maintained cryptography library, random nonce, authenticated envelope; no plaintext dump file; wrong-key/tamper checks | Local encrypted restore drill passed; production key custody/retention/off-host restore unverified |
| MFA key lifecycle | Validate every old ciphertext before writes; lock rows, round-trip verification, idempotent repeat apply and count-only audit | Disposable PostgreSQL rotation/key-loss/recovery passed; production rotation unverified |
| Supply chain | Existing hash/integrity locks, source-local assets, dated SBOM/audit and hosted secret scan; no new Python/npm runtime dependency in this increment | Baseline hosted evidence passed; new commit run and legal review pending |
| Runtime egress/TLS | Production gateway TLS/mTLS template and destination allowlist guidance prepared | Enforcement and real network probes pending production inventory |
| UI accessibility | Existing bilingual release panel updated, web DOM suite/typecheck/build passed | Browser application approval timed out; authenticated keyboard/mobile/visual review pending |
| Incident/retention/release | Runbook describes rotation, retained-backup keys and incident steps without inventing policy values | Named owners, RPO/RTO, retention, patch SLAs and final approval required |

## Operational artifacts

- [Encrypted restore and rotation evidence](BUILD-033-recovery.json).
- [Realtime/gateway evidence](BUILD-034-realtime.json) and [scope/limits](BUILD-034.md).
- [Production configuration and recovery runbook](../../deployment/README.md).
- [Current BUILD-033 status and hosted baseline links](BUILD-033.md).

The reports distinguish committed baseline from dirty-tree source fingerprints
and never mark production accepted. A failed rerun overwrites the public report
with a failed state instead of leaving an older passing result in place. Native
logs, encrypted database archives and drill keys remain under ignored `.local`
paths and must not be included in a PR, public report or CI artifact.
