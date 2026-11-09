/**
 * app/core/domain/contradictionActions.js — the commands of the Cross-Line
 * Contradiction Audit (ADR-0144, Schema v121).
 *
 * SEVEN human writes, every one dated, span-checked and refused with a printed
 * reason. There is deliberately no eighth that rules on a contradiction for the
 * chief, and none that edits a line's charter behind its manager's back.
 *
 *   contradictionDeclareMandate  "This line is chartered to move this lever this
 *                                 way, and it carries this share of the
 *                                 scorecard." Refuses a lever outside the
 *                                 declared taxonomy, an undeclared weight, a
 *                                 utilisation target of 100 or above, a claim on
 *                                 an envelope that is not open, a line the seat
 *                                 cannot reach, and an exact duplicate that would
 *                                 double-count a share.
 *
 *   contradictionWithdrawMandate "This charter no longer applies, because…"
 *                                 Append-only; the row stays readable.
 *
 *   contradictionReview          "I am the chief. This is my ruling: run both
 *                                 knowingly, change this one line's charter, or
 *                                 withhold with a reason." The ONLY act that
 *                                 closes a finding, and the only one RULE-CNT-01
 *                                 will issue work from.
 *
 *   contradictionScan            Recompute and let the rule retry anything a cap
 *                                 deferred. Changes no declaration.
 *
 *   contradictionSetConventions  Re-declare the four printed numbers (rank-4+
 *                                 full-access seat only).
 *
 * WHAT NO COMMAND HERE WILL DO
 * ----------------------------
 * It will not compute a severity for the caller, will not rule on a finding that
 * no longer reproduces, will not name a line that is not party to the finding,
 * will not accept a resequence without saying which line must change, and will
 * not overwrite a recorded ruling. Every refusal prints the reason a leader can
 * act on.
 */

