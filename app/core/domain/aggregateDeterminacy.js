/**
 * app/core/domain/aggregateDeterminacy.js — exact recoverability of a withheld
 * aggregate cell (ADR-0091).
 *
 * WHAT PROBLEM THIS SOLVES
 * ------------------------
 * `moduleAggregate` printed an additive total (records, open, overdue) and
 * withheld the child spans too small to print. Complementary suppression hid
 * **one** further cell — but only when at least two cells survived the floor.
 * That guard had a hole and it was not theoretical. With one sub-floor cell and
 * one printed cell, no complementary suppression ran at all, and the published
 * total handed the withheld figure back on a plate:
 *
 *     span total 7 − printed cell 6 = the withheld cell (1)
 *     severity 57 − printed 48      = the withheld cell's 9
 *
 * A withheld count of one, next to a severity of nine, names the one person in
 * that span. The number was never published; it was *determined*, which is the
 * same disclosure with a longer proof.
 *
 * WHAT THIS DOES
 * --------------
 * It replaces the heuristic with a decision procedure. The published surface is
 * modelled exactly as a reader sees it:
 *
 *   - every printed cell contributes its value to each published total;
 *   - every withheld cell contributes an unknown integer, bounded by what the
 *     withholding itself reveals (a sub-floor cell has count < floor, and
 *     open ≤ overdue-free count because an open record is a record);
 *   - each published total is one linear equation over those unknowns.
 *
 * A withheld value is RECOVERABLE when that system admits exactly one integer
 * value for it. Because each total is a single equation over a disjoint set of
 * unknowns with independent integer boxes, recoverability has a closed form and
 * needs no floating point, no solver and no approximation:
 *
 *     lo_min = max(lo, S − Σ(hi of the others))
 *     hi_max = min(hi, S − Σ(lo of the others))
 *     recoverable ⇔ lo_min == hi_max  (and that value is > 0)
 *
 * This is exact integer reasoning, not a heuristic. It catches the two cases a
 * hand-written rule misses:
 *
 *   1. the singleton (one withheld cell, any published total) — the original
 *      hole, including the case where the partner was never added;
 *   2. box saturation (three cells withheld at 4, 4, 4 against a floor of 5 and a
 *      published total of 12 ⇒ every one of them is exactly 4) — no amount of
 *      "hide one extra large cell" protects a table whose withheld set is already
 *      pinned by the box bounds.
 *
 * `planAggregateSuppression` then buys safety at the lowest information cost.
 * It hides the smallest surviving cell first (standard complementary
 * suppression), because that is the cell whose printing costs the reader least,
 * and it keeps the published total — the number a leader actually asked for.
 * Only when there is nothing printable left to hide, i.e. when the boxes already
 * pin a value (the 4/4/4 saturation above), does no partner help: then the TOTAL
 * is withheld, because a withheld total cannot be subtracted from anything.
 * Nothing here de-anonymises; the worst case is that an executive reads fewer
 * figures, and one more reason explaining exactly which.
 *
 * WHAT IS DELIBERATELY OUT OF SCOPE
 * ---------------------------------
 * Only ADDITIVE published figures are modelled. An extremum (`oldestDays` is a
 * MAX) can reveal that *some* withheld span holds the oldest record — a dated
 * attribute, not a cell value — and is documented as a limit rather than
 * silently treated as safe. Money is additive but per-cell money is never
 * printed, so no currency total can be differenced; the model still accepts a
 * money measure if a future surface starts printing it.
 *
 * Pure module: no storage, no clock, no DOM, no floating point in the decision.
 */

/** Measures whose per-cell value is printed and whose total is published. */
export const AGGREGATE_MEASURES = Object.freeze(['count', 'open', 'overdue']);

export const DETERMINACY_VERDICTS = Object.freeze({
  SAFE: 'safe',
  COMPLEMENTED: 'complemented',
  TOTALS_WITHHELD: 'totals-withheld',
  REFUSED: 'refused',
});

const MEASURE_LABELS = Object.freeze({
  count: 'record count',
  open: 'open load',
  overdue: 'overdue load',
});

const pct1 = (value) => Math.round(value * 1000) / 10;
const cellKey = (cell) => String(cell?.key ?? cell?.nodeId ?? '');

/**
 * The integer box a withheld cell's value must live in.
 *
 * `why` is 'floor' for a cell withheld because it is below the small-cell floor,
 * and 'complementary' for a cell withheld to protect another. The box is derived
 * only from what the withholding itself tells a reader — never from the value.
 */
