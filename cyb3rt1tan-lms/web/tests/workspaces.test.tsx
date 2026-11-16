import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Workspace } from '../components/Workspace';
import { WorkspacePreview } from '../components/WorkspacePreview';
import { PersistenceStatus } from '../components/PersistenceStatus';
import { RunnerQueueStatus } from '../components/RunnerQueueStatus';
import { AssessmentBuilder } from '../components/AssessmentBuilder';
import { AssessmentWorkspace } from '../components/AssessmentWorkspace';
import { PracticeWorkspace } from '../components/PracticeWorkspace';
import { AttendanceWorkspace } from '../components/AttendanceWorkspace';
import { LearningOverviewWorkspace } from '../components/LearningOverviewWorkspace';
import { ReportsWorkspace } from '../components/ReportsWorkspace';
import { AuditWorkspace } from '../components/AuditWorkspace';
import { WalletWorkspace } from '../components/WalletWorkspace';
import { RanksWorkspace } from '../components/RanksWorkspace';
import { MissionsWorkspace } from '../components/MissionsWorkspace';
import { AchievementsWorkspace } from '../components/AchievementsWorkspace';
import { previewPages, canPreview } from '../lib/workspaceCatalog';
const transport = vi.hoisted(() => ({ api: vi.fn(), push: vi.fn(), download: vi.fn().mockResolvedValue(new Blob(['report'])) }));
vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  api: transport.api,
  apiDownload: transport.download,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: transport.push }) }));
