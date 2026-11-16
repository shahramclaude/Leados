/**
 * app/core/domain/ibpActions.js — the seat-checked commands of the Integrated
 * Business Plan / S&OP Cycle Register (ADR-0231).
 *
 * SEVEN human acts and a scan, and nothing else: DECLARE a cycle, WITHDRAW it,
 * RECORD the demand plan, RECORD demonstrated capacity, FRAME a costed option,
 * APPROVE the plan at the executive review, and GRADE the demand plan against
 * what actually sold. Every gap, residual, verdict and count is re-derived on
 * read by `ibp.js`; nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - Plan units are whole units. A fractional unit is refused rather than
 *    rounded, because a rounded plan is a different plan and its residual is a
 *    different residual.
 *  - A `demonstrated` capacity claim must name a real observation window of at
 *    least 28 days. A shorter window is an impression, and recording it as
 *    evidence would let a plan be approved against a number nobody observed.
 *  - A `theoretical` capacity figure is accepted and stamped as an assertion:
 *    the cycle then reads `theoretical-capacity` and the plan cannot be
 *    presented as evidence-based. The register does not refuse the figure — it
 *    refuses to believe it.
 *  - Demand, baseline and target are three separate figures. The consensus is
 *    recorded on its own and is never copied from the target.
 *  - An option must move one side of the equation by at least one whole unit and
 *    carry a whole-cent cost. A lever with no price is a preference, not a
 *    trade-off, and is refused.
 *  - One option per (cycle, lever, month). A second row for the same lever would
 *    count its cost and its effect twice.
 *  - The seat that FRAMED the options does not APPROVE the plan. The party that
 *    built the trade-off has an interest in the answer.
 *  - Only VP-and-above approves, because the executive step commits resources.
 *    The register never promotes a director into an executive decision.
 *  - A cycle is approved ONCE. A revision is a new cycle, so the first decision
 *    stays on the record and cannot be retro-edited.
 *  - The demand plan is graded once per cycle-month, after the month, against the
 *    consensus that was frozen — never by rewriting the consensus afterwards.
 *  - Every write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused now.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct, canSee } from './seat.js';
import { LEADER_ID } from './chain.js';
import {
  buildIbp,
  ibpMatrix,
  resolveIbpAuthority,
} from './ibp.js';
import {
  ibpActorId,
  ibpDay,
  ibpDaysBetween,
  ibpId,
  ibpInt,
  ibpCurrency,
  ibpText,
  normalizeIbpCapacityRows,
  normalizeIbpCycles,
  normalizeIbpDecisions,
  normalizeIbpDemandRows,
  normalizeIbpGrades,
  normalizeIbpMarkers,
  normalizeIbpOptions,
  parseMoneyInputToCents,
  parsePlanUnitsInput,
  readCents,
  readNonNegUnits,
} from './ibpSchema.js';
import {
  IBP_CAPACITY_KIND_KEYS,
  IBP_EVENTS,
  IBP_LIMITS as L,
  IBP_OPTION_KIND_KEYS,
  IBP_REFUSALS,
  IBP_RIGHTS,
  ibpOptionKind,
} from './ibpRegistry.js';

const list = (value) => (Array.isArray(value) ? value : []);
const fail = (error, field = null, extra = {}) => ({ ok: false, error, field, ...extra });
const REFUSAL = (key) => ({ refusals: [key] });

export function createIbpActions(store, { now, idFactory } = {}) {
  const clock = typeof now === 'function' ? now : (() => new Date());
  const id = typeof idFactory === 'function' ? idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);

  const buildSeat = () => buildSeats(store.state, { now: clock(), settings: store.state.settings || null });

  function seatFor(right) {
    const at = clock();
    const seat = activeSeat(buildSeat());
    if (seat.readOnly) return fail(IBP_REFUSALS.notSeated);
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return {
      ok: true,
      seat,
      at,
      cfg: store.state.settings || {},
      actorId: seat.fullAccess ? LEADER_ID : (seat.id || null),
      today: dayKey(at),
    };
  }

  function readCheck() {
    const at = clock();
    const seat = activeSeat(buildSeat());
    if (seat.readOnly) return fail(IBP_REFUSALS.notSeated);
    // A read is safe-listed and so bypasses the gateway's rank check, which
    // means the right is re-proved HERE — otherwise a frontline lead could read
    // the enterprise's commercial plan through a gate that never saw it.
    const verdict = canAct(IBP_RIGHTS.READ, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg: store.state.settings || {} };
  }

  function graph() {
    try {
      const matrix = ibpMatrix(store.state, clock(), store.state.settings || {});
      if (matrix?.error) return fail(`${IBP_REFUSALS.graphUnreadable} (${matrix.error})`, null, REFUSAL('graph-unreadable'));
      return { ok: true, matrix };
    } catch (error) {
      return fail(`${IBP_REFUSALS.graphUnreadable} (${error?.message || 'unknown error'})`, null, REFUSAL('graph-unreadable'));
    }
  }

  /* ------------------------------------------------------------- the reads */

  function ibpReport() {
    const check = readCheck();
    if (!check.ok) return check;
    const report = buildIbp(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
    return { ok: true, report, seat: check.seat };
  }

  function ibpAttentionCount() {
    try {
      const seat = activeSeat(buildSeat());
      if (seat.readOnly) return { ok: true, count: 0 };
      if (!canAct(IBP_RIGHTS.READ, seat).allow) return { ok: true, count: 0 };
      const report = buildIbp(store.state, { now: clock(), settings: store.state.settings || {}, seat });
      return {
        ok: true,
        count: report.visibleRows.filter((row) => !row.withdrawn
          && (row.demandOwed || row.executiveOwed || row.reconcileOwed || row.supplyOwed || row.reviewOverdue)).length,
      };
    } catch {
      return { ok: true, count: 0 };
    }
  }

  /**
   * The cycles this seat can act on, with the seat the gap belongs to and the
   * lines behind it. Computed from the record, never chosen by the actor.
   */
  function ibpCandidates() {
    const check = readCheck();
    if (!check.ok) return check;
    const report = buildIbp(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
    if (report.matrixError) return fail(`${IBP_REFUSALS.graphUnreadable} (${report.matrixError})`, null, REFUSAL('graph-unreadable'));
    return {
      ok: true,
      candidates: report.visibleRows
        .filter((row) => !row.withdrawn)
        .map((row) => ({
          cycleId: row.id,
          title: row.title,
          currency: row.currency,
          horizonMonths: row.horizonMonths,
          state: row.state,
          verdict: row.verdict,
          demandLineId: row.demandLineId,
          supplyLineId: row.supplyLineId,
          gapUnits: row.totals.gapUnits,
          residualUnits: row.totals.residualUnits,
          authorityState: row.authority.state,
          decisionOwed: row.executiveOwed,
          reconcileOwed: row.reconcileOwed,
          supplyOwed: row.supplyOwed,
          unplannedMonths: row.unplannedMonths,
        })),
      report,
    };
  }

  /* ----------------------------------------------------------- write door */

  function cycleContext(check, cycleId) {
    const cid = ibpId(cycleId);
    if (!cid) return fail('Name the cycle this belongs to.', 'cycleId');
    const loaded = normalizeIbpCycles(rows('ibpCycles'), []);
    const cycleRow = loaded.find((row) => row.id === cid) || null;
    if (!cycleRow) return fail(IBP_REFUSALS.notFound, 'cycleId', REFUSAL('cycle-not-found'));
    if (cycleRow.withdrawnOn && cycleRow.withdrawnOn <= check.today) {
      return fail(IBP_REFUSALS.withdrawn, 'cycleId', REFUSAL('cycle-withdrawn'));
    }
    return { ok: true, cycleRow };
  }

  /** Does this seat hold either side of the cycle, or sit above both? */
  function holdsCycle(check, cycleRow, matrix) {
    if (check.seat.fullAccess) return true;
    const scope = check.seat.scope || new Set();
    const lineScope = check.seat.lineScope || new Set();
    if ([cycleRow.demandLineId, cycleRow.supplyLineId].some((lineId) => scope.has(lineId) || lineScope.has(lineId))) return true;
    if (cycleRow.ownerId && (scope.has(cycleRow.ownerId) || lineScope.has(cycleRow.ownerId))) return true;
    const node = matrix?.nodes?.get(check.actorId);
    if (!node) return false;
    return [cycleRow.demandLineId, cycleRow.supplyLineId].every((lineId) => node.descendants?.has?.(lineId) || lineId === check.actorId);
  }

  /** The seat above BOTH lines, re-proved from the live graph on every act. */
  function cycleAuthority(check, cycleRow, matrix) {
    const authority = resolveIbpAuthority(matrix, [cycleRow.demandLineId, cycleRow.supplyLineId], 4);
    return authority;
  }

  /** The seats that FRAMED this cycle's options — never the approver. */
  function framerIds(cycleId) {
    return new Set(normalizeIbpOptions(rows('ibpOptions'), normalizeIbpCycles(rows('ibpCycles'), []), [])
      .filter((option) => option.cycleId === cycleId)
      .map((option) => option.framedBy));
  }

  function reportRow(cycleId) {
    const report = buildIbp(store.state, { now: clock(), settings: store.state.settings || {}, seat: null });
    return report.rows.find((row) => row.id === cycleId) || null;
  }

  /* --------------------------------------------------------------- acts */

  return {
    ibpReport,
    ibpAttentionCount,
    ibpCandidates,

    /** DECLARE a cycle. Currency, horizon and both lines are frozen here. */
    ibpDeclareCycle(input = {}) {
      const check = seatFor(IBP_RIGHTS.DECLARE);
      if (!check.ok) return check;

      const title = ibpText(input.title, L.titleMax);
      if (title.length < L.titleMin) {
        return fail(`Name the plan in at least ${L.titleMin} characters — “FY27 consumer volumes” has to survive being read again in eighteen months.`, 'title');
      }
      const currency = ibpCurrency(input.currency);
      if (!currency) return fail('Choose the three-letter currency this plan is stated in. Nothing is converted; one plan is one currency.', 'currency', REFUSAL('currency-invalid'));
      const horizonMonths = ibpInt(input.horizonMonths, L.horizonMin, L.horizonMax);
      if (horizonMonths === null) {
        return fail(`The horizon must be whole months between ${L.horizonMin} and ${L.horizonMax}. Two plans over different horizons are not the same plan.`, 'horizonMonths', REFUSAL('horizon-invalid'));
      }
      const basis = ibpText(input.basis, L.reasonMax);
      if (basis.length < L.reasonMin) {
        return fail(`Write the basis for this cycle in at least ${L.reasonMin} characters. A plan with no written basis is a habit.`, 'basis', REFUSAL('basis-too-short'));
      }
      const ownerId = ibpId(input.ownerId) || check.actorId;
      if (!store.state.people?.some((person) => person && person.id === ownerId && person.status !== 'archived')) {
        return fail(IBP_REFUSALS.noDemandOwner, 'ownerId', REFUSAL('owner-off-roster'));
      }

      const g = graph();
      if (!g.ok) return g;

      // The two lines are the two lines the OWNER sits on when they are not
      // named. A cycle always has both sides; the register never accepts a plan
      // with a demand plan and no supply line to test it against.
      const ownerLines = [...new Set((g.matrix.linesByPerson?.get(ownerId) || [])
        .filter((line) => line && line.active !== false && line.managerId && g.matrix.nodes.has(line.managerId))
        .map((line) => line.managerId))].sort();
      const demandLineId = ibpId(input.demandLineId) || ownerLines[0] || null;
      const supplyLineId = ibpId(input.supplyLineId) || ownerLines[0] || null;
      if (!demandLineId || !g.matrix.nodes.has(demandLineId)) {
        return fail('The demand line must resolve to a real line on the reporting graph. A plan with no accountable line cannot be reconciled against anybody.', 'demandLineId', REFUSAL('no-line'));
      }
      if (!supplyLineId || !g.matrix.nodes.has(supplyLineId)) {
        return fail('The supply line must resolve to a real line on the reporting graph. A plan with no accountable line cannot be reconciled against anybody.', 'supplyLineId', REFUSAL('no-line'));
      }

      const reviewOn = input.reviewOn ? ibpDay(input.reviewOn) : null;
      if (input.reviewOn && !reviewOn) return fail(IBP_REFUSALS.dayInvalid, 'reviewOn', REFUSAL('day-invalid'));
      if (reviewOn && reviewOn <= check.today) {
        return fail('The review date must be in the future — a review already past is not a review.', 'reviewOn', REFUSAL('review-not-future'));
      }

      if (rows('ibpCycles').length >= L.cycles) {
        return fail(IBP_REFUSALS.ledgerFull, null, REFUSAL('ledger-full'));
      }
      const already = normalizeIbpCycles(rows('ibpCycles'), []).some((row) => row.title.toLowerCase() === title.toLowerCase()
        && !(row.withdrawnOn && row.withdrawnOn <= check.today));
      if (already) {
        return fail('A live cycle already carries that plan name. A revision is a new cycle only after the first is withdrawn — two live cycles for one plan would double-count its capacity.', 'title', REFUSAL('duplicate-title'));
      }

      const row = {
        id: id('ibp'),
        title,
        currency,
        horizonMonths,
        ownerId,
        demandLineId,
        supplyLineId,
        declaredOn: check.today,
        // Default review date is the cycle's own close: the last day of the
        // declared horizon is not a timeline, so the review is when the plan is
        // graded — one month after the horizon ends.
        reviewOn: reviewOn || ibpAddMonthsApprox(check.today, horizonMonths + 1),
        withdrawnOn: null,
        basis,
      };
      const kept = normalizeIbpCycles([...rows('ibpCycles'), row], []);
      const stored = kept.find((candidate) => candidate.id === row.id);
      if (!stored) return fail(IBP_REFUSALS.loaderRefused, null, REFUSAL('loader-refused'));
      // A write goes through `store.update`, which persists it, records the audit
      // trail entry and runs the post-commit rules INSIDE the same transaction.
      // Mutating `store.state` directly would bypass all three: the plan would be
      // approved on screen and gone after reload, which is the exact deviation
      // between displayed and stored that the reliability mandate forbids.
      store.update((draft) => {
        draft.ibpCycles = Array.isArray(draft.ibpCycles) ? draft.ibpCycles : [];
        draft.ibpCycles.push(stored);
      }, {
        type: IBP_EVENTS.CYCLE_DECLARED,
        entity: 'ibpCycle',
        entityId: stored.id,
        summary: `S&OP cycle opened for ${currency} over ${horizonMonths} month(s), demand line ${demandLineId}, supply line ${supplyLineId}.`.slice(0, 300),
      });
      return { ok: true, cycle: stored, events: [IBP_EVENTS.CYCLE_DECLARED] };
    },

    /** WITHDRAW a cycle. A withdrawal is final and never revives the row. */
    ibpWithdrawCycle(cycleId, reason) {
      const check = seatFor(IBP_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const ctx = cycleContext(check, cycleId);
      if (!ctx.ok) return ctx;
      if (ctx.cycleRow.withdrawnOn) return fail(IBP_REFUSALS.withdrawn, 'cycleId', REFUSAL('already-withdrawn'));
      const why = ibpText(reason, L.reasonMax);
      if (why.length < L.reasonMin) return fail(`Write why this cycle is being withdrawn, in at least ${L.reasonMin} characters.`, 'reason', REFUSAL('reason-too-short'));

      const g = graph();
      if (!g.ok) return g;
      if (!holdsCycle(check, ctx.cycleRow, g.matrix)) return fail(IBP_REFUSALS.wrongLine, 'cycleId', REFUSAL('not-your-line'));

      const next = rows('ibpCycles').map((row) => (row && row.id === ctx.cycleRow.id
        ? { ...row, withdrawnOn: check.today, basis: `${row.basis} — withdrawn ${check.today}: ${why}`.slice(0, L.reasonMax) }
        : row));
      const kept = normalizeIbpCycles(next, []);
      const stored = kept.find((row) => row.id === ctx.cycleRow.id);
      if (!stored) return fail(IBP_REFUSALS.loaderRefused, null, REFUSAL('loader-refused'));
      store.update((draft) => {
        draft.ibpCycles = (Array.isArray(draft.ibpCycles) ? draft.ibpCycles : [])
          .map((row) => (row && row.id === stored.id ? stored : row));
      }, {
        type: IBP_EVENTS.CYCLE_WITHDRAWN,
        entity: 'ibpCycle',
        entityId: stored.id,
        summary: `S&OP cycle withdrawn on ${check.today} before an approved plan. The row is retained; the cycle never reopens.`.slice(0, 300),
      });
      return { ok: true, cycle: stored, events: [IBP_EVENTS.CYCLE_WITHDRAWN] };
    },

    /**
     * RECORD the demand plan for one month: the statistical baseline, the
     * commercial target and the CONSENSUS. Three figures, recorded apart.
     */
    ibpRecordDemand(input = {}) {
      const check = seatFor(IBP_RIGHTS.RECORD);
      if (!check.ok) return check;
      const ctx = cycleContext(check, input.cycleId);
      if (!ctx.ok) return ctx;
      const cycleRow = ctx.cycleRow;

      const monthIndex = ibpInt(Number(input.monthIndex), L.monthMin, cycleRow.horizonMonths);
      if (monthIndex === null) return fail(IBP_REFUSALS.monthInvalid, 'monthIndex', REFUSAL('month-invalid'));

      const parseQty = (key) => parsePlanUnitsInput(input[key]);
      const baselineUnits = parseQty('baselineUnits');
      const targetUnits = parseQty('targetUnits');
      const consensusUnits = parseQty('consensusUnits');
      for (const [key, value] of [['baselineUnits', baselineUnits], ['targetUnits', targetUnits], ['consensusUnits', consensusUnits]]) {
        if (value === null) {
          const raw = String(input[key] ?? '').trim();
          return fail(/^\d+\.\d+$/.test(raw)
            ? `“${raw}” is a fractional unit. Plan units are whole units; a rounded unit is a different plan and its gap is a different gap.`
            : `“${raw || 'blank'}” is not a plan quantity. Record a whole number of units (no comma, sign or decimal point).`,
          key, REFUSAL('units-invalid'));
        }
      }

      const g = graph();
      if (!g.ok) return g;
      if (!holdsCycle(check, cycleRow, g.matrix)) return fail(IBP_REFUSALS.wrongLine, 'cycleId', REFUSAL('not-your-line'));

      const existing = normalizeIbpDemandRows(rows('ibpDemandRows'), normalizeIbpCycles(rows('ibpCycles'), []), []);
      if (existing.some((row) => row.cycleId === cycleRow.id && row.monthIndex === monthIndex)) {
        return fail(`Month ${monthIndex} already carries a demand row on this cycle. One row per cycle-month — a second row would count the same month twice. Record a revision as a new cycle.`, 'monthIndex', REFUSAL('duplicate-month'));
      }
      if (rows('ibpDemandRows').length >= L.demandRows) {
        return fail(IBP_REFUSALS.ledgerFull, null, REFUSAL('ledger-full'));
      }

      const row = {
        id: id('ibpd'),
        cycleId: cycleRow.id,
        monthIndex,
        baselineUnits,
        targetUnits,
        consensusUnits,
        recordedBy: check.actorId,
        recordedOn: check.today,
        note: ibpText(input.note, L.textMax),
      };
      const kept = normalizeIbpDemandRows([...rows('ibpDemandRows'), row], normalizeIbpCycles(rows('ibpCycles'), []), []);
      const stored = kept.find((candidate) => candidate.id === row.id);
      if (!stored) return fail(IBP_REFUSALS.loaderRefused, null, REFUSAL('loader-refused'));
      store.update((draft) => {
        draft.ibpDemandRows = Array.isArray(draft.ibpDemandRows) ? draft.ibpDemandRows : [];
        draft.ibpDemandRows.push(stored);
      }, {
        type: IBP_EVENTS.DEMAND_RECORDED,
        entity: 'ibpDemandRow',
        entityId: stored.id,
        summary: `Month ${monthIndex} demand recorded: baseline ${baselineUnits}, target ${targetUnits}, consensus ${consensusUnits} unit(s).`.slice(0, 300),
      });
      return { ok: true, demand: stored, events: [IBP_EVENTS.DEMAND_RECORDED] };
    },

    /**
     * RECORD capacity for one month, and say how it was obtained. A
     * `demonstrated` figure must carry a real window of at least 28 days; a
     * `theoretical` figure is accepted and stamped as an assertion.
     */
    ibpRecordCapacity(input = {}) {
      const check = seatFor(IBP_RIGHTS.RECORD);
      if (!check.ok) return check;
      const ctx = cycleContext(check, input.cycleId);
      if (!ctx.ok) return ctx;
      const cycleRow = ctx.cycleRow;

      const monthIndex = ibpInt(Number(input.monthIndex), L.monthMin, cycleRow.horizonMonths);
      if (monthIndex === null) return fail(IBP_REFUSALS.monthInvalid, 'monthIndex', REFUSAL('month-invalid'));

      const kind = IBP_CAPACITY_KIND_KEYS.includes(input.kind) ? input.kind : null;
      if (!kind) {
        return fail('Say how this capacity figure was obtained: demonstrated over a declared window, or theoretical. A figure whose provenance is unstated cannot be evidence.', 'kind', REFUSAL('capacity-kind-invalid'));
      }
      const units = parsePlanUnitsInput(input.units);
      if (units === null) {
        return fail(/^\d+\.\d+$/.test(String(input.units ?? '').trim())
          ? 'A fractional unit is refused. Capacity in whole units, or record the line that produced it.'
          : 'Record capacity as a whole number of units (no comma, sign or decimal point).', 'units', REFUSAL('units-invalid'));
      }

      let windowStartDay = null;
      let windowEndDay = null;
      if (kind === 'demonstrated') {
        windowStartDay = ibpDay(input.windowStartDay);
        windowEndDay = ibpDay(input.windowEndDay);
        if (!windowStartDay || !windowEndDay) {
          return fail('A demonstrated figure must name the observation window it was counted over (two real dates). A figure with no window is an impression.', 'windowStartDay', REFUSAL('window-missing'));
        }
        if (windowEndDay < windowStartDay) return fail('The observation window ends before it starts.', 'windowEndDay', REFUSAL('window-inverted'));
        const span = ibpDaysBetween(windowStartDay, windowEndDay);
        if (span === null || span < L.demonstratedWindowMinDays - 1) {
          return fail(`${IBP_REFUSALS.windowTooShort} The window named is ${Math.max(0, span ?? 0) + 1} day(s) inclusive.`, 'windowEndDay', REFUSAL('window-too-short'));
        }
      } else if (input.windowStartDay || input.windowEndDay) {
        // A theoretical figure may carry a window for context, but the window is
        // not what makes it evidence — recording one does not upgrade it.
        windowStartDay = input.windowStartDay ? ibpDay(input.windowStartDay) : null;
        windowEndDay = input.windowEndDay ? ibpDay(input.windowEndDay) : null;
        if ((input.windowStartDay && !windowStartDay) || (input.windowEndDay && !windowEndDay)) {
          return fail(IBP_REFUSALS.dayInvalid, 'windowStartDay', REFUSAL('day-invalid'));
        }
      }

      const g = graph();
      if (!g.ok) return g;
      if (!holdsCycle(check, cycleRow, g.matrix)) return fail(IBP_REFUSALS.wrongLine, 'cycleId', REFUSAL('not-your-line'));

      const existing = normalizeIbpCapacityRows(rows('ibpCapacityRows'), normalizeIbpCycles(rows('ibpCycles'), []), []);
      if (existing.some((row) => row.cycleId === cycleRow.id && row.monthIndex === monthIndex)) {
        return fail(`Month ${monthIndex} already carries a capacity row on this cycle. One row per cycle-month — a second row would let two figures for one line stand at once.`, 'monthIndex', REFUSAL('duplicate-month'));
      }
      if (rows('ibpCapacityRows').length >= L.capacityRows) {
        return fail(IBP_REFUSALS.ledgerFull, null, REFUSAL('ledger-full'));
      }

      const row = {
        id: id('ibpc'),
        cycleId: cycleRow.id,
        monthIndex,
        kind,
        units,
        windowStartDay,
        windowEndDay,
        recordedBy: check.actorId,
        recordedOn: check.today,
        note: ibpText(input.note, L.textMax),
      };
      const kept = normalizeIbpCapacityRows([...rows('ibpCapacityRows'), row], normalizeIbpCycles(rows('ibpCycles'), []), []);
      const stored = kept.find((candidate) => candidate.id === row.id);
      if (!stored) return fail(IBP_REFUSALS.loaderRefused, null, REFUSAL('loader-refused'));
      store.update((draft) => {
        draft.ibpCapacityRows = Array.isArray(draft.ibpCapacityRows) ? draft.ibpCapacityRows : [];
        draft.ibpCapacityRows.push(stored);
      }, {
        type: IBP_EVENTS.CAPACITY_RECORDED,
        entity: 'ibpCapacityRow',
        entityId: stored.id,
        summary: `Month ${monthIndex} capacity recorded as ${kind} at ${units} unit(s)${windowStartDay ? ` over ${windowStartDay}–${windowEndDay}` : ''}.`.slice(0, 300),
      });
      return { ok: true, capacity: stored, events: [IBP_EVENTS.CAPACITY_RECORDED] };
    },

    /**
     * FRAME a costed option against the gap in one month: a lever that moves
     * exactly one side by at least one whole unit, at an exact whole-cent cost.
     */
    ibpFrameOption(input = {}) {
      const check = seatFor(IBP_RIGHTS.FRAME);
      if (!check.ok) return check;
      const ctx = cycleContext(check, input.cycleId);
      if (!ctx.ok) return ctx;
      const cycleRow = ctx.cycleRow;

      const kind = IBP_OPTION_KIND_KEYS.includes(input.kind) ? input.kind : null;
      if (!kind) return fail('Choose the lever this option pulls. A trade-off with no lever is an opinion.', 'kind', REFUSAL('option-kind-invalid'));
      const optionKind = ibpOptionKind(kind);

      const monthIndex = ibpInt(Number(input.monthIndex), L.monthMin, cycleRow.horizonMonths);
      if (monthIndex === null) return fail(IBP_REFUSALS.monthInvalid, 'monthIndex', REFUSAL('month-invalid'));

      const units = parsePlanUnitsInput(input.units);
      if (units === null || units === 0) {
        return fail('Record the plan-unit effect of this option — at least one whole unit, on the side it moves. An option that moves nothing is a note, not a trade-off.', 'units', REFUSAL('units-invalid'));
      }
      const cents = parseMoneyInputToCents(input.cost);
      if (cents === null) {
        const raw = String(input.cost ?? '').trim();
        return fail(/^\d+\.\d{3,}$/.test(raw)
          ? `“${raw}” has a third decimal place, which is a different amount. Record it to the cent or record the rounded figure deliberately.`
          : `“${raw || 'blank'}” is not an amount. Use major units with at most two decimal places (e.g. 48000 or 48000.25). An option with no price cannot be weighed.`,
        'cost', REFUSAL('cost-invalid'));
      }
      const note = ibpText(input.note, L.textMax);
      if (note.length < L.textMin) {
        return fail(`Describe what this option actually buys or gives up, in at least ${L.textMin} characters.`, 'note', REFUSAL('note-too-short'));
      }

      const g = graph();
      if (!g.ok) return g;
      if (!holdsCycle(check, cycleRow, g.matrix)) return fail(IBP_REFUSALS.wrongLine, 'cycleId', REFUSAL('not-your-line'));

      const existing = normalizeIbpOptions(rows('ibpOptions'), normalizeIbpCycles(rows('ibpCycles'), []), []);
      if (existing.some((row) => row.cycleId === cycleRow.id && row.kind === kind && row.monthIndex === monthIndex)) {
        return fail(IBP_REFUSALS.duplicateOption, 'kind', REFUSAL('duplicate-option'));
      }
      if (rows('ibpOptions').length >= L.options) {
        return fail(IBP_REFUSALS.ledgerFull, null, REFUSAL('ledger-full'));
      }

      const row = {
        id: id('ibpo'),
        cycleId: cycleRow.id,
        monthIndex,
        kind,
        side: optionKind.moves,
        units,
        cents,
        framedBy: check.actorId,
        framedOn: check.today,
        note,
      };
      const kept = normalizeIbpOptions([...rows('ibpOptions'), row], normalizeIbpCycles(rows('ibpCycles'), []), []);
      const stored = kept.find((candidate) => candidate.id === row.id);
      if (!stored) return fail(IBP_REFUSALS.loaderRefused, null, REFUSAL('loader-refused'));
      store.update((draft) => {
        draft.ibpOptions = Array.isArray(draft.ibpOptions) ? draft.ibpOptions : [];
        draft.ibpOptions.push(stored);
      }, {
        type: IBP_EVENTS.OPTION_RECORDED,
        entity: 'ibpOption',
        entityId: stored.id,
        summary: `Month ${monthIndex} option framed: ${kind} moves ${optionKind.moves} by ${units} unit(s) at ${cents} cent(s).`.slice(0, 300),
      });
      return { ok: true, option: stored, events: [IBP_EVENTS.OPTION_RECORDED] };
    },

    /**
     * APPROVE the plan at the executive review. VP-and-above, once, never by a
     * seat that framed the options, and the residual being accepted is stated.
     */
    ibpApprovePlan(input = {}) {
      const check = seatFor(IBP_RIGHTS.DECIDE);
      if (!check.ok) return check;
      const ctx = cycleContext(check, input.cycleId);
      if (!ctx.ok) return ctx;
      const cycleRow = ctx.cycleRow;

      const g = graph();
      if (!g.ok) return g;
      const authority = cycleAuthority(check, cycleRow, g.matrix);

      // Only a seat that holds the authority above BOTH lines approves. A branch
      // with no such seat gets `no-authority-at-rank`, never a promoted director.
      if (!check.seat.fullAccess) {
        const holdsAuthority = authority.seatIds.includes(check.actorId)
          || (authority.chiefQueue && check.seat.fullAccess);
        if (!holdsAuthority) {
          return fail(authority.state === 'no-authority-at-rank'
            ? 'No seat at VP altitude sits above both lines of this cycle, so nobody holds the executive step. The register will not promote a director into it — appoint the accountable seat or record the escalation elsewhere.'
            : 'The executive step belongs to the lowest seat above BOTH lines of this plan. You do not hold it; the register will not let one side of the plan approve it for the other.',
          'cycleId', REFUSAL('not-the-executive-seat'));
        }
      }

      // One decision per cycle, and never by a seat that framed the trade-off.
      const existing = normalizeIbpDecisions(rows('ibpDecisions'), normalizeIbpCycles(rows('ibpCycles'), []), []);
      if (existing.some((row) => row.cycleId === cycleRow.id)) {
        return fail(IBP_REFUSALS.secondDecision, 'cycleId', REFUSAL('already-decided'));
      }
      if (framerIds(cycleRow.id).has(check.actorId)) {
        return fail(IBP_REFUSALS.selfDecide, 'cycleId', REFUSAL('framer-approves'));
      }

      const row = reportRow(cycleRow.id);
      if (!row) return fail(IBP_REFUSALS.notFound, 'cycleId', REFUSAL('cycle-not-found'));
      if (row.totals.gapUnits === null) {
        return fail('The gap is not yet computable: this cycle has no demand row, or its capacity is theoretical rather than demonstrated. An executive cannot approve a plan whose gap nobody has counted.', 'cycleId', REFUSAL('gap-uncomputable'));
      }

      const acknowledgedResidualUnits = parsePlanUnitsInput(input.acknowledgedResidualUnits);
      if (acknowledgedResidualUnits === null) {
        return fail('State the residual you are accepting as a whole number of units. A plan approved with an unstated residual is a plan whose gap has been forgotten, not closed.', 'acknowledgedResidualUnits', REFUSAL('residual-invalid'));
      }
      const reason = ibpText(input.reason, L.reasonMax);
      if (reason.length < L.reasonMin) {
        return fail(`Write the basis for this approval in at least ${L.reasonMin} characters. The record has to explain the plan to whoever inherits it.`, 'reason', REFUSAL('reason-too-short'));
      }
      const serviceNote = ibpText(input.serviceNote, L.textMax);
      if (serviceNote.length < L.textMin) {
        return fail(`State who is served first where the plan cannot serve everyone, in at least ${L.textMin} characters.`, 'serviceNote', REFUSAL('service-note-too-short'));
      }

      const act = {
        id: id('ibpdec'),
        cycleId: cycleRow.id,
        actorId: check.actorId,
        decidedOn: check.today,
        acknowledgedResidualUnits,
        servedFirst: ibpText(input.servedFirst, L.textMax) || 'not stated',
        reason,
        serviceNote,
      };
      const kept = normalizeIbpDecisions([...rows('ibpDecisions'), act], normalizeIbpCycles(rows('ibpCycles'), []), []);
      const stored = kept.find((candidate) => candidate.id === act.id);
      if (!stored) return fail(IBP_REFUSALS.loaderRefused, null, REFUSAL('loader-refused'));
      store.update((draft) => {
        draft.ibpDecisions = Array.isArray(draft.ibpDecisions) ? draft.ibpDecisions : [];
        draft.ibpDecisions.push(stored);
      }, {
        type: IBP_EVENTS.PLAN_APPROVED,
        entity: 'ibpDecision',
        entityId: stored.id,
        summary: `Operating plan approved on ${check.today} accepting a residual of ${acknowledgedResidualUnits} unit(s) against a computed ${row.totals.residualUnits}.`.slice(0, 300),
      });
      return {
        ok: true,
        decision: stored,
        // The computed residual is returned beside the acknowledged one so the
        // panel prints both and a disagreement is visible, never reconciled.
        computedResidualUnits: row.totals.residualUnits,
        matches: stored.acknowledgedResidualUnits === row.totals.residualUnits,
        events: [IBP_EVENTS.PLAN_APPROVED],
      };
    },

    /**
     * GRADE one cycle-month against what actually sold, using the consensus that
     * was already frozen. Never rewrites the consensus.
     */
    ibpGradeDemand(input = {}) {
      const check = seatFor(IBP_RIGHTS.GRADE);
      if (!check.ok) return check;
      const ctx = cycleContext(check, input.cycleId);
      if (!ctx.ok) return ctx;
      const cycleRow = ctx.cycleRow;

      const monthIndex = ibpInt(Number(input.monthIndex), L.monthMin, cycleRow.horizonMonths);
      if (monthIndex === null) return fail(IBP_REFUSALS.monthInvalid, 'monthIndex', REFUSAL('month-invalid'));

      const actualUnits = parsePlanUnitsInput(input.actualUnits);
      if (actualUnits === null) {
        return fail(/^\d+\.\d+$/.test(String(input.actualUnits ?? '').trim())
          ? 'A fractional unit is refused. Record the actual in whole units.'
          : 'Record what actually sold as a whole number of units.', 'actualUnits', REFUSAL('units-invalid'));
      }

      const g = graph();
      if (!g.ok) return g;
      if (!holdsCycle(check, cycleRow, g.matrix)) return fail(IBP_REFUSALS.wrongLine, 'cycleId', REFUSAL('not-your-line'));

      const loadedCycles = normalizeIbpCycles(rows('ibpCycles'), []);
      const demand = normalizeIbpDemandRows(rows('ibpDemandRows'), loadedCycles, [])
        .find((row) => row.cycleId === cycleRow.id && row.monthIndex === monthIndex);
      if (!demand) {
        return fail('That month carries no frozen consensus on this cycle, so there is nothing to grade. A grade against a plan nobody recorded is a comparison against nothing.', 'monthIndex', REFUSAL('no-consensus'));
      }
      const existing = normalizeIbpGrades(rows('ibpGrades'), loadedCycles, []);
      if (existing.some((row) => row.cycleId === cycleRow.id && row.monthIndex === monthIndex)) {
        return fail(IBP_REFUSALS.secondGrade, 'monthIndex', REFUSAL('already-graded'));
      }

      const row = {
        id: id('ibpg'),
        cycleId: cycleRow.id,
        monthIndex,
        actualUnits,
        gradedBy: check.actorId,
        gradedOn: check.today,
        note: ibpText(input.note, L.textMax),
      };
      const kept = normalizeIbpGrades([...rows('ibpGrades'), row], loadedCycles, []);
      const stored = kept.find((candidate) => candidate.id === row.id);
      if (!stored) return fail(IBP_REFUSALS.loaderRefused, null, REFUSAL('loader-refused'));
      store.update((draft) => {
        draft.ibpGrades = Array.isArray(draft.ibpGrades) ? draft.ibpGrades : [];
        draft.ibpGrades.push(stored);
      }, {
        type: IBP_EVENTS.DEMAND_GRADED,
        entity: 'ibpGrade',
        entityId: stored.id,
        summary: `Month ${monthIndex} demand graded: actual ${actualUnits} against a frozen consensus of ${demand.consensusUnits} unit(s).`.slice(0, 300),
      });
      return {
        ok: true,
        grade: stored,
        consensusUnits: demand.consensusUnits,
        biasUnits: actualUnits - demand.consensusUnits,
        events: [IBP_EVENTS.DEMAND_GRADED],
      };
    },

    /** Explicit scan — pause-governed exactly like a commit. */
    ibpScan() {
      const check = seatFor(IBP_RIGHTS.READ);
      if (!check.ok) return check;
      const events = [];
      if (typeof store.commit === 'function') {
        const result = store.commit({ type: IBP_EVENTS.SCANNED }, { reason: 'integrated business plan scan' });
        events.push(result);
      }
      const report = buildIbp(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
      return { ok: true, report, events };
    },

    /** Exported for the panel and the tests: the identity-free marker loader. */
    ibpMarkers() {
      return normalizeIbpMarkers(rows('ibpMarkers'), []);
    },

    /** Exported for the test suite: the pure reader, seat-reproved. */
    ibpReadModel() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, report: buildIbp(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    /** Exported for the test suite: whether a seat can see one cycle in full. */
    ibpSeesCycle(cycleId) {
      const check = readCheck();
      if (!check.ok) return check;
      const cycleRow = normalizeIbpCycles(rows('ibpCycles'), []).find((row) => row.id === ibpId(cycleId));
      if (!cycleRow) return fail(IBP_REFUSALS.notFound, 'cycleId');
      const seen = canSee({ id: cycleRow.id, ownerId: cycleRow.ownerId, lineIds: [cycleRow.demandLineId, cycleRow.supplyLineId] }, 'ibpCycles', check.seat, null);
      return { ok: true, allow: seen.allow, reason: seen.reason };
    },

    /** Bounded read of stored figures for the panel's formatter parity. */
    ibpReadUnits(value) {
      return readNonNegUnits(value);
    },

    ibpReadCents(value) {
      return readCents(value);
    },
  };
}

/**
 * Approximate a calendar day N months ahead, used only for the default review
 * date. Deliberately not a business-day calendar: the review date is a stated
 * date, and the register prints it so a human can change it.
 */
function ibpAddMonthsApprox(day, months) {
  const base = ibpDay(day);
  if (!base || !Number.isInteger(months)) return null;
  const stamp = new Date(`${base}T00:00:00.000Z`);
  stamp.setUTCMonth(stamp.getUTCMonth() + months);
  return stamp.toISOString().slice(0, 10);
}
