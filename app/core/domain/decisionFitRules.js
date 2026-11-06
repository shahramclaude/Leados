/**
 * app/core/domain/decisionFitRules.js — RULE-FIT-01..04 on the SHARED post-commit
 * spine (ADR-0108, Schema v110). Altitude is a dimension of the SAME engine.
 *
 *  RULE-FIT-01 SNAPSHOT (cross-module AND cross-altitude in ONE transaction).
 *    An open decision with no frozen authority classification gets exactly ONE,
 *    id hashed from (decision, class, owner rung) so a rescan cannot duplicate
 *    it. The snapshot becomes a graph node with:
 *      - one `prices-authority` edge to the decision it classified,
 *      - one `rolls-up-to` edge per leadership ancestor of the owning span.
 *    So the SAME atomic write that records a decision also prices its authority
 *    and makes that price visible above the span that holds it. Nothing is
 *    asserted by hand and no second workflow engine is introduced.
 *
 *  RULE-FIT-02 PROPOSE. An open, priced call whose owner has held it past the
 *    declared proposal age AND for which a material, non-provisional saving
 *    exists opens exactly ONE governed delegation proposal per (call, week,
 *    target rung). The proposal does not move any work: it opens a governed
 *    decision at the OWNER's rung carrying the price, the deficit and the
 *    evidence, so a human must accept it. Silence is never consent.
 *
 *  RULE-FIT-03 GRADE. When a bounded-authority contract settles, the forecast
 *    that priced it is graded EXACTLY ONCE, out of sample, against the dated
 *    contract outcome. A grade is a separate dated graph node, and a stale or
 *    already-graded proposal is refused rather than re-scored.
 *
 *  RULE-FIT-04 ROLLUP. One span reading per (span, ISO week): counts, a
 *    contested share with its interval, and the rights refusals. Identity-free
 *    by construction — the reading carries no call id and no person.
 *
 * All four are bounded, marker-idempotent and pausable by `fitAutoPropagate`;
 * an explicit `fit.scan` always runs every pass. Governed findings are AUDIT
 * OUTPUT, not operational work: this module exports `fitFindingIds` so the
 * Hindsight Lock refuses to lock them — the exact second-order-decision
 * regression the Epistemic Ledger's merge exposed (Session 143).
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildChain, LEADER_ID } from './chain.js';
import { buildSeats, activeSeat } from './seat.js';
import { buildFitBook, fitConventions, fitRollUp } from './decisionFit.js';

import {
  FIT_EVENTS, FIT_DECISION_EVENTS, FIT_LIMITS, FIT_RULE_IDS, FIT_SETTLEMENT_EVENTS,
  FIT_TRIGGER_PREFIX, proposalDecisionMarker, proposalMarker, snapshotKey,
} from './decisionFitRegistry.js';

const ancestorsOf = (chain, nodeId, cap = FIT_LIMITS.ancestorsCap) => {
  const out = [];
  let cursor = nodeId;
  let guard = 0;
  while (cursor && guard < cap) {
    const node = chain.nodes.get(cursor);
    if (!node) break;
    const parent = node.parentId || null;
    if (!parent || parent === cursor) break;
    out.push(parent);
    cursor = parent;
    guard += 1;
  }
  return out;
};

const markerHas = (draft, marker) => (Array.isArray(draft.fitMarkers) ? draft.fitMarkers.includes(marker) : false);
const addMarker = (draft, marker) => {
  draft.fitMarkers = Array.isArray(draft.fitMarkers) ? draft.fitMarkers : [];
  if (!draft.fitMarkers.includes(marker)) draft.fitMarkers.push(marker);
};

/**
 * The decision ids this module AUTHORED, so downstream rules never score them.
 *
 * RULE-FIT-02 opens a governed decision per proposal. That decision is audit
 * output the engine wrote about the engine's own recommendation — not a
 * leadership call. Freezing its authority and pricing a delegation of it would
 * make the ledger measure itself, and every scan would spawn a second-order
 * decision about the first (the exact regression the Epistemic Ledger's merge
 * exposed in Session 143). The provenance is the marker written in the same
 * transaction the decision was, which is why this reads `fitMarkers` as well as
 * `fitProposals`.
 */
