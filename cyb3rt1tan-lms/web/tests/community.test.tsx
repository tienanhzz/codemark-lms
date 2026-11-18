import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityWorkspace } from '../components/CommunityWorkspace';

const transport = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../lib/api', () => ({ api: transport.api }));
const topic = {
  id: 'topic-1',
  topicId: 'topic-1',
  title: 'Understanding recursion',
  body: 'A useful question about recursion and its base case.',
  authorName: 'Learner',
  authorRole: 'student',
  status: 'published',
  createdAt: '2026-11-17T08:00:00Z',
  courseId: null,
  bestAnswerId: null,
  canReview: false,
  canSelectBest: true,
  isOwn: true,
};

beforeEach(() => {
  transport.api.mockReset();
  transport.api.mockImplementation(async (path: string, method?: string) => {
    if (path === '/courses') return { items: [] };
    if (path.includes('/answers')) return { items: [], total: 0 };
    if (path === '/community/topics/topic-1') return topic;
    if (method === 'POST') return { ...topic, status: 'pending' };
    return { items: [topic], total: 1 };
  });
});

describe('Community workspace', () => {
  it('opens full inline detail and validates a real answer without a popup', async () => {
    render(<CommunityWorkspace locale="en" roles={['student']} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Understanding recursion' }));
    await screen.findByRole('heading', { name: 'Understanding recursion' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('Your answer').getAttribute('minlength')).toBe('80');
    expect(screen.getByText('Answers')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to discussions' }));
    await screen.findByRole('button', { name: 'Understanding recursion' });
  });

  it('creates a pending topic with an inline composer and no invented mission credit', async () => {
    render(<CommunityWorkspace locale="en" roles={['student']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask a question' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.change(screen.getByLabelText('Topic title'), {
      target: { value: 'Understanding recursion' },
    });
    fireEvent.change(screen.getByLabelText('Question or discussion'), {
      target: { value: topic.body },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit topic' }));
    await waitFor(() =>
      expect(transport.api).toHaveBeenCalledWith('/community/topics', 'POST', {
        title: topic.title,
        kind: 'question',
        body: topic.body,
        courseId: null,
      }),
    );
    expect(
      await screen.findByText(
        'Submitted for review. It becomes visible to everyone after approval.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/reward claimed/i)).toBeNull();
  });

  it('loads reviewer queue and own pending filter from the server', async () => {
    render(<CommunityWorkspace locale="en" roles={['teacher']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review queue' }));
    await waitFor(() =>
      expect(transport.api).toHaveBeenCalledWith(expect.stringContaining('view=queue')),
    );
    fireEvent.click(screen.getByRole('button', { name: 'My posts' }));
    fireEvent.change(screen.getByLabelText('Post status'), { target: { value: 'pending' } });
    await waitFor(() =>
      expect(transport.api).toHaveBeenCalledWith(expect.stringContaining('status=pending')),
    );
  });

  it('opens the teacher situation discussion composer from its quest action', async () => {
    window.history.replaceState(null, '', '/community?compose=poll');
    render(<CommunityWorkspace locale="en" roles={['teacher']} />);
    expect(((await screen.findByLabelText('Topic type')) as HTMLSelectElement).value).toBe(
      'discussion',
    );
    expect(screen.getByRole('heading', { name: 'New discussion' })).toBeTruthy();
    window.history.replaceState(null, '', '/');
  });

  it('opens the student question composer directly from its quest action', async () => {
    window.history.replaceState(null, '', '/community?compose=question');
    try {
      render(<CommunityWorkspace locale="en" roles={['student']} />);
      expect(((await screen.findByLabelText('Topic type')) as HTMLSelectElement).value).toBe(
        'question',
      );
      expect(screen.queryByRole('dialog')).toBeNull();
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
});
