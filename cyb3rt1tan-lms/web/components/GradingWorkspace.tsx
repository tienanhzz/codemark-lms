'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { courseError, translate, type Course, type Locale } from '../lib/courseApi';

type QueueItem = { attemptId: string; assessmentId: string; assessmentKind: string; status: string; attemptNumber: number; submittedAt: string | null; learner: { id: string; officialName: string } | null; gradeReleased: boolean };
type Grade = { revision: number; pointsAwarded: number; criterionScores: Record<string, number>; feedback: string };
type Rubric = { maximumPoints: number; criteria: { criterionId: string; title: string; points: number; description?: string }[] };
type GradeItem = { questionVersionId: string; questionType: string; title: string; prompt: string; content: Record<string, unknown>; answer: unknown; points: number; rubric: Rubric | null; automaticGrade: { score: number; maxPoints: number } | null; manualGrade: Grade | null };
type Detail = { attemptId: string; assessmentId: string; assessmentTitle: string; attemptNumber: number; status: string; submittedAt: string | null; learnerId: string; items: GradeItem[] };

export function GradingWorkspace({ locale }: { locale: Locale }) {
  const t = translate(locale);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [scores, setScores] = useState<Record<string, Record<string, string>>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadQueue = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await api<{ items: QueueItem[] }>(`/courses/${id}/grading/attempts`);
      setQueue(result.items); setError('');
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setLoading(false); }
  }, [locale]);
  const loadDetail = useCallback(async (id: string) => {
    try {
      const result = await api<Detail>(`/courses/${courseId}/grading/attempts/${id}`);
      setDetail(result);
      setScores((current) => ({
        ...current,
        ...Object.fromEntries(result.items.filter((item) => item.rubric).map((item) => [
          item.questionVersionId,
          Object.fromEntries(item.rubric!.criteria.map((criterion) => [criterion.criterionId, String(item.manualGrade?.criterionScores[criterion.criterionId] ?? 0)])),
        ])),
      }));
      setFeedback((current) => ({
        ...current,
        ...Object.fromEntries(result.items.filter((item) => item.rubric).map((item) => [item.questionVersionId, item.manualGrade?.feedback || ''])),
      }));
      setError('');
    } catch (problem) { setError(courseError(problem, locale)); }
  }, [courseId, locale]);

  useEffect(() => {
    let cancelled = false;
    void api<{ items: Course[] }>('/courses?pageSize=100').then((result) => {
      const editable = result.items.filter((course) => course.permissions.includes('grading.manage'));
      if (!cancelled) { setCourses(editable); if (editable[0]) setCourseId(editable[0].id); else setLoading(false); }
    }).catch((problem) => { if (!cancelled) { setError(courseError(problem, locale)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [locale]);
  useEffect(() => { void loadQueue(courseId); setDetail(null); }, [courseId, loadQueue]);

  async function save(item: GradeItem) {
    if (!detail || !item.rubric) return;
    const criterionScores = Object.fromEntries(item.rubric.criteria.map((criterion) => [criterion.criterionId, Number(scores[item.questionVersionId]?.[criterion.criterionId] || 0)]));
    const pointsAwarded = Object.values(criterionScores).reduce((sum, points) => sum + points, 0);
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/courses/${courseId}/grading/attempts/${detail.attemptId}/questions/${item.questionVersionId}`, 'PUT', {
        pointsAwarded, criterionScores, feedback: feedback[item.questionVersionId] || '',
      });
      setNotice(t('Grade saved as a new revision.', 'Đã lưu điểm dưới dạng phiên bản mới.'));
      await loadDetail(detail.attemptId);
      await loadQueue(courseId);
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  }
  async function release() {
    if (!detail) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const released = await api<{ releasedScore: number; maxPoints: number; penaltyPercent: number }>(`/courses/${courseId}/grading/attempts/${detail.attemptId}/release`, 'POST');
      setNotice(t(`Grade released: ${released.releasedScore} / ${released.maxPoints} (${released.penaltyPercent}% late deduction).`, `Đã công bố điểm: ${released.releasedScore} / ${released.maxPoints} (trừ muộn ${released.penaltyPercent}%).`));
      await loadDetail(detail.attemptId); await loadQueue(courseId);
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  }
  const complete = detail?.items.every((item) => item.questionType !== 'writing' || item.manualGrade) ?? false;

  return <section className="panel grading-workspace">
    <div className="panel-heading"><div><p className="eyebrow">BUILD-029</p><h2>{t('Grading queue', 'Danh sách chấm bài')}</h2><p>{t('Review submitted work, score writing rubrics and release grades to learners.', 'Xem bài đã nộp, chấm rubric và công bố điểm cho học viên.')}</p></div></div>
    {error && <div className="alert alert-error" role="alert">{error}</div>}{notice && <div className="alert alert-success" role="status">{notice}</div>}
    {courses.length > 0 && <label className="course-field"><span>{t('Course', 'Khóa học')}</span><select value={courseId} onChange={(event) => setCourseId(event.target.value)}>{courses.map((course) => <option key={course.id} value={course.id}>{course.courseCode} · {course.title}</option>)}</select></label>}
    {!loading && courses.length === 0 && <p className="course-empty">{t('You do not have grading access to a course.', 'Bạn chưa có quyền chấm điểm trong khóa học nào.')}</p>}
    {courses.length > 0 && <div className="grading-layout">
      <div className="grading-queue"><h3>{t('Submitted attempts', 'Bài đã nộp')}</h3>{loading ? <p role="status">{t('Loading queue…', 'Đang tải danh sách…')}</p> : queue.length === 0 ? <p className="course-empty">{t('No submitted attempts need grading.', 'Chưa có bài nộp cần chấm.')}</p> : queue.map((item) => <button type="button" className={`grading-queue-item ${detail?.attemptId === item.attemptId ? 'selected' : ''}`} key={item.attemptId} onClick={() => void loadDetail(item.attemptId)}>
        <strong>{item.learner?.officialName || item.learner?.id || t('Learner', 'Học viên')}</strong><span>{item.assessmentKind} · #{item.attemptNumber} · {item.status}</span><small>{item.submittedAt ? new Date(item.submittedAt).toLocaleString(locale) : ''}{item.gradeReleased ? ` · ${t('released', 'đã công bố')}` : ''}</small>
      </button>)}</div>
      <div className="grading-detail">{!detail ? <p className="course-empty">{t('Choose a submitted attempt to review.', 'Chọn bài đã nộp để xem.')}</p> : <>
        <div className="grading-detail-heading"><div><h3>{detail.assessmentTitle}</h3><p>{t('Attempt', 'Lần làm')} {detail.attemptNumber} · {detail.status}</p></div><button className="button primary" type="button" disabled={busy || !complete} onClick={() => void release()}>{t('Release grade', 'Công bố điểm')}</button></div>
        {detail.items.map((item) => <article className="grading-question" key={item.questionVersionId}>
          <div><h4>{item.title}</h4><p>{item.prompt}</p><strong>{item.points} {t('points', 'điểm')}</strong></div>
          <div className="grading-answer"><strong>{t('Learner response', 'Câu trả lời')}</strong><pre>{typeof item.answer === 'string' ? item.answer : JSON.stringify(item.answer, null, 2) || t('No answer', 'Chưa trả lời')}</pre></div>
          {item.automaticGrade && <p className="grading-auto-score">{t('Automatic score', 'Điểm tự động')}: {item.automaticGrade.score} / {item.automaticGrade.maxPoints}</p>}
          {item.rubric && <div className="grading-rubric"><h5>{t('Rubric', 'Rubric')} · {item.rubric.maximumPoints} {t('points', 'điểm')}</h5>{item.rubric.criteria.map((criterion) => <label className="course-field" key={criterion.criterionId}><span>{criterion.title} · {criterion.points} {t('max', 'tối đa')}</span><input type="number" min={0} max={criterion.points} step="0.1" value={scores[item.questionVersionId]?.[criterion.criterionId] ?? '0'} onChange={(event) => setScores((current) => ({ ...current, [item.questionVersionId]: { ...current[item.questionVersionId], [criterion.criterionId]: event.target.value } }))} /></label>)}
            <label className="course-field"><span>{t('Feedback', 'Nhận xét')}</span><textarea maxLength={5000} rows={3} value={feedback[item.questionVersionId] || ''} onChange={(event) => setFeedback((current) => ({ ...current, [item.questionVersionId]: event.target.value }))} /></label>
            {item.manualGrade && <p>{t('Saved revision', 'Phiên bản đã lưu')} {item.manualGrade.revision} · {item.manualGrade.pointsAwarded} {t('points', 'điểm')}</p>}
            <button className="button secondary" type="button" disabled={busy} onClick={() => void save(item)}>{t('Save grade revision', 'Lưu phiên bản điểm')}</button>
          </div>}
        </article>)}
      </>}</div>
    </div>}
  </section>;
}
