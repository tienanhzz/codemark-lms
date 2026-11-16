# BUILD-02 — Identity và giao diện quản trị

Triển khai ngày 14/11/2026 trong bản Python/Next.js mới; mã Java/H2 cũ không bị chuyển dữ liệu hay ghi đè.

Ứng dụng local đã được khởi động lại sau build: giao diện `http://127.0.0.1:3100`, API `http://127.0.0.1:8100`. Readiness và các trang identity trả HTTP 200; `/v1/me` qua proxy trả 401 với client chưa đăng nhập. Chạy bằng database ứng dụng hiện có, không seed tài khoản QA vào dữ liệu thật.

## Sử dụng

- `/accounts`: tìm kiếm/lọc/phân trang tài khoản; chi tiết gồm Overview, Roles & access và Sessions. Chỉ Admin được dùng API và giao diện này.
- Đổi nhiều vai trò dùng sáu vai trò cố định, kiểm tra revision và yêu cầu lý do. Tạm ngưng, khôi phục, thu hồi session và reset MFA có audit. Không có xóa cứng hoặc đặt mật khẩu bởi Admin.
- `/imports`: tải CSV mẫu, chọn tệp, xem trước, kiểm tra lỗi từng dòng và xác nhận trước khi commit. Checksum/token bind đúng bytes của tệp, người thực hiện, duplicate policy và phiên bản dữ liệu đã xem.
- `/security`: bật TOTP bằng mật khẩu hiện tại, quét QR hoàn toàn local, xác minh mã và lưu 10 recovery codes chỉ hiển thị một lần. Bật/tắt MFA thu hồi phiên; người dùng đăng nhập lại bằng mã ứng dụng hoặc recovery code dùng một lần.
- `/mfa-policy`: Admin yêu cầu MFA theo vai trò. Bắt buộc MFA cho Admin cần session đã xác thực MFA; thay đổi chính sách thu hồi session của vai trò đó.
- `/accept-invitation#token=…`: form nhận lời mời, tự đặt mật khẩu. Token được bỏ khỏi URL ngay khi đọc, chỉ gửi trong body của yêu cầu accept; không lưu localStorage hoặc trả lại từ API Admin.

Sau khi bật MFA, mở phần Multi-factor authentication trong form đăng nhập để nhập code hoặc recovery code. Nếu vai trò bắt buộc MFA nhưng tài khoản chưa đăng ký, đăng nhập bằng mật khẩu sẽ mở luồng thiết lập trước khi cấp session.

## CSV phiên bản 1

```csv
username,email,official_name,institutional_id,role
student.name,student@example.edu,Student Name,S001,student
staff.name,staff@example.edu,Staff Name,T001,teacher|teachingAssistant
```

- UTF-8, tối đa 1.000.000 bytes và 500 dòng; không có cột password.
- Institutional ID ưu tiên, rồi username; email không dùng để gộp tài khoản.
- `upsert` cập nhật identity/roles và thu hồi session; `skip` giữ nguyên tài khoản trùng.
- Tài khoản mới ở trạng thái `invited`; chỉ tự đặt mật khẩu qua lời mời mới được active.
- Khi cập nhật người đang invited, lời mời cũ bị thu hồi trước khi cấp lời mời mới, đặc biệt khi email thay đổi.
- Raw CSV và giá trị định danh nguồn không được lưu trong bảng staging; bảng chỉ giữ checksum, token digest, ID/revision đã đối chiếu và kết quả validation.
- Có dòng reject hoặc dữ liệu thay đổi sau preview thì toàn bộ commit bị từ chối. Không nhận lại token preview đã commit.
- Ghi tài khoản/roles/import/audit xong mới thử gửi lời mời. Email thất bại được báo đúng số lượng; token không gửi được bị thu hồi. Account vẫn invited để Admin gửi lại sau khi cấu hình relay.

## SMTP STARTTLS

Chỉ cấu hình relay tự host đã được đơn vị phê duyệt, trong `cyb3rt1tan-lms/.env` riêng tư:

```dotenv
SMTP_APPROVED=true
SMTP_HOST=YOUR_APPROVED_INTERNAL_RELAY
SMTP_PORT=587
SMTP_FROM=accounts@YOUR_INSTITUTION_DOMAIN
SMTP_USERNAME=YOUR_RELAY_USERNAME
SMTP_PASSWORD=YOUR_RELAY_PASSWORD
SMTP_CA_FILE=PATH_TO_PRIVATE_CA_IF_REQUIRED
```

Relay không yêu cầu authentication có thể để trống username/password. Client luôn yêu cầu STARTTLS và xác minh certificate; không fallback plaintext, không bỏ verify và không dùng email-provider API. Cần restart ứng dụng sau thay đổi `.env`. `SMTP_APPROVED` là xác nhận cấu hình của người vận hành; không tự chứng minh relay hoạt động.

Khi chưa cấu hình, nút gửi invitation bị vô hiệu hóa và API trả unavailable. CSV vẫn có thể tạo dữ liệu invited; kết quả báo số lời mời không gửi được. Không giả báo email đã gửi. Trong lần triển khai này không gửi mail thật ra ngoài; SMTP được mock trong tests và bị khóa hoàn toàn trong QA HTTP server.

## Khóa MFA

`MFA_ENCRYPTION_KEY` là Base64 của 32 random bytes, được `configure-local.ps1` thêm nếu chưa có. Không ghi đè key đã tồn tại, không commit `.env`, không đổi key tùy tiện: secrets đã mã hóa cần đúng key cũ. Production secret-manager backup/rotation còn thuộc release operations. Recovery codes chỉ lưu SHA-256 digest, TOTP secret dùng AES-256-GCM với context gắn user ID.

## Bằng chứng kiểm chứng và giới hạn

- 33 pytest tests pass; Ruff format/check và strict mypy pass.
- 4 React DOM unit tests pass: MFA bắt buộc + giữ recovery codes đến khi xác nhận lưu; CSV checksum/confirmation; đổi vai trò yêu cầu lý do/revision; fragment invitation chỉ gửi trong acceptance body. Không sử dụng browser automation hoặc gửi network trong các tests này.
- PostgreSQL test DB kiểm tra migration cycle/repeated upgrade/schema drift/audit trigger, Admin lifecycle, MFA encrypted/recovery single-use và invitation acceptance với SMTP mock.
- Database ứng dụng ở `0003_pending_invitation (head)`; Alembic không báo schema drift. Migration giữ account/session cũ, thêm public session UUID và index chặn nhiều lời mời còn hiệu lực cho cùng email.
- Production build và HTTP smoke 9 routes, bundled assets, security headers, same-origin proxy và API account/session/MFA reads pass.
- npm runtime audit: 0 known vulnerabilities. Python vulnerability scanning, real relay delivery, hosted CI và release security acceptance chưa được xác minh.
- Browser visual/keyboard/responsive QA còn pending: browser access host không khả dụng; lần trước Computer Use đã dừng vì URL-policy enforcement của Cốc Cốc/Windows chưa được hỗ trợ. DOM unit tests và HTTP smoke không thay thế bằng chứng visual/E2E.

Lệnh kiểm tra từ thư mục ứng dụng:

```powershell
cd api
..\.venv\Scripts\python.exe -m pytest -q
..\.venv\Scripts\python.exe -m mypy app
cd ..\web
npm.cmd run test
npm.cmd run typecheck
npm.cmd run build
cd ..
.\.venv\Scripts\python.exe scripts/verify-postgres.py
.\.venv\Scripts\python.exe scripts/verify-identity-postgres.py
```

Hai script PostgreSQL chỉ cho phép database test có tên `codemark_lms_test`; script đầu reset database test. Không chạy với dữ liệu thật. CI đã có cấu hình kiểm tra PostgreSQL và React tests nhưng chưa quan sát hosted run.
