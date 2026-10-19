// src/lib/strategicIntelligence.ts
// Part 4 — Strategic War Room synthesis layer.
//
// Calls (exact export names, with the line number they are defined at in
// this checkout):
//   scenarioEngine.ts   → METRIC_DEFINITIONS (29), defaultBaselineState (44),
//                         projectScenario (85), olsTrend (160)
//   wargameEngine.ts    → generateCompetitorProfile (74), pickLikelyCounterMove (112),
//                         scoreWargameRound (129), describeMoveOutcome (150)
//   realOptions.ts      → calculateRealOptionValue (23)
//   narrativeIntel.ts   → buildDomainHealthNarrative (43)
//   synthesis.ts        → getOrganizationalMoment (46)
//   beliefFabric.ts     → BeliefFabricResult (type, Part 1)

import {
  METRIC_DEFINITIONS,
  defaultBaselineState,
  projectScenario,
  olsTrend,
} from './scenarioEngine';
import {
  generateCompetitorProfile,
  pickLikelyCounterMove,
  scoreWargameRound,
  describeMoveOutcome,
  MOVE_CATALOG,
  type CompetitorProfile,
  type Move,
} from './wargameEngine';
import { calculateRealOptionValue } from './realOptions';
import { buildDomainHealthNarrative } from './narrativeIntel';
import { getOrganizationalMoment } from './synthesis';
import type { BeliefFabricResult } from './beliefFabric';
import type { Decision, DecisionDomain } from './decisionTypes';
import {
  ALL_METRIC_KEYS,
  type MetricDef,
  type MetricKey,
  type MetricValue,
  type LeadosEvent,
  type SavedScenario,
  type ActivatedScenario,
  type WargameAutoResult,
  type StrategicRisk,
  type BoardDecision,
  type BoardIntelligencePack,
  type StrategicIntelligenceReport,
  type MetricSurveillanceEntry,
  type Urgency,
} from './types';

export interface StrategicIntelligenceInput {
  beliefResult: BeliefFabricResult;
  decisions: Decision[];
  metrics: MetricValue[];
  metricDefs: MetricDef[];
  events: LeadosEvent[];
  existingScenarios: SavedScenario[];
  competitors: CompetitorProfile[];
  now: Date;
}

const COMPETITIVE_EVENT_TYPES = [
  'competitive.signal',
  'market.move',
  'talent.poach',
  'customer.churn.to_competitor',
  'pricing.pressure',
];

// ---------------------------------------------------------------------------
// A. SCENARIO SURVEILLANCE
// ---------------------------------------------------------------------------

type MetricSurveillance = MetricSurveillanceEntry;

