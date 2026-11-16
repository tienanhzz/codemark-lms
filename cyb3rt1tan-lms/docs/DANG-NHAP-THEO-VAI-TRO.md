# Đăng nhập theo vai trò

- **Student:** dùng mã sinh viên đã được gán trong `institutional_id` và mật khẩu
  CodeMark. Không dùng email hoặc username nội bộ để thay cho mã sinh viên.
- **Teacher:** dùng địa chỉ Gmail/email đã đăng ký trong tài khoản và mật khẩu
  CodeMark riêng. Email được so khớp không phân biệt chữ hoa/chữ thường và bỏ khoảng
  trắng đầu/cuối; không tự gộp địa chỉ có dấu chấm hoặc dấu cộng.
- **Admin và nhân sự khác:** tiếp tục dùng tên đăng nhập. Tài khoản có cả quyền
  Student và Teacher vẫn dùng mã sinh viên; Admin kiêm Teacher vẫn giữ cách đăng
  nhập Admin.

Đây là đăng nhập vào CodeMark bằng email làm định danh, không phải đăng nhập Google
OAuth hay sử dụng mật khẩu của hộp thư Gmail. Tài khoản phải hoạt động, mật khẩu
phải đúng và chính sách MFA hiện có vẫn được áp dụng. Định danh trùng giữa nhiều
tài khoản bị từ chối an toàn.

Hai vai trò được cấp bằng các tài khoản riêng, không tự cấp quyền Admin, không
thay mật khẩu hoặc mở khóa những tài khoản cũ. Mật khẩu của tài khoản được tạo
trên máy này nằm trong tệp có quyền truy cập riêng dưới `.local/credentials/`,
không đưa lên Git. Địa chỉ Gmail của Teacher phải do người dùng chỉ định; không
tạo địa chỉ Gmail giả hoặc tạo hộp thư Google tự động.
