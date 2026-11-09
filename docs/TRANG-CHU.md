# Trang chủ CodeMark

## Phần đã làm

- `/` là trang chủ công khai: băng chuyền ảnh ở giữa, các liên kết học tập và bảng thông báo bên dưới.
- Góc trên bên phải hiện Đăng nhập khi chưa đăng nhập; hiện tài khoản và Đăng xuất khi đã đăng nhập.
- Sau đăng nhập, tài khoản bình thường về trang chủ; tài khoản bắt đổi mật khẩu vẫn về `/account` và bị chặn truy cập chức năng khác như trước.
- Sidebar desktop thu gọn còn icon, mở khi rê chuột hoặc khi focus bằng bàn phím. Mobile giữ nút mở menu. Sidebar mở rộng phủ phần mép trái nội dung, không làm bảng xếp hạng EAST dịch chuyển.
- Băng chuyền có 3 ảnh SVG nội bộ, tự chuyển mỗi 6 giây và nút tạm dừng/bật lại. Không hiện bộ đếm, mũi tên hoặc chấm chọn ảnh. Tạm dừng khi rê chuột hoặc focus; mặc định không tự chạy nếu thiết bị yêu cầu giảm chuyển động.
- Đầu sidebar dùng favicon của web (`/branding/favicon.svg`) ở cả trạng thái thu gọn và mở rộng.
- Trang đăng nhập căn giữa trên nền xám nhạt, có Quên mật khẩu/Cần hỗ trợ ngay dưới form. Hai mục mở hướng dẫn tại chỗ, không popup. Quên mật khẩu hướng dẫn liên hệ admin để xác minh và cấp lại; chưa có API tự khôi phục mật khẩu hay gửi phiếu hỗ trợ.
- Admin và giảng viên đăng thông báo công khai bằng form ngay trong nội dung trang; giảng viên chỉ sửa/xóa bài của mình, admin quản lý tất cả. Xóa xác nhận ngay tại dòng, không có popup. Sinh viên và khách chỉ xem.
- Thông báo công khai lưu ở bảng mới `cf_home_announcement`, phân trang 10 bài. Thông báo lớp học cũ giữ nguyên và không bị đưa ra công khai. Không cần sửa dữ liệu bảng cũ; Hibernate tạo bảng mới khi backend khởi động với cấu hình hiện có.

## Danh sách file

| File | Thay đổi |
| --- | --- |
| `frontend/app/page.tsx` | Thay redirect bằng bố cục trang chủ |
| `frontend/components/AppShell.tsx` | Cho phép trang công khai, menu Trang chủ, header khách và sidebar icon |
| `frontend/app/globals.css` | Kiểu sidebar thu gọn/mở rộng |
| `frontend/app/login/page.tsx` | Nút về trang chủ, điều hướng sau đăng nhập |
| `frontend/components/HomeCarousel.tsx` | Mới: băng chuyền ảnh |
| `frontend/components/HomeAnnouncements.tsx` | Mới: danh sách, form đăng/sửa, xác nhận xóa và phân trang |
| `frontend/public/home/learning.svg` | Mới: ảnh minh họa học tập |
| `frontend/public/home/community.svg` | Mới: ảnh minh họa cộng đồng |
| `frontend/public/home/progress.svg` | Mới: ảnh minh họa tiến bộ |
| `backend/src/main/java/com/codemark/lms/HomeAnnouncement.java` | Mới: bảng thông báo công khai |
| `backend/src/main/java/com/codemark/lms/HomeController.java` | Mới: API đọc công khai; ghi có kiểm tra quyền, nội dung và tác giả |
| `backend/src/test/java/com/codemark/lms/HomeIntegrationTest.java` | Mới: kiểm thử quyền, xác thực, dữ liệu, phân trang và tách thông báo lớp |
| `README.md`, `docs/TRANG-CHU.md` | Hướng dẫn sử dụng và kiểm tra |

## Cách chạy

