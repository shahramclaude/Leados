/**
 * app/core/domain/capitalRationingActions.js — the seat-checked commands of the
 * Capital Rationing & Funded-Set Register (ADR-0211, Schema v165).
 *
 * FIVE human acts and nothing else: DECLARE a ceiling, RETIRE a ceiling, DECLARE
 * a relation between two cases, RETIRE a relation, and set the conventions. Plus
 * the scan. No act funds anything, edits a case, moves money or changes an
 * appraisal.
 *
 * THE DOOR IS THE PRODUCT.
 *  - A ceiling is declared whole or not at all: a three-letter currency, a real
 *    period that ends on or after it starts and runs at most two years, an
 *    amount read to the exact cent, and a WRITTEN basis. A ceiling with no basis
 *    is a number somebody typed.
 *  - A relation is declared only by a seat that holds BOTH cases' benefit owners
 *    — through the reporting tree or through declared matrix lines. That is the
 *    matrix rule this register exists to get right: an "alternatives" statement
 *    is never made by one line on behalf of another, because the line that
 *    declares it is the line that benefits from the other one being refused.
 *  - A shared-benefit share is refused outside the OPEN interval (0, 10000)
 *    basis points, and refused with the sentence that says why: a full overlap
 *    IS an alternatives declaration and must be recorded as one.
 *  - Retiring anything requires a written reason. A retirement without a reason
 *    is a deletion wearing a date.
 *
 * The undeclared operator view acts as the workspace leader — the one seat a
 * single keyboard genuinely is — and as nobody else.
 */

import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import { matrixLineScopeFor } from './matrix.js';
import {
  buildCapitalRationing,
  capitalRationingAttentionCount as countAttention,
  capitalRationingBriefText,
  capitalRationingCsvRows,
} from './capitalRationing.js';
import {
  CAPITAL_RATIONING_BOUNDS,
  CAPITAL_RATIONING_ENGINE_VERSION,
  CAPITAL_RATIONING_EVENTS,
  CAPITAL_RATIONING_HREF,
  CAPITAL_RATIONING_LIMITS,
  CAPITAL_RATIONING_RIGHTS,
  CAPITAL_RATIONING_RULE_ID,
  CAPITAL_RATIONING_SETTING_KEYS,
  CAPITAL_RATIONING_SETTING_LABELS,
  CAPITAL_RELATION_KIND_KEYS,
} from './capitalRationingRegistry.js';
import {
  capitalCurrency,
  capitalDay,
  capitalDaysBetween,
  capitalReason,
  normalizeCapitalCeilings,
  normalizeCapitalRationingSettings,
  normalizeCapitalRelations,
  parseCapitalAmount,
} from './capitalRationingSchema.js';

const L = CAPITAL_RATIONING_LIMITS;

