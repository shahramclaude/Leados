/**
 * app/core/domain/earnedValueActions.js — the seat-checked commands of the
 * Earned-Value Delivery & Estimate-at-Completion Register (ADR-0217, Schema v171).
 *
 * TWELVE human acts and nothing else: DECLARE a case and its baseline owner,
 * ADD a work package to the baseline, RE-BASELINE a package (supersede with a
 * written reason — never edit), REMOVE a package from the baseline (supersede
 * without a replacement), WITHDRAW a case, RECORD a reading (dated shares under
 * the case's declared method), WITHDRAW a reading, RECORD an actual cost,
 * WITHDRAW an actual, SET the conventions, and SCAN. The rule that chases a
 * missing reading or an under-floor cost position is `RULE-EVL-01`, not this file.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - A case may only be declared by a seat that HOLDS its named owner — itself,
 *    or a person on its home line or a declared line. One line does not declare
 *    another line's programme.
 *  - The increments of a package must sum to its budget TO THE CENT, or the
 *    package is refused. A phased plan that does not re-add to its own total is
 *    not a baseline, it is a wish with a date on it.
 *  - Line shares must sum to exactly 100 when declared. 70/70 across two lines
 *    funds a package at 140 and is refused by name.
 *  - A reading is refused WHOLE when any live package lacks a share — the
 *    missing packages are named. It is also refused when a share is not admitted
 *    by the case's declared method (0/100 admits nothing between 0 and 100).
 *  - A re-baseline is a dated, reasoned, append-only act. The old package stays
 *    on the record, marked superseded; the case's baseline version bumps; every
 *    reading cut against the old baseline prints as baseline-moved.
 *  - A convention outside its bounds is REFUSED, never clamped.
 *
 * Every write stores the row its own loader returns, so the record is identical
 * before and after a reload, and nothing derived is stored.
 */

import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import {
  buildEarnedValue,
  earnedValueAttentionCount,
  earnedValueBriefText,
  earnedValueCandidates,
  earnedValueCsvRows,
} from './earnedValue.js';
import {
  EV_BOUNDS,
  EV_EVENTS,
  EV_LIMITS,
  EV_METHOD_KEYS,
  EV_RIGHTS,
  EV_ROUTE,
  EV_RULE_ID,
  EV_SETTING_KEYS,
  EV_SETTING_LABELS,
  evMethodByKey,
} from './earnedValueRegistry.js';
import {
  baselineSignature,
} from './earnedValueMath.js';
import {
  normalizeEvActuals,
  normalizeEvCase,
  normalizeEvCases,
  normalizeEvPackages,
  normalizeEvReadings,
  normalizeEvSettings,
  parseEvLineShares,
  parseEvMoney,
  parseEvPhases,
  readEvSettings,
  evCurrency,
  evDay,
  evPersonId,
  evText,
  normalizeEvCode,
} from './earnedValueSchema.js';

const L = EV_LIMITS;
const REFUSAL = (key) => `earned-value:${key}`;

