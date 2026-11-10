/**
 * app/core/domain/benchEvidence.js — Cross-Line Bench-Evidence Sufficiency
 * (ADR-0168, Schema v134 unchanged, `#/succession?panel=evidence`).
 *
 * THE DEFECT THIS CLOSES, IN AN OPERATOR'S WORDS. Marcus is on the CEO succession
 * slate. The packet says `ready now`, the evidence card says four of five signals
 * present, and the bench certificate says his seat is covered. An auditor asks the
 * third question: *who said so?* Marcus spends 40% of his year on Priya's
 * programme. The only assessor on record is Dana, his home-line manager. Priya's
 * line — a genuinely different observation context — was never asked what she saw.
 * The workspace ALREADY STORES, per review, every line that was asked and every
 * line that answered (ADR-0147). The readiness ledger ALREADY GRADES a rating
 * against behavioural evidence (`readiness.js`). Nothing has ever joined them, so
 * a bench claim for a three-line person can rest on one manager's impression and
 * the board reads a name.
 *
 * WHAT THIS MODULE IS
 * -------------------
 * A JOIN, not a new model. It calls:
 *
 *   `assess(state, personId, now, settings, seat)`      the stored rating and the
 *                                                       behavioural evidence the
 *                                                       readiness engine grades it on
 *   `buildReviewStewardship(state, review, ...)`        ADR-0147's per-line states
 *   `periodLinesFor(matrix, person, start, end)`         the lines in force
 *   `buildStructureLedger` / `homeLineOn` (ADR-0149)     the as-of home line
 *
 * and prints, per BENCH CLAIM, whether the evidence behind it was gathered from
 * every line the person worked on.
 *
 * WHICH REVIEW SUPPLIES THE LINE EVIDENCE — AND WHY THAT IS DECLARED
 * -----------------------------------------------------------------
 * A readiness rating is graded on a 90-day window ending today (or its own
 * `updatedAt` where that is earlier). A review's line states are stored against a
 * REVIEW PERIOD. Those two windows are not the same, so the join must pick one
 * review per claim by a rule, and the rule is DECLARED
 * (`BENCH_EVIDENCE_CONVENTIONS.reviewWindow = 'nearest-before'`) and PRINTED on
 * every row and in the brief. Two claims graded against two differently-chosen
 * reviews would not be comparable and a rate over them would be meaningless.
 *
 * WHAT IT REFUSES (Bulletproof Reliability Mandate)
 * -------------------------------------------------
 *  - It never substitutes a neighbouring review. A claim with no completed review
 *    inside its window reads `no-review` and is EXCLUDED from every rate.
 *  - It never invents a per-line contribution share. ADR-0147 already documents
 *    that feedback, 1:1 notes, recognition and delegations carry a SUBJECT and no
 *    authoring line, so no share is printed and the panel repeats that sentence.
 *  - It never treats "declined with a reason" as missing evidence, and never
 *    collapses "asked and silent" into "never asked".
 *  - It never prints a rate below the declared floor, over a partly unreadable
 *    population, or over a population with no matrix claim: the figure is BLANK
 *    with its reason in its own field.
 *  - It never scores a person or a manager. The subject is a BENCH CLAIM and a
 *    LINE'S STATE.
 *  - It stores NOTHING. Every figure is re-derived on read.
 *
 * TWO IDENTITIES IT KEEPS APART AND PRINTS SEPARATELY
 *   claims   = read + unreadable(no-review) + excluded(no-rating)
 *   states   = no-review + contested + unowned + line-unasked + line-silent
 *              + home-line-only + corroborated + single-line
 * `reconciles` is about the first; `figuresComplete` is about the second. They are
 * different facts and are never collapsed into one reassuring word.
 *
 * Pure module: no DOM, no storage, no implicit clock.
 */

import { dayKey, addDays } from '../time.js';
import { buildMatrix } from './matrix.js';
import { assess, readinessLabel } from './readiness.js';
import { buildReviewStewardship, periodLinesFor } from './reviewStewardship.js';
import { buildStructureLedger, homeLineOn } from './structureHistory.js';
import {
  BENCH_EVIDENCE_CONVENTIONS,
  BENCH_EVIDENCE_ENGINE_VERSION,
  BENCH_EVIDENCE_FLOOR,
  BENCH_EVIDENCE_LIMITS,
  BENCH_EVIDENCE_OPEN_STATES,
  BENCH_EVIDENCE_STATES,
  BENCH_EVIDENCE_STATE_KEYS,
  BENCH_EVIDENCE_VERDICTS,
  benchEvidenceState,
  benchEvidenceVerdict,
} from './benchEvidenceRegistry.js';

