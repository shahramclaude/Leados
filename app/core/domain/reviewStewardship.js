/**
 * app/core/domain/reviewStewardship.js — Matrix Multi-Line Review Stewardship
 * (ADR-0147, Schema v122, `#/reviews?panel=stewardship`).
 *
 * THE DUTY, IN THE OPERATOR'S WORDS. A project manager has had Sam on her team
 * for nine months. Sam's functional manager writes the review. Nothing in the
 * workspace ever asked the project manager what she saw, and nothing ever told
 * Sam that she was not asked — the packet simply reads as a complete account of
 * the period, signed by one of Sam's two managers. If the project manager HAD
 * been asked and had said nothing, the record would look identical. And if both
 * managers had declared the performance-assessment right, the packet would still
 * complete with a single assessment nobody could attribute.
 *
 * This module is that missing step between the matrix ledger and the review
 * packet: for one person and one period, which lines did they sit on, which of
 * those were asked, which answered or declined, which are late, which were never
 * asked, and who — exactly — holds the right to assess them.
 *
 * THE ONE THING IT REFUSES TO DO THAT WOULD BE EASY
 * -------------------------------------------------
 * It does NOT print a per-line "contribution share". Feedback, recognition, 1:1
 * notes and delegations in this workspace carry a SUBJECT and no AUTHORING
 * MANAGER, so any split derived from them would be a fabricated allocation — the
 * exact failure the Bulletproof Reliability Mandate forbids. The report carries
 * `attribution.lineAttributable = false` with that reason and the panel prints it
 * beside the evidence count. What IS attributable is a first-person dated answer,
 * and that is the only thing the engine counts.
 *
 * WHAT IS DERIVED AND WHAT IS STORED
 * ----------------------------------
 * Stored (on the review row, frozen with it): the asks (`stewardship.requests`)
 * and the line holders' own answers (`stewardship.answers`). Nothing else.
 * Derived on every read: every period line, every state, every overdue flag, the
 * assessor resolution, the verdict and every total. A printed state therefore
 * cannot drift from the declarations and the dates it claims to describe.
 *
 * Pure module: no DOM, no storage, no implicit clock.
 */

import { dayKey, daysBetween } from '../time.js';
import { buildMatrix } from './matrix.js';
import { normalizeReviewStewardshipSettings } from './reviewStewardshipSchema.js';
import {
  REVIEW_STEWARDSHIP_ENGINE_VERSION,
  REVIEW_STEWARDSHIP_LIMITS,
  REVIEW_STEWARDSHIP_RIGHT,
  REVIEW_STEWARDSHIP_SETTLED_STATES,
  REVIEW_STEWARDSHIP_STATES,
  REVIEW_STEWARDSHIP_STATE_LABELS,
  REVIEW_STEWARDSHIP_STATE_TONES,
  REVIEW_STEWARDSHIP_VERDICTS,
  reviewStewardshipVerdict,
} from './reviewStewardshipRegistry.js';

/* ------------------------------------------------------------ small helpers */

const HOME_PREFIX = 'home:';
const PRIMARY_KIND = 'functional';

