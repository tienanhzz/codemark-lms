# Triá»ƒn khai theo BUILD gá»‘c cá»§a master-kit (1)

Execution: **local-master-kit-2026-11-14**. NgÆ°á»i dÃ¹ng yÃªu cáº§u báº¯t Ä‘áº§u láº¡i viá»‡c Ä‘á»‘i chiáº¿u/nghiá»‡m thu tá»« **BUILD-000**, giá»¯ Ä‘Ãºng cÃ¡c ID gá»‘c. File nÃ y thay tháº¿ lá»™ trÃ¬nh tá»± chia BUILD-01 â†’ BUILD-09 cho cÃ¡c cÃ´ng viá»‡c tiáº¿p theo. Source: `../../master-kit (1)/BUILDING_PROCESS.md`.

MÃ£ vÃ  dá»¯ liá»‡u local hiá»‡n cÃ³ Ä‘Æ°á»£c giá»¯ láº¡i Ä‘á»ƒ kiá»ƒm chá»©ng vÃ  hoÃ n thiá»‡n. KhÃ´ng táº¡o láº¡i database, khÃ´ng seed tÃ i khoáº£n, khÃ´ng coi nhÃ£n Done trong lá»‹ch sá»­ mÃ´i trÆ°á»ng khÃ¡c lÃ  báº±ng chá»©ng hoÃ n thÃ nh local.

## CÃ¡ch thá»±c hiá»‡n vÃ  nghiá»‡m thu

1. Má»™t BUILD Active táº¡i má»™t thá»i Ä‘iá»ƒm, ghi evidence rá»“i má»›i Done vÃ  chuyá»ƒn bÆ°á»›c.
2. BUILD-000 lÃ  Ä‘áº·c táº£/contract; BUILD-001 lÃ  README. Hai bÆ°á»›c nÃ y khÃ´ng cÃ³ mÃ n hÃ¬nh sáº£n pháº©m riÃªng. BUILD-002 cung cáº¥p ná»n táº£ng giao diá»‡n vÃ  ká»¹ thuáº­t; tá»« BUILD-012/024 cÃ³ workspace theo vai trÃ².
3. Vá»›i BUILD nghiá»‡p vá»¥, hoÃ n thiá»‡n cáº£ persistence/API vÃ  giao diá»‡n ná»‘i API: loading/empty/error/success, validation, quyá»n, EN/VI, sÃ¡ng/tá»‘i, responsive vÃ  keyboard. KhÃ´ng giao má»™t API rá»“i coi giao diá»‡n lÃ  pháº§n viá»‡c ngoÃ i BUILD.
4. BUILD-012/024 trong nguá»“n lÃ  preview. Má»i preview pháº£i ghi rÃµ; khÃ´ng dÃ¹ng dá»¯ liá»‡u máº«u, role switch hoáº·c nÃºt khÃ´ng hoáº¡t Ä‘á»™ng Ä‘á»ƒ tuyÃªn bá»‘ nghiá»‡p vá»¥ Ä‘Ã£ hoÃ n thÃ nh. Khi backend Ä‘Æ°á»£c triá»ƒn khai á»Ÿ BUILD-025 trá»Ÿ Ä‘i, cÃ¡c mÃ n hÃ¬nh tÆ°Æ¡ng á»©ng pháº£i Ä‘Æ°á»£c ná»‘i dá»¯ liá»‡u tháº­t ngay trong BUILD Ä‘Ã³.
5. Browser visual/keyboard/mobile inspection vÃ  cÃ¡c kiá»ƒm tra váº­n hÃ nh chÆ°a thá»±c hiá»‡n pháº£i ghi pending. DOM tests/HTTP khÃ´ng thay tháº¿ browser QA. KhÃ´ng vÃ²ng qua giá»›i háº¡n browser báº±ng cÃ´ng cá»¥ khÃ¡c.
6. KhÃ´ng Ä‘á»•i cÃ¡c ID gá»‘c. BUILD-003â€“011 Ä‘Ã£ Superseded; BUILD-013â€“023 khÃ´ng cÃ³ má»¥c trong káº¿ hoáº¡ch hiá»‡n hÃ nh, khÃ´ng tá»± gÃ¡n ná»™i dung cho chÃºng.
7. BUILD-034 lÃ  ngoáº¡i lá»‡ thá»© tá»± Ä‘Ã£ cÃ³ trong nguá»“n (thá»±c hiá»‡n sá»›m ngÃ y 10/11). Láº§n local nÃ y kiá»ƒm chá»©ng nÃ³ sau BUILD-031 vÃ  trÆ°á»›c BUILD-032/033 Ä‘á»ƒ notification/release khÃ´ng phá»¥ thuá»™c vÃ o má»™t ná»n táº£ng realtime chÆ°a nghiá»‡m thu. ÄÃ¢y lÃ  thá»© tá»± theo dependency, khÃ´ng Ä‘á»•i sá»‘ BUILD.
8. `PRODUCT_REQUIREMENTS.md` Æ°u tiÃªn trÆ°á»›c scaffold/example cÅ©; quyáº¿t Ä‘á»‹nh hiá»‡n hÃ nh ADR-0010 thay tháº¿ Ä‘á» xuáº¥t runner ADR-0008. Student-code execution váº«n táº¯t. CÃ¡c cÃ´ng cá»¥/adapter trong bá»™ scaffold khÃ´ng tá»± trá»Ÿ thÃ nh mÃ n hÃ¬nh LMS hoáº·c Ä‘Æ°á»£c phÃ©p cháº¡y mÃ£ sinh viÃªn.

