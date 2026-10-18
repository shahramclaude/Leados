// LEADOS.bayesian — original, minimal. The pasted Part 2 spec calls
// LEADOS.bayesian.computeAllBeliefs(P, today) as a pre-existing module;
// nothing named bayesian.ts was found anywhere in the real wbweve/Leados
// repo during inspection. This is a deliberately simple log-odds scoring
// model, NOT a rigorous Bayesian inference engine — disclosed in every
// belief's label so the UI never overstates its own confidence.
import { engine } from './engine';
import { wargame } from './wargame';
import type { Projection } from './types';

interface Signal {
  name: string;
  weight: number; // max log-odds contribution
  intensity: (P: Projection, today: number) => number; // 0..1
}

interface BeliefDef {
  key: string;
  question: string;
  prior: number;
  signals: Signal[];
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function daysAgoList(P: Projection, type: string, today: number, maxDays: number) {
  return P.state.events.filter((e) => e.type === type && engine._days(e.ts, today) <= maxDays && engine._days(e.ts, today) >= 0);
}

const BELIEFS: BeliefDef[] = [
  {
    key: 'attrition.next60d',
    question: 'Will the org suffer another voluntary departure in the next 60 days?',
    prior: 0.25,
    signals: [
      {
        name: 'recent_attrition_90d',
        weight: 1.1,
        intensity: (P, today) => clamp01(daysAgoList(P, 'hr.attrition.logged', today, 90).length / 2),
      },
      {
        name: 'low_pulse_mood_30d',
        weight: 1.0,
        intensity: (P, today) => {
          const rows = daysAgoList(P, 'pulse.mood.logged', today, 30);
          if (!rows.length) return 0;
          const avg = rows.reduce((a, r) => a + (r.data.score || 0), 0) / rows.length;
          return clamp01((6 - avg) / 3); // below 6 starts contributing, below 3 maxes out
        },
      },
      {
        name: 'overdue_1on1_rate_60d',
        weight: 0.7,
        intensity: (P, today) => {
          const rows = daysAgoList(P, 'oneonone.logged', today, 60);
          if (!rows.length) return 0;
          const overdue = rows.filter((r) => r.data.overdue).length;
          return clamp01(overdue / rows.length / 0.4);
        },
      },
    ],
  },
  {
    key: 'revenue.miss.next_quarter',
    question: 'Will revenue miss target next quarter?',
    prior: 0.3,
    signals: [
      {
        name: 'win_rate_below_baseline',
        weight: 1.2,
        intensity: (P, _today) => {
          const wr = wargame._computeWinRate(P, _today);
          if (wr == null) return 0;
          return clamp01((0.4 - wr) / 0.2);
        },
      },
      {
        name: 'revenue_vs_target_negative',
        weight: 1.0,
        intensity: (P, _today) => {
          const v = wargame._latestMetric(P, 'revenue_vs_target');
          if (v == null) return 0;
          return clamp01(-v / 20);
        },
      },
      {
        name: 'loss_reason_concentration',
        weight: 0.6,
        intensity: (P, today) => {
          const rows = daysAgoList(P, 'sales.deal.lost', today, 180);
          if (rows.length < 3) return 0;
          const counts: Record<string, number> = {};
          rows.forEach((r) => (counts[r.data.reason] = (counts[r.data.reason] || 0) + 1));
          const top = Math.max(...Object.values(counts));
          return clamp01((top / rows.length - 0.4) / 0.4);
        },
      },
    ],
  },
  {
    key: 'margin_compression.next_quarter',
    question: 'Will gross margin compress further next quarter?',
    prior: 0.25,
    signals: [
      {
        name: 'margin_below_target',
        weight: 1.0,
        intensity: (P, _today) => {
          const m = wargame._latestMetric(P, 'gross_margin_pct');
          if (m == null) return 0;
          return clamp01((60 - m) / 10);
        },
      },
      {
        name: 'burn_rising',
        weight: 0.8,
        intensity: (P, today) => {
          const rows = P.state.events
            .filter((e) => e.type === 'fin.kpi.logged' && e.data.metric === 'monthly_burn' && engine._days(e.ts, today) >= 0)
            .sort((a, b) => engine._days(a.ts, today) - engine._days(b.ts, today));
          if (rows.length < 2) return 0;
          const latest = rows[0].data.value;
          const past = rows[Math.min(rows.length - 1, 2)].data.value;
          if (!past) return 0;
          return clamp01((latest - past) / past / 0.15);
        },
      },
    ],
  },
];

export const bayesian = {
  computeAllBeliefs(P: Projection, today: number) {
    const beliefs: Record<string, any> = {};
    BELIEFS.forEach((def) => {
      let logOdds = logit(def.prior);
      const signalDetail = def.signals.map((s) => {
        const intensity = clamp01(s.intensity(P, today));
        const contribution = s.weight * intensity;
        logOdds += contribution;
        return { name: s.name, intensity: Math.round(intensity * 100) / 100, contribution: Math.round(contribution * 100) / 100 };
      });
      const posterior = clamp01(sigmoid(logOdds));
      beliefs[def.key] = {
        question: def.question,
        prior: def.prior,
        posterior,
        posteriorPct: Math.round(posterior * 100),
        signals: signalDetail,
      };
    });

    return {
      beliefs,
      label:
        'Posteriors from a simplified log-odds scoring model (prior + weighted signal intensities -> sigmoid). ' +
        'Labeled: this is an original heuristic for ranking uncertainty, not a calibrated probabilistic forecast.',
    };
  },
};
