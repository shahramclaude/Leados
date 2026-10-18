// Deterministic synthetic roster + event log. ORIGINAL to this session.
// Mirrors the *idea* (a synthetic, declared-fabricated dataset so the app has
// something to compute on) that the real wbweve/Leados repo's own README
// says its seed.ts does — but this file was written from scratch, not read
// from that repo (it was not among the files fetched during provenance
// inspection; only App.tsx/engine.ts/core.ts/intelligence.ts/Thermodynamics
// related files and the root index.html were).
import { mulberry32 } from './prng';
import type { AppState, LeadosEvent, Person } from './types';

const DAY = 864e5;

export function buildSeedState(nowMs: number = Date.now()): AppState {
  const rnd = mulberry32(20260218);
  const id = (() => {
    let n = 0;
    return (prefix: string) => `${prefix}-${(n++).toString(36)}`;
  })();

  const people: Person[] = [
    { id: 'p-alex', name: 'Alex Rivera', role: 'Founder/CEO' },
    { id: 'p-jordan', name: 'Jordan Lee', role: 'Head of Sales', managerId: 'p-alex' },
    { id: 'p-priya', name: 'Priya Natarajan', role: 'Eng Lead', managerId: 'p-alex' },
    { id: 'p-sam', name: 'Sam Okafor', role: 'Senior Engineer', managerId: 'p-priya' },
    { id: 'p-taylor', name: 'Taylor Brooks', role: 'Engineer', managerId: 'p-priya' },
    { id: 'p-morgan', name: 'Morgan Diaz', role: 'Customer Success Lead', managerId: 'p-alex' },
    { id: 'p-casey', name: 'Casey Kim', role: 'Account Executive', managerId: 'p-jordan' },
    { id: 'p-riley', name: 'Riley Chen', role: 'Ops Lead', managerId: 'p-alex' },
  ];

  const events: LeadosEvent[] = [];
  const push = (type: LeadosEvent['type'], daysAgo: number, data: Record<string, any>) => {
    events.push({ id: id('ev'), type, ts: new Date(nowMs - daysAgo * DAY).toISOString(), data });
  };

  // --- Pulse mood, weekly, ~26 weeks. Priya + Sam trend down (retention risk signal). ---
  for (let w = 26; w >= 0; w--) {
    const daysAgo = w * 7;
    people.forEach((p) => {
      let base = 7.2;
      if (p.id === 'p-priya' || p.id === 'p-sam') {
        // declining trend toward the present
        base = 7.5 - (26 - w) * 0.14;
      }
      const score = Math.max(1, Math.min(10, Math.round((base + (rnd() - 0.5) * 1.4) * 10) / 10));
      push('pulse.mood.logged', daysAgo, { personId: p.id, score });
    });
  }

  // --- 1:1 cadence, biased so Priya's manager cadence slips (overdue). ---
  for (let w = 20; w >= 0; w--) {
    const daysAgo = w * 7;
    [
      { managerId: 'p-alex', personId: 'p-jordan', gap: 7 },
      { managerId: 'p-alex', personId: 'p-morgan', gap: 7 },
      { managerId: 'p-alex', personId: 'p-riley', gap: 14 },
      { managerId: 'p-priya', personId: 'p-sam', gap: w < 8 ? 21 : 7 },
      { managerId: 'p-priya', personId: 'p-taylor', gap: 7 },
      { managerId: 'p-jordan', personId: 'p-casey', gap: 7 },
    ].forEach((o) => {
      push('oneonone.logged', daysAgo, {
        managerId: o.managerId,
        personId: o.personId,
        scheduledGapDays: o.gap,
        overdue: o.gap > 10,
      });
    });
  }

  // --- One attrition event ~40 days ago. ---
  push('hr.attrition.logged', 40, { personId: 'p-devon-former', reason: 'voluntary:better-offer', voluntary: true });

  // --- Financial KPIs, monthly for ~9 months: cash declining, burn rising a bit, margin softening. ---
  for (let m = 8; m >= 0; m--) {
    const daysAgo = m * 30;
    const cash = 1_450_000 - (8 - m) * 95_000 + (rnd() - 0.5) * 20000;
    const burn = 140_000 + (8 - m) * 4200 + (rnd() - 0.5) * 6000;
    const margin = 61 - (8 - m) * 0.6 + (rnd() - 0.5) * 2;
    const revVsTarget = -2 - (8 - m) * 0.9 + (rnd() - 0.5) * 4;
    const nps = 42 - (8 - m) * 0.4 + (rnd() - 0.5) * 4;
    push('fin.kpi.logged', daysAgo, { metric: 'cash_balance', value: Math.round(cash) });
    push('fin.kpi.logged', daysAgo, { metric: 'monthly_burn', value: Math.round(burn) });
    push('fin.kpi.logged', daysAgo, { metric: 'gross_margin_pct', value: Math.round(margin * 10) / 10 });
    push('fin.kpi.logged', daysAgo, { metric: 'revenue_vs_target', value: Math.round(revVsTarget * 10) / 10 });
    push('fin.kpi.logged', daysAgo, { metric: 'nps_score', value: Math.round(nps) });
  }

  // --- Deals: ~26 over 180 days, win rate ~42%, losses concentrated on "price". ---
  const lossReasons = ['price', 'price', 'price', 'timing', 'competitor', 'no-decision'];
  for (let i = 0; i < 26; i++) {
    const daysAgo = Math.round(rnd() * 180);
    const won = rnd() < 0.42;
    const cycleDays = 18 + Math.round(rnd() * 55);
    if (won) {
      push('sales.deal.won', daysAgo, { dealId: id('deal'), amount: 8000 + Math.round(rnd() * 40000), cycleDays });
    } else {
      const reason = lossReasons[Math.floor(rnd() * lossReasons.length)];
      push('sales.deal.lost', daysAgo, { dealId: id('deal'), reason, cycleDays });
    }
  }

  // --- A seeded living strategy document, written ~60 days ago. ---
  push('strategy.doc', 60, {
    title: 'Q4 Growth & Efficiency Strategy',
    version: 1,
    ownerId: 'p-alex',
    objectives: [
      'Grow net-new ARR 25% QoQ without expanding headcount',
      'Hold gross margin above 60% while scaling support',
      'Keep engineering attrition at zero through year-end',
    ],
    assumptions: [
      { id: 'A1', statement: 'Win rate remains above 40%', metric: 'win_rate', threshold: 0.4, operator: 'gte', critical: true },
      { id: 'A2', statement: 'Team remains at 8+ active people', metric: 'headcount', threshold: 8, operator: 'gte', critical: false },
      { id: 'A3', statement: 'Gross margin stays above 60%', metric: 'gross_margin_pct', threshold: 60, operator: 'gte', critical: true },
      { id: 'A4', statement: 'Runway stays above 9 months', metric: 'runway_months', threshold: 9, operator: 'gte', critical: true },
      { id: 'A5', statement: 'Attrition stays at 0 in trailing 90 days', metric: 'attrition_count_90d', threshold: 0, operator: 'eq', critical: false },
    ],
    validUntil: new Date(nowMs + 70 * DAY).toISOString(),
  });

  events.sort((a, b) => +new Date(a.ts) - +new Date(b.ts));

  return { people, events };
}
