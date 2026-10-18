// LeadOS pt-Q — Part 1: Structural Causal Model engine.
// Ported from the pasted pt-Q spec's `LEADOS.causal` object into TypeScript
// module form for this project's src/-based architecture. The algorithms,
// edge lists, and labeling conventions below follow the pasted spec as given;
// nothing here is claimed to come from github.com/wbweve/Leados (no causal
// engine of any kind was found there — see AI-SESSION-LOG.md).
import type { Projection } from './types';
import { days } from './stats';
import { pearsonCorrelation } from './stats';
import { project } from './store';
import { run } from './engine';

export type EdgeType = 'ASSUMED' | 'EVIDENCED' | 'CONFIRMED';

export interface CausalEdge {
  from: string;
  to: string;
  direction: 'DIRECT' | 'INVERSE';
  type: EdgeType;
  basis: string;
  assumed_strength?: number;
  confirmed_strength?: number;
  r?: number;
  n?: number;
}

export interface CausalNode {
  person: Projection['people'][number];
  variables: Record<string, number | null>;
}

export interface CausalGraph {
  nodes: Map<string, CausalNode>;
  edges: CausalEdge[];
  label: string;
}

interface VarDef {
  measure: (P: Projection, pid: string, today: string) => number | null;
  label: string;
}

const VARIABLES: Record<string, VarDef> = {
  oneOnOneCadence: {
    measure: (P, pid, today) => {
      const last = P.oneononeLast[pid];
      if (!last) return null;
      const gap = days(last.ts, today);
      const cadence = P.peopleById[pid]?.cadenceDays || 14;
      return gap / cadence;
    },
    label: '1:1 adherence ratio (actual/target cadence)',
  },
  engagementPulse: {
    measure: (P, pid, today) => {
      const pulses = (P.pulsesByPerson[pid] || []).filter((pu) => days(pu.ts, today) <= 30);
      return pulses.length ? pulses.reduce((a, b) => a + b.mood, 0) / pulses.length : null;
    },
    label: 'Mean engagement pulse (30d window)',
  },
  feedbackBalance: {
    measure: (P, pid, today) => {
      const feedback = (P.feedbackByPerson[pid] || []).filter((f) => days(f.ts, today) <= 90);
      if (!feedback.length) return null;
      return feedback.filter((f) => f.polarity === 'positive').length / feedback.length;
    },
    label: 'Positive feedback fraction (90d)',
  },
  growthPlanActive: {
    measure: (P, pid) => (P.openPlans.some((pl) => pl.personId === pid) ? 1 : 0),
    label: 'Binary: active growth plan exists',
  },
  conflictInvolvement: {
    measure: (P, pid, today) =>
      P.state.events.filter(
        (e) => e.type === 'conflict.logged' && days(e.ts, today) <= 90 && (e.data.person1Id === pid || e.data.person2Id === pid)
      ).length,
    label: 'Conflict events in last 90d',
  },
  workloadSignal: {
    measure: (P, pid, today) => {
      const pulses = (P.pulsesByPerson[pid] || []).filter((pu) => days(pu.ts, today) <= 30 && pu.load !== undefined);
      return pulses.length ? pulses.reduce((a, b) => a + (b.load || 0), 0) / pulses.length : null;
    },
    label: 'Mean workload pulse (30d)',
  },
  burnoutSignal: {
    measure: (P, pid, today) => {
      const pulses = (P.pulsesByPerson[pid] || []).filter((pu) => days(pu.ts, today) <= 30);
      if (!pulses.length) return null;
      const meanMood = pulses.reduce((a, b) => a + b.mood, 0) / pulses.length;
      const loaded = pulses.filter((p) => p.load !== undefined);
      const meanLoad = loaded.length ? loaded.reduce((a, b) => a + (b.load || 0), 0) / loaded.length : 0;
      return meanLoad > 7 && meanMood < 5 ? 1 : 0;
    },
    label: 'Binary: high load + low mood simultaneously',
  },
  flightRisk: {
    measure: (P, pid) => {
      const departure = P.state.events.find((e) => e.type === 'hr.attrition.logged' && e.data.personId === pid);
      return departure ? 1 : 0;
    },
    label: 'Binary outcome: attrition occurred (historical only)',
  },
};

export const VARIABLE_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(VARIABLES).map(([k, v]) => [k, v.label])
);

