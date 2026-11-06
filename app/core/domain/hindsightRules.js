/**
 * app/core/domain/hindsightRules.js — RULE-HND-01..04 on the shared post-commit
 * spine (ADR-0102, Schema v104).
 *
 *  RULE-HND-01 LOCK. Every decision the workspace holds gets one frozen
 *    information set, written once: the records the link spine had already tied
 *    to it on or before the decision date, with each record's own date, plus the
 *    decision's process quality as the record stood at that instant. The lock
 *    becomes a graph node with one `locks` edge to the decision, up to twenty
 *    `consults` edges to the facts it rested on, and one `rolls-up-to` edge per
 *    leadership ancestor of the owning seat — cross-module provenance and
 *    cross-altitude roll-up in the SAME atomic transaction. Marker-idempotent.
 *
 *  RULE-HND-02 RESULTED. A decision whose frozen process was thin and whose
 *    recorded outcome was nevertheless GOOD opens exactly ONE governed process
 *    review, ever, owned at the owning span and rolled up to its ancestors. This
 *    is the whole point of the module: the successful mistake is the one nobody
 *    reviews. The engine never rates the person and never rewrites the decision.
 *
 *  RULE-HND-03 GAP. A decision that consulted less than the declared share of the
 *    facts that were already on the record opens one governed decision naming the
 *    missed count — the process defect — and never the missing content.
 *
 *  RULE-HND-04 UNGRADED. A decision whose own review date has passed by more than
 *    the declared grace and whose outcome is still unrecorded opens at most one
 *    bounded review task per lock per ISO week: a decision nobody graded cannot
 *    teach anything, and the workspace should not pretend it did.
 *
 * All four are bounded, marker-idempotent and pausable by `hindsightAutoPropagate`;
 * an explicit `hindsight.scan` always runs every pass.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildSeats, activeSeat } from './seat.js';
import { epistemicFindingIds } from './epistemicRules.js';
import { diligenceFindingIds } from './diligenceRules.js';
import { LEADER_ID } from './chain.js';
import { auditLock, buildLockRecord } from './hindsight.js';
import { hindsightConventions } from './hindsightSchema.js';
import {
  HINDSIGHT_EVENTS,
  HINDSIGHT_LIMITS,
  HINDSIGHT_RULE_IDS,
  HINDSIGHT_TRIGGER_PREFIX,
} from './hindsightRegistry.js';

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

const markerId = (kind, key) => `hnd-${kind}-${hash(String(key))}`;

/**
 * The decision ids RULE-HND opened, so other modules' ledgers never price or
 * lock the audit output of this one. Mutually exclusive by construction.
 */
export function hindsightFindingIds(state = {}) {
  const out = new Set();
  for (const marker of (Array.isArray(state?.decisionLockMarkers) ? state.decisionLockMarkers : [])) {
    if (marker && marker.decisionId) out.add(marker.decisionId);
  }
  return out;
}

function markersOf(draft) {
  return Array.isArray(draft.decisionLockMarkers) ? draft.decisionLockMarkers : [];
}

function addMarker(draft, ctx, marker) {
  if (!Array.isArray(draft.decisionLockMarkers)) draft.decisionLockMarkers = [];
  if (draft.decisionLockMarkers.some((row) => row && row.id === marker.id)) return false;
  draft.decisionLockMarkers.push({ ...marker, recordedOn: dayKey(ctx.now) });
  if (draft.decisionLockMarkers.length > HINDSIGHT_LIMITS.markers) {
    draft.decisionLockMarkers.splice(0, draft.decisionLockMarkers.length - HINDSIGHT_LIMITS.markers);
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
    summary: String(summary || '').slice(0, 240),
  }, {
    idFactory: ctx.idFactory,
    todayStr: dayKey(ctx.now),
    nowIso: ctx.now.toISOString(),
  }).created;
}

