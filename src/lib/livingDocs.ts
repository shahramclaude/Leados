// LEADOS.livingDocs — PART 3 of this session's task: Living Strategy
// Documents. Faithful translation of the pasted brief (treated as an
// unverified external spec) into TypeScript, wired to this session's
// original metric sources. No equivalent found in the real wbweve/Leados
// repo (no strategy.doc event type, no livingDocs.ts).
import { engine } from './engine';
import { finIntel } from './finIntel';
import { performance } from './performance';
import { wargame } from './wargame';
import type { Assumption, Projection, StrategyDocData } from './types';

function computeMetric(metric: string, P: Projection, today: number): number | null {
  const table: Record<string, () => number | null> = {
    win_rate: () => wargame._computeWinRate(P, today),
    headcount: () => P.people.filter((p) => !p.archived).length,
    gross_margin_pct: () => wargame._latestMetric(P, 'gross_margin_pct'),
    nps_score: () => wargame._latestMetric(P, 'nps_score'),
    velocity: () => wargame._computeVelocityMean(P, today),
    runway_months: () => finIntel.runwayStatus(P, today).runway_months,
    team_engagement: () => performance._computeTeamEngagement(P, today),
    attrition_count_90d: () => P.state.events.filter((e) => e.type === 'hr.attrition.logged' && engine._days(e.ts, today) <= 90 && engine._days(e.ts, today) >= 0).length,
  };
  return table[metric] ? table[metric]() : null;
}

function testAssumption(assumption: Assumption, P: Projection, today: number) {
  const { id, statement, metric, threshold, operator } = assumption;
  const current = computeMetric(metric, P, today);

  if (current === null) {
    return {
      id,
      statement,
      metric,
      threshold,
      operator,
      currentValue: null as number | null,
      violated: false,
      insufficient_data: true,
      critical: false,
      deviation: 0,
      interpretation: `No ${metric} data in the event log. Cannot verify this assumption.`,
    };
  }

  const violated = operator === 'gte' ? current < threshold : operator === 'lte' ? current > threshold : operator === 'eq' ? current !== threshold : false;

  const deviation = operator === 'gte' || operator === 'lte' ? Math.abs(current - threshold) / Math.max(1, Math.abs(threshold)) : 0;

  return {
    id,
    statement,
    metric,
    threshold,
    operator,
    currentValue: Math.round(current * 100) / 100,
    violated,
    insufficient_data: false,
    critical: !!(violated && assumption.critical),
    deviation: Math.round(deviation * 100),
    interpretation: violated
      ? `VIOLATED: assumed ${metric} ${operator} ${threshold}, actual: ${current.toFixed(2)}. Deviation: ${Math.round(deviation * 100)}%.`
      : `PASSING: ${metric} = ${current.toFixed(2)} (threshold: ${operator} ${threshold}).`,
  };
}

export const livingDocs = {
  evaluateAll(P: Projection, today: number) {
    const docs = P.state.events.filter((e) => e.type === 'strategy.doc');
    return docs.map((doc) => this.evaluate({ id: doc.id, ts: doc.ts, data: doc.data as StrategyDocData }, P, today));
  },

  evaluate(doc: { id: string; ts: string; data: StrategyDocData }, P: Projection, today: number) {
    const d = doc.data;
    const assumptions = d.assumptions || [];
    const results = assumptions.map((a) => testAssumption(a, P, today));

    const violated = results.filter((r) => r.violated);
    const passing = results.filter((r) => !r.violated && !r.insufficient_data);
    const unknown = results.filter((r) => r.insufficient_data);

    const validity = violated.length === 0 ? 'VALID' : violated.some((v) => v.critical) ? 'INVALIDATED' : 'DEGRADED';

    const daysSinceWritten = engine._days(doc.ts, today);

    return {
      docId: doc.id,
      title: d.title,
      version: d.version,
      objectives: d.objectives || [],
      validUntil: d.validUntil,
      daysSinceWritten,
      validity,
      assumptionResults: results,
      violated,
      passing,
      unknown,
      requiredAction:
        violated.length > 0
          ? `STRATEGY REVISION REQUIRED: ${violated.length} assumption(s) violated. The strategy "${d.title}" was written on assumptions that are no longer true. Operating on an invalidated strategy is worse than having no strategy.`
          : `Strategy "${d.title}" is holding. ${passing.length}/${assumptions.length} assumptions verified.`,
      label: `Living strategy document evaluation. ${assumptions.length} assumptions tested against current event log data. Labeled: only assumptions with logged metric data are verifiable; the rest show as unknown rather than assumed-true.`,
    };
  },
};
