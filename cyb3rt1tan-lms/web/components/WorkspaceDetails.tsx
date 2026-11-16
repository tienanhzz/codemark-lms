'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  copy,
  workspaceRole,
  canPreview,
  previewPage,
  type Locale,
  type Copy,
} from '../lib/workspaceCatalog';
import { Field } from './CourseShared';
export function WorkspaceDetails({
  id,
  locale,
  roles,
}: {
  id: string;
  locale: Locale;
  roles: string[];
}) {
  const role = workspaceRole(roles),
    [tab, setTab] = useState('overview'),
    [type, setType] = useState('Multiple choice'),
    [mode, setMode] = useState('any'),
    [zoom, setZoom] = useState(100);
  const detailPages = [
    'course-preview',
    'student-overview',
    'question-authoring',
    'taxonomy',
    'branding',
    'ranks',
    'assessment-builder',
    'notifications',
    'exam-monitor',
  ];
  if (!detailPages.includes(id)) return null;
  const courseTabs: readonly (readonly [string, string, string])[] =
    role === 'admin'
      ? [
          ['overview', 'Overview', 'Tổng quan'],
          ['module', 'Module details', 'Thông tin học phần'],
          ['staff', 'Staff & permissions', 'Staff & quyền'],
          ['enrollment', 'Enrollments', 'Ghi danh'],
          ['scheme', 'Grade scheme', 'Kế hoạch đánh giá'],
          ['integrations', 'Integrations', 'Tích hợp'],
          ['audit', 'Audit', 'Audit'],
        ]
      : role === 'staff'
        ? [
            ['overview', 'Overview', 'Tổng quan'],
            ['plan', 'Lesson plan', 'Kế hoạch bài dạy'],
            ['assessments', 'Assessments', 'Bài kiểm tra'],
            ['students', 'Students', 'Sinh viên'],
            ['settings', 'Settings', 'Cài đặt'],
          ]
        : [
            ['overview', 'Overview', 'Tổng quan'],
            ['plan', 'Lesson plan', 'Kế hoạch bài dạy'],
            ['practice', 'Practice', 'Luyện tập'],
            ['assessments', 'Assessments', 'Bài kiểm tra'],
            ['grades', 'Grades', 'Điểm'],
            ['leaderboard', 'Leaderboard', 'Bảng xếp hạng'],
          ];
  const studentTabs: readonly (readonly [string, string, string])[] = [
    ['overview', 'Overview', 'Tổng quan'],
    ['enrollment', 'Enrollments', 'Ghi danh'],
    ['attendance', 'Attendance', 'Điểm danh'],
    ['practice', 'Practice', 'Luyện tập'],
    ['assessments', 'Assessments', 'Bài kiểm tra'],
    ['activity', 'Recent activity', 'Hoạt động gần đây'],
  ];
  const tabs = id === 'course-preview' ? courseTabs : id === 'student-overview' ? studentTabs : [];
  const links: Record<string, string> = {
    plan: 'lesson-plans',
    assessments: 'assessments',
    practice: 'practice',
    grades: 'grades',
    leaderboard: 'leaderboard',
    students: 'students',
    enrollment: 'students',
    attendance: 'attendance',
    staff: 'roles-permissions',
    scheme: 'grade-scales',
    integrations: 'system-settings',
    audit: 'audit-retention',
    settings: 'courses',
    activity: 'activity',
  };
  const link = links[tab],
    linked = link && previewPage(link),
    allowed =
      link && (!linked ? ['activity', 'courses'].includes(link) : canPreview(linked, roles));
  const formats: Copy[] = [
    ['Code', 'Lập trình'],
    ['Writing', 'Bài viết'],
    ['Sentence rewriting', 'Viết lại câu'],
    ['Multiple choice', 'Trắc nghiệm một đáp án'],
    ['Multiple select', 'Trắc nghiệm nhiều đáp án'],
    ['Short answer', 'Trả lời ngắn'],
    ['Fill in the blank', 'Điền chỗ trống'],
    ['Matching', 'Ghép cặp'],
    ['Ordering', 'Sắp xếp'],
    ['True / False / Not Given', 'Đúng / Sai / Không có thông tin'],
    ['Reading set', 'Bộ câu hỏi đọc'],
    ['Listening set', 'Bộ câu hỏi nghe'],
  ];
  return (
    <section className="panel course-section">
      <span className="eyebrow">
        {copy(locale, ['INTERACTIVE INTERFACE SAMPLE', 'VÍ DỤ GIAO DIỆN TƯƠNG TÁC'])}
      </span>
      {tabs.length > 0 ? (
        <>
          <nav
            className="course-tabs"
            aria-label={copy(locale, ['Workspace detail tabs', 'Các tab chi tiết không gian'])}
          >
            {tabs.map(([key, en, vi]) => (
              <button
                key={key}
                aria-current={tab === key ? 'page' : undefined}
                onClick={() => setTab(key)}
              >
                {copy(locale, [en, vi])}
              </button>
            ))}
          </nav>
          <h3>
            {copy(locale, [
              tabs.find(([key]) => key === tab)![1],
              tabs.find(([key]) => key === tab)![2],
            ])}
          </h3>
          {id === 'student-overview' ? (
            <div className="role-kpis">
              {(
                [
                  [['Attendance', 'Điểm danh'], '8 / 10'],
                  [['Practice completed', 'Bài luyện tập hoàn thành'], '12'],
                  [['Published assessments', 'Bài đã công bố'], '2'],
                ] as const
              ).map(([label, value]) => (
                <div key={label[0]}>
                  <span>{copy(locale, label)}</span>
                  <strong>{value}</strong>
                  <small>
                    {copy(locale, [
                      'Synthetic summary · no official result',
                      'Tổng hợp minh họa · không phải kết quả chính thức',
                    ])}
                  </small>
                </div>
              ))}
            </div>
          ) : tab === 'overview' || tab === 'module' ? (
            <dl className="course-definition">
              {(
                [
                  [['Module Code', 'Mã học phần'], 'CS-SAMPLE'],
                  [
                    ['Module Name', 'Tên học phần'],
                    copy(locale, ['Programming foundations', 'Nền tảng lập trình']),
                  ],
                  [['Level', 'Trình độ'], '1'],
                  [['Unit of Credit', 'Số tín chỉ'], '3'],
                  [['Year', 'Năm'], '2026'],
                  [
                    ['Nature of Module', 'Tính chất học phần'],
                    copy(locale, ['Core · sample', 'Bắt buộc · minh họa']),
                  ],
                  [['Required Software/IDE', 'Phần mềm/IDE cần thiết'], 'Local editor'],
                  [
                    ['Teaching team', 'Đội ngũ giảng dạy'],
                    copy(locale, [
                      'Sample Teacher · No real contact data',
                      'Giảng viên minh họa · Không có liên hệ thật',
                    ]),
                  ],
                ] as const
              ).map(([label, value], i) => (
                <div key={i}>
                  <dt>{copy(locale, label)}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="service-note">
              {copy(locale, [
                'This detail is a UI sample. Authorized live course records remain in Courses; preview progress and identities are fictional.',
                'Chi tiết này là ví dụ giao diện. Dữ liệu khóa học thật được cấp quyền vẫn ở Khóa học; tiến độ và danh tính minh họa là hư cấu.',
              ])}
            </p>
          )}
          {allowed && (
            <Link className="button secondary course-more" href={'/' + link}>
              {copy(locale, ['Open related workspace', 'Mở không gian liên quan'])} →
            </Link>
          )}
        </>
      ) : null}
      {id === 'question-authoring' && (
        <>
          <h2>{copy(locale, ['Type-specific editor', 'Trình soạn theo loại câu hỏi'])}</h2>
          <Field label={copy(locale, ['Question format', 'Định dạng câu hỏi'])}>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {formats.map((f) => (
                <option key={f[0]} value={f[0]}>
                  {copy(locale, f)}
                </option>
              ))}
            </select>
          </Field>
          <div className="course-form-grid preview-editor-grid">
            <Field label={copy(locale, ['Prompt', 'Đề bài'])}>
              <textarea rows={4} maxLength={4000} />
            </Field>
            <Field label={copy(locale, ['Points', 'Điểm'])}>
              <input type="number" min={0} max={1000} defaultValue={10} />
            </Field>
            {type === 'Code' ? (
              <>
                <Field label={copy(locale, ['Language metadata', 'Metadata ngôn ngữ'])}>
                  <select>
                    <option>Python</option>
                    <option>Java</option>
                    <option>C</option>
                  </select>
                </Field>
                <p className="service-note">
                  {copy(locale, [
                    'Source collection can be designed here. Learner-code execution, runtime activation and test runs are disabled.',
                    'Có thể xem thiết kế thu thập mã tại đây. Thực thi mã người học, kích hoạt runtime và chạy test bị tắt.',
                  ])}
                </p>
              </>
            ) : type === 'Writing' ? (
              <>
                <Field label={copy(locale, ['Rubric criterion', 'Tiêu chí rubric'])}>
                  <input
                    maxLength={200}
                    defaultValue={copy(locale, ['Clarity of argument', 'Mức rõ ràng của lập luận'])}
                  />
                </Field>
                <Field label={copy(locale, ['Criterion points', 'Điểm tiêu chí'])}>
                  <input type="number" min={0} defaultValue={5} />
                </Field>
              </>
            ) : type === 'Listening set' ? (
              <>
                <Field label={copy(locale, ['Audio asset', 'Tài nguyên âm thanh'])}>
                  <input type="file" accept="audio/*" disabled />
                </Field>
                <Field label={copy(locale, ['Allowed plays', 'Số lượt nghe'])}>
                  <input type="number" min={1} max={10} defaultValue={2} />
                </Field>
                <small>
                  {copy(locale, [
                    'Protected upload and transcript access require the asset service.',
                    'Tải có bảo vệ và quyền transcript cần dịch vụ tài nguyên.',
                  ])}
                </small>
              </>
            ) : type === 'Reading set' ? (
              <Field label={copy(locale, ['Shared passage', 'Đoạn đọc chung'])}>
                <textarea rows={7} maxLength={10000} />
              </Field>
            ) : (
              <Field
                label={copy(locale, [
                  'Choices / accepted answers / pairs (one per line)',
                  'Lựa chọn / đáp án chấp nhận / cặp (mỗi dòng một mục)',
                ])}
              >
                <textarea rows={5} maxLength={4000} />
              </Field>
            )}
          </div>
          <p className="preview-caption">
            {copy(locale, [
              'Author-only preview fields. No answer key is fetched or sent, and no version is published.',
              'Trường soạn chỉ để xem trước. Không tải/gửi đáp án riêng và không công bố phiên bản.',
            ])}
          </p>
        </>
      )}
      {id === 'taxonomy' && (
        <>
          <h2>{copy(locale, ['Hierarchy & tag matching', 'Cây phân loại & khớp tag'])}</h2>
          <div className="course-form-grid">
            <div>
              <h3>{copy(locale, ['Categories', 'Danh mục'])}</h3>
              <ul>
                <li>
                  {copy(locale, ['Programming', 'Lập trình'])}
                  <ul>
                    <li>{copy(locale, ['Algorithms', 'Thuật toán'])}</li>
                    <li>{copy(locale, ['Data structures', 'Cấu trúc dữ liệu'])}</li>
                  </ul>
                </li>
              </ul>
            </div>
            <div>
              <Field label={copy(locale, ['Tag filter semantics', 'Cách lọc tag'])}>
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="any">
                    {copy(locale, ['Any selected tag', 'Có ít nhất một tag đã chọn'])}
                  </option>
                  <option value="all">
                    {copy(locale, ['All selected tags', 'Có tất cả tag đã chọn'])}
                  </option>
                </select>
              </Field>
              <p>
                {copy(
                  locale,
                  mode === 'any'
                    ? [
                        'Question matches at least one selected tag.',
                        'Câu hỏi khớp ít nhất một tag đã chọn.',
                      ]
                    : [
                        'Question must include every selected tag.',
                        'Câu hỏi phải có mọi tag đã chọn.',
                      ],
                )}
              </p>
            </div>
          </div>
        </>
      )}
      {id === 'branding' && (
        <>
          <h2>{copy(locale, ['Square logo preview', 'Xem trước logo vuông'])}</h2>
          <div className="course-form-grid">
            <div className="preview-logo">
              <i
                className="fa-solid fa-layer-group"
                style={{ transform: `scale(${zoom / 100})` }}
                aria-hidden="true"
              />
            </div>
            <div>
              <Field
                label={copy(locale, ['Crop zoom · sample only', 'Thu phóng crop · chỉ minh họa'])}
              >
                <input
                  type="range"
                  min={80}
                  max={150}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                />
              </Field>
              <Field
                label={copy(locale, ['Logo upload (not connected)', 'Tải logo (chưa kết nối)'])}
              >
                <input type="file" accept="image/png" disabled />
              </Field>
              <p>
                {copy(locale, [
                  '1:1 PNG validation and private upload are required before any replacement.',
                  'Phải kiểm tra PNG 1:1 và tải riêng tư trước khi thay logo thật.',
                ])}
              </p>
            </div>
          </div>
        </>
      )}
      {id === 'assessment-builder' && (
        <>
          <h2>
            {copy(locale, ['Question snapshot & grade plan', 'Chốt câu hỏi & kế hoạch điểm'])}
          </h2>
          <div className="course-form-grid">
            <Field label={copy(locale, ['Question version', 'Phiên bản câu hỏi'])}>
              <select>
                <option>Sequences · v1 · 10</option>
                <option>Writing · v2 · 20</option>
              </select>
            </Field>
            <Field label={copy(locale, ['Weight (%)', 'Trọng số (%)'])}>
              <input type="number" min={0} max={100} defaultValue={20} />
            </Field>
            <Field label={copy(locale, ['Open window', 'Cửa sổ mở'])}>
              <input type="datetime-local" />
            </Field>
            <Field label={copy(locale, ['Close window', 'Cửa sổ đóng'])}>
              <input type="datetime-local" />
            </Field>
          </div>
          <p>
            {copy(locale, [
              'Publication must validate question eligibility, total weights and frozen recipients. This sample cannot publish.',
              'Công bố phải kiểm tra câu hỏi hợp lệ, tổng trọng số và người nhận đã chốt. Ví dụ không thể công bố.',
            ])}
          </p>
        </>
      )}
      {id === 'ranks' && (
        <>
          <h2>{copy(locale, ['Two independent rank tracks', 'Hai nhánh hạng độc lập'])}</h2>
          <p>
            {copy(locale, [
              'Student academic-style tiers and staff League-style tiers are separate policies. No seasonal reset; EXP spending/deductions may lower rank.',
              'Bậc Student theo học thuật và bậc staff kiểu League là hai chính sách riêng. Không reset mùa; tiêu/trừ EXP có thể hạ hạng.',
            ])}
          </p>
        </>
      )}
      {id === 'notifications' && (
        <>
          <h2>{copy(locale, ['Acknowledgement & delivery', 'Xác nhận & phân phối'])}</h2>
          <p>
            {copy(locale, [
              'Emergency notices require acknowledgement and use in-app/popup delivery. Required security and academic notices cannot be opted out of.',
              'Thông báo khẩn cần xác nhận và dùng in-app/popup. Không thể từ chối thông báo bảo mật và học vụ bắt buộc.',
            ])}
          </p>
          <button className="button secondary" disabled>
            {copy(locale, ['Acknowledge (service unavailable)', 'Xác nhận (chưa có dịch vụ)'])}
          </button>
        </>
      )}
      {id === 'exam-monitor' && (
        <>
          <h2>{copy(locale, ['Incident actions', 'Thao tác sự cố'])}</h2>
          <p>
            {copy(locale, [
              'Inspect linked events and record a reason before any action. Signals alone are not proof. Resetting work must retain the original deadline and audit history.',
              'Xem sự kiện liên kết và ghi lý do trước khi thao tác. Tín hiệu không phải bằng chứng kết luận. Reset bài phải giữ deadline gốc và lịch sử audit.',
            ])}
          </p>
          <div className="preview-related">
            {(
              [
                ['Notify learner', 'Thông báo người học'],
                ['Adjust time', 'Điều chỉnh giờ'],
                ['Freeze work', 'Khóa bài'],
                ['Force submit', 'Buộc nộp'],
                ['Reset work', 'Reset bài'],
              ] as const
            ).map((label) => (
              <button key={label[0]} className="button secondary" disabled>
                {copy(locale, label)}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
