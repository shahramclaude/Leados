/**
 * app/core/domain/prvActions.js — the seat-checked commands of the Provision &
 * Reimbursement Register (ADR-0250).
 *
 * FIVE human acts and a scan: DECLARE an assessment (the classification and the
 * best-estimate method), DECLARE a scenario (one outcome of an expected-value
 * estimate), DECLARE a reimbursement recognition (virtual certainty), DECLARE a
 * finance carrying (the figure finance says it carries), re-declare the
 * conventions — plus the explicit scan. Every state, best estimate, provision,
 * asset and reconciliation verdict is re-derived on read by `prvProvision.js`;
 * nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - An ASSESSMENT carries the matter, the classification, the best-estimate
 *    method, the most-likely amount where that is the method, a currency, a
 *    written basis and one to four responsible hands. A classification this
 *    register does not carry is refused: the classification is the verdict.
 *  - A most-likely assessment with no amount is refused. A classification without
 *    a figure is a provision nobody estimated.
 *  - A SCENARIO carries its outcome, its probability in basis points and its exact
 *    amount. The probabilities are NOT summed at the door: the reader sums them
 *    and refuses a set that is not exactly 100%.
 *  - A REIMBURSEMENT carries whether it is virtually certain and a written basis.
 *    The AMOUNT is never typed here: it is derived on read from the insurance
 *    register's cash and claimed amounts. A recognition with no basis is refused.
 *  - A CARRYING carries the currency, the amount and a written reference to the
 *    finance record. A carrying with no reference is refused.
 *  - Every write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused now.
 *
 * WHAT NO COMMAND CAN DO. There is no command that sets a state, writes a
 * provision total, writes an asset, sets a classification without a basis,
 * rounds an expected value, recognizes an asset above the provision, or scores a
 * person, a line or a claims handler.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import { buildProvisions, provisionAttentionCount } from './prvProvision.js';
import {
  PROV_BOUNDS,
  PROV_CLASSIFICATION_KEYS,
  PROV_ESTIMATE_METHOD_KEYS,
  PROV_EVENTS,
  PROV_LIMITS as L,
  PROV_REFUSALS,
  PROV_RIGHTS,
  PROV_ROUTE,
  PROV_SETTING_KEYS,
} from './prvRegistry.js';
import {
  normalizePrvAssessments,
  normalizePrvCarryings,
  normalizePrvReimbursements,
  normalizePrvScenarios,
  normalizePrvSettings,
  prvCurrency,
  prvDayKey,
  prvHolders,
  prvInstrument,
  prvProbability,
  prvReason,
  prvShort,
} from './prvSchema.js';
import { instantMs, minorUnits } from './prvMath.js';

const REFUSAL = (key) => `provisions:${key}`;
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function createProvisionActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);

  /**
   * A write result. The caller's own warning is MERGED with the persist error,
   * never overwritten by it — an assessment stored with an unreadable child must
   * not lose its message on a clean persist.
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
    if (seat.readOnly) return fail(PROV_REFUSALS.notSeated);
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg, actorId: seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null), today: dayKey(at) };
  }

  /**
   * A read is REGISTERED as safe and therefore bypasses the gateway's rank check —
   * so the right is re-proved HERE, exactly as every register in this workspace
   * re-proves it.
   */
  function readCheck() {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(PROV_REFUSALS.notSeated);
    const verdict = canAct(PROV_RIGHTS.READ, seat);
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
    const ids = prvHolders(Array.isArray(value) ? value : text(value, 2000).split(/[,;]/).map((part) => part.trim()).filter(Boolean));
    if (!ids) {
      return fail(`Name between one and ${L.holdersMax} responsible person(s), each on this workspace once. A provision with no responsible hand has nobody to answer for it.`, 'responsibleIds', REFUSAL('holders-invalid'));
    }
    for (const holderId of ids) {
      const person = rows('people').find((row) => row && row.id === holderId) || null;
      if (!person) return fail(`“${holderId}” is not a person on this record. Nothing was saved.`, 'responsibleIds', REFUSAL('holder-not-found'));
      if (person.status === 'archived') return fail(`${person.name || holderId} is archived and cannot be made responsible for a live provision.`, 'responsibleIds', REFUSAL('holder-archived'));
      if (!holdsPerson(check, holderId)) {
        return fail(`${person.name || holderId} is not on a line this seat holds. ${PROV_REFUSALS.noReach}`, 'responsibleIds', REFUSAL('holder-not-your-person'));
      }
    }
    return { ok: true, ids };
  }

  function loadedAssessments() { return normalizePrvAssessments(rows('prvAssessments'), rows('lfgMatters'), []); }
  function loadedScenarios() { return normalizePrvScenarios(rows('prvScenarios'), loadedAssessments(), []); }
  function loadedReimbursements() { return normalizePrvReimbursements(rows('prvReimbursements'), loadedAssessments(), []); }
  function loadedCarryings() { return normalizePrvCarryings(rows('prvCarryings'), []); }

  function writeDraft(mutate, event) {
    store.update((draft) => { mutate(draft); }, event);
    return true;
  }

  /** A day an ACT that has already happened names, and therefore cannot be future. */
  function pastDay(check, value, field) {
    const day = prvDayKey(value);
    if (!day) return { error: fail('Give a real calendar day (YYYY-MM-DD).', field, REFUSAL('day-invalid')) };
    const dayMs = instantMs(`${day}T00:00:00.000Z`);
    if (dayMs > instantMs(`${check.today}T00:00:00.000Z`)) {
      return { error: fail('That day is in the future. This register records what has been decided, not what will be.', field, REFUSAL('day-future')) };
    }
    return { day };
  }

  return {
    /* --------------------------------------------------------------- assessments */

    /**
     * DECLARE an assessment: the classification, the best-estimate method, the
     * most-likely amount where that is the method, the currency, the written basis
     * and the hands responsible for it.
     */
    provisionDeclareAssessment(input = {}) {
      const check = seatFor(PROV_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const matterId = text(input.matterId, L.idMax) || null;
      if (!matterId) return fail('Name the matter this assessment belongs to.', 'matterId');
      const matter = rows('lfgMatters').find((row) => row && row.id === matterId) || null;
      if (!matter) return fail(PROV_REFUSALS.notFound, 'matterId', REFUSAL('matter-not-found'));

      const classification = text(input.classification, 60) || null;
      if (!classification || !PROV_CLASSIFICATION_KEYS.includes(classification)) {
        return fail('Choose the classification. Probable, possible and remote are three different accounting verdicts, and the register never infers one from an amount.', 'classification', REFUSAL('classification-invalid'));
      }
      const estimateMethod = text(input.estimateMethod, 60) || null;
      if (!estimateMethod || !PROV_ESTIMATE_METHOD_KEYS.includes(estimateMethod)) {
        return fail('Choose the best-estimate method. A single most-likely outcome and a probability-weighted expected value are computed differently and are printed apart.', 'estimateMethod', REFUSAL('method-invalid'));
      }

      const currency = prvCurrency(input.currency);
      if (!currency) return fail('Give the three-letter currency the best estimate is in. Amounts in this register are exact minor units in one named currency.', 'currency', REFUSAL('currency-invalid'));

      const basisRef = prvReason(input.basisRef);
      if (!basisRef) {
        return fail(`Write the basis for this assessment, in at least ${L.textMin} characters — the accounting judgement, the regime applied, the evidence behind the classification. A classification with no written basis is an assertion the register cannot audit.`, 'basisRef', REFUSAL('basis-missing'));
      }

      let mostLikelyMinor = null;
      if (estimateMethod === 'most-likely') {
        mostLikelyMinor = minorUnits(Number(input.mostLikelyMinor));
        if (mostLikelyMinor === null) {
          return fail('A most-likely assessment carries one exact amount in whole minor units (pence or cents). A fractional minor unit is refused rather than rounded into a provision.', 'mostLikelyMinor', REFUSAL('amount-missing'));
        }
      } else if (input.mostLikelyMinor !== undefined && input.mostLikelyMinor !== null && input.mostLikelyMinor !== '') {
        mostLikelyMinor = minorUnits(Number(input.mostLikelyMinor));
        if (mostLikelyMinor === null) {
          return fail('The most-likely amount must be a whole number of minor units. A fractional minor unit is refused rather than rounded.', 'mostLikelyMinor', REFUSAL('amount-invalid'));
        }
      }

      const holders = holdersContext(check, input.responsibleIds);
      if (!holders.ok) return holders;

      const assessed = pastDay(check, input.assessedDay || check.today, 'assessedDay');
      if (assessed.error) return assessed.error;

      if (loadedAssessments().some((row) => row.matterId === matterId)) {
        return fail('That matter already carries an assessment. A second assessment for one matter would make the provision ambiguous; correct the existing one instead of adding a rival.', 'matterId', REFUSAL('assessment-duplicate'));
      }

      if (loadedAssessments().length >= L.assessments) return fail('The assessment ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('prv-ass');
      const row = {
        id,
        matterId,
        classification,
        estimateMethod,
        mostLikelyMinor,
        currency,
        basisRef,
        responsibleIds: holders.ids,
        assessedById: check.actorId,
        assessedAt: check.at.toISOString(),
        assessedDay: assessed.day,
        createdAt: check.at.toISOString(),
        updatedAt: check.at.toISOString(),
      };
      const stored = normalizePrvAssessments([...rows('prvAssessments'), row], rows('lfgMatters'), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The assessment could not be stored as a row this register can read back. Nothing was saved.', 'basisRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.prvAssessments = Array.isArray(draft.prvAssessments) ? draft.prvAssessments : [];
        draft.prvAssessments.push(stored);
      }, {
        type: PROV_EVENTS.ASSESSMENT_DECLARED,
        entity: 'workspace',
        entityId: matter.matterRef || matterId,
        summary: `Provision assessment declared on matter ${matter.matterRef || matterId}: ${classification}, best estimate by ${estimateMethod}. The provision, any reimbursement asset and the reconciliation are derived on read (${PROV_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, assessment: stored });
    },

    /* ----------------------------------------------------------------- scenarios */

    /**
     * DECLARE a scenario — one outcome of an expected-value best estimate, with its
     * probability in basis points and its exact amount. The probabilities are not
     * summed at the door; the reader refuses a set that is not exactly 100%.
     */
    provisionDeclareScenario(input = {}) {
      const check = seatFor(PROV_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const matterId = text(input.matterId, L.idMax) || null;
      if (!matterId) return fail('Name the matter this scenario belongs to.', 'matterId');
      const assessment = loadedAssessments().find((row) => row.matterId === matterId) || null;
      if (!assessment) return fail('That matter carries no assessment. A scenario cannot be attached to an obligation that was never assessed.', 'matterId', REFUSAL('assessment-not-found'));

      const outcome = prvShort(input.outcome);
      if (!outcome) return fail(`Name the outcome, in at least ${L.shortMin} characters.`, 'outcome', REFUSAL('outcome-missing'));

      const probabilityBps = prvProbability(Number(input.probabilityBps));
      if (probabilityBps === null) {
        return fail(`The probability is a whole number of basis points between 0 and ${L.probabilityBpsMax} (100%).`, 'probabilityBps', REFUSAL('probability-invalid'));
      }
      const amountMinor = minorUnits(Number(input.amountMinor));
      if (amountMinor === null) {
        return fail('The scenario amount is a whole number of minor units (pence or cents). A fractional minor unit is refused rather than rounded into a total.', 'amountMinor', REFUSAL('amount-invalid'));
      }
      const currency = prvCurrency(input.currency);
      if (!currency) return fail('Give the three-letter currency the scenario amount is in.', 'currency', REFUSAL('currency-invalid'));
      const basisRef = prvReason(input.basisRef);
      if (!basisRef) return fail(`Write the basis for this scenario, in at least ${L.textMin} characters — the evidence behind the outcome and its probability.`, 'basisRef', REFUSAL('basis-missing'));

      const declared = pastDay(check, input.declaredDay || check.today, 'declaredDay');
      if (declared.error) return declared.error;

      if (loadedScenarios().length >= L.scenarios) return fail('The scenario ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('prv-scn');
      const row = {
        id,
        matterId,
        outcome,
        probabilityBps,
        amountMinor,
        currency,
        basisRef,
        declaredById: check.actorId,
        declaredAt: check.at.toISOString(),
        declaredDay: declared.day,
        createdAt: check.at.toISOString(),
      };
      const stored = normalizePrvScenarios([...rows('prvScenarios'), row], loadedAssessments(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The scenario could not be stored as a row this register can read back. Nothing was saved.', 'basisRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.prvScenarios = Array.isArray(draft.prvScenarios) ? draft.prvScenarios : [];
        draft.prvScenarios.push(stored);
      }, {
        type: PROV_EVENTS.SCENARIO_DECLARED,
        entity: 'workspace',
        entityId: matterId,
        summary: `Scenario declared on matter ${matterId}: ${outcome} at ${probabilityBps} basis points, ${currency} ${amountMinor} minor units. The expected value is derived on read and a set that is not exactly 100% is refused (${PROV_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, scenario: stored });
    },

    /* ------------------------------------------------------------- reimbursements */

    /**
     * DECLARE a reimbursement recognition — whether the recovery is virtually
     * certain, with a written basis. The amount is derived on read from the
     * insurance register's cash and claimed amounts, never typed here.
     */
    provisionDeclareReimbursement(input = {}) {
      const check = seatFor(PROV_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const matterId = text(input.matterId, L.idMax) || null;
      if (!matterId) return fail('Name the matter this reimbursement belongs to.', 'matterId');
      const assessment = loadedAssessments().find((row) => row.matterId === matterId) || null;
      if (!assessment) return fail('That matter carries no assessment. A reimbursement cannot be attached to an obligation that was never assessed.', 'matterId', REFUSAL('assessment-not-found'));

      const virtuallyCertain = typeof input.virtuallyCertain === 'boolean' ? input.virtuallyCertain : null;
      if (virtuallyCertain === null) {
        return fail('State whether the reimbursement is virtually certain. Cash the insurer has paid is derived from the insurance register; a pending claim is not virtually certain unless you declare it so in writing.', 'virtuallyCertain', REFUSAL('certainty-invalid'));
      }
      const basisRef = prvReason(input.basisRef);
      if (!basisRef) return fail(`Write the basis for this recognition, in at least ${L.textMin} characters — the coverage opinion, the insurer’s admission, the cash received.`, 'basisRef', REFUSAL('basis-missing'));

      const declared = pastDay(check, input.declaredDay || check.today, 'declaredDay');
      if (declared.error) return declared.error;

      if (loadedReimbursements().some((row) => row.matterId === matterId)) {
        return fail('That matter already carries a reimbursement recognition. A second recognition would make the asset ambiguous; correct the existing one instead of adding a rival.', 'matterId', REFUSAL('reimbursement-duplicate'));
      }

      if (loadedReimbursements().length >= L.reimbursements) return fail('The reimbursement ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('prv-rec');
      const row = {
        id,
        matterId,
        virtuallyCertain,
        basisRef,
        declaredById: check.actorId,
        declaredAt: check.at.toISOString(),
        declaredDay: declared.day,
        createdAt: check.at.toISOString(),
      };
      const stored = normalizePrvReimbursements([...rows('prvReimbursements'), row], loadedAssessments(), []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The reimbursement could not be stored as a row this register can read back. Nothing was saved.', 'basisRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.prvReimbursements = Array.isArray(draft.prvReimbursements) ? draft.prvReimbursements : [];
        draft.prvReimbursements.push(stored);
      }, {
        type: PROV_EVENTS.REIMBURSEMENT_DECLARED,
        entity: 'workspace',
        entityId: matterId,
        summary: `Reimbursement recognition declared on matter ${matterId}: virtually certain is ${virtuallyCertain}. The asset amount is derived on read from the insurance register's cash and claimed amounts and is capped at the provision (${PROV_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, reimbursement: stored });
    },

    /* ----------------------------------------------------------------- carryings */

    /**
     * DECLARE a finance carrying — the figure the finance seat says it is carrying
     * as the provision, in one currency, with a written reference to the finance
     * record. The register reconciles its computed provision against it and prints
     * the exact gap.
     */
    provisionDeclareCarrying(input = {}) {
      const check = seatFor(PROV_RIGHTS.MANAGE);
      if (!check.ok) return check;

      const currency = prvCurrency(input.currency);
      if (!currency) return fail('Give the three-letter currency the carrying is in.', 'currency', REFUSAL('currency-invalid'));
      const carriedMinor = minorUnits(Number(input.carriedMinor));
      if (carriedMinor === null) {
        return fail('The carrying is a whole number of minor units (pence or cents). A fractional minor unit is refused rather than rounded into a reconciliation.', 'carriedMinor', REFUSAL('amount-invalid'));
      }
      const carriedRef = prvInstrument(input.carriedRef);
      if (!carriedRef) {
        return fail(`Cite the finance record the carrying is drawn from, in at least ${L.instrumentMin} characters — the sub-ledger, the general ledger account, the close pack reference. A figure finance cannot trace to a record is the number that is discovered to be wrong at the audit.`, 'carriedRef', REFUSAL('reference-missing'));
      }

      const declared = pastDay(check, input.declaredDay || check.today, 'declaredDay');
      if (declared.error) return declared.error;

      if (loadedCarryings().some((row) => row.currency === currency)) {
        return fail(`That currency already carries a declared finance carrying. A second carrying for one currency would make the reconciliation ambiguous; correct the existing one instead of adding a rival.`, 'currency', REFUSAL('carrying-duplicate'));
      }

      if (loadedCarryings().length >= L.carryings) return fail('The carrying ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));

      const id = idFactory('prv-car');
      const row = {
        id,
        currency,
        carriedMinor,
        carriedRef,
        declaredById: check.actorId,
        declaredAt: check.at.toISOString(),
        declaredDay: declared.day,
        createdAt: check.at.toISOString(),
      };
      const stored = normalizePrvCarryings([...rows('prvCarryings'), row], []).find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The carrying could not be stored as a row this register can read back. Nothing was saved.', 'carriedRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.prvCarryings = Array.isArray(draft.prvCarryings) ? draft.prvCarryings : [];
        draft.prvCarryings.push(stored);
      }, {
        type: PROV_EVENTS.CARRYING_DECLARED,
        entity: 'workspace',
        entityId: currency,
        summary: `Finance carrying declared for ${currency}: ${carriedMinor} minor units against ${carriedRef}. The register reconciles its computed provision against it and prints the exact gap (${PROV_ROUTE}).`.slice(0, 300),
      });
      return saved({ id, carrying: stored });
    },

    /* -------------------------------------------------------------- conventions */

    provisionSetConventions(patch = {}) {
      const check = seatFor(PROV_RIGHTS.MANAGE);
      if (!check.ok) return check;
      const current = normalizePrvSettings(settings());
      const known = new Set(Object.values(PROV_SETTING_KEYS));
      for (const key of Object.keys(patch || {})) {
        if (!known.has(key)) return fail(`Unknown convention “${String(key).slice(0, 60)}”. Nothing was saved.`, key, REFUSAL('unknown-setting'));
      }
      const next = { ...current };
      for (const [key, value] of Object.entries(patch || {})) {
        if (key === PROV_SETTING_KEYS.autoPropagate) { next[key] = value !== false; continue; }
        const n = Number(value);
        if (!Number.isInteger(n)) return fail(`“${key}” is a whole number. Nothing was saved.`, key, REFUSAL('setting-invalid'));
        const bound = PROV_BOUNDS.privacyFloor;
        if (n < bound.min || n > bound.max) {
          return fail(`“${key}” must be between ${bound.min} and ${bound.max}. It is refused rather than clamped, so the figure on the screen is always the figure somebody declared.`, key, REFUSAL('setting-out-of-bounds'));
        }
        next[key] = n;
      }
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: PROV_EVENTS.CONVENTIONS_SET,
        entity: 'workspace',
        entityId: PROV_ROUTE,
        summary: `Provision-register conventions re-declared: the privacy floor and whether the rule may file asks (${PROV_ROUTE}).`,
      });
      return saved({ conventions: normalizePrvSettings(store.state.settings || {}) });
    },

    /* -------------------------------------------------------------------- reads */

    provisionReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, report: buildProvisions(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    provisionAttention() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, count: provisionAttentionCount(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    /** The candidates a dialog may name, narrowed to what this seat may actually write. */
    provisionCandidates() {
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
     * because an unreconciled carrying is a figure that disagrees with the record
     * with nobody having written anything.
     */
    provisionScan() {
      const check = seatFor(PROV_RIGHTS.MANAGE);
      if (!check.ok) return check;
      store.update((draft) => {
        draft.prvMarkers = Array.isArray(draft.prvMarkers) ? draft.prvMarkers : [];
      }, {
        type: PROV_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: PROV_ROUTE,
        summary: `Provision register scanned; the rule re-reads every assessment, scenario, reimbursement recognition and declared carrying (${PROV_ROUTE}).`.slice(0, 300),
      });
      return saved({});
    },
  };
}

/** The read context, exported so the view can print exactly what the register claims. */
export const PROVISION_CONTEXT = 'Read the provision and reimbursement register (#/provisions). It derives the provision from a declared classification and best estimate, recognizes a reimbursement asset only when it is virtually certain and caps it at the provision, and reconciles the computed provision against the figure finance declares it is carrying. It gives no accounting advice and scores nobody.';
