import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickLeaderboard } from '../components/QuickLeaderboard';

const courses = { items: [{ id: 'course-1', courseCode: 'CS101', title: 'Programming' }], nextCursor: null };
const studentBoard = {
  track: 'student', total: 2,
  items: [
    { position: 7, userId: 's1', displayName: 'An Nguyen', username: 'an', exp: 4200, tier: { key: 'gold', name: 'Gold', thresholdExp: 3000, icon: 'fa-star', color: '#dda94c', description: '' } },
    { position: 8, userId: 's2', displayName: 'Binh Tran', username: 'binh', exp: 3200, tier: null },
  ],
};
const staffBoard = { track: 'staff', total: 1, items: [{ position: 1, userId: 't1', displayName: 'Teacher Mai', username: 'mai', exp: 50, tier: null }] };
const respond = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
let fetcher: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetcher = vi.fn(async (path: string) => respond(path.startsWith('/v1/courses') ? courses : path.includes('track=staff') ? staffBoard : studentBoard));
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Compact leaderboard', () => {
  it('matches every server tier to its logo and a distinct accessible row tint', async () => {
    const tiers = [
      { key: ' BRONZE ', name: 'Bronze', source: '/ranks/bronze.png' },
      { key: 'silver', name: 'Silver', source: '/ranks/silver.png' },
      { key: 'gold', name: 'Gold', source: '/ranks/gold.png' },
      { key: 'diamond', name: 'Diamond', source: '/ranks/diamond.png' },
      { key: 'ruby', name: 'Ruby', source: '/ranks/ruby.png' },
      { key: 'policy-master', name: ' MASTER ', source: '/ranks/master.png' },
    ];
    fetcher.mockImplementation(async (path: string) => respond(path.startsWith('/v1/courses') ? courses : {
      track: 'student', total: 6,
      items: tiers.map((tier, index) => ({ position: index + 1, userId: `tier-${index}`, displayName: `Participant ${index}`, username: null, exp: 0, tier: { ...tier, icon: 'fa-star', color: '#fff' } })),
    }));
    render(<QuickLeaderboard locale="en" userId="tier-4" />);
    const rows = within(await screen.findByRole('list', { name: 'Student rankings' })).getAllByRole('listitem');
    const backgrounds = new Set<string>();
    tiers.forEach((tier, index) => {
      expect(within(rows[index]).getByRole('img', { name: tier.name.trim() }).getAttribute('src')).toBe(tier.source);
      const background = rows[index].style.getPropertyValue('--rank-background');
      expect(background).not.toBe('');
      backgrounds.add(background);
    });
    expect(backgrounds.size).toBe(6);
    expect(rows[4].getAttribute('aria-current')).toBe('true');
  });

  it('keeps custom policy tiers readable and never assigns a logo to an unranked participant', async () => {
    fetcher.mockImplementation(async (path: string) => respond(path.startsWith('/v1/courses') ? courses : {
      ...studentBoard,
      items: [
        { ...studentBoard.items[0], tier: { key: 'custom', name: 'Mentor', color: '#55aaee', icon: 'fa-star' } },
        { ...studentBoard.items[1], tier: null },
      ],
    }));
    render(<QuickLeaderboard locale="en" userId="s2" />);
    const rows = within(await screen.findByRole('list', { name: 'Student rankings' })).getAllByRole('listitem');
    expect(within(rows[0]).getByText('Mentor')).toBeTruthy();
    expect(within(rows[0]).queryByRole('img')).toBeNull();
    expect(rows[0].style.getPropertyValue('--rank-background')).not.toBe('');
    expect(rows[1].style.getPropertyValue('--rank-background')).toBe('');
    expect(within(rows[1]).queryByRole('img')).toBeNull();
  });

  it('shows server positions, real EXP, rank artwork and the signed-in row without a podium', async () => {
    render(<QuickLeaderboard locale="en" userId="s2" />);
    const list = await screen.findByRole('list', { name: 'Student rankings' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('7');
    expect(rows[0].textContent).toContain('An Nguyen');
    expect(rows[0].textContent).toContain('4,200');
    expect(within(rows[0]).getByRole('img', { name: 'Gold' }).getAttribute('src')).toBe('/ranks/gold.png');
    expect(rows[1].getAttribute('aria-current')).toBe('true');
    expect(rows[1].textContent).toContain('You');
    expect(within(rows[1]).queryByRole('img')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Top three' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Player Rank' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Player Rank' }).getAttribute('href')).toBe('/leaderboard');
  });

  it('uses real course scopes and resets the course when switching to teachers', async () => {
    render(<QuickLeaderboard locale="en" userId="s2" />);
    const scope = screen.getByRole('combobox', { name: 'Ranking scope' });
    await screen.findByRole('option', { name: 'Programming · CS101' });
    expect(within(scope).getAllByRole('option')).toHaveLength(2);
    fireEvent.change(scope, { target: { value: 'course-1' } });
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith('/v1/leaderboard?track=student&q=&courseId=course-1', expect.anything()));
    fireEvent.click(screen.getByRole('button', { name: 'Teachers' }));
    const list = await screen.findByRole('list', { name: 'Teacher rankings' });
    expect(within(list).getByText('Teacher Mai')).toBeTruthy();
    expect(within(list).getByText('EXP')).toBeTruthy();
    expect(screen.queryByText('An Nguyen')).toBeNull();
    expect((scope as HTMLSelectElement).value).toBe('');
    expect(screen.getByRole('button', { name: 'Teachers' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Teacher Rank' })).toBeTruthy();
    expect(fetcher).toHaveBeenCalledWith('/v1/leaderboard?track=staff&q=', expect.anything());
  });

  it('preserves rows through refresh and ignores a response from an older cohort', async () => {
    let finish!: (value: Response) => void;
    render(<QuickLeaderboard locale="en" userId="s2" />);
    await screen.findByText('An Nguyen');
    fetcher.mockImplementation((path: string) => path.includes('track=student')
      ? new Promise<Response>((resolve) => { finish = resolve; })
      : Promise.resolve(respond(staffBoard)));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(screen.getByText('An Nguyen')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Teachers' }));
    await screen.findByText('Teacher Mai');
    await act(async () => { finish(respond(studentBoard)); });
    expect(screen.queryByText('An Nguyen')).toBeNull();
    expect(screen.getByText('Teacher Mai')).toBeTruthy();
  });

  it('recovers from ranking errors and displays a Vietnamese empty state', async () => {
    fetcher.mockImplementation(async (path: string) => path.startsWith('/v1/courses') ? respond(courses) : respond({ error: { code: 'connection_error' } }, 500));
    render(<QuickLeaderboard locale="vi" userId="s2" />);
    expect((await screen.findByRole('alert')).textContent).toContain('Không thể tải bảng xếp hạng');
    fetcher.mockImplementation(async (path: string) => respond(path.startsWith('/v1/courses') ? courses : { track: 'student', total: 0, items: [] }));
    fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }));
    await screen.findByText('Chưa có thành tích để hiển thị');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('reports unavailable courses without adding fictional scope options', async () => {
    fetcher.mockImplementation(async (path: string) => path.startsWith('/v1/courses') ? respond({ error: { code: 'connection_error' } }, 500) : respond(studentBoard));
    render(<QuickLeaderboard locale="en" userId="s2" />);
    await screen.findByText('Unable to load course scopes. Refresh to try again.');
    expect(within(screen.getByRole('combobox')).getAllByRole('option')).toHaveLength(1);
    expect(screen.getByText('An Nguyen')).toBeTruthy();
    fetcher.mockImplementation(async (path: string) => respond(path.startsWith('/v1/courses') ? courses : studentBoard));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByRole('option', { name: 'Programming · CS101' });
    expect(screen.queryByText('Unable to load course scopes. Refresh to try again.')).toBeNull();
  });

  it('refreshes after 30 seconds and stops polling after unmount', async () => {
    vi.useFakeTimers();
    const view = render(<QuickLeaderboard locale="en" userId="s2" />);
    await act(async () => { await Promise.resolve(); });
    const initialCalls = fetcher.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(29999); });
    expect(fetcher).toHaveBeenCalledTimes(initialCalls);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetcher).toHaveBeenCalledTimes(initialCalls + 1);
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(fetcher).toHaveBeenCalledTimes(initialCalls + 1);
  });
});