## Káº¿ hoáº¡ch hiá»‡n hÃ nh

Tráº¡ng thÃ¡i Ä‘Æ°á»£c cáº­p nháº­t trong cÃ¹ng execution nÃ y; `Implemented` chá»‰ ghi nháº­n source hiá»‡n cÃ³, khÃ´ng thay cho `Done`.

| Thá»© tá»± | BUILD | Äáº§u ra theo nguá»“n, gá»“m UI khi Ã¡p dá»¥ng | Tráº¡ng thÃ¡i local |
| --- | --- | --- | --- |
| 1 | BUILD-000 | Äáº·c táº£ sáº£n pháº©m/kiáº¿n trÃºc/dá»¯ liá»‡u/API/báº£o máº­t/taxonomy/rank/report/Course Rules/branding; ma tráº­n truy váº¿t vÃ  contract validation | Done â€” 2026-11-14 |
| 2 | BUILD-001 | README cÃ i Ä‘áº·t, sá»­ dá»¥ng theo vai trÃ², giá»›i háº¡n vÃ  Ä‘Æ°á»ng dáº«n chÃ­nh xÃ¡c | Done â€” 2026-11-14 |
| 3 | BUILD-002 | Next/FastAPI foundation, tÃ i nguyÃªn local, headers/crypto, dependency locks/audits/SBOM/licenses vÃ  checks | Done â€” foundation scope, 2026-11-14 |
| 4 | BUILD-012 | Shell/workspace Ä‘iá»u hÆ°á»›ng, dashboard vÃ  settings cÃ³ nhÃ£n tráº¡ng thÃ¡i chÃ­nh xÃ¡c | Done â€” preview scope; browser visual QA pending |
| 5 | BUILD-024 | ToÃ n bá»™ workspace Student, Teacher/TA, Admin vÃ  trang phá»¥; kiá»ƒm tra coverage UI | Done â€” preview scope; browser visual QA pending |
| 6 | BUILD-025 | PostgreSQL, migration, pooled transactions, immutable audit, outbox; khÃ´ng Ä‘Ã¡nh Ä‘á»“ng schema vá»›i Redis runtime | Done â€” foundation scope; production acceptance pending |
| 7 | BUILD-026 | Identity/auth/session/MFA, profile, reset máº­t kháº©u, account provisioning/import/export vÃ  toÃ n bá»™ UI liÃªn quan | Done â€” local functional scope, 2026-11-15; operational/browser gates tracked separately |
| 8 | BUILD-027 | Course lifecycle/module/staff/enrollment, catalogs, lesson plan/schedule, Course Rules vÃ  UI Ä‘áº§y Ä‘á»§ | Done â€” local functional scope, 2026-11-15 |
| 9 | BUILD-028 | Taxonomy, ngÃ¢n hÃ ng cÃ¢u há»i, authoring/immutable versions/assets vÃ  runtime-profile metadata; Code execution táº¯t | Code/migration through 0017 present; catalog verification/import, live Redis and browser QA pending |
| 10 | BUILD-029 | Assignment/practice/assessment delivery, grading/release, late penalties and connected UI | Implemented — API 118 passed, web 53 passed; taxonomy import and browser QA remain operational gates |
| 11 | BUILD-030 | Attendance, Learning Overview, reports/exports and audit UI | Done — local functional scope, 2026-11-16 |
| 12 | BUILD-031 | EXP/Coin, ranks, missions, achievements, shop, marketplace, staff events, clans and connected UI | Implemented through migration 0047; authenticated browser/privacy review remains |
| 13 | BUILD-034 | Socket.IO/Redis/outbox delivery foundation | Implemented; local authenticated two-instance Redis fan-out, session revocation and retry/recovery acceptance passed |
| 14 | BUILD-032 | Preferences, branding/logo, notification/ack/recovery and realtime UI | Active — workflows through 0049; Redis multi-instance/revocation/retry and local SMTP acceptance passed; authenticated browser visual/privacy/keyboard/mobile QA remains |
| 15 | BUILD-033 | Hosted CI, security/privacy, egress, key lifecycle, backup/restore, deployment/release acceptance | Pending |