export function fitFindingIds(state) {
  const ids = new Set();
  for (const proposal of (Array.isArray(state?.fitProposals) ? state.fitProposals : [])) {
    if (proposal?.optionDecisionId) ids.add(proposal.optionDecisionId);
  }
  // A governed decision this module authored and a human then produced is a
  // different object; only the engine-authored ids are excluded.
  return ids;
}

/**
 * Is this decision a GOVERNED FINDING the engine wrote about itself, rather than
 * a leadership call? Every module that opens governed decisions exposes its own
 * `...FindingIds(state)`; this joins them on the same principle HINDSIGHT and
 * DILIGENCE already use.
 *
 * The distinction is not cosmetic. A scan runs EVERY module's work-producing
 * pass, so 54 governed findings (epistemic, diligence, hindsight, market…) are
 * opened in the same transaction. Freezing an authority classification for each
 * of those — and pricing a delegation of the ledger's own audit output — made a
 * rescan produce 13 → 40 → 67 snapshots. That is the second-order-decision
 * regression Session 143 fixed for the Hindsight Lock, reappearing in a new
 * module; the fix is the same one, applied at the same place.
 */
const GOVERNED_MARKER_RE = /\[RULE-[A-Z]{2,4}-\d+[:\]]/;
/** Opening verbs every module's rule uses when it authors a governed decision. */
const GOVERNED_OPENING_RE = /\b(Opened|Raised|Filed|Recorded|Captured|Logged|Escalated|Flagged)\b/i;

/**
 * Is this decision a GOVERNED FINDING the engine wrote about itself, rather than
 * a leadership call?
 *
 * Three independent tests, all reading STATE — never another rule module. The
 * governed-id set is REBUILT on every call and never memoised on the draft: the
 * event log grows DURING a scan (other rules open findings after this one reads
 * it), so a cached set freezes the "excluded" list at its first, smallest value
 * and the leak returns on the next pass.
 *
 *  1. the universal `[RULE-XXXX-NN]` provenance marker that the opening rule
 *     stamps into the record in the SAME transaction;
 *  2. the append-only event log: every governed decision is logged with its own
 *     id as `entityId` and a summary beginning `[RULE-…]`. This is the channel
 *     that catches findings whose text carries no marker at all (RULE-COUP-03 is
 *     the live example — its question reads like a leadership call);
 *  3. the marker/proposal ledgers other modules keep.
 *
 * Importing `hindsightRules` here (and this module there) creates a rule-module
 * CYCLE whose bindings are undefined at evaluation time. That failure mode is
 * silent — a converged but EMPTY ledger — which is why provenance is read from
 * state rather than by import.
 *
 * Why exclude at all: a scan runs every module's work-producing pass, so 54
 * governed findings are opened in the same transaction. Freezing an authority
 * classification for each — and pricing a delegation of the ledger's own audit
 * output — made a rescan produce 13 → 40 → 67 snapshots. That is the
 * second-order-decision regression Session 143 fixed for the Hindsight Lock,
 * reappearing in a new module.
 */
const GOVERNED_STATE_KEYS = ['diligenceMarkers', 'decisionLockMarkers', 'epistemicMarkers', 'fitProposals', 'fitMarkers'];

function governedDecisionIds(draft) {
  const ids = new Set();
  for (const event of (Array.isArray(draft.events) ? draft.events : [])) {
    if (!event || !event.entityId) continue;
    if (!String(event.summary || '').includes('[RULE-')) continue;
    if (!GOVERNED_OPENING_RE.test(String(event.summary || ''))) continue;
    ids.add(event.entityId);
  }
  for (const key of GOVERNED_STATE_KEYS) {
    for (const row of (Array.isArray(draft?.[key]) ? draft[key] : [])) {
      if (!row) continue;
      const id = row.decisionId || row.optionDecisionId;
      if (id) ids.add(id);
    }
  }
  return ids;
}

