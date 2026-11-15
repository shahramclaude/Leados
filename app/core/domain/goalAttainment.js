/**
 * app/core/domain/goalAttainment.js — the ONE reader behind the Goal Attainment
 * Period Close & Restatement Register (ADR-0206, Schema v160,
 * `#/matrix?panel=attainment`, CSV scope #149).
 *
 * WHAT IT ANSWERS. *The quarter closed and I reported forty-two objectives: thirty
 * on track, eight at risk, four off track. Three weeks later this screen says
 * twenty-seven on track. Did the portfolio change, or did the record?* Nothing in
 * this workspace could answer that before, because nothing had ever frozen the
 * figure that was reported. Every OKR platform recomputes history silently for
 * exactly that reason — it has no original to compare against.
 *
 * THE TWO CLAIMS, KEPT APART (Bulletproof Reliability Mandate)
 * -----------------------------------------------------------
 *   1. "the buckets add up to the goal count"   → `countsReconcile`, per closure;
 *   2. "the printed figures are the frozen ones" → `verdict`, from a goal-by-goal
 *      comparison against the closing act.
 * A closure that fails (1) prints no figures at all. A closure that fails (2)
 * prints both sets and the exact cause of every movement. Neither fact is ever
 * reported with the other's word.
 *
 * WHY THE SPAN IS READ AS OF THE PERIOD END. A reorganisation in November must
 * not restate September: the September report was true of September's structure.
 * So each goal is counted in its owner's home line AS RECORDED on the period's
 * last day (ADR-0149's ledger), never from today's `managerId`. An edit to the
 * goal's own owner field is a different matter — that changes who the record says
 * owned the goal, so it restates the period and is attributed (`span-moved`).
 *
 * THE MATRIX RULE. One goal is one owner's promise. Counting it once in the home
 * line and never splitting it across a person's additional lines is the only
 * allocation-free reading; splitting would invent an allocation no human agreed
 * to. A multi-line owner is therefore PRINTED and counted, not allocated. Spans
 * nest, so the reader never adds span totals together except over the direct
 * spans it prints, and the closure's own identity is checked instead.
 *
 * Pure module: no DOM, no storage, no wall clock beyond the injected `now`.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildStructureLedger, homeLineOn } from './structureHistory.js';
import {
  GOAL_ATTAINMENT_CSV_COLUMNS,
  GOAL_ATTAINMENT_ENGINE_VERSION,
  GOAL_ATTAINMENT_LIMITS,
  GOAL_ATTAINMENT_BUCKETS,
  GOAL_ATTAINMENT_BUCKET_KEYS,
  GOAL_ATTAINMENT_BUCKET_BY_KEY,
  GOAL_ATTAINMENT_CAUSE_BY_KEY,
  GOAL_ATTAINMENT_CAUSE_KEYS,
  GOAL_ATTAINMENT_VERDICT_BY_KEY,
  GOAL_ATTAINMENT_FRAMEWORKS,
  GOAL_ATTAINMENT_METHOD,
  GOAL_ATTAINMENT_REFUSAL_BY_KEY,
  GOAL_ATTAINMENT_SETTING_KEYS,
} from './goalAttainmentRegistry.js';
import {
  GOAL_ATTAINMENT_OWNERLESS,
  goalAttainmentBucketCounts,
  goalAttainmentDay,
  goalAttainmentInclusiveDays,
  goalAttainmentSignature,
  normalizeGoalAttainmentClosures,
  normalizeGoalAttainmentNotes,
  normalizeGoalAttainmentSettings,
} from './goalAttainmentSchema.js';

const CONFIDENCES = Object.freeze(['on-track', 'at-risk', 'off-track']);
const DAY_OF = (value) => goalAttainmentDay(String(value || '').slice(0, 10));

/**
 * The attainment bucket of one goal at one instant.
 *
 * Dated facts only: a completion date, and the confidence recorded by the last
 * check-in dated on or before the instant. Status is used for `dropped` because
 * this workspace does not date a drop — and that is printed as a limitation: a
 * goal dropped AFTER a close restates the period, which is the honest reading of
 * an undated edit rather than a bug to hide.
 */
