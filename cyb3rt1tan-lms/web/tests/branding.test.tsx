import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandingWorkspace } from '../components/BrandingWorkspace';

const transport = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  api: transport.api,
}));

beforeEach(() => vi.clearAllMocks());

describe('BrandingWorkspace', () => {
  it('shows an explicit loading state before the empty logo state', async () => {
    let resolveList: ((value: { items: [] }) => void) | undefined;
    transport.api.mockImplementation(() => new Promise((resolve) => { resolveList = resolve; }));
    render(<BrandingWorkspace locale="en" />);

    expect(screen.getByText('Loading logo history…')).toBeTruthy();
    expect(screen.queryByText('No custom logo has been uploaded.')).toBeNull();
    resolveList?.({ items: [] });
    await screen.findByText('No custom logo has been uploaded.');
  });

  it('rejects unsupported and oversized source files before decoding or upload', async () => {
    transport.api.mockResolvedValue({ items: [] });
    render(<BrandingWorkspace locale="en" />);
    await screen.findByText('No custom logo has been uploaded.');
    const user = userEvent.setup({ applyAccept: false });
    const input = screen.getByLabelText('Source image');

    await user.upload(input, new File(['not an image'], 'notes.txt', { type: 'text/plain' }));
    expect(await screen.findByText('Choose a PNG, JPEG, or WebP image.')).toBeTruthy();

    const oversized = new File([new Uint8Array(2_000_001)], 'large.png', { type: 'image/png' });
    await user.upload(input, oversized);
    expect(await screen.findByText('The source image must be 2 MB or smaller.')).toBeTruthy();
    expect(transport.api).toHaveBeenCalledTimes(1);
  });

  it('offers a retry when logo history cannot be loaded', async () => {
    transport.api.mockRejectedValueOnce(new Error('connection_error')).mockResolvedValue({ items: [] });
    render(<BrandingWorkspace locale="vi" />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(screen.getByText('Chưa có logo tùy chỉnh.')).toBeTruthy());
    expect(transport.api).toHaveBeenCalledTimes(2);
  });

  it('notifies the workspace shell when an earlier logo version is activated', async () => {
    transport.api.mockImplementation(async (path: string) => {
      if (path === '/admin/branding/logos') return { items: [
        { id: 'logo-2', version: 2, digest: 'new', isActive: true, createdAt: '2026-11-16T10:00:00Z', url: '/v1/branding/logos/logo-2' },
        { id: 'logo-1', version: 1, digest: 'old', isActive: false, createdAt: '2026-11-15T10:00:00Z', url: '/v1/branding/logos/logo-1' },
      ] };
      return undefined;
    });
    const updated = vi.fn();
    window.addEventListener('platform-logo-updated', updated);
    render(<BrandingWorkspace locale="en" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(updated).toHaveBeenCalledTimes(1));
    window.removeEventListener('platform-logo-updated', updated);
  });
});
