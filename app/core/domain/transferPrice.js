/**
 * app/core/domain/transferPrice.js — the Cross-Line Labour Chargeback &
 * Internal Transfer-Price Ledger (ADR-0177, Schema v142, `#/matrix?panel=chargeback`).
 *
 * THE QUESTION, IN AN OPERATOR'S WORDS. "The migration programme had 40% of two
 * of my engineers all quarter. My budget paid for them and their return looks
 * better than it is by exactly that much. What do they owe us, on whose terms
 * — and across the company, does it all net out?"
 *
 * WHAT THIS MODULE DOES
 * ---------------------
 *  1. Compiles the stored two-key ACTS into agreements (proposed / agreed /
 *     declined / withdrawn / voided). Only an agreed price carries money.
 *  2. Reads the CONSUMED share-days of the named period from the Matrix Line
 *     Period-Allocation Ledger (ADR-0158) and walks each priced row day by day
 *     through the SAME share timeline, so the two ledgers cannot disagree —
 *     and checks that identity as integer equality.
 *  3. Resolves the LENDING line of every day from the recorded home-line
 *     history (ADR-0149), in states that are never collapsed: `observed`,
 *     `presumed-current` (no history at all for the person — labelled on every
 *     figure) and refused (`lender-unrecorded`, `lender-conflict`).
 *  4. Prices each day with the ONE agreed price between that lending line and
 *     the borrowing line. No price, a proposal with one key, or two colliding
 *     prices are REFUSALS with their own counts — never zero, never an average.
 *  5. Posts each priced piece as one charge and one identical credit, in exact
 *     integer cents, per currency; consolidates spans along the home-line tree
 *     with intra-span eliminations; and proves the workspace nets to zero.
 *
 * THE CLAIMS IT KEEPS APART (Bulletproof Reliability Mandate)
 * ----------------------------------------------------------
 *   "the share-day partition adds up"        → `board.shareDaysReconcile`
 *   "these are the period ledger's figures"  → `board.periodLedgerIdentity`
 *   "every charge has its credit"            → `board.zeroSum.holds`
 *   "the statement covers the whole period"  → `board.statementComplete`
 * A statement that nets to zero over the part that happens to be priced is
 * exactly the reassuring lie this module refuses to tell: nets are WITHHELD
 * wherever a refusal touches them, and the reason is printed.
 *
 * Pure module: no DOM, no storage, no clock beyond the injected `now`. It
 * never writes; nothing it prints is stored.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixLineScope } from './matrix.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { buildStructureLedger } from './structureHistory.js';
import { buildLinePeriodAllocation, resolveAllocationWindow, shareOnDay, shareTimelineFor } from './linePeriodAllocation.js';
import {
  TRANSFER_PRICE_AGREEMENT_LABELS,
  TRANSFER_PRICE_AGREEMENT_STATES,
  TRANSFER_PRICE_AGREEMENT_TONES,
  TRANSFER_PRICE_CSV_COLUMNS,
  TRANSFER_PRICE_ENGINE_VERSION,
  TRANSFER_PRICE_LENDER_BASIS_LABELS,
  TRANSFER_PRICE_LIMITS,
  TRANSFER_PRICE_LIMITS_TEXT,
  TRANSFER_PRICE_METHOD,
  TRANSFER_PRICE_PIECE_LABELS,
  TRANSFER_PRICE_PIECE_REASONS,
  TRANSFER_PRICE_PIECE_TONES,
  TRANSFER_PRICE_REFUSAL_STATES,
  TRANSFER_PRICE_RIGHTS,
  TRANSFER_PRICE_ROW_LABELS,
  TRANSFER_PRICE_ROW_STATES,
  TRANSFER_PRICE_ROW_TONES,
  TRANSFER_PRICE_RULE_ID,
  transferPriceBasis,
  transferPriceVerdict,
} from './transferPriceRegistry.js';
import { formatCents, inclusiveDays, normalizeTransferPriceSettings, shiftDay, transferPriceDay } from './transferPriceSchema.js';

const DAY_MS = 86400000;
const UNKNOWN_LENDER = '?';
const ROW_SEVERITY = { unmeasured: 0, unpriced: 1, 'partly-priced': 2, priced: 3 };

export const transferPricePairKey = (lenderId, borrowerId) => `${lenderId || UNKNOWN_LENDER}>${borrowerId}`;

const safeAdd = (a, b) => {
  const sum = a + b;
  return Number.isSafeInteger(sum) ? sum : NaN;
};

function bump(map, key, n) {
  map.set(key, safeAdd(map.get(key) || 0, n));
}

/* ------------------------------------------------------------- agreements */

/**
 * Compile the append-only acts into agreements. Pure and total: an act that
 * does not fit (a second proposal for one id, a key from the proposing side, an
 * answer after a retirement) is ignored here exactly as the normalizer drops it
 * on load, so a draft that has not been reloaded reads the same as one that has.
 *
 * `coverFrom`/`coverTo` are the days the agreement PRICES: the whole term of an
 * agreed price, the days before `voidFrom` of a voided one, and nothing at all
 * for a proposal — one key is not a price.
 */
export function compileTransferPrices(acts) {
  const byId = new Map();
  for (const act of Array.isArray(acts) ? acts : []) {
    if (!act || typeof act !== 'object' || !act.agreementId) continue;
    if (act.kind === 'propose') {
      if (byId.has(act.agreementId)) continue;
      byId.set(act.agreementId, {
        id: act.agreementId,
        lenderId: act.lenderId,
        borrowerId: act.borrowerId,
        pairKey: transferPricePairKey(act.lenderId, act.borrowerId),
        currency: act.currency,
        rateCents: act.rateCents,
        basis: act.basis,
        effectiveFrom: act.effectiveFrom,
        effectiveTo: act.effectiveTo,
        termDays: inclusiveDays(act.effectiveFrom, act.effectiveTo),
        note: act.note || '',
        proposedBySide: act.side,
        proposedOn: act.decidedOn,
        proposedVia: act.via,
        confirmedOn: null,
        confirmedVia: null,
        retiredOn: null,
        retiredBySide: null,
        retiredVia: null,
        retireReason: '',
        voidFrom: null,
        state: 'proposed',
        coverFrom: null,
        coverTo: null,
        agreedOn: null,
        bothKeysScribed: false,
      });
      continue;
    }
    const a = byId.get(act.agreementId);
    if (!a || a.retiredOn) continue;
    if (act.kind === 'confirm') {
      if (a.confirmedOn || act.side === a.proposedBySide) continue;
      a.confirmedOn = act.decidedOn;
      a.confirmedVia = act.via;
    } else if (act.kind === 'retire') {
      a.retiredOn = act.decidedOn;
      a.retiredBySide = act.side;
      a.retiredVia = act.via;
      a.retireReason = act.note || '';
      a.voidFrom = a.confirmedOn ? (act.voidFrom || null) : null;
    }
  }
  for (const a of byId.values()) {
    if (a.confirmedOn) {
      a.agreedOn = a.confirmedOn;
      a.bothKeysScribed = a.proposedVia === 'operator' && a.confirmedVia === 'operator';
      if (a.retiredOn) {
        a.state = 'voided';
        const last = a.voidFrom ? shiftDay(a.voidFrom, -1) : null;
        const coverTo = last && last < a.effectiveTo ? last : a.effectiveTo;
        if (last && coverTo >= a.effectiveFrom) {
          a.coverFrom = a.effectiveFrom;
          a.coverTo = coverTo;
        }
      } else {
        a.state = 'agreed';
        a.coverFrom = a.effectiveFrom;
        a.coverTo = a.effectiveTo;
      }
    } else if (a.retiredOn) {
      a.state = a.retiredBySide === a.proposedBySide ? 'withdrawn' : 'declined';
    }
  }
  return byId;
}

