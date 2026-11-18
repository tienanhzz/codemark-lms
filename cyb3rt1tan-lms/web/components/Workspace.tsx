'use client';

import Link from 'next/link';
import { AdminAccounts } from './AdminAccounts';
import { CsvImportPanel } from './CsvImportPanel';
import { MfaPanel, MfaEnrollment } from './MfaPanel';
import { MfaPolicyPanel } from './MfaPolicyPanel';
import { AcceptInvitation } from './AcceptInvitation';
import { PersonalProfilePanel } from './PersonalProfilePanel';
import { PersonalSessionsPanel } from './PersonalSessionsPanel';
import { IdentityPolicyPanel } from './IdentityPolicyPanel';
import { ProfileSupportPanel } from './ProfileSupportPanel';
import { selfCopy } from '../lib/selfServiceMessages';
import { CourseWorkspace } from './CourseWorkspace';
import { AcademicCatalogs } from './AcademicCatalogs';
import { TaxonomyManager } from './TaxonomyManager';
import { QuestionBank } from './QuestionBank';
import { RuntimeProfiles } from './RuntimeProfiles';
import { AssessmentBuilder } from './AssessmentBuilder';
import { AssessmentWorkspace } from './AssessmentWorkspace';
import { PracticeWorkspace } from './PracticeWorkspace';
import { GradingWorkspace } from './GradingWorkspace';
import { AttendanceWorkspace } from './AttendanceWorkspace';
import { LearningOverviewWorkspace } from './LearningOverviewWorkspace';
import { ReportsWorkspace } from './ReportsWorkspace';
import { AuditWorkspace } from './AuditWorkspace';
import { WalletWorkspace } from './WalletWorkspace';
import { RanksWorkspace } from './RanksWorkspace';
import { MissionsWorkspace } from './MissionsWorkspace';
import { CommunityWorkspace } from './CommunityWorkspace';
import { AchievementsWorkspace } from './AchievementsWorkspace';
import { ShopWorkspace } from './ShopWorkspace';
import { MarketplaceWorkspace } from './MarketplaceWorkspace';
import { StaffEventsWorkspace } from './StaffEventsWorkspace';
import { ClansWorkspace } from './ClansWorkspace';
import { BrandingWorkspace } from './BrandingWorkspace';
import { NotificationsWorkspace } from './NotificationsWorkspace';
import { CriticalNoticePrompt } from './CriticalNoticePrompt';
import { SharedCourseRules } from './CourseRules';
import { HomePage } from './HomePage';
import { HomeCarousel } from './HomeCarousel';
import { LeaderboardWorkspace } from './LeaderboardWorkspace';
import { RoleOverview } from './RoleOverview';
import { PersistenceStatus } from './PersistenceStatus';
import { RunnerQueueStatus } from './RunnerQueueStatus';
import { WorkspacePreview } from './WorkspacePreview';
import { PageSearch } from './PageSearch';
import { QuickLeaderboard } from './QuickLeaderboard';
import { WeeklyTimetable } from './WeeklyTimetable';
import {
  previewPages,
  previewPage,
  canPreview,
  copy,
  workspaceRole,
} from '../lib/workspaceCatalog';
import { identityMessages, identityError } from '../lib/identityMessages';
import type { LoginResponse, MfaSetupChallengeResponse } from '../lib/contracts';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, applyPreferences, defaultPreferences, readGuestLocale, rememberGuestLocale, userInitials } from '../lib/api';
import type { CurrentUser, Summary, UserPreferences } from '../lib/api';
import { messages, type MessageKey } from '../lib/messages';

const baseNavigation: {
  id: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  group?: string;
}[] = [
  { id: '', label: 'home', icon: 'fa-house' },
  { id: 'dashboard', label: 'dashboard', icon: 'fa-table-columns' },
  { id: 'courses', label: 'courses', icon: 'fa-book-open' },
  {
    id: 'academic-catalogs',
    label: 'academicCatalogs',
    icon: 'fa-building-columns',
    adminOnly: true,
  },
  { id: 'course-rules', label: 'sharedRules', icon: 'fa-list-check', adminOnly: true },
  { id: 'activity', label: 'activity', icon: 'fa-clock-rotate-left' },
  { id: 'profile', label: 'profile', icon: 'fa-user' },
  { id: 'security', label: 'security', icon: 'fa-shield-halved' },
  { id: 'settings', label: 'settings', icon: 'fa-sliders' },
  { id: 'accounts', label: 'people', icon: 'fa-users', adminOnly: true },
  { id: 'imports', label: 'imports', icon: 'fa-file-import', adminOnly: true },
  { id: 'profile-support', label: 'profileSupport', icon: 'fa-address-card', adminOnly: true },
  { id: 'mfa-policy', label: 'mfaPolicy', icon: 'fa-user-shield', adminOnly: true },
];
const navigation = [
  ...baseNavigation.map((item) => ({
    ...item,
    group: item.adminOnly
      ? 'administration'
      : ['', 'dashboard', 'courses'].includes(item.id)
        ? 'learning'
        : 'account',
  })),
  ...previewPages.map((page) => ({
    id: page.id,
    label: page.id,
    icon: page.icon,
    adminOnly: page.roles.length === 1 && page.roles[0] === 'admin',
    group: page.group,
  })),
];
const palettes: {
  id: UserPreferences['colorPalette'];
  name: readonly [string, string];
  colors: string[];
}[] = [
  {
    id: 'navy-cyan-gold',
    name: ['Navy · Cyan · Gold', 'Xanh navy · Xanh cyan · Vàng'],
    colors: ['#152b49', '#086b87', '#e2b356'],
  },
  {
    id: 'ocean-teal',
    name: ['Ocean · Teal', 'Đại dương · Xanh ngọc'],
    colors: ['#143f4b', '#086c64', '#9dc9c3'],
  },
  {
    id: 'indigo-cyan',
    name: ['Indigo · Cyan', 'Chàm · Xanh cyan'],
    colors: ['#343768', '#5156b8', '#5dcad4'],
  },
  {
    id: 'forest-lime',
    name: ['Forest · Lime', 'Xanh rừng · Xanh chanh'],
    colors: ['#1b4235', '#357344', '#b6ce74'],
  },
  {
    id: 'rose-slate',
    name: ['Rose · Slate', 'Hồng · Xám đá'],
    colors: ['#3d3344', '#a04469', '#e3acbd'],
  },
  {
    id: 'sunset-coral',
    name: ['Sunset · Coral', 'Hoàng hôn · San hô'],
    colors: ['#543b37', '#b24d39', '#efa783'],
  },
  {
    id: 'violet-amber',
    name: ['Violet · Amber', 'Tím · Hổ phách'],
    colors: ['#38304d', '#7950a1', '#e8b44e'],
  },
  {
    id: 'graphite-cyan',
    name: ['Graphite · Cyan', 'Xám than · Xanh cyan'],
    colors: ['#28313b', '#257287', '#83bac9'],
  },
];
function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <i aria-hidden="true" className={`fa-solid ${name} ${className}`} />;
}
function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={`brand ${light ? 'brand-light' : ''}`}>
      <span className="brand-mark">
        <Icon name="fa-layer-group" />
      </span>
      <span>
        CodeMark<span className="brand-dot">.</span>
        <small>LEARNING WORKSPACE</small>
      </span>
    </span>
  );
}

