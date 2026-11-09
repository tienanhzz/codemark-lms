# Báo cáo nâng cấp CodeMark — 06/11/2026

> Cập nhật sau phản hồi: đã sửa migration thiếu `rank_weight`, gộp tạo hàng loạt vào Tài khoản → Thêm tài khoản. Chi tiết và kết quả 21 tests: [SUA-LOI-TAI-KHOAN.md](SUA-LOI-TAI-KHOAN.md).

Đã sửa trực tiếp trong dự án. Giữ Spring Boot 3.5.7, Java 21, JPA/H2/MariaDB và Next.js/React. Không tạo lại ứng dụng, không xóa các module lớp, bài học, thông báo, thảo luận, bài kiểm tra, chấm tự động, điểm danh, nghỉ phép, giám sát và nhật ký.

## Khảo sát và các file thay đổi

- `khao-sat-ban-dau.txt`: danh sách vị trí dùng tài khoản cũ, mọi modal/confirm/prompt và hộp chọn file phát hiện trong nguồn đang chạy. `schema-ban-dau.txt`: các entity/bảng/liên kết JPA ban đầu. Dữ liệu SQLite trong `backend/instance/lms.db` và mã trong `archive/` là bản cũ, backend hiện dùng `classflow.mv.db` mặc định.
- `ke-hoach.md`: kế hoạch và giả định kỹ thuật. `files-thay-doi.txt`: danh sách đầy đủ file mới/sửa của lần nâng cấp này.
- GĐ1: `frontend/app/**`, `frontend/components/**`, `frontend/lib/format.ts`, `frontend/lib/api.ts`: nhãn, hướng dẫn, ngày giờ, trạng thái và lỗi tiếng Việt. Giữ tên sản phẩm, tên ngôn ngữ lập trình, tên tier theo yêu cầu và nội dung bài học/câu hỏi do người dùng nhập.
- GĐ2: `User.java`, `Access.java`, `AuthController.java`, `AdminController.java`, `Views.java`, `DemoSeed.java`, `CourseController.java`; frontend `AuthProvider.tsx`, trang login/account/admin/users, roster và các type: thay định danh tài khoản bằng `studentId`. Kiểm tra 10 số ở form và lifecycle JPA; unique ở DB. Mật khẩu BCrypt, tối thiểu 12 ký tự và tối đa 72 byte UTF-8. Lỗi đăng nhập chung. `IdentityMigration.java` chạy trước Hibernate; H2 sao lưu SQL toàn bộ trước khi bỏ cột cũ. `scripts/migrate-mariadb.ps1` sao lưu MariaDB trước khi đổi schema.
- GĐ3: `components/ui.tsx`: Drawer gắn bằng React Portal vào vùng main, có nút Quay lại. Form dài tạo/sửa bài kiểm tra, câu hỏi và tạo lớp là màn hình nội dung thay trang hiện tại; bảng xếp hạng vẫn bên phải. `InlineConfirm.tsx`: xác nhận/hủy tại vị trí nút gốc. `LeaveTab.tsx`: ghi chú xét duyệt trong dòng. Các trang dùng modal cũ đã chuyển sang Drawer.
- GĐ4: `Csv.java`, `BulkAccountController.java`, `/admin/bulk-accounts`: kéo thả CSV UTF-8, BOM/dấu ngoặc kép, tối đa 1 MiB/1000 dòng; preview không trả mật khẩu; mặc định bỏ qua mã đã tồn tại; tùy chọn reset chỉ áp dụng tài khoản sinh viên. Commit kiểm tra lại và ghi trong một transaction; xuất lỗi CSV. Tài khoản mới/reset bị thu hồi phiên cũ và phải đổi mật khẩu.
- GĐ5: `QuizController.java`, entity quiz trong `RankModels.java`, `QuizLinksTab.tsx`, trang chi tiết lớp: giao quiz cho lớp, URL http/https, hạn, điểm tối đa; mở tab mới bằng liên kết `target=_blank` với `noopener noreferrer`. Sinh viên báo hoàn thành chỉ tạo trạng thái chờ; giảng viên xác nhận hoặc import mới cộng điểm. CSV kết quả cho chọn cột mã và điểm để dùng với bản xuất Wayground; các dòng lỗi được báo ngay trên trang.
- GĐ6: `RankModels.java`, `RankService.java`, `RankController.java`, `RankBootstrap.java`, `GradingService.java`, `Assessment.java`, `AssessmentController.java`, `Store.java`; `Leaderboard.tsx`, `AppShell.tsx`, các trang `/leaderboard`, `/admin/rank`, `/rank-adjustment`: mùa, tier lưu DB, sổ cái bất biến ở tầng JPA/API, cộng chênh lệch kết quả tốt nhất. Khóa chính sinh viên trong ledger ổn định khi admin đổi mã đăng nhập. Giữ lịch sử điểm kể cả khi nguồn/lớp bị xóa. Phân biệt nguồn bài tập, bài thi và quiz; đổi loại bài không tạo thêm nguồn tính điểm. Hệ số rank cấu hình ở form bài kiểm tra, mặc định 1.
- GĐ7: quyền được kiểm tra lại ở controller/service; quyền lớp dùng Access.course. `RealtimeService.java` chặn thao tác WebSocket khi tài khoản chưa đổi mật khẩu. Các bài test cũ đã đổi định danh mẫu; thêm `RankIntegrationTest.java`, `IdentityMigrationTest.java`. Thêm `@types/react-dom` chính thức để kiểm tra kiểu Portal.

