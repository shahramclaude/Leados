/**
 * app/core/domain/premises.js — the Premise Sentinel / Assumption Ledger
 * (Sessions 53–54, Schema v36, RULE-PREM-01..05).
 *
 * LeadOS already prices decisions (Tempo), scores promises (Forecast
 * Integrity), studies interventions (Impact Ledger) and measures structural
 * risk (Resilience, Power, Network, Load). What none of those surfaces could
 * answer is the question that quietly destroys a strategy: *the decision was
 * right when we made it, but is the premise it rested on still true?*
 *
 * 2026 decision-intelligence platforms monitor models, rules and execution
 * flows. Strategy tools flag at-risk OKRs. AI governance writing calls for an
 * "assumption ledger" with dated evidence, an accountable owner and a
 * pre-declared signal that should reopen the call. They do not give a single
 * local-first manager a deterministic, typed, event-driven implementation that
 * automatically senses evidence from every module and fans a broken premise
 * out into a DACI re-decision, a verification delegation and a blameless 1:1.
 * This module is that implementation.
 *
 * Named theory implemented explicitly (not adjectives):
 *
 *  - Dewar, Builder, Hix & Levin (RAND, 1993), Assumption-Based Planning:
 *    load-bearing assumptions, signposts, shaping actions and hedging actions.
 *    Each ledger record carries a signpost, a criticality, an owner and a
 *    review date. A breach opens four options: reaffirm + hedge (shaping),
 *    pause/renegotiate (hedging), reverse (exit), or buy information (probe).
 *  - Bayes in log-odds form and Good's weight of evidence: every observation
 *    is a named likelihood ratio for or against the premise. Evidence older
 *    than its half-life is discounted by 2^(-age/halfLife), floored at 5% so
 *    history is weakened, never silently deleted. Cromwell's rule clamps the
 *    prior to 5–95%: a leader cannot encode certainty.
 *  - Wald (1945) Sequential Probability Ratio Test: log Bayes-factor
 *    boundaries A = ln((1-beta)/alpha) and B = ln(beta/(1-alpha)) label
 *    "support boundary", "challenge boundary" and "continue sensing". These
 *    are *Wald-style boundaries*, not a formal significance claim: leadership
 *    evidence is heterogeneous and not IID.
 *  - Kullback–Leibler divergence in bits from prior to posterior gives an
 *    information-gain readout; currencies are never summed and unpriced
 *    decisions stay unpriced.
 *  - Kahneman/Klein pre-mortem and Mitchell, Russo & Pennington (1989)
 *    prospective hindsight: the register dialog asks "assume this failed —
 *    what signpost would have told you first?", not "what might go wrong?".
 *    The 30% reason-generation finding is NOT treated as proof that the
 *    resulting plan is safer; no such claim is made anywhere in the UI.
 *  - Reinertsen CD3 is reused through Decision Tempo: this rule is registered
 *    upstream of `decisionTempoRule`, so a re-decision is priced in the same
 *    atomic transaction that observes the breach.
 *
 * Hard honesty boundaries:
 *  - No LLM, telemetry, sentiment inference, hidden prior or automatic plan
 *    reversal. The leader supplies every prior and every manual observation;
 *    sensors read only dated facts already in the workspace.
 *  - Confidential conflicts and anonymous pulses are never read or linked.
 *  - Unrated FMEA cases produce NO priority-driven evidence (closing the
 *    roadmap's "unknown priority" hazard for this engine).
 *  - Evidence is append-only and keyed by sensor/source/state, so a changed
 *    record produces a NEW dated observation instead of rewriting history.
 *  - A human reaffirmation is an explicit, dated override; only evidence
 *    created after that acknowledgement can reopen the same breach.
 *
 * Pure module: no DOM, storage, network or wall-clock globals. The rule uses
 * the ADR-0008 post-commit context (injected now/id/logEvent).
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { resolveLinkedEntity } from './cases.js';
import { decisionValueTerms } from './decisionTempo.js';
import { evaluateBudget } from './finance.js';
import { buildLoadReport } from './load.js';
import { pertTriple } from './capacity.js';

export const PREMISE_ENGINE_VERSION = 'premise-sentinel-2026.10-v1';

export const PREMISE_STATUSES = Object.freeze([
  'unobserved', 'supported', 'watch', 'breached', 'reaffirmed', 'retired',
]);

export const PREMISE_STATUS_LABELS = Object.freeze({
  unobserved: 'Awaiting evidence',
  supported: 'Supported',
  watch: 'Watch',
  breached: 'Signpost breached',
  reaffirmed: 'Reaffirmed',
  retired: 'Retired',
});

export const PREMISE_CRITICALITIES = Object.freeze(['load-bearing', 'major', 'monitor']);
export const PREMISE_CRITICALITY_LABELS = Object.freeze({
  'load-bearing': 'Load-bearing',
  major: 'Major',
  monitor: 'Monitor',
});

export const PREMISE_DIRECTIONS = Object.freeze(['for', 'against']);
export const PREMISE_EVIDENCE_STRENGTHS = Object.freeze({
  weak: 1.5,
  moderate: 3,
  strong: 6,
});
export const PREMISE_EVIDENCE_STRENGTH_LABELS = Object.freeze({
  weak: 'Weak (LR 1.5)',
  moderate: 'Moderate (LR 3)',
  strong: 'Strong (LR 6)',
});

/** Wald-style boundaries. Deliberately exported and shown in the UI. */
export const PREMISE_SPRT_ALPHA = 0.1;
export const PREMISE_SPRT_BETA = 0.2;
export const PREMISE_SPRT_SUPPORT = Math.log((1 - PREMISE_SPRT_BETA) / PREMISE_SPRT_ALPHA);
export const PREMISE_SPRT_CHALLENGE = Math.log(PREMISE_SPRT_BETA / (1 - PREMISE_SPRT_ALPHA));

export const PREMISE_MIN_EVIDENCE_FOR_LEARNED = 5;
export const PREMISE_MIN_EVIDENCE_FOR_PROVISIONAL = 2;
export const PREMISE_DISCOUNT_FLOOR = 0.05;
export const PREMISE_DEFAULT_PRIOR_PCT = 70;
export const PREMISE_DEFAULT_WATCH_PCT = 55;
export const PREMISE_DEFAULT_BREACH_PCT = 30;
export const PREMISE_DEFAULT_HALF_LIFE_DAYS = 90;
export const PREMISE_DEFAULT_REVIEW_DAYS = 30;

/** Source types a leader may explicitly attach; sensors use the same vocabulary. */
export const PREMISE_SOURCE_TYPES = Object.freeze([
  'decision', 'case', 'dependency', 'budget', 'portfolio', 'stakeholder',
  'forecast', 'person', 'goal', 'negotiation', 'change', 'delegation', 'impact',
]);
export const PREMISE_SOURCE_COLLECTIONS = Object.freeze({
  decision: 'decisions',
  case: 'cases',
  dependency: 'dependencies',
  budget: 'budgets',
  portfolio: 'portfolio',
  stakeholder: 'stakeholders',
  forecast: 'forecastChallenges',
  person: 'people',
  goal: 'goals',
  negotiation: 'negotiations',
  change: 'changes',
  delegation: 'delegations',
  impact: 'impactStudies',
});

export const PREMISE_RULE_IDS = Object.freeze({
  SCOPE: 'RULE-PREM-01',
  SENSE: 'RULE-PREM-02',
  BREACH: 'RULE-PREM-03',
  REVIEW: 'RULE-PREM-04',
  CALIBRATE: 'RULE-PREM-05',
});

export const PREMISE_RULES = Object.freeze([
  {
    id: PREMISE_RULE_IDS.SCOPE,
    name: 'Pre-registered premise → typed decision & evidence graph',
    framework: 'Dewar et al. (1993) RAND Assumption-Based Planning; typed relationship graph',
    trigger: 'premise.created / premise.updated / premise.scan',
    targetModule: 'premises + links',
    description: 'Anchors the assumption to its decision with depends-on/tests links and copies every explicitly attached record into its typed evidence scope. A two-hop graph walk discovers related cases, budgets, dependencies and people automatically; no manual re-entry and no fuzzy text matching.',
  },
  {
    id: PREMISE_RULE_IDS.SENSE,
    name: 'Declarative sensor registry → append-only dated evidence ledger',
    framework: 'Good (1950) weight of evidence; Wald (1945) SPRT; Bayesian log-odds',
    trigger: 'case.* / decision.* / stakeholder.* / budget.* / dependency.* / portfolio.* / forecast.* / load.* / person.* / premise.scan',
    targetModule: 'premises.observations',
    description: 'Every sensor declares its source type, event prefixes, direction, likelihood ratio and extraction function. Relevant records produce one keyed, dated observation; a changed record produces a new observation instead of rewriting history. Evidence is discounted by a leader-owned half-life; unrated FMEA and unpriced records produce no fabricated evidence.',
  },
  {
    id: PREMISE_RULE_IDS.BREACH,
    name: 'Signpost breach → one DACI re-decision, verification delegation and 1:1 prompt',
    framework: 'RAND shaping/hedging actions; DACI; Reinertsen CD3 via Decision Tempo',
    trigger: 'any sensor trigger / premise.scan',
    targetModule: 'decisions + delegations + people + links',
    description: 'When fresh evidence pushes posterior belief below the breach threshold, opens exactly one four-option re-decision (hedge, pause, reverse, buy information) with typed links to the original decision, one owner-routed signpost verification delegation, and one blameless 1:1 talking point. Idempotent by marker; a human reaffirmation suppresses repeats until genuinely new evidence arrives.',
  },
  {
    id: PREMISE_RULE_IDS.REVIEW,
    name: 'Stale signpost → self-clearing review prompt',
    framework: 'Continuous controls monitoring; Dewar signpost cadence',
    trigger: 'premise.* / premise.scan / settings.updated',
    targetModule: 'people (1:1 talking points)',
    description: 'An overdue signpost review queues one blameless owner prompt; recording a review clears it. Pausing propagation suppresses new governance writes but never suppresses measurement or evidence sensing. An explicit human scan always runs.',
  },
  {
    id: PREMISE_RULE_IDS.CALIBRATE,
    name: 'Human outcome → typed calibration lineage',
    framework: 'Brier scoring; reliability diagrams; Population Stability Index (PSI)',
    trigger: 'premise.outcome',
    targetModule: 'premise outcomes + decision graph + sensor calibration',
    description: 'A dated human outcome becomes an immutable graph node linked to the premise and its decision. Outcome-scored Brier/gap metrics are derived by sensor, use one sample per settled premise and hide performance metrics below the five-premise floor; PSI is only a forecast-mix diagnostic with ten earlier and ten recent samples.',
  },
]);

