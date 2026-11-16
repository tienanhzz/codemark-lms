# BUILD-030 — Attendance, Learning Overview, reports, exports, and audit

**Local status: Done — core feature, interface, deployment, and local validation gates passed.**

## Implemented

- Attendance windows with hashed short-lived rotating tokens, grace-period late status, check-in, close/absence marking, excusal requests and staff decisions, reasoned corrections, and append-only history.
- Student Learning Overview for self and permission-scoped staff views, including attendance, practice, lesson-plan completion, assessment status, and recent activity. Sensitive grade and attendance details are independently permission-filtered.
- Learners can mark published course lesson-plan entries complete; completion is stored per learner/course/entry and summarized in the overview.
- Permission-scoped CSV/XLSX student-progress report jobs with expiry, actor ownership, download-time reauthorization, required export reasons, and audit logging.
- Admin audit search/export UI and API with metadata-only IP digests.
- Connected Student, Teacher, and Admin screens for attendance, learning overview, reports, and audit.

## Validation status — 2026-11-15

- API suite: **120 passed**; Ruff and strict mypy passed across 47 modules.
- Web suite: **56 passed**; TypeScript check and production build passed.
- Local PostgreSQL upgraded to `0023_lesson_completion`; guarded private backup, schema drift check and users/sessions/audit/courses row-count parity passed.
- Local API readiness and pages `/`, `/attendance`, `/reports`, and `/audit-retention` returned HTTP 200.
- Existing `codemark_lms_test` contains user data and was not reset. The dedicated browser access host was unavailable for a separate visual/keyboard/mobile walkthrough; the production build, DOM suite, and local route checks passed.

## Notes

- The unavailable browser host prevented manual screenshot walkthrough; no impact to runtime/API test, database migration, or production build verification.
