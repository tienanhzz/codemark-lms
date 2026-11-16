'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { RecoveryStatus } from '../lib/contracts';
import { selfCopy, selfError } from '../lib/selfServiceMessages';
import { IdentityAlert } from './IdentityShared';

export function PasswordRecovery({ reset = false }: { reset?: boolean }) {
  const [locale, setLocale] = useState<'en' | 'vi'>('vi');
  const t = (key: Parameters<typeof selfCopy>[1]) => selfCopy(locale, key);
  const [token, setToken] = useState('');
  const capturedToken = useRef<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [done, setDone] = useState(false);
  async function check() {
    setError('');
    setAvailable(null);
    try {
      setAvailable((await api<RecoveryStatus>('/auth/recovery/status')).available);
    } catch (problem) {
      setError(selfError(locale, problem));
    }
  }
  useEffect(() => {
    if (reset) {
      if (capturedToken.current === null) {
        const value = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
        window.history.replaceState(null, '', window.location.pathname);
        capturedToken.current = /^[A-Za-z0-9_-]{40,128}$/.test(value) ? value : '';
      }
      setToken(capturedToken.current);
    } else {
      void check();
    }
  }, [reset]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const password = String(fields.get('password') || '');
    if (reset && password !== fields.get('confirmation')) {
      setError(t('confirmMismatch'));
      return;
    }
    if (reset && (password.length < 12 || password.length > 128 || !password.trim())) {
      setError(t('passwordInvalid'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(
        reset ? '/auth/password-resets/complete' : '/auth/password-resets',
        'POST',
        reset ? { token, new_password: password } : { email: fields.get('email') },
      );
      setDone(true);
      setToken('');
      capturedToken.current = '';
    } catch (problem) {
      setError(selfError(locale, problem));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="recovery-page">
      <section className="panel recovery-card">
        <div className="panel-heading">
          <span className="brand-name">CodeMark</span>
          <select
            aria-label="Language / Ngôn ngữ"
            value={locale}
            disabled={busy}
            onChange={(event) => {
              setLocale(event.target.value as 'en' | 'vi');
              setError('');
            }}
          >
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </select>
        </div>
        <span className="login-icon">
          <i className="fa-solid fa-key" aria-hidden="true" />
        </span>
        <h1>{t(reset ? 'reset' : 'recovery')}</h1>
        <p className="muted">{t(reset ? 'resetHelp' : 'recoveryHelp')}</p>
        <IdentityAlert text={error} />
        {done ? (
          <IdentityAlert text={t(reset ? 'complete' : 'sent')} success />
        ) : (
          <>
            {!reset && available === null && !error && <p role="status">{t('checking')}</p>}
            {!reset && available === false && <p className="service-note">{t('unavailable')}</p>}
            {reset && !token ? (
              <IdentityAlert text={t('invalid_reset_token')} />
            ) : (
              <form className="identity-form" onSubmit={submit}>
                <fieldset disabled={busy || (!reset && available !== true)}>
                  {reset ? (
                    <>
                      <label>
                        {t('newPassword')}
                        <input
                          name="password"
                          type="password"
                          required
                          minLength={12}
                          maxLength={128}
                          autoComplete="new-password"
                        />
                      </label>
                      <label>
                        {t('confirmation')}
                        <input
                          name="confirmation"
                          type="password"
                          required
                          minLength={12}
                          maxLength={128}
                          autoComplete="new-password"
                        />
                      </label>
                    </>
                  ) : (
                    <label>
                      {t('email')}
                      <input
                        name="email"
                        type="email"
                        required
                        maxLength={320}
                        autoComplete="email"
                      />
                    </label>
                  )}
                  <button className="button primary" type="submit">
                    {t(busy ? 'busy' : reset ? 'reset' : 'send')}
                  </button>
                </fieldset>
              </form>
            )}
            {!reset && (
              <button className="button secondary" disabled={busy} onClick={() => void check()}>
                {t('reload')}
              </button>
            )}
          </>
        )}
        {reset && !done && (
          <Link className="text-link" href="/forgot-password">
            {t('forgot')}
          </Link>
        )}
        <Link className="text-link" href="/">
          {t('back')}
        </Link>
      </section>
    </main>
  );
}
