'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import {
  courseError,
  courseWrite,
  displayDate,
  translate,
  zonedIso,
  type Course,
  type Locale,
  type PlanEntry,
  type TeachingSession,
} from '../lib/courseApi';
import { Modal, IdentityAlert } from './IdentityShared';
import { Empty, Field, FormActions } from './CourseShared';

type LessonTag = { id: string; names: Record<string, string>; status: string; selectable?: boolean; applicability?: string[] };

function dayKey(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(value));
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}-${parts.find((part) => part.type === 'day')?.value}`;
}

function localInput(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || '00';
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}`;
}

export function CoursePlanning({
  course,
  locale,
  onChange,
}: {
  course: Course;
  locale: Locale;
  onChange: () => Promise<void>;
}) {
  const t = translate(locale),
    path = `/courses/${course.id}`;
  const [entries, setEntries] = useState<PlanEntry[]>([]),
    [lessonTags, setLessonTags] = useState<LessonTag[]>([]),
    [sessions, setSessions] = useState<TeachingSession[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState<'plan' | 'session' | null>(null),
    [draft, setDraft] = useState<PlanEntry[]>([]),
    [calendar, setCalendar] = useState(false),
    [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    [exception, setException] = useState<TeachingSession | null>(null);
  const canWrite =
    course.permissions.includes('content.author') &&
    !['completed', 'archived'].includes(course.status);
  async function load() {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        api<{ entries: PlanEntry[] }>(path + '/lesson-plan'),
        api<{ items: TeachingSession[] }>(path + '/sessions'),
      ]);
      setEntries(p.entries);
      setSessions(s.items);
      setError('');
    } catch (e) {
      setError(courseError(e, locale));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [course.id, course.revision]);
  useEffect(() => {
    if (mode !== 'plan') return;
    let cancelled = false;
    void api<{ tags: LessonTag[] }>('/taxonomy').then((result) => {
      if (!cancelled) setLessonTags(result.tags);
    }).catch((problem) => { if (!cancelled) setError(courseError(problem, locale)); });
    return () => { cancelled = true; };
  }, [mode, course.id, locale]);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      if (mode === 'plan')
        await courseWrite(course, '/lesson-plan', 'PUT', {
          entries: draft.map((entry, index) => ({
            ...entry,
            outcomes: entry.outcomes.map((v) => v.trim()).filter(Boolean),
            position: index + 1,
          })),
        });
      else {
        const timezone = String(form.get('timezone'));
        const session = {
          startsAt: zonedIso(String(form.get('startsAt')), timezone),
          endsAt: zonedIso(String(form.get('endsAt')), timezone),
          timezone,
          room: String(form.get('room')) || null,
          onlineUrl: String(form.get('onlineUrl')) || null,
          sectionId: String(form.get('sectionId')) || null,
          lessonPlanEntryId: String(form.get('lessonPlanEntryId')) || null,
        };
        if (form.get('frequency'))
          await courseWrite(course, '/session-series', 'POST', {
            ...session,
            frequency: String(form.get('frequency')),
            interval: Number(form.get('interval')),
            occurrences: Number(form.get('occurrences')),
          });
        else await api(path + '/sessions', 'POST', session);
      }
      setMode(null);
      await onChange();
      await load();
    } catch (e) {
      setError(courseError(e, locale));
    } finally {
      setBusy(false);
    }
  }
  const edit = (index: number, patch: Partial<PlanEntry>) =>
    setDraft((list) => list.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  const calendarDays = useMemo(() => {
    const offset = (new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() + 6) % 7;
    const total = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
    return Array.from({ length: Math.ceil((offset + total) / 7) * 7 }, (_, i) => {
      const day = i - offset + 1;
      return day < 1 || day > total
        ? null
        : `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    });
  }, [calendarMonth]);
  async function saveException(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!exception) return;
    const form = new FormData(event.currentTarget);
    const timezone = exception.timezone;
    const starts = String(form.get('startsAt') || '');
    const ends = String(form.get('endsAt') || '');
    setBusy(true);
    setError('');
    try {
      await courseWrite(course, `/sessions/${exception.id}`, 'PATCH', {
        reason: String(form.get('reason')),
        status: String(form.get('status')),
        ...(starts && ends
          ? { startsAt: zonedIso(starts, timezone), endsAt: zonedIso(ends, timezone) }
          : {}),
        room: String(form.get('room')) || null,
      });
      setException(null);
      await onChange();
      await load();
    } catch (problem) {
      setError(courseError(problem, locale));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="identity-screen">
      <IdentityAlert text={error} />
      <section className="panel course-section">
        <div className="panel-heading">
          <div>
            <h2>{t('Lesson plan', 'Kế hoạch bài dạy')}</h2>
            <p>
              {t(
                'An editable plan with stable links to scheduled sessions.',
                'Kế hoạch có liên kết ổn định với các buổi học đã lên lịch.',
              )}
            </p>
          </div>
          {canWrite && (
            <button
              className="button secondary"
              disabled={loading}
              onClick={() => {
                setDraft(entries.map((e) => ({ ...e })));
                setMode('plan');
              }}
            >
              {t('Edit plan', 'Sửa kế hoạch')}
            </button>
          )}
        </div>
        {loading ? (
          <p role="status">{t('Loading…', 'Đang tải…')}</p>
        ) : !entries.length ? (
          <Empty locale={locale} />
        ) : (
          <ol className="lesson-list">
            {entries.map((entry) => (
              <li key={entry.entryId}>
                <span className="lesson-week">{entry.week}</span>
                <div>
                  <h3>{entry.topic}</h3>
                  {entry.content && <p className="plain-text">{entry.content}</p>}
                  {entry.reading && (
                    <p>
                      <strong>{t('Reading', 'Tài liệu đọc')}: </strong>
                      {entry.reading}
                    </p>
                  )}
                  {entry.outcomes.length > 0 && (
                    <ul>
                      {entry.outcomes.map((v, i) => (
                        <li key={i}>{v}</li>
                      ))}
                    </ul>
                  )}
                  <small>
                    {entry.estimatedHours} {t('study hours', 'giờ học')}
                  </small>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="panel course-section">
        <div className="panel-heading">
          <div>
            <h2>{t('Teaching schedule', 'Lịch giảng dạy')}</h2>
            <p>
              {t('Times shown in the course timezone: ', 'Hiển thị theo múi giờ khóa học: ')}
              {course.timezone}
            </p>
          </div>
          {canWrite && (
            <button className="button secondary" onClick={() => setMode('session')}>
              {t('Schedule session', 'Thêm buổi học')}
            </button>
          )}
        </div>
        <div className="form-actions">
          <button
            type="button"
            className={calendar ? 'button secondary' : 'button primary'}
            aria-pressed={!calendar}
            onClick={() => setCalendar(false)}
          >
            {t('List', 'Danh sách')}
          </button>
          <button
            type="button"
            className={calendar ? 'button primary' : 'button secondary'}
            aria-pressed={calendar}
            onClick={() => setCalendar(true)}
          >
            {t('Calendar', 'Lịch')}
          </button>
        </div>
        {!sessions.length ? (
          <Empty locale={locale} />
        ) : calendar ? (
          <div className="course-calendar" aria-label={t('Course calendar', 'Lịch khóa học')}>
            <div className="panel-heading">
              <button
                type="button"
                className="button secondary"
                aria-label={t('Previous month', 'Tháng trước')}
                onClick={() => setCalendarMonth((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}
              >
                ←
              </button>
              <h3>
                {new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en', {
                  month: 'long', year: 'numeric',
                }).format(calendarMonth)}
              </h3>
              <button
                type="button"
                className="button secondary"
                aria-label={t('Next month', 'Tháng sau')}
                onClick={() => setCalendarMonth((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}
              >
                →
              </button>
            </div>
            <div className="course-calendar-grid" role="grid">
              {(locale === 'vi' ? ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']).map((day) => (
                <strong role="columnheader" key={day}>{day}</strong>
              ))}
              {calendarDays.map((key, index) => (
                <div className="course-calendar-day" role="gridcell" key={key || `blank-${index}`}>
                  {key && <strong>{Number(key.slice(-2))}</strong>}
                  {sessions.filter((session) => key && dayKey(session.startsAt, course.timezone) === key).map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      className={`course-calendar-event ${session.status === 'cancelled' ? 'is-cancelled' : ''}`}
                      aria-label={`${displayDate(session.startsAt, locale, course.timezone)} · ${session.room || t('Session', 'Buổi học')}`}
                      disabled={!canWrite}
                      onClick={() => canWrite && setException(session)}
                    >
                      {new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en', {
                        timeZone: course.timezone, hour: '2-digit', minute: '2-digit',
                      }).format(new Date(session.startsAt))} · {session.room || t('Session', 'Buổi học')}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="session-list">
            {sessions.map((session) => (
              <article key={session.id} className={session.status === 'cancelled' ? 'is-cancelled' : ''}>
                <div className="session-date">
                  <i className="fa-regular fa-calendar" aria-hidden="true" />
                </div>
                <div>
                  <strong>{displayDate(session.startsAt, locale, course.timezone)}</strong>
                  <p>
                    {t('Until', 'Đến')} {displayDate(session.endsAt, locale, course.timezone)}
                  </p>
                  <p>
                    {session.room || t('No room assigned', 'Chưa có phòng')}
                    {session.sectionId && ` · ${session.sectionId}`}
                  </p>
                  {session.status === 'cancelled' && <strong>{t('Cancelled', 'Đã hủy')}</strong>}
                  {session.recurrenceIndex !== null && (
                    <small>{t('Recurring session', 'Buổi học lặp lại')} · {session.recurrenceIndex + 1}</small>
                  )}
                  {session.lessonPlanEntryId && (
                    <p>{entries.find((e) => e.entryId === session.lessonPlanEntryId)?.topic}</p>
                  )}
                  {session.onlineUrl && (
                    <a
                      className="text-link"
                      href={session.onlineUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('Open meeting', 'Mở phòng học trực tuyến')}{' '}
                      <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                    </a>
                  )}
                  {canWrite && (
                    <button type="button" className="button secondary" onClick={() => setException(session)}>
                      {t('Edit exception', 'Sửa ngoại lệ')}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {mode && (
        <Modal
          title={
            mode === 'plan'
              ? t('Edit lesson plan', 'Sửa kế hoạch bài dạy')
              : t('Schedule teaching session', 'Lên lịch buổi học')
          }
          onClose={() => setMode(null)}
          locked={busy}
        >
          <form className="course-form" onSubmit={save}>
            <IdentityAlert text={error} />
            {error && (
              <button
                type="button"
                className="button secondary"
                onClick={() => void onChange().then(load)}
              >
                {t('Reload course', 'Tải lại khóa học')}
              </button>
            )}
            {mode === 'plan' ? (
              <>
                <p className="service-note">
                  {t(
                    'Entries linked to sessions must be retained. Order is saved from top to bottom.',
                    'Phải giữ các mục đã liên kết lịch học. Thứ tự được lưu từ trên xuống dưới.',
                  )}
                </p>
                {draft.map((entry, index) => (
                  <fieldset className="course-entry-editor" key={entry.entryId || `new-${index}`}>
                    <legend>
                      {t('Entry', 'Mục')} {index + 1}
                    </legend>
                    <div className="course-form-grid">
                      <Field label={t('Week', 'Tuần')}>
                        <input
                          required
                          maxLength={80}
                          value={entry.week}
                          onChange={(e) => edit(index, { week: e.target.value })}
                        />
                      </Field>
                      <Field label={t('Topic', 'Chủ đề')}>
                        <input
                          required
                          maxLength={240}
                          value={entry.topic}
                          onChange={(e) => edit(index, { topic: e.target.value })}
                        />
                      </Field>
                    </div>
                    <Field label={t('Lesson tags', 'Thẻ bài học')}>
                      <select multiple value={entry.tagIds || []} onChange={(event) => edit(index, {
                        tagIds: Array.from(event.target.selectedOptions, (option) => option.value),
                      })}>
                        {(entry.tagIds || []).filter((id) => !lessonTags.some((tag) => tag.id === id)).map((id) => (
                          <option key={id} value={id}>{id} ({t('historical', 'lịch sử')})</option>
                        ))}
                        {lessonTags.filter((tag) => (entry.tagIds || []).includes(tag.id) || (
                          tag.status === 'active' && tag.selectable !== false && (!tag.applicability?.length || tag.applicability.includes('lesson'))
                        )).map((tag) => <option key={tag.id} value={tag.id}>{tag.names[locale] || tag.names.en || tag.id}</option>)}
                      </select>
                    </Field>
                    <Field label={t('Content', 'Nội dung')}>
                      <textarea
                        maxLength={5000}
                        rows={3}
                        value={entry.content}
                        onChange={(e) => edit(index, { content: e.target.value })}
                      />
                    </Field>
                    <Field label={t('Reading', 'Tài liệu đọc')}>
                      <textarea
                        maxLength={5000}
                        value={entry.reading}
                        onChange={(e) => edit(index, { reading: e.target.value })}
                      />
                    </Field>
                    <Field
                      label={t(
                        'Learning outcomes (one per line)',
                        'Kết quả học tập (mỗi dòng một mục)',
                      )}
                    >
                      <textarea
                        maxLength={12000}
                        value={entry.outcomes.join('\n')}
                        onChange={(e) => edit(index, { outcomes: e.target.value.split('\n') })}
                      />
                    </Field>
                    <Field label={t('Estimated hours', 'Số giờ dự kiến')}>
                      <input
                        type="number"
                        min={0}
                        max={10000}
                        step="0.5"
                        value={entry.estimatedHours}
                        onChange={(e) => edit(index, { estimatedHours: Number(e.target.value) })}
                      />
                    </Field>
                    <div className="course-row-actions">
                      <button
                        type="button"
                        className="button secondary"
                        disabled={index === 0}
                        onClick={() =>
                          setDraft((list) => {
                            const next = [...list];
                            [next[index - 1], next[index]] = [next[index], next[index - 1]];
                            return next;
                          })
                        }
                      >
                        {t('Move up', 'Lên trên')}
                      </button>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={sessions.some((s) => s.lessonPlanEntryId === entry.entryId)}
                        onClick={() => setDraft((list) => list.filter((_, i) => i !== index))}
                      >
                        {t('Remove entry', 'Xóa mục')}
                      </button>
                    </div>
                  </fieldset>
                ))}
                <button
                  type="button"
                  className="button secondary"
                  disabled={draft.length >= 100}
                  onClick={() =>
                    setDraft((list) => [
                      ...list,
                      {
                        week: String(list.length + 1),
                        topic: '',
                        content: '',
                        reading: '',
                        outcomes: [],
                        estimatedHours: 0,
                        position: list.length + 1,
                      },
                    ])
                  }
                >
                  {t('Add entry', 'Thêm mục')}
                </button>
              </>
            ) : (
              <>
                <div className="course-form-grid">
                  <Field label={t('Starts at', 'Bắt đầu')}>
                    <input name="startsAt" type="datetime-local" required />
                  </Field>
                  <Field label={t('Ends at', 'Kết thúc')}>
                    <input name="endsAt" type="datetime-local" required />
                  </Field>
                </div>
                <Field label={t('IANA timezone', 'Múi giờ IANA')}>
                  <input name="timezone" required defaultValue={course.timezone} maxLength={64} />
                </Field>
                <p className="service-note">
                  {t(
                    'Enter wall time in the selected timezone. Ambiguous daylight-saving times are rejected.',
                    'Nhập giờ địa phương theo múi giờ đã chọn. Thời điểm trùng giờ khi đổi giờ mùa hè sẽ bị từ chối.',
                  )}
                </p>
                <Field label={t('Room', 'Phòng học')}>
                  <input name="room" maxLength={240} />
                </Field>
                <Field label={t('Section', 'Nhóm lớp')}>
                  <input name="sectionId" maxLength={128} />
                </Field>
                <Field label={t('Online meeting URL (HTTPS)', 'URL phòng học trực tuyến (HTTPS)')}>
                  <input name="onlineUrl" type="url" pattern="https://.*" maxLength={2000} />
                </Field>
                <Field label={t('Lesson plan entry', 'Mục kế hoạch bài dạy')}>
                  <select name="lessonPlanEntryId">
                    <option value="">{t('No linked entry', 'Không liên kết')}</option>
                    {entries.map((e) => (
                      <option key={e.entryId} value={e.entryId}>
                        {e.week} · {e.topic}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('Repeat schedule', 'Lặp lịch')}>
                  <select name="frequency" defaultValue="">
                    <option value="">{t('One session', 'Một buổi')}</option>
                    <option value="weekly">{t('Weekly', 'Hàng tuần')}</option>
                    <option value="daily">{t('Daily', 'Hàng ngày')}</option>
                  </select>
                </Field>
                <div className="course-form-grid">
                  <Field label={t('Repeat every', 'Lặp mỗi')}>
                    <input name="interval" type="number" min={1} max={4} defaultValue={1} />
                  </Field>
                  <Field label={t('Number of sessions', 'Số buổi')}>
                    <input name="occurrences" type="number" min={2} max={52} defaultValue={8} />
                  </Field>
                </div>
                <p className="field-help">
                  {t('Repeating schedules are bounded to 52 sessions. Local wall time is preserved across daylight-saving changes.', 'Lịch lặp giới hạn tối đa 52 buổi và giữ giờ địa phương khi đổi giờ mùa hè.')}
                </p>
              </>
            )}
            <FormActions locale={locale} busy={busy} onClose={() => setMode(null)} />
          </form>
        </Modal>
      )}
      {exception && (
        <Modal
          title={t('Schedule exception', 'Ngoại lệ lịch học')}
          onClose={() => setException(null)}
          locked={busy}
        >
          <form className="course-form" onSubmit={saveException}>
            <IdentityAlert text={error} />
            <p className="service-note">
              {t('This change applies to this session only. Enter a reason for the course history.', 'Thay đổi chỉ áp dụng cho buổi này. Nhập lý do để lưu vào lịch sử khóa học.')}
            </p>
            <Field label={t('Session status', 'Trạng thái buổi học')}>
              <select name="status" defaultValue={exception.status}>
                <option value="scheduled">{t('Scheduled', 'Đã lên lịch')}</option>
                <option value="cancelled">{t('Cancelled', 'Đã hủy')}</option>
              </select>
            </Field>
            <div className="course-form-grid">
              <Field label={t('Rescheduled start', 'Giờ bắt đầu mới')}>
                <input name="startsAt" type="datetime-local" defaultValue={localInput(exception.startsAt, exception.timezone)} />
              </Field>
              <Field label={t('Rescheduled end', 'Giờ kết thúc mới')}>
                <input name="endsAt" type="datetime-local" defaultValue={localInput(exception.endsAt, exception.timezone)} />
              </Field>
            </div>
            <Field label={t('Room', 'Phòng học')}>
              <input name="room" maxLength={240} defaultValue={exception.room || ''} />
            </Field>
            <Field label={t('Reason', 'Lý do')}>
              <textarea name="reason" required minLength={1} maxLength={500} />
            </Field>
            <FormActions locale={locale} busy={busy} onClose={() => setException(null)} />
          </form>
        </Modal>
      )}
    </div>
  );
}
