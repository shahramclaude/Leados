/** RULE-VS-01..03: one event-driven spine for peer roll-up, SLA governance and carryover lineage. */
import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { buildSeats } from './seat.js';
import { normalizeValueStreamSettings } from './valueStreamSchema.js';
import { VALUE_STREAM_EVENTS, VALUE_STREAM_LIMITS, VALUE_STREAM_RULE_IDS } from './valueStreamRegistry.js';
import { valueStreamServiceState, valueStreamTargetMet } from './valueStream.js';

const TRIGGERS = new Set(Object.values(VALUE_STREAM_EVENTS));
const clean = (v, max = 280) => typeof v === 'string' ? v.trim().slice(0, max) : '';
function link(draft, ctx, sourceType, sourceId, targetType, targetId, relation, ruleId, summary) {
  return ensureEntityLink(draft, { sourceType, sourceId, targetType, targetId, relation, ruleId, summary: clean(summary) },
    { idFactory: ctx.idFactory, todayStr: dayKey(ctx.now), nowIso: ctx.now.toISOString() }).created;
}
function ancestors(built, id, includeSelf = true) {
  const out = []; const seen = new Set(); let cursor = includeSelf ? id : built.chain.nodes.get(id)?.parentId;
  while (cursor && cursor !== LEADER_ID && !seen.has(cursor)) {
    seen.add(cursor); if (built.byId.has(cursor)) out.push(cursor);
    cursor = built.chain.nodes.get(cursor)?.parentId || null;
  }
  return out;
}
function effect(ctx, out, ruleId, action, targetType, targetId, summary) {
  const row = { ruleId, action, targetType, targetId, summary: clean(summary) }; out.push(row);
  ctx.logEvent?.({ type: 'automation.propagated', entity: targetType, entityId: targetId,
    summary: `[${ruleId}] ${row.summary}`.slice(0, 300) });
}
function marker(draft, ctx, key, kind, summary) {
  if (!Array.isArray(draft.valueStreamMarkers)) draft.valueStreamMarkers = [];
  if (draft.valueStreamMarkers.some((m) => m.key === key)) return false;
  draft.valueStreamMarkers.push({ id: ctx.idFactory('vsm'), key, kind, recordedOn: dayKey(ctx.now), summary: clean(summary, 240) });
  if (draft.valueStreamMarkers.length > VALUE_STREAM_LIMITS.markers) draft.valueStreamMarkers.splice(0, draft.valueStreamMarkers.length - VALUE_STREAM_LIMITS.markers);
  return true;
}
function governedDecision(ctx, draft, contract) {
  const mediator = draft.people.find((p) => p.id === contract.mediatorSeatId);
  const today = dayKey(ctx.now);
  return {
    id: ctx.idFactory('dec'), title: clean(`SLA breach: ${contract.title}`, 180),
    question: clean(`How should the ${contract.supplierSeatId} → ${contract.consumerSeatId} hand-off recover? [RULE-VS-02:${contract.id}]`, 900),
    date: today, reversibility: 'reversible', driver: mediator?.name || 'LCA mediator', approver: mediator?.name || 'LCA mediator',
    contributors: '', informed: '', ownerId: contract.mediatorSeatId,
    options: [
      { id: ctx.idFactory('opt'), label: 'Recover the existing SLA', pros: 'Keeps the agreed customer outcome.', cons: 'Requires named capacity and a credible recovery date.' },
      { id: ctx.idFactory('opt'), label: 'Re-counter scope or lead time', pros: 'Makes the trade-off explicit to both parties.', cons: 'Changes the promised value or critical path.' },
      { id: ctx.idFactory('opt'), label: 'Stop and review capital carryover', pros: 'Prevents further commitment to a falsified path.', cons: 'Requires a surviving bet and receiving-span consent.' },
    ], chosen: '',
    rationale: clean(`Due ${contract.dueOn}; supplier actual ${contract.actual} ${contract.unit} versus ${contract.direction} ${contract.target}. Execution evidence is separated from the recovery choice.`, 500),
    reviewOn: addDays(today, 14), reviewedOn: null, outcome: 'pending', outcomeNotes: '',
    forecastProbability: null, decidedOn: null, createdAt: ctx.now.toISOString(),
  };
}