import { addDays, dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import {
  buildContradictionAudit,
  contradictionBriefText,
  contradictionCsvRows,
} from './contradictionAudit.js';
import { normalizeContradictionSettings } from './contradictionSchema.js';
import {
  CONTRADICTION_BOUNDS,
  CONTRADICTION_DIRECTION_KEYS,
  CONTRADICTION_EVENTS,
  CONTRADICTION_FULL_BP,
  CONTRADICTION_LIMITS,
  CONTRADICTION_LEVER_KEYS,
  CONTRADICTION_SCAN_EVENT,
  CONTRADICTION_VERDICT_KEYS,
  contradictionLever,
} from './contradictionRegistry.js';

const MIN_RATIONALE = 20;

export function createContradictionActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const saved = (extra = {}) => ({
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
    ok: true,
  });

  const seatFor = (right) => {
    const at = clock();
    const cfg = settings();
    const built = buildSeats(store.state, {
      now: at,
      settings: cfg,
      lineScope: matrixLineScopeFor(store.state, { now: at, settings: cfg }),
    });
    const seat = activeSeat(built);
    if (seat.readOnly) {
      return fail('The declared seat is unresolved and read-only. Choose a valid seat before declaring a charter or ruling on a contradiction.');
    }
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason);
    return { ok: true, seat, built };
  };

  const mandates = () => (Array.isArray(store.state.lineMandates) ? store.state.lineMandates : []);
  const reviews = () => (Array.isArray(store.state.contradictionReviews) ? store.state.contradictionReviews : []);
  const goals = () => (Array.isArray(store.state.goals) ? store.state.goals : []);
  const budgets = () => (Array.isArray(store.state.budgets) ? store.state.budgets : []);

  const seatReaches = (seat, id) => {
    if (seat.fullAccess) return true;
    if (!id) return false;
    if (seat.id === id) return true;
    if (seat.scope?.has?.(id)) return true;
    if (seat.lineScope?.has?.(id)) return true;
    return false;
  };

  const readBp = (input, field, { label, required = false, min = 0, max = CONTRADICTION_FULL_BP }) => {
    const raw = input?.[field];
    if (raw === null || raw === undefined || raw === '') {
      return required
        ? { ok: false, error: `State ${label} as a whole number of basis points. A share that is not declared cannot be added to anything.`, field }
        : { ok: true, value: null };
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return { ok: false, error: `${label} must be a whole number of basis points.`, field };
    const rounded = Math.round(n);
    if (rounded < min || rounded > max) return { ok: false, error: `${label} must be between ${min} and ${max} basis points (10000 = 100%).`, field };
    return { ok: true, value: rounded };
  };

  return {
    /* ---------------------------------------------------------------- reads */

    contradictionReport() {
      const check = seatFor('declare-line-mandate');
      if (!check.ok) return check;
      return {
        ok: true,
        report: buildContradictionAudit(store.state, { now: clock(), settings: settings(), seat: check.seat }),
      };
    },

    contradictionBriefText() {
      const check = seatFor('declare-line-mandate');
      if (!check.ok) return check;
      const report = buildContradictionAudit(store.state, { now: clock(), settings: settings(), seat: check.seat });
      return { ok: true, text: contradictionBriefText(report) };
    },

    contradictionCsvRows() {
      const check = seatFor('declare-line-mandate');
      if (!check.ok) return check;
      const report = buildContradictionAudit(store.state, { now: clock(), settings: settings(), seat: check.seat });
      return { ok: true, rows: contradictionCsvRows(report) };
    },

    /** What a chief can declare a charter against: lines, objectives, envelopes. */
    contradictionCandidates() {
      const check = seatFor('declare-line-mandate');
      if (!check.ok) return check;
      const at = clock();
      const cfg = settings();
      const matrix = buildMatrix(store.state, { now: at, settings: cfg });
      const seen = new Map();
      for (const [personId, personLines] of matrix.linesByPerson.entries()) {
        for (const line of personLines) {
          if (!line || line.active === false) continue;
          if (!seatReaches(check.seat, line.managerId)) continue;
          if (!seen.has(line.managerId)) {
            seen.set(line.managerId, {
              managerId: line.managerId,
              name: matrix.nodes.get(line.managerId)?.name || line.managerId,
              peopleN: new Set(),
              kinds: new Set(),
            });
          }
          const entry = seen.get(line.managerId);
          entry.peopleN.add(personId);
          entry.kinds.add(line.kind || 'functional');
        }
      }
      const lines = [...seen.values()].map((entry) => ({
        managerId: entry.managerId,
        name: entry.name,
        peopleN: entry.peopleN.size,
        kinds: [...entry.kinds],
        mandateN: mandates().filter((m) => m && m.lineManagerId === entry.managerId && m.status !== 'withdrawn').length,
      })).sort((a, b) => a.name.localeCompare(b.name));

      const objectives = goals()
        .filter((g) => g && g.status === 'active')
        .map((g) => ({
          id: g.id,
          title: g.title,
          ownerId: g.ownerId || null,
          ownerName: g.ownerId ? (matrix.nodes.get(g.ownerId)?.name || g.ownerId) : null,
        }))
        .sort((a, b) => String(a.title).localeCompare(String(b.title)));

      const envelopes = budgets()
        .filter((b) => b && b.status === 'active')
        .map((b) => ({ id: b.id, name: b.name, currency: b.currency, limit: b.limit }));

      return {
        ok: true,
        lines,
        objectives,
        envelopes,
        levers: CONTRADICTION_LEVER_KEYS.map((key) => contradictionLever(key)),
        directions: CONTRADICTION_DIRECTION_KEYS,
        verdicts: CONTRADICTION_VERDICT_KEYS,
        limits: {
          mandatesPerLine: CONTRADICTION_LIMITS.mandatesPerLine,
          noteChars: CONTRADICTION_LIMITS.noteChars,
          rationaleChars: CONTRADICTION_LIMITS.rationaleChars,
          minRationale: MIN_RATIONALE,
        },
      };
    },

    /* --------------------------------------------------------------- writes */

    contradictionDeclareMandate(input = {}) {
      const check = seatFor('declare-line-mandate');
      if (!check.ok) return check;
      const { seat } = check;

      const lineManagerId = String(input.lineManagerId || '').trim();
      if (!lineManagerId) return fail('Name the line this charter belongs to.', 'lineManagerId');
      const at = clock();
      const cfg = settings();
      const matrix = buildMatrix(store.state, { now: at, settings: cfg });
      if (!matrix.nodes.has(lineManagerId)) {
        return fail('That line manager is not on the active roster or the declared matrix. A charter attached to nobody cannot be compared with anything.', 'lineManagerId');
      }
      if (!seatReaches(seat, lineManagerId)) {
        return fail('That line is outside this seat’s span, on the tree and on every declared line. A charter declared about a line you cannot see is not a declaration you can make.', 'lineManagerId');
      }

      const lever = CONTRADICTION_LEVER_KEYS.includes(input.lever) ? input.lever : null;
      if (!lever) return fail('Choose a lever from the declared taxonomy. A free-text metric cannot be compared with another line’s metric, and the audit refuses to guess which lever it meant.', 'lever');
      const direction = CONTRADICTION_DIRECTION_KEYS.includes(input.direction) ? input.direction : null;
      if (!direction) return fail('Declare whether this charter moves the lever up or down. A lever with no declared direction contradicts nothing and supports nothing.', 'direction');

      const objectiveId = String(input.objectiveId || '').trim() || null;
      if (objectiveId && !goals().some((g) => g && g.id === objectiveId)) {
        return fail('That objective is not on the goal register. A charter points at a real objective or at none — it never invents one.', 'objectiveId');
      }

      const weight = readBp(input, 'weightBp', { label: 'the share of the scorecard this charter carries', required: true, min: 0 });
      if (!weight.ok) return fail(weight.error, 'weightBp');

      let targetValue = null;
      const rawTarget = input.targetValue;
      if (rawTarget !== null && rawTarget !== undefined && rawTarget !== '') {
        const n = Number(rawTarget);
        if (!Number.isFinite(n)) return fail('The declared target must be a whole number in the lever’s own unit.', 'targetValue');
        targetValue = Math.round(n);
        if (targetValue < CONTRADICTION_LIMITS.targetMin || targetValue > CONTRADICTION_LIMITS.targetMax) {
          return fail(`The declared target must be between ${CONTRADICTION_LIMITS.targetMin} and ${CONTRADICTION_LIMITS.targetMax}.`, 'targetValue');
        }
        if (lever === 'utilisation' && (targetValue <= 0 || targetValue >= 100)) {
          return fail('A utilisation target must be between 1 and 99 percent. At 100% the queueing multiplier is unbounded, which is not a target anyone can plan against.', 'targetValue');
        }
      } else if (lever === 'utilisation') {
        // Not an error: the declaration is allowed, and the audit prints the
        // missing figure as `insufficient` rather than assuming a favourable one.
      }

      const envelopeId = String(input.envelopeId || '').trim() || null;
      let envelopeClaimBp = null;
      if (envelopeId) {
        const envelope = budgets().find((b) => b && b.id === envelopeId);
        if (!envelope) return fail('That budget envelope is not on the register. A claim measured against an envelope that does not exist is a claim on nothing.', 'envelopeId');
        if (envelope.status !== 'active') return fail(`Envelope “${envelope.name}” is ${envelope.status}, not active. Claims are only compared on envelopes that are still open.`, 'envelopeId');
        const claim = readBp(input, 'envelopeClaimBp', { label: 'the share of that envelope this line claims', required: true, min: 1 });
        if (!claim.ok) return fail(claim.error, 'envelopeClaimBp');
        envelopeClaimBp = claim.value;
      } else if (input.envelopeClaimBp !== null && input.envelopeClaimBp !== undefined && input.envelopeClaimBp !== '') {
        return fail('Name the envelope a claim is against. A share with no envelope cannot be compared with another line’s claim.', 'envelopeId');
      }

      /* Refuse an exact duplicate: two identical charters would double the weight
         and manufacture a contradiction the leader never declared. */
      const todayKey = dayKey(at);
      const liveCharter = (m) => m
        && m.status !== 'withdrawn'
        && (!m.effectiveFrom || m.effectiveFrom <= todayKey)
        && (!m.effectiveTo || m.effectiveTo >= todayKey);
      const duplicate = mandates().find((m) => liveCharter(m)
        && m.lineManagerId === lineManagerId
        && m.lever === lever
        && m.direction === direction
        && (m.objectiveId || null) === objectiveId);
      if (duplicate) {
        return fail('This line already carries exactly this charter. Edit or withdraw the existing row instead of declaring a second one — two identical rows would double-count its share of the scorecard.', 'lever');
      }

      const liveForLine = mandates().filter((m) => m
        && m.status !== 'withdrawn'
        && m.lineManagerId === lineManagerId
        && (!m.effectiveTo || m.effectiveTo >= dayKey(at))).length;
      if (liveForLine >= CONTRADICTION_LIMITS.mandatesPerLine) {
        return fail(`This line already carries ${liveForLine} live charters, the declared maximum. Withdraw the ones that no longer apply before adding more — an audit over twenty-five objectives on one line is a plan, not a charter.`, 'lineManagerId');
      }

      const note = String(input.note || '').trim().slice(0, CONTRADICTION_LIMITS.noteChars);
      const effectiveFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(input.effectiveFrom || '')) ? String(input.effectiveFrom) : dayKey(at);
      const effectiveTo = /^\d{4}-\d{2}-\d{2}$/.test(String(input.effectiveTo || '')) ? String(input.effectiveTo) : null;
      if (effectiveTo && effectiveTo < effectiveFrom) {
        return fail('The declared window ends before it starts.', 'effectiveTo');
      }

      const mandateId = idFactory('mand');
      store.update((draft) => {
        draft.lineMandates = Array.isArray(draft.lineMandates) ? draft.lineMandates : [];
        draft.lineMandates.unshift({
          id: mandateId,
          lineManagerId,
          objectiveId,
          lever,
          direction,
          weightBp: weight.value,
          targetValue,
          envelopeId,
          envelopeClaimBp,
          effectiveFrom,
          effectiveTo,
          note,
          status: 'active',
          withdrawnOn: null,
          withdrawReason: '',
          declaredOn: dayKey(at),
          declaredBySeatId: seat.fullAccess ? null : seat.id,
          createdAt: at.toISOString(),
          updatedAt: at.toISOString(),
        });
      }, {
        type: CONTRADICTION_EVENTS.DECLARE,
        entity: 'contradiction',
        entityId: mandateId,
        summary: `Line charter declared: ${lever} ${direction}, ${weight.value} bp of the scorecard${envelopeId ? `, ${envelopeClaimBp} bp of an envelope` : ''}.`.slice(0, 300),
      });
      return saved({ id: mandateId, lineId: lineManagerId, lever, direction, weightBp: weight.value });
    },

    contradictionWithdrawMandate(input = {}) {
      const check = seatFor('declare-line-mandate');
      if (!check.ok) return check;
      const { seat } = check;
      const mandateId = String(input.mandateId || '').trim();
      const mandate = mandates().find((m) => m && m.id === mandateId);
      if (!mandate) return fail('That charter no longer exists.', 'mandateId');
      if (mandate.status === 'withdrawn') return fail('That charter is already withdrawn. The record is append-only.', 'mandateId');
      if (!seatReaches(seat, mandate.lineManagerId)) return fail('That charter belongs to a line outside this seat’s span.', 'mandateId');
      const reason = String(input.reason || '').trim().slice(0, CONTRADICTION_LIMITS.reasonChars);
      if (!reason) return fail('Record why the charter is withdrawn. A charter that disappears without a reason leaves the contradiction it caused unexplained.', 'reason');

      const at = clock();
      store.update((draft) => {
        const target = (draft.lineMandates || []).find((m) => m && m.id === mandateId);
        if (!target) return;
        target.status = 'withdrawn';
        target.withdrawnOn = dayKey(at);
        target.withdrawReason = reason;
        target.updatedAt = at.toISOString();
      }, {
        type: CONTRADICTION_EVENTS.WITHDRAW,
        entity: 'contradiction',
        entityId: mandateId,
        summary: `Line charter withdrawn: ${reason}`.slice(0, 300),
      });
      return saved({ id: mandateId });
    },

    /**
     * Record the chief's ruling on one derived finding. Every field describing
     * the FINDING is re-derived here from the same engine the panel used, so a
     * caller cannot file a ruling against a subject the finding does not name.
     */
    contradictionReview(input = {}) {
      const check = seatFor('review-contradiction');
      if (!check.ok) return check;
      const { seat } = check;

      const findingKey = String(input.findingKey || '').trim();
      if (!findingKey) return fail('Name the finding this ruling is about.', 'findingKey');
      const verdict = CONTRADICTION_VERDICT_KEYS.includes(input.verdict) ? input.verdict : null;
      if (!verdict) return fail('Choose a verdict: run both knowingly, change one line’s charter, or withhold with a reason.', 'verdict');
      const rationale = String(input.rationale || '').trim().slice(0, CONTRADICTION_LIMITS.rationaleChars);
      if (rationale.length < MIN_RATIONALE) {
        return fail(`Record the reasoning in at least ${MIN_RATIONALE} characters. A ruling without a reason cannot be told apart from a preference six months from now.`, 'rationale');
      }

      const at = clock();
      const report = buildContradictionAudit(store.state, { now: at, settings: settings(), seat });
      const finding = (report.allFindings || []).find((f) => f.key === findingKey);
      if (!finding) {
        return fail('That finding no longer reproduces from the current declarations. Reload the audit before ruling: a verdict recorded against a contradiction that has changed is a verdict about a different problem.', 'findingKey');
      }

      const subjectType = finding.kind === 'incentive-oversubscription'
        ? 'person'
        : finding.kind === 'envelope-overclaim' ? 'envelope' : 'lines';
      let resequenceLineId = null;
      if (verdict === 'resequenced') {
        resequenceLineId = String(input.resequenceLineId || '').trim() || null;
        const partyIds = subjectType === 'person'
          ? (finding.lineIds || [])
          : subjectType === 'envelope'
            ? (finding.claimantLineIds || [finding.lineAId, finding.lineBId]).filter(Boolean)
            : [finding.lineAId, finding.lineBId].filter(Boolean);
        if (!resequenceLineId) {
          return fail('A resequence must name the line that changes. "One of them should change" is the problem, not the ruling.', 'resequenceLineId');
        }
        if (!partyIds.includes(resequenceLineId)) {
          return fail('The named line is not party to this finding. Only a line whose charter produced the contradiction can be told to revise it.', 'resequenceLineId');
        }
        if (subjectType === 'person' && partyIds.length < 2) {
          return fail('This finding has fewer than two lines, so there is no cross-line contradiction to resequence.', 'resequenceLineId');
        }
      }

      let reviewOn = null;
      const rawReviewOn = String(input.reviewOn || '').trim();
      if (rawReviewOn) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(rawReviewOn)) return fail('The review date must be a calendar day (YYYY-MM-DD).', 'reviewOn');
        if (rawReviewOn <= dayKey(at)) return fail('The review date must be in the future. A ruling that is already due is not a review cycle.', 'reviewOn');
        reviewOn = rawReviewOn;
      }
      const conv = normalizeContradictionSettings(settings());
      if (!reviewOn && verdict !== 'withheld') reviewOn = addDays(dayKey(at), conv.ctrReviewDays);

      const reviewId = idFactory('ctrrev');
      store.update((draft) => {
        draft.contradictionReviews = Array.isArray(draft.contradictionReviews) ? draft.contradictionReviews : [];
        draft.contradictionReviews.unshift({
          id: reviewId,
          findingKey,
          kind: finding.kind,
          subjectType,
          lineAId: subjectType === 'person' ? null : finding.lineAId,
          lineBId: subjectType === 'person' ? null : finding.lineBId,
          personId: subjectType === 'person' ? finding.personId : null,
          lever: [finding.leverA, finding.lever].find((k) => CONTRADICTION_LEVER_KEYS.includes(k)) || null,
          envelopeId: subjectType === 'envelope' ? finding.envelopeId : null,
          verdict,
          rationale,
          decidedOn: dayKey(at),
          decidedBySeatId: seat.fullAccess ? null : seat.id,
          reviewOn,
          resequenceLineId,
          decisionId: null,
          obligationIssued: [],
          createdAt: at.toISOString(),
        });
      }, {
        type: CONTRADICTION_EVENTS.REVIEW,
        entity: 'contradiction',
        entityId: reviewId,
        summary: `Contradiction ruling recorded (${verdict}) for ${finding.kind}.`.slice(0, 300),
      });
      return saved({ id: reviewId, findingKey, verdict, reviewOn });
    },

    contradictionScan() {
      const check = seatFor('review-contradiction');
      if (!check.ok) return check;
      store.update(() => {}, {
        type: CONTRADICTION_SCAN_EVENT,
        entity: 'contradiction',
        entityId: null,
        summary: 'Explicit contradiction scan: recompute findings and retry any obligation a per-transaction cap deferred.',
      });
      return saved({ scanned: true });
    },

    contradictionSetConventions(input = {}) {
      const check = seatFor('set-contradiction-conventions');
      if (!check.ok) return check;
      const { seat } = check;
      if (!seat.fullAccess) {
        return fail('Only a rank-4+ seat with full access may re-declare the audit’s conventions. These numbers decide when a pair reads incompatible, so they are a governance act, not a preference.');
      }
      const patch = {};
      const readClamped = (field, label, bounds) => {
        const raw = input?.[field];
        if (raw === null || raw === undefined || raw === '') return null;
        const n = Number(raw);
        if (!Number.isFinite(n)) return { error: `${label} must be a whole number.` };
        const rounded = Math.round(n);
        if (rounded < bounds.min || rounded > bounds.max) return { error: `${label} must be between ${bounds.min} and ${bounds.max}.` };
        return { value: rounded };
      };
      const ceiling = readClamped('ctrUtilisationCeiling', 'The utilisation ceiling', CONTRADICTION_BOUNDS.utilisationCeiling);
      if (ceiling?.error) return fail(ceiling.error, 'ctrUtilisationCeiling');
      if (ceiling && ceiling.value !== undefined) patch.ctrUtilisationCeiling = ceiling.value;
      const materiality = readClamped('ctrMaterialityBp', 'The materiality floor', CONTRADICTION_BOUNDS.materialityBp);
      if (materiality?.error) return fail(materiality.error, 'ctrMaterialityBp');
      if (materiality && materiality.value !== undefined) patch.ctrMaterialityBp = materiality.value;
      const reviewDays = readClamped('ctrReviewDays', 'The review horizon', CONTRADICTION_BOUNDS.reviewDays);
      if (reviewDays?.error) return fail(reviewDays.error, 'ctrReviewDays');
      if (reviewDays && reviewDays.value !== undefined) patch.ctrReviewDays = reviewDays.value;
      if (input.ctrAutoPropagate !== undefined && input.ctrAutoPropagate !== null && input.ctrAutoPropagate !== '') {
        patch.ctrAutoPropagate = input.ctrAutoPropagate !== false && input.ctrAutoPropagate !== 'false';
      }
      if (!Object.keys(patch).length) return fail('Nothing to re-declare. Set at least one convention, or leave the printed defaults in place.');

      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...patch };
      }, {
        type: CONTRADICTION_EVENTS.CONVENTIONS,
        entity: 'contradiction',
        entityId: null,
        summary: `Contradiction conventions re-declared: ${Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(', ')}.`.slice(0, 300),
      });
      return saved({ conventions: normalizeContradictionSettings({ ...settings(), ...patch }) });
    },

    /* Reviews are already a safe read through the report; this exposes the raw
       ledger only to a seat that may act on it. */
    contradictionReviews() {
      const check = seatFor('review-contradiction');
      if (!check.ok) return check;
      return { ok: true, reviews: reviews().slice(0, CONTRADICTION_LIMITS.reviewsKept) };
    },
  };
}
