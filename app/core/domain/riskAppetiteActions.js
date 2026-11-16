/**
 * app/core/domain/riskAppetiteActions.js — the seat-checked commands of the
 * Enterprise Risk Appetite & Tolerance Breach Register (ADR-0219).
 *
 * FOUR human acts and a scan, and nothing else: DECLARE an appetite statement,
 * RETIRE it, DECLARE the exposure of one live risk, and WITHDRAW that
 * declaration. Every figure, verdict and count is re-derived on read by
 * `riskAppetite.js`; nothing derived is stored.
 *
 * THE DOOR IS THE PRODUCT, AND EVERY REFUSAL IS A CONTROL.
 *  - A tolerance is stored as an exact integer in the field its measure owns.
 *    A count is never parsed as money and money is never parsed as a count.
 *  - Money input is converted from major units exactly once, in integer
 *    arithmetic. A third decimal place is a different amount, so it is refused
 *    rather than rounded; no comma, sign or exponent is accepted.
 *  - A review date must be after the declaration and inside the declared
 *    horizon. A tolerance with no review date is a number nobody agreed to look
 *    at again.
 *  - A risk declaration names a LIVE, OPEN operational risk or incident. A
 *    resolved case is not a risk being carried; declaring one would put a
 *    settled loss on the board's ceiling as if it were still open.
 *  - OWNERSHIP is proved against the record: the seat must hold the case owner
 *    through the span or a declared line, and the owner may NOT declare the
 *    retention of their own risk — the line above them does. The register never
 *    accepts a figure from the hand that carries the consequence.
 *  - A withdrawal is final and never resurrects an older declaration; a
 *    superseded row is history and cannot be withdrawn after the fact. A
 *    retired statement leaves its key with no appetite, it does not revive an
 *    earlier tolerance.
 *  - Every write is run through the loader and the stored row is the row the
 *    loader returns. A write the loader would refuse on reload is refused now.
 */

import { dayKey } from '../time.js';
import { buildSeats, activeSeat, canAct, canSee } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import { buildRiskConcentration } from './riskConcentration.js';
import {
  buildRiskAppetite,
  liveDeclarations,
  liveStatements,
  riskAppetiteAttentionCount,
  riskAppetiteCandidates,
  riskAppetiteMatrix,
} from './riskAppetite.js';
import {
  normalizeRiskAppetiteStatements,
  normalizeRiskDeclarations,
  parseMoneyInputToCents,
  raCurrency,
  raDay,
  raText,
} from './riskAppetiteSchema.js';
import {
  RA_APPETITE_KEYS,
  RA_DOMAIN_KEYS,
  RA_EVENTS,
  RA_LIMITS as L,
  RA_MEASURE_KEYS,
  RA_OPEN_CASE_STATUSES,
  RA_REFUSALS,
  RA_RIGHTS,
  RA_RISK_CASE_KINDS,
  RA_ROUTE,
  RA_RULE_ID,
  raStatementKey,
} from './riskAppetiteRegistry.js';

const REFUSAL = (key) => `riskAppetite:${key}`;

/** A whole count from a form: digits only, never a decimal and never a sign. */
function parseCountInput(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 && value <= L.countMax ? value : null;
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!/^\d{1,6}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 && n <= L.countMax ? n : null;
}

