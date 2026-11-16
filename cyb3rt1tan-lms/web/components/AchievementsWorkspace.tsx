'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { courseError, translate, type Locale } from '../lib/courseApi';

type Tier = { tierKey: string; name: string; thresholdCount: number; exp: number; coin: number; title: string | null; icon: string; color: string; unlocked: boolean };
type Achievement = { achievementId: string; version: number; title: string; description: string; eventKey: string; status: string; progress: number; tiers: Tier[] };
type Equipped = { title: string; source?: 'achievement' | 'shop'; achievementId?: string; version?: number; tierKey?: string; inventoryId?: string } | null;
type DraftTier = { tierKey: string; name: string; thresholdCount: number; exp: number; coin: number; title: string };
const events = ['practice.attempt', 'practice.correct', 'attendance.present', 'lesson.completed', 'assessment.submitted'];
const initialTiers: DraftTier[] = [
  { tierKey: 'bronze', name: 'Bronze', thresholdCount: 1, exp: 50, coin: 0, title: '' },
  { tierKey: 'silver', name: 'Silver', thresholdCount: 5, exp: 100, coin: 0, title: '' },
];

export function AchievementsWorkspace({ locale, roles }: { locale: Locale; roles: string[] }) {
  const t = translate(locale);
  const admin = roles.includes('admin');
  const [items, setItems] = useState<Achievement[]>([]);
  const [equipped, setEquipped] = useState<Equipped>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [achievementId, setAchievementId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventKey, setEventKey] = useState(events[0]);
  const [tiers, setTiers] = useState(initialTiers);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [result, titleResult] = await Promise.all([
        api<{ items: Achievement[] }>(admin ? '/admin/achievements' : '/me/achievements'),
        api<Equipped>('/me/title'),
      ]);
      setItems(result.items); setEquipped(titleResult);
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setLoading(false); }
  }, [admin, locale]);
  useEffect(() => { void load(); }, [load]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const version = Math.max(0, ...items.filter((item) => item.achievementId === achievementId).map((item) => item.version)) + 1;
    try {
      await api('/admin/achievements', 'POST', {
        achievementId, version, title, description, eventKey, eligibleRoles: [],
        tiers: tiers.map((tier) => ({ ...tier, title: tier.title || null, icon: 'fa-medal', color: '#176b87' })),
      });
      setNotice(t('Achievement version published.', 'Đã công bố phiên bản thành tích.'));
      await load();
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  };
  const equip = async (item: Achievement, tier: Tier) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<NonNullable<Equipped>>('/me/titles/equip', 'POST', {
        achievementId: item.achievementId, version: item.version, tierKey: tier.tierKey,
      });
      setEquipped(result); setNotice(t('Title equipped.', 'Đã trang bị danh hiệu.'));
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  };
  const clear = async () => {
    setBusy(true); setError(''); setNotice('');
    try { await api('/me/title', 'DELETE'); setEquipped(null); setNotice(t('Title cleared.', 'Đã gỡ danh hiệu.')); }
    catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  };

  return <section className="panel achievements-workspace">
    <div className="panel-heading"><div><p className="eyebrow">BUILD-031</p><h2>{t('Achievements', 'Thành tích')}</h2><p>{t('Unlocks are earned from verified activity and rewards are recorded in your wallet.', 'Thành tích mở khóa từ hoạt động đã xác minh; phần thưởng được ghi vào ví.')}</p></div><button type="button" className="button secondary" disabled={loading} onClick={() => void load()}>{t('Refresh', 'Tải lại')}</button></div>
    {error && <div role="alert" className="alert alert-error">{error}</div>}{notice && <p role="status" className="alert alert-success">{notice}</p>}
    <div className="achievement-equipped"><span>{t('Equipped title', 'Danh hiệu đang dùng')}</span><strong>{equipped?.title || t('None', 'Chưa có')}</strong>{equipped && <button type="button" className="button secondary" disabled={busy} onClick={() => void clear()}>{t('Clear title', 'Gỡ danh hiệu')}</button>}</div>
    {loading ? <p role="status">{t('Loading achievements…', 'Đang tải thành tích…')}</p> : items.length ? <div className="achievement-card-grid">{items.map((item) => <article className="achievement-card" key={`${item.achievementId}-${item.version}`}><div className="assessment-attempt-heading"><div><span className="eyebrow">v{item.version} · {item.eventKey}</span><h3>{item.title}</h3></div><span className="state-badge">{item.status}</span></div><p>{item.description}</p><div>{t('Progress', 'Tiến độ')}: {item.progress} / {Math.max(...item.tiers.map((tier) => tier.thresholdCount))}</div><div className="achievement-tier-list">{item.tiers.map((tier) => <div className="achievement-tier" key={tier.tierKey}><div><strong>{tier.name}</strong><span>{tier.thresholdCount} · {tier.exp} EXP · {tier.coin} Coin</span></div>{tier.unlocked ? <span className="state-badge">{t('Unlocked', 'Đã mở')}</span> : <span className="state-badge">{t('Locked', 'Chưa mở')}</span>}{tier.unlocked && tier.title && <button type="button" className="button secondary" disabled={busy} onClick={() => void equip(item, tier)}>{equipped?.title === tier.title ? t('Equipped', 'Đang dùng') : t('Equip title', 'Trang bị danh hiệu')}</button>}</div>)}</div></article>)}</div> : <p className="course-empty">{t('No active achievements yet.', 'Chưa có thành tích nào.')}</p>}
    {admin && <form className="achievement-editor" onSubmit={(event) => void create(event)}><h3>{t('Create achievement version', 'Tạo phiên bản thành tích')}</h3><div className="report-form-grid"><label className="course-field"><span>{t('Stable achievement ID', 'Mã thành tích')}</span><input required pattern="[A-Za-z0-9._-]+" maxLength={64} value={achievementId} onChange={(event) => setAchievementId(event.target.value)} /></label><label className="course-field"><span>{t('Achievement name', 'Tên thành tích')}</span><input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="course-field"><span>{t('Trusted event', 'Sự kiện đã xác minh')}</span><select value={eventKey} onChange={(event) => setEventKey(event.target.value)}>{events.map((key) => <option key={key}>{key}</option>)}</select></label><label className="course-field"><span>{t('Description', 'Mô tả')}</span><input maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} /></label></div><h4>{t('Achievement tiers', 'Các bậc thành tích')}</h4>{tiers.map((tier, index) => <div className="achievement-tier-fields" key={tier.tierKey}>{(['tierKey', 'name', 'thresholdCount', 'exp', 'coin', 'title'] as const).map((field) => <label className="course-field" key={field}><span>{field}</span><input required={field !== 'title'} type={['thresholdCount', 'exp', 'coin'].includes(field) ? 'number' : 'text'} min={field === 'thresholdCount' ? 1 : field === 'exp' || field === 'coin' ? 0 : undefined} maxLength={field === 'title' ? 80 : undefined} value={tier[field]} onChange={(event) => setTiers((current) => current.map((row, i) => i === index ? { ...row, [field]: ['thresholdCount', 'exp', 'coin'].includes(field) ? Number(event.target.value) : event.target.value } : row))} /></label>)}<button type="button" className="button secondary" disabled={tiers.length <= 1} aria-label={`${t('Remove tier', 'Xóa bậc')} ${tier.name}`} onClick={() => setTiers((current) => current.filter((_, i) => i !== index))}>{t('Remove', 'Xóa')}</button></div>)}<div className="rank-policy-actions"><button type="button" className="button secondary" onClick={() => setTiers((current) => [...current, { tierKey: `tier-${current.length + 1}`, name: `Tier ${current.length + 1}`, thresholdCount: (current.at(-1)?.thresholdCount || 0) + 1, exp: 0, coin: 0, title: '' }])}>{t('Add tier', 'Thêm bậc')}</button><button type="submit" className="button primary" disabled={busy}>{t('Publish version', 'Công bố phiên bản')}</button></div><p className="service-note">{t('Tiers must use increasing thresholds. Only registered event types are accepted; no custom scripts or client-reported unlocks.', 'Ngưỡng từng bậc phải tăng dần. Chỉ nhận sự kiện đã đăng ký; không dùng script tùy ý hoặc dữ liệu mở khóa từ trình duyệt.')}</p></form>}
  </section>;
}
