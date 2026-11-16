# BUILD-002 — Application foundation acceptance

Execution: `local-master-kit-2026-11-14`; scope is the original BUILD-002 foundation, not the entire LMS or production release.

## Delivered foundation and checks

- Python 3.13/FastAPI/SQLAlchemy/Alembic API and Next.js 16/React/TypeScript/Tailwind/Font Awesome frontend already exist; retain the functional identity/course subset while re-evaluating later original builds.
- Local fonts/icons/assets, CSP/security headers, same-origin API proxy, no hardcoded external runtime asset/fetch references in app source, and Next telemetry disabled by the launcher. This source check does not prove firewall enforcement or absence of every dynamic request.
- AES-256-GCM reference helper with fresh nonces, context binding/canonical encoding; existing access tests cover authentication/CSRF/session isolation and reference tamper/context behavior. Production key provider/rotation remains a release gate.
- Hash-locked Python dependencies, exact Node direct dependencies/integrity lock; reproducible inventory checks detect manifest/installed-version/lock inconsistencies.
- SBOM and declared-license metadata generated for 57 Python/237 distinct Node components, with dependency references checked; CycloneDX 1.6 schema validation passes using bundled schemas without external schema fetch.
- Build-only audit tools installed from a hash lock in a separate `.tools/master-kit-audit` virtualenv, not in API runtime. No `.env`, database, private backup or user data is included in reports.
- Full Node audit exposed PostCSS 8.5.6 advisories, including high-severity source-map file reads; upgraded this existing devDependency to pinned **8.5.33**. Retained [before-fix report](node-all-audit-before-postcss-fix.json). Latest Python, Node runtime and full Node scans report zero findings/zero Python skips; see [audit evidence](BUILD-002-audits.json).
- API checks: **43 pytest tests**, Ruff format/check and strict mypy pass. Web: **10 DOM/timezone tests**, strict TypeScript and production build pass after the PostCSS patch. DOM/HTTP checks are not browser visual QA.
- Read-only HTTP verification after the patch: 12 production routes/12 local JS/CSS bundles, bundled font/favicon, CSP/nosniff/frame headers, API readiness and 401/no-store boundaries pass. No actual account login, database reset or business-data mutation was performed; current API/data were retained and web restarted on port 3100. Evidence: [BUILD-002-http.json](BUILD-002-http.json).
- Added reusable SBOM/source/contract/audit checks to the existing CI definition with JSON artifact collection. Hosted execution has not been observed.
- Corrected developer documentation entry point at `docs/CODING_CONVENTIONS.md`; README and original-ID execution plan point to current acceptance rather than historical Done labels.

## Reproduce

From `cyb3rt1tan-lms`, with the app dependencies already installed from locks:

```powershell
.\.venv\Scripts\python.exe scripts/verify-master-kit.py
.\.venv\Scripts\python.exe scripts/foundation-evidence.py
# Build-only tools; Windows example, outside the app runtime virtualenv
.\.venv\Scripts\python.exe -m venv ..\.tools\master-kit-audit
..\.tools\master-kit-audit\Scripts\python.exe -m pip install --require-hashes -r tooling/security-requirements.lock
..\.tools\master-kit-audit\Scripts\python.exe scripts/validate-sbom.py
.\.venv\Scripts\python.exe scripts/audit-dependencies.py
```

Feed queries require development network permission. A feed error, skipped package or advisory causes nonzero exit and an incomplete/finding status, never a clean result. `python-audit.json` is initialized before scanning so stale clean data cannot masquerade as a new scan. The CI uses `.local/audit-venv` on Linux and passes its interpreter explicitly.

## Scope and open release gates

BUILD-002 supplies technical/UI foundations; it does not create a new user-facing domain screen. The actual workspace and full role page coverage are reviewed next at BUILD-012/024. All later domain builds must finish connected UI as requested.

Browser visual/keyboard/mobile inspection remains unverified because the supported browser host is unavailable. Legal review of declared licenses/NOASSERTION entries, production ASVS verification, secret/key rotation, deployment egress/TLS, least-privilege database roles, SMTP delivery, backup/restore drills and hosted CI are still open. These are recorded for their original domain/release builds, not claimed passed here.
