// Deterministic synthetic roster + event log generator.
// Original to this delivery. Seeded PRNG so the "anomalies" the Emergent
// Pattern Detector and Hypothesis Engine find are reproducible across loads,
// not re-randomized every session (makes the demo legible and debuggable).

import type { AppState, LeadosEvent, Person } from './types';

// mulberry32 — small, fast, deterministic PRNG. Public-domain algorithm.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ROSTER: Person[] = [
  { id: 'p1', name: 'Dana Okafor', role: 'Eng Lead', team: 'Platform' },
  { id: 'p2', name: 'Marcus Lee', role: 'Senior Engineer', team: 'Platform' },
  { id: 'p3', name: 'Priya Natarajan', role: 'Product Lead', team: 'Growth' },
  { id: 'p4', name: 'Theo Richter', role: 'Designer', team: 'Growth' },
  { id: 'p5', name: 'Sofia Mendes', role: 'Eng Lead', team: 'Infra' },
  { id: 'p6', name: 'Jamal Washington', role: 'Senior Engineer', team: 'Infra' },
  { id: 'p7', name: 'Elin Brandt', role: 'Data Lead', team: 'Growth' },
  { id: 'p8', name: 'Noor Abbasi', role: 'Engineer', team: 'Platform' },
];

const DAY = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 150;

function isoDaysAgo(today: Date, daysAgo: number, jitterHours = 0): string {
  const t = new Date(today.getTime() - daysAgo * DAY + jitterHours * 60 * 60 * 1000);
  return t.toISOString();
}

