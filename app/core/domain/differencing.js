/**
 * app/core/domain/differencing.js — the Differencing Defender (Schema v96,
 * ADR-0092). Pure read model and publication planner.
 *
 * THE ONE-SENTENCE JOB
 * --------------------
 * Decide, BEFORE a leader publishes an aggregate, whether that aggregate would let
 * a reader recover a value the workspace withheld — on its own or against every
 * release already in the register — and name the cheapest figure to withhold so it
 * does not.
 *
 * WHAT A RELEASE IS
 * -----------------
 * A release is one published aggregate of one module, at one altitude, on one day:
 * the spans it showed, which of those spans were printed and which were withheld,
 * and which totals went out. `planRelease` reads the module's own aggregate (via
 * ADR-0091's `moduleAggregate`), tries the suppression patterns a leader would
 * actually use, audits each against the register with the exact solver in
 * `differencingDeterminacy.js`, and returns the first pattern that recovers
 * nothing. The chosen pattern is what gets stored, so the register is a record of
 * what was PUBLISHED, not of what was considered.
 *
 * WHY THE PATTERNS ARE ORDERED THE WAY THEY ARE
 * ---------------------------------------------
 * Each step removes exactly one piece of information, and they are ordered from
 * the cheapest loss to the most:
 *
 *   1. `stable`      keep the pattern this module already used on its previous
 *                    release — a stable pattern is the cheapest defence against
 *                    differencing, because unchanged cells make an unchanged
 *                    total uninformative.
 *   2. `cells-one`   withhold one more small cell (complementary suppression).
 *   3. `cells-two`   withhold two more.
 *   4. `totals`      withhold the published totals and keep every cell.
 *   5. `both`        withhold the totals AND one further cell.
 *   6. `refuse`      nothing works: refuse the publication and open the decision.
 *
 * `refuse` is a real outcome, not a bail-out. Reprinting the same total over time
 * leaks the change between the dates no matter how the cells are suppressed, and
 * no suppression pattern can fix that. When the arithmetic says so, the honest
 * product behaviour is to stop the publication and hand the leader the structural
 * remedy — publish a change instead of a level.
 *
 * WHAT IT MAY NEVER DO
 * --------------------
 * Rate a person. Send a message. Edit a reporting line. Close a decision a human
 * opened. Print a determined value as a public figure — a recovery is reported as a
 * COORDINATE and a PROOF, so the leader can act on it without the screen becoming
 * the disclosure it is warning about.
 */
import { dayKey } from '../time.js';
import { activeSeat, buildSeats, resolveSeat } from './seat.js';
import { moduleAggregate } from './disclosure.js';
import { manifestFor } from './disclosureManifests.js';
import {
  DIFFERENCING_DISCLOSURE,
  DIFFERENCING_ENGINE_VERSION,
  DIFFERENCING_EXPOSURES,
  DIFFERENCING_LIMITS,
  DIFFERENCING_MEASURE_LABELS,
  DIFFERENCING_MEASURES,
  DIFFERENCING_PLAYBOOK,
  DIFFERENCING_PREMISE,
  DIFFERENCING_VERDICTS,
  DIFFERENCING_VERDICT_META,
} from './differencingRegistry.js';
import {
  auditSequence,
  auditWithCandidate,
  determinacyLine,
  growthExposures,
  variableKey,
} from './differencingDeterminacy.js';
import { differencesConventions } from './differencingSchema.js';

const DAY_MS = 86400000;

function pct1(value) {
  return Math.round(value * 10) / 10;
}

/** Wilson 95% score interval — the same interval the rest of the app uses. */
export function wilsonInterval(k, n, z = 1.96) {
  if (!Number.isFinite(k) || !Number.isFinite(n) || n <= 0) return { pct: null, lowPct: null, highPct: null };
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return {
    pct: pct1(p * 100),
    lowPct: pct1(Math.max(0, centre - half) * 100),
    highPct: pct1(Math.min(1, centre + half) * 100),
  };
}

/**
 * Wald–Wolfowitz runs test. A total that alternates up and down is not drifting;
 * a total that sits on one side of its median for a long stretch is. This is what
 * separates "the count moves" from "the count is monotonically growing", and it is
 * the diagnosis a leader can act on.
 */
