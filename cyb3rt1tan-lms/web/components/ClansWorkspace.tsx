'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { courseError, translate } from '../lib/courseApi';
import type { Locale } from '../lib/workspaceCatalog';

type ClanMember = { userId: string; name: string; roleKey: string; isOwner: boolean };
type Pending = {
  id: string;
  userId: string;
  name: string;
  username: string;
  status: 'requested' | 'invited';
};
type ClanRole = { roleKey: string; name: string; permissions: string[] };
type Clan = {
  id: string;
  name: string;
  ownerId: string;
  level: number;
  clanExp: number;
  memberCount: number;
  memberCap: number;
  icon: string;
  color: string;
  isMember: boolean;
  canManageMembership: boolean;
  canManageRoles: boolean;
  myRequest?: { id: string; status: 'requested' | 'invited' };
  members?: ClanMember[];
  pending?: Pending[];
  roles?: ClanRole[];
  warRecord?: { wins: number; losses: number; draws: number };
};
type ClanWar = { id: string; title: string; clanA: { id: string; name: string }; clanB: { id: string; name: string }; startsAt: string; status: string; outcome: string | null; expReward: number; competitionType: 'war' | 'code' | 'writing'; participantReward: { exp: number; coin: number; itemName: string | null; itemQuantity: number }; participantsAwarded: number };
type ClanMission = { missionId: string; version: number; title: string; eventKey: string; targetCount: number; progress: number; status: string; cycle: string; reward: { clanExp: number; exp: number; coin: number } };
type ClanMissionPolicy = { id: string; missionId: string; version: number; title: string; status: string };
type ProposalCourse = { id: string; title: string; status: string; permissions: string[] };
type WarProposal = { id: string; courseTitle: string; authorName: string; title: string; description: string; clanA: { id: string; name: string }; clanB: { id: string; name: string }; startsAt: string; competitionType: 'war' | 'code' | 'writing' };
type Item = { id: string; status: string; item: { name: string; effectType: string } };
type RewardCatalogItem = { id: string; name: string; effectType: string; status: string; stock: number };
type WarParticipant = { userId: string; clanId: string; name: string };
type Candidate = { userId: string; username: string; name: string };
type LevelRule = { level: number; thresholdExp: number; memberCap: number; icon: string; color: string };

