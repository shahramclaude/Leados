/**
 * app/core/domain/boardSuppression.js — small-cell withholding for the Board
 * Room's span partition (Session 188, ADR-0139).
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * `boardEvaluateClaim` has applied a declared cell floor since ADR-0085: a claim
 * with fewer observations than the floor prints its counts and withholds its
 * rate. `boardPartition` — the roll-up that decomposes that claim over the
 * reporting tree — never applied it. It computed every span's rate from whatever
 * observations that span happened to hold and printed the percentage.
 *
 * That was not a cosmetic gap. Reproduced against the shipped code with the
 * default `boardCellFloor` of 5: a workspace claim carrying 6 observations,
 * partitioned over three spans, printed
 *
 *     Sam Director: 1 observation, 1 passing, 100% (interval 20.7–100)
 *
 * A span whose entire reading rests on a SINGLE assessed pair. One observation
 * inside one named director's span is not a rate; it is a statement about the
 * two people in that pair, dressed as a percentage. The claim-level floor
 * protects the enterprise figure and says nothing about the cell beneath it —
 * the exact defect ADR-0091 fixed one layer up in `moduleAggregate`.
 *
 * WHAT THIS MODULE IS
 * -------------------
 * The board partition's published surface, modelled exactly, and run through the
 * SAME decision procedure the rest of the app uses — `planAggregateSuppression`
 * and `determinacyLine` from `aggregateDeterminacy.js` (ADR-0091). No second
 * solver, no second policy, no heuristic of its own.
 *
 * The surface:
 *
 *   - a cell is `{ n, successes, failures = n − successes }`;
 *   - printing a cell prints its pass count AND its fail count (the rate is
 *     `successes / n`, so printing the rate prints the numerator);
 *   - the claim's own pass count is published at claim level by
 *     `boardEvaluateClaim`, the memo text and the CSV. It is therefore the
 *     PUBLISHED TOTAL of this table and cannot be un-published here.
 *
 * Because that total is already out, a single withheld cell would be determined
 * by subtraction — `hidden = total − Σ printed` — which is a disclosure with a
 * longer proof rather than a protection. So the planner runs the way ADR-0091
 * runs it: hide the sub-floor cells, then hide one more cell at a time
 * (cheapest first) until no withheld cell is pinned, and if the boxes themselves
 * saturate — every remaining value determined by the arithmetic — REFUSE to print
 * the decomposition at all. `refuse` is a real product outcome here, exactly as
 * it is in the differencing register: a partition that cannot be published
 * without handing back a single pair's result is not published.
 *
 * WHAT IS AND IS NOT PROTECTED — printed, because a limit that is not stated is
 * a claim
 * -------------------------------------------------------------------------
 *  - A withheld cell's OBSERVATION COUNT is still derivable: the claim's own
 *    denominator is published, and the printed cells' counts are printed. That
 *    is unavoidable without un-publishing the claim's evidence base, and it
 *    discloses nothing the withholding does not already announce — "this span
 *    holds fewer than N assessed pairs" is the withholding's own reason. What is
 *    protected is the RATING: which pairs passed.
 *  - Suppression is small-cell withholding, not differential privacy.
 *  - Two spans that each hold a legitimately publishable count are still
 *    protected from each other by the published total: the planner treats that
 *    total as fixed and hides a partner cell when it would otherwise pin one.
 */
import { determinacyLine, planAggregateSuppression } from './aggregateDeterminacy.js';

/** Why a cell was withheld, in words a chief can act on. */
const FLOOR_REASON = (n, floor) => `Only ${n} observation(s) in this span against a declared cell floor of ${floor}. A rate built on that few names the pairs it is built from, so the cell is withheld and the count is stated.`;
const COMPLEMENTARY_REASON = 'Withheld for complementary suppression: this claim’s own pass count is published at claim level, and printing this cell beside the others would let a reader subtract them from it and recover a withheld cell exactly.';
const SATURATED_REASON = (n) => `${n} observation(s) in this span, and the arithmetic over the claim’s published pass count pins every remaining cell. The decomposition is not printed.`;

/**
 * Apply the shared suppression policy to one claim's partition.
 *
 * `rows` are the pre-suppression cells (`{ key, label, altitudeKey, n, successes }`).
 * `claim` carries the published total this table must be read against.
 *
 * Returns rows for BOTH cases — a printed row keeps its figure, a withheld row
 * keeps its identity and loses its figure — plus the proof, so a renderer can
 * show the table it was allowed to show without deciding anything itself.
 */