CÃ¡c Ä‘áº§u ra scaffold/agent integrations/CLI/packs trong ROADMAP.md Ä‘Æ°á»£c giá»¯ lÃ  pháº¡m vi ná»n táº£ng riÃªng; chÆ°a cÃ³ BUILD chi tiáº¿t tÆ°Æ¡ng á»©ng trong execution LMS. KhÃ´ng tá»± gÃ¡n chÃºng vÃ o cÃ¡c ID Ä‘Ã£ Superseded hoáº·c coi lÃ  Ä‘Ã£ triá»ƒn khai.

## MÃ£ local Ä‘Ã£ cÃ³ trÆ°á»›c láº§n Ä‘á»‘i chiáº¿u nÃ y

Lá»‹ch sá»­ á»Ÿ [BUILDING_PROCESS.md](BUILDING_PROCESS.md), [BUILD-02.md](BUILD-02.md) vÃ  [BUILD-03.md](BUILD-03.md) Ä‘Æ°á»£c giá»¯ nguyÃªn lÃ m evidence tá»«ng pháº§n. ChÃºng dÃ¹ng sá»‘ local ngáº¯n **01/02/03**, khÃ´ng tÆ°Æ¡ng Ä‘Æ°Æ¡ng BUILD-001/002/003 gá»‘c.

- Local 01: ná»n táº£ng, login/workspace/preferences â€” liÃªn quan má»™t pháº§n 002/012/025/026/032.
- Local 02: account/MFA/CSV/invitation â€” liÃªn quan má»™t pháº§n 026, chÆ°a Ä‘á»§ táº¥t cáº£ yÃªu cáº§u identity/profile/export/reset.
- Local 03: course/catalog/staff/enrollment/planning/rules â€” liÃªn quan má»™t pháº§n 027; chÆ°a Ä‘á»§ recurrence/resources/grade schemes vÃ  lá»‹ch sá»­ effective rules.
- Kiá»ƒm chá»©ng trÆ°á»›c Ä‘Ã³: 43 API tests, 10 web DOM/timezone tests, migration head `0004_course_workflows`, production build vÃ  HTTP smoke 12 routes. ÄÃ¢y lÃ  evidence cÃ³ ngÃ y, khÃ´ng chá»©ng minh cÃ¡c BUILD gá»‘c Ä‘Ã£ Done.

## Evidence tá»«ng BUILD

