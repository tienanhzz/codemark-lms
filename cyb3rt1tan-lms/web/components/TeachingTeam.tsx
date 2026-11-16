'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { CourseStaffProfiles } from '../lib/contracts';
import { profileCopy, profileError } from '../lib/profileMessages';
import { selfCopy } from '../lib/selfServiceMessages';
import { IdentityAlert } from './IdentityShared';

export function TeachingTeam({
  courseId,
  locale,
  onOpen,
}: {
  courseId: string;
  locale: 'en' | 'vi';
  onOpen: (id: string) => void;
}) {
  const t = (key: Parameters<typeof profileCopy>[1]) => profileCopy(locale, key);
  const s = (key: Parameters<typeof selfCopy>[1]) => selfCopy(locale, key);
  const [data, setData] = useState<CourseStaffProfiles | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  async function load(cursor?: string) {
    setBusy(true);
    setError('');
    try {
      const value = await api<CourseStaffProfiles>(
        '/courses/' + courseId + '/teaching-team' + (cursor ? '?cursor=' + cursor : ''),
      );
      setData((old) => ({
        ...value,
        items: cursor ? [...(old?.items || []), ...value.items] : value.items,
      }));
      if (!cursor) setBroken({});
    } catch (problem) {
      setError(profileError(locale, problem));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    setData(null);
    void load();
  }, [courseId]);
  return (
    <section className="panel self-service-panel">
      <div className="panel-heading">
        <h2>{t('team')}</h2>
        <button className="button secondary" disabled={busy} onClick={() => void load()}>
          {s('reload')}
        </button>
      </div>
      <p className="field-help">{t('teamHelp')}</p>
      <IdentityAlert text={error} />
      {busy && <p role="status">{s('busy')}</p>}
      {data?.items.length === 0 && <p>{t('empty')}</p>}
      <div className="teaching-team">
        {data?.items.map((person) => (
          <article key={person.id}>
            {person.avatarUrl && !broken[person.id] ? (
              <img
                className="profile-photo"
                src={person.avatarUrl}
                alt={person.officialName}
                onError={() => setBroken((old) => ({ ...old, [person.id]: true }))}
              />
            ) : (
              <span className="avatar avatar-large" aria-hidden="true">
                {person.officialName.trim()[0]}
              </span>
            )}
            <div>
              <h3>{person.officialName}</h3>
              {person.academicTitle && <p>{person.academicTitle}</p>}
              <p>
                {person.role === 'teacher'
                  ? locale === 'vi'
                    ? 'Giảng viên'
                    : 'Teacher'
                  : locale === 'vi'
                    ? 'Trợ giảng'
                    : 'Teaching Assistant'}
                {person.owner ? ' · ' + t('owner') : ''}
              </p>
              <p>{person.email || t('hiddenEmail')}</p>
              {person.courses.length > 0 && (
                <div>
                  <h4>{t('visibleCourses')}</h4>
                  {person.courses.map((course) => (
                    <button
                      type="button"
                      key={course.id}
                      className="text-link"
                      onClick={() => onOpen(course.id)}
                    >
                      {course.courseCode} · {course.title}
                    </button>
                  ))}
                </div>
              )}
              {person.hasMoreCourses && <p className="field-help">{t('limitedCourses')}</p>}
            </div>
          </article>
        ))}
      </div>
      {data?.nextCursor && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void load(data.nextCursor!)}
        >
          {t('more')}
        </button>
      )}
    </section>
  );
}
