# BUILD-03 — Khóa học và quy trình học vụ

Triển khai local ngày 14/11/2026, dựa trên BUILD-027 gốc trong `master-kit (1)`. Bổ sung API PostgreSQL và giao diện thật vào `cyb3rt1tan-lms`; giữ mã Java/H2 cũ.

## Sử dụng

1. Admin mở **Danh mục học vụ** (`/academic-catalogs`), tạo khoa và học kỳ. Nhập ngày giờ theo múi giờ IANA đã chọn, ví dụ `Asia/Bangkok`.
2. Admin hoặc Teacher mở **Khóa học** (`/courses`), tạo bản nháp với mã duy nhất, học kỳ đang hoạt động, khoa tùy chọn và thông tin học phần: mã/tên, trình độ, tín chỉ, giờ học, điều kiện tiên quyết và mục tiêu.
3. Trong **Thành viên & quyền**, chủ khóa học/Admin thêm Teacher/TA, chuyển chủ cho Teacher đang hoạt động, ghi danh Student hoặc cấp quyền bổ sung có thời hạn. Tra cứu tài khoản theo tên/username; không phải tự sao chép UUID. Không dùng dữ liệu tài khoản mẫu.
4. Trong **Kế hoạch & lịch dạy**, thêm/sắp xếp mục kế hoạch và lên lịch buổi học, phòng/nhóm lớp, URL HTTPS và mục kế hoạch liên quan. Mục đã được lịch học tham chiếu không thể bị xóa.
5. Admin mở **Nội quy chung** (`/course-rules`), tạo phiên bản rồi xem và xác nhận kích hoạt. Staff được phép có thể tùy chỉnh, bỏ áp dụng một nội quy chung hoặc thêm nội quy riêng trong tab **Nội quy** của khóa học.
6. Kích hoạt khóa học để Student đã ghi danh có thể đọc. Student không xem roster hoặc giao diện quản lý staff. Lời mời membership chưa active không cấp quyền đọc.

Dashboard lấy số lượng và tối đa năm khóa học từ dữ liệu được phép truy cập. Liên kết `/courses?course=<id>` mở trực tiếp khóa học sau đăng nhập; backend luôn kiểm tra quyền.

## Vòng đời và phân quyền

- `draft → active → completed`; archive giữ trạng thái trước đó, chỉ Admin restore. Completed/archived chỉ cho đọc. Archive bản nháp không công bố bản nháp cho Student.
- Không xóa cứng course, membership, staff history, grants hoặc lịch dạy. Rút ghi danh thu hồi quyền Student ngay; lịch sử vẫn còn.
- Admin và owner Teacher có quyền quản lý course. Teacher staff có các quyền học vụ mặc định theo access-policy; TA mặc định đọc course/roster/content/attendance, không tự có quyền viết.
- Các quyền bổ sung chỉ lấy từ allowlist; kiểm tra thời điểm bắt đầu, hết hạn và thu hồi ở mỗi request. Role global không còn phù hợp hoặc membership staff bị gỡ thì mất quyền ngay.
- Chuyển owner yêu cầu active Teacher và lý do; owner cũ không được tự giữ lại làm staff. Gỡ staff thu hồi grant trong cùng transaction. Không được gỡ owner trước khi chuyển chủ.
- Course writes được serialize cùng các thay đổi identity trên PostgreSQL và recheck actor/session sau lock. Metadata, lesson-plan và override writes yêu cầu `If-Match: "revision"`; stale edits trả 409, thiếu revision trả 428. UI giữ form khi lỗi và cho tải lại course.
- Trường khoa/học kỳ chỉ được gán mới khi catalog active; retirement giữ lịch sử, không chặn chỉnh sửa metadata không liên quan. Faculty ID/term code không đổi.
- Course/account search có pagination và lọc server-side. Account candidates chỉ trả ID, username, official name cho owner/Admin và giới hạn 25 kết quả, không trả email/credential.

