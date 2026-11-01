/**
 * The Coupling Ledger's three post-commit rules (Schema v78).
 *
 * RULE-CPL-01  a frozen coupling review maps to every member call it audited
 *              with a `calibrates-coupling` edge and to every shared premise
 *              the graph named with a `measures-coupling` edge; when a band's
 *              declaration was contradicted and the finding does not flip
 *              between the two rank mappings, it opens exactly one owned
 *              reconciliation task. It never changes a declared ρ.
 * RULE-CPL-02  an explicit scan opens due grading work, and turns a frozen
 *              review carrying a contradicted declaration into ONE governed
 *              re-declaration decision per ISO week. The options are printed;
 *              the leader chooses.
 * RULE-CPL-03  when the leader declares a new ρ into a band whose standing
 *              review disagrees with it, the frozen review receives an
 *              appended challenge note (its figures are never rewritten) and
 *              exactly one calibration task is opened per band per ISO week.
 *              The declaration itself is accepted as declared — this module
 *              comments, it does not correct.
 *
 * All three are marker-idempotent, write inside the caller's transaction, and
 * never rate a person.
 */

import { addDays, dayKey, weekKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import {
  COUPLING_BANDS,
  COUPLING_LEDGER_EVENTS,
  COUPLING_LEDGER_RULE_IDS,
  bandFor,
  couplingLedgerConventions,
} from './couplingLedger.js';

const MARKER_CAP = 400;

function ownerOf(draft) {
  const people = Array.isArray(draft.people) ? draft.people : [];
  const ids = new Set(people.map((p) => p && p.id).filter(Boolean));
  return people.find((p) => p && p.status !== 'archived' && (!p.managerId || !ids.has(p.managerId))) || null;
}

function markerStore(draft) {
  if (!Array.isArray(draft.couplingMarkers)) draft.couplingMarkers = [];
  return draft.couplingMarkers;
}

function addMarker(draft, tag) {
  const markers = markerStore(draft);
  if (markers.includes(tag)) return false;
  markers.push(tag);
  if (markers.length > MARKER_CAP) markers.splice(0, markers.length - MARKER_CAP);
  return true;
}

const seen = (draft, tag) => markerStore(draft).includes(tag);

function effect(ruleId, action, targetType, targetId, summary) {
  return { ruleId, action, targetType, targetId, summary };
}

function link(draft, ctx, sourceId, targetType, targetId, relation, ruleId, summary) {
  return ensureEntityLink(draft, {
    sourceType: 'couplingreview', sourceId, targetType, targetId, relation, ruleId, summary,
  }, {
    idFactory: ctx.idFactory,
    todayStr: dayKey(ctx.now),
    nowIso: ctx.now.toISOString(),
  }).created;
}

function newTask(ctx, ownerId, title, outcome, support, tag, dueDays = 10) {
  return {
    id: ctx.idFactory('delegation'),
    personId: ownerId,
    title: title.slice(0, 200),
    expectedOutcome: outcome.slice(0, 2000),
    authority: 'act-inform',
    support: `${support.slice(0, 1800)} [${tag}]`,
    delegatedOn: dayKey(ctx.now),
    dueOn: dayKey(addDays(ctx.now, dueDays)),
    status: 'active',
    checkins: [],
    completedOn: null,
    completionNote: '',
    returnedOn: null,
    returnReason: '',
    createdAt: ctx.now.toISOString(),
    updatedAt: ctx.now.toISOString(),
  };
}

function newReconcileDecision(ctx, ownerName, review, band) {
  const direction = band.assessment === 'over-declared'
    ? `you declared ρ ${band.declaredMidRho} and the record found no co-movement`
    : `you declared ρ ${band.declaredMidRho} and the record found co-movement at lift ${band.lift}`;
  return {
    id: ctx.idFactory('dec'),
    title: 'Reconcile a declared correlation the record contradicts',
    question: `The Coupling Ledger audited ${band.testablePairs} resolved pair(s) in the "${band.label}" band and found ${band.collisions} coincidence(s) against ${band.expectedCollisions} expected under independent timing (lift ${band.lift ?? '—'}, p ${band.pValue ?? '—'} over ${band.rotations} rotations): ${direction}. Two of those calls resolved inside the same ${review.blockDays}-day block in ${band.observedCollisionPct}% of testable pairs, where the declared ρ implies about ${band.modelCollisionPct}%. Which is true: the declaration was too strong, the block convention is wrong for this kind of call, or the calls were coupled in a way that only shows up outside resolution timing? Recording the answer is what makes the next declaration credible — the frozen figures are never rewritten by this rule.`,
    date: dayKey(ctx.now),
    reversibility: 'reversible',
    driver: ownerName.slice(0, 120),
    approver: ownerName.slice(0, 120),
    contributors: '',
    informed: '',
    options: [
      { id: ctx.idFactory('opt'), label: 'Re-declare the band honestly and re-price the book', pros: 'The Portfolio tab then quotes a tail under a number the record supports.', cons: 'The re-declared ρ changes the tail figure the leader has already seen.' },
      { id: ctx.idFactory('opt'), label: 'Keep the declaration and record why the record cannot see it', pros: 'Declarations stay the leader’s judgement, which is the module’s stated principle.', cons: 'The ledger will keep reporting the contradiction until its own record changes.' },
      { id: ctx.idFactory('opt'), label: 'Change the block convention and re-audit', pros: 'If a 30-day block is the wrong grain for these calls, resolution timing may be the wrong proxy.', cons: 'A convention chosen after seeing the answer is not a test of anything.' },
    ],
    chosen: '',
    rationale: `Opened by ${COUPLING_LEDGER_RULE_IDS.FROZEN} on frozen coupling review ${review.id}. Nothing is re-declared or re-priced by this rule; the choice is the leader's.`,
    reviewOn: dayKey(addDays(ctx.now, 7)),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    decidedOn: null,
    createdAt: ctx.now.toISOString(),
  };
}

/* ---------------------------------------------------------------- CPL-01 */

function frozenRule(draft, ctx) {
  const review = (draft.couplingReviews || []).find((r) => r && r.id === ctx.event?.entityId);
  if (!review) return [];
  const effects = [];
  const decisionIds = new Set((draft.decisions || []).map((d) => d && d.id));

  for (const memberId of review.memberIds || []) {
    if (!decisionIds.has(memberId)) continue;
    const tag = `${COUPLING_LEDGER_RULE_IDS.FROZEN}:member:${review.id}:${memberId}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);
    if (link(draft, ctx, review.id, 'decision', memberId, 'calibrates-coupling',
      COUPLING_LEDGER_RULE_IDS.FROZEN,
      'Frozen coupling review auditing how this call’s resolution coincided with its declared partner')) {
      effects.push(effect(COUPLING_LEDGER_RULE_IDS.FROZEN, 'linked', 'decision', memberId,
        'Mapped one frozen coupling review to a member call.'));
    }
  }

  for (const premiseId of review.stressedPremiseIds || []) {
    if (!(draft.premises || []).some((p) => p && p.id === premiseId)) continue;
    const tag = `${COUPLING_LEDGER_RULE_IDS.FROZEN}:premise:${review.id}:${premiseId}`;
    if (seen(draft, tag)) continue;
    addMarker(draft, tag);
    if (link(draft, ctx, review.id, 'premise', premiseId, 'measures-coupling',
      COUPLING_LEDGER_RULE_IDS.FROZEN,
      'Shared premise the coupling graph used to nominate this pair')) {
      effects.push(effect(COUPLING_LEDGER_RULE_IDS.FROZEN, 'linked', 'premise', premiseId,
        'Linked a frozen coupling review to a shared premise.'));
    }
  }

  // Exactly one reconciliation task, and only when the contradiction survives
  // both rank mappings. A mapping-dependent finding is not a finding.
  const contradicted = (review.bands || []).filter((band) => band
    && (band.contradiction === true
      || band.assessment === 'over-declared'
      || band.assessment === 'under-declared'
      || band.assessment === 'overstated')
    && band.verdict !== 'unresolved');
  if (!contradicted.length) return effects;
  const owner = ownerOf(draft);
  if (!owner) return effects;
  const tag = `${COUPLING_LEDGER_RULE_IDS.FROZEN}:task:${review.id}`;
  if (seen(draft, tag)) return effects;
  addMarker(draft, tag);
  const band = contradicted[0];
  const task = newTask(ctx, owner.id,
    `Reconcile the "${band.label}" correlation against your own record`,
    `You declared ρ ${band.declaredMidRho} for ${band.pairs} pair(s). ${band.testablePairs} of them resolved with a dated decision in both calls: ${band.collisions} resolved inside the same ${review.blockDays}-day block, against ${band.expectedCollisions} expected under independent timing (lift ${band.lift}, p ${band.pValue} over ${band.rotations} rotations). Verdict: ${band.verdict} — ${band.assessment}. Decide whether to re-declare, keep the declaration with a recorded reason, or change the block convention, and write which. The ledger never rewrites a declaration itself.`,
    `${COUPLING_LEDGER_RULE_IDS.FROZEN}: the record comments on a declaration; the leader owns the number.`,
    tag, 12);
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  draft.delegations.unshift(task);
  effects.push(effect(COUPLING_LEDGER_RULE_IDS.FROZEN, 'created', 'delegation', task.id,
    `Opened one reconciliation task on a ${band.assessment.replace('-', ' ')} declaration.`));
  if (link(draft, ctx, review.id, 'delegation', task.id, 'tracks-followup',
    COUPLING_LEDGER_RULE_IDS.FROZEN, 'Leader-owned reconciliation of a contradicted declaration')) {
    effects.push(effect(COUPLING_LEDGER_RULE_IDS.FROZEN, 'linked', 'delegation', task.id,
      'Linked the reconciliation task to the frozen review.'));
  }
  return effects;
}

/* ---------------------------------------------------------------- CPL-02 */

function scanRule(draft, ctx) {
  const effects = [];
  const today = dayKey(ctx.now);
  const reviews = Array.isArray(draft.couplingReviews) ? draft.couplingReviews : [];
  const expired = reviews.filter((record) => record && !record.graded && record.reviewOn && record.reviewOn < today);
  const owner = ownerOf(draft);
  if (expired.length && owner) {
    const gradeTag = `${COUPLING_LEDGER_RULE_IDS.SCAN}:grade:${expired[0].id}`;
    if (!seen(draft, gradeTag)) {
      addMarker(draft, gradeTag);
      const task = newTask(ctx, owner.id,
        'Grade the overdue coupling review',
        `${expired.length} frozen coupling review(s) passed their window ungraded (the oldest closed ${expired[expired.length - 1].reviewOn}). Grading one writes the outcome and the Brier loss exactly once, from the recorded decision dates. A ledger whose own forecasts are never scored cannot tell a leader anything about their judgement.`,
        `${COUPLING_LEDGER_RULE_IDS.SCAN}: frozen probabilities are scored once, later.`,
        gradeTag, 5);
      draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
      draft.delegations.unshift(task);
      effects.push(effect(COUPLING_LEDGER_RULE_IDS.SCAN, 'created', 'delegation', task.id,
        'Opened one task to grade an overdue coupling review.'));
    }
  }

  const contradictedReview = reviews
    .slice()
    .sort((a, b) => String(b.frozenAt || '').localeCompare(String(a.frozenAt || '')))
    .find((record) => (record.bands || []).some((band) => band
      && (band.contradiction === true || band.assessment === 'over-declared'
        || band.assessment === 'under-declared' || band.assessment === 'overstated')));
  if (!contradictedReview) return effects;
  const band = contradictedReview.bands.find((row) => row
    && (row.contradiction === true || row.assessment === 'over-declared'
      || row.assessment === 'under-declared' || row.assessment === 'overstated'));
  const week = weekKey(ctx.now) || today;
  const tag = `${COUPLING_LEDGER_RULE_IDS.SCAN}:decision:${week}`;
  if (seen(draft, tag)) return effects;
  if (!owner) return effects;
  addMarker(draft, tag);
  const decision = newReconcileDecision(ctx, owner.name || draft.settings?.leaderName || '',
    contradictedReview, band);
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.unshift(decision);
  effects.push(effect(COUPLING_LEDGER_RULE_IDS.SCAN, 'created', 'decision', decision.id,
    'Opened one re-declaration decision from a contradicted frozen review.'));
  if (link(draft, ctx, contradictedReview.id, 'decision', decision.id, 'surfaces-impact',
    COUPLING_LEDGER_RULE_IDS.SCAN, 'Contradicted declaration surfaced as a governed choice')) {
    effects.push(effect(COUPLING_LEDGER_RULE_IDS.SCAN, 'linked', 'decision', decision.id,
      'Linked the frozen review to the re-declaration decision.'));
  }
  return effects;
}

/* ---------------------------------------------------------------- CPL-03 */

const DECLARATION_EVENT = 'deferralPortfolio.declared';

function declarationRule(draft, ctx) {
  const reviews = (Array.isArray(draft.couplingReviews) ? draft.couplingReviews : [])
    .slice()
    .sort((a, b) => String(b.frozenAt || '').localeCompare(String(a.frozenAt || '')));
  const latest = reviews[0];
  if (!latest) return [];
  const declarations = Array.isArray(draft.correlationDeclarations) ? draft.correlationDeclarations : [];
  if (!declarations.length) return [];
  // The event carries no entity id (a workspace-level declaration), so the
  // newest declaration by `declaredAt` is the one that just landed.
  const newest = declarations
    .slice()
    .sort((a, b) => String(b.declaredAt || '').localeCompare(String(a.declaredAt || '')))[0];
  if (!newest || typeof newest.rho !== 'number') return [];
  const bandKey = bandFor(newest.rho)?.key || null;
  if (!bandKey) return [];
  const standing = (latest.bands || []).find((band) => band.key === bandKey);
  if (!standing) return [];
  if (standing.contradiction !== true
    && standing.assessment !== 'over-declared'
    && standing.assessment !== 'under-declared'
    && standing.assessment !== 'overstated') return [];

  const effects = [];
  const today = dayKey(ctx.now);
  const noteTag = `${COUPLING_LEDGER_RULE_IDS.DECLARED}:note:${latest.id}:${bandKey}`;
  if (!seen(draft, noteTag)) {
    addMarker(draft, noteTag);
    if (!Array.isArray(latest.challengeNotes)) latest.challengeNotes = [];
    latest.challengeNotes.push(`Challenged ${today}: a new ρ ${newest.rho} was declared into the "${standing.label}" band, where the frozen review found ${standing.verdict} (lift ${standing.lift}, p ${standing.pValue}). The frozen figures stand as history. [${noteTag}]`);
    if (latest.challengeNotes.length > 8) {
      latest.challengeNotes.splice(0, latest.challengeNotes.length - 8);
    }
    effects.push(effect(COUPLING_LEDGER_RULE_IDS.DECLARED, 'challenged', 'couplingreview', latest.id,
      'Appended a challenge note to a frozen review; no figure was rewritten.'));
  }

  const owner = ownerOf(draft);
  if (!owner) return effects;
  const week = weekKey(ctx.now) || today;
  const taskTag = `${COUPLING_LEDGER_RULE_IDS.DECLARED}:task:${bandKey}:${week}`;
  if (seen(draft, taskTag)) return effects;
  addMarker(draft, taskTag);
  const task = newTask(ctx, owner.id,
    `A new declaration lands in a band your record contradicts`,
    `You declared ρ ${newest.rho}. Your frozen coupling review already measured this band as ${standing.verdict}: ${standing.collisions} coincidence(s) across ${standing.testablePairs} testable pair(s) against ${standing.expectedCollisions} expected (lift ${standing.lift}, p ${standing.pValue}). The declaration is accepted exactly as declared — this task exists so the leader knows which number the record disagrees with before quoting the tail that depends on it.`,
    `${COUPLING_LEDGER_RULE_IDS.DECLARED}: comment, never correct.`,
    taskTag, 7);
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  draft.delegations.unshift(task);
  effects.push(effect(COUPLING_LEDGER_RULE_IDS.DECLARED, 'created', 'delegation', task.id,
    `Opened one advisory task for a declaration into a contradicted band.`));
  return effects;
}

/* ---------------------------------------------------------------- engine */

export { COUPLING_LEDGER_EVENTS, COUPLING_LEDGER_RULE_IDS };

export function couplingLedgerRule(draft, ctx = {}) {
  if (!draft || !ctx.event) return [];
  const conventions = couplingLedgerConventions(ctx.settings || draft.settings || {});
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const scoped = { ...ctx, now };
  let effects = [];
  const type = ctx.event.type;
  if (type === COUPLING_LEDGER_EVENTS.FROZEN) {
    if (!conventions.autoPropagate) return [];
    effects = frozenRule(draft, scoped);
  } else if (type === COUPLING_LEDGER_EVENTS.SCAN) {
    effects = scanRule(draft, scoped);
  } else if (type === DECLARATION_EVENT) {
    if (!conventions.autoPropagate) return [];
    effects = declarationRule(draft, scoped);
  }
  // ONE timeline event per rule run, not one per effect. A frozen review writes
  // dozens of typed edges, and logging each of them as its own event pushed the
  // 600-entry event log's older entries — including the derived lifecycle events
  // other suites assert on — straight out of the history. The per-effect list
  // below is the propagation ledger's business; the timeline gets a summary.
  if (effects.length && typeof ctx.logEvent === 'function') {
    const links = effects.filter((entry) => entry.action === 'linked').length;
    const decisions = effects.filter((entry) => entry.targetType === 'decision').length;
    const tasks = effects.filter((entry) => entry.targetType === 'delegation').length;
    const parts = [];
    if (links) parts.push(`${links} typed edge(s)`);
    if (decisions) parts.push(`${decisions} decision(s)`);
    if (tasks) parts.push(`${tasks} task(s)`);
    ctx.logEvent({
      type: 'automation.propagated',
      entity: 'couplingreview',
      entityId: ctx.event?.entityId || '',
      summary: `Coupling Ledger: ${parts.join(', ')}`.slice(0, 300),
    });
  }
  for (const entry of effects) {
    if (Array.isArray(ctx.out)) ctx.out.push(entry);
  }
  return effects;
}

couplingLedgerRule.id = 'couplingLedger';
couplingLedgerRule.label = 'Coupling ledger propagation (RULE-CPL-01..03)';
couplingLedgerRule.module = 'couplingLedgerRules.js';
couplingLedgerRule.triggers = [
  ...Object.values(COUPLING_LEDGER_EVENTS),
  DECLARATION_EVENT,
];
couplingLedgerRule.effect = (draft, event, context = {}) => couplingLedgerRule(draft, { ...context, event });
Object.freeze(couplingLedgerRule);

export { COUPLING_BANDS };
