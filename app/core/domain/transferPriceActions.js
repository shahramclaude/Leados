/**
 * app/core/domain/transferPriceActions.js — the write and read doors of the
 * Cross-Line Labour Chargeback & Internal Transfer-Price Ledger (ADR-0177).
 *
 *  transferPriceReport          seat-scoped read (see `buildTransferPriceLedger`).
 *  transferPricePropose         FIRST KEY. One of the two line managers signs a
 *                               dated price for people one home line lends to
 *                               the other. A proposal prices nothing.
 *  transferPriceConfirm         SECOND KEY. The OTHER manager signs the same
 *                               terms. Only now is there a price.
 *  transferPriceRetire          a party withdraws or declines a proposal, or
 *                               voids an agreed price from a named day — an
 *                               appended act with a reason; nothing is edited.
 *  transferPriceScan            re-run RULE-TPL-01 explicitly (director+ / operator).
 *  transferPriceSetConventions  the ask window and the automation pause.
 *
 * STANDING, ENFORCED HERE AND AGAIN ON LOAD. A scoped seat turns ONLY its own
 * key: the lender key by the lending manager, the borrower key by the borrowing
 * manager. There is deliberately no command that signs for a counterpart. The
 * operator view may scribe either key and every such act is stored `via:
 * 'operator'` — a scribed statement, printed as one, never an authenticated one.
 *
 * Nothing here posts a charge, edits a budget, changes a reporting line or
 * blocks a declaration.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixLineScope } from './matrix.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import {
  buildTransferPriceLedger,
  compileTransferPrices,
  lendingPairEvidence,
  transferPriceClaim,
  transferPricePairKey,
} from './transferPrice.js';
import {
  TRANSFER_PRICE_BASIS_KEYS,
  TRANSFER_PRICE_BOUNDS,
  TRANSFER_PRICE_EVENTS,
  TRANSFER_PRICE_LIMITS,
  TRANSFER_PRICE_RIGHTS,
  TRANSFER_PRICE_RULE_ID,
  TRANSFER_PRICE_SIDES,
} from './transferPriceRegistry.js';
import { inclusiveDays, transferPriceCurrency, transferPriceDay, transferPriceRate } from './transferPriceSchema.js';

const fail = (error, field = 'scope') => ({ ok: false, error, field });
const text = (value) => (typeof value === 'string' ? value.trim() : '');

function saved(store, extra = {}) {
  return {
    ok: true, ...extra,
    saved: store.isEncrypted ? null : !store.persistError,
    warning: store.persistError || (store.isEncrypted ? 'Encrypted save queued; watch the workspace save status before leaving.' : null),
    propagations: store.lastPropagations || [],
  };
}

export function createTransferPriceActions(store, { now = () => new Date(), idFactory = null } = {}) {
  const clock = () => { const value = now(); return value instanceof Date ? value : new Date(value); };
  const newId = (prefix) => (typeof idFactory === 'function' ? idFactory(prefix) : `${prefix}-${Math.random().toString(36).slice(2, 10)}`);

  function context() {
    const at = clock();
    const cfg = store.state.settings || {};
    const matrix = buildMatrix(store.state, { now: at, settings: cfg });
    const scope = matrixLineScope(matrix);
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope: scope.byManager.size ? scope.byManager : null });
    return { at, today: dayKey(at) || at.toISOString().slice(0, 10), matrix, seat: activeSeat(built) };
  }

  const nameOf = (matrix, id) => (id === LEADER_ID
    ? (matrix.nodes.get(LEADER_ID)?.name || 'the workspace leader')
    : (matrix.roster.get(id)?.name || id));
  const onRoster = (matrix, id) => id === LEADER_ID || matrix.roster.has(id);

  /** The seat may act on prices at all, or the printed reason it may not. */
  function standing(seat) {
    if (seat.readOnly) return fail('The operating seat is unresolved; no price can be read or signed until a valid seat is declared.');
    const verdict = canAct(TRANSFER_PRICE_RIGHTS.AGREE, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return null;
  }

  /**
   * Whose key is being turned. A scoped seat turns its OWN key and nothing
   * else; the operator view must say whose key it is scribing.
   */
  function resolveSide(seat, lenderId, borrowerId, actingSide) {
    const asked = TRANSFER_PRICE_SIDES.includes(actingSide) ? actingSide : null;
    if (seat.fullAccess) {
      if (!asked) return fail('In the operator view, say whose key you are scribing: `actingSide` is “lender” or “borrower”. The act is stored as scribed, not as that manager’s own.', 'actingSide');
      return { side: asked, via: 'operator', decidedBySeatId: null };
    }
    const own = seat.id === lenderId ? 'lender' : seat.id === borrowerId ? 'borrower' : null;
    if (!own) return fail('Only the two managers whose lines this price joins can sign it. A third seat signing would record an agreement neither party made.');
    if (asked && asked !== own) return fail('A manager signs only their own side of a price. The counterpart’s key cannot be turned on their behalf.', 'actingSide');
    return { side: own, via: 'seat', decidedBySeatId: seat.id };
  }

  const ledgerFull = () => (store.state.transferPriceActs || []).length >= TRANSFER_PRICE_LIMITS.acts;

  function append(act, event) {
    store.update((draft) => {
      draft.transferPriceActs = Array.isArray(draft.transferPriceActs) ? draft.transferPriceActs : [];
      draft.transferPriceActs.push(act);
    }, event);
  }

  return {
    transferPriceReport(options = {}) {
      const at = clock();
      const report = buildTransferPriceLedger(store.state, {
        from: options?.from || null,
        to: options?.to || null,
        now: at,
        settings: store.state.settings || {},
      });
      if (report.seat.readOnly) return fail('The operating seat is unresolved; the chargeback statement cannot be read.');
      return { ok: true, report };
    },

    transferPricePropose(input = {}) {
      const { at, today, matrix, seat } = context();
      const refused = standing(seat);
      if (refused) return refused;
      if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('Provide the price as an object.', 'price');

      const lenderId = text(input.lenderId);
      const borrowerId = text(input.borrowerId);
      if (!lenderId) return fail('Name the lending line: the home manager of the people being lent.', 'lenderId');
      if (!borrowerId) return fail('Name the borrowing line: the manager who holds the declared additional line.', 'borrowerId');
      if (lenderId === borrowerId) return fail('A line does not charge itself. The lender and the borrower must be two different managers.', 'borrowerId');
      if (!onRoster(matrix, lenderId)) return fail('The lending manager must be the workspace leader or an active roster member. Nobody can sign for a manager who is not here.', 'lenderId');
      if (!onRoster(matrix, borrowerId)) return fail('The borrowing manager must be the workspace leader or an active roster member. Nobody can sign for a manager who is not here.', 'borrowerId');

      const key = resolveSide(seat, lenderId, borrowerId, input.actingSide);
      if (key.ok === false) return key;

      if (lendingPairEvidence(store.state, lenderId, borrowerId) === 0) {
        const reversed = lendingPairEvidence(store.state, borrowerId, lenderId) > 0;
        return fail(reversed
          ? `No declared reporting line lends a person from ${nameOf(matrix, lenderId)}’s home line to ${nameOf(matrix, borrowerId)}. The declared lines run the other way — the lender is the HOME manager of the person, the borrower holds the additional line.`
          : `No declared reporting line lends a person from ${nameOf(matrix, lenderId)}’s home line to ${nameOf(matrix, borrowerId)}. A price with nothing to price is not recorded; declare the line first.`, 'borrowerId');
      }

      const currency = transferPriceCurrency(input.currency);
      if (!currency) return fail('Currency must be a 3-letter code (for example EUR, USD, DKK). It is never defaulted.', 'currency');
      const rateInput = input.rateCents !== undefined && input.rateCents !== null && input.rateCents !== '' ? input.rateCents : input.ratePerPersonDay;
      const rateCents = transferPriceRate(rateInput);
      if (rateCents === null) {
        return fail(`The rate is a WHOLE number of currency units per full person-day, from 0 to ${TRANSFER_PRICE_LIMITS.maxRateCents}, so that one hundredth of a person-day is a whole cent. “${String(rateInput ?? '')}” is not, and nothing was rounded. An explicit 0 is allowed and is recorded as an agreed zero.`, 'ratePerPersonDay');
      }
      if (!TRANSFER_PRICE_BASIS_KEYS.includes(input.basis)) return fail('Say how the number was reached: standard cost, market rate or negotiated. The basis is a declaration, never derived.', 'basis');

      const effectiveFrom = transferPriceDay(input.effectiveFrom);
      const effectiveTo = transferPriceDay(input.effectiveTo);
      if (!effectiveFrom) return fail('Give the first day the price applies as a real calendar day (YYYY-MM-DD).', 'effectiveFrom');
      if (!effectiveTo) return fail('Give the last day the price applies as a real calendar day (YYYY-MM-DD). A price with no end cannot be told from one nobody revisited.', 'effectiveTo');
      if (effectiveTo < effectiveFrom) return fail('The price ends before it starts. Nothing was swapped.', 'effectiveTo');
      const term = inclusiveDays(effectiveFrom, effectiveTo);
      const [minTerm, maxTerm] = TRANSFER_PRICE_BOUNDS.termDays;
      if (term < minTerm || term > maxTerm) return fail(`A price runs for ${minTerm}–${maxTerm} days. ${term} days is outside that; agree it in shorter terms.`, 'effectiveTo');

      const note = text(input.note);
      if (note.length > TRANSFER_PRICE_LIMITS.noteMax) return fail(`Keep the note to ${TRANSFER_PRICE_LIMITS.noteMax} characters.`, 'note');

      const pairKey = transferPricePairKey(lenderId, borrowerId);
      for (const other of compileTransferPrices(store.state.transferPriceActs).values()) {
        if (other.pairKey !== pairKey) continue;
        const claim = transferPriceClaim(other);
        if (claim && claim.from <= effectiveTo && claim.to >= effectiveFrom) {
          return fail(`A ${other.state === 'proposed' ? 'proposal' : 'price'} between these two lines already covers ${claim.from} to ${claim.to}. Two prices for one day would have to be picked between, so the second is refused: retire the first, or choose days it does not cover.`, 'effectiveFrom');
        }
      }
      if (ledgerFull()) return fail('The transfer-price ledger is full. Export it before recording more.', 'price');

      const agreementId = newId('tpg');
      const act = {
        id: newId('tpa'), kind: 'propose', agreementId, lenderId, borrowerId,
        side: key.side, via: key.via, decidedBySeatId: key.decidedBySeatId, decidedOn: today, at: at.toISOString(), note,
        currency, rateCents, basis: input.basis, effectiveFrom, effectiveTo, voidFrom: null,
      };
      append(act, {
        type: TRANSFER_PRICE_EVENTS.PROPOSED, entity: 'transferPrice', entityId: agreementId,
        summary: `Proposed a transfer price of ${rateCents} ${currency} per person-day for people lent between two lines, ${effectiveFrom} to ${effectiveTo} (${key.side} key${key.via === 'operator' ? ', scribed' : ''}). One key is not a price.`.slice(0, 300),
      });
      return saved(store, { id: agreementId, actId: act.id, state: 'proposed' });
    },

    transferPriceConfirm(agreementId, input = {}) {
      const { at, today, matrix, seat } = context();
      const refused = standing(seat);
      if (refused) return refused;
      const agreement = compileTransferPrices(store.state.transferPriceActs).get(text(agreementId)) || null;
      if (!agreement) return fail('That price proposal is not on the record.', 'agreementId');
      if (agreement.state !== 'proposed') {
        return fail(agreement.state === 'agreed'
          ? 'This price already carries both keys. A second confirmation would record nothing.'
          : `This proposal was ${agreement.state} on ${agreement.retiredOn}. A retired proposal cannot be confirmed; propose a new price.`, 'agreementId');
      }
      const missingSide = agreement.proposedBySide === 'lender' ? 'borrower' : 'lender';
      const holder = missingSide === 'lender' ? agreement.lenderId : agreement.borrowerId;
      if (!onRoster(matrix, holder)) {
        return fail('The manager who holds the missing key is no longer on the roster, so nobody can turn it. Withdraw this proposal and agree a price with whoever holds that line now.', 'agreementId');
      }
      let via = 'operator';
      let decidedBySeatId = null;
      if (!seat.fullAccess) {
        if (seat.id !== holder) {
          return fail(seat.id === agreement.lenderId || seat.id === agreement.borrowerId
            ? 'You proposed this price. The second key is the other line’s to turn; one manager signing twice is one key.'
            : `Only ${nameOf(matrix, holder)} can turn the missing key. Recording it from another seat would fabricate an agreement.`, 'agreementId');
        }
        via = 'seat';
        decidedBySeatId = seat.id;
      }
      if (ledgerFull()) return fail('The transfer-price ledger is full. Export it before recording more.', 'price');
      const note = text(input?.note);
      if (note.length > TRANSFER_PRICE_LIMITS.noteMax) return fail(`Keep the note to ${TRANSFER_PRICE_LIMITS.noteMax} characters.`, 'note');

      const act = {
        id: newId('tpa'), kind: 'confirm', agreementId: agreement.id, lenderId: agreement.lenderId, borrowerId: agreement.borrowerId,
        side: missingSide, via, decidedBySeatId, decidedOn: today, at: at.toISOString(), note,
        // The second key is stored WITH the terms it confirmed, so a later reader
        // can prove the two keys signed the same price.
        currency: agreement.currency, rateCents: agreement.rateCents, basis: agreement.basis,
        effectiveFrom: agreement.effectiveFrom, effectiveTo: agreement.effectiveTo, voidFrom: null,
      };
      append(act, {
        type: TRANSFER_PRICE_EVENTS.CONFIRMED, entity: 'transferPrice', entityId: agreement.id,
        summary: `Confirmed a transfer price of ${agreement.rateCents} ${agreement.currency} per person-day, ${agreement.effectiveFrom} to ${agreement.effectiveTo} (${missingSide} key${via === 'operator' ? ', scribed' : ''}). The price now carries two keys.`.slice(0, 300),
      });
      return saved(store, { id: agreement.id, actId: act.id, state: 'agreed', retroactive: agreement.effectiveFrom < today });
    },

    transferPriceRetire(agreementId, input = {}) {
      const { at, today, seat } = context();
      const refused = standing(seat);
      if (refused) return refused;
      const agreement = compileTransferPrices(store.state.transferPriceActs).get(text(agreementId)) || null;
      if (!agreement) return fail('That price is not on the record.', 'agreementId');
      if (agreement.state !== 'proposed' && agreement.state !== 'agreed') {
        return fail(`This price was already ${agreement.state} on ${agreement.retiredOn}. A second retirement would record nothing; agree a new price instead.`, 'agreementId');
      }
      const key = resolveSide(seat, agreement.lenderId, agreement.borrowerId, input?.actingSide);
      if (key.ok === false) return key;
      const reason = text(input?.reason);
      if (reason.length < TRANSFER_PRICE_LIMITS.reasonMin || reason.length > TRANSFER_PRICE_LIMITS.reasonMax) {
        return fail(`Give a reason of ${TRANSFER_PRICE_LIMITS.reasonMin}–${TRANSFER_PRICE_LIMITS.reasonMax} characters. The price stays in the ledger; the reason is what a later reader has.`, 'reason');
      }

      let voidFrom = null;
      let outcome = key.side === agreement.proposedBySide ? 'withdrawn' : 'declined';
      if (agreement.state === 'agreed') {
        outcome = 'voided';
        const named = input?.voidFrom === undefined || input?.voidFrom === null || input?.voidFrom === '' ? null : transferPriceDay(input.voidFrom);
        if (input?.voidFrom && !named) return fail('Name the first day the price no longer applies as a real calendar day (YYYY-MM-DD).', 'voidFrom');
        if (named) {
          if (named < agreement.effectiveFrom || named > agreement.effectiveTo) {
            return fail(`The price runs ${agreement.effectiveFrom} to ${agreement.effectiveTo}; it can only be voided from a day inside that term.`, 'voidFrom');
          }
          voidFrom = named;
        } else if (today > agreement.effectiveTo) {
          return fail(`This price ended on ${agreement.effectiveTo}. Voiding it now would restate a closed period, so it is not done by default: name the day to void from (\`voidFrom\`) if that is what you mean.`, 'voidFrom');
        } else {
          voidFrom = today < agreement.effectiveFrom ? agreement.effectiveFrom : today;
        }
      }
      if (ledgerFull()) return fail('The transfer-price ledger is full. Export it before recording more.', 'price');

      const act = {
        id: newId('tpa'), kind: 'retire', agreementId: agreement.id, lenderId: agreement.lenderId, borrowerId: agreement.borrowerId,
        side: key.side, via: key.via, decidedBySeatId: key.decidedBySeatId, decidedOn: today, at: at.toISOString(), note: reason,
        currency: agreement.currency, rateCents: agreement.rateCents, basis: agreement.basis,
        effectiveFrom: agreement.effectiveFrom, effectiveTo: agreement.effectiveTo, voidFrom,
      };
      append(act, {
        type: TRANSFER_PRICE_EVENTS.RETIRED, entity: 'transferPrice', entityId: agreement.id,
        summary: (outcome === 'voided'
          ? `Voided an agreed transfer price from ${voidFrom}${voidFrom < today ? ' (a past day: periods it covered are restated)' : ''}: ${reason}`
          : `A transfer-price proposal was ${outcome} by the ${key.side} line: ${reason}`).slice(0, 300),
      });
      return saved(store, { id: agreement.id, actId: act.id, state: outcome, voidFrom, restatesPast: Boolean(voidFrom && voidFrom < today) });
    },

    transferPriceScan() {
      const { seat } = context();
      const right = canAct(TRANSFER_PRICE_RIGHTS.GOVERN, seat);
      if (seat.readOnly || (!seat.fullAccess && !right.allow)) {
        return fail(right.reason || 'Scanning transfer prices requires director rank or the workspace operator view.');
      }
      store.update(() => {}, {
        type: TRANSFER_PRICE_EVENTS.SCAN, entity: 'workspace', entityId: 'transfer-prices',
        summary: `Scanned transfer prices for missing keys and unpriced pairs of the last completed quarter (${TRANSFER_PRICE_RULE_ID}).`,
      });
      const effects = (store.lastPropagations || []).filter((p) => p && p.ruleId === TRANSFER_PRICE_RULE_ID);
      return saved(store, { effects });
    },

    transferPriceSetConventions(input = {}) {
      const { seat } = context();
      const right = canAct(TRANSFER_PRICE_RIGHTS.GOVERN, seat);
      if (seat.readOnly || (!seat.fullAccess && !right.allow)) {
        return fail(right.reason || 'Setting transfer-price conventions requires director rank or the workspace operator view.');
      }
      if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('Provide the conventions as an object.', 'conventions');
      const patch = {};
      if (input.askDueDays !== undefined) {
        const [min, max] = TRANSFER_PRICE_BOUNDS.askDueDays;
        const n = Number(input.askDueDays);
        // Refused, never clamped: a window the leader did not choose would put a
        // due date on somebody's task that nobody set.
        if (input.askDueDays === null || input.askDueDays === '' || typeof input.askDueDays === 'boolean' || !Number.isInteger(n) || n < min || n > max) {
          return fail(`The ask window is a whole number of days from ${min} to ${max}.`, 'askDueDays');
        }
        patch.transferPriceAskDueDays = n;
      }
      if (input.autoPropagate !== undefined) {
        if (typeof input.autoPropagate !== 'boolean') return fail('The automation switch is on or off.', 'autoPropagate');
        patch.transferPriceAutoPropagate = input.autoPropagate;
      }
      if (!Object.keys(patch).length) return fail('Nothing to change: name `askDueDays` or `autoPropagate`.', 'conventions');
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...patch };
      }, {
        type: TRANSFER_PRICE_EVENTS.CONVENTIONS, entity: 'workspace', entityId: 'transfer-prices',
        summary: `Transfer-price conventions set: ${Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(', ')}.`.slice(0, 300),
      });
      return saved(store, { conventions: patch });
    },
  };
}
