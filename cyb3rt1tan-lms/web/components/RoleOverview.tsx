'use client';
import Link from 'next/link';
import type { Summary } from '../lib/api';
import { copy, type Locale } from '../lib/workspaceCatalog';
import { PreviewChart, PreviewNotice } from './WorkspacePreview';
export function RoleOverview({
  summary,
  locale,
  admin,
  activity,
}: {
  summary: Summary | null;
  locale: Locale;
  admin: boolean;
  activity: React.ReactNode;
}) {
  return (
    <div className="identity-screen">
      <section className="panel course-section">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">
              {copy(locale, ['LIVE WORKSPACE', 'KHÔNG GIAN DỮ LIỆU THẬT'])}
            </span>
            <h2>
              {copy(
                locale,
                admin
                  ? ['System overview', 'Tổng quan hệ thống']
                  : ['Teaching overview', 'Tổng quan giảng dạy'],
              )}
            </h2>
          </div>
          <Link href="/courses" className="text-link">
            {copy(locale, ['Manage courses', 'Quản lý khóa học'])} →
          </Link>
        </div>
        <div className="role-kpis">
          {admin && (
            <div>
              <span>{copy(locale, ['Active accounts', 'Tài khoản hoạt động'])}</span>
              <strong>{summary?.metrics.accounts || 0}</strong>
            </div>
          )}
          <div>
            <span>{copy(locale, ['Visible courses', 'Khóa học được phép xem'])}</span>
            <strong>{summary?.metrics.courses || 0}</strong>
          </div>
          <div>
            <span>{copy(locale, ['Assessment service', 'Dịch vụ đánh giá'])}</span>
            <strong>—</strong>
            <small>{copy(locale, ['Not connected', 'Chưa kết nối'])}</small>
          </div>
        </div>
        <div className="dashboard-course-list">
          {summary?.courses.map((c) => (
            <Link key={c.id} href={'/courses?course=' + c.id}>
              <span className="course-book">
                <i className="fa-solid fa-book-open" aria-hidden="true" />
              </span>
              <span>
                <small>{c.courseCode}</small>
                <strong>{c.title}</strong>
              </span>
              <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </Link>
          ))}
        </div>
        {!summary?.courses.length && (
          <p className="course-empty">
            {copy(locale, ['No visible courses yet.', 'Chưa có khóa học được phép xem.'])}
          </p>
        )}
      </section>
      <PreviewNotice locale={locale} />
      <div className="role-overview-grid">
        <section className="panel course-section">
          <div className="panel-heading">
            <h2>
              {copy(locale, ['Items requiring attention · sample', 'Việc cần chú ý · minh họa'])}
            </h2>
            <span className="state-badge">{copy(locale, ['Preview', 'Xem trước'])}</span>
          </div>
          <div className="role-attention-list">
            {(admin
              ? [
                  ['accounts', 'Review account access', 'Kiểm tra quyền tài khoản'],
                  ['operations', 'Review service readiness', 'Kiểm tra readiness dịch vụ'],
                  ['marketplace-disputes', 'Inspect sample disputes', 'Xem tranh chấp minh họa'],
                ]
              : [
                  ['grading', 'Review grading queue', 'Xem hàng đợi chấm'],
                  ['question-authoring', 'Continue question drafts', 'Tiếp tục soạn câu hỏi'],
                  ['students', 'Review sample learner progress', 'Xem tiến độ người học minh họa'],
                ]
            ).map(([id, en, vi]) => (
              <Link key={id} href={'/' + id}>
                <span>
                  {copy(locale, [en, vi])}
                  <small>
                    {copy(locale, [
                      'Navigation only · no consequential action',
                      'Chỉ điều hướng · không thực hiện thao tác nghiệp vụ',
                    ])}
                  </small>
                </span>
                <i className="fa-solid fa-arrow-right" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
        <section className="panel course-section">
          <h2>
            {copy(
              locale,
              admin
                ? ['Economy overview · sample', 'Tổng quan kinh tế · minh họa']
                : ['Course planning', 'Kế hoạch khóa học'],
            )}
          </h2>
          <p>
            {copy(
              locale,
              admin
                ? [
                    'EXP and Coin ledgers are not connected. Illustrative charts do not represent real balances.',
                    'Sổ cái EXP/Coin chưa kết nối. Biểu đồ minh họa không thể hiện số dư thật.',
                  ]
                : [
                    'Open a course to edit its real lesson plan and teaching schedule.',
                    'Mở khóa học để sửa kế hoạch và lịch giảng dạy thật.',
                  ],
            )}
          </p>
          <Link className="button secondary" href={admin ? '/economy' : '/courses'}>
            {copy(
              locale,
              admin
                ? ['Explore ledger preview', 'Xem trước sổ cái']
                : ['Open courses', 'Mở khóa học'],
            )}{' '}
            →
          </Link>
        </section>
      </div>
      <PreviewChart locale={locale} />
      <section className="panel">
        <div className="panel-heading">
          <h2>
            {copy(locale, ['Recent account activity · live', 'Hoạt động tài khoản gần đây · thật'])}
          </h2>
          <Link href="/activity" className="text-link">
            {copy(locale, ['View all', 'Xem tất cả'])} →
          </Link>
        </div>
        {activity}
      </section>
    </div>
  );
}