export function goalAttainmentBucketAt(goal, asOf) {
  const day = goalAttainmentDay(asOf);
  if (!goal || !day) return 'no-checkin';
  if (goal.status === 'dropped') return 'dropped';
  const completedOn = DAY_OF(goal.completedOn);
  if (completedOn && completedOn <= day) return 'achieved';
  const checkins = Array.isArray(goal.checkins) ? goal.checkins : [];
  let latest = null;
  for (const checkin of checkins) {
    if (!checkin || typeof checkin !== 'object') continue;
    const date = DAY_OF(checkin.date);
    if (!date || date > day) continue;
    if (!latest || date > latest.date || (date === latest.date && String(checkin.id || '') > String(latest.id || ''))) {
      latest = { date, id: checkin.id, confidence: checkin.confidence };
    }
  }
  if (!latest) return 'no-checkin';
  return CONFIDENCES.includes(latest.confidence) ? latest.confidence : 'unknown-confidence';
}

/** The additional reporting lines a person had declared in force on one day. */
function additionalLinesAt(state, personId, homeManagerId, asOf) {
  const currentHomeManagerId = (Array.isArray(state.people) ? state.people : []).find((p) => p && p.id === personId)?.managerId || LEADER_ID;
  return (Array.isArray(state.reportingLines) ? state.reportingLines : []).filter((line) => line
    && line.personId === personId
    && line.managerId
    && line.managerId !== homeManagerId
    && line.managerId !== currentHomeManagerId
    && String(line.fromISO || '') <= asOf
    && (!line.toISO || String(line.toISO) >= asOf)).length;
}

/**
 * Derive one period from the record as it stands.
 *
 * Returns the exact entry set (goal → bucket → span), the bucket counts, the
 * direct-span counts, the ownerless/undated/multi-line/off-roster tallies and the
 * list of goals whose owner has no recorded home line on the period's last day.
 * A goal that is due inside the period but whose owner cannot be placed is NOT
 * silently dropped: `unproven` carries it and the caller refuses the whole
 * period, because an aggregate over the placeable part would read as complete.
 */
export function deriveGoalAttainmentPeriod(state = {}, { from, to } = {}) {
  const periodFrom = goalAttainmentDay(from);
  const periodTo = goalAttainmentDay(to);
  if (!periodFrom || !periodTo || periodTo < periodFrom) {
    return { ok: false, reason: 'The period is not a readable, forward-running inclusive date range.' };
  }
  const ledger = buildStructureLedger(state);
  const goals = Array.isArray(state.goals) ? state.goals : [];
  const entries = [];
  const spans = new Map();
  const unproven = [];
  let ownerlessN = 0;
  let undatedN = 0;
  let multiLineN = 0;
  let offRosterOwnerN = 0;
  let inPeriodN = 0;
  const multiLineOwners = new Set();
  const roster = new Map((Array.isArray(state.people) ? state.people : []).filter((p) => p && p.id).map((p) => [p.id, p]));
  for (const goal of goals) {
    if (!goal || typeof goal !== 'object') continue;
    const due = DAY_OF(goal.dueDate);
    if (!due) { undatedN += 1; continue; }
    if (due < periodFrom || due > periodTo) continue;
    inPeriodN += 1;
    const bucket = goalAttainmentBucketAt(goal, periodTo);
    const ownerId = typeof goal.ownerId === 'string' ? goal.ownerId : null;
    if (!ownerId) {
      ownerlessN += 1;
      entries.push({ goalId: goal.id, bucket, span: GOAL_ATTAINMENT_OWNERLESS });
      continue;
    }
    let spanId = null;
    if (ownerId === LEADER_ID) {
      spanId = LEADER_ID;
    } else {
      const line = homeLineOn(ledger, ownerId, periodTo);
      if (line.state === 'observed') spanId = line.managerId;
    }
    if (!spanId) {
      unproven.push({ goalId: goal.id, ownerId });
      continue;
    }
    // Informational only: this NEVER splits the goal. It is printed so a reader
    // can see that the person worked across more than one line and that the
    // register deliberately did not allocate the objective between them.
    const extra = additionalLinesAt(state, ownerId, spanId, periodTo);
    if (extra > 0) {
      multiLineOwners.add(ownerId);
      multiLineN += 1;
    }
    if (!roster.has(ownerId)) offRosterOwnerN += 1;
    entries.push({ goalId: goal.id, bucket, span: spanId });
    if (!spans.has(spanId)) spans.set(spanId, { key: spanId, goalsN: 0, buckets: goalAttainmentBucketCounts([]) });
    const row = spans.get(spanId);
    row.goalsN += 1;
    row.buckets[bucket] += 1;
  }
  const buckets = goalAttainmentBucketCounts(entries);
  const spanRows = [...spans.values()].sort((a, b) => b.goalsN - a.goalsN || String(a.key).localeCompare(String(b.key)));
  return {
    ok: true,
    periodFrom,
    periodTo,
    periodDays: goalAttainmentInclusiveDays(periodFrom, periodTo),
    entries: entries.slice().sort((a, b) => String(a.goalId).localeCompare(String(b.goalId))),
    buckets,
    spans: spanRows,
    goalsN: entries.length,
    spansN: spanRows.length,
    ownerlessN,
    undatedN,
    multiLineN,
    multiLineOwnersN: multiLineOwners.size,
    offRosterOwnerN,
    inPeriodN,
    unproven,
    reconcile: buckets && GOAL_ATTAINMENT_BUCKET_KEYS.reduce((n, key) => n + buckets[key], 0) === entries.length,
  };
}

