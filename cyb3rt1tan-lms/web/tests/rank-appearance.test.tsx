import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RanksWorkspace } from '../components/RanksWorkspace';

const transport = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../lib/api', () => ({ api: transport.api }));

describe('Rank progression appearance', () => {
  it('explains all six positional leaderboard ranks when EXP policies are absent', async () => {
    transport.api.mockResolvedValue({ exp: 0, coin: 0, ranks: [
      { track: 'student', exp: 0, policyVersion: null, current: null, next: null, progressPercent: null },
    ] });
    render(<RanksWorkspace locale="en" roles={['student']} />);
    const legend = await screen.findByRole('region', { name: 'Leaderboard rank tiers' });
    expect(within(legend).getAllByRole('img').map(image => image.getAttribute('alt'))).toEqual(['Master', 'Ruby', 'Diamond', 'Gold', 'Silver', 'Bronze']);
    expect(within(legend).getByText('4–5')).toBeTruthy();
    expect(within(legend).getByText('6–10')).toBeTruthy();
    expect(within(legend).getByText('11+')).toBeTruthy();
    const current = screen.getByText('Student track').closest('article')!;
    expect(within(current).queryByRole('img')).toBeNull();
    expect(within(current).getByText('No active policy')).toBeTruthy();
  });

  it('keeps custom tier colors readable and rejects unsafe CSS values', async () => {
    transport.api.mockResolvedValue({ exp: 0, coin: 0, ranks: ['#fff', '#000000', '#ff0000', '#abc', 'url(https://example.com/track)'].map((color, index) => ({
      track: `custom-${index}`, exp: 0, policyVersion: 1,
      current: { key: `custom-${index}`, name: `Custom ${index}`, color }, next: null, progressPercent: null,
    })) });
    render(<RanksWorkspace locale="en" roles={['student']} />);
    for (const name of ['Custom 0', 'Custom 1', 'Custom 2', 'Custom 3', 'Custom 4']) {
      const card = (await screen.findByText(name)).closest('article')!;
      const foreground = card.style.getPropertyValue('--rank-foreground');
      const background = card.style.getPropertyValue('--rank-background');
      expect(foreground).toMatch(/^#[0-9a-f]{6}$/i);
      expect(background).toMatch(/^#[0-9a-f]{6}$/i);
      const luminance = (hex: string) => {
        const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
        return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
      };
      expect((luminance(background) + .05) / (luminance(foreground) + .05)).toBeGreaterThanOrEqual(4.5);
    }
    const unsafe = screen.getByText('Custom 4').closest('article')!;
    expect(unsafe.getAttribute('style')).not.toContain('url(');
    expect(within(unsafe).queryByRole('img')).toBeNull();
  });

  it('uses the wallet tier and policy logos without inventing a tier when no policy is active', async () => {
    const tier = { key: 'bronze', name: 'Bronze', thresholdExp: 0, icon: 'fa-star', color: '#c58050', description: '' };
    transport.api.mockImplementation(async (path: string) => {
      if (path === '/me/wallet') return { exp: 40, coin: 0, ranks: [
        { track: 'student', exp: 40, policyVersion: 1, current: tier, next: { ...tier, key: 'silver', name: 'Silver', thresholdExp: 500 }, progressPercent: 8 },
        { track: 'staff', exp: 0, policyVersion: null, current: null, next: null, progressPercent: null },
      ] };
      if (path === '/admin/rank-policies') return { items: [{ id: 'p1', track: 'student', version: 1, status: 'active', effectiveAt: null, tiers: [tier] }] };
      if (path === '/admin/rank-task-requests?status=pending') return { items: [] };
      throw new Error(`Unexpected ${path}`);
    });
    render(<RanksWorkspace locale="en" roles={['admin']} />);
    const images = await screen.findAllByRole('img', { name: 'Bronze' });
    expect(images).toHaveLength(2);
    for (const image of images) expect(image.getAttribute('src')).toBe('/ranks/bronze.png');
    const current = screen.getByText('Student track').closest('article')!;
    expect(current.style.getPropertyValue('--rank-background')).not.toBe('');
    expect(within(current).getByRole('progressbar').getAttribute('value')).toBe('8');
    const staff = screen.getByText('Staff track').closest('article')!;
    expect(within(staff).getByText('No active policy')).toBeTruthy();
    expect(within(staff).queryByRole('img')).toBeNull();
    expect(staff.style.getPropertyValue('--rank-background')).toBe('');
  });
});
