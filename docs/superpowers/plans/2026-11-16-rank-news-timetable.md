# Rank visuals, bulletin and weekly timetable implementation plan

> **For agentic workers:** Use focused parallel implementation for the independent UI, bulletin and timetable work; parent integrates and verifies.

**Goal:** Restore the six legacy rank artworks and colors, provide a distinct collapsible ranking rail, enrich the bulletin with actual Top 5 changes and study guidance, and show real weekly teaching sessions in a calendar grid.

**Architecture:** Reuse existing PostgreSQL ledger, course permissions, teaching sessions and static PNG assets. Use existing active rank policies when present; otherwise use the legacy position mapping for leaderboard artwork. Derive read-only bulletin highlights from bounded recent EXP history. Calendar endpoint selects only visible courses and bounded date ranges.

**Tech stack:** Next.js/React/TypeScript, FastAPI/SQLAlchemy/PostgreSQL, Vitest, pytest, Playwright Edge.

**Spec:** User request in this conversation, 2026-11-16: rank logos/colors, distinguishable expand control, Top 5 changes/congratulations and common study notices, weekly timetable with time column.

## Constraints and review focus
- Preserve current uncommitted work and personal account settings; do not seed arbitrary EXP thresholds or fictional schedules.
- Active rank policies take precedence over legacy fallback; ties share the same rank/artwork.
- Authenticated highlights must not reveal emails or official contact data; GET must not write announcements.
- Rank rail collapses independently of the menu and releases main-content width, including mobile layouts.
- Week navigation uses the user's timezone; midnight/overlapping sessions remain visible and grid overflow stays contained.

## Tasks
- [ ] Rank artwork: failing rendering tests, shared palette/badge, full and compact ranking surfaces, policy/position fallback tests.
- [ ] Ranking rail: failing interaction tests, independent toggle with trophy label and amber appearance, session-scoped collapsed preference, responsive layout.
- [ ] Bulletin: auth/privacy/ties/movement tests, real bounded highlights plus study guidance, bilingual announcement cards and refresh.
- [ ] Timetable: permission/date-range and calendar tests, real session endpoint, seven-day grid/time column, rename navigation and homepage shortcut.
- [ ] Integrate: targeted and full tests, TypeScript and production build, restart owned runtime, desktop/mobile browser checks and screenshots.
