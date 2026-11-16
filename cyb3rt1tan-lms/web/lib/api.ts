import type { CurrentUser, UserPreferences, WorkspaceSummary } from './contracts';
export type { CurrentUser, UserPreferences } from './contracts';
export type Activity = { id: string; action: string; createdAt: string };
export type Summary = WorkspaceSummary;

export const defaultPreferences: UserPreferences = {
  locale: 'en',
  theme: 'light',
  colorPalette: 'navy-cyan-gold',
  timeZone: 'Asia/Bangkok',
  textScale: 'default',
  highContrast: false,
  reducedMotion: false,
  captionsEnabled: false,
};

export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const csrf =
    typeof document === 'undefined'
      ? ''
      : document.cookie
          .split('; ')
          .find((value) => value.startsWith('lms_csrf='))
          ?.split('=')[1];
  const response = await fetch(`/v1${path}`, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined')
      window.dispatchEvent(new Event('codemark:unauthorized'));
    const error = payload as { error?: { code?: string } } | null;
    throw new Error(error?.error?.code || 'connection_error');
  }
  return payload as T;
}

export async function apiCsv<T>(
  path: string,
  body: ArrayBuffer,
  headers: Record<string, string>,
): Promise<T> {
  const csrf =
    document.cookie
      .split('; ')
      .find((value) => value.startsWith('lms_csrf='))
      ?.split('=')[1] || '';
  const response = await fetch('/v1' + path, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    body,
    headers: { ...headers, 'Content-Type': 'text/csv', 'X-CSRF-Token': csrf },
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('codemark:unauthorized'));
    throw new Error(
      (result as { error?: { code?: string } } | null)?.error?.code || 'connection_error',
    );
  }
  return result as T;
}

export async function apiQuestionAsset<T>(path: string, file: File, kind: string): Promise<T> {
  const csrf =
    document.cookie
      .split('; ')
      .find((value) => value.startsWith('lms_csrf='))
      ?.split('=')[1] || '';
  const response = await fetch('/v1' + path, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    body: file,
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-CSRF-Token': csrf,
      'X-Question-Asset-Kind': kind,
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('codemark:unauthorized'));
    throw new Error((payload as { error?: { code?: string } } | null)?.error?.code || 'connection_error');
  }
  return payload as T;
}

export function applyPreferences(preferences: UserPreferences): void {
  const root = document.documentElement;
  root.lang = preferences.locale;
  root.dataset.theme = preferences.theme;
  root.dataset.palette = preferences.colorPalette;
  root.dataset.large = String(preferences.textScale === 'large');
  root.dataset.contrast = String(Boolean(preferences.highContrast));
  root.dataset.motion = String(!preferences.reducedMotion);
}

export function userInitials(user: CurrentUser): string {
  return user.officialName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(-2)
    .join('')
    .toUpperCase();
}

export async function apiDownload(path: string): Promise<Blob> {
  const response = await fetch('/v1' + path, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('codemark:unauthorized'));
    const payload = (await response.json().catch(() => null)) as {
      error?: { code?: string };
    } | null;
    throw new Error(payload?.error?.code || 'connection_error');
  }
  const contentType = response.headers.get('content-type') || '';
  if (
    !contentType.startsWith('text/csv') &&
    !contentType.startsWith('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  )
    throw new Error('connection_error');
  return response.blob();
}

export async function apiAvatar<T>(blob: Blob, revision: number): Promise<T> {
  const csrf =
    document.cookie
      .split('; ')
      .find((value) => value.startsWith('lms_csrf='))
      ?.split('=')[1] || '';
  const response = await fetch('/v1/me/avatar', {
    method: 'PUT',
    credentials: 'same-origin',
    cache: 'no-store',
    body: blob,
    headers: {
      'Content-Type': 'image/png',
      'X-CSRF-Token': csrf,
      'If-Match': '"' + revision + '"',
    },
  });
  const value = (await response.json().catch(() => null)) as T & { error?: { code?: string } };
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('codemark:unauthorized'));
    throw new Error(value?.error?.code || 'connection_error');
  }
  return value;
}
