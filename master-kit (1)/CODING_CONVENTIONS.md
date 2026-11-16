# Coding Conventions

**Status:** Project standard for application code. The initial framework/runtime direction is selected in ADR-0005; dependencies may be installed with their package managers and must be pinned/reviewed. Tooling below is the required baseline; no formatter or linter is installed by this document.

## 1. Repository and architecture

- Application code, tests, and runtime configuration belong in `cyb3rt1tan-lms`. `master-kit` remains the product, architecture, and API-contract source.
- Organize backend code by business capability/domain, not by generic technical layer alone. Keep HTTP handlers thin; put authorization and business rules in tested application/domain services.
- Keep Next.js UI components focused on presentation and interaction. Put API access behind typed client/service modules; do not duplicate API contracts in pages.
- Do not let one domain write another domain's tables or bypass its service boundary. Cross-domain behavior uses explicit application services and database transactions.
- Keep generated files, build output, local secrets, and uploaded data out of source control. Commit lockfiles and reviewed configuration.
- Follow `SECURITY_STANDARDS.md` and ADR-0006: bundle/self-host runtime assets; do not call third-party APIs or use runtime egress without a separately approved exception. Internal LMS service APIs are allowed. Install dependencies with the package manager and pin/review them.

## 2. Formatting and naming

Use UTF-8, LF line endings, no trailing whitespace, and a final newline. Use four spaces for Python, two spaces for TypeScript/TSX, JSON, YAML, and CSS. Keep source lines near 100 characters; split long expressions when doing so improves readability.

### Python

- Follow PEP 8 naming: `snake_case` for modules, packages, functions, variables, and fields; `PascalCase` for classes and exceptions; `UPPER_SNAKE_CASE` for module constants.
- Use explicit type annotations on public functions, methods, and module boundaries. Prefer precise collection/generic types and typed domain objects over `Any`, untyped dictionaries, or casts.
- Use `snake_case` for Python internals and database columns. Convert to the API's published JSON property names only at the serialization boundary.
- Use docstrings for public modules/classes/functions when they clarify purpose, invariants, or usage. Do not add comments that merely repeat the code.

### TypeScript and React

- Enable TypeScript `strict` mode. Do not use `any`; use `unknown` plus validation for untrusted values.
- Use `PascalCase` for React components and component files, `camelCase` for functions/variables, `useX` for hooks, and `UPPER_SNAKE_CASE` only for true constants.
- Prefer named exports for shared components and utilities. Keep route entry points in the framework's required format.
- Use semantic HTML and controlled, accessible components. Share design tokens and primitives rather than creating role-specific copies of common UI.
- Keep user-facing text in locale dictionaries/messages. English is the default locale; Vietnamese is supported. Do not hard-code translated strings into shared components.

### JSON, YAML, CSS, and API identifiers

- OpenAPI 3.1 is the source of truth for REST paths, request/response shapes, status codes, and operation IDs. Do not edit generated clients by hand.
- Keep API paths lowercase and resource-oriented; follow the existing `/v1` contract. JSON fields use the exact casing defined in OpenAPI (currently predominantly `camelCase`); Python and database naming conventions do not alter the wire format.
- Use the contract's standard error envelope and safe messages. Include request/correlation IDs where specified.
- Use stable IDs for persisted entities. Do not expose private answer keys, authoring configuration, hidden tests, or other staff-only fields in student responses.

## 3. Required checks when tooling is introduced

Pin tool and dependency versions in the relevant manifests/lockfiles. Package registries may be used during development/build; application runtime must not fetch dependencies or assets from external hosts. Run all checks in CI and locally before submitting changes.

### Python baseline

- **Ruff** for linting and formatting; configure a 100-character line length and deterministic import sorting.
- **mypy** in strict mode for application code.
- **pytest** for tests; coverage should be collected for backend code and changed behavior should receive direct tests.
- Keep lint, formatting, type-check, tests, and migration checks as separate CI steps so failures are diagnosable.

### Next.js / TypeScript baseline

- **ESLint** with the Next.js rules and **Prettier** for formatting; set a 100-character print width, single quotes in JS/TS, semicolons, and trailing commas.
- Use **Prettier Tailwind CSS plugin** to sort utility classes consistently. Keep reusable class combinations in components/utilities instead of maintaining long, divergent inline strings.
- Run `tsc --noEmit`, lint, formatting checks, and tests in CI.
- **Vitest** with React Testing Library for component/unit tests; **Playwright** for critical end-to-end flows and responsive/accessibility smoke checks.

