'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { courseError, translate, type Locale } from '../lib/courseApi';

type Rank = { track: string; exp: number; policyVersion: number | null; current: { key: string; name: string; thresholdExp: number; icon: string; color: string; description: string } | null; next: { key: string; name: string; thresholdExp: number; icon: string; color: string; description: string } | null; progressPercent: number | null };
type Wallet = { exp: number; coin: number; expMultiplier: number; expMultiplierEndsAt: string | null; ranks: Rank[] };
type Ledger = { items: { id: string; currency: 'exp' | 'coin'; delta: number; source: string; reason: string; createdAt: string }[]; nextCursor: string | null };

export function WalletWorkspace({ locale }: { locale: Locale }) {
  const t = translate(locale);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [ledger, setLedger] = useState<Ledger>({ items: [], nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try {
      const [current, entries] = await Promise.all([api<Wallet>('/me/wallet'), api<Ledger>('/me/ledger?pageSize=50')]);
      setWallet(current); setLedger(entries);
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [locale]);
  return <section className="panel wallet-workspace">
    <div className="panel-heading"><div><p className="eyebrow">BUILD-031</p><h2>{t('Wallet & progression', 'Ví và tiến trình')}</h2><p>{t('Balances are calculated from your immutable activity ledger.', 'Số dư được tính từ sổ giao dịch bất biến của bạn.')}</p></div><button type="button" className="button secondary" disabled={loading} onClick={() => void load()}>{t('Refresh', 'Tải lại')}</button></div>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {loading && !wallet ? <p role="status">{t('Loading wallet…', 'Đang tải ví…')}</p> : wallet && <>
      <div className="wallet-balance-grid"><article><span>{t('Experience', 'Kinh nghiệm')}</span><strong>{wallet.exp.toLocaleString(locale)} EXP</strong>{wallet.expMultiplier > 1 && wallet.expMultiplierEndsAt && <small className="state-badge">×{wallet.expMultiplier} EXP · {t('active until', 'có hiệu lực đến')} {new Date(wallet.expMultiplierEndsAt).toLocaleString(locale)}</small>}</article><article><span>{t('Coins', 'Xu')}</span><strong>{wallet.coin.toLocaleString(locale)} Coin</strong></article></div>
      <h3>{t('Rank tracks', 'Các bậc hạng')}</h3>
      {wallet.ranks.length ? <div className="wallet-rank-grid">{wallet.ranks.map((rank) => <article key={rank.track} className="wallet-rank-card"><span>{rank.track === 'student' ? t('Student rank', 'Hạng học viên') : t('Staff rank', 'Hạng nhân sự')}</span><strong>{rank.current?.name || t('No active policy', 'Chưa có chính sách')}</strong><p>{rank.exp.toLocaleString(locale)} EXP{rank.next ? ` · ${t('Next', 'Tiếp theo')}: ${rank.next.name} (${rank.next.thresholdExp.toLocaleString(locale)} EXP)` : ''}</p>{rank.progressPercent !== null && <progress max={100} value={rank.progressPercent} aria-label={t('Progress to next rank', 'Tiến độ lên hạng')} />}</article>)}</div> : <p>{t('No rank track applies to this account.', 'Tài khoản chưa có nhánh xếp hạng.')}</p>}
      <h3>{t('Ledger history', 'Lịch sử giao dịch')}</h3>
      {ledger.items.length ? <div className="table-scroll"><table className="identity-table"><thead><tr><th>{t('When', 'Thời gian')}</th><th>{t('Currency', 'Đơn vị')}</th><th>{t('Change', 'Biến động')}</th><th>{t('Source', 'Nguồn')}</th><th>{t('Reason', 'Lý do')}</th></tr></thead><tbody>{ledger.items.map((entry) => <tr key={entry.id}><td>{new Date(entry.createdAt).toLocaleString(locale)}</td><td>{entry.currency.toUpperCase()}</td><td className={entry.delta > 0 ? 'ledger-positive' : 'ledger-negative'}>{entry.delta > 0 ? '+' : ''}{entry.delta.toLocaleString(locale)}</td><td>{entry.source}</td><td>{entry.reason || '—'}</td></tr>)}</tbody></table></div> : <p className="course-empty">{t('No ledger activity yet.', 'Chưa có giao dịch nào.')}</p>}
      <p className="service-note">{t('EXP and Coin can only change through authorized server-side actions. This screen cannot edit a balance.', 'EXP và Coin chỉ thay đổi qua thao tác được máy chủ xác thực. Màn hình này không thể sửa số dư.')}</p>
    </>}
  </section>;
}