function computeEvidencedEdges(nodes: Map<string, CausalNode>): CausalEdge[] {
  const evidenced: CausalEdge[] = [];
  const varNames = Object.keys(VARIABLES);
  const people = [...nodes.values()];
  for (let i = 0; i < varNames.length; i++) {
    for (let j = i + 1; j < varNames.length; j++) {
      const varA = varNames[i];
      const varB = varNames[j];
      const pairs = people
        .map((n) => ({ a: n.variables[varA], b: n.variables[varB] }))
        .filter((p): p is { a: number; b: number } => p.a !== null && p.b !== null);
      if (pairs.length < 3) continue;
      const r = pearsonCorrelation(pairs.map((p) => p.a), pairs.map((p) => p.b));
      if (Math.abs(r) >= 0.4) {
        evidenced.push({
          from: r > 0 ? varA : varB,
          to: r > 0 ? varB : varA,
          direction: 'DIRECT',
          r: Math.round(r * 100) / 100,
          n: pairs.length,
          type: 'EVIDENCED',
          basis: `Pearson r=${r.toFixed(2)} across ${pairs.length} people in your org. Labeled: correlation from your data. Not confirmed as causal.`,
        });
      }
    }
  }
  return evidenced;
}

const ASSUMED_EDGES: CausalEdge[] = [
  { from: 'oneOnOneCadence', to: 'engagementPulse', direction: 'INVERSE', assumed_strength: 0.45, type: 'ASSUMED', basis: 'Hersey & Blanchard (1969): cadence is a leading indicator of engagement. Not yet confirmed from your data.' },
  { from: 'feedbackBalance', to: 'engagementPulse', direction: 'DIRECT', assumed_strength: 0.35, type: 'ASSUMED', basis: 'Positive feedback increases intrinsic motivation (Deci & Ryan, 1985). Not yet confirmed from your data.' },
  { from: 'growthPlanActive', to: 'engagementPulse', direction: 'DIRECT', assumed_strength: 0.3, type: 'ASSUMED', basis: 'Growth opportunities correlate with engagement (Gallup Q12, 2017). Not yet confirmed from your data.' },
  { from: 'burnoutSignal', to: 'flightRisk', direction: 'DIRECT', assumed_strength: 0.6, type: 'ASSUMED', basis: 'Burnout is a leading predictor of voluntary turnover (Leiter & Maslach, 2009).' },
  { from: 'engagementPulse', to: 'flightRisk', direction: 'INVERSE', assumed_strength: 0.55, type: 'ASSUMED', basis: 'Low engagement predicts turnover (Gallup, 2022).' },
  { from: 'conflictInvolvement', to: 'engagementPulse', direction: 'INVERSE', assumed_strength: 0.35, type: 'ASSUMED', basis: 'Unresolved conflict reduces psychological safety and engagement.' },
  { from: 'workloadSignal', to: 'burnoutSignal', direction: 'DIRECT', assumed_strength: 0.5, type: 'ASSUMED', basis: 'High workload is a primary burnout driver (Maslach et al., 2001).' },
];

export function buildCausalGraph(P: Projection, today: string): CausalGraph {
  const nodes = new Map<string, CausalNode>();
  P.directs.concat(P.skips).forEach((person) => {
    const vars: Record<string, number | null> = {};
    for (const [name, def] of Object.entries(VARIABLES)) {
      try {
        vars[name] = def.measure(P, person.id, today);
      } catch {
        vars[name] = null;
      }
    }
    nodes.set(person.id, { person, variables: vars });
  });

  const evidencedEdges = computeEvidencedEdges(nodes);
  const confirmedEdges: CausalEdge[] = P.state.events
    .filter((e) => e.type === 'causal.annotation')
    .map((e) => ({
      from: e.data.cause,
      to: e.data.effect,
      direction: e.data.direction,
      confirmed_strength: e.data.strength,
      type: 'CONFIRMED' as const,
      basis: 'Your explicit causal annotation: ' + e.data.note,
    }));

  return {
    nodes,
    edges: [...ASSUMED_EDGES, ...evidencedEdges, ...confirmedEdges],
    label:
      'Structural Causal Model from event log. ASSUMED edges: from domain knowledge. EVIDENCED edges: from your event log correlations. CONFIRMED edges: from your explicit annotations. Source: Pearl (2000) Causality. Labeled: correlation \u2260 causation. Assumed edges are theory, not proof.',
  };
}