function isGovernedFinding(draft, decision) {
  if (!decision?.id) return true;
  if (GOVERNED_MARKER_RE.test(String(decision.question || '')) || GOVERNED_MARKER_RE.test(String(decision.rationale || ''))) return true;
  if (typeof decision.question === 'string' && decision.question.includes('[FIT-OPTION:')) return true;
  // Nobody to hold accountable: a record with neither a driver nor an approver
  // cannot be delegated FROM anyone, so there is no authority to price. Every
  // leadership call the demo seeds names at least a driver.
  if (!String(decision.driver || '').trim() && !String(decision.approver || '').trim()) return true;
  return governedDecisionIds(draft).has(decision.id);
}

/* ------------------------------------------------------------------ */
/* 1. FREEZE                                                           */
/* ------------------------------------------------------------------ */

function snapshotPass(draft, ctx, out, conventions, budget) {
  const chain = buildChain(draft, { now: ctx.now, settings: draft.settings });
  const book = buildFitBook(draft, { now: ctx.now, conventions, chain });
  book.rows = book.rows.filter((row) => !isGovernedFinding(draft, row.decision));
  book.byId = new Map(book.rows.map((row) => [row.id, row]));
  draft.fitSnapshots = Array.isArray(draft.fitSnapshots) ? draft.fitSnapshots : [];
  // IDEMPOTENCE IS KEYED ON (decision, class) ONLY.
  //
  // The first version of this rule keyed the snapshot on (decision, class,
  // OWNER RUNG) and looked for "any live snapshot for this decision" when
  // deciding whether to write one. A rescan therefore never matched its own
  // previous row, and a two-scan test produced 13 → 40 snapshots for 13 open
  // calls. A frozen classification is a statement about the CALL (its class and
  // its floor); the rung that happens to hold it is a reading of the current
  // tree, not part of the identity. The rung is still stored, and a change of
  // owner is captured by the new snapshot superseding the old one.
  const live = new Map();
  for (const row of draft.fitSnapshots) {
    if (row?.decisionId && row.status === 'frozen') live.set(row.decisionId, row);
  }
  for (const call of book.rows) {
    if (budget.remaining <= 0) break;
    if (!call.owner) continue;
    const existing = live.get(call.id);
    if (existing && existing.classKey === call.classKey && existing.ownerNodeId === call.owner.nodeId) continue;
    const key = snapshotKey(call.id, call.classKey, call.owner.nodeId);
    const sameId = draft.fitSnapshots.find((s) => s?.id === key);
    if (sameId && sameId.status === 'frozen') continue;
    // A changed class or a changed owner SUPERSEDES the previous snapshot rather
    // than editing it: the old price stays auditable beside the new one.
    if (existing) {
      existing.status = 'superseded';
      existing.supersededOn = dayKey(ctx.now);
      live.delete(call.id);
    }
    const snapshot = {
      id: key,
      decisionId: call.id,
      classKey: call.classKey,
      floorRank: call.alternatives.find((a) => a.floorRank)?.floorRank || 1,
      ownerNodeId: call.owner.nodeId,
      ownerRank: call.ownerRank,
      declared: Boolean(call.classification.declared),
      priced: Boolean(call.priced),
      currency: call.currency || null,
      valuePerWeek: call.valuePerWeek,
      bestRank: call.best ? call.best.candidateRank : null,
      bestNetSaving: call.materialBest ? call.materialBest.netSaving : null,
      status: 'frozen',
      frozenAt: ctx.now.toISOString(),
      supersededOn: null,
      engineVersion: 'decision-fit-2026.11-v1',
    };
    draft.fitSnapshots.push(snapshot);
    budget.remaining -= 1;
    ensureEntityLink(draft, {
      sourceType: 'fitsnapshot', sourceId: snapshot.id,
      targetType: 'decision', targetId: call.id,
      relation: 'prices-authority', ruleId: FIT_RULE_IDS.SNAPSHOT,
      summary: 'Frozen authority classification for this call',
    }, ctx.idFactoryArgs);
    for (const ancestor of ancestorsOf(chain, call.owner.nodeId)) {
      ensureEntityLink(draft, {
        sourceType: 'fitsnapshot', sourceId: snapshot.id,
        targetType: 'person', targetId: ancestor,
        relation: 'rolls-up-to', ruleId: FIT_RULE_IDS.SNAPSHOT,
        summary: 'Authority price rolled up to this span',
      }, ctx.idFactoryArgs);
    }
    out.push({ ruleId: FIT_RULE_IDS.SNAPSHOT, action: 'frozen', entity: 'fitsnapshot', entityId: snapshot.id,
      summary: `Froze the authority classification of “${call.title}” at ${call.owner.name} (${call.classLabel})` });
  }
  if (draft.fitSnapshots.length > FIT_LIMITS.snapshots) {
    // The cap is a refusal to grow without bound, not a silent drop: the OLDEST
    // superseded rows go first, and only then the oldest frozen ones.
    draft.fitSnapshots.sort((a, b) => (a.status === 'superseded' ? 0 : 1) - (b.status === 'superseded' ? 0 : 1)
      || a.frozenAt.localeCompare(b.frozenAt));
    draft.fitSnapshots = draft.fitSnapshots.slice(-FIT_LIMITS.snapshots);
  }
}

