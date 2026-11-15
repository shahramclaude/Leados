/**
 * app/core/domain/incentiveActions.js — the seat-checked commands of the
 * Variable-Pay Design & Incentive Integrity Register (ADR-0220).
 *
 * Six human acts and a scan, and nothing else: DECLARE a plan, ADD a measure,
 * RETIRE a plan, RECORD a verified reading, RECORD an award, RECORD a recovery,
 * and SCAN. Every figure, verdict, contest, gap and count is re-derived on read
 * by `incentiveIntegrity.js`; nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - A funding line designs only its own plans: the owner named must be held by
 *    the acting seat, so one line never writes another line's envelope.
 *  - An amount is converted from major units exactly once, in integer
 *    arithmetic. A third decimal place is a different amount and is refused,
 *    not rounded. A count and an amount never share a field.
 *  - A VERIFIED READING IS NOT THE FUNDING LINE'S TO WRITE. The verifier must be
 *    a seat ABOVE the plan's owner on the live matrix, may not be the owner, and
 *    may not be a person who receives an award resting on that measure — the
 *    hand that benefits does not confirm the number.
 *  - A MEASURED AWARD WITHOUT A VERIFIED READING IS REFUSED. The door looks up
 *    the reading in force on the decision day and applies the same verifier
 *    standing test the reader applies, so an award cannot be recorded that the
 *    screen would have to print as unverified.
 *  - An award for yourself is refused; so is an award for a person the acting
 *    seat does not hold.
 *  - THE DOOR DOES NOT REFUSE AN EXPENSIVE AWARD. A register that blocks a
 *    payment the organisation has made pushes the money off the record, which is
 *    the failure it exists to prevent. An award that takes a plan over its
 *    ceiling is recorded and printed as `over-ceiling`, and `RULE-INC-01` asks
 *    the seat above the funding line for the decision.
 *  - A recovery is an executive act with a state and a written reason. It is
 *    recorded, never executed, and it may never exceed the money it recovers.
 *  - Every write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused now.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import {
  buildIncentiveIntegrity,
  incSumCents,
  incentiveAttentionCount,
  incentiveCandidates,
  incentiveMatrix,
  readingInForce,
  verifierStanding,
} from './incentiveIntegrity.js';
import {
  normalizeIncAwards,
  normalizeIncMeasures,
  normalizeIncPlans,
  normalizeIncReadings,
  normalizeIncRecoveries,
  incCurrency,
  incDay,
  incDaysBetween,
  incText,
  parseCountInput,
  parseMoneyInputToCents,
} from './incentiveSchema.js';
import {
  INC_BASIS_KEYS,
  INC_CONTROL_KEYS,
  INC_DIRECTION_KEYS,
  INC_EVENTS,
  INC_LIMITS as L,
  INC_RECOVERY_KIND_KEYS,
  INC_RECOVERY_STATE_KEYS,
  INC_REFUSALS,
  INC_RIGHTS,
  INC_ROUTE,
  INC_RULE_ID,
  INC_UNIT_KEYS,
  incMeasureKey,
} from './incentiveRegistry.js';

const REFUSAL = (key) => `incentive:${key}`;

/** The closed evidence list a reading may cite. A free-text kind makes the
 * reference unauditable, so the list is closed and the id is required. */
const EVIDENCE_KINDS = Object.freeze(['case', 'decision', 'goal', 'review', 'document']);