function ProfileAvatar({ user }: {user: CurrentUser}) {
  return <>{userInitials(user)}{user.avatarUrl && <img key={user.avatarUrl} src={user.avatarUrl} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />}</>;
}

export function Workspace({ initialView = '' }: { initialView?: string }) {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [draft, setDraft] = useState<UserPreferences>(defaultPreferences);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [rankCollapsed, setRankCollapsed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [mfaMethod, setMfaMethod] = useState<'code' | 'recovery'>('code');
  const sidebar = useRef<HTMLElement>(null);
  const sidebarNavigation = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const locale = draft.locale;
  const t = (key: string) =>
    (key === 'home' ? (locale === 'vi' ? 'Trang chủ' : 'Home') : '') ||
    messages[locale][key as MessageKey] ||
    (previewPage(key) ? copy(locale, previewPage(key)!.title) : key);
  const errorText = (code: string) =>
    messages[locale][code as MessageKey] || identityError(locale, new Error(code));
  const roleLabel = (role: string) => messages[locale][role as MessageKey] || role;
  const admin = Boolean(user?.roles.includes('admin'));
  const canProvision = admin || Boolean(user?.roles.includes('administrativeAssistant'));
  const teacher = Boolean(
    user?.roles.some((role) => ['teacher', 'teachingAssistant'].includes(role)),
  );
  const visibleNavigation = navigation.filter(
    (item) =>
      (!item.adminOnly ||
        admin ||
        (['imports', 'profile-support'].includes(item.id) && canProvision)) &&
      (!previewPage(item.id) || canPreview(previewPage(item.id)!, user?.roles || [])),
  );
  const selected = navigation.find((item) => item.id === initialView) || navigation[0];

  async function refresh(): Promise<void> {
    try {
      const account = await api<CurrentUser>('/me');
      const [storedSettings, data] = await Promise.all([
        api<UserPreferences>('/me/preferences'),
        api<Summary>('/workspace/summary'),
      ]);
      const settings = { ...defaultPreferences, ...storedSettings };
      setUser(account);
      setPreferences(settings);
      setDraft(settings);
      setSummary(data);
      setError('');
      applyPreferences(settings);
      rememberGuestLocale(settings.locale);
    } catch (problem) {
      const code = problem instanceof Error ? problem.message : 'connection_error';
      if (code !== 'authentication_required') setError(code);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const guestLocale = readGuestLocale();
    if (guestLocale) setDraft(current => ({ ...current, locale: guestLocale }));
    void refresh();
    const unauthorized = () => {
      setUser(null);
      setSummary(null);
    };
    window.addEventListener('codemark:unauthorized', unauthorized);
    return () => window.removeEventListener('codemark:unauthorized', unauthorized);
  }, []);
  useEffect(() => {
    if (!loading) applyPreferences(draft);
  }, [draft, loading]);
  useLayoutEffect(() => {
    if (loading || !user || !sidebarNavigation.current) return;
    // Each route mounts its own workspace, so restore before the menu is painted.
    try {
      const saved = Number(window.sessionStorage.getItem(`codemark:sidebar-scroll:${user.id}`));
      if (Number.isFinite(saved) && saved >= 0) sidebarNavigation.current.scrollTop = saved;
    } catch {
      // Navigation remains usable when the browser blocks session storage.
    }
  }, [loading, user?.id]);
  useLayoutEffect(() => {
    if (!user) return;
    try {
      setRankCollapsed(window.sessionStorage.getItem(`codemark:rank-rail:${user.id}`) === 'closed');
    } catch {
      // Keep the rail usable in restricted browser sessions.
    }
  }, [user?.id]);
  useEffect(() => {
    if (!mobile) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const nodes = () =>
      Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])') || [],
      );
    nodes()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobile(false);
      }
      if (event.key === 'Tab') {
        const items = nodes(),
          first = items[0],
          last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keydown);
      menuButton.current?.focus();
    };
  }, [mobile]);
  useEffect(() => {
    setError('');
    setNotice('');
    setMobile(false);
  }, [initialView]);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<LoginResponse | MfaSetupChallengeResponse>('/auth/login', 'POST', {
        username: data.get('username'),
        password: data.get('password'),
        ...(data.get('mfaCredential')
          ? mfaMethod === 'code'
            ? { mfa_code: data.get('mfaCredential') }
            : { recovery_code: data.get('mfaCredential') }
          : {}),
      });
      if ('mfaSetupToken' in result) setSetupToken(result.mfaSetupToken);
      else { await refresh(); router.push('/'); }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'connection_error');
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    setError('');
    try {
      await api('/auth/logout', 'POST');
      setUser(null);
      setSummary(null);
      router.push('/');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'connection_error');
    } finally {
      setBusy(false);
    }
  }
  async function switchLanguage() {
    if (!user) {
      const nextLocale = locale === 'en' ? 'vi' : 'en';
      setDraft(current => ({ ...current, locale: nextLocale }));
      rememberGuestLocale(nextLocale);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await api<UserPreferences>('/me/preferences', 'PUT', {
        ...preferences,
        locale: locale === 'en' ? 'vi' : 'en',
      });
      setPreferences(saved);
      setDraft((current) => ({ ...current, locale: saved.locale }));
      rememberGuestLocale(saved.locale);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'connection_error');
    } finally {
      setBusy(false);
    }
  }
  async function saveSettings() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = await api<UserPreferences>('/me/preferences', 'PUT', draft);
      setPreferences(saved);
      setDraft(saved);
      rememberGuestLocale(saved.locale);
      setNotice('saved');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'connection_error');
    } finally {
      setBusy(false);
    }
  }
  function updateDraft(changes: Partial<UserPreferences>) {
    setDraft(current => ({ ...current, ...changes }));
    setNotice('');
    setError('');
  }
  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    setError('');
    const form = event.currentTarget;
    const fields = new FormData(form);
    const password = String(fields.get('newPassword') || '');
    if (password !== fields.get('confirmation')) {
      setError('mismatch');
      return;
    }
    if (password.length < 12 || password.length > 128) {
      setError('shortPassword');
      return;
    }
    setBusy(true);
    try {
      await api('/me/password', 'POST', {
        current_password: fields.get('currentPassword'),
        new_password: password,
      });
      form.reset();
      setNotice('passwordUpdated');
      setUser(null);
      setSummary(null);
      router.push('/');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'connection_error');
    } finally {
      setBusy(false);
    }
  }
  const banners = (
    <>
      {error && (
        <div className="alert alert-error" role="alert">
          <Icon name="fa-circle-exclamation" /> {errorText(error)}
        </div>
      )}
      {notice && (
        <div className="alert alert-success" role="status">
          <Icon name="fa-circle-check" /> {t(notice as MessageKey)}
        </div>
      )}
    </>
  );

  if (loading)
    return (
      <main className="loading-screen">
        <Brand />
        <span className="spinner" />
        <p>{t('loading')}</p>
      </main>
    );
  if (initialView === 'accept-invitation')
    return (
      <AcceptInvitation
        locale={locale}
        onAccepted={() => {
          router.push('/');
          void refresh();
        }}
      />
    );
  if (!user && !initialView)
    return <div className="public-home">
      <header className="public-header"><Brand /><div>
        <button className="button secondary" onClick={() => void switchLanguage()}><Icon name="fa-globe" />{locale === 'en' ? 'Tiếng Việt' : 'English'}</button>
        <Link className="button primary" href="/login">{t('signIn')}</Link>
      </div></header>
      <HomeCarousel locale={locale} />
      <main><HomePage locale={locale} roles={[]} showCarousel={false} /></main>
    </div>;
  if (!user)
    return (
      <main className="login-page legacy-login">
        <section className="login-form-area">
          <Link className="legacy-back" href="/">{locale === 'vi' ? '← Quay lại trang chủ' : '← Back to home'}</Link>
          <button
            className="language-toggle"
            onClick={() => void switchLanguage()}
          >
            <Icon name="fa-globe" /> {locale === 'en' ? 'Tiếng Việt' : 'English'}
          </button>
          <div className="login-form">
<img className="legacy-login-logo" src="/branding/legacy-logo.png" alt="CodeMark" width={1156} height={359} />
            <h1>{locale === 'vi' ? 'Chào mừng trở lại' : 'Welcome back'}</h1>
            {banners}
            {setupToken ? (
              <MfaEnrollment
                locale={locale}
                setupToken={setupToken}
                onCancel={() => setSetupToken(null)}
                onComplete={() => {
                  setSetupToken(null);
                  void refresh();
                }}
              />
            ) : (
              <form onSubmit={login}>
                <label>
                  {locale === 'vi' ? 'Mã sinh viên / Gmail / tên đăng nhập' : 'Student ID / Gmail / username'}
                  <input
                    name="username"
                    autoComplete="username"
                    required
                    maxLength={320}
                    placeholder={locale === 'vi' ? 'Mã sinh viên, Gmail giảng viên hoặc tên Admin' : 'Student ID, teacher Gmail or admin username'}
                  />
                </label>
                <label>
                  {t('password')}
                  <span className="password-field">
                    <input
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      maxLength={1024}
                      placeholder="••••••••••••"
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t(showPassword ? 'hidePassword' : 'showPassword')}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      <Icon name={showPassword ? 'fa-eye-slash' : 'fa-eye'} />
                    </button>
                  </span>
                </label>
                <details className="login-mfa">
                  <summary>{identityMessages[locale].mfa}</summary>
                  <p className="field-help">{identityMessages[locale].codeHelp}</p>
                  <label>
                    <select
                      aria-label={identityMessages[locale].mfa}
                      value={mfaMethod}
                      onChange={(event) => setMfaMethod(event.target.value as 'code' | 'recovery')}
                    >
                      <option value="code">{identityMessages[locale].code}</option>
                      <option value="recovery">{identityMessages[locale].recoveryCode}</option>
                    </select>
                    <input
                      name="mfaCredential"
                      aria-label={
                        mfaMethod === 'code'
                          ? identityMessages[locale].code
                          : identityMessages[locale].recoveryCode
                      }
                      autoComplete="one-time-code"
                      inputMode={mfaMethod === 'code' ? 'numeric' : 'text'}
                      pattern={mfaMethod === 'code' ? '[0-9]{6}' : undefined}
                      maxLength={mfaMethod === 'code' ? 6 : 32}
                    />
                  </label>
                </details>
                <button disabled={busy} className="button primary login-submit">
                  {busy ? t('signingIn') : t('signIn')}
                  <Icon name="fa-arrow-right" />
                </button>
              </form>
            )}
            <p className="login-help">{t('loginHelp')}</p>
            <Link className="text-link" href="/forgot-password">
              {selfCopy(locale, 'forgot')}
            </Link>
            <details className="legacy-support">
              <summary>{locale === 'vi' ? 'Cần hỗ trợ?' : 'Need help?'}</summary>
              <p>{locale === 'vi' ? 'Kiểm tra tên đăng nhập, phím Caps Lock và kết nối mạng. Liên hệ quản trị viên nếu bạn chưa được cấp tài khoản. Không gửi mật khẩu khi yêu cầu hỗ trợ.' : 'Check your username, Caps Lock and connection. Contact your administrator if you need an account. Never share your password when requesting support.'}</p>
            </details>
          </div>
          <span className="login-footer">
            © {new Date().getFullYear()} CodeMark · {t('footer')}
          </span>
        </section>
      </main>
    );

  const activity = (
    <div className="activity-list">
      {summary?.activity.length ? (
        summary.activity.map((item) => (
          <div className="activity-item" key={item.id}>
            <span className="activity-icon">
              <Icon
                name={
                  item.action === 'login'
                    ? 'fa-arrow-right-to-bracket'
                    : item.action === 'preferences_updated'
                      ? 'fa-sliders'
                      : 'fa-shield-halved'
                }
              />
            </span>
            <div>
              <strong>
                {t((item.action === 'login' ? 'loginEvent' : item.action) as MessageKey) ||
                  item.action}
              </strong>
              <small>
                {new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: preferences.timeZone,
                }).format(new Date(item.createdAt))}
              </small>
            </div>
            <span className="activity-dot" />
          </div>
        ))
      ) : (
        <p className="empty-small">{t('noActivity')}</p>
      )}
    </div>
  );

  return (
    <div className={`app-layout ${collapsed ? 'is-collapsed' : ''}`}>
      {user && <CriticalNoticePrompt locale={locale} />}
      <a href="#main" className="skip-link">
        {t('skip')}
      </a>
      {mobile && (
        <button
          className="sidebar-overlay"
          aria-label={t('close')}
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        id="workspace-navigation"
        ref={sidebar}
        aria-hidden={collapsed && !mobile}
        inert={collapsed && !mobile}
        className={`sidebar ${mobile ? 'mobile-open' : ''}`}
      >
        <Link href="/" className="brand-link" aria-label="CodeMark">
          <Brand />
        </Link>
        <div className="sidebar-account">
          <Link href="/profile" aria-label={t('viewProfile')} className="avatar">
            <ProfileAvatar user={user} />
          </Link>
          <span>
            <strong>{user.officialName}</strong>
            <small>{user.username} · {roleLabel(user.roles[0])}</small>
          </span>
          <button
            className="icon-button"
            disabled={busy}
            onClick={signOut}
            aria-label={t('signOut')}
            title={t('signOut')}
          >
            <Icon name="fa-arrow-right-from-bracket" />
          </button>
        </div>
        <nav
          ref={sidebarNavigation}
          aria-label={t('workspace')}
          onScroll={(event) => {
            try {
              window.sessionStorage.setItem(`codemark:sidebar-scroll:${user.id}`, String(event.currentTarget.scrollTop));
            } catch {
              // Storage may be unavailable in restricted browser sessions.
            }
          }}
        >
          {(['learning', 'teaching', 'community', 'administration', 'account'] as const).map(
            (group) => {
              const items = visibleNavigation.filter((item) => item.group === group);
              return items.length ? (
                <section key={group} className="nav-group" aria-labelledby={`nav-group-${group}`}>
                  <h2 id={`nav-group-${group}`} className="nav-caption">
                    {copy(
                      locale,
                      (
                        {
                          learning: ['LEARNING', 'HỌC TẬP'],
                          teaching: ['TEACHING', 'GIẢNG DẠY'],
                          community: ['COMMUNITY', 'CỘNG ĐỒNG'],
                          administration: ['ADMINISTRATION', 'QUẢN TRỊ'],
                          account: ['ACCOUNT', 'TÀI KHOẢN'],
                        } as const
                      )[group],
                    )}
                  </h2>
                  {items.map((item) => (
                    <Link
                      key={item.id}
                      href={'/' + item.id}
                      className={`nav-item ${selected.id === item.id ? 'active' : ''}`}
                      aria-current={selected.id === item.id ? 'page' : undefined}
                      title={t(item.label)}
                    >
                      <Icon name={item.icon} />
                      <span>{t(item.label)}</span>
                      {previewPage(item.id) && !['leaderboard', 'calendar', 'missions', 'community'].includes(item.id) && (
                        <small className="preview-nav-tag">
                          {copy(locale, ['Preview', 'Xem trước'])}
                        </small>
                      )}
                    </Link>
                  ))}
                </section>
              ) : null;
            },
          )}
        </nav>
      </aside>
      <button
        className="sidebar-toggle"
        onClick={() => setCollapsed((value) => !value)}
        aria-label={t(collapsed ? 'expand' : 'collapse')}
        title={t(collapsed ? 'expand' : 'collapse')}
        aria-expanded={!collapsed}
        aria-controls="workspace-navigation"
      >
        <Icon name={collapsed ? 'fa-chevron-right' : 'fa-chevron-left'} />
      </button>
      <div className="main-column">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            ref={menuButton}
            aria-label={t('menu')}
            aria-expanded={mobile}
            aria-controls="workspace-navigation"
            onClick={() => setMobile(true)}
          >
            <Icon name="fa-bars" />
          </button>
          <div className="breadcrumb">
            <span>{t('workspace')}</span>
            <Icon name="fa-chevron-right" />
            <strong>{t(selected.label)}</strong>
          </div>
          <div className="topbar-actions">
            <button className="language-toggle workspace-language" disabled={busy} onClick={switchLanguage}>
              <Icon name="fa-globe" /> {locale === 'en' ? 'Tiếng Việt' : 'English'}
            </button>
            <PageSearch
              key={initialView}
              items={visibleNavigation.map((item) => ({ ...item, label: t(item.label), href: `/${item.id}` }))}
              label={t('search')}
              noMatches={t('noMatches')}
            />
            <span className="topbar-divider" />
            <Link href="/profile" className="avatar avatar-small" aria-label={t('viewProfile')}>
              <ProfileAvatar user={user} />
            </Link>
          </div>
        </header>
        {(!initialView || initialView === 'login') && <HomeCarousel locale={locale} />}
        <div className={`workspace-body${initialView !== 'leaderboard' ? ' with-quick-rank' : ''}${rankCollapsed ? ' rank-rail-closed' : ''}`}>
        <main id="main" className="main-content" tabIndex={-1}>
          {initialView && initialView !== 'login' && <div className="page-heading">
            <div>
              <span className="eyebrow">{initialView ? t('account') : t('workspaceLabel')}</span>
              <h1>
                {initialView && initialView !== 'dashboard'
                  ? previewPage(initialView)
                    ? (['leaderboard', 'calendar', 'missions', 'community'].includes(initialView) ? t(selected.label) : copy(locale, previewPage(initialView)!.intro))
                    : t(selected.label)
                  : `${t('greeting')}, ${user.officialName.split(' ').slice(-1)[0]}`}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {initialView && initialView !== 'dashboard'
                  ? t(
                      (
                        {
                          activity: 'activityIntro',
                          courses: 'coursesIntro',
                          'academic-catalogs': 'catalogsIntro',
                          'course-rules': 'rulesIntro',
                          accounts: 'accountsIntro',
                          imports: 'importsIntro',
                          'profile-support': 'profileSupportIntro',
                          'mfa-policy': 'policyIntro',
                          profile: 'profileIntro',
                          settings: 'settingsIntro',
                          security: 'securityIntro',
                        } as Record<string, MessageKey>
                      )[initialView],
                    )
                  : t(admin ? 'adminIntro' : teacher ? 'teacherIntro' : 'intro')}
              </p>
            </div>
            {initialView === 'dashboard' && (
              <span className="date-chip">
                <Icon name="fa-calendar-days" />
                {new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  timeZone: preferences.timeZone,
                }).format(new Date())}
              </span>
            )}
          </div>}
          {banners}
          {(!initialView || initialView === 'login') && <HomePage locale={locale} roles={user.roles} showCarousel={false} />}
          {initialView === 'leaderboard' && <LeaderboardWorkspace locale={locale} userId={user.id} />}
          {initialView === 'calendar' && <WeeklyTimetable locale={locale} timeZone={preferences.timeZone || 'Asia/Ho_Chi_Minh'} />}
          {initialView === 'dashboard' && workspaceRole(user.roles) === 'student' && (
            <LearningOverviewWorkspace locale={locale} roles={user.roles} />
          )}
          {initialView === 'dashboard' && ['admin', 'staff'].includes(workspaceRole(user.roles)) && (
            <RoleOverview summary={summary} locale={locale} admin={admin} activity={activity} />
          )}
          {initialView === 'dashboard' && workspaceRole(user.roles) === 'support' && (
            <>
              <div className="stats-grid">
                {(admin ? ['accounts', 'courses', 'assessments'] : ['courses', 'assessments']).map(
                  (key, index) => (
                    <section className="stat-card" key={key}>
                      <div className={`stat-icon stat-${index}`}>
                        <Icon
                          name={
                            key === 'accounts'
                              ? 'fa-users'
                              : key === 'courses'
                                ? 'fa-book-open'
                                : 'fa-clipboard-check'
                          }
                        />
                      </div>
                      <span className="stat-label">{t(key as MessageKey)}</span>
                      <strong>
                        {summary?.metrics[key as keyof Summary['metrics']] || 0}
                        <span className="stat-arrow">
                          <Icon name="fa-minus" />
                        </span>
                      </strong>
                      <small>
                        {t(
                          (
                            {
                              accounts: 'accountsHint',
                              courses: 'coursesHint',
                              assessments: 'assessmentHint',
                            } as Record<string, MessageKey>
                          )[key],
                        )}
                      </small>
                    </section>
                  ),
                )}
              </div>
              <div className="dashboard-grid">
                <div className="dashboard-primary">
                  <section className="welcome-panel">
                    <div>
                      <span className="tag">
                        <span className="status-dot" /> WORKSPACE
                      </span>
                      <h2>{t('foundation')}</h2>
                      <p>{t('foundationBody')}</p>
                      <Link className="text-link" href="/settings">
                        {t('personalizeAction')} <Icon name="fa-arrow-right" />
                      </Link>
                    </div>
                    <div className="hero-art" aria-hidden="true">
                      <span className="hero-art-orbit" />
                      <div className="hero-book book-back" />
                      <div className="hero-book book-front">
                        <Icon name="fa-seedling" />
                      </div>
                      <span className="hero-spark">✦</span>
                    </div>
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>{t('courses')}</h2>
                      <span className="count-badge">{summary?.metrics.courses || 0}</span>
                    </div>
                    {summary?.courses.length ? (
                      <div className="dashboard-course-list">
                        {summary.courses.map((course) => (
                          <Link key={course.id} href={`/courses?course=${course.id}`}>
                            <span className="course-book">
                              <Icon name="fa-book-open" />
                            </span>
                            <span>
                              <small>{course.courseCode}</small>
                              <strong>{course.title}</strong>
                            </span>
                            <Icon name="fa-arrow-right" />
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">
                        <div className="empty-illustration">
                          <Icon name="fa-book-open-reader" />
                          <span className="empty-plus">+</span>
                        </div>
                        <h3>{t('noCourses')}</h3>
                        <p>{t('noCoursesBody')}</p>
                        <span className="empty-caption">
                          <span className="status-dot" /> {t('realData')}
                        </span>
                      </div>
                    )}
                    <Link className="text-link course-more" href="/courses">
                      {t('courses')} <Icon name="fa-arrow-right" />
                    </Link>
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>{t('recent')}</h2>
                      <Link href="/activity" className="text-link">
                        {t('allActivity')} <Icon name="fa-arrow-right" />
                      </Link>
                    </div>
                    {activity}
                  </section>
                </div>
                <div className="dashboard-secondary">
                  <section className="panel health-panel">
                    <div className="panel-heading">
                      <h2>{t('system')}</h2>
                      <span className="status-dot" />
                    </div>
                    <div className="health-row">
                      <span className="health-icon">
                        <Icon name="fa-database" />
                      </span>
                      <div>
                        <strong>{t('database')}</strong>
                        <small>{t('connected')}</small>
                      </div>
                      <Icon name="fa-circle-check" className="good" />
                    </div>
                    <div className="health-row">
                      <span className="health-icon">
                        <Icon name="fa-fingerprint" />
                      </span>
                      <div>
                        <strong>{t('access')}</strong>
                        <small>{t('session')}</small>
                      </div>
                      <Icon name="fa-circle-check" className="good" />
                    </div>
                    <div className="health-footer">
                      <span className="status-dot" /> {t('realData')}
                    </div>
                  </section>
                  <section className="personalize-panel">
                    <span className="soft-icon">
                      <Icon name="fa-palette" />
                    </span>
                    <h2>{t('personalize')}</h2>
                    <p>{t('personalizeBody')}</p>
                    <div className="palette-preview" aria-hidden="true">
                      {palettes.slice(0, 6).map((p) => (
                        <span key={p.id} style={{ background: p.colors[1] }} />
                      ))}
                    </div>
                    <Link className="button secondary" href="/settings">
                      {t('personalizeAction')} <Icon name="fa-arrow-right" />
                    </Link>
                  </section>
                  <section className="next-panel">
                    <span className="eyebrow">{t('next')}</span>
                    <h3>{t('nextTitle')}</h3>
                    <p>{t('nextBody')}</p>
                    <span className="build-label">BUILD-03 → BUILD-04</span>
                  </section>
                </div>
              </div>
            </>
          )}
          {initialView === 'operations' && admin && <><PersistenceStatus locale={locale} /><RunnerQueueStatus locale={locale} /></>}
          {previewPage(initialView) && initialView === 'taxonomy' && admin && (
            <TaxonomyManager locale={locale} roles={user.roles} />
          )}
          {previewPage(initialView) && initialView === 'question-bank' && (
            <QuestionBank locale={locale} roles={user.roles} />
          )}
          {previewPage(initialView) && initialView === 'runtime-profiles' && admin && (
            <RuntimeProfiles locale={locale} />
          )}
          {previewPage(initialView) && initialView === 'assessment-builder' && (
            <AssessmentBuilder locale={locale} />
          )}
          {previewPage(initialView) && initialView === 'assessments' && user.roles.includes('student') && (
            <AssessmentWorkspace locale={locale} />
          )}
          {previewPage(initialView) && initialView === 'practice' && user.roles.includes('student') && (
            <PracticeWorkspace locale={locale} />
          )}
          {previewPage(initialView) && initialView === 'grading' && user.roles.some((role) => ['admin', 'teacher', 'teachingAssistant'].includes(role)) && (
            <GradingWorkspace locale={locale} />
          )}
          {previewPage(initialView) && initialView === 'attendance' && user.roles.some((role) => ['admin', 'teacher', 'teachingAssistant', 'student'].includes(role)) && (
            <AttendanceWorkspace locale={locale} roles={user.roles} />
          )}
          {previewPage(initialView) && initialView === 'student-overview' && user.roles.some((role) => ['admin', 'teacher', 'teachingAssistant', 'student'].includes(role)) && (
            <LearningOverviewWorkspace locale={locale} roles={user.roles} />
          )}
          {previewPage(initialView) && initialView === 'reports' && user.roles.some((role) => ['admin', 'teacher', 'teachingAssistant'].includes(role)) && (
            <ReportsWorkspace locale={locale} roles={user.roles} />
          )}
          {previewPage(initialView) && initialView === 'audit-retention' && admin && (
            <AuditWorkspace locale={locale} />
          )}
          {previewPage(initialView) && initialView === 'wallet' && user.roles.some((role) => ['admin', 'teacher', 'teachingAssistant', 'student'].includes(role)) && (
            <WalletWorkspace locale={locale} />
          )}
          {previewPage(initialView) && initialView === 'ranks' && user.roles.some((role) => ['admin', 'teacher', 'teachingAssistant', 'student'].includes(role)) && (
            <RanksWorkspace locale={locale} roles={user.roles} />
          )}
          {previewPage(initialView) && initialView === 'missions' && user.roles.some((role) => ['admin', 'teacher', 'teachingAssistant', 'student'].includes(role)) && (
            <MissionsWorkspace locale={locale} roles={user.roles} />
          )}
          {previewPage(initialView) && initialView === 'achievements' && user.roles.some((role) => ['admin', 'teacher', 'teachingAssistant', 'student'].includes(role)) && (
            <AchievementsWorkspace locale={locale} roles={user.roles} />
          )}
          {previewPage(initialView) && ['shop', 'inventory'].includes(initialView) && user.roles.some((role) => ['admin', 'teacher', 'teachingAssistant', 'student'].includes(role)) && (
            <ShopWorkspace locale={locale} roles={user.roles} inventoryOnly={initialView === 'inventory'} />
          )}
          {previewPage(initialView) && initialView === 'marketplace' && user.roles.some((role) => ['admin', 'teacher', 'teachingAssistant', 'student'].includes(role)) && (
            <MarketplaceWorkspace locale={locale} roles={user.roles} />
          )}
          {previewPage(initialView) && initialView === 'staff-events' && user.roles.some((role) => ['admin', 'teacher', 'teachingAssistant', 'student'].includes(role)) && (
            <StaffEventsWorkspace locale={locale} />
          )}
          {previewPage(initialView) && initialView === 'clans' && user.roles.some((role) => ['admin', 'teacher', 'teachingAssistant', 'student'].includes(role)) && (
            <ClansWorkspace locale={locale} userId={user.id} isAdmin={admin} />
          )}
          {initialView === 'branding' && (admin ? <BrandingWorkspace locale={locale} /> : <div className="alert alert-error">{identityMessages[locale].forbidden}</div>)}
          {initialView === 'notifications' && <NotificationsWorkspace locale={locale} roles={user.roles} />}
          {initialView === 'community' && <CommunityWorkspace locale={locale} roles={user.roles} />}
          {previewPage(initialView) && !['community', 'calendar', 'leaderboard', 'taxonomy', 'question-bank', 'runtime-profiles', 'assessment-builder', 'grading', 'attendance', 'student-overview', 'reports', 'audit-retention', 'wallet', 'ranks', 'missions', 'achievements', 'shop', 'inventory', 'marketplace', 'staff-events', 'clans', 'branding', 'notifications', ...(user.roles.includes('student') ? ['assessments', 'practice'] : [])].includes(initialView) && (
            <WorkspacePreview page={previewPage(initialView)!} locale={locale} roles={user.roles} />
          )}
          {initialView === 'courses' && (
            <CourseWorkspace locale={locale} roles={user.roles} onChange={refresh} />
          )}
          {initialView === 'academic-catalogs' &&
            (admin ? (
              <AcademicCatalogs locale={locale} />
            ) : (
              <div className="alert alert-error">{identityMessages[locale].forbidden}</div>
            ))}
          {initialView === 'course-rules' &&
            (admin ? (
              <SharedCourseRules locale={locale} />
            ) : (
              <div className="alert alert-error">{identityMessages[locale].forbidden}</div>
            ))}
          {initialView === 'activity' && (
            <section className="panel activity-full">
              <div className="panel-heading">
                <h2>{t('recent')}</h2>
                <Icon name="fa-clock-rotate-left" />
              </div>
              {activity}
            </section>
          )}
          {initialView === 'profile' && (
            <div className="settings-layout">
              <section className="panel">
                <div className="profile-banner">
                  <span className="avatar avatar-large"><ProfileAvatar user={user} /></span>
                  <h2>{user.officialName}</h2>
                  <p>@{user.username}</p>
                  <div className="role-tags">
                    {user.roles.map((role) => (
                      <span className="tag" key={role}>
                        {roleLabel(role)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="profile-fields">
                  {[
                    ['officialName', user.officialName],
                    ['username', user.username],
                    ['email', user.email],
                  ].map(([key, value]) => (
                    <div key={key}>
                      <span>{t(key as MessageKey)}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
              </section>
              <aside className="info-card">
                <Icon name="fa-address-card" />
                <h3>{t('profile')}</h3>
                <p>{t('profileHint')}</p>
                <Link href="/settings" className="text-link">
                  {t('personalizeAction')} <Icon name="fa-arrow-right" />
                </Link>
              </aside>
              <PersonalProfilePanel
                locale={locale}
                timeZone={draft.timeZone || 'Asia/Bangkok'}
                onChanged={setUser}
              />
            </div>
          )}
          {initialView === 'security' && (
            <div className="settings-layout">
              <section className="panel form-panel">
                <div className="panel-heading">
                  <h2>{t('changePassword')}</h2>
                  <Icon name="fa-key" />
                </div>
                <form onSubmit={changePassword}>
                  {[
                    ['currentPassword', 'currentPassword', 'current-password'],
                    ['newPassword', 'newPassword', 'new-password'],
                    ['confirmation', 'confirmPassword', 'new-password'],
                  ].map(([name, label, complete]) => (
                    <label key={name}>
                      {t(label as MessageKey)}
                      <input
                        name={name}
                        type="password"
                        required
                        minLength={name === 'currentPassword' ? 1 : 12}
                        maxLength={128}
                        autoComplete={complete}
                      />
                    </label>
                  ))}
                  <p className="field-help">{t('passwordHelp')}</p>
                  <button className="button primary" disabled={busy}>
                    {t(busy ? 'saving' : 'changePassword')} <Icon name="fa-arrow-right" />
                  </button>
                </form>
              </section>
              <aside className="info-card">
                <Icon name="fa-shield-halved" />
                <h3>{t('session')}</h3>
                <p>{t('sessionHint')}</p>
              </aside>
            </div>
          )}
          {initialView === 'security' && (
            <PersonalSessionsPanel
              locale={locale}
              timeZone={draft.timeZone || 'Asia/Bangkok'}
              onSignedOut={() => {
                setUser(null);
                setSummary(null);
              }}
            />
          )}
          {initialView === 'settings' && (
            <section className="panel settings-panel">
              <div className="settings-section">
                <div>
                  <h2>{t('language')}</h2>
                  <p>{t('languageHint')}</p>
                </div>
                <select
                  value={draft.locale}
                  disabled={busy}
                  aria-label={t('language')}
                  onChange={(event) =>
                    updateDraft({
                      locale: event.target.value as 'en' | 'vi',
                    })
                  }
                >
                  <option value="en">English</option>
                  <option value="vi">Tiếng Việt</option>
                </select>
              </div>
              <div className="settings-section">
                <div>
                  <h2>{t('appearance')}</h2>
                  <p>{t('appearanceHint')}</p>
                </div>
                <div className="appearance-options">
                  {(['light', 'dark'] as const).map((theme) => (
                    <button
                      className={`appearance-option ${draft.theme === theme ? 'chosen' : ''}`}
                      type="button"
                      disabled={busy}
                      aria-pressed={draft.theme === theme}
                      key={theme}
                      onClick={() => updateDraft({ theme })}
                    >
                      <span className={`theme-mini ${theme}`}>
                        <span />
                        <span />
                        <span />
                      </span>
                      <span>
                        <Icon name={theme === 'light' ? 'fa-sun' : 'fa-moon'} /> {t(theme)}{' '}
                        {draft.theme === theme && <Icon name="fa-check-circle" />}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-section vertical">
                <h2>{t('palette')}</h2>
                <p>{t('paletteHint')}</p>
                <div className="palette-grid">
                  {palettes.map((p) => (
                    <button
                      className={`palette-option ${draft.colorPalette === p.id ? 'chosen' : ''}`}
                      type="button"
                      disabled={busy}
                      aria-pressed={draft.colorPalette === p.id}
                      key={p.id}
                      onClick={() => updateDraft({ colorPalette: p.id })}
                    >
                      <span className="palette-colors">
                        {p.colors.map((color) => (
                          <span key={color} style={{ background: color }} />
                        ))}
                      </span>
                      <span>{copy(locale, p.name)}</span>
                      {draft.colorPalette === p.id && <Icon name="fa-check-circle" />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-section">
                <div>
                  <h2>{t('timezone')}</h2>
                  <p>{t('timezoneHint')}</p>
                </div>
                <select
                  aria-label={t('timezone')}
                  value={draft.timeZone}
                  disabled={busy}
                  onChange={(event) => updateDraft({ timeZone: event.target.value })}
                >
                  {[
                    'Asia/Bangkok',
                    'Asia/Ho_Chi_Minh',
                    'Asia/Singapore',
                    'Asia/Tokyo',
                    'Europe/London',
                    'America/New_York',
                    'UTC',
                  ].map((zone) => (
                    <option key={zone}>{zone}</option>
                  ))}
                </select>
              </div>
              <div className="settings-section vertical">
                <h2>{t('accessibility')}</h2>
                <div className="toggle-grid">
                  {(['largeText', 'contrast', 'reducedMotion', 'captions'] as const).map(
                    (key, index) => {
                      const field = (
                        ['textScale', 'highContrast', 'reducedMotion', 'captionsEnabled'] as const
                      )[index];
                      const checked =
                        field === 'textScale' ? draft.textScale === 'large' : Boolean(draft[field]);
                      return (
                        <label className="toggle-label" key={key}>
                          <span>{t(key)}</span>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={busy}
                            onChange={(event) =>
                              updateDraft({
                                [field]:
                                  field === 'textScale'
                                    ? event.target.checked
                                      ? 'large'
                                      : 'default'
                                    : event.target.checked,
                              })
                            }
                          />
                          <span className="toggle-track" aria-hidden="true" />
                        </label>
                      );
                    },
                  )}
                </div>
              </div>
              <div className="settings-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    setDraft(preferences);
                    setNotice('');
                    setError('');
                  }}
                >
                  {t('cancel')}
                </button>
                <button
                  className="button primary"
                  disabled={busy || JSON.stringify(preferences) === JSON.stringify(draft)}
                  onClick={saveSettings}
                >
                  <Icon name="fa-check" /> {t(busy ? 'saving' : 'save')}
                </button>
              </div>
            </section>
          )}
          {initialView === 'security' && (
            <MfaPanel
              locale={locale}
              onSignedOut={() => {
                setNotice('securityUpdated');
                setUser(null);
                setSummary(null);
              }}
            />
          )}
          {((['accounts', 'mfa-policy'].includes(initialView) && !admin) ||
            (initialView === 'imports' && !canProvision)) && (
            <div className="alert alert-error">{identityMessages[locale].forbidden}</div>
          )}
          {initialView === 'accounts' && admin && (
            <AdminAccounts
              locale={locale}
              ownId={user.id}
              timeZone={preferences.timeZone}
              roleLabel={roleLabel}
            />
          )}
          {initialView === 'imports' && canProvision && (
            <CsvImportPanel locale={locale} allowUserImports={admin} />
          )}
          {initialView === 'profile-support' &&
            (canProvision ? (
              <ProfileSupportPanel locale={locale} />
            ) : (
              <div className="alert alert-error">{identityMessages[locale].forbidden}</div>
            ))}
          {initialView === 'mfa-policy' && admin && (
            <MfaPolicyPanel
              locale={locale}
              userRoles={user.roles}
              roleLabel={roleLabel}
              onSignedOut={() => {
                setNotice('securityUpdated');
                setUser(null);
                setSummary(null);
              }}
            />
          )}
          {initialView === 'mfa-policy' && admin && <IdentityPolicyPanel locale={locale} />}
          <footer className="workspace-footer">
            <span>
              CodeMark <span>·</span> {t('footer')}
            </span>
            <span>
              <span className="status-dot" /> WORKSPACE
            </span>
          </footer>
        </main>
        {initialView !== 'leaderboard' && (
          <aside id="quick-rank-rail" className="quick-rank-rail" aria-hidden={rankCollapsed} inert={rankCollapsed} aria-label={locale === 'vi' ? 'Xếp hạng nhanh' : 'Quick rankings'}>
            <QuickLeaderboard locale={locale} userId={user.id} />
          </aside>
        )}
        {initialView !== 'leaderboard' && (
          <button
            type="button"
            className={`rank-rail-toggle${rankCollapsed ? ' is-closed' : ''}`}
            aria-controls="quick-rank-rail"
            aria-expanded={!rankCollapsed}
            aria-label={rankCollapsed ? (locale === 'vi' ? 'Mở bảng xếp hạng' : 'Show rankings') : (locale === 'vi' ? 'Thu bảng xếp hạng' : 'Hide rankings')}
            title={rankCollapsed ? (locale === 'vi' ? 'Mở bảng xếp hạng' : 'Show rankings') : (locale === 'vi' ? 'Thu bảng xếp hạng' : 'Hide rankings')}
            onClick={() => {
              const next = !rankCollapsed;
              setRankCollapsed(next);
              try { window.sessionStorage.setItem(`codemark:rank-rail:${user.id}`, next ? 'closed' : 'open'); } catch { /* Session storage is optional. */ }
              if (!next && window.innerWidth < 1280) {
                window.requestAnimationFrame(() => document.getElementById('quick-rank-rail')?.scrollIntoView?.({ block: 'start' }));
              }
            }}
          >
            <Icon name="fa-trophy" />
            <span>Rank</span>
            <Icon name={rankCollapsed ? 'fa-chevron-left' : 'fa-chevron-right'} />
          </button>
        )}
        </div>
      </div>
    </div>
  );
}