Permission keys dùng theo `access-policy.example.json`, ví dụ `content.author`, `roster.read`, `course.rules.manage`. API cũng chuẩn hóa hai tên trong prose cũ `course.content.author`/`course.roster.read` về key tương ứng. Không có quyền `course.manage` tự cấp cho TA.

## Lịch và Course Rules

- Session và term timestamps bắt buộc offset khớp IANA timezone, end sau start; database và API dùng UTC, UI hiển thị theo timezone của course/term. Form chuyển wall time độc lập với timezone thiết bị và từ chối DST gaps/ambiguous times.
- Meeting link chỉ chấp nhận HTTPS, không credentials/control characters. Server không fetch meeting URL. Session reads hỗ trợ khoảng thời gian nửa mở `[from,to)`.
- Lesson-plan entry có ID server cấp, vị trí duy nhất, nội dung/reading/outcomes/giờ học; giữ ID khi sửa để bảo toàn session links. Lesson-version ID chỉ là opaque reference cho đến khi có lesson authoring.
- Shared template versions bất biến qua API; activation áp dụng mặc định mới, giữ course overrides bằng stable ID. Chặn activation làm orphan override hoặc trùng ID với custom rule.
- Course override writes kiểm tra cả template version và course revision. Nội quy là văn bản giải thích, không tự thực thi chính sách điểm danh/chấm điểm.
- Không có resource upload, lesson publication, recurrence hay sửa/hủy session trong increment này; đó không phải tính năng đã triển khai. Assessment, attendance và notifications thuộc BUILD sau. Learner-code execution vẫn tắt.

## Kiểm chứng

- **43 pytest tests pass** (10 course tests mới), gồm access/privacy, ETag, role/grant expiry/revocation, owner transfer, enrollment withdrawal, draft archive isolation, catalog retirement, plan/session retention và source response schemas.
- **10 web tests pass**: bốn identity DOM tests, bốn course DOM tests và hai timezone tests. Course UI tests kiểm tra tạo course/module, giữ bản sửa plan khi stale, lý do gỡ staff và xem/xác nhận rule activation. Đây không phải browser E2E/visual QA.
- Ruff check/format, strict mypy, TypeScript và Next production build pass; không thêm runtime dependency mới.
- PostgreSQL test DB kiểm tra upgrade/downgrade/re-upgrade/repeated upgrade, metadata drift, append-only audit và luồng course/catalog/enrollment/ownership/rules/planning/archive thật; không gửi email.
- Production HTTP smoke pass 12 routes, assets/CSP, login, course reads, proxy forwarding ETag/mutation/stale conflict, Student visibility và preferences/logout.
- Source contracts: 150 paths, 174 operations, 19 JSON Schemas, 17 examples; generated DTOs cập nhật từ source.
- Main database ở `0004_course_workflows (head)` với private backup trước migration trong ignored `.local/backups/`. Không seed dữ liệu QA hoặc đổi mật khẩu người dùng thật. Backup/restore drill toàn diện vẫn thuộc release gate sau.
- Chưa xác minh browser visual/keyboard/mobile do browser access host không khả dụng. Hosted CI chưa được quan sát; SMTP thật của BUILD-02 vẫn chưa xác minh.

```powershell
# Từ cyb3rt1tan-lms/api
..\.venv\Scripts\python.exe -m pytest -q
..\.venv\Scripts\python.exe -m ruff check app tests migrations
..\.venv\Scripts\python.exe -m mypy app
# Từ cyb3rt1tan-lms/web
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
# Từ cyb3rt1tan-lms: chỉ reset database TEST có guard theo tên
.\.venv\Scripts\python.exe scripts/verify-postgres.py
.\.venv\Scripts\python.exe scripts/verify-identity-postgres.py
.\.venv\Scripts\python.exe scripts/verify-courses-postgres.py
```

`verify-postgres.py` reset `codemark_lms_test`; không chạy trên dữ liệu thật. `smoke-http.py` cần API QA (`serve-qa.py`) và web production trên 8100/3100, cùng fixtures từ ba script trên. Dừng QA trước khi khởi động lại ứng dụng thường bằng `npm run dev:master` từ root dự án.