const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(v).trim().slice(0, 10));
const dayOf = (v) => (isDay(v) ? String(v).trim().slice(0, 10) : null);
const nameOf = (v, fallback) => (typeof v === 'string' && v.trim() ? v.trim() : fallback);

/** The last day of a rating's evidence window, plus the window itself. */
function ratingWindow(record, nowDay) {
  // The readiness engine grades a rating against the 90 days before TODAY. A
  // rating whose own `updatedAt` is in the past is graded against the 90 days
  // before that day instead — the same window, anchored where the reader was.
  const updatedOn = dayOf(record?.updatedAt);
  const end = updatedOn && updatedOn < nowDay ? updatedOn : nowDay;
  const days = BENCH_EVIDENCE_CONVENTIONS.ratingWindowDays;
  return {
    end: dayOf(end) || nowDay,
    start: dayOf(addDays(end, -(days - 1))) || end,
    days,
    anchor: 'the readiness reading\'s own day where it is in the past, otherwise today',
  };
}

/**
 * Resolve THE review that supplies the line evidence for one claim.
 *
 * `nearest-before`: the latest completed review whose period ENDS on or before the
 * window's last day. Ties are broken by `completedAt` then `id`, and the rule is
 * returned so every surface prints how the review was chosen. A review whose
 * period has not closed by the window's end is NOT eligible — reading a period
 * that had not finished would attribute evidence the window does not cover.
 */
function reviewForWindow(reviews, personId, windowEnd) {
  let best = null;
  let eligibleN = 0;
  for (const review of Array.isArray(reviews) ? reviews : []) {
    if (!review || review.personId !== personId) continue;
    if (review.status !== 'complete') continue;
    const periodEnd = dayOf(review.periodEnd);
    if (!periodEnd || periodEnd > windowEnd) continue;
    eligibleN += 1;
    const score = `${periodEnd}|${String(review.completedAt || review.updatedAt || '')}|${String(review.id)}`;
    if (!best || score > best.score) best = { review, score };
  }
  return { review: best ? best.review : null, eligibleN };
}

/** An empty state-count map, in the DECLARED order. */
function emptyStateCounts() {
  const out = {};
  for (const key of BENCH_EVIDENCE_STATE_KEYS) out[key] = 0;
  return out;
}

function emptyReport(today, refusals, conventions) {
  const verdict = benchEvidenceVerdict('no-claim');
  return {
    engineVersion: BENCH_EVIDENCE_ENGINE_VERSION,
    today,
    conventions,
    verdict: verdict.key,
    verdictLabel: verdict.label,
    verdictTone: verdict.tone,
    verdictDetail: verdict.detail,
    verdictOpen: false,
    rows: [],
    findings: [],
    findingsN: 0,
    findingsCappedN: 0,
    totals: {
      claimsN: 0,
      readN: 0,
      unreadableN: 0,
      excludedN: 0,
      matrixClaimsN: 0,
      singleClaimsN: 0,
      stateCounts: emptyStateCounts(),
      secondLineN: 0,
      secondLineCleanN: 0,
      secondLineGapN: 0,
      answeredLinesN: 0,
      declinedLinesN: 0,
      askedLinesN: 0,
      silentLinesN: 0,
      unaskedLinesN: 0,
    },
    rate: null,
    ratePrinted: false,
    rateWithheldReason: 'No bench claim is in scope.',
    reconciles: true,
    reconcilesDetail: 'There are no claims to reconcile.',
    figuresComplete: false,
    figuresCompleteDetail: 'No claim is in scope, so no figure is supported by the record.',
    refusals,
  };
}

/**
 * Build the whole reading.
 *
 * @returns {{
 *   engineVersion:string, today:string, conventions:object,
 *   verdict:string, verdictLabel:string, verdictTone:string, verdictDetail:string,
 *   verdictOpen:boolean, rows:Array<object>, findings:Array<object>,
 *   findingsN:number, findingsCappedN:number, totals:object,
 *   rate:number|null, ratePrinted:boolean, rateWithheldReason:string,
 *   reconciles:boolean, reconcilesDetail:string,
 *   figuresComplete:boolean, figuresCompleteDetail:string, refusals:Array<object>
 * }}
 */