### Contract and repository checks

- Validate application API behavior/client generation against `master-kit/contracts/core-api/openapi.yaml`; contract changes must be reviewed with their implementation impact.
- Run the existing contract validation from `master-kit` in CI once the repository relationship is automated. Do not silently copy or fork the specification.
- Check formatting, secret scanning, dependency vulnerabilities, and migration consistency in CI. Fail closed on required checks.
- Check dependency lockfile integrity, source provenance, license allowlist, SBOM, and vulnerability status. Verify that runtime does not contact public registries, CDNs, or third-party APIs.

## 4. Testing conventions

- Name tests for observable behavior and business invariants, not private implementation details.
- Unit-test domain rules without network, Redis, or database dependencies.
- Integration-test persistence, transactions, authorization, idempotency, outbox delivery, and Redis interactions at their service boundaries.
- Use isolated test databases/Redis instances or disposable containers. Never run destructive tests against shared or production systems.
- Test unauthorized and cross-course access as negative cases; test both success and failure paths for consequential mutations.
- For UI changes, cover keyboard operation, accessible names/focus, loading/error/empty states, locale switching, responsive layouts, and reduced-motion behavior where applicable.
- Avoid flaky timing-based tests and sleeps. Use deterministic clocks, explicit synchronization, and stable fixtures.

## 5. API, data, and security rules

- Authorization is default-deny and enforced server-side on every protected operation. UI visibility is not an authorization boundary.
- Never expose sequential database IDs in public URLs; use random public IDs. Use the standard authenticated `ResourceReferenceCodec` only for references that must conceal internal IDs; it never replaces authorization.
- Validate all external input at the boundary. Use parameterized database operations; never build SQL from user-controlled strings.
- Persist business mutations and their audit/outbox records atomically. Handlers and workers must be idempotent and safe under retries.
- PostgreSQL is authoritative for business state. Redis contains only queue/realtime coordination and rebuildable or ephemeral data as specified by the ADRs.
- Store timestamps in UTC and preserve explicit IANA time zones for schedules and user/course preferences.
- Published question, assessment, policy, and grading versions follow the immutability rules in the contracts. Amend by creating a new version, not overwriting history.
- Do not log passwords, tokens, full submissions, source code, hidden tests, answer keys, or unnecessary personal data. Keep secrets in the approved secret store/environment, never in code, fixtures, logs, or committed `.env` files.
- Use maintained standard cryptographic libraries and managed keys; never implement proprietary encryption. Enforce the network, dependency, key-management, and application controls in `SECURITY_STANDARDS.md`.
- Handle errors explicitly. Do not hide failures with broad exception catches, silent defaults, or success-shaped fallback responses.

## 6. UI, accessibility, and localization

- Follow the approved design tokens and shared role-based shell; palette selection is a user preference, not separate role-specific styling.
- Use Font Awesome icons consistently with visible labels or accessible names. Hide decorative icons from assistive technology; do not use ambiguous icon-only actions.
- Meet WCAG 2.2 AA contrast and keyboard/focus expectations. Do not communicate status with color alone.
- Respect `prefers-reduced-motion`; motion is optional feedback and must not block submission, grading, autosave, or exam controls.
- Format dates, numbers, and pluralized messages with locale-aware utilities. Keep accessible labels, validation errors, notifications, and empty/loading states localized too.
- Preserve responsive behavior at mobile, tablet, and desktop sizes; test the collapsible desktop sidebar and mobile navigation drawer.
- UI/UX Pro Max and Impeccable are design-review guidance, not sources of application code or permission to change product rules. Do not enable unreviewed installers, unattended hooks, or live-apply automation.
- Animate UI adoption is optional and requires framework compatibility, pinned dependencies, reduced-motion review, and license/distribution review before installation.

## 7. Change and review workflow

- Keep changes focused. Update tests and the relevant contract/docs in the same change when behavior changes.
- Do not combine formatting-only churn with functional changes unless the formatter is being introduced or corrected.
- Before review, run formatter checks, lint, type-check, targeted tests, relevant integration/contract checks, and `git diff --check`.
- Review generated code and dependency changes; do not commit generated artifacts unless the generation policy explicitly requires them.
- Do not claim a check passed if it was not run. Record blocked or unavailable checks plainly.

## 8. Decisions intentionally not made here

This convention does not choose the PostgreSQL deployment, Python queue/realtime packages, object storage, production secret manager, code-runner isolation, deployment target, or final palette/theme default. Resolve these in separate architecture decisions before their runtime dependencies are added.
