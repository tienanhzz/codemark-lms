# CodeMark — master-kit rebuild

Ứng dụng local theo `../master-kit (1)`: Python 3.13, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL 17; Next.js 16, React 19, Tailwind 3 và Font Awesome 6. **Kế hoạch hiện hành dùng BUILD-000…034 gốc:** [MASTER-KIT-EXECUTION.md](docs/MASTER-KIT-EXECUTION.md). Dãy local 01/02/03 trước đây được giữ làm lịch sử, không phải BUILD-001/002/003 gốc.

Phần đang chạy có đăng nhập thật, session/CSRF, dashboard dữ liệu thật, activity, hồ sơ chỉ đọc, đổi mật khẩu, giao diện sáng/tối, tám palette, EN/VI và accessibility lưu theo tài khoản. Không có dữ liệu khóa học mẫu hoặc tài khoản mặc định. Chưa có self-service reset mật khẩu, chỉnh nickname/avatar/contact hay các workflow LMS được liệt kê pending bên dưới.

Có API/UI quản lý tài khoản, role/session, invitation, TOTP/recovery codes và policy MFA. BUILD-026 đã bổ sung [khôi phục mật khẩu, hồ sơ/biệt danh, phiên cá nhân, CSV tài khoản v2/ghi danh và xuất CSV/XLSX có audit](docs/master-kit/BUILD-026.md). Profile support của trợ lý/protected avatar/course staff privacy projection còn lại. [Hướng dẫn identity trước đó](docs/BUILD-02.md) giữ nhãn local cũ. Email thật cần relay STARTTLS do đơn vị quản lý; khi chưa cấu hình, ứng dụng báo unavailable. Không gửi mail thật trong tests.

Có API/UI course/module subset, khoa/học kỳ, staff/permission/enrollment, lesson-plan draft, tạo/xem buổi học và effective Course Rules. [Hướng dẫn course hiện có](docs/BUILD-03.md) dùng nhãn local cũ; đây mới là một phần BUILD-027 gốc. Lịch lặp/đổi-hủy buổi học, resources/grade schemes và historical effective rules chưa hoàn chỉnh. Browser visual/keyboard/mobile QA còn pending.

BUILD-012/024 gốc đã bổ sung dashboard theo vai trò và các trang phụ; cùng hai trang khôi phục mật khẩu mới hiện có **53 routes**. Màn hình chưa có domain service ghi rõ **Interface preview · sample data**. Table/card/search/filter, detail tabs, các form/câu hỏi/rubric minh họa chỉ thao tác trong bộ nhớ, không tạo bài nộp/điểm/giao dịch thật. Không có demo role switch để cấp quyền.

BUILD-025 đã hoàn thiện transactional outbox và giới hạn cấu hình PostgreSQL, bảo vệ audit cả UPDATE/DELETE/TRUNCATE và bổ sung `/operations` cho Admin đọc diagnostics thật. Dispatcher/Redis chưa chạy; sự kiện được giữ bền vững ở trạng thái pending. Xem [database/deployment boundary](docs/DEPLOYMENT-DATABASE.md).

## Các màn hình và quyền hiện có

| Người dùng | Đường dẫn | Chức năng đang chạy |
| --- | --- | --- |
| Mọi tài khoản đã đăng nhập | `/`, `/activity`, `/profile` | Dashboard/activity được phép xem, danh tính chính thức chỉ đọc; chỉnh biệt danh/hồ sơ/liên hệ riêng tư |
| Mọi tài khoản đã đăng nhập | `/security`, `/settings` | Đổi mật khẩu, TOTP/recovery, xem/thu hồi phiên cá nhân, locale/timezone/theme/palette/accessibility |
| Student đã active enrollment | `/courses` | Khóa học đã active hoặc lịch sử được phép xem, module/plan/schedule/rules; không xem roster |
| Teacher/Admin | `/courses` | Tạo course; course owner/Admin quản lý metadata/staff/enrollment/lifecycle; staff khác theo quyền hiện tại |
| Admin | `/accounts`, `/imports`, `/mfa-policy` | Quản lý tài khoản/role/sessions, lọc khoa/lớp/nguồn, CSV tài khoản v1/v2 và ghi danh, xuất CSV/XLSX có audit, MFA và chính sách biệt danh |
| Administrative Assistant | `/imports` | CSV ghi danh có preview/commit, không cấp quyền global role, đọc bài nộp/điểm/roster hoặc xuất dữ liệu định danh |
| Admin | `/academic-catalogs`, `/course-rules` | Quản lý khoa/học kỳ và shared Course Rules template/version/activate |
| Người nhận invitation | `/accept-invitation#token=…` | Tự đặt mật khẩu bằng token một lần được gửi qua relay cấu hình |
| Người cần khôi phục | `/forgot-password`, `/reset-password#token=…` | Gửi hướng dẫn qua SMTP đã cấu hình, đặt lại mật khẩu bằng token một lần, thu hồi mọi phiên và giữ nguyên MFA |
| Admin | `/operations` | Diagnostics database/migration/pool/outbox thật; các dịch vụ chưa nối không giả báo healthy |

Các trang preview được nhóm trong menu theo vai trò: Student có practice/assessment/grades/attendance/calendar/ranks/economy/clan; Teacher/TA có question bank/authoring/assessment builder/grading/monitor/roster/report; Admin có taxonomy/policies/ledger/branding/audit/global settings. Preview không lấy hoặc lưu hồ sơ sinh viên thật; service tương ứng được hoàn thiện trong BUILD nghiệp vụ sau.