## Cách chạy

Yêu cầu JDK 21+, Node.js 20.9+, npm, Maven 3.9+ (launcher tự dùng Maven trong `.tools` nếu có).

1. Dừng backend cũ. Chạy `npm.cmd ci` tại thư mục gốc nếu cần cài dependencies.
2. H2 mặc định: chạy `npm.cmd run dev`. Migration tự lưu SQL vào `backend/instance/backups/before-identity-*.sql` trước khi đổi cột. Nếu sao lưu lỗi, startup dừng. Không xóa thư mục backup.
3. MariaDB: dừng backend, chạy `powershell -ExecutionPolicy Bypass -File scripts/migrate-mariadb.ps1 -Database TEN_DB -UserName TEN_USER` trước startup; công cụ `mariadb-dump` và `mariadb` phải có trong PATH. Công cụ hỏi mật khẩu trực tiếp, không đưa mật khẩu vào lệnh. Backend cũ vốn dùng BCrypt; phải kiểm tra dữ liệu legacy khác trước khi migrate MariaDB.
4. Mở `http://localhost:3000`. Backend ở cổng 5000. Cấu hình kết nối vẫn theo `.env.example` và launcher cũ.
5. Admin mặc định **mã `0000000000`, mật khẩu ban đầu `CodeMark@2026!`**, chỉ tạo khi chưa có admin có mã hợp lệ. Lần đầu bị chuyển đến Tài khoản và server chặn các API chức năng cho đến khi đổi mật khẩu. Không đưa mật khẩu này vào log.
6. Admin vào Tài khoản, gán mã 10 số cho tài khoản cũ đang chờ mã và đặt lại mật khẩu nếu cần. Các ID, lượt nộp và quan hệ lớp được giữ nguyên. Dùng trang Mùa và điểm rank để tạo mùa đang hoạt động trước khi chấm bài.
7. Dữ liệu mẫu tùy chọn: dừng backend rồi `npm.cmd run seed`. Tài khoản mẫu mới: admin `1000000000`, giảng viên `1000000001`, trợ giảng `1000000002`, sinh viên `2025000001`–`2025000003`; mật khẩu `DemoPass123!`. Chỉ dùng mẫu để thử, không cấp cho lớp thật. Seed giữ mật khẩu đã có.

Build/test: `node scripts/maven.mjs test`, `node scripts/maven.mjs package`, `npm.cmd run build:frontend`. Trên Windows dùng `npm.cmd` nếu execution policy chặn `npm.ps1`. CI hiện có vẫn chạy Maven verify và Next build trên Java 21/Node 22.

## Cách test từng tính năng

| Phần | Thao tác và kết quả mong đợi |
|---|---|
| Đăng nhập | Nhập mã 9 số/chữ/đúng mã sai mật khẩu: không đăng nhập. Tài khoản cũ chưa gán mã không đăng nhập được. Tài khoản bulk mới phải đổi mật khẩu mới gọi được API lớp. |
| Migration | Trên bản DB thử có bảng người dùng cũ, chạy 2 lần: giữ ID, bỏ cột cũ, mã null được đánh dấu chờ, có bản sao lưu. H2 test tự động đã xác nhận. |
| Bulk | Tải mẫu, thêm mã sai, mã trùng trong file, mã đã tồn tại, mật khẩu ngắn. Thả CSV: mỗi dòng hiện trạng thái. Nút tạo chỉ tính dòng hợp lệ; tải CSV lỗi. Chạy lại không tạo trùng. Thử tài khoản sinh viên gọi endpoint: 403. |
| Quiz | Giảng viên vào lớp → Quiz link → thêm URL và hạn. Sinh viên mở tab mới và báo hoàn thành: Chờ xác nhận, điểm rank chưa tăng. Giảng viên nhập điểm hoặc thả CSV và chọn đúng cột: điểm tăng sau xác nhận. |
| Rank | Tạo mùa, nộp bài 100% hệ số 1: +100; bài thi hệ số 2: +200. Quiz đạt 8/10: +80, xác nhận lại không cộng, tăng lên 9/10 chỉ +10, nhập 7/10 không tăng. Đạt 390 điểm: Silver với ngưỡng ban đầu. |
| Mùa/tier | Tạo mùa mới active: tổng mùa mới bắt đầu từ 0, ledger mùa cũ vẫn còn. Ngưỡng đầu khác 0, ngưỡng âm/không tăng/tên trùng bị server từ chối. |
| Điều chỉnh | Admin hoặc giảng viên nhập mã, điểm cộng/trừ và lý do. Giảng viên chỉ được tác động sinh viên thuộc lớp có quyền quản lý; không thể bỏ trống lý do. |
| Bảng EAST | Trên màn hình rộng, cạnh nội dung có top 10, tier và điểm; dòng sinh viên hiện tại được tô nổi bật, kể cả ngoài top 10. Chọn lớp, làm mới; Xem đầy đủ có tìm kiếm và phân trang. Cập nhật khi tải, sau API ghi điểm và tự kiểm tra mỗi 30 giây. |
| Popup | Thử thêm/sửa/xóa tài khoản, lớp, bài học, câu hỏi, thông báo, điểm danh và duyệt nghỉ. Form ở main, thao tác dài có Quay lại; xóa có Xác nhận/Hủy cạnh nút. Không có confirm/prompt/modal tùy chọn trong nguồn hiện hành. Hộp chọn file chỉ là phương án dự phòng khi không kéo thả được. |
| Hồi quy | Điểm danh/QR, bài thi, chấm bài, giới hạn truy cập lớp, admin và WebSocket được bộ integration test cũ kiểm tra lại. Sửa lớp giữ quiz; xóa lớp xử lý cả quiz và kết quả liên quan, giữ ledger. |

