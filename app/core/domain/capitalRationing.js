/**
 * app/core/domain/capitalRationing.js — the ONE reader of the Capital Rationing &
 * Funded-Set Register (ADR-0211, Schema v165, `#/finance?panel=rationing`).
 *
 * The panel, the brief, the CSV and `RULE-CRS-01` all read this module, so the
 * funded set the screen prints is the set the brief describes and the set the
 * CSV exports — there is no second computation anywhere.
 *
 * WHAT IT READS. The Investment Case Register's own reader (`buildInvestmentCases`)
 * supplies the candidates and their exact appraisals; this module never re-prices
 * a case. A candidate is a RATIFIED case — `approved` or `tracking` — because a
 * `proposed` case has not been ratified and is therefore not fundable yet, and a
 * closed, refused or withdrawn one is not a candidate at all. Each candidate
 * contributes the appraisal's own net present value at its own declared hurdle
 * and its own valuation day, and the money it commits is its promised outlay,
 * undiscounted, in whole cents — the figure a ceiling is written against.
 *
 * THE FOUR CLAIMS THIS READER KEEPS APART, because collapsing them is how a
 * rationing screen lies:
 *   1. WHAT THE CEILING IS  — declared by a human, or absent and named as absent.
 *   2. WHAT FITS            — the proven-optimal funded set, or a printed refusal.
 *   3. WHAT ONE MORE UNIT IS WORTH — the shadow price, as an exact difference.
 *   4. WHAT THE SHORTCUT COST       — the exact gap between the profitability-index
 *      order this workspace already printed and the optimum.
 * Each is its own word on the page. A `proven` set and a `refused` search never
 * share a label, and a currency with no ceiling never reads as "everything fits".
 *
 * CURRENCIES ARE NEVER POOLED. Each currency is its own problem with its own
 * ceiling, its own set, its own shadow price and its own node budget. Adding DKK
 * to EUR would manufacture a figure no record supports, and a single workspace
 * total of net present values valued on different days is refused by name.
 *
 * Pure module: no DOM, no storage, no clock beyond the injected `now`.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { canAct } from './seat.js';
import { buildInvestmentCases, investmentMoney } from './investmentCase.js';
import {
  CAPITAL_RATIONING_MATH,
  NodeBudget,
  SHADOW_STEP_CENTS,
  evaluateSelection,
  prepareRelations,
  selectionSignature,
  shadowPrice,
  solveFundedSet,
  solveRankOrder,
} from './capitalRationingMath.js';
import {
  CAPITAL_RATIONING_ENGINE_VERSION,
  CAPITAL_RATIONING_FRAMEWORKS,
  CAPITAL_RATIONING_LIMITS,
  CAPITAL_RATIONING_METHOD,
  CAPITAL_RATIONING_REFUSALS,
  CAPITAL_RATIONING_RIGHTS,
  CAPITAL_RATIONING_SETTING_KEYS,
  CAPITAL_SELECTION_STATE_BY_KEY,
  CAPITAL_SELECTION_STATES,
  capitalRelationKindByKey,
} from './capitalRationingRegistry.js';
import {
  normalizeCapitalCeilings,
  normalizeCapitalRationingMarkers,
  normalizeCapitalRationingSettings,
  normalizeCapitalRelations,
} from './capitalRationingSchema.js';

const L = CAPITAL_RATIONING_LIMITS;
const REFUSAL_BY_KEY = Object.freeze(Object.fromEntries(CAPITAL_RATIONING_REFUSALS.map((row) => [row.key, row])));

/** Which Investment Case lifecycle states are fundable: ratified and not closed. */
const CANDIDATE_STATUSES = Object.freeze(new Set(['approved', 'tracking']));

/* --------------------------------------------------------------- formatting */

const sumSafe = (values) => (values.every((value) => Number.isSafeInteger(value)) ? values.reduce((a, b) => a + b, 0) : null);

/** Whole basis points → `12.34%`, by integer arithmetic. */
export function capitalPercentBp(bp) {
  if (!Number.isInteger(bp)) return '—';
  const negative = bp < 0;
  const a = Math.abs(bp);
  return `${negative ? '−' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}%`;
}

