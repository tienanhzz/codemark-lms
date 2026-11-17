# Release deployment and recovery

`nginx-local.conf` is a loopback-only acceptance fixture. The acceptance runner
renders it, starts two isolated APIs, verifies Redis fan-out and revocation,
then exercises WebSocket and Engine.IO polling through Nginx. Its database,
Redis channel, ports and processes are separate from the active application.

`nginx-production.conf.example` is an uninstalled TLS/mTLS template. Replace the
`.invalid` names with the actual service inventory, issue matching certificates,
provide TLS termination for the web upstream, and validate it with the deployed
Nginx version. Do not disable upstream certificate or hostname verification.
Preserve `Host`, exact `APP_ORIGIN` and sticky routing for polling; forward only
trusted proxy headers and do not expose the API ports directly to browsers.

## Production configuration

- Set `APP_ENV=production`, the exact HTTPS `APP_ORIGIN`, `COOKIE_SECURE=true`,
  and independently generated login/MFA keys from the institution's secret store.
  Never copy the development `.env` or recovery-drill keys into production.
- PostgreSQL requires `sslmode=verify-full`, its trusted CA and a distinct
  migration identity. The runtime identity must not own schemas, create roles or
  databases, bypass RLS, or update/delete/truncate the append-only audit table.
- Set `SOCKETIO_REDIS_URL=rediss://<acl-user>:<secret>@<redis-host>:6380/0` and
  `SOCKETIO_REDIS_CA_FILE` to the mounted CA. Production rejects plaintext,
  unauthenticated or URL-overridden TLS settings. Both APIs must use the same
  environment-specific `SOCKETIO_REDIS_CHANNEL`. Give the Redis user only the
  commands/channel access required by Socket.IO; never share runner queue ACLs.
- Deny runtime Internet egress at the host/container network boundary. The API
  allowlist is PostgreSQL TLS and Redis TLS; an explicitly approved self-hosted
  SMTP STARTTLS relay is added only for the mail worker. The gateway may reach
  its API/web TLS upstreams. DNS, certificate renewal, backup storage and
  monitoring require explicit, owned destinations. Test both IPv4 and IPv6.
  No runtime CDN, analytics, third-party API or package installation is allowed.
- Run as distinct non-administrative service identities, make code/dependencies
  read-only and give writes only to dedicated private storage/runtime paths.
  Do not grant the LMS Docker access or enable learner-code execution.

These controls require deployment evidence: certificate validation, rejected
plaintext/wrong-CA connections, least-privilege queries and successful allowed
plus denied egress probes. No production host or credentials were supplied for
this increment; the local test cannot establish those outcomes.

## Encrypted recovery drill

From the repository root on this configured Windows machine:

```powershell
.\cyb3rt1tan-lms\.venv\Scripts\python.exe cyb3rt1tan-lms/scripts/verify-release-recovery.py --report cyb3rt1tan-lms/docs/master-kit/BUILD-033-recovery.json
```

The source is read-only in a repeatable-read exported PostgreSQL snapshot. The
native custom-format dump and per-table content fingerprints use that same
snapshot. The dump is AES-256-GCM encrypted in memory before writing to the
private, ignored `.local/backups/release-drill-*` directory. Two newly created,
randomly named databases are restored and compared with all source-table
contents. One copy is used for MFA legacy/v2 rewrap, repeat-apply idempotency,
missing-key rejection and recovered-key verification. Both copies are removed;
no original user, session, key, password or audit record is changed.

Drill keys are retained inside that private directory so this local artifact can
be inspected. This co-location is suitable only for an isolated drill. Production
backups need an independently controlled key store, off-host encrypted copies,
owner-approved retention and a separately hosted restore exercise. The helper
limits archives to 512 MiB and is not a scheduled or streaming production backup
service. Public reports contain counts/hashes/status only; never upload private
archives, native logs, credentials or keys as CI artifacts.

For CI, `--source test` selects the disposable `codemark_lms_test` source and
`RELEASE_DRILL_ADMIN_URL` supplies a loopback-only database-creation identity.
The script refuses production mode, non-loopback targets and unexpected source
database names. Restore targets always have a fresh `codemark_recovery_*` name;
the helper never restores over an existing database.

## Production key rotation and incidents

1. The security owner records affected key IDs, scope, release SHA and a verified
   encrypted backup with a restore outcome. Preserve keys needed by every retained
   backup; removing a key because current rows were rewrapped breaks old restores.
2. Add the new MFA key ID to the managed keyring; retain legacy and previous keys.
   Set the new active ID and run `api/scripts/rewrap-mfa-secrets.py` in dry-run mode
   using the production configuration. Keep service logs credential-free.
3. After owner approval, apply using `--apply --confirm APPLY-MFA-KEY-REWRAP
   --backup-verified`. It locks rows, validates every old ciphertext first,
   verifies new round trips and records a count-only audit event atomically.
   Repeating apply does not rewrite rows already using the active key.
4. Verify real MFA login, audit evidence, a post-rotation backup and a restore with
   the managed key inventory. Retire old keys only after backup/reference lifetime
   and recovery obligations are met. A suspected key leak triggers the incident
   owner, session revocation as appropriate and a documented compromise review.

Release owners must supply retention/deletion periods, backup RPO/RTO, incident
contacts, severity/patch SLAs and final legal/security approval for their actual
deployment. These values cannot be inferred from passing application tests.
