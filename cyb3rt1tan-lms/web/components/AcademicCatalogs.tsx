'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import {
  courseError,
  displayDate,
  translate,
  zonedIso,
  wallTime,
  type Faculty,
  type Locale,
  type Term,
} from '../lib/courseApi';
import { IdentityAlert, Modal } from './IdentityShared';
import { CourseState, Empty, Field, FormActions } from './CourseShared';
export function AcademicCatalogs({ locale }: { locale: Locale }) {
  const t = translate(locale),
    [faculties, setFaculties] = useState<Faculty[]>([]),
    [terms, setTerms] = useState<Term[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [edit, setEdit] = useState<{ kind: 'faculty' | 'term'; item?: Faculty | Term } | null>(null);
  async function load() {
    setLoading(true);
    try {
      const [f, s] = await Promise.all([
        api<{ items: Faculty[] }>('/admin/faculties?includeRetired=true'),
        api<{ items: Term[] }>('/admin/academic-terms?includeRetired=true'),
      ]);
      setFaculties(f.items);
      setTerms(s.items);
      setError('');
    } catch (e) {
      setError(courseError(e, locale));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      if (edit.kind === 'faculty') {
        const names = Object.fromEntries(
          [
            ['en', String(data.get('en'))],
            ['vi', String(data.get('vi'))],
          ].filter(([, v]) => v.trim()),
        );
        await api(
          '/admin/faculties' + (edit.item ? '/' + (edit.item as Faculty).facultyId : ''),
          edit.item ? 'PATCH' : 'POST',
          {
            ...(edit.item ? { status: data.get('status') } : { facultyId: data.get('id') }),
            names: {
              ...Object.fromEntries(
                Object.entries((edit.item as Faculty | undefined)?.names || {}).filter(
                  ([key]) => !['en', 'vi'].includes(key),
                ),
              ),
              ...names,
            },
            sortOrder: Number(data.get('sortOrder')),
          },
        );
      } else {
        const timezone = String(data.get('timezone'));
        await api(
          '/admin/academic-terms' + (edit.item ? '/' + (edit.item as Term).termCode : ''),
          edit.item ? 'PATCH' : 'POST',
          {
            ...(edit.item ? { status: data.get('status') } : { termCode: data.get('id') }),
            name: data.get('name'),
            timezone,
            startsAt: zonedIso(String(data.get('startsAt')), timezone),
            endsAt: zonedIso(String(data.get('endsAt')), timezone),
          },
        );
      }
      setEdit(null);
      await load();
    } catch (e) {
      setError(courseError(e, locale));
    } finally {
      setBusy(false);
    }
  }
  const faculty = edit?.kind === 'faculty' ? (edit.item as Faculty | undefined) : undefined,
    term = edit?.kind === 'term' ? (edit.item as Term | undefined) : undefined;
  return (
    <div className="identity-screen">
      <IdentityAlert text={error} />
      {loading && <p role="status">{t('Loading catalogs…', 'Đang tải danh mục…')}</p>}
      <p className="service-note">
        {t(
          'Retiring a catalog entry preserves existing course references and prevents new assignments. IDs cannot change.',
          'Ngừng sử dụng danh mục sẽ giữ tham chiếu của khóa học cũ và chặn gán mới. Không thể đổi ID.',
        )}
      </p>
      <section className="panel">
        <div className="panel-heading course-section">
          <h2>{t('Faculties', 'Khoa')}</h2>
          <button className="button secondary" onClick={() => setEdit({ kind: 'faculty' })}>
            {t('Add faculty', 'Thêm khoa')}
          </button>
        </div>
        {!faculties.length ? (
          <Empty locale={locale} />
        ) : (
          <div className="table-scroll">
            <table className="identity-table">
              <thead>
                <tr>
                  <th>{t('Faculty', 'Khoa')}</th>
                  <th>{t('Status', 'Trạng thái')}</th>
                  <th>{t('Order', 'Thứ tự')}</th>
                  <th>{t('Action', 'Thao tác')}</th>
                </tr>
              </thead>
              <tbody>
                {faculties.map((f) => (
                  <tr key={f.facultyId}>
                    <td>
                      <strong>{f.names[locale] || Object.values(f.names)[0]}</strong>
                      <small>{f.facultyId}</small>
                    </td>
                    <td>
                      <CourseState value={f.status} locale={locale} />
                    </td>
                    <td>{f.sortOrder}</td>
                    <td>
                      <button
                        className="button secondary table-action"
                        onClick={() => setEdit({ kind: 'faculty', item: f })}
                      >
                        {t('Edit', 'Chỉnh sửa')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-heading course-section">
          <h2>{t('Academic terms', 'Học kỳ')}</h2>
          <button className="button secondary" onClick={() => setEdit({ kind: 'term' })}>
            {t('Add term', 'Thêm học kỳ')}
          </button>
        </div>
        {!terms.length ? (
          <Empty locale={locale} />
        ) : (
          <div className="table-scroll">
            <table className="identity-table">
              <thead>
                <tr>
                  <th>{t('Term', 'Học kỳ')}</th>
                  <th>{t('Period', 'Thời gian')}</th>
                  <th>{t('Status', 'Trạng thái')}</th>
                  <th>{t('Action', 'Thao tác')}</th>
                </tr>
              </thead>
              <tbody>
                {terms.map((term) => (
                  <tr key={term.termCode}>
                    <td>
                      <strong>{term.name}</strong>
                      <small>{term.termCode}</small>
                    </td>
                    <td>
                      {displayDate(term.startsAt, locale, term.timezone)}
                      <small>
                        → {displayDate(term.endsAt, locale, term.timezone)} · {term.timezone}
                      </small>
                    </td>
                    <td>
                      <CourseState value={term.status} locale={locale} />
                    </td>
                    <td>
                      <button
                        className="button secondary table-action"
                        onClick={() => setEdit({ kind: 'term', item: term })}
                      >
                        {t('Edit', 'Chỉnh sửa')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {edit && (
        <Modal
          title={
            edit.kind === 'faculty'
              ? t('Faculty details', 'Thông tin khoa')
              : t('Academic term details', 'Thông tin học kỳ')
          }
          onClose={() => setEdit(null)}
          locked={busy}
        >
          <form className="course-form" onSubmit={save}>
            <IdentityAlert text={error} />
            <Field label={t('Stable ID', 'ID ổn định')}>
              <input
                name="id"
                required
                maxLength={128}
                pattern={
                  edit.kind === 'faculty' ? '[a-z0-9][a-z0-9._-]*' : '[a-zA-Z0-9][a-zA-Z0-9._-]*'
                }
                disabled={Boolean(edit.item)}
                defaultValue={faculty?.facultyId || term?.termCode}
              />
            </Field>
            {edit.kind === 'faculty' ? (
              <>
                <Field label={t('English name', 'Tên tiếng Anh')}>
                  <input name="en" maxLength={160} defaultValue={faculty?.names.en} />
                </Field>
                <Field label={t('Vietnamese name', 'Tên tiếng Việt')}>
                  <input name="vi" maxLength={160} defaultValue={faculty?.names.vi} />
                </Field>
                <p>{t('Provide at least one name.', 'Nhập ít nhất một tên.')}</p>
                <Field label={t('Sort order', 'Thứ tự sắp xếp')}>
                  <input
                    name="sortOrder"
                    type="number"
                    min={0}
                    max={100000}
                    defaultValue={faculty?.sortOrder || 0}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label={t('Name', 'Tên học kỳ')}>
                  <input name="name" required maxLength={240} defaultValue={term?.name} />
                </Field>
                <Field label={t('IANA timezone', 'Múi giờ IANA')}>
                  <input
                    name="timezone"
                    required
                    defaultValue={term?.timezone || 'Asia/Bangkok'}
                    maxLength={64}
                  />
                </Field>
                {
                  <div className="course-form-grid">
                    <Field label={t('Starts at', 'Bắt đầu')}>
                      <input
                        name="startsAt"
                        type="datetime-local"
                        required
                        defaultValue={term ? wallTime(term.startsAt, term.timezone) : ''}
                      />
                    </Field>
                    <Field label={t('Ends at', 'Kết thúc')}>
                      <input
                        name="endsAt"
                        type="datetime-local"
                        required
                        defaultValue={term ? wallTime(term.endsAt, term.timezone) : ''}
                      />
                    </Field>
                  </div>
                }
              </>
            )}
            {edit.item && (
              <Field label={t('Status', 'Trạng thái')}>
                <select name="status" defaultValue={edit.item.status}>
                  <option value="active">{t('Active', 'Đang hoạt động')}</option>
                  <option value="retired">{t('Retired', 'Ngừng sử dụng')}</option>
                </select>
              </Field>
            )}
            <FormActions locale={locale} busy={busy} onClose={() => setEdit(null)} />
          </form>
        </Modal>
      )}
    </div>
  );
}
