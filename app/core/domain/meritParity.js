/**
 * app/core/domain/meritParity.js — Matrix Merit Pool Stewardship & Cohort Parity
 * Reading (ADR‑0154, Schema v128 unchanged, `#/merit?panel=matrix`, CSV #116).
 *
 * THE DUTY. The merit pool is finalised once a year and it is the most
 * consequential decision a company makes about a person that is also the least
 * audited. In a matrix the question is sharper than "is the pool inside
 * budget": the people carrying a second line have their work seen by two
 * managers and their pay set by one — or by neither, or by both. This reading
 * answers two separate questions and refuses to collapse them into one word:
 *
 *   1. AUTHORITY — on the day this money takes effect, how many lines held the
 *      declared `pay` right for each person being paid? Exactly one is `clear`;
 *      more than one is `contested`; none is `unowned`.
 *   2. PARITY — did the cohort of people on a second line receive a different
 *      median increase (in basis points of their own pay) than the cohort on a
 *      single line? Printed only when both cohorts clear a declared cell floor
 *      and every pay decision in the cycle is priced. DESCRIPTIVE and UNADJUSTED
 *      by construction: this module never claims a cause and never calls a gap
 *      unfair.
 *
 * WHAT IT NEVER DOES
 * ------------------
 *  - It never prints a figure over a partial table. An unpriced row, an empty
 *    cohort or a pool that moved no money makes the comparison `incomplete`, and
 *    the gap is BLANK with its reason printed — never a zero, never a plausible
 *    default.
 *  - It never reads today's structure into a past (or future) pay decision. The
 *    cohort split and the pay authority are read on the cycle's own effective
 *    date through `periodLinesFor`, which honours each declared line's window.
 *  - It never picks one of several managers as the owner of a pay decision. A
 *    contested right is named and counted; settling it is a human act.
 *  - It never adjusts for level, rating or tenure and never calls the raw
 *    difference an effect. A level-matched reading is printed where both cells
 *    clear the floor, and it is still descriptive.
 *  - It never scores, ranks or shares out a person. Findings are on PAY
 *    DECISIONS, COHORTS and LEVELS. The export carries no identity at all.
 *  - It stores NOTHING. Every figure is re-derived from the stored cycle, the
 *    roster and the dated reporting lines on every read, so what the screen
 *    prints and what the record says cannot drift apart.
 *
 * Pure module: no DOM, no storage, no implicit clock.
 */

import { dayKey } from '../time.js';
import { buildMatrix } from './matrix.js';
import { periodLinesFor } from './reviewStewardship.js';
import {
  buildFrozenStructure,
  buildMeritStructure,
  compareFrozenStructure,
  meritStructureBriefLines,
} from './meritStructure.js';
import { ratingIndex } from './comp.js';
import {
  MERIT_PARITY_CONVENTIONS,
  MERIT_PARITY_COHORTS,
  MERIT_PARITY_CSV_COLUMNS,
  MERIT_PARITY_ENGINE_VERSION,
  MERIT_PARITY_FLOOR,
  MERIT_PARITY_LEVELS,
  MERIT_PARITY_LIMITS,
  MERIT_PARITY_RIGHT,
  MERIT_PARITY_TOLERANCE_BPS,
  meritParityAuthorityState,
  meritParityCohort,
  meritParityDirection,
  meritParityLevelLabel,
  meritParityVerdict,
} from './meritParityRegistry.js';

const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(v).trim().slice(0, 10));

