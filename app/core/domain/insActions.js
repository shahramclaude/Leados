/**
 * app/core/domain/insActions.js — the seat-checked commands of the Insurance
 * Notification & Recovery Register (ADR-0249).
 *
 * SIX human acts and a scan: DECLARE a policy, DECLARE a coverage, RECORD a
 * notification, RECORD a recovery, re-declare the conventions — plus the explicit
 * scan. Every state, deadline, day count, cover verdict, recovery total and net
 * cost is re-derived on read by `insCoverage.js`; nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - A POLICY carries the written reference on the declaration page, the insurer,
 *    the class, the basis, the period, the limit, the deductible, the declared
 *    notification window in whole days, a currency and one to four responsible
 *    hands. A policy nobody can trace to a document is refused, because that is
 *    exactly the cover that is discovered to have lapsed at renewal.
 *  - THE SAME POLICY REFERENCE CANNOT BE DECLARED TWICE while the first is live.
 *    Two live records of one policy is how a notification deadline gets computed
 *    against the wrong window.
 *  - A COVERAGE links a matter to a policy, one per (matter, policy) pair, with
 *    a written basis. The cover TEST (trigger day against period) is the reader's
 *    job, not the door's: a link the period does not support is stored and
 *    prints `no-cover`, because the link is a fact about what somebody believed.
 *  - A NOTIFICATION is one per coverage, with its day, its method and its
 *    reference. A notification recorded after the derived deadline is KEPT — it
 *    is a breach fact, and the reader prints `notification-late` with the exact
 *    days it ran over. The door never refuses a late notification, because the
 *    breach is the record.
 *  - A RECOVERY carries its kind, its day and its written basis; a kind that
 *    moves money or opens a claim must carry an exact integer minor-unit amount.
 *    A fractional amount is refused rather than rounded into a total. A DENIAL
 *    carries no amount — it is the refusal, and the reason is the basis.
 *  - Every write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused now.
 *
 * WHAT NO COMMAND CAN DO. There is no command that sets a state, writes a
 * deadline, writes a days-remaining figure, marks a notification in time without
 * its day, treats an unnotified coverage as notified, approves a recovery the
 * insurer denied, extends a notification window after the fact, or scores a
 * person, a line, a broker or a claims handler.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import { buildInsurance, insuranceAttentionCount } from './insCoverage.js';
import {
  INS_BOUNDS,
  INS_EVENTS,
  INS_LIMITS as L,
  INS_NOTIFICATION_METHOD_KEYS,
  INS_POLICY_BASIS_BY_KEY,
  INS_POLICY_CLASS_BY_KEY,
  INS_POLICY_CLASS_KEYS,
  INS_RECOVERY_KIND_BY_KEY,
  INS_RECOVERY_KIND_KEYS,
  INS_REFUSALS,
  INS_RIGHTS,
  INS_ROUTE,
  INS_SETTING_KEYS,
} from './insRegistry.js';
import {
  insCurrency,
  insDayKey,
  insHolders,
  insInstrument,
  insReason,
  insShort,
  insWindowDays,
  normalizeInsCoverages,
  normalizeInsNotifications,
  normalizeInsPolicies,
  normalizeInsRecoveries,
  normalizeInsSettings,
} from './insSchema.js';
import { instantMs, minorUnits } from './insMath.js';

const REFUSAL = (key) => `insurance:${key}`;
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function createInsuranceActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);

  /**
   * A write result. The caller's own warning is MERGED with the persist error,
   * never overwritten by it — a late notification recorded, or a coverage stored
   * with an unreadable child, must not lose its message on a clean persist.
   */
  const saved = (extra = {}) => {
    const { warning: ownWarning, ...rest } = extra;
    const persistError = store.persistError || null;
    const warning = ownWarning && persistError ? `${ownWarning} ${persistError}` : (ownWarning || persistError);
    return { ...rest, saved: !persistError, warning, propagations: store.lastPropagations || [], ok: true };
  };

  function seatFor(right) {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(INS_REFUSALS.notSeated);
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg, actorId: seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null), today: dayKey(at) };
  }

  /**
   * A read is REGISTERED as safe and therefore bypasses the gateway's rank check —
   * so the right is re-proved HERE, exactly as every register in this workspace
   * re-proves it. Without this, which insurer covers us and what we recovered
   * would be readable by a seat the record class denies.
   */
  function readCheck() {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(INS_REFUSALS.notSeated);
    const verdict = canAct(INS_RIGHTS.READ, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg, actorId: seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null), today: dayKey(at) };
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

  /** One to four responsible hands, each on the roster, active, and held by this seat. */
  function holdersContext(check, value) {
    const ids = insHolders(Array.isArray(value) ? value : text(value, 2000).split(/[,;]/).map((part) => part.trim()).filter(Boolean));
    if (!ids) {
      return fail(`Name between one and ${L.holdersMax} responsible person(s), each on this workspace once. A policy with no responsible hand has nobody to answer for its notification window.`, 'responsibleIds', REFUSAL('holders-invalid'));
    }
    for (const holderId of ids) {
      const person = rows('people').find((row) => row && row.id === holderId) || null;
      if (!person) return fail(`“${holderId}” is not a person on this record. Nothing was saved.`, 'responsibleIds', REFUSAL('holder-not-found'));
      if (person.status === 'archived') return fail(`${person.name || holderId} is archived and cannot be made responsible for a live policy.`, 'responsibleIds', REFUSAL('holder-archived'));
      if (!holdsPerson(check, holderId)) {
        return fail(`${person.name || holderId} is not on a line this seat holds. ${INS_REFUSALS.noReach}`, 'responsibleIds', REFUSAL('holder-not-your-person'));
      }
    }
    return { ok: true, ids };
  }

  function loadedPolicies() { return normalizeInsPolicies(rows('insPolicies'), []); }
  function loadedCoverages() { return normalizeInsCoverages(rows('insCoverages'), rows('lfgMatters'), loadedPolicies(), []); }
  function loadedNotifications() { return normalizeInsNotifications(rows('insNotifications'), loadedCoverages(), []); }
  function loadedRecoveries() { return normalizeInsRecoveries(rows('insRecoveries'), loadedCoverages(), []); }

  function writeDraft(mutate, event) {
    store.update((draft) => { mutate(draft); }, event);
    return true;
  }

  /** A day an ACT that has already happened names, and therefore cannot be future. */
  function pastDay(check, value, field) {
    const day = insDayKey(value);
    if (!day) return { error: fail('Give a real calendar day (YYYY-MM-DD).', field, REFUSAL('day-invalid')) };
    const dayMs = instantMs(`${day}T00:00:00.000Z`);
    if (dayMs > instantMs(`${check.today}T00:00:00.000Z`)) {
      return { error: fail('That day is in the future. This register records what has happened, not what will.', field, REFUSAL('day-future')) };
    }
    if ((instantMs(`${check.today}T00:00:00.000Z`) - dayMs) / 86_400_000 > L.backfillMaxDays) {
      return { error: fail(`That day is more than ${L.backfillMaxDays} day(s) ago. A backfilled record is not a control that ran when it did not.`, field, REFUSAL('day-too-old')) };
    }
    return { day };
  }

  /** A day that may legitimately be ahead (the day a policy period ends). */
  function forwardDay(check, value, field, { required = true } = {}) {
    if (value === undefined || value === null || value === '') {
      return required ? { error: fail('Give a real calendar day (YYYY-MM-DD).', field, REFUSAL('day-invalid')) } : { day: null };
    }
    const day = insDayKey(value);
    if (!day) return { error: fail('Give a real calendar day (YYYY-MM-DD).', field, REFUSAL('day-invalid')) };
    const delta = (instantMs(`${day}T00:00:00.000Z`) - instantMs(`${check.today}T00:00:00.000Z`)) / 86_400_000;
    if (delta > L.aheadMaxDays) return { error: fail(`That day is more than ${L.aheadMaxDays} day(s) ahead. A declaration that far out is a plan, not a record.`, field, REFUSAL('day-too-far')) };
    if (delta < -L.backfillMaxDays) return { error: fail(`That day is more than ${L.backfillMaxDays} day(s) ago.`, field, REFUSAL('day-too-old')) };
    return { day };
  }

  return {
    /* ------------------------------------------------------------------ policies */

    /**
     * DECLARE a policy: the declaration-page reference, the insurer, the class,
     * the basis, the period, the limit, the deductible, the declared notification
     * window and the hands responsible for it.
     */
    insuranceDeclarePolicy(input = {}) {
      const check = seatFor(INS_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const policyRef = insInstrument(input.policyRef);
      if (!policyRef) {
        return fail(`Cite the declaration page, in at least ${L.instrumentMin} characters — a policy number, a cover note reference, a renewal certificate. A policy nobody can trace to a document is the cover that is discovered to have lapsed at renewal.`, 'policyRef', REFUSAL('policy-ref-missing'));
      }
      const insurerRef = insShort(input.insurerRef);
      if (!insurerRef) return fail(`Name the insurer, in at least ${L.shortMin} characters.`, 'insurerRef', REFUSAL('insurer-missing'));
      const policyClass = text(input.policyClass, 60) || null;
      if (!policyClass || !INS_POLICY_CLASS_KEYS.includes(policyClass)) {
        return fail('Choose the policy class. It determines the trigger this policy must state, so “other” is a legitimate answer — it just obliges the policy to write its own trigger.', 'policyClass', REFUSAL('class-invalid'));
      }
      const basis = text(input.basis, 60) || null;
      if (!basis || !INS_POLICY_BASIS_BY_KEY[basis]) {
        return fail('Choose the policy basis. An occurrence policy answers for an occurrence during its period; a claims-made policy answers only for a claim made during its period. The register tests the trigger day against the period for both.', 'basis', REFUSAL('basis-invalid'));
      }

      const periodStart = pastDay(check, input.periodStartDay, 'periodStartDay');
      if (periodStart.error) return periodStart.error;
      const periodEnd = forwardDay(check, input.periodEndDay, 'periodEndDay');
      if (periodEnd.error) return periodEnd.error;
      if (instantMs(`${periodEnd.day}T00:00:00.000Z`) < instantMs(`${periodStart.day}T00:00:00.000Z`)) {
        return fail('The policy period cannot end before it starts. One of these two days is wrong, and the register will not choose between them.', 'periodEndDay', REFUSAL('period-reversed'));
      }

      const notificationWindowDays = insWindowDays(Number(input.notificationWindowDays));
      if (notificationWindowDays === null) {
        return fail(`The notification window is a whole number of days between 0 and ${L.notificationWindowMaxDays}. There is no default window in this register: a window belongs to the policy and the insurer, and you declare it.`, 'notificationWindowDays', REFUSAL('window-invalid'));
      }

      const currency = insCurrency(input.currency);
      if (!currency) return fail('Give the three-letter currency the policy is in. Amounts in this register are exact minor units in one named currency.', 'currency', REFUSAL('currency-invalid'));

      const limitMinor = input.limitMinor === undefined || input.limitMinor === null || input.limitMinor === ''
        ? null
        : minorUnits(Number(input.limitMinor));
      if (input.limitMinor !== undefined && input.limitMinor !== null && input.limitMinor !== '' && limitMinor === null) {
        return fail('The limit must be a whole number of minor units (pence or cents). A fractional minor unit is refused rather than rounded into a total.', 'limitMinor', REFUSAL('amount-invalid'));
      }
      const deductibleMinor = input.deductibleMinor === undefined || input.deductibleMinor === null || input.deductibleMinor === ''
        ? null
        : minorUnits(Number(input.deductibleMinor));
      if (input.deductibleMinor !== undefined && input.deductibleMinor !== null && input.deductibleMinor !== '' && deductibleMinor === null) {
        return fail('The deductible must be a whole number of minor units (pence or cents). A fractional minor unit is refused rather than rounded into a total.', 'deductibleMinor', REFUSAL('amount-invalid'));
      }

      // AN UNSUPPORTED CLASS MUST CARRY ITS OWN WRITTEN TRIGGER. The policy is
      // real whether or not this register carries its class; what it may not do
      // is pretend to know the trigger. The door accepts `other` and then demands
      // the written trigger, which the reader prints as an unsupported class.
      const classDefinition = INS_POLICY_CLASS_BY_KEY[policyClass] || null;
      let triggerRef = null;
      if (!classDefinition) {
        triggerRef = insReason(input.triggerRef);
        if (!triggerRef) {
          return fail(`This policy’s class is not one this register carries, so it must state its own trigger — the fact that starts the notification window — in at least ${L.textMin} characters. The register will print it as an unsupported class rather than pretending to know the trigger.`, 'triggerRef', REFUSAL('trigger-missing'));
        }
      } else if (input.triggerRef !== undefined && input.triggerRef !== null && input.triggerRef !== '') {
        triggerRef = insReason(input.triggerRef);
        if (!triggerRef) {
          return fail(`The trigger, where one is written, is at least ${L.textMin} characters.`, 'triggerRef', REFUSAL('trigger-invalid'));
        }
      }

      const holders = holdersContext(check, input.responsibleIds);
      if (!holders.ok) return holders;

      // THE SAME POLICY, TWICE. Only refused while the earlier record is still
      // live; a renewed policy may legitimately be declared on a fresh reference.
      const existing = buildInsurance(store.state, { now: check.at, settings: check.cfg, seat: null });
      const duplicate = existing.rows.find((row) => row.policy.policyRef.toLowerCase() === policyRef.toLowerCase()
        && row.policy.insurerRef.toLowerCase() === insurerRef.toLowerCase());
      if (duplicate) {
        return fail(`That policy reference and insurer are already on the record. Two live records of one policy is how a notification deadline gets computed against the wrong window. If this is a renewal, cite its reference.`, 'policyRef', REFUSAL('duplicate-policy'));
      }

      if (loadedPolicies().length >= L.policies) return fail('The policy ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('ins-pol');
      const row = {
        id,
        policyRef,
        insurerRef,
        policyClass,
        basis,
        periodStartDay: periodStart.day,
        periodEndDay: periodEnd.day,
        notificationWindowDays,
        limitMinor,
        deductibleMinor,
        currency,
        triggerRef,
        responsibleIds: holders.ids,
        declaredById: check.actorId,
        declaredAt: check.at.toISOString(),
        createdAt: check.at.toISOString(),
        updatedAt: check.at.toISOString(),
      };
      const stored = normalizeInsPolicies([...rows('insPolicies'), row], []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The policy could not be stored as a row this register can read back. Nothing was saved.', 'policyRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.insPolicies = Array.isArray(draft.insPolicies) ? draft.insPolicies : [];
        draft.insPolicies.push(stored);
      }, {
        type: INS_EVENTS.POLICY_DECLARED,
        entity: 'workspace',
        entityId: policyRef,
        summary: `Insurance policy declared: ${policyRef} with ${insurerRef} (${INS_POLICY_CLASS_BY_KEY[policyClass]?.label || policyClass}, ${INS_POLICY_BASIS_BY_KEY[basis].label}), period ${periodStart.day} to ${periodEnd.day}, notification window ${notificationWindowDays} day(s). No deadline is derived until a coverage is linked (${INS_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, policy: stored });
    },

    /* ------------------------------------------------------------------ coverages */

    /**
     * DECLARE a coverage — the link between a matter on the claim register and a
     * policy on this register. One per (matter, policy) pair, with a written
     * basis. The cover TEST is the reader's job.
     */
    insuranceDeclareCoverage(input = {}) {
      const check = seatFor(INS_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const matterId = text(input.matterId, L.idMax) || null;
      if (!matterId) return fail('Name the matter this coverage belongs to.', 'matterId');
      const matter = rows('lfgMatters').find((row) => row && row.id === matterId) || null;
      if (!matter) return fail(INS_REFUSALS.notFound, 'matterId', REFUSAL('matter-not-found'));

      const policyId = text(input.policyId, L.idMax) || null;
      if (!policyId) return fail('Name the policy this coverage links to.', 'policyId');
      const policy = loadedPolicies().find((row) => row.id === policyId) || null;
      if (!policy) return fail(INS_REFUSALS.notFound, 'policyId', REFUSAL('policy-not-found'));

      const basisRef = insReason(input.basisRef);
      if (!basisRef) {
        return fail(`Write the basis for this link, in at least ${L.textMin} characters — the policy wording, the broker advice, the coverage opinion. A link with no basis is a guess, and the register tests guesses as ` + '`no-cover`' + `.`, 'basisRef', REFUSAL('basis-missing'));
      }

      const coveredMinor = input.coveredMinor === undefined || input.coveredMinor === null || input.coveredMinor === ''
        ? null
        : minorUnits(Number(input.coveredMinor));
      if (input.coveredMinor !== undefined && input.coveredMinor !== null && input.coveredMinor !== '' && coveredMinor === null) {
        return fail('The covered amount must be a whole number of minor units (pence or cents). A fractional minor unit is refused rather than rounded into a total.', 'coveredMinor', REFUSAL('amount-invalid'));
      }
      let currency = null;
      if (coveredMinor !== null) {
        currency = insCurrency(input.currency || policy.currency);
        if (!currency) return fail('Give the three-letter currency the covered amount is in.', 'currency', REFUSAL('currency-invalid'));
      }

      if (loadedCoverages().some((row) => row.matterId === matterId && row.policyId === policyId)) {
        return fail('That matter is already linked to that policy. A second link for one (matter, policy) pair would make the recovery ambiguous; correct the existing one instead of adding a rival.', 'policyId', REFUSAL('coverage-duplicate'));
      }

      if (loadedCoverages().length >= L.coverages) return fail('The coverage ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('ins-cov');
      const row = {
        id,
        matterId,
        policyId,
        coveredMinor,
        currency,
        basisRef,
        declaredById: check.actorId,
        createdAt: check.at.toISOString(),
      };
      const stored = normalizeInsCoverages([...rows('insCoverages'), row], rows('lfgMatters'), loadedPolicies(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The coverage could not be stored as a row this register can read back. Nothing was saved.', 'basisRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.insCoverages = Array.isArray(draft.insCoverages) ? draft.insCoverages : [];
        draft.insCoverages.push(stored);
      }, {
        type: INS_EVENTS.COVERAGE_DECLARED,
        entity: 'workspace',
        entityId: policy.policyRef,
        summary: `Coverage declared: matter ${matter.matterRef || matterId} linked to policy ${policy.policyRef}. The cover test (trigger day against period) and the notification deadline are derived on read (${INS_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, coverage: stored });
    },

    /* -------------------------------------------------------------- notifications */

    /**
     * RECORD a notification — the insurer was told, on a stated day, by a stated
     * method, with a stated reference. One per coverage. A late notification is
     * KEPT: it is a breach fact, and the reader prints `notification-late`.
     */
    insuranceRecordNotification(input = {}) {
      const check = seatFor(INS_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const coverageId = text(input.coverageId, L.idMax) || null;
      if (!coverageId) return fail('Name the coverage this notification belongs to.', 'coverageId');
      const coverage = loadedCoverages().find((row) => row.id === coverageId) || null;
      if (!coverage) return fail(INS_REFUSALS.notFound, 'coverageId', REFUSAL('coverage-not-found'));

      if (loadedNotifications().some((row) => row.coverageId === coverageId)) {
        return fail('That coverage already carries a notification. The insurer is told once per claim per policy; a second notification would make the deadline ambiguous.', 'coverageId', REFUSAL('notification-duplicate'));
      }

      const method = text(input.method, 60) || null;
      if (!method || !INS_NOTIFICATION_METHOD_KEYS.includes(method)) {
        return fail('Choose the notification method. A broker notification, a direct notice to the insurer and a notice of circumstances are different acts and are printed apart.', 'method', REFUSAL('method-invalid'));
      }

      const notified = pastDay(check, input.notifiedDay, 'notifiedDay');
      if (notified.error) return notified.error;

      const referenceRef = insInstrument(input.referenceRef);
      if (!referenceRef) {
        return fail(`Cite the reference that proves the notification, in at least ${L.instrumentMin} characters — the broker reference, the insurer reference, the circumstances reference. A notification nobody can trace to a document is the notice that is discovered never to have been sent.`, 'referenceRef', REFUSAL('reference-missing'));
      }

      if (loadedNotifications().length >= L.notifications) return fail('The notification ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('ins-not');
      const row = {
        id,
        coverageId,
        notifiedDay: notified.day,
        method,
        referenceRef,
        recordedById: check.actorId,
        createdAt: check.at.toISOString(),
      };
      const stored = normalizeInsNotifications([...rows('insNotifications'), row], loadedCoverages(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The notification could not be stored as a row this register can read back. Nothing was saved.', 'referenceRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.insNotifications = Array.isArray(draft.insNotifications) ? draft.insNotifications : [];
        draft.insNotifications.push(stored);
      }, {
        type: INS_EVENTS.NOTIFICATION_RECORDED,
        entity: 'workspace',
        entityId: coverageId,
        summary: `Notification recorded on ${notified.day} by ${method} (${referenceRef}). Timeliness is derived on read against the policy's own window (${INS_ROUTE}).`.slice(0, 300),
      });

      // The door does not judge timeliness — the reader does, from the derived
      // deadline. But the caller is told now whether this notification is late,
      // because the breach is the record and the human who recorded it should
      // know what they just recorded.
      let lateWarning = null;
      try {
        const report = buildInsurance(store.state, { now: check.at, settings: check.cfg, seat: null });
        const derived = report.rows.find((candidate) => candidate.coverage.id === coverageId);
        if (derived && derived.lateBy !== null && derived.lateBy > 0) {
          lateWarning = `The notification was recorded ${derived.lateBy} day(s) after the derived deadline. It is KEPT as a breach fact and prints ` + '`notification-late`' + `; the register holds no insurer feed and cannot say whether the insurer accepted the late notice.`;
        }
      } catch { /* the reader will judge on the next read */ }
      return saved({ id, notification: stored, warning: lateWarning });
    },

    /* ----------------------------------------------------------------- recoveries */

    /**
     * RECORD a recovery — the insurer's answer moving, dated, based and exact. A
     * kind that moves money or opens a claim must carry an exact amount; a denial
     * carries no amount and its reason is the basis.
     */
    insuranceRecordRecovery(input = {}) {
      const check = seatFor(INS_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const coverageId = text(input.coverageId, L.idMax) || null;
      if (!coverageId) return fail('Name the coverage this recovery belongs to.', 'coverageId');
      const coverage = loadedCoverages().find((row) => row.id === coverageId) || null;
      if (!coverage) return fail(INS_REFUSALS.notFound, 'coverageId', REFUSAL('coverage-not-found'));

      const kind = text(input.kind, 60) || null;
      const definition = kind ? INS_RECOVERY_KIND_BY_KEY[kind] : null;
      if (!definition || !INS_RECOVERY_KIND_KEYS.includes(kind)) {
        return fail('Choose the kind of recovery. A claim, a payment, a denial and an interim payment are different facts and are printed apart.', 'kind', REFUSAL('kind-invalid'));
      }

      const at = pastDay(check, input.atDay, 'atDay');
      if (at.error) return at.error;
      const basisRef = insReason(input.basisRef);
      if (!basisRef) return fail(`Write the basis on the record, in at least ${L.textMin} characters — the insurer letter, the settlement, the denial reason. Money moved on the record and nobody said why is worse than no row at all.`, 'basisRef', REFUSAL('basis-missing'));

      let amountMinor = null;
      let currency = null;
      if (definition.movesMoney || definition.key === 'claimed') {
        amountMinor = minorUnits(Number(input.amountMinor));
        if (amountMinor === null) return fail(`A ${definition.label.toLowerCase()} carries an exact amount in whole minor units.`, 'amountMinor', REFUSAL('amount-missing'));
        currency = insCurrency(input.currency);
        if (!currency) return fail('Give the three-letter currency the amount is in.', 'currency', REFUSAL('currency-invalid'));
      } else if (input.amountMinor !== undefined && input.amountMinor !== null && input.amountMinor !== '') {
        return fail(`A ${definition.label.toLowerCase()} takes no amount. Recording one would print money against an outcome that paid none.`, 'amountMinor', REFUSAL('amount-not-permitted'));
      }

      if (loadedRecoveries().length >= L.recoveries) return fail('The recovery ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('ins-rec');
      const row = {
        id,
        coverageId,
        kind,
        atDay: at.day,
        amountMinor,
        currency,
        basisRef,
        recordedById: check.actorId,
        createdAt: check.at.toISOString(),
      };
      const stored = normalizeInsRecoveries([...rows('insRecoveries'), row], loadedCoverages(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The recovery could not be stored as a row this register can read back. Nothing was saved.', 'basisRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.insRecoveries = Array.isArray(draft.insRecoveries) ? draft.insRecoveries : [];
        draft.insRecoveries.push(stored);
      }, {
        type: INS_EVENTS.RECOVERY_RECORDED,
        entity: 'workspace',
        entityId: coverageId,
        summary: `Recovery recorded: ${definition.label} on ${at.day}${amountMinor === null ? ' with no amount' : `, ${currency} ${amountMinor} minor units`}. The net cost is derived on read as the gross less what the insurer paid (${INS_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, recovery: stored });
    },

    /* -------------------------------------------------------------- conventions */

    insuranceSetConventions(patch = {}) {
      const check = seatFor(INS_RIGHTS.MANAGE);
      if (!check.ok) return check;
      const current = normalizeInsSettings(settings());
      const known = new Set(Object.values(INS_SETTING_KEYS));
      for (const key of Object.keys(patch || {})) {
        if (!known.has(key)) return fail(`Unknown convention “${String(key).slice(0, 60)}”. Nothing was saved.`, key, REFUSAL('unknown-setting'));
      }
      const next = { ...current };
      for (const [key, value] of Object.entries(patch || {})) {
        if (key === INS_SETTING_KEYS.autoPropagate) { next[key] = value !== false; continue; }
        const n = Number(value);
        if (!Number.isInteger(n)) return fail(`“${key}” is a whole number. Nothing was saved.`, key, REFUSAL('setting-invalid'));
        const bound = key === INS_SETTING_KEYS.privacyFloor ? INS_BOUNDS.privacyFloor : INS_BOUNDS.warningHorizonDays;
        if (n < bound.min || n > bound.max) {
          return fail(`“${key}” must be between ${bound.min} and ${bound.max}. It is refused rather than clamped, so the figure on the screen is always the figure somebody declared.`, key, REFUSAL('setting-out-of-bounds'));
        }
        next[key] = n;
      }
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: INS_EVENTS.CONVENTIONS_SET,
        entity: 'workspace',
        entityId: INS_ROUTE,
        summary: `Insurance-register conventions re-declared: the warning horizon, the privacy floor and whether the rule may file asks (${INS_ROUTE}). The warning horizon is a planning convention and is never a notification window.`.slice(0, 300),
      });
      return saved({ conventions: normalizeInsSettings(store.state.settings || {}) });
    },

    /* -------------------------------------------------------------------- reads */

    insuranceReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, report: buildInsurance(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    insuranceAttention() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, count: insuranceAttentionCount(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    /** The candidates a dialog may name, narrowed to what this seat may actually write. */
    insuranceCandidates() {
      const check = readCheck();
      if (!check.ok) return check;
      const roster = rows('people').filter((row) => row && row.status !== 'archived' && row.id);
      const people = roster
        .filter((row) => holdsPerson(check, row.id))
        .map((row) => ({ id: row.id, name: row.name || row.id, role: row.role || '' }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return { ok: true, people };
    },

    /**
     * The explicit scan. Re-runs the rule over the whole register. Pausable: a
     * pause is a pause on every path, including this one — and it matters here
     * because a notification window RUNS OUT by the calendar with nobody having
     * written anything.
     */
    insuranceScan() {
      const check = seatFor(INS_RIGHTS.MANAGE);
      if (!check.ok) return check;
      store.update((draft) => {
        draft.insMarkers = Array.isArray(draft.insMarkers) ? draft.insMarkers : [];
      }, {
        type: INS_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: INS_ROUTE,
        summary: `Insurance register scanned; the rule re-reads every coverage against its policy window, its trigger day, its notification and its recovery ledger (${INS_ROUTE}).`.slice(0, 300),
      });
      return saved({});
    },
  };
}

/** The read context, exported so the view can print exactly what the register claims. */
export const INSURANCE_CONTEXT = 'Read the insurance notification and recovery register (#/insurance). It records the policy, the declared notification window, the trigger day, the derived deadline, whether the insurer was told in time, every recovery and denial, and the derived net cost. It gives no coverage advice and scores nobody.';
