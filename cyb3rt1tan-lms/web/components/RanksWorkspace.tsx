'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { courseError, translate, type Locale } from '../lib/courseApi';

type RoleTask = { taskKey: string; staffRole: string; title: string; requirementType: 'metric' | 'manual_review'; eventKey: string | null; targetCount: number | null };
type RequirementProgress = RoleTask & { progress: number; completed: boolean; requestStatus: string | null; canRequest: boolean };
type Tier = { key: string; name: string; thresholdExp: number; icon: string; color: string; description: string; position?: number; roleTasks?: RoleTask[] };
type Policy = { id: string; track: 'student' | 'staff'; version: number; status: string; effectiveAt: string | null; tiers: Tier[] };
type Rank = { track: string; exp: number; policyVersion: number | null; policyId?: string | null; current: Tier | null; next: Tier | null; progressPercent: number | null; nextRequirements?: RequirementProgress[] };
type Wallet = { exp: number; coin: number; ranks: Rank[] };
type TaskRequest = { id: string; userId: string; username: string | null; taskTitle: string; evidence: string; status: string; createdAt: string };
type DraftTask = { taskKey: string; staffRole: string; title: string; requirementType: 'metric' | 'manual_review'; eventKey: string | null; targetCount: number | null };
type DraftTier = { tierKey: string; name: string; thresholdExp: number; icon: string; color: string; description: string; roleTasks: DraftTask[] };

const defaultTiers: DraftTier[] = [
  { tierKey: 'starter', name: 'Starter', thresholdExp: 0, icon: 'fa-seedling', color: '#557c55', description: '', roleTasks: [] },
  { tierKey: 'scholar', name: 'Scholar', thresholdExp: 1000, icon: 'fa-book-open', color: '#176b87', description: '', roleTasks: [] },
  { tierKey: 'expert', name: 'Expert', thresholdExp: 5000, icon: 'fa-award', color: '#9b6a00', description: '', roleTasks: [] },
];
const staffRoleOptions = [['teacher', 'Teacher'], ['teachingAssistant', 'Teaching Assistant'], ['admin', 'Admin'], ['administrativeAssistant', 'Administrative Assistant'], ['researchAssistant', 'Research Assistant']] as const;
const rankMetricOptions = [['practice.attempt', 'Practice attempts'], ['practice.correct', 'Correct practice answers'], ['attendance.present', 'Attendance check-ins'], ['lesson.completed', 'Lesson completions'], ['assessment.submitted', 'Submitted assessments']] as const;