export function buildBenchEvidenceRead(state = {}, { now = new Date(), settings = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at) || new Date().toISOString().slice(0, 10);
  const cfg = settings || state?.settings || {};
  const conv = { ...BENCH_EVIDENCE_CONVENTIONS };
  const refusals = [];

  const people = (Array.isArray(state?.people) ? state.people : []).filter((p) => p && p.id);
  const nameById = new Map(people.map((p) => [p.id, nameOf(p.name, p.id)]));
  const rosterIds = new Set(people.filter((p) => p.status !== 'archived').map((p) => p.id));

  const records = (Array.isArray(state?.readiness) ? state.readiness : [])
    .filter((r) => r && r.personId && r.seat);
  if (!records.length) {
    refusals.push({
      kind: 'no-claim',
      detail: 'No readiness record exists in this workspace, so there is no bench claim whose evidence could be read. Nothing is invented and nothing is refused as missing.',
    });
    return emptyReport(today, refusals, conv);
  }

  const matrix = buildMatrix(state, { now: at, settings: cfg });
  const ledger = buildStructureLedger(state);
  const reviews = Array.isArray(state?.reviews) ? state.reviews : [];

  // ONE review resolution per (person, window) — never per row, so two claims on
  // the same person and window cannot read two different reviews.
  const reviewCache = new Map();

  const rows = [];
  const stateCounts = emptyStateCounts();
  const findings = [];
  let readN = 0;
  let unreadableN = 0;
  let excludedN = 0;
  let matrixClaimsN = 0;
  let singleClaimsN = 0;
  let secondLineN = 0;
  let secondLineCleanN = 0;
  let secondLineGapN = 0;
  let answeredLinesN = 0;
  let declinedLinesN = 0;
  let askedLinesN = 0;
  let silentLinesN = 0;
  let unaskedLinesN = 0;
  let cappedClaimsN = 0;
  const seenClaims = new Set();

  // Stable, deterministic order: worst evidence state first, then person, then
  // seat. A bounded read must not depend on storage order.
  const ordered = [...records].sort((a, b) => String(a.personId).localeCompare(String(b.personId))
    || String(a.seat).localeCompare(String(b.seat)));

  for (const record of ordered) {
    const claimKey = `${record.personId}|${record.seat}`;
    if (seenClaims.has(claimKey)) continue;
    seenClaims.add(claimKey);

    const person = people.find((p) => p.id === record.personId) || null;
    // An archived person is not on the bench any more: their claim is counted as
    // excluded (a fact), never read as a current evidence gap.
    if (!person || !rosterIds.has(person.id)) {
      excludedN += 1;
      continue;
    }

    const window = ratingWindow(record, today);
    const cacheKey = `${record.personId}|${window.end}`;
    if (!reviewCache.has(cacheKey)) {
      reviewCache.set(cacheKey, reviewForWindow(reviews, record.personId, window.end));
    }
    const resolved = reviewCache.get(cacheKey);
    const review = resolved.review;

    // The readiness engine's own verdict on THIS claim, never re-derived here.
    const assessment = assess(state, record.personId, at, cfg, record.seat);

    // The as-of home line on the window's last day (ADR-0149), in THREE states that
    // are never collapsed — the same discipline ADR-0155 applies to a frozen pay
    // decision:
    //   observed          a recorded home-line period covers the day
    //   presumed-current  this person has NO recorded structure history at all, so
    //                     today's roster pointer is PRESUMED to have held on that
    //                     day. Printed as a presumption on every row and in the ask.
    //   unrecorded        records exist for this person and none covers the day: the
    //                     home line is UNKNOWN, and no pointer is projected back.
    const homeObservation = homeLineOn(ledger, record.personId, window.end);
    const historyForPerson = ledger?.byPerson?.get?.(record.personId) || [];
    let homeLineState = 'unrecorded';
    let homeManagerId = null;
    if (homeObservation.state === 'observed' && homeObservation.managerId) {
      homeLineState = 'observed';
      homeManagerId = homeObservation.managerId;
    } else if (!historyForPerson.length) {
      homeLineState = 'presumed-current';
      homeManagerId = person.managerId || null;
    }
    const homeKnown = Boolean(homeManagerId);

    let stewardship = null;
    let lines = [];
    let eligibleLines = [];
    let secondaryLines = [];
    if (review) {
      stewardship = buildReviewStewardship(state, review, { now: at, settings: cfg });
      lines = Array.isArray(stewardship.lines) ? stewardship.lines : [];
      eligibleLines = Array.isArray(stewardship.periodLines) ? stewardship.periodLines : [];
      secondaryLines = Array.isArray(stewardship.secondaryLines) ? stewardship.secondaryLines : [];
    }

    /* ------------------------------------------------------ state resolution */
    // DECLARED PRECEDENCE, worst first. The first matching rule wins, so the panel,
    // the brief, the CSV and the rule cannot disagree about a word.
    let evidenceState;
    let detail = '';
    if (!review) {
      evidenceState = 'no-review';
      detail = `No completed review covers a period ending on or before ${window.end}, so this claim's line evidence cannot be read. ${resolved.eligibleN} review(s) exist for this person and none is eligible; none is substituted.`;
    } else if (stewardship.assessorState === 'contested') {
      evidenceState = 'contested-assessor';
      detail = `Two or more lines held the ${conv.right} right for the review period ${stewardship.periodStart}–${stewardship.periodEnd}. The packet has no sole author and this claim is attributed to no line.`;
    } else if (stewardship.assessorState === 'unowned') {
      evidenceState = 'unowned-assessor';
      detail = `No line held the ${conv.right} right for the review period ${stewardship.periodStart}–${stewardship.periodEnd}, so the assessment has no entitled author.`;
    } else {
      const inPeriodSecondary = secondaryLines.filter((l) => l.inPeriod);
      const unasked = inPeriodSecondary.filter((l) => l.lineState === 'unasked');
      // ASKED and still inside its window is its own fact, never a silence.
      const silent = inPeriodSecondary.filter((l) => l.lineState === 'overdue');
      const awaiting = inPeriodSecondary.filter((l) => l.lineState === 'asked');
      const answered = inPeriodSecondary.filter((l) => l.lineState === 'answered' || l.lineState === 'declined');
      if (!eligibleLines.length) {
        // A completed review whose period lines cannot be resolved at all. This is
        // a record defect, not "one line": it is unreadable and withheld.
        evidenceState = 'no-review';
        detail = `The review ${review.id} is complete but its reporting lines could not be resolved for the period, so the claim's line evidence is unknown rather than assumed complete.`;
      } else if (!inPeriodSecondary.length) {
        evidenceState = 'single-line';
        detail = `One reporting line was in force for the review period ${stewardship.periodStart}–${stewardship.periodEnd}, so there is no second line that could have been missed.`;
      } else if (unasked.length) {
        evidenceState = 'line-unasked';
        detail = `${unasked.length} line(s) were in force for the review period ${stewardship.periodStart}–${stewardship.periodEnd} and were never asked what they saw. This is a defect in the evidence behind the claim, not a finding about the person.`;
      } else if (silent.length) {
        evidenceState = 'line-silent';
        detail = `${silent.length} line(s) were asked and did not answer inside their declared window. That is a dated act of not answering and is printed as such, never as "never asked".`;
      } else if (awaiting.length) {
        // Asked, still inside its window: the question is open, and it is NOT a
        // silence. It carries its own state word so no reader can mistake it for
        // one.
        evidenceState = 'line-awaiting';
        detail = `${awaiting.length} line(s) were asked and their declared window has not closed yet. The question is open, not unanswered — the reading is re-derived on every render.`;
      } else if (!answered.length) {
        evidenceState = 'home-line-only';
        detail = `Every line in force was asked, and the only contribution on record came from the home line. The packet was properly run and its observation is one line wide.`;
      } else {
        evidenceState = 'corroborated';
        detail = `Every line in force was asked, and each answered in its own words or declined with a stated reason. This is a claim about the PROCEDURE, never about the person's readiness.`;
      }
    }

    const stateMeta = benchEvidenceState(evidenceState);
    stateCounts[evidenceState] += 1;

    const isMatrixClaim = evidenceState !== 'single-line';
    const isRead = Boolean(review);
    if (review) readN += 1; else unreadableN += 1;
    if (isMatrixClaim) matrixClaimsN += 1;
    if (evidenceState === 'single-line') singleClaimsN += 1;

    const lineRows = eligibleLines.map((line) => ({
      lineKey: line.key,
      role: line.role,
      kind: line.kind,
      managerName: line.managerName,
      managerId: line.managerId,
      inPeriod: line.inPeriod === true,
      shareH: Number.isInteger(line.shareH) ? line.shareH : null,
      lineState: line.lineState,
      lineStateLabel: line.lineStateLabel,
      holdsPerformanceRight: line.holdsPerformanceRight === true,
      performanceRightPresumed: line.performanceRightPresumed === true,
      answeredLate: line.answeredLate === true,
      asksOn: line.request?.askedOn || null,
      dueOn: line.request?.dueOn || null,
      answeredOn: line.answer?.answeredOn || null,
      answerOutcome: line.answer?.outcome || null,
      answerChars: typeof line.answer?.text === 'string' ? line.answer.text.trim().length : 0,
      reasonChars: typeof line.answer?.reason === 'string' ? line.answer.reason.trim().length : 0,
    }));

    const inPeriodSecondary = secondaryLines.filter((l) => l.inPeriod);
    const secondaryAnsweredN = inPeriodSecondary.filter((l) => l.lineState === 'answered').length;
    const secondaryDeclinedN = inPeriodSecondary.filter((l) => l.lineState === 'declined').length;
    const secondaryUnaskedN = inPeriodSecondary.filter((l) => l.lineState === 'unasked').length;
    const secondaryOverdueN = inPeriodSecondary.filter((l) => l.lineState === 'overdue').length;
    const secondaryAskedN = inPeriodSecondary.filter((l) => l.lineState === 'asked').length;
    if (inPeriodSecondary.length) {
      secondLineN += 1;
      if (secondaryUnaskedN || secondaryOverdueN) secondLineGapN += 1;
      else secondLineCleanN += 1;
    }
    answeredLinesN += secondaryAnsweredN;
    declinedLinesN += secondaryDeclinedN;
    askedLinesN += secondaryAskedN;
    silentLinesN += secondaryOverdueN;
    unaskedLinesN += secondaryUnaskedN;

    const row = {
      claimId: `${record.personId}::${record.seat}`,
      personId: record.personId,
      personName: nameById.get(record.personId) || record.personId,
      personLevel: person.level || null,
      seat: record.seat,
      rating: record.rating,
      ratingLabel: readinessLabel(record.rating),
      ratingSupported: assessment.supported === true,
      ratingWarning: assessment.warning || null,
      ratingUpdatedOn: dayOf(record.updatedAt),
      ratingEvidenceMetN: assessment.evidence?.metCount ?? null,
      ratingEvidenceTotalN: assessment.evidence?.items?.length ?? null,
      evidenceMetN: assessment.evidence?.metCount ?? null,
      evidenceTotalN: assessment.evidence?.items?.length ?? null,
      evidenceState,
      evidenceStateLabel: stateMeta?.label || evidenceState,
      evidenceStateTone: stateMeta?.tone || 'neutral',
      evidenceOpen: BENCH_EVIDENCE_OPEN_STATES.includes(evidenceState),
      evidenceDetail: detail,
      windowStart: window.start,
      windowEnd: window.end,
      windowDays: window.days,
      reviewRule: conv.reviewWindow,
      reviewId: review ? review.id : null,
      reviewPeriodStart: review ? dayOf(review.periodStart) : null,
      reviewPeriodEnd: review ? dayOf(review.periodEnd) : null,
      reviewCompletedOn: review ? dayOf(review.completedAt || review.updatedAt) : null,
      reviewCandidatesN: resolved.eligibleN,
      isMatrix: isMatrixClaim,
      isRead,
      homeLineManagerId: homeKnown ? homeManagerId : null,
      homeLineManagerName: homeKnown ? (nameById.get(homeManagerId) || homeManagerId) : null,
      homeLineState,
      homeLineKnown: homeKnown,
      assessorState: stewardship ? stewardship.assessorState : null,
      assessorIds: stewardship ? [...(stewardship.assessorIds || [])] : [],
      lineN: eligibleLines.length,
      secondaryLineN: inPeriodSecondary.length,
      answeredLinesN: secondaryAnsweredN,
      declinedLinesN: secondaryDeclinedN,
      unaskedLinesN: secondaryUnaskedN,
      awaitingLinesN: secondaryAskedN,
      silentLinesN: secondaryOverdueN,
      askedLinesN: secondaryAskedN,
      answeredLateN: inPeriodSecondary.filter((l) => l.answeredLate).length,
      lines: lineRows,
    };
    rows.push(row);
  }

  if (!rows.length) {
    refusals.push({
      kind: 'no-current-claim',
      detail: `${excludedN} readiness record(s) exist and every one names a person who is no longer on the active roster. A bench claim about someone who has left is not a current evidence gap, and it is not read as one.`,
    });
    const empty = emptyReport(today, refusals, conv);
    empty.totals.excludedN = excludedN;
    return empty;
  }

  // Worst state first, then the most recently updated claim, then identity.
  rows.sort((a, b) => (benchEvidenceState(a.evidenceState)?.rank ?? 99) - (benchEvidenceState(b.evidenceState)?.rank ?? 99)
    || String(b.ratingUpdatedOn || '').localeCompare(String(a.ratingUpdatedOn || ''))
    || String(a.personName).localeCompare(String(b.personName))
    || String(a.seat).localeCompare(String(b.seat)));

  for (const row of rows) {
    if (!row.evidenceOpen) continue;
    findings.push({
      kind: row.evidenceState,
      claimId: row.claimId,
      personId: row.personId,
      personName: row.personName,
      seat: row.seat,
      rating: row.rating,
      ratingLabel: row.ratingLabel,
      reviewId: row.reviewId,
      severity: benchEvidenceState(row.evidenceState)?.rank ?? 0,
      detail: `${row.personName} · ${row.seat}: ${row.evidenceDetail}`,
    });
  }

  const totalClaims = rows.length + excludedN;
  const claimsPrintedN = Math.min(rows.length, BENCH_EVIDENCE_LIMITS.rows);
  if (rows.length > claimsPrintedN) {
    cappedClaimsN = rows.length - claimsPrintedN;
    refusals.push({
      kind: 'row-cap',
      detail: `${cappedClaimsN} bench claim(s) are beyond the ${BENCH_EVIDENCE_LIMITS.rows}-row bound on this reading. They are COUNTED in every total below and not dropped; the per-claim table shows the worst ${claimsPrintedN}.`,
    });
  }

  /* ------------------------------------------------------------ the rate */
  const readableClaims = rows.filter((r) => r.evidenceState !== 'no-review');
  const matrixReadable = readableClaims.filter((r) => r.evidenceState !== 'single-line');
  let rateWithheldReason = '';
  let rate = null;
  if (unreadableN) {
    rateWithheldReason = `${unreadableN} bench claim(s) have no readable review, so their line evidence is unknown. A rate over the readable part alone would be a rate over a population that was not chosen.`;
  } else if (!matrixReadable.length) {
    rateWithheldReason = 'No bench claim in scope rests on a person who held a second reporting line, so there is no cross-line reading to print.';
  } else if (matrixReadable.length < BENCH_EVIDENCE_FLOOR) {
    rateWithheldReason = `${matrixReadable.length} cross-line bench claim(s) are in scope, below the declared floor of ${BENCH_EVIDENCE_FLOOR}. A percentage over fewer than ${BENCH_EVIDENCE_FLOOR} claims is an anecdote, so it is withheld rather than printed.`;
  } else {
    rate = Math.round((secondLineCleanN / matrixReadable.length) * 1000) / 10;
  }
  const ratePrinted = rate !== null;

  /* --------------------------------------------------------- the two claims */
  // Claim 1: the claims add up. Every claim is exactly one of the printed states
  // (or excluded for an archived person) — never skipped and never double-counted.
  const stateN = BENCH_EVIDENCE_STATE_KEYS.reduce((acc, key) => acc + (stateCounts[key] || 0), 0);
  const reconciles = stateN === rows.length;
  const reconcilesDetail = reconciles
    ? `${stateN} claim state(s) across ${rows.length} bench claim(s) printed here; ${excludedN} record(s) excluded for an archived person, ${cappedClaimsN} beyond the row bound and counted. Every claim is exactly one state.`
    : `The state counts total ${stateN} and ${rows.length} bench claims are printed. This reading is refusing rather than printing a rate over a figure it cannot reconcile.`;

  // Claim 2: is the evidence population complete? This is a DIFFERENT question
  // from claim 1, and it is the one the reliability mandate insists on keeping
  // apart: the counts can add up perfectly over a population that was not fully
  // readable.
  let figuresComplete = true;
  let figuresCompleteDetail = `Every one of the ${rows.length} bench claim(s) in scope was read against a completed review whose lines resolved. Both figures — the claim count and the state counts — are supported by the record.`;
  if (unreadableN) {
    figuresComplete = false;
    figuresCompleteDetail = `${unreadableN} bench claim(s) could not be read (no completed review covering their window), so the population is incomplete even though every printed count reconciles.`;
  } else if (cappedClaimsN) {
    figuresComplete = false;
    figuresCompleteDetail = `${cappedClaimsN} bench claim(s) sit beyond the row bound. They are counted in the totals, but the per-claim table does not show them, so the table is not the whole population.`;
  } else if (!ratePrinted) {
    figuresCompleteDetail = `Every claim in scope was read; the RATE is a separate figure and is withheld with its own reason (${rateWithheldReason}).`;
  }

  /* ------------------------------------------------------------- refusals */
  if (!ratePrinted && rateWithheldReason) {
    refusals.push({ kind: 'rate-withheld', detail: rateWithheldReason });
  }
  const noReviewN = stateCounts['no-review'] || 0;
  if (noReviewN) {
    refusals.push({
      kind: 'unreadable',
      detail: `${noReviewN} bench claim(s) have no completed review covering their evidence window. Their line evidence is UNKNOWN — not complete, and not a gap either.`,
    });
  }
  if (singleClaimsN) {
    refusals.push({
      kind: 'single-line',
      detail: `${singleClaimsN} bench claim(s) rest on a person who held one reporting line for the review period. Nothing about a second line is claimed for them.`,
    });
  }
  refusals.push({
    kind: 'no-contribution-share',
    detail: 'No per-line contribution share is computed: feedback, 1:1 notes, recognition and delegations record who the evidence is about, never which line produced it. What is attributable is each line holder\'s own dated, first-person answer.',
  });

  /* ------------------------------------------------------------- verdict */
  // DECLARED PRECEDENCE. An unreadable population outranks every substantive
  // reading; a single-chain population makes no cross-line claim at all.
  const openClaims = rows.filter((r) => r.evidenceOpen);
  const hardGapN = openClaims.filter((r) => ['line-unasked', 'contested-assessor', 'unowned-assessor'].includes(r.evidenceState)).length;
  const softGapN = openClaims.filter((r) => ['line-silent', 'line-awaiting', 'home-line-only'].includes(r.evidenceState)).length;
  let verdictKey;
  if (unreadableN) verdictKey = 'incomplete';
  else if (!matrixReadable.length) verdictKey = 'single-chain';
  else if (hardGapN) verdictKey = 'gap';
  else if (softGapN) verdictKey = 'thin';
  else verdictKey = 'corroborated';
  const verdict = benchEvidenceVerdict(verdictKey) || BENCH_EVIDENCE_VERDICTS[0];

  return {
    engineVersion: BENCH_EVIDENCE_ENGINE_VERSION,
    today,
    conventions: conv,
    verdict: verdict.key,
    verdictLabel: verdict.label,
    verdictTone: verdict.tone,
    verdictDetail: verdict.detail,
    verdictOpen: verdict.key === 'gap' || verdict.key === 'incomplete' || verdict.key === 'thin',
    rows,
    printedRows: rows.slice(0, claimsPrintedN),
    findings,
    findingsN: findings.length,
    findingsCappedN: Math.max(0, findings.length - BENCH_EVIDENCE_LIMITS.findings),
    printedFindings: findings.slice(0, BENCH_EVIDENCE_LIMITS.findings),
    totals: {
      claimsN: totalClaims,
      printedClaimsN: rows.length,
      readN,
      unreadableN,
      excludedN,
      matrixClaimsN,
      singleClaimsN,
      stateCounts,
      secondLineN,
      secondLineCleanN,
      secondLineGapN,
      answeredLinesN,
      declinedLinesN,
      askedLinesN,
      silentLinesN,
      unaskedLinesN,
    },
    rate,
    ratePrinted,
    rateWithheldReason: ratePrinted ? '' : rateWithheldReason,
    reconciles,
    reconcilesDetail,
    figuresComplete,
    figuresCompleteDetail,
    refusals,
  };
}