/** A ceiling's period as `2026-01-01 → 2026-12-31`. */
export function capitalPeriod(from, to) {
  return from && to ? `${from} → ${to}` : '—';
}

/* ------------------------------------------------------------ seat plumbing */

function seatProjection(seat) {
  const operator = !seat;
  const actorId = operator ? LEADER_ID : (seat.fullAccess ? LEADER_ID : (seat.nodeId || seat.id || null));
  const may = (right) => operator || (Number.isInteger(seat?.rank) && canAct(right, seat).allow === true);
  const reachOf = (ownerId) => {
    if (operator) return 'operator';
    if (seat.scope instanceof Set && seat.scope.has(ownerId)) return 'tree';
    if (seat.lineScope instanceof Set && seat.lineScope.has(ownerId)) return 'line';
    return null;
  };
  return {
    operator,
    actorId,
    canDeclareCeiling: may(CAPITAL_RATIONING_RIGHTS.DECLARE_CEILING),
    canDeclareRelation: may(CAPITAL_RATIONING_RIGHTS.DECLARE_RELATION),
    canGovern: may(CAPITAL_RATIONING_RIGHTS.GOVERN),
    reachOf,
  };
}

/**
 * Which ceiling governs a currency on a day: the most recently declared ACTIVE
 * ceiling whose period contains the day. Two live ceilings over one currency that
 * both contain the day is an AMBIGUITY the register names rather than resolving —
 * picking one would ration the fund against a constraint nobody chose.
 */
export function governingCeilings(ceilings, currency, today) {
  const live = ceilings.filter((row) => !row.retiredOn
    && row.currency === currency
    && row.periodFrom <= today && today <= row.periodTo);
  return live.sort((a, b) => b.declaredOn.localeCompare(a.declaredOn) || a.id.localeCompare(b.id));
}

/* -------------------------------------------------------------------- reader */

/**
 * The whole register, projected for one seat. `seat: null` is the undeclared
 * operator view — the whole workspace.
 */
