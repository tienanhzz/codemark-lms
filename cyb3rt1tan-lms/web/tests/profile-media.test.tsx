import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AvatarEditor } from '../components/AvatarEditor';
import { ProfileSupportPanel } from '../components/ProfileSupportPanel';
import { TeachingTeam } from '../components/TeachingTeam';
import { cropRectangle } from '../lib/avatarCrop';

const transport = vi.hoisted(() => ({ api: vi.fn(), avatar: vi.fn() }));
vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  api: transport.api,
  apiAvatar: transport.avatar,
}));
const person = {
  id: 'person',
  username: 'student',
  officialName: 'Student Name',
  institutionalId: 'S001',
  status: 'active',
};
const profile = {
  ...person,
  revision: 4,
  contactEmail: null,
  phone: null,
  about: '',
  academicTitle: '',
};
const own = {
  ...profile,
  email: 'student@example.test',
  roles: ['student'],
  nickname: null,
  showEmailInCourses: false,
  nextNicknameChangeAt: null,
  avatarUploadAvailable: true,
  avatarUrl: '/v1/me/avatar/current',
};
afterEach(() => {
  vi.restoreAllMocks();
});

describe('Protected profiles and images in simulated DOM, without browser/network', () => {
  it('requires a reason before accessing private profile fields and sends only supported changes', async () => {
    transport.api.mockImplementation(async (path: string, method?: string) =>
      method === 'PATCH'
        ? { ...profile, revision: 5, academicTitle: 'Dr' }
        : path.endsWith('/access')
          ? profile
          : { items: [person], nextCursor: null },
    );
    const user = userEvent.setup();
    render(<ProfileSupportPanel locale="en" />);
    await user.click(await screen.findByRole('button', { name: 'Open profile' }));
    const modal = screen.getByRole('dialog', { name: 'Student Name' });
    expect(within(modal).queryByLabelText('Contact email (optional)')).toBeNull();
    await user.type(
      within(modal).getByLabelText('Reason for accessing or changing this profile'),
      'Requested profile correction',
    );
    await user.click(
      within(modal).getByRole('button', { name: 'Access profile and record reason' }),
    );
    await user.type(await within(modal).findByLabelText('Academic title'), 'Dr');
    expect(within(modal).queryByLabelText('Nickname')).toBeNull();
    expect(within(modal).queryByLabelText('Institutional email')).toBeNull();
    await user.click(within(modal).getByRole('button', { name: 'Save changes' }));
    await within(modal).findByText('Changes saved.');
    expect(transport.api).toHaveBeenLastCalledWith('/profile-support/users/person', 'PATCH', {
      expectedRevision: 4,
      reason: 'Requested profile correction',
      contactEmail: null,
      phone: null,
      about: '',
      academicTitle: 'Dr',
    });
  });

  it('displays a stale profile error and requires an audited reload before saving again', async () => {
    transport.api.mockImplementation(async (_path: string, method?: string) => {
      if (method === 'PATCH') throw new Error('stale_account');
      if (method === 'POST') return profile;
      return { items: [person], nextCursor: null };
    });
    const user = userEvent.setup();
    render(<ProfileSupportPanel locale="en" />);
    await user.click(await screen.findByRole('button', { name: 'Open profile' }));
    const modal = screen.getByRole('dialog');
    await user.type(
      within(modal).getByLabelText('Reason for accessing or changing this profile'),
      'Review request',
    );
    await user.click(
      within(modal).getByRole('button', { name: 'Access profile and record reason' }),
    );
    await user.click(await within(modal).findByRole('button', { name: 'Save changes' }));
    await within(modal).findByRole('alert');
    expect(within(modal).queryByText('Changes saved.')).toBeNull();
    await user.click(within(modal).getByRole('button', { name: 'Reload' }));
    await waitFor(() =>
      expect(transport.api).toHaveBeenLastCalledWith(
        '/profile-support/users/person/access',
        'POST',
        { reason: 'Review request' },
      ),
    );
  });

  it('keeps suspended profile support read-only', async () => {
    transport.api.mockImplementation(async (_path: string, method?: string) =>
      method === 'POST'
        ? { ...profile, status: 'suspended' }
        : { items: [person], nextCursor: null },
    );
    const user = userEvent.setup();
    render(<ProfileSupportPanel locale="en" />);
    await user.click(await screen.findByRole('button', { name: 'Open profile' }));
    await user.type(
      screen.getByLabelText('Reason for accessing or changing this profile'),
      'Review request',
    );
    await user.click(screen.getByRole('button', { name: 'Access profile and record reason' }));
    await screen.findByText('This account is read-only for profile support.');
    expect(screen.getByLabelText('Academic title').matches(':disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Save changes' }).matches(':disabled')).toBe(true);
  });

  it('shows privacy-filtered teaching profiles and opens only returned course links', async () => {
    const open = vi.fn();
    transport.api.mockResolvedValue({
      items: [
        {
          id: 'teacher',
          officialName: 'Teacher Name',
          academicTitle: 'Dr',
          role: 'teacher',
          owner: true,
          email: null,
          avatarUrl: null,
          courses: [{ id: 'visible', courseCode: 'CS101', title: 'Visible Course' }],
        },
      ],
      nextCursor: null,
    });
    const user = userEvent.setup();
    render(<TeachingTeam courseId="visible" locale="en" onOpen={open} />);
    await screen.findByText('Teacher Name');
    expect(screen.getByText('Email is private')).toBeTruthy();
    expect(screen.queryByText('teacher@example.test')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'CS101 · Visible Course' }));
    expect(open).toHaveBeenCalledWith('visible');
  });

  it('requires confirmation and revision before removing the current image', async () => {
    const changed = vi.fn();
    transport.api.mockResolvedValue({ ...own, avatarUrl: null, revision: 5 });
    const user = userEvent.setup();
    render(
      <AvatarEditor
        profile={own}
        locale="en"
        disabled={false}
        onWorking={vi.fn()}
        onChanged={changed}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Remove profile image' }));
    expect(transport.api).not.toHaveBeenCalled();
    const modal = screen.getByRole('dialog', { name: 'Remove profile image' });
    await user.click(within(modal).getByRole('button', { name: 'Remove profile image' }));
    await screen.findByText('Changes saved.');
    expect(transport.api).toHaveBeenCalledWith('/me/avatar', 'DELETE', undefined, {
      'If-Match': '"4"',
    });
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ revision: 5, avatarUrl: null }));
  });

  it('keeps a square crop inside source bounds at every supported zoom and position', () => {
    for (const [width, height] of [
      [800, 600],
      [500, 900],
      [512, 512],
    ]) {
      for (const zoom of [1, 1.5, 3])
        for (const x of [0, 50, 100])
          for (const y of [0, 50, 100]) {
            const rect = cropRectangle(width, height, zoom, x, y);
            expect(rect.x).toBeGreaterThanOrEqual(0);
            expect(rect.y).toBeGreaterThanOrEqual(0);
            expect(rect.x + rect.side).toBeLessThanOrEqual(width + 1e-9);
            expect(rect.y + rect.side).toBeLessThanOrEqual(height + 1e-9);
            expect(rect.side).toBeGreaterThan(0);
          }
    }
    expect(() => cropRectangle(0, 50, 1, 50, 50)).toThrow('imageInvalid');
    expect(cropRectangle(800, 600, 1, 50, 50)).toEqual({ x: 100, y: 0, side: 600 });
  });

  it('prepares a local crop and submits a bounded PNG with the profile revision', async () => {
    const changed = vi.fn();
    const context = { clearRect: vi.fn(), drawImage: vi.fn() };
    const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:fixture'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(512);
    vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(512);
    const originalDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode');
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: async () => {},
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    const blob = new Blob(['png-fixture'], { type: 'image/png' });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
      callback(blob),
    );
    transport.avatar.mockResolvedValue({ ...own, revision: 5 });
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'image.png', { type: 'image/png' });
    Object.defineProperty(file, 'slice', {
      value: () => ({
        arrayBuffer: async () => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer,
      }),
    });
    try {
      const user = userEvent.setup();
      render(
        <AvatarEditor
          profile={own}
          locale="en"
          disabled={false}
          onWorking={vi.fn()}
          onChanged={changed}
        />,
      );
      await user.upload(screen.getByLabelText('Choose image'), file);
      await screen.findByRole('img', { name: 'Preview square crop' });
      expect(context.drawImage).toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Save profile image' }));
      await screen.findByText('Changes saved.');
      expect(transport.avatar).toHaveBeenCalledWith(blob, 4);
    } finally {
      for (const [object, name, descriptor] of [
        [URL, 'createObjectURL', originalCreate],
        [URL, 'revokeObjectURL', originalRevoke],
        [HTMLImageElement.prototype, 'decode', originalDecode],
      ] as const) {
        if (descriptor) Object.defineProperty(object, name, descriptor);
        else Reflect.deleteProperty(object, name);
      }
    }
  });
});
