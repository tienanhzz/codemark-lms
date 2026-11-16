# CodeMark — triển khai lại từ master-kit (1)

> **Đã thay đổi lộ trình theo yêu cầu mới của người dùng:** các công việc tiếp theo dùng đúng BUILD-000…034 gốc trong [MASTER-KIT-EXECUTION.md](MASTER-KIT-EXECUTION.md), bắt đầu kiểm chứng từ BUILD-000. Dãy BUILD-01/02/03/04…09 bên dưới được giữ làm lịch sử của cách chia local trước đó, không còn là kế hoạch thực hiện hiện hành và không đồng nghĩa các BUILD gốc đã Done.

Nguồn: `../../master-kit (1)/`. Lịch sử BUILD-000…034 trong nguồn được giữ nguyên; các ID dưới đây thuộc lộ trình triển khai lại được người dùng yêu cầu ngày 14/11/2026.

Mỗi BUILD phải hoàn thành API/persistence, giao diện sử dụng được, trạng thái rỗng/lỗi/loading, responsive và kiểm chứng trước khi Done. Không đánh dấu các module chưa làm thành hoạt động. Không chạy mã sinh viên.

## BUILD-01 — Nền tảng, truy cập và workspace

Status: **Implemented — browser visual QA pending**. Chưa đánh dấu Done; người dùng đã yêu cầu tiếp tục code BUILD-02 trong lúc giữ gate visual QA riêng.

- [x] Python 3.13/FastAPI, PostgreSQL 17, SQLAlchemy 2 và migration Alembic.
- [x] UUID, Argon2id, opaque session 8 giờ chỉ lưu digest, CSRF, database login throttling, audit append-only.
- [x] Bootstrap Admin qua CLI tương tác, không tài khoản/mật khẩu mặc định.
- [x] Next.js 16/React 19/Tailwind 3/Font Awesome local; source đầy đủ cho login, dashboard theo role, profile, security và preferences; routes/assets và API đã kiểm tra HTTP.
- [x] EN/VI, light/dark, tám palette, accessibility; settings lưu PostgreSQL theo tài khoản.
- [x] Test auth/privacy/CSRF, migration thật PostgreSQL, strict typing, production build và HTTP smoke.
- [ ] Browser QA: desktop/mobile, keyboard/focus, đổi giao diện và lưu cài đặt qua UI. Computer Use đã dừng vì không hỗ trợ URL-policy enforcement trên Cốc Cốc/Windows; không dùng đường vòng browser automation khác.

### Bằng chứng local — 14/11/2026

- Python 3.13.16 cài riêng trong `.tools`, virtualenv và dependency lock có hash. Next.js 16.4.6, React 19.3.1 và npm integrity lock.
- 14 pytest tests pass: authentication, CSRF/Origin, rate limiting, account isolation, session expiry/revocation, password change, audit immutability, secret-safe validation, AES-GCM binding, DTO source-contract checks và regression discriminator.
- Ruff check/format và strict mypy pass. Web TypeScript và production build pass.
- PostgreSQL 17.12: `codemark_lms` ở `0001_identity (head)`, `alembic check` không có drift. Test DB riêng kiểm tra downgrade/re-upgrade, repeated upgrade, database audit UPDATE trigger, login/settings/logout và transaction scope.
- HTTP production smoke pass cho 5 routes, assets local, CSP/header, cookie flags, same-origin proxy, preference persistence và logout. Đây không phải browser E2E/visual QA.
- Contract validator pass: 144 paths, 168 operations, 19 schemas, 17 examples; discriminator resolver đã sửa và có regression test. Thêm contract workspace summary cho chức năng mới.
- npm audit runtime: 0 known vulnerabilities. Chưa chạy vulnerability scan Python, hosted CI, production egress/firewall, secret-manager integration, backup/restore hay release security acceptance.
- Có một deprecation warning từ Starlette TestClient/httpx trong test tooling; tests vẫn pass. Chưa coi đây là runtime lỗi đã tái hiện.
- Tài khoản `qa.*` chỉ nằm trong `codemark_lms_test`. Database ứng dụng không được seed Admin; người vận hành phải chạy CLI bootstrap tương tác trước khi đăng nhập.
- Đã dừng các server QA sau khi kiểm tra. Mã Java và dữ liệu H2 cũ được giữ nguyên.

Phạm vi BUILD-01 không bao gồm enrollment, course authoring, chấm bài, economy, MFA và SMTP invitation; dashboard phải thể hiện đúng trạng thái chưa có dữ liệu, không dùng số liệu giả. Đây là increment đầu tiên, không thay thế toàn bộ BUILD-026 cũ.

## Các bước tiếp theo

### BUILD-02 — Identity và giao diện quản trị

Status: **Implemented — SMTP delivery / browser visual QA pending — 2026-11-14**. Người dùng yêu cầu tiếp tục triển khai. BUILD-01 đã có bằng chứng code/API/build; visual QA của BUILD-01/02 vẫn phải ghi riêng, không dùng công cụ khác để vòng qua hạn chế browser.

