'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { rankAppearance } from '../lib/rankAppearance';
import { RankBadge } from './RankBadge';

type Track = 'student' | 'staff';
type RankEntry = {
  position: number;
  userId: string;
  displayName: string;
  username: string | null;
  exp: number;
  tier?: { key: string; name: string; thresholdExp: number; icon: string; color: string; description: string } | null;
};
type Leaderboard = { track: Track; total: number; items: RankEntry[] };

function initials(entry: RankEntry): string {
  return (entry.displayName || entry.username || '').trim().split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase();
}

export function LeaderboardWorkspace({ locale, userId }: { locale: 'en' | 'vi'; userId?: string }) {
  const t = (en: string, vi: string) => locale === 'vi' ? vi : en;
  const [track, setTrack] = useState<Track>('student');
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const teachers = track === 'staff';
  const number = new Intl.NumberFormat(locale);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('track') === 'staff') setTrack('staff');
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    setData(null);
    const load = async () => {
      try {
        const result = await api<Leaderboard>(`/leaderboard?track=${track}&q=${encodeURIComponent(query.trim())}`);
        if (active) setData(result);
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    const timer = query.trim() ? window.setTimeout(() => void load(), 300) : undefined;
    if (timer === undefined) void load();
    return () => { active = false; window.clearTimeout(timer); };
  }, [track, query, revision]);

  function selectTrack(value: Track) {
    if (track === value) return;
    setTrack(value);
    setQuery('');
  }

  const podium = !query.trim() ? data?.items.slice(0, 3) || [] : [];
  return <section className="leaderboard-workspace" aria-label={t('Leaderboard', 'Bảng xếp hạng')}>
    <header className="leaderboard-heading">
      <div className="leaderboard-title">
        <span className="leaderboard-title-icon"><i className="fa-solid fa-ranking-star" aria-hidden="true" /></span>
        <div><p className="eyebrow">{t('KEEP GROWING', 'CÙNG NHAU TIẾN BỘ')}</p><h2>{t('Leaderboard', 'Bảng xếp hạng')}</h2></div>
      </div>
      <span className="leaderboard-total"><strong>{data ? number.format(data.total) : '—'}</strong> {query.trim() ? t('results', 'kết quả') : teachers ? t('teachers', 'giảng viên') : t('students', 'sinh viên')}</span>
    </header>

    <div className="leaderboard-toolbar">
      <div className="leaderboard-tabs" role="group" aria-label={t('Ranking audience', 'Đối tượng xếp hạng')}>
        <button type="button" aria-pressed={!teachers} onClick={() => selectTrack('student')}><i className="fa-solid fa-user-graduate" aria-hidden="true" />{t('Students', 'Sinh viên')}</button>
        <button type="button" aria-pressed={teachers} onClick={() => selectTrack('staff')}><i className="fa-solid fa-chalkboard-user" aria-hidden="true" />{t('Teachers', 'Giảng viên')}</button>
      </div>
      <label className="leaderboard-search"><i className="fa-solid fa-magnifying-glass" aria-hidden="true" /><input type="search" maxLength={100} value={query} aria-label={teachers ? t('Search teachers', 'Tìm giảng viên') : t('Search students', 'Tìm sinh viên')} placeholder={t('Search name or username…', 'Tìm tên hoặc tên đăng nhập…')} onChange={(event) => setQuery(event.target.value)} /></label>
    </div>

    <div className="leaderboard-content" aria-busy={loading}>
      {loading ? <div className="leaderboard-state" role="status"><i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" /><p>{t('Loading rankings…', 'Đang tải bảng xếp hạng…')}</p></div>
        : failed ? <div className="leaderboard-state leaderboard-error" role="alert"><i className="fa-solid fa-cloud-arrow-down" aria-hidden="true" /><h3>{t('Unable to load rankings', 'Không thể tải bảng xếp hạng')}</h3><p>{t('Please refresh to try again.', 'Hãy làm mới để thử lại.')}</p></div>
        : data?.items.length ? <>
          {podium.length > 0 && <section className="leaderboard-podium" aria-label={t('Top three', 'Ba vị trí dẫn đầu')}>
            {podium.map((entry, index) => <article key={entry.userId} className={`leaderboard-podium-card podium-${index + 1}${entry.tier ? ' rank-surface' : ''}`} style={rankAppearance(entry.tier)?.style} aria-current={entry.userId === userId ? 'true' : undefined}>
              <span className="leaderboard-podium-place"><i className={`fa-solid ${entry.position === 1 ? 'fa-crown' : 'fa-medal'}`} aria-hidden="true" /> {t('Rank', 'Hạng')} {entry.position}</span>
              {entry.tier ? <RankBadge tier={entry.tier} size="hero" /> : <span className="leaderboard-avatar" aria-hidden="true">{initials(entry)}</span>}
              <h3>{entry.displayName || entry.username}</h3>
              <p className="leaderboard-podium-score">{number.format(entry.exp)} <small>EXP</small></p>
            </article>)}
          </section>}
          <div className="leaderboard-table-scroll"><table className="leaderboard-table" aria-label={teachers ? t('Teacher rankings', 'Xếp hạng giảng viên') : t('Student rankings', 'Xếp hạng sinh viên')}>
            <thead><tr><th scope="col">{t('Rank', 'Hạng')}</th><th scope="col">{teachers ? t('Teacher', 'Giảng viên') : t('Student', 'Sinh viên')}</th><th scope="col">EXP</th><th scope="col">{t('Tier', 'Bậc hạng')}</th></tr></thead>
            <tbody>{data.items.map((entry) => <tr key={entry.userId} className={entry.tier ? 'rank-surface' : undefined} style={rankAppearance(entry.tier)?.style} aria-current={entry.userId === userId ? 'true' : undefined}>
              <td><span className={`leaderboard-position ${entry.position <= 3 ? `position-${entry.position}` : ''}`}>{entry.position}</span></td>
              <td><div className="leaderboard-person"><span className="leaderboard-row-avatar" aria-hidden="true">{initials(entry)}</span><div><strong>{entry.displayName || entry.username}</strong>{entry.userId === userId && <span className="leaderboard-you">{t('You', 'Bạn')}</span>}<small>{entry.username}</small></div></div></td>
              <td className="leaderboard-exp">{number.format(entry.exp)}</td>
              <td>{entry.tier ? <RankBadge tier={entry.tier} /> : <span className="muted">—</span>}</td>
            </tr>)}</tbody>
          </table></div>
        </> : <div className="leaderboard-state"><i className={`fa-solid ${query.trim() ? 'fa-magnifying-glass' : 'fa-ranking-star'}`} aria-hidden="true" /><h3>{query.trim() ? t('No matching participants', 'Không tìm thấy người phù hợp') : t('No achievements to display yet', 'Chưa có thành tích để hiển thị')}</h3><p>{query.trim() ? t('Try a different name or username.', 'Thử tên hoặc tên đăng nhập khác.') : t('Rankings will appear as learning activity earns EXP.', 'Bảng xếp hạng sẽ xuất hiện khi hoạt động học tập tích lũy EXP.')}</p></div>}
    </div>
    <footer className="leaderboard-footer"><p>{teachers ? t('Teaching contributions, ranked by EXP.', 'Đóng góp giảng dạy được xếp hạng theo EXP.') : t('Every learning milestone counts.', 'Mỗi cột mốc học tập đều đáng ghi nhận.')}</p><button type="button" className="button secondary" disabled={loading} onClick={() => setRevision((value) => value + 1)}><i className="fa-solid fa-arrow-rotate-right" aria-hidden="true" />{t('Refresh', 'Làm mới')}</button></footer>
  </section>;
}
