/**
 * app/core/domain/psrActions.js — seat-checked, guard-enforced actions for the
 * Pre-Startup Safety Review & Commissioning Readiness Register (ADR-0258,
 * Schema v210, `#/pre-startup`).
 *
 * TEN COMMANDS + THREE SAFE READS:
 *   `psrOpenReview`          open a review with required gates & affected operators
 *   `psrRecordPunchItem`     log a Category A (blocker) or Category B (dated) item
 *   `psrClosePunchItem`      verify punch closure (bars proposer & owner on Cat A)
 *   `psrRecordSignoff`       record discipline clearance/rejection (bars proposer)
 *   `psrAttestReadiness`     attest operator briefing (bars self & proposer)
 *   `psrAuthoriseStartup`    hard pre-startup safety gate at the matrix joint apex
 *   `psrRecordStartup`       log physical energisation (flags unsafe breach honestly)
 *   `psrRecordRestoration`   log physical removal/restoration of a temporary change
 *   `psrSetConventions`      set strict integer floor/horizon & propagation switch
 *   `psrScan`                run a pause-governed RULE-PSR-01 sweep
 *   `psrReport`              scoped derived report (re-proves READ right)
 *   `psrAttention`           scoped navigation badge count (re-proves READ right)
 *   `psrCandidates`          active people in reach for modals (re-proves READ right)
 *
 * Every command re-validates inputs strictly, checks active single-chain and
 * matrix reach via `buildMatrix`, round-trips the candidate row through its
 * schema normaliser before commit, and refuses with an explicit reason string.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixLineScopeFor } from './matrix.js';
import { buildSeats, activeSeat, canAct } from './seat.js';
import {
  PSR_BOUNDS,
  PSR_DISCIPLINE_BY_KEY,
  PSR_EVENTS,
  PSR_LIMITS,
  PSR_PUNCH_CATEGORY_BY_KEY,
  PSR_REFUSALS,
  PSR_RIGHTS,
  PSR_ROUTE,
  PSR_SETTING_KEYS,
  PSR_SIGNOFF_VERDICT_BY_KEY,
  PSR_TRIGGER_BY_KEY,
} from './psrRegistry.js';
import {
  normalizePsrAuthorisations,
  normalizePsrPunchItems,
  normalizePsrReadiness,
  normalizePsrReviews,
  normalizePsrSettings,
  normalizePsrSignoffs,
  normalizePsrStartups,
  psrDayKey,
  psrDisciplines,
  psrId,
  psrInstant,
  psrOperators,
  psrProse,
  psrShort,
} from './psrSchema.js';
import {
  buildPreStartupSafety,
  derivePsrReview,
  psrAttentionCount,
  psrPersonLabel,
  psrRowInReach,
  psrSeatHoldsPerson,
} from './psrSafety.js';
import { instantMs, strictWholeInt, wholeDaysBetween } from './psrMath.js';

const fail = (reason, message) => ({ ok: false, reason, message });
const nowIso = (at) => (at instanceof Date ? at : new Date(at)).toISOString();
const isPlainObject = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const list = (v) => (Array.isArray(v) ? v : []);

function currentAt(now) {
  const value = typeof now === 'function' ? now() : now;
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function checkGate(state, at, rightKey) {
  const cfg = state?.settings || {};
  const lineScope = matrixLineScopeFor(state, { now: at, settings: cfg });
  const built = buildSeats(state, { now: at, settings: cfg, lineScope });
  const seat = activeSeat(built);
  if (seat?.readOnly || seat?.unresolved) return fail('not-seated', PSR_REFUSALS.notSeated);
  const verdict = canAct(rightKey, seat);
  if (!verdict?.allow) {
    return fail('forbidden', verdict?.reason || `This seat does not hold the ${rightKey} right required for that action.`);
  }
  let matrix;
  try {
    matrix = buildMatrix(state, { now: at, settings: { ...cfg, activeSeatId: null } });
  } catch (error) {
    return fail('graph-unreadable', `The live reporting graph could not be read: ${error?.message || 'unknown error'}. Nothing was saved.`);
  }
  const actorId = seat && !seat.fullAccess ? (seat.nodeId || seat.id) : LEADER_ID;
  return { ok: true, seat, matrix, actorId };
}

function isActivePerson(matrix, personId) {
  if (!personId) return false;
  if (personId === LEADER_ID) return true;
  return Boolean(matrix?.nodes?.has?.(personId));
}

/**
 * Resolve who signed/verified/recorded an act. Under a declared seat, the seat
 * can only act in its own name — passing another person's id refuses with
 * `wrong-actor`. Under the unscoped workspace operator, an optional active
 * person id may be supplied, defaulting to `LEADER_ID`.
 */
function resolveActorHand(gate, explicitId) {
  const hasExplicit = explicitId !== undefined && explicitId !== null && String(explicitId).trim() !== '';
  if (gate.seat && !gate.seat.fullAccess) {
    if (hasExplicit) {
      const parsed = psrId(explicitId);
      if (!parsed || parsed !== gate.actorId) {
        return fail('wrong-actor', 'A declared seat can only sign or verify in its own identity, never on behalf of another person.');
      }
    }
    return { ok: true, personId: gate.actorId };
  }
  if (!hasExplicit) return { ok: true, personId: LEADER_ID };
  const parsed = psrId(explicitId);
  if (!parsed || !isActivePerson(gate.matrix, parsed)) {
    return fail('hand-not-found', 'The named acting person is not active on the live reporting graph.');
  }
  return { ok: true, personId: parsed };
}

function findScopedRow(state, gate, at, reviewId) {
  const id = psrId(reviewId);
  if (!id) return fail('invalid-review', 'Name a valid pre-startup review id.');
  const report = buildPreStartupSafety(state, { now: at, settings: state?.settings, seat: null });
  if (!report?.ok) return fail('report-failed', 'The pre-startup safety register could not be read.');
  const row = report.rows.find((candidate) => candidate.review.id === id) || null;
  if (!row || !psrRowInReach(gate.seat, gate.matrix, row)) {
    return fail('not-found', PSR_REFUSALS.notFound);
  }
  return { ok: true, row, report };
}

