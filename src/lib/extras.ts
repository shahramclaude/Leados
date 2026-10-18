// LeadOS pt-Q — smaller, original additions beyond the two fully-specified
// engines (causal.ts, flightRisk.ts). The pasted pt-Q brief only *names* these
// capabilities (high-potential ID, informal power network / "dark matter",
// meeting intelligence) without providing algorithms — so everything in this
// file is original, simplified, and labeled as a heuristic, not a verified
// method. Several other named pt-Q capabilities (information cascade
// prediction, OKR causal chains, compensation equity analytics, promotion
// bias detection, org learning velocity) are DISCLOSED GAPS — not built this
// session — because inventing undisclosed methodology for them would
// misrepresent rigor that doesn't exist. See AboutView / README for the list.
import type { Projection } from './types';
import { days } from './stats';

// ---------- High-potential identification (heuristic, ASSUMED weights) ----------
export interface HiPoResult {
  person: Projection['people'][number];
  score: number;
  reasons: string[];
}

export function identifyHighPotential(P: Projection, today: string): HiPoResult[] {
  return P.directs.concat(P.skips).map((person) => {
    const feedback = (P.feedbackByPerson[person.id] || []).filter((f) => days(f.ts, today) <= 90);
    const pulses = (P.pulsesByPerson[person.id] || []).filter((p) => days(p.ts, today) <= 30);
    const feedbackBalance = feedback.length ? feedback.filter((f) => f.polarity === 'positive').length / feedback.length : null;
    const meanMood = pulses.length ? pulses.reduce((a, b) => a + b.mood, 0) / pulses.length : null;
    const hasGrowthPlan = P.openPlans.some((pl) => pl.personId === person.id);
    const conflicts = P.state.events.filter(
      (e) => e.type === 'conflict.logged' && days(e.ts, today) <= 90 && (e.data.person1Id === person.id || e.data.person2Id === person.id)
    ).length;

    let score = 0;
    const reasons: string[] = [];
    if (feedbackBalance !== null && feedbackBalance >= 0.75) { score += 0.35; reasons.push(`Strong positive-feedback fraction (${Math.round(feedbackBalance * 100)}%)`); }
    if (meanMood !== null && meanMood >= 7) { score += 0.25; reasons.push(`High engagement pulse (${meanMood.toFixed(1)}/10)`); }
    if (hasGrowthPlan) { score += 0.2; reasons.push('Active growth plan in motion'); }
    if (conflicts === 0) { score += 0.1; reasons.push('No recent conflict involvement'); }
    if (feedback.length >= 4) { score += 0.1; reasons.push('Frequent feedback signal (well-observed)'); }

    return { person, score: Math.round(score * 100) / 100, reasons };
  }).sort((a, b) => b.score - a.score);
}

// ---------- Informal power network / "dark matter" (degree-centrality heuristic) ----------
export interface NetworkNode {
  person: Projection['people'][number];
  centrality: number; // sum of incident edge weights, normalized 0-1
  isFormalLeader: boolean;
  darkMatter: boolean; // high centrality, no formal leadership title
}

const LEADER_WORDS = ['manager', 'lead', 'director', 'head', 'vp', 'chief'];

