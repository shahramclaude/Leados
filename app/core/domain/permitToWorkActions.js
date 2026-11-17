/**
 * app/core/domain/permitToWorkActions.js — the seat-checked commands of the
 * Permit-to-Work, Energy-Isolation & Simultaneous-Operations Register (ADR-0246).
 *
 * EIGHT human acts and a scan: ISSUE a permit, APPLY an isolation, VERIFY it at
 * zero energy, REMOVE it, RECORD a gas reading, HAND OVER the permit, SUSPEND and
 * RESUME it, CLOSE it out, and re-declare the conventions. Every state, expiry,
 * proof verdict, atmosphere verdict and conflict is re-derived on read by
 * `permitToWork.js`; nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - A permit carries a WRITTEN BASIS, an AREA, a WORK REFERENCE, a WORK KIND, an
 *    ISSUING HAND, a HOLDER, a HOLDER'S LINE and a DECLARED VALIDITY, or it is
 *    refused. Authorising work on live plant against no written method is the act
 *    nobody can defend after the accident.
 *  - NOBODY ISSUES THEIR OWN PERMIT. The hand that authorises work is not the hand
 *    that performs it. The workspace operator seat is not a roster person, so this
 *    is never a block on a solo operator — but a named person cannot issue a permit
 *    to themselves, and an imported one is kept and printed by the loader.
 *  - ONE PERSON HOLDS ONE PERMIT AT A TIME. An overlapping validity for the same
 *    holder on another open permit is refused with the exact overlap, because
 *    nobody can personally hold two sets of isolations at once.
 *  - AN IGNITION PERMIT NEEDS A NAMED FIRE WATCH, or it is refused. Not a note, not
 *    a policy line — a named human, on the record.
 *  - A CONFINED-SPACE PERMIT NEEDS A DECLARED TEST PLAN, and each declared test
 *    needs a LIMIT the issuer typed. There is no default oxygen band, no default
 *    LEL limit and no default freshness window anywhere in this file. A permit with
 *    a default limit would authorise entry into an atmosphere nobody measured.
 *  - AN ENERGY-CONTROL PERMIT NEEDS AT LEAST ONE ISOLATION POINT DECLARED before
 *    work starts, and no isolation can be VERIFIED outside the permit's own declared
 *    verification window — the control the issuer declared is the control the record
 *    is held to.
 *  - ONE PERSON DOES NOT VERIFY THE ISOLATION THEY APPLIED. Where a second hand is
 *    available, the verifier must be somebody else; a self-verification is refused
 *    at the door and kept-and-printed by the loader if it is imported.
 *  - A PERMIT IS CLOSED WITH AN OUTCOME AND A NOTE, and if any isolation it applied
 *    is still in place, the door records the closure AND the outstanding isolation
 *    is printed as `closed-isolation-owed`. It does not silently restore the
 *    isolation and it does not refuse the closure — a closure that leaves a line
 *    isolated is a real event whose evidence must survive.
 *  - A GAS READING IS ACCEPTED EVEN WHEN IT FAILS THE LIMIT. A reading is a fact
 *    about the air. The door refuses to record a reading with no instrument, no
 *    hand, no instant, or at an instant before the permit's validity began; it never
 *    refuses a bad reading, because that would be the reason nobody records one.
 *
 * WHAT NO COMMAND CAN DO. There is no command that declares a plant safe, no
 * command that confirms a removal on somebody else's behalf, no command that
 * extends a validity retroactively, no command that clears a conflict by editing a
 * status, and no command that scores a person or a line. The absence of those
 * commands is the design.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import { buildPermitToWork, permitToWorkAttentionCount } from './permitToWork.js';
import {
  PTW_ATMOSPHERE_TEST_BY_KEY,
  PTW_CLOSURE_OUTCOME_BY_KEY,
  PTW_ENERGY_KIND_BY_KEY,
  PTW_EVENTS,
  PTW_LIMITS as L,
  PTW_METHOD,
  PTW_REFUSALS,
  PTW_RIGHTS,
  PTW_ROUTE,
  PTW_SETTING_KEYS,
  PTW_BOUNDS,
  PTW_WORK_KIND_BY_KEY,
} from './permitToWorkRegistry.js';
import {
  normalizePtwAtmosphere,
  normalizePtwClosures,
  normalizePtwHandovers,
  normalizePtwIsolations,
  normalizePtwPermits,
  normalizePtwSettings,
  normalizePtwSuspensions,
  ptwBasis,
  ptwFreshness,
  ptwInstant,
  ptwNote,
  ptwPlanEntry,
  ptwShort,
  ptwValidity,
  ptwVerifyWithin,
} from './permitToWorkSchema.js';
import { instantMs, overlapMs } from './permitToWorkMath.js';

const REFUSAL = (key) => `permitToWork:${key}`;
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function createPermitToWorkActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({ ok: false, error, ...(field ? { field } : {}), ...(refusal ? { refusal } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);
  // A caller's own warning (an isolation still recorded in place at closure, a
  // convention that bent a default) is NEVER swallowed by a clean persist: the two
  // are different facts and the caller sees both, newest first.
  const saved = (extra = {}) => {
    const { warning: own = null, ...rest } = extra;
    const persist = store.persistError || null;
    const warning = [own, persist].filter(Boolean).join(' ') || null;
    return { ...rest, saved: !persist, warning, propagations: store.lastPropagations || [], ok: true };
  };

  function seatFor(right) {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(PTW_REFUSALS.notSeated);
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg, actorId: seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null), today: dayKey(at) };
  }

  /**
   * A read is REGISTERED as safe and therefore bypasses the gateway's rank check —
   * so the right is re-proved HERE, exactly as every register in this workspace
   * re-proves it. Without this, which named crew is inside which space at this
   * minute would be readable by a seat the record class denies.
   */
  function readCheck() {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail(PTW_REFUSALS.notSeated);
    const verdict = canAct(PTW_RIGHTS.READ, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, at, cfg, today: dayKey(at) };
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

  function personContext(check, personId, field, message) {
    const id = text(personId, L.idMax) || null;
    if (!id) return fail(message, field);
    const person = rows('people').find((row) => row && row.id === id) || null;
    if (!person) return fail('That person is not on this record. Nothing was saved.', field, REFUSAL('person-not-found'));
    if (person.status === 'archived') return fail('That person is archived and cannot hold or issue a permit.', field, REFUSAL('person-archived'));
    if (!holdsPerson(check, id)) return fail(PTW_REFUSALS.noReach, field, REFUSAL('not-your-person'));
    return { ok: true, personId: id, person };
  }

  function writeDraft(mutate, event) {
    store.update((draft) => { mutate(draft); }, event);
    return true;
  }

  function livePermit(id) {
    return normalizePtwPermits(rows('ptwPermits'), []).find((row) => row.id === id) || null;
  }

  function liveIsolation(id) {
    const permits = normalizePtwPermits(rows('ptwPermits'), []);
    return normalizePtwIsolations(rows('ptwIsolations'), permits, []).find((row) => row.id === id) || null;
  }

  /** The instant a write names, defaulting to the injected clock and never to the future. */
  function writeInstant(check, value, field) {
    if (value === undefined || value === null || value === '') return { at: check.at.toISOString() };
    const at = ptwInstant(value);
    if (!at) return { error: fail('Give a real instant.', field, REFUSAL('instant-invalid')) };
    if (instantMs(at) > check.at.getTime()) {
      return { error: fail('That instant is in the future. This register records what a human declared or did, not what will be.', field, REFUSAL('instant-future')) };
    }
    return { at };
  }

  /** The active roster this seat may name, resolved once for every read and every form. */
  function candidatePeople(check) {
    return rows('people')
      .filter((row) => row && row.status !== 'archived' && row.id)
      .filter((row) => holdsPerson(check, row.id))
      .map((row) => ({ id: row.id, name: row.name || row.id, role: row.role || '' }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  /** An optional note that must survive the loader exactly or be empty. */
  function ptwOptionalNoteSafe(value) {
    return text(value, L.textMax);
  }

  return {
    /* ---------------------------------------------------------------- reads */

    /**
     * THE READ SURFACE. Every read re-proves the right inside the action, because a
     * module whose reads are absent from the gateway is unreadable under enforcement
     * while its writes are still gated — and whether the plant a crew is about to
     * touch is proved dead would vanish the moment enforcement was turned on.
     */
    permitToWorkReport() {
      const check = readCheck();
      if (!check.ok) return check;
      const report = buildPermitToWork(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
      return { ok: true, report, peopleOptions: candidatePeople(check) };
    },

    permitToWorkAttention() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, count: permitToWorkAttentionCount(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    /**
     * The people this seat may name. The ISSUER is deliberately NOT excluded here:
     * the door refuses a self-issue by name, and hiding the seat's own name from the
     * list would turn a refusal that explains itself into a person who appears to be
     * missing from the roster.
     */
    permitToWorkCandidates() {
      const check = readCheck();
      if (!check.ok) return check;
      return { ok: true, people: candidatePeople(check) };
    },

    /* ------------------------------------------------------------ the permit */

    /**
     * ISSUE a permit: work reference, area, work kind, authority kind, holder and
     * their line, written basis, declared validity, and — for an ignition kind — a
     * named fire watch, and — for an atmosphere kind — a declared test plan with a
     * limit and a freshness window on every test.
     */
    permitToWorkIssue(input = {}) {
      const check = seatFor(PTW_RIGHTS.ISSUE);
      if (!check.ok) return check;

      const workRef = ptwShort(input.workRef);
      if (!workRef) return fail(`Name the job this permit authorises, in at least ${L.shortMin} characters.`, 'workRef', REFUSAL('work-ref-invalid'));
      const areaRef = ptwShort(input.areaRef);
      if (!areaRef) return fail(`Name the plant, area or unit the permit covers, in at least ${L.shortMin} characters.`, 'areaRef', REFUSAL('area-invalid'));

      const workKind = text(input.workKind, 60);
      const kindDef = PTW_WORK_KIND_BY_KEY[workKind];
      if (!kindDef) return fail('Choose the kind of work being permitted. The controls each kind requires are different, so “somehow” is refused.', 'workKind', REFUSAL('work-kind-invalid'));

      /**
       * DOES THIS PERMIT REQUIRE PROVEN ENERGY CONTROL? The issuer DECLARES it. Where
       * the work kind inherently touches stored energy the door forces it true and
       * says so; everywhere else the answer is a human decision on the permit, because
       * "the issuer did not say" and "no isolation is needed" must never read the same.
       */
      const declaredEnergy = input.energyControl === true || input.energyControl === 'true';
      if (kindDef.inherentlyEnergy && input.energyControl === false) {
        return fail(`A ${kindDef.label.toLowerCase()} permit inherently touches stored energy, so it cannot be issued without declared energy control. If no isolation is required, choose a work kind that does not carry the hazard — the register will not let a permit waive the control its own kind demands.`, 'energyControl', REFUSAL('energy-control-forced'));
      }
      const energyControl = kindDef.inherentlyEnergy ? true : declaredEnergy;

      const authorityKind = text(input.authorityKind, 40);
      if (!['single', 'group', 'contractor'].includes(authorityKind)) {
        return fail('Choose how the work is permitted: a single permit, a group isolation permit, or a contractor permit.', 'authorityKind', REFUSAL('authority-kind-invalid'));
      }

      const holder = personContext(check, input.holderId, 'holderId', 'Name the person who will hold this permit and work under it.');
      if (!holder.ok) return holder;
      if (!check.seat.fullAccess && holder.personId === check.actorId) {
        return fail('Nobody issues their own permit. The hand that authorises the work is not the hand that performs it; ask the seat above you to issue it.', 'holderId', REFUSAL('self-issue'));
      }

      const basisRef = ptwBasis(input.basisRef);
      if (!basisRef) {
        return fail(`Cite the written method statement or assessment this permit rests on, in at least ${L.basisMin} characters — its reference and revision. A permit with no method is a signature, not an authorisation.`, 'basisRef', REFUSAL('basis-missing'));
      }

      const validityMinutes = ptwValidity(Number(input.validityMinutes));
      if (validityMinutes === null) {
        return fail(`The validity is a whole number of minutes between ${L.validityMin} and ${L.validityMax}. There is no default: a permit whose end instant nobody chose would run against a deadline no human set.`, 'validityMinutes', REFUSAL('validity-invalid'));
      }

      const from = writeInstant(check, input.validFromAt, 'validFromAt');
      if (from.error) return from.error;
      const flight = input.flightFromAt === undefined || input.flightFromAt === null || input.flightFromAt === ''
        ? { at: null }
        : ptwInstant(input.flightFromAt) ? { at: ptwInstant(input.flightFromAt) } : { error: fail('Give a real first-entry instant, or leave it empty.', 'flightFromAt', REFUSAL('flight-invalid')) };
      if (flight.error) return flight.error;

      const startMs = instantMs(from.at);
      // A permit more than the declared horizon ahead is a plan, not an authorisation.
      const conventions = normalizePtwSettings(settings());
      const aheadDays = Math.floor((startMs - check.at.getTime()) / 86_400_000);
      if (aheadDays > conventions[PTW_SETTING_KEYS.horizonDays]) {
        return fail(`A permit more than ${conventions[PTW_SETTING_KEYS.horizonDays]} day(s) ahead cannot be authorised: the crew, the plant state and the isolation need to be known at issue. Re-declare it inside the declared horizon.`, 'validFromAt', REFUSAL('start-too-far'));
      }
      if (aheadDays < -L.backfillMaxDays) {
        return fail(`A permit cannot be recorded more than ${L.backfillMaxDays} days after it began; the isolations and tests it needed would already be missing, and a backfilled record would read as a control that ran.`, 'validFromAt', REFUSAL('start-too-old'));
      }
      if (flight.at && instantMs(flight.at) < startMs) {
        return fail('The declared first-entry instant cannot precede the permit’s own validity start.', 'flightFromAt', REFUSAL('flight-before-start'));
      }
      if (flight.at && instantMs(flight.at) > startMs + validityMinutes * 60_000) {
        return fail('The declared first-entry instant falls after the permit’s validity ends; nobody could make a first entry under it.', 'flightFromAt', REFUSAL('flight-after-end'));
      }

      /* ---- separation of duties, in the graph, not only in the form ---- */
      const issuerHoldsPerson = holdsPerson(check, holder.personId);

      /* ---- the declared testing plan ---- */
      const rawPlan = Array.isArray(input.atmospherePlan) ? input.atmospherePlan : [];
      if (kindDef.atmosphere && rawPlan.length === 0) {
        return fail(`A ${kindDef.label.toLowerCase()} permit requires a declared test plan before it can be issued. Choose the tests this space will be held to and the limit and freshness window on each; there are no defaults, because a default limit is an authorisation nobody gave.`, 'atmospherePlan', REFUSAL('plan-missing'));
      }
      const plan = [];
      const planKeys = new Set();
      for (const raw of rawPlan) {
        const entry = ptwPlanEntry(raw);
        if (!entry) {
          return fail(`Every declared test needs a published test name, a limit inside the instrument's own range, and a freshness window between ${L.freshnessMin} and ${L.freshnessMax} whole minutes. One entry could not be read and the whole permit is refused rather than issued with a gap.`, 'atmospherePlan', REFUSAL('plan-entry-invalid'));
        }
        if (planKeys.has(entry.testKey)) {
          return fail('Two limits for the same gas is two controls for one hazard. Declare each test once.', 'atmospherePlan', REFUSAL('plan-duplicate'));
        }
        planKeys.add(entry.testKey);
        plan.push(entry);
      }
      if (kindDef.ignition && !text(input.fireWatchId, L.idMax)) {
        return fail('A hot-work permit needs a named fire watch before it is issued. The fire watch may be the holder only where the site procedure says so; it must be a named human on the record either way.', 'fireWatchId', REFUSAL('fire-watch-missing'));
      }
      const fireWatchId = text(input.fireWatchId, L.idMax) || null;
      if (fireWatchId) {
        const watch = personContext(check, fireWatchId, 'fireWatchId', 'Name the fire watch on this record.');
        if (!watch.ok) return watch;
      }

      const crewIds = Array.isArray(input.crewIds)
        ? [...new Set(input.crewIds.map((value) => text(value, L.idMax)).filter(Boolean))]
        : [];
      const crew = rows('people');
      for (const crewId of crewIds) {
        if (!crew.some((row) => row && row.id === crewId && row.status !== 'archived')) {
          return fail('One of the named crew is not an active person on this record. Nothing was saved.', 'crewIds', REFUSAL('crew-not-found'));
        }
      }

      /* ---- one holder, one live permit ---- */
      const existing = normalizePtwPermits(rows('ptwPermits'), []);
      if (existing.length >= L.permits) return fail('The permit ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));
      const closesByPermit = new Map(normalizePtwClosures(rows('ptwClosures'), existing, []).map((row) => [row.permitId, row]));
      const endMs = startMs + validityMinutes * 60_000;
      for (const other of existing) {
        if (other.holderId !== holder.personId) continue;
        const closed = closesByPermit.get(other.id);
        if (closed) continue;
        const otherStart = instantMs(other.validFromAt);
        const otherEnd = otherStart + other.validityMinutes * 60_000;
        if (overlapMs(startMs, endMs, otherStart, otherEnd) > 0) {
          return fail(`That person already holds an open permit over part of this window. Nobody can personally hold two sets of isolations at once, and two overlapping permits would each be honoured by a different hand. Declare a later window, or close or suspend the existing permit.`, 'validFromAt', REFUSAL('holder-overlap'));
        }
      }

      const id = idFactory('ptw-permit');
      const nowIso = check.at.toISOString();
      const row = {
        id,
        workRef,
        areaRef,
        workKind,
        authorityKind,
        holderId: holder.personId,
        issuerId: check.actorId,
        lineManagerId: check.actorId,
        basisRef,
        validityMinutes,
        validFromAt: from.at,
        flightFromAt: flight.at,
        fireWatchId,
        crewIds,
        energyControl,
        atmospherePlan: plan.map((entry) => ({
          testKey: entry.testKey,
          limitMin: entry.limitMin,
          limitMax: entry.limitMax,
          freshnessMinutes: entry.freshnessMinutes,
        })),
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const loaded = normalizePtwPermits([...rows('ptwPermits'), row], []);
      const storedRow = loaded.find((candidate) => candidate.id === id) || null;
      if (!storedRow) return fail('The permit could not be stored as a row this register can read back. Nothing was saved.', 'basisRef', REFUSAL('unreadable'));

      let selfCheck = null;
      if (issuerHoldsPerson && holder.personId === check.actorId) selfCheck = 'self-issue';
      if (selfCheck) return fail('Nobody issues their own permit. Ask the seat above you.', 'holderId', REFUSAL('self-issue'));

      writeDraft((draft) => {
        draft.ptwPermits = Array.isArray(draft.ptwPermits) ? draft.ptwPermits : [];
        draft.ptwPermits.push(storedRow);
      }, {
        type: PTW_EVENTS.PERMIT_ISSUED,
        entity: 'person',
        entityId: holder.personId,
        summary: `Permit ${workRef} issued for ${kindDef.label.toLowerCase()} in ${areaRef}, valid ${validityMinutes} minute(s) from ${from.at}, against ${basisRef} (${PTW_ROUTE} register).`.slice(0, 300),
      });
      return saved({ id, permit: storedRow });
    },

    /* -------------------------------------------------------------- isolation */

    /**
     * APPLY an isolation to a permit: the point, the lock or tag reference, the
     * energy kind, the instant it went on, and the verification window this permit
     * allows. The window is a human decision about this plant — there is no default.
     */
    permitToWorkApplyIsolation(input = {}) {
      const check = seatFor(PTW_RIGHTS.ACT);
      if (!check.ok) return check;
      const permitId = text(input.permitId, L.idMax) || null;
      if (!permitId) return fail('Name the permit this isolation protects.', 'permitId');
      const permit = livePermit(permitId);
      if (!permit) return fail(PTW_REFUSALS.notFound, 'permitId', REFUSAL('permit-not-found'));

      const pointRef = ptwShort(input.pointRef);
      if (!pointRef) return fail(`Name the isolation point — the valve, the breaker, the flange — in at least ${L.shortMin} characters.`, 'pointRef', REFUSAL('point-invalid'));
      const lockRef = ptwShort(input.lockRef);
      if (!lockRef) return fail(`Give the lock or tag reference actually applied to it, in at least ${L.shortMin} characters. A lock nobody can find is a lock nobody can remove.`, 'lockRef', REFUSAL('lock-invalid'));
      const energyKind = text(input.energyKind, 40);
      if (!PTW_ENERGY_KIND_BY_KEY[energyKind]) {
        return fail('Choose the kind of energy this isolation controls. The proof a human has to make differs by energy kind, and the register never substitutes one for another.', 'energyKind', REFUSAL('energy-kind-invalid'));
      }
      const verifyWithinMinutes = ptwVerifyWithin(Number(input.verifyWithinMinutes));
      if (verifyWithinMinutes === null) {
        return fail(`The verification window is a whole number of minutes between ${L.verifyWithinMin} and ${L.verifyWithinMax}. It is a decision about this plant and this task, and has no default.`, 'verifyWithinMinutes', REFUSAL('verify-window-invalid'));
      }

      const applied = writeInstant(check, input.appliedAt, 'appliedAt');
      if (applied.error) return applied.error;
      /**
       * NO REFUSAL FOR AN EARLIER INSTANT HERE, DELIBERATELY. The correct industrial
       * sequence is to make the plant safe, prove it dead, and only then authorise
       * work under the permit — so an isolation applied before the permit's validity
       * start is the normal case, not an error. Refusing it would force a crew to
       * record a false time for the one act that keeps them alive.
       */

      const existing = normalizePtwIsolations(rows('ptwIsolations'), normalizePtwPermits(rows('ptwPermits'), []), []);
      if (existing.length >= L.isolations) return fail('The isolation ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));
      if (existing.some((row) => row.permitId === permitId
        && row.pointRef.toLowerCase() === pointRef.toLowerCase()
        && row.lockRef.toLowerCase() === lockRef.toLowerCase())) {
        return fail('That point and lock are already recorded on this permit. One lock counted twice would inflate every coverage figure.', 'lockRef', REFUSAL('isolation-duplicate'));
      }

      const id = idFactory('ptw-iso');
      const nowIso = check.at.toISOString();
      const row = {
        id,
        permitId,
        pointRef,
        lockRef,
        energyKind,
        appliedAt: applied.at,
        appliedById: check.actorId,
        verifyWithinMinutes,
        verifiedAt: null,
        verifiedById: null,
        removedAt: null,
        removedById: null,
        removalConfirmedById: null,
        removalNote: '',
        createdAt: nowIso,
      };
      const permitsForLoad = normalizePtwPermits(rows('ptwPermits'), []);
      const loaded = normalizePtwIsolations([...rows('ptwIsolations'), row], permitsForLoad, []);
      const storedRow = loaded.find((candidate) => candidate.id === id) || null;
      if (!storedRow) return fail('The isolation could not be stored as a row this register can read back. Nothing was saved.', 'lockRef', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.ptwIsolations = Array.isArray(draft.ptwIsolations) ? draft.ptwIsolations : [];
        draft.ptwIsolations.push(storedRow);
      }, {
        type: PTW_EVENTS.ISOLATION_APPLIED,
        entity: 'permitToWork',
        entityId: permitId,
        summary: `Isolation applied on ${pointRef} (lock ${lockRef}) for permit ${permit.workRef}, to be proved within ${verifyWithinMinutes} minute(s) (${PTW_ROUTE} register).`.slice(0, 300),
      });
      return saved({ id, isolation: storedRow });
    },

    /**
     * VERIFY an isolation at zero energy. The verifier must not be the hand that
     * applied it, and the proof must fall inside the permit's own declared
     * verification window. A verification outside that window is refused at the
     * door; if one arrives by import the reader prints it as overdue with the exact
     * minutes rather than treating it as a proof.
     */
    permitToWorkVerifyIsolation(input = {}) {
      const check = seatFor(PTW_RIGHTS.ACT);
      if (!check.ok) return check;
      const isolationId = text(input.isolationId, L.idMax) || null;
      if (!isolationId) return fail('Name the isolation being proved.', 'isolationId');
      const isolation = liveIsolation(isolationId);
      if (!isolation) return fail(PTW_REFUSALS.notFound, 'isolationId', REFUSAL('isolation-not-found'));
      if (isolation.removedAt) return fail('That isolation has already been removed. A proof recorded after removal would be a proof about plant that is back in service.', 'isolationId', REFUSAL('isolation-removed'));

      if (!check.seat.fullAccess && check.actorId === isolation.appliedById) {
        return fail('The hand that applied the isolation cannot also be the hand that proves it, where a second competent person is available. Ask somebody else to record the proof at the point of work.', 'isolationId', REFUSAL('self-verification'));
      }
      const method = text(input.verifiedBy, L.textMax);
      if (method.length < L.textMin || method.length > L.textMax) {
        return fail(`Record how the zero-energy state was proved, in at least ${L.textMin} characters: what was tested, at the point of work, and what it read. “Verified” is a claim nobody can review.`, 'verifiedBy', REFUSAL('verification-method-missing'));
      }
      const verified = writeInstant(check, input.verifiedAt, 'verifiedAt');
      if (verified.error) return verified.error;

      const appliedMs = instantMs(isolation.appliedAt);
      const verifiedMs = instantMs(verified.at);
      if (verifiedMs < appliedMs) return fail('A proof cannot precede the isolation it proves.', 'verifiedAt', REFUSAL('verify-before-apply'));
      const delta = Math.floor((verifiedMs - appliedMs) / 60_000);
      if (delta > isolation.verifyWithinMinutes) {
        return fail(`That proof is ${delta} whole minute(s) after the isolation was applied, outside the ${isolation.verifyWithinMinutes}-minute verification window this permit declared. The window is the control the issuer chose. If the plant has been isolated longer than that, take the isolation off and re-apply it with a fresh window, so the record shows a proof that belongs to the plant state that exists now.`, 'verifiedAt', REFUSAL('verify-outside-window'));
      }

      const permits = normalizePtwPermits(rows('ptwPermits'), []);
      const updated = normalizePtwIsolations(rows('ptwIsolations').map((row) => (row && row.id === isolationId
        ? { ...row, verifiedAt: verified.at, verifiedById: check.actorId, verifiedBy: undefined, verificationNote: undefined }
        : row)), permits, []);
      const storedRow = updated.find((row) => row.id === isolationId) || null;
      if (!storedRow) return fail('The proof could not be stored as a row this register can read back. Nothing was saved.', 'isolationId', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.ptwIsolations = Array.isArray(draft.ptwIsolations) ? draft.ptwIsolations : [];
        draft.ptwIsolations = draft.ptwIsolations.map((row) => (row && row.id === isolationId
          ? { ...row, verifiedAt: storedRow.verifiedAt, verifiedById: storedRow.verifiedById }
          : row));
      }, {
        type: PTW_EVENTS.ISOLATION_VERIFIED,
        entity: 'permitToWork',
        entityId: storedRow.permitId,
        summary: `Isolation ${isolation.pointRef} proved at zero energy ${delta} whole minute(s) after application, inside the declared ${isolation.verifyWithinMinutes}-minute window (${PTW_ROUTE} register).`.slice(0, 300),
      });
      return saved({ id: storedRow.id, isolation: storedRow, minutesAfterApplied: delta, method });
    },

    /**
     * REMOVE an isolation. A removal is an act, and a confirmation by a named hand
     * is a SEPARATE act — this command records the removal and, where a second hand
     * confirms it, the confirmation. A removal with no confirmation reads
     * `removed-unconfirmed`, which is exactly what the record knows.
     */
    permitToWorkRemoveIsolation(input = {}) {
      const check = seatFor(PTW_RIGHTS.ACT);
      if (!check.ok) return check;
      const isolationId = text(input.isolationId, L.idMax) || null;
      const isolation = isolationId ? liveIsolation(isolationId) : null;
      if (!isolation) return fail(PTW_REFUSALS.notFound, 'isolationId', REFUSAL('isolation-not-found'));
      if (isolation.removedAt) return fail('That isolation is already recorded as removed. A second removal would overwrite the instant the plant came back into service.', 'isolationId', REFUSAL('isolation-already-removed'));

      const removed = writeInstant(check, input.removedAt, 'removedAt');
      if (removed.error) return removed.error;
      if (instantMs(removed.at) <= instantMs(isolation.appliedAt)) return fail('A removal cannot precede the isolation it removes.', 'removedAt', REFUSAL('remove-before-apply'));

      const note = ptwNote(input.note);
      if (!note) return fail(`Record what was actually done before the energy was restored, in at least ${L.textMin} characters. Restoring energy is the act that hurts people, and the note is the record of who checked what.`, 'note', REFUSAL('removal-note-missing'));

      // THE CONFIRMATION IS OPTIONAL AND EXPLICIT. It is a named second hand.
      const confirmId = text(input.confirmedById, L.idMax) || null;
      if (confirmId) {
        const confirm = personContext(check, confirmId, 'confirmedById', 'Name the hand confirming the removal.');
        if (!confirm.ok) return confirm;
      }

      const permits = normalizePtwPermits(rows('ptwPermits'), []);
      const updated = normalizePtwIsolations(rows('ptwIsolations').map((row) => (row && row.id === isolationId
        ? {
          ...row,
          removedAt: removed.at,
          removedById: check.actorId,
          removalConfirmedById: confirmId,
          removalNote: note,
        }
        : row)), permits, []);
      const storedRow = updated.find((row) => row.id === isolationId) || null;
      if (!storedRow) return fail('The removal could not be stored as a row this register can read back. Nothing was saved.', 'isolationId', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.ptwIsolations = Array.isArray(draft.ptwIsolations) ? draft.ptwIsolations : [];
        draft.ptwIsolations = draft.ptwIsolations.map((row) => (row && row.id === isolationId
          ? {
            ...row,
            removedAt: storedRow.removedAt,
            removedById: storedRow.removedById,
            removalConfirmedById: storedRow.removalConfirmedById,
            removalNote: storedRow.removalNote,
          }
          : row));
      }, {
        type: PTW_EVENTS.ISOLATION_REMOVED,
        entity: 'permitToWork',
        entityId: isolation.permitId,
        summary: `Isolation ${isolation.pointRef} removed${confirmId ? ' and confirmed' : ' with no confirmation recorded'} (${PTW_ROUTE} register).`.slice(0, 300),
      });
      return saved({ id: storedRow.id, isolation: storedRow, confirmed: Boolean(confirmId) });
    },

    /* ------------------------------------------------------------- atmosphere */

    /**
     * RECORD a gas reading. The reading is stored exactly as measured, even when it
     * fails the permit's limit, because a reading is a fact about the air and a
     * register that refused bad readings would be the reason nobody took one.
     */
    permitToWorkRecordAtmosphere(input = {}) {
      const check = seatFor(PTW_RIGHTS.ACT);
      if (!check.ok) return check;
      const permitId = text(input.permitId, L.idMax) || null;
      const permit = permitId ? livePermit(permitId) : null;
      if (!permit) return fail(PTW_REFUSALS.notFound, 'permitId', REFUSAL('permit-not-found'));

      const testKey = text(input.testKey, 40);
      const def = PTW_ATMOSPHERE_TEST_BY_KEY[testKey];
      if (!def) return fail('Choose which gas was measured. A reading of a gas the permit did not declare cannot be compared to anything.', 'testKey', REFUSAL('test-invalid'));
      if (!permit.atmospherePlan.some((entry) => entry.testKey === testKey)) {
        return fail('This permit did not declare that test. Add the test and its limit to the permit first; a reading of a gas nobody declared has no limit to be held to.', 'testKey', REFUSAL('test-not-declared'));
      }
      const reading = Number(input.reading);
      if (!Number.isFinite(reading)) return fail('Give the reading exactly as the instrument showed it. A blank is not a reading.', 'reading', REFUSAL('reading-invalid'));
      if (reading < def.readingMin || reading > def.readingMax) {
        return fail(`That reading is outside the instrument's published range for ${def.label} (${def.readingMin}–${def.readingMax} ${def.unit}). Check the instrument and the units before recording it.`, 'reading', REFUSAL('reading-out-of-range'));
      }
      const instrumentRef = ptwShort(input.instrumentRef);
      if (!instrumentRef) return fail(`Give the instrument's own reference, in at least ${L.shortMin} characters. A reading with no instrument cannot be checked or recalled.`, 'instrumentRef', REFUSAL('instrument-missing'));
      const tested = writeInstant(check, input.testedAt, 'testedAt');
      if (tested.error) return tested.error;
      /**
       * A PRE-ENTRY TEST IS ROUTINELY TAKEN BEFORE THE PERMIT GOES LIVE — it is what
       * proves the space fit to enter. The permit's own freshness window bounds how
       * old that reading may be when work starts, so refusing it here would refuse
       * the test the control depends on.
       */

      const id = idFactory('ptw-atm');
      const nowIso = check.at.toISOString();
      const row = {
        id,
        permitId,
        testKey,
        reading,
        testedAt: tested.at,
        testedById: check.actorId,
        instrumentRef,
        note: ptwOptionalNoteSafe(input.note),
        createdAt: nowIso,
      };
      const permits = normalizePtwPermits(rows('ptwPermits'), []);
      const loaded = normalizePtwAtmosphere([...rows('ptwAtmosphere'), row], permits, []);
      const storedRow = loaded.find((candidate) => candidate.id === id) || null;
      if (!storedRow) return fail('The reading could not be stored as a row this register can read back. Nothing was saved.', 'reading', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.ptwAtmosphere = Array.isArray(draft.ptwAtmosphere) ? draft.ptwAtmosphere : [];
        draft.ptwAtmosphere.push(storedRow);
      }, {
        type: PTW_EVENTS.ATMOSPHERE_RECORDED,
        entity: 'permitToWork',
        entityId: permitId,
        summary: `${def.label} reading of ${reading} ${def.unit} recorded on instrument ${instrumentRef} for permit ${permit.workRef} (${PTW_ROUTE} register).`.slice(0, 300),
      });
      return saved({ id, reading: storedRow });
    },

    /* --------------------------------------------------------------- handover */

    /** HAND the permit over to another named holder. */
    permitToWorkHandover(input = {}) {
      const check = seatFor(PTW_RIGHTS.ACT);
      if (!check.ok) return check;
      const permitId = text(input.permitId, L.idMax) || null;
      const permit = permitId ? livePermit(permitId) : null;
      if (!permit) return fail(PTW_REFUSALS.notFound, 'permitId', REFUSAL('permit-not-found'));
      const to = personContext(check, input.toId, 'toId', 'Name the person taking the permit over.');
      if (!to.ok) return to;
      if (to.personId === permit.holderId) return fail('That person already holds this permit. A handover to the current holder records nothing.', 'toId', REFUSAL('handover-same-holder'));
      const at = writeInstant(check, input.at, 'at');
      if (at.error) return at.error;
      if (instantMs(at.at) < instantMs(permit.validFromAt)) return fail('A handover cannot precede the permit.', 'at', REFUSAL('handover-before-permit'));
      const note = ptwNote(input.note);
      if (!note) return fail(`Record what the outgoing holder told the incoming one, in at least ${L.textMin} characters: what is isolated, what is still live, and what has changed since the permit was issued.`, 'note', REFUSAL('handover-note-missing'));

      const id = idFactory('ptw-ho');
      const row = { id, permitId, fromId: permit.holderId, toId: to.personId, at: at.at, note, createdAt: check.at.toISOString() };
      const permits = normalizePtwPermits(rows('ptwPermits'), []);
      const loaded = normalizePtwHandovers([...rows('ptwHandovers'), row], permits, []);
      const storedRow = loaded.find((candidate) => candidate.id === id) || null;
      if (!storedRow) return fail('The handover could not be stored as a row this register can read back. Nothing was saved.', 'note', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.ptwHandovers = Array.isArray(draft.ptwHandovers) ? draft.ptwHandovers : [];
        draft.ptwHandovers.push(storedRow);
      }, {
        type: PTW_EVENTS.HANDOVER_ACCEPTED,
        entity: 'permitToWork',
        entityId: permitId,
        summary: `Permit ${permit.workRef} handed over to ${to.person.name || to.personId} (${PTW_ROUTE} register).`.slice(0, 300),
      });
      return saved({ id, handover: storedRow });
    },

    /* ------------------------------------------------------ suspend and resume */

    /** SUSPEND a permit: work stops, and the isolation must be retained. */
    permitToWorkSuspend(input = {}) {
      const check = seatFor(PTW_RIGHTS.ACT);
      if (!check.ok) return check;
      const permitId = text(input.permitId, L.idMax) || null;
      const permit = permitId ? livePermit(permitId) : null;
      if (!permit) return fail(PTW_REFUSALS.notFound, 'permitId', REFUSAL('permit-not-found'));
      const reason = ptwNote(input.reason);
      if (!reason) return fail(`Record why the permit is suspended, in at least ${L.textMin} characters. A suspension with no reason cannot be resumed by anybody who reads it.`, 'reason', REFUSAL('suspension-reason-missing'));
      const at = writeInstant(check, input.suspendedAt, 'suspendedAt');
      if (at.error) return at.error;
      if (instantMs(at.at) < instantMs(permit.validFromAt)) return fail('A suspension cannot precede the permit.', 'suspendedAt', REFUSAL('suspend-before-permit'));

      const permits = normalizePtwPermits(rows('ptwPermits'), []);
      const existing = normalizePtwSuspensions(rows('ptwSuspensions'), permits, []);
      if (existing.length >= L.suspensions) return fail('The suspension ledger is full. Export the workspace before proceeding.', null, REFUSAL('ledger-full'));
      if (existing.some((row) => row.permitId === permitId && !row.resumedAt)) {
        return fail('This permit is already suspended and has not been resumed. Resume it before recording another suspension.', 'permitId', REFUSAL('already-suspended'));
      }

      const id = idFactory('ptw-sus');
      const row = { id, permitId, suspendedAt: at.at, suspendedById: check.actorId, reason, resumedAt: null, resumedById: null, resumeNote: '', createdAt: check.at.toISOString() };
      const loaded = normalizePtwSuspensions([...rows('ptwSuspensions'), row], permits, []);
      const storedRow = loaded.find((candidate) => candidate.id === id) || null;
      if (!storedRow) return fail('The suspension could not be stored as a row this register can read back. Nothing was saved.', 'reason', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.ptwSuspensions = Array.isArray(draft.ptwSuspensions) ? draft.ptwSuspensions : [];
        draft.ptwSuspensions.push(storedRow);
      }, {
        type: PTW_EVENTS.PERMIT_SUSPENDED,
        entity: 'permitToWork',
        entityId: permitId,
        summary: `Permit ${permit.workRef} suspended (${PTW_ROUTE} register).`.slice(0, 300),
      });
      return saved({ id, suspension: storedRow });
    },

    /**
     * RESUME a suspended permit. The resumption is a SEPARATE dated act by a named
     * hand, and it does not restore the state before the suspension: the permit is
     * re-read against the record, so an isolation removed while it was suspended
     * reads as unproved rather than as it was.
     */
    permitToWorkResume(input = {}) {
      const check = seatFor(PTW_RIGHTS.ACT);
      if (!check.ok) return check;
      const permitId = text(input.permitId, L.idMax) || null;
      if (!permitId) return fail('Name the permit being resumed.', 'permitId');
      const permits = normalizePtwPermits(rows('ptwPermits'), []);
      const suspensions = normalizePtwSuspensions(rows('ptwSuspensions'), permits, []);
      const open = suspensions.find((row) => row.permitId === permitId && !row.resumedAt) || null;
      if (!open) return fail('That permit has no suspension waiting to be resumed. Nothing was saved.', 'permitId', REFUSAL('nothing-to-resume'));
      const at = writeInstant(check, input.resumedAt, 'resumedAt');
      if (at.error) return at.error;
      if (instantMs(at.at) <= instantMs(open.suspendedAt)) return fail('A resumption must follow the suspension it ends.', 'resumedAt', REFUSAL('resume-before-suspend'));
      const note = ptwNote(input.note);
      if (!note) return fail(`Record what was re-checked before work restarted, in at least ${L.textMin} characters. A resumption that re-asserts the old record is the failure compressing into a press of a button.`, 'note', REFUSAL('resume-note-missing'));

      const updated = suspensions.map((row) => (row.id === open.id ? { ...row, resumedAt: at.at, resumedById: check.actorId, resumeNote: note } : row));
      const loaded = normalizePtwSuspensions(updated, permits, []);
      const storedRow = loaded.find((row) => row.id === open.id) || null;
      if (!storedRow) return fail('The resumption could not be stored as a row this register can read back. Nothing was saved.', 'note', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.ptwSuspensions = Array.isArray(draft.ptwSuspensions) ? draft.ptwSuspensions : [];
        draft.ptwSuspensions = draft.ptwSuspensions.map((row) => (row && row.id === open.id
          ? { ...row, resumedAt: storedRow.resumedAt, resumedById: storedRow.resumedById, resumeNote: storedRow.resumeNote }
          : row));
      }, {
        type: PTW_EVENTS.PERMIT_RESUMED,
        entity: 'permitToWork',
        entityId: permitId,
        summary: `Permit resumed after being re-checked (${PTW_ROUTE} register).`.slice(0, 300),
      });
      return saved({ id: storedRow.id, suspension: storedRow });
    },

    /* ---------------------------------------------------------------- closing */

    /**
     * CLOSE a permit out: an outcome and a written note. If an isolation it applied
     * is still in place, the door records the closure anyway and the reader prints
     * `closed-isolation-owed` — because a closure that leaves a line isolated is a
     * real event whose evidence has to survive, and refusing to record it would push
     * it off the record entirely.
     */
    permitToWorkClose(input = {}) {
      const check = seatFor(PTW_RIGHTS.ACT);
      if (!check.ok) return check;
      const permitId = text(input.permitId, L.idMax) || null;
      const permit = permitId ? livePermit(permitId) : null;
      if (!permit) return fail(PTW_REFUSALS.notFound, 'permitId', REFUSAL('permit-not-found'));
      const outcome = text(input.outcome, 60);
      const outcomeDef = PTW_CLOSURE_OUTCOME_BY_KEY[outcome];
      if (!outcomeDef) return fail('Choose how the permit ended. “Closed” on its own hides whether the crew left, whether the plant was handed back, and whether every isolation was restored.', 'outcome', REFUSAL('closure-outcome-invalid'));
      const note = ptwNote(input.note);
      if (!note) return fail(`Record what actually happened at the end of the job, in at least ${L.textMin} characters.`, 'note', REFUSAL('closure-note-missing'));
      const at = writeInstant(check, input.closedAt, 'closedAt');
      if (at.error) return at.error;
      if (instantMs(at.at) < instantMs(permit.validFromAt)) return fail('A closure cannot precede the permit.', 'closedAt', REFUSAL('close-before-permit'));

      const permits = normalizePtwPermits(rows('ptwPermits'), []);
      const closures = normalizePtwClosures(rows('ptwClosures'), permits, []);
      if (closures.some((row) => row.permitId === permitId)) {
        return fail('That permit is already closed. A permit is closed once, and the first closure on the record stands rather than being overwritten.', 'permitId', REFUSAL('already-closed'));
      }
      const openSuspension = normalizePtwSuspensions(rows('ptwSuspensions'), permits, []).find((row) => row.permitId === permitId && !row.resumedAt);
      if (openSuspension) {
        return fail('That permit is suspended and has not been resumed. Close it only after recording the resumption — a suspension nobody ended and a closure on top of it is the record disagreeing with itself.', 'permitId', REFUSAL('suspended-cannot-close'));
      }

      // THE OUTSTANDING ISOLATION IS COUNTED, NOT RESOLVED.
      const isolations = normalizePtwIsolations(rows('ptwIsolations'), permits, []);
      const outstanding = isolations.filter((row) => row.permitId === permitId && !row.removalConfirmedById);

      const id = idFactory('ptw-cls');
      const row = { id, permitId, closedAt: at.at, closedById: check.actorId, outcome, note, createdAt: check.at.toISOString() };
      const loaded = normalizePtwClosures([...rows('ptwClosures'), row], permits, []);
      const storedRow = loaded.find((candidate) => candidate.id === id) || null;
      if (!storedRow) return fail('The closure could not be stored as a row this register can read back. Nothing was saved.', 'note', REFUSAL('unreadable'));

      writeDraft((draft) => {
        draft.ptwClosures = Array.isArray(draft.ptwClosures) ? draft.ptwClosures : [];
        draft.ptwClosures.push(storedRow);
      }, {
        type: PTW_EVENTS.PERMIT_CLOSED,
        entity: 'permitToWork',
        entityId: permitId,
        summary: `Permit ${permit.workRef} closed as ${outcomeDef.label.toLowerCase()}${outstanding.length ? ` with ${outstanding.length} isolation(s) still recorded in place` : ''} (${PTW_ROUTE} register).`.slice(0, 300),
      });
      return saved({
        id,
        closure: storedRow,
        outstandingIsolationN: outstanding.length,
        warning: outstanding.length
          ? `${outstanding.length} isolation(s) on this permit were never removed and confirmed. The closure is recorded and the register prints the permit as \`closed-isolation-owed\` — the plant may be isolated with nobody aware of it. Record the removal and its confirmation when it happens.`
          : (store.persistError || null),
      });
    },

    /* ------------------------------------------------------------ conventions */

    /** Set the register's conventions. Out-of-bound values are REFUSED, never clamped. */
    permitToWorkSetConventions(input = {}) {
      const check = seatFor(PTW_RIGHTS.ISSUE);
      if (!check.ok) return check;
      const current = normalizePtwSettings(settings());
      const next = { ...current };
      const floor = input[PTW_SETTING_KEYS.privacyFloor];
      if (floor !== undefined) {
        const value = Number(floor);
        if (!Number.isInteger(value) || value < PTW_BOUNDS.privacyFloor.min || value > PTW_BOUNDS.privacyFloor.max) {
          return fail(`The privacy floor is a whole number between ${PTW_BOUNDS.privacyFloor.min} and ${PTW_BOUNDS.privacyFloor.max}.`, PTW_SETTING_KEYS.privacyFloor, REFUSAL('floor-invalid'));
        }
        next[PTW_SETTING_KEYS.privacyFloor] = value;
      }
      const horizon = input[PTW_SETTING_KEYS.horizonDays];
      if (horizon !== undefined) {
        const value = Number(horizon);
        if (!Number.isInteger(value) || value < PTW_BOUNDS.horizonDays.min || value > PTW_BOUNDS.horizonDays.max) {
          return fail(`The planning horizon is a whole number between ${PTW_BOUNDS.horizonDays.min} and ${PTW_BOUNDS.horizonDays.max} days.`, PTW_SETTING_KEYS.horizonDays, REFUSAL('horizon-invalid'));
        }
        next[PTW_SETTING_KEYS.horizonDays] = value;
      }
      if (input[PTW_SETTING_KEYS.autoPropagate] !== undefined) {
        next[PTW_SETTING_KEYS.autoPropagate] = input[PTW_SETTING_KEYS.autoPropagate] !== false;
      }
      writeDraft((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, { type: PTW_EVENTS.CONVENTIONS_SET, entity: 'workspace', entityId: '', summary: 'Permit-to-work register conventions set.' });
      return saved({ conventions: next });
    },

    /**
     * THE EXPLICIT SCAN. A permit LAPSES BY THE CALENDAR and an isolation's
     * verification window RUNS OUT with nobody having written anything, so the rule
     * has to be able to run on a clock as well as on a write.
     */
    permitToWorkScan() {
      const check = seatFor(PTW_RIGHTS.READ);
      if (!check.ok) return check;
      store.update((draft) => { draft.meta = { ...(draft.meta || {}), revision: draft.meta?.revision ?? 0 }; }, {
        type: PTW_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: '',
        summary: 'Permit-to-work register scanned against the clock.',
      });
      return saved({ scanned: true });
    },
  };
}

/** The published basis, re-exported so the view never hard-codes a framework list. */
export const PERMIT_TO_WORK_METHOD = PTW_METHOD;
