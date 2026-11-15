/**
 * app/core/domain/synergyActions.js — the seat-checked commands of the Deal Thesis
 * & Synergy Realization Register (ADR-0216, Schema v170).
 *
 * SEVEN human acts and nothing else: DECLARE a deal and its thesis, DECLARE a
 * promise on a closed lever with a phased ladder, WITHDRAW a promise, RECORD a
 * reading (a claim or a verification), WITHDRAW a reading, RECORD a one-off cost,
 * and SET the conventions. The rule that chases an unverified promise is
 * `RULE-SYN-01`, not this file.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - A promise may only be declared by a seat that HOLDS its owner, on the home
 *    line or a declared line. One line does not promise another line's saving,
 *    which in a matrix is the whole difference between a deal plan and a wish
 *    list written into somebody else's budget.
 *  - A `verified` reading is refused to the OWNER (self-verification), refused to
 *    a seat that is not ABOVE the owner on at least one line, and refused without
 *    named evidence. Reach is re-proved at the moment of the write, not trusted
 *    from the dialog.
 *  - A P&L reading names its period, and one promise cannot carry two P&L
 *    readings for one period: a restatement withdraws the first rather than
 *    stacking a second on top of it.
 *  - A reading is dated on or after the day the promise was declared and never in
 *    the future. Nothing is backdated into existence.
 *  - A declared convention outside its bounds is REFUSED, never clamped: a typo
 *    must not move the materiality line the board reads.
 *
 * Every write stores the row its own loader returns, so the record is identical
 * before and after a reload, and nothing derived is stored.
 */

import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import {
  buildDealSynergy,
  synergyAttentionCount,
  synergyBriefText,
  synergyCandidates,
  synergyCsvRows,
  synergyLinesHeld,
  synergyVerifierAbove,
} from './dealSynergy.js';
import {
  SYNERGY_BOUNDS,
  SYNERGY_COST_KIND_KEYS,
  SYNERGY_EFFECT_KEYS,
  SYNERGY_EVENTS,
  SYNERGY_LIMITS,
  SYNERGY_LEVER_KEYS,
  SYNERGY_READING_KIND_KEYS,
  SYNERGY_RIGHTS,
  SYNERGY_ROUTE,
  SYNERGY_RULE_ID,
  SYNERGY_SETTING_KEYS,
  SYNERGY_SETTING_LABELS,
} from './synergyRegistry.js';
import {
  normalizeDealTheses,
  normalizeSynergyClaims,
  normalizeSynergyCosts,
  normalizeSynergyReadings,
  normalizeSynergySettings,
  normalizeSavingRef,
  parseSynergyMoney,
  readSynergySettings,
  synergyCurrency,
  synergyDay,
  synergyPersonId,
  synergyText,
} from './synergySchema.js';

const L = SYNERGY_LIMITS;
const REFUSAL = (key) => `synergy:${key}`;
const PERIOD = /^\d{4}-(Q[1-4]|0[1-9]|1[0-2])$/;

