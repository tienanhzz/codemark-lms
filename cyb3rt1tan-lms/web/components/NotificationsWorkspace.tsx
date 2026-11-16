'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { courseError, type Course, type Locale } from '../lib/courseApi';
import { subscribeRealtime } from '../lib/realtime';

type Notice = { id: string; notificationId: string; eventKey: string; severity: 'ordinary' | 'critical' | 'emergency'; mandatory: boolean; requireAcknowledgement: boolean; channels: string[]; locale: string; subject: string; body: string; createdAt: string; readAt: string | null; acknowledgedAt: string | null };
type Template = { templateId: string; version: number; eventKey: string; locale: 'en' | 'vi'; mandatory: boolean; channels: string[]; subject: string; body: string; createdAt: string };
type Preferences = { emailNonessential: boolean; inApp: true; locale: 'en' | 'vi' };
type Delivery = { recipientCount: number; readCount: number; acknowledgedCount: number; emailQueued: number; emailDelivered: number; emailFailed: number; emailSuppressed: number };

export function NotificationsWorkspace({ locale, roles }: { locale: Locale; roles: string[] }) {
  const admin = roles.includes('admin');
  const [items, setItems] = useState<Notice[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [preferences, setPreferences] = useState<Preferences>({ emailNonessential: true, inApp: true, locale: locale === 'vi' ? 'vi' : 'en' });
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const loadRef = useRef<() => Promise<void>>(async () => undefined);
  const realtimeRef = useRef(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [audience, setAudience] = useState<'system' | 'course'>('system');
  const [courseId, setCourseId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [severity, setSeverity] = useState<'ordinary' | 'critical' | 'emergency'>('ordinary');
  const [requireAck, setRequireAck] = useState(false);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [templateId, setTemplateId] = useState('general-notice');
  const [templateEvent, setTemplateEvent] = useState('system.announcement');
  const [templateLocale, setTemplateLocale] = useState<'en' | 'vi'>(locale === 'vi' ? 'vi' : 'en');
  const [templateMandatory, setTemplateMandatory] = useState(false);
  const [templateChannels, setTemplateChannels] = useState<string[]>(['inApp', 'realtime']);
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const vi = locale === 'vi';

  const load = useCallback(async () => {
    try {
      const [feed, prefs] = await Promise.all([
        api<{ items: Notice[] }>('/me/notifications?pageSize=50' + (unreadOnly ? '&unreadOnly=true' : '')),
        api<Preferences>('/me/notification-preferences'),
      ]);
      setItems(feed.items);
      setPreferences(prefs);
      if (admin) {
        const result = await api<{ items: Template[] }>('/admin/notification-templates');
        setTemplates(result.items);
      }
    } catch (problem) { setError(courseError(problem, locale)); }
  }, [admin, locale, unreadOnly]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    if (!admin) {
      let cancelled = false;
      void api<{ items: Course[] }>('/courses?pageSize=100').then((result) => {
        const manageable = result.items.filter((course) => course.permissions.includes('events.manage'));
        if (!cancelled) { setCourses(manageable); setAudience('course'); if (manageable[0]) setCourseId(manageable[0].id); }
      }).catch((problem) => { if (!cancelled) setError(courseError(problem, locale)); });
      return () => { cancelled = true; };
    }
    let cancelled = false;
    void api<{ items: Course[] }>('/courses?pageSize=100').then((result) => { if (!cancelled) setCourses(result.items); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [admin, locale]);
  useEffect(() => {
    const unsubscribe = subscribeRealtime({
      onChange: () => { void loadRef.current(); },
      onStatus: (connected) => { realtimeRef.current = connected; setRealtimeConnected(connected); },
    });
    const fallback = window.setInterval(() => {
      if (!realtimeRef.current) void loadRef.current();
    }, 30000);
    return () => {
      window.clearInterval(fallback);
      unsubscribe();
    };
  }, []);

  async function savePreferences() {
    setBusy(true); setError(''); setNotice('');
    try { setPreferences(await api<Preferences>('/me/notification-preferences', 'PUT', preferences)); setNotice(vi ? 'Đã lưu tùy chọn.' : 'Preferences saved.'); }
    catch (problem) { setError(courseError(problem, locale)); } finally { setBusy(false); }
  }

  async function mark(item: Notice, action: 'read' | 'acknowledgements') {
    setBusy(true); setError('');
    try { await api(`/me/notifications/${item.id}/${action}`, 'POST'); await load(); }
    catch (problem) { setError(courseError(problem, locale)); } finally { setBusy(false); }
  }

  async function publishTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const version = Math.max(0, ...templates.filter((item) => item.templateId === templateId && item.locale === templateLocale).map((item) => item.version)) + 1;
    try {
      await api('/admin/notification-templates', 'POST', { templateId, version, eventKey: templateEvent, locale: templateLocale, mandatory: templateMandatory, channels: templateMandatory ? Array.from(new Set([...templateChannels, 'inApp'])) : templateChannels, subject: templateSubject, body: templateBody });
      setTemplateSubject(''); setTemplateBody(''); setNotice(vi ? 'Đã tạo phiên bản mẫu thông báo.' : 'Notification template version created.'); await load();
    } catch (problem) { setError(courseError(problem, locale)); } finally { setBusy(false); }
  }

  async function sendNotice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedTemplate) return;
    setBusy(true); setError(''); setNotice(''); setDelivery(null);
    const body = { eventKey: templates.find((item) => item.templateId === selectedTemplate)?.eventKey, audience: audience === 'system' ? { scope: 'system' } : { scope: 'course', courseId, ...(sectionId ? { sectionId } : {}), ...(targetRole ? { role: targetRole } : {}) }, severity, templateId: selectedTemplate, requireAcknowledgement: requireAck };
    const path = audience === 'system' ? '/admin/notifications' : `/courses/${courseId}/notifications`;
    try {
      const result = await api<{ id: string; recipientCount: number }>(path, 'POST', body, { 'Idempotency-Key': crypto.randomUUID() });
      setNotice(vi ? `Đã gửi tới ${result.recipientCount} người nhận.` : `Sent to ${result.recipientCount} recipients.`);
      setDelivery(await api<Delivery>(`/notifications/${result.id}/delivery-status`));
      await load();
    } catch (problem) { setError(courseError(problem, locale)); } finally { setBusy(false); }
  }

  function toggleChannel(channel: string, checked: boolean) {
    setTemplateChannels((current) => checked ? [...new Set([...current, channel])] : current.filter((item) => item !== channel));
  }

  return <div className="workspace-page">
    <section className="mission-card clan-detail">
      <div className="assessment-attempt-heading"><div><span className="eyebrow">{vi ? 'Thông báo trong ứng dụng' : 'In-app notifications'}</span><h2>{vi ? 'Hộp thông báo' : 'Notification inbox'}</h2></div><button type="button" className="button secondary" disabled={busy} onClick={() => void load()}>{vi ? 'Làm mới' : 'Refresh'}</button></div>
      <p className="eyebrow" role="status">{realtimeConnected ? (vi ? 'Đang kết nối cập nhật trực tiếp' : 'Live updates connected') : (vi ? 'Đang chờ kết nối; hộp thư sẽ tự đồng bộ dự phòng' : 'Reconnecting; inbox sync remains available')}</p>
      <div className="assessment-action-row"><label><input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} /> {vi ? 'Chỉ chưa đọc' : 'Unread only'}</label></div>
      {items.length ? items.map((item) => <article className="mission-card" key={item.id}>
        <div className="assessment-attempt-heading"><div><span className="state-badge">{item.severity}{item.mandatory ? ` · ${vi ? 'Bắt buộc' : 'Required'}` : ''}</span><h3>{item.subject}</h3></div><time>{new Date(item.createdAt).toLocaleString(vi ? 'vi-VN' : 'en-US')}</time></div>
        <p style={{ whiteSpace: 'pre-wrap' }}>{item.body}</p><p className="eyebrow">{item.eventKey} · {item.readAt ? (vi ? 'Đã đọc' : 'Read') : (vi ? 'Chưa đọc' : 'Unread')}{item.acknowledgedAt ? ` · ${vi ? 'Đã xác nhận' : 'Acknowledged'}` : ''}</p>
        <div className="assessment-action-row">{!item.readAt && <button type="button" className="button secondary" disabled={busy} onClick={() => void mark(item, 'read')}>{vi ? 'Đánh dấu đã đọc' : 'Mark as read'}</button>}{item.requireAcknowledgement && !item.acknowledgedAt && <button type="button" className="button primary" disabled={busy} onClick={() => void mark(item, 'acknowledgements')}>{vi ? 'Xác nhận đã đọc' : 'Acknowledge'}</button>}</div>
      </article>) : <p className="course-empty">{vi ? 'Không có thông báo.' : 'No notifications.'}</p>}
    </section>
    <section className="mission-card clan-detail">
      <h2>{vi ? 'Tùy chọn thông báo' : 'Notification preferences'}</h2><p>{vi ? 'Thông báo trong ứng dụng và thông báo bắt buộc luôn được giữ bật.' : 'In-app and mandatory notices always stay enabled.'}</p>
      <label className="assessment-attempt-heading"><span>{vi ? 'Email không bắt buộc' : 'Nonessential email'}</span><input type="checkbox" checked={preferences.emailNonessential} onChange={(event) => setPreferences({ ...preferences, emailNonessential: event.target.checked })} /></label>
      <label className="course-field"><span>{vi ? 'Ngôn ngữ thông báo' : 'Notification language'}</span><select value={preferences.locale} onChange={(event) => setPreferences({ ...preferences, locale: event.target.value as Preferences['locale'] })}><option value="en">English</option><option value="vi">Tiếng Việt</option></select></label>
      <button type="button" className="button primary" disabled={busy} onClick={() => void savePreferences()}>{vi ? 'Lưu tùy chọn' : 'Save preferences'}</button>
    </section>
    {admin && <>
      <section className="mission-card clan-detail">
        <h2>{vi ? 'Mẫu thông báo' : 'Notification templates'}</h2>
        <form className="attendance-create" onSubmit={(event) => void publishTemplate(event)}>
          <label className="course-field"><span>Template ID</span><input required maxLength={64} value={templateId} onChange={(event) => setTemplateId(event.target.value)} /></label>
          <label className="course-field"><span>Event key</span><input required maxLength={80} value={templateEvent} onChange={(event) => setTemplateEvent(event.target.value)} /></label>
          <label className="course-field"><span>{vi ? 'Ngôn ngữ' : 'Locale'}</span><select value={templateLocale} onChange={(event) => setTemplateLocale(event.target.value as typeof templateLocale)}><option value="en">English</option><option value="vi">Tiếng Việt</option></select></label>
          <label className="course-field"><span>{vi ? 'Tiêu đề email/thông báo' : 'Subject'}</span><input required maxLength={200} value={templateSubject} onChange={(event) => setTemplateSubject(event.target.value)} /></label>
          <label className="course-field"><span>{vi ? 'Nội dung' : 'Body'}</span><textarea required maxLength={4000} value={templateBody} onChange={(event) => setTemplateBody(event.target.value)} /></label>
          <label className="assessment-attempt-heading"><span>{vi ? 'Thông báo bắt buộc' : 'Mandatory notice'}</span><input type="checkbox" checked={templateMandatory} onChange={(event) => setTemplateMandatory(event.target.checked)} /></label>
          {(['inApp', 'email', 'realtime'] as const).map((channel) => <label key={channel}><input type="checkbox" checked={templateChannels.includes(channel)} onChange={(event) => toggleChannel(channel, event.target.checked)} /> {channel}</label>)}
          <button className="button primary" disabled={busy || !templateId.trim() || !templateEvent.trim() || !templateSubject.trim() || !templateBody.trim() || templateChannels.length === 0}>{vi ? 'Tạo phiên bản mẫu' : 'Create template version'}</button>
        </form>
        {templates.map((item) => <div className="assessment-attempt-heading" key={`${item.templateId}:${item.version}:${item.locale}`}><span><strong>{item.templateId} · v{item.version}</strong><small style={{ display: 'block' }}>{item.eventKey} · {item.locale} · {item.channels.join(', ')}{item.mandatory ? ' · required' : ''}</small></span></div>)}
      </section>
      <section className="mission-card clan-detail">
        <h2>{vi ? 'Gửi thông báo' : 'Send a notice'}</h2>
        <form className="attendance-create" onSubmit={(event) => void sendNotice(event)}>
          <label className="course-field"><span>{vi ? 'Mẫu' : 'Template'}</span><select required value={selectedTemplate} onChange={(event) => setSelectedTemplate(event.target.value)}><option value="">—</option>{Array.from(new Set(templates.map((item) => item.templateId))).map((id) => <option key={id} value={id}>{id}</option>)}</select></label>
          <label className="course-field"><span>{vi ? 'Phạm vi' : 'Audience'}</span><select value={audience} onChange={(event) => setAudience(event.target.value as typeof audience)}><option value="system" disabled={!admin}>{vi ? 'Toàn hệ thống (Admin)' : 'System-wide (Admin)'}</option><option value="course">{vi ? 'Khóa học được phân quyền' : 'Authorized course'}</option></select></label>
          {audience === 'course' && <><label className="course-field"><span>{vi ? 'Khóa học' : 'Course'}</span><select required value={courseId} onChange={(event) => setCourseId(event.target.value)}><option value="">—</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label><label className="course-field"><span>{vi ? 'Nhóm/section' : 'Group/section'}</span><input maxLength={128} value={sectionId} onChange={(event) => setSectionId(event.target.value)} /></label><label className="course-field"><span>{vi ? 'Vai trò nhận' : 'Recipient role'}</span><select value={targetRole} onChange={(event) => setTargetRole(event.target.value)}><option value="">{vi ? 'Học viên và nhân sự' : 'Students and staff'}</option><option value="student">Student</option><option value="teacher">Teacher</option><option value="teachingAssistant">TA</option></select></label></>}
          <label className="course-field"><span>{vi ? 'Mức độ' : 'Severity'}</span><select value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)}><option value="ordinary">Ordinary</option><option value="critical">Critical</option><option value="emergency">Emergency</option></select></label>
          {severity === 'ordinary' && <label className="assessment-attempt-heading"><span>{vi ? 'Yêu cầu xác nhận' : 'Require acknowledgement'}</span><input type="checkbox" checked={requireAck} onChange={(event) => setRequireAck(event.target.checked)} /></label>}
          <button className="button primary" disabled={busy || !selectedTemplate || (audience === 'course' && !courseId)}>{vi ? 'Gửi thông báo' : 'Send notice'}</button>
        </form>
        {delivery && <p>{vi ? 'Đã đọc' : 'Read'} {delivery.readCount}/{delivery.recipientCount} · {vi ? 'Đã xác nhận' : 'Acknowledged'} {delivery.acknowledgedCount}/{delivery.recipientCount} · Email {delivery.emailDelivered} delivered / {delivery.emailQueued} queued / {delivery.emailFailed} failed / {delivery.emailSuppressed} suppressed.</p>}
      </section>
    </>}
    {error && <p className="alert alert-error" role="alert">{error}</p>}{notice && <p className="alert alert-success" role="status">{notice}</p>}
  </div>;
}
