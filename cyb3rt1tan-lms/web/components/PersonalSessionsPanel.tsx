'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { PersonalSessionList } from '../lib/contracts';
import { selfCopy, selfError } from '../lib/selfServiceMessages';
import { IdentityAlert, Modal } from './IdentityShared';

export function PersonalSessionsPanel({
  locale,
  timeZone,
  onSignedOut,
}: {
  locale: 'en' | 'vi';
  timeZone: string;
  onSignedOut: () => void;
}) {
  const t = (key: Parameters<typeof selfCopy>[1]) => selfCopy(locale, key);
  const [data, setData] = useState<PersonalSessionList | null>(null);
  const [selected, setSelected] = useState<PersonalSessionList['items'][number] | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function load() {
    setBusy(true);
    setError('');
    try {
      setData(await api<PersonalSessionList>('/me/sessions'));
    } catch (problem) {
      setError(selfError(locale, problem));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function revoke(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const password = new FormData(event.currentTarget).get('password');
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/me/sessions/' + selected.id + '/revoke', 'POST', { current_password: password });
      const current = selected.current;
      setSelected(null);
      if (current) onSignedOut();
      else {
        setNotice(t('ended'));
        await load();
      }
    } catch (problem) {
      setError(selfError(locale, problem));
    } finally {
      setBusy(false);
    }
  }
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone,
    }).format(new Date(value));
  return (
    <section className="panel self-service-panel">
      <div className="panel-heading">
        <h2>{t('sessions')}</h2>
        <button className="button secondary" disabled={busy} onClick={() => void load()}>
          {t('reload')}
        </button>
      </div>
      <p className="field-help">{t('sessionHelp')}</p>
      {!selected && <IdentityAlert text={error} />}
      <IdentityAlert text={notice} success />
      {!data && busy && <p role="status">{t('busy')}</p>}
      {data?.items.length === 0 && <p>{t('noSessions')}</p>}
      <div className="personal-session-list">
        {data?.items.map((item) => (
          <article className="personal-session" key={item.id}>
            <div>
              <strong>{t(item.current ? 'current' : 'other')}</strong>
              {item.mfaAuthenticated && <span className="tag">MFA</span>}
              <p>
                {t('created')}: {date(item.createdAt)}
              </p>
              <p>
                {t('expires')}: {date(item.expiresAt)} ({timeZone})
              </p>
            </div>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setError('');
                setSelected(item);
              }}
            >
              {t('end')}
            </button>
          </article>
        ))}
      </div>
      {selected && (
        <Modal
          presentation="dialog"
          title={t('end')}
          onClose={() => {
            setSelected(null);
            setError('');
          }}
          locked={busy}
        >
          <IdentityAlert text={error} />
          <p>{t('sessionHelp')}</p>
          <form className="identity-form" onSubmit={revoke}>
            <label>
              {t('currentPassword')}
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                maxLength={1024}
                disabled={busy}
                autoFocus
              />
            </label>
            <div className="form-actions">
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={() => setSelected(null)}
              >
                {t('cancel')}
              </button>
              <button className="button primary" disabled={busy}>
                {t(busy ? 'busy' : 'end')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
