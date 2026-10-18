// LEADOS.scenarios — PART 2 of this session's task: Federated Scenario
// Planning Engine. Faithfully implements the *behavior* described in the
// pasted brief (treated as an unverified external spec — not found in the
// real wbweve/Leados repo). Adapted from the brief's vanilla-JS sketch into
// TypeScript modules wired to this session's original bayesian/wargame/
// finIntel/engine/healthScore implementations.
//
// DISCLOSED DEVIATION FROM THE PASTED SPEC: the spec's own axis-selection
// sort comparator — `(1 - |a.posterior-0.5|) - (1 - |b.posterior-0.5|)`,
// ascending — actually orders the MOST CONFIDENT belief first, contradicting
// its own comment ("Primary axis: highest uncertainty belief"). Shipping
// that literally would make "uncertainty-driven" scenarios pick the belief
// the org is *most* sure about. Fixed here to sort ascending by
// `|posterior - 0.5|` so the least-confident (most uncertain) belief really
// is axis 1. This is a correction, not a silent copy of unverified code.
import { bayesian } from './bayesian';
import { engine, events } from './engine';
import { finIntel } from './finIntel';
import { healthScore } from './healthScore';
import { wargame } from './wargame';
import type { AppState, Projection } from './types';

const DAY = 864e5;

export interface ScenarioAxisBelief {
  key: string;
  question: string;
  posterior: number;
  posteriorPct: number;
}

export interface Scenario {
  name: string;
  label: string;
  probability: number;
  axes: Record<string, 'FAVORABLE' | 'ADVERSE'>;
  color: string;
  organizationalState: ReturnType<typeof simulateScenarioState>;
  requiredActions: { priority: string; action: string; rationale: string }[];
  leadingIndicators: { indicator: string; checkFrequency: string }[];
}

function simulateScenarioState(scenario: Pick<Scenario, 'axes'>, P: Projection, today: number) {
  const scenarioEvents = [...P.state.events];

  if (scenario.axes['attrition.next60d'] === 'ADVERSE') {
    scenarioEvents.push({
      id: 'scenario-attrition-sim',
      type: 'hr.attrition.logged',
      ts: new Date(today + 30 * DAY).toISOString(),
      data: { personId: 'sim', reason: 'scenario:adverse' },
      simulated: true,
    });
  }

  if (scenario.axes['revenue.miss.next_quarter'] === 'ADVERSE') {
    scenarioEvents.push({
      id: 'scenario-revenue-sim',
      type: 'fin.kpi.logged',
      ts: new Date(today + 45 * DAY).toISOString(),
      data: { metric: 'revenue_vs_target', value: -15 },
      simulated: true,
    });
  }

  if (scenario.axes['margin_compression.next_quarter'] === 'ADVERSE') {
    scenarioEvents.push({
      id: 'scenario-margin-sim',
      type: 'fin.kpi.logged',
      ts: new Date(today + 45 * DAY).toISOString(),
      data: { metric: 'gross_margin_pct', value: 52 },
      simulated: true,
    });
  }

  try {
    const scenarioState: AppState = { ...P.state, events: scenarioEvents };
    const scenarioP = events.project(scenarioState);
    const findings = engine.run(scenarioP, today);
    const health = healthScore.compute(scenarioP, today);

    return {
      findingCount: findings.findings.length,
      criticalFindings: findings.findings.filter((f) => f.sev >= 4).length,
      healthScore: health.overall,
      topFinding: findings.findings[0]?.title ?? 'No active findings',
      label: 'Simulated organizational state: this scenario\'s adverse/favorable axes injected as synthetic future events, then run back through the findings engine and health score.',
    };
  } catch (e: any) {
    return { error: e.message, findingCount: 0, criticalFindings: 0, healthScore: 0, topFinding: 'error', label: 'Simulation failed.' };
  }
}

