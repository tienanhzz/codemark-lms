'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { IdentityPolicyView } from '../lib/contracts';
import { selfCopy, selfError } from '../lib/selfServiceMessages';
import { IdentityAlert } from './IdentityShared';

export function IdentityPolicyPanel({ locale }: { locale: 'en' | 'vi' }) {
  const t = (key: Parameters<typeof selfCopy>[1]) => selfCopy(locale, key);
  const [policy, setPolicy] = useState<IdentityPolicyView | null>(null),
    [terms, setTerms] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function load() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const value = await api<IdentityPolicyView>('/admin/identity-policy');
      setPolicy(value);
      setTerms(value.blockedTerms.join('\n'));
    } catch (problem) {
      setError(selfError(locale, problem));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!policy) return;
    const form = event.currentTarget;
    const reason = new FormData(form).get('reason');
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const value = await api<IdentityPolicyView>('/admin/identity-policy', 'PUT', {
        expectedRevision: policy.revision,
        nicknameCooldownDays: policy.nicknameCooldownDays,
        blockedTerms: terms
          .split('\n')
          .map((term) => term.trim())
          .filter(Boolean),
        reason,
      });
      setPolicy(value);
      setTerms(value.blockedTerms.join('\n'));
      form.reset();
      setNotice(t('saved'));
    } catch (problem) {
      setError(selfError(locale, problem));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel self-service-panel">
      <div className="panel-heading">
        <h2>{t('policy')}</h2>
        <button className="button secondary" disabled={busy} onClick={() => void load()}>
          {t('reload')}
        </button>
      </div>
      <p className="field-help">{t('policyHelp')}</p>
      <IdentityAlert text={error} />
      <IdentityAlert text={notice} success />
      {!policy && busy && <p role="status">{t('busy')}</p>}
      {policy && (
        <form className="identity-form" onSubmit={save}>
          <fieldset disabled={busy}>
            <label>
              {t('cooldown')}
              <input
                type="number"
                min={0}
                max={365}
                required
                value={policy.nicknameCooldownDays}
                onChange={(event) =>
                  setPolicy({ ...policy, nicknameCooldownDays: Number(event.target.value) })
                }
              />
            </label>
            <label>
              {t('blocked')}
              <textarea
                rows={5}
                maxLength={12999}
                value={terms}
                onChange={(event) => setTerms(event.target.value)}
              />
            </label>
            <p className="field-help">{t('blockedHelp')}</p>
            <label>
              {t('reason')}
              <textarea name="reason" rows={2} required maxLength={500} />
            </label>
            <button className="button primary" disabled={busy}>
              {t(busy ? 'busy' : 'save')}
            </button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
