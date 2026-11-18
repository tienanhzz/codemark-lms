# Workbook quests, moderation and inline workspaces

User specification: reduce complex popups, narrow sliding panels, remove explicit login help paragraph; import exact workbook missions into role-filtered tables with action links and verified completion; teacher/admin manage student missions, admin alone teacher missions; community posts/questions/answers with student content moderated by teachers/admin and teacher content by admin.

Workbook read from Downloads/Danh_Sach_Nhiem_Vu_LMS.xlsx, normalized sheet4:13STUDENT +11LECTURER quests, category/title/condition/reset_type/limit_rule; no EXP/Coin amounts. Preserve all24 codes and anti-spam constraints. User asked for reward preference asynchronously; pending configuration defaults to zero rather than invented amounts.

- [x] Implement new trusted quest events, role policy management, idempotent cycles and evidence review for criteria requiring human validation; migration0052.
- [x] Import canonical24definitions locally without overwriting admin customization; no fabricated completions.
- [x] Community moderation, topic/reply visibility, course scope, best answer, trusted quest integration; migration0053.
- [x] Inline large workflows, preserve small confirmation/security dialogs; narrow rank rail/remove login paragraph.
- [x] Integrate menu/routes, run relevant tests/types/build, backup/migrate/seed PostgreSQL and browser verification.

Final verification: 89 UI tests across 10 files passed; added student question deep-link regression reproduced the defect, then all 5 community tests passed after the fix. API workbook/community/legacy missions/assessment suite: 27 passed. Whole application mypy: 75 files clean. Ruff for new modules/migrations: clean. Production build: 62 pages and TypeScript passed. PostgreSQL backed up, upgraded through0053, all24 definitions installed with zero rewards pending configuration. API/web restarted using the verified runtime helper.

Headless Edge against the actual local PostgreSQL runtime confirmed student13/teacher11 role lists, teacher management restricted to student13, daily check-in completion using a test account, removed login paragraph, direct inline question composer, mobile layout without page overflow, and no JavaScript exceptions. No live community posts were submitted. Unsupported authoritative workflows explicitly require independently reviewed evidence, as described in api/docs/workbook-quests.md.
