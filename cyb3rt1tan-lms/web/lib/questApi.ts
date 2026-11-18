import { courseError, type Locale } from './courseApi';

export function questError(error: unknown, locale: Locale): string {
  const code = error instanceof Error ? error.message : '';
  const messages: Record<string, [string, string]> = {
    document_minimum_30_seconds: ['Read the document for at least 30 seconds before recording progress.', 'Hãy đọc tài liệu tối thiểu 30 giây trước khi ghi nhận tiến độ.'],
    verified_evidence_does_not_meet_condition: ['The verified facts do not meet this mission’s completion condition. Check the original evidence and thresholds.', 'Dữ kiện đã đối chiếu chưa đạt điều kiện nhiệm vụ. Hãy kiểm tra minh chứng gốc và các ngưỡng yêu cầu.'],
    course_and_term_must_have_ended: ['This course and its academic term must have ended before rating evidence can be approved.', 'Khóa học phải hoàn tất và học kỳ phải kết thúc trước khi duyệt minh chứng đánh giá hài lòng.'],
    evidence_entity_already_approved: ['This work has already been verified. The same work cannot earn another reward.', 'Bài/đối tượng này đã được xác minh. Cùng một minh chứng không được nhận thưởng lặp lại.'],
    evidence_already_reviewed: ['This request has already been reviewed. Refresh to see its result.', 'Minh chứng đã được xét duyệt. Tải lại để xem kết quả.'],
    course_reviewer_required: ['Only an authorized reviewer in the linked course can review this student evidence.', 'Chỉ người được phân quyền xét duyệt trong khóa học liên kết mới được duyệt minh chứng này.'],
    independent_authorized_reviewer_required: ['An independent authorized reviewer is required. You cannot review your own evidence.', 'Cần người xét duyệt độc lập có quyền phù hợp. Không được tự xét duyệt minh chứng của mình.'],
    stale_quest_revision: ['This mission was edited by someone else. Refresh before saving again.', 'Nhiệm vụ đã được người khác chỉnh sửa. Tải lại trước khi lưu tiếp.'],
    https_evidence_required: ['Provide an HTTPS link to the original evidence.', 'Hãy cung cấp liên kết HTTPS đến minh chứng gốc.'],
    trusted_activity_required: ['Complete this mission in its learning activity page. It is verified from system activity.', 'Hãy thực hiện nhiệm vụ ở trang hoạt động tương ứng. Hệ thống xác minh từ hoạt động thực tế.'],
  };
  return messages[code]?.[locale === 'vi' ? 1 : 0] || courseError(error, locale);
}
