'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { courseError, translate, type Locale } from '../lib/courseApi';

type Snapshot = {
  streamLength: number;
  pending: number;
  lag: number | null;
  consumerCount: number;
  deadLetterLength: number;
  outboxPending: number;
  outboxExhausted: number;
  oldestPendingAgeSeconds: number | null;
  oldestExhaustedAgeSeconds: number | null;
};

export function RunnerQueueStatus({ locale }: { locale: Locale }) {
  const t = translate(locale), [data, setData] = useState<Snapshot | null>(null),
    [loading, setLoading] = useState(true), [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<Snapshot>('/admin/runner-queue/outbox-metrics'));
      setError('');
    } catch (problem) {
      setData(null);
      setError(courseError(problem, locale));
    } finally { setLoading(false); }
  }, [locale]);
  useEffect(() => { void load(); }, [load]);
  const value = (number: number | null) => number === null ? '—' : number.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US');
  return (
    <section className="panel runner-queue-status" aria-labelledby="runner-queue-heading">
      <div className="panel-heading"><div>
        <span className="eyebrow">{t('Transport status only', 'Chỉ trạng thái vận chuyển')}</span>
        <h2 id="runner-queue-heading">{t('Runner queue', 'Hàng đợi runner')}</h2>
        <p>{t('This queue never executes learner code. Metrics reveal counts and ages only; no payloads or consumer identities are shown.', 'Hàng đợi này không thực thi mã người học. Chỉ hiện số lượng và thời gian; không hiển thị payload hoặc danh tính consumer.')}</p>
      </div><button className="button secondary" disabled={loading} onClick={() => void load()}>{t('Refresh', 'Làm mới')}</button></div>
      {error ? <div className="service-note" role="status">{t('Queue metrics are disabled or unavailable. Current counts cannot be confirmed.', 'Metrics queue đang tắt hoặc không khả dụng. Chưa thể xác nhận số liệu hiện tại.')}</div> : loading ? <p role="status">{t('Loading queue metrics…', 'Đang tải metrics queue…')}</p> : data && <>
        <div className="runner-queue-grid">
          {[
            [t('Stream entries', 'Bản ghi stream'), data.streamLength],
            [t('Group pending', 'Đang chờ trong group'), data.pending],
            [t('Lag', 'Độ trễ'), data.lag],
            [t('Consumers', 'Consumer'), data.consumerCount],
            [t('Dead-letter metadata', 'Metadata dead-letter'), data.deadLetterLength],
            [t('Outbox pending', 'Outbox đang chờ'), data.outboxPending],
            [t('Outbox exhausted', 'Outbox hết lượt'), data.outboxExhausted],
            [t('Oldest pending (s)', 'Chờ lâu nhất (giây)'), data.oldestPendingAgeSeconds],
            [t('Oldest exhausted (s)', 'Hết lượt lâu nhất (giây)'), data.oldestExhaustedAgeSeconds],
          ].map(([label, number]) => <div className="runner-queue-metric" key={String(label)}><small>{label}</small><strong>{value(number as number | null)}</strong></div>)}
        </div>
        <p className="service-note">{t('Execution, profile activation, result callbacks, dashboards, and retention are not enabled.', 'Thực thi, kích hoạt profile, callback kết quả, dashboard và lưu trữ queue chưa được bật.')}</p>
      </>}
    </section>
  );
}