## Giả định

- Dùng module Assessment sẵn có làm bài tập/bài thi; không thêm module trùng. Các bài lập trình vẫn cần Docker runner như trước.
- Điểm rank = điểm đạt / điểm tối đa × 100 × hệ số bài; quiz ngoài hệ số 1. Chỉ ghi điểm mới trong khoảng ngày mùa active. Không tự hồi tố lượt nộp trước khi triển khai/mùa bắt đầu.
- Tier theo tên League trong yêu cầu, áp dụng sinh viên. Mọi vai trò thấy bảng, chỉ sinh viên có dòng rank cá nhân. Âm điểm do điều chỉnh vẫn hiển thị điểm thực và tier nền Iron.
- Màn hình dài là màn hình thay nội dung main trong ứng dụng, không nhất thiết có URL riêng. Bulk, quản trị rank và bảng đầy đủ có URL riêng. Màn hình hẹp xếp bảng rank xuống dưới để vẫn đọc được nội dung.
- CSV bắt buộc đã làm; XLSX tùy chọn chưa thêm. Không gọi API của Wayground/Kahoot và không tự đọc kết quả từ trang ngoài.
- Dữ liệu câu hỏi/bài học do người dùng nhập, tên sản phẩm, tên tier, mã sự kiện kỹ thuật trong nhật ký và dữ liệu lịch sử giữ nguyên.

## Kiểm chứng và rủi ro

- Maven: **20 tests, 0 failures, 0 errors**, gồm migration/CSV, luồng rank/quiz/bulk, kiểm tra quyền và hồi quy HTTP/WebSocket. Chạy thực tế bằng Java 25 với target release 21; CI cấu hình Java 21.
- Next production build đã qua biên dịch, kiểm tra TypeScript và sinh các trang. Lượt cuối sau dọn mã được ghi trong `kiem-chung.txt`.
- Trình duyệt kiểm thử không khởi tạo được: `The browser access host is unavailable`. Chưa xác minh bằng mắt bố cục desktop/mobile, drag/drop, focus/animation và mở tab thật; không coi build thành bằng chứng UI hoàn toàn đúng.
- Migration đã test H2 bộ nhớ; chưa chạy migration trên DB thật của bạn để tránh làm gián đoạn phiên đang sử dụng. Lần khởi động mới sẽ migrate và sao lưu. MariaDB và tranh chấp đồng thời trên MariaDB chưa có môi trường kiểm chứng.
- Ledger bất biến qua JPA/API. Người có quyền quản trị DB trực tiếp vẫn có thể sửa DB; không có trigger ở mức DB. Cơ chế khóa hiện ưu tiên tính đúng và dễ hiểu, có thể cần tối ưu khi lượng chấm đồng thời lớn.
- Npm khi cài gói kiểu thông báo 2 lỗ hổng dependency (1 moderate, 1 high); chưa xác định và nâng cấp các dependency ngoài phạm vi lần này bằng `audit fix --force`.
- Bản sao lưu migration chứa dữ liệu cũ theo mục đích khôi phục, bao gồm định danh cũ; không phục vụ qua web, không đưa vào ZIP. Tài khoản cũ chưa có mã phải được admin gán mã thủ công.
- Hành vi thay đổi chủ ý: bỏ đăng nhập/tra cứu bằng định danh cũ; tài khoản mới/reset bắt đổi mật khẩu; thao tác xác nhận không mở popup; form dài thay vùng main. Các module LMS khác được giữ lại.
