import { identityError } from './identityMessages';
const pairs = {
  template: ['Import template', 'Mẫu nhập dữ liệu'],
  usersV1: ['Accounts v1 · 5 columns', 'Tài khoản v1 · 5 cột'],
  usersV2: ['Accounts v2 · faculty, course, section', 'Tài khoản v2 · khoa, lớp, nhóm'],
  enrollments: ['Enrollments v1', 'Ghi danh v1'],
  duplicatePolicy: ['Existing enrollment policy', 'Xử lý ghi danh đã có'],
  upsert: ['Update matched enrollments', 'Cập nhật ghi danh khớp'],
  skip: ['Skip matched enrollments', 'Bỏ qua ghi danh khớp'],
  enrollmentHelp: [
    'Match an existing student by institutional ID, then username. Use the course UUID and an enrollment status: active, invited, withdrawn or completed. No password or global role changes.',
    'Đối chiếu sinh viên hiện có bằng mã định danh, sau đó tên đăng nhập. Dùng UUID lớp và trạng thái: active, invited, withdrawn hoặc completed. Không đổi mật khẩu hoặc vai trò toàn hệ thống.',
  ],
  extendedHelp: [
    'An optional course creates/updates student enrollment; new invited accounts receive invited enrollment. Leave course and section empty for staff accounts.',
    'Lớp tùy chọn sẽ tạo/cập nhật ghi danh sinh viên; tài khoản mới được mời có ghi danh invited. Để trống lớp và nhóm với tài khoản nhân sự.',
  ],
  source: ['Provisioning source', 'Nguồn tài khoản'],
  faculty: ['Faculty ID', 'Mã khoa'],
  course: ['Course UUID', 'UUID lớp'],
  anySource: ['All sources', 'Tất cả nguồn'],
  legacy: ['Existing / unknown source', 'Có sẵn / chưa rõ nguồn'],
  csv: ['CSV import', 'Nhập CSV'],
  invitation: ['Invitation', 'Lời mời'],
  bootstrap: ['Controlled bootstrap', 'Khởi tạo quản trị có kiểm soát'],
  exports: ['Export identifying data', 'Xuất dữ liệu định danh'],
  exportHelp: [
    'Exports include every record matching the current filters, up to 10,000 rows. They exclude passwords, MFA, private contact details and learning records. Preparation and each download are audited.',
    'Xuất mọi bản ghi khớp bộ lọc hiện tại, tối đa 10.000 dòng. Không gồm mật khẩu, MFA, liên hệ riêng tư hoặc kết quả học tập. Việc tạo và từng lượt tải đều được ghi audit.',
  ],
  exportReason: ['Reason for exporting', 'Lý do xuất dữ liệu'],
  exportKind: ['Data to export', 'Dữ liệu cần xuất'],
  accounts: ['Accounts', 'Tài khoản'],
  enrollmentData: ['Enrollments', 'Ghi danh'],
  format: ['File format', 'Định dạng tệp'],
  prepare: ['Prepare export', 'Chuẩn bị bản xuất'],
  preparing: ['Preparing…', 'Đang chuẩn bị…'],
  ready: ['Export is ready', 'Bản xuất đã sẵn sàng'],
  download: ['Download file', 'Tải tệp'],
  downloading: ['Downloading…', 'Đang tải…'],
  downloaded: ['File downloaded.', 'Đã tải tệp.'],
  expires: ['Download before', 'Tải trước'],
  count: ['Rows', 'Số dòng'],
  frozen: [
    'This export keeps its original selection. Filter changes apply to the next export. If selected data changes, prepare a new export.',
    'Bản xuất giữ lựa chọn lúc tạo. Đổi bộ lọc áp dụng cho lần tạo tiếp theo. Nếu dữ liệu đã thay đổi, hãy tạo bản xuất mới.',
  ],
  enrollmentFilters: [
    'Account status/source filters apply to the student account. The course filter includes all enrollment statuses in enrollment exports.',
    'Bộ lọc trạng thái/nguồn áp dụng cho tài khoản sinh viên. Khi xuất ghi danh, bộ lọc lớp gồm mọi trạng thái ghi danh.',
  ],
  export_expired: [
    'This export expired. Prepare a new one.',
    'Bản xuất đã hết hạn. Hãy tạo bản mới.',
  ],
  export_stale: [
    'The selected records changed. Prepare a new export.',
    'Các bản ghi đã thay đổi. Hãy tạo bản xuất mới.',
  ],
  export_not_found: [
    'This export is unavailable for your account.',
    'Tài khoản của bạn không được truy cập bản xuất này.',
  ],
  export_too_many_rows: [
    'More than 10,000 rows match. Narrow the filters and try again.',
    'Có hơn 10.000 dòng phù hợp. Hãy thu hẹp bộ lọc rồi thử lại.',
  ],
  invalid_enrollment: [
    'Check course, section, account identity and enrollment status.',
    'Kiểm tra lớp, nhóm, định danh tài khoản và trạng thái ghi danh.',
  ],
  ineligible_student: [
    'An active or invited student account is required.',
    'Cần tài khoản sinh viên đang hoạt động hoặc được mời.',
  ],
  account_not_found: [
    'Account not found; import the account first.',
    'Không tìm thấy tài khoản; hãy nhập tài khoản trước.',
  ],
  csv_header_invalid: [
    'Use the exact columns in the selected template.',
    'Dùng đúng các cột của mẫu đã chọn.',
  ],
  invalid_row: [
    'Invalid identity, role, faculty or course values.',
    'Thông tin định danh, vai trò, khoa hoặc lớp chưa hợp lệ.',
  ],
} as const;
export function provisioningCopy(locale: 'en' | 'vi', key: keyof typeof pairs): string {
  return pairs[key][locale === 'vi' ? 1 : 0];
}
export function provisioningError(locale: 'en' | 'vi', error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  return code in pairs
    ? provisioningCopy(locale, code as keyof typeof pairs)
    : identityError(locale, error);
}
