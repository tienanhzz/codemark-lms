'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { courseError, translate, type Course, type Locale } from '../lib/courseApi';

type WindowItem = { id: string; title: string; opensAt: string; closesAt: string; lateGraceMinutes: number; status: 'open' | 'closed' };
type AttendanceRecord = { recordId: string; userId: string; officialName: string; status: string; checkedAt: string | null; revision: number };
type ExcusalRequest = { id: string; recordId: string | null; windowId: string; officialName: string; reason: string; status: string; createdAt: string };

function offsetIso(value: string, zone: string): string {
  const [date, time] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(wall));
  const numbers = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  const zoneWall = Date.UTC(numbers.year!, numbers.month! - 1, numbers.day!, numbers.hour!, numbers.minute!);
  const offset = Math.round((zoneWall - wall) / 60000);
  const sign = offset >= 0 ? '+' : '-';
  const absolute = Math.abs(offset);
  return `${date}T${time}:00${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

export function AttendanceWorkspace({ locale, roles }: { locale: Locale; roles: string[] }) {
  const t = translate(locale);
  const student = roles.includes('student');
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState('');
  const course = courses.find((item) => item.id === courseId);
  const canManage = Boolean(course?.permissions.includes('attendance.manage'));
  const [windows, setWindows] = useState<WindowItem[]>([]);
  const [records, setRecords] = useState<Record<string, AttendanceRecord[]>>({});
  const [excusals, setExcusals] = useState<ExcusalRequest[]>([]);
  const [title, setTitle] = useState('');
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [lateGraceMinutes, setLateGraceMinutes] = useState('0');
  const [token, setToken] = useState('');
  const [checkTokens, setCheckTokens] = useState<Record<string, string>>({});
  const [excusalReason, setExcusalReason] = useState<Record<string, string>>({});
  const [decisionReason, setDecisionReason] = useState<Record<string, string>>({});
  const [correction, setCorrection] = useState<Record<string, { status: string; reason: string }>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const result = await api<{ items: WindowItem[] }>(`/courses/${id}/attendance/windows`);
      setWindows(result.items);
      const lists = await Promise.all(result.items.map(async (item) => {
        try { return [item.id, (await api<{ items: AttendanceRecord[] }>(`/courses/${id}/attendance/windows/${item.id}/records`)).items] as const; }
        catch { return [item.id, []] as const; }
      }));
      setRecords(Object.fromEntries(lists));
      try { setExcusals((await api<{ items: ExcusalRequest[] }>(`/courses/${id}/attendance/excusals`)).items); }
      catch { setExcusals([]); }
      setError('');
    } catch (problem) { setError(courseError(problem, locale)); }
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    void api<{ items: Course[] }>('/courses?pageSize=100').then((result) => {
      const visible = result.items.filter((item) => item.permissions.includes('course.read'));
      if (!cancelled) { setCourses(visible); if (visible[0]) setCourseId(visible[0].id); }
    }).catch((problem) => { if (!cancelled) setError(courseError(problem, locale)); });
    return () => { cancelled = true; };
  }, [locale]);
  useEffect(() => { void load(courseId); }, [courseId, load]);

  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); setNotice(success); await load(courseId); }
    catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  }

  return <section className="panel attendance-workspace">
    <div className="panel-heading"><div><p className="eyebrow">BUILD-030</p><h2>{t('Attendance', 'Điểm danh')}</h2><p>{t('Course attendance windows and excusal requests.', 'Ca điểm danh theo khóa học và yêu cầu miễn trừ.')}</p></div></div>
    {error && <div role="alert" className="alert alert-error">{error}</div>}{notice && <div role="status" className="alert alert-success">{notice}</div>}
    {courses.length > 0 && <label className="course-field"><span>{t('Course', 'Khóa học')}</span><select value={courseId} onChange={(event) => { setCourseId(event.target.value); setToken(''); }}>{courses.map((item) => <option key={item.id} value={item.id}>{item.courseCode} · {item.title}</option>)}</select></label>}
    {canManage && <form className="attendance-create" onSubmit={(event) => { event.preventDefault(); if (!course) return; void act(async () => { const made = await api<WindowItem>(`/courses/${courseId}/attendance/windows`, 'POST', { title, opensAt: offsetIso(opensAt, course.timezone), closesAt: offsetIso(closesAt, course.timezone), lateGraceMinutes: Number(lateGraceMinutes) }); setWindows((current) => [made, ...current]); setTitle(''); }, t('Attendance window created.', 'Đã tạo ca điểm danh.')); }}>
      <h3>{t('Create attendance window', 'Tạo ca điểm danh')}</h3><label className="course-field"><span>{t('Title', 'Tên ca')}</span><input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} /></label><div className="assessment-fields"><label className="course-field"><span>{t('Opens', 'Mở lúc')}</span><input type="datetime-local" required value={opensAt} onChange={(event) => setOpensAt(event.target.value)} /></label><label className="course-field"><span>{t('Closes', 'Đóng lúc')}</span><input type="datetime-local" required value={closesAt} onChange={(event) => setClosesAt(event.target.value)} /></label></div><label className="course-field"><span>{t('Late grace (minutes)', 'Số phút ân hạn')}</span><input type="number" min={0} max={120} value={lateGraceMinutes} onChange={(event) => setLateGraceMinutes(event.target.value)} /></label><button className="button primary" disabled={busy}>{t('Create window', 'Tạo ca')}</button>
    </form>}
    <div className="attendance-window-list">{windows.length === 0 ? <p className="course-empty">{t('No attendance windows yet.', 'Chưa có ca điểm danh.')}</p> : windows.map((item) => {
      const own = records[item.id]?.find((record) => record.userId && (student ? true : false));
      return <article className="attendance-window" key={item.id}><div className="assessment-attempt-heading"><div><h3>{item.title}</h3><p>{new Date(item.opensAt).toLocaleString(locale)} – {new Date(item.closesAt).toLocaleString(locale)} · {item.status}</p></div>{canManage && <div className="attendance-actions"><button type="button" className="button secondary" disabled={busy || item.status === 'closed'} onClick={() => void act(async () => { const result = await api<{ token: string; expiresAt: string }>(`/courses/${courseId}/attendance/windows/${item.id}/token`, 'POST'); setToken(result.token); }, t('A new check-in token is ready.', 'Đã tạo mã check-in mới.'))}>{t('Rotate token', 'Đổi mã')}</button><button type="button" className="button secondary" disabled={busy || item.status === 'closed'} onClick={() => void act(() => api(`/courses/${courseId}/attendance/windows/${item.id}/close`, 'POST'), t('Window closed and absences recorded.', 'Đã đóng ca và ghi nhận vắng mặt.'))}>{t('Close and mark absent', 'Đóng ca, ghi vắng')}</button></div>}</div>
        {canManage && token && <p className="attendance-token"><strong>{token}</strong><small>{t('Shown once. Expires in five minutes; rotating invalidates it.', 'Chỉ hiển thị một lần. Hết hạn sau 5 phút; đổi mã sẽ vô hiệu mã cũ.')}</small></p>}
        {student && item.status === 'open' && <form className="attendance-checkin" onSubmit={(event) => { event.preventDefault(); void act(() => api(`/courses/${courseId}/attendance/windows/${item.id}/check-in`, 'POST', { token: checkTokens[item.id] }), t('You are checked in.', 'Bạn đã điểm danh.')); }}><label className="course-field"><span>{t('Check-in token', 'Mã check-in')}</span><input autoComplete="one-time-code" value={checkTokens[item.id] || ''} onChange={(event) => setCheckTokens((current) => ({ ...current, [item.id]: event.target.value }))} /></label><button className="button primary" disabled={busy || !checkTokens[item.id]}>{t('Check in', 'Điểm danh')}</button></form>}
        {student && item.status === 'open' && (!own || ['absent', 'late'].includes(own.status)) && !excusals.some((request) => request.windowId === item.id && request.status === 'pending') && <form className="attendance-checkin" onSubmit={(event) => { event.preventDefault(); void act(() => api(`/courses/${courseId}/attendance/windows/${item.id}/excusal`, 'POST', { reason: excusalReason[item.id] }), t('Excusal request submitted.', 'Đã gửi yêu cầu miễn trừ.')); }}><label className="course-field"><span>{t('Request excusal', 'Yêu cầu miễn trừ')}</span><textarea required maxLength={1000} value={excusalReason[item.id] || ''} onChange={(event) => setExcusalReason((current) => ({ ...current, [item.id]: event.target.value }))} /></label><button className="button secondary" disabled={busy}>{t('Submit request', 'Gửi yêu cầu')}</button></form>}
        {excusals.filter((request) => request.windowId === item.id).map((request) => <p className="attendance-excusal-status" key={request.id}>{t('Excusal request', 'Yêu cầu miễn trừ')}: {request.status} · {request.reason}</p>)}
        <div className="attendance-record-list">{records[item.id]?.map((record) => <div key={record.recordId}><span>{canManage ? record.officialName : t('Your attendance', 'Trạng thái của bạn')}</span><strong>{t(record.status, record.status === 'present' ? 'Có mặt' : record.status === 'late' ? 'Muộn' : record.status === 'excused' ? 'Miễn trừ' : 'Vắng')}</strong>{canManage && <div className="attendance-correction"><select aria-label={`${t('Correct status for', 'Sửa trạng thái của')} ${record.officialName}`} value={correction[record.recordId]?.status ?? record.status} onChange={(event) => setCorrection((current) => ({ ...current, [record.recordId]: { status: event.target.value, reason: current[record.recordId]?.reason || '' } }))}><option value="present">{t('Present', 'Có mặt')}</option><option value="late">{t('Late', 'Muộn')}</option><option value="absent">{t('Absent', 'Vắng')}</option><option value="excused">{t('Excused', 'Miễn trừ')}</option></select><input aria-label={t('Correction reason', 'Lý do chỉnh sửa')} placeholder={t('Reason required', 'Bắt buộc nêu lý do')} value={correction[record.recordId]?.reason ?? ''} onChange={(event) => setCorrection((current) => ({ ...current, [record.recordId]: { status: current[record.recordId]?.status ?? record.status, reason: event.target.value } }))} /><button type="button" className="button secondary" disabled={busy || !correction[record.recordId]?.reason?.trim() || correction[record.recordId]?.status === record.status} onClick={() => void act(() => api(`/courses/${courseId}/attendance/records/${record.recordId}`, 'PUT', correction[record.recordId]), t('Attendance updated.', 'Đã cập nhật điểm danh.'))}>{t('Save', 'Lưu')}</button></div>}</div>)}</div>
      </article>;
    })}</div>
    {canManage && excusals.length > 0 && <section className="attendance-excusals"><h3>{t('Excusal requests', 'Yêu cầu miễn trừ')}</h3>{excusals.map((item) => <article key={item.id}><div><strong>{item.officialName}</strong><p>{item.reason}</p><small>{item.status} · {new Date(item.createdAt).toLocaleString(locale)}</small></div>{item.status === 'pending' && <div className="attendance-decision"><label className="course-field"><span>{t('Decision reason', 'Lý do quyết định')}</span><input maxLength={1000} value={decisionReason[item.id] || ''} onChange={(event) => setDecisionReason((current) => ({ ...current, [item.id]: event.target.value }))} /></label><div className="attendance-actions"><button type="button" className="button secondary" disabled={busy || !decisionReason[item.id]?.trim()} onClick={() => void act(() => api(`/courses/${courseId}/attendance/excusals/${item.id}/decision`, 'POST', { approved: true, reason: decisionReason[item.id] }), t('Excusal approved.', 'Đã duyệt miễn trừ.'))}>{t('Approve', 'Duyệt')}</button><button type="button" className="button secondary" disabled={busy || !decisionReason[item.id]?.trim()} onClick={() => void act(() => api(`/courses/${courseId}/attendance/excusals/${item.id}/decision`, 'POST', { approved: false, reason: decisionReason[item.id] }), t('Excusal denied.', 'Đã từ chối miễn trừ.'))}>{t('Deny', 'Từ chối')}</button></div></div>}</article>)}</section>}
  </section>;
}
