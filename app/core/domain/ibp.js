/**
 * app/core/domain/ibp.js — the pure read model for ADR-0231 (Integrated
 * Business Plan / S&OP Cycle Register, `RULE-IBP-01`).
 *
 * `buildIbp(state, { now, settings, seat })` is a pure function of the stored
 * cycles, demand rows, capacity rows, options, decisions and grades plus an
 * injected clock. Nothing is written and nothing derived is stored: every gap,
 * residual, verdict and coverage claim is re-derived on every read, so a
 * hand-edited file cannot carry a reconciliation its own rows do not imply.
 *
 * THE FIVE THINGS THIS PAGE KEEPS APART, AND NEVER MERGES
 * ------------------------------------------------------
 *  1. **Baseline ≠ target ≠ consensus.** These are three different figures with
 *     three different meanings. They are stored apart and printed apart, because
 *     the register's first job is to make it impossible for a sales target to
 *     masquerade as a demand plan.
 *  2. **Demonstrated ≠ theoretical capacity.** Only a capacity figure declared
 *     `demonstrated` over a real observation window is compared as evidence. A
 *     `theoretical` row is carried, printed and marked, and any cycle relying on
 *     one reads `theoretical-capacity` — it is never quietly averaged in.
 *  3. **The gap ≠ the residual.** The gap is what the unconstrained demand plan
 *     exceeds demonstrated capacity by. The residual is what still is not served
 *     after the framed options are applied. A plan that closes and a plan that
 *     honestly does not are printed as two different verdicts.
 *  4. **"The figures add up" ≠ "the printed figures are the computed figures."**
 *     `balances` is a claim about the arithmetic of the printed rows.
 *     `auditClean` is a claim that what is printed is what was computed —
 *     whole units, no rounding, no coercion, and a residual that is the sum of
 *     its printed months. They are reported separately because they are
 *     different facts.
 *  5. **The owner of a gap is computed, never chosen.** The demand owner and the
 *     supply owner sit on different lines, so the gap is owned by the LOWEST
 *     SEAT ABOVE BOTH, taken from the reporting graph. A genuine diamond names
 *     the ambiguity and asks every joint apex; it never picks one.
 *
 * SHARED CAPACITY IS SUMMED, NOT COMPARED PER CYCLE. Two cycles drawing on the
 * same supply line in the same month consume the same capacity. Summing them is
 * the only honest reading; comparing each to capacity on its own would approve
 * two plans against a line that can serve neither.
 *
 * WHAT IT REFUSES TO DO. It does not forecast. It does not infer capacity from a
 * headcount or a rota. It does not convert a currency. It does not grade a
 * person. It does not block a decision and it does not re-open one.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { altitudeRank } from './chainRegistry.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import {
  IBP_ADR,
  IBP_CSV_COLUMNS,
  IBP_ENGINE_VERSION,
  IBP_LIMITS as L,
  IBP_METHOD,
  IBP_OPTION_KINDS,
  IBP_RULE_ID,
  IBP_SECTION_TITLES,
  IBP_STATES,
  IBP_STEPS,
  IBP_VERDICTS,
  ibpOptionKind,
  ibpStep,
  ibpVerdict,
} from './ibpRegistry.js';
import {
  normalizeIbpCapacityRows,
  normalizeIbpCycles,
  normalizeIbpDecisions,
  normalizeIbpDemandRows,
  normalizeIbpGrades,
  normalizeIbpMarkers,
  normalizeIbpOptions,
  readNonNegUnits,
} from './ibpSchema.js';

const list = (value) => (Array.isArray(value) ? value : []);

/* --------------------------------------------------------------- helpers */

/**
 * Sum a column of exact integers. Returns the total AND the count of values that
 * could not be read, so a total that silently skipped a row is impossible to
 * print: either every value was readable, or the refused count says otherwise.
 */
