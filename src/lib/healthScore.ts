// LEADOS.healthScore — original, minimal (see wargame.ts header for provenance note).
import { finIntel } from './finIntel';
import { performance } from './performance';
import { wargame } from './wargame';
import type { Projection } from './types';

export const healthScore = {
  compute(P: Projection, today: number) {
    const winRate = wargame._computeWinRate(P, today);
    const runway = finIntel.runwayStatus(P, today).runway_months;
    const engagement = performance._computeTeamEngagement(P, today);
    const margin = wargame._latestMetric(P, 'gross_margin_pct');

    const parts: { key: string; value: number; weight: number }[] = [];
    if (winRate != null) parts.push({ key: 'winRate', value: Math.min(100, winRate * 200), weight: 0.3 });
    if (runway != null) parts.push({ key: 'runway', value: Math.min(100, (runway / 12) * 100), weight: 0.3 });
    if (engagement != null) parts.push({ key: 'engagement', value: engagement, weight: 0.25 });
    if (margin != null) parts.push({ key: 'margin', value: Math.min(100, (margin / 70) * 100), weight: 0.15 });

    const totalWeight = parts.reduce((a, p) => a + p.weight, 0) || 1;
    const overall = parts.length ? Math.round(parts.reduce((a, p) => a + p.value * p.weight, 0) / totalWeight) : 50;

    return {
      overall,
      components: parts,
      label: 'Composite of win rate, runway, 30d engagement and gross margin, weighted. Labeled: an original heuristic, not a validated org-health index.',
    };
  },
};
