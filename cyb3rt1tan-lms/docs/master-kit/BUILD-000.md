# BUILD-000 — Phân tích và chốt baseline đặc tả

Execution: `local-master-kit-2026-11-14`. Phạm vi: đúng dòng **Done BUILD-000** trong source `master-kit (1)/BUILDING_PROCESS.md`, không phải triển khai toàn bộ LMS trong một BUILD tài liệu.

## Nguồn và thứ tự ưu tiên

- Yêu cầu người dùng trong phiên làm việc là ưu tiên cao nhất; lần này dùng BUILD gốc từ 000.
- `PRODUCT_REQUIREMENTS.md` ghi rõ ưu tiên trước scaffold/example cũ. ADR hiện hành xác định stack và các thay đổi quyết định; ADR-0010 thay thế ADR-0008 về thực thi code.
- `ARCHITECTURE.md`, `SECURITY_STANDARDS.md`, `CODING_CONVENTIONS.md`, data-model/API prose và OpenAPI/JSON schemas phải được đối chiếu đồng thời. Một route/schema không chứng minh đã có database/API/UI chạy thật.
- `BUILDING_PROCESS.md` là nguồn ID/phạm vi. Dated historical logs dùng cho truy vết, không dùng thay local evidence. `README.md`, `TASKS.md`, các đoạn status cũ còn có thông tin lỗi thời (ví dụ BUILD-013 tiếp theo); execution mới không lấy các câu đó để suy ra trạng thái.
- `ROADMAP.md` chứa cả scaffold/agent/CLI/pack objectives; bảng BUILD hiện hành chủ yếu theo LMS. Các đầu việc chưa có BUILD riêng được giữ pending, không tự thêm vào một ID cũ.

## Ma trận yêu cầu → BUILD và giao diện

| Nhóm đặc tả | Nguồn chính | BUILD triển khai/nghiệm thu | Giao diện phải hoàn thành |
| --- | --- | --- | --- |
| Sáu vai trò cố định, multi-role, quyền course default-deny | Product §1; access-policy; API authorization | 025/026/027 | Login/MFA, navigation theo quyền, account/staff/permission workflows |
| CSV authoritative, invitations, stable-ID matching, search, suspend/restore | Product §1, §7; API account provisioning | 026/027/030 | Account/detail/import preview/commit, enrollment imports, export có audit |
| Password/reset/MFA, nickname/avatar/contact/privacy/cooldown | Product §1/§4; security standards | 026/032 | Self-service security/profile; Admin chỉ thao tác được phép, không đặt/xem mật khẩu |
| Dashboard Student/Teacher/TA/Admin và trang phụ | Product §2/§4/§7/§8; BUILD-012/024 | 012/024 và BUILD nghiệp vụ tương ứng | Shell, card/table/filter/detail, mobile drawer, empty/error/loading; dashboard không bịa số liệu |
| Course/module/faculty/term, owner/co-teacher/TA permissions | Product §2; data model §2; API courses | 027 | Course list/detail/tabs, full Module Overview, Teaching Team, management/settings |
| Lesson plan, lịch calendar/list, recurrence/exceptions, resources/URLs/software | Product §2; data model §4 | 027/028/029 | Editor theo tuần, calendar/list, reschedule/cancel/rooms và liên kết assessment |
| Shared Course Rules, per-course override, lịch sử phiên bản effective | Product §2; API Course Rules | 027 | Admin template/version/activate; course override/disable/custom rules; Student đọc/historical versions |
| Assessment scheme, grade scale, weights 100% | Product §2/§5; API grade schemes | 027/029 | Editor/snapshot/publish và giải thích cách tính điểm |
| Category/tag, search any/all, immutable question versions | Product §3; taxonomy/question schemas | 028 | Taxonomy admin, question bank/filter, author forms/version/validation/publication |
| 12 schema discriminators; answer keys/private scoring | Product §3; content/authoring schemas | 028/029 | Form/renderer phù hợp từng loại; dữ liệu private chỉ cho author/grader đúng quyền |
| Code prompt/source collection, local trusted-source utility | Product §3; ADR-0010 | 028/029, tooling riêng | Không có nút chạy/chấm mã sinh viên hoặc kích hoạt runtime profile |
| Attempts, snapshots, autosave/revision, timing, submit, practice | Product §4/§5; assessment API/model | 029 | Student delivery/review/practice và Teacher assessment authoring |
| Rubric/scaled points/override/regrade/release/history | Product §3/§5; grading schemas | 029 | Grading queue/workspace, publish gate, Student chỉ xem điểm đã Published |
| Exam signals/incidents/actions/appeals và privacy | Product §5; API exam monitoring | 029/030 | Exam monitor, audited action/reason, incident detail/appeal; không thu GPS |
| Attendance/check-in/token/excusal/close/history | Product §2; API attendance | 030 | Staff sessions/records/requests, Student check-in/self history; không xem của người khác |
| Individual Student Learning Overview, reports/CSV/XLSX/audit | Product §2/§7; API reporting | 030 | Filters/drilldown/export/download reauthorization, phân quyền từng course/field |
| Hai EXP tracks không mùa, Coin ledger, missions/achievements | Product §6; rank schemas/model | 031 | Rank policy, ledger/history, mission/achievement; không sửa balance trực tiếp |
| Shop/inventory/effects, marketplace/escrow/disputes/events, clan | Product §6; API economy | 031 | Catalog/purchase/inventory/offer/settlement/dispute/clan; writes atomic và idempotent |
| Logo 1:1 crop/validated upload, locale/theme/8 palettes/accessibility | Product §2/§4/§8; preferences/branding contracts | 012/024/032 | Settings account-synced, branding uploader/cropper, keyboard/reduced motion |
| Notification read/ack, reconnect/recovery, authorized realtime | Product §7; API notifications; ADR-0002/0005 | 034/032 | Notification center/preferences/ack, live refresh với session/quyền đúng |
| Audit/outbox/retention/legal hold, secrets, TLS/egress, backup/release | Security; ADR-0006/0007; model §11–13 | 002/025/030/033 | Admin audit/retention/operations khi có API; báo cáo xác minh riêng |

