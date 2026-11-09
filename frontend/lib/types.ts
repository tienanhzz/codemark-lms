export type Role = "admin" | "teacher" | "ta" | "student";
export type CourseRole = Role | null;

export type User = {
  id: number;
  studentId: string;
  pendingCode: boolean;
  mustChangePassword: boolean;
  name: string;
  role: Role;
};

export type Meeting = {
  id: number;
  courseId: number;
  weekday: number;
  start: string;
  end: string;
  location: string;
};

export type Course = {
  id: number;
  code: string;
  title: string;
  description: string;
  ownerId: number;
  owner: User | null;
  term: string;
  startDate: string;
  endDate: string;
  published: boolean;
  role: CourseRole;
  meetings?: Meeting[];
  studentCount?: number;
  lessonCount?: number;
  assessmentCount?: number;
};

export type ScheduleMeeting = Meeting & {
  course: string;
  title: string;
  term: string;
  startDate: string;
  endDate: string;
};

export type Lesson = {
  id: number;
  courseId: number;
  title: string;
  content: string;
  position: number;
  tagIds: string[];
  published: boolean;
  createdAt: string;
};

export type Announcement = {
  id: number;
  courseId: number;
  title: string;
  body: string;
  author: User | null;
  createdAt: string;
};

export type DiscussionPost = {
  id: number;
  courseId: number;
  parentId: number | null;
  body: string;
  author: User | null;
  createdAt: string;
};

export type RosterEntry = {
  enrollmentId: number;
  user: User;
  courseRole: "teacher" | "ta" | "student";
  createdAt: string | null;
};

export type AttendanceRecord = {
  id: number;
  sessionId: number;
  user: User | null;
  ip: string;
  checkedInAt: string;
};

export type AttendanceSession = {
  id: number;
  courseId: number;
  opensAt: string;
  closesAt: string;
  subnet: string | null;
  active: boolean;
  token: string | null;
  checkedIn: number;
  records?: AttendanceRecord[];
  mine?: boolean;
};

export type LeaveRequest = {
  id: number;
  courseId: number;
  student: User | null;
  meetingId: number | null;
  reason: string;
  evidenceName: string | null;
  evidenceMime: string | null;
  evidenceSize: number | null;
  status: "pending" | "approved" | "rejected";
  decisionNote: string | null;
  decidedBy: User | null;
  decidedAt: string | null;
  createdAt: string;
};

export type TestCase = {
  id?: number;
  questionId?: number;
  input: string;
  expectedOutput: string;
  hidden: boolean;
  points: number;
  timeLimitMs?: number;
  memoryMb?: number;
};

export type Question = {
  id: number;
  assessmentId: number;
  prompt: string;
  kind: "mcq" | "short" | "code";
  language: string | null;
  options: string[];
  points: number;
  position: number;
  tagIds: string[];
  testCaseCount: number;
  answer?: string | null;
  testCases?: Array<{ input: string; expectedOutput: string; points: number }>;
};

export type Assessment = {
  id: number;
  courseId: number;
  title: string;
  description: string;
  kind: string;
  opensAt: string;
  closesAt: string;
  durationMinutes: number;
  maxAttempts: number;
  rankWeight: number;
  published: boolean;
  createdAt: string;
  role: CourseRole;
  ipAllowlist?: string[];
  questionCount?: number;
  attemptCount?: number;
  questions?: Question[];
  myAttempts?: Attempt[];
};

export type Attempt = {
  id: number;
  assessmentId: number;
  student: User | null;
  startedAt: string;
  deadline: string;
  submittedAt: string | null;
  status: "in_progress" | "submitted" | string;
  score: number | null;
  maxScore: number;
  currentQuestion: number | null;
  answers?: Record<string, string | null>;
  flaggedQuestions?: number[];
  assessment?: Assessment;
  questions?: Question[];
  serverTime?: string;
};

export type ProctorEvent = {
  id: number;
  attemptId: number;
  userId: number;
  kind: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

export type AuditEvent = {
  id: number;
  actorId: number | null;
  kind: string;
  detail: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
};

export type Stats = {
  users: Record<string, number>;
  courses: number;
  assessments: number;
  attempts: number;
  attendanceCheckins: number;
  pendingLeave: number;
  activeSessions: number;
  recentEvents: AuditEvent[];
};

export type Dashboard = {
  role: Role;
  courses: Course[];
  currentCourses: number;
  averageScore: number | null;
  upcomingAssessments: Array<{
    id: number;
    title: string;
    courseId: number;
    opensAt: string;
    closesAt: string;
    kind: string;
  }>;
  announcements: Announcement[];
  openAttendance: Array<{ id: number; courseId: number; closesAt: string }>;
  managedCourses: Course[];
  pendingLeave: number;
  weekStart: string;
};
