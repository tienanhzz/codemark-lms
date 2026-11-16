'use client';

import { useState } from 'react';
import { api } from '../lib/api';
import { courseError, translate, type Locale } from '../lib/courseApi';

type Event = { id: string; actorId: string | null; action: string; createdAt: string; requestId: string; detail: Record<string, unknown>; ipMatched: boolean };
type Query = { actorId: string; action: string; courseId: string; query: string; ip: string; fromAt: string; toAt: string };
function iso(value: string): string { return value ? new Date(value).toISOString() : ''; }

export function AuditWorkspace({ locale }: { locale: Locale }) {
  const t = translate(locale);
  const [filters, setFilters] = useState<Query>({ actorId: '', action: '', courseId: '', query: '', ip: '', fromAt: '', toAt: '' });
  const [reason, setReason] = useState('');
  const [events, setEvents] = useState<Event[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function params(after?: string | null) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (!value) continue;
      search.set(key, ['fromAt', 'toAt'].includes(key) ? iso(value) : value);
    }
    if (after) search.set('cursor', after);
    return search.toString();
  }
  async function search(after: string | null = null) {
    setBusy(true); setError('');
    try {
      const result = await api<{ items: Event[]; nextCursor: string | null }>(`/admin/audit-events?${params(after)}`);
      setEvents((current) => after ? [...current, ...result.items] : result.items);
      setCursor(result.nextCursor);
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  }
  async function exportCsv() {
    setBusy(true); setError(''); setNotice('');
    try {
      const csrf = document.cookie.split('; ').find((value) => value.startsWith('lms_csrf='))?.split('=')[1] || '';
      const response = await fetch('/v1/admin/audit-events/export', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ actorId: filters.actorId || undefined, action: filters.action || undefined, courseId: filters.courseId || undefined, query: filters.query || undefined, ip: filters.ip || undefined, fromAt: filters.fromAt ? iso(filters.fromAt) : undefined, toAt: filters.toAt ? iso(filters.toAt) : undefined, reason }) });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error?.code || 'connection_error');
      const blob = await response.blob(); const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = 'audit-events.csv';
      document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      setNotice(t('Audit export downloaded and logged.', 'Đã tải và ghi nhận xuất audit.'));
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  }
  function field(key: keyof Query, label: string, placeholder = '', type = 'text') {
    return <label className="course-field" key={key}><span>{t(label, label === 'From' ? 'Từ' : label === 'To' ? 'Đến' : label)}</span><input type={type} value={filters[key]} maxLength={128} placeholder={placeholder} onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.value }))} /></label>;
  }
  return <section className="panel audit-workspace">
    <div className="panel-heading"><div><p className="eyebrow">BUILD-030</p><h2>{t('Audit log', 'Nhật ký audit')}</h2><p>{t('Immutable events with actor, action, detail, reason, correlation ID and privacy-safe IP matching.', 'Sự kiện bất biến gồm người thực hiện, thao tác, chi tiết, lý do, mã tương quan và đối chiếu IP an toàn.')}</p></div></div>
    {error && <div role="alert" className="alert alert-error">{error}</div>}{notice && <div role="status" className="alert alert-success">{notice}</div>}
    <div className="audit-filter-grid">{field('actorId', 'Actor ID')}{field('action', 'Action')}{field('courseId', 'Course ID')}{field('query', 'Search detail / request ID')}{field('ip', 'Exact IP filter')}{field('fromAt', 'From', '', 'datetime-local')}{field('toAt', 'To', '', 'datetime-local')}<label className="course-field"><span>{t('Export reason', 'Lý do xuất')}</span><input required minLength={5} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label></div>
    <div className="attendance-actions"><button type="button" className="button primary" disabled={busy} onClick={() => void search()}>{t('Search', 'Tìm kiếm')}</button><button type="button" className="button secondary" disabled={busy || reason.trim().length < 5} onClick={() => void exportCsv()}>{t('Export filtered CSV', 'Xuất CSV đã lọc')}</button></div>
    {events.length > 0 && <div className="audit-event-list">{events.map((item) => <details key={item.id}><summary><strong>{item.action}</strong><span>{new Date(item.createdAt).toLocaleString(locale)}</span></summary><dl><dt>{t('Actor', 'Người thực hiện')}</dt><dd>{item.actorId || t('System', 'Hệ thống')}</dd><dt>{t('Correlation ID', 'Mã tương quan')}</dt><dd>{item.requestId}</dd><dt>{t('Detail / before-after diff / reason', 'Chi tiết / thay đổi / lý do')}</dt><dd><pre>{JSON.stringify(item.detail, null, 2)}</pre></dd>{item.ipMatched && <><dt>{t('IP filter', 'Bộ lọc IP')}</dt><dd>{t('Matched exact privacy-safe digest.', 'Khớp chính xác với mã băm bảo vệ riêng tư.')}</dd></>}</dl></details>)}</div>}
    {events.length === 0 && <p className="course-empty">{t('Run a search to view audit events.', 'Thực hiện tìm kiếm để xem sự kiện audit.')}</p>}
    {cursor && <button className="button secondary" type="button" disabled={busy} onClick={() => void search(cursor)}>{t('Load more', 'Tải thêm')}</button>}
  </section>;
}
