'use client';
import { useState } from 'react';
import { api, apiCsv } from '../lib/api';
import type { CsvImportCreated, CsvImportPreview, CsvImportCommit } from '../lib/contracts';
import { identityMessages } from '../lib/identityMessages';
import { IdentityAlert, downloadText } from './IdentityShared';
import { provisioningCopy, provisioningError } from '../lib/provisioningMessages';

export function CsvImportPanel({
  locale,
  allowUserImports = true,
}: {
  locale: 'en' | 'vi';
  allowUserImports?: boolean;
}) {
  const t = identityMessages[locale];
  const p = (key: Parameters<typeof provisioningCopy>[1]) => provisioningCopy(locale, key);
  const [template, setTemplate] = useState(allowUserImports ? 'users-v1' : 'enrollments-v1');
  const kind = template.startsWith('users') ? 'users' : 'enrollments';
  const [file, setFile] = useState<File | null>(null),
    [policy, setPolicy] = useState<'upsert' | 'skip'>('upsert');
  const [raw, setRaw] = useState<ArrayBuffer | null>(null),
    [preview, setPreview] = useState<CsvImportPreview | null>(null);
  const [committed, setCommitted] = useState<CsvImportCommit | null>(null);
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  function reset() {
    setPreview(null);
    setCommitted(null);
    setConfirmed(false);
    setRaw(null);
    setError('');
  }
  async function previewFile() {
    if (!file) return;
    setBusy(true);
    setError('');
    setPreview(null);
    setRaw(null);
    setConfirmed(false);
    try {
      if (file.size > 1000000) throw new Error('csv_too_large');
      const bytes = await file.arrayBuffer();
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const checksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('');
      const job = await api<CsvImportCreated>('/admin/csv-imports', 'POST', {
        importKind: kind,
        templateVersion: template === 'users-v2' ? 2 : 1,
        duplicatePolicy: policy,
        sourceFilename: file.name,
      });
      const result = await apiCsv<CsvImportPreview>(
        '/admin/csv-imports/' + job.jobId + '/preview',
        bytes,
        { 'X-File-SHA256': checksum },
      );
      setRaw(bytes);
      setPreview(result);
    } catch (problem) {
      setError(provisioningError(locale, problem));
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    if (!preview || !raw || !confirmed) return;
    setBusy(true);
    setError('');
    try {
      const result = await apiCsv<CsvImportCommit>(
        '/admin/csv-imports/' + preview.jobId + '/commit',
        raw,
        {
          'X-File-SHA256': preview.fileChecksum,
          'X-Preview-Token': preview.previewToken,
          'X-Duplicate-Policy': preview.duplicatePolicy,
          'X-Confirm': 'true',
        },
      );
      setCommitted(result);
      setRaw(null);
    } catch (problem) {
      setError(provisioningError(locale, problem));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="identity-screen">
      <IdentityAlert text={error} />
      <section className="panel">
        <div className="panel-heading">
          <h2>{kind === 'users' ? t.imports : p('enrollmentData')}</h2>
          <button
            className="button secondary"
            onClick={() =>
              downloadText(
                'codemark-' + template + '-template.csv',
                template === 'users-v1'
                  ? 'username,email,official_name,institutional_id,role\nstudent.name,student@example.edu,Student Name,S001,student\n'
                  : template === 'users-v2'
                    ? 'username,email,official_name,institutional_id,role,faculty_id,course_id,section_id\nstudent.name,student@example.edu,Student Name,S001,student,,,\n'
                    : 'institutional_id,username,course_id,section_id,status\nS001,student.name,REPLACE_WITH_COURSE_UUID,A1,active\n',
              )
            }
          >
            {t.template}
          </button>
        </div>
        <div className="identity-form">
          {!committed && (
            <label>
              {p('template')}
              <select
                value={template}
                disabled={busy}
                onChange={(event) => {
                  reset();
                  setFile(null);
                  setTemplate(event.target.value);
                }}
              >
                {allowUserImports && (
                  <>
                    <option value="users-v1">{p('usersV1')}</option>
                    <option value="users-v2">{p('usersV2')}</option>
                  </>
                )}
                <option value="enrollments-v1">{p('enrollments')}</option>
              </select>
            </label>
          )}
          <p>{kind === 'users' ? t.importIntro : p('enrollmentHelp')}</p>
          {template === 'users-v2' && <p className="field-help">{p('extendedHelp')}</p>}
          <p className="field-help">{t.previewHelp}</p>
          {!committed && (
            <>
              <label>
                {t.file}
                <input
                  type="file"
                  key={template}
                  accept=".csv,text/csv"
                  disabled={busy}
                  onChange={(event) => {
                    reset();
                    setFile(event.target.files?.[0] || null);
                  }}
                />
              </label>
              <p className="field-help">{t.fileHelp}</p>
              <label>
                {kind === 'users' ? t.duplicatePolicy : p('duplicatePolicy')}
                <select
                  value={policy}
                  disabled={busy}
                  onChange={(event) => {
                    reset();
                    setPolicy(event.target.value as 'upsert' | 'skip');
                  }}
                >
                  <option value="upsert">{kind === 'users' ? t.upsert : p('upsert')}</option>
                  <option value="skip">{kind === 'users' ? t.skip : p('skip')}</option>
                </select>
              </label>
              <button className="button primary" disabled={!file || busy} onClick={previewFile}>
                {busy ? t.loading : t.preview}
              </button>
            </>
          )}
          {preview && (
            <>
              <div className="import-counts">
                {(['totalRows', 'create', 'update', 'skip', 'reject'] as const).map((key) => (
                  <div key={key}>
                    <strong>{preview.summary[key]}</strong>
                    <span>{key === 'totalRows' ? t.rows : t[key]}</span>
                  </div>
                ))}
              </div>
              <div className="checksum-label">
                SHA-256 <code>{preview.fileChecksum}</code>
              </div>
              {!committed && (
                <>
                  <div className="table-scroll preview-table">
                    <table className="identity-table">
                      <thead>
                        <tr>
                          <th>{t.row}</th>
                          <th>{t.action}</th>
                          <th>{t.issues}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((row) => (
                          <tr key={row.rowNumber}>
                            <td>{row.rowNumber}</td>
                            <td>
                              <span
                                className={`state-badge ${row.action === 'reject' ? 'state-suspended' : ''}`}
                              >
                                {t[row.action]}
                              </span>
                            </td>
                            <td>
                              {row.errorCodes.length
                                ? row.errorCodes
                                    .map((code) => provisioningError(locale, new Error(code)))
                                    .join('; ')
                                : t.noIssues}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      disabled={!!preview.summary.reject || busy}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />
                    {t.confirmImport}
                  </label>
                  {kind === 'users' && <div className="service-note">{t.failedHelp}</div>}
                  <button
                    className="button primary"
                    disabled={
                      !!preview.summary.reject ||
                      !confirmed ||
                      busy ||
                      new Date(preview.expiresAt).getTime() <= Date.now()
                    }
                    onClick={commit}
                  >
                    {busy ? t.loading : t.commit}
                  </button>
                </>
              )}
            </>
          )}
          {committed && (
            <div className="import-complete">
              <h2>
                <i className="fa-solid fa-circle-check" aria-hidden="true" /> {t.committed}
              </h2>
              {kind === 'users' && (
                <p>
                  {t.sent}: <strong>{committed.invitationDelivery.sent}</strong> · {t.failed}:{' '}
                  <strong>{committed.invitationDelivery.failed}</strong>
                </p>
              )}
              {committed.invitationDelivery.failed > 0 && <p>{t.failedHelp}</p>}
              <button
                className="button secondary"
                onClick={() => {
                  reset();
                  setFile(null);
                }}
              >
                {t.newImport}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
