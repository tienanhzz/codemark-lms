'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, apiDownload } from '../lib/api';
import { courseError, translate, type Course, type Locale } from '../lib/courseApi';

type ReportJob = { id: string; kind: string; format: string; createdAt?: string; expiresAt: string; rowCount?: number; downloadPath: string };
type Learner = { id: string; officialName: string; institutionalId?: string | null };
function localInput(date: Date): string { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }

export function ReportsWorkspace({ locale, roles }: { locale: Locale; roles: string[] }) {
  const t = translate(locale);
  const admin = roles.includes('admin');
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState('');
  const [learners, setLearners] = useState<Learner[]>([]);
  const [studentId, setStudentId] = useState('');
  const [fromAt, setFromAt] = useState(() => localInput(new Date(Date.now() - 30 * 86400000)));
  const [toAt, setToAt] = useState(() => localInput(new Date()));
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv');
  const [reason, setReason] = useState('');
  const [jobs, setJobs] = useState<ReportJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadJobs = useCallback(async () => {
    try { setJobs((await api<{ items: ReportJob[] }>('/reports')).items); }
    catch (problem) { setError(courseError(problem, locale)); }
  }, [locale]);
  useEffect(() => {
    let cancelled = false;
    void api<{ items: Course[] }>('/courses?pageSize=100').then((result) => {
      const visible = result.items.filter((course) => course.permissions.includes('roster.read'));
      if (!cancelled) { setCourses(visible); if (!admin && visible[0]) setCourseId(visible[0].id); }
    }).catch((problem) => { if (!cancelled) setError(courseError(problem, locale)); });
    void loadJobs();
    return () => { cancelled = true; };
  }, [admin, loadJobs, locale]);
  useEffect(() => {
    let cancelled = false;
    if (!courseId) { setLearners([]); setStudentId(''); return; }
    void api<{ items: Learner[] }>(`/courses/${courseId}/enrollments?status=active&pageSize=100`).then((result) => {
      if (!cancelled) setLearners(result.items);
    }).catch(() => { if (!cancelled) setLearners([]); });
    return () => { cancelled = true; };
  }, [courseId]);
  async function create() {
    setBusy(true); setError(''); setNotice('');
    try {
      const job = await api<ReportJob>('/reports', 'POST', {
        kind: 'studentProgress', format, courseId: courseId || undefined, studentId: studentId || undefined,
        fromAt: new Date(fromAt).toISOString(), toAt: new Date(toAt).toISOString(), reason,
      });
      setNotice(t(`Report ready for download (${job.rowCount ?? 0} rows).`, `Báo cáo đã sẵn sàng (${job.rowCount ?? 0} dòng).`));
      setReason('');
      await loadJobs();
      await download(job);
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  }
  async function download(job: ReportJob) {
    setBusy(true); setError('');
    try {
      const blob = await apiDownload(job.downloadPath.replace('/v1', ''));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `student-progress-${job.id}.${job.format}`;
      document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      setNotice(t('Download authorized and logged.', 'Đã xác thực và ghi nhận lượt tải.'));
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  }
  return <section className="panel reports-workspace">
    <div className="panel-heading"><div><p className="eyebrow">BUILD-030</p><h2>{t('Reports & exports', 'Báo cáo và xuất dữ liệu')}</h2><p>{t('Progress exports are scoped at creation and rechecked when downloaded.', 'Báo cáo được giới hạn quyền lúc tạo và kiểm tra lại khi tải.')}</p></div></div>
    {error && <div role="alert" className="alert alert-error">{error}</div>}{notice && <div role="status" className="alert alert-success">{notice}</div>}
    <div className="report-form-grid">
      {admin && <label className="course-field"><span>{t('Course scope', 'Phạm vi khóa học')}</span><select value={courseId} onChange={(event) => { setCourseId(event.target.value); setStudentId(''); }}><option value="">{t('All permitted courses', 'Tất cả khóa được phép')}</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.courseCode} · {course.title}</option>)}</select></label>}
      {!admin && <label className="course-field"><span>{t('Course', 'Khóa học')}</span><select value={courseId} onChange={(event) => { setCourseId(event.target.value); setStudentId(''); }}>{courses.map((course) => <option key={course.id} value={course.id}>{course.courseCode} · {course.title}</option>)}</select></label>}
      {courseId && <label className="course-field"><span>{t('Student (optional)', 'Học viên (không bắt buộc)')}</span><select value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">{t('All active learners', 'Tất cả học viên')}</option>{learners.map((learner) => <option key={learner.id} value={learner.id}>{learner.officialName}{learner.institutionalId ? ` · ${learner.institutionalId}` : ''}</option>)}</select></label>}
      <label className="course-field"><span>{t('From', 'Từ')}</span><input type="datetime-local" required value={fromAt} onChange={(event) => setFromAt(event.target.value)} /></label>
      <label className="course-field"><span>{t('To', 'Đến')}</span><input type="datetime-local" required value={toAt} onChange={(event) => setToAt(event.target.value)} /></label>
      <label className="course-field"><span>{t('Format', 'Định dạng')}</span><select value={format} onChange={(event) => setFormat(event.target.value as 'csv' | 'xlsx')}><option value="csv">CSV</option><option value="xlsx">XLSX</option></select></label>
      <label className="course-field report-reason"><span>{t('Purpose (required for audit)', 'Mục đích (bắt buộc để ghi audit)')}</span><input required minLength={5} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <button type="button" className="button primary" disabled={busy || !reason.trim() || (!admin && !courseId)} onClick={() => void create()}>{t('Create & download report', 'Tạo và tải báo cáo')}</button>
    </div>
    <div className="assessment-list"><h3>{t('My recent report jobs', 'Báo cáo gần đây của tôi')}</h3>{jobs.length ? jobs.map((job) => <div className="assessment-row" key={job.id}><div><strong>{job.kind} · {job.format.toUpperCase()}</strong><span>{job.createdAt ? new Date(job.createdAt).toLocaleString(locale) : ''} · {t('Expires', 'Hết hạn')} {new Date(job.expiresAt).toLocaleString(locale)}</span></div><button type="button" className="button secondary" disabled={busy} onClick={() => void download(job)}>{t('Download again', 'Tải lại')}</button></div>) : <p className="course-empty">{t('No report jobs yet.', 'Chưa có báo cáo nào.')}</p>}</div>
  </section>;
}
