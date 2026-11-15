/**
 * app/core/domain/portfolioReviewActions.js — seat-checked commands and reads
 * of the Enterprise Portfolio Review Register (ADR-0222, Schema v177,
 * `#/portfolio-review`).
 *
 * SIX HUMAN COMMANDS + SCAN + THREE READS
 *   - `portfolioDeclareUnit`     — CEO (rank 5) declares a business unit with
 *                                  its owning line, currency, review due date,
 *                                  and written basis;
 *   - `portfolioRetireUnit`      — CEO (rank 5) retires a unit with a dated
 *                                  written reason;
 *   - `portfolioRecordReview`    — executive owning line (or seat >= rank 4
 *                                  above it) records a dated review with
 *                                  measured cents and cited evidence;
 *   - `portfolioRecordVerdict`   — CEO (rank 5) records keep / fix / sell /
 *                                  exit with a dated rationale; fix carries a
 *                                  re-review date, sell/exit carry expected
 *                                  proceeds and an expected date;
 *   - `portfolioRecordMilestone` — director+ owning line (or above, rank >= 3)
 *                                  adds or updates/completes a verdict
 *                                  milestone;
 *   - `portfolioCompleteExit`    — CEO (rank 5) closes a sell/exit verdict on
 *                                  dated settlement evidence and exact actual
 *                                  proceeds once all milestones are done;
 *   - `portfolioScan`            — re-evaluates `RULE-PRV-01` (pause-governed).
 */

import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import {
  buildPortfolioReview,
  isHolderOrAbove,
  portfolioReviewAttentionCount as portfolioAttentionCount,
  portfolioReviewCandidates as portfolioCandidates,
  portfolioReviewMatrix,
} from './portfolioReview.js';
import {
  PRV_EVIDENCE_KIND_KEYS,
  PRV_LIMITS as L,
  PRV_RIGHTS,
  PRV_ROUTE,
  PRV_RULE_ID,
  PRV_VERDICT_KEYS,
} from './portfolioReviewRegistry.js';
import {
  normalizePortfolioExits,
  normalizePortfolioMilestones,
  normalizePortfolioReviews,
  normalizePortfolioUnits,
  normalizePortfolioVerdicts,
  parsePrvMoneyToCents,
  prvCurrency,
  prvDay,
  prvId,
  prvPersonId,
  prvText,
} from './portfolioReviewSchema.js';

const REFUSAL = (key) => `portfolioReview:${key}`;

export const PRV_EVENTS = Object.freeze({
  UNIT_DECLARED: 'portfolioReview.unit.declared',
  UNIT_RETIRED: 'portfolioReview.unit.retired',
  REVIEW_RECORDED: 'portfolioReview.review.recorded',
  VERDICT_RECORDED: 'portfolioReview.verdict.recorded',
  MILESTONE_RECORDED: 'portfolioReview.milestone.recorded',
  EXIT_COMPLETED: 'portfolioReview.exit.completed',
  SCANNED: 'portfolioReview.scanned',
});

