// LEADOS.wargame — original, minimal. The pasted spec calls
// LEADOS.wargame.buildCompetitiveLandscape / ._computeWinRate /
// ._latestMetric / ._computeVelocityMean as pre-existing helpers; none exist
// in the real repo (verified: no wargame.ts, finIntel.ts anywhere in
// wbweve/Leados). Implemented here only as far as Part 2 + Part 3 need.
import { engine } from './engine';
import type { Projection } from './types';

export const wargame = {
  _computeWinRate(P: Projection, today: number): number | null {
    const ev = P.state.events;
    const won = ev.filter((e) => e.type === 'sales.deal.won' && engine._days(e.ts, today) <= 180 && engine._days(e.ts, today) >= 0);
    const lost = ev.filter((e) => e.type === 'sales.deal.lost' && engine._days(e.ts, today) <= 180 && engine._days(e.ts, today) >= 0);
    const total = won.length + lost.length;
    if (total < 3) return null; // insufficient sample
    return won.length / total;
  },

  _latestMetric(P: Projection, metric: string): number | null {
    const rows = P.state.events
      .filter((e) => e.type === 'fin.kpi.logged' && e.data.metric === metric)
      .sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
    return rows[0]?.data.value ?? null;
  },

  _computeVelocityMean(P: Projection, today: number): number | null {
    const won = P.state.events.filter((e) => e.type === 'sales.deal.won' && engine._days(e.ts, today) <= 180 && engine._days(e.ts, today) >= 0);
    if (!won.length) return null;
    return won.reduce((a, e) => a + (e.data.cycleDays || 0), 0) / won.length;
  },

  buildCompetitiveLandscape(P: Projection, today: number) {
    const winRate = this._computeWinRate(P, today);
    const velocity = this._computeVelocityMean(P, today);
    const lossReasons: Record<string, number> = {};
    P.state.events
      .filter((e) => e.type === 'sales.deal.lost' && engine._days(e.ts, today) <= 180 && engine._days(e.ts, today) >= 0)
      .forEach((e) => {
        const r = e.data.reason || 'unknown';
        lossReasons[r] = (lossReasons[r] || 0) + 1;
      });
    const totalLosses = Object.values(lossReasons).reduce((a, b) => a + b, 0);
    const topLossReason = Object.entries(lossReasons).sort((a, b) => b[1] - a[1])[0];
    return {
      winRate,
      velocityDaysMean: velocity,
      topLossReason: topLossReason ? { reason: topLossReason[0], share: totalLosses ? Math.round((topLossReason[1] / totalLosses) * 100) : 0 } : null,
      label: 'Competitive landscape computed from logged deal win/loss events in trailing 180d. Labeled: directional, not a CRM-grade pipeline analysis.',
    };
  },
};