export function estimateCausalEffect(
  intervention: { variable: string; value: number },
  outcome: string,
  graph: CausalGraph,
  nodes: Map<string, CausalNode>
) {
  const interventionParents = graph.edges.filter((e) => e.to === intervention.variable).map((e) => e.from);
  const outcomeParents = graph.edges.filter((e) => e.to === outcome).map((e) => e.from);
  const confounders = interventionParents.filter((v) => outcomeParents.includes(v));
  const people = [...nodes.values()];

  if (!confounders.length) {
    const withIntervention = people.filter((n) => (n.variables[intervention.variable] ?? 0) >= intervention.value * 0.8);
    const withoutIntervention = people.filter((n) => (n.variables[intervention.variable] ?? 0) < intervention.value * 0.8);
    if (!withIntervention.length || !withoutIntervention.length) {
      return { error: 'Insufficient data for estimation' } as const;
    }
    const meanWith = withIntervention.reduce((a, n) => a + (n.variables[outcome] ?? 0), 0) / withIntervention.length;
    const meanWithout = withoutIntervention.reduce((a, n) => a + (n.variables[outcome] ?? 0), 0) / withoutIntervention.length;
    return {
      estimatedEffect: Math.round((meanWith - meanWithout) * 100) / 100,
      nWith: withIntervention.length,
      nWithout: withoutIntervention.length,
      confounders: [] as string[],
      confidence: 'LOW \u2014 no confounders found but hidden confounders are possible',
      interpretation:
        `If you maintain ${intervention.variable} at ${intervention.value}, ${outcome} is estimated to be ` +
        `${meanWith - meanWithout > 0 ? 'higher' : 'lower'} by ~${Math.abs(meanWith - meanWithout).toFixed(2)} units ` +
        `(n_with=${withIntervention.length}, n_without=${withoutIntervention.length}).`,
      label:
        'Backdoor adjustment causal estimate. n=' + people.length + ' people (small sample \u2014 treat with caution). ' +
        'Source: Pearl (2009) backdoor criterion. Labeled: assumes no hidden confounders. Labeled: n < 30 \u2192 estimate unreliable.',
    };
  }

  return {
    method: 'STRATIFIED_ADJUSTMENT',
    confounders,
    note:
      'Confounders identified: ' + confounders.join(', ') + '. Full adjustment requires n > ' + confounders.length * 10 +
      ' people for reliable estimates. Your current n=' + people.length + ' is ' +
      (people.length > confounders.length * 10 ? 'sufficient.' : 'insufficient.'),
    label: 'Labeled: small org = high variance in causal estimates.',
  } as const;
}

export interface Hypothetical {
  type: string;
  date: string;
  description: string;
  predictedEffect: string;
}

export function counterfactual(hypothetical: Hypothetical, P: Projection, today: string) {
  const { date, description, predictedEffect, type } = hypothetical;

  const historicalEvents = P.state.events.filter((e) => e.ts < date);
  const historicalState = { events: historicalEvents, people: P.state.people };
  const historicalP = project(historicalState);

  const actualState = {
    activeFindings: 0,
    teamSize: P.people.filter((p) => !p.archived).length,
    attritions: P.state.events.filter((e) => e.type === 'hr.attrition.logged').length,
    openGoals: P.openGoals.length,
  };
  const pastState = {
    activeFindings: 0,
    teamSize: historicalP.people.filter((p) => !p.archived).length,
    attritions: historicalEvents.filter((e) => e.type === 'hr.attrition.logged').length,
    openGoals: historicalP.openGoals.length,
  };

  actualState.activeFindings = run(P, today).findings.length;
  pastState.activeFindings = run(historicalP, date).findings.length;

  const actualDelta = {
    findings: actualState.activeFindings - pastState.activeFindings,
    teamSize: actualState.teamSize - pastState.teamSize,
    attritions: actualState.attritions - pastState.attritions,
    openGoals: actualState.openGoals - pastState.openGoals,
  };

  return {
    hypothetical: { type, date, description, predictedEffect },
    baseline: pastState,
    actual: actualState,
    actualDelta,
    counterfactualAnalysis: {
      whatHappened:
        `Between ${date.slice(0, 10)} and today: ${Math.abs(actualDelta.attritions)} attrition(s), ` +
        `${actualDelta.teamSize > 0 ? '+' : ''}${actualDelta.teamSize} team size, ${Math.abs(actualDelta.findings)} finding delta.`,
      hypotheticalPrediction: predictedEffect,
      canVerify: false,
      learningValue:
        `If your hypothesis was "${predictedEffect}", look for similar decisions in the future where you CAN test it. ` +
        `Log decision.outcome events with explicit causal notes to build evidence.`,
    },
    label:
      'Counterfactual reasoning on your event log. Source: Lewis (1973) counterfactual conditionals. Labeled: counterfactuals are inherently unverifiable. ' +
      'This analysis shows what actually happened, not what would have happened. Your hypothesis about the counterfactual cannot be confirmed without a parallel universe. ' +
      'Use it for mental model calibration, not fact.',
  };
}
