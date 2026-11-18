import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Workspace } from '../components/Workspace';
import { CsvImportPanel } from '../components/CsvImportPanel';
import { AdminAccounts } from '../components/AdminAccounts';
import { AcceptInvitation } from '../components/AcceptInvitation';

const transport = vi.hoisted(() => ({ api: vi.fn(), csv: vi.fn(), push: vi.fn() }));
vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  api: transport.api,
  apiCsv: transport.csv,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: transport.push }) }));
const account = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'test.admin',
  officialName: 'Test Admin',
  email: 'admin@example.test',
  roles: ['admin'],
};
const preferences = {
  locale: 'en',
  theme: 'light',
  colorPalette: 'navy-cyan-gold',
  timeZone: 'UTC',
};

describe('Identity UI behavior in a simulated DOM, without browser automation or network', () => {
  it('completes required MFA and keeps recovery codes visible until explicitly saved', async () => {
    let verified = false;
    transport.api.mockImplementation(async (path: string) => {
      if (path === '/me') {
        if (!verified) throw new Error('authentication_required');
        return account;
      }
      if (path === '/auth/login')
        return { mfaSetupToken: 'challenge-token-for-unit-test', expiresInSeconds: 600 };
      if (path === '/auth/mfa/enrollment')
        return {
          secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
          otpauthUri: 'otpauth://totp/CodeMark:test?secret=JBSWY3DPEHPK3PXP',
          expiresAt: '2099-01-01T00:00:00Z',
        };
      if (path === '/auth/mfa/enrollment/confirm') {
        verified = true;
        return {
          user: account,
          recoveryCodes: Array.from({ length: 10 }, (_, index) => String(index).padStart(16, '0')),
        };
      }
      if (path === '/me/preferences') return preferences;
      if (path === '/workspace/summary')
        return {
          build: 'test',
          metrics: { accounts: 1, courses: 0, assessments: 0 },
          activity: [],
          courses: [],
          isAdmin: true,
        };
      throw new Error('Unexpected API call: ' + path);
    });
    const user = userEvent.setup();
    render(<Workspace initialView="login" />);
    await screen.findByRole('button', { name: /^Sign in$/ });
    await user.type(screen.getByLabelText('Student ID / Gmail / username'), 'test.admin');
    await user.type(screen.getByLabelText(/^Password$/), 'Test-only password!');
    await user.click(screen.getByText('Multi-factor authentication'));
    await user.type(screen.getByLabelText('6-digit authenticator code'), '123456');
    await user.click(screen.getByRole('button', { name: /^Sign in$/ }));
    await screen.findByText('Your role requires MFA before you can sign in.');
    expect(transport.api).toHaveBeenCalledWith(
      '/auth/login',
      'POST',
      expect.objectContaining({ mfa_code: '123456' }),
    );
    await user.click(screen.getByRole('button', { name: /^Continue$/ }));
    await screen.findByText('Scan this QR code in your authenticator app');
    await user.type(screen.getByLabelText('6-digit authenticator code'), '654321');
    await user.click(screen.getByRole('button', { name: 'Verify & enable MFA' }));
    const modal = await screen.findByRole('dialog', { name: 'Save your recovery codes' });
    expect(within(modal).getAllByText(/^0{15}[0-9]$/)).toHaveLength(10);
    const finish = within(modal).getByRole('button', { name: 'Continue to sign in' });
    expect(finish.hasAttribute('disabled')).toBe(true);
    await user.click(within(modal).getByLabelText('I have saved these recovery codes.'));
    await user.click(finish);
    await screen.findByRole('heading', { name: /Every day/ });
  });

  it('binds CSV preview to its checksum and requires approval before commit', async () => {
    const bytes = new TextEncoder().encode(
      'username,email,official_name,institutional_id,role\ntest,test@example.test,Test,T1,student\n',
    ).buffer;
    const file = new File([bytes], 'users.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes });
    transport.api.mockResolvedValue({ jobId: 'job-test', status: 'created' });
    transport.csv.mockImplementation(
      async (path: string, _body: ArrayBuffer, headers: Record<string, string>) =>
        path.endsWith('/preview')
          ? {
              jobId: 'job-test',
              fileChecksum: headers['X-File-SHA256'],
              previewToken: 'private-preview-token',
              duplicatePolicy: 'upsert',
              summary: { totalRows: 1, create: 1, update: 0, skip: 0, reject: 0 },
              rows: [{ rowNumber: 2, action: 'create', errorCodes: [] }],
              expiresAt: '2099-01-01T00:00:00Z',
            }
          : {
              jobId: 'job-test',
              status: 'committed',
              invitationDelivery: { sent: 0, failed: 1 },
              committedAt: '2026-11-14T00:00:00Z',
              summary: {},
            },
    );
    const user = userEvent.setup();
    render(<CsvImportPanel locale="en" />);
    await user.upload(screen.getByLabelText('CSV file'), file);
    await user.click(screen.getByRole('button', { name: 'Preview changes' }));
    const commit = await screen.findByRole('button', { name: 'Apply import' });
    expect(commit.hasAttribute('disabled')).toBe(true);
    await user.click(
      screen.getByLabelText('I have reviewed these changes and authorize this import.'),
    );
    await user.click(commit);
    await screen.findByRole('heading', { name: 'Import committed' });
    expect(transport.csv).toHaveBeenLastCalledWith(
      '/admin/csv-imports/job-test/commit',
      bytes,
      expect.objectContaining({
        'X-Preview-Token': 'private-preview-token',
        'X-Confirm': 'true',
        'X-File-SHA256': expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(screen.getByText(/These accounts remain invited/)).toBeTruthy();
  });

  it('requires an audit reason and the loaded revision when changing account roles', async () => {
    let assigned = ['student'];
    const person = {
      ...account,
      id: '22222222-2222-4222-8222-222222222222',
      username: 'test.student',
      officialName: 'Test Student',
      roles: assigned,
      institutionalId: 'T2',
      status: 'active',
      revision: 3,
      createdAt: '2026-11-14T00:00:00Z',
      mfaEnabled: false,
    };
    transport.api.mockImplementation(async (path: string, method?: string, body?: unknown) => {
      if (path === '/admin/identity/status') return { smtpConfigured: false, mfaConfigured: true };
      if (path.startsWith('/admin/users?'))
        return { items: [{ ...person, roles: assigned }], nextCursor: null };
      if (path.endsWith('/sessions')) return { items: [] };
      if (method === 'PATCH') {
        assigned = (body as { roles: string[] }).roles;
        return { ...person, roles: assigned, revision: 4 };
      }
      return { ...person, roles: assigned };
    });
    const user = userEvent.setup();
    render(
      <AdminAccounts
        locale="en"
        ownId={account.id}
        roleLabel={(role) => ({ teacher: 'Teacher', student: 'Student' })[role] || role}
      />,
    );
    expect(
      (await screen.findByRole('button', { name: 'Invite a person' })).hasAttribute('disabled'),
    ).toBe(true);
    await user.click(await screen.findByRole('button', { name: 'View details' }));
    const modal = await screen.findByRole('region', { name: 'Test Student' });
    await user.click(within(modal).getByRole('tab', { name: 'Roles & access' }));
    await user.click(within(modal).getByLabelText('Teacher'));
    await user.click(within(modal).getByRole('button', { name: 'Save roles' }));
    await user.click(within(modal).getByRole('button', { name: 'Confirm change' }));
    expect(transport.api.mock.calls.some((call) => call[1] === 'PATCH')).toBe(false);
    await user.type(within(modal).getByLabelText('Reason for this change'), 'Teaching assignment');
    await user.click(within(modal).getByRole('button', { name: 'Confirm change' }));
    await waitFor(() =>
      expect(transport.api).toHaveBeenCalledWith('/admin/users/' + person.id + '/roles', 'PATCH', {
        reason: 'Teaching assignment',
        roles: ['student', 'teacher'],
        expectedRevision: 3,
      }),
    );
  });

  it('removes an invitation fragment from the URL and submits it only in the acceptance body', async () => {
    const token = 'test-invitation-token-unit-only';
    window.history.replaceState(null, '', '/accept-invitation#token=' + token);
    transport.api.mockResolvedValue({ user: account });
    const accepted = vi.fn();
    const user = userEvent.setup();
    render(<AcceptInvitation locale="en" onAccepted={accepted} />);
    await waitFor(() => expect(window.location.hash).toBe(''));
    await user.type(screen.getByLabelText('Username'), 'new.student');
    await user.type(screen.getByLabelText('Official name'), 'New Student');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'A new password 12345');
    await user.type(screen.getByLabelText('Confirm password'), 'A new password 12345');
    await user.click(screen.getByRole('button', { name: 'Create my account' }));
    await waitFor(() => expect(accepted).toHaveBeenCalledOnce());
    expect(transport.api).toHaveBeenCalledWith(
      '/auth/accept-invitation',
      'POST',
      expect.objectContaining({ token }),
    );
  });
});
