/**
 * app/core/domain/dutyMeansActions.js — seat-checked commands and reads of the
 * Duty-Without-Means Register (ADR-0221, Schema v175, `#/means`).
 *
 * FIVE HUMAN COMMANDS + SCAN + THREE READS
 *   - `dutyMeansDeclareDuty`    — carrier (first-person) or demanding line
 *                                 declares an accountable outcome duty;
 *   - `dutyMeansRetireDuty`     — demanding line (or seat above it) closes a
 *                                 duty with a dated written reason; the carrier
 *                                 may never unilaterally retire an owed duty;
 *   - `dutyMeansAddRequirement` — carrier or demanding line names a required
 *                                 authority, budget, or time pillar and the
 *                                 line holder who controls it;
 *   - `dutyMeansRecordAct`      — ONLY the controlling line holder (or a seat
 *                                 strictly above them) records `supplied`,
 *                                 `declined`, or `revoked`; demanding lines
 *                                 cannot promise another line's people or money;
 *   - `dutyMeansGovernGap`      — ONLY a seat strictly above BOTH the demanding
 *                                 line and the controlling line records a
 *                                 written Simons `accepted-gap` retention;
 *   - `dutyMeansScan`           — re-evaluates `RULE-DWM-01` (pause-governed).
 */

import { addDays, dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { matrixLineScopeFor } from './matrix.js';
import {
  activeManagersOf,
  buildDutyMeans,
  dutyMeansAttentionCount,
  dutyMeansCandidates,
  dutyMeansMatrix,
  governingActFor,
  isHolderOrAbove,
  isStrictlyAboveAll,
} from './dutyMeans.js';
import {
  DWM_AUTHORITY_SCOPE_KEYS,
  DWM_EVIDENCE_KIND_KEYS,
  DWM_LIMITS as L,
  DWM_PILLAR_KEYS,
  DWM_RIGHTS,
  DWM_ROUTE,
  DWM_RULE_ID,
  DWM_SOURCE_KIND_KEYS,
  dwmAuthorityScopeByKey,
  dwmSourceByKey,
} from './dutyMeansRegistry.js';
import {
  dwmCurrency,
  dwmDay,
  dwmDaysBetween,
  dwmId,
  dwmPersonId,
  dwmText,
  normalizeDutyMeansActs,
  normalizeDutyMeansDuties,
  normalizeDutyMeansRequirements,
  parseDwmHours,
  parseDwmMoneyToCents,
  requirementUniqueSignature,
} from './dutyMeansSchema.js';

const REFUSAL = (key) => `dutyMeans:${key}`;

export const DWM_EVENTS = Object.freeze({
  DUTY_DECLARED: 'dutyMeans.duty.declared',
  DUTY_RETIRED: 'dutyMeans.duty.retired',
  REQUIREMENT_ADDED: 'dutyMeans.requirement.added',
  ACT_RECORDED: 'dutyMeans.act.recorded',
  GAP_GOVERNED: 'dutyMeans.gap.governed',
  SCANNED: 'dutyMeans.scanned',
});

export function createDutyMeansActions(store, { now, idFactory }) {
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
      return fail('Resolve the operating seat before acting on the Duty-Without-Means Register.', null, REFUSAL('not-seated'));
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
      return fail('Resolve the operating seat before reading the Duty-Without-Means Register.', null, REFUSAL('not-seated'));
    }
    const verdict = canAct(DWM_RIGHTS.READ, resolved.seat);
    if (!verdict.allow) return fail(verdict.reason, null, REFUSAL('rank-denied'));
    return { ok: true, ...resolved };
  }

  function liveGraph(check) {
    const built = dutyMeansMatrix(store.state, check.at, check.cfg);
    if (built.error || !built.matrix) {
      return fail(
        `The reporting graph could not be resolved, so accountability and means authority cannot be proved. Nothing was saved. (${built.error || 'matrix-error'})`,
        null,
        REFUSAL('graph-unreadable'),
      );
    }
    return { ok: true, matrix: built.matrix };
  }

  return {
    /* -------------------------------------------------------- 1. declare duty */

    dutyMeansDeclareDuty(input = {}) {
      const check = seatFor(DWM_RIGHTS.DECLARE);
      if (!check.ok) return check;
      if (!input || typeof input !== 'object') return fail('Provide the duty details.', 'input');

      const label = dwmText(input.label, L.labelMax + 1);
      if (label.length < L.labelMin || label.length > L.labelMax) {
        return fail(`Duty label must be ${L.labelMin} to ${L.labelMax} characters.`, 'label', REFUSAL('invalid-label'));
      }
      const carrierId = dwmPersonId(input.carrierId);
      if (!carrierId) return fail('Name the person held accountable for this outcome.', 'carrierId', REFUSAL('missing-carrier'));
      const demandingLineHolderId = dwmPersonId(input.demandingLineHolderId);
      if (!demandingLineHolderId) {
        return fail('Name the manager whose line demands this outcome.', 'demandingLineHolderId', REFUSAL('missing-demanding-line'));
      }
      if (carrierId === demandingLineHolderId) {
        return fail('A person cannot be recorded as holding themselves accountable on the Duty-Without-Means Register.', 'demandingLineHolderId', REFUSAL('self-demand'));
      }

      const g = liveGraph(check);
      if (!g.ok) return g;
      const { matrix } = g;
      if (!matrix.nodes?.has(carrierId)) {
        return fail('The named carrier is not on the active roster.', 'carrierId', REFUSAL('carrier-off-roster'));
      }
      if (!matrix.nodes?.has(demandingLineHolderId)) {
        return fail('The named demanding line holder is not on the active roster.', 'demandingLineHolderId', REFUSAL('demanding-line-off-roster'));
      }
      const holdsCarrier = activeManagersOf(matrix, carrierId).includes(demandingLineHolderId)
        || Boolean(matrix.nodes.get(carrierId)?.ancestors?.has(demandingLineHolderId));
      if (!holdsCarrier) {
        return fail(
          'The named demanding line holder does not hold the carrier on the home tree or any active declared matrix line.',
          'demandingLineHolderId',
          REFUSAL('demanding-line-does-not-hold-carrier'),
        );
      }

      const actorAllowed = check.seat.fullAccess
        || check.actorId === carrierId
        || isHolderOrAbove(matrix, check.actorId, demandingLineHolderId);
      if (!actorAllowed) {
        return fail(
          'Only the carrier themselves (first-person registration) or the demanding line holder (or a seat above them) may put this duty on the record.',
          'demandingLineHolderId',
          REFUSAL('not-carrier-or-demanding-line'),
        );
      }

      const windowFrom = dwmDay(input.windowFrom);
      const windowTo = dwmDay(input.windowTo);
      const span = dwmDaysBetween(windowFrom, windowTo);
      if (!windowFrom || !windowTo || span === null || span <= 0 || span > L.windowDaysMax) {
        return fail(`Provide a valid duty window of 1 to ${L.windowDaysMax} days (windowTo after windowFrom).`, 'windowTo', REFUSAL('invalid-window'));
      }
      const maxFuture = addDays(check.today, L.windowFutureDaysMax);
      if (windowFrom > maxFuture) {
        return fail(`Duty window cannot start more than ${L.windowFutureDaysMax} days ahead.`, 'windowFrom', REFUSAL('window-too-far-future'));
      }

      const declaredOn = input.declaredOn === undefined ? check.today : dwmDay(input.declaredOn);
      if (!declaredOn || declaredOn > check.today) {
        return fail('Declaration date must be a valid calendar day not in the future.', 'declaredOn', REFUSAL('future-declared-on'));
      }

      const outcomeBasis = dwmText(input.outcomeBasis, L.basisMax + 1);
      if (outcomeBasis.length < L.basisMin || outcomeBasis.length > L.basisMax) {
        return fail(`State the accountable outcome basis in ${L.basisMin} to ${L.basisMax} characters.`, 'outcomeBasis', REFUSAL('invalid-basis'));
      }

      const sourceKind = dwmText(input.sourceKind || 'written', 32);
      if (!DWM_SOURCE_KIND_KEYS.includes(sourceKind)) {
        return fail('Choose a valid source kind for the duty.', 'sourceKind', REFUSAL('invalid-source-kind'));
      }
      const sourceSpec = dwmSourceByKey(sourceKind);
      const sourceId = sourceSpec.needsId ? dwmText(input.sourceId, L.sourceIdMax + 1) : '';
      if (sourceSpec.needsId && (!sourceId || sourceId.length > L.sourceIdMax)) {
        return fail(`Cite the ${sourceSpec.label} identifier this duty comes from.`, 'sourceId', REFUSAL('missing-source-id'));
      }

      const existing = normalizeDutyMeansDuties(rows('dutyMeansDuties'), []);
      if (existing.length >= L.dutiesMax) {
        return fail(`The register holds at most ${L.dutiesMax} duties.`, null, REFUSAL('cap-exceeded'));
      }
      const duplicate = existing.some((d) => !d.retiredOn
        && d.carrierId === carrierId
        && d.demandingLineHolderId === demandingLineHolderId
        && d.label.toLowerCase() === label.toLowerCase()
        && d.windowFrom <= windowTo
        && windowFrom <= d.windowTo);
      if (duplicate) {
        return fail('An overlapping live duty with the same label, carrier, and demanding line is already on the record.', 'label', REFUSAL('duplicate-duty'));
      }

      const dutyId = idFactory('dwmd');
      const candidate = {
        id: dutyId,
        label,
        carrierId,
        demandingLineHolderId,
        windowFrom,
        windowTo,
        declaredOn,
        declaredById: check.actorId,
        outcomeBasis,
        sourceKind,
        sourceId,
        retiredOn: null,
        retiredById: '',
        retirementReason: '',
      };
      const verified = normalizeDutyMeansDuties([candidate], []);
      if (verified.length !== 1) {
        return fail('The duty failed schema verification and was not saved.', null, REFUSAL('schema-rejected'));
      }

      store.update((draft) => {
        if (!Array.isArray(draft.dutyMeansDuties)) draft.dutyMeansDuties = [];
        draft.dutyMeansDuties.push(verified[0]);
      }, {
        type: DWM_EVENTS.DUTY_DECLARED,
        entity: 'dutyMeansDuty',
        entityId: dutyId,
        summary: `Accountable duty declared on the Duty-Without-Means Register (${windowFrom} to ${windowTo}).`,
      });
      return saved({ dutyId, duty: verified[0] });
    },

    /* -------------------------------------------------------- 2. retire duty */

    dutyMeansRetireDuty(dutyIdInput, input = {}) {
      const check = seatFor(DWM_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const dutyId = dwmId(dutyIdInput);
      if (!dutyId) return fail('Name the duty to retire.', 'dutyId', REFUSAL('missing-duty-id'));

      const loaded = normalizeDutyMeansDuties(rows('dutyMeansDuties'), []);
      const duty = loaded.find((d) => d.id === dutyId);
      if (!duty) return fail('That duty is not on the record.', 'dutyId', REFUSAL('duty-not-found'));
      if (duty.retiredOn) return fail('That duty has already been retired.', 'dutyId', REFUSAL('duty-already-retired'));

      if (!check.seat.fullAccess && check.actorId === duty.carrierId) {
        return fail(
          'The carrier cannot unilaterally retire an assigned duty; only the demanding line holder or a seat above them may retire or rescope it.',
          'dutyId',
          REFUSAL('carrier-cannot-retire'),
        );
      }

      const g = liveGraph(check);
      if (!g.ok) return g;
      if (!check.seat.fullAccess && !isHolderOrAbove(g.matrix, check.actorId, duty.demandingLineHolderId)) {
        return fail(
          'Only the demanding line holder or a seat strictly above them may retire this duty.',
          'dutyId',
          REFUSAL('not-demanding-line'),
        );
      }

      const retiredOn = input?.retiredOn === undefined ? check.today : dwmDay(input.retiredOn);
      if (!retiredOn || retiredOn < duty.declaredOn || retiredOn > check.today) {
        return fail('Retirement date must lie between the declaration date and today.', 'retiredOn', REFUSAL('invalid-retired-on'));
      }
      const retirementReason = dwmText(input?.reason ?? input?.retirementReason, L.reasonMax + 1);
      if (retirementReason.length < L.reasonMin || retirementReason.length > L.reasonMax) {
        return fail(`State the retirement reason in ${L.reasonMin} to ${L.reasonMax} characters.`, 'reason', REFUSAL('invalid-reason'));
      }

      const updated = {
        ...duty,
        retiredOn,
        retiredById: check.actorId,
        retirementReason,
      };
      const verified = normalizeDutyMeansDuties([updated], []);
      if (verified.length !== 1) {
        return fail('The retirement failed schema verification and was not saved.', null, REFUSAL('schema-rejected'));
      }

      store.update((draft) => {
        draft.dutyMeansDuties = (draft.dutyMeansDuties || []).map((row) => (
          row?.id === dutyId ? verified[0] : row
        ));
      }, {
        type: DWM_EVENTS.DUTY_RETIRED,
        entity: 'dutyMeansDuty',
        entityId: dutyId,
        summary: `Duty retired on the Duty-Without-Means Register, effective ${retiredOn}.`,
      });
      return saved({ dutyId, duty: verified[0] });
    },

    /* ------------------------------------------------ 3. add required means */

    dutyMeansAddRequirement(dutyIdInput, input = {}) {
      const check = seatFor(DWM_RIGHTS.DECLARE);
      if (!check.ok) return check;
      const dutyId = dwmId(dutyIdInput);
      if (!dutyId) return fail('Name the duty this requirement belongs to.', 'dutyId', REFUSAL('missing-duty-id'));

      const duties = normalizeDutyMeansDuties(rows('dutyMeansDuties'), []);
      const duty = duties.find((d) => d.id === dutyId);
      if (!duty) return fail('That duty is not on the record.', 'dutyId', REFUSAL('duty-not-found'));
      if (duty.retiredOn) return fail('Cannot add requirements to a retired duty.', 'dutyId', REFUSAL('duty-retired'));

      const g = liveGraph(check);
      if (!g.ok) return g;
      const { matrix } = g;

      const allowedParty = check.seat.fullAccess
        || check.actorId === duty.carrierId
        || isHolderOrAbove(matrix, check.actorId, duty.demandingLineHolderId);
      if (!allowedParty) {
        return fail(
          'Only the duty carrier or the demanding line (or a seat above it) may declare what means this duty requires.',
          'dutyId',
          REFUSAL('not-duty-party'),
        );
      }

      const pillar = dwmText(input.pillar, 24);
      if (!DWM_PILLAR_KEYS.includes(pillar)) {
        return fail('Choose a valid means pillar: authority, budget, or time.', 'pillar', REFUSAL('invalid-pillar'));
      }
      const controllingHolderId = dwmPersonId(input.controllingHolderId);
      if (!controllingHolderId) {
        return fail('Name the manager or seat who controls this means.', 'controllingHolderId', REFUSAL('missing-controller'));
      }
      if (controllingHolderId === duty.carrierId) {
        return fail(
          'The carrier already holds their own discretion; only means controlled by another seat belong on the Duty-Without-Means Register.',
          'controllingHolderId',
          REFUSAL('self-controlled-means'),
        );
      }
      if (!matrix.nodes?.has(controllingHolderId)) {
        return fail('The named controlling holder is not on the active roster.', 'controllingHolderId', REFUSAL('controller-off-roster'));
      }

      const rationale = dwmText(input.rationale, L.rationaleMax + 1);
      if (rationale.length < L.rationaleMin || rationale.length > L.rationaleMax) {
        return fail(`Explain why the outcome requires this means in ${L.rationaleMin} to ${L.rationaleMax} characters.`, 'rationale', REFUSAL('invalid-rationale'));
      }
      const declaredOn = input.declaredOn === undefined ? check.today : dwmDay(input.declaredOn);
      if (!declaredOn || declaredOn > check.today) {
        return fail('Declaration date must be a valid calendar day not in the future.', 'declaredOn', REFUSAL('future-declared-on'));
      }

      let authorityScope = null;
      let currency = null;
      let requiredCents = null;
      let requiredHours = null;

      if (pillar === 'authority') {
        if (input.hours !== undefined && input.hours !== null && input.hours !== '') {
          return fail('Authority requirements cannot carry an hours field; declare a separate time requirement.', 'hours', REFUSAL('mixed-units'));
        }
        const scope = dwmText(input.authorityScope, 32);
        if (!DWM_AUTHORITY_SCOPE_KEYS.includes(scope)) {
          return fail('Choose a valid authority scope.', 'authorityScope', REFUSAL('invalid-authority-scope'));
        }
        authorityScope = scope;
        const spec = dwmAuthorityScopeByKey(scope);
        if (spec.needsMoney) {
          currency = dwmCurrency(input.currency);
          if (!currency) return fail('Provide a 3-letter ISO currency code for spend-commit authority.', 'currency', REFUSAL('invalid-currency'));
          requiredCents = parseDwmMoneyToCents(input.amount);
          if (requiredCents === null) {
            return fail('Enter a positive spend limit with at most 2 decimal places (no commas or rounding).', 'amount', REFUSAL('invalid-amount'));
          }
        } else if ((input.amount !== undefined && input.amount !== null && input.amount !== '')
          || (input.currency !== undefined && input.currency !== null && input.currency !== '')) {
          return fail('Non-spend authority scopes do not carry money; use spend-commit or add a budget requirement.', 'amount', REFUSAL('unexpected-money'));
        }
      } else if (pillar === 'budget') {
        if ((input.authorityScope !== undefined && input.authorityScope !== null && input.authorityScope !== '')
          || (input.hours !== undefined && input.hours !== null && input.hours !== '')) {
          return fail('Budget requirements carry only currency and amount — never authority scope or hours.', 'pillar', REFUSAL('mixed-units'));
        }
        currency = dwmCurrency(input.currency);
        if (!currency) return fail('Provide a 3-letter ISO currency code (e.g. DKK, EUR, USD).', 'currency', REFUSAL('invalid-currency'));
        requiredCents = parseDwmMoneyToCents(input.amount);
        if (requiredCents === null) {
          return fail('Enter a positive budget amount with at most 2 decimal places (no commas or rounding).', 'amount', REFUSAL('invalid-amount'));
        }
      } else if (pillar === 'time') {
        if ((input.authorityScope !== undefined && input.authorityScope !== null && input.authorityScope !== '')
          || (input.currency !== undefined && input.currency !== null && input.currency !== '')
          || (input.amount !== undefined && input.amount !== null && input.amount !== '')) {
          return fail('Time requirements carry whole hours only — never money or authority scope.', 'hours', REFUSAL('mixed-units'));
        }
        requiredHours = parseDwmHours(input.hours);
        if (requiredHours === null) {
          return fail(`Enter whole protected hours between ${L.hoursMin} and ${L.hoursMax}.`, 'hours', REFUSAL('invalid-hours'));
        }
      }

      const existing = normalizeDutyMeansRequirements(rows('dutyMeansRequirements'), []);
      if (existing.length >= L.requirementsMax) {
        return fail(`The register holds at most ${L.requirementsMax} requirements.`, null, REFUSAL('cap-exceeded'));
      }
      const reqId = idFactory('dwmr');
      const candidate = {
        id: reqId,
        dutyId,
        pillar,
        controllingHolderId,
        authorityScope,
        currency,
        requiredCents,
        requiredHours,
        rationale,
        declaredOn,
        declaredById: check.actorId,
      };
      const sig = requirementUniqueSignature(candidate);
      if (existing.some((r) => requirementUniqueSignature(r) === sig)) {
        return fail('That exact requirement pillar and controlling holder is already declared on this duty.', 'pillar', REFUSAL('duplicate-requirement'));
      }
      const verified = normalizeDutyMeansRequirements([candidate], []);
      if (verified.length !== 1) {
        return fail('The requirement failed schema verification and was not saved.', null, REFUSAL('schema-rejected'));
      }

      store.update((draft) => {
        if (!Array.isArray(draft.dutyMeansRequirements)) draft.dutyMeansRequirements = [];
        draft.dutyMeansRequirements.push(verified[0]);
      }, {
        type: DWM_EVENTS.REQUIREMENT_ADDED,
        entity: 'dutyMeansRequirement',
        entityId: reqId,
        summary: `Required ${pillar} means declared on the Duty-Without-Means Register.`,
      });
      return saved({ requirementId: reqId, requirement: verified[0] });
    },

    /* ----------------------------------------- 4. supply / decline / revoke */

    dutyMeansRecordAct(requirementIdInput, input = {}) {
      const check = seatFor(DWM_RIGHTS.SUPPLY);
      if (!check.ok) return check;
      const requirementId = dwmId(requirementIdInput);
      if (!requirementId) return fail('Name the requirement being answered.', 'requirementId', REFUSAL('missing-requirement-id'));

      const state = dwmText(input.state, 24);
      if (!['supplied', 'declined', 'revoked'].includes(state)) {
        return fail('Choose a valid controlling-line response: supplied, declined, or revoked.', 'state', REFUSAL('invalid-act-state'));
      }

      const reqs = normalizeDutyMeansRequirements(rows('dutyMeansRequirements'), []);
      const req = reqs.find((r) => r.id === requirementId);
      if (!req) return fail('That requirement is not on the record.', 'requirementId', REFUSAL('requirement-not-found'));

      const duties = normalizeDutyMeansDuties(rows('dutyMeansDuties'), []);
      const duty = duties.find((d) => d.id === req.dutyId);
      if (!duty) return fail('The parent duty for this requirement is missing.', 'requirementId', REFUSAL('duty-not-found'));
      if (duty.retiredOn) return fail('Cannot record a means act on a retired duty.', 'requirementId', REFUSAL('duty-retired'));

      if (!check.seat.fullAccess && check.actorId === duty.carrierId) {
        return fail(
          'The duty carrier may never self-certify their own required means.',
          'requirementId',
          REFUSAL('carrier-self-supply'),
        );
      }

      const g = liveGraph(check);
      if (!g.ok) return g;
      const { matrix } = g;

      if (!check.seat.fullAccess && !isHolderOrAbove(matrix, check.actorId, req.controllingHolderId)) {
        if (check.actorId === duty.demandingLineHolderId) {
          return fail(
            'The demanding line does not hold the controlling line and cannot promise another line’s authority, budget, or capacity.',
            'requirementId',
            REFUSAL('demanding-line-cannot-supply-other-line'),
          );
        }
        return fail(
          'Only the controlling line holder (or a seat strictly above them) may supply, decline, or revoke this means.',
          'requirementId',
          REFUSAL('not-controlling-line'),
        );
      }

      const on = input.on === undefined ? check.today : dwmDay(input.on);
      if (!on || on < req.declaredOn || on > check.today) {
        return fail('Act date must lie between the requirement declaration date and today.', 'on', REFUSAL('invalid-act-date'));
      }

      const allActs = normalizeDutyMeansActs(rows('dutyMeansActs'), []);
      if (allActs.length >= L.actsMax) {
        return fail(`The register holds at most ${L.actsMax} acts.`, null, REFUSAL('cap-exceeded'));
      }
      if (state === 'revoked') {
        const prior = governingActFor(allActs.filter((a) => a.requirementId === requirementId), check.today);
        if (!prior || prior.state !== 'supplied') {
          return fail('Only a requirement whose current standing act is supplied can be revoked.', 'state', REFUSAL('nothing-supplied-to-revoke'));
        }
      }

      const needsMoney = req.pillar === 'budget'
        || (req.pillar === 'authority' && Boolean(dwmAuthorityScopeByKey(req.authorityScope)?.needsMoney));

      let currency = null;
      let suppliedCents = null;
      let suppliedHours = null;
      let evidenceKind = '';
      let evidenceId = '';
      const reason = dwmText(input.reason, L.reasonMax + 1);
      if (reason.length > L.reasonMax) {
        return fail(`Reason must be at most ${L.reasonMax} characters.`, 'reason', REFUSAL('reason-too-long'));
      }

      if (state === 'supplied') {
        evidenceKind = dwmText(input.evidenceKind, 32);
        evidenceId = dwmText(input.evidenceId, L.evidenceIdMax + 1);
        if (!DWM_EVIDENCE_KIND_KEYS.includes(evidenceKind) || !evidenceId || evidenceId.length > L.evidenceIdMax) {
          return fail('Cite a valid evidence kind and instrument identifier when marking means supplied.', 'evidenceId', REFUSAL('missing-evidence'));
        }
        if (needsMoney) {
          const inputCur = input.currency === undefined ? req.currency : dwmCurrency(input.currency);
          if (!inputCur || inputCur !== req.currency) {
            return fail(`Supply currency must match the requirement currency (${req.currency}); currencies are never converted.`, 'currency', REFUSAL('currency-mismatch'));
          }
          currency = req.currency;
          suppliedCents = parseDwmMoneyToCents(input.amount);
          if (suppliedCents === null) {
            return fail('Enter a positive supplied amount with at most 2 decimal places (use declined if supplying zero).', 'amount', REFUSAL('invalid-amount'));
          }
        } else if (req.pillar === 'time') {
          suppliedHours = parseDwmHours(input.hours);
          if (suppliedHours === null) {
            return fail('Enter positive whole supplied hours (use declined if supplying zero hours).', 'hours', REFUSAL('invalid-hours'));
          }
        } else if ((input.amount !== undefined && input.amount !== null && input.amount !== '')
          || (input.hours !== undefined && input.hours !== null && input.hours !== '')) {
          return fail('Non-spend authority grants do not carry money or hours.', 'amount', REFUSAL('unexpected-quantity'));
        }
      } else if (reason.length < L.reasonMin) {
        return fail(`State the reason for ${state} means in at least ${L.reasonMin} characters.`, 'reason', REFUSAL('invalid-reason'));
      }

      const actId = idFactory('dwma');
      const candidate = {
        id: actId,
        requirementId,
        state,
        on,
        byId: check.actorId,
        currency,
        suppliedCents,
        suppliedHours,
        evidenceKind,
        evidenceId,
        reason,
      };
      const verified = normalizeDutyMeansActs([candidate], []);
      if (verified.length !== 1) {
        return fail('The means response failed schema verification and was not saved.', null, REFUSAL('schema-rejected'));
      }

      store.update((draft) => {
        if (!Array.isArray(draft.dutyMeansActs)) draft.dutyMeansActs = [];
        draft.dutyMeansActs.push(verified[0]);
      }, {
        type: DWM_EVENTS.ACT_RECORDED,
        entity: 'dutyMeansAct',
        entityId: actId,
        summary: `Controlling-line response (${state}) recorded on the Duty-Without-Means Register, effective ${on}.`,
      });
      return saved({ actId, act: verified[0] });
    },

    /* ------------------------------ 5. joint-apex entrepreneurial gap sign-off */

    dutyMeansGovernGap(requirementIdInput, input = {}) {
      const check = seatFor(DWM_RIGHTS.GOVERN);
      if (!check.ok) return check;
      const requirementId = dwmId(requirementIdInput);
      if (!requirementId) return fail('Name the requirement whose entrepreneurial gap is being governed.', 'requirementId', REFUSAL('missing-requirement-id'));

      const reqs = normalizeDutyMeansRequirements(rows('dutyMeansRequirements'), []);
      const req = reqs.find((r) => r.id === requirementId);
      if (!req) return fail('That requirement is not on the record.', 'requirementId', REFUSAL('requirement-not-found'));

      const duties = normalizeDutyMeansDuties(rows('dutyMeansDuties'), []);
      const duty = duties.find((d) => d.id === req.dutyId);
      if (!duty) return fail('The parent duty for this requirement is missing.', 'requirementId', REFUSAL('duty-not-found'));
      if (duty.retiredOn) return fail('Cannot govern a gap on a retired duty.', 'requirementId', REFUSAL('duty-retired'));

      if (!check.seat.fullAccess && check.actorId === duty.carrierId) {
        return fail('The duty carrier cannot sign off their own entrepreneurial gap.', 'requirementId', REFUSAL('carrier-cannot-govern'));
      }

      const g = liveGraph(check);
      if (!g.ok) return g;
      if (!check.seat.fullAccess
        && !isStrictlyAboveAll(g.matrix, check.actorId, [duty.demandingLineHolderId, req.controllingHolderId])) {
        return fail(
          'Only a seat strictly above BOTH the demanding line and the controlling line on the live matrix may accept an entrepreneurial gap.',
          'requirementId',
          REFUSAL('not-joint-apex'),
        );
      }

      const on = input.on === undefined ? check.today : dwmDay(input.on);
      if (!on || on < req.declaredOn || on > check.today) {
        return fail('Governance date must lie between the requirement declaration date and today.', 'on', REFUSAL('invalid-act-date'));
      }
      const reason = dwmText(input.reason, L.reasonMax + 1);
      if (reason.length < L.reasonMin || reason.length > L.reasonMax) {
        return fail(
          `State the bounded entrepreneurial-gap rationale in ${L.reasonMin} to ${L.reasonMax} characters.`,
          'reason',
          REFUSAL('invalid-reason'),
        );
      }

      const actId = idFactory('dwma');
      const candidate = {
        id: actId,
        requirementId,
        state: 'accepted-gap',
        on,
        byId: check.actorId,
        currency: null,
        suppliedCents: null,
        suppliedHours: null,
        evidenceKind: input.evidenceKind && DWM_EVIDENCE_KIND_KEYS.includes(dwmText(input.evidenceKind, 32))
          ? dwmText(input.evidenceKind, 32)
          : '',
        evidenceId: dwmText(input.evidenceId, L.evidenceIdMax),
        reason,
      };
      const verified = normalizeDutyMeansActs([candidate], []);
      if (verified.length !== 1) {
        return fail('The entrepreneurial-gap sign-off failed schema verification and was not saved.', null, REFUSAL('schema-rejected'));
      }

      store.update((draft) => {
        if (!Array.isArray(draft.dutyMeansActs)) draft.dutyMeansActs = [];
        draft.dutyMeansActs.push(verified[0]);
      }, {
        type: DWM_EVENTS.GAP_GOVERNED,
        entity: 'dutyMeansAct',
        entityId: actId,
        summary: `Joint-apex entrepreneurial gap accepted on the Duty-Without-Means Register, effective ${on}.`,
      });
      return saved({ actId, act: verified[0] });
    },

    /* ------------------------------------------------------------ 6. scan */

    dutyMeansScan() {
      const check = seatFor(DWM_RIGHTS.DECLARE);
      if (!check.ok) return check;
      store.update(() => {}, {
        type: DWM_EVENTS.SCANNED,
        entity: 'workspace',
        entityId: `${DWM_ROUTE}#${DWM_RULE_ID}`,
        summary: `Duty-without-means parity scan requested (${DWM_RULE_ID}).`,
      });
      return saved({ propagations: store.lastPropagations || [] });
    },

    /* ------------------------------------------------------------ 7. reads */

    dutyMeansReport() {
      const check = readCheck();
      if (!check.ok) return check;
      return buildDutyMeans(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
    },

    dutyMeansAttentionCount() {
      const { seat, at, cfg } = readSeat();
      return dutyMeansAttentionCount(store.state, { now: at, settings: cfg, seat });
    },

    dutyMeansCandidates() {
      const check = readCheck();
      if (!check.ok) return check;
      return dutyMeansCandidates(store.state, { now: check.at, settings: check.cfg, seat: check.seat });
    },
  };
}
