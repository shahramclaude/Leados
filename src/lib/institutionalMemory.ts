// institutionalMemory.ts — Part 2: institutional memory.
// ORIGINAL to this session. Implements the functional idea of
// LEADOS.institutionalMemory from the pasted "pt-N" brief against this
// build's own schema. The "genome" trait helper below is explicitly MODELED
// ON a verified real-repo pattern (src/lib/genome.ts in wbweve/Leados,
// fetched and read in full this session): a ratio-based plans/directs
// heuristic with a "low sample size => low confidence" rule. The real
// file's signature is identify(plans: number, directs: number) — DIFFERENT
// from the pt-N brief's imagined LEADOS.genome.identify(P, today). This
// file reimplements the verified ratio-heuristic idea from scratch for this
// app's own event schema; it does not copy the real file's code.

import { AppState } from './types';
import { daysBetween } from './engine';

export interface Learning {
  type: 'DECISION_LEARNING' | 'CRISIS_LEARNING' | 'REFLECTIVE_LEARNING';
  date: string;
  context: string;
  lesson: string;
  outcome?: string;
  applicableTo: string;
  id: string;
}

export function extractLearnings(state: AppState): { learnings: Learning[]; byType: Record<string, number>; label: string } {
  const learnings: Learning[] = [];

  // Decision outcomes with lessons
  for (const o of state.events.filter((e) => e.type === 'decision.outcome' && e.data.lessons)) {
    const decision = state.events.find((e) => e.id === o.data.decisionId);
    learnings.push({
      type: 'DECISION_LEARNING',
      date: o.ts,
      context: decision ? `Decision: "${decision.data.title}"` : 'Decision (source not found)',
      lesson: o.data.lessons,
      outcome: o.data.result,
      applicableTo: 'Future decisions of a similar kind',
      id: o.id,
    });
  }

  // Crisis postmortem action items
  for (const pm of state.events.filter((e) => e.type === 'crisis.postmortem')) {
    for (const action of pm.data.action_items || []) {
      learnings.push({
        type: 'CRISIS_LEARNING',
        date: pm.ts,
        context: `Crisis postmortem: ${(pm.data.what_happened || '').slice(0, 60)}`,
        lesson: action.action,
        outcome: (pm.data.what_went_well || []).join('; '),
        applicableTo: `Crisis response: ${(pm.data.contributing_factors || []).join(', ')}`,
        id: `${pm.id}:${action.action.slice(0, 20)}`,
      });
    }
  }

  // Reflections
  for (const r of state.events.filter((e) => e.type === 'reflection.logged')) {
    for (const pattern of r.data.patterns || []) {
      learnings.push({
        type: 'REFLECTIVE_LEARNING',
        date: r.ts,
        context: 'Personal reflection',
        lesson: pattern,
        applicableTo: 'Leadership behavior',
        id: `${r.id}:${pattern.slice(0, 20)}`,
      });
    }
  }

  learnings.sort((a, b) => (a.date < b.date ? 1 : -1));

  return {
    learnings,
    byType: {
      DECISION_LEARNING: learnings.filter((l) => l.type === 'DECISION_LEARNING').length,
      CRISIS_LEARNING: learnings.filter((l) => l.type === 'CRISIS_LEARNING').length,
      REFLECTIVE_LEARNING: learnings.filter((l) => l.type === 'REFLECTIVE_LEARNING').length,
    },
    label: `${learnings.length} institutional learnings from ${state.events.length} events. Source: decision.outcome.lessons, crisis.postmortem.action_items, reflection.logged.patterns.`,
  };
}

export interface GenomeProfile {
  name: 'DEVELOPER' | 'DIRECTOR' | 'BALANCED';
  ratio: number;
  plans: number;
  directs: number;
  confidence: 'low' | 'medium';
  note: string;
}

export function identifyGenome(state: AppState): GenomeProfile {
  const styled = state.events.filter((e) => e.data && (e.data.style === 'plan' || e.data.style === 'direct'));
  const plans = styled.filter((e) => e.data.style === 'plan').length;
  const directs = styled.filter((e) => e.data.style === 'direct').length;
  const ratio = plans / Math.max(directs, 1);
  const total = plans + directs;
  const confidence: GenomeProfile['confidence'] = total >= 10 ? 'medium' : 'low';
  let name: GenomeProfile['name'] = 'BALANCED';
  if (ratio > 1.5) name = 'DEVELOPER';
  else if (ratio < 0.5) name = 'DIRECTOR';
  return {
    name,
    ratio: Math.round(ratio * 100) / 100,
    plans,
    directs,
    confidence,
    note: 'Heuristic ratio over self-tagged events (style: plan/direct) in this browser only — not a validated instrument. Modeled on a verified pattern in wbweve/Leados/src/lib/genome.ts, reimplemented independently.',
  };
}

export function recallRelevant(context: { findingRule?: string; personId?: string }, state: AppState, today: string): Learning[] {
  const { learnings } = extractLearnings(state);
  const scored = learnings
    .map((l) => {
      let relevance = 0;
      if (context.findingRule && l.lesson.includes(context.findingRule)) relevance += 10;
      if (context.personId) {
        const name = state.people.find((p) => p.id === context.personId)?.name || '';
        if (name && l.context.includes(name)) relevance += 8;
      }
      const daysOld = daysBetween(l.date, today);
      relevance += Math.max(0, 10 - daysOld / 30);
      return { ...l, relevance };
    })
    .filter((l) => l.relevance > 3)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3);
  return scored;
}

export function buildLearningTimeline(learnings: Learning[]) {
  const byQuarter: Record<string, Learning[]> = {};
  for (const l of learnings) {
    const d = new Date(l.date);
    const q = `Q${Math.ceil((d.getMonth() + 1) / 3)} ${d.getFullYear()}`;
    (byQuarter[q] ||= []).push(l);
  }
  return Object.entries(byQuarter)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([quarter, items]) => ({ quarter, count: items.length, highlights: items.slice(0, 2).map((l) => l.lesson.slice(0, 70)) }));
}

export function extractTransferableWisdom(learnings: Learning[]) {
  return learnings
    .filter((l) => l.type !== 'REFLECTIVE_LEARNING' && l.lesson.length > 15 && !/\bI\b|\bmy\b/i.test(l.lesson))
    .map((l) => ({ lesson: l.lesson, source: `${l.type} from ${l.date.slice(0, 10)}`, context: l.context }));
}

export function generateMemoryView(state: AppState, today: string) {
  const learnings = extractLearnings(state);
  const genome = identifyGenome(state);
  const timeline = buildLearningTimeline(learnings.learnings);
  const transferableWisdom = extractTransferableWisdom(learnings.learnings);
  const recentCount = learnings.learnings.filter((l) => daysBetween(l.date, today) <= 30).length;
  return { learnings, genome, timeline, transferableWisdom, recentCount };
}
