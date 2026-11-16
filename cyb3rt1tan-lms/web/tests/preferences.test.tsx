import { readFileSync } from 'node:fs';
import { parse } from 'postcss';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Workspace } from '../components/Workspace';
import { applyPreferences, defaultPreferences, type UserPreferences } from '../lib/api';

const transport = vi.hoisted(() => ({ api: vi.fn(), push: vi.fn() }));
vi.mock('../lib/api', async original => ({
  ...(await original<typeof import('../lib/api')>()), api: transport.api,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: transport.push }) }));

const root = document.documentElement;
let accountId: string;
let guest: boolean;
let failedSave: boolean;
let saved: Record<string, UserPreferences>;
let style: HTMLStyleElement | undefined;

beforeEach(() => {
  accountId = 'student-a';
  guest = failedSave = false;
  saved = { 'student-a': { ...defaultPreferences }, 'teacher-b': { ...defaultPreferences } };
  applyPreferences(defaultPreferences);
  // Use the actual CSS declarations to detect workspace-level color overrides.
  const css = parse(readFileSync('app/globals.css', 'utf8'));
  style = document.createElement('style');
  style.textContent = css.nodes.flatMap(node => {
    if (node.type !== 'rule') return [];
    const declarations = node.nodes.filter(item => item.type === 'decl' &&
      (item.prop.startsWith('--') || item.prop === 'color-scheme'));
    return declarations.length ? [`${node.selector}{${declarations.map(item => item.toString()).join(';')}}`] : [];
  }).join('\n');
  document.head.append(style);
  transport.api.mockImplementation(async (path: string, method?: string, body?: UserPreferences) => {
    if (path === '/me') {
      if (guest) throw new Error('authentication_required');
      return { id: accountId, username: accountId, officialName: 'Account', email: 'account@example.test',
        roles: [accountId === 'teacher-b' ? 'teacher' : 'student'] };
    }
    if (path === '/me/preferences') {
      if (method === 'PUT') {
        if (failedSave) throw new Error('connection_error');
        saved[accountId] = { ...body! };
      }
      return { ...saved[accountId] };
    }
    if (path === '/workspace/summary') return {
      build: 'test', courses: [], activity: [], isAdmin: false, metrics: { courses: 0, assessments: 0 },
    };
    return { items: [], total: 0, page: 1, pageSize: 10 };
  });
});
afterEach(() => style?.remove());

function effectiveColor(property: string): string {
  const layout = document.querySelector('.app-layout')!;
  return window.getComputedStyle(layout).getPropertyValue(property).trim() ||
    window.getComputedStyle(root).getPropertyValue(property).trim();
}

describe('Appearance, language and palette behavior', () => {
  it('previews dark mode, colors and Vietnamese immediately, and resets without saving', async () => {
    const user = userEvent.setup();
    render(<Workspace initialView="settings" />);
    await screen.findByRole('combobox', { name: 'Interface language' });
    await user.click(screen.getByRole('button', { name: 'Dark' }));
    expect(root.dataset.theme).toBe('dark');
    expect(effectiveColor('--surface')).toBe('#1a2635');
    await user.click(screen.getByRole('button', { name: 'Forest · Lime' }));
    expect(root.dataset.palette).toBe('forest-lime');
    expect(effectiveColor('--accent')).toBe('#afd697');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Interface language' }), 'vi');
    expect(root.lang).toBe('vi');
    expect(screen.getByRole('button', { name: 'Xanh rừng · Xanh chanh' }).getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Đặt lại thay đổi' }));
    expect(root.lang).toBe('en');
    expect(root.dataset.theme).toBe('light');
    expect(root.dataset.palette).toBe('navy-cyan-gold');
    expect(transport.api.mock.calls.filter(([, method]) => method === 'PUT')).toHaveLength(0);
  });

  it('applies all eight distinct palettes to the workspace', async () => {
    const user = userEvent.setup();
    render(<Workspace initialView="settings" />);
    await screen.findByRole('combobox', { name: 'Interface language' });
    const colors = new Set();
    for (const label of ['Navy · Cyan · Gold', 'Ocean · Teal', 'Indigo · Cyan', 'Forest · Lime',
      'Rose · Slate', 'Sunset · Coral', 'Violet · Amber', 'Graphite · Cyan']) {
      await user.click(screen.getByRole('button', { name: label }));
      colors.add(effectiveColor('--accent'));
    }
    expect(colors.size).toBe(8);
  });

  it('saves choices across remounts and keeps another account independent', async () => {
    const user = userEvent.setup();
    const first = render(<Workspace initialView="settings" />);
    await screen.findByRole('combobox', { name: 'Interface language' });
    await user.click(screen.getByRole('button', { name: 'Dark' }));
    await user.click(screen.getByRole('button', { name: 'Rose · Slate' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Interface language' }), 'vi');
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await screen.findByText('Đã lưu thay đổi của bạn.');
    expect(saved['student-a']).toMatchObject({ theme: 'dark', locale: 'vi', colorPalette: 'rose-slate' });
    first.unmount();
    const reloaded = render(<Workspace initialView="settings" />);
    await screen.findByRole('combobox', { name: 'Ngôn ngữ giao diện' });
    expect(root.dataset.theme).toBe('dark');
    expect(root.dataset.palette).toBe('rose-slate');
    reloaded.unmount();
    accountId = 'teacher-b';
    render(<Workspace initialView="settings" />);
    await screen.findByRole('combobox', { name: 'Interface language' });
    expect(root.dataset.theme).toBe('light');
    expect(root.dataset.palette).toBe('navy-cyan-gold');
    expect(saved['student-a'].locale).toBe('vi');
  });

  it('preserves unsaved appearance changes when the header saves a language change', async () => {
    const user = userEvent.setup();
    render(<Workspace initialView="settings" />);
    await screen.findByRole('combobox', { name: 'Interface language' });
    await user.click(screen.getByRole('button', { name: 'Dark' }));
    await user.click(screen.getByRole('button', { name: 'Tiếng Việt' }));
    await screen.findByRole('button', { name: 'English' });
    expect(root.dataset.theme).toBe('dark');
    expect(saved['student-a']).toMatchObject({ theme: 'light', locale: 'vi' });
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await screen.findByText('Đã lưu thay đổi của bạn.');
    expect(saved['student-a'].theme).toBe('dark');
  });

  it('does not discard a preview or report success after a failed save', async () => {
    const user = userEvent.setup();
    render(<Workspace initialView="settings" />);
    await screen.findByRole('combobox', { name: 'Interface language' });
    await user.click(screen.getByRole('button', { name: 'Dark' }));
    failedSave = true;
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('alert');
    expect(root.dataset.theme).toBe('dark');
    expect(saved['student-a'].theme).toBe('light');
    expect(screen.queryByText('Your changes have been saved.')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Reset changes' }));
    expect(root.dataset.theme).toBe('light');
  });

  it('remembers guest language when moving from the home page to login', async () => {
    guest = true;
    const user = userEvent.setup();
    const home = render(<Workspace />);
    await screen.findByRole('button', { name: 'Tiếng Việt' });
    await user.click(screen.getByRole('button', { name: 'Tiếng Việt' }));
    expect(root.lang).toBe('vi');
    home.unmount();
    render(<Workspace initialView="login" />);
    await screen.findByRole('heading', { name: 'Chào mừng trở lại' });
    expect(root.lang).toBe('vi');
    expect(transport.api.mock.calls.filter(([, method]) => method === 'PUT')).toHaveLength(0);
  });
});
