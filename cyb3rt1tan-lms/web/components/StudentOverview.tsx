'use client';
import Link from 'next/link';
import type { Summary } from '../lib/api';
import { copy, type Locale } from '../lib/workspaceCatalog';
import { PreviewNotice } from './WorkspacePreview';
export function StudentOverview({ summary, locale }: { summary: Summary | null; locale: Locale }) {
  return (
    <div className="identity-screen student-overview">
      <section className="panel course-section">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">{copy(locale, ['YOUR LEARNING', 'VIỆC HỌC CỦA BẠN'])}</span>
            <h2>{copy(locale, ['Learning progress', 'Tiến độ học tập'])}</h2>
          </div>
          <Link className="text-link" href="/courses">
            {copy(locale, ['All courses', 'Tất cả khóa học'])} →
          </Link>
        </div>
        {summary?.courses.length ? (
          <div className="student-course-grid">
            {summary.courses.map((course) => (
              <Link key={course.id} href={'/courses?course=' + course.id}>
                <span className="course-book">
                  <i className="fa-solid fa-book-open" aria-hidden="true" />
                </span>
                <div>
                  <small>{course.courseCode}</small>
                  <h3>{course.title}</h3>
                  <p>
                    {copy(locale, [
                      'Open module, plan and schedule',
                      'Mở học phần, kế hoạch và lịch học',
                    ])}
                  </p>
                </div>
                <i className="fa-solid fa-arrow-right" aria-hidden="true" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="student-zero">
            <i className="fa-solid fa-seedling" aria-hidden="true" />
            <h3>
              {copy(locale, [
                'Your next learning chapter starts here',
                'Chặng học tập tiếp theo bắt đầu từ đây',
              ])}
            </h3>
            <p>
              {copy(locale, [
                'Active enrolled courses will appear here. No sample course is added to your account.',
                'Khóa học đã ghi danh và kích hoạt sẽ xuất hiện tại đây. Không thêm khóa học mẫu vào tài khoản.',
              ])}
            </p>
          </div>
        )}
        <p className="preview-caption">
          {copy(locale, [
            'Course access is live. Lesson completion tracking is not available yet.',
            'Quyền truy cập khóa học dùng dữ liệu thật. Theo dõi hoàn thành bài học chưa khả dụng.',
          ])}
        </p>
      </section>
      <div className="student-next-grid">
        <section className="panel course-section">
          <div className="panel-heading">
            <h2>{copy(locale, ['To-do', 'Việc cần làm'])}</h2>
            <i className="fa-regular fa-calendar-check" aria-hidden="true" />
          </div>
          <p>
            {copy(locale, [
              'Assessment deadlines and work in progress will be shown when delivery is connected.',
              'Hạn bài kiểm tra và công việc đang làm sẽ hiển thị khi dịch vụ bài làm được kết nối.',
            ])}
          </p>
          <Link className="button secondary" href="/assessments">
            {copy(locale, ['Explore assessment preview', 'Xem trước bài kiểm tra'])} →
          </Link>
        </section>
        <section className="panel course-section">
          <div className="panel-heading">
            <h2>{copy(locale, ['Published grades & feedback', 'Điểm đã công bố & phản hồi'])}</h2>
            <i className="fa-regular fa-comment-dots" aria-hidden="true" />
          </div>
          <p>
            {copy(locale, [
              'Only released results belong here. No official grade is available from the current service.',
              'Chỉ kết quả đã công bố mới xuất hiện ở đây. Dịch vụ hiện tại chưa cung cấp điểm chính thức.',
            ])}
          </p>
          <Link className="button secondary" href="/grades">
            {copy(locale, ['Explore results preview', 'Xem trước kết quả'])} →
          </Link>
        </section>
      </div>
      <PreviewNotice locale={locale} />
      <div className="student-quick-links">
        {[
          ['practice', 'fa-code', ['Practice library', 'Thư viện luyện tập']],
          ['calendar', 'fa-calendar-days', ['Study calendar', 'Lịch học']],
          ['attendance', 'fa-user-check', ['Attendance', 'Điểm danh']],
        ].map(([id, icon, label]) => (
          <Link className="panel" key={String(id)} href={'/' + id}>
            <i className={`fa-solid ${icon}`} aria-hidden="true" />
            <strong>{copy(locale, label as [string, string])}</strong>
            <span className="state-badge">{copy(locale, ['Preview', 'Xem trước'])}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
