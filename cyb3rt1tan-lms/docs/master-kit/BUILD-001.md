# BUILD-001 — README sử dụng ứng dụng

Execution: `local-master-kit-2026-11-14`; prerequisite BUILD-000 đã được kiểm chứng.

Đầu ra đúng phạm vi gốc: [README ứng dụng](../../README.md), không phải xây một màn hình LMS mới.

- Hướng dẫn bootstrap tương tác, không username/password mặc định; startup/build/check, port 3100/8100 và PostgreSQL local.
- Bảng màn hình thực tế và quyền, thứ tự thiết lập course, invitation/MFA/CSV và liên kết hướng dẫn.
- Phân biệt số BUILD gốc với nhãn local 01/02/03 lịch sử; không tuyên bố hoàn thành toàn bộ 026/027.
- Ghi rõ các workflow chưa có, gateway/browser/SMTP/release gates và database test reset guard.
- Kiểm tra các Markdown local links tồn tại; private `.env`, backups và account data không đọc hay đưa vào tài liệu.

Acceptance: README khớp route source và launcher hiện có, tất cả local links tồn tại. Giao diện dùng lại ứng dụng hiện có; BUILD-001 gốc không yêu cầu trang tính năng riêng. Tiến độ theo BUILD tiếp theo ở [MASTER-KIT-EXECUTION.md](../MASTER-KIT-EXECUTION.md).