- BUILD-000: [phÃ¢n tÃ­ch nguá»“n vÃ  truy váº¿t](master-kit/BUILD-000.md); inventory/fingerprints/validation report Ä‘Æ°á»£c táº¡o báº±ng `scripts/verify-master-kit.py`.
- BUILD-001: [README acceptance](master-kit/BUILD-001.md); route/local-link checks táº¡i `master-kit/BUILD-001-validation.json`.
- BUILD-002: [foundation acceptance](master-kit/BUILD-002.md); 43 API tests, 10 web tests, strict types, build vÃ  read-only HTTP 12 routes pass. SBOM schema vÃ  Python/Node advisory scans pass sau báº£n vÃ¡ PostCSS. Browser visual/production release gates chÆ°a xÃ¡c minh; Done á»Ÿ Ä‘Ã¢y chá»‰ Ã¡p dá»¥ng pháº¡m vi foundation, khÃ´ng nghiá»‡m thu toÃ n bá»™ UI/domain.
- BUILD-012: [Student shell/preview acceptance](master-kit/BUILD-012.md); Student dashboard/navigation, preview state isolation, drawer focus/Escape; 15 web tests vÃ  HTTP 18 routes pass á»Ÿ increment Ä‘Ã³.
- BUILD-024: [role workspace/page coverage](master-kit/BUILD-024.md); 39 preview routes cá»™ng cÃ¡c trang live, Student/staff/Admin detail workflows, 12-format author preview, role guards/memory-only forms; 20 web tests/production build/HTTP 51 routes pass á»Ÿ increment Ä‘Ã³.
- BUILD-025: [persistence/security acceptance](master-kit/BUILD-025.md); additive outbox migration, atomic audit/event writes, concurrency, mode/TLS/pool/migrator guards vÃ  live Admin diagnostics. 55 API tests/22 web tests, PostgreSQL integration, strict types, build, HTTP pass. Main DB head 0005 vá»›i private backup/count parity; khÃ´ng seed láº¡i dá»¯ liá»‡u.
- BUILD-026 Done (local functional scope): [identity/provisioning/profile-media increments](master-kit/BUILD-026.md); self-service, CSV tÃ i khoáº£n v2/ghi danh, quyá»n import cá»§a Administrative Assistant, bá»™ lá»c faculty/source, CSV/XLSX audit, profile support cÃ³ reason/revision/allowlist, protected avatar vÃ  course-staff privacy projection Ä‘Ã£ ná»‘i UI. 94 API tests/42 web tests, PostgreSQL integration, strict types, contract validation, production build vÃ  guarded HTTP smoke pass. Main DB `codemark_lms` á»Ÿ head 0008 sau private backup/count parity; khÃ´ng seed/reset hoáº·c Ä‘á»•i password Admin. Browser visual/keyboard/mobile, hosted CI vÃ  SMTP tháº­t chÆ°a nghiá»‡m thu.
- BUILD-027 Done (local functional scope): recurrence theo timezone vá»›i exception cÃ³ audit, Calendar/List, há»c liá»‡u/useful URLs/software, thang Ä‘iá»ƒm phiÃªn báº£n hÃ³a vÃ  cÃ´ng bá»‘, snapshot Course Rules báº¥t biáº¿n, lá»‹ch sá»­ cÃ³ phÃ¢n trang vÃ  mÃ n hÃ¬nh EN/VI Ä‘Ã£ ná»‘i API. PostgreSQL migration 0009â€“0010, migration cycle/schema drift vÃ  course workflow pass; 98 API tests, 46 web tests, Ruff, TypeScript, production build, contract validation vÃ  HTTP coverage 54 workspace/15 foundation routes pass. Main DB `codemark_lms` lÃªn 0010 sau private backup vÃ  parity users/sessions/audit/courses. Trigger thang Ä‘iá»ƒm Ä‘Æ°á»£c kiá»ƒm thá»­ cháº·n sá»­a ná»™i dung. Browser visual/keyboard/mobile QA váº«n pending.
- BUILD-028 code/migration is present through 0017, including taxonomy trees/guarded import; immutable questions/assets and Listening sets; runtime drafts; and dormant Redis Streams/outbox plumbing with an Admin metrics screen. The main database taxonomy remains empty and needs an authenticated Admin import. Redis used an in-memory test double; live Redis verification and browser visual/keyboard/mobile QA remain pending. Student-code execution/profile activation stay disabled.
- BUILD-029 now has versioned assignment/exam authoring, immutable question snapshots, recipient snapshots, Student start/resume/autosave/submit and responsive bilingual Teacher/Admin/Student screens. API 114 tests, web 51 tests, TypeScript, production build, Ruff/mypy, PostgreSQL migration cycle and course integration pass. Main `codemark_lms` is at 0017 with private backup and row-count parity. Practice scoring, manual grading/grade release, late penalties, and browser visual/keyboard/mobile QA remain.

**BUILD-028 cÃ²n acceptance pending xÃ¡c nháº­n catalog qua Admin vÃ  browser QA. BUILD-029 Ä‘Ã£ cÃ³ authoring, attempt delivery vÃ  mÃ n hÃ¬nh learner; practice scoring, grading/release, late policy vÃ  browser QA cÃ²n tiáº¿p tá»¥c.** CÃ¡c má»¥c váº­n hÃ nh cÃ²n pending Ä‘Æ°á»£c ghi riÃªng trong tá»«ng bÃ¡o cÃ¡o; BUILD preview khÃ´ng Ä‘á»“ng nghÄ©a nghiá»‡p vá»¥ domain Ä‘Ã£ live.


## Progress update — 2026-11-15

