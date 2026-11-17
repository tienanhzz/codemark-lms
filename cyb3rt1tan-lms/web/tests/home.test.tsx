import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HomePage } from '../components/HomePage';
import { HomeCarousel } from '../components/HomeCarousel';

const transport = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../lib/api', () => ({ api: transport.api }));

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  delete document.documentElement.dataset.motion;
  transport.api.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
});

afterEach(() => {
  vi.useRealTimers();
  delete document.documentElement.dataset.motion;
});

it('shows public posts as plain text and gives guests navigation without publication controls', async () => {
  transport.api.mockResolvedValue({
    items: [
      {
        id: 'post-1',
        title: 'Open learning day',
        body: '<img src=x onerror=alert(1)>',
        authorName: 'Teacher nickname',
        authorRole: 'teacher',
        createdAt: '2026-11-16T10:00:00Z',
        updatedAt: '2026-11-16T10:00:00Z',
        canManage: false,
      },
    ],
    total: 1,
    page: 1,
    pageSize: 10,
  });
  const { container } = render(<HomePage locale="en" />);
  await screen.findByText('Open learning day');
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
  expect(container.querySelector('img[src="x"]')).toBeNull();
  expect(screen.getByRole('link', { name: /Weekly timetable/ }).getAttribute('href')).toBe(
    '/calendar',
  );
  expect(screen.getByRole('link', { name: /Player Rank/ }).getAttribute('href')).toBe(
    '/leaderboard',
  );
  expect(screen.queryByRole('button', { name: 'Publish announcement' })).toBeNull();
  expect(transport.api.mock.calls.every(([path]) => path.startsWith('/home/announcements'))).toBe(
    true,
  );
});

it('lets teachers publish news and reloads the public bulletin', async () => {
  let published = false;
  transport.api.mockImplementation(async (path: string, method?: string) => {
    if (path === '/home/highlights') return { items: [] };
    if (method === 'POST') {
      published = true;
      return {};
    }
    return {
      items: published
        ? [
            {
              id: 'post-1',
              title: 'New event',
              body: 'Everyone is welcome.',
              authorName: 'Teacher',
              authorRole: 'teacher',
              createdAt: '2026-11-16T10:00:00Z',
              canManage: true,
            },
          ]
        : [],
      total: published ? 1 : 0,
      page: 1,
      pageSize: 10,
    };
  });
  render(<HomePage locale="en" roles={['teacher']} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Publish announcement' }));
  await user.type(screen.getByLabelText('Title'), 'New event');
  await user.type(screen.getByLabelText('Body'), 'Everyone is welcome.');
  await user.click(screen.getByRole('button', { name: 'Save announcement' }));
  await screen.findByText('New event');
  expect(transport.api).toHaveBeenCalledWith('/home/announcements', 'POST', {
    title: 'New event',
    body: 'Everyone is welcome.',
  });
});

it('renders animated technology artwork instead of static banner images', async () => {
  const { container } = render(<HomePage locale="en" />);
  await screen.findByText('No public announcements yet.');
  expect(container.querySelectorAll('.home-carousel-slide svg[role="img"]')).toHaveLength(8);
  expect(container.querySelectorAll('.home-carousel-slide img')).toHaveLength(0);
  expect(screen.getByRole('img', { name: 'AI neural network among the planets' })).toBeTruthy();
  expect(container.querySelector('.is-active .learning-motion-satellite')).toBeTruthy();
  expect(container.querySelector('.is-active .learning-motion-network')).toBeTruthy();
  expect(container.querySelector('.home-carousel')?.querySelectorAll('button')).toHaveLength(0);
});

it('automatically loops banners every ten seconds while the pointer remains over the image', () => {
  vi.useFakeTimers();
  const { container } = render(<HomeCarousel locale="en" />);
  const carousel = container.querySelector('.home-carousel')!;
  const active = () => container.querySelector('.is-active')?.getAttribute('aria-label');
  expect(active()).toContain('Scene 1 / 8');
  fireEvent.mouseEnter(carousel);
  act(() => vi.advanceTimersByTime(9999));
  expect(active()).toContain('Scene 1 / 8');
  act(() => vi.advanceTimersByTime(1));
  expect(active()).toContain('Scene 2 / 8');
  act(() => vi.advanceTimersByTime(10000));
  expect(active()).toContain('Scene 3 / 8');
  act(() => vi.advanceTimersByTime(10000));
  expect(active()).toContain('Scene 4 / 8');
  for (let scene = 5; scene <= 8; scene++) {
    act(() => vi.advanceTimersByTime(10000));
    expect(active()).toContain(`Scene ${scene} / 8`);
  }
  act(() => vi.advanceTimersByTime(10000));
  expect(active()).toContain('Scene 1 / 8');
  expect(carousel.querySelectorAll('button')).toHaveLength(0);
});

it('keeps the requested homepage autoplay even when the device reduces motion', () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  const { container } = render(<HomeCarousel locale="en" />);
  act(() => vi.advanceTimersByTime(10000));
  expect(container.querySelector('.home-carousel')?.getAttribute('data-paused')).toBe('false');
  expect(container.querySelector('.is-active')?.getAttribute('aria-label')).toContain('Scene 2 / 8');
  expect(container.querySelectorAll('button')).toHaveLength(0);
});

