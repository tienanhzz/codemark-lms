'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import {
  courseError,
  courseWrite,
  emptyModule,
  translate,
  type Course,
  type Faculty,
  type Locale,
  type Module,
  type Term,
} from '../lib/courseApi';
import { IdentityAlert, Modal } from './IdentityShared';
import { CourseState, Empty, Field, FormActions, ReasonField } from './CourseShared';
import { CoursePlanning } from './CoursePlanning';
import { CoursePeople } from './CoursePeople';
import { TeachingTeam } from './TeachingTeam';
import { CourseRules } from './CourseRules';
import { CourseAcademicPanel } from './CourseAcademicPanel';

export function CourseWorkspace({
  locale,
  roles,
  onChange,
}: {
  locale: Locale;
  roles: string[];
  onChange: () => Promise<void>;
}) {
  const t = translate(locale),
    admin = roles.includes('admin'),
    canCreate = admin || roles.includes('teacher');
  const [items, setItems] = useState<Course[]>([]),
    [selected, setSelected] = useState<Course | null>(null),
    [tab, setTab] = useState('overview'),
    [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [termFilter, setTermFilter] = useState(''),
    [facultyFilter, setFacultyFilter] = useState(''),
    [faculties, setFaculties] = useState<Faculty[]>([]),
    [terms, setTerms] = useState<Term[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [mode, setMode] = useState<
      'create' | 'edit' | 'activate' | 'complete' | 'archive' | 'restore' | null
    >(null),
    [module, setModule] = useState<Module>(emptyModule);
  async function load(next?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        query: search,
        ...(status ? { status } : {}),
        ...(termFilter ? { termId: termFilter } : {}),
        ...(facultyFilter ? { facultyId: facultyFilter } : {}),
        ...(next ? { cursor: next } : {}),
      });
      const result = await api<{ items: Course[]; nextCursor: string | null }>(
        '/courses?' + params,
      );
      setItems((old) => (next ? [...old, ...result.items] : result.items));
      setCursor(result.nextCursor);
      setError('');
    } catch (e) {
      setError(courseError(e, locale));
    } finally {
      setLoading(false);
    }
  }
  async function catalogs() {
    try {
      const [f, s] = await Promise.all([
        api<{ items: Faculty[] }>('/admin/faculties?includeRetired=true'),
        api<{ items: Term[] }>('/admin/academic-terms?includeRetired=true'),
      ]);
      setFaculties(f.items);
      setTerms(s.items);
    } catch (e) {
      setError(courseError(e, locale));
    }
  }
  useEffect(() => {
    void load();
  }, [search, status, termFilter, facultyFilter]);
  useEffect(() => {
    void catalogs();
    const courseId = new URLSearchParams(window.location.search).get('course');
    if (courseId) void open(courseId);
  }, []);
  async function open(id: string) {
    setLoading(true);
    setError('');
    try {
      const course = await api<Course>('/courses/' + id);
      setSelected(course);
      setTab('overview');
      window.history.replaceState(null, '', '/courses?course=' + encodeURIComponent(id));
    } catch (e) {
      setError(courseError(e, locale));
    } finally {
      setLoading(false);
    }
  }
  async function refresh() {
    if (selected) {
      try {
        setSelected(await api<Course>('/courses/' + selected.id));
      } catch (e) {
        setSelected(null);
        window.history.replaceState(null, '', '/courses');
        setError(courseError(e, locale));
      }
    }
    await load();
    await onChange();
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      if (mode === 'create' || mode === 'edit') {
        const payload = {
          title: data.get('title'),
          ...(mode === 'create' || data.get('termId') !== selected?.termId
            ? { termId: data.get('termId') }
            : {}),
          ...(mode === 'create' || data.get('facultyId') !== (selected?.facultyId || '')
            ? { facultyId: data.get('facultyId') || null }
            : {}),
          timezone: data.get('timezone'),
          module: {
            ...module,
            prerequisites: module.prerequisites.map((x) => x.trim()).filter(Boolean),
            objectives: module.objectives.map((x) => x.trim()).filter(Boolean),
          },
        };
        const result =
          mode === 'create'
            ? await api<Course>('/courses', 'POST', {
                ...payload,
                courseCode: data.get('courseCode'),
              })
            : await courseWrite<Course>(selected!, '', 'PATCH', payload);
        setSelected(result);
        setTab('overview');
        window.history.replaceState(null, '', '/courses?course=' + encodeURIComponent(result.id));
      } else if (selected) {
        const reason = String(data.get('reason'));
        if (mode === 'restore')
          setSelected(
            await api<Course>(`/admin/courses/${selected.id}/restore`, 'POST', { reason }),
          );
        else setSelected(await api<Course>(`/courses/${selected.id}/${mode}`, 'POST', { reason }));
      }
      setMode(null);
      await load();
      await onChange();
    } catch (e) {
      setError(courseError(e, locale));
    } finally {
      setBusy(false);
    }
  }
  const writable = selected && !['archived', 'completed'].includes(selected.status),
    manager = selected?.permissions.includes('course.manage');
  const titles = {
    create: t('Create course', 'Tạo khóa học'),
    edit: t('Edit course & module', 'Chỉnh sửa khóa học & học phần'),
    activate: t('Activate course', 'Kích hoạt khóa học'),
    complete: t('Complete course', 'Hoàn thành khóa học'),
    archive: t('Archive course', 'Lưu trữ khóa học'),
    restore: t('Restore course', 'Khôi phục khóa học'),
  };
  const facultyName = (id: string | null) => {
    const f = faculties.find((f) => f.facultyId === id);
    return f ? f.names[locale] || Object.values(f.names)[0] : id || '—';
  };
  const tabs = [
    { id: 'overview', label: t('Overview', 'Tổng quan') },
    { id: 'team', label: t('Teaching team', 'Đội ngũ giảng dạy') },
    { id: 'planning', label: t('Plan & schedule', 'Kế hoạch & lịch dạy') },
    { id: 'rules', label: t('Course Rules', 'Nội quy') },
    ...(selected?.permissions.includes('roster.read')
      ? [{ id: 'people', label: t('People & access', 'Thành viên & quyền') }]
      : []),
  ];
  return (
    <div className="identity-screen">
      <IdentityAlert text={error} />
      {!selected ? (
        <>
          <section className="panel">
            <form
              className="admin-toolbar course-search"
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(query);
              }}
            >
              <label className="search-field">
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                <input
                  aria-label={t('Search courses', 'Tìm khóa học')}
                  maxLength={200}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('Search code or title…', 'Tìm theo mã hoặc tên…')}
                />
              </label>
              <button className="button secondary">{t('Search', 'Tìm kiếm')}</button>
              {canCreate && (
                <button
                  type="button"
                  className="button primary"
                  onClick={() => {
                    setModule({ ...emptyModule });
                    setMode('create');
                  }}
                >
                  <i className="fa-solid fa-plus" aria-hidden="true" />
                  {t('Create course', 'Tạo khóa học')}
                </button>
              )}
            </form>
            <div className="account-filters course-filters">
              <Field label={t('Status', 'Trạng thái')}>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">{t('All statuses', 'Mọi trạng thái')}</option>
                  {['draft', 'active', 'completed', 'archived'].map((s) => (
                    <option key={s} value={s}>
                      {t(
                        {
                          draft: 'Draft',
                          active: 'Active',
                          completed: 'Completed',
                          archived: 'Archived',
                        }[s]!,
                        {
                          draft: 'Bản nháp',
                          active: 'Đang hoạt động',
                          completed: 'Đã hoàn thành',
                          archived: 'Lưu trữ',
                        }[s]!,
                      )}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('Academic term', 'Học kỳ')}>
                <select value={termFilter} onChange={(e) => setTermFilter(e.target.value)}>
                  <option value="">{t('All terms', 'Mọi học kỳ')}</option>
                  {terms.map((term) => (
                    <option key={term.termCode} value={term.termCode}>
                      {term.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('Faculty', 'Khoa')}>
                <select value={facultyFilter} onChange={(e) => setFacultyFilter(e.target.value)}>
                  <option value="">{t('All faculties', 'Mọi khoa')}</option>
                  {faculties.map((f) => (
                    <option key={f.facultyId} value={f.facultyId}>
                      {facultyName(f.facultyId)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>
          {loading && !items.length ? (
            <p role="status">{t('Loading courses…', 'Đang tải khóa học…')}</p>
          ) : !items.length ? (
            <section className="panel course-zero">
              <i className="fa-solid fa-book-open-reader" aria-hidden="true" />
              <h2>{t('Your learning spaces start here', 'Không gian học tập bắt đầu từ đây')}</h2>
              <p>
                {canCreate
                  ? t(
                      'Create a course after an Admin adds an academic term.',
                      'Tạo khóa học sau khi Admin thêm học kỳ.',
                    )
                  : t(
                      'Your enrolled courses will appear here when activated.',
                      'Các khóa học đã ghi danh sẽ xuất hiện khi được kích hoạt.',
                    )}
              </p>
              {admin && (
                <Link className="text-link" href="/academic-catalogs">
                  {t('Manage academic catalogs', 'Quản lý danh mục học vụ')} →
                </Link>
              )}
            </section>
          ) : (
            <div className="course-grid">
              {items.map((course) => (
                <article className="panel course-card" key={course.id}>
                  <div className="course-card-top">
                    <span className="course-book">
                      <i className="fa-solid fa-book-open" aria-hidden="true" />
                    </span>
                    <CourseState value={course.status} locale={locale} />
                  </div>
                  <span className="eyebrow">{course.courseCode}</span>
                  <h2>
                    <button onClick={() => void open(course.id)}>{course.title}</button>
                  </h2>
                  <p>{facultyName(course.facultyId)}</p>
                  <div className="course-card-bottom">
                    <span>
                      {terms.find((t) => t.termCode === course.termId)?.name || course.termId}
                    </span>
                    <button
                      className="text-link"
                      onClick={() => void open(course.id)}
                      aria-label={`${t('Open', 'Mở')} ${course.title}`}
                    >
                      {t('Open course', 'Mở khóa học')}{' '}
                      <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {cursor && (
            <button
              className="button secondary"
              disabled={loading}
              onClick={() => void load(cursor!)}
            >
              {t('Load more', 'Tải thêm')}
            </button>
          )}
        </>
      ) : (
        <>
          <div className="course-detail-toolbar">
            <button
              className="text-link"
              onClick={() => {
                setSelected(null);
                window.history.replaceState(null, '', '/courses');
              }}
            >
              <i className="fa-solid fa-arrow-left" aria-hidden="true" />{' '}
              {t('All courses', 'Tất cả khóa học')}
            </button>
            <button className="button secondary" disabled={busy} onClick={() => void refresh()}>
              {t('Reload course', 'Tải lại khóa học')}
            </button>
          </div>
          <section className="panel course-hero">
            <div>
              <span className="eyebrow">
                {selected.courseCode} · {selected.termId}
              </span>
              <h2>{selected.title}</h2>
              <p>
                {facultyName(selected.facultyId)} · {selected.timezone}
              </p>
            </div>
            <CourseState value={selected.status} locale={locale} />
          </section>
          {!writable && (
            <p className="service-note">
              <i className="fa-solid fa-box-archive" aria-hidden="true" />
              {t(
                'Academic history is retained. Completed and archived courses are read-only.',
                'Lịch sử học tập được giữ lại. Khóa học đã hoàn thành hoặc lưu trữ chỉ cho phép xem.',
              )}
            </p>
          )}
          <nav className="course-tabs" aria-label={t('Course sections', 'Các phần khóa học')}>
            {tabs.map((item) => (
              <button
                key={item.id}
                aria-current={tab === item.id ? 'page' : undefined}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          {tab === 'overview' && (
            <section className="panel course-section">
              <div className="panel-heading">
                <h2>{t('Module information', 'Thông tin học phần')}</h2>
                {manager && writable && (
                  <button
                    className="button secondary"
                    onClick={() => {
                      setModule({ ...emptyModule, ...selected.module });
                      setMode('edit');
                    }}
                  >
                    {t('Edit details', 'Chỉnh sửa thông tin')}
                  </button>
                )}
              </div>
              <dl className="course-definition">
                <div>
                  <dt>{t('Module code', 'Mã học phần')}</dt>
                  <dd>{selected.module.moduleCode || '—'}</dd>
                </div>
                <div>
                  <dt>{t('Module name', 'Tên học phần')}</dt>
                  <dd>{selected.module.moduleName || '—'}</dd>
                </div>
                <div>
                  <dt>{t('Level', 'Trình độ')}</dt>
                  <dd>{selected.module.level || '—'}</dd>
                </div>
                <div>
                  <dt>{t('Year', 'Năm học')}</dt>
                  <dd>{selected.module.year || '—'}</dd>
                </div>
                <div>
                  <dt>{t('Nature of module', 'Tính chất học phần')}</dt>
                  <dd>{selected.module.nature || '—'}</dd>
                </div>
                <div>
                  <dt>{t('Credits', 'Số tín chỉ')}</dt>
                  <dd>{selected.module.unitOfCredit || 0}</dd>
                </div>
                <div>
                  <dt>{t('Study hours', 'Số giờ học dự kiến')}</dt>
                  <dd>{selected.module.suggestedStudyHours || 0}</dd>
                </div>
              </dl>
              <h3>{t('Learning objectives', 'Mục tiêu học tập')}</h3>
              {selected.module.objectives?.length ? (
                <ul>
                  {selected.module.objectives.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              ) : (
                <Empty locale={locale} />
              )}
              <h3>{t('Prerequisites', 'Điều kiện tiên quyết')}</h3>
              {selected.module.prerequisites?.length ? (
                <ul>
                  {selected.module.prerequisites.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              ) : (
                <Empty locale={locale} />
              )}
              <div className="course-lifecycle">
                {manager && selected.status === 'draft' && (
                  <button className="button primary" onClick={() => setMode('activate')}>
                    {t('Activate course', 'Kích hoạt khóa học')}
                  </button>
                )}
                {manager && selected.status === 'active' && (
                  <button className="button secondary" onClick={() => setMode('complete')}>
                    {t('Complete course', 'Hoàn thành khóa học')}
                  </button>
                )}
                {manager && selected.status !== 'archived' && (
                  <button className="button secondary" onClick={() => setMode('archive')}>
                    {t('Archive course', 'Lưu trữ khóa học')}
                  </button>
                )}
                {admin && selected.status === 'archived' && (
                  <button className="button secondary" onClick={() => setMode('restore')}>
                    {t('Restore course', 'Khôi phục khóa học')}
                  </button>
                )}
              </div>
              <CourseAcademicPanel course={selected} locale={locale} onChange={refresh} />
            </section>
          )}
          {tab === 'planning' && (
            <CoursePlanning course={selected} locale={locale} onChange={refresh} />
          )}{' '}
          {tab === 'rules' && <CourseRules course={selected} locale={locale} onChange={refresh} />}{' '}
          {tab === 'people' && selected.permissions.includes('roster.read') && (
            <CoursePeople course={selected} locale={locale} onChange={refresh} />
          )}
          {tab === 'team' && (
            <TeachingTeam courseId={selected.id} locale={locale} onOpen={(id) => void open(id)} />
          )}
        </>
      )}
      {mode && (
        <Modal title={titles[mode]} onClose={() => setMode(null)} locked={busy}>
          <form className="course-form" onSubmit={save}>
            <IdentityAlert text={error} />
            {error && selected && (
              <button type="button" className="button secondary" onClick={() => void refresh()}>
                {t('Reload course', 'Tải lại khóa học')}
              </button>
            )}
            {mode === 'create' || mode === 'edit' ? (
              <>
                {mode === 'create' && (
                  <Field label={t('Course code', 'Mã khóa học')}>
                    <input name="courseCode" required maxLength={80} />
                  </Field>
                )}
                <Field label={t('Course title', 'Tên khóa học')}>
                  <input
                    name="title"
                    required
                    maxLength={240}
                    defaultValue={mode === 'edit' ? selected?.title : ''}
                  />
                </Field>
                <div className="course-form-grid">
                  <Field label={t('Academic term', 'Học kỳ')}>
                    <select
                      name="termId"
                      required
                      defaultValue={mode === 'edit' ? selected?.termId : ''}
                    >
                      <option value="">{t('Select term', 'Chọn học kỳ')}</option>
                      {terms
                        .filter(
                          (term) => term.status === 'active' || term.termCode === selected?.termId,
                        )
                        .map((term) => (
                          <option key={term.termCode} value={term.termCode}>
                            {term.name}
                            {term.status === 'retired' ? t(' (retired)', ' (ngừng sử dụng)') : ''}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label={t('Faculty', 'Khoa')}>
                    <select
                      name="facultyId"
                      defaultValue={mode === 'edit' ? selected?.facultyId || '' : ''}
                    >
                      <option value="">{t('Not assigned', 'Chưa gán')}</option>
                      {faculties
                        .filter((f) => f.status === 'active' || f.facultyId === selected?.facultyId)
                        .map((f) => (
                          <option key={f.facultyId} value={f.facultyId}>
                            {facultyName(f.facultyId)}
                          </option>
                        ))}
                    </select>
                  </Field>
                </div>
                {admin && !terms.some((term) => term.status === 'active') && (
                  <p className="service-note">
                    {t(
                      'Add an active academic term in Academic catalogs first.',
                      'Thêm học kỳ hoạt động trong Danh mục học vụ trước.',
                    )}
                  </p>
                )}
                <Field label={t('IANA timezone', 'Múi giờ IANA')}>
                  <input
                    name="timezone"
                    required
                    maxLength={64}
                    defaultValue={mode === 'edit' ? selected?.timezone : 'Asia/Bangkok'}
                  />
                </Field>
                <h3>{t('Module information', 'Thông tin học phần')}</h3>
                <div className="course-form-grid">
                  <Field label={t('Module code', 'Mã học phần')}>
                    <input
                      maxLength={80}
                      value={module.moduleCode}
                      onChange={(e) => setModule((m) => ({ ...m, moduleCode: e.target.value }))}
                    />
                  </Field>
                  <Field label={t('Module name', 'Tên học phần')}>
                    <input
                      maxLength={240}
                      value={module.moduleName}
                      onChange={(e) => setModule((m) => ({ ...m, moduleName: e.target.value }))}
                    />
                  </Field>
                  <Field label={t('Level', 'Trình độ')}>
                    <input
                      maxLength={80}
                      value={module.level}
                      onChange={(e) => setModule((m) => ({ ...m, level: e.target.value }))}
                    />
                  </Field>
                  <Field label={t('Year', 'Năm học')}>
                    <input maxLength={40} value={module.year || ''} onChange={(e) => setModule((m) => ({ ...m, year: e.target.value }))} />
                  </Field>
                  <Field label={t('Nature of module', 'Tính chất học phần')}>
                    <input maxLength={120} value={module.nature || ''} onChange={(e) => setModule((m) => ({ ...m, nature: e.target.value }))} />
                  </Field>
                  <Field label={t('Credits', 'Số tín chỉ')}>
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      step="0.5"
                      value={module.unitOfCredit}
                      onChange={(e) =>
                        setModule((m) => ({ ...m, unitOfCredit: Number(e.target.value) }))
                      }
                    />
                  </Field>
                </div>
                <Field label={t('Suggested study hours', 'Số giờ học dự kiến')}>
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    step="0.5"
                    value={module.suggestedStudyHours}
                    onChange={(e) =>
                      setModule((m) => ({ ...m, suggestedStudyHours: Number(e.target.value) }))
                    }
                  />
                </Field>
                <Field
                  label={t(
                    'Prerequisites (one per line)',
                    'Điều kiện tiên quyết (mỗi dòng một mục)',
                  )}
                >
                  <textarea
                    maxLength={12000}
                    rows={3}
                    value={module.prerequisites.join('\n')}
                    onChange={(e) =>
                      setModule((m) => ({ ...m, prerequisites: e.target.value.split('\n') }))
                    }
                  />
                </Field>
                <Field
                  label={t('Objectives (one per line)', 'Mục tiêu học tập (mỗi dòng một mục)')}
                >
                  <textarea
                    maxLength={12000}
                    rows={4}
                    value={module.objectives.join('\n')}
                    onChange={(e) =>
                      setModule((m) => ({ ...m, objectives: e.target.value.split('\n') }))
                    }
                  />
                </Field>
              </>
            ) : (
              <>
                <p className="service-note">
                  {mode === 'activate'
                    ? t(
                        'Enrolled students can access the course after activation.',
                        'Sinh viên được ghi danh có thể truy cập sau khi kích hoạt.',
                      )
                    : mode === 'restore'
                      ? t(
                          'Restore the status saved before archiving. Completed courses remain read-only.',
                          'Khôi phục trạng thái trước khi lưu trữ. Khóa học hoàn thành vẫn chỉ cho xem.',
                        )
                      : t(
                          'This preserves memberships, plans and history. It does not delete course data.',
                          'Giữ thành viên, kế hoạch và lịch sử. Không xóa dữ liệu khóa học.',
                        )}
                </p>
                <ReasonField locale={locale} />
              </>
            )}
            <FormActions locale={locale} busy={busy} onClose={() => setMode(null)} />
          </form>
        </Modal>
      )}
    </div>
  );
}
