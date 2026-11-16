/**
 * app/core/domain/sourcing.js — the pure read model for ADR-0229
 * (Capability Sourcing & Firm-Boundary Register, `RULE-SRC-01`).
 *
 * `buildSourcing(state, { now, settings, seat })` is a pure function of the
 * stored cases, options and acts plus an injected clock. Nothing is written and
 * nothing derived is stored: every total, verdict, exposure and coverage claim
 * is re-derived on every read, so a hand-edited file cannot carry a comparison
 * its own rows do not imply.
 *
 * THE FOUR THINGS THIS PAGE KEEPS APART, AND NEVER MERGES
 * ------------------------------------------------------
 *  1. **The comparison.** Two totals are the same question only when they were
 *     priced in the same currency, over the same horizon, at the same discount
 *     rate. When they were not, the case reads `not-comparable` and the reason
 *     is printed — an exchange rate is never invented and horizons are never
 *     reconciled by assuming one.
 *  2. **The hold-up.** Specificity is a property of the ASSET; a safeguard is a
 *     property of the CONTRACT. Whether the second answers the first is a
 *     computed fact about a pair, and a safeguard that cannot answer the
 *     declared specificity is printed as not answering it. It is never counted
 *     as reassurance.
 *  3. **The decision.** A decision dearer than the cheapest comparable option
 *     is a judgement, not an error: it is printed as a premium, in cents and in
 *     basis points, with the written reason that accompanied it. The register
 *     never overrides it and never calls it a mistake.
 *  4. **The learning.** The frozen assumptions are graded once, after the
 *     declared review date, against the costs that actually landed — and below
 *     the declared floor no calibration figure is printed at all, because a
 *     bias computed from three cases is a story, not a measurement.
 *
 * WHAT IT REFUSES TO DO. It does not infer a cost from an envelope, an invoice
 * or a headcount. It does not convert a currency. It does not score a vendor or
 * a person. It does not recommend a mode. It does not block a decision, and it
 * does not re-open one.
 */

import { LEADER_ID } from './chain.js';
import { altitudeRank } from './chainRegistry.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import {
  SRC_COST_LINE_KEYS,
  SRC_CSV_COLUMNS,
  SRC_FLAGS,
  SRC_LIMITS as L,
  SRC_METHOD,
  SRC_MODE_KEYS,
  SRC_SAFEGUARDS,
  SRC_SECTION_TITLES,
  SRC_SPECIFICITY,
  SRC_STATES,
  SRC_STRATEGIC_WEIGHTS,
  SRC_VERDICTS,
  SRC_ADR,
  SRC_ENGINE_VERSION,
  SRC_RULE_ID,
  srcComparabilityKey,
  srcCostLine,
  srcMode,
  srcSafeguard,
  srcSafeguardAnswers,
} from './sourcingRegistry.js';
import {
  normalizeSourcingActs,
  normalizeSourcingCases,
  normalizeSourcingOptions,
  srcDaysBetween,
  srcSumCents,
  srcText,
  srcPresentValueCents,
  readStoredCents,
} from './sourcingSchema.js';

const SPECIFICITY_BY_KEY = Object.freeze(Object.fromEntries(SRC_SPECIFICITY.map((row) => [row.key, row])));
const MODE_LABEL = Object.freeze(Object.fromEntries(SRC_MODE_KEYS.map((key) => [key, srcMode(key)?.label || key])));
const SAFEGUARD_LABEL = Object.freeze(Object.fromEntries(SRC_SAFEGUARDS.map((row) => [row.key, row.label])));
const VERDICT = Object.freeze(Object.fromEntries(SRC_VERDICTS.map((row) => [row.key, row])));
const STATE_LABEL = Object.freeze(Object.fromEntries(SRC_STATES.map((row) => [row.key, row.label])));
const WEIGHT_BY_KEY = Object.freeze(Object.fromEntries(SRC_STRATEGIC_WEIGHTS.map((row) => [row.key, row])));

const DAY_MS = 86_400_000;

function toMs(value, name) {
  const ms = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ms)) throw new TypeError(`buildSourcing: \`${name}\` must be a valid instant`);
  return ms;
}

const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * The seats the boundary decision could be asked of, computed from the live
 * reporting graph over EVERY line the capability sits on.
 *
 * This is `matrixJointApex` over the managers of the declared lines — the lowest
 * seat above all of them — filtered to the chief altitude. A single-line
 * capability resolves to that line's manager's manager; a genuine diamond
 * resolves to several joint apexes and asks every one; a graph that cannot
 * resolve asks nobody and says so.
 */
