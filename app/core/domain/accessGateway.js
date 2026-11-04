/**
 * Central API mutation/read boundary for declared seats. Unknown methods fail
 * closed. The undeclared local operator keeps the existing workflow. This is
 * not authentication: the browser owner can switch seats or read localStorage.
 */
import { activeSeat, buildSeats, canAct, canSee, recordPeople } from './seat.js';
import { responsibleNodeId } from './chain.js';
import { routeVerdict } from './seatRegistry.js';
import { validateMissionCommands } from './mission.js';

const groups = [
  ['log-oneonone', 'updatePerson logOneOnOne toggleMeetingAction addMeetingAction addFeedback updateFeedback completeFollowUp saveGrowthPlan updateGrowthPlan addWillAction toggleWillAction carryWillAction dropWillAction logGrowthReview addRecognition setReadiness createReview updateReflection updateAssessment refreshReviewEvidence completeReview reopenReview createOnboardingPlan updateOnboardingPlan addOnboardingCheckpoint toggleOnboardingCheckpoint removeOnboardingCheckpoint addOnboardingStakeholder toggleOnboardingStakeholder removeOnboardingStakeholder recordOnboardingReview addManagerSupportCommitment toggleManagerSupportCommitment completeOnboardingPlan reopenOnboardingPlan addPerformanceConcern updatePerformanceConcern addPerformanceObservation removePerformanceObservation recordPerformanceConversation recordPerformanceSupport adoptPerformancePlan reviewPerformancePlan withdrawPerformanceConcern deletePerformanceConcern'],
  ['log-conflict', 'addConflict updateConflict agreeConflict completeConflictAction followUpConflict resolveConflict escalateConflict reopenConflict'],
  ['open-case', 'addCase updateCase requestMitigationReview syncCaseAutomations resolveCase recordCaseActuals reopenCase deleteCase linkCaseEntity removeMissingCaseMitigation refreshCaseAutomation'],
  ['open-decision', 'addDecision updateDecision decideDecision reviewDecision withdrawBundleDecision addGoal updateGoal checkInGoal addKeyResult removeKeyResult'],
  ['delegate', 'addDelegation updateDelegation checkInDelegation completeDelegation returnDelegation redelegateReturnedOutcome setActionOwner'],
  ['test-assumption', 'addPremise updatePremise recordPremiseEvidence reviewPremise recordPremiseOutcome withdrawBundlePremise'],
  ['prepare-comms', 'approveCommsDraft editCommsDraft markCommsDraftSent dismissCommsDraft'],
  ['set-disclosure-floor', 'setMissionFloor'],
  ['offer-authority', 'proposeMandate acceptMandate deliverMandate verifyMandate returnMandate revokeMandate scanMandates'],
  ['approve-capital', 'addBudgetLine updateBudgetLine recordBudgetActual releaseBudgetLine deleteBudgetLine'],
  ['coordinate-intervention', 'createActionBundle updateActionBundle saveActionBundlePreview commitActionBundle withdrawActionBundle archiveActionBundle'],
  ['declare-seat', 'setActiveSeat scanSeats'],
  // ADR-0081: reviewed altitude routing. Every method is declared; an unknown
  // name still fails closed. Reads are safe; writes pass the person/span gate.
  ['route-intake', 'routingSaveDraft routingConfirm routingDismiss routingGrade routingScan routingSetConventions'],
  // ADR-0083: the Concordance Terminal. Every method is declared; an unknown
  // name still fails closed. A round may only be opened and read inside the
  // leader's own span.
  ['close-expectation-round', 'concordanceOpenRound concordanceSubmit concordanceWithdraw concordanceScan concordanceSetConventions'],
  // ADR-0082: the Sealed Spine. sealScan writes only an audit event (a
  // verified read with a trace); the pure reads are SAFE_READS below. Enabling
  // or pausing sealing is operator-only and stays fail-closed under a seat.
  ['audit-seal', 'sealScan'],
  // ADR-0084: the Operating Model. Declarations and priced items only. Every
  // method is declared; an unknown name still fails closed.
  ['author-operating-model', 'omDeclareSplit omRemoveSplit omDeclareEdge omRemoveEdge omPriceItem omRemoveItem omSetNorms operatingModelScan'],
  // ADR-0084: Hoshin Kanri & Catchball Cascade reviewed commands. Each handler
  // additionally enforces subtree + bilateral receiver consent inside catchballActions.
  ['negotiate-catchball', 'catchballPropose catchballCounter catchballAccept catchballCheckin catchballSettle catchballWithdraw catchballUpdateSettings catchballScan'],
];
export const API_RIGHTS = Object.freeze(Object.fromEntries(groups.flatMap(([right, names]) => names.split(' ').map((name) => [name, right]))));
const FIRST_ID_COLLECTION = Object.freeze({
  updatePerson: 'people', archivePerson: 'people', restorePerson: 'people',
  logOneOnOne: 'oneOnOnes', toggleMeetingAction: 'oneOnOnes', addMeetingAction: 'oneOnOnes',
  updateFeedback: 'feedback', completeFollowUp: 'feedback',
  updateCase: 'cases', resolveCase: 'cases', recordCaseActuals: 'cases', reopenCase: 'cases', deleteCase: 'cases', refreshCaseAutomation: 'cases', syncCaseAutomations: 'cases', requestMitigationReview: 'cases', linkCaseEntity: 'cases', removeMissingCaseMitigation: 'cases',
  updateDecision: 'decisions', decideDecision: 'decisions', reviewDecision: 'decisions', withdrawBundleDecision: 'decisions',
  updateDelegation: 'delegations', checkInDelegation: 'delegations', completeDelegation: 'delegations', returnDelegation: 'delegations', redelegateReturnedOutcome: 'delegations',
  addBudgetLine: 'budgets', updateBudgetLine: 'budgets', recordBudgetActual: 'budgets', releaseBudgetLine: 'budgets', deleteBudgetLine: 'budgets',
  addPremise: 'premises', updatePremise: 'premises', recordPremiseEvidence: 'premises', reviewPremise: 'premises', recordPremiseOutcome: 'premises', withdrawBundlePremise: 'premises',
  approveCommsDraft: 'commsDrafts', editCommsDraft: 'commsDrafts', markCommsDraftSent: 'commsDrafts', dismissCommsDraft: 'commsDrafts',
  createActionBundle: 'cases', updateActionBundle: 'actionBundles', saveActionBundlePreview: 'actionBundles', commitActionBundle: 'actionBundles', withdrawActionBundle: 'actionBundles', archiveActionBundle: 'actionBundles',
});
const SAFE_READS = new Set(['operatingModelRead', 'operatingModelNorms', 'operatingModelBriefText', 'operatingModelCsvRows', 'operatingModelAttentionCount', 'operatingModelWorkTypes', 'concordanceRead', 'concordanceStats', 'concordanceBriefText', 'concordanceCsvRows', 'concordanceAttentionCount', 'routingRead', 'routingCalibration', 'routingBriefText', 'routingCsvRows', 'routingAttentionCount', 'routingAnalyze', 'seatRead', 'seatBriefText', 'missionRead', 'missionOpenCase', 'missionBriefText', 'missionHandoffText', 'setActiveSeat', 'missionCreateIntervention', 'saveMissionPreview', 'missionCommit', 'missionWithdraw', 'missionArchive', 'missionFreezeBrief', 'missionScan', 'mandateRead', 'mandateBriefText', 'previewMandate', 'sealRead', 'sealVerify', 'sealBriefText', 'catchballRead', 'catchballPreviewFeasibility', 'catchballBriefText', 'catchballCsvRows']);
const refusal = (reason) => ({ ok: false, code: 'scope-refusal', error: reason, field: 'scope' });