export function createRiskAppetiteActions(store, { now, idFactory }) {
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
    if (seat.readOnly) return fail(RA_REFUSALS.notSeated);
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
   * check — so the right is re-proved HERE. Without this, a manager could read
   * an enterprise ceiling the record class denies them: the module would vanish
   * from the gate exactly where the gate matters most.
   */
  function readCheck() {
    const resolved = readSeat();
    if (resolved.seat.readOnly) return fail(RA_REFUSALS.notSeated);
    const verdict = canAct(RA_RIGHTS.READ, resolved.seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, ...resolved };
  }

  function graph(check) {
    try {
      return { ok: true, matrix: riskAppetiteMatrix(store.state, check.at, check.cfg) };
    } catch (error) {
      return fail(`The reporting graph could not be read, so ownership cannot be proved. Nothing was saved. (${error?.message || 'unknown error'})`, null, REFUSAL('graph-unreadable'));
    }
  }

  /** The operational case a declaration may name, proved against the record. */
  function caseContext(check, caseId) {
    const id = raText(caseId, L.idMax);
    if (!id) return fail('Name the operational risk this exposure belongs to.', 'caseId');
    const operationalCase = rows('cases').find((row) => row && row.id === id) || null;
    if (!operationalCase) return fail('That case is not on this record. Nothing was saved.', 'caseId', REFUSAL('case-not-found'));
    if (!RA_RISK_CASE_KINDS.includes(operationalCase.kind)) {
      return fail('Only an operational risk or an incident carries declared exposure. An initiative or an escalation is not a risk.', 'caseId', REFUSAL('not-a-risk'));
    }
    if (!RA_OPEN_CASE_STATUSES.includes(operationalCase.status)) {
      return fail('That case is resolved or closed. A settled loss is not a risk the enterprise is still carrying — its outcome is history, and this register does not re-open it as a ceiling.', 'caseId', REFUSAL('case-settled'));
    }
    const g = graph(check);
    if (!g.ok) return g;
    const ownerId = operationalCase.ownerId || null;
    if (!ownerId) return fail('The case names no owner, so no line can be proved to declare its exposure.', 'caseId', REFUSAL('case-unowned'));
    if (!check.seat.fullAccess) {
      if (ownerId === check.actorId) {
        return fail('The retention of your own risk is declared by the line above you, not by you. Ask your manager to record it.', 'caseId', REFUSAL('self-declaration'));
      }
      const grant = canSee({ id: operationalCase.id, personId: ownerId }, 'cases', check.seat, null);
      if (grant.allow !== 'full') {
        return fail('This seat holds neither the case owner nor a declared line over them. One line does not declare another line’s exposure.', 'caseId', REFUSAL('not-your-line'));
      }
    }
    return { ok: true, operationalCase, ownerId, matrix: g.matrix };
  }

  /** A declaration row that this seat may withdraw, and that is still the live one. */
  function declarationContext(check, declarationId) {
    const id = raText(declarationId, L.idMax);
    if (!id) return fail('Name the declaration being withdrawn.', 'declarationId');
    const loaded = normalizeRiskDeclarations(rows('riskDeclarations'), []);
    const declaration = loaded.find((row) => row.id === id) || null;
    if (!declaration) return fail(RA_REFUSALS.notFound, 'declarationId', REFUSAL('declaration-not-found'));
    if (declaration.withdrawnOn) return fail(RA_REFUSALS.withdrawn, 'declarationId', REFUSAL('already-withdrawn'));
    const live = liveDeclarations(loaded, check.today);
    const current = live.live.get(declaration.caseId) || null;
    if (!current || current.id !== declaration.id) {
      return fail('That declaration has already been superseded by a later one. History is not withdrawn after the fact; withdraw the current declaration instead.', 'declarationId', REFUSAL('superseded'));
    }
    return { ok: true, declaration, current };
  }

  function dayNotFuture(check, value, field, fallback) {
    const day = value === undefined || value === null || value === '' ? fallback : raDay(value);
    if (!day) return { error: fail('Give a real calendar day.', field, REFUSAL('day-invalid')) };
    if (day > check.today) return { error: fail('That day is in the future. The register records what has been declared, not what will be.', field, REFUSAL('day-future')) };
    return { day };
  }

  return {
    /* ------------------------------------------------------------ statements */

    /**
     * Declare the enterprise's appetite for one (domain, measure, currency).
     * The stance is qualitative and printed; the tolerance is exact.
     */
    riskAppetiteDeclareStatement(input = {}) {
      const check = seatFor(RA_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const domain = RA_DOMAIN_KEYS.includes(input.domain) ? input.domain : null;
      if (!domain) return fail('Choose one of the seven declared risk domains.', 'domain', REFUSAL('domain-invalid'));
      const measure = RA_MEASURE_KEYS.includes(input.measure) ? input.measure : null;
      if (!measure) return fail('Choose what the tolerance counts: declared risks, or retained exposure.', 'measure', REFUSAL('measure-invalid'));
      const money = measure === 'retained-exposure';
      let currency = '';
      let toleranceCents = null;
      let toleranceCount = null;
      if (money) {
        currency = raCurrency(input.currency);
        if (!currency) return fail('Name the currency this ceiling is declared in, as a three-letter code. The register never assumes one and never converts.', 'currency', REFUSAL('currency-invalid'));
        toleranceCents = parseMoneyInputToCents(input.tolerance);
        if (toleranceCents === null) {
          return fail('Give the ceiling in major units with at most two decimal places (for example 2500000.00). No sign, comma or exponent is accepted, and a third decimal place is not rounded.', 'tolerance', REFUSAL('tolerance-invalid'));
        }
      } else {
        if (input.currency !== undefined && input.currency !== null && input.currency !== '') {
          return fail('A count of risks is not denominated in a currency. Remove the currency from a count statement.', 'currency', REFUSAL('currency-on-count'));
        }
        toleranceCount = parseCountInput(input.tolerance);
        if (toleranceCount === null) return fail('Give the ceiling as a whole number of risks.', 'tolerance', REFUSAL('tolerance-invalid'));
      }
      const appetite = RA_APPETITE_KEYS.includes(input.appetite) ? input.appetite : null;
      if (!appetite) return fail('State the appetite: averse, minimal, cautious, open or seeking.', 'appetite', REFUSAL('appetite-invalid'));
      const basis = raText(input.basis, L.textMax);
      if (basis.length < L.textMin) return fail('Write the basis for this ceiling in at least a sentence. A tolerance with no reasoning is a number someone will later dispute.', 'basis', REFUSAL('basis-missing'));
      const declared = dayNotFuture(check, input.declaredOn, 'declaredOn', check.today);
      if (declared.error) return declared.error;
      const reviewOn = raDay(input.reviewOn);
      if (!reviewOn) return fail('Give the day this appetite will be reviewed.', 'reviewOn', REFUSAL('review-day-invalid'));
      if (reviewOn <= declared.day) return fail('The review date must be after the day the appetite is declared.', 'reviewOn', REFUSAL('review-before-declaration'));
      const reviewDays = Math.round((Date.parse(`${reviewOn}T00:00:00.000Z`) - Date.parse(`${declared.day}T00:00:00.000Z`)) / 86_400_000);
      if (!Number.isFinite(reviewDays) || reviewDays > L.reviewMaxDays) {
        return fail(`The review date must fall within ${L.reviewMaxDays} days of the declaration. A ceiling nobody revisits for years is not an appetite, it is a memory.`, 'reviewOn', REFUSAL('review-too-far'));
      }

      const existing = normalizeRiskAppetiteStatements(rows('riskAppetiteStatements'), []);
      if (existing.length >= L.statements) return fail('The statement ledger is full. Nothing was saved.', null, REFUSAL('ledger-full'));
      const key = raStatementKey({ domain, measure, currency });
      if (existing.some((row) => raStatementKey(row) === key && row.declaredOn === declared.day)) {
        return fail('A statement for this domain, measure and currency was already declared today. Amend the record with a later dated declaration rather than two ceilings for one day.', 'declaredOn', REFUSAL('same-day-statement'));
      }
      const id = idFactory('ras');
      const row = {
        id, domain, measure, currency,
        toleranceCount, toleranceCents,
        appetite, declaredOn: declared.day, reviewOn,
        declaredById: check.actorId, basis,
        retiredOn: null, retiredById: '', retirementReason: '',
      };
      const loaded = normalizeRiskAppetiteStatements([...rows('riskAppetiteStatements'), row], []);
      const stored = loaded.find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The statement could not be stored as a row this register can read back. Nothing was saved.', 'tolerance', REFUSAL('unreadable'));
      store.update((draft) => {
        draft.riskAppetiteStatements = Array.isArray(draft.riskAppetiteStatements) ? draft.riskAppetiteStatements : [];
        draft.riskAppetiteStatements.push(stored);
      }, {
        type: RA_EVENTS.STATEMENT_DECLARED,
        entity: 'riskAppetiteStatement',
        entityId: id,
        summary: `Risk appetite declared for ${domain} by ${measure}${money ? ` in ${currency}` : ''}, effective ${declared.day}, review ${reviewOn}.`.slice(0, 300),
      });
      return saved({ statementId: id, key });
    },

    /** Retire a statement. The key is left with NO appetite; no older row is revived. */
    riskAppetiteRetireStatement(input = {}) {
      const check = seatFor(RA_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const id = raText(input.statementId, 80);
      const loaded = normalizeRiskAppetiteStatements(rows('riskAppetiteStatements'), []);
      const target = loaded.find((row) => row.id === id) || null;
      if (!target) return fail(RA_REFUSALS.notFound, 'statementId', REFUSAL('statement-not-found'));
      if (target.retiredOn) return fail(RA_REFUSALS.retired, 'statementId', REFUSAL('already-retired'));
      const live = liveStatements(loaded, check.today);
      if (live.live.get(raStatementKey(target))?.id !== target.id) {
        return fail('That statement is already history: a later declaration governs its key. Retire the current one instead.', 'statementId', REFUSAL('superseded-statement'));
      }
      const reason = raText(input.reason, L.textMax);
      if (reason.length < L.textMin) return fail('Say why the ceiling is being retired, in at least a sentence. A withdrawn tolerance with no reason is one nobody can audit.', 'reason', REFUSAL('reason-missing'));
      const day = dayNotFuture(check, input.on, 'on', check.today);
      if (day.error) return day.error;
      if (day.day < target.declaredOn) return fail('A statement cannot be retired before it was declared.', 'on', REFUSAL('retire-before-declare'));
      const statementId = target.id;
      store.update((draft) => {
        const list = Array.isArray(draft.riskAppetiteStatements) ? draft.riskAppetiteStatements : [];
        const row = list.find((candidate) => candidate && candidate.id === statementId);
        if (row) {
          row.retiredOn = day.day;
          row.retiredById = check.actorId;
          row.retirementReason = reason;
        }
      }, {
        type: RA_EVENTS.STATEMENT_RETIRED,
        entity: 'riskAppetiteStatement',
        entityId: statementId,
        summary: `Risk appetite statement retired on ${day.day}. Its key now carries no ceiling until a new statement is declared.`.slice(0, 300),
      });
      return saved({ statementId, retiredOn: day.day });
    },

    /* ----------------------------------------------------------------- risks */

    /** Declare what the enterprise deliberately retains for one live risk. */
    riskAppetiteDeclareRisk(input = {}) {
      const check = seatFor(RA_RIGHTS.CARRY);
      if (!check.ok) return check;
      const ctx = caseContext(check, input.caseId);
      if (!ctx.ok) return ctx;
      const domain = RA_DOMAIN_KEYS.includes(input.domain) ? input.domain : null;
      if (!domain) return fail('Choose the risk domain this risk is carried in.', 'domain', REFUSAL('domain-invalid'));
      const currency = raCurrency(input.currency);
      if (!currency) return fail('Name the currency the retained amount is in, as a three-letter code. Nothing is converted.', 'currency', REFUSAL('currency-invalid'));
      const retainedCents = parseMoneyInputToCents(input.retained);
      if (retainedCents === null) {
        return fail('Give the retained amount in major units with at most two decimal places. Zero is a valid answer — “fully avoided, transferred or mitigated” — and a third decimal place is not rounded.', 'retained', REFUSAL('retention-invalid'));
      }
      const basis = raText(input.basis, L.textMax);
      if (basis.length < L.textMin) return fail('Write the basis for retaining this amount, in at least a sentence: why this much, and not less.', 'basis', REFUSAL('basis-missing'));
      const declared = dayNotFuture(check, input.declaredOn, 'declaredOn', check.today);
      if (declared.error) return declared.error;

      const existing = normalizeRiskDeclarations(rows('riskDeclarations'), []);
      if (existing.length >= L.declarations) return fail('The declaration ledger is full. Nothing was saved.', null, REFUSAL('ledger-full'));
      if (existing.some((row) => row.caseId === ctx.operationalCase.id && row.declaredOn === declared.day && !row.withdrawnOn)) {
        return fail('This risk already carries a declaration for today. A later dated declaration supersedes it; two on one day is an ambiguity the register refuses to resolve.', 'declaredOn', REFUSAL('same-day-declaration'));
      }
      const id = idFactory('rar');
      const row = {
        id, caseId: ctx.operationalCase.id, domain, currency, retainedCents, basis,
        declaredOn: declared.day, declaredById: check.actorId,
        withdrawnOn: null, withdrawnById: '', withdrawalReason: '',
      };
      const loaded = normalizeRiskDeclarations([...rows('riskDeclarations'), row], []);
      const stored = loaded.find((candidate) => candidate.id === id) || null;
      if (!stored) return fail('The declaration could not be stored as a row this register can read back. Nothing was saved.', 'retained', REFUSAL('unreadable'));
      store.update((draft) => {
        draft.riskDeclarations = Array.isArray(draft.riskDeclarations) ? draft.riskDeclarations : [];
        draft.riskDeclarations.push(stored);
      }, {
        type: RA_EVENTS.RISK_DECLARED,
        entity: 'riskDeclaration',
        entityId: id,
        summary: `Retained exposure declared for an open risk in ${domain} (${currency}), effective ${declared.day}.`.slice(0, 300),
      });
      return saved({ declarationId: id });
    },

    /** Withdraw a live declaration. It is history afterwards, never revived. */
    riskAppetiteWithdrawRisk(input = {}) {
      const check = seatFor(RA_RIGHTS.CARRY);
      if (!check.ok) return check;
      const ctx = declarationContext(check, input.declarationId);
      if (!ctx.ok) return ctx;
      const caseCheck = caseContext(check, ctx.declaration.caseId);
      // A case that has since settled may still have its live declaration
      // withdrawn: the withdrawal is not a claim about the risk, it is the end
      // of the declared retention. Any other case-context failure is a refusal.
      if (!caseCheck.ok && caseCheck.refusal !== REFUSAL('case-settled')) return caseCheck;
      const reason = raText(input.reason, L.textMax);
      if (reason.length < L.textMin) return fail('Say why the declaration is withdrawn, in at least a sentence.', 'reason', REFUSAL('reason-missing'));
      const day = dayNotFuture(check, input.on, 'on', check.today);
      if (day.error) return day.error;
      if (day.day < ctx.declaration.declaredOn) return fail('A declaration cannot be withdrawn before it was declared.', 'on', REFUSAL('withdraw-before-declare'));
      const id = ctx.declaration.id;
      store.update((draft) => {
        const list = Array.isArray(draft.riskDeclarations) ? draft.riskDeclarations : [];
        const row = list.find((candidate) => candidate && candidate.id === id);
        if (row) {
          row.withdrawnOn = day.day;
          row.withdrawnById = check.actorId;
          row.withdrawalReason = reason;
        }
      }, {
        type: RA_EVENTS.RISK_WITHDRAWN,
        entity: 'riskDeclaration',
        entityId: id,
        summary: `Retained-exposure declaration withdrawn on ${day.day}. The risk is now undeclared until a new declaration is recorded.`.slice(0, 300),
      });
      return saved({ declarationId: id, withdrawnOn: day.day });
    },

    /** Run the rule now. The pause governs this path exactly as it governs a commit. */
    riskAppetiteScan() {
      const check = seatFor(RA_RIGHTS.DECLARE);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: RA_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: `${RA_ROUTE}#${RA_RULE_ID}`,
        summary: `Risk appetite register scan requested (${RA_RULE_ID}): breached tolerances, missing appetites and overdue reviews re-read from the record.`,
      });
      return saved({ propagations: store.lastPropagations || [] });
    },

    /* ----------------------------------------------------------------- reads */

    riskAppetiteReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return buildRiskAppetite(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
    },

    riskAppetiteAttentionCount() {
      const { seat, at, cfg } = readSeat();
      return riskAppetiteAttentionCount(store.state, { now: at, settings: cfg, seat });
    },

    riskAppetiteCandidates() {
      const check = readCheck();
      if (!check.ok) return check;
      return riskAppetiteCandidates(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
    },

    /**
     * ADR-0226: the shared-dependency concentration reading. Re-proves the read
     * right (the reader withholds every figure when any live declared risk is
     * hidden from the seat, so the seat's grant decides what is summed).
     */
    riskAppetiteConcentration() {
      const check = readCheck();
      if (!check.ok) return check;
      return buildRiskConcentration(store.state, { now: check.at, seat: check.seat });
    },
  };
}
