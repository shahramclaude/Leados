/**
 * app/core/domain/robustAllocationActions.js — commands and scoped adapters for
 * the Robust Allocation Terminal (ADR-0095).
 *
 * Reads are pure adapters over one report. The writes are: DECLARE a draft plan
 * (validated and feasibility-checked), ADOPT it (freeze the exact solution),
 * SCAN for falsified/overdue/ungraded premises, and SET the conventions
 * (rank 3+). The governed DACI decision, the owned delivery tasks, the typed
 * provenance and the vertical roll-up are NOT written here — they are produced
 * by RULE-RAL-01 on the shared post-commit spine in the SAME atomic transaction.
 */
import { addDays, dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import {
  buildRobustAllocationReport,
  robustAllocationAttentionCount,
  robustAllocationBriefText,
  robustAllocationCsvRows,
  solveRobustPlan,
} from './robustAllocation.js';
import {
  ROBUST_ALLOCATION_ENGINE_VERSION,
  ROBUST_ALLOCATION_EVENTS,
  ROBUST_ALLOCATION_LIMITS,
} from './robustAllocationRegistry.js';
import {
  robustAllocationConventions,
  validateRobustAllocationDeclaration,
} from './robustAllocationSchema.js';

export function createRobustAllocationActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date());
  const saved = (extra = {}) => ({
    ok: true,
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
  });
  const report = (planId = null) => buildRobustAllocationReport(store.state, { now: clock(), planId });
  const seatRight = () => {
    const built = buildSeats(store.state, { now: clock(), settings: store.state.settings || {} });
    const seat = activeSeat(built);
    if (seat.readOnly) return { ok: false, error: 'The declared seat is unresolved and read-only. Choose a valid seat before modelling an allocation.' };
    const right = canAct('declare-robust-allocation', seat);
    return right.allow ? { ok: true, seat, built } : { ok: false, error: right.reason };
  };
  const ownPlan = (planId, seat) => {
    const plan = (Array.isArray(store.state.robustPlans) ? store.state.robustPlans : []).find((p) => p && p.id === planId);
    if (!plan) return { ok: false, error: 'No such allocation plan.' };
    const visible = seat.fullAccess || plan.scopeSeatId === seat.id || (plan.scopeSeatId && seat.scope.has(plan.scopeSeatId));
    if (!visible) return { ok: false, error: 'The plan is outside this seat\u2019s span.' };
    return { ok: true, plan };
  };

  return {
    robustAllocationRead(planId = null) {
      return report(planId);
    },

    robustAllocationBriefText() {
      const current = report();
      return current.ok ? { ok: true, text: robustAllocationBriefText(current) } : current;
    },

    robustAllocationCsvRows() {
      const current = report();
      return current.ok ? { ok: true, rows: robustAllocationCsvRows(current) } : current;
    },

    robustAllocationAttentionCount() {
      return robustAllocationAttentionCount(store.state, { now: clock(), settings: store.state.settings || {} });
    },

    /** Declare a draft plan. Feasibility is checked now so an infeasible floor is refused before any work exists. */
    robustAllocationDeclare(input = {}) {
      const right = seatRight();
      if (!right.ok) return fail(right.error);
      const valid = validateRobustAllocationDeclaration(input);
      if (!valid.ok) return fail(valid.error, valid.field);
      const nowValue = clock();
      const today = dayKey(nowValue);
      const conventions = robustAllocationConventions(store.state.settings || {});
      const horizonOn = addDays(today, valid.declaration.horizonDays);
      const linkedContractId = typeof input.linkedContractId === 'string' && input.linkedContractId.trim()
        ? input.linkedContractId.trim().slice(0, 80) : null;
      if (linkedContractId) {
        const contract = (Array.isArray(store.state.prospectiveContracts) ? store.state.prospectiveContracts : [])
          .find((c) => c && c.id === linkedContractId);
        if (!contract) return fail('The linked prospective contract does not exist.', 'linkedContractId');
      }
      if (valid.declaration.supersedesId) {
        const parent = ownPlan(valid.declaration.supersedesId, right.seat);
        if (!parent.ok) return fail(parent.error, 'supersedesId');
      }
      const plan = {
        id: idFactory('ral'),
        title: valid.declaration.title,
        outcomeLabel: valid.declaration.outcomeLabel,
        currency: valid.declaration.currency,
        declaredOn: today,
        horizonOn,
        scopeSeatId: right.seat.id,
        altitudeKey: right.seat.altitudeKey || 'chief',
        rank: right.seat.rank,
        budgetCap: valid.declaration.budgetCap,
        hoursCap: valid.declaration.hoursCap,
        gamma: valid.declaration.gamma,
        segments: valid.declaration.segments,
        actions: valid.declaration.actions,
        linkedContractId,
        supersedesId: valid.declaration.supersedesId || null,
        status: 'draft',
        adoptedOn: null,
        frozen: null,
        engineVersion: ROBUST_ALLOCATION_ENGINE_VERSION,
        createdAt: nowValue.toISOString(),
      };
      const feasibility = solveRobustPlan(plan, {
        maxCombinations: conventions.robustAllocationMaxCombinations,
        nodeBudget: conventions.robustAllocationNodeBudget,
      });
      if (!feasibility.ok) return fail(feasibility.reason, 'actions');
      if ((Array.isArray(store.state.robustPlans) ? store.state.robustPlans : []).length >= ROBUST_ALLOCATION_LIMITS.plans) {
        return fail(`The plan ledger is full at ${ROBUST_ALLOCATION_LIMITS.plans} plans. Export the current brief before declaring another.`);
      }
      store.update((draft) => {
        draft.robustPlans = Array.isArray(draft.robustPlans) ? draft.robustPlans : [];
        draft.robustPlans.unshift(plan);
      }, {
        type: ROBUST_ALLOCATION_EVENTS.DECLARED,
        entity: 'robustplan',
        entityId: plan.id,
        summary: `Declared a draft robust allocation (${plan.actions.length} action(s), Γ=${plan.gamma}); feasibility verified, no governed work yet`,
      });
      return saved({ id: plan.id, report: report(plan.id) });
    },

    /** Adopt a draft: freeze the exact solved vector, then RULE-RAL-01 opens the governed work. */
    robustAllocationAdopt(planId) {
      const right = seatRight();
      if (!right.ok) return fail(right.error);
      const found = ownPlan(planId, right.seat);
      if (!found.ok) return fail(found.error);
      const plan = found.plan;
      if (plan.status === 'adopted') return saved({ id: plan.id, existing: true, report: report(plan.id) });
      const conventions = robustAllocationConventions(store.state.settings || {});
      const solution = solveRobustPlan(plan, {
        maxCombinations: conventions.robustAllocationMaxCombinations,
        nodeBudget: conventions.robustAllocationNodeBudget,
      });
      if (!solution.ok) return fail(solution.reason, 'actions');
      const frozen = {
        robustUnits: solution.robustUnits,
        robustWorstCase: solution.robustWorstCase,
        robustOptimistic: solution.robustOptimistic,
        robustMaxRegret: solution.robustMaxRegret,
        minimaxUnits: solution.minimaxUnits,
        minimaxMaxRegret: solution.minimaxMaxRegret,
        optimisticUnits: solution.optimisticUnits,
        optimisticWorstCase: solution.optimisticWorstCase,
        priceOfFairness: solution.priceOfFairness,
        committedHours: solution.committedHours,
        committedBudget: solution.committedBudget,
        stressSwitches: solution.stressSwitches,
        topExposureAction: solution.topExposureAction,
        regretRelease: solution.regretRelease,
        certificate: solution.certificate || null,
      };
      const today = dayKey(clock());
      store.update((draft) => {
        const row = (draft.robustPlans || []).find((p) => p && p.id === planId);
        if (row) {
          row.status = 'adopted';
          row.adoptedOn = today;
          row.frozen = frozen;
        }
      }, {
        type: ROBUST_ALLOCATION_EVENTS.ADOPTED,
        entity: 'robustplan',
        entityId: plan.id,
        summary: `Adopted the robust allocation (${solution.robustUnits.filter((u) => u > 0).length} funded line(s), worst case ${solution.robustWorstCase}); governed work, typed provenance and vertical roll-up requested`,
      });
      return saved({ id: plan.id, existing: false, frozen, report: report(plan.id) });
    },

    /** Explicitly scan for falsified, overdue and ungraded premises in this seat's scope. */
    robustAllocationScan() {
      const right = seatRight();
      if (!right.ok) return fail(right.error);
      const full = right.seat.fullAccess;
      store.update(() => {}, {
        type: ROBUST_ALLOCATION_EVENTS.SCAN,
        entity: full ? 'workspace' : 'robustallocation',
        entityId: full ? 'all' : right.seat.id,
        summary: 'Explicitly scanned adopted allocations for falsified, overdue and ungraded premises and opened bounded governed findings',
      });
      return saved({ report: report() });
    },

    /** Director+ only: these conventions bound what every altitude below reads. */
    robustAllocationSetConventions({ cellFloor = null, reviewDays = null, maxCombinations = null, nodeBudget = null } = {}) {
      const right = seatRight();
      if (!right.ok) return fail(right.error);
      if (right.seat.rank < 3) return fail('The allocation conventions are set at director rank and above; they bound what every altitude reads.');
      const patch = {
        ...(cellFloor === null ? {} : { robustAllocationCellFloor: cellFloor }),
        ...(reviewDays === null ? {} : { robustAllocationReviewDays: reviewDays }),
        ...(maxCombinations === null ? {} : { robustAllocationMaxCombinations: maxCombinations }),
        ...(nodeBudget === null ? {} : { robustAllocationNodeBudget: nodeBudget }),
      };
      const next = robustAllocationConventions({ ...store.state.settings, ...patch });
      const current = robustAllocationConventions(store.state.settings || {});
      if (Object.keys(next).every((key) => next[key] === current[key])) {
        return fail('The declared cell, review and solver conventions are unchanged; nothing was written.');
      }
      store.update((draft) => {
        draft.settings = { ...draft.settings, ...next };
      }, {
        type: ROBUST_ALLOCATION_EVENTS.CONVENTIONS,
        entity: 'settings',
        entityId: 'robustAllocation',
        summary: `Robust allocation conventions set: cell floor ${next.robustAllocationCellFloor}, review ${next.robustAllocationReviewDays}d, enumeration bound ${next.robustAllocationMaxCombinations}, node budget ${next.robustAllocationNodeBudget}`,
      });
      return saved({ conventions: next, report: report() });
    },
  };
}