/** Integer cents, or null. A pay figure is never coerced: blank stays blank. */
function cents(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/**
 * Increase in basis points of the person's own pay, exactly.
 *
 * `delta * 10000 / base` is computed in integers and TRUNCATED. The remainder is
 * returned so the caller can print that a figure was truncated instead of
 * implying the arithmetic closed. A percentage of a zero base is refused
 * upstream, never divided here.
 */
function basisPoints(currentCents, proposedCents) {
  const delta = proposedCents - currentCents;
  const numerator = delta * 10000;
  const truncated = numerator % currentCents !== 0;
  return { bps: Math.trunc(numerator / currentCents), deltaCents: delta, truncated };
}

/** Lower median of integers: an integer, by declared convention. */
function lowerMedian(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

const sum = (values) => values.reduce((acc, n) => acc + n, 0);

function emptyCohort(key, extra = {}) {
  const meta = meritParityCohort(key);
  return {
    key,
    label: meta?.label || key,
    hint: meta?.hint || '',
    rowsN: 0,
    includedN: 0,
    excludedN: 0,
    unpricedN: 0,
    zeroIncreaseN: 0,
    medianBps: null,
    medianPrinted: false,
    deltaCents: 0,
    levelMix: [],
    ratingMix: [],
    ...extra,
  };
}

function emptyReport(today, refusals) {
  const verdict = meritParityVerdict('no-cycle');
  return {
    engineVersion: MERIT_PARITY_ENGINE_VERSION,
    today,
    hasCycle: false,
    cycleId: null,
    cycleStatus: null,
    currency: null,
    effectiveOn: null,
    ratingAsOf: null,
    isMatrix: false,
    // ADR-0155: no cycle, so there is no day to read a structure for. The block
    // is present and empty rather than absent, so a view can never render
    // `undefined` as "the structure did not change".
    structure: null,
    frozen: null,
    frozenStructure: null,
    conventions: { ...MERIT_PARITY_CONVENTIONS },
    verdict: verdict?.key || 'no-cycle',
    verdictLabel: verdict?.label || 'No merit cycle to read',
    verdictTone: verdict?.tone || 'neutral',
    verdictOpen: false,
    verdictDetail: verdict?.detail || '',
    authorityVerdict: 'single-line',
    authorityLabel: meritParityAuthorityState('clear')?.label || 'One line holds the pay right',
    authorityTone: 'neutral',
    authorityDetail: 'There is no pay decision, so there is no pay authority to read.',
    gapBps: null,
    gapDirection: null,
    gapDirectionLabel: '—',
    gapWithheld: true,
    gapReason: 'No cycle.',
    cohorts: {
      matrix: emptyCohort('matrix'),
      'single-line': emptyCohort('single-line'),
    },
    rows: [],
    byLevel: [],
    findings: [],
    findingsN: 0,
    totals: {
      rowsN: 0, matrixRowsN: 0, singleRowsN: 0, includedN: 0, excludedN: 0,
      unpricedN: 0, zeroBaseN: 0, missingPersonN: 0, zeroIncreaseN: 0,
      contestedN: 0, unownedN: 0, unreadableN: 0, clearN: 0,
      matrixDeltaCents: 0, singleDeltaCents: 0, poolDeltaCents: 0,
      matrixPoolShareBps: null, truncatedRowN: 0,
      unrecordedHomeN: 0, supersededHomeN: 0, presumedHomeN: 0, projectedHomeN: 0,
      observedHomeN: 0, frozenDifferenceN: 0,
    },
    refusals,
    reconciles: true,
    reconcilesDetail: 'There are no rows to reconcile.',
    figuresComplete: false,
    figuresCompleteDetail: 'No cycle, so no figure is supported by the record.',
  };
}

/**
 * Pick the cycle this reading is about. An explicit id wins; otherwise the draft
 * cycle (the one still being decided) and then the latest effective cycle — the
 * same fallback the terminal itself uses, so the panel and the page cannot be
 * looking at two different cycles.
 */
export function pickMeritParityCycle(state, cycleId = null) {
  const cycles = (Array.isArray(state?.meritCycles) ? state.meritCycles : []).filter((c) => c && c.id);
  if (cycleId) return cycles.find((c) => c.id === cycleId) || null;
  return cycles.find((c) => c.status === 'draft')
    || [...cycles].sort((a, b) => String(b.effectiveOn || '').localeCompare(String(a.effectiveOn || '')))[0]
    || null;
}

/* --------------------------------------------------------------- the report */

/**
 * Build the whole reading for one cycle.
 *
 * `cycleId` is optional (see `pickMeritParityCycle`). `now` fixes the clock;
 * `settings` is the workspace settings the shared matrix engine already takes.
 */
export function buildMeritParity(state, { cycleId = null, now = new Date(), settings = null } = {}) {
  const today = dayKey(now);
  const cycle = pickMeritParityCycle(state, cycleId);
  const refusals = [];
  if (!cycle) {
    return emptyReport(today, [{ kind: 'no-cycle', detail: 'There is no merit cycle in this workspace, so there is no pay decision and no cohort to compare.' }]);
  }

  const effectiveOn = isDay(cycle.effectiveOn) ? String(cycle.effectiveOn).slice(0, 10) : null;
  if (!effectiveOn) {
    return emptyReport(today, [{ kind: 'no-effective-date', detail: 'The cycle carries no readable effective date, so the line set on the day the money lands cannot be read and is not invented.' }]);
  }

  const people = (Array.isArray(state?.people) ? state.people : []).filter((p) => p && p.id);
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const matrix = buildMatrix(state, { now, settings: settings || state?.settings || null });
  // ADR-0155: THE STRUCTURE AS OF THE EFFECTIVE DATE, FROM THE RECORD.
  //
  // `buildMatrix` above reads today's `person.managerId`, and every line-level
  // figure below is derived from it. That is correct for the DECLARED lines (they
  // carry their own windows) and wrong for the HOME line the moment somebody has
  // moved since the money landed: the packet would credit a manager who never saw
  // the decision. The as-of reading substitutes each person's recorded home
  // pointer for the effective date and runs the SAME engine over it, so the
  // cohort split and the pay-right holders are read from the record's answer for
  // that day. A workspace with no recorded home-line history substitutes nothing
  // and every figure below is byte-identical to the pre-ADR-0155 reading.
  const structure = buildMeritStructure(state, { asOf: effectiveOn, now, settings: settings || state?.settings || null });
  const asOfMatrix = structure.asOfMatrix && structure.readable !== undefined ? structure.asOfMatrix : matrix;
  // A rating is read as of the pay decision, and never from the future — the
  // same rule `compensationRows` applies. The date used is printed.
  const ratingAsOf = effectiveOn <= today ? effectiveOn : today;
  const ratings = ratingIndex(state, ratingAsOf);

  const sourceRows = Array.isArray(cycle.rows) ? cycle.rows : [];
  const rawRows = sourceRows.slice(0, MERIT_PARITY_LIMITS.rows);
  const overflowN = sourceRows.length - rawRows.length;
  const malformedN = rawRows.filter((r) => !r || typeof r.personId !== 'string' || !r.personId.trim()).length;
  const personCounts = new Map();
  for (const row of rawRows) {
    if (row && typeof row.personId === 'string' && row.personId.trim()) {
      personCounts.set(row.personId, (personCounts.get(row.personId) || 0) + 1);
    }
  }

  const rows = [];
  for (const row of rawRows) {
    if (!row || typeof row.personId !== 'string' || !row.personId.trim()) continue;
    const person = peopleById.get(row.personId) || null;
    // The lines in force ON THE EFFECTIVE DATE. Not today's shape: a project
    // line that ended in June did not hold this pay decision in November, and
    // one that starts in December did not either. ADR-0155: the reader is the
    // AS-OF graph, so the home line is the one the record says held on that day.
    const lines = person
      ? periodLinesFor(asOfMatrix, row.personId, effectiveOn, effectiveOn, state).filter((l) => l.inPeriod)
      : [];
    // The home-line observation that justifies (or withholds) this row.
    const homeObservation = structure.perPerson?.get?.(row.personId) || null;
    const homeUnreadable = Boolean(homeObservation && homeObservation.state === 'unrecorded');
    const holders = new Map();
    for (const line of lines) {
      const rights = Array.isArray(line.rights) ? line.rights : [];
      if (!rights.includes(MERIT_PARITY_RIGHT)) continue;
      if (!line.managerId) continue;
      if (!holders.has(line.managerId)) holders.set(line.managerId, line.managerName || line.managerId);
    }
    // A row whose person is gone cannot be read: `unknown`, never `unowned`. A
    // row whose HOME line the record does not cover on that day is the same kind
    // of fact — the authority cannot be read, and it is never downgraded to
    // `unowned` (which would claim nobody owned it) or cleared from today.
    const authorityState = !person || homeUnreadable
      ? 'unknown'
      : holders.size > 1 ? 'contested' : holders.size === 1 ? 'clear' : 'unowned';
    const multiLine = lines.length > 1;
    const cohortKey = multiLine ? 'matrix' : 'single-line';

    const currentCents = cents(row.currentPay);
    const proposedCents = cents(row.proposedPay);
    let included = true;
    let excludeReason = null;
    if (personCounts.get(row.personId) > 1) { included = false; excludeReason = 'duplicate-person-row'; }
    else if (!person) { included = false; excludeReason = 'missing-person-row'; }
    // ADR-0155: a home line the record does not cover on the effective date is
    // not a cohort. Placing the row on one side of the comparison would publish
    // a structure claim the record does not support, so the row is counted,
    // excluded and named — which withholds the medians and the gap through the
    // existing complete-pool gate rather than narrowing the sample quietly.
    else if (homeUnreadable) { included = false; excludeReason = 'unrecorded-home-line'; }
    else if (row.currentPay !== undefined && row.currentPay !== null && Number(row.currentPay) === 0) { included = false; excludeReason = 'zero-base-row'; }
    else if (currentCents === null || proposedCents === null) { included = false; excludeReason = 'unpriced-row'; }

    const outcome = included && currentCents !== null && proposedCents !== null
      ? basisPoints(currentCents, proposedCents)
      : null;
    const rating = ratings.get(row.personId) || null;

    rows.push({
      personId: row.personId,
      personName: person?.name || null,
      missingPerson: !person,
      level: row.level || person?.level || null,
      cohort: cohortKey,
      lineN: lines.length,
      lineRoles: lines.map((l) => l.role),
      // ADR-0155: the home line as the RECORD has it on the effective date,
      // whether that differs from today's roster, and the state that justifies
      // it. A row whose home line is unreadable prints no manager at all.
      homeState: homeObservation?.state || (person ? null : 'not-on-roster'),
      homeStateLabel: homeObservation?.stateLabel || null,
      homeManagerId: homeObservation?.state === 'unrecorded' ? null : (homeObservation?.managerId || null),
      homeManagerName: homeObservation?.state === 'unrecorded' ? null : (homeObservation?.managerName || null),
      homeCurrentManagerName: person ? (peopleById.get(person.managerId)?.name || (person.managerId ? person.managerId : null)) : null,
      homeSuperseded: Boolean(homeObservation?.superseded),
      homeReason: homeObservation?.reason || null,
      holderN: holders.size,
      holderNames: [...holders.values()],
      authorityState,
      authorityLabel: meritParityAuthorityState(authorityState)?.label || authorityState,
      included,
      excludeReason,
      bps: outcome ? outcome.bps : null,
      deltaCents: outcome ? outcome.deltaCents : null,
      truncated: outcome ? outcome.truncated : false,
      // A zero increase is a decision that moved no money — read from the CENTS,
      // never from a basis-point figure that truncation may have flattened to 0.
      zeroIncrease: outcome ? outcome.deltaCents === 0 : false,
      rating: rating?.rating || null,
      ratingScore: rating?.score || null,
    });
  }

  // Every row that names a person but no cycle-level person (or vice versa) is
  // counted. A row that vanishes between the cycle and the roster is a fact the
  // reader must see, not a rounding difference.
  const included = rows.filter((r) => r.included);
  const excluded = rows.filter((r) => !r.included);
  const duplicateN = excluded.filter((r) => r.excludeReason === 'duplicate-person-row').length;
  // One complete-pool gate for every reader: counts remain visible, but no
  // narrowed subset may masquerade as the cycle's distribution.
  const partialPool = excluded.length > 0 || overflowN > 0 || malformedN > 0;
  const partialReason = partialPool
    ? `The pay pool is incomplete: ${excluded.length} excluded row(s) (including ${excluded.filter((r) => r.missingPerson).length} off roster and ${excluded.filter((r) => r.excludeReason === 'unrecorded-home-line').length} whose home line the record does not cover on ${effectiveOn}), ${malformedN} malformed row(s) and ${overflowN} beyond the read limit; cohort medians, pool share and comparisons are withheld.`
    : '';

  /* ------------------------------------------------------------- cohorts */
  const cohorts = {};
  for (const spec of MERIT_PARITY_COHORTS) {
    const all = rows.filter((r) => r.cohort === spec.key);
    const inc = all.filter((r) => r.included);
    const values = inc.map((r) => r.bps);
    const printed = !partialPool && inc.length >= MERIT_PARITY_FLOOR;
    const levelCounts = new Map();
    for (const r of inc) {
      const key = r.level || 'unrecorded';
      levelCounts.set(key, (levelCounts.get(key) || 0) + 1);
    }
    const ratingCounts = new Map();
    for (const r of inc) {
      const key = r.rating || 'no-completed-review';
      ratingCounts.set(key, (ratingCounts.get(key) || 0) + 1);
    }
    cohorts[spec.key] = emptyCohort(spec.key, {
      rowsN: all.length,
      includedN: inc.length,
      excludedN: all.length - inc.length,
      unpricedN: all.filter((r) => r.excludeReason === 'unpriced-row' || r.excludeReason === 'zero-base-row').length,
      zeroIncreaseN: inc.filter((r) => r.zeroIncrease).length,
      medianBps: printed ? lowerMedian(values) : null,
      medianPrinted: printed,
      medianWithheldReason: printed ? '' : partialReason || `Fewer than ${MERIT_PARITY_FLOOR} priced people in this cohort.`,
      deltaCents: sum(inc.map((r) => r.deltaCents)),
      levelMix: [...levelCounts.entries()]
        .map(([key, n]) => ({ key, label: key === 'unrecorded' ? 'Unrecorded level' : meritParityLevelLabel(key), n }))
        .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key)),
      ratingMix: [...ratingCounts.entries()]
        .map(([key, n]) => ({ key, n }))
        .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key)),
    });
  }

  const matrixCohort = cohorts.matrix;
  const singleCohort = cohorts['single-line'];
  const poolDeltaCents = matrixCohort.deltaCents + singleCohort.deltaCents;
  const poolShareReason = partialReason || (!matrixCohort.medianPrinted || !singleCohort.medianPrinted
    ? `Both cohorts must clear the floor of ${MERIT_PARITY_FLOOR} priced people before a pool share is printed.`
    : poolDeltaCents <= 0 ? 'The pool moved no net positive money.' : '');
  const matrixPoolShareBps = !poolShareReason
    ? Math.trunc((matrixCohort.deltaCents * 10000) / poolDeltaCents)
    : null;

  /* -------------------------------------------------------- level-matched */
  const levelKeys = new Set();
  for (const r of included) levelKeys.add(r.level || 'unrecorded');
  // A capped or excluded row may belong to any level/cohort. Do not publish
  // level comparisons from a silently narrowed pool.
  const byLevel = [...levelKeys].map((key) => {
    const m = included.filter((r) => r.cohort === 'matrix' && (r.level || 'unrecorded') === key);
    const s = included.filter((r) => r.cohort === 'single-line' && (r.level || 'unrecorded') === key);
    const bothPrinted = !partialPool && poolDeltaCents > 0 && m.length >= MERIT_PARITY_FLOOR && s.length >= MERIT_PARITY_FLOOR;
    const mMed = m.length ? lowerMedian(m.map((r) => r.bps)) : null;
    const sMed = s.length ? lowerMedian(s.map((r) => r.bps)) : null;
    return {
      key,
      label: key === 'unrecorded' ? 'Unrecorded level' : meritParityLevelLabel(key),
      matrixN: m.length,
      singleN: s.length,
      matrixMedianBps: bothPrinted ? mMed : null,
      singleMedianBps: bothPrinted ? sMed : null,
      gapBps: bothPrinted ? mMed - sMed : null,
      printed: bothPrinted,
      withheldReason: bothPrinted
        ? ''
        : partialPool
          ? partialReason
          : poolDeltaCents <= 0
            ? 'The pool moved no net positive money; level comparisons are withheld.'
            : `One or both cohorts hold fewer than ${MERIT_PARITY_FLOOR} priced people at this level.`,
    };
  }).sort((a, b) => {
    const order = new Map(MERIT_PARITY_LEVELS.map((l, i) => [l.key, i]));
    return (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99);
  });
  const matchedLevelN = byLevel.filter((l) => l.printed).length;

  /* -------------------------------------------------------------- verdicts */
  const unpricedN = rows.filter((r) => r.excludeReason === 'unpriced-row' || r.excludeReason === 'zero-base-row').length;
  const missingPersonN = rows.filter((r) => r.excludeReason === 'missing-person-row').length;
  const unrecordedHomeN = rows.filter((r) => r.excludeReason === 'unrecorded-home-line').length;
  const zeroIncreaseN = included.filter((r) => r.zeroIncrease).length;

  if (unrecordedHomeN) {
    refusals.push({
      kind: 'unrecorded-home-line',
      detail: `${unrecordedHomeN} pay decision(s) name a person whose recorded home line does not cover ${effectiveOn}. Their pay authority cannot be read from that day’s structure and is not projected backwards from today’s roster, so the row is excluded from the cohort arithmetic and counted here.`,
    });
  }
  if (unpricedN) {
    refusals.push({ kind: 'unpriced-row', detail: `${unpricedN} pay decision(s) carry no current or proposed figure. They are counted and excluded, and they block the cohort comparison rather than reading as zero increases.` });
  }
  if (missingPersonN) {
    refusals.push({ kind: 'missing-person-row', detail: `${missingPersonN} pay row(s) name a person who is no longer on the roster. Their line count and pay authority cannot be read and are not invented.` });
  }
  if (overflowN) {
    refusals.push({ kind: 'row-cap', detail: `${overflowN} further pay row(s) were beyond the bounded read of ${MERIT_PARITY_LIMITS.rows} and are NOT included in any figure.` });
  }

  if (malformedN) {
    refusals.push({ kind: 'malformed-row', detail: `${malformedN} pay row(s) have no readable person id. They cannot be assigned a cohort; they are counted separately and block the comparison.` });
  }
  if (duplicateN) {
    refusals.push({ kind: 'duplicate-person-row', detail: `${duplicateN} pay row(s) name repeated recipients. Every occurrence is excluded; no pay decision is silently selected and no person is counted twice in a median.` });
  }

  let verdictKey = 'incomplete';
  if (partialPool) {
    // Incompleteness outranks single-line, divergence and parity alike.
  } else if (!rows.length) {
    refusals.push({ kind: 'no-rows', detail: 'The cycle holds no pay decisions. No cohort, no gap and no parity claim is invented from an empty pool.' });
  } else if (matrixCohort.rowsN === 0) {
    verdictKey = 'single-line';
  } else if (matrixCohort.includedN === 0 || singleCohort.includedN === 0) {
    refusals.push({ kind: 'cohort-empty', detail: `The ${matrixCohort.includedN === 0 ? 'second-line' : 'home-line'} cohort holds no priced person, so no difference between the cohorts can be computed.` });
  } else if (matrixCohort.includedN < MERIT_PARITY_FLOOR || singleCohort.includedN < MERIT_PARITY_FLOOR) {
    const thin = matrixCohort.includedN < MERIT_PARITY_FLOOR ? 'second-line' : 'home-line';
    const n = thin === 'second-line' ? matrixCohort.includedN : singleCohort.includedN;
    refusals.push({ kind: 'cohort-below-floor', detail: `The ${thin} cohort holds ${n} priced person(s) against a declared floor of ${MERIT_PARITY_FLOOR}. Its median and the gap are withheld and printed as blank, never as a number or a zero.` });
  } else if (unpricedN || missingPersonN) {
    // Already refused above; the comparison is blocked because a row that could
    // sit on either side of the median is missing.
  } else if (poolDeltaCents <= 0) {
    refusals.push({ kind: 'no-money-moved', detail: 'The pool moved no money, so a zero gap would be an artefact of an unspent cycle rather than evidence of parity.' });
  } else {
    verdictKey = 'divergent';
  }

  // THE GAP IS PRINTED ONLY OVER A COMPLETE TABLE. A cohort median computed with
  // an excluded row could be a different median than the one the pool actually
  // produced, so an unpriced row, a removed person or a capped read withholds the
  // gap entirely rather than narrowing the sample quietly.
  const gapComputable = matrixCohort.medianPrinted
    && singleCohort.medianPrinted
    && !partialPool
    && poolDeltaCents > 0;
  const gapBps = gapComputable
    ? matrixCohort.medianBps - singleCohort.medianBps
    : null;
  let gapDirection = null;
  if (gapBps !== null) {
    if (Math.abs(gapBps) < MERIT_PARITY_TOLERANCE_BPS) gapDirection = 'level';
    else gapDirection = gapBps < 0 ? 'matrix-below' : 'matrix-above';
    if (verdictKey === 'divergent' && gapDirection === 'level') verdictKey = 'parity';
  }

  const parityMeta = meritParityVerdict(verdictKey);
  const directionMeta = gapDirection ? meritParityDirection(gapDirection) : null;
  const gapWithheld = gapBps === null;
  const gapReason = gapWithheld
    ? (verdictKey === 'single-line'
      ? 'No person in this cycle sat on a second reporting line on the effective date, so there is no second-line cohort to compare against.'
      : partialReason || (refusals.find((r) => ['cohort-below-floor', 'cohort-empty', 'unpriced-row', 'missing-person-row', 'unrecorded-home-line', 'no-money-moved', 'no-rows', 'row-cap'].includes(r.kind))?.detail
        || 'The comparison could not be completed.'))
    : '';

  /* ------------------------------------------------------------- authority */
  const contested = rows.filter((r) => r.authorityState === 'contested');
  const unowned = rows.filter((r) => r.authorityState === 'unowned');
  const unreadable = rows.filter((r) => r.authorityState === 'unknown');
  const authorityVerdict = unreadable.length || malformedN || overflowN
    ? 'unknown'
    : matrixCohort.rowsN === 0
      ? 'single-line'
      : unowned.length
        ? 'unowned'
        : contested.length
          ? 'contested'
          : 'clear';
  const authorityMeta = meritParityAuthorityState(authorityVerdict);

  const findings = [];
  for (const r of unreadable) {
    // ADR-0155: two different reasons for `unknown`, and they are not
    // interchangeable. A person off the roster is gone; a home line the record
    // does not cover on that day is a gap in the ledger. Both withhold the
    // authority; only one of them can be fixed by recording a move.
    const why = r.excludeReason === 'unrecorded-home-line'
      ? `The recorded home line for this person does not cover ${effectiveOn}, so the lines in force on that day cannot be read from the record. The row is excluded from the arithmetic and the authority is UNKNOWN — never projected backwards from today’s roster.`
      : 'The pay row names a person who is no longer on the roster, so the lines in force on the effective date cannot be read. The row is excluded from the arithmetic and the authority is UNKNOWN — never imputed.';
    findings.push({
      kind: r.excludeReason === 'unrecorded-home-line' ? 'unrecorded-home-line' : 'unreadable-pay-authority',
      personId: r.personId,
      personName: r.personName,
      cohort: r.cohort,
      lineN: r.lineN,
      detail: why,
    });
  }
  // ADR-0155: a home line the record has superseded, on a decision already made.
  // This is the finding the whole module exists to print: the pay authority on
  // the packet is not the manager the org chart shows today.
  for (const r of rows) {
    if (!r.homeSuperseded) continue;
    findings.push({
      kind: 'home-line-superseded',
      personId: r.personId,
      personName: r.personName,
      cohort: r.cohort,
      lineN: r.lineN,
      homeStateLabel: r.homeStateLabel,
      detail: `On ${effectiveOn} this person’s home line was ${r.homeManagerName || 'unreadable'} per the record; today’s roster shows ${r.homeCurrentManagerName || 'unreadable'}. The reading uses the recorded manager for that day and never today’s chart.`,
    });
  }
  for (const r of unowned) {
    findings.push({
      kind: 'unowned-pay-authority',
      personId: r.personId,
      personName: r.personName,
      cohort: r.cohort,
      lineN: r.lineN,
      detail: 'No line in force on the effective date declares the `pay` right for this person.',
    });
  }
  for (const r of contested) {
    findings.push({
      kind: 'contested-pay-authority',
      personId: r.personId,
      personName: r.personName,
      cohort: r.cohort,
      lineN: r.lineN,
      holderN: r.holderN,
      holderNames: r.holderNames,
      detail: `${r.holderN} managers hold the \`pay\` right for this person on the effective date. This reading names the ambiguity and never picks an owner.`,
    });
  }
  if (verdictKey === 'divergent') {
    findings.push({
      kind: 'cohort-divergence',
      cohort: 'matrix',
      gapBps,
      gapDirection,
      detail: `${directionMeta?.label || 'The cohorts differ'} by ${Math.abs(gapBps)} basis points of median increase (unadjusted median difference, not a rate or an effect).`,
    });
  }
  const findingsCapped = findings.slice(0, MERIT_PARITY_LIMITS.findings);

  /* ---------------------------------------------------------- reconciliation */
  const rowsCounted = matrixCohort.rowsN + singleCohort.rowsN;
  const reconciles = rowsCounted === rows.length
    && matrixCohort.includedN + matrixCohort.excludedN === matrixCohort.rowsN
    && singleCohort.includedN + singleCohort.excludedN === singleCohort.rowsN
    && included.length + excluded.length === rows.length
    && rows.length + malformedN + overflowN === sourceRows.length;
  // Two claims, kept apart on purpose (North Star, Bulletproof Reliability):
  // `reconciles` says the printed counts add up; `figuresComplete` says every
  // figure that WAS printed is computed from the record and nothing needed is
  // missing. A single-line pool prints no gap and is complete about that.
  const figuresComplete = reconciles
    && !partialPool
    && rows.length > 0
    && rows.every((r) => !r.included || (Number.isInteger(r.bps) && Number.isInteger(r.deltaCents)))
    && matrixCohort.includedN + singleCohort.includedN === included.length
    && (gapBps !== null || verdictKey === 'single-line');

  /* ------------------------------------------- ADR-0155: the structure record */
  //
  // Two more claims, kept apart from the money and from each other:
  //
  //   `structure`  — what the RECORD says the home lines were on the effective
  //                  date, and how many of those days the ledger actually covers.
  //   `frozen`     — a comparison of that reading against the structure block
  //                  frozen beside the money at finalisation. Reporting only: a
  //                  drift is printed, never corrected in either direction.
  const structureReading = {
    asOf: structure.asOf,
    today: structure.today,
    daysToEffective: structure.daysToEffective,
    isFuture: structure.isFuture,
    hasLedger: structure.hasLedger,
    ledgerCoverageStart: structure.ledgerCoverageStart,
    rowN: structure.rowN,
    rows: structure.rows,
    remainderN: structure.remainderN,
    stateCounts: structure.stateCounts,
    observedN: structure.observedN,
    projectedN: structure.projectedN,
    presumedN: structure.presumedN,
    unrecordedN: structure.unrecordedN,
    notOnRosterN: structure.notOnRosterN,
    reconciles: structure.reconciles,
    reconcilesDetail: structure.reconcilesDetail,
    superseded: structure.superseded,
    supersededN: structure.supersededN,
    supersedesToday: structure.supersedesToday,
    readable: structure.readable,
    refusedN: structure.refusedN,
    defects: structure.defects,
    refusals: structure.refusals,
    briefLines: meritStructureBriefLines(structure, null),
  };
  const frozenComparison = compareFrozenStructure(cycle.audit?.structure || null, structure);
  // The live reading cannot be trusted to describe a past decision when it
  // cannot read the home line at all — so `figuresComplete` is withheld too.
  const structureBlocked = !structure.readable;
  const figuresCompleteFinal = figuresComplete && !structureBlocked;

  return {
    engineVersion: MERIT_PARITY_ENGINE_VERSION,
    today,
    hasCycle: true,
    cycleId: cycle.id,
    cycleStatus: cycle.status,
    currency: cycle.currency || 'USD',
    effectiveOn,
    ratingAsOf,
    isMatrix: matrixCohort.rowsN > 0,
    structure: structureReading,
    frozen: frozenComparison,
    frozenStructure: cycle.audit?.structure || null,
    conventions: { ...MERIT_PARITY_CONVENTIONS },
    verdict: parityMeta?.key || verdictKey,
    verdictLabel: parityMeta?.label || verdictKey,
    verdictTone: parityMeta?.tone || 'neutral',
    verdictOpen: Boolean(parityMeta?.open),
    verdictDetail: parityMeta?.detail || '',
    authorityVerdict,
    authorityLabel: authorityMeta?.label || authorityVerdict,
    authorityTone: authorityMeta?.tone || 'neutral',
    authorityDetail: authorityMeta?.detail || '',
    gapBps,
    gapDirection,
    gapDirectionLabel: directionMeta?.label || '—',
    gapWithheld,
    gapReason,
    poolShareReason,
    cohorts,
    rows,
    byLevel,
    matchedLevelN,
    findings: findingsCapped,
    findingsN: findings.length,
    cappedFindingsN: Math.max(0, findings.length - findingsCapped.length),
    totals: {
      rowsN: rows.length,
      matrixRowsN: matrixCohort.rowsN,
      singleRowsN: singleCohort.rowsN,
      includedN: included.length,
      excludedN: excluded.length,
      unpricedN,
      missingPersonN,
      zeroIncreaseN,
      contestedN: contested.length,
      unownedN: unowned.length,
      unreadableN: unreadable.length,
      clearN: rows.filter((r) => r.authorityState === 'clear').length,
      matrixDeltaCents: matrixCohort.deltaCents,
      singleDeltaCents: singleCohort.deltaCents,
      poolDeltaCents,
      matrixPoolShareBps,
      truncatedRowN: included.filter((r) => r.truncated).length,
      overflowN,
      malformedN,
      duplicateN,
      sourceRowsN: sourceRows.length,
      matchedLevelN,
      // ADR-0155: the structure the money was decided under.
      unrecordedHomeN,
      supersededHomeN: structure.supersededN,
      presumedHomeN: structure.presumedN,
      projectedHomeN: structure.projectedN,
      observedHomeN: structure.observedN,
      frozenDifferenceN: frozenComparison.differenceN,
    },
    refusals,
    reconciles,
    reconcilesDetail: reconciles
      ? `${matrixCohort.rowsN} second-line row(s) + ${singleCohort.rowsN} home-line row(s) = ${rows.length} pay row(s); ${included.length} priced + ${excluded.length} excluded = ${rows.length}. ${rows.length} classified + ${malformedN} malformed + ${overflowN} beyond the read limit = ${sourceRows.length} stored pay row(s).`
      : `The rows do not reconcile: ${matrixCohort.rowsN} + ${singleCohort.rowsN} counted against ${rows.length} read, and ${included.length} + ${excluded.length} against ${rows.length}. This reading is NOT trustworthy.`,
    figuresComplete: figuresCompleteFinal,
    figuresCompleteDetail: !figuresCompleteFinal
      ? (structureBlocked
        ? `The structure the money was decided under cannot be read: ${structure.unrecordedN} person(s) have a recorded home-line history that does not cover ${effectiveOn}. Every figure that depends on the home line is withheld rather than projected backwards from today.`
        : gapBps === null
          ? partialReason || 'The cohort gap is not printed; the record does not support a complete comparison.'
          : 'The counts reconcile but at least one printed figure is not fully supported by the record.')
      : (gapBps === null
        ? 'There is no second-line cohort, so no gap is printed — and none is claimed. Every printed count is the computed count.'
        : 'Every printed figure is the computed figure, and every figure the comparison needed was present.'),
  };
}

