# Restore legacy home, login and live leaderboard

Reference: existing frontend/app/page.tsx, frontend/app/login/page.tsx and frontend/components/Leaderboard.tsx. Keep the new app authentication/MFA, dark gray sidebar and PostgreSQL data.

1. Implement authenticated student/teacher EXP leaderboard, full-cohort tie ranks before search, safe public names; verify role filtering and immutable real ledger totals.
2. Port reusable legacy carousel vectors and public announcement CRUD with authorization; add migration 0050. Verify guest reads, publish/update/delete permissions and no private notification disclosure.
3. Restore centered login with legacy brand, back-home/language/support controls; keep username login and MFA. Expose public home at /, login at /login and old workspace overview at /dashboard. Integrate actual leaderboard at /leaderboard.
4. Add live bilingual leaderboard UI with search, tabs, podium and errors; verify interactions and stale search results.
5. Back up local codemark_lms, migrate, create exactly 30 test students and 10 test teachers with idempotent marked ledger entries and no changes to real accounts. Save credentials locally and report test-only accounts.
6. Run API/UI tests, mypy/TypeScript, production build; validate guest home, login, authenticated ranking, tab/search, menu and mobile via isolated PostgreSQL test DB. Restart real API/web and verify health and account counts.