export function createIncentiveActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);
  const saved = (extra = {}) => ({ ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [], ok: true });

  function seatFor(right) {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(INC_REFUSALS.notSeated);
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg, actorId: seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null), today: dayKey(at) };
  }

  function readSeat() {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    return { seat: activeSeat(built), at, cfg };
  }

  /**
   * A read is REGISTERED as safe and therefore bypasses the gateway's rank
   * check — so the right is re-proved HERE. Without this, a seat the record
   * class denies could read the register: the module would vanish from the gate
   * exactly where the gate matters most.
   */
  function readCheck() {
    const resolved = readSeat();
    if (resolved.seat.readOnly) return fail(INC_REFUSALS.notSeated);
    const verdict = canAct(INC_RIGHTS.READ, resolved.seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, ...resolved };
  }

  function graph(check) {
    try {
      return { ok: true, matrix: incentiveMatrix(store.state, check.at, check.cfg) };
    } catch (error) {
      return fail(`The reporting graph could not be read, so the funding line cannot be proved. Nothing was saved. (${error?.message || 'unknown error'})`, null, REFUSAL('graph-unreadable'));
    }
  }

  /** Does the acting seat hold this person (span, declared line, or itself)? */
  function holdsPerson(check, personId) {
    if (!personId) return false;
    if (check.seat.fullAccess) return true;
    const nodeId = check.seat.nodeId || check.seat.id || null;
    if (personId === nodeId) return true;
    if (check.seat.scope?.has?.(personId)) return true;
    if (check.seat.lineScope?.has?.(personId)) return true;
    return false;
  }

  /** The plan a command names, proved live and held by the acting seat. */
  function planContext(check, planId, { requireLive = true } = {}) {
    const id = incText(planId, L.idMax);
    if (!id) return fail('Name the plan this belongs to.', 'planId');
    const loaded = normalizeIncPlans(rows('incentivePlans'), []);
    const plan = loaded.find((row) => row.id === id) || null;
    if (!plan) return fail(INC_REFUSALS.notFound, 'planId', REFUSAL('plan-not-found'));
    if (!holdsPerson(check, plan.ownerId)) {
      return fail('This seat neither holds this plan’s funding line nor is that line. One line does not write another line’s envelope.', 'planId', REFUSAL('not-your-line'));
    }
    if (requireLive && plan.retiredOn) return fail(INC_REFUSALS.retired, 'planId', REFUSAL('plan-retired'));
    return { ok: true, plan, loaded };
  }

  function dayNotFuture(check, value, field, fallback) {
    const day = value === undefined || value === null || value === '' ? fallback : incDay(value);
    if (!day) return { error: fail('Give a real calendar day.', field, REFUSAL('day-invalid')) };
    if (day > check.today) return { error: fail('That day is in the future. The register records what has been declared and decided, not what will be.', field, REFUSAL('day-future')) };
    return { day };
  }

  return {
    /* ------------------------------------------------------------------ plans */

    /**
     * Declare one funding line's envelope: a label, a currency, an exact
     * ceiling, a window and a written basis.
     */
    incentiveDeclarePlan(input = {}) {
      const check = seatFor(INC_RIGHTS.DESIGN);
      if (!check.ok) return check;
      const label = incText(input.label, L.labelMax);
      if (label.length < L.labelMin) return fail('Name the plan in at least three characters: what is this envelope for?', 'label', REFUSAL('label-invalid'));
      const ownerId = incText(input.ownerId, L.idMax) || check.actorId;
      if (!holdsPerson(check, ownerId)) {
        return fail('A plan is declared for a funding line this seat holds. Name a line of your own or one below you.', 'ownerId', REFUSAL('not-your-line'));
      }
      const currency = incCurrency(input.currency);
      if (!currency) return fail('Name the currency this envelope is declared in, as a three-letter code. The register never assumes one and never converts.', 'currency', REFUSAL('currency-invalid'));
      const ceilingCents = parseMoneyInputToCents(input.ceiling);
      if (ceilingCents === null || ceilingCents <= 0) {
        return fail('Give the ceiling in major units with at most two decimal places (for example 250000.00). No sign, comma or exponent is accepted, and a third decimal place is not rounded.', 'ceiling', REFUSAL('ceiling-invalid'));
      }
      const periodFrom = incDay(input.periodFrom);
      const periodTo = incDay(input.periodTo);
      if (!periodFrom || !periodTo || periodTo <= periodFrom) {
        return fail('Give a real window: the first day and the last day, with the last day after the first.', 'periodFrom', REFUSAL('period-invalid'));
      }
      const spanDays = incDaysBetween(periodFrom, periodTo);
      if (spanDays === null || spanDays > L.periodMaxDays) {
        return fail(`A plan window may not exceed ${L.periodMaxDays} days. A long-running envelope is declared again for the next period, so each ceiling has an owner and a review.`, 'periodTo', REFUSAL('period-too-long'));
      }
      const startAhead = incDaysBetween(check.today, periodFrom);
      if (startAhead !== null && startAhead > L.periodStartMaxDaysAhead) {
        return fail('That window starts too far in the future to be a plan this workspace is funding.', 'periodFrom', REFUSAL('period-too-far'));
      }
      const basis = incText(input.basis, L.textMax);
      if (basis.length < L.textMin) return fail('Write the basis for this envelope in at least a sentence: what it is for, and how this ceiling was sized.', 'basis', REFUSAL('basis-missing'));
      const declared = dayNotFuture(check, input.declaredOn, 'declaredOn', check.today);
      if (declared.error) return declared.error;

      const existing = normalizeIncPlans(rows('incentivePlans'), []);
      if (existing.length >= L.plans) return fail('The plan ledger is full. Nothing was saved.', null, REFUSAL('ledger-full'));
      const clash = existing.some((row) => row.retiredOn === null
        && row.ownerId === ownerId
        && row.currency === currency
        && row.periodFrom <= periodTo && periodFrom <= row.periodTo);
      if (clash) {
        return fail('This funding line already has a live envelope in this currency overlapping that window. Two envelopes over one period make every ceiling claim ambiguous; retire the current plan first, or declare a window that does not overlap.', 'periodFrom', REFUSAL('overlapping-plan'));
      }
      const id = idFactory('inp');
      const row = {
        id, label, ownerId, currency, ceilingCents,
        periodFrom, periodTo, declaredOn: declared.day,
        declaredById: check.actorId, basis,
        retiredOn: null, retiredById: '', retirementReason: '',
      };
      const loaded = normalizeIncPlans([...rows('incentivePlans'), row], []);
      const stored = loaded.find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The plan could not be stored as a row this register can read back. Nothing was saved.', 'ceiling', REFUSAL('unreadable'));
      store.update((draft) => {
        draft.incentivePlans = Array.isArray(draft.incentivePlans) ? draft.incentivePlans : [];
        draft.incentivePlans.push(stored);
      }, {
        type: INC_EVENTS.PLAN_DECLARED,
        entity: 'incentivePlan',
        entityId: id,
        summary: `Variable-pay plan declared in ${currency} for ${periodFrom} → ${periodTo}.`.slice(0, 300),
      });
      return saved({ planId: id });
    },

    /** Retire a live plan. Retirement is final; a new envelope is declared instead. */
    incentiveRetirePlan(input = {}) {
      const check = seatFor(INC_RIGHTS.DESIGN);
      if (!check.ok) return check;
      const ctx = planContext(check, input.planId);
      if (!ctx.ok) return ctx;
      const reason = incText(input.reason, L.textMax);
      if (reason.length < L.textMin) return fail('Say why the envelope is being retired, in at least a sentence. A closed plan with no reason is one nobody can audit.', 'reason', REFUSAL('reason-missing'));
      const on = dayNotFuture(check, input.on, 'on', check.today);
      if (on.error) return on.error;
      if (on.day < ctx.plan.declaredOn) return fail('A plan cannot be retired before it was declared.', 'on', REFUSAL('retire-before-declare'));
      const planId = ctx.plan.id;
      store.update((draft) => {
        const list = Array.isArray(draft.incentivePlans) ? draft.incentivePlans : [];
        const row = list.find((candidate) => candidate && candidate.id === planId);
        if (row) {
          row.retiredOn = on.day;
          row.retiredById = check.actorId;
          row.retirementReason = reason;
        }
      }, {
        type: INC_EVENTS.PLAN_RETIRED,
        entity: 'incentivePlan',
        entityId: planId,
        summary: `Variable-pay plan retired on ${on.day}. Its awards and history stay on the record; it cannot be revived.`.slice(0, 300),
      });
      return saved({ planId, retiredOn: on.day });
    },

    /* --------------------------------------------------------------- measures */

    /**
     * Add one measure to a live plan: the outcome key, the direction, the unit,
     * the exact target and the declared control.
     */
    incentiveAddMeasure(input = {}) {
      const check = seatFor(INC_RIGHTS.DESIGN);
      if (!check.ok) return check;
      const ctx = planContext(check, input.planId);
      if (!ctx.ok) return ctx;
      const key = incMeasureKey(input.key);
      if (!key) return fail('Give the measure a key of lower-case letters, digits and hyphens (for example ebit-contribution). The key is how the register recognises the SAME outcome paid by two plans.', 'key', REFUSAL('key-invalid'));
      const label = incText(input.label, L.labelMax);
      if (label.length < L.labelMin) return fail('Name the measure in at least three characters.', 'label', REFUSAL('label-invalid'));
      const direction = INC_DIRECTION_KEYS.includes(input.direction) ? input.direction : null;
      if (!direction) return fail('State the direction: higher is better, or lower is better.', 'direction', REFUSAL('direction-invalid'));
      const unit = INC_UNIT_KEYS.includes(input.unit) ? input.unit : null;
      if (!unit) return fail('State the unit: money in the plan’s currency, or a whole count.', 'unit', REFUSAL('unit-invalid'));
      const control = INC_CONTROL_KEYS.includes(input.control) ? input.control : null;
      if (!control) return fail('State who controls the measure: the awardee’s own work, the funding line, or outside the line. The register prints this beside every award and never infers it.', 'control', REFUSAL('control-invalid'));

      const money = unit === 'money';
      const targetCents = money ? parseMoneyInputToCents(input.target) : null;
      const targetCount = money ? null : parseCountInput(input.target);
      if (money ? (targetCents === null || targetCents <= 0) : (targetCount === null || targetCount <= 0)) {
        return fail(money
          ? 'Give the target in major units of the plan’s currency with at most two decimal places. A target of zero is not a target.'
          : 'Give the target as a whole number of units.', 'target', REFUSAL('target-invalid'));
      }

      const existing = normalizeIncMeasures(rows('incentiveMeasures'), []);
      const forPlan = existing.filter((row) => row.planId === ctx.plan.id);
      if (forPlan.length >= L.measuresPerPlan) return fail(`A plan carries at most ${L.measuresPerPlan} measures. A plan with more than that is a scorecard nobody reads.`, null, REFUSAL('too-many-measures'));
      if (forPlan.some((row) => row.key === key)) {
        return fail('This plan already declares that outcome key. One key per plan: two measures with one key inside a plan make the "paid on this outcome" count a matter of which row was read.', 'key', REFUSAL('duplicate-key'));
      }
      const id = idFactory('inm');
      const row = {
        id, planId: ctx.plan.id, key, label, direction, unit,
        targetCents, targetCount, control,
      };
      const loaded = normalizeIncMeasures([...rows('incentiveMeasures'), row], []);
      const stored = loaded.find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The measure could not be stored as a row this register can read back. Nothing was saved.', 'target', REFUSAL('unreadable'));
      store.update((draft) => {
        draft.incentiveMeasures = Array.isArray(draft.incentiveMeasures) ? draft.incentiveMeasures : [];
        draft.incentiveMeasures.push(stored);
      }, {
        type: INC_EVENTS.MEASURE_ADDED,
        entity: 'incentiveMeasure',
        entityId: id,
        summary: `Measure “${key}” added to plan ${ctx.plan.id} (${direction}, ${unit}, control ${control}).`.slice(0, 300),
      });
      return saved({ measureId: id });
    },

    /* --------------------------------------------------------------- readings */

    /**
     * Record a VERIFIED reading for one measure. The verifier must be above the
     * plan's owner, must not be the owner, and must not benefit from any award
     * resting on this measure.
     */
    incentiveRecordReading(input = {}) {
      const check = seatFor(INC_RIGHTS.VERIFY);
      if (!check.ok) return check;
      const measureId = incText(input.measureId, L.idMax);
      if (!measureId) return fail('Name the measure this reading belongs to.', 'measureId');
      const measures = normalizeIncMeasures(rows('incentiveMeasures'), []);
      const measure = measures.find((row) => row.id === measureId) || null;
      if (!measure) return fail(INC_REFUSALS.notFound, 'measureId', REFUSAL('measure-not-found'));
      const planCtx = planContext(check, measure.planId, { requireLive: false });
      if (!planCtx.ok) return planCtx;
      const plan = planCtx.plan;
      const g = graph(check);
      if (!g.ok) return g;

      // The verifier is proved against the live graph: above the funding line,
      // never the owner themselves.
      if (!check.seat.fullAccess) {
        if (check.actorId === plan.ownerId) {
          return fail('The funding line does not verify its own number. A seat above this plan records the reading.', 'measureId', REFUSAL('self-verification'));
        }
        const above = g.matrix.nodes?.get?.(plan.ownerId)?.ancestors;
        if (!above || !above.has(check.actorId)) {
          return fail('This seat is not above the plan’s funding line, so it cannot verify the line’s own measure. One line does not verify another line’s number.', 'measureId', REFUSAL('not-above-owner'));
        }
      }
      // A person who receives an award resting on this measure may not verify it.
      const beneficiaries = normalizeIncAwards(rows('incentiveAwards'), []).filter((row) => row.measureId === measure.id);
      if (beneficiaries.some((row) => row.personId === check.actorId)) {
        return fail('This seat receives an award that rests on this measure, so it cannot verify the number. The hand that benefits does not confirm the figure.', 'measureId', REFUSAL('beneficiary-verifier'));
      }

      const money = measure.unit === 'money';
      const actualCents = money ? parseMoneyInputToCents(input.actual) : null;
      const actualCount = money ? null : parseCountInput(input.actual);
      if (money ? actualCents === null : actualCount === null) {
        return fail(money
          ? 'Give the actual figure in major units of the plan’s currency with at most two decimal places. Nothing is rounded.'
          : 'Give the actual figure as a whole number of units.', 'actual', REFUSAL('actual-invalid'));
      }
      const asOf = incDay(input.asOf);
      if (!asOf) return fail('Give the day the figure is measured for.', 'asOf', REFUSAL('day-invalid'));
      if (asOf > check.today) return fail('A reading cannot be dated in the future.', 'asOf', REFUSAL('day-future'));
      if (asOf < plan.periodFrom) {
        return fail('That day is before the plan’s window opens, so the figure is not evidence for this envelope.', 'asOf', REFUSAL('before-period'));
      }
      const evidenceKind = EVIDENCE_KINDS.includes(input.evidenceKind) ? input.evidenceKind : null;
      if (!evidenceKind) return fail('Name the kind of evidence behind the figure: case, decision, goal, review or document.', 'evidenceKind', REFUSAL('evidence-invalid'));
      const evidenceId = incText(input.evidenceId, L.idMax);
      if (!evidenceId) return fail('Name the record the figure comes from. A number with no reference cannot be audited later.', 'evidenceId', REFUSAL('evidence-missing'));
      const note = incText(input.note, L.textMax);

      const existing = normalizeIncReadings(rows('incentiveReadings'), measures, []);
      const forMeasure = existing.filter((row) => row.measureId === measure.id);
      if (existing.length >= L.readings) return fail('The reading ledger is full. Nothing was saved.', null, REFUSAL('ledger-full'));

      // A restatement names the reading it replaces and says why. It is dated on
      // or after the reading it replaces, never before.
      const restatesIdRaw = input.restatesId === undefined || input.restatesId === null ? '' : incText(input.restatesId, L.idMax);
      let restatesId = '';
      let restatementReason = '';
      if (restatesIdRaw) {
        const target = forMeasure.find((row) => row.id === restatesIdRaw) || null;
        if (!target) return fail('A restatement names an earlier reading of this same measure. That reading is not on this measure’s record.', 'restatesId', REFUSAL('restates-not-found'));
        if (asOf < target.asOf) return fail('A restatement cannot be dated before the reading it replaces.', 'asOf', REFUSAL('restates-after'));
        restatementReason = incText(input.restatementReason, L.textMax);
        if (restatementReason.length < L.textMin) return fail('Say why the figure is being restated, in at least a sentence. A restatement with no reason cannot be told apart from a correction nobody explained.', 'restatementReason', REFUSAL('restatement-reason-missing'));
        restatesId = restatesIdRaw;
      } else if (incText(input.restatementReason, L.textMax)) {
        return fail('A restatement reason needs the reading it restates. Choose the earlier reading, or remove the reason.', 'restatesId', REFUSAL('restates-missing'));
      }

      const id = idFactory('inr');
      const row = {
        id, measureId: measure.id, actualCents, actualCount, asOf,
        verifiedById: check.actorId, verifiedOn: check.today,
        evidenceKind, evidenceId, note, restatesId, restatementReason,
      };
      const loaded = normalizeIncReadings([...rows('incentiveReadings'), row], measures, []);
      const stored = loaded.find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The reading could not be stored as a row this register can read back. Nothing was saved.', 'actual', REFUSAL('unreadable'));
      store.update((draft) => {
        draft.incentiveReadings = Array.isArray(draft.incentiveReadings) ? draft.incentiveReadings : [];
        draft.incentiveReadings.push(stored);
      }, {
        type: INC_EVENTS.READING_RECORDED,
        entity: 'incentiveReading',
        entityId: id,
        summary: `Verified reading recorded for measure “${measure.key}” on ${asOf}${restatesId ? ' (restatement)' : ''}.`.slice(0, 300),
      });
      return saved({ readingId: id });
    },

    /* ----------------------------------------------------------------- awards */

    /**
     * Record money awarded to one person under one plan, on a measured or a
     * written discretionary basis.
     */
    incentiveRecordAward(input = {}) {
      const check = seatFor(INC_RIGHTS.AWARD);
      if (!check.ok) return check;
      const ctx = planContext(check, input.planId);
      if (!ctx.ok) return ctx;
      const plan = ctx.plan;
      const personId = incText(input.personId, L.idMax);
      if (!personId) return fail('Name the person this award is for.', 'personId');
      if (personId === check.actorId) {
        return fail('An award for yourself is refused. A manager’s own pay is decided on the line above, not by the hand that receives it.', 'personId', REFUSAL('self-award'));
      }
      if (!holdsPerson(check, personId)) {
        return fail('This seat does not hold that person on any declared line, so it cannot award them money. One line does not pay another line’s people.', 'personId', REFUSAL('not-your-line'));
      }
      const amountCents = parseMoneyInputToCents(input.amount);
      if (amountCents === null || amountCents <= 0) {
        return fail('Give the award in major units of the plan’s currency with at most two decimal places. Nothing is rounded.', 'amount', REFUSAL('amount-invalid'));
      }
      const basisKind = INC_BASIS_KEYS.includes(input.basisKind) ? input.basisKind : null;
      if (!basisKind) return fail('State the basis: measured, or discretionary with a written reason.', 'basisKind', REFUSAL('basis-invalid'));
      const decided = dayNotFuture(check, input.decidedOn, 'decidedOn', check.today);
      if (decided.error) return decided.error;
      if (decided.day < plan.periodFrom) {
        return fail('That day is before the plan’s window opens. An award decided before the envelope existed has no ceiling behind it.', 'decidedOn', REFUSAL('before-period'));
      }
      const rationale = incText(input.rationale, L.textMax);

      const measures = normalizeIncMeasures(rows('incentiveMeasures'), []);
      const awards = normalizeIncAwards(rows('incentiveAwards'), []);
      let measureId = null;
      if (basisKind === 'measured') {
        measureId = incText(input.measureId, L.idMax);
        if (!measureId) return fail('A measured award names its measure. Without one it is not measured.', 'measureId', REFUSAL('measure-missing'));
        const measure = measures.find((row) => row.id === measureId) || null;
        if (!measure || measure.planId !== plan.id) {
          return fail('That measure is not on this plan, so it cannot stand behind an award paid by this plan.', 'measureId', REFUSAL('measure-not-on-plan'));
        }
        const g = graph(check);
        if (!g.ok) return g;
        const readings = normalizeIncReadings(rows('incentiveReadings'), measures, [])
          .filter((row) => row.measureId === measure.id);
        const basis = readingInForce(readings, decided.day);
        if (!basis) {
          return fail('No verified reading stands on or before that decision day, so a measured award cannot be recorded. Record the reading first, or record the award as discretionary with a written reason.', 'measureId', REFUSAL('no-verified-reading'));
        }
        const standing = verifierStanding(g.matrix, plan, basis);
        if (!standing.ok) {
          return fail(`The reading in force was not verified by a seat above this plan’s funding line (${standing.reason}), so it cannot stand behind a measured award. Record a verified reading first.`, 'measureId', REFUSAL('unverified-reading'));
        }
      } else {
        if (rationale.length < L.textMin) {
          return fail('A discretionary award needs a written reason of at least a sentence. Discretion is legitimate; unexplained discretion is not auditable.', 'rationale', REFUSAL('rationale-missing'));
        }
        measureId = input.measureId === undefined || input.measureId === null || input.measureId === '' ? null : incText(input.measureId, L.idMax);
        if (measureId) {
          const measure = measures.find((row) => row.id === measureId) || null;
          if (!measure || measure.planId !== plan.id) {
            return fail('That measure is not on this plan. Leave the measure empty for pure discretion, or name one of this plan’s measures.', 'measureId', REFUSAL('measure-not-on-plan'));
          }
        }
      }
      if (awards.length >= L.awards) return fail('The award ledger is full. Nothing was saved.', null, REFUSAL('ledger-full'));

      const id = idFactory('ina');
      const row = {
        id, planId: plan.id, measureId, personId, amountCents,
        basisKind, rationale, decidedOn: decided.day, decidedById: check.actorId,
      };
      const loaded = normalizeIncAwards([...rows('incentiveAwards'), row], []);
      const stored = loaded.find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The award could not be stored as a row this register can read back. Nothing was saved.', 'amount', REFUSAL('unreadable'));
      store.update((draft) => {
        draft.incentiveAwards = Array.isArray(draft.incentiveAwards) ? draft.incentiveAwards : [];
        draft.incentiveAwards.push(stored);
      }, {
        type: INC_EVENTS.AWARD_RECORDED,
        entity: 'incentiveAward',
        entityId: id,
        summary: `Award recorded under plan ${plan.id} on a ${basisKind} basis, decided ${decided.day}.`.slice(0, 300),
      });
      return saved({ awardId: id });
    },

    /* -------------------------------------------------------------- recoveries */

    /**
     * Record a recovery act against an award: demanded, recovered or waived,
     * with a written reason. Nothing is deducted or reversed by the register.
     */
    incentiveRecordRecovery(input = {}) {
      const check = seatFor(INC_RIGHTS.RECOVER);
      if (!check.ok) return check;
      const awardId = incText(input.awardId, L.idMax);
      if (!awardId) return fail('Name the award this recovery belongs to.', 'awardId');
      const awards = normalizeIncAwards(rows('incentiveAwards'), []);
      const award = awards.find((row) => row.id === awardId) || null;
      if (!award) return fail(INC_REFUSALS.notFound, 'awardId', REFUSAL('award-not-found'));
      const ctx = planContext(check, award.planId, { requireLive: false });
      if (!ctx.ok) return ctx;
      const kind = INC_RECOVERY_KIND_KEYS.includes(input.kind) ? input.kind : null;
      if (!kind) return fail('State whether this is a clawback (money already paid) or a malus (money withheld).', 'kind', REFUSAL('kind-invalid'));
      const state = INC_RECOVERY_STATE_KEYS.includes(input.state) ? input.state : null;
      if (!state) return fail('State what is being recorded: demanded, recovered or waived.', 'state', REFUSAL('state-invalid'));
      const amountCents = parseMoneyInputToCents(input.amount);
      if (amountCents === null || amountCents <= 0) {
        return fail('Give the amount in major units with at most two decimal places. A recovery of nothing is not a recovery.', 'amount', REFUSAL('amount-invalid'));
      }
      const reason = incText(input.reason, L.textMax);
      if (reason.length < L.textMin) return fail('Say why the money is being recovered, withheld or waived, in at least a sentence.', 'reason', REFUSAL('reason-missing'));
      const on = dayNotFuture(check, input.on, 'on', check.today);
      if (on.error) return on.error;
      if (on.day < award.decidedOn) return fail('A recovery cannot be dated before the award it concerns.', 'on', REFUSAL('recovery-before-award'));

      const existing = normalizeIncRecoveries(rows('incentiveRecoveries'), []);
      const prior = existing.filter((row) => row.awardId === award.id);
      const recovered = incSumCents(prior.filter((row) => row.state === 'recovered').map((row) => row.amountCents));
      const waived = incSumCents(prior.filter((row) => row.state === 'waived').map((row) => row.amountCents));
      if (recovered === null || waived === null) {
        return fail('The recorded recoveries for this award do not sum to a figure this register can hold exactly, so nothing further may be recorded against it.', 'amount', REFUSAL('recovery-sum-unreadable'));
      }
      if (state === 'recovered' && recovered + amountCents > award.amountCents) {
        return fail('That would recover more than the award. The register never takes back more money than was given.', 'amount', REFUSAL('over-recovery'));
      }
      if (state === 'waived' && recovered + waived + amountCents > award.amountCents) {
        return fail('That waiver plus what is already recovered or waived exceeds the award.', 'amount', REFUSAL('over-waiver'));
      }

      const id = idFactory('inrc');
      const row = { id, awardId: award.id, kind, state, amountCents, on: on.day, byId: check.actorId, reason };
      const loaded = normalizeIncRecoveries([...rows('incentiveRecoveries'), row], []);
      const stored = loaded.find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The recovery could not be stored as a row this register can read back. Nothing was saved.', 'amount', REFUSAL('unreadable'));
      store.update((draft) => {
        draft.incentiveRecoveries = Array.isArray(draft.incentiveRecoveries) ? draft.incentiveRecoveries : [];
        draft.incentiveRecoveries.push(stored);
      }, {
        type: INC_EVENTS.RECOVERY_RECORDED,
        entity: 'incentiveRecovery',
        entityId: id,
        summary: `Recovery ${state} recorded against an award, effective ${on.day}.`.slice(0, 300),
      });
      return saved({ recoveryId: id });
    },

    /* ------------------------------------------------------------------- scan */

    /** Run the rule now. The pause governs this path exactly as it governs a commit. */
    incentiveScan() {
      const check = seatFor(INC_RIGHTS.DESIGN);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: INC_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: `${INC_ROUTE}#${INC_RULE_ID}`,
        summary: `Incentive integrity scan requested (${INC_RULE_ID}): over-ceiling plans, contested outcomes, outstanding recoveries and unmeasured plans re-read from the record.`,
      });
      return saved({ propagations: store.lastPropagations || [] });
    },

    /* ------------------------------------------------------------------ reads */

    incentiveReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return buildIncentiveIntegrity(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
    },

    incentiveAttentionCount() {
      const { seat, at, cfg } = readSeat();
      return incentiveAttentionCount(store.state, { now: at, settings: cfg, seat });
    },

    incentiveCandidates() {
      const check = readCheck();
      if (!check.ok) return check;
      return incentiveCandidates(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
    },
  };
}

export { EVIDENCE_KINDS };