it('keeps homepage autoplay without changing the account motion preference', () => {
  vi.useFakeTimers();
  document.documentElement.dataset.motion = 'false';
  const { container } = render(<HomeCarousel locale="en" />);
  act(() => vi.advanceTimersByTime(10000));
  expect(container.querySelector('.is-active')?.getAttribute('aria-label')).toContain('Scene 2 / 8');
  act(() => vi.advanceTimersByTime(10000));
  expect(container.querySelector('.is-active')?.getAttribute('aria-label')).toContain('Scene 3 / 8');
  expect(document.documentElement.dataset.motion).toBe('false');
});

it('provides a retry when the public bulletin cannot load', async () => {
  transport.api.mockRejectedValueOnce(new Error('connection_error'));
  render(<HomePage locale="en" />);
  await screen.findByRole('alert');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByText('No public announcements yet.');
});

it('continues autoplay when motion preference APIs are unavailable', () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', undefined);
  const { container } = render(<HomeCarousel locale="en" />);
  act(() => vi.advanceTimersByTime(10000));
  expect(container.querySelector('.is-active')?.getAttribute('aria-label')).toContain('Scene 2 / 8');
});

const highlight = {
  id: 'rank-event-1',
  kind: 'rank_change',
  title: { en: 'Top 5 positions changed', vi: 'Thay đổi thứ hạng Top 5' },
  body: { en: 'Fox (#6 → #4). Congratulations!', vi: 'Fox (#6 → #4). Chúc mừng!' },
  createdAt: '2026-11-16T10:00:00Z',
  href: '/leaderboard',
};

it('shows localized rank changes, congratulations and system guidance beside public news', async () => {
  transport.api.mockImplementation(async (path: string) =>
    path === '/home/highlights'
      ? {
          items: [
            highlight,
            {
              id: 'top-five-student',
              kind: 'congratulations',
              title: { en: 'Student Top 5', vi: 'Top 5 sinh viên' },
              body: { en: 'Current EXP standings: Fox.', vi: 'Thứ hạng EXP hiện tại: Fox.' },
              createdAt: null,
              href: '/leaderboard',
            },
            {
              id: 'study-timetable',
              kind: 'study_tip',
              title: { en: 'Plan your learning week', vi: 'Sắp xếp tuần học của bạn' },
              body: { en: 'Check your timetable.', vi: 'Xem thời khóa biểu tuần.' },
              createdAt: null,
              href: '/calendar',
            },
          ],
        }
      : { items: [], total: 0, page: 1, pageSize: 10 },
  );
  const { container } = render(<HomePage locale="vi" roles={['student']} />);
  await screen.findByText('Thay đổi thứ hạng Top 5');
  expect(screen.getByText('Fox (#6 → #4). Chúc mừng!')).toBeTruthy();
  expect(screen.getByText('Top 5 sinh viên')).toBeTruthy();
  expect(screen.getByText('Hướng dẫn từ hệ thống')).toBeTruthy();
  expect(screen.getByRole('link', { name: /Sắp xếp tuần học của bạn/ }).getAttribute('href')).toBe(
    '/calendar',
  );
  expect(container.querySelectorAll('.home-highlight-rank_change')).toHaveLength(1);
  expect(container.querySelectorAll('.home-highlight-congratulations')).toHaveLength(1);
  expect(container.querySelectorAll('.home-highlight-study_tip time')).toHaveLength(0);
  expect(screen.queryByRole('button', { name: 'Đăng thông báo' })).toBeNull();
});

it('refreshes authenticated highlights with news without publishing or inventing notices', async () => {
  let refreshed = false;
  transport.api.mockImplementation(async (path: string) =>
    path === '/home/highlights'
      ? {
          items: [
            {
              ...highlight,
              title: { en: refreshed ? 'New rank movement' : 'Earlier rank movement', vi: '' },
            },
          ],
        }
      : { items: [], total: 0, page: 1, pageSize: 10 },
  );
  render(<HomePage locale="en" roles={['student']} />);
  await screen.findByText('Earlier rank movement');
  refreshed = true;
  await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByText('New rank movement');
  expect(screen.queryByText('Earlier rank movement')).toBeNull();
  expect(transport.api.mock.calls.every(([, method]) => !method || method === 'GET')).toBe(true);
});

it('keeps the public bulletin usable if authenticated highlights fail', async () => {
  transport.api.mockImplementation(async (path: string) => {
    if (path === '/home/highlights') throw new Error('connection_error');
    return { items: [], total: 0, page: 1, pageSize: 10 };
  });
  render(<HomePage locale="en" roles={['student']} />);
  await screen.findByText('Learning updates could not be loaded. Try Refresh again.');
  expect(screen.getByText('No public announcements yet.')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement).disabled).toBe(
    false,
  );
});

it('removes authenticated highlights when the user signs out', async () => {
  transport.api.mockImplementation(async (path: string) =>
    path === '/home/highlights'
      ? { items: [highlight] }
      : { items: [], total: 0, page: 1, pageSize: 10 },
  );
  const view = render(<HomePage locale="en" roles={['student']} />);
  await screen.findByText('Top 5 positions changed');
  view.rerender(<HomePage locale="en" />);
  await waitFor(() => expect(screen.queryByText('Top 5 positions changed')).toBeNull());
});
