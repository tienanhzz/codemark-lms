'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { courseError, translate, type Locale } from '../lib/courseApi';
import { IdentityAlert } from './IdentityShared';
import { Empty, Field } from './CourseShared';

type Profile = {
  profile: {
    profileId: string;
    version: number;
    language: string;
    languageVersion: string;
    compilerImage?: string;
    imageDigest: string;
    allowedLibraries: string[];
    resourceCaps: { wallTimeMs: number; cpuTimeMs: number; memoryBytes: number; maxSourceBytes: number };
    status: 'draft';
  };
  createdAt: string;
  executionAvailable: false;
};

export function RuntimeProfiles({ locale }: { locale: Locale }) {
  const t = translate(locale),
    [items, setItems] = useState<Profile[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function load() {
    setLoading(true);
    try {
      const result = await api<{ items: Profile[]; executionAvailable: false }>('/admin/runtime-profiles');
      setItems(result.items);
      setError('');
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const libraries = String(form.get('allowedLibraries') || '').split(',').map((value) => value.trim()).filter(Boolean);
    const profile = {
      profileId: String(form.get('profileId')).trim(),
      language: form.get('language'), languageVersion: String(form.get('languageVersion')).trim(),
      compilerImage: String(form.get('compilerImage')).trim() || undefined,
      imageDigest: String(form.get('imageDigest')).trim(), allowedLibraries: libraries,
      resourceCaps: {
        wallTimeMs: Number(form.get('wallTimeMs')), cpuTimeMs: Number(form.get('cpuTimeMs')),
        memoryBytes: Number(form.get('memoryBytes')), maxSourceBytes: Number(form.get('maxSourceBytes')),
      },
      sandbox: {
        network: 'disabled', nonRootUser: true, readOnlyRootFilesystem: true,
        dropAllCapabilities: true, ephemeralWorkspace: true, secretMounts: false,
      },
    };
    setBusy(true); setError(''); setNotice('');
    try {
      await api('/admin/runtime-profiles', 'POST', profile);
      setNotice(t('Immutable Draft metadata saved. Test and activation stay disabled.', 'Đã lưu metadata bản nháp bất biến. Kiểm thử và kích hoạt vẫn bị tắt.'));
      formElement.reset();
      await load();
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  }
  return (
    <div className="identity-screen">
      <IdentityAlert text={error} />
      {notice && <IdentityAlert text={notice} success />}
      <section className="panel runtime-profile-boundary">
        <span className="eyebrow">{t('Runtime metadata', 'Metadata môi trường chạy')}</span>
        <h2>{t('Runtime profiles', 'Cấu hình runtime')}</h2>
        <p>{t('Profiles are immutable, sequential Draft records. This LMS does not test or activate a profile and never executes learner code.', 'Cấu hình là các bản nháp tuần tự, bất biến. LMS không kiểm thử/kích hoạt cấu hình và không thực thi mã người học.')}</p>
        <strong>{t('Execution available: No', 'Thực thi: Tắt')}</strong>
      </section>
      <section className="panel course-section">
        <h3>{t('Add Draft metadata', 'Thêm metadata bản nháp')}</h3>
        <form className="course-form" onSubmit={create}>
          <div className="course-form-grid">
            <Field label={t('Stable profile ID', 'ID cấu hình ổn định')}><input name="profileId" required pattern="[a-z][a-z0-9-]{0,127}" maxLength={128} /></Field>
            <Field label={t('Language', 'Ngôn ngữ')}><select name="language"><option value="python">Python</option><option value="java">Java</option><option value="c">C</option><option value="cpp">C++</option></select></Field>
            <Field label={t('Language version', 'Phiên bản ngôn ngữ')}><input name="languageVersion" required maxLength={80} /></Field>
            <Field label={t('Compiler image (optional)', 'Image compiler (không bắt buộc)')}><input name="compilerImage" maxLength={500} /></Field>
          </div>
          <Field label={t('Approved image digest (sha256)', 'Digest image (sha256)')}><input name="imageDigest" required pattern="sha256:[a-f0-9]{64}" maxLength={71} /></Field>
          <Field label={t('Allowlisted libraries (comma separated)', 'Thư viện cho phép (phân cách bằng dấu phẩy)')}><input name="allowedLibraries" maxLength={3000} /></Field>
          <div className="course-form-grid runtime-caps-grid">
            <Field label={t('Wall time cap (ms)', 'Giới hạn thời gian (ms)')}><input name="wallTimeMs" type="number" min="1" defaultValue="1000" required /></Field>
            <Field label={t('CPU time cap (ms)', 'Giới hạn CPU (ms)')}><input name="cpuTimeMs" type="number" min="1" defaultValue="1000" required /></Field>
            <Field label={t('Memory cap (bytes)', 'Giới hạn bộ nhớ (byte)')}><input name="memoryBytes" type="number" min="1" defaultValue="67108864" required /></Field>
            <Field label={t('Source size cap (bytes)', 'Giới hạn kích thước mã (byte)')}><input name="maxSourceBytes" type="number" min="1" defaultValue="65536" required /></Field>
          </div>
          <p className="service-note">{t('Network, root access, writable root filesystem, extra capabilities, and secrets are fixed to the disabled-safe profile.', 'Mạng, quyền root, filesystem có thể ghi, capabilities bổ sung và secret luôn bị khóa theo cấu hình an toàn.')}</p>
          <button className="button primary" disabled={busy}>{busy ? t('Saving…', 'Đang lưu…') : t('Save immutable Draft', 'Lưu bản nháp bất biến')}</button>
        </form>
      </section>
      <section className="panel course-section">
        <h3>{t('Saved profile versions', 'Phiên bản cấu hình đã lưu')}</h3>
        {loading ? <p role="status">{t('Loading…', 'Đang tải…')}</p> : !items.length ? <Empty locale={locale} /> : <div className="template-versions">{items.map((record) => <article key={`${record.profile.profileId}-${record.profile.version}`}><div><strong>{record.profile.profileId} · v{record.profile.version}</strong><p>{record.profile.language} {record.profile.languageVersion} · {record.profile.status}</p><small>{record.profile.imageDigest}</small><p>{t('Execution unavailable', 'Không hỗ trợ thực thi')}</p></div></article>)}</div>}
      </section>
    </div>
  );
}
