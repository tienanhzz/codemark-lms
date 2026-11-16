# Security Standards

**Status:** Accepted project baseline, 2026-11-06. These are implementation requirements, not evidence that the scaffold already enforces them.

## 1. Security objectives

- Protect student/staff identity, submissions, source code, grades, answer keys, exams, financial ledgers, and audit history.
- Enforce least privilege, default-deny authorization, tenant/course boundaries, and auditable privileged actions.
- Minimize data collection, retention, exposure in logs, and outbound network access.
- Treat dependency provenance, runtime network restrictions, build reproducibility, and recovery as security controls.
- Use established cryptographic primitives and maintained libraries. Do not invent ciphers, key derivation, or authentication schemes.

## 2. Network and dependency policy

- Runtime services must not depend on public Internet availability. Deny outbound network traffic by default; allow only explicitly approved internal destinations and protocols.
- No third-party CDN, remotely hosted script/font/style/image, analytics, telemetry, crash-reporting beacon, tracking pixel, or runtime asset fetch. Bundle reviewed frontend assets locally with the application.
- No third-party hosted API or SaaS integration. Calls between this LMS's own UI, backend, worker, database, Redis, and self-hosted services are internal project APIs and remain permitted. Such calls must use authenticated, authorized, encrypted service boundaries.
- Email invitations must use an administrator-approved SMTP relay under project control; application services must not call a third-party email-provider API directly. The relay is an explicit, allowlisted egress boundary.
- Do not add a dependency unless its purpose, version, license, source, transitive dependency tree, and security impact have been reviewed and recorded. Prefer the smallest maintained dependency set.
- Install required libraries through the appropriate package manager even when they are not preinstalled. Package registries may be contacted during dependency installation/build; exact versions must be pinned and lockfiles committed. Do not confuse package installation with runtime asset delivery: application assets and dependency code are bundled/self-hosted, never loaded from a CDN at runtime.
- Review dependency purpose, license, source, transitive dependency tree, and security impact; use lockfile integrity hashes and vulnerability scanning. Record an SBOM for each release. An internal artifact cache is optional for reliability, not a prerequisite for adding dependencies.
- CI may fetch pinned build dependencies and security data from approved package registries/feeds. CI must still report provenance, license, secret-scanning, static-analysis, test, and vulnerability results accurately; a stale or unavailable feed must not be represented as a clean scan.
- Exceptions to runtime network restrictions require a documented ADR, security owner approval, an explicit destination/permission allowlist, data-flow/threat review, and a removal/review date. No exception may permit remote CDN assets or arbitrary runtime egress.

## 3. Application security baseline

- Use OWASP ASVS Level 2 as the minimum verification target for the web application and APIs. Threat-model authentication, authorization, file uploads, assessments/exams, code execution, exports, admin workflows, and third-party-free build/import paths before implementation.
- Authenticate every protected request. Enforce authorization in the backend on every read and write, using default-deny policies and current user/course scope. Never rely on an opaque URL, hidden UI element, unguessable identifier, or client-side role as authorization.
- Prevent cross-user and cross-course object access. Apply object-level checks after resolving every resource reference; return the repository's safe error envelope without disclosing whether an inaccessible object exists where practical.
- Use secure, same-site, HTTP-only cookies for browser sessions; protect state-changing cookie-authenticated requests against CSRF. Set bounded session lifetimes, rotate session identifiers on authentication/privilege changes, support session revocation, and require MFA for privileged roles according to product policy.
- Store passwords only with Argon2id using a maintained implementation and reviewed parameters; never log, email, or expose passwords. Use single-use, expiring, rate-limited invitation/reset tokens.
- Validate and bound all input at the service boundary. Use parameterized SQL, safe output encoding, restrictive CORS (same-origin by default), request/body limits, rate limits, and explicit timeouts. Do not expose debug traces or secrets in client errors.
- Prevent SSRF and unrestricted file/network access. Uploaded files require type/size validation, generated storage names, private storage, malware scanning where available, and safe download headers. User-controlled URLs must not cause server-side fetches by default.
- Use TLS for browser and service traffic, including internal service links. Encrypt sensitive backups and storage using managed keys. Never implement encryption algorithms manually.
- Store secrets outside source control and build artifacts, inject them at runtime from an approved secret store, separate keys by environment/purpose, and support rotation. Do not use shared development keys in production.
- Keep append-only audit records for authentication/security events, role and permission changes, exports, grading/grade publication, exam interventions, ledger mutations, key operations, and administrative changes. Audit records must exclude passwords, bearer/session tokens, cryptographic keys, and unnecessary sensitive payloads.
- Logs must be structured, access-controlled, retained per policy, and scrubbed of credentials, tokens, private tests, answer keys, student source code, and unnecessary PII. Security failures must be visible to operators without leaking data to users.
- Set security headers including a restrictive Content Security Policy (no `unsafe-eval`, no remote script/style origins), HSTS in HTTPS deployments, `X-Content-Type-Options`, a suitable `Referrer-Policy`, and frame restrictions. CSP must allow only locally bundled assets and explicitly approved same-origin endpoints.
- Make security tests mandatory for authentication, authorization, cross-course isolation, CSRF, rate limits, input handling, audit events, secret redaction, and failure/rollback paths. Include dependency/build provenance and runtime egress/CDN assertions in CI.
- Student-code execution is disabled. The standalone Local Autograder in ADR-0010 is limited to explicitly confirmed trusted author/developer source and runs with the current user's OS permissions; it is not a sandbox and must never process learner submissions. ADR-0008 and `CODE_RUNNER_THREAT_MODEL.md` preserve the historical gVisor proposal only. Any future untrusted-code execution requires a new product/security decision and threat review.
- Maintain encrypted backups and test restore procedures. Define incident response, key compromise/rotation, vulnerability intake, patch SLAs, and data-retention/deletion procedures before production.

