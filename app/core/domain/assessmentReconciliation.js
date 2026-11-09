/**
 * app/core/domain/assessmentReconciliation.js — Cross-line assessment
 * substance reconciliation and calibration parity (ADR-0151, Schema v126,
 * `#/reviews?panel=stewardship` Reconciliation).
 *
 * THE DUTY, IN THE OPERATOR'S WORDS. A director runs a quarterly calibration
 * with two managers who both had Sam on their team for nine months. Both were
 * asked for input. Both answered. The packet shows the answers side by side.
 * Nothing in the workspace says whether those answers AGREE about what Sam did
 * well, whether one line's input is worryingly thin — a sentence against a
 * paragraph — or whether the comparison the director is about to make is even
 * valid. The director re-reads every answer pair by eye, and a thin \"looks
 * good\" is silently treated as agreement with a detailed assessment. When a
 * review is about the one durable claim this product makes about a person, that
 * silence is how a biased or partial view survives calibration.
 *
 * WHAT THIS MODULE IS. A bounded read model that reconciles the SUBSTANCE of
 * two or more lines' first-person answers for ONE review period. It does not
 * re-ask who was entitled to answer — reviewStewardship already does — and it
 * does not change a rating. It adds the missing step between \"every line
 * spoke\" and \"the packet is ready to be signed\": did the lines' dated
 * accounts align, and is that alignment trustworthy?
 *
 * Pure module: no DOM, no storage, no implicit clock.
 */

import { dayKey } from '../time.js';
import { buildReviewStewardship, periodLinesFor } from './reviewStewardship.js';
import { buildMatrix } from './matrix.js';
import { normalizeAssessmentReconciliationSettings } from './assessmentReconciliationSchema.js';
import {
  ASSESSMENT_RECONCILIATION_ENGINE_VERSION,
  ASSESSMENT_RECONCILIATION_LIMITS,
  assessmentReconciliationVerdict,
  assessmentSignalRank,
} from './assessmentReconciliationRegistry.js';

/* ------------------------------------------------------------ small helpers */

function textLen(text) {
  return typeof text === 'string' ? text.trim().length : 0;
}

/**
 * For ONE review, whether the lines' substance aligns.
 *
 * The reconciliation is ONLY computed when the packet is matrix-relevant and
 * every in-period line has settled (answered or declined). An open packet with
 * an outstanding ask is `incomplete` rather than silently reduced to the lines
 * that have spoken — because a comparison that excludes a live question would
 * read as unanimous while an ask is still outstanding.
 *
 * Divergence is ONLY computed from declared `signal` fields. Two paragraphs of
 * free text are not auto-compared because guessing what a paragraph meant would
 * be the exact failure this module refuses to commit. A free-text answer with
 * no signal reads `unrated` and is not a zero signal.
 */