/* ------------------------------------------------------------------- brief */

const n = (value) => (Number.isFinite(Number(value)) ? String(Number(value)) : '—');

/**
 * Identity-free brief text for the 360 evidence reading. A withheld rate prints
 * its reason; it is never rendered as a zero.
 */
export function benchEvidenceBriefText(state = {}, { now = new Date(), settings = null } = {}) {
  const r = buildBenchEvidenceRead(state, { now, settings });
  const lines = [];
  lines.push('LEADOS — CROSS-LINE BENCH-EVIDENCE SUFFICIENCY');
  lines.push(`Read on ${r.today}. Every figure is re-derived on read; nothing is stored by this reading.`);
  lines.push('');
  lines.push(`Verdict: ${r.verdictLabel} — ${r.verdictDetail}`);
  lines.push('');
  lines.push(`Bench claims in scope: ${n(r.totals.claimsN)} (${n(r.totals.readN)} readable, ${n(r.totals.unreadableN)} unreadable, ${n(r.totals.excludedN)} excluded as no longer on the roster).`);
  lines.push(`Cross-line claims: ${n(r.totals.matrixClaimsN)} · single-line claims: ${n(r.totals.singleClaimsN)}.`);
  lines.push(`Second-line claims: ${n(r.totals.secondLineN)} — ${n(r.totals.secondLineCleanN)} with every line asked and none silent, ${n(r.totals.secondLineGapN)} with at least one line unasked or silent.`);
  lines.push('');
  lines.push('Evidence states (one per claim, declared precedence, worst first):');
  for (const s of BENCH_EVIDENCE_STATES) {
    const count = r.totals.stateCounts[s.key] || 0;
    if (!count) continue;
    lines.push(`  ${s.label}: ${count}`);
  }
  lines.push('');
  lines.push(r.ratePrinted
    ? `Second-line evidence-complete rate: ${r.rate}% (exact integer counts, no smoothing).`
    : `Second-line evidence-complete rate: WITHHELD — ${r.rateWithheldReason}`);
  lines.push('');
  lines.push(`Counts reconcile: ${r.reconciles ? 'yes' : 'no'} — ${r.reconcilesDetail}`);
  lines.push(`Evidence population complete: ${r.figuresComplete ? 'yes' : 'no'} — ${r.figuresCompleteDetail}`);
  lines.push('');
  lines.push('Review rule applied: the latest COMPLETED review whose period ends on or before the last day of each rating\'s evidence window. No neighbouring review is substituted.');
  lines.push('No person and no manager is scored, ranked or rated by this brief. The subject is a bench claim and a line\'s state.');
  if (r.refusals.length) {
    lines.push('');
    lines.push('Refusals and limits printed with this reading:');
    for (const refusal of r.refusals) lines.push(`  - ${refusal.detail}`);
  }
  return lines.join('\n');
}

