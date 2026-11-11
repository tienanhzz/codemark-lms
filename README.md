> Bản nâng cấp LMS và hướng dẫn tiếng Việt: [docs/BAO-CAO.md](docs/BAO-CAO.md). Admin mặc định: `0000000000`, mật khẩu ban đầu `CodeMark@2026!`, bắt đổi lần đầu.

# CodeMark

### Trang chủ, băng chuyền ảnh và thông báo công khai

Chỉ bố trí lại khung đầu trang thành hai hàng: logo bên trái, tài khoản hoặc nút Đăng nhập bên phải, thanh truy cập nhanh và chuông thông báo bên dưới. Giữ giao diện trắng, xám nhạt và xanh teal của CodeMark cùng luồng đăng nhập ban đầu. Sidebar, nội dung trang chủ, băng chuyền và bảng tin giữ nguyên.

Cập nhật giao diện: bỏ bộ đếm và nút chuyển ảnh, dùng favicon web ở đầu sidebar. Trang đăng nhập căn giữa trên nền đơn giản; mục **Quên mật khẩu?** và **Cần hỗ trợ?** mở hướng dẫn dưới form. Việc cấp lại mật khẩu vẫn do quản trị viên thực hiện sau khi xác minh, chưa có luồng tự khôi phục.

Mở `/` để xem trang chủ mới. Admin/giảng viên đăng thông báo bằng **Trang chủ → Đăng thông báo**; khách và sinh viên chỉ xem. Sidebar desktop thu gọn thành icon, mở khi rê chuột hoặc dùng bàn phím. Sau đăng nhập về trang chủ, riêng tài khoản bắt đổi mật khẩu vẫn về form đổi mật khẩu.

Khởi động lại bằng `npm.cmd run dev` để backend tạo bảng thông báo mới. Chi tiết file thay đổi, thay ảnh, cách test, giả định và giới hạn: [docs/TRANG-CHU.md](docs/TRANG-CHU.md).

### Sửa lỗi dữ liệu cũ và vị trí tạo hàng loạt (06/11/2026)

- Đã sửa lỗi database cũ thiếu cột `cf_assessment.rank_weight`: khi khởi động backend mới, hệ thống sao lưu SQL rồi thêm cột với hệ số mặc định `1`. Không thay đổi điểm hoặc nội dung bài cũ; chạy lại không ghi đè hệ số đã cấu hình.
- Tạo hàng loạt nằm tại **Tài khoản → Thêm tài khoản → Tạo tài khoản hàng loạt**. Không còn mục riêng trên thanh menu. Đường dẫn `/admin/bulk-accounts` cũ chuyển về màn hình tài khoản.
- Sau khi cập nhật mã nguồn, dừng phiên `npm run dev` cũ bằng **Ctrl+C**, rồi chạy lại `npm.cmd run dev`. Java đang chạy không tự nhận mã mới chỉ bằng cách tải lại trang. Nếu dùng MariaDB, chạy lại script migration trước startup.
- Chi tiết thay đổi và cách kiểm tra: [docs/SUA-LOI-TAI-KHOAN.md](docs/SUA-LOI-TAI-KHOAN.md).

A classroom learning management system built with **Java 21+, Spring Boot, JPA/Hibernate and WebSocket**, with a **Next.js, TypeScript and Tailwind CSS** frontend.

## Overview

CodeMark brings course management, learning materials, announcements, discussions, assessments, grading, attendance and leave requests into a shared workspace for teachers and students. Teachers can monitor assessment activity and send alerts, adjust deadlines or submit an active attempt through WebSocket.

The application supports one server and multiple browsers on a local network. H2 provides persistent storage for local use; MariaDB can be configured through environment variables.

## Requirements

- JDK 21 or later, available through `java` in PATH.
- Maven 3.9 or later, available through `mvn` in PATH.
- Node.js 20.9 or later and npm.
- Docker is optional and only required for code execution exercises.

Check your tools with `java -version`, `mvn -version` and `node -v`. The launcher also recognizes a local Maven installation at `.tools/apache-maven-3.9.11/`.

## Quick start

Run these commands from the project root:

```powershell
npm install
npm run seed
npm run dev
```

| Service | Address |
| --- | --- |
| Frontend | http://localhost:3000 |
| Backend health | http://localhost:5000/health |
| WebSocket | ws://localhost:5000/ws |

The development launcher builds the backend JAR and starts both services. Press Ctrl+C to stop them. Restart the launcher after changing Java code. Stop any existing services on ports 3000 and 5000 before starting another instance.

## Demo accounts

Run `npm run seed` explicitly to create demo accounts and sample content. Normal startup does not create these accounts. Stop the backend before running seed, as the H2 database is opened by the running server.

| Role | Mã đăng nhập | Initial password |
| --- | --- | --- |
| Admin | 1000000000 | CodeMark@2026 |
| Teacher | 1000000001 | CodeMark@2026 |
| Teaching assistant | 1000000002 | CodeMark@2026 |
| Student | 2025000001 | CodeMark@2026 |

Additional student accounts are `2025000002` and `2025000003`. Seed preserves existing passwords and submissions.

Each account has one active session. Signing in again revokes its previous session. Sessions expire after 120 seconds of inactivity; the frontend sends a heartbeat every 30 seconds. Use separate accounts and browser profiles when testing different roles.

## Running services separately

Build and start the backend:

```powershell
npm run build:backend
cd backend
java -jar target/classflow-1.0.0.jar
```

In another terminal at the project root:

```powershell
npm run dev:frontend
```

For a production frontend build, run `npm run build:frontend`, followed by `npm run start --workspace=frontend`. Development output is stored in `frontend/.next-dev/`; production build/start use `frontend/.next/`, so a production build does not overwrite chunks used by the development server. Stop the development server before starting production on the same port 3000.

### Sửa lỗi thiếu module `./949.js` hoặc chunk Next.js

Lỗi này xảy ra khi phiên dev và lệnh build cùng ghi vào `.next`, khiến runtime tham chiếu các chunk đã bị thay thế. Cấu hình hiện tại đã tách thư mục dev và production để tránh xung đột này. Sau khi cập nhật, dừng phiên frontend cũ bằng **Ctrl+C** rồi chạy lại `npm.cmd run dev:frontend` (hoặc `npm.cmd run dev` nếu cần khởi động cả backend). Tải lại trang để nhận các chunk mới. Giao diện và dữ liệu ứng dụng không thay đổi.

Đã kiểm tra: build production khi dev đang chạy; truy cập `/`, `/login`, `/courses` và 16 tài nguyên JavaScript/CSS trước, trong và sau build; chạy thử production trên cổng tạm riêng. Các trang và tài nguyên đều trả HTTP 200, tài nguyên dev cũ vẫn truy cập được sau build. Kiểm tra TypeScript cũng thành công.

## LAN access

Run `npm run dev` on the server computer. The launcher prints its LAN URLs and permits the corresponding frontend origins. Other devices on the same network should open `http://<server-ip>:3000`. Use the Wi-Fi or Ethernet address shared with those devices. Restart the launcher if the server IP changes.

API and WebSocket connections use the page hostname with port 5000 by default. Remove obsolete localhost overrides from `frontend/.env.local` when using LAN access.

