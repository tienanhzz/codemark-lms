import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { QuestionBank } from '../components/QuestionBank';
import { CoursePlanning } from '../components/CoursePlanning';
import type { Course } from '../lib/courseApi';

const transport = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()), api: transport.api,
}));
const course = { id: 'course-one', revision: 1, status: 'draft', timezone: 'UTC',
  permissions: ['content.author'] } as Course;
beforeEach(() => { transport.api.mockReset(); });

it('sends the explicit category descendants choice to question search', async () => {
  transport.api.mockImplementation(async (path: string) => {
    if (path === '/courses?pageSize=100') return { items: [course] };
    if (path === '/question-taxonomy') return { categories: [{ id: 'root', names: { en: 'Root' }, status: 'active' }], tags: [] };
    if (path.startsWith('/courses/course-one/questions')) return { items: [], hasMore: false };
    throw new Error(path);
  });
  const user = userEvent.setup();
  render(<QuestionBank locale="en" roles={['teacher']} />);
  await screen.findByRole('option', { name: 'Root' });
  await user.selectOptions(screen.getByLabelText('Category'), 'root');
  await user.click(screen.getByRole('checkbox', { name: 'Include subcategories' }));
  await waitFor(() => expect(transport.api.mock.calls.some(([path]) =>
    path.includes('categoryId=root') && path.includes('includeSubcategories=true'))).toBe(true));
});

it('saves selected lesson tags and preserves historical tags missing from active catalog', async () => {
  const entry = { entryId: 'entry-one', week: '1', topic: 'Arrays', content: '', reading: '',
    outcomes: [], estimatedHours: 1, position: 1, tagIds: ['retired-topic'] };
  transport.api.mockImplementation(async (path: string, method?: string) => {
    if (path === '/taxonomy') return { tags: [{ id: 'arrays', names: { en: 'Arrays tag' }, status: 'active', selectable: true, applicability: [] }] };
    if (path.endsWith('/lesson-plan')) return { entries: [entry], revision: method === 'PUT' ? 2 : 1 };
    if (path.endsWith('/sessions')) return { items: [] };
    throw new Error(path);
  });
  const user = userEvent.setup();
  render(<CoursePlanning course={course} locale="en" onChange={vi.fn().mockResolvedValue(undefined)} />);
  const edit = await screen.findByRole('button', { name: 'Edit plan' });
  await waitFor(() => expect((edit as HTMLButtonElement).disabled).toBe(false));
  await user.click(edit);
  const dialog = within(screen.getByRole('region', { name: 'Edit lesson plan' }));
  await user.selectOptions(await dialog.findByLabelText('Lesson tags'), 'arrays');
  await user.click(dialog.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(transport.api).toHaveBeenCalledWith('/courses/course-one/lesson-plan', 'PUT',
    { entries: [expect.objectContaining({ tagIds: ['retired-topic', 'arrays'] })] }, { 'If-Match': '"1"' }));
});