export function buildCapitalRationing(state = {}, { now = new Date(), settings = null, seat = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at) || new Date().toISOString().slice(0, 10);
  const cfg = settings || state.settings || {};
  const conv = normalizeCapitalRationingSettings(cfg);
  const warnings = [];
  const ceilings = normalizeCapitalCeilings(state.capitalCeilings, warnings);
  const relations = normalizeCapitalRelations(state.capitalRelations, warnings);
  normalizeCapitalRationingMarkers(state.capitalRationingMarkers, warnings); // read for nothing but its warnings
  const { operator, actorId, canDeclareCeiling, canDeclareRelation, canGovern, reachOf } = seatProjection(seat);

  let matrix = null;
  try {
    matrix = buildMatrix(state, { now: at, settings: { ...cfg, activeSeatId: null } });
  } catch {
    matrix = null;
  }
  const people = new Map((Array.isArray(state.people) ? state.people : []).filter((p) => p && p.id).map((p) => [p.id, p]));
  const nameOf = (personId) => (personId === LEADER_ID
    ? (matrix?.nodes?.get(LEADER_ID)?.name || 'Workspace leader')
    : (people.get(personId)?.name || 'Someone no longer on the roster'));

  /* 1. The case book, read ONCE through the register's own reader. */
  const caseReport = (() => {
    try {
      return buildInvestmentCases(state, { now: at, settings: cfg, seat });
    } catch {
      return null;
    }
  })();
  const caseRows = caseReport?.allCases || [];

  /* 2. The seat projection over CASES: a case is visible when its owner is in
        this seat's tree or on a declared line it holds. */
  const visibleCases = [];
  let outsideN = 0;
  for (const row of caseRows) {
    const reach = reachOf(row.ownerId);
    if (!reach) { outsideN += 1; continue; }
    visibleCases.push({ ...row, reach });
  }

  /* 3. Candidates: ratified and not closed. Everything else is COUNTED, never
        silently discarded, because a case the register cannot fund for a stated
        reason is information. */
  const notCandidates = { proposedN: 0, decidedN: 0, closedN: 0, rejectedN: 0, withdrawnN: 0, reviewDueN: 0, retrospectiveN: 0, unpricedN: 0, tooHeavyN: 0 };
  const byCurrency = new Map();
  for (const row of visibleCases) {
    if (!CANDIDATE_STATUSES.has(row.status)) {
      if (row.status === 'proposed') notCandidates.proposedN += 1;
      else if (row.status === 'closed') notCandidates.closedN += 1;
      else if (row.status === 'rejected') notCandidates.rejectedN += 1;
      else if (row.status === 'withdrawn') notCandidates.withdrawnN += 1;
      else if (row.status === 'review-due') notCandidates.reviewDueN += 1;
      continue;
    }
    const npv = row.appraisal?.npvCents;
    const outlay = row.appraisal?.undiscounted?.outlayCents;
    const readable = Number.isSafeInteger(npv) && Number.isSafeInteger(outlay) && outlay >= 0;
    if (!readable) { notCandidates.unpricedN += 1; continue; }
    if (!byCurrency.has(row.currency)) byCurrency.set(row.currency, []);
    byCurrency.get(row.currency).push({
      caseId: row.caseId, title: row.title, ownerId: row.ownerId, ownerName: row.ownerName,
      status: row.status, statusMeta: row.statusMeta, reach: row.reach,
      currency: row.currency, hurdleBp: row.hurdleBp, baseOn: row.baseOn, reviewOn: row.reviewOn,
      npvCents: npv, outlayCents: outlay, piPermille: row.appraisal?.piPermille ?? null,
      irrState: row.appraisal?.irr?.state || null, retrospective: Boolean(row.retrospective),
      multiLineOwner: Boolean(row.matrix?.multiLine), code: row.code,
    });
  }

  /* 4. Solve each currency. A currency is its own problem: its own ceiling, its
        own relations, its own budget, its own shadow price. */
  const currencyKeys = [...byCurrency.keys()].sort();
  const overLimit = currencyKeys.length > L.maxCurrencies;
  const solvedKeys = overLimit ? currencyKeys.slice(0, L.maxCurrencies) : currencyKeys;
  // One node budget for the whole read, so a pathological workspace cannot spend
  // unbounded time in a badge. Each currency's search draws from the same pool,
  // and a currency that meets an exhausted pool is refused by name.
  const budget = new NodeBudget(L.nodeBudget);

  const currencies = solvedKeys.map((currency) => {
    const rows = byCurrency.get(currency);
    // A stable candidate order: the case register's own code, so the printed set
    // is reproducible and the CSV rows line up with the screen.
    const ordered = [...rows].sort((a, b) => String(a.code).localeCompare(String(b.code)) || a.caseId.localeCompare(b.caseId));
    const candidates = ordered.map((row, index) => ({
      ...row,
      index,
      weight: row.outlayCents,
      scaledValue: BigInt(row.npvCents) * 10000n,
    }));
    const governing = governingCeilings(ceilings, currency, today);
    const ambiguousCeiling = governing.length > 1;
    const ceiling = governing.length ? governing[0] : null;

    // Relations for this currency: both ends must be candidates HERE.
    const mine = relations.filter((relation) => !relation.retiredOn);
    const candidateIds = new Set(candidates.map((row) => row.caseId));
    const relationRows = mine.map((relation) => {
      const aHere = candidateIds.has(relation.aCaseId);
      const bHere = candidateIds.has(relation.bCaseId);
      const aAnywhere = caseRows.some((row) => row.caseId === relation.aCaseId && row.currency === currency);
      const bAnywhere = caseRows.some((row) => row.caseId === relation.bCaseId && row.currency === currency);
      let state;
      if (!aHere && !bHere) state = aAnywhere || bAnywhere ? 'not-both-candidates' : 'other-currency';
      else if (!aHere || !bHere) state = 'not-both-candidates';
      else state = 'applied';
      return { ...relation, kindMeta: capitalRelationKindByKey(relation.kind), state, aApplied: aHere, bApplied: bHere };
    });
    const appliedRelations = relationRows.filter((row) => row.state === 'applied');
    const prepared = prepareRelations(appliedRelations, candidates);
    const excludedApplied = prepared.excluded.length;

    /* ---- the four claims ---- */
    let stateKey;
    let plan = null;
    let shadow = null;
    let shadowRefusal = null;
    const askCents = sumSafe(candidates.map((row) => row.outlayCents));
    const unpricedHere = notCandidates.unpricedN > 0 && candidates.length === 0 ? 0 : 0; // per-currency unpriced is counted globally below

    if (!candidates.length) {
      stateKey = 'no-candidates';
    } else if (candidates.length > L.maxCandidates) {
      stateKey = 'too-many-cases';
    } else if (!ceiling) {
      stateKey = 'no-ceiling';
    } else {
      const room = Math.max(0, ceiling.cents);
      const result = solveFundedSet({ candidates, relations: prepared, ceilingCents: room, budget });
      if (!result.proved) {
        stateKey = 'node-budget-exhausted';
        plan = { refused: true, reason: result.reason, nodesExplored: result.nodesExplored, nodesPruned: result.nodesPruned };
      } else {
        stateKey = 'optimal';
        const selected = candidates.filter((row) => result.selection[row.index] === 1);
        const notSelected = candidates.filter((row) => result.selection[row.index] !== 1);
        // The shortcut, measured, under the SAME constraints.
        const rank = solveRankOrder({ candidates, relations: prepared, ceilingCents: room });
        const rankRows = candidates.filter((row) => rank.selection[row.index] === 1);
        const exact = evaluateSelection(result.selection, candidates, prepared);
        plan = {
          refused: false,
          selected,
          notSelected,
          valueCents: result.valueCents,
          weightCents: result.weightCents,
          deductionsCents: result.deductionsCents,
          headroomCents: ceiling.cents - result.weightCents,
          nodesExplored: result.nodesExplored,
          nodesPruned: result.nodesPruned,
          tooHeavyIds: new Set(result.tooHeavy || []),
          noFeasibleSet: Boolean(result.noFeasibleSet),
          signature: selectionSignature(selected.map((row) => row.caseId)),
          reconciles: Number(exact.scaled / 10000n) === result.valueCents,
          rank: {
            selected: rankRows,
            valueCents: rank.valueCents,
            weightCents: rank.weightCents,
            gapCents: result.valueCents - rank.valueCents,
            skipped: rank.skipped,
          },
        };
        notCandidates.tooHeavyN += notSelected.filter((row) => plan.tooHeavyIds.has(row.caseId)).length;
        // The shadow price: exact finite difference, and null when unprovable.
        const priced = shadowPrice({ candidates, relations: prepared, ceilingCents: room, budget });
        if (priced) shadow = priced;
        else shadowRefusal = 'The shadow price could not be proven inside the shared node budget, so no price is printed.';
      }
    }
    if (stateKey === 'node-budget-exhausted' || stateKey === 'too-many-cases' || stateKey === 'no-ceiling') {
      // A refused or unconstrained currency draws no further budget.
    }

    const selectedIds = new Set(plan && !plan.refused ? plan.selected.map((row) => row.caseId) : []);
    return {
      currency,
      stateKey,
      stateMeta: CAPITAL_SELECTION_STATE_BY_KEY[stateKey],
      ceiling: ceiling ? {
        ...ceiling,
        declaredByName: nameOf(ceiling.declaredById),
        period: capitalPeriod(ceiling.periodFrom, ceiling.periodTo),
        ambiguous: ambiguousCeiling,
        othersN: governing.length - 1,
        others: governing.slice(1).map((row) => ({ id: row.id, period: capitalPeriod(row.periodFrom, row.periodTo), declaredOn: row.declaredOn, declaredByName: nameOf(row.declaredById) })),
      } : null,
      candidates: candidates.map((row) => ({
        ...row,
        selected: selectedIds.has(row.caseId),
        tooHeavy: Boolean(plan && !plan.refused && plan.tooHeavyIds?.has(row.caseId)),
        relationsN: relationRows.filter((relation) => relation.state === 'applied' && (relation.aCaseId === row.caseId || relation.bCaseId === row.caseId)).length,
      })),
      candidatesN: candidates.length,
      askCents,
      relations: relationRows,
      appliedRelationsN: appliedRelations.length,
      excludedRelationsN: relationRows.length - appliedRelations.length,
      excludedAppliedN: excludedApplied,
      exclusiveN: prepared.exclusive.length,
      requiresN: prepared.requires.length,
      overlapN: prepared.overlap.length,
      plan,
      shadow,
      shadowRefusal,
      // A currency's own completeness claim: every printed figure was computed
      // from this currency's candidates and its own declared ceiling.
      figuresComplete: stateKey === 'optimal' && Boolean(plan) && !plan.refused && plan.reconciles && !ambiguousCeiling,
    };
  });

  /* 5. Ceilings that govern nothing: an honest omission is visible, not hidden. */
  const currencySet = new Set(byCurrency.keys());
  const ceilingsN = ceilings.filter((row) => !row.retiredOn).length;
  const orphanCeilings = ceilings.filter((row) => !row.retiredOn && !currencySet.has(row.currency)).map((row) => ({
    id: row.id, currency: row.currency, period: capitalPeriod(row.periodFrom, row.periodTo),
    cents: row.cents, declaredByName: nameOf(row.declaredById),
  }));

  /* 6. Totals. Counts across the visible book; money per currency only. */
  const totals = {
    currenciesN: currencies.length,
    currenciesRefusedN: currencies.filter((row) => !row.figuresComplete).length,
    candidatesN: currencies.reduce((n, row) => n + row.candidatesN, 0),
    selectedN: currencies.reduce((n, row) => n + (row.plan && !row.plan.refused ? row.plan.selected.length : 0), 0),
    ceilingsN,
    ceilingsLiveN: currencies.filter((row) => Boolean(row.ceiling)).length,
    ambiguousCeilingsN: currencies.filter((row) => Boolean(row.ceiling?.ambiguous)).length,
    relationsN: relations.filter((row) => !row.retiredOn).length,
    relationsAppliedN: currencies.reduce((n, row) => n + row.appliedRelationsN, 0),
    relationsExcludedN: currencies.reduce((n, row) => n + row.excludedRelationsN, 0),
    exclusiveN: currencies.reduce((n, row) => n + row.exclusiveN, 0),
    requiresN: currencies.reduce((n, row) => n + row.requiresN, 0),
    overlapN: currencies.reduce((n, row) => n + row.overlapN, 0),
    proposedN: notCandidates.proposedN,
    closedN: notCandidates.closedN,
    rejectedN: notCandidates.rejectedN,
    withdrawnN: notCandidates.withdrawnN,
    reviewDueN: notCandidates.reviewDueN,
    unpricedN: notCandidates.unpricedN,
    tooHeavyN: notCandidates.tooHeavyN,
    outsideN,
    orphanCeilingsN: orphanCeilings.length,
    currenciesOverLimitN: Math.max(0, currencyKeys.length - solvedKeys.length),
    rankOrderGapN: currencies.filter((row) => row.plan && !row.plan.refused && row.plan.rank.gapCents > 0).length,
  };

  /* 7. Refusals: every reason a figure on this page is a dash or an empty set. */
  const refusals = [];
  const refuse = (key, says = null) => refusals.push({ key, says: says || REFUSAL_BY_KEY[key]?.says || key });
  if (currencies.length) refuse('currencies-not-pooled');
  if (currencies.some((row) => row.plan && !row.plan.refused)) refuse('npv-not-summed-across-days');
  if (currencies.some((row) => row.stateKey === 'no-ceiling')) refuse('no-ceiling-declared', `${currencies.filter((row) => row.stateKey === 'no-ceiling').length} currency(ies) hold ratified candidates but no seat has declared a ceiling for them. Nothing is cut off against a number nobody declared.`);
  if (!ceilingsN) refuse('no-ceiling-by-any-seat');
  const refusedN = currencies.filter((row) => row.stateKey === 'node-budget-exhausted' || row.stateKey === 'too-many-cases').length;
  if (refusedN) refuse('search-refused', `${refusedN} currency(ies) were refused by the exact search (node budget or certified size). No approximate set is offered in their place.`);
  if (totals.unpricedN) refuse('unpriced-candidate', `${totals.unpricedN} ratified case(s) could not be priced — its flows or declared hurdle do not resolve — and are excluded from every set rather than treated as free, because a case priced at zero is always selected.`);
  if (totals.relationsExcludedN) refuse('relation-unreadable', `${totals.relationsExcludedN} declared relation(s) do not join two candidates in the same currency and are counted but not applied. A constraint nobody can evaluate is not silently assumed.`);
  if (totals.orphanCeilingsN) refuse('no-ceiling-declared', `${totals.orphanCeilingsN} declared ceiling(s) govern no candidate in this seat's span.`);
  if (totals.ambiguousCeilingsN) refuse('search-refused', `${totals.ambiguousCeilingsN} currency(ies) carry MORE THAN ONE live ceiling over the same day. The register prints both and refuses to pick one: choosing a constraint on a human's behalf is exactly the arbitration this register exists to force.`);
  if (totals.tooHeavyN) refuse('already-decided', `${totals.tooHeavyN} candidate(s) commit more than the ENTIRE declared ceiling and therefore cannot be in any feasible set. They are printed with that reason rather than dropped.`);
  if (totals.proposedN) refuse('already-decided', `${totals.proposedN} proposal(s) are not candidates: nobody has ratified them, so they are not yet fundable.`);
  if (totals.closedN || totals.rejectedN || totals.withdrawnN) refuse('already-decided', `${totals.closedN + totals.rejectedN + totals.withdrawnN} decided case(s) (closed, refused or withdrawn) are not candidates. The funded set is a recommendation over what nobody has decided; a decision already taken is a fact this register does not re-open.`);
  if (totals.outsideN) refuse('outside-span', `${totals.outsideN} case(s) belong to benefit owners outside this seat's tree and declared lines. They are counted, never listed, and never enter a set this seat reads.`);
  if (totals.currenciesOverLimitN) refuse('truncated', `${totals.currenciesOverLimitN} currency(ies) beyond the ${L.maxCurrencies} this read solves are counted and not solved. A workspace holding more currencies than that is a question for the treasury, not a screen.`);
  if (warnings.length) refuse('invalid-ledger', warnings.join(' '));
  if (currencies.length && !currencies.some((row) => row.plan && !row.plan.refused && row.plan.rank.gapCents > 0)) refuse('rank-order-equal');

  /* 8. Who a missing ceiling is owed to. A ceiling is the enterprise's own claim,
       so it is owed to the seat that can declare one. */
  const ceilingOwners = [];
  if (matrix) {
    const apex = matrixJointApex(matrix, [...matrix.roster].filter((personId) => personId !== LEADER_ID));
    if (apex.unique && apex.apexId && apex.apexId !== LEADER_ID && matrix.roster.has(apex.apexId)) {
      ceilingOwners.push({ seatId: apex.apexId, seatName: nameOf(apex.apexId), basis: 'apex' });
    } else {
      ceilingOwners.push({ seatId: null, seatName: null, basis: apex.isLeaderOnly || !apex.unique ? (apex.disconnected ? 'ambiguous' : 'leader-held') : 'unknown' });
    }
  }

  return {
    today,
    actorId,
    seat: {
      operator,
      rank: operator ? null : (seat.rank ?? null),
      label: operator ? 'Workspace leader (operator view)' : (seat.label || ''),
      canDeclareCeiling, canDeclareRelation, canGovern,
    },
    conventions: conv,
    currencies: currencies.slice(0, L.planRowsShown),
    allCurrencies: currencies,
    currenciesNotSolved: currencyKeys.slice(L.maxCurrencies),
    ceilings: ceilings.filter((row) => !row.retiredOn).map((row) => ({
      ...row, declaredByName: nameOf(row.declaredById), period: capitalPeriod(row.periodFrom, row.periodTo),
      liveToday: row.periodFrom <= today && today <= row.periodTo,
      candidatesN: byCurrency.get(row.currency)?.length ?? 0,
    })),
    orphanCeilings,
    relations: relations.filter((row) => !row.retiredOn).map((row) => ({
      ...row, kindMeta: capitalRelationKindByKey(row.kind), declaredByName: nameOf(row.declaredById),
    })),
    totals,
    refusals,
    ceilingOwners,
    attentionN: currencies.filter((row) => row.stateKey === 'no-ceiling').length * (ceilingOwners.length ? 1 : 0),
    method: CAPITAL_RATIONING_METHOD,
    frameworks: CAPITAL_RATIONING_FRAMEWORKS,
    math: { ...CAPITAL_RATIONING_MATH, shadowStepCents: SHADOW_STEP_CENTS },
    engineVersion: CAPITAL_RATIONING_ENGINE_VERSION,
    settingKeys: CAPITAL_RATIONING_SETTING_KEYS,
    limits: L,
    notCandidates,
  };
}

