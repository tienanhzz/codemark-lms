'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import {
  courseError,
  courseWrite,
  translate,
  type Course,
  type Locale,
  type Override,
  type Rule,
  type Rules,
  type Template,
} from '../lib/courseApi';
import { Modal, IdentityAlert } from './IdentityShared';
import { Empty, Field, FormActions } from './CourseShared';

const categories = [
  'attendance',
  'assignmentSubmission',
  'practice',
  'assessment',
  'classroomConduct',
  'communication',
  'other',
];
const categoryNames: Record<string, [string, string]> = {
  attendance: ['Attendance', 'Điểm danh'],
  assignmentSubmission: ['Submissions', 'Nộp bài'],
  practice: ['Practice', 'Luyện tập'],
  assessment: ['Assessment', 'Kiểm tra'],
  classroomConduct: ['Classroom conduct', 'Ứng xử lớp học'],
  communication: ['Communication', 'Trao đổi'],
  other: ['Other', 'Khác'],
};
const newRule = (index: number): Rule => ({
  ruleId: '',
  title: '',
  body: '',
  category: 'other',
  position: index,
});
function RuleFields({
  rules,
  onChange,
  locale,
}: {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  locale: Locale;
}) {
  const t = translate(locale);
  const edit = (index: number, patch: Partial<Rule>) =>
    onChange(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  return (
    <>
      {rules.map((rule, index) => (
        <fieldset key={index} className="course-entry-editor">
          <legend>
            {t('Rule', 'Nội quy')} {index + 1}
          </legend>
          <div className="course-form-grid">
            <Field label={t('Stable rule ID', 'ID nội quy ổn định')}>
              <input
                required
                maxLength={64}
                pattern="[a-z0-9][a-z0-9._-]*"
                value={rule.ruleId}
                onChange={(e) => edit(index, { ruleId: e.target.value })}
              />
            </Field>
            <Field label={t('Category', 'Nhóm')}>
              <select
                value={rule.category}
                onChange={(e) => edit(index, { category: e.target.value })}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {categoryNames[c][locale === 'vi' ? 1 : 0]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={t('Title', 'Tiêu đề')}>
            <input
              required
              maxLength={160}
              value={rule.title}
              onChange={(e) => edit(index, { title: e.target.value })}
            />
          </Field>
          <Field label={t('Rule text', 'Nội dung nội quy')}>
            <textarea
              required
              maxLength={5000}
              rows={3}
              value={rule.body}
              onChange={(e) => edit(index, { body: e.target.value })}
            />
          </Field>
          <button
            type="button"
            className="button secondary"
            onClick={() => onChange(rules.filter((_, i) => i !== index))}
          >
            {t('Remove rule', 'Xóa nội quy')}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={rules.length >= 100}
        onClick={() => onChange([...rules, newRule(rules.length)])}
      >
        {t('Add rule', 'Thêm nội quy')}
      </button>
    </>
  );
}
export function CourseRules({
  course,
  locale,
  onChange,
}: {
  course: Course;
  locale: Locale;
  onChange: () => Promise<void>;
}) {
  const t = translate(locale),
    [data, setData] = useState<Rules | null>(null),
    [editing, setEditing] = useState(false),
    [custom, setCustom] = useState<Rule[]>([]),
    [overrides, setOverrides] = useState<Override[]>([]),
    [history, setHistory] = useState<{ version: number; templateVersion: number; publishedAt: string; rules: Rule[] }[]>([]),
    [historyBefore, setHistoryBefore] = useState<number | null>(null),
    [historyLoading, setHistoryLoading] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const editable =
    course.permissions.includes('course.rules.manage') &&
    !['completed', 'archived'].includes(course.status);
  async function load() {
    setLoading(true);
    try {
      const [rules, publications] = await Promise.all([
        api<Rules>(`/courses/${course.id}/rules`),
        api<{ items: { version: number; templateVersion: number; publishedAt: string; rules: Rule[] }[]; nextBefore: number | null }>(`/courses/${course.id}/rules/history`),
      ]);
      setData(rules);
      setHistory(publications.items);
      setHistoryBefore(publications.nextBefore);
      setError('');
    } catch (e) {
      setError(courseError(e, locale));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [course.id, course.revision]);
  async function loadOlderHistory() {
    if (!historyBefore) return;
    setHistoryLoading(true);
    try {
      const page = await api<{ items: { version: number; templateVersion: number; publishedAt: string; rules: Rule[] }[]; nextBefore: number | null }>(
        `/courses/${course.id}/rules/history?before=${historyBefore}`,
      );
      setHistory((current) => [...current, ...page.items]);
      setHistoryBefore(page.nextBefore);
    } catch (problem) {
      setError(courseError(problem, locale));
    } finally {
      setHistoryLoading(false);
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!data) return;
    setBusy(true);
    try {
      await courseWrite(course, '/rules', 'PUT', {
        expectedTemplateVersion: data.templateVersion,
        overrides,
        customRules: custom.map((r, i) => ({ ...r, position: i + data.sharedRules.length })),
      });
      setEditing(false);
      await onChange();
      await load();
    } catch (e) {
      setError(courseError(e, locale));
    } finally {
      setBusy(false);
    }
  }
  function override(rule: Rule, action: string) {
    setOverrides((list) => [
      ...list.filter((r) => r.ruleId !== rule.ruleId),
      ...(action === 'shared'
        ? []
        : action === 'disable'
          ? [{ ruleId: rule.ruleId, action: 'disable' } as Override]
          : [
              {
                ruleId: rule.ruleId,
                action: 'override',
                title: rule.title,
                body: rule.body,
              } as Override,
            ]),
    ]);
  }
  return (
    <section className="panel course-section">
      <IdentityAlert text={error} />
      <div className="panel-heading">
        <div>
          <h2>{t('Course Rules', 'Nội quy khóa học')}</h2>
          <p>
            {t('Shared template version', 'Phiên bản nội quy chung')} {data?.templateVersion || '—'}
          </p>
        </div>
        {editable && Boolean(data?.templateVersion) && (
          <button
            className="button secondary"
            onClick={() => {
              setCustom(data!.customRules.map((r) => ({ ...r })));
              setOverrides(data!.overrides.map((r) => ({ ...r })));
              setEditing(true);
            }}
          >
            {t('Customize rules', 'Tùy chỉnh nội quy')}
          </button>
        )}
      </div>
      {loading ? (
        <p role="status">{t('Loading…', 'Đang tải…')}</p>
      ) : !data?.rules.length ? (
        <Empty locale={locale} />
      ) : (
        <div className="rules-list">
          {data.rules.map((rule) => (
            <article key={rule.ruleId}>
              <span className="eyebrow">
                {categoryNames[rule.category]?.[locale === 'vi' ? 1 : 0]} ·{' '}
                {rule.source === 'shared'
                  ? t('Shared', 'Nội quy chung')
                  : t('Course-specific', 'Riêng khóa học')}
              </span>
              <h3>{rule.title}</h3>
              <p className="plain-text">{rule.body}</p>
            </article>
          ))}
        </div>
      )}
      {!loading && !data?.templateVersion && (
        <p className="service-note">
          {t(
            'An Admin must activate a shared rules template before course customization is available.',
            'Admin cần kích hoạt nội quy chung trước khi khóa học có thể tùy chỉnh.',
          )}
        </p>
      )}
      {!loading && history.length > 0 && (
        <section className="course-rule-history">
          <h3>{t('Published history', 'Lịch sử công bố')}</h3>
          {history.map((publication) => (
            <details key={publication.version}>
              <summary>{t('Version', 'Phiên bản')} {publication.version} · {t('Shared template', 'Nội quy chung')} {publication.templateVersion} · {new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(publication.publishedAt))}</summary>
              <div className="rules-list">{publication.rules.map((rule) => <article key={rule.ruleId}><h4>{rule.title}</h4><p className="plain-text">{rule.body}</p></article>)}</div>
            </details>
          ))}
          {historyBefore && (
            <button type="button" className="button secondary" disabled={historyLoading} onClick={() => void loadOlderHistory()}>
              {historyLoading ? t('Loading…', 'Đang tải…') : t('Load older versions', 'Tải phiên bản cũ hơn')}
            </button>
          )}
        </section>
      )}
      {editing && data && (
        <Modal
          title={t('Customize Course Rules', 'Tùy chỉnh nội quy khóa học')}
          onClose={() => setEditing(false)}
          locked={busy}
        >
          <form className="course-form" onSubmit={save}>
            <IdentityAlert text={error} />
            {data.sharedRules.map((rule) => {
              const current = overrides.find((o) => o.ruleId === rule.ruleId);
              return (
                <fieldset className="course-entry-editor" key={rule.ruleId}>
                  <legend>{rule.title}</legend>
                  <Field label={t('Application', 'Cách áp dụng')}>
                    <select
                      value={current?.action || 'shared'}
                      onChange={(e) => override(rule, e.target.value)}
                    >
                      <option value="shared">{t('Use shared rule', 'Dùng nội quy chung')}</option>
                      <option value="override">{t('Override text', 'Thay nội dung')}</option>
                      <option value="disable">
                        {t('Disable in this course', 'Không áp dụng trong khóa học')}
                      </option>
                    </select>
                  </Field>
                  {current?.action === 'override' ? (
                    <>
                      <Field label={t('Title', 'Tiêu đề')}>
                        <input
                          required
                          maxLength={160}
                          value={current.title}
                          onChange={(e) =>
                            setOverrides((list) =>
                              list.map((o) =>
                                o.ruleId === rule.ruleId
                                  ? { ...current, title: e.target.value }
                                  : o,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label={t('Rule text', 'Nội dung nội quy')}>
                        <textarea
                          required
                          maxLength={5000}
                          value={current.body}
                          onChange={(e) =>
                            setOverrides((list) =>
                              list.map((o) =>
                                o.ruleId === rule.ruleId ? { ...current, body: e.target.value } : o,
                              ),
                            )
                          }
                        />
                      </Field>
                    </>
                  ) : (
                    <p className="plain-text">{rule.body}</p>
                  )}
                </fieldset>
              );
            })}
            <h3>{t('Additional course rules', 'Nội quy bổ sung cho khóa học')}</h3>
            <RuleFields rules={custom} onChange={setCustom} locale={locale} />
            <FormActions locale={locale} busy={busy} onClose={() => setEditing(false)} />
          </form>
        </Modal>
      )}
    </section>
  );
}
export function SharedCourseRules({ locale }: { locale: Locale }) {
  const t = translate(locale),
    [data, setData] = useState<{ active: Template; drafts: Template[] } | null>(null),
    [rules, setRules] = useState<Rule[]>([]),
    [editing, setEditing] = useState(false),
    [activation, setActivation] = useState<Template | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function load() {
    try {
      setData(await api('/admin/course-rule-templates'));
      setError('');
    } catch (e) {
      setError(courseError(e, locale));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (activation)
        await api('/admin/course-rule-templates/' + activation.id + '/activate', 'POST');
      else
        await api('/admin/course-rule-templates', 'POST', {
          rules: rules.map((r, i) => ({ ...r, position: i })),
        });
      setEditing(false);
      setActivation(null);
      await load();
    } catch (e) {
      setError(courseError(e, locale));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="identity-screen">
      <IdentityAlert text={error} />
      <section className="panel course-section">
        <div className="panel-heading">
          <div>
            <h2>{t('Shared Course Rules', 'Nội quy chung')}</h2>
            <p>
              {t(
                'Immutable versions, applied across courses. Course overrides retain stable rule IDs.',
                'Phiên bản bất biến áp dụng cho các khóa học. Tùy chỉnh khóa học gắn với ID nội quy ổn định.',
              )}
            </p>
          </div>
          <button
            className="button primary"
            onClick={() => {
              setRules(data?.active.rules.map((r) => ({ ...r })) || [newRule(0)]);
              setEditing(true);
            }}
          >
            {t('Create version', 'Tạo phiên bản')}
          </button>
        </div>
        {!data ? (
          <p role="status">{t('Loading…', 'Đang tải…')}</p>
        ) : (
          <>
            <h3>
              {t('Active version', 'Phiên bản đang áp dụng')}: {data.active.version || '—'}
            </h3>
            {!data.active.rules.length ? (
              <Empty locale={locale} />
            ) : (
              <div className="rules-list">
                {data.active.rules.map((r) => (
                  <article key={r.ruleId}>
                    <small>{r.ruleId}</small>
                    <h3>{r.title}</h3>
                    <p className="plain-text">{r.body}</p>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>
      <section className="panel course-section">
        <h2>{t('Other versions', 'Các phiên bản khác')}</h2>
        {data?.drafts.length ? (
          <div className="template-versions">
            {data.drafts.map((version) => (
              <article key={version.id}>
                <div>
                  <strong>
                    {t('Version', 'Phiên bản')} {version.version}
                  </strong>
                  <p>
                    {version.rules.length} {t('rules', 'nội quy')}
                  </p>
                  <details>
                    <summary>{t('Review content', 'Xem nội dung')}</summary>
                    {version.rules.map((rule) => (
                      <div key={rule.ruleId}>
                        <h4>{rule.title}</h4>
                        <p className="plain-text">{rule.body}</p>
                      </div>
                    ))}
                  </details>
                </div>
                <button className="button secondary" onClick={() => setActivation(version)}>
                  {t('Activate', 'Kích hoạt')}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <Empty locale={locale} />
        )}
      </section>
      {(editing || activation) && (
        <Modal
          title={
            activation
              ? t('Activate shared rules', 'Kích hoạt nội quy chung')
              : t('New shared rules version', 'Phiên bản nội quy chung mới')
          }
          onClose={() => {
            setEditing(false);
            setActivation(null);
          }}
          locked={busy}
        >
          <form className="course-form" onSubmit={save}>
            <IdentityAlert text={error} />
            {activation ? (
              <>
                <p className="service-note">
                  {t('This applies version ', 'Thao tác sẽ áp dụng phiên bản ')}
                  {activation.version}
                  {t(
                    ' across all courses. Existing overrides are preserved; activation is rejected if an override loses its rule ID.',
                    ' cho mọi khóa học. Tùy chỉnh được giữ; không cho kích hoạt nếu mất ID nội quy đang được tùy chỉnh.',
                  )}
                </p>
                {activation.rules.map((r) => (
                  <article key={r.ruleId}>
                    <h3>{r.title}</h3>
                    <p className="plain-text">{r.body}</p>
                  </article>
                ))}
              </>
            ) : (
              <>
                <p className="service-note">
                  {t(
                    'Use stable IDs when revising rules already used by courses. Plain text only.',
                    'Giữ ID ổn định khi sửa nội quy đã được khóa học sử dụng. Chỉ nhập văn bản thuần.',
                  )}
                </p>
                <RuleFields rules={rules} onChange={setRules} locale={locale} />
              </>
            )}
            <FormActions
              locale={locale}
              busy={busy || (!activation && !rules.length)}
              onClose={() => {
                setEditing(false);
                setActivation(null);
              }}
            />
          </form>
        </Modal>
      )}
    </div>
  );
}