/* ------------------------------------------------------------------ helpers */

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clean(value, max = 2000) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function isDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && dayKey(value) === value;
}

function dateOf(record, fallback) {
  const candidates = [
    record?.updatedAt, record?.createdAt, record?.updatedOn, record?.createdOn,
    record?.reviewedOn, record?.decidedOn, record?.date, record?.completedOn,
    record?.releasedOn, record?.respondedOn, record?.forecastOn,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  }
  return fallback;
}

function finite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positive(value) {
  const n = finite(value, null);
  return n !== null && n > 0 ? n : null;
}

function sigmoid(logOdds) {
  if (logOdds >= 0) return 1 / (1 + Math.exp(-logOdds));
  const e = Math.exp(logOdds);
  return e / (1 + e);
}

function binaryEntropy(p) {
  if (p <= 0 || p >= 1) return 0;
  return -(p * Math.log(p) + (1 - p) * Math.log(1 - p));
}

function klBernoulliBits(p, q) {
  const pp = clamp(p, 1e-9, 1 - 1e-9);
  const qq = clamp(q, 1e-9, 1 - 1e-9);
  const value = pp * Math.log(pp / qq) + (1 - pp) * Math.log((1 - pp) / (1 - qq));
  return Math.max(0, value / Math.LN2);
}

function round4(n) {
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : 0;
}