/* ------------------------------------------------------------------ readers */

const nameOf = (state, id, settings) => {
  if (!id) return 'Unnamed span';
  if (id === LEADER_ID) return String(settings?.leaderName || '').trim() || 'You (workspace leader)';
  return (Array.isArray(state.people) ? state.people : []).find((p) => p && p.id === id)?.name
    || 'Holder no longer on the roster';
};

/**
 * The live reading of ONE closure: the frozen entries against a fresh derivation
 * of the same period, goal by goal, with the cause of every movement and the
 * fingerprint of the result.
 */
export function readGoalAttainmentClosure(state, closure, { settings = null, notes = [] } = {}) {
  const conv = normalizeGoalAttainmentSettings(settings || state.settings || {});
  const live = deriveGoalAttainmentPeriod(state, { from: closure.periodFrom, to: closure.periodTo });
  const base = {
    closureId: closure.id,
    label: closure.label,
    periodFrom: closure.periodFrom,
    periodTo: closure.periodTo,
    periodDays: closure.periodDays,
    closedOn: closure.closedOn,
    closedById: closure.closedById || null,
    note: closure.note || '',
    frozen: {
      goalsN: closure.goalsN,
      spansN: closure.spansN,
      ownerlessN: closure.ownerlessN,
      multiLineN: closure.multiLineN || 0,
      buckets: closure.buckets,
      engineVersion: closure.engineVersion || '',
    },
    conventions: conv,
  };
  const closureNotes = notes.filter((note) => note.closureId === closure.id);
  if (!live.ok) {
    return {
      ...base,
      verdict: 'unprovable',
      verdictMeta: GOAL_ATTAINMENT_VERDICT_BY_KEY.unprovable,
      reasons: [live.reason || 'The period could not be derived from the record.'],
      causes: Object.fromEntries(GOAL_ATTAINMENT_CAUSE_KEYS.map((key) => [key, 0])),
      causeRows: [],
      spans: [],
      live: null,
      signature: null,
      notes: closureNotes,
      acknowledgingNote: null,
      countsReconcile: closure.goalsN === GOAL_ATTAINMENT_BUCKET_KEYS.reduce((n, key) => n + (closure.buckets[key] || 0), 0),
      figuresComplete: false,
    };
  }
  /* 1. The frozen set and the live set, keyed by goal. */
  const frozenMap = new Map(closure.entries.map((entry) => [entry.goalId, entry]));
  const liveMap = new Map(live.entries.map((entry) => [entry.goalId, entry]));
  const causes = Object.fromEntries(GOAL_ATTAINMENT_CAUSE_KEYS.map((key) => [key, 0]));
  const movedGoals = [];
  for (const [goalId, entry] of frozenMap) {
    const now = liveMap.get(goalId);
    if (!now) { causes.removed += 1; movedGoals.push({ goalId, cause: 'removed', from: entry, to: null }); continue; }
    const bucketMoved = entry.bucket !== now.bucket;
    const spanMoved = entry.span !== now.span;
    if (bucketMoved && spanMoved) { causes['bucket-and-span-changed'] += 1; movedGoals.push({ goalId, cause: 'bucket-and-span-changed', from: entry, to: now }); }
    else if (bucketMoved) { causes['bucket-changed'] += 1; movedGoals.push({ goalId, cause: 'bucket-changed', from: entry, to: now }); }
    else if (spanMoved) { causes['span-moved'] += 1; movedGoals.push({ goalId, cause: 'span-moved', from: entry, to: now }); }
  }
  for (const [goalId, entry] of liveMap) {
    if (frozenMap.has(goalId)) continue;
    causes.added += 1;
    movedGoals.push({ goalId, cause: 'added', from: null, to: entry });
  }
  const restatedGoalsN = GOAL_ATTAINMENT_CAUSE_KEYS.reduce((n, key) => n + causes[key], 0);

  /* 2. The per-span table: frozen against live, for every span either side names. */
  const frozenBySpan = new Map();
  for (const entry of closure.entries) {
    if (!frozenBySpan.has(entry.span)) frozenBySpan.set(entry.span, goalAttainmentBucketCounts([]));
    frozenBySpan.get(entry.span)[entry.bucket] += 1;
  }
  const liveBySpan = new Map();
  for (const entry of live.entries) {
    if (!liveBySpan.has(entry.span)) liveBySpan.set(entry.span, goalAttainmentBucketCounts([]));
    liveBySpan.get(entry.span)[entry.bucket] += 1;
  }
  const spanKeys = [...new Set([...frozenBySpan.keys(), ...liveBySpan.keys()])];
  const spanRows = spanKeys.map((key) => {
    const frozenBuckets = frozenBySpan.get(key) || goalAttainmentBucketCounts([]);
    const liveBuckets = liveBySpan.get(key) || goalAttainmentBucketCounts([]);
    const frozenN = GOAL_ATTAINMENT_BUCKET_KEYS.reduce((n, b) => n + frozenBuckets[b], 0);
    const liveN = GOAL_ATTAINMENT_BUCKET_KEYS.reduce((n, b) => n + liveBuckets[b], 0);
    // A span's FIGURES changed when its count moved OR one of its buckets did: a
    // goal that stayed and changed bucket leaves the count identical, and reading
    // only the count would report a restated period with nothing to attribute.
    const changed = frozenN !== liveN || GOAL_ATTAINMENT_BUCKET_KEYS.some((bucket) => frozenBuckets[bucket] !== liveBuckets[bucket]);
    return {
      key,
      name: key === GOAL_ATTAINMENT_OWNERLESS ? 'No owner (team objective)' : nameOf(state, key, settings),
      ownerless: key === GOAL_ATTAINMENT_OWNERLESS,
      frozenN,
      liveN,
      deltaN: liveN - frozenN,
      frozenBuckets,
      liveBuckets,
      moved: frozenN !== liveN,
      changed,
    };
  }).sort((a, b) => Number(b.changed) - Number(a.changed) || Math.abs(b.deltaN) - Math.abs(a.deltaN) || b.liveN - a.liveN || String(a.key).localeCompare(String(b.key)));
  const restatedSpansN = spanRows.filter((row) => row.changed).length;

  /* 3. The fingerprint of THIS restatement. No person, goal id, title or label. */
  const signatureBase = {
    periodFrom: closure.periodFrom,
    periodTo: closure.periodTo,
    buckets: closure.buckets,
    causes,
    spans: spanRows.map((row) => ({ key: row.key, frozenN: row.frozenN, liveN: row.liveN })),
  };
  const unprovenN = live.unproven.length;
  const countsReconcile = closure.goalsN === GOAL_ATTAINMENT_BUCKET_KEYS.reduce((n, key) => n + (closure.buckets[key] || 0), 0)
    && live.reconcile === true;
  // An unprovable period has no fingerprint: a signature over the part that could
  // be placed would read as a fact about the whole period.
  const signature = restatedGoalsN > 0 && !unprovenN && countsReconcile ? goalAttainmentSignature(signatureBase) : null;
  const acknowledgingNote = signature ? closureNotes.find((note) => note.signature === signature) || null : null;
  const reasons = [];
  if (unprovenN) reasons.push(`${unprovenN} goal(s) due inside ${closure.periodFrom} to ${closure.periodTo} belong to somebody whose home line on ${closure.periodTo} is not recorded. Today's pointer is not evidence about that day, so no restated figure is claimed for this period.`);
  if (!countsReconcile) reasons.push('The frozen bucket counts do not add up to the frozen goal count, or the live derivation does not reconcile. No figure is printed rather than a total that cannot be reproduced.');
  let verdict;
  if (unprovenN || !countsReconcile) verdict = 'unprovable';
  else if (!restatedGoalsN) verdict = 'faithful';
  else verdict = acknowledgingNote ? 'acknowledged' : 'restated';
  const causeRows = GOAL_ATTAINMENT_CAUSE_KEYS
    .map((key) => ({ key, count: causes[key], meta: GOAL_ATTAINMENT_CAUSE_BY_KEY[key] }))
    .filter((row) => row.count > 0);

  return {
    ...base,
    verdict,
    verdictMeta: GOAL_ATTAINMENT_VERDICT_BY_KEY[verdict],
    reasons,
    causes,
    causeRows,
    causedGoalsN: movedGoals.length,
    spans: spanRows,
    live: verdict === 'unprovable' ? null : {
      goalsN: live.goalsN,
      spansN: live.spansN,
      ownerlessN: live.ownerlessN,
      undatedN: live.undatedN,
      multiLineN: live.multiLineN,
      buckets: live.buckets,
      reconcile: live.reconcile,
    },
    signature,
    notes: closureNotes,
    acknowledgingNote,
    countsReconcile,
    figuresComplete: verdict !== 'unprovable',
  };
}

