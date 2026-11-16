'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { api } from '../lib/api';
import { Modal } from './IdentityShared';

type TimetableSession = {
  id: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  title: string;
  startsAt: string;
  endsAt: string;
  room: string | null;
};
type Segment = {
  session: TimetableSession;
  start: number;
  end: number;
  endClock: number;
  lane: number;
  lanes: number;
};

const HOUR_HEIGHT = 64;

function calendarParts(date: Date, formatter: Intl.DateTimeFormat) {
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
}

function localDate(date: Date, formatter: Intl.DateTimeFormat) {
  const parts = calendarParts(date, formatter);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function startOfCivilDay(day: string, formatter: Intl.DateTimeFormat) {
  const midnight = Date.parse(`${day}T00:00:00Z`);
  const localStamp = (instant: number) => {
    const parts = calendarParts(new Date(instant), formatter);
    return Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
  };
  // Nearby offsets include both sides of a midnight transition. Calendar days
  // choose the earliest midnight when it repeats, unlike appointment inputs.
  const offsets = new Set(Array.from({ length: 17 }, (_, index) => {
    const instant = midnight + (index - 8) * 6 * 3600000;
    return localStamp(instant) - instant;
  }));
  const candidates = [...offsets].map((offset) => midnight - offset);
  const midnights = candidates.filter((instant) => localStamp(instant) === midnight);
  if (midnights.length) return Math.min(...midnights);

  // If midnight was skipped, locate the first actual instant after the gap.
  // This also gives an entirely skipped civil date the following day's start.
  let lower = Math.min(...candidates), upper = Math.max(...candidates);
  while (upper - lower > 1) {
    const middle = Math.floor((lower + upper) / 2);
    if (localStamp(middle) < midnight) lower = middle;
    else upper = middle;
  }
  return upper;
}

// Civil-day arithmetic stays independent of the browser's timezone and DST.
function addDays(day: string, count: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function monday(day: string) {
  return addDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
}

function clock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function arrange(segments: Segment[]) {
  const ordered = segments.sort((a, b) => a.start - b.start || b.end - a.end || a.session.id.localeCompare(b.session.id));
  let group: Segment[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;
  const finishGroup = () => { group.forEach((segment) => { segment.lanes = laneEnds.length; }); };
  for (const segment of ordered) {
    if (segment.start >= groupEnd) {
      finishGroup();
      group = [];
      laneEnds = [];
    }
    const available = laneEnds.findIndex((end) => end <= segment.start);
    segment.lane = available < 0 ? laneEnds.length : available;
    laneEnds[segment.lane] = segment.end;
    group.push(segment);
    groupEnd = Math.max(...laneEnds);
  }
  finishGroup();
  return ordered;
}

function splitSessions(items: TimetableSession[], boundaries: number[], formatter: Intl.DateTimeFormat) {
  return boundaries.slice(0, -1).map((first, index) => {
    const last = boundaries[index + 1];
    const segments: Segment[] = [];
    if (last <= first) return segments;
    for (const session of items) {
      const start = Date.parse(session.startsAt), end = Date.parse(session.endsAt);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= first || start >= last || end <= start) continue;
      const localStart = calendarParts(new Date(Math.max(start, first)), formatter);
      const localEnd = calendarParts(new Date(Math.min(end, last)), formatter);
      const startMinute = Number(localStart.hour) * 60 + Number(localStart.minute);
      const endMinute = end >= last ? 1440 : Number(localEnd.hour) * 60 + Number(localEnd.minute);
      // Repeated DST hours can have an earlier end clock despite positive duration.
      // Keep the real label and use elapsed duration for that segment's geometry.
      const layoutEnd = endMinute > startMinute ? endMinute : Math.min(1440, startMinute + (Math.min(end, last) - Math.max(start, first)) / 60000);
      segments.push({ session, start: startMinute, end: layoutEnd, endClock: endMinute, lane: 0, lanes: 1 });
    }
    return arrange(segments);
  });
}

export function WeeklyTimetable({ locale, timeZone }: { locale: 'en' | 'vi'; timeZone: string }) {
  const t = (en: string, vi: string) => locale === 'vi' ? vi : en;
  const language = locale === 'vi' ? 'vi-VN' : 'en-US';
  const [weekOffset, setWeekOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [items, setItems] = useState<TimetableSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<TimetableSession | null>(null);
  const calendarFormatter = useMemo(() => new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }), [timeZone]);
  const today = localDate(new Date(), calendarFormatter);
  const firstDay = addDays(monday(today), weekOffset * 7);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(firstDay, index)), [firstDay]);
  const boundaries = useMemo(() => Array.from({ length: 8 }, (_, index) => startOfCivilDay(addDays(firstDay, index), calendarFormatter)), [firstDay, calendarFormatter]);
  const fromAt = new Date(boundaries[0]).toISOString();
  const toAt = new Date(boundaries[7]).toISOString();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    setItems([]);
    setSelected(null);
    void api<{ items: TimetableSession[] }>(`/timetable?fromAt=${encodeURIComponent(fromAt)}&toAt=${encodeURIComponent(toAt)}`)
      .then((result) => { if (active) setItems(result.items); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fromAt, toAt, revision]);

  const columns = useMemo(() => splitSessions(items, boundaries, calendarFormatter), [items, boundaries, calendarFormatter]);
  const segments = columns.flat();
  const firstHour = Math.min(6, ...segments.map((segment) => Math.floor(segment.start / 60)));
  const lastHour = Math.max(22, ...segments.map((segment) => Math.ceil(segment.end / 60)));
  const hours = Array.from({ length: lastHour - firstHour }, (_, index) => firstHour + index);
  const civilFormat = (day: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(language, { ...options, timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
  const fullDate = (day: string) => civilFormat(day, { dateStyle: 'full' });
  const actualDate = (value: string) => new Intl.DateTimeFormat(language, { timeZone, year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset', hourCycle: 'h23' }).format(new Date(value));
  const range = `${civilFormat(days[0], { day: 'numeric', month: 'short' })} – ${civilFormat(days[6], { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return <section className="weekly-timetable" aria-label={t('Weekly timetable', 'Thời khóa biểu tuần')}>
    <header className="timetable-heading">
      <div className="timetable-title"><span className="timetable-title-icon"><i className="fa-regular fa-calendar-days" aria-hidden="true" /></span><div><p className="eyebrow">{t('YOUR LEARNING WEEK', 'TUẦN HỌC CỦA BẠN')}</p><h2>{t('Weekly timetable', 'Thời khóa biểu tuần')}</h2></div></div>
      <span className="timetable-zone"><i className="fa-solid fa-globe" aria-hidden="true" />{timeZone.replaceAll('_', ' ')}</span>
    </header>
    <div className="timetable-toolbar">
      <div className="timetable-navigation">
        <button type="button" className="timetable-arrow" aria-label={t('Previous week', 'Tuần trước')} onClick={() => setWeekOffset((value) => value - 1)}><i className="fa-solid fa-chevron-left" aria-hidden="true" /></button>
        <button type="button" className="timetable-today" onClick={() => setWeekOffset(0)}>{t('Today', 'Hôm nay')}</button>
        <button type="button" className="timetable-arrow" aria-label={t('Next week', 'Tuần sau')} onClick={() => setWeekOffset((value) => value + 1)}><i className="fa-solid fa-chevron-right" aria-hidden="true" /></button>
      </div>
      <p className="timetable-range" aria-live="polite">{range}</p>
      <span className="timetable-count">{loading ? '—' : items.length} {t('sessions', 'buổi học')}</span>
    </div>
    <div className="timetable-content" aria-busy={loading}>
      {loading ? <div className="timetable-state" role="status"><i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" /><p>{t('Loading timetable…', 'Đang tải thời khóa biểu…')}</p></div>
        : failed ? <div className="timetable-state" role="alert"><i className="fa-solid fa-cloud-arrow-down" aria-hidden="true" /><h3>{t('Unable to load timetable', 'Không thể tải thời khóa biểu')}</h3><p>{t('Please try again to load your scheduled sessions.', 'Vui lòng thử lại để tải lịch học của bạn.')}</p><button type="button" className="button secondary" onClick={() => setRevision((value) => value + 1)}>{t('Try again', 'Thử lại')}</button></div>
        : <>
          {!items.length && <div className="timetable-empty" role="status"><i className="fa-regular fa-calendar-check" aria-hidden="true" /><div><strong>{t('No sessions scheduled this week', 'Chưa có buổi học trong tuần này')}</strong><p>{t('Scheduled course sessions will appear here.', 'Các buổi học đã được xếp lịch sẽ hiển thị tại đây.')}</p></div></div>}
          <div className="timetable-scroll" role="region" aria-label={t('Weekly timetable grid', 'Lưới thời khóa biểu tuần')} tabIndex={0}>
            <div className="timetable-grid" style={{ '--timetable-height': `${hours.length * HOUR_HEIGHT}px` } as CSSProperties}>
              <div className="timetable-corner">{t('Time', 'Giờ học')}</div>
              {days.map((day) => <div className={`timetable-day-heading${day === today ? ' is-today' : ''}`} key={day}><span>{civilFormat(day, { weekday: 'short' })}</span><strong>{civilFormat(day, { day: 'numeric' })}</strong>{day === today && <span className="timetable-today-dot" aria-label={t('Today', 'Hôm nay')} />}</div>)}
              <div className="timetable-hours">{hours.map((hour) => <div key={hour}><span>{clock(hour * 60)}</span></div>)}<span className="timetable-end-time">{clock(lastHour * 60)}</span></div>
              {columns.map((column, index) => <div key={days[index]} className={`timetable-day${days[index] === today ? ' is-today' : ''}`} role="group" aria-label={fullDate(days[index])}>
                {column.map((segment) => {
                  const event = segment.session;
                  const times = `${clock(segment.start)}–${clock(segment.endClock)}`;
                  const color = [...event.courseCode].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 3;
                  return <button type="button" key={event.id} className={`timetable-event timetable-event-${color}`} aria-label={`${event.courseCode} · ${event.title} · ${times}${event.room ? ` · ${event.room}` : ''}`} title={`${event.courseTitle} · ${event.title} · ${times}${event.room ? ` · ${event.room}` : ''}`} style={{ top: `${(segment.start - firstHour * 60) / 60 * HOUR_HEIGHT}px`, height: `${Math.max(8, (segment.end - segment.start) / 60 * HOUR_HEIGHT - 4)}px`, left: `calc(${segment.lane / segment.lanes * 100}% + 3px)`, width: `calc(${100 / segment.lanes}% - 6px)` }} onClick={() => setSelected(event)}>
                    <span className="timetable-event-code">{event.courseCode}</span><strong>{event.title}</strong><span className="timetable-event-time">{times}</span>{event.room && <span className="timetable-event-room"><i className="fa-solid fa-location-dot" aria-hidden="true" />{event.room}</span>}
                  </button>;
                })}
              </div>)}
            </div>
          </div>
          <footer className="timetable-footer"><span><i className="fa-solid fa-circle-info" aria-hidden="true" />{t('Select a session for details. Times use your selected timezone.', 'Chọn buổi học để xem chi tiết. Giờ học theo múi giờ bạn đã chọn.')}</span><span>{t('Monday – Sunday', 'Thứ Hai – Chủ nhật')}</span></footer>
        </>}
    </div>
    {selected && <Modal title={t('Session details', 'Chi tiết buổi học')} onClose={() => setSelected(null)}><div className="timetable-details"><span className="timetable-details-code">{selected.courseCode}</span><h3>{selected.title}</h3><p>{selected.courseTitle}</p><dl><div><dt>{t('Starts', 'Bắt đầu')}</dt><dd>{actualDate(selected.startsAt)}</dd></div><div><dt>{t('Ends', 'Kết thúc')}</dt><dd>{actualDate(selected.endsAt)}</dd></div>{selected.room && <div><dt>{t('Room', 'Phòng học')}</dt><dd>{selected.room}</dd></div>}<div><dt>{t('Timezone', 'Múi giờ')}</dt><dd>{timeZone}</dd></div></dl></div></Modal>}
  </section>;
}
