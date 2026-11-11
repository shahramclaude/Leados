/**
 * app/core/domain/matrixRemedy.js — the Matrix Pattern Repair Register's pure
 * read model (ADR-0175, Schema v139, `#/matrix?panel=remedies`, CSV scope #129).
 *
 * THE QUESTION
 * ------------
 * ADR-0146 tells an executive which structural signature keeps recurring: the
 * same finding kind, the same line kinds in force and the same affected rights,
 * across distinct decisions. It does not ask whether anyone OWNS that pattern,
 * whether a dated remedy was chosen, or whether the decisions afterwards show a
 * change. This module joins the recurring patterns to the remedy records and
 * asks, on a fixed review date, what the record can and cannot say.
 *
 * WHAT IS RE-DERIVED, NEVER STORED
 * --------------------------------
 *  - The recurring patterns come from `buildRightsConcordance` (ADR-0145/0146),
 *    seat-scoped exactly as the concordance scopes them.
 *  - The baseline count, the review-window count and the verdict are computed
 *    here from the dated decisions on every read. A stored verdict would be the
 *    drift the Bulletproof Reliability Mandate forbids.
 *
 * WHAT THIS MODULE MAY NEVER DO
 * -----------------------------
 *  - It never infers a remedy, an owner or an effect. A pattern with no remedy
 *    is counted as unaddressed and printed as such.
 *  - It never prints a verdict before the review date, and never a verdict
 *    without a baseline and enough audited decisions in the review window. The
 *    refusal and its reason are printed in place of the verdict.
 *  - It never rates or scores a person. The owner's name is printed only where
 *    the acting seat reaches that person; otherwise the row says so.
 *  - It never treats a missing figure as zero. Every identity it claims is
 *    checked and reported as a boolean, and a failed identity is printed.
 *
 * Pure module: no DOM, storage or implicit clock beyond the injected `now`.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildSeats, activeSeat } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import { buildRightsConcordance } from './rightsConcordance.js';
import { normalizeMatrixRemedy } from './matrixRemedySchema.js';
import {
  MATRIX_REMEDY_ENGINE_VERSION,
  MATRIX_REMEDY_FINDING_LABELS,
  MATRIX_REMEDY_FRAMEWORKS,
  MATRIX_REMEDY_LIMITS,
  MATRIX_REMEDY_METHOD,
  MATRIX_REMEDY_REFUSALS,
  MATRIX_REMEDY_STATE_LABELS,
  MATRIX_REMEDY_VERDICT_KEYS,
  MATRIX_REMEDY_VERDICT_LABELS,
  MATRIX_REMEDY_VERDICTS,
} from './matrixRemedyRegistry.js';

/** The same recurrence convention ADR-0146 uses: two or more distinct decisions. */
export const MATRIX_REMEDY_RECURRING_MIN_DECISIONS = 2;

