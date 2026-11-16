# BUILD-029 — Assignments, practice, assessment delivery, and grading

**Local functional status: Implemented.** Main local PostgreSQL is at migration `0020_attendance`; BUILD-029 schema includes migrations 0016–0019.

## Delivered

- Versioned assignment/exam authoring and publication with frozen question snapshots and course permission checks.
- Recipient snapshots, learner listing, start/resume, bounded autosave with revision checks, submit, and expiry handling.
- Objective practice with server scoring, persisted attempts, and protected answer projections.
- Teacher/Admin grading queue, rubric scoring revisions, append-only grade releases, learner-only released-grade view, and configurable late penalty tiers.
- Connected EN/VI authoring, learner attempt, practice, grading, and released-grade screens.
- Student-code execution and automatic code grading remain disabled.

## Validation — 2026-11-15

- API suite: **118 passed** (includes BUILD-030 attendance coverage); Ruff and strict mypy passed across 43 modules.
- Web suite: **53 passed**; TypeScript and production build passed.
- Main PostgreSQL was already at `0019_assessment_grading`; migration runner confirmed head and schema parity without an additional change.
- Browser visual, keyboard, and mobile inspection remains pending because browser access is unavailable.

## Follow-up

- BUILD-028's main local taxonomy still needs its authenticated Admin import; no direct database seed or auth bypass was used.
- The separate `codemark_lms_test` integration script stopped because that existing database contains taxonomy rows while the script assumes a fresh catalog. It was left untouched.