export function createPortfolioReviewActions(store, { now, idFactory }) {
  const fail = (error, field = null, refusal = null) => ({
    ok: false,
    error,
    ...(field ? { field } : {}),
    ...(refusal ? { refusal } : {}),
  });
  const clock = () => (now() instanceof Date ? now() : new Date(now() || Date.now()));
  const settings = () => store.state.settings || {};
  const rows = (key) => (Array.isArray(store.state[key]) ? store.state[key] : []);
  const saved = (extra = {}) => ({
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
    ok: true,
  });

  function seatFor(right) {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    const seat = activeSeat(built);
    if (seat.readOnly) {
      return fail('Resolve the operating seat before acting on the Portfolio Review Register.', null, REFUSAL('not-seated'));
    }
    const verdict = canAct(right, seat);
    if (!verdict.allow) return fail(verdict.reason, null, REFUSAL('rank-denied'));
    return {
      ok: true,
      seat,
      at,
      cfg,
      actorId: seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null),
      today: dayKey(at),
    };
  }

  function readSeat() {
    const at = clock();
    const cfg = settings();
    const lineScope = matrixLineScopeFor(store.state, { now: at, settings: cfg });
    const built = buildSeats(store.state, { now: at, settings: cfg, lineScope });
    return { seat: activeSeat(built), at, cfg };
  }

  function readCheck() {
    const resolved = readSeat();
    if (resolved.seat.readOnly) {
      return fail('Resolve the operating seat before reading the Portfolio Review Register.', null, REFUSAL('not-seated'));
    }
    const verdict = canAct(PRV_RIGHTS.READ, resolved.seat);
    if (!verdict.allow) return fail(verdict.reason, null, REFUSAL('rank-denied'));
    return { ok: true, ...resolved };
  }

  function liveGraph(check) {
    const built = portfolioReviewMatrix(store.state, check.at, check.cfg);
    if (built.error || !built.matrix) {
      return fail(
        `The reporting graph could not be resolved, so portfolio ownership cannot be proved. Nothing was saved. (${built.error || 'matrix-error'})`,
        null,
        REFUSAL('graph-unreadable'),
      );
    }
    return { ok: true, matrix: built.matrix };
  }

  return {
    /* ----------------------------------------------------- 1. declare unit */

    portfolioDeclareUnit(input = {}) {
      const check = seatFor(PRV_RIGHTS.DECLARE);
      if (!check.ok) return check;
      if (!input || typeof input !== 'object') return fail('Provide the unit details.', 'input');

      const name = prvText(input.name, L.labelMax + 1);
      if (name.length < L.labelMin || name.length > L.labelMax) {
        return fail(`Unit name must be ${L.labelMin} to ${L.labelMax} characters.`, 'name', REFUSAL('invalid-name'));
      }
      const owningLineHolderId = prvPersonId(input.owningLineHolderId);
      if (!owningLineHolderId) {
        return fail('Name the manager whose line owns this business unit.', 'owningLineHolderId', REFUSAL('missing-owner'));
      }
      const currency = prvCurrency(input.currency);
      if (!currency) return fail('Provide a 3-letter ISO currency code (e.g. DKK, EUR, USD).', 'currency', REFUSAL('invalid-currency'));

      const g = liveGraph(check);
      if (!g.ok) return g;
      if (!g.matrix.nodes?.has(owningLineHolderId)) {
        return fail('The named owning line holder is not on the active roster.', 'owningLineHolderId', REFUSAL('owner-off-roster'));
      }

      const reviewDueOn = prvDay(input.reviewDueOn);
      if (!reviewDueOn || reviewDueOn < check.today) {
        return fail('Review due date must be a valid calendar day not in the past.', 'reviewDueOn', REFUSAL('invalid-review-due'));
      }
      const declaredOn = input.declaredOn === undefined ? check.today : prvDay(input.declaredOn);
      if (!declaredOn || declaredOn > check.today) {
        return fail('Declaration date must be a valid calendar day not in the future.', 'declaredOn', REFUSAL('future-declared-on'));
      }
      const basis = prvText(input.basis, L.basisMax + 1);
      if (basis.length < L.basisMin || basis.length > L.basisMax) {
        return fail(`State the unit boundary basis in ${L.basisMin} to ${L.basisMax} characters.`, 'basis', REFUSAL('invalid-basis'));
      }

      const existing = normalizePortfolioUnits(rows('portfolioUnits'), []);
      if (existing.length >= L.unitsMax) {
        return fail(`The register holds at most ${L.unitsMax} units.`, null, REFUSAL('cap-exceeded'));
      }
      const duplicate = existing.some((u) => !u.retiredOn
        && u.owningLineHolderId === owningLineHolderId
        && u.name.toLowerCase() === name.toLowerCase());
      if (duplicate) {
        return fail('A live unit with the same name and owning line is already on the record.', 'name', REFUSAL('duplicate-unit'));
      }

      const unitId = idFactory('prvu');
      const candidate = {
        id: unitId,
        name,
        owningLineHolderId,
        currency,
        reviewDueOn,
        declaredOn,
        declaredById: check.actorId,
        basis,
        retiredOn: null,
        retiredById: '',
        retirementReason: '',
      };
      const verified = normalizePortfolioUnits([candidate], []);
      if (verified.length !== 1) {
        return fail('The unit failed schema verification and was not saved.', null, REFUSAL('schema-rejected'));
      }

      store.update((draft) => {
        if (!Array.isArray(draft.portfolioUnits)) draft.portfolioUnits = [];
        draft.portfolioUnits.push(verified[0]);
      }, {
        type: PRV_EVENTS.UNIT_DECLARED,
        entity: 'portfolioUnit',
        entityId: unitId,
        summary: `Business unit declared on the Portfolio Review Register (review due ${reviewDueOn}).`,
      });
      return saved({ unitId, unit: verified[0] });
    },

    /* ----------------------------------------------------- 2. retire unit */

    portfolioRetireUnit(unitIdInput, input = {}) {
      const check = seatFor(PRV_RIGHTS.VERDICT);
      if (!check.ok) return check;
      const unitId = prvId(unitIdInput);
      if (!unitId) return fail('Name the unit to retire.', 'unitId', REFUSAL('missing-unit-id'));

      const loaded = normalizePortfolioUnits(rows('portfolioUnits'), []);
      const unit = loaded.find((u) => u.id === unitId);
      if (!unit) return fail('That unit is not on the record.', 'unitId', REFUSAL('unit-not-found'));
      if (unit.retiredOn) return fail('That unit has already been retired.', 'unitId', REFUSAL('unit-already-retired'));
      const verdicts = normalizePortfolioVerdicts(rows('portfolioVerdicts'), []);
      const exits = normalizePortfolioExits(rows('portfolioExits'), []);
      const latestVerdict = verdicts.filter((v) => v.unitId === unitId).sort((a, b) => a.decidedOn.localeCompare(b.decidedOn)).at(-1);
      if (latestVerdict && exits.some((e) => e.verdictId === latestVerdict.id)) {
        return fail('That unit’s sell/exit verdict has already completed settlement.', 'unitId', REFUSAL('exit-already-completed'));
      }

      const retiredOn = input?.retiredOn === undefined ? check.today : prvDay(input.retiredOn);
      if (!retiredOn || retiredOn < unit.declaredOn || retiredOn > check.today) {
        return fail('Retirement date must lie between the declaration date and today.', 'retiredOn', REFUSAL('invalid-retired-on'));
      }
      const retirementReason = prvText(input?.reason ?? input?.retirementReason, L.reasonMax + 1);
      if (retirementReason.length < L.reasonMin || retirementReason.length > L.reasonMax) {
        return fail(`State the retirement reason in ${L.reasonMin} to ${L.reasonMax} characters.`, 'reason', REFUSAL('invalid-reason'));
      }

      const updated = { ...unit, retiredOn, retiredById: check.actorId, retirementReason };
      const verified = normalizePortfolioUnits([updated], []);
      if (verified.length !== 1) {
        return fail('The retirement failed schema verification and was not saved.', null, REFUSAL('schema-rejected'));
      }

      store.update((draft) => {
        draft.portfolioUnits = (draft.portfolioUnits || []).map((row) => (
          row?.id === unitId ? verified[0] : row
        ));
      }, {
        type: PRV_EVENTS.UNIT_RETIRED,
        entity: 'portfolioUnit',
        entityId: unitId,
        summary: `Business unit retired on the Portfolio Review Register, effective ${retiredOn}.`,
      });
      return saved({ unitId, unit: verified[0] });
    },

    /* ---------------------------------------------------- 3. record review */

    portfolioRecordReview(unitIdInput, input = {}) {
      const check = seatFor(PRV_RIGHTS.REVIEW);
      if (!check.ok) return check;
      const unitId = prvId(unitIdInput);
      if (!unitId) return fail('Name the unit this review belongs to.', 'unitId', REFUSAL('missing-unit-id'));

      const units = normalizePortfolioUnits(rows('portfolioUnits'), []);
      const unit = units.find((u) => u.id === unitId);
      if (!unit) return fail('That unit is not on the record.', 'unitId', REFUSAL('unit-not-found'));
      if (unit.retiredOn) return fail('Cannot review a retired unit.', 'unitId', REFUSAL('unit-retired'));
      const verdictsForUnit = normalizePortfolioVerdicts(rows('portfolioVerdicts'), []).filter((v) => v.unitId === unitId);
      const exits = normalizePortfolioExits(rows('portfolioExits'), []);
      const latestV = verdictsForUnit.sort((a, b) => a.decidedOn.localeCompare(b.decidedOn)).at(-1);
      if (latestV && exits.some((e) => e.verdictId === latestV.id)) {
        return fail('Cannot record a review on a unit whose exit has already completed settlement.', 'unitId', REFUSAL('exit-already-completed'));
      }

      const g = liveGraph(check);
      if (!g.ok) return g;
      if (!check.seat.fullAccess && !isHolderOrAbove(g.matrix, check.actorId, unit.owningLineHolderId)) {
        return fail(
          'Only the owning line holder (or a seat strictly above them) may review this unit; a verdict needs evidence from the line that owns it.',
          'unitId',
          REFUSAL('not-owning-line'),
        );
      }

      const assessedOn = input.assessedOn === undefined ? check.today : prvDay(input.assessedOn);
      if (!assessedOn || assessedOn > check.today) {
        return fail('Assessment date must be a valid calendar day not in the future.', 'assessedOn', REFUSAL('future-assessed-on'));
      }
      const basis = prvText(input.basis, L.basisMax + 1);
      if (basis.length < L.basisMin || basis.length > L.basisMax) {
        return fail(`State the review basis in ${L.basisMin} to ${L.basisMax} characters.`, 'basis', REFUSAL('invalid-basis'));
      }
      const measuredCents = parsePrvMoneyToCents(input.amount, { allowZero: true });
      if (measuredCents === null) {
        return fail('Enter the measured value with at most 2 decimal places (no commas or rounding); zero is allowed for a unit measured at nothing.', 'amount', REFUSAL('invalid-amount'));
      }
      const evidenceKind = prvText(input.evidenceKind, 32);
      const evidenceId = prvText(input.evidenceId, L.evidenceIdMax + 1);
      if (!PRV_EVIDENCE_KIND_KEYS.includes(evidenceKind) || !evidenceId || evidenceId.length > L.evidenceIdMax) {
        return fail('Cite a valid evidence kind and identifier for this review.', 'evidenceId', REFUSAL('missing-evidence'));
      }

      const existing = normalizePortfolioReviews(rows('portfolioReviews'), []);
      if (existing.length >= L.reviewsMax) {
        return fail(`The register holds at most ${L.reviewsMax} reviews.`, null, REFUSAL('cap-exceeded'));
      }
      const reviewId = idFactory('prvr');
      const candidate = {
        id: reviewId,
        unitId,
        assessedOn,
        assessedById: check.actorId,
        basis,
        measuredCents,
        evidenceKind,
        evidenceId,
      };
      const verified = normalizePortfolioReviews([candidate], []);
      if (verified.length !== 1) {
        return fail('The review failed schema verification and was not saved.', null, REFUSAL('schema-rejected'));
      }

      store.update((draft) => {
        if (!Array.isArray(draft.portfolioReviews)) draft.portfolioReviews = [];
        draft.portfolioReviews.push(verified[0]);
      }, {
        type: PRV_EVENTS.REVIEW_RECORDED,
        entity: 'portfolioReview',
        entityId: reviewId,
        summary: `Dated review recorded on the Portfolio Review Register, effective ${assessedOn}.`,
      });
      return saved({ reviewId, review: verified[0] });
    },

    /* --------------------------------------------------- 4. record verdict */

    portfolioRecordVerdict(unitIdInput, input = {}) {
      const check = seatFor(PRV_RIGHTS.VERDICT);
      if (!check.ok) return check;
      const unitId = prvId(unitIdInput);
      if (!unitId) return fail('Name the unit this verdict belongs to.', 'unitId', REFUSAL('missing-unit-id'));

      const verdict = prvText(input.verdict, 16);
      if (!PRV_VERDICT_KEYS.includes(verdict)) {
        return fail('Choose a valid verdict: keep, fix, sell, or exit.', 'verdict', REFUSAL('invalid-verdict'));
      }

      const units = normalizePortfolioUnits(rows('portfolioUnits'), []);
      const unit = units.find((u) => u.id === unitId);
      if (!unit) return fail('That unit is not on the record.', 'unitId', REFUSAL('unit-not-found'));
      if (unit.retiredOn) return fail('Cannot verdict a retired unit.', 'unitId', REFUSAL('unit-retired'));
      const existingVerdicts = normalizePortfolioVerdicts(rows('portfolioVerdicts'), []);
      const existingExits = normalizePortfolioExits(rows('portfolioExits'), []);
      const priorVerdict = existingVerdicts.filter((v) => v.unitId === unitId).sort((a, b) => a.decidedOn.localeCompare(b.decidedOn)).at(-1);
      if (priorVerdict && existingExits.some((e) => e.verdictId === priorVerdict.id)) {
        return fail('That unit has already completed exit settlement and cannot be re-verdicted.', 'unitId', REFUSAL('exit-already-completed'));
      }

      const reviews = normalizePortfolioReviews(rows('portfolioReviews'), []);
      const review = reviews.filter((r) => r.unitId === unitId && r.assessedOn <= check.today)
        .sort((a, b) => a.assessedOn.localeCompare(b.assessedOn)).at(-1);
      if (!review) {
        return fail('A verdict must rest on a dated review; record a review for this unit first.', 'unitId', REFUSAL('no-review-on-record'));
      }

      const decidedOn = input.decidedOn === undefined ? check.today : prvDay(input.decidedOn);
      if (!decidedOn || decidedOn > check.today) {
        return fail('Decision date must be a valid calendar day not in the future.', 'decidedOn', REFUSAL('future-decided-on'));
      }
      if (decidedOn < review.assessedOn) return fail('A verdict cannot predate its review.', 'decidedOn');
      const g = liveGraph(check);
      if (!g.ok) return g;
      const rationale = prvText(input.rationale, L.rationaleMax + 1);
      if (rationale.length < L.rationaleMin || rationale.length > L.rationaleMax) {
        return fail(`State the verdict rationale in ${L.rationaleMin} to ${L.rationaleMax} characters.`, 'rationale', REFUSAL('invalid-rationale'));
      }

      let expectedProceedsCents = null;
      let expectedOn = null;
      let reReviewOn = null;

      if (verdict === 'keep') {
        if ((input.amount !== undefined && input.amount !== null && input.amount !== '')
          || (input.expectedOn !== undefined && input.expectedOn !== null && input.expectedOn !== '')
          || (input.reReviewOn !== undefined && input.reReviewOn !== null && input.reReviewOn !== '')) {
          return fail('A keep verdict carries no proceeds, expected date, or re-review date.', 'verdict', REFUSAL('unexpected-fields'));
        }
      } else if (verdict === 'fix') {
        if ((input.amount !== undefined && input.amount !== null && input.amount !== '')
          || (input.expectedOn !== undefined && input.expectedOn !== null && input.expectedOn !== '')) {
          return fail('A fix verdict carries a re-review date, not proceeds or an expected date.', 'verdict', REFUSAL('unexpected-fields'));
        }
        reReviewOn = prvDay(input.reReviewOn);
        if (!reReviewOn || reReviewOn <= decidedOn) {
          return fail('A fix verdict requires a re-review date after the decision date.', 'reReviewOn', REFUSAL('invalid-re-review'));
        }
      } else if (verdict === 'sell' || verdict === 'exit') {
        if (input.reReviewOn !== undefined && input.reReviewOn !== null && input.reReviewOn !== '') {
          return fail(`A ${verdict} verdict carries proceeds and an expected date, not a re-review date.`, 'verdict', REFUSAL('unexpected-fields'));
        }
        expectedProceedsCents = parsePrvMoneyToCents(input.amount, { allowZero: true });
        if (expectedProceedsCents === null) {
          return fail('Enter the expected proceeds with at most 2 decimal places (no commas or rounding); zero is allowed for a wind-down.', 'amount', REFUSAL('invalid-amount'));
        }
        expectedOn = prvDay(input.expectedOn);
        if (!expectedOn || expectedOn <= decidedOn) {
          return fail(`A ${verdict} verdict requires an expected date after the decision date.`, 'expectedOn', REFUSAL('invalid-expected-on'));
        }
      }

      const existing = normalizePortfolioVerdicts(rows('portfolioVerdicts'), []);
      if (existing.length >= L.verdictsMax) {
        return fail(`The register holds at most ${L.verdictsMax} verdicts.`, null, REFUSAL('cap-exceeded'));
      }
      const verdictId = idFactory('prvv');
      const candidate = {
        id: verdictId,
        unitId,
        verdict,
        reviewId: review.id,
        decidedOn,
        decidedById: check.actorId,
        rationale,
        expectedProceedsCents,
        expectedOn,
        reReviewOn,
      };
      const verified = normalizePortfolioVerdicts([candidate], []);
      if (verified.length !== 1) {
        return fail('The verdict failed schema verification and was not saved.', null, REFUSAL('schema-rejected'));
      }

      store.update((draft) => {
        if (!Array.isArray(draft.portfolioVerdicts)) draft.portfolioVerdicts = [];
        draft.portfolioVerdicts.push(verified[0]);
      }, {
        type: PRV_EVENTS.VERDICT_RECORDED,
        entity: 'portfolioVerdict',
        entityId: verdictId,
        summary: `Portfolio verdict (${verdict}) recorded on the Portfolio Review Register, effective ${decidedOn}.`,
      });
      return saved({ verdictId, verdict: verified[0] });
    },

    /* ------------------------------------------------- 5. record milestone */

    portfolioRecordMilestone(verdictIdInput, input = {}) {
      const check = seatFor(PRV_RIGHTS.TRACK);
      if (!check.ok) return check;
      const verdictId = prvId(verdictIdInput);
      if (!verdictId) return fail('Name the verdict this milestone belongs to.', 'verdictId', REFUSAL('missing-verdict-id'));

      const verdicts = normalizePortfolioVerdicts(rows('portfolioVerdicts'), []);
      const verdict = verdicts.find((v) => v.id === verdictId);
      if (!verdict) return fail('That verdict is not on the record.', 'verdictId', REFUSAL('verdict-not-found'));

      const units = normalizePortfolioUnits(rows('portfolioUnits'), []);
      const unit = units.find((u) => u.id === verdict.unitId);
      if (!unit) return fail('The parent unit for this verdict is missing.', 'verdictId', REFUSAL('unit-not-found'));
      if (unit.retiredOn) return fail('Cannot track milestones on a retired unit.', 'verdictId', REFUSAL('unit-retired'));
      const exits = normalizePortfolioExits(rows('portfolioExits'), []);
      if (exits.some((e) => e.verdictId === verdict.id)) {
        return fail('Cannot modify milestones after sell/exit settlement is completed.', 'verdictId', REFUSAL('exit-already-completed'));
      }

      const g = liveGraph(check);
      if (!g.ok) return g;
      if (!check.seat.fullAccess && !isHolderOrAbove(g.matrix, check.actorId, unit.owningLineHolderId)) {
        return fail(
          'Only the owning line holder (or a seat strictly above them) may track this verdict’s milestones.',
          'verdictId',
          REFUSAL('not-owning-line'),
        );
      }

      const label = prvText(input.label, L.labelMax + 1);
      if (label.length < L.labelMin || label.length > L.labelMax) {
        return fail(`Milestone label must be ${L.labelMin} to ${L.labelMax} characters.`, 'label', REFUSAL('invalid-label'));
      }
      const dueOn = prvDay(input.dueOn);
      if (!dueOn || dueOn < verdict.decidedOn) {
        return fail('Milestone due date must lie on or after the verdict decision date.', 'dueOn', REFUSAL('invalid-due-on'));
      }
      const doneOn = input.doneOn === undefined || input.doneOn === null || input.doneOn === ''
        ? null : prvDay(input.doneOn);
      if (input.doneOn !== undefined && input.doneOn !== null && input.doneOn !== '' && (!doneOn || doneOn > check.today)) {
        return fail('Completion date must be a valid calendar day not in the future.', 'doneOn', REFUSAL('invalid-done-on'));
      }
      if (doneOn && doneOn < verdict.decidedOn) return fail('Completion cannot predate the verdict.', 'doneOn');
      const note = prvText(input.note, L.noteMax);

      const existing = normalizePortfolioMilestones(rows('portfolioMilestones'), []);
      const prior = input.milestoneId ? existing.find((m) => m.id === input.milestoneId && m.verdictId === verdictId) : null;
      if (input.milestoneId && !prior) return fail('Milestone not found on this verdict.', 'milestoneId');
      if (!prior && existing.length >= L.milestonesMax) {
        return fail(`The register holds at most ${L.milestonesMax} milestones.`, null, REFUSAL('cap-exceeded'));
      }
      const milestoneId = prior?.id || idFactory('prvm');
      const candidate = {
        id: milestoneId,
        verdictId,
        label,
        dueOn,
        doneOn,
        doneById: doneOn ? check.actorId : '',
        note,
      };
      const verified = normalizePortfolioMilestones([candidate], []);
      if (verified.length !== 1) {
        return fail('The milestone failed schema verification and was not saved.', null, REFUSAL('schema-rejected'));
      }

      store.update((draft) => {
        if (!Array.isArray(draft.portfolioMilestones)) draft.portfolioMilestones = [];
        const index = draft.portfolioMilestones.findIndex((m) => m.id === milestoneId);
        if (index < 0) draft.portfolioMilestones.push(verified[0]);
        else draft.portfolioMilestones[index] = verified[0];
      }, {
        type: PRV_EVENTS.MILESTONE_RECORDED,
        entity: 'portfolioMilestone',
        entityId: milestoneId,
        summary: `Verdict milestone recorded on the Portfolio Review Register (due ${dueOn}).`,
      });
      return saved({ milestoneId, milestone: verified[0] });
    },

    /* -------------------------------------------------- 6. complete exit */

    portfolioCompleteExit(verdictIdInput, input = {}) {
      const check = seatFor(PRV_RIGHTS.VERDICT);
      if (!check.ok) return check;
      const verdictId = prvId(verdictIdInput);
      if (!verdictId) return fail('Name the sell or exit verdict to complete.', 'verdictId', REFUSAL('missing-verdict-id'));

      const verdicts = normalizePortfolioVerdicts(rows('portfolioVerdicts'), []);
      const verdict = verdicts.find((v) => v.id === verdictId);
      if (!verdict) return fail('That verdict is not on the record.', 'verdictId', REFUSAL('verdict-not-found'));
      if (verdict.verdict !== 'sell' && verdict.verdict !== 'exit') {
        return fail('Only a sell or exit verdict can be completed as a disposal settlement.', 'verdictId', REFUSAL('not-disposal-verdict'));
      }

      const units = normalizePortfolioUnits(rows('portfolioUnits'), []);
      const unit = units.find((u) => u.id === verdict.unitId);
      if (!unit) return fail('The parent unit for this verdict is missing.', 'verdictId', REFUSAL('unit-not-found'));
      if (unit.retiredOn) return fail('Cannot complete disposal on an already retired unit.', 'verdictId', REFUSAL('unit-retired'));

      const latestForUnit = verdicts
        .filter((v) => v.unitId === unit.id && v.decidedOn <= check.today)
        .sort((a, b) => a.decidedOn.localeCompare(b.decidedOn))
        .at(-1);
      if (!latestForUnit || latestForUnit.id !== verdict.id) {
        return fail('Only the unit’s current latest verdict can be completed; this verdict was superseded.', 'verdictId', REFUSAL('superseded-verdict'));
      }

      const existingExits = normalizePortfolioExits(rows('portfolioExits'), []);
      if (existingExits.length >= L.exitsMax) {
        return fail(`The register holds at most ${L.exitsMax} completed exits.`, null, REFUSAL('cap-exceeded'));
      }
      if (existingExits.some((e) => e.verdictId === verdict.id)) {
        return fail('This sell/exit verdict has already been completed.', 'verdictId', REFUSAL('exit-already-completed'));
      }

      const milestones = normalizePortfolioMilestones(rows('portfolioMilestones'), [])
        .filter((m) => m.verdictId === verdict.id);
      if (milestones.some((m) => !m.doneOn)) {
        return fail('Mark all milestones on this sell/exit verdict done before recording exit completion.', 'verdictId', REFUSAL('open-milestones-remain'));
      }

      const completedOn = input?.completedOn === undefined ? check.today : prvDay(input.completedOn);
      if (!completedOn || completedOn < verdict.decidedOn || completedOn > check.today) {
        return fail('Completion date must lie between the verdict decision date and today.', 'completedOn', REFUSAL('invalid-completed-on'));
      }
      const actualProceedsCents = parsePrvMoneyToCents(input?.amount, { allowZero: true });
      if (actualProceedsCents === null) {
        return fail('Enter the actual realized proceeds with at most 2 decimal places (no commas or rounding); zero is allowed for a wind-down.', 'amount', REFUSAL('invalid-amount'));
      }
      const evidenceKind = prvText(input?.evidenceKind, 32);
      const evidenceId = prvText(input?.evidenceId, L.evidenceIdMax + 1);
      if (!PRV_EVIDENCE_KIND_KEYS.includes(evidenceKind) || !evidenceId || evidenceId.length > L.evidenceIdMax) {
        return fail('Cite a valid settlement evidence kind and identifier.', 'evidenceId', REFUSAL('missing-evidence'));
      }
      const basis = prvText(input?.basis, L.basisMax + 1);
      if (basis.length < L.basisMin || basis.length > L.basisMax) {
        return fail(`State the settlement basis in ${L.basisMin} to ${L.basisMax} characters.`, 'basis', REFUSAL('invalid-basis'));
      }

      const exitId = idFactory('prvx');
      const candidate = {
        id: exitId,
        verdictId: verdict.id,
        unitId: unit.id,
        completedOn,
        recordedById: check.actorId,
        actualProceedsCents,
        evidenceKind,
        evidenceId,
        basis,
      };
      const verified = normalizePortfolioExits([candidate], []);
      if (verified.length !== 1) {
        return fail('The exit completion failed schema verification and was not saved.', null, REFUSAL('schema-rejected'));
      }

      store.update((draft) => {
        if (!Array.isArray(draft.portfolioExits)) draft.portfolioExits = [];
        draft.portfolioExits.push(verified[0]);
      }, {
        type: PRV_EVENTS.EXIT_COMPLETED,
        entity: 'portfolioExit',
        entityId: exitId,
        summary: `Portfolio ${verdict.verdict} completed on the Portfolio Review Register, settled ${completedOn}.`,
      });
      return saved({ exitId, exit: verified[0] });
    },

    /* ------------------------------------------------------------ 7. scan */

    portfolioScan() {
      const check = seatFor(PRV_RIGHTS.DECLARE);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: PRV_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: `${PRV_ROUTE}#${PRV_RULE_ID}`,
        summary: `Portfolio review scan requested (${PRV_RULE_ID}).`,
      });
      return saved({ propagations: store.lastPropagations || [] });
    },

    /* ------------------------------------------------------------ 7. reads */

    portfolioReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return buildPortfolioReview(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
    },

    portfolioAttentionCount() {
      const { seat, at, cfg } = readSeat();
      return portfolioAttentionCount(store.state, { now: at, settings: cfg, seat });
    },

    portfolioCandidates() {
      const check = readCheck();
      if (!check.ok) return check;
      return portfolioCandidates(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
    },
  };
}
