import { api } from './api';
export type Locale = 'en' | 'vi';
export type Module = {
  moduleCode: string;
  moduleName: string;
  level: string;
  unitOfCredit: number;
  prerequisites: string[];
  suggestedStudyHours: number;
  objectives: string[];
  year: string;
  nature: string;
};
export type Course = {
  id: string;
  courseCode: string;
  title: string;
  facultyId: string | null;
  termId: string;
  timezone: string;
  module: Module;
  ownerId: string;
  status: string;
  revision: number;
  permissions: string[];
};
export type Faculty = {
  facultyId: string;
  names: Record<string, string>;
  sortOrder: number;
  status: string;
};
export type Term = {
  termCode: string;
  name: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: string;
};
export type Person = { userId: string; username: string; officialName: string };
export type Staff = Person & { staffRole: string; permissions: string[] };
export type Member = Person & { status: string; sectionId: string | null };
export type Grant = {
  id: string;
  userId: string;
  permissionKey: string;
  startsAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
};
export type PlanEntry = {
  entryId?: string;
  week: string;
  topic: string;
  content: string;
  reading: string;
  outcomes: string[];
  estimatedHours: number;
  position: number;
  lessonVersionId?: string | null;
  tagIds?: string[];
};
export type TeachingSession = {
  id: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  sectionId: string | null;
  room: string | null;
  onlineUrl: string | null;
  lessonPlanEntryId: string | null;
  status: 'scheduled' | 'cancelled';
  recurrenceSeriesId: string | null;
  recurrenceIndex: number | null;
};
export type CourseResource = {
  id?: string;
  kind: 'learningResource' | 'usefulUrl' | 'software';
  title: string;
  note: string;
  coverage: string;
  url: string | null;
  position: number;
};
export type GradeScheme = {
  id: string | null;
  version: number;
  components: { componentId: string; name: string; weight: number; description: string }[];
  bands: { minimumScore: number; label: string }[];
  active: boolean;
};
export type Rule = {
  ruleId: string;
  category: string;
  title: string;
  body: string;
  position: number;
  source?: string;
};
export type Override =
  | { ruleId: string; action: 'disable' }
  | { ruleId: string; action: 'override'; title: string; body: string };
export type Rules = {
  templateVersion: number;
  revision: number;
  rules: Rule[];
  sharedRules: Rule[];
  customRules: Rule[];
  overrides: Override[];
};
export type Template = { id: string | null; version: number; rules: Rule[]; active: boolean };
export const emptyModule: Module = {
  moduleCode: '',
  moduleName: '',
  level: '',
  unitOfCredit: 0,
  prerequisites: [],
  suggestedStudyHours: 0,
  objectives: [],
  year: '',
  nature: '',
};
export const translate = (locale: Locale) => (en: string, vi: string) =>
  locale === 'vi' ? vi : en;
export const states: Record<string, [string, string]> = {
  draft: ['Draft', 'Bản nháp'],
  active: ['Active', 'Đang hoạt động'],
  completed: ['Completed', 'Đã hoàn thành'],
  archived: ['Archived', 'Lưu trữ'],
  invited: ['Invited', 'Đã mời'],
  withdrawn: ['Withdrawn', 'Đã rút'],
  retired: ['Retired', 'Ngừng sử dụng'],
};
export const stateName = (state: string, locale: Locale) =>
  states[state]?.[locale === 'vi' ? 1 : 0] || state;
