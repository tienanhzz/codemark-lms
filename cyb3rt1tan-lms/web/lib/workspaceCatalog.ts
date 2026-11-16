export type Locale = 'en' | 'vi';
export type Copy = readonly [string, string];
export const copy = (locale: Locale, value: Copy): string => value[locale === 'vi' ? 1 : 0];
export type WorkspaceRole = 'student' | 'staff' | 'admin';
export type PreviewKind =
  | 'list'
  | 'assessment'
  | 'grading'
  | 'report'
  | 'monitor'
  | 'settings'
  | 'rank';
export type PreviewRow = {
  id: string;
  name: Copy;
  note: Copy;
  status: Copy;
  value: string;
  detail: Copy;
};
export type PreviewPage = {
  id: string;
  title: Copy;
  intro: Copy;
  group: 'learning' | 'teaching' | 'community' | 'administration' | 'account';
  roles: WorkspaceRole[];
  icon: string;
  kind: PreviewKind;
  columns: readonly [Copy, Copy, Copy];
  rows: PreviewRow[];
  action?: Copy;
  fields?: {
    name: Copy;
    type?: 'number' | 'textarea' | 'select';
    options?: Copy[];
    required?: boolean;
  }[];
  links?: string[];
};
const row = (
  id: string,
  name: Copy,
  note: Copy,
  status: Copy,
  value: string,
  detail: Copy,
): PreviewRow => ({ id, name, note, status, value, detail });
const learning: WorkspaceRole[] = ['student', 'staff', 'admin'];
export const previewPages: PreviewPage[] = [
  {
    id: 'practice',
    title: ['Practice library', 'Thư viện luyện tập'],
    intro: [
      'Explore questions by category, difficulty and completion.',
      'Khám phá câu hỏi theo danh mục, độ khó và mức hoàn thành.',
    ],
    group: 'learning',
    roles: learning,
    icon: 'fa-code',
    kind: 'list',
    columns: [
      ['Question', 'Câu hỏi'],
      ['Progress', 'Tiến độ'],
      ['Points', 'Điểm'],
    ],
    rows: [
      row(
        'p1',
        ['Working with sequences', 'Làm việc với dãy'],
        ['Algorithms · Newbie', 'Thuật toán · Newbie'],
        ['Not started', 'Chưa bắt đầu'],
        '10',
        [
          'Identify the next value in a sequence. Use the question workspace to inspect the prompt.',
          'Xác định giá trị tiếp theo trong dãy. Mở không gian câu hỏi để xem đề.',
        ],
      ),
      row(
        'p2',
        ['Choose a valid condition', 'Chọn điều kiện đúng'],
        ['Logic · Noob', 'Logic · Noob'],
        ['In progress', 'Đang làm'],
        '15',
        [
          'Select the condition that matches the illustrated rule.',
          'Chọn điều kiện khớp quy tắc minh họa.',
        ],
      ),
      row(
        'p3',
        ['Order the statements', 'Sắp xếp các câu lệnh'],
        ['Fundamentals · Newbie', 'Cơ bản · Newbie'],
        ['Completed', 'Đã hoàn thành'],
        '10',
        ['Put the operations in their logical order.', 'Sắp các thao tác theo thứ tự hợp lý.'],
      ),
    ],
    links: ['assessments', 'leaderboard'],
  },
  {
    id: 'assessments',
    title: ['Assessments', 'Bài kiểm tra'],
    intro: [
      'Review deadlines, instructions and your work in one place.',
      'Theo dõi hạn nộp, hướng dẫn và bài làm tại một nơi.',
    ],
    group: 'learning',
    roles: learning,
    icon: 'fa-clipboard-check',
    kind: 'assessment',
    columns: [
      ['Assessment', 'Bài kiểm tra'],
      ['State', 'Trạng thái'],
      ['Duration', 'Thời lượng'],
    ],
    rows: [
      row(
        'a1',
        ['Fundamentals checkpoint', 'Kiểm tra kiến thức cơ bản'],
        ['Sample course · Quiz', 'Khóa học minh họa · Quiz'],
        ['Open', 'Đang mở'],
        '20 min',
        [
          'Three objective questions. Review the rules before starting.',
          'Ba câu hỏi khách quan. Xem nội quy trước khi bắt đầu.',
        ],
      ),
      row(
        'a2',
        ['Short writing task', 'Bài viết ngắn'],
        ['Sample course · Assignment', 'Khóa học minh họa · Bài tập'],
        ['Draft', 'Bản nháp'],
        '—',
        [
          'A writing task with a manual rubric and an optional file attachment.',
          'Bài viết có rubric chấm thủ công và tệp đính kèm tùy chọn.',
        ],
      ),
      row(
        'a3',
        ['Module review', 'Ôn tập học phần'],
        ['Sample course · Exam', 'Khóa học minh họa · Thi'],
        ['Scheduled', 'Đã lên lịch'],
        '45 min',
        [
          'The official start window and per-student deadline are enforced by the delivery service when enabled.',
          'Dịch vụ bài thi sẽ kiểm soát cửa sổ mở và hạn của từng sinh viên khi được triển khai.',
        ],
      ),
    ],
    links: ['grades', 'calendar'],
  },
  {
    id: 'grades',
    title: ['Published grades', 'Điểm đã công bố'],
    intro: [
      'Review released results, rubric feedback and grade history.',
      'Xem kết quả đã công bố, phản hồi rubric và lịch sử điểm.',
    ],
    group: 'learning',
    roles: ['student', 'admin'],
    icon: 'fa-chart-simple',
    kind: 'grading',
    columns: [
      ['Assessment', 'Bài kiểm tra'],
      ['Publication', 'Công bố'],
      ['Result', 'Kết quả'],
    ],
    rows: [
      row(
        'g1',
        ['Fundamentals checkpoint', 'Kiểm tra kiến thức cơ bản'],
        ['Sample course · Objective quiz', 'Khóa học minh họa · Quiz khách quan'],
        ['Published', 'Đã công bố'],
        '8 / 10',
        [
          'Feedback: review boundary conditions. This result is synthetic and is not an official grade.',
          'Phản hồi: xem lại điều kiện biên. Kết quả này là minh họa, không phải điểm chính thức.',
        ],
      ),
      row(
        'g2',
        ['Short writing task', 'Bài viết ngắn'],
        ['Sample course · Manual rubric', 'Khóa học minh họa · Rubric thủ công'],
        ['Published', 'Đã công bố'],
        '16 / 20',
        [
          'Rubric: clarity 8/10, evidence 8/10. No identifying student record is used.',
          'Rubric: rõ ràng 8/10, dẫn chứng 8/10. Không dùng hồ sơ sinh viên thật.',
        ],
      ),
    ],
    links: ['assessments', 'reports'],
  },
  {
    id: 'attendance',
    title: ['Attendance', 'Điểm danh'],
    intro: [
      'Review teaching sessions, check-in state and excusal requests.',
      'Theo dõi buổi học, trạng thái điểm danh và đơn xin phép.',
    ],
    group: 'learning',
    roles: learning,
    icon: 'fa-user-check',
    kind: 'list',
    columns: [
      ['Session', 'Buổi học'],
      ['Attendance', 'Điểm danh'],
      ['Time', 'Thời gian'],
    ],
    rows: [
      row(
        'at1',
        ['Session 1 · Introduction', 'Buổi 1 · Giới thiệu'],
        ['Sample course · Room A', 'Khóa học minh họa · Phòng A'],
        ['Present', 'Có mặt'],
        '09:00',
        [
          'Checked in during the sample attendance window. No GPS is collected.',
          'Điểm danh trong cửa sổ minh họa. Không thu thập GPS.',
        ],
      ),
      row(
        'at2',
        ['Session 2 · Workshop', 'Buổi 2 · Thực hành'],
        ['Sample course · Room A', 'Khóa học minh họa · Phòng A'],
        ['Late', 'Đi muộn'],
        '09:12',
        [
          'Late grace and staff decisions will come from the attendance service.',
          'Khoảng cho phép đi muộn và quyết định của staff sẽ do dịch vụ điểm danh cung cấp.',
        ],
      ),
      row(
        'at3',
        ['Session 3 · Review', 'Buổi 3 · Ôn tập'],
        ['Sample course · Online', 'Khóa học minh họa · Trực tuyến'],
        ['Pending excusal', 'Chờ duyệt phép'],
        '09:00',
        [
          'The preview request does not send an excusal or notify staff.',
          'Đơn minh họa không gửi xin phép hoặc thông báo cho staff.',
        ],
      ),
    ],
    action: ['Preview excusal form', 'Xem form xin phép'],
    fields: [{ name: ['Reason', 'Lý do'], type: 'textarea', required: true }],
    links: ['calendar', 'courses'],
  },
  {
    id: 'calendar',
    title: ['Weekly timetable', 'Thời khóa biểu tuần'],
    intro: [
      'Plan your study week around sessions and due work.',
      'Sắp xếp tuần học theo lịch dạy và các hạn công việc.',
    ],
    group: 'learning',
    roles: learning,
    icon: 'fa-calendar-days',
    kind: 'list',
    columns: [
      ['Event', 'Sự kiện'],
      ['Category', 'Loại'],
      ['Time', 'Giờ'],
    ],
    rows: [
      row(
        'c1',
        ['Introduction session', 'Buổi giới thiệu'],
        ['Monday · Sample week', 'Thứ Hai · Tuần minh họa'],
        ['Teaching session', 'Buổi học'],
        '09:00',
        [
          'A sample scheduled session. Live course schedules remain available in the course workspace.',
          'Buổi học minh họa. Lịch thật vẫn ở không gian khóa học.',
        ],
      ),
      row(
        'c2',
        ['Checkpoint due', 'Hạn nộp bài kiểm tra'],
        ['Wednesday · Sample week', 'Thứ Tư · Tuần minh họa'],
        ['Deadline', 'Hạn nộp'],
        '17:00',
        [
          'The calendar preview does not change deadlines or start an attempt.',
          'Lịch minh họa không thay đổi hạn hoặc bắt đầu lượt làm.',
        ],
      ),
      row(
        'c3',
        ['Office hours', 'Giờ hỗ trợ'],
        ['Friday · Sample week', 'Thứ Sáu · Tuần minh họa'],
        ['Support', 'Hỗ trợ'],
        '14:00',
        [
          'Meet your teaching team during an approved support session.',
          'Gặp đội ngũ giảng dạy trong giờ hỗ trợ được bố trí.',
        ],
      ),
    ],
    links: ['courses', 'assessments'],
  },
  {
    id: 'notifications',
    title: ['Notifications', 'Thông báo'],
    intro: [
      'Keep track of learning updates and required acknowledgements.',
      'Theo dõi cập nhật học tập và các thông báo cần xác nhận.',
    ],
    group: 'account',
    roles: learning,
    icon: 'fa-bell',
    kind: 'list',
    columns: [
      ['Message', 'Thông báo'],
      ['Acknowledgement', 'Xác nhận'],
      ['Channel', 'Kênh'],
    ],
    rows: [
      row(
        'n1',
        ['Welcome to the workspace', 'Chào mừng đến không gian học tập'],
        ['Institution · Sample message', 'Đơn vị · Thông báo minh họa'],
        ['Unread', 'Chưa đọc'],
        'In-app',
        [
          'This sample notice illustrates the message detail. No recipient was contacted.',
          'Thông báo này minh họa phần chi tiết. Không gửi đến người nhận thật.',
        ],
      ),
      row(
        'n2',
        ['Schedule update', 'Cập nhật lịch học'],
        ['Sample course', 'Khóa học minh họa'],
        ['Required', 'Bắt buộc'],
        'In-app',
        [
          'Required acknowledgements will be recorded by the notification service.',
          'Xác nhận bắt buộc sẽ được dịch vụ thông báo ghi nhận.',
        ],
      ),
    ],
    links: ['notification-templates', 'settings'],
  },
];
const staff: WorkspaceRole[] = ['staff', 'admin'];
const admins: WorkspaceRole[] = ['admin'];
const commonFields: PreviewPage['fields'] = [
  { name: ['Title', 'Tiêu đề'], required: true },
  { name: ['Description', 'Mô tả'], type: 'textarea' },
];
const sampleRows = (
  names: Copy[],
  notes: Copy[],
  statuses: Copy[],
  values: string[],
  details: Copy,
): PreviewRow[] =>
  names.map((name, i) =>
    row(
      `sample-${i + 1}`,
      name,
      notes[i % notes.length],
      statuses[i % statuses.length],
      values[i % values.length],
      details,
    ),
  );
