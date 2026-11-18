import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { MissionsWorkspace } from '../components/MissionsWorkspace';

const transport = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../lib/api', async (original) => ({ ...(await original<typeof import('../lib/api')>()), api: transport.api }));
const quest = (code: string, role = 'student', status = 'active') => ({ questCode: code, targetRole: role, category: 'Học thuật', questName: code === 'STU_ASSIGN_EARLY' ? 'Chiến thần Deadline' : code, conditionDesc: 'Nộp trước deadline tối thiểu 24 giờ', resetType: 'UPGRADE_TIER', limitRule: 'Không cộng dồn', progress: status === 'complete' ? 1 : 0, status, targetCount: 1, cycleLimit: 1, actionHref: '/assessments', reviewRequired: false, reward: { exp: 0, coin: 0 }, active: true, revision: 1 });
beforeEach(() => { transport.api.mockReset(); window.history.replaceState({}, '', '/missions'); });

it('shows workbook columns, required navigation and completed status without client claims', async () => {
  transport.api.mockResolvedValue({ items: [quest('STU_ASSIGN_EARLY'), quest('STU_DONE', 'student', 'complete')] });
  render(<MissionsWorkspace locale="vi" roles={['student']} />);
  const row = (await screen.findByText('Chiến thần Deadline')).closest('tr')!;
  expect(screen.getByRole('columnheader', { name: 'Mã nhiệm vụ' })).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: 'Giới hạn chống spam' })).toBeTruthy();
  expect(within(row).getByRole('link', { name: 'Làm nhiệm vụ' }).getAttribute('href')).toBe('/assessments');
  expect(screen.getByText('Đã hoàn thành')).toBeTruthy();
  expect(screen.queryByText('Claim reward')).toBeNull();
});

it('separates teacher missions from management of student quests', async () => {
  transport.api.mockImplementation(async (path: string) => ({ items: path === '/quests/manage' ? [quest('STU_EDIT')] : path.includes('evidence') ? [] : [quest('LEC_OWN', 'teacher'), quest('STU_HIDDEN')] }));
  render(<MissionsWorkspace locale="vi" roles={['teacher']} />);
  await screen.findByText('LEC_OWN', { selector: 'strong' });
  expect(screen.queryByText('STU_HIDDEN')).toBeNull();
  expect(screen.queryByText('STU_EDIT')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Quản lý nhiệm vụ' }));
  await screen.findByText('STU_EDIT', { selector: 'strong' });
  expect(screen.queryByText('LEC_OWN')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa STU_EDIT' }));
  await userEvent.clear(screen.getByLabelText('Tên nhiệm vụ'));
  await userEvent.type(screen.getByLabelText('Tên nhiệm vụ'), 'Tên đã sửa');
  await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
  await waitFor(() => expect(transport.api).toHaveBeenCalledWith('/quests/manage/STU_EDIT', 'PATCH', expect.objectContaining({ questName: 'Tên đã sửa', revision: 1 })));
});

it('confirms daily attendance only through its authorized check-in endpoint', async () => {
  window.history.replaceState({}, '', '/missions?checkin=1');
  transport.api.mockResolvedValue({ items: [quest('STU_LOGIN_DAILY')] });
  render(<MissionsWorkspace locale="vi" roles={['student']} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Xác nhận điểm danh hôm nay' }));
  await waitFor(() => expect(transport.api).toHaveBeenCalledWith('/quests/check-in', 'POST'));
  expect(transport.api.mock.calls.every(([path]) => path !== '/quests/events')).toBe(true);
});