export function courseWrite<T>(
  course: Course,
  path: string,
  method: string,
  body: unknown,
): Promise<T> {
  return api<T>(`/courses/${course.id}${path}`, method, body, {
    'If-Match': `"${course.revision}"`,
  });
}
export function courseError(error: unknown, locale: Locale): string {
  const code = error instanceof Error ? error.message : '';
  const errors: Record<string, [string, string]> = {
    question_not_found: ['This question is not available in the selected course.', 'Không tìm thấy câu hỏi trong khóa học đã chọn.'],
    question_version_not_found: ['This question version is not available.', 'Không tìm thấy phiên bản câu hỏi này.'],
    active_question_category_required: ['Choose an active question category.', 'Hãy chọn danh mục câu hỏi đang hoạt động.'],
    active_question_tags_required: ['One or more selected tags are retired or unavailable.', 'Một hoặc nhiều thẻ đã chọn đã ngừng hoặc không còn khả dụng.'],
    question_tag_not_applicable: ['One or more selected tags do not apply to this question type.', 'Một hoặc nhiều thẻ không áp dụng cho loại câu hỏi này.'],
    question_retired: ['Retired questions cannot receive new versions.', 'Câu hỏi đã ngừng không thể tạo phiên bản mới.'],
    question_version_not_draft: ['Only Draft versions can be validated.', 'Chỉ bản nháp mới được xác thực.'],
    question_must_validate_before_publish: ['Validate this version successfully before publishing.', 'Hãy xác thực phiên bản thành công trước khi công bố.'],
    code_publication_disabled: ['Code question publication and execution are disabled.', 'Chưa bật công bố hoặc thực thi câu hỏi lập trình.'],
    listening_assets_not_ready: ['Protected listening assets are not configured yet.', 'Tài sản nghe bảo vệ chưa được cấu hình.'],
    invalid_question_type: ['Choose a supported question type.', 'Hãy chọn loại câu hỏi được hỗ trợ.'],
    runtime_profile_invalid: ['The profile metadata does not match the required immutable profile schema.', 'Metadata cấu hình chưa khớp schema cấu hình bất biến.'],
    taxonomy_cycle: [
      'This parent change would create a cycle.',
      'Thay đổi mục cha này sẽ tạo thành chu kỳ.',
    ],
    active_taxonomy_parent_required: [
      'Choose an active parent from the same taxonomy tree.',
      'Chọn mục cha đang hoạt động trong cùng cây phân loại.',
    ],
    taxonomy_has_active_children: [
      'Move or retire active child entries before retiring this entry.',
      'Hãy chuyển hoặc ngừng các mục con đang hoạt động trước.',
    ],
    taxonomy_id_exists: [
      'That stable ID is already in use in this taxonomy.',
      'ID ổn định này đã được dùng trong cây phân loại.',
    ],
    taxonomy_node_not_found: ['This taxonomy entry no longer exists.', 'Mục phân loại này không còn tồn tại.'],
    taxonomy_patch_empty: ['Make a change before saving.', 'Hãy thay đổi thông tin trước khi lưu.'],
    taxonomy_catalog_version_conflict: ['The catalog changed. Reload before importing.', 'Danh mục đã thay đổi. Hãy tải lại trước khi nhập.'],
    taxonomy_catalog_not_empty: ['Starter import is available only while both taxonomy trees are empty.', 'Chỉ có thể nhập danh mục mẫu khi cả hai cây phân loại còn trống.'],
    taxonomy_seed_invalid_hierarchy: ['The starter catalog contains an invalid parent hierarchy.', 'Danh mục mẫu có cấu trúc mục cha không hợp lệ.'],
    taxonomy_merge_requires_active_nodes: ['Choose active source and target entries.', 'Hãy chọn mục nguồn và đích đang hoạt động.'],
    taxonomy_merge_target_same: ['Choose a different surviving entry.', 'Hãy chọn mục khác để giữ lại.'],
    taxonomy_node_already_redirected: ['This entry already redirects to another taxonomy ID.', 'Mục này đã chuyển hướng sang ID phân loại khác.'],
    question_asset_too_large: ['Question assets are limited to 2 MB.', 'Tài nguyên câu hỏi giới hạn 2 MB.'],
    question_asset_mime_mismatch: ['The selected file type does not match this asset.', 'Định dạng tệp không khớp loại tài nguyên.'],
    question_audio_invalid: ['The audio file could not be verified.', 'Không xác minh được tệp âm thanh.'],
    question_image_invalid: ['The image file could not be decoded safely.', 'Không giải mã an toàn được tệp ảnh.'],
    stale_course: [
      'This course changed. Reload before saving again. Your unsaved form remains open.',
      'Khóa học đã thay đổi. Tải lại trước khi lưu. Biểu mẫu chưa lưu vẫn được giữ.',
    ],
    stale_rule_template: [
      'Shared rules changed. Reload before applying overrides.',
      'Nội quy chung đã đổi. Tải lại trước khi lưu tùy chỉnh.',
    ],
    course_read_only: [
      'Completed and archived courses are read-only.',
      'Khóa học đã hoàn thành hoặc lưu trữ chỉ cho phép xem.',
    ],
    active_catalog_required: [
      'Choose an active faculty and academic term.',
      'Chọn khoa và học kỳ đang hoạt động.',
    ],
    scheduled_plan_entry_required: [
      'An entry linked to a teaching session cannot be removed.',
      'Không thể xóa mục đã liên kết với lịch dạy.',
    ],
    course_code_exists: ['This course code is already in use.', 'Mã khóa học đã được sử dụng.'],
    already_enrolled: [
      'This student is already enrolled or invited.',
      'Sinh viên đã được ghi danh hoặc mời.',
    ],
    template_would_orphan_override: [
      'Activation would remove a rule used by course overrides. Retain its stable ID.',
      'Kích hoạt sẽ xóa nội quy đang được khóa học tùy chỉnh. Hãy giữ ID ổn định.',
    ],
    timezone_offset_mismatch: [
      'The timestamp offset must match the named timezone.',
      'Độ lệch thời gian phải khớp múi giờ đã chọn.',
    ],
    recurrence_hits_dst_gap: [
      'This recurring schedule includes a local time that does not exist when clocks change. Adjust the start time or series.',
      'Lịch lặp có giờ địa phương không tồn tại khi đổi giờ. Hãy đổi giờ bắt đầu hoặc chuỗi lịch.',
    ],
    invalid_session_duration: [
      'A session must end after it starts and cannot exceed one day.',
      'Buổi học phải kết thúc sau giờ bắt đầu và không thể dài quá một ngày.',
    ],
    grade_weights_must_total_100: [
      'Assessment weights must total exactly 100% before publishing.',
      'Tổng trọng số đánh giá phải bằng 100% trước khi công bố.',
    ],
    resource_url_required: [
      'A useful link needs an HTTPS URL.',
      'Liên kết hữu ích cần có URL HTTPS.',
    ],
    https_url_required: [
      'Use a secure HTTPS URL.',
      'Hãy dùng địa chỉ HTTPS an toàn.',
    ],
    invalid_time_range: [
      'The end must be after the start.',
      'Thời gian kết thúc phải sau bắt đầu.',
    ],
    validation_failed: [
      'Check the values, limits and required fields.',
      'Kiểm tra giá trị, giới hạn và các trường bắt buộc.',
    ],
    course_not_found: [
      'Course unavailable or your access has ended.',
      'Khóa học không tồn tại hoặc quyền truy cập đã hết.',
    ],
    course_owner_protected: [
      'Transfer ownership before removing the owner.',
      'Chuyển chủ khóa học trước khi gỡ chủ hiện tại.',
    ],
    permission_not_allowlisted: [
      'This permission cannot be granted.',
      'Không được phép cấp quyền này.',
    ],
    active_role_required: [
      'The selected account needs the active matching role.',
      'Tài khoản phải hoạt động và có đúng vai trò.',
    ],
    catalog_id_exists: ['This catalog ID already exists.', 'ID danh mục đã tồn tại.'],
    duplicate_entry: [
      'Rule IDs and entry positions must be unique.',
      'ID nội quy và vị trí mục không được trùng.',
    ],
  };
  return (
    errors[code]?.[locale === 'vi' ? 1 : 0] ||
    translate(locale)(
      'Unable to complete this action. Reload or check your permission.',
      'Không thể hoàn tất thao tác. Hãy tải lại hoặc kiểm tra quyền truy cập.',
    )
  );
}
export function displayDate(value: string, locale: Locale, timezone: string): string {
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
}
// datetime-local represents a wall time. Convert with the selected IANA zone,
// preserving that zone's offset; reject gaps and ambiguous fall-back times.
export function zonedIso(wall: string, timezone: string): string {
  const desired = Date.parse(wall + 'Z');
  if (!Number.isFinite(desired)) throw new Error('validation_failed');
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const localAt = (ms: number) => {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
    );
    return Date.parse(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`,
    );
  };
  const offsets = new Set(
    [-86400000, 0, 86400000].map((delta) => localAt(desired + delta) - (desired + delta)),
  );
  const candidates = [...offsets]
    .map((offset) => desired - offset)
    .filter((ms) => localAt(ms) === desired);
  if (candidates.length !== 1) throw new Error('timezone_offset_mismatch');
  const ms = candidates[0],
    offset = (desired - ms) / 60000,
    sign = offset < 0 ? '-' : '+';
  return `${wall.length === 16 ? wall + ':00' : wall}${sign}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')}`;
}

export function wallTime(iso: string, timezone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