let idCounter = 0;
function mintId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter.toString(36)}`;
}

/**
 * Builds a deterministic ~150-day synthetic event log with a handful of
 * deliberately injected anomalies so the Emergent Pattern Detector and
 * Hypothesis Engine have real, discoverable signal instead of flat noise.
 * Labeled: synthetic data, generated for this sandbox, not real org data.
 */
export function buildSeedEvents(today: Date): LeadosEvent[] {
  const rng = mulberry32(20261017);
  const events: LeadosEvent[] = [];
  idCounter = 0;

  const push = (daysAgo: number, type: string, data: Record<string, any>, jitterHours = 0) => {
    events.push({ id: mintId('ev'), ts: isoDaysAgo(today, daysAgo, jitterHours), type, data });
  };

  // --- Weekly velocity + engagement baseline, with a late divergence ---
  for (let w = Math.floor(HISTORY_DAYS / 7); w >= 0; w--) {
    const daysAgo = w * 7 + Math.floor(rng() * 2);
    const recentPhase = daysAgo <= 30;

    // Baseline velocity ~ 10-14; in the most recent 30d it drops (process blocker scenario)
    const velocity = recentPhase
      ? 6 + rng() * 2 // depressed
      : 10 + rng() * 4;
    push(daysAgo, 'velocity.logged', { value: Math.round(velocity * 10) / 10 });

    // Baseline engagement ~ 6-8; stays high even as velocity craters (divergence anomaly)
    const engagement = recentPhase ? 7.2 + rng() * 1.2 : 6 + rng() * 2;
    push(daysAgo, 'engagement.pulse', { value: Math.round(engagement * 10) / 10 });
  }

  // --- Feedback events: steady baseline, then a volume spike with low engagement lift ---
  for (let i = 0; i < 18; i++) {
    const daysAgo = 35 + Math.floor(rng() * 110);
    const personId = ROSTER[Math.floor(rng() * ROSTER.length)].id;
    push(daysAgo, 'feedback.given', { personId, tone: rng() > 0.4 ? 'developmental' : 'corrective' });
  }
  // Recent spike (last 30d): 8 feedback events, skewed corrective
  for (let i = 0; i < 8; i++) {
    const daysAgo = Math.floor(rng() * 29);
    const personId = ROSTER[Math.floor(rng() * ROSTER.length)].id;
    push(daysAgo, 'feedback.given', { personId, tone: rng() > 0.75 ? 'developmental' : 'corrective' });
  }

  // --- Decisions + outcomes: velocity picks up recently, evidence thins out ---
  for (let i = 0; i < 14; i++) {
    const daysAgo = 35 + Math.floor(rng() * 110);
    const id = mintId('dec');
    push(daysAgo, 'decision.logged', { id, topic: `Decision ${i + 1}` });
    if (rng() > 0.25) {
      push(Math.max(0, daysAgo - Math.floor(rng() * 20)), 'decision.outcome', {
        decisionId: id,
        result: rng() > 0.35 ? 'success' : 'failure',
      });
    }
  }
  // Recent decision-velocity spike with thinner evidence (overload signal)
  for (let i = 0; i < 9; i++) {
    const daysAgo = Math.floor(rng() * 29);
    const id = mintId('dec');
    push(daysAgo, 'decision.logged', { id, topic: `Fast decision ${i + 1}` });
    if (rng() > 0.6) {
      push(Math.max(0, daysAgo - 2), 'decision.outcome', {
        decisionId: id,
        result: rng() > 0.55 ? 'success' : 'failure',
      });
    }
  }

  // --- Conflict + attrition: historically correlated cluster that fades, then a fresh spike ---
  for (let i = 0; i < 6; i++) {
    const daysAgo = 95 + Math.floor(rng() * 50);
    const p1 = ROSTER[Math.floor(rng() * ROSTER.length)].id;
    let p2 = ROSTER[Math.floor(rng() * ROSTER.length)].id;
    if (p2 === p1) p2 = ROSTER[(ROSTER.findIndex((p) => p.id === p1) + 1) % ROSTER.length].id;
    push(daysAgo, 'conflict.logged', { person1Id: p1, person2Id: p2, severity: 2 + Math.floor(rng() * 3) });
    if (rng() > 0.5) {
      push(daysAgo - Math.floor(rng() * 5), 'hr.attrition.logged', { personId: p2, risk: 'elevated' });
    }
  }
  // Recent isolated conflict spike (last 7-10 days), WITHOUT matching attrition -> new, untagged pattern
  for (let i = 0; i < 4; i++) {
    const daysAgo = Math.floor(rng() * 9);
    const p1 = 'p2'; // Marcus Lee — concentrate the recent signal on one person
    const p2 = ROSTER[Math.floor(rng() * ROSTER.length)].id;
    push(daysAgo, 'conflict.logged', { person1Id: p1, person2Id: p2, severity: 3 + Math.floor(rng() * 2) });
  }

  // --- Behavioral change point: Marcus Lee (p2) event frequency rises sharply in recent weeks ---
  for (let w = 0; w < Math.floor(HISTORY_DAYS / 7); w++) {
    const baseCount = 1;
    const recentBoost = w < 5 ? 3 : 0; // last 5 weeks: much busier (escalating involvement)
    const n = baseCount + recentBoost + (rng() > 0.7 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const daysAgo = w * 7 + Math.floor(rng() * 7);
      push(daysAgo, 'feedback.given', { personId: 'p2', tone: rng() > 0.5 ? 'developmental' : 'corrective' }, rng() * 20);
    }
  }

  // --- Ops incidents + finance: mild baseline, nothing dramatic ---
  for (let i = 0; i < 10; i++) {
    const daysAgo = Math.floor(rng() * HISTORY_DAYS);
    push(daysAgo, 'ops.incident.logged', { severity: 1 + Math.floor(rng() * 3) });
  }
  for (let m = 0; m < 5; m++) {
    push(m * 30, 'fin.pl.logged', { runway_months: 14 - m });
  }

  events.sort((a, b) => (a.ts < b.ts ? -1 : 1));
  return events;
}

export function buildInitialState(today: Date): AppState {
  return {
    events: buildSeedEvents(today),
    roster: ROSTER,
    settings: {
      cadenceDays: 14,
      haptics: true,
      cognitiveBudget: 'AUTO',
    },
  };
}