export function ClansWorkspace({ locale, userId, isAdmin }: { locale: Locale; userId: string; isAdmin: boolean }) {
  const t = translate(locale);
  const [clans, setClans] = useState<Clan[]>([]);
  const [leaderboard, setLeaderboard] = useState<Clan[]>([]);
  const [wars, setWars] = useState<ClanWar[]>([]);
  const [clanMissions, setClanMissions] = useState<ClanMission[]>([]);
  const [missionPolicies, setMissionPolicies] = useState<ClanMissionPolicy[]>([]);
  const [missionId, setMissionId] = useState('weekly-practice');
  const [missionTitle, setMissionTitle] = useState('Weekly practice together');
  const [missionEvent, setMissionEvent] = useState('practice.attempt');
  const [missionTarget, setMissionTarget] = useState(25);
  const [missionCadence, setMissionCadence] = useState<'daily' | 'weekly' | 'once'>('weekly');
  const [missionClanExp, setMissionClanExp] = useState(100);
  const [missionPersonalExp, setMissionPersonalExp] = useState(25);
  const [missionCoin, setMissionCoin] = useState(0);
  const [proposalCourses, setProposalCourses] = useState<ProposalCourse[]>([]);
  const [proposalCourseId, setProposalCourseId] = useState('');
  const [proposalTitle, setProposalTitle] = useState('');
  const [proposalDescription, setProposalDescription] = useState('');
  const [proposalType, setProposalType] = useState<'war' | 'code' | 'writing'>('war');
  const [proposalStart, setProposalStart] = useState('');
  const [proposalClanA, setProposalClanA] = useState('');
  const [proposalClanB, setProposalClanB] = useState('');
  const [warProposals, setWarProposals] = useState<WarProposal[]>([]);
  const [proposalExpReward, setProposalExpReward] = useState(100);
  const [proposalParticipantExp, setProposalParticipantExp] = useState(0);
  const [proposalParticipantCoin, setProposalParticipantCoin] = useState(0);
  const [proposalRewardItemId, setProposalRewardItemId] = useState('');
  const [proposalRewardItemQuantity, setProposalRewardItemQuantity] = useState(0);
  const [warTitle, setWarTitle] = useState('');
  const [warA, setWarA] = useState('');
  const [warB, setWarB] = useState('');
  const [warStart, setWarStart] = useState('');
  const [warReward, setWarReward] = useState(100);
  const [warType, setWarType] = useState<'war' | 'code' | 'writing'>('war');
  const [warParticipantExp, setWarParticipantExp] = useState(0);
  const [warParticipantCoin, setWarParticipantCoin] = useState(0);
  const [warRewardItemId, setWarRewardItemId] = useState('');
  const [warRewardItemQuantity, setWarRewardItemQuantity] = useState(0);
  const [rewardCatalog, setRewardCatalog] = useState<RewardCatalogItem[]>([]);
  const [warParticipants, setWarParticipants] = useState<Record<string, WarParticipant[]>>({});
  const [selectedWarParticipants, setSelectedWarParticipants] = useState<Record<string, string[]>>({});
  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<Clan | null>(null);
  const [createName, setCreateName] = useState('');
  const [createCard, setCreateCard] = useState('');
  const [rename, setRename] = useState('');
  const [renameCard, setRenameCard] = useState('');
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [roleKey, setRoleKey] = useState('');
  const [roleName, setRoleName] = useState('');
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [levels, setLevels] = useState<LevelRule[]>([
    { level: 1, thresholdExp: 0, memberCap: 20, icon: 'fa-shield', color: '#176b87' },
    { level: 2, thresholdExp: 100, memberCap: 25, icon: 'fa-crown', color: '#c79425' },
    { level: 3, thresholdExp: 500, memberCap: 30, icon: 'fa-dragon', color: '#af4b3e' },
  ]);
  const [expAmount, setExpAmount] = useState(100);
  const [expReason, setExpReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const createCards = items.filter(
    (item) => item.status === 'available' && item.item.effectType === 'create-clan',
  );
  const renameCards = items.filter(
    (item) => item.status === 'available' && item.item.effectType === 'rename-clan',
  );

  const load = useCallback(
    async (id = selectedId) => {
      try {
        const [list, board, inventory, catalog] = await Promise.all([
          api<{ items: Clan[] }>('/clans'),
          api<{ items: Clan[] }>('/clans/leaderboard'),
          api<{ items: Item[] }>('/me/inventory'),
          isAdmin ? api<{ items: RewardCatalogItem[] }>('/admin/shop/items') : Promise.resolve({ items: [] as RewardCatalogItem[] }),
        ]);
        const warList = await api<{ items: ClanWar[] }>('/clan-wars');
        const missions = await api<{ items: ClanMission[] }>('/me/clan-missions');
        setClans(list.items);
        setLeaderboard(board.items);
        setItems(inventory.items);
        setRewardCatalog(catalog.items.filter((item) => item.status === 'active' && item.stock > 0));
        setWars(warList.items);
        setClanMissions(missions.items);
        if (isAdmin) {
          setWarProposals((await api<{ items: WarProposal[] }>('/admin/clan-war-proposals')).items);
        } else {
          const coursesResponse = await api<{ items: ProposalCourse[] }>('/courses?pageSize=100');
          setProposalCourses(coursesResponse.items.filter((course) => course.permissions.includes('events.manage')));
        }
        if (isAdmin) {
          const policies = await api<{ items: { status: string; levels: LevelRule[] }[] }>('/admin/clan-policies');
          const active = policies.items.find((item) => item.status === 'active');
          if (active) setLevels(active.levels);
          setMissionPolicies((await api<{ items: ClanMissionPolicy[] }>('/admin/clan-missions')).items);
        }
        const nextId =
          id || list.items.find((item) => item.isMember)?.id || list.items[0]?.id || '';
        if (nextId) {
          setSelectedId(nextId);
          setDetail(await api<Clan>(`/clans/${nextId}`));
        } else {
          setSelectedId('');
          setDetail(null);
        }
        setError('');
      } catch (problem) {
        setError(courseError(problem, locale));
      }
    },
    [isAdmin, locale, selectedId],
  );

  useEffect(() => {
    void load('');
  }, [load]);

  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(success);
      await load();
    } catch (problem) {
      setError(courseError(problem, locale));
    } finally {
      setBusy(false);
    }
  }

  async function searchCandidates(value: string) {
    setQuery(value);
    if (!detail?.canManageMembership || value.trim().length < 2) {
      setCandidates([]);
      return;
    }
    try {
      setCandidates(
        (
          await api<{ items: Candidate[] }>(
            `/clans/${detail.id}/invite-candidates?query=${encodeURIComponent(value.trim())}`,
          )
        ).items,
      );
    } catch (problem) {
      setError(courseError(problem, locale));
    }
  }

  async function loadWarParticipants(warId: string) {
    setBusy(true); setError('');
    try {
      const result = await api<{ items: WarParticipant[] }>(`/admin/clan-wars/${warId}/participants`);
      setWarParticipants((current) => ({ ...current, [warId]: result.items }));
      setSelectedWarParticipants((current) => ({ ...current, [warId]: current[warId] || [] }));
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  }

  function toggleWarParticipant(warId: string, userId: string) {
    setSelectedWarParticipants((current) => {
      const selected = new Set(current[warId] || []);
      if (selected.has(userId)) selected.delete(userId); else selected.add(userId);
      return { ...current, [warId]: Array.from(selected) };
    });
  }

  return (
    <section className="panel clan-workspace">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">BUILD-031</p>
          <h2>{t('Clans', 'Clan')}</h2>
          <p>
            {t(
              'Build a community, manage membership and climb the Clan EXP leaderboard.',
              'Xây dựng cộng đồng, quản lý thành viên và leo bảng xếp hạng Clan EXP.',
            )}
          </p>
          <small>
            {clans.length} {t('active clans', 'clan đang hoạt động')}
          </small>
        </div>
      </div>
      {error && (
        <div role="alert" className="alert alert-error">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="alert alert-success">
          {notice}
        </div>
      )}
      {isAdmin && (
        <form className="attendance-create" onSubmit={(event) => {
          event.preventDefault();
          void act(async () => {
            const draft = await api<{ id: string }>('/admin/clan-policies', 'POST', { levels });
            await api(`/admin/clan-policies/${draft.id}/activation`, 'POST');
          }, t('Clan level policy activated.', 'Đã áp dụng chính sách cấp clan.'));
        }}>
          <h3>{t('Admin: Clan level policy', 'Admin: Chính sách cấp Clan')}</h3>
          <p>{t('Thresholds, member caps and icon/color are versioned and apply to every clan.', 'Ngưỡng EXP, giới hạn thành viên, biểu tượng và màu được quản lý theo phiên bản cho mọi clan.')}</p>
          {levels.map((rule, index) => <div className="assessment-fields" key={rule.level}>
            <label className="course-field"><span>{t('Level', 'Cấp')}</span><input type="number" min={1} max={100} required value={rule.level} onChange={(event) => setLevels((current) => current.map((item, position) => position === index ? { ...item, level: Number(event.target.value) } : item))} /></label>
            <label className="course-field"><span>{t('Clan EXP threshold', 'Ngưỡng Clan EXP')}</span><input type="number" min={0} required value={rule.thresholdExp} onChange={(event) => setLevels((current) => current.map((item, position) => position === index ? { ...item, thresholdExp: Number(event.target.value) } : item))} /></label>
            <label className="course-field"><span>{t('Member cap', 'Giới hạn thành viên')}</span><input type="number" min={1} max={1000} required value={rule.memberCap} onChange={(event) => setLevels((current) => current.map((item, position) => position === index ? { ...item, memberCap: Number(event.target.value) } : item))} /></label>
            <label className="course-field"><span>{t('Icon class', 'Mã biểu tượng')}</span><input required pattern="fa-[a-z0-9-]+" value={rule.icon} onChange={(event) => setLevels((current) => current.map((item, position) => position === index ? { ...item, icon: event.target.value } : item))} /></label>
            <label className="course-field"><span>{t('Color', 'Màu')}</span><input type="color" value={rule.color} onChange={(event) => setLevels((current) => current.map((item, position) => position === index ? { ...item, color: event.target.value } : item))} /></label>
            {index > 0 && <button type="button" className="button secondary" onClick={() => setLevels((current) => current.filter((_, position) => position !== index))}>{t('Remove level', 'Xóa cấp')}</button>}
          </div>)}
          <div className="assessment-action-row"><button type="button" className="button secondary" disabled={levels.length >= 100} onClick={() => setLevels((current) => [...current, { level: current.length + 1, thresholdExp: (current.at(-1)?.thresholdExp || 0) + 500, memberCap: (current.at(-1)?.memberCap || 20) + 5, icon: 'fa-shield', color: '#176b87' }])}>{t('Add level', 'Thêm cấp')}</button><button className="button primary" disabled={busy}>{t('Save and activate policy', 'Lưu và áp dụng')}</button></div>
        </form>
      )}
      {!detail?.isMember && (
        <form
          className="attendance-create"
          onSubmit={(event) => {
            event.preventDefault();
            if (!createCard) return;
            void act(
              () => api('/clans', 'POST', { name: createName, inventoryId: createCard }),
              t(
                'Clan created; the creation card was consumed.',
                'Đã tạo clan và dùng thẻ tạo clan.',
              ),
            );
          }}
        >
          <h3>{t('Create your clan', 'Tạo clan của bạn')}</h3>
          <p>
            {t(
              'Creation requires an available Create Clan card.',
              'Cần có thẻ Tạo Clan còn khả dụng.',
            )}
          </p>
          <label className="course-field">
            <span>{t('Clan name', 'Tên clan')}</span>
            <input
              required
              minLength={3}
              maxLength={40}
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
            />
          </label>
          {createCards.length ? (
            <>
              <label className="course-field">
                <span>{t('Creation card', 'Thẻ tạo clan')}</span>
                <select
                  required
                  value={createCard}
                  onChange={(event) => setCreateCard(event.target.value)}
                >
                  <option value="">{t('Choose a card', 'Chọn thẻ')}</option>
                  {createCards.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.item.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button primary" disabled={busy || !createCard}>
                {t('Create clan', 'Tạo clan')}
              </button>
            </>
          ) : (
            <a className="button secondary" href="/shop">
              {t('Find a Create Clan card in the shop', 'Tìm thẻ Tạo Clan trong cửa hàng')}
            </a>
          )}
        </form>
      )}
      <div className="assessment-fields">
        <section>
          <h3>{t('Clan leaderboard', 'Bảng xếp hạng Clan')}</h3>
          <div className="mission-card-grid">
            {leaderboard.length ? (
              leaderboard.map((clan, index) => (
                <article className="mission-card" key={clan.id}>
                  <div className="assessment-attempt-heading">
                    <span className="eyebrow">
                      #{index + 1} · {t('Level', 'Cấp')} {clan.level}
                    </span>
                    <i className={`fa-solid ${clan.icon}`} style={{ color: clan.color }} aria-hidden="true" />
                  </div>
                  <h3>{clan.name}</h3>
                  <p>
                    {clan.clanExp.toLocaleString(locale)} Clan EXP · {clan.memberCount}/
                    {clan.memberCap} {t('members', 'thành viên')}
                    {' · '}{clan.warRecord?.wins || 0}-{clan.warRecord?.losses || 0}-{clan.warRecord?.draws || 0} {t('W-L-D', 'Thắng-Thua-Hòa')}
                  </p>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => void load(clan.id)}
                  >
                    {t('Open clan', 'Mở clan')}
                  </button>
                  {!clan.isMember && !clan.myRequest && (
                    <button
                      type="button"
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () => api(`/clans/${clan.id}/join-requests`, 'POST'),
                          t('Join request submitted.', 'Đã gửi yêu cầu tham gia.'),
                        )
                      }
                    >
                      {t('Request to join', 'Xin tham gia')}
                    </button>
                  )}
                </article>
              ))
            ) : (
              <p className="course-empty">{t('No clans yet.', 'Chưa có clan nào.')}</p>
            )}
          </div>
        </section>
        <section className="mission-card clan-detail">
          <h3>{t('Clan missions', 'Nhiệm vụ Clan')}</h3>
          <p>{t('Trusted course activity by active members contributes to shared Clan goals.', 'Hoạt động học tập hợp lệ của thành viên đóng góp vào mục tiêu chung của Clan.')}</p>
          {clanMissions.length ? <div className="mission-card-grid">{clanMissions.map((mission) => <article className="mission-card" key={`${mission.missionId}-${mission.version}`}>
            <span className="eyebrow">{mission.cycle} · {mission.status}</span><h4>{mission.title}</h4>
            <progress max={mission.targetCount} value={mission.progress} aria-label={`${mission.title}: ${mission.progress}/${mission.targetCount}`} />
            <p>{mission.progress}/{mission.targetCount} · {mission.reward.clanExp.toLocaleString(locale)} Clan EXP · {mission.reward.exp.toLocaleString(locale)} EXP · {mission.reward.coin.toLocaleString(locale)} Coin</p>
          </article>)}</div> : <p className="course-empty">{t('No active Clan missions for this clan.', 'Clan chưa có nhiệm vụ hoạt động.')}</p>}
          {isAdmin && <form className="attendance-create" onSubmit={(event) => {
            event.preventDefault();
            void act(async () => {
              const draft = await api<ClanMissionPolicy>('/admin/clan-missions', 'POST', {
                missionId, title: missionTitle, eventKey: missionEvent, targetCount: missionTarget,
                cadence: missionCadence, timeZone: 'Asia/Bangkok', rewardClanExp: missionClanExp,
                rewardExp: missionPersonalExp, rewardCoin: missionCoin,
              });
              await api(`/admin/clan-missions/${encodeURIComponent(draft.missionId)}/versions/${draft.version}/activation`, 'POST');
            }, t('Clan mission activated.', 'Đã kích hoạt nhiệm vụ Clan.'));
          }}>
            <h4>{t('Admin: configure Clan mission', 'Admin: cấu hình nhiệm vụ Clan')}</h4>
            <div className="assessment-fields">
              <label className="course-field"><span>{t('Mission key', 'Mã nhiệm vụ')}</span><input required pattern="[A-Za-z0-9._-]+" value={missionId} onChange={(e) => setMissionId(e.target.value)} /></label>
              <label className="course-field"><span>{t('Title', 'Tên nhiệm vụ')}</span><input required maxLength={160} value={missionTitle} onChange={(e) => setMissionTitle(e.target.value)} /></label>
              <label className="course-field"><span>{t('Trusted activity', 'Hoạt động hợp lệ')}</span><select value={missionEvent} onChange={(e) => setMissionEvent(e.target.value)}><option value="practice.attempt">{t('Practice attempt', 'Lượt luyện tập')}</option><option value="practice.correct">{t('Correct practice answer', 'Câu luyện tập đúng')}</option><option value="attendance.present">{t('Attendance check-in', 'Điểm danh có mặt')}</option><option value="lesson.completed">{t('Lesson completed', 'Hoàn thành bài học')}</option><option value="assessment.submitted">{t('Assessment submitted', 'Nộp bài đánh giá')}</option></select></label>
              <label className="course-field"><span>{t('Target count', 'Số lượng mục tiêu')}</span><input type="number" min={1} max={1000000} required value={missionTarget} onChange={(e) => setMissionTarget(Number(e.target.value))} /></label>
              <label className="course-field"><span>{t('Cadence', 'Chu kỳ')}</span><select value={missionCadence} onChange={(e) => setMissionCadence(e.target.value as typeof missionCadence)}><option value="daily">{t('Daily', 'Hàng ngày')}</option><option value="weekly">{t('Weekly', 'Hàng tuần')}</option><option value="once">{t('One time', 'Một lần')}</option></select></label>
              <label className="course-field"><span>{t('Clan EXP reward', 'Thưởng Clan EXP')}</span><input type="number" min={0} value={missionClanExp} onChange={(e) => setMissionClanExp(Number(e.target.value))} /></label>
              <label className="course-field"><span>{t('Contributor EXP reward', 'Thưởng EXP người hoàn thành')}</span><input type="number" min={0} value={missionPersonalExp} onChange={(e) => setMissionPersonalExp(Number(e.target.value))} /></label>
              <label className="course-field"><span>{t('Contributor Coin reward', 'Thưởng Coin người hoàn thành')}</span><input type="number" min={0} value={missionCoin} onChange={(e) => setMissionCoin(Number(e.target.value))} /></label>
            </div>
            <button className="button primary" disabled={busy}>{t('Create and activate version', 'Tạo và kích hoạt phiên bản')}</button>
            {missionPolicies.length > 0 && <ul>{missionPolicies.map((item) => <li key={item.id}>{item.title} · v{item.version} · {item.status}</li>)}</ul>}
          </form>}
        </section>
        <section className="mission-card clan-detail">
          <h3>{t('Clan Wars', 'Chiến Clan')}</h3>
          <p>{t('Admin scheduled matches award Clan EXP once when results are finalized.', 'Admin lên lịch trận đấu; Clan EXP được cộng một lần khi chốt kết quả.')}</p>
          {isAdmin && <form className="attendance-create" onSubmit={(event) => {
            event.preventDefault();
            void act(() => api('/admin/clan-wars', 'POST', { title: warTitle, clanAId: warA, clanBId: warB, startsAt: new Date(warStart).toISOString(), expReward: warReward, competitionType: warType, rewardExp: warType === 'war' ? 0 : warParticipantExp, rewardCoin: warType === 'war' ? 0 : warParticipantCoin, rewardItemId: warType === 'war' || !warRewardItemId ? null : warRewardItemId, rewardItemQuantity: warType === 'war' || !warRewardItemId ? 0 : warRewardItemQuantity }), t('Clan competition scheduled.', 'Đã lên lịch cuộc thi Clan.'));
          }}>
            <label className="course-field"><span>{t('Match title', 'Tên trận đấu')}</span><input required minLength={3} maxLength={160} value={warTitle} onChange={(e) => setWarTitle(e.target.value)} /></label>
            <div className="assessment-fields">
              <label className="course-field"><span>{t('Clan A', 'Clan A')}</span><select required value={warA} onChange={(e) => setWarA(e.target.value)}><option value="">—</option>{clans.map((clan) => <option key={clan.id} value={clan.id}>{clan.name}</option>)}</select></label>
              <label className="course-field"><span>{t('Clan B', 'Clan B')}</span><select required value={warB} onChange={(e) => setWarB(e.target.value)}><option value="">—</option>{clans.map((clan) => <option key={clan.id} value={clan.id}>{clan.name}</option>)}</select></label>
              <label className="course-field"><span>{t('Start time', 'Thời gian bắt đầu')}</span><input type="datetime-local" required value={warStart} onChange={(e) => setWarStart(e.target.value)} /></label>
              <label className="course-field"><span>{t('Winner Clan EXP', 'Clan EXP cho đội thắng')}</span><input type="number" min={0} max={2000000000} value={warReward} onChange={(e) => setWarReward(Number(e.target.value))} /></label>
              <label className="course-field"><span>{t('Competition type', 'Loại cuộc thi')}</span><select value={warType} onChange={(e) => setWarType(e.target.value as typeof warType)}><option value="war">Clan War</option><option value="code">Code competition</option><option value="writing">Writing competition</option></select></label>
              {warType !== 'war' && <>
                <label className="course-field"><span>{t('Participant EXP each', 'EXP mỗi người tham gia')}</span><input type="number" min={0} max={2000000000} value={warParticipantExp} onChange={(e) => setWarParticipantExp(Number(e.target.value))} /></label>
                <label className="course-field"><span>{t('Participant Coin each', 'Coin mỗi người tham gia')}</span><input type="number" min={0} max={2000000000} value={warParticipantCoin} onChange={(e) => setWarParticipantCoin(Number(e.target.value))} /></label>
                <label className="course-field"><span>{t('Supported shop item prize', 'Vật phẩm shop làm giải')}</span><select value={warRewardItemId} onChange={(e) => setWarRewardItemId(e.target.value)}><option value="">{t('No item prize', 'Không có vật phẩm')}</option>{rewardCatalog.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.effectType} · {item.stock}</option>)}</select></label>
                {warRewardItemId && <label className="course-field"><span>{t('Items per participant', 'Vật phẩm mỗi người')}</span><input type="number" min={1} max={10} value={warRewardItemQuantity || 1} onChange={(e) => setWarRewardItemQuantity(Number(e.target.value))} /></label>}
              </>}
            </div>
            <button className="button primary" disabled={busy || !warA || warA === warB || (warRewardItemId !== '' && warRewardItemQuantity < 1)}>{t('Schedule event', 'Lên lịch sự kiện')}</button>
          </form>}
          {!isAdmin && proposalCourses.length > 0 && <form className="attendance-create" onSubmit={(event) => {
            event.preventDefault();
            void act(() => api(`/courses/${proposalCourseId}/clan-war-proposals`, 'POST', {
              title: proposalTitle, description: proposalDescription,
              clanAId: proposalClanA, clanBId: proposalClanB,
              startsAt: new Date(proposalStart).toISOString(),
              competitionType: proposalType,
            }), t('Proposal submitted for Admin review.', 'Đã gửi đề xuất để Admin duyệt.'));
          }}>
            <h4>{t('Propose a Clan War', 'Đề xuất chiến Clan')}</h4>
            <p>{t('Course staff can propose a match. Admin sets any Clan EXP reward during review.', 'Nhân sự khóa học có thể đề xuất trận đấu. Admin quyết định thưởng Clan EXP khi duyệt.')}</p>
            <label className="course-field"><span>{t('Course', 'Khóa học')}</span><select required value={proposalCourseId} onChange={(e) => setProposalCourseId(e.target.value)}><option value="">—</option>{proposalCourses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
            <label className="course-field"><span>{t('Proposal title', 'Tên đề xuất')}</span><input required minLength={3} maxLength={160} value={proposalTitle} onChange={(e) => setProposalTitle(e.target.value)} /></label>
            <label className="course-field"><span>{t('Description', 'Mô tả')}</span><textarea maxLength={1000} value={proposalDescription} onChange={(e) => setProposalDescription(e.target.value)} /></label>
            <label className="course-field"><span>{t('Event type', 'Loại sự kiện')}</span><select value={proposalType} onChange={(e) => setProposalType(e.target.value as typeof proposalType)}><option value="war">Clan War</option><option value="code">Code competition</option><option value="writing">Writing competition</option></select></label>
            <div className="assessment-fields">
              <label className="course-field"><span>{t('Clan A', 'Clan A')}</span><select required value={proposalClanA} onChange={(e) => setProposalClanA(e.target.value)}><option value="">—</option>{clans.map((clan) => <option key={clan.id} value={clan.id}>{clan.name}</option>)}</select></label>
              <label className="course-field"><span>{t('Clan B', 'Clan B')}</span><select required value={proposalClanB} onChange={(e) => setProposalClanB(e.target.value)}><option value="">—</option>{clans.map((clan) => <option key={clan.id} value={clan.id}>{clan.name}</option>)}</select></label>
              <label className="course-field"><span>{t('Proposed start', 'Thời gian đề xuất')}</span><input type="datetime-local" required value={proposalStart} onChange={(e) => setProposalStart(e.target.value)} /></label>
            </div>
            <button className="button primary" disabled={busy || !proposalCourseId || proposalClanA === proposalClanB}>{t('Submit proposal', 'Gửi đề xuất')}</button>
          </form>}
          {isAdmin && <div className="attendance-create">
            <h4>{t('Admin: Clan War proposals', 'Admin: Đề xuất chiến Clan')}</h4>
            {warProposals.length ? <div className="mission-card-grid">{warProposals.map((proposal) => <article className="mission-card" key={proposal.id}>
              <span className="eyebrow">{proposal.courseTitle} · {proposal.authorName}</span><h4>{proposal.title}</h4><p>{proposal.clanA.name} · {proposal.clanB.name}</p><p>{proposal.description}</p><p>{new Date(proposal.startsAt).toLocaleString(locale)}</p>
              <label className="course-field"><span>{t('Approved winner Clan EXP', 'Clan EXP cho đội thắng')}</span><input type="number" min={0} value={proposalExpReward} onChange={(e) => setProposalExpReward(Number(e.target.value))} /></label>              {proposal.competitionType !== 'war' && <><label className="course-field"><span>{t('Participant EXP each', 'Participant EXP each')}</span><input type="number" min={0} max={2000000000} value={proposalParticipantExp} onChange={(e) => setProposalParticipantExp(Number(e.target.value))} /></label><label className="course-field"><span>{t('Participant Coin each', 'Participant Coin each')}</span><input type="number" min={0} max={2000000000} value={proposalParticipantCoin} onChange={(e) => setProposalParticipantCoin(Number(e.target.value))} /></label><label className="course-field"><span>{t('Supported shop item prize', 'Supported shop item prize')}</span><select value={proposalRewardItemId} onChange={(e) => { setProposalRewardItemId(e.target.value); if (e.target.value && proposalRewardItemQuantity === 0) setProposalRewardItemQuantity(1); }}><option value="">{t('No item prize', 'No item prize')}</option>{rewardCatalog.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.effectType} · {item.stock}</option>)}</select></label>{proposalRewardItemId && <label className="course-field"><span>{t('Items per participant', 'Items per participant')}</span><input type="number" min={1} max={10} value={proposalRewardItemQuantity || 1} onChange={(e) => setProposalRewardItemQuantity(Number(e.target.value))} /></label>}</>}
              <div className="assessment-action-row"><button className="button primary" type="button" disabled={busy} onClick={() => void act(() => api(`/admin/clan-war-proposals/${proposal.id}/decisions`, 'POST', { decision: 'approve', expReward: proposalExpReward, rewardExp: proposal.competitionType === 'war' ? 0 : proposalParticipantExp, rewardCoin: proposal.competitionType === 'war' ? 0 : proposalParticipantCoin, rewardItemId: proposal.competitionType === 'war' || !proposalRewardItemId ? null : proposalRewardItemId, rewardItemQuantity: proposal.competitionType === 'war' || !proposalRewardItemId ? 0 : proposalRewardItemQuantity }), t('Proposal approved and scheduled.', 'Đã duyệt và lên lịch trận đấu.'))}>{t('Approve and schedule', 'Duyệt và lên lịch')}</button><button className="button secondary" type="button" disabled={busy} onClick={() => void act(() => api(`/admin/clan-war-proposals/${proposal.id}/decisions`, 'POST', { decision: 'reject' }), t('Proposal rejected.', 'Đã từ chối đề xuất.'))}>{t('Reject', 'Từ chối')}</button></div>
            </article>)}</div> : <p className="course-empty">{t('No pending Clan War proposals.', 'Không có đề xuất chiến Clan đang chờ.')}</p>}
          </div>}
          <div className="mission-card-grid">{wars.length ? wars.map((war) => <article className="mission-card" key={war.id}>
            <span className="state-badge">{war.status}</span><h4>{war.title}</h4>
            <p>{war.clanA.name} · {war.clanB.name}</p><p>{new Date(war.startsAt).toLocaleString(locale)} · {war.expReward.toLocaleString(locale)} EXP</p>
            {isAdmin && war.status === 'scheduled' && <><div className="assessment-action-row">{war.competitionType !== 'war' && <button type="button" className="button secondary" disabled={busy} onClick={() => void loadWarParticipants(war.id)}>{t('Load participants', 'Tải danh sách tham gia')}</button>}{(['clan_a', 'draw', 'clan_b', 'cancelled'] as const).map((outcome) => <button type="button" className="button secondary" disabled={busy || (outcome !== 'cancelled' && (war.participantReward.exp > 0 || war.participantReward.coin > 0 || war.participantReward.itemQuantity > 0) && (selectedWarParticipants[war.id] || []).length === 0)} key={outcome} onClick={() => void act(() => api(`/admin/clan-wars/${war.id}/results`, 'POST', { outcome, participantIds: outcome === 'cancelled' ? [] : (selectedWarParticipants[war.id] || []) }), t('War result saved.', 'Đã lưu kết quả cuộc thi.'))}>{outcome === 'clan_a' ? war.clanA.name : outcome === 'clan_b' ? war.clanB.name : outcome === 'draw' ? t('Draw', 'Hòa') : t('Cancel', 'Hủy')}</button>)}</div>{(warParticipants[war.id] || []).map((person) => <label className="assessment-attempt-heading" key={person.userId}><span>{person.name} · {person.clanId === war.clanA.id ? war.clanA.name : war.clanB.name}</span><input type="checkbox" checked={(selectedWarParticipants[war.id] || []).includes(person.userId)} onChange={() => toggleWarParticipant(war.id, person.userId)} /></label>)}</>}
          </article>) : <p className="course-empty">{t('No Clan Wars scheduled.', 'Chưa có trận chiến Clan.')}</p>}</div>
        </section>
        {detail && (
          <section className="mission-card clan-detail">
            <div className="assessment-attempt-heading">
              <div>
                <span className="eyebrow">
                  {t('Level', 'Cấp')} {detail.level} · {detail.clanExp.toLocaleString(locale)} Clan
                  EXP
                </span>
                <h3>{detail.name}</h3>
              </div>
              <span className="state-badge">
                {detail.memberCount}/{detail.memberCap}
              </span>
            </div>
            {detail.myRequest?.status === 'invited' && (
              <div className="assessment-action-row">
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      () =>
                        api(`/clans/${detail.id}/membership-decisions`, 'POST', {
                          requestId: detail.myRequest!.id,
                          decision: 'approve',
                        }),
                      t('Invitation accepted.', 'Đã chấp nhận lời mời.'),
                    )
                  }
                >
                  {t('Accept invitation', 'Chấp nhận lời mời')}
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      () =>
                        api(`/clans/${detail.id}/membership-decisions`, 'POST', {
                          requestId: detail.myRequest!.id,
                          decision: 'reject',
                        }),
                      t('Invitation declined.', 'Đã từ chối lời mời.'),
                    )
                  }
                >
                  {t('Decline', 'Từ chối')}
                </button>
              </div>
            )}
            {detail.myRequest?.status === 'requested' && (
              <p className="state-badge">
                {t('Join request pending', 'Yêu cầu tham gia đang chờ')}
              </p>
            )}
            {detail.isMember && (
              <>
                <h4>{t('Members', 'Thành viên')}</h4>
                {detail.members?.map((member) => (
                  <div className="assessment-attempt-heading" key={member.userId}>
                    <span>
                      {member.name}
                      {member.isOwner ? ` · ${t('Owner', 'Chủ clan')}` : ''}
                    </span>
                    <span>
                      {detail.roles?.find((role) => role.roleKey === member.roleKey)?.name ||
                        member.roleKey}
                      {detail.ownerId === userId && !member.isOwner && (
                        <button
                          className="button secondary"
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (!window.confirm(t(`Transfer clan ownership to ${member.name}?`, `Chuyển quyền chủ clan cho ${member.name}?`))) return;
                            void act(
                              () => api(`/clans/${detail.id}/owner-transfer`, 'POST', { userId: member.userId }),
                              t('Clan ownership transferred.', 'Đã chuyển quyền chủ clan.'),
                            );
                          }}
                        >
                          {t('Transfer ownership', 'Chuyển quyền sở hữu')}
                        </button>
                      )}
                      {detail.canManageRoles && !member.isOwner && (
                        <select
                          aria-label={t('Member role', 'Vai trò thành viên')}
                          value={member.roleKey}
                          onChange={(event) =>
                            void act(
                              () =>
                                api(`/clans/${detail.id}/members/${member.userId}/role`, 'PUT', {
                                  roleKey: event.target.value,
                                }),
                              t('Member role updated.', 'Đã cập nhật vai trò.'),
                            )
                          }
                        >
                          {detail.roles?.map((role) => (
                            <option key={role.roleKey} value={role.roleKey}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </span>
                  </div>
                ))}
                {detail.canManageMembership && (
                  <>
                    <h4>{t('Invite a student', 'Mời học viên')}</h4>
                    <label className="course-field">
                      <span>{t('Search active students', 'Tìm học viên đang hoạt động')}</span>
                      <input
                        minLength={2}
                        value={query}
                        onChange={(event) => void searchCandidates(event.target.value)}
                      />
                    </label>
                    {candidates.map((candidate) => (
                      <div className="assessment-attempt-heading" key={candidate.userId}>
                        <span>
                          {candidate.name} · {candidate.username}
                        </span>
                        <button
                          type="button"
                          className="button secondary"
                          disabled={busy}
                          onClick={() =>
                            void act(
                              () =>
                                api(`/clans/${detail.id}/invitations`, 'POST', {
                                  userId: candidate.userId,
                                }),
                              t('Invitation sent.', 'Đã gửi lời mời.'),
                            )
                          }
                        >
                          {t('Invite', 'Mời')}
                        </button>
                      </div>
                    ))}
                    <h4>{t('Membership requests', 'Yêu cầu thành viên')}</h4>
                    {detail.pending?.map((request) => (
                      <div className="assessment-attempt-heading" key={request.id}>
                        <span>
                          {request.name} · {request.status}
                        </span>
                        <div className="assessment-action-row">
                          <button
                            type="button"
                            className="button primary"
                            disabled={busy || request.status === 'invited'}
                            onClick={() =>
                              void act(
                                () =>
                                  api(`/clans/${detail.id}/membership-decisions`, 'POST', {
                                    requestId: request.id,
                                    decision: 'approve',
                                  }),
                                t('Member approved.', 'Đã duyệt thành viên.'),
                              )
                            }
                          >
                            {t('Approve', 'Duyệt')}
                          </button>
                          <button
                            type="button"
                            className="button secondary"
                            disabled={busy}
                            onClick={() =>
                              void act(
                                () =>
                                  api(`/clans/${detail.id}/membership-decisions`, 'POST', {
                                    requestId: request.id,
                                    decision: 'reject',
                                  }),
                                t('Request declined.', 'Đã từ chối yêu cầu.'),
                              )
                            }
                          >
                            {t('Reject', 'Từ chối')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {detail.canManageRoles && (
                  <form
                    className="attendance-create"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void act(
                        () =>
                          api(`/clans/${detail.id}/roles`, 'POST', {
                            roleKey,
                            name: roleName,
                            permissions: rolePermissions,
                          }),
                        t('Clan role created.', 'Đã tạo vai trò clan.'),
                      );
                    }}
                  >
                    <h4>{t('Create internal role', 'Tạo vai trò nội bộ')}</h4>
                    <label className="course-field">
                      <span>{t('Role key', 'Mã vai trò')}</span>
                      <input
                        required
                        minLength={2}
                        maxLength={64}
                        value={roleKey}
                        onChange={(event) => setRoleKey(event.target.value)}
                      />
                    </label>
                    <label className="course-field">
                      <span>{t('Role name', 'Tên vai trò')}</span>
                      <input
                        required
                        minLength={2}
                        maxLength={80}
                        value={roleName}
                        onChange={(event) => setRoleName(event.target.value)}
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={rolePermissions.includes('membership.manage')}
                        onChange={(event) =>
                          setRolePermissions(
                            event.target.checked
                              ? [...rolePermissions, 'membership.manage']
                              : rolePermissions.filter((value) => value !== 'membership.manage'),
                          )
                        }
                      />{' '}
                      {t('Manage membership', 'Quản lý thành viên')}
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={rolePermissions.includes('roles.manage')}
                        onChange={(event) =>
                          setRolePermissions(
                            event.target.checked
                              ? [...rolePermissions, 'roles.manage']
                              : rolePermissions.filter((value) => value !== 'roles.manage'),
                          )
                        }
                      />{' '}
                      {t('Manage clan roles', 'Quản lý vai trò clan')}
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={rolePermissions.includes('activities.manage')}
                        onChange={(event) =>
                          setRolePermissions(
                            event.target.checked
                              ? [...rolePermissions, 'activities.manage']
                              : rolePermissions.filter((value) => value !== 'activities.manage'),
                          )
                        }
                      />{' '}
                      {t('Manage clan activities', 'Quản lý hoạt động clan')}
                    </label>
                    <button className="button primary" disabled={busy || !roleKey || !roleName}>
                      {t('Create role', 'Tạo vai trò')}
                    </button>
                  </form>
                )}
                {detail.isMember && (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={busy || detail.ownerId === userId}
                    onClick={() =>
                      void act(
                        () => api(`/clans/${detail.id}/leave`, 'POST'),
                        t('You left the clan.', 'Bạn đã rời clan.'),
                      )
                    }
                  >
                    {t('Leave clan', 'Rời clan')}
                  </button>
                )}
                {detail.ownerId === userId && (
                  <form
                    className="attendance-create"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!renameCard) return;
                      void act(
                        () =>
                          api(`/clans/${detail.id}/rename`, 'POST', {
                            newName: rename,
                            inventoryId: renameCard,
                          }),
                        t(
                          'Clan renamed; the rename card was consumed.',
                          'Đã đổi tên clan và dùng thẻ đổi tên.',
                        ),
                      );
                    }}
                  >
                    <h4>{t('Rename clan', 'Đổi tên clan')}</h4>
                    <label className="course-field">
                      <span>{t('New name', 'Tên mới')}</span>
                      <input
                        required
                        minLength={3}
                        maxLength={40}
                        value={rename}
                        onChange={(event) => setRename(event.target.value)}
                      />
                    </label>
                    {renameCards.length ? (
                      <>
                        <label className="course-field">
                          <span>{t('Rename card', 'Thẻ đổi tên')}</span>
                          <select
                            required
                            value={renameCard}
                            onChange={(event) => setRenameCard(event.target.value)}
                          >
                            <option value="">{t('Choose a card', 'Chọn thẻ')}</option>
                            {renameCards.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.item.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button className="button secondary" disabled={busy || !renameCard}>
                          {t('Rename', 'Đổi tên')}
                        </button>
                      </>
                    ) : (
                      <a href="/shop">
                        {t(
                          'Get a Rename Clan card from the shop',
                          'Mua thẻ Đổi tên Clan ở cửa hàng',
                        )}
                      </a>
                    )}
                  </form>
                )}
              </>
            )}
          </section>
        )}
        {isAdmin && detail && <form className="attendance-create" onSubmit={(event) => { event.preventDefault(); void act(() => api(`/admin/clans/${detail.id}/exp`, 'POST', { delta: expAmount, reason: expReason }, { 'Idempotency-Key': crypto.randomUUID() }), t('Approved Clan EXP reward recorded.', 'Đã ghi thưởng Clan EXP được duyệt.')); }}><h4>{t('Admin: record Clan EXP reward', 'Admin: Ghi thưởng Clan EXP')}</h4><label className="course-field"><span>{t('Approved Clan EXP', 'Clan EXP được duyệt')}</span><input type="number" min={1} max={2000000000} required value={expAmount} onChange={(event) => setExpAmount(Number(event.target.value))} /></label><label className="course-field"><span>{t('Mission or event approval reason', 'Lý do duyệt nhiệm vụ hoặc sự kiện')}</span><textarea minLength={10} maxLength={500} required value={expReason} onChange={(event) => setExpReason(event.target.value)} /></label><button className="button secondary" disabled={busy || expReason.trim().length < 10}>{t('Record reward', 'Ghi thưởng')}</button></form>}
      </div>
    </section>
  );
}
