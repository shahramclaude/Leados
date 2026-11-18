/** ADR-0255 — guard report-only evidence against the existing live matrix. */
import { buildMatrix, matrixLineScope } from './matrix.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import {
  SERVICE_BUDGET_LIMITS as L, SERVICE_BUDGET_RIGHTS as RIGHTS,
  evaluateServiceBudget, readServiceBudgetEvidence, serviceBudgetFailure as fail,
} from './serviceBudget.js';
import { SERVICE_BUDGET_WARNING, readServiceBudgetPaper, serviceBudgetVersionKey } from './serviceBudgetSchema.js';

const missingPaper = () => fail(null, 'That service workpaper is missing or is not readable from this seat.');
const declaredSeatRequired = 'Declare a director, VP or CEO seat in the Altitude Lens to record this evidence.';

export function createServiceBudgetActions(store, { now, idFactory }) {
  const papers = () => store.state.serviceBudgets;

  function context(right) {
    const at = now();
    const stamp = at.toISOString();
    const matrix = buildMatrix(store.state, { now: at });
    const lineScope = matrixLineScope(matrix).byManager;
    const built = buildSeats(store.state, { now: at, lineScope });
    const seat = activeSeat(built);
    const access = canAct(right, seat);
    if (!access.allow) return fail(null, access.reason);
    if (right === RIGHTS.RECORD && seat.fullAccess) return fail(null, declaredSeatRequired);
    // Check all named stewards against the one graph. Reaching one line never
    // grants the whole paper, and no unique "owner" is inferred from reach.
    const holds = (id) => matrix.roster.has(id) && (id === seat.nodeId || matrix.nodes.get(id)?.ancestors.has(seat.nodeId));
    const eligible = (id) => built.nodeIndex.has(id) && holds(id);
    const canRead = (paper) => paper.recordedAt <= stamp && (seat.fullAccess || paper.stewardIds.every(eligible));
    const stewardDetails = (ids) => ids.map((id) => ({ id, name: matrix.roster.get(id)?.name ?? null }));
    return { ok: true, stamp, seat, matrix, eligible, canRead, stewardDetails };
  }

  function prepare(input) {
    const check = context(RIGHTS.RECORD);
    if (!check.ok) return check;
    if (store.writeBlockReason) return fail(null, store.writeBlockReason);
    const read = readServiceBudgetEvidence(input, check.stamp.slice(0, 10));
    if (!read.ok) return read;
    if (!read.evidence.stewardIds.every(check.eligible)) {
      return fail('stewardIds', 'The acting seat must reach every named service steward holding a leadership seat on an active reporting path. No other owner was substituted.');
    }
    if (papers().length >= L.papers) return fail(null, `The workspace already holds ${L.papers} service workpapers. Nothing was truncated or replaced.`);
    const key = serviceBudgetVersionKey(read.evidence);
    if (papers().some((paper) => serviceBudgetVersionKey(paper) === key)) {
      return fail('sourceRef', 'This source version cannot be recorded again for the same service, objective and window. Use a new reference for revised evidence.');
    }
    return { ...read, check };
  }

  return {
    serviceBudgetIndex() {
      const check = context(RIGHTS.READ);
      if (!check.ok) return check;
      const entries = papers().filter(check.canRead).map((p) => ({
        id: p.id, serviceRef: p.serviceRef, policyRef: p.policyRef, sourceRef: p.sourceRef,
        startOn: p.startOn, endOn: p.endOn, recordedAt: p.recordedAt,
      })).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || a.id.localeCompare(b.id));
      const mayRecord = !check.seat.fullAccess;
      const candidates = mayRecord ? check.stewardDetails([...check.matrix.roster.keys()].filter(check.eligible))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) : [];
      const warnings = check.seat.fullAccess ? store.warnings.filter((w) => typeof w === 'string' && w.startsWith(SERVICE_BUDGET_WARNING)) : [];
      return { ok: true, entries, mayRecord, candidates, warnings, persistError: store.persistError, recordReason: declaredSeatRequired };
    },
    serviceBudgetRead(id) {
      const check = context(RIGHTS.READ);
      if (!check.ok) return check;
      const paper = papers().find((p) => p.id === id);
      if (!paper || !check.canRead(paper)) return missingPaper();
      const { serviceRef, policyRef, sourceRef, startOn, endOn, recordedAt } = paper;
      return { ok: true, serviceRef, policyRef, sourceRef, startOn, endOn, recordedAt,
        recorderId: check.seat.fullAccess || check.eligible(paper.recordedById) || check.seat.nodeId === paper.recordedById ? paper.recordedById : null,
        stewards: check.stewardDetails(paper.stewardIds), controlRef: paper.control?.ref ?? null,
        report: evaluateServiceBudget(paper) };
    },
    serviceBudgetPreview(input) {
      const plan = prepare(input);
      if (!plan.ok) return plan;
      const { serviceRef, policyRef, sourceRef, startOn, endOn, control, stewardIds } = plan.evidence;
      return { ok: true, serviceRef, policyRef, sourceRef, startOn, endOn, controlRef: control?.ref ?? null,
        stewards: plan.check.stewardDetails(stewardIds), report: evaluateServiceBudget(plan.evidence), evidence: plan.evidence };
    },
    async serviceBudgetRecord(input) {
      const plan = prepare(input);
      if (!plan.ok) return plan;
      const { stamp, seat } = plan.check;
      const staged = readServiceBudgetPaper({ ...plan.evidence, id: idFactory('sbud'), recordedById: seat.nodeId, recordedAt: stamp }, stamp);
      if (!staged.ok) return staged;
      const { paper } = staged;
      if (papers().some((p) => p.id === paper.id)) return fail(null, 'The generated workpaper ID already exists. Nothing was overwritten.');
      store.update((draft) => { draft.serviceBudgets.push(paper); }, {
        type: 'serviceBudget.recorded', entity: 'serviceBudget', entityId: paper.id,
        summary: 'Recorded a dated service-objective workpaper. No release decision or authorization was recorded.',
      });
      if (store.isEncrypted) await store.flush();
      return { ok: true, id: paper.id, saved: !store.persistError, warning: store.persistError || null };
    },
  };
}