export function createSynergyActions(store, { now, idFactory }) {
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
    if (seat.readOnly) return fail('The declared seat is unresolved and read-only. Choose a valid seat before declaring or recording on the synergy register.');
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

  const read = (check) => buildDealSynergy(store.state, { now: check.at, settings: check.cfg, seat: check.seat });

  /** How this seat holds a person: 'operator', 'home-line', 'declared-line', or null. */
  function reachOf(check, personId) {
    if (check.seat.fullAccess) return 'operator';
    if (check.seat.scope instanceof Set && check.seat.scope.has(personId)) return 'home-line';
    if (check.seat.lineScope instanceof Set && check.seat.lineScope.has(personId)) return 'declared-line';
    return null;
  }

  function matrixOf(cfg, at) {
    try {
      return buildMatrix(store.state, { now: at, settings: { ...cfg, activeSeatId: null } });
    } catch {
      return null;
    }
  }

  // Active is the only status a promise may be made to. A departed person is
  // still a node in the chain — so the scope guard lets the id through — but a
  // promise made to somebody who has left is a promise to nobody: it would sit
  // in the headline with a name beside it who cannot be asked. Promises already
  // declared are kept when the owner leaves (see the unowned state); this door
  // is only about NEW promises.
  const activePerson = (id) => rows('people').find((person) => person && person.id === id && person.status === 'active') || null;
  const storedDeals = () => normalizeDealTheses(rows('dealTheses'), []);
  const storedClaims = (deals) => normalizeSynergyClaims(rows('synergyClaims'), deals, []);
  const storedReadings = (claims) => normalizeSynergyReadings(rows('synergyReadings'), claims, []);

  return {
    /* ---------------------------------------------------------------- reads */

    synergyReport() {
      const check = seatFor(SYNERGY_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, report: read(check) };
    },

    synergyBriefText() {
      const check = seatFor(SYNERGY_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, text: synergyBriefText(read(check)) };
    },

    synergyCsvRows() {
      const check = seatFor(SYNERGY_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, rows: synergyCsvRows(read(check)) };
    },

    synergyAttentionCount() {
      const check = seatFor(SYNERGY_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, count: synergyAttentionCount(store.state, { now: check.at, settings: check.cfg, seat: check.seat }) };
    },

    /** The declaration dialogs' data. Every rule is re-proved by the writes. */
    synergyCandidates() {
      const check = seatFor(SYNERGY_RIGHTS.READ);
      if (!check.ok) return check;
      const board = synergyCandidates(store.state, { now: check.at, settings: check.cfg });
      return {
        ok: true,
        today: check.today,
        ...board,
        canDeclare: canAct(SYNERGY_RIGHTS.DECLARE, check.seat).allow === true,
        canRecord: canAct(SYNERGY_RIGHTS.RECORD, check.seat).allow === true,
        canGovern: canAct(SYNERGY_RIGHTS.GOVERN, check.seat).allow === true,
        people: rows('people')
          .filter((person) => person && person.id && person.status !== 'archived')
          .map((person) => ({ id: person.id, name: person.name || person.id, via: reachOf(check, person.id), lines: synergyLinesHeld(matrixOf(check.cfg, check.at), person.id) }))
          .filter((person) => person.via)
          .sort((a, b) => a.name.localeCompare(b.name)),
        limits: L,
      };
    },

    /* --------------------------------------------------------------- writes */

    /** Declare one deal and the thesis it was bought on. */
    synergyDeclareDeal(input = {}) {
      const check = seatFor(SYNERGY_RIGHTS.DECLARE);
      if (!check.ok) return check;
      if (rows('dealTheses').length >= L.deals) {
        return fail(`The deal register reached its ${L.deals}-row cap. Export the workspace before declaring another deal.`, 'label', REFUSAL('cap-reached'));
      }
      const label = synergyText(input.label, L.labelMax);
      if (label.length < L.labelMin) return fail('Name the deal, in at least a few characters.', 'label', REFUSAL('deal-label-required'));
      const currency = synergyCurrency(input.currency);
      if (!currency) return fail('Declare the deal’s currency as three letters (for example DKK). A deal with no currency has no unit for its promises.', 'currency', REFUSAL('deal-currency-required'));
      const signedOn = synergyDay(input.signedOn);
      if (!signedOn) return fail('State the day the deal was signed as a real calendar day (YYYY-MM-DD).', 'signedOn', REFUSAL('deal-date-required'));
      if (signedOn > check.today) return fail(`The deal is dated ${signedOn}, after today (${check.today}). A record of a deal that has not been signed is not a record.`, 'signedOn', REFUSAL('deal-date-required'));
      const thesis = synergyText(input.thesis, L.thesisMax);
      if (thesis.length < L.thesisMin) return fail(`Write the thesis the deal was bought on, in at least ${L.thesisMin} characters.`, 'thesis', REFUSAL('thesis-required'));
      const leadId = synergyPersonId(input.leadId) || check.actorId;
      if (leadId !== LEADER_ID && !activePerson(leadId)) {
        return fail('The integration lead must be a person this roster holds, or the workspace leader.', 'leadId', REFUSAL('lead-not-on-roster'));
      }
      const id = idFactory('deal');
      const row = { id, label, currency, signedOn, thesis, leadId, declaredOn: check.today, declaredById: check.actorId };
      const loaded = normalizeDealTheses([row], [])[0];
      if (!loaded) return fail('The deal could not be stored as a row this register can read back. Nothing was saved.');
      store.update((draft) => {
        draft.dealTheses = Array.isArray(draft.dealTheses) ? draft.dealTheses : [];
        draft.dealTheses.push(loaded);
      }, {
        type: SYNERGY_EVENTS.DEAL_DECLARED,
        entity: 'dealThesis',
        entityId: id,
        summary: `Deal thesis declared: ${label} (${currency}), signed ${signedOn}.`.slice(0, 300),
      });
      return saved({ dealId: id });
    },

    /**
     * Declare one promise: a lever, a direction, an accountable owner, and the
     * phased ladder of annual run-rates it is owed at. The declaring seat must
     * hold the owner.
     */
    synergyDeclareClaim(input = {}) {
      const check = seatFor(SYNERGY_RIGHTS.DECLARE);
      if (!check.ok) return check;
      if (rows('synergyClaims').length >= L.claims) {
        return fail(`The promise register reached its ${L.claims}-row cap. Export the workspace before declaring another promise.`, 'dealId', REFUSAL('cap-reached'));
      }
      const deals = storedDeals();
      const dealId = synergyText(input.dealId, 80);
      const deal = deals.find((row) => row.id === dealId) || null;
      if (!deal) return fail('A promise belongs to a deal this record holds. Declare the deal first.', 'dealId', REFUSAL('claim-unknown-deal'));
      const leverKey = synergyText(input.leverKey, 40);
      if (!SYNERGY_LEVER_KEYS.includes(leverKey)) return fail('Choose a lever from the register’s closed list. It is never inferred from a title.', 'leverKey', REFUSAL('claim-unknown-lever'));
      const effectKey = synergyText(input.effectKey, 20);
      if (!SYNERGY_EFFECT_KEYS.includes(effectKey)) return fail('State whether this promise is a synergy or a declared dis-synergy. The direction is never guessed from a minus sign.', 'effectKey', REFUSAL('claim-unknown-effect'));
      const ownerId = synergyPersonId(input.ownerId);
      if (!ownerId) return fail('A promise names exactly one accountable owner.', 'ownerId', REFUSAL('claim-owner-required'));
      if (ownerId !== LEADER_ID && !activePerson(ownerId)) return fail('The named owner is not on the active roster.', 'ownerId', REFUSAL('owner-not-on-roster'));
      const via = reachOf(check, ownerId);
      if (!via) {
        return fail('A promise may only be made by a seat that holds its owner, on the home line or a declared line. One line does not promise another line’s saving.', 'ownerId', REFUSAL('owner-not-reachable'));
      }
      const savingRef = synergyText(input.savingRef, L.savingRefMax);
      const savingKey = normalizeSavingRef(savingRef);
      if (savingKey.length < L.savingRefMin) {
        return fail('Name the saving itself (for example "sga-duplicated-finance"), so the register can tell when two lines promise the same money.', 'savingRef', REFUSAL('saving-ref-required'));
      }
      const promisedAnnualCents = parseSynergyMoney(input.promisedAnnual, { signed: false });
      if (promisedAnnualCents === null || promisedAnnualCents <= 0) {
        return fail('State the promised annual run-rate as a positive amount, to the cent. A comma is refused: it is a decimal separator in half of Europe.', 'promisedAnnual', REFUSAL('promise-not-positive'));
      }

      // The ladder: what was typed, or one final phase on the declared due date.
      const rawPhases = Array.isArray(input.phases) ? input.phases : [];
      let phases;
      if (rawPhases.length) {
        if (rawPhases.length > L.phasesMax) {
          return fail(`A ladder holds at most ${L.phasesMax} phases. More is a plan nobody can hold in view.`, 'phases', REFUSAL('phase-ladder-count'));
        }
        phases = [];
        for (const phase of rawPhases) {
          const dueOn = synergyDay(phase?.dueOn);
          if (!dueOn) return fail('Every phase states a real calendar day (YYYY-MM-DD).', 'phases', REFUSAL('promise-date-required'));
          if (dueOn < deal.signedOn) return fail(`A phase is dated ${dueOn}, before the deal was signed (${deal.signedOn}).`, 'phases', REFUSAL('phase-before-signing'));
          const targetCents = parseSynergyMoney(phase?.target, { signed: false });
          if (targetCents === null || targetCents <= 0) return fail('Every phase states a positive annual run-rate, to the cent.', 'phases', REFUSAL('promise-not-positive'));
          phases.push({ dueOn, targetCents });
        }
        phases.sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0));
        for (let index = 1; index < phases.length; index += 1) {
          if (phases[index].dueOn === phases[index - 1].dueOn) {
            return fail('A phase ladder runs forward: two phases cannot share a date.', 'phases', REFUSAL('phase-ladder-order'));
          }
          if (phases[index].targetCents < phases[index - 1].targetCents) {
            return fail('A phase ladder never goes backwards: a later phase cannot promise less than an earlier one. A saving that shrinks is a new promise, not a phase.', 'phases', REFUSAL('phase-ladder-order'));
          }
        }
        if (phases[phases.length - 1].targetCents !== promisedAnnualCents) {
          return fail('The last phase must equal the full promised run-rate. A ladder that ends short of its own promise is two promises, and the register will not guess which one is meant.', 'phases', REFUSAL('phase-ladder-final'));
        }
      } else {
        const dueOn = synergyDay(input.dueOn);
        if (!dueOn) return fail('State the day the full run-rate is due, or give a phase ladder.', 'dueOn', REFUSAL('promise-date-required'));
        if (dueOn < deal.signedOn) return fail(`The promise falls due on ${dueOn}, before the deal was signed (${deal.signedOn}).`, 'dueOn', REFUSAL('promise-before-signing'));
        phases = [{ dueOn, targetCents: promisedAnnualCents }];
      }

      const id = idFactory('syn');
      const row = {
        id,
        dealId,
        leverKey,
        effectKey,
        ownerId,
        savingRef,
        savingKey,
        promisedAnnualCents,
        phases,
        declaredOn: check.today,
        declaredById: check.actorId,
        note: synergyText(input.note, L.noteMax),
        withdrawnOn: null,
        withdrawnReason: '',
      };
      const loaded = normalizeSynergyClaims([row], deals, [])[0];
      if (!loaded) return fail('The promise could not be stored as a row this register can read back. Nothing was saved.');
      store.update((draft) => {
        draft.synergyClaims = Array.isArray(draft.synergyClaims) ? draft.synergyClaims : [];
        draft.synergyClaims.push(loaded);
      }, {
        type: SYNERGY_EVENTS.CLAIM_DECLARED,
        entity: 'synergyClaim',
        entityId: id,
        summary: `Promise declared on ${deal.label}: ${leverKey}, ${effectKey}, owner ${ownerId}, saving ${savingKey}.`.slice(0, 300),
      });
      return saved({ claimId: id, ownerVia: via, savingKey, phases: loaded.phases });
    },

    /**
     * Withdraw a promise with a written reason. It stays on the record, leaves
     * every total, and the exclusion is counted by the reader.
     */
    synergyWithdrawClaim(input = {}) {
      const check = seatFor(SYNERGY_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const claimId = synergyText(input.claimId, 80);
      const deals = storedDeals();
      const claims = storedClaims(deals);
      const claim = claims.find((row) => row.id === claimId) || null;
      if (!claim) return fail('That promise is not on this record. Nothing was saved.', 'claimId');
      if (claim.withdrawnOn) return fail('This promise is already withdrawn.', 'claimId', REFUSAL('claim-withdrawn'));
      const reason = synergyText(input.reason, L.noteMax);
      if (reason.length < 12) return fail('Record why the promise is withdrawn, in at least a sentence.', 'reason');
      const loaded = normalizeSynergyClaims(
        claims.map((row) => (row.id === claim.id ? { ...row, withdrawnOn: check.today, withdrawnReason: reason } : row)),
        deals,
        [],
      ).find((row) => row.id === claim.id) || null;
      if (!loaded) return fail('The withdrawal could not be stored as a row this register can read back. Nothing was saved.');
      store.update((draft) => {
        draft.synergyClaims = Array.isArray(draft.synergyClaims) ? draft.synergyClaims : [];
        draft.synergyClaims = draft.synergyClaims.map((row) => (row && row.id === claim.id ? loaded : row));
      }, {
        type: SYNERGY_EVENTS.CLAIM_WITHDRAWN,
        entity: 'synergyClaim',
        entityId: claim.id,
        summary: `Promise withdrawn on ${check.today}: ${claim.savingKey}.`.slice(0, 300),
      });
      return saved({ claimId: claim.id });
    },

    /**
     * Record a reading. `claimed` is a statement by the line that owns the saving;
     * `verified` is a dated act by a seat ABOVE the owner against named evidence.
     * The verification test is re-proved here, at the moment of the write.
     */
    synergyRecordReading(input = {}) {
      // The seat is resolved before any right is exercised, because which right
      // applies depends on what is being recorded: a claimed reading is the
      // owner's own statement and needs nothing above it, while a verification
      // needs a seat above the owner AND the recording right.
      const check = seatNow();
      if (!check.ok) return check;
      const recordVerdict = canAct(SYNERGY_RIGHTS.RECORD, check.seat);
      const selfVerdict = canAct(SYNERGY_RIGHTS.SELF_REPORT, check.seat);
      const needRecordRight = () => (!recordVerdict.allow ? fail(recordVerdict.reason) : null);
      if (rows('synergyReadings').length >= L.readings) {
        return fail(`The reading register reached its ${L.readings}-row cap. Export the workspace before recording another reading.`, 'claimId', REFUSAL('cap-reached'));
      }
      const deals = storedDeals();
      const claims = storedClaims(deals);
      const claimId = synergyText(input.claimId, 80);
      const claim = claims.find((row) => row.id === claimId) || null;
      if (!claim) return fail('A reading belongs to a promise this record holds.', 'claimId', REFUSAL('reading-unknown-claim'));
      if (claim.withdrawnOn) return fail('This promise has been withdrawn. A withdrawn promise takes no new reading.', 'claimId', REFUSAL('claim-withdrawn'));
      const deal = deals.find((row) => row.id === claim.dealId) || null;

      const kindKey = synergyText(input.kindKey, 20);
      if (!SYNERGY_READING_KIND_KEYS.includes(kindKey)) return fail('A reading is a run-rate or a P&L effect. The two are never the same row.', 'kindKey', REFUSAL('reading-kind-unknown'));
      const basisKey = synergyText(input.basisKey, 20);
      if (basisKey !== 'claimed' && basisKey !== 'verified') return fail('A reading is claimed or verified. There is no third basis and no default.', 'basisKey', REFUSAL('reading-basis-unknown'));
      // A claimed reading by the promise's own owner is the weakest act on the
      // record and is counted NOWHERE until somebody above verifies it, so it is
      // open to the owner at every altitude: the rule asks them every cycle, and
      // an ask nobody can answer is a loop that closes by expiring.
      if (basisKey === 'claimed') {
        if (check.actorId !== claim.ownerId) {
          const denied = needRecordRight();
          if (denied) return denied;
        } else if (selfVerdict && selfVerdict.allow === false) {
          // The right is open 1–5, so this fires only on a seat the model cannot
          // place at all (read-only, undeclared). It is checked rather than
          // assumed because this action is reachable without the gateway.
          return fail(selfVerdict.reason);
        }
      }
      // No fallback to today: a reading defaulted to the load date would let a
      // stale number wear the date it was typed, which is the one thing a
      // dated verification exists to prevent.
      const asOf = synergyDay(input.asOf);
      if (!asOf) return fail('Date the reading with a real calendar day (YYYY-MM-DD). A reading with no date cannot be compared with the promise it measures.', 'asOf', REFUSAL('reading-date-required'));
      if (asOf > check.today) return fail(`The reading is dated ${asOf}, after today (${check.today}). A reading of something that has not happened is not a reading.`, 'asOf', REFUSAL('reading-date-required'));
      if (asOf < claim.declaredOn) {
        return fail(`The reading is dated ${asOf}, before the promise was declared (${claim.declaredOn}). A number recorded before the promise measures something else.`, 'asOf', REFUSAL('reading-before-claim'));
      }
      const amountCents = parseSynergyMoney(input.amount, { signed: true });
      if (amountCents === null) return fail('State the amount in the deal’s currency, to the cent. A negative amount is allowed only for a reading that reversed.', 'amount', REFUSAL('reading-amount-required'));

      let periodKey = '';
      if (kindKey === 'pnl') {
        periodKey = synergyText(input.periodKey, L.periodKeyMax).toUpperCase();
        if (!PERIOD.test(periodKey)) {
          return fail('A P&L reading names the period it is in (for example 2026-Q3 or 2026-09). A P&L effect with no period is attributable to no quarter.', 'periodKey', REFUSAL('period-key-required'));
        }
        const duplicate = storedReadings(claims).some((row) => row.claimId === claim.id && row.kindKey === 'pnl' && row.periodKey === periodKey && !row.withdrawnOn);
        if (duplicate) {
          return fail(`This promise already carries a P&L reading for ${periodKey}. A restatement withdraws the first; it does not stack a second on top.`, 'periodKey', REFUSAL('period-duplicate'));
        }
      }

      let verifiedById = null;
      let evidenceRef = '';
      if (basisKey === 'verified') {
        const matrix = matrixOf(check.cfg, check.at);
        if (check.actorId === claim.ownerId) {
          return fail('The owner of a promise cannot verify their own saving. Record it as a claim instead — self-reported value is stored as a claim, which is what it is.', 'basisKey', REFUSAL('self-verification'));
        }
        if (!synergyVerifierAbove(matrix, check.actorId, claim.ownerId)) {
          return fail('A verifier must sit above the promise’s owner on at least one reporting line — home line or declared line. A peer cannot verify.', 'basisKey', REFUSAL('verifier-out-of-reach'));
        }
        // Authority over the owner is proved before the rank gate is quoted: a
        // peer is refused as a peer, not as a rank, which is the reason a human
        // can act on.
        const denied = needRecordRight();
        if (denied) return denied;
        evidenceRef = synergyText(input.evidenceRef, L.basisMax);
        if (evidenceRef.length < L.basisMin) {
          return fail('Name the evidence the verification read, in a sentence. "Verified" with no evidence is a second claim wearing a better word.', 'evidenceRef', REFUSAL('evidence-required'));
        }
        verifiedById = check.actorId;
      } else {
        // A claim is the owner's own report, or the report of a seat that holds
        // them: it is not a statement a peer can make about somebody else's saving.
        const via = reachOf(check, claim.ownerId);
        const above = synergyVerifierAbove(matrixOf(check.cfg, check.at), check.actorId, claim.ownerId);
        if (!via && !above) {
          return fail('A claimed reading comes from the promise’s owner or from a seat that holds or answers for them. A peer cannot report somebody else’s saving.', 'basisKey', REFUSAL('verifier-out-of-reach'));
        }
      }

      const id = idFactory('synread');
      const row = {
        id, claimId: claim.id, kindKey, basisKey, asOf, periodKey, amountCents,
        verifiedById, evidenceRef,
        note: synergyText(input.note, L.noteMax),
        recordedOn: check.today,
        recordedById: check.actorId,
        withdrawnOn: null,
        withdrawnReason: '',
      };
      const loaded = normalizeSynergyReadings([row], claims, [])[0];
      if (!loaded) return fail('The reading could not be stored as a row this register can read back. Nothing was saved.');
      store.update((draft) => {
        draft.synergyReadings = Array.isArray(draft.synergyReadings) ? draft.synergyReadings : [];
        draft.synergyReadings.push(loaded);
      }, {
        type: SYNERGY_EVENTS.READING_RECORDED,
        entity: 'synergyClaim',
        entityId: claim.id,
        summary: `${kindKey} reading recorded on ${deal?.label || claim.dealId}: ${basisKey}${periodKey ? ` for ${periodKey}` : ''} on ${asOf}.`.slice(0, 300),
      });
      return saved({ readingId: id, claimId: claim.id });
    },

    /** Withdraw a reading. Only the recorder, or a seat above the owner. Never deleted. */
    synergyWithdrawReading(input = {}) {
      const check = seatFor(SYNERGY_RIGHTS.RECORD);
      if (!check.ok) return check;
      const deals = storedDeals();
      const claims = storedClaims(deals);
      const readings = storedReadings(claims);
      const readingId = synergyText(input.readingId, 80);
      const reading = readings.find((row) => row.id === readingId) || null;
      if (!reading) return fail('That reading is not on this record. Nothing was saved.', 'readingId');
      if (reading.withdrawnOn) return fail('That reading is already withdrawn.', 'readingId');
      const claim = claims.find((row) => row.id === reading.claimId) || null;
      const above = claim ? synergyVerifierAbove(matrixOf(check.cfg, check.at), check.actorId, claim.ownerId) : false;
      if (!check.seat.fullAccess && check.actorId !== reading.recordedById && !above) {
        return fail('Only the seat that recorded a reading, or a seat above the promise’s owner, may withdraw it.', 'readingId', REFUSAL('reading-withdraw-not-yours'));
      }
      const reason = synergyText(input.reason, L.noteMax);
      if (reason.length < 12) return fail('Record why the reading is withdrawn, in at least a sentence.', 'reason');
      const loaded = normalizeSynergyReadings(
        readings.map((row) => (row.id === reading.id ? { ...row, withdrawnOn: check.today, withdrawnReason: reason } : row)),
        claims,
        [],
      ).find((row) => row.id === reading.id) || null;
      if (!loaded) return fail('The withdrawal could not be stored as a row this register can read back. Nothing was saved.');
      store.update((draft) => {
        draft.synergyReadings = Array.isArray(draft.synergyReadings) ? draft.synergyReadings : [];
        draft.synergyReadings = draft.synergyReadings.map((row) => (row && row.id === reading.id ? loaded : row));
      }, {
        type: SYNERGY_EVENTS.READING_WITHDRAWN,
        entity: 'synergyClaim',
        entityId: reading.claimId,
        summary: `Reading withdrawn on ${check.today}.`.slice(0, 300),
      });
      return saved({ readingId: reading.id });
    },

    /** Record one-off cost to achieve. Its own ledger, its own sign, its own evidence. */
    synergyRecordCost(input = {}) {
      const check = seatFor(SYNERGY_RIGHTS.RECORD);
      if (!check.ok) return check;
      if (rows('synergyCosts').length >= L.costs) {
        return fail(`The one-off cost ledger reached its ${L.costs}-row cap. Export the workspace before recording another cost.`, 'dealId', REFUSAL('cap-reached'));
      }
      const deals = storedDeals();
      const claims = storedClaims(deals);
      const dealId = synergyText(input.dealId, 80);
      const deal = deals.find((row) => row.id === dealId) || null;
      if (!deal) return fail('A one-off cost belongs to a deal this record holds.', 'dealId', REFUSAL('cost-unknown-deal'));
      const amountCents = parseSynergyMoney(input.amount, { signed: false });
      if (amountCents === null || amountCents <= 0) return fail('State the cost as a positive amount in the deal’s currency, to the cent.', 'amount', REFUSAL('cost-amount-required'));
      const spentOn = synergyDay(input.spentOn) || check.today;
      if (!spentOn) return fail('Date the cost with the day it was incurred (YYYY-MM-DD).', 'spentOn', REFUSAL('cost-date-required'));
      if (spentOn > check.today) return fail(`The cost is dated ${spentOn}, after today (${check.today}).`, 'spentOn', REFUSAL('cost-date-required'));
      const kindKey = synergyText(input.kindKey, 30);
      if (!SYNERGY_COST_KIND_KEYS.includes(kindKey)) return fail('Choose a cost kind from the register’s list.', 'kindKey', REFUSAL('cost-kind-unknown'));
      const claimId = input.claimId ? synergyText(input.claimId, 80) : null;
      if (claimId) {
        const claim = claims.find((row) => row.id === claimId) || null;
        if (!claim || claim.dealId !== dealId) {
          return fail('A cost allocated to a promise must belong to the same deal as that promise.', 'claimId', REFUSAL('cost-claim-mismatch'));
        }
        // Allocating a cost names a line's promise; the seat must hold its owner.
        if (!reachOf(check, claim.ownerId) && !synergyVerifierAbove(matrixOf(check.cfg, check.at), check.actorId, claim.ownerId)) {
          return fail('A cost allocated to a promise may only be recorded by a seat that holds or answers for that promise’s owner.', 'claimId', REFUSAL('owner-not-reachable'));
        }
      }
      const id = idFactory('syncost');
      const row = {
        id, dealId, claimId, amountCents, spentOn, kindKey,
        note: synergyText(input.note, L.noteMax),
        recordedOn: check.today,
        recordedById: check.actorId,
      };
      const loaded = normalizeSynergyCosts([row], deals, claims, [])[0];
      if (!loaded) return fail('The cost could not be stored as a row this register can read back. Nothing was saved.');
      store.update((draft) => {
        draft.synergyCosts = Array.isArray(draft.synergyCosts) ? draft.synergyCosts : [];
        draft.synergyCosts.push(loaded);
      }, {
        type: SYNERGY_EVENTS.COST_RECORDED,
        entity: 'dealThesis',
        entityId: dealId,
        summary: `One-off cost recorded on ${deal.label}: ${kindKey} on ${spentOn}.`.slice(0, 300),
      });
      return saved({ costId: id });
    },

    /** Set the declared conventions. A value outside its bounds is REFUSED, never clamped. */
    synergySetConventions(patch = {}) {
      const check = seatFor(SYNERGY_RIGHTS.GOVERN);
      if (!check.ok) return check;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return fail('Synergy conventions must be supplied as a plain object. Nothing was saved.', 'settings');
      const names = new Map(Object.entries(SYNERGY_SETTING_KEYS).map(([name, key]) => [key, name]));
      const keys = Object.keys(patch);
      if (!keys.length) return fail('State at least one convention to update. Nothing was saved.', 'settings');
      for (const key of keys) {
        const name = names.get(key);
        if (!name) return fail(`“${key}” is not a declared synergy convention. Nothing was saved.`, key);
        if (name === 'autoPropagate') {
          if (typeof patch[key] !== 'boolean') return fail('The automation switch takes true or false. Nothing was saved.', key);
          continue;
        }
        const [min, max] = SYNERGY_BOUNDS[name];
        if (!Number.isInteger(patch[key]) || patch[key] < min || patch[key] > max) {
          return fail(`${SYNERGY_SETTING_LABELS[name]} must be a whole number from ${min} to ${max}. Nothing was clamped and nothing was saved.`, key, REFUSAL('convention-out-of-bounds'));
        }
      }
      const next = normalizeSynergySettings({ ...settings(), ...patch });
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: SYNERGY_EVENTS.CONVENTIONS,
        entity: 'settings',
        entityId: 'synergy',
        summary: `Synergy conventions set: ${keys.map((key) => `${key}=${patch[key]}`).join(', ')}.`.slice(0, 300),
      });
      return saved({ conventions: readSynergySettings({ settings: { ...settings(), ...next } }) });
    },

    /** Re-evaluate the register now. The rule is what files asks. */
    synergyScan() {
      const check = seatFor(SYNERGY_RIGHTS.GOVERN);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: SYNERGY_EVENTS.SCAN,
        entity: 'workspace',
        entityId: `${SYNERGY_ROUTE}#${SYNERGY_RULE_ID}`,
        summary: `Deal synergy register scan requested (${SYNERGY_RULE_ID}).`,
      });
      return saved({ report: read(check), effects: (store.lastPropagations || []).filter((effect) => effect && effect.ruleId === SYNERGY_RULE_ID) });
    },
  };
}

export const SYNERGY_PAUSE_SWITCH = SYNERGY_SETTING_KEYS.autoPropagate;
