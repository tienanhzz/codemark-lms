# Dependency record — original BUILD-002

Runtime packages are installed from PyPI/npm at build time. No third-party runtime CDN, font API, telemetry or hosted API is used by application source. Python installation is hash-locked; Node dependencies are integrity-locked.

| Package | Version | Declared license |
| --- | --- | --- |
| fastapi | 0.162.7 | MIT |
| uvicorn | 0.54.0 | BSD-3-Clause |
| sqlalchemy | 2.1.8 | MIT |
| alembic | 1.20.1 | MIT |
| psycopg | 3.3.9 | LGPL-3.0-only |
| argon2-cffi | 25.1.0 | MIT |
| cryptography | 50.0.2 | Apache-2.0 OR BSD-3-Clause |
| python-dotenv | 1.2.4 | BSD-3-Clause |
| tzdata | 2026.6 | Apache-2.0 |
| pyotp | 2.10.0 | MIT |
| next | 16.4.6 | MIT |
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| qrcode.react | 4.2.0 | ISC |
| tailwindcss | 3.4.19 | MIT |
| @fortawesome/fontawesome-free | 6.7.2 | (CC-BY-4.0 AND OFL-1.1 AND MIT) |
| postcss (build only) | 8.5.33 | MIT |
| Pillow | 13.0.0 | MIT-CMU |

Noto Sans is reused from the existing project under OFL; its OFL notice is shipped in web/public/branding/OFL.txt. Font Awesome Free has distinct font/icon/code license terms in its package; preserve package notices.

BUILD-02 adds local QR rendering and TOTP verification. Development-only UI checks use Vitest 5.1.0, jsdom 31.0.1, React Testing Library 16.3.3 and user-event 14.6.10, pinned in package-lock.json. These simulated DOM tests do not replace browser or visual verification.

The original BUILD-002 review on 2026-11-14 now includes Python and full Node advisory scans. Python: 57 locked packages reported, 0 vulnerability records, 0 skipped. Node runtime and all-dependency audit: 0 known vulnerabilities after upgrading PostCSS 8.5.6 → 8.5.33. The earlier all-dependency scan found one high-severity affected package (PostCSS); its report is preserved separately. Feed results are timestamped in [BUILD-002-audits.json](master-kit/BUILD-002-audits.json), not a permanent security guarantee.

BUILD-026 adds Pillow 13.0.0 for bounded PNG decoding and metadata-free avatar re-encoding. It is pinned and hash-locked in `api/requirements.lock`; the package declares MIT-CMU and has no mandatory Python runtime dependencies. Pillow documents that it bundles/uses native image codecs, so review those codec notices and keep the dependency updated. The API accepts static PNG bytes only, limits input/output to 1 MB and dimensions to 512×512, rejects animation, and emits a newly encoded PNG without source metadata. This is a format/metadata boundary, not malware scanning; no antivirus scanner is configured. The local application makes no runtime network request for image processing. The dependency scan and updated SBOM are recorded in `master-kit/BUILD-002-audits.json` and `master-kit/dependency-sbom.cdx.json`.

The generated [CycloneDX 1.6 SBOM](master-kit/dependency-sbom.cdx.json) covers 57 Python and 237 distinct Node name/version components from the app locks, including development/optional platform packages; it is not a production image SBOM. It validates against the bundled CycloneDX JSON schema. The [license inventory](master-kit/dependency-licenses.json) records declared metadata and currently marks colorama/pathspec as NOASSERTION rather than inventing approval. Preserve license files and complete legal/release review before distribution.

Build-only audit tools are isolated from the application's `.venv`: `pip-audit==2.10.1` (Apache-2.0, installed LICENSE reviewed) and its existing `cyclonedx-python-lib==11.12.0` dependency with JSON-validation extra. Their full dependency closure is hash-locked in `tooling/security-requirements.lock`. The scanner receives public package names/versions from locks, never account data or `.env`; only build-time PyPI/npm advisory requests are enabled. Tooling purpose: dependency feed queries and offline SBOM schema validation. No runtime scanner, telemetry or hosted service is introduced. The tooling environment is not part of the application SBOM; its lock must be reviewed/updated with the build toolchain.

Still pending: comprehensive license approval, runtime egress enforcement/test, hosted CI execution, production key lifecycle and production security sign-off. Browser visual/keyboard/mobile QA is separate from source-asset checks and DOM tests.
