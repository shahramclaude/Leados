/**
 * app/core/domain/flexBudgetActions.js — the commands of the Flexible-Budget
 * Variance Statement (ADR-0213, Session 286, Schema v167).
 *
 * WHO MAY DO WHAT, AND WHY IT IS PROVED HERE AND NOT IN THE SCREEN.
 *
 *   DECLARE A STANDARD — a seat ABOVE the budget holder: the holder sits in the
 *     seat's reporting tree or on a reporting line declared to it, and the
 *     holder is not the seat itself. A budget holder who writes their own
 *     standard chooses their own target, and every favourable variance that
 *     follows measures the looseness of it. The refusal is unconditional for a
 *     seated person; the undeclared operator view is the workspace owner.
 *
 *   NAME AN OWNER OF A VARIANCE — only a person the declaring seat itself holds
 *     (tree or declared line), or the declaring seat itself. One line can never
 *     attribute a variance to a peer line's manager: a rate set outside the
 *     declarer's span stays UNDECLARED until a seat above both declares it.
 *
 *   RECORD ACTUALS — the budget holder, or a seat that holds them. Every plan
 *     line is recorded or nothing is. A cut-off after today is refused — nobody
 *     has recorded the future. A cut-off on the last day of the period is the
 *     FINAL recording; anything earlier is interim.
 *
 *   WITHDRAW A RECORDING — the person who recorded it, or a seat that holds the
 *     budget holder, with a written reason. The row is kept; only its life ends.
 *
 * Every write stores the row its own loader returns, so the record is identical
 * before and after a reload, and nothing derived is stored.
 */

import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import { matrixLineScopeFor } from './matrix.js';
import {
  buildFlexBudget,
  flexBudgetAttentionCount,
  flexBudgetBriefText,
  flexBudgetCsvRows,
  flexCurrentActual,
} from './flexBudget.js';
import { computeFlexStatement } from './flexBudgetMath.js';
import {
  FLEX_BUDGET_BOUNDS,
  FLEX_BUDGET_ENGINE_VERSION,
  FLEX_BUDGET_EVENTS,
  FLEX_BUDGET_LIMITS,
  FLEX_BUDGET_RIGHTS,
  FLEX_BUDGET_SETTING_KEYS,
  FLEX_BUDGET_SETTING_LABELS,
} from './flexBudgetRegistry.js';
import {
  flexCurrency,
  flexDay,
  flexDaysBetween,
  flexReason,
  flexTitle,
  normalizeFlexBudgetActuals,
  normalizeFlexBudgetPlans,
  normalizeFlexBudgetSettings,
  parseFlexMoney,
  parseFlexQuantity,
  readTypedFlexActualLines,
  readTypedFlexPlanLines,
} from './flexBudgetSchema.js';

const L = FLEX_BUDGET_LIMITS;

