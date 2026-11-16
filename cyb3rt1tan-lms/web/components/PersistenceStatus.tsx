'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { PersistenceStatus as Status } from '../lib/contracts';
import { copy, type Locale } from '../lib/workspaceCatalog';
import { IdentityAlert } from './IdentityShared';

const releaseEvidence = [
  {
    title: ['Hosted CI and secret scan', 'CI trên GitHub và quét secrets'],
    detail: [
      'This screen is not connected to GitHub Actions results; review the latest workflow run before release.',
      'Màn hình chưa kết nối kết quả GitHub Actions; cần kiểm tra lần chạy workflow gần nhất trước khi phát hành.',
    ],
  },
  {
    title: ['ASVS security and privacy review', 'Rà soát bảo mật và quyền riêng tư theo ASVS'],
    detail: [
      'Record the reviewer, scope and findings in the release evidence before accepting this gate.',
      'Ghi nhận người rà soát, phạm vi và phát hiện vào hồ sơ phát hành trước khi nghiệm thu mục này.',
    ],
  },
  {
    title: ['Encrypted backup and restore drill', 'Backup mã hóa và diễn tập khôi phục'],
    detail: [
      'The local pre-migration backup is not a production backup or a verified restore drill.',
      'Backup trước migration trên máy local không thay thế backup production hay diễn tập khôi phục đã xác minh.',
    ],
  },
  {
    title: ['Runtime egress and service TLS', 'Egress runtime và TLS giữa dịch vụ'],
    detail: [
      'Database TLS settings do not prove that all production service links and outbound traffic are restricted.',
      'Cấu hình TLS database chưa chứng minh mọi liên kết dịch vụ và lưu lượng outbound production đều được giới hạn.',
    ],
  },
  {
    title: ['Key custody, rewrap and rotation', 'Quản lý khóa, rewrap và xoay khóa'],
    detail: [
      'A guarded rewrap utility is available, but it has not been run. Keep old keys until the rewrap and recovery drill are verified.',
      'Đã có công cụ rewrap có kiểm soát nhưng chưa chạy. Hãy giữ khóa cũ cho đến khi xác minh rewrap và diễn tập khôi phục.',
    ],
  },
  {
    title: ['Retention and release approval', 'Lưu giữ dữ liệu và duyệt phát hành'],
    detail: [
      'Retention, incident ownership and final release approval are not recorded in this runtime diagnostic.',
      'Chẩn đoán runtime này chưa ghi nhận thời hạn lưu giữ, người phụ trách sự cố hay phê duyệt phát hành cuối.',
    ],
  },
] as const;

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
          <section className="release-evidence" aria-labelledby="release-evidence-title">
            <div className="release-evidence-heading">
              <div>
                <span className="eyebrow">BUILD-033</span>
                <h3 id="release-evidence-title">
                  {copy(locale, ['Release evidence', 'Bằng chứng nghiệm thu phát hành'])}
                </h3>
              </div>
              <span className="release-evidence-state">
                {copy(locale, ['Release status unverified', 'Trạng thái phát hành chưa xác minh'])}
              </span>
            </div>
            <p className="service-note">
              {copy(locale, [
                'This runtime view cannot read GitHub Actions, backup catalogs or approval records. Each external gate remains unverified here; no green release status is inferred.',
                'Runtime này không đọc được GitHub Actions, danh mục backup hay hồ sơ phê duyệt. Các mục nghiệm thu bên ngoài vẫn chưa được xác minh tại đây; không suy đoán trạng thái phát hành đạt.',
              ])}
            </p>
            <ul className="release-evidence-grid">
              {releaseEvidence.map((item) => (
                <li className="release-evidence-card" key={item.title[0]}>
                  <div className="release-evidence-card-heading">
                    <h4>{copy(locale, item.title)}</h4>
                    <span>{copy(locale, ['Not verified here', 'Chưa xác minh tại đây'])}</span>
                  </div>
                  <p>{copy(locale, item.detail)}</p>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </section>
  );
}