/**
 * Who may move the boundary of the firm for this capability?
 *
 * The question is NOT "which seat is the closest common manager" — that seat is
 * almost always a director, and a director may not decide what the firm owns.
 * It is "which seats sit at or above the required altitude on the path from the
 * capability to the top of its own branch". The recipe, in order:
 *
 *   1. the capability's holders must be on the matrix;
 *   2. every manager of a holder is a starting point — no manager, no authority
 *      to prove, because the register never invents a reporting line;
 *   3. the joint apex of those managers bounds the region of interest: if there
 *      is no single apex the graph is disconnected and nobody is asked;
 *   4. from the apex set, walk UP each branch and collect the nearest seat that
 *      reaches the required altitude. A rank-3 director is walked past; a rank-5
 *      chief is taken; the workspace apex is a rank-5 seat by construction and is
 *      therefore reachable from every branch — which is the point of the apex.
 *   5. a seat that is dominated by another qualifying seat (i.e. sits BELOW it)
 *      is dropped, so one decision produces one addressee.
 *
 * `chiefQueue` means the only qualifying authority is the workspace apex itself:
 * the decision is made above every roster seat and is printed as such rather
 * than handed to a director.
 */
export function resolveAuthority(matrix, holderIds, minRank) {
  const rankOf = (id) => altitudeRank(matrix?.nodes?.get(id)?.altitude) || 0;
  const holders = [...new Set((Array.isArray(holderIds) ? holderIds : []).filter((id) => matrix?.nodes?.has(id)))].sort();
  const empty = (state, extra = {}) => ({
    state, requiredRank: minRank, seatIds: [], chiefQueue: false,
    disconnected: state === 'no-joint-apex' || state === 'no-holder', topReached: false, ...extra,
  });
  if (!matrix || !holders.length) return empty('no-holder');

  const managerIds = new Set();
  for (const holderId of holders) {
    for (const line of matrix.linesByPerson?.get(holderId) || []) {
      if (line?.managerId && matrix.nodes.has(line.managerId) && line.managerId !== holderId) managerIds.add(line.managerId);
    }
  }
  if (!managerIds.size) return empty('no-joint-apex');

  const apex = matrixJointApex(matrix, [...managerIds]);
  if (!apex.apexIds.length) return empty('no-joint-apex', { ambiguous: Boolean(apex.ambiguous) });

  // Every seat on a branch from an apex upward that reaches the required rank.
  const qualify = new Set();
  for (const apexId of apex.apexIds) {
    const node = matrix.nodes.get(apexId);
    const branch = [apexId, ...(node?.ancestors || [])].filter((id) => matrix.nodes.has(id));
    const atRank = branch.filter((id) => rankOf(id) >= minRank);
    // Keep the NEAREST qualifying seat per branch: the closest one that is high
    // enough is the one that owns the decision, not every seat above it.
    const ranked = atRank
      .slice()
      .sort((a, b) => (rankOf(a) - rankOf(b)) || ((matrix.nodes.get(b)?.depth ?? 0) - (matrix.nodes.get(a)?.depth ?? 0)));
    if (ranked.length) qualify.add(ranked[0]);
  }
  if (!qualify.size) return empty('no-authority-at-rank', { topReached: true });

  // Drop any qualifying seat that another qualifying seat sits above.
  const minimal = [...qualify].filter((candidate) => ![...qualify].some((other) => other !== candidate
    && matrix.nodes.get(other)?.ancestors?.has(candidate))).sort();

  const rosterSeats = minimal.filter((id) => id !== LEADER_ID).sort();
  const includesLeader = minimal.includes(LEADER_ID);
  return {
    state: rosterSeats.length && includesLeader ? 'seat-and-chief' : includesLeader ? 'chief-queue' : 'joint-apex',
    requiredRank: minRank,
    seatIds: rosterSeats,
    chiefQueue: includesLeader,
    disconnected: false,
    topReached: true,
    ambiguous: Boolean(apex.ambiguous),
    apexIds: minimal,
  };
}

/**
 * Price one option exactly. One-time and recurring sums are kept apart in
 * BigInt; the present value is computed once, after both are known, so the
 * printed total is the same number however the lines were ordered.
 */