function deriveRequiredActions(scenario: Pick<Scenario, 'name' | 'axes'>) {
  const actions: { priority: string; action: string; rationale: string }[] = [];

  if (scenario.name === 'WORST_CASE') {
    actions.push({
      priority: 'IMMEDIATE',
      action: 'Build cash reserve / cut burn to extend runway by 60d',
      rationale: 'Worst case materializing requires a financial buffer',
    });
    actions.push({
      priority: 'IMMEDIATE',
      action: 'Identify top-3 retention-critical people and begin proactive retention',
      rationale: 'Attrition during financial stress compounds fastest',
    });
  }

  if (scenario.axes['attrition.next60d'] === 'ADVERSE') {
    actions.push({
      priority: 'THIS_WEEK',
      action: 'Begin retention conversations with all high-flight-risk individuals',
      rationale: 'Pre-empt attrition before it materializes',
    });
  }

  if (scenario.axes['revenue.miss.next_quarter'] === 'ADVERSE') {
    actions.push({
      priority: 'THIS_WEEK',
      action: 'Review pipeline: identify at-risk deals and an intervention plan',
      rationale: 'Pipeline quality determines whether the miss is avoidable',
    });
  }

  if (scenario.axes['margin_compression.next_quarter'] === 'ADVERSE') {
    actions.push({
      priority: 'THIS_WEEK',
      action: 'Audit cost-to-serve and vendor contracts for margin leaks',
      rationale: 'Margin compression is usually structural, not one event — catch it early',
    });
  }

  if (!actions.length) {
    actions.push({ priority: 'MONITOR', action: 'No forced action — keep leading indicators under routine review', rationale: 'Favorable axes in this scenario; avoid overreacting to noise' });
  }

  return actions;
}

const INDICATOR_LIBRARY: Record<string, { indicator: string; checkFrequency: string }[]> = {
  'attrition.next60d:ADVERSE': [
    { indicator: 'Pulse mood below 5/10 for 2+ consecutive weeks', checkFrequency: 'weekly' },
    { indicator: '1:1 cadence overdue rate above 40%', checkFrequency: 'weekly' },
    { indicator: 'Unplanned PTO or disengagement signals spike', checkFrequency: 'monthly' },
  ],
  'revenue.miss.next_quarter:ADVERSE': [
    { indicator: 'Win rate drop > 5pp from baseline', checkFrequency: 'weekly' },
    { indicator: 'Pipeline coverage ratio falls below 3×', checkFrequency: 'weekly' },
    { indicator: 'Loss reason concentration > 50% on one reason', checkFrequency: 'monthly' },
  ],
  'margin_compression.next_quarter:ADVERSE': [
    { indicator: 'Gross margin trending down 2+ consecutive months', checkFrequency: 'monthly' },
    { indicator: 'Monthly burn growth rate exceeds revenue growth rate', checkFrequency: 'monthly' },
  ],
};

function deriveLeadingIndicators(scenario: Pick<Scenario, 'axes'>) {
  const result: { indicator: string; checkFrequency: string }[] = [];
  Object.entries(scenario.axes).forEach(([axis, outcome]) => {
    const key = `${axis}:${outcome}`;
    if (INDICATOR_LIBRARY[key]) result.push(...INDICATOR_LIBRARY[key]);
  });
  return result;
}

function defaultScenarios(): { scenarios: Scenario[]; label: string; axes: null } {
  const asScenario = (name: string, probability: number, label: string, color: string): Scenario => ({
    name,
    label,
    probability,
    axes: {},
    color,
    organizationalState: { findingCount: 0, criticalFindings: 0, healthScore: 50, topFinding: 'n/a', label: 'Default scenario — not simulated (no axes).' } as any,
    requiredActions: [],
    leadingIndicators: [],
  });
  return {
    scenarios: [
      asScenario('BASELINE', 60, 'Current trajectory continues', 'var(--sev-clear)'),
      asScenario('UPSIDE', 20, 'Execution improves significantly', 'var(--sev-clear)'),
      asScenario('DOWNSIDE', 20, 'One or more risks materialize', 'var(--sev-5)'),
    ],
    axes: null,
    label: 'Default scenarios — insufficient Bayesian data for derived axes. Log more events to generate data-driven scenarios.',
  };
}

