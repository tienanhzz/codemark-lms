'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  copy,
  canPreview,
  previewPages,
  type PreviewPage,
  type PreviewRow,
  type Locale,
} from '../lib/workspaceCatalog';
import { Modal, IdentityAlert } from './IdentityShared';
import { Field } from './CourseShared';
import { WorkspaceDetails } from './WorkspaceDetails';

export function PreviewNotice({ locale }: { locale: Locale }) {
  return (
    <div className="preview-notice" role="note">
      <i className="fa-solid fa-flask" aria-hidden="true" />
      <div>
        <strong>
          {copy(locale, [
            'Interface preview · sample data',
            'Giao diện xem trước · dữ liệu minh họa',
          ])}
        </strong>
        <p>
          {copy(locale, [
            'These fictional records demonstrate the interface. Preview interactions stay in memory; no submission, grade, message, upload or transaction is saved to the LMS.',
            'Các bản ghi hư cấu dùng để minh họa giao diện. Tương tác chỉ giữ trong bộ nhớ; không lưu bài nộp, điểm, tin nhắn, tệp hay giao dịch vào LMS.',
          ])}
        </p>
      </div>
    </div>
  );
}
export function WorkspacePreview({
  page,
  locale,
  roles,
}: {
  page: PreviewPage;
  locale: Locale;
  roles: string[];
}) {
  const [query, setQuery] = useState(''),
    [status, setStatus] = useState(''),
    [layout, setLayout] = useState<'table' | 'cards'>('table'),
    [selected, setSelected] = useState<PreviewRow | null>(null),
    [detailTab, setDetailTab] = useState('overview'),
    [form, setForm] = useState(false),
    [notice, setNotice] = useState(''),
    [reverse, setReverse] = useState(false),
    [review, setReview] = useState(false);
  if (!canPreview(page, roles))
    return (
      <div className="alert alert-error" role="alert">
        {copy(locale, [
          'This page is outside your workspace role.',
          'Trang này không thuộc vai trò không gian của bạn.',
        ])}
      </div>
    );
  const filtered = page.rows.filter(
    (row) =>
      `${copy(locale, row.name)} ${copy(locale, row.note)}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()) &&
      (!status || row.status[0] === status),
  );
  const rows = reverse ? [...filtered].reverse() : filtered;
  const liveLinks = new Set(['courses', 'settings', 'profile', 'security', 'activity']);
  const links = (page.links || []).filter(
    (id) => liveLinks.has(id) || previewPages.some((p) => p.id === id && canPreview(p, roles)),
  );
  return (
    <div className="identity-screen">
      <PreviewNotice locale={locale} />
      <IdentityAlert text={notice} success />
      <section className="panel">
        <div className="preview-toolbar">
          <label className="search-field">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <input
              aria-label={copy(locale, ['Search sample records', 'Tìm bản ghi minh họa'])}
              value={query}
              maxLength={200}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={copy(locale, ['Search by name or topic…', 'Tìm theo tên hoặc chủ đề…'])}
            />
          </label>
          <div className="preview-controls">
            <button className="button secondary" onClick={() => setReverse((v) => !v)}>
              {copy(locale, ['Reverse order', 'Đảo thứ tự'])}
            </button>
            <div
              className="preview-toggle"
              aria-label={copy(locale, ['Display mode', 'Chế độ hiển thị'])}
            >
              <button aria-pressed={layout === 'table'} onClick={() => setLayout('table')}>
                {copy(locale, ['Table', 'Bảng'])}
              </button>
              <button aria-pressed={layout === 'cards'} onClick={() => setLayout('cards')}>
                {copy(locale, ['Cards', 'Thẻ'])}
              </button>
            </div>
            {page.action && (
              <button
                className="button primary"
                onClick={() => {
                  setForm(true);
                  setNotice('');
                }}
              >
                {copy(locale, page.action)}
              </button>
            )}
          </div>
        </div>
        <div className="preview-status-tabs">
          <button aria-pressed={!status} onClick={() => setStatus('')}>
            {copy(locale, ['All', 'Tất cả'])} <small>{page.rows.length}</small>
          </button>
          {Array.from(new Set(page.rows.map((r) => r.status[0]))).map((value) => (
            <button key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>
              {copy(locale, page.rows.find((r) => r.status[0] === value)!.status)}
            </button>
          ))}
        </div>
        {!rows.length ? (
          <div className="course-zero">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <h2>
              {copy(locale, ['No matching sample records', 'Không có bản ghi minh họa phù hợp'])}
            </h2>
            <button
              className="button secondary"
              onClick={() => {
                setQuery('');
                setStatus('');
              }}
            >
              {copy(locale, ['Clear filters', 'Xóa bộ lọc'])}
            </button>
          </div>
        ) : layout === 'table' ? (
          <div className="table-scroll">
            <table className="identity-table">
              <thead>
                <tr>
                  {page.columns.map((c, i) => (
                    <th key={i}>{copy(locale, c)}</th>
                  ))}
                  <th>{copy(locale, ['Details', 'Chi tiết'])}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{copy(locale, row.name)}</strong>
                      <small>{copy(locale, row.note)}</small>
                    </td>
                    <td>
                      <span className="state-badge">{copy(locale, row.status)}</span>
                    </td>
                    <td>{row.value}</td>
                    <td>
                      <button
                        className="button secondary table-action"
                        onClick={() => {
                          setSelected(row);
                          setDetailTab('overview');
                        }}
                      >
                        {copy(locale, ['Open preview', 'Mở xem trước'])}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="preview-cards">
            {rows.map((row) => (
              <article key={row.id}>
                <span className="course-book">
                  <i className={`fa-solid ${page.icon}`} aria-hidden="true" />
                </span>
                <span className="state-badge">{copy(locale, row.status)}</span>
                <h3>{copy(locale, row.name)}</h3>
                <p>{copy(locale, row.note)}</p>
                <strong>{row.value}</strong>
                <button
                  className="text-link"
                  onClick={() => {
                    setSelected(row);
                    setDetailTab('overview');
                  }}
                >
                  {copy(locale, ['Open preview', 'Mở xem trước'])} →
                </button>
              </article>
            ))}
          </div>
        )}
        <div className="preview-table-footer">
          <span>
            {rows.length} / {page.rows.length}{' '}
            {copy(locale, ['sample records', 'bản ghi minh họa'])}
          </span>
          <span>{copy(locale, ['Memory only', 'Chỉ trong bộ nhớ'])}</span>
        </div>
      </section>
      {page.kind === 'report' && <PreviewChart locale={locale} />}
      <WorkspaceDetails id={page.id} locale={locale} roles={roles} />
      <PreviewWorkflow page={page} locale={locale} />
      {links.length > 0 && (
        <section className="panel course-section">
          <h2>{copy(locale, ['Related workspaces', 'Không gian liên quan'])}</h2>
          <div className="preview-related">
            {links.map((id) => (
              <Link key={id} className="button secondary" href={'/' + id}>
                {copy(
                  locale,
                  previewPages.find((p) => p.id === id)?.title ||
                    ([
                      id === 'courses' ? 'Courses' : id,
                      id === 'courses' ? 'Khóa học' : id,
                    ] as const),
                )}{' '}
                <i className="fa-solid fa-arrow-right" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      )}
      {selected && (
        <Modal
          title={copy(locale, selected.name)}
          onClose={() => {
            setSelected(null);
            setReview(false);
          }}
        >
          <PreviewNotice locale={locale} />
          <nav
            className="course-tabs"
            aria-label={copy(locale, ['Preview detail sections', 'Các phần chi tiết minh họa'])}
          >
            {[
              ['overview', 'Overview', 'Tổng quan'],
              ['history', 'History', 'Lịch sử'],
              ['access', 'Access', 'Quyền truy cập'],
            ].map(([id, en, vi]) => (
              <button
                key={id}
                aria-current={detailTab === id ? 'page' : undefined}
                onClick={() => setDetailTab(id)}
              >
                {copy(locale, [en, vi])}
              </button>
            ))}
          </nav>
          <div className="course-section">
            {detailTab === 'overview' ? (
              <>
                <span className="state-badge">{copy(locale, selected.status)}</span>
                <h3>{copy(locale, selected.note)}</h3>
                <p>{copy(locale, selected.detail)}</p>
                <dl className="course-definition">
                  <div>
                    <dt>{copy(locale, page.columns[2])}</dt>
                    <dd>{selected.value}</dd>
                  </div>
                  <div>
                    <dt>{copy(locale, ['Data source', 'Nguồn dữ liệu'])}</dt>
                    <dd>
                      {copy(locale, ['Fictional interface example', 'Ví dụ giao diện hư cấu'])}
                    </dd>
                  </div>
                </dl>
                {page.kind === 'assessment' && (
                  <button className="button secondary" onClick={() => setReview(true)}>
                    {copy(locale, ['Explore question workspace', 'Khám phá không gian câu hỏi'])}
                  </button>
                )}
                {page.kind === 'grading' && <RubricPreview locale={locale} />}
              </>
            ) : detailTab === 'history' ? (
              <ol className="preview-timeline">
                <li>
                  <strong>{copy(locale, ['Sample created', 'Tạo ví dụ'])}</strong>
                  <p>
                    {copy(locale, [
                      'A fictional record was prepared for this interface.',
                      'Chuẩn bị bản ghi hư cấu cho giao diện.',
                    ])}
                  </p>
                </li>
                <li>
                  <strong>
                    {copy(locale, ['Workflow unavailable', 'Nghiệp vụ chưa khả dụng'])}
                  </strong>
                  <p>
                    {copy(locale, [
                      'No server-side event or official audit record is created here.',
                      'Không tạo sự kiện trên máy chủ hoặc audit chính thức tại đây.',
                    ])}
                  </p>
                </li>
              </ol>
            ) : (
              <p className="service-note">
                {copy(locale, [
                  'This preview does not grant permissions. Live data is authorized by the service for each request; hiding controls is not authorization.',
                  'Xem trước không cấp quyền. Dịch vụ kiểm tra quyền trên từng request dữ liệu thật; ẩn nút không thay thế phân quyền.',
                ])}
              </p>
            )}
          </div>
          {review && (
            <Modal
              title={copy(locale, ['Sample question workspace', 'Không gian câu hỏi minh họa'])}
              onClose={() => setReview(false)}
            >
              <QuestionPreview locale={locale} />
            </Modal>
          )}
        </Modal>
      )}
      {form && (
        <Modal
          title={copy(locale, page.action || ['Preview form', 'Biểu mẫu xem trước'])}
          onClose={() => setForm(false)}
        >
          <form
            className="course-form"
            onSubmit={(e) => {
              e.preventDefault();
              setForm(false);
              setNotice(
                copy(locale, [
                  'Preview form validated locally. Nothing was saved or sent to the LMS.',
                  'Biểu mẫu đã được kiểm tra tại máy. Không lưu hoặc gửi gì vào LMS.',
                ]),
              );
            }}
          >
            <PreviewNotice locale={locale} />
            {(
              page.fields || [
                { name: ['Title', 'Tiêu đề'], required: true },
                { name: ['Description', 'Mô tả'], type: 'textarea' },
              ]
            ).map((field, index) => (
              <Field key={index} label={copy(locale, field.name)}>
                {field.type === 'textarea' ? (
                  <textarea required={field.required} rows={4} maxLength={2000} />
                ) : field.type === 'select' ? (
                  <select required={field.required}>
                    <option value="">{copy(locale, ['Choose an option', 'Chọn một mục'])}</option>
                    {field.options?.map((option) => (
                      <option key={option[0]} value={option[0]}>
                        {copy(locale, option)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type === 'number' ? 'number' : 'text'}
                    required={field.required}
                    maxLength={200}
                    min={0}
                  />
                )}
              </Field>
            ))}
            <div className="modal-actions">
              <button type="button" className="button secondary" onClick={() => setForm(false)}>
                {copy(locale, ['Cancel', 'Hủy'])}
              </button>
              <button className="button primary">
                {copy(locale, ['Validate preview', 'Kiểm tra biểu mẫu'])}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
function PreviewWorkflow({ page, locale }: { page: PreviewPage; locale: Locale }) {
  return (
    <section className="panel course-section preview-service-boundary">
      <div>
        <span className="course-book">
          <i className="fa-solid fa-lock" aria-hidden="true" />
        </span>
        <h2>{copy(locale, ['Live workflow not connected', 'Chưa kết nối nghiệp vụ thật'])}</h2>
      </div>
      <p>
        {copy(locale, [
          'Viewing and trying the interface is available. Publishing, submitting, grading, messaging, purchases and file uploads remain disabled until this service is implemented and verified.',
          'Bạn có thể xem và thử giao diện. Công bố, nộp bài, chấm điểm, gửi thông báo, mua hàng và tải tệp vẫn tắt cho đến khi dịch vụ tương ứng được triển khai và kiểm chứng.',
        ])}
      </p>
      <button className="button secondary" disabled aria-describedby={`boundary-${page.id}`}>
        {copy(locale, ['Live action unavailable', 'Chưa có thao tác thật'])}
      </button>
      <small id={`boundary-${page.id}`}>
        {copy(locale, ['No synthetic record is persisted.', 'Không lưu bản ghi minh họa.'])}
      </small>
    </section>
  );
}
export function PreviewChart({ locale }: { locale: Locale }) {
  return (
    <section className="panel course-section">
      <h2>{copy(locale, ['Activity trend · illustrative', 'Xu hướng hoạt động · minh họa'])}</h2>
      <figure
        className="preview-chart"
        aria-label={copy(locale, [
          'Sample weekly activity: 12, 18, 15, 26, 22, 31. Not real analytics.',
          'Hoạt động tuần minh họa: 12, 18, 15, 26, 22, 31. Không phải phân tích thật.',
        ])}
      >
        <div className="preview-bars">
          {[12, 18, 15, 26, 22, 31].map((value, i) => (
            <div key={i}>
              <span style={{ height: `${value * 4}px` }} />
              <strong>{value}</strong>
              <small>
                {copy(locale, ['Week', 'Tuần'])} {i + 1}
              </small>
            </div>
          ))}
        </div>
        <figcaption>
          {copy(locale, [
            'Fictional weekly totals for layout review.',
            'Tổng theo tuần hư cấu để xem bố cục.',
          ])}
        </figcaption>
      </figure>
    </section>
  );
}
function QuestionPreview({ locale }: { locale: Locale }) {
  const [answer, setAnswer] = useState(''),
    [flagged, setFlagged] = useState(false),
    [confirm, setConfirm] = useState(false);
  return (
    <div className="course-form">
      <PreviewNotice locale={locale} />
      <div className="preview-question-status">
        <span className="state-badge">1 / 3</span>
        <span>
          {copy(locale, ['No active timer · preview', 'Không có bộ đếm thật · xem trước'])}
        </span>
        <button
          className="button secondary"
          aria-pressed={flagged}
          onClick={() => setFlagged((v) => !v)}
        >
          {copy(
            locale,
            flagged
              ? ['Marked for review', 'Đã đánh dấu xem lại']
              : ['Mark for review', 'Đánh dấu xem lại'],
          )}
        </button>
      </div>
      <h3>
        {copy(locale, [
          'Which value is the next in the sequence 2, 4, 6, …?',
          'Giá trị tiếp theo trong dãy 2, 4, 6, … là gì?',
        ])}
      </h3>
      <fieldset className="preview-answer-options">
        <legend>{copy(locale, ['Choose one answer', 'Chọn một đáp án'])}</legend>
        {['7', '8', '9', '10'].map((value) => (
          <label key={value}>
            <input
              name="sample-answer"
              type="radio"
              checked={answer === value}
              onChange={() => setAnswer(value)}
            />
            {value}
          </label>
        ))}
      </fieldset>
      <p role="status">
        {copy(locale, [
          'Answers remain in this preview only; autosave is not connected.',
          'Đáp án chỉ ở màn hình xem trước; chưa kết nối tự động lưu.',
        ])}
      </p>
      <button className="button primary" onClick={() => setConfirm(true)}>
        {copy(locale, ['Preview submission summary', 'Xem tóm tắt nộp bài'])}
      </button>
      {confirm && (
        <div className="service-note" role="status">
          {copy(locale, ['Sample unanswered questions: ', 'Số câu chưa trả lời minh họa: '])}
          {answer ? 2 : 3}.{' '}
          {copy(locale, [
            'No attempt is started or submitted.',
            'Không bắt đầu hoặc nộp lượt làm thật.',
          ])}
        </div>
      )}
    </div>
  );
}
function RubricPreview({ locale }: { locale: Locale }) {
  const [criteria, setCriteria] = useState([true, false]);
  return (
    <fieldset className="course-entry-editor">
      <legend>{copy(locale, ['Sample rubric', 'Rubric minh họa'])}</legend>
      {[
        ['Clarity', 'Rõ ràng'],
        ['Evidence', 'Dẫn chứng'],
      ].map((value, index) => (
        <label key={index} className="checkbox-row">
          <input
            type="checkbox"
            checked={criteria[index]}
            onChange={(e) =>
              setCriteria((v) => v.map((old, i) => (i === index ? e.target.checked : old)))
            }
          />
          {copy(locale, value as [string, string])} · 5
        </label>
      ))}
      <strong>
        {copy(locale, ['Preview total', 'Tổng minh họa'])}: {criteria.filter(Boolean).length * 5} /
        10
      </strong>
      <small>
        {copy(locale, [
          'Changes do not modify or publish a grade.',
          'Thay đổi không sửa hoặc công bố điểm thật.',
        ])}
      </small>
    </fieldset>
  );
}
