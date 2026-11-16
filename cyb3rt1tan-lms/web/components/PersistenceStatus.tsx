'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { PersistenceStatus as Status } from '../lib/contracts';
import { copy, type Locale } from '../lib/workspaceCatalog';
import { IdentityAlert } from './IdentityShared';
export function PersistenceStatus({ locale }: { locale: Locale }) {
  const [data, setData] = useState<Status | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  async function load() {
    setLoading(true);
    setError('');
    try {
      setData(await api<Status>('/admin/operations/persistence'));
    } catch {
      setData(null);
      setError(
        copy(locale, [
          'Persistence diagnostics could not be loaded. Check the API and your Admin session.',
          'Không tải được chẩn đoán persistence. Kiểm tra API và phiên Admin.',
        ]),
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="panel course-section">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">
            {copy(locale, ['LIVE PERSISTENCE DIAGNOSTICS', 'CHẨN ĐOÁN PERSISTENCE THẬT'])}
          </span>
          <h2>
            {copy(locale, [
              'PostgreSQL & transactional outbox',
              'PostgreSQL & transactional outbox',
            ])}
          </h2>
        </div>
        <button className="button secondary" disabled={loading} onClick={() => void load()}>
          {copy(locale, ['Refresh status', 'Tải lại trạng thái'])}
        </button>
      </div>
      <IdentityAlert text={error} />
      {loading ? (
        <p role="status">
          {copy(locale, ['Reading database status…', 'Đang đọc trạng thái database…'])}
        </p>
      ) : data ? (
        <>
          <dl className="course-definition">
            <div>
              <dt>{copy(locale, ['Database', 'Database'])}</dt>
              <dd>{data.database}</dd>
            </div>
            <div>
              <dt>{copy(locale, ['Environment', 'Môi trường'])}</dt>
              <dd>{data.environment}</dd>
            </div>
            <div>
              <dt>{copy(locale, ['Migration head', 'Migration hiện tại'])}</dt>
              <dd>
                {data.migrations.join(', ') ||
                  copy(locale, ['Untracked schema', 'Schema chưa được theo dõi'])}
              </dd>
            </div>
            <div>
              <dt>
                {copy(locale, ['Pool / maximum overflow', 'Pool / số kết nối bổ sung tối đa'])}
              </dt>
              <dd>
                {data.poolSize} / {data.maxOverflow}
              </dd>
            </div>
            <div>
              <dt>{copy(locale, ['Pool wait limit', 'Giới hạn chờ pool'])}</dt>
              <dd>{data.poolTimeoutSeconds}s</dd>
            </div>
            <div>
              <dt>{copy(locale, ['Oldest pending event', 'Sự kiện chờ lâu nhất'])}</dt>
              <dd>{data.oldestPendingSeconds === null ? '—' : `${data.oldestPendingSeconds}s`}</dd>
            </div>
          </dl>
          <div className="role-kpis">
            {(
              [
                ['pending', 'Pending', 'Đang chờ'],
                ['dispatched', 'Dispatched', 'Đã phân phối'],
                ['exhausted', 'Exhausted', 'Hết lượt thử'],
              ] as const
            ).map(([key, en, vi]) => (
              <div key={key}>
                <span>{copy(locale, [en, vi])}</span>
                <strong>{data[key]}</strong>
              </div>
            ))}
          </div>
          <p className="service-note">
            {copy(locale, [
              !data.dispatcherEnabled
                ? 'Database counts are live. The realtime dispatcher is disabled in this isolated test environment.'
                : data.realtimeConnected
                  ? 'Database counts are live. The dispatcher is active and the Redis realtime transport is connected; clients receive generic hints and reload authorized API data.'
                  : 'Database counts are live. The dispatcher is active, but Redis realtime is disconnected; audit events stay durable and retry, while clients use periodic inbox sync.',
              !data.dispatcherEnabled
                ? 'Số liệu database là thật. Dispatcher realtime tắt trong môi trường test cô lập này.'
                : data.realtimeConnected
                  ? 'Số liệu database là thật. Dispatcher đang chạy và Redis realtime đã kết nối; client nhận tín hiệu chung rồi tải lại dữ liệu qua API có phân quyền.'
                  : 'Số liệu database là thật. Dispatcher đang chạy nhưng Redis realtime chưa kết nối; audit event được giữ bền vững và thử lại, hộp thư tiếp tục đồng bộ định kỳ.',
            ])}
          </p>
          {!data.productionPrivilegesVerified && (
            <p className="preview-caption">
              {copy(locale, [
                'This environment has not passed production database-privilege acceptance. Local readiness does not establish a production release.',
                'Môi trường này chưa được nghiệm thu quyền database production. Readiness local không đồng nghĩa phát hành production.',
              ])}
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
