import type { CSSProperties } from 'react';

export type RankTierAppearance = { key: string; name: string; color?: string };
type Palette = { foreground: string; background: string; border: string };

const palettes = {
  bronze: { foreground: '#783d24', background: '#fff0e5', border: '#dfb497' },
  silver: { foreground: '#3c5368', background: '#edf3f8', border: '#b5c9d9' },
  gold: { foreground: '#80520b', background: '#fff6d9', border: '#e5c465' },
  diamond: { foreground: '#075a78', background: '#e6f8ff', border: '#86cce7' },
  ruby: { foreground: '#971d43', background: '#ffedf2', border: '#e9a0b7' },
  master: { foreground: '#6b2e91', background: '#f6ecff', border: '#cea9e5' },
} satisfies Record<string, Palette>;
type ArtworkKey = keyof typeof palettes;
const neutral: Palette = { foreground: '#3f5061', background: '#f1f5f9', border: '#cbd5e1' };

export const positionalRankTiers = [
  { key: 'master', name: 'Master', positions: '1' },
  { key: 'ruby', name: 'Ruby', positions: '2' },
  { key: 'diamond', name: 'Diamond', positions: '3' },
  { key: 'gold', name: 'Gold', positions: '4–5' },
  { key: 'silver', name: 'Silver', positions: '6–10' },
  { key: 'bronze', name: 'Bronze', positions: '11+' },
] as const;

function artworkKey(value: string): ArtworkKey | null {
  const key = value.trim().toLowerCase();
  return Object.hasOwn(palettes, key) ? key as ArtworkKey : null;
}

function customPalette(color?: string): Palette {
  if (!color || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color.trim())) return neutral;
  const hex = color.trim().slice(1);
  const full = hex.length === 3 ? hex.split('').map(character => character + character).join('') : hex;
  const channels = [0, 2, 4].map(offset => parseInt(full.slice(offset, offset + 2), 16));
  const mix = (target: number, weight: number) => `#${channels.map(channel => Math.round(channel + (target - channel) * weight).toString(16).padStart(2, '0')).join('')}`;
  return { foreground: mix(0, .65), background: mix(255, .92), border: mix(255, .5) };
}

/** Presentation follows the server's tier; EXP and position never determine artwork here. */
export function rankAppearance(tier: RankTierAppearance | null | undefined) {
  if (!tier) return null;
  const key = artworkKey(tier.key) || artworkKey(tier.name);
  const palette = key ? palettes[key] : customPalette(tier.color);
  return {
    key,
    image: key ? `/ranks/${key}.png` : null,
    style: {
      '--rank-foreground': palette.foreground,
      '--rank-background': palette.background,
      '--rank-border': palette.border,
    } as CSSProperties,
  };
}
