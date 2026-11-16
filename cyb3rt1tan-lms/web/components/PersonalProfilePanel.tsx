'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { PersonalProfile, ProfileChange } from '../lib/contracts';
import { selfCopy, selfError } from '../lib/selfServiceMessages';
import { IdentityAlert } from './IdentityShared';
import { AvatarEditor } from './AvatarEditor';

export function PersonalProfilePanel({
  locale,
  timeZone,
  onChanged,
}: {
  locale: 'en' | 'vi';
  timeZone: string;
  onChanged: (profile: PersonalProfile) => void;
}) {
  const t = (key: Parameters<typeof selfCopy>[1]) => selfCopy(locale, key);
  const [profile, setProfile] = useState<PersonalProfile | null>(null);
  const [draft, setDraft] = useState<ProfileChange | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function load() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const value = await api<PersonalProfile>('/me/profile');
      setProfile(value);
      setDraft({
        expectedRevision: value.revision,
        nickname: value.nickname,
        contactEmail: value.contactEmail,
        phone: value.phone,
        about: value.about,
        academicTitle: value.academicTitle,
        showEmailInCourses: value.showEmailInCourses,
      });
    } catch (problem) {
      setError(selfError(locale, problem));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const value = await api<PersonalProfile>('/me/profile', 'PATCH', draft);
      setProfile(value);
      setDraft({ ...draft, expectedRevision: value.revision, nickname: value.nickname });
      onChanged(value);
      setNotice(t('saved'));
    } catch (problem) {
      setError(selfError(locale, problem));
    } finally {
      setBusy(false);
    }
  }
  const cooldown =
    profile?.nextNicknameChangeAt && new Date(profile.nextNicknameChangeAt).getTime() > Date.now();
  return (
    <section className="panel self-service-panel">
      <div className="panel-heading">
        <h2>{t('profile')}</h2>
        <button className="button secondary" onClick={() => void load()} disabled={busy}>
          {t('reload')}
        </button>
      </div>
      <IdentityAlert text={error} />
      <IdentityAlert text={notice} success />
      {!profile && busy && <p role="status">{t('busy')}</p>}
      {draft && profile && (
        <form className="identity-form" onSubmit={save}>
          <p className="field-help">{t('officialHelp')}</p>
          <fieldset disabled={busy}>
            <label>
              {t('nickname')}
              <input
                value={draft.nickname || ''}
                maxLength={32}
                readOnly={Boolean(cooldown)}
                aria-describedby="nickname-help"
                onChange={(event) => setDraft({ ...draft, nickname: event.target.value || null })}
              />
            </label>
            <p className="field-help" id="nickname-help">
              {t('nicknameHelp')}
            </p>
            {cooldown && (
              <p className="service-note">
                {t('nextChange')}:{' '}
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone,
                }).format(new Date(profile.nextNicknameChangeAt!))}{' '}
                ({timeZone})
              </p>
            )}
            <label>
              {t('contactEmail')}
              <input
                type="email"
                autoComplete="email"
                maxLength={320}
                value={draft.contactEmail || ''}
                onChange={(event) =>
                  setDraft({ ...draft, contactEmail: event.target.value || null })
                }
              />
            </label>
            <label>
              {t('phone')}
              <input
                type="tel"
                autoComplete="tel"
                maxLength={40}
                value={draft.phone || ''}
                onChange={(event) => setDraft({ ...draft, phone: event.target.value || null })}
              />
            </label>
            <p className="field-help">{t('contactHelp')}</p>
            <label>
              {t('about')}
              <textarea
                rows={4}
                maxLength={2000}
                value={draft.about || ''}
                onChange={(event) => setDraft({ ...draft, about: event.target.value })}
              />
            </label>
            <label>
              {t('academicTitle')}
              <input
                maxLength={120}
                value={draft.academicTitle || ''}
                onChange={(event) => setDraft({ ...draft, academicTitle: event.target.value })}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={Boolean(draft.showEmailInCourses)}
                onChange={(event) =>
                  setDraft({ ...draft, showEmailInCourses: event.target.checked })
                }
              />
              {t('showEmail')}
            </label>
            <button className="button primary" disabled={busy}>
              {t(busy ? 'busy' : 'save')}
            </button>
          </fieldset>
        </form>
      )}
      {profile && (
        <AvatarEditor
          profile={profile}
          locale={locale}
          disabled={busy}
          onWorking={setBusy}
          onChanged={(value) => {
            setProfile(value);
            setDraft((old) => (old ? { ...old, expectedRevision: value.revision } : old));
            onChanged(value);
          }}
        />
      )}
    </section>
  );
}