## 4. Resource identifiers and encrypted references

- Never put sequential database keys in public URLs or client-visible contracts. Use random, non-sequential public identifiers with at least 122 random bits (UUIDv4 is acceptable; prefer 128 bits or more where supported) as the normal resource reference. Do not derive public identifiers from user/course names, emails, institutional IDs, row counts, or timestamps.
- The database may retain internal primary keys, but the API and UI use public IDs. Category/tag slugs are labels/navigation only and must not become authorization credentials.
- Add a single backend `ResourceReferenceCodec` security service for cases that require encrypted references. It must use a maintained, locally installed cryptographic library and authenticated encryption (AES-256-GCM is the baseline); custom/proprietary cryptography is prohibited.
- The codec contract is:
  - `encode(resource_type, internal_id, context) -> opaque_token`
  - `decode(expected_resource_type, opaque_token, context) -> internal_id`
  - Use a fresh 96-bit cryptographically secure nonce for every AES-GCM encryption. Authenticate the format version, key identifier, resource type, and supplied tenant/course context as associated data. Encode a versioned token such as `v1.<key-id>.<nonce>.<ciphertext>` using URL-safe Base64 without padding; do not include plaintext IDs or PII in the token.
  - Reject malformed, tampered, wrong-version, wrong-key, wrong-resource-type, and wrong-context tokens with a generic client error. Never fall back to plaintext IDs or weaker crypto.
  - Load independent encryption keys from the runtime secret manager, not source code, environment examples, database rows, or client storage. Support key identifiers and rotation; retain decryption keys only for the documented maximum token lifetime and reissue references as needed.
  - Avoid putting long-lived secrets or authorization claims in references. Encrypted references identify objects only; every decoded object still requires normal authorization. Use a separate, explicitly designed, expiring signed capability only if a future workflow truly requires delegated access.
- The codec is not a replacement for random public IDs and is not required on every route. Use public IDs for stable resource URLs by default; use encrypted references only when concealing internal identifiers is a defined requirement. Do not use reversible encryption as a way to make sequential IDs appear secure.
- Preserve the existing self-hosted SMTP relay requirement for invitation mail; it is not permission for application services to use external provider APIs.
- Test nonce uniqueness, round-trip behavior, context binding, tamper rejection, key rotation, and absence of plaintext identifiers. Never log the token or decoded identifier pair.

## 5. Implementation gate

Before runtime release, security owners must approve the threat model, deployment egress policy, dependency review/update process, secret and key lifecycle, security test plan, and exception register. The current contract-validation workflow uses hosted GitHub Actions and installs validation packages; this is permitted for build-time use under the updated dependency policy, but it does not verify the production runtime's outbound-network restrictions. `master-kit` currently contains specifications and CI contract checks only; it does not yet contain application runtime enforcement.
