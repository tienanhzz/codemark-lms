'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { courseError, courseWrite, translate, type Course, type CourseResource, type GradeScheme, type Locale } from '../lib/courseApi';
import { IdentityAlert, Modal } from './IdentityShared';
import { Empty, Field, FormActions } from './CourseShared';

export function CourseAcademicPanel({ course, locale, onChange }: { course: Course; locale: Locale; onChange: () => Promise<void> }) {
  const t = translate(locale);
  const [items, setItems] = useState<CourseResource[]>([]);
  const [scheme, setScheme] = useState<GradeScheme | null>(null);
  const [schemes, setSchemes] = useState<GradeScheme[]>([]);
  const [draft, setDraft] = useState<CourseResource[]>([]);
  const [schemeDraft, setSchemeDraft] = useState(false);
  const [publishId, setPublishId] = useState<string | null>(null);
  const [components, setComponents] = useState<GradeScheme['components']>([
    { componentId: 'midterm', name: 'Midterm', weight: 40, description: '' },
    { componentId: 'final', name: 'Final exam', weight: 60, description: '' },
  ]);
  const [bands, setBands] = useState<GradeScheme['bands']>([
    { minimumScore: 0, label: 'F' }, { minimumScore: 50, label: 'D' },
    { minimumScore: 60, label: 'C' }, { minimumScore: 70, label: 'B' },
    { minimumScore: 80, label: 'A' }, { minimumScore: 100, label: 'A+' },
  ]);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const writable = course.permissions.includes('content.author') && !['completed', 'archived'].includes(course.status);

  async function load() {
    setLoading(true);
    try {
      const [resources, grade, gradeVersions] = await Promise.all([
        api<{ items: CourseResource[] }>(`/courses/${course.id}/resources`),
        api<GradeScheme>(`/courses/${course.id}/grade-scheme`),
        api<{ items: GradeScheme[] }>(`/courses/${course.id}/grade-schemes`),
      ]);
      setItems(resources.items);
      setScheme(grade);
      setSchemes(gradeVersions.items);
      setError('');
    } catch (problem) {
      setError(courseError(problem, locale));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, [course.id, course.revision]);

  function update(index: number, patch: Partial<CourseResource>) {
    setDraft((current) => current.map((item, i) => i === index ? { ...item, ...patch, position: i } : item));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await courseWrite(course, '/resources', 'PUT', { items: draft.map((item, position) => ({ ...item, position })) });
      setEditing(false);
      await onChange();
      await load();
    } catch (problem) {
      setError(courseError(problem, locale));
    } finally { setBusy(false); }
  }

  async function saveScheme(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await courseWrite(course, '/grade-schemes', 'POST', { components, bands });
      setSchemeDraft(false);
      await onChange();
      await load();
    } catch (problem) {
      setError(courseError(problem, locale));
    } finally { setBusy(false); }
  }

  async function publishScheme() {
    if (!publishId) return;
    setBusy(true);
    setError('');
    try {
      await courseWrite(course, `/grade-schemes/${publishId}/publish`, 'POST', undefined);
      setPublishId(null);
      await onChange();
      await load();
    } catch (problem) {
      setError(courseError(problem, locale));
    } finally { setBusy(false); }
  }

  return (
    <div className="course-academic-stack">
      <section className="panel course-section">
        <div className="panel-heading">
          <h2>{t('Learning resources & useful links', 'Tài nguyên học tập & liên kết hữu ích')}</h2>
          {writable && <button className="button secondary" onClick={() => { setDraft(items.map((item) => ({ ...item }))); setEditing(true); }}>{t('Edit resources', 'Sửa tài nguyên')}</button>}
        </div>
        {loading ? <p role="status">{t('Loading…', 'Đang tải…')}</p> : !items.length ? <Empty locale={locale} /> : (
          <div className="course-resource-grid">
            {items.map((item) => <article className="course-resource-card" key={item.id || `${item.kind}-${item.position}`}>
              <small>{t(({ learningResource: 'Learning resource', usefulUrl: 'Useful link', software: 'Required software / IDE' })[item.kind], ({ learningResource: 'Tài nguyên học tập', usefulUrl: 'Liên kết hữu ích', software: 'Phần mềm / IDE bắt buộc' })[item.kind])}</small>
              <h3>{item.title}</h3>
              {item.note && <p>{item.note}</p>}
              {item.coverage && <p><strong>{t('Coverage', 'Nội dung bao quát')}: </strong>{item.coverage}</p>}
              {item.url && <a className="text-link" href={item.url} target="_blank" rel="noopener noreferrer">{t('Open resource', 'Mở tài nguyên')}</a>}
            </article>)}
          </div>
        )}
      </section>
      <section className="panel course-section">
        <div className="panel-heading"><h2>{t('Assessment scheme', 'Cơ cấu đánh giá')}</h2>
          <div className="course-row-actions">
            {scheme?.active && <span>{t('Version', 'Phiên bản')} {scheme.version}</span>}
            {writable && <button type="button" className="button secondary" onClick={() => {
              setComponents([{ componentId: 'midterm', name: 'Midterm', weight: 40, description: '' }, { componentId: 'final', name: 'Final exam', weight: 60, description: '' }]);
              setBands([{ minimumScore: 0, label: 'F' }, { minimumScore: 60, label: 'C' }, { minimumScore: 80, label: 'A' }, { minimumScore: 100, label: 'A+' }]);
              setSchemeDraft(true);
            }}>{t('New grade scheme draft', 'Tạo bản nháp cơ cấu đánh giá')}</button>}
          </div>
        </div>
        {scheme?.active ? <>
          <div className="table-scroll"><table className="identity-table"><thead><tr><th>{t('Assessment', 'Hạng mục')}</th><th>{t('Weight', 'Trọng số')}</th><th>{t('Determination of final grade', 'Cách tính điểm cuối kỳ')}</th></tr></thead>
            <tbody>{scheme.components.map((component) => <tr key={component.componentId}><td>{component.name}</td><td>{component.weight}%</td><td>{component.description || '—'}</td></tr>)}
              <tr><th>{t('Total', 'Tổng')}</th><th>{scheme.components.reduce((sum, item) => sum + item.weight, 0)}%</th><td>{t('Weighted sum of component scores', 'Tổng điểm các hạng mục theo trọng số')}</td></tr>
            </tbody></table></div>
          <h3>{t('Grade conversion scale', 'Thang quy đổi điểm')}</h3>
          <ul className="grade-band-list">{[...scheme.bands].sort((a, b) => b.minimumScore - a.minimumScore).map((band) => <li key={band.minimumScore}>{band.minimumScore}% — {band.label}</li>)}</ul>
        </> : <p className="service-note">{t('No grade scheme has been published for this course.', 'Khóa học chưa có cơ cấu đánh giá được công bố.')}</p>}
        {schemes.some((item) => !item.active) && <div className="course-scheme-drafts"><h3>{t('Draft versions', 'Các phiên bản nháp')}</h3>{schemes.filter((item) => !item.active).map((item) => <div className="course-scheme-draft" key={item.id}>
          <span>{t('Version', 'Phiên bản')} {item.version} · {item.components.reduce((sum, part) => sum + part.weight, 0)}%</span>
          {writable && <button type="button" className="button secondary" disabled={Math.abs(item.components.reduce((sum, part) => sum + part.weight, 0) - 100) > 0.001} onClick={() => setPublishId(item.id)}>{t('Publish', 'Công bố')}</button>}
        </div>)}</div>}
      </section>
      {editing && <Modal title={t('Edit learning resources', 'Chỉnh sửa tài nguyên học tập')} onClose={() => setEditing(false)} locked={busy}>
        <form className="course-form" onSubmit={save}>
          <IdentityAlert text={error} />
          <p className="service-note">{t('Links must use HTTPS. Save publishes the current list for this course.', 'Liên kết phải dùng HTTPS. Lưu sẽ cập nhật danh sách tài nguyên của khóa học.')}</p>
          {draft.map((item, index) => <fieldset className="course-entry-editor" key={index}>
            <legend>{t('Resource', 'Tài nguyên')} {index + 1}</legend>
            <Field label={t('Type', 'Loại')}><select value={item.kind} onChange={(event) => update(index, { kind: event.target.value as CourseResource['kind'] })}>
              <option value="learningResource">{t('Learning resource', 'Tài nguyên học tập')}</option><option value="usefulUrl">{t('Useful link', 'Liên kết hữu ích')}</option><option value="software">{t('Required software / IDE', 'Phần mềm / IDE bắt buộc')}</option>
            </select></Field>
            <Field label={t('Title', 'Tiêu đề')}><input required maxLength={240} value={item.title} onChange={(event) => update(index, { title: event.target.value })} /></Field>
            <Field label={t('Note', 'Ghi chú')}><textarea maxLength={2000} value={item.note} onChange={(event) => update(index, { note: event.target.value })} /></Field>
            <Field label={t('Coverage', 'Nội dung bao quát')}><input maxLength={1000} value={item.coverage} onChange={(event) => update(index, { coverage: event.target.value })} /></Field>
            <Field label={t('HTTPS URL', 'URL HTTPS')}><input type="url" pattern="https://.*" maxLength={2000} value={item.url || ''} onChange={(event) => update(index, { url: event.target.value || null })} required={item.kind === 'usefulUrl'} /></Field>
            <button type="button" className="button secondary" onClick={() => setDraft((current) => current.filter((_, i) => i !== index).map((value, position) => ({ ...value, position })))}>{t('Remove resource', 'Xóa tài nguyên')}</button>
          </fieldset>)}
          <button type="button" className="button secondary" disabled={draft.length >= 200} onClick={() => setDraft((current) => [...current, { kind: 'learningResource', title: '', note: '', coverage: '', url: null, position: current.length }])}>{t('Add resource', 'Thêm tài nguyên')}</button>
          <FormActions locale={locale} busy={busy} onClose={() => setEditing(false)} />
        </form>
      </Modal>}
      {schemeDraft && <Modal title={t('Grade scheme draft', 'Bản nháp cơ cấu đánh giá')} onClose={() => setSchemeDraft(false)} locked={busy}>
        <form className="course-form" onSubmit={saveScheme}>
          <IdentityAlert text={error} />
          <p className="service-note">{t('Published weights must total 100%. Grade scheme versions become immutable after publishing.', 'Tổng trọng số phải bằng 100% trước khi công bố. Phiên bản không thể sửa sau khi công bố.')}</p>
          <h3>{t('Weighted components', 'Các hạng mục có trọng số')}</h3>
          {components.map((part, index) => <fieldset className="course-entry-editor" key={index}>
            <legend>{t('Component', 'Hạng mục')} {index + 1}</legend>
            <div className="course-form-grid">
              <Field label={t('Stable ID', 'ID ổn định')}><input required pattern="[a-z0-9][a-z0-9._-]{0,63}" value={part.componentId} onChange={(event) => setComponents((current) => current.map((item, i) => i === index ? { ...item, componentId: event.target.value } : item))} /></Field>
              <Field label={t('Name', 'Tên')}><input required maxLength={240} value={part.name} onChange={(event) => setComponents((current) => current.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /></Field>
              <Field label={t('Weight (%)', 'Trọng số (%)')}><input type="number" min={0} max={100} step="0.01" value={part.weight} onChange={(event) => setComponents((current) => current.map((item, i) => i === index ? { ...item, weight: Number(event.target.value) } : item))} /></Field>
            </div>
            <Field label={t('Determination of final grade', 'Cách tính điểm cuối kỳ')}><input maxLength={1000} value={part.description} onChange={(event) => setComponents((current) => current.map((item, i) => i === index ? { ...item, description: event.target.value } : item))} /></Field>
            <button type="button" className="button secondary" onClick={() => setComponents((current) => current.filter((_, i) => i !== index))}>{t('Remove component', 'Xóa hạng mục')}</button>
          </fieldset>)}
          <p><strong>{t('Total weight', 'Tổng trọng số')}: {components.reduce((sum, item) => sum + item.weight, 0)}%</strong></p>
          <button type="button" className="button secondary" disabled={components.length >= 50} onClick={() => setComponents((current) => [...current, { componentId: `component-${current.length + 1}`, name: '', weight: 0, description: '' }])}>{t('Add component', 'Thêm hạng mục')}</button>
          <h3>{t('Grade conversion scale', 'Thang quy đổi điểm')}</h3>
          {bands.map((band, index) => <div className="course-form-grid" key={index}>
            <Field label={t('Minimum score (%)', 'Điểm tối thiểu (%)')}><input type="number" min={0} max={100} step="0.01" value={band.minimumScore} onChange={(event) => setBands((current) => current.map((item, i) => i === index ? { ...item, minimumScore: Number(event.target.value) } : item))} /></Field>
            <Field label={t('Grade label', 'Mức điểm')}><input required maxLength={24} value={band.label} onChange={(event) => setBands((current) => current.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} /></Field>
            <button type="button" className="button secondary" disabled={bands.length <= 2} onClick={() => setBands((current) => current.filter((_, i) => i !== index))}>{t('Remove band', 'Xóa mức')}</button>
          </div>)}
          <button type="button" className="button secondary" disabled={bands.length >= 20} onClick={() => setBands((current) => [...current, { minimumScore: 0, label: '' }])}>{t('Add grade band', 'Thêm mức quy đổi')}</button>
          <FormActions locale={locale} busy={busy} onClose={() => setSchemeDraft(false)} />
        </form>
      </Modal>}
      {publishId && <Modal presentation="dialog" title={t('Publish grade scheme', 'Công bố cơ cấu đánh giá')} locked={busy} onClose={() => setPublishId(null)}>
        <IdentityAlert text={error} />
        <p>{t('This immutable version becomes the course grade scheme. Verify the weights total 100%.', 'Phiên bản bất biến này sẽ được áp dụng cho khóa học. Kiểm tra tổng trọng số bằng 100%.')}</p>
        <div className="modal-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={() => setPublishId(null)}>{t('Cancel', 'Hủy')}</button>
          <button type="button" className="button primary" disabled={busy} onClick={() => void publishScheme()}>{busy ? t('Saving…', 'Đang lưu…') : t('Publish', 'Công bố')}</button>
        </div>
      </Modal>}
    </div>
  );
}