/** Attention badge: pay decisions in this cycle whose authority is not clean. */
export function meritParityAttentionCount(state, { cycleId = null, now = new Date(), settings = null } = {}) {
  const report = buildMeritParity(state, { cycleId, now, settings });
  return report.totals.contestedN + report.totals.unownedN;
}

/**
 * The identity-free brief a VP can put in a pack. Two verdicts are stated
 * separately because they are two different claims: the authority that set the
 * money, and the difference the money made between the cohorts.
 */
export function meritParityBriefText(state, { cycleId = null, now = new Date(), settings = null } = {}) {
  const r = buildMeritParity(state, { cycleId, now, settings });
  if (!r.hasCycle) return `Matrix merit parity — ${r.today}: there is no merit cycle in this workspace, so there is no pay decision to read.`;
  const lines = [
    `Matrix merit parity — ${r.today}, cycle effective ${r.effectiveOn} (${r.currency}).`,
    `Pay decisions read: ${r.totals.rowsN} (${r.totals.matrixRowsN} on a second line, ${r.totals.singleRowsN} on a home line only); ${r.totals.includedN} priced, ${r.totals.excludedN} excluded (${r.totals.unpricedN} unpriced, ${r.totals.missingPersonN} naming a person no longer on the roster).`,
    `Authority: ${r.authorityLabel.toLowerCase()}. ${r.totals.contestedN} decision(s) carry a contested pay right, ${r.totals.unownedN} carry none and ${r.totals.unreadableN} cannot be read; ${r.totals.clearN} are held by exactly one line. A contested right is named here, never settled here.`,
  ];
  // ADR-0155: the structure the money was decided under, kept separate from the
  // money and from the parity word above it.
  if (r.structure) lines.push(...meritStructureBriefLines(r.structure, r.frozen));
  if (r.structure?.supersededN) {
    lines.push(`Of these, ${r.structure.supersededN} home line(s) differ from today’s roster: the packet names the manager the record says held the line on ${r.effectiveOn}, and never today’s chart.`);
  }
  if (r.frozen && r.frozen.compared) {
    lines.push(`Frozen structure: ${r.frozen.label}. ${r.frozen.differenceN} difference(s) between the frozen block and the reading taken now; the frozen record is not edited to match and the live reading is not overwritten to agree.`);
  }
  if (r.gapWithheld) {
    lines.push(`Cohort comparison: REFUSED. ${r.gapReason}`);
  } else {
    lines.push(`Cohort comparison: median increase ${r.cohorts.matrix.medianBps} bp on a second line against ${r.cohorts['single-line'].medianBps} bp on a home line only — a ${r.gapBps > 0 ? '+' : ''}${r.gapBps} bp UNADJUSTED difference, inside a declared ±${MERIT_PARITY_TOLERANCE_BPS} bp band it ${r.verdict === 'parity' ? 'does' : 'does not'} clear. This is descriptive, not causal and not a finding of unfairness.`);

  }
  if (r.totals.malformedN || r.totals.overflowN) lines.push(`${r.totals.malformedN} malformed row(s) and ${r.totals.overflowN} beyond the read limit; ${r.totals.sourceRowsN} stored row(s) in all.`);
  lines.push(`Cell floor ${MERIT_PARITY_FLOOR} people per cohort; ${r.matchedLevelN} level-matched cell(s) cleared the floor as well. The export carries no name, no salary and no individual increase.`);
  return lines.join(' ');
}