function payloadPeople(args) {
  const out = new Set();
  function walk(value, depth = 0) {
    if (depth > 7 || !value || typeof value !== 'object') return;
    for (const id of recordPeople(value)) out.add(id);
    for (const v of Object.values(value)) if (v && typeof v === 'object') walk(v, depth + 1);
  }
  walk(args); return [...out];
}
function bundleSourceAllowed(state, sourceId, seat, built) {
  const c = (state.cases || []).find((r) => r.id === sourceId);
  if (!c) return false;
  if (canSee(c, 'cases', seat, built).allow === 'full') return true;
  return seat.rank >= 3 && responsibleNodeId(built.chain, recordPeople(c)) === seat.id;
}
function bundleFor(state, name, args) {
  if (name === 'createActionBundle') return args[0];
  const id = name === 'saveActionBundlePreview' ? args[0] : args[0];
  return (state.actionBundles || []).find((b) => b.id === id);
}

/** Exact method allowlist + rank + record/person scope. No arbitrary API names. */
export function guardApiCall(state, name, args) {
  if (!state.settings?.activeSeatId) return { ok: true };
  let built; let seat;
  try { built = buildSeats(state, { settings: state.settings }); seat = activeSeat(built); }
  catch { return refusal('The operating seat could not be resolved. No record was read or changed.'); }
  if (seat.readOnly && name !== 'setActiveSeat') return refusal('The operating seat is unresolved. Declare a valid seat first.');
  if (SAFE_READS.has(name)) return { ok: true, seat, built };
  // Module automation pauses are reviewed settings adapters. Seat identity and
  // disclosure floors still require their own rank-gated commands.
  if (name === 'updateSettings') {
    const patch = args[0];
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return refusal('Settings updates must be a declared patch object.');
    const keys = Object.keys(patch);
    if (keys.some((k) => !k.endsWith('AutoPropagate'))) return refusal('Under a declared seat, settings updates are limited to module automation pauses. Use the rank-gated seat/disclosure commands for identity and disclosure.');
    return { ok: true, seat, built };
  }
  const right = API_RIGHTS[name];
  if (!right) return refusal(`“${name}” has no reviewed seat-scoped adapter. Use Mission Control, or explicitly hand over to the local operator view for the legacy workspace.`);
  const verdict = canAct(right, seat);
  if (!verdict.allow) return refusal(verdict.reason);
  const collection = FIRST_ID_COLLECTION[name];
  if (collection && typeof args[0] === 'string' && !['addCase', 'addDecision', 'addDelegation', 'addPremise', 'createActionBundle'].includes(name)) {
    if (collection === 'actionBundles') {
      const b = bundleFor(state, name, args);
      if (!b) return refusal('The intervention no longer exists.');
      const c = (state.cases || []).find((r) => r.id === b.sourceId);
      if (!c || !bundleSourceAllowed(state, b.sourceId, seat, built)) return refusal('The intervention source is outside this seat’s detail boundary.');
    } else {
      const record = (state[collection] || []).find((r) => r.id === args[0]);
      if (!record || canSee(record, collection, seat, built).allow !== 'full') return refusal('The target record is missing or outside this seat’s detail boundary.');
      if (!recordPeople(record).length && !seat.isLeader) {
        const inScopedBundle = (state.actionBundles || []).some((b) => b.outputs?.some((o) => o.id === record.id)
          && (state.cases || []).some((c) => c.id === b.sourceId && canSee(c, 'cases', seat, built).allow === 'full'));
        if (!inScopedBundle) return refusal('Unowned work belongs to the enterprise root. A subordinate seat cannot mutate it without a scoped source contract.');
      }
      if (collection === 'budgets' && !record.ownerId && !seat.isLeader) return refusal('An unowned budget envelope belongs to the enterprise root, not to every executive.');
    }
  }
  const unknown = payloadPeople(args).filter((id) => !seat.scope.has(id));
  if (unknown.length) return refusal('The request names a person outside the operating span. Escalate through the common leader instead of crossing a peer boundary.');
  if (['createActionBundle', 'updateActionBundle', 'saveActionBundlePreview', 'commitActionBundle', 'withdrawActionBundle', 'archiveActionBundle'].includes(name)) {
    const b = bundleFor(state, name, args);
    if (!b || !Array.isArray(b.commands)) return refusal('A reviewed intervention is required.');
    if (!bundleSourceAllowed(state, b.sourceId, seat, built)) return refusal('The intervention source is outside this seat’s operating span.');
    const rankVerdict = validateMissionCommands(b.commands, seat.rank);
    if (!rankVerdict.ok) return refusal(rankVerdict.error);
    for (const command of b.commands) {
      if (command.ownerId && !seat.scope.has(command.ownerId)) return refusal('An intervention owner is outside the operating span.');
      if (command.budgetId) {
        const budget = (state.budgets || []).find((r) => r.id === command.budgetId);
        if (!budget || canSee(budget, 'budgets', seat, built).allow !== 'full' || (!budget.ownerId && !seat.isLeader)) return refusal('The budget envelope is outside this seat’s authority.');
      }
    }
  }
  return { ok: true, seat, built };
}
export function guardApi(api, store) {
  return Object.fromEntries(Object.entries(api).map(([name, fn]) => [name, (...args) => {
    if (store.writeBlockReason) return { ok: false, error: store.writeBlockReason };
    const verdict = guardApiCall(store.state, name, args);
    return verdict.ok ? fn(...args) : verdict;
  }]));
}

/** Supported, scoped surfaces. Legacy screens are not falsely labelled safe. */
export function workspaceRouteVerdict(route, seat) {
  const base = routeVerdict(route, seat);
  if (!base.allow || !seat || seat.fullAccess || seat.readOnly) return base;
  // ADR-0081: the Altitude Router completed its seat-scoped read audit — its
  // read model filters plans to the operating subtree and withholds item detail
  // above the manager rank, so a declared seat may open it directly.
  // ADR-0082: the Integrity surface is a reviewed scoped surface — its reads go
  // through sealRead, which collapses out-of-subtree spans to aggregate rows.
  // ADR-0084: the Operating Model completed its seat-scoped read audit — the
  // roll-up filters to the operating subtree, everything more than one level
  // below the reader collapses to ONE aggregate row per level, and position
  // detail is replaced above director rank. A declared seat may open it.
  if (['mission', 'today', 'seat', 'routing', 'seal', 'operating-model', 'catchball'].includes(route)) return base;
  return { allow: false, reason: 'This legacy module has not yet completed its seat-scoped read audit. Its work still contributes to Mission Control. Open the scoped command center, or explicitly hand over to the local operator view for the full legacy workspace.' };
}