function priceOption(option, caseRow) {
  const oneTime = srcSumCents(option.lines.filter((line) => line.bucket === 'one-time'), (line) => line.cents);
  const recurring = srcSumCents(option.lines.filter((line) => line.bucket === 'recurring'), (line) => line.cents);
  const refusedLines = oneTime.refused + recurring.refused;
  const comparableKey = srcComparabilityKey({
    currency: option.currency,
    horizonDays: option.horizonDays,
    discountBp: option.discountBp,
  });
  const caseKey = srcComparabilityKey({
    currency: caseRow.currency,
    horizonDays: caseRow.horizonDays,
    discountBp: caseRow.discountBp,
  });
  const mismatches = [];
  if (option.currency !== caseRow.currency) mismatches.push('currency');
  if (option.horizonDays !== caseRow.horizonDays) mismatches.push('horizon');
  if (option.discountBp !== caseRow.discountBp) mismatches.push('discount');

  const total = mismatches.length
    ? null
    : srcPresentValueCents({
      oneTimeCents: Number(oneTime.cents),
      recurringCents: Number(recurring.cents),
      horizonDays: caseRow.horizonDays,
      discountBp: caseRow.discountBp,
    });

  const specificity = SPECIFICITY_BY_KEY[caseRow.specificity] || null;
  const answering = option.safeguards.filter((key) => srcSafeguardAnswers(key, caseRow.specificity));
  const answeringBp = Math.min(10_000, answering.reduce((sum, key) => sum + (srcSafeguard(key)?.strengthBp || 0), 0));

  return {
    id: option.id,
    mode: option.mode,
    modeLabel: MODE_LABEL[option.mode] || option.mode,
    recordedById: option.recordedById,
    recordedOn: option.recordedOn,
    note: option.note,
    currency: option.currency,
    horizonDays: option.horizonDays,
    discountBp: option.discountBp,
    comparableKey,
    /** The key the case declared. Equal keys mean the same question was priced. */
    caseKey,
    comparable: mismatches.length === 0 && total !== null,
    mismatches,
    oneTimeCents: Number(oneTime.cents),
    recurringCents: Number(recurring.cents),
    totalCents: total,
    lineCount: option.lines.length,
    lines: option.lines
      .slice()
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((line) => ({
        key: line.key,
        label: srcCostLine(line.key)?.label || line.key,
        bucket: line.bucket,
        cents: line.cents,
      })),
    refusedLines,
    safeguards: option.safeguards.slice(),
    safeguardLabels: option.safeguards.map((key) => SAFEGUARD_LABEL[key] || key),
    answeringSafeguards: answering,
    answeringBp,
    specificityRank: specificity?.rank ?? null,
    holdUpExposure: specificity?.rank ?? 0,
    /** A safeguard that cannot answer the declared specificity is not reassurance. */
    answered: answeringBp > 0,
    exposed: (specificity?.rank || 0) >= 2 && answeringBp === 0,
  };
}

/** Count rows by a key, into a fully pre-seeded bucket map. */
function countBy(rows, key, seedKeys) {
  const out = Object.fromEntries(seedKeys.map((k) => [k, 0]));
  for (const row of rows) out[row[key]] = (out[row[key]] || 0) + 1;
  return out;
}

/** The cheapest priced option, or a printed refusal to pick one. */
function cheapestOf(priced) {
  if (!priced.length) return { cents: null, optionIds: [], modes: [], tied: false, reason: 'no priced option on the record' };
  let min = null;
  for (const option of priced) {
    if (min === null || option.totalCents < min) min = option.totalCents;
  }
  const winners = priced.filter((option) => option.totalCents === min);
  if (winners.length > 1) {
    // Two modes that cost the same cent are NOT ordered by the register. It
    // prints every tied mode and refuses to name one, because a tie-break here
    // would be a sourcing recommendation the record does not support.
    return {
      cents: Number(min),
      optionIds: winners.map((option) => option.id),
      modes: winners.map((option) => option.mode),
      tied: true,
      reason: `${winners.length} comparable option(s) share the same total cost; the register prints every tied mode and picks none.`,
    };
  }
  return { cents: Number(min), optionIds: [winners[0].id], modes: [winners[0].mode], tied: false, reason: '' };
}

/**
 * One case, evaluated in full. Pure over (case, options, acts, asOf, matrix).
 */
