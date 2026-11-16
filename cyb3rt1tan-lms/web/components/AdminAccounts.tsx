'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type {
  AdminAccountSearchResponse,
  AdminAccountDetail,
  AdminSessionList,
  AdminIdentityStatus,
  InvitationCreatedResponse,
} from '../lib/contracts';
import { identityMessages, identityError, type IdentityKey } from '../lib/identityMessages';
import { IdentityAlert, Modal, StateBadge, roles } from './IdentityShared';
import { AccountExportsPanel } from './AccountExportsPanel';
import { provisioningCopy } from '../lib/provisioningMessages';

type AccountAction = 'suspend' | 'restore' | 'revoke' | 'resetMfa' | 'saveRoles';
export function AdminAccounts({
  locale,
  ownId,
  roleLabel,
  timeZone = 'Asia/Bangkok',
}: {
  locale: 'en' | 'vi';
  ownId: string;
  roleLabel: (role: string) => string;
  timeZone?: string;
}) {
  const t = identityMessages[locale];
  const p = (key: Parameters<typeof provisioningCopy>[1]) => provisioningCopy(locale, key);
  const [faculty, setFaculty] = useState(''),
    [source, setSource] = useState(''),
    [course, setCourse] = useState('');
  const [result, setResult] = useState<AdminAccountSearchResponse | null>(null);
  const [query, setQuery] = useState(''),
    [role, setRole] = useState(''),
    [status, setStatus] = useState('');
  const [cursor, setCursor] = useState<string | null>(null),
    [previous, setPrevious] = useState<(string | null)[]>([]);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [capabilities, setCapabilities] = useState<AdminIdentityStatus | null>(null);
  const [selected, setSelected] = useState<string | null>(null),
    [detail, setDetail] = useState<AdminAccountDetail | null>(null);
  const [sessions, setSessions] = useState<AdminSessionList | null>(null),
    [tab, setTab] = useState('overview');
  const [assigned, setAssigned] = useState<string[]>([]),
    [pending, setPending] = useState<AccountAction | null>(null),
    [inviting, setInviting] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    api<AdminIdentityStatus>('/admin/identity/status')
      .then(setCapabilities)
      .catch((problem) => setError(identityError(locale, problem)));
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const parameters = new URLSearchParams({
          query,
          pageSize: '25',
          ...(role ? { role } : {}),
          ...(status ? { status } : {}),
          ...(cursor ? { cursor } : {}),
          ...(faculty ? { facultyId: faculty } : {}),
          ...(source ? { source } : {}),
          ...(course ? { courseId: course } : {}),
        });
        const page = await api<AdminAccountSearchResponse>('/admin/users?' + parameters);
        if (active) {
          setResult(page);
          setError('');
        }
      } catch (problem) {
        if (active) setError(identityError(locale, problem));
      } finally {
        if (active) setLoading(false);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, role, status, faculty, source, course, cursor, reload]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    setDetail(null);
    setSessions(null);
    setPending(null);
    setTab('overview');
    Promise.all([
      api<AdminAccountDetail>('/admin/users/' + selected),
      api<AdminSessionList>('/admin/users/' + selected + '/sessions'),
    ])
      .then(([record, list]) => {
        if (active) {
          setDetail(record);
          setAssigned(record.roles);
          setSessions(list);
        }
      })
      .catch((problem) => {
        if (active) setError(identityError(locale, problem));
      });
    return () => {
      active = false;
    };
  }, [selected]);
  function resetPage() {
    setCursor(null);
    setPrevious([]);
  }
  async function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !pending) return;
    setBusy(true);
    setError('');
    const reason = String(new FormData(event.currentTarget).get('reason') || '');
    const suffix = {
      suspend: 'suspensions',
      restore: 'restore',
      revoke: 'sessions/revocations',
      resetMfa: 'mfa-resets',
      saveRoles: 'roles',
    }[pending];
    try {
      await api(
        '/admin/users/' + detail.id + '/' + suffix,
        pending === 'saveRoles' ? 'PATCH' : 'POST',
        {
          reason,
          ...(pending === 'saveRoles'
            ? { roles: assigned, expectedRevision: detail.revision }
            : {}),
        },
      );
      const [updated, list] = await Promise.all([
        api<AdminAccountDetail>('/admin/users/' + detail.id),
        api<AdminSessionList>('/admin/users/' + detail.id + '/sessions'),
      ]);
      setDetail(updated);
      setAssigned(updated.roles);
      setSessions(list);
      setPending(null);
      setNotice(t.updated);
      setReload((value) => value + 1);
    } catch (problem) {
      setError(identityError(locale, problem));
    } finally {
      setBusy(false);
    }
  }
  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      await api<InvitationCreatedResponse>('/admin/invitations', 'POST', {
        email: data.get('email'),
        role: data.get('role'),
        expiresAt: new Date(Date.now() + Number(data.get('days')) * 86400000).toISOString(),
      });
      setInviting(false);
      setNotice(t.invitationSent);
    } catch (problem) {
      setError(identityError(locale, problem));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="identity-screen">
      <IdentityAlert text={error} />
      <IdentityAlert text={notice} success />
      {capabilities && !capabilities.smtpConfigured && (
        <div className="service-note">
          <i className="fa-solid fa-envelope" aria-hidden="true" />
          {t.smtpMissing}
        </div>
      )}
      <section className="panel">
        <div className="admin-toolbar">
          <label className="search-field">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <input
              aria-label={t.search}
              placeholder={t.search}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetPage();
              }}
            />
          </label>
          <button
            className="button primary"
            disabled={!capabilities?.smtpConfigured}
            onClick={() => {
              setInviting(true);
              setError('');
            }}
          >
            <i className="fa-solid fa-user-plus" aria-hidden="true" />
            {t.invite}
          </button>
        </div>
        <div className="account-filters">
          <label>
            {p('faculty')}
            <input
              maxLength={128}
              value={faculty}
              onChange={(event) => {
                setFaculty(event.target.value);
                resetPage();
              }}
            />
          </label>
          <label>
            {p('course')}
            <input
              maxLength={36}
              value={course}
              onChange={(event) => {
                setCourse(event.target.value);
                resetPage();
              }}
            />
          </label>
          <label>
            {p('source')}
            <select
              value={source}
              onChange={(event) => {
                setSource(event.target.value);
                resetPage();
              }}
            >
              <option value="">{p('anySource')}</option>
              {(['legacy', 'csv', 'invitation', 'bootstrap'] as const).map((value) => (
                <option key={value} value={value}>
                  {p(value)}
                </option>
              ))}
            </select>
          </label>
          <select
            aria-label={t.role}
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              resetPage();
            }}
          >
            <option value="">{t.allRoles}</option>
            {roles.map((value) => (
              <option key={value} value={value}>
                {roleLabel(value)}
              </option>
            ))}
          </select>
          <select
            aria-label={t.status}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              resetPage();
            }}
          >
            <option value="">{t.allStatuses}</option>
            {['active', 'invited', 'suspended', 'closed'].map((value) => (
              <option key={value} value={value}>
                {t[value as IdentityKey]}
              </option>
            ))}
          </select>
        </div>
        <div className="table-scroll" aria-busy={loading}>
          <table className="identity-table">
            <thead>
              <tr>
                <th>{t.officialName}</th>
                <th>{t.role}</th>
                <th>{t.status}</th>
                <th>{t.institutionalId}</th>
                <th>
                  <span className="sr-only">{t.details}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="empty-table">
                    {t.loading}
                  </td>
                </tr>
              ) : result?.items.length ? (
                result.items.map((person) => (
                  <tr key={person.id}>
                    <td>
                      <strong>{person.officialName}</strong>
                      <small>{person.email}</small>
                      <small>@{person.username}</small>
                    </td>
                    <td>
                      <div className="role-tags table-roles">
                        {person.roles.map((value) => (
                          <span className="tag" key={value}>
                            {roleLabel(value)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <StateBadge value={person.status} locale={locale} />
                    </td>
                    <td>{person.institutionalId || '—'}</td>
                    <td>
                      <button
                        className="button secondary table-action"
                        onClick={() => {
                          setSelected(person.id);
                          setError('');
                        }}
                      >
                        {t.details}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="empty-table">
                    {t.empty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-pagination">
          <span>
            {result?.items.length || 0} {t.people.toLowerCase()}
          </span>
          <div>
            <button
              className="button secondary"
              disabled={!previous.length || loading}
              onClick={() => {
                setCursor(previous[previous.length - 1]);
                setPrevious(previous.slice(0, -1));
              }}
            >
              {t.previous}
            </button>
            <button
              className="button secondary"
              disabled={!result?.nextCursor || loading}
              onClick={() => {
                setPrevious([...previous, cursor]);
                setCursor(result?.nextCursor || null);
              }}
            >
              {t.next}
            </button>
          </div>
        </div>
      </section>
      <AccountExportsPanel
        locale={locale}
        timeZone={timeZone}
        filters={{ query, role, status, facultyId: faculty, source, courseId: course }}
      />
      {selected && (
        <Modal
          title={detail?.officialName || t.loading}
          onClose={() => {
            setSelected(null);
            setPending(null);
          }}
        >
          <IdentityAlert text={error} />
          <div className="identity-tabs" role="tablist">
            {['overview', 'access', 'sessions'].map((value) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                className={tab === value ? 'selected' : ''}
                onClick={() => {
                  setTab(value);
                  setPending(null);
                }}
              >
                {t[value as IdentityKey]}
              </button>
            ))}
          </div>
          {detail ? (
            <div className="identity-detail">
              {detail.id === ownId && <p className="service-note">{t.ownAccount}</p>}
              {tab === 'overview' && (
                <>
                  <div className="profile-fields">
                    {[
                      [t.username, detail.username],
                      [t.email, detail.email],
                      [t.institutionalId, detail.institutionalId || '—'],
                      [p('faculty'), detail.facultyId || '—'],
                      [p('source'), detail.source ? p(detail.source) : p('legacy')],
                      [
                        t.created,
                        new Date(detail.createdAt).toLocaleDateString(locale, { timeZone }),
                      ],
                      [t.status, t[detail.status]],
                      [t.mfa, detail.mfaEnabled ? t.enabled : t.disabled],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                  <button
                    className={`button ${detail.status === 'active' ? 'danger' : 'secondary'}`}
                    disabled={
                      detail.id === ownId || !['active', 'suspended'].includes(detail.status)
                    }
                    onClick={() => setPending(detail.status === 'active' ? 'suspend' : 'restore')}
                  >
                    {detail.status === 'active' ? t.suspend : t.restore}
                  </button>
                </>
              )}
              {tab === 'access' && (
                <>
                  <div className="role-checkboxes">
                    {roles.map((value) => (
                      <label key={value}>
                        <input
                          type="checkbox"
                          checked={assigned.includes(value)}
                          onChange={(event) =>
                            setAssigned(
                              event.target.checked
                                ? [...assigned, value]
                                : assigned.filter((role) => role !== value),
                            )
                          }
                        />
                        {roleLabel(value)}
                      </label>
                    ))}
                  </div>
                  <div className="form-actions">
                    <button
                      className="button primary"
                      disabled={
                        !assigned.length ||
                        JSON.stringify([...assigned].sort()) ===
                          JSON.stringify([...detail.roles].sort())
                      }
                      onClick={() => setPending('saveRoles')}
                    >
                      {t.saveRoles}
                    </button>
                    <button
                      className="button danger"
                      disabled={!detail.mfaEnabled || detail.id === ownId}
                      onClick={() => setPending('resetMfa')}
                    >
                      {t.resetMfa}
                    </button>
                  </div>
                </>
              )}
              {tab === 'sessions' && (
                <>
                  <p className="field-help">{t.sessionHelp}</p>
                  {sessions?.items.length ? (
                    sessions.items.map((session) => (
                      <div className="session-row" key={session.id}>
                        <div>
                          <code>{session.id.slice(0, 8)}</code>
                          <small>
                            {t.created}:{' '}
                            {new Date(session.createdAt).toLocaleString(locale, { timeZone })}
                            <br />
                            {t.expires}:{' '}
                            {new Date(session.expiresAt).toLocaleString(locale, { timeZone })}
                          </small>
                        </div>
                        <span className="tag">
                          {session.mfaAuthenticated ? t.verified : t.notVerified}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="empty-small">{t.noSessions}</p>
                  )}
                  <button
                    className="button danger"
                    disabled={!sessions?.items.length}
                    onClick={() => setPending('revoke')}
                  >
                    {t.revoke}
                  </button>
                </>
              )}
              {pending && (
                <form className="reason-form" onSubmit={apply}>
                  <h3>{t[pending]}</h3>
                  <p>{t.reasonHelp}</p>
                  <label>
                    {t.reason}
                    <textarea name="reason" required maxLength={500} rows={3} autoFocus />
                  </label>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy}
                      onClick={() => setPending(null)}
                    >
                      {t.cancel}
                    </button>
                    <button className="button primary" disabled={busy}>
                      {t.apply}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <div className="empty-table">
              {t.loading}
              {error && (
                <button
                  className="button secondary"
                  onClick={() => {
                    const id = selected;
                    setSelected(null);
                    setTimeout(() => setSelected(id), 0);
                  }}
                >
                  {t.retry}
                </button>
              )}
            </div>
          )}
        </Modal>
      )}
      {inviting && (
        <Modal title={t.invite} onClose={() => setInviting(false)}>
          <form className="identity-form" onSubmit={invite}>
            <p className="muted">{t.inviteHelp}</p>
            <IdentityAlert text={error} />
            <label>
              {t.email}
              <input name="email" type="email" required maxLength={320} />
            </label>
            <label>
              {t.role}
              <select name="role">
                {roles.map((value) => (
                  <option value={value} key={value}>
                    {roleLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.expires}
              <select name="days" defaultValue="2">
                {[1, 2, 7].map((value) => (
                  <option key={value} value={value}>
                    {value} {t.days}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setInviting(false)}
              >
                {t.cancel}
              </button>
              <button className="button primary" disabled={busy}>
                {t.invite}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
