/**
 * Post-commit rules for strategy-cycle freezes, retirement reconciliation and
 * out-of-sample grading. Every effect is bounded, marker-idempotent, typed and
 * processed inside the existing savepoint/lineage/seal transaction.
 */
import { addDays, dayKey, round } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildSeats } from './seat.js';
import { normalizeStrategyCycleSettings, normalizeStrategyCycleReading } from './strategyCycleSchema.js';
import { retiredBetPacts, strategyCycleBrier } from './strategyCycle.js';
import {
  STRATEGY_CYCLE_LIMITS,
  STRATEGY_CYCLE_RULE_IDS,
} from './strategyCycleRegistry.js';

const TRIGGERS = new Set([
  'strategy-cycle.frozen',
  'strategy-cycle.scan',
  'strategy.bet.retired',
  'strategy.verdict.recorded',
]);

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function markerId(kind, key) {
  return `scr-${kind}-${hash(String(key))}`;
}

function markerExists(draft, id) {
  return (Array.isArray(draft.strategyCycleMarkers) ? draft.strategyCycleMarkers : [])
    .some((marker) => marker?.id === id);
}

function addMarker(draft, ctx, marker) {
  if (!Array.isArray(draft.strategyCycleMarkers)) draft.strategyCycleMarkers = [];
  if (draft.strategyCycleMarkers.some((row) => row?.id === marker.id)) return false;
  draft.strategyCycleMarkers.push({ ...marker, recordedOn: dayKey(ctx.now) });
  if (draft.strategyCycleMarkers.length > STRATEGY_CYCLE_LIMITS.markers) {
    draft.strategyCycleMarkers.splice(0, draft.strategyCycleMarkers.length - STRATEGY_CYCLE_LIMITS.markers);
  }
  return true;
}

function addLink(draft, ctx, sourceType, sourceId, targetType, targetId, relation, ruleId, summary) {
  if (!sourceId || !targetId) return false;
  return ensureEntityLink(draft, {
    sourceType,
    sourceId,
    targetType,
    targetId,
    relation,
    ruleId,
    summary: summary.slice(0, 240),
  }, {
    idFactory: ctx.idFactory,
    todayStr: dayKey(ctx.now),
    nowIso: ctx.now.toISOString(),
  }).created;
}