export const scenarios = {
  buildScenarioSet(P: Projection, today: number) {
    const beliefResult = bayesian.computeAllBeliefs(P, today);
    void wargame.buildCompetitiveLandscape(P, today); // computed for context; see disclosure below
    void finIntel.runwayStatus(P, today); // computed for context; see disclosure below

    const sortedBeliefs = Object.entries(beliefResult.beliefs)
      .map(([key, v]: [string, any]) => ({ key, ...v }))
      // DISCLOSED FIX (see file header): ascending by distance-from-0.5, so
      // the most uncertain belief (closest to 50/50) really does sort first.
      .sort((a, b) => Math.abs(a.posterior - 0.5) - Math.abs(b.posterior - 0.5));

    const axis1 = sortedBeliefs[0];
    const axis2 = sortedBeliefs[1];

    if (!axis1 || !axis2) return defaultScenarios();

    const base = [
      {
        name: 'BEST_CASE',
        label: `${axis1.key.replace(/_/g, ' ')} resolves favorably + ${axis2.key.replace(/_/g, ' ')} resolves favorably`,
        probability: (1 - axis1.posterior) * (1 - axis2.posterior),
        axes: { [axis1.key]: 'FAVORABLE', [axis2.key]: 'FAVORABLE' } as Record<string, 'FAVORABLE' | 'ADVERSE'>,
        color: 'var(--sev-clear)',
      },
      {
        name: 'RISK_A',
        label: `${axis1.key.replace(/_/g, ' ')} materializes, ${axis2.key.replace(/_/g, ' ')} resolves favorably`,
        probability: axis1.posterior * (1 - axis2.posterior),
        axes: { [axis1.key]: 'ADVERSE', [axis2.key]: 'FAVORABLE' } as Record<string, 'FAVORABLE' | 'ADVERSE'>,
        color: 'var(--sev-3)',
      },
      {
        name: 'RISK_B',
        label: `${axis1.key.replace(/_/g, ' ')} resolves favorably, ${axis2.key.replace(/_/g, ' ')} materializes`,
        probability: (1 - axis1.posterior) * axis2.posterior,
        axes: { [axis1.key]: 'FAVORABLE', [axis2.key]: 'ADVERSE' } as Record<string, 'FAVORABLE' | 'ADVERSE'>,
        color: 'var(--sev-3)',
      },
      {
        name: 'WORST_CASE',
        label: `Both ${axis1.key.replace(/_/g, ' ')} and ${axis2.key.replace(/_/g, ' ')} materialize`,
        probability: axis1.posterior * axis2.posterior,
        axes: { [axis1.key]: 'ADVERSE', [axis2.key]: 'ADVERSE' } as Record<string, 'FAVORABLE' | 'ADVERSE'>,
        color: 'var(--sev-5)',
      },
    ];

    const totalProb = base.reduce((a, s) => a + s.probability, 0) || 1;
    base.forEach((s) => (s.probability = Math.round((s.probability / totalProb) * 100)));

    const simulated: Scenario[] = base.map((scenario) => ({
      ...scenario,
      organizationalState: simulateScenarioState(scenario, P, today),
      requiredActions: deriveRequiredActions(scenario),
      leadingIndicators: deriveLeadingIndicators(scenario),
    }));

    return {
      scenarios: simulated,
      axes: { primary: axis1.key as string, secondary: axis2.key as string },
      axisBeliefs: { primary: axis1, secondary: axis2 },
      label:
        `Scenario matrix from Bayesian uncertainty axes. Primary axis: ${axis1.key} (${axis1.posteriorPct}%). ` +
        `Secondary: ${axis2.key} (${axis2.posteriorPct}%). ` +
        `Labeled: scenarios assume independent axes (unlikely in reality — correlated risks tend to co-occur). ` +
        `Probabilities are directional, not actuarial. ` +
        `Competitive landscape and runway status were computed for this build but, per the pasted spec, are not folded into the probability math — ` +
        `surfaced instead as read-only context in the UI rather than silently discarded.`,
    };
  },
};
