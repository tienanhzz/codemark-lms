'use client';
import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { translate, type Locale } from '../lib/courseApi';
import type { Quest } from './MissionsWorkspace';

export type Evidence = { id: string; userId: string; questCode: string; courseId: string | null; entityId: string; evidenceUrl: string; description: string; status: string; reviewNote: string | null };
type Field = [string, string, string, 'number' | 'text' | 'checkbox' | 'datetime-local'];
const fields: Record<string, Field[]> = {
  STU_QUIZ_PASS: [['correct_percent', 'Correct answers (%)', 'Tỷ lệ câu đúng (%)', 'number'], ['question_count', 'Number of questions', 'Số câu hỏi', 'number'], ['completed', 'Quiz completion verified', 'Đã xác minh hoàn thành Quiz', 'checkbox']],
  STU_PEER_REVIEW: [['content', 'Original feedback', 'Nội dung góp ý gốc', 'text'], ['peer_user_id', 'Reviewed student ID', 'ID sinh viên được đánh giá', 'text'], ['assigned', 'Assigned peer review verified', 'Đã xác minh phân công đánh giá', 'checkbox'], ['rubric_completed', 'Rubric completed', 'Đã chấm đủ rubric', 'checkbox']],
  STU_MILESTONE_DRAFT: [['submitted_at', 'Actual submission time', 'Thời điểm nộp thực tế', 'datetime-local'], ['deadline', 'Checkpoint deadline', 'Hạn nộp checkpoint', 'datetime-local'], ['checkpoint', 'Assigned checkpoint verified', 'Đã xác minh mốc kiểm tra được giao', 'checkbox']],
  STU_MODULE_100: [['required_documents', 'Required documents', 'Số tài liệu bắt buộc', 'number'], ['viewed_documents', 'Documents fully viewed', 'Số tài liệu đã xem hết', 'number'], ['required_assignments', 'Required assignments', 'Số bài tập bắt buộc', 'number'], ['submitted_assignments', 'Submitted assignments', 'Số bài tập đã nộp', 'number']],
  LEC_CASE_STUDY: [['is_new', 'New advanced material verified', 'Đã xác minh học liệu nâng cao mới', 'checkbox']],
  LEC_QUIZ_CREATE: [['question_count', 'Number of questions', 'Số câu hỏi', 'number'], ['published', 'Published quiz verified', 'Đã xác minh Quiz được công bố', 'checkbox']],
  LEC_CLASS_DISCIPLINE: [['total_students', 'Total students', 'Tổng số sinh viên', 'number'], ['ontime_students', 'Students submitting on time', 'Số sinh viên nộp đúng hạn', 'number'], ['major_lab', 'Major lab verified', 'Đã xác minh bài Lab lớn', 'checkbox']],
  LEC_TOP_RATING: [['average_rating', 'Average satisfaction (out of 5)', 'Điểm hài lòng trung bình (thang 5)', 'number'], ['response_count', 'Verified response count', 'Số phản hồi đã xác minh', 'number']],
};

