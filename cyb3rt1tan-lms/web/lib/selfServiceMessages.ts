import { identityError } from './identityMessages';

const pairs = {
  forgot: ['Forgot password?', 'Quên mật khẩu?'],
  recovery: ['Recover your account', 'Khôi phục tài khoản'],
  recoveryHelp: [
    'Enter your institutional email to request a one-time recovery link.',
    'Nhập email chính thức để yêu cầu liên kết khôi phục dùng một lần.',
  ],
  reset: ['Set a new password', 'Đặt mật khẩu mới'],
  resetHelp: [
    'Use 12–128 characters. All sessions will end after the reset; MFA remains enabled.',
    'Dùng 12–128 ký tự. Mọi phiên sẽ kết thúc sau khi đổi mật khẩu; MFA vẫn được giữ nguyên.',
  ],
  email: ['Institutional email', 'Email chính thức'],
  send: ['Send recovery instructions', 'Gửi hướng dẫn khôi phục'],
  sent: [
    'If an eligible account exists, recovery instructions will be sent. Check your inbox and spam folder.',
    'Nếu có tài khoản phù hợp, hướng dẫn khôi phục sẽ được gửi. Hãy kiểm tra hộp thư đến và thư rác.',
  ],
  unavailable: [
    'Email recovery is unavailable until the administrator configures SMTP. Contact your administrator.',
    'Khôi phục qua email chưa khả dụng vì chưa cấu hình SMTP. Hãy liên hệ quản trị viên.',
  ],
  complete: [
    'Your password has been changed. Sign in again with your new password and MFA if enabled.',
    'Đã đổi mật khẩu. Hãy đăng nhập lại bằng mật khẩu mới và MFA nếu đã bật.',
  ],
  checking: ['Checking availability…', 'Đang kiểm tra dịch vụ…'],
  busy: ['Please wait…', 'Đang xử lý…'],
  back: ['Back to sign in', 'Về đăng nhập'],
  newPassword: ['New password', 'Mật khẩu mới'],
  confirmation: ['Confirm new password', 'Xác nhận mật khẩu mới'],
  confirmMismatch: ['The passwords do not match.', 'Hai mật khẩu chưa khớp.'],
  invalid_reset_token: [
    'This recovery link is invalid, expired or already used. Request a new link.',
    'Liên kết không hợp lệ, đã hết hạn hoặc đã dùng. Hãy yêu cầu liên kết mới.',
  ],
  password_must_differ: [
    'Choose a password different from your current password.',
    'Chọn mật khẩu khác với mật khẩu hiện tại.',
  ],
  passwordInvalid: [
    'Use 12–128 characters; the password cannot contain only spaces.',
    'Dùng 12–128 ký tự; mật khẩu không được chỉ chứa khoảng trắng.',
  ],
  reload: ['Reload', 'Tải lại'],
  save: ['Save changes', 'Lưu thay đổi'],
  saved: ['Changes saved.', 'Đã lưu thay đổi.'],
  profile: ['Personal profile', 'Hồ sơ cá nhân'],
  officialHelp: [
    'Official name, username, institutional ID and email are managed by your institution.',
    'Họ tên chính thức, tên đăng nhập, mã định danh và email do đơn vị quản lý.',
  ],
  nickname: ['Nickname', 'Biệt danh'],
  nicknameHelp: [
    '3–32 letters/numbers, spaces, dots, underscores or hyphens. Unique across CodeMark.',
    '3–32 ký tự chữ/số, khoảng trắng, dấu chấm, gạch dưới hoặc gạch ngang. Duy nhất trên CodeMark.',
  ],
  nextChange: ['Next nickname change allowed', 'Có thể đổi biệt danh từ'],
  contactEmail: ['Contact email (optional)', 'Email liên hệ (tùy chọn)'],
  contactHelp: [
    'Contact details are private and do not replace your sign-in or recovery identity.',
    'Thông tin liên hệ là riêng tư và không thay thế thông tin đăng nhập hoặc khôi phục.',
  ],
  phone: ['Phone (optional)', 'Điện thoại (tùy chọn)'],
  about: ['About you', 'Giới thiệu'],
  academicTitle: ['Academic title', 'Học hàm / học vị'],
  showEmail: [
    'Allow my institutional email to appear in my course staff profile',
    'Cho phép hiển thị email chính thức trong hồ sơ giảng viên của lớp',
  ],
  avatarUnavailable: [
    'Profile image upload awaits the protected media service.',
    'Tải ảnh hồ sơ đang chờ dịch vụ lưu trữ ảnh có kiểm soát quyền truy cập.',
  ],
  upload: ['Upload profile image', 'Tải ảnh hồ sơ'],
  nickname_cooldown: [
    'Your nickname is in its cooldown period. Reload to see the next allowed change.',
    'Biệt danh đang trong thời gian chờ. Tải lại để xem thời điểm được đổi tiếp.',
  ],
  invalid_nickname: [
    'Check the nickname format: 3–32 supported characters.',
    'Kiểm tra định dạng biệt danh: 3–32 ký tự được hỗ trợ.',
  ],
  nickname_blocked: [
    'This nickname is reserved or blocked by policy. Choose another.',
    'Biệt danh này được dành riêng hoặc bị chặn theo chính sách. Hãy chọn tên khác.',
  ],
  nickname_unavailable: ['This nickname is already taken.', 'Biệt danh đã có người sử dụng.'],
  sessions: ['Active sessions', 'Các phiên đang hoạt động'],
  sessionHelp: [
    'Confirm your current password to end a session. Ending this session signs you out.',
    'Xác nhận mật khẩu hiện tại để kết thúc phiên. Kết thúc phiên này sẽ đăng xuất bạn.',
  ],
  current: ['This session', 'Phiên hiện tại'],
  other: ['Other session', 'Phiên khác'],
  created: ['Signed in', 'Đăng nhập lúc'],
  expires: ['Expires', 'Hết hạn'],
  end: ['End session', 'Kết thúc phiên'],
  ended: ['Session ended.', 'Đã kết thúc phiên.'],
  currentPassword: ['Current password', 'Mật khẩu hiện tại'],
  cancel: ['Cancel', 'Hủy'],
  noSessions: ['No active sessions.', 'Không có phiên đang hoạt động.'],
  session_not_found: [
    'The session has already ended. Reload the list.',
    'Phiên đã kết thúc. Hãy tải lại danh sách.',
  ],
  policy: ['Nickname policy', 'Chính sách biệt danh'],
  policyHelp: [
    'Reserved system names are always blocked. Changing this policy does not rename existing users.',
    'Tên dành riêng cho hệ thống luôn bị chặn. Đổi chính sách không tự đổi tên người dùng hiện có.',
  ],
  cooldown: ['Days between nickname changes', 'Số ngày chờ giữa các lần đổi biệt danh'],
  blocked: ['Blocked terms (one per line)', 'Từ bị chặn (mỗi dòng một từ)'],
  blockedHelp: [
    'Up to 200 terms, 1–64 characters each. Matching ignores case and Unicode width.',
    'Tối đa 200 từ, mỗi từ 1–64 ký tự. Đối chiếu không phân biệt hoa/thường và dạng Unicode.',
  ],
  reason: ['Reason for this policy change', 'Lý do đổi chính sách'],
} as const;

type Key = keyof typeof pairs;
export function selfCopy(locale: 'en' | 'vi', key: Key): string {
  return pairs[key][locale === 'vi' ? 1 : 0];
}
export function selfError(locale: 'en' | 'vi', error: unknown): string {
  const key = error instanceof Error ? error.message : '';
  return key in pairs ? selfCopy(locale, key as Key) : identityError(locale, error);
}
