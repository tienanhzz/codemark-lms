# Kế hoạch nâng cấp CodeMark

Giữ Spring Boot/JPA và Next.js, giữ dữ liệu và các module LMS. Thực hiện trực tiếp theo đặc tả người dùng, không tạo lại ứng dụng.

1. GĐ1: Việt hóa chuỗi giao diện, định dạng ngày giờ và lỗi API.
2. GĐ2: User.studentId duy nhất, 10 chữ số; cờ pendingCode/mustChangePassword; migration JDBC sao lưu trước khi đổi schema; admin mặc định đổi mật khẩu bắt buộc.
3. GĐ3: Thay thành phần Modal bằng Drawer trong main; form dài thành màn hình nội dung; xác nhận ngay ở nút, ghi chú duyệt nghỉ phép ở dòng.
4. GĐ4: CSV parser có dấu ngoặc kép/BOM, giới hạn 1 MiB/1000 dòng, preview và commit kiểm tra lại trong transaction; không gửi mật khẩu về preview.
5. GĐ5: QuizLink/QuizResult theo lớp, URL HTTP(S), báo hoàn thành, chấm/import CSV có quyền staff của lớp.
6. GĐ6: Season/RankTier/PointEntry/RankPolicy; ledger append-only, khóa mùa khi ghi, ghi phần chênh lệch kết quả tốt nhất; bảng bên phải và trang đầy đủ; quản trị mùa/tier/ledger/điều chỉnh.
7. GĐ7: Kiểm tra quyền phía server; hồi quy LMS, kiểm thử âm quyền và cộng trùng, build frontend/backend.

Giả định: quy đổi kết quả 100% thành 100 điểm rank, bài thi nhân hệ số cấu hình ở assessment; không tự hồi tố điểm mùa cũ. CSV bắt buộc, XLSX tùy chọn chưa thêm thư viện. Các tài khoản cũ không có mã chờ admin gán mã; giữ khóa chính và mọi liên kết.

Kiểm chứng: Maven integration tests, Next production build, quét popup/email; ghi kết quả thực tế và điểm chưa kiểm chứng trong báo cáo.
