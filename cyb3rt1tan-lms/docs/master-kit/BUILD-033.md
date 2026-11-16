# BUILD-033 — Hosted CI, security and release acceptance

**Status:** Active — hosted CI coverage expanded; the GitHub Actions run and production security/recovery gates remain unverified.

## Implemented in this increment

- Root CI now verifies both Java/Next.js application trees, including the `codemark-lms/` project copied into the parent repository. Each backend runs Maven `verify`; each frontend installs from its committed lockfile and runs its production build.
- CI workflows now declare read-only repository permissions, bounded job timeouts and cancellation of superseded runs.
- The API workflow now runs Ruff formatting checks only on changed Python files while continuing lint/type checks across the full API; this keeps the existing unformatted-file backlog from blocking unrelated builds while enforcing formatting on new changes.
- The master-kit rebuild workflow now runs for changes to project docs, root scripts and package manifests in addition to application and contract sources. This closes trigger gaps that could otherwise leave generated DTOs, contracts or build scripts unchecked.
- Added a weekly and push/PR Gitleaks secret scan, pinned to its immutable v3.0.0 commit. The scan has read-only repository access and does not post comments or upload findings as an artifact.
- Added weekly Dependabot update groups for GitHub Actions, npm, Maven and the Python API dependencies across the repository's active project trees.
- Upgraded workflow actions to Node 24 compatible release lines and disabled persisted checkout credentials in jobs that only need source reads.
- Production CSP now allows browser connections only to same-origin endpoints; loopback API and WebSocket sources are included only during development. Added a config verifier for both environments.
- Web responses now advertise one year of HSTS; extended the security config verifier to assert the production HSTS and content-type protections.
- Production startup now rejects missing/short LOGIN_HMAC_KEY values and missing, malformed or matching MFA_ENCRYPTION_KEY values. Error messages do not include key material.
- MFA ciphertext now supports a versioned AES-GCM key ID through `MFA_ENCRYPTION_KEYS` and `MFA_ACTIVE_KEY_ID`; legacy v1 records continue to use `MFA_ENCRYPTION_KEY`.
- Added `api/scripts/rewrap-mfa-secrets.py`. It defaults to a read-only dry-run; apply is limited to production, requires a versioned active key, an explicit confirmation phrase and `--backup-verified`, locks MFA rows, verifies decrypt/re-encrypt round trips, and writes a count-only audit event in the same transaction.
- Admin `/operations` now includes a bilingual, responsive release-evidence panel. It keeps live database diagnostics separate from external gates and marks CI, secret scanning, ASVS, backup/restore, egress/TLS, key rotation and release approvals as unverified instead of inferring a pass.
- The key custody card now reflects the actual implementation state: rewrap tooling exists, remains unrun, and old keys must be retained until rewrap and recovery evidence are reviewed.

## Progress log

- 2026-11-16: Started the independent CI/security portion of BUILD-033 while BUILD-031/032 wait on authenticated browser acceptance. Added production startup checks for the login HMAC and MFA encryption keys, then added versioned MFA key IDs while preserving legacy reads. Added the Admin release-evidence interface with explicit unverified states. Added a guarded rewrap utility; it has not been run, and no production database or service was changed. Rotation and recovery drills remain unaccepted.
- 2026-11-16: Local verification passed: API suite 164 tests, Ruff lint and strict mypy including maintenance scripts; web suite 64 tests, TypeScript typecheck and production build. The run found and fixed a stale MFA configuration call in the Admin identity-status endpoint, and updated production configuration fixtures for the new key guards. Full API Ruff format check still reports 57 pre-existing files outside this increment; changed Python files were formatted. `git diff --check` passed. No production service or database was touched.
- 2026-11-16: Updated the rebuild workflow to scope Ruff formatting enforcement to changed API Python files, preserving full-project lint/mypy and the complete test/build jobs. Workflow YAML parses locally; GitHub-hosted execution is still pending.
- 2026-11-16: Added direct tests for legacy/v2 ciphertext reads, dry-run immutability, active-key rewrap, corrupted ciphertext rejection and missing-old-key rejection. Extracted the rewrap logic into an app module, linted and type-checked the maintenance CLI, and extended CI Ruff/mypy coverage to API scripts. Full API suite: 164 passed.
- 2026-11-16: Hosted acceptance passed on commit `f178a99`: [Master Kit rebuild](https://github.com/tienanhzz/codemark-lms/actions/runs/43817238477), [Project CI](https://github.com/tienanhzz/codemark-lms/actions/runs/43817238501), and [Secret Scan](https://github.com/tienanhzz/codemark-lms/actions/runs/43817238539) all concluded success. PostgreSQL identity integration, dependency inventory/audit, and web verification completed in the rebuild workflow. The integration run exposed and fixed stale outbox verifier assumptions; Gitleaks initially flagged a test-only TOTP fixture, which was replaced with a non-secret marker before the passing scan.
- 2026-11-16: Static security review found the production CSP permitted browser connections to `127.0.0.1:8100` and `ws://127.0.0.1:8100`. Restricted those sources to development and added `verify:security-config`; the verifier and production Next.js build pass. Formal ASVS owner review remains open.
- 2026-11-16: Added the HSTS response header (`max-age=31536000`) and a production config assertion. Browser enforcement requires HTTPS at deployment; this local config check does not prove TLS is configured.

## Not yet accepted

- The Master Kit rebuild, Project CI and Secret Scan workflows passed on implementation commit `574eb67`: [Master Kit rebuild](https://github.com/tienanhzz/codemark-lms/actions/runs/43818927535), [Project CI](https://github.com/tienanhzz/codemark-lms/actions/runs/43818927345), and [Secret Scan](https://github.com/tienanhzz/codemark-lms/actions/runs/43818927383). The secret scan reported no findings. These results predate the HSTS addition in this working increment; the updated commit still needs hosted CI.
- Authenticated browser visual, keyboard and mobile review of the new `/operations` release panel remains pending.
- Complete dependency provenance/license review beyond the automated inventory and the ASVS security/privacy review remain open.
- Runtime egress restrictions, TLS deployment, least-privilege service/database identities, managed key custody, an executed legacy ciphertext rewrap and verified key rotation/recovery drills, encrypted backup retention and a verified restore drill remain open.
- Deployment and release acceptance remain pending. Local health checks, unit tests and workflow definitions do not prove production readiness.

## Scope boundary

This increment changes CI wiring, production configuration validation and response headers, MFA ciphertext versioning and rewrap tooling, and the Admin release-evidence interface. It does not deploy the application, alter local databases or running services, create credentials, or claim a hosted result for the HSTS addition. The project remains unsuitable for production until the remaining release gates above are completed and evidenced.