/** The days a not-yet-dead agreement lays claim to, for the overlap refusal. */
export function transferPriceClaim(agreement) {
  if (!agreement) return null;
  if (agreement.state === 'proposed') return { from: agreement.effectiveFrom, to: agreement.effectiveTo };
  if ((agreement.state === 'agreed' || agreement.state === 'voided') && agreement.coverFrom) {
    return { from: agreement.coverFrom, to: agreement.coverTo };
  }
  return null;
}

/**
 * How many stored declarations evidence that `lenderId`'s home line lends a
 * person to `borrowerId`'s line — today's roster pointer or ANY recorded
 * home-line period. A price with nothing to price is refused at the door, and
 * this is what catches a pair typed the wrong way round.
 */
export function lendingPairEvidence(state, lenderId, borrowerId) {
  const lines = Array.isArray(state?.reportingLines) ? state.reportingLines : [];
  if (!lines.length || !lenderId || !borrowerId || lenderId === borrowerId) return 0;
  const homeOf = new Map();
  for (const p of Array.isArray(state?.people) ? state.people : []) {
    if (p && p.id && p.status !== 'archived') homeOf.set(p.id, p.managerId || LEADER_ID);
  }
  const everLent = new Set();
  for (const r of Array.isArray(state?.structureHistory) ? state.structureHistory : []) {
    if (r && r.personId && r.managerId === lenderId) everLent.add(r.personId);
  }
  let n = 0;
  for (const row of lines) {
    if (!row || row.managerId !== borrowerId) continue;
    if (homeOf.get(row.personId) === lenderId || everLent.has(row.personId)) n += 1;
  }
  return n;
}

/* ------------------------------------------------------------ day resolvers */

/**
 * The lending line of one person on one day, in states that are never
 * collapsed (ADR-0149's discipline, applied to money):
 *
 *   observed          exactly one recorded home-line period covers the day
 *   presumed-current  the person has NO recorded history; today's roster
 *                     pointer is presumed and labelled on every figure
 *   lender-unrecorded history exists and no period covers the day — REFUSED
 *   lender-conflict   two periods cover the day — REFUSED, neither picked
 */
function lenderResolver(ledger, person) {
  const rows = ledger.byPerson.get(person.id) || [];
  if (!rows.length) {
    const presumed = { basis: 'presumed-current', lenderId: person.rawManagerId || LEADER_ID, refusal: null };
    return () => presumed;
  }
  return (day) => {
    let hit = null;
    let n = 0;
    for (const r of rows) {
      if (r.fromISO <= day && (!r.toISO || r.toISO >= day)) { n += 1; hit = r; }
    }
    if (n === 1 && hit.managerId) return { basis: 'observed', lenderId: hit.managerId, refusal: null };
    return { basis: null, lenderId: null, refusal: n > 1 ? 'lender-conflict' : 'lender-unrecorded' };
  };
}

function priceIndex(agreements) {
  const agreed = new Map();
  const proposed = new Map();
  for (const a of agreements.values()) {
    const target = a.state === 'proposed' ? proposed : ((a.state === 'agreed' || a.state === 'voided') && a.coverFrom ? agreed : null);
    if (!target) continue;
    if (!target.has(a.pairKey)) target.set(a.pairKey, []);
    target.get(a.pairKey).push(a);
  }
  return (pairKey, day) => {
    let hit = null;
    let n = 0;
    for (const a of agreed.get(pairKey) || []) {
      if (a.coverFrom <= day && a.coverTo >= day) { n += 1; hit = a; }
    }
    if (n === 1) return { state: 'priced', agreement: hit };
    if (n > 1) return { state: 'price-conflict', agreement: null };
    const pending = (proposed.get(pairKey) || []).some((a) => a.effectiveFrom <= day && a.effectiveTo >= day);
    return { state: pending ? 'awaiting-second-key' : 'no-agreed-price', agreement: null };
  };
}

