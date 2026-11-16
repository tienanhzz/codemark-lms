'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { CourseList } from '../lib/contracts';
import { rankAppearance } from '../lib/rankAppearance';
import { RankBadge } from './RankBadge';

type Track = 'student' | 'staff';
type RankEntry = {
  position: number;
  userId: string;
  displayName: string;
  username: string | null;
  exp: number;
  tier: { key: string; name: string; icon: string; color: string } | null;
};
type Ranking = { track: Track; total: number; items: RankEntry[] };

export function QuickLeaderboard({ locale, userId }: { locale: 'en' | 'vi'; userId: string }) {
  const t = (en: string, vi: string) => locale === 'vi' ? vi : en;
  const [track, setTrack] = useState<Track>('student');
  const [courseId, setCourseId] = useState('');
  const [courses, setCourses] = useState<CourseList['items']>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [coursesFailed, setCoursesFailed] = useState(false);
  const [data, setData] = useState<Ranking | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const requestId = useRef(0);
  const courseRequestId = useRef(0);
  const busy = useRef(false);
  const teachers = track === 'staff';
  const title = teachers ? 'Teacher Rank' : 'Player Rank';
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });

  const loadCourses = useCallback(async () => {
    const id = ++courseRequestId.current;
    setCoursesLoading(true);
    try {
      const result = await api<CourseList>('/courses?pageSize=100');
      if (id !== courseRequestId.current) return;
      setCourses(result.items);
      setCoursesFailed(false);
    } catch {
      if (id === courseRequestId.current) setCoursesFailed(true);
    } finally {
      if (id === courseRequestId.current) setCoursesLoading(false);
    }
  }, []);

  const loadRanking = useCallback(async () => {
    const id = ++requestId.current;
    busy.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const result = await api<Ranking>(`/leaderboard?track=${track}&q=${courseId ? `&courseId=${encodeURIComponent(courseId)}` : ''}`);
      if (id === requestId.current) setData(result);
    } catch {
      if (id === requestId.current) setFailed(true);
    } finally {
      if (id === requestId.current) {
        busy.current = false;
        setLoading(false);
      }
    }
  }, [track, courseId]);

  useEffect(() => {
    void loadCourses();
    return () => { courseRequestId.current++; };
  }, [loadCourses]);

  useEffect(() => {
    void loadRanking();
    const interval = window.setInterval(() => {
      if (!busy.current && document.visibilityState !== 'hidden') void loadRanking();
    }, 30000);
    return () => {
      requestId.current++;
      window.clearInterval(interval);
    };
  }, [loadRanking]);

  function resetRanking() {
    requestId.current++;
    setData(null);
    setFailed(false);
    setLoading(true);
  }

  function selectTrack(value: Track) {
    if (value === track) return;
    resetRanking();
    setTrack(value);
    setCourseId('');
  }

  function refresh() {
    void loadRanking();
    if (coursesFailed && !coursesLoading) void loadCourses();
  }

  return <section className="quick-rank" aria-label={title}>
    <header className="quick-rank-header">
      <h2>{title}</h2>
      <p><strong>{data ? number.format(data.total) : '…'}</strong> {teachers ? t('teachers', 'giảng viên') : t('warriors participating', 'chiến binh tham gia')}</p>
    </header>
    <div className="quick-rank-body">
      <div className="quick-rank-tabs" role="group" aria-label={t('Ranking audience', 'Đối tượng xếp hạng')}>
        <button type="button" aria-pressed={!teachers} onClick={() => selectTrack('student')}>{t('Students', 'Sinh viên')}</button>
        <button type="button" aria-pressed={teachers} onClick={() => selectTrack('staff')}>{t('Teachers', 'Giảng viên')}</button>
      </div>
      <label className="quick-rank-scope">
        <span>{t('Ranking scope', 'Phạm vi xếp hạng')}</span>
        <select value={courseId} disabled={coursesLoading && courses.length === 0} onChange={(event) => {
          resetRanking();
          setCourseId(event.target.value);
        }}>
          <option value="">{t('All', 'Tất cả')}</option>
          {courses.length > 0 && <optgroup label={t('Courses', 'Lớp học')}>{courses.map((course) => <option key={course.id} value={course.id}>{course.title} · {course.courseCode}</option>)}</optgroup>}
        </select>
      </label>
      {coursesLoading && <p className="quick-rank-note" role="status">{t('Loading course scopes…', 'Đang tải phạm vi lớp học…')}</p>}
      {coursesFailed && <p className="quick-rank-error" role="alert">{t('Unable to load course scopes. Refresh to try again.', 'Không thể tải phạm vi lớp học. Hãy làm mới để thử lại.')}</p>}
      {failed && <p className="quick-rank-error" role="alert">{t('Unable to load rankings. Refresh to try again.', 'Không thể tải bảng xếp hạng. Hãy làm mới để thử lại.')}</p>}
      <div className="quick-rank-scroll" aria-busy={loading} tabIndex={0} aria-label={t('Ranking results', 'Kết quả xếp hạng')}>
        {loading && !data ? <div className="quick-rank-state" role="status"><i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" /><p>{t('Loading rankings…', 'Đang tải bảng xếp hạng…')}</p></div>
          : data?.items.length ? <ol className="quick-rank-list" aria-label={teachers ? t('Teacher rankings', 'Xếp hạng giảng viên') : t('Student rankings', 'Xếp hạng sinh viên')}>
            {data.items.map((entry) => {
              const mine = entry.userId === userId;
              const appearance = rankAppearance(entry.tier);
              return <li key={entry.userId} className={`quick-rank-row${appearance ? ' rank-surface' : ''}`} style={appearance?.style} aria-current={mine ? 'true' : undefined}>
                <span className="quick-rank-position" aria-label={`${t('Rank', 'Hạng')} ${entry.position}`}>{entry.position}</span>
                <div className="quick-rank-person"><div><strong>{entry.displayName || entry.username}</strong>{mine && <span className="quick-rank-you">{t('You', 'Bạn')}</span>}</div><small>{entry.username}</small></div>
                <div className="quick-rank-score"><strong>{number.format(entry.exp)}</strong><small>EXP</small></div>
                <RankBadge tier={entry.tier} size="compact" showName={false} />
              </li>;
            })}
          </ol> : !failed && <div className="quick-rank-state"><i className="fa-solid fa-ranking-star" aria-hidden="true" /><p>{t('No achievements to display yet', 'Chưa có thành tích để hiển thị')}</p><small>{t('Rankings update as participants earn EXP.', 'Bảng xếp hạng cập nhật khi người tham gia tích lũy EXP.')}</small></div>}
      </div>
      <footer className="quick-rank-footer">
        <button type="button" disabled={loading} onClick={refresh}><i className={`fa-solid fa-arrow-rotate-right${loading ? ' fa-spin' : ''}`} aria-hidden="true" />{t('Refresh', 'Làm mới')}</button>
        <Link href="/leaderboard">{teachers ? t('Open Teacher Rank', 'Mở Teacher Rank') : t('Open Player Rank', 'Mở Player Rank')}<i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link>
      </footer>
    </div>
  </section>;
}