/* ------------------------------------------------------------------- CSV */

/**
 * Aggregate-only rows: one `summary` row and one `level` row per level present in
 * either cohort. NO person, no name, manager id, salary or individual increase.
 * A withheld figure is BLANK with `withheld_reason` printed, never a zero.
 */
export function meritParityCsvRows(state, { cycleId = null, now = new Date(), settings = null } = {}) {
  const r = buildMeritParity(state, { cycleId, now, settings });
  if (!r.hasCycle) return [];
  const base = {
    cycle_status: r.cycleStatus || '',
    currency: r.currency || '',
    effective_on: r.effectiveOn || '',
    cell_floor: String(MERIT_PARITY_FLOOR),
    tolerance_bps: String(MERIT_PARITY_TOLERANCE_BPS),
    rows_n: String(r.totals.rowsN),
    matrix_rows_n: String(r.totals.matrixRowsN),
    single_rows_n: String(r.totals.singleRowsN),
    excluded_rows_n: String(r.totals.excludedN),
    matrix_included_n: String(r.cohorts.matrix.includedN),
    single_included_n: String(r.cohorts['single-line'].includedN),
    matrix_zero_increase_n: String(r.cohorts.matrix.zeroIncreaseN),
    single_zero_increase_n: String(r.cohorts['single-line'].zeroIncreaseN),
    authority_verdict: r.authorityVerdict,
    contested_authority_n: String(r.totals.contestedN),
    unowned_authority_n: String(r.totals.unownedN),
    parity_verdict: r.verdict,
    reconciles: r.reconciles ? 'yes' : 'no',
    figures_complete: r.figuresComplete ? 'yes' : 'no',
    // ADR-0155: the structure the money was decided under — counts only.
    structure_as_of: r.structure?.asOf || '',
    structure_observed_n: String(r.totals.observedHomeN ?? 0),
    structure_projected_n: String(r.totals.projectedHomeN ?? 0),
    structure_presumed_n: String(r.totals.presumedHomeN ?? 0),
    structure_unrecorded_n: String(r.totals.unrecordedHomeN ?? 0),
    structure_superseded_n: String(r.totals.supersededHomeN ?? 0),
    structure_reconciles: r.structure ? (r.structure.reconciles ? 'yes' : 'no') : '',
    frozen_structure_status: r.frozen?.key || 'not-frozen',
    frozen_structure_on: r.frozen?.frozenAt || '',
    frozen_structure_diff_n: String(r.frozen?.differenceN ?? 0),
  };
  const rows = [{
    row_kind: 'summary',
    ...base,
    matrix_median_bps: r.cohorts.matrix.medianPrinted ? String(r.cohorts.matrix.medianBps) : '',
    single_median_bps: r.cohorts['single-line'].medianPrinted ? String(r.cohorts['single-line'].medianBps) : '',
    gap_bps: r.gapBps === null ? '' : String(r.gapBps),
    gap_direction: r.gapDirection || '',
    matrix_pool_share_bps: r.totals.matrixPoolShareBps === null ? '' : String(r.totals.matrixPoolShareBps),
    level: '',
    matrix_level_n: '',
    single_level_n: '',
    level_gap_bps: '',
    withheld_reason: r.gapWithheld ? r.gapReason : '',
  }];
  const ordered = (row) => Object.fromEntries(
    MERIT_PARITY_CSV_COLUMNS.map((key) => [key, row[key] === undefined || row[key] === null ? '' : row[key]]),
  );
  for (const level of r.byLevel) {
    rows.push({
      row_kind: 'level',
      ...base,
      matrix_median_bps: '',
      single_median_bps: '',
      gap_bps: '',
      gap_direction: '',
      matrix_pool_share_bps: '',
      level: level.key,
      matrix_level_n: String(level.matrixN),
      single_level_n: String(level.singleN),
      level_gap_bps: level.gapBps === null ? '' : String(level.gapBps),
      withheld_reason: level.printed ? '' : level.withheldReason,
    });
  }
  return rows.map(ordered);
}

export { MERIT_PARITY_CSV_COLUMNS };
export const MERIT_PARITY_CSV_DESCRIPTOR_COLUMNS = MERIT_PARITY_CSV_COLUMNS;
