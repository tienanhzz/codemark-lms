'use client';
import { useEffect, useRef, useState } from 'react';
import { api, apiAvatar } from '../lib/api';
import type { PersonalProfile } from '../lib/contracts';
import { cropRectangle } from '../lib/avatarCrop';
import { profileCopy, profileError } from '../lib/profileMessages';
import { selfCopy } from '../lib/selfServiceMessages';
import { IdentityAlert, Modal } from './IdentityShared';

export function AvatarEditor({
  profile,
  locale,
  disabled,
  onWorking,
  onChanged,
}: {
  profile: PersonalProfile;
  locale: 'en' | 'vi';
  disabled: boolean;
  onWorking: (value: boolean) => void;
  onChanged: (value: PersonalProfile) => void;
}) {
  const t = (key: Parameters<typeof profileCopy>[1]) => profileCopy(locale, key);
  const s = (key: Parameters<typeof selfCopy>[1]) => selfCopy(locale, key);
  const canvas = useRef<HTMLCanvasElement>(null),
    pendingURL = useRef<string | null>(null);
  const [image, setImage] = useState<{ element: HTMLImageElement; url: string } | null>(null);
  const [zoom, setZoom] = useState(1),
    [x, setX] = useState(50),
    [y, setY] = useState(50);
  const [working, setWorking] = useState(false),
    [removing, setRemoving] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [broken, setBroken] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pendingURL.current) URL.revokeObjectURL(pendingURL.current);
    };
  }, []);
  useEffect(() => {
    setBroken(false);
  }, [profile.avatarUrl]);
  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image.url);
    },
    [image],
  );
  function draw() {
    if (!image || !canvas.current) return;
    const context = canvas.current.getContext('2d');
    if (!context) throw new Error('imageInvalid');
    const rect = cropRectangle(image.element.naturalWidth, image.element.naturalHeight, zoom, x, y);
    context.clearRect(0, 0, 512, 512);
    context.drawImage(image.element, rect.x, rect.y, rect.side, rect.side, 0, 0, 512, 512);
  }
  useEffect(() => {
    try {
      draw();
    } catch (problem) {
      setError(profileError(locale, problem));
    }
  }, [image, zoom, x, y]);
  async function choose(file: File | undefined) {
    if (!file) return;
    setWorking(true);
    onWorking(true);
    setError('');
    setNotice('');
    setImage(null);
    let url = '';
    try {
      if (file.size > 2000000) throw new Error('imageLarge');
      const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      const png =
        file.type === 'image/png' &&
        /\.png$/i.test(file.name) &&
        bytes[0] === 137 &&
        bytes[1] === 80 &&
        bytes[2] === 78 &&
        bytes[3] === 71;
      const jpeg =
        file.type === 'image/jpeg' &&
        /\.jpe?g$/i.test(file.name) &&
        bytes[0] === 255 &&
        bytes[1] === 216 &&
        bytes[2] === 255;
      const webp =
        file.type === 'image/webp' &&
        /\.webp$/i.test(file.name) &&
        String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
        String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
      if (!png && !jpeg && !webp) throw new Error('imageInvalid');
      url = URL.createObjectURL(file);
      pendingURL.current = url;
      const element = new Image();
      element.src = url;
      await element.decode();
      if (element.naturalWidth > 2048 || element.naturalHeight > 2048)
        throw new Error('imageLarge');
      if (element.naturalWidth < 1 || element.naturalHeight < 1) throw new Error('imageInvalid');
      if (!mounted.current) {
        URL.revokeObjectURL(url);
        return;
      }
      setZoom(1);
      setX(50);
      setY(50);
      setImage({ element, url });
      pendingURL.current = null;
    } catch (problem) {
      if (url) URL.revokeObjectURL(url);
      pendingURL.current = null;
      if (mounted.current) setError(profileError(locale, problem));
    } finally {
      if (mounted.current) {
        setWorking(false);
        onWorking(false);
      }
    }
  }
  async function save() {
    if (!image || !canvas.current) return;
    setWorking(true);
    onWorking(true);
    setError('');
    setNotice('');
    try {
      draw();
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.current!.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('imageInvalid'))),
          'image/png',
        ),
      );
      if (blob.size > 1000000) throw new Error('avatar_too_large');
      const result = await apiAvatar<PersonalProfile>(blob, profile.revision);
      if (mounted.current) {
        onChanged(result);
        setImage(null);
        setNotice(s('saved'));
      }
    } catch (problem) {
      if (mounted.current) setError(profileError(locale, problem));
    } finally {
      if (mounted.current) {
        setWorking(false);
        onWorking(false);
      }
    }
  }
  async function remove() {
    setWorking(true);
    onWorking(true);
    setError('');
    setNotice('');
    try {
      const result = await api<PersonalProfile>('/me/avatar', 'DELETE', undefined, {
        'If-Match': '"' + profile.revision + '"',
      });
      if (mounted.current) {
        onChanged(result);
        setRemoving(false);
        setNotice(s('saved'));
      }
    } catch (problem) {
      if (mounted.current) setError(profileError(locale, problem));
    } finally {
      if (mounted.current) {
        setWorking(false);
        onWorking(false);
      }
    }
  }
  if (!profile.avatarUploadAvailable)
    return (
      <div className="service-note">
        <p>{s('avatarUnavailable')}</p>
        <button type="button" className="button secondary" disabled>
          {s('upload')}
        </button>
      </div>
    );
  return (
    <div className="avatar-editor">
      <h3>{t('image')}</h3>
      <p className="field-help">{t('imageHelp')}</p>
      {!removing && <IdentityAlert text={error} />}
      <IdentityAlert text={notice} success />
      {profile.avatarUrl && !broken ? (
        <img
          className="profile-photo"
          src={profile.avatarUrl}
          alt={t('image')}
          onError={() => setBroken(true)}
        />
      ) : (
        <p>{t(broken ? 'imageUnavailable' : 'noImage')}</p>
      )}
      <label>
        {t('choose')}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={disabled || working}
          onChange={(event) => {
            void choose(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </label>
      {image && (
        <div className="avatar-crop">
          <canvas ref={canvas} width={512} height={512} role="img" aria-label={t('crop')} />
          <fieldset disabled={disabled || working}>
            {[
              ['zoom', zoom, setZoom, 1, 3, 0.05],
              ['horizontal', x, setX, 0, 100, 1],
              ['vertical', y, setY, 0, 100, 1],
            ].map(([key, value, setter, min, max, step]) => (
              <label key={String(key)}>
                {t(key as 'zoom' | 'horizontal' | 'vertical')}
                <input
                  type="range"
                  value={value as number}
                  min={min as number}
                  max={max as number}
                  step={step as number}
                  onChange={(event) =>
                    (setter as (value: number) => void)(Number(event.target.value))
                  }
                />
              </label>
            ))}
          </fieldset>
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              disabled={disabled || working}
              onClick={() => setImage(null)}
            >
              {t('discard')}
            </button>
            <button
              type="button"
              className="button primary"
              disabled={disabled || working}
              onClick={() => void save()}
            >
              {working ? s('busy') : t('upload')}
            </button>
          </div>
        </div>
      )}
      {profile.avatarUrl && (
        <button
          type="button"
          className="button secondary"
          disabled={disabled || working}
          onClick={() => {
            setError('');
            setRemoving(true);
          }}
        >
          {t('remove')}
        </button>
      )}
      {removing && (
        <Modal title={t('remove')} locked={working} onClose={() => setRemoving(false)}>
          <IdentityAlert text={error} />
          <p>{t('removeHelp')}</p>
          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              disabled={working}
              onClick={() => setRemoving(false)}
            >
              {s('cancel')}
            </button>
            <button
              type="button"
              className="button primary"
              disabled={working}
              onClick={() => void remove()}
            >
              {working ? s('busy') : t('remove')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