function round2(n) {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function scopeKey(sourceType, sourceId) {
  return `${sourceType}:${sourceId}`;
}

function allowedScopeType(type) {
  return PREMISE_SOURCE_TYPES.includes(type) && type !== 'decision';
}

/* -------------------------------------------------------------- sensor math */

/**
 * PREMISE_SENSORS is the generalized plug-in registry for cross-module
 * evidence. A new module can be sensed by adding one record here; the rule,
 * UI, CSV and brief all read this same array. Every sensor is pure and receives
 * a sensor context with `has(type,id)` so evidence is scoped by typed links.
 */
export const PREMISE_SENSORS = Object.freeze([
  {
    id: 'case-fmea',
    label: 'Rated operational-case FMEA',
    framework: 'AIAG-VDA FMEA risk priority number',
    sourceType: 'case',
    eventPrefixes: ['case.'],
    collect(ctx) {
      const out = [];
      for (const record of ctx.state.cases || []) {
        if (!record || !ctx.has('case', record.id)) continue;
        const f = record.fmea || {};
        // Roadmap Next #4: blank ratings are NOT defaulted to 5/5/5. An
        // unrated case is evidence of an evidence gap, not of high priority.
        const s = positive(f.severity);
        const p = positive(f.probability);
        const d = positive(f.detectability);
        if (!s || !p || !d) continue;
        const rpn = Math.round(s * p * d);
        const open = ['open', 'mitigating', 'monitoring'].includes(record.status);
        const closed = ['resolved', 'closed'].includes(record.status);
        let direction = null;
        let suffix = null;
        let likelihoodRatio = 1;
        if (open && rpn >= 216) {
          direction = 'against'; suffix = `rpn-${rpn}-open`; likelihoodRatio = 4;
        } else if (closed && rpn < 216) {
          direction = 'for'; suffix = `rpn-${rpn}-closed`; likelihoodRatio = 2;
        }
        if (!direction) continue;
        out.push({
          keySuffix: suffix,
          sourceType: 'case',
          sourceId: record.id,
          sourceRoute: `#/cases/${record.id}`,
          title: clean(record.title, 160) || 'Operational case',
          summary: `FMEA RPN ${rpn} (${s}×${p}×${d}); case ${record.status}`,
          direction,
          likelihoodRatio,
          observedOn: dateOf(record, ctx.today),
        });
      }
      return out;
    },
  },
  {
    id: 'stakeholder-veto',
    label: 'Veto-player stance',
    framework: 'Mendelow (1981); Tsebelis (1995) veto players',
    sourceType: 'stakeholder',
    eventPrefixes: ['stakeholder.', 'case.'],
    collect(ctx) {
      const out = [];
      for (const record of ctx.state.stakeholders || []) {
        if (!record || !ctx.has('stakeholder', record.id)) continue;
        const adverse = record.stance === 'blocker' || record.stance === 'skeptical';
        const supportive = record.stance === 'champion' || record.stance === 'supportive';
        if (!adverse && !supportive) continue;
        const veto = record.vetoPlayer === true;
        const history = Array.isArray(record.stanceHistory) ? record.stanceHistory : [];
        const latest = [...history].reverse().find((h) => h && isDay(h.on));
        out.push({
          keySuffix: `${record.stance}-${veto ? 'veto' : 'no-veto'}`,
          sourceType: 'stakeholder',
          sourceId: record.id,
          sourceRoute: `#/stakeholders/${record.id}`,
          title: clean(record.name, 160) || 'Stakeholder',
          summary: `${veto ? 'Veto player' : 'Stakeholder'} stance: ${record.stance}`,
          direction: adverse ? 'against' : 'for',
          likelihoodRatio: adverse ? (veto ? 5 : 3) : 2,
          observedOn: latest?.on || dateOf(record, ctx.today),
        });
      }
      return out;
    },
  },
  {
    id: 'dependency-continuity',
    label: 'Time-to-survive vs time-to-recover',
    framework: 'Simchi-Levi TTS/TTR; EU DORA operational continuity',
    sourceType: 'dependency',
    eventPrefixes: ['dependency.', 'case.'],
    collect(ctx) {
      const out = [];
      for (const record of ctx.state.dependencies || []) {
        if (!record || !ctx.has('dependency', record.id)) continue;
        const tts = positive(record.ttsDays);
        const ttr = positive(record.ttrDays);
        if (tts === null || ttr === null) continue;
        const gap = round2(ttr - tts);
        const critical = record.criticality === 'critical';
        let direction = null;
        if (gap > 0 && critical) direction = 'against';
        else if (gap <= 0) direction = 'for';
        if (!direction) continue;
        out.push({
          keySuffix: `tts-${tts}-ttr-${ttr}-${record.criticality || 'unknown'}`,
          sourceType: 'dependency',
          sourceId: record.id,
          sourceRoute: '#/resilience',
          title: clean(record.name, 160) || 'Operational dependency',
          summary: `TTS ${tts}d vs TTR ${ttr}d; criticality ${record.criticality || 'unknown'}`,
          direction,
          likelihoodRatio: direction === 'against' ? 4 : 1.5,
          observedOn: dateOf(record, ctx.today),
        });
      }
      return out;
    },
  },
  {
    id: 'budget-encumbrance',
    label: 'Budget forecast at completion',
    framework: 'Encumbrance accounting; RULE-FIN-01..03',
    sourceType: 'budget',
    eventPrefixes: ['budget.'],
    collect(ctx) {
      const out = [];
      for (const record of ctx.state.budgets || []) {
        if (!record || !ctx.has('budget', record.id)) continue;
        const evaluation = evaluateBudget(record, ctx.now, {
          watchPct: ctx.settings?.budgetWatchPct ?? 80,
        });
        if (!evaluation.hasLimit) continue;
        let direction = null;
        if (evaluation.breach || evaluation.pipelineBreach) direction = 'against';
        else if (!evaluation.watch && !evaluation.forecastUnderstated) direction = 'for';
        if (!direction) continue;
        out.push({
          keySuffix: `fac-${evaluation.forecastAtCompletion}-${evaluation.limit}-${evaluation.breach ? 'breach' : 'inside'}`,
          sourceType: 'budget',
          sourceId: record.id,
          sourceRoute: `#/finance/${record.id}`,
          title: clean(record.name, 160) || 'Budget envelope',
          summary: `FAC ${evaluation.forecastAtCompletion} ${evaluation.currency} vs ceiling ${evaluation.limit}; ${evaluation.hasLimit ? 'priced' : 'unpriced'}`,
          direction,
          likelihoodRatio: direction === 'against' ? 4 : 1.5,
          observedOn: dateOf(record, ctx.today),
        });
      }
      return out;
    },
  },
  {
    id: 'portfolio-actuals',
    label: 'Settled estimate vs recorded actuals',
    framework: 'PERT Beta (Malcolm et al. 1959); Flyvbjerg reference-class realism',
    sourceType: 'portfolio',
    eventPrefixes: ['portfolio.'],
    collect(ctx) {
      const out = [];
      for (const record of ctx.state.portfolio || []) {
        if (!record || !ctx.has('portfolio', record.id)) continue;
        if (!['done', 'released'].includes(record.status)) continue;
        const actual = positive(record.actualEffortDays);
        const expected = positive(pertTriple(record.effortDays || {}).expected);
        if (actual === null || expected === null) continue;
        const ratio = round2(actual / expected);
        let direction = null;
        if (ratio >= 1.25) direction = 'against';
        else if (ratio <= 1.05) direction = 'for';
        if (!direction) continue;
        out.push({
          keySuffix: `actual-${actual}-expected-${expected}`,
          sourceType: 'portfolio',
          sourceId: record.id,
          sourceRoute: '#/capacity',
          title: clean(record.title, 160) || 'Portfolio item',
          summary: `Actual ${actual} person-days vs PERT expected ${expected} (${ratio}×)`,
          direction,
          likelihoodRatio: direction === 'against' ? 3 : 2,
          observedOn: dateOf(record, ctx.today),
        });
      }
      return out;
    },
  },
  {
    id: 'forecast-optimism',
    label: 'Outside-view optimism challenge',
    framework: 'Brier/Murphy decomposition; conformal reference classes; RULE-FCI-01..04',
    sourceType: 'forecast',
    eventPrefixes: ['forecast.', 'decision.', 'budget.', 'case.'],
    collect(ctx) {
      const out = [];
      for (const record of ctx.state.forecastChallenges || []) {
        if (!record || !ctx.has('forecast', record.id)) continue;
        const ratio = positive(record.medianRatio);
        let direction = null;
        if (record.biasDirection === 'optimistic' && ratio !== null && ratio >= 1.25) direction = 'against';
        else if (record.biasDirection === 'balanced' && record.status !== 'open') direction = 'for';
        if (!direction) continue;
        out.push({
          keySuffix: `${record.biasDirection}-${ratio ?? 'none'}-${record.status}`,
          sourceType: 'forecast',
          sourceId: record.id,
          sourceRoute: '#/forecasts?tab=challenges',
          title: clean(record.title, 160) || 'Forecast challenge',
          summary: `Bias ${record.biasDirection}; median ratio ${ratio ?? 'unmeasured'}; status ${record.status}`,
          direction,
          likelihoodRatio: direction === 'against' ? 3 : 1.5,
          observedOn: record.respondedOn || dateOf(record, ctx.today),
        });
      }
      return out;
    },
  },
  {
    id: 'decision-outcome',
    label: 'Reviewed decision outcome',
    framework: 'DACI outcome review; Brier-scored decision forecast',
    sourceType: 'decision',
    eventPrefixes: ['decision.'],
    collect(ctx) {
      const out = [];
      for (const record of ctx.state.decisions || []) {
        if (!record || !ctx.has('decision', record.id)) continue;
        if (!record.reviewedOn) continue;
        let direction = null;
        if (record.outcome === 'bad') direction = 'against';
        else if (record.outcome === 'good') direction = 'for';
        if (!direction) continue;
        out.push({
          keySuffix: `outcome-${record.outcome}-${record.reviewedOn}`,
          sourceType: 'decision',
          sourceId: record.id,
          sourceRoute: '#/decisions',
          title: clean(record.title, 160) || 'Decision',
          summary: `Reviewed decision outcome: ${record.outcome}`,
          direction,
          likelihoodRatio: direction === 'against' ? 4 : 2,
          observedOn: record.reviewedOn,
        });
      }
      return out;
    },
  },
  {
    id: 'load-saturation',
    label: 'Per-role cognitive saturation',
    framework: 'Sweller cognitive load; Little/Kingman queueing; RULE-LOAD-01..04',
    sourceType: 'person',
    eventPrefixes: ['portfolio.', 'delegation.', 'person.', 'load.'],
    collect(ctx) {
      const active = (ctx.state.people || []).filter((p) => p && p.status !== 'archived');
      if (!active.length) return [];
      const report = ctx.getLoadReport();
      if (!report || report.empty) return [];
      const out = [];
      for (const row of report.people) {
        if (!ctx.has('person', row.personId)) continue;
        let direction = null;
        if (['saturated', 'overloaded'].includes(row.band)) direction = 'against';
        else if (['headroom', 'managed'].includes(row.band)) direction = 'for';
        if (!direction) continue;
        out.push({
          keySuffix: `band-${row.band}-index-${row.index}`,
          sourceType: 'person',
          sourceId: row.personId,
          sourceRoute: `#/people/${row.personId}`,
          title: clean(row.name, 160) || 'Team member',
          summary: `Cognitive saturation index ${row.index} (${row.band})`,
          direction,
          likelihoodRatio: direction === 'against' ? 3 : 1.5,
          observedOn: ctx.today,
        });
      }
      return out;
    },
  },
]);

/** Event prefixes that wake the post-commit rule; derived from the registry. */
export const PREMISE_TRIGGER_PREFIXES = Object.freeze([
  'premise.',
  // A policy change can move a premise across the watch/breach line, so the
  // same rule re-evaluates on settings writes (RULE-PREM-04's documented
  // `settings.updated` trigger).
  'settings.',
  ...new Set(PREMISE_SENSORS.flatMap((s) => s.eventPrefixes)),
]);

/* --------------------------------------------------------------- pure scope */

/** Build the typed, two-hop evidence scope for one premise. Pure and bounded. */
export function buildPremiseScope(state = {}, premise = {}) {
  const links = Array.isArray(state.links) ? state.links : [];
  const refs = [];
  const push = (type, id) => {
    if (!type || !id || !PREMISE_SOURCE_TYPES.includes(type)) return;
    if (type === 'conflict' || type === 'pulse') return;
    const key = scopeKey(type, id);
    if (!refs.some((r) => r.key === key)) refs.push({ type, id, key });
  };
  if (premise.decisionId) push('decision', premise.decisionId);
  for (const ref of Array.isArray(premise.sourceRefs) ? premise.sourceRefs : []) {
    if (ref && allowedScopeType(ref.sourceType)) push(ref.sourceType, ref.sourceId);
  }
  const visited = new Set(refs.map((r) => r.key));
  let frontier = refs.map((r) => ({ type: r.type, id: r.id }));
  for (let depth = 0; depth < 2 && frontier.length; depth += 1) {
    const next = [];
    for (const node of frontier) {
      for (const link of links) {
        if (!link) continue;
        const neighbours = [];
        if (link.sourceType === node.type && link.sourceId === node.id) {
          neighbours.push({ type: link.targetType, id: link.targetId });
        }
        if (link.targetType === node.type && link.targetId === node.id) {
          neighbours.push({ type: link.sourceType, id: link.sourceId });
        }
        for (const neighbour of neighbours) {
          if (!PREMISE_SOURCE_TYPES.includes(neighbour.type) || !neighbour.id) continue;
          const key = scopeKey(neighbour.type, neighbour.id);
          if (visited.has(key)) continue;
          visited.add(key);
          push(neighbour.type, neighbour.id);
          if (refs.length >= 120) break;
          next.push(neighbour);
        }
        if (refs.length >= 120) break;
      }
      if (refs.length >= 120) break;
    }
    frontier = next;
  }
  return refs;
}

function buildSensorContext(state, premise, scope, now, settings) {
  const keys = new Set(scope.map((ref) => ref.key));
  const today = dayKey(now) || new Date().toISOString().slice(0, 10);
  let loadReport = null;
  return {
    state,
    premise,
    scope,
    now,
    settings: settings || {},
    today,
    has: (type, id) => keys.has(scopeKey(type, id)),
    getLoadReport: () => {
      if (!loadReport) loadReport = buildLoadReport(state, now);
      return loadReport;
    },
  };
}

/**
 * Collect all currently-observable evidence for a premise. Pure: this does NOT
 * mutate state and does NOT decide whether evidence is new; the rule compares
 * keys against the append-only ledger.
 */
export function collectPremiseObservations(state = {}, premise = {}, now = new Date(), settings = {}) {
  const scope = buildPremiseScope(state, premise);
  const sensorCtx = buildSensorContext(state, premise, scope, now, settings);
  const rows = [];
  for (const sensor of PREMISE_SENSORS) {
    let produced = [];
    try {
      produced = sensor.collect(sensorCtx) || [];
    } catch {
      // A malformed legacy record must not break the whole workspace write.
      produced = [];
    }
    for (const raw of produced) {
      if (!raw || !PREMISE_DIRECTIONS.includes(raw.direction)) continue;
      const key = `${sensor.id}:${raw.sourceType}:${raw.sourceId}:${raw.keySuffix || 'state'}`;
      const observedOn = isDay(raw.observedOn) ? raw.observedOn : sensorCtx.today;
      rows.push({
        id: key,
        key,
        sensorId: sensor.id,
        sensorLabel: sensor.label,
        sourceType: raw.sourceType,
        sourceId: String(raw.sourceId || ''),
        sourceRoute: clean(raw.sourceRoute || '', 240),
        title: clean(raw.title || sensor.label, 160),
        summary: clean(raw.summary || sensor.label, 300),
        direction: raw.direction,
        likelihoodRatio: clamp(finite(raw.likelihoodRatio, 1), 1.01, 20),
        observedOn: observedOn > sensorCtx.today ? sensorCtx.today : observedOn,
        createdAt: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
      });
    }
  }
  return rows.sort((a, b) => a.observedOn.localeCompare(b.observedOn) || a.key.localeCompare(b.key));
}

/* ------------------------------------------------------------- belief engine */

/**
 * Derive status/posterior/evidence math from one premise. No state access.
 * `now` may be a Date or an ISO day (used by point-in-time rewind).
 */
export function evaluatePremiseCore(premise = {}, { now = new Date(), settings = {} } = {}) {
  const today = dayKey(now) || new Date().toISOString().slice(0, 10);
  const priorPct = clampInt(premise.priorPct, 5, 95, PREMISE_DEFAULT_PRIOR_PCT);
  const watchPct = clampInt(premise.watchPct, 5, 95,
    clampInt(settings?.premiseWatchPct, 5, 95, PREMISE_DEFAULT_WATCH_PCT));
  const breachPct = clampInt(premise.breachPct, 5, Math.min(94, watchPct - 5),
    clampInt(settings?.premiseBreachPct, 5, 95, PREMISE_DEFAULT_BREACH_PCT));
  const halfLifeDays = clampInt(premise.halfLifeDays, 7, 365,
    clampInt(settings?.premiseHalfLifeDays, 7, 365, PREMISE_DEFAULT_HALF_LIFE_DAYS));
  const prior = priorPct / 100;
  const logPriorOdds = Math.log(prior / (1 - prior));
  const observations = (Array.isArray(premise.observations) ? premise.observations : [])
    .filter((o) => o && PREMISE_DIRECTIONS.includes(o.direction) && isDay(o.observedOn))
    .slice(-120)
    .sort((a, b) => a.observedOn.localeCompare(b.observedOn) || String(a.key).localeCompare(String(b.key)));

  let logBayesFactor = 0;
  let supportBits = 0;
  let againstBits = 0;
  let discountedWeight = 0;
  const evidenceRows = observations.map((o) => {
    const ageDays = Math.max(0, daysBetween(o.observedOn, today) ?? 0);
    const discount = Math.max(PREMISE_DISCOUNT_FLOOR, Math.min(1, 2 ** (-ageDays / halfLifeDays)));
    const lr = clamp(finite(o.likelihoodRatio, 1), 1.01, 20);
    const signedBits = (o.direction === 'for' ? 1 : -1) * (Math.log(lr) / Math.LN2) * discount;
    logBayesFactor += signedBits * Math.LN2;
    discountedWeight += Math.abs(signedBits);
    if (signedBits >= 0) supportBits += signedBits;
    else againstBits += -signedBits;
    return {
      ...o,
      ageDays,
      discount: round4(discount),
      bits: round4(signedBits),
      likelihoodRatio: round2(lr),
    };
  });
  const posterior = sigmoid(logPriorOdds + logBayesFactor);
  const posteriorPct = round2(clamp(posterior * 100, 0.1, 99.9));
  const bayesFactor = round4(Math.exp(clamp(logBayesFactor, -30, 30)));
  const informationGainBits = round4(klBernoulliBits(posterior, prior));
  const entropyPriorBits = round4(binaryEntropy(prior) / Math.LN2);
  const entropyPosteriorBits = round4(binaryEntropy(posterior) / Math.LN2);

  let confidence = 'counts-only';
  if (observations.length >= PREMISE_MIN_EVIDENCE_FOR_LEARNED) confidence = 'learned';
  else if (observations.length >= PREMISE_MIN_EVIDENCE_FOR_PROVISIONAL) confidence = 'provisional';
  if (supportBits >= 1 && againstBits >= 1) confidence = 'contested';

  let sprtVerdict = 'continue-sensing';
  if (logBayesFactor >= PREMISE_SPRT_SUPPORT) sprtVerdict = 'support-boundary';
  else if (logBayesFactor <= PREMISE_SPRT_CHALLENGE) sprtVerdict = 'challenge-boundary';

  const acknowledgedAt = typeof premise.acknowledgedAt === 'string' ? premise.acknowledgedAt : '';
  const freshEvidence = observations.filter((o) => !acknowledgedAt
    || (typeof o.createdAt === 'string' && o.createdAt > acknowledgedAt));

  let status = 'unobserved';
  if (premise.humanDisposition === 'retired') status = 'retired';
  else if (premise.humanDisposition === 'reaffirmed' && freshEvidence.length === 0) status = 'reaffirmed';
  else if (posteriorPct <= breachPct) status = 'breached';
  else if (posteriorPct <= watchPct) status = 'watch';
  else if (observations.length) status = 'supported';

  return {
    priorPct,
    posteriorPct,
    watchPct,
    breachPct,
    halfLifeDays,
    logPriorOdds: round4(logPriorOdds),
    logBayesFactor: round4(logBayesFactor),
    bayesFactor,
    informationGainBits,
    entropyPriorBits,
    entropyPosteriorBits,
    supportBits: round4(supportBits),
    againstBits: round4(againstBits),
    discountedWeightBits: round4(discountedWeight),
    evidenceCount: observations.length,
    supportCount: observations.filter((o) => o.direction === 'for').length,
    againstCount: observations.filter((o) => o.direction === 'against').length,
    confidence,
    sprtVerdict,
    status,
    freshEvidenceCount: freshEvidence.length,
    evidenceRows,
  };
}

/** Live what-if used by the evidence dialog: no write, no mutation. */
export function previewPremiseEvidence(premise = {}, raw = {}, { now = new Date(), settings = {} } = {}) {
  const strength = PREMISE_EVIDENCE_STRENGTHS[raw.strength] || PREMISE_EVIDENCE_STRENGTHS.moderate;
  const observedOn = isDay(raw.observedOn) ? raw.observedOn : dayKey(now);
  const candidate = {
    ...premise,
    humanDisposition: premise.humanDisposition === 'retired' ? 'retired' : null,
    observations: [
      ...(Array.isArray(premise.observations) ? premise.observations : []),
      {
        id: 'preview', key: 'preview', direction: raw.direction === 'for' ? 'for' : 'against',
        likelihoodRatio: strength, observedOn, createdAt: now.toISOString(),
      },
    ],
  };
  return evaluatePremiseCore(candidate, { now, settings });
}

/** Construct one human-authored observation. Deterministic given idFactory. */
export function makeManualPremiseObservation(raw = {}, { now = new Date(), idFactory }) {
  const factory = idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`);
  const id = factory('pobs');
  const direction = raw.direction === 'for' ? 'for' : 'against';
  const strength = PREMISE_EVIDENCE_STRENGTHS[raw.strength] || PREMISE_EVIDENCE_STRENGTHS.moderate;
  const today = dayKey(now);
  const observedOn = isDay(raw.observedOn) && raw.observedOn <= today ? raw.observedOn : today;
  return {
    id,
    key: `manual:${id}`,
    sensorId: 'manual',
    sensorLabel: 'Leader-recorded observation',
    sourceType: 'manual',
    sourceId: id,
    sourceRoute: '',
    title: clean(raw.title || 'Leader-recorded observation', 160),
    summary: clean(raw.note || '', 300),
    direction,
    likelihoodRatio: strength,
    observedOn,
    createdAt: now.toISOString(),
  };
}

/* ------------------------------------------------------------ input contract */

/** Validate + normalize the form payload used by addPremise/updatePremise. */
export function normalizePremisePayload(raw = {}, { state = {}, now = new Date(), settings = {}, existing = null } = {}) {
  const base = existing || {};
  const value = {};
  const fail = (error, field) => ({ ok: false, error, field });

  value.title = raw.title !== undefined ? clean(raw.title, 160) : clean(base.title, 160);
  if (value.title.length < 3) return fail('Name the assumption in at least 3 characters.', 'title');
  value.statement = raw.statement !== undefined ? clean(raw.statement, 1200) : clean(base.statement, 1200);
  if (value.statement.length < 10) return fail('State the premise as a falsifiable sentence (at least 10 characters).', 'statement');
  value.signpost = raw.signpost !== undefined ? clean(raw.signpost, 600) : clean(base.signpost, 600);
  if (value.signpost.length < 10) return fail('Write the signpost: assume this premise already failed — what dated record would have warned you first?', 'signpost');

  value.decisionId = raw.decisionId !== undefined ? clean(raw.decisionId, 120) || null : base.decisionId || null;
  if (value.decisionId && !(state.decisions || []).some((d) => d && d.id === value.decisionId)) {
    return fail('Choose a decision that still exists.', 'decisionId');
  }
  value.ownerId = raw.ownerId !== undefined ? clean(raw.ownerId, 120) || null : base.ownerId || null;
  if (value.ownerId && !(state.people || []).some((p) => p && p.id === value.ownerId && p.status !== 'archived')) {
    return fail('Choose an active person as the signpost owner.', 'ownerId');
  }
  value.criticality = raw.criticality !== undefined ? clean(raw.criticality, 40) : (base.criticality || 'load-bearing');
  if (!PREMISE_CRITICALITIES.includes(value.criticality)) return fail('Choose a valid criticality.', 'criticality');

  const prior = raw.priorPct !== undefined ? Number(raw.priorPct) : Number(base.priorPct ?? PREMISE_DEFAULT_PRIOR_PCT);
  if (!Number.isFinite(prior) || prior < 5 || prior > 95) return fail('Prior belief must be 5–95% (Cromwell’s rule: never 0 or 100).', 'priorPct');
  value.priorPct = Math.round(prior);
  const watch = raw.watchPct !== undefined ? Number(raw.watchPct)
    : Number(base.watchPct ?? settings?.premiseWatchPct ?? PREMISE_DEFAULT_WATCH_PCT);
  const breach = raw.breachPct !== undefined ? Number(raw.breachPct)
    : Number(base.breachPct ?? settings?.premiseBreachPct ?? PREMISE_DEFAULT_BREACH_PCT);
  if (!Number.isFinite(watch) || watch < 10 || watch > 90) return fail('Watch threshold must be 10–90%.', 'watchPct');
  if (!Number.isFinite(breach) || breach < 5 || breach > 85) return fail('Breach threshold must be 5–85%.', 'breachPct');
  if (breach >= watch) return fail('The breach threshold must be below the watch threshold.', 'breachPct');
  value.watchPct = Math.round(watch);
  value.breachPct = Math.round(breach);
  const halfLife = raw.halfLifeDays !== undefined ? Number(raw.halfLifeDays)
    : Number(base.halfLifeDays ?? settings?.premiseHalfLifeDays ?? PREMISE_DEFAULT_HALF_LIFE_DAYS);
  if (!Number.isFinite(halfLife) || halfLife < 7 || halfLife > 365) return fail('Evidence half-life must be 7–365 days.', 'halfLifeDays');
  value.halfLifeDays = Math.round(halfLife);

  const today = dayKey(now) || new Date().toISOString().slice(0, 10);
  const defaultReviewBy = addDays(today, clampInt(settings?.premiseReviewDays, 7, 180, PREMISE_DEFAULT_REVIEW_DAYS));
  value.reviewBy = raw.reviewBy !== undefined ? clean(raw.reviewBy, 10) || defaultReviewBy : (base.reviewBy || defaultReviewBy);
  if (!isDay(value.reviewBy)) return fail('Choose a valid signpost review date.', 'reviewBy');

  const refsRaw = raw.sourceRefs !== undefined ? raw.sourceRefs : base.sourceRefs;
  const refs = [];
  for (const ref of Array.isArray(refsRaw) ? refsRaw : []) {
    if (!ref || !ref.sourceType || !ref.sourceId) continue;
    const sourceType = clean(ref.sourceType, 40);
    const sourceId = clean(ref.sourceId, 120);
    if (!PREMISE_SOURCE_TYPES.includes(sourceType) || sourceType === 'decision') continue;
    const collection = PREMISE_SOURCE_COLLECTIONS[sourceType];
    if (!collection || !(state[collection] || []).some((r) => r && r.id === sourceId)) {
      return fail('One selected evidence source no longer exists; refresh and choose it again.', 'sourceRefs');
    }
    const key = `${sourceType}:${sourceId}`;
    if (!refs.some((r) => `${r.sourceType}:${r.sourceId}` === key)) {
      refs.push({ sourceType, sourceId });
    }
    if (refs.length >= 12) break;
  }
  value.sourceRefs = refs;
  if (!value.decisionId && !refs.length) return fail('Anchor the premise to a decision, or attach at least one existing record as its evidence source.', 'decisionId');
  return { ok: true, value };
}

/* --------------------------------------------------------------- report/UI */

function exposureFor(state, premise, evaluation, decision) {
  if (!decision?.id) return { priced: false, byCurrency: [], capacityDays: null, terms: [] };
  const terms = decisionValueTerms(state, decision);
  const drop = Math.max(0, evaluation.priorPct - evaluation.posteriorPct) / 100;
  return {
    priced: Boolean(terms.priced),
    byCurrency: (terms.byCurrency || []).map((entry) => ({
      currency: entry.currency,
      amount: round2(entry.amount),
      indicativeExposure: round2(entry.amount * drop),
    })),
    capacityDays: terms.capacityDays ? round2(terms.capacityDays * drop) : null,
    terms: (terms.terms || []).map((t) => ({
      label: t.label,
      amount: t.amount ?? null,
      currency: t.currency || null,
      days: t.days ?? null,
      basis: t.basis,
    })),
  };
}

/** Full derived report. Pure; every number traces to a record or exported policy. */
export function buildPremiseReport(state = {}, now = new Date()) {
  const settings = state.settings || {};
  const today = dayKey(now) || new Date().toISOString().slice(0, 10);
  const premises = (Array.isArray(state.premises) ? state.premises : [])
    .filter((p) => p && p.id)
    .map((premise) => {
      const evaluation = evaluatePremiseCore(premise, { now, settings });
      const decision = (state.decisions || []).find((d) => d && d.id === premise.decisionId) || null;
      const owner = (state.people || []).find((p) => p && p.id === premise.ownerId) || null;
      const scope = buildPremiseScope(state, premise);
      const pending = collectPremiseObservations(state, premise, now, settings)
        .filter((o) => !(premise.observations || []).some((existing) => existing && existing.key === o.key));
      const reviewOverdue = Boolean(premise.reviewBy && (daysBetween(premise.reviewBy, today) ?? 0) > 0);
      return {
        ...premise,
        evaluation,
        observations: evaluation.evidenceRows,
        pendingObservations: pending,
        pendingCount: pending.length,
        scopeCount: scope.length,
        scope,
        decision,
        decisionTitle: decision?.title || '',
        decisionReversibility: decision?.reversibility || null,
        owner,
        ownerName: owner?.name || '',
        reviewOverdue,
        reviewDaysOverdue: reviewOverdue ? (daysBetween(premise.reviewBy, today) ?? 0) : 0,
        exposure: exposureFor(state, premise, evaluation, decision),
      };
    })
    .sort((a, b) => {
      const rank = { breached: 0, watch: 1, reaffirmed: 2, unobserved: 3, supported: 4, retired: 5 };
      return (rank[a.evaluation.status] ?? 9) - (rank[b.evaluation.status] ?? 9)
        || a.evaluation.posteriorPct - b.evaluation.posteriorPct
        || String(a.id).localeCompare(String(b.id));
    });

  const counts = PREMISE_STATUSES.reduce((acc, status) => {
    acc[status] = premises.filter((p) => p.evaluation.status === status).length;
    return acc;
  }, {});
  const stale = premises.filter((p) => p.reviewOverdue && p.evaluation.status !== 'retired').length;
  const pending = premises.reduce((sum, p) => sum + p.pendingCount, 0);
  return {
    engineVersion: PREMISE_ENGINE_VERSION,
    today,
    policy: {
      watchPct: clampInt(settings.premiseWatchPct, 10, 90, PREMISE_DEFAULT_WATCH_PCT),
      breachPct: clampInt(settings.premiseBreachPct, 5, 85, PREMISE_DEFAULT_BREACH_PCT),
      halfLifeDays: clampInt(settings.premiseHalfLifeDays, 7, 365, PREMISE_DEFAULT_HALF_LIFE_DAYS),
      reviewDays: clampInt(settings.premiseReviewDays, 7, 180, PREMISE_DEFAULT_REVIEW_DAYS),
      autoPropagate: settings.premiseAutoPropagate !== false,
      evidenceStrengths: { ...PREMISE_EVIDENCE_STRENGTHS },
      sprtAlpha: PREMISE_SPRT_ALPHA,
      sprtBeta: PREMISE_SPRT_BETA,
      sprtSupport: round4(PREMISE_SPRT_SUPPORT),
      sprtChallenge: round4(PREMISE_SPRT_CHALLENGE),
      discountFloor: PREMISE_DISCOUNT_FLOOR,
    },
    premises,
    sensors: PREMISE_SENSORS.map((s) => ({
      id: s.id,
      label: s.label,
      framework: s.framework,
      sourceType: s.sourceType,
      eventPrefixes: [...s.eventPrefixes],
    })),
    totals: {
      count: premises.length,
      counts,
      breached: counts.breached,
      watch: counts.watch,
      stale,
      pending,
      contested: premises.filter((p) => p.evaluation.confidence === 'contested').length,
      attention: counts.breached + counts.watch + stale,
    },
    empty: premises.length === 0,
  };
}

export function premiseAttentionCount(state = {}, now = new Date()) {
  return buildPremiseReport(state, now).totals.attention;
}

/** Deterministic board-ready text. No free-text source notes are exported. */
export function premiseBrief(state = {}, now = new Date()) {
  const r = buildPremiseReport(state, now);
  const lines = [];
  lines.push(`# Assumption Ledger / Premise Sentinel brief — ${r.today}`);
  lines.push('');
  lines.push(`Policy: watch below ${r.policy.watchPct}%, breach at or below ${r.policy.breachPct}%, evidence half-life ${r.policy.halfLifeDays} days, review cadence ${r.policy.reviewDays} days, governance propagation ${r.policy.autoPropagate ? 'on' : 'PAUSED'}. Wald-style log-BF boundaries: support ${r.policy.sprtSupport}, challenge ${r.policy.sprtChallenge} (alpha ${r.policy.sprtAlpha}, beta ${r.policy.sprtBeta}).`);
  lines.push('');
  if (r.empty) {
    lines.push('No assumptions have been pre-registered. A decision with no recorded premise cannot be re-decided on evidence; register the load-bearing assumption before the next irreversible call.');
    return lines.join('\n');
  }
  lines.push('## Portfolio');
  lines.push(`- ${r.totals.count} premise(s): ${r.totals.breached} breached, ${r.totals.watch} on watch, ${r.totals.stale} overdue review(s), ${r.totals.pending} uncollected sensor observation(s), ${r.totals.contested} contested belief(s).`);
  lines.push('');
  for (const p of r.premises) {
    const e = p.evaluation;
    lines.push(`## ${p.title}`);
    lines.push(`- Status: ${PREMISE_STATUS_LABELS[e.status] || e.status}. Belief ${e.priorPct}% → ${e.posteriorPct}% (watch ${e.watchPct}%, breach ${e.breachPct}%); Bayes factor ${e.bayesFactor}, log BF ${e.logBayesFactor}, information gain ${e.informationGainBits} bits.`);
    lines.push(`- Evidence: ${e.evidenceCount} observation(s), ${e.supportCount} for / ${e.againstCount} against, ${e.confidence}, Wald boundary ${e.sprtVerdict}; discounted weight ${e.discountedWeightBits} bits; typed scope ${p.scopeCount} record(s).`);
    if (p.decisionTitle) lines.push(`- Decision: ${p.decisionTitle}${p.decisionReversibility ? ` (${p.decisionReversibility})` : ''}.`);
    if (p.ownerName) lines.push(`- Signpost owner: ${p.ownerName}. Review by ${p.reviewBy || 'not set'}${p.reviewOverdue ? ` — ${p.reviewDaysOverdue} day(s) overdue` : ''}.`);
    if (p.exposure.priced) {
      for (const c of p.exposure.byCurrency) {
        lines.push(`- Indicative exposure in ${c.currency}: ${c.indicativeExposure} of ${c.amount} linked value (proportional to belief loss, NOT a cash forecast); currencies never summed.`);
      }
    } else {
      lines.push('- Exposure: unpriced — no typed link to a recorded money amount.');
    }
    if (p.pendingCount) lines.push(`- ${p.pendingCount} observation(s) are visible in the workspace but not yet committed to this ledger; run an explicit signpost scan.`);
    lines.push('');
  }
  lines.push('Caveats: indicative exposure is NOT a cash forecast; it is a proportional attention signal over typed value links. Likelihood ratios and the half-life are transparent leadership conventions, not calibrated statistical likelihoods. Wald boundaries are displayed as a sequential-evidence discipline, NOT as formal p-values on independent trials. A belief is a confidence-weighted signal, never a verdict; the leader owns every re-decision. Conflicts and anonymous pulses are never read.');
  return lines.join('\n');
}

/* -------------------------------------------------------------------- signals */

export function premiseSignals(state = {}, now = new Date()) {
  const r = buildPremiseReport(state, now);
  if (r.empty) return [];
  const signals = [];
  if (r.totals.breached) {
    signals.push({
      ruleId: 'PREM-01',
      domain: 'Premise sentinel',
      title: `${r.totals.breached} load-bearing premise(s) crossed a pre-declared signpost`,
      detail: 'Dewar’s Assumption-Based Planning: changing a plan because its declared signpost fired is disciplined adaptation, not indecision. Each breach opens one DACI re-decision with hedge, pause, reverse and buy-information options.',
      severity: 4,
      confidence: 'medium',
      evidence: r.premises.filter((p) => p.evaluation.status === 'breached').slice(0, 4)
        .map((p) => `${p.title}: ${p.evaluation.priorPct}% → ${p.evaluation.posteriorPct}%, BF ${p.evaluation.bayesFactor}`),
      action: { label: 'Open the assumption ledger', route: '#/premises' },
    });
  }
  if (r.totals.watch) {
    signals.push({
      ruleId: 'PREM-02',
      domain: 'Premise sentinel',
      title: `${r.totals.watch} premise(s) are inside the watch band`,
      detail: 'Posterior belief has fallen below the leader-owned watch threshold but has not crossed the breach line. Decide what additional evidence would settle the question before it becomes an emergency.',
      severity: 3,
      confidence: 'medium',
      evidence: r.premises.filter((p) => p.evaluation.status === 'watch').slice(0, 4)
        .map((p) => `${p.title}: ${p.evaluation.posteriorPct}% vs watch ${p.evaluation.watchPct}%`),
      action: { label: 'Inspect the evidence lab', route: '#/premises?tab=evidence' },
    });
  }
  if (r.totals.stale) {
    signals.push({
      ruleId: 'PREM-03',
      domain: 'Premise sentinel',
      title: `${r.totals.stale} signpost review(s) are overdue`,
      detail: 'Continuous signpost monitoring fails when the review date becomes decoration. A dated human review either reaffirms, retires or reopens the premise; stale prompts self-clear.',
      severity: 3,
      confidence: 'high',
      evidence: r.premises.filter((p) => p.reviewOverdue && p.evaluation.status !== 'retired').slice(0, 4)
        .map((p) => `${p.title}: due ${p.reviewBy} (${p.reviewDaysOverdue} day(s) overdue)`),
      action: { label: 'Review the ledger', route: '#/premises?tab=ledger' },
    });
  }
  if (r.totals.pending) {
    signals.push({
      ruleId: 'PREM-04',
      domain: 'Premise sentinel',
      title: `${r.totals.pending} dated observation(s) are visible but not yet in a ledger`,
      detail: 'The declarative sensor registry can see evidence in the workspace that this ledger has not committed. Run an explicit signpost scan; evidence is append-only and idempotent.',
      severity: 2,
      confidence: 'high',
      evidence: r.premises.filter((p) => p.pendingCount).slice(0, 4)
        .map((p) => `${p.title}: ${p.pendingCount} pending observation(s)`),
      action: { label: 'Run a signpost scan', route: '#/premises?tab=policy' },
    });
  }
  const unobserved = r.totals.counts.unobserved || 0;
  if (unobserved) {
    signals.push({
      ruleId: 'PREM-05',
      domain: 'Premise sentinel',
      title: `${unobserved} pre-registered premise(s) have no scoped evidence yet`,
      detail: 'A premise with no evidence is not 70% true — it is unmeasured. Attach the records that would prove or disprove it, or record a dated observation explicitly.',
      severity: 2,
      confidence: 'high',
      evidence: r.premises.filter((p) => p.evaluation.status === 'unobserved').slice(0, 4)
        .map((p) => `${p.title}: typed scope ${p.scopeCount} record(s), ${p.evaluation.evidenceCount} observation(s)`),
      action: { label: 'Attach evidence sources', route: '#/premises?tab=ledger' },
    });
  }
  return signals;
}

/* ------------------------------------------------------ post-commit plumbing */

function note(ctx, ruleId, action, targetType, targetId, summary, out) {
  const row = { ruleId, action, targetType, targetId, summary: clean(summary, 300) };
  out.push(row);
  if (ctx.logEvent) {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${ruleId}] ${clean(summary, 280)}`.slice(0, 300),
    });
  }
}

function pushLink(draft, spec, runCtx) {
  const { sourceType, sourceId, targetType, targetId, relation, ruleId, summary } = spec;
  if (!sourceType || !sourceId || !targetType || !targetId) return false;
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  const exists = draft.links.some((l) => l && l.sourceType === sourceType && l.sourceId === sourceId
    && l.targetType === targetType && l.targetId === targetId && l.relation === relation);
  if (exists) return false;
  draft.links.push({
    id: runCtx.idFactory('lnk'),
    sourceType, sourceId, targetType, targetId, relation, ruleId,
    summary: clean(summary, 300),
    createdOn: runCtx.todayStr,
    createdAt: runCtx.nowIso,
  });
  return true;
}

function declareDownstreamRule(event, ruleName) {
  // ADR-0008's generalized event declaration: a rule that creates a decision
  // tells later rules on the SAME event spine to price it. This is not a call
  // into Decision Tempo and not per-module glue; it uses the same `event.rules`
  // contract that actions use. Tempo's own pause switch is respected here.
  if (!event || typeof event !== 'object') return;
  const declared = Array.isArray(event.rules) ? [...event.rules] : [];
  if (!declared.includes(ruleName)) declared.push(ruleName);
  event.rules = declared;
}

function decisionExists(draft, marker) {
  return (draft.decisions || []).some((d) => d && String(d.question || '').includes(marker));
}

function delegationExists(draft, marker) {
  return (draft.delegations || []).some((d) => d && String(d.support || '').includes(marker));
}

function talkingPointExists(draft, personId, marker) {
  const person = (draft.people || []).find((p) => p && p.id === personId);
  return Boolean(person && (person.talkingPoints || []).some((t) => String(t).includes(marker)));
}

function addTalkingPoint(draft, personId, text, marker) {
  const person = (draft.people || []).find((p) => p && p.id === personId && p.status !== 'archived');
  if (!person) return false;
  const maxText = 200 - marker.length - 1;
  person.talkingPoints = [
    ...(Array.isArray(person.talkingPoints) ? person.talkingPoints : []),
    `${clean(text, Math.max(40, maxText))} ${marker}`,
  ].slice(-30);
  return true;
}

function removeTalkingPoint(draft, personId, marker) {
  const person = (draft.people || []).find((p) => p && p.id === personId);
  if (!person || !Array.isArray(person.talkingPoints)) return false;
  const next = person.talkingPoints.filter((t) => !String(t).includes(marker));
  if (next.length === person.talkingPoints.length) return false;
  person.talkingPoints = next;
  return true;
}

function openBreachDecision(draft, premise, evaluation, runCtx, out, ctx) {
  const cycle = Math.max(0, Math.round(Number(premise.reviewCycle) || 0));
  const marker = `[${PREMISE_RULE_IDS.BREACH}:${premise.id}:c${cycle}]`;
  if (decisionExists(draft, marker)) return false;
  const original = (draft.decisions || []).find((d) => d && d.id === premise.decisionId) || null;
  const owner = (draft.people || []).find((p) => p && p.id === premise.ownerId && p.status !== 'archived') || null;
  const question = [
    `The pre-registered signpost for “${clean(premise.title, 90)}” has fired: belief moved from ${evaluation.priorPct}% to ${evaluation.posteriorPct}% (breach threshold ${evaluation.breachPct}%) across ${evaluation.evidenceCount} dated observation(s), Bayes factor ${evaluation.bayesFactor}.`,
    `Premise: ${clean(premise.statement, 260)}. Signpost: ${clean(premise.signpost, 260)}.`,
    'A pre-declared assumption breaking is a reason to re-decide, not a failure of the original team. Choose the response',
    marker,
  ].join(' ');
  const options = [
    {
      id: runCtx.idFactory('dopt'),
      label: 'Reaffirm the decision and fund a shaping action',
      pros: 'Keeps the direction while reducing the vulnerability that the signpost exposed',
      cons: 'Requires new capacity or scope; reaffirmation without a hedge is just hope',
    },
    {
      id: runCtx.idFactory('dopt'),
      label: 'Pause or renegotiate scope/dates while the premise is repaired',
      pros: 'RAND hedging action: limits exposure without throwing away the whole plan',
      cons: 'Delays value and must be communicated to every affected stakeholder',
    },
    {
      id: runCtx.idFactory('dopt'),
      label: 'Reverse the decision and record the exit path',
      pros: 'Best response when the broken premise was truly load-bearing',
      cons: 'Highest switching cost; needs an explicit owned transition, not an apology',
    },
    {
      id: runCtx.idFactory('dopt'),
      label: 'Buy information: timebox a probe before the next commitment',
      pros: 'Wald-style sequential option: resolves contested evidence before more capital is committed',
      cons: 'Waiting has its own cost of delay; Decision Tempo prices that cost in this transaction',
    },
  ];
  const decision = {
    id: runCtx.idFactory('dec'),
    title: `Re-decide: ${clean(premise.title, 90)} signpost breached`.slice(0, 180),
    question: question.slice(0, 2000),
    date: runCtx.todayStr,
    reversibility: original?.reversibility === 'irreversible' ? 'irreversible' : 'reversible',
    driver: clean(owner?.name || draft.settings?.leaderName || '', 120),
    approver: clean(original?.approver || '', 120),
    contributors: clean(original?.contributors || '', 200),
    informed: clean(original?.informed || '', 200),
    options,
    chosen: '', rationale: '', reviewOn: null, reviewedOn: null,
    outcome: 'pending', outcomeNotes: '', createdAt: runCtx.nowIso,
    forecastProbability: null,
    decidedOn: null,
  };
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.push(decision);
  pushLink(draft, {
    sourceType: 'premise', sourceId: premise.id, targetType: 'decision', targetId: decision.id,
    relation: 'tests', ruleId: PREMISE_RULE_IDS.BREACH,
    summary: `Breached premise drives a four-option re-decision ${marker}`,
  }, runCtx);
  if (original) {
    pushLink(draft, {
      sourceType: 'decision', sourceId: original.id, targetType: 'decision', targetId: decision.id,
      relation: 'revisits', ruleId: PREMISE_RULE_IDS.BREACH,
      summary: `Original decision revisited after its declared premise broke ${marker}`,
    }, runCtx);
    // Copy the original decision's value-bearing typed edges onto the
    // re-decision: Decision Tempo prices from the graph, so a breach must not
    // create an economically blank decision. This is generic graph traversal,
    // not a hardcoded link to one module.
    const valueTypes = new Set(['case', 'budget', 'portfolio']);
    let copied = 0;
    for (const link of draft.links || []) {
      if (!link) continue;
      let peer = null;
      if (link.sourceType === 'decision' && link.sourceId === original.id) {
        peer = { type: link.targetType, id: link.targetId };
      } else if (link.targetType === 'decision' && link.targetId === original.id) {
        peer = { type: link.sourceType, id: link.sourceId };
      }
      if (!peer || !valueTypes.has(peer.type) || !peer.id) continue;
      if (pushLink(draft, {
        sourceType: peer.type, sourceId: peer.id, targetType: 'decision', targetId: decision.id,
        relation: link.relation || 'depends-on', ruleId: PREMISE_RULE_IDS.BREACH,
        summary: `Value context inherited from the original decision ${marker}`,
      }, runCtx)) copied += 1;
    }
    if (copied) {
      note(ctx, PREMISE_RULE_IDS.BREACH, 'updated', 'links', decision.id,
        `Copied ${copied} typed value edge(s) from the original decision so Decision Tempo can price the re-decision`, out);
    }
  }
  if (owner) {
    pushLink(draft, {
      sourceType: 'person', sourceId: owner.id, targetType: 'decision', targetId: decision.id,
      relation: 'involves', ruleId: PREMISE_RULE_IDS.BREACH,
      summary: `Signpost owner involved in the re-decision ${marker}`,
    }, runCtx);
  }
  note(ctx, PREMISE_RULE_IDS.BREACH, 'created', 'decision', decision.id,
    `Opened one DACI re-decision for breached premise “${clean(premise.title, 70)}”; Decision Tempo prices it in this transaction`, out);

  if (owner) {
    const due = addDays(runCtx.todayStr, 7);
    const delegation = {
      id: runCtx.idFactory('delegation'),
      personId: owner.id,
      title: `Verify the signpost for “${clean(premise.title, 90)}”`.slice(0, 160),
      expectedOutcome: 'Confirm or correct the dated evidence that broke this premise, and name the next signpost review.',
      authority: 'own',
      support: `This is evidence verification, not a delivery judgement. Bayes factor ${evaluation.bayesFactor} across ${evaluation.evidenceCount} observation(s); do not reverse the original call from the Premise Sentinel alone. ${marker}`,
      delegatedOn: runCtx.todayStr,
      dueOn: due,
      status: 'active',
      checkins: [], completedOn: null, completionNote: '', returnedOn: null, returnReason: '',
      createdAt: runCtx.nowIso, updatedAt: runCtx.nowIso,
    };
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.push(delegation);
    pushLink(draft, {
      sourceType: 'premise', sourceId: premise.id, targetType: 'delegation', targetId: delegation.id,
      relation: 'tracks-followup', ruleId: PREMISE_RULE_IDS.BREACH,
      summary: `Signpost verification follow-up ${marker}`,
    }, runCtx);
    note(ctx, PREMISE_RULE_IDS.BREACH, 'created', 'delegation', delegation.id,
      `Queued one owner-routed signpost verification for “${clean(premise.title, 70)}”`, out);
    if (!talkingPointExists(draft, owner.id, marker)) {
      const text = `Premise check: “${clean(premise.title, 55)}” moved to ${evaluation.posteriorPct}% belief. What did we learn, and which hedge would let the decision survive if the premise stays broken?`;
      if (addTalkingPoint(draft, owner.id, text, marker)) {
        note(ctx, PREMISE_RULE_IDS.BREACH, 'updated', 'person', owner.id,
          `Queued a blameless signpost-breach talking point for ${clean(owner.name, 60)}`, out);
      }
    }
  }
  return true;
}

/**
 * ADR-0008 post-commit rule. Sensing and belief updates always run on relevant
 * events; `premiseAutoPropagate === false` suppresses governance fan-out unless
 * the human explicitly requested a `premise.scan`.
 */
export function premiseRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const triggered = PREMISE_TRIGGER_PREFIXES.some((prefix) => event.type.startsWith(prefix));
  if (!triggered) return [];
  const explicitScan = event.type === 'premise.scan';
  const governanceAllowed = draft.settings?.premiseAutoPropagate !== false || explicitScan;
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const runCtx = {
    todayStr: dayKey(now) || now.toISOString().slice(0, 10),
    nowIso: now.toISOString(),
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
  };
  const out = [];
  const premises = Array.isArray(draft.premises) ? draft.premises : [];

  // RULE-PREM-05: outcomes are their own append-only graph nodes. The
  // calibration report is a pure read model; the rule only establishes typed
  // lineage and writes auditable propagation notes on the shared event spine.
  for (const outcome of draft.premiseOutcomes || []) {
    if (!outcome) continue;
    const premise = premises.find((row) => row && row.id === outcome.premiseId);
    if (!premise) continue;
    const linkedPremise = pushLink(draft, {
      sourceType: 'premiseOutcome', sourceId: outcome.id,
      targetType: 'premise', targetId: premise.id,
      relation: 'validates', ruleId: PREMISE_RULE_IDS.CALIBRATE,
      summary: `Human ${outcome.verdict} assessment dated ${outcome.settledOn} validates this premise record`,
    }, runCtx);
    if (linkedPremise) note(ctx, PREMISE_RULE_IDS.CALIBRATE, 'created', 'premise', premise.id,
      `Linked a dated ${outcome.verdict} outcome to “${clean(premise.title, 70)}”`, out);
    if (premise.decisionId) {
      const linkedDecision = pushLink(draft, {
        sourceType: 'premiseOutcome', sourceId: outcome.id,
        targetType: 'decision', targetId: premise.decisionId,
        relation: 'revisits', ruleId: PREMISE_RULE_IDS.CALIBRATE,
        summary: `Outcome assessment for the premise underlying this decision`,
      }, runCtx);
      if (linkedDecision) note(ctx, PREMISE_RULE_IDS.CALIBRATE, 'created', 'decision', premise.decisionId,
        `Attached a dated premise outcome to its linked decision`, out);
    }
  }

  for (const premise of premises) {
    if (!premise || premise.status === 'retired' || premise.humanDisposition === 'retired') continue;

    // RULE-PREM-01: typed scope assembly (idempotent).
    if (premise.decisionId) {
      pushLink(draft, {
        sourceType: 'decision', sourceId: premise.decisionId, targetType: 'premise', targetId: premise.id,
        relation: 'depends-on', ruleId: PREMISE_RULE_IDS.SCOPE,
        summary: `Decision depends on pre-registered premise “${clean(premise.title, 80)}”`,
      }, runCtx);
      pushLink(draft, {
        sourceType: 'premise', sourceId: premise.id, targetType: 'decision', targetId: premise.decisionId,
        relation: 'tests', ruleId: PREMISE_RULE_IDS.SCOPE,
        summary: `Premise signpost tests this decision`,
      }, runCtx);
    }
    for (const ref of premise.sourceRefs || []) {
      const resolved = resolveLinkedEntity(draft, ref.sourceType, ref.sourceId);
      if (!resolved) continue;
      pushLink(draft, {
        sourceType: 'premise', sourceId: premise.id, targetType: ref.sourceType, targetId: ref.sourceId,
        relation: 'tests', ruleId: PREMISE_RULE_IDS.SCOPE,
        summary: `Evidence source: ${clean(resolved.title, 80)}`,
      }, runCtx);
    }

    // RULE-PREM-02: append-only evidence sensing.
    const existingKeys = new Set((premise.observations || []).map((o) => o && o.key).filter(Boolean));
    const candidates = collectPremiseObservations(draft, premise, now, draft.settings || {});
    const fresh = candidates.filter((o) => !existingKeys.has(o.key));
    if (fresh.length) {
      premise.observations = [...(premise.observations || []), ...fresh].slice(-120);
      premise.updatedAt = runCtx.nowIso;
      // A dated human reaffirmation is not erased by sensor evidence derived
      // in the same transaction. Only evidence created strictly after the
      // acknowledgement reopens the premise.
      const reopening = fresh.some((o) => !premise.acknowledgedAt || o.createdAt > premise.acknowledgedAt);
      if (premise.humanDisposition === 'reaffirmed' && reopening) premise.humanDisposition = null;
      note(ctx, PREMISE_RULE_IDS.SENSE, 'updated', 'premise', premise.id,
        `Appended ${fresh.length} dated observation(s) from ${new Set(fresh.map((o) => o.sensorId)).size} sensor(s) for “${clean(premise.title, 60)}”`, out);
    }

    const evaluation = evaluatePremiseCore(premise, { now, settings: draft.settings || {} });
    const previousStatus = premise.status;
    premise.posteriorPct = evaluation.posteriorPct;
    premise.logBayesFactor = evaluation.logBayesFactor;
    premise.status = evaluation.status;
    premise.updatedAt = runCtx.nowIso;
    if (previousStatus !== evaluation.status) {
      note(ctx, PREMISE_RULE_IDS.SENSE, 'updated', 'premise', premise.id,
        `Belief status changed ${previousStatus} → ${evaluation.status} (${evaluation.priorPct}% → ${evaluation.posteriorPct}%)`, out);
    }

    // RULE-PREM-03: one re-decision + verification + 1:1 on a fresh breach.
    if (governanceAllowed && evaluation.status === 'breached' && evaluation.freshEvidenceCount > 0) {
      const opened = openBreachDecision(draft, premise, evaluation, runCtx, out, ctx);
      // The generalized event spine — not a direct call — tells the later
      // Decision Tempo rule to price this newly opened re-decision in the same
      // atomic transaction. Tempo's own pause switch is honoured.
      if (opened && draft.settings?.tempoAutoPropagate !== false) {
        declareDownstreamRule(event, 'decisionTempo');
      }
    }

    // RULE-PREM-04: overdue signpost review prompt, self-clearing.
    const reviewMarker = `[${PREMISE_RULE_IDS.REVIEW}:${premise.id}]`;
    const overdue = Boolean(governanceAllowed && premise.reviewBy
      && (daysBetween(premise.reviewBy, runCtx.todayStr) ?? 0) > 0
      && evaluation.status !== 'retired');
    const target = (draft.people || []).find((p) => p && p.id === premise.ownerId && p.status !== 'archived')
      || (draft.people || []).find((p) => p && p.status !== 'archived');
    if (target && overdue && !talkingPointExists(draft, target.id, reviewMarker)) {
      const text = `Signpost review overdue for “${clean(premise.title, 55)}” (due ${premise.reviewBy}). Reaffirm, retire or revise the premise with dated evidence.`;
      if (addTalkingPoint(draft, target.id, text, reviewMarker)) {
        note(ctx, PREMISE_RULE_IDS.REVIEW, 'updated', 'person', target.id,
          `Queued an overdue signpost-review prompt for “${clean(premise.title, 60)}”`, out);
      }
    } else if (target && !overdue && talkingPointExists(draft, target.id, reviewMarker)) {
      if (removeTalkingPoint(draft, target.id, reviewMarker)) {
        note(ctx, PREMISE_RULE_IDS.REVIEW, 'updated', 'person', target.id,
          `Cleared the reviewed signpost prompt for “${clean(premise.title, 60)}”`, out);
      }
    }
  }
  return out;
}

/**
 * Point-in-time rewind for the new collection. Health/trends call this so a
 * historical chart never sees evidence or a human acknowledgement that did not
 * exist on the as-of date. Undated history is explicitly approximate.
 */
export function rewindPremises(state = {}, asOf, { settings = {} } = {}) {
  const asOfDay = dayKey(asOf) || String(asOf || '').slice(0, 10);
  if (!asOfDay) return { premises: [], approximate: false, notes: [] };
  const notes = [];
  const premises = (Array.isArray(state.premises) ? state.premises : [])
    .map((premise) => {
      const createdDay = String(premise.createdAt || '').slice(0, 10);
      if (createdDay && createdDay > asOfDay) return null;
      const observations = (premise.observations || []).filter((o) => o && o.observedOn && o.observedOn <= asOfDay);
      const acknowledgedOn = premise.acknowledgedOn && premise.acknowledgedOn <= asOfDay ? premise.acknowledgedOn : null;
      const acknowledgedAt = acknowledgedOn ? premise.acknowledgedAt : null;
      const humanDisposition = acknowledgedOn ? premise.humanDisposition : null;
      const candidate = {
        ...premise,
        observations,
        acknowledgedOn,
        acknowledgedAt,
        humanDisposition,
        lastReviewedOn: premise.lastReviewedOn && premise.lastReviewedOn <= asOfDay ? premise.lastReviewedOn : null,
      };
      const evaluation = evaluatePremiseCore(candidate, { now: asOfDay, settings });
      return {
        ...candidate,
        status: evaluation.status,
        posteriorPct: evaluation.posteriorPct,
        logBayesFactor: evaluation.logBayesFactor,
      };
    })
    .filter(Boolean);
  if ((state.premises || []).some((p) => !p.createdAt)) {
    notes.push('Some premises have no creation timestamp; historical premise counts are approximate.');
  }
  return { premises, approximate: notes.length > 0, notes };
}