## Quyết định baseline và chỗ phải đối chiếu khi triển khai

1. **Stack:** Python 3.13/FastAPI/SQLAlchemy 2/Alembic/PostgreSQL 17; Next.js 16/React 19/Tailwind 3/Font Awesome 6. Redis phục vụ fan-out/jobs, không sở hữu dữ liệu nghiệp vụ. Private S3-compatible/MinIO target theo ADR-0007; chưa coi object storage đã được triển khai.
2. **Question count:** Product liệt kê 11 nhóm trình bày nhưng tách Short Answer và Fill in the Blank thành hai schema types, tổng cộng 12 discriminator values. Kiểm chứng content/private-authoring sets bằng validator, không tự thêm Speaking.
3. **Permissions:** prose có alias khác example (`course.content.author`/`content.author`, v.v.). Backend hiện có normalize một số alias; BUILD-026/027 phải chốt allowlist/defaults nhất quán, phân quyền Administrative Assistant/Research Assistant và không cấp dữ liệu PII chỉ vì role UI.
4. **Course owner:** Product yêu cầu một Teacher owner; local hiện cho Admin tạo rồi chuyển owner. BUILD-027 phải hoàn thiện chọn Teacher owner/lifecycle và coverage quyền, không lấy create hiện có làm bằng chứng đáp ứng toàn bộ Product.
5. **Course scope:** Local hiện có Module subset, lesson-plan draft, create/list sessions và effective rules hiện tại. Product còn Year/Nature/software/resources, calendar/recurrence/exceptions, grade schemes và effective-rule historical versions. Những phần này vẫn Pending ở 027/028/029.
6. **Identity scope:** Tại baseline BUILD-000, local có auth/MFA/invitation và CSV 5 cột; các gap reset/profile/import/export chưa hoàn chỉnh. Cập nhật 2026-11-15 tại [BUILD-026](BUILD-026.md): self-service, CSV tài khoản v2/ghi danh và audited CSV/XLSX export đã nối UI, 82 API/35 web tests pass; profile support của trợ lý/protected avatar/course staff privacy projection còn lại. Không đánh dấu toàn bộ 026 Done dựa trên acceptance của một increment.
7. **Code execution:** ADR-0010 có hiệu lực; câu yêu cầu deploy runner trong data-model §13 và các đoạn gVisor cũ là historical/superseded. Không chạy mã sinh viên, không kích hoạt runtime profiles. Local trusted-source utility trong lịch sử không được coi là đã có ở checkout hiện tại.
8. **Security:** UUID/random public IDs, Argon2id, cookie/CSRF, audit append-only và AES-GCM helper là primitives. Khóa local, loopback HTTP, SMTP mock và database owner chung không đáp ứng production secret lifecycle/TLS/least privilege. Runtime egress deny-by-default, backup encryption, managed keys và release ASVS review vẫn là gate BUILD-033.
9. **UI scope:** Source 012/024 hoàn thành preview trong lịch sử, không hoàn thành tất cả backend. Lần local này mọi screen phải phân biệt live/preview/unavailable, và các BUILD nghiệp vụ phải hoàn thành UI sử dụng được. Browser QA chưa có công cụ hỗ trợ, giữ gate đó pending thay vì giả công bố pass.
10. **Thứ tự:** Giữ ID gốc, bỏ qua ID superseded/không còn trong bảng. Kiểm chứng 034 trước 032/033 theo dependency và rationale có ngày trong execution plan; không tạo lại dãy 01–09.

## Acceptance BUILD-000

- Inventory đủ product, architecture, security, ADR, logical model, OpenAPI, JSON schemas/examples, taxonomy/rank/preferences và branding/report/Course Rules requirements.
- Validator OpenAPI 3.1, local refs, schemas/examples và cross-contract invariants pass; ghi con số thực tế, không dùng 105 paths lịch sử.
- Ghi hash SHA-256 của đúng file đặc tả/contract để phát hiện baseline đã đổi; không đọc `.env`, database, uploads hay dữ liệu người dùng.
- Tất cả nhóm product có BUILD đích và UI acceptance; phần local thiếu/historical conflicts được ghi rõ.
- Không thêm màn hình LMS chỉ để hiển thị BUILD-000: đây là đặc tả, không có workflow người dùng cuối. Giao diện thực tế được nghiệm thu tại 012/024 và các BUILD nghiệp vụ.

Evidence được sinh bằng `scripts/verify-master-kit.py`, lưu tại `docs/master-kit/source-baseline.json` và `docs/master-kit/BUILD-000-validation.json`. Chỉ chuyển Done sau khi lệnh thành công.
