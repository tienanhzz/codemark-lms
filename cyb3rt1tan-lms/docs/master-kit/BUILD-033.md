# BUILD-033 — Hosted CI, security and release acceptance

**Status:** Active — implementation and local recovery/realtime acceptance completed; final production, browser, owner approvals and a hosted run of the new changes remain open.

## Current acceptance — 2026-11-16

- Completed an encrypted PostgreSQL snapshot backup and two independent isolated
  restores: all **99 tables / 64 rows** matched their source-snapshot content
  fingerprints. Wrong-key and tampered-archive rejection passed. The source
  database was read-only throughout the drill.
- Exercised legacy/v2 MFA rewrap on a disposable restored copy, including immutable
  dry-run, repeat-apply no-op, missing-key failure and recovered-key decryption.
  The production maintenance command now skips already-current rows on repeat apply.
  No actual user's MFA key or password was rotated.
- Added reproducible recovery and gateway acceptance runners, safe local target
  guards, private encrypted artifacts, source fingerprints, failure-aware reports
  and CI wiring. See [recovery evidence](BUILD-033-recovery.json),
  [realtime acceptance](BUILD-034.md) and [deployment/recovery runbook](../../deployment/README.md).
- Added production Redis ACL/TLS/CA guards and a TLS/mTLS gateway deployment
  template. These are implemented controls/templates; actual production network
  enforcement and certificate acceptance still require the deployment environment.
- Fixed production same-origin Socket.IO polling, including a Next.js
  trailing-slash redirect loop. A live production-build proxy check now passes and
  is included in CI after web build. The active local runtime was rebuilt/restarted;
  readiness and `/operations` return 200 and the Admin API still requires authentication.
- Local verification: 171 unique API tests passed (170 in the complete run and the
  temporary-directory-blocked SMTP test passed on its separate rerun), 72 web tests,
  23 focused final API regression tests, strict mypy over 68 source files, Ruff,
  TypeScript, production build, security configuration checks and contract validation
  (199 paths / 230 operations). Browser access approval timed out; visual, mobile,
  keyboard and authenticated `/operations` acceptance remain pending.

The exact current baseline commit `051d239610bab0d7ef69bcada6a7cf16915d7e05`
has three successful hosted workflows, verified through the GitHub runs collection
using its **full SHA**, including the previously unverified HSTS additions:

| Workflow | Verified result |
| --- | --- |
| Master kit rebuild | [Success](https://github.com/tienanhzz/codemark-lms/actions/runs/43821034116) |
| Project CI | [Success](https://github.com/tienanhzz/codemark-lms/actions/runs/43821034056) |
| Secret scan | [Success](https://github.com/tienanhzz/codemark-lms/actions/runs/43821034169) |

Those hosted runs cover the committed baseline. This increment is still an
uncommitted working-tree change, so the new recovery/gateway/proxy CI steps have
**not** run on GitHub yet. Earlier empty results came from querying PR-only status
wrappers or a short SHA; they did not establish a failed or missing push run.

## Remaining release acceptance

BUILD-033 cannot truthfully be marked Done under its original production-release
scope until the following evidence exists for the actual deployment:

- A production host/domain and service inventory; verified browser/service TLS,
  IPv4/IPv6 egress deny/allow probes and least-privilege service/database identities.
- Managed key custody, off-host encrypted backup retention, approved RPO/RTO and
  a production restore/rotation exercise with the retained key inventory. Local
  drill keys are deliberately identified as drill-only and are not production custody.
- Security-owner review against the versioned [OWASP ASVS 5.0.0 Level 2 target](https://asvs.owasp.org/),
  scoped privacy review and legal/provenance acceptance of dependencies.
- Authenticated visual/keyboard/mobile review, incident/retention ownership and
  final release approval. No reviewer identity, SLA, retention period or approval
  has been invented.
- Push/review and successful hosted CI/secret scanning for the resulting new commit.

The scoped [security review and release checklist](BUILD-033-release-review.md)
records the available evidence and the exact external gaps. The earlier sections
below are retained as the history of previous increments.

## Implemented in this increment

- Root CI now verifies both Java/Next.js application trees, including the `codemark-lms/` project copied into the parent repository. Each backend runs Maven `verify`; each frontend installs from its committed lockfile and runs its production build.
- CI workflows now declare read-only repository permissions, bounded job timeouts and cancellation of superseded runs.
- The API workflow now runs Ruff formatting checks only on changed Python files while continuing lint/type checks across the full API; this keeps the existing unformatted-file backlog from blocking unrelated builds while enforcing formatting on new changes.
- The master-kit rebuild workflow now runs for changes to project docs, root scripts and package manifests in addition to application and contract sources. This closes trigger gaps that could otherwise leave generated DTOs, contracts or build scripts unchecked.
- Added a weekly and push/PR Gitleaks secret scan, pinned to its immutable v3.0.0 commit. The scan has read-only repository access and does not post comments or upload findings as an artifact.
- Added weekly Dependabot update groups for GitHub Actions, npm, Maven and the Python API dependencies across the repository's active project trees.
- Upgraded workflow actions to Node 24 compatible release lines and disabled persisted checkout credentials in jobs that only need source reads.
- Production CSP now allows browser connections only to same-origin endpoints; loopback API and WebSocket sources are included only during development. Added a config verifier for both environments.
- Production web responses advertise one year of HSTS; development omits HSTS. The security config verifier asserts production CSP, HSTS and standard response headers, plus development-only loopback behavior.
- Production startup now rejects missing/short LOGIN_HMAC_KEY values and missing, malformed or matching MFA_ENCRYPTION_KEY values. Error messages do not include key material.
- MFA ciphertext now supports a versioned AES-GCM key ID through `MFA_ENCRYPTION_KEYS` and `MFA_ACTIVE_KEY_ID`; legacy v1 records continue to use `MFA_ENCRYPTION_KEY`.
- Added `api/scripts/rewrap-mfa-secrets.py`. It defaults to a read-only dry-run; apply is limited to production, requires a versioned active key, an explicit confirmation phrase and `--backup-verified`, locks MFA rows, verifies decrypt/re-encrypt round trips, and writes a count-only audit event in the same transaction.
- Admin `/operations` now includes a bilingual, responsive release-evidence panel. It keeps live database diagnostics separate from external gates and marks CI, secret scanning, ASVS, backup/restore, egress/TLS, key rotation and release approvals as unverified instead of inferring a pass.
- The key custody card now reflects the actual implementation state: rewrap tooling exists, remains unrun, and old keys must be retained until rewrap and recovery evidence are reviewed.
- Dependency evidence was refreshed on 2026-11-16: CycloneDX 1.6 SBOM with 310 components, inventory of 64 Python and 246 Node packages, and current PyPI/npm advisory results with zero findings. The refreshed inventory has no `NOASSERTION` licenses after consuming published package classifiers and version-matched installed manifests; provenance and legal approval remain open.

## Progress log

- 2026-11-16: Started the independent CI/security portion of BUILD-033 while BUILD-031/032 wait on authenticated browser acceptance. Added production startup checks for the login HMAC and MFA encryption keys, then added versioned MFA key IDs while preserving legacy reads. Added the Admin release-evidence interface with explicit unverified states. Added a guarded rewrap utility; it has not been run, and no production database or service was changed. Rotation and recovery drills remain unaccepted.
- 2026-11-16: Local verification passed: API suite 164 tests, Ruff lint and strict mypy including maintenance scripts; web suite 64 tests, TypeScript typecheck and production build. The run found and fixed a stale MFA configuration call in the Admin identity-status endpoint, and updated production configuration fixtures for the new key guards. Full API Ruff format check still reports 57 pre-existing files outside this increment; changed Python files were formatted. `git diff --check` passed. No production service or database was touched.
- 2026-11-16: Updated the rebuild workflow to scope Ruff formatting enforcement to changed API Python files, preserving full-project lint/mypy and the complete test/build jobs. Workflow YAML parses locally; GitHub-hosted execution is still pending.
- 2026-11-16: Added direct tests for legacy/v2 ciphertext reads, dry-run immutability, active-key rewrap, corrupted ciphertext rejection and missing-old-key rejection. Extracted the rewrap logic into an app module, linted and type-checked the maintenance CLI, and extended CI Ruff/mypy coverage to API scripts. Full API suite: 164 passed.
- 2026-11-16: Hosted acceptance passed on commit `f178a99`: [Master Kit rebuild](https://github.com/tienanhzz/codemark-lms/actions/runs/43817238477), [Project CI](https://github.com/tienanhzz/codemark-lms/actions/runs/43817238501), and [Secret Scan](https://github.com/tienanhzz/codemark-lms/actions/runs/43817238539) all concluded success. PostgreSQL identity integration, dependency inventory/audit, and web verification completed in the rebuild workflow. The integration run exposed and fixed stale outbox verifier assumptions; Gitleaks initially flagged a test-only TOTP fixture, which was replaced with a non-secret marker before the passing scan.
- 2026-11-16: Static security review found the production CSP permitted browser connections to `127.0.0.1:8100` and `ws://127.0.0.1:8100`. Restricted those sources to development and added `verify:security-config`; the verifier and production Next.js build pass. Formal ASVS owner review remains open.
- 2026-11-16: Added the HSTS response header (`max-age=31536000`) and a production config assertion. Browser enforcement requires HTTPS at deployment; this local config check does not prove TLS is configured.
- 2026-11-16: Restricted HSTS to production and expanded assertions for Referrer-Policy and frame/content-type protections. Web tests (64), production build and security config verification pass. The GitHub connector returned no workflow runs or status records for `9287f99`; hosted acceptance for that commit remains unverified. Local API/web services are stopped.
- 2026-11-16: Refreshed dependency evidence using the pinned auditor environment. PyPI reported 64 packages and zero vulnerability records; npm reported zero findings in both runtime and full lockfile scopes. Regenerated the CycloneDX 1.6 SBOM (310 components), foundation inventory, license metadata, and validation report; schema and local-source asset checks pass. 53 licenses remain `NOASSERTION`, so legal/provenance acceptance is not complete.
- 2026-11-16: Improved foundation inventory fallbacks for PyPI license classifiers, legacy npm `licenses` metadata and version-matched installed npm manifests. Regeneration now reports zero `NOASSERTION` package licenses; this is metadata completion only and does not grant legal approval. Ruff and CycloneDX validation pass.

## Earlier unaccepted items (superseded where evidenced above)

- The Master Kit rebuild, Project CI and Secret Scan workflows passed on implementation commit `574eb67`: [Master Kit rebuild](https://github.com/tienanhzz/codemark-lms/actions/runs/43818927535), [Project CI](https://github.com/tienanhzz/codemark-lms/actions/runs/43818927345), and [Secret Scan](https://github.com/tienanhzz/codemark-lms/actions/runs/43818927383). The secret scan reported no findings. Hosted acceptance is still needed for the subsequent HSTS commits, including `9287f99`.
- Authenticated browser visual, keyboard and mobile review of the new `/operations` release panel remains pending.
- Complete dependency provenance/license review beyond the automated inventory and the ASVS security/privacy review remain open.
- Complete dependency provenance and legal review; automated license labels alone do not constitute legal approval.
- Runtime egress restrictions, TLS deployment, least-privilege service/database identities, managed key custody, an executed legacy ciphertext rewrap and verified key rotation/recovery drills, encrypted backup retention and a verified restore drill remain open.
- Deployment and release acceptance remain pending. Local health checks, unit tests and workflow definitions do not prove production readiness.

## Scope boundary

The current increment implements the release/realtime fixes, runs isolated recovery
and gateway drills and rebuilds/restarts the local application. Drill databases
and keys are temporary/test-only; existing user credentials and application data
are not rewrapped, reseeded or reset. No production service, firewall, identity or
credential was changed. BUILD-033 remains Active until its external release gates
are completed and evidenced.