function daysBetween(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

function last90DaysValues(metrics: MetricValue[], key: MetricKey, now: Date): MetricValue[] {
  return metrics
    .filter((m) => m.metricKey === key && daysBetween(now, new Date(m.date)) <= 90 && daysBetween(now, new Date(m.date)) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function runMetricSurveillance(metrics: MetricValue[], now: Date): MetricSurveillance[] {
  return ALL_METRIC_KEYS.map((key) => {
    const rows = last90DaysValues(metrics, key, now);
    const def = METRIC_DEFINITIONS[key];
    const baseline = defaultBaselineState[key];
    const actual = rows.length ? rows[rows.length - 1].value : baseline;
    const trendPerMonth = olsTrend(rows.map((r) => ({ date: r.date, value: r.value })));
    const monthlyVolatility = def.volatility * baseline;
    const deviationSigmas = monthlyVolatility === 0 ? 0 : Math.abs(actual - baseline) / monthlyVolatility;

    return {
      metricKey: key,
      actualValue: actual,
      baselineValue: baseline,
      deviationSigmas,
      trendPerMonth,
      urgency: 'watch' as Urgency, // filled in once projection is known for activated metrics
    };
  });
}

function implicationFor(key: MetricKey, actual: number, baseline: number, dev: number, criticalMonth: number | null): string {
  const worse = isWorseDirection(key, actual, baseline);
  const devStr = dev.toFixed(1);
  const criticalPhrase = criticalMonth ? `month ${criticalMonth}` : 'beyond the 12-month horizon';

  const templates: Record<MetricKey, { worse: string; better: string }> = {
    revenue: {
      worse: `Revenue is ${devStr}σ below model — at current trajectory, cash position reaches critical in ${criticalPhrase}.`,
      better: `Revenue is ${devStr}σ above model — the business is outperforming plan and may support accelerated investment.`,
    },
    churnRate: {
      worse: `Churn is running ${devStr}σ above baseline — the customer retention loop is breaking faster than the model assumed.`,
      better: `Churn is ${devStr}σ below baseline — retention is outperforming plan, a potential leading indicator of durable product-market fit.`,
    },
    cac: {
      worse: `Customer acquisition cost is ${devStr}σ above baseline — go-to-market efficiency is degrading faster than planned.`,
      better: `Customer acquisition cost is ${devStr}σ below baseline — acquisition is more efficient than modeled, a candidate for reinvestment.`,
    },
    burnRate: {
      worse: `Burn rate is ${devStr}σ above baseline — runway is compressing faster than the plan assumed, reaching critical in ${criticalPhrase}.`,
      better: `Burn rate is ${devStr}σ below baseline — the organization is spending more conservatively than modeled.`,
    },
    runwayMonths: {
      worse: `Runway is ${devStr}σ below baseline — the model now treats a financing or cost decision as time-sensitive, critical in ${criticalPhrase}.`,
      better: `Runway is ${devStr}σ above baseline — more flexibility than modeled to make offensive, non-defensive bets.`,
    },
    nps: {
      worse: `NPS is ${devStr}σ below baseline — product sentiment is degrading, a likely leading indicator for the churn model.`,
      better: `NPS is ${devStr}σ above baseline — product sentiment is outperforming plan.`,
    },
    headcount: {
      worse: `Headcount is ${devStr}σ below baseline — execution capacity is lagging the plan the roadmap assumes.`,
      better: `Headcount is ${devStr}σ above baseline — org is scaling faster than modeled; watch burn rate in tandem.`,
    },
    pipelineCoverage: {
      worse: `Pipeline coverage is ${devStr}σ below baseline — forward revenue is under-covered relative to target.`,
      better: `Pipeline coverage is ${devStr}σ above baseline — more forward revenue visibility than modeled.`,
    },
    conversionRate: {
      worse: `Conversion rate is ${devStr}σ below baseline — the funnel is leaking more than the model assumed.`,
      better: `Conversion rate is ${devStr}σ above baseline — the funnel is outperforming plan.`,
    },
    grossMargin: {
      worse: `Gross margin is ${devStr}σ below baseline — unit economics are eroding faster than modeled.`,
      better: `Gross margin is ${devStr}σ above baseline — unit economics are stronger than modeled.`,
    },
    productUsage: {
      worse: `Product usage is ${devStr}σ below baseline — engagement is falling faster than the model assumed, a leading indicator for churn.`,
      better: `Product usage is ${devStr}σ above baseline — engagement is outperforming plan.`,
    },
  };

  const t = templates[key];
  return worse ? t.worse : t.better;
}

function isWorseDirection(key: MetricKey, actual: number, baseline: number): boolean {
  const direction = METRIC_DEFINITIONS[key].direction;
  if (direction === 'higher_better') return actual < baseline;
  return actual > baseline;
}

function urgencyFor(deviationSigmas: number, p10RunwayMonths: number): Urgency {
  if (deviationSigmas >= 3 || p10RunwayMonths < 6) return 'act';
  if (deviationSigmas >= 2 || p10RunwayMonths < 12) return 'plan';
  return 'watch';
}

function runScenarioSurveillance(
  metrics: MetricValue[],
  now: Date,
): { all: MetricSurveillance[]; activated: ActivatedScenario[] } {
  const all = runMetricSurveillance(metrics, now);
  const activated: ActivatedScenario[] = [];

  for (const s of all) {
    if (s.deviationSigmas <= 2) continue; // not activated by data

    const projection = projectScenario(defaultBaselineState, { [s.metricKey]: s.actualValue } as Partial<typeof defaultBaselineState>, s.metricKey, 12, 1000);
    const urgency = urgencyFor(s.deviationSigmas, projection.p10RunwayMonths);
    s.urgency = urgency;

    activated.push({
      metricKey: s.metricKey,
      actualValue: s.actualValue,
      baselineValue: s.baselineValue,
      deviationSigmas: s.deviationSigmas,
      trendPerMonth: s.trendPerMonth,
      projection,
      implication: implicationFor(s.metricKey, s.actualValue, s.baselineValue, s.deviationSigmas, projection.p10CriticalMonth),
      urgency,
    });
  }

  activated.sort((a, b) => b.deviationSigmas - a.deviationSigmas);
  return { all, activated };
}

// ---------------------------------------------------------------------------
// B. WAR GAME AUTO-ANALYSIS
// ---------------------------------------------------------------------------

function decisionToMove(decision: Decision): Move {
  const axisByDomain: Record<DecisionDomain, Move['axis']> = {
    revenue: 'market',
    product: 'momentum',
    people: 'talent',
    capital: 'capital',
    gtm: 'market',
    operations: 'momentum',
  };
  return {
    id: `decision_${decision.id}`,
    name: decision.title,
    axis: axisByDomain[decision.domain] ?? 'momentum',
    impact: 10 + decision.impact * 3,
    description: decision.recommendation ?? decision.description ?? decision.title,
  };
}

function detectWargameTrigger(events: LeadosEvent[], now: Date): string[] {
  const recent = events.filter((e) => daysBetween(now, new Date(e.timestamp)) <= 14 && daysBetween(now, new Date(e.timestamp)) >= 0);
  const triggered = Array.from(new Set(recent.filter((e) => COMPETITIVE_EVENT_TYPES.includes(e.type)).map((e) => e.type)));
  return triggered;
}

function runWargameAutoAnalysis(input: StrategicIntelligenceInput, trigger: string[]): WargameAutoResult | null {
  if (trigger.length === 0 || input.competitors.length === 0) return null;

  const recentCompetitiveText = input.events
    .filter((e) => daysBetween(input.now, new Date(e.timestamp)) <= 14)
    .filter((e) => COMPETITIVE_EVENT_TYPES.includes(e.type))
    .map((e) => e.description ?? e.type)
    .join('. ');

  const proposed = input.decisions
    .filter((d) => d.status === 'proposed')
    .sort((a, b) => b.impact - a.impact);
  const ourBestMove: Move = proposed.length ? decisionToMove(proposed[0]) : MOVE_CATALOG[2];

  const competitorCounters: Record<string, Move> = {};
  const roundScores: Record<string, ReturnType<typeof scoreWargameRound>> = {};

  let topCompetitorName = input.competitors[0]?.name ?? 'the leading competitor';
  let topCounter: Move | null = null;

  for (const comp of input.competitors) {
    const refreshedProfile = generateCompetitorProfile(comp.name, `${recentCompetitiveText} ${comp.name}`);
    const counter = pickLikelyCounterMove(refreshedProfile, ourBestMove);
    const score = scoreWargameRound(ourBestMove, counter, refreshedProfile);
    competitorCounters[comp.name] = counter;
    roundScores[comp.name] = score;
    if (!topCounter || refreshedProfile.aggressiveness > 0.6) {
      topCounter = counter;
      topCompetitorName = comp.name;
    }
  }

  const blindspots = (input.beliefResult.uncertaintyFlags.length
    ? input.beliefResult.uncertaintyFlags
    : [{ node: 'Competitive Pressure', confidence: 0.5, signalDescription: 'win/loss call notes' }]
  )
    .slice(0, 3)
    .map((f) => `Limited visibility into ${f.node} (${Math.round(f.confidence * 100)}% confidence) — ${f.signalDescription} would sharpen this read.`);

  while (blindspots.length < 3) {
    blindspots.push('No additional blindspot identified beyond the standard model uncertainty.');
  }

  const outcomeText = describeMoveOutcome(ourBestMove);
  const recommendation = `Our highest-leverage move is ${ourBestMove.name}, which ${outcomeText}. Watch for ${topCompetitorName}'s likely counter: ${topCounter ? topCounter.name : 'an uncommitted response'}.`;

  return { trigger, ourBestMove, competitorCounters, roundScores, blindspots, recommendation };
}

// ---------------------------------------------------------------------------
// C. BOARD INTELLIGENCE
// ---------------------------------------------------------------------------

function buildKeyMetricTableHTML(surveillance: MetricSurveillance[]): string {
  const rowStyle = 'style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;"';
  const headStyle = 'style="padding:6px 10px;text-align:left;font-size:12px;color:#6b7280;border-bottom:2px solid #111827;"';

  const rows = surveillance
    .map((s) => {
      const delta = s.actualValue - s.baselineValue;
      const status = s.deviationSigmas >= 3 ? { color: '#991b1b', bg: '#fee2e2', label: 'Red' } : s.deviationSigmas >= 2 ? { color: '#92400e', bg: '#fef3c7', label: 'Yellow' } : { color: '#065f46', bg: '#d1fae5', label: 'Green' };
      const def = METRIC_DEFINITIONS[s.metricKey];
      return `<tr>
        <td ${rowStyle}>${def.label}</td>
        <td ${rowStyle}>${formatMetricValue(s.actualValue, def.unit)}</td>
        <td ${rowStyle}>${formatMetricValue(s.baselineValue, def.unit)}</td>
        <td ${rowStyle}>${delta >= 0 ? '+' : ''}${formatMetricValue(delta, def.unit)}</td>
        <td ${rowStyle}>${s.trendPerMonth >= 0 ? '▲' : '▼'} ${Math.abs(s.trendPerMonth).toFixed(1)}/mo</td>
        <td ${rowStyle}><span style="background:${status.bg};color:${status.color};padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;">${status.label}</span></td>
      </tr>`;
    })
    .join('');

  return `<table style="width:100%;border-collapse:collapse;font-family:inherit;">
    <thead><tr>
      <th ${headStyle}>Metric</th>
      <th ${headStyle}>Current</th>
      <th ${headStyle}>Baseline</th>
      <th ${headStyle}>Delta</th>
      <th ${headStyle}>Trend</th>
      <th ${headStyle}>Status</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function formatMetricValue(v: number, unit: string): string {
  if (unit === '$') return `$${Math.round(v).toLocaleString()}`;
  if (unit === '%' || unit === 'pts') return `${v.toFixed(1)}${unit === '%' ? '%' : ''}`;
  return `${v.toFixed(1)}${unit ? ' ' + unit : ''}`;
}

function severityForState(state: 'healthy' | 'at_risk' | 'critical'): number {
  return state === 'critical' ? 90 : state === 'at_risk' ? 55 : 15;
}

function implicationForNode(nodeId: string, domain: string): string {
  const map: Record<string, string> = {
    customer_trust: 'If left unaddressed, erosion in customer trust compounds directly into churn and ultimately revenue. Early intervention via proactive outreach is materially cheaper than win-back later.',
    team_morale: 'Low morale precedes attrition of the people closest to the roadmap and customers. This risk is hard to observe directly, so it is likely under-weighted in current plans.',
    product_momentum: 'Stalling product momentum reduces differentiation just as competitive pressure increases, creating a compounding gap in win rate.',
    capital_runway: 'A compressing runway narrows the set of strategic options available and forces reactive rather than proactive decisions.',
    competitive_pressure: 'Rising competitive pressure typically shows up first in churn and deal cycle length before it is visible in win/loss reporting.',
    operational_debt: 'Accumulating operational debt increases the blast radius of any single incident and slows the org\'s ability to respond to the other risks on this list.',
  };
  return map[nodeId] ?? `This risk in ${domain} warrants monitoring alongside the organization's other strategic priorities.`;
}

function buildTop3StrategicRisks(belief: BeliefFabricResult): StrategicRisk[] {
  return [...belief.latentNodes]
    .sort((a, b) => severityForState(b.state) - severityForState(a.state))
    .slice(0, 3)
    .map((n) => ({
      title: n.name,
      domain: n.domain,
      severity: severityForState(n.state),
      confidence: n.confidence,
      implication: implicationForNode(n.id, n.domain),
    }));
}

function buildDecisionsForBoard(decisions: Decision[], now: Date): BoardDecision[] {
  const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return decisions
    .filter((d) => d.status === 'proposed' && d.impact >= 4 && new Date(d.deadline) < horizon)
    .sort((a, b) => b.impact * b.confidence - a.impact * a.confidence)
    .slice(0, 3)
    .map((d) => ({
      id: d.id,
      title: d.title,
      domain: d.domain,
      stakes: d.stakes ?? `Impact ${d.impact}/5 at ${Math.round(d.confidence * 100)}% model confidence.`,
      options: d.options,
      recommendation: d.recommendation ?? `Proceed with ${d.options[0] ?? 'the leading option'} given current signal strength.`,
      deadline: d.deadline,
      optionValue: calculateRealOptionValue({ estimatedValue: d.estimatedValue ?? 0, deadline: d.deadline, now }),
    }));
}

function buildConfidenceStatement(belief: BeliefFabricResult): string {
  const lowest = [...belief.uncertaintyFlags].sort((a, b) => a.confidence - b.confidence)[0];
  if (!lowest) {
    return 'The system has high confidence across all tracked latent nodes at this time.';
  }
  return `The system has lowest confidence in ${lowest.node} (confidence: ${Math.round(lowest.confidence * 100)}%) — additional ${lowest.signalDescription} data would improve prediction accuracy most.`;
}

function buildExecutiveSummary(
  belief: BeliefFabricResult,
  activated: ActivatedScenario[],
  decisions: Decision[],
  now: Date,
  confidenceStatement: string,
): string {
  const s1 = `Organizational health is at ${belief.orgHealthScore}/100, with ${belief.dominantRisk.label} the dominant signal the model is tracking in the ${belief.dominantRisk.domain} domain.`;

  const topChain = [...belief.causalChains].sort((a, b) => b.confidence - a.confidence)[0];
  const s2 = topChain
    ? `The highest-confidence causal read (${Math.round(topChain.confidence * 100)}%): ${topChain.description}`
    : 'No dominant causal chain has been detected across tracked domains.';

  const urgent = [...activated].sort((a, b) => {
    const order: Record<Urgency, number> = { act: 2, plan: 1, watch: 0 };
    return order[b.urgency] - order[a.urgency] || b.deviationSigmas - a.deviationSigmas;
  })[0];
  const s3 = urgent
    ? `The most urgent activated scenario is ${METRIC_DEFINITIONS[urgent.metricKey].label} (${urgent.deviationSigmas.toFixed(1)}σ from plan, status: ${urgent.urgency}) — ${urgent.implication}`
    : 'No scenario has deviated far enough from the modeled baseline to activate this period.';

  const upcoming = decisions
    .filter((d) => daysBetween(new Date(d.deadline), now) <= 0 && daysBetween(new Date(d.deadline), now) >= -14)
    .sort((a, b) => b.impact - a.impact)[0];
  const s4 = upcoming
    ? `The most important near-term call is "${upcoming.title}" (${upcoming.domain}), due within ${Math.max(0, Math.round(daysBetween(new Date(upcoming.deadline), now) * -1))} days.`
    : 'No high-impact decision is due within the next 14 days.';

  const s5 = `${confidenceStatement} Treat all projections here as directional, not exact.`;

  return [s1, s2, s3, s4, s5].join(' ');
}

function buildBoardPack(input: StrategicIntelligenceInput, surveillance: MetricSurveillance[], activated: ActivatedScenario[], wargame: WargameAutoResult | null): BoardIntelligencePack {
  const confidenceStatement = buildConfidenceStatement(input.beliefResult);
  return {
    executiveSummary: buildExecutiveSummary(input.beliefResult, activated, input.decisions, input.now, confidenceStatement),
    organizationalMoment: getOrganizationalMoment(input.beliefResult),
    domainHealthNarrative: buildDomainHealthNarrative(input.beliefResult),
    top3StrategicRisks: buildTop3StrategicRisks(input.beliefResult),
    activatedScenarios: activated,
    decisionsForBoard: buildDecisionsForBoard(input.decisions, input.now),
    keyMetricTableHTML: buildKeyMetricTableHTML(surveillance),
    wargameInsight: wargame ? wargame.recommendation : null,
    confidenceStatement,
    generatedAt: input.now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function runStrategicIntelligence(input: StrategicIntelligenceInput): StrategicIntelligenceReport {
  const { all, activated } = runScenarioSurveillance(input.metrics, input.now);
  const trigger = detectWargameTrigger(input.events, input.now);
  const wargameAutoResult = runWargameAutoAnalysis(input, trigger);
  const boardPack = buildBoardPack(input, all, activated, wargameAutoResult);

  return {
    activatedScenarios: activated,
    metricSurveillance: all,
    wargameAutoResult,
    boardPack,
    generatedAt: input.now.toISOString(),
  };
}

export type { ActivatedScenario, WargameAutoResult, BoardIntelligencePack, StrategicRisk, BoardDecision, StrategicIntelligenceReport };