export function runsTest(values) {
  const list = (Array.isArray(values) ? values : []).map(Number).filter((value) => Number.isFinite(value));
  const n = list.length;
  if (n < 4) return { n, runs: null, expected: null, z: null, pValue: null, refused: true, reason: 'Fewer than four published points: a runs test cannot separate drift from noise.' };
  const sorted = [...list].sort((a, b) => a - b);
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  // Values exactly on the median are dropped: they carry no side information and
  // counting them either way biases the run count.
  const sides = list.filter((value) => value !== median).map((value) => (value > median ? '+' : '-'));
  const n1 = sides.filter((side) => side === '+').length;
  const n2 = sides.filter((side) => side === '-').length;
  if (n1 < 2 || n2 < 2) {
    return { n, median, runs: null, expected: null, z: null, pValue: null, refused: true, reason: 'One side of the median has fewer than two points; there is not enough variation to test.' };
  }
  let runs = 1;
  for (let i = 1; i < sides.length; i += 1) if (sides[i] !== sides[i - 1]) runs += 1;
  const expected = (2 * n1 * n2) / (n1 + n2) + 1;
  const variance = (2 * n1 * n2 * (2 * n1 * n2 - n1 - n2)) / (((n1 + n2) ** 2) * (n1 + n2 - 1));
  if (!(variance > 0)) {
    return { n, median, runs, expected, z: null, pValue: null, refused: true, reason: 'The run statistic has zero variance at this sample size.' };
  }
  const z = (runs - expected) / Math.sqrt(variance);
  // Two-sided normal tail. Fewer runs than expected means clustering (drift);
  // more runs means alternation (no drift).
  const pValue = Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
  return {
    n, median, runs, expected: Math.round(expected * 100) / 100, z: Math.round(z * 1000) / 1000,
    pValue: Math.round(pValue * 10000) / 10000, refused: false,
    drift: pValue < 0.05 && runs < expected,
    reason: pValue < 0.05 && runs < expected
      ? 'Fewer runs about the median than chance would produce: the series is clustered, not random, so reprinting a level hands over a trend.'
      : 'The series crosses its median about as often as chance would produce; no clustering is detected.',
  };
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, |ε| < 7.5e-8). */
function normalCdf(x) {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

/**
 * Buishand range test: the maximum partial sum of deviations from the mean,
 * normalised by the series' own sum of squared deviations. It is sensitive to a
 * single shift in level — the exact thing a reorganisation or a policy change
 * does — where the runs test is sensitive to clustering.
 */
export function buishandRange(values) {
  const list = (Array.isArray(values) ? values : []).map(Number).filter((value) => Number.isFinite(value));
  const n = list.length;
  if (n < 4) return { n, statistic: null, pValue: null, refused: true, reason: 'Fewer than four published points.' };
  const mean = list.reduce((sum, value) => sum + value, 0) / n;
  const deviations = list.map((value) => value - mean);
  const total = deviations.reduce((sum, value) => sum + value * value, 0);
  if (!(total > 0)) return { n, statistic: null, pValue: null, refused: true, reason: 'The series is constant; a level shift cannot be tested on it.' };
  let cum = 0;
  let max = 0;
  let min = 0;
  const partial = [];
  for (const deviation of deviations) {
    cum += deviation;
    partial.push(cum);
    max = Math.max(max, cum);
    min = Math.min(min, cum);
  }
  /**
   * Buishand's range statistic in its standard form: the range of the cumulative
   * deviations divided by the sample standard deviation.
   *
   * My first version divided by the sum of squared deviations instead, which
   * SHRINKS as the series gets longer and trendier — a ramp scored lower than
   * noise, exactly backwards. The tests caught it. The published Q/√n bounds
   * (Buishand 1982; ~1.55 at 5% and ~1.70 at 1% for series beyond about ten points)
   * only apply to this normalisation, so the earlier form was both wrong and
   * un-comparable with the numbers printed beside it.
   */
  const sd = Math.sqrt(total / (n - 1));
  const range = max - min;
  const statistic = range / sd;
  const threshold = 1.55;
  const scaled = statistic / Math.sqrt(n);
  const shiftIndex = partial.indexOf(max);
  return {
    n,
    statistic: Math.round(statistic * 1000) / 1000,
    scaled: Math.round(scaled * 1000) / 1000,
    range: Math.round(range * 100) / 100,
    threshold,
    medianIndex: shiftIndex,
    shiftOn: null,
    refused: false,
    shift: scaled > threshold,
    reason: scaled > threshold
      ? 'The range of the cumulative deviations exceeds the 5% bound for this series length: it contains a level shift rather than steady noise, so the before and after are not one measurement.'
      : 'The range of the cumulative deviations sits inside the 5% bound: no single level shift is detected.',
  };
}

const PATTERN_ORDER = Object.freeze(['stable', 'cells-one', 'cells-two', 'totals', 'both', 'refuse']);

/**
 * Build the release candidate for one aggregate under one suppression policy.
 * Pure: takes the scored cells, returns the row the register would store.
 */
export function buildCandidate({ route, cells, releasedOn, attempt, mode = 'as-is', dropCells = 0, withholdTotals = false, cellFloor = 3, stableFrom = null }) {
  const list = (Array.isArray(cells) ? cells : []).map((cell) => ({ ...cell }));
  // Ordering for suppression: smallest count first (the standard complementary
  // choice — the cell whose printing costs the reader least), then a stable id
  // order so the same workspace always produces the same table.
  const printable = list
    .map((cell, index) => ({ cell, index }))
    .filter((row) => row.cell.state === 'printed')
    .sort((a, b) => a.cell.count - b.cell.count || String(a.cell.cellKey).localeCompare(String(b.cell.cellKey)));

  const stateOf = new Map(list.map((cell) => [cell.cellKey, cell.state]));

  if (mode === 'stable' && stableFrom) {
    for (const previous of stableFrom) {
      if (!previous || !previous.cellKey) continue;
      if (!stateOf.has(previous.cellKey)) continue;
      if (previous.state === 'withheld' || previous.state === 'complementary') {
        stateOf.set(previous.cellKey, 'complementary');
      }
    }
  }
  for (let i = 0; i < dropCells && i < printable.length; i += 1) {
    const target = printable[i];
    if (target) stateOf.set(target.cell.cellKey, 'complementary');
  }

  const withheld = [];
  const finalCells = list.map((cell) => {
    const state = stateOf.get(cell.cellKey) === 'printed' ? 'printed' : (stateOf.get(cell.cellKey) === 'complementary' ? 'complementary' : 'withheld');
    if (state !== 'printed') withheld.push(cell.cellKey);
    return {
      cellKey: cell.cellKey,
      state,
      count: state === 'printed' ? cell.count : null,
      open: state === 'printed' ? cell.open : null,
      overdue: state === 'printed' ? cell.overdue : null,
    };
  });

  const totals = [];
  for (const measure of DIFFERENCING_MEASURES) {
    const sum = list.reduce((acc, cell) => acc + (Number(cell[measure]) || 0), 0);
    const blockedByFloor = list.reduce((acc, cell) => acc + (Number(cell.count) || 0), 0) < cellFloor && measure === 'count';
    const printed = !withholdTotals && !blockedByFloor;
    totals.push({ measure, printed, value: printed ? Math.round(sum) : null });
  }

  return {
    id: `candidate-${attempt}`,
    route,
    releasedOn,
    cellFloor,
    attemptN: attempt,
    cells: finalCells,
    totals,
    withheldCells: withheld.length,
  };
}

/**
 * Plan one publication against the register.
 *
 * Returns the candidate to publish, the verdict, everything the audit proved, and
 * the exact reason for every figure it removed. When no pattern works, `refuse` is
 * returned with the structural remedy rather than a shrug.
 */
export function planRelease({ state, route, now = new Date(), seatId = null, settings = null, register = [] } = {}) {
  const manifest = manifestFor(route);
  if (!manifest) {
    return {
      ok: false,
      verdict: DIFFERENCING_VERDICTS.REFUSED,
      error: `“${route}” has no disclosure manifest, so no altitude-appropriate aggregate exists to publish. It is refused rather than guessed at.`,
    };
  }
  const conventions = differencesConventions(settings || state?.settings || {});
  const built = buildSeats(state, { now, settings: settings || state?.settings || {} });
  const seat = seatId ? resolveSeat(built, seatId) : activeSeat(built);
  if (!seat || seat.readOnly) {
    return {
      ok: false,
      verdict: DIFFERENCING_VERDICTS.REFUSED,
      error: 'The declared seat is unresolved and read-only. Choose a valid seat before publishing an aggregate.',
    };
  }
  const aggregate = moduleAggregate(state, manifest, seat, built, { now, settings: settings || state?.settings || {} });
  if (!aggregate) {
    return { ok: false, verdict: DIFFERENCING_VERDICTS.REFUSED, error: `No aggregate read model exists for ${manifest.label}.` };
  }
  // Geometry: every span in the table, exactly as the aggregate scored it. The
  // aggregate's own suppression is the starting point, so this module can only
  // ever ADD suppression — never argue a printed cell back into publication.
  const cells = aggregate.spans.map((span) => ({
    cellKey: String(span.nodeId),
    label: String(span.label || ''),
    // A withheld cell is not automatically a SMALL cell: the aggregate may have
    // blanked it to protect another. Only `why === 'floor'` justifies the sub-floor
    // box the solver applies, and getting that wrong invents a pin that is not
    // there.
    state: span.withhold ? (span.why === 'complementary' ? 'complementary' : 'withheld') : 'printed',
    count: Math.max(0, Number(span.count) || 0),
    open: Math.max(0, Number(span.open) || 0),
    overdue: Math.max(0, Number(span.overdue) || 0),
  }));
  if (!cells.length) {
    return { ok: true, verdict: DIFFERENCING_VERDICTS.REFUSED, refusedEmpty: true, aggregate, seat, manifest, conventions, error: `Nothing in ${manifest.label} is inside this seat's span, so there is nothing to publish. An empty table is not the same claim as "nothing happened".` };
  }

  const releasedOn = dayKey(now);
  const sameRoute = (Array.isArray(register) ? register : [])
    .filter((row) => row && row.route === route)
    .sort((a, b) => String(b.releasedOn).localeCompare(String(a.releasedOn)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  // The previous publication of this module is what a reader can already subtract.
  const previous = sameRoute.find((row) => row.releasedOn < releasedOn) || null;
  const windowRows = sameRoute.slice(0, conventions.differencesWindowReleases);

  const attempts = [];
  let chosen = null;
  let chosenAudit = null;
  for (const pattern of PATTERN_ORDER) {
    if (pattern === 'refuse') break;
    const candidate = buildCandidate({
      route,
      cells,
      releasedOn: `${releasedOn}#${attempts.length + 1}`,
      attempt: attempts.length + 1,
      mode: pattern === 'stable' ? 'stable' : 'as-is',
      stableFrom: pattern === 'stable' && previous ? previous.cells : null,
      dropCells: pattern === 'cells-one' ? 1 : (pattern === 'cells-two' ? 2 : 0),
      withholdTotals: pattern === 'totals' || pattern === 'both',
      cellFloor: conventions.differencesCellFloor,
    });
    // The register row id is the route + day; the audit id carries the attempt so
    // two candidates for the same day cannot collide inside one solve.
    candidate.id = `${route}:${releasedOn}:${attempts.length + 1}`;
    const audited = auditWithCandidate({ releases: windowRows.filter((row) => row.id !== candidate.id), candidate, floor: conventions.differencesCellFloor });
    const caused = audited.caused || [];
    attempts.push({
      pattern,
      attempt: attempts.length + 1,
      described: describePattern(pattern),
      recoveredN: caused.length,
      recovered: caused.slice(0, 12),
      alreadyRecoveredN: audited.alreadyRecoveredN,
      withheldCells: candidate.withheldCells,
      withheldTotals: candidate.totals.filter((total) => !total.printed).map((total) => total.measure),
      candidate,
    });
    if (!caused.length) {
      chosen = candidate;
      chosenAudit = audited;
      break;
    }
  }

  const exposures = detectExposures({ route, previous, chosen: chosen || attempts[attempts.length - 1]?.candidate, register: windowRows, conventions });
  const drift = driftReading(sameRoute, { conventions });

  if (!chosen) {
    const last = attempts[attempts.length - 1] || null;
    return {
      ok: false,
      refused: true,
      verdict: DIFFERENCING_VERDICTS.DETERMINED,
      route,
      manifest: { route: manifest.route, label: manifest.label, mode: manifest.mode },
      seat: publicSeat(seat),
      aggregatedOn: releasedOn,
      aggregate,
      cells,
      attempts,
      recovered: last ? last.recovered : [],
      recoveredN: last ? last.recoveredN : 0,
      alreadyRecoveredN: last ? last.alreadyRecoveredN : 0,
      exposures,
      drift,
      conventions,
      remedy: remedyFor(exposures, drift),
      determinacy: last ? determinacyLine({ equationN: 0, releaseN: windowRows.length, withheldN: last.withheldCells }) : '',
      error: 'No suppression pattern makes this publication safe. Reprinting these figures beside what is already registered determines a value the workspace withheld. The publication is refused.',
    };
  }

  // SAFE means "the aggregate's own suppression was already enough against the
  // register"; PROTECTED means this module had to remove something. Comparing
  // against the number of NON-printed cells is the honest test — a cell the
  // aggregate blanked to protect another is not a second, independent blank.
  const baseWithheld = cells.filter((cell) => cell.state !== 'printed').length;
  const verdict = chosenAudit.recoveredN === 0 && chosen.withheldCells <= baseWithheld && !attempts[0]?.recoveredN
    ? DIFFERENCING_VERDICTS.SAFE
    : DIFFERENCING_VERDICTS.PROTECTED;
  const removals = [];
  if (attempts.length > 1) {
    const first = attempts[0];
    const last = attempts[attempts.length - 1];
    if (last.withheldTotals.length > (first.withheldTotals || []).length) {
      removals.push({
        kind: 'totals',
        measures: last.withheldTotals,
        why: `Publishing ${last.withheldTotals.map((m) => DIFFERENCING_MEASURE_LABELS[m] || m).join(' and ')} beside the registered releases would let a reader subtract two totals and recover a withheld span exactly.`,
      });
    }
    const extraCells = last.withheldCells - (first.withheldCells || 0);
    if (extraCells > 0) {
      removals.push({
        kind: 'cells',
        n: extraCells,
        why: `${extraCells} further small cell(s) are withheld: printing them beside the registered releases would determine a span the table already hides.`,
      });
    }
  }

  return {
    ok: true,
    verdict,
    route,
    manifest: { route: manifest.route, label: manifest.label, mode: manifest.mode },
    seat: publicSeat(seat),
    aggregatedOn: releasedOn,
    aggregate,
    cells,
    candidate: chosen,
    attempts,
    recovered: [],
    recoveredN: 0,
    alreadyRecoveredN: chosenAudit.alreadyRecoveredN,
    exposures,
    drift,
    conventions,
    removals,
    protection: {
      n: chosen.withheldCells,
      extraCells: Math.max(0, chosen.withheldCells - cells.filter((cell) => cell.state !== 'printed').length),
      reason: removals.length ? 'One further figure was withheld so this publication cannot be subtracted against the register.' : '',
    },
    // The line describes THIS publication. A leak already in the register is the
    // register's finding (and RULE-DFR-02 has its own decision for it); reporting
    // it here would make a safe publication look unsafe and an unsafe one look
    // like somebody else's problem.
    determinacy: determinacyLine({ ...chosenAudit, recoveredN: 0 }),
    equationN: chosenAudit.equationN,
    withheldN: chosenAudit.withheldN,
  };
}

function describePattern(pattern) {
  switch (pattern) {
    case 'stable': return 'Keep the suppression pattern this module used on its previous release.';
    case 'cells-one': return 'Withhold one further small cell (complementary suppression).';
    case 'cells-two': return 'Withhold two further small cells.';
    case 'totals': return 'Withhold the published totals and keep every printable cell.';
    case 'both': return 'Withhold the totals and one further cell.';
    default: return 'Refuse the publication.';
  }
}

function publicSeat(seat) {
  return { id: seat.id, label: seat.label, rank: seat.rank, altitudeKey: seat.altitudeKey, fullAccess: seat.fullAccess === true };
}

/**
 * Which differencing channels this publication would open. Named, priced and
 * counted — never inferred from titles.
 */
export function detectExposures({ route, previous = null, chosen = null, register = [], conventions = {} }) {
  const out = [];
  if (!chosen) return out;
  const windowRows = Array.isArray(register) ? register : [];
  if (previous && previous.route === route) {
    const growth = growthExposures({ earlier: previous, later: chosen, floor: conventions.differencesCellFloor || 3 });
    const printedGrowth = growth.filter((row) => row.cellKey !== '__total__');
    const totalGrowth = growth.filter((row) => row.cellKey === '__total__');
    if (printedGrowth.length) {
      out.push({
        ...DIFFERENCING_EXPOSURES.find((row) => row.key === 'growth'),
        n: printedGrowth.length,
        examples: printedGrowth.slice(0, 6).map((row) => ({ cellKey: row.cellKey, metric: row.measure, delta: row.delta })),
        detail: `${printedGrowth.length} cell(s) and ${totalGrowth.length} total(s) are printed on both ${previous.releasedOn} and ${chosen.releasedOn}. A reader learns the exact net change between the two dates even where neither level is small.`,
      });
    }
    const stateChanged = (chosen.cells || []).some((cell) => {
      const before = (previous.cells || []).find((row) => row.cellKey === cell.cellKey);
      return before && before.state !== cell.state;
    });
    if (stateChanged) {
      out.push({
        ...DIFFERENCING_EXPOSURES.find((row) => row.key === 'pairwise-total'),
        n: 1,
        examples: [],
        detail: `The suppression pattern changed since ${previous.releasedOn}. Two releases of the same table with different patterns give a reader an equation about the cells whose state changed.`,
      });
    }
  }
  const sameDay = windowRows.filter((row) => row && row.route !== route && chosen.releasedOn && String(row.releasedOn).slice(0, 10) === String(chosen.releasedOn).slice(0, 10));
  if (sameDay.length) {
    out.push({
      ...DIFFERENCING_EXPOSURES.find((row) => row.key === 'cross-module'),
      n: sameDay.length,
      examples: sameDay.slice(0, 6).map((row) => ({ route: row.route, releasedOn: row.releasedOn })),
      detail: `${sameDay.length} other module(s) published on ${chosen.releasedOn}. Where two modules count overlapping records, one module's total can account for part of the other's.`,
    });
  }
  return out;
}

/** The structural remedy for a refused publication. Never a bigger floor. */
export function remedyFor(exposures, drift) {
  if (drift && !drift.refused && drift.runs && drift.runs.drift) {
    return 'Publish period-by-period CHANGES rather than levels, or hold this total. The series clusters above and below its median, so each reprint of the level hands over the trend as well as the level.';
  }
  const growth = exposures.find((row) => row.key === 'growth');
  if (growth) {
    return 'Publish a period-by-period change where the change itself is not small, or hold the level. A suppression pattern cannot fix a stock reprinted at two dates.';
  }
  const pairwise = exposures.find((row) => row.key === 'pairwise-total');
  if (pairwise) {
    return 'Freeze one suppression pattern for this module and keep it for the whole series, or publish the change instead of the level.';
  }
  const crossModule = exposures.find((row) => row.key === 'cross-module');
  if (crossModule) {
    return 'Treat the register as one publication surface: audit the day across modules, not each module alone, and withhold a complementary cell in the partner module.';
  }
  return 'Hold the total, or publish the change rather than the level. No further small-cell hiding can make a reprinted stock safe.';
}

/**
 * Drift reading over the module's own published totals. This is the diagnosis that
 * turns "your aggregate is unsafe" into "your publication RHYTHM is unsafe".
 */
export function driftReading(rows, { conventions = {} } = {}) {
  const list = (Array.isArray(rows) ? rows : [])
    .filter((row) => row && row.releasedOn)
    .sort((a, b) => String(a.releasedOn).localeCompare(String(b.releasedOn)));
  const points = [];
  for (const row of list) {
    const total = (row.totals || []).find((entry) => entry && entry.measure === 'count' && entry.printed === true);
    if (!total || !Number.isFinite(Number(total.value))) continue;
    points.push({ on: String(row.releasedOn).slice(0, 10), value: Number(total.value) });
  }
  const minPoints = conventions.differencesMinPoints || 8;
  if (points.length < minPoints) {
    return {
      points: points.length,
      minPoints,
      refused: true,
      reason: `A drift diagnosis needs at least ${minPoints} published totals; this module has ${points.length}. Counting a trend from fewer points would be a figure resting on nothing.`,
      values: points,
      runs: null,
      range: null,
      direction: null,
    };
  }
  const values = points.map((point) => point.value);
  const runs = runsTest(values);
  const range = buishandRange(values);
  const first = values[0];
  const last = values[values.length - 1];
  const direction = last === first ? 'flat' : (last > first ? 'rising' : 'falling');
  return {
    points: points.length,
    minPoints,
    refused: false,
    values: points,
    runs,
    range,
    direction,
    delta: last - first,
    reason: runs.drift || range.shift
      ? 'The published totals are not a stationary series: reprinting them over time discloses the movement between dates, whatever the cells say.'
      : 'The published totals cross their median about as often as chance would produce and show no level shift; the series itself is not the leak.',
  };
}

/**
 * The console's read model: the register as it stands, what it determines, the
 * coverage rate with an interval, and the altitude playbook.
 */
export function buildDifferencesReport(state = {}, { now = new Date(), settings = null, seatId = null } = {}) {
  const conventions = differencesConventions(settings || state?.settings || {});
  const built = buildSeats(state, { now, settings: settings || state?.settings || {} });
  const seat = seatId ? resolveSeat(built, seatId) : activeSeat(built);
  const register = Array.isArray(state.differenceReleases) ? state.differenceReleases : [];

  // A declared seat reads ITS OWN publications only. A peer's release is not this
  // span's business, and the register is published material — not a ledger the
  // whole house may read at the top.
  const scope = seat && !seat.fullAccess && seat.scope instanceof Set ? seat.scope : null;
  const visible = register.filter((row) => {
    if (!row) return false;
    if (!scope || seat?.fullAccess) return true;
    if (row.scopeSeatId === seat.id) return true;
    // A release whose geometry is entirely inside this seat's span is this seat's.
    const cells = Array.isArray(row.cells) ? row.cells : [];
    return cells.length > 0 && cells.every((cell) => scope.has(cell.cellKey));
  });

  const byRoute = new Map();
  for (const row of visible) {
    if (!byRoute.has(row.route)) byRoute.set(row.route, []);
    byRoute.get(row.route).push(row);
  }

  const routes = [];
  for (const [route, rows] of [...byRoute.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const manifest = manifestFor(route);
    const recent = rows.slice(0, conventions.differencesWindowReleases);
    const audit = auditSequence({ releases: recent, floor: conventions.differencesCellFloor });
    const ordered = [...rows].sort((a, b) => String(a.releasedOn).localeCompare(String(b.releasedOn)));
    routes.push({
      route,
      label: manifest?.label || route,
      releases: rows.length,
      window: recent.length,
      safeN: rows.filter((row) => row.verdict === DIFFERENCING_VERDICTS.SAFE).length,
      protectedN: rows.filter((row) => row.verdict === DIFFERENCING_VERDICTS.PROTECTED).length,
      recoveredN: audit.recoveredN,
      recovered: audit.recovered.slice(0, 12).map((row) => ({
        cellKey: row.cellKey,
        measure: row.measure,
        measureLabel: DIFFERENCING_MEASURE_LABELS[row.measure] || row.measure,
        // The value is deliberately NOT carried into the read model. A screen that
        // printed it would become the disclosure it is warning about.
        sources: row.sourceN,
        // Same-day subtraction is exact; a cross-day finding rests on continuity
        // and the screen says which it is rather than blending the two.
        basis: row.basis || 'same-day-arithmetic',
      })),
      withheldN: audit.withheldN,
      equationN: audit.equationN,
      inconsistentN: audit.inconsistentN,
      determinacy: determinacyLine(audit),
      drift: driftReading(ordered, { conventions }),
      lastReleasedOn: ordered.length ? String(ordered[ordered.length - 1].releasedOn).slice(0, 10) : null,
      nextLatest: ordered.length ? ordered[ordered.length - 1] : null,
      firstOn: ordered.length ? String(ordered[0].releasedOn).slice(0, 10) : null,
    });
  }

  const releasesN = visible.length;
  const safeN = visible.filter((row) => row.verdict === DIFFERENCING_VERDICTS.SAFE).length;
  const protectedN = visible.filter((row) => row.verdict === DIFFERENCING_VERDICTS.PROTECTED).length;
  const determinedRoutes = routes.filter((row) => row.recoveredN > 0);
  /**
   * A share of safe publications needs BOTH enough registered releases and enough
   * of them carrying a printed total. A day whose table published no total makes
   * no equation, so it cannot leake by subtraction and cannot be evidence of
   * safety either; counting it would flatter the rate with pages that say nothing.
   */
  const releasesWithTotal = visible.filter((row) => (row.totals || []).some((total) => total && total.printed === true)).length;
  const coverageFloor = Math.max(conventions.differencesMinPoints, 5);
  const refusedFloor = releasesWithTotal < coverageFloor;
  const interval = wilsonInterval(safeN + protectedN, releasesN);

  // Cross-altitude pairs: two releases of the SAME module on the SAME day from
  // different seats. This is the expose that needs no repeat in time at all.
  const crossAltitude = [];
  const byDayRoute = new Map();
  for (const row of visible) {
    const key = `${row.route}|${String(row.releasedOn).slice(0, 10)}`;
    if (!byDayRoute.has(key)) byDayRoute.set(key, []);
    byDayRoute.get(key).push(row);
  }
  for (const [key, rows] of byDayRoute.entries()) {
    if (rows.length < 2) continue;
    const seats = new Set(rows.map((row) => row.scopeSeatId || 'operator'));
    if (seats.size < 2) continue;
    const [route, day] = key.split('|');
    const audit = auditSequence({ releases: rows, floor: conventions.differencesCellFloor });
    crossAltitude.push({
      route,
      label: manifestFor(route)?.label || route,
      day,
      seats: seats.size,
      recoveredN: audit.recoveredN,
      recovered: audit.recovered.slice(0, 8).map((row) => ({ cellKey: row.cellKey, measure: row.measure, basis: row.basis || 'same-day-arithmetic' })),
      determinacy: determinacyLine(audit),
    });
  }

  const openDecisions = (Array.isArray(state.decisions) ? state.decisions : []).filter((row) => row
    && row.status !== 'closed'
    && typeof row.title === 'string'
    && row.title.startsWith('[RULE-DFR'));

  const playbook = DIFFERENCING_PLAYBOOK[seat?.altitudeKey] || DIFFERENCING_PLAYBOOK.manager;

  return {
    ok: true,
    today: dayKey(now),
    engineVersion: DIFFERENCING_ENGINE_VERSION,
    seat: seat ? publicSeat(seat) : null,
    playbook,
    premise: DIFFERENCING_PREMISE,
    disclosure: DIFFERENCING_DISCLOSURE,
    conventions,
    routes,
    crossAltitude,
    releases: visible.slice(0, DIFFERENCING_LIMITS.releases).map((row) => ({
      id: row.id,
      route: row.route,
      label: manifestFor(row.route)?.label || row.route,
      releasedOn: String(row.releasedOn).slice(0, 10),
      altitudeKey: row.altitudeKey,
      rank: row.rank,
      verdict: row.verdict,
      verdictLabel: DIFFERENCING_VERDICT_META[row.verdict]?.label || row.verdict,
      tone: DIFFERENCING_VERDICT_META[row.verdict]?.tone || 'neutral',
      cellsN: Array.isArray(row.cells) ? row.cells.length : 0,
      withheldN: Array.isArray(row.cells) ? row.cells.filter((cell) => cell.state !== 'printed').length : 0,
      withheldTotals: row.protection?.withheldTotals || [],
      recoveredN: row.recoveredN || 0,
      equationN: row.equationN || 0,
    })),
    summary: {
      releasesN,
      routesN: routes.length,
      safeN,
      protectedN,
      determinedRoutesN: determinedRoutes.length,
      crossAltitudeN: crossAltitude.filter((row) => row.recoveredN > 0).length,
      decisionsN: openDecisions.length,
    },
    coverage: {
      releasesN,
      n: releasesN,
      k: safeN + protectedN,
      safeN,
      protectedN,
      // Refusal-honest: a withheld rate carries NO percentage. Printing 100% beside
      // the word "withheld" is the exact flattery the floor exists to prevent.
      pct: refusedFloor ? null : interval.pct,
      lowPct: refusedFloor ? null : interval.lowPct,
      highPct: refusedFloor ? null : interval.highPct,
      refused: refusedFloor,
      refusedReason: refusedFloor
        ? `A share of safe publications needs at least ${coverageFloor} releases that actually published a total; this workspace has ${releasesWithTotal} of ${releasesN} registered.`
        : '',
      floor: coverageFloor,
      releasesWithTotal,
    },
    openDecisions: openDecisions.slice(0, 20).map((row) => ({
      id: row.id,
      title: String(row.title || '').slice(0, 160),
      status: row.status,
      openedOn: row.openedOn || null,
      ownerId: row.ownerId || null,
    })),
  };
}

/** The analyst's reading as one paragraph: the proof, not an assurance. */
export function differencesBriefText(report) {
  if (!report || !report.ok) return typeof report?.error === 'string' ? report.error : 'No differencing reading is available.';
  const c = report.coverage;
  const coverageLine = c.refused
    ? `Provably safe publications: WITHHELD (${c.releasesN} release(s) below the floor of ${c.floor}). ${c.refusedReason}`.trim()
    : `Provably safe publications: ${c.k} of ${c.n} registered release(s) (${c.pct}%, Wilson 95% ${c.lowPct}–${c.highPct}%). ${c.safeN} needed no protection; ${c.protectedN} published a reduced version.`;
  const recovered = report.routes.filter((row) => row.recoveredN > 0);
  return [
    `Differencing Defender — ${report.today} — ${report.seat?.label || 'Operator view'}`,
    `Register: ${report.summary.releasesN} release(s) across ${report.summary.routesN} module(s), exact integer audit over every published total in the window.`,
    coverageLine,
    recovered.length
      ? `Determined by arithmetic: ${recovered.length} module(s) publish a surface from which a withheld value is exactly recoverable — ${recovered.map((row) => `${row.label} (${row.recoveredN})`).join(', ')}.`
      : 'No module publishes a surface from which a withheld value is exactly recoverable by subtraction.',
    report.crossAltitude.length
      ? `Same-day cross-altitude pairs: ${report.crossAltitude.length} (${report.summary.crossAltitudeN} with a proven recovery).`
      : 'No module was published twice on one day from different seats, so no cross-altitude exposure is open.',
    `Reading: ${report.premise}`,
    'This is exact integer determinacy over what this workspace published. It is not differential privacy, and it says nothing about data held outside the workspace.',
    'No person is named, rated or ranked. A finding is about a PUBLICATION, never about the people inside it.',
  ].join('\n');
}

/** Aggregate-only CSV rows: no span label, no person, no value of a withheld cell. */
export function differencesCsvRows(report) {
  if (!report || !report.ok) return [];
  const rows = [];
  for (const row of report.routes) {
    rows.push({
      row_kind: 'module',
      route: row.route,
      label: row.label,
      releases_n: row.releases,
      windowed_n: row.window,
      safe_n: row.safeN,
      protected_n: row.protectedN,
      recovered_n: row.recoveredN,
      withheld_n: row.withheldN,
      equation_n: row.equationN,
      inconsistent_n: row.inconsistentN,
      last_released_on: row.lastReleasedOn,
      // A refused drift test emits BLANK for every statistic, never a zero and
      // never a direction derived from too few points.
      drift_points: row.drift?.refused ? null : (row.drift?.points ?? null),
      drift_refused: row.drift?.refused === true,
      runs_p_value: row.drift?.refused ? null : (row.drift?.runs?.pValue ?? null),
      range_statistic: row.drift?.refused ? null : (row.drift?.range?.statistic ?? null),
      direction: row.drift?.refused ? null : (row.drift?.direction ?? null),
    });
  }
  rows.push({
    row_kind: 'workspace',
    route: '',
    label: 'Workspace',
    releases_n: report.summary.releasesN,
    windowed_n: report.summary.releasesN,
    safe_n: report.summary.safeN,
    protected_n: report.summary.protectedN,
    recovered_n: report.summary.determinedRoutesN,
    withheld_n: report.routes.reduce((sum, row) => sum + row.withheldN, 0),
    equation_n: report.routes.reduce((sum, row) => sum + row.equationN, 0),
    inconsistent_n: report.routes.reduce((sum, row) => sum + row.inconsistentN, 0),
    last_released_on: report.today,
    drift_points: null,
    drift_refused: report.coverage.refused,
    runs_p_value: null,
    range_statistic: null,
    direction: null,
  });
  return rows;
}

export function differencesCsvSummary(report) {
  return {
    releases: report?.summary?.releasesN || 0,
    modules: report?.summary?.routesN || 0,
    determined: report?.summary?.determinedRoutesN || 0,
  };
}

/** Attention: a module that publishes a determined surface, or a refused decision. */
export function differencesAttentionCount(state, { now = new Date(), settings = null } = {}) {
  const report = buildDifferencesReport(state, { now, settings });
  if (!report.ok) return 0;
  return Math.min(99, report.summary.determinedRoutesN + report.summary.crossAltitudeN + report.summary.decisionsN);
}

export { variableKey };
