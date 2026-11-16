'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { courseError, translate, type Locale } from '../lib/courseApi';

type Mission = { missionId: string; version: number; title: string; eventKey: string; targetCount: number; cadence: string; timeZone: string; eligibleRoles: string[]; reward: { exp: number; coin: number }; progress?: number; status: string; canClaim?: boolean };
const eventOptions = [
  ['practice.attempt', 'Practice attempts'], ['practice.correct', 'Correct practice answers'],
  ['attendance.present', 'Attendance check-ins'], ['lesson.completed', 'Lesson completions'],
  ['assessment.submitted', 'Submitted assessments'],
] as const;

export function MissionsWorkspace({ locale, roles }: { locale: Locale; roles: string[] }) {
  const t = translate(locale);
  const admin = roles.includes('admin');
  const [items, setItems] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [missionId, setMissionId] = useState('');
  const [title, setTitle] = useState('');
  const [eventKey, setEventKey] = useState<string>(eventOptions[0][0]);
  const [targetCount, setTargetCount] = useState(1);
  const [cadence, setCadence] = useState<'daily' | 'weekly' | 'once'>('daily');
  const [rewardExp, setRewardExp] = useState(50);
  const [rewardCoin, setRewardCoin] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await api<{ items: Mission[] }>(admin ? '/admin/missions' : '/me/missions');
      setItems(result.items);
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setLoading(false); }
  }, [admin, locale]);
  useEffect(() => { void load(); }, [load]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const version = Math.max(0, ...items.filter((item) => item.missionId === missionId).map((item) => item.version)) + 1;
    try {
      await api('/admin/missions', 'POST', {
        missionId, version, title, eventKey, targetCount, cadence,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok',
        eligibleRoles: [], reward: { exp: rewardExp, coin: rewardCoin },
      });
      setNotice(t('Mission version created. New progress starts with its cycle.', 'Đã tạo phiên bản nhiệm vụ. Tiến độ mới bắt đầu theo chu kỳ của nhiệm vụ.'));
      await load();
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  };
  const claim = async (item: Mission) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/missions/${encodeURIComponent(item.missionId)}/claims`, 'POST', undefined, { 'Idempotency-Key': crypto.randomUUID() });
      setNotice(t('Reward claimed and added to your wallet.', 'Đã nhận thưởng vào ví của bạn.'));
      await load();
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  };

  return <section className="panel missions-workspace">
    <div className="panel-heading"><div><p className="eyebrow">BUILD-031</p><h2>{t('Missions & rewards', 'Nhiệm vụ và phần thưởng')}</h2><p>{t('Progress comes from verified LMS activity. The client cannot report mission completion.', 'Tiến độ lấy từ hoạt động LMS đã xác minh; trình duyệt không thể tự báo hoàn thành.')}</p></div><button type="button" className="button secondary" disabled={loading} onClick={() => void load()}>{t('Refresh', 'Tải lại')}</button></div>
    {error && <div role="alert" className="alert alert-error">{error}</div>}{notice && <p role="status" className="alert alert-success">{notice}</p>}
    {loading ? <p role="status">{t('Loading missions…', 'Đang tải nhiệm vụ…')}</p> : items.length === 0 ? <p className="course-empty">{t('No active missions are available.', 'Hiện chưa có nhiệm vụ đang mở.')}</p> : <div className="mission-card-grid">{items.map((item) => <article className="mission-card" key={`${item.missionId}-${item.version}`}><div className="assessment-attempt-heading"><div><span className="eyebrow">{item.cadence} · v{item.version}</span><h3>{item.title}</h3></div><span className="state-badge">{item.status}</span></div><p>{item.progress ?? 0} / {item.targetCount} · {item.eventKey}</p><progress max={item.targetCount} value={item.progress ?? 0} aria-label={`${item.title} progress`} /><div className="mission-reward">{item.reward.exp.toLocaleString(locale)} EXP · {item.reward.coin.toLocaleString(locale)} Coin</div>{item.canClaim && <button type="button" className="button primary" disabled={busy} onClick={() => void claim(item)}>{t('Claim reward', 'Nhận thưởng')}</button>}</article>)}</div>}
    {admin && <form className="mission-policy-form" onSubmit={(event) => void create(event)}><h3>{t('Publish mission version', 'Tạo phiên bản nhiệm vụ')}</h3><div className="report-form-grid"><label className="course-field"><span>{t('Stable mission ID', 'Mã nhiệm vụ')}</span><input required pattern="[A-Za-z0-9._-]+" maxLength={64} value={missionId} onChange={(event) => setMissionId(event.target.value)} /></label><label className="course-field"><span>{t('Mission title', 'Tên nhiệm vụ')}</span><input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="course-field"><span>{t('Trusted event', 'Sự kiện được xác minh')}</span><select value={eventKey} onChange={(event) => setEventKey(event.target.value)}>{eventOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="course-field"><span>{t('Target count', 'Số lần cần đạt')}</span><input type="number" min={1} max={1000000} value={targetCount} onChange={(event) => setTargetCount(Number(event.target.value))} /></label><label className="course-field"><span>{t('Cycle', 'Chu kỳ')}</span><select value={cadence} onChange={(event) => setCadence(event.target.value as 'daily' | 'weekly' | 'once')}><option value="daily">{t('Daily', 'Hằng ngày')}</option><option value="weekly">{t('Weekly', 'Hằng tuần')}</option><option value="once">{t('One time · claimable', 'Một lần · cần nhận')}</option></select></label><label className="course-field"><span>{t('EXP reward', 'Thưởng EXP')}</span><input type="number" min={0} value={rewardExp} onChange={(event) => setRewardExp(Number(event.target.value))} /></label><label className="course-field"><span>{t('Coin reward', 'Thưởng Coin')}</span><input type="number" min={0} value={rewardCoin} onChange={(event) => setRewardCoin(Number(event.target.value))} /></label></div><button type="submit" className="button primary" disabled={busy}>{t('Create version', 'Tạo phiên bản')}</button><p className="service-note">{t('Only registered event keys can issue rewards. Daily and weekly rewards are automatic; one-time rewards require an idempotent claim.', 'Chỉ sự kiện đã đăng ký mới phát thưởng. Nhiệm vụ ngày/tuần tự động trả thưởng; nhiệm vụ một lần cần nhận thưởng chống lặp.')}</p></form>}
  </section>;
}
