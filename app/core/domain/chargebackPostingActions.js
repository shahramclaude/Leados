/**
 * app/core/domain/chargebackPostingActions.js — the write and read doors of
 * the Chargeback Period Posting & Budget-Envelope Binding ledger (ADR-0194).
 *
 *  chargebackPostingReport         seat-scoped read (see `buildChargebackPostingLedger`).
 *  chargebackPost                  the dated human act: freeze ONE period × ONE currency
 *                                  of the COMPLETE whole-workspace chargeback statement,
 *                                  with every line bound to a budget envelope or an
 *                                  explicit written no-envelope declaration. The figures
 *                                  come from the statement engine AT THE DOOR — a poster
 *                                  cannot type an amount, so stored == computed by
 *                                  construction.
 *  chargebackReversePosting        a dated reversal with a written reason; the posting
 *                                  stays on the ledger as history.
 *  chargebackPostingScan           re-run RULE-CBP-01 explicitly (director+ / operator).
 *  chargebackPostingSetConventions the ask window and the automation pause.
 *
 * REFUSALS, ENFORCED HERE AND RE-PROVED ON LOAD. A posting is refused while the
 * statement is incomplete — the exact failing claim is printed. A binding is
 * refused unless the named envelope exists, is active, is owned by the bound
 * line's manager and is recorded in the posting currency. A second live
 * posting for one (period, currency) is refused until the first is reversed.
 *
 * Nothing here writes a budget line, edits an envelope, changes a price or a
 * reporting line, or blocks a human decision elsewhere.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixLineScope } from './matrix.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { buildTransferPriceLedger } from './transferPrice.js';
import { formatCents, transferPriceCurrency } from './transferPriceSchema.js';
import {
  buildChargebackPostingLedger,
  compileChargebackPostings,
  periodCurrencyKey,
  statementAccountCents,
} from './chargebackPosting.js';
import {
  CHARGEBACK_POSTING_BOUNDS,
  CHARGEBACK_POSTING_EVENTS,
  CHARGEBACK_POSTING_LIMITS,
  CHARGEBACK_POSTING_RIGHTS,
  CHARGEBACK_POSTING_RULE_ID,
} from './chargebackPostingRegistry.js';

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

export function createChargebackPostingActions(store, { now = () => new Date(), idFactory = null } = {}) {
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

  /** The seat may post or reverse, or the printed reason it may not. */
  function postingStanding(seat) {
    if (seat.readOnly) return fail('The operating seat is unresolved; no posting can be made until a valid seat is declared.');
    if (seat.fullAccess) return null;
    const verdict = canAct(CHARGEBACK_POSTING_RIGHTS.POST, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return null;
  }

  function governStanding(seat, doing) {
    if (seat.readOnly) return fail(`The operating seat is unresolved; ${doing} requires a declared seat or the operator view.`);
    if (seat.fullAccess) return null;
    const verdict = canAct(CHARGEBACK_POSTING_RIGHTS.GOVERN, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return null;
  }

  function append(act, event) {
    store.update((draft) => {
      draft.chargebackPostings = Array.isArray(draft.chargebackPostings) ? draft.chargebackPostings : [];
      draft.chargebackPostings.push(act);
    }, event);
  }

  return {
    chargebackPostingReport() {
      const at = clock();
      const report = buildChargebackPostingLedger(store.state, { now: at, settings: store.state.settings || {} });
      return { ok: true, report };
    },

    /**
     * input: { from?, to?, currency, bindings: [{ accountId, envelopeId?, reason? }], note? }
     * Omitted from/to posts the last completed calendar quarter — the same
     * default window the statement itself reads.
     */
    chargebackPost(input = {}) {
      const { at, today, matrix, seat } = context();
      const standing = postingStanding(seat);
      if (standing) return standing;
      if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('Provide the posting as an object.', 'posting');

      // The WHOLE-WORKSPACE statement: a posting is a workspace period fact,
      // not a seat-sized one, so the figures are read with the operator view
      // regardless of who signs. The seat is recorded on the act.
      const operator = { ...(store.state.settings || {}), activeSeatId: null };
      const report = buildTransferPriceLedger({ ...store.state, settings: operator }, {
        from: text(input.from) || null, to: text(input.to) || null, now: at, settings: operator,
      });
      const window = report.window;
      if (!window.valid) return fail(`The period is refused: ${window.refuseReason || 'it is unreadable or out of bounds'}. Nothing was clamped and nothing was posted.`, 'period');
      const board = report.board;
      if (report.verdict === 'inert') return fail('Nothing to post: no chargeable share-day is in scope for this period. A posting of nothing would be a period fact about nothing.', 'period');
      // The exact failing claim, printed — "the figures add up" and "the
      // statement covers the period" are different facts, refused separately.
      if (board.statementComplete !== true) return fail(`REFUSED — the statement is incomplete: ${board.incompleteReason || 'not every chargeable share-day carries a two-key price.'} Post nothing until RULE-TPL-01’s asks are answered; an incomplete period is not postable at plan rates or any other substitute.`, 'statement');
      if (board.zeroSum.holds !== true) return fail('REFUSED — the workspace does not net to zero. Treat every figure as unverified and report it; nothing was posted.', 'statement');
      if (board.shareDaysReconcile !== true) return fail('REFUSED — the share-day partition does not reconcile to the consumed total. Nothing was posted.', 'statement');
      if (board.periodLedgerIdentity === false) return fail('REFUSED — the statement does not reproduce the period ledger it claims to read. Nothing was posted.', 'statement');
      if (board.arithmeticSafe !== true) return fail('REFUSED — a sum left the exact-integer range; no total is claimed and nothing was posted.', 'statement');

      const currency = transferPriceCurrency(input.currency);
      if (!currency) return fail('Name the posting currency as a three-letter code. It is never defaulted.', 'currency');
      const currencyRow = board.currencies.find((c) => c.currency === currency && ((c.chargedCents || 0) > 0 || (c.creditedCents || 0) > 0));
      if (!currencyRow) {
        const available = board.currencies.filter((c) => (c.chargedCents || 0) > 0).map((c) => c.currency);
        return fail(available.length
          ? `No charge in ${currency} is on this period’s statement. Postable: ${available.join(', ')}.`
          : 'No charge in any currency is on this period’s statement.', 'currency');
      }

      // One live posting per (period, currency).
      const { liveByKey } = compileChargebackPostings(store.state.chargebackPostings || []);
      const key = periodCurrencyKey(window.from, window.to, currency);
      if ((liveByKey.get(key) || []).length > 0) {
        return fail(`${window.from} to ${window.to} is already posted in ${currency}. A closed period is corrected by a dated reversal, never by posting over it: reverse the existing posting first.`, 'period');
      }

      // The rows are the statement's rows. Nothing is typed in.
      const accountCents = statementAccountCents(report, currency);
      if (!accountCents.size) return fail(`No line account carries ${currency} on this period’s statement.`, 'currency');

      const rawBindings = Array.isArray(input.bindings) ? input.bindings : [];
      const bindingByAccount = new Map();
      for (const b of rawBindings) {
        if (!b || typeof b !== 'object') return fail('Each binding is an object naming an account.', 'bindings');
        const accountId = text(b.accountId);
        if (!accountId) return fail('A binding must name the line account it binds.', 'bindings');
        if (bindingByAccount.has(accountId)) return fail(`Two bindings name ${nameOf(matrix, accountId)}. One line, one binding.`, 'bindings');
        if (!accountCents.has(accountId)) return fail(`${nameOf(matrix, accountId)} carries no ${currency} on this period’s statement, so a binding for that line would record nothing. Remove it.`, 'bindings');
        bindingByAccount.set(accountId, b);
      }

      const budgets = Array.isArray(store.state.budgets) ? store.state.budgets : [];
      const budgetsById = new Map(budgets.filter((b) => b && b.id).map((b) => [b.id, b]));
      const rows = [];
      let sumCharged = 0;
      let sumCredited = 0;
      for (const [accountId, cents] of [...accountCents.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
        const b = bindingByAccount.get(accountId);
        if (!b) return fail(`Every line on the statement needs a binding: ${nameOf(matrix, accountId)} (${formatCents(cents.chargedCents)} charged / ${formatCents(cents.creditedCents)} credited ${currency}) has none. Bind an envelope or declare no-envelope with a written reason.`, 'bindings');
        const envelopeId = text(b.envelopeId) || null;
        const reason = text(b.reason).slice(0, CHARGEBACK_POSTING_LIMITS.reasonMax);
        let noEnvelopeReason = '';
        if (envelopeId) {
          const budget = budgetsById.get(envelopeId);
          if (!budget) return fail(`The envelope bound to ${nameOf(matrix, accountId)} is not on the record.`, 'bindings');
          if (budget.ownerId !== accountId) return fail(`“${budget.name}” is not owned by ${nameOf(matrix, accountId)}. A line’s charge stands against ITS OWN envelope — responsibility accounting does not borrow a neighbour’s authority.`, 'bindings');
          if (budget.currency !== currency) return fail(`“${budget.name}” is recorded in ${budget.currency}, not ${currency}. Nothing is converted.`, 'bindings');
          if (budget.status !== 'active') return fail(`“${budget.name}” is ${budget.status}, not active. A period fact is not bound to a dead authority at the door.`, 'bindings');
        } else {
          if (reason.length < CHARGEBACK_POSTING_LIMITS.reasonMin) {
            return fail(`${nameOf(matrix, accountId)} has no envelope bound. Declaring no-envelope requires a written reason of at least ${CHARGEBACK_POSTING_LIMITS.reasonMin} characters — an absence is recorded, never implied.`, 'bindings');
          }
          noEnvelopeReason = reason;
        }
        sumCharged += cents.chargedCents;
        sumCredited += cents.creditedCents;
        rows.push({ accountId, chargedCents: cents.chargedCents, creditedCents: cents.creditedCents, envelopeId, noEnvelopeReason });
      }
      if (rows.length > CHARGEBACK_POSTING_LIMITS.rowsPerPosting) return fail(`This statement names ${rows.length} line accounts; the posting ledger holds at most ${CHARGEBACK_POSTING_LIMITS.rowsPerPosting} per posting.`, 'bindings');
      // Defensive identity: the posting's own rows must reproduce the
      // statement's workspace totals exactly, or nothing is written.
      if (sumCharged !== currencyRow.chargedCents || sumCredited !== currencyRow.creditedCents || sumCharged !== sumCredited) {
        return fail('Internal refusal: the per-line rows do not reproduce the workspace totals as integer equality. Nothing was posted; export the workspace and report this.', 'statement');
      }

      if ((store.state.chargebackPostings || []).length >= CHARGEBACK_POSTING_LIMITS.acts) {
        return fail('The posting ledger is full. Export it before recording more.', 'posting');
      }

      const act = {
        id: newId('cbp'),
        kind: 'post',
        via: seat.fullAccess ? 'operator' : 'seat',
        decidedBySeatId: seat.fullAccess ? null : seat.id,
        decidedOn: today,
        at: at.toISOString(),
        note: text(input.note).slice(0, CHARGEBACK_POSTING_LIMITS.noteMax),
        periodFrom: window.from,
        periodTo: window.to,
        currency,
        rows,
        totalChargedCents: sumCharged,
        totalCreditedCents: sumCredited,
        entriesN: currencyRow.entriesN,
        pricedShareDays: board.pricedShareDays,
        claims: {
          statementComplete: true,
          zeroSum: true,
          shareDaysReconcile: true,
          periodLedgerIdentity: board.periodLedgerIdentity === true ? true : null,
          arithmeticSafe: true,
        },
        engineVersion: report.engineVersion,
      };
      append(act, {
        type: CHARGEBACK_POSTING_EVENTS.POSTED, entity: 'chargebackPosting', entityId: act.id,
        summary: `Posted the ${window.from}–${window.to} chargeback statement in ${currency}: ${formatCents(sumCharged)} charged across ${rows.length} line account(s), netting to zero. ${rows.filter((r) => r.envelopeId).length} bound to envelope(s), ${rows.filter((r) => !r.envelopeId).length} declared no-envelope.`.slice(0, 300),
      });
      return saved(store, { id: act.id, periodFrom: window.from, periodTo: window.to, currency, totalChargedCents: sumCharged, rowsN: rows.length });
    },

    chargebackReversePosting(postingId, reason) {
      const { at, today, seat } = context();
      const standing = postingStanding(seat);
      if (standing) return standing;
      const id = text(postingId);
      const why = text(reason).slice(0, CHARGEBACK_POSTING_LIMITS.reasonMax);
      if (!id) return fail('Name the posting to reverse.', 'postingId');
      if (why.length < CHARGEBACK_POSTING_LIMITS.reasonMin) return fail(`A reversal needs a written reason of at least ${CHARGEBACK_POSTING_LIMITS.reasonMin} characters — a reversed period fact without one is an erasure.`, 'reason');
      const { posts } = compileChargebackPostings(store.state.chargebackPostings || []);
      const doc = posts.get(id);
      if (!doc) return fail('That posting is not on the record.', 'postingId');
      if (doc.reverse) return fail(`That posting was already reversed on ${doc.reverse.decidedOn}.`, 'postingId');
      if ((store.state.chargebackPostings || []).length >= CHARGEBACK_POSTING_LIMITS.acts) {
        return fail('The posting ledger is full. Export it before recording more.', 'posting');
      }
      const act = {
        id: newId('cbr'), kind: 'reverse', via: seat.fullAccess ? 'operator' : 'seat',
        decidedBySeatId: seat.fullAccess ? null : seat.id, decidedOn: today, at: at.toISOString(),
        postingId: id, reason: why,
      };
      append(act, {
        type: CHARGEBACK_POSTING_EVENTS.REVERSED, entity: 'chargebackPosting', entityId: id,
        summary: `Reversed the ${doc.post.periodFrom}–${doc.post.periodTo} ${doc.post.currency} chargeback posting: ${why}`.slice(0, 300),
      });
      return saved(store, { id: act.id, postingId: id });
    },

    chargebackPostingScan() {
      const { seat } = context();
      const standing = governStanding(seat, 'scanning postings');
      if (standing) return standing;
      store.update(() => {}, {
        type: CHARGEBACK_POSTING_EVENTS.SCAN, entity: 'workspace', entityId: 'chargeback-postings',
        summary: `Scanned the last completed quarter for complete, unposted chargeback statements (${CHARGEBACK_POSTING_RULE_ID}).`,
      });
      const effects = (store.lastPropagations || []).filter((p) => p && p.ruleId === CHARGEBACK_POSTING_RULE_ID);
      return saved(store, { effects });
    },

    chargebackPostingSetConventions(input = {}) {
      const { seat } = context();
      const standing = governStanding(seat, 'setting posting conventions');
      if (standing) return standing;
      if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('Provide the conventions as an object.', 'conventions');
      const patch = {};
      if (input.askDueDays !== undefined) {
        const [min, max] = CHARGEBACK_POSTING_BOUNDS.askDueDays;
        const n = Number(input.askDueDays);
        // Refused, never clamped: a window the leader did not choose would put
        // a due date on somebody's task that nobody set.
        if (input.askDueDays === null || input.askDueDays === '' || typeof input.askDueDays === 'boolean' || !Number.isInteger(n) || n < min || n > max) {
          return fail(`The ask window is a whole number of days from ${min} to ${max}.`, 'askDueDays');
        }
        patch.chargebackPostingAskDueDays = n;
      }
      if (input.autoPropagate !== undefined) {
        if (typeof input.autoPropagate !== 'boolean') return fail('The automation switch is on or off.', 'autoPropagate');
        patch.chargebackPostingAutoPropagate = input.autoPropagate;
      }
      if (!Object.keys(patch).length) return fail('Nothing to change: name `askDueDays` or `autoPropagate`.', 'conventions');
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...patch };
      }, {
        type: CHARGEBACK_POSTING_EVENTS.CONVENTIONS, entity: 'workspace', entityId: 'chargeback-postings',
        summary: `Chargeback posting conventions set: ${Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(', ')}.`.slice(0, 300),
      });
      return saved(store, { conventions: patch });
    },
  };
}
