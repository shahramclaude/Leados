/**
 * app/core/domain/investmentCaseActions.js — the seat-checked commands of the
 * Investment Case Register (ADR-0208, Schema v162).
 *
 * FOUR human acts and nothing else: DECLARE a case, WITHDRAW it before any
 * decision, RATIFY it (approve or refuse), and REVIEW it against its promise.
 * Plus the conventions and the scan. No act moves money, edits an envelope,
 * posts a commitment or rewrites a declared case.
 *
 * THE DOOR IS THE PRODUCT.
 *  - A case is declared whole or not at all: a named owner on the roster, one
 *    currency, a declared price basis, an explicit hurdle rate (none is assumed
 *    anywhere in this workspace), dated flows read to the exact cent, and a
 *    review day. A case with no review day is a case nobody intends to check.
 *  - Ratifying and reviewing are DECISION CONTROL. They are refused to the
 *    benefit owner, refused to a seat that does not hold the owner in its tree
 *    or on a declared line, and the act records which of the two carried it.
 *  - Ratifying a case that is worth less than zero at its own declared hurdle is
 *    a decision to spend money on purpose for a reason the arithmetic cannot
 *    see. It is permitted, and it is refused without that reason in writing.
 *  - A review states every actual flow up to its cut-off and says whether the
 *    outlay is complete. A cut-off in the future, a cut-off that does not move
 *    forward, an outlay re-opened after it was declared complete, and a final
 *    review that stops short of the declared review day are all refused.
 *
 * The undeclared operator view acts as the workspace leader — the one seat a
 * single keyboard genuinely is — and as nobody else.
 */

import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { LEADER_ID } from './chain.js';
import { matrixLineScopeFor } from './matrix.js';
import {
  buildInvestmentCases,
  investmentCaseAppraisal,
  investmentCaseAttentionCount as countAttention,
  investmentCaseBriefText,
  investmentCaseCsvRows,
  investmentCaseLifecycle,
  investmentMoney,
} from './investmentCase.js';
import { appraiseInvestment } from './investmentCaseMath.js';
import {
  INVESTMENT_BASIS_KEYS,
  INVESTMENT_CASE_BOUNDS,
  INVESTMENT_CASE_ENGINE_VERSION,
  INVESTMENT_CASE_EVENTS,
  INVESTMENT_CASE_HREF,
  INVESTMENT_CASE_LIMITS,
  INVESTMENT_CASE_RIGHTS,
  INVESTMENT_CASE_RULE_ID,
  INVESTMENT_CASE_SETTING_KEYS,
  INVESTMENT_CASE_SETTING_LABELS,
  INVESTMENT_FLOW_KIND_KEYS,
} from './investmentCaseRegistry.js';
import {
  investmentCurrency,
  investmentDay,
  investmentReason,
  investmentScheduleProblem,
  investmentTitle,
  normalizeInvestmentCaseActs,
  normalizeInvestmentCases,
  normalizeInvestmentCaseSettings,
  parseInvestmentRatePercent,
  readTypedInvestmentFlows,
} from './investmentCaseSchema.js';

const L = INVESTMENT_CASE_LIMITS;