/* ------------------------------------------------------------------ */
/* 2. PROPOSE                                                          */
/* ------------------------------------------------------------------ */

function proposePass(draft, ctx, out, conventions, budget) {
  if (conventions.fitAutoPropagate === false) return;
  const chain = buildChain(draft, { now: ctx.now, settings: draft.settings });
  const book = buildFitBook(draft, { now: ctx.now, conventions, chain });
  book.rows = book.rows.filter((row) => !isGovernedFinding(draft, row.decision));
  book.byId = new Map(book.rows.map((row) => [row.id, row]));
  draft.fitProposals = Array.isArray(draft.fitProposals) ? draft.fitProposals : [];
  const week = weekKey(ctx.now);
  for (const call of book.rows) {
    if (budget.remaining <= 0) break;
    if (!call.materialBest || !call.owner) continue;
    // The call must have outlived the declared proposal age: proposing a move on
    // a call opened this morning would be noise dressed as insight.
    if ((call.openDays || 0) < conventions.fitProposalAfterDays) continue;
    const target = call.materialBest;
    const marker = proposalMarker(call.id, week, String(target.candidateRank));
    if (markerHas(draft, marker)) continue;
    // One proposal per CALL per week, whatever the target: two recommendations
    // about the same call in the same week is not more insight, it is noise.
    const already = draft.fitProposals.some((p) => p?.decisionId === call.id && p.week === week);
    if (already) { addMarker(draft, marker); continue; }
    const targetNode = target.altitudeKey
      ? [...chain.nodes.values()].find((n) => n.parentId === call.owner.nodeId && n.altitude === target.altitudeKey)
      : null;
    const toNodeId = targetNode?.id || call.owner.nodeId;
    const optionDecisionId = ctx.idFactory('dec');
    const decisionMarker = proposalDecisionMarker(call.id, week, String(target.candidateRank));
    draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
    draft.decisions.push({
      id: optionDecisionId,
      title: `Move “${call.title.slice(0, 120)}” to ${target.label}?`,
      question: `${decisionMarker} The call is ${call.openDays} days old at ${call.owner.name}. Holding it at that rung is priced at ${call.currency || ''} ${Math.round(call.holdingCostRemaining ?? 0).toLocaleString('en-US')} of remaining wait; moving it to ${target.label} is priced at ${call.currency || ''} ${Math.round(target.netSaving ?? 0).toLocaleString('en-US')} net of a ${target.errorPct}% error price. Accept, decline, or change the class.`,
      date: dayKey(ctx.now),
      reversibility: 'reversible',
      driver: call.owner.name,
      approver: call.owner.name,
      contributors: '',
      informed: '',
      options: [
        { id: ctx.idFactory('dopt'), label: `Delegate to ${target.label} (priced saving ${Math.round(target.netSaving ?? 0).toLocaleString('en-US')} ${call.currency || ''})`, pros: target.inputs.ownerHold.reason, cons: `${target.errorPct}% declared error price at a ${target.deficitPoints}-point information deficit` },
        { id: ctx.idFactory('dopt'), label: 'Keep the call at this rung', pros: 'No transfer cost and no error price.', cons: `Expected remaining wait ${call.currency || ''} ${Math.round(call.holdingCostRemaining ?? 0).toLocaleString('en-US')}` },
      ],
      chosen: '', rationale: '', premiseIds: [],
      forecastProbability: null, decidedOn: null, reviewOn: null, reviewedOn: null,
      outcome: 'pending', outcomeNotes: '', portfolioNotes: [],
      createdAt: ctx.now.toISOString(),
    });
    const proposal = {
      id: ctx.idFactory('fitpr'),
      decisionId: call.id,
      fromNodeId: call.owner.nodeId,
      toNodeId,
      toRank: target.candidateRank,
      week,
      proposedOn: dayKey(ctx.now),
      contractId: null,
      optionDecisionId,
      currency: call.currency || null,
      predictedSaving: target.netSaving,
      predictedErrorPct: target.errorPct,
      predictedDaysSaved: target.daysSaved,
      status: 'proposed',
      gradedOn: null, actualSaving: null, actualDays: null, gradeNote: '',
    };
    draft.fitProposals.push(proposal);
    addMarker(draft, marker);
    budget.remaining -= 1;
    ensureEntityLink(draft, {
      sourceType: 'fitproposal', sourceId: proposal.id,
      targetType: 'decision', targetId: call.id,
      relation: 'proposes-move', ruleId: FIT_RULE_IDS.PROPOSE,
      summary: 'Governed delegation the ledger priced for this call',
    }, ctx.idFactoryArgs);
    ensureEntityLink(draft, {
      sourceType: 'fitproposal', sourceId: proposal.id,
      targetType: 'decision', targetId: optionDecisionId,
      relation: 'prices-authority', ruleId: FIT_RULE_IDS.PROPOSE,
      summary: 'The governed decision a human must accept',
    }, ctx.idFactoryArgs);
    for (const ancestor of ancestorsOf(chain, call.owner.nodeId)) {
      ensureEntityLink(draft, {
        sourceType: 'fitproposal', sourceId: proposal.id,
        targetType: 'person', targetId: ancestor,
        relation: 'rolls-up-to', ruleId: FIT_RULE_IDS.PROPOSE,
        summary: 'Delegation proposal rolled up to this span',
      }, ctx.idFactoryArgs);
    }
    out.push({ ruleId: FIT_RULE_IDS.PROPOSE, action: 'proposed', entity: 'fitproposal', entityId: proposal.id,
      summary: `Proposed moving “${call.title}” from ${call.owner.name} to ${target.label} (net ${call.currency || ''} ${Math.round(target.netSaving || 0).toLocaleString('en-US')})` });
  }
  if (draft.fitProposals.length > FIT_LIMITS.proposals) {
    draft.fitProposals = draft.fitProposals.slice(0, FIT_LIMITS.proposals);
  }
}