export function RanksWorkspace({ locale, roles }: { locale: Locale; roles: string[] }) {
  const t = translate(locale);
  const admin = roles.includes('admin');
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [taskRequests, setTaskRequests] = useState<TaskRequest[]>([]);
  const [track, setTrack] = useState<'student' | 'staff'>('student');
  const [tiers, setTiers] = useState(defaultTiers);
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [currentWallet, policyResult, requestResult] = await Promise.all([
        api<Wallet>('/me/wallet'),
        admin ? api<{ items: Policy[] }>('/admin/rank-policies') : Promise.resolve({ items: [] }),
        admin ? api<{ items: TaskRequest[] }>('/admin/rank-task-requests?status=pending') : Promise.resolve({ items: [] }),
      ]);
      setWallet(currentWallet); setPolicies(policyResult.items); setTaskRequests(requestResult.items);
    } catch (problem) { setError(courseError(problem, locale)); }
  }, [admin, locale]);
  useEffect(() => { void load(); }, [load]);

  const createDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const policy = await api<Policy>('/admin/rank-policies', 'POST', { track, tiers });
      setNotice(`${t('Draft policy created', 'Đã tạo bản nháp chính sách')} · ${track} v${policy.version}`);
      await load();
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  };

  const activate = async (policy: Policy) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/admin/rank-policies/${policy.id}/activation`, 'POST');
      setNotice(`${t('Policy activated', 'Đã kích hoạt chính sách')} · ${policy.track} v${policy.version}`);
      await load();
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  };

  const requestTask = async (rank: Rank, task: RequirementProgress) => {
    if (!rank.policyId || !rank.next) return;
    const key = `${rank.policyId}:${rank.next.key}:${task.taskKey}`;
    setBusy(true); setError(''); setNotice('');
    try {
      await api('/me/rank-task-requests', 'POST', {
        policyId: rank.policyId, tierKey: rank.next.key, taskKey: task.taskKey, evidence: evidence[key],
      }, { 'Idempotency-Key': crypto.randomUUID() });
      setNotice(t('Task evidence sent for Admin review.', 'Đã gửi minh chứng nhiệm vụ để Admin xem xét.'));
      await load();
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  };

  const decideTask = async (row: TaskRequest, decision: 'approve' | 'reject') => {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/admin/rank-task-requests/${row.id}/decisions`, 'POST', {
        decision, reason: decision === 'approve' ? 'Evidence reviewed and accepted.' : 'Evidence needs additional review.',
      });
      setNotice(t('Rank task review saved.', 'Đã lưu kết quả duyệt nhiệm vụ hạng.'));
      await load();
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  };

  const updateTask = (tierIndex: number, taskIndex: number, update: Partial<DraftTask>) => setTiers(current => current.map((tier, i) => i === tierIndex
    ? { ...tier, roleTasks: tier.roleTasks.map((task, j) => j === taskIndex ? { ...task, ...update } : task) }
    : tier));

  return <section className="panel ranks-workspace">
    <div className="panel-heading"><div><p className="eyebrow">BUILD-031</p><h2>{t('Ranks & progression', 'Hạng và tiến trình')}</h2><p>{t('Ranks follow lifetime EXP and the active versioned policy. Staff promotion can also require verified metrics or an Admin-reviewed task.', 'Hạng dựa trên EXP tích lũy và chính sách đang áp dụng. Thăng hạng nhân sự có thể cần chỉ số tin cậy hoặc nhiệm vụ được Admin duyệt.')}</p></div><button type="button" className="button secondary" disabled={busy} onClick={() => void load()}>{t('Refresh', 'Tải lại')}</button></div>
    {error && <div className="alert alert-error" role="alert">{error}</div>}{notice && <p className="alert alert-success" role="status">{notice}</p>}
    {wallet && <div className="wallet-rank-grid">{wallet.ranks.map(rank => <article key={rank.track} className="wallet-rank-card">
      <span>{rank.track === 'student' ? t('Student track', 'Nhánh học viên') : t('Staff track', 'Nhánh nhân sự')}</span>
      <strong>{rank.current?.name || t('No active policy', 'Chưa có chính sách')}</strong>
      <p>{rank.exp.toLocaleString(locale)} EXP{rank.next ? ` · ${t('Next', 'Tiếp theo')}: ${rank.next.name} (${rank.next.thresholdExp.toLocaleString(locale)} EXP)` : ''}</p>
      {rank.progressPercent !== null && <progress max={100} value={rank.progressPercent} aria-label={t('Progress to next rank', 'Tiến độ lên hạng')} />}
      {rank.nextRequirements?.map(task => {
        const key = `${rank.policyId}:${rank.next?.key}:${task.taskKey}`;
        return <div className="rank-task-progress" key={`${task.staffRole}-${task.taskKey}`}>
          <div className="assessment-attempt-heading"><strong>{task.title}</strong><span className="state-badge">{task.staffRole} · {task.completed ? t('Complete', 'Hoàn thành') : task.requestStatus || `${task.progress}/${task.targetCount}`}</span></div>
          <small>{task.requirementType === 'metric' ? `${task.eventKey} · ${task.progress}/${task.targetCount}` : t('Admin-reviewed evidence required.', 'Cần minh chứng được Admin duyệt.')}</small>
          {task.canRequest && <><textarea minLength={20} maxLength={1000} aria-label={t('Task evidence', 'Minh chứng nhiệm vụ')} placeholder={t('Describe evidence for Admin review', 'Mô tả minh chứng để Admin xem xét')} value={evidence[key] || ''} onChange={event => setEvidence(current => ({ ...current, [key]: event.target.value }))} /><button type="button" className="button secondary" disabled={busy || (evidence[key] || '').trim().length < 20} onClick={() => void requestTask(rank, task)}>{t('Request task review', 'Gửi duyệt nhiệm vụ')}</button></>}
        </div>;
      })}
    </article>)}</div>}
    {admin && <>
      <h3>{t('Versioned policies', 'Chính sách theo phiên bản')}</h3>
      {!policies.length ? <p className="course-empty">{t('No rank policy exists yet.', 'Chưa có chính sách xếp hạng.')}</p> : <div className="rank-policy-list">{policies.map(policy => <article key={policy.id} className="rank-policy-card">
        <div><h4>{policy.track === 'student' ? t('Student', 'Học viên') : t('Staff', 'Nhân sự')} · v{policy.version}</h4><span className="state-badge">{policy.status}</span></div>
        <ol>{policy.tiers.map(tier => <li key={tier.key}><strong>{tier.name}</strong><span>{tier.thresholdExp.toLocaleString(locale)} EXP</span><small>{tier.description || tier.key}</small>{tier.roleTasks?.map(task => <small key={`${task.staffRole}-${task.taskKey}`}>{task.staffRole}: {task.title} · {task.requirementType === 'metric' ? `${task.eventKey} × ${task.targetCount}` : t('review required', 'cần duyệt')}</small>)}</li>)}</ol>
        {policy.status === 'draft' && <button type="button" className="button primary" disabled={busy} onClick={() => void activate(policy)}>{t('Activate policy', 'Kích hoạt chính sách')}</button>}
      </article>)}</div>}
      <h3>{t('Pending staff task reviews', 'Nhiệm vụ nhân sự chờ duyệt')}</h3>
      {taskRequests.length ? <div className="mission-card-grid">{taskRequests.map(row => <article className="mission-card" key={row.id}><span className="eyebrow">{row.username} · {row.taskTitle}</span><p>{row.evidence}</p><div className="assessment-action-row"><button type="button" className="button primary" disabled={busy} onClick={() => void decideTask(row, 'approve')}>{t('Approve', 'Duyệt')}</button><button type="button" className="button secondary" disabled={busy} onClick={() => void decideTask(row, 'reject')}>{t('Reject', 'Từ chối')}</button></div></article>)}</div> : <p className="course-empty">{t('No task reviews are pending.', 'Không có nhiệm vụ chờ duyệt.')}</p>}
      <form className="rank-policy-form" onSubmit={event => void createDraft(event)}>
        <h3>{t('Create policy draft', 'Tạo bản nháp chính sách')}</h3>
        <label className="course-field"><span>{t('Track', 'Nhánh')}</span><select value={track} onChange={event => { const value = event.target.value as 'student' | 'staff'; setTrack(value); if (value === 'student') setTiers(current => current.map(tier => ({ ...tier, roleTasks: [] }))); }}><option value="student">{t('Student', 'Học viên')}</option><option value="staff">{t('Staff', 'Nhân sự')}</option></select></label>
        {tiers.map((tier, index) => <div className="rank-tier-fields" key={tier.tierKey}>
          <label className="course-field"><span>{t('Tier key', 'Mã bậc')}</span><input required maxLength={64} pattern="[a-zA-Z0-9._-]+" value={tier.tierKey} onChange={event => setTiers(current => current.map((row, i) => i === index ? { ...row, tierKey: event.target.value } : row))} /></label>
          <label className="course-field"><span>{t('Name', 'Tên')}</span><input required maxLength={120} value={tier.name} onChange={event => setTiers(current => current.map((row, i) => i === index ? { ...row, name: event.target.value } : row))} /></label>
          <label className="course-field"><span>{t('Minimum EXP', 'EXP tối thiểu')}</span><input required type="number" min={0} value={tier.thresholdExp} onChange={event => setTiers(current => current.map((row, i) => i === index ? { ...row, thresholdExp: Number(event.target.value) } : row))} /></label>
          <button type="button" className="button secondary" disabled={tiers.length <= 1} onClick={() => setTiers(current => current.filter((_, i) => i !== index))} aria-label={`${t('Remove tier', 'Xóa bậc')} ${tier.name}`}>{t('Remove', 'Xóa')}</button>
          {track === 'staff' && <div className="rank-role-task-editor"><strong>{t('Role-specific promotion tasks', 'Nhiệm vụ thăng hạng theo vai trò')}</strong>
            {tier.roleTasks.map((task, taskIndex) => <div className="rank-task-fields" key={`${task.staffRole}-${taskIndex}`}>
              <label className="course-field"><span>{t('Role', 'Vai trò')}</span><select value={task.staffRole} onChange={event => updateTask(index, taskIndex, { staffRole: event.target.value })}>{staffRoleOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label className="course-field"><span>{t('Task key', 'Mã nhiệm vụ')}</span><input required value={task.taskKey} pattern="[A-Za-z0-9._-]+" onChange={event => updateTask(index, taskIndex, { taskKey: event.target.value })} /></label>
              <label className="course-field"><span>{t('Requirement title', 'Tên yêu cầu')}</span><input required value={task.title} maxLength={160} onChange={event => updateTask(index, taskIndex, { title: event.target.value })} /></label>
              <label className="course-field"><span>{t('Requirement type', 'Loại yêu cầu')}</span><select value={task.requirementType} onChange={event => updateTask(index, taskIndex, event.target.value === 'metric' ? { requirementType: 'metric', eventKey: 'practice.correct', targetCount: 1 } : { requirementType: 'manual_review', eventKey: null, targetCount: null })}><option value="manual_review">{t('Manual review', 'Duyệt thủ công')}</option><option value="metric">{t('Trusted metric', 'Chỉ số tin cậy')}</option></select></label>
              {task.requirementType === 'metric' && <><label className="course-field"><span>{t('Trusted event', 'Sự kiện tin cậy')}</span><select value={task.eventKey || ''} onChange={event => updateTask(index, taskIndex, { eventKey: event.target.value })}>{rankMetricOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="course-field"><span>{t('Target', 'Mục tiêu')}</span><input type="number" min={1} value={task.targetCount || 1} onChange={event => updateTask(index, taskIndex, { targetCount: Number(event.target.value) })} /></label></>}
              <button type="button" className="button secondary" onClick={() => setTiers(current => current.map((row, i) => i === index ? { ...row, roleTasks: row.roleTasks.filter((_, j) => j !== taskIndex) } : row))}>{t('Remove task', 'Xóa nhiệm vụ')}</button>
            </div>)}
            <button type="button" className="button secondary" onClick={() => setTiers(current => current.map((row, i) => i === index ? { ...row, roleTasks: [...row.roleTasks, { taskKey: `task-${crypto.randomUUID().slice(0, 8)}`, staffRole: 'teacher', title: '', requirementType: 'manual_review', eventKey: null, targetCount: null }] } : row))}>{t('Add role task', 'Thêm nhiệm vụ vai trò')}</button>
          </div>}
        </div>)}
        <div className="rank-policy-actions"><button type="button" className="button secondary" disabled={tiers.length >= 50} onClick={() => setTiers(current => [...current, { tierKey: `tier-${current.length + 1}`, name: `Tier ${current.length + 1}`, thresholdExp: (current.at(-1)?.thresholdExp || 0) + 1000, icon: 'fa-star', color: '#176b87', description: '', roleTasks: [] }])}>{t('Add tier', 'Thêm bậc')}</button><button type="submit" className="button primary" disabled={busy}>{t('Save draft', 'Lưu bản nháp')}</button></div>
        <p className="service-note">{t('Metrics use deduplicated trusted domain events. Manual-review requirements need evidence and an independent Admin decision. Active policy versions remain immutable.', 'Chỉ số lấy từ sự kiện nghiệp vụ tin cậy đã chống trùng. Yêu cầu duyệt thủ công cần minh chứng và Admin độc lập xem xét. Phiên bản chính sách đang hoạt động là bất biến.')}</p>
      </form>
    </>}
  </section>;
}