function evaluateCase(caseRow, options, acts, asOfMs, matrix) {
  const today = dayOf(asOfMs);
  const optionsForCase = options
    .filter((option) => option.caseId === caseRow.id)
    .sort((a, b) => a.recordedOn.localeCompare(b.recordedOn) || a.id.localeCompare(b.id));

  const pricedAll = optionsForCase.map((option) => priceOption(option, caseRow));
  const comparable = pricedAll.filter((option) => option.comparable);
  const excluded = pricedAll.filter((option) => !option.comparable);

  const sidesPresent = new Set(comparable.map((option) => option.mode));
  const decisionActs = acts
    .filter((act) => act.caseId === caseRow.id && act.kind === 'decide' && act.at >= caseRow.declaredOn)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const firstDecision = decisionActs[0] || null;
  // A second decision is refused by the door; a record carrying two is printed
  // as history with the FIRST one governing, so a hand-edited import cannot
  // retro-change which mode the firm chose.
  const extraDecisions = decisionActs.slice(1);
  const decidedOption = firstDecision
    ? pricedAll.find((option) => option.id === firstDecision.optionId) || null
    : null;

  const gradeActs = acts
    .filter((act) => act.caseId === caseRow.id && act.kind === 'grade' && act.at >= caseRow.declaredOn)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const grade = gradeActs[0] || null;

  // A "cheapest" figure needs something to be cheaper THAN. With one side on the
  // record the honest answer is no benchmark at all — not the single price
  // dressed up as a comparison the firm never made.
  // Once a DECISION is on the record, the premium must be measured against the
  // best alternative the firm actually had — so a benchmark is still computed for
  // a decided case even if only one comparable side survives, because the chosen
  // option is itself one of the two sides being compared.
  const benchmarkable = sidesPresent.size >= 2 || Boolean(firstDecision);
  const cheapest = benchmarkable
    ? cheapestOf(comparable)
    : { cents: null, optionIds: [], modes: [], tied: false, reason: comparable.length
      ? 'only one mode is priced on this case’s own terms, so there is no second side to price against'
      : 'no priced option on the record' };
  const withheld = caseRow.withdrawnOn && caseRow.withdrawnOn <= today;

  /* ---- state: what the record can currently support ----
   * `one-sided` is about the SIDE, not the row count: one comparable option is
   * still one side of the question, and a case carrying four options all priced
   * as `make` has not been compared with anything. */
  let state;
  if (firstDecision) state = 'decided';
  else if (!pricedAll.length) state = 'declared';
  else if (sidesPresent.size < 2) state = 'one-sided';
  else state = 'comparable';

  /* ---- the hold-up reading, per option and at case level ---- */
  const exposedOptions = pricedAll.filter((option) => option.exposed);
  const answeringOptions = pricedAll.filter((option) => option.answered);
  const specificity = SPECIFICITY_BY_KEY[caseRow.specificity] || null;
  const specificityNeedsSafeguard = (specificity?.rank || 0) >= 2;
  const holdUpUnaddressed = specificityNeedsSafeguard && answeringOptions.length === 0;
  const holdUpBasis = specificityNeedsSafeguard
    ? (holdUpUnaddressed
      ? `The capability is declared ${specificity.label.toLowerCase()}. No recorded option carries a safeguard that answers that specificity, so the exposure at renewal is not addressed anywhere on the record.`
      : `${answeringOptions.length} of ${pricedAll.length} recorded option(s) carry a safeguard that answers the declared ${specificity.key} specificity.`)
    : `The capability is declared ${specificity?.label?.toLowerCase() || 'unassessed'}; no safeguard is required at this level of specificity and none is credited.`;

  /* ---- verdict: declared precedence, first match wins ---- */
  let verdict = 'decided';
  let verdictReason = '';
  const triggers = [];
  // A COMPARISON needs two sides. One priced side, however many rows carry it,
  // is not a question the register can put to anybody — so the case reads
  // `not-comparable` and the missing side is named.
  if (!pricedAll.length) triggers.push('not-comparable');
  else if (sidesPresent.size < 2) triggers.push('not-comparable');
  if (holdUpUnaddressed) triggers.push('safeguard-missing');
  if (!firstDecision && sidesPresent.size >= 2) triggers.push('decision-owed');
  if (firstDecision && decidedOption) {
    // A decision that selects an option which does not answer the specificity
    // while another priced option DID answer it is the one genuine mismatch the
    // record can prove: the basis was available and was not followed.
    if (specificityNeedsSafeguard && !decidedOption.answered && answeringOptions.length > 0) {
      triggers.push('mismatch');
    } else if (cheapest.cents !== null && decidedOption.totalCents !== null && decidedOption.totalCents > cheapest.cents) {
      triggers.push('decided-premium');
    } else {
      triggers.push('decided');
    }
  }
  const order = SRC_VERDICTS.map((row) => row.key);
  triggers.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (triggers.length) verdict = triggers[0];
  if (verdict === 'not-comparable') {
    const why = [...new Set(excluded.flatMap((option) => option.mismatches))].sort().join(', ');
    if (!pricedAll.length) {
      verdictReason = 'No option is recorded on this case yet, so there is no comparison to make.';
    } else if (sidesPresent.size < 2) {
      // Name the side that is missing without inventing it.
      const present = [...sidesPresent].sort();
      const missing = ['make', 'buy', 'partner', 'hybrid'].filter((key) => !present.includes(key));
      verdictReason = `${excluded.length
        ? `${excluded.length} recorded option(s) priced a different question (${why}). `
        : ''}Only ${present.length ? `${present.length} side (${present.join(' / ')})` : 'no side'} is priced on this case’s own ${caseRow.currency} / ${caseRow.horizonDays} days / ${caseRow.discountBp}bp terms. A comparison needs a second side — ${missing.length ? `one of ${missing.join(', ')}` : 'another mode'} — recorded on the same terms, and the register will not price one for you.`;
    } else {
      verdictReason = `${excluded.length} recorded option(s) priced a different question (${why}). The case declares ${caseRow.currency} over ${caseRow.horizonDays} days at ${caseRow.discountBp}bp; a total priced otherwise is not a comparison.`;
    }
  } else if (verdict === 'safeguard-missing') {
    verdictReason = holdUpBasis;
  } else if (verdict === 'decision-owed') {
    verdictReason = `Both sides are priced over the same terms and no boundary decision is on the record. The cheapest comparable option is ${cheapest.tied ? 'a tie across ' + cheapest.modes.join(' / ') : (MODE_LABEL[cheapest.modes[0]] || cheapest.modes[0])} at ${caseRow.currency} ${(cheapest.cents / 100).toFixed(2)}.`;
  } else if (verdict === 'mismatch') {
    verdictReason = `The chosen option carries no safeguard that answers the declared ${specificity?.key} specificity, while ${answeringOptions.length} priced option(s) on the same record did. Nothing is blocked; the difference is printed so the decision can be revisited deliberately.`;
  } else if (verdict === 'decided-premium') {
    verdictReason = `The chosen option costs ${caseRow.currency} ${(decidedOption.totalCents / 100).toFixed(2)} against the cheapest comparable ${caseRow.currency} ${(cheapest.cents / 100).toFixed(2)} — a premium the leader recorded a reason for.`;
  } else if (verdict === 'decided') {
    verdictReason = `The chosen option is the cheapest comparable option and its safeguards answer the declared specificity.`;
  }

  const premiumCents = (firstDecision && decidedOption && cheapest.cents !== null && decidedOption.totalCents !== null)
    ? decidedOption.totalCents - cheapest.cents
    : null;
  const premiumBp = (premiumCents !== null && cheapest.cents) ? Math.round((premiumCents * 10_000) / cheapest.cents) : (premiumCents === 0 ? 0 : null);

  /* ---- flags ---- */
  const flags = [];
  const reviewOverdue = Boolean(caseRow.reviewOn && caseRow.reviewOn < today);
  if (reviewOverdue && !grade && !withheld) flags.push(SRC_FLAGS.reviewOverdue);
  if (holdUpUnaddressed && !withheld) flags.push(SRC_FLAGS.noSafeguard);
  if (exposedOptions.length && !withheld) flags.push(SRC_FLAGS.holdUp);
  if (state === 'one-sided' || (comparable.length && sidesPresent.size < 2)) flags.push(SRC_FLAGS.singleSource);
  if (decidedOption && !decidedOption.answered && specificityNeedsSafeguard) flags.push(SRC_FLAGS.premiumUnexplained);

  /* ---- the grade, and what the frozen assumption cost us ---- */
  let grading = null;
  if (grade) {
    const actual = {
      make: readStoredCents(grade.actualMakeCents),
      buy: readStoredCents(grade.actualBuyCents),
    };
    const frozen = {
      make: comparable.find((option) => option.mode === 'make')?.totalCents ?? null,
      buy: comparable.find((option) => option.mode === 'buy')?.totalCents ?? null,
    };
    const perSide = {};
    for (const side of ['make', 'buy']) {
      if (actual[side] === null || frozen[side] === null || frozen[side] === 0) continue;
      const delta = actual[side] - frozen[side];
      perSide[side] = {
        actualCents: actual[side],
        frozenCents: frozen[side],
        deltaCents: delta,
        biasBp: Math.round((delta * 10_000) / frozen[side]),
        overran: delta > 0,
      };
    }
    grading = { at: grade.at, actorId: grade.actorId, lesson: grade.lesson, actual, frozen, perSide, sides: Object.keys(perSide) };
  }

  const authority = resolveAuthority(matrix, [caseRow.ownerId, ...caseRow.lineIds], 5);

  return {
    id: caseRow.id,
    title: caseRow.title,
    ownerId: caseRow.ownerId,
    lineIds: caseRow.lineIds.slice(),
    currency: caseRow.currency,
    horizonDays: caseRow.horizonDays,
    discountBp: caseRow.discountBp,
    specificity: caseRow.specificity,
    specificityLabel: specificity?.label || caseRow.specificity,
    specificityRank: specificity?.rank ?? 0,
    specificitySays: specificity?.says || '',
    weight: caseRow.weight,
    weightLabel: WEIGHT_BY_KEY[caseRow.weight]?.label || caseRow.weight,
    declaredOn: caseRow.declaredOn,
    reviewOn: caseRow.reviewOn,
    withdrawnOn: caseRow.withdrawnOn,
    withdrawn: Boolean(withheld),
    reason: caseRow.reason,
    state,
    stateLabel: STATE_LABEL[state],
    verdict,
    verdictLabel: VERDICT[verdict]?.label || verdict,
    verdictTone: VERDICT[verdict]?.tone || 'neutral',
    verdictReason,
    triggers,
    options: pricedAll,
    comparableOptions: comparable.map((option) => option.id),
    excludedOptions: excluded.map((option) => ({ id: option.id, mode: option.mode, mismatches: option.mismatches })),
    sidesPresent: [...sidesPresent].sort(),
    cheapest,
    decision: firstDecision
      ? {
        id: firstDecision.id,
        actorId: firstDecision.actorId,
        at: firstDecision.at,
        mode: firstDecision.mode,
        modeLabel: MODE_LABEL[firstDecision.mode] || firstDecision.mode,
        optionId: firstDecision.optionId,
        rationale: firstDecision.rationale,
        safeguards: firstDecision.safeguards.slice(),
        answeringSafeguards: firstDecision.safeguards.filter((key) => srcSafeguardAnswers(key, caseRow.specificity)),
        optionPriced: Boolean(decidedOption),
      }
      : null,
    extraDecisions: extraDecisions.length,
    decidedOption: decidedOption
      ? {
        id: decidedOption.id,
        mode: decidedOption.mode,
        totalCents: decidedOption.totalCents,
        answered: decidedOption.answered,
        answeringSafeguards: decidedOption.answeringSafeguards,
      }
      : null,
    premiumCents,
    premiumBp,
    holdUp: {
      needsSafeguard: specificityNeedsSafeguard,
      unaddressed: holdUpUnaddressed,
      exposureRank: specificity?.rank ?? 0,
      exposedOptionIds: exposedOptions.map((option) => option.id),
      answeringOptionIds: answeringOptions.map((option) => option.id),
      basis: holdUpBasis,
    },
    reviewOverdue,
    gradeOwed: Boolean(reviewOverdue && !grade && !withheld),
    grading,
    flags,
    authority,
  };
}