export function suppressPartitionRows({ rows = [], claim = {}, floor = 5 } = {}) {
  // A declared floor of 1 is a deliberate decision to publish every cell, and it
  // is what `boardCellFloor` already means at claim level. The shared planner
  // clamps its own floor to a minimum of 2 (a count below 2 is a count of one),
  // so the "publish everything" setting is honoured HERE rather than silently
  // re-tightened into a suppression the operator did not ask for.
  const declaredFloor = Math.round(Number(floor));
  const publishAll = Number.isFinite(declaredFloor) && declaredFloor <= 1;
  const floorN = publishAll ? 1 : (Number.isFinite(declaredFloor) && declaredFloor > 1 ? declaredFloor : 2);
  const list = (Array.isArray(rows) ? rows : []).map((row) => {
    const n = Math.max(0, Math.round(Number(row.n) || 0));
    const successes = Math.min(n, Math.max(0, Math.round(Number(row.successes) || 0)));
    return { ...row, n, successes, failures: n - successes };
  });
  const totalN = list.reduce((sum, row) => sum + row.n, 0);
  const totalOk = list.reduce((sum, row) => sum + row.successes, 0);

  // The published total is the CLAIM's pass count when the caller has one, so
  // the audit reasons about the surface a reader actually holds rather than the
  // sum this table happens to produce. When the claim publishes no figure at all
  // (the claim itself was withheld or refused) there is no total to subtract
  // from and nothing can be pinned — the planner is told exactly that.
  const publishedTotal = Number.isFinite(Number(claim.successes)) ? Math.max(0, Math.round(Number(claim.successes))) : null;
  const publishedN = Number.isFinite(Number(claim.n)) ? Math.max(0, Math.round(Number(claim.n))) : null;

  const cells = list.map((row) => ({ key: row.key, count: row.n, open: row.successes, overdue: row.failures }));
  // `count` is deliberately NOT offered as a published measure: a cell's size is
  // withheld WITH the cell, so it never enters an equation. `open` (passing) and
  // `overdue` (failing) are the two halves of the rate, and both are published
  // at claim level, so both are the totals this planner must defend.
  const totals = publishedTotal === null
    ? {}
    : { open: publishedTotal, overdue: Math.max(0, (publishedN ?? totalN) - publishedTotal) };

  // `publishAll` short-circuits without inventing a plan: there is no withheld
  // cell to defend, so the determinacy statement is the truthful "nothing here is
  // recoverable because nothing is withheld" rather than a plan the operator
  // never asked for.
  const plan = publishAll
    ? { suppress: [], mandatory: [], added: [], withholdTotals: [], verdict: 'safe', recoverableN: 0, checkedMeasures: [], informationLossPct: 0, notes: [] }
    : planAggregateSuppression({ cells, totals, floor: floorN });
  const withheldSet = new Set(plan.suppress);
  const mandatorySet = new Set(plan.mandatory);

  // Every half of the rate withheld, or every cell withheld with a total that
  // still pins one: no pattern protects the cells, so the table is refused.
  const totalsWithheld = plan.withholdTotals.length > 0;
  const refused = plan.verdict === 'refused' || (withheldSet.size === list.length && totalsWithheld);
  const nothingToProtect = withheldSet.size === 0;

  const visibleRows = list.map((row) => {
    const withhold = withheldSet.has(row.key) || refused;
    const mandatory = mandatorySet.has(row.key);
    const reason = !withhold
      ? null
      : refused && !mandatory && withheldSet.size === list.length
        ? SATURATED_REASON(row.n)
        : mandatory
          ? FLOOR_REASON(row.n, floorN)
          : COMPLEMENTARY_REASON;
    return {
      key: row.key,
      label: row.label,
      altitudeKey: row.altitudeKey ?? null,
      n: row.n,
      successes: row.successes,
      withhold,
      why: !withhold ? null : mandatory ? 'floor' : 'complementary',
      reason,
    };
  });

  const printedRows = visibleRows.filter((row) => !row.withhold);
  const withheldRows = visibleRows.filter((row) => row.withhold);
  const printTotal = plan.withholdTotals.includes('open') || plan.withholdTotals.includes('overdue');

  const notes = [...plan.notes];
  if (withheldRows.length && !refused) {
    notes.push(`${withheldRows.length} of ${list.length} cell(s) are withheld below or beside the ${floorN}-observation floor; the withheld observation count stays derivable from the claim's published denominator, which is why the RATE is what is protected here.`);
  }
  if (refused) {
    notes.push(`No suppression pattern over this partition protects its cells while the claim's own pass count is published, so the decomposition is refused rather than printed. The claim-level verdict above is unaffected: it is decided on the claim's own denominator, before any decomposition.`);
  }

  return {
    rows: visibleRows,
    printedRows,
    withheldRows,
    refused,
    nothingToProtect,
    // Repeated so a caller never has to recompute what the planner decided.
    printTotals: !refused && !printTotal,
    plan,
    verdict: plan.verdict,
    recoverableN: plan.recoverableN,
    checkedMeasures: plan.checkedMeasures,
    informationLossPct: plan.informationLossPct,
    withheldN: withheldRows.length,
    floor: floorN,
    // The INTEGRITY check survives suppression: every cell, printed or withheld,
    // still accounts for its observations exactly. This is what makes the panel
    // worth reading — the parts are still checked, they are just not all shown.
    accounting: {
      claimN: publishedN,
      claimSuccesses: publishedTotal,
      cellN: totalN,
      cellSuccesses: totalOk,
      reconciles: publishedN === null ? null : totalN === publishedN,
    },
    determinacy: nothingToProtect
      ? 'Nothing in this table is withheld, so there is nothing to recover.'
      : determinacyLine(plan),
    notes,
  };
}
