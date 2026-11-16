# EXP theo lớp

EXP và rank được tính riêng theo từng lớp và mùa. Mốc 0–150 dùng cân chỉnh điểm mẫu hiện tại; không giới hạn EXP tích lũy.

Bài đạt ít nhất 50% nhận một lần: easy 2, medium 3, hard 4, expert 5 EXP. Từ tuần hoạt động liên tiếp thứ hai, thưởng 2 EXP mỗi tuần mỗi lớp. Tuần bắt đầu thứ Hai, múi giờ Asia/Ho_Chi_Minh.

Mỗi lớp chọn lịch ngày/tuần (mặc định tuần). Bài luyện tập nội bộ và quiz ngoài dùng chung một lịch; bài thi không chiếm lịch luyện tập.

All hiển thị các lớp theo tên/mã và top 5. Chọn lớp hiển thị toàn bộ sinh viên. Mỗi dòng: STT, tên và mã đầy đủ, EXP, ảnh rank. Rank theo vị trí: Master 1, Ruby 2, Diamond 3, Gold 4–5, Silver 6–10, Bronze từ 11.

Lệnh `npm run seed:rank` cân chỉnh điểm demo về 0–150 theo lớp, có thể chạy lại. Điểm lịch sử chưa gắn lớp được giữ trong sổ cái và không được cộng vào mọi lớp. Sao lưu database trước khi chạy seed. Không chạy seed khi backend đang mở database H2.

Điểm mẫu và thứ tự sinh viên được phân bố ổn định riêng theo từng lớp, thay vì sao chép cùng một bảng điểm. Seed chỉ thêm bút toán chênh lệch cho nguồn demo; điểm bài làm và điểm điều chỉnh thủ công được giữ nguyên. Sinh viên có thể có EXP bằng nhau một cách hợp lệ; hệ thống không ép điểm học tập thật phải khác nhau.

Kiểm tra giao diện dùng dữ liệu mô phỏng trên Edge: All hai lớp/top 5, chọn lớp tải 125 sinh viên, mã đầy đủ, mobile 390×844 không tràn ngang. Đây là kiểm tra UI, không thay thế kiểm tra API/database thật.