export function createPsrActions(store, { now = () => new Date(), idFactory = null } = {}) {
  const nextId = (prefix) => (
    typeof idFactory === 'function'
      ? idFactory(prefix)
      : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  );

  const readState = () => (typeof store.getState === 'function' ? readState() : store.state);
  const commitDraft = (mutate, event) => store.update((draft) => { mutate(draft); }, event);

  return {
    /* ---------------------------------------------------------- SAFE READS */

    psrReport(opts = {}) {
      const state = readState();
      const at = opts?.now ? currentAt(opts.now) : currentAt(now);
      const gate = checkGate(state, at, PSR_RIGHTS.READ);
      if (!gate.ok) return gate;
      const report = buildPreStartupSafety(state, {
        now: at,
        settings: { ...(state?.settings || {}), ...(opts?.settings || {}) },
        seat: gate.seat,
      });
      return {
        ...report,
        rights: {
          canOpen: Boolean(canAct(PSR_RIGHTS.OPEN, gate.seat)?.allow),
          canAct: Boolean(canAct(PSR_RIGHTS.ACT, gate.seat)?.allow),
          canAuth: Boolean(canAct(PSR_RIGHTS.AUTHORISE, gate.seat)?.allow),
        },
      };
    },

    psrAttention(opts = {}) {
      const state = readState();
      const at = opts?.now ? currentAt(opts.now) : currentAt(now);
      const gate = checkGate(state, at, PSR_RIGHTS.READ);
      if (!gate.ok) return 0;
      return psrAttentionCount(state, {
        now: at,
        settings: { ...(state?.settings || {}), ...(opts?.settings || {}) },
        seat: gate.seat,
      });
    },

    psrCandidates() {
      const state = readState();
      const at = currentAt(now);
      const gate = checkGate(state, at, PSR_RIGHTS.READ);
      if (!gate.ok) return gate;
      const people = [];
      for (const [personId, node] of gate.matrix?.nodes?.entries?.() || []) {
        if (personId === LEADER_ID || node?.isLeader) continue;
        if (!psrSeatHoldsPerson(gate.seat, gate.matrix, personId)) continue;
        people.push({
          id: personId,
          name: node.name || psrPersonLabel(gate.matrix, personId),
          role: node.role || '',
        });
      }
      people.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      return {
        ok: true,
        actorId: gate.actorId,
        fullAccess: Boolean(gate.seat?.fullAccess),
        rank: gate.seat?.rank ?? null,
        people,
      };
    },

    /* ---------------------------------------------------- 1. OPEN A REVIEW */

    psrOpenReview(input = {}) {
      if (!isPlainObject(input)) return fail('invalid-input', 'Supply the review fields as an object.');
      const state = readState();
      const at = currentAt(now);
      const today = dayKey(at);
      const stamp = nowIso(at);
      const gate = checkGate(state, at, PSR_RIGHTS.OPEN);
      if (!gate.ok) return gate;

      if (list(state.psrReviews).length >= PSR_LIMITS.reviews) {
        return fail('limit-reached', `The register is bounded at ${PSR_LIMITS.reviews} pre-startup reviews.`);
      }

      const reviewRef = psrShort(input.reviewRef);
      if (!reviewRef) return fail('invalid-ref', `Enter a review reference (${PSR_LIMITS.shortMin}–${PSR_LIMITS.shortMax} characters, e.g. PSSR-2026-041).`);
      const existingRefs = new Set(list(state.psrReviews).map((r) => r?.reviewRef));
      if (existingRefs.has(reviewRef)) {
        return fail('duplicate-ref', `A pre-startup review with reference ${reviewRef} is already on the register.`);
      }

      const unitRef = psrShort(input.unitRef);
      if (!unitRef) return fail('invalid-unit', `Name the unit, line or equipment boundary (${PSR_LIMITS.shortMin}–${PSR_LIMITS.shortMax} characters).`);

      const triggerKind = clean(input.triggerKind);
      const triggerDef = PSR_TRIGGER_BY_KEY[triggerKind] || null;
      if (!triggerDef) return fail('invalid-trigger', 'Choose a declared trigger kind from the closed vocabulary.');

      const changeBasisRef = psrProse(input.changeBasisRef);
      if (!changeBasisRef) {
        return fail('basis-too-short', `Cite the MOC/project specification and hazard-review basis in at least ${PSR_LIMITS.textMin} characters.`);
      }

      const proposerId = psrId(input.proposerId);
      const unitHolderId = psrId(input.unitHolderId);
      if (!proposerId || !isActivePerson(gate.matrix, proposerId) || proposerId === LEADER_ID) {
        return fail('invalid-proposer', 'Name an active person on the roster as the modification/project proposer.');
      }
      if (!unitHolderId || !isActivePerson(gate.matrix, unitHolderId) || unitHolderId === LEADER_ID) {
        return fail('invalid-unit-holder', 'Name an active person on the roster as the accountable operating unit holder.');
      }
      if (proposerId === unitHolderId) {
        return fail('proposer-is-unit-holder', 'The modification proposer cannot also serve as the receiving operating unit holder (Holmström separation of proposer from receiver).');
      }

      const requiredDisciplines = psrDisciplines(input.requiredDisciplines);
      if (!requiredDisciplines) {
        return fail('invalid-disciplines', `Select between ${PSR_LIMITS.disciplinesMin} and ${PSR_LIMITS.disciplinesMax} valid verification disciplines; unknown keys are refused.`);
      }

      const affectedOperatorIds = psrOperators(input.affectedOperatorIds);
      if (!affectedOperatorIds) {
        return fail('invalid-operators', `Name between ${PSR_LIMITS.operatorsMin} and ${PSR_LIMITS.operatorsMax} affected operating people who must be briefed before energisation.`);
      }
      for (const opId of affectedOperatorIds) {
        if (opId === LEADER_ID || !isActivePerson(gate.matrix, opId)) {
          return fail('invalid-operators', `Named operator ${opId} is not active on the live roster.`);
        }
      }

      // Verify the seat holds active reporting reach over proposer, unit holder and every affected operator.
      for (const personId of [proposerId, unitHolderId, ...affectedOperatorIds]) {
        if (!psrSeatHoldsPerson(gate.seat, gate.matrix, personId)) {
          return fail('no-reach', PSR_REFUSALS.noReach);
        }
      }

      const plannedStartDay = psrDayKey(input.plannedStartDay);
      if (!plannedStartDay) return fail('invalid-planned-day', 'Enter an exact YYYY-MM-DD planned startup day.');

      const hasRevert = input.revertByDay !== undefined && input.revertByDay !== null && String(input.revertByDay).trim() !== '';
      let revertByDay = null;
      if (triggerDef.temporary) {
        revertByDay = hasRevert ? psrDayKey(input.revertByDay) : null;
        if (!revertByDay) {
          return fail('missing-revert-day', 'Temporary modifications and bypasses require an explicit YYYY-MM-DD revert-by day at opening (Flixborough control).');
        }
        const span = wholeDaysBetween(plannedStartDay, revertByDay);
        if (span === null || span < 0) {
          return fail('revert-before-start', 'The temporary modification revert-by day cannot precede the planned startup day.');
        }
      } else if (hasRevert) {
        return fail('unexpected-revert-day', 'Only temporary modifications carry a revert-by day; leave revert-by blank on permanent reviews.');
      }

      const candidate = {
        id: nextId('psr'),
        reviewRef,
        unitRef,
        triggerKind,
        changeBasisRef,
        proposerId,
        unitHolderId,
        requiredDisciplines,
        affectedOperatorIds,
        plannedStartDay,
        revertByDay,
        openedById: gate.actorId,
        openedAt: stamp,
        openedDay: today,
        createdAt: stamp,
        updatedAt: stamp,
      };
      const checked = normalizePsrReviews([candidate]);
      if (checked.length !== 1) return fail('invalid-row', 'The review failed fail-closed schema verification and was not saved.');
      const saved = checked[0];

      commitDraft(
        (draft) => {
          draft.psrReviews = Array.isArray(draft.psrReviews) ? draft.psrReviews : [];
          draft.psrReviews.push(saved);
        },
        {
          type: PSR_EVENTS.REVIEW_OPENED,
          entity: 'workspace',
          entityId: saved.id,
          summary: `Opened pre-startup safety review (${saved.triggerKind}, ${saved.requiredDisciplines.length} discipline gate(s)).`,
        },
      );
      return { ok: true, id: saved.id, review: saved };
    },

    /* ----------------------------------------------- 2. RECORD PUNCH ITEM */

    psrRecordPunchItem(input = {}) {
      if (!isPlainObject(input)) return fail('invalid-input', 'Supply the punch-item fields as an object.');
      const state = readState();
      const at = currentAt(now);
      const today = dayKey(at);
      const stamp = nowIso(at);
      const gate = checkGate(state, at, PSR_RIGHTS.ACT);
      if (!gate.ok) return gate;

      if (list(state.psrPunchItems).length >= PSR_LIMITS.punchItems) {
        return fail('limit-reached', `Punch items are bounded at ${PSR_LIMITS.punchItems} rows.`);
      }

      const found = findScopedRow(state, gate, at, input.reviewId);
      if (!found.ok) return found;
      const { row } = found;
      if (row.restored) {
        return fail('review-restored', 'This temporary modification has already been physically restored; open a new review for further changes.');
      }

      const itemRef = psrShort(input.itemRef);
      if (!itemRef) return fail('invalid-ref', `Enter a punch-item reference (${PSR_LIMITS.shortMin}–${PSR_LIMITS.shortMax} characters, e.g. PA-01).`);
      if (row.punchItems.some((p) => p.itemRef === itemRef)) {
        return fail('duplicate-ref', `Punch item ${itemRef} is already recorded on this review.`);
      }

      const category = clean(input.category);
      if (!PSR_PUNCH_CATEGORY_BY_KEY[category]) {
        return fail('invalid-category', 'Choose Category A (`pre-startup` blocker) or Category B (`post-startup` dated condition).');
      }
      if (category === 'pre-startup' && row.startup) {
        return fail('already-started', 'The unit is already energised; a pre-startup blocker cannot be added retroactively. Issue a work-stop if the running unit is unsafe, or log a dated Category B follow-up condition.');
      }

      const discipline = clean(input.discipline);
      if (!PSR_DISCIPLINE_BY_KEY[discipline]) {
        return fail('invalid-discipline', 'Choose a declared verification discipline for the punch item.');
      }

      const finding = psrProse(input.finding);
      if (!finding) {
        return fail('finding-too-short', `Describe the field finding and acceptance criterion in at least ${PSR_LIMITS.textMin} characters.`);
      }

      const ownerId = psrId(input.ownerId);
      if (!ownerId || ownerId === LEADER_ID || !isActivePerson(gate.matrix, ownerId)) {
        return fail('invalid-owner', 'Name an active roster person accountable for completing the item.');
      }
      if (!psrSeatHoldsPerson(gate.seat, gate.matrix, ownerId)) {
        return fail('no-reach', PSR_REFUSALS.noReach);
      }

      const hasDue = input.dueDay !== undefined && input.dueDay !== null && String(input.dueDay).trim() !== '';
      const dueDay = hasDue ? psrDayKey(input.dueDay) : null;
      if (category === 'post-startup' && !dueDay) {
        return fail('missing-due-day', 'Category B post-startup conditions MUST carry an explicit YYYY-MM-DD due day so they never drift indefinitely on a live unit.');
      }
      if (hasDue && !dueDay) {
        return fail('invalid-due-day', 'Enter an exact YYYY-MM-DD calendar date for the item due day.');
      }

      const recordedDay = input.recordedDay !== undefined && input.recordedDay !== null && String(input.recordedDay).trim() !== ''
        ? psrDayKey(input.recordedDay)
        : today;
      if (!recordedDay) return fail('invalid-recorded-day', 'Enter an exact YYYY-MM-DD recorded date.');
      const fromToday = wholeDaysBetween(today, recordedDay);
      if (fromToday === null || fromToday > 0) {
        return fail('future-day', 'A punch item cannot be recorded on a future date.');
      }

      const candidate = {
        id: nextId('psrp'),
        reviewId: row.review.id,
        itemRef,
        category,
        discipline,
        finding,
        ownerId,
        dueDay,
        recordedById: gate.actorId,
        recordedAt: stamp,
        recordedDay,
        closedDay: null,
        closedAt: null,
        closedById: null,
        closureEvidenceRef: null,
        closureBasis: null,
        createdAt: stamp,
        updatedAt: stamp,
      };
      const checked = normalizePsrPunchItems([candidate], [row.review]);
      if (checked.length !== 1) return fail('invalid-row', 'The punch item failed fail-closed schema verification and was not saved.');
      const saved = checked[0];

      commitDraft(
        (draft) => {
          draft.psrPunchItems = Array.isArray(draft.psrPunchItems) ? draft.psrPunchItems : [];
          draft.psrPunchItems.push(saved);
        },
        {
          type: PSR_EVENTS.PUNCH_RECORDED,
          entity: 'workspace',
          entityId: row.review.id,
          summary: `Recorded ${category} punch item (${discipline}).`,
        },
      );
      return { ok: true, id: saved.id, item: saved };
    },

    /* ------------------------------------------------ 3. CLOSE PUNCH ITEM */

    psrClosePunchItem(input = {}) {
      if (!isPlainObject(input)) return fail('invalid-input', 'Supply the closure fields as an object.');
      const state = readState();
      const at = currentAt(now);
      const today = dayKey(at);
      const stamp = nowIso(at);
      const gate = checkGate(state, at, PSR_RIGHTS.ACT);
      if (!gate.ok) return gate;

      const found = findScopedRow(state, gate, at, input.reviewId);
      if (!found.ok) return found;
      const { row } = found;

      const itemId = psrId(input.itemId);
      const item = itemId ? row.punchItems.find((p) => p.id === itemId) : null;
      if (!item) return fail('item-not-found', 'That punch item is not recorded on this pre-startup review.');
      if (item.verifiedClosed) {
        return fail('already-closed', 'That punch item is already independently verified closed.');
      }

      const actorRes = resolveActorHand(gate, input.closedById);
      if (!actorRes.ok) return actorRes;
      const verifierId = actorRes.personId;

      if (item.category === 'pre-startup') {
        if (verifierId === row.review.proposerId) {
          return fail('proposer-closure', 'The modification proposer cannot verify closure of a Category A pre-startup blocker; an independent hand must verify the field fix.');
        }
        if (verifierId === item.ownerId) {
          return fail('self-closure', 'The owner of a Category A pre-startup blocker cannot self-verify their own fix; an independent verifier must sign closure.');
        }
      }

      const closureEvidenceRef = psrShort(input.closureEvidenceRef);
      if (!closureEvidenceRef) {
        return fail('invalid-evidence', `Cite the walkdown, loop-check or test certificate reference (${PSR_LIMITS.shortMin}–${PSR_LIMITS.shortMax} characters).`);
      }
      const closureBasis = psrProse(input.closureBasis);
      if (!closureBasis) {
        return fail('basis-too-short', `Record what was physically verified closed in at least ${PSR_LIMITS.textMin} characters.`);
      }

      const closedDay = input.closedDay !== undefined && input.closedDay !== null && String(input.closedDay).trim() !== ''
        ? psrDayKey(input.closedDay)
        : today;
      if (!closedDay) return fail('invalid-closed-day', 'Enter an exact YYYY-MM-DD closure date.');
      const futureCheck = wholeDaysBetween(today, closedDay);
      if (futureCheck === null || futureCheck > 0) {
        return fail('future-day', 'A punch item cannot be verified closed on a future date.');
      }
      const orderCheck = wholeDaysBetween(item.recordedDay, closedDay);
      if (orderCheck === null || orderCheck < 0) {
        return fail('before-recorded', `Closure date (${closedDay}) cannot precede the item’s recorded date (${item.recordedDay}).`);
      }

      const candidate = {
        id: item.id,
        reviewId: item.reviewId,
        itemRef: item.itemRef,
        category: item.category,
        discipline: item.discipline,
        finding: item.finding,
        ownerId: item.ownerId,
        dueDay: item.dueDay,
        recordedById: item.recordedById,
        recordedAt: item.recordedAt,
        recordedDay: item.recordedDay,
        closedDay,
        closedAt: stamp,
        closedById: verifierId,
        closureEvidenceRef,
        closureBasis,
        createdAt: item.createdAt,
        updatedAt: stamp,
      };
      const checked = normalizePsrPunchItems([candidate], [row.review]);
      if (checked.length !== 1) return fail('invalid-row', 'The punch-item closure failed schema verification and was not saved.');
      const saved = checked[0];

      commitDraft(
        (draft) => {
          draft.psrPunchItems = list(draft.psrPunchItems).map((existing) => (existing?.id === saved.id ? saved : existing));
        },
        {
          type: PSR_EVENTS.PUNCH_CLOSED,
          entity: 'workspace',
          entityId: row.review.id,
          summary: `Verified closure of ${saved.category} punch item (${saved.discipline}).`,
        },
      );
      return { ok: true, id: saved.id, item: saved };
    },

    /* ----------------------------------------- 4. RECORD DISCIPLINE SIGNOFF */

    psrRecordSignoff(input = {}) {
      if (!isPlainObject(input)) return fail('invalid-input', 'Supply the sign-off fields as an object.');
      const state = readState();
      const at = currentAt(now);
      const today = dayKey(at);
      const stamp = nowIso(at);
      const gate = checkGate(state, at, PSR_RIGHTS.ACT);
      if (!gate.ok) return gate;

      if (list(state.psrSignoffs).length >= PSR_LIMITS.signoffs) {
        return fail('limit-reached', `Discipline sign-offs are bounded at ${PSR_LIMITS.signoffs} rows.`);
      }

      const found = findScopedRow(state, gate, at, input.reviewId);
      if (!found.ok) return found;
      const { row } = found;
      if (row.startup) {
        return fail('already-started', 'Physical startup is already recorded; pre-startup discipline gates cannot be signed after the fact.');
      }

      const discipline = clean(input.discipline);
      if (!PSR_DISCIPLINE_BY_KEY[discipline]) {
        return fail('invalid-discipline', 'Choose a valid discipline from the closed vocabulary.');
      }
      if (!row.review.requiredDisciplines.includes(discipline)) {
        return fail('discipline-not-required', `Discipline "${discipline}" is not declared on this pre-startup review.`);
      }

      const verdict = clean(input.verdict);
      if (!PSR_SIGNOFF_VERDICT_BY_KEY[verdict]) {
        return fail('invalid-verdict', 'Choose an explicit sign-off verdict: `cleared` or `rejected`.');
      }

      const actorRes = resolveActorHand(gate, input.signedById);
      if (!actorRes.ok) return actorRes;
      const signerId = actorRes.personId;
      if (signerId === row.review.proposerId) {
        return fail('proposer-signoff', 'The modification proposer is barred from signing any required pre-startup discipline gate (Holmström separation of proposer from gatekeeper).');
      }

      const evidenceRef = psrShort(input.evidenceRef);
      if (!evidenceRef) {
        return fail('invalid-evidence', `Cite the walkdown sheet, P&ID redline or test pack reference (${PSR_LIMITS.shortMin}–${PSR_LIMITS.shortMax} characters).`);
      }
      const basisRef = psrProse(input.basisRef);
      if (!basisRef) {
        return fail('basis-too-short', `State the technical verification basis or rejection reason in at least ${PSR_LIMITS.textMin} characters.`);
      }

      const signedDay = input.signedDay !== undefined && input.signedDay !== null && String(input.signedDay).trim() !== ''
        ? psrDayKey(input.signedDay)
        : today;
      if (!signedDay) return fail('invalid-signed-day', 'Enter an exact YYYY-MM-DD sign-off date.');
      const futureCheck = wholeDaysBetween(today, signedDay);
      if (futureCheck === null || futureCheck > 0) {
        return fail('future-day', 'A discipline gate cannot be signed on a future date.');
      }

      const candidate = {
        id: nextId('psrs'),
        reviewId: row.review.id,
        discipline,
        verdict,
        evidenceRef,
        basisRef,
        signedById: signerId,
        signedAt: stamp,
        signedDay,
        createdAt: stamp,
      };
      const checked = normalizePsrSignoffs([candidate], [row.review]);
      if (checked.length !== 1) return fail('invalid-row', 'The sign-off failed fail-closed schema verification and was not saved.');
      const saved = checked[0];

      commitDraft(
        (draft) => {
          draft.psrSignoffs = Array.isArray(draft.psrSignoffs) ? draft.psrSignoffs : [];
          draft.psrSignoffs.push(saved);
        },
        {
          type: PSR_EVENTS.SIGNOFF_RECORDED,
          entity: 'workspace',
          entityId: row.review.id,
          summary: `Recorded ${discipline} pre-startup gate verdict (${verdict}).`,
        },
      );
      return { ok: true, id: saved.id, signoff: saved };
    },

    /* ---------------------------------------- 5. ATTEST OPERATOR READINESS */

    psrAttestReadiness(input = {}) {
      if (!isPlainObject(input)) return fail('invalid-input', 'Supply the readiness attestation fields as an object.');
      const state = readState();
      const at = currentAt(now);
      const today = dayKey(at);
      const stamp = nowIso(at);
      const gate = checkGate(state, at, PSR_RIGHTS.ACT);
      if (!gate.ok) return gate;

      if (list(state.psrReadiness).length >= PSR_LIMITS.readiness) {
        return fail('limit-reached', `Operator readiness attestations are bounded at ${PSR_LIMITS.readiness} rows.`);
      }

      const found = findScopedRow(state, gate, at, input.reviewId);
      if (!found.ok) return found;
      const { row } = found;
      if (row.startup) {
        return fail('already-started', 'Physical startup is already recorded; pre-startup operator briefings cannot be backfilled onto the pre-startup gate.');
      }

      const operatorId = psrId(input.operatorId);
      if (!operatorId || !row.review.affectedOperatorIds.includes(operatorId)) {
        return fail('operator-not-listed', 'That person is not on this review’s declared affected-operator list.');
      }

      const existing = row.readiness.find((rd) => rd.operatorId === operatorId);
      if (existing?.valid) {
        return fail('duplicate-readiness', 'That operator already holds an independent pre-startup readiness attestation on this review.');
      }

      const actorRes = resolveActorHand(gate, input.attestedById);
      if (!actorRes.ok) return actorRes;
      const attesterId = actorRes.personId;
      if (attesterId === operatorId) {
        return fail('self-readiness', 'An operator cannot self-attest pre-startup briefing; a supervisor, trainer or unit holder must attest completion.');
      }
      if (attesterId === row.review.proposerId) {
        return fail('proposer-readiness', 'The modification proposer cannot attest operator startup readiness; operating supervision or training must attest independently.');
      }

      const procedureRef = psrShort(input.procedureRef);
      if (!procedureRef) {
        return fail('invalid-procedure', `Cite the updated operating/emergency procedure revision (${PSR_LIMITS.shortMin}–${PSR_LIMITS.shortMax} characters, e.g. SOP-RX4-r7).`);
      }
      const evidenceRef = psrShort(input.evidenceRef);
      if (!evidenceRef) {
        return fail('invalid-evidence', `Cite the briefing sheet, walkdown record or competency log (${PSR_LIMITS.shortMin}–${PSR_LIMITS.shortMax} characters).`);
      }

      const attestedDay = input.attestedDay !== undefined && input.attestedDay !== null && String(input.attestedDay).trim() !== ''
        ? psrDayKey(input.attestedDay)
        : today;
      if (!attestedDay) return fail('invalid-attested-day', 'Enter an exact YYYY-MM-DD briefing date.');
      const futureCheck = wholeDaysBetween(today, attestedDay);
      if (futureCheck === null || futureCheck > 0) {
        return fail('future-day', 'Operator readiness cannot be attested on a future date.');
      }

      const candidate = {
        id: existing?.id || nextId('psrr'),
        reviewId: row.review.id,
        operatorId,
        procedureRef,
        evidenceRef,
        attestedDay,
        attestedById: attesterId,
        attestedAt: stamp,
        createdAt: existing?.createdAt || stamp,
      };
      const checked = normalizePsrReadiness([candidate], [row.review]);
      if (checked.length !== 1) return fail('invalid-row', 'The readiness attestation failed schema verification and was not saved.');
      const saved = checked[0];

      commitDraft(
        (draft) => {
          const cur = list(draft.psrReadiness).filter((rd) => !(rd?.reviewId === saved.reviewId && rd?.operatorId === saved.operatorId));
          cur.push(saved);
          draft.psrReadiness = cur;
        },
        {
          type: PSR_EVENTS.READINESS_ATTESTED,
          entity: 'workspace',
          entityId: row.review.id,
          summary: 'Attested affected-operator pre-startup procedure readiness.',
        },
      );
      return { ok: true, id: saved.id, readiness: saved };
    },

    /* ----------------------------------------- 6. AUTHORISE STARTUP (GATE) */

    psrAuthoriseStartup(input = {}) {
      if (!isPlainObject(input)) return fail('invalid-input', 'Supply the startup authorisation fields as an object.');
      const state = readState();
      const at = currentAt(now);
      const stamp = nowIso(at);
      const gate = checkGate(state, at, PSR_RIGHTS.AUTHORISE);
      if (!gate.ok) return gate;

      if (list(state.psrAuthorisations).length >= PSR_LIMITS.authorisations) {
        return fail('limit-reached', `Startup authorisations are bounded at ${PSR_LIMITS.authorisations} rows.`);
      }

      const found = findScopedRow(state, gate, at, input.reviewId);
      if (!found.ok) return found;
      const { row } = found;

      if (row.startup) {
        return fail('already-started', 'Physical energisation is already on the record; Startup Authorisation cannot be backfilled after startup.');
      }
      if (row.authorisationValid) {
        return fail('authorisation-duplicate', 'A valid joint-apex Startup Authorisation already stands on this review.');
      }
      if (row.review.proposerId === row.review.unitHolderId) {
        return fail('proposer-is-unit-holder', 'Startup Authorisation refused: the modification proposer and receiving unit holder are the same person.');
      }
      if (row.rejectedDisciplines.length > 0) {
        return fail('gate-rejected', `Startup Authorisation refused: required discipline gate(s) rejected startup (${row.rejectedDisciplines.join(', ')}).`);
      }
      if (row.openCatAN > 0) {
        return fail('blockers-open', `Startup Authorisation refused: ${row.openCatAN} Category A pre-startup blocker(s) remain open or lack independent verification.`);
      }
      if (row.missingDisciplines.length > 0) {
        return fail('disciplines-incomplete', `Startup Authorisation refused: required discipline gate(s) lack independent clearance (${row.missingDisciplines.join(', ')}).`);
      }
      if (row.unbriefedOperators.length > 0) {
        return fail('operators-unbriefed', `Startup Authorisation refused: ${row.unbriefedOperators.length} affected operator(s) lack independent pre-startup procedure readiness attestation.`);
      }
      if (row.apexAmbiguous) {
        return fail('apex-ambiguous', `Startup Authorisation refused: the matrix graph yields ${row.apexIds.length} incomparable common managers above the involved lines; authority is ambiguous and cannot be guessed.`);
      }
      if (row.incompleteLineCoverage) {
        return fail('incomplete-lines', 'Startup Authorisation refused: one or more accountable hands on this review have no active reporting line, so a joint apex across every line cannot be certified.');
      }
      if (row.noApex || !row.apexId) {
        return fail('no-apex', 'Startup Authorisation refused: no shared startup apex above every involved reporting line could be resolved.');
      }

      const actorRes = resolveActorHand(gate, input.authorisedById);
      if (!actorRes.ok) return actorRes;
      const authoriserId = actorRes.personId;
      if (authoriserId === row.review.proposerId) {
        return fail('proposer-authorise', 'Startup Authorisation refused: the modification proposer can never authorise startup of their own change.');
      }
      if (authoriserId !== row.apexId) {
        return fail('not-joint-apex', `Startup Authorisation refused: only the computed joint apex across all active lines on this review (${psrPersonLabel(gate.matrix, row.apexId)}) may authorise startup — one line cannot authorise over another.`);
      }

      const permitClearanceRef = psrShort(input.permitClearanceRef);
      if (!permitClearanceRef) {
        return fail('invalid-permit-ref', `Cite the permit-to-work return, LOTO clearance and blind-list verification reference (${PSR_LIMITS.shortMin}–${PSR_LIMITS.shortMax} characters).`);
      }
      const basisRef = psrProse(input.basisRef);
      if (!basisRef) {
        return fail('basis-too-short', `State the startup authorisation basis and verified operating conditions in at least ${PSR_LIMITS.textMin} characters.`);
      }

      const authorisedAt = input.authorisedAt !== undefined && input.authorisedAt !== null && String(input.authorisedAt).trim() !== ''
        ? psrInstant(input.authorisedAt)
        : stamp;
      if (!authorisedAt) {
        return fail('invalid-instant', 'Enter an exact ISO-8601 timestamp with timezone for the authorisation instant.');
      }
      const authMs = instantMs(authorisedAt);
      if (authMs === null || authMs > at.getTime()) {
        return fail('future-instant', 'Startup Authorisation cannot be recorded at a future instant.');
      }

      const candidate = {
        id: nextId('psra'),
        reviewId: row.review.id,
        authorisedById: authoriserId,
        authorisedAt,
        authorisedDay: authorisedAt.slice(0, 10),
        permitClearanceRef,
        basisRef,
        createdAt: stamp,
      };
      const checked = normalizePsrAuthorisations([candidate], [row.review]);
      if (checked.length !== 1) return fail('invalid-row', 'The Startup Authorisation failed schema verification and was not saved.');
      const saved = checked[0];

      commitDraft(
        (draft) => {
          draft.psrAuthorisations = Array.isArray(draft.psrAuthorisations) ? draft.psrAuthorisations : [];
          draft.psrAuthorisations.push(saved);
        },
        {
          type: PSR_EVENTS.STARTUP_AUTHORISED,
          entity: 'workspace',
          entityId: row.review.id,
          summary: 'Granted joint-apex Startup Authorisation after verifying all pre-startup gates.',
        },
      );
      return { ok: true, id: saved.id, authorisation: saved };
    },

    /* ----------------------------------------- 7. RECORD PHYSICAL STARTUP */

    psrRecordStartup(input = {}) {
      if (!isPlainObject(input)) return fail('invalid-input', 'Supply the physical startup fields as an object.');
      const state = readState();
      const at = currentAt(now);
      const stamp = nowIso(at);
      const gate = checkGate(state, at, PSR_RIGHTS.ACT);
      if (!gate.ok) return gate;

      if (list(state.psrStartups).length >= PSR_LIMITS.startups) {
        return fail('limit-reached', `Startup records are bounded at ${PSR_LIMITS.startups} rows.`);
      }

      const found = findScopedRow(state, gate, at, input.reviewId);
      if (!found.ok) return found;
      const { row } = found;
      if (row.startup) {
        return fail('already-started', 'Physical energisation has already been recorded for this review.');
      }

      const actorRes = resolveActorHand(gate, input.energisedById);
      if (!actorRes.ok) return actorRes;
      const energisedById = actorRes.personId;

      const energisedAt = input.energisedAt !== undefined && input.energisedAt !== null && String(input.energisedAt).trim() !== ''
        ? psrInstant(input.energisedAt)
        : stamp;
      if (!energisedAt) {
        return fail('invalid-instant', 'Enter an exact ISO-8601 timestamp with timezone for the physical energisation instant.');
      }
      const startMs = instantMs(energisedAt);
      if (startMs === null || startMs > at.getTime()) {
        return fail('future-instant', 'Physical energisation cannot be logged at a future instant.');
      }

      const startupLogRef = psrShort(input.startupLogRef);
      if (!startupLogRef) {
        return fail('invalid-log-ref', `Cite the control-room log, breaker-closure or feed-in entry (${PSR_LIMITS.shortMin}–${PSR_LIMITS.shortMax} characters).`);
      }
      const basisRef = psrProse(input.basisRef);
      if (!basisRef) {
        return fail('basis-too-short', `Record the factual physical energisation conditions in at least ${PSR_LIMITS.textMin} characters.`);
      }

      const candidate = {
        id: nextId('psru'),
        reviewId: row.review.id,
        energisedAt,
        energisedDay: energisedAt.slice(0, 10),
        energisedById,
        startupLogRef,
        basisRef,
        restoredAt: null,
        restoredDay: null,
        restoredById: null,
        restorationRef: null,
        restorationBasis: null,
        createdAt: stamp,
        updatedAt: stamp,
      };
      const checked = normalizePsrStartups([candidate], [row.review]);
      if (checked.length !== 1) return fail('invalid-row', 'The startup record failed fail-closed schema verification and was not saved.');
      const saved = checked[0];

      // Evaluate whether this factual energisation breached any pre-startup gate.
      const post = derivePsrReview({
        review: row.review,
        punchItems: row.punchItems,
        signoffs: row.signoffs,
        readiness: row.readiness,
        authorisations: row.authorisations,
        startup: saved,
        matrix: gate.matrix,
        todayDay: dayKey(at),
        revertHorizonDays: found.report.conventions.psrRevertHorizonDays,
      });

      commitDraft(
        (draft) => {
          draft.psrStartups = Array.isArray(draft.psrStartups) ? draft.psrStartups : [];
          draft.psrStartups.push(saved);
        },
        {
          type: PSR_EVENTS.STARTUP_RECORDED,
          entity: 'workspace',
          entityId: row.review.id,
          summary: post.breaches.length
            ? `Recorded physical energisation WITH PRE-STARTUP SAFETY GATE BREACH (${post.breaches.length} breach(es)).`
            : 'Recorded lawful physical startup / energisation.',
        },
      );
      return {
        ok: true,
        id: saved.id,
        startup: saved,
        safeStartup: post.breaches.length === 0,
        stateKey: post.state.key,
        breaches: post.breaches,
      };
    },

    /* -------------------------------- 8. RECORD TEMPORARY RESTORATION ACT */

    psrRecordRestoration(input = {}) {
      if (!isPlainObject(input)) return fail('invalid-input', 'Supply the physical restoration fields as an object.');
      const state = readState();
      const at = currentAt(now);
      const stamp = nowIso(at);
      const gate = checkGate(state, at, PSR_RIGHTS.ACT);
      if (!gate.ok) return gate;

      const found = findScopedRow(state, gate, at, input.reviewId);
      if (!found.ok) return found;
      const { row } = found;
      if (row.review.triggerKind !== 'temporary-change') {
        return fail('not-temporary', 'Physical restoration applies only to temporary modifications and bypasses.');
      }
      if (!row.startup) {
        return fail('not-started', 'This temporary modification has not been recorded as energised.');
      }
      if (row.restored) {
        return fail('already-restored', 'Physical restoration to baseline design has already been recorded for this temporary modification.');
      }

      const actorRes = resolveActorHand(gate, input.restoredById);
      if (!actorRes.ok) return actorRes;
      const restoredById = actorRes.personId;

      const restoredAt = input.restoredAt !== undefined && input.restoredAt !== null && String(input.restoredAt).trim() !== ''
        ? psrInstant(input.restoredAt)
        : stamp;
      if (!restoredAt) {
        return fail('invalid-instant', 'Enter an exact ISO-8601 timestamp with timezone for the physical restoration instant.');
      }
      const restMs = instantMs(restoredAt);
      const startMs = instantMs(row.startup.energisedAt);
      if (restMs === null || restMs > at.getTime()) {
        return fail('future-instant', 'Physical restoration cannot be logged at a future instant.');
      }
      if (startMs === null || restMs < startMs) {
        return fail('before-startup', 'Physical restoration cannot precede the recorded energisation instant.');
      }

      const restorationRef = psrShort(input.restorationRef);
      if (!restorationRef) {
        return fail('invalid-restoration-ref', `Cite the jumper-removal, blind-list or baseline re-verification record (${PSR_LIMITS.shortMin}–${PSR_LIMITS.shortMax} characters).`);
      }
      const restorationBasis = psrProse(input.restorationBasis);
      if (!restorationBasis) {
        return fail('basis-too-short', `Describe the verified physical restoration to baseline specification in at least ${PSR_LIMITS.textMin} characters.`);
      }

      const candidate = {
        ...row.startup,
        restoredAt,
        restoredDay: restoredAt.slice(0, 10),
        restoredById,
        restorationRef,
        restorationBasis,
        updatedAt: stamp,
      };
      const checked = normalizePsrStartups([candidate], [row.review]);
      if (checked.length !== 1) return fail('invalid-row', 'The restoration record failed fail-closed schema verification and was not saved.');
      const saved = checked[0];

      commitDraft(
        (draft) => {
          draft.psrStartups = list(draft.psrStartups).map((st) => (st?.id === saved.id ? saved : st));
        },
        {
          type: PSR_EVENTS.RESTORATION_RECORDED,
          entity: 'workspace',
          entityId: row.review.id,
          summary: 'Recorded physical restoration of temporary modification to baseline design.',
        },
      );
      return { ok: true, id: saved.id, startup: saved };
    },

    /* -------------------------------------------------- 9. SET CONVENTIONS */

    psrSetConventions(patch = {}) {
      if (!isPlainObject(patch)) return fail('invalid-input', 'Supply the conventions update as a plain object.');
      const keys = Object.keys(patch);
      if (!keys.length) return fail('empty-patch', 'Supply at least one convention setting to update.');
      const allowed = new Set(Object.values(PSR_SETTING_KEYS));
      const unknown = keys.filter((key) => !allowed.has(key));
      if (unknown.length) {
        return fail('unknown-setting', `Unrecognised pre-startup safety setting(s): ${unknown.join(', ')}.`);
      }

      const state = readState();
      const at = currentAt(now);
      const gate = checkGate(state, at, PSR_RIGHTS.OPEN);
      if (!gate.ok) return gate;

      const updates = {};
      if (Object.hasOwn(patch, PSR_SETTING_KEYS.autoPropagate)) {
        if (typeof patch[PSR_SETTING_KEYS.autoPropagate] !== 'boolean') {
          return fail('invalid-boolean', '`psrAutoPropagate` must be an explicit boolean (`true` or `false`).');
        }
        updates.psrAutoPropagate = patch[PSR_SETTING_KEYS.autoPropagate];
      }
      if (Object.hasOwn(patch, PSR_SETTING_KEYS.privacyFloor)) {
        const parsed = strictWholeInt(patch[PSR_SETTING_KEYS.privacyFloor]);
        const { min, max } = PSR_BOUNDS.privacyFloor;
        if (parsed === null || parsed < min || parsed > max) {
          return fail('out-of-bounds', `Privacy floor must be an exact whole integer between ${min} and ${max} (never clamped).`);
        }
        updates.psrPrivacyFloor = parsed;
      }
      if (Object.hasOwn(patch, PSR_SETTING_KEYS.revertHorizonDays)) {
        const parsed = strictWholeInt(patch[PSR_SETTING_KEYS.revertHorizonDays]);
        const { min, max } = PSR_BOUNDS.revertHorizonDays;
        if (parsed === null || parsed < min || parsed > max) {
          return fail('out-of-bounds', `Temporary-change revert horizon must be an exact whole integer between ${min} and ${max} days (never clamped).`);
        }
        updates.psrRevertHorizonDays = parsed;
      }

      commitDraft(
        (draft) => {
          draft.settings = { ...(draft.settings || {}), ...updates };
        },
        {
          type: PSR_EVENTS.CONVENTIONS_SET,
          entity: 'workspace',
          entityId: PSR_ROUTE,
          summary: `Updated pre-startup safety register conventions (${Object.keys(updates).join(', ')}).`,
        },
      );
      return { ok: true, conventions: normalizePsrSettings(readState().settings) };
    },

    /* ---------------------------------------------------- 10. EXPLICIT SCAN */

    psrScan() {
      const state = readState();
      const at = currentAt(now);
      const gate = checkGate(state, at, PSR_RIGHTS.ACT);
      if (!gate.ok) return gate;
      const conv = normalizePsrSettings(state.settings || {});
      if (conv.psrAutoPropagate === false) {
        return {
          ok: true,
          paused: true,
          message: 'Automatic propagation for the pre-startup safety register (`psrAutoPropagate`) is paused; no follow-up asks were issued.',
        };
      }
      commitDraft(
        () => {},
        {
          type: PSR_EVENTS.SCANNED,
          entity: 'workspace',
          entityId: PSR_ROUTE,
          summary: 'Ran pre-startup safety register gate, post-startup due-date and temporary-revert scan.',
        },
      );
      return { ok: true, paused: false };
    },
  };
}
