'use client';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type {
  MfaEnrollmentResponse,
  MfaEnrollmentCompleteResponse,
  RequiredMfaEnrollmentResponse,
  MfaStatusResponse,
} from '../lib/contracts';
import { identityMessages, identityError } from '../lib/identityMessages';
import { IdentityAlert, Modal, downloadText } from './IdentityShared';

export function MfaEnrollment({
  locale,
  setupToken,
  onComplete,
  onCancel,
}: {
  locale: 'en' | 'vi';
  setupToken?: string;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const t = identityMessages[locale];
  const [enrollment, setEnrollment] = useState<MfaEnrollmentResponse | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!codes.length) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [codes]);
  async function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      setEnrollment(
        await api<MfaEnrollmentResponse>(
          setupToken ? '/auth/mfa/enrollment' : '/me/security/mfa/enrollment',
          'POST',
          setupToken ? { setup_token: setupToken } : { current_password: data.get('password') },
        ),
      );
    } catch (problem) {
      setError(identityError(locale, problem));
    } finally {
      setBusy(false);
    }
  }
  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<MfaEnrollmentCompleteResponse | RequiredMfaEnrollmentResponse>(
        setupToken ? '/auth/mfa/enrollment/confirm' : '/me/security/mfa/enrollment/confirm',
        'POST',
        { code: data.get('code'), ...(setupToken ? { setup_token: setupToken } : {}) },
      );
      setEnrollment(null);
      setCodes(result.recoveryCodes);
    } catch (problem) {
      setError(identityError(locale, problem));
    } finally {
      setBusy(false);
    }
  }
  if (codes.length)
    return (
      <Modal presentation="dialog" title={t.recoveryTitle} locked onClose={() => {}}>
        <div className="identity-form">
          <p>{t.recoveryHelp}</p>
          <div className="recovery-grid">
            {codes.map((code) => (
              <code key={code}>{code}</code>
            ))}
          </div>
          <button
            className="button secondary"
            onClick={() => downloadText('codemark-recovery-codes.txt', codes.join('\n') + '\n')}
          >
            {t.downloadCodes}
          </button>
          <label className="check-label">
            <input
              type="checkbox"
              checked={saved}
              onChange={(event) => setSaved(event.target.checked)}
            />
            {t.recoverySaved}
          </label>
          <button
            className="button primary"
            disabled={!saved}
            onClick={() => {
              setCodes([]);
              onComplete();
            }}
          >
            {t.finish}
          </button>
        </div>
      </Modal>
    );
  return (
    <div className="mfa-wizard">
      <IdentityAlert text={error} />
      {!enrollment ? (
        <form onSubmit={start} className="identity-form">
          {setupToken ? (
            <p>{t.setupRequired}</p>
          ) : (
            <label>
              {t.currentPassword}
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={1024}
              />
            </label>
          )}
          <div className="form-actions">
            <button type="button" className="button secondary" disabled={busy} onClick={onCancel}>
              {t.cancel}
            </button>
            <button className="button primary" disabled={busy}>
              {t.start}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={confirm} className="identity-form">
          <p>{t.scan}</p>
          <div className="qr-frame">
            <QRCodeSVG value={enrollment.otpauthUri} size={176} marginSize={3} />
          </div>
          <label>
            {t.manual}
            <input value={enrollment.secret} readOnly spellCheck={false} className="secret-key" />
          </label>
          <p className="field-help">{t.expiresSetup}</p>
          <label>
            {t.code}
            <input
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
            />
          </label>
          <div className="form-actions">
            <button type="button" className="button secondary" disabled={busy} onClick={onCancel}>
              {t.cancel}
            </button>
            <button className="button primary" disabled={busy}>
              {t.confirmMfa}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function MfaPanel({
  locale,
  onSignedOut,
}: {
  locale: 'en' | 'vi';
  onSignedOut: () => void;
}) {
  const t = identityMessages[locale];
  const [status, setStatus] = useState<MfaStatusResponse | null>(null);
  const [wizard, setWizard] = useState(false),
    [disable, setDisable] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = () =>
    api<MfaStatusResponse>('/me/security/mfa')
      .then(setStatus)
      .catch((problem) => setError(identityError(locale, problem)));
  useEffect(() => {
    void load();
  }, []);
  async function disableMfa(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      await api('/me/security/mfa/disable', 'POST', {
        current_password: data.get('password'),
        code: data.get('code'),
      });
      onSignedOut();
    } catch (problem) {
      setError(identityError(locale, problem));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel mfa-panel">
      <div className="panel-heading">
        <h2>{t.mfa}</h2>
        <span className={`state-badge ${status?.enabled ? 'state-active' : ''}`}>
          {status ? (status.enabled ? t.enabled : t.disabled) : t.loading}
        </span>
      </div>
      <div className="identity-form">
        <p className="muted">{t.mfaIntro}</p>
        <IdentityAlert text={error} />
        {!status && error && (
          <button className="button secondary" onClick={load}>
            {t.retry}
          </button>
        )}
        {status && !wizard && !disable && (
          <button
            className="button secondary"
            onClick={() => (status.enabled ? setDisable(true) : setWizard(true))}
          >
            {status.enabled ? t.disableMfa : t.setUp}
          </button>
        )}
      </div>
      {wizard && (
        <MfaEnrollment locale={locale} onCancel={() => setWizard(false)} onComplete={onSignedOut} />
      )}
      {disable && (
        <form className="identity-form" onSubmit={disableMfa}>
          <label>
            {t.currentPassword}
            <input name="password" type="password" required autoComplete="current-password" />
          </label>
          <label>
            {t.code}
            <input
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
            />
          </label>
          <div className="form-actions">
            <button type="button" className="button secondary" onClick={() => setDisable(false)}>
              {t.cancel}
            </button>
            <button className="button danger" disabled={busy}>
              {t.disableMfa}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