export function boundsFor(cell, measure, floor) {
  const why = cell?.why === 'complementary' ? 'complementary' : 'floor';
  const floorN = Number.isFinite(floor) && floor > 1 ? Math.round(floor) : 2;
  if (measure === 'count') {
    return why === 'floor'
      ? { lo: 0, hi: floorN - 1, why }
      : { lo: floorN, hi: Infinity, why };
  }
  // open ≤ count and overdue ≤ count: an open or overdue record is a record.
  // A sub-floor cell therefore bounds its own derived measures too.
  return { lo: 0, hi: why === 'floor' ? floorN - 1 : Infinity, why };
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Recoverability inside ONE published total.
 *
 * `members` are the withheld cells of that measure, each already boxed. Returns
 * the tightest feasible interval per member and whether it collapsed to a single
 * point. An inconsistent total (a value outside the box sum) is reported rather
 * than resolved: the caller withholds instead of guessing which end is wrong.
 */
export function groupDeterminacy({ totalValue, members }) {
  const total = Number(totalValue);
  if (!Number.isFinite(total) || !Array.isArray(members) || !members.length) {
    return { consistent: true, resolved: [], recoverable: [] };
  }
  const loSum = sum(members.map((m) => m.lo));
  const hiSum = members.some((m) => m.hi === Infinity) ? Infinity : sum(members.map((m) => m.hi));
  if (total < loSum || total > hiSum) {
    return { consistent: false, reason: 'published-total-outside-box', resolved: [], recoverable: [] };
  }
  const resolved = [];
  for (const member of members) {
    const others = members.filter((other) => other !== member);
    const othersLo = sum(others.map((other) => other.lo));
    const othersHi = others.some((other) => other.hi === Infinity)
      ? Infinity
      : sum(others.map((other) => other.hi));
    const lo = Math.max(member.lo, total - othersHi);
    const hi = Math.min(member.hi, total - othersLo);
    // A zero is not a disclosure: nothing about a person, a case or a span is
    // learned from "there were none". Only a positive pinned value is counted.
    const recoverable = member.withheld === true
      && Number.isFinite(lo) && Number.isFinite(hi) && lo === hi && lo > 0;
    resolved.push({ key: member.key, measure: member.measure, withheld: member.withheld === true, lo, hi: Number.isFinite(hi) ? hi : null, recoverable, value: recoverable ? lo : null });
  }
  return { consistent: true, resolved, recoverable: resolved.filter((row) => row.recoverable) };
}

function membersFor(cells, withheld, measure, floor) {
  // EVERY cell participates. A printed cell is a known constant in the equation
  // (lo = hi = its printed value); a withheld cell is a boxed unknown. Modelling
  // only the unknowns would silently divide the published total by the wrong
  // membership and either miss a leak or invent one.
  const out = [];
  for (const cell of cells) {
    const key = cellKey(cell);
    if (withheld.has(key)) {
      out.push({ key, measure, withheld: true, ...boundsFor(cell, measure, floor) });
    } else {
      const value = Math.max(0, Number(cell?.[measure]) || 0);
      out.push({ key, measure, withheld: false, lo: value, hi: value, why: 'published' });
    }
  }
  return out;
}

/**
 * Audit a GIVEN suppression pattern against a published surface. This is the
 * independent check: `planAggregateSuppression` decides, this proves.
 */
export function auditAggregateSuppression({ cells = [], totals = {}, withheld = [], floor = 5, measures = AGGREGATE_MEASURES }) {
  const withheldSet = new Set((Array.isArray(withheld) ? withheld : [...withheld]).map(String));
  const recoverable = [];
  const inconsistent = [];
  const checked = [];
  for (const measure of measures) {
    const totalValue = totals?.[measure];
    if (totalValue === null || totalValue === undefined) continue;
    if (!withheldSet.size) continue;
    checked.push(measure);
    const result = groupDeterminacy({ totalValue, members: membersFor(cells, withheldSet, measure, floor) });
    if (!result.consistent) inconsistent.push({ measure, reason: result.reason });
    recoverable.push(...result.recoverable);
  }
  return {
    recoverable,
    recoverableN: recoverable.length,
    inconsistent,
    checkedMeasures: checked,
    safe: recoverable.length === 0 && inconsistent.length === 0,
  };
}

function informationLoss(cells, suppressed) {
  const total = cells.reduce((sumCount, cell) => sumCount + Math.max(0, Number(cell.count) || 0), 0);
  const hidden = cells
    .filter((cell) => suppressed.has(cellKey(cell)))
    .reduce((sumCount, cell) => sumCount + Math.max(0, Number(cell.count) || 0), 0);
  return { hidden, total, pct: total > 0 ? pct1(hidden / total) : 0 };
}

function publishableMeasures(totals, floor) {
  const set = new Set();
  for (const measure of AGGREGATE_MEASURES) {
    const value = Number(totals?.[measure]);
    if (!Number.isFinite(value)) continue;
    // The record-count total is withheld by the caller when it is itself below
    // the floor, so it is not part of the published surface in that case. The
    // derived loads are printed whatever their size: printing "0 open" tells a
    // reader nothing about a person, and the audit re-checks it anyway.
    if (measure === 'count' && value < floor) continue;
    set.add(measure);
  }
  return set;
}

/**
 * Choose the cheapest suppression pattern that leaves no withheld cell
 * recoverable from a published total.
 *
 * Returns the full decision, including the measures it decided NOT to publish,
 * so the caller can withhold those totals and say why.
 */
export function planAggregateSuppression({ cells = [], totals = {}, floor = 5 } = {}) {
  const list = (Array.isArray(cells) ? cells : []).map((cell) => ({
    key: cellKey(cell),
    count: Math.max(0, Number(cell.count) || 0),
    open: Math.max(0, Number(cell.open) || 0),
    overdue: Math.max(0, Number(cell.overdue) || 0),
  }));
  const floorN = Number.isFinite(floor) && floor > 1 ? Math.round(floor) : 2;
  const suppressed = new Set();
  const mandatory = new Set();
  for (const cell of list) {
    if (cell.count > 0 && cell.count < floorN) {
      mandatory.add(cell.key);
      suppressed.add(cell.key);
    }
  }

  const published = publishableMeasures(totals, floorN);
  const withheldMeasures = new Set();
  const notes = [];
  let addedBy = new Map();

  // Adding a cell or withholding a total both shrink the published surface, so
  // this terminates after at most (cells + measures) passes.
  for (let pass = 0; pass < list.length + AGGREGATE_MEASURES.length + 2; pass += 1) {
    const live = [...published].filter((measure) => !withheldMeasures.has(measure));
    if (!live.length || !suppressed.size) break;
    const audit = auditAggregateSuppression({
      cells: list.map((cell) => ({ ...cell, why: mandatory.has(cell.key) ? 'floor' : 'complementary' })),
      totals,
      withheld: [...suppressed],
      floor: floorN,
      measures: live,
    });
    if (audit.inconsistent.length) {
      for (const entry of audit.inconsistent) withheldMeasures.add(entry.measure);
      notes.push(`A published ${MEASURE_LABELS[audit.inconsistent[0].measure] || audit.inconsistent[0].measure} total does not agree with the cells under it; it is withheld rather than resolved by guessing.`);
      continue;
    }
    if (!audit.recoverable.length) break;

    // Cheapest cell to hide next: the smallest surviving count, then a stable id
    // order so the same workspace always produces the same table.
    const printable = list
      .filter((cell) => !suppressed.has(cell.key))
      .sort((a, b) => a.count - b.count || a.key.localeCompare(b.key));
    const candidate = printable[0] || null;

    if (!candidate) {
      const measures = [...new Set(audit.recoverable.map((row) => row.measure))];
      for (const measure of measures) withheldMeasures.add(measure);
      const labels = measures.map((measure) => MEASURE_LABELS[measure] || measure);
      notes.push(`Every cell in this table is already withheld, and the published ${labels.join(' and ')} ${labels.length > 1 ? 'totals still pin' : 'total still pins'} a withheld value exactly. ${labels.length > 1 ? 'They are' : 'It is'} withheld: a withheld total cannot be differenced.`);
      continue;
    }
    suppressed.add(candidate.key);
    addedBy.set(candidate.key, audit.recoverable.map((row) => row.measure));
  }

  const zeroRecoverable = auditAggregateSuppression({
    cells: list.map((cell) => ({ ...cell, why: mandatory.has(cell.key) ? 'floor' : 'complementary' })),
    totals,
    withheld: [...suppressed],
    floor: floorN,
    measures: [...published].filter((measure) => !withheldMeasures.has(measure)),
  });

  const loss = informationLoss(list, suppressed);
  const added = [...suppressed].filter((key) => !mandatory.has(key));
  let verdict;
  if (!suppressed.size) verdict = DETERMINACY_VERDICTS.SAFE;
  else if (withheldMeasures.size) verdict = [...published].filter((m) => !withheldMeasures.has(m)).length
    ? DETERMINACY_VERDICTS.TOTALS_WITHHELD
    : DETERMINACY_VERDICTS.REFUSED;
  else if (added.length) verdict = DETERMINACY_VERDICTS.COMPLEMENTED;
  else verdict = DETERMINACY_VERDICTS.SAFE;

  return {
    suppress: [...suppressed],
    mandatory: [...mandatory],
    added,
    addedFor: added.map((key) => ({ key, measures: addedBy.get(key) || [] })),
    withholdTotals: [...withheldMeasures],
    verdict,
    recoverableN: zeroRecoverable.recoverableN,
    recoverable: zeroRecoverable.recoverable,
    checkedMeasures: zeroRecoverable.checkedMeasures,
    informationLossPct: loss.pct,
    hiddenCount: loss.hidden,
    totalCount: loss.total,
    notes,
  };
}

/** A one-line, value-free statement a screen can print as evidence. */
export function determinacyLine(plan) {
  if (!plan || !plan.suppress.length) {
    return 'Nothing in this table is withheld, so there is nothing to recover.';
  }
  const measures = plan.checkedMeasures.length
    ? plan.checkedMeasures.map((measure) => MEASURE_LABELS[measure] || measure).join(', ')
    : 'no total';
  return `Determinacy: exact integer check over ${measures} — ${plan.recoverableN === 0 ? 'no withheld cell is recoverable by subtraction' : `${plan.recoverableN} withheld cell(s) still recoverable`}.`;
}
