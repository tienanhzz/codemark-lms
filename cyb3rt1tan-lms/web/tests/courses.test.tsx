import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseWorkspace } from '../components/CourseWorkspace';
import { CoursePlanning } from '../components/CoursePlanning';
import { CoursePeople } from '../components/CoursePeople';
import { CourseRules, SharedCourseRules } from '../components/CourseRules';
import { CourseAcademicPanel } from '../components/CourseAcademicPanel';
import { TaxonomyManager } from '../components/TaxonomyManager';
import { QuestionBank } from '../components/QuestionBank';
import { zonedIso, wallTime, type Course } from '../lib/courseApi';
const transport = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  api: transport.api,
}));
const course: Course = {
  id: '22222222-2222-4222-8222-222222222222',
  courseCode: 'CS101',
  title: 'Foundations',
  termId: '2026',
  facultyId: 'cs',
  timezone: 'Asia/Bangkok',
  module: {
    moduleCode: 'CS1',
    moduleName: 'Computer Science',
    level: '1',
    unitOfCredit: 3,
    prerequisites: [],
    suggestedStudyHours: 12,
    objectives: [],
    year: '',
    nature: '',
  },
  ownerId: 'admin',
  status: 'draft',
  revision: 7,
  permissions: ['course.manage', 'roster.read', 'content.author', 'course.rules.manage'],
};
beforeEach(() => {
  window.history.replaceState(null, '', '/courses');
  transport.api.mockReset();
});
describe('Course UI interactions in a simulated DOM', () => {
  it('creates a course with catalog IDs and module fields, then shows the real response', async () => {
    transport.api.mockImplementation(async (path: string, method: string) => {
      if (path.startsWith('/admin/faculties'))
        return {
          items: [
            { facultyId: 'cs', names: { en: 'Computer Science' }, status: 'active', sortOrder: 0 },
          ],
        };
      if (path.startsWith('/admin/academic-terms'))
        return { items: [{ termCode: '2026', name: 'Term 2026', status: 'active' }] };
      if (path === '/courses' && method === 'POST') return course;
      if (path.startsWith('/courses?')) return { items: [], nextCursor: null };
      throw new Error('Unexpected ' + path);
    });
    const user = userEvent.setup(),
      changed = vi.fn().mockResolvedValue(undefined);
    render(<CourseWorkspace locale="en" roles={['admin']} onChange={changed} />);
    await screen.findByText('Your learning spaces start here');
    await user.click(screen.getByRole('button', { name: 'Create course' }));
    const modal = within(screen.getByRole('region', { name: 'Create course' }));
    await user.type(modal.getByLabelText('Course code'), 'CS101');
    await user.type(modal.getByLabelText('Course title'), 'Foundations');
    await user.selectOptions(modal.getByLabelText('Academic term'), '2026');
    await user.selectOptions(modal.getByLabelText('Faculty'), 'cs');
    await user.type(
      modal.getByLabelText('Objectives (one per line)'),
      'Learn concepts\nBuild skills',
    );
    await user.click(modal.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('heading', { name: 'Foundations' });
    expect(transport.api).toHaveBeenCalledWith(
      '/courses',
      'POST',
      expect.objectContaining({
        courseCode: 'CS101',
        termId: '2026',
        facultyId: 'cs',
        module: expect.objectContaining({ objectives: ['Learn concepts', 'Build skills'] }),
      }),
    );
    expect(changed).toHaveBeenCalledOnce();
  });
  it('keeps plan edits on conflict and sends the loaded course ETag', async () => {
    transport.api.mockImplementation(async (path: string, method: string) => {
      if (path.endsWith('/lesson-plan') && method === 'PUT') throw new Error('stale_course');
      if (path.endsWith('/lesson-plan')) return { entries: [] };
      if (path.endsWith('/sessions')) return { items: [] };
      throw new Error(path);
    });
    const user = userEvent.setup();
    render(
      <CoursePlanning
        course={course}
        locale="en"
        onChange={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    const edit = await screen.findByRole('button', { name: 'Edit plan' });
    await waitFor(() => expect((edit as HTMLButtonElement).disabled).toBe(false));
    await user.click(edit);
    const modal = within(screen.getByRole('region', { name: 'Edit lesson plan' }));
    await user.click(modal.getByRole('button', { name: 'Add entry' }));
    await user.type(modal.getByLabelText('Topic'), 'Persistent draft');
    await user.click(modal.getByRole('button', { name: 'Save changes' }));
    await modal.findByRole('alert');
    expect((modal.getByLabelText('Topic') as HTMLInputElement).value).toBe('Persistent draft');
    expect(transport.api).toHaveBeenCalledWith(
      '/courses/' + course.id + '/lesson-plan',
      'PUT',
      expect.objectContaining({
        entries: [expect.objectContaining({ topic: 'Persistent draft', position: 1 })],
      }),
      { 'If-Match': '"7"' },
    );
  });
  it('shows schedule calendar and saves a reasoned single-session exception with ETag', async () => {
    const session = {
      id: 'session-1',
      startsAt: '2026-02-01T02:00:00Z',
      endsAt: '2026-02-01T03:00:00Z',
      timezone: 'Asia/Bangkok',
      sectionId: null,
      room: 'A-101',
      onlineUrl: null,
      lessonPlanEntryId: null,
      status: 'scheduled' as const,
      recurrenceSeriesId: 'series-1',
      recurrenceIndex: 0,
    };
    transport.api.mockImplementation(async (path: string, method?: string) => {
      if (path.endsWith('/lesson-plan')) return { entries: [] };
      if (path.endsWith('/sessions') && method !== 'PATCH') return { items: [session] };
      if (path.endsWith('/sessions/session-1') && method === 'PATCH')
        return { ...session, status: 'cancelled' };
      throw new Error(path);
    });
    const user = userEvent.setup();
    render(
      <CoursePlanning
        course={course}
        locale="en"
        onChange={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await screen.findByText('A-101');
    await user.click(screen.getByRole('button', { name: 'Calendar' }));
    await screen.findByLabelText('Course calendar');
    for (let month = 0; month < 9; month++)
      await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await user.click(screen.getByRole('button', { name: /A-101/ }));
    const modal = within(screen.getByRole('region', { name: 'Schedule exception' }));
    await user.selectOptions(modal.getByLabelText('Session status'), 'cancelled');
    await user.type(modal.getByLabelText('Reason'), 'Room unavailable');
    await user.click(modal.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(transport.api).toHaveBeenCalledWith(
        `/courses/${course.id}/sessions/session-1`,
        'PATCH',
        expect.objectContaining({ status: 'cancelled', reason: 'Room unavailable', room: 'A-101' }),
        { 'If-Match': '"7"' },
      ),
    );
  });
  it('requires an audit reason before removing course staff', async () => {
    const staff = {
      userId: 'ta-user',
      username: 'teaching.assistant',
      officialName: 'Teaching Assistant',
      staffRole: 'teachingAssistant',
      permissions: ['course.read'],
    };
    transport.api.mockImplementation(async (path: string, method: string) => {
      if (path.endsWith('/staff/ta-user') && method === 'DELETE') return null;
      if (path.endsWith('/staff')) return { items: [staff] };
      if (path.endsWith('/enrollments')) return { items: [], nextCursor: null };
      if (path.endsWith('/permission-grants'))
        return { items: [], allowedKeys: ['content.author'] };
      throw new Error(path);
    });
    const user = userEvent.setup();
    render(
      <CoursePeople course={course} locale="en" onChange={vi.fn().mockResolvedValue(undefined)} />,
    );
    await screen.findByText('Teaching Assistant');
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    const modal = within(screen.getByRole('dialog'));
    await user.click(modal.getByRole('button', { name: 'Save changes' }));
    expect(transport.api.mock.calls.some(([, method]) => method === 'DELETE')).toBe(false);
    await user.type(modal.getByLabelText('Reason'), 'Teaching assignment ended');
    await user.click(modal.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(transport.api).toHaveBeenCalledWith(
        '/courses/' + course.id + '/staff/ta-user',
        'DELETE',
        { reason: 'Teaching assignment ended' },
      ),
    );
  });
  it('edits course resources and displays its published assessment scheme', async () => {
    const resource = { id: 'resource-1', kind: 'learningResource', title: 'Reading', note: 'Chapter 1', coverage: 'Basics', url: 'https://example.test/book', position: 0 } as const;
    const scheme = { id: 'scheme-1', version: 2, active: true, components: [{ componentId: 'midterm', name: 'Midterm', weight: 40, description: 'Tasks' }, { componentId: 'final', name: 'Final', weight: 60, description: 'Exam' }], bands: [{ minimumScore: 0, label: 'F' }, { minimumScore: 80, label: 'A' }, { minimumScore: 100, label: 'A+' }] };
    transport.api.mockImplementation(async (path: string, method?: string) => {
      if (path.endsWith('/resources') && method === 'PUT') return { items: [resource], revision: 8 };
      if (path.endsWith('/resources')) return { items: [resource], revision: 7 };
      if (path.endsWith('/grade-scheme')) return scheme;
      if (path.endsWith('/grade-schemes')) return { active: scheme, items: [scheme] };
      throw new Error(path);
    });
    const user = userEvent.setup();
    render(<CourseAcademicPanel course={course} locale="en" onChange={vi.fn().mockResolvedValue(undefined)} />);
    await screen.findByText('Reading');
    expect(screen.getByText('40%')).toBeTruthy();
    expect(screen.getByText('60%')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Edit resources' }));
    const modal = within(screen.getByRole('region', { name: 'Edit learning resources' }));
    await user.clear(modal.getByLabelText('Note'));
    await user.type(modal.getByLabelText('Note'), 'Updated reading note');
    await user.click(modal.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(transport.api).toHaveBeenCalledWith(
      `/courses/${course.id}/resources`, 'PUT',
      { items: [expect.objectContaining({ title: 'Reading', note: 'Updated reading note', position: 0 })] },
      { 'If-Match': '"7"' },
    ));
  });
  it('requires reviewing a shared rules version before activating it', async () => {
    transport.api.mockImplementation(async (path: string, method: string) => {
      if (path.endsWith('/activate') && method === 'POST') return {};
      return {
        active: { version: 0, rules: [] },
        drafts: [
          {
            id: 'template',
            version: 1,
            rules: [
              {
                ruleId: 'on-time',
                title: 'Be on time',
                body: 'Arrive before class.',
                category: 'attendance',
                position: 0,
              },
            ],
          },
        ],
      };
    });
    const user = userEvent.setup();
    render(<SharedCourseRules locale="en" />);
    await user.click(await screen.findByRole('button', { name: 'Activate' }));
    const modal = within(screen.getByRole('region', { name: 'Activate shared rules' }));
    expect(modal.getByText('Arrive before class.')).toBeTruthy();
    expect(transport.api.mock.calls.some(([, method]) => method === 'POST')).toBe(false);
    await user.click(modal.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(transport.api).toHaveBeenCalledWith(
        '/admin/course-rule-templates/template/activate',
        'POST',
      ),
    );
  });
  it('creates and confirms publication of an immutable course grade scheme', async () => {
    const active = { id: 'scheme-1', version: 1, active: true, components: [], bands: [] };
    const draft = { id: 'draft-2', version: 2, active: false, components: [{ componentId: 'midterm', name: 'Midterm', weight: 40, description: '' }, { componentId: 'final', name: 'Final', weight: 60, description: '' }], bands: [{ minimumScore: 0, label: 'F' }, { minimumScore: 100, label: 'A' }] };
    transport.api.mockImplementation(async (path: string, method?: string) => {
      if (path.endsWith('/resources')) return { items: [] };
      if (path.endsWith('/grade-scheme')) return active;
      if (path.endsWith('/grade-schemes') && method === 'POST') return draft;
      if (path.endsWith('/grade-schemes')) return { active, items: [draft, active] };
      if (path.endsWith('/draft-2/publish') && method === 'POST') return { ...draft, active: true };
      throw new Error(path);
    });
    const user = userEvent.setup();
    render(<CourseAcademicPanel course={course} locale="en" onChange={vi.fn().mockResolvedValue(undefined)} />);
    await user.click(await screen.findByRole('button', { name: 'New grade scheme draft' }));
    const editor = within(screen.getByRole('region', { name: 'Grade scheme draft' }));
    await user.click(editor.getByRole('button', { name: 'Save changes' }));
    await screen.findByText(/Version 2 · 100%/);
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    const confirmation = within(screen.getByRole('dialog'));
    await user.click(confirmation.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(transport.api).toHaveBeenCalledWith(
      `/courses/${course.id}/grade-schemes/draft-2/publish`, 'POST', undefined, { 'If-Match': '"7"' },
    ));
  });
  it('shows immutable Course Rules publication history', async () => {
    transport.api.mockImplementation(async (path: string) => {
      if (path.endsWith('/rules/history')) return { items: [{ version: 2, templateVersion: 3, publishedAt: '2026-01-01T00:00:00Z', rules: [{ ruleId: 'conduct', category: 'classroomConduct', title: 'Respect', body: 'Take turns.', position: 0 }] }], nextBefore: null };
      if (path.endsWith('/rules')) return { templateVersion: 3, publicationVersion: 2, revision: 7, rules: [{ ruleId: 'conduct', category: 'classroomConduct', title: 'Respect', body: 'Take turns.', position: 0, source: 'shared' }], sharedRules: [], overrides: [], customRules: [] };
      throw new Error(path);
    });
    render(<CourseRules course={course} locale="en" onChange={vi.fn().mockResolvedValue(undefined)} />);
    await screen.findByText('Published history');
    expect(screen.getAllByText('Take turns.')).toHaveLength(2);
    expect(screen.getByText(/Version 2 · Shared template 3/)).toBeTruthy();
  });
});
describe('IANA scheduling conversion', () => {
  it('converts Bangkok wall time without using the device timezone', () => {
    expect(zonedIso('2026-02-01T09:00', 'Asia/Bangkok')).toBe('2026-02-01T09:00:00+07:00');
    expect(wallTime('2026-02-01T02:00:00Z', 'Asia/Bangkok')).toBe('2026-02-01T09:00');
  });
  it('rejects DST gaps and ambiguous wall times', () => {
    expect(() => zonedIso('2026-03-08T02:30', 'America/New_York')).toThrow();
    expect(() => zonedIso('2026-11-01T01:30', 'America/New_York')).toThrow();
  });
});
describe('Live taxonomy management', () => {
  it('loads the question taxonomy and saves a bilingual hierarchical category', async () => {
    const user = userEvent.setup();
    const catalog: {
      scope: string;
      catalogVersion: number;
      categories: { id: string; names: Record<string, string>; parentId: string | null; status: string; sortOrder: number }[];
      tags: unknown[];
    } = { scope: 'question', catalogVersion: 1, categories: [], tags: [] };
    transport.api.mockImplementation(async (path: string, method?: string, body?: unknown) => {
      if (path === '/question-taxonomy?includeRetired=true') return structuredClone(catalog);
      if (path === '/admin/question-taxonomy/categories' && method === 'POST') {
        expect(body).toMatchObject({
          id: 'algorithms',
          names: { en: 'Algorithms', vi: 'Thuật toán' },
          parentId: null,
          sortOrder: 0,
        });
        catalog.catalogVersion = 2;
        catalog.categories = [{
          id: 'algorithms', names: { en: 'Algorithms', vi: 'Thuật toán' },
          parentId: null, status: 'active', sortOrder: 0,
        }];
        return catalog.categories[0];
      }
      throw new Error(path);
    });
    render(<TaxonomyManager locale="en" roles={['admin']} />);
    await user.click(await screen.findByRole('button', { name: 'Add category' }));
    const editor = within(screen.getByRole('region', { name: 'Create taxonomy entry' }));
    await user.type(editor.getByLabelText('Stable ID'), 'algorithms');
    await user.type(editor.getByLabelText('English name'), 'Algorithms');
    await user.type(editor.getByLabelText('Vietnamese name'), 'Thuật toán');
    await user.click(editor.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('algorithms · Thuật toán');
    expect(screen.getByText('Algorithms')).toBeTruthy();
    expect(transport.api).toHaveBeenCalledWith(
      '/admin/question-taxonomy/categories', 'POST', expect.objectContaining({ id: 'algorithms' }),
    );
    expect(screen.getByText(/Live catalog · v2/)).toBeTruthy();
  });
  it('creates, validates, and publishes an API-backed question version', async () => {
    const user = userEvent.setup();
    let published = false;
    const row = {
      questionId: 'question-1', questionVersionId: 'version-1', versionNumber: 1,
      questionType: 'multipleChoice', title: 'Choose the answer', prompt: 'Select one.',
      categoryId: 'basics', difficulty: 'newbie', language: 'en', usageTypes: ['practice'],
      tags: [], content: { contentType: 'multipleChoice', choices: [{ choiceId: 'a', text: 'A' }, { choiceId: 'b', text: 'B' }] },
      authoringConfig: { configType: 'multipleChoice', correctChoiceIds: ['a'] }, status: published ? 'published' : 'draft',
    };
    transport.api.mockImplementation(async (path: string, method?: string) => {
      if (path === '/courses?pageSize=100') return { items: [{ ...course, permissions: ['content.author'] }] };
      if (path === '/question-taxonomy') return { categories: [{ id: 'basics', names: { en: 'Basics' }, status: 'active' }], tags: [] };
      if (path === `/courses/${course.id}/questions` && method === 'POST') return row;
      if (path.startsWith(`/courses/${course.id}/questions`)) return { items: published ? [{ ...row, status: 'published' }] : [], hasMore: false };
      if (path.endsWith('/validate') && method === 'POST') return { valid: true, errors: [] };
      if (path.endsWith('/publish') && method === 'POST') { published = true; return { status: 'published' }; }
      throw new Error(path);
    });
    render(<QuestionBank locale="en" roles={['teacher']} />);
    await user.click(await screen.findByRole('button', { name: 'Create question' }));
    const editor = within(screen.getByRole('region', { name: 'Create question draft' }));
    await user.type(editor.getByLabelText('Title'), 'Choose the answer');
    await user.type(editor.getByLabelText('Prompt / instructions'), 'Select one.');
    await user.selectOptions(editor.getByLabelText('Category'), 'basics');
    await user.click(editor.getByRole('button', { name: 'Save changes' }));
    await user.click(await screen.findByRole('button', { name: 'Validate draft' }));
    await user.click(await screen.findByRole('button', { name: 'Publish version' }));
    await screen.findByText('Choose the answer');
    expect(transport.api).toHaveBeenCalledWith(`/courses/${course.id}/questions`, 'POST', expect.objectContaining({ questionType: 'multipleChoice' }));
    expect(transport.api).toHaveBeenCalledWith('/questions/question-1/versions/version-1/validate', 'POST');
    expect(transport.api).toHaveBeenCalledWith('/questions/question-1/versions/version-1/publish', 'POST');
  });
});