/**
 * The whole register. One reader for the board, the brief, the CSV and the rule.
 */
export function buildGoalAttainment(state = {}, { now = new Date(), settings = null, seat = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at) || new Date().toISOString().slice(0, 10);
  const cfg = settings || state.settings || {};
  const conv = normalizeGoalAttainmentSettings(cfg);
  const warnings = [];
  const closures = normalizeGoalAttainmentClosures(state.goalAttainmentClosures, warnings);
  const notes = normalizeGoalAttainmentNotes(state.goalAttainmentNotes, closures, warnings);
  const operator = !seat || seat.fullAccess === true;
  const detailLevel = operator ? 'full' : (seat.detailLevel || 'span');
  const floorN = Math.max(Number(cfg.seatFloorN) || 3, Number(seat?.disclosure?.floorN) || 0);
  const invalidLedgerN = warnings.length;

  const readings = closures
    .map((closure) => readGoalAttainmentClosure(state, closure, { settings: cfg, notes }))
    .sort((a, b) => String(b.periodTo).localeCompare(String(a.periodTo))
      || String(b.periodFrom).localeCompare(String(a.periodFrom))
      || String(b.closureId).localeCompare(String(a.closureId)));

  /* The seat projection: aggregates for every seat; names and small cells only
     above the disclosure floor and only at full detail. Counts are never zeroed
     to look innocuous — a withheld number prints a dash and its reason. */
  let withheldRows = 0;
  const projected = readings.map((row) => {
    const spans = row.spans.map((span, index) => {
      const code = `S${String(index + 1).padStart(2, '0')}`;
      const withheld = detailLevel !== 'full' && Math.max(span.frozenN, span.liveN) < floorN;
      if (withheld) withheldRows += 1;
      return {
        ...span,
        code,
        name: detailLevel === 'full' ? span.name : null,
        withheld,
        reason: withheld ? `This span carries fewer than ${floorN} goal(s) in the period; the counts are withheld at this seat's disclosure level.` : null,
      };
    });
    return {
      ...row,
      spans: spans.slice(0, GOAL_ATTAINMENT_LIMITS.spanRowsShown),
      spansRemainderN: Math.max(0, spans.length - GOAL_ATTAINMENT_LIMITS.spanRowsShown),
    };
  });
  const shown = projected.slice(0, GOAL_ATTAINMENT_LIMITS.closureRowsShown);
  const totals = {
    closuresN: projected.length,
    shownN: shown.length,
    remainderN: Math.max(0, projected.length - shown.length),
    faithfulN: projected.filter((row) => row.verdict === 'faithful').length,
    restatedN: projected.filter((row) => row.verdict === 'restated').length,
    acknowledgedN: projected.filter((row) => row.verdict === 'acknowledged').length,
    unprovableN: projected.filter((row) => row.verdict === 'unprovable').length,
    goalsN: projected.reduce((n, row) => n + row.frozen.goalsN, 0),
    spansN: projected.reduce((n, row) => n + row.frozen.spansN, 0),
    restatedGoalsN: projected.reduce((n, row) => n + row.causedGoalsN, 0),
    restatedSpansN: projected.reduce((n, row) => n + row.spans.filter((span) => span.changed).length, 0),
    notesN: notes.length,
    unacknowledgedN: projected.filter((row) => row.verdict === 'restated').length,
    withheldRowsN: withheldRows,
  };
  const refusals = [];
  for (const row of projected) {
    for (const reason of row.reasons) refusals.push({ key: row.verdict === 'unprovable' ? 'structure-unproven' : 'not-reconciled', closureId: row.closureId, says: reason });
    if (row.frozen.ownerlessN) refusals.push({ key: 'ownerless', closureId: row.closureId, says: `${row.frozen.ownerlessN} team objective(s) in this period name no owner and are counted apart, never charged to a span.` });
    if (row.frozen.multiLineN) refusals.push({ key: 'multi-line-owner', closureId: row.closureId, says: `${row.frozen.multiLineN} goal(s) in this period belong to somebody who held more than one reporting line on ${row.periodTo}. Each is counted once, in the home line, and never split between lines.` });
    if (row.spansRemainderN) refusals.push({ key: 'truncated', closureId: row.closureId, says: `${row.spansRemainderN} span(s) are not listed on this screen; the closure totals count them.` });
  }
  if (invalidLedgerN) refusals.push({ key: 'invalid-ledger', closureId: null, says: warnings.join(' ') });
  if (withheldRows) refusals.push({ key: 'below-disclosure', closureId: null, says: `${withheldRows} span row(s) sit below the declared floor of ${floorN} and are withheld at this seat's detail level.` });

  return {
    today,
    actorId: operator ? LEADER_ID : (seat?.nodeId || seat?.id || null),
    seat: { operator, detailLevel, floorN },
    conventions: conv,
    closures: shown,
    allClosures: projected,
    totals,
    notes,
    refusals,
    attentionN: totals.unacknowledgedN,
    method: GOAL_ATTAINMENT_METHOD,
    frameworks: GOAL_ATTAINMENT_FRAMEWORKS,
    buckets: GOAL_ATTAINMENT_BUCKETS,
    engineVersion: GOAL_ATTAINMENT_ENGINE_VERSION,
    signingKey: GOAL_ATTAINMENT_SETTING_KEYS,
  };
}

