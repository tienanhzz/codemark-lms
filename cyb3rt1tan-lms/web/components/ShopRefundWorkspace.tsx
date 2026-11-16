'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { translate, type Locale } from '../lib/courseApi';

type RefundPolicy = { version: number; enabled: boolean; refundWindowHours: number; unusedOnly: boolean };
type Purchase = {
  id: string;
  itemName: string;
  quantity: number;
  totalCoin: number;
  totalExp: number;
  createdAt: string;
  refund: { id: string; status: string; reason: string } | null;
  canRequestRefund: boolean;
  refundUnavailableReason: string | null;
};
type Refund = {
  id: string;
  purchaseId: string;
  userId: string;
  itemName: string;
  reason: string;
  totalCoin: number;
  totalExp: number;
  status: string;
  createdAt: string;
};

export function ShopRefundWorkspace({ locale, roles }: { locale: Locale; roles: string[] }) {
  const t = translate(locale);
  const admin = roles.includes('admin');
  const [policy, setPolicy] = useState<RefundPolicy | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [hours, setHours] = useState(24);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [queue, setQueue] = useState<Refund[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const [current, history, pending] = await Promise.all([
        api<RefundPolicy>('/shop/refund-policy'),
        api<{ items: Purchase[] }>('/me/shop/purchases'),
        admin ? api<{ items: Refund[] }>('/admin/shop/refunds') : Promise.resolve({ items: [] as Refund[] }),
      ]);
      setPolicy(current);
      setEnabled(current.enabled);
      setHours(current.refundWindowHours);
      setPurchases(history.items);
      setQueue(pending.items);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request_failed');
    }
  }, [admin]);

  useEffect(() => { void load(); }, [load]);

  const publish = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const updated = await api<RefundPolicy>('/admin/shop/refund-policies', 'POST', {
        enabled, refundWindowHours: hours, unusedOnly: true,
      });
      setPolicy(updated);
      setNotice(t('Refund policy published for new purchases.', 'Đã công bố chính sách hoàn tiền cho giao dịch mua mới.'));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'request_failed'); }
    finally { setBusy(false); }
  };

  const requestRefund = async (purchase: Purchase) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/shop/purchases/${purchase.id}/refund-requests`, 'POST', {
        reason: reasons[purchase.id] || '',
      });
      setNotice(t('Refund request sent for Admin review.', 'Đã gửi yêu cầu hoàn tiền để Admin xét duyệt.'));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'request_failed'); }
    finally { setBusy(false); }
  };

  const decide = async (refund: Refund, decision: 'approve' | 'reject') => {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/admin/shop/refunds/${refund.id}/decisions`, 'POST', { decision }, {
        'Idempotency-Key': crypto.randomUUID(),
      });
      setNotice(decision === 'approve'
        ? t('Refund approved; Coin, EXP, inventory and stock were restored.', 'Đã duyệt hoàn tiền; Coin, EXP, kho và tồn hàng đã được khôi phục.')
        : t('Refund rejected; reserved items were returned to inventory.', 'Đã từ chối; vật phẩm được trả lại kho.'));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'request_failed'); }
    finally { setBusy(false); }
  };

  return <section className="panel missions-workspace">
    <div className="workspace-heading"><div><span className="eyebrow">{t('SHOP PURCHASE SUPPORT', 'HỖ TRỢ GIAO DỊCH SHOP')}</span><h2>{t('Purchase refunds', 'Hoàn tiền mua hàng')}</h2><p>{t('Refunds follow the purchase policy version and require every purchased item to remain unused and unequipped.', 'Yêu cầu áp dụng chính sách tại thời điểm mua; toàn bộ vật phẩm phải chưa dùng và chưa trang bị.')}</p></div>
      {policy && <span className="state-badge">{t('Policy version', 'Phiên bản chính sách')} {policy.version} · {policy.enabled ? t('Enabled', 'Đang bật') : t('Disabled', 'Đang tắt')}</span>}
    </div>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {notice && <div className="alert alert-success" role="status">{notice}</div>}

    {admin && policy && <article className="mission-card"><h3>{t('Admin refund policy', 'Chính sách hoàn tiền Admin')}</h3><p>{t('Each publication creates a version. Existing purchases keep their original rules.', 'Mỗi lần công bố tạo phiên bản mới. Giao dịch cũ giữ nguyên chính sách tại thời điểm mua.')}</p><div className="report-form-grid">
      <label className="course-field"><span>{t('Refund window (hours)', 'Thời hạn hoàn (giờ)')}</span><input type="number" min={1} max={168} value={hours} onChange={event => setHours(Number(event.target.value))} /></label>
      <label className="course-field course-check-field"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /><span>{t('Allow refund requests', 'Cho phép yêu cầu hoàn tiền')}</span></label>
    </div><p>{t('Unused items only. Requesting a refund reserves the items until Admin approval or rejection.', 'Chỉ hoàn vật phẩm chưa dùng. Khi gửi yêu cầu, vật phẩm được giữ cho đến khi Admin duyệt hoặc từ chối.')}</p><button className="button primary" disabled={busy || hours < 1 || hours > 168} onClick={() => void publish()}>{t('Publish policy version', 'Công bố phiên bản')}</button></article>}

    <h3>{t('Your purchases', 'Giao dịch mua của bạn')}</h3>
    {purchases.length ? <div className="mission-card-grid">{purchases.map(purchase => <article className="mission-card" key={purchase.id}>
      <div className="assessment-attempt-heading"><h3>{purchase.itemName}</h3><span className="state-badge">{purchase.refund?.status || t('Purchased', 'Đã mua')}</span></div>
      <p>{t('Quantity', 'Số lượng')}: {purchase.quantity} · {purchase.totalCoin.toLocaleString(locale)} Coin + {purchase.totalExp.toLocaleString(locale)} EXP</p>
      <small>{new Date(purchase.createdAt).toLocaleString(locale)}</small>
      {purchase.canRequestRefund && <><label className="course-field"><span>{t('Reason for refund (at least 10 characters)', 'Lý do hoàn tiền (ít nhất 10 ký tự)')}</span><textarea minLength={10} maxLength={1000} value={reasons[purchase.id] || ''} onChange={event => setReasons(current => ({ ...current, [purchase.id]: event.target.value }))} /></label><button className="button secondary" disabled={busy || (reasons[purchase.id] || '').trim().length < 10} onClick={() => void requestRefund(purchase)}>{t('Request refund', 'Yêu cầu hoàn tiền')}</button></>}
      {purchase.refund && <p>{purchase.refund.reason}</p>}
      {!purchase.refund && !purchase.canRequestRefund && <small>{t(purchase.refundUnavailableReason || 'Refund unavailable under the purchase policy.', purchase.refundUnavailableReason || 'Không thể hoàn tiền theo chính sách khi mua.')}</small>}
    </article>)}</div> : <p className="course-empty">{t('No purchases yet.', 'Chưa có giao dịch mua.')}</p>}

    {admin && <><h3>{t('Pending refund requests', 'Yêu cầu hoàn tiền đang chờ')}</h3>{queue.length ? <div className="mission-card-grid">{queue.map(refund => <article className="mission-card" key={refund.id}>
      <div className="assessment-attempt-heading"><h3>{refund.itemName}</h3><span className="state-badge">{refund.totalCoin.toLocaleString(locale)} Coin + {refund.totalExp.toLocaleString(locale)} EXP</span></div>
      <p>{refund.reason}</p><small>{t('Account', 'Tài khoản')} {refund.userId.slice(0, 8)} · {new Date(refund.createdAt).toLocaleString(locale)}</small>
      <div className="assessment-action-row"><button className="button primary" disabled={busy} onClick={() => void decide(refund, 'approve')}>{t('Approve and refund', 'Duyệt hoàn tiền')}</button><button className="button secondary" disabled={busy} onClick={() => void decide(refund, 'reject')}>{t('Reject and return items', 'Từ chối và trả vật phẩm')}</button></div>
    </article>)}</div> : <p className="course-empty">{t('No refund requests are pending.', 'Không có yêu cầu hoàn tiền đang chờ.')}</p>}</>}
  </section>;
}