function serve(roles: string[]) {
  transport.api.mockImplementation(async (path: string) => {
    if (path === '/me')
      return {
        id: 'student',
        username: 'learner',
        officialName: 'Example Learner',
        email: 'example@example.test',
        roles,
      };
    if (path === '/me/preferences')
      return { locale: 'en', theme: 'light', colorPalette: 'navy-cyan-gold', timeZone: 'UTC' };
    if (path === '/workspace/summary')
      return {
        build: 'test',
        courses: [],
        activity: [],
        isAdmin: roles.includes('admin'),
        metrics: { courses: 0, assessments: 0, accounts: 1 },
      };
    if (path === '/courses?pageSize=100') return { items: [] };
    if (path.startsWith('/learning-overview/me?')) return { period: { fromAt: '', toAt: '' }, items: [] };
    throw new Error('Unexpected ' + path);
  });
}
describe('Workspace shell and clearly isolated previews', () => {
  it('creates and downloads a scoped progress report', async () => {
    const user = userEvent.setup();
    transport.api.mockImplementation(async (path: string, method?: string) => {
      if (path === '/courses?pageSize=100') return { items: [{ id: 'course-1', courseCode: 'CS101', title: 'Algorithms', permissions: ['roster.read'] }] };
      if (path === '/courses/course-1/enrollments?status=active&pageSize=100') return { items: [{ id: 'student-1', officialName: 'Example Student' }] };
      if (path === '/reports' && method === 'POST') return { id: 'report-1', kind: 'studentProgress', format: 'csv', rowCount: 1, expiresAt: '2026-11-15T12:00:00Z', downloadPath: '/v1/reports/report-1/download' };
      if (path === '/reports') return { items: [] };
      throw new Error(`Unexpected ${method} ${path}`);
    });
    render(<ReportsWorkspace locale="en" roles={['teacher']} />);
    await screen.findByText('Create & download report');
    await user.type(screen.getByLabelText(/Purpose/), 'Review student reports');
    await user.click(screen.getByRole('button', { name: 'Create & download report' }));
    await screen.findByText('Download authorized and logged.');
    expect(transport.api).toHaveBeenCalledWith('/reports', 'POST', expect.objectContaining({ kind: 'studentProgress', courseId: 'course-1', reason: 'Review student reports' }));
    expect(transport.download).toHaveBeenCalledWith('/reports/report-1/download');
  });
  it('searches the authorized audit view through the live API', async () => {
    transport.api.mockImplementation(async (path: string) => {
      if (path.startsWith('/admin/audit-events?')) return { items: [{ id: 'event-1', actorId: 'admin-1', action: 'course_created', createdAt: '2026-11-15T12:00:00Z', requestId: 'request-1', detail: { reason: 'Approved' }, ipMatched: false }], nextCursor: null };
      throw new Error('Unexpected ' + path);
    });
    render(<AuditWorkspace locale="en" />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('course_created');
    expect(screen.getByText('request-1')).toBeTruthy();
  });
  it('renders a privacy-filtered student learning overview from the API', async () => {
    transport.api.mockImplementation(async (path: string) => {
      if (path === '/courses?pageSize=100') return { items: [{ id: 'course-1', courseCode: 'CS101', title: 'Algorithms', permissions: ['course.read'] }] };
      if (path === '/courses/course-1/lesson-progress/me') return { courseId: 'course-1', total: 0, completed: 0, entries: [] };
      if (path.startsWith('/learning-overview/me?')) return { period: { fromAt: '2026-11-01T00:00:00Z', toAt: '2026-11-15T00:00:00Z' }, items: [{
        courseId: 'course-1', courseCode: 'CS101', courseTitle: 'Algorithms', membership: { status: 'active', joinedAt: null, endedAt: null },
        attendance: { availability: 'available', eligibleSessions: 1, counts: { present: 1, late: 0, absent: 0, excused: 0, unrecorded: 0 }, attendanceRate: 100, sessions: [] },
        practice: { totalAttempts: 2, uniqueQuestions: 1, completions: 2, passes: 1, accuracy: 50 },
        lessonProgress: { availability: 'available', total: 0, completed: 0, completionRate: null }, assessments: { assigned: 1, started: 1, submitted: 1, graded: 1, pendingGrading: 0, missingOrOverdue: 0 },
        lastActivityAt: '2026-11-14T12:00:00Z', recentActivity: [],
      }] };
      throw new Error('Unexpected ' + path);
    });
    render(<LearningOverviewWorkspace locale="en" roles={['student']} />);
    await screen.findByRole('heading', { name: /CS101.*Algorithms/ });
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByText('0 / 0')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });
  it('renders the server-calculated wallet and immutable ledger', async () => {
    transport.api.mockImplementation(async (path: string) => {
      if (path === '/me/wallet') return { exp: 1200, coin: 30, ranks: [{ track: 'student', exp: 1200, policyVersion: 1, current: { key: 'scholar', name: 'Scholar', thresholdExp: 1000, icon: 'fa-star', color: '#176b87', description: '' }, next: { key: 'expert', name: 'Expert', thresholdExp: 2000, icon: 'fa-star', color: '#176b87', description: '' }, progressPercent: 20 }] };
      if (path === '/me/ledger?pageSize=50') return { items: [{ id: 'ledger-1', currency: 'exp', delta: 100, source: 'practice', reason: 'Correct answer', createdAt: '2026-11-15T12:00:00Z' }], nextCursor: null };
      throw new Error('Unexpected ' + path);
    });
    render(<WalletWorkspace locale="en" />);
    await screen.findByText('1,200 EXP');
    expect(screen.getByText('30 Coin')).toBeTruthy();
    expect(screen.getByText('Scholar')).toBeTruthy();
    expect(screen.getByText('Correct answer')).toBeTruthy();
    expect(transport.api).toHaveBeenCalledWith('/me/wallet');
    expect(transport.api).toHaveBeenCalledWith('/me/ledger?pageSize=50');
  });
  it('connects the Admin rank policy editor to versioned APIs', async () => {
    const user = userEvent.setup();
    transport.api.mockImplementation(async (path: string, method?: string) => {
      if (path === '/me/wallet') return { exp: 0, coin: 0, ranks: [{ track: 'student', exp: 0, policyVersion: null, current: null, next: null, progressPercent: null }] };
      if (path === '/admin/rank-policies' && method === 'POST') return { id: 'policy-2', track: 'student', version: 2, status: 'draft', effectiveAt: null, tiers: [] };
      if (path === '/admin/rank-policies') return { items: [{ id: 'policy-1', track: 'student', version: 1, status: 'active', effectiveAt: '2026-11-15T12:00:00Z', tiers: [{ key: 'starter', name: 'Starter', thresholdExp: 0, icon: 'fa-star', color: '#176b87', description: '', position: 0 }] }] };
      if (path === '/admin/rank-task-requests?status=pending') return { items: [] };
      throw new Error(`Unexpected ${method} ${path}`);
    });
    render(<RanksWorkspace locale="en" roles={['admin']} />);
    await screen.findByText('Student · v1');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText(/Draft policy created/);
    expect(transport.api).toHaveBeenCalledWith('/admin/rank-policies', 'POST', expect.objectContaining({ track: 'student', tiers: expect.arrayContaining([expect.objectContaining({ tierKey: 'starter', thresholdExp: 0 })]) }));
  });
  it('shows trusted mission progress and claims only an eligible one-time reward', async () => {
    const user = userEvent.setup();
    transport.api.mockImplementation(async (path: string, method?: string) => {
      if (path === '/me/missions') return { items: [
        { missionId: 'practice-daily', version: 1, title: 'Practice twice', eventKey: 'practice.attempt', targetCount: 2, cadence: 'daily', timeZone: 'Asia/Bangkok', eligibleRoles: ['student'], reward: { exp: 40, coin: 0 }, progress: 2, status: 'claimed', canClaim: false },
        { missionId: 'first-correct', version: 1, title: 'First correct answer', eventKey: 'practice.correct', targetCount: 1, cadence: 'once', timeZone: 'Asia/Bangkok', eligibleRoles: ['student'], reward: { exp: 100, coin: 0 }, progress: 1, status: 'complete', canClaim: true },
      ] };
      if (path === '/missions/first-correct/claims' && method === 'POST') return { missionId: 'first-correct', exp: 100, coin: 0, replayed: false };
      throw new Error(`Unexpected ${method} ${path}`);
    });
    render(<MissionsWorkspace locale="en" roles={['student']} />);
    await screen.findByText('Practice twice');
    expect(screen.getByText('2 / 2 · practice.attempt')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Claim reward' }));
    await screen.findByText('Reward claimed and added to your wallet.');
    expect(transport.api).toHaveBeenCalledWith('/missions/first-correct/claims', 'POST', undefined, expect.objectContaining({ 'Idempotency-Key': expect.any(String) }));
  });
  it('connects unlocked achievement titles to the account title slot', async () => {
    const user = userEvent.setup();
    transport.api.mockImplementation(async (path: string, method?: string) => {
      if (path === '/me/achievements') return { items: [{ achievementId: 'first-correct', version: 1, title: 'First correct', description: 'Get an answer right.', eventKey: 'practice.correct', status: 'active', progress: 1, tiers: [{ tierKey: 'bronze', name: 'Bronze', thresholdCount: 1, exp: 50, coin: 0, title: 'Quick Study', icon: 'fa-medal', color: '#176b87', unlocked: true }] }] };
      if (path === '/me/title') return null;
      if (path === '/me/titles/equip' && method === 'POST') return { achievementId: 'first-correct', version: 1, tierKey: 'bronze', title: 'Quick Study' };
      throw new Error(`Unexpected ${method} ${path}`);
    });
    render(<AchievementsWorkspace locale="en" roles={['student']} />);
    await screen.findByText('First correct');
    await user.click(screen.getByRole('button', { name: 'Equip title' }));
    await screen.findByText('Title equipped.');
    expect(transport.api).toHaveBeenCalledWith('/me/titles/equip', 'POST', { achievementId: 'first-correct', version: 1, tierKey: 'bronze' });
  });
  it('creates an attendance window through the course API', async () => {
    const user = userEvent.setup();
    transport.api.mockImplementation(async (path: string, method?: string) => {
      if (path === '/courses?pageSize=100') return { items: [{ id: 'course-1', courseCode: 'CS101', title: 'Algorithms', timezone: 'Asia/Bangkok', permissions: ['course.read', 'attendance.manage'] }] };
      if (path === '/courses/course-1/attendance/windows' && method === 'POST') return { id: 'window-1', title: 'Lab', opensAt: '2026-11-15T10:00:00+07:00', closesAt: '2026-11-15T11:00:00+07:00', status: 'open' };
      if (path === '/courses/course-1/attendance/windows') return { items: [] };
      if (path === '/courses/course-1/attendance/excusals') return { items: [] };
      throw new Error(`Unexpected ${method} ${path}`);
    });
    render(<AttendanceWorkspace locale="en" roles={['teacher']} />);
    await screen.findByText('Create attendance window');
    await user.type(screen.getByLabelText('Title'), 'Lab');
    await user.type(screen.getByLabelText('Opens'), '2026-11-15T10:00');
    await user.type(screen.getByLabelText('Closes'), '2026-11-15T11:00');
    await user.click(screen.getByRole('button', { name: 'Create window' }));
    await screen.findByRole('status');
    expect(transport.api).toHaveBeenCalledWith('/courses/course-1/attendance/windows', 'POST', expect.objectContaining({ title: 'Lab', opensAt: expect.stringContaining('+07:00') }));
  });
  it('authors an assessment from published questions through the live API', async () => {
    const user = userEvent.setup();
    transport.api.mockImplementation(async (path: string, method?: string) => {
      if (path === '/courses?pageSize=100') return { items: [{ id: 'course-1', courseCode: 'CS101', title: 'Algorithms', timezone: 'Asia/Bangkok', permissions: ['assessment.manage'] }] };
      if (path === '/courses/course-1/questions?status=published&pageSize=100') return { items: [{ questionVersionId: 'qv-1', title: 'A safe question', questionType: 'multipleChoice', usageTypes: ['exam'], status: 'published' }] };
      if (path === '/courses/course-1/assessments' && method === 'POST') return { id: 'assessment-1' };
      if (path === '/courses/course-1/assessments') return { items: [] };
      throw new Error(`Unexpected ${method} ${path}`);
    });
    render(<AssessmentBuilder locale="en" />);
    await screen.findByText('A safe question');
    await user.type(screen.getByLabelText('Title'), 'Midterm');
    await user.click(screen.getByLabelText(/A safe question/));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('status');
    expect(transport.api).toHaveBeenCalledWith('/courses/course-1/assessments', 'POST', expect.objectContaining({
      kind: 'exam', title: 'Midterm', questionVersionIds: ['qv-1'], timezone: 'Asia/Bangkok',
    }));
  });
  it('starts, autosaves and submits an assessment attempt', async () => {
    const user = userEvent.setup();
    const assessment = { id: 'assessment-1', courseId: 'course-1', kind: 'exam', title: 'Midterm', instructions: 'Choose carefully.', status: 'published', version: 1, opensAt: null, closesAt: null, durationMinutes: 60, totalPoints: 1, questionItems: [{ questionVersionId: 'qv-1', questionType: 'multipleChoice', title: 'One question', prompt: 'Pick one.', points: 1, content: { contentType: 'multipleChoice', choices: [{ choiceId: 'a', text: 'Answer A' }, { choiceId: 'b', text: 'Answer B' }] } }] };
    const attempt = { attemptId: 'attempt-1', attemptNumber: 1, status: 'inProgress', revision: 1, deadline: null, answers: {}, assessment };
    transport.api.mockImplementation(async (path: string, method?: string, body?: { answers?: Record<string, unknown> }) => {
      if (path === '/courses?pageSize=100') return { items: [{ id: 'course-1', courseCode: 'CS101', title: 'Algorithms', permissions: ['course.read'] }] };
      if (path === '/courses/course-1/assessments' && (!method || method === 'GET')) return { items: [assessment] };
      if (path === '/courses/course-1/assessments/assessment-1/attempts' && method === 'POST') return attempt;
      if (path.endsWith('/answers') && method === 'PUT') return { ...attempt, revision: 2, answers: body?.answers || {} };
      if (path.endsWith('/submit') && method === 'POST') return { ...attempt, status: 'submitted', revision: 3, answers: { 'qv-1': 'a' } };
      throw new Error(`Unexpected ${method} ${path}`);
    });
    render(<AssessmentWorkspace locale="en" />);
    await screen.findByText('Midterm');
    await user.click(screen.getByRole('button', { name: 'Start or resume' }));
    await screen.findByText('Pick one.');
    await user.click(screen.getByLabelText('Answer A'));
    await screen.findByText('All changes saved');
    await user.click(screen.getByRole('button', { name: 'Submit attempt' }));
    await screen.findByText('Your attempt was submitted.');
    expect(transport.api).toHaveBeenCalledWith('/courses/course-1/assessments/assessment-1/attempts/attempt-1/answers', 'PUT', { answers: { 'qv-1': 'a' } }, { 'If-Match': '"1"' });
  });
  it('loads objective practice, submits an answer and shows server scoring', async () => {
    const user = userEvent.setup();
    transport.api.mockImplementation(async (path: string, method?: string) => {
      if (path === '/courses?pageSize=100') return { items: [{ id: 'course-1', courseCode: 'CS101', title: 'Algorithms', permissions: ['course.read'] }] };
      if (path === '/courses/course-1/practice/questions?pageSize=100') return { items: [{ questionVersionId: 'qv-1', questionType: 'multipleChoice', title: 'Practice one', prompt: 'Choose.', content: { contentType: 'multipleChoice', choices: [{ choiceId: 'a', text: 'A' }, { choiceId: 'b', text: 'B' }] } }] };
      if (path === '/courses/course-1/practice/history?pageSize=10') return { items: [] };
      if (path === '/courses/course-1/practice/attempts' && method === 'POST') return { attemptId: 'pa-1', score: 1, maxPoints: 1, isCorrect: true };
      throw new Error(`Unexpected ${method} ${path}`);
    });
    render(<PracticeWorkspace locale="en" />);
    await screen.findByText('Practice one');
    await user.click(screen.getByLabelText('A'));
    await user.click(screen.getByRole('button', { name: 'Check answer' }));
    await screen.findByText(/Correct · 1 \/ 1 points/);
    expect(transport.api).toHaveBeenCalledWith('/courses/course-1/practice/attempts', 'POST', { questionVersionId: 'qv-1', answer: 'a' });
  });
  it('loads real payload-free persistence counts without fabricating dispatcher health', async () => {
    transport.api.mockResolvedValue({
      database: 'postgresql',
      environment: 'local',
      migrations: ['0005_outbox_foundation'],
      poolSize: 5,
      maxOverflow: 5,
      poolTimeoutSeconds: 10,
      pending: 7,
      dispatched: 0,
      exhausted: 0,
      oldestPendingSeconds: 42,
      dispatcherEnabled: false,
      productionPrivilegesVerified: false,
    });
    render(<PersistenceStatus locale="en" />);
    await screen.findByText('0005_outbox_foundation');
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText(/dispatcher is disabled in this isolated test environment/)).toBeTruthy();
    expect(transport.api).toHaveBeenCalledWith('/admin/operations/persistence');
  });
  it('shows an error instead of invented persistence values when the service fails', async () => {
    transport.api.mockRejectedValue(new Error('unavailable'));
    render(<PersistenceStatus locale="en" />);
    await screen.findByRole('alert');
    expect(screen.queryByText('Pending')).toBeNull();
  });
  it('shows payload-free runner metrics and labels unavailable transport accurately', async () => {
    transport.api.mockResolvedValue({
      streamLength: 4, pending: 1, lag: 3, consumerCount: 1, deadLetterLength: 0,
      outboxPending: 2, outboxExhausted: 0, oldestPendingAgeSeconds: 15, oldestExhaustedAgeSeconds: null,
    });
    render(<RunnerQueueStatus locale="en" />);
    await screen.findByRole('heading', { name: 'Runner queue' });
    await screen.findByText('15');
    expect(screen.getByText(/never executes learner code/)).toBeTruthy();
    expect(transport.api).toHaveBeenCalledWith('/admin/runner-queue/outbox-metrics');

    transport.api.mockRejectedValue(new Error('runner_queue_unavailable'));
    render(<RunnerQueueStatus locale="en" />);
    await screen.findByText(/Queue metrics are disabled or unavailable/);
    expect(screen.queryByText('runner_queue_unavailable')).toBeNull();
  });
  it('keeps all catalogue routes unique and resolves related pages without broken links', () => {
    const ids = previewPages.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const page of previewPages) {
      expect(page.rows.length).toBeGreaterThan(0);
      for (const link of page.links || [])
        expect(ids.includes(link) || ['courses', 'settings'].includes(link)).toBe(true);
    }
  });
  it('uses the union of actual global roles for preview visibility', () => {
    expect(canPreview(previewPages.find((p) => p.id === 'grades')!, ['student', 'teacher'])).toBe(
      true,
    );
    expect(canPreview(previewPages.find((p) => p.id === 'runtime-profiles')!, ['teacher'])).toBe(
      false,
    );
  });
  it('offers all twelve question editors with execution and upload kept disabled', async () => {
    const user = userEvent.setup();
    render(
      <WorkspacePreview
        page={previewPages.find((p) => p.id === 'question-authoring')!}
        locale="en"
        roles={['teacher']}
      />,
    );
    const select = screen.getByLabelText('Question format');
    expect(select.querySelectorAll('option').length).toBe(12);
    await user.selectOptions(select, 'Code');
    expect(
      screen.getByText(/Learner-code execution, runtime activation and test runs are disabled/),
    ).toBeTruthy();
    await user.selectOptions(select, 'Listening set');
    expect((screen.getByLabelText('Audio asset') as HTMLInputElement).disabled).toBe(true);
    expect(transport.api).not.toHaveBeenCalled();
  });
  it('exposes Student course tabs without exposing staff-only samples', async () => {
    const user = userEvent.setup();
    render(
      <WorkspacePreview
        page={previewPages.find((p) => p.id === 'course-preview')!}
        locale="en"
        roles={['student']}
      />,
    );
    const tabs = screen.getByRole('navigation', { name: 'Workspace detail tabs' });
    expect(within(tabs).getByRole('button', { name: 'Grades' })).toBeTruthy();
    expect(within(tabs).queryByRole('button', { name: 'Staff & permissions' })).toBeNull();
    await user.click(within(tabs).getByRole('button', { name: 'Practice' }));
    expect(
      screen.getByRole('link', { name: 'Open related workspace →' }).getAttribute('href'),
    ).toBe('/practice');
  });
  it('renders every declared preview with sample labels and blocks real actions', () => {
    for (const page of previewPages) {
      const { unmount } = render(
        <WorkspacePreview page={page} locale="en" roles={['admin', 'teacher', 'student']} />,
      );
      expect(screen.getByText('Interface preview · sample data')).toBeTruthy();
      expect(
        (screen.getByRole('button', { name: 'Live action unavailable' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
      unmount();
    }
    expect(transport.api).not.toHaveBeenCalled();
  });
  it('connects the Student dashboard to the privacy-filtered learning overview API', async () => {
    transport.api.mockImplementation(async (path: string) => {
      if (path === '/me') return { id: 'student', username: 'learner', officialName: 'Example Learner', email: 'example@example.test', roles: ['student'] };
      if (path === '/me/preferences') return { locale: 'en', theme: 'light', colorPalette: 'navy-cyan-gold', timeZone: 'UTC' };
      if (path === '/workspace/summary') return { build: 'test', courses: [], activity: [], isAdmin: false, metrics: { courses: 0, assessments: 0, accounts: 1 } };
      if (path === '/courses?pageSize=100') return { items: [] };
      if (path.startsWith('/learning-overview/me?')) return { period: { fromAt: '2026-11-01T00:00:00Z', toAt: '2026-11-15T00:00:00Z' }, items: [] };
      throw new Error('Unexpected ' + path);
    });
    render(<Workspace />);
    await screen.findByRole('heading', { name: 'Student Learning Overview' });
    expect(await screen.findByText('No learning activity in the selected period.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Accounts' })).toBeNull();
    expect(transport.api).toHaveBeenCalledWith(expect.stringMatching(/^\/learning-overview\/me\?/));
  });  it('closes the mobile drawer with Escape and restores trigger focus', async () => {
    serve(['student']);
    const user = userEvent.setup();
    render(<Workspace />);
    const menu = await screen.findByRole('button', { name: 'Open navigation' });
    await user.click(menu);
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    await user.keyboard('{Escape}');
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menu);
  });
  it('filters sample questions and opens details without requesting domain APIs', async () => {
    const user = userEvent.setup();
    render(
      <WorkspacePreview
        page={previewPages.find((p) => p.id === 'practice')!}
        locale="en"
        roles={['student']}
      />,
    );
    await user.type(screen.getByRole('textbox', { name: 'Search sample records' }), 'sequences');
    expect(screen.queryByText('Order the statements')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open preview' }));
    expect(screen.getByRole('dialog').textContent).toContain('Fictional interface example');
    expect(transport.api).not.toHaveBeenCalled();
  });
  it('validates an excusal form locally and never sends an actual request', async () => {
    const user = userEvent.setup();
    render(
      <WorkspacePreview
        page={previewPages.find((p) => p.id === 'attendance')!}
        locale="vi"
        roles={['student']}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Xem form xin phép' }));
    const modal = within(screen.getByRole('dialog'));
    await user.type(modal.getByLabelText('Lý do'), 'Example absence');
    await user.click(modal.getByRole('button', { name: 'Kiểm tra biểu mẫu' }));
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(transport.api).not.toHaveBeenCalled();
  });
  it('rejects pages outside the actual role and never renders sample private data', () => {
    render(
      <WorkspacePreview
        page={previewPages.find((p) => p.id === 'grades')!}
        locale="en"
        roles={['researchAssistant']}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('outside your workspace role');
    expect(screen.queryByText('Fundamentals checkpoint')).toBeNull();
  });
});