export function buildAssessmentReconciliation(state, review, { now = new Date(), settings = null } = {}) {
  const conv = normalizeAssessmentReconciliationSettings(settings || state?.settings || {});
  const today = dayKey(now);
  const fallback = {
    engineVersion: ASSESSMENT_RECONCILIATION_ENGINE_VERSION,
    reviewId: review?.id || null,
    personId: review?.personId || null,
    periodStart: review?.periodStart || null,
    periodEnd: review?.periodEnd || null,
    isMatrix: false,
    verdict: 'single-chain',
    verdictLabel: assessmentReconciliationVerdict('single-chain')?.label || 'Single line',
    verdictTone: 'neutral',
    verdictDetail: assessmentReconciliationVerdict('single-chain')?.detail || '',
    lines: [],
    answeredLines: [],
    declinedLines: [],
    excludedLines: [],
    assessorLine: null,
    signalGaps: [],
    thinLines: [],
    signalRange: null,
    maxSignalGap: null,
    conventions: conv,
    today,
    refusals: [],
  };

  if (!review || !review.id || !review.personId || !review.periodStart || !review.periodEnd) {
    return { ...fallback, refusals: [{ kind: 'no-review', detail: 'No review row with a person and a period was provided, so no reconciliation can be computed.' }] };
  }

  // Read the canonical stewardship report — the same one the Packet panel,
  // the board and the CSV already use, so there is one source of truth for
  // \"which lines exist and which of them spoke\".
  const stewardship = buildReviewStewardship(state, review, { now, settings });
  const isMatrix = Boolean(stewardship.isMatrix);
  if (!isMatrix) {
    return {
      ...fallback,
      isMatrix: false,
      reviewId: stewardship.reviewId || review.id,
      personId: stewardship.personId || review.personId,
      periodStart: stewardship.periodStart,
      periodEnd: stewardship.periodEnd,
      today,
      conventions: conv,
    };
  }

  const inPeriod = Array.isArray(stewardship.lines) ? stewardship.lines.filter((l) => l.inPeriod) : [];
  const answered = inPeriod.filter((l) => l.lineState === 'answered');
  const declined = inPeriod.filter((l) => l.lineState === 'declined');
  const assessor = inPeriod.find((l) => l.lineState === 'assessor') || null;
  const open = inPeriod.filter((l) => l.lineState === 'asked' || l.lineState === 'overdue' || l.lineState === 'unasked');
  const excluded = Array.isArray(stewardship.outOfPeriodLines) ? stewardship.outOfPeriodLines : [];

  // The assessor line writes the assessment; asking it for input into its own
  // act is not a question. Its state is `assessor`. For reconciliation, an
  // assessor line is NOT an accountable input line — it is the act being
  // reconciled, not one of the inputs to it.
  const accountable = inPeriod.filter((l) => l.lineState !== 'assessor' && l.lineState !== 'excluded');
  const settled = accountable.filter((l) => l.lineState === 'answered' || l.lineState === 'declined');
  const answeredAcct = answered.filter((l) => accountable.some((a) => a.key === l.key));

  // Build the per-line reconciliation row — one per accountable line, no
  // second hierarchy and no second matrix read.
  const thinChars = conv.assessmentReconciliationThinChars;
  const rows = accountable.map((line) => {
    const ans = line.answer || null;
    const outcome = ans?.outcome || null;
    const body = outcome === 'input' ? String(ans?.text || '') : '';
    const chars = textLen(body);
    const signal = outcome === 'input' ? (ans?.signal || null) : null;
    const signalRank = signal ? assessmentSignalRank(signal) : null;
    const thin = outcome === 'input' ? chars > 0 && chars < thinChars : false;
    return {
      key: line.key,
      role: line.role,
      kind: line.kind,
      managerId: line.managerId,
      managerName: line.managerName || line.managerId,
      fromISO: line.fromISO || '',
      toISO: line.toISO || '',
      inPeriod: true,
      lineState: line.lineState,
      lineStateLabel: line.lineStateLabel || line.lineState,
      settled: line.settled === true,
      answeredOn: ans?.answeredOn || '',
      outcome,
      chars,
      thin,
      signal,
      signalRank,
      signalLabel: signal ? (signalRank !== null ? signal : signal) : null,
      text: body,
      reason: outcome === 'declined' ? String(ans?.reason || '') : '',
      late: Boolean(ans?.late),
    };
  });

  const declinedRows = rows.filter((r) => r.lineState === 'declined');
  const answeredRows = rows.filter((r) => r.lineState === 'answered');
  const openRows = accountable.filter((l) => l.lineState === 'asked' || l.lineState === 'overdue' || l.lineState === 'unasked');

  // --------------------------------------------------------------- verdict
  let verdict;
  const refusals = [];

  if (openRows.length) {
    // An open packet cannot be reconciled without excluding a live question.
    // That exclusion would let the packet read as unanimous while an ask the
    // director authorised is still outstanding — the exact silence the module
    // exists to name.
    verdict = 'incomplete';
    refusals.push({
      kind: 'open-lines',
      lineKeys: openRows.map((l) => l.key),
      detail: `${openRows.length} line(s) in force during the period have not settled — they are ${openRows.map((l) => l.lineState).join(', ')} — so a comparison that excludes them would read as unanimous while a question the packet asked is still outstanding.`,
    });
  } else if (answeredRows.length === 0) {
    // Every accountable line declined or was excluded. The assessor's own
    // assessment still exists (the review), but there is nothing to reconcile:
    // \"every other line said nothing to add\" is itself the verdict.
    verdict = 'single-answer';
  } else if (answeredRows.length === 1) {
    verdict = 'single-answer';
  } else {
    // ≥2 answered lines — now ask whether their declared signals can be
    // compared without guessing what their paragraphs meant.
    const withSignal = answeredRows.filter((r) => r.signal && r.signalRank !== null);
    const withoutSignal = answeredRows.filter((r) => !r.signal || r.signalRank === null);

    if (withSignal.length < 2) {
      // Two answered lines but fewer than two declared a signal. Their prose
      // is printed side by side; divergence is NOT inferred from the prose,
      // because two paragraphs cannot be auto-compared without guessing.
      // The packet instead tells the director which lines left this blank.
      verdict = 'unrated-pair';
      if (withoutSignal.length) {
        refusals.push({
          kind: 'unrated-lines',
          lineKeys: withoutSignal.map((r) => r.key),
          detail: `${withoutSignal.length} answered line(s) left the coarse signal blank. Their free-text accounts are printed beside the rated lines, but divergence is not inferred from prose — guessing what a paragraph meant would be the exact failure this product refuses to commit.`,
        });
      }
    } else {
      // ≥2 lines with declared signals — compute the exact integer range
      // and compare against the declared divergence window. No float division,
      // no heuristic.
      const ranks = withSignal.map((r) => r.signalRank);
      const minRank = Math.min(...ranks);
      const maxRank = Math.max(...ranks);
      const gap = maxRank - minRank;

      // Thin detection: a substantive account is not a paragraph of filler — it
      // is an account that meets the declared floor. One line writing a
      // sentence while another wrote well above the floor is a prompt, not a
      // judgement about the person's performance.
      const thinRows = answeredRows.filter((r) => r.thin);
      const substantiveRows = answeredRows.filter((r) => !r.thin);
      const thinRatio = conv.assessmentReconciliationThinRatio;
      const maxChars = answeredRows.length ? Math.max(...answeredRows.map((r) => r.chars)) : 0;
      const hasMaterialThin = thinRows.length > 0 && substantiveRows.length > 0
        && thinRows.some((r) => maxChars > 0 && maxChars / Math.max(1, r.chars) >= thinRatio);

      if (gap >= conv.assessmentReconciliationDivergentSteps) {
        verdict = 'divergent';
      } else if (hasMaterialThin) {
        verdict = 'thin-input';
      } else {
        verdict = 'aligned';
      }

      if (thinRows.length && hasMaterialThin) {
        refusals.push({
          kind: 'thin-line',
          lineKeys: thinRows.map((r) => r.key),
          detail: `${thinRows.length} answered line(s) wrote fewer than ${thinChars} characters while at least one other answered line wrote ${maxChars} — a sentence beside a paragraph. Thin is not wrong, but it is a prompt to check whether the short account is actually that thin or merely undocumented.`,
        });
      }
      // When thin is the verdict itself it is already the headline; when
      // divergence wins, thin is an accompanying note, which is why the
      // refusal is still emitted alongside `divergent`.
    }
  }

  // Attach computed fields even when the verdict is `incomplete` or
  // `single-answer`, so the packet panel can print \"who spoke and who
  // declined\" without recomputing it.
  const withSignalAll = answeredRows.filter((r) => r.signal && r.signalRank !== null);
  let signalRange = null;
  let maxSignalGap = null;
  if (withSignalAll.length >= 2) {
    const ranks = withSignalAll.map((r) => r.signalRank);
    signalRange = { min: Math.min(...ranks), max: Math.max(...ranks) };
    maxSignalGap = signalRange.max - signalRange.min;
  }

  const thinRows = answeredRows.filter((r) => r.thin);
  const bySignal = new Map();
  for (const r of answeredRows) {
    if (!r.signal) continue;
    if (!bySignal.has(r.signal)) bySignal.set(r.signal, []);
    bySignal.get(r.signal).push(r);
  }

  // A packet whose accountable lines all declined is not \"divergent\" and it
  // is not \"aligned\" either. It is a packet where every second line said
  // \"nothing to add\" — that is itself a fact that calibration must respect,
  // so it reads as the settled signal `single-answer` rather than as a
  // comparison that could never be drawn.
  //
  // A declined line is never counted as evidence and never given a zero
  // signal. It is excluded from the reconciliation and printed separately,
  // because treating \"declined\" as \"agreed\" would let silence be read as
  // endorsement of the assessor's assessment.
  const meta = assessmentReconciliationVerdict(verdict);

  return {
    engineVersion: ASSESSMENT_RECONCILIATION_ENGINE_VERSION,
    reviewId: stewardship.reviewId || review.id,
    personId: stewardship.personId || review.personId,
    personName: stewardship.personName || null,
    periodStart: stewardship.periodStart,
    periodEnd: stewardship.periodEnd,
    status: stewardship.status || review.status || null,
    isMatrix: true,
    verdict,
    verdictLabel: meta?.label || verdict,
    verdictTone: meta?.tone || 'neutral',
    verdictDetail: meta?.detail || '',
    lines: rows,
    answeredLines: answeredRows,
    declinedLines: declinedRows,
    excludedLines: excluded,
    assessorLine: assessor ? {
      key: assessor.key,
      managerId: assessor.managerId,
      managerName: assessor.managerName || assessor.managerId,
      kind: assessor.kind,
      role: assessor.role,
      lineState: assessor.lineState,
    } : null,
    inPeriodN: accountable.length,
    answeredN: answeredRows.length,
    declinedN: declinedRows.length,
    openN: openRows.length,
    withSignalN: withSignalAll.length,
    thinLines: thinRows,
    thinN: thinRows.length,
    bySignal: Array.from(bySignal.entries()).map(([signal, lines]) => ({
      signal, n: lines.length, lineKeys: lines.map((l) => l.key),
    })),
    signalRange,
    maxSignalGap,
    conventions: conv,
    today,
    refusals,
    stewardshipVerdict: stewardship.verdict || null,
    stewardshipTone: stewardship.verdictTone || null,
  };
}