const courseNotes: Copy[] = [
  ['Sample course · Current term', 'Khóa học minh họa · Học kỳ hiện tại'],
];
previewPages.push(
  {
    id: 'course-preview',
    title: ['Course workspace preview', 'Xem trước không gian khóa học'],
    intro: [
      'Explore role-specific course tabs without changing a real course.',
      'Khám phá các tab theo vai trò mà không thay đổi khóa học thật.',
    ],
    group: 'learning',
    roles: learning,
    icon: 'fa-book-open-reader',
    kind: 'list',
    columns: [
      ['Course', 'Khóa học'],
      ['Status', 'Trạng thái'],
      ['Module', 'Học phần'],
    ],
    rows: sampleRows(
      [
        ['Programming foundations', 'Nền tảng lập trình'],
        ['Problem solving', 'Giải quyết vấn đề'],
      ],
      courseNotes,
      [['Active', 'Đang hoạt động']],
      ['CS-SAMPLE-1', 'CS-SAMPLE-2'],
      [
        'Fictional course workspace. Open live courses for authorized persisted data.',
        'Không gian khóa học hư cấu. Mở Khóa học để xem dữ liệu thật được cấp quyền.',
      ],
    ),
    links: ['courses', 'lesson-plans', 'assessments'],
  },
  {
    id: 'lesson-plans',
    title: ['Lesson plans', 'Kế hoạch bài dạy'],
    intro: [
      'Arrange weekly topics, learning outcomes and teaching sessions.',
      'Sắp xếp chủ đề theo tuần, kết quả học tập và buổi giảng dạy.',
    ],
    group: 'teaching',
    roles: staff,
    icon: 'fa-list-ol',
    kind: 'list',
    columns: [
      ['Plan', 'Kế hoạch'],
      ['Stage', 'Giai đoạn'],
      ['Weeks', 'Số tuần'],
    ],
    rows: sampleRows(
      [
        ['Programming foundations plan', 'Kế hoạch nền tảng lập trình'],
        ['Problem solving plan', 'Kế hoạch giải quyết vấn đề'],
      ],
      courseNotes,
      [
        ['Draft', 'Bản nháp'],
        ['Reviewed', 'Đã xem xét'],
      ],
      ['12', '10'],
      [
        'Weekly topics, reading and estimated study hours; live editing is available in authorized course detail.',
        'Chủ đề, tài liệu đọc và giờ học theo tuần; chỉnh sửa thật tại chi tiết khóa học được cấp quyền.',
      ],
    ),
    action: ['Preview plan entry', 'Xem form mục kế hoạch'],
    fields: [
      { name: ['Week', 'Tuần'], required: true },
      { name: ['Topic', 'Chủ đề'], required: true },
      { name: ['Learning outcomes', 'Kết quả học tập'], type: 'textarea' },
      { name: ['Estimated hours', 'Giờ dự kiến'], type: 'number' },
    ],
    links: ['courses', 'calendar', 'assessment-builder'],
  },
  {
    id: 'students',
    title: ['Students & roster', 'Sinh viên & danh sách lớp'],
    intro: [
      'Move between class progress and roster details.',
      'Chuyển giữa tiến độ lớp và danh sách sinh viên.',
    ],
    group: 'teaching',
    roles: staff,
    icon: 'fa-user-graduate',
    kind: 'report',
    columns: [
      ['Learner', 'Người học'],
      ['Enrollment', 'Ghi danh'],
      ['Progress', 'Tiến độ'],
    ],
    rows: sampleRows(
      [
        ['Sample learner A', 'Người học minh họa A'],
        ['Sample learner B', 'Người học minh họa B'],
        ['Sample learner C', 'Người học minh họa C'],
      ],
      courseNotes,
      [
        ['Active', 'Hoạt động'],
        ['Invited', 'Đã mời'],
      ],
      ['72%', '48%', '—'],
      [
        'Fictional learner data. Live roster data requires current course permission.',
        'Dữ liệu người học hư cấu. Danh sách lớp thật yêu cầu quyền khóa học hiện tại.',
      ],
    ),
    links: ['student-overview', 'attendance', 'reports', 'courses'],
  },
  {
    id: 'student-overview',
    title: ['Student Learning Overview', 'Tổng quan học tập sinh viên'],
    intro: [
      'Read course-scoped attendance, practice, assessments and learning history.',
      'Xem điểm danh, luyện tập, bài kiểm tra và lịch sử theo phạm vi khóa học.',
    ],
    group: 'teaching',
    roles: staff,
    icon: 'fa-address-card',
    kind: 'report',
    columns: [
      ['Course', 'Khóa học'],
      ['Enrollment', 'Ghi danh'],
      ['Result', 'Kết quả'],
    ],
    rows: sampleRows(
      [
        ['Programming foundations', 'Nền tảng lập trình'],
        ['Problem solving', 'Giải quyết vấn đề'],
      ],
      courseNotes,
      [
        ['Active', 'Hoạt động'],
        ['Completed', 'Hoàn thành'],
      ],
      ['8 / 10', '7 / 10'],
      [
        'A synthetic cross-course learning summary. Unpublished results and private notes remain permission restricted when connected.',
        'Tổng quan liên khóa học minh họa. Điểm chưa công bố và ghi chú riêng phải được phân quyền khi kết nối.',
      ],
    ),
    links: ['students', 'attendance', 'reports'],
  },
  {
    id: 'question-bank',
    title: ['Question bank', 'Ngân hàng câu hỏi'],
    intro: [
      'Find immutable question versions by type, category, tags and difficulty.',
      'Tìm phiên bản câu hỏi theo loại, danh mục, tag và độ khó.',
    ],
    group: 'teaching',
    roles: staff,
    icon: 'fa-layer-group',
    kind: 'list',
    columns: [
      ['Question', 'Câu hỏi'],
      ['Version state', 'Trạng thái phiên bản'],
      ['Type', 'Loại'],
    ],
    rows: sampleRows(
      [
        ['Sequences checkpoint', 'Kiểm tra dãy'],
        ['Explain a design choice', 'Giải thích lựa chọn thiết kế'],
        ['Order the operations', 'Sắp xếp thao tác'],
      ],
      courseNotes,
      [
        ['Published', 'Đã công bố'],
        ['Draft', 'Bản nháp'],
      ],
      ['Multiple choice', 'Writing', 'Ordering'],
      [
        'Only author-authorized users may see answer keys/reference solutions. These records contain no real private scoring data.',
        'Chỉ người có quyền soạn câu hỏi mới được xem đáp án/lời giải tham chiếu. Bản ghi này không chứa dữ liệu chấm riêng tư thật.',
      ],
    ),
    links: ['question-authoring', 'taxonomy', 'runtime-profiles'],
  },
  {
    id: 'question-authoring',
    title: ['Question authoring', 'Soạn câu hỏi'],
    intro: [
      'Review type-specific prompts, answer configuration and version publication.',
      'Xem cấu hình đề, đáp án theo loại và công bố phiên bản.',
    ],
    group: 'teaching',
    roles: staff,
    icon: 'fa-pen-to-square',
    kind: 'settings',
    columns: [
      ['Draft', 'Bản nháp'],
      ['Validation', 'Kiểm tra'],
      ['Version', 'Phiên bản'],
    ],
    rows: sampleRows(
      [
        ['Objective question draft', 'Bản nháp câu hỏi khách quan'],
        ['Writing rubric draft', 'Bản nháp rubric bài viết'],
      ],
      courseNotes,
      [['Needs validation', 'Cần kiểm tra']],
      ['v1', 'v2'],
      [
        'Local preview only. Publication, asset upload and student-code execution are disabled.',
        'Chỉ xem trước tại máy. Công bố, tải tài nguyên và chạy mã sinh viên đang tắt.',
      ],
    ),
    action: ['Preview question metadata', 'Xem form thông tin câu hỏi'],
    fields: [
      { name: ['Title', 'Tiêu đề'], required: true },
      { name: ['Category', 'Danh mục'], required: true },
      { name: ['Tags', 'Tags'] },
      {
        name: ['Difficulty', 'Độ khó'],
        type: 'select',
        options: [
          ['Newbie', 'Newbie'],
          ['Noob', 'Noob'],
          ['Wannabe', 'Wannabe'],
          ['Gatekeeper', 'Gatekeeper'],
          ['Legendary', 'Legendary'],
        ],
      },
    ],
    links: ['question-bank', 'assessment-builder'],
  },
  {
    id: 'assignments',
    title: ['Assignments', 'Bài tập'],
    intro: [
      'Organize practical work, due dates and grading progress.',
      'Quản lý bài thực hành, hạn nộp và tiến độ chấm.',
    ],
    group: 'teaching',
    roles: learning,
    icon: 'fa-file-pen',
    kind: 'assessment',
    columns: [
      ['Assignment', 'Bài tập'],
      ['Stage', 'Giai đoạn'],
      ['Weight', 'Trọng số'],
    ],
    rows: sampleRows(
      [
        ['Weekly problem set', 'Bài tập tuần'],
        ['Design explanation', 'Giải thích thiết kế'],
      ],
      courseNotes,
      [
        ['Open', 'Đang mở'],
        ['Grading', 'Đang chấm'],
      ],
      ['10%', '15%'],
      [
        'Sample assignment with versioned questions and explicit late policy. No work can be submitted here.',
        'Bài tập minh họa với phiên bản câu hỏi và chính sách nộp muộn rõ ràng. Không nộp bài thật ở đây.',
      ],
    ),
    links: ['assessments', 'assessment-builder', 'grading'],
  },
  {
    id: 'assessment-builder',
    title: ['Assessment builder', 'Soạn bài kiểm tra'],
    intro: [
      'Select frozen question versions, schedules, grading and late policy.',
      'Chọn phiên bản câu hỏi, lịch, cách chấm và chính sách nộp muộn.',
    ],
    group: 'teaching',
    roles: staff,
    icon: 'fa-wand-magic-sparkles',
    kind: 'settings',
    columns: [
      ['Assessment', 'Bài kiểm tra'],
      ['Stage', 'Giai đoạn'],
      ['Questions', 'Số câu'],
    ],
    rows: sampleRows(
      [
        ['Module checkpoint', 'Kiểm tra học phần'],
        ['End-of-module exam', 'Thi cuối học phần'],
      ],
      courseNotes,
      [
        ['Draft', 'Bản nháp'],
        ['Scheduled', 'Đã lên lịch'],
      ],
      ['8', '20'],
      [
        'Publishing must freeze recipients and question versions; this preview does not publish a snapshot.',
        'Công bố phải chốt người nhận và phiên bản câu hỏi; xem trước không công bố snapshot thật.',
      ],
    ),
    action: ['Preview assessment settings', 'Xem form cấu hình bài kiểm tra'],
    fields: [
      { name: ['Title', 'Tiêu đề'], required: true },
      { name: ['Duration (minutes)', 'Thời lượng (phút)'], type: 'number', required: true },
      { name: ['Late penalty (%)', 'Phạt nộp muộn (%)'], type: 'number' },
      { name: ['Instructions', 'Hướng dẫn'], type: 'textarea' },
    ],
    links: ['question-bank', 'assignments', 'exam-monitor'],
  },
  {
    id: 'grading',
    title: ['Grading queue', 'Hàng đợi chấm bài'],
    intro: [
      'Inspect submissions, apply rubrics and review publication readiness.',
      'Xem bài nộp, áp dụng rubric và kiểm tra điều kiện công bố.',
    ],
    group: 'teaching',
    roles: staff,
    icon: 'fa-marker',
    kind: 'grading',
    columns: [
      ['Submission', 'Bài nộp'],
      ['Grading state', 'Trạng thái chấm'],
      ['Score', 'Điểm'],
    ],
    rows: sampleRows(
      [
        ['Sample learner A · Writing', 'Người học A · Bài viết'],
        ['Sample learner B · Project', 'Người học B · Dự án'],
      ],
      courseNotes,
      [
        ['Awaiting grading', 'Chờ chấm'],
        ['Draft grade', 'Điểm nháp'],
      ],
      ['—', '8 / 10'],
      [
        'Synthetic submission. Rubric changes stay in memory; no result is published.',
        'Bài nộp hư cấu. Thay đổi rubric giữ trong bộ nhớ; không công bố kết quả.',
      ],
    ),
    links: ['students', 'assessments', 'reports'],
  },
  {
    id: 'exam-monitor',
    title: ['Exam monitor', 'Giám sát bài thi'],
    intro: [
      'Inspect observable signals and reasoned incident actions.',
      'Xem tín hiệu quan sát được và thao tác sự cố có lý do.',
    ],
    group: 'teaching',
    roles: staff,
    icon: 'fa-desktop',
    kind: 'monitor',
    columns: [
      ['Attempt', 'Lượt làm'],
      ['Connection', 'Kết nối'],
      ['Remaining', 'Còn lại'],
    ],
    rows: sampleRows(
      [
        ['Sample learner A', 'Người học minh họa A'],
        ['Sample learner B', 'Người học minh họa B'],
        ['Sample learner C', 'Người học minh họa C'],
      ],
      courseNotes,
      [
        ['Connected', 'Đang kết nối'],
        ['Signal observed', 'Có tín hiệu'],
        ['Reconnecting', 'Đang kết nối lại'],
      ],
      ['18 min', '16 min', '14 min'],
      [
        'Focus or connection signals are not proof of misconduct. No webcam, microphone or GPS is collected.',
        'Tín hiệu focus hoặc kết nối không chứng minh gian lận. Không thu webcam, micro hoặc GPS.',
      ],
    ),
    links: ['reports', 'assessment-builder'],
  },
  {
    id: 'reports',
    title: ['Reports & exports', 'Báo cáo & xuất dữ liệu'],
    intro: [
      'Explore scoped course, grading, attendance and learning reports.',
      'Xem báo cáo khóa học, chấm bài, điểm danh và học tập theo quyền.',
    ],
    group: 'teaching',
    roles: staff,
    icon: 'fa-chart-line',
    kind: 'report',
    columns: [
      ['Report', 'Báo cáo'],
      ['Job state', 'Trạng thái tác vụ'],
      ['Period', 'Kỳ báo cáo'],
    ],
    rows: sampleRows(
      [
        ['Learning progress', 'Tiến độ học tập'],
        ['Attendance summary', 'Tổng hợp điểm danh'],
        ['Grading progress', 'Tiến độ chấm'],
      ],
      courseNotes,
      [
        ['Ready', 'Sẵn sàng'],
        ['Queued', 'Đang chờ'],
      ],
      ['30 days', 'Current term', '30 days'],
      [
        'Report data and totals are fictional. CSV/XLSX downloads require fresh authorization when the reporting service is connected.',
        'Số liệu và tổng báo cáo là hư cấu. Tải CSV/XLSX cần kiểm tra quyền lại khi dịch vụ báo cáo được kết nối.',
      ],
    ),
    action: ['Preview report filters', 'Xem form lọc báo cáo'],
    fields: [
      { name: ['Course', 'Khóa học'], required: true },
      {
        name: ['Reporting period', 'Kỳ báo cáo'],
        type: 'select',
        options: [
          ['30 days', '30 ngày'],
          ['Current term', 'Học kỳ hiện tại'],
        ],
      },
      { name: ['Learner (optional)', 'Người học (tùy chọn)'] },
    ],
    links: ['student-overview', 'attendance'],
  },
  {
    id: 'leaderboard',
    title: ['Leaderboards', 'Bảng xếp hạng'],
    intro: [
      'Compare student and teacher EXP recorded in the ledger; equal EXP shares a rank.',
      'Xếp hạng sinh viên và giảng viên theo tổng EXP trong sổ điểm; bằng EXP thì đồng hạng.',
    ],
    group: 'community',
    roles: learning,
    icon: 'fa-ranking-star',
    kind: 'rank',
    columns: [
      ['Nickname', 'Biệt danh'],
      ['Track', 'Nhánh'],
      ['Practice score', 'Điểm luyện tập'],
    ],
    rows: sampleRows(
      [
        ['Sample Falcon', 'Chim Ưng minh họa'],
        ['Sample Otter', 'Rái Cá minh họa'],
        ['Sample Lynx', 'Linh Miêu minh họa'],
      ],
      [['No official identity is displayed', 'Không hiển thị danh tính chính thức']],
      [['Course practice', 'Luyện tập khóa học']],
      ['950', '880', '820'],
      [
        'Synthetic nickname/score only. Practice boards do not expose student ID or email.',
        'Chỉ biệt danh/điểm minh họa. Bảng luyện tập không lộ mã sinh viên hoặc email.',
      ],
    ),
    links: ['practice', 'achievements', 'ranks'],
  },
  {
    id: 'achievements',
    title: ['Achievements', 'Thành tích'],
    intro: [
      'Discover criteria, progress, rewards and equipped titles.',
      'Khám phá tiêu chí, tiến độ, phần thưởng và danh hiệu đang dùng.',
    ],
    group: 'community',
    roles: learning,
    icon: 'fa-medal',
    kind: 'rank',
    columns: [
      ['Achievement', 'Thành tích'],
      ['Progress', 'Tiến độ'],
      ['Reward', 'Phần thưởng'],
    ],
    rows: sampleRows(
      [
        ['First steps', 'Bước đầu tiên'],
        ['Consistent learner', 'Người học bền bỉ'],
        ['Practice champion', 'Nhà vô địch luyện tập'],
      ],
      [['Illustrative criteria and rewards', 'Tiêu chí và thưởng minh họa']],
      [
        ['Unlocked', 'Đã mở'],
        ['In progress', 'Đang thực hiện'],
        ['Locked', 'Chưa mở'],
      ],
      ['50 EXP', '100 EXP', 'Title'],
      [
        'Achievement examples do not grant EXP, Coin or an actual title.',
        'Ví dụ thành tích không cấp EXP, Coin hoặc danh hiệu thật.',
      ],
    ),
    links: ['ranks', 'inventory'],
  },
  {
    id: 'wallet',
    title: ['Wallet', 'Ví'],
    intro: ['View your server-calculated EXP and Coin balances and ledger history.', 'Xem số dư EXP, Coin và lịch sử giao dịch do máy chủ tính.'],
    group: 'community',
    roles: learning,
    icon: 'fa-wallet',
    kind: 'report',
    columns: [['Currency', 'Đơn vị'], ['Change', 'Biến động'], ['Source', 'Nguồn']],
    rows: sampleRows(
      [['Your wallet', 'Ví của bạn']],
      [['Live balances and ledger history are loaded from the authenticated wallet API.', 'Số dư và lịch sử được tải từ API ví đã xác thực.']],
      [['Connected', 'Đã kết nối']],
      ['EXP · Coin'],
      ['No sample balance is shown.', 'Không hiển thị số dư mẫu.'],
    ),
    links: ['ranks', 'shop', 'marketplace'],
  },
  {
    id: 'ranks',
    title: ['Ranks & progression', 'Hạng & tiến trình'],
    intro: [
      'Separate Student and staff EXP tracks, without seasons.',
      'Hai nhánh EXP Student và staff riêng, không có mùa.',
    ],
    group: 'community',
    roles: learning,
    icon: 'fa-arrow-trend-up',
    kind: 'rank',
    columns: [
      ['Tier', 'Bậc hạng'],
      ['Track', 'Nhánh'],
      ['Threshold', 'Ngưỡng'],
    ],
    rows: sampleRows(
      [
        ['Scholar · example', 'Học giả · minh họa'],
        ['Bronze · example', 'Bronze · minh họa'],
        ['Silver · example', 'Silver · minh họa'],
      ],
      [
        [
          'Thresholds are illustrative, not active policy',
          'Ngưỡng minh họa, không phải chính sách thật',
        ],
      ],
      [
        ['Student', 'Student'],
        ['Staff', 'Staff'],
      ],
      ['1,000 EXP', '500 EXP', '2,000 EXP'],
      [
        'No seasons. Spending or deducting EXP can lower rank; staff may also require role-specific tasks.',
        'Không có mùa. Tiêu hoặc trừ EXP có thể hạ hạng; staff có thể phải hoàn thành nhiệm vụ theo vai trò.',
      ],
    ),
    links: ['missions', 'achievements'],
  },
  {
    id: 'shop',
    title: ['Shop', 'Cửa hàng'],
    intro: [
      'Explore cosmetics and learning aids with transparent prices.',
      'Khám phá vật phẩm trang trí và hỗ trợ học tập với giá rõ ràng.',
    ],
    group: 'community',
    roles: learning,
    icon: 'fa-store',
    kind: 'list',
    columns: [
      ['Item', 'Vật phẩm'],
      ['Availability', 'Tình trạng'],
      ['Price', 'Giá'],
    ],
    rows: sampleRows(
      [
        ['Ocean frame', 'Khung Đại dương'],
        ['Study title', 'Danh hiệu học tập'],
        ['EXP multiplier · 8h', 'Nhân EXP · 8 giờ'],
      ],
      [['Sample item · No purchase is possible', 'Vật phẩm minh họa · Không thể mua thật']],
      [['Available', 'Có sẵn']],
      ['200 Coin', '500 Coin + 100 EXP', '300 Coin'],
      [
        'Prices and effects are illustrative. No wallet is charged and official grades cannot be modified by an item.',
        'Giá và hiệu ứng là minh họa. Không trừ ví và vật phẩm không thay đổi điểm học vụ.',
      ],
    ),
    links: ['inventory', 'marketplace'],
  },
  {
    id: 'inventory',
    title: ['Inventory', 'Kho vật phẩm'],
    intro: [
      'Review items, equipped titles and effect duration.',
      'Xem vật phẩm, danh hiệu đang dùng và thời hạn hiệu ứng.',
    ],
    group: 'community',
    roles: learning,
    icon: 'fa-box-open',
    kind: 'list',
    columns: [
      ['Item', 'Vật phẩm'],
      ['State', 'Trạng thái'],
      ['Quantity', 'Số lượng'],
    ],
    rows: sampleRows(
      [
        ['Ocean frame', 'Khung Đại dương'],
        ['Study title', 'Danh hiệu học tập'],
      ],
      [['Fictional inventory', 'Kho hư cấu']],
      [
        ['Equipped', 'Đang dùng'],
        ['Stored', 'Đang lưu'],
      ],
      ['1'],
      [
        'This sample inventory is not attached to your account.',
        'Kho minh họa không gắn với tài khoản của bạn.',
      ],
    ),
    links: ['shop', 'achievements'],
  },
  {
    id: 'marketplace',
    title: ['Marketplace', 'Chợ giao dịch'],
    intro: [
      'Inspect listings, escrow state and trade history.',
      'Xem tin đăng, trạng thái ký quỹ và lịch sử giao dịch.',
    ],
    group: 'community',
    roles: learning,
    icon: 'fa-handshake',
    kind: 'list',
    columns: [
      ['Listing', 'Tin đăng'],
      ['State', 'Trạng thái'],
      ['Price', 'Giá'],
    ],
    rows: sampleRows(
      [
        ['Ocean frame listing', 'Tin bán khung Đại dương'],
        ['Title offer', 'Đề nghị danh hiệu'],
      ],
      [['Anonymous sample seller', 'Người bán ẩn danh minh họa']],
      [
        ['Listed', 'Đang đăng'],
        ['Reserved', 'Đã giữ'],
      ],
      ['250 Coin', '600 Coin'],
      [
        'Escrow, fee and settlement actions are disabled in this preview.',
        'Ký quỹ, phí và quyết toán bị tắt trong bản xem trước.',
      ],
    ),
    links: ['inventory', 'marketplace-disputes'],
  },
  {
    id: 'staff-events',
    title: ['Course events', 'Sự kiện khóa học'],
    intro: [
      'Fund course prize reserves and approve event results.',
      'Ký quỹ giải thưởng khóa học và duyệt kết quả sự kiện.',
    ],
    group: 'community',
    roles: learning,
      icon: 'fa-calendar-days',
    kind: 'list',
    columns: [
      ['Event', 'Sự kiện'],
      ['Reserve', 'Quỹ thưởng'],
      ['Status', 'Trạng thái'],
    ],
    rows: [row('event-live', ['Live course event', 'Sự kiện khóa học'], ['Funded from staff wallet', 'Ký quỹ từ ví nhân sự'], ['Connected', 'Đã kết nối'], 'Coin reserve', ['Create, approve and refund staff event reserves.', 'Tạo, duyệt và hoàn quỹ sự kiện nhân sự.'])],
    links: ['courses', 'wallet', 'clans'],
  },
  {
    id: 'clans',
    title: ['Clans', 'Clan'],
    intro: [
      'Discover member roles, activity and shared events.',
      'Khám phá vai trò thành viên, hoạt động và sự kiện chung.',
    ],
    group: 'community',
    roles: learning,
    icon: 'fa-people-group',
    kind: 'list',
    columns: [
      ['Clan', 'Clan'],
      ['Recruitment', 'Tuyển thành viên'],
      ['Members', 'Thành viên'],
    ],
    rows: sampleRows(
      [
        ['Sample explorers', 'Nhà khám phá minh họa'],
        ['Sample builders', 'Người kiến tạo minh họa'],
      ],
      [['Fictional group', 'Nhóm hư cấu']],
      [
        ['Open', 'Đang mở'],
        ['Invitation', 'Theo lời mời'],
      ],
      ['12', '8'],
      [
        'Creation, membership and event payouts are disabled until the clan/economy service is available.',
        'Tạo nhóm, tham gia và trả thưởng sự kiện bị tắt đến khi có dịch vụ clan/economy.',
      ],
    ),
    links: ['achievements', 'notifications'],
  },
  {
    id: 'roles-permissions',
    title: ['Roles & permissions', 'Vai trò & phân quyền'],
    intro: [
      'Inspect fixed global roles and scoped course permissions.',
      'Xem vai trò cố định và quyền theo khóa học.',
    ],
    group: 'administration',
    roles: admins,
    icon: 'fa-key',
    kind: 'settings',
    columns: [
      ['Role', 'Vai trò'],
      ['Scope', 'Phạm vi'],
      ['Policy', 'Chính sách'],
    ],
    rows: sampleRows(
      [
        ['Student', 'Student'],
        ['Teaching Assistant', 'Trợ giảng'],
        ['Research Assistant', 'Trợ lý nghiên cứu'],
      ],
      [['Fixed system role · Not a custom role', 'Vai trò hệ thống cố định · Không tạo tùy ý']],
      [
        ['Self/course', 'Cá nhân/khóa học'],
        ['Granted course', 'Khóa học được cấp'],
        ['Anonymized only', 'Chỉ dữ liệu ẩn danh'],
      ],
      ['Default deny'],
      [
        'Live role changes are in Accounts and course detail. This policy preview cannot grant access.',
        'Đổi vai trò thật tại Tài khoản và chi tiết khóa học. Xem trước không cấp quyền.',
      ],
    ),
    links: ['courses'],
  },
  {
    id: 'taxonomy',
    title: ['Categories & tags', 'Danh mục & tags'],
    intro: [
      'Manage separate hierarchies, applicability and safe retirement.',
      'Quản lý cây riêng, phạm vi áp dụng và ngừng sử dụng an toàn.',
    ],
    group: 'administration',
    roles: admins,
    icon: 'fa-tags',
    kind: 'list',
    columns: [
      ['Entry', 'Mục'],
      ['Status', 'Trạng thái'],
      ['Type', 'Loại'],
    ],
    rows: sampleRows(
      [
        ['Programming', 'Lập trình'],
        ['Algorithms', 'Thuật toán'],
        ['Data structures', 'Cấu trúc dữ liệu'],
      ],
      [['Sample hierarchy entry', 'Mục cây minh họa']],
      [['Active', 'Hoạt động']],
      ['Category', 'Tag', 'Tag'],
      [
        'Category is navigation; tags may be attached to content. Parent changes must prevent cycles.',
        'Danh mục phục vụ điều hướng; tag có thể gắn nội dung. Đổi cha phải ngăn chu kỳ.',
      ],
    ),
    action: ['Preview taxonomy entry', 'Xem form mục phân loại'],
    fields: [
      { name: ['Stable ID', 'ID ổn định'], required: true },
      { name: ['English label', 'Nhãn tiếng Anh'], required: true },
      { name: ['Vietnamese label', 'Nhãn tiếng Việt'] },
      { name: ['Parent ID (optional)', 'ID cha (tùy chọn)'] },
    ],
    links: ['question-bank'],
  },
  {
    id: 'runtime-profiles',
    title: ['Runtime profiles', 'Cấu hình runtime'],
    intro: [
      'Review versioned metadata while execution remains disabled.',
      'Xem metadata có phiên bản; thực thi vẫn tắt.',
    ],
    group: 'administration',
    roles: admins,
    icon: 'fa-microchip',
    kind: 'settings',
    columns: [
      ['Profile', 'Cấu hình'],
      ['Lifecycle', 'Vòng đời'],
      ['Execution', 'Thực thi'],
    ],
    rows: sampleRows(
      [
        ['Python profile example', 'Ví dụ cấu hình Python'],
        ['Java profile example', 'Ví dụ cấu hình Java'],
      ],
      [['Metadata preview only', 'Chỉ metadata xem trước']],
      [['Draft', 'Bản nháp']],
      ['Disabled', 'Disabled'],
      [
        'No profile test, activation or learner-code execution can be performed here.',
        'Không chạy test cấu hình, kích hoạt hoặc thực thi mã người học tại đây.',
      ],
    ),
    links: ['question-bank'],
  },
  {
    id: 'assessment-types',
    title: ['Assessment types', 'Loại đánh giá'],
    intro: [
      'Configure assessment categories and descriptions.',
      'Cấu hình nhóm đánh giá và mô tả.',
    ],
    group: 'administration',
    roles: admins,
    icon: 'fa-clipboard-list',
    kind: 'settings',
    columns: [
      ['Type', 'Loại'],
      ['State', 'Trạng thái'],
      ['Usage', 'Sử dụng'],
    ],
    rows: sampleRows(
      [
        ['Internal assessment', 'Đánh giá nội bộ'],
        ['Final exam', 'Thi cuối kỳ'],
      ],
      [['Sample assessment category', 'Nhóm đánh giá minh họa']],
      [['Active', 'Hoạt động']],
      ['Module'],
      [
        'Assessment types are Admin-managed and selected by each module.',
        'Loại đánh giá do Admin quản lý và từng học phần lựa chọn.',
      ],
    ),
    action: ['Preview type form', 'Xem form loại đánh giá'],
    fields: commonFields,
    links: ['grade-scales', 'assessment-builder'],
  },
  {
    id: 'grade-scales',
    title: ['Grade scales & schemes', 'Thang điểm & kế hoạch đánh giá'],
    intro: [
      'Inspect weighted sums, conversion bands and publication checks.',
      'Xem tổng có trọng số, mức quy đổi và điều kiện công bố.',
    ],
    group: 'administration',
    roles: admins,
    icon: 'fa-scale-balanced',
    kind: 'settings',
    columns: [
      ['Scale', 'Thang điểm'],
      ['State', 'Trạng thái'],
      ['Range', 'Khoảng'],
    ],
    rows: sampleRows(
      [
        ['Ten-point scale', 'Thang điểm 10'],
        ['Letter grade conversion', 'Quy đổi điểm chữ'],
      ],
      [['Illustrative grade policy', 'Chính sách điểm minh họa']],
      [['Draft', 'Bản nháp']],
      ['0–10', 'A–F'],
      [
        'Published scheme weights must total 100%; no scale is activated here.',
        'Trọng số khi công bố phải tổng 100%; không kích hoạt thang điểm tại đây.',
      ],
    ),
    action: ['Preview scale band', 'Xem form mức điểm'],
    fields: [
      { name: ['Band label', 'Nhãn mức'], required: true },
      { name: ['Lower bound', 'Cận dưới'], type: 'number', required: true },
      { name: ['Upper bound', 'Cận trên'], type: 'number', required: true },
    ],
    links: ['reports'],
  },
  {
    id: 'missions',
    title: ['Missions & reward policies', 'Nhiệm vụ & chính sách thưởng'],
    intro: [
      'Review versioned daily/weekly missions and idempotent rewards.',
      'Xem nhiệm vụ ngày/tuần có phiên bản và thưởng chống lặp.',
    ],
    group: 'community',
    roles: learning,
    icon: 'fa-bullseye',
    kind: 'rank',
    columns: [
      ['Mission', 'Nhiệm vụ'],
      ['Cycle', 'Chu kỳ'],
      ['Reward', 'Thưởng'],
    ],
    rows: sampleRows(
      [
        ['Practice consistently', 'Luyện tập đều đặn'],
        ['Complete weekly learning', 'Hoàn thành học tập tuần'],
      ],
      [['Changes apply from the next cycle', 'Thay đổi áp dụng từ chu kỳ tiếp theo']],
      [
        ['Daily', 'Hàng ngày'],
        ['Weekly', 'Hàng tuần'],
      ],
      ['50 EXP', '100 Coin'],
      [
        'No balance is issued from this preview. Active progress retains its pinned mission version.',
        'Không phát hành số dư từ xem trước. Tiến độ đang chạy giữ phiên bản nhiệm vụ đã chốt.',
      ],
    ),
    action: ['Preview mission policy', 'Xem form chính sách nhiệm vụ'],
    fields: [
      { name: ['Mission name', 'Tên nhiệm vụ'], required: true },
      { name: ['EXP reward', 'Thưởng EXP'], type: 'number' },
      { name: ['Coin reward', 'Thưởng Coin'], type: 'number' },
    ],
    links: ['ranks', 'economy'],
  },
  {
    id: 'economy',
    title: ['Economy & ledgers', 'Kinh tế & sổ cái'],
    intro: [
      'Review issuance, spending, deductions and idempotent ledger history.',
      'Xem phát hành, chi tiêu, khấu trừ và lịch sử sổ cái chống lặp.',
    ],
    group: 'administration',
    roles: admins,
    icon: 'fa-coins',
    kind: 'report',
    columns: [
      ['Ledger entry', 'Bút toán'],
      ['Currency', 'Đơn vị'],
      ['Delta', 'Biến động'],
    ],
    rows: sampleRows(
      [
        ['Sample mission reward', 'Thưởng nhiệm vụ minh họa'],
        ['Sample shop purchase', 'Mua vật phẩm minh họa'],
        ['Sample correction', 'Điều chỉnh minh họa'],
      ],
      [['Fictional immutable ledger example', 'Ví dụ sổ cái bất biến hư cấu']],
      [
        ['EXP', 'EXP'],
        ['Coin', 'Coin'],
      ],
      ['+50', '−200', '−10'],
      [
        'Real balances must be derived from append-only, audited, idempotent transactions. No manual balance update is possible here.',
        'Số dư thật phải từ bút toán append-only, có audit và chống lặp. Không sửa số dư thủ công tại đây.',
      ],
    ),
    links: ['missions', 'shop-catalog', 'marketplace-disputes'],
  },
  {
    id: 'shop-catalog',
    title: ['Shop catalog', 'Danh mục cửa hàng'],
    intro: [
      'Review prices, roles, stock, durations and supported effects.',
      'Xem giá, vai trò, tồn kho, thời hạn và hiệu ứng hỗ trợ.',
    ],
    group: 'administration',
    roles: admins,
    icon: 'fa-boxes-stacked',
    kind: 'settings',
    columns: [
      ['Item', 'Vật phẩm'],
      ['Availability', 'Tình trạng'],
      ['Stock', 'Tồn kho'],
    ],
    rows: sampleRows(
      [
        ['Ocean frame', 'Khung Đại dương'],
        ['EXP voucher', 'Phiếu EXP'],
      ],
      [['Sample catalog item', 'Vật phẩm danh mục minh họa']],
      [['Draft', 'Bản nháp']],
      ['100', '50'],
      [
        'Only server-defined effects are supported; arbitrary scripts are never accepted.',
        'Chỉ dùng hiệu ứng do máy chủ định nghĩa; không nhận script tùy ý.',
      ],
    ),
    action: ['Preview catalog form', 'Xem form danh mục'],
    fields: [
      { name: ['Item name', 'Tên vật phẩm'], required: true },
      { name: ['Coin price', 'Giá Coin'], type: 'number' },
      { name: ['EXP price', 'Giá EXP'], type: 'number' },
      { name: ['Stock', 'Tồn kho'], type: 'number' },
    ],
    links: ['shop', 'economy'],
  },
  {
    id: 'marketplace-disputes',
    title: ['Marketplace disputes', 'Tranh chấp giao dịch'],
    intro: [
      'Inspect escrow evidence, reasons and reversible settlement decisions.',
      'Xem bằng chứng ký quỹ, lý do và quyết định giải quyết.',
    ],
    group: 'administration',
    roles: admins,
    icon: 'fa-gavel',
    kind: 'monitor',
    columns: [
      ['Case', 'Vụ việc'],
      ['State', 'Trạng thái'],
      ['Escrow', 'Ký quỹ'],
    ],
    rows: sampleRows(
      [
        ['Sample listing dispute', 'Tranh chấp tin đăng minh họa'],
        ['Sample offer review', 'Xem xét đề nghị minh họa'],
      ],
      [['No real buyer or seller', 'Không có người mua/bán thật']],
      [
        ['Under review', 'Đang xem xét'],
        ['Resolved', 'Đã giải quyết'],
      ],
      ['250 Coin', '400 Coin'],
      [
        'Refunds, freezes and settlement require audited server transactions and are disabled.',
        'Hoàn tiền, đóng băng và quyết toán cần giao dịch máy chủ có audit, hiện đang tắt.',
      ],
    ),
    links: ['marketplace', 'economy'],
  },
  {
    id: 'clan-admin',
    title: ['Clan administration', 'Quản trị clan'],
    intro: [
      'Review group policy, membership and funded events.',
      'Xem chính sách nhóm, thành viên và sự kiện có quỹ.',
    ],
    group: 'administration',
    roles: admins,
    icon: 'fa-flag',
    kind: 'settings',
    columns: [
      ['Clan', 'Clan'],
      ['State', 'Trạng thái'],
      ['Members', 'Thành viên'],
    ],
    rows: sampleRows(
      [
        ['Sample explorers', 'Nhà khám phá minh họa'],
        ['Sample builders', 'Người kiến tạo minh họa'],
      ],
      [['Fictional group', 'Nhóm hư cấu']],
      [['Active', 'Hoạt động']],
      ['12', '8'],
      [
        'Creating, renaming and membership actions require the clan service; no changes are made here.',
        'Tạo, đổi tên và thay đổi thành viên cần dịch vụ clan; không thay đổi tại đây.',
      ],
    ),
    links: ['clans', 'economy'],
  },
  {
    id: 'notification-templates',
    title: ['Notification templates', 'Mẫu thông báo'],
    intro: [
      'Review locale, channels and required acknowledgement policies.',
      'Xem ngôn ngữ, kênh và chính sách xác nhận bắt buộc.',
    ],
    group: 'administration',
    roles: admins,
    icon: 'fa-envelope-open-text',
    kind: 'settings',
    columns: [
      ['Template', 'Mẫu'],
      ['State', 'Trạng thái'],
      ['Channel', 'Kênh'],
    ],
    rows: sampleRows(
      [
        ['Assessment notice', 'Thông báo bài kiểm tra'],
        ['Emergency notice', 'Thông báo khẩn cấp'],
      ],
      [['Sample template · No delivery', 'Mẫu minh họa · Không gửi thật']],
      [['Draft', 'Bản nháp']],
      ['In-app / email', 'Popup / in-app'],
      [
        'Emergency notices use popup/in-app and require acknowledgement. No email is sent by this preview.',
        'Thông báo khẩn dùng popup/in-app và cần xác nhận. Xem trước không gửi email.',
      ],
    ),
    action: ['Preview template editor', 'Xem trình soạn mẫu'],
    fields: [
      { name: ['Subject', 'Tiêu đề'], required: true },
      { name: ['Message', 'Nội dung'], type: 'textarea', required: true },
    ],
    links: ['notifications'],
  },
  {
    id: 'branding',
    title: ['Branding & logo', 'Nhận diện & logo'],
    intro: [
      'Review institution identity and the square logo upload boundary.',
      'Xem nhận diện đơn vị và quy trình tải logo vuông.',
    ],
    group: 'administration',
    roles: admins,
    icon: 'fa-palette',
    kind: 'settings',
    columns: [
      ['Asset', 'Tài nguyên'],
      ['State', 'Trạng thái'],
      ['Format', 'Định dạng'],
    ],
    rows: sampleRows(
      [
        ['Institution logo', 'Logo đơn vị'],
        ['Workspace identity', 'Nhận diện không gian'],
      ],
      [['Local preview only', 'Chỉ xem trước tại máy']],
      [['Preview', 'Xem trước']],
      ['1:1 PNG', 'Text'],
      [
        'File selection/upload is disabled until type, size, crop and protected storage validation are implemented.',
        'Chọn/tải tệp bị tắt đến khi có kiểm tra loại, kích thước, crop và lưu trữ được bảo vệ.',
      ],
    ),
    links: ['settings', 'system-settings'],
  },
  {
    id: 'audit-retention',
    title: ['Audit & retention', 'Audit & lưu giữ'],
    intro: [
      'Inspect append-only events, correlation and retention/legal-hold policy.',
      'Xem sự kiện append-only, mã liên kết và chính sách lưu/giữ pháp lý.',
    ],
    group: 'administration',
    roles: admins,
    icon: 'fa-clock-rotate-left',
    kind: 'report',
    columns: [
      ['Event', 'Sự kiện'],
      ['Scope', 'Phạm vi'],
      ['Correlation', 'Liên kết'],
    ],
    rows: sampleRows(
      [
        ['Permission change example', 'Ví dụ thay quyền'],
        ['Report export example', 'Ví dụ xuất báo cáo'],
      ],
      [['Synthetic audit event, not a server log', 'Sự kiện audit hư cấu, không phải log máy chủ']],
      [
        ['Course', 'Khóa học'],
        ['Report', 'Báo cáo'],
      ],
      ['sample-001', 'sample-002'],
      [
        'Audit entries cannot be manually edited or deleted; retention/legal holds need audited jobs.',
        'Không sửa/xóa từng audit thủ công; lưu giữ/giữ pháp lý cần tác vụ có audit.',
      ],
    ),
    links: ['reports', 'operations'],
  },
  {
    id: 'system-settings',
    title: ['Global settings & feature flags', 'Cài đặt toàn cục & feature flags'],
    intro: [
      'Review scoped overrides, enabled modules and institutional defaults.',
      'Xem override theo phạm vi, module và mặc định đơn vị.',
    ],
    group: 'administration',
    roles: admins,
    icon: 'fa-sliders',
    kind: 'settings',
    columns: [
      ['Feature', 'Tính năng'],
      ['Configured state', 'Cấu hình'],
      ['Scope', 'Phạm vi'],
    ],
    rows: sampleRows(
      [
        ['Learner-code execution', 'Thực thi mã người học'],
        ['Marketplace', 'Chợ giao dịch'],
        ['Exam monitoring', 'Giám sát thi'],
      ],
      [['Illustrative configuration, not a live flag', 'Cấu hình minh họa, không phải flag thật']],
      [
        ['Disabled', 'Đã tắt'],
        ['Pending service', 'Chờ dịch vụ'],
      ],
      ['Global'],
      [
        'Changing a preview setting cannot enable execution or bypass permissions.',
        'Đổi cấu hình xem trước không bật thực thi hoặc vượt quyền.',
      ],
    ),
    links: ['operations', 'runtime-profiles', 'branding'],
  },
  {
    id: 'operations',
    title: ['System health', 'Sức khỏe hệ thống'],
    intro: [
      'Inspect service readiness and delivery infrastructure.',
      'Xem readiness dịch vụ và hạ tầng phân phối.',
    ],
    group: 'administration',
    roles: admins,
    icon: 'fa-heart-pulse',
    kind: 'settings',
    columns: [
      ['Service', 'Dịch vụ'],
      ['State', 'Trạng thái'],
      ['Authority', 'Vai trò'],
    ],
    rows: sampleRows(
      [
        ['Redis fan-out', 'Redis fan-out'],
        ['Realtime delivery', 'Phân phối realtime'],
        ['Background jobs', 'Tác vụ nền'],
      ],
      [['Not connected in this preview', 'Chưa kết nối trong bản xem trước']],
      [['Unavailable', 'Chưa khả dụng']],
      ['Infrastructure'],
      [
        'No green health status is fabricated. PostgreSQL remains the authoritative business store.',
        'Không tạo trạng thái khỏe giả. PostgreSQL vẫn là nguồn dữ liệu nghiệp vụ chính.',
      ],
    ),
    links: ['audit-retention', 'system-settings'],
  },
);
export function workspaceRole(roles: readonly string[]): WorkspaceRole | 'support' {
  return roles.includes('admin')
    ? 'admin'
    : roles.some((r) => ['teacher', 'teachingAssistant'].includes(r))
      ? 'staff'
      : roles.includes('student')
        ? 'student'
        : 'support';
}
export function previewPage(id: string): PreviewPage | undefined {
  return previewPages.find((p) => p.id === id);
}
export function canPreview(page: PreviewPage, roles: readonly string[]): boolean {
  if (page.id === 'notifications' && roles.length > 0) return true;
  return page.roles.some((role) =>
    role === 'admin'
      ? roles.includes('admin')
      : role === 'staff'
        ? roles.some((value) => ['teacher', 'teachingAssistant'].includes(value))
        : roles.includes('student'),
  );
}