export function createFlexBudgetActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const text = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const saved = (extra = {}) => ({ ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [], ok: true });
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);

  function seatFor(right) {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail('The declared seat is unresolved and read-only. Choose a valid seat before reading or acting on a variance statement.');
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    const actorId = seat.fullAccess ? LEADER_ID : (seat.nodeId || seat.id);
    return { ok: true, seat, at, cfg, actorId, today: dayKey(at) };
  }
  const read = (check) => buildFlexBudget(store.state, { now: check.at, settings: check.cfg, seat: check.seat });

  /** How this seat holds a person: the route, or null. */
  function reachOf(check, personId) {
    if (check.seat.fullAccess) return 'operator';
    if (check.seat.scope instanceof Set && check.seat.scope.has(personId)) return 'home-line';
    if (check.seat.lineScope instanceof Set && check.seat.lineScope.has(personId)) return 'declared-line';
    return null;
  }
  const activePerson = (personId) => (Array.isArray(store.state.people) ? store.state.people : [])
    .find((person) => person && person.id === personId && person.status !== 'archived') || null;
  const livePlans = () => normalizeFlexBudgetPlans(rows('flexBudgetPlans'), []);
  const liveActuals = (plans) => normalizeFlexBudgetActuals(rows('flexBudgetActuals'), plans, []);

  /** An owner the declaring seat may name: itself, or a person it holds. */
  function nameableOwner(check, raw, field, what) {
    const personId = text(raw, 120);
    if (!personId) return { ok: true, id: null };
    if (personId === check.actorId && !check.seat.fullAccess) return { ok: true, id: personId };
    if (!activePerson(personId)) return fail(`${what}: “${personId}” is not an active person on the roster. An owner nobody can find answers for nothing.`, field);
    if (!reachOf(check, personId)) {
      return fail(`${what}: this seat does not hold that person in its reporting tree or on a declared reporting line. A seat names an owner only among the people it holds — one line never attributes a variance to a peer line’s manager. Leave the role undeclared, or have the seat above both declare it.`, field);
    }
    return { ok: true, id: personId };
  }

  return {
    /* ---------------------------------------------------------------- reads */

    /** The whole register for the active seat. */
    flexBudgetReport() {
      const check = seatFor(FLEX_BUDGET_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, report: read(check) };
    },

    flexBudgetBriefText() {
      const check = seatFor(FLEX_BUDGET_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, text: flexBudgetBriefText(read(check)) };
    },

    flexBudgetCsvRows() {
      const check = seatFor(FLEX_BUDGET_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, rows: flexBudgetCsvRows(read(check)) };
    },

    flexBudgetAttentionCount() {
      const check = seatFor(FLEX_BUDGET_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, count: flexBudgetAttentionCount(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    /**
     * Who this seat could name as a budget holder and as an owner. A READ: it is
     * offered to anyone who may read, and the DECLARE act re-proves the right.
     */
    flexBudgetCandidates() {
      const check = seatFor(FLEX_BUDGET_RIGHTS.READ);
      if (!check.ok) return check;
      const people = (Array.isArray(store.state.people) ? store.state.people : [])
        .filter((person) => person && person.id && person.status !== 'archived');
      const held = people
        .map((person) => ({ id: person.id, name: person.name || person.id, via: reachOf(check, person.id) }))
        .filter((row) => row.via)
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      const self = !check.seat.fullAccess ? people.find((person) => person.id === check.actorId) || null : null;
      const currencies = [];
      for (const key of ['budgets', 'investmentCases', 'flexBudgetPlans']) {
        for (const row of rows(key)) {
          const code = flexCurrency(row?.currency);
          if (code && !currencies.includes(code)) currencies.push(code);
        }
      }
      return {
        ok: true,
        today: check.today,
        canDeclare: canAct(FLEX_BUDGET_RIGHTS.DECLARE, check.seat).allow === true,
        // The holder is never the declaring seat itself.
        holders: held.filter((row) => row.id !== check.actorId),
        // An owner may be the declaring seat itself: taking a variance on is not attributing it to a peer.
        owners: self && !held.some((row) => row.id === self.id)
          ? [{ id: self.id, name: self.name || self.id, via: 'self' }, ...held]
          : held,
        currencies: currencies.sort(),
        limits: L,
      };
    },

    /* --------------------------------------------------------------- writes */

    /** Declare a standard for one cost object, one period, one currency. */
    flexBudgetDeclarePlan(input = {}) {
      const check = seatFor(FLEX_BUDGET_RIGHTS.DECLARE);
      if (!check.ok) return check;
      if (rows('flexBudgetPlans').length >= L.plans) return fail(`The plan ledger reached its ${L.plans}-row cap. Export the workspace before declaring another standard.`);
      const title = flexTitle(input.title);
      if (!title) return fail(`Name the cost object (at least ${L.titleMin} characters) — the function, service or product whose cost this standard is for.`, 'title');
      const ownerId = text(input.ownerId, 120);
      if (!ownerId) return fail('Name the budget holder — the person who runs this cost object and will record its actuals.', 'ownerId');
      if (!activePerson(ownerId)) return fail('The budget holder is not an active person on the roster.', 'ownerId');
      if (ownerId === check.actorId) {
        return fail('A budget holder does not declare their own standard. A standard set by the person it measures is a target they chose; it is declared by a seat above them.', 'ownerId');
      }
      const via = reachOf(check, ownerId);
      if (!via) return fail('This seat does not hold that budget holder in its reporting tree or on a declared reporting line. A standard is declared by a seat above the person it measures.', 'ownerId');
      const currency = flexCurrency(input.currency);
      if (!currency) return fail('State the currency as its three-letter code (DKK, EUR, USD). One statement, one currency; nothing is converted.', 'currency');
      const periodFrom = flexDay(input.periodFrom);
      if (!periodFrom) return fail('State the first day of the period as a real calendar day.', 'periodFrom');
      const periodTo = flexDay(input.periodTo);
      if (!periodTo) return fail('State the last day of the period as a real calendar day.', 'periodTo');
      const span = flexDaysBetween(periodFrom, periodTo);
      if (span === null || span < 0) return fail(`The period ends (${periodTo}) before it starts (${periodFrom}).`, 'periodTo');
      if (span > L.periodMaxDays) return fail(`The period runs ${span} days. A standard covers at most ${L.periodMaxDays} days.`, 'periodTo');
      const driverLabel = text(input.driverLabel, L.driverMax);
      if (driverLabel.length < 2) return fail('Name the activity driver — the unit of work the variable cost flexes with (tickets resolved, units shipped, billable hours).', 'driverLabel');
      const volumeE3 = parseFlexQuantity(input.volume);
      if (volumeE3 === null || volumeE3 === 0) return fail(`State the planned volume of ${driverLabel} for the period as a positive number with at most three decimals. Without a planned volume nothing can be restated for the work actually done.`, 'volume');
      const materialityCents = parseFlexMoney(input.materialityAmount === undefined || input.materialityAmount === '' ? '0' : input.materialityAmount);
      if (materialityCents === null) return fail('State the materiality floor as an amount with at most two decimals. Zero switches the floor off.', 'materialityAmount');
      const bpRaw = input.materialityPercent === undefined || input.materialityPercent === '' ? '0' : input.materialityPercent;
      const bpParsed = parseFlexMoney(bpRaw); // two decimals of a percent = whole basis points
      if (bpParsed === null || bpParsed > L.maxMaterialityBp) return fail('State the materiality share as a percentage from 0 to 100 with at most two decimals (5, 2.5). Zero switches the share test off.', 'materialityPercent');
      const typed = readTypedFlexPlanLines(input.lines !== undefined ? input.lines : input.linesText);
      if (!typed.ok) return fail(typed.error, 'linesText');
      const basis = flexReason(input.basis);
      if (!basis) return fail(`Write the basis of this standard (at least ${L.reasonMin} characters) — the approved budget, the rate card, the study the quantities come from. A standard with no basis is a number somebody typed.`, 'basis');

      const owners = {};
      for (const [key, what] of [['volumeOwnerId', 'Volume owner'], ['rateOwnerId', 'Rate owner'], ['usageOwnerId', 'Usage owner']]) {
        const owner = nameableOwner(check, input[key], key, what);
        if (!owner.ok) return owner;
        owners[key] = owner.id;
      }
      const lines = [];
      for (const line of typed.lines) {
        const rate = nameableOwner(check, line.rateOwnerId, 'linesText', `Line ${line.key} (${line.label}), rate owner`);
        if (!rate.ok) return rate;
        const usage = nameableOwner(check, line.usageOwnerId, 'linesText', `Line ${line.key} (${line.label}), usage owner`);
        if (!usage.ok) return usage;
        lines.push({ ...line, rateOwnerId: rate.id, usageOwnerId: usage.id });
      }

      const draftRecord = {
        id: idFactory('fbplan'), title, ownerId, currency, periodFrom, periodTo, driverLabel, volumeE3,
        materialityBp: bpParsed, materialityCents,
        volumeOwnerId: owners.volumeOwnerId, rateOwnerId: owners.rateOwnerId, usageOwnerId: owners.usageOwnerId,
        lines, basis,
        declaredOn: check.today, declaredAt: check.at.toISOString(), declaredById: check.actorId,
        engineVersion: FLEX_BUDGET_ENGINE_VERSION,
        retiredOn: null, retiredById: null, retireReason: null,
      };
      // The stored row IS the row its own loader returns, or nothing is written.
      const [record] = normalizeFlexBudgetPlans([draftRecord], []);
      if (!record) return fail('The standard could not be stored exactly as read. Nothing was saved.');
      // The static budget must be computable inside the exact range before it is accepted.
      const probe = computeFlexStatement(
        { volumeE3: record.volumeE3, lines: record.lines },
        { volumeE3: record.volumeE3, final: true, unplanned: [], lines: record.lines.map((line) => ({ key: line.key, qtyE3: line.behaviour === 'variable' ? line.qtyE3 : null, cents: 0 })) },
      );
      if (!probe.ok) return fail('This standard is too large to compute exactly. Split the cost object. Nothing was saved.', 'linesText');
      store.update((draft) => {
        draft.flexBudgetPlans = Array.isArray(draft.flexBudgetPlans) ? draft.flexBudgetPlans : [];
        draft.flexBudgetPlans.push(record);
      }, {
        type: FLEX_BUDGET_EVENTS.PLAN_DECLARED,
        entity: 'flexBudgetPlan',
        entityId: record.id,
        summary: `Flexible-budget standard declared on ${check.today} for one cost object: ${currency}, ${periodFrom} → ${periodTo}, ${record.lines.length} line(s), declared via ${via}.`.slice(0, 300),
      });
      return saved({ planId: record.id, via, staticBudgetCents: probe.totals.cents.static });
    },

    /** Retire a standard. The declaration and its recordings are preserved. */
    flexBudgetRetirePlan(input = {}) {
      const check = seatFor(FLEX_BUDGET_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const planId = text(input.planId, 120);
      const plan = livePlans().find((row) => row.id === planId) || null;
      if (!plan) return fail('That standard is not on the record.', 'planId');
      if (plan.retiredOn) return fail(`That standard was already retired on ${plan.retiredOn}.`, 'planId');
      if (plan.ownerId === check.actorId) return fail('A budget holder does not retire the standard they are measured against. A seat above them does.', 'planId');
      if (!reachOf(check, plan.ownerId)) return fail('This seat does not hold that standard’s budget holder in its reporting tree or on a declared reporting line.', 'planId');
      const reason = flexReason(input.reason);
      if (!reason) return fail(`Write why this standard is retired (at least ${L.reasonMin} characters). A standard that disappears without a reason takes its variances with it.`, 'reason');
      const [record] = normalizeFlexBudgetPlans([{ ...plan, retiredOn: check.today, retiredById: check.actorId, retireReason: reason }], []);
      if (!record) return fail('The retirement could not be stored exactly as read. Nothing was saved.');
      store.update((draft) => {
        const index = (draft.flexBudgetPlans || []).findIndex((row) => row && row.id === planId);
        if (index >= 0) draft.flexBudgetPlans[index] = record;
      }, {
        type: FLEX_BUDGET_EVENTS.PLAN_RETIRED,
        entity: 'flexBudgetPlan',
        entityId: planId,
        summary: `Flexible-budget standard retired on ${check.today} (${reason.slice(0, 160)}).`.slice(0, 300),
      });
      return saved({ planId });
    },

    /** Record actuals against a standard: every line, or nothing. */
    flexBudgetRecordActuals(input = {}) {
      const check = seatFor(FLEX_BUDGET_RIGHTS.RECORD);
      if (!check.ok) return check;
      if (rows('flexBudgetActuals').length >= L.actuals) return fail(`The actuals ledger reached its ${L.actuals}-row cap. Export the workspace before recording again.`);
      const planId = text(input.planId, 120);
      const plan = livePlans().find((row) => row.id === planId) || null;
      if (!plan) return fail('That standard is not on the record.', 'planId');
      if (plan.retiredOn) return fail(`That standard was retired on ${plan.retiredOn}. Nothing is recorded against a retired standard.`, 'planId');
      const via = plan.ownerId === check.actorId ? 'budget-holder' : reachOf(check, plan.ownerId);
      if (!via) return fail('Actuals are recorded by the budget holder or by a seat that holds them in its reporting tree or on a declared reporting line. This seat is neither.', 'planId');
      const asOf = flexDay(input.asOf);
      if (!asOf) return fail('State the cut-off as a real calendar day — the last day these figures cover.', 'asOf');
      if (asOf < plan.periodFrom || asOf > plan.periodTo) return fail(`The cut-off (${asOf}) lies outside the period of this standard (${plan.periodFrom} → ${plan.periodTo}). Use the last day of the period for the final recording.`, 'asOf');
      if (asOf > check.today) return fail(`The cut-off (${asOf}) is after today (${check.today}). Nobody has recorded the future; an estimate is a forecast and belongs in a different instrument.`, 'asOf');
      const volumeE3 = parseFlexQuantity(input.volume);
      if (volumeE3 === null) return fail(`State the volume of ${plan.driverLabel} actually done to the cut-off, with at most three decimals. Zero is typed as 0.`, 'volume');
      const typed = readTypedFlexActualLines(input.lines !== undefined ? input.lines : input.linesText, plan, input.unplanned);
      if (!typed.ok) return fail(typed.error, 'linesText');
      const basis = flexReason(input.basis);
      if (!basis) return fail(`Write where these figures come from (at least ${L.reasonMin} characters) — the ledger extract, the timesheet close, the invoice run. A variance is only as good as the actuals’ source.`, 'basis');
      const draftRecord = {
        id: idFactory('fbact'), planId: plan.id, asOf, volumeE3, lines: typed.lines, unplanned: typed.unplanned, basis,
        recordedOn: check.today, recordedAt: check.at.toISOString(), recordedById: check.actorId,
        withdrawnOn: null, withdrawnById: null, withdrawReason: null,
      };
      const [record] = normalizeFlexBudgetActuals([draftRecord], [plan], []);
      if (!record) return fail('The recording could not be stored exactly as read. Nothing was saved.');
      const final = asOf === plan.periodTo;
      const probe = computeFlexStatement(
        { volumeE3: plan.volumeE3, lines: plan.lines },
        { volumeE3: record.volumeE3, final, lines: record.lines, unplanned: record.unplanned },
      );
      if (!probe.ok) return fail('These figures lie outside the range this register computes exactly. Nothing was saved.', 'linesText');
      if (!probe.balances) return fail('The statement these figures produce does not re-add from its printed cents. That is a defect in this register, not in your figures; nothing was saved.', 'linesText');
      const superseded = flexCurrentActual(liveActuals(livePlans()), plan.id);
      store.update((draft) => {
        draft.flexBudgetActuals = Array.isArray(draft.flexBudgetActuals) ? draft.flexBudgetActuals : [];
        draft.flexBudgetActuals.push(record);
      }, {
        type: FLEX_BUDGET_EVENTS.ACTUALS_RECORDED,
        entity: 'flexBudgetActual',
        entityId: record.id,
        summary: `Flexible-budget actuals recorded on ${check.today}: ${final ? 'final' : 'interim'} to ${asOf}, ${record.lines.length} line(s)${record.unplanned.length ? `, ${record.unplanned.length} unplanned` : ''}${superseded ? ', superseding an earlier recording' : ''}.`.slice(0, 300),
      });
      return saved({ actualId: record.id, planId: plan.id, final, via, supersededId: superseded ? superseded.id : null });
    },

    /** Withdraw a recording. The row stays; the statement falls back to the one before it. */
    flexBudgetWithdrawActuals(input = {}) {
      const check = seatFor(FLEX_BUDGET_RIGHTS.RECORD);
      if (!check.ok) return check;
      const actualId = text(input.actualId, 120);
      const plans = livePlans();
      const actual = liveActuals(plans).find((row) => row.id === actualId) || null;
      if (!actual) return fail('That recording is not on the record.', 'actualId');
      if (actual.withdrawnOn) return fail(`That recording was already withdrawn on ${actual.withdrawnOn}.`, 'actualId');
      const plan = plans.find((row) => row.id === actual.planId);
      if (actual.recordedById !== check.actorId && !reachOf(check, plan.ownerId)) {
        return fail('A recording is withdrawn by the person who recorded it or by a seat that holds the budget holder. This seat is neither.', 'actualId');
      }
      const reason = flexReason(input.reason);
      if (!reason) return fail(`Write why this recording is withdrawn (at least ${L.reasonMin} characters) — the wrong extract, a late posting, a mis-keyed line.`, 'reason');
      const [record] = normalizeFlexBudgetActuals([{ ...actual, withdrawnOn: check.today, withdrawnById: check.actorId, withdrawReason: reason }], [plan], []);
      if (!record) return fail('The withdrawal could not be stored exactly as read. Nothing was saved.');
      store.update((draft) => {
        const index = (draft.flexBudgetActuals || []).findIndex((row) => row && row.id === actualId);
        if (index >= 0) draft.flexBudgetActuals[index] = record;
      }, {
        type: FLEX_BUDGET_EVENTS.ACTUALS_WITHDRAWN,
        entity: 'flexBudgetActual',
        entityId: actualId,
        summary: `Flexible-budget actuals withdrawn on ${check.today} (${reason.slice(0, 160)}).`.slice(0, 300),
      });
      return saved({ actualId, planId: plan.id });
    },

    /** Set the conventions. A value outside its declared bounds is REFUSED, never clamped. */
    flexBudgetSetConventions(patch = {}) {
      const check = seatFor(FLEX_BUDGET_RIGHTS.GOVERN);
      if (!check.ok) return check;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return fail('Variance-statement conventions must be supplied as a plain object. Nothing was saved.', 'settings');
      const names = new Map(Object.entries(FLEX_BUDGET_SETTING_KEYS).map(([name, key]) => [key, name]));
      const keys = Object.keys(patch);
      if (!keys.length) return fail('State at least one convention to update. Nothing was saved.', 'settings');
      for (const key of keys) {
        const name = names.get(key);
        if (!name) return fail(`“${key}” is not a declared variance-statement convention. Nothing was saved.`, key);
        const [min, max] = FLEX_BUDGET_BOUNDS[name];
        if (!Number.isInteger(patch[key]) || patch[key] < min || patch[key] > max) {
          return fail(`${FLEX_BUDGET_SETTING_LABELS[name]} must be a whole number from ${min} to ${max}. Nothing was clamped and nothing was saved.`, key);
        }
      }
      const next = normalizeFlexBudgetSettings({ ...settings(), ...patch });
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: FLEX_BUDGET_EVENTS.CONVENTIONS,
        entity: 'settings',
        entityId: 'flexBudget',
        summary: `Variance-statement conventions set: ${keys.map((key) => `${key}=${patch[key]}`).join(', ')}.`.slice(0, 300),
      });
      return saved({ conventions: next });
    },
  };
}