/* ------------------------------------------------------------- board + CSV */

export function assessmentReconciliationBoard(state, { now = new Date(), settings = null, limit = ASSESSMENT_RECONCILIATION_LIMITS.board } = {}) {
  const conv = normalizeAssessmentReconciliationSettings(settings || state?.settings || {});
  const reviews = Array.isArray(state?.reviews) ? state.reviews : [];
  const reports = [];
  for (const review of reviews) {
    if (!review || !review.id || !review.personId || !review.periodStart || !review.periodEnd) continue;
    const rec = buildAssessmentReconciliation(state, review, { now, settings });
    if (!rec.isMatrix) continue;
    reports.push(rec);
  }

  // Board sorts worst-first, then by period end, then by person name — the
  // director's reading is \"which packets need the calibration conversation
  // most\", not alphabetical order.
  const order = new Map([
    ['incomplete', 0], ['single-answer', 1], ['unrated-pair', 2], ['thin-input', 3], ['divergent', 4], ['aligned', 5], ['single-chain', 6],
  ]);
  reports.sort((a, b) => (order.get(a.verdict) ?? 9) - (order.get(b.verdict) ?? 9)
    || String(b.periodEnd).localeCompare(String(a.periodEnd))
    || String(a.personName || '').localeCompare(String(b.personName || '')));

  const byVerdict = new Map([
    ['single-chain', 0], ['incomplete', 0], ['single-answer', 0], ['unrated-pair', 0], ['thin-input', 0], ['divergent', 0], ['aligned', 0],
  ]);
  for (const r of reports) byVerdict.set(r.verdict, (byVerdict.get(r.verdict) || 0) + 1);

  const openKeys = new Set(['incomplete', 'single-answer', 'unrated-pair', 'thin-input', 'divergent']);
  const open = reports.filter((r) => openKeys.has(r.verdict));

  const sum = (pick) => reports.reduce((acc, r) => acc + pick(r), 0);

  return {
    engineVersion: ASSESSMENT_RECONCILIATION_ENGINE_VERSION,
    conventions: conv,
    today: dayKey(now),
    reports,
    shown: reports.slice(0, limit),
    truncatedN: Math.max(0, reports.length - limit),
    matrixReviewN: reports.length,
    openN: open.length,
    alignedN: byVerdict.get('aligned') || 0,
    divergentN: byVerdict.get('divergent') || 0,
    thinN: byVerdict.get('thin-input') || 0,
    unratedN: byVerdict.get('unrated-pair') || 0,
    singleAnswerN: byVerdict.get('single-answer') || 0,
    incompleteN: byVerdict.get('incomplete') || 0,
    singleChainN: reviews.length - reports.length,
    byVerdict: Array.from(byVerdict.entries()).map(([key, n]) => {
      const meta = assessmentReconciliationVerdict(key);
      return { key, label: meta?.label || key, n };
    }),
    answeredLinesN: sum((r) => r.answeredN),
    declinedLinesN: sum((r) => r.declinedN),
    openLinesN: sum((r) => r.openN),
    thinLinesN: sum((r) => r.thinN),
    divergentPackets: reports.filter((r) => r.verdict === 'divergent'),
  };
}

