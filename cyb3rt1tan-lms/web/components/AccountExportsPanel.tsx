'use client';
import { useEffect, useState } from 'react';
import { api, apiDownload } from '../lib/api';
import type { AccountExportCreated } from '../lib/contracts';
import { provisioningCopy, provisioningError } from '../lib/provisioningMessages';
import { IdentityAlert, downloadBlob } from './IdentityShared';

export function AccountExportsPanel({
  locale,
  timeZone,
  filters,
}: {
  locale: 'en' | 'vi';
  timeZone?: string;
  filters: Record<string, string>;
}) {
  const t = (key: Parameters<typeof provisioningCopy>[1]) => provisioningCopy(locale, key);
  const [kind, setKind] = useState<'users' | 'enrollments'>('users');
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv');
  const [job, setJob] = useState<AccountExportCreated | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  useEffect(() => {
    if (!job) return;
    const delay = new Date(job.expiresAt).getTime() - Date.now();
    setExpired(delay <= 0);
    const timer = window.setTimeout(
      () => setExpired(true),
      Math.min(2147483647, Math.max(0, delay)),
    );
    return () => window.clearTimeout(timer);
  }, [job]);
  async function prepare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setNotice('');
    setJob(null);
    try {
      setJob(
        await api<AccountExportCreated>('/admin/account-exports', 'POST', {
          ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '')),
          kind,
          format,
          reason: fields.get('reason'),
        }),
      );
    } catch (problem) {
      setError(provisioningError(locale, problem));
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    if (!job) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const blob = await apiDownload('/admin/account-exports/' + job.id + '/download');
      downloadBlob('codemark-' + job.id + '.' + job.format, blob);
      setNotice(t('downloaded'));
    } catch (problem) {
      setError(provisioningError(locale, problem));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel self-service-panel">
      <h2>{t('exports')}</h2>
      <p className="field-help">{t('exportHelp')}</p>
      <IdentityAlert text={error} />
      <IdentityAlert text={notice} success />
      <form className="identity-form" onSubmit={prepare}>
        <fieldset disabled={busy}>
          <div className="export-selectors">
            <label>
              {t('exportKind')}
              <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
                <option value="users">{t('accounts')}</option>
                <option value="enrollments">{t('enrollmentData')}</option>
              </select>
            </label>
            <label>
              {t('format')}
              <select
                value={format}
                onChange={(event) => setFormat(event.target.value as typeof format)}
              >
                <option value="csv">CSV</option>
                <option value="xlsx">XLSX</option>
              </select>
            </label>
          </div>
          {kind === 'enrollments' && <p className="field-help">{t('enrollmentFilters')}</p>}
          <label>
            {t('exportReason')}
            <textarea name="reason" required maxLength={500} rows={2} />
          </label>
          <button className="button primary" disabled={busy}>
            {t(busy && !job ? 'preparing' : 'prepare')}
          </button>
        </fieldset>
      </form>
      {job && (
        <div className="export-ready">
          <h3>{t('ready')}</h3>
          <p>
            {t('count')}: <strong>{job.rowCount}</strong> · {job.format.toUpperCase()}
          </p>
          <p>
            {t('expires')}:{' '}
            {new Intl.DateTimeFormat(locale, {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: timeZone || 'Asia/Bangkok',
            }).format(new Date(job.expiresAt))}{' '}
            ({timeZone || 'Asia/Bangkok'})
          </p>
          <p className="field-help">{t('frozen')}</p>
          {expired && <IdentityAlert text={t('export_expired')} />}
          <button
            className="button secondary"
            disabled={busy || expired}
            onClick={() => void download()}
          >
            {t(busy ? 'downloading' : 'download')}
          </button>
        </div>
      )}
    </section>
  );
}
