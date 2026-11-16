import { selfError } from './selfServiceMessages';
const pairs = {
  support: ['Profile support', 'Hỗ trợ hồ sơ'],
  supportHelp: [
    'Support staff can edit contact details, biography and academic title with a recorded reason. Official identity, password, MFA, nickname and privacy settings stay with their authorized workflows.',
    'Nhân viên hỗ trợ được sửa liên hệ, giới thiệu và học hàm/học vị với lý do được ghi nhận. Danh tính chính thức, mật khẩu, MFA, biệt danh và thiết lập riêng tư được quản lý qua luồng có thẩm quyền riêng.',
  ],
  search: [
    'Search name, username or institutional ID',
    'Tìm họ tên, tên đăng nhập hoặc mã định danh',
  ],
  find: ['Search', 'Tìm kiếm'],
  open: ['Open profile', 'Mở hồ sơ'],
  reason: ['Reason for accessing or changing this profile', 'Lý do truy cập hoặc thay đổi hồ sơ'],
  access: ['Access profile and record reason', 'Mở hồ sơ và ghi nhận lý do'],
  auditHelp: [
    'Opening private profile fields and saving changes are audited. Academic title may appear in course staff profiles.',
    'Việc mở trường hồ sơ riêng tư và lưu thay đổi đều được ghi audit. Học hàm/học vị có thể xuất hiện trong hồ sơ giảng viên của lớp.',
  ],
  readOnly: [
    'This account is read-only for profile support.',
    'Tài khoản này chỉ cho phép xem hồ sơ hỗ trợ.',
  ],
  profile_support_read_only: [
    'Only active or invited accounts can be edited here.',
    'Chỉ tài khoản đang hoạt động hoặc được mời mới được sửa tại đây.',
  ],
  image: ['Profile image', 'Ảnh hồ sơ'],
  imageHelp: [
    'Choose PNG, JPEG or WebP up to 2 MB and 2048 pixels per side. Adjust the square crop before saving. A sanitized static image is stored; assigned staff photos are visible to authorized course members.',
    'Chọn PNG, JPEG hoặc WebP tối đa 2 MB và 2048 pixel mỗi cạnh. Điều chỉnh vùng cắt vuông trước khi lưu. Hệ thống chỉ lưu ảnh tĩnh đã xử lý; ảnh giảng viên được hiển thị cho thành viên có quyền xem lớp.',
  ],
  choose: ['Choose image', 'Chọn ảnh'],
  zoom: ['Zoom', 'Phóng to'],
  horizontal: ['Horizontal position', 'Vị trí ngang'],
  vertical: ['Vertical position', 'Vị trí dọc'],
  crop: ['Preview square crop', 'Xem trước vùng cắt vuông'],
  upload: ['Save profile image', 'Lưu ảnh hồ sơ'],
  remove: ['Remove profile image', 'Xóa ảnh hồ sơ'],
  removeHelp: [
    'Remove your current image? It will stop appearing in authorized course staff profiles.',
    'Xóa ảnh hiện tại? Ảnh sẽ không còn hiển thị trong hồ sơ giảng viên được cấp quyền xem.',
  ],
  noImage: ['No profile image.', 'Chưa có ảnh hồ sơ.'],
  imageUnavailable: [
    'The image is unavailable. Reload your profile.',
    'Ảnh không khả dụng. Hãy tải lại hồ sơ.',
  ],
  imageInvalid: [
    'Choose a valid PNG, JPEG or WebP file with a matching extension.',
    'Chọn tệp PNG, JPEG hoặc WebP hợp lệ và đúng phần mở rộng.',
  ],
  imageLarge: [
    'The image is too large. Choose a smaller image.',
    'Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn.',
  ],
  avatar_invalid: [
    'This image could not be validated. Choose another file.',
    'Không xác thực được ảnh. Hãy chọn tệp khác.',
  ],
  avatar_png_required: [
    'The submitted crop must be a PNG image.',
    'Vùng cắt gửi lên phải là ảnh PNG.',
  ],
  avatar_dimensions_invalid: [
    'The submitted image must be a static square crop.',
    'Ảnh gửi lên phải là vùng cắt vuông, tĩnh.',
  ],
  avatar_too_large: [
    'The prepared image is too large. Choose a smaller image.',
    'Ảnh sau xử lý quá lớn. Hãy chọn ảnh nhỏ hơn.',
  ],
  profile_revision_required: [
    'Reload your profile before changing the image.',
    'Tải lại hồ sơ trước khi đổi ảnh.',
  ],
  discard: ['Discard crop', 'Bỏ vùng cắt'],
  team: ['Teaching team', 'Đội ngũ giảng dạy'],
  teamHelp: [
    'Only currently assigned staff are shown. Institutional email follows each person’s privacy setting. Course links include only courses you can access.',
    'Chỉ hiển thị nhân sự đang được phân công. Email chính thức tuân theo thiết lập riêng tư của từng người. Liên kết lớp chỉ gồm các lớp bạn được phép truy cập.',
  ],
  hiddenEmail: ['Email is private', 'Email được giữ riêng tư'],
  owner: ['Course owner', 'Chủ nhiệm lớp'],
  more: ['Load more', 'Xem thêm'],
  empty: ['No matching records.', 'Không có bản ghi phù hợp.'],
  visibleCourses: ['Courses you can access', 'Các lớp bạn được phép xem'],
  limitedCourses: [
    'Showing the first 25 accessible courses.',
    'Đang hiển thị 25 lớp được phép xem đầu tiên.',
  ],
} as const;
export function profileCopy(locale: 'en' | 'vi', key: keyof typeof pairs): string {
  return pairs[key][locale === 'vi' ? 1 : 0];
}
export function profileError(locale: 'en' | 'vi', error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  return code in pairs ? profileCopy(locale, code as keyof typeof pairs) : selfError(locale, error);
}
