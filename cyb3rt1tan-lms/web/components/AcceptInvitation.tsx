'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { LoginResponse, InvitationRequiresMfaResponse } from '../lib/contracts';
import { identityMessages, identityError } from '../lib/identityMessages';
import { IdentityAlert } from './IdentityShared';

export function AcceptInvitation({
  locale,
  onAccepted,
}: {
  locale: 'en' | 'vi';
  onAccepted: () => void;
}) {
  const t = identityMessages[locale];
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false),
    [requiredMfa, setRequiredMfa] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    setToken(value);
    window.history.replaceState(null, '', window.location.pathname);
  }, []);
  async function accept(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    if (data.get('password') !== data.get('confirmation')) {
      setError(t.confirmMismatch);
      return;
    }
    setBusy(true);
    try {
      const response = await api<LoginResponse | InvitationRequiresMfaResponse>(
        '/auth/accept-invitation',
        'POST',
        {
          token,
          username: data.get('username'),
          official_name: data.get('name'),
          password: data.get('password'),
        },
      );
      if ('mfaEnrollmentRequired' in response) {
        setRequiredMfa(true);
        setToken('');
      } else {
        setToken('');
        onAccepted();
      }
    } catch (problem) {
      setError(identityError(locale, problem));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="accept-page">
      <section className="panel accept-card">
        <div className="accept-brand">
          <i className="fa-solid fa-layer-group" aria-hidden="true" /> CodeMark.
        </div>
        <h1>{t.acceptance}</h1>
        <p className="muted">{t.acceptanceHelp}</p>
        <IdentityAlert text={error} />
        {requiredMfa ? (
          <p className="alert alert-success">{t.setupRequired}</p>
        ) : !token ? (
          <p className="alert alert-error">{t.invalidLink}</p>
        ) : (
          <form className="identity-form" onSubmit={accept}>
            <label>
              {t.username}
              <input
                name="username"
                autoComplete="username"
                pattern="[a-zA-Z0-9._-]{3,128}"
                required
                maxLength={128}
              />
            </label>
            <label>
              {t.officialName}
              <input name="name" autoComplete="name" required maxLength={200} />
            </label>
            <label>
              {t.password}
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                required
                autoComplete="new-password"
              />
            </label>
            <label>
              {t.confirmPassword}
              <input
                name="confirmation"
                type="password"
                minLength={12}
                maxLength={128}
                required
                autoComplete="new-password"
              />
            </label>
            <p className="field-help">{t.passwordHint}</p>
            <button className="button primary" disabled={busy}>
              {t.accept}
            </button>
          </form>
        )}
        <Link href="/" className="text-link">
          {t.signIn}
        </Link>
      </section>
    </main>
  );
}
