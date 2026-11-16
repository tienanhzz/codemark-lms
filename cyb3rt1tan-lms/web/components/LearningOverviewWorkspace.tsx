'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { courseError, translate, type Course, type Locale } from '../lib/courseApi';

type Learner = { id: string; officialName: string; institutionalId?: string | null; status: string };
type CourseSummary = {
  courseId: string; courseCode: string; courseTitle: string;
  membership: { status: string; joinedAt: string | null; endedAt: string | null };
  attendance: { availability: string; eligibleSessions?: number; counts?: Record<string, number>; attendanceRate?: number | null; sessions?: { windowId: string; title: string; opensAt: string; status: string }[] };
  practice: { totalAttempts: number; uniqueQuestions: number; completions: number; passes: number; accuracy: number | null };
  lessonProgress: { availability: string; total?: number; completed?: number; completionRate?: number | null };
  assessments: { assigned: number; started: number; submitted: number; graded: number; pendingGrading: number | null; missingOrOverdue: number; results?: { title: string; kind: string; dueAt: string | null; attemptStatus: string; score: number | null; maxPoints: number | null }[] };
  lastActivityAt: string | null;
  recentActivity: { kind: string; at: string; label: string }[];
};
type OverviewResponse = { period: { fromAt: string; toAt: string }; items?: CourseSummary[]; item?: CourseSummary; student?: Learner };
type LessonProgress = { courseId: string; total: number; completed: number; entries: { entryId: string; title: string; position: number; completed: boolean }[] };

function iso(local: string): string { return new Date(local).toISOString(); }
function localInput(date: Date): string { const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }

