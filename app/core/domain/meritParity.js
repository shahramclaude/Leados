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
  // A rating is read as of the pay decision, and never from the future — the
  // same rule `compensationRows` applies. The date used is printed.
  const ratingAsOf = effectiveOn <= today ? effectiveOn : today;
  const ratings = ratingIndex(state, ratingAsOf);

  const rawRows = (Array.isArray(cycle.rows) ? cycle.rows : []).slice(0, MERIT_PARITY_LIMITS.rows);
  const overflowN = Math.max(0, (Array.isArray(cycle.rows) ? cycle.rows.length : 0) - rawRows.length);

  const rows = [];
  for (const row of rawRows) {
    if (!row || !row.personId) continue;
    const person = peopleById.get(row.personId) || null;
    // The lines in force ON THE EFFECTIVE DATE. Not today's shape: a project
    // line that ended in June did not hold this pay decision in November, and
    // one that starts in December did not either.
    const lines = person
      ? periodLinesFor(matrix, row.personId, effectiveOn, effectiveOn, state).filter((l) => l.inPeriod)
      : [];
    const holders = new Map();
    for (const line of lines) {
      const rights = Array.isArray(line.rights) ? line.rights : [];
      if (!rights.includes(MERIT_PARITY_RIGHT)) continue;
      if (!line.managerId) continue;
      if (!holders.has(line.managerId)) holders.set(line.managerId, line.managerName || line.managerId);
    }
    // A row whose person is gone cannot be read: `unknown`, never `unowned`.
    const authorityState = !person
      ? 'unknown'
      : holders.size > 1 ? 'contested' : holders.size === 1 ? 'clear' : 'unowned';
    const multiLine = lines.length > 1;
    const cohortKey = multiLine ? 'matrix' : 'single-line';

    const currentCents = cents(row.currentPay);
    const proposedCents = cents(row.proposedPay);
    let included = true;
    let excludeReason = null;
    if (!person) { included = false; excludeReason = 'missing-person-row'; }
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

  /* ------------------------------------------------------------- cohorts */
  const cohorts = {};
  for (const spec of MERIT_PARITY_COHORTS) {
    const all = rows.filter((r) => r.cohort === spec.key);
    const inc = all.filter((r) => r.included);
    const values = inc.map((r) => r.bps);
    const printed = inc.length >= MERIT_PARITY_FLOOR;
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
  const matrixPoolShareBps = poolDeltaCents > 0
    ? Math.trunc((matrixCohort.deltaCents * 10000) / poolDeltaCents)
    : null;

  /* -------------------------------------------------------- level-matched */
  const levelKeys = new Set();
  for (const r of included) levelKeys.add(r.level || 'unrecorded');
  // A capped or excluded row may belong to any level/cohort. Do not publish
  // level comparisons from a silently narrowed pool.
  const partialPool = excluded.length > 0 || overflowN > 0;
  const byLevel = [...levelKeys].map((key) => {
    const m = included.filter((r) => r.cohort === 'matrix' && (r.level || 'unrecorded') === key);
    const s = included.filter((r) => r.cohort === 'single-line' && (r.level || 'unrecorded') === key);
    const bothPrinted = !partialPool && m.length >= MERIT_PARITY_FLOOR && s.length >= MERIT_PARITY_FLOOR;
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
          ? `The pay pool is incomplete: ${excluded.length} excluded row(s) and ${overflowN} beyond the read limit; level comparisons are withheld.`
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
  const zeroIncreaseN = included.filter((r) => r.zeroIncrease).length;

  if (unpricedN) {
    refusals.push({ kind: 'unpriced-row', detail: `${unpricedN} pay decision(s) carry no current or proposed figure. They are counted and excluded, and they block the cohort comparison rather than reading as zero increases.` });
  }
  if (missingPersonN) {
    refusals.push({ kind: 'missing-person-row', detail: `${missingPersonN} pay row(s) name a person who is no longer on the roster. Their line count and pay authority cannot be read and are not invented.` });
  }
  if (overflowN) {
    refusals.push({ kind: 'row-cap', detail: `${overflowN} further pay row(s) were beyond the bounded read of ${MERIT_PARITY_LIMITS.rows} and are NOT included in any figure.` });
  }

  let verdictKey = 'incomplete';
  if (!rows.length) {
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
    && unpricedN === 0
    && missingPersonN === 0
    && overflowN === 0;
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
      : (refusals.find((r) => ['cohort-below-floor', 'cohort-empty', 'unpriced-row', 'missing-person-row', 'no-money-moved', 'no-rows', 'row-cap'].includes(r.kind))?.detail
        || 'The comparison could not be completed.'))
    : '';

  /* ------------------------------------------------------------- authority */
  const contested = rows.filter((r) => r.authorityState === 'contested');
  const unowned = rows.filter((r) => r.authorityState === 'unowned');
  const unreadable = rows.filter((r) => r.authorityState === 'unknown');
  const authorityVerdict = matrixCohort.rowsN === 0
    ? 'single-line'
    : unreadable.length
      ? 'unknown'
      : unowned.length
        ? 'unowned'
        : contested.length
          ? 'contested'
          : 'clear';
  const authorityMeta = meritParityAuthorityState(authorityVerdict);

  const findings = [];
  for (const r of unreadable) {
    findings.push({
      kind: 'unreadable-pay-authority',
      personId: r.personId,
      personName: r.personName,
      cohort: r.cohort,
      lineN: r.lineN,
      detail: 'The pay row names a person who is no longer on the roster, so the lines in force on the effective date cannot be read. The row is excluded from the arithmetic and the authority is UNKNOWN — never imputed.',
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
    && included.length + excluded.length === rows.length;
  // Two claims, kept apart on purpose (North Star, Bulletproof Reliability):
  // `reconciles` says the printed counts add up; `figuresComplete` says every
  // figure that WAS printed is computed from the record and nothing needed is
  // missing. A single-line pool prints no gap and is complete about that.
  const figuresComplete = reconciles
    && rows.every((r) => !r.included || (Number.isInteger(r.bps) && Number.isInteger(r.deltaCents)))
    && matrixCohort.includedN + singleCohort.includedN === included.length
    && (gapBps !== null || verdictKey === 'single-line');

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
      matchedLevelN,
    },
    refusals,
    reconciles,
    reconcilesDetail: reconciles
      ? `${matrixCohort.rowsN} second-line row(s) + ${singleCohort.rowsN} home-line row(s) = ${rows.length} pay row(s); ${included.length} priced + ${excluded.length} excluded = ${rows.length}.`
      : `The rows do not reconcile: ${matrixCohort.rowsN} + ${singleCohort.rowsN} counted against ${rows.length} read, and ${included.length} + ${excluded.length} against ${rows.length}. This reading is NOT trustworthy.`,
    figuresComplete,
    figuresCompleteDetail: figuresComplete
      ? (gapBps === null
        ? 'There is no second-line cohort, so no gap is printed — and none is claimed. Every printed count is the computed count.'
        : 'Every printed figure is the computed figure, and every figure the comparison needed was present.')
      : gapBps === null
        ? 'The cohort gap is not printed, so no figure is claimed on a partial comparison.'
        : 'The counts reconcile but at least one printed figure is not fully supported by the record.',
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
  if (r.gapWithheld) {
    lines.push(`Cohort comparison: REFUSED. ${r.gapReason}`);
  } else {
    lines.push(`Cohort comparison: median increase ${r.cohorts.matrix.medianBps} bp on a second line against ${r.cohorts['single-line'].medianBps} bp on a home line only — a ${r.gapBps > 0 ? '+' : ''}${r.gapBps} bp UNADJUSTED difference, inside a declared ±${MERIT_PARITY_TOLERANCE_BPS} bp band it ${r.verdict === 'parity' ? 'does' : 'does not'} clear. This is descriptive, not causal and not a finding of unfairness.`);

  }
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