export function createEarnedValueActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);
  const saved = (extra = {}) => ({ ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [], ok: true });

  /** Who is acting, and when — the seat resolved but NO right exercised yet. */
  function seatNow() {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail('The declared seat is unresolved and read-only. Choose a valid seat before declaring or recording on the earned-value register.');
    const actorId = seat.fullAccess ? LEADER_ID : (seat.nodeId || seat.id);
    return { ok: true, seat, at, cfg, actorId, today: dayKey(at) };
  }

  function seatFor(right) {
    const base = seatNow();
    if (!base.ok) return base;
    const verdict = canAct(right, base.seat);
    if (!verdict.allow) return { ...fail(verdict.reason), verdict };
    return base;
  }

  const read = (check) => buildEarnedValue(store.state, { now: check.at, settings: check.cfg, seat: check.seat });

  /** How this seat holds a person: 'operator', 'home-line', 'declared-line', or null. */
  function reachOf(check, personId) {
    if (check.seat.fullAccess) return 'operator';
    if (check.seat.scope instanceof Set && check.seat.scope.has(personId)) return 'home-line';
    if (check.seat.lineScope instanceof Set && check.seat.lineScope.has(personId)) return 'declared-line';
    return null;
  }

  const activePerson = (id) => rows('people').find((person) => person && person.id === id && person.status === 'active') || null;
  const storedCases = () => normalizeEvCases(rows('earnedValueCases'), []);
  const storedPackages = (cases) => normalizeEvPackages(rows('earnedValuePackages'), cases, []);
  const storedReadings = (cases, packages) => normalizeEvReadings(rows('earnedValueReadings'), cases, packages, []);
  const storedActuals = (cases, packages) => normalizeEvActuals(rows('earnedValueActuals'), cases, packages, []);
  const liveBaselineOf = (packages, caseId) => packages.filter((pkg) => pkg.caseId === caseId && pkg.status !== 'superseded');
  const knownLineKeys = () => new Set([LEADER_ID, ...rows('people').filter((p) => p && p.id).map((p) => p.id)]);

  return {
    /* ---------------------------------------------------------------- reads */

    earnedValueReport() {
      const check = seatFor(EV_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, report: read(check) };
    },

    earnedValueBriefText() {
      const check = seatFor(EV_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, text: earnedValueBriefText(read(check)) };
    },

    earnedValueCsvRows() {
      const check = seatFor(EV_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, rows: earnedValueCsvRows(read(check)) };
    },

    earnedValueAttentionCount() {
      const check = seatFor(EV_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, count: earnedValueAttentionCount(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    /** The declaration dialogs' data. Every rule is re-proved by the writes. */
    earnedValueCandidates() {
      const check = seatFor(EV_RIGHTS.READ);
      if (!check.ok) return check;
      const board = earnedValueCandidates(store.state, { now: check.at, settings: check.cfg });
      return {
        ok: true,
        today: check.today,
        ...board,
        canDeclare: canAct(EV_RIGHTS.DECLARE, check.seat).allow === true,
        canRecord: canAct(EV_RIGHTS.RECORD, check.seat).allow === true,
        canGovern: canAct(EV_RIGHTS.GOVERN, check.seat).allow === true,
        people: rows('people')
          .filter((person) => person && person.id && person.status !== 'archived')
          .map((person) => ({ id: person.id, name: person.name || person.id, via: reachOf(check, person.id) }))
          .filter((person) => person.via)
          .sort((a, b) => a.name.localeCompare(b.name)),
        lineKeys: knownLineKeys().size,
        limits: L,
      };
    },

    /* --------------------------------------------------------------- writes */

    /** Declare one delivery case: the name, the money unit, the measure, the accountable owner. */
    earnedValueDeclareCase(input = {}) {
      const check = seatFor(EV_RIGHTS.DECLARE);
      if (!check.ok) return check;
      if (rows('earnedValueCases').length >= L.cases) {
        return fail(`The case register reached its ${L.cases}-row cap. Export the workspace before declaring another case.`, 'label', REFUSAL('cap-reached'));
      }
      const label = evText(input.label, L.labelMax);
      if (label.length < L.labelMin) return fail('Name the work, in at least a few characters.', 'label', REFUSAL('case-label-required'));
      const currency = evCurrency(input.currency);
      if (!currency) return fail('Declare the case’s currency as three letters (for example DKK). A case with no currency has no unit for its budget.', 'currency', REFUSAL('case-currency-required'));
      const methodKey = evText(input.methodKey, 30);
      if (!EV_METHOD_KEYS.includes(methodKey)) return fail('Choose a progress-measurement method from the register’s closed list.', 'methodKey', REFUSAL('case-unknown-method'));
      const ownerId = evPersonId(input.ownerId);
      if (!ownerId) return fail('A case names exactly one accountable delivery owner.', 'ownerId', REFUSAL('case-owner-required'));
      if (ownerId !== LEADER_ID && !activePerson(ownerId)) {
        return fail('The named owner is not on the active roster.', 'ownerId', REFUSAL('case-owner-not-on-roster'));
      }
      const via = reachOf(check, ownerId);
      if (!via) {
        return fail('A case may only be declared by a seat that holds its owner — on its home line or a declared line. One line does not declare another line’s programme.', 'ownerId', REFUSAL('case-owner-out-of-reach'));
      }
      const id = idFactory('evcase');
      const row = {
        id, label, currency, methodKey, ownerId,
        note: evText(input.note, L.noteMax),
        source: evText(input.source, L.sourceMax),
        status: 'open', withdrawnOn: null, withdrawnReason: '',
        declaredOn: check.today, declaredById: check.actorId, baselineVersion: 0,
      };
      const loaded = normalizeEvCase(row);
      if (!loaded) return fail('The case could not be stored as a row this register can read back. Nothing was saved.');
      store.update((draft) => {
        draft.earnedValueCases = Array.isArray(draft.earnedValueCases) ? draft.earnedValueCases : [];
        draft.earnedValueCases.push(loaded);
      }, {
        type: EV_EVENTS.CASE_DECLARED,
        entity: 'earnedValueCase',
        entityId: id,
        summary: `Earned-value case declared: ${label} (${currency}, ${methodKey}), owner ${ownerId}.`.slice(0, 300),
      });
      return saved({ caseId: id, ownerVia: via });
    },

    /**
     * Add one work package to the BASELINE. The increments must re-add to the
     * budget to the cent; line shares must sum to exactly 100 when declared.
     * Adding bumps the case's baseline version.
     */
    earnedValueAddPackage(input = {}) {
      const check = seatFor(EV_RIGHTS.DECLARE);
      if (!check.ok) return check;
      if (rows('earnedValuePackages').length >= L.packages) {
        return fail(`The package register reached its ${L.packages}-row cap. Export the workspace before adding another package.`, 'code', REFUSAL('cap-reached'));
      }
      const cases = storedCases();
      const caseId = evText(input.caseId, 80);
      const caseRow = cases.find((row) => row.id === caseId) || null;
      if (!caseRow) return fail('A package belongs to a case this record holds. Declare the case first.', 'caseId', REFUSAL('case-unknown'));
      if (caseRow.status === 'withdrawn') return fail('This case was withdrawn. A withdrawn case takes no new packages.', 'caseId', REFUSAL('case-withdrawn'));
      const via = reachOf(check, caseRow.ownerId);
      if (!via) return fail('Only a seat that holds the case’s owner may baselined packages into it.', 'caseId', REFUSAL('case-owner-out-of-reach'));
      const code = normalizeEvCode(input.code);
      if (!code) return fail('A work package carries its WBS code.', 'code', REFUSAL('code-required'));
      const live = liveBaselineOf(storedPackages(cases), caseId);
      if (live.some((pkg) => pkg.code === code)) {
        return fail(`The code ${code} is already a live package of this case. A re-baseline supersedes it; it does not clone the code.`, 'code', REFUSAL('code-duplicate'));
      }
      const name = evText(input.name, L.labelMax);
      if (name.length < 3) return fail('Name the work package.', 'name', REFUSAL('package-name-required'));
      const plannedCents = parseEvMoney(input.plannedAmount, { signed: false });
      if (plannedCents === null || plannedCents <= 0) return fail('State the package budget as a positive amount, to the cent.', 'plannedAmount', REFUSAL('package-budget-required'));
      const plannedStart = evDay(input.plannedStart);
      const plannedFinish = evDay(input.plannedFinish);
      if (!plannedStart || !plannedFinish) return fail('State the planned start and finish as real calendar days (YYYY-MM-DD).', 'plannedStart', REFUSAL('package-dates-required'));
      if (plannedFinish < plannedStart) return fail('A package that finishes before it starts is not a plan.', 'plannedFinish', REFUSAL('package-dates-reversed'));
      const { phases, error, line } = parseEvPhases(input.phasesText);
      if (error) {
        const detail = line ? ` Line ${line}: ${input.phasesText?.split(/\r?\n/)[line - 1]?.trim() || ''}` : '';
        return fail(`The increments could not be read.${detail}`.trim(), 'phasesText', REFUSAL(error));
      }
      const total = phases.reduce((acc, phase) => acc + phase.cents, 0);
      if (total !== plannedCents) {
        return fail(`The increments sum to ${(total / 100).toFixed(2)} against a budget of ${(plannedCents / 100).toFixed(2)}. They must match to the cent; nothing was saved.`, 'phasesText', REFUSAL('phases-do-not-add-to-budget'));
      }
      const { shares, error: sharesError, line: sharesLine, lineKey } = parseEvLineShares(input.lineSharesText, knownLineKeys());
      if (sharesError) {
        const detail = sharesLine ? ` Line ${sharesLine}.` : '';
        const named = lineKey ? ` “${lineKey}” is not a line this workspace has declared.` : '';
        return fail(`The line split could not be read.${detail}${named}`.trim(), 'lineSharesText', REFUSAL(sharesError));
      }
      const newVersion = (caseRow.baselineVersion || 0) + 1;
      const id = idFactory('evp');
      const row = {
        id, caseId, code, name, plannedCents, plannedStart, plannedFinish,
        phases, lineShares: shares, status: 'live',
        supersededOn: null, supersededReason: '', validFrom: newVersion,
        note: evText(input.note, L.noteMax),
      };
      const loaded = normalizeEvPackages([row], cases, [])[0];
      if (!loaded) return fail('The package could not be stored as a row this register can read back. Nothing was saved.');
      store.update((draft) => {
        draft.earnedValuePackages = Array.isArray(draft.earnedValuePackages) ? draft.earnedValuePackages : [];
        draft.earnedValuePackages.push(loaded);
        draft.earnedValueCases = (draft.earnedValueCases || []).map((rowAny) =>
          (rowAny && rowAny.id === caseId ? { ...rowAny, baselineVersion: newVersion } : rowAny));
      }, {
        type: EV_EVENTS.BASELINE_REVISED,
        entity: 'earnedValueCase',
        entityId: caseId,
        summary: `Baseline v${newVersion} of “${caseRow.label}”: package ${code} added (${(plannedCents / 100).toFixed(2)} ${caseRow.currency}).`.slice(0, 300),
      });
      return saved({ packageId: id, baselineVersion: newVersion });
    },

    /**
     * Re-baseline ONE live package: supersede it with a new row. The reason is
     * required and stored; unspecified economics carry over from the old row.
     * This is the ONLY door that moves a budget after declaration.
     */
    earnedValueRebaselinePackage(input = {}) {
      const check = seatFor(EV_RIGHTS.DECLARE);
      if (!check.ok) return check;
      if (rows('earnedValuePackages').length >= L.packages) {
        return fail(`The package register reached its ${L.packages}-row cap.`, 'packageId', REFUSAL('cap-reached'));
      }
      const cases = storedCases();
      const caseId = evText(input.caseId, 80);
      const caseRow = cases.find((row) => row.id === caseId) || null;
      if (!caseRow) return fail('That case is not on this record.', 'caseId', REFUSAL('case-unknown'));
      if (caseRow.status === 'withdrawn') return fail('This case was withdrawn. A withdrawn case takes no re-baseline.', 'caseId', REFUSAL('case-withdrawn'));
      const via = reachOf(check, caseRow.ownerId);
      if (!via) return fail('Only a seat that holds the case’s owner may re-baseline it.', 'caseId', REFUSAL('case-owner-out-of-reach'));
      const packages = storedPackages(cases);
      const packageId = evText(input.packageId, 80);
      const old = packages.find((pkg) => pkg.id === packageId && pkg.caseId === caseId && pkg.status !== 'superseded') || null;
      if (!old) return fail('That package is not a live package of this case.', 'packageId', REFUSAL('package-unknown'));
      const reason = evText(input.reason, L.reasonMax);
      if (reason.length < L.reasonMin) return fail('Record why the baseline is changing, in at least a sentence. “Because” is not a reason.', 'reason', REFUSAL('rebaseline-reason-required'));

      const name = input.name !== undefined ? evText(input.name, L.labelMax) : old.name;
      if (!name || name.length < 3) return fail('Name the package.', 'name', REFUSAL('package-name-required'));
      const plannedCents = input.plannedAmount !== undefined && String(input.plannedAmount).trim() !== ''
        ? parseEvMoney(input.plannedAmount, { signed: false })
        : old.plannedCents;
      if (plannedCents === null || plannedCents <= 0) return fail('State the package budget as a positive amount, to the cent.', 'plannedAmount', REFUSAL('package-budget-required'));
      const plannedStart = input.plannedStart ? evDay(input.plannedStart) : old.plannedStart;
      const plannedFinish = input.plannedFinish ? evDay(input.plannedFinish) : old.plannedFinish;
      if (!plannedStart || !plannedFinish) return fail('State the planned start and finish as real calendar days (YYYY-MM-DD).', 'plannedStart', REFUSAL('package-dates-required'));
      if (plannedFinish < plannedStart) return fail('A package that finishes before it starts is not a plan.', 'plannedFinish', REFUSAL('package-dates-reversed'));
      const phasesParsed = input.phasesText !== undefined ? parseEvPhases(input.phasesText) : { phases: old.phases, error: null };
      if (phasesParsed.error) {
        const line = phasesParsed.line;
        return fail(`The increments could not be read.${line ? ` Line ${line}.` : ''}`, 'phasesText', REFUSAL(phasesParsed.error));
      }
      const total = phasesParsed.phases.reduce((acc, phase) => acc + phase.cents, 0);
      if (total !== plannedCents) {
        return fail(`The increments sum to ${(total / 100).toFixed(2)} against a budget of ${(plannedCents / 100).toFixed(2)}. They must match to the cent; nothing was saved.`, 'phasesText', REFUSAL('phases-do-not-add-to-budget'));
      }
      const sharesParsed = input.lineSharesText !== undefined ? parseEvLineShares(input.lineSharesText, knownLineKeys()) : { shares: old.lineShares, error: null };
      if (sharesParsed.error) {
        return fail('The line split could not be read.', 'lineSharesText', REFUSAL(sharesParsed.error));
      }
      const unchanged = name === old.name
        && plannedCents === old.plannedCents
        && plannedStart === old.plannedStart
        && plannedFinish === old.plannedFinish
        && JSON.stringify(phasesParsed.phases) === JSON.stringify(old.phases)
        && JSON.stringify(sharesParsed.shares) === JSON.stringify(old.lineShares);
      if (unchanged) return fail('A re-baseline that changes nothing is not a re-baseline. Name a budget, an increment set, a date range, a name or a line share.', 'packageId', REFUSAL('rebaseline-no-change'));

      const newVersion = (caseRow.baselineVersion || 0) + 1;
      const id = idFactory('evp');
      const row = {
        id, caseId, code: old.code, name, plannedCents, plannedStart, plannedFinish,
        phases: phasesParsed.phases, lineShares: sharesParsed.shares, status: 'live',
        supersededOn: null, supersededReason: '', validFrom: newVersion,
        note: evText(input.note, L.noteMax),
      };
      const loaded = normalizeEvPackages([row], cases, [])[0];
      if (!loaded) return fail('The re-baselined package could not be stored as a row this register can read back. Nothing was saved.');
      store.update((draft) => {
        draft.earnedValuePackages = Array.isArray(draft.earnedValuePackages) ? draft.earnedValuePackages : [];
        draft.earnedValuePackages = draft.earnedValuePackages.map((rowAny) =>
          (rowAny && rowAny.id === old.id
            ? { ...rowAny, status: 'superseded', supersededOn: check.today, supersededReason: reason }
            : rowAny));
        draft.earnedValuePackages.push(loaded);
        draft.earnedValueCases = (draft.earnedValueCases || []).map((rowAny) =>
          (rowAny && rowAny.id === caseId ? { ...rowAny, baselineVersion: newVersion } : rowAny));
      }, {
        type: EV_EVENTS.BASELINE_REVISED,
        entity: 'earnedValueCase',
        entityId: caseId,
        summary: `Baseline v${newVersion} of “${caseRow.label}”: package ${old.code} re-baselined. ${reason}`.slice(0, 300),
      });
      return saved({ packageId: id, supersededId: old.id, baselineVersion: newVersion });
    },

    /** Remove (supersede) one live package WITHOUT a replacement, on a written reason. */
    earnedValueRemovePackage(input = {}) {
      const check = seatFor(EV_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const cases = storedCases();
      const caseId = evText(input.caseId, 80);
      const caseRow = cases.find((row) => row.id === caseId) || null;
      if (!caseRow) return fail('That case is not on this record.', 'caseId', REFUSAL('case-unknown'));
      if (caseRow.status === 'withdrawn') return fail('This case was withdrawn.', 'caseId', REFUSAL('case-withdrawn'));
      const via = reachOf(check, caseRow.ownerId);
      if (!via) return fail('Only a seat that holds the case’s owner may remove a package from its baseline.', 'caseId', REFUSAL('case-owner-out-of-reach'));
      const packages = storedPackages(cases);
      const packageId = evText(input.packageId, 80);
      const old = packages.find((pkg) => pkg.id === packageId && pkg.caseId === caseId && pkg.status !== 'superseded') || null;
      if (!old) return fail('That package is not a live package of this case.', 'packageId', REFUSAL('package-unknown'));
      const reason = evText(input.reason, L.reasonMax);
      if (reason.length < L.reasonMin) return fail('Record why the package leaves the baseline, in at least a sentence.', 'reason', REFUSAL('rebaseline-reason-required'));
      const newVersion = (caseRow.baselineVersion || 0) + 1;
      store.update((draft) => {
        draft.earnedValuePackages = Array.isArray(draft.earnedValuePackages) ? draft.earnedValuePackages : [];
        draft.earnedValuePackages = draft.earnedValuePackages.map((rowAny) =>
          (rowAny && rowAny.id === old.id
            ? { ...rowAny, status: 'superseded', supersededOn: check.today, supersededReason: reason }
            : rowAny));
        draft.earnedValueCases = (draft.earnedValueCases || []).map((rowAny) =>
          (rowAny && rowAny.id === caseId ? { ...rowAny, baselineVersion: newVersion } : rowAny));
      }, {
        type: EV_EVENTS.BASELINE_REVISED,
        entity: 'earnedValueCase',
        entityId: caseId,
        summary: `Baseline v${newVersion} of “${caseRow.label}”: package ${old.code} removed. ${reason}`.slice(0, 300),
      });
      return saved({ supersededId: old.id, baselineVersion: newVersion });
    },

    /** Withdraw one case with a written reason. It stays on the record, out of every roll-up. */
    earnedValueWithdrawCase(input = {}) {
      const check = seatFor(EV_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const cases = storedCases();
      const caseId = evText(input.caseId, 80);
      const caseRow = cases.find((row) => row.id === caseId) || null;
      if (!caseRow) return fail('That case is not on this record.', 'caseId', REFUSAL('case-unknown'));
      if (caseRow.status === 'withdrawn') return fail('This case is already withdrawn.', 'caseId', REFUSAL('case-withdrawn'));
      const via = reachOf(check, caseRow.ownerId);
      if (!via) return fail('Only a seat that holds the case’s owner may withdraw it.', 'caseId', REFUSAL('case-owner-out-of-reach'));
      const reason = evText(input.reason, L.reasonMax);
      if (reason.length < 12) return fail('Record why the case is withdrawn, in at least a sentence.', 'reason');
      store.update((draft) => {
        draft.earnedValueCases = (draft.earnedValueCases || []).map((rowAny) =>
          (rowAny && rowAny.id === caseId
            ? { ...rowAny, status: 'withdrawn', withdrawnOn: check.today, withdrawnReason: reason }
            : rowAny));
      }, {
        type: EV_EVENTS.CASE_WITHDRAWN,
        entity: 'earnedValueCase',
        entityId: caseId,
        summary: `Earned-value case withdrawn on ${check.today}: ${caseRow.label}. ${reason}`.slice(0, 300),
      });
      return saved({ caseId });
    },

    /**
     * Record one reading: the share of EVERY live package that is done, under the
     * case's declared method, against one cut-off. Refused WHOLE when any live
     * package lacks a share — the missing packages are named.
     */
    earnedValueRecordReading(input = {}) {
      const check = seatFor(EV_RIGHTS.RECORD);
      if (!check.ok) return check;
      if (rows('earnedValueReadings').length >= L.readings) {
        return fail(`The reading register reached its ${L.readings}-row cap. Export the workspace before recording another reading.`, 'caseId', REFUSAL('cap-reached'));
      }
      const cases = storedCases();
      const caseId = evText(input.caseId, 80);
      const caseRow = cases.find((row) => row.id === caseId) || null;
      if (!caseRow) return fail('A reading belongs to a case this record holds.', 'caseId', REFUSAL('case-unknown'));
      if (caseRow.status === 'withdrawn') return fail('This case was withdrawn. A withdrawn case takes no new reading.', 'caseId', REFUSAL('case-withdrawn'));
      const packages = storedPackages(cases);
      const live = liveBaselineOf(packages, caseId);
      if (!live.length) return fail('This case has no live baseline yet. Add work packages before reading progress against them.', 'caseId', REFUSAL('unbaselined'));
      const cutoffDay = evDay(input.cutoffDay);
      if (!cutoffDay) return fail('Date the reading with a real calendar day (YYYY-MM-DD) — the cut-off the whole board reads against.', 'cutoffDay', REFUSAL('reading-date-required'));
      if (cutoffDay > check.today) return fail(`The reading is dated ${cutoffDay}, after today (${check.today}). A reading of work that has not happened is not a reading.`, 'cutoffDay', REFUSAL('reading-date-required'));
      if (cutoffDay < caseRow.declaredOn) return fail(`The reading is dated ${cutoffDay}, before the case was declared (${caseRow.declaredOn}). Evidence gathered before the plan existed is not evidence about the plan.`, 'cutoffDay', REFUSAL('reading-before-declared'));
      const method = evMethodByKey(caseRow.methodKey);
      // Shares: accept { packageId: pct } or [{ packageId, sharePct }].
      const rawShares = Array.isArray(input.shares)
        ? input.shares.map((row) => [row?.packageId, row?.sharePct])
        : Object.entries(input.shares && typeof input.shares === 'object' ? input.shares : {});
      const shares = [];
      const seen = new Set();
      for (const [packageIdRaw, pctRaw] of rawShares) {
        const packageId = evText(packageIdRaw, 80);
        const pct = Number(pctRaw);
        if (!packageId || !Number.isInteger(pct)) {
          return fail('Every share is a whole percent for one package of this case.', 'shares', REFUSAL('share-not-admitted'));
        }
        if (!live.some((pkg) => pkg.id === packageId)) {
          return fail('A share must name a LIVE package of this case.', 'shares', REFUSAL('share-unknown-package'));
        }
        if (method?.admits && !method.admits.includes(pct)) {
          const admitted = method.admits.join(', ');
          return fail(`Under the declared method (${method.label}) a package earns ${admitted} and nothing between. ${pct} is not one of them.`, 'shares', REFUSAL('share-not-admitted'));
        }
        if (pct < 0 || pct > 100) return fail('A share is an integer from 0 to 100.', 'shares', REFUSAL('share-not-admitted'));
        if (seen.has(packageId)) return fail('One share per package — the duplicate was refused.', 'shares', REFUSAL('share-unknown-package'));
        seen.add(packageId);
        shares.push({ packageId, sharePct: pct });
      }
      const missing = live.filter((pkg) => !seen.has(pkg.id)).map((pkg) => pkg.code);
      if (missing.length) {
        return fail(`Every live package needs a share in a reading. Missing: ${missing.join(', ')}. EV is refused rather than zero-filled; nothing was saved.`, 'shares', REFUSAL('reading-incomplete'));
      }
      const evidenceNote = evText(input.evidenceNote, L.evidenceMax);
      if (evidenceNote.length < L.evidenceMin) return fail('Name the evidence this reading read — the inspection, the milestone, the percent-complete review. Numbers with no source are a mood.', 'evidenceNote', REFUSAL('evidence-required'));
      const id = idFactory('evread');
      const row = {
        id, caseId, cutoffDay, methodKey: caseRow.methodKey, shares,
        evidenceNote, declaredById: check.actorId, decidedOn: check.today,
        baselineSignature: baselineSignature(caseId, live),
        withdrawnOn: null, withdrawnReason: '',
      };
      const loaded = normalizeEvReadings([row], cases, packages, [])[0];
      if (!loaded) return fail('The reading could not be stored as a row this register can read back. Nothing was saved.');
      store.update((draft) => {
        draft.earnedValueReadings = Array.isArray(draft.earnedValueReadings) ? draft.earnedValueReadings : [];
        draft.earnedValueReadings.push(loaded);
      }, {
        type: EV_EVENTS.READING_RECORDED,
        entity: 'earnedValueCase',
        entityId: caseId,
        summary: `Earned-value reading recorded on “${caseRow.label}” at cut-off ${cutoffDay}: ${live.length} package(s) measured.`.slice(0, 300),
      });
      return saved({ readingId: id, cutoffDay, packagesMeasured: live.length });
    },

    /** Withdraw a reading with a written reason. Only the recorder, or a seat holding the case owner. */
    earnedValueWithdrawReading(input = {}) {
      const check = seatFor(EV_RIGHTS.RECORD);
      if (!check.ok) return check;
      const cases = storedCases();
      const caseId = evText(input.caseId, 80);
      const caseRow = cases.find((row) => row.id === caseId) || null;
      if (!caseRow) return fail('That case is not on this record.', 'caseId', REFUSAL('case-unknown'));
      const packages = storedPackages(cases);
      const readings = storedReadings(cases, packages);
      const readingId = evText(input.readingId, 80);
      const reading = readings.find((row) => row.id === readingId && row.caseId === caseId) || null;
      if (!reading) return fail('That reading is not on this record.', 'readingId');
      if (reading.withdrawnOn || reading.status === 'withdrawn') return fail('This reading is already withdrawn.', 'readingId', REFUSAL('reading-withdrawn'));
      const isRecorder = check.actorId === reading.declaredById;
      const holdsOwner = reachOf(check, caseRow.ownerId) !== null;
      if (!isRecorder && !holdsOwner) {
        return fail('Only the seat that recorded a reading, or a seat that holds the case’s owner, may withdraw it.', 'readingId', REFUSAL('reading-withdraw-not-yours'));
      }
      const reason = evText(input.reason, L.reasonMax);
      if (reason.length < 12) return fail('Record why the reading is withdrawn, in at least a sentence.', 'reason');
      store.update((draft) => {
        draft.earnedValueReadings = (draft.earnedValueReadings || []).map((rowAny) =>
          (rowAny && rowAny.id === reading.id
            ? { ...rowAny, withdrawnOn: check.today, withdrawnReason: reason }
            : rowAny));
      }, {
        type: EV_EVENTS.READING_WITHDRAWN,
        entity: 'earnedValueCase',
        entityId: caseId,
        summary: `Earned-value reading withdrawn on ${check.today} (cut-off ${reading.cutoffDay}). ${reason}`.slice(0, 300),
      });
      return saved({ readingId: reading.id });
    },

    /** Record one actual cost at the case cut-off discipline — dated, never in the future. */
    earnedValueRecordActual(input = {}) {
      const check = seatFor(EV_RIGHTS.RECORD);
      if (!check.ok) return check;
      if (rows('earnedValueActuals').length >= L.actuals) {
        return fail(`The actuals register reached its ${L.actuals}-row cap. Export the workspace before recording another actual.`, 'caseId', REFUSAL('cap-reached'));
      }
      const cases = storedCases();
      const caseId = evText(input.caseId, 80);
      const caseRow = cases.find((row) => row.id === caseId) || null;
      if (!caseRow) return fail('An actual belongs to a case this record holds.', 'caseId', REFUSAL('case-unknown'));
      if (caseRow.status === 'withdrawn') return fail('This case was withdrawn. A withdrawn case takes no new actual.', 'caseId', REFUSAL('case-withdrawn'));
      const packages = storedPackages(cases);
      let packageId = null;
      if (typeof input.packageId === 'string' && input.packageId.trim() !== '') {
        packageId = evText(input.packageId, 80);
        if (!packages.some((pkg) => pkg.id === packageId && pkg.caseId === caseId)) {
          return fail('An actual must name a package of this case — or none, to be carried honestly as unallocated.', 'packageId', REFUSAL('actual-unknown-package'));
        }
      }
      const date = evDay(input.date);
      if (!date) return fail('Date the actual with a real calendar day (YYYY-MM-DD) — the day the cost was incurred.', 'date', REFUSAL('actual-date-required'));
      if (date > check.today) return fail(`The actual is dated ${date}, after today (${check.today}).`, 'date', REFUSAL('actual-date-required'));
      const amountCents = parseEvMoney(input.amount, { signed: false });
      if (amountCents === null || amountCents <= 0) return fail('State the amount as a positive figure, to the cent, in the case’s currency.', 'amount', REFUSAL('actual-amount-required'));
      const id = idFactory('evact');
      const row = {
        id, caseId, packageId, date, amountCents,
        note: evText(input.note, L.noteMax),
        source: evText(input.source, L.sourceMax),
        declaredById: check.actorId,
        withdrawnOn: null, withdrawnReason: '',
      };
      const loaded = normalizeEvActuals([row], cases, packages, [])[0];
      if (!loaded) return fail('The actual could not be stored as a row this register can read back. Nothing was saved.');
      store.update((draft) => {
        draft.earnedValueActuals = Array.isArray(draft.earnedValueActuals) ? draft.earnedValueActuals : [];
        draft.earnedValueActuals.push(loaded);
      }, {
        type: EV_EVENTS.ACTUAL_RECORDED,
        entity: 'earnedValueCase',
        entityId: caseId,
        summary: `Actual cost recorded on “${caseRow.label}”: ${(amountCents / 100).toFixed(2)} ${caseRow.currency} on ${date}${packageId ? '' : ' (unallocated)'}.`.slice(0, 300),
      });
      return saved({ actualId: id, unallocated: !packageId });
    },

    /** Withdraw an actual with a written reason. Only the recorder, or a seat holding the case owner. */
    earnedValueWithdrawActual(input = {}) {
      const check = seatFor(EV_RIGHTS.RECORD);
      if (!check.ok) return check;
      const cases = storedCases();
      const caseId = evText(input.caseId, 80);
      const caseRow = cases.find((row) => row.id === caseId) || null;
      if (!caseRow) return fail('That case is not on this record.', 'caseId', REFUSAL('case-unknown'));
      const packages = storedPackages(cases);
      const actuals = storedActuals(cases, packages);
      const actualId = evText(input.actualId, 80);
      const actual = actuals.find((row) => row.id === actualId && row.caseId === caseId) || null;
      if (!actual) return fail('That actual is not on this record.', 'actualId');
      if (actual.status === 'withdrawn' || actual.withdrawnOn) return fail('This actual is already withdrawn.', 'actualId', REFUSAL('actual-withdrawn'));
      const isRecorder = check.actorId === actual.declaredById;
      const holdsOwner = reachOf(check, caseRow.ownerId) !== null;
      if (!isRecorder && !holdsOwner) {
        return fail('Only the seat that recorded an actual, or a seat that holds the case’s owner, may withdraw it.', 'actualId', REFUSAL('actual-withdraw-not-yours'));
      }
      const reason = evText(input.reason, L.reasonMax);
      if (reason.length < 12) return fail('Record why the actual is withdrawn, in at least a sentence.', 'reason');
      store.update((draft) => {
        draft.earnedValueActuals = (draft.earnedValueActuals || []).map((rowAny) =>
          (rowAny && rowAny.id === actual.id
            ? { ...rowAny, withdrawnOn: check.today, withdrawnReason: reason }
            : rowAny));
      }, {
        type: EV_EVENTS.ACTUAL_WITHDRAWN,
        entity: 'earnedValueCase',
        entityId: caseId,
        summary: `Actual withdrawn on ${check.today} (incurred ${actual.date}). ${reason}`.slice(0, 300),
      });
      return saved({ actualId: actual.id });
    },

    /** Set the register's conventions. Out of bounds is refused; nothing is clamped. */
    earnedValueSetConventions(patch = {}) {
      const check = seatFor(EV_RIGHTS.GOVERN);
      if (!check.ok) return check;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return fail('Earned-value conventions must be supplied as a plain object. Nothing was saved.', 'settings');
      const names = new Map(Object.entries(EV_SETTING_KEYS).map(([name, key]) => [key, name]));
      const keys = Object.keys(patch);
      if (!keys.length) return fail('State at least one convention to update. Nothing was saved.', 'settings');
      for (const key of keys) {
        const name = names.get(key);
        if (!name) return fail(`“${key}” is not a declared earned-value convention. Nothing was saved.`, key);
        if (name === 'autoPropagate') {
          if (typeof patch[key] !== 'boolean') return fail('The automation switch takes true or false. Nothing was saved.', key);
          continue;
        }
        const [min, max] = EV_BOUNDS[name];
        if (!Number.isInteger(patch[key]) || patch[key] < min || patch[key] > max) {
          return fail(`${EV_SETTING_LABELS[name]} must be a whole number from ${min} to ${max}. Nothing was clamped and nothing was saved.`, key, REFUSAL('convention-out-of-bounds'));
        }
      }
      const next = normalizeEvSettings({ ...settings(), ...patch });
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: EV_EVENTS.CONVENTIONS,
        entity: 'settings',
        entityId: 'earned-value',
        summary: `Earned-value conventions set: ${keys.map((key) => `${key}=${patch[key]}`).join(', ')}.`.slice(0, 300),
      });
      return saved({ conventions: readEvSettings({ settings: { ...settings(), ...next } }) });
    },

    /** Re-evaluate the register now. The rule is what files asks. */
    earnedValueScan() {
      const check = seatFor(EV_RIGHTS.GOVERN);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: EV_EVENTS.SCAN,
        entity: 'workspace',
        entityId: `${EV_ROUTE}#${EV_RULE_ID}`,
        summary: `Earned-value register scan requested (${EV_RULE_ID}).`,
      });
      return { ok: true };
    },
  };
}

export const EARNED_VALUE_PAUSE_SWITCH = EV_SETTING_KEYS.autoPropagate;