function note(ctx, out, ruleId, action, targetType, targetId, summary) {
  out.push({ ruleId, action, targetType, targetId, summary: summary.slice(0, 240) });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${ruleId}] ${summary}`.slice(0, 300),
    });
  }
}

function ancestorsFor(draft, scopeSeatId, now = new Date()) {
  if (!scopeSeatId || scopeSeatId === 'leader') return [];
  const built = buildSeats(draft, { now, settings: draft.settings || {} });
  const found = [];
  let current = built.chain.byId.get(scopeSeatId);
  let guard = 0;
  while (current?.parentId && current.parentId !== 'leader' && guard < 100) {
    found.push(current.parentId);
    current = built.chain.byId.get(current.parentId);
    guard += 1;
  }
  return [...new Set(found)];
}

function renewalDecision(ctx, { title, question, rationale, reviewOn }) {
  const leader = 'Workspace strategy owner';
  const options = [
    {
      label: 'Renegotiate the outstanding work through Catchball',
      pros: 'The receiving span keeps consent over scope, effort and date.',
      cons: 'Requires an explicit bilateral round before the work changes.',
    },
    {
      label: 'Close only commitments their owners confirm are no longer relevant',
      pros: 'Removes work the renewed strategy no longer needs.',
      cons: 'A stop decision without owner confirmation can strand a dependent span.',
    },
    {
      label: 'Create a replacement bet and explicitly reattach approved work',
      pros: 'Preserves continuity when the diagnosis changes but the work still matters.',
      cons: 'A new bet needs its own owner, diagnosis, policy and stop rule.',
    },
  ];
  return {
    id: ctx.idFactory('dec'),
    title: title.slice(0, 180),
    question: question.slice(0, 900),
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: leader,
    approver: leader,
    contributors: '',
    informed: '',
    options: options.map((option) => ({ id: ctx.idFactory('opt'), ...option })),
    chosen: '',
    rationale: rationale.slice(0, 500),
    reviewOn,
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

function createCycleDecision(draft, ctx, cycle, out) {
  const metrics = cycle.metrics || {};
  if (metrics.suppressed) return false;
  const actionable = Number(metrics.carryover || 0) > 0
    || Number(metrics.releasedEffortDays || 0) > 0
    || Number(metrics.stopRuleDue || 0) > 0;
  if (!actionable) return false;
  const id = markerId('decision', `cycle:${cycle.id}`);
  if (markerExists(draft, id)) return false;
  const decision = renewalDecision(ctx, {
    title: 'Renew or reconcile the strategy-to-delivery cascade',
    question: 'Which commitments should be renegotiated, confirmed for close-out, or explicitly attached to a renewed strategic bet? No budget, owner, date or pact changes until the accountable people accept them through Catchball.',
    rationale: 'A frozen cycle recorded carryover, a dated stop-rule review or work attached to a retired bet. This is a governed human choice, not an automatic recommendation or a causal claim.',
    reviewOn: cycle.reviewOn,
  });
  draft.decisions.push(decision);
  addLink(draft, ctx, 'strategycycle', cycle.id, 'decision', decision.id, 'informs', STRATEGY_CYCLE_RULE_IDS.cycle,
    'A frozen, identity-reduced cycle informs a human renewal decision.');
  for (const pactId of (cycle.cohortPactIds || []).slice(0, STRATEGY_CYCLE_LIMITS.cohortPacts)) {
    const pact = (draft.catchballPacts || []).find((row) => row?.id === pactId);
    if (pact && ['agreed', 'proposed', 'countered'].includes(pact.status)) {
      addLink(draft, ctx, 'catchballpact', pact.id, 'decision', decision.id, 'reconciles', STRATEGY_CYCLE_RULE_IDS.cycle,
        'Outstanding Catchball work is brought to a human renewal decision.');
    }
  }
  for (const ancestorId of ancestorsFor(draft, cycle.scopeSeatId, ctx.now)) {
    addLink(draft, ctx, 'decision', decision.id, 'person', ancestorId, 'rolls-up-to', STRATEGY_CYCLE_RULE_IDS.cycle,
      'The renewal decision rolls up through the leadership chain.');
  }
  addMarker(draft, ctx, { id, kind: 'reinvestment-decision', readingId: cycle.id, betId: null });
  note(ctx, out, STRATEGY_CYCLE_RULE_IDS.cycle, 'created', 'decision', decision.id,
    'Opened a human-reviewed renewal choice for carryover or stop-rule exposure; no work was changed.');
  return true;
}

function linkCycle(draft, ctx, cycle, out) {
  let links = 0;
  const pactIds = (cycle.cohortPactIds || []).slice(0, STRATEGY_CYCLE_LIMITS.cohortPacts);
  const pactSet = new Set(pactIds);
  const pacts = (draft.catchballPacts || []).filter((pact) => pact && pactSet.has(pact.id));
  const betIds = [...new Set(pacts.map((pact) => pact.strategyBetId).filter(Boolean))].slice(0, 120);
  for (const pact of pacts) {
    if (links >= STRATEGY_CYCLE_LIMITS.linksPerReading) break;
    if (addLink(draft, ctx, 'strategycycle', cycle.id, 'catchballpact', pact.id, 'audits-cascade', STRATEGY_CYCLE_RULE_IDS.cycle,
      'Identity-reduced cycle provenance to a Catchball commitment.')) links += 1;
  }
  for (const betId of betIds) {
    if (links >= STRATEGY_CYCLE_LIMITS.linksPerReading) break;
    if (addLink(draft, ctx, 'strategycycle', cycle.id, 'strategy', betId, 'audits-cascade', STRATEGY_CYCLE_RULE_IDS.cycle,
      'Identity-reduced cycle provenance to a declared strategic bet.')) links += 1;
  }
  for (const ancestorId of ancestorsFor(draft, cycle.scopeSeatId, ctx.now)) {
    if (links >= STRATEGY_CYCLE_LIMITS.linksPerReading) break;
    if (addLink(draft, ctx, 'strategycycle', cycle.id, 'person', ancestorId, 'rolls-up-to', STRATEGY_CYCLE_RULE_IDS.cycle,
      'Frozen cycle rolls up through the leadership chain.')) links += 1;
  }
  const marker = markerId('linked', cycle.id);
  if (!markerExists(draft, marker)) {
    addMarker(draft, ctx, { id: marker, kind: 'cycle-linked', readingId: cycle.id, betId: null });
    note(ctx, out, STRATEGY_CYCLE_RULE_IDS.cycle, 'linked', 'strategycycle', cycle.id,
      'Recorded bounded Catchball, strategy-bet and altitude provenance for a frozen cycle.');
  }
  createCycleDecision(draft, ctx, cycle, out);
}

function gradeCycle(draft, ctx, cycle, out) {
  if (cycle.status !== 'frozen' || !cycle.reviewOn || cycle.reviewOn > dayKey(ctx.now)) return false;
  const id = markerId('graded', cycle.id);
  if (markerExists(draft, id)) return false;
  const floor = normalizeStrategyCycleSettings(draft.settings || {}).strategyCycleEvidenceFloor;
  const cohort = new Set(cycle.cohortPactIds || []);
  const rows = (draft.catchballPacts || []).filter((pact) => pact && cohort.has(pact.id)
    && pact.status === 'settled'
    && pact.gradedOutcome
    && pact.gradedOn
    && pact.gradedOn >= cycle.frozenOn
    && pact.gradedOn <= cycle.reviewOn);
  let next;
  if (rows.length >= floor) {
    const deliveredN = rows.filter((pact) => pact.gradedOutcome === 'delivered').length;
    next = normalizeStrategyCycleReading({
      ...cycle,
      status: 'graded',
      grade: {
        settledN: rows.length,
        deliveredN,
        deliveryRatePct: round(deliveredN / rows.length * 100, 1),
        brier: strategyCycleBrier(rows, floor),
        gradedOn: dayKey(ctx.now),
      },
    });
  } else {
    next = normalizeStrategyCycleReading({ ...cycle, status: 'lapsed', grade: null });
  }
  if (!next) return false;
  const index = (draft.strategyCycles || []).findIndex((row) => row?.id === cycle.id);
  if (index < 0) return false;
  draft.strategyCycles[index] = next;
  addMarker(draft, ctx, { id, kind: 'graded', readingId: cycle.id, betId: null });
  note(ctx, out, STRATEGY_CYCLE_RULE_IDS.cycle, next.status, 'strategycycle', cycle.id,
    next.status === 'graded'
      ? 'Graded the frozen cycle against its in-window settled Catchball cohort.'
      : 'Closed the cycle without a grade because its in-window evidence did not reach the configured floor.');
  return true;
}

function reconcileRetiredBet(draft, ctx, betId, out) {
  const joined = retiredBetPacts(draft, betId, { now: ctx.now });
  if (!joined.bet) return false;
  const scopeId = joined.seat?.fullAccess || joined.seat?.isLeader ? 'leader' : joined.seat?.id;
  if (joined.overflow) {
    const overflowMarker = markerId('retired-overflow', `${betId}:${scopeId}:${joined.totalCount}`);
    if (markerExists(draft, overflowMarker)) return false;
    addMarker(draft, ctx, {
      id: overflowMarker, kind: 'retired-bet-overflow', readingId: null, betId: joined.bet.id,
    });
    note(ctx, out, STRATEGY_CYCLE_RULE_IDS.retiredBet, 'withheld', 'strategy', joined.bet.id,
      `Retired bet retains ${joined.totalCount} active Catchball commitments, above the ${STRATEGY_CYCLE_LIMITS.cohortPacts}-link bound; no partial owner-consent decision was created. Narrow the scope and scan again.`);
    return true;
  }
  if (!joined.pacts.length) return false;
  const marker = markerId('retired', `${betId}:${scopeId}`);
  if (markerExists(draft, marker)) return false;
  const decision = renewalDecision(ctx, {
    title: 'Reconcile Catchball work after a strategy verdict',
    question: 'A human stop-rule verdict retired a strategic bet while Catchball commitments remain active. Which work should be renegotiated, confirmed for close-out, or explicitly attached to a renewed bet? No pact or budget changes until its owner agrees.',
    rationale: 'Strategy owns the verdict; Catchball owners keep consent over the commitments. This decision joins the two workflows without silently transferring effort or authority.',
    reviewOn: addDays(dayKey(ctx.now), 14),
  });
  draft.decisions.push(decision);
  addLink(draft, ctx, 'strategy', joined.bet.id, 'decision', decision.id, 'decides', STRATEGY_CYCLE_RULE_IDS.retiredBet,
    'Human stop-rule verdict prompted a governed Catchball reconciliation.');
  for (const pact of joined.pacts) {
    addLink(draft, ctx, 'catchballpact', pact.id, 'decision', decision.id, 'reconciles', STRATEGY_CYCLE_RULE_IDS.retiredBet,
      'Active Catchball work remains attached to a retired bet and requires owner consent.');
  }
  for (const ancestorId of joined.ancestors || []) {
    if (ancestorId === 'leader') continue;
    addLink(draft, ctx, 'decision', decision.id, 'person', ancestorId, 'rolls-up-to', STRATEGY_CYCLE_RULE_IDS.retiredBet,
      'The cross-module renewal decision rolls up through the leadership chain.');
  }
  addMarker(draft, ctx, { id: marker, kind: 'reinvestment-decision', readingId: null, betId: joined.bet.id });
  note(ctx, out, STRATEGY_CYCLE_RULE_IDS.retiredBet, 'created', 'decision', decision.id,
    'Opened a human-reviewed Catchball reconciliation after a stop-rule verdict; no pact or budget changed.');
  return true;
}

/** Registered after Catchball and before seat/seal propagation. */
export function strategyCycleRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || !TRIGGERS.has(event.type)) return [];
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const runCtx = {
    ...ctx,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`),
    logEvent: ctx.logEvent,
  };
  const settings = normalizeStrategyCycleSettings(draft.settings || {});
  const scan = event.type === 'strategy-cycle.scan';
  if (!scan && settings.strategyCycleAutoPropagate === false) return [];
  const out = [];
  const cycles = Array.isArray(draft.strategyCycles) ? draft.strategyCycles : [];
  const scanAll = scan && event.entity === 'workspace' && event.entityId === 'all';
  const targets = scan
    ? cycles.filter((cycle) => scanAll || cycle?.scopeSeatId === event.entityId)
    : (event.type === 'strategy-cycle.frozen'
      ? cycles.filter((cycle) => cycle?.id === event.entityId)
      : []);
  for (const cycle of targets) {
    linkCycle(draft, runCtx, cycle, out);
    gradeCycle(draft, runCtx, cycle, out);
  }
  if (scan || event.type === 'strategy.bet.retired' || event.type === 'strategy.verdict.recorded') {
    const betIds = event.type === 'strategy.bet.retired' || event.type === 'strategy.verdict.recorded'
      ? [event.entityId]
      : (draft.strategyBets || []).filter((bet) => bet?.status === 'retired').map((bet) => bet.id).slice(0, 120);
    for (const betId of betIds) reconcileRetiredBet(draft, runCtx, betId, out);
  }
  return out;
}