If Windows Firewall blocks connections, run this command once from an Administrator PowerShell window at the project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\enable-lan.ps1
```

The script permits TCP 3000 for Node.js and TCP 5000 for Java from the local subnet. Clients must be able to reach both ports. Guest Wi-Fi or access point isolation may prevent communication between devices.

When running the backend JAR separately, configure the permitted frontend origins explicitly:

```powershell
$env:CORS_ORIGINS="http://localhost:3000,http://192.168.1.20:3000"
```

Browser camera access may require HTTPS when opening a LAN IP address. Manual attendance token entry works over HTTP.

## Configuration and storage

Spring reads operating system environment variables. It does not automatically load the root `.env` file. See [the environment reference](.env.example) and [application.properties](backend/src/main/resources/application.properties).

| Variable | Purpose |
| --- | --- |
| `PORT` | Backend port; defaults to 5000 |
| `JDBC_DATABASE_URL` | JDBC URL; defaults to a local H2 file |
| `DB_USER`, `DB_PASSWORD` | Database credentials |
| `CORS_ORIGINS` | Comma-separated permitted frontend origins |
| `COOKIE_SECURE` | Set to true when using HTTPS |
| `UPLOAD_DIR` | Private upload storage directory |
| `TOKEN_ENCRYPTION_KEY` | Base64url-encoded 32-byte attendance token key |
| `CODE_RUNNER_ENABLED` | Enables Docker-based code execution; defaults to false |
| `CODE_RUNNER_IMAGE` | Runner image name |
| `CODE_RUNNER_MAX_CONCURRENCY` | Concurrent runner tasks, from 1 to 8 |

When started through the launcher:

- The H2 database is stored at `backend/instance/classflow.mv.db`.
- Leave evidence is stored under `backend/instance/uploads/leave/`.
- If no token key is supplied, a persistent demo key is created at `backend/instance/attendance.key`.

For MariaDB, create an empty database and set `JDBC_DATABASE_URL=jdbc:mariadb://localhost:3306/classflow`, `DB_USER` and `DB_PASSWORD`. The JDBC driver is included.

The legacy SQLite database at `backend/instance/lms.db` is preserved but is not automatically imported into H2 or MariaDB. A local backup of the previous Flask source may be present under `archive/`; it is excluded from Git and is not required to run this application.

Do not commit database files, uploaded evidence, secrets, `.env`, build output or dependency directories.

## Architecture

```text
Next.js -> HTTP JSON and session cookies -> Spring MVC controllers
        -> JSON WebSocket /ws            -> RealtimeService / RealtimeHub
Spring services -> Store / JPA -> Hibernate -> H2 or MariaDB
GradingService -> AnswerGrader -> TextAnswerGrader / CodeAnswerGrader
CodeAnswerGrader -> ContainerRunner -> disposable Docker containers
```

| Component | Responsibility |
| --- | --- |
| `BaseEntity` and domain entities | Persistent IDs, timestamps, optimistic versions and relationships |
| `Access` | Authentication, BCrypt passwords, course permissions, network rules and audit |
| `Views` | Explicit JSON DTOs that exclude private fields and hidden answers |
| `Store` | JPA persistence with parameterized JPQL |
| `GradingService` and `AnswerGrader` | Assessment lifecycle and grading strategies |
| `ContainerRunner` | Bounded execution, output capture, timeouts and container cleanup |
| `RealtimeService` | Authorization and handling of incoming WebSocket events |
| `RealtimeHub` | Concurrent room membership and message delivery |
| `AttendanceTokens` | AES-256-GCM tokens with purpose binding and expiry |

Controllers are grouped by authentication, administration, courses, assessments, attendance and reporting. Spring manages transactions and dependency injection. See [the technical specification](SPECIFICATION.md) for API and protocol details.

## Code runner

Code execution is disabled by default. Multiple-choice assessments do not require Docker.

To enable code exercises, start Docker, build the image using [the sandbox instructions](backend/sandbox/README.md), set `CODE_RUNNER_ENABLED=true` in the server environment and restart the backend. Submitted code runs inside disposable containers with restricted permissions and resource limits.

## Verification

```powershell
npm run test:backend
node node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json
npm run build:frontend
```

JUnit uses in-memory H2 databases and separate test upload storage. Results are written to `backend/target/surefire-reports/`.

Integration coverage includes authentication, authorization, LAN origin checks, quiz answers and flags, grading, attendance tokens, evidence uploads, leave decisions and dashboard responses. WebSocket tests start a real server on a random port and verify monitoring, telemetry, alerts, deadline adjustments, forced submission and access restrictions.

GitHub Actions builds and tests the Java backend and builds the Next.js frontend.

## Limitations

### Cảnh báo hydration tại `<html class="mdl-js">`