/** Every day from `fromDay` to `toDay` inclusive, as UTC day keys. */
function eachDay(fromDay, toDay, fn) {
  const start = Date.parse(`${fromDay}T00:00:00.000Z`);
  const end = Date.parse(`${toDay}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return;
  for (let t = start; t <= end; t += DAY_MS) fn(new Date(t).toISOString().slice(0, 10));
}

/**
 * Price ONE period-ledger row. A `computed` row is walked day by day through
 * the same share timeline the period ledger used; consecutive days with the
 * same share, lender, price and timing fold into one piece. A row the period
 * ledger refused is walked for its lenders only — it has no share-days to
 * price, and inventing them here would overrule the refusal next door.
 */
function priceRow({ line, stored, window, lenderOf, priceOn }) {
  const borrowerId = line.managerId;
  const measured = line.state === 'computed' && line.overlap && Number.isInteger(line.shareDaysH) && Boolean(stored);
  let from = line.overlap?.from || null;
  let to = line.overlap?.to || null;
  if (!from || !to) {
    const lineFrom = transferPriceDay(line.fromISO);
    const lineTo = transferPriceDay(line.toISO);
    from = lineFrom && lineFrom > window.from ? lineFrom : window.from;
    to = lineTo && lineTo < window.to ? lineTo : window.to;
    if (from > to) { from = window.from; to = window.to; }
  }
  const timeline = measured ? shareTimelineFor(stored) : null;
  const pieces = [];
  const lenderIds = new Set();
  let lenderUnknown = false;
  let shareGap = false;
  let last = null;
  let lastKey = null;

  eachDay(from, to, (day) => {
    const lender = lenderOf(day);
    if (lender.lenderId) lenderIds.add(lender.lenderId); else lenderUnknown = true;
    if (!measured) return;
    const share = shareOnDay(timeline, day);
    if (!Number.isInteger(share)) { shareGap = true; return; }
    let state;
    let agreement = null;
    if (lender.refusal) state = lender.refusal;
    else if (lender.lenderId === borrowerId) state = 'same-line';
    else {
      const priced = priceOn(transferPricePairKey(lender.lenderId, borrowerId), day);
      state = priced.state;
      agreement = priced.agreement;
    }
    const retroactive = Boolean(agreement) && day < agreement.agreedOn;
    const key = `${state}|${share}|${lender.lenderId || ''}|${lender.basis || ''}|${agreement ? agreement.id : ''}|${retroactive ? 1 : 0}`;
    if (last && key === lastKey) {
      last.toDay = day;
      last.days += 1;
      return;
    }
    last = {
      fromDay: day, toDay: day, days: 1, shareH: share, state,
      lenderId: lender.lenderId, lenderBasis: lender.basis,
      agreementId: agreement ? agreement.id : null,
      currency: agreement ? agreement.currency : null,
      rateCents: agreement ? agreement.rateCents : null,
      basis: agreement ? agreement.basis : null,
      retroactive,
    };
    lastKey = key;
    pieces.push(last);
  });

  let shareDays = 0;
  for (const piece of pieces) {
    piece.shareDays = piece.shareH * piece.days;
    piece.cents = piece.state === 'priced' ? piece.shareDays * piece.rateCents : null;
    shareDays = safeAdd(shareDays, piece.shareDays);
  }
  // THE CROSS-LEDGER IDENTITY: the share-days walked here must be the figure
  // the period ledger printed for this row. If they are not, the row is not
  // priced on a number this module made up — it is reported as unmeasured.
  const identityHolds = measured && !shareGap && shareDays === line.shareDaysH;
  return {
    personId: line.personId,
    declarationId: line.declarationId,
    kind: line.kind,
    borrowerId,
    from,
    to,
    measured: Boolean(identityHolds),
    identityBroken: measured && !identityHolds,
    periodState: line.state,
    periodReason: identityHolds
      ? line.reason
      : (measured ? 'The share-days walked for this row did not equal the period ledger’s figure, so the row is reported as unmeasured rather than priced on a number that disagrees with its source.' : line.reason),
    periodShareDays: Number.isInteger(line.shareDaysH) ? line.shareDaysH : null,
    pieces: identityHolds ? pieces : [],
    lenderIds: [...lenderIds],
    lenderUnknown,
  };
}

/* ---------------------------------------------------------------- the ledger */

function emptyStateCounts(keys) {
  const out = {};
  for (const key of keys) out[key] = 0;
  return out;
}

function currencyRows(map, extra = () => ({})) {
  return [...map.keys()].sort().map((currency) => ({ currency, ...extra(currency) }));
}

/**
 * Build the whole statement for one named period, under the acting seat.
 *
 * `from`/`to` name the period exactly as the period ledger reads them: absent
 * means the LAST COMPLETED CALENDAR QUARTER (and the report says so); present
 * but unreadable or out of bounds means the reading is REFUSED, never clamped.
 *
 * A scoped seat reads the line accounts it reaches (itself, its home-line
 * span, managers it holds on a declared line) and every piece that names one of
 * them. Everything else is COUNTED as withheld — never silently dropped, never
 * widened. Names outside the seat are withheld; a party always sees its own
 * counterparty, because it signed with them.
 */
export function buildTransferPriceLedger(state = {}, { from = null, to = null, now = new Date(), settings = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at) || new Date().toISOString().slice(0, 10);
  const cfg = settings || state.settings || {};
  const conv = normalizeTransferPriceSettings(cfg);
  const rawLines = Array.isArray(state.reportingLines) ? state.reportingLines : [];
  const acts = Array.isArray(state.transferPriceActs) ? state.transferPriceActs : [];

  const matrix = buildMatrix(state, { now: at, settings: cfg });
  const lineScope = matrixLineScope(matrix);
  const built = buildSeats(state, { now: at, settings: cfg, lineScope: lineScope.byManager.size ? lineScope.byManager : null });
  const seat = activeSeat(built);
  const full = Boolean(seat.fullAccess);
  const readableAccount = (id) => full || (!seat.readOnly && Boolean(id) && (id === seat.id || Boolean(seat.scope?.has?.(id)) || Boolean(seat.lineScope?.has?.(id))));
  const readablePerson = readableAccount;

  const peopleById = new Map((Array.isArray(state.people) ? state.people : []).filter((p) => p && p.id).map((p) => [p.id, p]));
  const onRoster = (id) => id === LEADER_ID || matrix.roster.has(id);
  const rawName = (id) => {
    if (!id) return 'Unknown';
    if (id === LEADER_ID) return matrix.nodes.get(LEADER_ID)?.name || 'Workspace leader';
    return matrix.roster.get(id)?.name || peopleById.get(id)?.name || id;
  };
  /** A line's name as THIS seat may read it: its own reach, or its own counterparty. */
  const lineName = (id, counterpartyId = null) => {
    if (!id) return { name: 'Not recorded', withheld: false };
    if (readableAccount(id) || (counterpartyId && !full && counterpartyId === seat.id)) return { name: rawName(id), withheld: false };
    return { name: 'A line outside this seat', withheld: true };
  };

  // The whole-workspace consumption, read with the operator view so the zero-sum
  // identity is a fact about the WORKSPACE and not about whichever seat asked.
  const operatorCfg = { ...cfg, activeSeatId: null };
  const allocation = rawLines.length
    ? buildLinePeriodAllocation({ ...state, settings: operatorCfg }, { from, to, now: at, settings: operatorCfg })
    : null;
  // A workspace with no declared line is never walked: the window is resolved
  // by the period ledger's own resolver and the statement is inert.
  const window = allocation
    ? allocation.window
    : resolveAllocationWindow({ from, to, now: at, source: from || to ? 'query' : 'default' });

  const agreements = compileTransferPrices(acts);
  const priceOn = priceIndex(agreements);
  const structure = buildStructureLedger(state);
  const storedById = new Map(rawLines.filter((r) => r && r.id).map((r) => [r.id, r]));

  /* 1. Price every in-window row of the whole workspace. */
  const allRows = [];
  if (allocation && window.valid) {
    for (const person of allocation.persons) {
      const rosterPerson = matrix.roster.get(person.personId);
      if (!rosterPerson) continue;
      const lenderOf = lenderResolver(structure, rosterPerson);
      for (const line of person.lines) {
        if (line.state === 'out-of-scope-home' || line.state === 'out-of-window' || line.inWindow === false) continue;
        allRows.push(priceRow({ line, stored: storedById.get(line.declarationId) || null, window, lenderOf, priceOn }));
      }
    }
  }

  /* 2. Post the WORKSPACE: accounts, pairs and the taint that withholds a net. */
  const accounts = new Map();
  const account = (id) => {
    if (!accounts.has(id)) {
      accounts.set(id, { id, charged: new Map(), credited: new Map(), entries: new Map(), unpricedShareDays: 0, unmeasuredRowsN: 0 });
    }
    return accounts.get(id);
  };
  const pairs = new Map();
  const pairOf = (lenderId, borrowerId) => {
    const key = transferPricePairKey(lenderId, borrowerId);
    if (!pairs.has(key)) {
      pairs.set(key, {
        pairKey: key, lenderId: lenderId || null, borrowerId,
        shareDays: 0, pricedShareDays: 0, zeroPricedShareDays: 0, unpricedShareDays: 0,
        refused: emptyStateCounts(TRANSFER_PRICE_REFUSAL_STATES), cents: new Map(),
        personIds: new Set(), declarationIds: new Set(), unmeasuredRowsN: 0,
        presumedShareDays: 0, retroactiveShareDays: 0,
      });
    }
    return pairs.get(key);
  };
  const workspaceCharged = new Map();
  const workspaceCredited = new Map();
  let unknownLenderShareDays = 0;
  let unknownLenderRowsN = 0;
  let arithmeticSafe = true;

  for (const row of allRows) {
    if (!row.measured) {
      account(row.borrowerId).unmeasuredRowsN += 1;
      for (const lenderId of row.lenderIds) {
        if (lenderId === row.borrowerId) continue;
        account(lenderId).unmeasuredRowsN += 1;
        const pair = pairOf(lenderId, row.borrowerId);
        pair.unmeasuredRowsN += 1;
        pair.personIds.add(row.personId);
        pair.declarationIds.add(row.declarationId);
      }
      if (row.lenderUnknown) {
        unknownLenderRowsN += 1;
        const pair = pairOf(null, row.borrowerId);
        pair.unmeasuredRowsN += 1;
        pair.personIds.add(row.personId);
        pair.declarationIds.add(row.declarationId);
      }
      continue;
    }
    for (const piece of row.pieces) {
      if (piece.state === 'same-line') continue;
      const pair = pairOf(piece.lenderId, row.borrowerId);
      pair.shareDays = safeAdd(pair.shareDays, piece.shareDays);
      pair.personIds.add(row.personId);
      pair.declarationIds.add(row.declarationId);
      if (piece.state === 'priced') {
        pair.pricedShareDays = safeAdd(pair.pricedShareDays, piece.shareDays);
        if (piece.rateCents === 0) pair.zeroPricedShareDays = safeAdd(pair.zeroPricedShareDays, piece.shareDays);
        if (piece.lenderBasis === 'presumed-current') pair.presumedShareDays = safeAdd(pair.presumedShareDays, piece.shareDays);
        if (piece.retroactive) pair.retroactiveShareDays = safeAdd(pair.retroactiveShareDays, piece.shareDays);
        bump(pair.cents, piece.currency, piece.cents);
        const borrower = account(row.borrowerId);
        const lender = account(piece.lenderId);
        bump(borrower.charged, piece.currency, piece.cents);
        bump(lender.credited, piece.currency, piece.cents);
        bump(borrower.entries, piece.currency, 1);
        bump(lender.entries, piece.currency, 1);
        bump(workspaceCharged, piece.currency, piece.cents);
        bump(workspaceCredited, piece.currency, piece.cents);
        if (!Number.isSafeInteger(piece.cents)) arithmeticSafe = false;
      } else {
        pair.unpricedShareDays = safeAdd(pair.unpricedShareDays, piece.shareDays);
        pair.refused[piece.state] = safeAdd(pair.refused[piece.state], piece.shareDays);
        account(row.borrowerId).unpricedShareDays += piece.shareDays;
        if (piece.lenderId) account(piece.lenderId).unpricedShareDays += piece.shareDays;
        else unknownLenderShareDays += piece.shareDays;
      }
    }
  }
  for (const map of [workspaceCharged, workspaceCredited]) {
    for (const value of map.values()) if (!Number.isSafeInteger(value)) arithmeticSafe = false;
  }

  // A share-day whose lender is unknown may belong to ANY line's credit side,
  // so while one exists no line's net can be claimed.
  const lenderUnknownAnywhere = unknownLenderShareDays > 0 || unknownLenderRowsN > 0;
  const accountComplete = (a) => a.unpricedShareDays === 0 && a.unmeasuredRowsN === 0;
  const netPrintable = (a) => arithmeticSafe && accountComplete(a) && !lenderUnknownAnywhere;
  const withheldNetReason = (a) => {
    if (!arithmeticSafe) return 'A sum left the exact-integer range, so no net is printed.';
    if (a.unmeasuredRowsN) return `${a.unmeasuredRowsN} line row(s) naming this line were refused by the period ledger, so what it owes or is owed for them is unknown.`;
    if (a.unpricedShareDays) return `${a.unpricedShareDays} share-day(s) naming this line carry no two-key price. A net over the priced part would misstate what this line owes or is owed.`;
    if (lenderUnknownAnywhere) return 'At least one share-day in this period has no recorded home line, so the line that should be credited for it is unknown — and it could be this one.';
    return null;
  };

  // THE ZERO-SUM IDENTITY, checked as integer equality over the WORKSPACE:
  // per currency, total charged equals total credited AND the line nets sum to 0.
  const zeroSumCurrencies = [...new Set([...workspaceCharged.keys(), ...workspaceCredited.keys()])].sort();
  let zeroSumHolds = arithmeticSafe;
  for (const currency of zeroSumCurrencies) {
    const charged = workspaceCharged.get(currency) || 0;
    const credited = workspaceCredited.get(currency) || 0;
    let nets = 0;
    for (const a of accounts.values()) nets += (a.credited.get(currency) || 0) - (a.charged.get(currency) || 0);
    if (charged !== credited || nets !== 0) zeroSumHolds = false;
  }

  /* 3. The seat's reading: filter pieces, rows, pairs, accounts and agreements. */
  const pieceVisible = (row, piece) => readableAccount(row.borrowerId) || (piece.lenderId && readableAccount(piece.lenderId));
  const rowVisible = (row) => readableAccount(row.borrowerId) || row.lenderIds.some((id) => readableAccount(id));

  const rows = [];
  let rowsWithheldN = 0;
  let periodIdentityFailures = 0;
  const visiblePersonIds = new Set();
  const share = { consumed: 0, priced: 0, zeroPriced: 0, unpriced: 0, sameLine: 0, presumed: 0, retroactive: 0, refused: emptyStateCounts(TRANSFER_PRICE_REFUSAL_STATES) };
  const rowCounts = emptyStateCounts(TRANSFER_PRICE_ROW_STATES);
  for (const row of allRows) {
    if (row.identityBroken) periodIdentityFailures += 1;
    if (!rowVisible(row)) { rowsWithheldN += 1; continue; }
    const pieces = row.measured ? row.pieces.filter((piece) => pieceVisible(row, piece)) : [];
    const hiddenPieces = row.measured ? row.pieces.length - pieces.length : 0;
    let shareDays = 0;
    let pricedShareDays = 0;
    let unpricedShareDays = 0;
    let sameLineShareDays = 0;
    const cents = new Map();
    for (const piece of pieces) {
      shareDays += piece.shareDays;
      if (piece.state === 'priced') {
        pricedShareDays += piece.shareDays;
        bump(cents, piece.currency, piece.cents);
        if (piece.rateCents === 0) share.zeroPriced += piece.shareDays;
        if (piece.lenderBasis === 'presumed-current') share.presumed += piece.shareDays;
        if (piece.retroactive) share.retroactive += piece.shareDays;
      } else if (piece.state === 'same-line') {
        sameLineShareDays += piece.shareDays;
      } else {
        unpricedShareDays += piece.shareDays;
        share.refused[piece.state] += piece.shareDays;
      }
    }
    share.consumed += shareDays;
    share.priced += pricedShareDays;
    share.unpriced += unpricedShareDays;
    share.sameLine += sameLineShareDays;
    const chargeable = pricedShareDays + unpricedShareDays;
    const rowState = !row.measured ? 'unmeasured'
      : unpricedShareDays === 0 ? 'priced'
        : pricedShareDays === 0 ? 'unpriced' : 'partly-priced';
    rowCounts[rowState] += 1;
    const personShown = readablePerson(row.personId);
    if (personShown) visiblePersonIds.add(row.personId);
    // A lender of this row is a party to it and reads its own counterparty.
    const borrower = lineName(row.borrowerId, !full && row.lenderIds.includes(seat.id) ? seat.id : null);
    rows.push({
      personId: personShown ? row.personId : null,
      personName: personShown ? rawName(row.personId) : 'A person outside this seat',
      personWithheld: !personShown,
      declarationId: personShown ? row.declarationId : null,
      kind: row.kind,
      borrowerId: borrower.withheld ? null : row.borrowerId,
      borrowerName: borrower.name,
      from: row.from,
      to: row.to,
      measured: row.measured,
      periodState: row.periodState,
      periodReason: row.periodReason,
      state: rowState,
      stateLabel: TRANSFER_PRICE_ROW_LABELS[rowState],
      stateTone: TRANSFER_PRICE_ROW_TONES[rowState],
      shareDays: row.measured ? shareDays : null,
      pricedShareDays: row.measured ? pricedShareDays : null,
      unpricedShareDays: row.measured ? unpricedShareDays : null,
      sameLineShareDays: row.measured ? sameLineShareDays : null,
      chargeableShareDays: row.measured ? chargeable : null,
      cents: currencyRows(cents, (currency) => ({ cents: cents.get(currency), display: formatCents(cents.get(currency)) })),
      piecesWithheldN: hiddenPieces,
      piecesOmittedN: Math.max(0, pieces.length - TRANSFER_PRICE_LIMITS.pieces),
      pieces: pieces.slice(0, TRANSFER_PRICE_LIMITS.pieces).map((piece) => {
        const lender = lineName(piece.lenderId, row.borrowerId);
        return {
          fromDay: piece.fromDay,
          toDay: piece.toDay,
          days: piece.days,
          shareH: piece.shareH,
          shareDays: piece.shareDays,
          state: piece.state,
          stateLabel: TRANSFER_PRICE_PIECE_LABELS[piece.state],
          stateTone: TRANSFER_PRICE_PIECE_TONES[piece.state],
          reason: TRANSFER_PRICE_PIECE_REASONS[piece.state],
          lenderId: lender.withheld ? null : piece.lenderId,
          lenderName: lender.name,
          lenderBasis: piece.lenderBasis,
          lenderBasisLabel: piece.lenderBasis ? TRANSFER_PRICE_LENDER_BASIS_LABELS[piece.lenderBasis] : null,
          agreementId: piece.agreementId,
          currency: piece.currency,
          rateCents: piece.rateCents,
          basis: piece.basis,
          retroactive: piece.retroactive,
          cents: piece.cents,
          display: piece.cents === null ? null : formatCents(piece.cents),
          arithmetic: piece.cents === null ? null : `${piece.shareH}% × ${piece.days} day(s) = ${piece.shareDays} share-days × ${piece.rateCents} = ${piece.cents} cents`,
        };
      }),
    });
  }
  rows.sort((a, b) => (ROW_SEVERITY[a.state] - ROW_SEVERITY[b.state])
    || String(a.personName).localeCompare(String(b.personName))
    || String(a.borrowerName).localeCompare(String(b.borrowerName)));

  const pairRows = [];
  const pairCounts = emptyStateCounts(TRANSFER_PRICE_ROW_STATES);
  const proposalsByPair = new Map();
  for (const a of agreements.values()) {
    if (a.state !== 'proposed') continue;
    if (!proposalsByPair.has(a.pairKey)) proposalsByPair.set(a.pairKey, []);
    proposalsByPair.get(a.pairKey).push(a.id);
  }
  const canAgree = !seat.readOnly && canAct(TRANSFER_PRICE_RIGHTS.AGREE, seat).allow === true;
  for (const pair of pairs.values()) {
    if (!readableAccount(pair.borrowerId) && !(pair.lenderId && readableAccount(pair.lenderId))) continue;
    const state = pair.shareDays === 0 && pair.unmeasuredRowsN > 0 ? 'unmeasured'
      : pair.unpricedShareDays === 0 && pair.unmeasuredRowsN === 0 ? 'priced'
        : pair.pricedShareDays === 0 ? 'unpriced' : 'partly-priced';
    pairCounts[state] += 1;
    const lender = lineName(pair.lenderId, pair.borrowerId);
    const borrower = lineName(pair.borrowerId, pair.lenderId);
    const mySide = full ? null : (seat.id === pair.lenderId ? 'lender' : seat.id === pair.borrowerId ? 'borrower' : null);
    pairRows.push({
      pairKey: lender.withheld || borrower.withheld ? null : pair.pairKey,
      lenderId: lender.withheld ? null : pair.lenderId,
      lenderName: lender.name,
      lenderKnown: Boolean(pair.lenderId),
      lenderOnRoster: pair.lenderId ? onRoster(pair.lenderId) : false,
      borrowerId: borrower.withheld ? null : pair.borrowerId,
      borrowerName: borrower.name,
      borrowerOnRoster: onRoster(pair.borrowerId),
      state,
      stateLabel: TRANSFER_PRICE_ROW_LABELS[state],
      stateTone: TRANSFER_PRICE_ROW_TONES[state],
      peopleN: pair.personIds.size,
      linesN: pair.declarationIds.size,
      shareDays: pair.shareDays,
      pricedShareDays: pair.pricedShareDays,
      zeroPricedShareDays: pair.zeroPricedShareDays,
      unpricedShareDays: pair.unpricedShareDays,
      unmeasuredRowsN: pair.unmeasuredRowsN,
      presumedShareDays: pair.presumedShareDays,
      retroactiveShareDays: pair.retroactiveShareDays,
      refused: { ...pair.refused },
      cents: currencyRows(pair.cents, (currency) => ({ cents: pair.cents.get(currency), display: formatCents(pair.cents.get(currency)) })),
      openProposalIds: lender.withheld || borrower.withheld ? [] : (proposalsByPair.get(pair.pairKey) || []),
      mySide,
      canPropose: canAgree && Boolean(pair.lenderId) && (full || Boolean(mySide)),
    });
  }
  pairRows.sort((a, b) => (ROW_SEVERITY[a.state] - ROW_SEVERITY[b.state])
    || String(a.lenderName).localeCompare(String(b.lenderName))
    || String(a.borrowerName).localeCompare(String(b.borrowerName)));

  const accountRows = [];
  let accountsWithheldN = 0;
  let accountsNetWithheldN = 0;
  const seatCharged = new Map();
  const seatCredited = new Map();
  const seatEntries = new Map();
  let everySeatNetPrintable = true;
  for (const a of accounts.values()) {
    if (!readableAccount(a.id)) { accountsWithheldN += 1; continue; }
    const printable = netPrintable(a);
    if (!printable) { accountsNetWithheldN += 1; everySeatNetPrintable = false; }
    const currencies = [...new Set([...a.charged.keys(), ...a.credited.keys()])].sort();
    for (const currency of currencies) {
      bump(seatCharged, currency, a.charged.get(currency) || 0);
      bump(seatCredited, currency, a.credited.get(currency) || 0);
    }
    accountRows.push({
      accountId: a.id,
      name: rawName(a.id),
      isLeader: a.id === LEADER_ID,
      onRoster: onRoster(a.id),
      complete: accountComplete(a),
      netPrinted: printable,
      netWithheldReason: printable ? null : withheldNetReason(a),
      unpricedShareDays: a.unpricedShareDays,
      unmeasuredRowsN: a.unmeasuredRowsN,
      currencies: currencies.map((currency) => {
        const charged = a.charged.get(currency) || 0;
        const credited = a.credited.get(currency) || 0;
        const net = printable ? credited - charged : null;
        return {
          currency,
          entriesN: a.entries.get(currency) || 0,
          chargedCents: charged,
          creditedCents: credited,
          netCents: net,
          charged: formatCents(charged),
          credited: formatCents(credited),
          net: net === null ? null : formatCents(net),
        };
      }),
    });
  }
  accountRows.sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.accountId).localeCompare(String(b.accountId)));

  // Entries per currency as THIS seat reads them: one per visible priced piece.
  for (const row of allRows) {
    if (!row.measured || !rowVisible(row)) continue;
    for (const piece of row.pieces) {
      if (piece.state === 'priced' && pieceVisible(row, piece)) bump(seatEntries, piece.currency, 1);
    }
  }

  /* 4. Spans: consolidation along the home-line tree, with eliminations. */
  const spanRows = [];
  if (accounts.size) {
    const pricedPieces = [];
    for (const row of allRows) {
      if (!row.measured) continue;
      for (const piece of row.pieces) if (piece.state === 'priced') pricedPieces.push({ borrowerId: row.borrowerId, lenderId: piece.lenderId, currency: piece.currency, cents: piece.cents });
    }
    for (const node of matrix.chain.nodes.values()) {
      const isRoot = node.id === LEADER_ID;
      if (!(full || (!seat.readOnly && (node.id === seat.id || Boolean(seat.scope?.has?.(node.id)))))) continue;
      const inSpan = new Set(node.subtreeIds || [node.id]);
      const inside = (id) => isRoot || inSpan.has(id);
      const members = [...accounts.values()].filter((a) => inside(a.id));
      // A span whose only active account is its own holder IS that account.
      if (!members.length || (!isRoot && !members.some((a) => a.id !== node.id))) continue;
      const eliminated = new Map();
      const inflow = new Map();
      const outflow = new Map();
      for (const piece of pricedPieces) {
        const b = inside(piece.borrowerId);
        const l = inside(piece.lenderId);
        if (b && l) bump(eliminated, piece.currency, piece.cents);
        else if (b) bump(outflow, piece.currency, piece.cents);
        else if (l) bump(inflow, piece.currency, piece.cents);
      }
      const complete = arithmeticSafe && !lenderUnknownAnywhere && members.every(accountComplete);
      // A manager inside this span who also answers to a manager OUTSIDE it on a
      // declared line: the tree consolidates their account here by convention.
      const matrixSharedAccountsN = isRoot ? 0 : members.filter((a) => (matrix.linesByPerson.get(a.id) || [])
        .some((line) => line.role !== 'primary' && line.active !== false && !inSpan.has(line.managerId))).length;
      const currencies = [...new Set([...eliminated.keys(), ...inflow.keys(), ...outflow.keys()])].sort();
      spanRows.push({
        nodeId: node.id,
        name: isRoot ? `${rawName(LEADER_ID)} — the whole workspace` : rawName(node.id),
        isRoot,
        depth: node.depth || 0,
        accountsN: members.length,
        matrixSharedAccountsN,
        complete,
        netWithheldReason: complete ? null : 'At least one line in this span carries an unpriced or unmeasured share-day, or a share-day in the period has no recorded lender; a consolidated net over the priced part is withheld.',
        currencies: currencies.map((currency) => {
          const elim = eliminated.get(currency) || 0;
          const inn = inflow.get(currency) || 0;
          const out = outflow.get(currency) || 0;
          const net = complete ? inn - out : null;
          return {
            currency,
            eliminatedCents: elim,
            inflowCents: inn,
            outflowCents: out,
            netCents: net,
            eliminated: formatCents(elim),
            inflow: formatCents(inn),
            outflow: formatCents(out),
            net: net === null ? null : formatCents(net),
          };
        }),
      });
    }
    spanRows.sort((a, b) => (a.depth - b.depth) || String(a.name).localeCompare(String(b.name)));
  }

  /* 5. Agreements, as this seat may read them. */
  const agreementRows = [];
  const agreementCounts = emptyStateCounts(TRANSFER_PRICE_AGREEMENT_STATES);
  let agreementsWithheldN = 0;
  let bothKeysScribedN = 0;
  for (const a of agreements.values()) {
    if (!readableAccount(a.lenderId) && !readableAccount(a.borrowerId)) { agreementsWithheldN += 1; continue; }
    agreementCounts[a.state] += 1;
    if (a.bothKeysScribed) bothKeysScribedN += 1;
    const lender = lineName(a.lenderId, a.borrowerId);
    const borrower = lineName(a.borrowerId, a.lenderId);
    const missingSide = a.state === 'proposed' ? (a.proposedBySide === 'lender' ? 'borrower' : 'lender') : null;
    const missingHolder = missingSide === 'lender' ? a.lenderId : missingSide === 'borrower' ? a.borrowerId : null;
    const isParty = !full && (seat.id === a.lenderId || seat.id === a.borrowerId);
    const live = a.state === 'proposed' || a.state === 'agreed';
    const phase = !a.coverFrom ? null : a.coverFrom > today ? 'upcoming' : a.coverTo < today ? 'ended' : 'in-force';
    const basis = transferPriceBasis(a.basis);
    agreementRows.push({
      id: a.id,
      lenderId: lender.withheld ? null : a.lenderId,
      lenderName: lender.name,
      borrowerId: borrower.withheld ? null : a.borrowerId,
      borrowerName: borrower.name,
      currency: a.currency,
      rateCents: a.rateCents,
      rateDisplay: `${a.rateCents} ${a.currency} per person-day`,
      basis: a.basis,
      basisLabel: basis ? basis.label : a.basis,
      effectiveFrom: a.effectiveFrom,
      effectiveTo: a.effectiveTo,
      termDays: a.termDays,
      note: a.note,
      state: a.state,
      stateLabel: TRANSFER_PRICE_AGREEMENT_LABELS[a.state],
      stateTone: TRANSFER_PRICE_AGREEMENT_TONES[a.state],
      phase,
      coverFrom: a.coverFrom,
      coverTo: a.coverTo,
      touchesWindow: Boolean(window.valid && (a.coverFrom || a.state === 'proposed')
        && (a.coverFrom || a.effectiveFrom) <= window.to && (a.coverTo || a.effectiveTo) >= window.from),
      proposedBySide: a.proposedBySide,
      proposedOn: a.proposedOn,
      proposedVia: a.proposedVia,
      confirmedOn: a.confirmedOn,
      confirmedVia: a.confirmedVia,
      agreedOn: a.agreedOn,
      bothKeysScribed: a.bothKeysScribed,
      retiredOn: a.retiredOn,
      retiredBySide: a.retiredBySide,
      retireReason: a.retireReason,
      voidFrom: a.voidFrom,
      missingSide,
      missingKeyName: missingHolder ? lineName(missingHolder, missingSide === 'lender' ? a.borrowerId : a.lenderId).name : null,
      canConfirm: canAgree && a.state === 'proposed' && (full || seat.id === missingHolder),
      canRetire: canAgree && live && (full || isParty),
    });
  }
  agreementRows.sort((a, b) => String(b.proposedOn).localeCompare(String(a.proposedOn)) || String(a.id).localeCompare(String(b.id)));

  /* 6. Open asks RULE-TPL-01 issued to lines this seat reads. */
  const delegations = Array.isArray(state.delegations) ? state.delegations : [];
  const activeTasks = new Map(delegations.filter((d) => d && d.status === 'active').map((d) => [d.id, d]));
  let openAsksN = 0;
  for (const marker of Array.isArray(state.transferPriceMarkers) ? state.transferPriceMarkers : []) {
    if (!marker || marker.kind !== 'ask' || !marker.taskId) continue;
    const task = activeTasks.get(marker.taskId);
    if (task && readableAccount(task.personId)) openAsksN += 1;
  }

  /* 7. The board. */
  const unmeasuredRowsN = rowCounts.unmeasured;
  const chargeable = share.priced + share.unpriced;
  const verdictKey = !window.valid ? 'window-refused'
    : rows.length === 0 || (chargeable === 0 && unmeasuredRowsN === 0) ? 'inert'
      : chargeable === 0 ? 'unmeasured'
        : share.priced === 0 ? 'unpriced'
          : share.unpriced > 0 || unmeasuredRowsN > 0 ? 'partly-priced' : 'priced';
  const verdict = transferPriceVerdict(verdictKey);
  const statementComplete = verdictKey === 'priced' && !lenderUnknownAnywhere && arithmeticSafe;
  const incompleteReason = statementComplete ? null
    : !window.valid ? window.refuseReason
      : !arithmeticSafe ? 'A sum left the exact-integer range; no total is claimed.'
        : verdictKey === 'inert' ? 'No chargeable share-day is in scope for this period.'
          : [
            share.unpriced ? `${share.unpriced} consumed share-day(s) carry no two-key price` : '',
            unmeasuredRowsN ? `${unmeasuredRowsN} line row(s) were refused by the period ledger` : '',
            lenderUnknownAnywhere && !share.refused['lender-unrecorded'] && !share.refused['lender-conflict'] ? 'a share-day outside this seat has no recorded lender' : '',
          ].filter(Boolean).join('; ').concat('. Every figure below is what the agreed prices state for the priced part, and no more.');

  const seatCurrencies = [...new Set([...seatCharged.keys(), ...seatCredited.keys()])].sort();
  const currencies = seatCurrencies.map((currency) => {
    const charged = seatCharged.get(currency) || 0;
    const credited = seatCredited.get(currency) || 0;
    // The operator reads the workspace, where the net is zero BY IDENTITY and is
    // printed as the check it is. A scoped seat reads one side of two-sided
    // entries; its net is a position, and is withheld while any line it reads
    // has a withheld net.
    const net = full ? credited - charged : (everySeatNetPrintable ? credited - charged : null);
    return {
      currency,
      entriesN: seatEntries.get(currency) || 0,
      chargedCents: charged,
      creditedCents: credited,
      netCents: net,
      charged: formatCents(charged),
      credited: formatCents(credited),
      net: net === null ? null : formatCents(net),
      zeroSum: full ? charged === credited : null,
    };
  });

  const board = {
    personsN: visiblePersonIds.size,
    pairsN: pairRows.length,
    pairs: pairCounts,
    pairsReconcile: TRANSFER_PRICE_ROW_STATES.reduce((acc, key) => acc + pairCounts[key], 0) === pairRows.length,
    rowsN: rows.length,
    rows: rowCounts,
    rowsReconcile: TRANSFER_PRICE_ROW_STATES.reduce((acc, key) => acc + rowCounts[key], 0) === rows.length,
    rowsWithheldN,
    consumedShareDays: share.consumed,
    pricedShareDays: share.priced,
    zeroPricedShareDays: share.zeroPriced,
    unpricedShareDays: share.unpriced,
    sameLineShareDays: share.sameLine,
    refused: share.refused,
    // Printed as a claim and checked as integer equality: priced + every
    // refusal reason + not-chargeable must be the consumed total, and the
    // refusal reasons must add to the unpriced figure.
    shareDaysReconcile: share.priced + share.unpriced + share.sameLine === share.consumed
      && TRANSFER_PRICE_REFUSAL_STATES.reduce((acc, key) => acc + share.refused[key], 0) === share.unpriced,
    periodLedgerIdentity: allRows.some((row) => row.measured || row.identityBroken) ? periodIdentityFailures === 0 : null,
    presumedLenderShareDays: share.presumed,
    retroactiveShareDays: share.retroactive,
    unmeasuredRowsN,
    engineRefusalsN: allocation ? allocation.board.engineRefusalsN : 0,
    lenderUnknownAnywhere,
    currencies,
    zeroSum: {
      holds: zeroSumHolds,
      currenciesN: zeroSumCurrencies.length,
      scope: 'workspace',
      detail: zeroSumCurrencies.length === 0
        ? 'No charge is posted, so there is nothing to net.'
        : zeroSumHolds
          ? `Checked as integer equality over the whole workspace in ${zeroSumCurrencies.length} currency(ies): total charged equals total credited and the line nets sum to zero.`
          : 'THE WORKSPACE DOES NOT NET TO ZERO. Treat every money figure here as unverified and report it.',
    },
    arithmeticSafe,
    statementComplete,
    incompleteReason,
    accountsN: accountRows.length,
    accountsNetWithheldN,
    accountsWithheldN,
    agreementsN: agreementRows.length,
    agreements: agreementCounts,
    agreementsReconcile: TRANSFER_PRICE_AGREEMENT_STATES.reduce((acc, key) => acc + agreementCounts[key], 0) === agreementRows.length,
    agreementsWithheldN,
    bothKeysScribedN,
    openAsksN,
  };

  const govern = canAct(TRANSFER_PRICE_RIGHTS.GOVERN, seat);
  return {
    engineVersion: TRANSFER_PRICE_ENGINE_VERSION,
    generatedOn: today,
    window,
    isMatrix: allRows.length > 0,
    seat: { id: seat.id, label: seat.label || seat.id, rank: seat.rank ?? null, fullAccess: full, readOnly: Boolean(seat.readOnly) },
    scopeLabel: full ? 'the whole workspace' : `${seat.label || seat.id}’s lines and span`,
    actor: {
      seatId: full ? null : seat.id,
      fullAccess: full,
      canAgree,
      canScan: !seat.readOnly && (full || govern.allow === true),
      canGovern: !seat.readOnly && (full || govern.allow === true),
    },
    conventions: {
      askDueDays: conv.transferPriceAskDueDays,
      autoPropagate: conv.transferPriceAutoPropagate,
      rateUnit: 'whole currency units per full person-day (cents per share-day)',
      maxRate: TRANSFER_PRICE_LIMITS.maxRateCents,
    },
    verdict: verdict.key,
    verdictLabel: verdict.label,
    verdictTone: verdict.tone,
    verdictDetail: verdict.detail,
    board,
    pairs: pairRows,
    accounts: accountRows,
    spans: spanRows,
    agreements: agreementRows,
    rows: rows.slice(0, TRANSFER_PRICE_LIMITS.rows),
    rowsOmittedN: Math.max(0, rows.length - TRANSFER_PRICE_LIMITS.rows),
    method: TRANSFER_PRICE_METHOD,
    limits: TRANSFER_PRICE_LIMITS_TEXT,
    inertNote: verdictKey === 'inert'
      ? (rawLines.length === 0
        ? 'This workspace declares no additional reporting line, so nobody is borrowed and there is nothing to charge. A single-chain workspace gains no row, no figure and no refusal.'
        : 'No declared additional line this seat reads consumed a chargeable share-day in the period, so there is nothing to charge.')
      : null,
  };
}

/* ---------------------------------------------------------------- the brief */

/** The identity-free brief. Counts and currency totals only: no person, manager, pair or rate. */
export function transferPriceBriefText(report) {
  const w = report.window;
  const b = report.board;
  const lines = [];
  lines.push(`Cross-line chargeback — read from ${report.scopeLabel} on ${report.generatedOn} for the period ${w.from || '?'} to ${w.to || '?'}.`);
  if (!w.valid) {
    lines.push(`The period is REFUSED: ${w.refuseReason}`);
    return lines.join('\n');
  }
  lines.push(`Verdict: ${report.verdictLabel}. ${report.verdictDetail}`);
  if (report.verdict === 'inert') {
    if (report.inertNote) lines.push(report.inertNote);
    return lines.join('\n');
  }
  lines.push(`Consumed share-days in scope: ${b.consumedShareDays} = ${b.pricedShareDays} priced + ${b.unpricedShareDays} refused + ${b.sameLineShareDays} not chargeable (reconciles: ${b.shareDaysReconcile ? 'yes' : 'NO'}).`);
  if (b.unpricedShareDays) {
    lines.push(`Refused: ${TRANSFER_PRICE_REFUSAL_STATES.filter((key) => b.refused[key]).map((key) => `${b.refused[key]} ${TRANSFER_PRICE_PIECE_LABELS[key].toLowerCase()}`).join(', ')}. None of these is charged at zero or at an average.`);
  }
  if (b.unmeasuredRowsN) lines.push(`${b.unmeasuredRowsN} line row(s) were refused by the period ledger and carry no share-days here.`);
  lines.push(`Pairs of lines: ${b.pairsN} (${b.pairs.priced} priced in full, ${b.pairs['partly-priced']} partly, ${b.pairs.unpriced} unpriced, ${b.pairs.unmeasured} unmeasured).`);
  for (const c of b.currencies) {
    lines.push(report.seat.fullAccess
      ? `${c.currency}: charged ${c.charged}, credited ${c.credited} across ${c.entriesN} entr${c.entriesN === 1 ? 'y' : 'ies'} — nets to zero: ${c.zeroSum ? 'yes' : 'NO'}.`
      : `${c.currency}: charged to this seat’s lines ${c.charged}, credited to them ${c.credited} — net ${c.net === null ? 'withheld' : c.net}.`);
  }
  lines.push(`Workspace zero-sum identity: ${b.zeroSum.holds ? 'holds' : 'DOES NOT HOLD'}. Period-ledger identity: ${b.periodLedgerIdentity === null ? 'nothing measured' : b.periodLedgerIdentity ? 'holds' : 'DOES NOT HOLD'}.`);
  lines.push(b.statementComplete
    ? 'The statement is complete: every chargeable share-day in scope carries one two-key price.'
    : `The statement is NOT complete: ${b.incompleteReason}`);
  if (b.presumedLenderShareDays) lines.push(`${b.presumedLenderShareDays} priced share-day(s) rest on a PRESUMED lender (no home-line history is recorded for the person).`);
  if (b.retroactiveShareDays) lines.push(`${b.retroactiveShareDays} priced share-day(s) were priced after they were consumed; a price set afterwards allocates cost and steers nothing.`);
  if (b.zeroPricedShareDays) lines.push(`${b.zeroPricedShareDays} share-day(s) are priced at an explicitly agreed zero.`);
  lines.push(`Agreements read: ${b.agreementsN} (${b.agreements.agreed} agreed, ${b.agreements.proposed} awaiting a second key, ${b.agreements.voided} voided, ${b.agreements.declined} declined, ${b.agreements.withdrawn} withdrawn)${b.bothKeysScribedN ? `; ${b.bothKeysScribedN} carry two keys both scribed in the operator view` : ''}.`);
  if (b.accountsNetWithheldN) lines.push(`${b.accountsNetWithheldN} of ${b.accountsN} line account(s) have their net WITHHELD.`);
  const withheld = [
    b.rowsWithheldN ? `${b.rowsWithheldN} line row(s)` : '',
    b.accountsWithheldN ? `${b.accountsWithheldN} line account(s)` : '',
    b.agreementsWithheldN ? `${b.agreementsWithheldN} agreement(s)` : '',
  ].filter(Boolean);
  if (withheld.length) lines.push(`Outside this seat and counted, not shown: ${withheld.join(', ')}.`);
  if (b.engineRefusalsN) lines.push(`${b.engineRefusalsN} declared row(s) name nobody on the active roster and are outside this statement.`);
  lines.push(`Open ${TRANSFER_PRICE_RULE_ID} asks: ${b.openAsksN}.`);
  return lines.join('\n');
}

/* ------------------------------------------------------------------ the CSV */

const flag = (value) => (value === null || value === undefined ? '' : value ? 'yes' : 'no');
const cell = (value) => (value === null || value === undefined ? '' : value);

/**
 * Aggregate, identity-free rows: one `summary` row and one row per currency.
 * A withheld figure is a BLANK cell, never a zero.
 */
export function transferPriceCsvRows(report) {
  const w = report.window;
  const b = report.board;
  const blank = Object.fromEntries(TRANSFER_PRICE_CSV_COLUMNS.map((key) => [key, '']));
  const common = {
    generated_on: report.generatedOn,
    scope: report.seat.fullAccess ? 'workspace' : 'seat',
    period_from: cell(w.from),
    period_to: cell(w.to),
    period_days: w.valid ? cell(w.days) : '',
    verdict: report.verdict,
    engine_version: report.engineVersion,
  };
  const summary = {
    ...blank,
    ...common,
    row_type: 'summary',
    pairs: b.pairsN,
    pairs_priced: b.pairs.priced,
    pairs_partly_priced: b.pairs['partly-priced'],
    pairs_unpriced: b.pairs.unpriced,
    pairs_unmeasured: b.pairs.unmeasured,
    rows: b.rowsN,
    rows_priced: b.rows.priced,
    rows_partly_priced: b.rows['partly-priced'],
    rows_unpriced: b.rows.unpriced,
    rows_unmeasured: b.rows.unmeasured,
    rows_withheld: b.rowsWithheldN,
    rows_reconcile: flag(b.rowsReconcile),
    consumed_share_days: w.valid ? b.consumedShareDays : '',
    priced_share_days: w.valid ? b.pricedShareDays : '',
    zero_priced_share_days: w.valid ? b.zeroPricedShareDays : '',
    unpriced_share_days: w.valid ? b.unpricedShareDays : '',
    refused_no_agreed_price: w.valid ? b.refused['no-agreed-price'] : '',
    refused_awaiting_second_key: w.valid ? b.refused['awaiting-second-key'] : '',
    refused_price_conflict: w.valid ? b.refused['price-conflict'] : '',
    refused_lender_unrecorded: w.valid ? b.refused['lender-unrecorded'] : '',
    refused_lender_conflict: w.valid ? b.refused['lender-conflict'] : '',
    same_line_share_days: w.valid ? b.sameLineShareDays : '',
    share_days_reconcile: w.valid ? flag(b.shareDaysReconcile) : '',
    period_ledger_identity: flag(b.periodLedgerIdentity),
    presumed_lender_share_days: w.valid ? b.presumedLenderShareDays : '',
    retroactive_share_days: w.valid ? b.retroactiveShareDays : '',
    engine_refusals: b.engineRefusalsN,
    agreements: b.agreementsN,
    agreements_proposed: b.agreements.proposed,
    agreements_agreed: b.agreements.agreed,
    agreements_declined: b.agreements.declined,
    agreements_withdrawn: b.agreements.withdrawn,
    agreements_voided: b.agreements.voided,
    agreements_both_keys_scribed: b.bothKeysScribedN,
    agreements_reconcile: flag(b.agreementsReconcile),
    zero_sum: flag(b.zeroSum.holds),
    statement_complete: flag(b.statementComplete),
    accounts: b.accountsN,
    accounts_net_withheld: b.accountsNetWithheldN,
    accounts_withheld: b.accountsWithheldN,
    open_asks: b.openAsksN,
  };
  const perCurrency = b.currencies.map((c) => ({
    ...blank,
    ...common,
    row_type: 'currency',
    currency: c.currency,
    entries: c.entriesN,
    charged_cents: c.chargedCents,
    credited_cents: c.creditedCents,
    net_cents: cell(c.netCents),
    charged: c.charged,
    credited: c.credited,
    net: cell(c.net),
    zero_sum: flag(c.zeroSum),
    statement_complete: flag(b.statementComplete),
  }));
  return [summary, ...perCurrency];
}
