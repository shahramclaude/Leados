/**
 * app/core/domain/sourcingActions.js — the seat-checked commands of the
 * Capability Sourcing & Firm-Boundary Register (ADR-0229).
 *
 * FIVE human acts and a scan, and nothing else: DECLARE a capability case,
 * WITHDRAW it, RECORD an option (a mode with its exact cost lines and its
 * safeguards), DECIDE the boundary question, and GRADE the frozen assumptions
 * against what actually landed. Every figure, verdict and premium is re-derived
 * on read by `sourcing.js`; nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - Money is converted from major units to whole cents exactly once, in
 *    integer arithmetic. A third decimal place is a different amount, so it is
 *    refused rather than rounded; no comma, sign or exponent is accepted.
 *  - A cost line that does not belong to its mode is refused. A duplicated line
 *    is refused rather than summed twice.
 *  - An option's currency, horizon and discount rate are recorded on the row and
 *    compared against the CASE on read. A mismatch is not an error in the door —
 *    it is a comparison the register refuses to make, and it prints why.
 *  - The seat that DECIDES does not also RECORD the option being decided. The
 *    party that benefits from the answer does not write the comparison.
 *  - Only the chief altitude moves the boundary of the firm. A branch whose
 *    graph has no chief seat gets `no-authority-at-rank`, never a promoted seat.
 *  - A case is immutable once declared. A changed horizon, currency, specificity
 *    or owner is a NEW case, so a frozen assumption can never be re-described
 *    after the fact.
 *  - A boundary decision is recorded ONCE. A later reconsideration is a new
 *    case, so the first decision stays on the record and cannot be retro-edited.
 *  - Every write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused now.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct, canSee } from './seat.js';
import { LEADER_ID } from './chain.js';
import { altitudeRank } from './chainRegistry.js';
import { matrixJointApex } from './matrix.js';
import {
  buildSourcing,
  resolveAuthority,
  sourcingMatrix,
} from './sourcing.js';
import {
  centsToDisplay,
  normalizeSrcMarkers,
  normalizeSourcingActs,
  normalizeSourcingCases,
  normalizeSourcingOptions,
  parseMoneyInputToCents,
  readStoredCents,
  srcAddDays,
  srcCurrency,
  srcDay,
  srcId,
  srcInt,
  srcOneOf,
  srcText,
} from './sourcingSchema.js';
import {
  SRC_EVENTS,
  SRC_LIMITS as L,
  SRC_MODE_KEYS,
  SRC_REFUSALS,
  SRC_RIGHTS,
  SRC_SAFEGUARD_KEYS,
  SRC_SPECIFICITY_KEYS,
  SRC_WEIGHT_KEYS,
  srcCostLine,
  srcCostLinesForMode,
  srcMode,
} from './sourcingRegistry.js';

const list = (value) => (Array.isArray(value) ? value : []);
const fail = (error, field = null, extra = {}) => ({ ok: false, error, field, ...extra });
const REFUSAL = (key) => ({ refusals: [key] });

export function createSourcingActions(store, { now, idFactory }) {
  const clock = typeof now === 'function' ? now : (() => new Date());
  const id = typeof idFactory === 'function' ? idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);

  const buildSeat = () => buildSeats(store.state, { now: clock(), settings: store.state.settings || null });

  function seatFor(right) {
    const at = clock();
    const built = buildSeat();
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(SRC_REFUSALS.notSeated);
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    const cfg = store.state.settings || {};
    return {
      ok: true,
      seat,
      at,
      cfg,
      actorId: seat.fullAccess ? LEADER_ID : (seat.id || null),
      today: dayKey(at),
    };
  }

  function readCheck() {
    const at = clock();
    const built = buildSeat();
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(SRC_REFUSALS.notSeated);
    // A read is safe-listed and therefore bypasses the gateway's rank check, so
    // the right is re-proved HERE. Without this a manager could read the
    // enterprise's contract positions: the module would vanish from the gate
    // exactly where the gate matters most.
    const verdict = canAct(SRC_RIGHTS.READ, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg: store.state.settings || {} };
  }

  function graph() {
    try {
      return { ok: true, matrix: sourcingMatrix(store.state, clock(), store.state.settings || {}) };
    } catch (error) {
      return fail(`The reporting graph could not be read, so authority cannot be proved. Nothing was saved. (${error?.message || 'unknown error'})`, null, REFUSAL('graph-unreadable'));
    }
  }

  const rankOf = (matrix, nodeId) => altitudeRank(matrix?.nodes?.get(nodeId)?.altitude) || 0;

  /* ------------------------------------------------------------ the reads */

  function sourcingReport() {
    const check = readCheck();
    if (!check.ok) return check;
    const report = buildSourcing(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
    return { ok: true, report, seat: check.seat };
  }

  function sourcingAttentionCount() {
    try {
      const built = buildSeat();
      const seat = activeSeat(built);
      if (seat.readOnly) return { ok: true, count: 0 };
      if (!canAct(SRC_RIGHTS.READ, seat).allow) return { ok: true, count: 0 };
      const report = buildSourcing(store.state, { now: clock(), settings: store.state.settings || {}, seat });
      return { ok: true, count: sourcingReportCount(report) };
    } catch {
      return { ok: true, count: 0 };
    }
  }

  function sourcingReportCount(report) {
    return list(report?.visibleRows).filter((row) => !row.withdrawn
      && ['decision-owed', 'safeguard-missing', 'mismatch', 'not-comparable'].includes(row.verdict)).length
      + list(report?.visibleRows).filter((row) => row.gradeOwed).length;
  }

  /**
   * The options a seat may pick from when deciding, and the joint apex the
   * decision will be filed against. Computed from the record, never chosen by
   * the actor.
   */
  function sourcingCandidates() {
    const check = readCheck();
    if (!check.ok) return check;
    const report = buildSourcing(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
    if (report.matrixError) return fail(`The reporting graph could not be read: ${report.matrixError}`, null, REFUSAL('graph-unreadable'));
    return {
      ok: true,
      candidates: report.visibleRows
        .filter((row) => !row.withdrawn && !row.decision)
        .map((row) => ({
          caseId: row.id,
          title: row.title,
          currency: row.currency,
          horizonDays: row.horizonDays,
          discountBp: row.discountBp,
          specificity: row.specificity,
          verdict: row.verdict,
          authorityState: row.authority.state,
          options: row.options.map((option) => ({
            optionId: option.id,
            mode: option.mode,
            totalCents: option.totalCents,
            comparable: option.comparable,
            answered: option.answered,
            safeguards: option.safeguards,
          })),
        })),
      report,
    };
  }

  /* ------------------------------------------------------- the write door */

  function caseContext(check, caseId) {
    const cid = srcId(caseId);
    if (!cid) return fail('Name the capability case this belongs to.', 'caseId');
    const loaded = normalizeSourcingCases(rows('sourcingCases'), []);
    const caseRow = loaded.find((row) => row.id === cid) || null;
    if (!caseRow) return fail(SRC_REFUSALS.notFound, 'caseId', REFUSAL('case-not-found'));
    if (caseRow.withdrawnOn && caseRow.withdrawnOn <= check.today) {
      return fail(SRC_REFUSALS.withdrawn, 'caseId', REFUSAL('case-withdrawn'));
    }
    return { ok: true, caseRow };
  }

  /** Does this seat hold a line the capability sits on, or a line over its owner? */
  function holdsCapability(check, caseRow, matrix) {
    if (check.seat.fullAccess) return true;
    const scope = check.seat.scope || new Set();
    const lineScope = check.seat.lineScope || new Set();
    if (caseRow.lineIds.some((lineId) => scope.has(lineId) || lineScope.has(lineId))) return true;
    if (caseRow.ownerId && (scope.has(caseRow.ownerId) || lineScope.has(caseRow.ownerId))) return true;
    // Or the seat sits above every line, through the tree.
    const node = matrix?.nodes?.get(check.actorId);
    if (!node) return false;
    return caseRow.lineIds.every((lineId) => node.descendants?.has?.(lineId));
  }

  /** The joint chief apex for this case, re-proved from the live graph. */
  function chiefApex(check, caseRow, matrix) {
    // ONE recipe, shared with the reader. If these two ever disagree, the door
    // would admit a seat the register says is not the decision-maker.
    const authority = resolveAuthority(matrix, [caseRow.ownerId, ...caseRow.lineIds], 5);
    if (authority.state === 'no-holder' || authority.state === 'no-joint-apex') {
      return { ok: false, state: authority.state === 'no-holder' ? 'no-joint-apex' : authority.state };
    }
    if (authority.state === 'no-authority-at-rank') return { ok: false, state: 'no-authority-at-rank' };
    return {
      ok: true,
      state: authority.state,
      seatIds: authority.seatIds,
      chiefQueue: authority.chiefQueue,
      ambiguous: authority.ambiguous,
    };
  }

  /* -------------------------------------------------------------- the acts */

  return {
    sourcingReport,
    sourcingAttentionCount,
    sourcingCandidates,

    /**
     * DECLARE a capability case. The terms are frozen here and never edited.
     */
    sourcingDeclareCase(input = {}) {
      const check = seatFor(SRC_RIGHTS.RECORD);
      if (!check.ok) return check;

      const title = srcText(input.title, L.titleMax);
      if (title.length < L.titleMin) {
        return fail(`Name the capability in at least ${L.titleMin} characters — “the billing engine” has to survive being read again in eighteen months.`, 'title');
      }
      const currency = srcCurrency(input.currency);
      if (!currency) return fail('Choose the currency the enterprise will price this capability in (three letters, e.g. DKK).', 'currency', REFUSAL('currency-invalid'));
      const horizonDays = srcInt(input.horizonDays, L.horizonMinDays, L.horizonMaxDays);
      if (horizonDays === null) {
        return fail(`The horizon must be a whole number of days between ${L.horizonMinDays} and ${L.horizonMaxDays}. Two options priced over different horizons are not a comparison.`, 'horizonDays', REFUSAL('horizon-invalid'));
      }
      const discountBp = srcInt(input.discountBp ?? 0, 0, 10_000);
      if (discountBp === null) return fail('The discount rate must be whole basis points between 0 and 10,000.', 'discountBp', REFUSAL('discount-invalid'));
      const specificity = srcOneOf(SRC_SPECIFICITY_KEYS, input.specificity);
      if (!specificity) return fail('Declare the asset specificity. It is the variable the whole boundary decision turns on, and it cannot be inferred from a title.', 'specificity', REFUSAL('specificity-invalid'));
      const weight = srcOneOf(SRC_WEIGHT_KEYS, input.weight);
      if (!weight) return fail('Declare the capability’s strategic weight — differentiating, supporting or context.', 'weight', REFUSAL('weight-invalid'));
      const reason = srcText(input.reason, L.reasonMax);
      if (reason.length < L.reasonMin) {
        return fail(`Write the basis for opening this case, in at least ${L.reasonMin} characters. A boundary question with no written basis is a preference.`, 'reason', REFUSAL('reason-too-short'));
      }
      const ownerId = srcId(input.ownerId) || check.actorId;
      if (!store.state.people?.some((person) => person && person.id === ownerId && person.status !== 'archived')) {
        return fail('The capability owner must be on the active roster.', 'ownerId', REFUSAL('owner-off-roster'));
      }
      const reviewOn = input.reviewOn ? srcDay(input.reviewOn) : srcAddDays(check.today, 365);
      if (!reviewOn) return fail('Give a real calendar day for the review.', 'reviewOn', REFUSAL('day-invalid'));
      if (reviewOn <= check.today) return fail('The review date must be in the future — a review already past is not a review.', 'reviewOn', REFUSAL('review-not-future'));

      const g = graph();
      if (!g.ok) return g;

      // The case's lines are the lines the owner sits on: a capability sits
      // where its accountable owner sits, and the register never asks the actor
      // to pick one line over another.
      const lineIds = [...new Set((g.matrix.linesByPerson?.get(ownerId) || [])
        .filter((line) => line && line.active !== false && line.managerId && g.matrix.nodes.has(line.managerId))
        .map((line) => line.managerId))].sort();
      if (!lineIds.length && !check.seat.fullAccess) {
        return fail('The capability owner resolves to no line on the reporting graph, so no joint seat above this capability can be proved. Add the owner’s line first.', 'ownerId', REFUSAL('no-line'));
      }

      if (rows('sourcingCases').length >= L.cases) {
        return fail('The case register is at its declared cap; withdraw or export before opening another.', null, REFUSAL('ledger-full'));
      }
      const already = normalizeSourcingCases(rows('sourcingCases'), []).some((row) => row.title.toLowerCase() === title.toLowerCase()
        && !(row.withdrawnOn && row.withdrawnOn <= check.today));
      if (already) return fail('A live case already carries that capability name. Amend that one, or withdraw it first — two live cases for one capability would double-count the premium.', 'title', REFUSAL('duplicate-title'));

      const row = {
        id: id('src'),
        title,
        ownerId,
        lineIds,
        currency,
        horizonDays,
        discountBp,
        specificity,
        weight,
        declaredOn: check.today,
        reviewOn,
        withdrawnOn: null,
        reason,
      };
      const kept = normalizeSourcingCases([...rows('sourcingCases'), row], []);
      const stored = kept.find((candidate) => candidate.id === row.id);
      if (!stored) return fail('The case could not be read back by the loader, so nothing was saved.', null, REFUSAL('loader-refused'));
      store.state.sourcingCases = [...rows('sourcingCases'), stored];
      return { ok: true, case: stored, events: [SRC_EVENTS.CASE_DECLARED] };
    },

    /** WITHDRAW a case. A withdrawal is final and never revives the row. */
    sourcingWithdrawCase(caseId, reason) {
      const check = seatFor(SRC_RIGHTS.RECORD);
      if (!check.ok) return check;
      const ctx = caseContext(check, caseId);
      if (!ctx.ok) return ctx;
      if (ctx.caseRow.withdrawnOn) return fail(SRC_REFUSALS.withdrawn, 'caseId', REFUSAL('already-withdrawn'));
      const why = srcText(reason, L.reasonMax);
      if (why.length < L.reasonMin) return fail(`Write why this case is being withdrawn, in at least ${L.reasonMin} characters.`, 'reason', REFUSAL('reason-too-short'));

      const g = graph();
      if (!g.ok) return g;
      if (!holdsCapability(check, ctx.caseRow, g.matrix)) return fail(SRC_REFUSALS.wrongLine, 'caseId', REFUSAL('not-your-line'));

      const next = rows('sourcingCases').map((row) => (row && row.id === ctx.caseRow.id
        ? { ...row, withdrawnOn: check.today, reason: `${row.reason} — withdrawn ${check.today}: ${why}`.slice(0, L.reasonMax) }
        : row));
      const kept = normalizeSourcingCases(next, []);
      const stored = kept.find((row) => row.id === ctx.caseRow.id);
      if (!stored) return fail('The withdrawal could not be read back by the loader, so nothing was saved.', null, REFUSAL('loader-refused'));
      store.state.sourcingCases = next;
      return { ok: true, case: stored, events: [SRC_EVENTS.CASE_WITHDRAWN] };
    },

    /**
     * RECORD an option: one mode, its exact cost lines, its safeguards.
     * The terms (currency, horizon, discount) are recorded on the row and
     * compared with the case on read; a mismatch is printed, never repaired.
     */
    sourcingRecordOption(input = {}) {
      const check = seatFor(SRC_RIGHTS.RECORD);
      if (!check.ok) return check;
      const ctx = caseContext(check, input.caseId);
      if (!ctx.ok) return ctx;
      const caseRow = ctx.caseRow;

      const mode = srcOneOf(SRC_MODE_KEYS, input.mode);
      if (!mode) return fail('Choose the sourcing mode this option prices: make, buy, partner or hybrid.', 'mode', REFUSAL('mode-invalid'));

      const note = srcText(input.note, L.textMax);
      if (note.length < L.textMin) {
        return fail(`Describe what this option actually is, in at least ${L.textMin} characters. A total with no description cannot be compared with anything.`, 'note', REFUSAL('note-too-short'));
      }

      // The party that will DECIDE does not write the comparison it decides on.
      //
      // This INCLUDES the workspace apex. It is tempting to exempt `fullAccess`
      // from its own rule on the theory that nobody is left to record anything —
      // but that is exactly the temptation the rule exists to stop. The apex is
      // the chief the reader computes for this case, so if it writes the options,
      // the record holds a comparison authored by the party that benefits from
      // the answer, and the independent reading is gone. The apex keeps DECIDE
      // and GRADE and gives up RECORD.
      {
        const g = graph();
        if (!g.ok) return g;
        const apex = chiefApex(check, caseRow, g.matrix);
        const isDecider = apex.ok && (
          (check.seat.fullAccess && apex.chiefQueue)
          || (!check.seat.fullAccess && apex.seatIds.includes(check.actorId))
        );
        if (isDecider) {
          return fail(SRC_REFUSALS.selfRecord, 'mode', REFUSAL('decider-records-option'));
        }
      }

      const currency = srcCurrency(input.currency) || caseRow.currency;
      if (currency !== caseRow.currency) {
        return fail(`This case is priced in ${caseRow.currency}. An option in ${currency} would make the comparison a currency question, and no exchange rate exists on this record.`, 'currency', REFUSAL('currency-mismatch'));
      }
      const horizonDays = input.horizonDays === undefined || input.horizonDays === null || input.horizonDays === ''
        ? caseRow.horizonDays
        : srcInt(input.horizonDays, L.horizonMinDays, L.horizonMaxDays);
      if (horizonDays === null) return fail('The horizon must be a whole number of days.', 'horizonDays', REFUSAL('horizon-invalid'));
      const discountBp = input.discountBp === undefined || input.discountBp === null || input.discountBp === ''
        ? caseRow.discountBp
        : srcInt(input.discountBp, 0, 10_000);
      if (discountBp === null) return fail('The discount rate must be whole basis points.', 'discountBp', REFUSAL('discount-invalid'));

      const allowed = new Set(srcCostLinesForMode(mode));
      const lines = [];
      const seen = new Set();
      for (const entry of list(input.lines)) {
        const key = srcOneOf([...allowed], entry?.key);
        if (!key) {
          const declaredLine = srcCostLine(srcText(entry?.key, 60));
          return fail(declaredLine
            ? `“${declaredLine.label}” does not belong to a ${srcMode(mode)?.label?.split(' — ')[0]?.toLowerCase()} option. ${SRC_REFUSALS.lineNotInMode}`
            : `“${srcText(entry?.key, 60) || 'that line'}” is not a declared cost line.`, 'lines', REFUSAL('line-not-in-mode'));
        }
        if (seen.has(key)) return fail(SRC_REFUSALS.duplicateLine, 'lines', REFUSAL('duplicate-line'));
        const cents = parseMoneyInputToCents(entry?.amount);
        if (cents === null) {
          const raw = String(entry?.amount ?? '').trim();
          return fail(/^\d+\.\d{3,}$/.test(raw)
            ? `“${raw}” has a third decimal place, which is a different amount. Record it to the cent or record the rounded figure deliberately.`
            : `“${raw || 'blank'}” is not an amount. Use major units with at most two decimal places (e.g. 486000 or 486000.25).`,
          'lines', REFUSAL('line-amount-invalid'));
        }
        if (cents === 0) return fail('A zero cost line is not a cost — leave the line out rather than recording nothing as a figure.', 'lines', REFUSAL('line-zero'));
        seen.add(key);
        lines.push({ key, cents });
      }
      if (!lines.length) return fail('Record at least one cost line. An option with no cost is not a priced option.', 'lines', REFUSAL('no-lines'));

      const safeguards = Array.isArray(input.safeguards)
        ? [...new Set(input.safeguards.map((key) => srcOneOf(SRC_SAFEGUARD_KEYS, key)).filter(Boolean))].sort()
        : [];
      const rejected = Array.isArray(input.safeguards) ? input.safeguards.filter((key) => !SRC_SAFEGUARD_KEYS.includes(key)) : [];
      if (rejected.length) {
        return fail(`“${srcText(rejected[0], 40)}” is not a declared safeguard. A safeguard is a real instrument — an exit plan, escrow, a second source — not a note about the relationship.`, 'safeguards', REFUSAL('safeguard-invalid'));
      }

      if (rows('sourcingOptions').length >= L.options) {
        return fail('The option register is at its declared cap; export before recording another.', null, REFUSAL('ledger-full'));
      }

      const option = {
        id: id('srco'),
        caseId: caseRow.id,
        mode,
        recordedById: check.actorId,
        recordedOn: check.today,
        currency,
        horizonDays,
        discountBp,
        note,
        safeguards,
        lines,
      };
      const cases = normalizeSourcingCases(rows('sourcingCases'), []);
      const kept = normalizeSourcingOptions([...rows('sourcingOptions'), option], cases, []);
      const stored = kept.find((row) => row.id === option.id);
      if (!stored) return fail('The option could not be read back by the loader, so nothing was saved.', null, REFUSAL('loader-refused'));
      store.state.sourcingOptions = [...rows('sourcingOptions'), stored];
      return { ok: true, option: stored, events: [SRC_EVENTS.OPTION_RECORDED] };
    },

    /**
     * DECIDE the boundary question. Chief altitude only, once per case, and the
     * chosen option must be one this record actually holds and priced on the
     * case's own terms.
     */
    sourcingDecide(caseId, optionId, input = {}) {
      const check = seatFor(SRC_RIGHTS.DECIDE);
      if (!check.ok) return check;
      const ctx = caseContext(check, caseId);
      if (!ctx.ok) return ctx;
      const caseRow = ctx.caseRow;

      const actsLoaded = normalizeSourcingActs(rows('sourcingActs'), [caseRow]);
      if (actsLoaded.some((act) => act.caseId === caseRow.id && act.kind === 'decide')) {
        return fail(SRC_REFUSALS.alreadyDecided, 'caseId', REFUSAL('already-decided'));
      }

      const g = graph();
      if (!g.ok) return g;
      const apex = chiefApex(check, caseRow, g.matrix);
      if (!apex.ok) {
        return fail(apex.state === 'no-authority-at-rank'
          ? 'No seat at the chief altitude sits above every line this capability touches. The register prints the decision as owed rather than promoting a lower seat into it.'
          : 'The reporting graph cannot name a seat above every line this capability touches, so no authority for this decision can be proved. Nothing was saved.',
        'caseId', REFUSAL(apex.state));
      }
      if (!check.seat.fullAccess) {
        const mine = apex.seatIds.includes(check.actorId);
        if (!mine && !apex.chiefQueue) {
          return fail(SRC_REFUSALS.decisionNotOurs, 'caseId', REFUSAL('not-chief-apex'));
        }
        if (!mine && apex.chiefQueue && !apex.seatIds.length) {
          return fail(SRC_REFUSALS.decisionNotOurs, 'caseId', REFUSAL('workspace-apex-only'));
        }
      }

      const oid = srcId(optionId);
      if (!oid) return fail('Choose which recorded option this decision adopts.', 'optionId', REFUSAL('option-required'));
      const options = normalizeSourcingOptions(rows('sourcingOptions'), [caseRow], []);
      const option = options.find((row) => row.id === oid && row.caseId === caseRow.id) || null;
      if (!option) return fail('That option is not recorded on this case.', 'optionId', REFUSAL('option-not-found'));
      // A decision on an option priced a different question would be a decision
      // about a comparison the register never made.
      if (option.currency !== caseRow.currency || option.horizonDays !== caseRow.horizonDays || option.discountBp !== caseRow.discountBp) {
        return fail(SRC_REFUSALS.horizonMismatch + ' Record the option on this case’s own terms before deciding it.', 'optionId', REFUSAL('option-not-comparable'));
      }
      const rationale = srcText(input.rationale, L.reasonMax);
      if (rationale.length < L.reasonMin) {
        return fail(`Write the basis for this boundary decision, in at least ${L.reasonMin} characters. Three years from now this sentence is the only record of why the firm owns — or does not own — this capability.`, 'rationale', REFUSAL('rationale-too-short'));
      }

      // A premium over the cheapest comparable option must be explained by the
      // reason that was required above; a decision on an option that does not
      // answer the specificity must say so. The door refuses neither — it asks
      // for the sentence, because a judgement without one is indistinguishable
      // from an error.
      const priced = options.filter((row) => row.caseId === caseRow.id
        && row.currency === caseRow.currency && row.horizonDays === caseRow.horizonDays && row.discountBp === caseRow.discountBp);
      const chosenTotal = buildSourcing(store.state, { now: check.at, settings: check.cfg, seat: null })
        .rows.find((row) => row.id === caseRow.id)?.options.find((row) => row.id === option.id)?.totalCents ?? null;
      const cheapest = (() => {
        const totals = priced
          .map((row) => buildSourcing(store.state, { now: check.at, settings: check.cfg, seat: null })
            .rows.find((r) => r.id === caseRow.id)?.options.find((r) => r.id === row.id)?.totalCents)
          .filter((value) => typeof value === 'number');
        return totals.length ? Math.min(...totals) : null;
      })();
      const declaredSafeguards = Array.isArray(input.safeguards)
        ? [...new Set(input.safeguards.map((key) => srcOneOf(SRC_SAFEGUARD_KEYS, key)).filter(Boolean))].sort()
        : option.safeguards.slice();

      if (chosenTotal !== null && cheapest !== null && chosenTotal > cheapest) {
        const premium = chosenTotal - cheapest;
        const premiumBp = cheapest > 0 ? Math.round((premium * 10_000) / cheapest) : null;
        if (!/\b(because|premium|specificity|strategic|risk|option|lock|exit|differenti)\b/i.test(rationale)) {
          return fail(`This option costs ${caseRow.currency} ${centsToDisplay(premium)} more than the cheapest comparable option${premiumBp !== null ? ` (${(premiumBp / 100).toFixed(2)}%)` : ''}. Say in the basis what the premium buys — the register prints it either way, but a premium with no reason is indistinguishable from an accounting error.`, 'rationale', REFUSAL('premium-unexplained'));
        }
      }

      const act = {
        id: id('srcact'),
        caseId: caseRow.id,
        actorId: check.actorId,
        at: check.today,
        kind: 'decide',
        mode: option.mode,
        optionId: option.id,
        rationale,
        safeguards: declaredSafeguards,
      };
      const kept = normalizeSourcingActs([...rows('sourcingActs'), act], [caseRow], []);
      const stored = kept.find((row) => row.id === act.id);
      if (!stored) return fail('The decision could not be read back by the loader, so nothing was saved.', null, REFUSAL('loader-refused'));
      store.state.sourcingActs = [...rows('sourcingActs'), stored];
      return { ok: true, decision: stored, authority: apex, events: [SRC_EVENTS.DECIDED] };
    },

    /**
     * GRADE the frozen assumptions, once, after the review date. Above the
     * decision, and never the recorder.
     */
    sourcingGrade(caseId, input = {}) {
      const check = seatFor(SRC_RIGHTS.GRADE);
      if (!check.ok) return check;
      const ctx = caseContext(check, input.caseId === undefined ? caseId : input.caseId);
      if (!ctx.ok) return ctx;
      const caseRow = ctx.caseRow;

      const actsLoaded = normalizeSourcingActs(rows('sourcingActs'), [caseRow]);
      if (actsLoaded.some((act) => act.caseId === caseRow.id && act.kind === 'grade')) {
        return fail('This case has already been graded. A grade is recorded once, so it cannot be revised after the result is known.', 'caseId', REFUSAL('already-graded'));
      }
      if (!caseRow.reviewOn || caseRow.reviewOn > check.today) {
        return fail('The case has not reached its declared review date yet. Grading before the horizon would reward the assumption rather than test it.', 'caseId', REFUSAL('review-not-reached'));
      }

      const g = graph();
      if (!g.ok) return g;
      // Independence is proved by ACTOR, not by rank, and the workspace apex is
      // not exempt: it is the only seat that may decide, so if it could also
      // grade, every case it decided would be marked by the party that chose the
      // answer. It keeps DECIDE and gives GRADE to the next seat down (rank 4+).
      {
        const deciderId = actsLoaded.find((act) => act.caseId === caseRow.id && act.kind === 'decide')?.actorId || null;
        const recorderIds = new Set(normalizeSourcingOptions(rows('sourcingOptions'), [caseRow], []).map((row) => row.recordedById));
        if (check.actorId === deciderId || recorderIds.has(check.actorId)) {
          return fail('The grade is an independent review: the seat that decided or recorded this case does not also grade its own assumptions.', 'caseId', REFUSAL('self-grade'));
        }
      }

      const actualMakeCents = input.actualMake === undefined || input.actualMake === null || input.actualMake === ''
        ? null : parseMoneyInputToCents(input.actualMake);
      const actualBuyCents = input.actualBuy === undefined || input.actualBuy === null || input.actualBuy === ''
        ? null : parseMoneyInputToCents(input.actualBuy);
      if ((input.actualMake !== undefined && input.actualMake !== null && input.actualMake !== '' && actualMakeCents === null)
        || (input.actualBuy !== undefined && input.actualBuy !== null && input.actualBuy !== '' && actualBuyCents === null)) {
        return fail('An actual figure must be major units with at most two decimal places. Nothing was saved.', null, REFUSAL('actual-invalid'));
      }
      if (actualMakeCents === null && actualBuyCents === null) {
        return fail('Record what the chosen side actually cost, or both sides if both were run. A grade with no figure cannot test the assumption.', null, REFUSAL('no-actual'));
      }
      const lesson = srcText(input.lesson, L.reasonMax);
      if (lesson.length < L.reasonMin) {
        return fail(`Write what this case taught, in at least ${L.reasonMin} characters. A delta with no lesson is a number the next decision cannot use.`, 'lesson', REFUSAL('lesson-too-short'));
      }

      const act = {
        id: id('srcact'),
        caseId: caseRow.id,
        actorId: check.actorId,
        at: check.today,
        kind: 'grade',
        actualMakeCents,
        actualBuyCents,
        lesson,
      };
      const kept = normalizeSourcingActs([...rows('sourcingActs'), act], [caseRow], []);
      const stored = kept.find((row) => row.id === act.id);
      if (!stored) return fail('The grade could not be read back by the loader, so nothing was saved.', null, REFUSAL('loader-refused'));
      store.state.sourcingActs = [...rows('sourcingActs'), stored];
      return { ok: true, grade: stored, events: [SRC_EVENTS.GRADED] };
    },

    /** Explicit scan — pause-governed exactly like a commit. */
    sourcingScan() {
      const check = seatFor(SRC_RIGHTS.READ);
      if (!check.ok) return check;
      const events = [];
      if (typeof store.commit === 'function') {
        const result = store.commit({ type: SRC_EVENTS.SCANNED }, { reason: 'sourcing scan' });
        events.push(result);
      }
      const report = buildSourcing(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
      return { ok: true, report, events };
    },

    /** Exported for the panel and the tests: the identity-free marker loader. */
    sourcingMarkers() {
      return normalizeSrcMarkers(rows('sourcingMarkers'), []);
    },

    /** Exported for the test suite: the pure reader, seat-reproved. */
    sourcingReadModel() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, report: buildSourcing(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    /** Exported for the test suite: whether a seat can see one case in full. */
    sourcingSeesCase(caseId) {
      const check = readCheck();
      if (!check.ok) return check;
      const cases = normalizeSourcingCases(rows('sourcingCases'), []);
      const caseRow = cases.find((row) => row.id === srcId(caseId));
      if (!caseRow) return fail(SRC_REFUSALS.notFound, 'caseId');
      const seen = canSee({ id: caseRow.id, ownerId: caseRow.ownerId, lineIds: caseRow.lineIds }, 'sourcingCases', check.seat, null);
      return { ok: true, allow: seen.allow, reason: seen.reason };
    },

    /** Bounded read of stored cents for the panel's formatter parity. */
    sourcingReadCents(value) {
      return readStoredCents(value);
    },
  };
}
