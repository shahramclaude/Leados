/**
 * app/core/domain/benchRegressionRules.js — RULE-BRG-01, the Bench-Claim
 * Evidence Regression Watch's two consequences (ADR-0172, Schema v137).
 *
 * THE DUTY. The point-in-time register (ADR-0168) reads a bench claim's
 * evidence correctly and remembers nothing, so a claim that was `corroborated`
 * in June and is `line-unasked` in December — under an unchanged rating — is
 * never flagged as a decay. The duty a director or a VP performs is two dated
 * acts: FREEZE what each window showed while its review completes, and put ONE
 * dated, owned, answerable question in front of the home-line manager when the
 * ground moves under a rating that did not.
 *
 * WHAT THIS RULE DOES, AND NOTHING ELSE
 * -------------------------------------
 *  - It fires on two events and never on a read: a review being completed
 *    (`review.completed`) and an explicit scan (`BENCH_REGRESSION_SCAN_EVENT`).
 *  - FREEZE: for every watched claim about the completed review's person (or
 *    every watched claim on a scan), it appends ONE frozen reading per
 *    (claim, completed review) — the evidence state resolved through the SAME
 *    precedence the register applies, the line counts, the rating at freeze
 *    time, the freeze day. A frozen reading is NEVER rewritten: where one
 *    exists the rule moves on, even if the live state has since matured.
 *    Freezes are BOUNDED per commit; the remainder is COUNTED and retried by
 *    the scan.
 *  - ASK: for every LATEST pair reading `regressed` it issues AT MOST ONE
 *    owned, dated delegation — \"re-ground this bench claim\" — addressed to
 *    the manager holding the person's HOME line as of the LATER window's end
 *    (ADR-0149), with BOTH windows, BOTH states and the unchanged rating
 *    printed in the ask. A home line that is not READABLE issues nothing and
 *    is NOTED under a distinct key that never blocks the ask: when the seat
 *    becomes readable, the scan issues what the pair was owed.
 *  - Older regressed pairs, `rating-moved`, `improved`, `stable`,
 *    `stable-single`, `structure-changed`, `unresolved`, `open` and
 *    `uncomparable` pairs issue NOTHING and are counted. A structural change
 *    is not a decay, an open question is not a silence, and a fresh gap on a
 *    new line is already covered by RULE-BNE-01's own ask — this watch never
 *    asks twice.
 *  - It writes typed provenance only — `concerns` from the person to the ask,
 *    `issues-obligation` from the LATER review to the ask, and `rolls-up-to`
 *    per leadership ancestor in the matrix DAG. No second graph.
 *  - It NEVER edits a readiness rating, a review, a line, a frozen reading or
 *    a succession reading. A human re-grounds a claim; a human answers a line.
 *  - It is IDEMPOTENT through a per-pair marker carrying the pair snapshot,
 *    BOUNDED by a per-transaction cap whose remainder is COUNTED and retried
 *    by the scan, and INERT on every other event. In a single-chain workspace
 *    it freezes history (the baseline a future second line will be read
 *    against) and issues no ask — there is no second line that could decay.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix } from './matrix.js';
import {
  buildBenchRegressionRead,
  consecutiveReviewsFor,
  freezeClaimReading,
  watchedClaimRecords,
} from './benchRegression.js';
import {
  BENCH_REGRESSION_RULE_ID,
  BENCH_REGRESSION_SCAN_EVENT,
  BENCH_REGRESSION_CONVENTIONS,
} from './benchRegressionRegistry.js';

export { BENCH_REGRESSION_RULE_ID, BENCH_REGRESSION_SCAN_EVENT };

const BENCH_REGRESSION_TASK_DAYS = BENCH_REGRESSION_CONVENTIONS.taskDays;
const MAX_FREEZES_PER_COMMIT = 25;
const MAX_OBLIGATIONS_PER_COMMIT = 8;

/** Relations this rule may write. Declared once; nothing else is ever used. */
export const BENCH_REGRESSION_RELATIONS = Object.freeze(['concerns', 'issues-obligation', 'rolls-up-to']);