Nếu trình duyệt hoặc tiện ích chèn thuộc tính lên thẻ `<html>` trước khi React khởi tạo, React có thể báo thuộc tính HTML máy chủ và trình duyệt không khớp. Lớp `mdl-js` trong ảnh lỗi không có trong mã dự án hoặc HTML máy chủ trả về. `frontend/app/layout.tsx` dùng `suppressHydrationWarning` riêng trên thẻ `<html>` để chấp nhận thay đổi thuộc tính gốc từ bên ngoài; các thành phần bên trong vẫn được kiểm tra hydration. Giao diện, SSR và luồng đăng nhập giữ nguyên.

### Thông báo bắt buộc đổi mật khẩu lần đầu

- Khi tài khoản có cờ `mustChangePassword`, trang Tài khoản hiển thị lời nhắc ngay trên form đổi mật khẩu.
- Bấm một chức năng khác trên thanh điều hướng sẽ giữ nguyên form và hiển thị tên chức năng bị chặn. Trang tự cuộn đến thông báo, không mở popup và không làm mất mật khẩu đang nhập.
- Sau khi đổi mật khẩu thành công, lời nhắc được xóa và các chức năng được mở theo quyền tài khoản. Đăng xuất vẫn dùng được trước khi đổi mật khẩu.
- Các file liên quan: `frontend/components/AuthProvider.tsx` giữ lời nhắc; `frontend/components/AppShell.tsx` chặn điều hướng; `frontend/app/(app)/account/page.tsx` hiển thị lời nhắc trong form.
- Kiểm tra thủ công: đăng nhập bằng tài khoản mới, nhập một phần form, bấm Lớp học/Bảng xếp hạng/Lịch học và kiểm tra thông báo cùng dữ liệu nhập vẫn còn. Đổi mật khẩu thành công rồi bấm lại các chức năng để kiểm tra điều hướng. Thử cả menu trên điện thoại và phím Tab/Enter.
- Giả định: “log” là thông báo trên giao diện; không lưu thêm nhật ký thao tác này vào database.

### Các giới hạn khác

- Legacy SQLite import is not implemented.
- MariaDB and the Docker language runners still need validation in their deployment environments.
- Browser end-to-end tests, load tests and performance benchmarks are not included.
- H2 is intended for the single-host demo configuration.
- Internet deployment requires appropriate HTTPS, reverse proxy, credential and operational configuration.
- Exam monitoring records events inside the application page and cannot guarantee prevention of cheating.

## Ngôn ngữ giao diện

- Chọn **Tiếng Việt** hoặc **English** tại nút ngôn ngữ trên thanh đầu trang hoặc trang đăng nhập. Lựa chọn được lưu trong cookie `codemark-language` trong một năm và dùng ngay khi máy chủ dựng trang; mặc định là tiếng Việt.
- Thay đổi ngôn ngữ cập nhật các nhãn, hướng dẫn, thông báo lỗi, lịch, ngày giờ và bảng xếp hạng mà không tải lại trang hoặc đặt lại dữ liệu đang nhập. Nội dung lớp học, tên người dùng, bài làm và thông báo do người dùng nhập được giữ nguyên.
- Bản dịch giao diện nằm trong `frontend/locales/en.json` và `frontend/locales/vi.json`. Nhãn tiếng Việt là văn bản gốc; từ điển tiếng Việt cũng chuẩn hóa những nhãn trước đây viết bằng tiếng Anh. Thêm bản dịch bằng `tr()` từ `useI18n()`; dùng tham số `{0}`, `{1}` cho dữ liệu động, không dịch mã API hay giá trị gửi lên máy chủ.
- Chạy `npm run test:i18n` để kiểm tra bản dịch, tham số, thông báo lỗi và định dạng theo ngôn ngữ; chạy `npm run build:frontend` để kiểm tra bản build. Kiểm tra thao tác: đổi Việt → Anh → Việt, chuyển trang và tải lại để kiểm tra lựa chọn được giữ; nhập một phần biểu mẫu rồi đổi ngôn ngữ để kiểm tra dữ liệu nhập vẫn còn.

## References

- [Spring Boot](https://docs.spring.io/spring-boot/3.5/)
- [Spring Data JPA](https://docs.spring.io/spring-data/jpa/reference/)
- [Spring WebSocket](https://docs.spring.io/spring-framework/reference/web/websocket.html)
- [Next.js](https://nextjs.org/docs)
