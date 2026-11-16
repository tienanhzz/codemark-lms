import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CsvImportPanel } from '../components/CsvImportPanel';
import { AccountExportsPanel } from '../components/AccountExportsPanel';
import { AdminAccounts } from '../components/AdminAccounts';

const transport = vi.hoisted(() => ({
  api: vi.fn(),
  csv: vi.fn(),
  download: vi.fn(),
  blob: vi.fn(),
}));
vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  api: transport.api,
  apiCsv: transport.csv,
  apiDownload: transport.download,
}));
vi.mock('../components/IdentityShared', async (original) => ({
  ...(await original<typeof import('../components/IdentityShared')>()),
  downloadBlob: transport.blob,
}));
const job = {
  id: 'fixture-export-id',
  kind: 'users',
  format: 'xlsx',
  rowCount: 7,
  expiresAt: '2099-01-01T00:00:00Z',
  downloadPath: '/v1/admin/account-exports/fixture-export-id/download',
};
const preview = {
  jobId: 'enrollment-job',
  previewToken: 'preview-fixture',
  fileChecksum: 'checksum',
  duplicatePolicy: 'upsert',
  expiresAt: '2099-01-01T00:00:00Z',
  summary: { totalRows: 1, create: 1, update: 0, skip: 0, reject: 0 },
  rows: [{ rowNumber: 2, action: 'create', errorCodes: [] }],
};

describe('Provisioning and export UI in a simulated DOM, without browser/network', () => {
  it('restricts assistant imports to enrollment and binds preview/commit to that kind', async () => {
    transport.api.mockResolvedValue({ jobId: 'enrollment-job' });
    transport.csv.mockImplementation(async (path: string) =>
      path.endsWith('/preview')
        ? preview
        : { status: 'committed', invitationDelivery: { sent: 0, failed: 0 } },
    );
    const user = userEvent.setup();
    const bytes = new TextEncoder().encode(
      'institutional_id,username,course_id,section_id,status\n,student,uuid,A1,active\n',
    ).buffer;
    const file = new File([bytes], 'enrollments.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes });
    render(<CsvImportPanel locale="en" allowUserImports={false} />);
    expect(screen.queryByRole('option', { name: /Accounts v1/ })).toBeNull();
    expect((screen.getByLabelText('Import template') as HTMLSelectElement).value).toBe(
      'enrollments-v1',
    );
    const input = document.querySelector('input[type="file"]')!;
    await user.upload(input as HTMLInputElement, file);
    await user.click(screen.getByRole('button', { name: 'Preview changes' }));
    await screen.findByText('checksum');
    expect(transport.api).toHaveBeenCalledWith(
      '/admin/csv-imports',
      'POST',
      expect.objectContaining({ importKind: 'enrollments', templateVersion: 1 }),
    );
    const commit = screen.getByRole('button', { name: 'Apply import' });
    expect(commit.matches(':disabled')).toBe(true);
    await user.click(screen.getByRole('checkbox'));
    await user.click(commit);
    await screen.findByRole('heading', { name: /Import committed/ });
    expect(transport.csv).toHaveBeenLastCalledWith(
      '/admin/csv-imports/enrollment-job/commit',
      bytes,
      expect.objectContaining({ 'X-Preview-Token': preview.previewToken, 'X-Confirm': 'true' }),
    );
    expect(screen.queryByText(/^Sent:/)).toBeNull();
  });

  it('clears a user preview when switching templates and supports v2', async () => {
    const user = userEvent.setup();
    render(<CsvImportPanel locale="en" />);
    await user.selectOptions(screen.getByLabelText('Import template'), 'users-v2');
    expect(screen.getByText(/An optional course creates/)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Import template'), 'enrollments-v1');
    expect(screen.queryByText(/An optional course creates/)).toBeNull();
    expect(screen.getByText(/Match an existing student/)).toBeTruthy();
    expect(transport.api).not.toHaveBeenCalled();
  });

  it('prepares an export with current filters and downloads only after a separate explicit click', async () => {
    transport.api.mockResolvedValue(job);
    const blob = new Blob(['xlsx-fixture'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    transport.download.mockResolvedValue(blob);
    const user = userEvent.setup();
    render(
      <AccountExportsPanel
        locale="en"
        timeZone="UTC"
        filters={{ query: 'test', source: 'csv', facultyId: 'cs', status: '' }}
      />,
    );
    await user.selectOptions(screen.getByLabelText('File format'), 'xlsx');
    await user.type(screen.getByLabelText('Reason for exporting'), 'Authorized review');
    await user.click(screen.getByRole('button', { name: 'Prepare export' }));
    await screen.findByRole('heading', { name: 'Export is ready' });
    expect(transport.api).toHaveBeenCalledWith('/admin/account-exports', 'POST', {
      kind: 'users',
      format: 'xlsx',
      query: 'test',
      source: 'csv',
      facultyId: 'cs',
      reason: 'Authorized review',
    });
    expect(transport.download).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Download file' }));
    await screen.findByText('File downloaded.');
    expect(transport.download).toHaveBeenCalledWith(
      '/admin/account-exports/fixture-export-id/download',
    );
    expect(transport.blob).toHaveBeenCalledWith('codemark-fixture-export-id.xlsx', blob);
  });

  it('handles stale and expired exports without reporting a successful download', async () => {
    transport.api.mockResolvedValue(job);
    transport.download.mockRejectedValue(new Error('export_stale'));
    const user = userEvent.setup();
    render(<AccountExportsPanel locale="en" filters={{}} />);
    await user.type(screen.getByLabelText('Reason for exporting'), 'Authorized review');
    await user.click(screen.getByRole('button', { name: 'Prepare export' }));
    await user.click(await screen.findByRole('button', { name: 'Download file' }));
    expect((await screen.findByRole('alert')).textContent).toContain('selected records changed');
    expect(transport.blob).not.toHaveBeenCalled();
    transport.api.mockResolvedValueOnce({ ...job, expiresAt: '2000-01-01T00:00:00Z' });
    await user.click(screen.getByRole('button', { name: 'Prepare export' }));
    await screen.findByText('This export expired. Prepare a new one.');
    expect(screen.getByRole('button', { name: 'Download file' }).matches(':disabled')).toBe(true);
  });

  it('sends faculty, course and source account filters to the server', async () => {
    transport.api.mockImplementation(async (path: string) =>
      path === '/admin/identity/status'
        ? { smtpConfigured: false, mfaConfigured: true }
        : { items: [], nextCursor: null },
    );
    const user = userEvent.setup();
    render(<AdminAccounts locale="en" ownId="own" timeZone="UTC" roleLabel={(role) => role} />);
    await user.type(screen.getByLabelText('Faculty ID'), 'cs');
    await user.type(screen.getByLabelText('Course UUID'), 'fixture-course');
    await user.selectOptions(screen.getByLabelText('Provisioning source'), 'csv');
    await waitFor(() =>
      expect(
        transport.api.mock.calls.some(
          ([path]) =>
            typeof path === 'string' &&
            path.includes('facultyId=cs') &&
            path.includes('courseId=fixture-course') &&
            path.includes('source=csv'),
        ),
      ).toBe(true),
    );
  });
});