function sumUnits(values) {
  let total = 0;
  let refused = 0;
  for (const value of values) {
    const units = readNonNegUnits(value);
    if (units === null) refused += 1;
    else total += units;
  }
  return { total, refused };
}

const sumCents = (values) => values.reduce((acc, value) => acc + (Number.isInteger(value) && value >= 0 ? value : 0), 0);

/** Every option effect on one side, in plan units, for a set of month rows. */
function optionEffect(options, side) {
  return options.filter((option) => option.side === side);
}

/**
 * Resolve the seat that owns the gap: the lowest seat above BOTH the demand line
 * and the supply line. Reused from the sourcing recipe deliberately — one
 * authority walk, so the panel and the rule can never disagree about who is
 * asked.
 */
export function resolveIbpAuthority(matrix, lineIds, minRank = 4) {
  const rankOf = (id) => altitudeRank(matrix?.nodes?.get(id)?.altitude) || 0;
  const holders = [...new Set((Array.isArray(lineIds) ? lineIds : []).filter((id) => matrix?.nodes?.has(id)))].sort();
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

  const qualify = new Set();
  for (const apexId of apex.apexIds) {
    const node = matrix.nodes.get(apexId);
    const branch = [apexId, ...(node?.ancestors || [])].filter((id) => matrix.nodes.has(id));
    const atRank = branch.filter((id) => rankOf(id) >= minRank);
    const ranked = atRank
      .slice()
      .sort((a, b) => (rankOf(a) - rankOf(b)) || ((matrix.nodes.get(b)?.depth ?? 0) - (matrix.nodes.get(a)?.depth ?? 0)));
    if (ranked.length) qualify.add(ranked[0]);
  }
  if (!qualify.size) return empty('no-authority-at-rank', { topReached: true });

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

/** The matrix the reader and the rule both use; activeSeatId cleared so the graph is the whole organisation. */
export function ibpMatrix(state, now, settings) {
  return buildMatrix(state, { now, settings: { ...(settings || {}), activeSeatId: null } });
}

/* ------------------------------------------------------------- month rows */

/**
 * Build one month's arithmetic from the stored rows. Every figure is exact:
 * integers in, integers out, and a `refused` count for any row that could not be
 * read rather than a silently smaller total.
 */
function buildMonth({ monthIndex, demand, capacity, options }) {
  // An ABSENT row and an UNREADABLE row are different facts. A month nobody has
  // planned yet contributes nothing and is counted as `unplannedMonths`; only a
  // row that EXISTS and cannot be read counts as refused. Conflating the two
  // would make every cycle with an unplanned month report itself as unsound,
  // which would train the reader to ignore the soundness claim.
  const baseline = sumUnits(demand ? [demand.baselineUnits] : []);
  const target = sumUnits(demand ? [demand.targetUnits] : []);
  const consensus = sumUnits(demand ? [demand.consensusUnits] : []);
  const cap = sumUnits(capacity ? [capacity.units] : []);

  const hasDemand = Boolean(demand);
  const hasCapacity = Boolean(capacity);
  const capacityIsEvidence = hasCapacity && capacity.kind === 'demonstrated';
  // A figure may be CARRIED and printed while still not being evidence, so the
  // two are kept apart: `capacityUnits` is the number that was declared,
  // `capacityIsEvidence` says whether it may be compared as an observation.
  const capacityUnits = hasCapacity ? cap.total : null;

  // The gap is signed and is printed as its own figure. It is only computable
  // when BOTH sides exist and the capacity is evidence; otherwise it is null and
  // the reason is carried, never a zero that reads as "no gap".
  const gapUnits = hasDemand && capacityIsEvidence ? consensus.total - capacityUnits : null;

  const capacityOptions = optionEffect(options, 'capacity');
  const demandOptions = optionEffect(options, 'demand');
  const capacityAdded = sumUnits(capacityOptions.map((option) => option.units));
  const demandRemoved = sumUnits(demandOptions.map((option) => option.units));
  const optionCents = sumCents(options.map((option) => option.cents));

  // The residual is what is still unserved once the framed options are applied.
  // When the gap is not computable the residual is not computable either — the
  // register refuses rather than guessing at zero.
  const residualUnits = gapUnits === null
    ? null
    : Math.max(0, gapUnits - capacityAdded.total - demandRemoved.total);

  return {
    monthIndex,
    hasDemand,
    hasCapacity,
    capacityKind: capacity?.kind || null,
    capacityIsEvidence,
    baselineUnits: baseline.total,
    targetUnits: target.total,
    consensusUnits: consensus.total,
    capacityUnits,
    gapUnits,
    capacityAddedUnits: capacityAdded.total,
    demandRemovedUnits: demandRemoved.total,
    residualUnits,
    optionCents,
    optionN: options.length,
    refusedRows: baseline.refused + target.refused + consensus.refused + cap.refused
      + capacityAdded.refused + demandRemoved.refused,
    /** Consensus equals the target and no commercial adjustment exists. */
    targetSubstituted: hasDemand
      && consensus.total === target.total
      && consensus.total !== baseline.total,
    /** Consensus has been shaved to capacity while the baseline asked for more. */
    demandConstrained: capacityIsEvidence
      && hasDemand
      && baseline.total > capacityUnits
      && consensus.total <= capacityUnits
      && consensus.total < baseline.total,
  };
}

/* ----------------------------------------------------------- cycle build */

function buildCycle(row, parts, matrix, today) {
  const demandRows = parts.demand.sort((a, b) => a.monthIndex - b.monthIndex);
  const capacityRows = parts.capacity.sort((a, b) => a.monthIndex - b.monthIndex);
  const options = parts.options.slice().sort((a, b) => a.monthIndex - b.monthIndex || a.kind.localeCompare(b.kind));
  const decision = parts.decision || null;
  const grades = parts.grades.slice().sort((a, b) => a.monthIndex - b.monthIndex);

  const months = [];
  for (let monthIndex = 1; monthIndex <= row.horizonMonths; monthIndex += 1) {
    const demand = demandRows.find((entry) => entry.monthIndex === monthIndex) || null;
    const capacity = capacityRows.find((entry) => entry.monthIndex === monthIndex) || null;
    const monthOptions = options.filter((option) => option.monthIndex === monthIndex);
    months.push(buildMonth({ monthIndex, demand, capacity, options: monthOptions }));
  }

  // A cycle can carry options only against months it declared a horizon for. The
  // loader already refuses a month outside the cycle's own horizon (the month
  // index is normalized against it), so this is a second, independent check on
  // the rows that DID survive — not an assumption that the loader was right.
  const outOfHorizonOptions = options.filter((option) => option.monthIndex < 1 || option.monthIndex > row.horizonMonths);

  /* ---- totals, and the proof that each total is the sum of its printed rows */
  const monthSum = (key) => months.reduce((acc, month) => acc + (Number.isInteger(month[key]) ? month[key] : 0), 0);
  const gapComputableMonths = months.filter((month) => month.gapUnits !== null);
  const residualComputableMonths = months.filter((month) => month.residualUnits !== null);

  const totals = {
    monthsN: months.length,
    demandRecordedN: months.filter((month) => month.hasDemand).length,
    capacityRecordedN: months.filter((month) => month.hasCapacity).length,
    capacityEvidenceN: months.filter((month) => month.capacityIsEvidence).length,
    gapComputableN: gapComputableMonths.length,
    consensusUnits: monthSum('consensusUnits'),
    baselineUnits: monthSum('baselineUnits'),
    targetUnits: monthSum('targetUnits'),
    capacityUnits: months.reduce((acc, month) => acc + (Number.isInteger(month.capacityUnits) ? month.capacityUnits : 0), 0),
    capacityAddedUnits: monthSum('capacityAddedUnits'),
    demandRemovedUnits: monthSum('demandRemovedUnits'),
    gapUnits: gapComputableMonths.length ? gapComputableMonths.reduce((acc, month) => acc + month.gapUnits, 0) : null,
    residualUnits: residualComputableMonths.length ? residualComputableMonths.reduce((acc, month) => acc + month.residualUnits, 0) : null,
    optionCents: sumCents(options.map((option) => option.cents)),
    optionsN: options.length,
    refusedRows: months.reduce((acc, month) => acc + month.refusedRows, 0),
  };

  // "The totals add up": the printed total of the computable months equals the
  // sum of the printed month rows. This is arithmetic, and says nothing about
  // whether the rows themselves are complete.
  const gapSumCheck = gapComputableMonths.reduce((acc, month) => acc + month.gapUnits, 0);
  const residualSumCheck = residualComputableMonths.reduce((acc, month) => acc + month.residualUnits, 0);
  const balances = (totals.gapUnits === null || totals.gapUnits === gapSumCheck)
    && (totals.residualUnits === null || totals.residualUnits === residualSumCheck)
    && totals.consensusUnits === monthSum('consensusUnits');

  // "The printed figures are the computed figures": every figure is an exact
  // integer, no month was dropped for an unreadable row, no option fell outside
  // the horizon and no loader refused a row.
  const auditClean = totals.refusedRows === 0
    && outOfHorizonOptions.length === 0
    && months.every((month) => Number.isInteger(month.consensusUnits)
      && Number.isInteger(month.baselineUnits)
      && Number.isInteger(month.targetUnits)
      && (month.capacityUnits === null || Number.isInteger(month.capacityUnits))
      && (month.gapUnits === null || Number.isInteger(month.gapUnits))
      && (month.residualUnits === null || Number.isInteger(month.residualUnits)));

  /* ---- the documented failure modes, in declared precedence order */
  const hasDemand = totals.demandRecordedN > 0;
  const theoreticalN = months.filter((month) => month.hasCapacity && !month.capacityIsEvidence).length;
  const constrainedN = months.filter((month) => month.demandConstrained).length;
  const substitutedN = months.filter((month) => month.targetSubstituted).length;
  const residualOwned = decision
    ? decision.acknowledgedResidualUnits === (totals.residualUnits ?? 0)
    : false;
  const residualMatches = decision && totals.residualUnits !== null
    ? decision.acknowledgedResidualUnits === totals.residualUnits
    : false;

  let verdictKey;
  if (!hasDemand) verdictKey = 'no-demand';
  else if (constrainedN > 0) verdictKey = 'demand-constrained';
  else if (theoreticalN > 0) verdictKey = 'theoretical-capacity';
  else if (substitutedN > 0) verdictKey = 'target-substituted';
  // Once an executive has approved a plan, the cycle's verdict is about THAT
  // PLAN and not about the pre-approval state of the gap. A decision that
  // accepts the whole gap without framing an option is a legitimate decision —
  // "serve less, deliberately" — and it must not be re-labelled as a
  // reconciliation that never happened.
  else if (decision) verdictKey = (totals.residualUnits ?? 0) > 0 ? 'plan-approved-with-residual' : 'plan-approved';
  else if (totals.gapUnits !== null && totals.gapUnits > 0 && totals.optionsN === 0) verdictKey = 'reconciliation-open';
  else if (totals.gapUnits !== null) verdictKey = 'escalation-open';
  else verdictKey = 'reconciliation-open';

  // A cycle that has not reached the supply step yet is not yet in breach of
  // anything about the gap: it is mid-cycle, and the register says so rather
  // than printing an escalation for a step that has not run.
  const supplyDone = totals.capacityRecordedN > 0;
  const stateKey = row.withdrawnOn
    ? 'withdrawn'
    : decision
      ? 'approved'
      : (totals.optionsN > 0 ? 'reconciled' : supplyDone ? 'supply-recorded' : hasDemand ? 'demand-recorded' : 'declared');

  const authority = (() => {
    if (!matrix || matrix.error) return { state: 'no-holder', seatIds: [], chiefQueue: false, ambiguous: false, requiredRank: 4 };
    return resolveIbpAuthority(matrix, [row.demandLineId, row.supplyLineId], 4);
  })();

  // The lines are the two declared lines plus the owners behind them, so a seat
  // holding either side can see the cycle it is recording.
  const lineIds = [...new Set([row.demandLineId, row.supplyLineId])].sort();

  return {
    id: row.id,
    title: row.title,
    currency: row.currency,
    horizonMonths: row.horizonMonths,
    ownerId: row.ownerId,
    demandLineId: row.demandLineId,
    supplyLineId: row.supplyLineId,
    lineIds,
    declaredOn: row.declaredOn,
    reviewOn: row.reviewOn,
    withdrawnOn: row.withdrawnOn,
    withdrawn: Boolean(row.withdrawnOn && row.withdrawnOn <= today),
    basis: row.basis,
    months,
    options,
    outOfHorizonOptionN: outOfHorizonOptions.length,
    decision,
    grades,
    totals,
    state: stateKey,
    stateLabel: (IBP_STATES.find((entry) => entry.key === stateKey) || {}).label || stateKey,
    verdict: verdictKey,
    verdictLabel: (ibpVerdict(verdictKey) || {}).label || verdictKey,
    verdictRank: (ibpVerdict(verdictKey) || {}).rank ?? 0,
    authority,
    // Printed facts about the documented failure modes — every one is a count
    // the panel can show, never an inference.
    theoreticalN,
    constrainedN,
    substitutedN,
    residualOwned,
    residualMatches,
    /** The cycle closed its gap or honestly declared what it did not close. */
    closes: (totals.residualUnits ?? null) === 0,
    /** The executive step is owed: the gap is known and no plan is approved. */
    executiveOwed: !row.withdrawnOn && totals.gapUnits !== null && !decision,
    /** Reconciliation is owed: a gap exists and no option is framed against it. */
    reconcileOwed: !row.withdrawnOn && totals.gapUnits !== null && totals.gapUnits > 0 && totals.optionsN === 0,
    /** Demand is owed: the cycle is open and no month carries a consensus plan. */
    demandOwed: !row.withdrawnOn && !hasDemand,
    /** Capacity is owed: demand is on the record and feasibility is not tested. */
    supplyOwed: !row.withdrawnOn && hasDemand && !supplyDone,
    /** A month whose consensus is missing is a hole in the plan, printed. */
    unplannedMonths: months.filter((month) => !month.hasDemand).map((month) => month.monthIndex),
    balances,
    auditClean,
    reviewOverdue: !row.withdrawnOn && row.reviewOn < today && !decision,
  };
}

/* ------------------------------------------------------- forecast grading */

/**
 * Grade the demand plan against what actually sold. Signed bias (actual minus
 * consensus) and mean absolute percentage error are reported SEPARATELY and both
 * withheld below the declared floor, because a forecast that runs high every
 * month has a fatal bias and near-zero pure error, and reporting one number
 * would hide which is failing.
 */
function buildGradeReport(graded) {
  const rows = graded
    .map((entry) => {
      const consensus = readNonNegUnits(entry.consensusUnits);
      const actual = readNonNegUnits(entry.actualUnits);
      if (consensus === null || actual === null) return null;
      const bias = actual - consensus;
      const absError = Math.abs(bias);
      // An actual of zero against a non-zero plan is a 100% error, which is a
      // real and reportable fact — it is NOT an undefined ratio to be dropped.
      const ratioBp = consensus > 0 ? Math.round((absError * 10_000) / consensus) : (actual > 0 ? 10_000 : 0);
      return { ...entry, consensusUnits: consensus, actualUnits: actual, bias, absError, ratioBp };
    })
    .filter(Boolean);

  const n = rows.length;
  const belowFloor = n < L.gradeFloor;
  const biasUnits = n ? rows.reduce((acc, row) => acc + row.bias, 0) : null;
  // Mean absolute percentage error in basis points, exact integer division with
  // half-up rounding applied once, after the sum.
  const mapeBp = n
    ? Math.round(rows.reduce((acc, row) => acc + row.ratioBp, 0) / n)
    : null;

  return {
    rows,
    n,
    floor: L.gradeFloor,
    belowFloor,
    biasUnits: belowFloor ? null : biasUnits,
    mapeBp: belowFloor ? null : mapeBp,
    withheldReason: belowFloor
      ? `${n} graded month(s); a bias or error figure is withheld below ${L.gradeFloor}, because a forecast statistic computed from fewer months is a story, not a measurement.`
      : '',
  };
}

/* ---------------------------------------------------- shared capacity */

/**
 * Shared demonstrated capacity. Every live cycle drawing on the same supply line
 * in the same month is summed against that line's declared capacity. Contention
 * is printed against the LINE and the MONTH, never against a person.
 */
function buildCapacityContention(cycles) {
  const byLineMonth = new Map();
  for (const cycle of cycles) {
    if (cycle.withdrawn) continue;
    for (const month of cycle.months) {
      if (!month.hasDemand) continue;
      const key = `${cycle.supplyLineId}|${month.monthIndex}`;
      const entry = byLineMonth.get(key) || {
        lineId: cycle.supplyLineId,
        monthIndex: month.monthIndex,
        demandUnits: 0,
        capacityUnits: null,
        capacityKind: null,
        cycleIds: [],
      };
      entry.demandUnits += month.consensusUnits;
      entry.cycleIds.push(cycle.id);
      // A line's capacity for a month is whatever the finest evidence on the
      // record says. If two cycles declare different figures for the same line
      // and month, the SMALLER is used — the conservative reading — and the
      // disagreement is printed rather than averaged away.
      if (month.hasCapacity) {
        if (entry.capacityUnits === null || month.capacityUnits < entry.capacityUnits) {
          entry.capacityUnits = month.capacityUnits;
          entry.capacityKind = month.capacityKind;
        }
      }
      byLineMonth.set(key, entry);
    }
  }

  const rows = [...byLineMonth.values()]
    .filter((entry) => entry.cycleIds.length > 1)
    .map((entry) => {
      const capacityIsEvidence = entry.capacityKind === 'demonstrated';
      const contentionUnits = entry.capacityUnits === null || !capacityIsEvidence
        ? null
        : Math.max(0, entry.demandUnits - entry.capacityUnits);
      return {
        lineId: entry.lineId,
        monthIndex: entry.monthIndex,
        cycleIds: entry.cycleIds.slice().sort(),
        cycleN: entry.cycleIds.length,
        demandUnits: entry.demandUnits,
        capacityUnits: entry.capacityUnits,
        capacityKind: entry.capacityKind,
        capacityIsEvidence,
        contentionUnits,
      };
    })
    .sort((a, b) => (b.contentionUnits ?? -1) - (a.contentionUnits ?? -1)
      || a.lineId.localeCompare(b.lineId) || a.monthIndex - b.monthIndex);

  const contended = rows.filter((row) => (row.contentionUnits ?? 0) > 0);
  return {
    rows,
    sharedLineMonthN: rows.length,
    contendedN: contended.length,
    contentionUnits: contended.reduce((acc, row) => acc + (row.contentionUnits ?? 0), 0),
    /** Lines where two cycles disagree about the same line-month capacity. */
    disagreementN: rows.filter((row) => row.capacityUnits !== null && row.cycleN > 1 && row.capacityKind === null).length,
  };
}

/* ---------------------------------------------------------------- reader */

export function buildIbp(state, { now = null, settings = null, seat = null } = {}) {
  const nowDate = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(nowDate);
  const warnings = [];

  let matrix = null;
  let matrixError = null;
  try {
    matrix = ibpMatrix(state, nowDate, settings || state?.settings || {});
    if (matrix?.error) { matrixError = String(matrix.error); matrix = null; }
  } catch (error) {
    matrixError = error?.message || 'unknown error';
    matrix = null;
  }

  const cycles = normalizeIbpCycles(state?.ibpCycles, warnings);
  const demandRows = normalizeIbpDemandRows(state?.ibpDemandRows, cycles, warnings);
  const capacityRows = normalizeIbpCapacityRows(state?.ibpCapacityRows, cycles, warnings);
  const options = normalizeIbpOptions(state?.ibpOptions, cycles, warnings);
  const decisions = normalizeIbpDecisions(state?.ibpDecisions, cycles, warnings);
  const grades = normalizeIbpGrades(state?.ibpGrades, cycles, warnings);
  const markers = normalizeIbpMarkers(state?.ibpMarkers, warnings);

  const decisionByCycle = new Map(decisions.map((row) => [row.cycleId, row]));

  const rows = cycles.map((row) => buildCycle(row, {
    demand: demandRows.filter((entry) => entry.cycleId === row.id),
    capacity: capacityRows.filter((entry) => entry.cycleId === row.id),
    options: options.filter((entry) => entry.cycleId === row.id),
    grades: grades.filter((entry) => entry.cycleId === row.id),
    decision: decisionByCycle.get(row.id) || null,
  }, matrix, today));

  /* ---- grades are joined to the consensus they were graded against ---- */
  const demandByCycleMonth = new Map(demandRows.map((row) => [`${row.cycleId}|${row.monthIndex}`, row]));
  const gradedRows = grades
    .map((grade) => {
      const demand = demandByCycleMonth.get(`${grade.cycleId}|${grade.monthIndex}`);
      if (!demand) return null;
      return { ...grade, consensusUnits: demand.consensusUnits };
    })
    .filter(Boolean);
  const gradeReport = buildGradeReport(gradedRows);

  /* ---- seat disclosure: a cycle reaches a seat only through a line it holds */
  const visibleRows = (() => {
    if (!seat || seat.fullAccess) return rows;
    if (seat.readOnly) return [];
    const scope = seat.scope || new Set();
    const lineScope = seat.lineScope || new Set();
    return rows.filter((row) => row.lineIds.some((id) => scope.has(id) || lineScope.has(id))
      || (row.ownerId && (scope.has(row.ownerId) || lineScope.has(row.ownerId))));
  })();
  const withheldN = rows.length - visibleRows.length;

  /* ---- counts, each reconciled against its own total ---- */
  const liveRows = rows.filter((row) => !row.withdrawn);
  const stateCounts = Object.fromEntries(IBP_STATES.map((entry) => [entry.key, rows.filter((row) => row.state === entry.key).length]));
  const verdictCounts = Object.fromEntries(IBP_VERDICTS.map((entry) => [entry.key, rows.filter((row) => row.verdict === entry.key).length]));
  const stateCountsReconcile = Object.values(stateCounts).reduce((acc, n) => acc + n, 0) === rows.length;
  const verdictCountsReconcile = Object.values(verdictCounts).reduce((acc, n) => acc + n, 0) === rows.length;

  const contention = buildCapacityContention(rows);

  /* ---- per currency: money is never pooled across currencies ---- */
  const currencies = [...new Set(liveRows.map((row) => row.currency))].sort();
  const byCurrency = currencies.map((currency) => {
    const owned = liveRows.filter((row) => row.currency === currency);
    return {
      currency,
      cyclesN: owned.length,
      approvedN: owned.filter((row) => row.state === 'approved').length,
      optionCents: sumCents(owned.flatMap((row) => row.options.map((option) => option.cents))),
      residualUnits: owned.some((row) => row.totals.residualUnits !== null)
        ? owned.reduce((acc, row) => acc + (row.totals.residualUnits ?? 0), 0)
        : null,
    };
  });

  const totalsReconcile = stateCountsReconcile && verdictCountsReconcile
    && rows.every((row) => row.balances)
    && byCurrency.every((entry) => Number.isInteger(entry.optionCents));

  return {
    engine: IBP_ENGINE_VERSION,
    adr: IBP_ADR,
    rule: IBP_RULE_ID,
    asOf: nowDate.toISOString(),
    today,
    rows,
    visibleRows,
    withheldN,
    counts: {
      cycles: rows.length,
      live: liveRows.length,
      approved: rows.filter((row) => row.state === 'approved').length,
      states: stateCounts,
      verdicts: verdictCounts,
      demandRows: demandRows.length,
      capacityRows: capacityRows.length,
      options: options.length,
      decisions: decisions.length,
      grades: grades.length,
      currencies: currencies.length,
      demandOwed: liveRows.filter((row) => row.demandOwed).length,
      executiveOwed: liveRows.filter((row) => row.executiveOwed).length,
      reconcileOwed: liveRows.filter((row) => row.reconcileOwed).length,
      supplyOwed: liveRows.filter((row) => row.supplyOwed).length,
      residualUnowned: liveRows.filter((row) => row.decision && !row.residualMatches && (row.totals.residualUnits ?? 0) > 0).length,
      reviewOverdue: liveRows.filter((row) => row.reviewOverdue).length,
    },
    coverage: {
      liveN: liveRows.length,
      withdrawnN: rows.filter((row) => row.withdrawn).length,
      demandRecordedN: liveRows.filter((row) => row.totals.demandRecordedN > 0).length,
      capacityEvidenceN: liveRows.filter((row) => row.totals.capacityEvidenceN > 0).length,
      theoreticalN: liveRows.reduce((acc, row) => acc + row.theoreticalN, 0),
      constrainedN: liveRows.reduce((acc, row) => acc + row.constrainedN, 0),
      substitutedN: liveRows.reduce((acc, row) => acc + row.substitutedN, 0),
      approvedWithResidualN: liveRows.filter((row) => row.verdict === 'plan-approved-with-residual').length,
      approvedClosingN: liveRows.filter((row) => row.verdict === 'plan-approved').length,
      gapUncomputableN: liveRows.filter((row) => row.totals.demandRecordedN > 0 && row.totals.gapComputableN === 0).length,
    },
    contention,
    grade: gradeReport,
    byCurrency,
    steps: IBP_STEPS,
    optionKinds: IBP_OPTION_KINDS,
    sections: IBP_SECTION_TITLES,
    markers,
    warnings,
    matrixError,
    stateCountsReconcile,
    verdictCountsReconcile,
    /** "The figures add up" — a claim about the arithmetic, and nothing else. */
    totalReconcile: totalsReconcile,
    /** "Every printed figure is the computed figure" — a different claim. */
    figuresComplete: warnings.length === 0
      && rows.every((row) => row.auditClean)
      && gradeReport.n === grades.length,
    method: IBP_METHOD,
    columns: IBP_CSV_COLUMNS,
  };
}

/* -------------------------------------------------------------- attention */

/**
 * What this seat actually owes the cycle. Reads the same report the panel reads,
 * so a badge can never count something the page does not show.
 */
export function ibpAttentionCount(state, { now = null, settings = null, seat = null } = {}) {
  try {
    const report = buildIbp(state, { now, settings, seat });
    return report.visibleRows.filter((row) => !row.withdrawn
      && (row.demandOwed || row.executiveOwed || row.reconcileOwed || row.supplyOwed || row.reviewOverdue)).length;
  } catch {
    return 0;
  }
}

/** Exported so the action layer can prove the same month row the panel prints. */
export { buildMonth as ibpBuildMonth, sumUnits as ibpSumUnits };
