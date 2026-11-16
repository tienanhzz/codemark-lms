import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LeaderboardWorkspace } from '../components/LeaderboardWorkspace';

const transport = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../lib/api', () => ({ api: transport.api }));

const studentBoard = {
  track: 'student', total: 4,
  items: [
    { position: 1, userId: 's1', displayName: 'An Nguyen', username: 'an', exp: 4200, tier: { key: 'gold', name: 'Gold', thresholdExp: 3000, icon: 'fa-star', color: '#dda94c', description: '' } },
    { position: 2, userId: 's2', displayName: 'Binh Tran', username: 'binh', exp: 3200, tier: null },
    { position: 3, userId: 's3', displayName: 'Chi Le', username: 'chi', exp: 2100, tier: null },
    { position: 4, userId: 's4', displayName: 'Dung Pham', username: 'dung', exp: 800, tier: null },
  ],
};

describe('Leaderboard workspace', () => {
  it('opens teacher rankings from the staff link and ignores the initial student request', async () => {
    window.history.replaceState(null, '', '/leaderboard?track=staff');
    let finishStudent!: (value: unknown) => void;
    transport.api.mockImplementation((path: string) => path.includes('track=staff')
      ? Promise.resolve({ track: 'staff', total: 1, items: [{ position: 1, userId: 't1', displayName: 'Teacher Mai', username: 'mai', exp: 50, tier: null }] })
      : new Promise(resolve => { finishStudent = resolve; }));
    render(<LeaderboardWorkspace locale="en" />);
    const table = await screen.findByRole('table', { name: 'Teacher rankings' });
    expect(within(table).getByText('Teacher Mai')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Teachers' }).getAttribute('aria-pressed')).toBe('true');
    expect(transport.api).toHaveBeenCalledWith('/leaderboard?track=staff&q=');
    await act(async () => { finishStudent(studentBoard); });
    expect(screen.queryByText('An Nguyen')).toBeNull();
    expect(screen.getByRole('table', { name: 'Teacher rankings' })).toBeTruthy();
  });

  it('carries the earned tier artwork and tint through podium cards and full ranking rows', async () => {
    transport.api.mockResolvedValue(studentBoard);
    render(<LeaderboardWorkspace locale="en" userId="s1" />);
    const podium = await screen.findByRole('region', { name: 'Top three' });
    const card = within(podium).getAllByRole('article')[0];
    const row = within(screen.getByRole('table')).getByRole('row', { name: /1.*An Nguyen.*4,200.*Gold/ }) as HTMLElement;
    expect(within(card).getByRole('img', { name: 'Gold' }).getAttribute('src')).toBe('/ranks/gold.png');
    expect(within(row).getByRole('img', { name: 'Gold' }).getAttribute('src')).toBe('/ranks/gold.png');
    expect(card.style.getPropertyValue('--rank-background')).not.toBe('');
    expect(card.style.getPropertyValue('--rank-background')).toBe(row.style.getPropertyValue('--rank-background'));
    expect(row.getAttribute('aria-current')).toBe('true');
    const unranked = within(screen.getByRole('table')).getByRole('row', { name: /4.*Dung Pham.*800/ }) as HTMLElement;
    expect(unranked.style.getPropertyValue('--rank-background')).toBe('');
    expect(within(unranked).queryByRole('img')).toBeNull();
  });

  it('renders server ranking, the top three and the signed-in account without inventing points', async () => {
    let resolve!: (value: unknown) => void;
    transport.api.mockImplementation(() => new Promise((done) => { resolve = done; }));
    render(<LeaderboardWorkspace locale="en" userId="s4" />);
    expect(screen.getByRole('status').textContent).toContain('Loading');
    await act(async () => { resolve(studentBoard); });
    const podium = screen.getByRole('region', { name: 'Top three' });
    expect(within(podium).getByText('An Nguyen')).toBeTruthy();
    expect(within(podium).queryByText('Dung Pham')).toBeNull();
    const table = screen.getByRole('table', { name: 'Student rankings' });
    const mine = within(table).getByRole('row', { name: /4.*Dung Pham.*You.*800/ });
    expect(mine.getAttribute('aria-current')).toBe('true');
    expect(within(table).getByRole('row', { name: /1.*An Nguyen.*4,200.*Gold/ })).toBeTruthy();
    expect(transport.api).toHaveBeenCalledWith('/leaderboard?track=student&q=');
  });

  it('switches to staff rankings and clears the student search', async () => {
    transport.api.mockImplementation(async (path: string) => path.includes('track=staff')
      ? { track: 'staff', total: 1, items: [{ position: 1, userId: 't1', displayName: 'Teacher Mai', username: 'mai', exp: 50, tier: null }] }
      : studentBoard);
    render(<LeaderboardWorkspace locale="en" />);
    await screen.findByRole('table');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'An' } });
    fireEvent.click(screen.getByRole('button', { name: 'Teachers' }));
    await screen.findByRole('table', { name: 'Teacher rankings' });
    expect(screen.getByRole('searchbox').getAttribute('value')).toBe('');
    expect(screen.queryAllByText('Teacher Mai').length).toBeGreaterThan(0);
    expect(screen.queryByText('An Nguyen')).toBeNull();
    expect(transport.api).toHaveBeenCalledWith('/leaderboard?track=staff&q=');
  });

  it('keeps a three-person podium when participants share a rank', async () => {
    transport.api.mockResolvedValue({ ...studentBoard, items: studentBoard.items.map((entry) => ({ ...entry, position: 1, exp: 100, username: null })) });
    render(<LeaderboardWorkspace locale="en" />);
    const podium = await screen.findByRole('region', { name: 'Top three' });
    expect(within(podium).getAllByRole('article')).toHaveLength(3);
    expect(within(podium).queryByText('Dung Pham')).toBeNull();
    expect(within(screen.getByRole('table')).getByRole('row', { name: /1.*Dung Pham.*100/ })).toBeTruthy();
  });

  it('debounces search, keeps global positions and ignores an older response', async () => {
    let resolveOlder!: (value: unknown) => void;
    transport.api.mockImplementation((path: string) => {
      if (path.endsWith('q=old')) return new Promise((done) => { resolveOlder = done; });
      if (path.endsWith('q=new')) return Promise.resolve({ track: 'student', total: 1, items: [{ position: 22, userId: 'new', displayName: 'Newest Result', username: 'new', exp: 12, tier: null }] });
      return Promise.resolve(studentBoard);
    });
    render(<LeaderboardWorkspace locale="en" />);
    await screen.findByRole('table');
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'o' } });
    fireEvent.change(input, { target: { value: 'old' } });
    expect(transport.api).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(resolveOlder).toBeTypeOf('function'));
    fireEvent.change(input, { target: { value: ' new ' } });
    await screen.findByRole('row', { name: /22.*Newest Result.*12/ });
    await act(async () => { resolveOlder({ track: 'student', total: 1, items: [{ position: 8, userId: 'old', displayName: 'Outdated Result', username: 'old', exp: 42, tier: null }] }); });
    expect(screen.queryByText('Outdated Result')).toBeNull();
    expect(screen.getByText('Newest Result')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Top three' })).toBeNull();
    expect(transport.api).toHaveBeenCalledWith('/leaderboard?track=student&q=new');
  });

  it('shows Vietnamese error recovery and a real empty state', async () => {
    transport.api.mockRejectedValueOnce(new Error('connection_error'))
      .mockResolvedValue({ track: 'student', total: 0, items: [] });
    render(<LeaderboardWorkspace locale="vi" />);
    expect((await screen.findByRole('alert')).textContent).toContain('Không thể tải');
    fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }));
    await screen.findByText('Chưa có thành tích để hiển thị');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sinh viên' }).getAttribute('aria-pressed')).toBe('true');
  });
});