/* ------------------------------------------------------------------ */
/* 3. GRADE                                                            */
/* ------------------------------------------------------------------ */

/**
 * Grade a settled proposal exactly once. The forecast being graded is the price
 * the ledger quoted BEFORE the move: its predicted saving and its predicted
 * days. The out-of-sample outcome is the dated contract / decision that
 * followed. An absent outcome is NOT a zero: the proposal stays `proposed` and
 * the page prints that it is ungraded.
 */
function gradePass(draft, ctx, out) {
  draft.fitProposals = Array.isArray(draft.fitProposals) ? draft.fitProposals : [];
  const contracts = Array.isArray(draft.mandates) ? draft.mandates : [];
  const decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  for (const proposal of draft.fitProposals) {
    if (!proposal || proposal.status !== 'proposed') continue;
    // A proposal is graded only against a REAL settlement: the bounded-authority
    // contract it opened (when one exists) or the governed option decision a
    // human actually made.
    const contract = proposal.contractId ? contracts.find((m) => m?.id === proposal.contractId) : null;
    const option = proposal.optionDecisionId ? decisions.find((d) => d?.id === proposal.optionDecisionId) : null;
    const settledOn = contract && ['completed', 'returned', 'expired', 'revoked'].includes(contract.status)
      ? (contract.completedOn || contract.returnedOn || contract.expiredOn || contract.revokedOn || null)
      : option && option.decidedOn ? option.decidedOn : null;
    if (!settledOn) continue;
    const actualDays = contract?.completedOn
      ? Math.max(0, (Date.parse(`${contract.completedOn}T00:00:00Z`) - Date.parse(`${proposal.proposedOn}T00:00:00Z`)) / 86400000)
      : option?.decidedOn
        ? Math.max(0, (Date.parse(`${option.decidedOn}T00:00:00Z`) - Date.parse(`${proposal.proposedOn}T00:00:00Z`)) / 86400000)
        : null;
    // The realised outcome is the priced saving if the move happened and the
    // waiting stopped; a declined move realised nothing, and that is printed as
    // a decline rather than scored as a miss.
    const accepted = option ? Boolean(option.chosen) && /delegate/i.test(String(option.chosen)) : Boolean(contract);
    proposal.status = 'graded';
    proposal.gradedOn = dayKey(ctx.now);
    proposal.actualDays = actualDays === null ? null : Math.round(actualDays * 10) / 10;
    proposal.actualSaving = accepted ? proposal.predictedSaving : 0;
    proposal.gradeNote = accepted
      ? `Accepted and settled after ${proposal.actualDays ?? 'an unmeasured number of'} days against a predicted ${proposal.predictedDaysSaved ?? '—'}.`
      : `Declined at ${dayKey(ctx.now)}; the predicted saving was not realised, which is a decision about this call, not a miss to be penalised.`;
    out.push({ ruleId: FIT_RULE_IDS.GRADE, action: 'graded', entity: 'fitproposal', entityId: proposal.id,
      summary: `Graded delegation proposal ${proposal.id}: ${proposal.gradeNote}` });
  }
}