/* ------------------------------------------------------------------- briefs */

/** Identity-free summary text. No person, no case id, no title, no currency label. */
export function capitalRationingBriefText(report) {
  if (!report) return '';
  const t = report.totals;
  const lines = [
    `Capital rationing — ${report.today}`,
    `${t.candidatesN} ratified candidate(s) in ${t.currenciesN} currenc(ies), ${t.ceilingsLiveN} with a governing declared ceiling; ${t.selectedN} selected across every proven set.`,
  ];
  for (const row of report.currencies || []) {
    const head = `${row.currency}: ${row.candidatesN} candidate(s), ${investmentMoney(row.currency, row.askCents)} asked`;
    if (row.stateKey === 'no-ceiling') { lines.push(`${head} — no declared ceiling, so nothing is cut off.`); continue; }
    if (row.stateKey === 'too-many-cases') { lines.push(`${head} — above the certified problem size; refused rather than approximated.`); continue; }
    if (row.stateKey === 'no-candidates') { lines.push(`${head} — nothing to select.`); continue; }
    if (!row.plan || row.plan.refused) { lines.push(`${head} — the exact search was refused; no set is printed.`); continue; }
    const p = row.plan;
    lines.push(`${head} against a ceiling of ${investmentMoney(row.currency, row.ceiling.cents)}: the proven set commits ${investmentMoney(row.currency, p.weightCents)} for ${investmentMoney(row.currency, p.valueCents)} of present value and leaves ${investmentMoney(row.currency, p.headroomCents)} unspent. One more whole unit of ceiling is worth ${investmentMoney(row.currency, row.shadow ? row.shadow.deltaCents : 0)}. The profitability-index order would have returned ${investmentMoney(row.currency, p.rank.valueCents)} — ${p.rank.gapCents > 0 ? `${investmentMoney(row.currency, p.rank.gapCents)} less than the proven set` : 'exactly the proven value, on today’s candidates'}.`);
  }
  if (t.relationsN) lines.push(`${t.relationsN} declared relation(s): ${t.exclusiveN} alternative pair(s), ${t.requiresN} dependency(ies), ${t.overlapN} shared-benefit declaration(s); ${t.relationsAppliedN} applied inside a currency, ${t.relationsExcludedN} counted and not applied.`);
  lines.push('Currencies are never pooled and net present values valued on different days are never added.');
  return lines.join('\n');
}

