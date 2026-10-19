// src/lib/mockData.ts
// Deterministic demo data generator feeding the Strategic War Room when no
// live backend is attached. All data is seeded so the UI is stable across
// reloads within the same day.

import { ALL_METRIC_KEYS, type LeadosEvent, type MetricValue, type SavedScenario, type MetricDef } from './types';
import { METRIC_DEFINITIONS, defaultBaselineState } from './scenarioEngine';
import type { Decision } from './decisionTypes';
import type { CompetitorProfile } from './wargameEngine';
import { generateCompetitorProfile } from './wargameEngine';
import { mulberry32 } from './monteCarlo';

const rand = mulberry32(20240617);

// Deliberate stress scenarios baked into the demo data so the surveillance
// system has something interesting to activate on load.
const STRESS_FACTORS: Partial<Record<keyof typeof defaultBaselineState, number>> = {
  churnRate: 1.9, // churn running ~90% above baseline
  revenue: 0.86, // revenue ~14% below baseline
  runwayMonths: 0.72,
  nps: 0.8,
};

export function generateMetricHistory(now: Date): MetricValue[] {
  const out: MetricValue[] = [];
  for (const key of ALL_METRIC_KEYS) {
    const def = METRIC_DEFINITIONS[key];
    const baseline = defaultBaselineState[key];
    const stressTarget = baseline * (STRESS_FACTORS[key] ?? 1);
    for (let d = 90; d >= 0; d -= 3) {
      const date = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
      const progress = 1 - d / 90; // 0 -> 1 as we approach "now"
      const trendValue = baseline + (stressTarget - baseline) * progress;
      const noise = (rand() * 2 - 1) * def.volatility * baseline * 0.3;
      out.push({ metricKey: key, date: date.toISOString(), value: Math.max(0, trendValue + noise) });
    }
  }
  return out;
}

export function generateEvents(now: Date): LeadosEvent[] {
  const mk = (daysAgo: number, type: string, description: string): LeadosEvent => ({
    id: `${type}_${daysAgo}`,
    type,
    timestamp: new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    description,
  });

  return [
    mk(2, 'competitive.signal', 'Rival "Northwind" announced an aggressive price cut on the mid-tier plan.'),
    mk(5, 'customer.churn.to_competitor', 'Enterprise account "Vantage Co" cited Northwind pricing in their cancellation call.'),
    mk(8, 'talent.poach', 'Northwind extended an above-market offer to a senior engineer on the platform team.'),
    mk(11, 'pricing.pressure', 'Three active deals paused pending a competitor price-match request.'),
    mk(20, 'product.launch', 'Shipped the v4 onboarding flow.'),
    mk(35, 'market.move', 'Northwind raised a $40M Series C, earmarked for go-to-market expansion.'),
  ];
}

export function generateDecisions(now: Date): Decision[] {
  const inDays = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000).toISOString();
  return [
    {
      id: 'd1',
      title: 'Respond to Northwind price cut',
      domain: 'revenue',
      status: 'proposed',
      impact: 5,
      confidence: 0.72,
      deadline: inDays(7),
      options: ['Match price selectively for at-risk accounts', 'Hold price and compete on value'],
      recommendation: 'Match price selectively for the top 20 at-risk accounts while holding list price broadly.',
      stakes: 'Roughly $1.1M in ARR is currently exposed to competitive displacement this quarter.',
      estimatedValue: 1100000,
    },
    {
      id: 'd2',
      title: 'Backfill platform engineering seat',
      domain: 'people',
      status: 'proposed',
      impact: 4,
      confidence: 0.65,
      deadline: inDays(21),
      options: ['Hire immediately at above-market comp', 'Hold and redistribute workload'],
      recommendation: 'Hire immediately — the roadmap has no slack to absorb another departure this quarter.',
      stakes: 'Platform velocity is already the binding constraint on the Q3 roadmap.',
      estimatedValue: 300000,
    },
    {
      id: 'd3',
      title: 'Extend runway via targeted cost reduction',
      domain: 'capital',
      status: 'proposed',
      impact: 5,
      confidence: 0.6,
      deadline: inDays(25),
      options: ['Cut non-essential vendor spend now', 'Wait for next board cycle'],
      recommendation: 'Cut non-essential vendor spend now; the model shows a materially better runway outcome than waiting.',
      stakes: 'Current burn trajectory shortens the runway below the comfort threshold ahead of the next raise window.',
      estimatedValue: 450000,
    },
    {
      id: 'd4',
      title: 'Launch enterprise security tier',
      domain: 'product',
      status: 'proposed',
      impact: 3,
      confidence: 0.58,
      deadline: inDays(60),
      options: ['Ship now', 'Delay for polish'],
      recommendation: 'Delay one sprint to close two compliance gaps flagged by enterprise prospects.',
      stakes: 'Unblocks roughly $600K of stalled enterprise pipeline.',
      estimatedValue: 600000,
    },
  ];
}

export function generateCompetitors(): CompetitorProfile[] {
  const base = generateCompetitorProfile(
    'Northwind',
    'Northwind cut prices aggressively, raised a large funding round, and is poaching engineering talent with above-market offers.',
  );
  const base2 = generateCompetitorProfile(
    'Fieldstone Labs',
    'Fieldstone Labs has been cautious and conservative, focused on a slow enterprise feature launch.',
  );
  return [base, base2];
}

export function generateSavedScenarios(now: Date): SavedScenario[] {
  return [
    { id: 's1', name: 'Competitive price war', metricKey: 'revenue', createdAt: new Date(now.getTime() - 40 * 86400000).toISOString() },
    { id: 's2', name: 'Retention loop breakdown', metricKey: 'churnRate', createdAt: new Date(now.getTime() - 25 * 86400000).toISOString() },
  ];
}

export function generateMetricDefs(): MetricDef[] {
  return ALL_METRIC_KEYS.map((key) => ({ key, label: METRIC_DEFINITIONS[key].label, unit: METRIC_DEFINITIONS[key].unit, direction: METRIC_DEFINITIONS[key].direction }));
}