export function detectPowerNetwork(P: Projection): { nodes: NetworkNode[]; edges: { a: string; b: string; weight: number }[]; label: string } {
  const weightMap = new Map<string, number>();
  const edges: { a: string; b: string; weight: number }[] = [];
  P.state.events.forEach((e) => {
    if (e.type !== 'collab.logged') return;
    const { personAId, personBId, weight } = e.data;
    if (!personAId || !personBId) return;
    edges.push({ a: personAId, b: personBId, weight: weight || 1 });
    weightMap.set(personAId, (weightMap.get(personAId) || 0) + (weight || 1));
    weightMap.set(personBId, (weightMap.get(personBId) || 0) + (weight || 1));
  });
  const maxWeight = Math.max(1, ...Array.from(weightMap.values()));
  const nodes: NetworkNode[] = P.directs.concat(P.skips).map((person) => {
    const centrality = (weightMap.get(person.id) || 0) / maxWeight;
    const isFormalLeader = LEADER_WORDS.some((w) => person.title.toLowerCase().includes(w));
    return { person, centrality: Math.round(centrality * 100) / 100, isFormalLeader, darkMatter: centrality >= 0.6 && !isFormalLeader };
  }).sort((a, b) => b.centrality - a.centrality);

  return {
    nodes,
    edges,
    label:
      'Degree-centrality heuristic over synthetic collab.logged events (sum of incident edge weights, normalized to the most-connected person = 1.0). ' +
      'This is NOT full betweenness/eigenvector centrality and is not a verified org-network-analysis method \u2014 a simplified, original, disclosed proxy for "who do people actually route around through," ' +
      'useful only as a conversation starter, not a performance signal.',
  };
}

// ---------- Meeting intelligence: decision velocity (simple ratio heuristic) ----------
export interface MeetingStat {
  id: string;
  ts: string;
  type: string;
  attendeeCount: number;
  durationMinutes: number;
  decisionsCount: number;
  decisionVelocityPerHour: number;
  flag: string | null;
}

export function analyzeMeetings(P: Projection): { meetings: MeetingStat[]; avgVelocity: number; label: string } {
  const meetings: MeetingStat[] = P.state.events
    .filter((e) => e.type === 'meeting.logged')
    .map((e) => {
      const hours = e.data.durationMinutes / 60;
      const velocity = hours > 0 ? e.data.decisionsCount / hours : 0;
      return {
        id: e.id,
        ts: e.ts,
        type: e.data.type,
        attendeeCount: (e.data.attendees || []).length,
        durationMinutes: e.data.durationMinutes,
        decisionsCount: e.data.decisionsCount,
        decisionVelocityPerHour: Math.round(velocity * 100) / 100,
        flag: e.data.decisionsCount === 0 && e.data.attendees?.length > 4 ? 'Zero decisions, 5+ attendees \u2014 candidate for an async update instead' : null,
      };
    })
    .sort((a, b) => b.ts.localeCompare(a.ts));

  const avgVelocity = meetings.length ? meetings.reduce((a, m) => a + m.decisionVelocityPerHour, 0) / meetings.length : 0;

  return {
    meetings,
    avgVelocity: Math.round(avgVelocity * 100) / 100,
    label:
      'Decision velocity = decisions logged \u00f7 meeting hours, per meeting, from synthetic meeting.logged events. ' +
      'An original, simplified heuristic \u2014 not a validated meeting-effectiveness instrument.',
  };
}

export const DISCLOSED_GAPS = [
  {
    name: 'Information cascade prediction through the org network',
    why: 'The pasted pt-Q brief names this capability but provides no algorithm. A real cascade model needs validated diffusion mechanics (e.g. independent-cascade or linear-threshold models) tuned against observed propagation data, which does not exist in this synthetic dataset.',
  },
  {
    name: 'Meeting-decision effectiveness beyond raw velocity',
    why: 'Effectiveness (were the decisions good?) requires outcome tracking this build does not fabricate data for.',
  },
  {
    name: 'OKR causal chains / leading indicators architecture',
    why: 'No OKR event types exist in this synthetic log; inventing a full goal-causality model without real goal-tracking data would overstate rigor.',
  },
  {
    name: 'Organizational learning velocity measurement',
    why: 'Named in the brief without a defined formula; left undefined here rather than inventing one and presenting it as derived from the spec.',
  },
  {
    name: 'Compensation equity analytics',
    why: 'Requires real compensation data fields not present in (and inappropriate to fabricate realistically for) this demo dataset.',
  },
  {
    name: 'Promotion pattern / bias analysis',
    why: 'Requires a promotion event history with demographic or cohort fields this build deliberately does not fabricate, to avoid implying a bias-detection tool works on invented data.',
  },
];