/* ---------------------------------------------------------------------- CSV */

const blank = (value) => (value === null || value === undefined ? '' : String(value));

/**
 * CSV scope #153. One workspace row, one row per currency, one row per candidate
 * under an opaque positional code, one row per relation. NO person, NO manager,
 * NO case id, NO title, NO note or reason text. A figure that cannot be claimed
 * exports BLANK with its reason key, never zero.
 */
export function capitalRationingCsvRows(report) {
  if (!report) return [];
  const rows = [];
  const t = report.totals;
  const anyProven = (report.currencies || []).some((row) => row.plan && !row.plan.refused);
  // A relation gets its own opaque positional code across the whole file, so it
  // is exported and can be reconciled without naming either case it joins.
  const relationIndex = new Map();
  for (const row of report.currencies || []) {
    for (const relation of row.relations) if (!relationIndex.has(relation.id)) relationIndex.set(relation.id, relationIndex.size);
  }
  rows.push({
    row_type: 'workspace',
    key: 'workspace',
    currency: '',
    generated_on: report.today,
    candidates_n: t.candidatesN,
    selected_n: anyProven ? t.selectedN : '',
    selection_state: anyProven ? 'optimal' : (t.candidatesN ? 'refused' : 'no-candidates'),
    exclusive_pairs_n: t.exclusiveN,
    requires_pairs_n: t.requiresN,
    overlap_pairs_n: t.overlapN,
    relations_excluded_n: t.relationsExcludedN,
    ceilings_n: t.ceilingsN,
    figures_complete: anyProven ? 'YES' : 'NO',
    claim_reason: anyProven ? '' : (report.refusals[0]?.says || 'no provisionally proven set'),
    engine_version: report.engineVersion,
  });
  for (const row of report.currencies || []) {
    const proven = Boolean(row.plan && !row.plan.refused);
    const reason = proven ? '' : (row.stateMeta?.label || row.stateKey);
    rows.push({
      row_type: 'currency',
      key: row.currency,
      currency: row.currency,
      generated_on: report.today,
      candidates_n: row.candidatesN,
      selected_n: proven ? row.plan.selected.length : '',
      ceiling_cents: row.ceiling ? row.ceiling.cents : '',
      ask_cents: row.askCents,
      selected_cents: proven ? row.plan.weightCents : '',
      headroom_cents: proven ? row.plan.headroomCents : '',
      selection_state: row.stateKey,
      optimal_npv_cents: proven ? row.plan.valueCents : '',
      rank_order_npv_cents: proven ? row.plan.rank.valueCents : '',
      rank_order_gap_cents: proven ? row.plan.rank.gapCents : '',
      shadow_price_cents: row.shadow ? row.shadow.deltaCents : '',
      shadow_price_bp: row.shadow ? row.shadow.shadowBp : '',
      nodes_explored: proven ? row.plan.nodesExplored : '',
      nodes_pruned: proven ? row.plan.nodesPruned : '',
      bound_proven: proven ? 'YES' : 'NO',
      exclusive_pairs_n: row.exclusiveN,
      requires_pairs_n: row.requiresN,
      overlap_pairs_n: row.overlapN,
      relations_excluded_n: row.excludedRelationsN,
      period_from: row.ceiling ? row.ceiling.periodFrom : '',
      period_to: row.ceiling ? row.ceiling.periodTo : '',
      figures_complete: row.figuresComplete ? 'YES' : 'NO',
      claim_reason: reason,
      engine_version: report.engineVersion,
    });
    const codeOf = new Map();
    row.candidates.forEach((candidate, i) => codeOf.set(candidate.caseId, `K${String(i + 1).padStart(2, '0')}`));
    for (const candidate of row.candidates) {
      rows.push({
        row_type: 'case',
        key: codeOf.get(candidate.caseId),
        currency: row.currency,
        generated_on: report.today,
        case_code: codeOf.get(candidate.caseId),
        case_npv_cents: candidate.npvCents,
        case_outlay_cents: candidate.outlayCents,
        case_pi_permille: candidate.piPermille === null ? '' : candidate.piPermille,
        case_status: candidate.status,
        case_selected: proven ? (candidate.selected ? 'YES' : 'NO') : '',
        selection_state: row.stateKey,
        figures_complete: proven ? 'YES' : 'NO',
        claim_reason: proven ? '' : (row.stateMeta?.label || row.stateKey),
        engine_version: report.engineVersion,
      });
    }
    for (const relation of row.relations) {
      // A relation exports under its OWN positional code, exactly like a case:
      // the two case ids it joins are identifiers and never reach the file.
      rows.push({
        row_type: 'relation',
        key: `R${String(relationIndex.get(relation.id) + 1).padStart(2, '0')}`,
        currency: row.currency,
        generated_on: report.today,
        relation_kind: relation.kind,
        relation_bp: relation.overlapBp === null || relation.overlapBp === undefined ? '' : relation.overlapBp,
        relation_state: relation.state,
        figures_complete: proven ? 'YES' : 'NO',
        claim_reason: proven ? '' : (row.stateMeta?.label || row.stateKey),
        engine_version: report.engineVersion,
      });
    }
  }
  // Every row carries every declared column, blank where it does not apply.
  return rows.map((row) => row);
}

/** The attention count the navigation badge reads. */
export function capitalRationingAttentionCount(state = {}, { now = new Date(), seat = null } = {}) {
  try {
    const report = buildCapitalRationing(state, { now, seat });
    const missingCeiling = report.allCurrencies.filter((row) => row.stateKey === 'no-ceiling').length;
    return Math.max(0, missingCeiling);
  } catch {
    return 0;
  }
}
