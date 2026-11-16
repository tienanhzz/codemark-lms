'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import {
  courseError,
  stateName,
  translate,
  type Course,
  type Locale,
  type Person,
} from '../lib/courseApi';
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="course-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function CourseState({ value, locale }: { value: string; locale: Locale }) {
  return <span className={`state-badge state-${value}`}>{stateName(value, locale)}</span>;
}
export function Empty({ locale }: { locale: Locale }) {
  return (
    <p className="course-empty">{translate(locale)('Nothing here yet.', 'Chưa có dữ liệu.')}</p>
  );
}
export function PersonPicker({
  course,
  role,
  locale,
  value,
  onChange,
}: {
  course: Course;
  role: string;
  locale: Locale;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = translate(locale);
  const [query, setQuery] = useState(''),
    [people, setPeople] = useState<Person[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    let current = true;
    setLoading(true);
    const timer = setTimeout(() => {
      void api<{ items: Person[] }>(
        `/courses/${course.id}/people?role=${role}&query=${encodeURIComponent(query)}`,
      )
        .then((r) => {
          if (current) {
            setPeople(r.items);
            setError('');
          }
        })
        .catch((e) => {
          if (current) setError(courseError(e, locale));
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [course.id, role, query, locale]);
  return (
    <div className="person-picker">
      <Field label={t('Find account', 'Tìm tài khoản')}>
        <input
          maxLength={200}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('Name or username', 'Tên hoặc tên đăng nhập')}
        />
      </Field>
      <Field label={t('Account', 'Tài khoản')}>
        <select required value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('Select an active account', 'Chọn tài khoản đang hoạt động')}</option>
          {people.map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.officialName} · {p.username}
            </option>
          ))}
        </select>
      </Field>
      {loading && <small role="status">{t('Searching…', 'Đang tìm…')}</small>}
      {!loading && !people.length && (
        <small>{t('No matching active accounts.', 'Không có tài khoản hoạt động phù hợp.')}</small>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function ReasonField({ locale }: { locale: Locale }) {
  return (
    <Field label={translate(locale)('Reason', 'Lý do')}>
      <textarea name="reason" required minLength={1} maxLength={500} rows={3} />
    </Field>
  );
}
export function FormActions({
  locale,
  busy,
  onClose,
}: {
  locale: Locale;
  busy: boolean;
  onClose: () => void;
}) {
  const t = translate(locale);
  return (
    <div className="modal-actions">
      <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
        {t('Cancel', 'Hủy')}
      </button>
      <button className="button primary" disabled={busy}>
        {busy ? t('Saving…', 'Đang lưu…') : t('Save changes', 'Lưu thay đổi')}
      </button>
    </div>
  );
}
