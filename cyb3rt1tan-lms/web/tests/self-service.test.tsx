import { render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PasswordRecovery } from '../components/PasswordRecovery';
import { PersonalProfilePanel } from '../components/PersonalProfilePanel';
import { PersonalSessionsPanel } from '../components/PersonalSessionsPanel';
import { IdentityPolicyPanel } from '../components/IdentityPolicyPanel';

const transport = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  api: transport.api,
}));
const profile = {
  id: 'fixture-user',
  username: 'student',
  officialName: 'Official Student',
  email: 'student@example.test',
  nickname: null,
  roles: ['student'],
  revision: 2,
  institutionalId: 'S001',
  contactEmail: null,
  phone: null,
  about: '',
  academicTitle: '',
  showEmailInCourses: false,
  nextNicknameChangeAt: null,
  avatarUploadAvailable: false,
};

describe('Self-service workflows in a simulated DOM; no browser or network', () => {
  it('disables email recovery when SMTP is unavailable and can retry', async () => {
    transport.api.mockResolvedValue({ available: false });
    const user = userEvent.setup();
    render(<PasswordRecovery />);
    await screen.findByText(/Khôi phục qua email chưa khả dụng/);
    const submit = screen.getByRole('button', { name: 'Gửi hướng dẫn khôi phục' });
    expect(submit.matches(':disabled')).toBe(true);
    transport.api.mockResolvedValue({ available: true });
    await user.click(screen.getByRole('button', { name: 'Tải lại' }));
    await waitFor(() => expect(submit.matches(':disabled')).toBe(false));
  });

  it('shows generic recovery confirmation without revealing account existence', async () => {
    transport.api.mockImplementation(async (path: string) =>
      path.endsWith('/status') ? { available: true } : { message: 'generic' },
    );
    const user = userEvent.setup();
    render(<PasswordRecovery />);
    const email = await screen.findByLabelText('Email chính thức');
    await waitFor(() => expect((email as HTMLInputElement).disabled).toBe(false));
    await user.type(email, 'unknown@example.test');
    await user.click(screen.getByRole('button', { name: 'Gửi hướng dẫn khôi phục' }));
    await screen.findByRole('status');
    expect(screen.getByText(/Nếu có tài khoản phù hợp/)).toBeTruthy();
    expect(transport.api).toHaveBeenCalledWith('/auth/password-resets', 'POST', {
      email: 'unknown@example.test',
    });
  });

  it('removes the fragment immediately, validates confirmation, submits the token only in the body', async () => {
    const token = 'test_token_'.repeat(6);
    window.history.replaceState(null, '', '/reset-password#token=' + token);
    transport.api.mockResolvedValue(null);
    const user = userEvent.setup();
    render(
      <StrictMode>
        <PasswordRecovery reset />
      </StrictMode>,
    );
    await screen.findByLabelText('Mật khẩu mới');
    expect(window.location.hash).toBe('');
    expect(transport.api).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'A new fixture password!');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'Different fixture password!');
    await user.click(screen.getByRole('button', { name: 'Đặt mật khẩu mới' }));
    expect(screen.getByRole('alert').textContent).toContain('chưa khớp');
    expect(transport.api).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('Xác nhận mật khẩu mới'));
    await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'A new fixture password!');
    await user.click(screen.getByRole('button', { name: 'Đặt mật khẩu mới' }));
    await screen.findByText(/Đã đổi mật khẩu/);
    expect(transport.api).toHaveBeenCalledWith('/auth/password-resets/complete', 'POST', {
      token,
      new_password: 'A new fixture password!',
    });
    expect(window.sessionStorage.length + window.localStorage.length).toBe(0);
    expect(screen.queryByLabelText('Mật khẩu mới')).toBeNull();
  });

  it('rejects query-only tokens and requires the fragment link', async () => {
    window.history.replaceState(null, '', '/reset-password?token=not-accepted');
    render(<PasswordRecovery reset />);
    expect(screen.getByRole('alert').textContent).toContain('Liên kết không hợp lệ');
    expect(screen.queryByRole('button', { name: 'Đặt mật khẩu mới' })).toBeNull();
    expect(transport.api).not.toHaveBeenCalled();
  });

  it('saves a revision-bound personal profile and leaves official identity out of the command', async () => {
    const changed = vi.fn();
    transport.api.mockImplementation(async (_path: string, method?: string) =>
      method === 'PATCH' ? { ...profile, nickname: 'Learner', revision: 3 } : profile,
    );
    const user = userEvent.setup();
    render(<PersonalProfilePanel locale="en" timeZone="UTC" onChanged={changed} />);
    await user.type(await screen.findByLabelText('Nickname'), 'Learner');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Changes saved.');
    const command = transport.api.mock.calls.find((args) => args[1] === 'PATCH')![2];
    expect(command).toMatchObject({ expectedRevision: 2, nickname: 'Learner' });
    expect(command).not.toHaveProperty('officialName');
    expect(command).not.toHaveProperty('roles');
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ revision: 3 }));
    expect(
      (screen.getByRole('button', { name: 'Upload profile image' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('explains the nickname cooldown and allows contact edits', async () => {
    transport.api.mockResolvedValue({
      ...profile,
      nickname: 'Learner',
      nextNicknameChangeAt: '2099-06-01T00:00:00Z',
    });
    render(<PersonalProfilePanel locale="en" timeZone="Asia/Bangkok" onChanged={vi.fn()} />);
    const nickname = await screen.findByLabelText('Nickname');
    expect((nickname as HTMLInputElement).readOnly).toBe(true);
    expect(screen.getByText(/Next nickname change allowed/).textContent).toContain('Asia/Bangkok');
    expect((screen.getByLabelText('Contact email (optional)') as HTMLInputElement).readOnly).toBe(
      false,
    );
  });

  it('reauthenticates before ending the current session and signs out only on success', async () => {
    const signedOut = vi.fn();
    const item = {
      id: 'public-session-id',
      current: true,
      mfaAuthenticated: true,
      createdAt: '2026-01-01T01:00:00Z',
      expiresAt: '2099-01-01T01:00:00Z',
    };
    transport.api.mockImplementation(async (_path: string, method?: string) => {
      if (method === 'POST') throw new Error('invalid_current_password');
      return { items: [item] };
    });
    const user = userEvent.setup();
    render(<PersonalSessionsPanel locale="en" timeZone="UTC" onSignedOut={signedOut} />);
    await user.click(await screen.findByRole('button', { name: 'End session' }));
    const modal = await screen.findByRole('dialog', { name: 'End session' });
    await user.type(within(modal).getByLabelText('Current password'), 'A fixture password!');
    await user.click(within(modal).getByRole('button', { name: 'End session' }));
    await within(modal).findByRole('alert');
    expect(signedOut).not.toHaveBeenCalled();
    transport.api.mockResolvedValueOnce(null);
    await user.click(within(modal).getByRole('button', { name: 'End session' }));
    await waitFor(() => expect(signedOut).toHaveBeenCalledTimes(1));
    expect(transport.api).toHaveBeenLastCalledWith(
      '/me/sessions/public-session-id/revoke',
      'POST',
      { current_password: 'A fixture password!' },
    );
  });

  it('submits reason and revision with nickname policy changes', async () => {
    transport.api.mockResolvedValue({ revision: 0, nicknameCooldownDays: 7, blockedTerms: [] });
    const user = userEvent.setup();
    render(<IdentityPolicyPanel locale="en" />);
    await user.type(await screen.findByLabelText('Blocked terms (one per line)'), 'first\nsecond');
    await user.type(
      screen.getByLabelText('Reason for this policy change'),
      'Updated moderation policy',
    );
    transport.api.mockResolvedValueOnce({
      revision: 1,
      nicknameCooldownDays: 7,
      blockedTerms: ['first', 'second'],
    });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Changes saved.');
    expect(transport.api).toHaveBeenLastCalledWith('/admin/identity-policy', 'PUT', {
      expectedRevision: 0,
      nicknameCooldownDays: 7,
      blockedTerms: ['first', 'second'],
      reason: 'Updated moderation policy',
    });
  });
});
