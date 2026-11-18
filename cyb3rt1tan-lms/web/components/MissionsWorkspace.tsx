'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { translate, type Locale } from '../lib/courseApi';
import { questError } from '../lib/questApi';
import { QuestEvidencePanel, type Evidence } from './QuestEvidencePanel';
import { QuestDocumentReader } from './QuestDocumentReader';
import './MissionsWorkspace.css';

export type Quest = { questCode: string; targetRole: string; category: string; questName: string; conditionDesc: string; resetType: string; limitRule: string; progress: number; status: string; canContinue?: boolean; actionHref: string; reviewRequired: boolean; reward: { exp: number; coin: number }; active: boolean; revision: number };

export function MissionsWorkspace({ locale, roles }: { locale: Locale; roles: string[] }) {
  const t = translate(locale);
  const ownRole = roles.includes('teacher') ? 'teacher' : roles.includes('student') ? 'student' : '';
  const admin = roles.includes('admin');
  const canManage = admin || roles.includes('teacher');
  const [tab, setTab] = useState<'mine' | 'manage'>('mine');
  const [items, setItems] = useState<Quest[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<Quest | null>(null);
  const [filter, setFilter] = useState('all');
  const [selectedEvidence, setSelectedEvidence] = useState('');
  const [readDocuments, setReadDocuments] = useState(false);
  const [showCheckin, setShowCheckin] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [catalog, proof] = await Promise.all([
        api<{ items: Quest[] }>(tab === 'manage' ? '/quests/manage' : '/quests/me'),
        api<{ items: Evidence[] }>(`/quests/evidence${tab === 'manage' ? '?review=true' : ''}`),
      ]);
      setItems(catalog.items.filter((item) => tab === 'manage' ? admin || item.targetRole === 'student' : item.targetRole === ownRole));
      setEvidence(proof.items);
    } catch (problem) { setError(questError(problem, locale)); }
    finally { setLoading(false); }
  }, [tab, ownRole, admin, locale]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setSelectedEvidence(query.get('evidence') || ''); setReadDocuments(query.has('resource')); setShowCheckin(query.has('checkin'));
  }, []);
  const execute = async (operation: () => Promise<unknown>, message: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); setNotice(message); await load(); }
    catch (problem) { setError(questError(problem, locale)); }
    finally { setBusy(false); }
  };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!editing) return;
    const data = new FormData(event.currentTarget);
    void execute(async () => {
      await api(`/quests/manage/${editing.questCode}`, 'PATCH', { questName: data.get('questName'), category: data.get('category'), conditionDesc: data.get('conditionDesc'), rewardExp: Number(data.get('rewardExp')), rewardCoin: Number(data.get('rewardCoin')), active: data.get('active') === 'on', revision: editing.revision });
      setEditing(null);
    }, t('Mission updated.', 'Đã cập nhật nhiệm vụ.'));
  };
  const visible = items.filter((item) => filter === 'all' || item.targetRole === filter);

  return <section className="panel missions-workspace workbook-quests">
    <div className="panel-heading"><div><p className="eyebrow">{t('LEARN · CONTRIBUTE · GROW', 'HỌC TẬP · ĐÓNG GÓP · TIẾN BỘ')}</p><h2>{t('Missions', 'Nhiệm vụ')}</h2><p>{t('Complete learning activities and follow your verified progress.', 'Hoàn thành hoạt động học tập, đóng góp cho lớp và theo dõi tiến độ được xác minh.')}</p></div><button className="button secondary" type="button" onClick={() => void load()} disabled={loading}>{t('Refresh', 'Tải lại')}</button></div>
    {canManage && <div className="quest-tabs" role="group" aria-label={t('Mission view', 'Chế độ nhiệm vụ')}><button type="button" aria-pressed={tab === 'mine'} onClick={() => { setTab('mine'); setFilter('all'); setEditing(null); }}>{t('My missions', 'Nhiệm vụ của tôi')}</button><button type="button" aria-pressed={tab === 'manage'} onClick={() => { setTab('manage'); setFilter('all'); }}>{t('Manage missions', 'Quản lý nhiệm vụ')}</button></div>}
    {error && <p className="alert alert-error" role="alert">{error}</p>}{notice && <p className="alert alert-success" role="status">{notice}</p>}
    {tab === 'mine' && ownRole === 'student' && showCheckin && <div className="quest-action-panel"><h3>{t('Daily attendance', 'Điểm danh hằng ngày')}</h3><p>{t('Confirm once each day. A 7-day streak also requires a learning activity every day.', 'Xác nhận một lần mỗi ngày. Chuỗi 7 ngày còn yêu cầu có hoạt động học tập mỗi ngày.')}</p><button type="button" className="button primary" disabled={busy} onClick={() => void execute(() => api('/quests/check-in', 'POST'), t('Attendance confirmed.', 'Đã xác nhận điểm danh.'))}>{t('Confirm today’s attendance', 'Xác nhận điểm danh hôm nay')}</button></div>}
    {tab === 'mine' && readDocuments && ownRole === 'student' && <QuestDocumentReader locale={locale} busy={busy} execute={execute} />}
    {tab === 'manage' && <div className="quest-management-heading"><h3>{t('Mission catalog management', 'Quản lý danh mục nhiệm vụ')}</h3><p>{admin ? t('Manage the student and lecturer catalogs separately from your personal missions.', 'Quản lý riêng danh mục sinh viên và giảng viên, tách biệt với nhiệm vụ cá nhân.') : t('You can edit student missions. Your lecturer missions remain in My missions.', 'Bạn được chỉnh sửa nhiệm vụ sinh viên. Nhiệm vụ giảng viên của bạn ở mục Nhiệm vụ của tôi.')}</p>{admin && <label className="course-field"><span>{t('Target role', 'Vai trò nhận nhiệm vụ')}</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">{t('All roles', 'Tất cả vai trò')}</option><option value="student">{t('Students', 'Sinh viên')}</option><option value="teacher">{t('Lecturers', 'Giảng viên')}</option></select></label>}</div>}
    {loading ? <p role="status">{t('Loading missions…', 'Đang tải nhiệm vụ…')}</p> : !visible.length ? <p className="course-empty">{t('No personal missions are assigned to this role.', 'Vai trò này không có nhiệm vụ cá nhân.')}</p> : <div className="quest-table-wrap" tabIndex={0} role="region" aria-label={t('Mission catalog', 'Danh sách nhiệm vụ')}><table className="quest-table"><thead><tr>{[t('Mission code', 'Mã nhiệm vụ'), t('Category', 'Nhóm'), t('Mission name', 'Tên nhiệm vụ'), t('Completion condition', 'Điều kiện hoàn thành'), t('Cycle', 'Chu kỳ'), t('Anti-spam limit', 'Giới hạn chống spam'), tab === 'manage' ? t('Target role', 'Vai trò') : t('Progress', 'Tiến độ'), t('Action', 'Thao tác')].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{visible.map((item) => <tr key={item.questCode}><td><code>{item.questCode}</code></td><td><span className="quest-category">{item.category}</span></td><td><strong>{item.questName}</strong>{item.reviewRequired && <small>{t('Requires evidence review', 'Cần xét duyệt minh chứng')}</small>}{(item.reward.exp > 0 || item.reward.coin > 0) && <small>{item.reward.exp} EXP · {item.reward.coin} Coin</small>}</td><td>{item.conditionDesc}</td><td><span className="quest-cycle">{item.resetType}</span></td><td>{item.limitRule}</td><td>{tab === 'manage' ? <span>{item.targetRole === 'student' ? t('Student', 'Sinh viên') : t('Lecturer', 'Giảng viên')} · {item.active ? t('Active', 'Đang mở') : t('Paused', 'Tạm dừng')}</span> : <span className={item.status === 'complete' ? 'quest-progress complete' : 'quest-progress'}>{item.progress || 0} {t('verified', 'lần đã xác minh')}</span>}</td><td>{tab === 'manage' ? <button type="button" className="button secondary" aria-label={t(`Edit ${item.questCode}`, `Chỉnh sửa ${item.questCode}`)} onClick={() => setEditing(item)}>{t('Edit', 'Chỉnh sửa')}</button> : item.status === 'complete' ? <span className="quest-completed"><i className="fa-solid fa-circle-check" aria-hidden="true" />{t('Completed', 'Đã hoàn thành')}{item.canContinue && <a href={item.actionHref} className="text-link">{t('Continue', 'Tiếp tục')}</a>}</span> : <a href={item.actionHref} className="button primary">{t('Do mission', 'Làm nhiệm vụ')}</a>}</td></tr>)}</tbody></table></div>}
    {editing && tab === 'manage' && <form className="quest-action-panel" onSubmit={save} key={editing.questCode}><h3>{t('Edit mission', 'Chỉnh sửa nhiệm vụ')} · {editing.questCode}</h3><div className="report-form-grid"><label className="course-field"><span>{t('Mission name', 'Tên nhiệm vụ')}</span><input name="questName" required maxLength={240} defaultValue={editing.questName} /></label><label className="course-field"><span>{t('Category', 'Nhóm nhiệm vụ')}</span><input name="category" required maxLength={100} defaultValue={editing.category} /></label><label className="course-field"><span>{t('Completion condition', 'Điều kiện hoàn thành')}</span><textarea name="conditionDesc" required maxLength={3000} defaultValue={editing.conditionDesc} /></label><label className="course-field"><span>{t('EXP reward', 'Thưởng EXP')}</span><input name="rewardExp" type="number" min={0} max={2000000000} defaultValue={editing.reward.exp} /></label><label className="course-field"><span>{t('Coin reward', 'Thưởng Coin')}</span><input name="rewardCoin" type="number" min={0} max={2000000000} defaultValue={editing.reward.coin} /></label><label className="quest-checkbox"><input type="checkbox" name="active" defaultChecked={editing.active} />{t('Mission active', 'Mở nhiệm vụ')}</label></div><p className="service-note">{t('Cycle and anti-spam rules follow the workbook. Unspecified rewards start at zero.', 'Chu kỳ và giới hạn chống spam được thực thi theo bảng gốc. Bảng gốc chưa quy định phần thưởng, giá trị ban đầu là 0.')}</p><button className="button primary" disabled={busy} type="submit">{t('Save changes', 'Lưu thay đổi')}</button> <button className="button secondary" type="button" onClick={() => setEditing(null)}>{t('Cancel', 'Hủy')}</button></form>}
    <QuestEvidencePanel locale={locale} manage={tab === 'manage'} items={items} evidence={evidence} selectedCode={selectedEvidence} onSubmitted={() => setSelectedEvidence('')} busy={busy} execute={execute} />
  </section>;
}