/** Aggregate-only CSV cells for scope #123. No person, name, manager id or rating. */
export function benchEvidenceCsvCells(state = {}, { now = new Date(), settings = null } = {}) {
  const r = buildBenchEvidenceRead(state, { now, settings });
  const c = r.totals.stateCounts || {};
  const has = r.totals.claimsN > 0;
  return {
    evidence_window_start: has ? (r.rows[0]?.windowStart || '') : '',
    evidence_window_end: has ? (r.rows[0]?.windowEnd || '') : '',
    evidence_review_rule: r.conventions.reviewWindow,
    evidence_reviews_read_n: String(r.totals.readN),
    evidence_claims_n: String(r.totals.claimsN),
    evidence_claims_read_n: String(r.totals.readN),
    evidence_claims_matrix_n: String(r.totals.matrixClaimsN),
    evidence_claims_single_n: String(r.totals.singleClaimsN),
    evidence_contested_n: String(c['contested-assessor'] || 0),
    evidence_unowned_n: String(c['unowned-assessor'] || 0),
    evidence_unreadable_n: String(r.totals.unreadableN),
    evidence_line_unasked_n: String(c['line-unasked'] || 0),
    evidence_line_silent_n: String(c['line-silent'] || 0),
    evidence_line_awaiting_n: String(c['line-awaiting'] || 0),
    evidence_home_line_only_n: String(c['home-line-only'] || 0),
    evidence_corroborated_n: String(c['corroborated'] || 0),
    evidence_second_line_n: String(r.totals.secondLineN),
    evidence_second_line_clean_n: String(r.totals.secondLineCleanN),
    evidence_second_line_gap_n: String(r.totals.secondLineGapN),
    evidence_second_line_clean_pct: r.ratePrinted ? String(r.rate) : '',
    evidence_second_line_pct_withheld: r.ratePrinted ? 'no' : 'yes',
    evidence_verdict: r.verdict,
    evidence_reconciles: r.reconciles ? 'yes' : 'no',
    evidence_complete: r.figuresComplete ? 'yes' : 'no',
  };
}

/* ------------------------------------------------------------------ badge */

/**
 * How many claims the operator should look at: an open evidence state on a
 * current bench claim. Refusals and unreadable claims are counted too — a claim
 * whose evidence cannot be read is exactly the one nobody will notice.
 */
export function benchEvidenceAttentionCount(state = {}, { now = new Date(), settings = null } = {}) {
  const r = buildBenchEvidenceRead(state, { now, settings });
  return r.findingsN;
}