/* ------------------------------------------------------------------- briefs */

/** Identity-free summary text. No span name, no goal id, no person, no label. */
export function goalAttainmentBriefText(report) {
  if (!report) return '';
  const t = report.totals;
  const lines = [
    `Goal attainment period close — ${report.today}`,
    `${t.closuresN} closed period(s): ${t.faithfulN} reproduce exactly, ${t.restatedN} restated without acknowledgement, ${t.acknowledgedN} restated and acknowledged, ${t.unprovableN} cannot be re-derived.`,
    `Across all closures: ${t.goalsN} goal(s) fell due, ${t.spansN} span slice(s), ${t.restatedGoalsN} goal movement(s), ${t.restatedSpansN} span slice(s) moved, ${t.notesN} written acknowledgement(s).`,
  ];
  for (const row of report.closures || []) {
    lines.push(`${row.periodFrom}..${row.periodTo} (closed ${row.closedOn}): ${row.verdict}${row.signature ? ` ${row.signature}` : ''} — frozen ${row.frozen.goalsN} goal(s) over ${row.frozen.spansN} span slice(s)`
      + `${row.live ? `, now ${row.live.goalsN}` : ', live derivation withheld'}`
      + `${row.causeRows.length ? `; ${row.causeRows.map((cause) => `${cause.key} ${cause.count}`).join(', ')}` : ''}.`);
  }
  if (report.refusals.length) lines.push(`Refusals (${report.refusals.length}): ${report.refusals.map((row) => row.key).join(', ')}.`);
  return lines.join('\n');
}