function textOf(value, max = 400) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function dayOf(value) {
  const s = typeof value === 'string' ? value.trim().slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Does a line's declared window intersect the period, inclusive of both ends? */
export function lineOverlapsPeriod(line, periodStart, periodEnd) {
  if (!line) return false;
  // The home line is in force for the whole period: the roster names one manager
  // and this workspace has never stored when that pointer changed. Saying so is
  // honest; inventing a historical end date would not be.
  if (line.role === 'primary') return true;
  const from = dayOf(line.fromISO);
  if (!from) return false;
  const to = dayOf(line.toISO);
  if (from > periodEnd) return false;
  if (to && to < periodStart) return false;
  return true;
}

/**
 * The stable id for a line inside one review. The home line is keyed by person
 * (it has no declaration row); an additional line is keyed by its declaration id,
 * so a re-ask after a re-declaration does not collide with the earlier answer.
 */
export function stewardshipLineKey(line, personId = null) {
  if (!line) return null;
  if (line.role === 'primary') return `${HOME_PREFIX}${line.personId || personId || ''}`;
  return String(line.id || '');
}

/** Every line the person sat on in or around the period, home first. */
export function periodLinesFor(matrix, personId, periodStart, periodEnd, stateDeclarationSource = null) {
  // THE SAME SET buildMatrix WIRED AND ACCEPTED, read from its own index.
  //
  // `buildMatrix` returns `lines` (home lines plus accepted declared lines). Its
  // `linesByPerson` index is authoritative for "what was wired"; the home line is
  // added explicitly because a person with no declared line still has one. Reading
  // the raw `reportingLines` array instead would let the panel claim a line the
  // graph REFUSED (a duplicate, a cycle, a bad window) and issue work against it.
  const wired = matrix?.linesByPerson?.get?.(personId) || [];
  const home = (Array.isArray(matrix?.lines) ? matrix.lines : []).filter((l) => l.personId === personId && l.role === 'primary');
  // Lines the graph REFUSED to wire because their window closed before today are
  // still part of the history of this relationship. They are included here and
  // printed as EXCLUDED from the period with their end date — dropping them
  // silently is how a workspace forgets a project someone worked on for a quarter.
  const inactive = (Array.isArray(matrix?.inactiveLines) ? matrix.inactiveLines : []).filter((l) => l.personId === personId);
  const wiredIds = new Set(wired.map((l) => l.id));
  const all = [
    ...home,
    ...wired.filter((l) => l.role !== 'primary'),
    ...inactive.filter((l) => !wiredIds.has(l.id)),
  ];
  // DEDUPLICATION BY RELATIONSHIP, NOT BY ROW.
  //
  // `buildMatrix` wires ONE edge per manager, so a person holding two declared
  // lines to the same manager on different kinds (a project and a
  // cross-functional brief, say) arrives here already collapsed. That is the right
  // shape for this question — one manager, one opinion, one answer — and asking
  // the same human twice, then reporting their silence twice, is exactly the
  // double-count the Matrix Leadership Mandate forbids.
  //
  // What the graph does not carry is the SECOND KIND, and a leader reading the
  // packet is entitled to see that the relationship had two declared briefs. The
  // kinds are merged from the raw declarations but ONLY onto a relationship the
  // graph actually wired: a line the engine REFUSED (a duplicate, a cycle, a
  // contradiction) must never be claimed by this panel or issued work against.
  const declaredKinds = new Map();
  for (const raw of Array.isArray(stateDeclarationSource?.reportingLines) ? stateDeclarationSource.reportingLines : []) {
    if (!raw || raw.personId !== personId || !raw.managerId) continue;
    if (!declaredKinds.has(raw.managerId)) declaredKinds.set(raw.managerId, []);
    if (raw.kind && !declaredKinds.get(raw.managerId).includes(raw.kind)) declaredKinds.get(raw.managerId).push(raw.kind);
  }
  const seen = new Set();
  const rows = [];
  for (const line of all) {
    const key = stewardshipLineKey(line, personId);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const inPeriod = lineOverlapsPeriod(line, periodStart, periodEnd);
    const rights = Array.isArray(line.rights) ? [...line.rights] : [];
    const reason = inPeriod
      ? (line.role === 'primary'
          ? 'The home line (person.managerId) is in scope for the whole period. LeadOS does not store when that pointer changed, and does not invent a date for it.'
          : 'The declared line was open at some point inside the review period.')
      : (line.toISO && line.toISO < periodStart)
        ? `The declared line ended on ${line.toISO}, before this period began, and is excluded from it.`
        : `The declared line starts on ${line.fromISO || 'an undeclared date'}, after this period ended, and is excluded from it.`;
    rows.push({
      key,
      lineId: line.id,
      declarationId: line.declarationId || line.id,
      role: line.role,
      kind: line.kind,
      managerId: line.managerId,
      managerName: matrix?.nodes?.get(line.managerId)?.name || line.managerId,
      managerAltitude: matrix?.nodes?.get(line.managerId)?.altitude || null,
      shareH: Number.isInteger(line.shareH) ? line.shareH : null,
      rights,
      presumedRights: Array.isArray(line.presumedRights) ? [...line.presumedRights] : [],
      fromISO: dayOf(line.fromISO),
      toISO: dayOf(line.toISO),
      inPeriod,
      reason,
      // The `performance` right is what entitles a line's manager to assess. On a
      // home line the right may be PRESUMED (MATRIX_HOME_RIGHTS_DEFAULT); the row
      // says which, so the assessor claim is never silently upgraded.
      holdsPerformanceRight: rights.includes(REVIEW_STEWARDSHIP_RIGHT),
      performanceRightPresumed: (Array.isArray(line.presumedRights) ? line.presumedRights : []).includes(REVIEW_STEWARDSHIP_RIGHT),
    });
  }
  // Every declared kind on the wired relationship, primary kind first.
  for (const row of rows) {
    const extra = declaredKinds.get(row.managerId) || [];
    const kinds = [...new Set([row.kind, ...extra].filter(Boolean))];
    row.kinds = kinds;
    row.declaredKindN = kinds.length;
  }
  rows.sort((a, b) => {
    if (a.role === 'primary' && b.role !== 'primary') return -1;
    if (b.role === 'primary' && a.role !== 'primary') return 1;
    return String(a.managerName).localeCompare(String(b.managerName));
  });
  return rows;
}

/* --------------------------------------------------------------- the report */

function emptyReport(state, review, conv, today) {
  return {
    engineVersion: REVIEW_STEWARDSHIP_ENGINE_VERSION,
    reviewId: review?.id || null,
    personId: review?.personId || null,
    personName: state?.people?.find?.((p) => p.id === review?.personId)?.name || review?.personId || null,
    periodStart: dayOf(review?.periodStart),
    periodEnd: dayOf(review?.periodEnd),
    status: review?.status || 'draft',
    isMatrix: false,
    verdict: 'single-chain',
    verdictLabel: reviewStewardshipVerdict('single-chain')?.label || 'Single line',
    verdictTone: 'neutral',
    verdictDetail: reviewStewardshipVerdict('single-chain')?.detail || '',
    lines: [],
    periodLines: [],
    secondaryLines: [],
    outOfPeriodLines: [],
    assessors: [],
    assessorState: 'sole',
    assessorIds: [],
    totals: {
      lineN: 0, secondaryLineN: 0, inPeriodLineN: 0, secondaryInPeriodN: 0,
      answeredN: 0, declinedN: 0, askedN: 0, overdueN: 0, unaskedN: 0,
      settledN: 0, accountableN: 0, outOfPeriodN: 0,
    },
    attribution: {
      lineAttributable: false,
      attributableSourceTypes: [],
      reason: 'No evidence row in this workspace records which reporting line produced it, so no per-line contribution is computed.',
    },
    conventions: conv,
    refusals: [],
    today,
  };
}

/**
 * Build the whole read model for ONE review. Every field is recomputed; the only
 * stored inputs trusted are the review's period and its `stewardship` arrays.
 */
export function buildReviewStewardship(state, review, { now = new Date(), settings = null } = {}) {
  const conv = normalizeReviewStewardshipSettings(settings || state?.settings || {});
  const today = dayKey(now);
  const base = emptyReport(state, review, conv, today);
  if (!review || !base.personId || !base.periodStart || !base.periodEnd) {
    return base;
  }
  const declaredLines = Array.isArray(state?.reportingLines) ? state.reportingLines : [];
  const matrix = buildMatrix(state, { now, settings: settings || state?.settings || null });

  const all = periodLinesFor(matrix, base.personId, base.periodStart, base.periodEnd, state);
  let periodRows = all.filter((l) => l.inPeriod);
  let outOfPeriod = all.filter((l) => !l.inPeriod);
  let secondaryInPeriod = periodRows.filter((l) => l.role !== 'primary');
  // A workspace is a MATRIX for this person when more than one line was in force
  // in the period, OR when any declared line names them at all (even a future
  // one) — because "this person has a second manager next quarter" is already a
  // fact the review should not silently ignore.
  const isMatrix = periodRows.length > 1 || all.some((l) => l.role !== 'primary');

  const stored = review.stewardship && typeof review.stewardship === 'object' ? review.stewardship : {};
  const storedRequests = Array.isArray(stored.requests) ? stored.requests : [];
  const storedAnswers = Array.isArray(stored.answers) ? stored.answers : [];

  const answerByLine = new Map();
  for (const answer of storedAnswers) {
    if (!answer || !answer.lineKey) continue;
    // First answer wins: a later one would make "who said what" unfalsifiable.
    if (!answerByLine.has(answer.lineKey)) answerByLine.set(answer.lineKey, answer);
  }
  const latestRequestByLine = new Map();
  for (const request of storedRequests) {
    if (!request || !request.lineKey) continue;
    const prior = latestRequestByLine.get(request.lineKey);
    if (!prior || String(request.askedOn) >= String(prior.askedOn)) latestRequestByLine.set(request.lineKey, request);
  }

  /* ------------------------------------------------ assessor resolution */
  // Resolved BEFORE the rows are mapped, because a line's STATE depends on it:
  // the single line holding the performance right is the assessor, and asking it
  // for input into its own assessment is not a question.
  const rightsHolders = all.filter((l) => l.holdsPerformanceRight && l.inPeriod);
  const soleAssessorId = rightsHolders.length === 1 ? rightsHolders[0].managerId : null;

  const rows = all.map((line) => {
    const request = latestRequestByLine.get(line.key) || null;
    const answer = answerByLine.get(line.key) || null;
    const dueOn = request?.dueOn || null;
    // An answer settles the line regardless of how late it was. The lateness is
    // still printed (answeredLate) so a late answer is not read as an on-time one.
    const answeredLate = Boolean(answer && dueOn && answer.answeredOn > dueOn);
    const overdue = Boolean(request && !answer && dueOn && today > dueOn);
    const overdueDays = overdue ? Math.max(0, daysBetween(dueOn, today) ?? 0) : null;

    let lineState;
    if (!line.inPeriod) {
      // Outside the period: no state is claimed for it. The row prints its
      // exclusion reason instead, and no obligation can be issued off it.
      lineState = REVIEW_STEWARDSHIP_STATES.excluded;
    } else if (answer) {
      lineState = answer.outcome === 'declined' ? REVIEW_STEWARDSHIP_STATES.declined : REVIEW_STEWARDSHIP_STATES.answered;
    } else if (request && !overdue) {
      lineState = REVIEW_STEWARDSHIP_STATES.asked;
    } else if (overdue) {
      lineState = REVIEW_STEWARDSHIP_STATES.overdue;
    } else if (soleAssessorId && line.managerId === soleAssessorId) {
      // The assessor line: this manager writes the assessment, so the packet is
      // their own act. It is NOT "never asked", which would read as a gap.
      lineState = REVIEW_STEWARDSHIP_STATES.assessor;
    } else {
      lineState = REVIEW_STEWARDSHIP_STATES.unasked;
    }

    return {
      ...line,
      lineState,
      lineStateLabel: REVIEW_STEWARDSHIP_STATE_LABELS[lineState],
      lineStateTone: REVIEW_STEWARDSHIP_STATE_TONES[lineState],
      settled: REVIEW_STEWARDSHIP_SETTLED_STATES.includes(lineState),
      answeredLate,
      request: request
        ? {
            id: request.id,
            askedOn: request.askedOn,
            askedBySeatId: request.askedBySeatId || null,
            note: request.note || '',
            dueOn,
            overdue,
            overdueDays,
          }
        : null,
      answer: answer
        ? {
            id: answer.id,
            outcome: answer.outcome === 'declined' ? 'declined' : 'input',
            answeredOn: answer.answeredOn,
            answeredBySeatId: answer.answeredBySeatId || null,
            answeredByManagerId: answer.lineManagerId || line.managerId,
            text: answer.text || '',
            reason: answer.reason || '',
            signal: answer.signal || null,
            late: answeredLate,
          }
        : null,
      // COUNTED SEPARATELY, NEVER ADDED TO EVIDENCE: an ask the engine cannot
      // place on this person's current line set (the line was withdrawn and
      // re-declared, say) stays visible as an orphan rather than vanishing.
      orphaned: false,
    };
  });

  // Orphan detection: stored asks/answers naming a line key that no longer
  // resolves. They are printed, never dropped, because silently losing a
  // recorded ask is how a workspace forgets it promised to consult somebody.
  const liveKeys = new Set(rows.map((r) => r.key));
  const orphanRequests = storedRequests.filter((r) => r && r.lineKey && !liveKeys.has(r.lineKey));
  const orphanAnswers = storedAnswers.filter((a) => a && a.lineKey && !liveKeys.has(a.lineKey));

  // The counts read the MAPPED rows, never the raw line list: `lineState` is
  // computed above, and counting the raw entries would silently report zero of
  // every state while the rows themselves printed the right word.
  periodRows = rows.filter((l) => l.inPeriod);
  outOfPeriod = rows.filter((l) => !l.inPeriod);
  secondaryInPeriod = periodRows.filter((l) => l.role !== 'primary');

  const byState = (key) => periodRows.filter((l) => l.lineState === key);
  const answered = byState(REVIEW_STEWARDSHIP_STATES.answered);
  const declined = byState(REVIEW_STEWARDSHIP_STATES.declined);
  const asked = byState(REVIEW_STEWARDSHIP_STATES.asked);
  const overdue = byState(REVIEW_STEWARDSHIP_STATES.overdue);
  const unasked = byState(REVIEW_STEWARDSHIP_STATES.unasked);
  const settledN = answered.length + declined.length;
  const accountableN = periodRows.length;

  /* ---- assessor resolution (computed above; only lines in force qualify) ---- */
  // A line that ended before the period, or starts after it, is not an assessor
  // of it — which is why this reads the period rows and not every declared row.
  const assessors = rightsHolders;
  let assessorState = 'sole';
  if (assessors.length > 1) assessorState = 'contested';
  else if (assessors.length === 0) assessorState = 'unowned';

  /* ---------------------------------------------------------- the verdict */
  // Precedence is DECLARED in the registry; this selects, and nothing else does.
  // "SETTLED" MEANS EVERY LINE IS SETTLED — answered or declined. An ask that is
  // merely outstanding is its own state: nothing is late, but nothing is settled
  // either, and calling it settled would let a packet read as unanimous while a
  // question is still open.
  const awaiting = periodRows.filter((l) => l.lineState === REVIEW_STEWARDSHIP_STATES.asked);

  let verdict;
  if (assessorState === 'contested') verdict = 'contested-assessor';
  else if (assessorState === 'unowned') verdict = 'unowned-assessor';
  else if (overdue.length) verdict = 'overdue-input';
  else if (secondaryInPeriod.length && unasked.length) verdict = 'unasked-line';
  else if (awaiting.length) verdict = 'awaiting-input';
  else if (periodRows.length <= 1) verdict = 'single-chain';
  else verdict = 'settled';

  // A matrix person whose ONLY line is the home line is a single-chain review
  // even though the workspace declares lines elsewhere. Say so explicitly.
  if (periodRows.length <= 1 && assessorState === 'sole' && !overdue.length && !awaiting.length
      && !(secondaryInPeriod.length && unasked.length)) {
    verdict = 'single-chain';
  }

  const refusals = [];
  if (outOfPeriod.length) {
    refusals.push({
      kind: 'line-outside-period',
      lineKeys: outOfPeriod.map((l) => l.key),
      detail: `${outOfPeriod.length} declared line(s) on this person do not overlap the review period and were EXCLUDED rather than counted. A line that did not exist in the period cannot have contributed to it.`,
    });
  }
  if (declined.length) {
    refusals.push({
      kind: 'line-declined-input',
      lineKeys: declined.map((l) => l.key),
      detail: `${declined.length} line(s) recorded an explicit "nothing to add" with a stated reason. That is a dated human act, not a gap — and it is NOT counted as evidence.`,
    });
  }
  if (orphanRequests.length || orphanAnswers.length) {
    refusals.push({
      kind: 'orphaned-stewardship',
      lineKeys: [...orphanRequests, ...orphanAnswers].map((r) => r.lineKey),
      detail: `${orphanRequests.length} ask(s) and ${orphanAnswers.length} answer(s) name a reporting line that no longer resolves on this person. They are kept and printed so a recorded ask cannot disappear when a line is re-declared.`,
    });
  }
  if (answered.some((l) => l.answeredLate)) {
    refusals.push({
      kind: 'late-answer',
      lineKeys: answered.filter((l) => l.answeredLate).map((l) => l.key),
      detail: `${answered.filter((l) => l.answeredLate).length} line(s) answered AFTER the declared window. The answer counts as a human act; the lateness is printed so it is not read as an on-time one.`,
    });
  }

  const meta = reviewStewardshipVerdict(verdict);

  return {
    ...base,
    isMatrix,
    verdict,
    verdictLabel: meta?.label || verdict,
    verdictTone: meta?.tone || 'neutral',
    verdictDetail: meta?.detail || '',
    lines: rows,
    periodLines: periodRows,
    secondaryLines: secondaryInPeriod,
    outOfPeriodLines: outOfPeriod,
    assessors: assessors.map((l) => ({
      lineKey: l.key,
      managerId: l.managerId,
      managerName: l.managerName,
      role: l.role,
      kind: l.kind,
      fromISO: l.fromISO,
      toISO: l.toISO,
      presumed: l.performanceRightPresumed,
    })),
    assessorState,
    assessorIds: assessors.map((l) => l.managerId),
    orphanRequests,
    orphanAnswers,
    totals: {
      lineN: rows.length,
      secondaryLineN: rows.filter((l) => l.role !== 'primary').length,
      inPeriodLineN: periodRows.length,
      secondaryInPeriodN: secondaryInPeriod.length,
      assessorN: periodRows.filter((l) => l.lineState === REVIEW_STEWARDSHIP_STATES.assessor).length,
      answeredN: answered.length,
      declinedN: declined.length,
      askedN: asked.length,
      overdueN: overdue.length,
      unaskedN: unasked.length,
      settledN,
      accountableN,
      outOfPeriodN: outOfPeriod.length,
    },
    attribution: {
      lineAttributable: false,
      attributableSourceTypes: [],
      reason: 'Feedback, recognition, 1:1 notes and delegations in this workspace record WHO the evidence is about, never WHICH reporting line produced it. Any per-line contribution share would therefore be invented, so none is printed. What is attributable is each line holder’s own dated, first-person answer.',
    },
    conventions: conv,
    refusals,
  };
}

/* ------------------------------------------------------------- roll-up duty */

/**
 * Every review whose matrix stewardship is not settled, worst first.
 *
 * This is the director's and the VP's reading: not one packet, but the pattern —
 * which second lines are never asked, across every review. It never ranks a
 * manager, and never counts a person twice: one row per review, the person named
 * once on it.
 */
export function reviewStewardshipBoard(state, { now = new Date(), settings = null, limit = REVIEW_STEWARDSHIP_LIMITS.board } = {}) {
  const conv = normalizeReviewStewardshipSettings(settings || state?.settings || {});
  const reviews = Array.isArray(state?.reviews) ? state.reviews : [];
  const order = new Map(REVIEW_STEWARDSHIP_VERDICTS.map((v) => [v.key, v.severity]));
  const openSet = new Set(REVIEW_STEWARDSHIP_VERDICTS.filter((v) => v.open).map((v) => v.key));
  const reports = [];
  for (const review of reviews) {
    if (!review || !review.id) continue;
    const report = buildReviewStewardship(state, review, { now, settings });
    if (!report.isMatrix) continue;
    reports.push(report);
  }
  reports.sort((a, b) => (order.get(a.verdict) ?? 9) - (order.get(b.verdict) ?? 9)
    || String(b.periodEnd).localeCompare(String(a.periodEnd))
    || String(a.personName).localeCompare(String(b.personName)));
  const open = reports.filter((r) => openSet.has(r.verdict));
  const byVerdict = new Map(REVIEW_STEWARDSHIP_VERDICTS.map((v) => [v.key, 0]));
  for (const r of reports) byVerdict.set(r.verdict, (byVerdict.get(r.verdict) || 0) + 1);

  const sum = (picker) => reports.reduce((acc, r) => acc + picker(r), 0);

  return {
    engineVersion: REVIEW_STEWARDSHIP_ENGINE_VERSION,
    conventions: conv,
    today: dayKey(now),
    reports,
    shown: reports.slice(0, limit),
    truncatedN: Math.max(0, reports.length - limit),
    matrixReviewN: reports.length,
    openN: open.length,
    settledN: reports.filter((r) => r.verdict === 'settled').length,
    singleChainN: reviews.length - reports.length,
    byVerdict: REVIEW_STEWARDSHIP_VERDICTS.map((v) => ({ key: v.key, label: v.label, n: byVerdict.get(v.key) || 0 })),
    answeredLinesN: sum((r) => r.totals.answeredN),
    declinedLinesN: sum((r) => r.totals.declinedN),
    askedLinesN: sum((r) => r.totals.askedN),
    overdueLinesN: sum((r) => r.totals.overdueN),
    unaskedLinesN: sum((r) => r.totals.unaskedN),
    contestedN: reports.filter((r) => r.verdict === 'contested-assessor').length,
    unownedN: reports.filter((r) => r.verdict === 'unowned-assessor').length,
    // Printed separately from the others: "how many lines anyone asked" and "how
    // many reviews needed asking" are different questions with different answers.
    requestsN: sum((r) => (r.lines || []).filter((l) => l.request).length),
    orphanedN: sum((r) => (r.orphanRequests?.length || 0) + (r.orphanAnswers?.length || 0)),
  };
}

/** Attention badge: reviews where a matrix step is outstanding. */
export function reviewStewardshipAttentionCount(state, { now = new Date(), settings = null } = {}) {
  return reviewStewardshipBoard(state, { now, settings, limit: 0 }).openN;
}

/**
 * The identity-free brief a VP can put in a pack.
 *
 * It states each figure separately because each is a different fact: how many
 * packets needed reconciling, how many lines answered, declined, are late, and
 * were never asked; and how many packets carry a contested assessor. It names no
 * person, and it does not turn an unanswered line into a zero contribution.
 */
export function reviewStewardshipBriefText(state, { now = new Date(), settings = null } = {}) {
  const board = reviewStewardshipBoard(state, { now, settings, limit: 0 });
  if (!board.matrixReviewN) {
    return `Matrix review stewardship — ${board.today}: no performance review in this workspace covers a person who sat on more than one reporting line. There is nothing to reconcile, which is a different claim than "every line was asked".`;
  }
  const lines = [
    `Matrix review stewardship — ${board.today}.`,
    `${board.matrixReviewN} review packet(s) cover a person who sat on a second reporting line during the review period; ${board.settledN} are settled across their lines and ${board.openN} carry an outstanding step.`,
    `Lines on those packets: ${board.answeredLinesN} answered, ${board.declinedLinesN} declined with a stated reason, ${board.askedLinesN} asked and still inside the ${board.conventions.reviewStewardshipAnswerDays}-day window, ${board.overdueLinesN} asked and late, ${board.unaskedLinesN} never asked.`,
    `${board.contestedN} packet(s) have a CONTESTED assessor and ${board.unownedN} have no declared assessor: no sole entitled author can be named for those periods.`,
    'No per-line contribution share is reported: this workspace records who evidence is about, not which reporting line produced it. Inventing that split would misstate every figure derived from it.',
  ];
  if (board.singleChainN) lines.push(`${board.singleChainN} further review(s) are single-chain and are unaffected by this reading.`);
  return lines.join(' ');
}

/** One flat row per review × line, for the CSV export and for exact parity checks. */
export function reviewStewardshipCsvRows(state, { now = new Date(), settings = null } = {}) {
  const board = reviewStewardshipBoard(state, { now, settings, limit: Number.MAX_SAFE_INTEGER });
  const rows = [];
  for (const report of board.reports) {
    for (const line of report.lines) {
      rows.push({
        review_id: report.reviewId,
        person_id: report.personId,
        person_name: report.personName,
        period_start: report.periodStart,
        period_end: report.periodEnd,
        review_status: report.status,
        verdict: report.verdict,
        assessor_state: report.assessorState,
        assessor_manager_ids: report.assessorIds.join(' '),
        line_key: line.key,
        line_role: line.role,
        line_kind: line.kind,
        manager_id: line.managerId,
        manager_name: line.managerName,
        in_period: line.inPeriod ? 'yes' : 'no',
        exclusion_reason: line.inPeriod ? '' : line.reason,
        from_on: line.fromISO,
        to_on: line.toISO,
        holds_performance_right: line.holdsPerformanceRight ? 'yes' : 'no',
        performance_right_presumed: line.performanceRightPresumed ? 'yes' : 'no',
        line_state: line.lineState,
        asked_on: line.request?.askedOn || '',
        asked_by_seat: line.request?.askedBySeatId || '',
        due_on: line.request?.dueOn || '',
        overdue: line.request ? (line.request.overdue ? 'yes' : 'no') : '',
        overdue_days: line.request?.overdueDays ?? '',
        answered_on: line.answer?.answeredOn || '',
        answered_by_manager: line.answer?.answeredByManagerId || '',
        answer_outcome: line.answer?.outcome || '',
        answer_late: line.answer ? (line.answer.late ? 'yes' : 'no') : '',
        answer_text: line.answer?.text || '',
        decline_reason: line.answer?.reason || '',
        line_attributable: report.attribution.lineAttributable ? 'yes' : 'no',
      });
    }
  }
  return rows;
}

export const REVIEW_STEWARDSHIP_CSV_COLUMNS = Object.freeze([
  'review_id', 'person_id', 'person_name', 'period_start', 'period_end', 'review_status',
  'verdict', 'assessor_state', 'assessor_manager_ids', 'line_key', 'line_role', 'line_kind',
  'manager_id', 'manager_name', 'in_period', 'exclusion_reason', 'from_on', 'to_on',
  'holds_performance_right', 'performance_right_presumed', 'line_state', 'asked_on',
  'asked_by_seat', 'due_on', 'overdue', 'overdue_days', 'answered_on', 'answered_by_manager',
  'answer_outcome', 'answer_late', 'answer_text', 'decline_reason', 'line_attributable',
]);