const TRIGGERS = Object.freeze([
  'review.completed',
  BENCH_REGRESSION_SCAN_EVENT,
]);

function clampStr(value, max = 300) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clampStr(summary, 280);
  out.push({ ruleId: BENCH_REGRESSION_RULE_ID, action, targetType, targetId, summary: clean });
  if (ctx && typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${BENCH_REGRESSION_RULE_ID}] ${clean}`.slice(0, 300),
    });
  }
}

function recordMarker(draft, ctx, entry) {
  if (!Array.isArray(draft.benchRegressionMarkers)) draft.benchRegressionMarkers = [];
  if (draft.benchRegressionMarkers.some((m) => m && m.key === entry.key)) return false;
  draft.benchRegressionMarkers.push({
    kind: entry.kind,
    personId: entry.personId,
    seat: entry.seat,
    prevReviewId: entry.prevReviewId,
    latestReviewId: entry.latestReviewId,
    prevState: entry.prevState,
    latestState: entry.latestState,
    rating: entry.rating,
    taskId: entry.taskId,
    recordedOn: ctx.today,
    ...entry,
  });
  if (draft.benchRegressionMarkers.length > 1200) {
    draft.benchRegressionMarkers = draft.benchRegressionMarkers.slice(-1200);
  }
  return true;
}

function pushTask(draft, ctx, { personId, title, expectedOutcome, support, dueOn }) {
  const taskId = ctx.idFactory('dlg');
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  draft.delegations.unshift({
    id: taskId,
    personId,
    title: title.slice(0, 200),
    expectedOutcome: expectedOutcome.slice(0, 2000),
    authority: 'act-inform',
    support: support.slice(0, 2000),
    delegatedOn: ctx.today,
    dueOn,
    status: 'active',
    checkins: [],
    completedOn: null,
    completionNote: '',
    returnedOn: null,
    returnReason: '',
    createdAt: ctx.nowIso,
    updatedAt: ctx.nowIso,
  });
  return taskId;
}

const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(v).trim().slice(0, 10));

/**
 * Which (claim, review) freezes a given event owes.
 *
 * A completed review freezes every watched claim about its person against
 * itself. A scan backfills every missing freeze in deterministic order. Only
 * pairable reviews (a readable period end) are frozen — a frozen reading no
 * pair could ever read would be a row nobody can audit.
 */
function freezesOwed(draft, event) {
  const owed = [];
  const have = new Set(
    (Array.isArray(draft.benchRegressionReadings) ? draft.benchRegressionReadings : [])
      .filter((r) => r && r.claimId && r.reviewId)
      .map((r) => `${r.claimId}|${r.reviewId}`),
  );
  const { claims } = watchedClaimRecords(draft);
  if (event.type === 'review.completed') {
    const reviewId = typeof event.entityId === 'string' ? event.entityId : '';
    const review = (Array.isArray(draft.reviews) ? draft.reviews : []).find((r) => r && r.id === reviewId) || null;
    if (!review || review.status !== 'complete' || !isDay(review.periodEnd)) return owed;
    for (const { record, claimKey } of claims) {
      if (record.personId !== review.personId) continue;
      if (have.has(`${claimKey}|${review.id}`)) continue;
      owed.push({ record, claimKey, review });
    }
    return owed;
  }
  const reviews = Array.isArray(draft.reviews) ? draft.reviews : [];
  for (const { record, claimKey } of claims) {
    const { ordered } = consecutiveReviewsFor(reviews, record.personId);
    for (const review of ordered) {
      if (have.has(`${claimKey}|${review.id}`)) continue;
      owed.push({ record, claimKey, review });
    }
  }
  return owed;
}

export function benchRegressionRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  if (!TRIGGERS.includes(event.type)) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const today = dayKey(now) || now.toISOString().slice(0, 10);
  const hookCtx = {
    ...ctx,
    now,
    today,
    todayStr: today,
    nowIso: now.toISOString(),
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((p) => `${p}-${Date.now()}`),
  };

  const out = [];

  /* ------------------------------------------------------- 1. freeze first */
  // The comparison below reads the freezes this commit wrote, so the audit
  // column (\"as frozen\") is truthful about what the rule saw when it decided.
  const owed = freezesOwed(draft, event);
  let frozen = 0;
  let deferredFreezes = 0;
  if (!Array.isArray(draft.benchRegressionReadings)) draft.benchRegressionReadings = [];
  for (const { record, claimKey, review } of owed) {
    if (frozen >= MAX_FREEZES_PER_COMMIT) {
      deferredFreezes += 1;
      continue;
    }
    const row = freezeClaimReading(draft, record, review, {
      now,
      settings: draft.settings || {},
      frozenBy: BENCH_REGRESSION_RULE_ID,
    });
    if (!row) continue;
    if (draft.benchRegressionReadings.some((r) => r && r.claimId === claimKey && r.reviewId === review.id)) continue;
    draft.benchRegressionReadings.push(row);
    frozen += 1;
  }

  /* --------------------------------------- 2. compare, then ask once a pair */
  // The reading is recomputed on the WHOLE workspace with the operator view, so
  // the work this rule issues matches what the panel showed the leader,
  // whatever seat pressed the button.
  const fullStateView = { ...draft, settings: { ...(draft.settings || {}), activeSeatId: null } };
  const read = buildBenchRegressionRead(fullStateView, { now, settings: fullStateView.settings });
  let targets = read.rows.filter((r) => r.isLatestPair && r.verdict === 'regressed');
  if (event.type === 'review.completed') {
    const reviewId = typeof event.entityId === 'string' ? event.entityId : '';
    const review = (Array.isArray(draft.reviews) ? draft.reviews : []).find((r) => r && r.id === reviewId) || null;
    // Narrowing here is what keeps the rule from re-reading the whole
    // workspace on every write: a completed review can only regress claims
    // about its own person.
    targets = review ? targets.filter((r) => r.personId === review.personId) : [];
  }

  const matrix = buildMatrix(fullStateView, { now, settings: fullStateView.settings });

  let obligations = 0;
  let deferredByCap = 0;
  let rollupEdges = 0;
  let noHomeSeat = 0;

  for (const row of targets) {
    const markerKey = row.pairKey;
    if (draft.benchRegressionMarkers?.some?.((m) => m && m.key === markerKey)) continue;
    if (obligations >= MAX_OBLIGATIONS_PER_COMMIT) { deferredByCap += 1; continue; }

    // The seat that owns the claim and can re-ground it: the manager holding
    // the HOME line as of the LATER window's end — never today's pointer read
    // back over a period it may not have covered.
    const homeManagerId = row.homeLineKnown ? row.homeLineManagerId : null;
    const homeBasis = row.homeLineState === 'observed'
      ? 'as recorded for that day'
      : 'under a printed presumption that today’s roster pointer held on that day, because the workspace records no home-line history for this person';
    if (!homeManagerId) {
      noHomeSeat += 1;
      // A NOTE, not an ask marker: it never blocks the ask. When the seat
      // becomes readable the scan issues what the pair was owed.
      recordMarker(draft, hookCtx, {
        key: `${markerKey}|no-seat`,
        kind: 'noted',
        personId: row.personId,
        seat: row.seat,
        prevReviewId: row.prevReviewId,
        latestReviewId: row.laterReviewId,
        prevState: row.prevState,
        latestState: row.laterState,
        rating: row.currentRating,
        taskId: '',
        summary: `No readable home line as of ${row.laterWindowEnd}; the regression is reported on the register only and retried by the scan.`,
      });
      continue;
    }

    const dueOn = addDays(today, BENCH_REGRESSION_TASK_DAYS);
    const title = `Re-ground ${row.personName || 'a person'}’s bench claim: its evidence weakened while its rating stood still`;
    const expected = `By ${dueOn}, the manager holding the home line has either obtained the missing observation from the other line(s), or recorded in their own words why the bench claim stands on the evidence it has. `
      + `Previous window ${row.prevWindowStart || '?'}–${row.prevWindowEnd || '?'} (review ${row.prevReviewId}) read ${row.prevState} (frozen ${row.prevFrozenOn || 'on an unknown day'}); `
      + `latest window ${row.laterWindowStart || '?'}–${row.laterWindowEnd || '?'} (review ${row.laterReviewId}) reads ${row.laterState} today${row.laterFrozenState ? ` (as frozen ${row.laterFrozenOn || 'on an unknown day'}: ${row.laterFrozenState})` : ''}. `
      + `Readiness rating ${row.currentRatingLabel || row.currentRating || 'unknown'} then and now. The rating is not changed by this task.`;
    const support = `Issued by ${BENCH_REGRESSION_RULE_ID} because a current bench claim’s evidence weakened between two consecutive review windows while its rating did not move. The home line this ask is addressed to was resolved ${homeBasis}. A decayed evidence state is a gap in the record, not a judgement about the person or the manager who was not asked.`;

    const taskId = pushTask(draft, hookCtx, {
      personId: homeManagerId,
      title,
      expectedOutcome: expected,
      support,
      dueOn,
    });

    // Provenance: the person the claim is about, and the LATER review whose
    // evidence weakened.
    ensureEntityLink(draft, {
      sourceType: 'person', sourceId: row.personId,
      targetType: 'delegation', targetId: taskId,
      relation: 'concerns', ruleId: BENCH_REGRESSION_RULE_ID,
      summary: 'A dated ask about this person’s weakened bench evidence was issued to their home-line manager.',
    }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: hookCtx.nowIso });
    ensureEntityLink(draft, {
      sourceType: 'review', sourceId: row.laterReviewId,
      targetType: 'delegation', targetId: taskId,
      relation: 'issues-obligation', ruleId: BENCH_REGRESSION_RULE_ID,
      summary: 'The review whose evidence weakened against the previous window was issued a dated ask.',
    }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: hookCtx.nowIso });

    // Roll the ask up every leadership ancestor of the holder, so the director
    // above sees the same obligation the manager was given.
    const node = matrix.nodes.get(homeManagerId) || null;
    for (const ancestorId of [...((node && node.ancestors) || [])]) {
      const rolled = ensureEntityLink(draft, {
        sourceType: 'delegation', sourceId: taskId,
        targetType: 'person', targetId: ancestorId,
        relation: 'rolls-up-to', ruleId: BENCH_REGRESSION_RULE_ID,
        summary: 'A bench claim resting on weakened evidence rolls up to this leadership span.',
      }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: hookCtx.nowIso });
      if (rolled.created) rollupEdges += 1;
    }

    recordMarker(draft, hookCtx, {
      key: markerKey,
      kind: 'ask',
      personId: row.personId,
      seat: row.seat,
      prevReviewId: row.prevReviewId,
      latestReviewId: row.laterReviewId,
      prevState: row.prevState,
      latestState: row.laterState,
      rating: row.currentRating,
      taskId,
      summary: `Issued the re-ground ask for a ${row.prevState} → ${row.laterState} regression under an unchanged ${row.currentRating} rating.`,
    });
    obligations += 1;
  }

  if (frozen) {
    noteEffect(hookCtx, out, 'frozen-readings', 'workspace', 'succession',
      `Froze ${frozen} bench-evidence window reading(s); a frozen reading is never rewritten.`);
  }
  if (obligations) {
    noteEffect(hookCtx, out, 'issued-obligations', 'workspace', 'succession',
      `Issued ${obligations} dated bench-regression obligation(s); ${rollupEdges} roll-up edge(s).`);
  }
  if (deferredFreezes || deferredByCap) {
    const parts = [];
    if (deferredFreezes) parts.push(`${deferredFreezes} freeze(s)`);
    if (deferredByCap) parts.push(`${deferredByCap} obligation(s)`);
    noteEffect(hookCtx, out, 'deferred', 'workspace', 'succession',
      `${parts.join(' and ')} deferred by the per-transaction cap and left for the scan.`);
  }
  if (noHomeSeat) {
    noteEffect(hookCtx, out, 'refused-unresolved', 'workspace', 'succession',
      `${noHomeSeat} regressed pair(s) have no readable home line as of their later window, so there is no seat to address the ask to. The regression is reported on the register only and retried by the scan; the note never blocks the ask.`);
  }
  return out;
}
