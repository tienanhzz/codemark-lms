'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { SupportPersonList, SupportPerson, SupportProfile } from '../lib/contracts';
import { profileCopy, profileError } from '../lib/profileMessages';
import { selfCopy } from '../lib/selfServiceMessages';
import { IdentityAlert, Modal } from './IdentityShared';

export function ProfileSupportPanel({ locale }: { locale: 'en' | 'vi' }) {
  const t = (key: Parameters<typeof profileCopy>[1]) => profileCopy(locale, key);
  const s = (key: Parameters<typeof selfCopy>[1]) => selfCopy(locale, key);
  const [query, setQuery] = useState(''),
    [draftQuery, setDraftQuery] = useState('');
  const [list, setList] = useState<SupportPersonList | null>(null);
  const [selected, setSelected] = useState<SupportPerson | null>(null),
    [profile, setProfile] = useState<SupportProfile | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function load(next?: string) {
    setLoading(true);
    setError('');
    try {
      const value = await api<SupportPersonList>(
        '/profile-support/users?' +
          new URLSearchParams({ query, ...(next ? { cursor: next } : {}) }),
      );
      setList((old) => ({
        ...value,
        items: next ? [...(old?.items || []), ...value.items] : value.items,
      }));
    } catch (problem) {
      setError(profileError(locale, problem));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [query]);
  async function access(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setProfile(
        await api<SupportProfile>('/profile-support/users/' + selected.id + '/access', 'POST', {
          reason,
        }),
      );
    } catch (problem) {
      setError(profileError(locale, problem));
    } finally {
      setBusy(false);
    }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const value = await api<SupportProfile>('/profile-support/users/' + profile.id, 'PATCH', {
        expectedRevision: profile.revision,
        reason,
        contactEmail: profile.contactEmail,
        phone: profile.phone,
        about: profile.about,
        academicTitle: profile.academicTitle,
      });
      setProfile(value);
      setNotice(s('saved'));
    } catch (problem) {
      setError(profileError(locale, problem));
    } finally {
      setBusy(false);
    }
  }
  function close() {
    setSelected(null);
    setProfile(null);
    setReason('');
    setNotice('');
    setError('');
  }
  const readOnly = profile && !['active', 'invited'].includes(profile.status);
  return (
    <section className="panel self-service-panel">
      <h2>{t('support')}</h2>
      <p className="field-help">{t('supportHelp')}</p>
      {!selected && <IdentityAlert text={error} />}
      <form
        className="support-search"
        onSubmit={(event) => {
          event.preventDefault();
          if (query === draftQuery) void load();
          else setQuery(draftQuery);
        }}
      >
        <label>
          {t('search')}
          <input
            maxLength={200}
            value={draftQuery}
            disabled={loading}
            onChange={(event) => setDraftQuery(event.target.value)}
          />
        </label>
        <button className="button secondary" disabled={loading}>
          {t('find')}
        </button>
      </form>
      {loading && <p role="status">{s('busy')}</p>}
      {list?.items.length === 0 && <p>{t('empty')}</p>}
      <div className="support-list">
        {list?.items.map((person) => (
          <article key={person.id}>
            <div>
              <strong>{person.officialName}</strong>
              <p>
                @{person.username} · {person.institutionalId || '—'}
              </p>
            </div>
            <button
              className="button secondary"
              onClick={() => {
                setSelected(person);
                setProfile(null);
                setError('');
                setNotice('');
                setReason('');
              }}
            >
              {t('open')}
            </button>
          </article>
        ))}
      </div>
      {list?.nextCursor && (
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => void load(list.nextCursor!)}
        >
          {t('more')}
        </button>
      )}
      {selected && (
        <Modal title={selected.officialName} onClose={close} locked={busy}>
          <IdentityAlert text={error} />
          <IdentityAlert text={notice} success />
          <p className="field-help">{t('auditHelp')}</p>
          <form className="identity-form" onSubmit={profile ? save : access}>
            <label>
              {t('reason')}
              <textarea
                required
                maxLength={500}
                rows={2}
                disabled={busy}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            {profile && (
              <>
                <p>
                  @{profile.username} · {profile.institutionalId || '—'}
                </p>
                {readOnly && <p className="service-note">{t('readOnly')}</p>}
                <fieldset disabled={busy || Boolean(readOnly)}>
                  <label>
                    {s('contactEmail')}
                    <input
                      type="email"
                      maxLength={320}
                      value={profile.contactEmail || ''}
                      onChange={(event) =>
                        setProfile({ ...profile, contactEmail: event.target.value || null })
                      }
                    />
                  </label>
                  <label>
                    {s('phone')}
                    <input
                      type="tel"
                      maxLength={40}
                      value={profile.phone || ''}
                      onChange={(event) =>
                        setProfile({ ...profile, phone: event.target.value || null })
                      }
                    />
                  </label>
                  <label>
                    {s('about')}
                    <textarea
                      rows={4}
                      maxLength={2000}
                      value={profile.about}
                      onChange={(event) => setProfile({ ...profile, about: event.target.value })}
                    />
                  </label>
                  <label>
                    {s('academicTitle')}
                    <input
                      maxLength={120}
                      value={profile.academicTitle}
                      onChange={(event) =>
                        setProfile({ ...profile, academicTitle: event.target.value })
                      }
                    />
                  </label>
                </fieldset>
              </>
            )}
            <div className="form-actions">
              <button type="button" className="button secondary" disabled={busy} onClick={close}>
                {s('cancel')}
              </button>
              {profile && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    setNotice('');
                    try {
                      setProfile(
                        await api<SupportProfile>(
                          '/profile-support/users/' + selected.id + '/access',
                          'POST',
                          { reason },
                        ),
                      );
                    } catch (problem) {
                      setError(profileError(locale, problem));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {s('reload')}
                </button>
              )}
              <button className="button primary" disabled={busy || Boolean(profile && readOnly)}>
                {busy ? s('busy') : profile ? s('save') : t('access')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
