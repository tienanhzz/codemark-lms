# PostgreSQL local

PostgreSQL 17.12 cho Windows x64 đã được cài từ bộ binaries chính thức của [EDB](https://www.enterprisedb.com/download-postgresql-binaries).

| Thuộc tính | Giá trị |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `5432` |
| Database | `codemark` |
| User ứng dụng | `codemark` |
| User quản trị | `postgres` |
| JDBC URL | `jdbc:postgresql://127.0.0.1:5432/codemark` |
| Binaries | `D:\CodeMark\.tools\postgresql-17\pgsql` |
| Data | `D:\CodeMark\.tools\postgresql-local\data` |
| Log | `D:\CodeMark\.tools\postgresql-local\server.log` |

Mật khẩu ngẫu nhiên và connection URL đầy đủ nằm trong `D:\CodeMark\.tools\postgresql-local\connection.json`: `password` dành cho user `codemark`, `adminPassword` dành cho user `postgres`. Thư mục này đã tắt kế thừa quyền truy cập và chỉ cấp quyền cho tài khoản Windows đã cài đặt, SYSTEM và nhóm Administrators. `.tools/` được Git bỏ qua. Không đưa tệp này vào source control hoặc chia sẻ công khai.

Server chỉ lắng nghe trên IPv4 loopback, dùng xác thực SCRAM-SHA-256, dữ liệu UTF-8, timezone `Asia/Bangkok` và data checksums. User ứng dụng sở hữu database `codemark`, không có quyền superuser, tạo database hay tạo role.

Chạy các lệnh sau từ `D:\CodeMark`, bằng tài khoản Windows đã cài đặt:

```powershell
# Bật server, bao gồm sau khi khởi động lại Windows
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\postgresql-local.ps1 -Action Start

# Kiểm tra tiến trình
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\postgresql-local.ps1 -Action Status

# Kiểm tra kết nối và quyền ghi bằng bảng tạm rồi rollback
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\postgresql-local.ps1 -Action Check

# Mở psql bằng user ứng dụng; gõ \q để thoát
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\postgresql-local.ps1 -Action Connect

# Mở psql bằng user postgres
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\postgresql-local.ps1 -Action Connect -Admin

# Dừng server an toàn
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\postgresql-local.ps1 -Action Stop
```

Đây là instance chạy theo tài khoản người dùng, chưa đăng ký Windows Service hoặc tự khởi động cùng Windows. Database `codemark` được tạo rỗng để sử dụng local; việc chuyển ứng dụng Java hiện tại sang PostgreSQL cần thêm JDBC driver và cấu hình datasource riêng.

Đã kiểm tra kết nối bằng user `codemark`, tạo bảng tạm, INSERT/SELECT rồi ROLLBACK thành công. Không xóa thư mục dữ liệu hoặc chạy lại `initdb` để khởi động server.
