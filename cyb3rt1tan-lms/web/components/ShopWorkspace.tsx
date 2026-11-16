'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { translate, type Locale } from '../lib/courseApi';
import { ShopRefundWorkspace } from './ShopRefundWorkspace';

type Item = { id: string; itemKey: string; name: string; description: string; priceCoin: number; priceExp: number; currentPriceCoin: number; discountPercent: number; discountStartsAt: string | null; discountEndsAt: string | null; discountActive: boolean; status: string; stock: number; purchaseLimit: number; effectType: string; effectConfig?: Record<string, unknown>; tradeable: boolean };
type InventoryItem = { id: string; status: string; bound: boolean; equipped?: boolean; item: Item };
type MissionOption = { missionId: string; version: number; title: string; targetCount: number; status: string; eligibleRoles: string[] };

function dateTimeInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function ShopWorkspace({ locale, roles, inventoryOnly = false }: { locale: Locale; roles: string[]; inventoryOnly?: boolean }) {
  const admin = roles.includes('admin');
  const t = translate(locale);
  const [items, setItems] = useState<Item[]>([]);
  const [owned, setOwned] = useState<InventoryItem[]>([]);
  const [coin, setCoin] = useState(0);
  const [exp, setExp] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState(100);
  const [priceExp, setPriceExp] = useState(0);
  const [stock, setStock] = useState(25);
  const [tradeable, setTradeable] = useState(false);
  const [effectType, setEffectType] = useState('cosmetic');
  const [voucherExp, setVoucherExp] = useState(1000);
  const [titleText, setTitleText] = useState('');
  const [multiplierHours, setMultiplierHours] = useState(8);
  const [streakMissionId, setStreakMissionId] = useState('');
  const [missions, setMissions] = useState<MissionOption[]>([]);
  const [expMultiplier, setExpMultiplier] = useState(1);
  const [expMultiplierEndsAt, setExpMultiplierEndsAt] = useState<string | null>(null);
  const [discountItemId, setDiscountItemId] = useState('');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountStart, setDiscountStart] = useState('');
  const [discountEnd, setDiscountEnd] = useState('');

  const load = useCallback(async () => {
    try {
      const [catalog, inventory, wallet, missionCatalog] = await Promise.all([
        inventoryOnly ? Promise.resolve({ items: [] as Item[] }) : api<{ items: Item[] }>(admin ? '/admin/shop/items' : '/shop/items'),
        api<{ items: InventoryItem[] }>('/me/inventory'), api<{ coin: number; exp: number; expMultiplier?: number; expMultiplierEndsAt?: string | null }>('/me/wallet'),
        admin ? api<{ items: MissionOption[] }>('/admin/missions') : Promise.resolve({ items: [] as MissionOption[] }),
      ]);
      setItems(catalog.items); setOwned(inventory.items); setCoin(wallet.coin); setExp(wallet.exp); setExpMultiplier(wallet.expMultiplier ?? 1); setExpMultiplierEndsAt(wallet.expMultiplierEndsAt ?? null); setError('');
      setMissions(missionCatalog.items.filter(mission => mission.status === 'active' && mission.targetCount >= 4));
    } catch (e) { setError(e instanceof Error ? e.message : 'request_failed'); }
  }, [admin, inventoryOnly]);
  useEffect(() => { void load(); }, [load]);

  const buy = async (item: Item) => {
    setBusy(true); setError(''); setNotice('');
    try { await api('/shop/purchases', 'POST', { itemId: item.id, quantity: 1 }, { 'Idempotency-Key': crypto.randomUUID() }); setNotice(t('Purchase complete. Item added to your inventory.', 'Mua thành công. Vật phẩm đã được thêm vào kho.')); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'request_failed'); } finally { setBusy(false); }
  };
  const activate = async (item: InventoryItem) => {
    setBusy(true); setError(''); setNotice('');
    try { await api(`/inventory/${item.id}/activations`, 'POST'); setNotice(t('Item activated.', 'Đã kích hoạt vật phẩm.')); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'request_failed'); } finally { setBusy(false); }
  };
  const create = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try { await api('/admin/shop/items', 'POST', { itemKey: key, name, priceCoin: price, priceExp, stock, purchaseLimit: 10, effectType, effectConfig: effectType === 'title-token' ? { title: titleText } : effectType === 'exp-voucher' ? { exp: voucherExp } : effectType === 'exp-multiplier' ? { multiplier: 2, durationHours: multiplierHours } : effectType === 'streak-boost' ? { missionId: streakMissionId, durationHours: multiplierHours } : {}, tradeable: ['title-token', 'exp-voucher', 'exp-multiplier', 'streak-boost'].includes(effectType) ? false : tradeable, eligibleRoles: ['student'] }); setKey(''); setName(''); setTitleText(''); setNotice(t('Catalog item published.', 'Đã đăng vật phẩm lên cửa hàng.')); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'request_failed'); } finally { setBusy(false); }
  };
  const saveDiscount = async (event: FormEvent) => {
    event.preventDefault();
    if (!discountItemId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const discountStartsAt = discountPercent === 0 ? null : new Date(discountStart).toISOString();
      const discountEndsAt = discountPercent === 0 ? null : new Date(discountEnd).toISOString();
      await api(`/admin/shop/items/${discountItemId}/discount`, 'PATCH', {
        discountPercent, discountStartsAt, discountEndsAt,
      });
      setNotice(t('Discount schedule updated.', 'Đã cập nhật lịch giảm giá.'));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'request_failed'); }
    finally { setBusy(false); }
  };

  return <section className="panel missions-workspace shop-workspace">
    <div className="workspace-heading"><div><span className="eyebrow">{inventoryOnly ? t('MY ITEMS', 'VẬT PHẨM CỦA TÔI') : t('COIN SHOP', 'CỬA HÀNG COIN')}</span><h2>{inventoryOnly ? t('Inventory', 'Kho vật phẩm') : t('Shop & inventory', 'Cửa hàng & kho')}</h2><p>{t('Purchases use your live Coin balance and grant bound items atomically.', 'Mua hàng trừ Coin thực tế và cấp vật phẩm khóa tài khoản trong cùng giao dịch.')}</p></div><div><strong className="wallet-coin">{coin.toLocaleString(locale)} Coin · {exp.toLocaleString(locale)} EXP</strong>{expMultiplier > 1 && expMultiplierEndsAt && <p className="state-badge">×{expMultiplier} EXP · {t("until", "đến")} {new Date(expMultiplierEndsAt).toLocaleString(locale)}</p>}</div></div>
    {error && <div className="alert alert-error" role="alert">{error}</div>}{notice && <div className="alert alert-success" role="status">{notice}</div>}
    <ShopRefundWorkspace locale={locale} roles={roles} />
    {!inventoryOnly && <><h3>{t('Available items', 'Vật phẩm đang bán')}</h3>{items.length ? <div className="mission-card-grid">{items.map(item => <article className="mission-card" key={item.id}><span className="eyebrow">{item.effectType}{admin && item.status !== 'active' ? ` · ${item.status}` : ''}</span><h3>{item.name}</h3><p>{item.description || t('Supported account item.', 'Vật phẩm tài khoản được hỗ trợ.')}</p>{item.effectType === 'title-token' && <p>{String(item.effectConfig?.title || item.name)}</p>}{item.effectType === 'exp-voucher' && <p>{Number(item.effectConfig?.exp || 0).toLocaleString(locale)} EXP</p>}{item.effectType === 'exp-multiplier' && <p>×2 EXP · {Number(item.effectConfig?.durationHours || 0)} {t('hours', 'giờ')}</p>}{item.effectType === 'streak-boost' && <p>{String(item.effectConfig?.missionId || '')} · {Number(item.effectConfig?.durationHours || 0)} {t('hours', 'giờ')}</p>}{item.discountActive ? <div className="mission-reward"><del>{item.priceCoin.toLocaleString(locale)} Coin</del> <strong>{item.currentPriceCoin.toLocaleString(locale)} Coin</strong>{item.priceExp > 0 && <> + {item.priceExp.toLocaleString(locale)} EXP</>} · {item.discountPercent}% {t('off', 'giảm')}</div> : <div className="mission-reward">{item.currentPriceCoin.toLocaleString(locale)} Coin{item.priceExp > 0 && <> + {item.priceExp.toLocaleString(locale)} EXP</>}</div>}<small>{item.stock} {t('in stock', 'còn hàng')}{item.discountPercent > 0 && !item.discountActive && item.discountStartsAt && item.discountEndsAt ? ` · ${t('sale scheduled', 'đã lên lịch giảm giá')}` : ''}</small>{!admin && <button type="button" className="button primary" disabled={busy || item.status !== 'active' || coin < item.currentPriceCoin || exp < item.priceExp} onClick={() => void buy(item)}>{coin < item.currentPriceCoin ? t('Not enough Coin', 'Không đủ Coin') : exp < item.priceExp ? t('Not enough EXP', 'Không đủ EXP') : t('Buy item', 'Mua vật phẩm')}</button>}{admin && <button type="button" className="button secondary" onClick={() => { setDiscountItemId(item.id); setDiscountPercent(item.discountPercent); setDiscountStart(dateTimeInput(item.discountStartsAt)); setDiscountEnd(dateTimeInput(item.discountEndsAt)); }}>{t('Configure discount', 'Cấu hình giảm giá')}</button>}</article>)}</div> : <p className="course-empty">{t('No catalog items are available yet.', 'Chưa có vật phẩm nào được mở bán.')}</p>}</>}
    <h3>{t('Your inventory', 'Kho của bạn')}</h3>{owned.length ? <div className="mission-card-grid">{owned.map(item => <article className="mission-card" key={item.id}><div className="assessment-attempt-heading"><h3>{item.item.name}</h3><span className="state-badge">{item.status}{item.bound ? ` · ${t('bound', 'đã khóa')}` : ''}</span></div><p>{item.item.description || item.item.effectType}</p>{item.item.effectType === 'title-token' && <p>{String(item.item.effectConfig?.title || item.item.name)}</p>}{item.item.effectType === 'exp-voucher' && <p>{Number(item.item.effectConfig?.exp || 0).toLocaleString(locale)} EXP</p>}{item.item.effectType === 'exp-multiplier' && <p>×2 EXP · {Number(item.item.effectConfig?.durationHours || 0)} {t('hours', 'giờ')}</p>}{item.item.effectType === 'streak-boost' && <p>{String(item.item.effectConfig?.missionId || '')} · {Number(item.item.effectConfig?.durationHours || 0)} {t('hours', 'giờ')}</p>}{item.status === 'available' && ['cosmetic', 'title-token', 'practice-boost', 'exp-voucher', 'exp-multiplier', 'streak-boost'].includes(item.item.effectType) && <button type="button" className="button secondary" disabled={busy || Boolean(item.equipped)} onClick={() => void activate(item)}>{item.equipped ? t('Equipped', 'Đang trang bị') : item.item.effectType === 'title-token' ? t('Equip title', 'Trang bị danh hiệu') : item.item.effectType === 'exp-voucher' ? t('Redeem EXP', 'Đổi EXP') : item.item.effectType === 'exp-multiplier' ? t('Activate x2 EXP', 'Kích hoạt x2 EXP') : item.item.effectType === 'streak-boost' ? t('Activate streak boost', 'Kích hoạt tăng streak') : t('Activate', 'Kích hoạt')}</button>}</article>)}</div> : <p className="course-empty">{t('Your inventory is empty.', 'Kho vật phẩm đang trống.')}</p>}
    {admin && !inventoryOnly && <form className="mission-policy-form" onSubmit={event => void create(event)}><h3>{t('Publish a supported shop item', 'Đăng vật phẩm được hỗ trợ')}</h3><div className="report-form-grid"><label className="course-field"><span>{t('Item key', 'Mã vật phẩm')}</span><input required value={key} onChange={e => setKey(e.target.value)} pattern="[A-Za-z0-9._-]+" /></label><label className="course-field"><span>{t('Name', 'Tên')}</span><input required value={name} onChange={e => setName(e.target.value)} maxLength={120} /></label><label className="course-field"><span>{t('Effect', 'Hiệu ứng')}</span><select value={effectType} onChange={e => setEffectType(e.target.value)}><option value="cosmetic">Cosmetic</option><option value="title-token">Title token</option><option value="exp-voucher">EXP voucher</option><option value="exp-multiplier">Timed x2 EXP</option><option value="streak-boost">Mission streak boost</option><option value="create-clan">Create Clan card</option><option value="rename-clan">Rename Clan card</option><option value="practice-boost">Practice boost</option></select></label>{effectType === 'title-token' && <label className="course-field"><span>{t('Title text', 'Tên danh hiệu')}</span><input required maxLength={80} value={titleText} onChange={e => setTitleText(e.target.value)} /></label>}{effectType === 'streak-boost' && <label className="course-field"><span>{t('Target mission', 'Nhiệm vụ mục tiêu')}</span><select required value={streakMissionId} onChange={e => setStreakMissionId(e.target.value)}><option value="">{t('Select a mission', 'Chọn nhiệm vụ')}</option>{Array.from(new Map([...missions].sort((a, b) => a.version - b.version).map(mission => [mission.missionId, mission])).values()).map(mission => <option key={mission.missionId} value={mission.missionId}>{mission.title} · {mission.missionId}</option>)}</select></label>}{effectType === 'exp-voucher' && <label className="course-field"><span>{t('EXP amount', 'Số EXP')}</span><input type="number" min={1} max={2000000000} required value={voucherExp} onChange={e => setVoucherExp(Number(e.target.value))} /></label>}{['exp-multiplier', 'streak-boost'].includes(effectType) && <label className="course-field"><span>{effectType === 'streak-boost' ? t('Boost duration (hours)', 'Thời lượng tăng streak (giờ)') : t('x2 EXP duration (hours)', 'Thời lượng x2 EXP (giờ)')}</span><input type="number" min={1} max={168} required value={multiplierHours} onChange={e => setMultiplierHours(Number(e.target.value))} /></label>}<label className="course-field"><span>{t('Coin price', 'Giá Coin')}</span><input type="number" min={0} value={price} onChange={e => setPrice(Number(e.target.value))} /></label><label className="course-field"><span>{t('EXP price', 'Giá EXP')}</span><input type="number" min={0} value={priceExp} onChange={e => setPriceExp(Number(e.target.value))} /></label><label className="course-field"><span>{t('Stock', 'Số lượng')}</span><input type="number" min={0} value={stock} onChange={e => setStock(Number(e.target.value))} /></label><label className="course-field course-check-field"><input type="checkbox" checked={tradeable} disabled={['title-token', 'exp-voucher', 'exp-multiplier', 'streak-boost'].includes(effectType)} onChange={e => setTradeable(e.target.checked)} /><span>{t('Allow player-to-player trading', 'Cho phép người chơi trao đổi')}</span></label></div><button className="button primary" disabled={busy || (effectType === 'streak-boost' && !streakMissionId)}>{t('Publish item', 'Đăng vật phẩm')}</button></form>}
    {admin && !inventoryOnly && discountItemId && <form className="mission-policy-form" onSubmit={event => void saveDiscount(event)}><h3>{t('Schedule item discount', 'Lên lịch giảm giá')}</h3><p>{items.find(item => item.id === discountItemId)?.name}</p><div className="report-form-grid"><label className="course-field"><span>{t('Discount percent', 'Phần trăm giảm')}</span><input type="number" min={0} max={100} required value={discountPercent} onChange={e => setDiscountPercent(Number(e.target.value))} /></label>{discountPercent > 0 && <><label className="course-field"><span>{t('Starts at', 'Bắt đầu')}</span><input type="datetime-local" required value={discountStart} onChange={e => setDiscountStart(e.target.value)} /></label><label className="course-field"><span>{t('Ends at', 'Kết thúc')}</span><input type="datetime-local" required value={discountEnd} onChange={e => setDiscountEnd(e.target.value)} /></label></>}</div><div className="assessment-action-row"><button className="button primary" disabled={busy}>{discountPercent === 0 ? t('Clear discount', 'Xóa giảm giá') : t('Save schedule', 'Lưu lịch')}</button><button type="button" className="button secondary" onClick={() => setDiscountItemId('')}>{t('Close', 'Đóng')}</button></div></form>}
  </section>;
}
