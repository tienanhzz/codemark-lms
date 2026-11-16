'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { courseError, translate, type Course } from '../lib/courseApi';
import type { Locale } from '../lib/workspaceCatalog';

type EventAward = { userId: string; name: string; placement: number; coinAwarded: number };
type StaffEvent = {
  id: string;
  courseId: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  prizeBudgetCoin: number;
  awardMode: 'winner_takes_all' | 'equal_split';
  status: 'funded' | 'paid' | 'cancelled';
  canManage: boolean;
  awards?: EventAward[];
};
type Member = { userId: string; officialName: string; status: string };

function localOffset(value: string, zone: string): string {
  const [date, time] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(wall));
  const n = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  const offset = Math.round(
    (Date.UTC(n.year!, n.month! - 1, n.day!, n.hour!, n.minute!) - wall) / 60000,
  );
  const sign = offset >= 0 ? '+' : '-';
  const absolute = Math.abs(offset);
  return `${date}T${time}:00${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

export function StaffEventsWorkspace({ locale }: { locale: Locale }) {
  const t = translate(locale);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState('');
  const course = courses.find((item) => item.id === courseId);
  const [events, setEvents] = useState<StaffEvent[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [budget, setBudget] = useState(100);
  const [awardMode, setAwardMode] = useState<'winner_takes_all' | 'equal_split'>(
    'winner_takes_all',
  );
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (id: string) => {
      if (!id) {
        setEvents([]);
        setMembers([]);
        return;
      }
      try {
        const results = await api<{ items: StaffEvent[] }>(`/courses/${id}/staff-events`);
        setEvents(results.items);
        const selectedCourse = courses.find((item) => item.id === id);
        if (selectedCourse?.permissions.includes('roster.read')) {
          const roster = await api<{ items: Member[] }>(
            `/courses/${id}/enrollments?status=active&pageSize=100`,
          );
          setMembers(roster.items);
        } else setMembers([]);
        setError('');
      } catch (problem) {
        setError(courseError(problem, locale));
      }
    },
    [courses, locale],
  );

  useEffect(() => {
    let cancelled = false;
    void api<{ items: Course[] }>('/courses?pageSize=100')
      .then((result) => {
        const visible = result.items.filter((item) => item.permissions.includes('course.read'));
        if (!cancelled) {
          setCourses(visible);
          if (visible[0]) setCourseId(visible[0].id);
        }
      })
      .catch((problem) => {
        if (!cancelled) setError(courseError(problem, locale));
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);
  useEffect(() => {
    void load(courseId);
  }, [courseId, load]);

  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(success);
      await load(courseId);
    } catch (problem) {
      setError(courseError(problem, locale));
    } finally {
      setBusy(false);
    }
  }

  const create = () => {
    if (!course) return;
    void act(
      () =>
        api(
          `/courses/${courseId}/staff-events`,
          'POST',
          {
            title,
            description,
            startsAt: localOffset(startsAt, course.timezone),
            endsAt: localOffset(endsAt, course.timezone),
            timezone: course.timezone,
            prizeBudgetCoin: budget,
            awardMode,
          },
          { 'Idempotency-Key': crypto.randomUUID() },
        ).then((result) => {
          setTitle('');
          return result;
        }),
      t('Event created and Coin reserve funded.', 'Đã tạo sự kiện và ký quỹ Coin.'),
    );
  };

  return (
    <section className="panel staff-events-workspace">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">BUILD-031</p>
          <h2>{t('Course events', 'Sự kiện khóa học')}</h2>
          <p>
            {t(
              'Fund a prize reserve from your wallet, then approve the final participants after the event ends.',
              'Trích quỹ giải thưởng từ ví, sau đó duyệt người nhận khi sự kiện kết thúc.',
            )}
          </p>
        </div>
      </div>
      {error && (
        <div role="alert" className="alert alert-error">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="alert alert-success">
          {notice}
        </div>
      )}
      {courses.length > 0 && (
        <label className="course-field">
          <span>{t('Course', 'Khóa học')}</span>
          <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
            {courses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.courseCode} · {item.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {course?.permissions.includes('events.manage') && (
        <form
          className="attendance-create"
          onSubmit={(event) => {
            event.preventDefault();
            create();
          }}
        >
          <h3>{t('Create and fund an event', 'Tạo và cấp quỹ sự kiện')}</h3>
          <label className="course-field">
            <span>{t('Title', 'Tên sự kiện')}</span>
            <input
              required
              minLength={3}
              maxLength={160}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="course-field">
            <span>{t('Description', 'Mô tả')}</span>
            <textarea
              maxLength={1000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="assessment-fields">
            <label className="course-field">
              <span>{t('Starts', 'Bắt đầu')}</span>
              <input
                type="datetime-local"
                required
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              />
            </label>
            <label className="course-field">
              <span>{t('Ends', 'Kết thúc')}</span>
              <input
                type="datetime-local"
                required
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
              />
            </label>
          </div>
          <div className="assessment-fields">
            <label className="course-field">
              <span>{t('Prize reserve (Coin)', 'Quỹ giải thưởng (Coin)')}</span>
              <input
                type="number"
                min={1}
                max={2000000000}
                required
                value={budget}
                onChange={(event) => setBudget(Number(event.target.value))}
              />
            </label>
            <label className="course-field">
              <span>{t('Award mode', 'Cách chia thưởng')}</span>
              <select
                value={awardMode}
                onChange={(event) => setAwardMode(event.target.value as typeof awardMode)}
              >
                <option value="winner_takes_all">
                  {t('Winner takes all', 'Một người nhận toàn bộ')}
                </option>
                <option value="equal_split">{t('Split equally', 'Chia đều')}</option>
              </select>
            </label>
          </div>
          <button className="button primary" disabled={busy || !startsAt || !endsAt}>
            {t('Fund event', 'Cấp quỹ')}
          </button>
        </form>
      )}
      <div className="mission-card-grid">
        {events.length === 0 ? (
          <p className="course-empty">{t('No course events yet.', 'Chưa có sự kiện nào.')}</p>
        ) : (
          events.map((item) => (
            <article className="mission-card" key={item.id}>
              <div className="assessment-attempt-heading">
                <div>
                  <span className="eyebrow">
                    {item.awardMode === 'equal_split'
                      ? t('Equal split', 'Chia đều')
                      : t('Winner takes all', 'Một người nhận toàn bộ')}
                  </span>
                  <h3>{item.title}</h3>
                </div>
                <span className="state-badge">{item.status}</span>
              </div>
              <p>{item.description}</p>
              <p>
                {new Date(item.startsAt).toLocaleString(locale)} –{' '}
                {new Date(item.endsAt).toLocaleString(locale)} · {item.timezone}
              </p>
              <div className="mission-reward">
                {item.prizeBudgetCoin.toLocaleString(locale)} Coin {t('funded', 'đã ký quỹ')}
              </div>
              {item.canManage && item.status === 'funded' && (
                <>
                  <label className="course-field">
                    <span>{t('Approved participants', 'Người nhận được duyệt')}</span>
                    <select
                      multiple
                      size={Math.min(Math.max(members.length, 2), 6)}
                      value={selected[item.id] || []}
                      onChange={(event) =>
                        setSelected((current) => ({
                          ...current,
                          [item.id]: Array.from(
                            event.target.selectedOptions,
                            (option) => option.value,
                          ),
                        }))
                      }
                    >
                      {members.map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.officialName}
                        </option>
                      ))}
                    </select>
                    <small>
                      {t(
                        'Only students with active course membership are eligible.',
                        'Chỉ học viên đang ghi danh khóa học mới đủ điều kiện.',
                      )}
                    </small>
                  </label>
                  <div className="assessment-action-row">
                    <button
                      className="button primary"
                      type="button"
                      disabled={
                        busy ||
                        !(selected[item.id] || []).length ||
                        (item.awardMode === 'winner_takes_all' && selected[item.id]?.length !== 1)
                      }
                      onClick={() =>
                        void act(
                          () =>
                            api(
                              `/staff-events/${item.id}/results/approval`,
                              'POST',
                              { participantIds: selected[item.id] },
                              { 'Idempotency-Key': crypto.randomUUID() },
                            ),
                          t('Results approved and prizes paid.', 'Đã duyệt kết quả và trả thưởng.'),
                        )
                      }
                    >
                      {t('Approve results and pay', 'Duyệt kết quả và trả thưởng')}
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () =>
                            api(`/staff-events/${item.id}/cancellations`, 'POST', undefined, {
                              'Idempotency-Key': crypto.randomUUID(),
                            }),
                          t(
                            'Reserve refunded to event organizer.',
                            'Đã hoàn quỹ cho người tổ chức.',
                          ),
                        )
                      }
                    >
                      {t('Cancel and refund', 'Hủy và hoàn quỹ')}
                    </button>
                  </div>
                </>
              )}
              {item.awards?.length ? (
                <div>
                  <h4>{t('Approved awards', 'Giải thưởng đã duyệt')}</h4>
                  {item.awards.map((award) => (
                    <p key={award.userId}>
                      {award.name} · {award.coinAwarded.toLocaleString(locale)} Coin
                    </p>
                  ))}
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
