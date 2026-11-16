import { rankAppearance, type RankTierAppearance } from '../lib/rankAppearance';
import './rank-badge.css';

export function RankBadge({ tier, size = 'regular', showName = true }: {
  tier: RankTierAppearance | null | undefined;
  size?: 'compact' | 'regular' | 'hero';
  showName?: boolean;
}) {
  const appearance = rankAppearance(tier);
  if (!tier || !appearance) return null;
  const name = tier.name.trim();
  return <span className={`rank-badge rank-badge-${size}`} style={appearance.style} title={name}>
    {appearance.image && <img src={appearance.image} alt={name} width={size === 'hero' ? 96 : 48} height={size === 'hero' ? 84 : 42} />}
    {(!appearance.image || showName) && <span aria-hidden={appearance.image ? 'true' : undefined}>{name}</span>}
  </span>;
}