export function QuestEvidencePanel({ locale, manage, items, evidence, selectedCode, onSubmitted, busy, execute }: { locale: Locale; manage: boolean; items: Quest[]; evidence: Evidence[]; selectedCode: string; onSubmitted: () => void; busy: boolean; execute: (operation: () => Promise<unknown>, message: string) => Promise<void> }) {
  const t = translate(locale);
  const [reviewing, setReviewing] = useState<Evidence | null>(null);
  const selected = items.find((item) => item.questCode === selectedCode && item.reviewRequired);
  const reviewQuest = reviewing && items.find((item) => item.questCode === reviewing.questCode);
  const submitProof = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    void execute(async () => { await api('/quests/evidence', 'POST', { questCode: selectedCode, entityId: data.get('entityId'), courseId: data.get('courseId') || null, evidenceUrl: data.get('evidenceUrl'), description: data.get('description') }); onSubmitted(); }, t('Evidence submitted for independent review. The mission remains pending until verified.', 'Đã gửi minh chứng để xét duyệt độc lập. Nhiệm vụ chỉ hoàn thành sau khi được xác minh.'));
  };
  const reviewProof = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!reviewing) return;
    const data = new FormData(event.currentTarget);
    const verifiedData: Record<string, unknown> = {};
    for (const [key, , , type] of fields[reviewing.questCode] || []) {
      const value = data.get(key);
      verifiedData[key] = type === 'checkbox' ? value === 'on' : type === 'number' ? Number(value) : type === 'datetime-local' && value ? new Date(String(value)).toISOString() : value;
    }
    if (reviewing.questCode === 'LEC_CASE_STUDY') verifiedData.resource_kind = 'advanced';
    void execute(async () => { await api(`/quests/evidence/${reviewing.id}/review`, 'POST', { decision: data.get('decision'), reviewNote: data.get('reviewNote'), verifiedData }); setReviewing(null); }, t('Review recorded.', 'Đã lưu kết quả xét duyệt.'));
  };
  return <>
    {!manage && selected && <form className="quest-action-panel" onSubmit={submitProof}><h3>{t('Submit mission evidence', 'Gửi minh chứng nhiệm vụ')}: {selected.questName}</h3><p>{t('This workflow requires an independent reviewer. Submit original work and supporting records; submitting evidence alone does not complete the mission.', 'Hoạt động này cần người xét duyệt độc lập. Gửi bài làm gốc và hồ sơ liên quan; việc gửi minh chứng chưa được tính hoàn thành.')}</p><div className="report-form-grid"><label className="course-field"><span>{t('Assignment / entity reference', 'Mã bài / đối tượng được xác minh')}</span><input name="entityId" required maxLength={160} /></label><label className="course-field"><span>{t('Course ID (required for course-specific missions)', 'ID khóa học (bắt buộc với nhiệm vụ theo môn/lớp)')}</span><input name="courseId" maxLength={36} required={selectedCode.startsWith('LEC_')} /></label><label className="course-field"><span>{t('Original evidence URL', 'Liên kết minh chứng gốc')}</span><input name="evidenceUrl" type="url" pattern="https://.*" required maxLength={2000} /></label><label className="course-field"><span>{t('Evidence description', 'Mô tả minh chứng')}</span><textarea name="description" required minLength={30} maxLength={4000} /></label></div><button className="button primary" type="submit" disabled={busy}>{t('Send for review', 'Gửi xét duyệt')}</button></form>}
    {evidence.length > 0 && <div className="quest-evidence-list"><h3>{manage ? t('Independent evidence reviews', 'Xét duyệt minh chứng độc lập') : t('My evidence requests', 'Minh chứng đã gửi')}</h3>{evidence.map((proof) => <article className="quest-evidence-card" key={proof.id}><div><strong>{proof.questCode}</strong><span className="state-badge">{proof.status === 'pending' ? t('Pending independent review', 'Chờ xét duyệt độc lập') : proof.status === 'approved' ? t('Verified', 'Đã xác minh') : t('Rejected', 'Chưa đạt')}</span></div><p>{proof.description}</p><a className="text-link" href={proof.evidenceUrl} target="_blank" rel="noreferrer">{t('View original evidence', 'Xem minh chứng gốc')}</a>{proof.status === 'pending' && <p>{t('Progress updates after an authorized reviewer checks the original evidence.', 'Tiến độ được cập nhật sau khi người có quyền đối chiếu minh chứng gốc.')}</p>}{proof.reviewNote && <p>{t('Reviewer feedback: ', 'Nhận xét xét duyệt: ')}{proof.reviewNote}</p>}{manage && proof.status === 'pending' && <button className="button secondary" type="button" onClick={() => setReviewing(proof)}>{t('Review evidence', 'Xét duyệt minh chứng')}</button>}</article>)}</div>}
    {reviewing && manage && <form className="quest-action-panel" onSubmit={reviewProof} key={reviewing.id}><h3>{t('Review original evidence', 'Đối chiếu minh chứng gốc')} · {reviewing.questCode}</h3>{reviewQuest && <p>{reviewQuest.conditionDesc} · {reviewQuest.limitRule}</p>}<p>{t('Verify these facts against the linked records. Reviews are recorded with your identity. You cannot review your own request.', 'Đối chiếu các dữ kiện bên dưới với hồ sơ gốc. Kết quả được lưu theo danh tính người duyệt; không được tự duyệt minh chứng của mình.')}</p><div className="report-form-grid">{(fields[reviewing.questCode] || []).map(([key, en, vi, type]) => <label className={type === 'checkbox' ? 'quest-checkbox' : 'course-field'} key={key}>{type === 'checkbox' ? <><input type="checkbox" name={key} />{t(en, vi)}</> : <><span>{t(en, vi)}</span>{key === 'content' ? <textarea name={key} /> : <input name={key} type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined} />}</>}</label>)}<label className="course-field"><span>{t('Decision', 'Kết quả')}</span><select name="decision"><option value="rejected">{t('Does not meet the condition', 'Chưa đạt điều kiện')}</option><option value="approved">{t('Evidence verified and meets the condition', 'Đã đối chiếu và đạt điều kiện')}</option></select></label><label className="course-field"><span>{t('Review explanation', 'Nhận xét đối chiếu')}</span><textarea name="reviewNote" required minLength={30} maxLength={4000} /></label></div><button className="button primary" type="submit" disabled={busy}>{t('Record review', 'Lưu xét duyệt')}</button> <button className="button secondary" type="button" onClick={() => setReviewing(null)}>{t('Cancel', 'Hủy')}</button></form>}
  </>;
}