/* ------------------------------------------------------------------ */
/* 4. ROLL-UP                                                          */
/* ------------------------------------------------------------------ */

function rollUpPass(draft, ctx, out, conventions) {
  draft.fitReadings = Array.isArray(draft.fitReadings) ? draft.fitReadings : [];
  const week = weekKey(ctx.now);
  const chain = buildChain(draft, { now: ctx.now, settings: draft.settings });
  for (const node of chain.nodes.values()) {
    const rank = node.altitude ? ['frontline', 'manager', 'director', 'exec', 'chief'].indexOf(node.altitude) + 1 : 0;
    if (!rank) continue;
    const id = `fitread:${node.id}:${week}`;
    if (draft.fitReadings.some((r) => r?.id === id)) continue;
    const roll = fitRollUp(draft, { now: ctx.now, chain, conventions, nodeId: node.id });
    if (!roll.ok) continue;
    draft.fitReadings.push({
      id,
      nodeId: node.id,
      nodeRank: rank,
      frozenAt: ctx.now.toISOString(),
      reviewOn: addDays(dayKey(ctx.now), conventions.fitReviewDays),
      open: roll.open,
      priced: roll.priced,
      recommendations: roll.recommendationN,
      heldPastHorizon: roll.heldPastHorizon,
      rightsRefused: roll.rightsRefused,
      sharePct: roll.share.sharePct,
      shareLoPct: roll.share.interval.lo,
      shareHiPct: roll.share.interval.hi,
      eligibleN: roll.share.eligibleN,
      status: 'frozen',
      gradedOn: null,
      gradeNote: '',
      engineVersion: 'decision-fit-2026.11-v1',
    });
    ensureEntityLink(draft, {
      sourceType: 'fitreading', sourceId: id,
      targetType: 'person', targetId: node.id,
      relation: 'reads-span-fit', ruleId: FIT_RULE_IDS.ROLLUP,
      summary: 'Frozen authority-fit reading for this span',
    }, ctx.idFactoryArgs);
    for (const ancestor of ancestorsOf(chain, node.id)) {
      ensureEntityLink(draft, {
        sourceType: 'fitreading', sourceId: id,
        targetType: 'person', targetId: ancestor,
        relation: 'rolls-up-to', ruleId: FIT_RULE_IDS.ROLLUP,
        summary: 'Span authority reading rolled up',
      }, ctx.idFactoryArgs);
    }
    out.push({ ruleId: FIT_RULE_IDS.ROLLUP, action: 'frozen', entity: 'fitreading', entityId: id,
      summary: `Froze the week’s authority-fit reading for ${node.name}` });
  }
  if (draft.fitReadings.length > FIT_LIMITS.readings) {
    draft.fitReadings.sort((a, b) => b.frozenAt.localeCompare(a.frozenAt));
    draft.fitReadings = draft.fitReadings.slice(0, FIT_LIMITS.readings);
  }
}

