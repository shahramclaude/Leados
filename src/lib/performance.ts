// LEADOS.performance — original, minimal (see wargame.ts header for provenance note).
import { engine } from './engine';
import type { Projection } from './types';

export const performance = {
  _computeTeamEngagement(P: Projection, today: number): number | null {
    const moods = P.state.events.filter((e) => e.type === 'pulse.mood.logged' && engine._days(e.ts, today) <= 30 && engine._days(e.ts, today) >= 0);
    if (!moods.length) return null;
    const avg = moods.reduce((a, m) => a + (m.data.score || 0), 0) / moods.length;
    return Math.round(avg * 10); // 0-100 scale
  },
};