/* --------------------------------------------------------------------- CSV */

/** Aggregate CSV rows. One workspace row, one per closure, one per span slice. */
export function goalAttainmentCsvRows(report) {
  const columns = GOAL_ATTAINMENT_CSV_COLUMNS;
  const blank = () => Object.fromEntries(columns.map((column) => [column, '']));
  const stamp = report?.today || '';
  const complete = report && report.totals.unprovableN === 0;
  const reasons = report ? report.refusals.map((row) => row.key).join('; ') : 'The register could not be read.';
  const workspace = blank();
  Object.assign(workspace, {
    row_type: 'workspace', key: 'workspace', generated_on: stamp,
    closures_n: report?.totals.closuresN ?? '',
    faithful_n: report?.totals.faithfulN ?? '',
    restated_n: report?.totals.restatedN ?? '',
    acknowledged_n: report?.totals.acknowledgedN ?? '',
    unprovable_n: report?.totals.unprovableN ?? '',
    spans_n: report?.totals.spansN ?? '',
    goals_n: report?.totals.goalsN ?? '',
    restated_spans_n: report?.totals.restatedSpansN ?? '',
    restated_goals_n: report?.totals.restatedGoalsN ?? '',
    notes_n: report?.totals.notesN ?? '',
    unacknowledged_n: report?.totals.unacknowledgedN ?? '',
    ask_due_days: report?.conventions?.goalAttainmentAskDueDays ?? '',
    counts_reconcile: report ? 'yes' : '',
    figures_complete: report ? (complete ? 'yes' : 'NO') : '',
    claim_reason: report ? (complete ? '' : reasons) : reasons,
    engine_version: GOAL_ATTAINMENT_ENGINE_VERSION,
  });
  const rows = [workspace];
  let index = 0;
  for (const closure of report?.closures || []) {
    index += 1;
    const key = `C${String(index).padStart(2, '0')}`;
    const row = blank();
    Object.assign(row, {
      row_type: 'closure', key, period_from: closure.periodFrom, period_to: closure.periodTo, generated_on: stamp,
      spans_n: closure.frozen.spansN,
      goals_n: closure.frozen.goalsN,
      ownerless_n: closure.frozen.ownerlessN,
      multi_line_n: closure.frozen.multiLineN,
      achieved_n: closure.frozen.buckets.achieved,
      on_track_n: closure.frozen.buckets['on-track'],
      at_risk_n: closure.frozen.buckets['at-risk'],
      off_track_n: closure.frozen.buckets['off-track'],
      no_checkin_n: closure.frozen.buckets['no-checkin'],
      unknown_confidence_n: closure.frozen.buckets['unknown-confidence'],
      dropped_n: closure.frozen.buckets.dropped,
      restated_spans_n: closure.verdict === 'unprovable' ? '' : closure.spans.filter((span) => span.changed).length,
      restated_goals_n: closure.verdict === 'unprovable' ? '' : closure.causedGoalsN,
      added_n: closure.verdict === 'unprovable' ? '' : closure.causes.added,
      removed_n: closure.verdict === 'unprovable' ? '' : closure.causes.removed,
      bucket_changed_n: closure.verdict === 'unprovable' ? '' : closure.causes['bucket-changed'],
      span_moved_n: closure.verdict === 'unprovable' ? '' : closure.causes['span-moved'],
      bucket_and_span_changed_n: closure.verdict === 'unprovable' ? '' : closure.causes['bucket-and-span-changed'],
      notes_n: closure.notes.length,
      unacknowledged_n: closure.verdict === 'restated' ? 1 : 0,
      counts_reconcile: closure.countsReconcile ? 'yes' : 'NO',
      figures_complete: closure.figuresComplete ? 'yes' : 'NO',
      claim_reason: closure.verdict === 'unprovable' ? closure.reasons.join(' ') : (closure.verdict === 'restated' ? 'The period no longer reproduces and no acknowledgement is on the record.' : ''),
      ask_due_days: report?.conventions?.goalAttainmentAskDueDays ?? '',
      engine_version: GOAL_ATTAINMENT_ENGINE_VERSION,
    });
    rows.push(row);
    for (const span of closure.spans) {
      const spanRow = blank();
      Object.assign(spanRow, {
        row_type: 'span', key: span.code, period_from: closure.periodFrom, period_to: closure.periodTo, generated_on: stamp,
        frozen_n: span.withheld ? '' : span.frozenN,
        live_n: span.withheld ? '' : span.liveN,
        delta_n: span.withheld ? '' : span.deltaN,
        claim_reason: span.withheld ? span.reason : '',
        engine_version: GOAL_ATTAINMENT_ENGINE_VERSION,
      });
      rows.push(spanRow);
    }
  }
  return rows;
}

/** Nothing unacknowledged and nothing unprovable. */
export function goalAttainmentAttentionCount(state = {}, { now = new Date(), settings = null } = {}) {
  const report = buildGoalAttainment(state, { now, settings });
  return report.totals.unacknowledgedN;
}

/** The refusal vocabulary, exported so the panel can print it verbatim. */
export const GOAL_ATTAINMENT_REFUSAL_TEXT = GOAL_ATTAINMENT_REFUSAL_BY_KEY;