/**
 * Build the sourcing register from stored state.
 *   state.sourcingCases   — declared capability cases
 *   state.sourcingOptions — priced options, per mode
 *   state.sourcingActs    — boundary decisions and independent grades
 */
export function buildSourcing(state, { now, settings = null, seat = null } = {}) {
  const asOfMs = toMs(now, 'now');
  const today = dayOf(asOfMs);
  const warnings = [];

  const cases = normalizeSourcingCases(state?.sourcingCases, warnings);
  const options = normalizeSourcingOptions(state?.sourcingOptions, cases, warnings);
  const acts = normalizeSourcingActs(state?.sourcingActs, cases, warnings);

  let matrix = null;
  let matrixError = null;
  try {
    matrix = buildMatrix(state, { now: new Date(asOfMs), settings: { ...(settings || {}), activeSeatId: null } });
  } catch (error) {
    matrixError = String(error?.message || error || 'the reporting graph could not be read');
  }

  const rows = cases
    .map((caseRow) => evaluateCase(caseRow, options, acts, asOfMs, matrix))
    .sort((a, b) => a.id.localeCompare(b.id));

  /* ---- the two claims, reported separately ---- */
  const stateCounts = countBy(rows, 'state', SRC_STATES.map((row) => row.key));
  const verdictCounts = countBy(rows, 'verdict', SRC_VERDICTS.map((row) => row.key));
  const stateCountsReconcile = SRC_STATES.reduce((sum, row) => sum + stateCounts[row.key], 0) === rows.length;
  const verdictCountsReconcile = SRC_VERDICTS.reduce((sum, row) => sum + verdictCounts[row.key], 0) === rows.length;

  /* ---- per currency, never pooled ---- */
  const currencies = [...new Set(rows.map((row) => row.currency))].sort();
  const byCurrency = currencies.map((currency) => {
    const scoped = rows.filter((row) => row.currency === currency);
    const live = scoped.filter((row) => !row.withdrawn);
    const decided = live.filter((row) => row.decision && row.decidedOption && row.decidedOption.totalCents !== null);
    const chosenSum = srcSumCents(decided, (row) => row.decidedOption.totalCents);
    const cheapestSum = srcSumCents(decided.filter((row) => row.cheapest.cents !== null), (row) => row.cheapest.cents);
    const premiumSum = srcSumCents(decided.filter((row) => row.premiumCents !== null && row.premiumCents >= 0), (row) => row.premiumCents);
    return {
      currency,
      cases: scoped.length,
      live: live.length,
      comparable: live.filter((row) => row.state === 'comparable' || row.state === 'decided').length,
      decided: decided.length,
      undecided: live.filter((row) => !row.decision).length,
      holdUpUnaddressed: live.filter((row) => row.holdUp.unaddressed).length,
      reviewOverdue: live.filter((row) => row.reviewOverdue).length,
      chosenTotalCents: chosenSum.refused ? null : Number(chosenSum.cents),
      chosenRefused: chosenSum.refused,
      cheapestTotalCents: cheapestSum.refused ? null : Number(cheapestSum.cents),
      cheapestRefused: cheapestSum.refused,
      premiumTotalCents: premiumSum.refused ? null : Number(premiumSum.cents),
      premiumRefused: premiumSum.refused,
      premiumBp: (chosenSum.cents > 0n && premiumSum.cents >= 0n)
        ? Number((premiumSum.cents * 10_000n) / chosenSum.cents)
        : null,
    };
  });

  /* ---- per line, for matrix correctness ---- */
  const lineIds = [...new Set(rows.flatMap((row) => row.lineIds))].sort();
  const byLine = lineIds.map((lineId) => {
    const scoped = rows.filter((row) => lineIds.includes(lineId) && row.lineIds.includes(lineId) && !row.withdrawn);
    return {
      lineId,
      cases: scoped.length,
      decided: scoped.filter((row) => row.decision).length,
      holdUpUnaddressed: scoped.filter((row) => row.holdUp.unaddressed).length,
      currencies: [...new Set(scoped.map((row) => row.currency))].sort(),
    };
  });

  /* ---- coverage: the cases the register cannot speak for ---- */
  const live = rows.filter((row) => !row.withdrawn);
  const coverage = {
    casesTotal: rows.length,
    liveN: live.length,
    withdrawnN: rows.length - live.length,
    withNoOptionN: live.filter((row) => !row.options.length).length,
    oneSidedN: live.filter((row) => row.state === 'one-sided').length,
    notComparableN: live.filter((row) => row.verdict === 'not-comparable' && row.options.length > 0).length,
    decisionOwedN: live.filter((row) => row.verdict === 'decision-owed').length,
    holdUpUnaddressedN: live.filter((row) => row.holdUp.unaddressed).length,
    reviewOverdueN: live.filter((row) => row.reviewOverdue).length,
    gradeOwedN: live.filter((row) => row.gradeOwed).length,
    gradedN: rows.filter((row) => row.grading).length,
    excludedOptionN: rows.reduce((sum, row) => sum + row.excludedOptions.length, 0),
    refusedLineN: rows.reduce((sum, row) => sum + row.options.reduce((s, option) => s + option.refusedLines, 0), 0),
  };

  /* ---- the calibration, refused below its floor ---- */
  const graded = rows
    .filter((row) => row.grading && Object.keys(row.grading.perSide).length)
    .map((row) => ({ caseId: row.id, currency: row.currency, sides: row.grading.perSide }));
  const biasSamples = graded.flatMap((row) => Object.values(row.sides).map((side) => side.biasBp));
  let calibration = {
    gradedN: graded.length,
    samplesN: biasSamples.length,
    floor: L.gradeFloor,
    readable: graded.length >= L.gradeFloor,
    reason: graded.length >= L.gradeFloor
      ? ''
      : `Only ${graded.length} graded case(s) against a declared floor of ${L.gradeFloor}; no calibration figure is printed, because a bias computed from a handful of cases is a story rather than a measurement.`,
    meanBiasBp: null,
    medianBiasBp: null,
    overrunN: null,
    withinBandN: null,
    withinBandPct: null,
    bandBp: 2000,
  };
  if (calibration.readable && biasSamples.length) {
    const sorted = [...biasSamples].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    calibration.meanBiasBp = Math.round(biasSamples.reduce((a, b) => a + b, 0) / biasSamples.length);
    calibration.medianBiasBp = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    calibration.overrunN = biasSamples.filter((bp) => bp > 0).length;
    calibration.withinBandN = biasSamples.filter((bp) => Math.abs(bp) <= calibration.bandBp).length;
    calibration.withinBandPct = Math.round((calibration.withinBandN / biasSamples.length) * 1000) / 10;
  }

  /* ---- seat disclosure: a case reaches a seat only through a line it holds ---- */
  const visibleRows = (() => {
    if (!seat || seat.fullAccess) return rows;
    if (seat.readOnly) return [];
    const scope = seat.scope || new Set();
    const lineScope = seat.lineScope || new Set();
    return rows.filter((row) => row.lineIds.some((id) => scope.has(id) || lineScope.has(id))
      || (row.ownerId && (scope.has(row.ownerId) || lineScope.has(row.ownerId))));
  })();
  const withheldN = rows.length - visibleRows.length;

  return {
    engine: SRC_ENGINE_VERSION,
    adr: SRC_ADR,
    rule: SRC_RULE_ID,
    asOf: new Date(asOfMs).toISOString(),
    today,
    rows,
    visibleRows,
    withheldN,
    counts: {
      cases: rows.length,
      states: stateCounts,
      verdicts: verdictCounts,
      options: rows.reduce((sum, row) => sum + row.options.length, 0),
      decided: rows.filter((row) => row.decision).length,
      holdUpUnaddressed: coverage.holdUpUnaddressedN,
      reviewOverdue: coverage.reviewOverdueN,
      currencies: currencies.length,
    },
    byCurrency,
    byLine,
    coverage,
    calibration,
    warnings,
    matrixError,
    stateCountsReconcile,
    verdictCountsReconcile,
    /** “the figures add up” — a claim about the arithmetic, and nothing else. */
    totalsReconcile: stateCountsReconcile && verdictCountsReconcile
      && byCurrency.every((row) => row.chosenRefused === 0 && row.cheapestRefused === 0 && row.premiumRefused === 0),
    /** “every row was printed” — a different claim, reported separately. */
    figuresComplete: warnings.length === 0 && coverage.refusedLineN === 0 && coverage.excludedOptionN === 0,
    method: SRC_METHOD,
    csvColumns: SRC_CSV_COLUMNS,
    sectionTitles: SRC_SECTION_TITLES,
    flags: SRC_FLAGS,
    costLineKeys: SRC_COST_LINE_KEYS,
  };
}

/**
 * The attention count a nav badge shows: live cases with a condition that owes a
 * human something. Never a score, never per-person.
 */
export function sourcingAttentionCount(state, { now, settings = null, seat = null } = {}) {
  try {
    const report = buildSourcing(state, { now, settings, seat });
    return report.visibleRows.filter((row) => !row.withdrawn
      && ['decision-owed', 'safeguard-missing', 'mismatch', 'not-comparable'].includes(row.verdict)).length
      + report.visibleRows.filter((row) => row.gradeOwed).length;
  } catch {
    return 0;
  }
}

/** The matrix view the action layer uses; activeSeatId is cleared so the graph is the whole organisation. */
export function sourcingMatrix(state, now, settings) {
  return buildMatrix(state, { now, settings: { ...(settings || {}), activeSeatId: null } });
}

/** Exported for the actions and tests: the exact comparability key a case declares. */
export function sourcingCaseKey(caseRow) {
  return srcComparabilityKey({
    currency: caseRow?.currency,
    horizonDays: caseRow?.horizonDays,
    discountBp: caseRow?.discountBp,
  });
}

export { srcDaysBetween };
