'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { MfaRolePolicyListResponse } from '../lib/contracts';
import { identityMessages, identityError } from '../lib/identityMessages';
import { IdentityAlert, Modal } from './IdentityShared';

export function MfaPolicyPanel({
  locale,
  userRoles,
  roleLabel,
  onSignedOut,
}: {
  locale: 'en' | 'vi';
  userRoles: string[];
  roleLabel: (role: string) => string;
  onSignedOut: () => void;
}) {
  const t = identityMessages[locale];
  const [policies, setPolicies] = useState<MfaRolePolicyListResponse | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<{ role: string; required: boolean } | null>(null),
    [busy, setBusy] = useState(false);
  const load = () =>
    api<MfaRolePolicyListResponse>('/admin/security/mfa-policies')
      .then(setPolicies)
      .catch((problem) => setError(identityError(locale, problem)));
  useEffect(() => {
    void load();
  }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await api('/admin/security/mfa-policies/' + selected.role, 'PUT', {
        required: selected.required,
        reason: new FormData(event.currentTarget).get('reason'),
      });
      const revoked = userRoles.includes(selected.role);
      setSelected(null);
      if (revoked) onSignedOut();
      else {
        setNotice(t.updated);
        await load();
      }
    } catch (problem) {
      setError(identityError(locale, problem));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="identity-screen">
      <p className="service-note">{t.policyHelp}</p>
      <IdentityAlert text={error} />
      <IdentityAlert text={notice} success />
      {policies ? (
        <div className="policy-grid">
          {policies.items.map((policy) => (
            <section className="panel policy-card" key={policy.role}>
              <span className="soft-icon">
                <i className="fa-solid fa-shield-halved" aria-hidden="true" />
              </span>
              <h2>{roleLabel(policy.role)}</h2>
              <span className={`state-badge ${policy.required ? 'state-active' : ''}`}>
                {policy.required ? t.required : t.optional}
              </span>
              <button
                className="button secondary"
                onClick={() => {
                  setSelected({ role: policy.role, required: !policy.required });
                  setError('');
                }}
              >
                {policy.required ? t.optional : t.required}
              </button>
            </section>
          ))}
        </div>
      ) : (
        <p className="empty-small">
          {t.loading}
          <button className="button secondary" onClick={load}>
            {t.retry}
          </button>
        </p>
      )}
      {selected && (
        <Modal
          presentation="dialog"
          title={roleLabel(selected.role) + ' · ' + (selected.required ? t.required : t.optional)}
          onClose={() => setSelected(null)}
        >
          <form className="identity-form" onSubmit={save}>
            <IdentityAlert text={error} />
            <p>{t.policyIntro}</p>
            <label>
              {t.reason}
              <textarea name="reason" required maxLength={500} rows={3} />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setSelected(null)}
              >
                {t.cancel}
              </button>
              <button className="button primary" disabled={busy}>
                {t.savePolicy}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
