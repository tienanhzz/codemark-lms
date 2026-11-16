'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import {
  courseError,
  displayDate,
  translate,
  type Course,
  type Grant,
  type Locale,
  type Member,
  type Staff,
} from '../lib/courseApi';
import { IdentityAlert, Modal } from './IdentityShared';
import { CourseState, Empty, Field, FormActions, PersonPicker, ReasonField } from './CourseShared';

type Action = {
  kind: 'staff' | 'enroll' | 'grant' | 'remove' | 'revoke' | 'membership';
  id?: string;
  status?: string;
};
export function CoursePeople({
  course,
  locale,
  onChange,
}: {
  course: Course;
  locale: Locale;
  onChange: () => Promise<void>;
}) {
  const t = translate(locale),
    path = `/courses/${course.id}`,
    manage = course.permissions.includes('course.manage'),
    writable = manage && !['archived', 'completed'].includes(course.status);
  const [staff, setStaff] = useState<Staff[]>([]),
    [members, setMembers] = useState<Member[]>([]),
    [grants, setGrants] = useState<Grant[]>([]),
    [keys, setKeys] = useState<string[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [action, setAction] = useState<Action | null>(null),
    [person, setPerson] = useState(''),
    [role, setRole] = useState('teachingAssistant'),
    [transfer, setTransfer] = useState(false);
  async function load() {
    setLoading(true);
    try {
      const [s, m, g] = await Promise.all([
        api<{ items: Staff[] }>(path + '/staff'),
        api<{ items: Member[]; nextCursor: string | null }>(path + '/enrollments'),
        manage
          ? api<{ items: Grant[]; allowedKeys: string[] }>(path + '/permission-grants')
          : Promise.resolve({ items: [], allowedKeys: [] }),
      ]);
      setStaff(s.items);
      setMembers(m.items);
      setCursor(m.nextCursor);
      setGrants(g.items);
      setKeys(g.allowedKeys);
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
  function open(next: Action) {
    setError('');
    setPerson('');
    setRole('teachingAssistant');
    setTransfer(false);
    setAction(next);
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const reason = String(data.get('reason') || '');
      switch (action.kind) {
        case 'staff':
          await api(path + '/staff', 'POST', {
            userId: person,
            staffRole: role,
            ownerTransfer: transfer,
            ...(transfer ? { reason } : {}),
          });
          break;
        case 'enroll':
          await api(path + '/enrollments', 'POST', {
            userId: person,
            status: String(data.get('status')),
            sectionId: String(data.get('sectionId')) || null,
          });
          break;
        case 'grant':
          await api(path + '/permission-grants', 'POST', {
            userId: person,
            permissionKey: data.get('permissionKey'),
            reason,
            ...(data.get('expiresAt')
              ? { expiresAt: new Date(String(data.get('expiresAt'))).toISOString() }
              : {}),
          });
          break;
        case 'remove':
          await api(path + '/staff/' + action.id, 'DELETE', { reason });
          break;
        case 'revoke':
          await api(path + '/permission-grants/' + action.id, 'DELETE', { reason });
          break;
        case 'membership':
          await api(path + '/enrollments/' + action.id, 'PATCH', { reason, status: action.status });
          break;
      }
      setAction(null);
      await onChange();
      await load();
    } catch (e) {
      setError(courseError(e, locale));
    } finally {
      setBusy(false);
    }
  }
  async function more() {
    if (!cursor) return;
    setBusy(true);
    try {
      const next = await api<{ items: Member[]; nextCursor: string | null }>(
        path + '/enrollments?cursor=' + cursor,
      );
      setMembers((v) => [...v, ...next.items]);
      setCursor(next.nextCursor);
    } catch (e) {
      setError(courseError(e, locale));
    } finally {
      setBusy(false);
    }
  }
  const titles: Record<Action['kind'], string> = {
    staff: t('Add staff or transfer ownership', 'Thêm staff hoặc chuyển chủ khóa học'),
    enroll: t('Enroll student', 'Ghi danh sinh viên'),
    grant: t('Grant scoped permission', 'Cấp quyền trong khóa học'),
    remove: t('Remove course staff', 'Gỡ staff khỏi khóa học'),
    revoke: t('Revoke scoped permission', 'Thu hồi quyền khóa học'),
    membership: t('Change enrollment', 'Thay đổi ghi danh'),
  };
  return (
    <div className="identity-screen">
      <IdentityAlert text={error} />
      {loading && <p role="status">{t('Loading people…', 'Đang tải danh sách…')}</p>}
      <section className="panel">
        <div className="panel-heading course-section">
          <h2>{t('Teaching team', 'Đội ngũ giảng dạy')}</h2>
          {writable && (
            <button className="button secondary" onClick={() => open({ kind: 'staff' })}>
              {t('Add staff', 'Thêm staff')}
            </button>
          )}
        </div>
        {!staff.length ? (
          <Empty locale={locale} />
        ) : (
          <div className="table-scroll">
            <table className="identity-table">
              <thead>
                <tr>
                  <th>{t('Name', 'Họ tên')}</th>
                  <th>{t('Role', 'Vai trò')}</th>
                  <th>{t('Access', 'Quyền')}</th>
                  {writable && <th>{t('Action', 'Thao tác')}</th>}
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.userId}>
                    <td>
                      <strong>{s.officialName}</strong>
                      <small>
                        {s.username}
                        {s.userId === course.ownerId && ` · ${t('Owner', 'Chủ khóa học')}`}
                      </small>
                    </td>
                    <td>
                      {s.staffRole === 'teacher'
                        ? t('Teacher', 'Giảng viên')
                        : t('Teaching assistant', 'Trợ giảng')}
                    </td>
                    <td>
                      <details>
                        <summary>
                          {s.permissions.length} {t('permissions', 'quyền')}
                        </summary>
                        <ul>
                          {s.permissions.map((p) => (
                            <li key={p}>
                              <code>{p}</code>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </td>
                    {writable && (
                      <td>
                        <button
                          className="button secondary table-action"
                          disabled={s.userId === course.ownerId}
                          onClick={() => open({ kind: 'remove', id: s.userId })}
                        >
                          {t('Remove', 'Gỡ')}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-heading course-section">
          <h2>{t('Student roster', 'Danh sách sinh viên')}</h2>
          {writable && (
            <button className="button secondary" onClick={() => open({ kind: 'enroll' })}>
              {t('Enroll student', 'Ghi danh sinh viên')}
            </button>
          )}
        </div>
        {!members.length ? (
          <Empty locale={locale} />
        ) : (
          <div className="table-scroll">
            <table className="identity-table">
              <thead>
                <tr>
                  <th>{t('Name', 'Họ tên')}</th>
                  <th>{t('Section', 'Nhóm lớp')}</th>
                  <th>{t('Status', 'Trạng thái')}</th>
                  {writable && <th>{t('Action', 'Thao tác')}</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.userId}>
                    <td>
                      <strong>{m.officialName}</strong>
                      <small>{m.username}</small>
                    </td>
                    <td>{m.sectionId || '—'}</td>
                    <td>
                      <CourseState value={m.status} locale={locale} />
                    </td>
                    {writable && (
                      <td>
                        <div className="course-row-actions">
                          {m.status !== 'active' && (
                            <button
                              className="button secondary table-action"
                              onClick={() =>
                                open({ kind: 'membership', id: m.userId, status: 'active' })
                              }
                            >
                              {t('Activate', 'Kích hoạt')}
                            </button>
                          )}
                          {m.status === 'active' && (
                            <button
                              className="button secondary table-action"
                              onClick={() =>
                                open({ kind: 'membership', id: m.userId, status: 'completed' })
                              }
                            >
                              {t('Complete', 'Hoàn thành')}
                            </button>
                          )}
                          {m.status !== 'withdrawn' && (
                            <button
                              className="button secondary table-action"
                              onClick={() =>
                                open({ kind: 'membership', id: m.userId, status: 'withdrawn' })
                              }
                            >
                              {t('Withdraw', 'Rút ghi danh')}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cursor && (
          <button
            className="button secondary course-more"
            disabled={busy}
            onClick={() => void more()}
          >
            {t('Load more', 'Tải thêm')}
          </button>
        )}
      </section>
      {manage && (
        <section className="panel">
          <div className="panel-heading course-section">
            <div>
              <h2>{t('Scoped permission grants', 'Quyền được cấp riêng')}</h2>
              <p>
                {t(
                  'Default role permissions remain in effect. Extra grants expire or can be revoked.',
                  'Quyền mặc định theo vai trò vẫn có hiệu lực. Quyền bổ sung có thể hết hạn hoặc bị thu hồi.',
                )}
              </p>
            </div>
            {writable && (
              <button className="button secondary" onClick={() => open({ kind: 'grant' })}>
                {t('Grant permission', 'Cấp quyền')}
              </button>
            )}
          </div>
          {!grants.length ? (
            <Empty locale={locale} />
          ) : (
            <div className="table-scroll">
              <table className="identity-table">
                <thead>
                  <tr>
                    <th>{t('Staff', 'Nhân sự')}</th>
                    <th>{t('Permission', 'Quyền')}</th>
                    <th>{t('Validity', 'Hiệu lực')}</th>
                    <th>{t('Action', 'Thao tác')}</th>
                  </tr>
                </thead>
                <tbody>
                  {grants.map((g) => (
                    <tr key={g.id}>
                      <td>
                        {staff.find((s) => s.userId === g.userId)?.officialName ||
                          t('Former staff', 'Staff đã gỡ')}
                      </td>
                      <td>
                        <code>{g.permissionKey}</code>
                      </td>
                      <td>
                        {g.revokedAt
                          ? t('Revoked', 'Đã thu hồi')
                          : g.expiresAt && new Date(g.expiresAt) < new Date()
                            ? t('Expired', 'Đã hết hạn')
                            : t('Granted', 'Đã cấp')}
                        <small>
                          {displayDate(g.startsAt, locale, course.timezone)} →{' '}
                          {g.expiresAt
                            ? displayDate(g.expiresAt, locale, course.timezone)
                            : t('No expiry', 'Không hết hạn')}
                        </small>
                      </td>
                      <td>
                        {writable && !g.revokedAt && (
                          <button
                            className="button secondary table-action"
                            onClick={() => open({ kind: 'revoke', id: g.id })}
                          >
                            {t('Revoke', 'Thu hồi')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {action && (
        <Modal title={titles[action.kind]} onClose={() => setAction(null)} locked={busy}>
          <form className="course-form" onSubmit={save}>
            <IdentityAlert text={error} />
            {action.kind === 'staff' && (
              <>
                <Field label={t('Staff role', 'Vai trò staff')}>
                  <select
                    value={role}
                    onChange={(e) => {
                      setRole(e.target.value);
                      setPerson('');
                      setTransfer(false);
                    }}
                  >
                    <option value="teachingAssistant">
                      {t('Teaching assistant', 'Trợ giảng')}
                    </option>
                    <option value="teacher">{t('Teacher', 'Giảng viên')}</option>
                  </select>
                </Field>
                <PersonPicker
                  course={course}
                  role={role}
                  locale={locale}
                  value={person}
                  onChange={setPerson}
                />
                {role === 'teacher' && (
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={transfer}
                      onChange={(e) => setTransfer(e.target.checked)}
                    />
                    {t(
                      'Transfer ownership to this Teacher',
                      'Chuyển chủ khóa học cho giảng viên này',
                    )}
                  </label>
                )}
                {transfer && (
                  <p className="service-note">
                    {t(
                      'The previous owner loses course staff access unless added again.',
                      'Chủ cũ sẽ mất quyền staff khóa học nếu không được thêm lại.',
                    )}
                  </p>
                )}
              </>
            )}
            {action.kind === 'enroll' && (
              <>
                <PersonPicker
                  course={course}
                  role="student"
                  locale={locale}
                  value={person}
                  onChange={setPerson}
                />
                <Field label={t('Status', 'Trạng thái')}>
                  <select name="status">
                    <option value="active">{t('Active', 'Hoạt động')}</option>
                    <option value="invited">
                      {t('Invited (no course access yet)', 'Đã mời (chưa được truy cập khóa học)')}
                    </option>
                  </select>
                </Field>
                <Field label={t('Section', 'Nhóm lớp')}>
                  <input name="sectionId" maxLength={128} />
                </Field>
              </>
            )}
            {action.kind === 'grant' && (
              <>
                <Field label={t('Staff', 'Nhân sự')}>
                  <select required value={person} onChange={(e) => setPerson(e.target.value)}>
                    <option value="">{t('Select staff', 'Chọn staff')}</option>
                    {staff.map((s) => (
                      <option key={s.userId} value={s.userId}>
                        {s.officialName}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('Permission', 'Quyền')}>
                  <select required name="permissionKey">
                    {keys.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label={t(
                    'Expires at (your device timezone, optional)',
                    'Hết hạn (múi giờ thiết bị, tùy chọn)',
                  )}
                >
                  <input name="expiresAt" type="datetime-local" />
                </Field>
              </>
            )}
            {action.kind === 'membership' && (
              <p className="service-note">
                {t('New status: ', 'Trạng thái mới: ')}
                <CourseState value={action.status || ''} locale={locale} />
              </p>
            )}
            {(['remove', 'revoke', 'membership', 'grant'].includes(action.kind) || transfer) && (
              <ReasonField locale={locale} />
            )}
            <FormActions locale={locale} busy={busy} onClose={() => setAction(null)} />
          </form>
        </Modal>
      )}
    </div>
  );
}