export function assessmentReconciliationBriefText(state, { now = new Date(), settings = null } = {}) {
  const board = assessmentReconciliationBoard(state, { now, settings, limit: 0 });
  if (!board.matrixReviewN) {
    return `Cross-line assessment reconciliation — ${board.today}: no performance review in this workspace covers a person who sat on more than one reporting line. There is nothing to reconcile, which is a different claim than \"every line agreed\".`;
  }
  const lines = [
    `Cross-line assessment reconciliation — ${board.today}.`,
    `${board.matrixReviewN} review packet(s) cover a matrixed person; ${board.alignedN} are aligned across their lines, ${board.divergentN} are divergent by two or more steps on the shared scale, ${board.thinN} have a materially thin line, ${board.unratedN} have no declared signal to compare, ${board.singleAnswerN} have only one line's answer, and ${board.incompleteN} are still waiting for a line to settle.`,
    `Lines on those packets: ${board.answeredLinesN} answered with text, ${board.declinedLinesN} declined with a stated reason, ${board.openLinesN} still open. ${board.thinLinesN} answered lines are thin — fewer than ${board.conventions.assessmentReconciliationThinChars} characters while another answered line on the same packet wrote well above it.`,
    'No per-line contribution share is reported and no sentiment is inferred from prose; divergence is only computed from declared coarse signals on the shared scale. A thin answer is flagged as thin, not as uncaring, and an unrated pair is never counted as aligned.',
  ];
  if (board.singleChainN) lines.push(`${board.singleChainN} further review(s) are single-chain and are unaffected by this reading.`);
  return lines.join(' ');
}

