'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { courseError, translate, type Locale } from '../lib/courseApi';
import { IdentityAlert, Modal } from './IdentityShared';
import { Empty, Field, FormActions } from './CourseShared';
import './TaxonomyManager.css';

type Scope = 'content' | 'question';
type Kind = 'category' | 'tag';
type Node = {
  id: string;
  names: Record<string, string>;
  parentId: string | null;
  status: 'active' | 'retired';
  sortOrder: number;
  selectable?: boolean;
  applicability?: string[];
  usageCount?: number;
};
type Catalog = {
  scope: Scope;
  catalogVersion: number;
  categories: Node[];
  tags: Node[];
  redirects?: { kind: Kind; sourceId: string; targetId: string }[];
};

const questionTypeNames: Record<string, [string, string]> = {
  multipleChoice: ['Multiple choice', 'Trắc nghiệm một đáp án'],
  multipleSelect: ['Multiple select', 'Trắc nghiệm nhiều đáp án'],
  shortAnswer: ['Short answer', 'Trả lời ngắn'],
  sentenceRewriting: ['Sentence rewriting', 'Viết lại câu'],
  fillInTheBlank: ['Fill in the blank', 'Điền vào chỗ trống'],
  matching: ['Matching', 'Ghép đôi'],
  ordering: ['Ordering', 'Sắp xếp'],
  trueFalseNotGiven: ['True / false / not given', 'Đúng / sai / không có thông tin'],
  writing: ['Writing', 'Viết'],
  code: ['Code', 'Lập trình'],
  readingSet: ['Reading set', 'Bộ câu hỏi đọc'],
  listeningSet: ['Listening set', 'Bộ câu hỏi nghe'],
};
const normalizeSearch = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

function hierarchy(items: Node[], query: string) {
  const byId = new Map(items.map((node) => [node.id, node]));
  const ancestors = (node: Node) => {
    const result: Node[] = [],
      seen = new Set([node.id]);
    let parent = node.parentId ? byId.get(node.parentId) : undefined;
    while (parent && !seen.has(parent.id)) {
      result.unshift(parent);
      seen.add(parent.id);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return result;
  };
  const search = normalizeSearch(query.trim());
  const matches = new Set(
    items
      .filter(
        (node) =>
          !search ||
          normalizeSearch([node.id, ...Object.values(node.names)].join(' ')).includes(search),
      )
      .map((node) => node.id),
  );
  const visible = new Set(matches);
  items
    .filter((node) => matches.has(node.id))
    .forEach((node) => ancestors(node).forEach((parent) => visible.add(parent.id)));
  const children = new Map<string | null, Node[]>();
  items.forEach((node) => {
    const parent = node.parentId && byId.has(node.parentId) ? node.parentId : null;
    children.set(parent, [...(children.get(parent) || []), node]);
  });
  const result: { item: Node; parents: Node[]; context: boolean }[] = [],
    visited = new Set<string>();
  const visit = (node: Node) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    if (visible.has(node.id))
      result.push({ item: node, parents: ancestors(node), context: !matches.has(node.id) });
    (children.get(node.id) || [])
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
      .forEach(visit);
  };
  (children.get(null) || [])
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .forEach(visit);
  items.forEach(visit);
  return result;
}