Administrative Assistant có workspace/account self-service và CSV ghi danh; profile support còn lại. Research Assistant chỉ có workspace/account self-service, anonymized research data chưa hoàn chỉnh. API luôn kiểm tra quyền, không có role switch để cấp quyền.

Tạo khóa học lần đầu: Admin tạo học kỳ ở Danh mục học vụ, tạo course, chỉ định Teacher owner/staff và ghi danh Student, thêm plan/lịch/nội quy rồi activate. Mẫu CSV tài khoản v2 bổ sung khoa/lớp/nhóm; mẫu CSV ghi danh cập nhật enrollment cho Student hiện có. Mẫu v1 5 cột được giữ tương thích. Bản xuất là báo cáo định danh, không thay thế mẫu import. Tệp xuất tải trong 15 phút và phải tạo lại nếu dữ liệu đã thay đổi.

## Sử dụng trên máy này

PostgreSQL phải đang chạy. Database ứng dụng `codemark_lms` và database test `codemark_lms_test` tách biệt với dữ liệu Java cũ. Cấu hình và HMAC key nằm trong `.env` bị Git bỏ qua, không được in hoặc đưa lên repository.

Tạo Admin đầu tiên bằng terminal tương tác, từ thư mục này:

```powershell
cd api
..\.venv\Scripts\python.exe -m app.cli bootstrap-admin
cd ..
```

CLI yêu cầu username, email, họ tên và mật khẩu 12–128 ký tự. Không hiển thị mật khẩu khi nhập. Tạo Admin và audit atomically dưới advisory lock, từ chối chạy lại nếu đã có Admin. Không có tài khoản/mật khẩu mặc định.

Khởi động từ `D:\CodeMark`:

```powershell
npm.cmd run dev:master
```

Launcher này chạy bản web production đã build để giữ CSP nghiêm ngặt; không phải hot reload. Sau khi sửa giao diện, dừng launcher, chạy `npm.cmd run build:master` tại gốc rồi mở lại.

- Giao diện: http://127.0.0.1:3100
- Backend: http://127.0.0.1:8100
- Readiness: http://127.0.0.1:8100/health/ready

Next.js proxy API `/v1` cùng origin, browser không gọi trực tiếp port backend. Source bật CSP, cookie Strict/HttpOnly, assets/fonts/icons tự host. `COOKIE_SECURE=false` chỉ dành cho HTTP loopback; môi trường HTTPS phải đặt true.

Build production:

```powershell
cd web
$env:NEXT_TELEMETRY_DISABLED='1'
npm.cmd ci --ignore-scripts
npm.cmd run typecheck
npm.cmd run build
npm.cmd run start
```

Backend production local: từ `api`, chạy `..\.venv\Scripts\python.exe -m uvicorn app.main:socket_app --host 127.0.0.1 --port 8100 --no-access-log` để bật cùng lúc FastAPI và Socket.IO.

## Kiểm tra

Từ `api`:

```powershell
..\.venv\Scripts\python.exe -m pytest -q
..\.venv\Scripts\python.exe -m ruff check app migrations tests
..\.venv\Scripts\python.exe -m ruff format --check app migrations tests
..\.venv\Scripts\python.exe -m mypy app
..\.venv\Scripts\python.exe -m alembic check
```

Từ thư mục ứng dụng:

```powershell
.\.venv\Scripts\python.exe scripts/generate-types.py
.\.venv\Scripts\python.exe scripts/verify-postgres.py
```

`verify-postgres.py` **reset database `codemark_lms_test`** để kiểm tra downgrade/re-upgrade, repeated upgrade, schema drift và audit trigger. Script từ chối target khác; không dùng với dữ liệu thật. Ba tài khoản `qa.*` và mật khẩu fixture trong script chỉ tồn tại ở test DB. `serve-qa.py` chỉ dùng cho QA, không phải launcher ứng dụng.

Dependency Python được khóa hash trong `api/requirements.lock`; cài bằng `python -m pip install --require-hashes -r api/requirements.lock`. Dependency web khóa trong `web/package-lock.json`. DTO TypeScript được sinh từ source contract, không sửa file generated bằng tay.

## Phạm vi tiếp theo

Tiếp tục theo [BUILD gốc](docs/MASTER-KIT-EXECUTION.md): 000/001/002 đã kiểm chứng; 012/024 đã hoàn thiện phạm vi UI preview; 025 hoàn thành persistence foundation. **BUILD-026 Active**: self-service, account/enrollment import và audited export đã nối API/UI; tiếp theo là profile support/protected avatar/course staff privacy projection. Taxonomy/question bank, assessment/grading/exam, attendance/report, economy/clan và Redis realtime hiện mới có preview hoặc chưa có runtime. Student-code execution tiếp tục tắt theo ADR-0010.

Các gate chưa xác minh: SMTP thật, browser visual/keyboard/mobile, hosted CI, production egress/TLS/managed keys và backup/restore drill. Không dùng lịch sử Done của môi trường khác làm trạng thái local. Migration hiện có là `0007_identity_provisioning`; các database test có thể được reset, database ứng dụng không được seed lại.

Mã Java cũ ở `../backend`, giao diện cũ ở `../frontend` được giữ nguyên. `npm run dev` ở gốc vẫn là launcher Java; dùng `dev:master` để chạy bản này. Chuyển dữ liệu H2 là một công việc riêng có backup/mapping/đối chiếu, chưa tự động thực hiện.