- [x] Migration identity: institutional ID, account revision, invitations/import jobs, MFA methods/recovery/challenges/policies và session MFA state.
- [x] Admin accounts list/detail, role assignment, suspend/restore, sessions/revoke và audit có lý do; chống tự khóa/mất Admin cuối.
- [x] TOTP enrollment, replay protection, recovery one-use, policy-required pre-login enrollment và Admin reset.
- [x] Invitation digest/expiry/replay, STARTTLS transport fail-closed; acceptance UI dùng fragment token. SMTP được mock trong tests, chưa xác minh gửi mail thật.
- [x] CSV preview/commit bound checksum/token, upsert/skip, stale-preview và transactional writes; không lưu raw CSV. Cập nhật email invited thu hồi token cũ.
- [x] UI Admin, CSV, invitation acceptance và MFA/login/security đã nối API, có EN/VI, responsive CSS, loading/error/empty states. 4 React DOM interaction tests pass; không suy diễn thành visual QA.
- [x] 33 pytest tests, PostgreSQL migrations/drift/integration, strict mypy/Ruff, production build, HTTP smoke 9 routes và source-contract validation pass.
- [ ] Cấu hình và kiểm chứng SMTP relay thật khi người vận hành cung cấp.
- [ ] Browser visual/keyboard/mobile QA khi browser host khả dụng.

Chi tiết và cách dùng: [BUILD-02.md](BUILD-02.md). Database local ở `0003_pending_invitation (head)`; npm runtime audit 0 known vulnerabilities. CI có React tests/PostgreSQL identity checks nhưng chưa quan sát hosted run. Chưa đánh dấu toàn bộ increment Done vì còn hai gate bên ngoài ở trên.

SMTP relay cho email thật chưa được cung cấp. Không gửi mail ra ngoài trong quá trình phát triển; dùng transport test trong tests. Nếu chưa cấu hình SMTP STARTTLS, UI/API phải báo unavailable, không giả báo email đã gửi.

| BUILD | Đầu ra hoàn chỉnh gồm API và UI | Trạng thái |
| --- | --- | --- |
| 02 | Identity: invitations/CSV, MFA, Admin accounts, roles và sessions | Implemented; SMTP/visual QA pending |
| 03 | Course/module, staff permissions, enrollment, lesson plan, Course Rules | Implemented; browser visual QA pending |
| 04 | Category/tag, question bank, 12 formats, immutable versions, assets | Pending |
| 05 | Assignment/practice/exam delivery, rubric, grade revisions và publish | Pending |
| 06 | Attendance, Learning Overview, reports/exports, audit | Pending |
| 07 | EXP không mùa, Coin ledgers, missions, shop, marketplace, clans | Pending |
| 08 | Socket.IO/Redis/outbox, notifications, branding và operations | Pending |
| 09 | Full security/privacy, backup/restore, CI và release acceptance | Pending |

Không đưa dữ liệu H2 vào PostgreSQL tự động. Việc chuyển dữ liệu cần mapping, backup và đối chiếu riêng.

### BUILD-03 — Course workflows và giao diện — 2026-11-14

Status: **Implemented — browser visual QA pending**. Đây là BUILD-03 local, tương ứng chủ yếu BUILD-027 gốc; không phải BUILD-003 CI đã superseded trong lịch sử master-kit.

- [x] Migration `0004_course_workflows`: khoa/học kỳ, khóa học/module, staff, membership, grants, shared rule versions và teaching sessions. Giữ nguyên identity/session hiện có.
- [x] Course search/filter/pagination, create/detail/module editing, revision/ETag, activate/complete/archive/Admin restore và audit; không xóa lịch sử học vụ.
- [x] Owner transfer, staff removal, live global-role checks, allowlisted expiring/revocable grants; không thể tự nâng quyền qua membership.
- [x] Student enroll/invite/activate/withdraw/complete, roster pagination, course-scoped account search; Student chỉ đọc khóa học được cấp quyền, không xem roster.
- [x] Admin catalog UI, names/period/timezone/status editing và retirement giữ tham chiếu cũ; new/reassigned references phải active.
- [x] Lesson-plan form, stable IDs/session retention, scheduled teaching sessions, IANA timezone/offset/HTTPS validation; lọc lịch theo `[from,to)`.
- [x] Shared Course Rules draft/activation, stable-ID orphan protection, course override/disable/custom-rule forms; plain text, expected template version và ETag.
- [x] EN/VI, responsive CSS, dark/theme variables, loading/empty/error states, dashboard dữ liệu thật; sửa các chuỗi VI bị lỗi ký tự trong navigation/audit cũ.
- [x] 43 pytest tests, 10 React DOM/timezone tests, Ruff/strict mypy, TypeScript, production build và source-contract validator (150 paths / 174 operations) pass.
- [x] PostgreSQL migration cycle/repeated upgrade/drift/audit và identity/course integration pass trên database test riêng. HTTP production smoke 12 routes/assets/CSP, ETag writes/stale rejection và Student access pass.
- [x] Private pre-migration backup; database ứng dụng nâng lên head 0004 không reseed account/course. QA servers dừng sau kiểm chứng.
- [ ] Browser visual, keyboard/focus và responsive inspection trực tiếp: browser host chưa khả dụng theo giới hạn đã ghi ở BUILD-01/02; DOM/HTTP không thay thế gate này.

Hướng dẫn: [BUILD-03.md](BUILD-03.md). Chưa đánh dấu Done toàn bộ increment vì browser visual QA chưa xác minh. BUILD-04 Pending. SMTP thật/hosted CI/release security acceptance của các bước trước vẫn chưa được xác minh.