1. Dừng tiến trình phát triển cũ bằng Ctrl+C.
2. Chạy `npm.cmd run dev` từ thư mục dự án. Backend phải được khởi động lại để có API mới.
3. Mở `http://localhost:3000/`.
4. Admin/giảng viên đăng nhập, chọn Trang chủ → Đăng thông báo. Nội dung ở đây được công khai, kể cả cho khách.

Đổi ảnh: thêm ảnh vào `frontend/public/home/`, sửa danh sách `slides` trong `HomeCarousel.tsx` (đường dẫn ảnh, tiêu đề, mô tả và alt). Hiện chưa có màn hình tải ảnh băng chuyền.

## Cách test

1. Chưa đăng nhập: mở `/`, kiểm tra băng chuyền và bảng tin, bấm Đăng nhập; bấm Quay lại trang chủ từ form login.
2. Băng chuyền: kiểm tra không còn bộ đếm/mũi tên/chấm chọn ảnh; dừng/bật tự chuyển; đưa chuột vào ảnh và dùng Tab để kiểm tra tạm dừng.
3. Sidebar: trên desktop rê chuột vào/rời menu; dùng Tab để mở bằng bàn phím. Trên mobile dùng nút menu, chọn mục hoặc nhấn Escape để đóng.
4. Giảng viên: đăng một thông báo, tải lại trang, sửa nội dung và thử xác nhận/hủy xóa. Dùng giảng viên khác để kiểm tra không sửa/xóa được bài của người khác.
5. Admin: đăng bài và quản lý bài của giảng viên. Tạo trên 10 bài để thử phân trang.
6. Sinh viên/khách: chỉ xem bảng tin, không có nút đăng/sửa/xóa. Thông báo riêng của lớp không xuất hiện trong bảng tin công khai.
7. Tài khoản mới: đăng nhập vẫn về form đổi mật khẩu; bấm Trang chủ/Lớp học vẫn hiện lời nhắc bắt buộc đổi mật khẩu.
8. Trang đăng nhập: kiểm tra form ở giữa, nền đơn giản; bấm Quên mật khẩu/Cần hỗ trợ/Đóng hướng dẫn, dữ liệu đã nhập vẫn còn. Dùng Tab/Enter để thao tác hai mục hỗ trợ.

## Kết quả tự kiểm tra

- `node scripts/maven.mjs test`: 22 test, 0 lỗi/0 thất bại (có test mới cho thông báo).
- `npm.cmd run build:frontend`: build và kiểm tra TypeScript thành công.
- `node scripts/maven.mjs -DskipTests package`: đóng gói JAR thành công.
- API đọc thông báo trên backend chạy thật với H2 tạm trả HTTP 200 và danh sách rỗng đúng trạng thái ban đầu. HTTP trang chủ trả 200.

## Giả định

- Trang chủ là trang công khai. Chỉ nội dung được đăng riêng bằng nút Đăng thông báo ở trang chủ mới công khai.
- Dùng ba ảnh minh họa mẫu nội bộ để trang hoạt động không cần tải ảnh từ website khác. Chưa có ảnh sự kiện thực tế do người dùng cung cấp.
- Không thêm tự đăng ký: việc cấp tài khoản vẫn do admin quản lý như yêu cầu trước.
- Tên/vai trò tác giả được lưu tại thời điểm đăng, giúp giữ thông báo khi tài khoản tác giả bị xóa.

## Chưa kiểm chứng/rủi ro

- Chưa kiểm tra trực quan và thao tác bằng trình duyệt: browser access host không khả dụng; công cụ cửa sổ native báo cửa sổ Chrome/Edge đang thu nhỏ và không đọc được trạng thái sau khi thử mở lại.
- Cần kiểm tra trực quan desktop/mobile theo các bước ở trên; kiểm thử tự động backend không thay thế việc kiểm tra giao diện.
- Schema mới đã kiểm tra trên H2; chưa chạy trên MariaDB thực tế. Hệ thống triển khai cần quyền tạo bảng hoặc quản trị viên tạo bảng tương ứng trước khi chạy.
- Thông báo mới cập nhật khi tải trang hoặc bấm Làm mới, chưa đẩy thời gian thực.
