# LMS Design System Proposal

**Status:** Exploratory proposal. All three palettes remain candidates for a user-selectable preference; the default light/dark theme, font, and component library are not approved. The companion [`design-preview/index.html`](../cyb3rt1tan-lms/design-preview/index.html) is a disposable visual prototype, not the application shell.

## Confirmed product direction

- Application backend language: Python.
- Role-based web interface: Next.js, Tailwind CSS, and Font Awesome.
- PostgreSQL remains the source of truth; Redis remains infrastructure for asynchronous work, realtime coordination, and ephemeral state.
- The OpenAPI 3.1 contract remains the API source of truth.
- Reuse the supplied Cyb3rT1tans logo as a brand reference. Its deep navy, cyan, and warm-gold details inform the preview options but do not dictate the final palette.

## Technology reconciliation and runtime choices

ADR-0005 selects Python 3.13 + FastAPI, SQLAlchemy 2 + Alembic, and Next.js 16 + React 19 + Tailwind CSS 3 + Font Awesome 6 for the application foundation. PostgreSQL remains authoritative. Realtime uses the Socket.IO protocol via Python `python-socketio` ASGI integration, `AsyncRedisManager`, and browser `socket.io-client`; the pinned runtime and transactional-outbox integration are implemented. ADR-0009 documents dormant Redis Streams dispatch/admission plumbing; it does not authorize code execution. ADR-0010 accepts a standalone trusted-source Local Autograder for local author validation only. Student-code execution remains disabled, and the former ADR-0008 gVisor proposal is historical/superseded for the initial scope. Object-storage deployment remains open.

The web app is specified as Next.js + TypeScript + Tailwind CSS + Font Awesome. Generate or validate its API client from the existing OpenAPI document rather than duplicating request/response types manually.

## Design-tool roles and guardrails

- **UI/UX Pro Max:** visual direction, information architecture, hierarchy, responsive layout, and accessibility review. Use the already audited pinned snapshot as guidance; do not run its installer or CLI as part of this proposal.
- **Impeccable:** critique prompts and design-quality checks, not authority to change product requirements. Do not enable unattended hooks or its documented live-apply fallback.
- **Animate UI:** optional motion implementation after the React/component versions are pinned. It must not choose the design or force a component migration. Its audited license includes the Commons Clause; review distribution implications before dependency adoption, and do not vendor or redistribute upstream components.
- The sample is plain, local HTML/CSS/JavaScript with no skill installers, external scripts, fonts, analytics, or framework dependencies. Its small text symbols are placeholders; the application should use the selected Font Awesome package.

## Shared design language

Use one shared application shell across Student, Teacher/Teaching Assistant, and Admin roles: consistent navigation geometry, header, page title, content grid, typography scale, spacing, form behavior, feedback states, and responsive breakpoints. The primary interface language is English, with a language selector demonstrated for English and Vietnamese; localization must include navigation, controls, status messages, dates, and accessibility labels. The sidebar must expand/collapse on desktop and open/close as a drawer on mobile. Permissions determine which navigation and data are visible; hiding a control is not authorization.

Role pages should change content density and task priority, not invent separate visual systems:

- **Student:** learning progress, due work, course access, practice, and feedback.
- **Teacher/Teaching Assistant:** course activity, grading queue, attendance, and authoring tasks.
- **Admin:** operational attention, user/course administration, policy, and audit-oriented summaries.

Prefer calm neutral surfaces and reserve brand colors for navigation, active states, primary actions, and small data highlights. Use semantic success, warning, danger, and informational colors consistently; never communicate status by color alone. Data tables should remain readable and responsive, with filters and actions placed predictably.

## User-selectable palettes — all provisional

The preview offers eight alternatives. They intentionally share neutral surfaces and status colors so users can choose their preferred accent without changing layout or role behavior:

1. **Navy + Cyan + Gold:** closest to the logo; navy navigation, cyan primary actions, gold achievement highlights.
2. **Ocean + Teal:** quieter academic appearance.
3. **Indigo + Cyan:** digital-product character.
4. **Forest + Lime:** green surfaces with a light lime accent.
5. **Rose + Slate:** rose accent with muted slate surfaces.
6. **Sunset + Coral:** warm terracotta/coral direction.
7. **Violet + Amber:** violet accent with warm secondary highlights.
8. **Graphite + Cyan:** restrained neutral palette with cyan highlights.

Each palette can be viewed in light and dark mode. The selected language, palette, and appearance are personal user preferences, not role-specific settings. The preview stores preferences separately for its sample users in local browser storage; production settings must be persisted to the authenticated user's account through `GET/PUT /v1/me/preferences`. The initial default palette and light/dark appearance still need approval. Check text, focus, disabled, hover, selected, and error states before fixing token values. Target WCAG 2.2 AA contrast; verify all final token pairs rather than relying on draft swatches.

## Layout, interaction, and accessibility principles

- Start with a desktop dashboard and verify tablet/mobile behavior: collapsible navigation, single-column cards, usable tables, no horizontal overflow for core tasks.
- Keep page titles, primary action, filters, and content hierarchy stable across roles.
- Use consistent spacing, radius, elevation, and border tokens; avoid excessive gradients, glass effects, glow, and card-on-card nesting.
- Provide visible keyboard focus, semantic headings/landmarks, labeled controls, accessible dialogs, error summaries, and announced save/loading states.
- Ensure keyboard and touch interactions are complete; never rely only on hover or color.
- Respect `prefers-reduced-motion`. Motion is brief, non-blocking, and communicates state; never delay exams, autosave, grading, or form submission.
- Provide light and dark themes only if each remains contrast-checked and complete. Persist the user's preference, not a second divergent design system.
- Use Font Awesome icons consistently with labels or accessible names; decorative icons are hidden from assistive technology. Do not use icons alone for ambiguous actions.

## Review gate before implementation

1. Open the sample and compare all three palette buttons in both theme modes and across the three roles and both language options. All three palettes are intended to remain user-selectable; choose which one is the initial default.
2. Choose the initial palette and light/dark defaults and provide any institutional brand constraints.
3. Review logo placement/scale and whether it belongs in the persistent navigation.
4. Approve typography and density direction; only then translate provisional values to Tailwind design tokens and Next.js components.
5. Before adding further runtime dependencies or enabling code execution, approve protected object storage and code-runner deployment/conformance; separately complete Redis consumer recovery and production queue operations.