function note(ctx, out, ruleId, action, targetType, targetId, summary) {
  out.push({ ruleId, action, targetType, targetId, summary: String(summary).slice(0, 240) });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${ruleId}] ${String(summary).slice(0, 260)}`,
    });
  }
}

function ancestorsAbove(draft, seatId, now) {
  if (!seatId) return [];
  const built = buildSeats(draft, { now, settings: draft.settings || {} });
  const found = [];
  let cursor = built.chain.nodes.get(seatId)?.parentId || null;
  let guard = 0;
  while (cursor && guard < 64) {
    if (cursor !== LEADER_ID && built.byId.has(cursor)) found.push(cursor);
    cursor = built.chain.nodes.get(cursor)?.parentId || null;
    guard += 1;
  }
  return [...new Set(found)];
}

function decisionRecord(ctx, { title, question, options, reviewOn, rationale }) {
  const today = dayKey(ctx.now);
  return {
    id: ctx.idFactory('dec'),
    title: title.slice(0, 200),
    question: question.slice(0, 4000),
    date: today,
    reversibility: 'reversible',
    driver: String(ctx.draft?.settings?.leaderName || '').slice(0, 120),
    approver: String(ctx.draft?.settings?.leaderName || '').slice(0, 120),
    contributors: '',
    informed: '',
    options: options.map(([label, pros, cons]) => ({ id: ctx.idFactory('opt'), label, pros, cons })),
    chosen: '',
    rationale: rationale.slice(0, 4000),
    reviewOn,
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

function pushDecision(draft, decision) {
  if (!Array.isArray(draft.decisions)) draft.decisions = [];
  draft.decisions.push(decision);
}

function linkFindingDecision(draft, ctx, ruleId, decision, originalDecisionId, ownerSeatId, summary) {
  if (originalDecisionId) {
    addLink(draft, ctx, 'decision', decision.id, 'decision', originalDecisionId, 'tracks-followup', ruleId, summary);
  }
  if (ownerSeatId) {
    addLink(draft, ctx, 'decision', decision.id, 'person', ownerSeatId, 'informs', ruleId,
      'The process finding informs the span that owns the decision it was read from.');
    for (const ancestor of ancestorsAbove(draft, ownerSeatId, ctx.now)) {
      addLink(draft, ctx, 'decision', decision.id, 'person', ancestor, 'rolls-up-to', ruleId,
        'The process finding rolls up to this leadership ancestor.');
    }
  }
}

/* ------------------------------------------------ RULE-HND-01: the lock */

function lockPass(draft, ctx, out, conventions) {
  const decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  const locks = Array.isArray(draft.decisionLocks) ? draft.decisionLocks : [];
  const locked = new Set(locks.map((lock) => lock && lock.decisionId));
  // Decisions this module itself opened are audit output, not subjects: locking
  // them would make the module audit its own findings forever.
  const ownDecisions = new Set(
    markersOf(draft)
      .filter((marker) => marker && marker.decisionId && ['resulted', 'gap', 'ungraded'].includes(marker.kind))
      .map((marker) => marker.decisionId),
  );
  // And the same is true of every OTHER module's governed findings. A decision a
  // rule opened to make a missed signal readable is not an operational decision:
  // it has no information set to freeze, so locking it would produce a lock with
  // zero consulted facts and a process score about a form the engine authored —
  // noise that then becomes a subject for the next pass. Provenance is the
  // marker the opening rule wrote in the same transaction as the decision.
  for (const marker of markersOf(draft)) {
    if (marker && marker.decisionId) ownDecisions.add(marker.decisionId);
  }
  for (const id of epistemicFindingIds(draft)) ownDecisions.add(id);
  // ADR-0104: the Diligence Ledger's governed gap/dark findings are audit
  // output too — they have no operational information set to freeze. Declare
  // the exclusion explicitly so a pruned marker cannot resurrect one.
  for (const id of diligenceFindingIds(draft)) ownDecisions.add(id);
  // ADR-0108: the Decision-Fit Ledger's governed delegation proposals are audit
  // output too. Read from the ledger's own state rather than by importing its
  // rule module — the two modules would otherwise import each other, and a
  // rule-module cycle resolves to undefined bindings at evaluation time (found
  // by testing: a converged-but-empty ledger).
  for (const proposal of (Array.isArray(draft.fitProposals) ? draft.fitProposals : [])) {
    if (proposal && proposal.optionDecisionId) ownDecisions.add(proposal.optionDecisionId);
  }
  let createdN = 0;
  const ordered = [...decisions].sort((a, b) => String(b?.date || '').localeCompare(String(a?.date || '')));
  for (const decision of ordered) {
    if (createdN >= HINDSIGHT_LIMITS.findingsPerPass * 2) break;
    if (!decision || !decision.id || locked.has(decision.id) || ownDecisions.has(decision.id)) continue;
    if (locks.length + createdN >= HINDSIGHT_LIMITS.locks) break;
    const built = buildSeats(draft, { now: ctx.now, settings: draft.settings || {} });
    const seat = activeSeat(built);
    const result = buildLockRecord(draft, decision, {
      id: ctx.idFactory('lock'),
      now: ctx.now,
      settings: draft.settings || {},
      seatId: seat && seat.id !== LEADER_ID ? seat.id : null,
    });
    if (!result.ok) continue;
    const lock = result.lock;
    if (!Array.isArray(draft.decisionLocks)) draft.decisionLocks = [];
    draft.decisionLocks.push(lock);
    locked.add(lock.decisionId);
    createdN += 1;
    addLink(draft, ctx, 'hindsightlock', lock.id, 'decision', lock.decisionId, 'locks',
      HINDSIGHT_RULE_IDS.lock,
      `Information set frozen on ${lock.decisionOn}: ${lock.consultedN} consulted fact(s).`);
    for (const fact of lock.consulted.slice(0, 20)) {
      addLink(draft, ctx, 'hindsightlock', lock.id, fact.type, fact.id, 'consults',
        HINDSIGHT_RULE_IDS.lock,
        `The locked information set consulted this ${fact.type} record dated ${fact.on || 'undated'}.`);
    }
    if (lock.ownerSeatId) {
      for (const ancestor of ancestorsAbove(draft, lock.ownerSeatId, ctx.now)) {
        addLink(draft, ctx, 'hindsightlock', lock.id, 'person', ancestor, 'rolls-up-to',
          HINDSIGHT_RULE_IDS.lock,
          `The decision lock of ${lock.decisionOn} rolls up to this leadership ancestor.`);
      }
    }
    note(ctx, out, HINDSIGHT_RULE_IDS.lock, 'registered', 'hindsightlock', lock.id,
      `Locked the information set of a decision dated ${lock.decisionOn}: ${lock.consultedN} consulted fact(s), process ${lock.qualityMet}/5.`);
  }
  void conventions;
  return createdN;
}

/* -------------------------------------------- RULE-HND-02: resulted */

function resultedPass(draft, ctx, out, conventions, budget) {
  const locks = Array.isArray(draft.decisionLocks) ? draft.decisionLocks : [];
  const reviewOn = addDays(dayKey(ctx.now), 14);
  let openedN = 0;
  for (const lock of locks) {
    if (budget.remaining <= 0) break;
    if (!lock || !lock.id) continue;
    const audit = auditLock(draft, lock, { now: ctx.now, settings: draft.settings || {} });
    if (audit.quadrant !== 'resulted') continue;
    const id = markerId('resulted', lock.id);
    if (markersOf(draft).some((marker) => marker && marker.id === id)) continue;
    const decision = decisionRecord(ctx, {
      title: `Successful mistake: thin process, good outcome on a decision dated ${lock.decisionOn}`,
      question: [
        `The decision dated ${lock.decisionOn} rests on ${audit.coverage.knownN} consulted fact(s) and left ${audit.coverage.missedN} fact(s) that were already on the record unconsulted (coverage ${audit.coverage.pct}%, 95% interval ${audit.coverage.lowPct}–${audit.coverage.highPct}%).`,
        `Its frozen process record met ${audit.quality.met} of 5 declared requirements${audit.quality.missing.length ? ` (missing: ${audit.quality.missing.join('; ')})` : ''} against a declared floor of ${conventions.hindsightQualityFloor}.`,
        'The outcome was recorded as good. That is exactly why this review exists: the method that produced it is not yet known to work, and repeating it will eventually produce the same defect on a decision that does not get lucky.',
        'What should change before the next decision of this kind — the requirement that was missing, or the record template itself?',
      ].join(' '),
      options: [
        ['Fix the missing requirement in the process', `The frozen record already names what was absent${audit.quality.missing.length ? ` (${audit.quality.missing[0]})` : ''}; it is the cheapest repair available.`, 'Adds friction to a decision that appeared to go well, which is exactly the friction that is usually skipped.'],
        ['Accept the outcome and record why the thin path was justified', 'Honest when the deadline was the constraint and the risk was consciously taken.', 'A justification written after a good outcome is the definition of resulting; it must be dated and must not become the default.'],
        ['Re-declare the conventions', 'If the floor is wrong for this class of decision, the floor is the defect.', 'Changes what counts as sound everywhere in the workspace, not just here.'],
      ],
      reviewOn,
      rationale: 'RULE-HND-02: the frozen process claim was below the declared floor and the recorded outcome was good. One process review per lock, ever; the engine rates no person and edits no decision.',
    });
    pushDecision(draft, decision);
    linkFindingDecision(draft, ctx, HINDSIGHT_RULE_IDS.resulted, decision, lock.decisionId, lock.ownerSeatId,
      'The process review tracks the decision whose thin process produced a good outcome.');
    addMarker(draft, ctx, {
      id,
      kind: 'resulted',
      key: lock.id,
      lockId: lock.id,
      decisionId: decision.id,
      note: `Successful mistake on ${lock.decisionOn}: coverage ${audit.coverage.pct}%, process ${audit.quality.met}/5, outcome good.`,
    });
    openedN += 1;
    budget.remaining -= 1;
    note(ctx, out, HINDSIGHT_RULE_IDS.resulted, 'created', 'decision', decision.id,
      `A good outcome rested on a thin process (${lock.decisionOn}); one governed process review opened.`);
  }
  return openedN;
}

/* ------------------------------------------------- RULE-HND-03: gap */

function gapPass(draft, ctx, out, conventions, budget) {
  const locks = Array.isArray(draft.decisionLocks) ? draft.decisionLocks : [];
  const reviewOn = addDays(dayKey(ctx.now), 21);
  let openedN = 0;
  for (const lock of locks) {
    if (budget.remaining <= 0) break;
    if (!lock || !lock.id) continue;
    const audit = auditLock(draft, lock, { now: ctx.now, settings: draft.settings || {} });
    if (audit.coverage.refused) continue;
    if (audit.coverage.missedN < conventions.hindsightGapFloor) continue;
    if (audit.coverage.pct >= conventions.hindsightCoveragePct) continue;
    const id = markerId('gap', lock.id);
    if (markersOf(draft).some((marker) => marker && marker.id === id)) continue;
    const decision = decisionRecord(ctx, {
      title: `Decision of ${lock.decisionOn} left knowable facts unconsulted`,
      question: [
        `${audit.coverage.missedN} record(s) already dated on or before ${lock.decisionOn} are now linked to that decision but were not part of the information set it was taken on.`,
        `Consulted ${audit.coverage.knownN} of ${audit.coverage.knowableN} knowable fact(s) — coverage ${audit.coverage.pct}% (95% interval ${audit.coverage.lowPct}–${audit.coverage.highPct}%) against a declared floor of ${conventions.hindsightCoveragePct}%.`,
        'Relevance here is not inferred: these are the records the workspace\'s own typed links tie to the decision afterwards, so the connection was drawn — just not before the call.',
        'What should change: a step that surfaces linked records before a decision is made, a narrower decision frame, or an acceptance that this class of decision is taken on partial information?',
      ].join(' '),
      options: [
        ['Add a pre-decision check for this decision class', 'Turns a repeated omission into a step in the operating cadence.', 'Costs a little time on every decision in the class.'],
        ['Narrow the decision frame', 'A smaller question needs fewer facts, and is often the real repair.', 'May split one decision into two, which changes who owns it.'],
        ['Accept and record the constraint', 'Honest when the facts were not reachable in the time available.', 'An accepted gap must be re-read, not forgotten; the lock keeps the evidence.'],
      ],
      reviewOn,
      rationale: 'RULE-HND-03: the frozen information set covered less than the declared share of the facts already on the record at decision time. One finding per lock; no content is copied into this record.',
    });
    pushDecision(draft, decision);
    linkFindingDecision(draft, ctx, HINDSIGHT_RULE_IDS.gap, decision, lock.decisionId, lock.ownerSeatId,
      'The information-gap finding tracks the decision that left knowable facts unconsulted.');
    addMarker(draft, ctx, {
      id,
      kind: 'gap',
      key: lock.id,
      lockId: lock.id,
      decisionId: decision.id,
      note: `Coverage ${audit.coverage.pct}% on ${lock.decisionOn} (${audit.coverage.missedN} knowable fact(s) unconsulted).`,
    });
    openedN += 1;
    budget.remaining -= 1;
    note(ctx, out, HINDSIGHT_RULE_IDS.gap, 'created', 'decision', decision.id,
      `Coverage ${audit.coverage.pct}% below the declared ${conventions.hindsightCoveragePct}% on ${lock.decisionOn}; one governed process decision opened.`);
  }
  return openedN;
}

/* -------------------------------------------- RULE-HND-04: ungraded */

function ungradedPass(draft, ctx, out, conventions, budget) {
  const locks = Array.isArray(draft.decisionLocks) ? draft.decisionLocks : [];
  const wk = weekKey(ctx.now);
  let openedN = 0;
  for (const lock of locks) {
    if (budget.remaining <= 0) break;
    if (!lock || !lock.id) continue;
    const audit = auditLock(draft, lock, { now: ctx.now, settings: draft.settings || {} });
    if (!audit.overdue) continue;
    const id = markerId('ungraded', `${lock.id}|${wk}`);
    if (markersOf(draft).some((marker) => marker && marker.id === id)) continue;
    const decision = decisionRecord(ctx, {
      title: `Decision of ${lock.decisionOn} is past its review grace and ungraded`,
      question: [
        `This decision was locked with a frozen information set and its own review date of ${lock.reviewOn}; the declared grace of ${conventions.hindsightReviewGraceDays} day(s) has passed and no outcome is recorded.`,
        `A decision nobody grades cannot teach anything, and this workspace cannot tell whether the process that produced it was sound — which means neither can anyone reading it.`,
        'Record the outcome as it stands today, or record why the decision is no longer gradeable. Both are honest; leaving it open is the only option that costs the record.',
      ].join(' '),
      options: [
        ['Record the outcome now', 'Restores the decision to the ledger and makes the quadrant computable.', 'An outcome recorded very late is a weaker reading; the lock keeps the dates, so the delay stays visible.'],
        ['Mark it not gradeable', 'Honest when the effect is inseparable from everything else that changed.', 'Removes it from every rate permanently; that has to be a human decision.'],
      ],
      reviewOn: addDays(dayKey(ctx.now), 14),
      rationale: `RULE-HND-04: a lock dated ${lock.decisionOn} with review date ${lock.reviewOn} is ungraded past the declared grace. One bounded prompt per lock per ISO week.`,
    });
    pushDecision(draft, decision);
    linkFindingDecision(draft, ctx, HINDSIGHT_RULE_IDS.ungraded, decision, lock.decisionId, lock.ownerSeatId,
      'The ungraded-decision prompt tracks the decision it asks to be graded.');
    addMarker(draft, ctx, {
      id,
      kind: 'ungraded',
      key: `${lock.id}|${wk}`,
      lockId: lock.id,
      decisionId: decision.id,
      weekKey: wk,
      note: `Ungraded since review date ${lock.reviewOn}.`,
    });
    openedN += 1;
    budget.remaining -= 1;
    note(ctx, out, HINDSIGHT_RULE_IDS.ungraded, 'created', 'decision', decision.id,
      `An ungraded decision past its grace (${lock.reviewOn}) received one bounded prompt.`);
  }
  return openedN;
}

/* ------------------------------------------------------------------- rule */

export function hindsightRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const explicit = event.type === HINDSIGHT_EVENTS.SCAN;
  const own = event.type.startsWith(HINDSIGHT_TRIGGER_PREFIX);
  const decisionEvent = event.entity === 'decision' || event.type.startsWith('decision.');
  if (!explicit && !own && !decisionEvent) return [];
  const conventions = hindsightConventions(ctx.settings || draft.settings || {});
  if (!explicit && !own && conventions.hindsightAutoPropagate === false) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const runCtx = {
    ...ctx,
    draft,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`),
  };
  const out = [];
  const budget = { remaining: HINDSIGHT_LIMITS.findingsPerPass };
  lockPass(draft, runCtx, out, conventions);
  resultedPass(draft, runCtx, out, conventions, budget);
  gapPass(draft, runCtx, out, conventions, budget);
  ungradedPass(draft, runCtx, out, conventions, budget);
  return out;
}