export function createCapitalRationingActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const text = (value, max) => String(value ?? '').trim().slice(0, max);
  const saved = (extra = {}) => ({ ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [], ok: true });
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);

  function seatFor(right) {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) return fail('The declared seat is unresolved and read-only. Choose a valid seat before reading or acting on capital rationing.');
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    const actorId = seat.fullAccess ? LEADER_ID : (seat.nodeId || seat.id);
    return { ok: true, seat, at, cfg, actorId, today: dayKey(at) };
  }
  const read = (check) => buildCapitalRationing(store.state, { now: check.at, settings: check.cfg, seat: check.seat });

  /** How this seat holds a person: the route, or null. */
  function reachOf(check, personId) {
    if (check.seat.fullAccess) return 'operator';
    if (check.seat.scope instanceof Set && check.seat.scope.has(personId)) return 'home-line';
    if (check.seat.lineScope instanceof Set && check.seat.lineScope.has(personId)) return 'declared-line';
    return null;
  }
  const activePerson = (personId) => (Array.isArray(store.state.people) ? store.state.people : [])
    .find((person) => person && person.id === personId && person.status !== 'archived') || null;

  /** The two cases on the register, as the record stands now. */
  function casePair(aRaw, bRaw) {
    const aId = text(aRaw, 120);
    const bId = text(bRaw, 120);
    if (!aId || !bId) return fail('Name both cases the relation joins.', !aId ? 'aCaseId' : 'bCaseId');
    if (aId === bId) return fail('A relation needs two DIFFERENT cases. One case cannot be an alternative to itself.', 'bCaseId');
    const cases = Array.isArray(store.state.investmentCases) ? store.state.investmentCases : [];
    const a = cases.find((row) => row && row.id === aId) || null;
    const b = cases.find((row) => row && row.id === bId) || null;
    if (!a) return fail('The first case is not on the investment-case register.', 'aCaseId');
    if (!b) return fail('The second case is not on the investment-case register.', 'bCaseId');
    if (String(a.currency).toUpperCase() !== String(b.currency).toUpperCase()) {
      return fail(`These two cases are in different currencies (${a.currency} and ${b.currency}). A relation between them would need an exchange rate this workspace does not hold, so it is refused rather than converted.`, 'bCaseId');
    }
    return { ok: true, a, b };
  }

  /** Both owners in this seat's reach — the matrix rule, at the door. */
  function holdBoth(check, a, b) {
    const viaA = reachOf(check, a.ownerId);
    const viaB = reachOf(check, b.ownerId);
    if (viaA && viaB) return { ok: true, viaA, viaB };
    const missing = !viaA ? 'the first' : 'the second';
    return fail(`This seat does not hold ${missing} case’s benefit owner in its reporting tree or on a declared reporting line. A relation between two cases is declared by a seat above BOTH of them — a line that holds one side only would be ruling on its own alternative.`, !viaA ? 'aCaseId' : 'bCaseId');
  }

  return {
    /* ---------------------------------------------------------------- reads */

    capitalRationingReport() {
      const check = seatFor(CAPITAL_RATIONING_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, report: read(check) };
    },

    capitalRationingBriefText() {
      const check = seatFor(CAPITAL_RATIONING_RIGHTS.READ);
      if (!check.ok) return check;
      const report = read(check);
      return { ok: true, text: capitalRationingBriefText(report), report };
    },

    capitalRationingCsvRows() {
      const check = seatFor(CAPITAL_RATIONING_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, rows: capitalRationingCsvRows(read(check)) };
    },

    capitalRationingAttentionCount() {
      const check = seatFor(CAPITAL_RATIONING_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, count: countAttention(store.state, { now: check.at, seat: check.seat }) };
    },

    /** Who may declare a ceiling, and the bounds of a declaration. */
    capitalRationingCandidates() {
      const at = clock();
      const cfg = settings();
      const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
      const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
      const seat = activeSeat(built);
      // The candidate list is a READ: it is offered to anyone who may read, and
      // the DECLARE act re-proves the right. Reading who could be named is not
      // an authority to name them.
      const readCheck = seatFor(CAPITAL_RATIONING_RIGHTS.READ);
      if (!readCheck.ok) return readCheck;
      const cur = [];
      for (const budget of rows('budgets')) {
        const code = capitalCurrency(budget?.currency);
        if (code && !cur.includes(code)) cur.push(code);
      }
      const cases = Array.isArray(store.state.investmentCases) ? store.state.investmentCases : [];
      for (const row of cases) {
        const code = capitalCurrency(row?.currency);
        if (code && !cur.includes(code)) cur.push(code);
      }
      for (const row of normalizeCapitalCeilings(store.state.capitalCeilings, [])) {
        if (!cur.includes(row.currency)) cur.push(row.currency);
      }
      // Cases this seat may declare a relation between: ratified candidates in
      // its reach, in currency groups, so the dialog can name a real pair.
      const report = read(readCheck);
      const pairs = [];
      for (const currency of report.currencies) {
        for (const a of currency.candidates) {
          for (const b of currency.candidates) {
            if (a.caseId >= b.caseId) continue;
            pairs.push({ aCaseId: a.caseId, bCaseId: b.caseId, currency: currency.currency, aTitle: a.title, bTitle: b.title, aOwner: a.ownerName, bOwner: b.ownerName });
          }
        }
      }
      return {
        ok: true,
        actorId: readCheck.actorId,
        today: readCheck.today,
        seatLabel: readCheck.seat.fullAccess ? 'Workspace leader (operator view)' : (readCheck.seat.label || ''),
        canDeclareCeiling: canAct(CAPITAL_RATIONING_RIGHTS.DECLARE_CEILING, seat).allow === true,
        canDeclareRelation: canAct(CAPITAL_RATIONING_RIGHTS.DECLARE_RELATION, seat).allow === true,
        currencies: cur.sort(),
        pairs: pairs.sort((x, y) => x.currency.localeCompare(y.currency) || x.aTitle.localeCompare(y.aTitle) || x.bTitle.localeCompare(y.bTitle)),
        kinds: CAPITAL_RELATION_KIND_KEYS,
        bounds: {
          reasonMin: L.reasonMin, reasonMax: L.reasonMax,
          periodMaxDays: L.periodMaxDays,
          overlapBpMin: L.overlapBpMin, overlapBpMax: L.overlapBpMax,
        },
        ceilings: report.ceilings,
      };
    },

    /* --------------------------------------------------------------- writes */

    /** Declare a ceiling. A constraint nobody signed is never inferred. */
    capitalRationingDeclareCeiling(input = {}) {
      const check = seatFor(CAPITAL_RATIONING_RIGHTS.DECLARE_CEILING);
      if (!check.ok) return check;
      if (rows('capitalCeilings').length >= L.ceilings) {
        return fail(`The capital-ceiling ledger reached its ${L.ceilings}-row cap. Export the workspace before declaring another ceiling.`);
      }
      const currency = capitalCurrency(input.currency);
      if (!currency) return fail('State the currency as its three-letter code (DKK, EUR, USD). One ceiling, one currency; nothing is converted.', 'currency');
      const periodFrom = capitalDay(input.periodFrom);
      if (!periodFrom) return fail('State the first day of the period as a real calendar day.', 'periodFrom');
      const periodTo = capitalDay(input.periodTo);
      if (!periodTo) return fail('State the last day of the period as a real calendar day.', 'periodTo');
      const span = capitalDaysBetween(periodFrom, periodTo);
      if (span === null || span < 0) return fail(`The period ends (${periodTo}) before it starts (${periodFrom}).`, 'periodTo');
      if (span > L.periodMaxDays) return fail(`The period runs ${span} days. A ceiling covers at most ${L.periodMaxDays} days (two years); a longer one is not a decision, it is a decade.`, 'periodTo');
      const cents = parseCapitalAmount(input.cents !== undefined ? input.cents : (input.amount !== undefined ? input.amount : input.amountText));
      if (cents === null) return fail('State the ceiling as a whole amount with at most two decimals (40000000, 1500.50). No thousands separator, no exponent. An amount the register cannot read exactly is not rounded into one it can.', 'amountText');
      const basis = capitalReason(input.basis);
      if (!basis) return fail(`Write the basis of this ceiling (at least ${L.reasonMin} characters) — the board approval, the treasury limit, the covenant it comes from. A ceiling with no basis is a number somebody typed.`, 'basis');
      const record = {
        id: idFactory('cceil'), currency, periodFrom, periodTo, cents, basis,
        declaredOn: check.today, declaredAt: check.at.toISOString(), declaredById: check.actorId,
      };
      // The stored row must survive its own loader, or nothing is written.
      if (normalizeCapitalCeilings([record], []).length !== 1) return fail('The ceiling could not be stored exactly as read. Nothing was saved.');
      store.update((draft) => {
        draft.capitalCeilings = Array.isArray(draft.capitalCeilings) ? draft.capitalCeilings : [];
        draft.capitalCeilings.push(record);
      }, {
        type: CAPITAL_RATIONING_EVENTS.CEILING_DECLARED,
        entity: 'capitalCeiling',
        entityId: record.id,
        summary: `Capital ceiling declared on ${check.today}: ${currency} ${cents} cents over ${periodFrom} → ${periodTo} (${basis.slice(0, 120)}).`.slice(0, 300),
      });
      return saved({ ceilingId: record.id, currency, cents });
    },

    /** Retire a ceiling. The declaration is preserved; only its life ends. */
    capitalRationingRetireCeiling(input = {}) {
      const check = seatFor(CAPITAL_RATIONING_RIGHTS.DECLARE_CEILING);
      if (!check.ok) return check;
      const ceilingId = text(input.ceilingId, 120);
      const existing = normalizeCapitalCeilings(store.state.capitalCeilings, []).find((row) => row.id === ceilingId) || null;
      if (!existing) return fail('That ceiling is not on the record.', 'ceilingId');
      if (existing.retiredOn) return fail(`That ceiling was already retired on ${existing.retiredOn}. A retirement is a dated act, not a toggle.`, 'ceilingId');
      const reason = capitalReason(input.reason);
      if (!reason) return fail(`Write why this ceiling is retired (at least ${L.reasonMin} characters). A retirement without a reason is a deletion wearing a date.`, 'reason');
      store.update((draft) => {
        const list = Array.isArray(draft.capitalCeilings) ? draft.capitalCeilings : [];
        const target = list.find((row) => row && row.id === ceilingId);
        if (target) {
          target.retiredOn = check.today;
          target.retiredById = check.actorId;
          target.retireReason = reason;
        }
      }, {
        type: CAPITAL_RATIONING_EVENTS.CEILING_RETIRED,
        entity: 'capitalCeiling',
        entityId: ceilingId,
        summary: `Capital ceiling retired on ${check.today}: ${reason.slice(0, 180)}`.slice(0, 300),
      });
      return saved({ ceilingId });
    },

    /**
     * Declare a relation between two cases. The door refuses anything that is not
     * a real, decidable relation — and refuses a full overlap BY NAME, because
     * recording it as a shared benefit would route around the exclusivity test.
     */
    capitalRationingDeclareRelation(input = {}) {
      const check = seatFor(CAPITAL_RATIONING_RIGHTS.DECLARE_RELATION);
      if (!check.ok) return check;
      if (rows('capitalRelations').length >= L.relations) {
        return fail(`The capital-relation ledger reached its ${L.relations}-row cap. Export the workspace before declaring another relation.`);
      }
      const pair = casePair(input.aCaseId, input.bCaseId);
      if (!pair.ok) return pair;
      const kind = CAPITAL_RELATION_KIND_KEYS.includes(input.kind) ? input.kind : null;
      if (!kind) return fail(`Declare the kind of relation: ${CAPITAL_RELATION_KIND_KEYS.join(', ')}.`, 'kind');
      const hold = holdBoth(check, pair.a, pair.b);
      if (!hold.ok) return hold;
      const reason = capitalReason(input.reason);
      if (!reason) return fail(`Write why these two cases stand in this relation (at least ${L.reasonMin} characters). The register cannot read it from the flows, so it is not read at all unless a person says it.`, 'reason');
      let overlapBp = null;
      if (kind === 'overlap') {
        const raw = input.overlapBp !== undefined ? input.overlapBp : input.overlapPct;
        const bp = Number.isInteger(input.overlapBp)
          ? input.overlapBp
          : (Number.isFinite(Number(raw)) ? Math.round(Number(String(raw).replace('%', '').trim()) * 100) : null);
        if (!Number.isInteger(bp)) return fail('State the shared share as a percentage with at most two decimals (25, 12.5).', 'overlapPct');
        if (bp <= L.overlapBpMin || bp >= L.overlapBpMax) {
          return fail(bp >= L.overlapBpMax
            ? `A share of ${(bp / 100).toFixed(2)}% means the WHOLE benefit of the first case is also booked by the second. That is not a shared benefit — the two cases are alternatives, and recording it here would route around the exclusivity test. Declare an “alternatives” relation instead.`
            : 'A share of zero is not a relation: nothing is shared, so nothing needs declaring.', 'overlapPct');
        }
        overlapBp = bp;
      }
      // A duplicate live relation of the same kind over the same pair is refused:
      // two declarations of one fact would each deduct their own overlap share.
      const live = normalizeCapitalRelations(store.state.capitalRelations, []).filter((row) => !row.retiredOn && row.kind === kind);
      const duplicate = live.find((row) => (row.aCaseId === pair.a.id && row.bCaseId === pair.b.id)
        || (row.aCaseId === pair.b.id && row.bCaseId === pair.a.id));
      if (duplicate) {
        return fail(`A live “${kind}” relation already joins these two cases, declared on ${duplicate.declaredOn}. Retire it first: two declarations of one fact would each deduct their own share.`, 'kind');
      }
      const record = {
        id: idFactory('crel'), aCaseId: pair.a.id, bCaseId: pair.b.id, kind, overlapBp, reason,
        declaredOn: check.today, declaredAt: check.at.toISOString(), declaredById: check.actorId,
      };
      if (normalizeCapitalRelations([record], []).length !== 1) return fail('The relation could not be stored exactly as read. Nothing was saved.');
      store.update((draft) => {
        draft.capitalRelations = Array.isArray(draft.capitalRelations) ? draft.capitalRelations : [];
        draft.capitalRelations.push(record);
      }, {
        type: CAPITAL_RATIONING_EVENTS.RELATION_DECLARED,
        entity: 'capitalRelation',
        entityId: record.id,
        summary: `Capital relation declared on ${check.today}: ${kind}${overlapBp === null ? '' : ` at ${overlapBp} bp`} through the ${hold.viaA}/${hold.viaB} route (${reason.slice(0, 120)}).`.slice(0, 300),
      });
      return saved({ relationId: record.id, kind, overlapBp });
    },

    /** Retire a relation. The declaration is preserved; only its life ends. */
    capitalRationingRetireRelation(input = {}) {
      const check = seatFor(CAPITAL_RATIONING_RIGHTS.DECLARE_RELATION);
      if (!check.ok) return check;
      const relationId = text(input.relationId, 120);
      const existing = normalizeCapitalRelations(store.state.capitalRelations, []).find((row) => row.id === relationId) || null;
      if (!existing) return fail('That relation is not on the record.', 'relationId');
      if (existing.retiredOn) return fail(`That relation was already retired on ${existing.retiredOn}. A retirement is a dated act, not a toggle.`, 'relationId');
      const reason = capitalReason(input.reason);
      if (!reason) return fail(`Write why this relation is retired (at least ${L.reasonMin} characters). A retirement without a reason is a deletion wearing a date.`, 'reason');
      // The same authority that declared it retires it: a seat must still hold both owners.
      const cases = Array.isArray(store.state.investmentCases) ? store.state.investmentCases : [];
      const a = cases.find((row) => row && row.id === existing.aCaseId) || null;
      const b = cases.find((row) => row && row.id === existing.bCaseId) || null;
      if (a && b) {
        const hold = holdBoth(check, a, b);
        if (!hold.ok) return hold;
      }
      store.update((draft) => {
        const list = Array.isArray(draft.capitalRelations) ? draft.capitalRelations : [];
        const target = list.find((row) => row && row.id === relationId);
        if (target) {
          target.retiredOn = check.today;
          target.retiredById = check.actorId;
          target.retireReason = reason;
        }
      }, {
        type: CAPITAL_RATIONING_EVENTS.RELATION_RETIRED,
        entity: 'capitalRelation',
        entityId: relationId,
        summary: `Capital relation retired on ${check.today}: ${reason.slice(0, 180)}`.slice(0, 300),
      });
      return saved({ relationId });
    },

    /** Re-run RULE-CRS-01 on the shared spine. A pause still governs. */
    capitalRationingScan() {
      const check = seatFor(CAPITAL_RATIONING_RIGHTS.GOVERN);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: CAPITAL_RATIONING_EVENTS.SCAN,
        entity: 'workspace',
        entityId: CAPITAL_RATIONING_HREF,
        summary: `Capital-rationing scan requested (${CAPITAL_RATIONING_RULE_ID}).`,
      });
      return saved({ report: read(check), effects: (store.lastPropagations || []).filter((effect) => effect && effect.ruleId === CAPITAL_RATIONING_RULE_ID) });
    },

    /** Set the conventions. A value outside its declared bounds is REFUSED, never clamped. */
    capitalRationingSetConventions(patch = {}) {
      const check = seatFor(CAPITAL_RATIONING_RIGHTS.GOVERN);
      if (!check.ok) return check;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return fail('Capital-rationing conventions must be supplied as a plain object. Nothing was saved.', 'settings');
      const names = new Map(Object.entries(CAPITAL_RATIONING_SETTING_KEYS).map(([name, key]) => [key, name]));
      const keys = Object.keys(patch);
      if (!keys.length) return fail('State at least one capital-rationing convention to update. Nothing was saved.', 'settings');
      for (const key of keys) {
        const name = names.get(key);
        if (!name) return fail(`“${key}” is not a declared capital-rationing convention. Nothing was saved.`, key);
        if (name === 'autoPropagate') {
          if (typeof patch[key] !== 'boolean') return fail(`${CAPITAL_RATIONING_SETTING_LABELS.autoPropagate} must be true or false. Nothing was saved.`, key);
        } else {
          const [min, max] = CAPITAL_RATIONING_BOUNDS[name];
          if (!Number.isInteger(patch[key]) || patch[key] < min || patch[key] > max) {
            return fail(`${CAPITAL_RATIONING_SETTING_LABELS[name]} must be a whole number from ${min} to ${max}. Nothing was clamped and nothing was saved.`, key);
          }
        }
      }
      const next = normalizeCapitalRationingSettings({ ...settings(), ...patch });
      store.update((draft) => { draft.settings = { ...(draft.settings || {}), ...next }; }, {
        type: CAPITAL_RATIONING_EVENTS.CONVENTIONS,
        entity: 'settings',
        entityId: CAPITAL_RATIONING_HREF,
        summary: `Capital-rationing conventions set: ask window ${next.capitalRationingAskDueDays} d, automation ${next.capitalRationingAutoPropagate ? 'on' : 'off'}.`.slice(0, 300),
      });
      return saved({ conventions: next });
    },
  };
}
