// LEADOS.finIntel — original, minimal (see wargame.ts header for provenance note).
import { wargame } from './wargame';
import type { Projection } from './types';

export const finIntel = {
  runwayStatus(P: Projection, _today?: number) {
    const cash = wargame._latestMetric(P, 'cash_balance');
    const burn = wargame._latestMetric(P, 'monthly_burn');
    if (cash == null || burn == null || burn <= 0) {
      return { runway_months: null, status: 'UNKNOWN', cash, burn, label: 'Insufficient fin.kpi.logged data to compute runway.' };
    }
    const runway_months = Math.round((cash / burn) * 10) / 10;
    const status = runway_months < 6 ? 'CRITICAL' : runway_months < 10 ? 'TIGHT' : 'HEALTHY';
    return { runway_months, status, cash, burn, label: `Runway = latest cash_balance / latest monthly_burn. ${runway_months} months (${status}).` };
  },
};
