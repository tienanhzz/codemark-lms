# Per-course Player Rank

Approved scope: separate EXP and diligence streak per class, no EXP ceiling. Current demo scores approximately 0–150. One scheduled practice per day or week per class (weekly default). Each passed activity (at least 50%) earns 2/3/4/5 EXP for easy/medium/hard/expert, once only. From the second consecutive active week, award 2 diligence EXP once per week per class. Calendar boundaries use Asia/Ho_Chi_Minh, Monday starts the week. Exams do not consume the practice slot.

All shows named/coded course sections and five leaders per course. Selecting a class shows every student, with order: number, name/code, EXP, rank image. Preserve compact rank-colored rows (Bronze white) and independent scroll regions.

- [ ] Scoped immutable ledger, fixed rewards, weekly activity and rank announcements; compatible migration and explicit idempotent demo rebalance.
- [ ] Difficulty and course cadence configuration, combined internal/external practice scheduling, publication constraints and future-access checks.
- [ ] Grouped All UI, course selection, full codes and complete class roster, class-specific manual adjustments.
- [ ] Integrate contracts; run complete backend tests, TypeScript and browser interaction checks.
- [ ] Back up local database, apply migration/sample updates, verify persisted results; leave no hidden testing servers to block npm run dev.

Implementation allocation: course_exp owns rank backend/quiz/grading and demo seed; practice_schedule owns course/assessment/scheduling and related forms; rank_frontend owns leaderboard and rank management UI. Root integrates, verifies and operates local migration. No commits or destructive reset of existing coursework.