export const ASSESSMENT_RECONCILIATION_CSV_COLUMNS = Object.freeze([
  'review_id', 'person_id', 'person_name', 'period_start', 'period_end', 'review_status',
  'stewardship_verdict', 'reconciliation_verdict', 'reconciliation_label',
  'line_key', 'line_role', 'line_kind', 'manager_id', 'manager_name',
  'line_state', 'answer_outcome', 'chars', 'thin', 'signal', 'signal_rank', 'answer_late',
  'answer_text', 'decline_reason',
]);

export function assessmentReconciliationCsvRows(state, { now = new Date(), settings = null } = {}) {
  const board = assessmentReconciliationBoard(state, { now, settings, limit: Number.MAX_SAFE_INTEGER });
  const rows = [];
  for (const rec of board.reports) {
    for (const line of rec.lines) {
      rows.push({
        review_id: rec.reviewId,
        person_id: rec.personId,
        person_name: rec.personName || '',
        period_start: rec.periodStart,
        period_end: rec.periodEnd,
        review_status: rec.status || '',
        stewardship_verdict: rec.stewardshipVerdict || '',
        reconciliation_verdict: rec.verdict,
        reconciliation_label: rec.verdictLabel,
        line_key: line.key,
        line_role: line.role,
        line_kind: line.kind || '',
        manager_id: line.managerId,
        manager_name: line.managerName || '',
        line_state: line.lineState,
        answer_outcome: line.outcome || '',
        chars: String(line.chars),
        thin: line.thin ? 'yes' : 'no',
        signal: line.signal || '',
        signal_rank: line.signalRank !== null && line.signalRank !== undefined ? String(line.signalRank) : '',
        answer_late: line.late ? 'yes' : 'no',
        answer_text: line.text || '',
        decline_reason: line.reason || '',
      });
    }
  }
  return rows;
}

export function assessmentReconciliationAttentionCount(state, { now = new Date(), settings = null } = {}) {
  return assessmentReconciliationBoard(state, { now, settings, limit: 0 }).openN;
}
