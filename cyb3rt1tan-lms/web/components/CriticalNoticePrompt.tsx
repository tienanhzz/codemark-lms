'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { subscribeRealtime } from '../lib/realtime';
import type { Locale } from '../lib/courseApi';

type Notice = {
  id: string;
  severity: 'ordinary' | 'critical' | 'emergency';
  subject: string;
  body: string;
  createdAt: string;
  requireAcknowledgement: boolean;
  acknowledgedAt: string | null;
};
type RequiredNotice = Notice & { severity: 'critical' | 'emergency'; requireAcknowledgement: true; acknowledgedAt: null };

export function CriticalNoticePrompt({ locale }: { locale: Locale }) {
  const [pending, setPending] = useState<RequiredNotice | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const connectedRef = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const loadRef = useRef<() => Promise<void>>(async () => undefined);
  const vi = locale === 'vi';

  const load = useCallback(async () => {
    try {
      const feed = await api<{ items: Notice[] }>('/me/notifications?pageSize=100&unreadOnly=true');
      const required = feed.items.find((item): item is RequiredNotice =>
        item.severity !== 'ordinary' && item.requireAcknowledgement && !item.acknowledgedAt,
      );
      setPending(required || null);
      setError('');
    } catch (problem) {
      if (problem instanceof Error && problem.message !== 'authentication_required') {
        setError(vi ? 'Không tải được thông báo bắt buộc. Hãy thử lại.' : 'Required notice could not be loaded. Try again.');
      }
    }
  }, [vi]);

  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    void loadRef.current();
    const unsubscribe = subscribeRealtime({
      onChange: () => { void loadRef.current(); },
      onStatus: (value) => { connectedRef.current = value; setConnected(value); },
    });
    const fallback = window.setInterval(() => {
      if (!connectedRef.current) void loadRef.current();
    }, 30000);
    return () => { window.clearInterval(fallback); unsubscribe(); };
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (pending && !element.open) element.showModal();
    if (!pending && element.open) element.close();
  }, [pending]);

  async function acknowledge() {
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      await api(`/me/notifications/${pending.id}/acknowledgements`, 'POST');
      setPending(null);
      await loadRef.current();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'connection_error');
    } finally {
      setBusy(false);
    }
  }

  return <dialog
    ref={dialog}
    className="identity-modal critical-notice-modal"
    aria-labelledby="critical-notice-title"
    onCancel={(event) => event.preventDefault()}
  >
    {pending && <>
      <span className="eyebrow">{pending.severity === 'emergency' ? (vi ? 'Khẩn cấp' : 'Emergency') : (vi ? 'Thông báo quan trọng' : 'Critical notice')}</span>
      <h2 id="critical-notice-title">{pending.subject}</h2>
      <p className="preview-caption">{new Date(pending.createdAt).toLocaleString(vi ? 'vi-VN' : 'en-US')}</p>
      <p className="critical-notice-body">{pending.body}</p>
      <p>{vi ? 'Cần xác nhận đã đọc để tiếp tục.' : 'Acknowledgement is required to continue.'}</p>
    </>}
    {error && <p className="alert alert-error" role="alert">{error}</p>}
    <button className="button primary" type="button" disabled={busy || !pending} onClick={() => void acknowledge()}>
      {busy ? (vi ? 'Đang xác nhận…' : 'Acknowledging…') : (vi ? 'Tôi đã đọc và xác nhận' : 'I have read and acknowledge')}
    </button>
    {!connected && <p className="preview-caption" role="status">{vi ? 'Thông báo vẫn được kiểm tra định kỳ khi realtime mất kết nối.' : 'Required notices continue to sync while realtime reconnects.'}</p>}
  </dialog>;
}