export function valueStreamRule(draft, ctx = {}) {
  if (!draft || !ctx.event || !TRIGGERS.has(ctx.event.type)) return [];
  const conv = normalizeValueStreamSettings(draft.settings || {});
  if (!conv.valueStreamAutoPropagate && ctx.event.type !== VALUE_STREAM_EVENTS.SCAN) return [];
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const hook = { ...ctx, now, idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((p) => `${p}-${Date.now()}`) };
  const built = buildSeats(draft, { now, settings: draft.settings || {} });
  const out = []; const today = dayKey(now);
  const people = new Set(draft.people.map((p) => p.id));
  const pacts = new Set(draft.catchballPacts.map((p) => p.id));
  const bets = new Set(draft.strategyBets.map((b) => b.id));
  const budgets = new Set(draft.budgets.map((b) => b.id));

  // RULE-VS-01: both branches roll through the SAME reporting tree used by
  // Catchball and Operating Seat; no parallel network hierarchy is persisted.
  for (const c of draft.valueStreamContracts || []) {
    if (c.mediatorSeatId && people.has(c.mediatorSeatId)) link(draft, hook, 'valuestreamcontract', c.id, 'person', c.mediatorSeatId,
      'mediated-by', VALUE_STREAM_RULE_IDS.NETWORK_ROLLUP, `LCA governs this peer SLA; mediator cannot consent for either party.`);
    if (c.consumerPactId && pacts.has(c.consumerPactId)) link(draft, hook, 'valuestreamcontract', c.id, 'catchballpact', c.consumerPactId,
      'supplies-pact', VALUE_STREAM_RULE_IDS.NETWORK_ROLLUP, `Supplier SLA feeds the receiving Catchball pact.`);
    if (c.strategyBetId && bets.has(c.strategyBetId) && c.status !== 'withdrawn') link(draft, hook, 'valuestreamcontract', c.id, 'strategy', c.strategyBetId,
      'deploys-strategy', VALUE_STREAM_RULE_IDS.NETWORK_ROLLUP, `Peer value-stream hand-off deploys the declared bet.`);
    if (c.status === 'withdrawn') continue;
    for (const party of [c.supplierSeatId, c.consumerSeatId]) {
      for (const seatId of ancestors(built, party, true)) {
        const node = built.byId.get(seatId);
        link(draft, hook, 'valuestreamcontract', c.id, 'person', seatId, 'rolls-up-to', VALUE_STREAM_RULE_IDS.NETWORK_ROLLUP,
          `Peer ${party === c.supplierSeatId ? 'supplier' : 'consumer'} branch rolls up to ${node?.shortLabel || 'leadership'} (rank ${node?.rank || '?'}).`);
      }
    }
  }

  // RULE-VS-02: an overdue directional miss opens ONE governed recovery
  // decision per contract per ISO week. It never changes the SLA outcome.
  const week = weekKey(now);
  let opened = (draft.valueStreamMarkers || []).filter((m) => m.kind === 'sla-breach' && m.key.endsWith(`:${week}`)).length;
  for (const c of (draft.valueStreamContracts || []).filter((row) => row.status === 'agreed')) {
    if (opened >= conv.valueStreamMaxDecisions) break;
    if (valueStreamServiceState(c, today) !== 'breached' || valueStreamTargetMet(c) !== false) continue;
    const key = `sla-breach:${c.id}:${week}`;
    if ((draft.valueStreamMarkers || []).some((m) => m.key === key)) continue;
    if (!marker(draft, hook, key, 'sla-breach', `Overdue SLA miss: ${c.actual} ${c.unit} vs ${c.direction} ${c.target}.`)) continue;
    const decision = governedDecision(hook, draft, c); draft.decisions.unshift(decision); opened += 1;
    link(draft, hook, 'decision', decision.id, 'valuestreamcontract', c.id, 'breaches-sla', VALUE_STREAM_RULE_IDS.SLA_GOVERNANCE,
      `Governed recovery for overdue ${c.direction} SLA; actual ${c.actual}, target ${c.target}.`);
    for (const seatId of ancestors(built, c.mediatorSeatId, true)) link(draft, hook, 'decision', decision.id, 'person', seatId,
      'rolls-up-to', VALUE_STREAM_RULE_IDS.SLA_GOVERNANCE, `SLA recovery decision rolls through the LCA leadership branch.`);
    effect(hook, out, VALUE_STREAM_RULE_IDS.SLA_GOVERNANCE, 'opened-decision', 'valuestreamcontract', c.id,
      `Opened governed SLA recovery for ${c.title}; no outcome or term was auto-changed.`);
  }

  // RULE-VS-03: immutable carryover receipt -> settled source, proposed target,
  // surviving bet and receiving budget. Actual spend and source grade stay put.
  for (const r of draft.valueStreamReallocations || []) {
    for (const source of r.sourceLines) if (pacts.has(source.sourcePactId)) link(draft, hook, 'valuestreamreallocation', r.id,
      'catchballpact', source.sourcePactId, 'releases-capacity', VALUE_STREAM_RULE_IDS.CARRYOVER_LINEAGE,
      `Released ${source.releasedBudgetAmount} ${source.currency || ''} and ${source.releasedEffortDays}d from settled thesis-invalidated source; actual spend unchanged.`);
    if (pacts.has(r.targetPactId)) link(draft, hook, 'valuestreamreallocation', r.id, 'catchballpact', r.targetPactId,
      'funds-next-cycle', VALUE_STREAM_RULE_IDS.CARRYOVER_LINEAGE, `Capacity-priced PROPOSED receiving pact; receiver consent remains mandatory.`);
    if (bets.has(r.targetStrategyBetId)) link(draft, hook, 'valuestreamreallocation', r.id, 'strategy', r.targetStrategyBetId,
      'reallocates-to', VALUE_STREAM_RULE_IDS.CARRYOVER_LINEAGE, `Stop-rule carryover targets the surviving strategy bet with typed lineage.`);
    if (r.targetBudgetId && budgets.has(r.targetBudgetId)) link(draft, hook, 'valuestreamreallocation', r.id, 'budget', r.targetBudgetId,
      'funds', VALUE_STREAM_RULE_IDS.CARRYOVER_LINEAGE, `Planned pipeline ${r.allocatedBudgetAmount} ${r.currency || ''}; ${r.unallocatedBudgetAmount} remains unallocated.`);
  }
  return out;
}