export function LearningOverviewWorkspace({ locale, roles }: { locale: Locale; roles: string[] }) {
  const t = translate(locale);
  const student = roles.includes('student');
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState('');
  const [learners, setLearners] = useState<Learner[]>([]);
  const [studentId, setStudentId] = useState('');
  const [periodStart, setPeriodStart] = useState(() => localInput(new Date(Date.now() - 30 * 86400000)));
  const [periodEnd, setPeriodEnd] = useState(() => localInput(new Date()));
  const [summaries, setSummaries] = useState<CourseSummary[]>([]);
  const [lessonProgress, setLessonProgress] = useState<Record<string, LessonProgress>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void api<{ items: Course[] }>('/courses?pageSize=100').then((result) => {
      const visible = result.items.filter((course) => student ? course.permissions.includes('course.read') : course.permissions.includes('roster.read'));
      if (!cancelled) { setCourses(visible); if (visible[0]) setCourseId(visible[0].id); else setLoading(false); }
    }).catch((problem) => { if (!cancelled) { setError(courseError(problem, locale)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [locale, student]);

  useEffect(() => {
    let cancelled = false;
    if (student || !courseId) { setLearners([]); return; }
    void api<{ items: Learner[] }>(`/courses/${courseId}/enrollments?status=active&pageSize=100`).then((result) => {
      if (!cancelled) { setLearners(result.items); setStudentId((current) => result.items.some((item) => item.id === current) ? current : result.items[0]?.id || ''); }
    }).catch((problem) => { if (!cancelled) setError(courseError(problem, locale)); });
    return () => { cancelled = true; };
  }, [courseId, locale, student]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ fromAt: iso(periodStart), toAt: iso(periodEnd) });
      let result: OverviewResponse;
      if (student) {
        result = await api<OverviewResponse>(`/learning-overview/me?${params.toString()}`);
        setSummaries(result.items || []);
      } else if (courseId && studentId) {
        result = await api<OverviewResponse>(`/courses/${courseId}/learning-overview/${studentId}?${params.toString()}`);
        setSummaries(result.item ? [result.item] : []);
      } else setSummaries([]);
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setLoading(false); }
  }, [courseId, locale, periodEnd, periodStart, student, studentId]);

  useEffect(() => { if (student || (courseId && studentId)) void load(); }, [courseId, load, student, studentId]);
  useEffect(() => {
    if (!student || summaries.length === 0) return;
    let cancelled = false;
    void Promise.all(summaries.map(async (item) => [item.courseId, await api<LessonProgress>(`/courses/${item.courseId}/lesson-progress/me`)] as const))
      .then((results) => { if (!cancelled) setLessonProgress(Object.fromEntries(results)); })
      .catch((problem) => { if (!cancelled) setError(courseError(problem, locale)); });
    return () => { cancelled = true; };
  }, [locale, student, summaries]);
  const setLessonCompleted = async (courseId: string, entryId: string, completed: boolean) => {
    try {
      await api(`/courses/${courseId}/lesson-progress/me/${entryId}`, 'PUT', { completed });
      const fresh = await api<LessonProgress>(`/courses/${courseId}/lesson-progress/me`);
      setLessonProgress((current) => ({ ...current, [courseId]: fresh }));
      await load();
    } catch (problem) { setError(courseError(problem, locale)); }
  };
  const course = courses.find((item) => item.id === courseId);
  const learner = learners.find((item) => item.id === studentId);

  return <section className="panel learning-overview-workspace">
    <div className="panel-heading"><div><p className="eyebrow">BUILD-030</p><h2>{t('Student Learning Overview', 'Tổng quan học tập')}</h2><p>{t('A privacy-filtered view for the selected reporting period.', 'Thông tin được lọc theo quyền và khoảng thời gian đã chọn.')}</p></div></div>
    {error && <div role="alert" className="alert alert-error">{error}</div>}
    <div className="learning-overview-filters">
      {!student && <>
        <label className="course-field"><span>{t('Course', 'Khóa học')}</span><select value={courseId} onChange={(event) => { setCourseId(event.target.value); setStudentId(''); }}><option value="">{t('Select course', 'Chọn khóa học')}</option>{courses.map((item) => <option key={item.id} value={item.id}>{item.courseCode} · {item.title}</option>)}</select></label>
        <label className="course-field"><span>{t('Student', 'Học viên')}</span><select value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">{t('Select student', 'Chọn học viên')}</option>{learners.map((item) => <option key={item.id} value={item.id}>{item.officialName}{item.institutionalId ? ` · ${item.institutionalId}` : ''}</option>)}</select></label>
      </>}
      <label className="course-field"><span>{t('From', 'Từ ngày')}</span><input type="datetime-local" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label>
      <label className="course-field"><span>{t('To', 'Đến ngày')}</span><input type="datetime-local" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
      <button type="button" className="button secondary" disabled={loading || (!student && !studentId)} onClick={() => void load()}>{t('Apply period', 'Áp dụng khoảng thời gian')}</button>
    </div>
    {!student && courses.length === 0 && <p className="course-empty">{t('No course with roster access is available.', 'Không có khóa học nào bạn được quyền xem danh sách.')}</p>}
    {!student && learner && <p className="learning-learner-name"><strong>{learner.officialName}</strong>{course ? ` · ${course.courseCode} — ${course.title}` : ''}</p>}
    {loading ? <p role="status">{t('Loading learning overview…', 'Đang tải tổng quan…')}</p> : summaries.length === 0 ? <p className="course-empty">{t('No learning activity in the selected period.', 'Không có hoạt động học tập trong khoảng thời gian này.')}</p> : <div className="learning-course-summaries">{summaries.map((item) => <article className="learning-course-summary" key={item.courseId}>
      <div className="assessment-attempt-heading"><div><h3>{item.courseCode} · {item.courseTitle}</h3><p>{t('Enrollment', 'Ghi danh')}: {t(item.membership.status, item.membership.status)}</p></div><span>{t('Last activity', 'Hoạt động gần nhất')}: {item.lastActivityAt ? new Date(item.lastActivityAt).toLocaleString(locale) : t('None', 'Chưa có')}</span></div>
      <div className="learning-metric-grid">
        <div><span>{t('Attendance', 'Điểm danh')}</span>{item.attendance.availability === 'available' ? <><strong>{item.attendance.attendanceRate === null ? '—' : `${item.attendance.attendanceRate}%`}</strong><small>{t('Eligible sessions', 'Buổi hợp lệ')}: {item.attendance.eligibleSessions} · {Object.entries(item.attendance.counts || {}).map(([key, value]) => `${t(key, key)} ${value}`).join(' · ')}</small></> : <strong>{t('Not authorized', 'Không được phép xem')}</strong>}</div>
        <div><span>{t('Practice', 'Luyện tập')}</span><strong>{item.practice.totalAttempts}</strong><small>{t('attempts', 'lần')} · {item.practice.uniqueQuestions} {t('unique questions', 'câu duy nhất')} · {item.practice.accuracy === null ? '—' : `${item.practice.accuracy}%`}</small></div>
        <div><span>{t('Assessments', 'Bài đánh giá')}</span><strong>{item.assessments.submitted} / {item.assessments.assigned}</strong><small>{t('Started', 'Đã bắt đầu')}: {item.assessments.started} · {t('Graded', 'Đã chấm')}: {item.assessments.graded} · {t('Overdue/missing', 'Quá hạn/thiếu')}: {item.assessments.missingOrOverdue}</small></div>
        <div><span>{t('Lesson progress', 'Tiến độ bài học')}</span><strong>{item.lessonProgress.availability === 'available' ? `${item.lessonProgress.completed} / ${item.lessonProgress.total}` : t('Not available', 'Chưa có dữ liệu')}</strong><small>{item.lessonProgress.completionRate == null ? '—' : `${item.lessonProgress.completionRate}%`}</small></div>
      </div>
      {student && lessonProgress[item.courseId]?.entries.length ? <details className="learning-assessment-details"><summary>{t('Course lessons', 'Bài học trong khóa')}: {lessonProgress[item.courseId].completed}/{lessonProgress[item.courseId].total}</summary>{lessonProgress[item.courseId].entries.map((entry) => <label key={entry.entryId}><input type="checkbox" checked={entry.completed} onChange={(event) => void setLessonCompleted(item.courseId, entry.entryId, event.target.checked)} /> {entry.title}</label>)}</details> : null}
      {item.assessments.pendingGrading !== null && item.assessments.pendingGrading !== undefined && <p>{t('Pending grading', 'Đang chờ chấm')}: {item.assessments.pendingGrading}</p>}
      {item.assessments.results && item.assessments.results.length > 0 && <details className="learning-assessment-details"><summary>{t('Assessment details and released results', 'Chi tiết bài và điểm đã công bố')}</summary>{item.assessments.results.map((result, index) => <div key={`${result.title}-${index}`}><span>{result.title} · {result.kind} · {result.attemptStatus}</span><strong>{result.score === null ? t('Not released', 'Chưa công bố') : `${result.score} / ${result.maxPoints}`}</strong>{result.dueAt && <small>{t('Due', 'Hạn')}: {new Date(result.dueAt).toLocaleString(locale)}</small>}</div>)}</details>}
      <details className="learning-assessment-details"><summary>{t('Recent activity', 'Hoạt động gần đây')}</summary>{item.recentActivity.length ? item.recentActivity.map((activity, index) => <div key={`${activity.at}-${index}`}><span>{t(activity.kind, activity.kind)} · {activity.label}</span><time>{new Date(activity.at).toLocaleString(locale)}</time></div>) : <p>{t('No activity recorded in this period.', 'Chưa ghi nhận hoạt động trong khoảng thời gian này.')}</p>}</details>
    </article>)}</div>}
  </section>;
}