export function createInvestmentCaseActions(store, { now, idFactory }) {
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
    if (seat.readOnly) return fail('The declared seat is unresolved and read-only. Choose a valid seat before reading or acting on an investment case.');
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    const actorId = seat.fullAccess ? LEADER_ID : (seat.nodeId || seat.id);
    return { ok: true, seat, at, cfg, actorId, today: dayKey(at) };
  }
  const read = (check) => buildInvestmentCases(store.state, { now: check.at, settings: check.cfg, seat: check.seat });

  /** How this seat holds a person: the route that carries decision control, or null. */
  function reachOf(check, personId) {
    if (check.seat.fullAccess) return 'operator';
    if (check.seat.scope instanceof Set && check.seat.scope.has(personId)) return 'home-line';
    if (check.seat.lineScope instanceof Set && check.seat.lineScope.has(personId)) return 'declared-line';
    return null;
  }
  const activePerson = (personId) => (Array.isArray(store.state.people) ? store.state.people : [])
    .find((person) => person && person.id === personId && person.status !== 'archived') || null;

  /**
   * Read a typed draft into the stored shape — the SAME reading for the preview
   * and for the declaration, so what the dialog showed is what gets saved.
   */
  function readDraft(check, input = {}) {
    const title = investmentTitle(input.title);
    if (!title) return fail(`Name the case in ${L.titleMin}–${L.titleMax} characters — “Second filling line, Aarhus”, not a sentence.`, 'title');
    const ownerId = text(input.ownerId, 120);
    if (!ownerId) return fail('Name the benefit owner: the one person accountable for the return this case promises. A promise nobody made cannot be reviewed.', 'ownerId');
    const owner = activePerson(ownerId);
    if (!owner) return fail('The benefit owner is not on the active roster.', 'ownerId');
    if (!reachOf(check, ownerId)) return fail('The benefit owner sits outside this seat’s reporting tree and declared lines. A case is declared by the owner’s own line, or escalated through the leader above both.', 'ownerId');
    const currency = investmentCurrency(input.currency);
    if (!currency) return fail('State the currency as its three-letter code (DKK, EUR, USD). One case, one currency; nothing is converted.', 'currency');
    const basis = INVESTMENT_BASIS_KEYS.includes(input.basis) ? input.basis : null;
    if (!basis) return fail('Declare the price basis — nominal or real. Flows and hurdle rate must be in the same terms, and the register will not guess which.', 'basis');
    const hurdleBp = Number.isInteger(input.hurdleBp) && input.hurdleBp >= L.hurdleBpMin && input.hurdleBp <= L.hurdleBpMax
      ? input.hurdleBp
      : parseInvestmentRatePercent(input.hurdlePct);
    if (hurdleBp === null || hurdleBp === undefined) return fail('State the hurdle rate as a percentage from 0 to 100 with at most two decimals (8, 8.5, 12.25). No rate is assumed for you.', 'hurdlePct');
    const typed = readTypedInvestmentFlows(input.flows !== undefined ? input.flows : input.flowsText);
    if (!typed.ok) return fail(typed.error, 'flows');
    const flows = typed.flows;
    if (!flows.length) return fail('State the dated flows — one per line: day, kind, amount.', 'flows');
    const firstOn = flows[0].on;
    const baseOn = input.baseOn === undefined || input.baseOn === null || String(input.baseOn).trim() === '' ? firstOn : investmentDay(input.baseOn);
    if (!baseOn) return fail('The valuation day is not a real calendar day.', 'baseOn');
    const reviewOn = investmentDay(input.reviewOn);
    if (String(input.reviewOn ?? '').trim() && !reviewOn) return fail('The review day is not a real calendar day.', 'reviewOn');
    const problem = investmentScheduleProblem({ flows, baseOn, reviewOn });
    if (problem) return fail(problem, problem.includes('review') ? 'reviewOn' : 'flows');
    const note = String(input.note ?? '').trim();
    if (note && !investmentReason(note)) return fail(`A note on the case must be at least ${L.reasonMin} characters if you write one.`, 'note');
    const appraisal = appraiseInvestment({ flows, baseOn, hurdleBp });
    if (!appraisal.ok) return fail(appraisal.reason, 'flows');
    return {
      ok: true,
      draft: { title, ownerId, currency, basis, hurdleBp, baseOn, reviewOn, flows, note: note.slice(0, L.reasonMax) },
      appraisal,
      ownerName: owner.name || '',
      retrospective: check.today > flows.find((flow) => flow.kind === 'outlay').on,
    };
  }

  /** The case and its lifecycle as the record stands NOW, re-derived at the door. */
  function standing(check, caseId) {
    const cases = normalizeInvestmentCases(store.state.investmentCases, []);
    const record = cases.find((row) => row.id === caseId) || null;
    if (!record) return fail('That case is not on the record.', 'caseId');
    const acts = normalizeInvestmentCaseActs(store.state.investmentCaseActs, cases, []);
    return { ok: true, record, life: investmentCaseLifecycle(record, acts, check.today) };
  }

  /** Decision control: a seat above the owner, never the owner. */
  function controlOver(check, record, verb) {
    if (check.actorId === record.ownerId) {
      return fail(`You are this case’s benefit owner. The person who initiates and delivers an investment does not ${verb} it — that act belongs to a seat above you.`, 'caseId');
    }
    const via = reachOf(check, record.ownerId);
    if (!via) {
      return fail(`The benefit owner sits outside this seat’s reporting tree and declared lines, so this seat holds no decision control over the case and cannot ${verb} it.`, 'caseId');
    }
    return { ok: true, via };
  }

  const appendAct = (act, event) => store.update((draft) => {
    draft.investmentCaseActs = Array.isArray(draft.investmentCaseActs) ? draft.investmentCaseActs : [];
    draft.investmentCaseActs.push(act);
  }, event);

  return {
    /* ---------------------------------------------------------------- reads */

    investmentCaseReport() {
      const check = seatFor(INVESTMENT_CASE_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, report: read(check) };
    },

    investmentCaseBriefText() {
      const check = seatFor(INVESTMENT_CASE_RIGHTS.READ);
      if (!check.ok) return check;
      const report = read(check);
      return { ok: true, text: investmentCaseBriefText(report), report };
    },

    investmentCaseCsvRows() {
      const check = seatFor(INVESTMENT_CASE_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, rows: investmentCaseCsvRows(read(check)) };
    },

    investmentCaseAttentionCount() {
      const check = seatFor(INVESTMENT_CASE_RIGHTS.READ);
      if (!check.ok) return check;
      return { ok: true, count: countAttention(store.state, { now: check.at, seat: check.seat }) };
    },

    /** Who this seat may name as a benefit owner, and the bounds of a declaration. */
    investmentCaseCandidates() {
      const check = seatFor(INVESTMENT_CASE_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const owners = (Array.isArray(store.state.people) ? store.state.people : [])
        .filter((person) => person && person.id && person.status !== 'archived' && reachOf(check, person.id))
        .map((person) => ({ id: person.id, name: person.name || person.id, via: reachOf(check, person.id) }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      const currencies = [...new Set([
        ...rows('budgets').map((budget) => investmentCurrency(budget?.currency)),
        ...normalizeInvestmentCases(store.state.investmentCases, []).map((row) => row.currency),
      ].filter(Boolean))].sort();
      return {
        ok: true,
        actorId: check.actorId,
        today: check.today,
        owners,
        currencies,
        kinds: INVESTMENT_FLOW_KIND_KEYS,
        bases: INVESTMENT_BASIS_KEYS,
        bounds: { titleMin: L.titleMin, titleMax: L.titleMax, reasonMin: L.reasonMin, reasonMax: L.reasonMax, flowsPerCase: L.flowsPerCase, flowsPerReview: L.flowsPerReview, hurdleBpMax: L.hurdleBpMax },
      };
    },

    /** Appraise a typed draft without saving it. Exactly the reading a declaration would store. */
    investmentCasePreview(input = {}) {
      const check = seatFor(INVESTMENT_CASE_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const draft = readDraft(check, input);
      if (!draft.ok) return draft;
      return { ok: true, draft: draft.draft, appraisal: draft.appraisal, ownerName: draft.ownerName, retrospective: draft.retrospective };
    },

    /* --------------------------------------------------------------- writes */

    investmentCaseDeclare(input = {}) {
      const check = seatFor(INVESTMENT_CASE_RIGHTS.DECLARE);
      if (!check.ok) return check;
      if (rows('investmentCases').length >= L.cases) {
        return fail(`The investment-case ledger reached its ${L.cases}-row cap. Export the workspace before declaring another case.`);
      }
      const read1 = readDraft(check, input);
      if (!read1.ok) return read1;
      const record = {
        id: idFactory('icase'),
        ...read1.draft,
        declaredOn: check.today,
        declaredAt: check.at.toISOString(),
        declaredById: check.actorId,
        engineVersion: INVESTMENT_CASE_ENGINE_VERSION,
      };
      // The stored row must survive its own loader, or nothing is written.
      if (normalizeInvestmentCases([record], []).length !== 1) return fail('The case could not be stored exactly as read. Nothing was saved.');
      const a = read1.appraisal;
      store.update((draft) => {
        draft.investmentCases = Array.isArray(draft.investmentCases) ? draft.investmentCases : [];
        draft.investmentCases.push(record);
      }, {
        type: INVESTMENT_CASE_EVENTS.DECLARED,
        entity: 'investmentCase',
        entityId: record.id,
        summary: `Investment case declared on ${check.today}: ${record.flows.length} dated flow(s) in ${record.currency} at a ${record.basis} hurdle of ${record.hurdleBp} bp, review on ${record.reviewOn}; net present value ${investmentMoney(record.currency, a.npvCents)}.`.slice(0, 300),
      });
      return saved({ caseId: record.id, appraisal: a, retrospective: read1.retrospective });
    },

    investmentCaseWithdraw(input = {}) {
      const check = seatFor(INVESTMENT_CASE_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const at = standing(check, text(input.caseId, 120));
      if (!at.ok) return at;
      if (!reachOf(check, at.record.ownerId)) return fail('The benefit owner sits outside this seat’s reporting tree and declared lines. This seat cannot withdraw the case.', 'caseId');
      if (at.life.status !== 'proposed') return fail(`Only a case still awaiting ratification can be withdrawn. This one reads “${at.life.status}”; a decided case stays on the record.`, 'caseId');
      const reason = investmentReason(input.reason);
      if (!reason) return fail(`Write why the case is withdrawn (at least ${L.reasonMin} characters).`, 'reason');
      if (rows('investmentCaseActs').length >= L.acts) return fail(`The investment-case act ledger reached its ${L.acts}-row cap. Export the workspace first.`);
      const act = { id: idFactory('iact'), caseId: at.record.id, kind: 'withdraw', actedOn: check.today, actedAt: check.at.toISOString(), actedById: check.actorId, via: null, reason };
      appendAct(act, {
        type: INVESTMENT_CASE_EVENTS.WITHDRAWN,
        entity: 'investmentCase',
        entityId: at.record.id,
        summary: `Investment case withdrawn before ratification on ${check.today}: ${reason.slice(0, 180)}`.slice(0, 300),
      });
      return saved({ caseId: at.record.id, actId: act.id });
    },

    /** Ratify: approve or refuse. Decision control — never the benefit owner's own act. */
    investmentCaseDecide(input = {}) {
      const check = seatFor(INVESTMENT_CASE_RIGHTS.RATIFY);
      if (!check.ok) return check;
      const decision = input.decision === 'approve' || input.decision === 'reject' ? input.decision : null;
      if (!decision) return fail('State the decision: approve or reject.', 'decision');
      const at = standing(check, text(input.caseId, 120));
      if (!at.ok) return at;
      const control = controlOver(check, at.record, 'ratify');
      if (!control.ok) return control;
      if (at.life.status !== 'proposed') return fail(`This case reads “${at.life.status}”. A case is ratified once; a changed promise is a new case.`, 'caseId');
      if (rows('investmentCaseActs').length >= L.acts) return fail(`The investment-case act ledger reached its ${L.acts}-row cap. Export the workspace first.`);
      const reason = investmentReason(input.reason);
      if (String(input.reason ?? '').trim() && !reason) return fail(`A written reason must be at least ${L.reasonMin} characters.`, 'reason');
      if (decision === 'reject' && !reason) return fail(`Write why the case is refused (at least ${L.reasonMin} characters). What an organisation refuses to fund is part of its funded mix.`, 'reason');
      const appraisal = investmentCaseAppraisal(at.record);
      if (decision === 'approve' && appraisal.npvSign < 0 && !reason) {
        return fail(`At its own declared hurdle of ${at.record.hurdleBp} bp this case is worth ${investmentMoney(at.record.currency, appraisal.npvCents)}. Ratifying it is a decision to spend that on purpose, for a reason the arithmetic cannot see — write the reason (at least ${L.reasonMin} characters). Nothing was saved.`, 'reason');
      }
      const act = { id: idFactory('iact'), caseId: at.record.id, kind: decision, actedOn: check.today, actedAt: check.at.toISOString(), actedById: check.actorId, via: control.via, reason: reason || '' };
      appendAct(act, {
        type: INVESTMENT_CASE_EVENTS.DECIDED,
        entity: 'investmentCase',
        entityId: at.record.id,
        summary: `Investment case ${decision === 'approve' ? 'ratified' : 'refused'} on ${check.today} through the ${control.via} route; net present value at its declared hurdle ${investmentMoney(at.record.currency, appraisal.npvCents)}.`.slice(0, 300),
      });
      return saved({ caseId: at.record.id, actId: act.id, decision, via: control.via, npvCents: appraisal.npvCents });
    },

    /** Record a post-completion review: what actually moved, up to a cut-off. */
    investmentCaseReview(input = {}) {
      const check = seatFor(INVESTMENT_CASE_RIGHTS.RATIFY);
      if (!check.ok) return check;
      const at = standing(check, text(input.caseId, 120));
      if (!at.ok) return at;
      const control = controlOver(check, at.record, 'review');
      if (!control.ok) return control;
      const { record, life } = at;
      if (!life.ratified) return fail(`This case reads “${life.status}”. Only a ratified case has a promise to review.`, 'caseId');
      if (life.status === 'closed') return fail('A final review is already on the record for this case. It is closed.', 'caseId');
      if (life.reviews.length >= L.reviewsPerCase) return fail(`This case already carries its maximum of ${L.reviewsPerCase} reviews.`, 'caseId');
      if (rows('investmentCaseActs').length >= L.acts) return fail(`The investment-case act ledger reached its ${L.acts}-row cap. Export the workspace first.`);
      const cutoffOn = investmentDay(input.cutoffOn);
      if (!cutoffOn) return fail('State the review cut-off as a real calendar day: the last day whose money this review accounts for.', 'cutoffOn');
      if (cutoffOn > check.today) return fail(`The cut-off ${cutoffOn} is after today (${check.today}). A review states what happened, never what is expected.`, 'cutoffOn');
      if (cutoffOn < record.baseOn) return fail(`The cut-off ${cutoffOn} is before the case’s valuation day ${record.baseOn}.`, 'cutoffOn');
      if (life.latestReview && !(cutoffOn > life.latestReview.cutoffOn)) {
        return fail(`The last review already accounts for everything up to ${life.latestReview.cutoffOn}. A further review must reach a later day.`, 'cutoffOn');
      }
      if (typeof input.outlayComplete !== 'boolean') return fail('Say whether the outlay is complete — yes or no. Without that, spending less than planned so far cannot be told apart from running late.', 'outlayComplete');
      if (life.outlayComplete && input.outlayComplete !== true) return fail('An earlier review declared the outlay complete. A later review cannot re-open it; record the additional outlay as an actual flow instead.', 'outlayComplete');
      const typed = readTypedInvestmentFlows(input.flows !== undefined ? input.flows : (input.flowsText ?? ''));
      if (!typed.ok) return fail(typed.error, 'flows');
      const flows = typed.flows;
      if (flows.length > L.flowsPerReview) return fail(`A review may record at most ${L.flowsPerReview} actual flows; ${flows.length} were supplied. Aggregate to periods.`, 'flows');
      const early = flows.find((flow) => flow.on < record.baseOn);
      if (early) return fail(`An actual flow is dated ${early.on}, before the case’s valuation day ${record.baseOn}. It was sunk when the case was valued and was never part of the promise.`, 'flows');
      const late = flows.find((flow) => flow.on > cutoffOn);
      if (late) return fail(`An actual flow is dated ${late.on}, after the cut-off ${cutoffOn}. A review states what happened up to its cut-off.`, 'flows');
      const reason = investmentReason(input.note);
      if (String(input.note ?? '').trim() && !reason) return fail(`A note on the review must be at least ${L.reasonMin} characters.`, 'note');
      if (!flows.length && !reason) return fail(`A review that records no actual flow at all needs a written note (at least ${L.reasonMin} characters) saying that nothing has moved.`, 'note');
      const nextRaw = String(input.nextReviewOn ?? '').trim();
      const nextReviewOn = nextRaw ? investmentDay(nextRaw) : null;
      if (nextRaw && !nextReviewOn) return fail('The next review day is not a real calendar day. Leave it empty to close the case with this review.', 'nextReviewOn');
      if (nextReviewOn && !(nextReviewOn > cutoffOn)) return fail('The next review day must be after this review’s cut-off.', 'nextReviewOn');
      if (!nextReviewOn && cutoffOn < record.reviewOn) {
        return fail(`This would close the case, but its cut-off ${cutoffOn} stops short of the review day the case declared (${record.reviewOn}). Declare a next review day, or review up to the declared day.`, 'nextReviewOn');
      }
      const act = {
        id: idFactory('iact'), caseId: record.id, kind: 'review', actedOn: check.today, actedAt: check.at.toISOString(),
        actedById: check.actorId, via: control.via, reason: reason || '',
        cutoffOn, flows, outlayComplete: input.outlayComplete === true, nextReviewOn,
      };
      // The stored act must survive its own loader against the acts already on file.
      const cases = normalizeInvestmentCases(store.state.investmentCases, []);
      const before = normalizeInvestmentCaseActs(store.state.investmentCaseActs, cases, []);
      const after = normalizeInvestmentCaseActs([...rows('investmentCaseActs'), act], cases, []);
      if (after.length !== before.length + 1) return fail('The review could not be stored exactly as read. Nothing was saved.');
      appendAct(act, {
        type: INVESTMENT_CASE_EVENTS.REVIEWED,
        entity: 'investmentCase',
        entityId: record.id,
        summary: `Post-completion review recorded on ${check.today} to cut-off ${cutoffOn}: ${flows.length} actual flow(s), outlay ${act.outlayComplete ? 'complete' : 'still open'}, ${nextReviewOn ? `next review ${nextReviewOn}` : 'case closed'}.`.slice(0, 300),
      });
      const report = read(check);
      const row = report.allCases.find((entry) => entry.caseId === record.id) || null;
      return saved({ caseId: record.id, actId: act.id, status: row?.status || null, reading: row?.latestReading || null });
    },

    /** Re-run RULE-ICA-01 on the shared spine. A pause still governs: this retries the cap, it does not override the switch. */
    investmentCaseScan() {
      const check = seatFor(INVESTMENT_CASE_RIGHTS.GOVERN);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: INVESTMENT_CASE_EVENTS.SCAN,
        entity: 'workspace',
        entityId: INVESTMENT_CASE_HREF,
        summary: `Investment-case review scan requested (${INVESTMENT_CASE_RULE_ID}).`,
      });
      return saved({ report: read(check), effects: (store.lastPropagations || []).filter((effect) => effect && effect.ruleId === INVESTMENT_CASE_RULE_ID) });
    },

    /** Set the conventions. A value outside its declared bounds is REFUSED, never clamped. */
    investmentCaseSetConventions(patch = {}) {
      const check = seatFor(INVESTMENT_CASE_RIGHTS.GOVERN);
      if (!check.ok) return check;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return fail('Investment-case conventions must be supplied as a plain object. Nothing was saved.', 'settings');
      const names = new Map(Object.entries(INVESTMENT_CASE_SETTING_KEYS).map(([name, key]) => [key, name]));
      const keys = Object.keys(patch);
      if (!keys.length) return fail('State at least one investment-case convention to update. Nothing was saved.', 'settings');
      for (const key of keys) {
        const name = names.get(key);
        if (!name) return fail(`“${key}” is not a declared investment-case convention. Nothing was saved.`, key);
        if (name === 'autoPropagate') {
          if (typeof patch[key] !== 'boolean') return fail(`${INVESTMENT_CASE_SETTING_LABELS.autoPropagate} must be true or false. Nothing was saved.`, key);
        } else {
          const [min, max] = INVESTMENT_CASE_BOUNDS[name];
          if (!Number.isInteger(patch[key]) || patch[key] < min || patch[key] > max) {
            return fail(`${INVESTMENT_CASE_SETTING_LABELS[name]} must be a whole number from ${min} to ${max}. Nothing was clamped and nothing was saved.`, key);
          }
        }
      }
      const next = normalizeInvestmentCaseSettings({ ...settings(), ...patch });
      store.update((draft) => { draft.settings = { ...(draft.settings || {}), ...next }; }, {
        type: INVESTMENT_CASE_EVENTS.CONVENTIONS,
        entity: 'settings',
        entityId: INVESTMENT_CASE_HREF,
        summary: `Investment-case conventions set: ask window ${next.investmentCaseAskDueDays} d, automation ${next.investmentCaseAutoPropagate ? 'on' : 'off'}.`.slice(0, 300),
      });
      return saved({ conventions: next });
    },
  };
}