const DAY_MS = 86400000;
const isoPlus = (iso, n) => new Date(Date.parse(`${iso}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) / DAY_MS);

/**
 * The verdict for one remedy, from counts that were already computed. Pure and
 * exported so the rule can be tested in isolation against the printed text.
 */
export function remedyVerdict({ today, reviewOn, duplicate, baselineN, reviewAuditedN, afterN }) {
  if (duplicate) return { key: 'refused', reason: MATRIX_REMEDY_REFUSALS.duplicateActive };
  if (today < reviewOn) return { key: 'pending', reason: null };
  if (baselineN < MATRIX_REMEDY_LIMITS.baselineMinDecisions) return { key: 'refused', reason: MATRIX_REMEDY_REFUSALS.noBaseline };
  if (reviewAuditedN < MATRIX_REMEDY_LIMITS.reviewMinAuditedDecisions) return { key: 'refused', reason: MATRIX_REMEDY_REFUSALS.thinReview };
  if (afterN === 0) return { key: 'cleared', reason: null };
  if (afterN < baselineN) return { key: 'reduced', reason: null };
  return { key: 'unchanged', reason: null };
}

export function buildMatrixRemedyReport(state, { now = new Date(), settings = null } = {}) {
  const eff = settings || state?.settings || null;
  const today = dayKey(now);

  /* The acting seat and its scope, computed exactly as the matrix report and
     the concordance compute them, and passed INTO the concordance so the
     remedy reading and the pattern reading cannot disagree about scope. */
  const lineScope = matrixLineScopeFor(state, { now, settings: eff });
  const built = buildSeats(state, { now, settings: eff, lineScope });
  const seat = activeSeat(built);
  const scopeSet = seat?.fullAccess ? null : new Set([...(seat?.scope || []), ...(seat?.lineScope || [])]);
  const inScope = (id) => !scopeSet || scopeSet.has(id);

  const concordance = buildRightsConcordance(state, { now, settings: eff, seat, scope: scopeSet });

  const leaderName = built.chain?.nodes?.get(LEADER_ID)?.name || 'You';
  const roster = new Map(
    (Array.isArray(state?.people) ? state.people : [])
      .filter((p) => p && p.status !== 'archived' && typeof p.id === 'string')
      .map((p) => [p.id, p]),
  );
  const nameOf = (id) => (id === LEADER_ID ? leaderName : roster.get(id)?.name || null);
  const ownerExists = (id) => id === LEADER_ID || roster.has(id);

  /* Stored remedies, normalised again so this read is fail-closed on its own. */
  const remedies = [];
  const seenIds = new Set();
  let invalidRemedyN = 0;
  for (const raw of Array.isArray(state?.matrixRemedies) ? state.matrixRemedies : []) {
    const row = normalizeMatrixRemedy(raw);
    if (!row || seenIds.has(row.id)) { invalidRemedyN += 1; continue; }
    seenIds.add(row.id);
    remedies.push(row);
  }

  const auditedDates = Array.isArray(concordance.decisions?.auditedDates) ? concordance.decisions.auditedDates : [];
  const recurring = (concordance.recurrence?.signatures || [])
    .filter((s) => s.decisionN >= MATRIX_REMEDY_RECURRING_MIN_DECISIONS);

  const patterns = recurring.map((sig) => {
    const active = remedies.filter((r) => r.signatureKey === sig.signatureKey);
    const remedy = active.length === 1 ? active[0] : null;
    const duplicate = active.length > 1;
    const base = {
      signatureKey: sig.signatureKey,
      kind: sig.kind,
      findingLabel: MATRIX_REMEDY_FINDING_LABELS[sig.kind] || sig.kind,
      lineKinds: sig.lineKinds,
      rightKeys: sig.rightKeys,
      decisionsN: sig.decisionN,
      remedyState: active.length ? 'remedied' : 'unaddressed',
      remedyStateLabel: MATRIX_REMEDY_STATE_LABELS[active.length ? 'remedied' : 'unaddressed'],
      remedyId: remedy?.id || null,
      duplicateRemedyN: active.length > 1 ? active.length : 0,
    };
    if (!remedy && !duplicate) {
      return { ...base, ownerId: null, ownerName: null, ownerWithheld: false, ownerMissing: false,
        decidedOn: null, reviewOn: null, reviewDue: false,
        baselineDecisionsN: null, afterDecisionsN: null, reviewWindowAuditedN: null,
        verdict: null, verdictLabel: null, verdictReason: null };
    }
    /* A duplicate carries no single owner or window to read against. */
    if (duplicate) {
      return { ...base, ownerId: null, ownerName: null, ownerWithheld: false, ownerMissing: false,
        decidedOn: null, reviewOn: null, reviewDue: false,
        baselineDecisionsN: null, afterDecisionsN: null, reviewWindowAuditedN: null,
        verdict: 'refused', verdictLabel: MATRIX_REMEDY_VERDICT_LABELS.refused, verdictReason: MATRIX_REMEDY_REFUSALS.duplicateActive };
    }
    /* Equal-length, disjoint windows (ADR-0175 method): the baseline is the
       L days ending on the remedy day (inclusive); the review window is the L
       days after it, inclusive of the review date. */
    const windowDays = dayDiff(remedy.decidedOn, remedy.reviewOn);
    const baselineStart = isoPlus(remedy.decidedOn, -windowDays);
    const baselineN = sig.decidedOns.filter((d) => d >= baselineStart && d <= remedy.decidedOn).length;
    const afterN = sig.decidedOns.filter((d) => d > remedy.decidedOn && d <= remedy.reviewOn).length;
    const reviewAuditedN = auditedDates.filter((d) => d > remedy.decidedOn && d <= remedy.reviewOn).length;
    const v = remedyVerdict({ today, reviewOn: remedy.reviewOn, duplicate: false, baselineN, reviewAuditedN, afterN });
    const reviewDue = today >= remedy.reviewOn;
    const ownerMissing = !ownerExists(remedy.ownerId);
    const ownerReachable = !ownerMissing && inScope(remedy.ownerId);
    return {
      ...base,
      ownerId: ownerReachable ? remedy.ownerId : null,
      ownerName: ownerReachable ? nameOf(remedy.ownerId) : null,
      ownerWithheld: !ownerMissing && !ownerReachable,
      ownerMissing,
      decidedOn: remedy.decidedOn,
      reviewOn: remedy.reviewOn,
      reviewDue,
      windowDays,
      baselineDecisionsN: baselineN,
      /* Before the review date this is a running count, labelled as such in
         the panel, and carries no verdict. */
      afterDecisionsN: afterN,
      reviewWindowAuditedN: reviewAuditedN,
      verdict: v.key,
      verdictLabel: MATRIX_REMEDY_VERDICT_LABELS[v.key],
      verdictReason: v.reason,
    };
  });

  patterns.sort((a, b) => b.decisionsN - a.decisionsN
    || a.kind.localeCompare(b.kind)
    || a.signatureKey.localeCompare(b.signatureKey));
  const shown = patterns.slice(0, MATRIX_REMEDY_LIMITS.shownPatterns);

  /* Remedies whose pattern is not a recurring pattern in this seat. They are
     counted, never read, and never dropped. */
  const matchedKeys = new Set(patterns.map((p) => p.signatureKey));
  const matchedRemedies = remedies.filter((r) => matchedKeys.has(r.signatureKey));
  const unmatchedRemedyN = remedies.length - matchedRemedies.length;

  const byVerdict = Object.fromEntries(MATRIX_REMEDY_VERDICT_KEYS.map((k) => [k, 0]));
  let remediedPatternN = 0;
  let unaddressedPatternN = 0;
  let ownerMissingN = 0;
  let ownerWithheldN = 0;
  for (const p of patterns) {
    if (p.remedyState === 'remedied') remediedPatternN += 1;
    else unaddressedPatternN += 1;
    if (p.verdict) byVerdict[p.verdict] += 1;
    if (p.ownerMissing) ownerMissingN += 1;
    if (p.ownerWithheld) ownerWithheldN += 1;
  }

  const recurringPatternN = patterns.length;
  const counts = {
    recurringPatternN,
    recurringObservationN: patterns.reduce((n, p) => n + p.decisionsN, 0),
    remediedPatternN,
    unaddressedPatternN,
    activeRemedyN: remedies.length,
    matchedRemedyN: matchedRemedies.length,
    unmatchedRemedyN,
    invalidRemedyN,
    ownerMissingN,
    ownerWithheldN,
    byVerdict,
  };

  const identity = {
    /* The concordance's own recurring count must equal this read's count: the
       panel and the concordance cannot disagree about how many patterns recur. */
    concordance: recurringPatternN === (concordance.recurrence?.recurringPatternN ?? -1),
    patterns: remediedPatternN + unaddressedPatternN === recurringPatternN,
    remedies: counts.activeRemedyN === counts.matchedRemedyN + counts.unmatchedRemedyN,
    verdicts: Object.values(byVerdict).reduce((n, x) => n + x, 0) === remediedPatternN,
  };
  identity.all = Object.values(identity).every(Boolean);

  const ownerOptions = [...roster.values()]
    .filter((p) => inScope(p.id))
    .map((p) => ({ id: p.id, name: p.name || p.id }))
    .concat(inScope(LEADER_ID) ? [{ id: LEADER_ID, name: leaderName }] : [])
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    engineVersion: MATRIX_REMEDY_ENGINE_VERSION,
    readOn: today,
    seat: {
      id: seat?.id || null,
      label: seat?.label || 'Undeclared operator view',
      rank: seat?.rank ?? null,
      fullAccess: Boolean(seat?.fullAccess),
    },
    hasReportingLines: Array.isArray(state?.reportingLines) && state.reportingLines.length > 0,
    counts,
    identity,
    patterns: shown,
    patternsRemainderN: patterns.length - shown.length,
    /* The full pattern list is kept for the CSV so an aggregate export never
       depends on which rows the panel happened to show. */
    allPatterns: patterns,
    ownerOptions,
    verdictVocabulary: MATRIX_REMEDY_VERDICTS,
    frameworks: MATRIX_REMEDY_FRAMEWORKS,
    method: MATRIX_REMEDY_METHOD,
    limits: MATRIX_REMEDY_LIMITS,
    /* Printed when there is nothing to read: a single-chain workspace or a seat
       that sees no recurring pattern. Honest, never a reassuring zero. */
    emptyReason: recurringPatternN === 0
      ? (concordance.decisions?.totalN
        ? 'No structural pattern recurs across two or more distinct decisions in this seat.'
        : 'No decision is recorded in this seat yet, so no pattern can recur.')
      : null,
  };
}

/**
 * The aggregate export. One summary row per bucket, then one row per recurring
 * pattern. Identity-free: no owner, person, decision, line or remedy-text field.
 * A value that cannot be read is BLANK, never zero.
 */
export function matrixRemedyCsvRows(report) {
  const rows = [];
  const blank = '';
  const summary = (label, n) => ({
    row_kind: 'summary', label, finding_kind: blank, line_kinds: blank, right_keys: blank,
    decisions_n: blank, remedy_state: blank, verdict: blank, baseline_decisions_n: blank,
    review_window_decisions_n: blank, review_on: blank, bucket_n: n,
  });
  rows.push(summary('Recurring structural patterns', report.counts.recurringPatternN));
  rows.push(summary(MATRIX_REMEDY_STATE_LABELS.remedied, report.counts.remediedPatternN));
  rows.push(summary(MATRIX_REMEDY_STATE_LABELS.unaddressed, report.counts.unaddressedPatternN));
  for (const v of MATRIX_REMEDY_VERDICTS) {
    rows.push(summary(`Verdict: ${v.label}`, report.counts.byVerdict[v.key] ?? 0));
  }
  for (const p of report.allPatterns || []) {
    const readable = p.verdict && p.verdict !== 'pending';
    rows.push({
      row_kind: 'pattern',
      label: p.findingLabel,
      finding_kind: p.kind,
      line_kinds: p.lineKinds.join('|'),
      right_keys: p.rightKeys.join('|'),
      decisions_n: p.decisionsN,
      remedy_state: p.remedyState,
      verdict: p.verdict || blank,
      baseline_decisions_n: p.baselineDecisionsN ?? blank,
      review_window_decisions_n: readable ? p.reviewWindowAuditedN : blank,
      review_on: p.reviewOn || blank,
      bucket_n: blank,
    });
  }
  return rows;
}