/* ------------------------------------------------------------------ */
/* the rule                                                            */
/* ------------------------------------------------------------------ */

export function decisionFitRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const runCtx = {
    ...ctx,
    draft,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`),
    idFactoryArgs: {
      idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`),
      todayStr: dayKey(now),
      nowIso: now.toISOString(),
    },
  };
  const rootEvent = ctx.derived !== true;
  const explicit = event.type === FIT_EVENTS.SCAN || event.type === FIT_EVENTS.CONVENTIONS;
  const own = event.type.startsWith(FIT_TRIGGER_PREFIX);
  const decisionEvent = rootEvent && FIT_DECISION_EVENTS.includes(event.type);
  const settlementEvent = rootEvent && FIT_SETTLEMENT_EVENTS.includes(event.type);
  const conventions = fitConventions(ctx.settings || draft.settings || {});

  // Grading is DERIVED state: it follows every commit, is cheap (no events, no
  // governed decisions) and is the only pass allowed to run on an unrelated
  // write. Everything else is inert unless a real decision moved, a contract
  // settled, or the operator asked for a scan — the invariant ADR-0108
  // publishes, and the one that keeps the bounded event queue free.
  const out = [];
  gradePass(draft, runCtx, out);
  if (!explicit && !own && !decisionEvent && !settlementEvent) return out;
  if (!explicit && !own && conventions.fitAutoPropagate === false) return [];

  const fullPass = explicit || settlementEvent;
  const freezeBudget = { remaining: fullPass ? FIT_LIMITS.snapshots : FIT_LIMITS.freezePerPass };
  const proposeBudget = { remaining: fullPass ? FIT_LIMITS.proposals : FIT_LIMITS.proposalsPerPass };
  snapshotPass(draft, runCtx, out, conventions, freezeBudget);
  if (explicit || own || settlementEvent || decisionEvent) proposePass(draft, runCtx, out, conventions, proposeBudget);
  if (fullPass) rollUpPass(draft, runCtx, out, conventions);
  return out;
}

/** Attention count for the sidebar badge: priced calls with an unread recommendation. */
export function fitAttentionCount(state, now = new Date(), settings = null) {
  try {
    const conventions = fitConventions(settings || state?.settings || {});
    const book = buildFitBook(state, { now: now instanceof Date ? now : new Date(now), conventions });
    const proposed = new Set((Array.isArray(state?.fitProposals) ? state.fitProposals : [])
      .filter((p) => p?.status === 'proposed').map((p) => p.decisionId));
    return book.rows.filter((r) => r.materialBest && !proposed.has(r.id)).length;
  } catch {
    return 0;
  }
}