BUILD-029 now includes assignment/exam authoring and delivery, objective practice, manual grading/release, and late policies. Verification: 118 API tests, 53 web tests, Ruff, strict mypy, TypeScript and production build passed. Main PostgreSQL is at 0020_attendance with guarded backup/parity verification. BUILD-030 attendance is implemented through migration 0020 with rotating hashed tokens, one-time check-in, absent marking, excusal decisions and append-only history; its API test is included in the suite. Student Learning Overview, report jobs/exports and audit views remain. Browser access was unavailable, so visual/keyboard/mobile review remains pending. codemark_lms_test was preserved after the integration script detected existing taxonomy data.







- **BUILD-031 concurrency acceptance:** Two concurrent identical Clan competition finalization requests against `codemark_lms_test` both returned 200 and produced exactly one Clan EXP, participant EXP/Coin, item grant and stock decrement. Authenticated browser visual/privacy review remains outstanding.


- **2026-11-16 — BUILD-032 notifications slice:** Added migration `0049_notifications` for localized versioned templates, user preferences, notification/recipient state, request idempotency and bounded email retry metadata. Admin system notices and course notices resolve audiences server-side (active roster, section and role; course send requires `events.manage`). Critical/emergency notices force in-app acknowledgement and suppress email; nonessential email preferences are honored. Connected `/notifications` inbox, read/acknowledgement, preferences, template editor, sender and delivery summary. Added explicit STARTTLS worker (not run; no mail sent). API suite 156 passed, web 62 passed, TypeScript and production build passed; Ruff/strict mypy passed across 60 files. App and test PostgreSQL are at 0049 with guarded backups, row parity and no drift. OpenAPI validation passed (199 paths/230 operations); readiness and both pages return 200, protected APIs return 401. BUILD-032 remains Active: notification persistence is not connected to the existing Socket.IO/Redis publisher; authenticated visual/privacy/keyboard/mobile QA and controlled SMTP relay acceptance remain.


- **2026-11-16 — BUILD-032 realtime connection:** Added authenticated Socket.IO ASGI mounting, exact-origin/session/MFA handshake validation, 30-second revoked-session revalidation, and an audit-outbox dispatcher that emits only generic state invalidation hints after validating payload digest. Publish failure retries the outbox; runner payloads are excluded. Connected notification UI listener and authorized REST refetch, with periodic fallback and Admin transport diagnostics. Added/pinned `python-socketio==5.18.1` and `socket.io-client==4.8.4`. API 158 passed, web 64 passed, Ruff/mypy, TypeScript/build and contract validation passed. Runtime smoke: readiness and `/notifications`/`/branding` return 200; protected endpoints return 401. Local Redis is not listening on 127.0.0.1:6379, so cross-instance live delivery, mail relay acceptance and authenticated visual/privacy/keyboard/mobile QA remain open; BUILD-032 stays Active.

- **2026-11-16 — BUILD-032 email hardening and verification refresh:** Requests are now failed immediately with `smtp_not_configured` unless an approved SMTP relay is explicitly configured; this prevents unserviceable messages remaining queued. Added a local-only SMTP STARTTLS acceptance using a temporary test certificate, plus retry/batch behavior tests; no external mail was sent. Full API suite: **162 passed**; Ruff and strict mypy passed across 62 source files. Restarted local runtime on ports 8100/3100: readiness and web `/`, `/notifications`, `/branding` returned HTTP 200. BUILD-032 remains Active because live Redis cross-instance acceptance, authenticated browser visual/privacy/keyboard/mobile review, and controlled external relay acceptance remain. See `docs/master-kit/BUILD-032.md`.

- **2026-11-16 — BUILD-032 Redis and SMTP acceptance:** Redis-compatible server 8.2.10 is live on localhost. Added reusable local acceptance helpers `scripts/verify-realtime-multi-instance.py` and `scripts/verify-realtime-retry-recovery.py`, driven by the already-locked web Socket.IO client. Verified two authenticated clients on API ports 8100/8101 receive the same allowlisted invalidation payload, each refetches `/v1/me/notifications` with 200, and outbox dispatches once. Revoking one session disconnected only its client during the 30-second revalidation; the other remained connected. A controlled publish error scheduled a retry; the restored Redis publisher delivered to both instances and marked the event dispatched on attempt two. Test identities, sessions and outbox rows are removed; minimal append-only audit evidence is retained by design. The controlled local certificate-verified SMTP STARTTLS acceptance (delivery plus bounded retries) also passes; no external email was sent. API 162 tests, Ruff and strict mypy pass; BUILD-032 remains Active only for authenticated browser visual/privacy/keyboard/mobile acceptance. See `docs/master-kit/BUILD-032.md`.
