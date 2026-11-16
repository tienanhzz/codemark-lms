# Sửa lỗi API và gộp tạo hàng loạt vào Tài khoản

## Nguyên nhân đã xác định

Log `backend/instance/classflow.trace.db` ghi `Column A1_0.RANK_WEIGHT not found` khi đọc bảng `cf_assessment` cũ. Giá trị Java `rankWeight=1` chỉ áp dụng cho object mới; không bổ sung được cột vào dữ liệu đang có. Thông báo giao diện cũ gộp các lỗi API không có bản dịch thành cùng một câu chung nên che mất nguyên nhân.

## File thay đổi

- `backend/src/main/java/com/codemark/lms/IdentityMigration.java`: kiểm tra/migrate hệ số bài kiểm tra trước Hibernate, kể cả khi migration tài khoản đã chạy. H2 sao lưu toàn bộ SQL trước sửa. Chỉ thêm cột còn thiếu hoặc điền ô null, không ghi đè hệ số có sẵn.
- `backend/src/main/java/com/codemark/lms/Assessment.java`: thêm default `1` vào định nghĩa cột Hibernate.
- `scripts/migrate-mariadb.ps1`: bổ sung migration cột hệ số cho database MariaDB.
- `backend/src/test/java/com/codemark/lms/IdentityMigrationTest.java`: test bảng cũ đã có dữ liệu, thiếu cột; chạy lại vẫn giữ hệ số tùy chỉnh. Test tái hiện lỗi trước khi sửa đã thất bại đúng với lỗi thiếu cột.
- `frontend/components/admin/BulkAccountForm.tsx`: tách giao diện CSV thành component dùng trong màn hình tài khoản. Sau tạo thành công tải lại danh sách tài khoản.
- `frontend/app/(app)/admin/users/page.tsx`: Thêm tài khoản có hai lựa chọn: Tạo một tài khoản và Tạo tài khoản hàng loạt. Giữ form trong vùng nội dung chính và bảng rank bên phải.
- `frontend/components/AppShell.tsx`: bỏ mục bulk riêng khỏi menu.
- `frontend/app/(app)/admin/bulk-accounts/page.tsx`: chuyển đường dẫn cũ về `/admin/users?create=bulk`, tự mở đúng phần nhập CSV.
- `frontend/lib/api.ts`: lỗi server có mã HTTP, endpoint cũ không tồn tại có hướng dẫn kiểm tra phiên bản backend. Giữ thông báo đăng nhập chung và không hiển thị SQL/mật khẩu.
- `README.md`: thêm vị trí mới và hướng dẫn khởi động lại.

## Cách chạy và kiểm tra

1. Dừng launcher cũ bằng Ctrl+C tại cửa sổ đang chạy. Chạy `npm.cmd run dev` ở thư mục gốc. Launcher biên dịch lại jar và khởi động cả backend/frontend.
2. H2 tự migration và tạo `backend/instance/backups/before-rank-weight-*.sql` nếu cần. MariaDB phải chạy lại script migration trước startup.
3. Mở Tổng quan, lớp và bài thi trên dữ liệu cũ: không còn lỗi truy vấn thiếu `rank_weight`.
4. Đăng nhập admin → Tài khoản → Thêm tài khoản → Tạo tài khoản hàng loạt. Tải mẫu, thả CSV, xem trước và tạo. Quay lại danh sách để kiểm tra tài khoản vừa tạo.
5. Menu bên trái chỉ có Tài khoản; đường dẫn bulk cũ tự chuyển về Tài khoản và mở nhập hàng loạt.

Kiểm chứng: `node scripts/maven.mjs test` — **21 tests, 0 failures, 0 errors**. `npm.cmd run build:frontend` kiểm tra build và TypeScript.

## Giả định

Lỗi trong ảnh không có tên trang; nguyên nhân thiếu cột được xác định từ log database thực tế trong workspace. Hệ số cho bài cũ mặc định là 1.

## Chưa kiểm chứng/rủi ro

Đã test migration trên DB thử có dữ liệu cũ; chưa can thiệp vào tiến trình backend đang chạy hoặc kết nối DB thật bằng công cụ ngoài. Cần khởi động lại backend mới để áp dụng. Chưa kiểm tra giao diện qua trình duyệt thật. Chưa có môi trường MariaDB để chạy script trực tiếp.
