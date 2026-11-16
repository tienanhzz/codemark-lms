import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WeeklyTimetable } from '../components/WeeklyTimetable';

const transport = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../lib/api', () => ({ api: transport.api }));

const session = {
  id: 'session-1', courseId: 'course-1', courseCode: 'CS101', courseTitle: 'Introduction to computing',
  title: 'Arrays and loops', startsAt: '2026-11-16T01:00:00Z', endsAt: '2026-11-16T03:30:00Z', room: 'A201',
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Monday in Bangkok, still Sunday in UTC.
  vi.setSystemTime(new Date('2026-11-15T18:00:00Z'));
  transport.api.mockReset();
});
afterEach(() => { vi.useRealTimers(); });

function requestedRange(call: number) {
  const path = transport.api.mock.calls[call][0] as string;
  const params = new URL(path, 'http://localhost').searchParams;
  return { fromAt: params.get('fromAt'), toAt: params.get('toAt') };
}

describe('Weekly timetable', () => {
  it('renders real sessions in a Monday to Sunday time grid and opens exact details', async () => {
    let finish!: (value: unknown) => void;
    transport.api.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<WeeklyTimetable locale="en" timeZone="Asia/Bangkok" />);
    expect(screen.getByRole('status').textContent).toContain('Loading');
    await act(async () => { finish({ items: [session] }); });
    expect(screen.getByRole('heading', { name: 'Weekly timetable' })).toBeTruthy();
    const grid = screen.getByRole('region', { name: 'Weekly timetable grid' });
    const days = within(grid).getAllByRole('group');
    expect(days).toHaveLength(7);
    expect(days[0].getAttribute('aria-label')).toBe('Monday, November 16, 2026');
    expect(days[6].getAttribute('aria-label')).toBe('Sunday, November 22, 2026');
    expect(within(grid).getByText('06:00')).toBeTruthy();
    expect(within(grid).getByText('22:00')).toBeTruthy();
    const event = within(days[0]).getByRole('button', { name: /CS101.*Arrays and loops.*08:00.*10:30.*A201/ });
    expect(event.style.top).toBe('128px');
    expect(event.style.height).toBe('156px');
    fireEvent.click(event);
    const details = screen.getByRole('dialog', { name: 'Session details' });
    expect(within(details).getByText('Introduction to computing')).toBeTruthy();
    expect(within(details).getByText('A201')).toBeTruthy();
    expect(details.textContent).toContain('08:00');
    expect(details.textContent).toContain('10:30');
    expect(requestedRange(0)).toEqual({ fromAt: '2026-11-15T17:00:00.000Z', toAt: '2026-11-22T17:00:00.000Z' });
  });

  it('navigates adjacent weeks and returns to the current week', async () => {
    transport.api.mockResolvedValue({ items: [] });
    render(<WeeklyTimetable locale="en" timeZone="Asia/Bangkok" />);
    await screen.findByText('No sessions scheduled this week');
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    await waitFor(() => expect(transport.api).toHaveBeenCalledTimes(2));
    expect(requestedRange(1)).toEqual({ fromAt: '2026-11-08T17:00:00.000Z', toAt: '2026-11-15T17:00:00.000Z' });
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    await waitFor(() => expect(transport.api).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    await waitFor(() => expect(transport.api).toHaveBeenCalledTimes(4));
    expect(requestedRange(3).fromAt).toBe('2026-11-22T17:00:00.000Z');
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    await waitFor(() => expect(transport.api).toHaveBeenCalledTimes(5));
    expect(requestedRange(4).fromAt).toBe('2026-11-15T17:00:00.000Z');
  });

  it('puts overlapping sessions side by side and gives later sessions full width', async () => {
    transport.api.mockResolvedValue({ items: [session,
      { ...session, id: 'overlap', courseCode: 'CS102', title: 'Lab', startsAt: '2026-11-16T02:00:00Z', endsAt: '2026-11-16T04:00:00Z' },
      { ...session, id: 'later', title: 'Afternoon practice', startsAt: '2026-11-16T06:00:00Z', endsAt: '2026-11-16T07:00:00Z' },
    ] });
    render(<WeeklyTimetable locale="en" timeZone="Asia/Bangkok" />);
    const first = await screen.findByRole('button', { name: /CS101.*Arrays and loops/ });
    const overlap = screen.getByRole('button', { name: /CS102.*Lab/ });
    const later = screen.getByRole('button', { name: /Afternoon practice/ });
    expect(first.style.width).toBe('calc(50% - 6px)');
    expect(overlap.style.width).toBe('calc(50% - 6px)');
    expect(first.style.left).not.toBe(overlap.style.left);
    expect(later.style.width).toBe('calc(100% - 6px)');
  });

  it('splits overnight sessions into their local days and expands the time axis', async () => {
    transport.api.mockResolvedValue({ items: [{ ...session, startsAt: '2026-11-17T16:00:00Z', endsAt: '2026-11-17T18:00:00Z' }] });
    render(<WeeklyTimetable locale="en" timeZone="Asia/Bangkok" />);
    const grid = await screen.findByRole('region', { name: 'Weekly timetable grid' });
    const tuesday = within(grid).getByRole('group', { name: 'Tuesday, November 17, 2026' });
    const wednesday = within(grid).getByRole('group', { name: 'Wednesday, November 18, 2026' });
    expect(within(tuesday).getByRole('button', { name: /23:00.*24:00/ })).toBeTruthy();
    expect(within(wednesday).getByRole('button', { name: /00:00.*01:00/ })).toBeTruthy();
    expect(within(grid).getByText('00:00')).toBeTruthy();
    expect(within(grid).getByText('24:00')).toBeTruthy();
  });

  it('handles a 169 hour DST week and uses the selected timezone for week boundaries', async () => {
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    transport.api.mockResolvedValue({ items: [] });
    const view = render(<WeeklyTimetable locale="en" timeZone="America/New_York" />);
    await screen.findByText('No sessions scheduled this week');
    expect(requestedRange(0)).toEqual({ fromAt: '2026-10-26T04:00:00.000Z', toAt: '2026-11-02T05:00:00.000Z' });
    view.rerender(<WeeklyTimetable locale="vi" timeZone="Asia/Ho_Chi_Minh" />);
    await waitFor(() => expect(transport.api).toHaveBeenCalledTimes(2));
    expect(requestedRange(1)).toEqual({ fromAt: '2026-10-25T17:00:00.000Z', toAt: '2026-11-01T17:00:00.000Z' });
    expect(screen.getByRole('heading', { name: 'Thời khóa biểu tuần' })).toBeTruthy();
  });

  it('shows a recoverable error and an empty timetable without sample classes', async () => {
    transport.api.mockRejectedValueOnce(new Error('connection_error')).mockResolvedValue({ items: [] });
    render(<WeeklyTimetable locale="vi" timeZone="Asia/Bangkok" />);
    expect((await screen.findByRole('alert')).textContent).toContain('Không thể tải thời khóa biểu');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findByText('Chưa có buổi học trong tuần này');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('region', { name: 'Lưới thời khóa biểu tuần' })).toBeTruthy();
    expect(screen.queryByText('CS101')).toBeNull();
  });

  it('keeps actual clock times and offsets when a session crosses a repeated DST hour', async () => {
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    transport.api.mockResolvedValue({ items: [{ ...session, startsAt: '2026-11-01T05:45:00Z', endsAt: '2026-11-01T06:15:00Z' }] });
    render(<WeeklyTimetable locale="en" timeZone="America/New_York" />);
    const event = await screen.findByRole('button', { name: /01:45.*01:15/ });
    fireEvent.click(event);
    const details = screen.getByRole('dialog', { name: 'Session details' });
    expect(details.textContent).toContain('01:45 GMT-4');
    expect(details.textContent).toContain('01:15 GMT-5');
  });

  it.each([
    ['America/Havana', '2026-11-01T12:00:00Z'],
    ['America/Santiago', '2026-09-06T12:00:00Z'],
  ])('renders an empty week when midnight is repeated or skipped in %s', async (timeZone, now) => {
    vi.setSystemTime(new Date(now));
    transport.api.mockResolvedValue({ items: [] });
    render(<WeeklyTimetable locale="en" timeZone={timeZone} />);
    await screen.findByText('No sessions scheduled this week');
    expect(within(screen.getByRole('region', { name: 'Weekly timetable grid' })).getAllByRole('group')).toHaveLength(7);
  });

  it('includes both occurrences of a repeated midnight in the correct day', async () => {
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    transport.api.mockResolvedValue({ items: [
      { ...session, id: 'first-midnight', title: 'First midnight', startsAt: '2026-11-01T04:15:00Z', endsAt: '2026-11-01T04:45:00Z' },
      { ...session, id: 'second-midnight', title: 'Repeated midnight', startsAt: '2026-11-01T05:15:00Z', endsAt: '2026-11-01T05:45:00Z' },
    ] });
    render(<WeeklyTimetable locale="en" timeZone="America/Havana" />);
    const sunday = await screen.findByRole('group', { name: 'Sunday, November 1, 2026' });
    const first = within(sunday).getByRole('button', { name: /First midnight.*00:15.*00:45/ });
    expect(within(sunday).getByRole('button', { name: /Repeated midnight.*00:15.*00:45/ })).toBeTruthy();
    fireEvent.click(first);
    expect(screen.getByRole('dialog', { name: 'Session details' }).textContent).toContain('00:15 GMT-4');
  });

  it('starts a skipped-midnight day at its first valid clock time without inventing midnight', async () => {
    vi.setSystemTime(new Date('2026-09-06T12:00:00Z'));
    transport.api.mockResolvedValue({ items: [{ ...session, startsAt: '2026-09-06T03:30:00Z', endsAt: '2026-09-06T04:30:00Z' }] });
    render(<WeeklyTimetable locale="en" timeZone="America/Santiago" />);
    const saturday = await screen.findByRole('group', { name: 'Saturday, September 5, 2026' });
    const sunday = screen.getByRole('group', { name: 'Sunday, September 6, 2026' });
    expect(within(saturday).getByRole('button', { name: /23:30.*24:00/ })).toBeTruthy();
    expect(within(sunday).getByRole('button', { name: /01:00.*01:30/ })).toBeTruthy();
  });

  it('ignores an old week response after navigating', async () => {
    let finishOld!: (value: unknown) => void;
    transport.api.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
      .mockResolvedValue({ items: [{ ...session, id: 'next', title: 'Next week session', startsAt: '2026-11-23T01:00:00Z', endsAt: '2026-11-23T03:00:00Z' }] });
    render(<WeeklyTimetable locale="en" timeZone="Asia/Bangkok" />);
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    await screen.findByRole('button', { name: /Next week session/ });
    await act(async () => { finishOld({ items: [session] }); });
    expect(screen.queryByRole('button', { name: /Arrays and loops/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Next week session/ })).toBeTruthy();
  });
});