export function TaxonomyManager({ locale, roles }: { locale: Locale; roles: string[] }) {
  const t = translate(locale),
    [scope, setScope] = useState<Scope>('question'),
    [query, setQuery] = useState(''),
    [catalog, setCatalog] = useState<Catalog | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [editor, setEditor] = useState<{ kind: Kind; item?: Node } | null>(null),
    [mergeSource, setMergeSource] = useState<{ kind: Kind; item: Node } | null>(null),
    [confirmSeed, setConfirmSeed] = useState(false);
  const requestSequence = useRef(0);
  const admin = roles.includes('admin');
  const base = scope === 'question' ? '/admin/question-taxonomy' : '/admin/taxonomy';

  async function load(nextScope = scope) {
    const sequence = ++requestSequence.current;
    setLoading(true);
    try {
      const path = nextScope === 'question' ? '/question-taxonomy' : '/taxonomy';
      const result = await api<Catalog>(path + '?includeRetired=true');
      if (sequence !== requestSequence.current) return;
      setCatalog(result);
      setError('');
    } catch (problem) {
      if (sequence === requestSequence.current) setError(courseError(problem, locale));
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }
  useEffect(() => {
    setCatalog(null);
    setEditor(null);
    setMergeSource(null);
    setConfirmSeed(false);
    setNotice('');
    void load(scope);
    return () => {
      requestSequence.current++;
    };
  }, [scope]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const form = new FormData(event.currentTarget);
    const names = Object.fromEntries(
      [
        ['en', String(form.get('en') || '').trim()],
        ['vi', String(form.get('vi') || '').trim()],
      ].filter(([, value]) => value),
    );
    const body = {
      ...(editor.item ? {} : { id: String(form.get('id')).trim() }),
      names,
      parentId: String(form.get('parentId') || '') || null,
      sortOrder: Number(form.get('sortOrder') || 0),
      ...(editor.kind === 'tag'
        ? {
            selectable: form.get('selectable') === 'on',
            applicability: String(form.get('applicability') || '')
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
          }
        : {}),
    };
    setBusy(true);
    setError('');
    try {
      const path = `${base}/${editor.kind === 'category' ? 'categories' : 'tags'}`;
      await api(
        path + (editor.item ? '/' + editor.item.id : ''),
        editor.item ? 'PATCH' : 'POST',
        body,
      );
      setEditor(null);
      setNotice(
        t('Catalog saved. Changes are audited.', 'Đã lưu danh mục. Thay đổi đã được ghi audit.'),
      );
      await load();
    } catch (problem) {
      setError(courseError(problem, locale));
    } finally {
      setBusy(false);
    }
  }

  async function retire(kind: Kind, item: Node) {
    if (item.status === 'retired') return;
    setBusy(true);
    setError('');
    try {
      const path = `${base}/${kind === 'category' ? 'categories' : 'tags'}/${item.id}`;
      await api(path, 'PATCH', { status: 'retired' });
      setNotice(
        t(
          'Entry retired; its ID and references remain preserved.',
          'Đã ngừng mục; ID và tham chiếu vẫn được giữ nguyên.',
        ),
      );
      await load();
    } catch (problem) {
      setError(courseError(problem, locale));
    } finally {
      setBusy(false);
    }
  }

  async function merge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mergeSource) return;
    const targetId = String(new FormData(event.currentTarget).get('targetId') || '');
    setBusy(true);
    setError('');
    try {
      await api(
        `${base}/${mergeSource.kind === 'category' ? 'categories' : 'tags'}/${mergeSource.item.id}/merge`,
        'POST',
        { targetId },
      );
      setMergeSource(null);
      setNotice(
        t(
          'Entry merged. Historical IDs now resolve through an audited redirect.',
          'Đã gộp mục. ID lịch sử được chuyển hướng và ghi audit.',
        ),
      );
      await load();
    } catch (problem) {
      setError(courseError(problem, locale));
    } finally {
      setBusy(false);
    }
  }

  async function importStarterCatalog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!catalog) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/learning-taxonomy.example.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('connection_error');
      const source = (await response.json()) as {
        categories: {
          id: string;
          name: Record<string, string>;
          parentId?: string | null;
          sortOrder?: number;
          status?: 'active';
        }[];
        tags: {
          id: string;
          name: Record<string, string>;
          parentId?: string | null;
          sortOrder?: number;
          status?: 'active';
          appliesTo: ('lesson' | 'question')[];
          selectable?: boolean;
        }[];
      };
      const result = await api<{ categories: number; tags: number }>(
        '/admin/taxonomy/seed',
        'POST',
        {
          expectedCatalogVersion: catalog.catalogVersion,
          categories: source.categories,
          tags: source.tags,
        },
      );
      setConfirmSeed(false);
      setNotice(
        t(
          `Imported ${result.categories} categories and ${result.tags} tags.`,
          `Đã nhập ${result.categories} danh mục và ${result.tags} thẻ.`,
        ),
      );
      await load();
    } catch (problem) {
      setError(courseError(problem, locale));
    } finally {
      setBusy(false);
    }
  }

  if (!admin) {
    return (
      <div className="alert alert-error" role="alert">
        {t('Admin access is required.', 'Cần quyền Admin để truy cập.')}
      </div>
    );
  }

  const label = (node: Node) => node.names[locale] || node.names.en || node.id;
  const rows = (kind: Kind, items: Node[]) => {
    const visible = hierarchy(items, query);
    return (
      <section className="panel taxonomy-panel">
        <div className="panel-heading">
          <div>
            <h2>{kind === 'category' ? t('Categories', 'Danh mục') : t('Tags', 'Thẻ')}</h2>
            <p>
              {kind === 'category'
                ? t(
                    'Stable hierarchical IDs; parents must stay active.',
                    'ID phân cấp ổn định; danh mục cha phải còn hoạt động.',
                  )
                : t(
                    'Retirement preserves references. Parent is navigational only.',
                    'Ngừng sử dụng vẫn giữ tham chiếu. Danh mục cha chỉ để điều hướng.',
                  )}
            </p>
          </div>
          <button className="button primary" disabled={busy} onClick={() => setEditor({ kind })}>
            {t('Add', 'Thêm')} {kind === 'category' ? t('category', 'danh mục') : t('tag', 'thẻ')}
          </button>
        </div>
        <p className="taxonomy-result-count">
          {t(
            `${visible.length} of ${items.length} shown`,
            `Hiển thị ${visible.length} / ${items.length}`,
          )}
          {query.trim() &&
            t(' · Matching entries and their ancestors', ' · Mục khớp và các mục cha')}
        </p>
        {visible.length === 0 ? (
          <Empty locale={locale} />
        ) : (
          <div className="table-scroll">
            <table className="identity-table">
              <thead>
                <tr>
                  <th>{t('Entry', 'Mục')}</th>
                  <th>{t('Parent', 'Mục cha')}</th>
                  <th>{t('Status', 'Trạng thái')}</th>
                  {kind === 'tag' && (
                    <>
                      <th>{t('Selection', 'Chọn')}</th>
                      <th>{t('Applies to', 'Áp dụng cho')}</th>
                    </>
                  )}
                  <th>{t('Usage', 'Lượt dùng')}</th>
                  <th>{t('Actions', 'Thao tác')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ item, parents, context }) => (
                  <tr
                    key={item.id}
                    id={`taxonomy-${kind}-${item.id}`}
                    className={context ? 'taxonomy-context-row' : undefined}
                  >
                    <td>
                      <div
                        className="taxonomy-entry"
                        style={{ paddingInlineStart: `${parents.length * 20}px` }}
                      >
                        <strong>
                          {parents.length > 0 && (
                            <span aria-hidden="true" className="taxonomy-branch">
                              ↳{' '}
                            </span>
                          )}
                          {label(item)}
                        </strong>
                        <small>
                          {item.id} · {item.names[locale === 'en' ? 'vi' : 'en'] || ''}
                        </small>
                        {context && (
                          <small className="taxonomy-context-label">
                            {t('Parent context', 'Mục cha liên quan')}
                          </small>
                        )}
                      </div>
                    </td>
                    <td>
                      {parents.length ? (
                        <nav
                          className="taxonomy-breadcrumb"
                          aria-label={t('Parent path', 'Đường dẫn mục cha')}
                        >
                          {parents.map((parent, index) => (
                            <span key={parent.id}>
                              {index > 0 && <span aria-hidden="true"> / </span>}
                              <a href={`#taxonomy-${kind}-${parent.id}`}>{label(parent)}</a>
                            </span>
                          ))}
                        </nav>
                      ) : (
                        item.parentId || '—'
                      )}
                    </td>
                    <td>
                      <span className="state-badge">
                        {item.status === 'active'
                          ? t('Active', 'Đang hoạt động')
                          : t('Retired', 'Đã ngừng')}
                      </span>
                    </td>
                    {kind === 'tag' && (
                      <td>
                        {item.selectable !== false
                          ? t('Selectable', 'Được chọn')
                          : t('Navigation only', 'Chỉ điều hướng')}
                      </td>
                    )}
                    {kind === 'tag' && (
                      <td>
                        {item.applicability?.length
                          ? item.applicability
                              .map((id) =>
                                questionTypeNames[id] ? t(...questionTypeNames[id]) : id,
                              )
                              .join(', ')
                          : scope === 'question'
                            ? t('All question types', 'Mọi loại câu hỏi')
                            : t('All lessons', 'Mọi bài học')}
                      </td>
                    )}
                    <td>{item.usageCount ?? '—'}</td>
                    <td>
                      <div className="taxonomy-actions">
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={() => setEditor({ kind, item })}
                        >
                          {t('Edit', 'Sửa')}
                        </button>
                        {item.status === 'active' && (
                          <button
                            className="button secondary"
                            disabled={busy}
                            onClick={() => void retire(kind, item)}
                          >
                            {t('Retire', 'Ngừng')}
                          </button>
                        )}
                        {item.status === 'active' && (
                          <button
                            className="button secondary"
                            disabled={busy}
                            onClick={() => setMergeSource({ kind, item })}
                          >
                            {t('Merge', 'Gộp')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="identity-screen taxonomy-manager">
      <IdentityAlert text={error} />
      {notice && <IdentityAlert text={notice} success />}
      <section className="panel taxonomy-intro">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">
              {t('Live catalog', 'Danh mục đang hoạt động')} · v{catalog?.catalogVersion ?? '—'}
            </span>
            <h2>{t('Taxonomy management', 'Quản lý phân loại')}</h2>
            <p>
              {t(
                'Content and question trees are stored separately. Retired IDs remain available for historical references.',
                'Cây nội dung và cây câu hỏi được lưu riêng. ID đã ngừng vẫn được giữ cho các tham chiếu lịch sử.',
              )}
            </p>
          </div>
          {catalog && catalog.categories.length === 0 && catalog.tags.length === 0 && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setConfirmSeed(true)}
            >
              {t('Import starter catalog', 'Nhập danh mục mẫu')}
            </button>
          )}
        </div>
        <div className="preview-toggle" aria-label={t('Taxonomy scope', 'Phạm vi phân loại')}>
          <button
            aria-pressed={scope === 'question'}
            disabled={busy}
            onClick={() => setScope('question')}
          >
            {t('Question taxonomy', 'Phân loại câu hỏi')}
          </button>
          <button
            aria-pressed={scope === 'content'}
            disabled={busy}
            onClick={() => setScope('content')}
          >
            {t('Lesson taxonomy', 'Phân loại bài học')}
          </button>
        </div>
        {catalog && catalog.scope === scope && (
          <p className="taxonomy-total">
            {t(
              `${catalog.categories.length} categories · ${catalog.tags.length} tags`,
              `${catalog.categories.length} danh mục · ${catalog.tags.length} thẻ`,
            )}
          </p>
        )}
        <label className="taxonomy-search">
          <span>{t('Search taxonomy', 'Tìm phân loại')}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(
              'English, Vietnamese, or stable ID',
              'Tên tiếng Anh, tiếng Việt hoặc ID',
            )}
          />
        </label>
        <p className="taxonomy-help">
          {t(
            'Tag hierarchy is for navigation. Selecting a parent does not select its children.',
            'Cây thẻ chỉ dùng để điều hướng. Chọn mục cha không tự động chọn các thẻ con.',
          )}
        </p>
      </section>
      {loading ? (
        <p role="status">{t('Loading catalog…', 'Đang tải danh mục…')}</p>
      ) : (
        catalog && (
          <>
            {rows('category', catalog.categories)}
            {rows('tag', catalog.tags)}
          </>
        )
      )}
      {editor && catalog && (
        <Modal
          title={t(
            editor.item ? 'Edit taxonomy entry' : 'Create taxonomy entry',
            editor.item ? 'Sửa mục phân loại' : 'Tạo mục phân loại',
          )}
          onClose={() => setEditor(null)}
          locked={busy}
        >
          <form className="course-form" onSubmit={save}>
            {!editor.item && (
              <Field label={t('Stable ID', 'ID ổn định')}>
                <input name="id" required maxLength={128} pattern="[a-z][a-z0-9-]{0,127}" />
              </Field>
            )}
            <div className="course-form-grid">
              <Field label={t('English name', 'Tên tiếng Anh')}>
                <input
                  name="en"
                  required
                  maxLength={160}
                  defaultValue={editor.item?.names.en || ''}
                />
              </Field>
              <Field label={t('Vietnamese name', 'Tên tiếng Việt')}>
                <input name="vi" maxLength={160} defaultValue={editor.item?.names.vi || ''} />
              </Field>
            </div>
            <div className="course-form-grid">
              <Field label={t('Parent entry', 'Mục cha')}>
                <select name="parentId" defaultValue={editor.item?.parentId || ''}>
                  <option value="">{t('No parent', 'Không có mục cha')}</option>
                  {(editor.kind === 'category' ? catalog.categories : catalog.tags)
                    .filter((node) => node.status === 'active' && node.id !== editor.item?.id)
                    .map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.names[locale] || node.id}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label={t('Sort order', 'Thứ tự')}>
                <input
                  name="sortOrder"
                  type="number"
                  min="0"
                  max="100000"
                  defaultValue={editor.item?.sortOrder ?? 0}
                />
              </Field>
            </div>
            {editor.kind === 'tag' && (
              <>
                <Field
                  label={t(
                    'Applicability IDs (comma separated)',
                    'ID phạm vi áp dụng (phân cách bằng dấu phẩy)',
                  )}
                >
                  <input
                    name="applicability"
                    maxLength={500}
                    defaultValue={editor.item?.applicability?.join(', ') || ''}
                  />
                </Field>
                <label className="check-field">
                  <input
                    type="checkbox"
                    name="selectable"
                    defaultChecked={editor.item?.selectable ?? true}
                  />
                  {t('Selectable for tagging', 'Cho phép chọn làm thẻ')}
                </label>
              </>
            )}
            <FormActions locale={locale} busy={busy} onClose={() => setEditor(null)} />
          </form>
        </Modal>
      )}
      {mergeSource && catalog && (
        <Modal
          presentation="dialog"
          title={t('Merge taxonomy entry', 'Gộp mục phân loại')}
          onClose={() => {
            if (!busy) setMergeSource(null);
          }}
          locked={busy}
        >
          <form className="course-form" onSubmit={merge}>
            <p className="service-note">
              {t(
                `Merge ${mergeSource.item.id} into another active ${mergeSource.kind}. Historical references stay intact; the source ID becomes a redirect.`,
                `Gộp ${mergeSource.item.id} vào ${mergeSource.kind === 'category' ? 'danh mục' : 'thẻ'} khác đang hoạt động. Tham chiếu lịch sử được giữ; ID nguồn trở thành chuyển hướng.`,
              )}
            </p>
            <Field label={t('Surviving entry', 'Mục được giữ lại')}>
              <select name="targetId" required defaultValue="">
                <option value="" disabled>
                  {t('Select target', 'Chọn mục đích')}
                </option>
                {(mergeSource.kind === 'category' ? catalog.categories : catalog.tags)
                  .filter((node) => node.status === 'active' && node.id !== mergeSource.item.id)
                  .map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.names[locale] || node.id}
                    </option>
                  ))}
              </select>
            </Field>
            <FormActions locale={locale} busy={busy} onClose={() => setMergeSource(null)} />
          </form>
        </Modal>
      )}
      {confirmSeed && catalog && (
        <Modal
          presentation="dialog"
          title={t('Import the canonical starter catalog?', 'Nhập danh mục mẫu chuẩn?')}
          onClose={() => {
            if (!busy) setConfirmSeed(false);
          }}
          locked={busy}
        >
          <form className="course-form" onSubmit={importStarterCatalog}>
            <p className="service-note">
              {t(
                'This one-time Admin import adds the bundled six-category, 67-tag catalog to both lesson and question trees. It only works while both trees are empty and the catalog version still matches.',
                'Lần nhập một lần này thêm danh mục đóng gói gồm 6 danh mục, 67 thẻ vào cả cây bài học và câu hỏi. Chỉ dùng được khi hai cây còn trống và phiên bản danh mục vẫn khớp.',
              )}
            </p>
            <FormActions locale={locale} busy={busy} onClose={() => setConfirmSeed(false)} />
          </form>
        </Modal>
      )}
    </div>
  );
}
