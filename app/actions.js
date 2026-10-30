/**
 * app/actions.js — every mutation in the application.
 *
 * Views never touch the store directly. Each action validates its input,
 * returns `{ok:false, error}` instead of throwing, and records an event so the
 * audit trail explains what changed and when. No DOM access lives here, which
 * is what makes the write path testable.
 */

import { addDays, dayKey, daysBetween } from './core/time.js';
import { analyzeMitigationRobustness, robustnessEvidenceKey, robustnessDecision, ROBUSTNESS_EVENT } from './core/domain/mitigationRobustness.js';
import { DEFAULT_POST_COMMIT_RULES } from './core/domain/postCommit.js';
import { propagationReceiptById, propagationRetryPlan } from './core/domain/propagationLedger.js';
import {
  CONTINUITY_DEFAULT_HORIZON_DAYS,
  buildLeaderContinuityReport,
  continuityBrief,
  coverPlanKey,
  scoreDrillRecord,
} from './core/domain/leaderContinuity.js';
import {
  CONTINUITY_COVER_EVENT,
  CONTINUITY_DRILL_EVENT,
  CONTINUITY_SCAN_EVENT,
} from './core/domain/leaderContinuityRule.js';
import {
  MEASUREMENT_STATUSES,
  buildMeasurementReport,
  evaluateDesign,
  freezeMeasurementPrediction,
  measurementBrief,
  normalizeMeasurementTask,
  scorecardDesignKey,
  scorecardIntegrity,
} from './core/domain/measurement.js';
import {
  SCORECARD_COMMITTED_EVENT,
  SCORECARD_OBSERVED_EVENT,
} from './core/domain/measurementRule.js';
import { approvalGate, COMMS_MAX_BODY, COMMS_MAX_CHANNEL, COMMS_OPEN_STATUSES, stakeholderKeyOf } from './core/domain/comms.js';
import {
  ACTION_OWNERS,
  CONFIDENCE,
  LEVELS,
  PULSE_DIMENSIONS,
  REVIEW_RATINGS,
  ONBOARDING_HORIZONS,
  ONBOARDING_CATEGORIES,
  ONBOARDING_KINDS,
  FORECAST_CHALLENGE_STATUSES,
  IMPACT_ALPHAS,
  IMPACT_INTERVENTION_IDS,
  normalizeTalkingPoints,
} from './core/schema.js';
import { buildReviewEvidence, calibrateReview, reviewReadiness, validPeriod } from './core/domain/reviews.js';
import {
  DELAY_PROFILES,
  TEMPO_SCHEDULE_STATUSES,
  buildTempoReport,
  classifyDecisionType,
  decisionValueTerms,
  evaluateDecisionTiming,
  guardrailDaysFor,
  scheduleDefaults,
} from './core/domain/decisionTempo.js';
import {
  DEPENDENCY_CRITICALITIES,
  DEPENDENCY_KINDS,
  DEPENDENCY_STATUSES,
  DRILL_KINDS,
  DRILL_OUTCOMES,
  STEWARD_ROLES,
  SUBSTITUTABILITY_MODES,
  buildResilienceReport,
  simulateDisruptionScenario,
} from './core/domain/resilience.js';
import {
  POWER_CELLS,
  POWER_CONFIDENCE,
  POWER_DEFAULT_QUOTA_PCT,
  POWER_MIN_PLAYERS,
  POWER_STATUSES,
  normalizeCells,
  normalizePlayers,
} from './core/domain/power.js';
import { EW_VERDICTS, EW_VERDICT_LABELS, readWatchPolicy } from './core/domain/earlyWarning.js';
import { validateWatchResponse } from './core/domain/watchResponse.js';
import {
  BET_VERDICT_KEYS,
  buildStrategyReport,
  normalizeStrategyBetPayload,
  normalizeStrategyTagPayload,
  strategyBrief,
} from './core/domain/strategy.js';
import {
  AAR_QUESTIONS,
  CHANGE_TYPE_KEYS,
  LESSON_CLASS_KEYS,
  LESSON_STATES,
  buildLearningReport,
  findSubject,
  learningBrief,
  lessonEvidenceCandidates,
  normalizeLessonPayload,
  normalizeRetroPayload,
  subjectEvidence,
  subjectTypeSpec,
} from './core/domain/learning.js';
import { goalProgress } from './core/domain/goals.js';
import {
  DYN_LEVERS,
  DYN_MAX_HORIZON_WEEKS,
  DYN_MIN_HORIZON_WEEKS,
  buildDynamicsReport,
  evaluatePolicy,
  normalizeDynamicsExperimentPayload,
} from './core/domain/dynamics.js';
import {
  CAP_DEFAULT_BUDGET_UNITS,
  CAP_EFFORT_BOOK,
  CAP_MAX_BUDGET_UNITS,
  CAP_MIN_BUDGET_UNITS,
  CAP_OBJECTIVE_WEIGHTS,
  allocate,
  buildCapitalReport,
  effortOf,
  normalizeCapitalPolicyPayload,
  normalizeDynamicsCheckpointPayload,
  scoreCheckpoint,
} from './core/domain/policyPortfolio.js';
import {
  PREMISE_EVIDENCE_STRENGTHS,
  evaluatePremiseCore,
  makeManualPremiseObservation,
  normalizePremisePayload,
} from './core/domain/premises.js';
import {
  rankHardeningInterventions,
  simulateCoupledPortfolio,
} from './core/domain/continuityCoupling.js';
import {
  COUPLING_SCAN_EVENT,
  buildContinuityCouplingBrief,
} from './core/domain/continuityCouplingRule.js';
import { VITALS, VITAL_BY_ID } from './core/domain/vitals.js';
import {
  INTERVENTION_BY_ID,
  evaluateStudy,
  gradeOf,
  studyHorizonEnd,
  studyStatusOf,
  VERDICTS,
} from './core/domain/impact.js';
import { buildImpactExecutionSnapshot, interventionRecordFor } from './core/domain/impactExecution.js';
import {
  AGREEMENT_LABELS,
  FIDELITY_STAGE_KEYS,
  FIDELITY_VERDICTS,
  FIDELITY_VERDICT_LABELS,
  defaultStageTargets,
  observeFidelity,
  stageAgreement,
  suggestedPlannedUnits,
} from './core/domain/fidelity.js';
import { FIDELITY_MAX_NOTE, FIDELITY_MAX_WINDOW_DAYS } from './core/domain/fidelitySchema.js';
import {
  COMP_CONVENTIONS,
  COMP_DIMENSIONS,
  COMP_DIMENSION_LABELS,
  COMP_ORIGINS,
  fairnessReading,
  policyComparison,
} from './core/domain/comp.js';
import {
  COMP_HISTORY_CAP,
  COMP_MAX_BUDGET,
  COMP_MAX_NOTE,
  COMP_MAX_PAY,
  COMP_MAX_ROWS,
  buildFairnessSnapshot,
} from './core/domain/compSchema.js';
import {
  COMP_DECLARED_EVENT,
  COMP_FINALIZED_EVENT,
  COMP_SCANNED_EVENT,
  COMP_UPDATED_EVENT,
} from './core/domain/compRules.js';
import {
  TRANSITION_CONVENTIONS,
  TRANSITION_CRITERIA,
  TRANSITION_DIMENSIONS,
  TRANSITION_GATES,
  TRANSITION_KINDS,
  transitionReading,
} from './core/domain/transition.js';
import {
  TRANSITION_MAX_NOTE,
  buildTransitionSnapshot,
} from './core/domain/transitionSchema.js';
import {
  ORG_COMMITTED_EVENT,
  ORG_DECLARED_EVENT,
  ORG_REVERTED_EVENT,
  ORG_SCANNED_EVENT,
  ORG_SETTLED_EVENT,
  ORG_UPDATED_EVENT,
} from './core/domain/orgDesignRules.js';
import {
  buildStructure,
  conventionsFromSettings,
  designContract,
  freezeDesignSnapshot,
  simulateDesign,
} from './core/domain/orgDesign.js';
import { normalizeOrgConventions, ORG_DESIGN_MAX_MOVES } from './core/domain/orgDesignSchema.js';
import {
  INQUIRY_DECLARED_EVENT,
  INQUIRY_SETTLED_EVENT,
  VOI_DECIDED_EVENT,
  VOI_DECLARED_EVENT,
  VOI_SCANNED_EVENT,
  VOI_UPDATED_EVENT,
} from './core/domain/valueOfInformationRules.js';
import {
  INQUIRY_SIGNALS,
  VOI_MAX_OPTIONS,
  VOI_MAX_STATES,
  evaluateFrame,
  evaluateInquiry,
  likelihoodRatioFor,
  posteriorAfterSignal,
  conventionsFromSettings as voiConventionsFromSettings,
} from './core/domain/valueOfInformation.js';
import {
  ATT_COMMITTED_EVENT,
  ATT_REVIEWED_EVENT,
} from './core/domain/attentionMarketRules.js';

import {
  SIGNAL_DECLARED_EVENT,
  SIGNAL_LEVER_EVENT,
  SIGNAL_LEARNED_VIA,
  SIGNAL_PROBED_EVENT,
  SIGNAL_TRUTHS,
  buildReportingIndex,
  buildSignalReport,
  conventionsFromSettings as signalConventions,
  evaluateChannel,
  hopsFor,
  priceLevers,
  readClass,
  signalBrief,
} from './core/domain/signalPath.js';
import { freezeSignalPrediction } from './core/domain/signalPathSchema.js';
import {
  ATT_MAX_BUDGET_HOURS,
  buildAttentionMarket,
  conventionsFromSettings as attConventionsFromSettings,
  freezePlan,
  scoreAttentionPlan,
} from './core/domain/attentionMarket.js';
import {
  activationGate,
  agreementTemplate,
  autopilotBrief,
  rehearsePolicy,
} from './core/domain/autopilot.js';
import { normalizePolicyPayload } from './core/domain/autopilotSchema.js';
import { AUTOPILOT_LIMITS } from './core/domain/autopilotRegistry.js';
import {
  VOI_CURRENCIES,
  VOI_MAX_LABEL,
  VOI_MAX_NOTE,
  VOI_MAX_QUESTION,
  VOI_MAX_STATE_LABEL,
} from './core/domain/valueOfInformationSchema.js';
import {
  TRANSITION_DECIDED_EVENT,
  TRANSITION_DECLARED_EVENT,
  TRANSITION_FINALIZED_EVENT,
  TRANSITION_GATE_EVENT,
  TRANSITION_SCANNED_EVENT,
  TRANSITION_UPDATED_EVENT,
} from './core/domain/transitionRules.js';
import {
  FIDELITY_ATTESTED_EVENT,
  FIDELITY_DECLARED_EVENT,
  FIDELITY_SCAN_EVENT,
  FIDELITY_SETTLED_EVENT,
  FIDELITY_UPDATED_EVENT,
} from './core/domain/fidelityRules.js';
import { createConflictActions } from './conflict-actions.js';
import { DELEGATION_AUTHORITY } from './core/domain/delegations.js';
import {
  starterCheckpointsForKind,
  planKind,
  planKindNoun,
  planKindRecordNoun,
} from './core/domain/onboarding.js';
import { isOpenWill } from './core/domain/growth.js';
import { isOpenAction, OWNER_LABELS } from './core/domain/oneonone.js';
import {
  classifyMendelowStakeholder,
  CASE_KINDS,
  CASE_STATUSES,
  FORBIDDEN_LINK_TYPES,
  LINK_ENTITY_TYPES,
  LINK_RELATIONS,
  SYSTEM_GENERATED_LINK_RELATIONS,
  STAKEHOLDER_CADENCES,
  STAKEHOLDER_STANCES,
  isCaseOpen,
  resolveLinkedEntity,
} from './core/domain/cases.js';
import {
  cadenceDaysOffset,
  buildCaseFromRestrainingForce,
  buildCaseFromUpstreamEntity,
  buildChangeFromCase,
  ensureEntityLink,
  evaluateCapacityTradeoff,
  clearPortfolioForecast,
  evaluateCalibrationGovernance,
  evaluateCaseCalibrationGovernance,
  evaluateMonteCarloTailRisk,
  freezeCaseForecast,
  freezePortfolioForecast,
  onCandidateHired,
  onDelegationCompleted,
  propagateCaseEvent,
  propagateCaseResolution,
  refreshCalibratedCaseCapacityReserves,
  propagateChangeEvent,
  propagateChangeStatus,
  propagatePortfolioDecision,
  propagateScenarioCommitment,
  syncCaseCapacityReserve,
  syncCaseCoachingPromptPhase,
  syncChangeCapacityReserve,
  syncRequisitionCapacity,
  buildCaseFromNegotiationImpasse,
  propagateNegotiationAgreement,
  propagateNegotiationDelivery,
  propagateNegotiationEvent,
  propagateNegotiationSettlement,
  propagateNegotiationSettlementCalibration,
  propagateReturnedDelegationRecovery,
  propagateBudgetEvent,
  propagateBudgetActual,
  propagateSourceCompletionToBudgets,
  propagateStakeholderEvent,
  propagateStakeholderStanceShift,
  previewStakeholderPropagations,
} from './core/domain/automation.js';
import {
  ALLIANCE_KINDS,
  CADENCE_DAYS,
  STAKEHOLDER_CATEGORIES,
  STAKEHOLDER_STATUSES,
  classifyStanceShift,
} from './core/domain/stakeholders.js';
import {
  ESTIMATE_CONFIDENCE,
  NEGOTIATION_ISSUE_DIRECTIONS,
  NEGOTIATION_KINDS,
  NEGOTIATION_STATUSES,
  NEGOTIATION_TRANSITIONS,
  OPEN_NEGOTIATION_STATUSES,
  normalizeIssueInput,
  normalizeStringLists,
} from './core/domain/negotiation.js';
import { compareScenarios, countScenarioLevers } from './core/domain/scenarios.js';
import { forecastIntegrityReport } from './core/domain/forecastIntegrity.js';
import {
  INTAKE_ENGINE_VERSION,
  analyzeIntakeText,
  intakeCalibration,
  pendingIntakeDrafts,
  toCaseInput,
} from './core/domain/intake.js';
import {
  CHANGE_IMPACT_KINDS,
  CHANGE_KINDS,
  CHANGE_KIND_LABELS,
  CHANGE_STATUSES,
  CHANGE_STATUS_LABELS,
  FORCE_CATEGORIES,
  KOTTER_STEPS,
  STAR_PILLARS,
  TEAM_TOPOLOGY_TYPES,
  TOPOLOGY_INTERACTION_MODES,
} from './core/domain/changes.js';
import {
  ACTIVE_REQUISITION_STATUSES,
  CANDIDATE_OUTCOMES,
  CANDIDATE_OUTCOME_LABELS,
  CANDIDATE_STAGES,
  EVIDENCE_KIND_BY_ID,
  EVIDENCE_KIND_LABELS,
  OPEN_CANDIDATE_STAGES,
  REQUISITION_REASONS,
  REQUISITION_REASON_LABELS,
  REQUISITION_STATUSES,
  assessCandidate,
  nextStage as nextCandidateStage,
  processParity,
  stalledRequisitions,
} from './core/domain/hiring.js';
import {
  PORTFOLIO_DECISIONS,
  PORTFOLIO_HORIZONS,
  PORTFOLIO_KINDS,
  PORTFOLIO_SOURCE_TYPES,
  PORTFOLIO_STATUSES,
  buildCapacityModel,
} from './core/domain/capacity.js';
import {
  FORECAST_MAX_PCT,
  FORECAST_MIN_PCT,
  normalizeForecastPercent,
} from './core/domain/calibration.js';
import {
  BUDGET_CATEGORIES,
  BUDGET_LINE_STATUSES,
  BUDGET_SOURCE_TYPES,
  BUDGET_STATUSES,
} from './core/domain/finance.js';

/**
 * Validate an optional decision forecast ("P(this works out well)", %).
 * Blank stays blank (unknown is honest); a supplied value must be a real
 * probability inside Cromwell's 5–95 bounds — out-of-range input is rejected
 * with coaching rather than silently clamped, because the number the leader
 * meant is the number that will be scored.
 */
function readForecast(raw) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return { ok: false, error: 'Forecast must be a percentage, or left blank.', field: 'forecastProbability' };
  }
  if (n < FORECAST_MIN_PCT || n > FORECAST_MAX_PCT) {
    return {
      ok: false,
      error: `Keep forecasts between ${FORECAST_MIN_PCT}% and ${FORECAST_MAX_PCT}% — 0% and 100% are claims of certainty no operational call can defend, and they wreck calibration scoring.`,
      field: 'forecastProbability',
    };
  }
  return { ok: true, value: normalizeForecastPercent(n) };
}

/** Validate optional delivery actuals: blank = honestly unknown, never invented. */
function readActuals(data = {}) {
  const read = (raw, field, allowNegative) => {
    if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };
    const n = Number(raw);
    if (!Number.isFinite(n) || (!allowNegative && n < 0)) {
      return {
        ok: false,
        error: allowNegative ? 'Actual value must be a number, or left blank.' : 'Actual effort must be zero or more person-days, or left blank.',
        field,
      };
    }
    return { ok: true, value: Math.round(n * 100) / 100 };
  };
  const effort = read(data.actualEffortDays, 'actualEffortDays', false);
  if (!effort.ok) return effort;
  const value = read(data.actualValue, 'actualValue', true);
  if (!value.ok) return value;
  return { ok: true, actualEffortDays: effort.value, actualValue: value.value };
}

/**
 * `null` is a legal owner ("not decided yet"); anything else must be one of the
 * three real answers. A blank string from a form is normalised to null rather
 * than rejected — the field is optional, but a wrong value is never coerced
 * into a plausible one.
 */
function normalizeOwner(value) {
  if (value === null || value === undefined) return { ok: true, owner: null };
  const owner = typeof value === 'string' ? value.trim() : value;
  if (!owner) return { ok: true, owner: null };
  if (!ACTION_OWNERS.includes(owner)) {
    return { ok: false, error: 'Choose who owes this: them, you, or both.' };
  }
  return { ok: true, owner };
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function fail(error, field = null) {
  return { ok: false, error, field };
}

/** Validate the optional Impact source pointer against the shared typed registry. */
function impactInterventionSelection(state, typeValue, idValue, labelValue) {
  const rawType = clean(typeValue);
  const interventionType = rawType || 'other';
  const type = INTERVENTION_BY_ID[interventionType];
  if (!type) return fail('Choose a valid kind of intervention.', 'interventionType');
  if (idValue !== undefined && idValue !== null && typeof idValue !== 'string') {
    return fail('Choose a workspace record from the list, or leave it blank.', 'interventionId');
  }
  const interventionId = typeof idValue === 'string' ? idValue.trim() || null : null;
  if (interventionId && interventionId.length > 80) {
    return fail('That workspace record ID is too long to store safely. Reload and choose it from the list.', 'interventionId');
  }
  const record = interventionId ? interventionRecordFor(state, interventionType, interventionId) : null;
  if (interventionId && !record) {
    return fail('That record does not exist for this intervention kind. Choose a current record or clear the selection.', 'interventionId');
  }
  return {
    ok: true,
    interventionType,
    interventionId,
    interventionLabel: String(clean(labelValue) || record?.label || '').slice(0, 160),
  };
}

/**
 * RULE-INTAKE-07 helpers — measure human agreement with engine suggestions so
 * the calibration ledger can report an honest agreement rate (never labelled
 * ground-truth accuracy) once enough drafts have been confirmed.
 */
function countOfferedEntities(analysis) {
  const e = analysis?.entities || {};
  return (e.money?.length || 0)
    + (e.durations?.length || 0)
    + (e.percents?.length || 0)
    + (e.people?.length || 0)
    + (e.recurrence?.length || 0);
}

function countAcceptedEntities(analysis, caseInput) {
  const e = analysis?.entities || {};
  let accepted = 0;
  if ((e.money?.length || 0) > 0 && caseInput.financial && Number(caseInput.financial.mostLikely) > 0) accepted += 1;
  if ((e.durations?.length || 0) > 0 && caseInput.financial && Number(caseInput.financial.capacityDaysMostLikely) > 0) accepted += 1;
  if ((e.people?.length || 0) > 0) {
    const suggested = new Set(analysis.caseSuggestion?.involvedPersonIds || []);
    const kept = [...suggested].filter((pid) => (caseInput.involvedPersonIds || []).includes(pid));
    accepted += kept.length;
  }
  if ((e.recurrence?.length || 0) > 0 && analysis.fmeaPrior && caseInput.fmea
    && Number(caseInput.fmea.probability) === analysis.fmeaPrior.probability) accepted += 1;
  if ((e.percents?.length || 0) > 0) accepted += 0; // percents are informational only
  return accepted;
}

function diffCaseSuggestion(analysis, caseInput) {
  const suggestion = analysis?.caseSuggestion;
  if (!suggestion) return [];
  const changed = [];
  if (caseInput.kind !== suggestion.kind) changed.push('kind');
  if (caseInput.title && caseInput.title !== suggestion.title) changed.push('title');
  if ((caseInput.ownerId || null) !== (suggestion.ownerId || null)) changed.push('ownerId');
  if ((caseInput.linkedGoalId || null) !== (suggestion.linkedGoalId || null)) changed.push('linkedGoalId');
  if (JSON.stringify([...(caseInput.involvedPersonIds || [])].sort()) !== JSON.stringify([...(suggestion.involvedPersonIds || [])].sort())) {
    changed.push('involvedPersonIds');
  }
  if (suggestion.fmea) {
    if (Number(caseInput.fmea.severity) !== suggestion.fmea.severity) changed.push('fmea.severity');
    if (Number(caseInput.fmea.probability) !== suggestion.fmea.probability) changed.push('fmea.probability');
    if (Number(caseInput.fmea.detectability) !== suggestion.fmea.detectability) changed.push('fmea.detectability');
  }
  if (suggestion.financial) {
    for (const [field, key] of [
      ['optimistic', 'optimistic'], ['mostLikely', 'mostLikely'], ['pessimistic', 'pessimistic'],
      ['capacityDaysMostLikely', 'capacityDaysMostLikely'],
    ]) {
      if (Number(caseInput.financial[key]) !== Number(suggestion.financial[key])) changed.push(`financial.${field}`);
    }
  }
  return [...new Set(changed)];
}

function isCalendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Schema v22: parse settled case actuals from a resolve/record payload
 * (flat dialog fields or a nested `actuals` object). Every leg is optional
 * and independent — materialisation, realised exposure, mitigation spend and
 * diverted days are separate facts — and anything unrecorded stays null:
 * an unknown actual is never coerced to zero or borrowed from the estimate,
 * because that would fabricate the calibration being measured.
 */
function parseCaseActuals(data = {}) {
  const nested = data.actuals && typeof data.actuals === 'object' ? data.actuals : null;
  const src = nested || data;
  const rawMaterialised = src.materialised !== undefined ? src.materialised : data.actualsMaterialised;
  let materialised = null;
  if (rawMaterialised === true || rawMaterialised === 'yes' || rawMaterialised === 'true') materialised = true;
  else if (rawMaterialised === false || rawMaterialised === 'no' || rawMaterialised === 'false') materialised = false;
  else if (rawMaterialised !== undefined && rawMaterialised !== null && rawMaterialised !== '') {
    return fail('Record whether the risk materialised (yes/no), or leave it unrecorded.', 'actualsMaterialised');
  }
  const parseActual = (val, fieldName, label) => {
    if (val === undefined || val === null || val === '') return { ok: true, value: null };
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0) return fail(`${label} must be zero or positive — record what actually settled, never an estimate.`, fieldName);
    return { ok: true, value: Math.round(n * 100) / 100 };
  };
  const exposure = parseActual(src.realisedExposure, 'realisedExposure', 'Realised exposure');
  if (!exposure.ok) return exposure;
  const spend = parseActual(src.mitigationSpend, 'mitigationSpend', 'Actual mitigation spend');
  if (!spend.ok) return spend;
  const days = parseActual(src.divertedDays, 'divertedDays', 'Actual diverted days');
  if (!days.ok) return days;
  const note = (clean(src.note !== undefined ? src.note : data.actualsNote) || '').slice(0, 600);
  const provided = materialised !== null
    || exposure.value !== null
    || spend.value !== null
    || days.value !== null
    || Boolean(note);
  return {
    ok: true,
    provided,
    actuals: {
      materialised,
      realisedExposure: exposure.value,
      mitigationSpend: spend.value,
      divertedDays: days.value,
      note,
    },
  };
}

function delegationValidation(data) {
  if (!clean(data.title)) return { error: 'Name the outcome or responsibility being delegated.', field: 'title' };
  if (!clean(data.expectedOutcome)) return { error: 'Describe what a successful result will look like.', field: 'expectedOutcome' };
  if (!DELEGATION_AUTHORITY[data.authority]) return { error: 'Choose the decision authority being transferred.', field: 'authority' };
  if (!clean(data.support)) return { error: 'Record the resources, context or support the owner can rely on.', field: 'support' };
  if (!isCalendarDay(data.delegatedOn)) return { error: 'Choose a valid delegation date.', field: 'delegatedOn' };
  if (!isCalendarDay(data.dueOn)) return { error: 'Choose a valid due date.', field: 'dueOn' };
  if (data.dueOn < data.delegatedOn) return { error: 'The due date cannot be before the delegation date.', field: 'dueOn' };
  return null;
}


/** Non-negative money/day field; blank means "not recorded", never zero-by-default. */
function parseNonNegative(value, label, field) {
  if (value === undefined || value === null || value === '') return { ok: true, value: 0 };
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fail(`${label} must be zero or a positive number.`, field);
  return { ok: true, value: Math.round(n * 100) / 100 };
}

/**
 * Three-point effort for a hiring loop. Blank means "not estimated yet" and
 * reserves nothing: the app never substitutes a plausible-looking default for
 * an estimate the leader did not make.
 */
function parseEffort(source = {}) {
  const read = (key) => {
    const raw = source[key];
    if (raw === undefined || raw === null || raw === '') return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
  };
  const o = read('effortOptimistic');
  const m = read('effortMostLikely');
  const p = read('effortPessimistic');
  if ([o, m, p].some((v) => Number.isNaN(v))) {
    return fail('Effort estimates must be zero or positive numbers of person-days.', 'effortMostLikely');
  }
  if (o > m || m > p) {
    return fail('Keep the effort estimate ordered: optimistic ≤ most likely ≤ pessimistic.', 'effortMostLikely');
  }
  return { ok: true, triple: { optimistic: o, mostLikely: m, pessimistic: p } };
}

/**
 * Competencies are captured one per line as `Name`, `Name | weight`, or
 * `Name | weight | optional`. Existing ids are reused by name so recorded
 * evidence keeps pointing at the same competency across edits.
 */
function parseCompetencies(raw, idFactory, existingByName = new Map()) {
  const lines = String(raw || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const [namePart, weightPart, requiredPart] = line.split('|').map((part) => part.trim());
    const name = (namePart || '').slice(0, 120);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const weight = Math.min(5, Math.max(1, Math.round(Number(weightPart) || 1)));
    const required = !/^(optional|no|false|0)$/i.test(requiredPart || '');
    out.push({
      id: existingByName.get(key) || idFactory('cmp'),
      name,
      weight,
      required,
    });
  }
  return out;
}

/** Interviewers must be real, active team members; anything else is dropped. */
function normalizeInterviewers(raw, people) {
  const list = Array.isArray(raw) ? raw : [];
  const byId = new Map((people || []).filter((p) => p.status !== 'archived').map((p) => [p.id, p]));
  return [...new Set(list.map((value) => String(value || '').trim()).filter((value) => byId.has(value)))];
}

export function createApi(store, options = {}) {
  const id = options.idFactory || makeId;
  const clock = options.now || (() => new Date());
  const today = () => dayKey(clock());
  const stamp = () => clock().toISOString();

  const personExists = (personId) => store.state.people.some((p) => p.id === personId);
  const reviewById = (reviewId) => (store.state.reviews || []).find((review) => review.id === reviewId) || null;
  const validateReviewSource = (personId, rawReviewId) => {
    const sourceReviewId = clean(rawReviewId) || null;
    if (!sourceReviewId) return { ok: true, sourceReviewId: null };
    const review = reviewById(sourceReviewId);
    if (!review || review.status !== 'complete' || review.personId !== personId) {
      return fail('Choose a completed review for this same person, or remove the review source.', 'sourceReviewId');
    }
    return { ok: true, sourceReviewId: review.id };
  };
  const onboardingById = (planId) => (store.state.onboarding || []).find((plan) => plan.id === planId) || null;

  function append(draft, prefix) {
    return { id: id(prefix), createdAt: stamp() };
  }

  /**
   * A new development commitment in its full v9 shape.
   *
   * `addedOn` is the day it was written down, which is what "carried 2× since"
   * and the export's `first_agreed_on` derive from. Filling it here rather than
   * at render time means the date survives a later edit of the plan.
   */
  function newWillAction(personId, text, due, extra = {}) {
    return {
      id: id('ac'),
      text,
      due: due || null,
      addedOn: today(),
      done: false,
      completedOn: null,
      completedInReviewId: null,
      dropped: false,
      droppedOn: null,
      droppedReason: '',
      droppedInReviewId: null,
      personId,
      delegationId: null,
      carriedFromId: null,
      carriedToId: null,
      carriedInReviewId: null,
      ...extra,
    };
  }

  function validateDelegationLink(personId, rawDelegationId, plan = null) {
    const delegationId = clean(rawDelegationId) || null;
    if (!delegationId) return { ok: true, delegationId: null };
    const del = (store.state.delegations || []).find((d) => d.id === delegationId);
    if (!del || del.personId !== personId) {
      return fail('Choose a delegation owned by this person, or leave the link blank.', 'delegationId');
    }
    if (del.status === 'returned') {
      return fail('This delegation was returned to the leader; link an active or completed delegation instead.', 'delegationId');
    }
    if (plan && (plan.will || []).some((w) => !w.carriedToId && !w.dropped && w.delegationId === delegationId)) {
      return fail('This delegation is already linked to a commitment on this plan.', 'delegationId');
    }
    return { ok: true, delegationId: del.id };
  }

  const api = {
    ...createConflictActions(store, { now: clock, idFactory: id }),
    /* ------------------------------------------------------------ settings */
    updateSettings(patch) {
      const next = { ...patch };
      if (Object.hasOwn(next, 'pulseMinResponses')) {
        const value = next.pulseMinResponses;
        const floor = Number(value);
        if (value == null || typeof value === 'boolean' || !Number.isInteger(floor) || floor < 3 || floor > 25) {
          return fail('Choose a pulse privacy floor from 3 to 25 responses. Five is the default; a floor never guarantees anonymity.', 'pulseMinResponses');
        }
        next.pulseMinResponses = floor;
      }
      if (Object.hasOwn(next, 'hiringBaseRate')) {
        const value = Number(next.hiringBaseRate);
        if (!Number.isFinite(value) || value < 0.05 || value > 0.95) {
          return fail('The hiring base rate is an assumption between 5% and 95%. It shifts the estimate; it never decides anything.', 'hiringBaseRate');
        }
        next.hiringBaseRate = Math.round(value * 100) / 100;
      }
      if (Object.hasOwn(next, 'idleLockMinutes')) {
        const value = Number(next.idleLockMinutes);
        if (!Number.isInteger(value) || value < 0 || value > 480) {
          return fail('Idle lock must be a whole number of minutes from 0 (off) to 480 (8 hours).', 'idleLockMinutes');
        }
        next.idleLockMinutes = value;
      }
      if (Object.hasOwn(next, 'orgSpanMin') || Object.hasOwn(next, 'orgSpanMax')) {
        // Schema v53: the band is a declared convention, so a refused value is
        // better than a silently clamped one — a band the leader did not choose
        // would make every span signal on the page report a breach they never set.
        const min = Object.hasOwn(next, 'orgSpanMin') ? Number(next.orgSpanMin) : Number(store.state.settings.orgSpanMin);
        const max = Object.hasOwn(next, 'orgSpanMax') ? Number(next.orgSpanMax) : Number(store.state.settings.orgSpanMax);
        if (!Number.isInteger(min) || min < 1 || min > 30) return fail('The span band minimum must be a whole number from 1 to 30.', 'orgSpanMin');
        if (!Number.isInteger(max) || max < 2 || max > 40) return fail('The span band maximum must be a whole number from 2 to 40.', 'orgSpanMax');
        if (max <= min) return fail('The span band maximum has to be above its minimum, or no unit can ever be inside the band.', 'orgSpanMax');
        next.orgSpanMin = min;
        next.orgSpanMax = max;
      }
      if (Object.hasOwn(next, 'orgCoordinationHoursPerWeek')) {
        const value = Number(next.orgCoordinationHoursPerWeek);
        if (!Number.isFinite(value) || value < 0 || value > 12) {
          return fail('Coordination hours per channel must be between 0 and 12 per week.', 'orgCoordinationHoursPerWeek');
        }
        next.orgCoordinationHoursPerWeek = Math.round(value * 10) / 10;
      }
      if (Object.hasOwn(next, 'orgReviewHorizonDays')) {
        const value = Number(next.orgReviewHorizonDays);
        if (!Number.isInteger(value) || value < 30 || value > 730) {
          return fail('The structural review horizon must be a whole number of days from 30 to 730.', 'orgReviewHorizonDays');
        }
        next.orgReviewHorizonDays = value;
      }
      if (Object.hasOwn(next, 'orgAutoPropagate')) next.orgAutoPropagate = Boolean(next.orgAutoPropagate);
      if (Object.hasOwn(next, 'changeReviewDays')) {
        const value = Number(next.changeReviewDays);
        if (!Number.isInteger(value) || value < 3 || value > 180) {
          return fail('Change review cadence must be between 3 and 180 days.', 'changeReviewDays');
        }
        next.changeReviewDays = value;
      }
      for (const [key, lo, hi] of [
        ['dynamicsHorizonWeeks', 4, 52],
        ['dynamicsTargetWipWeeks', 1, 12],
        ['dynamicsPressureLagWeeks', 1, 12],
        ['dynamicsQualityFixWeeks', 2, 26],
        ['dynamicsRampWeeks', 2, 26],
        ['dynamicsStructuralRiskPct', 30, 95],
      ]) {
        if (!Object.hasOwn(next, key)) continue;
        const value = Number(next[key]);
        if (!Number.isInteger(value) || value < lo || value > hi) {
          return fail(`${key} must be a whole number between ${lo} and ${hi}.`, key);
        }
        next[key] = value;
      }
      if (Object.hasOwn(next, 'dynamicsAutoPropagate')) next.dynamicsAutoPropagate = Boolean(next.dynamicsAutoPropagate);
      if (Object.hasOwn(next, 'simulationSeed')) {
        const value = Number(next.simulationSeed);
        if (!Number.isInteger(value) || value < 1 || value > 999999999) {
          return fail('Simulation seed must be a whole number from 1 to 999,999,999.', 'simulationSeed');
        }
        next.simulationSeed = value;
      }
      if (Object.hasOwn(next, 'simulationTrials')) {
        const value = Number(next.simulationTrials);
        if (!Number.isInteger(value) || value < 200 || value > 5000) {
          return fail('Monte Carlo trial count must be between 200 and 5,000.', 'simulationTrials');
        }
        next.simulationTrials = value;
      }
      if (Object.hasOwn(next, 'forecastAutoPropagate')) {
        if (typeof next.forecastAutoPropagate !== 'boolean') {
          return fail('Automatic outside-view challenges must be either on or off.', 'forecastAutoPropagate');
        }
      }
      if (Object.hasOwn(next, 'forecastCoveragePct')) {
        const value = Number(next.forecastCoveragePct);
        if (!Number.isInteger(value) || value < 50 || value > 95) {
          return fail('Choose a conformal coverage target from 50% to 95%. The finite-sample bound is still shown.', 'forecastCoveragePct');
        }
        next.forecastCoveragePct = value;
      }
      if (Object.hasOwn(next, 'resilienceDrillDays')) {
        const value = Number(next.resilienceDrillDays);
        if (!Number.isInteger(value) || value < 0 || value > 1095) {
          return fail('Continuity drill reminder cadence must be 0 (off) or between 1 and 1,095 days.', 'resilienceDrillDays');
        }
        next.resilienceDrillDays = value;
      }
      if (Object.hasOwn(next, 'resilienceHhiWarn')) {
        const value = Number(next.resilienceHhiWarn);
        if (!Number.isInteger(value) || value < 1000 || value > 9000) {
          return fail('Concentration HHI guardrail must be a whole number from 1,000 to 9,000 (DOJ/FTC high concentration is 2,500).', 'resilienceHhiWarn');
        }
        next.resilienceHhiWarn = value;
      }
      if (Object.hasOwn(next, 'resilienceAutoPropagate')) {
        if (typeof next.resilienceAutoPropagate !== 'boolean') {
          return fail('Automatic resilience propagation must be either on or off.', 'resilienceAutoPropagate');
        }
      }
      if (Object.hasOwn(next, 'couplingMinFitPct')) {
        const value = Number(next.couplingMinFitPct);
        if (!Number.isInteger(value) || value < 20 || value > 90) {
          return fail('All-weather minimum fit target must be a whole percentage from 20% to 90%.', 'couplingMinFitPct');
        }
        next.couplingMinFitPct = value;
      }
      if (Object.hasOwn(next, 'couplingTailDropPct')) {
        const value = Number(next.couplingTailDropPct);
        if (!Number.isInteger(value) || value < 5 || value > 60) {
          return fail('Coupled fit-drop alert threshold must be a whole percentage-point gap from 5 to 60.', 'couplingTailDropPct');
        }
        next.couplingTailDropPct = value;
      }
      if (Object.hasOwn(next, 'couplingAutoPropagate')) {
        if (typeof next.couplingAutoPropagate !== 'boolean') {
          return fail('Automatic continuity-coupling propagation must be either on or off.', 'couplingAutoPropagate');
        }
      }
      if (Object.hasOwn(next, 'networkTiePct')) {
        const value = Number(next.networkTiePct);
        if (!Number.isInteger(value) || value < 0 || value > 90) {
          return fail('Tie-strength focus must be a whole number from 0 (show every real tie) to 90 (strongest ties only).', 'networkTiePct');
        }
        next.networkTiePct = value;
      }
      if (Object.hasOwn(next, 'networkAutoPropagate')) {
        if (typeof next.networkAutoPropagate !== 'boolean') {
          return fail('Automatic influence-network follow-through must be either on or off.', 'networkAutoPropagate');
        }
      }
      store.update(
        (draft) => {
          draft.settings = { ...draft.settings, ...next };
        },
        { type: 'settings.updated', entity: 'settings', summary: `Settings updated (${Object.keys(next).join(', ') || 'no change'})` },
      );
      return { ok: true, warning: store.persistError || null };
    },

    /**
     * Record a count-and-code-only audit entry when a sensitive or retention-
     * disclosed export completes, preserving an accountable trail of what left
     * the browser and which redactions were applied without storing any private
     * names in the event log.
     */
    recordExportDisclosure({ format = 'json-full', scope = null, findingCodes = [], redactions = {} } = {}) {
      const safeFormat = String(format || 'json-full').slice(0, 40);
      const safeScope = scope ? String(scope).slice(0, 40) : null;
      const codes = Array.isArray(findingCodes)
        ? findingCodes.map((c) => String(c).slice(0, 24)).filter(Boolean).slice(0, 10)
        : [];
      const flags = [];
      if (redactions?.redactConflicts) flags.push('conflicts-omitted');
      if (redactions?.pruneOverdueCandidates) flags.push('overdue-candidates-omitted');
      if (redactions?.redactStakeholderStances) flags.push('stakeholder-stances-scrubbed');
      const targetLabel = safeScope ? `${safeFormat}:${safeScope}` : safeFormat;
      const summary = [
        `Exported ${targetLabel}`,
        codes.length ? `disclosed [${codes.join(', ')}]` : null,
        flags.length ? `redactions (${flags.join(', ')})` : 'unredacted',
      ].filter(Boolean).join(' · ').slice(0, 280);
      store.update(() => {}, {
        type: 'export.disclosed',
        entity: 'workspace',
        summary,
      });
      return { ok: true };
    },

    /* -------------------------------------------------------------- people */
    addPerson(data) {
      const name = clean(data.name) || '';
      if (!name) return fail('A name is required.', 'name');
      const person = {
        id: id('person'),
        name,
        role: clean(data.role) || '',
        level: data.level || 'ic',
        team: clean(data.team) || store.state.settings.teamName,
        managerId: data.managerId || null,
        startDate: data.startDate || today(),
        focus: clean(data.focus) || '',
        talkingPoints: normalizeTalkingPoints(data.talkingPoints),
        status: 'active',
        createdAt: stamp(),
        archivedAt: null,
      };
      store.update(
        (draft) => {
          draft.people.push(person);
        },
        { type: 'person.created', entity: 'person', entityId: person.id, summary: `Added ${person.name}` },
      );
      return { ok: true, id: person.id };
    },

    updatePerson(personId, patch) {
      if (!personExists(personId)) return fail('That person is no longer in the roster.');
      const before = store.state.people.find((p) => p.id === personId);
      store.update(
        (draft) => {
          const person = draft.people.find((p) => p.id === personId);
          if (!person) return;
          Object.assign(person, {
            name: patch.name !== undefined ? clean(patch.name) || person.name : person.name,
            role: patch.role !== undefined ? clean(patch.role) : person.role,
            level: patch.level || person.level,
            team: patch.team !== undefined ? clean(patch.team) : person.team,
            managerId: patch.managerId !== undefined ? patch.managerId || null : person.managerId,
            startDate: patch.startDate !== undefined ? patch.startDate || person.startDate : person.startDate,
            focus: patch.focus !== undefined ? clean(patch.focus) : person.focus,
            talkingPoints: patch.talkingPoints !== undefined ? normalizeTalkingPoints(patch.talkingPoints) : person.talkingPoints,
          });
        },
        { type: 'person.updated', entity: 'person', entityId: personId, summary: `Updated ${before?.name || 'person'}` },
      );
      return { ok: true };
    },

    archivePerson(personId) {
      const person = store.state.people.find((p) => p.id === personId);
      if (!person) return fail('That person is no longer in the roster.');
      store.update(
        (draft) => {
          const target = draft.people.find((p) => p.id === personId);
          target.status = 'archived';
          target.archivedAt = stamp();
        },
        { type: 'person.archived', entity: 'person', entityId: personId, summary: `Archived ${person.name} (history kept)` },
      );
      return { ok: true };
    },

    restorePerson(personId) {
      store.update(
        (draft) => {
          const target = draft.people.find((p) => p.id === personId);
          if (target) {
            target.status = 'active';
            target.archivedAt = null;
          }
        },
        { type: 'person.restored', entity: 'person', entityId: personId, summary: 'Restored to the active roster' },
      );
      return { ok: true };
    },

    /* -------------------------------------------------------------1:1s */
    /**
     * Log a 1:1 and, optionally, what happened to the promises made earlier.
     *
     * Every open commitment the leader touched must get an explicit outcome:
     * done in this conversation, still open, carried into a later meeting, or
     * dropped with a reason. Untouched commitments stay open — silence is
     * never recorded as completion, and nothing is auto-carried, because an
     * item that quietly moves forward every week hides a real blocker.
     */
    logOneOnOne(data) {
      if (!personExists(data.personId)) return fail('Choose a person first.', 'personId');
      const person = store.state.people.find((p) => p.id === data.personId);
      const date = data.date || today();
      if (!isCalendarDay(date)) return fail('Choose a valid meeting date.', 'date');
      if (date > today()) return fail('A 1:1 cannot be logged before it has happened.', 'date');
      const status = ['held', 'skipped', 'moved'].includes(data.status) ? data.status : 'held';

      const planned = Array.isArray(data.reconciliations) ? data.reconciliations : [];
      if (planned.length && status !== 'held') {
        return fail('Only a 1:1 that was held can confirm what happened to an earlier commitment.', 'status');
      }
      const rawResolvedTopics = Array.isArray(data.resolvedTalkingPoints) ? data.resolvedTalkingPoints : [];
      const resolvedTopicList = normalizeTalkingPoints(rawResolvedTopics);
      if (resolvedTopicList.length && status !== 'held') {
        return fail('Only a 1:1 that was held can clear topics the person asked to raise.', 'status');
      }
      for (const action of Array.isArray(data.actions) ? data.actions : []) {
        if (action?.due && !isCalendarDay(action.due)) {
          return fail('Choose a valid due date for the action, or leave it blank.', 'actionDue');
        }
        const owner = normalizeOwner(action?.owner);
        if (!owner.ok) return fail(owner.error, 'actionOwner');
      }
      const seen = new Set();
      const applied = [];
      for (const item of planned) {
        const outcome = ['done', 'still-open', 'carried', 'dropped'].includes(item?.outcome) ? item.outcome : null;
        if (!outcome) return fail('Choose done, still open, carried forward or dropped for each promise.', 'reconciliations');
        const sourceType = item.sourceType === 'managerSupport' ? 'managerSupport' : 'oneOnOne';
        const due = item.due ? String(item.due) : null;
        let source = null;
        if (sourceType === 'managerSupport') {
          source = store.state.managerSupport.find((record) => record.id === item.managerSupportId);
          if (!source) return fail('That manager follow-up no longer exists. Reload and try again.', 'reconciliations');
          if (source.personId !== person.id) return fail('A commitment can only be reconciled with the person it concerns.', 'reconciliations');
          if (source.addedOn > date) return fail('A commitment cannot be settled in a conversation that happened before it was created.', 'date');
          if (source.status !== 'open') return fail(`"${source.text}" is already closed. Reload before logging this 1:1.`, 'reconciliations');
        } else {
          const sourceMeeting = store.state.oneOnOnes.find((m) => m.id === item.meetingId);
          const sourceAction = sourceMeeting?.actions.find((a) => a.id === item.actionId);
          if (!sourceMeeting || !sourceAction) return fail('That commitment no longer exists. Reload and try again.', 'reconciliations');
          if (sourceMeeting.personId !== person.id) return fail('A commitment can only be reconciled with the person it was agreed with.', 'reconciliations');
          if (sourceMeeting.date > date) return fail('A commitment cannot be settled in a conversation that happened before it was made.', 'date');
          if (!isOpenAction(sourceAction)) return fail(`"${sourceAction.text}" is already closed. Reload before logging this 1:1.`, 'reconciliations');
          source = { meeting: sourceMeeting, action: sourceAction };
        }
        const key = sourceType === 'managerSupport'
          ? `managerSupport|${source.id}`
          : `oneOnOne|${source.meeting.id}|${source.action.id}`;
        if (seen.has(key)) return fail('The same commitment was listed twice. Reload the form.', 'reconciliations');
        seen.add(key);
        if (outcome === 'still-open') continue;
        if (outcome === 'carried') {
          if (due && !isCalendarDay(due)) return fail('Choose a valid due date for the carried commitment, or leave it blank.', 'reconciliations');
          if (due && due < date) return fail('A carried commitment cannot be due before the 1:1 that moved it.', 'reconciliations');
        }
        if (outcome === 'dropped' && clean(item.reason).length > 300) {
          return fail('Keep the reason for dropping a commitment under 300 characters.', 'reconciliations');
        }
        applied.push({ sourceType, source, outcome, due, reason: clean(item.reason) || '' });
      }

      const meeting = {
        ...append(null, 'oo'),
        personId: data.personId,
        date,
        status,
        mood: data.mood ?? null,
        agenda: (data.agenda || []).map((a) => ({
          id: id('ag'),
          text: clean(a.text) || '',
          done: Boolean(a.done),
          source: a.source || 'manual',
        })).filter((a) => a.text),
        notes: clean(data.notes) || '',
        actions: (data.actions || [])
          .map((a) => ({
            id: id('ac'),
            text: clean(a.text) || '',
            due: a.due || null,
            done: false,
            completedOn: null,
            completedInMeetingId: null,
            dropped: false,
            droppedOn: null,
            droppedReason: '',
            droppedInMeetingId: null,
            personId: data.personId,
            owner: normalizeOwner(a.owner).owner,
            carriedFrom: null,
            carriedToMeetingId: null,
            carriedToActionId: null,
          }))
          .filter((a) => a.text),
      };

      const resolvedTopicKeys = new Set(resolvedTopicList.map((t) => t.toLowerCase()));
      const topicsCleared = status === 'held' && resolvedTopicKeys.size
        ? (person.talkingPoints || []).filter((t) => resolvedTopicKeys.has(t.toLowerCase())).length
        : 0;

      const closedCount = applied.filter((item) => item.outcome === 'done').length;
      const carriedCount = applied.filter((item) => item.outcome === 'carried').length;
      const droppedCount = applied.filter((item) => item.outcome === 'dropped').length;
      const parts = [];
      if (closedCount) parts.push(`${closedCount} promise${closedCount === 1 ? '' : 's'} closed`);
      if (carriedCount) parts.push(`${carriedCount} carried forward`);
      if (droppedCount) parts.push(`${droppedCount} dropped`);
      if (topicsCleared) parts.push(`${topicsCleared} employee topic${topicsCleared === 1 ? '' : 's'} covered`);

      store.update(
        (draft) => {
          draft.oneOnOnes.push(meeting);
          if (status === 'held' && resolvedTopicKeys.size) {
            const draftPerson = draft.people.find((p) => p.id === person.id);
            if (draftPerson && Array.isArray(draftPerson.talkingPoints)) {
              draftPerson.talkingPoints = draftPerson.talkingPoints.filter(
                (topic) => !resolvedTopicKeys.has(topic.toLowerCase()),
              );
            }
          }
          const live = draft.oneOnOnes.find((m) => m.id === meeting.id);
          for (const item of applied) {
            if (item.sourceType === 'managerSupport') {
              const source = draft.managerSupport.find((record) => record.id === item.source.id);
              if (!source || source.status !== 'open') continue;
              source.updatedAt = stamp();
              if (item.outcome === 'done') {
                source.status = 'done';
                source.completedOn = date;
                source.completedInMeetingId = meeting.id;
                continue;
              }
              if (item.outcome === 'dropped') {
                source.status = 'dropped';
                source.droppedOn = date;
                source.droppedReason = item.reason;
                source.droppedInMeetingId = meeting.id;
                continue;
              }
              const successor = {
                ...source,
                id: id('msup'),
                due: item.due,
                addedOn: date,
                status: 'open',
                completedOn: null,
                completedInMeetingId: null,
                droppedOn: null,
                droppedReason: '',
                droppedInMeetingId: null,
                carriedFromId: source.id,
                carriedFromMeetingId: meeting.id,
                carriedToId: null,
                carriedOn: null,
                carriedInMeetingId: null,
                createdAt: stamp(),
                updatedAt: stamp(),
              };
              source.status = 'carried';
              source.carriedToId = successor.id;
              source.carriedOn = date;
              source.carriedInMeetingId = meeting.id;
              draft.managerSupport.push(successor);
              continue;
            }
            const sourceMeeting = draft.oneOnOnes.find((m) => m.id === item.source.meeting.id);
            const sourceAction = sourceMeeting?.actions.find((a) => a.id === item.source.action.id);
            if (!sourceAction || !isOpenAction(sourceAction)) continue;
            if (item.outcome === 'done') {
              sourceAction.done = true;
              sourceAction.completedOn = date;
              sourceAction.completedInMeetingId = meeting.id;
              sourceAction.carriedToMeetingId = null;
              sourceAction.carriedToActionId = null;
              continue;
            }
            if (item.outcome === 'dropped') {
              sourceAction.dropped = true;
              sourceAction.droppedOn = date;
              sourceAction.droppedReason = item.reason;
              sourceAction.droppedInMeetingId = meeting.id;
              sourceAction.carriedToMeetingId = null;
              sourceAction.carriedToActionId = null;
              continue;
            }
            const successor = {
              id: id('ac'),
              text: sourceAction.text,
              due: item.due,
              done: false,
              completedOn: null,
              completedInMeetingId: null,
              dropped: false,
              droppedOn: null,
              droppedReason: '',
              droppedInMeetingId: null,
              personId: person.id,
              // A carried promise keeps the owner it was agreed with. Changing
              // who owes it is a separate, audited decision.
              owner: sourceAction.owner || null,
              carriedFrom: { meetingId: sourceMeeting.id, actionId: sourceAction.id },
              carriedToMeetingId: null,
              carriedToActionId: null,
            };
            live.actions.push(successor);
            sourceAction.carriedToMeetingId = meeting.id;
            sourceAction.carriedToActionId = successor.id;
          }
        },
        {
          type: 'oneonone.logged',
          entity: 'oneOnOne',
          entityId: meeting.id,
          summary: `${status === 'held' ? '1:1 held' : `1:1 ${status}`} with ${person.name}${parts.length ? ` — ${parts.join(', ')}` : ''}`,
        },
      );
      return {
        ok: true,
        id: meeting.id,
        closed: closedCount,
        carried: carriedCount,
        dropped: droppedCount,
        topicsCleared,
      };
    },

    toggleMeetingAction(meetingId, actionId) {
      const meeting = store.state.oneOnOnes.find((m) => m.id === meetingId);
      const action = meeting?.actions.find((a) => a.id === actionId);
      if (!action) return fail('That action no longer exists.');
      if (action.carriedToMeetingId) {
        return fail('This commitment was carried forward to a later 1:1. Update the newer copy instead.');
      }
      if (action.dropped) return fail('This commitment was explicitly dropped. Add a new action if it is back on.');
      store.update(
        (draft) => {
          const target = draft.oneOnOnes.find((m) => m.id === meetingId)?.actions.find((a) => a.id === actionId);
          if (!target) return;
          target.done = !target.done;
          target.completedOn = target.done ? today() : null;
          // Ticking it off on the board is a report, not a conversation: it must
          // not claim a 1:1 confirmed it.
          target.completedInMeetingId = null;
        },
        { type: 'oneonone.action.toggled', entity: 'oneOnOne', entityId: meetingId, summary: '1:1 action toggled' },
      );
      return { ok: true };
    },

    addMeetingAction(meetingId, text, due, ownerValue = null) {
      const value = clean(text);
      if (!value) return fail('Describe the action.', 'text');
      if (due && !isCalendarDay(due)) return fail('Choose a valid due date, or leave it blank.', 'due');
      const owner = normalizeOwner(ownerValue);
      if (!owner.ok) return fail(owner.error, 'owner');
      const meeting = store.state.oneOnOnes.find((m) => m.id === meetingId);
      if (!meeting) return fail('That 1:1 no longer exists.');
      store.update(
        (draft) => {
          const target = draft.oneOnOnes.find((m) => m.id === meetingId);
          if (!target) return;
          target.actions.push({
            id: id('ac'),
            text: value,
            due: due || null,
            done: false,
            completedOn: null,
            completedInMeetingId: null,
            dropped: false,
            droppedOn: null,
            droppedReason: '',
            droppedInMeetingId: null,
            personId: target.personId,
            owner: owner.owner,
            carriedFrom: null,
            carriedToMeetingId: null,
            carriedToActionId: null,
          });
        },
        { type: 'oneonone.action.added', entity: 'oneOnOne', entityId: meetingId, summary: `Action added: ${value.slice(0, 60)}` },
      );
      return { ok: true };
    },

    /* ----------------------------------------------------------- feedback */
    addFeedback(data) {
      if (!personExists(data.personId)) return fail('Choose a person first.', 'personId');
      const behavior = clean(data.behavior) || '';
      if (!behavior) return fail('The behaviour is the one part that cannot be omitted.', 'behavior');
      const kind = data.kind === 'constructive' ? 'constructive' : 'praise';
      const date = data.date || today();
      const observedOn = data.observedOn || null;
      if (!isCalendarDay(date)) return fail('Choose a valid conversation date.', 'date');
      if (date > today()) return fail('The feedback conversation cannot be dated in the future.', 'date');
      if (observedOn && !isCalendarDay(observedOn)) return fail('Choose a valid observation date, or leave it unknown.', 'observedOn');
      if (observedOn && observedOn > date) return fail('The observation cannot be after the feedback conversation.', 'observedOn');
      const item = {
        ...append(null, 'fb'),
        personId: data.personId,
        direction: data.direction === 'received' ? 'received' : 'given',
        kind,
        situation: clean(data.situation) || '',
        behavior,
        impact: clean(data.impact) || '',
        tags: (data.tags || []).map((t) => clean(t)).filter(Boolean).slice(0, 6),
        date,
        observedOn,
        followUpOn: data.followUpOn || null,
        followUpDone: false,
        followUpCompletedOn: null,
      };
      const person = store.state.people.find((p) => p.id === data.personId);
      store.update(
        (draft) => {
          draft.feedback.push(item);
        },
        {
          type: 'feedback.created',
          entity: 'feedback',
          entityId: item.id,
          summary: `${kind === 'praise' ? 'Praise' : 'Constructive feedback'} ${item.direction === 'received' ? 'received from' : 'given to'} ${person.name}`,
        },
      );
      return { ok: true, id: item.id };
    },

    updateFeedback(feedbackId, patch) {
      const existing = store.state.feedback.find((f) => f.id === feedbackId);
      if (!existing) return fail('That feedback record no longer exists.');
      const next = { ...existing, ...patch, observedOn: patch.observedOn !== undefined ? patch.observedOn || null : existing.observedOn || null };
      if (!isCalendarDay(next.date)) return fail('Choose a valid conversation date.', 'date');
      if (next.date > today()) return fail('The feedback conversation cannot be dated in the future.', 'date');
      if (next.observedOn && !isCalendarDay(next.observedOn)) return fail('Choose a valid observation date, or leave it unknown.', 'observedOn');
      if (next.observedOn && next.observedOn > next.date) return fail('The observation cannot be after the feedback conversation.', 'observedOn');
      store.update(
        (draft) => {
          const item = draft.feedback.find((f) => f.id === feedbackId);
          if (!item) return;
          Object.assign(item, patch, { observedOn: next.observedOn });
        },
        { type: 'feedback.updated', entity: 'feedback', entityId: feedbackId, summary: 'Feedback updated' },
      );
      return { ok: true };
    },

    completeFollowUp(feedbackId, done = true) {
      store.update(
        (draft) => {
          const item = draft.feedback.find((f) => f.id === feedbackId);
          if (!item) return;
          item.followUpDone = Boolean(done);
          item.followUpCompletedOn = done ? today() : null;
        },
        { type: 'feedback.followup', entity: 'feedback', entityId: feedbackId, summary: done ? 'Feedback follow-up closed' : 'Feedback follow-up reopened' },
      );
      return { ok: true };
    },

    /* --------------------------------------------------------------- goals */
    addGoal(data) {
      const title = clean(data.title) || '';
      if (!title) return fail('Give the goal a name.', 'title');
      const reviewSource = validateReviewSource(data.ownerId || null, data.sourceReviewId);
      if (!reviewSource.ok) return reviewSource;
      const confidence = CONFIDENCE.includes(data.confidence) ? data.confidence : 'on-track';
      const status = ['active', 'done', 'dropped'].includes(data.status) ? data.status : 'active';
      const goal = {
        ...append(null, 'goal'),
        sourceReviewId: reviewSource.sourceReviewId,
        title,
        description: clean(data.description) || '',
        ownerId: data.ownerId || null,
        scope: data.scope === 'team' ? 'team' : 'person',
        coAuthored: data.ownerId ? (data.coAuthored === true ? true : data.coAuthored === false ? false : null) : null,
        dueDate: data.dueDate || null,
        keyResults: (data.keyResults || [])
          .map((kr) => {
            const start = Number(kr.start) || 0;
            const current = Number.isFinite(Number(kr.current)) ? Number(kr.current) : start;
            return {
              id: id('kr'),
              title: clean(kr.title) || '',
              start,
              target: Number.isFinite(Number(kr.target)) ? Number(kr.target) : 100,
              current,
              initialCurrent: current,
              unit: clean(kr.unit) || '',
            };
          })
          .filter((kr) => kr.title),
        confidence,
        initialConfidence: confidence,
        status,
        completedOn: status === 'done' ? today() : null,
        krUpdatedOn: null,
        checkins: [],
      };
      store.update(
        (draft) => {
          draft.goals.push(goal);
        },
        { type: 'goal.created', entity: 'goal', entityId: goal.id, summary: `Goal created: ${title.slice(0, 70)}` },
      );
      return { ok: true, id: goal.id };
    },

    updateGoal(goalId, patch) {
      if (!store.state.goals.some((goal) => goal.id === goalId)) return fail('That goal no longer exists.');
      store.update(
        (draft) => {
          const goal = draft.goals.find((g) => g.id === goalId);
          if (!goal) return;
          const previousOwner = goal.ownerId;
          const previousStatus = goal.status;
          if (patch.title !== undefined) goal.title = clean(patch.title) || goal.title;
          if (patch.description !== undefined) goal.description = clean(patch.description);
          if (patch.dueDate !== undefined) goal.dueDate = patch.dueDate || null;
          if (patch.ownerId !== undefined) goal.ownerId = patch.ownerId || null;
          if (patch.coAuthored !== undefined && goal.ownerId) {
            goal.coAuthored = patch.coAuthored === true ? true : patch.coAuthored === false ? false : null;
          } else if (!goal.ownerId || previousOwner !== goal.ownerId) {
            goal.coAuthored = null;
          }
          if (patch.confidence && CONFIDENCE.includes(patch.confidence)) {
            goal.confidence = patch.confidence;
            if (!goal.checkins.length && (goal.createdAt || '').slice(0, 10) === today()) {
              goal.initialConfidence = patch.confidence;
            }
          }
          if (patch.status && ['active', 'done', 'dropped'].includes(patch.status)) {
            goal.status = patch.status;
            if (patch.status === 'done' && previousStatus !== 'done') goal.completedOn = today();
            else if (patch.status !== 'done') goal.completedOn = null;
          }
        },
        { type: 'goal.updated', entity: 'goal', entityId: goalId, summary: 'Goal updated' },
      );
      return { ok: true };
    },

    /** Check in: records confidence, a note, and dated key-result snapshots. */
    checkInGoal(goalId, { note = '', confidence = 'on-track', keyResults = [] } = {}) {
      const goal = store.state.goals.find((g) => g.id === goalId);
      if (!goal) return fail('That goal no longer exists.');
      const safeConfidence = CONFIDENCE.includes(confidence) ? confidence : 'on-track';
      store.update(
        (draft) => {
          const target = draft.goals.find((g) => g.id === goalId);
          if (!target) return;
          for (const update of keyResults) {
            const kr = target.keyResults.find((k) => k.id === update.id);
            if (kr && Number.isFinite(Number(update.current))) kr.current = Number(update.current);
          }
          target.confidence = safeConfidence;
          target.checkins.push({
            id: id('chk'),
            date: today(),
            note: clean(note) || '',
            confidence: safeConfidence,
            progressPct: goalProgress(target),
            keyResults: target.keyResults.map((kr) => ({ id: kr.id, current: kr.current })),
          });
        },
        {
          type: 'goal.checkin',
          entity: 'goal',
          entityId: goalId,
          summary: `Check-in on "${goal.title.slice(0, 50)}" (${safeConfidence})`,
        },
      );
      return { ok: true };
    },

    addKeyResult(goalId, kr) {
      const title = clean(kr.title) || '';
      if (!title) return fail('Name the key result.', 'title');
      if (!store.state.goals.some((goal) => goal.id === goalId)) return fail('That goal no longer exists. Reopen it and try again.', 'title');
      store.update(
        (draft) => {
          const goal = draft.goals.find((g) => g.id === goalId);
          if (!goal) return;
          const start = Number(kr.start) || 0;
          const current = Number.isFinite(Number(kr.current)) ? Number(kr.current) : start;
          goal.keyResults.push({
            id: id('kr'),
            title,
            start,
            target: Number.isFinite(Number(kr.target)) ? Number(kr.target) : 100,
            current,
            initialCurrent: current,
            unit: clean(kr.unit) || '',
          });
          goal.krUpdatedOn = today();
        },
        { type: 'goal.kr.added', entity: 'goal', entityId: goalId, summary: `Key result added: ${title.slice(0, 60)}` },
      );
      return { ok: true };
    },

    removeKeyResult(goalId, krId) {
      store.update(
        (draft) => {
          const goal = draft.goals.find((g) => g.id === goalId);
          if (!goal) return;
          goal.keyResults = goal.keyResults.filter((k) => k.id !== krId);
          goal.krUpdatedOn = today();
        },
        { type: 'goal.kr.removed', entity: 'goal', entityId: goalId, summary: 'Key result removed' },
      );
      return { ok: true };
    },

    /* ---------------------------------------------------------- delegation */
    addDelegation(data) {
      if (!personExists(data.personId)) return fail('Choose one accountable owner.', 'personId');
      const person = store.state.people.find((p) => p.id === data.personId);
      if (person.status === 'archived') return fail('Restore this person before delegating new work to them.', 'personId');
      const input = {
        title: clean(data.title) || '',
        expectedOutcome: clean(data.expectedOutcome) || '',
        authority: data.authority || '',
        support: clean(data.support) || '',
        delegatedOn: data.delegatedOn || today(),
        dueOn: data.dueOn || null,
      };
      const invalid = delegationValidation(input);
      if (invalid) return fail(invalid.error, invalid.field);
      if (input.delegatedOn > today()) return fail('The delegation cannot be dated in the future.', 'delegatedOn');
      const delegation = {
        ...append(null, 'delegation'),
        ...input,
        personId: data.personId,
        status: 'active',
        checkins: [],
        completedOn: null,
        completionNote: '',
        returnedOn: null,
        returnReason: '',
        updatedAt: stamp(),
      };
      store.update(
        (draft) => {
          draft.delegations.push(delegation);
        },
        { type: 'delegation.created', entity: 'delegation', entityId: delegation.id, summary: `Delegated “${delegation.title.slice(0, 60)}” to ${person.name} (${DELEGATION_AUTHORITY[delegation.authority].shortLabel})` },
      );
      return { ok: true, id: delegation.id };
    },

    updateDelegation(delegationId, patch) {
      const current = (store.state.delegations || []).find((d) => d.id === delegationId);
      if (!current) return fail('That delegation no longer exists.');
      if (current.status !== 'active') return fail('Completed or returned delegations are kept as history and cannot be edited.');
      const next = {
        title: patch.title !== undefined ? clean(patch.title) || '' : current.title,
        expectedOutcome: patch.expectedOutcome !== undefined ? clean(patch.expectedOutcome) || '' : current.expectedOutcome,
        authority: patch.authority !== undefined ? patch.authority : current.authority,
        support: patch.support !== undefined ? clean(patch.support) || '' : current.support,
        delegatedOn: patch.delegatedOn !== undefined ? patch.delegatedOn : current.delegatedOn,
        dueOn: patch.dueOn !== undefined ? patch.dueOn || null : current.dueOn,
      };
      const invalid = delegationValidation(next);
      if (invalid) return fail(invalid.error, invalid.field);
      if (next.delegatedOn > today()) return fail('The delegation cannot be dated in the future.', 'delegatedOn');
      if (current.checkins.some((checkin) => checkin.date < next.delegatedOn)) {
        return fail('The delegation date cannot be after an existing check-in.', 'delegatedOn');
      }
      store.update(
        (draft) => {
          const target = draft.delegations.find((d) => d.id === delegationId);
          Object.assign(target, next, { updatedAt: stamp() });
        },
        { type: 'delegation.updated', entity: 'delegation', entityId: delegationId, summary: `Delegation updated: ${next.title.slice(0, 60)}` },
      );
      return { ok: true };
    },

    checkInDelegation(delegationId, data) {
      const current = (store.state.delegations || []).find((d) => d.id === delegationId);
      if (!current) return fail('That delegation no longer exists.');
      if (current.status !== 'active') return fail('This delegation is already closed.');
      const date = data.date || today();
      const note = clean(data.note) || '';
      const progress = data.progress;
      if (!isCalendarDay(date) || date > today()) return fail('Choose a valid check-in date that is not in the future.', 'date');
      if (date < current.delegatedOn) return fail('A check-in cannot predate the delegation.', 'date');
      if (!['on-track', 'blocked'].includes(progress)) return fail('Say whether the outcome is on track or blocked.', 'progress');
      if (!note) return fail('Record what changed, what is next, or what support is needed.', 'note');
      const checkin = { id: id('dchk'), date, progress, note, createdAt: stamp() };
      store.update(
        (draft) => {
          const target = draft.delegations.find((d) => d.id === delegationId);
          target.checkins.push(checkin);
          target.updatedAt = stamp();
        },
        { type: 'delegation.checkin', entity: 'delegation', entityId: delegationId, summary: `Delegation check-in: ${current.title.slice(0, 50)} (${progress})` },
      );
      return { ok: true, id: checkin.id };
    },

    completeDelegation(delegationId, data = {}) {
      const current = (store.state.delegations || []).find((d) => d.id === delegationId);
      if (!current) return fail('That delegation no longer exists.');
      if (current.status !== 'active') return fail('This delegation is already closed.');
      const completedOn = data.completedOn || today();
      const completionNote = clean(data.completionNote) || '';
      if (!isCalendarDay(completedOn) || completedOn > today() || completedOn < current.delegatedOn) {
        return fail('Choose a valid completion date within the delegation period, not in the future.', 'completedOn');
      }
      if (current.checkins.some((checkin) => checkin.date > completedOn)) {
        return fail('Completion cannot predate an existing check-in.', 'completedOn');
      }
      if (!completionNote) return fail('Record the outcome delivered and any follow-up that remains.', 'completionNote');
      const linkedPlanStartsInFuture = (store.state.portfolio || []).some((item) =>
        item?.status === 'open' && item.sourceType === 'delegation' &&
        item.sourceId === delegationId && item.createdOn && item.createdOn > completedOn,
      );
      if (linkedPlanStartsInFuture) {
        return fail('Completion cannot predate the start of linked operating-plan work.', 'completedOn');
      }
      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = draft.delegations.find((d) => d.id === delegationId);
          Object.assign(target, { status: 'done', completedOn, completionNote, updatedAt: stamp() });
          propagations = onDelegationCompleted(draft, delegationId, { now: clock(), idFactory: id, logEvent });
          propagations.push(...propagateNegotiationDelivery(draft, target, { now: clock(), idFactory: id, logEvent }));
        },
        { type: 'delegation.completed', entity: 'delegation', entityId: delegationId, summary: `Delegation completed: ${current.title.slice(0, 60)}` },
      );
      return { ok: true, propagations };
    },

    returnDelegation(delegationId, data = {}) {
      const current = (store.state.delegations || []).find((d) => d.id === delegationId);
      if (!current) return fail('That delegation no longer exists.');
      if (current.status !== 'active') return fail('This delegation is already closed.');
      const returnedOn = data.returnedOn || today();
      const returnReason = clean(data.returnReason) || '';
      if (!isCalendarDay(returnedOn) || returnedOn > today() || returnedOn < current.delegatedOn) {
        return fail('Choose a valid return date within the delegation period, not in the future.', 'returnedOn');
      }
      if (current.checkins.some((checkin) => checkin.date > returnedOn)) {
        return fail('Returning the work cannot predate an existing check-in.', 'returnedOn');
      }
      if (!returnReason) return fail('Explain why the work came back and what happens next.', 'returnReason');
      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = draft.delegations.find((d) => d.id === delegationId);
          Object.assign(target, { status: 'returned', returnedOn, returnReason, updatedAt: stamp() });
          propagations = propagateNegotiationDelivery(draft, target, { now: clock(), idFactory: id, logEvent });
        },
        { type: 'delegation.returned', entity: 'delegation', entityId: delegationId, summary: `Delegation returned to leader: ${current.title.slice(0, 50)}` },
      );
      return { ok: true, propagations: [...propagations, ...(store.lastPropagations || [])] };
    },

    /**
     * Explicitly recover / re-delegate a returned outcome (RULE-NEG-05).
     *
     * Never overwrites or erases the returned delegation record: the returned
     * record stays immutable in history (`status: 'returned'`, `returnedOn`,
     * `returnReason`, `supersededByDelegationId`, `recoveredOn`) while a new
     * active delegation is created with `priorDelegationId` and `recoveryNote`
     * naming what changed in scope, authority, or support before restarting.
     */
    redelegateReturnedOutcome(delegationId, data = {}) {
      const current = (store.state.delegations || []).find((d) => d.id === delegationId);
      if (!current) return fail('That delegation no longer exists.');
      if (current.status !== 'returned') {
        return fail('Only a returned delegation can be recovered. Accept the work back with a return reason first.');
      }
      if (current.supersededByDelegationId) {
        return fail('This returned delegation has already been recovered by a successor delegation.');
      }
      const personId = clean(data.personId) || '';
      if (!personId || !personExists(personId)) {
        return fail('Choose an active team member to take ownership of the recovered outcome.', 'personId');
      }
      const newOwner = store.state.people.find((p) => p.id === personId);
      if (!newOwner || newOwner.status === 'archived') {
        return fail('Restore this person before delegating recovered work to them.', 'personId');
      }
      const authority = DELEGATION_AUTHORITY[data.authority]
        ? data.authority
        : (current.authority && DELEGATION_AUTHORITY[current.authority] ? current.authority : 'act-inform');
      const recoveryNote = (clean(data.recoveryNote) || '').slice(0, 4000);
      if (recoveryNote.length < 6) {
        return fail('Record what changed in scope, authority, or support so the new handoff does not hit the same blocker.', 'recoveryNote');
      }
      const delegatedOn = data.delegatedOn || today();
      if (!isCalendarDay(delegatedOn) || delegatedOn > today()) {
        return fail('Choose a valid recovery date that is not in the future.', 'delegatedOn');
      }
      if (current.returnedOn && delegatedOn < current.returnedOn) {
        return fail('Recovery cannot predate the date the work was returned.', 'delegatedOn');
      }
      const dueOn = data.dueOn ? String(data.dueOn).trim() : null;
      if (dueOn && !isCalendarDay(dueOn)) {
        return fail('Choose a valid due date, or leave it blank.', 'dueOn');
      }
      if (dueOn && dueOn < delegatedOn) {
        return fail('The due date cannot be before the recovery date.', 'dueOn');
      }
      const title = (clean(data.title) || current.title).slice(0, 200);
      const expectedOutcome = (clean(data.expectedOutcome) || current.expectedOutcome || '').slice(0, 4000);
      const support = (clean(data.support) || current.support || '').slice(0, 4000);
      if (!support) {
        return fail('Record the support, resources, or air-cover provided for this recovery.', 'support');
      }

      const nowIso = stamp();
      const nextDelegation = {
        id: id('delegation'),
        personId: newOwner.id,
        title,
        expectedOutcome,
        authority,
        support,
        delegatedOn,
        dueOn,
        status: 'active',
        checkins: [],
        completedOn: null,
        completionNote: '',
        returnedOn: null,
        returnReason: '',
        sourceNegotiationId: current.sourceNegotiationId || null,
        sourceTermId: current.sourceTermId || null,
        priorDelegationId: current.id,
        supersededByDelegationId: null,
        recoveredOn: null,
        recoveryNote,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const oldTarget = (draft.delegations || []).find((d) => d.id === delegationId);
          if (!oldTarget) return;
          draft.delegations.push(nextDelegation);
          propagations = propagateReturnedDelegationRecovery(draft, oldTarget, nextDelegation, {
            now: clock(),
            idFactory: id,
            logEvent,
          });
        },
        {
          type: 'delegation.redelegated',
          entity: 'delegation',
          entityId: nextDelegation.id,
          summary: `Recovered returned delegation “${title.slice(0, 50)}” → ${newOwner.name}`,
        },
      );
      return {
        ok: true,
        id: nextDelegation.id,
        delegation: (store.state.delegations || []).find((d) => d.id === nextDelegation.id) || nextDelegation,
        priorDelegationId: current.id,
        propagations,
      };
    },

    /**
     * Record (or correct) who owes an open commitment.
     *
     * Closed promises are refused on purpose: rewriting the owner of something
     * already done or dropped would rewrite the history the ledger exists to
     * keep. So is a promise that was carried forward — the live copy in the
     * later meeting is the one to change, and the error says where it is.
     */
    setActionOwner(meetingId, actionId, ownerValue) {
      const meeting = store.state.oneOnOnes.find((m) => m.id === meetingId);
      const action = meeting?.actions.find((a) => a.id === actionId);
      if (!meeting || !action) return fail('That commitment no longer exists. Reload and try again.');
      const owner = normalizeOwner(ownerValue);
      if (!owner.ok) return fail(owner.error, 'owner');
      if (action.done || action.dropped) {
        return fail('This promise is already closed; its owner is part of the record.');
      }
      if (action.carriedToMeetingId) {
        const successor = store.state.oneOnOnes.find((m) => m.id === action.carriedToMeetingId);
        return fail(successor
          ? `This promise was carried forward to the 1:1 on ${successor.date}. Change the owner on that copy.`
          : 'This promise was carried forward. Change the owner on the newer copy.');
      }
      if ((action.owner || null) === owner.owner) return { ok: true, unchanged: true };
      store.update(
        (draft) => {
          const target = draft.oneOnOnes.find((m) => m.id === meetingId)?.actions.find((a) => a.id === actionId);
          if (!target) return;
          target.owner = owner.owner;
        },
        {
          type: 'oneonone.action.owner',
          entity: 'oneOnOne',
          entityId: meetingId,
          summary: owner.owner
            ? `Promise owner set to ${OWNER_LABELS[owner.owner].toLowerCase()}: ${action.text.slice(0, 60)}`
            : `Promise owner cleared: ${action.text.slice(0, 60)}`,
        },
      );
      return { ok: true, owner: owner.owner };
    },

    /* -------------------------------------------------------------- growth */
    saveGrowthPlan(data) {
      if (!personExists(data.personId)) return fail('Choose a person first.', 'personId');
      const reviewSource = validateReviewSource(data.personId, data.sourceReviewId);
      if (!reviewSource.ok) return reviewSource;
      const goal = clean(data.goal) || '';
      if (!goal) return fail('A GROW plan starts with a goal.', 'goal');
      const seenDelegationIds = new Set();
      for (const action of Array.isArray(data.will) ? data.will : []) {
        if (action?.due && !isCalendarDay(action.due)) return fail('Choose a valid due date for the commitment, or leave it blank.', 'willDue');
        if (action?.delegationId) {
          const linkCheck = validateDelegationLink(data.personId, action.delegationId);
          if (!linkCheck.ok) return linkCheck;
          if (seenDelegationIds.has(linkCheck.delegationId)) {
            return fail('The same delegation cannot be linked twice on the same plan.', 'delegationId');
          }
          seenDelegationIds.add(linkCheck.delegationId);
        }
      }
      if (data.reviewOn && !isCalendarDay(data.reviewOn)) return fail('Choose a valid review date, or leave it blank.', 'reviewOn');
      const plan = {
        ...append(null, 'gp'),
        sourceReviewId: reviewSource.sourceReviewId,
        personId: data.personId,
        goal,
        reality: clean(data.reality) || '',
        options: (data.options || []).map((text) => ({ id: id('opt'), text: clean(text) })).filter((o) => o.text),
        will: (data.will || [])
          .map((a) => newWillAction(data.personId, clean(a.text) || '', a.due || null, {
            delegationId: clean(a.delegationId) || null,
          }))
          .filter((a) => a.text),
        competencies: (data.competencies || []).map((c) => clean(c)).filter(Boolean),
        reviewOn: data.reviewOn || null,
        reviews: [],
        reviewDeferrals: 0,
        reviewMovedOn: null,
        status: 'active',
        closedOn: null,
        stagesUpdatedOn: null,
      };
      const person = store.state.people.find((p) => p.id === data.personId);
      store.update(
        (draft) => {
          // A person has one active plan at a time; close the previous one.
          for (const existing of draft.growthPlans) {
            if (existing.personId === data.personId && existing.status === 'active') {
              existing.status = 'done';
              existing.closedOn = today();
            }
          }
          draft.growthPlans.push(plan);
        },
        { type: 'growth.created', entity: 'growthPlan', entityId: plan.id, summary: `Growth plan for ${person.name}` },
      );
      return { ok: true, id: plan.id };
    },

    updateGrowthPlan(planId, patch) {
      if (patch.reviewOn && !isCalendarDay(patch.reviewOn)) {
        return fail('Choose a valid review date, or leave it blank.', 'reviewOn');
      }
      store.update(
        (draft) => {
          const plan = draft.growthPlans.find((p) => p.id === planId);
          if (!plan) return;
          const previousStatus = plan.status;
          let stageChanged = false;
          if (patch.goal !== undefined) {
            const nextGoal = clean(patch.goal) || plan.goal;
            if (nextGoal !== plan.goal) stageChanged = true;
            plan.goal = nextGoal;
          }
          if (patch.reality !== undefined) {
            const nextReality = clean(patch.reality);
            if (nextReality !== plan.reality) stageChanged = true;
            plan.reality = nextReality;
          }
          if (patch.reviewOn !== undefined) {
            const next = patch.reviewOn || null;
            if (next && !isCalendarDay(next)) return;
            // Pushing the next review out without holding one is recorded, not
            // silent: a reviewing ritual that keeps sliding is not a review.
            if (next && plan.reviewOn && next > plan.reviewOn) {
              plan.reviewDeferrals = (plan.reviewDeferrals || 0) + 1;
              plan.reviewMovedOn = today();
            }
            plan.reviewOn = next;
          }
          if (patch.status) {
            plan.status = patch.status === 'done' ? 'done' : 'active';
            if (plan.status === 'done' && previousStatus !== 'done') plan.closedOn = today();
            else if (plan.status === 'active') plan.closedOn = null;
          }
          if (Array.isArray(patch.options)) {
            plan.options = patch.options.map((text) => ({ id: id('opt'), text: clean(text) })).filter((o) => o.text);
            stageChanged = true;
          }
          if (Array.isArray(patch.competencies)) plan.competencies = patch.competencies.map((c) => clean(c)).filter(Boolean);
          if (stageChanged && (plan.createdAt || '').slice(0, 10) !== today()) {
            plan.stagesUpdatedOn = today();
          }
        },
        { type: 'growth.updated', entity: 'growthPlan', entityId: planId, summary: 'Growth plan updated' },
      );
      return { ok: true };
    },

    addWillAction(planId, text, due, extra = {}) {
      const value = clean(text);
      if (!value) return fail('Describe the commitment.', 'text');
      if (due && !isCalendarDay(due)) return fail('Choose a valid due date, or leave it blank.', 'due');
      const plan = store.state.growthPlans.find((p) => p.id === planId);
      if (!plan) return fail('That development plan no longer exists.');
      if (plan.status !== 'active') return fail('This plan is closed. Start a new one instead of adding commitments to history.');
      const linkCheck = validateDelegationLink(plan.personId, extra?.delegationId, plan);
      if (!linkCheck.ok) return linkCheck;
      const entry = newWillAction(plan.personId, value, due || null, {
        delegationId: linkCheck.delegationId,
      });
      store.update(
        (draft) => {
          const target = draft.growthPlans.find((p) => p.id === planId);
          if (!target) return;
          target.will.push(entry);
        },
        { type: 'growth.will.added', entity: 'growthPlan', entityId: planId, summary: `Development action added: ${value.slice(0, 50)}` },
      );
      return { ok: true, id: entry.id };
    },

    toggleWillAction(planId, actionId) {
      const plan = store.state.growthPlans.find((p) => p.id === planId);
      const action = plan?.will.find((a) => a.id === actionId);
      if (!plan || !action) return fail('That commitment no longer exists.');
      if (action.carriedToId) return fail('This commitment was carried forward. Update the newer copy instead.');
      if (action.dropped) return fail('This commitment was explicitly dropped. Add a new one if it is back on.');
      store.update(
        (draft) => {
          const target = draft.growthPlans.find((p) => p.id === planId)?.will.find((a) => a.id === actionId);
          if (!target) return;
          target.done = !target.done;
          target.completedOn = target.done ? today() : null;
          // Ticking a box is a report, not a review: it must not claim that a
          // development conversation confirmed it.
          target.completedInReviewId = null;
        },
        { type: 'growth.will.toggled', entity: 'growthPlan', entityId: planId, summary: 'Development action toggled' },
      );
      return { ok: true };
    },

    /**
     * Move a commitment into a later date without losing where it came from.
     *
     * The original stays as history (with a link to its successor); the new copy
     * is the live promise. A carry is an explicit re-commitment, so it needs a
     * new date — silently re-showing the old one is what makes a stalled plan
     * look busy.
     */
    carryWillAction(planId, actionId, due, reviewId = null) {
      const plan = store.state.growthPlans.find((p) => p.id === planId);
      if (!plan) return fail('That development plan no longer exists.');
      if (plan.status !== 'active') return fail('This plan is closed; its commitments are part of the record.');
      const action = plan.will.find((a) => a.id === actionId);
      if (!action) return fail('That commitment no longer exists. Reload and try again.');
      if (!isOpenWill(action)) {
        return fail(action.done ? 'This commitment is already done.' : action.dropped ? 'This commitment was dropped.' : 'This commitment was already carried forward.');
      }
      if (!due || !isCalendarDay(due)) return fail('Choose a new date for the carried commitment.', 'due');
      if (due < today()) return fail('A carried commitment cannot be due in the past.', 'due');
      if (reviewId && !(plan.reviews || []).some((review) => review.id === reviewId)) {
        return fail('That review is not on this plan. Reload and try again.');
      }
      const successorId = id('ac');
      store.update(
        (draft) => {
          const targetPlan = draft.growthPlans.find((p) => p.id === planId);
          const source = targetPlan?.will.find((a) => a.id === actionId);
          if (!source) return;
          source.carriedToId = successorId;
          targetPlan.will.push(newWillAction(targetPlan.personId, source.text, due, {
            // The link on the original already names this id, so the successor
            // has to be created with exactly that id — a second id would leave
            // the promise pointing at a record that does not exist.
            id: successorId,
            delegationId: source.delegationId || null,
            carriedFromId: source.id,
            carriedInReviewId: reviewId || null,
          }));
        },
        {
          type: 'growth.will.carried',
          entity: 'growthPlan',
          entityId: planId,
          summary: `Development commitment carried forward to ${due}: ${action.text.slice(0, 50)}`,
        },
      );
      return { ok: true, id: successorId };
    },

    /**
     * Stop a commitment on purpose.
     *
     * A reason is required: "we decided this no longer matters" is the single
     * most useful thing a development record can hold, and an unexplained drop
     * is indistinguishable from forgetting.
     */
    dropWillAction(planId, actionId, reason, reviewId = null) {
      const plan = store.state.growthPlans.find((p) => p.id === planId);
      if (!plan) return fail('That development plan no longer exists.');
      if (plan.status !== 'active') return fail('This plan is closed; its commitments are part of the record.');
      const action = plan.will.find((a) => a.id === actionId);
      if (!action) return fail('That commitment no longer exists. Reload and try again.');
      if (!isOpenWill(action)) return fail('Only an open commitment can be dropped.');
      if (reviewId && !(plan.reviews || []).some((review) => review.id === reviewId)) {
        return fail('That review is not on this plan. Reload and try again.');
      }
      const why = clean(reason) || '';
      if (why.length < 3) return fail('Say why it is no longer worth doing — the reason is the record.', 'reason');
      if (why.length > 300) return fail('Keep the reason under 300 characters.', 'reason');
      store.update(
        (draft) => {
          const target = draft.growthPlans.find((p) => p.id === planId)?.will.find((a) => a.id === actionId);
          if (!target) return;
          target.dropped = true;
          target.droppedOn = today();
          target.droppedReason = why;
          target.droppedInReviewId = reviewId || null;
        },
        {
          type: 'growth.will.dropped',
          entity: 'growthPlan',
          entityId: planId,
          summary: `Development commitment dropped (${why.slice(0, 60)})`,
        },
      );
      return { ok: true };
    },

    /**
     * Record a development review: the conversation, its decisions, and the date
     * the next one is owed.
     *
     * The review is a first-class record rather than an edit of `reviewOn`,
     * because "I moved the date" and "we talked" are different facts and only one
     * of them develops anybody.
     */
    logGrowthReview(planId, data = {}) {
      const plan = store.state.growthPlans.find((p) => p.id === planId);
      if (!plan) return fail('That development plan no longer exists.');
      if (plan.status !== 'active') return fail('This plan is closed. Reopen it before recording a review.');
      const date = data.date || today();
      if (!isCalendarDay(date)) return fail('Choose a valid review date.', 'date');
      if (date > today()) return fail('A review cannot be logged before it has happened.', 'date');
      const notes = clean(data.notes) || '';
      if (notes.length < 5) return fail('Write a line about what was actually discussed — a review with no record is a checkbox.', 'notes');
      if (notes.length > 4000) return fail('Keep the review notes under 4000 characters.', 'notes');
      const nextReviewOn = data.nextReviewOn || null;
      if (nextReviewOn) {
        if (!isCalendarDay(nextReviewOn)) return fail('Choose a valid date for the next review.', 'nextReviewOn');
        if (nextReviewOn <= date) return fail('The next review has to be after this one.', 'nextReviewOn');
      }
      const decisions = Array.isArray(data.decisions) ? data.decisions : [];
      const seen = new Set();
      const applied = [];
      for (const item of decisions) {
        const outcome = ['done', 'still-open', 'carried', 'dropped'].includes(item?.outcome) ? item.outcome : null;
        if (!outcome) return fail('Choose done, still open, carried forward or dropped for each commitment.', 'decisions');
        const source = plan.will.find((a) => a.id === item.actionId);
        if (!source) return fail('That commitment no longer exists. Reload and try again.', 'decisions');
        if (!isOpenWill(source)) return fail(`"${source.text}" is already closed. Reload before logging this review.`, 'decisions');
        if (seen.has(source.id)) return fail('The same commitment was listed twice. Reload the form.', 'decisions');
        seen.add(source.id);
        if (outcome === 'still-open') continue;
        if (outcome === 'carried') {
          if (!item.due || !isCalendarDay(item.due)) return fail('Choose a new date for the carried commitment.', 'decisions');
          if (item.due < date) return fail('A carried commitment cannot be due before the review that moved it.', 'decisions');
        }
        if (outcome === 'dropped') {
          const why = clean(item.reason) || '';
          if (why.length < 3) return fail('Say why each dropped commitment is no longer worth doing.', 'decisions');
          if (why.length > 300) return fail('Keep each reason under 300 characters.', 'decisions');
        }
        applied.push({ source, outcome, due: item.due || null, reason: clean(item.reason) || '' });
      }

      const review = { ...append(null, 'grev'), date, notes, nextReviewOn };
      const closed = applied.filter((d) => d.outcome === 'done').length;
      const carried = applied.filter((d) => d.outcome === 'carried').length;
      const dropped = applied.filter((d) => d.outcome === 'dropped').length;
      const parts = [];
      if (closed) parts.push(`${closed} closed`);
      if (carried) parts.push(`${carried} carried forward`);
      if (dropped) parts.push(`${dropped} dropped`);

      store.update(
        (draft) => {
          const target = draft.growthPlans.find((p) => p.id === planId);
          target.reviews.push(review);
          for (const decision of applied) {
            const source = target.will.find((a) => a.id === decision.source.id);
            if (!source || !isOpenWill(source)) continue;
            if (decision.outcome === 'done') {
              source.done = true;
              source.completedOn = date;
              source.completedInReviewId = review.id;
              continue;
            }
            if (decision.outcome === 'dropped') {
              source.dropped = true;
              source.droppedOn = date;
              source.droppedReason = decision.reason;
              source.droppedInReviewId = review.id;
              continue;
            }
            const successor = newWillAction(target.personId, source.text, decision.due, {
              delegationId: source.delegationId || null,
              carriedFromId: source.id,
              carriedInReviewId: review.id,
              // The successor was agreed in the review, not on the day the
              // review happened to be entered.
              addedOn: date,
            });
            source.carriedToId = successor.id;
            target.will.push(successor);
          }
          target.reviewOn = nextReviewOn;
          // A held review resets the deferral count: the thing that kept sliding
          // finally happened.
          target.reviewDeferrals = 0;
          target.reviewMovedOn = null;
        },
        {
          type: 'growth.reviewed',
          entity: 'growthPlan',
          entityId: planId,
          summary: `Development review${parts.length ? ` — ${parts.join(', ')}` : ''}${nextReviewOn ? ` · next ${nextReviewOn}` : ''}`,
        },
      );
      return { ok: true, id: review.id, closed, carried, dropped, nextReviewOn };
    },

    /* --------------------------------------------------------------- pulse */
    submitPulse(data) {
      const scores = {};
      for (const dim of PULSE_DIMENSIONS) {
        const raw = data.scores?.[dim];
        if (raw == null || typeof raw === 'boolean' || (typeof raw === 'string' && !raw.trim())) continue;
        const value = Number(raw);
        if (Number.isFinite(value) && value >= 1 && value <= 5) scores[dim] = Math.round(value);
      }
      if (!Object.keys(scores).length) return fail('Answer at least one question.', 'scores');
      const anonymous = data.anonymity !== 'named';
      if (!anonymous && !personExists(data.personId)) return fail('Choose who is answering, or submit anonymously.', 'personId');
      const response = {
        ...append(null, 'pulse'),
        date: today(),
        // Anonymous responses are never linked to a person.
        personId: anonymous ? null : data.personId,
        anonymity: anonymous ? 'anonymous' : 'named',
        scores,
        comment: clean(data.comment) || '',
      };
      store.update(
        (draft) => {
          draft.pulses.push(response);
        },
        {
          type: 'pulse.submitted',
          entity: 'pulse',
          entityId: response.id,
          summary: `Pulse response recorded (${response.anonymity})`,
        },
      );
      return { ok: true, id: response.id };
    },

    /* ----------------------------------------------------------- decisions */
    addDecision(data = {}) {
      const title = clean(data.title) || '';
      if (!title) return fail('Name the decision.', 'title');
      const date = data.date || today();
      if (!isCalendarDay(date)) return fail('Choose a valid decision date.', 'date');
      const reviewOn = data.reviewOn ? String(data.reviewOn).trim() : null;
      if (reviewOn && !isCalendarDay(reviewOn)) {
        return fail('Choose a valid review date, or leave it blank.', 'reviewOn');
      }
      if (reviewOn && reviewOn < date) {
        return fail('The review date cannot be before the decision date.', 'reviewOn');
      }
      const forecast = readForecast(data.forecastProbability);
      if (!forecast.ok) return forecast;
      const chosenAtCreate = clean(data.chosen) || '';
      const decision = {
        ...append(null, 'dec'),
        title,
        question: clean(data.question) || '',
        date,
        reversibility: data.reversibility === 'irreversible' ? 'irreversible' : 'reversible',
        driver: clean(data.driver) || '',
        approver: clean(data.approver) || '',
        contributors: clean(data.contributors) || '',
        informed: clean(data.informed) || '',
        options: (data.options || [])
          .map((o) => ({ id: o?.id ? String(o.id) : id('dopt'), label: clean(o?.label) || '', pros: clean(o?.pros) || '', cons: clean(o?.cons) || '' }))
          .filter((o) => o.label),
        chosen: clean(data.chosen) || '',
        rationale: clean(data.rationale) || '',
        reviewOn,
        reviewedOn: null,
        outcome: 'pending',
        outcomeNotes: '',
        // A forecast only means something attached to an actual call; one
        // supplied for a still-open record is kept null (schema enforces the
        // same rule on load) so calibration never scores a non-decision.
        forecastProbability: chosenAtCreate ? forecast.value : null,
        // Schema v28: a decision logged already-decided is stamped with the day
        // it was recorded as made. Never before the decision date, never in the
        // future; undecided records carry null.
        decidedOn: chosenAtCreate ? (date && date <= today() ? today() : today()) : null,
        // Schema v55: keep the append-only decision-portfolio annotation in
        // the same shape on creation and reload normalization.
        portfolioNotes: [],
      };
      store.update(
        (draft) => {
          draft.decisions.push(decision);
        },
        { type: 'decision.created', entity: 'decision', entityId: decision.id, summary: `Decision logged: ${title.slice(0, 70)}` },
      );
      return { ok: true, id: decision.id };
    },

    updateDecision(decisionId, patch = {}) {
      const current = (store.state.decisions || []).find((d) => d.id === decisionId);
      if (!current) return fail('That decision no longer exists.');
      const nextTitle = patch.title !== undefined ? clean(patch.title) || '' : current.title;
      if (!nextTitle) return fail('Name the decision.', 'title');
      const nextDate = patch.date !== undefined ? (patch.date || '') : current.date;
      if (!isCalendarDay(nextDate)) return fail('Choose a valid decision date.', 'date');
      if (current.reviewedOn && nextDate > current.reviewedOn) {
        return fail('The decision date cannot be after the date its outcome was reviewed.', 'date');
      }
      const nextReviewOn = patch.reviewOn !== undefined
        ? (patch.reviewOn ? String(patch.reviewOn).trim() : null)
        : current.reviewOn;
      if (nextReviewOn && !isCalendarDay(nextReviewOn)) {
        return fail('Choose a valid review date, or leave it blank.', 'reviewOn');
      }
      if (nextReviewOn && nextReviewOn < nextDate) {
        return fail('The review date cannot be before the decision date.', 'reviewOn');
      }
      let nextForecast = current.forecastProbability ?? null;
      if (patch.forecastProbability !== undefined) {
        const parsed = readForecast(patch.forecastProbability);
        if (!parsed.ok) return parsed;
        nextForecast = parsed.value;
        // Anti-hindsight rule: once the outcome is reviewed, the forecast that
        // will be scored is frozen. Changing it afterwards would let any
        // leader look perfectly calibrated in retrospect and would corrupt
        // the Brier record permanently.
        if (current.reviewedOn && nextForecast !== (current.forecastProbability ?? null)) {
          return fail('The forecast is frozen once the outcome has been reviewed — scoring it against a number chosen with hindsight would corrupt the calibration record.', 'forecastProbability');
        }
        if (!current.chosen) nextForecast = null;
      }
      store.update(
        (draft) => {
          const decision = draft.decisions.find((d) => d.id === decisionId);
          if (!decision) return;
          decision.title = nextTitle;
          decision.forecastProbability = nextForecast;
          if (patch.question !== undefined) decision.question = clean(patch.question) || '';
          if (patch.reversibility !== undefined) {
            decision.reversibility = patch.reversibility === 'irreversible' ? 'irreversible' : 'reversible';
          }
          decision.date = nextDate;
          if (patch.driver !== undefined) decision.driver = clean(patch.driver) || '';
          if (patch.approver !== undefined) decision.approver = clean(patch.approver) || '';
          if (patch.contributors !== undefined) decision.contributors = clean(patch.contributors) || '';
          if (patch.informed !== undefined) decision.informed = clean(patch.informed) || '';
          if (Array.isArray(patch.options)) {
            const existingByLabel = new Map(
              (decision.options || []).map((o) => [o.label.toLowerCase(), o]),
            );
            decision.options = patch.options
              .map((o) => {
                const label = clean(o?.label) || '';
                if (!label) return null;
                const prev = existingByLabel.get(label.toLowerCase());
                return {
                  id: o?.id || prev?.id || id('dopt'),
                  label,
                  pros: o?.pros !== undefined ? clean(o.pros) || '' : (prev?.pros || ''),
                  cons: o?.cons !== undefined ? clean(o.cons) || '' : (prev?.cons || ''),
                };
              })
              .filter(Boolean);
          }
          if (patch.rationale !== undefined) decision.rationale = clean(patch.rationale) || '';
          decision.reviewOn = nextReviewOn;
        },
        { type: 'decision.updated', entity: 'decision', entityId: decisionId, summary: `Decision updated: ${nextTitle.slice(0, 60)}` },
      );
      return { ok: true };
    },

    decideDecision(decisionId, { chosen, rationale = '', reviewOn, forecastProbability } = {}) {
      const current = (store.state.decisions || []).find((d) => d.id === decisionId);
      if (!current) return fail('That decision no longer exists.');
      const choice = clean(chosen) || '';
      if (!choice) return fail('Record what was decided.', 'chosen');
      let nextReviewOn = current.reviewOn;
      if (reviewOn !== undefined) {
        nextReviewOn = reviewOn ? String(reviewOn).trim() : null;
        if (nextReviewOn && !isCalendarDay(nextReviewOn)) {
          return fail('Choose a valid review date, or leave it blank.', 'reviewOn');
        }
        if (nextReviewOn && nextReviewOn < current.date) {
          return fail('The review date cannot be before the decision date.', 'reviewOn');
        }
      }
      // The forecast is captured at the moment of commitment — the only time
      // it is an honest prediction rather than a rationalisation. It stays
      // editable (audited) until the outcome review, then freezes.
      let nextForecast = current.forecastProbability ?? null;
      if (forecastProbability !== undefined) {
        if (current.reviewedOn) {
          return fail('The forecast is frozen once the outcome has been reviewed.', 'forecastProbability');
        }
        const parsed = readForecast(forecastProbability);
        if (!parsed.ok) return parsed;
        nextForecast = parsed.value;
      }
      store.update(
        (draft) => {
          const decision = draft.decisions.find((d) => d.id === decisionId);
          if (!decision) return;
          decision.chosen = choice;
          decision.rationale = clean(rationale) || decision.rationale;
          if (reviewOn !== undefined) decision.reviewOn = nextReviewOn;
          decision.forecastProbability = nextForecast;
          // Schema v28: the moment of the call is stamped once. Re-deciding a
          // record later keeps the original stamp, because the latency that
          // matters is how long it took to reach a first decision.
          if (!decision.decidedOn) decision.decidedOn = today();
        },
        { type: 'decision.made', entity: 'decision', entityId: decisionId, summary: `Decided: ${choice.slice(0, 60)}${nextForecast !== null ? ` (forecast ${nextForecast}%)` : ''}` },
      );
      return { ok: true };
    },

    reviewDecision(decisionId, { outcome, outcomeNotes = '', reviewedOn } = {}) {
      const current = (store.state.decisions || []).find((d) => d.id === decisionId);
      if (!current) return fail('That decision no longer exists.');
      if (!current.chosen) {
        return fail('Record what was decided before reviewing its outcome.', 'outcome');
      }
      if (!['good', 'mixed', 'bad'].includes(outcome)) return fail('Choose an outcome.', 'outcome');
      const revDay = reviewedOn ? String(reviewedOn).trim() : today();
      if (!isCalendarDay(revDay) || revDay > today()) {
        return fail('Choose a valid review date, not in the future.', 'reviewedOn');
      }
      if (revDay < current.date) {
        return fail('An outcome review cannot predate the decision itself.', 'reviewedOn');
      }
      store.update(
        (draft) => {
          const decision = draft.decisions.find((d) => d.id === decisionId);
          if (!decision) return;
          decision.outcome = outcome;
          decision.outcomeNotes = clean(outcomeNotes) || '';
          decision.reviewedOn = revDay;
        },
        { type: 'decision.reviewed', entity: 'decision', entityId: decisionId, summary: `Decision reviewed (${outcome}): ${current.title.slice(0, 50)}` },
      );
      return { ok: true };
    },

    /* ------------------------------------------------------------ recognition */
    addRecognition(data) {
      if (!personExists(data.personId)) return fail('Choose who you are recognising.', 'personId');
      const what = clean(data.what) || '';
      if (!what) return fail('Say what they did.', 'what');
      const entry = {
        ...append(null, 'rec'),
        personId: data.personId,
        what,
        values: (data.values || []).map((v) => clean(v)).filter(Boolean),
        visibility: data.visibility === 'private' ? 'private' : 'public',
        date: data.date || today(),
      };
      const person = store.state.people.find((p) => p.id === data.personId);
      store.update(
        (draft) => {
          draft.recognition.push(entry);
        },
        { type: 'recognition.created', entity: 'recognition', entityId: entry.id, summary: `Recognised ${person.name}` },
      );
      return { ok: true, id: entry.id };
    },

    /* ------------------------------------------------------------ readiness */
    setReadiness(data) {
      if (!personExists(data.personId)) return fail('Choose a person.', 'personId');
      const seat = clean(data.seat)?.slice(0, 160) || '';
      if (!seat) return fail('Name the seat being planned for.', 'seat');
      const rating = ['ready-now', 'ready-later', 'not-ready'].includes(data.rating) ? data.rating : 'not-ready';
      const hasNotes = data.notes !== undefined;
      const notes = hasNotes ? (clean(data.notes) || '').slice(0, 1200) : '';
      store.update(
        (draft) => {
          const existing = draft.readiness.find((r) => r.personId === data.personId && r.seat === seat);
          if (existing) {
            existing.rating = rating;
            if (hasNotes) existing.notes = notes;
            existing.updatedAt = stamp();
          } else {
            draft.readiness.push({ id: id('rd'), personId: data.personId, seat, rating, notes, updatedAt: stamp() });
          }
        },
        { type: 'readiness.set', entity: 'readiness', entityId: data.personId, summary: `Readiness set: ${seat} → ${rating}` },
      );
      return { ok: true };
    },

    /* --------------------------------------------------- performance reviews */
    createReview(data) {
      if (!personExists(data.personId)) return fail('Choose a person first.', 'personId');
      if (!validPeriod(data.periodStart, data.periodEnd)) return fail('Choose a valid period with the start on or before the end.', 'periodStart');
      const duplicate = (store.state.reviews || []).find((review) =>
        review.personId === data.personId && review.periodStart === data.periodStart && review.periodEnd === data.periodEnd,
      );
      if (duplicate) return fail('A review for this person and exact period already exists.', 'periodStart');
      const person = store.state.people.find((p) => p.id === data.personId);
      const review = {
        id: id('review'),
        personId: data.personId,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        status: 'draft',
        selfReflection: { achievements: '', challenges: '', growth: '', support: '' },
        selfReflectionRecordedAt: null,
        manager: { achievements: '', development: '', nextSteps: '', rating: '' },
        evidence: buildReviewEvidence(store.state, data.personId, data.periodStart, data.periodEnd),
        evidenceCapturedAt: stamp(),
        createdAt: stamp(),
        updatedAt: stamp(),
        completedAt: null,
      };
      store.update(
        (draft) => {
          draft.reviews.push(review);
        },
        { type: 'review.created', entity: 'review', entityId: review.id, summary: `Performance review started for ${person.name} (${review.periodStart} to ${review.periodEnd})` },
      );
      return { ok: true, id: review.id, evidenceCount: review.evidence.length };
    },

    updateReflection(reviewId, patch) {
      const review = reviewById(reviewId);
      if (!review) return fail('That review no longer exists.');
      if (review.status !== 'draft') return fail('Reopen the completed review before editing it.');
      store.update(
        (draft) => {
          const target = draft.reviews.find((r) => r.id === reviewId);
          for (const key of ['achievements', 'challenges', 'growth', 'support']) {
            if (patch[key] !== undefined) target.selfReflection[key] = clean(patch[key]) || '';
          }
          target.selfReflectionRecordedAt = Object.values(target.selfReflection).some((value) => value.trim()) ? stamp() : null;
          target.updatedAt = stamp();
        },
        { type: 'review.reflection.updated', entity: 'review', entityId: reviewId, summary: 'Employee self-reflection recorded' },
      );
      return { ok: true };
    },

    updateAssessment(reviewId, patch) {
      const review = reviewById(reviewId);
      if (!review) return fail('That review no longer exists.');
      if (review.status !== 'draft') return fail('Reopen the completed review before editing it.');
      if (patch.rating && !REVIEW_RATINGS.includes(patch.rating)) return fail('Choose a valid rating, or leave the review unrated.', 'rating');
      store.update(
        (draft) => {
          const target = draft.reviews.find((r) => r.id === reviewId);
          for (const key of ['achievements', 'development', 'nextSteps']) {
            if (patch[key] !== undefined) target.manager[key] = clean(patch[key]) || '';
          }
          if (patch.rating !== undefined) target.manager.rating = patch.rating || '';
          target.updatedAt = stamp();
        },
        { type: 'review.assessment.updated', entity: 'review', entityId: reviewId, summary: 'Manager assessment updated' },
      );
      return { ok: true };
    },

    refreshReviewEvidence(reviewId) {
      const review = reviewById(reviewId);
      if (!review) return fail('That review no longer exists.');
      if (review.status !== 'draft') return fail('A completed review keeps its evidence snapshot. Reopen it to refresh.');
      const evidence = buildReviewEvidence(store.state, review.personId, review.periodStart, review.periodEnd);
      store.update(
        (draft) => {
          const target = draft.reviews.find((r) => r.id === reviewId);
          target.evidence = evidence;
          target.evidenceCapturedAt = stamp();
          target.updatedAt = stamp();
        },
        { type: 'review.evidence.refreshed', entity: 'review', entityId: reviewId, summary: `Review evidence refreshed (${evidence.length} source records)` },
      );
      return { ok: true, evidenceCount: evidence.length };
    },

    completeReview(reviewId) {
      const review = reviewById(reviewId);
      if (!review) return fail('That review no longer exists.');
      if (review.status !== 'draft') return fail('This review is already complete.');
      // Completion always recaptures, so a record added after the last manual
      // refresh cannot be silently omitted from the frozen packet.
      const evidence = buildReviewEvidence(store.state, review.personId, review.periodStart, review.periodEnd);
      const candidate = { ...review, evidence };
      const readiness = reviewReadiness(candidate, evidence);
      if (!readiness.canComplete) {
        return fail(`Before completing: ${readiness.missing.map((check) => check.label).join('; ')}.`);
      }
      const warnings = calibrateReview(candidate, evidence);
      store.update(
        (draft) => {
          const target = draft.reviews.find((r) => r.id === reviewId);
          target.evidence = evidence;
          target.evidenceCapturedAt = stamp();
          target.status = 'complete';
          target.completedAt = stamp();
          target.updatedAt = stamp();
        },
        {
          type: 'review.completed', entity: 'review', entityId: reviewId,
          summary: `Performance review completed (${evidence.length} source records${warnings.length ? `; ${warnings.map((w) => w.id).join(', ')} acknowledged` : '; no calibration warnings'})`,
        },
      );
      return { ok: true, warnings, evidenceCount: evidence.length };
    },

    reopenReview(reviewId) {
      const review = reviewById(reviewId);
      if (!review) return fail('That review no longer exists.');
      if (review.status !== 'complete') return fail('This review is already a draft.');
      store.update(
        (draft) => {
          const target = draft.reviews.find((r) => r.id === reviewId);
          target.status = 'draft';
          target.completedAt = null;
          target.updatedAt = stamp();
        },
        { type: 'review.reopened', entity: 'review', entityId: reviewId, summary: 'Performance review reopened for correction' },
      );
      return { ok: true };
    },

    /* -------------------------------------------------- onboarding 30-60-90 */
    createOnboardingPlan(data = {}) {
      const person = store.state.people.find((p) => p.id === data.personId);
      if (!person) return fail('Choose the team member this 30-60-90 plan is for.', 'personId');
      if (person.status === 'archived') return fail('Restore this person before starting a 30-60-90 plan.', 'personId');

      const kind = data.kind === undefined ? 'new-hire' : clean(data.kind);
      if (!ONBOARDING_KINDS.includes(kind)) {
        return fail('Choose whether this is new-joiner onboarding, a role transition, or return to work.', 'kind');
      }
      const isTransition = kind === 'role-transition';
      const isReboarding = kind === 'reboarding';
      const isNonJoiner = isTransition || isReboarding;
      const labelRaw = clean(data.label);
      const label = typeof labelRaw === 'string' ? labelRaw : '';
      if (label.length > 160) return fail('Keep the plan label under 160 characters.', 'label');
      if (isTransition && !label) {
        return fail('Name the new role or scope (e.g. “Team Lead · Platform”) so this reads as the move it is.', 'label');
      }

      const existingActive = (store.state.onboarding || []).find(
        (plan) => plan.personId === person.id && plan.status === 'active',
      );
      if (existingActive) {
        const existingKind = planKind(existingActive);
        const existingNoun = existingKind === 'new-hire'
          ? '30-60-90 onboarding plan'
          : `${planKindRecordNoun(existingKind)}${existingActive.label ? ` (“${existingActive.label}”)` : ''}`;
        return fail(`${person.name} already has an active ${existingNoun}. Complete that plan before starting another.`, 'personId');
      }

      // The anchor is the plan's own start, never a rewrite of the roster
      // record: a role transition or return-to-work plan defaults to today,
      // so a tenured person's plan is not silently anchored to the day they
      // joined the company years earlier.
      const startDate = data.startDate !== undefined && data.startDate !== ''
        ? clean(data.startDate)
        : isNonJoiner
          ? today()
          : (person.startDate || today());
      if (!isCalendarDay(startDate)) return fail('Choose a valid start date (YYYY-MM-DD).', 'startDate');
      if (isNonJoiner && person.startDate && startDate < person.startDate) {
        return fail(`A ${planKindNoun(kind)} plan cannot start before ${person.name} joined the team (${person.startDate}).`, 'startDate');
      }

      const buddyId = clean(data.buddyId) || null;
      if (buddyId) {
        if (buddyId === person.id) return fail('A person cannot be their own peer buddy.', 'buddyId');
        const buddy = store.state.people.find((p) => p.id === buddyId);
        if (!buddy || buddy.status === 'archived') return fail('Choose an active team member as the buddy, or leave blank.', 'buddyId');
      }
      const buddyName = (clean(data.buddyName) || '').slice(0, 120);
      const roleClarity = clean(data.roleClarity) || '';
      if (roleClarity.length > 2000) return fail('Keep role clarity under 2,000 characters.', 'roleClarity');
      const earlyWin = clean(data.earlyWin) || '';
      if (earlyWin.length > 2000) return fail('Keep the early win description under 2,000 characters.', 'earlyWin');

      const rawStakeholders = Array.isArray(data.stakeholders) ? data.stakeholders : [];
      const seenNames = new Set();
      const stakeholders = [];
      for (const item of rawStakeholders) {
        if (!item || typeof item !== 'object') continue;
        const name = (clean(item.name) || '').slice(0, 160);
        if (!name) continue;
        const key = name.toLowerCase();
        if (seenNames.has(key)) continue;
        seenNames.add(key);
        const met = item.met === true;
        stakeholders.push({
          id: id('onbs'),
          name,
          purpose: (clean(item.purpose) || '').slice(0, 300),
          met,
          metOn: met ? today() : null,
        });
      }

      const seedCheckpoints = Array.isArray(data.checkpoints)
        ? data.checkpoints
        : data.useTemplate === false
          ? []
          : starterCheckpointsForKind(kind, startDate);
      const checkpoints = [];
      for (const item of seedCheckpoints) {
        if (!item || typeof item !== 'object') continue;
        const title = (clean(item.title) || '').slice(0, 300);
        if (!title) continue;
        const horizon = ONBOARDING_HORIZONS.includes(Number(item.horizon)) ? Number(item.horizon) : 30;
        const category = ONBOARDING_CATEGORIES.includes(item.category) ? item.category : 'clarity';
        const due = item.due ? (isCalendarDay(item.due) ? item.due : null) : addDays(startDate, horizon);
        const done = item.done === true;
        checkpoints.push({
          id: id('onbc'),
          horizon,
          category,
          title,
          due,
          done,
          completedOn: done ? today() : null,
          notes: (clean(item.notes) || '').slice(0, 1000),
        });
      }

      const plan = {
        id: id('onb'),
        personId: person.id,
        kind,
        label,
        startDate,
        buddyId,
        buddyName,
        roleClarity,
        earlyWin,
        stakeholders,
        checkpoints,
        reviews: { 30: null, 60: null, 90: null },
        status: 'active',
        completedOn: null,
        createdAt: stamp(),
        updatedAt: stamp(),
      };

      store.update(
        (draft) => {
          draft.onboarding.push(plan);
        },
        {
          type: 'onboarding.created',
          entity: 'onboarding',
          entityId: plan.id,
          summary: isTransition
            ? `Started role-transition 30-60-90 plan for ${person.name}: ${label}`
            : isReboarding
              ? `Started return-to-work 30-60-90 plan for ${person.name}${label ? `: ${label}` : ''}`
              : `Started 30-60-90 onboarding plan for ${person.name}`,
        },
      );
      if (store.isLocked) return fail('This workspace is encrypted and locked. Unlock it before making changes.');
      return { ok: true, id: plan.id };
    },

    updateOnboardingPlan(planId, patch = {}) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That 30-60-90 plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed 30-60-90 plan before editing it.');

      let nextStartDate = plan.startDate;
      if (patch.startDate !== undefined) {
        const candidate = clean(patch.startDate);
        if (!isCalendarDay(candidate)) return fail('Choose a valid start date (YYYY-MM-DD).', 'startDate');
        for (const h of ONBOARDING_HORIZONS) {
          const heldOn = plan.reviews?.[h]?.heldOn;
          if (heldOn && heldOn < candidate) {
            return fail(`The start date cannot be after the recorded Day ${h} check-in (${heldOn}).`, 'startDate');
          }
        }
        nextStartDate = candidate;
      }

      let nextBuddyId = plan.buddyId;
      if (patch.buddyId !== undefined) {
        const candidate = clean(patch.buddyId) || null;
        if (candidate) {
          if (candidate === plan.personId) return fail('A person cannot be their own peer buddy.', 'buddyId');
          const buddy = store.state.people.find((p) => p.id === candidate);
          if (!buddy || buddy.status === 'archived') return fail('Choose an active team member as the buddy, or leave blank.', 'buddyId');
        }
        nextBuddyId = candidate;
      }

      if (patch.roleClarity !== undefined && String(clean(patch.roleClarity) || '').length > 2000) {
        return fail('Keep role clarity under 2,000 characters.', 'roleClarity');
      }
      if (patch.earlyWin !== undefined && String(clean(patch.earlyWin) || '').length > 2000) {
        return fail('Keep the early win description under 2,000 characters.', 'earlyWin');
      }

      // Kind and label can be corrected after the fact (e.g. a plan created
      // as onboarding before role transitions or re-boarding existed). The
      // checkpoints, check-ins and history are untouched — only framing changes.
      let nextKind = planKind(plan);
      if (patch.kind !== undefined) {
        const candidate = clean(patch.kind);
        if (!ONBOARDING_KINDS.includes(candidate)) {
          return fail('Choose whether this is new-joiner onboarding, a role transition, or return to work.', 'kind');
        }
        nextKind = candidate;
      }
      let nextLabel = plan.label || '';
      if (patch.label !== undefined) {
        const candidate = clean(patch.label);
        nextLabel = typeof candidate === 'string' ? candidate : '';
      }
      if (nextLabel.length > 160) return fail('Keep the plan label under 160 characters.', 'label');
      if (nextKind === 'role-transition' && !nextLabel) {
        return fail('Name the new role or scope (e.g. “Team Lead · Platform”) so this reads as the move it is.', 'label');
      }

      const person = store.state.people.find((p) => p.id === plan.personId);
      if ((nextKind === 'role-transition' || nextKind === 'reboarding') && person?.startDate && nextStartDate < person.startDate) {
        return fail(`A ${planKindNoun(nextKind)} plan cannot start before ${person.name} joined the team (${person.startDate}).`, 'startDate');
      }
      store.update(
        (draft) => {
          const target = draft.onboarding.find((p) => p.id === planId);
          if (!target) return;
          target.kind = nextKind;
          target.label = nextLabel;
          target.startDate = nextStartDate;
          target.buddyId = nextBuddyId;
          if (patch.buddyName !== undefined) target.buddyName = (clean(patch.buddyName) || '').slice(0, 120);
          if (patch.roleClarity !== undefined) target.roleClarity = clean(patch.roleClarity) || '';
          if (patch.earlyWin !== undefined) target.earlyWin = clean(patch.earlyWin) || '';
          target.updatedAt = stamp();
        },
        {
          type: 'onboarding.updated',
          entity: 'onboarding',
          entityId: planId,
          summary: `Updated 30-60-90 ${nextKind === 'role-transition' ? 'role-transition' : planKindNoun(nextKind)} scaffolding${person ? ` for ${person.name}` : ''}`,
        },
      );
      return { ok: true };
    },

    addOnboardingCheckpoint(planId, input = {}) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That 30-60-90 plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed 30-60-90 plan before adding checkpoints.');
      const title = clean(input.title) || '';
      if (!title) return fail('Describe the checkpoint so both of you know when it is done.', 'title');
      if (title.length > 300) return fail('Keep the checkpoint title under 300 characters.', 'title');
      const horizon = Number(input.horizon);
      if (!ONBOARDING_HORIZONS.includes(horizon)) return fail('Choose the 30, 60 or 90-day horizon.', 'horizon');
      const category = ONBOARDING_CATEGORIES.includes(input.category) ? input.category : 'clarity';
      let due = addDays(plan.startDate, horizon);
      if (input.due !== undefined && input.due !== null && input.due !== '') {
        if (!isCalendarDay(input.due)) return fail('Choose a valid due date (YYYY-MM-DD).', 'due');
        due = input.due;
      }
      const notes = clean(input.notes) || '';
      if (notes.length > 1000) return fail('Keep checkpoint notes under 1,000 characters.', 'notes');

      const cp = {
        id: id('onbc'),
        horizon,
        category,
        title,
        due,
        done: false,
        completedOn: null,
        notes,
      };
      store.update(
        (draft) => {
          const target = draft.onboarding.find((p) => p.id === planId);
          if (!target) return;
          target.checkpoints.push(cp);
          target.updatedAt = stamp();
        },
        {
          type: 'onboarding.checkpoint.added',
          entity: 'onboarding',
          entityId: planId,
          summary: `Added Day ${horizon} 30-60-90 checkpoint: ${title}`,
        },
      );
      return { ok: true, id: cp.id };
    },

    toggleOnboardingCheckpoint(planId, checkpointId, patch = {}) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That 30-60-90 plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed 30-60-90 plan before changing checkpoints.');
      const existing = (plan.checkpoints || []).find((c) => c.id === checkpointId);
      if (!existing) return fail('That checkpoint no longer exists.');
      if (patch.notes !== undefined && String(clean(patch.notes) || '').length > 1000) {
        return fail('Keep checkpoint notes under 1,000 characters.', 'notes');
      }
      const nextDone = typeof patch.done === 'boolean' ? patch.done : !existing.done;
      let completedOn = null;
      if (nextDone) {
        if (patch.completedOn !== undefined && patch.completedOn !== null && patch.completedOn !== '') {
          if (!isCalendarDay(patch.completedOn)) return fail('Choose a valid completion date.', 'completedOn');
          if (patch.completedOn > today()) return fail('Completion date cannot be in the future.', 'completedOn');
          completedOn = patch.completedOn;
        } else {
          completedOn = today();
        }
      }
      store.update(
        (draft) => {
          const target = draft.onboarding.find((p) => p.id === planId);
          const cp = target?.checkpoints.find((c) => c.id === checkpointId);
          if (!cp) return;
          cp.done = nextDone;
          cp.completedOn = completedOn;
          if (patch.notes !== undefined) cp.notes = clean(patch.notes) || '';
          target.updatedAt = stamp();
        },
        {
          type: 'onboarding.checkpoint.toggled',
          entity: 'onboarding',
          entityId: planId,
          summary: `${nextDone ? 'Completed' : 'Reopened'} Day ${existing.horizon} checkpoint: ${existing.title}`,
        },
      );
      return { ok: true, done: nextDone };
    },

    removeOnboardingCheckpoint(planId, checkpointId) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That 30-60-90 plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed 30-60-90 plan before removing checkpoints.');
      const existing = (plan.checkpoints || []).find((c) => c.id === checkpointId);
      if (!existing) return fail('That checkpoint no longer exists.');
      store.update(
        (draft) => {
          const target = draft.onboarding.find((p) => p.id === planId);
          if (!target) return;
          target.checkpoints = target.checkpoints.filter((c) => c.id !== checkpointId);
          target.updatedAt = stamp();
        },
        {
          type: 'onboarding.checkpoint.removed',
          entity: 'onboarding',
          entityId: planId,
          summary: `Removed 30-60-90 checkpoint: ${existing.title}`,
        },
      );
      return { ok: true };
    },

    addOnboardingStakeholder(planId, input = {}) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That 30-60-90 plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed 30-60-90 plan before editing introductions.');
      const name = clean(input.name) || '';
      if (!name) return fail('Name the person or team to introduce.', 'name');
      if (name.length > 160) return fail('Keep the stakeholder name under 160 characters.', 'name');
      const duplicate = (plan.stakeholders || []).some((s) => s.name.toLowerCase() === name.toLowerCase());
      if (duplicate) return fail('That stakeholder is already on the introduction list.', 'name');
      const purpose = clean(input.purpose) || '';
      if (purpose.length > 300) return fail('Keep the purpose under 300 characters.', 'purpose');
      const met = input.met === true;
      const entry = {
        id: id('onbs'),
        name,
        purpose,
        met,
        metOn: met ? today() : null,
      };
      store.update(
        (draft) => {
          const target = draft.onboarding.find((p) => p.id === planId);
          if (!target) return;
          target.stakeholders.push(entry);
          target.updatedAt = stamp();
        },
        {
          type: 'onboarding.stakeholder.added',
          entity: 'onboarding',
          entityId: planId,
          summary: `Added 30-60-90 introduction: ${name}`,
        },
      );
      return { ok: true, id: entry.id };
    },

    toggleOnboardingStakeholder(planId, stakeholderId, patch = {}) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That 30-60-90 plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed 30-60-90 plan before changing introductions.');
      const existing = (plan.stakeholders || []).find((s) => s.id === stakeholderId);
      if (!existing) return fail('That stakeholder entry no longer exists.');
      const nextMet = typeof patch.met === 'boolean' ? patch.met : !existing.met;
      const metOn = nextMet ? today() : null;
      store.update(
        (draft) => {
          const target = draft.onboarding.find((p) => p.id === planId);
          const item = target?.stakeholders.find((s) => s.id === stakeholderId);
          if (!item) return;
          item.met = nextMet;
          item.metOn = metOn;
          target.updatedAt = stamp();
        },
        {
          type: 'onboarding.stakeholder.toggled',
          entity: 'onboarding',
          entityId: planId,
          summary: `${nextMet ? 'Marked introduction met' : 'Marked introduction pending'}: ${existing.name}`,
        },
      );
      return { ok: true, met: nextMet };
    },

    removeOnboardingStakeholder(planId, stakeholderId) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That 30-60-90 plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed 30-60-90 plan before removing introductions.');
      const existing = (plan.stakeholders || []).find((s) => s.id === stakeholderId);
      if (!existing) return fail('That stakeholder entry no longer exists.');
      store.update(
        (draft) => {
          const target = draft.onboarding.find((p) => p.id === planId);
          if (!target) return;
          target.stakeholders = target.stakeholders.filter((s) => s.id !== stakeholderId);
          target.updatedAt = stamp();
        },
        {
          type: 'onboarding.stakeholder.removed',
          entity: 'onboarding',
          entityId: planId,
          summary: `Removed 30-60-90 introduction: ${existing.name}`,
        },
      );
      return { ok: true };
    },

    recordOnboardingReview(planId, input = {}) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That 30-60-90 plan no longer exists.');
      if (plan.status !== 'active') return fail('Reopen the completed 30-60-90 plan before updating check-ins.');
      const horizon = Number(input.horizon);
      if (!ONBOARDING_HORIZONS.includes(horizon)) return fail('Choose the 30, 60 or 90-day check-in.', 'horizon');
      const heldOn = input.heldOn !== undefined && input.heldOn !== '' ? clean(input.heldOn) : today();
      if (!isCalendarDay(heldOn)) return fail('Choose a valid check-in date (YYYY-MM-DD).', 'heldOn');
      if (heldOn > today()) return fail('Check-in date cannot be in the future.', 'heldOn');
      if (heldOn < plan.startDate) return fail('Check-in date cannot precede the plan start date.', 'heldOn');
      const summary = clean(input.summary) || '';
      if (!summary) return fail('Record what is clear and working from the conversation.', 'summary');
      if (summary.length > 2000) return fail('Keep the check-in summary under 2,000 characters.', 'summary');
      const blockers = clean(input.blockers) || '';
      if (blockers.length > 2000) return fail('Keep blockers and support notes under 2,000 characters.', 'blockers');

      const person = store.state.people.find((p) => p.id === plan.personId);
      const checkinId = plan.reviews?.[horizon]?.id || id('onbr');
      store.update(
        (draft) => {
          const target = draft.onboarding.find((p) => p.id === planId);
          if (!target) return;
          target.reviews[horizon] = { id: checkinId, heldOn, summary, blockers };
          target.updatedAt = stamp();
        },
        {
          type: 'onboarding.review.recorded',
          entity: 'onboarding',
          entityId: planId,
          summary: `Logged Day ${horizon} ${plan.kind === 'role-transition' ? 'role-transition' : planKindNoun(plan)} check-in${person ? ` for ${person.name}` : ''}`,
        },
      );
      return { ok: true, id: checkinId };
    },

    addManagerSupportCommitment(input = {}) {
      const plan = onboardingById(input.planId);
      if (!plan) return fail('That 30-60-90 plan no longer exists.');
      const horizon = Number(input.horizon);
      if (!ONBOARDING_HORIZONS.includes(horizon)) return fail('Choose the 30, 60 or 90-day check-in.', 'horizon');
      const checkin = plan.reviews?.[horizon];
      const checkinId = clean(input.checkinId) || '';
      if (!checkin?.heldOn || !checkin.id || checkin.id !== checkinId) {
        return fail('That recorded check-in could not be verified. Reload the plan and try again.', 'checkinId');
      }
      const text = clean(input.text) || '';
      if (!text) return fail('Describe the specific manager action you are committing to.', 'text');
      if (text.length > 300) return fail('Keep the manager follow-up under 300 characters.', 'text');
      const due = clean(input.due) || '';
      if (!isCalendarDay(due)) return fail('Choose a valid due date (YYYY-MM-DD).', 'due');
      if (due < checkin.heldOn) return fail('The due date cannot be before the source check-in.', 'due');
      if (due < today()) return fail('Choose today or a future date for this new commitment.', 'due');
      const person = store.state.people.find((p) => p.id === plan.personId);
      const createdAt = stamp();
      const commitment = {
        id: id('msup'),
        personId: plan.personId,
        text,
        due,
        owner: 'leader',
        sourcePlanId: plan.id,
        sourceCheckinId: checkin.id,
        sourceHorizon: horizon,
        sourceHeldOn: checkin.heldOn,
        addedOn: today(),
        status: 'open',
        completedOn: null,
        completedInMeetingId: null,
        droppedOn: null,
        droppedReason: '',
        droppedInMeetingId: null,
        carriedFromId: null,
        carriedFromMeetingId: null,
        carriedToId: null,
        carriedOn: null,
        carriedInMeetingId: null,
        createdAt,
        updatedAt: createdAt,
      };
      store.update(
        (draft) => { draft.managerSupport.push(commitment); },
        {
          type: 'manager-support.created',
          entity: 'managerSupport',
          entityId: commitment.id,
          summary: `Added manager-owned Day ${horizon} follow-up${person ? ` for ${person.name}` : ''}: ${text}`,
        },
      );
      return { ok: true, id: commitment.id };
    },

    toggleManagerSupportCommitment(commitmentId, patch = {}) {
      const existing = store.state.managerSupport.find((record) => record.id === commitmentId);
      if (!existing) return fail('That manager follow-up no longer exists.');
      if (!['open', 'done'].includes(existing.status)) {
        return fail('A dropped or carried commitment can only be changed in its follow-up history.');
      }
      const done = typeof patch.done === 'boolean' ? patch.done : existing.status !== 'done';
      if (done && patch.completedOn && !isCalendarDay(patch.completedOn)) {
        return fail('Choose a valid completion date.', 'completedOn');
      }
      const completedOn = done ? (patch.completedOn || today()) : null;
      if (completedOn && completedOn > today()) return fail('Completion date cannot be in the future.', 'completedOn');
      store.update(
        (draft) => {
          const target = draft.managerSupport.find((record) => record.id === commitmentId);
          if (!target || !['open', 'done'].includes(target.status)) return;
          target.status = done ? 'done' : 'open';
          target.completedOn = completedOn;
          // Board completion is a manager report, not proof that a 1:1 confirmed it.
          target.completedInMeetingId = null;
          target.updatedAt = stamp();
        },
        {
          type: 'manager-support.toggled',
          entity: 'managerSupport',
          entityId: commitmentId,
          summary: `${done ? 'Completed' : 'Reopened'} manager-owned follow-up: ${existing.text}`,
        },
      );
      return { ok: true, done };
    },

    completeOnboardingPlan(planId) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That 30-60-90 plan no longer exists.');
      if (plan.status === 'completed') return fail('This 30-60-90 plan is already complete.');
      if (!plan.reviews?.[90]?.heldOn) {
        return fail(`Record the Day 90 check-in conversation before marking this ${planKindNoun(plan)} complete.`);
      }
      const person = store.state.people.find((p) => p.id === plan.personId);
      store.update(
        (draft) => {
          const target = draft.onboarding.find((p) => p.id === planId);
          if (!target) return;
          target.status = 'completed';
          target.completedOn = today();
          target.updatedAt = stamp();
        },
        {
          type: 'onboarding.completed',
          entity: 'onboarding',
          entityId: planId,
          summary: `Completed ${plan.kind === 'role-transition' ? 'role-transition' : plan.kind === 'reboarding' ? 're-boarding' : '30-60-90 onboarding'} plan${person ? ` for ${person.name}` : ''}`,
        },
      );
      return { ok: true };
    },

    reopenOnboardingPlan(planId) {
      const plan = onboardingById(planId);
      if (!plan) return fail('That 30-60-90 plan no longer exists.');
      if (plan.status !== 'completed') return fail('This 30-60-90 plan is already active.');
      const person = store.state.people.find((p) => p.id === plan.personId);
      store.update(
        (draft) => {
          const target = draft.onboarding.find((p) => p.id === planId);
          if (!target) return;
          target.status = 'active';
          target.completedOn = null;
          target.updatedAt = stamp();
        },
        {
          type: 'onboarding.reopened',
          entity: 'onboarding',
          entityId: planId,
          summary: `Reopened ${plan.kind === 'role-transition' ? 'role-transition' : plan.kind === 'reboarding' ? 're-boarding' : '30-60-90 onboarding'} plan${person ? ` for ${person.name}` : ''}`,
        },
      );
      return { ok: true };
    },

    /* --------------------------- operational cases & cross-module rules */
    /* ------------------------------------------- Stakeholder comms outbox (Schema v32) */

    approveCommsDraft(draftId, { acknowledgeGaps = false } = {}) {
      const row = (store.state.commsDrafts || []).find((d) => d.id === draftId);
      const gate = approvalGate(row);
      if (!gate.ok) return fail(gate.reason);
      if (row.missing.length && !acknowledgeGaps) {
        return fail(
          `${row.missing.length} fact${row.missing.length === 1 ? ' is' : 's are'} still unconfirmed on the case (${row.missing.join(', ')}). Record them on the case, or approve with an explicit acknowledgement.`,
          'acknowledgeGaps',
        );
      }
      store.update(
        (draft) => {
          const target = (draft.commsDrafts || []).find((d) => d.id === draftId);
          if (!target || !COMMS_OPEN_STATUSES.includes(target.status)) return;
          target.status = 'approved';
          target.approvedOn = today();
          target.approvedAcknowledgedGaps = target.missing.length;
          target.updatedAt = stamp();
        },
        {
          type: 'comms.approved',
          entity: 'comms',
          entityId: draftId,
          summary: `Approved ${row.purpose === 'closure' ? 'closure note' : 'brief'} for ${row.stakeholderName}${row.missing.length ? ` with ${row.missing.length} acknowledged gap(s)` : ''}`,
        },
      );
      return { ok: true, id: draftId };
    },

    /**
     * Editing a human-written message is allowed; editing an approved message
     * withdraws the approval, because the approver approved different text.
     */
    editCommsDraft(draftId, { subject, body } = {}) {
      const row = (store.state.commsDrafts || []).find((d) => d.id === draftId);
      if (!row || !COMMS_OPEN_STATUSES.includes(row.status)) return fail('Only a draft that has not been sent can be edited.');
      const cleanSubject = clean(subject) || '';
      if (!cleanSubject) return fail('Give the message a subject line.', 'subject');
      const cleanBody = String(body ?? '').trim();
      if (!cleanBody) return fail('The message body cannot be empty.', 'body');
      if (cleanBody.length > COMMS_MAX_BODY) return fail(`Keep the message under ${COMMS_MAX_BODY} characters.`, 'body');
      store.update(
        (draft) => {
          const target = (draft.commsDrafts || []).find((d) => d.id === draftId);
          if (!target) return;
          target.subject = cleanSubject.slice(0, 160);
          target.body = cleanBody;
          target.edited = true;
          if (target.status === 'approved') {
            target.status = 'draft';
            target.approvedOn = null;
          }
          target.updatedAt = stamp();
        },
        {
          type: 'comms.edited',
          entity: 'comms',
          entityId: draftId,
          summary: `Edited ${row.stakeholderName}'s ${row.purpose === 'closure' ? 'closure note' : 'brief'}${row.status === 'approved' ? ' (approval withdrawn)' : ''}`,
        },
      );
      return { ok: true, id: draftId };
    },

    /**
     * The app never sends anything. The leader sends the message elsewhere and
     * records it here. For a brief, the stakeholder's last-touch and next-check
     * dates move forward on the case, so the Mendelow cadence (RULE-STAKE-01)
     * reflects what actually happened without a second entry.
     */
    markCommsDraftSent(draftId, { channel = '', sentOn = null } = {}) {
      const row = (store.state.commsDrafts || []).find((d) => d.id === draftId);
      if (!row || !COMMS_OPEN_STATUSES.includes(row.status)) return fail('Only an unsent draft can be marked sent.');
      const day = sentOn || today();
      if (!isCalendarDay(day)) return fail('Choose a valid date the message was sent.', 'sentOn');
      if (day > today()) return fail('A message cannot be recorded as sent in the future.', 'sentOn');
      if (day < row.createdOn) return fail('The send date cannot be before the draft was written.', 'sentOn');
      const cleanChannel = (clean(channel) || 'sent outside LeadOS').slice(0, COMMS_MAX_CHANNEL);
      store.update(
        (draft) => {
          const target = (draft.commsDrafts || []).find((d) => d.id === draftId);
          if (!target) return;
          target.status = 'sent';
          target.sentOn = day;
          target.channel = cleanChannel;
          target.updatedAt = stamp();
          if (target.purpose !== 'brief') return;
          const caseRecord = (draft.cases || []).find((c) => c.id === target.caseId);
          const stakeholder = caseRecord?.stakeholders?.find((s) => stakeholderKeyOf(s) === target.stakeholderKey);
          if (!stakeholder) return;
          const classified = classifyMendelowStakeholder(stakeholder, day);
          stakeholder.lastCommsOn = day;
          stakeholder.nextCommsOn = dayKey(addDays(new Date(`${day}T12:00:00Z`), cadenceDaysOffset(classified.quadrant, classified.stance)));
          caseRecord.updatedAt = stamp();
        },
        {
          type: 'comms.sent',
          entity: 'comms',
          entityId: draftId,
          summary: `Recorded ${row.purpose === 'closure' ? 'closure note' : 'brief'} to ${row.stakeholderName} as sent (${cleanChannel})`,
        },
      );
      return { ok: true, id: draftId };
    },

    dismissCommsDraft(draftId, { reason = '' } = {}) {
      const row = (store.state.commsDrafts || []).find((d) => d.id === draftId);
      if (!row || !COMMS_OPEN_STATUSES.includes(row.status)) return fail('Only an unsent draft can be dismissed.');
      const cleanReason = (clean(reason) || '').slice(0, 400);
      if (cleanReason.length < 3) return fail('Say briefly why this message should not go out, so the decision is on record.', 'reason');
      store.update(
        (draft) => {
          const target = (draft.commsDrafts || []).find((d) => d.id === draftId);
          if (!target) return;
          target.status = 'dismissed';
          target.dismissedReason = cleanReason;
          target.updatedAt = stamp();
        },
        {
          type: 'comms.dismissed',
          entity: 'comms',
          entityId: draftId,
          summary: `Dismissed ${row.stakeholderName}'s ${row.purpose === 'closure' ? 'closure note' : 'brief'}: ${cleanReason.slice(0, 80)}`,
        },
      );
      return { ok: true, id: draftId };
    },

    addCase(data = {}) {
      const title = clean(data.title) || '';
      if (!title) return fail('Name the operational case, incident, or initiative.', 'title');
      const kind = data.kind || 'risk';
      if (!CASE_KINDS.includes(kind)) return fail('Choose a valid case type.', 'kind');
      const status = data.status || 'open';
      if (!CASE_STATUSES.includes(status)) return fail('Choose a valid case status.', 'status');

      const openedOn = data.openedOn || today();
      if (!isCalendarDay(openedOn)) return fail('Choose a valid opened date.', 'openedOn');
      if (openedOn > today()) return fail('A case cannot be opened in the future.', 'openedOn');

      const defaultReviewDays = store.state.settings?.caseReviewDays ?? 14;
      const reviewOn = data.reviewOn !== undefined
        ? (data.reviewOn ? String(data.reviewOn).trim() : null)
        : addDays(openedOn, defaultReviewDays);
      if (reviewOn && !isCalendarDay(reviewOn)) return fail('Choose a valid review date, or leave it blank.', 'reviewOn');
      if (reviewOn && reviewOn < openedOn) return fail('The review date cannot be before the opened date.', 'reviewOn');

      const ownerId = clean(data.ownerId) || null;
      if (ownerId) {
        const owner = store.state.people.find((p) => p.id === ownerId);
        if (!owner) return fail('Choose an existing team member as owner, or leave unassigned.', 'ownerId');
        if (owner.status === 'archived') return fail('Restore this person before assigning a new operational case to them.', 'ownerId');
      }

      const linkedGoalId = clean(data.linkedGoalId) || null;
      if (linkedGoalId && !(store.state.goals || []).some((g) => g.id === linkedGoalId)) {
        return fail('Choose an existing goal to link, or leave unlinked.', 'linkedGoalId');
      }

      const involvedPersonIds = [
        ...new Set(
          (Array.isArray(data.involvedPersonIds) ? data.involvedPersonIds : [])
            .map((pid) => clean(pid))
            .filter((pid) => pid && store.state.people.some((p) => p.id === pid)),
        ),
      ];

      const rawFmea = data.fmea || {};
      const parseRating = (val, fallback, fieldName) => {
        if (val === undefined || val === null || val === '') return { ok: true, value: fallback };
        const n = Number(val);
        if (!Number.isFinite(n) || Math.round(n) < 1 || Math.round(n) > 10) {
          return fail(`Enter a whole rating from 1 to 10 for ${fieldName}.`, fieldName);
        }
        return { ok: true, value: Math.round(n) };
      };
      // Schema v33: a blank rating is "not rated yet" (null), not a silent 5.
      // The case can be opened before anyone can score it; the views and the
      // comms readiness check then show the gap instead of a fabricated RPN.
      const sev = parseRating(rawFmea.severity, null, 'severity');
      if (!sev.ok) return sev;
      const prob = parseRating(rawFmea.probability, null, 'probability');
      if (!prob.ok) return prob;
      const det = parseRating(rawFmea.detectability, null, 'detectability');
      if (!det.ok) return det;

      const rawFin = data.financial || {};
      const parseMoney = (val, fieldName) => {
        if (val === undefined || val === null || val === '') return { ok: true, value: 0 };
        const n = Number(val);
        if (!Number.isFinite(n) || n < 0) return fail('Financial and capacity estimates must be zero or positive.', fieldName);
        return { ok: true, value: Math.round(n * 100) / 100 };
      };
      const opt = parseMoney(rawFin.optimistic, 'optimistic');
      if (!opt.ok) return opt;
      const ml = parseMoney(rawFin.mostLikely, 'mostLikely');
      if (!ml.ok) return ml;
      const pess = parseMoney(rawFin.pessimistic, 'pessimistic');
      if (!pess.ok) return pess;
      if ((opt.value > 0 || ml.value > 0 || pess.value > 0) && (opt.value > ml.value || ml.value > pess.value)) {
        return fail('Keep financial PERT estimates ordered: optimistic <= most likely <= pessimistic.', 'mostLikely');
      }
      const mitCost = parseMoney(rawFin.mitigationCost, 'mitigationCost');
      if (!mitCost.ok) return mitCost;

      const capO = parseMoney(rawFin.capacityDaysOptimistic, 'capacityDaysOptimistic');
      if (!capO.ok) return capO;
      const capM = parseMoney(rawFin.capacityDaysMostLikely, 'capacityDaysMostLikely');
      if (!capM.ok) return capM;
      const capP = parseMoney(rawFin.capacityDaysPessimistic, 'capacityDaysPessimistic');
      if (!capP.ok) return capP;
      if ((capO.value > 0 || capM.value > 0 || capP.value > 0) && (capO.value > capM.value || capM.value > capP.value)) {
        return fail('Keep capacity-day PERT estimates ordered: optimistic <= most likely <= pessimistic.', 'capacityDaysMostLikely');
      }

      const rawRca = data.rca || {};
      const whys = (Array.isArray(rawRca.whys) ? rawRca.whys : [])
        .map((w) => (clean(w) || '').slice(0, 500))
        .filter(Boolean)
        .slice(0, 5);

      const stakeholders = [];
      for (const s of Array.isArray(data.stakeholders) ? data.stakeholders : []) {
        const sName = clean(s?.name) || '';
        if (!sName) continue;
        const pwr = Math.min(5, Math.max(1, Math.round(Number(s?.power) || 3)));
        const intr = Math.min(5, Math.max(1, Math.round(Number(s?.interest) || 3)));
        const stance = STAKEHOLDER_STANCES.includes(s?.stance) ? s.stance : 'neutral';
        const commsCadence = STAKEHOLDER_CADENCES.includes(s?.commsCadence) ? s.commsCadence : '';
        const nextCommsOn = s?.nextCommsOn ? String(s.nextCommsOn).trim() : null;
        if (nextCommsOn && !isCalendarDay(nextCommsOn)) {
          return fail(`Choose a valid communication date for stakeholder ${sName}.`, 'stakeholders');
        }
        const lastCommsOn = s?.lastCommsOn ? String(s.lastCommsOn).trim() : null;
        if (lastCommsOn && (!isCalendarDay(lastCommsOn) || lastCommsOn > today())) {
          return fail(`Last communication date for ${sName} must be valid and not in the future.`, 'stakeholders');
        }
        stakeholders.push({
          id: clean(s?.id) || id('cstk'),
          name: sName.slice(0, 160),
          role: (clean(s?.role) || '').slice(0, 120),
          power: pwr,
          interest: intr,
          stance,
          commsCadence,
          lastCommsOn,
          nextCommsOn,
          keyMessage: (clean(s?.keyMessage) || '').slice(0, 600),
        });
      }

      const isClosed = status === 'resolved' || status === 'closed';
      const caseRecord = {
        ...append(null, 'case'),
        kind,
        status,
        title: title.slice(0, 200),
        summary: (clean(data.summary) || '').slice(0, 4000),
        ownerId,
        involvedPersonIds,
        linkedGoalId,
        openedOn,
        reviewOn,
        resolvedOn: isClosed ? today() : null,
        resolutionNotes: isClosed ? (clean(data.resolutionNotes) || '').slice(0, 4000) : '',
        fmea: {
          severity: sev.value,
          probability: prob.value,
          detectability: det.value,
          failureMode: (clean(rawFmea.failureMode) || '').slice(0, 600),
          effect: (clean(rawFmea.effect) || '').slice(0, 600),
          controls: (clean(rawFmea.controls) || '').slice(0, 600),
          residualSeverity: null,
          residualProbability: null,
          residualDetectability: null,
        },
        financial: {
          currency: (clean(rawFin.currency) || 'USD').toUpperCase().slice(0, 6),
          optimistic: opt.value,
          mostLikely: ml.value,
          pessimistic: pess.value,
          mitigationCost: mitCost.value,
          capacityDaysOptimistic: capO.value,
          capacityDaysMostLikely: capM.value,
          capacityDaysPessimistic: capP.value,
          opportunityCost: (clean(rawFin.opportunityCost) || '').slice(0, 600),
        },
        // Schema v22: RULE-FCT-03 freezes the opening forecast below; settled
        // actuals are recorded at resolution.
        forecastSnapshot: null,
        actuals: null,
        rca: {
          problemStatement: (clean(rawRca.problemStatement) || '').slice(0, 1000),
          whys,
          rootCause: (clean(rawRca.rootCause) || '').slice(0, 1000),
          systemicBarrier: (clean(rawRca.systemicBarrier) || '').slice(0, 1000),
          preventiveAction: (clean(rawRca.preventiveAction) || '').slice(0, 1000),
        },
        stakeholders,
        autoPropagate: data.autoPropagate !== false,
        updatedAt: stamp(),
      };

      let propagations = [];
      store.update(
        (draft) => {
          draft.cases = Array.isArray(draft.cases) ? draft.cases : [];
          draft.links = Array.isArray(draft.links) ? draft.links : [];
          draft.cases.push(caseRecord);
          if (data._upstreamLink) {
            ensureEntityLink(
              draft,
              {
                sourceType: 'case',
                sourceId: caseRecord.id,
                targetType: data._upstreamLink.sourceType,
                targetId: data._upstreamLink.sourceId,
                relation: 'escalates-from',
                ruleId: 'RULE-ESC-01',
                summary: data._upstreamLink.summary || `Escalated from ${data._upstreamLink.sourceType}`,
              },
              { idFactory: id, todayStr: today(), nowIso: stamp() },
            );
          }
          // The shared caseCreatedRule freezes and fans out this record on
          // the same event spine used by rule-generated cases.
        },
        {
          type: 'case.created',
          entity: 'case',
          entityId: caseRecord.id,
          summary: `Operational case registered (${kind}): ${caseRecord.title.slice(0, 70)}`,
          automationOptions: {
            ...(data.propagateDecision === undefined ? {} : { propagateDecision: data.propagateDecision }),
            ...(data.propagateDelegation === undefined ? {} : { propagateDelegation: data.propagateDelegation }),
          },
        },
      );
      propagations = store.lastPropagations || [];
      return { ok: true, id: caseRecord.id, propagations };
    },

    updateCase(caseId, patch = {}) {
      const current = (store.state.cases || []).find((c) => c.id === caseId);
      if (!current) return fail('That operational case no longer exists.');

      const title = patch.title !== undefined ? clean(patch.title) || '' : current.title;
      if (!title) return fail('Name the operational case, incident, or initiative.', 'title');
      const kind = patch.kind !== undefined ? patch.kind : current.kind;
      if (!CASE_KINDS.includes(kind)) return fail('Choose a valid case type.', 'kind');
      const status = patch.status !== undefined ? patch.status : current.status;
      if (!CASE_STATUSES.includes(status)) return fail('Choose a valid case status.', 'status');

      const openedOn = patch.openedOn !== undefined ? patch.openedOn : current.openedOn;
      if (!isCalendarDay(openedOn) || openedOn > today()) {
        return fail('Choose a valid opened date that is not in the future.', 'openedOn');
      }
      const reviewOn = patch.reviewOn !== undefined
        ? (patch.reviewOn ? String(patch.reviewOn).trim() : null)
        : current.reviewOn;
      if (reviewOn && !isCalendarDay(reviewOn)) return fail('Choose a valid review date, or leave it blank.', 'reviewOn');
      if (reviewOn && reviewOn < openedOn) return fail('The review date cannot be before the opened date.', 'reviewOn');

      const ownerId = patch.ownerId !== undefined ? (clean(patch.ownerId) || null) : current.ownerId;
      if (ownerId && ownerId !== current.ownerId) {
        const owner = store.state.people.find((p) => p.id === ownerId);
        if (!owner) return fail('Choose an existing team member as owner, or leave unassigned.', 'ownerId');
        if (owner.status === 'archived') return fail('Restore this person before assigning an operational case to them.', 'ownerId');
      }

      const linkedGoalId = patch.linkedGoalId !== undefined ? (clean(patch.linkedGoalId) || null) : current.linkedGoalId;
      if (linkedGoalId && !(store.state.goals || []).some((g) => g.id === linkedGoalId)) {
        return fail('Choose an existing goal to link, or leave unlinked.', 'linkedGoalId');
      }

      const involvedPersonIds = patch.involvedPersonIds !== undefined
        ? [
            ...new Set(
              (Array.isArray(patch.involvedPersonIds) ? patch.involvedPersonIds : [])
                .map((pid) => clean(pid))
                .filter((pid) => pid && store.state.people.some((p) => p.id === pid)),
            ),
          ]
        : current.involvedPersonIds;

      const nextFmea = { ...current.fmea };
      if (patch.fmea) {
        for (const key of ['severity', 'probability', 'detectability']) {
          if (patch.fmea[key] !== undefined) {
            // Schema v33: blank clears the rating back to "not rated yet",
            // exactly like residual ratings below; a provided value must be 1–10.
            if (patch.fmea[key] === null || patch.fmea[key] === '') {
              nextFmea[key] = null;
            } else {
              const n = Number(patch.fmea[key]);
              if (!Number.isFinite(n) || Math.round(n) < 1 || Math.round(n) > 10) {
                return fail(`Enter a whole rating from 1 to 10 for ${key}.`, key);
              }
              nextFmea[key] = Math.round(n);
            }
          }
        }
        for (const key of ['failureMode', 'effect', 'controls']) {
          if (patch.fmea[key] !== undefined) nextFmea[key] = (clean(patch.fmea[key]) || '').slice(0, 600);
        }
        for (const key of ['residualSeverity', 'residualProbability', 'residualDetectability']) {
          if (patch.fmea[key] !== undefined) {
            if (patch.fmea[key] === null || patch.fmea[key] === '') {
              nextFmea[key] = null;
            } else {
              const n = Number(patch.fmea[key]);
              if (!Number.isFinite(n) || Math.round(n) < 1 || Math.round(n) > 10) {
                return fail(`Enter a whole residual rating from 1 to 10 for ${key}.`, key);
              }
              nextFmea[key] = Math.round(n);
            }
          }
        }
      }

      const nextFinancial = { ...current.financial };
      if (patch.financial) {
        if (patch.financial.currency !== undefined) {
          nextFinancial.currency = (clean(patch.financial.currency) || 'USD').toUpperCase().slice(0, 6);
        }
        for (const key of [
          'optimistic', 'mostLikely', 'pessimistic', 'mitigationCost',
          'capacityDaysOptimistic', 'capacityDaysMostLikely', 'capacityDaysPessimistic',
        ]) {
          if (patch.financial[key] !== undefined) {
            const raw = patch.financial[key];
            const n = raw === '' || raw === null ? 0 : Number(raw);
            if (!Number.isFinite(n) || n < 0) {
              return fail('Financial and capacity estimates must be zero or positive.', key);
            }
            nextFinancial[key] = Math.round(n * 100) / 100;
          }
        }
        if (patch.financial.opportunityCost !== undefined) {
          nextFinancial.opportunityCost = (clean(patch.financial.opportunityCost) || '').slice(0, 600);
        }
      }
      if (
        (nextFinancial.optimistic > 0 || nextFinancial.mostLikely > 0 || nextFinancial.pessimistic > 0) &&
        (nextFinancial.optimistic > nextFinancial.mostLikely || nextFinancial.mostLikely > nextFinancial.pessimistic)
      ) {
        return fail('Keep financial PERT estimates ordered: optimistic <= most likely <= pessimistic.', 'mostLikely');
      }
      if (
        (nextFinancial.capacityDaysOptimistic > 0 || nextFinancial.capacityDaysMostLikely > 0 || nextFinancial.capacityDaysPessimistic > 0) &&
        (nextFinancial.capacityDaysOptimistic > nextFinancial.capacityDaysMostLikely || nextFinancial.capacityDaysMostLikely > nextFinancial.capacityDaysPessimistic)
      ) {
        return fail('Keep capacity-day PERT estimates ordered: optimistic <= most likely <= pessimistic.', 'capacityDaysMostLikely');
      }

      const nextRca = { ...current.rca };
      if (patch.rca) {
        for (const key of ['problemStatement', 'rootCause', 'systemicBarrier', 'preventiveAction']) {
          if (patch.rca[key] !== undefined) nextRca[key] = (clean(patch.rca[key]) || '').slice(0, 1000);
        }
        if (Array.isArray(patch.rca.whys)) {
          nextRca.whys = patch.rca.whys
            .map((w) => (clean(w) || '').slice(0, 500))
            .filter(Boolean)
            .slice(0, 5);
        }
      }

      let nextStakeholders = current.stakeholders;
      if (Array.isArray(patch.stakeholders)) {
        nextStakeholders = [];
        for (const s of patch.stakeholders) {
          const sName = clean(s?.name) || '';
          if (!sName) continue;
          const nextCommsOn = s?.nextCommsOn ? String(s.nextCommsOn).trim() : null;
          if (nextCommsOn && !isCalendarDay(nextCommsOn)) {
            return fail(`Choose a valid communication date for stakeholder ${sName}.`, 'stakeholders');
          }
          const lastCommsOn = s?.lastCommsOn ? String(s.lastCommsOn).trim() : null;
          if (lastCommsOn && (!isCalendarDay(lastCommsOn) || lastCommsOn > today())) {
            return fail(`Last communication date for ${sName} must be valid and not in the future.`, 'stakeholders');
          }
          nextStakeholders.push({
            id: clean(s?.id) || id('cstk'),
            name: sName.slice(0, 160),
            role: (clean(s?.role) || '').slice(0, 120),
            power: Math.min(5, Math.max(1, Math.round(Number(s?.power) || 3))),
            interest: Math.min(5, Math.max(1, Math.round(Number(s?.interest) || 3))),
            stance: STAKEHOLDER_STANCES.includes(s?.stance) ? s.stance : 'neutral',
            commsCadence: STAKEHOLDER_CADENCES.includes(s?.commsCadence) ? s.commsCadence : '',
            lastCommsOn,
            nextCommsOn,
            keyMessage: (clean(s?.keyMessage) || '').slice(0, 600),
          });
        }
      }

      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.cases || []).find((c) => c.id === caseId);
          if (!target) return;
          target.title = title.slice(0, 200);
          target.kind = kind;
          target.status = status;
          if (patch.summary !== undefined) target.summary = (clean(patch.summary) || '').slice(0, 4000);
          target.ownerId = ownerId;
          target.involvedPersonIds = involvedPersonIds;
          target.linkedGoalId = linkedGoalId;
          target.openedOn = openedOn;
          target.reviewOn = reviewOn;
          if (status === 'resolved' || status === 'closed') {
            target.resolvedOn = target.resolvedOn || today();
            if (patch.resolutionNotes !== undefined) {
              target.resolutionNotes = (clean(patch.resolutionNotes) || '').slice(0, 4000);
            }
          } else {
            target.resolvedOn = null;
            target.resolutionNotes = '';
            // An open case carries no settlement (schema enforces the same
            // on reload); the frozen opening forecast is retained.
            target.actuals = null;
          }
          target.fmea = nextFmea;
          target.financial = nextFinancial;
          target.rca = nextRca;
          target.stakeholders = nextStakeholders;
          if (patch.autoPropagate !== undefined) target.autoPropagate = Boolean(patch.autoPropagate);
          target.updatedAt = stamp();

          if (status === 'resolved' || status === 'closed') {
            // Closing a case through the Edit dialog must run the same
            // resolution propagation as resolveCase (RULE-CAP-01 reserve
            // release + RULE-GOAL-01 check-in). propagateCaseEvent ignores
            // closed cases, so routing this path through it alone used to
            // leak the capacity reserve as open forever.
            propagations = propagateCaseResolution(draft, target, {
              now: clock(),
              idFactory: id,
              logEvent,
            });
          } else {
            propagations = propagateCaseEvent(draft, target, {
              now: clock(),
              idFactory: id,
              logEvent,
              options: patch,
            });
            // RULE-FCT-03: an edit that first quantifies the case freezes the
            // opening forecast (no-op once frozen).
            const frozen = freezeCaseForecast(draft, target, {
              now: clock(),
              todayStr: today(),
              logEvent,
            });
            if (frozen) propagations.push(frozen);
          }
        },
        {
          type: 'case.updated',
          entity: 'case',
          entityId: caseId,
          summary: `Operational case updated: ${title.slice(0, 70)}`,
        },
      );
      return { ok: true, propagations };
    },

    /** Commission evidence, never apply a rehearsal snapshot. Exact local
     * revision + numeric-basis guards; NOT a cross-tab compare-and-swap lock. */
    requestMitigationReview({ caseId, input, ownerId, expectedRevision, evidenceKey } = {}) {
      if (store.writeBlockReason || store.isLocked) return fail(store.writeBlockReason || 'Unlock the workspace first.');
      if (!Number.isInteger(expectedRevision) || expectedRevision !== store.state.meta.revision) {
        return fail('The workspace changed after analysis. Re-run robustness before requesting work.');
      }
      const source = (store.state.cases || []).find((row) => row.id === caseId);
      if (!source || !isCaseOpen(source)) return fail('Choose an open operational case.');
      if (source.autoPropagate === false) return fail('Case automation is paused. Review that setting before requesting cross-module work.');
      if (!(store.state.people || []).some((row) => row.id === ownerId && row.status !== 'archived')) {
        return fail('Choose an active verification owner.');
      }
      const report = analyzeMitigationRobustness(source, input);
      if (!report.ok) return fail(report.error);
      const key = robustnessEvidenceKey(caseId, report, ownerId);
      if (key !== evidenceKey) return fail('The numeric evidence changed. Re-run robustness first.');
      const existing = robustnessDecision(store.state, key);
      if (existing) return { ok: true, id: existing.id, existing: true, propagations: [], saved: !store.persistError, savePending: store.isEncrypted };
      store.update(() => {}, {
        type: ROBUSTNESS_EVENT, entity: 'case', entityId: caseId,
        summary: 'Requested a numeric mitigation evidence gate; no mitigation applied.',
        automationOptions: { input: report.input, ownerId, evidenceKey: key },
      });
      const decision = robustnessDecision(store.state, key);
      if (!decision) return fail('The review rule did not complete. Inspect Propagation ledger for a failure receipt; no mitigation was applied.');
      return { ok: true, id: decision.id, existing: false, propagations: store.lastPropagations || [],
        saved: !store.persistError, savePending: store.isEncrypted };
    },

    syncCaseAutomations(caseId, options = {}) {
      const current = (store.state.cases || []).find((c) => c.id === caseId);
      if (!current) return fail('That operational case no longer exists.');
      if (!isCaseOpen(current)) return fail('Reopen this case before running cross-module automation.');
      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.cases || []).find((c) => c.id === caseId);
          if (!target) return;
          target.autoPropagate = true;
          propagations = propagateCaseEvent(draft, target, {
            now: clock(),
            idFactory: id,
            logEvent,
            options,
          });
          target.updatedAt = stamp();
        },
        {
          type: 'case.synced',
          entity: 'case',
          entityId: caseId,
          summary: `Synced cross-module rules on case “${current.title.slice(0, 60)}” (${propagations.length} action${propagations.length === 1 ? '' : 's'})`,
        },
      );
      return { ok: true, propagations };
    },

    logCaseStakeholderComms(caseId, stakeholderId, data = {}) {
      const current = (store.state.cases || []).find((c) => c.id === caseId);
      if (!current) return fail('That operational case no longer exists.');
      const stakeholder = (current.stakeholders || []).find((s) => s.id === stakeholderId);
      if (!stakeholder) return fail('That stakeholder entry no longer exists.');

      const date = data.date || today();
      if (!isCalendarDay(date) || date > today()) {
        return fail('Choose a valid communication date that is not in the future.', 'date');
      }
      if (date < current.openedOn) {
        return fail('Communication cannot predate the case opened date.', 'date');
      }
      const nextCommsOn = data.nextCommsOn !== undefined
        ? (data.nextCommsOn ? String(data.nextCommsOn).trim() : null)
        : stakeholder.nextCommsOn;
      if (nextCommsOn && !isCalendarDay(nextCommsOn)) {
        return fail('Choose a valid next communication date, or leave it blank.', 'nextCommsOn');
      }
      if (nextCommsOn && nextCommsOn < date) {
        return fail('The next communication checkpoint cannot be before this brief.', 'nextCommsOn');
      }
      const stance = data.stance !== undefined
        ? (STAKEHOLDER_STANCES.includes(data.stance) ? data.stance : null)
        : stakeholder.stance;
      if (!stance) return fail('Choose a valid coalition stance.', 'stance');
      const keyMessage = data.keyMessage !== undefined
        ? (clean(data.keyMessage) || '').slice(0, 600)
        : stakeholder.keyMessage;
      if (!keyMessage) return fail('Record a short summary of what was aligned or raised.', 'keyMessage');

      store.update(
        (draft) => {
          const targetCase = (draft.cases || []).find((c) => c.id === caseId);
          const targetStk = targetCase?.stakeholders?.find((s) => s.id === stakeholderId);
          if (!targetStk) return;
          targetStk.lastCommsOn = date;
          targetStk.nextCommsOn = nextCommsOn;
          targetStk.stance = stance;
          targetStk.keyMessage = keyMessage;
          if (data.commsCadence && STAKEHOLDER_CADENCES.includes(data.commsCadence)) {
            targetStk.commsCadence = data.commsCadence;
          }
          targetCase.updatedAt = stamp();
        },
        {
          type: 'case.stakeholder.comms',
          entity: 'case',
          entityId: caseId,
          summary: `Logged stakeholder brief with ${stakeholder.name} (${stance}) on “${current.title.slice(0, 50)}”`,
        },
      );
      return { ok: true };
    },

    resolveCase(caseId, data = {}) {
      const current = (store.state.cases || []).find((c) => c.id === caseId);
      if (!current) return fail('That operational case no longer exists.');
      if (!isCaseOpen(current)) return fail('This operational case is already resolved.');

      const resolvedOn = data.resolvedOn || today();
      if (!isCalendarDay(resolvedOn) || resolvedOn > today()) {
        return fail('Choose a valid resolution date that is not in the future.', 'resolvedOn');
      }
      if (resolvedOn < current.openedOn) {
        return fail('Resolution date cannot predate the opened date.', 'resolvedOn');
      }
      const resolutionNotes = clean(data.resolutionNotes) || '';
      if (resolutionNotes.length < 5) {
        return fail('Record what resolved the case and which systemic guardrail holds it.', 'resolutionNotes');
      }
      const terminalStatus = data.status === 'closed' ? 'closed' : 'resolved';

      const parseResidual = (val, fieldName) => {
        if (val === undefined || val === null || val === '') return { ok: true, value: null };
        const n = Number(val);
        if (!Number.isFinite(n) || Math.round(n) < 1 || Math.round(n) > 10) {
          return fail(`Enter a whole residual rating from 1 to 10 for ${fieldName}, or leave blank.`, fieldName);
        }
        return { ok: true, value: Math.round(n) };
      };
      const resS = parseResidual(data.residualSeverity, 'residualSeverity');
      if (!resS.ok) return resS;
      const resP = parseResidual(data.residualProbability, 'residualProbability');
      if (!resP.ok) return resP;
      const resD = parseResidual(data.residualDetectability, 'residualDetectability');
      if (!resD.ok) return resD;
      const anyResidual = resS.value !== null || resP.value !== null || resD.value !== null;
      const allResidual = resS.value !== null && resP.value !== null && resD.value !== null;
      if (anyResidual && !allResidual) {
        return fail('Record all three residual FMEA scores (Severity, Probability, Detection) together, or leave all three blank.', 'residualSeverity');
      }

      // Schema v22: optional settled actuals recorded at resolution — the
      // moment the opening forecast (RULE-FCT-03) becomes scorable.
      const parsedActuals = parseCaseActuals(data);
      if (!parsedActuals.ok) return parsedActuals;

      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.cases || []).find((c) => c.id === caseId);
          if (!target) return;
          target.status = terminalStatus;
          target.resolvedOn = resolvedOn;
          target.resolutionNotes = resolutionNotes.slice(0, 4000);
          if (allResidual) {
            target.fmea.residualSeverity = resS.value;
            target.fmea.residualProbability = resP.value;
            target.fmea.residualDetectability = resD.value;
          }
          if (data.systemicBarrier !== undefined && clean(data.systemicBarrier)) {
            target.rca.systemicBarrier = clean(data.systemicBarrier).slice(0, 1000);
          }
          if (parsedActuals.provided) {
            target.actuals = { ...parsedActuals.actuals, settledOn: resolvedOn };
          }
          target.updatedAt = stamp();
          propagations = propagateCaseResolution(draft, target, {
            now: clock(),
            idFactory: id,
            logEvent,
          });
          // RULE-FIN-02 (reverse): encumbrances funding this case are now
          // actuals-due; the amount is recorded from evidence, never copied.
          propagations.push(...propagateSourceCompletionToBudgets(draft, 'case', caseId, { now: clock(), logEvent }));
          // RULE-FCT-04: scoring this settlement may prove systematic
          // under-reserving across the case book — if so, the correction
          // becomes one owned DACI decision, opened atomically here.
          if (parsedActuals.provided) {
            const governance = evaluateCaseCalibrationGovernance(draft, {
              now: clock(),
              idFactory: id,
              todayStr: today(),
              nowIso: stamp(),
              logEvent,
              triggerLabel: 'case resolution',
            });
            if (governance) propagations.push(governance);
            propagations.push(...refreshCalibratedCaseCapacityReserves(draft, {
              now: clock(), idFactory: id, logEvent, triggerLabel: 'case resolution',
            }));
          }
        },
        {
          type: 'case.resolved',
          entity: 'case',
          entityId: caseId,
          summary: `Operational case ${terminalStatus}: ${current.title.slice(0, 70)}`,
        },
      );
      return { ok: true, propagations };
    },

    recordCaseActuals(caseId, data = {}) {
      const current = (store.state.cases || []).find((c) => c.id === caseId);
      if (!current) return fail('That operational case no longer exists.');
      if (isCaseOpen(current)) {
        return fail('Resolve the case before recording settled actuals — an open case has not settled yet.');
      }
      const parsedActuals = parseCaseActuals(data);
      if (!parsedActuals.ok) return parsedActuals;
      if (!parsedActuals.provided) {
        return fail('Record at least one settled actual: whether it materialised, the realised exposure, the actual mitigation spend, or the diverted days.', 'realisedExposure');
      }
      const settledOn = data.settledOn || current.resolvedOn || today();
      if (!isCalendarDay(settledOn) || settledOn > today()) {
        return fail('Choose a valid settlement date that is not in the future.', 'settledOn');
      }
      if (settledOn < current.openedOn) {
        return fail('The settlement date cannot predate the opened date.', 'settledOn');
      }

      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.cases || []).find((c) => c.id === caseId);
          if (!target) return;
          target.actuals = { ...parsedActuals.actuals, settledOn };
          target.updatedAt = stamp();
          // RULE-FCT-04: a backfilled settlement counts toward the evidence
          // base exactly like one recorded at resolution.
          const governance = evaluateCaseCalibrationGovernance(draft, {
            now: clock(),
            idFactory: id,
            todayStr: today(),
            nowIso: stamp(),
            logEvent,
            triggerLabel: 'case actuals backfill',
          });
          if (governance) propagations.push(governance);
          propagations.push(...refreshCalibratedCaseCapacityReserves(draft, {
            now: clock(), idFactory: id, logEvent, triggerLabel: 'case actuals backfill',
          }));
        },
        {
          type: 'case.actuals',
          entity: 'case',
          entityId: caseId,
          summary: `Settled actuals recorded for case: ${current.title.slice(0, 70)}`,
        },
      );
      return { ok: true, propagations };
    },

    reopenCase(caseId) {
      const current = (store.state.cases || []).find((c) => c.id === caseId);
      if (!current) return fail('That operational case no longer exists.');
      if (isCaseOpen(current)) return fail('This operational case is already open.');
      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.cases || []).find((c) => c.id === caseId);
          if (!target) return;
          target.status = 'open';
          target.resolvedOn = null;
          // Schema normalisation blanks resolutionNotes and actuals on open
          // cases; clearing them here keeps live state identical to reloaded
          // state (a reopened case's settlement did not hold, so its actuals
          // leave the calibration ledger until it settles again). The frozen
          // opening forecast stays: the original belief does not change.
          target.resolutionNotes = '';
          target.actuals = null;
          target.updatedAt = stamp();
          // Reopening a case puts its diverted capacity back into the plan; the
          // reserve was released when the case closed (RULE-CAP-01).
          syncCaseCapacityReserve(draft, target, {
            now: clock(),
            idFactory: id,
            todayStr: today(),
            nowIso: stamp(),
          });
          propagations = syncCaseCoachingPromptPhase(draft, target, 'active', { logEvent });
        },
        {
          type: 'case.reopened',
          entity: 'case',
          entityId: caseId,
          summary: `Reopened operational case: ${current.title.slice(0, 70)}`,
        },
      );
      return { ok: true, propagations };
    },

    deleteCase(caseId) {
      const current = (store.state.cases || []).find((c) => c.id === caseId);
      if (!current) return fail('That operational case no longer exists.');
      store.update(
        (draft) => {
          draft.cases = (draft.cases || []).filter((c) => c.id !== caseId);
          draft.links = (draft.links || []).filter(
            (l) => !((l.sourceType === 'case' && l.sourceId === caseId) || (l.targetType === 'case' && l.targetId === caseId)),
          );
        },
        {
          type: 'case.deleted',
          entity: 'case',
          entityId: caseId,
          summary: `Deleted operational case: ${current.title.slice(0, 70)}`,
        },
      );
      return { ok: true };
    },

    linkCaseEntity(caseId, data = {}) {
      const current = (store.state.cases || []).find((c) => c.id === caseId);
      if (!current) return fail('That operational case no longer exists.');
      const targetType = clean(data.targetType) || '';
      const targetId = clean(data.targetId) || '';
      const relation = clean(data.relation) || '';
      if (FORBIDDEN_LINK_TYPES.includes(targetType)) {
        return fail('Confidential conflict records and anonymous pulse responses can never be linked to operational cases.', 'targetType');
      }
      if (!LINK_ENTITY_TYPES.includes(targetType)) return fail('Choose a valid module type to link.', 'targetType');
      if (!LINK_RELATIONS.includes(relation)) return fail('Choose a valid relationship type.', 'relation');
      if (SYSTEM_GENERATED_LINK_RELATIONS.includes(relation)) return fail('That relationship is discovered and maintained by LeadOS from recorded data; it cannot be asserted manually.', 'relation');
      if (targetType === 'case' && targetId === caseId) return fail('A case cannot link to itself.', 'targetId');
      const resolved = resolveLinkedEntity(store.state, targetType, targetId);
      if (!resolved) return fail('Choose an existing record to link.', 'targetId');

      let created = false;
      let link = null;
      store.update(
        (draft) => {
          const res = ensureEntityLink(
            draft,
            {
              sourceType: 'case',
              sourceId: caseId,
              targetType,
              targetId,
              relation,
              ruleId: 'MANUAL',
              summary: (clean(data.summary) || `${relation}: ${resolved.title}`).slice(0, 300),
            },
            { idFactory: id, todayStr: today(), nowIso: stamp() },
          );
          created = res.created;
          link = res.link;
        },
        {
          type: 'case.linked',
          entity: 'case',
          entityId: caseId,
          summary: `Linked ${targetType} “${resolved.title.slice(0, 50)}” (${relation}) to case “${current.title.slice(0, 45)}”`,
        },
      );
      return { ok: true, created, id: link?.id || null };
    },

    // Explicitly retire only a dangling mitigation edge. No live work is deleted.
    removeMissingCaseMitigation(caseId, linkId) {
      const record = (store.state.cases || []).find((c) => c.id === caseId);
      const link = (store.state.links || []).find((l) => l && l.id === linkId);
      if (!record || !link || link.relation !== 'mitigates') return fail('That missing mitigation link is no longer available.');
      const peerId = link.sourceType === 'case' && link.sourceId === caseId && link.targetType === 'delegation'
        ? link.targetId : link.targetType === 'case' && link.targetId === caseId && link.sourceType === 'delegation' ? link.sourceId : null;
      if (!peerId || (store.state.delegations || []).some((d) => d.id === peerId)) {
        return fail('Only a link to a missing mitigation can be removed here.');
      }
      store.update((draft) => {
        draft.links = draft.links.filter((l) => l.id !== linkId);
      }, { type: 'case.mitigation-link.removed', entity: 'case', entityId: caseId,
        summary: `Removed missing mitigation link ${linkId} (delegation ${peerId}) after review; no delegation was deleted.` });
      if ((store.state.links || []).some((l) => l.id === linkId)) return fail('The workspace could not be updated. Check its storage status.');
      const gateFailed = (store.lastPropagationMetrics?.pairs || []).some((p) =>
        p.rule === 'caseCreatedRule' && p.event === 'case.mitigation-link.removed' && p.status === 'rolled-back');
      const warning = gateFailed ? 'Link removed, but the mitigation gate failed to run. Check the propagation ledger.'
        : store.persistError ? 'Link removed in memory but not saved. Check workspace storage.' : null;
      return { ok: true, warning, propagations: store.lastPropagations || [] };
    },

    /* --------------------------------------------- negotiation workbench (v23) */

    addNegotiation(data = {}) {
      const built = assembleNegotiation(data, null);
      if (!built.ok) return built;
      const record = built.record;
      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          draft.negotiations = Array.isArray(draft.negotiations) ? draft.negotiations : [];
          draft.negotiations.push(record);
          propagations = propagateNegotiationEvent(draft, record, {
            now: clock(),
            idFactory: id,
            logEvent,
            options: data,
          });
        },
        {
          type: 'negotiation.created',
          entity: 'negotiation',
          entityId: record.id,
          summary: `Negotiation registered (${record.kind}): ${record.title.slice(0, 70)}`,
        },
      );
      return { ok: true, id: record.id, propagations };
    },

    updateNegotiation(negotiationId, patch = {}) {
      const existing = (store.state.negotiations || []).find((n) => n.id === negotiationId);
      if (!existing) return fail('That negotiation no longer exists.');
      const merged = { ...existing, ...patch, id: existing.id };
      const built = assembleNegotiation(merged, existing);
      if (!built.ok) return built;
      const record = built.record;
      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const index = (draft.negotiations || []).findIndex((n) => n.id === negotiationId);
          if (index < 0) return;
          draft.negotiations[index] = record;
          propagations = propagateNegotiationEvent(draft, record, {
            now: clock(),
            idFactory: id,
            logEvent,
            options: patch,
          });
        },
        {
          type: 'negotiation.updated',
          entity: 'negotiation',
          entityId: record.id,
          summary: `Negotiation updated: ${record.title.slice(0, 70)}`,
        },
      );
      return { ok: true, id: record.id, propagations };
    },

    /**
     * Lifecycle transition for scheduled/active/impasse/withdrawn states.
     * Agreement goes through recordNegotiationAgreement so terms are captured.
     */
    setNegotiationStatus(negotiationId, status) {
      const existing = (store.state.negotiations || []).find((n) => n.id === negotiationId);
      if (!existing) return fail('That negotiation no longer exists.');
      if (!NEGOTIATION_STATUSES.includes(status)) return fail('Choose a valid negotiation status.');
      if (status === 'agreed') {
        return fail('Use Record agreement so the agreed terms and owners are captured.');
      }
      const allowed = NEGOTIATION_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(status)) {
        return fail(`“${existing.status}” cannot move directly to “${status}”. Allowed: ${allowed.join(', ') || 'none'}.`);
      }
      store.update(
        (draft) => {
          const target = (draft.negotiations || []).find((n) => n.id === negotiationId);
          if (!target) return;
          target.status = status;
          target.updatedAt = stamp();
          if (status === 'withdrawn') target.closedOn = today();
          if (status === 'scheduled' && !target.nextSessionOn) {
            target.nextSessionOn = addDays(today(), store.state.settings?.negotiationReviewDays ?? 14);
          }
          if (OPEN_NEGOTIATION_STATUSES.includes(status)) target.closedOn = null;
        },
        {
          type: 'negotiation.statusChanged',
          entity: 'negotiation',
          entityId: negotiationId,
          summary: `Negotiation “${existing.title.slice(0, 60)}” moved to ${status}`,
        },
      );

      const escalation = status === 'impasse' ? maybeEscalateNegotiationImpasse(negotiationId) : null;
      return { ok: true, escalation };
    },

    recordNegotiationAgreement(negotiationId, data = {}) {
      const existing = (store.state.negotiations || []).find((n) => n.id === negotiationId);
      if (!existing) return fail('That negotiation no longer exists.');
      if (existing.status === 'withdrawn') return fail('A withdrawn negotiation cannot record an agreement; reopen it first.');

      const existingById = new Map((existing.agreedTerms || []).map((t) => [t.id, t]));
      const rawTerms = Array.isArray(data.agreedTerms) ? data.agreedTerms : [];
      const agreedTerms = [];
      for (const [index, raw] of rawTerms.entries()) {
        const text = (clean(raw?.text) || '').slice(0, 600);
        if (!text) return fail(`Agreed term ${index + 1} needs text describing what was committed.`, 'agreedTerms');
        const ownerId = clean(raw?.ownerId) || null;
        if (ownerId && !store.state.people.some((p) => p.id === ownerId)) {
          return fail(`Term “${text.slice(0, 40)}”: choose an existing team member, or leave the owner blank.`, 'agreedTerms');
        }
        let dueOn = null;
        if (raw?.dueOn) {
          if (!isCalendarDay(raw.dueOn)) return fail(`Term “${text.slice(0, 40)}”: choose a valid due date.`, 'agreedTerms');
          dueOn = raw.dueOn;
        }
        const termId = clean(raw?.id) || id('negterm');
        const prevTerm = existingById.get(termId) || null;
        const hasAgreedVal = raw?.agreedValue !== null && raw?.agreedValue !== undefined && raw?.agreedValue !== '';
        const agreedNum = hasAgreedVal ? Number(raw.agreedValue) : NaN;
        const hasSettledVal = raw?.settledValue !== null && raw?.settledValue !== undefined && raw?.settledValue !== '';
        const settledNum = hasSettledVal ? Number(raw.settledValue) : NaN;
        agreedTerms.push({
          id: termId,
          issueId: clean(raw?.issueId) || null,
          text,
          ownerId,
          dueOn,
          agreedValue: Number.isFinite(agreedNum) ? Math.round(agreedNum * 100) / 100 : null,
          settledValue: Number.isFinite(settledNum)
            ? Math.round(settledNum * 100) / 100
            : (prevTerm?.settledValue ?? null),
          unit: (clean(raw?.unit) || '').slice(0, 12),
          priorOwners: Array.isArray(raw?.priorOwners)
            ? raw.priorOwners
            : (Array.isArray(prevTerm?.priorOwners) ? prevTerm.priorOwners : []),
        });
      }

      let closedOn = today();
      if (data.closedOn !== undefined && data.closedOn !== null && data.closedOn !== '') {
        const candidateClosed = String(data.closedOn).trim();
        if (!isCalendarDay(candidateClosed) || candidateClosed < existing.openedOn || candidateClosed > today()) {
          return fail('Choose a valid agreement close date between the opened date and today.', 'closedOn');
        }
        closedOn = candidateClosed;
      }

      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.negotiations || []).find((n) => n.id === negotiationId);
          if (!target) return;
          target.status = 'agreed';
          target.closedOn = closedOn;
          target.agreedTerms = agreedTerms;
          target.outcomeNotes = (clean(data.outcomeNotes) || '').slice(0, 4000);
          target.updatedAt = stamp();
          propagations = propagateNegotiationAgreement(draft, target, {
            now: clock(),
            idFactory: id,
            logEvent,
          });
        },
        {
          type: 'negotiation.agreed',
          entity: 'negotiation',
          entityId: negotiationId,
          summary: `Agreement recorded for “${existing.title.slice(0, 60)}” (${agreedTerms.length} term${agreedTerms.length === 1 ? '' : 's'})`,
        },
      );
      return { ok: true, id: negotiationId, propagations };
    },

    /**
     * Recover a returned agreed commitment directly from a negotiation record
     * (RULE-NEG-05). Routes through `redelegateReturnedOutcome` so lineage,
     * validation, 1:1 handover coaching, and audit events are identical.
     */
    recoverNegotiationTerm(negotiationId, termId, data = {}) {
      const negotiation = (store.state.negotiations || []).find((n) => n.id === negotiationId);
      if (!negotiation) return fail('That negotiation no longer exists.');
      const term = (negotiation.agreedTerms || []).find((t) => t.id === termId);
      if (!term) return fail('That agreed term no longer exists on this negotiation.');
      const returnedDel = (store.state.delegations || []).find(
        (d) =>
          d.sourceNegotiationId === negotiationId &&
          d.sourceTermId === termId &&
          d.status === 'returned' &&
          !d.supersededByDelegationId,
      );
      if (!returnedDel) {
        return fail('This term does not have an unrecovered returned delegation.');
      }
      return api.redelegateReturnedOutcome(returnedDel.id, {
        personId: data.personId ?? data.ownerId,
        authority: data.authority,
        dueOn: data.dueOn ?? term.dueOn,
        delegatedOn: data.delegatedOn,
        recoveryNote: data.recoveryNote,
        support: data.support,
        expectedOutcome: data.expectedOutcome ?? term.text,
        title: data.title,
      });
    },

    /**
     * Record ex-post financial and term-level settlement actuals for an agreed
     * negotiation (RULE-NEG-06; Williamson 1985 / Perold 1988).
     * Never pre-fills or fabricates realised values from stakesValue or agreedValue.
     */
    recordNegotiationSettlement(negotiationId, data = {}) {
      const existing = (store.state.negotiations || []).find((n) => n.id === negotiationId);
      if (!existing) return fail('That negotiation no longer exists.');
      if (existing.status !== 'agreed') {
        return fail('Record an agreement before settling its realised actuals.');
      }
      const settledOn = data.settledOn || today();
      if (!isCalendarDay(settledOn) || settledOn > today()) {
        return fail('Choose a valid settlement date that is not in the future.', 'settledOn');
      }
      const anchorDay = existing.closedOn || existing.openedOn;
      if (anchorDay && settledOn < anchorDay) {
        return fail('The settlement date cannot predate the agreement date.', 'settledOn');
      }

      let realisedValue = null;
      if (data.realisedValue !== undefined && data.realisedValue !== null && data.realisedValue !== '') {
        const n = Number(data.realisedValue);
        if (!Number.isFinite(n) || n < 0) {
          return fail('Realised deal value must be zero or a positive number.', 'realisedValue');
        }
        realisedValue = Math.round(n * 100) / 100;
      }

      let counterpartyDelivered = null;
      if (data.counterpartyDelivered === true || data.counterpartyDelivered === 'true' || data.counterpartyDelivered === 'yes') {
        counterpartyDelivered = true;
      } else if (data.counterpartyDelivered === false || data.counterpartyDelivered === 'false' || data.counterpartyDelivered === 'no') {
        counterpartyDelivered = false;
      }

      const note = (clean(data.note) || '').slice(0, 2000);

      // Parse optional per-term quantitative settlements
      const termSettlements = new Map();
      if (data.termSettlements && typeof data.termSettlements === 'object') {
        const entries = Array.isArray(data.termSettlements)
          ? data.termSettlements.map((item) => [item?.id || item?.termId, item?.settledValue])
          : Object.entries(data.termSettlements);
        for (const [tId, rawVal] of entries) {
          if (!tId) continue;
          if (rawVal === null || rawVal === undefined || rawVal === '') {
            termSettlements.set(String(tId), null);
            continue;
          }
          const num = Number(rawVal);
          if (!Number.isFinite(num)) {
            return fail('Term settled values must be valid numbers.', 'termSettlements');
          }
          termSettlements.set(String(tId), Math.round(num * 100) / 100);
        }
      }

      const hasTermValue = [...termSettlements.values()].some((v) => v !== null);
      if (realisedValue === null && counterpartyDelivered === null && !note && !hasTermValue) {
        return fail('Record at least one settled actual: the realised deal value, whether the counterparty delivered, a term settled value, or a settlement note.', 'realisedValue');
      }

      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.negotiations || []).find((n) => n.id === negotiationId);
          if (!target) return;
          if (realisedValue !== null || counterpartyDelivered !== null || note) {
            target.settlement = {
              settledOn,
              realisedValue,
              counterpartyDelivered,
              note,
            };
          } else if (target.settlement) {
            target.settlement.settledOn = settledOn;
          } else {
            target.settlement = {
              settledOn,
              realisedValue: null,
              counterpartyDelivered: null,
              note: '',
            };
          }
          if (termSettlements.size > 0 && Array.isArray(target.agreedTerms)) {
            for (const term of target.agreedTerms) {
              if (termSettlements.has(term.id)) {
                term.settledValue = termSettlements.get(term.id);
              }
            }
          }
          target.updatedAt = stamp();
          const ruleContext = { now: clock(), idFactory: id, logEvent };
          propagations = [
            ...propagateNegotiationSettlement(draft, target, ruleContext),
            ...propagateNegotiationSettlementCalibration(draft, target, { logEvent }),
            // RULE-FIN-02 (reverse): budget lines funding this deal are due
            // their own recorded actuals once the agreement settles.
            ...propagateSourceCompletionToBudgets(draft, 'negotiation', negotiationId, { now: clock(), logEvent }),
          ];
        },
        {
          type: 'negotiation.settled',
          entity: 'negotiation',
          entityId: negotiationId,
          summary: `Settled actuals recorded for negotiation “${existing.title.slice(0, 60)}”`,
        },
      );
      return {
        ok: true,
        id: negotiationId,
        negotiation: (store.state.negotiations || []).find((n) => n.id === negotiationId) || null,
        propagations,
      };
    },

    reopenNegotiation(negotiationId) {
      const existing = (store.state.negotiations || []).find((n) => n.id === negotiationId);
      if (!existing) return fail('That negotiation no longer exists.');
      if (OPEN_NEGOTIATION_STATUSES.includes(existing.status)) {
        return fail('This negotiation is already open.');
      }
      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.negotiations || []).find((n) => n.id === negotiationId);
          if (!target) return;
          target.status = 'active';
          target.closedOn = null;
          // Reopening a negotiation voids its post-agreement settlement actuals
          // so live state stays identical to reloaded schema state.
          target.settlement = null;
          if (Array.isArray(target.agreedTerms)) {
            for (const term of target.agreedTerms) {
              term.settledValue = null;
            }
          }
          target.updatedAt = stamp();
          // Re-establish prep/mandate machinery (idempotent) after reopening.
          propagations = propagateNegotiationEvent(draft, target, {
            now: clock(),
            idFactory: id,
            logEvent,
          });
        },
        {
          type: 'negotiation.reopened',
          entity: 'negotiation',
          entityId: negotiationId,
          summary: `Negotiation “${existing.title.slice(0, 60)}” reopened`,
        },
      );
      return { ok: true, propagations };
    },

    deleteNegotiation(negotiationId) {
      const current = (store.state.negotiations || []).find((n) => n.id === negotiationId);
      if (!current) return fail('That negotiation no longer exists.');
      store.update(
        (draft) => {
          draft.negotiations = (draft.negotiations || []).filter((n) => n.id !== negotiationId);
          draft.links = (draft.links || []).filter(
            (l) => !((l.sourceType === 'negotiation' && l.sourceId === negotiationId) ||
              (l.targetType === 'negotiation' && l.targetId === negotiationId)),
          );
        },
        {
          type: 'negotiation.deleted',
          entity: 'negotiation',
          entityId: negotiationId,
          summary: `Deleted negotiation: ${current.title.slice(0, 70)}`,
        },
      );
      return { ok: true };
    },


    /* ------------------------------------ budget & financial commitments (v24) */

    addBudget(data = {}) {
      const built = assembleBudget(data, null);
      if (!built.ok) return built;
      const record = built.record;
      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          draft.budgets = Array.isArray(draft.budgets) ? draft.budgets : [];
          draft.budgets.push(record);
          propagations = propagateBudgetEvent(draft, record, { now: clock(), idFactory: id, logEvent });
        },
        {
          type: 'budget.created',
          entity: 'budget',
          entityId: record.id,
          summary: `Budget envelope created: ${record.name.slice(0, 70)} (${record.currency})`,
        },
      );
      return { ok: true, id: record.id, propagations };
    },

    updateBudget(budgetId, patch = {}) {
      const existing = (store.state.budgets || []).find((b) => b.id === budgetId);
      if (!existing) return fail('That budget no longer exists.');
      const merged = { ...existing, ...patch, id: existing.id };
      const built = assembleBudget(merged, existing);
      if (!built.ok) return built;
      const record = built.record;
      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const index = (draft.budgets || []).findIndex((b) => b.id === budgetId);
          if (index < 0) return;
          draft.budgets[index] = record;
          propagations = propagateBudgetEvent(draft, record, { now: clock(), idFactory: id, logEvent });
        },
        {
          type: 'budget.updated',
          entity: 'budget',
          entityId: record.id,
          summary: `Budget envelope updated: ${record.name.slice(0, 70)}`,
        },
      );
      return { ok: true, id: record.id, propagations };
    },

    setBudgetStatus(budgetId, status) {
      const existing = (store.state.budgets || []).find((b) => b.id === budgetId);
      if (!existing) return fail('That budget no longer exists.');
      if (!BUDGET_STATUSES.includes(status)) return fail('Choose a valid budget status.', 'status');
      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.budgets || []).find((b) => b.id === budgetId);
          if (!target) return;
          target.status = status;
          target.updatedAt = stamp();
          if (status === 'active') {
            propagations = propagateBudgetEvent(draft, target, { now: clock(), idFactory: id, logEvent });
          }
        },
        {
          type: 'budget.statusChanged',
          entity: 'budget',
          entityId: budgetId,
          summary: `Budget “${existing.name.slice(0, 60)}” moved to ${status}`,
        },
      );
      return { ok: true, propagations };
    },

    deleteBudget(budgetId) {
      const current = (store.state.budgets || []).find((b) => b.id === budgetId);
      if (!current) return fail('That budget no longer exists.');
      store.update(
        (draft) => {
          draft.budgets = (draft.budgets || []).filter((b) => b.id !== budgetId);
          draft.links = (draft.links || []).filter(
            (l) => !((l.sourceType === 'budget' && l.sourceId === budgetId) || (l.targetType === 'budget' && l.targetId === budgetId)),
          );
        },
        {
          type: 'budget.deleted',
          entity: 'budget',
          entityId: budgetId,
          summary: `Deleted budget envelope: ${current.name.slice(0, 70)}`,
        },
      );
      return { ok: true };
    },

    addBudgetLine(budgetId, data = {}) {
      const existing = (store.state.budgets || []).find((b) => b.id === budgetId);
      if (!existing) return fail('That budget no longer exists.');
      const built = assembleBudgetLine(data, null);
      if (!built.ok) return built;
      const line = built.line;
      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.budgets || []).find((b) => b.id === budgetId);
          if (!target) return;
          target.lines = Array.isArray(target.lines) ? target.lines : [];
          target.lines.push(line);
          target.updatedAt = stamp();
          propagations = propagateBudgetEvent(draft, target, { now: clock(), idFactory: id, logEvent });
          if (line.status === 'spent') {
            propagations.push(...propagateBudgetActual(draft, target, line, { logEvent }));
          }
        },
        {
          type: 'budget.lineAdded',
          entity: 'budget',
          entityId: budgetId,
          summary: `Budget line “${line.title.slice(0, 55)}” (${line.status}) added to “${existing.name.slice(0, 45)}”`,
        },
      );
      return { ok: true, id: budgetId, lineId: line.id, propagations };
    },

    updateBudgetLine(budgetId, lineId, patch = {}) {
      const existing = (store.state.budgets || []).find((b) => b.id === budgetId);
      if (!existing) return fail('That budget no longer exists.');
      const existingLine = (existing.lines || []).find((l) => l.id === lineId);
      if (!existingLine) return fail('That budget line no longer exists.');
      const built = assembleBudgetLine({ ...existingLine, ...patch, id: existingLine.id }, existingLine);
      if (!built.ok) return built;
      const line = built.line;
      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.budgets || []).find((b) => b.id === budgetId);
          if (!target) return;
          const index = (target.lines || []).findIndex((l) => l.id === lineId);
          if (index < 0) return;
          target.lines[index] = line;
          target.updatedAt = stamp();
          propagations = propagateBudgetEvent(draft, target, { now: clock(), idFactory: id, logEvent });
          if (line.status === 'spent') {
            propagations.push(...propagateBudgetActual(draft, target, line, { logEvent }));
          }
        },
        {
          type: 'budget.lineUpdated',
          entity: 'budget',
          entityId: budgetId,
          summary: `Budget line “${line.title.slice(0, 55)}” updated in “${existing.name.slice(0, 45)}”`,
        },
      );
      return { ok: true, id: budgetId, lineId: line.id, propagations };
    },

    /**
     * Record what a commitment actually cost (RULE-FIN-02/03). The actual is
     * always supplied by the leader from evidence; it is never defaulted to
     * the committed amount, because a copied figure would silently score a
     * perfect 1.0x in the calibration ledger.
     */
    recordBudgetActual(budgetId, lineId, data = {}) {
      const existing = (store.state.budgets || []).find((b) => b.id === budgetId);
      if (!existing) return fail('That budget no longer exists.');
      const existingLine = (existing.lines || []).find((l) => l.id === lineId);
      if (!existingLine) return fail('That budget line no longer exists.');
      if (existingLine.status === 'released') {
        return fail('This commitment was released; its budget authority was returned. Add a new line for new spend.', 'actualAmount');
      }
      if (data.actualAmount === undefined || data.actualAmount === null || data.actualAmount === '') {
        return fail('Record the actual amount from evidence (invoice, receipt, finance report). It is never copied from the committed figure.', 'actualAmount');
      }
      const actualAmount = Number(data.actualAmount);
      if (!Number.isFinite(actualAmount) || actualAmount < 0) {
        return fail('The actual amount must be zero or a positive number.', 'actualAmount');
      }
      const spentOn = data.spentOn || today();
      if (!isCalendarDay(spentOn) || spentOn > today()) {
        return fail('Choose a valid spend date that is not in the future.', 'spentOn');
      }
      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.budgets || []).find((b) => b.id === budgetId);
          if (!target) return;
          const line = (target.lines || []).find((l) => l.id === lineId);
          if (!line) return;
          line.status = 'spent';
          line.actualAmount = Math.round(actualAmount * 100) / 100;
          line.spentOn = spentOn;
          line.actualsDueOn = null;
          if (clean(data.note)) line.note = clean(data.note).slice(0, 1000);
          target.updatedAt = stamp();
          propagations = [
            ...propagateBudgetEvent(draft, target, { now: clock(), idFactory: id, logEvent }),
            ...propagateBudgetActual(draft, target, line, { logEvent }),
          ];
        },
        {
          type: 'budget.actualRecorded',
          entity: 'budget',
          entityId: budgetId,
          summary: `Actual spend recorded for “${existingLine.title.slice(0, 55)}” in “${existing.name.slice(0, 45)}”`,
        },
      );
      return { ok: true, id: budgetId, lineId, propagations };
    },

    /** Return an encumbrance's budget authority unused (deferral/cancellation). */
    releaseBudgetLine(budgetId, lineId, data = {}) {
      const existing = (store.state.budgets || []).find((b) => b.id === budgetId);
      if (!existing) return fail('That budget no longer exists.');
      const existingLine = (existing.lines || []).find((l) => l.id === lineId);
      if (!existingLine) return fail('That budget line no longer exists.');
      if (existingLine.status === 'spent') {
        return fail('Recorded spend cannot be released; the money has landed. Correct the actual instead if it is wrong.');
      }
      if (existingLine.status === 'released') return fail('This commitment has already been released.');
      const releasedOn = data.releasedOn || today();
      if (!isCalendarDay(releasedOn) || releasedOn > today()) {
        return fail('Choose a valid release date that is not in the future.', 'releasedOn');
      }
      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.budgets || []).find((b) => b.id === budgetId);
          if (!target) return;
          const line = (target.lines || []).find((l) => l.id === lineId);
          if (!line) return;
          line.status = 'released';
          line.releasedOn = releasedOn;
          line.releasedReason = (clean(data.reason) || '').slice(0, 600);
          line.actualsDueOn = null;
          target.updatedAt = stamp();
          propagations = propagateBudgetEvent(draft, target, { now: clock(), idFactory: id, logEvent });
        },
        {
          type: 'budget.lineReleased',
          entity: 'budget',
          entityId: budgetId,
          summary: `Released commitment “${existingLine.title.slice(0, 55)}” in “${existing.name.slice(0, 45)}” — budget authority returned`,
        },
      );
      return { ok: true, id: budgetId, lineId, propagations };
    },

    deleteBudgetLine(budgetId, lineId) {
      const existing = (store.state.budgets || []).find((b) => b.id === budgetId);
      if (!existing) return fail('That budget no longer exists.');
      const existingLine = (existing.lines || []).find((l) => l.id === lineId);
      if (!existingLine) return fail('That budget line no longer exists.');
      store.update(
        (draft) => {
          const target = (draft.budgets || []).find((b) => b.id === budgetId);
          if (!target) return;
          target.lines = (target.lines || []).filter((l) => l.id !== lineId);
          target.updatedAt = stamp();
        },
        {
          type: 'budget.lineDeleted',
          entity: 'budget',
          entityId: budgetId,
          summary: `Deleted budget line “${existingLine.title.slice(0, 55)}” from “${existing.name.slice(0, 45)}”`,
        },
      );
      return { ok: true };
    },

    /* -------------------------------------- capacity, flow & portfolio (v16) */
    addPortfolioItem(data = {}) {
      const title = clean(data.title) || '';
      if (!title) return fail('Name the work you want to fund or park.', 'title');
      const kind = data.kind || 'project';
      if (!PORTFOLIO_KINDS.includes(kind)) return fail('Choose a valid work type.', 'kind');
      if (kind === 'capacity-reserve') {
        return fail('Capacity reserves are created from operational cases automatically. Register a case instead.', 'kind');
      }

      const triple = (source, field) => {
        // A single-point estimate (only "most likely" filled in) is a legitimate
        // answer: it states a fixed cost rather than inventing a range. Expanding
        // it to optimistic = most likely = pessimistic keeps the ordering rule
        // without silently widening the estimate.
        const onlyMl = source
          && !source.optimistic && !source.pessimistic && Number(source.mostLikely) > 0;
        const input = onlyMl
          ? { ...source, optimistic: source.mostLikely, pessimistic: source.mostLikely }
          : source;
        const parsed = ['optimistic', 'mostLikely', 'pessimistic'].map((key) => {
          const raw = input?.[key];
          if (raw === undefined || raw === null || raw === '') return { ok: true, value: 0 };
          const n = Number(raw);
          if (!Number.isFinite(n) || n < 0) return fail('Estimates must be zero or positive numbers.', field);
          return { ok: true, value: Math.round(n * 100) / 100 };
        });
        const bad = parsed.find((p) => !p.ok);
        if (bad) return bad;
        const [o, m, p] = parsed.map((x) => x.value);
        if (o > m || m > p) {
          return fail('Keep three-point estimates ordered: optimistic ≤ most likely ≤ pessimistic.', field);
        }
        return { ok: true, value: { optimistic: o, mostLikely: m, pessimistic: p } };
      };
      const effort = triple(data.effortDays, 'effortDays');
      if (!effort.ok) return effort;
      const value = triple(data.value, 'value');
      if (!value.ok) return value;
      if (!effort.value.mostLikely && !effort.value.optimistic && !effort.value.pessimistic) {
        return fail('Estimate the effort in person-days: without it the plan cannot see the work.', 'effortDays');
      }

      const sourceType = PORTFOLIO_SOURCE_TYPES.includes(data.sourceType) ? data.sourceType : 'manual';
      let sourceId = clean(data.sourceId) || null;
      if (sourceType !== 'manual') {
        const collections = { goal: 'goals', case: 'cases', delegation: 'delegations' };
        const sourceRecord = (store.state[collections[sourceType]] || []).find((r) => r.id === sourceId);
        if (!sourceRecord) return fail('Choose an existing record to link, or leave the source blank.', 'sourceId');
        if (sourceType === 'delegation' && sourceRecord.status !== 'active') {
          return fail('Link planned work to an active delegation; completed or returned outcomes cannot create open plan demand.', 'sourceId');
        }
      } else {
        sourceId = null;
      }

      const ownerId = clean(data.ownerId) || null;
      if (ownerId) {
        const owner = store.state.people.find((p) => p.id === ownerId);
        if (!owner) return fail('Choose an existing team member as owner, or leave unassigned.', 'ownerId');
        if (owner.status === 'archived') return fail('Restore this person before assigning new work to them.', 'ownerId');
      }

      const createdOn = data.createdOn || today();
      if (!isCalendarDay(createdOn)) return fail('Choose a valid start date.', 'createdOn');
      if (createdOn > today()) return fail('Work cannot start in the future.', 'createdOn');
      const targetOn = data.targetOn ? String(data.targetOn).trim() : null;
      if (targetOn && !isCalendarDay(targetOn)) return fail('Choose a valid target date, or leave it blank.', 'targetOn');
      if (targetOn && targetOn < createdOn) return fail('The target date cannot be before the start date.', 'targetOn');

      const decision = PORTFOLIO_DECISIONS.includes(data.decision) ? data.decision : 'undecided';
      if (decision === 'capacity-reserve') return fail('Choose funded, deferred, cut, or undecided.', 'decision');
      const rationale = (clean(data.rationale) || '').slice(0, 1000);
      if (['deferred', 'cut'].includes(decision) && rationale.length < 8) {
        return fail('Record why this work is not being funded — that reason is the decision.', 'rationale');
      }

      const item = {
        ...append(null, 'pf'),
        title: title.slice(0, 200),
        kind,
        // Schema v33: ambition horizon for the Allocation Governor. Absent or
        // unrecognised stays unclassified — never inferred from the kind.
        horizon: PORTFOLIO_HORIZONS.includes(data.horizon) ? data.horizon : null,
        status: 'open',
        sourceType,
        sourceId,
        ownerId,
        effortDays: effort.value,
        value: value.value,
        currency: (clean(data.currency) || 'USD').toUpperCase().slice(0, 6),
        decision,
        decisionOn: decision === 'undecided' ? null : today(),
        rationale,
        targetOn,
        createdOn,
        completedOn: null,
        releasedOn: null,
        actualEffortDays: null,
        actualValue: null,
        forecastSnapshot: null,
        updatedAt: stamp(),
      };

      let propagations = [];
      let tradeoff = null;
      store.update(
        (draft, { logEvent }) => {
          draft.portfolio = Array.isArray(draft.portfolio) ? draft.portfolio : [];
          draft.portfolio.push(item);
          if (sourceType !== 'manual' && sourceId) {
            ensureEntityLink(
              draft,
              {
                sourceType: 'portfolio',
                sourceId: item.id,
                targetType: sourceType,
                targetId: sourceId,
                relation: 'funds',
                ruleId: 'MANUAL',
                summary: `Operating plan funds this ${sourceType}`,
              },
              { idFactory: id, todayStr: today(), nowIso: stamp() },
            );
          }
          propagations = propagatePortfolioDecision(draft, item, { now: clock(), idFactory: id, logEvent });
          if (item.decision === 'funded') {
            // RULE-FCT-01: work created already-funded freezes its forecast at
            // creation, exactly as a later funding decision would.
            const froze = freezePortfolioForecast(draft, item, { now: clock(), todayStr: today(), logEvent });
            if (froze) propagations.push(froze);
            tradeoff = evaluateCapacityTradeoff(draft, {
              now: clock(),
              idFactory: id,
              todayStr: today(),
              nowIso: stamp(),
              logEvent,
              triggerLabel: 'portfolio',
            });
            if (tradeoff) propagations.push(tradeoff);
            const tailEntries = evaluateMonteCarloTailRisk(draft, {
              now: clock(),
              idFactory: id,
              todayStr: today(),
              nowIso: stamp(),
              logEvent,
              triggerLabel: 'portfolio',
            });
            propagations.push(...tailEntries);
          }
        },
        {
          type: 'portfolio.created',
          entity: 'portfolio',
          entityId: item.id,
          summary: `Added ${kind} to the operating plan: ${item.title.slice(0, 60)} (${effort.value.mostLikely}d, ${decision})`,
        },
      );
      return { ok: true, id: item.id, propagations };
    },

    updatePortfolioItem(itemId, patch = {}) {
      const current = (store.state.portfolio || []).find((p) => p.id === itemId);
      if (!current) return fail('That plan item no longer exists.');
      if (current.kind === 'capacity-reserve' && current.sourceType === 'case') {
        return fail('This reserve is maintained automatically from its operational case. Edit the case’s capacity estimate instead.', 'effortDays');
      }

      const title = patch.title !== undefined ? clean(patch.title) || '' : current.title;
      if (!title) return fail('Name the work you want to fund or park.', 'title');
      const kind = patch.kind !== undefined ? patch.kind : current.kind;
      if (!PORTFOLIO_KINDS.includes(kind) || kind === 'capacity-reserve') {
        return fail('Choose a valid work type.', 'kind');
      }
      const ownerId = patch.ownerId !== undefined ? (clean(patch.ownerId) || null) : current.ownerId;
      if (ownerId) {
        const owner = store.state.people.find((p) => p.id === ownerId);
        if (!owner || owner.status === 'archived') {
          return fail('Choose an active team member as owner, or leave unassigned.', 'ownerId');
        }
      }
      const targetOn = patch.targetOn !== undefined
        ? (patch.targetOn ? String(patch.targetOn).trim() : null)
        : current.targetOn;
      if (targetOn && !isCalendarDay(targetOn)) return fail('Choose a valid target date, or leave it blank.', 'targetOn');

      const readTriple = (next, prev, field) => {
        const source = next === undefined ? prev : next;
        const vals = ['optimistic', 'mostLikely', 'pessimistic'].map((key) => {
          const raw = source?.[key];
          if (raw === undefined || raw === null || raw === '') return 0;
          const n = Number(raw);
          return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
        });
        if (vals.some((v) => Number.isNaN(v))) return fail('Estimates must be zero or positive numbers.', field);
        const [o, m, p] = vals;
        if (o > m || m > p) return fail('Keep three-point estimates ordered: optimistic ≤ most likely ≤ pessimistic.', field);
        return { ok: true, value: { optimistic: o, mostLikely: m, pessimistic: p } };
      };
      const effort = readTriple(patch.effortDays, current.effortDays, 'effortDays');
      if (!effort.ok) return effort;
      const value = readTriple(patch.value, current.value, 'value');
      if (!value.ok) return value;
      // Schema v33: ambition horizon. '' / null clears back to unclassified.
      let horizon = current.horizon ?? null;
      if (patch.horizon !== undefined) {
        if (patch.horizon === null || patch.horizon === '') horizon = null;
        else if (PORTFOLIO_HORIZONS.includes(patch.horizon)) horizon = patch.horizon;
        else return fail('Choose Core, Adjacent or Exploratory — or leave the work unclassified.', 'horizon');
      }

      let tradeoff = null;
      let tailEntries = [];
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.portfolio || []).find((p) => p.id === itemId);
          if (!target) return;
          target.title = title.slice(0, 200);
          target.kind = kind;
          target.horizon = horizon;
          target.ownerId = ownerId;
          target.effortDays = effort.value;
          target.value = value.value;
          target.currency = patch.currency !== undefined
            ? ((clean(patch.currency) || 'USD').toUpperCase().slice(0, 6))
            : target.currency;
          target.targetOn = targetOn;
          target.updatedAt = stamp();
          if (target.decision === 'funded') {
            tradeoff = evaluateCapacityTradeoff(draft, {
              now: clock(),
              idFactory: id,
              todayStr: today(),
              nowIso: stamp(),
              logEvent,
              triggerLabel: 'portfolio',
            });
            tailEntries = evaluateMonteCarloTailRisk(draft, {
              now: clock(),
              idFactory: id,
              todayStr: today(),
              nowIso: stamp(),
              logEvent,
              triggerLabel: 'portfolio',
            });
          }
        },
        {
          type: 'portfolio.updated',
          entity: 'portfolio',
          entityId: itemId,
          summary: `Updated plan item “${current.title.slice(0, 60)}”`,
        },
      );
      return { ok: true, propagations: [...(tradeoff ? [tradeoff] : []), ...tailEntries] };
    },

    setPortfolioDecision(itemId, data = {}) {
      const current = (store.state.portfolio || []).find((p) => p.id === itemId);
      if (!current) return fail('That plan item no longer exists.');
      if (current.status !== 'open') {
        return fail('This item is already closed, delivered, or released. Reopen it before changing its funding.');
      }
      if (current.kind === 'capacity-reserve' && current.sourceType === 'case') {
        return fail('A capacity reserve is released by resolving its operational case, not by re-funding it.');
      }
      const decision = data.decision;
      if (!['funded', 'deferred', 'cut', 'undecided'].includes(decision)) {
        return fail('Choose fund, defer, cut, or return to undecided.', 'decision');
      }
      const rationale = (clean(data.rationale) || '').slice(0, 1000);
      if (['deferred', 'cut'].includes(decision) && rationale.length < 8) {
        return fail('Record why this work is not being funded — the reason is the decision.', 'rationale');
      }
      if (decision === current.decision && rationale === current.rationale) {
        return { ok: true, propagations: [], unchanged: true };
      }

      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.portfolio || []).find((p) => p.id === itemId);
          if (!target) return;
          target.decision = decision;
          target.decisionOn = decision === 'undecided' ? null : today();
          target.rationale = rationale;
          target.updatedAt = stamp();
          // RULE-FCT-01: funding freezes the forecast to be scored at
          // delivery; un-funding clears it so a later re-funding freezes the
          // new commitment instead of reviving a stale belief.
          if (decision === 'funded') {
            const froze = freezePortfolioForecast(draft, target, { now: clock(), todayStr: today(), logEvent });
            if (froze) propagations.push(froze);
          } else {
            clearPortfolioForecast(target);
          }
          propagations = propagations.concat(propagatePortfolioDecision(draft, target, {
            now: clock(),
            idFactory: id,
            logEvent,
            previousDecision: current.decision,
          }));
          if (decision === 'funded') {
            const tradeoff = evaluateCapacityTradeoff(draft, {
              now: clock(),
              idFactory: id,
              todayStr: today(),
              nowIso: stamp(),
              logEvent,
              triggerLabel: 'portfolio',
            });
            if (tradeoff) propagations.push(tradeoff);
            const tailEntries = evaluateMonteCarloTailRisk(draft, {
              now: clock(),
              idFactory: id,
              todayStr: today(),
              nowIso: stamp(),
              logEvent,
              triggerLabel: 'portfolio',
            });
            propagations.push(...tailEntries);
          }
        },
        {
          type: 'portfolio.decision',
          entity: 'portfolio',
          entityId: itemId,
          summary: `${decision === 'undecided' ? 'Reset' : decision} “${current.title.slice(0, 60)}”${rationale ? `: ${rationale.slice(0, 80)}` : ''}`,
        },
      );
      return { ok: true, propagations };
    },

    completePortfolioItem(itemId, data = {}) {
      const current = (store.state.portfolio || []).find((p) => p.id === itemId);
      if (!current) return fail('That plan item no longer exists.');
      if (current.status !== 'open') return fail('This item is already closed.');
      if (current.decision !== 'funded') return fail('Only funded work can be delivered. Fund it first, or park it.');
      const completedOn = data.completedOn || today();
      if (!isCalendarDay(completedOn) || completedOn > today()) {
        return fail('Choose a valid completion date that is not in the future.', 'completedOn');
      }
      if (completedOn < current.createdOn) {
        return fail('Completion cannot predate the start date.', 'completedOn');
      }
      // Actuals are the evidence the calibration loop scores. Blank stays
      // blank (honestly unknown → FCT-04 will prompt later); a supplied value
      // is validated, never estimated from the PERT triple.
      const actuals = readActuals(data);
      if (!actuals.ok) return actuals;
      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.portfolio || []).find((p) => p.id === itemId);
          if (!target) return;
          target.status = 'done';
          target.completedOn = completedOn;
          if (actuals.actualEffortDays !== null) target.actualEffortDays = actuals.actualEffortDays;
          if (actuals.actualValue !== null) target.actualValue = actuals.actualValue;
          target.updatedAt = stamp();
          // RULE-FCT-02: new calibration evidence may prove systematic
          // optimism — if so, open the governance decision in the same
          // atomic transaction as the delivery itself.
          const governance = evaluateCalibrationGovernance(draft, {
            now: clock(),
            idFactory: id,
            todayStr: today(),
            nowIso: stamp(),
            logEvent,
            triggerLabel: 'portfolio completion',
          });
          if (governance) propagations.push(governance);
          // RULE-FIN-02 (reverse): delivered work's encumbrances become
          // actuals-due in the same transaction as the delivery itself.
          propagations.push(...propagateSourceCompletionToBudgets(draft, 'portfolio', itemId, { now: clock(), logEvent }));
        },
        {
          type: 'portfolio.completed',
          entity: 'portfolio',
          entityId: itemId,
          summary: `Delivered “${current.title.slice(0, 60)}” — capacity returned to the plan${actuals.actualEffortDays !== null ? ` (actual effort ${actuals.actualEffortDays}d recorded)` : ''}`,
        },
      );
      return { ok: true, propagations };
    },

    /**
     * Record (or correct) what delivered work actually cost and produced.
     * Exists so FCT-04's "delivered without actuals" prompt has a one-click
     * remediation and so backfilled history feeds RULE-FCT-02 immediately.
     */
    recordPortfolioActuals(itemId, data = {}) {
      const current = (store.state.portfolio || []).find((p) => p.id === itemId);
      if (!current) return fail('That plan item no longer exists.');
      if (current.status !== 'done') return fail('Actuals can only be recorded once work is delivered.');
      if (current.kind === 'capacity-reserve') {
        return fail('A capacity reserve’s actual is its operational case outcome; record it there.', 'actualEffortDays');
      }
      const actuals = readActuals(data);
      if (!actuals.ok) return actuals;
      if (actuals.actualEffortDays === null && actuals.actualValue === null) {
        return fail('Record the actual effort in person-days (and the value delivered, if known).', 'actualEffortDays');
      }
      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.portfolio || []).find((p) => p.id === itemId);
          if (!target) return;
          if (actuals.actualEffortDays !== null) target.actualEffortDays = actuals.actualEffortDays;
          if (actuals.actualValue !== null) target.actualValue = actuals.actualValue;
          target.updatedAt = stamp();
          const governance = evaluateCalibrationGovernance(draft, {
            now: clock(),
            idFactory: id,
            todayStr: today(),
            nowIso: stamp(),
            logEvent,
            triggerLabel: 'recorded actuals',
          });
          if (governance) propagations.push(governance);
        },
        {
          type: 'portfolio.actuals',
          entity: 'portfolio',
          entityId: itemId,
          summary: `Recorded actuals for “${current.title.slice(0, 60)}”${actuals.actualEffortDays !== null ? ` — ${actuals.actualEffortDays}d actual effort` : ''}`,
        },
      );
      return { ok: true, propagations };
    },

    releasePortfolioItem(itemId, data = {}) {
      const current = (store.state.portfolio || []).find((p) => p.id === itemId);
      if (!current) return fail('That plan item no longer exists.');
      if (current.status !== 'open') return fail('This item is already closed.');
      if (current.kind === 'capacity-reserve' && current.sourceType === 'case') {
        return fail('Resolve the operational case to release its capacity reserve.');
      }
      const releasedOn = data.releasedOn || today();
      if (!isCalendarDay(releasedOn) || releasedOn > today()) {
        return fail('Choose a valid release date that is not in the future.', 'releasedOn');
      }
      const reason = (clean(data.reason) || '').slice(0, 500);
      if (!reason) return fail('Record why the work stopped — a silent stop is how the same work gets re-promised.', 'reason');
      store.update(
        (draft) => {
          const target = (draft.portfolio || []).find((p) => p.id === itemId);
          if (!target) return;
          target.status = 'released';
          target.releasedOn = releasedOn;
          target.rationale = [target.rationale, `Released ${releasedOn}: ${reason}`].filter(Boolean).join(' · ').slice(0, 1000);
          target.updatedAt = stamp();
        },
        {
          type: 'portfolio.released',
          entity: 'portfolio',
          entityId: itemId,
          summary: `Released “${current.title.slice(0, 60)}” from the plan: ${reason.slice(0, 80)}`,
        },
      );
      return { ok: true };
    },

    deletePortfolioItem(itemId) {
      const current = (store.state.portfolio || []).find((p) => p.id === itemId);
      if (!current) return fail('That plan item no longer exists.');
      if (current.kind === 'capacity-reserve' && current.sourceType === 'case') {
        return fail('This reserve belongs to an operational case. Delete or resolve the case instead.');
      }
      store.update(
        (draft) => {
          draft.portfolio = (draft.portfolio || []).filter((p) => p.id !== itemId);
          draft.links = (draft.links || []).filter(
            (l) => l && !(l.sourceType === 'portfolio' && l.sourceId === itemId) && !(l.targetType === 'portfolio' && l.targetId === itemId),
          );
        },
        {
          type: 'portfolio.deleted',
          entity: 'portfolio',
          entityId: itemId,
          summary: `Deleted plan item “${current.title.slice(0, 60)}”`,
        },
      );
      return { ok: true };
    },

    /**
     * Schema v33 (Allocation Governor): classify one portfolio item into an
     * ambition horizon (or clear it back to unclassified). Classification is
     * the leader's judgement; the engine never infers it. Emits
     * `portfolio.updated` so RULE-ALLOC-01..04 re-evaluate in the same
     * transaction through the post-commit spine.
     */
    classifyPortfolioHorizon(itemId, horizon) {
      const current = (store.state.portfolio || []).find((p) => p.id === itemId);
      if (!current) return fail('That plan item no longer exists.');
      let next = null;
      if (horizon === null || horizon === '' || horizon === undefined) next = null;
      else if (PORTFOLIO_HORIZONS.includes(horizon)) next = horizon;
      else return fail('Choose Core, Adjacent or Exploratory — or leave the work unclassified.', 'horizon');
      if ((current.horizon ?? null) === next) return { ok: true, unchanged: true, propagations: [] };
      store.update(
        (draft) => {
          const target = (draft.portfolio || []).find((p) => p.id === itemId);
          if (!target) return;
          target.horizon = next;
          target.updatedAt = stamp();
        },
        {
          type: 'portfolio.updated',
          entity: 'portfolio',
          entityId: itemId,
          summary: next
            ? `Classified “${current.title.slice(0, 60)}” as ${next} (Allocation Governor)`
            : `Cleared the ambition horizon of “${current.title.slice(0, 60)}” back to unclassified`,
        },
      );
      return { ok: true, propagations: store.lastPropagations || [] };
    },

    /**
     * Schema v33: the Allocation Governor's policy — exploration floor,
     * funded-flow look-back window and the propagation pause switch. These
     * are management conventions (validated as such), stored through the one
     * settings path so normalizeSettings stays the single clamping authority.
     */
    setAllocationPolicy({ explorationFloorPct, windowDays, autoPropagate } = {}) {
      const patch = {};
      if (explorationFloorPct !== undefined) {
        const value = Number(explorationFloorPct);
        if (!Number.isInteger(value) || value < 0 || value > 50) {
          return fail('The exploration floor is a whole percentage from 0 (off) to 50. Nagji & Tuff\'s transformational share is about 10%.', 'explorationFloorPct');
        }
        patch.allocationExplorationFloorPct = value;
      }
      if (windowDays !== undefined) {
        const value = Number(windowDays);
        if (!Number.isInteger(value) || value < 30 || value > 730) {
          return fail('The funded-flow window must be 30 to 730 days — long enough to show a funding pattern, short enough to describe current behaviour.', 'windowDays');
        }
        patch.allocationWindowDays = value;
      }
      if (autoPropagate !== undefined) patch.allocationAutoPropagate = Boolean(autoPropagate);
      if (!Object.keys(patch).length) return fail('Nothing to change in the allocation policy.');
      return api.updateSettings(patch);
    },

    /**
     * Schema v33: explicitly re-run the Allocation Governor over the whole
     * portfolio. Emits `allocation.scan`; the post-commit rule is idempotent,
     * so repeated scans converge (existing decision/delegation/talking points
     * are recognised by their markers, never duplicated).
     */
    scanAllocation() {
      store.update(
        () => {},
        {
          type: 'allocation.scan',
          entity: 'portfolio',
          entityId: '',
          summary: 'Allocation Governor scan requested from the terminal',
        },
      );
      return { ok: true, propagations: store.lastPropagations || [] };
    },

    /* ------------------------------------------------------------------ *
     * Schema v37 — Operating System Dynamics Lab.
     *
     * An experiment is a named, falsifiable policy over the same derived
     * model every other screen reads. Only the *inputs* are stored; the
     * trajectory is recomputed on every read so a simulation can never drift
     * away from the records it claims to describe. Adoption freezes the
     * prediction, which is what makes a later review a comparison rather than
     * a rewrite.
     * ------------------------------------------------------------------ */

    /** The derived structural report. Read-only: no event, no write. */
    dynamicsReport() {
      return buildDynamicsReport(store.state, clock());
    },

    dynamicPreview(levers = {}, { weeks } = {}) {
      const report = buildDynamicsReport(store.state, clock());
      if (!report.adequate) return { ok: false, error: report.reason };
      const horizon = Number.isFinite(Number(weeks))
        ? Math.min(DYN_MAX_HORIZON_WEEKS, Math.max(DYN_MIN_HORIZON_WEEKS, Math.round(Number(weeks))))
        : report.horizonWeeks;
      return { ok: true, evaluation: evaluatePolicy(report.model, levers, { weeks: horizon }) };
    },

    saveDynamicsExperiment(data = {}) {
      const parsed = normalizeDynamicsExperimentPayload(data);
      if (!parsed.ok) return fail(parsed.error, parsed.field);
      const existingId = data.id ? String(data.id) : null;
      const existing = existingId
        ? (store.state.dynamicsExperiments || []).find((row) => row && row.id === existingId)
        : null;
      if (existingId && !existing) return fail('That experiment no longer exists.');
      if (existing && existing.status === 'adopted') {
        return fail('An adopted experiment is a live commitment. Retire it before changing its levers, so the frozen prediction keeps its meaning.');
      }
      if (parsed.value.ownerId && !(store.state.people || []).some((p) => p.id === parsed.value.ownerId && p.status !== 'archived')) {
        return fail('Choose an active team member as the experiment owner.', 'ownerId');
      }
      if (parsed.value.checkpointOn && parsed.value.checkpointOn < today()) {
        return fail('A checkpoint must be dated today or later — a checkpoint in the past cannot be reviewed prospectively.', 'checkpointOn');
      }
      const record = {
        ...(existing || append(null, 'dyn')),
        ...parsed.value,
        status: existing ? existing.status : 'draft',
        adoptedOn: existing ? existing.adoptedOn : null,
        predicted: existing ? existing.predicted : null,
        createdOn: existing ? existing.createdOn : today(),
        updatedAt: stamp(),
      };
      store.update(
        (draft) => {
          draft.dynamicsExperiments = Array.isArray(draft.dynamicsExperiments) ? draft.dynamicsExperiments : [];
          const index = draft.dynamicsExperiments.findIndex((row) => row && row.id === record.id);
          if (index === -1) draft.dynamicsExperiments.push(record);
          else draft.dynamicsExperiments[index] = record;
        },
        {
          type: existing ? 'dynamics.experiment.updated' : 'dynamics.experiment.created',
          entity: 'dynamics',
          entityId: record.id,
          summary: `${existing ? 'Updated' : 'Created'} structural experiment “${record.name}”`,
        },
      );
      return { ok: true, id: record.id, propagations: store.lastPropagations || [] };
    },

    /**
     * Adopt an experiment: freeze the prediction the leader is committing to,
     * then hand it to the post-commit rule, which opens exactly one owned
     * checkpoint delegation carrying those frozen numbers.
     */
    adoptDynamicsExperiment(experimentId, { checkpointOn = null } = {}) {
      const current = (store.state.dynamicsExperiments || []).find((row) => row && row.id === experimentId);
      if (!current) return fail('That experiment no longer exists.');
      if (current.status === 'adopted') return fail('That experiment is already adopted.');
      if (checkpointOn && !isCalendarDay(checkpointOn)) return fail('Choose a valid checkpoint date.', 'checkpointOn');
      if (checkpointOn && checkpointOn < today()) return fail('The checkpoint must be today or later.', 'checkpointOn');
      if (!current.ownerId) return fail('Name an owner before adopting — an experiment nobody owns is a wish.', 'ownerId');
      const report = buildDynamicsReport(store.state, clock());
      if (!report.adequate) return fail(report.reason);
      const evaluation = evaluatePolicy(report.model, current.levers, { weeks: current.horizonWeeks });
      const frozen = {
        endSaturationPct: evaluation.scenario.summary.endSaturationPct,
        endWipDays: evaluation.scenario.summary.endWipDays,
        endCapacityPerWeek: evaluation.scenario.summary.endCapacityPerWeek,
        endDependencyPct: evaluation.scenario.summary.endDependencyPct,
        horizonWeeks: evaluation.scenario.horizonWeeks,
        frozenAt: stamp(),
        engineVersion: report.engineVersion,
      };
      const due = checkpointOn || dayKey(addDays(today(), Math.min(28, current.horizonWeeks * 7)));
      store.update(
        (draft) => {
          const target = (draft.dynamicsExperiments || []).find((row) => row && row.id === experimentId);
          if (!target) return;
          target.status = 'adopted';
          target.adoptedOn = today();
          target.checkpointOn = due;
          target.predicted = frozen;
          target.updatedAt = stamp();
        },
        {
          type: 'dynamics.experiment.adopted',
          entity: 'dynamics',
          entityId: experimentId,
          summary: `Adopted structural experiment “${current.name}” with a frozen prediction`,
        },
      );
      return { ok: true, id: experimentId, predicted: frozen, propagations: store.lastPropagations || [] };
    },

    retireDynamicsExperiment(experimentId, { note = '' } = {}) {
      const current = (store.state.dynamicsExperiments || []).find((row) => row && row.id === experimentId);
      if (!current) return fail('That experiment no longer exists.');
      if (current.status === 'retired') return fail('That experiment is already retired.');
      const reason = clean(note) || '';
      if (reason.length < 5) return fail('Record why the experiment is being retired (at least 5 characters) so the history stays honest.', 'note');
      store.update(
        (draft) => {
          const target = (draft.dynamicsExperiments || []).find((row) => row && row.id === experimentId);
          if (!target) return;
          target.status = 'retired';
          target.notes = `${target.notes ? `${target.notes} ` : ''}Retired ${today()}: ${reason}`.slice(0, 1200);
          target.updatedAt = stamp();
        },
        {
          type: 'dynamics.experiment.retired',
          entity: 'dynamics',
          entityId: experimentId,
          summary: `Retired structural experiment “${current.name}”`,
        },
      );
      return { ok: true, propagations: store.lastPropagations || [] };
    },

    deleteDynamicsExperiment(experimentId) {
      const current = (store.state.dynamicsExperiments || []).find((row) => row && row.id === experimentId);
      if (!current) return fail('That experiment no longer exists.');
      if (current.status !== 'draft') {
        return fail(current.status === 'retired'
          ? 'A retired experiment is part of the record. Its history is what makes the next experiment honest.'
          : 'An adopted experiment is on the record. Retire it instead of deleting it.');
      }
      store.update(
        (draft) => {
          draft.dynamicsExperiments = (draft.dynamicsExperiments || []).filter((row) => row && row.id !== experimentId);
          draft.links = (draft.links || []).filter((link) => !(
            (link.sourceType === 'dynamics' && link.sourceId === experimentId)
            || (link.targetType === 'dynamics' && link.targetId === experimentId)
          ));
        },
        {
          type: 'dynamics.experiment.deleted',
          entity: 'dynamics',
          entityId: experimentId,
          summary: `Deleted draft structural experiment “${current.name}”`,
        },
      );
      return { ok: true, propagations: store.lastPropagations || [] };
    },

    /**
     * Explicitly re-run the structural report. The rule is idempotent, so
     * repeated scans converge instead of accumulating decisions, prompts and
     * checkpoints.
     */
    scanDynamics() {
      store.update(
        () => {},
        {
          type: 'dynamics.scan',
          entity: 'workspace',
          entityId: '',
          summary: 'Operating System Dynamics scan requested from the terminal',
        },
      );
      const report = buildDynamicsReport(store.state, clock());
      return {
        ok: true,
        riskPct: report.structuralRiskPct ?? null,
        adequate: report.adequate,
        reason: report.reason || null,
        propagations: store.lastPropagations || [],
      };
    },

    /** Model conventions the leader owns, in plain language. */
    setDynamicsPolicy({
      horizonWeeks, targetWipWeeks, pressureLagWeeks, qualityFixWeeks, rampWeeks, structuralRiskPct, autoPropagate,
    } = {}) {
      const patch = {};
      const intIn = (value, lo, hi) => Number.isInteger(Number(value)) && Number(value) >= lo && Number(value) <= hi;
      if (horizonWeeks !== undefined) {
        if (!intIn(horizonWeeks, DYN_MIN_HORIZON_WEEKS, DYN_MAX_HORIZON_WEEKS)) {
          return fail(`The simulated horizon is a whole number of weeks from ${DYN_MIN_HORIZON_WEEKS} to ${DYN_MAX_HORIZON_WEEKS}.`, 'horizonWeeks');
        }
        patch.dynamicsHorizonWeeks = Number(horizonWeeks);
      }
      if (targetWipWeeks !== undefined) {
        if (!intIn(targetWipWeeks, 1, 12)) return fail('Healthy work in progress is 1 to 12 weeks of capacity.', 'targetWipWeeks');
        patch.dynamicsTargetWipWeeks = Number(targetWipWeeks);
      }
      if (pressureLagWeeks !== undefined) {
        if (!intIn(pressureLagWeeks, 1, 12)) return fail('The pressure delay is 1 to 12 weeks.', 'pressureLagWeeks');
        patch.dynamicsPressureLagWeeks = Number(pressureLagWeeks);
      }
      if (qualityFixWeeks !== undefined) {
        if (!intIn(qualityFixWeeks, 2, 26)) return fail('Quality-debt repayment is 2 to 26 weeks of repair capacity.', 'qualityFixWeeks');
        patch.dynamicsQualityFixWeeks = Number(qualityFixWeeks);
      }
      if (rampWeeks !== undefined) {
        if (!intIn(rampWeeks, 2, 26)) return fail('The ramp window is 2 to 26 weeks.', 'rampWeeks');
        patch.dynamicsRampWeeks = Number(rampWeeks);
      }
      if (structuralRiskPct !== undefined) {
        if (!intIn(structuralRiskPct, 30, 95)) return fail('The structural-risk threshold is 30 to 95.', 'structuralRiskPct');
        patch.dynamicsStructuralRiskPct = Number(structuralRiskPct);
      }
      if (autoPropagate !== undefined) patch.dynamicsAutoPropagate = Boolean(autoPropagate);
      if (!Object.keys(patch).length) return fail('Nothing to change in the dynamics policy.');
      return api.updateSettings(patch);
    },

    /* ------------------------------------------------------------------ *
     * Schema v38 — Structural Capital Allocation.
     *
     * A portfolio is a funded commitment over the same derived structural
     * model, with an effort budget as the binding constraint. Adoption freezes
     * both the prediction *and* the do-nothing baseline, because the baseline
     * is what turns a later checkpoint into a skill score rather than a
     * memory test.
     * ------------------------------------------------------------------ */

    /** The derived allocation report. Read-only: no event, no write. */
    capitalReport() {
      return buildCapitalReport(store.state, clock());
    },

    /** Evaluate an arbitrary lever vector against the current budget. */
    capitalPreview(levers = {}, { weeks, budgetUnits } = {}) {
      const report = buildCapitalReport(store.state, clock());
      if (!report.adequate) return { ok: false, error: report.reason };
      const horizon = Number.isFinite(Number(weeks))
        ? Math.min(DYN_MAX_HORIZON_WEEKS, Math.max(DYN_MIN_HORIZON_WEEKS, Math.round(Number(weeks))))
        : report.horizonWeeks;
      const budget = Number.isFinite(Number(budgetUnits))
        ? Math.min(CAP_MAX_BUDGET_UNITS, Math.max(CAP_MIN_BUDGET_UNITS, Number(budgetUnits)))
        : report.budgetUnits;
      const allocation = allocate(report.dynamics.model, { budget, weeks: horizon });
      const effort = effortOf(levers, CAP_EFFORT_BOOK);
      return {
        ok: true,
        evaluation: evaluatePolicy(report.dynamics.model, levers, { weeks: horizon }),
        effort,
        overBudget: effort.total > budget + 0.01,
        recommended: allocation,
      };
    },

    saveCapitalPolicy(data = {}) {
      const parsed = normalizeCapitalPolicyPayload(data);
      if (!parsed.ok) return fail(parsed.error, parsed.field);
      const existingId = data.id ? String(data.id) : null;
      const existing = existingId
        ? (store.state.capitalPolicies || []).find((row) => row && row.id === existingId)
        : null;
      if (existingId && !existing) return fail('That portfolio no longer exists.');
      if (existing && existing.status === 'adopted') {
        return fail('An adopted portfolio is a live commitment. Retire it before changing its levers, so the frozen prediction keeps its meaning.');
      }
      if (parsed.value.ownerId && !(store.state.people || []).some((person) => person.id === parsed.value.ownerId && person.status !== 'archived')) {
        return fail('Choose an active team member as the portfolio owner.', 'ownerId');
      }
      if (parsed.value.checkpointOn && parsed.value.checkpointOn < today()) {
        return fail('A checkpoint must be dated today or later — a checkpoint in the past cannot be reviewed prospectively.', 'checkpointOn');
      }
      const effort = effortOf(parsed.value.levers, CAP_EFFORT_BOOK);
      if (effort.total > parsed.value.budgetUnits + 0.01) {
        return fail(`This portfolio spends ${effort.total} effort-weeks against a ${parsed.value.budgetUnits}-week budget. Raise the budget or remove a lever.`, 'levers');
      }
      const record = {
        ...(existing || append(null, 'cap')),
        ...parsed.value,
        status: existing ? existing.status : 'draft',
        adoptedOn: existing ? existing.adoptedOn : null,
        predicted: existing ? existing.predicted : null,
        createdOn: existing ? existing.createdOn : today(),
        updatedAt: stamp(),
      };
      store.update(
        (draft) => {
          draft.capitalPolicies = Array.isArray(draft.capitalPolicies) ? draft.capitalPolicies : [];
          const index = draft.capitalPolicies.findIndex((row) => row && row.id === record.id);
          if (index === -1) draft.capitalPolicies.push(record);
          else draft.capitalPolicies[index] = record;
        },
        {
          type: existing ? 'capital.policy.updated' : 'capital.policy.created',
          entity: 'capital',
          entityId: record.id,
          summary: `${existing ? 'Updated' : 'Created'} capital portfolio “${record.name}”`,
        },
      );
      return { ok: true, id: record.id, propagations: store.lastPropagations || [] };
    },

    /**
     * Adopt a portfolio: freeze the prediction, the baseline, the exact
     * attribution and the model trust grade, then let RULE-CAP-01/02 open one
     * DACI commitment decision and one owned checkpoint delegation.
     */
    adoptCapitalPolicy(policyId, { checkpointOn = null } = {}) {
      const current = (store.state.capitalPolicies || []).find((row) => row && row.id === policyId);
      if (!current) return fail('That portfolio no longer exists.');
      if (current.status === 'adopted') return fail('That portfolio is already adopted.');
      if (current.status === 'retired') return fail('A retired portfolio cannot be adopted again; create a new one so the history stays readable.');
      if (checkpointOn && !isCalendarDay(checkpointOn)) return fail('Choose a valid checkpoint date.', 'checkpointOn');
      if (checkpointOn && checkpointOn < today()) return fail('The checkpoint must be today or later.', 'checkpointOn');
      if (!current.ownerId) return fail('Name an owner before adopting — a portfolio nobody owns is a wish.', 'ownerId');
      const report = buildCapitalReport(store.state, clock());
      if (!report.adequate) return fail(report.reason);
      const effort = effortOf(current.levers, CAP_EFFORT_BOOK);
      if (effort.total > current.budgetUnits + 0.01) {
        return fail(`This portfolio spends ${effort.total} effort-weeks against a ${current.budgetUnits}-week budget. Raise the budget or remove a lever before adopting.`);
      }
      const evaluation = evaluatePolicy(report.dynamics.model, current.levers, { weeks: current.horizonWeeks });
      const attribution = report.attribution;
      const due = checkpointOn || dayKey(addDays(today(), Math.min(56, Math.max(14, current.horizonWeeks * 7))));
      const frozen = {
        endSaturationPct: evaluation.scenario.summary.endSaturationPct,
        endWipDays: evaluation.scenario.summary.endWipDays,
        endCapacityPerWeek: evaluation.scenario.summary.endCapacityPerWeek,
        endDependencyPct: evaluation.scenario.summary.endDependencyPct,
        throughputDays: evaluation.delta.throughputDays,
        effort: effort.total,
        horizonWeeks: evaluation.scenario.horizonWeeks,
        // The do-nothing baseline is frozen too. Without it, a later checkpoint
        // can report absolute error but not skill, and a leader could not tell
        // whether the plan beat doing nothing.
        baseline: {
          endSaturationPct: evaluation.baseline.summary.endSaturationPct,
          endWipDays: evaluation.baseline.summary.endWipDays,
          endCapacityPerWeek: evaluation.baseline.summary.endCapacityPerWeek,
          endDependencyPct: evaluation.baseline.summary.endDependencyPct,
        },
        attribution: attribution.contributions.map((row) => ({
          key: row.key, label: row.label, marginal: row.marginal, sharePct: row.sharePct,
        })),
        trustGrade: report.trust.grade,
        trustLabel: report.trust.label,
        trustMeaning: report.trust.meaning,
        frozenAt: stamp(),
        engineVersion: report.engineVersion,
      };
      store.update(
        (draft) => {
          const target = (draft.capitalPolicies || []).find((row) => row && row.id === policyId);
          if (!target) return;
          target.status = 'adopted';
          target.adoptedOn = today();
          target.checkpointOn = due;
          target.predicted = frozen;
          target.updatedAt = stamp();
        },
        {
          type: 'capital.policy.adopted',
          entity: 'capital',
          entityId: policyId,
          summary: `Adopted capital portfolio “${current.name}” with a frozen prediction and baseline`,
        },
      );
      return { ok: true, id: policyId, predicted: frozen, propagations: store.lastPropagations || [] };
    },

    retireCapitalPolicy(policyId, { note = '' } = {}) {
      const current = (store.state.capitalPolicies || []).find((row) => row && row.id === policyId);
      if (!current) return fail('That portfolio no longer exists.');
      if (current.status === 'retired') return fail('That portfolio is already retired.');
      const reason = clean(note) || '';
      if (reason.length < 5) return fail('Record why the portfolio is being retired (at least 5 characters) so the history stays honest.', 'note');
      store.update(
        (draft) => {
          const target = (draft.capitalPolicies || []).find((row) => row && row.id === policyId);
          if (!target) return;
          target.status = 'retired';
          target.notes = `${target.notes ? `${target.notes} ` : ''}Retired ${today()}: ${reason}`.slice(0, 1200);
          target.updatedAt = stamp();
        },
        {
          type: 'capital.policy.retired',
          entity: 'capital',
          entityId: policyId,
          summary: `Retired capital portfolio “${current.name}”`,
        },
      );
      return { ok: true, id: policyId, propagations: store.lastPropagations || [] };
    },

    deleteCapitalPolicy(policyId) {
      const current = (store.state.capitalPolicies || []).find((row) => row && row.id === policyId);
      if (!current) return fail('That portfolio no longer exists.');
      if (current.status === 'adopted') return fail('An adopted portfolio is a live commitment. Retire it instead of deleting it.');
      const checkpoints = (store.state.dynamicsCheckpoints || []).filter((row) => row.subjectType === 'policy' && row.subjectId === policyId).length;
      if (checkpoints) return fail('This portfolio has scored checkpoints. Retire it instead of deleting the evidence.');
      store.update(
        (draft) => {
          draft.capitalPolicies = (draft.capitalPolicies || []).filter((row) => row && row.id !== policyId);
          draft.links = (draft.links || []).filter((link) => link
            && !(link.sourceType === 'capital' && link.sourceId === policyId)
            && !(link.targetType === 'capital' && link.targetId === policyId));
        },
        {
          type: 'capital.policy.deleted',
          entity: 'capital',
          entityId: policyId,
          summary: `Deleted draft capital portfolio “${current.name}”`,
        },
      );
      return { ok: true, id: policyId, propagations: store.lastPropagations || [] };
    },

    /**
     * Record an observed end-state and score the frozen prediction against it.
     * Append-only: a checkpoint is an observation, and the score is re-derived
     * from the observation plus the frozen prediction on every load, so editing
     * the stored skill by hand does not survive a reload.
     */
    recordDynamicsCheckpoint(data = {}) {
      const parsed = normalizeDynamicsCheckpointPayload(data);
      if (!parsed.ok) return fail(parsed.error, parsed.field);
      const { subjectType, subjectId, recordedOn, observed } = parsed.value;
      const policy = subjectType === 'policy'
        ? (store.state.capitalPolicies || []).find((row) => row && row.id === subjectId)
        : null;
      const experiment = subjectType === 'experiment'
        ? (store.state.dynamicsExperiments || []).find((row) => row && row.id === subjectId)
        : null;
      const subject = policy || experiment;
      if (!subject) return fail('That portfolio or experiment no longer exists.');
      if (subject.status !== 'adopted') return fail('Only an adopted commitment can be scored — a draft has no frozen prediction.', 'subjectId');
      if (recordedOn > today()) return fail('An observation cannot be dated in the future.', 'recordedOn');
      if (subject.adoptedOn && recordedOn < subject.adoptedOn) {
        return fail(`The observation predates adoption (${subject.adoptedOn}), so it cannot grade the frozen prediction.`, 'recordedOn');
      }
      const duplicate = (store.state.dynamicsCheckpoints || []).some((row) => row
        && row.subjectType === subjectType && row.subjectId === subjectId && row.recordedOn === recordedOn);
      if (duplicate) return fail('There is already a checkpoint for this commitment on that date. One observation per day, or the sample is double-counted.', 'recordedOn');
      const scoring = scoreCheckpoint(subject.predicted, observed);
      const checkpointId = id('chk');
      const record = {
        id: checkpointId,
        subjectType,
        subjectId,
        recordedOn,
        observed,
        scoring,
        note: parsed.value.note,
        createdOn: today(),
        createdAt: stamp(),
      };
      store.update(
        (draft) => {
          draft.dynamicsCheckpoints = Array.isArray(draft.dynamicsCheckpoints) ? draft.dynamicsCheckpoints : [];
          draft.dynamicsCheckpoints.push(record);
        },
        {
          type: 'dynamics.checkpoint.recorded',
          entity: 'checkpoint',
          entityId: checkpointId,
          summary: `Scored the ${recordedOn} checkpoint: ${scoring.verdict}`,
        },
      );
      return { ok: true, id: checkpointId, scoring, propagations: store.lastPropagations || [] };
    },

    /**
     * The allocation policy: effort budget, objective weights and the
     * propagation pause. Weights are renormalised by the schema, which stays
     * the single clamping authority.
     */
    setCapitalPolicy({ budgetUnits, weights, autoPropagate } = {}) {
      const patch = {};
      if (budgetUnits !== undefined) {
        const value = Number(budgetUnits);
        if (!Number.isInteger(value) || value < CAP_MIN_BUDGET_UNITS || value > CAP_MAX_BUDGET_UNITS) {
          return fail(`The effort budget is a whole number of weeks from ${CAP_MIN_BUDGET_UNITS} to ${CAP_MAX_BUDGET_UNITS}.`, 'budgetUnits');
        }
        patch.capitalEffortBudget = value;
      }
      if (weights !== undefined) {
        if (!weights || typeof weights !== 'object') return fail('Objective weights must be an object.', 'weights');
        const keys = { saturation: 'capitalWeightSaturation', throughput: 'capitalWeightThroughput', capacity: 'capitalWeightCapacity', wip: 'capitalWeightWip' };
        for (const [key, setting] of Object.entries(keys)) {
          if (weights[key] === undefined) continue;
          const value = Number(weights[key]);
          if (!Number.isFinite(value) || value < 0 || value > 1) {
            return fail(`The ${key} weight must be between 0 and 1.`, 'weights');
          }
          patch[setting] = Math.round(value * 100) / 100;
        }
        const total = Object.values(keys).reduce((sum, setting) => sum + Number(patch[setting] ?? store.state.settings?.[setting] ?? 0), 0);
        if (total <= 0) return fail('At least one objective must carry weight, or there is nothing to optimise.', 'weights');
      }
      if (autoPropagate !== undefined) patch.capitalAutoPropagate = Boolean(autoPropagate);
      if (!Object.keys(patch).length) return fail('Nothing to change in the allocation policy.');
      return api.updateSettings(patch);
    },

    /** Explicit scan: re-runs the shared rule spine on the committed draft. */
    scanCapital() {
      store.update(
        () => {},
        {
          type: 'capital.scan',
          entity: 'capital',
          entityId: '',
          summary: 'Structural capital allocation scan requested from the terminal',
        },
      );
      return { ok: true, propagations: store.lastPropagations || [] };
    },

    /**
     * Schema v34: the Cognitive Load Governor's policy — saturation index
     * threshold, Monte Carlo overload-probability threshold, the throughput
     * look-back window and the propagation pause. Validated here and stored
     * through the one settings path so normalizeSettings stays the single
     * clamping authority. The WIP convention itself is the shared
     * `wipLimitPerPerson` setting, edited in the Capacity policy.
     */
    setLoadPolicy({ saturationPct, overloadProbPct, windowWeeks, autoPropagate } = {}) {
      const patch = {};
      if (saturationPct !== undefined) {
        const value = Number(saturationPct);
        if (!Number.isInteger(value) || value < 50 || value > 100) {
          return fail('The saturation threshold is a whole percentage from 50 to 100; 80 is the Team Topologies-flavoured default.', 'saturationPct');
        }
        patch.loadSaturationPct = value;
      }
      if (overloadProbPct !== undefined) {
        const value = Number(overloadProbPct);
        if (!Number.isInteger(value) || value < 50 || value > 99) {
          return fail('The Monte Carlo overload threshold is a whole probability percentage from 50 to 99.', 'overloadProbPct');
        }
        patch.loadOverloadProbPct = value;
      }
      if (windowWeeks !== undefined) {
        const value = Number(windowWeeks);
        if (!Number.isInteger(value) || value < 4 || value > 26) {
          return fail('The throughput window must be 4 to 26 weeks — long enough for two completions, short enough to describe current habits.', 'windowWeeks');
        }
        patch.loadThroughputWindowWeeks = value;
      }
      if (autoPropagate !== undefined) patch.loadAutoPropagate = Boolean(autoPropagate);
      if (!Object.keys(patch).length) return fail('Nothing to change in the load policy.');
      return api.updateSettings(patch);
    },

    /**
     * Schema v34: explicitly re-run the Cognitive Load Governor across the
     * whole roster. Emits `load.scan`; the post-commit rule is idempotent,
     * so repeated scans converge. An explicit scan runs even while automatic
     * propagation is paused — the human explicitly asked.
     */
    scanLoad() {
      store.update(
        () => {},
        {
          type: 'load.scan',
          entity: 'workspace',
          entityId: '',
          summary: 'Cognitive Load Governor scan requested from the terminal',
        },
      );
      return { ok: true, propagations: store.lastPropagations || [] };
    },

    /* ------------------------------------------------------------------ *
     * Schema v35 — Premise Sentinel / Assumption Ledger.
     *
     * Every write goes through the same validated API and emits one event on
     * the generalized post-commit spine. The rule then senses evidence,
     * re-derives belief, builds typed links and (when a fresh signpost breach
     * occurs) opens the governed cross-module re-decision in the SAME
     * transaction. Views never mutate state directly.
     * ------------------------------------------------------------------ */

    addPremise(data = {}) {
      const parsed = normalizePremisePayload(data, {
        state: store.state,
        now: clock(),
        settings: store.state.settings,
      });
      if (!parsed.ok) return fail(parsed.error, parsed.field);
      const base = append(null, 'premise');
      const record = {
        ...base,
        ...parsed.value,
        observations: [],
        history: [{ at: stamp(), type: 'registered', summary: `Pre-registered “${parsed.value.title}” with a dated signpost` }],
        status: 'unobserved',
        reviewCycle: 0,
        posteriorPct: parsed.value.priorPct,
        logBayesFactor: 0,
        lastReviewedOn: null,
        acknowledgedOn: null,
        acknowledgedAt: null,
        humanDisposition: null,
        autoPropagate: data.autoPropagate !== false,
        updatedAt: stamp(),
      };
      store.update(
        (draft) => {
          draft.premises = Array.isArray(draft.premises) ? draft.premises : [];
          draft.premises.push(record);
        },
        {
          type: 'premise.created',
          entity: 'premise',
          entityId: record.id,
          summary: `Registered decision premise “${record.title}” with a signpost`,
        },
      );
      return { ok: true, id: record.id, propagations: store.lastPropagations || [] };
    },

    updatePremise(premiseId, patch = {}) {
      const current = (store.state.premises || []).find((p) => p && p.id === premiseId);
      if (!current) return fail('That premise no longer exists.');
      if (current.humanDisposition === 'retired') return fail('A retired premise cannot be edited; register a new one instead.');
      const parsed = normalizePremisePayload(patch, {
        state: store.state,
        now: clock(),
        settings: store.state.settings,
        existing: current,
      });
      if (!parsed.ok) return fail(parsed.error, parsed.field);
      store.update(
        (draft) => {
          const target = (draft.premises || []).find((p) => p && p.id === premiseId);
          if (!target) return;
          Object.assign(target, parsed.value, { updatedAt: stamp() });
          target.history = [...(Array.isArray(target.history) ? target.history : []), {
            at: stamp(), type: 'updated', summary: 'Premise, thresholds or evidence scope updated',
          }].slice(-60);
        },
        {
          type: 'premise.updated',
          entity: 'premise',
          entityId: premiseId,
          summary: `Updated premise “${parsed.value.title}”`,
        },
      );
      return { ok: true, propagations: store.lastPropagations || [] };
    },

    recordPremiseEvidence(premiseId, data = {}) {
      const current = (store.state.premises || []).find((p) => p && p.id === premiseId);
      if (!current) return fail('That premise no longer exists.');
      if (current.humanDisposition === 'retired') return fail('A retired premise cannot accept new evidence.');
      const title = clean(data.title) || '';
      if (title.length < 3) return fail('Name the observation in at least 3 characters.', 'title');
      if (!['for', 'against'].includes(data.direction)) return fail('Choose whether the observation supports or challenges the premise.', 'direction');
      if (!PREMISE_EVIDENCE_STRENGTHS[data.strength]) return fail('Choose weak, moderate or strong evidence.', 'strength');
      if (data.observedOn && !isCalendarDay(data.observedOn)) return fail('Choose a valid observation date.', 'observedOn');
      if (data.observedOn && data.observedOn > today()) return fail('An observation cannot be dated in the future.', 'observedOn');
      const observation = makeManualPremiseObservation({ ...data, title }, { now: clock(), idFactory: id });
      store.update(
        (draft) => {
          const target = (draft.premises || []).find((p) => p && p.id === premiseId);
          if (!target) return;
          target.observations = [...(Array.isArray(target.observations) ? target.observations : []), observation].slice(-120);
          if (target.humanDisposition === 'reaffirmed') target.humanDisposition = null;
          target.history = [...(Array.isArray(target.history) ? target.history : []), {
            at: stamp(), type: 'evidence', summary: `Recorded ${observation.direction} observation (LR ${observation.likelihoodRatio})`,
          }].slice(-60);
          target.updatedAt = stamp();
        },
        {
          type: 'premise.evidence',
          entity: 'premise',
          entityId: premiseId,
          summary: `Recorded dated evidence for “${current.title}”`,
        },
      );
      return { ok: true, id: observation.id, propagations: store.lastPropagations || [] };
    },

    reviewPremise(premiseId, { note = '', disposition = 'reaffirm', nextReviewOn } = {}) {
      const current = (store.state.premises || []).find((p) => p && p.id === premiseId);
      if (!current) return fail('That premise no longer exists.');
      if (!['reaffirm', 'retire', 'reopen'].includes(disposition)) return fail('Choose reaffirm, retire or reopen.', 'disposition');
      const text = clean(note) || '';
      if (text.length < 5) return fail('Write a short dated review note (at least 5 characters).', 'note');
      const reviewBy = nextReviewOn || addDays(today(), store.state.settings?.premiseReviewDays ?? 30);
      if (!isCalendarDay(reviewBy) || reviewBy < today()) return fail('Choose a valid next review date on or after today.', 'nextReviewOn');
      const humanDisposition = disposition === 'reaffirm' ? 'reaffirmed' : disposition === 'retire' ? 'retired' : null;
      // Strictly after every evidence record created in this same transaction,
      // so sensor observations derived during the review cannot immediately
      // clear the human acknowledgement. Later evidence has a later timestamp.
      const acknowledgedAt = new Date(clock().getTime() + 1).toISOString();
      store.update(
        (draft) => {
          const target = (draft.premises || []).find((p) => p && p.id === premiseId);
          if (!target) return;
          target.lastReviewedOn = today();
          target.reviewBy = reviewBy;
          target.acknowledgedOn = today();
          target.acknowledgedAt = acknowledgedAt;
          target.humanDisposition = humanDisposition;
          // A dated review closes the current breach episode. Genuinely new
          // evidence after this acknowledgement can open exactly one new
          // re-decision (a fresh idempotency cycle), not a duplicate of the
          // decision the human just reviewed.
          target.reviewCycle = Math.max(0, Math.round(Number(target.reviewCycle) || 0)) + 1;
          target.history = [...(Array.isArray(target.history) ? target.history : []), {
            at: stamp(), type: 'reviewed', summary: `${disposition}: ${text.slice(0, 300)}`,
          }].slice(-60);
          target.updatedAt = stamp();
          const evaluation = evaluatePremiseCore(target, { now: clock(), settings: draft.settings });
          target.status = evaluation.status;
          target.posteriorPct = evaluation.posteriorPct;
          target.logBayesFactor = evaluation.logBayesFactor;
        },
        {
          type: 'premise.reviewed',
          entity: 'premise',
          entityId: premiseId,
          summary: `Human ${disposition} recorded for “${current.title}”`,
        },
      );
      return { ok: true, propagations: store.lastPropagations || [] };
    },

    /**
     * Append a human-assessed outcome. Conclusive truth labels are immutable
     * and unique per premise; an inconclusive checkpoint may be followed by a
     * later definitive assessment. No sensor can declare its own result.
     */
    recordPremiseOutcome(premiseId, { verdict, settledOn, note: outcomeNote = '' } = {}) {
      const premise = (store.state.premises || []).find((row) => row && row.id === premiseId);
      if (!premise) return fail('That premise no longer exists.');
      if (!['held', 'failed', 'inconclusive'].includes(verdict)) {
        return fail('Choose held, failed or inconclusive.', 'verdict');
      }
      const date = settledOn || today();
      if (!isCalendarDay(date) || date > today()) return fail('Choose a valid outcome date on or before today.', 'settledOn');
      if (date < String(premise.createdAt || '').slice(0, 10)) {
        return fail('The outcome date cannot predate registration of the premise.', 'settledOn');
      }
      const noteText = clean(outcomeNote) || '';
      if (noteText.length > 600) return fail('Keep the assessment note under 600 characters.', 'note');
      if (verdict !== 'inconclusive' && (store.state.premiseOutcomes || []).some((row) => row?.premiseId === premiseId && ['held', 'failed'].includes(row.verdict))) {
        return fail('A conclusive outcome is already recorded for this premise. Its calibration history is immutable.');
      }
      const record = {
        ...append(null, 'prem-out'),
        premiseId,
        verdict,
        settledOn: date,
        note: noteText,
      };
      store.update((draft) => {
        draft.premiseOutcomes = Array.isArray(draft.premiseOutcomes) ? draft.premiseOutcomes : [];
        draft.premiseOutcomes.push(record);
      }, {
        type: 'premise.outcome',
        entity: 'premiseOutcome',
        entityId: record.id,
        summary: `Human ${verdict} outcome assessed for a registered premise`,
      });
      return { ok: true, id: record.id, propagations: store.lastPropagations || [] };
    },

    setPremisePolicy({ watchPct, breachPct, halfLifeDays, reviewDays, autoPropagate } = {}) {
      const patch = {};
      const current = store.state.settings || {};
      if (watchPct !== undefined) {
        const value = Number(watchPct);
        if (!Number.isInteger(value) || value < 10 || value > 90) return fail('The watch threshold is a whole percentage from 10 to 90.', 'watchPct');
        patch.premiseWatchPct = value;
      }
      if (breachPct !== undefined) {
        const value = Number(breachPct);
        if (!Number.isInteger(value) || value < 5 || value > 85) return fail('The breach threshold is a whole percentage from 5 to 85.', 'breachPct');
        patch.premiseBreachPct = value;
      }
      const effectiveWatch = patch.premiseWatchPct ?? current.premiseWatchPct ?? 55;
      const effectiveBreach = patch.premiseBreachPct ?? current.premiseBreachPct ?? 30;
      if (effectiveBreach >= effectiveWatch) return fail('The breach threshold must be below the watch threshold.', 'breachPct');
      if (halfLifeDays !== undefined) {
        const value = Number(halfLifeDays);
        if (!Number.isInteger(value) || value < 7 || value > 365) return fail('Evidence half-life must be 7–365 days.', 'halfLifeDays');
        patch.premiseHalfLifeDays = value;
      }
      if (reviewDays !== undefined) {
        const value = Number(reviewDays);
        if (!Number.isInteger(value) || value < 7 || value > 180) return fail('Review cadence must be 7–180 days.', 'reviewDays');
        patch.premiseReviewDays = value;
      }
      if (autoPropagate !== undefined) patch.premiseAutoPropagate = Boolean(autoPropagate);
      if (!Object.keys(patch).length) return fail('Nothing to change in the premise policy.');
      const result = api.updateSettings(patch);
      if (!result.ok) return result;
      return { ok: true, warning: result.warning || null, propagations: store.lastPropagations || [] };
    },

    /** Explicit human scan: sensing + governance, even when auto-propagation is paused. */
    scanPremises() {
      store.update(
        () => {},
        {
          type: 'premise.scan',
          entity: 'workspace',
          entityId: '',
          summary: 'Assumption Ledger signpost scan requested from the terminal',
        },
      );
      return { ok: true, propagations: store.lastPropagations || [] };
    },

    /* ------------------------------------------------------- early warning */

    /**
     * Record the one-way human verdict on a promoted alert.
     *
     * Only a confirmation opens a case; separate monitoring-governance rules
     * can create decisions. The action validates the verdict, stamps the date, and lets the
     * post-commit spine do the rest: `confirmed` opens one operational case,
     * `false-alarm` feeds the precision ledger (and can make a series "noisy"),
     * `explained` and `dismissed` are kept because the next reader deserves to
     * know the signal was seen. A verdict can never be edited afterwards: the
     * ledger is append-only by design, and an honest detector cannot let a
     * leader retro-fit their own accuracy.
     */
    triageWatchAlert(alertId, { verdict, note = '', response = {} } = {}) {
      const alert = (store.state.watchAlerts || []).find((row) => row && row.id === alertId);
      if (!alert) return fail('That alert no longer exists.');
      if (alert.status !== 'open') {
        return fail(`This alert already has a verdict (${alert.status}). Verdicts are one-way so the precision record stays honest.`);
      }
      if (!EW_VERDICTS.includes(verdict)) {
        return fail('Choose confirmed, false alarm, explained or dismissed.', 'verdict');
      }
      const verdictNote = clean(note) || '';
      if (verdictNote.length > 600) return fail('Keep the verdict note under 600 characters.', 'note');
      const parsed = verdict === 'confirmed' ? validateWatchResponse(response, store.state) : { ok: true, value: null };
      if (!parsed.ok) return fail(parsed.error);
      const warningCount = store.warnings.length;
      store.update(
        (draft) => {
          const row = (draft.watchAlerts || []).find((a) => a && a.id === alertId);
          if (!row) return;
          row.status = verdict;
          row.triagedOn = today();
          row.verdictNote = verdictNote;
          row.responseContext = parsed.value;
        },
        {
          type: 'watch.triaged',
          entity: 'alert',
          entityId: alertId,
          summary: `Human verdict recorded on a ${alert.seriesId} alert: ${EW_VERDICT_LABELS[verdict] || verdict}`,
        },
      );
      const recorded = (store.state.watchAlerts || []).find((row) => row && row.id === alertId);
      if (!recorded || recorded.status !== verdict) return fail('The verdict could not be saved; check workspace write status and try again.');
      return {
        ok: true,
        status: recorded.status,
        linkedCaseId: recorded ? recorded.linkedCaseId : null,
        automationWarnings: store.warnings.length - warningCount,
        propagations: store.lastPropagations || [],
      };
    },

    /** Retry only the case promotion for a confirmed alert after a rule error.
     * The original verdict and local response context are left untouched. */
    retryWatchPromotion(alertId) {
      const alert = (store.state.watchAlerts || []).find((row) => row && row.id === alertId);
      if (!alert || alert.status !== 'confirmed') return fail('Only a confirmed alert can be retried.');
      const linked = alert.linkedCaseId && (store.state.cases || []).some((c) => c.id === alert.linkedCaseId);
      const revision = store.state.meta.revision;
      const warningCount = store.warnings.length;
      store.update(() => {}, linked ? {
        type: 'case.automation.refresh', entity: 'case', entityId: alert.linkedCaseId,
        automationOptions: alert.responseContext ? { propagateDecision: alert.responseContext.createDecision === true } : {},
        summary: 'Retry confirmed Watch case follow-through',
      } : {
        type: 'watch.triaged', entity: 'alert', entityId: alertId,
        summary: `Retry case promotion for confirmed ${alert.seriesId} alert`,
      });
      if (store.state.meta.revision === revision) return fail('Workspace is locked or writes are blocked.');
      const recorded = (store.state.watchAlerts || []).find((row) => row && row.id === alertId);
      return { ok: true, linkedCaseId: recorded?.linkedCaseId || null, automationWarnings: store.warnings.length - warningCount, propagations: store.lastPropagations || [] };
    },

    /** Explicit scan: sense and record even when auto-propagation is paused. */
    scanWatch() {
      store.update(
        () => {},
        {
          type: 'watch.scan',
          entity: 'workspace',
          entityId: '',
          summary: 'Early-warning scan requested from the terminal',
        },
      );
      return { ok: true, propagations: store.lastPropagations || [] };
    },

    /**
     * Monitoring policy. Every value is validated here and clamped again on
     * load, so a hand-edited blob and a UI typo fail the same way. q is a
     * nominal step-up threshold, not a verified error-rate guarantee.
     */
    setWatchPolicy({ q, budget, windowDays, triageDays, cooldownDays, autoPropagate } = {}) {
      const patch = {};
      if (q !== undefined) {
        const value = Number(q);
        if (!Number.isFinite(value) || value < 0.01 || value > 0.5) {
          return fail('The nominal step-up threshold q must be between 0.01 and 0.5; it is not a guaranteed false-alert rate.', 'q');
        }
        patch.watchQ = Math.round(value * 1000) / 1000;
      }
      if (budget !== undefined) {
        const value = Number(budget);
        if (!Number.isInteger(value) || value < 1 || value > 20) return fail('The alert budget is a whole number from 1 to 20.', 'budget');
        patch.watchAlertBudget = value;
      }
      if (windowDays !== undefined) {
        const value = Number(windowDays);
        if (!Number.isInteger(value) || value < 7 || value > 90) return fail('The budget window is 7–90 days.', 'windowDays');
        patch.watchWindowDays = value;
      }
      if (triageDays !== undefined) {
        const value = Number(triageDays);
        if (!Number.isInteger(value) || value < 1 || value > 30) return fail('The triage deadline is 1–30 days.', 'triageDays');
        patch.watchTriageDays = value;
      }
      if (cooldownDays !== undefined) {
        const value = Number(cooldownDays);
        if (!Number.isInteger(value) || value < 0 || value > 60) return fail('The per-series cooldown is 0–60 days.', 'cooldownDays');
        patch.watchCooldownDays = value;
      }
      if (autoPropagate !== undefined) patch.watchAutoPropagate = Boolean(autoPropagate);
      if (!Object.keys(patch).length) return fail('Nothing to change in the watch policy.');
      const result = api.updateSettings(patch);
      if (!result.ok) return result;
      return { ok: true, warning: result.warning || null, policy: readWatchPolicy(store.state.settings), propagations: store.lastPropagations || [] };
    },

    /**
     * Reconcile the operating plan: repair linked delegation-completion edges,
     * refresh open-case capacity reserves, then re-check feasibility. Safe to
     * run repeatedly — it reuses the idempotent event rules.
     */
    syncCapacityPlan() {
      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const created = [];
          // Reconcile missed/legacy completion edges as well as case reserves.
          // This is safe to repeat: completed portfolio items are not rewritten.
          for (const delegation of draft.delegations || []) {
            if (delegation.status !== 'done') continue;
            const entries = onDelegationCompleted(draft, delegation.id, { now: clock(), idFactory: id, logEvent });
            created.push(...entries.filter((p) => p.ruleId === 'RULE-CAP-04'));
          }
          for (const c of draft.cases || []) {
            if (!['open', 'mitigating', 'monitoring'].includes(c.status)) continue;
            const entry = propagateCaseEvent(draft, c, {
              now: clock(),
              idFactory: id,
              logEvent,
              options: { propagateDecision: false, propagateDelegation: false },
            });
            created.push(...(entry || []).filter((p) => p.ruleId === 'RULE-CAP-01'));
          }
          for (const chg of draft.changes || []) {
            const entry = syncChangeCapacityReserve(draft, chg, {
              idFactory: id,
              todayStr: today(),
              nowIso: stamp(),
              logEvent,
            });
            if (entry) created.push(entry);
          }
          const tradeoff = evaluateCapacityTradeoff(draft, {
            now: clock(),
            idFactory: id,
            todayStr: today(),
            nowIso: stamp(),
            logEvent,
            triggerLabel: 'plan sync',
          });
          const tailEntries = evaluateMonteCarloTailRisk(draft, {
            now: clock(),
            idFactory: id,
            todayStr: today(),
            nowIso: stamp(),
            logEvent,
            triggerLabel: 'plan sync',
          });
          propagations = [...created, ...(tradeoff ? [tradeoff] : []), ...tailEntries];
        },
        {
          type: 'capacity.synced',
          entity: 'portfolio',
          summary: 'Reconciled capacity reserves and plan feasibility',
        },
      );
      const model = buildCapacityModel(store.state, { now: clock() });
      const utilisable = PORTFOLIO_STATUSES.includes('open');
      return { ok: true, propagations, utilisation: model.utilisation, openItems: utilisable ? model.demand.committed.length : 0 };
    },

    /* ------------------------------------------------------------ hiring */

    addRequisition(data = {}) {
      const title = (clean(data.title) || '').slice(0, 160);
      if (!title) return fail('Name the role you are hiring for.', 'title');
      const level = LEVELS.includes(data.level) ? data.level : 'ic';
      const reason = REQUISITION_REASONS.includes(data.reason) ? data.reason : 'growth';
      const openedOn = data.openedOn || today();
      if (!isCalendarDay(openedOn) || openedOn > today()) {
        return fail('Choose a valid opening date that is not in the future.', 'openedOn');
      }
      const targetStartOn = data.targetStartOn ? String(data.targetStartOn).trim() : null;
      if (targetStartOn && !isCalendarDay(targetStartOn)) return fail('Choose a valid target start date, or leave it blank.', 'targetStartOn');
      if (targetStartOn && targetStartOn < openedOn) return fail('The target start cannot be before the role opened.', 'targetStartOn');

      const effort = parseEffort(data);
      if (!effort.ok) return effort;
      const daily = parseNonNegative(data.dailyVacancyCost, 'The daily cost of the seat being empty', 'dailyVacancyCost');
      if (!daily.ok) return daily;

      const competencies = parseCompetencies(data.competencies, id);
      if (!competencies.length) {
        return fail('Record at least one competency the role must demonstrate — otherwise there is nothing to assess a candidate against.', 'competencies');
      }

      const requisition = {
        id: id('req'),
        title,
        team: (clean(data.team) || store.state.settings.teamName || '').slice(0, 80),
        level,
        reason,
        status: REQUISITION_STATUSES.includes(data.status) ? data.status : 'open',
        openedOn,
        targetStartOn,
        closedOn: null,
        filledPersonId: null,
        interviewers: normalizeInterviewers(data.interviewers, store.state.people),
        competencies,
        effortDays: effort.triple,
        dailyVacancyCost: daily.value > 0 ? daily.value : null,
        currency: (clean(data.currency) || 'USD').toUpperCase().slice(0, 6),
        notes: (clean(data.notes) || '').slice(0, 2000),
        autoEscalated: false,
        escalatedCaseId: null,
        createdAt: stamp(),
        updatedAt: stamp(),
      };

      let propagation = null;
      store.update(
        (draft, { logEvent }) => {
          draft.requisitions = Array.isArray(draft.requisitions) ? draft.requisitions : [];
          draft.requisitions.push(requisition);
          propagation = syncRequisitionCapacity(draft, requisition, {
            idFactory: id,
            todayStr: today(),
            nowIso: stamp(),
            logEvent,
          });
        },
        {
          type: 'requisition.opened',
          entity: 'requisition',
          entityId: requisition.id,
          summary: `Opened hiring for ${requisition.title} (${REQUISITION_REASON_LABELS[requisition.reason]})`,
        },
      );
      const escalated = maybeEscalateStalledHiring();
      return { ok: true, id: requisition.id, propagation, escalations: escalated };
    },

    updateRequisition(reqId, patch = {}) {
      const current = (store.state.requisitions || []).find((r) => r.id === reqId);
      if (!current) return fail('That requisition no longer exists.');

      const title = patch.title !== undefined ? (clean(patch.title) || '').slice(0, 160) : current.title;
      if (!title) return fail('Name the role you are hiring for.', 'title');

      const status = patch.status !== undefined ? patch.status : current.status;
      if (!REQUISITION_STATUSES.includes(status)) return fail('Choose a valid requisition status.', 'status');

      const openedOn = patch.openedOn !== undefined ? patch.openedOn : current.openedOn;
      if (!isCalendarDay(openedOn) || openedOn > today()) return fail('Choose a valid opening date that is not in the future.', 'openedOn');

      const targetStartOn = patch.targetStartOn !== undefined
        ? (patch.targetStartOn ? String(patch.targetStartOn).trim() : null)
        : current.targetStartOn;
      if (targetStartOn && !isCalendarDay(targetStartOn)) return fail('Choose a valid target start date, or leave it blank.', 'targetStartOn');
      if (targetStartOn && targetStartOn < openedOn) return fail('The target start cannot be before the role opened.', 'targetStartOn');

      const effortChanged = ['effortOptimistic', 'effortMostLikely', 'effortPessimistic']
        .some((key) => patch[key] !== undefined);
      const effort = effortChanged
        ? parseEffort(patch)
        : { ok: true, triple: { ...current.effortDays } };
      if (!effort.ok) return effort;

      const daily = patch.dailyVacancyCost !== undefined
        ? parseNonNegative(patch.dailyVacancyCost, 'The daily cost of the seat being empty', 'dailyVacancyCost')
        : { ok: true, value: current.dailyVacancyCost || 0 };
      if (!daily.ok) return daily;

      let competencies = current.competencies;
      if (patch.competencies !== undefined) {
        const byName = new Map((current.competencies || []).map((cmp) => [cmp.name.toLowerCase(), cmp.id]));
        competencies = parseCompetencies(patch.competencies, id, byName);
        if (!competencies.length) {
          return fail('A role needs at least one competency to assess candidates against.', 'competencies');
        }
      }

      const terminal = status === 'filled' || status === 'cancelled';
      const wasActive = ACTIVE_REQUISITION_STATUSES.includes(current.status);
      const nowActive = ACTIVE_REQUISITION_STATUSES.includes(status);
      const closedOn = terminal
        ? (patch.closedOn ? String(patch.closedOn).trim() : current.closedOn || today())
        : null;
      if (closedOn && !isCalendarDay(closedOn)) return fail('Choose a valid closing date.', 'closedOn');
      if (closedOn && closedOn < openedOn) return fail('The role cannot close before it opened.', 'closedOn');
      if (closedOn && closedOn > today()) return fail('The closing date cannot be in the future.', 'closedOn');

      let propagation = null;
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.requisitions || []).find((r) => r.id === reqId);
          if (!target) return;
          target.title = title;
          target.status = status;
          target.openedOn = openedOn;
          target.targetStartOn = targetStartOn;
          target.closedOn = closedOn;
          target.effortDays = { ...effort.triple };
          target.dailyVacancyCost = daily.value > 0 ? daily.value : null;
          target.competencies = competencies;
          if (patch.level !== undefined) target.level = LEVELS.includes(patch.level) ? patch.level : target.level;
          if (patch.reason !== undefined) target.reason = REQUISITION_REASONS.includes(patch.reason) ? patch.reason : target.reason;
          if (patch.team !== undefined) target.team = (clean(patch.team) || '').slice(0, 80);
          if (patch.currency !== undefined) target.currency = (clean(patch.currency) || 'USD').toUpperCase().slice(0, 6);
          if (patch.notes !== undefined) target.notes = (clean(patch.notes) || '').slice(0, 2000);
          if (patch.interviewers !== undefined) target.interviewers = normalizeInterviewers(patch.interviewers, draft.people);
          target.updatedAt = stamp();
          propagation = syncRequisitionCapacity(draft, target, {
            idFactory: id,
            todayStr: today(),
            nowIso: stamp(),
            logEvent,
          });
          if (wasActive && !nowActive) {
            for (const candidate of draft.candidates || []) {
              if (candidate.reqId !== reqId) continue;
              if (!OPEN_CANDIDATE_STAGES.includes(candidate.stage)) continue;
              candidate.lastActivityOn = candidate.lastActivityOn || today();
            }
          }
        },
        {
          type: 'requisition.updated',
          entity: 'requisition',
          entityId: reqId,
          summary: `Updated hiring for ${title}${current.status !== status ? ` (${current.status} → ${status})` : ''}`,
        },
      );
      const escalations = patch.autoEscalated === undefined ? maybeEscalateStalledHiring() : [];
      return { ok: true, propagation, escalations };
    },

    deleteRequisition(reqId) {
      const current = (store.state.requisitions || []).find((r) => r.id === reqId);
      if (!current) return fail('That requisition no longer exists.');
      const candidateCount = (store.state.candidates || []).filter((c) => c.reqId === reqId).length;
      if (candidateCount) {
        return fail(`This role still has ${candidateCount} candidate record(s). Delete or archive them first — a candidate is a person's data, not a requisition field.`);
      }
      store.update(
        (draft) => {
          draft.requisitions = (draft.requisitions || []).filter((r) => r.id !== reqId);
          draft.portfolio = (draft.portfolio || []).filter(
            (p) => !(p.sourceType === 'requisition' && p.sourceId === reqId),
          );
          draft.links = (draft.links || []).filter(
            (l) => l && !(l.sourceType === 'requisition' && l.sourceId === reqId) && !(l.targetType === 'requisition' && l.targetId === reqId),
          );
        },
        {
          type: 'requisition.deleted',
          entity: 'requisition',
          entityId: reqId,
          summary: `Deleted the requisition for ${current.title}`,
        },
      );
      return { ok: true };
    },

    addCandidate(data = {}) {
      const requisition = (store.state.requisitions || []).find((r) => r.id === clean(data.reqId));
      if (!requisition) return fail('Choose the role this candidate is being considered for.', 'reqId');
      if (!ACTIVE_REQUISITION_STATUSES.includes(requisition.status)) {
        return fail('That role is no longer active. Reopen it before adding candidates.', 'reqId');
      }
      const name = (clean(data.name) || '').slice(0, 120);
      if (!name) return fail('Record the candidate’s name so their evidence is attributable.', 'name');
      const appliedOn = data.appliedOn || today();
      if (!isCalendarDay(appliedOn) || appliedOn > today()) {
        return fail('Choose a valid application date that is not in the future.', 'appliedOn');
      }
      const stage = CANDIDATE_STAGES.includes(data.stage) && OPEN_CANDIDATE_STAGES.includes(data.stage)
        ? data.stage
        : 'sourced';

      const candidate = {
        id: id('cand'),
        reqId: requisition.id,
        name,
        stage,
        appliedOn,
        lastActivityOn: appliedOn,
        source: (clean(data.source) || '').slice(0, 120),
        signals: [],
        decision: { outcome: 'pending', decidedOn: null, rationale: '', evidenceGapAcknowledged: false },
        offerOn: null,
        offerAcceptedOn: null,
        hiredOn: null,
        startOn: null,
        personId: null,
        keepInTouch: false,
        createdAt: stamp(),
        updatedAt: stamp(),
      };

      store.update(
        (draft) => {
          draft.candidates = Array.isArray(draft.candidates) ? draft.candidates : [];
          draft.candidates.push(candidate);
        },
        {
          type: 'candidate.added',
          entity: 'candidate',
          entityId: candidate.id,
          summary: `${candidate.name} added to ${requisition.title}`,
        },
      );
      return { ok: true, id: candidate.id };
    },

    updateCandidate(candidateId, patch = {}) {
      const current = (store.state.candidates || []).find((c) => c.id === candidateId);
      if (!current) return fail('That candidate no longer exists.');
      const name = patch.name !== undefined ? (clean(patch.name) || '').slice(0, 120) : current.name;
      if (!name) return fail('Record the candidate’s name so their evidence is attributable.', 'name');
      const source = patch.source !== undefined ? (clean(patch.source) || '').slice(0, 120) : current.source;
      const startOn = patch.startOn !== undefined
        ? (patch.startOn ? String(patch.startOn).trim() : null)
        : current.startOn;
      if (startOn && !isCalendarDay(startOn)) return fail('Choose a valid start date.', 'startOn');

      store.update(
        (draft) => {
          const target = (draft.candidates || []).find((c) => c.id === candidateId);
          if (!target) return;
          target.name = name;
          target.source = source;
          if (startOn) target.startOn = startOn;
          if (patch.keepInTouch !== undefined) target.keepInTouch = patch.keepInTouch === true;
          target.updatedAt = stamp();
          target.lastActivityOn = today();
        },
        {
          type: 'candidate.updated',
          entity: 'candidate',
          entityId: candidateId,
          summary: `Updated candidate record for ${name}`,
        },
      );
      return { ok: true };
    },

    deleteCandidate(candidateId) {
      const current = (store.state.candidates || []).find((c) => c.id === candidateId);
      if (!current) return fail('That candidate no longer exists.');
      if (current.personId) {
        return fail('This candidate is already on the roster. Archive the person record instead of deleting the hiring history.');
      }
      store.update(
        (draft) => {
          draft.candidates = (draft.candidates || []).filter((c) => c.id !== candidateId);
          draft.links = (draft.links || []).filter(
            (l) => l && !(l.sourceType === 'candidate' && l.sourceId === candidateId) && !(l.targetType === 'candidate' && l.targetId === candidateId),
          );
        },
        {
          type: 'candidate.deleted',
          entity: 'candidate',
          entityId: candidateId,
          summary: `Deleted the candidate record for ${current.name} (data minimisation request)`,
        },
      );
      return { ok: true };
    },

    recordEvidence(candidateId, data = {}) {
      const candidate = (store.state.candidates || []).find((c) => c.id === candidateId);
      if (!candidate) return fail('That candidate no longer exists.');
      if (!OPEN_CANDIDATE_STAGES.includes(candidate.stage)) {
        return fail('This candidate’s process is closed. Reopen the stage before adding evidence.');
      }
      const requisition = (store.state.requisitions || []).find((r) => r.id === candidate.reqId);
      if (!requisition) return fail('That requisition no longer exists.');

      const kind = EVIDENCE_KIND_BY_ID[data.kind] ? data.kind : null;
      if (!kind) return fail('Choose the kind of evidence you collected.', 'kind');
      const rating = Math.round(Number(data.rating));
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
        return fail('Rate the evidence from 1 to 5, where 3 means “no signal either way”.', 'rating');
      }
      let competencyId = clean(data.competencyId) || null;
      if (competencyId && !(requisition.competencies || []).some((cmp) => cmp.id === competencyId)) {
        return fail('Choose a competency that belongs to this role, or leave it general.', 'competencyId');
      }
      let interviewerId = clean(data.interviewerId) || null;
      if (interviewerId) {
        const interviewer = store.state.people.find((p) => p.id === interviewerId);
        if (!interviewer) return fail('Choose an existing team member as the interviewer, or leave it unattributed.', 'interviewerId');
      }
      const date = data.date || today();
      if (!isCalendarDay(date) || date > today()) return fail('Choose a valid observation date that is not in the future.', 'date');
      if (date < candidate.appliedOn) return fail('Evidence cannot predate the application.', 'date');
      const note = (clean(data.note) || '').slice(0, 1000);

      const signal = {
        id: id('sig'),
        kind,
        competencyId,
        rating,
        interviewerId,
        date,
        note,
      };
      store.update(
        (draft) => {
          const target = (draft.candidates || []).find((c) => c.id === candidateId);
          if (!target) return;
          target.signals = Array.isArray(target.signals) ? target.signals : [];
          target.signals.push(signal);
          target.lastActivityOn = date > today() ? today() : date;
          target.updatedAt = stamp();
        },
        {
          type: 'candidate.evidence.recorded',
          entity: 'candidate',
          entityId: candidateId,
          summary: `Recorded ${EVIDENCE_KIND_LABELS[kind]} rated ${rating}/5 for ${candidate.name}`,
        },
      );
      const assessment = assessCandidate(
        { ...candidate, signals: [...(candidate.signals || []), signal] },
        requisition,
        { prior: store.state.settings.hiringBaseRate },
      );
      return { ok: true, id: signal.id, assessment };
    },

    deleteEvidence(candidateId, signalId) {
      const candidate = (store.state.candidates || []).find((c) => c.id === candidateId);
      if (!candidate) return fail('That candidate no longer exists.');
      const signal = (candidate.signals || []).find((s) => s.id === signalId);
      if (!signal) return fail('That evidence record no longer exists.');
      store.update(
        (draft) => {
          const target = (draft.candidates || []).find((c) => c.id === candidateId);
          if (!target) return;
          target.signals = (target.signals || []).filter((s) => s.id !== signalId);
          target.updatedAt = stamp();
        },
        {
          type: 'candidate.evidence.deleted',
          entity: 'candidate',
          entityId: candidateId,
          summary: `Removed a ${EVIDENCE_KIND_LABELS[signal.kind] || 'evidence'} record for ${candidate.name}`,
        },
      );
      return { ok: true };
    },

    decideCandidate(candidateId, data = {}) {
      const candidate = (store.state.candidates || []).find((c) => c.id === candidateId);
      if (!candidate) return fail('That candidate no longer exists.');
      if (!OPEN_CANDIDATE_STAGES.includes(candidate.stage)) {
        return fail('This candidate’s process is already closed. Use the audit history to see how it ended.');
      }
      const requisition = (store.state.requisitions || []).find((r) => r.id === candidate.reqId);
      if (!requisition) return fail('That requisition no longer exists.');

      const outcome = data.outcome;
      if (!CANDIDATE_OUTCOMES.includes(outcome)) return fail('Choose what happens to this candidate.', 'outcome');
      const rationale = (clean(data.rationale) || '').slice(0, 4000);
      if ((outcome === 'hire' || outcome === 'reject') && rationale.length < 10) {
        return fail('Write down the reasoning. A decision without a recorded rationale cannot be reviewed, explained, or learned from.', 'rationale');
      }

      const assessment = assessCandidate(candidate, requisition, { prior: store.state.settings.hiringBaseRate });
      if (outcome === 'hire') {
        if (!['final', 'offer'].includes(candidate.stage)) {
          return fail('Collect a final-round assessment before making an offer — the decision needs evidence from the last stage.', 'outcome');
        }
        if (assessment.blockers.length && data.acknowledgeGaps !== true) {
          return fail(`This hire is missing evidence: ${assessment.blockers.map((b) => b.message).join(' ')} Acknowledge the gap to proceed anyway (it is recorded).`, 'acknowledgeGaps');
        }
      }
      if (outcome === 'reject' && data.acknowledgeGaps !== true) {
        // A rejection carries the same evidential burden as an offer. If this
        // candidate was assessed on less than the role's promised competencies,
        // while others in the same process were not, the leader has to say so
        // out loud — and it is recorded either way.
        const parity = processParity(requisition, store.state.candidates || []);
        const thin = assessment.blockers.find((b) => b.code === 'thin-evidence' || b.code === 'required-uncovered');
        if (parity.measured && thin) {
          return fail(`This rejection rests on less evidence than the role's process promised: ${thin.message} Acknowledge the gap to record it anyway — the acknowledgement is stored with the decision.`, 'acknowledgeGaps');
        }
      }

      const nextStage = outcome === 'advance'
        ? nextCandidateStage(candidate.stage)
        : outcome === 'hire'
          ? 'offer'
          : outcome === 'reject'
            ? 'rejected'
            : outcome === 'withdraw'
              ? 'withdrawn'
              : candidate.stage;

      store.update(
        (draft) => {
          const target = (draft.candidates || []).find((c) => c.id === candidateId);
          if (!target) return;
          target.stage = nextStage;
          target.lastActivityOn = today();
          target.updatedAt = stamp();
          target.decision = {
            outcome,
            decidedOn: today(),
            rationale: rationale || target.decision.rationale,
            evidenceGapAcknowledged: data.acknowledgeGaps === true,
          };
          if (outcome === 'hire') {
            target.offerOn = target.offerOn || today();
            const req = (draft.requisitions || []).find((r) => r.id === candidate.reqId);
            if (req && req.status === 'open') req.status = 'offer';
          }
        },
        {
          type: 'candidate.decided',
          entity: 'candidate',
          entityId: candidateId,
          summary: `${CANDIDATE_OUTCOME_LABELS[outcome]} — ${candidate.name} (${nextStage})`,
        },
      );
      const escalations = maybeEscalateStalledHiring();
      return { ok: true, stage: nextStage, assessment, escalations };
    },

    /**
     * Offer accepted: the one action that turns a hiring decision into a
     * person, a 30-60-90 plan and a freed capacity reserve — no second entry.
     */
    acceptOffer(candidateId, data = {}) {
      const candidate = (store.state.candidates || []).find((c) => c.id === candidateId);
      if (!candidate) return fail('That candidate no longer exists.');
      if (candidate.stage !== 'offer') {
        return fail('Record the offer decision before accepting it, so the sequence stays auditable.', 'stage');
      }
      const requisition = (store.state.requisitions || []).find((r) => r.id === candidate.reqId);
      if (!requisition) return fail('That requisition no longer exists.');

      const startOn = data.startOn || requisition.targetStartOn || today();
      if (!isCalendarDay(startOn)) return fail('Choose a valid start date.', 'startOn');
      if (candidate.offerOn && startOn < candidate.offerOn) {
        return fail('The start date cannot be before the offer date.', 'startOn');
      }
      const roleTitle = (clean(data.roleTitle) || requisition.title).slice(0, 120);
      const level = LEVELS.includes(data.level) ? data.level : requisition.level;
      const team = (clean(data.team) || requisition.team || store.state.settings.teamName || '').slice(0, 80);
      const existingPerson = store.state.people.find((p) => p.id === candidate.personId) || null;
      if (!existingPerson && store.state.people.some((p) => p.name.trim().toLowerCase() === candidate.name.trim().toLowerCase())) {
        return fail('Someone with that name is already on the roster. Link the candidate to the existing person instead of creating a duplicate.', 'startOn');
      }

      const personId = existingPerson ? existingPerson.id : id('person');
      const planId = id('onb');
      let chain = [];

      store.update(
        (draft, { logEvent }) => {
          const target = (draft.candidates || []).find((c) => c.id === candidateId);
          if (!target) return;
          const req = (draft.requisitions || []).find((r) => r.id === candidate.reqId);

          if (!existingPerson) {
            draft.people.push({
              id: personId,
              name: candidate.name,
              role: roleTitle,
              level,
              team,
              managerId: null,
              startDate: startOn,
              focus: '',
              talkingPoints: [],
              status: 'active',
              createdAt: stamp(),
              archivedAt: null,
            });
          }
          target.personId = personId;
          target.stage = 'hired';
          target.hiredOn = today();
          target.offerAcceptedOn = today();
          target.startOn = startOn;
          target.lastActivityOn = today();
          target.updatedAt = stamp();
          target.decision = {
            ...target.decision,
            outcome: 'hire',
            decidedOn: target.decision.decidedOn || today(),
            rationale: target.decision.rationale || (clean(data.rationale) || ''),
          };

          if (req) {
            req.status = 'filled';
            req.closedOn = today();
            req.filledPersonId = personId;
            req.updatedAt = stamp();
          }

          // 30-60-90 scaffolding, anchored on the agreed start date. Skipped when
          // the new joiner already has an active plan (the one-plan invariant).
          const hasActivePlan = (draft.onboarding || []).some(
            (p) => p.personId === personId && p.status === 'active',
          );
          if (!hasActivePlan) {
            draft.onboarding = Array.isArray(draft.onboarding) ? draft.onboarding : [];
            draft.onboarding.push({
              id: planId,
              personId,
              kind: 'new-hire',
              label: '',
              startDate: startOn,
              buddyId: null,
              buddyName: '',
              roleClarity: '',
              earlyWin: '',
              stakeholders: [],
              checkpoints: starterCheckpointsForKind('new-hire', startOn).map((cp) => ({
                id: id('onbc'),
                horizon: cp.horizon,
                category: cp.category,
                title: cp.title,
                due: cp.due,
                done: false,
                completedOn: null,
                notes: '',
              })),
              reviews: { 30: null, 60: null, 90: null },
              status: 'active',
              completedOn: null,
              createdAt: stamp(),
              updatedAt: stamp(),
            });
          }

          const capacity = syncRequisitionCapacity(draft, req || requisition, {
            idFactory: id,
            todayStr: today(),
            nowIso: stamp(),
            logEvent,
          });
          if (capacity) chain.push({ ruleId: 'RULE-HIRE-01', ...capacity });
          chain.push(
            ...onCandidateHired(draft, candidateId, {
              idFactory: id,
              todayStr: today(),
              nowIso: stamp(),
              logEvent,
            }),
          );
        },
        {
          type: 'candidate.offer-accepted',
          entity: 'candidate',
          entityId: candidateId,
          summary: `${candidate.name} accepted the ${roleTitle} offer; starts ${startOn}`,
        },
      );

      const createdPlan = (store.state.onboarding || []).find((p) => p.id === planId) || null;
      return {
        ok: true,
        personId,
        onboardingId: createdPlan ? createdPlan.id : null,
        propagations: chain,
      };
    },

    /**
     * Repair pass for hiring, mirroring `syncCapacityPlan`: refreshes every
     * requisition's capacity reserve and raises any stalled role exactly once.
     * Safe to run repeatedly.
     */
    syncHiring() {
      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const changes = [];
          for (const req of draft.requisitions || []) {
            const change = syncRequisitionCapacity(draft, req, {
              idFactory: id,
              todayStr: today(),
              nowIso: stamp(),
              logEvent,
            });
            if (change) changes.push(change);
          }
          for (const candidate of draft.candidates || []) {
            if (candidate.stage !== 'hired') continue;
            changes.push(
              ...onCandidateHired(draft, candidate.id, {
                idFactory: id,
                todayStr: today(),
                nowIso: stamp(),
                logEvent,
              }),
            );
          }
          propagations = changes;
        },
        {
          type: 'hiring.synced',
          entity: 'requisition',
          summary: 'Reconciled hiring capacity reserves and hire handoffs',
        },
      );
      const escalations = maybeEscalateStalledHiring();
      return { ok: true, propagations, escalations };
    },

    escalateToCase({ sourceType, sourceId, ...overrides } = {}) {
      if (FORBIDDEN_LINK_TYPES.includes(sourceType)) {
        return fail('Confidential conflict records and anonymous pulses cannot be escalated into general operational cases.');
      }
      const existingOpenLink = (store.state.links || []).find((l) => {
        if (l.sourceType !== 'case' || l.targetType !== sourceType || l.targetId !== sourceId) return false;
        const linkedCase = (store.state.cases || []).find((c) => c.id === l.sourceId);
        return Boolean(linkedCase && isCaseOpen(linkedCase));
      });
      if (existingOpenLink) {
        return {
          ok: false,
          existingCaseId: existingOpenLink.sourceId,
          error: 'An open operational case is already linked to this record.',
        };
      }

      const built = buildCaseFromUpstreamEntity(store.state, {
        sourceType,
        sourceId,
        overrides,
        now: clock(),
      });
      if (!built.ok) return built;

      return api.addCase({
        ...built.payload,
        _upstreamLink: {
          sourceType,
          sourceId,
          summary: `Escalated from ${sourceType}`,
        },
      });
    },

    /* --------------------------------------------- org design & change */
    addChange(data = {}) {
      const title = (clean(data.title) || '').slice(0, 180);
      if (!title) return fail('Give the organizational change a clear title.', 'title');

      const kind = CHANGE_KINDS.includes(data.kind) ? data.kind : 'topology';
      const status = CHANGE_STATUSES.includes(data.status) ? data.status : 'proposed';
      const reversibility = data.reversibility === 'reversible' ? 'reversible' : 'irreversible';
      const ownerId = data.ownerId && personExists(data.ownerId) ? data.ownerId : null;
      const linkedGoalId = data.linkedGoalId && store.state.goals.some((g) => g.id === data.linkedGoalId)
        ? data.linkedGoalId
        : null;

      const openedOn = isCalendarDay(data.openedOn) ? data.openedOn : today();
      const targetOn = isCalendarDay(data.targetOn) ? data.targetOn : null;
      const reviewOn = isCalendarDay(data.reviewOn)
        ? data.reviewOn
        : addDays(openedOn, store.state.settings.changeReviewDays ?? 21);

      const kotterStage = KOTTER_STEPS.includes(data.kotterStage) ? data.kotterStage : 'urgency';
      const completedSteps = Array.isArray(data.completedSteps)
        ? KOTTER_STEPS.filter((k) => data.completedSteps.includes(k))
        : [];

      const optEffort = Math.max(0, Number(data.effortDays?.optimistic) || 0);
      const mlEffort = Math.max(0, Number(data.effortDays?.mostLikely) || 0);
      const pessEffort = Math.max(0, Number(data.effortDays?.pessimistic) || 0);
      if ((optEffort > 0 || mlEffort > 0 || pessEffort > 0) && (optEffort > mlEffort || mlEffort > pessEffort)) {
        return fail('Transition effort must follow Optimistic ≤ Most likely ≤ Pessimistic.', 'effortDays');
      }

      const forces = (Array.isArray(data.forces) ? data.forces : [])
        .map((f) => {
          const label = (clean(f?.label) || '').slice(0, 200);
          if (!label) return null;
          return {
            id: f.id || id('chgf'),
            side: f.side === 'restraining' ? 'restraining' : 'driving',
            label,
            weight: Math.min(5, Math.max(1, Math.round(Number(f.weight) || 3))),
            category: FORCE_CATEGORIES.includes(f.category) ? f.category : 'governance',
            mitigation: (clean(f.mitigation) || '').slice(0, 300),
            mitigated: Boolean(f.mitigated),
          };
        })
        .filter(Boolean);

      const coalition = (Array.isArray(data.coalition) ? data.coalition : [])
        .map((s) => {
          const personId = s?.personId && personExists(s.personId) ? s.personId : null;
          const person = personId ? store.state.people.find((p) => p.id === personId) : null;
          const name = (clean(s?.name) || person?.name || '').slice(0, 120);
          if (!name) return null;
          return {
            id: s.id || id('chgs'),
            personId,
            name,
            role: (clean(s?.role) || person?.role || '').slice(0, 120),
            power: Math.min(5, Math.max(1, Math.round(Number(s?.power) || 3))),
            interest: Math.min(5, Math.max(1, Math.round(Number(s?.interest) || 3))),
            stance: STAKEHOLDER_STANCES.includes(s?.stance) ? s.stance : 'neutral',
            vetoPlayer: Boolean(s?.vetoPlayer),
            keyMessage: (clean(s?.keyMessage) || '').slice(0, 300),
            lastBriefedOn: isCalendarDay(s?.lastBriefedOn) ? s.lastBriefedOn : null,
            nextBriefOn: isCalendarDay(s?.nextBriefOn) ? s.nextBriefOn : null,
          };
        })
        .filter(Boolean);

      const seenImpacts = new Set();
      const impacts = (Array.isArray(data.impacts) ? data.impacts : [])
        .map((imp) => {
          if (!imp?.personId || !personExists(imp.personId) || seenImpacts.has(imp.personId)) return null;
          seenImpacts.add(imp.personId);
          return {
            id: imp.id || id('chgi'),
            personId: imp.personId,
            impactKind: CHANGE_IMPACT_KINDS.includes(imp.impactKind) ? imp.impactKind : 'scope-shift',
            newRoleLabel: (clean(imp.newRoleLabel) || '').slice(0, 160),
            createTransitionPlan: Boolean(imp.createTransitionPlan),
          };
        })
        .filter(Boolean);

      const rawTopo = data.topology || {};
      const toIntOrNull = (v, min, max) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Math.min(max, Math.max(min, Math.round(Number(v)))));
      const topology = {
        teamName: (clean(rawTopo.teamName) || store.state.settings.teamName || '').slice(0, 120),
        currentType: TEAM_TOPOLOGY_TYPES.includes(rawTopo.currentType) ? rawTopo.currentType : 'complicated-subsystem',
        targetType: TEAM_TOPOLOGY_TYPES.includes(rawTopo.targetType) ? rawTopo.targetType : 'stream-aligned',
        interactionMode: TOPOLOGY_INTERACTION_MODES.includes(rawTopo.interactionMode) ? rawTopo.interactionMode : 'x-as-a-service',
        cognitiveLoadBefore: toIntOrNull(rawTopo.cognitiveLoadBefore, 1, 5),
        cognitiveLoadTarget: toIntOrNull(rawTopo.cognitiveLoadTarget, 1, 5),
        blockingHandoffsBefore: toIntOrNull(rawTopo.blockingHandoffsBefore, 0, 50),
        blockingHandoffsTarget: toIntOrNull(rawTopo.blockingHandoffsTarget, 0, 50),
        collaboratingTeamsCount: Math.min(20, Math.max(0, Math.round(Number(rawTopo.collaboratingTeamsCount) || 0))),
      };

      const rawStar = data.star || {};
      const star = {};
      for (const p of STAR_PILLARS) {
        star[p] = (clean(rawStar[p]) || '').slice(0, 600);
      }

      const rawEcon = data.economics || {};
      const economics = {
        currency: (clean(rawEcon.currency) || 'USD').toUpperCase().slice(0, 6),
        transitionCost: Math.max(0, Number(rawEcon.transitionCost) || 0),
        monthlyBenefit: {
          optimistic: Math.max(0, Number(rawEcon.monthlyBenefit?.optimistic) || 0),
          mostLikely: Math.max(0, Number(rawEcon.monthlyBenefit?.mostLikely) || 0),
          pessimistic: Math.max(0, Number(rawEcon.monthlyBenefit?.pessimistic) || 0),
        },
        horizonMonths: Math.min(60, Math.max(1, Math.round(Number(rawEcon.horizonMonths) || 12))),
      };

      const nowIso = stamp();
      const record = {
        id: id('chg'),
        title,
        kind,
        status,
        summary: (clean(data.summary) || '').slice(0, 2000),
        vision: (clean(data.vision) || '').slice(0, 2000),
        nonGoals: (clean(data.nonGoals) || '').slice(0, 1200),
        reversibility,
        ownerId,
        linkedGoalId,
        openedOn,
        targetOn,
        reviewOn,
        anchoredOn: status === 'anchored' ? (isCalendarDay(data.anchoredOn) ? data.anchoredOn : today()) : null,
        closedReason: (clean(data.closedReason) || '').slice(0, 1500),
        kotterStage,
        completedSteps,
        shortTermWins: [],
        topology,
        star,
        forces,
        coalition,
        impacts,
        metrics: [],
        effortDays: { optimistic: optEffort, mostLikely: mlEffort, pessimistic: pessEffort },
        economics,
        autoCreateDecision: data.autoCreateDecision !== false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          draft.changes = Array.isArray(draft.changes) ? draft.changes : [];
          draft.changes.push(record);
          if (data._originCaseId) {
            ensureEntityLink(
              draft,
              {
                sourceType: 'case',
                sourceId: data._originCaseId,
                targetType: 'change',
                targetId: record.id,
                relation: 'drives-change',
                ruleId: 'RULE-CHG-ESC',
                summary: `Systemic redesign spawned from case`,
              },
              { idFactory: id, todayStr: today(), nowIso },
            );
          }
          if (data.autoPropagate !== false) {
            propagations = propagateChangeEvent(draft, record, {
              now: clock(),
              idFactory: id,
              logEvent,
            });
          }
        },
        {
          type: 'change.created',
          entity: 'change',
          entityId: record.id,
          summary: `Opened ${CHANGE_KIND_LABELS[kind].toLowerCase()}: “${title}” (${CHANGE_STATUS_LABELS[status]})`,
        },
      );
      return { ok: true, id: record.id, propagations };
    },

    updateChange(changeId, patch = {}) {
      const current = (store.state.changes || []).find((c) => c.id === changeId);
      if (!current) return fail('That organizational change no longer exists.');

      const title = patch.title !== undefined ? (clean(patch.title) || '').slice(0, 180) : current.title;
      if (!title) return fail('Give the organizational change a clear title.', 'title');

      const nextEffort = patch.effortDays !== undefined
        ? {
            optimistic: Math.max(0, Number(patch.effortDays?.optimistic) || 0),
            mostLikely: Math.max(0, Number(patch.effortDays?.mostLikely) || 0),
            pessimistic: Math.max(0, Number(patch.effortDays?.pessimistic) || 0),
          }
        : current.effortDays;
      if (
        (nextEffort.optimistic > 0 || nextEffort.mostLikely > 0 || nextEffort.pessimistic > 0) &&
        (nextEffort.optimistic > nextEffort.mostLikely || nextEffort.mostLikely > nextEffort.pessimistic)
      ) {
        return fail('Transition effort must follow Optimistic ≤ Most likely ≤ Pessimistic.', 'effortDays');
      }

      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.changes || []).find((c) => c.id === changeId);
          if (!target) return;
          target.title = title;
          if (patch.kind !== undefined && CHANGE_KINDS.includes(patch.kind)) target.kind = patch.kind;
          if (patch.status !== undefined && CHANGE_STATUSES.includes(patch.status)) {
            target.status = patch.status;
            if (patch.status === 'anchored' && !target.anchoredOn) target.anchoredOn = today();
          }
          if (patch.summary !== undefined) target.summary = (clean(patch.summary) || '').slice(0, 2000);
          if (patch.vision !== undefined) target.vision = (clean(patch.vision) || '').slice(0, 2000);
          if (patch.nonGoals !== undefined) target.nonGoals = (clean(patch.nonGoals) || '').slice(0, 1200);
          if (patch.reversibility !== undefined) {
            target.reversibility = patch.reversibility === 'reversible' ? 'reversible' : 'irreversible';
          }
          if (patch.ownerId !== undefined) {
            target.ownerId = patch.ownerId && personExists(patch.ownerId) ? patch.ownerId : null;
          }
          if (patch.linkedGoalId !== undefined) {
            target.linkedGoalId = patch.linkedGoalId && draft.goals.some((g) => g.id === patch.linkedGoalId)
              ? patch.linkedGoalId
              : null;
          }
          if (patch.openedOn !== undefined && isCalendarDay(patch.openedOn)) target.openedOn = patch.openedOn;
          if (patch.targetOn !== undefined) target.targetOn = isCalendarDay(patch.targetOn) ? patch.targetOn : null;
          if (patch.reviewOn !== undefined) target.reviewOn = isCalendarDay(patch.reviewOn) ? patch.reviewOn : null;
          if (patch.closedReason !== undefined) target.closedReason = (clean(patch.closedReason) || '').slice(0, 1500);
          if (patch.kotterStage !== undefined && KOTTER_STEPS.includes(patch.kotterStage)) {
            target.kotterStage = patch.kotterStage;
          }
          if (Array.isArray(patch.completedSteps)) {
            target.completedSteps = KOTTER_STEPS.filter((k) => patch.completedSteps.includes(k));
          }
          if (patch.effortDays !== undefined) target.effortDays = nextEffort;
          if (patch.autoCreateDecision !== undefined) {
            target.autoCreateDecision = patch.autoCreateDecision !== false;
          }

          if (patch.topology !== undefined && typeof patch.topology === 'object') {
            const rt = patch.topology;
            const toIntOrNull = (v, min, max) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Math.min(max, Math.max(min, Math.round(Number(v)))));
            target.topology = {
              teamName: rt.teamName !== undefined ? (clean(rt.teamName) || '').slice(0, 120) : target.topology.teamName,
              currentType: TEAM_TOPOLOGY_TYPES.includes(rt.currentType) ? rt.currentType : target.topology.currentType,
              targetType: TEAM_TOPOLOGY_TYPES.includes(rt.targetType) ? rt.targetType : target.topology.targetType,
              interactionMode: TOPOLOGY_INTERACTION_MODES.includes(rt.interactionMode) ? rt.interactionMode : target.topology.interactionMode,
              cognitiveLoadBefore: rt.cognitiveLoadBefore !== undefined ? toIntOrNull(rt.cognitiveLoadBefore, 1, 5) : target.topology.cognitiveLoadBefore,
              cognitiveLoadTarget: rt.cognitiveLoadTarget !== undefined ? toIntOrNull(rt.cognitiveLoadTarget, 1, 5) : target.topology.cognitiveLoadTarget,
              blockingHandoffsBefore: rt.blockingHandoffsBefore !== undefined ? toIntOrNull(rt.blockingHandoffsBefore, 0, 50) : target.topology.blockingHandoffsBefore,
              blockingHandoffsTarget: rt.blockingHandoffsTarget !== undefined ? toIntOrNull(rt.blockingHandoffsTarget, 0, 50) : target.topology.blockingHandoffsTarget,
              collaboratingTeamsCount: rt.collaboratingTeamsCount !== undefined
                ? Math.min(20, Math.max(0, Math.round(Number(rt.collaboratingTeamsCount) || 0)))
                : target.topology.collaboratingTeamsCount,
            };
          }

          if (patch.star !== undefined && typeof patch.star === 'object') {
            const rs = patch.star;
            for (const p of STAR_PILLARS) {
              if (rs[p] !== undefined) target.star[p] = (clean(rs[p]) || '').slice(0, 600);
            }
          }

          if (patch.economics !== undefined && typeof patch.economics === 'object') {
            const re = patch.economics;
            target.economics = {
              currency: re.currency !== undefined ? (clean(re.currency) || 'USD').toUpperCase().slice(0, 6) : target.economics.currency,
              transitionCost: re.transitionCost !== undefined ? Math.max(0, Number(re.transitionCost) || 0) : target.economics.transitionCost,
              monthlyBenefit: re.monthlyBenefit !== undefined
                ? {
                    optimistic: Math.max(0, Number(re.monthlyBenefit?.optimistic) || 0),
                    mostLikely: Math.max(0, Number(re.monthlyBenefit?.mostLikely) || 0),
                    pessimistic: Math.max(0, Number(re.monthlyBenefit?.pessimistic) || 0),
                  }
                : target.economics.monthlyBenefit,
              horizonMonths: re.horizonMonths !== undefined
                ? Math.min(60, Math.max(1, Math.round(Number(re.horizonMonths) || 12)))
                : target.economics.horizonMonths,
            };
          }

          if (Array.isArray(patch.forces)) {
            target.forces = patch.forces
              .map((f) => {
                const label = (clean(f?.label) || '').slice(0, 200);
                if (!label) return null;
                return {
                  id: f.id || id('chgf'),
                  side: f.side === 'restraining' ? 'restraining' : 'driving',
                  label,
                  weight: Math.min(5, Math.max(1, Math.round(Number(f.weight) || 3))),
                  category: FORCE_CATEGORIES.includes(f.category) ? f.category : 'governance',
                  mitigation: (clean(f.mitigation) || '').slice(0, 300),
                  mitigated: Boolean(f.mitigated),
                };
              })
              .filter(Boolean);
          }

          if (Array.isArray(patch.coalition)) {
            target.coalition = patch.coalition
              .map((s) => {
                const pid = s?.personId && personExists(s.personId) ? s.personId : null;
                const person = pid ? draft.people.find((p) => p.id === pid) : null;
                const name = (clean(s?.name) || person?.name || '').slice(0, 120);
                if (!name) return null;
                return {
                  id: s.id || id('chgs'),
                  personId: pid,
                  name,
                  role: (clean(s?.role) || person?.role || '').slice(0, 120),
                  power: Math.min(5, Math.max(1, Math.round(Number(s?.power) || 3))),
                  interest: Math.min(5, Math.max(1, Math.round(Number(s?.interest) || 3))),
                  stance: STAKEHOLDER_STANCES.includes(s?.stance) ? s.stance : 'neutral',
                  vetoPlayer: Boolean(s?.vetoPlayer),
                  keyMessage: (clean(s?.keyMessage) || '').slice(0, 300),
                  lastBriefedOn: isCalendarDay(s?.lastBriefedOn) ? s.lastBriefedOn : null,
                  nextBriefOn: isCalendarDay(s?.nextBriefOn) ? s.nextBriefOn : null,
                };
              })
              .filter(Boolean);
          }

          if (Array.isArray(patch.impacts)) {
            const seen = new Set();
            target.impacts = patch.impacts
              .map((imp) => {
                if (!imp?.personId || !personExists(imp.personId) || seen.has(imp.personId)) return null;
                seen.add(imp.personId);
                return {
                  id: imp.id || id('chgi'),
                  personId: imp.personId,
                  impactKind: CHANGE_IMPACT_KINDS.includes(imp.impactKind) ? imp.impactKind : 'scope-shift',
                  newRoleLabel: (clean(imp.newRoleLabel) || '').slice(0, 160),
                  createTransitionPlan: Boolean(imp.createTransitionPlan),
                };
              })
              .filter(Boolean);
          }

          target.updatedAt = stamp();
          propagations = propagateChangeStatus(draft, target, {
            now: clock(),
            idFactory: id,
            logEvent,
          });
        },
        {
          type: 'change.updated',
          entity: 'change',
          entityId: changeId,
          summary: `Updated organizational change “${title}”`,
        },
      );
      return { ok: true, propagations };
    },

    setChangeStatus(changeId, data = {}) {
      const current = (store.state.changes || []).find((c) => c.id === changeId);
      if (!current) return fail('That organizational change no longer exists.');
      const status = data.status;
      if (!CHANGE_STATUSES.includes(status)) return fail('Choose a valid lifecycle status.', 'status');
      const closedReason = (clean(data.closedReason) || '').slice(0, 600);
      if ((status === 'anchored' || status === 'abandoned') && closedReason.length < 6) {
        return fail('Record a brief anchoring or closure note so future leaders know why this change closed.', 'closedReason');
      }

      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.changes || []).find((c) => c.id === changeId);
          if (!target) return;
          target.status = status;
          if (status === 'anchored') {
            target.anchoredOn = isCalendarDay(data.anchoredOn) ? data.anchoredOn : today();
            target.kotterStage = 'anchor';
            if (!target.completedSteps.includes('anchor')) {
              target.completedSteps.push('anchor');
            }
          } else {
            target.anchoredOn = null;
          }
          if (closedReason) target.closedReason = closedReason;
          target.updatedAt = stamp();
          propagations = propagateChangeStatus(draft, target, {
            now: clock(),
            idFactory: id,
            logEvent,
          });
        },
        {
          type: 'change.statusChanged',
          entity: 'change',
          entityId: changeId,
          summary: `Change “${current.title}” → ${CHANGE_STATUS_LABELS[status]}`,
        },
      );
      return { ok: true, propagations };
    },

    toggleKotterStep(changeId, stepKey, { setAsCurrent = false } = {}) {
      const current = (store.state.changes || []).find((c) => c.id === changeId);
      if (!current) return fail('That organizational change no longer exists.');
      if (!KOTTER_STEPS.includes(stepKey)) return fail('Choose a valid Kotter step.', 'stepKey');

      store.update(
        (draft) => {
          const target = (draft.changes || []).find((c) => c.id === changeId);
          if (!target) return;
          if (setAsCurrent) {
            target.kotterStage = stepKey;
          } else if (target.completedSteps.includes(stepKey)) {
            target.completedSteps = target.completedSteps.filter((k) => k !== stepKey);
          } else {
            target.completedSteps = KOTTER_STEPS.filter((k) => k === stepKey || target.completedSteps.includes(k));
          }
          target.updatedAt = stamp();
        },
        {
          type: 'change.stepUpdated',
          entity: 'change',
          entityId: changeId,
          summary: setAsCurrent
            ? `Set Kotter focus to ${stepKey} on “${current.title}”`
            : `Updated Kotter step ${stepKey} on “${current.title}”`,
        },
      );
      return { ok: true };
    },

    toggleChangeForceMitigated(changeId, forceId, mitigation = undefined) {
      const current = (store.state.changes || []).find((c) => c.id === changeId);
      if (!current) return fail('That organizational change no longer exists.');
      const force = (current.forces || []).find((f) => f.id === forceId);
      if (!force) return fail('That force-field item no longer exists.');

      store.update(
        (draft) => {
          const target = (draft.changes || []).find((c) => c.id === changeId);
          const tf = (target?.forces || []).find((f) => f.id === forceId);
          if (!tf) return;
          tf.mitigated = !tf.mitigated;
          if (mitigation !== undefined) tf.mitigation = (clean(mitigation) || '').slice(0, 300);
          target.updatedAt = stamp();
        },
        {
          type: 'change.forceUpdated',
          entity: 'change',
          entityId: changeId,
          summary: `${force.mitigated ? 'Reopened' : 'Mitigated'} force “${force.label}” on “${current.title}”`,
        },
      );
      return { ok: true };
    },

    recordCoalitionBrief(changeId, stakeholderId, data = {}) {
      const current = (store.state.changes || []).find((c) => c.id === changeId);
      if (!current) return fail('That organizational change no longer exists.');
      const stk = (current.coalition || []).find((s) => s.id === stakeholderId);
      if (!stk) return fail('That coalition stakeholder no longer exists.');
      const briefedOn = isCalendarDay(data.date) ? data.date : today();
      if (briefedOn > today()) return fail('A coalition briefing cannot be recorded in the future.', 'date');

      store.update(
        (draft) => {
          const target = (draft.changes || []).find((c) => c.id === changeId);
          const ts = (target?.coalition || []).find((s) => s.id === stakeholderId);
          if (!ts) return;
          ts.lastBriefedOn = briefedOn;
          if (data.stance && STAKEHOLDER_STANCES.includes(data.stance)) ts.stance = data.stance;
          if (data.keyMessage !== undefined) ts.keyMessage = (clean(data.keyMessage) || '').slice(0, 300);
          ts.nextBriefOn = isCalendarDay(data.nextBriefOn)
            ? data.nextBriefOn
            : addDays(briefedOn, ts.vetoPlayer ? 7 : 14);
          target.updatedAt = stamp();
        },
        {
          type: 'change.coalitionBriefed',
          entity: 'change',
          entityId: changeId,
          summary: `Briefed ${stk.name} on “${current.title}”`,
        },
      );
      return { ok: true };
    },

    addChangeWin(changeId, data = {}) {
      const current = (store.state.changes || []).find((c) => c.id === changeId);
      if (!current) return fail('That organizational change no longer exists.');
      const text = (clean(data.text ?? data.title) || '').slice(0, 300);
      if (!text) return fail('Describe the short-term win.', 'text');
      const achievedOn = isCalendarDay(data.achievedOn || data.date) ? (data.achievedOn || data.date) : today();
      if (achievedOn > today()) return fail('A short-term win cannot be dated in the future.', 'achievedOn');
      const win = {
        id: id('cwin'),
        text,
        achievedOn,
        verified: data.verified !== false,
      };
      store.update(
        (draft) => {
          const target = (draft.changes || []).find((c) => c.id === changeId);
          if (!target) return;
          target.shortTermWins = Array.isArray(target.shortTermWins) ? target.shortTermWins : [];
          target.shortTermWins.push(win);
          if (!target.completedSteps.includes('short-wins')) target.completedSteps.push('short-wins');
          target.updatedAt = stamp();
        },
        {
          type: 'change.winRecorded',
          entity: 'change',
          entityId: changeId,
          summary: `Recorded short-term win “${text}” on “${current.title}”`,
        },
      );
      return { ok: true, id: win.id };
    },

    deleteChangeWin(changeId, winId) {
      const current = (store.state.changes || []).find((c) => c.id === changeId);
      if (!current) return fail('That organizational change no longer exists.');
      store.update(
        (draft) => {
          const target = (draft.changes || []).find((c) => c.id === changeId);
          if (!target) return;
          target.shortTermWins = (target.shortTermWins || []).filter((w) => w.id !== winId);
          target.updatedAt = stamp();
        },
        {
          type: 'change.winDeleted',
          entity: 'change',
          entityId: changeId,
          summary: `Removed a short-term win on “${current.title}”`,
        },
      );
      return { ok: true };
    },

    addChangeMetric(changeId, data = {}) {
      const current = (store.state.changes || []).find((c) => c.id === changeId);
      if (!current) return fail('That organizational change no longer exists.');
      const name = (clean(data.name) || '').slice(0, 120);
      if (!name) return fail('Give the process metric a clear name.', 'name');
      const dir = (data.desirableDirection || data.direction) === 'higher' ? 'higher' : 'lower';

      const rawObs = Array.isArray(data.observations) ? data.observations : (Array.isArray(data.points) ? data.points : []);
      const observations = rawObs
        .map((pt) => {
          if (!isCalendarDay(pt?.date) || pt.date > today()) return null;
          const val = Number(pt?.value);
          if (!Number.isFinite(val)) return null;
          return {
            id: pt.id || id('cobs'),
            date: pt.date,
            value: Math.round(val * 100) / 100,
            phase: pt.phase === 'post' ? 'post' : 'baseline',
            note: (clean(pt.note) || '').slice(0, 300),
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.date.localeCompare(b.date));

      const metric = {
        id: id('cmet'),
        name,
        unit: (clean(data.unit) || '').slice(0, 32),
        desirableDirection: dir,
        observations,
      };
      store.update(
        (draft) => {
          const target = (draft.changes || []).find((c) => c.id === changeId);
          if (!target) return;
          target.metrics = Array.isArray(target.metrics) ? target.metrics : [];
          target.metrics.push(metric);
          target.updatedAt = stamp();
        },
        {
          type: 'change.metricAdded',
          entity: 'change',
          entityId: changeId,
          summary: `Added SPC metric “${name}” to “${current.title}”`,
        },
      );
      return { ok: true, id: metric.id };
    },

    recordChangeMetricPoint(changeId, metricId, data = {}) {
      const current = (store.state.changes || []).find((c) => c.id === changeId);
      if (!current) return fail('That organizational change no longer exists.');
      const metric = (current.metrics || []).find((m) => m.id === metricId);
      if (!metric) return fail('That process metric no longer exists.');
      const date = isCalendarDay(data.date) ? data.date : today();
      if (date > today()) return fail('Metric observations cannot be recorded in the future.', 'date');
      const value = Number(data.value);
      if (data.value === '' || data.value === null || data.value === undefined || !Number.isFinite(value)) {
        return fail('Enter a valid numeric observation.', 'value');
      }

      const pt = {
        id: id('cobs'),
        date,
        value: Math.round(value * 100) / 100,
        phase: data.phase === 'baseline' ? 'baseline' : data.phase === 'post' ? 'post' : (date < current.openedOn ? 'baseline' : 'post'),
        note: (clean(data.note) || '').slice(0, 300),
      };
      store.update(
        (draft) => {
          const target = (draft.changes || []).find((c) => c.id === changeId);
          const tm = (target?.metrics || []).find((m) => m.id === metricId);
          if (!tm) return;
          tm.observations = Array.isArray(tm.observations) ? tm.observations : [];
          tm.observations.push(pt);
          tm.observations.sort((a, b) => a.date.localeCompare(b.date));
          target.updatedAt = stamp();
        },
        {
          type: 'change.metricPointRecorded',
          entity: 'change',
          entityId: changeId,
          summary: `Recorded ${pt.value}${metric.unit ? ` ${metric.unit}` : ''} (${pt.phase}) on “${metric.name}” (${current.title})`,
        },
      );
      return { ok: true, id: pt.id };
    },

    deleteChangeMetric(changeId, metricId) {
      const current = (store.state.changes || []).find((c) => c.id === changeId);
      if (!current) return fail('That organizational change no longer exists.');
      store.update(
        (draft) => {
          const target = (draft.changes || []).find((c) => c.id === changeId);
          if (!target) return;
          target.metrics = (target.metrics || []).filter((m) => m.id !== metricId);
          target.updatedAt = stamp();
        },
        {
          type: 'change.metricDeleted',
          entity: 'change',
          entityId: changeId,
          summary: `Removed a process metric from “${current.title}”`,
        },
      );
      return { ok: true };
    },

    escalateForceToCase(changeId, forceId) {
      const built = buildCaseFromRestrainingForce(store.state, {
        changeId,
        forceId,
        now: clock(),
      });
      if (!built.ok) return built;
      return api.addCase({
        ...built.payload,
        _upstreamLink: {
          sourceType: 'change',
          sourceId: changeId,
          summary: 'Escalated from restraining force',
        },
      });
    },

    promoteCaseToChange(caseId, overrides = {}) {
      const existingLink = (store.state.links || []).find(
        (l) =>
          (l.sourceType === 'case' && l.sourceId === caseId && l.targetType === 'change') ||
          (l.sourceType === 'change' && l.targetType === 'case' && l.targetId === caseId),
      );
      if (existingLink) {
        const changeId = existingLink.sourceType === 'change' ? existingLink.sourceId : existingLink.targetId;
        const existingChange = (store.state.changes || []).find((c) => c.id === changeId);
        if (existingChange && ['proposed', 'active', 'stabilising'].includes(existingChange.status)) {
          return {
            ok: false,
            existingChangeId: existingChange.id,
            error: 'An open organizational change is already linked to this case.',
          };
        }
      }
      const built = buildChangeFromCase(store.state, { caseId, now: clock() });
      if (!built.ok) return built;
      return api.addChange({
        ...built.payload,
        ...overrides,
        _originCaseId: caseId,
      });
    },

    syncChanges() {
      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const out = [];
          for (const chg of draft.changes || []) {
            out.push(
              ...propagateChangeStatus(draft, chg, {
                now: clock(),
                idFactory: id,
                logEvent,
              }),
            );
          }
          propagations = out;
        },
        {
          type: 'changes.synced',
          entity: 'change',
          summary: 'Reconciled organizational change capacity reserves, governance links, and role transitions',
        },
      );
      return { ok: true, propagations };
    },

    deleteChange(changeId) {
      const current = (store.state.changes || []).find((c) => c.id === changeId);
      if (!current) return fail('That organizational change no longer exists.');
      store.update(
        (draft) => {
          draft.changes = (draft.changes || []).filter((c) => c.id !== changeId);
          draft.portfolio = (draft.portfolio || []).filter(
            (p) => !(p.sourceType === 'change' && p.sourceId === changeId),
          );
          draft.links = (draft.links || []).filter(
            (l) => l && !(l.sourceType === 'change' && l.sourceId === changeId) && !(l.targetType === 'change' && l.targetId === changeId),
          );
        },
        {
          type: 'change.deleted',
          entity: 'change',
          entityId: changeId,
          summary: `Deleted organizational change “${current.title}”`,
        },
      );
      return { ok: true };
    },

    /* ----------------------------------------------------------- scenarios */
    recordScenarioDecision(data = {}) {
      const scenarioSpec = data.scenarioSpec;
      if (!scenarioSpec || typeof scenarioSpec !== 'object') {
        return fail('Provide a counterfactual scenario specification to record.');
      }
      const scenarioName = clean(scenarioSpec.name) || 'Counterfactual scenario';
      const commitLevers = Boolean(data.commitLevers);
      if (commitLevers && countScenarioLevers(scenarioSpec) === 0) {
        return fail('Configure at least one counterfactual lever before committing a scenario to the live workspace.');
      }

      const date = data.date || today();
      if (!isCalendarDay(date)) return fail('Choose a valid decision date.', 'date');
      const defaultReviewDays = store.state.settings?.decisionReviewDays ?? 14;
      const reviewOn = data.reviewOn !== undefined
        ? (data.reviewOn ? String(data.reviewOn).trim() : null)
        : addDays(date, defaultReviewDays);
      if (reviewOn && !isCalendarDay(reviewOn)) {
        return fail('Choose a valid review date, or leave it blank.', 'reviewOn');
      }
      if (reviewOn && reviewOn < date) {
        return fail('The review date cannot be before the decision date.', 'reviewOn');
      }

      const peerSpecs = Array.isArray(data.peerScenarios)
        ? data.peerScenarios.filter((p) => p && typeof p === 'object' && p.id !== scenarioSpec.id).slice(0, 4)
        : [];
      const cmp = compareScenarios(
        store.state,
        [{ ...scenarioSpec, id: scenarioSpec.id || 'chosen-scenario', name: scenarioName }, ...peerSpecs],
        { now: clock() },
      );
      const baseRow = cmp.baseline;
      const chosenRow = cmp.scenarios[1];
      const peerRows = cmp.scenarios.slice(2);

      const describeOption = (row) => {
        const overPct = Math.round((row.monteCarlo.overloadProbability ?? 0) * 100);
        const p80Label = row.monteCarlo.effectiveP80Date || `${row.monteCarlo.effectiveP80Days}d`;
        const frontierTag = row.paretoOptimal ? 'Pareto-optimal' : `Dominated by ${row.dominatedBy[0]?.name || 'peer'}`;
        return {
          id: id('dopt'),
          label: `${row.name} (${overPct}% overload odds · P80 ${p80Label})`.slice(0, 180),
          pros: [
            frontierTag,
            `${row.capacity.committedDays}d committed vs ${row.capacity.allocatableDays}d allocatable (${row.capacity.slackDays >= 0 ? '+' : ''}${row.capacity.slackDays}d slack)`,
            row.economics.measured
              ? `Risk-adjusted net ${row.economics.currency} ${row.economics.netRiskAdjustedValue.toLocaleString('en-US')}`
              : null,
          ].filter(Boolean).join('; ').slice(0, 500),
          cons: [
            row.appliedLevers.length
              ? row.appliedLevers.slice(0, 3).map((l) => l.summary).join(' · ')
              : 'Holds current live commitments without relief',
            row.brooksLawTrap ? 'Brooks’s Law warning: near-term mentoring drag exceeds month-1 ramp supply' : null,
          ].filter(Boolean).join('; ').slice(0, 500),
        };
      };

      const chosenOption = describeOption(chosenRow);
      const options = [
        describeOption(baseRow),
        chosenOption,
        ...peerRows.map((r) => describeOption(r)),
      ];

      const crnSummary = [
        `Common-Random-Numbers simulation (seed ${cmp.seed}, ${cmp.trials} trials):`,
        `Overload odds ${Math.round(baseRow.monteCarlo.overloadProbability * 100)}% → ${Math.round(chosenRow.monteCarlo.overloadProbability * 100)}% (${chosenRow.deltas.overloadProbability <= 0 ? '' : '+'}${Math.round(chosenRow.deltas.overloadProbability * 100)}pp);`,
        `Effective P80 finish ${baseRow.monteCarlo.effectiveP80Date || `${baseRow.monteCarlo.effectiveP80Days}d`} → ${chosenRow.monteCarlo.effectiveP80Date || `${chosenRow.monteCarlo.effectiveP80Days}d`} (${chosenRow.deltas.effectiveP80Days <= 0 ? '' : '+'}${chosenRow.deltas.effectiveP80Days}d);`,
        chosenRow.economics.measured
          ? `Net risk-adjusted value delta ${chosenRow.deltas.netRiskAdjustedValue >= 0 ? '+' : ''}${chosenRow.economics.currency} ${chosenRow.deltas.netRiskAdjustedValue.toLocaleString('en-US')}.`
          : null,
      ].filter(Boolean).join(' ');

      const userRationale = clean(data.rationale) || '';
      const leader = clean(store.state.settings?.leaderName) || '';
      // Schema v21: the scenario's CRN overload odds are a stated probability
      // that the plan fails to fit — its complement is the model's forecast
      // that this call works out. Recording it structurally (not just in the
      // rationale prose) makes the Session 30 prediction scoreable at review
      // like any other decision forecast. A user-supplied forecast wins.
      const scenarioForecast = data.forecastProbability !== undefined
        ? readForecast(data.forecastProbability)
        : { ok: true, value: normalizeForecastPercent(100 - (chosenRow.monteCarlo.overloadProbability ?? 0) * 100) };
      if (!scenarioForecast.ok) return scenarioForecast;
      const title = (clean(data.title) || `${commitLevers ? 'Committed scenario' : 'Scenario trade-off'}: ${scenarioName}`).slice(0, 180);

      const decision = {
        ...append(null, 'dec'),
        title,
        question: (
          clean(data.question) ||
          `Evaluated counterfactual scenario “${scenarioName}” (${chosenRow.appliedLevers.length} lever(s)) against Live Baseline in What-If Sandbox.`
        ).slice(0, 2000),
        date,
        reversibility: data.reversibility === 'irreversible' ? 'irreversible' : 'reversible',
        driver: clean(data.driver) || leader,
        approver: clean(data.approver) || leader,
        contributors: clean(data.contributors) || chosenRow.appliedLevers.map((l) => l.summary).join('; ').slice(0, 300),
        informed: clean(data.informed) || '',
        options,
        chosen: chosenOption.label,
        rationale: [userRationale, crnSummary].filter(Boolean).join(' — ').slice(0, 2000),
        reviewOn,
        reviewedOn: null,
        outcome: 'pending',
        outcomeNotes: '',
        forecastProbability: scenarioForecast.value,
      };

      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
          draft.decisions.push(decision);
          propagations = propagateScenarioCommitment(draft, {
            decisionId: decision.id,
            scenarioSpec,
            commitLevers,
            now: clock(),
            idFactory: id,
            logEvent,
          });
        },
        {
          type: commitLevers ? 'scenario.committed' : 'scenario.decided',
          entity: 'decision',
          entityId: decision.id,
          summary: `${commitLevers ? 'Committed scenario levers & logged DACI decision' : 'Recorded scenario DACI decision'}: ${scenarioName.slice(0, 60)}`,
        },
      );

      return {
        ok: true,
        id: decision.id,
        committed: commitLevers,
        propagations,
        comparison: cmp,
      };
    },

    commitScenarioLevers(data = {}) {
      return api.recordScenarioDecision({ ...data, commitLevers: true });
    },

    /* ------------------------------------- stakeholder influence register (v25) */

    addStakeholder(data = {}) {
      const built = assembleStakeholder(data, null);
      if (!built.ok) return built;
      const record = built.record;
      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          draft.stakeholders = Array.isArray(draft.stakeholders) ? draft.stakeholders : [];
          draft.stakeholders.push(record);
          propagations = propagateStakeholderEvent(draft, record, {
            now: clock(),
            idFactory: id,
            logEvent,
          });
        },
        {
          type: 'stakeholder.created',
          entity: 'stakeholder',
          entityId: record.id,
          summary: `Stakeholder registered: ${record.name.slice(0, 70)}`,
        },
      );
      return { ok: true, id: record.id, propagations };
    },

    updateStakeholder(stakeholderId, patch = {}) {
      const existing = (store.state.stakeholders || []).find((s) => s.id === stakeholderId);
      if (!existing) return fail('That stakeholder no longer exists.');
      const merged = { ...existing, ...patch, id: existing.id };
      const built = assembleStakeholder(merged, existing);
      if (!built.ok) return built;
      const record = built.record;
      let propagations = [];
      const stanceChanged = patch.stance !== undefined && patch.stance !== existing.stance &&
        STAKEHOLDER_STANCES.includes(patch.stance);
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.stakeholders || []).find((s) => s.id === stakeholderId);
          if (!target) return;
          if (stanceChanged) {
            const entry = {
              id: id('stkhist'),
              on: today(),
              stance: patch.stance,
              context: 'Register updated',
              sourceType: null,
              sourceId: null,
            };
            record.stanceHistory = [...(record.stanceHistory || []), entry];
            propagations.push(
              ...propagateStakeholderStanceShift(draft, record, existing.stance, entry, {
                now: clock(),
                idFactory: id,
                logEvent,
              }),
            );
          }
          const index = (draft.stakeholders || []).findIndex((s) => s.id === stakeholderId);
          draft.stakeholders[index] = record;
          propagations.push(
            ...propagateStakeholderEvent(draft, record, { now: clock(), idFactory: id, logEvent }),
          );
        },
        {
          type: 'stakeholder.updated',
          entity: 'stakeholder',
          entityId: stakeholderId,
          summary: `Stakeholder updated: ${record.name.slice(0, 70)}`,
        },
      );
      return { ok: true, id: record.id, propagations };
    },

    /**
     * Append an explicit, evidence-bearing stance entry. The register stance
     * moves with it; an adverse shift on a high-salience internal stakeholder
     * runs RULE-STK-03 in the same transaction.
     */
    logStakeholderStance(stakeholderId, data = {}) {
      const existing = (store.state.stakeholders || []).find((s) => s.id === stakeholderId);
      if (!existing) return fail('That stakeholder no longer exists.');
      if (!STAKEHOLDER_STANCES.includes(data.stance)) return fail('Choose a valid stance.', 'stance');
      const prevStance = existing.stance;
      if (data.stance === prevStance && !String(data.context || '').trim()) {
        return fail('That stance is already recorded — add context or choose a different stance.');
      }
      const sourceType =
        data.sourceType && ['case', 'change', 'negotiation'].includes(data.sourceType)
          ? data.sourceType
          : null;
      const entry = {
        id: id('stkhist'),
        on: isCalendarDay(data.on) ? data.on : today(),
        stance: data.stance,
        context: String(data.context || '').trim().slice(0, 600),
        sourceType,
        sourceId: sourceType ? clean(data.sourceId) || null : null,
      };
      let propagations = [];
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.stakeholders || []).find((s) => s.id === stakeholderId);
          if (!target) return;
          target.stanceHistory = [...(target.stanceHistory || []), entry]
            .sort((a, b) => String(a.on).localeCompare(String(b.on)))
            .slice(-50);
          target.stance = entry.stance;
          target.updatedAt = stamp();
          propagations = propagateStakeholderStanceShift(draft, target, prevStance, entry, {
            now: clock(),
            idFactory: id,
            logEvent,
          });
        },
        {
          type: 'stakeholder.stanceLogged',
          entity: 'stakeholder',
          entityId: stakeholderId,
          summary: `Stance for ${existing.name.slice(0, 60)} recorded as ${entry.stance}`,
        },
      );
      const shift = classifyStanceShift(prevStance, entry.stance);
      return { ok: true, id: entry.id, shift: shift.id, adverse: shift.adverse, propagations };
    },

    /**
     * Record a contact and, when a cadence is set, propose the next contact
     * date from that cadence. A future or missing next date is never
     * overwritten; the note lives in the dated contact log only.
     */
    logStakeholderContact(stakeholderId, data = {}) {
      const existing = (store.state.stakeholders || []).find((s) => s.id === stakeholderId);
      if (!existing) return fail('That stakeholder no longer exists.');
      const on = isCalendarDay(data.on) ? data.on : today();
      const note = String(data.note || '').trim().slice(0, 600);
      let scheduledOn = null;
      store.update(
        (draft) => {
          const target = (draft.stakeholders || []).find((s) => s.id === stakeholderId);
          if (!target) return;
          target.contactLog = [...(target.contactLog || []), { id: id('stkcontact'), on, note }]
            .sort((a, b) => String(a.on).localeCompare(String(b.on)))
            .slice(-50);
          target.lastContactOn = on;
          const needsNext = !target.nextContactOn || target.nextContactOn <= on;
          if (needsNext && CADENCE_DAYS[target.commsCadence]) {
            target.nextContactOn = addDays(on, CADENCE_DAYS[target.commsCadence]);
            scheduledOn = target.nextContactOn;
          }
          target.updatedAt = stamp();
        },
        {
          type: 'stakeholder.contactLogged',
          entity: 'stakeholder',
          entityId: stakeholderId,
          summary: `Contact logged with ${existing.name.slice(0, 60)}`,
        },
      );
      return { ok: true, scheduledNextOn: scheduledOn };
    },

    archiveStakeholder(stakeholderId) {
      const existing = (store.state.stakeholders || []).find((s) => s.id === stakeholderId);
      if (!existing) return fail('That stakeholder no longer exists.');
      store.update(
        (draft) => {
          const target = (draft.stakeholders || []).find((s) => s.id === stakeholderId);
          if (target) target.status = 'archived';
        },
        {
          type: 'stakeholder.archived',
          entity: 'stakeholder',
          entityId: stakeholderId,
          summary: `Stakeholder archived: ${existing.name.slice(0, 70)}`,
        },
      );
      return { ok: true };
    },

    /**
     * Scoped cascade: remove the record, every graph edge touching it, and
     * alliance edges held by other register records. Other entities' edges
     * are preserved exactly as negotiation deletion does.
     */
    deleteStakeholder(stakeholderId) {
      const existing = (store.state.stakeholders || []).find((s) => s.id === stakeholderId);
      if (!existing) return fail('That stakeholder no longer exists.');
      store.update(
        (draft) => {
          draft.stakeholders = (draft.stakeholders || []).filter((s) => s.id !== stakeholderId);
          for (const other of draft.stakeholders || []) {
            other.alliances = (other.alliances || []).filter((edge) => edge.targetId !== stakeholderId);
          }
          draft.links = (draft.links || []).filter(
            (l) => !((l.sourceType === 'stakeholder' && l.sourceId === stakeholderId) ||
              (l.targetType === 'stakeholder' && l.targetId === stakeholderId)),
          );
        },
        {
          type: 'stakeholder.deleted',
          entity: 'stakeholder',
          entityId: stakeholderId,
          summary: `Deleted stakeholder: ${existing.name.slice(0, 70)}`,
        },
      );
      return { ok: true };
    },

    /**
     * Re-run the generalized forecast-integrity rules over every source
     * ledger. The store's post-commit hook performs the actual parallel
     * propagation inside this transaction; the action is just the explicit
     * user-triggered event (also used after import or migration).
     */
    syncForecastIntegrity() {
      const before = (store.state.forecastChallenges || []).length;
      store.update(
        () => {},
        {
          type: 'forecast.scan',
          entity: 'forecast',
          entityId: '',
          summary: 'Cross-ledger forecast integrity scan requested',
          force: true,
          rules: ['forecastIntegrity'],
        },
      );
      const report = forecastIntegrityReport(store.state, clock());
      return {
        ok: true,
        created: Math.max(0, (store.state.forecastChallenges || []).length - before),
        openChallenges: report.openChallenges,
        flaggedClasses: report.flaggedClasses.length,
      };
    },

    /** Accept, adapt or dismiss an outside-view challenge; never rewrite a forecast. */
    respondForecastChallenge(challengeId, data = {}) {
      const existing = (store.state.forecastChallenges || []).find((c) => c.id === challengeId);
      if (!existing) return fail('That forecast challenge no longer exists.', 'challengeId');
      if (existing.status !== 'open') return fail('This challenge already has a recorded response. Re-run the scan for new evidence instead.', 'challengeId');
      const response = clean(data.response);
      if (!FORECAST_CHALLENGE_STATUSES.includes(response) || response === 'open') {
        return fail('Choose accept, adapt, or dismiss.', 'response');
      }
      const note = clean(data.note ?? data.responseNote).slice(0, 2000);
      if (response === 'dismissed' && note.length < 5) {
        return fail('Give a short written reason when dismissing an outside-view challenge.', 'note');
      }
      let result = null;
      store.update(
        (draft, { logEvent }) => {
          const target = (draft.forecastChallenges || []).find((c) => c.id === challengeId);
          if (!target || target.status !== 'open') return;
          target.status = response;
          target.responseNote = note;
          target.respondedOn = today();
          target.updatedAt = stamp();
          target.history = [...(Array.isArray(target.history) ? target.history : []), {
            id: id('fchist'),
            on: today(),
            action: response,
            evidenceN: target.evidenceN,
            medianRatio: target.medianRatio,
            bandLow: target.bandLow,
            bandHigh: target.bandHigh,
          }].slice(-20);
          result = { ok: true, id: target.id, response };
          logEvent({
            type: 'automation.propagated',
            entity: 'forecast',
            entityId: target.id,
            summary: `[RULE-FCI-04] Forecast challenge ${response}: “${target.title.slice(0, 60)}” — recorded estimate unchanged`,
          });
        },
        {
          type: 'forecast.challenge.response',
          entity: 'forecast',
          entityId: challengeId,
          summary: `Forecast challenge ${response}: ${existing.title.slice(0, 60)}`,
          rules: ['forecastIntegrity'],
        },
      );
      return result || fail('The challenge could not be updated.');
    },

    previewStakeholder(data = {}, existingStakeholderId = null) {
      const built = assembleStakeholder(data, existingStakeholderId
        ? (store.state.stakeholders || []).find((s) => s.id === existingStakeholderId)
        : null);
      if (!built.ok) return built;
      const previews = previewStakeholderPropagations(built.record, store.state, {
        now: clock(),
        existingStakeholderId,
      });
      return { ok: true, previews };
    },

    /* --------------------- natural-language intake terminal (v27) */
    /**
     * Pure triage: run the on-device engine without persisting anything, so the
     * UI can render live confidence, evidence and entity extraction while the
     * leader is still typing.
     */
    analyzeIntake(text) {
      const analysis = analyzeIntakeText(text, store.state, { now: clock() });
      return { ok: true, analysis };
    },

    /**
     * Persist an analyzed draft. Insufficient-evidence text is refused rather
     * than stored as a fake triage result; the UI keeps the text and shows the
     * engine's reasons so the leader can add detail.
     */
    saveIntakeDraft(text) {
      const sourceText = clean(text);
      if (!sourceText) return fail('Describe the situation before running triage.', 'sourceText');
      if (sourceText.length > 8000) return fail('Keep the intake note under 8,000 characters.', 'sourceText');
      const analysis = analyzeIntakeText(sourceText, store.state, { now: clock() });
      if (analysis.insufficient) {
        return { ok: false, code: 'insufficient-evidence', error: 'The evidence is too thin to route this confidently. Add concrete details — what happened, who is involved, and what is at stake.', analysis, reasons: analysis.insufficientReasons };
      }
      let draftId = null;
      store.update(
        (draft) => {
          draft.intakeDrafts = Array.isArray(draft.intakeDrafts) ? draft.intakeDrafts : [];
          const record = {
            ...append(null, 'intake'),
            updatedAt: stamp(),
            status: 'analyzed',
            sourceText,
            engineVersion: analysis.engineVersion,
            analysis,
            confirmedCaseId: null,
            outcomes: null,
            dismissReason: '',
          };
          draft.intakeDrafts.unshift(record);
          draftId = record.id;
        },
        {
          type: 'intake.draft_saved',
          entity: 'intake',
          summary: `Intake triage saved as draft: “${analysis.suggestedTitle.slice(0, 60)}” (${analysis.confidenceBand} confidence)`,
        },
      );
      return { ok: true, id: draftId, analysis };
    },

    /** Re-run the engine after the leader edits a draft's source text. */
    reanalyzeIntakeDraft(draftId, text) {
      const draft = (store.state.intakeDrafts || []).find((d) => d.id === draftId);
      if (!draft) return fail('That intake draft no longer exists.');
      if (draft.status !== 'analyzed') return fail('Only pending drafts can be re-analyzed.');
      const sourceText = clean(text);
      if (!sourceText) return fail('The intake note cannot be empty.', 'sourceText');
      const analysis = analyzeIntakeText(sourceText, store.state, { now: clock() });
      if (analysis.insufficient) {
        return { ok: false, code: 'insufficient-evidence', error: 'The edited text is too thin to route confidently.', analysis, reasons: analysis.insufficientReasons };
      }
      store.update(
        (d) => {
          const target = (d.intakeDrafts || []).find((x) => x.id === draftId);
          if (!target) return;
          target.sourceText = sourceText;
          target.analysis = analysis;
          target.engineVersion = analysis.engineVersion;
          target.updatedAt = stamp();
        },
        {
          type: 'intake.draft_reanalyzed',
          entity: 'intake',
          entityId: draftId,
          summary: 'Intake draft re-analyzed after text edit',
        },
      );
      return { ok: true, analysis };
    },

    /**
     * Human-confirmed routing. The draft's analysis is converted into the same
     * validated `addCase` payload every other module uses, so the event-driven
     * propagation engine (DACI, delegations, coaching, capacity, stakeholders)
     * runs exactly once with no parallel glue code. The outcomes ledger records
     * which engine suggestions were accepted, edited or rejected — the training
     * signal for RULE-INTAKE-07 calibration.
     */
    confirmIntakeDraft(draftId, overrides = {}) {
      const draft = (store.state.intakeDrafts || []).find((d) => d.id === draftId);
      if (!draft) return fail('That intake draft no longer exists.');
      if (draft.status === 'confirmed') return fail('This draft was already routed to a case.', 'status');
      if (draft.status === 'dismissed') return fail('A dismissed draft cannot be confirmed. Re-create the triage instead.', 'status');
      const analysis = draft.analysis;
      if (!analysis || analysis.insufficient || analysis.privacyBlocked) {
        return fail('This triage cannot be routed automatically — open the relevant module manually.', 'status');
      }
      const caseInput = toCaseInput(analysis, overrides);
      if (!caseInput) return fail('The triage produced no case suggestion.');
      const result = api.addCase(caseInput);
      if (!result?.ok) return result;
      const ledger = api.markIntakeDraftRouted(draftId, { caseId: result.id, caseInput });
      return {
        ok: true,
        id: result.id,
        caseId: result.id,
        propagations: result.propagations || [],
        outcomes: ledger.ok ? ledger.outcomes : null,
      };
    },

    /**
     * Ledger-only confirmation used when the standard case dialog (which runs
     * its own validated addCase) created the case. Outcomes are computed by
     * diffing the persisted case record against the engine's suggestion, so the
     * calibration data reflects what the human actually accepted or changed.
     */
    markIntakeDraftRouted(draftId, { caseId, caseInput = null } = {}) {
      const draft = (store.state.intakeDrafts || []).find((d) => d.id === draftId);
      if (!draft) return fail('That intake draft no longer exists.');
      if (draft.status !== 'analyzed') return fail('Only pending drafts can be marked as routed.');
      const caseRecord = (store.state.cases || []).find((c) => c.id === caseId);
      if (!caseRecord) return fail('The linked operational case could not be found.');
      const analysis = draft.analysis || {};
      const effectiveInput = caseInput || toCaseInput(analysis) || {};
      const offeredEntities = countOfferedEntities(analysis);
      const acceptedEntities = countAcceptedEntities(analysis, effectiveInput);
      const editedFields = diffCaseSuggestion(analysis, effectiveInput);
      const primaryAccepted = !analysis.caseSuggestion || caseRecord.kind === analysis.caseSuggestion.kind;
      const outcomes = {
        primaryCategory: analysis.primaryCategoryId || null,
        primaryAccepted,
        confidenceBand: analysis.confidenceBand || null,
        entityOffered: offeredEntities,
        entityAccepted: acceptedEntities,
        editedFields,
        rejectedRouteIds: [],
      };
      store.update(
        (d) => {
          const target = (d.intakeDrafts || []).find((x) => x.id === draftId);
          if (!target) return;
          target.status = 'confirmed';
          target.confirmedCaseId = caseId;
          target.updatedAt = stamp();
          target.outcomes = outcomes;
        },
        {
          type: 'intake.confirmed',
          entity: 'intake',
          entityId: draftId,
          summary: `Intake confirmed and routed to operational case ${caseId} via the cross-module propagation engine`,
        },
      );
      return { ok: true, outcomes };
    },

    dismissIntakeDraft(draftId, reason = '') {
      const draft = (store.state.intakeDrafts || []).find((d) => d.id === draftId);
      if (!draft) return fail('That intake draft no longer exists.');
      if (draft.status !== 'analyzed') return fail('Only pending drafts can be dismissed.');
      store.update(
        (d) => {
          const target = (d.intakeDrafts || []).find((x) => x.id === draftId);
          if (!target) return;
          target.status = 'dismissed';
          target.dismissReason = clean(reason).slice(0, 300);
          target.updatedAt = stamp();
        },
        {
          type: 'intake.dismissed',
          entity: 'intake',
          entityId: draftId,
          summary: `Intake triage dismissed${reason ? `: ${clean(reason).slice(0, 80)}` : ''}`,
        },
      );
      return { ok: true };
    },

    deleteIntakeDraft(draftId) {
      const draft = (store.state.intakeDrafts || []).find((d) => d.id === draftId);
      if (!draft) return fail('That intake draft no longer exists.');
      store.update(
        (d) => {
          d.intakeDrafts = (d.intakeDrafts || []).filter((x) => x.id !== draftId);
        },
        {
          type: 'intake.deleted',
          entity: 'intake',
          entityId: draftId,
          summary: 'Intake draft permanently deleted',
        },
      );
      return { ok: true };
    },

    intakeCalibrationReport() {
      return intakeCalibration(store.state);
    },

    pendingIntakeCount() {
      return pendingIntakeDrafts(store.state, clock()).length;
    },

    /* ------------------------------------------------- Decision tempo (v28) */

    /**
     * Arm (or re-arm) a decision timebox. The derived economics come from the
     * decision's linked records; the human inputs (edge, uncertainty, profile,
     * decide-by) are the leader's. Nothing here writes to another module —
     * cross-module propagation happens inside the same transaction through the
     * post-commit tempo rule (RULE-DLY-01..05).
     */
    armTempoSchedule(decisionId, input = {}) {
      const decision = (store.state.decisions || []).find((d) => d.id === decisionId);
      if (!decision) return fail('That decision no longer exists.');
      if (decision.chosen) return fail('This decision has already been made — a timing plan would be theatre.');
      const valuation = decisionValueTerms(store.state, decision);
      const defaults = scheduleDefaults({ decision, valuation, settings: store.state.settings, now: clock() });
      const profile = DELAY_PROFILES.includes(input.profile) ? input.profile : defaults.profile;
      const numeric = (value, fallback = null) => {
        if (value === null || value === undefined || value === '') return fallback;
        const n = Number(value);
        return Number.isFinite(n) && n >= 0 ? n : fallback;
      };
      const decideBy = input.decideBy ? String(input.decideBy).trim() : defaults.decideBy;
      if (!isCalendarDay(decideBy)) return fail('Choose a valid decide-by date.', 'decideBy');
      if (decideBy < today()) return fail('A decide-by date in the past is decision debt, not a plan — choose today or later.', 'decideBy');
      const uncertaintyPct = numeric(input.uncertaintyPct, null);
      if (uncertaintyPct !== null && uncertaintyPct > 100) return fail('Uncertainty is a percentage of the value at stake (0–100).', 'uncertaintyPct');
      const advantageAmount = numeric(input.advantageAmount, null);
      const existing = (store.state.tempoSchedules || []).find((t) => t.decisionId === decisionId && t.status !== 'abandoned');
      const classified = classifyDecisionType(decision, valuation, store.state.settings);
      const next = {
        id: existing ? existing.id : id('tempo'),
        decisionId,
        status: 'armed',
        profile,
        currency: String(input.currency || defaults.currency || '').toUpperCase().slice(0, 6) || null,
        valueAtStakeOverride: numeric(input.valueAtStakeOverride, null),
        derivedAmount: valuation.dominant?.amount ?? null,
        derivedAt: today(),
        derivedTermCount: valuation.termCount,
        delayCostPerWeek: numeric(input.delayCostPerWeek, null),
        windowWeeks: Math.max(1, Math.round(numeric(input.windowWeeks, defaults.windowWeeks))),
        deadlineDays: Math.max(0, Math.round(numeric(input.deadlineDays, defaults.deadlineDays))),
        advantageAmount,
        uncertaintyPct,
        halfLifeDays: Math.max(1, Math.round(numeric(input.halfLifeDays, defaults.halfLifeDays))),
        infoWeeks: input.infoWeeks === null || input.infoWeeks === undefined || input.infoWeeks === ''
          ? null
          : Math.max(0, Math.round(numeric(input.infoWeeks, 0))),
        infoCostAmount: numeric(input.infoCostAmount, 0) || 0,
        infoCostNote: clean(input.infoCostNote || '').slice(0, 300),
        decideBy,
        plannedTempoDays: Math.max(0, daysBetween(today(), decideBy) ?? defaults.guardrailDays),
        decisionType: classified.type,
        notes: clean(input.notes || '').slice(0, 2000),
        createdOn: existing ? existing.createdOn : today(),
        createdAt: existing ? existing.createdAt : stamp(),
        updatedAt: stamp(),
        armedOn: today(),
        settledOn: null,
        abandonedOn: null,
        abandonReason: '',
        realizedLatencyDays: null,
        resolvedChoice: '',
        history: [
          ...((existing && Array.isArray(existing.history)) ? existing.history : []),
          {
            on: today(),
            action: existing ? 're-armed' : 'armed',
            note: `${profile} profile · decide by ${decideBy}${advantageAmount !== null ? ` · edge ${advantageAmount}` : ' (no edge recorded — option to wait unpriced)'}`,
          },
        ].slice(-30),
      };
      store.update(
        (draft) => {
          draft.tempoSchedules = Array.isArray(draft.tempoSchedules) ? draft.tempoSchedules : [];
          const at = draft.tempoSchedules.findIndex((t) => t.id === next.id);
          if (at >= 0) draft.tempoSchedules[at] = next;
          else draft.tempoSchedules.push(next);
        },
        {
          type: existing ? 'tempo.rearmed' : 'tempo.armed',
          entity: 'tempo',
          entityId: next.id,
          summary: `Decision timebox ${existing ? 'updated' : 'armed'}: “${decision.title.slice(0, 60)}” decide by ${decideBy}`,
        },
      );
      const saved = (store.state.tempoSchedules || []).find((t) => t.id === next.id) || next;
      return {
        ok: true,
        id: saved.id,
        schedule: saved,
        timing: evaluateDecisionTiming({ decision, valuation, schedule: saved, now: clock(), settings: store.state.settings }),
      };
    },

    updateTempoSchedule(scheduleId, patch = {}) {
      const current = (store.state.tempoSchedules || []).find((t) => t.id === scheduleId);
      if (!current) return fail('That timebox no longer exists.');
      if (current.status === 'settled') return fail('This timebox is settled — its timing position is history now.');
      const numeric = (value, fallback = null) => {
        if (value === null || value === undefined || value === '') return fallback;
        const n = Number(value);
        return Number.isFinite(n) && n >= 0 ? n : fallback;
      };
      if (patch.decideBy !== undefined) {
        const decideBy = String(patch.decideBy || '').trim();
        if (!isCalendarDay(decideBy)) return fail('Choose a valid decide-by date.', 'decideBy');
      }
      if (patch.uncertaintyPct !== undefined && numeric(patch.uncertaintyPct, null) > 100) {
        return fail('Uncertainty is a percentage of the value at stake (0–100).', 'uncertaintyPct');
      }
      store.update(
        (draft) => {
          const target = (draft.tempoSchedules || []).find((t) => t.id === scheduleId);
          if (!target) return;
          if (patch.decideBy !== undefined) target.decideBy = String(patch.decideBy).trim();
          if (patch.notes !== undefined) target.notes = clean(patch.notes).slice(0, 2000);
          if (patch.profile !== undefined && DELAY_PROFILES.includes(patch.profile)) target.profile = patch.profile;
          if (patch.advantageAmount !== undefined) target.advantageAmount = numeric(patch.advantageAmount, null);
          if (patch.uncertaintyPct !== undefined) target.uncertaintyPct = numeric(patch.uncertaintyPct, null);
          if (patch.halfLifeDays !== undefined) target.halfLifeDays = Math.max(1, Math.round(numeric(patch.halfLifeDays, target.halfLifeDays)));
          if (patch.windowWeeks !== undefined) target.windowWeeks = Math.max(1, Math.round(numeric(patch.windowWeeks, target.windowWeeks)));
          if (patch.delayCostPerWeek !== undefined) target.delayCostPerWeek = numeric(patch.delayCostPerWeek, null);
          if (patch.valueAtStakeOverride !== undefined) target.valueAtStakeOverride = numeric(patch.valueAtStakeOverride, null);
          if (patch.deadlineDays !== undefined) target.deadlineDays = Math.max(0, Math.round(numeric(patch.deadlineDays, target.deadlineDays)));
          if (patch.infoWeeks !== undefined) target.infoWeeks = patch.infoWeeks === null || patch.infoWeeks === '' ? null : Math.max(0, Math.round(numeric(patch.infoWeeks, 0)));
          if (patch.infoCostAmount !== undefined) target.infoCostAmount = numeric(patch.infoCostAmount, 0) || 0;
          if (patch.infoCostNote !== undefined) target.infoCostNote = clean(patch.infoCostNote).slice(0, 300);
          target.updatedAt = stamp();
          target.history = [
            ...(Array.isArray(target.history) ? target.history : []),
            { on: today(), action: 'edited', note: Object.keys(patch).join(', ').slice(0, 200) },
          ].slice(-30);
        },
        {
          type: 'tempo.updated',
          entity: 'tempo',
          entityId: scheduleId,
          summary: 'Decision timebox economics edited (recorded, not rewritten)',
        },
      );
      return { ok: true };
    },

    abandonTempoSchedule(scheduleId, reason = '') {
      const current = (store.state.tempoSchedules || []).find((t) => t.id === scheduleId);
      if (!current) return fail('That timebox no longer exists.');
      if (current.status === 'settled') return fail('A settled timebox is history; it cannot be abandoned.');
      const note = clean(reason).slice(0, 400);
      store.update(
        (draft) => {
          const target = (draft.tempoSchedules || []).find((t) => t.id === scheduleId);
          if (!target) return;
          target.status = 'abandoned';
          target.abandonedOn = today();
          target.abandonReason = note;
          target.updatedAt = stamp();
          target.history = [
            ...(Array.isArray(target.history) ? target.history : []),
            { on: today(), action: 'abandoned', note: note || 'Abandoned without a written reason' },
          ].slice(-30);
        },
        { type: 'tempo.abandoned', entity: 'tempo', entityId: scheduleId, summary: `Decision timebox abandoned${note ? `: ${note.slice(0, 80)}` : ''}` },
      );
      return { ok: true };
    },

    deleteTempoSchedule(scheduleId) {
      const current = (store.state.tempoSchedules || []).find((t) => t.id === scheduleId);
      if (!current) return fail('That timebox no longer exists.');
      if (current.status !== 'proposed') return fail('Only an unarmed proposal can be deleted — an armed timebox is part of the record and must be settled or abandoned.');
      store.update(
        (draft) => {
          draft.tempoSchedules = (draft.tempoSchedules || []).filter((t) => t.id !== scheduleId);
        },
        { type: 'tempo.deleted', entity: 'tempo', entityId: scheduleId, summary: 'Unarmed tempo proposal deleted' },
      );
      return { ok: true };
    },

    /**
     * Explicit scan: run the tempo rules now (write) instead of waiting for the
     * next linked event. `force` bypasses the pause setting, exactly like the
     * forecast-integrity scan.
     */
    scanDecisionTempo() {
      const before = JSON.stringify({
        schedules: (store.state.tempoSchedules || []).length,
        decisions: (store.state.decisions || []).length,
        delegations: (store.state.delegations || []).length,
      });
      store.update(
        (draft) => {
          draft.tempoSchedules = Array.isArray(draft.tempoSchedules) ? draft.tempoSchedules : [];
        },
        {
          type: 'decision.tempo.scan',
          entity: 'workspace',
          entityId: '',
          summary: 'Decision tempo scan requested by the leader',
          rules: ['decisionTempo'],
          force: true,
        },
      );
      const after = JSON.stringify({
        schedules: (store.state.tempoSchedules || []).length,
        decisions: (store.state.decisions || []).length,
        delegations: (store.state.delegations || []).length,
      });
      return { ok: true, changed: before !== after };
    },

    tempoReport() {
      return buildTempoReport(store.state, { now: clock(), settings: store.state.settings });
    },

    /** Pure prefill for the arm dialog — no write, no invented numbers. */
    tempoScheduleDraft(decisionId) {
      const decision = (store.state.decisions || []).find((d) => d.id === decisionId);
      if (!decision) return fail('That decision no longer exists.');
      const valuation = decisionValueTerms(store.state, decision);
      const existing = (store.state.tempoSchedules || []).find((t) => t.decisionId === decisionId && t.status === 'armed');
      const defaults = scheduleDefaults({ decision, valuation, settings: store.state.settings, now: clock() });
      const guardrail = guardrailDaysFor(defaults.decisionType, store.state.settings);
      return {
        ok: true,
        decision,
        valuation,
        defaults,
        guardrailDays: guardrail,
        existing: existing || null,
        current: TEMPO_SCHEDULE_STATUSES.includes(existing?.status) ? existing : null,
      };
    },

    /* ------------------------------------------- operational resilience */
    /* ================================================================== *
     * Schema v30 — Coalition & Incentive War Room (power games)             *
     * ================================================================== */
    addPowerGame(data = {}) {
      const assembled = assemblePowerGame(data, null);
      if (!assembled.ok) return assembled;
      const record = assembled.record;
      store.update(
        (draft) => {
          draft.powerGames = Array.isArray(draft.powerGames) ? draft.powerGames : [];
          draft.powerGames.push(record);
        },
        { type: 'power.created', entity: 'power', entityId: record.id, summary: `Modeled coalition situation “${record.title.slice(0, 80)}”` },
      );
      return { ok: true, id: record.id, propagations: store.lastPropagations || [], warning: store.persistError || null };
    },

    updatePowerGame(gameId, data = {}) {
      const existing = (store.state.powerGames || []).find((g) => g.id === gameId);
      if (!existing) return fail('That coalition situation no longer exists.');
      const assembled = assemblePowerGame({ ...existing, ...data }, existing);
      if (!assembled.ok) return assembled;
      const next = {
        ...assembled.record,
        history: [...(Array.isArray(existing.history) ? existing.history : []),
          { on: today(), action: 'updated', note: `Updated “${assembled.record.title.slice(0, 60)}”` }].slice(-40),
      };
      store.update(
        (draft) => { const idx = (draft.powerGames || []).findIndex((g) => g.id === gameId); if (idx >= 0) draft.powerGames[idx] = next; },
        { type: 'power.updated', entity: 'power', entityId: gameId, summary: `Updated coalition situation “${next.title.slice(0, 80)}”` },
      );
      return { ok: true, id: gameId, propagations: store.lastPropagations || [], warning: store.persistError || null };
    },

    /** Explicit re-scan that runs even when automatic propagation is paused. */
    reanalyzePowerGame(gameId) {
      const existing = (store.state.powerGames || []).find((g) => g.id === gameId);
      if (!existing) return fail('That coalition situation no longer exists.');
      store.update(
        () => {},
        { type: 'power.reanalyzed', entity: 'power', entityId: gameId, force: true, summary: `Re-ran coalition & incentive analysis for “${existing.title.slice(0, 80)}”` },
      );
      return { ok: true, id: gameId, propagations: store.lastPropagations || [], warning: store.persistError || null };
    },

    setPowerTarget(gameId, targetCell) {
      const existing = (store.state.powerGames || []).find((g) => g.id === gameId);
      if (!existing) return fail('That coalition situation no longer exists.');
      if (!POWER_CELLS.includes(targetCell)) return fail('Choose one of the four outcome cells.', 'targetCell');
      store.update(
        (draft) => { const g = (draft.powerGames || []).find((x) => x.id === gameId); if (g) { g.targetCell = targetCell; g.updatedAt = stamp(); } },
        { type: 'power.target', entity: 'power', entityId: gameId, summary: `Set target outcome ${targetCell} for “${existing.title.slice(0, 80)}”` },
      );
      return { ok: true };
    },

    commitPowerGame(gameId) {
      return applyPowerStatus(gameId, 'committed', 'power.committed', 'Committed coalition strategy');
    },

    setPowerStatus(gameId, status) {
      if (!POWER_STATUSES.includes(status)) return fail('Choose a valid status.', 'status');
      return applyPowerStatus(gameId, status, `power.${status}`, `Set status to ${status}`);
    },

    archivePowerGame(gameId) {
      return applyPowerStatus(gameId, 'archived', 'power.archived', 'Archived coalition situation');
    },

    settlePowerGame(gameId, realizedCell = '', note = '') {
      const existing = (store.state.powerGames || []).find((g) => g.id === gameId);
      if (!existing) return fail('That coalition situation no longer exists.');
      const cell = POWER_CELLS.includes(realizedCell) ? realizedCell : null;
      const cleanNote = clean(note).slice(0, 600);
      store.update(
        (draft) => {
          const g = (draft.powerGames || []).find((x) => x.id === gameId);
          if (!g) return;
          g.status = 'settled';
          g.realizedCell = cell;
          g.settledOn = today();
          g.updatedAt = stamp();
          g.history = [...(Array.isArray(g.history) ? g.history : []),
            { on: today(), action: 'settled', note: `Realised outcome ${cell || 'unrecorded'}. ${cleanNote}`.trim().slice(0, 400) }].slice(-40);
        },
        { type: 'power.settled', entity: 'power', entityId: gameId, summary: `Settled “${existing.title.slice(0, 80)}” (outcome ${cell || 'unrecorded'})` },
      );
      return { ok: true };
    },

    deletePowerGame(gameId) {
      const existing = (store.state.powerGames || []).find((g) => g.id === gameId);
      if (!existing) return fail('That coalition situation no longer exists.');
      store.update(
        (draft) => {
          draft.powerGames = (draft.powerGames || []).filter((g) => g.id !== gameId);
          draft.links = (draft.links || []).filter(
            (l) => !((l.sourceType === 'power' && l.sourceId === gameId) || (l.targetType === 'power' && l.targetId === gameId)),
          );
        },
        { type: 'power.deleted', entity: 'power', entityId: gameId, summary: `Deleted coalition situation “${existing.title.slice(0, 80)}”` },
      );
      return { ok: true };
    },

    addDependency(data = {}) {
      const assembled = assembleDependency(data, null);
      if (!assembled.ok) return assembled;
      const record = assembled.record;
      store.update(
        (draft) => {
          draft.dependencies = Array.isArray(draft.dependencies) ? draft.dependencies : [];
          draft.dependencies.push(record);
        },
        {
          type: 'dependency.created',
          entity: 'dependency',
          entityId: record.id,
          summary: `Registered ${record.criticality} ${record.kind}: “${record.name.slice(0, 80)}”`,
        },
      );
      return { ok: true, id: record.id, propagations: store.lastPropagations || [], warning: store.persistError || null };
    },

    updateDependency(depId, data = {}) {
      const existing = (store.state.dependencies || []).find((d) => d.id === depId);
      if (!existing) return fail('That operational dependency no longer exists.');
      const assembled = assembleDependency({ ...existing, ...data }, existing);
      if (!assembled.ok) return assembled;
      const next = {
        ...assembled.record,
        history: [
          ...(Array.isArray(existing.history) ? existing.history : []),
          { on: today(), action: 'updated', note: `Updated ${assembled.record.name.slice(0, 60)}` },
        ].slice(-40),
      };
      store.update(
        (draft) => {
          const idx = (draft.dependencies || []).findIndex((d) => d.id === depId);
          if (idx >= 0) draft.dependencies[idx] = next;
        },
        {
          type: 'dependency.updated',
          entity: 'dependency',
          entityId: depId,
          summary: `Updated operational dependency “${next.name.slice(0, 80)}”`,
        },
      );
      return { ok: true, id: depId, propagations: store.lastPropagations || [], warning: store.persistError || null };
    },

    retireDependency(depId, reason = '') {
      const existing = (store.state.dependencies || []).find((d) => d.id === depId);
      if (!existing) return fail('That operational dependency no longer exists.');
      const cleanReason = (clean(reason) || '').slice(0, 400);
      store.update(
        (draft) => {
          const target = (draft.dependencies || []).find((d) => d.id === depId);
          if (!target) return;
          target.status = 'retired';
          target.retiredOn = today();
          target.retiredReason = cleanReason;
          target.updatedAt = stamp();
          target.history = [
            ...(Array.isArray(target.history) ? target.history : []),
            { on: today(), action: 'retired', note: cleanReason || 'Retired from active continuity topology' },
          ].slice(-40);
        },
        {
          type: 'dependency.retired',
          entity: 'dependency',
          entityId: depId,
          summary: `Retired operational dependency “${existing.name.slice(0, 80)}”`,
        },
      );
      return { ok: true };
    },

    reopenDependency(depId) {
      const existing = (store.state.dependencies || []).find((d) => d.id === depId);
      if (!existing) return fail('That operational dependency no longer exists.');
      store.update(
        (draft) => {
          const target = (draft.dependencies || []).find((d) => d.id === depId);
          if (!target) return;
          target.status = 'active';
          target.retiredOn = null;
          target.retiredReason = '';
          target.updatedAt = stamp();
          target.history = [
            ...(Array.isArray(target.history) ? target.history : []),
            { on: today(), action: 'reopened', note: 'Returned to active continuity topology' },
          ].slice(-40);
        },
        {
          type: 'dependency.reopened',
          entity: 'dependency',
          entityId: depId,
          summary: `Reopened operational dependency “${existing.name.slice(0, 80)}”`,
        },
      );
      return { ok: true };
    },

    deleteDependency(depId) {
      const existing = (store.state.dependencies || []).find((d) => d.id === depId);
      if (!existing) return fail('That operational dependency no longer exists.');
      store.update(
        (draft) => {
          draft.dependencies = (draft.dependencies || []).filter((d) => d.id !== depId);
          for (const peer of draft.dependencies) {
            if (Array.isArray(peer.upstreamIds)) {
              peer.upstreamIds = peer.upstreamIds.filter((uid) => uid !== depId);
            }
          }
          draft.links = (draft.links || []).filter(
            (l) => !((l.sourceType === 'dependency' && l.sourceId === depId) || (l.targetType === 'dependency' && l.targetId === depId)),
          );
        },
        {
          type: 'dependency.deleted',
          entity: 'dependency',
          entityId: depId,
          summary: `Deleted operational dependency “${existing.name.slice(0, 80)}”`,
        },
      );
      return { ok: true };
    },

    verifyDependencySteward(depId, personId, { verifiedOn = null, notes = '' } = {}) {
      const existing = (store.state.dependencies || []).find((d) => d.id === depId);
      if (!existing) return fail('That operational dependency no longer exists.');
      const person = (store.state.people || []).find((p) => p.id === personId);
      if (!person || person.status === 'archived') return fail('Choose an active team member to verify as steward.', 'personId');
      const vDay = verifiedOn || today();
      if (!isCalendarDay(vDay) || vDay > today()) {
        return fail('Choose a valid verification date on or before today.', 'verifiedOn');
      }
      store.update(
        (draft) => {
          const target = (draft.dependencies || []).find((d) => d.id === depId);
          if (!target) return;
          target.stewards = Array.isArray(target.stewards) ? target.stewards : [];
          const st = target.stewards.find((s) => s.personId === personId);
          if (st) {
            if (st.role === 'trainee') st.role = 'backup';
            st.verifiedOn = vDay;
            if (notes) st.notes = clean(notes).slice(0, 300);
          } else {
            target.stewards.push({
              personId,
              role: 'backup',
              verifiedOn: vDay,
              notes: (clean(notes) || '').slice(0, 300),
            });
          }
          target.updatedAt = stamp();
          target.history = [
            ...(Array.isArray(target.history) ? target.history : []),
            { on: today(), action: 'steward-verified', note: `Verified ${person.name} for independent continuity on ${vDay}` },
          ].slice(-40);
        },
        {
          type: 'dependency.updated',
          entity: 'dependency',
          entityId: depId,
          summary: `Verified ${person.name} as steward on “${existing.name.slice(0, 70)}”`,
        },
      );
      return { ok: true, propagations: store.lastPropagations || [] };
    },

    recordContinuityDrill(depId, data = {}) {
      const existing = (store.state.dependencies || []).find((d) => d.id === depId);
      if (!existing) return fail('That operational dependency no longer exists.');
      const date = data.date || today();
      if (!isCalendarDay(date)) return fail('Choose a valid drill or incident date.', 'date');
      if (date > today()) return fail('A completed continuity drill cannot be recorded in the future.', 'date');
      const kind = DRILL_KINDS.includes(data.kind) ? data.kind : null;
      if (!kind) return fail('Choose tabletop walkthrough, failover drill, or live incident.', 'kind');

      const parseDur = (val, field) => {
        if (val === undefined || val === null || val === '') return { ok: true, value: null };
        const n = Number(val);
        if (!Number.isFinite(n) || n < 0 || n > 3650) {
          return fail(`${field} must be between 0 and 3,650 days, or left blank.`, field);
        }
        return { ok: true, value: Math.round(n * 100) / 100 };
      };
      const est = parseDur(data.estimatedTtrDays !== undefined ? data.estimatedTtrDays : existing.ttrDays, 'Estimated TTR');
      if (!est.ok) return est;
      const real = parseDur(data.realizedTtrDays, 'Realized recovery time');
      if (!real.ok) return real;

      let outcome = DRILL_OUTCOMES.includes(data.outcome) ? data.outcome : null;
      if (!outcome) {
        if (real.value !== null && existing.ttsDays !== null && existing.ttsDays !== undefined) {
          outcome = real.value > existing.ttsDays ? 'breached-tolerance' : 'within-tolerance';
        } else {
          outcome = 'within-tolerance';
        }
      }

      const drill = {
        id: id('drl'),
        date,
        kind,
        scenario: (clean(data.scenario) || '').slice(0, 500),
        estimatedTtrDays: est.value,
        realizedTtrDays: real.value,
        outcome,
        gapNote: (clean(data.gapNote) || '').slice(0, 800),
        linkedCaseId: null,
        recordedAt: stamp(),
      };

      store.update(
        (draft) => {
          const target = (draft.dependencies || []).find((d) => d.id === depId);
          if (!target) return;
          target.drills = [...(Array.isArray(target.drills) ? target.drills : []), drill].slice(-50);
          target.updatedAt = stamp();
          target.history = [
            ...(Array.isArray(target.history) ? target.history : []),
            {
              on: today(),
              action: 'drill-recorded',
              note: `Recorded ${kind} (${outcome})${real.value !== null ? ` · realized TTR ${real.value}d` : ''}`,
            },
          ].slice(-40);
        },
        {
          type: 'dependency.drillRecorded',
          entity: 'dependency',
          entityId: depId,
          summary: `Recorded ${kind} on “${existing.name.slice(0, 70)}” (${outcome})`,
        },
      );
      return { ok: true, id: drill.id, propagations: store.lastPropagations || [] };
    },

    deleteContinuityDrill(depId, drillId) {
      const existing = (store.state.dependencies || []).find((d) => d.id === depId);
      if (!existing) return fail('That operational dependency no longer exists.');
      store.update(
        (draft) => {
          const target = (draft.dependencies || []).find((d) => d.id === depId);
          if (!target || !Array.isArray(target.drills)) return;
          target.drills = target.drills.filter((d) => d.id !== drillId);
          target.updatedAt = stamp();
        },
        {
          type: 'dependency.updated',
          entity: 'dependency',
          entityId: depId,
          summary: `Removed continuity drill entry from “${existing.name.slice(0, 70)}”`,
        },
      );
      return { ok: true };
    },

    setResilienceAutoPropagate(enabled) {
      return api.updateSettings({ resilienceAutoPropagate: Boolean(enabled) });
    },

    scanOperationalResilience() {
      const before = JSON.stringify({
        decisions: (store.state.decisions || []).length,
        delegations: (store.state.delegations || []).length,
        links: (store.state.links || []).length,
      });
      store.update(
        (draft) => {
          draft.dependencies = Array.isArray(draft.dependencies) ? draft.dependencies : [];
        },
        {
          type: 'resilience.scan',
          entity: 'workspace',
          entityId: '',
          summary: 'Operational resilience scan requested by the leader',
          rules: ['resilience'],
          force: true,
        },
      );
      const after = JSON.stringify({
        decisions: (store.state.decisions || []).length,
        delegations: (store.state.delegations || []).length,
        links: (store.state.links || []).length,
      });
      return { ok: true, changed: before !== after, propagations: store.lastPropagations || [] };
    },

    resilienceReport() {
      return buildResilienceReport(store.state, clock());
    },

    simulateResilienceScenario(spec = {}) {
      return simulateDisruptionScenario(store.state, spec, clock());
    },

    /* ================================================================== *
     * Session 48 — Influence Network Intelligence (derived lens, no new      *
     * record collection). The analysis itself is read-side (the view calls   *
     * buildNetworkReport directly); these actions own the settings and the   *
     * explicit post-commit fan-out trigger.                                  *
     * ================================================================== */
    setNetworkAutoPropagate(enabled) {
      return api.updateSettings({ networkAutoPropagate: Boolean(enabled) });
    },

    setNetworkTiePct(pct) {
      return api.updateSettings({ networkTiePct: Number(pct) });
    },

    /**
     * Explicit influence-network follow-through scan. Emits a `network.rescan`
     * event that the shared post-commit RULE-ORG-01..05 hook consumes inside
     * the same store transaction, fanning one analysis into typed links, a
     * cross-training delegation, a DACI org-design decision, blameless 1:1
     * talking points and signals. The org-design decision is an ordinary DACI
     * record, so the decisions/Decision Tempo modules consume it on their own
     * triggers. Runs even when automatic propagation is paused (an explicit
     * human action), but never sets force:true, so unrelated rules are not
     * spuriously re-triggered.
     * Idempotent: repeated scans converge, and stale 1:1 prompts self-clean.
     */
    /** Re-evaluate an existing case through the real post-commit registry.
     * Preview is advisory: refresh always reads current state, never applies a snapshot.
     * Does not rerun action-level case opening rules or send any message.
     */
    refreshCaseAutomation(caseId) {
      if (!(store.state.cases || []).some((c) => c.id === caseId)) return fail('Case not found.');
      const revision = store.state.meta.revision;
      const warningCount = store.warnings.length;
      store.update(() => {}, {
        type: 'case.automation.refresh', entity: 'case', entityId: caseId,
        summary: 'Case post-commit automation refreshed from Automation Control Room',
      });
      if (store.state.meta.revision === revision) return fail('Workspace is locked or writes are blocked.');
      return { ok: true, automationWarnings: store.warnings.length - warningCount, propagations: store.lastPropagations || [] };
    },

    rescanNetwork() {
      const snapshot = () => JSON.stringify({
        decisions: (store.state.decisions || []).length,
        delegations: (store.state.delegations || []).length,
        links: (store.state.links || []).length,
      });
      const before = snapshot();
      store.update(
        () => {},
        {
          type: 'network.rescan',
          entity: 'workspace',
          entityId: '',
          summary: 'Influence-network follow-through scan requested by the leader',
          rules: ['network'],
          networkScan: true,
        },
      );
      return { ok: true, changed: before !== snapshot(), propagations: store.lastPropagations || [] };
    },

    /* -------------------------------------------------- Impact Ledger (v31) */

    /**
     * Declare a pre-registered study.
     *
     * The one field that cannot be defaulted into existence is `windowStart`:
     * the day the intervention began is the interruption date for every
     * estimator, and inferring it from the moment the form was submitted would
     * turn a retrospective story into a fake experiment.
     */
    createImpactStudy(input = {}) {
      const title = String(clean(input.title) ?? '').slice(0, 160);
      if (!title) return fail('Give the study a short title — it is the sentence you will be judged against.', 'title');
      const vitalId = clean(input.vitalId);
      if (!VITAL_BY_ID[vitalId]) return fail('Choose the metric this intervention is supposed to move.', 'vitalId');
      const windowStart = clean(input.windowStart);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(windowStart)) {
        return fail('Record the day the intervention actually started — that date is the interruption point for the whole analysis.', 'windowStart');
      }
      if (windowStart > today()) {
        return fail('That intervention date is in the future. A study can be declared in advance, but it cannot start in the future — set the date to the day it actually begins.', 'windowStart');
      }
      const intervention = impactInterventionSelection(
        store.state,
        input.interventionType,
        input.interventionId,
        input.interventionLabel,
      );
      if (!intervention.ok) return intervention;
      const expectedEffectRaw = input.expectedEffect === '' || input.expectedEffect === null || input.expectedEffect === undefined
        ? null
        : Number(input.expectedEffect);
      if (expectedEffectRaw !== null && (!Number.isFinite(expectedEffectRaw) || expectedEffectRaw < 0)) {
        return fail('Expected effect must be a non-negative number in the metric\'s own unit, or leave it blank.', 'expectedEffect');
      }
      const expectedConfidenceRaw = input.expectedConfidence === '' || input.expectedConfidence === null || input.expectedConfidence === undefined
        ? null
        : Math.round(Number(input.expectedConfidence));
      if (expectedConfidenceRaw !== null && (!Number.isFinite(expectedConfidenceRaw) || expectedConfidenceRaw < 50 || expectedConfidenceRaw > 95)) {
        return fail('State your confidence as a whole number from 50 to 95. Below 50 is not a prediction; above 95 is not honest.', 'expectedConfidence');
      }
      const settings = store.state.settings || {};
      const baselineWeeks = Math.round(Number(input.baselineWeeks) || settings.impactBaselineWeeks || 8);
      const windowWeeks = Math.round(Number(input.windowWeeks) || settings.impactWindowWeeks || 4);
      if (baselineWeeks < 4 || baselineWeeks > 26) return fail('The baseline must be 4 to 26 weeks.', 'baselineWeeks');
      if (windowWeeks < 2 || windowWeeks > 13) return fail('The evaluation window must be 2 to 13 weeks.', 'windowWeeks');
      const alpha = IMPACT_ALPHAS.includes(Number(input.alpha))
        ? Number(input.alpha)
        : (IMPACT_ALPHAS.includes(Number(settings.impactAlpha)) ? Number(settings.impactAlpha) : 0.1);

      const studentId = id('impact');
      const declaredOn = today();
      store.update(
        (draft) => {
          draft.impactStudies = Array.isArray(draft.impactStudies) ? draft.impactStudies : [];
          draft.impactStudies.push({
            id: studentId,
            title,
            hypothesis: String(clean(input.hypothesis) ?? '').slice(0, 2000),
            vitalId,
            interventionType: intervention.interventionType,
            interventionId: intervention.interventionId,
            interventionLabel: intervention.interventionLabel,
            executionSnapshot: null,
            windowStart,
            baselineWeeks,
            windowWeeks,
            alpha,
            expectedEffect: expectedEffectRaw === null ? null : Math.round(expectedEffectRaw * 10000) / 10000,
            expectedConfidence: expectedConfidenceRaw,
            declaredOn,
            status: 'running',
            lockedOn: null,
            verdict: null,
            evaluation: null,
            notes: String(clean(input.notes) ?? '').slice(0, 4000),
            outcomeNotes: '',
            autoPropagate: true,
            history: [{ at: stamp(), type: 'declared', summary: `Declared before scoring. Grade: ${declaredOn <= windowStart ? 'confirmatory' : 'exploratory'}.` }],
            createdAt: stamp(),
            updatedAt: stamp(),
          });
        },
        {
          type: 'impact.declared',
          entity: 'impact',
          entityId: studentId,
          summary: `Declared study “${title.slice(0, 80)}” on ${VITAL_BY_ID[vitalId].label.toLowerCase()}${declaredOn <= windowStart ? ' (pre-registered)' : ' (retrospective)'}`,
        },
      );
      return { ok: true, id: studentId };
    },

    /**
     * Edit a study. The pre-registration firewall lives here.
     *
     * Describing what you did is always editable. Changing *what you predicted*
     * stops being allowed once the evaluation window has closed, because from
     * that moment on the data is visible and a revised hypothesis is no longer
     * a prediction. Every change to a prediction is written to the append-only
     * history so a revised study stays visibly revised.
     */
    updateImpactStudy(studentId, patch = {}) {
      const existing = (store.state.impactStudies || []).find((x) => x.id === studentId);
      if (!existing) return fail('That study no longer exists.');
      if (existing.status === 'scored') {
        return fail('This study is scored and frozen. Its hypothesis and result cannot be edited — that is what makes the result worth anything. Record a follow-up study instead.');
      }
      const horizon = studyHorizonEnd(existing);
      const windowClosed = horizon ? today() >= horizon : false;
      const predictive = ['hypothesis', 'expectedEffect', 'expectedConfidence', 'baselineWeeks', 'windowWeeks', 'alpha', 'windowStart', 'vitalId', 'interventionType', 'interventionId'];
      const requestedPredictive = predictive.filter((key) => Object.hasOwn(patch, key));
      if (windowClosed && requestedPredictive.length) {
        return fail('The evaluation window has closed, so the hypothesis is now frozen. You can still describe what you did, but changing the prediction after seeing the data would make the study worthless.');
      }
      const next = {};
      if (Object.hasOwn(patch, 'title')) {
        const title = String(clean(patch.title) ?? '').slice(0, 160);
        if (!title) return fail('The title cannot be blank.', 'title');
        next.title = title;
      }
      if (Object.hasOwn(patch, 'notes')) next.notes = String(clean(patch.notes) ?? '').slice(0, 4000);
      const interventionChanged = Object.hasOwn(patch, 'interventionType') || Object.hasOwn(patch, 'interventionId');
      if (interventionChanged) {
        const selection = impactInterventionSelection(
          store.state,
          Object.hasOwn(patch, 'interventionType') ? patch.interventionType : existing.interventionType,
          Object.hasOwn(patch, 'interventionId') ? patch.interventionId : existing.interventionId,
          Object.hasOwn(patch, 'interventionLabel') ? patch.interventionLabel : existing.interventionLabel,
        );
        if (!selection.ok) return selection;
        next.interventionType = selection.interventionType;
        next.interventionId = selection.interventionId;
        next.interventionLabel = selection.interventionLabel;
      } else if (Object.hasOwn(patch, 'interventionLabel')) {
        next.interventionLabel = String(clean(patch.interventionLabel) ?? '').slice(0, 160);
      }
      if (Object.hasOwn(patch, 'hypothesis') && !windowClosed) next.hypothesis = String(clean(patch.hypothesis) ?? '').slice(0, 2000);
      if (Object.hasOwn(patch, 'expectedEffect') && !windowClosed) {
        const raw = patch.expectedEffect === '' || patch.expectedEffect === null ? null : Number(patch.expectedEffect);
        if (raw !== null && (!Number.isFinite(raw) || raw < 0)) return fail('Expected effect must be a non-negative number, or blank.', 'expectedEffect');
        next.expectedEffect = raw === null ? null : Math.round(raw * 10000) / 10000;
      }
      if (Object.hasOwn(patch, 'expectedConfidence') && !windowClosed) {
        const raw = patch.expectedConfidence === '' || patch.expectedConfidence === null ? null : Math.round(Number(patch.expectedConfidence));
        if (raw !== null && (!Number.isFinite(raw) || raw < 50 || raw > 95)) return fail('Confidence must be 50 to 95, or blank.', 'expectedConfidence');
        next.expectedConfidence = raw;
      }
      if (Object.hasOwn(patch, 'vitalId') && !windowClosed) {
        if (!VITAL_BY_ID[clean(patch.vitalId)]) return fail('Choose a metric that exists.', 'vitalId');
        next.vitalId = clean(patch.vitalId);
      }
      if (Object.hasOwn(patch, 'windowStart') && !windowClosed) {
        const day = clean(patch.windowStart);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today()) return fail('The intervention date must be a real past day.', 'windowStart');
        next.windowStart = day;
      }
      if (Object.hasOwn(patch, 'baselineWeeks') && !windowClosed) next.baselineWeeks = Math.round(Number(patch.baselineWeeks) || existing.baselineWeeks);
      if (Object.hasOwn(patch, 'windowWeeks') && !windowClosed) next.windowWeeks = Math.round(Number(patch.windowWeeks) || existing.windowWeeks);
      if (Object.hasOwn(patch, 'alpha') && !windowClosed && IMPACT_ALPHAS.includes(Number(patch.alpha))) next.alpha = Number(patch.alpha);
      if (Object.hasOwn(patch, 'autoPropagate')) next.autoPropagate = patch.autoPropagate !== false;

      const predictionChanged = requestedPredictive.some((key) => Object.hasOwn(next, key) && next[key] !== existing[key]);
      store.update(
        (draft) => {
          const row = (draft.impactStudies || []).find((x) => x.id === studentId);
          if (!row) return;
          Object.assign(row, next);
          row.updatedAt = stamp();
          if (predictionChanged) {
            row.history = [...(Array.isArray(row.history) ? row.history : []),
              { at: stamp(), type: 'hypothesis-revised', summary: 'Prediction edited before the window closed (append-only record).' }].slice(-60);
          }
        },
        {
          type: 'impact.updated',
          entity: 'impact',
          entityId: studentId,
          summary: `Updated study “${(next.title || existing.title).slice(0, 80)}”${predictionChanged ? ' (prediction revised before window close)' : ''}`,
        },
      );
      return { ok: true };
    },

    /**
     * Score a study: freeze the evaluation exactly as it is computed right now.
     *
     * Locking is irreversible on purpose. If a disappointing result could be
     * rescored by moving the window, every number in the ledger would be a
     * negotiation with the leader's self-image rather than a measurement.
     */
    lockImpactStudy(studentId, { outcomeNotes = '' } = {}) {
      const existing = (store.state.impactStudies || []).find((x) => x.id === studentId);
      if (!existing) return fail('That study no longer exists.');
      if (existing.status === 'scored') return fail('This study is already scored.');
      if (existing.status === 'abandoned') return fail('This study was abandoned before scoring, so there is nothing to lock. Declare a new study instead.');
      const evaluation = evaluateStudy(existing, store.state, { now: clock() });
      const horizon = studyHorizonEnd(existing);
      const lockedOn = today();
      const lockedAt = stamp();
      const lockedEarly = horizon ? lockedOn < horizon : false;
      const verdict = evaluation.verdict;
      store.update(
        (draft) => {
          const row = (draft.impactStudies || []).find((x) => x.id === studentId);
          if (!row) return;
          row.status = 'scored';
          row.lockedOn = lockedOn;
          row.verdict = verdict;
          row.evaluation = {
            ...evaluation,
            lockedAt,
            lockedEarly,
          };
          row.executionSnapshot = buildImpactExecutionSnapshot(row, draft, { capturedAt: lockedAt });
          row.outcomeNotes = String(clean(outcomeNotes) ?? '').slice(0, 4000) || row.outcomeNotes;
          row.updatedAt = lockedAt;
          row.history = [...(Array.isArray(row.history) ? row.history : []),
            {
              at: lockedAt,
              type: 'scored',
              summary: `Scored: ${VERDICTS[verdict]?.label || verdict}. ${evaluation.ok ? `Estimate ${evaluation.estimate} (MDE ${evaluation.its?.mde}).` : (evaluation.reason || '')}`.slice(0, 400),
            }].slice(-60);
        },
        {
          type: 'impact.scored',
          entity: 'impact',
          entityId: studentId,
          summary: `Scored study “${existing.title.slice(0, 80)}”: ${VERDICTS[verdict]?.label || verdict}`,
        },
      );
      return { ok: true, verdict, evaluation };
    },

    abandonImpactStudy(studentId, reason = '') {
      const existing = (store.state.impactStudies || []).find((x) => x.id === studentId);
      if (!existing) return fail('That study no longer exists.');
      if (existing.status === 'scored') return fail('A scored study is permanent evidence and cannot be abandoned. It can be archived by deleting it, which is recorded in the audit log.');
      store.update(
        (draft) => {
          const row = (draft.impactStudies || []).find((x) => x.id === studentId);
          if (!row) return;
          row.status = 'abandoned';
          row.updatedAt = stamp();
          row.history = [...(Array.isArray(row.history) ? row.history : []),
            { at: stamp(), type: 'abandoned', summary: `Abandoned before scoring: ${String(clean(reason) ?? '').slice(0, 200) || 'no reason recorded'}` }].slice(-60);
        },
        { type: 'impact.abandoned', entity: 'impact', entityId: studentId, summary: `Abandoned study “${existing.title.slice(0, 80)}” before scoring` },
      );
      return { ok: true };
    },

    deleteImpactStudy(studentId) {
      const existing = (store.state.impactStudies || []).find((x) => x.id === studentId);
      if (!existing) return fail('That study no longer exists.');
      store.update(
        (draft) => {
          draft.impactStudies = (draft.impactStudies || []).filter((x) => x.id !== studentId);
        },
        { type: 'impact.deleted', entity: 'impact', entityId: studentId, summary: `Deleted study “${existing.title.slice(0, 80)}”` },
      );
      return { ok: true };
    },

    /** Explicit follow-through scan: fan every open study out through the same spine. */
    scanImpact() {
      const before = JSON.stringify({
        decisions: (store.state.decisions || []).length,
        links: (store.state.links || []).length,
        people: (store.state.people || []).map((p) => (p.talkingPoints || []).length).join(','),
      });
      store.update(
        () => {},
        {
          type: 'impact.rescan',
          entity: 'workspace',
          entityId: '',
          summary: 'Impact-ledger follow-through scan requested by the leader',
          rules: ['impact'],
          impactScan: true,
        },
      );
      const after = JSON.stringify({
        decisions: (store.state.decisions || []).length,
        links: (store.state.links || []).length,
        people: (store.state.people || []).map((p) => (p.talkingPoints || []).length).join(','),
      });
      return { ok: true, changed: before !== after, propagations: store.lastPropagations || [] };
    },

    /* ------------------------------------------------ implementation fidelity */

    /**
     * Declare an implementation plan (Schema v50).
     *
     * The declaration is the product. A denominator chosen after the fact is
     * not a denominator, it is a rationalisation, so population and planned
     * units are captured here and settleFidelityPlan() is not allowed to edit
     * them afterwards.
     */
    addFidelityPlan(input = {}) {
      const title = String(clean(input.title) ?? '').slice(0, 160);
      if (!title) return fail('Name the intervention — “a plan” with no name cannot be attested later.', 'title');
      const interventionType = String(clean(input.interventionType) || 'other');
      if (!IMPACT_INTERVENTION_IDS.includes(interventionType)) {
        return fail('Choose one of the recorded intervention types.', 'interventionType');
      }
      const windowStart = String(clean(input.windowStart) || today());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(windowStart)) {
        return fail('Record the day delivery started — that is the first day the records are read.', 'windowStart');
      }
      if (windowStart > today()) {
        return fail('A plan cannot start in the future. Declare it on the day delivery actually begins.', 'windowStart');
      }
      const requestedEnd = String(clean(input.windowEnd) || '');
      const windowEnd = /^\d{4}-\d{2}-\d{2}$/.test(requestedEnd) ? requestedEnd : addDays(windowStart, 27);
      if (windowEnd < windowStart) return fail('The delivery window cannot end before it starts.', 'windowEnd');
      if ((daysBetween(windowStart, windowEnd) ?? 0) > FIDELITY_MAX_WINDOW_DAYS) {
        return fail(`Keep the window to ${FIDELITY_MAX_WINDOW_DAYS} days or less. A plan longer than a year is a strategy, not an intervention.`, 'windowEnd');
      }
      const populationRaw = input.population === '' || input.population === null || input.population === undefined
        ? null
        : Math.round(Number(input.population));
      if (populationRaw !== null && (!Number.isFinite(populationRaw) || populationRaw < 1 || populationRaw > 500)) {
        return fail('The intended population must be between 1 and 500 people, or left blank to use the active roster.', 'population');
      }
      const plannedRaw = input.plannedUnits === '' || input.plannedUnits === null || input.plannedUnits === undefined
        ? null
        : Math.round(Number(input.plannedUnits));
      if (plannedRaw !== null && (!Number.isFinite(plannedRaw) || plannedRaw < 1 || plannedRaw > 5000)) {
        return fail('Planned units must be between 1 and 5000, or left blank to use the weekly-cadence suggestion.', 'plannedUnits');
      }
      const selection = impactInterventionSelection(
        store.state,
        interventionType,
        input.interventionId,
        input.interventionLabel,
      );
      if (!selection.ok) return selection;
      const ownerRaw = String(clean(input.ownerId) || '');
      if (ownerRaw && !personExists(ownerRaw)) return fail('That owner no longer exists in the roster.', 'ownerId');
      const studyRaw = String(clean(input.studyId) || '');
      const study = studyRaw ? (store.state.impactStudies || []).find((row) => row && row.id === studyRaw) : null;
      if (studyRaw && !study) return fail('That impact study no longer exists.', 'studyId');
      if (ownerRaw && !personExists(ownerRaw)) return fail('That owner no longer exists in the roster.', 'ownerId');

      const planId = id('fidelity');
      const plannedOrSuggested = plannedRaw
        ?? suggestedPlannedUnits(populationRaw ?? (store.state.people || []).filter((p) => p.status !== 'archived').length, windowStart, windowEnd);
      const stages = defaultStageTargets(windowStart, windowEnd).map((row) => ({ ...row, attested: null }));

      store.update(
        (draft) => {
          draft.fidelityPlans = Array.isArray(draft.fidelityPlans) ? draft.fidelityPlans : [];
          draft.fidelityPlans.push({
            id: planId,
            title,
            interventionType,
            interventionId: selection.interventionId,
            interventionLabel: selection.interventionLabel,
            studyId: study?.id || null,
            ownerId: ownerRaw || null,
            population: populationRaw,
            plannedUnits: plannedOrSuggested,
            windowStart,
            windowEnd,
            status: 'active',
            stages,
            settlement: null,
            notes: String(clean(input.notes) ?? '').slice(0, 1000),
            createdAt: stamp(),
            updatedAt: stamp(),
            history: [{
              at: stamp(),
              type: 'declared',
              summary: `Declared before delivery was graded: ${plannedOrSuggested} planned units across ${populationRaw ?? 'the active roster'} ${populationRaw === 1 ? 'person' : 'people'}.`,
            }],
          });
        },
        {
          type: FIDELITY_DECLARED_EVENT,
          entity: 'fidelity',
          entityId: planId,
          summary: `Declared implementation plan “${title.slice(0, 80)}” for ${interventionType}`,
        },
      );
      return { ok: true, id: planId };
    },

    /** Edit the plan's description and denominators. Settled plans are frozen evidence. */
    updateFidelityPlan(planId, patch = {}) {
      const existing = (store.state.fidelityPlans || []).find((row) => row && row.id === planId);
      if (!existing) return fail('That implementation plan no longer exists.');
      if (existing.status === 'settled') {
        return fail('This plan is settled. Its denominators and settlement are frozen — that is what makes the reading worth anything. Declare a new plan for the next cycle.');
      }
      const next = {};
      const changed = [];
      if (Object.hasOwn(patch, 'title')) {
        const title = String(clean(patch.title) ?? '').slice(0, 160);
        if (!title) return fail('The title cannot be blank.', 'title');
        next.title = title;
      }
      if (Object.hasOwn(patch, 'notes')) next.notes = String(clean(patch.notes) ?? '').slice(0, 1000);
      if (Object.hasOwn(patch, 'ownerId')) {
        const owner = String(clean(patch.ownerId) || '');
        if (owner && !personExists(owner)) return fail('That owner no longer exists in the roster.', 'ownerId');
        next.ownerId = owner || null;
      }
      if (Object.hasOwn(patch, 'windowEnd')) {
        const end = String(clean(patch.windowEnd) || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || end < existing.windowStart) {
          return fail('The window must end on or after its start day.', 'windowEnd');
        }
        if ((daysBetween(existing.windowStart, end) ?? 0) > FIDELITY_MAX_WINDOW_DAYS) {
          return fail(`Keep the window to ${FIDELITY_MAX_WINDOW_DAYS} days or less.`, 'windowEnd');
        }
        next.windowEnd = end;
        changed.push(`window end → ${end}`);
      }
      if (Object.hasOwn(patch, 'population')) {
        const raw = patch.population === '' || patch.population === null ? null : Math.round(Number(patch.population));
        if (raw !== null && (!Number.isFinite(raw) || raw < 1 || raw > 500)) {
          return fail('The intended population must be between 1 and 500 people, or blank for the active roster.', 'population');
        }
        next.population = raw;
        changed.push(`population → ${raw ?? 'active roster'}`);
      }
      if (Object.hasOwn(patch, 'plannedUnits')) {
        const raw = patch.plannedUnits === '' || patch.plannedUnits === null ? null : Math.round(Number(patch.plannedUnits));
        if (raw !== null && (!Number.isFinite(raw) || raw < 1 || raw > 5000)) {
          return fail('Planned units must be between 1 and 5000.', 'plannedUnits');
        }
        next.plannedUnits = raw;
        changed.push(`planned units → ${raw ?? 'not set'}`);
      }
      if (Object.hasOwn(patch, 'studyId')) {
        const study = String(clean(patch.studyId) || '');
        if (study && !(store.state.impactStudies || []).some((row) => row && row.id === study)) {
          return fail('That impact study no longer exists.', 'studyId');
        }
        next.studyId = study || null;
      }
      store.update(
        (draft) => {
          const row = (draft.fidelityPlans || []).find((r) => r && r.id === planId);
          if (!row) return;
          Object.assign(row, next);
          row.updatedAt = stamp();
          if (changed.length) {
            row.history = [...(Array.isArray(row.history) ? row.history : []),
              { at: stamp(), type: 'revised', summary: `Plan revised before settlement: ${changed.join('; ')}` }].slice(-60);
          }
        },
        {
          type: FIDELITY_UPDATED_EVENT,
          entity: 'fidelity',
          entityId: planId,
          summary: `Updated implementation plan “${(next.title || existing.title).slice(0, 80)}”`,
        },
      );
      return { ok: true };
    },

    /**
     * Record a dated human reading of one stage.
     *
     * The disagreement rule is the point of the whole module: when the verdict
     * contradicts what the workspace records show, a reason is REQUIRED. Not to
     * punish anyone — a real conversation that was never logged looks exactly
     * like an overclaim, and writing down which one it was is the only way the
     * next reader can tell them apart.
     */
    attestFidelityStage(planId, stageKey, { verdict, note = '', byId = null } = {}) {
      const existing = (store.state.fidelityPlans || []).find((row) => row && row.id === planId);
      if (!existing) return fail('That implementation plan no longer exists.');
      if (existing.status === 'settled') return fail('This plan is settled; its attestations are frozen.');
      if (existing.status === 'abandoned') return fail('This plan was abandoned before it was graded.');
      if (!FIDELITY_STAGE_KEYS.includes(stageKey)) return fail('Choose a stage that exists in the model.', 'stage');
      const chosen = String(verdict || '');
      if (!FIDELITY_VERDICTS.includes(chosen)) return fail('Record one of: met, partly met, not met.', 'verdict');
      const reading = observeFidelity(existing, store.state, clock());
      const stage = reading.stages.find((row) => row.key === stageKey);
      const agreement = stage ? stageAgreement(stage.observed ? stage.observed.pct / 100 : null, chosen) : 'unverifiable';
      const contradiction = agreement === 'optimistic' || agreement === 'conservative';
      const cleanNote = String(clean(note) ?? '').slice(0, FIDELITY_MAX_NOTE);
      if (contradiction && cleanNote.length < 12) {
        return fail(
          agreement === 'optimistic'
            ? 'Your verdict says this was met, but the records show it was not. Say what happened — work that was never logged is the usual reason, and it is worth knowing.'
            : 'Your verdict says this was not met, but the records show it was. Say why the records overstate it.',
          'note',
        );
      }
      const by = String(clean(byId) || '') || null;
      if (by && !personExists(by)) return fail('That person no longer exists in the roster.', 'byId');

      store.update(
        (draft) => {
          const row = (draft.fidelityPlans || []).find((r) => r && r.id === planId);
          if (!row) return;
          row.stages = (row.stages || []).map((stageRow) => (stageRow.key === stageKey
            ? {
              ...stageRow,
              attested: {
                verdict: chosen,
                on: today(),
                byId: by,
                note: cleanNote,
                at: stamp(),
              },
            }
            : stageRow));
          row.updatedAt = stamp();
          row.history = [...(Array.isArray(row.history) ? row.history : []),
            {
              at: stamp(),
              type: 'attested',
              summary: `Attested ${stageKey}: ${FIDELITY_VERDICT_LABELS[chosen]}${contradiction ? ` (records disagree — ${AGREEMENT_LABELS[agreement]})` : ''}`.slice(0, 300),
            }].slice(-60);
        },
        {
          type: FIDELITY_ATTESTED_EVENT,
          entity: 'fidelity',
          entityId: planId,
          stage: stageKey,
          agreement,
          summary: `Attested ${stageKey} on “${existing.title.slice(0, 60)}”: ${FIDELITY_VERDICT_LABELS[chosen]}`,
        },
      );
      return { ok: true, agreement };
    },

    /**
     * Freeze the reading. Settlement is irreversible on purpose: if a
     * disappointing number could be re-settled by waiting a week, every figure
     * in the ledger would be a negotiation with the leader's self-image.
     */
    settleFidelityPlan(planId, { note = '' } = {}) {
      const existing = (store.state.fidelityPlans || []).find((row) => row && row.id === planId);
      if (!existing) return fail('That implementation plan no longer exists.');
      if (existing.status === 'settled') return fail('This plan is already settled.');
      if (existing.status === 'abandoned') return fail('This plan was abandoned, so there is nothing to settle. Declare a new one.');
      const reading = observeFidelity(existing, store.state, clock());
      if (reading.unitCount === 0 && !reading.stages.some((row) => row.attested)) {
        return fail('Nothing has been delivered or attested in this window yet. Settling now would freeze a reading of zero that says more about the calendar than about you.');
      }
      const settlement = {
        version: 1,
        on: today(),
        at: stamp(),
        byId: null,
        gradeId: reading.grade.id,
        indexPct: reading.index === null ? null : Math.round(reading.index * 1000) / 10,
        coveragePct: Math.round(reading.coverage * 1000) / 10,
        exposurePct: reading.exposurePct,
        unitCount: reading.unitCount,
        populationCount: reading.population.value,
        plannedUnits: reading.plannedUnits ?? 0,
        instrumented: Boolean(reading.instrument),
        stages: reading.stages.map((row) => ({
          key: row.key,
          scorePct: row.score === null ? null : Math.round(row.score * 1000) / 10,
          source: row.source,
          agreement: row.agreement,
        })),
      };
      store.update(
        (draft) => {
          const row = (draft.fidelityPlans || []).find((r) => r && r.id === planId);
          if (!row) return;
          row.status = 'settled';
          row.settlement = settlement;
          row.updatedAt = stamp();
          row.history = [...(Array.isArray(row.history) ? row.history : []),
            {
              at: stamp(),
              type: 'settled',
              summary: `Settled: ${reading.grade.label}${reading.index === null ? '' : ` — index ${settlement.indexPct}%, exposure ${settlement.exposurePct ?? '—'}%`}. ${String(clean(note) ?? '').slice(0, 200)}`.slice(0, 400),
            }].slice(-60);
        },
        {
          type: FIDELITY_SETTLED_EVENT,
          entity: 'fidelity',
          entityId: planId,
          underexposed: reading.underExposed === true,
          summary: `Settled implementation plan “${existing.title.slice(0, 60)}”: ${reading.grade.label}`,
        },
      );
      return { ok: true, settlement, reading };
    },

    /** Reopen a settled plan. The settlement stays in history; it is not erased. */
    reopenFidelityPlan(planId, reason = '') {
      const existing = (store.state.fidelityPlans || []).find((row) => row && row.id === planId);
      if (!existing) return fail('That implementation plan no longer exists.');
      if (existing.status !== 'settled') return fail('Only a settled plan can be reopened.');
      store.update(
        (draft) => {
          const row = (draft.fidelityPlans || []).find((r) => r && r.id === planId);
          if (!row) return;
          row.status = 'active';
          row.settlement = null;
          row.updatedAt = stamp();
          row.history = [...(Array.isArray(row.history) ? row.history : []),
            { at: stamp(), type: 'reopened', summary: `Reopened after settlement: ${String(clean(reason) ?? '').slice(0, 200) || 'no reason recorded'}` }].slice(-60);
        },
        { type: 'fidelity.reopened', entity: 'fidelity', entityId: planId, summary: `Reopened implementation plan “${existing.title.slice(0, 80)}”` },
      );
      return { ok: true };
    },

    abandonFidelityPlan(planId, reason = '') {
      const existing = (store.state.fidelityPlans || []).find((row) => row && row.id === planId);
      if (!existing) return fail('That implementation plan no longer exists.');
      if (existing.status === 'settled') {
        return fail('A settled plan is evidence and cannot be abandoned. Delete it if you must, which is recorded in the audit log.');
      }
      store.update(
        (draft) => {
          const row = (draft.fidelityPlans || []).find((r) => r && r.id === planId);
          if (!row) return;
          row.status = 'abandoned';
          row.updatedAt = stamp();
          row.history = [...(Array.isArray(row.history) ? row.history : []),
            { at: stamp(), type: 'abandoned', summary: `Abandoned: ${String(clean(reason) ?? '').slice(0, 200) || 'no reason recorded'}` }].slice(-60);
        },
        { type: 'fidelity.abandoned', entity: 'fidelity', entityId: planId, summary: `Abandoned implementation plan “${existing.title.slice(0, 80)}”` },
      );
      return { ok: true };
    },

    deleteFidelityPlan(planId) {
      const existing = (store.state.fidelityPlans || []).find((row) => row && row.id === planId);
      if (!existing) return fail('That implementation plan no longer exists.');
      store.update(
        (draft) => {
          draft.fidelityPlans = (draft.fidelityPlans || []).filter((row) => row && row.id !== planId);
          draft.links = (draft.links || []).filter((link) => !(
            (link.sourceType === 'fidelity' && link.sourceId === planId)
            || (link.targetType === 'fidelity' && link.targetId === planId)
          ));
        },
        { type: 'fidelity.deleted', entity: 'fidelity', entityId: planId, summary: `Deleted implementation plan “${existing.title.slice(0, 80)}”` },
      );
      return { ok: true };
    },

    /** Explicit follow-through scan over every open plan, on the shared spine. */
    scanFidelity() {
      const before = JSON.stringify({
        decisions: (store.state.decisions || []).length,
        delegations: (store.state.delegations || []).length,
        links: (store.state.links || []).length,
      });
      store.update(
        () => {},
        {
          type: FIDELITY_SCAN_EVENT,
          entity: 'workspace',
          entityId: '',
          summary: 'Implementation-fidelity scan requested by the leader',
          rules: ['fidelity'],
        },
      );
      const after = JSON.stringify({
        decisions: (store.state.decisions || []).length,
        delegations: (store.state.delegations || []).length,
        links: (store.state.links || []).length,
      });
      return { ok: true, changed: before !== after, propagations: store.lastPropagations || [] };
    },

    /* ------------------------------------------- merit & pay equity (v51) */

    /**
     * Declare or replace a compensation band.
     *
     * Bands are the only market structure this app holds, and they are declared
     * rather than imported: a made-up band would silently make every compa-ratio
     * in the workspace wrong. A band that does not form a range is refused
     * instead of repaired.
     */
    addCompBand(input = {}) {
      const level = String(clean(input.level) || '');
      if (!LEVELS.includes(level)) return fail('Choose the level this band describes.', 'level');
      const min = Number(input.min);
      const mid = Number(input.mid);
      const max = Number(input.max);
      if (![min, mid, max].every((value) => Number.isFinite(value) && value > 0)) {
        return fail('A band needs a floor, a midpoint and a ceiling, all greater than zero.', 'min');
      }
      if (!(min < mid && mid < max)) {
        return fail('The band must rise: floor < midpoint < ceiling. A band where the midpoint sits outside the range cannot position anyone.', 'mid');
      }
      if (max > COMP_MAX_PAY) return fail('That ceiling is outside the range this app will store. Check the magnitude.', 'max');
      const effectiveOn = String(clean(input.effectiveOn) || today());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveOn)) return fail('Record the day this band takes effect.', 'effectiveOn');
      const duplicate = (store.state.compBands || []).some((band) => band.level === level && band.effectiveOn === effectiveOn);
      if (duplicate) return fail('That level already has a band dated the same day. Edit it, or date this one differently.', 'effectiveOn');

      const bandId = id('band');
      store.update(
        (draft) => {
          draft.compBands = Array.isArray(draft.compBands) ? draft.compBands : [];
          draft.compBands.push({
            id: bandId,
            level,
            label: String(clean(input.label) || level).slice(0, 60),
            min: Math.round(min * 100) / 100,
            mid: Math.round(mid * 100) / 100,
            max: Math.round(max * 100) / 100,
            effectiveOn,
            notes: String(clean(input.notes) ?? '').slice(0, 400),
            createdAt: stamp(),
            updatedAt: stamp(),
          });
        },
        { type: 'comp.band.declared', entity: 'band', entityId: bandId, summary: `Declared a ${level} band from ${min} to ${max}` },
      );
      return { ok: true, id: bandId };
    },

    updateCompBand(bandId, patch = {}) {
      const existing = (store.state.compBands || []).find((band) => band && band.id === bandId);
      if (!existing) return fail('That band no longer exists.');
      const next = {
        min: patch.min === undefined ? existing.min : Number(patch.min),
        mid: patch.mid === undefined ? existing.mid : Number(patch.mid),
        max: patch.max === undefined ? existing.max : Number(patch.max),
      };
      if (![next.min, next.mid, next.max].every((value) => Number.isFinite(value) && value > 0)) {
        return fail('A band needs a floor, a midpoint and a ceiling, all greater than zero.', 'min');
      }
      if (!(next.min < next.mid && next.mid < next.max)) {
        return fail('The band must rise: floor < midpoint < ceiling.', 'mid');
      }
      store.update(
        (draft) => {
          const row = (draft.compBands || []).find((band) => band && band.id === bandId);
          if (!row) return;
          row.min = Math.round(next.min * 100) / 100;
          row.mid = Math.round(next.mid * 100) / 100;
          row.max = Math.round(next.max * 100) / 100;
          if (patch.label !== undefined) row.label = String(clean(patch.label) || row.level).slice(0, 60);
          if (patch.notes !== undefined) row.notes = String(clean(patch.notes) ?? '').slice(0, 400);
          row.updatedAt = stamp();
        },
        { type: 'comp.band.updated', entity: 'band', entityId: bandId, summary: `Updated the ${existing.level} band` },
      );
      return { ok: true };
    },

    deleteCompBand(bandId) {
      const existing = (store.state.compBands || []).find((band) => band && band.id === bandId);
      if (!existing) return fail('That band no longer exists.');
      store.update(
        (draft) => {
          draft.compBands = (draft.compBands || []).filter((band) => band && band.id !== bandId);
        },
        { type: 'comp.band.deleted', entity: 'band', entityId: bandId, summary: `Deleted the ${existing.level} band effective ${existing.effectiveOn}` },
      );
      return { ok: true };
    },

    /**
     * Declare a merit cycle. The budget and the comparison dimension are part of
     * the declaration: a budget chosen after the allocations is not a budget, it
     * is a report of what was spent.
     */
    addMeritCycle(input = {}) {
      const label = String(clean(input.label) || '').slice(0, 120);
      if (!label) return fail('Name the cycle — “the 2026 cycle” has to survive being read again next year.', 'label');
      const currency = String(clean(input.currency) || 'USD').toUpperCase().slice(0, 3);
      if (!/^[A-Z]{3}$/.test(currency)) return fail('Use a three-letter currency code.', 'currency');
      const effectiveOn = String(clean(input.effectiveOn) || today());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveOn)) return fail('Record the date the new pay takes effect.', 'effectiveOn');
      const horizonDays = daysBetween(today(), effectiveOn);
      if (horizonDays !== null && horizonDays > 400) return fail('An effective date more than a year away is a plan, not a cycle. Keep it inside a year.', 'effectiveOn');
      const kind = input.budgetKind === 'pool-pct' ? 'pool-pct' : 'amount';
      const value = Number(input.budgetValue);
      if (!Number.isFinite(value) || value <= 0) {
        return fail(kind === 'pool-pct' ? 'Set the merit pool as a percentage of payroll, above zero.' : 'Set the merit budget in money, above zero.', 'budgetValue');
      }
      if (kind === 'pool-pct' && value > 100) return fail('A merit pool above 100% of payroll is almost certainly a typo.', 'budgetValue');
      if (kind === 'amount' && value > COMP_MAX_BUDGET) return fail('That budget is outside the range this app will store. Check the magnitude.', 'budgetValue');
      const dimension = COMP_DIMENSIONS.includes(input.comparisonDimension) ? input.comparisonDimension : 'origin';
      const ownerId = String(clean(input.ownerId) || '');
      if (ownerId && !personExists(ownerId)) return fail('That owner no longer exists in the roster.', 'ownerId');

      const cycleId = id('merit');
      store.update(
        (draft) => {
          draft.meritCycles = Array.isArray(draft.meritCycles) ? draft.meritCycles : [];
          draft.meritCycles.push({
            id: cycleId,
            label,
            currency,
            effectiveOn,
            status: 'draft',
            budget: { kind, value: kind === 'pool-pct' ? Math.round(value * 100) / 100 : Math.round(value * 100) / 100 },
            comparison: { dimension },
            ownerId: ownerId || null,
            rows: [],
            audit: null,
            outcomes: [],
            createdAt: stamp(),
            updatedAt: stamp(),
            history: [{
              at: stamp(),
              type: 'declared',
              summary: `Declared a ${kind === 'pool-pct' ? `${value}% of payroll` : `${currency} ${Math.round(value)}`} budget, compared by ${COMP_DIMENSION_LABELS[dimension].toLowerCase()}.`,
            }],
          });
        },
        { type: COMP_DECLARED_EVENT, entity: 'merit', entityId: cycleId, summary: `Declared merit cycle “${label.slice(0, 80)}”` },
      );
      return { ok: true, id: cycleId };
    },

    updateMeritCycle(cycleId, patch = {}) {
      const existing = (store.state.meritCycles || []).find((cycle) => cycle && cycle.id === cycleId);
      if (!existing) return fail('That merit cycle no longer exists.');
      if (existing.status === 'finalized') return fail('A finalized cycle is frozen evidence. Reopen it before changing the budget or the comparison.', 'cycleId');
      const next = {};
      if (patch.label !== undefined) {
        const label = String(clean(patch.label) || '').slice(0, 120);
        if (!label) return fail('A cycle needs a name.', 'label');
        next.label = label;
      }
      if (patch.budgetValue !== undefined) {
        const value = Number(patch.budgetValue);
        if (!Number.isFinite(value) || value <= 0) return fail('Set a budget above zero.', 'budgetValue');
        if (existing.budget.kind === 'pool-pct' && value > 100) return fail('A merit pool above 100% of payroll is almost certainly a typo.', 'budgetValue');
        if (existing.budget.kind === 'amount' && value > COMP_MAX_BUDGET) return fail('That budget is outside the range this app will store.', 'budgetValue');
        next.budgetValue = Math.round(value * 100) / 100;
      }
      if (patch.comparisonDimension !== undefined) {
        if (!COMP_DIMENSIONS.includes(patch.comparisonDimension)) return fail('Choose one of the recorded comparison dimensions.', 'comparisonDimension');
        next.comparisonDimension = patch.comparisonDimension;
      }
      if (patch.ownerId !== undefined) {
        const ownerId = String(clean(patch.ownerId) || '');
        if (ownerId && !personExists(ownerId)) return fail('That owner no longer exists in the roster.', 'ownerId');
        next.ownerId = ownerId || null;
      }
      store.update(
        (draft) => {
          const row = (draft.meritCycles || []).find((cycle) => cycle && cycle.id === cycleId);
          if (!row) return;
          if (next.label) row.label = next.label;
          if (next.budgetValue !== undefined) row.budget.value = next.budgetValue;
          if (next.comparisonDimension) row.comparison.dimension = next.comparisonDimension;
          if (next.ownerId !== undefined) row.ownerId = next.ownerId;
          row.updatedAt = stamp();
          row.history = Array.isArray(row.history) ? row.history : [];
          row.history.push({ at: stamp(), type: 'updated', summary: 'Updated the cycle declaration. The budget and comparison are inputs, not results.' });
          row.history = row.history.slice(-COMP_HISTORY_CAP);
        },
        { type: COMP_UPDATED_EVENT, entity: 'merit', entityId: cycleId, summary: `Updated merit cycle “${existing.label.slice(0, 80)}”` },
      );
      return { ok: true };
    },

    /**
     * Set one pay decision. The current pay, the proposal, the hire origin and
     * the recorded retention concern live together because they are read
     * together: a proposal without the band and the origin is not a decision.
     */
    setMeritRow(cycleId, personId, patch = {}) {
      const existing = (store.state.meritCycles || []).find((cycle) => cycle && cycle.id === cycleId);
      if (!existing) return fail('That merit cycle no longer exists.');
      if (existing.status === 'finalized') return fail('Reopen the cycle before changing a pay decision — the frozen audit must not disagree with the record.', 'cycleId');
      const person = (store.state.people || []).find((row) => row && row.id === personId);
      if (!person) return fail('That person is no longer in the roster.', 'personId');
      if ((existing.rows || []).length >= COMP_MAX_ROWS && !(existing.rows || []).some((row) => row.personId === personId)) {
        return fail(`A cycle holds at most ${COMP_MAX_ROWS} pay decisions.`, 'personId');
      }
      const current = (existing.rows || []).find((row) => row.personId === personId) || null;

      let currentPay = current?.currentPay ?? null;
      if (patch.currentPay !== undefined) {
        if (patch.currentPay === '' || patch.currentPay === null) currentPay = null;
        else {
          const value = Number(patch.currentPay);
          if (!Number.isFinite(value) || value <= 0 || value > COMP_MAX_PAY) {
            return fail('Current pay must be a positive number inside the range this app stores. Leave it blank rather than zero.', 'currentPay');
          }
          currentPay = Math.round(value * 100) / 100;
        }
      }
      let proposedPay = current?.proposedPay ?? null;
      if (patch.proposedPay !== undefined) {
        if (patch.proposedPay === '' || patch.proposedPay === null) proposedPay = null;
        else {
          const value = Number(patch.proposedPay);
          if (!Number.isFinite(value) || value < 0 || value > COMP_MAX_PAY) return fail('The proposal must be a number inside the range this app stores.', 'proposedPay');
          proposedPay = Math.round(value * 100) / 100;
        }
      }
      if (currentPay !== null && proposedPay !== null) {
        const adjustPct = ((proposedPay - currentPay) / currentPay) * 100;
        const ceiling = Number(store.state.settings?.compMaxAdjustPct) || COMP_CONVENTIONS.maxAdjustPct;
        if (adjustPct > ceiling + 0.001) {
          return fail(`That is a ${Math.round(adjustPct)}% increase. The cycle ceiling is ${ceiling}% — past it, this is a promotion or a market correction, and it needs its own decision rather than a merit line.`, 'proposedPay');
        }
        if (adjustPct < -0.001) {
          return fail('A merit cycle is for increases. A pay cut belongs in its own decision with its own record.', 'proposedPay');
        }
      }
      const origin = patch.origin !== undefined
        ? (COMP_ORIGINS.includes(patch.origin) ? patch.origin : null)
        : (current?.origin || 'unknown');
      if (origin === null) return fail('Choose how this person joined, or leave it unrecorded.', 'origin');
      const level = LEVELS.includes(patch.level) ? patch.level : (current?.level || person.level || 'ic');
      const note = patch.note === undefined ? (current?.note || '') : String(clean(patch.note) ?? '').slice(0, COMP_MAX_NOTE);

      store.update(
        (draft) => {
          const cycle = (draft.meritCycles || []).find((row) => row && row.id === cycleId);
          if (!cycle) return;
          cycle.rows = Array.isArray(cycle.rows) ? cycle.rows : [];
          const row = cycle.rows.find((candidate) => candidate.personId === personId);
          const payload = {
            personId,
            level,
            currentPay,
            proposedPay,
            origin,
            retentionConcern: patch.retentionConcern === undefined ? (current?.retentionConcern === true) : patch.retentionConcern === true,
            note,
            updatedAt: stamp(),
          };
          if (row) Object.assign(row, payload);
          else cycle.rows.push(payload);
          cycle.updatedAt = stamp();
        },
        { type: COMP_UPDATED_EVENT, entity: 'merit', entityId: cycleId, summary: `Recorded pay for ${person.name} in “${existing.label.slice(0, 60)}”` },
      );
      return { ok: true };
    },

    removeMeritRow(cycleId, personId) {
      const existing = (store.state.meritCycles || []).find((cycle) => cycle && cycle.id === cycleId);
      if (!existing) return fail('That merit cycle no longer exists.');
      if (existing.status === 'finalized') return fail('Reopen the cycle before removing a pay decision.', 'cycleId');
      store.update(
        (draft) => {
          const cycle = (draft.meritCycles || []).find((row) => row && row.id === cycleId);
          if (!cycle) return;
          cycle.rows = (cycle.rows || []).filter((row) => row.personId !== personId);
          cycle.updatedAt = stamp();
        },
        { type: COMP_UPDATED_EVENT, entity: 'merit', entityId: cycleId, summary: `Removed a pay row from “${existing.label.slice(0, 60)}”` },
      );
      return { ok: true };
    },

    /** Populate missing rows for the active roster. Pay is never guessed. */
    syncMeritRoster(cycleId) {
      const existing = (store.state.meritCycles || []).find((cycle) => cycle && cycle.id === cycleId);
      if (!existing) return fail('That merit cycle no longer exists.');
      if (existing.status === 'finalized') return fail('Reopen the cycle before adding people to it.', 'cycleId');
      const present = new Set((existing.rows || []).map((row) => row.personId));
      const additions = (store.state.people || [])
        .filter((person) => person && person.status !== 'archived' && !present.has(person.id))
        .slice(0, Math.max(0, COMP_MAX_ROWS - (existing.rows || []).length));
      if (!additions.length) return { ok: true, added: 0 };
      store.update(
        (draft) => {
          const cycle = (draft.meritCycles || []).find((row) => row && row.id === cycleId);
          if (!cycle) return;
          cycle.rows = Array.isArray(cycle.rows) ? cycle.rows : [];
          for (const person of additions) {
            cycle.rows.push({
              personId: person.id,
              level: person.level || 'ic',
              currentPay: null,
              proposedPay: null,
              origin: 'unknown',
              retentionConcern: false,
              note: '',
              updatedAt: stamp(),
            });
          }
          cycle.updatedAt = stamp();
        },
        { type: COMP_UPDATED_EVENT, entity: 'merit', entityId: cycleId, summary: `Added ${additions.length} roster row(s) with no pay recorded` },
      );
      return { ok: true, added: additions.length };
    },

    /**
     * Write one of the priced policies onto the cycle.
     *
     * Recomputed server-side from the same function the comparison card used, so
     * a stale page cannot write a proposal the analysis never priced.
     */
    applyMeritPolicy(cycleId, policyId) {
      const existing = (store.state.meritCycles || []).find((cycle) => cycle && cycle.id === cycleId);
      if (!existing) return fail('That merit cycle no longer exists.');
      if (existing.status === 'finalized') return fail('Reopen the cycle before applying a policy.', 'cycleId');
      const comparison = policyComparison(store.state, existing, clock());
      if (comparison.status !== 'ok') {
        return fail(comparison.reason === 'no-pay' ? 'Record current pay for at least one person before applying a policy.' : 'Set a budget above zero before applying a policy.', 'budgetValue');
      }
      const policy = comparison.policies.find((row) => row.id === policyId);
      if (!policy) return fail('That policy is not one of the priced options.', 'policyId');
      store.update(
        (draft) => {
          const cycle = (draft.meritCycles || []).find((row) => row && row.id === cycleId);
          if (!cycle) return;
          const byPerson = new Map(policy.plan.map((row) => [row.personId, row]));
          for (const row of (cycle.rows || [])) {
            const planned = byPerson.get(row.personId);
            if (!planned || planned.proposedPay === null) continue;
            row.proposedPay = planned.proposedPay;
            row.updatedAt = stamp();
          }
          cycle.updatedAt = stamp();
          cycle.history = Array.isArray(cycle.history) ? cycle.history : [];
          cycle.history.push({
            at: stamp(),
            type: 'policy-applied',
            summary: `Applied “${policy.label}”: ${Math.round(policy.spend)} spend (${policy.usePct ?? '—'}% of budget), mean ${policy.meanAdjustPct}%, modelled ${policy.expectedDepartures} expected departure(s).`,
          });
          cycle.history = cycle.history.slice(-COMP_HISTORY_CAP);
        },
        { type: COMP_UPDATED_EVENT, entity: 'merit', entityId: cycleId, summary: `Applied the ${policy.label.toLowerCase()} policy to “${existing.label.slice(0, 60)}”` },
      );
      return { ok: true, policy: { ...policy, plan: undefined } };
    },

    /** Explicit scan: typed links, fairness propagation and outcome reconciliation. */
    scanMerit() {
      const before = JSON.stringify({
        decisions: (store.state.decisions || []).length,
        delegations: (store.state.delegations || []).length,
        links: (store.state.links || []).length,
        outcomes: (store.state.meritCycles || []).reduce((acc, cycle) => acc + (cycle.outcomes || []).length, 0),
      });
      store.update(
        () => {},
        {
          type: COMP_SCANNED_EVENT,
          entity: 'workspace',
          entityId: '',
          summary: 'Merit & pay-equity scan requested by the leader',
          rules: ['comp'],
        },
      );
      const after = JSON.stringify({
        decisions: (store.state.decisions || []).length,
        delegations: (store.state.delegations || []).length,
        links: (store.state.links || []).length,
        outcomes: (store.state.meritCycles || []).reduce((acc, cycle) => acc + (cycle.outcomes || []).length, 0),
      });
      return { ok: true, changed: before !== after, propagations: store.lastPropagations || [] };
    },

    /**
     * Finalize: freeze the reading, then let the rules open the work.
     *
     * The snapshot is built inside the same transaction as the status change, so
     * the frozen audit and the event that propagates it cannot disagree.
     */
    finalizeMeritCycle(cycleId) {
      const existing = (store.state.meritCycles || []).find((cycle) => cycle && cycle.id === cycleId);
      if (!existing) return fail('That merit cycle no longer exists.');
      if (existing.status === 'finalized') return fail('This cycle is already finalized.');
      const reading = fairnessReading(store.state, existing, clock());
      const priced = reading.rows.filter((row) => row.currentPay !== null);
      if (!priced.length) return fail('Record current pay for at least one person before finalizing — an empty cycle freezes nothing.', 'cycleId');
      const missingPay = reading.rows.filter((row) => row.currentPay === null || row.proposedPay === null);
      if (missingPay.length) {
        return fail(`${missingPay.length} row(s) have no current pay or no proposal. A frozen audit cannot include a blank decision.`, 'cycleId');
      }
      if (reading.policies.status !== 'ok') return fail('Set a budget above zero before finalizing.', 'budgetValue');
      if (reading.spent > reading.budget.amount + 0.5) {
        return fail(`The proposals total ${Math.round(reading.spent)} against a ${Math.round(reading.budget.amount)} budget. Reduce them, or record the overspend as its own decision.`, 'budgetValue');
      }
      const snapshot = buildFairnessSnapshot(reading, { capturedAt: stamp(), byId: existing.ownerId || null });
      store.update(
        (draft) => {
          const cycle = (draft.meritCycles || []).find((row) => row && row.id === cycleId);
          if (!cycle) return;
          const previous = cycle.audit;
          cycle.history = Array.isArray(cycle.history) ? cycle.history : [];
          if (previous) {
            cycle.history.push({
              at: stamp(),
              type: 'audit-superseded',
              summary: `Superseded the frozen audit of ${previous.on || 'an unrecorded date'}: gap ${previous.decomposition?.gapPct ?? '—'}%, unexplained ${previous.decomposition?.unexplainedPct ?? '—'}%, four-fifths ${previous.impact?.ratio ?? '—'}, ${previous.rowCount} row(s).`,
            });
          }
          cycle.audit = snapshot;
          cycle.status = 'finalized';
          cycle.updatedAt = stamp();
          cycle.history.push({
            at: stamp(),
            type: 'finalized',
            summary: `Froze the audit: ${Math.round(snapshot.spent)} committed against ${Math.round(snapshot.budget.amount)}, ${snapshot.integrity.withoutPay} row(s) without pay, ${snapshot.compression.inversion} inversion(s), ${snapshot.compression.loyaltyPenalty} external-premium finding(s).`,
          });
          cycle.history = cycle.history.slice(-COMP_HISTORY_CAP);
        },
        { type: COMP_FINALIZED_EVENT, entity: 'merit', entityId: cycleId, summary: `Finalized merit cycle “${existing.label.slice(0, 80)}”` },
      );
      return { ok: true, audit: snapshot };
    },

    reopenMeritCycle(cycleId) {
      const existing = (store.state.meritCycles || []).find((cycle) => cycle && cycle.id === cycleId);
      if (!existing) return fail('That merit cycle no longer exists.');
      if (existing.status !== 'finalized') return fail('Only a finalized cycle can be reopened.');
      store.update(
        (draft) => {
          const cycle = (draft.meritCycles || []).find((row) => row && row.id === cycleId);
          if (!cycle) return;
          cycle.status = 'draft';
          cycle.updatedAt = stamp();
          cycle.history = Array.isArray(cycle.history) ? cycle.history : [];
          cycle.history.push({
            at: stamp(),
            type: 'reopened',
            summary: 'Reopened the cycle. The frozen audit is kept until the next finalization supersedes it; resolved outcomes are facts and are never discarded.',
          });
          cycle.history = cycle.history.slice(-COMP_HISTORY_CAP);
        },
        { type: COMP_UPDATED_EVENT, entity: 'merit', entityId: cycleId, summary: `Reopened merit cycle “${existing.label.slice(0, 80)}”` },
      );
      return { ok: true };
    },

    abandonMeritCycle(cycleId) {
      const existing = (store.state.meritCycles || []).find((cycle) => cycle && cycle.id === cycleId);
      if (!existing) return fail('That merit cycle no longer exists.');
      store.update(
        (draft) => {
          const cycle = (draft.meritCycles || []).find((row) => row && row.id === cycleId);
          if (!cycle) return;
          cycle.status = 'abandoned';
          cycle.updatedAt = stamp();
          cycle.history = Array.isArray(cycle.history) ? cycle.history : [];
          cycle.history.push({ at: stamp(), type: 'abandoned', summary: 'Abandoned. The rows and any frozen audit stay readable as history.' });
          cycle.history = cycle.history.slice(-COMP_HISTORY_CAP);
        },
        { type: 'comp.cycle.abandoned', entity: 'merit', entityId: cycleId, summary: `Abandoned merit cycle “${existing.label.slice(0, 80)}”` },
      );
      return { ok: true };
    },

    deleteMeritCycle(cycleId) {
      const existing = (store.state.meritCycles || []).find((cycle) => cycle && cycle.id === cycleId);
      if (!existing) return fail('That merit cycle no longer exists.');
      store.update(
        (draft) => {
          draft.meritCycles = (draft.meritCycles || []).filter((row) => row && row.id !== cycleId);
          draft.links = (draft.links || []).filter((link) => !(
            (link.sourceType === 'merit' && link.sourceId === cycleId)
            || (link.targetType === 'merit' && link.targetId === cycleId)
          ));
        },
        { type: 'comp.cycle.deleted', entity: 'merit', entityId: cycleId, summary: `Deleted merit cycle “${existing.label.slice(0, 80)}”` },
      );
      return { ok: true };
    },

    /* ------------------------------------ workforce transition (v52) */

    /**
     * Declare a transition programme.
     *
     * The target, the criteria weights and the comparison dimension are part of
     * the declaration, in the same spirit as a merit budget: a target chosen
     * after the names is a description, not a constraint. Nothing is inferred
     * about who should be in it.
     */
    addTransitionProgram(input = {}) {
      const label = String(clean(input.label) || '').slice(0, 140);
      if (!label) return fail('Name the programme. “The reduction” has to survive being read again in a year.', 'label');
      const currency = String(clean(input.currency) || 'USD').toUpperCase().slice(0, 3);
      if (!/^[A-Z]{3}$/.test(currency)) return fail('Use a three-letter currency code.', 'currency');
      const kind = TRANSITION_KINDS.includes(input.kind) ? input.kind : 'reduction';
      const effectiveOn = String(clean(input.effectiveOn) || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveOn)) return fail('Record the date the change takes effect.', 'effectiveOn');
      const lead = daysBetween(today(), effectiveOn);
      if (lead === null || lead < 0) {
        return fail('An effective date in the past is a record of a change, not a plan for one. Choose a future date.', 'effectiveOn');
      }
      if (lead > 730) return fail('An effective date more than two years away is a strategy, not a transition programme.', 'effectiveOn');
      const headcount = Math.round(Number(input.headcount));
      if (!Number.isFinite(headcount) || headcount < 1) return fail('Set how many roles the programme has to remove. Zero is not a programme.', 'headcount');
      if (headcount > 300) return fail('This app stores up to 300 candidates in one programme. Split it, or use a real HRIS for a change this size.', 'headcount');
      const ceilingRaw = input.costCeiling;
      const costCeiling = ceilingRaw === null || ceilingRaw === undefined || ceilingRaw === '' ? null : Number(ceilingRaw);
      if (costCeiling !== null && (!Number.isFinite(costCeiling) || costCeiling < 0)) {
        return fail('A cost ceiling must be a real number, or left blank.', 'costCeiling');
      }
      const dimension = TRANSITION_DIMENSIONS.includes(input.dimension) ? input.dimension : 'team';
      const weights = {};
      for (const criterion of TRANSITION_CRITERIA) {
        const raw = Number(input.weights?.[criterion.key]);
        weights[criterion.key] = Number.isFinite(raw) && raw >= 0 ? Math.min(100, raw) : criterion.weight;
      }
      const ownerId = String(clean(input.ownerId) || '');
      if (ownerId && !personExists(ownerId)) return fail('That owner is no longer in the roster.', 'ownerId');

      const programId = id('transition');
      store.update(
        (draft) => {
          draft.transitionPrograms = Array.isArray(draft.transitionPrograms) ? draft.transitionPrograms : [];
          draft.transitionPrograms.push({
            id: programId,
            label,
            currency,
            kind,
            status: 'draft',
            declaredOn: today(),
            effectiveOn,
            dimension,
            target: { headcount, costCeiling: costCeiling === null ? null : Math.round(costCeiling * 100) / 100 },
            weights,
            ownerId: ownerId || null,
            rows: [],
            gates: [],
            snapshot: null,
            outcomes: [],
            notes: String(clean(input.notes) || '').slice(0, 1000),
            createdAt: stamp(),
            updatedAt: stamp(),
            history: [{
              at: stamp(),
              type: 'declared',
              summary: `Declared ${headcount} exit(s) effective ${effectiveOn}, compared by ${dimension}, with weights ${TRANSITION_CRITERIA.map((criterion) => `${criterion.key} ${weights[criterion.key]}`).join(', ')}.`,
            }],
          });
        },
        { type: TRANSITION_DECLARED_EVENT, entity: 'transition', entityId: programId, summary: `Declared transition programme “${label.slice(0, 80)}”` },
      );
      return { ok: true, id: programId };
    },

    updateTransitionProgram(programId, patch = {}) {
      const existing = (store.state.transitionPrograms || []).find((row) => row && row.id === programId);
      if (!existing) return fail('That programme no longer exists.');
      if (existing.status === 'finalized') return fail('A finalized programme is frozen evidence. Reopen it before changing the target or the criteria.', 'programId');
      const next = {};
      if (patch.label !== undefined) {
        const label = String(clean(patch.label) || '').slice(0, 140);
        if (!label) return fail('Name the programme.', 'label');
        next.label = label;
      }
      if (patch.effectiveOn !== undefined) {
        const effectiveOn = String(clean(patch.effectiveOn) || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveOn)) return fail('Record the date the change takes effect.', 'effectiveOn');
        next.effectiveOn = effectiveOn;
      }
      if (patch.headcount !== undefined) {
        const headcount = Math.round(Number(patch.headcount));
        if (!Number.isFinite(headcount) || headcount < 1) return fail('Set how many roles the programme has to remove.', 'headcount');
        next.headcount = Math.min(300, headcount);
      }
      if (patch.costCeiling !== undefined) {
        const raw = patch.costCeiling;
        const value = raw === null || raw === '' ? null : Number(raw);
        if (value !== null && (!Number.isFinite(value) || value < 0)) return fail('A cost ceiling must be a real number, or left blank.', 'costCeiling');
        next.costCeiling = value === null ? null : Math.round(value * 100) / 100;
      }
      if (patch.dimension !== undefined) {
        if (!TRANSITION_DIMENSIONS.includes(patch.dimension)) return fail('Choose one of the declared comparison dimensions.', 'dimension');
        next.dimension = patch.dimension;
      }
      if (patch.weights !== undefined) {
        const weights = {};
        for (const criterion of TRANSITION_CRITERIA) {
          const raw = Number(patch.weights?.[criterion.key]);
          weights[criterion.key] = Number.isFinite(raw) && raw >= 0 ? Math.min(100, raw) : (existing.weights?.[criterion.key] ?? criterion.weight);
        }
        if (!TRANSITION_CRITERIA.some((criterion) => weights[criterion.key] > 0)) {
          return fail('At least one criterion needs a weight above zero. A selection with no criteria is a preference.', 'weights');
        }
        next.weights = weights;
      }
      if (patch.notes !== undefined) next.notes = String(clean(patch.notes) || '').slice(0, 1000);
      // Ownership is editable because both decision gates require it: a plan
      // declared before anyone was named must be able to acquire its owner.
      if (patch.ownerId !== undefined) {
        const ownerId = String(clean(patch.ownerId) || '');
        if (ownerId) {
          const owner = (store.state.people || []).find((person) => person && person.id === ownerId);
          if (!owner) return fail('That owner is no longer in the roster.', 'ownerId');
          if (owner.status === 'archived') return fail(`${owner.name} has left the roster and cannot own this programme.`, 'ownerId');
        }
        next.ownerId = ownerId || null;
      }

      store.update(
        (draft) => {
          const program = (draft.transitionPrograms || []).find((row) => row && row.id === programId);
          if (!program) return;
          if (next.label) program.label = next.label;
          if (next.effectiveOn) program.effectiveOn = next.effectiveOn;
          if (next.headcount !== undefined) program.target.headcount = next.headcount;
          if (next.costCeiling !== undefined) program.target.costCeiling = next.costCeiling;
          if (next.dimension) program.dimension = next.dimension;
          if (next.weights) program.weights = next.weights;
          if (next.notes !== undefined) program.notes = next.notes;
          if (next.ownerId !== undefined) program.ownerId = next.ownerId;
          program.updatedAt = stamp();
          program.history = Array.isArray(program.history) ? program.history : [];
          program.history.push({
            at: stamp(),
            type: 'updated',
            summary: `Updated ${Object.keys(next).join(', ') || 'nothing'}; target ${program.target.headcount} exit(s) effective ${program.effectiveOn}.`,
          });
          program.history = program.history.slice(-40);
        },
        { type: TRANSITION_UPDATED_EVENT, entity: 'transition', entityId: programId, summary: `Updated transition programme “${existing.label.slice(0, 80)}”` },
      );
      return { ok: true };
    },

    /**
     * Add people to the candidate pool. Nothing is selected by adding them: the
     * pool is who is *eligible to be considered*, and conflating the two is how
     * a shortlist becomes a decision nobody remembers making.
     */
    addTransitionCandidates(programId, personIds = []) {
      const existing = (store.state.transitionPrograms || []).find((row) => row && row.id === programId);
      if (!existing) return fail('That programme no longer exists.');
      if (existing.status === 'finalized') return fail('A finalized programme is frozen evidence. Reopen it before changing the pool.', 'programId');
      const ids = [...new Set((Array.isArray(personIds) ? personIds : [personIds]).map((value) => String(value || '').trim()).filter(Boolean))];
      if (!ids.length) return fail('Choose at least one person.', 'personIds');
      const unknown = ids.filter((personId) => !personExists(personId));
      if (unknown.length) return fail('One of those people is no longer in the roster.', 'personIds');
      const present = new Set((existing.rows || []).map((row) => row.personId));
      const additions = ids.filter((personId) => !present.has(personId));
      if (!additions.length) return { ok: true, added: 0 };
      store.update(
        (draft) => {
          const program = (draft.transitionPrograms || []).find((row) => row && row.id === programId);
          if (!program) return;
          program.rows = Array.isArray(program.rows) ? program.rows : [];
          for (const personId of additions) {
            program.rows.push({ personId, selected: false, locked: false, group: '', mobility: null, workloadUnits: null, note: '' });
          }
          program.updatedAt = stamp();
          program.history = Array.isArray(program.history) ? program.history : [];
          program.history.push({ at: stamp(), type: 'pool', summary: `Added ${additions.length} person(s) to the candidate pool without selecting anyone.` });
          program.history = program.history.slice(-40);
        },
        { type: TRANSITION_UPDATED_EVENT, entity: 'transition', entityId: programId, summary: `Added ${additions.length} candidate(s) to “${existing.label.slice(0, 60)}”` },
      );
      return { ok: true, added: additions.length };
    },

    /** Fill the pool from the active roster, without selecting anyone. */
    syncTransitionRoster(programId) {
      const existing = (store.state.transitionPrograms || []).find((row) => row && row.id === programId);
      if (!existing) return fail('That programme no longer exists.');
      if (existing.status === 'finalized') return fail('A finalized programme is frozen evidence.', 'programId');
      const present = new Set((existing.rows || []).map((row) => row.personId));
      const additions = store.state.people.filter((person) => person.status !== 'archived' && !present.has(person.id));
      if (!additions.length) return { ok: true, added: 0 };
      store.update(
        (draft) => {
          const program = (draft.transitionPrograms || []).find((row) => row && row.id === programId);
          if (!program) return;
          program.rows = Array.isArray(program.rows) ? program.rows : [];
          for (const person of additions) {
            program.rows.push({ personId: person.id, selected: false, locked: false, group: '', mobility: null, workloadUnits: null, note: '' });
          }
          program.updatedAt = stamp();
          program.history = Array.isArray(program.history) ? program.history : [];
          program.history.push({ at: stamp(), type: 'pool', summary: `Filled the pool with ${additions.length} active person(s) from the roster, selecting nobody.` });
          program.history = program.history.slice(-40);
        },
        { type: TRANSITION_UPDATED_EVENT, entity: 'transition', entityId: programId, summary: `Filled the candidate pool on “${existing.label.slice(0, 60)}”` },
      );
      return { ok: true, added: additions.length };
    },

    removeTransitionRow(programId, personId) {
      const existing = (store.state.transitionPrograms || []).find((row) => row && row.id === programId);
      if (!existing) return fail('That programme no longer exists.');
      if (existing.status === 'finalized') return fail('A finalized programme is frozen evidence.', 'programId');
      store.update(
        (draft) => {
          const program = (draft.transitionPrograms || []).find((row) => row && row.id === programId);
          if (!program) return;
          program.rows = (program.rows || []).filter((row) => row.personId !== personId);
          program.updatedAt = stamp();
          program.history = Array.isArray(program.history) ? program.history : [];
          program.history.push({ at: stamp(), type: 'pool', summary: 'Removed a person from the candidate pool.' });
          program.history = program.history.slice(-40);
        },
        { type: TRANSITION_UPDATED_EVENT, entity: 'transition', entityId: programId, summary: `Removed a candidate from “${existing.label.slice(0, 60)}”` },
      );
      return { ok: true };
    },

    /**
     * Mark one candidate: selected or not, and whether that is the leader's
     * decision (`locked`) or a proposal the optimizer may fill around.
     *
     * The guard is real: selecting the sole recorded steward of a critical
     * dependency is refused, because the workspace has already recorded that
     * nobody else covers it. That is not a warning to accept, it is a work item
     * to resolve first.
     */
    setTransitionRow(programId, personId, patch = {}) {
      const existing = (store.state.transitionPrograms || []).find((row) => row && row.id === programId);
      if (!existing) return fail('That programme no longer exists.');
      if (existing.status === 'finalized' || existing.status === 'abandoned') {
        return fail('This programme is closed. Reopen it before changing a row.', 'programId');
      }
      const person = store.state.people.find((entry) => entry.id === personId);
      if (!person) return fail('That person is no longer in the roster.', 'personId');
      if (person.status === 'archived') return fail(`${person.name} has already left the roster. A programme cannot exit someone twice.`, 'personId');
      const selected = patch.selected === undefined ? undefined : patch.selected === true;
      if (selected === true) {
        const sole = (store.state.dependencies || []).some((dependency) => {
          if (!dependency || dependency.status === 'retired' || dependency.criticality !== 'critical') return false;
          const stewards = (dependency.stewards || []).filter((entry) => entry && entry.personId);
          return stewards.length === 1 && stewards[0].personId === personId;
        });
        if (sole) {
          return fail(`${person.name} is the only recorded steward of a critical dependency. Reassign that dependency first — selecting them would plan to remove cover the records say does not exist.`, 'selected');
        }
      }
      store.update(
        (draft) => {
          const program = (draft.transitionPrograms || []).find((row) => row && row.id === programId);
          if (!program) return;
          program.rows = Array.isArray(program.rows) ? program.rows : [];
          let row = program.rows.find((entry) => entry.personId === personId);
          if (!row) {
            row = { personId, selected: false, locked: false, group: '', mobility: null, workloadUnits: null, note: '' };
            program.rows.push(row);
          }
          if (selected !== undefined) row.selected = selected;
          if (patch.locked !== undefined) row.locked = patch.locked === true;
          if (patch.group !== undefined) row.group = String(clean(patch.group) || '').toUpperCase().slice(0, 8);
          if (patch.mobility !== undefined) {
            const value = patch.mobility === null || patch.mobility === '' ? null : Number(patch.mobility);
            if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) return;
            row.mobility = value === null ? null : Math.round(value);
          }
          if (patch.workloadUnits !== undefined) {
            const value = patch.workloadUnits === null || patch.workloadUnits === '' ? null : Number(patch.workloadUnits);
            row.workloadUnits = Number.isFinite(value) && value >= 0 ? Math.min(1000, Math.round(value * 10) / 10) : null;
          }
          if (patch.note !== undefined) row.note = String(clean(patch.note) || '').slice(0, TRANSITION_MAX_NOTE);
          program.updatedAt = stamp();
          program.history = Array.isArray(program.history) ? program.history : [];
          program.history.push({
            at: stamp(),
            type: 'row',
            summary: `${row.selected ? 'Named' : 'Un-named'} ${person.name}${row.locked ? ' (locked by the leader)' : ''}.`,
          });
          program.history = program.history.slice(-40);
        },
        { type: TRANSITION_UPDATED_EVENT, entity: 'transition', entityId: programId, summary: `Changed a candidate row on “${existing.label.slice(0, 60)}”` },
      );
      return { ok: true };
    },

    /** Record a process gate. Evidence, not inference. */
    recordTransitionGate(programId, gateKey, patch = {}) {
      const existing = (store.state.transitionPrograms || []).find((row) => row && row.id === programId);
      if (!existing) return fail('That programme no longer exists.');
      const gate = TRANSITION_GATES.find((entry) => entry.key === gateKey);
      if (!gate) return fail('That is not a declared process gate.', 'gateKey');
      const done = patch.done === true;
      const blocked = done ? false : patch.blocked === true;
      store.update(
        (draft) => {
          const program = (draft.transitionPrograms || []).find((row) => row && row.id === programId);
          if (!program) return;
          program.gates = Array.isArray(program.gates) ? program.gates : [];
          const existingGate = program.gates.find((entry) => entry.key === gateKey);
          const record = {
            key: gateKey,
            done,
            blocked,
            on: today(),
            recordedAt: stamp(),
            note: String(clean(patch.note) || '').slice(0, TRANSITION_MAX_NOTE),
          };
          if (existingGate) Object.assign(existingGate, record);
          else program.gates.push(record);
          program.updatedAt = stamp();
          program.history = Array.isArray(program.history) ? program.history : [];
          program.history.push({
            at: stamp(),
            type: 'gate',
            summary: `${gate.label}: ${done ? 'recorded complete' : blocked ? 'recorded blocked' : 'reopened'}${record.note ? ` — ${record.note.slice(0, 120)}` : ''}.`,
          });
          program.history = program.history.slice(-40);
        },
        { type: TRANSITION_GATE_EVENT, entity: 'transition', entityId: programId, summary: `Recorded the “${gate.label}” gate on “${existing.label.slice(0, 60)}”` },
      );
      return { ok: true };
    },

    /**
     * Mark the plan decided. This is the deliberate gate that spends the
     * automation: the screen decision, the hand-over tasks and the survivor
     * prompts are all opened in this one transaction.
     */
    decideTransition(programId) {
      const existing = (store.state.transitionPrograms || []).find((row) => row && row.id === programId);
      if (!existing) return fail('That programme no longer exists.');
      if (existing.status === 'finalized') return fail('This programme is already finalized.', 'programId');
      if (existing.status === 'abandoned') return fail('This programme was abandoned. Declare a new one rather than reviving a dead plan.', 'programId');
      const owner = (store.state.people || []).find((person) => person && person.id === existing.ownerId && person.status !== 'archived');
      if (!owner) {
        return fail('Name an accountable owner before deciding. The hand-over obligations, the evidence task and the outcome review are all owned work — a reduction nobody owns is a payment with no reviewer.', 'ownerId');
      }
      const named = (existing.rows || []).filter((row) => row && row.selected);
      if (!named.length) return fail('Name at least one exit before deciding. A plan with no names is an intention.', 'rows');
      if (named.length < Number(existing.target?.headcount || 0)) {
        return fail(`${named.length} of ${existing.target.headcount} planned exit(s) are named. Name the rest or lower the target — the gap is reported rather than filled in by the model.`, 'rows');
      }
      store.update(
        (draft) => {
          const program = (draft.transitionPrograms || []).find((row) => row && row.id === programId);
          if (!program) return;
          program.status = 'decided';
          program.updatedAt = stamp();
          program.history = Array.isArray(program.history) ? program.history : [];
          program.history.push({ at: stamp(), type: 'decided', summary: `Marked the plan decided with ${named.length} named exit(s); effective ${program.effectiveOn}.` });
          program.history = program.history.slice(-40);
        },
        { type: TRANSITION_DECIDED_EVENT, entity: 'transition', entityId: programId, summary: `Decided transition programme “${existing.label.slice(0, 80)}”` },
      );
      return { ok: true, propagations: store.lastPropagations || [] };
    },

    /** Explicit scan: links, screen decision, hand-overs, survivor prompts, outcomes. */
    scanTransition(programId) {
      const existing = (store.state.transitionPrograms || []).find((row) => row && row.id === programId);
      if (!existing) return fail('That programme no longer exists.');
      const before = JSON.stringify({
        decisions: (store.state.decisions || []).length,
        delegations: (store.state.delegations || []).length,
        links: (store.state.links || []).length,
        outcomes: (store.state.transitionPrograms || []).reduce((acc, row) => acc + (row.outcomes || []).length, 0),
      });
      store.update(
        () => {},
        { type: TRANSITION_SCANNED_EVENT, entity: 'transition', entityId: programId, summary: `Transition scan requested by the leader on “${existing.label.slice(0, 60)}”` },
      );
      const after = JSON.stringify({
        decisions: (store.state.decisions || []).length,
        delegations: (store.state.delegations || []).length,
        links: (store.state.links || []).length,
        outcomes: (store.state.transitionPrograms || []).reduce((acc, row) => acc + (row.outcomes || []).length, 0),
      });
      return { ok: true, changed: before !== after, propagations: store.lastPropagations || [] };
    },

    /**
     * Finalize: freeze the reading, then let the rules open the work.
     *
     * The snapshot is built inside the same transaction as the status change, so
     * the frozen prediction and the event that propagates it cannot disagree. A
     * plan whose named exits have no recorded pay at all cannot be frozen: there
     * would be no cost and no replacement exposure, and a snapshot of blanks is
     * worse than no snapshot.
     */
    finalizeTransitionProgram(programId) {
      const existing = (store.state.transitionPrograms || []).find((row) => row && row.id === programId);
      if (!existing) return fail('That programme no longer exists.');
      if (existing.status === 'finalized') return fail('This programme is already finalized.', 'programId');
      const owner = (store.state.people || []).find((person) => person && person.id === existing.ownerId && person.status !== 'archived');
      if (!owner) return fail('Name an accountable owner before freezing this plan. The frozen snapshot opens an outcome review, and a review with nobody accountable is a document, not a decision.', 'ownerId');
      const named = (existing.rows || []).filter((row) => row && row.selected).length;
      if (!named) return fail('Name at least one exit before finalizing — an empty programme freezes nothing.', 'rows');
      const reading = transitionReading(store.state, existing, clock(), { depth: 'full' });
      if (reading.plan.proposed.length !== named) {
        return fail('Part of this plan is no longer valid: a named person has left the roster or the plan changed while you were reading. Reopen it and check the rows.', 'rows');
      }
      if (reading.plan.proposed.every((row) => row.exitStatus === 'unpriced')) {
        return fail('None of the named exits has recorded pay, so no cost, no replacement exposure and no budget check can be frozen. Record pay in a merit cycle first — a snapshot of blanks is worse than none.', 'rows');
      }
      const snapshot = buildTransitionSnapshot(reading, {
        capturedAt: stamp(),
        byId: existing.ownerId || null,
        currency: existing.currency || 'USD',
      });
      store.update(
        (draft) => {
          const program = (draft.transitionPrograms || []).find((row) => row && row.id === programId);
          if (!program) return;
          const previous = program.snapshot;
          program.history = Array.isArray(program.history) ? program.history : [];
          if (previous) {
            program.history.push({
              at: stamp(),
              type: 'snapshot-superseded',
              summary: `Superseded the snapshot of ${previous.on || 'an unrecorded date'}: ${previous.achieved.named} named, ${Math.round(previous.achieved.cashCost)} ${previous.currency}.`,
            });
          }
          program.snapshot = snapshot;
          program.status = 'finalized';
          program.updatedAt = stamp();
          program.history.push({
            at: stamp(),
            type: 'finalized',
            summary: `Froze the plan: ${snapshot.achieved.named} exit(s), ${Math.round(snapshot.achieved.cashCost)} ${snapshot.currency}, ${snapshot.achieved.unpriced} unpriced, ratio ${snapshot.screen?.ratio ?? '—'}, ${snapshot.continuity.blockers} blocker(s), ${snapshot.continuity.atRisk} hand-over(s).`,
          });
          program.history = program.history.slice(-40);
        },
        { type: TRANSITION_FINALIZED_EVENT, entity: 'transition', entityId: programId, summary: `Finalized transition programme “${existing.label.slice(0, 80)}”` },
      );
      return { ok: true, snapshot };
    },

    reopenTransitionProgram(programId) {
      const existing = (store.state.transitionPrograms || []).find((row) => row && row.id === programId);
      if (!existing) return fail('That programme no longer exists.');
      if (existing.status !== 'finalized') return fail('Only a finalized programme can be reopened.', 'programId');
      store.update(
        (draft) => {
          const program = (draft.transitionPrograms || []).find((row) => row && row.id === programId);
          if (!program) return;
          program.status = 'draft';
          program.updatedAt = stamp();
          program.history = Array.isArray(program.history) ? program.history : [];
          program.history.push({
            at: stamp(),
            type: 'reopened',
            summary: 'Reopened the programme. The frozen snapshot is kept until the next finalization supersedes it; resolved outcomes are facts and are never discarded.',
          });
          program.history = program.history.slice(-40);
        },
        { type: TRANSITION_UPDATED_EVENT, entity: 'transition', entityId: programId, summary: `Reopened transition programme “${existing.label.slice(0, 80)}”` },
      );
      return { ok: true };
    },

    abandonTransitionProgram(programId) {
      const existing = (store.state.transitionPrograms || []).find((row) => row && row.id === programId);
      if (!existing) return fail('That programme no longer exists.');
      store.update(
        (draft) => {
          const program = (draft.transitionPrograms || []).find((row) => row && row.id === programId);
          if (!program) return;
          program.status = 'abandoned';
          program.updatedAt = stamp();
          program.history = Array.isArray(program.history) ? program.history : [];
          program.history.push({ at: stamp(), type: 'abandoned', summary: 'Abandoned. The rows, the snapshot and the history stay readable.' });
          program.history = program.history.slice(-40);
        },
        { type: 'transition.abandoned', entity: 'transition', entityId: programId, summary: `Abandoned transition programme “${existing.label.slice(0, 80)}”` },
      );
      return { ok: true };
    },

    deleteTransitionProgram(programId) {
      const existing = (store.state.transitionPrograms || []).find((row) => row && row.id === programId);
      if (!existing) return fail('That programme no longer exists.');
      store.update(
        (draft) => {
          draft.transitionPrograms = (draft.transitionPrograms || []).filter((row) => row && row.id !== programId);
          draft.links = (draft.links || []).filter((row) => !(
            (row.sourceType === 'transition' && row.sourceId === programId)
            || (row.targetType === 'transition' && row.targetId === programId)
          ));
        },
        { type: 'transition.deleted', entity: 'transition', entityId: programId, summary: `Deleted transition programme “${existing.label.slice(0, 80)}”` },
      );
      return { ok: true };
    },
  };



  /**
   * Validate and assemble a Stakeholder Influence Register record from form
   * input (Schema v25). Shared by addStakeholder and updateStakeholder.
   * Ratings are clamped to 1..5; unknown enums are rejected with coaching so
   * the leader's intended political assessment is never silently rewritten.
   * History, id and timestamps are owned by the calling actions.
   */
  function assembleStakeholder(data, existing) {
    const name = clean(data.name) || '';
    if (!name) return fail('Name the stakeholder — a register entry cannot be anonymous.', 'name');
    if (name.length > 120) return fail('Keep the name to 120 characters; put detail in the role or notes fields.', 'name');

    const category = STAKEHOLDER_CATEGORIES.includes(data.category) ? data.category : 'other';
    const status = STAKEHOLDER_STATUSES.includes(data.status) ? data.status : 'active';
    const stance = STAKEHOLDER_STANCES.includes(data.stance) ? data.stance : 'neutral';
    const estimateConfidence = ['high', 'medium', 'low'].includes(data.estimateConfidence)
      ? data.estimateConfidence
      : 'medium';
    const commsCadence = STAKEHOLDER_CADENCES.includes(data.commsCadence) ? data.commsCadence : 'weekly';

    let personId = clean(data.personId) || null;
    if (personId && !personExists(personId)) personId = null;

    const rating = (value, fallback = 3) => {
      if (value === undefined || value === null || value === '') return fallback;
      const n = Number(value);
      if (!Number.isFinite(n) || n < 1 || n > 5) return null;
      return Math.round(n);
    };
    const rated = ['power', 'interest', 'legitimacy', 'urgency'].map((k) => [k, rating(data[k], existing?.[k] ?? 3)]);
    const bad = rated.find(([, v]) => v === null);
    if (bad) return fail(`${bad[0]} must be a whole rating from 1 (low) to 5 (high).`, bad[0]);
    const ratings = Object.fromEntries(rated);

    const lastContactOn = data.lastContactOn === undefined || data.lastContactOn === ''
      ? (existing?.lastContactOn || null)
      : (isCalendarDay(data.lastContactOn) ? data.lastContactOn : null);
    const nextContactOn = data.nextContactOn === undefined || data.nextContactOn === ''
      ? (existing?.nextContactOn || null)
      : (isCalendarDay(data.nextContactOn) ? data.nextContactOn : null);
    if (data.lastContactOn && !isCalendarDay(data.lastContactOn)) {
      return fail('Last contact needs a real date (YYYY-MM-DD) or must be left blank.', 'lastContactOn');
    }
    if (data.nextContactOn && !isCalendarDay(data.nextContactOn)) {
      return fail('Next contact needs a real date (YYYY-MM-DD) or must be left blank.', 'nextContactOn');
    }

    const registerIds = new Set(
      [...(store.state.stakeholders || []).map((s) => s.id), ...(existing ? [existing.id] : [])],
    );
    const alliances = (Array.isArray(data.alliances) ? data.alliances : [])
      .slice(0, 25)
      .map((edge, i) => {
        if (!edge || typeof edge !== 'object') return null;
        const targetId = clean(edge.targetId);
        const kind = ALLIANCE_KINDS.includes(edge.kind) ? edge.kind : 'alliance';
        const strength = rating(edge.strength, 3);
        if (!targetId || !registerIds.has(targetId)) return null;
        if (existing && targetId === existing.id) return null;
        return { id: clean(edge.id) || `stkall-new-${i + 1}`, targetId, kind, strength };
      })
      .filter(Boolean);

    const tags = (Array.isArray(data.tags) ? data.tags : [])
      .map((t) => String(t || '').trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 8);

    const record = {
      id: existing?.id || id('stk'),
      name: name.slice(0, 120),
      org: String(data.org || '').trim().slice(0, 120),
      role: String(data.role || '').trim().slice(0, 120),
      personId,
      category,
      ...ratings,
      vetoPlayer: data.vetoPlayer === true,
      vetoBasis: String(data.vetoBasis || '').trim().slice(0, 400),
      stance,
      estimateConfidence,
      influenceNotes: String(data.influenceNotes || '').trim().slice(0, 2000),
      preferredComms: String(data.preferredComms || '').trim().slice(0, 200),
      keyMessage: String(data.keyMessage || '').trim().slice(0, 600),
      commsCadence,
      lastContactOn,
      nextContactOn,
      alliances,
      stanceHistory: Array.isArray(existing?.stanceHistory) ? existing.stanceHistory : [],
      contactLog: Array.isArray(existing?.contactLog) ? existing.contactLog : [],
      tags,
      status,
      autoPropagate: data.autoPropagate === false ? false : true,
      createdAt: existing?.createdAt || stamp(),
      updatedAt: stamp(),
    };
    return { ok: true, record };
  }

  /**
   * Validate and assemble a budget envelope from form input (Schema v24).
   * Shared by addBudget and updateBudget. A blank or zero limit means a
   * tracking-only envelope with no recorded ceiling — never a ceiling of 0.
   * Lines are preserved from the existing record unless `data.lines` is
   * explicitly supplied, so envelope edits can never silently drop spend.
   */
  function assembleBudget(data, existing) {
    const name = clean(data.name) || '';
    if (!name) return fail('Name the envelope — for example “Platform Q4 operating budget”.', 'name');
    const currencyRaw = (clean(data.currency) || 'USD').toUpperCase();
    if (!/^[A-Z]{3,6}$/.test(currencyRaw)) {
      return fail('Use a currency code such as USD, EUR or GBP. One envelope holds one currency; amounts are never converted.', 'currency');
    }
    let limit = null;
    if (data.limit !== undefined && data.limit !== null && data.limit !== '') {
      const n = Number(data.limit);
      if (!Number.isFinite(n) || n <= 0) {
        return fail('The envelope ceiling must be a positive amount, or left blank for a tracking-only budget.', 'limit');
      }
      limit = Math.round(n * 100) / 100;
    }
    const status = BUDGET_STATUSES.includes(data.status) ? data.status : (existing?.status || 'active');
    const readDay = (value, field, label) => {
      if (value === undefined || value === null || value === '') return { ok: true, value: null };
      if (!isCalendarDay(value)) return fail(`Choose a valid ${label} date.`, field);
      return { ok: true, value };
    };
    const startsOn = readDay(data.startsOn, 'startsOn', 'period start');
    if (!startsOn.ok) return startsOn;
    const endsOn = readDay(data.endsOn, 'endsOn', 'period end');
    if (!endsOn.ok) return endsOn;
    if (startsOn.value && endsOn.value && endsOn.value < startsOn.value) {
      return fail('The period end cannot be before the period start.', 'endsOn');
    }
    const ownerId = clean(data.ownerId) || null;
    if (ownerId) {
      const owner = store.state.people.find((p) => p.id === ownerId);
      if (!owner) return fail('Choose an existing team member as budget owner, or leave unassigned.', 'ownerId');
      if (owner.status === 'archived') return fail('Restore this person before assigning a budget to them.', 'ownerId');
    }
    let lines = existing?.lines || [];
    if (Array.isArray(data.lines)) {
      lines = [];
      for (const rawLine of data.lines) {
        const prev = (existing?.lines || []).find((l) => l.id === rawLine?.id) || null;
        const builtLine = assembleBudgetLine(rawLine, prev);
        if (!builtLine.ok) return builtLine;
        lines.push(builtLine.line);
      }
    }
    return {
      ok: true,
      record: {
        id: existing?.id || id('bud'),
        name: name.slice(0, 160),
        currency: currencyRaw,
        limit,
        periodLabel: (clean(data.periodLabel) || '').slice(0, 80),
        startsOn: startsOn.value,
        endsOn: endsOn.value,
        status,
        ownerId,
        note: (clean(data.note) || '').slice(0, 2000),
        lines,
        autoPropagate: data.autoPropagate !== false,
        createdAt: existing?.createdAt || stamp(),
        updatedAt: stamp(),
      },
    };
  }

  /** Validate and assemble one commitment line. Amounts stay null when blank. */
  function assembleBudgetLine(data, existingLine) {
    const title = clean(data.title) || '';
    if (!title) return fail('Name the commitment — what the money is for.', 'title');
    const category = BUDGET_CATEGORIES.includes(data.category) ? data.category : 'other';
    const status = BUDGET_LINE_STATUSES.includes(data.status) ? data.status : (existingLine?.status || 'planned');
    const readMoney = (value, field, label) => {
      if (value === undefined || value === null || value === '') return { ok: true, value: null };
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) return fail(`${label} must be zero or a positive number, or left blank.`, field);
      return { ok: true, value: Math.round(n * 100) / 100 };
    };
    const committed = readMoney(data.committedAmount, 'committedAmount', 'Committed amount');
    if (!committed.ok) return committed;
    const actual = readMoney(data.actualAmount, 'actualAmount', 'Actual amount');
    if (!actual.ok) return actual;
    const readDay = (value, field, label) => {
      if (value === undefined || value === null || value === '') return { ok: true, value: null };
      if (!isCalendarDay(value)) return fail(`Choose a valid ${label} date.`, field);
      return { ok: true, value };
    };
    const committedOn = readDay(data.committedOn, 'committedOn', 'commitment');
    if (!committedOn.ok) return committedOn;
    const expectedOn = readDay(data.expectedOn, 'expectedOn', 'expected spend');
    if (!expectedOn.ok) return expectedOn;
    const spentOn = readDay(data.spentOn, 'spentOn', 'spend');
    if (!spentOn.ok) return spentOn;
    if (status === 'spent' && spentOn.value && spentOn.value > today()) {
      return fail('The spend date cannot be in the future.', 'spentOn');
    }
    const ownerId = clean(data.ownerId) || null;
    if (ownerId && !store.state.people.some((p) => p.id === ownerId)) {
      return fail('Choose an existing team member as line owner, or leave unassigned.', 'ownerId');
    }
    let sourceType = clean(data.sourceType) || null;
    let sourceId = clean(data.sourceId) || null;
    if (sourceType || sourceId) {
      if (FORBIDDEN_LINK_TYPES.includes(sourceType)) {
        return fail('Confidential conflict records and anonymous pulses can never be linked to a budget line.', 'sourceType');
      }
      if (!BUDGET_SOURCE_TYPES.includes(sourceType) || !sourceId) {
        return fail('Choose a valid record this line funds, or leave the source blank.', 'sourceType');
      }
      if (!resolveLinkedEntity(store.state, sourceType, sourceId)) {
        return fail('The funded record no longer exists; choose another or leave blank.', 'sourceId');
      }
    } else {
      sourceType = null;
      sourceId = null;
    }
    return {
      ok: true,
      line: {
        id: existingLine?.id || clean(data.id) || id('bline'),
        title: title.slice(0, 200),
        category,
        status,
        committedAmount: committed.value,
        actualAmount: status === 'spent' ? actual.value : null,
        committedOn: committedOn.value,
        expectedOn: expectedOn.value,
        spentOn: status === 'spent' ? (spentOn.value || existingLine?.spentOn || null) : null,
        releasedOn: status === 'released' ? (existingLine?.releasedOn || today()) : null,
        releasedReason: status === 'released' ? (existingLine?.releasedReason || '') : '',
        // Preserve an outstanding actuals-due stamp across edits; only
        // recording the actual (or releasing) clears it.
        actualsDueOn: status === 'committed' ? (existingLine?.actualsDueOn || null) : null,
        sourceType,
        sourceId,
        ownerId,
        note: (clean(data.note) || '').slice(0, 1000),
      },
    };
  }

  /**
   * Validate and assemble a negotiation record from form input. Shared by
   * addNegotiation and updateNegotiation so the two write paths can never
   * drift. Returns { ok:false, error, field } or { ok:true, record }.
   */
  function assembleNegotiation(data, existing) {
    const title = clean(data.title) || '';
    if (!title) return fail('Name the negotiation — for example, the contract or resource at stake.', 'title');
    const kind = NEGOTIATION_KINDS.includes(data.kind) ? data.kind : 'other';
    const status = NEGOTIATION_STATUSES.includes(data.status) ? data.status : 'preparing';

    const openedOn = data.openedOn || existing?.openedOn || today();
    if (!isCalendarDay(openedOn)) return fail('Choose a valid opened date.', 'openedOn');
    if (openedOn > today()) return fail('A negotiation cannot be opened in the future.', 'openedOn');

    const readDay = (value, field) => {
      if (value === undefined || value === null || value === '') return { ok: true, value: null };
      if (!isCalendarDay(value)) return fail(`Choose a valid ${field} date.`, field);
      if (value < openedOn) return fail(`${field} cannot be before the opened date.`, field);
      return { ok: true, value };
    };
    const nextSessionOn = readDay(data.nextSessionOn, 'session');
    if (!nextSessionOn.ok) return nextSessionOn;
    const defaultReview = addDays(openedOn, store.state.settings?.negotiationReviewDays ?? 14);
    const reviewValue = data.reviewOn === undefined ? (existing?.reviewOn || defaultReview) : data.reviewOn;
    const reviewOn = readDay(reviewValue, 'review');
    if (!reviewOn.ok) return reviewOn;

    const ownerId = clean(data.ownerId) || null;
    if (ownerId) {
      const owner = store.state.people.find((p) => p.id === ownerId);
      if (!owner) return fail('Choose an existing team member as owner, or leave unassigned.', 'ownerId');
      if (owner.status === 'archived') return fail('Restore this person before assigning a negotiation to them.', 'ownerId');
    }

    const linkedGoalId = clean(data.linkedGoalId) || null;
    if (linkedGoalId && !(store.state.goals || []).some((g) => g.id === linkedGoalId)) {
      return fail('Choose an existing goal to link, or leave unlinked.', 'linkedGoalId');
    }

    let sourceType = clean(data.sourceType) || null;
    let sourceId = clean(data.sourceId) || null;
    if (sourceType || sourceId) {
      if (FORBIDDEN_LINK_TYPES.includes(sourceType)) {
        return fail('Confidential conflict records and anonymous pulses cannot be linked to a negotiation.', 'sourceType');
      }
      if (!LINK_ENTITY_TYPES.includes(sourceType) || !sourceId) {
        return fail('Choose a valid originating record, or leave the source blank.', 'sourceType');
      }
      if (!resolveLinkedEntity(store.state, sourceType, sourceId)) {
        return fail('The originating record no longer exists; choose another or leave blank.', 'sourceId');
      }
    } else {
      sourceType = null;
      sourceId = null;
    }

    const readMoney = (value, field) => {
      if (value === undefined || value === null || value === '') return { ok: true, value: null };
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) return fail(`${field} must be zero or positive, or left blank.`, field);
      return { ok: true, value: Math.round(n * 100) / 100 };
    };
    const stakesValue = readMoney(data.stakesValue, 'Deal value');
    if (!stakesValue.ok) return stakesValue;
    const batnaValue = readMoney(data.ourBatnaValue, 'BATNA value');
    if (!batnaValue.ok) return batnaValue;

    const issues = [];
    for (const [index, raw] of (Array.isArray(data.issues) ? data.issues : []).entries()) {
      const issue = normalizeIssueInput(raw, index);
      for (const field of ['ourReservation', 'ourTarget', 'theirReservation', 'theirTarget']) {
        if (raw?.[field] !== undefined && raw[field] !== null && raw[field] !== '') {
          const n = Number(raw[field]);
          if (!Number.isFinite(n) || n < 0) {
            return fail(`Issue “${issue.name || index + 1}”: ${field} must be a non-negative number or blank.`, 'issues');
          }
        }
      }
      if (raw?.direction && !NEGOTIATION_ISSUE_DIRECTIONS.includes(raw.direction)) {
        return fail(`Issue “${issue.name || index + 1}”: choose a valid direction.`, 'issues');
      }
      if (raw?.estimateConfidence && !ESTIMATE_CONFIDENCE.includes(raw.estimateConfidence)) {
        return fail(`Issue “${issue.name || index + 1}”: choose a valid estimate confidence.`, 'issues');
      }
      issues.push(issue);
    }

    const lists = normalizeStringLists(data);
    const record = {
      id: existing?.id || id('neg'),
      title: title.slice(0, 200),
      kind,
      status,
      counterparty: (clean(data.counterparty) || '').slice(0, 160),
      counterpartyRole: (clean(data.counterpartyRole) || '').slice(0, 120),
      ownerId,
      linkedGoalId,
      sourceType,
      sourceId,
      openedOn,
      nextSessionOn: nextSessionOn.value,
      reviewOn: reviewOn.value,
      closedOn: existing?.closedOn || null,
      strategic: Boolean(data.strategic),
      stakesValue: stakesValue.value,
      stakesCurrency: (clean(data.stakesCurrency) || 'USD').toUpperCase().slice(0, 6),
      ourBatnaDescription: (clean(data.ourBatnaDescription) || '').slice(0, 2000),
      ourBatnaValue: batnaValue.value,
      ourBatnaUnit: (clean(data.ourBatnaUnit) || '').slice(0, 12),
      theirBatnaEstimate: (clean(data.theirBatnaEstimate) || '').slice(0, 2000),
      ourInterests: lists.ourInterests,
      theirInterests: lists.theirInterests,
      objectiveCriteria: lists.objectiveCriteria,
      options: lists.options,
      issues,
      agreedTerms: existing?.agreedTerms || [],
      settlement: status === 'agreed' ? (existing?.settlement || null) : null,
      outcomeNotes: existing?.outcomeNotes || '',
      notes: (clean(data.notes) || '').slice(0, 4000),
      escalationCaseId: existing?.escalationCaseId || null,
      autoPropagate: data.autoPropagate !== false,
      createdAt: existing?.createdAt || stamp(),
      updatedAt: stamp(),
    };
    return { ok: true, record };
  }

  /**
   * Validate and assemble an Operational Resilience dependency record (Schema v29).
   * Enforces missing-stays-null (never fabricated 0s), prevents self-loops and
   * directed dependency cycles on write, and validates roster/goal/budget/
   * negotiation/stakeholder/portfolio references.
   */
  /** Validate & assemble a Coalition & Incentive War Room game (Schema v30). */
  function assemblePowerGame(data, existing) {
    const stressRadius = data.stressRadius === '' || data.stressRadius == null ? null : Number(data.stressRadius);
    if (stressRadius !== null && (!Number.isFinite(stressRadius) || stressRadius < 0 || stressRadius > 100)) return fail('Uncertainty must be 0–100 utility units, or blank to disable.', 'stressRadius');
    const title = clean(data.title) || '';
    if (!title) return fail('Name the situation you are modeling.', 'title');
    if (title.length > 180) return fail('Keep the title to 180 characters.', 'title');
    const players = normalizePlayers(data.players);
    if (players.length < POWER_MIN_PLAYERS) return fail('Add at least two named stakeholders with voting weight.', 'players');
    const has = (coll, value) => {
      const s = clean(value);
      return s && (store.state[coll] || []).some((r) => r.id === s) ? s : null;
    };
    const validIds = (arr, coll) => (Array.isArray(arr)
      ? [...new Set(arr.filter((x) => typeof x === 'string' && (store.state[coll] || []).some((r) => r.id === x)))].slice(0, 20)
      : []);
    const quota = Math.round(Number(data.quotaPct));
    const status = POWER_STATUSES.includes(data.status) ? data.status : (existing?.status || 'modeling');
    const counterpartyId = players.some((pl) => pl.id === data.counterpartyId) ? data.counterpartyId : players[0].id;
    const cleanPlayers = players.map((pl, i) => ({
      ...pl,
      id: pl.id || `pl${i + 1}`,
      stakeholderId: pl.stakeholderId && has('stakeholders', pl.stakeholderId) ? pl.stakeholderId : null,
      personId: pl.personId && has('people', pl.personId) ? pl.personId : null,
    }));
    const base = existing ? { ...existing } : {};
    return {
      ok: true,
      record: {
        id: base.id || id('power'),
        title,
        context: (clean(data.context) || '').slice(0, 4000),
        status,
        players: cleanPlayers,
        quotaPct: Number.isFinite(quota) ? Math.min(100, Math.max(1, quota)) : POWER_DEFAULT_QUOTA_PCT,
        counterpartyId,
        strategies: {
          leader: [(clean(data.strategies?.leader?.[0]) || '').slice(0, 60) || 'Strategy A', (clean(data.strategies?.leader?.[1]) || '').slice(0, 60) || 'Strategy B'],
          rival: [(clean(data.strategies?.rival?.[0]) || '').slice(0, 60) || 'Response A', (clean(data.strategies?.rival?.[1]) || '').slice(0, 60) || 'Response B'],
        },
        stressRadius,
        cells: normalizeCells(data.cells),
        targetCell: POWER_CELLS.includes(data.targetCell) ? data.targetCell : '00',
        estimateConfidence: POWER_CONFIDENCE.includes(data.estimateConfidence) ? data.estimateConfidence : 'low',
        linkedStakeholderIds: validIds(data.linkedStakeholderIds, 'stakeholders'),
        linkedCaseId: has('cases', data.linkedCaseId),
        linkedDecisionId: has('decisions', data.linkedDecisionId),
        linkedNegotiationId: has('negotiations', data.linkedNegotiationId),
        linkedGoalIds: validIds(data.linkedGoalIds, 'goals'),
        ownerId: has('people', data.ownerId),
        realizedCell: base.realizedCell || null,
        settledOn: base.settledOn || null,
        notes: (clean(data.notes) || '').slice(0, 2000),
        derived: base.derived || null,
        history: Array.isArray(base.history) ? base.history : [],
        autoPropagate: data.autoPropagate !== false,
        createdOn: base.createdOn || today(),
        createdAt: base.createdAt || stamp(),
        updatedAt: stamp(),
      },
    };
  }

  function applyPowerStatus(gameId, status, eventType, label) {
    const existing = (store.state.powerGames || []).find((g) => g.id === gameId);
    if (!existing) return fail('That coalition situation no longer exists.');
    store.update(
      (draft) => {
        const g = (draft.powerGames || []).find((x) => x.id === gameId);
        if (!g) return;
        g.status = status;
        g.updatedAt = stamp();
        g.history = [...(Array.isArray(g.history) ? g.history : []),
          { on: today(), action: status, note: label }].slice(-40);
      },
      { type: eventType, entity: 'power', entityId: gameId, summary: `${label} for “${existing.title.slice(0, 80)}”` },
    );
    return { ok: true };
  }

  function assembleDependency(data, existing) {
    const name = clean(data.name) || '';
    if (!name) return fail('Name the capability, vendor, system or process.', 'name');
    if (name.length > 180) return fail('Keep the name to 180 characters; put detail in the summary.', 'name');

    const kind = DEPENDENCY_KINDS.includes(data.kind) ? data.kind : null;
    if (!kind) return fail('Choose service, vendor, system or process.', 'kind');

    const criticality = DEPENDENCY_CRITICALITIES.includes(data.criticality) ? data.criticality : null;
    if (!criticality) return fail('Choose critical, important or supporting criticality.', 'criticality');

    const status = data.status === undefined
      ? (existing?.status || 'active')
      : (DEPENDENCY_STATUSES.includes(data.status) ? data.status : null);
    if (!status) return fail('Choose active, mitigating or retired status.', 'status');

    const substitutability = data.substitutability === undefined
      ? (existing?.substitutability || 'none')
      : (SUBSTITUTABILITY_MODES.includes(data.substitutability) ? data.substitutability : null);
    if (!substitutability) return fail('Choose a valid substitutability mode.', 'substitutability');

    const readNonNeg = (value, field, label, max = 1_000_000_000_000) => {
      if (value === undefined || value === null || value === '') return { ok: true, value: null };
      if (typeof value === 'boolean') return fail(`${label} must be a non-negative number or blank.`, field);
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > max) {
        return fail(`${label} must be between 0 and ${max.toLocaleString('en-US')}, or left blank.`, field);
      }
      return { ok: true, value: Math.round(n * 100) / 100 };
    };

    const ttsDays = readNonNeg(data.ttsDays, 'ttsDays', 'Time-to-Survive (TTS)', 3650);
    if (!ttsDays.ok) return ttsDays;
    const ttrDays = readNonNeg(data.ttrDays, 'ttrDays', 'Time-to-Recover (TTR)', 3650);
    if (!ttrDays.ok) return ttrDays;
    const warmSwitchDays = readNonNeg(data.warmSwitchDays, 'warmSwitchDays', 'Warm-standby switchover time', 3650);
    if (!warmSwitchDays.ok) return warmSwitchDays;
    const dailyImpactOverride = readNonNeg(data.dailyImpactOverride, 'dailyImpactOverride', 'Daily shortfall exposure');
    if (!dailyImpactOverride.ok) return dailyImpactOverride;
    const annualSpend = readNonNeg(data.annualSpend, 'annualSpend', 'Annual spend');
    if (!annualSpend.ok) return annualSpend;
    const annualFailureProb = readNonNeg(data.annualFailureProb, 'annualFailureProb', 'Annual disruption likelihood (%)', 100);
    if (!annualFailureProb.ok) return annualFailureProb;
    const mitigationCost = readNonNeg(data.mitigationCost, 'mitigationCost', 'Mitigation / redundancy cost');
    if (!mitigationCost.ok) return mitigationCost;

    const createdOn = data.createdOn || existing?.createdOn || today();
    if (!isCalendarDay(createdOn)) return fail('Choose a valid created date.', 'createdOn');
    const reviewOnRaw = data.reviewOn === undefined ? (existing?.reviewOn || addDays(today(), 30)) : data.reviewOn;
    if (reviewOnRaw !== null && reviewOnRaw !== '' && !isCalendarDay(reviewOnRaw)) {
      return fail('Choose a valid continuity review date, or leave blank.', 'reviewOn');
    }
    const reviewOn = reviewOnRaw || null;

    const recordId = existing?.id || id('dep');
    const allDeps = store.state.dependencies || [];
    const depById = new Map(allDeps.map((d) => [d.id, d]));

    const rawUpstreams = Array.isArray(data.upstreamIds) ? data.upstreamIds : (existing?.upstreamIds || []);
    const upstreamIds = [];
    for (const rawUp of rawUpstreams) {
      const uid = clean(rawUp);
      if (!uid) continue;
      if (uid === recordId) return fail('A dependency cannot depend on itself.', 'upstreamIds');
      if (!depById.has(uid)) return fail('Choose existing workspace dependencies for upstream links.', 'upstreamIds');
      if (!upstreamIds.includes(uid)) upstreamIds.push(uid);
    }

    // Prevent cycles on write: check if `recordId` is already an upstream
    // ancestor of any candidate `uid`!
    if (existing) {
      for (const uid of upstreamIds) {
        const visited = new Set([uid]);
        const stack = [uid];
        while (stack.length) {
          const curr = stack.pop();
          const currDep = depById.get(curr);
          for (const parentId of currDep?.upstreamIds || []) {
            if (parentId === recordId) {
              return fail(`Linking “${depById.get(uid)?.name || uid}” as upstream would create a circular dependency loop.`, 'upstreamIds');
            }
            if (!visited.has(parentId)) {
              visited.add(parentId);
              stack.push(parentId);
            }
          }
        }
      }
    }

    const rawStewards = Array.isArray(data.stewards) ? data.stewards : (existing?.stewards || []);
    const stewards = [];
    const seenPeople = new Set();
    for (const rawSt of rawStewards) {
      if (!rawSt || !rawSt.personId) continue;
      const pid = clean(rawSt.personId);
      if (!pid || seenPeople.has(pid)) continue;
      const person = (store.state.people || []).find((p) => p.id === pid);
      if (!person) return fail('Every steward must be a member of the roster.', 'stewards');
      const role = STEWARD_ROLES.includes(rawSt.role) ? rawSt.role : 'backup';
      const verifiedOn = rawSt.verifiedOn ? String(rawSt.verifiedOn).trim() : null;
      if (verifiedOn && (!isCalendarDay(verifiedOn) || verifiedOn > today())) {
        return fail('Steward verification date must be a valid calendar date on or before today.', 'stewards');
      }
      seenPeople.add(pid);
      stewards.push({
        personId: pid,
        role,
        verifiedOn: role === 'primary' ? (verifiedOn || today()) : verifiedOn,
        notes: (clean(rawSt.notes) || '').slice(0, 300),
      });
    }

    const rawGoalIds = Array.isArray(data.linkedGoalIds) ? data.linkedGoalIds : (existing?.linkedGoalIds || []);
    const linkedGoalIds = [];
    for (const gidRaw of rawGoalIds) {
      const gid = clean(gidRaw);
      if (!gid) continue;
      if (!(store.state.goals || []).some((g) => g.id === gid)) {
        return fail('Choose existing goals to link.', 'linkedGoalIds');
      }
      if (!linkedGoalIds.includes(gid)) linkedGoalIds.push(gid);
    }

    const checkOptionalRef = (val, collection, field, label) => {
      const refId = clean(val) || null;
      if (refId && !(store.state[collection] || []).some((r) => r.id === refId)) {
        return fail(`Choose an existing ${label}, or leave unlinked.`, field);
      }
      return { ok: true, value: refId };
    };
    const linkedBudget = checkOptionalRef(data.linkedBudgetId, 'budgets', 'linkedBudgetId', 'budget envelope');
    if (!linkedBudget.ok) return linkedBudget;
    const linkedNegotiation = checkOptionalRef(data.linkedNegotiationId, 'negotiations', 'linkedNegotiationId', 'negotiation');
    if (!linkedNegotiation.ok) return linkedNegotiation;
    const linkedStakeholder = checkOptionalRef(data.linkedStakeholderId, 'stakeholders', 'linkedStakeholderId', 'stakeholder');
    if (!linkedStakeholder.ok) return linkedStakeholder;
    const linkedPortfolio = checkOptionalRef(data.linkedPortfolioId, 'portfolio', 'linkedPortfolioId', 'portfolio item');
    if (!linkedPortfolio.ok) return linkedPortfolio;

    const record = {
      id: recordId,
      name,
      kind,
      criticality,
      status,
      summary: (clean(data.summary) || '').slice(0, 2000),
      ttsDays: ttsDays.value,
      ttrDays: ttrDays.value,
      substitutability,
      warmSwitchDays: warmSwitchDays.value,
      exitPlanSummary: (clean(data.exitPlanSummary) || '').slice(0, 2000),
      currency: (clean(data.currency) || existing?.currency || 'USD').toUpperCase().slice(0, 6),
      dailyImpactOverride: dailyImpactOverride.value,
      derivedDailyImpact: existing?.derivedDailyImpact ?? null,
      derivedCurrency: existing?.derivedCurrency || '',
      annualSpend: annualSpend.value,
      annualFailureProb: annualFailureProb.value,
      mitigationCost: mitigationCost.value,
      upstreamIds,
      stewards,
      linkedGoalIds,
      linkedBudgetId: linkedBudget.value,
      linkedNegotiationId: linkedNegotiation.value,
      linkedStakeholderId: linkedStakeholder.value,
      linkedPortfolioId: linkedPortfolio.value,
      drills: existing?.drills || [],
      history: existing?.history || [{ on: today(), action: 'created', note: `Registered ${criticality} ${kind}` }],
      autoPropagate: data.autoPropagate !== false,
      createdOn,
      reviewOn,
      retiredOn: status === 'retired' ? (existing?.retiredOn || today()) : null,
      retiredReason: status === 'retired' ? (existing?.retiredReason || '') : '',
      createdAt: existing?.createdAt || stamp(),
      updatedAt: stamp(),
    };
    return { ok: true, record };
  }

  /**
   * RULE-NEG-03 — raise exactly one operational case for a negotiation at
   * impasse, through the same `addCase` fan-out every other escalation uses.
   * Runs after the status write, so a failed case creation never blocks the
   * recorded transition; an existing open linked case makes this a no-op.
   */
  function maybeEscalateNegotiationImpasse(negotiationId) {
    if (store.writeBlockReason) return null;
    const state = store.state;
    const openLink = (state.links || []).find((l) => {
      if (l.sourceType !== 'case' || l.targetType !== 'negotiation' || l.targetId !== negotiationId) return false;
      const linkedCase = (state.cases || []).find((c) => c.id === l.sourceId);
      return Boolean(linkedCase && isCaseOpen(linkedCase));
    });
    if (openLink) return { caseId: openLink.sourceId, created: false };

    const built = buildCaseFromNegotiationImpasse(state, { negotiationId, now: clock() });
    if (!built.ok) return null;
    const result = api.addCase({
      ...built.payload,
      _upstreamLink: {
        sourceType: 'negotiation',
        sourceId: negotiationId,
        summary: 'Escalated from negotiation impasse (RULE-NEG-03)',
      },
    });
    if (!result?.ok) return null;
    store.update(
      (draft) => {
        const target = (draft.negotiations || []).find((n) => n.id === negotiationId);
        if (!target) return;
        target.escalationCaseId = result.id;
        target.updatedAt = stamp();
      },
      {
        type: 'negotiation.escalated',
        entity: 'negotiation',
        entityId: negotiationId,
        summary: 'RULE-NEG-03 raised an operational case for a negotiation impasse',
      },
    );
    return { caseId: result.id, created: true, propagations: result.propagations || [] };
  }

  /**
   * RULE-HIRE-03 — raise exactly one operational case for a role that has
   * stopped moving, through the same escalation path every other module uses.
   * The case therefore arrives with FMEA severity/probability/detectability,
   * financial PERT fields, a stakeholder coalition, a DACI decision and an
   * accountable delegation already attached: a stalled hire becomes a managed
   * risk instead of a row in a tab nobody opens.
   *
   * Runs after the write that changed the hiring state, so the transaction that
   * records a candidate's evidence is never blocked by case creation. The
   * `autoEscalated` flag on the requisition is what keeps it to exactly one
   * case, even after that case is closed.
   */
  function maybeEscalateStalledHiring() {
    if (store.writeBlockReason) return [];
    const stalled = stalledRequisitions(store.state, { now: clock(), settings: store.state.settings });
    const raised = [];
    for (const req of stalled) {
      const result = api.escalateToCase({ sourceType: 'requisition', sourceId: req.id });
      const caseId = result?.ok ? result.id : result?.existingCaseId || null;
      if (!caseId) continue;
      store.update(
        (draft) => {
          const target = (draft.requisitions || []).find((r) => r.id === req.id);
          if (!target) return;
          target.autoEscalated = true;
          target.escalatedCaseId = caseId;
          target.updatedAt = stamp();
        },
        {
          type: 'requisition.escalated',
          entity: 'requisition',
          entityId: req.id,
          summary: `RULE-HIRE-03 raised an operational case for the stalled “${req.title}” role`,
        },
      );
      raised.push({ requisitionId: req.id, caseId, created: Boolean(result?.ok) });
    }
    return raised;
  }

  /* ------------------------------------------------- ADR-0026 propagation */

  /**
   * Re-run the exact post-commit rule that failed on a receipt, against the
   * workspace as it stands now.
   *
   * This is the point of a durable receipt. Before v41 a rule failure was a
   * toast: the leader was told the propagation had been rolled back, and the
   * decisions/delegations/goals it would have produced simply never existed.
   * The retry re-executes one rule - not the whole chain, because the rest of
   * the chain already succeeded and replaying it would duplicate effects.
   *
   * The outcome lands on the receipt in the same transaction that runs the
   * rule, so a successful retry can never leave a receipt saying "open".
   */
  function retryPropagationReceipt(id) {
    const plan = propagationRetryPlan(store.state, id, DEFAULT_POST_COMMIT_RULES);
    if (!plan.ok) return fail(plan.error, plan.field || null);
    let failedDetail = null;
    store.update(
      () => {},
      {
        type: 'propagation.retried',
        entity: 'propagationReceipt',
        entityId: plan.receipt.id,
        summary: `Re-ran ${plan.receipt.rule} for ${plan.event.type || plan.receipt.eventType || 'an event'} at a leader's request`,
      },
      {
        rules: [plan.rule],
        ruleEvent: plan.event,
        suppressReceipt: true,
        afterRules: (draft, metrics) => {
          const rows = Array.isArray(draft.propagationReceipts) ? draft.propagationReceipts : [];
          const target = rows.find((r) => r && r.id === plan.receipt.id);
          if (!target) return;
          const pairs = Array.isArray(metrics && metrics.pairs) ? metrics.pairs : [];
          const failure = pairs.find((p) => p.status === 'rolled-back');
          const succeeded = pairs.length > 0 && !failure;
          failedDetail = failure ? failure.error || 'the rule threw again' : null;
          target.attempts = Array.isArray(target.attempts) ? target.attempts : [];
          target.attempts.push({
            at: stamp(),
            outcome: succeeded ? 'succeeded' : 'failed',
            detail: succeeded
              ? `Re-ran against the current workspace; ${pairs.filter((p) => p.status === 'applied').length} propagation(s) applied.`
              : `The rule failed again: ${failedDetail}`,
          });
          if (target.attempts.length > 20) target.attempts.splice(0, target.attempts.length - 20);
          if (succeeded) {
            target.status = 'resolved';
            target.resolvedAt = stamp();
          } else {
            target.status = 'retried';
            target.resolvedAt = null;
          }
        },
      },
    );
    const updated = propagationReceiptById(store.state, plan.receipt.id);
    return {
      ok: true,
      resolved: updated && updated.status === 'resolved',
      receipt: updated,
      error: failedDetail,
      propagations: store.lastPropagations || [],
    };
  }

  /** Close a receipt without running it. The failure stays visible in history. */
  function dismissPropagationReceipt(id) {
    const receipt = propagationReceiptById(store.state, id);
    if (!receipt) return fail('That propagation receipt is no longer in this workspace. Reload and try again.', 'id');
    if (receipt.status === 'dismissed') return { ok: true, receipt };
    store.update(
      (draft) => {
        const target = (draft.propagationReceipts || []).find((r) => r && r.id === id);
        if (!target) return;
        target.status = 'dismissed';
        target.resolvedAt = stamp();
      },
      {
        type: 'propagation.dismissed',
        entity: 'propagationReceipt',
        entityId: id,
        summary: `Dismissed the ${receipt.rule} propagation receipt`,
      },
    );
    return { ok: true, receipt: propagationReceiptById(store.state, id) };
  }


  /* ------------------------------------------------------------------ *
   * Schema v42 — Strategy Coherence Terminal.
   *
   * A bet is a *declared* strategic choice with an explicit share of effort.
   * `strategyTags` say which open records each bet is actually funding, and the
   * gap between the two is computed — never typed in. Adopting a bet is an
   * explicit commitment, so it emits an event that fans out through the shared
   * post-commit spine in the same atomic transaction.
   * ------------------------------------------------------------------ */

  /** The derived coherence report. Read-only: no event, no write. */
  function strategyReport() {
    return buildStrategyReport(store.state, clock(), store.state.settings);
  }

  function strategyBriefText() {
    return strategyBrief(store.state, clock());
  }

  function saveStrategyBet(data = {}) {
    const existingId = data.id ? String(data.id) : null;
    const existing = existingId
      ? (store.state.strategyBets || []).find((row) => row && row.id === existingId)
      : null;
    if (existingId && !existing) return fail('That bet no longer exists.');
    if (existing && existing.status === 'retired') {
      return fail('A retired bet is history. Record a new bet rather than editing the one the team already judged.');
    }
    const parsed = normalizeStrategyBetPayload(data, {
      state: store.state,
      now: clock(),
      existing,
    });
    if (!parsed.ok) return fail(parsed.error, parsed.field);
    if (parsed.value.ownerId && !(store.state.people || []).some((p) => p.id === parsed.value.ownerId && p.status !== 'archived')) {
      return fail('Choose an active team member as the bet owner.', 'ownerId');
    }
    if (parsed.value.killCriterion?.checkOn && parsed.value.killCriterion.checkOn < today() && !existing?.killCriterion) {
      return fail('A new stop rule cannot be dated in the past — a rule written after the fact cannot stop anything.', 'killCriterion');
    }
    const record = {
      ...(existing || append(null, 'bet')),
      ...parsed.value,
      status: existing ? existing.status : 'draft',
      adoptedOn: existing ? existing.adoptedOn : null,
      retiredOn: existing ? existing.retiredOn : null,
      retiredReason: existing ? existing.retiredReason : '',
      verdict: existing ? existing.verdict : null,
      notes: clean(data.notes)?.slice(0, 1200) || existing?.notes || '',
      createdOn: existing ? existing.createdOn : today(),
      history: [...(Array.isArray(existing?.history) ? existing.history : []), {
        at: stamp(),
        type: existing ? 'updated' : 'created',
        summary: existing ? 'Bet content updated' : 'Bet recorded as a draft',
      }].slice(-60),
    };
    store.update(
      (draft) => {
        draft.strategyBets = Array.isArray(draft.strategyBets) ? draft.strategyBets : [];
        const index = draft.strategyBets.findIndex((row) => row && row.id === record.id);
        if (index === -1) draft.strategyBets.push(record);
        else draft.strategyBets[index] = record;
      },
      {
        type: existing ? 'strategy.bet.updated' : 'strategy.bet.created',
        entity: 'strategy',
        entityId: record.id,
        summary: `${existing ? 'Updated' : 'Recorded'} strategic bet “${record.title}”`,
      },
    );
    return { ok: true, id: record.id, propagations: store.lastPropagations || [] };
  }

  /**
   * Adopt a bet: this is the moment the declared share starts being compared
   * with funded work, so it requires the parts of the kernel that cannot be
   * retro-fitted — an owner, a diagnosis and a guiding policy. The stop rule is
   * graded, not enforced here: RULE-SCO-03 opens exactly one owned delegation
   * to write it, which is more useful than a validation error.
   */
  function adoptStrategyBet(betId, { adoptedOn = null } = {}) {
    const current = (store.state.strategyBets || []).find((row) => row && row.id === betId);
    if (!current) return fail('That bet no longer exists.');
    if (current.status === 'active') return fail('That bet is already active.');
    if (current.status === 'retired') return fail('A retired bet cannot be adopted again; record a new one so the history stays readable.');
    if (!current.ownerId) return fail('Name an owner before adopting — a bet nobody owns is a wish.', 'ownerId');
    if (String(current.diagnosis || '').trim().length < 12) return fail('Write the diagnosis before adopting — a bet with no obstacle is a goal.', 'diagnosis');
    if (String(current.guidingPolicy || '').trim().length < 12) return fail('Write the guiding policy before adopting — how this bet deals with the diagnosis.', 'guidingPolicy');
    const when = adoptedOn || today();
    if (!isCalendarDay(when)) return fail('Choose a valid adoption date.', 'adoptedOn');
    if (when > today()) return fail('A bet cannot be adopted in the future; the date is the vintage the gap is measured from.', 'adoptedOn');
    store.update(
      (draft) => {
        const target = (draft.strategyBets || []).find((row) => row && row.id === betId);
        if (!target) return;
        target.status = 'active';
        target.adoptedOn = when;
        target.updatedAt = stamp();
        target.history = [...(Array.isArray(target.history) ? target.history : []), {
          at: stamp(),
          type: 'adopted',
          summary: `Adopted with a declared share of ${target.weightPct}% of effort`,
        }].slice(-60);
      },
      {
        type: 'strategy.bet.adopted',
        entity: 'strategy',
        entityId: betId,
        summary: `Adopted the strategic bet “${current.title}” at ${current.weightPct}% of declared effort`,
      },
    );
    return { ok: true, propagations: store.lastPropagations || [] };
  }

  function retireStrategyBet(betId, { reason = '' } = {}) {
    const current = (store.state.strategyBets || []).find((row) => row && row.id === betId);
    if (!current) return fail('That bet no longer exists.');
    if (current.status === 'retired') return fail('That bet is already retired.');
    const why = clean(reason)?.slice(0, 400) || '';
    if (why.length < 5) return fail('Record why the bet is being retired. A silent retirement is indistinguishable from drift.', 'reason');
    store.update(
      (draft) => {
        const target = (draft.strategyBets || []).find((row) => row && row.id === betId);
        if (!target) return;
        target.status = 'retired';
        target.retiredOn = today();
        target.retiredReason = why;
        target.updatedAt = stamp();
        target.history = [...(Array.isArray(target.history) ? target.history : []), {
          at: stamp(), type: 'retired', summary: why,
        }].slice(-60);
      },
      {
        type: 'strategy.bet.retired',
        entity: 'strategy',
        entityId: betId,
        summary: `Retired the strategic bet “${current.title}”: ${why}`,
      },
    );
    return { ok: true, propagations: store.lastPropagations || [] };
  }

  function tagStrategyWork(data = {}) {
    const parsed = normalizeStrategyTagPayload(data, { state: store.state, now: clock() });
    if (!parsed.ok) return fail(parsed.error, parsed.field);
    const duplicate = (store.state.strategyTags || []).find((tag) => tag
      && tag.betId === parsed.value.betId
      && tag.entityType === parsed.value.entityType
      && tag.entityId === parsed.value.entityId);
    if (duplicate) return fail('That record is already funded by that bet. Remove the existing tag first if the effort estimate changed.', 'entityId');
    const record = { ...parsed.value, id: id('tag') };
    store.update(
      (draft) => {
        draft.strategyTags = Array.isArray(draft.strategyTags) ? draft.strategyTags : [];
        draft.strategyTags.push(record);
      },
      {
        type: 'strategy.tag.added',
        entity: 'strategy',
        entityId: record.betId,
        summary: `Tagged a ${record.entityType} to a strategic bet${record.effortWeeks === null ? ' (effort unknown)' : ` at ${record.effortWeeks} effort-weeks`}`,
      },
    );
    return { ok: true, id: record.id, propagations: store.lastPropagations || [] };
  }

  function untagStrategyWork(tagId) {
    const current = (store.state.strategyTags || []).find((tag) => tag && tag.id === tagId);
    if (!current) return fail('That tag no longer exists.');
    store.update(
      (draft) => {
        draft.strategyTags = (draft.strategyTags || []).filter((tag) => tag && tag.id !== tagId);
      },
      {
        type: 'strategy.tag.removed',
        entity: 'strategy',
        entityId: current.betId,
        summary: `Removed a ${current.entityType} tag from a strategic bet`,
      },
    );
    return { ok: true, propagations: store.lastPropagations || [] };
  }

  /**
   * Record the human verdict on a stop rule. A `retire` verdict retires the bet
   * in the same transaction, because recording "retire" and then leaving the
   * bet active would make the verdict a note rather than a decision.
   */
  function recordStrategyVerdict(betId, data = {}) {
    const current = (store.state.strategyBets || []).find((row) => row && row.id === betId);
    if (!current) return fail('That bet no longer exists.');
    if (current.status === 'retired') return fail('That bet is already retired.');
    if (!BET_VERDICT_KEYS.includes(data.verdict)) return fail('Choose continue, reconsider or retire.', 'verdict');
    const note = clean(data.note)?.slice(0, 600) || '';
    if (note.length < 5) return fail('Record what the stop rule showed. A verdict with no evidence is a mood.', 'note');
    const recordedOn = data.recordedOn || today();
    if (!isCalendarDay(recordedOn)) return fail('Choose a valid verdict date.', 'recordedOn');
    if (recordedOn > today()) return fail('A verdict cannot be dated in the future.', 'recordedOn');
    store.update(
      (draft) => {
        const target = (draft.strategyBets || []).find((row) => row && row.id === betId);
        if (!target) return;
        target.verdict = { verdict: data.verdict, recordedOn, note, at: stamp() };
        target.updatedAt = stamp();
        target.history = [...(Array.isArray(target.history) ? target.history : []), {
          at: stamp(), type: 'verdict', summary: `${data.verdict}: ${note}`.slice(0, 300),
        }].slice(-60);
        if (data.verdict === 'retire') {
          target.status = 'retired';
          target.retiredOn = recordedOn;
          target.retiredReason = note;
          target.history.push({ at: stamp(), type: 'retired', summary: note.slice(0, 300) });
          target.history = target.history.slice(-60);
        }
      },
      {
        type: 'strategy.verdict.recorded',
        entity: 'strategy',
        entityId: betId,
        summary: `Recorded “${data.verdict}” against the stop rule for “${current.title}”`,
      },
    );
    return { ok: true, propagations: store.lastPropagations || [] };
  }

  /**
   * Explicit audit. The rule deliberately does not run on unrelated events —
   * opening governance decisions while the leader types a case note is noise —
   * so this one click is the trigger, and the cascade is atomic.
   */
  function runStrategyAudit() {
    if (!(store.state.strategyBets || []).some((bet) => bet && bet.status === 'active')) {
      return fail('Adopt at least one bet before running an audit — there is no declared share to compare against.');
    }
    store.update(
      () => {},
      {
        type: 'strategy.audit.run',
        entity: 'strategy',
        entityId: '',
        summary: 'Ran an explicit strategy coherence audit',
      },
    );
    return { ok: true, report: strategyReport(), propagations: store.lastPropagations || [] };
  }

  function updateStrategyPolicy({ gapThresholdPct, blindWipThresholdPct, driftWindowDays, autoPropagate } = {}) {
    const patch = {};
    if (gapThresholdPct !== undefined) {
      const n = Math.round(Number(gapThresholdPct));
      if (!Number.isFinite(n) || n < 5 || n > 60) return fail('The say–do threshold must be between 5 and 60 percentage points.', 'gapThresholdPct');
      patch.strategyGapThresholdPct = n;
    }
    if (blindWipThresholdPct !== undefined) {
      const n = Math.round(Number(blindWipThresholdPct));
      if (!Number.isFinite(n) || n < 5 || n > 100) return fail('The strategy-blind threshold must be between 5% and 100%.', 'blindWipThresholdPct');
      patch.strategyBlindWipThresholdPct = n;
    }
    if (driftWindowDays !== undefined) {
      const n = Math.round(Number(driftWindowDays));
      if (!Number.isFinite(n) || n < 7 || n > 90) return fail('The drift window must be between 7 and 90 days.', 'driftWindowDays');
      patch.strategyDriftWindowDays = n;
    }
    if (autoPropagate !== undefined) patch.strategyAutoPropagate = Boolean(autoPropagate);
    if (!Object.keys(patch).length) return fail('Nothing to change in the strategy policy.');
    return api.updateSettings(patch);
  }


  /* ------------------------------------------------------------------ *
   * Schema v43 — the After-Action Review & Learning Ledger.
   *
   * A review is a record of what a leader concluded after something ended,
   * which is why the two things the workspace can prove — what was expected
   * (frozen before the outcome) and what the record says happened — are
   * pre-filled and the "why" is never inferred. Holding a review is the
   * commitment moment: it emits the event the post-commit spine turns into
   * owned changes, and only a dated human note can ever mark a change applied.
   * ------------------------------------------------------------------ */

  /** The derived learning report. Read-only: no event, no write. */
  function learningReportAction() {
    return buildLearningReport(store.state, clock(), store.state.settings);
  }

  function learningBriefText() {
    return learningBrief(store.state, clock());
  }

  function retroById(retroId) {
    return (store.state.retros || []).find((row) => row && row.id === retroId) || null;
  }

  /**
   * Start a review. Closed work can be reviewed from the queue without a draft
   * existing; the two evidence questions are filled from the record so the
   * leader starts from the number they committed to before they knew the answer.
   */
  function startRetro(data = {}) {
    const parsed = normalizeRetroPayload(data, { state: store.state, now: clock() });
    if (!parsed.ok) return fail(parsed.error, parsed.field);
    const evidence = parsed.value.subjectId
      ? subjectEvidence(store.state, parsed.value.subjectType, parsed.value.subjectId)
      : null;
    // The three required answers are validated here exactly as they are when the
    // review is held, so a dialog that promises to refuse a one-word "why" is
    // backed by the action rather than by the dialog.
    const answers = { intended: evidence?.intended || '', actual: evidence?.actual || '', cause: '', sustain: '', improve: '' };
    for (const question of AAR_QUESTIONS) {
      if (data[question.key] === undefined) continue;
      const value = clean(data[question.key])?.slice(0, question.max) || '';
      if (value.length > 0 && value.length < question.min) {
        return fail(`“${question.label}” needs at least ${question.min} characters.`, question.key);
      }
      if (value.length > 0) answers[question.key] = value;
    }
    const record = {
      ...append(null, 'retro'),
      ...parsed.value,
      status: 'draft',
      autoDrafted: false,
      ...answers,
      skipReason: '',
      heldOn: null,
      participants: [],
      lessons: [],
      updatedAt: stamp(),
      history: [{ at: stamp(), type: 'created', summary: 'Review opened' }],
    };
    store.update(
      (draft) => {
        draft.retros = Array.isArray(draft.retros) ? draft.retros : [];
        draft.retros.push(record);
      },
      {
        type: 'learning.retro.drafted',
        entity: 'learning',
        entityId: record.id,
        summary: `Opened an after-action review for “${record.subjectLabel}”`,
      },
    );
    return { ok: true, id: record.id, propagations: store.lastPropagations || [] };
  }

  /** Save the answers on a review that has not been held yet. */
  function saveRetro(retroId, data = {}) {
    const current = retroById(retroId);
    if (!current) return fail('That review no longer exists.');
    if (current.status === 'held') return fail('A held review is history. Record a follow-up note on its lessons rather than rewriting what the room concluded.');
    const patch = {};
    for (const question of AAR_QUESTIONS) {
      if (data[question.key] === undefined) continue;
      const value = clean(data[question.key])?.slice(0, question.max) || '';
      if (value.length > 0 && value.length < question.min) {
        return fail(`“${question.label}” needs at least ${question.min} characters.`, question.key);
      }
      patch[question.key] = value;
    }
    if (data.outcomeOn !== undefined) {
      const on = clean(data.outcomeOn);
      if (!isCalendarDay(on)) return fail('Choose a valid date for when the event ended.', 'outcomeOn');
      if (on > today()) return fail('An event cannot end in the future.', 'outcomeOn');
      if (current.subjectId) {
        const spec = subjectTypeSpec(current.subjectType);
        const row = findSubject(store.state, current.subjectType, current.subjectId);
        const derived = row && spec ? spec.outcomeOn(row) : null;
        if (derived && on !== derived) {
          return fail(`That record closed on ${derived}. The closing date is read from the record, not typed — changing it would change the latency being measured.`, 'outcomeOn');
        }
      }
      patch.outcomeOn = on;
    }
    if (data.subjectLabel !== undefined && current.subjectType === 'other') {
      const label = clean(data.subjectLabel)?.slice(0, 200) || '';
      if (label.length < 4) return fail('Name the event this review is about.', 'subjectLabel');
      patch.subjectLabel = label;
    }
    if (!Object.keys(patch).length) return fail('Nothing to save on this review.');
    store.update(
      (draft) => {
        const target = (draft.retros || []).find((row) => row && row.id === retroId);
        if (!target) return;
        Object.assign(target, patch);
        target.updatedAt = stamp();
        target.history = [...(Array.isArray(target.history) ? target.history : []),
          { at: stamp(), type: 'updated', summary: 'Review answers saved' }].slice(-60);
      },
      {
        type: 'learning.retro.updated',
        entity: 'learning',
        entityId: retroId,
        summary: `Saved the answers on the review of “${current.subjectLabel}”`,
      },
    );
    return { ok: true, propagations: store.lastPropagations || [] };
  }

  /**
   * Hold the review. This is the only action that runs the learning rules, so
   * the expensive path is one click, not a write.
   */
  function holdRetro(retroId, data = {}) {
    const current = retroById(retroId);
    if (!current) return fail('That review no longer exists.');
    if (current.status === 'held') return fail('That review has already been held.');
    const answers = {};
    for (const question of AAR_QUESTIONS) {
      const raw = data[question.key] !== undefined ? data[question.key] : current[question.key];
      const value = clean(raw)?.slice(0, question.max) || '';
      if (value.length < question.min) {
        return fail(`“${question.label}” needs at least ${question.min} characters before the review can be held.`, question.key);
      }
      answers[question.key] = value;
    }
    const heldOn = clean(data.heldOn) || today();
    if (!isCalendarDay(heldOn)) return fail('Choose a valid date for when the review was held.', 'heldOn');
    if (heldOn > today()) return fail('A review cannot be held in the future.', 'heldOn');
    if (current.outcomeOn && heldOn < current.outcomeOn) {
      return fail(`The event closed on ${current.outcomeOn}. A review cannot precede the outcome it reviews.`, 'heldOn');
    }
    const participants = (Array.isArray(data.participants) ? data.participants : current.participants || [])
      .filter((pid) => typeof pid === 'string' && store.state.people.some((p) => p && p.id === pid && p.status !== 'archived'))
      .slice(0, 20);
    store.update(
      (draft) => {
        const target = (draft.retros || []).find((row) => row && row.id === retroId);
        if (!target) return;
        Object.assign(target, answers, { status: 'held', heldOn, participants, updatedAt: stamp() });
        target.history = [...(Array.isArray(target.history) ? target.history : []),
          { at: stamp(), type: 'held', summary: `Review held on ${heldOn}` }].slice(-60);
      },
      {
        type: 'learning.retro.held',
        entity: 'learning',
        entityId: retroId,
        summary: `Held the after-action review of “${current.subjectLabel}”`,
      },
    );
    return { ok: true, propagations: store.lastPropagations || [] };
  }

  /**
   * Skip a review deliberately. A skip is not a gap in the ledger — it is a
   * dated decision that this closure did not merit a review, with a reason —
   * and it is counted separately from a held review in every rate.
   */
  function skipRetro(retroId, { reason = '' } = {}) {
    const current = retroById(retroId);
    if (!current) return fail('That review no longer exists.');
    if (current.status === 'held') return fail('A held review cannot be skipped; it already happened.');
    const why = clean(reason)?.slice(0, 400) || '';
    if (why.length < 10) return fail('Record why this closure does not need a review. A silent skip is indistinguishable from forgetting.', 'reason');
    store.update(
      (draft) => {
        const target = (draft.retros || []).find((row) => row && row.id === retroId);
        if (!target) return;
        target.status = 'skipped';
        target.skipReason = why;
        target.heldOn = null;
        target.updatedAt = stamp();
        target.history = [...(Array.isArray(target.history) ? target.history : []),
          { at: stamp(), type: 'skipped', summary: why.slice(0, 300) }].slice(-60);
      },
      {
        type: 'learning.retro.skipped',
        entity: 'learning',
        entityId: retroId,
        summary: `Skipped the review of “${current.subjectLabel}”: ${why.slice(0, 120)}`,
      },
    );
    return { ok: true, propagations: store.lastPropagations || [] };
  }

  function deleteRetro(retroId) {
    const current = retroById(retroId);
    if (!current) return fail('That review no longer exists.');
    if (current.status === 'held') return fail('A held review is part of the record. It cannot be deleted — annotate the lessons instead.');
    store.update(
      (draft) => {
        draft.retros = (draft.retros || []).filter((row) => row && row.id !== retroId);
      },
      {
        type: 'learning.retro.deleted',
        entity: 'learning',
        entityId: retroId,
        summary: `Removed the draft review of “${current.subjectLabel}”`,
      },
    );
    return { ok: true };
  }

  /** Add a lesson to a held review. Only a held review can teach anything. */
  function addLesson(retroId, data = {}) {
    const current = retroById(retroId);
    if (!current) return fail('That review no longer exists.');
    if (current.status !== 'held') return fail('Hold the review before recording lessons — a lesson from a review that has not happened is a plan.');
    const parsed = normalizeLessonPayload(data, { state: store.state, now: clock() });
    if (!parsed.ok) return fail(parsed.error, parsed.field);
    const lesson = { ...parsed.value, id: id('lesson'), createdAt: stamp() };
    store.update(
      (draft) => {
        const target = (draft.retros || []).find((row) => row && row.id === retroId);
        if (!target) return;
        target.lessons = [...(Array.isArray(target.lessons) ? target.lessons : []), lesson].slice(0, 20);
        target.updatedAt = stamp();
      },
      {
        type: 'learning.lesson.added',
        entity: 'learning',
        entityId: retroId,
        summary: `Recorded a ${lesson.changeType === 'none' ? 'observation' : 'committed change'} on ${lesson.class}`,
      },
    );
    return { ok: true, id: lesson.id, propagations: store.lastPropagations || [] };
  }

  /**
   * Close a committed change — with evidence.
   *
   * `applied` requires a date and a note saying what is now different; that note
   * is the only thing standing between this ledger and a list of intentions
   * everyone agreed with in a meeting. `dropped` requires the same, and is the
   * honest alternative to letting a change rot as "open" forever.
   */
  function recordLessonState(retroId, lessonId, data = {}) {
    const current = retroById(retroId);
    if (!current) return fail('That review no longer exists.');
    const lesson = (current.lessons || []).find((row) => row && row.id === lessonId);
    if (!lesson) return fail('That lesson no longer exists.');
    if (lesson.changeType === 'none') return fail('An observation has no change to close. Add a lesson with a change if the review did commit one.');
    const nextState = clean(data.state);
    if (!['applied', 'dropped', 'open'].includes(nextState)) return fail('Choose applied, dropped or reopen.', 'state');
    const on = clean(data.on) || today();
    if (!isCalendarDay(on)) return fail('Choose a valid date.', 'on');
    if (on > today()) return fail('A change cannot be closed in the future.', 'on');
    if (current.heldOn && on < current.heldOn) return fail(`The review was held on ${current.heldOn}; the change cannot be marked before the room met.`, 'on');
    const note = clean(data.note)?.slice(0, 600) || '';
    if (nextState !== 'open' && note.length < 10) {
      return fail(nextState === 'applied'
        ? 'Describe what is now different. "Done" is not evidence that a practice changed.'
        : 'Record why the change was dropped. An unexplained drop is how a lesson disappears.', 'note');
    }
    store.update(
      (draft) => {
        const target = (draft.retros || []).find((row) => row && row.id === retroId);
        const row = target && (target.lessons || []).find((l) => l && l.id === lessonId);
        if (!row) return;
        row.state = nextState;
        row.appliedOn = nextState === 'applied' ? on : null;
        row.appliedNote = nextState === 'applied' ? note : '';
        row.droppedOn = nextState === 'dropped' ? on : null;
        row.droppedReason = nextState === 'dropped' ? note : '';
        if (nextState === 'open') {
          row.appliedOn = null;
          row.droppedOn = null;
          row.appliedNote = '';
          row.droppedReason = '';
        }
        target.updatedAt = stamp();
      },
      {
        type: 'learning.lesson.state',
        entity: 'learning',
        entityId: retroId,
        summary: `Marked a ${lesson.class} change ${nextState}${nextState === 'open' ? '' : ` on ${on}`}`,
      },
    );
    return { ok: true, propagations: store.lastPropagations || [] };
  }

  /**
   * Persistent notes on a held review: what happened after the room, which is
   * the one thing a review record needs that the four questions cannot hold.
   */
  function annotateRetro(retroId, { note = '' } = {}) {
    const current = retroById(retroId);
    if (!current) return fail('That review no longer exists.');
    const text = clean(note)?.slice(0, 1200) || '';
    if (text.length < 5) return fail('Write the note first.', 'note');
    store.update(
      (draft) => {
        const target = (draft.retros || []).find((row) => row && row.id === retroId);
        if (!target) return;
        target.improve = `${target.improve ? `${target.improve}\n\n` : ''}${text}`.slice(0, 1200);
        target.updatedAt = stamp();
        target.history = [...(Array.isArray(target.history) ? target.history : []),
          { at: stamp(), type: 'annotated', summary: text.slice(0, 300) }].slice(-60);
      },
      {
        type: 'learning.retro.annotated',
        entity: 'learning',
        entityId: retroId,
        summary: `Annotated the review of “${current.subjectLabel}”`,
      },
    );
    return { ok: true };
  }

  /** Attach one distinct, dated completed workspace record to an applied lesson. */
  function recordLessonEvidence(retroId, lessonId, { sourceKey = '', note = '' } = {}) {
    const retro = (store.state.retros || []).find((row) => row?.id === retroId && row.status === 'held');
    if (!retro) return fail('That held review no longer exists.');
    const lesson = (retro.lessons || []).find((row) => row?.id === lessonId);
    if (!lesson || lesson.state !== 'applied') return fail('Only a dated applied change can receive record corroboration.');
    const cleanedNote = clean(note)?.slice(0, 500) || '';
    if (cleanedNote.length < 15) return fail('Say what this record corroborates, in at least 15 characters.', 'note');
    const [sourceType, ...sourceParts] = String(sourceKey).split(':');
    const sourceId = sourceParts.join(':');
    const candidate = lessonEvidenceCandidates(store.state, retro, lesson)
      .find((item) => item.type === sourceType && item.id === sourceId);
    if (!candidate) return fail('That artifact is not a distinct, dated, completed record in the lesson’s review-to-application window. Refresh the candidates.');
    const existing = (lesson.evidence || []).find((item) => item.sourceType === sourceType && item.sourceId === sourceId);
    if (existing) return fail('That record is already attached. Add a different dated artifact if it contributes separate evidence.');
    if ((lesson.evidence || []).length >= 5) return fail('At most five records can be attached to one lesson.');
    const evidence = {
      id: id('levidence'), sourceType, sourceId, sourceTitle: candidate.title,
      evidenceOn: candidate.evidenceOn, note: cleanedNote, snapshot: candidate.snapshot,
      recordedAt: stamp(),
    };
    store.update(
      (draft) => {
        const target = (draft.retros || []).find((row) => row?.id === retroId);
        const currentLesson = target && (target.lessons || []).find((row) => row?.id === lessonId);
        if (!currentLesson || currentLesson.state !== 'applied') return;
        currentLesson.evidence = [...(currentLesson.evidence || []), evidence].slice(0, 5);
        target.updatedAt = stamp();
        target.history = [...(target.history || []), { at: stamp(), type: 'lesson-evidence', summary: `Attached a dated ${sourceType} record as lesson corroboration` }].slice(-60);
        ensureEntityLink(draft, {
          sourceType: 'lesson', sourceId: lessonId, targetType: sourceType, targetId: sourceId,
          relation: 'corroborates', ruleId: 'RULE-AAR-04',
          summary: `Dated record corroboration for applied lesson (${candidate.evidenceOn}); not proof of causality.`,
        }, { idFactory: id, todayStr: today(), nowIso: stamp() });
      },
      {
        type: 'learning.lesson.evidence.recorded', entity: 'learning', entityId: retroId,
        summary: 'Attached a dated workspace artifact to an applied lesson for record corroboration',
        automationOptions: { lessonId, evidenceId: evidence.id },
      },
    );
    return { ok: true, id: evidence.id, propagations: store.lastPropagations || [] };
  }

  function updateLearningPolicy({ windowDays, dueDays, coverageFloorPct, autoDraft, autoPropagate } = {}) {
    const patch = {};
    if (windowDays !== undefined) {
      const n = Math.round(Number(windowDays));
      if (!Number.isFinite(n) || n < 14 || n > 365) return fail('The review window must be between 14 and 365 days.', 'windowDays');
      patch.retroWindowDays = n;
    }
    if (dueDays !== undefined) {
      const n = Math.round(Number(dueDays));
      if (!Number.isFinite(n) || n < 1 || n > 60) return fail('The review allowance must be between 1 and 60 days.', 'dueDays');
      patch.retroDueDays = n;
    }
    if (coverageFloorPct !== undefined) {
      const n = Math.round(Number(coverageFloorPct));
      if (!Number.isFinite(n) || n < 10 || n > 100) return fail('The coverage convention must be between 10% and 100%.', 'coverageFloorPct');
      patch.learningCoverageFloorPct = n;
    }
    if (autoDraft !== undefined) patch.learningAutoDraft = Boolean(autoDraft);
    if (autoPropagate !== undefined) patch.learningAutoPropagate = Boolean(autoPropagate);
    if (!Object.keys(patch).length) return fail('Nothing to change in the learning policy.');
    return api.updateSettings(patch);
  }

  Object.assign(api, {
    learningReport: learningReportAction,
    learningBriefText,
    startRetro,
    saveRetro,
    holdRetro,
    skipRetro,
    deleteRetro,
    addLesson,
    recordLessonState,
    recordLessonEvidence,
    annotateRetro,
    updateLearningPolicy,
  });

  Object.assign(api, {
    retryPropagationReceipt,
    dismissPropagationReceipt,
    strategyReport,
    strategyBriefText,
    saveStrategyBet,
    adoptStrategyBet,
    retireStrategyBet,
    tagStrategyWork,
    untagStrategyWork,
    recordStrategyVerdict,
    runStrategyAudit,
    updateStrategyPolicy,
    continuityCouplingReport(options = {}) {
      const sim = simulateCoupledPortfolio(store.state, { ...options, now: clock() });
      const ranked = sim.available && sim.shocksModeled
        ? rankHardeningInterventions(store.state, { ...options, now: clock() })
        : { available: false, interventions: [] };
      return { simulation: sim, interventions: ranked.interventions || [] };
    },
    continuityCouplingBrief() {
      return buildContinuityCouplingBrief(store.state, clock());
    },
    scanContinuityCoupling() {
      const before = JSON.stringify({
        decisions: (store.state.decisions || []).length,
        delegations: (store.state.delegations || []).length,
        links: (store.state.links || []).length,
      });
      store.update(
        () => {},
        {
          type: COUPLING_SCAN_EVENT,
          entity: 'workspace',
          entityId: '',
          summary: 'All-weather continuity-coupling scan requested by the leader',
        },
      );
      const after = JSON.stringify({
        decisions: (store.state.decisions || []).length,
        delegations: (store.state.delegations || []).length,
        links: (store.state.links || []).length,
      });
      return { ok: true, changed: before !== after, propagations: store.lastPropagations || [] };
    },
    updateContinuityCouplingPolicy({ minFitPct, tailDropPct, autoPropagate } = {}) {
      const patch = {};
      if (minFitPct !== undefined) patch.couplingMinFitPct = Number(minFitPct);
      if (tailDropPct !== undefined) patch.couplingTailDropPct = Number(tailDropPct);
      if (autoPropagate !== undefined) patch.couplingAutoPropagate = Boolean(autoPropagate);
      if (!Object.keys(patch).length) return fail('Nothing to change in the continuity-coupling policy.');
      return api.updateSettings(patch);
    },
  });



  /* ------------------------------------------------ leader continuity drill */

  function parseDay(value, label) {
    const text = clean(value);
    if (!text) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { error: `${label} must be a calendar date (YYYY-MM-DD).` };
    const parsed = new Date(`${text}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
      return { error: `${label} is not a real calendar date.` };
    }
    return { day: text };
  }

  function leaderContinuityReportAction(options = {}) {
    const start = parseDay(options.startOn, 'The absence start');
    if (start?.error) return { ok: false, error: start.error };
    return buildLeaderContinuityReport(store.state, {
      ...options,
      now: start?.day ? new Date(`${start.day}T00:00:00.000Z`) : clock(),
    });
  }

  function leaderContinuityBriefText(options = {}) {
    const start = parseDay(options.startOn, 'The absence start');
    if (start?.error) return start.error;
    return continuityBrief(store.state, {
      ...options,
      now: start?.day ? new Date(`${start.day}T00:00:00.000Z`) : clock(),
    });
  }

  /**
   * Freeze today's stall probabilities against a dated absence window. The
   * predictions are copied once and never recomputed: a drill that re-scored
   * itself against current data would always look better than it was.
   */
  function startContinuityDrill({ startOn, endOn, note = '' } = {}) {
    if ((store.state.continuityDrills || []).some((row) => row && row.status === 'open')) {
      return fail('Close the open drill before starting another. One live prediction window at a time.');
    }
    const start = parseDay(startOn, 'The absence start');
    if (start?.error) return fail(start.error, 'startOn');
    const end = parseDay(endOn, 'The absence end');
    if (end?.error) return fail(end.error, 'endOn');
    const todayStr = today();
    const startDay = start?.day || todayStr;
    const endDay = end?.day || addDays(startDay, CONTINUITY_DEFAULT_HORIZON_DAYS);
    if (endDay < startDay) return fail('The absence end cannot be before its start.', 'endOn');
    if (endDay < todayStr) return fail('A drill cannot be opened for an absence that has already ended.', 'endOn');
    const span = Math.max(1, (daysBetween(startDay, endDay) ?? 0) + 1);
    // The window begins when the absence begins, not when the drill is opened.
    // A future holiday must freeze what falls due during it, not what is late today.
    const report = buildLeaderContinuityReport(store.state, {
      now: new Date(`${startDay}T00:00:00.000Z`),
      horizonDays: Math.max(1, span - 1),
    });
    if (!report.inventory.items.length) return fail('Nothing falls due in that window, so there is no prediction to freeze.');
    const predictions = report.simulation.perItem
      .slice(0, 60)
      .map((row) => ({ key: row.key, pStall: row.pStall, dueOn: row.dueOn }));
    const record = {
      ...append(null, 'lcdrill'),
      startOn: startDay,
      endOn: endDay,
      status: 'open',
      horizonDays: span,
      note: clean(note)?.slice(0, 1000) || '',
      predictions,
      observedKeys: [],
      unexpectedStalls: 0,
      unexpectedKinds: [],
      closedAt: null,
    };
    store.update(
      (draft) => {
        draft.continuityDrills = Array.isArray(draft.continuityDrills) ? draft.continuityDrills : [];
        draft.continuityDrills.push(record);
      },
      {
        type: 'continuity.drill.opened',
        entity: 'continuity',
        entityId: record.id,
        summary: `Froze ${predictions.length} stall prediction(s) for ${startDay} → ${endDay}`,
      },
    );
    return { ok: true, id: record.id, predictions: predictions.length };
  }

  /**
   * Close a drill with the leader's own record of what stalled. Only keys that
   * were predicted can be ticked; unpredicted stalls are a separate count so
   * the Brier denominator cannot be changed after the fact.
   */
  function closeContinuityDrill({ drillId, observedKeys = [], unexpectedStalls = 0, unexpectedKinds = [], note = '' } = {}) {
    const drill = (store.state.continuityDrills || []).find((row) => row && row.id === clean(drillId));
    if (!drill) return fail('Choose an open drill to close.', 'drillId');
    if (drill.status !== 'open') return fail('That drill is already closed.', 'drillId');
    const predicted = new Set(drill.predictions.map((row) => row.key));
    const keys = [...new Set((Array.isArray(observedKeys) ? observedKeys : []).filter((key) => predicted.has(key)))];
    const unexpected = Math.round(Number(unexpectedStalls));
    if (!Number.isFinite(unexpected) || unexpected < 0 || unexpected > 50) {
      return fail('Unexpected stalls must be a whole number between 0 and 50.', 'unexpectedStalls');
    }
    const kinds = [...new Set((Array.isArray(unexpectedKinds) ? unexpectedKinds : [])
      .filter((kind) => ['decides', 'reviews', 'unblocks', 'converses', 'engages', 'guards'].includes(kind)))];
    const closedAt = stamp();
    let scored = null;
    store.update(
      (draft) => {
        const target = (draft.continuityDrills || []).find((row) => row && row.id === drill.id);
        target.status = 'closed';
        target.observedKeys = keys;
        target.unexpectedStalls = unexpected;
        target.unexpectedKinds = kinds;
        target.note = clean(note)?.slice(0, 1000) || target.note;
        target.closedAt = closedAt;
        scored = scoreDrillRecord(target, { state: draft, now: clock() });
      },
      {
        type: CONTINUITY_DRILL_EVENT,
        entity: 'continuity',
        entityId: drill.id,
        summary: `Closed the ${drill.startOn} → ${drill.endOn} drill: ${keys.length} predicted and ${unexpected} unpredicted stall(s) recorded`,
        automationOptions: { drillId: drill.id },
      },
    );
    return { ok: true, id: drill.id, score: scored, propagations: store.lastPropagations || [] };
  }

  /**
   * Commission a cover plan. The plan key is recomputed by the rule against the
   * live draft, so a stale preview cannot create different work than the leader
   * reviewed. The action refuses when there is nothing to cover.
   */
  function commissionContinuityCover({ planKey, horizonDays, startOn, windowStart, expectedRevision } = {}) {
    if (store.state.settings?.continuityAutoPropagate === false) {
      return fail('Hand-over propagation is paused in settings. Re-enable it before commissioning a cover plan.');
    }
    const revision = Number(expectedRevision);
    if (Number.isFinite(revision) && revision !== store.state.meta.revision) {
      return fail('The workspace changed since the plan was previewed. Re-open leader continuity and review the current plan.');
    }
    const start = parseDay(startOn, 'The absence start');
    if (start?.error) return fail(start.error, 'startOn');
    const report = buildLeaderContinuityReport(store.state, {
      now: start?.day ? new Date(`${start.day}T00:00:00.000Z`) : clock(),
      horizonDays,
    });
    // Idempotent before stale-plan detection: a double click has already moved
    // the workspace, so the same window must resolve to its existing decision
    // rather than to a "the plan changed" error.
    const windowMarker = `[LCS-WINDOW:${report.inventory.windowStart}]`;
    const existing = (store.state.decisions || []).find((row) => row && typeof row.question === 'string' && row.question.includes(windowMarker));
    if (existing) return { ok: true, id: existing.id, existing: true, propagations: [] };
    const liveKey = coverPlanKey(report.coverPlan, report.inventory);
    if (clean(planKey) !== liveKey) {
      return fail('The cover plan changed since it was previewed. Review the current plan and commission that one.');
    }
    if (windowStart && windowStart !== report.inventory.windowStart) {
      return fail('The absence window changed since it was previewed. Review the current window.');
    }
    if (!report.coverPlan.actions.length) return fail('There is no cover action to commission at this evidence level.');
    store.update(
      () => {},
      {
        type: CONTINUITY_COVER_EVENT,
        entity: 'continuity',
        entityId: '',
        summary: `Commissioned hand-over cover for ${report.inventory.windowStart} → ${report.inventory.windowEnd}`,
        automationOptions: {
          planKey: liveKey,
          horizonDays: report.inventory.horizonDays,
          startOn: start?.day || null,
          windowStart: report.inventory.windowStart,
        },
      },
    );
    const decision = (store.state.decisions || []).find((row) => row && typeof row.question === 'string' && row.question.includes(windowMarker));
    return {
      ok: true,
      id: decision?.id || null,
      planKey: liveKey,
      propagations: store.lastPropagations || [],
    };
  }

  /** Re-run the read-only structural check inside the normal rule spine. */
  function scanLeaderContinuity() {
    const before = JSON.stringify({
      decisions: (store.state.decisions || []).length,
      delegations: (store.state.delegations || []).length,
      retros: (store.state.retros || []).length,
    });
    store.update(
      () => {},
      {
        type: CONTINUITY_SCAN_EVENT,
        entity: 'workspace',
        entityId: '',
        summary: 'Leader-continuity structural scan requested by the leader',
      },
    );
    const after = JSON.stringify({
      decisions: (store.state.decisions || []).length,
      delegations: (store.state.delegations || []).length,
      retros: (store.state.retros || []).length,
    });
    return { ok: true, changed: before !== after, propagations: store.lastPropagations || [] };
  }

  function updateContinuityPolicy({ horizonDays, minFitPct, autoPropagate, commonCausePct, secondShockPct } = {}) {
    const patch = {};
    if (horizonDays !== undefined) {
      const n = Math.round(Number(horizonDays));
      if (!Number.isFinite(n) || n < 1 || n > 90) return fail('The absence window must be between 1 and 90 days.', 'horizonDays');
      patch.continuityHorizonDays = n;
    }
    if (minFitPct !== undefined) {
      const n = Math.round(Number(minFitPct));
      if (!Number.isFinite(n) || n < 1 || n > 100) return fail('The cover-evidence floor must be between 1% and 100%.', 'minFitPct');
      patch.continuityMinFitPct = n;
    }
    if (commonCausePct !== undefined) {
      const n = Math.round(Number(commonCausePct));
      if (!Number.isFinite(n) || n < 0 || n > 100) return fail('The shared-cause probability must be between 0% and 100%.', 'commonCausePct');
      patch.continuityCommonCausePct = n;
    }
    if (secondShockPct !== undefined) {
      const n = Math.round(Number(secondShockPct));
      if (!Number.isFinite(n) || n < 0 || n > 100) return fail('The second-shock probability must be between 0% and 100%.', 'secondShockPct');
      patch.continuitySecondShockPct = n;
    }
    if (autoPropagate !== undefined) patch.continuityAutoPropagate = Boolean(autoPropagate);
    if (!Object.keys(patch).length) return fail('Nothing to change in the continuity policy.');
    return api.updateSettings(patch);
  }


  /* ------------------------------------------------ scorecard integrity */

  function scorecardById(scorecardId) {
    return (store.state.scorecards || []).find((row) => row && row.id === scorecardId) || null;
  }

  function measurementReportAction(options = {}) {
    const cost = options.metricCostPct === undefined
      ? store.state.settings.measurementMetricCostPct
      : Number(options.metricCostPct);
    return buildMeasurementReport(store.state, {
      now: clock(),
      metricCostPct: Number.isFinite(cost) ? Math.min(25, Math.max(0, cost)) : 2,
    });
  }

  function measurementBriefText() {
    return measurementBrief(store.state, { now: clock() });
  }

  function sanitizeTaskRows(rawTasks, existingIds = []) {
    const rows = [];
    const used = new Set();
    let i = 0;
    for (const raw of Array.isArray(rawTasks) ? rawTasks : []) {
      const task = normalizeMeasurementTask(raw);
      if (!task.name) continue;
      const taskId = task.id && !used.has(task.id) ? task.id : id('mtask');
      used.add(taskId);
      rows.push({ ...task, id: taskId });
      i += 1;
      if (rows.length >= 12) break;
    }
    return rows;
  }

  /**
   * A scorecard is a declaration, not a measurement. It is created as a draft so
   * the leader can see the modelled equilibrium before anything propagates; only
   * `commitScorecard` freezes a prediction or opens work.
   */
  function createScorecard({
    title, objective = '', ownerId = null, tasks = [],
    stakesPct, professionalismPct, riskAversionPct, detectionPct, effortHoursPerWeek,
    reviewOn = null, status = 'draft', forkedFrom = null,
  } = {}) {
    const cleanTitle = clean(title)?.slice(0, 200) || '';
    if (cleanTitle.length < 3) return fail('Give the scorecard a name of at least three characters.', 'title');
    const rows = sanitizeTaskRows(tasks);
    if (!rows.length) return fail('Declare at least one task, measured or not. A scorecard with no work in it models nothing.', 'tasks');
    if (!rows.some((t) => t.kind === 'measured')) return fail('Declare at least one measured task — the lab can only model an incentive when something is rewarded.', 'tasks');
    if (status !== 'draft') return fail('A new scorecard is always a draft. Commit it once you have seen the modelled equilibrium.');
    const owner = ownerId && personExists(ownerId) ? ownerId : null;
    const scorecardId = id('scorecard');
    store.update(
      (draft) => {
        draft.scorecards.push({
          id: scorecardId,
          title: cleanTitle,
          objective: clean(objective)?.slice(0, 600) || '',
          ownerId: owner,
          status: 'draft',
          stakesPct: Number.isFinite(Number(stakesPct)) ? Number(stakesPct) : 50,
          professionalismPct: Number.isFinite(Number(professionalismPct)) ? Number(professionalismPct) : 25,
          riskAversionPct: Number.isFinite(Number(riskAversionPct)) ? Number(riskAversionPct) : 40,
          detectionPct: Number.isFinite(Number(detectionPct)) ? Number(detectionPct) : 25,
          effortHoursPerWeek: Number.isFinite(Number(effortHoursPerWeek)) ? Number(effortHoursPerWeek) : 35,
          reviewOn: reviewOn || null,
          tasks: rows,
          frozen: null,
          observation: null,
          committedAt: null,
          reviewedAt: null,
          history: [
            {
              at: stamp(),
              type: 'created',
              summary: `Declared ${rows.length} task(s), ${rows.filter((t) => t.kind === 'measured').length} of them measured${forkedFrom ? ` — forked from “${String(forkedFrom).slice(0, 120)}”` : ''}`,
            },
          ],
        });
      },
      {
        type: 'scorecard.created',
        entity: 'scorecard',
        entityId: scorecardId,
        summary: `Declared the scorecard “${cleanTitle}”`,
      },
    );
    return { ok: true, id: scorecardId };
  }

  /** Edit a DRAFT only. A committed design is evidence; it is never rewritten. */
  function updateScorecard(scorecardId, patch = {}) {
    const current = scorecardById(scorecardId);
    if (!current) return fail('That scorecard no longer exists.');
    if (current.status !== 'draft') {
      return fail('This scorecard is committed. Its design is the record the prediction was frozen against — fork it into a new draft instead of editing it.');
    }
    const next = {};
    if (patch.title !== undefined) {
      const title = clean(patch.title)?.slice(0, 200) || '';
      if (title.length < 3) return fail('Give the scorecard a name of at least three characters.', 'title');
      next.title = title;
    }
    if (patch.objective !== undefined) next.objective = clean(patch.objective)?.slice(0, 600) || '';
    if (patch.ownerId !== undefined) next.ownerId = patch.ownerId && personExists(patch.ownerId) ? patch.ownerId : null;
    if (patch.tasks !== undefined) {
      const rows = sanitizeTaskRows(patch.tasks);
      if (!rows.length || !rows.some((t) => t.kind === 'measured')) {
        return fail('Keep at least one measured task.', 'tasks');
      }
      next.tasks = rows;
    }
    for (const key of ['stakesPct', 'professionalismPct', 'riskAversionPct', 'detectionPct', 'effortHoursPerWeek']) {
      if (patch[key] !== undefined) {
        const value = Number(patch[key]);
        if (!Number.isFinite(value)) return fail(`${key} must be a number.`, key);
        next[key] = value;
      }
    }
    if (patch.reviewOn !== undefined) next.reviewOn = patch.reviewOn || null;
    if (!Object.keys(next).length) return fail('Nothing to change.');
    store.update(
      (draft) => {
        const target = draft.scorecards.find((row) => row && row.id === scorecardId);
        if (!target) return;
        Object.assign(target, next, {
          updatedAt: stamp(),
          history: [...(target.history || []), { at: stamp(), type: 'edited', summary: `Edited ${Object.keys(next).join(', ')}` }].slice(-60),
        });
      },
      {
        type: 'scorecard.updated',
        entity: 'scorecard',
        entityId: scorecardId,
        summary: `Updated the draft scorecard “${current.title}”`,
      },
    );
    return { ok: true };
  }

  /**
   * Commit freezes the prediction and fires RULE-MTX-01. The design key is
   * recomputed from the live draft, so a stale preview cannot commit a different
   * design than the one the leader saw modelled.
   */
  function commitScorecard(scorecardId, { designKey, expectedRevision, reviewOn } = {}) {
    if (store.state.settings?.measurementAutoPropagate === false) {
      return fail('Scorecard propagation is paused in settings. Re-enable it in Settings before committing a scorecard.');
    }
    const current = scorecardById(scorecardId);
    if (!current) return fail('That scorecard no longer exists.');
    if (current.status !== 'draft') return fail('That scorecard is already committed.');
    const revision = Number(expectedRevision);
    if (Number.isFinite(revision) && revision !== store.state.meta.revision) {
      return fail('The workspace changed since the scorecard was previewed. Re-open the lab and review the current model.');
    }
    const liveKey = scorecardDesignKey(current);
    if (clean(designKey) && clean(designKey) !== liveKey) {
      return fail('The scorecard changed since it was previewed. Review the current model and commit that one.');
    }
    if (!current.tasks.some((t) => t.kind === 'measured')) return fail('Declare at least one measured task before committing.');
    const today = dayKey(clock());
    const prediction = freezeMeasurementPrediction(current);
    store.update(
      (draft) => {
        const target = draft.scorecards.find((row) => row && row.id === scorecardId);
        if (!target) return;
        target.status = 'committed';
        target.committedAt = stamp();
        target.reviewOn = reviewOn || target.reviewOn || addDays(today, 42);
        target.frozen = { at: stamp(), prediction };
        target.history = [...(target.history || []), {
          at: stamp(),
          type: 'committed',
          summary: `Froze the prediction: ${prediction.efficiencyPct}% modelled genuine value, ${prediction.gamingSharePct}% gaming, Goodhart ${prediction.goodhartIndex}/100`,
        }].slice(-60);
      },
      {
        type: SCORECARD_COMMITTED_EVENT,
        entity: 'scorecard',
        entityId: scorecardId,
        summary: `Committed the scorecard “${current.title}” with a frozen prediction`,
        automationOptions: { designKey: liveKey },
      },
    );
    return { ok: true, prediction, propagations: store.lastPropagations || [] };
  }

  /**
   * One recorded observation per committed scorecard. The leader's own estimate
   * of how much measured movement was cosmetic — never inferred from data the
   * app does not have.
   */
  function recordScorecardObservation(scorecardId, {
    recordedOn = null, gamingSharePct = 0, metricMovedPct = 0, trueOutcomePct = 0,
    note = '', source = 'conversation',
  } = {}) {
    const current = scorecardById(scorecardId);
    if (!current) return fail('That scorecard no longer exists.');
    if (current.status !== 'committed') return fail('Only a committed scorecard can receive an observation.');
    if (!current.frozen?.prediction) return fail('This scorecard has no frozen prediction, so there is nothing to compare against. Commit it first.');
    if (current.observation?.recordedOn) return fail('This scorecard already has an observation. The ledger keeps one per commit — fork a new scorecard for a new cycle.');
    const on = recordedOn || dayKey(clock());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(on))) return fail('Choose a valid observation date.', 'recordedOn');
    if (on > dayKey(clock())) return fail('An observation cannot be recorded in the future.', 'recordedOn');
    if (current.committedAt && on < dayKey(current.committedAt)) {
      return fail(`The scorecard was committed on ${dayKey(current.committedAt)}; an observation cannot predate it.`, 'recordedOn');
    }
    const pct = (value, field) => {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 100) return { error: `${field} must be between 0 and 100.` };
      return { value: n };
    };
    const gaming = pct(gamingSharePct, 'Recorded gaming share');
    if (gaming.error) return fail(gaming.error, 'gamingSharePct');
    const metric = pct(metricMovedPct, 'Metric movement');
    if (metric.error) return fail(metric.error, 'metricMovedPct');
    const truth = pct(trueOutcomePct, 'True outcome movement');
    if (truth.error) return fail(truth.error, 'trueOutcomePct');
    const text = clean(note)?.slice(0, 600) || '';
    if (text.length < 10) return fail('Say how you arrived at the gaming estimate, in at least 10 characters. An unexplained number is a guess wearing a suit.', 'note');
    const allowedSources = ['conversation', 'review', 'metric', 'audit', 'other'];
    const observation = {
      recordedOn: on,
      gamingSharePct: Math.round(gaming.value * 10) / 10,
      metricMovedPct: Math.round(metric.value * 10) / 10,
      trueOutcomePct: Math.round(truth.value * 10) / 10,
      note: text,
      source: allowedSources.includes(source) ? source : 'other',
      recordedAt: stamp(),
    };
    store.update(
      (draft) => {
        const target = draft.scorecards.find((row) => row && row.id === scorecardId);
        if (!target) return;
        target.observation = observation;
        target.updatedAt = stamp();
        target.history = [...(target.history || []), {
          at: stamp(),
          type: 'observed',
          summary: `Recorded ${observation.gamingSharePct}% gaming on ${on} against a frozen ${target.frozen?.prediction?.gamingSharePct ?? '—'}%`,
        }].slice(-60);
      },
      {
        type: SCORECARD_OBSERVED_EVENT,
        entity: 'scorecard',
        entityId: scorecardId,
        summary: `Recorded a measurement observation for “${current.title}”`,
      },
    );
    const integrity = scorecardIntegrity(scorecardById(scorecardId));
    return { ok: true, score: integrity.observationScore, propagations: store.lastPropagations || [] };
  }

  /** Close the cycle. The record keeps everything; only the status moves. */
  function reviewScorecard(scorecardId, { on = null, note = '' } = {}) {
    const current = scorecardById(scorecardId);
    if (!current) return fail('That scorecard no longer exists.');
    if (current.status !== 'committed') return fail('Only a committed scorecard can be reviewed.');
    if (!current.observation?.recordedOn) return fail('Record what happened before closing the cycle. A closed cycle with no observation teaches nothing.');
    const day = on || dayKey(clock());
    if (day > dayKey(clock())) return fail('A review cannot be dated in the future.', 'on');
    const text = clean(note)?.slice(0, 600) || '';
    store.update(
      (draft) => {
        const target = draft.scorecards.find((row) => row && row.id === scorecardId);
        if (!target) return;
        target.status = 'reviewed';
        target.reviewedAt = stamp();
        target.updatedAt = stamp();
        target.history = [...(target.history || []), {
          at: stamp(),
          type: 'reviewed',
          summary: text ? `Reviewed on ${day}: ${text}` : `Reviewed on ${day}`,
        }].slice(-60);
      },
      {
        type: 'scorecard.reviewed',
        entity: 'scorecard',
        entityId: scorecardId,
        summary: `Closed the measurement cycle for “${current.title}”`,
      },
    );
    return { ok: true };
  }

  /** Retire a scorecard without deleting its evidence. */
  function retireScorecard(scorecardId, { note = '' } = {}) {
    const current = scorecardById(scorecardId);
    if (!current) return fail('That scorecard no longer exists.');
    if (current.status === 'retired') return fail('That scorecard is already retired.');
    const reason = clean(note)?.slice(0, 400) || '';
    store.update(
      (draft) => {
        const target = draft.scorecards.find((row) => row && row.id === scorecardId);
        if (!target) return;
        target.status = 'retired';
        target.updatedAt = stamp();
        target.history = [...(target.history || []), {
          at: stamp(),
          type: 'retired',
          summary: reason || 'Retired without a recorded reason',
        }].slice(-60);
      },
      {
        type: 'scorecard.retired',
        entity: 'scorecard',
        entityId: scorecardId,
        summary: `Retired the scorecard “${current.title}”`,
      },
    );
    return { ok: true };
  }

  /**
   * Fork a design from the search into a NEW draft. The committed record is
   * never edited: the redesign is a new declaration with its own prediction, so
   * the previous forecast stays scorable.
   */
  function forkScorecard(scorecardId, { designId = 'value-weighted' } = {}) {
    const current = scorecardById(scorecardId);
    if (!current) return fail('That scorecard no longer exists.');
    const design = evaluateDesign(current, designId, {
      metricCostPct: Number(store.state.settings.measurementMetricCostPct) || 2,
    });
    if (!design) return fail('That design could not be modelled for this scorecard.');
    // `evaluateDesign` already re-derives the full post-design equilibrium, so the
    // fork copies the transformed parameters — including a halved gaming ease on
    // guardrailed metrics — rather than re-running the transformation by hand.
    const tasks = design.equilibrium.rows.map((row) => ({
      id: id('mtask'),
      name: row.name,
      kind: row.kind,
      weightPct: row.weightPct,
      trueValue: row.trueValue,
      effortCost: row.effortCost,
      gamingEase: row.gamingEase,
      noisePct: row.noisePct,
      ratchetPct: row.ratchetPct,
    }));
    return createScorecard({
      title: `${current.title} — ${design.label}`.slice(0, 200),
      objective: current.objective,
      ownerId: current.ownerId,
      tasks,
      stakesPct: design.equilibrium.params.stakesPct,
      professionalismPct: design.equilibrium.params.professionalismPct,
      riskAversionPct: design.equilibrium.params.riskAversionPct,
      detectionPct: design.equilibrium.params.detectionPct,
      effortHoursPerWeek: design.equilibrium.params.effortHoursPerWeek,
      reviewOn: current.reviewOn,
      forkedFrom: current.title,
    });
  }

  function updateMeasurementPolicy({ metricCostPct = undefined, autoPropagate = undefined } = {}) {
    const patch = {};
    if (metricCostPct !== undefined) {
      const n = Math.round(Number(metricCostPct));
      if (!Number.isFinite(n) || n < 0 || n > 25) return fail('The per-metric measurement cost must be between 0 and 25 value points.', 'metricCostPct');
      patch.measurementMetricCostPct = n;
    }
    if (autoPropagate !== undefined) patch.measurementAutoPropagate = Boolean(autoPropagate);
    if (!Object.keys(patch).length) return fail('Nothing to change in the measurement policy.');
    return api.updateSettings(patch);
  }

  Object.assign(api, {
    measurementReport: measurementReportAction,
    measurementBriefText,
    createScorecard,
    updateScorecard,
    commitScorecard,
    recordScorecardObservation,
    reviewScorecard,
    retireScorecard,
    forkScorecard,
    updateMeasurementPolicy,
    leaderContinuityReport: leaderContinuityReportAction,
    leaderContinuityBriefText,
    startContinuityDrill,
    closeContinuityDrill,
    commissionContinuityCover,
    scanLeaderContinuity,
    updateContinuityPolicy,
  });


  /* ---------------------------------------- structural design (v53) */

  /**
   * Declare a structural design.
   *
   * A design is a set of *proposed* reporting lines and nothing else. It is
   * declared before it is applied, so the prediction can be frozen against the
   * structure it intends to produce rather than reconstructed afterwards.
   */
  function addOrgDesign(input = {}) {
    const label = String(clean(input.label) || '').slice(0, 140);
    if (!label) return fail('Name the design. “The reorg” has to survive being read again in six months.', 'label');
    const ownerId = String(clean(input.ownerId) || '');
    if (ownerId && !personExists(ownerId)) return fail('That owner is no longer in the roster.', 'ownerId');
    const conventions = normalizeOrgConventions({
      ...conventionsFromSettings(store.state),
      ...(input.conventions && typeof input.conventions === 'object' ? input.conventions : {}),
    });
    const reviewHorizonDays = Number(input.reviewHorizonDays);
    if (input.reviewHorizonDays !== undefined && input.reviewHorizonDays !== null && input.reviewHorizonDays !== ''
      && (!Number.isFinite(reviewHorizonDays) || reviewHorizonDays < 30 || reviewHorizonDays > 730)) {
      return fail('The review horizon must be between 30 and 730 days.', 'reviewHorizonDays');
    }
    const designId = id('orgdesign');
    store.update(
      (draft) => {
        draft.orgDesigns = Array.isArray(draft.orgDesigns) ? draft.orgDesigns : [];
        draft.orgDesigns.push({
          id: designId,
          label,
          purpose: String(clean(input.purpose) || '').slice(0, 1200),
          ownerId: ownerId || null,
          status: 'draft',
          declaredOn: today(),
          committedOn: null,
          reviewOn: null,
          settledOn: null,
          conventions: {
            ...conventions,
            reviewHorizonDays: Number.isFinite(reviewHorizonDays) ? Math.round(reviewHorizonDays) : conventions.reviewHorizonDays,
          },
          moves: [],
          previousManagers: [],
          snapshot: null,
          outcomes: [],
          history: [{
            at: stamp(),
            type: 'declared',
            summary: `Declared a structural design against a declared span band of ${conventions.spanMin}–${conventions.spanMax} and ${conventions.coordinationHoursPerWeek} coordination hours per channel per week.`,
          }],
          createdAt: stamp(),
          updatedAt: stamp(),
        });
      },
      { type: ORG_DECLARED_EVENT, entity: 'orgdesign', entityId: designId, summary: `Declared structural design “${label.slice(0, 80)}”` },
    );
    return { ok: true, id: designId };
  }

  function assertDraftDesign(designId) {
    const existing = (store.state.orgDesigns || []).find((row) => row && row.id === designId);
    if (!existing) return { error: fail('That design no longer exists.') };
    if (existing.status !== 'draft') {
      return { error: fail('Only a draft can be edited. A committed design is a record of reporting lines that actually moved; revert it or declare a new one.', 'designId') };
    }
    return { existing };
  }

  function updateOrgDesign(designId, patch = {}) {
    const { existing, error } = assertDraftDesign(designId);
    if (error) return error;
    const next = {};
    if (patch.label !== undefined) {
      const label = String(clean(patch.label) || '').slice(0, 140);
      if (!label) return fail('Name the design.', 'label');
      next.label = label;
    }
    if (patch.purpose !== undefined) next.purpose = String(clean(patch.purpose) || '').slice(0, 1200);
    if (patch.ownerId !== undefined) {
      const ownerId = String(clean(patch.ownerId) || '');
      if (ownerId && !personExists(ownerId)) return fail('That owner is no longer in the roster.', 'ownerId');
      next.ownerId = ownerId || null;
    }
    if (patch.conventions !== undefined) {
      next.conventions = normalizeOrgConventions({ ...existing.conventions, ...(patch.conventions || {}) });
    }
    if (patch.reviewHorizonDays !== undefined) {
      const days = Math.round(Number(patch.reviewHorizonDays));
      if (!Number.isFinite(days) || days < 30 || days > 730) return fail('The review horizon must be between 30 and 730 days.', 'reviewHorizonDays');
      next.reviewHorizonDays = days;
    }
    if (patch.moves !== undefined) {
      if (!Array.isArray(patch.moves)) return fail('Moves must be a list.', 'moves');
      if (patch.moves.length > ORG_DESIGN_MAX_MOVES) return fail(`This app holds up to ${ORG_DESIGN_MAX_MOVES} moves in one design. Split it.`, 'moves');
      const seen = new Set();
      const moves = [];
      for (const raw of patch.moves) {
        const personId = String(clean(raw?.personId) || '');
        if (!personId) return fail('Every move needs a person.', 'moves');
        if (!personExists(personId)) return fail('A move names someone who is no longer in the roster.', 'moves');
        const person = store.state.people.find((row) => row.id === personId);
        if (person && person.status === 'archived') return fail('An archived person cannot be moved. Restore them first.', 'moves');
        if (seen.has(personId)) return fail('A person can have only one manager: the same person appears twice in this design.', 'moves');
        seen.add(personId);
        const toManagerId = raw?.toManagerId === null || raw?.toManagerId === undefined || raw?.toManagerId === '' ? null : String(clean(raw.toManagerId));
        if (toManagerId === personId) return fail('A person cannot report to themselves.', 'moves');
        if (toManagerId) {
          if (!personExists(toManagerId)) return fail('A move names a manager who is no longer in the roster.', 'moves');
          const manager = store.state.people.find((row) => row.id === toManagerId);
          if (manager && manager.status === 'archived') return fail('An archived person cannot manage anyone.', 'moves');
        }
        moves.push({ personId, toManagerId, note: String(clean(raw?.note) || '').slice(0, 400) });
      }
      next.moves = moves;
    }
    if (!Object.keys(next).length) return fail('Nothing to change.');
    store.update(
      (draft) => {
        const design = (draft.orgDesigns || []).find((row) => row && row.id === designId);
        if (!design) return;
        Object.assign(design, next);
        design.updatedAt = stamp();
        design.history = Array.isArray(design.history) ? design.history : [];
        const changed = next.moves ? `${next.moves.length} proposed move(s)` : Object.keys(next).join(', ');
        design.history.push({ at: stamp(), type: 'updated', summary: `Updated ${changed}.` });
        design.history = design.history.slice(-40);
      },
      { type: ORG_UPDATED_EVENT, entity: 'orgdesign', entityId: designId, summary: `Updated structural design “${existing.label.slice(0, 60)}”` },
    );
    return { ok: true };
  }

  /**
   * Commit — the only action in this module that changes a reporting line.
   *
   * Refusals are deliberate and specific: no owner, no moves, a move that
   * changes nothing, a move that would create a reporting cycle. The frozen
   * snapshot is written in the same transaction as the roster change, so the
   * prediction and the change it describes can never disagree.
   */
  function commitOrgDesign(designId) {
    const existing = (store.state.orgDesigns || []).find((row) => row && row.id === designId);
    if (!existing) return fail('That design no longer exists.');
    if (existing.status !== 'draft') return fail('Only a draft can be committed. This design has already been applied, reverted or abandoned.', 'designId');
    const owner = (store.state.people || []).find((person) => person && person.id === existing.ownerId && person.status !== 'archived');
    if (!owner) {
      return fail('Name an accountable owner before committing. The residual decision, the scope task and the outcome review are all owned work — a structure nobody owns is a diagram.', 'ownerId');
    }
    const moves = Array.isArray(existing.moves) ? existing.moves : [];
    if (!moves.length) return fail('A design with no moves changes nothing. Add at least one reporting-line change.', 'moves');
    const contract = designContract(existing);
    const proposal = buildStructure(store.state, { moves });
    if (proposal.issues.cycles.length || proposal.issues.selfManaged.length) {
      return fail('This design would create a reporting cycle. Two people cannot each be the other’s manager.', 'moves');
    }
    if (proposal.issues.missingManager.length) {
      return fail('This design points at a manager who is no longer in the roster. Fix the move or remove it.', 'moves');
    }
    const simulation = simulateDesign(store.state, existing, { now: clock(), conventions: contract.conventions });
    if (!simulation.delta.moved) {
      return fail('Every proposed move matches the reporting line that already exists, so committing would change nothing.', 'moves');
    }
    const previousManagers = moves.map((move) => {
      const person = store.state.people.find((row) => row.id === move.personId);
      return { personId: move.personId, managerId: person?.managerId || null };
    });
    const snapshot = freezeDesignSnapshot(simulation, {
      capturedAt: stamp(),
      byId: existing.ownerId || null,
      appliedMoves: moves.map((move) => ({
        personId: move.personId,
        fromManagerId: previousManagers.find((row) => row.personId === move.personId)?.managerId ?? null,
        toManagerId: move.toManagerId ?? null,
      })),
      previousManagers,
    });
    const reviewOn = addDays(today(), contract.reviewHorizonDays);
    store.update(
      (draft) => {
        const design = (draft.orgDesigns || []).find((row) => row && row.id === designId);
        if (!design) return;
        // Apply the moves to the roster in the same transaction. A person whose
        // record vanished between validation and here is skipped rather than
        // resurrected; the snapshot keeps the full list either way.
        for (const move of design.moves || []) {
          const person = (draft.people || []).find((row) => row && row.id === move.personId);
          if (!person) continue;
          person.managerId = move.toManagerId || null;
        }
        design.status = 'committed';
        design.committedOn = today();
        design.reviewOn = reviewOn;
        design.previousManagers = previousManagers;
        design.snapshot = snapshot;
        design.updatedAt = stamp();
        design.history = Array.isArray(design.history) ? design.history : [];
        design.history.push({
          at: stamp(),
          type: 'committed',
          summary: `Committed: ${simulation.delta.moved} reporting line(s) changed, max span ${simulation.proposed.span.max ?? '—'}, ${simulation.proposed.coordination.hoursPerWeek} coordination hrs/wk. Frozen prediction: modelled median P80 wait ${simulation.delta.modelledWaitP80Weeks === null ? 'not modelled' : `${simulation.delta.modelledWaitP80Weeks} wks`}.`,
        });
        design.history = design.history.slice(-40);
      },
      { type: ORG_COMMITTED_EVENT, entity: 'orgdesign', entityId: designId, summary: `Committed structural design “${existing.label.slice(0, 70)}”` },
    );
    return { ok: true, propagations: store.lastPropagations || [], snapshot };
  }

  /**
   * Revert. Restores exactly the manager recorded at commit, and only where the
   * reporting line is still the one this design set. A line someone changed in
   * the meantime is left alone and counted, because silently overwriting a later
   * decision would be a second reorg nobody asked for.
   */
  function revertOrgDesign(designId) {
    const existing = (store.state.orgDesigns || []).find((row) => row && row.id === designId);
    if (!existing) return fail('That design no longer exists.');
    if (existing.status !== 'committed') return fail('Only a committed design can be reverted.', 'designId');
    const applied = new Map((existing.moves || []).map((move) => [move.personId, move.toManagerId || null]));
    const restorable = (existing.previousManagers || []).filter((row) => {
      const person = store.state.people.find((entry) => entry.id === row.personId);
      if (!person || person.status === 'archived') return false;
      return (person.managerId || null) === (applied.get(row.personId) ?? null);
    });
    if (!restorable.length) {
      return fail('Every reporting line this design set has since been changed again, so there is nothing to restore. Declare a new design instead of reverting into someone else’s decision.', 'designId');
    }
    const skipped = (existing.previousManagers || []).length - restorable.length;
    store.update(
      (draft) => {
        const design = (draft.orgDesigns || []).find((row) => row && row.id === designId);
        if (!design) return;
        for (const row of design.previousManagers || []) {
          const person = (draft.people || []).find((entry) => entry && entry.id === row.personId);
          if (!person || person.status === 'archived') continue;
          if ((person.managerId || null) !== (applied.get(row.personId) ?? null)) continue;
          person.managerId = row.managerId || null;
        }
        design.status = 'reverted';
        design.updatedAt = stamp();
        design.history = Array.isArray(design.history) ? design.history : [];
        design.history.push({
          at: stamp(),
          type: 'reverted',
          summary: `Reverted ${restorable.length} reporting line(s) to the managers recorded at commit${skipped ? `; ${skipped} line(s) had changed again and were left alone` : ''}. The frozen prediction is kept.`,
        });
        design.history = design.history.slice(-40);
      },
      { type: ORG_REVERTED_EVENT, entity: 'orgdesign', entityId: designId, summary: `Reverted structural design “${existing.label.slice(0, 70)}”` },
    );
    return { ok: true, restored: restorable.length, skipped };
  }

  /** Settle: score the frozen prediction once the declared horizon has passed. */
  function settleOrgDesign(designId, { force = false } = {}) {
    const existing = (store.state.orgDesigns || []).find((row) => row && row.id === designId);
    if (!existing) return fail('That design no longer exists.');
    if (existing.status === 'settled') return fail('This design has already been settled.', 'designId');
    if (existing.status !== 'committed') return fail('Only a committed design carries a prediction to score.', 'designId');
    if (!existing.snapshot) return fail('This design has no frozen snapshot, so there is no prediction to score.', 'designId');
    if (!force && existing.reviewOn && existing.reviewOn > today()) {
      return fail(`The declared review date is ${existing.reviewOn}. Settling before it measures the queue over a window you chose to shorten — pass the explicit override if that is what you mean.`, 'designId');
    }
    store.update(
      (draft) => {
        const design = (draft.orgDesigns || []).find((row) => row && row.id === designId);
        if (!design) return;
        design.status = 'settled';
        design.settledOn = today();
        design.updatedAt = stamp();
        design.history = Array.isArray(design.history) ? design.history : [];
        design.history.push({ at: stamp(), type: 'settled', summary: 'Settled: the frozen prediction was compared to the same managers’ measured waits.' });
        design.history = design.history.slice(-40);
      },
      { type: ORG_SETTLED_EVENT, entity: 'orgdesign', entityId: designId, summary: `Settled structural design “${existing.label.slice(0, 70)}”` },
    );
    return { ok: true, propagations: store.lastPropagations || [] };
  }

  /** Explicit scan: the leader's "look again". Never commits, never reverts. */
  function scanOrgDesign(designId) {
    const existing = (store.state.orgDesigns || []).find((row) => row && row.id === designId);
    if (!existing) return fail('That design no longer exists.');
    const shape = () => JSON.stringify({
      links: (store.state.links || []).length,
      decisions: (store.state.decisions || []).length,
      delegations: (store.state.delegations || []).length,
      outcomes: (store.state.orgDesigns || []).reduce((acc, row) => acc + (row.outcomes || []).length, 0),
    });
    const before = shape();
    store.update(
      () => {},
      { type: ORG_SCANNED_EVENT, entity: 'orgdesign', entityId: designId, summary: `Structural scan requested by the leader on “${existing.label.slice(0, 60)}”` },
    );
    return { ok: true, changed: before !== shape(), propagations: store.lastPropagations || [] };
  }

  function abandonOrgDesign(designId) {
    const { existing, error } = assertDraftDesign(designId);
    if (error) return error;
    store.update(
      (draft) => {
        const design = (draft.orgDesigns || []).find((row) => row && row.id === designId);
        if (!design) return;
        design.status = 'abandoned';
        design.updatedAt = stamp();
        design.history = Array.isArray(design.history) ? design.history : [];
        design.history.push({ at: stamp(), type: 'abandoned', summary: 'Abandoned. Kept in the record so a design that was considered is not silently forgotten.' });
        design.history = design.history.slice(-40);
      },
      { type: ORG_UPDATED_EVENT, entity: 'orgdesign', entityId: designId, summary: `Abandoned structural design “${existing.label.slice(0, 60)}”` },
    );
    return { ok: true };
  }

  Object.assign(api, {
    addOrgDesign,
    updateOrgDesign,
    commitOrgDesign,
    revertOrgDesign,
    settleOrgDesign,
    scanOrgDesign,
    abandonOrgDesign,
  });


  /* ------------------------------------- information value (v54) */

  /**
   * Shared validation for a decision frame's declared states, options and
   * payoff table.
   *
   * Three refusals here are the whole point of the module:
   *   - probabilities must be whole percentages summing to exactly 100, because
   *     renormalising a typo produces a confident answer from numbers nobody
   *     declared;
   *   - a payoff cell either has a value or is absent, never zero, because a
   *     zero would make the unpriced option look free;
   *   - an option and a state are required, in that order, because a one-state
   *     frame has no uncertainty to value.
   */
  function validateVoiFrameParts(input) {
    const statesRaw = Array.isArray(input.states) ? input.states : [];
    const optionsRaw = Array.isArray(input.options) ? input.options : [];
    if (statesRaw.length < 2) return fail('Declare at least two states of the world — a single state has no uncertainty to buy information about.', 'states');
    if (statesRaw.length > VOI_MAX_STATES) return fail(`This app holds up to ${VOI_MAX_STATES} states in one frame. Fold the rest into “other”.`, 'states');
    if (optionsRaw.length < 2) return fail('Declare at least two options — including the one you would take by doing nothing.', 'options');
    if (optionsRaw.length > VOI_MAX_OPTIONS) return fail(`This app holds up to ${VOI_MAX_OPTIONS} options in one frame.`, 'options');

    const states = [];
    const stateSeen = new Set();
    for (const raw of statesRaw) {
      const label = String(clean(raw?.label) ?? '').slice(0, VOI_MAX_STATE_LABEL);
      if (label.length < 2) return fail('Name every state of the world.', 'states');
      const probability = Number(raw?.probability);
      if (!Number.isInteger(probability) || probability < 0 || probability > 100) {
        return fail('Every state needs a whole-number probability between 0 and 100.', 'states');
      }
      const stateId = String(clean(raw?.id) ?? '') || id('vs');
      if (stateSeen.has(stateId)) return fail('Two states share an identifier. Reload and try again.', 'states');
      stateSeen.add(stateId);
      const premiseId = String(clean(raw?.premiseId) ?? '') || null;
      if (premiseId && !(store.state.premises || []).some((row) => row && row.id === premiseId)) {
        return fail('That assumption is no longer in the ledger. Reload the frame.', 'states');
      }
      states.push({ id: stateId, label, probability, premiseId });
    }
    const sum = states.reduce((acc, row) => acc + row.probability, 0);
    if (sum !== 100) {
      return fail(`The state probabilities sum to ${sum}%. They have to sum to exactly 100% — the app will not rescale them for you, because then the numbers would not be the ones you declared.`, 'states');
    }

    const options = [];
    const optionSeen = new Set();
    for (const raw of optionsRaw) {
      const label = String(clean(raw?.label) ?? '').slice(0, VOI_MAX_STATE_LABEL);
      if (label.length < 2) return fail('Name every option.', 'options');
      const optionId = String(clean(raw?.id) ?? '') || id('vo');
      if (optionSeen.has(optionId)) return fail('Two options share an identifier. Reload and try again.', 'options');
      optionSeen.add(optionId);
      options.push({ id: optionId, label, isStatusQuo: Boolean(raw?.isStatusQuo) });
    }

    const payoffs = [];
    const payoffSeen = new Set();
    for (const raw of Array.isArray(input.payoffs) ? input.payoffs : []) {
      const optionId = String(clean(raw?.optionId) ?? '');
      const stateId = String(clean(raw?.stateId) ?? '');
      if (!optionSeen.has(optionId) || !stateSeen.has(stateId)) continue;
      if (raw?.value === null || raw?.value === undefined || raw?.value === '') continue;
      const value = Number(raw.value);
      if (!Number.isFinite(value)) return fail('Every entered payoff has to be a number. Leave a cell blank if it is unknown — the app treats blank as unpriced, not as zero.', 'payoffs');
      const key = `${optionId}::${stateId}`;
      if (payoffSeen.has(key)) continue;
      payoffSeen.add(key);
      payoffs.push({ optionId, stateId, value: Math.round(value * 100) / 100 });
    }

    return { ok: true, states, options, payoffs };
  }

  function voiFrameById(frameId) {
    return (store.state.voiDecisions || []).find((row) => row && row.id === frameId) || null;
  }

  function assertOpenFrame(frameId) {
    const existing = voiFrameById(frameId);
    if (!existing) return { error: fail('That decision frame no longer exists.') };
    if (existing.status !== 'open') {
      return { error: fail('Only an open frame can be edited. A decided frame is the record of a call made under a stated uncertainty; declare a new frame instead.', 'frameId') };
    }
    return { existing };
  }

  function addVoiDecision(input = {}) {
    const label = String(clean(input.label) ?? '').slice(0, VOI_MAX_LABEL);
    if (label.length < 3) return fail('Name the decision in at least 3 characters. “The vendor call” has to survive being read again in six months.', 'label');
    const ownerId = String(clean(input.ownerId) ?? '');
    if (ownerId && !personExists(ownerId)) return fail('That owner is no longer in the roster.', 'ownerId');
    const decisionId = String(clean(input.decisionId) ?? '');
    if (decisionId && !(store.state.decisions || []).some((row) => row && row.id === decisionId)) {
      return fail('That decision record no longer exists.', 'decisionId');
    }
    const currency = String(clean(input.currency) ?? '').toUpperCase();
    if (currency && !VOI_CURRENCIES.includes(currency)) return fail('Choose one of the supported currencies.', 'currency');
    const parts = validateVoiFrameParts(input);
    if (!parts.ok) return parts;

    const frameId = id('voi');
    store.update(
      (draft) => {
        draft.voiDecisions = Array.isArray(draft.voiDecisions) ? draft.voiDecisions : [];
        draft.voiDecisions.push({
          id: frameId,
          label,
          question: String(clean(input.question) ?? '').slice(0, VOI_MAX_QUESTION),
          ownerId: ownerId || null,
          decisionId: decisionId || null,
          currency: currency || 'USD',
          status: 'open',
          states: parts.states,
          options: parts.options,
          payoffs: parts.payoffs,
          chosenOptionId: null,
          declaredOn: today(),
          decidedOn: null,
          reviewOn: null,
          settledOn: null,
          snapshot: null,
          outcomes: [],
          history: [{
            at: stamp(),
            type: 'declared',
            summary: `Declared ${parts.states.length} state(s) summing to 100% and ${parts.options.length} option(s), with ${parts.payoffs.length} of ${parts.states.length * parts.options.length} payoff cells entered.`,
          }],
          createdAt: stamp(),
          updatedAt: stamp(),
        });
      },
      { type: VOI_DECLARED_EVENT, entity: 'voi', entityId: frameId, summary: `Declared decision frame “${label.slice(0, 80)}”` },
    );
    return { ok: true, id: frameId, propagations: store.lastPropagations || [] };
  }

  function updateVoiDecision(frameId, patch = {}) {
    const { existing, error } = assertOpenFrame(frameId);
    if (error) return error;
    const next = {};
    if (patch.label !== undefined) {
      const label = String(clean(patch.label) ?? '').slice(0, VOI_MAX_LABEL);
      if (label.length < 3) return fail('Name the decision.', 'label');
      next.label = label;
    }
    if (patch.question !== undefined) next.question = String(clean(patch.question) ?? '').slice(0, VOI_MAX_QUESTION);
    if (patch.ownerId !== undefined) {
      const ownerId = String(clean(patch.ownerId) ?? '');
      if (ownerId && !personExists(ownerId)) return fail('That owner is no longer in the roster.', 'ownerId');
      next.ownerId = ownerId || null;
    }
    if (patch.decisionId !== undefined) {
      const decisionId = String(clean(patch.decisionId) ?? '');
      if (decisionId && !(store.state.decisions || []).some((row) => row && row.id === decisionId)) {
        return fail('That decision record no longer exists.', 'decisionId');
      }
      next.decisionId = decisionId || null;
    }
    if (patch.currency !== undefined) {
      const currency = String(clean(patch.currency) ?? '').toUpperCase();
      if (!VOI_CURRENCIES.includes(currency)) return fail('Choose one of the supported currencies.', 'currency');
      next.currency = currency;
    }
    const touchesTable = patch.states !== undefined || patch.options !== undefined || patch.payoffs !== undefined;
    if (touchesTable) {
      const merged = {
        states: patch.states !== undefined ? patch.states : existing.states,
        options: patch.options !== undefined ? patch.options : existing.options,
        payoffs: patch.payoffs !== undefined ? patch.payoffs : existing.payoffs,
      };
      const parts = validateVoiFrameParts(merged);
      if (!parts.ok) return parts;
      next.states = parts.states;
      next.options = parts.options;
      next.payoffs = parts.payoffs;
    }
    if (!Object.keys(next).length) return fail('Nothing to change.');
    store.update(
      (draft) => {
        const frame = (draft.voiDecisions || []).find((row) => row && row.id === frameId);
        if (!frame) return;
        Object.assign(frame, next);
        frame.updatedAt = stamp();
        frame.history = Array.isArray(frame.history) ? frame.history : [];
        const detail = touchesTable
          ? `${(next.states || frame.states).length} state(s) / ${(next.options || frame.options).length} option(s) / ${(next.payoffs || frame.payoffs).length} priced cell(s)`
          : Object.keys(next).join(', ');
        frame.history.push({ at: stamp(), type: 'updated', summary: `Updated ${detail}.` });
        frame.history = frame.history.slice(-40);
      },
      { type: VOI_UPDATED_EVENT, entity: 'voi', entityId: frameId, summary: `Updated decision frame “${existing.label.slice(0, 60)}”` },
    );
    return { ok: true, propagations: store.lastPropagations || [] };
  }

  /**
   * Decide. The frame freezes the EVPI, the per-option expected values and the
   * declared distribution in the same transaction as the choice, because a
   * decision made under a stated uncertainty has to be read back against the
   * number that was on the page at the time.
   *
   * Choosing against the expected-value option is allowed and requires a written
   * reason. That is not a nudge towards the arithmetic — a leader may legitimately
   * prefer the robust option — it is a demand that the disagreement be recorded
   * rather than absorbed.
   */
  function decideVoiDecision(frameId, { chosenOptionId, note } = {}) {
    const { existing, error } = assertOpenFrame(frameId);
    if (error) return error;
    const conventions = voiConventionsFromSettings(store.state);
    const reading = evaluateFrame(existing, { conventions });
    if (!reading.priced) {
      return fail(`This frame cannot be valued yet: ${reading.reasons.join(' ')} A decision taken from an unpriced frame would look quantified and would not be.`, 'payoffs');
    }
    const optionId = String(clean(chosenOptionId) ?? '');
    const option = (existing.options || []).find((row) => row && row.id === optionId);
    if (!option) return fail('Choose the option you are taking.', 'chosenOptionId');
    const rationale = String(clean(note) ?? '').slice(0, VOI_MAX_NOTE);
    const againstArithmetic = reading.best && optionId !== reading.best.optionId;
    if (againstArithmetic && rationale.length < 10) {
      return fail(`You are choosing against the expected-value option (“${moneyLabel(existing, reading.best.optionId)}”). That can be the right call — the robust or the reversible option often is — but write at least a sentence explaining why, so the record shows a judgement rather than an accident.`, 'note');
    }
    const reviewOn = addDays(today(), conventions.reviewHorizonDays);
    const snapshot = {
      version: 1,
      capturedAt: stamp(),
      evpi: reading.evpi,
      evpiShareOfStakePct: reading.evpiShareOfStakePct,
      bestOptionId: reading.best ? reading.best.optionId : null,
      chosenOptionId: optionId,
      nearTie: reading.nearTie,
      stake: reading.stake,
      currency: existing.currency || 'USD',
      probabilities: (existing.states || []).map((state) => ({ stateId: state.id, pct: state.probability })),
      readings: (existing.options || []).map((row) => ({
        optionId: row.id,
        ev: reading.options.find((entry) => entry.optionId === row.id)?.ev ?? null,
      })),
    };
    store.update(
      (draft) => {
        const frame = (draft.voiDecisions || []).find((row) => row && row.id === frameId);
        if (!frame) return;
        frame.status = 'decided';
        frame.chosenOptionId = optionId;
        frame.decidedOn = today();
        frame.reviewOn = reviewOn;
        frame.snapshot = snapshot;
        frame.updatedAt = stamp();
        frame.history = Array.isArray(frame.history) ? frame.history : [];
        frame.history.push({
          at: stamp(),
          type: 'decided',
          summary: `Decided “${option.label}” with EVPI frozen at ${snapshot.evpi === null ? 'not priced' : snapshot.evpi} ${frame.currency}. ${againstArithmetic ? 'Chosen against the expected-value option; a written reason is recorded.' : 'Chosen consistent with the expected-value ranking.'}`,
        });
        frame.history = frame.history.slice(-40);
      },
      { type: VOI_DECIDED_EVENT, entity: 'voi', entityId: frameId, summary: `Decided frame “${existing.label.slice(0, 60)}”` },
    );
    return { ok: true, propagations: store.lastPropagations || [], snapshot };
  }

  function moneyLabel(frame, optionId) {
    const option = (frame.options || []).find((row) => row && row.id === optionId);
    return option ? option.label : 'another option';
  }

  /**
   * Record which state actually happened. This is what makes the declared
   * distribution falsifiable: the frozen probabilities are scored (Brier and
   * log loss) and the regret actually incurred is written down beside them.
   */
  function settleVoiDecision(frameId, { realizedStateId, note } = {}) {
    const existing = voiFrameById(frameId);
    if (!existing) return fail('That decision frame no longer exists.');
    if (existing.status !== 'decided') return fail('Only a decided frame can be settled against what happened.', 'frameId');
    if (!existing.snapshot) return fail('This frame has no frozen snapshot, so there is no stated distribution to score.', 'frameId');
    if (existing.settledOn) return fail('This frame has already been settled.', 'frameId');
    const stateId = String(clean(realizedStateId) ?? '');
    const state = (existing.states || []).find((row) => row && row.id === stateId);
    if (!state) return fail('Record which of the declared states actually happened.', 'realizedStateId');
    const chosen = (existing.options || []).find((row) => row && row.id === existing.chosenOptionId);
    if (!chosen) return fail('This frame has no recorded choice to score.', 'frameId');
    // Regret in the state that actually happened: what the best option would
    // have paid minus what the chosen option did. Priced only when every option
    // has a value in that state — a partial column cannot answer the question.
    const values = (existing.options || []).map((option) => {
      const cell = (existing.payoffs || []).find((row) => row.optionId === option.id && row.stateId === stateId);
      return { optionId: option.id, value: cell ? cell.value : null };
    });
    const complete = values.every((row) => row.value !== null);
    const chosenValue = values.find((row) => row.optionId === chosen.id)?.value ?? null;
    const regret = complete && chosenValue !== null
      ? Math.round((Math.max(...values.map((row) => row.value)) - chosenValue) * 100) / 100
      : null;
    const noteText = String(clean(note) ?? '').slice(0, VOI_MAX_NOTE);
    store.update(
      (draft) => {
        const frame = (draft.voiDecisions || []).find((row) => row && row.id === frameId);
        if (!frame) return;
        frame.outcomes = Array.isArray(frame.outcomes) ? frame.outcomes : [];
        frame.outcomes.push({
          on: today(),
          realizedStateId: stateId,
          chosenOptionId: chosen.id,
          regret,
          probabilities: (frame.snapshot?.probabilities || []).map((row) => ({ stateId: row.stateId, pct: row.pct })),
          note: noteText,
        });
        frame.settledOn = today();
        frame.updatedAt = stamp();
        frame.history = Array.isArray(frame.history) ? frame.history : [];
        frame.history.push({
          at: stamp(),
          type: 'settled',
          summary: `Realised state recorded: “${state.label}”. ${regret === null ? 'Regret is not priced for this state.' : `Regret actually incurred: ${regret} ${frame.currency}.`}`,
        });
        frame.history = frame.history.slice(-40);
      },
      { type: VOI_SCANNED_EVENT, entity: 'voi', entityId: frameId, summary: `Settled frame “${existing.label.slice(0, 60)}” against the state that occurred` },
    );
    return { ok: true, regret };
  }

  function abandonVoiDecision(frameId) {
    const { existing, error } = assertOpenFrame(frameId);
    if (error) return error;
    store.update(
      (draft) => {
        const frame = (draft.voiDecisions || []).find((row) => row && row.id === frameId);
        if (!frame) return;
        frame.status = 'abandoned';
        frame.updatedAt = stamp();
        frame.history = Array.isArray(frame.history) ? frame.history : [];
        frame.history.push({ at: stamp(), type: 'abandoned', summary: 'Abandoned. Kept in the record so a question that was priced is not silently forgotten.' });
        frame.history = frame.history.slice(-40);
      },
      { type: VOI_UPDATED_EVENT, entity: 'voi', entityId: frameId, summary: `Abandoned frame “${existing.label.slice(0, 60)}”` },
    );
    return { ok: true };
  }

  /**
   * Declare an investigation. The sensitivity and specificity are the leader's
   * own claim about the test's accuracy — not a vendor's — because EVSI is a
   * function of them and a flattering accuracy is the easiest way to make an
   * expensive test look worth buying.
   */
  function addInformationRequest(frameId, input = {}) {
    const { existing, error } = assertOpenFrame(frameId);
    if (error) return error;
    const label = String(clean(input.label) ?? '').slice(0, VOI_MAX_LABEL);
    if (label.length < 3) return fail('Name the investigation in at least 3 characters.', 'label');
    const targets = Array.isArray(input.targetStateIds) ? input.targetStateIds.map((value) => String(clean(value) ?? '')) : [];
    const validTargets = targets.filter((value) => (existing.states || []).some((state) => state.id === value));
    if (!validTargets.length) return fail('Name the state(s) of the world this test is designed to detect. A test with no target cannot be valued.', 'targetStateIds');
    if (input.premiseEquivalent === true && (validTargets.length !== 1 || !existing.states.find((state) => state.id === validTargets[0])?.premiseId)) {
      return fail('To update an assumption, select exactly one state linked to that assumption and confirm they are equivalent.', 'targetStateIds');
    }
    const sensitivityPct = Number(input.sensitivityPct);
    const specificityPct = Number(input.specificityPct);
    if (!Number.isInteger(sensitivityPct) || sensitivityPct < 50 || sensitivityPct > 100) {
      return fail('Sensitivity must be a whole number from 50 to 100. Claim the accuracy you would defend, not the accuracy you hope for.', 'sensitivityPct');
    }
    if (!Number.isInteger(specificityPct) || specificityPct < 50 || specificityPct > 100) {
      return fail('Specificity must be a whole number from 50 to 100.', 'specificityPct');
    }
    if (sensitivityPct + specificityPct <= 100) {
      return fail('A test whose sensitivity and specificity sum to 100% or less is a coin flip: it carries no information and can be worth nothing. Raise one of them or do not buy the test.', 'sensitivityPct');
    }
    const cost = Number(input.cost);
    if (!Number.isFinite(cost) || cost < 0 || cost > 1e9) return fail('Enter the cost of running this investigation, as a number. Zero is allowed for work you already have to do.', 'cost');
    const delayCostRaw = input.delayCost === undefined || input.delayCost === null || input.delayCost === '' ? 0 : Number(input.delayCost);
    if (!Number.isFinite(delayCostRaw) || delayCostRaw < 0 || delayCostRaw > 1e9) {
      return fail('Enter what the wait itself is worth as a number, or leave it at zero. The delay is a real cost of learning, and a test priced only by its invoice flatters itself.', 'delayCost');
    }
    const delayCost = Math.round(delayCostRaw * 100) / 100;
    const dueRaw = String(clean(input.dueOn) ?? '');
    if (dueRaw && !/^\d{4}-\d{2}-\d{2}$/.test(dueRaw)) return fail('The due date must be a calendar date.', 'dueOn');
    if (dueRaw && dueRaw < today()) return fail('A due date in the past cannot be met. Choose a real window for the answer.', 'dueOn');

    const studyId = id('inquiry');
    const reading = evaluateInquiry(existing, {
      targetStateIds: validTargets,
      sensitivityPct,
      specificityPct,
      cost: Math.round(cost * 100) / 100,
      delayCost,
    }, { conventions: voiConventionsFromSettings(store.state) });
    store.update(
      (draft) => {
        draft.voiStudies = Array.isArray(draft.voiStudies) ? draft.voiStudies : [];
        draft.voiStudies.push({
          id: studyId,
          frameId,
          label,
          method: String(clean(input.method) ?? '').slice(0, 600),
          targetStateIds: validTargets,
          premiseEquivalent: input.premiseEquivalent === true,
          equivalentPremiseId: input.premiseEquivalent === true ? existing.states.find((state) => state.id === validTargets[0]).premiseId : null,
          sensitivityPct,
          specificityPct,
          cost: Math.round(cost * 100) / 100,
          delayCost,
          currency: existing.currency || 'USD',
          dueOn: dueRaw || null,
          status: 'planned',
          result: null,
          history: [{
            at: stamp(),
            type: 'declared',
            summary: reading.ok
              ? `Declared at ${sensitivityPct}% sensitivity and ${specificityPct}% specificity for a fee of ${Math.round(cost * 100) / 100}${delayCost > 0 ? ` plus ${delayCost} in waiting` : ''}; EVSI ${reading.evsi}, net value ${reading.netValue}.`
              : `Declared at ${sensitivityPct}%/${specificityPct}%; it cannot be valued: ${reading.reason}`,
          }],
          createdAt: stamp(),
          updatedAt: stamp(),
        });
      },
      { type: INQUIRY_DECLARED_EVENT, entity: 'voistudy', entityId: studyId, summary: `Declared investigation “${label.slice(0, 70)}”` },
    );
    return { ok: true, id: studyId, reading, propagations: store.lastPropagations || [] };
  }

  /**
   * The signal arrived. Freeze what the test said, what the posterior became and
   * what the answer was worth — then let RULE-VOI-03 write the same evidence
   * into the premise ledger as one dated likelihood ratio.
   */
  function settleInformationRequest(studyId, { signal, note } = {}) {
    const study = (store.state.voiStudies || []).find((row) => row && row.id === studyId);
    if (!study) return fail('That investigation no longer exists.');
    if (!['planned', 'running'].includes(study.status)) {
      return fail('Only a planned or running investigation can settle.', 'studyId');
    }
    const frame = voiFrameById(study.frameId);
    if (!frame) return fail('The decision frame this investigation belonged to no longer exists.', 'studyId');
    if (!INQUIRY_SIGNALS.includes(signal)) return fail('Record whether the test fired or not.', 'signal');
    const conventions = voiConventionsFromSettings(store.state);
    const reading = evaluateInquiry(frame, study, { conventions });
    const lr = likelihoodRatioFor({ signal, sensitivityPct: study.sensitivityPct, specificityPct: study.specificityPct });
    const posterior = posteriorAfterSignal(frame, study, signal);
    store.update(
      (draft) => {
        const row = (draft.voiStudies || []).find((entry) => entry && entry.id === studyId);
        if (!row) return;
        row.status = 'settled';
        row.result = {
          signal,
          on: today(),
          lr: lr.lr,
          evsi: reading.ok ? reading.evsi : null,
          netValue: reading.ok ? reading.netValue : null,
          note: String(clean(note) ?? '').slice(0, VOI_MAX_NOTE),
          probabilities: posterior.ok ? posterior.posteriors.map((entry) => ({ stateId: entry.stateId, pct: entry.posteriorPct })) : [],
        };
        row.updatedAt = stamp();
        row.history = Array.isArray(row.history) ? row.history : [];
        row.history.push({
          at: stamp(),
          type: 'settled',
          summary: `Settled: the test ${signal === 'positive' ? 'fired' : 'did not fire'} at a likelihood ratio of ${lr.lr}${posterior.ok ? `; the declared distribution moved to ${posterior.posteriors.map((entry) => `${entry.posteriorPct}%`).join(' / ')}` : ''}.`,
        });
        row.history = row.history.slice(-40);
      },
      { type: INQUIRY_SETTLED_EVENT, entity: 'voistudy', entityId: studyId, summary: `Settled investigation “${study.label.slice(0, 70)}”` },
    );
    return {
      ok: true,
      lr: lr.lr,
      evsi: reading.ok ? reading.evsi : null,
      netValue: reading.ok ? reading.netValue : null,
      posterior: posterior.ok ? posterior.posteriors : [],
      propagations: store.lastPropagations || [],
    };
  }

  function abandonInformationRequest(studyId) {
    const study = (store.state.voiStudies || []).find((row) => row && row.id === studyId);
    if (!study) return fail('That investigation no longer exists.');
    if (!['planned', 'running'].includes(study.status)) return fail('Only a planned or running investigation can be abandoned.', 'studyId');
    store.update(
      (draft) => {
        const row = (draft.voiStudies || []).find((entry) => entry && entry.id === studyId);
        if (!row) return;
        row.status = 'abandoned';
        row.updatedAt = stamp();
        row.history = Array.isArray(row.history) ? row.history : [];
        row.history.push({ at: stamp(), type: 'abandoned', summary: 'Abandoned before an answer arrived. The cost already spent is not recovered; the record says so.' });
        row.history = row.history.slice(-40);
      },
      { type: INQUIRY_DECLARED_EVENT, entity: 'voistudy', entityId: studyId, summary: `Abandoned investigation “${study.label.slice(0, 70)}”` },
    );
    return { ok: true };
  }

  /** Explicit scan: the leader's "look again". Never decides, never settles. */
  function scanVoi() {
    const shape = () => JSON.stringify({
      links: (store.state.links || []).length,
      decisions: (store.state.decisions || []).length,
      delegations: (store.state.delegations || []).length,
      observations: (store.state.premises || []).reduce((acc, row) => acc + (row.observations || []).length, 0),
    });
    const before = shape();
    store.update(
      () => {},
      { type: VOI_SCANNED_EVENT, entity: 'voi', entityId: '', summary: 'Information-value scan requested by the leader' },
    );
    return { ok: true, changed: before !== shape(), propagations: store.lastPropagations || [] };
  }

  /* ------------------------------------------------- attention market (v57) */

  function attentionDeclarationsFrom(input) {
    const out = {};
    const raw = input && typeof input === 'object' ? input : {};
    for (const [key, value] of Object.entries(raw || {})) {
      const hours = Number(value);
      if (!Number.isFinite(hours) || hours <= 0) continue;
      out[String(key).slice(0, 160)] = Math.min(400, Math.round(hours * 100) / 100);
    }
    return out;
  }

  function attentionDelegatesFrom(input) {
    const out = {};
    const raw = input && typeof input === 'object' ? input : {};
    for (const [key, value] of Object.entries(raw || {})) {
      const personId = String(clean(value) ?? '');
      if (!personId) continue;
      out[String(key).slice(0, 160)] = personId;
    }
    return out;
  }

  /* --------------------------------------- Schema v58: operating agreements */

  function autopilotPolicyById(policyId) {
    return (store.state.autopilotPolicies || []).find((row) => row && row.id === policyId) || null;
  }

  function pushPolicyHistory(row, type, summary) {
    row.history = Array.isArray(row.history) ? row.history : [];
    row.history.push({ at: stamp(), type, summary: String(summary).slice(0, 300) });
    row.history = row.history.slice(-60);
  }

  function addAutopilotPolicy(input = {}) {
    const policies = store.state.autopilotPolicies || [];
    if (policies.length >= AUTOPILOT_LIMITS.policies) {
      return fail(`This workspace already holds ${AUTOPILOT_LIMITS.policies} operating agreements. Retire one before adding another.`);
    }
    const source = input.template ? { ...agreementTemplate(input.template), ...(input.overrides || {}) } : input;
    const result = normalizePolicyPayload(source, store.state, null);
    if (!result.ok) return fail(result.error);
    const policyId = id('ap');
    const policy = {
      ...result.value,
      id: policyId,
      createdAt: stamp(),
      updatedAt: stamp(),
      history: [{ at: stamp(), type: 'declared', summary: 'Declared as a draft. Rehearsal is required before activation.' }],
    };
    store.update(
      (draft) => {
        draft.autopilotPolicies.push(policy);
      },
      { type: 'autopilot.created', entity: 'autopilot', entityId: policyId, summary: `Operating agreement declared: ${policy.name.slice(0, 70)}` },
    );
    return { ok: true, id: policyId, version: 1 };
  }

  function updateAutopilotPolicy(policyId, input = {}) {
    const policy = autopilotPolicyById(policyId);
    if (!policy) return fail('That agreement no longer exists.');
    if (policy.status === 'retired') return fail('A retired agreement is history. Declare a new one instead.', 'policyId');
    const result = normalizePolicyPayload(input, store.state, policy);
    if (!result.ok) return fail(result.error);
    const wasActive = policy.status === 'active';
    store.update(
      (draft) => {
        const row = (draft.autopilotPolicies || []).find((entry) => entry && entry.id === policyId);
        if (!row) return;
        Object.assign(row, result.value, { id: policyId, updatedAt: stamp() });
        pushPolicyHistory(row, 'edited', wasActive
          ? `Edited and returned to draft at v${row.version}. The previous activation approval no longer applies.`
          : `Edited as a draft at v${row.version}.`);
      },
      { type: 'autopilot.updated', entity: 'autopilot', entityId: policyId, summary: `Operating agreement edited: ${policy.name.slice(0, 60)}` },
    );
    return { ok: true, id: policyId, version: result.value.version, status: 'draft' };
  }

  function rehearseAutopilotPolicy(policyId) {
    const policy = autopilotPolicyById(policyId);
    if (!policy) return fail('That agreement no longer exists.');
    if (policy.status === 'retired') return fail('A retired agreement cannot be rehearsed. Declare a new one instead.', 'policyId');
    return { ok: true, rehearsal: rehearsePolicy(store.state, policy, clock()) };
  }

  function activateAutopilotPolicy(policyId, { token } = {}) {
    const policy = autopilotPolicyById(policyId);
    if (!policy) return fail('That agreement no longer exists.');
    if (policy.status === 'retired') return fail('A retired agreement cannot be activated.', 'policyId');
    if (policy.status === 'active') return fail('This agreement is already active.', 'policyId');
    if (!token) return fail('Activation requires a fresh rehearsal token. Rehearse first.', 'token');
    const gate = activationGate(store.state, policy, token, clock());
    if (!gate.ok) return { ok: false, error: gate.error, rehearsal: gate.rehearsal };
    store.update(
      (draft) => {
        const row = (draft.autopilotPolicies || []).find((entry) => entry && entry.id === policyId);
        if (!row) return;
        row.status = 'active';
        row.rehearsalToken = token;
        row.activatedAt = stamp();
        row.activationRunCount = 0;
        row.pausedReason = '';
        row.updatedAt = stamp();
        pushPolicyHistory(row, 'activated', `Activated at v${row.version} after rehearsal: ${gate.rehearsal.matched} of ${gate.rehearsal.examined} current record(s) match.`);
      },
      { type: 'autopilot.activated', entity: 'autopilot', entityId: policyId, summary: `Operating agreement activated: ${policy.name.slice(0, 60)}` },
    );
    return { ok: true, id: policyId, rehearsal: gate.rehearsal, propagations: store.lastPropagations || [] };
  }

  function pauseAutopilotPolicy(policyId, { reason } = {}) {
    const policy = autopilotPolicyById(policyId);
    if (!policy) return fail('That agreement no longer exists.');
    if (policy.status !== 'active') return fail('Only an active agreement can be paused.', 'policyId');
    const note = String(reason || '').trim().slice(0, 300) || 'Paused by the leader. Rehearse and reactivate to resume.';
    store.update(
      (draft) => {
        const row = (draft.autopilotPolicies || []).find((entry) => entry && entry.id === policyId);
        if (!row) return;
        row.status = 'paused';
        row.pausedReason = note;
        row.updatedAt = stamp();
        pushPolicyHistory(row, 'paused', note);
      },
      { type: 'autopilot.paused', entity: 'autopilot', entityId: policyId, summary: `Operating agreement paused: ${policy.name.slice(0, 60)}` },
    );
    return { ok: true };
  }

  function retireAutopilotPolicy(policyId) {
    const policy = autopilotPolicyById(policyId);
    if (!policy) return fail('That agreement no longer exists.');
    if (policy.status === 'retired') return fail('This agreement is already retired.', 'policyId');
    store.update(
      (draft) => {
        const row = (draft.autopilotPolicies || []).find((entry) => entry && entry.id === policyId);
        if (!row) return;
        row.status = 'retired';
        row.pausedReason = '';
        row.updatedAt = stamp();
        pushPolicyHistory(row, 'retired', 'Retired. The execution history is retained for audit.');
      },
      { type: 'autopilot.retired', entity: 'autopilot', entityId: policyId, summary: `Operating agreement retired: ${policy.name.slice(0, 60)}` },
    );
    return { ok: true };
  }

  function deleteAutopilotPolicy(policyId) {
    const policy = autopilotPolicyById(policyId);
    if (!policy) return fail('That agreement no longer exists.');
    if (policy.status === 'active') return fail('Pause or retire an active agreement first; it cannot be deleted while it can still execute.', 'policyId');
    const runs = (store.state.autopilotRuns || []).filter((run) => run && run.policyId === policyId);
    if (runs.length || policy.runCount > 0) {
      return fail('This agreement has executed, so its history is retained for audit. Retire it instead of deleting it.', 'policyId');
    }
    store.update(
      (draft) => {
        draft.autopilotPolicies = (draft.autopilotPolicies || []).filter((entry) => entry && entry.id !== policyId);
      },
      { type: 'autopilot.deleted', entity: 'autopilot', entityId: policyId, summary: `Operating agreement deleted before ever executing: ${policy.name.slice(0, 60)}` },
    );
    return { ok: true };
  }

  function autopilotBriefText() {
    return autopilotBrief(store.state, clock());
  }

  function attentionPlanById(planId) {
    return (store.state.attentionPlans || []).find((row) => row && row.id === planId) || null;
  }

  function previewAttentionPlan(input = {}) {
    const budgetHours = input.budgetHours === undefined || input.budgetHours === ''
      ? undefined
      : Number(input.budgetHours);
    if (budgetHours !== undefined && (!Number.isFinite(budgetHours) || budgetHours < 0 || budgetHours > ATT_MAX_BUDGET_HOURS)) {
      return fail(`An attention budget must be between 0 and ${ATT_MAX_BUDGET_HOURS} hours.`, 'budgetHours');
    }
    const report = buildAttentionMarket(store.state, clock(), {
      budgetHours,
      declarations: attentionDeclarationsFrom(input.declarations),
      delegates: attentionDelegatesFrom(input.delegates),
    });
    return { ok: true, report };
  }

  function commitAttentionPlan(input = {}) {
    const label = String(clean(input.label) ?? '').slice(0, 200);
    if (label.length < 2) {
      return fail('Give the plan a name you will recognise in a month — “Week 44” is enough, but “plan” is not.', 'label');
    }
    const budgetHours = input.budgetHours === undefined || input.budgetHours === '' ? undefined : Number(input.budgetHours);
    if (budgetHours !== undefined && (!Number.isFinite(budgetHours) || budgetHours < 0 || budgetHours > ATT_MAX_BUDGET_HOURS)) {
      return fail(`An attention budget must be between 0 and ${ATT_MAX_BUDGET_HOURS} hours.`, 'budgetHours');
    }
    const declarations = attentionDeclarationsFrom(input.declarations);
    const delegates = attentionDelegatesFrom(input.delegates);
    const conventions = attConventionsFromSettings(store.state.settings);
    if (conventions.budgetHours <= 0 && (budgetHours === undefined || budgetHours <= 0)) {
      return fail('A budget of zero hours cannot buy anything. Raise the budget in settings or on the plan.', 'budgetHours');
    }
    const frozen = freezePlan(store.state, clock(), {
      budgetHours,
      declarations,
      delegates,
      currency: input.currency ? String(input.currency).toUpperCase().slice(0, 6) : undefined,
    });
    if (!frozen.ok) {
      return fail('Nothing in the workspace can be priced yet, so there is no plan to commit. A plan over an empty market would be a forecast of nothing.');
    }
    if (!frozen.result.items.length) {
      return fail('The solver could not buy a single obligation inside this budget. Committing an empty plan would record a decision to do nothing all week — if that is the decision, make it explicitly in the decision register instead.', 'budgetHours');
    }
    const planId = id('attplan');
    store.update(
      (draft) => {
        draft.attentionPlans = Array.isArray(draft.attentionPlans) ? draft.attentionPlans : [];
        draft.attentionPlans.unshift({
          id: planId,
          label,
          status: 'committed',
          currency: frozen.result.currency,
          budgetHours: frozen.result.budgetHours,
          committedOn: frozen.result.committedOn,
          provenance: { kind: 'declared' },
          result: frozen.result,
          review: null,
          markers: [],
          notes: [],
          history: [{
            at: stamp(),
            type: 'committed',
            summary: `Committed ${frozen.result.items.length} obligation(s) for ${frozen.result.usedHours} h of a ${frozen.result.budgetHours} h ${frozen.result.currency} budget; `
              + `${frozen.result.forgone.length} consciously left to carry. Expected protected value ${Math.round(frozen.result.value)} on an LP bound of ${Math.round(frozen.result.lpBound)} (gap ${frozen.result.gapPct}%).`,
          }],
          createdAt: stamp(),
          updatedAt: stamp(),
        });
      },
      { type: ATT_COMMITTED_EVENT, entity: 'attentionPlan', entityId: planId, summary: `Committed attention plan “${label.slice(0, 80)}”` },
    );
    return { ok: true, id: planId, result: frozen.result, propagations: store.lastPropagations || [] };
  }

  function reviewAttentionPlan(planId, input = {}) {
    const plan = attentionPlanById(planId);
    if (!plan) return fail('That plan no longer exists.');
    if (plan.status === 'abandoned') return fail('An abandoned plan is history. Commit a new one.', 'planId');
    if (plan.review) return fail('This plan has already been reviewed. A second review would overwrite the number it was graded against — commit a new plan instead.', 'planId');
    const scoring = scoreAttentionPlan(plan, store.state, clock());
    if (!scoring.ok) return fail(scoring.reason || 'This plan cannot be scored.');
    const note = String(clean(input.note) ?? '').slice(0, 1200);
    store.update(
      (draft) => {
        const row = (draft.attentionPlans || []).find((entry) => entry && entry.id === planId);
        if (!row) return;
        row.review = {
          reviewedOn: scoring.reviewedOn,
          currency: scoring.currency,
          predictedValue: scoring.predictedValue,
          measuredAvoided: scoring.measuredAvoided,
          attainmentPct: scoring.attainmentPct,
          brier: scoring.brier,
          brierN: scoring.brierN,
          complete: scoring.complete,
          counts: scoring.counts,
          readings: scoring.readings,
          notes: [...scoring.notes, ...(note ? [`Leader note: ${note}`] : [])],
        };
        row.status = 'reviewed';
        row.updatedAt = stamp();
        row.history = Array.isArray(row.history) ? row.history : [];
        row.history.push({
          at: stamp(),
          type: 'reviewed',
          summary: `Measured ${Math.round(scoring.measuredAvoided)} against a frozen prediction of ${Math.round(scoring.predictedValue)}`
            + `${scoring.attainmentPct === null ? '' : ` (${scoring.attainmentPct}% attainment)`}; `
            + `${scoring.counts.realised} realised, ${scoring.counts.contradicted} contradicted, ${scoring.counts.open} still open, ${scoring.counts.unmeasured} unmeasurable.`,
        });
        row.history = row.history.slice(-40);
      },
      { type: ATT_REVIEWED_EVENT, entity: 'attentionPlan', entityId: planId, summary: `Reviewed attention plan “${String(plan.label).slice(0, 70)}”` },
    );
    return { ok: true, review: scoring, propagations: store.lastPropagations || [] };
  }

  function abandonAttentionPlan(planId) {
    const plan = attentionPlanById(planId);
    if (!plan) return fail('That plan no longer exists.');
    if (plan.review) return fail('A reviewed plan is history and stays in the record.', 'planId');
    store.update(
      (draft) => {
        const row = (draft.attentionPlans || []).find((entry) => entry && entry.id === planId);
        if (!row) return;
        row.status = 'abandoned';
        row.updatedAt = stamp();
        row.history = Array.isArray(row.history) ? row.history : [];
        row.history.push({ at: stamp(), type: 'abandoned', summary: 'Abandoned before review. The plan is kept so the prediction it made is still visible.' });
        row.history = row.history.slice(-40);
      },
      { type: ATT_COMMITTED_EVENT, entity: 'attentionPlan', entityId: planId, summary: `Abandoned attention plan “${String(plan.label).slice(0, 70)}”` },
    );
    return { ok: true };
  }

  /* ------------------------------------------------- Schema v59: signal path */

  const signalClassById = (classId) => (store.state.signalClasses || []).find((row) => row && row.id === classId) || null;

  function signalPathPreview(input = {}) {
    const report = buildSignalReport(store.state, clock(), {
      priceLevers: true,
      hourValue: input.hourValue === undefined || input.hourValue === '' ? null : Number(input.hourValue),
    });
    return { ok: true, report };
  }

  function addSignalClass(input = {}) {
    const label = String(clean(input.label) ?? '').slice(0, 200);
    if (label.length < 3) {
      return fail('Name the kind of event you want to hear about — “a delivery slip on the platform team” is enough, but “risk” is not.', 'label');
    }
    const pathPersonId = clean(input.pathPersonId);
    if (!pathPersonId || !store.state.people.some((p) => p.id === pathPersonId && p.status !== 'archived')) {
      return fail('Choose the person the event would start with. Without an origin there is no path to measure.', 'pathPersonId');
    }
    const index = buildReportingIndex(store.state.people);
    if (index.depthOf(pathPersonId) === null) {
      return fail('That person sits in a reporting cycle, so no depth can be computed. Fix the reporting lines first.', 'pathPersonId');
    }
    const probabilityPct = input.probabilityPct === undefined || input.probabilityPct === '' ? 40 : Number(input.probabilityPct);
    if (!Number.isFinite(probabilityPct) || probabilityPct < 0 || probabilityPct > 100) {
      return fail('A probability has to be between 0 and 100. If you do not know, 40 is a stated prior — not a fact.', 'probabilityPct');
    }
    const exposureRaw = clean(input.exposure);
    const exposure = exposureRaw === null || exposureRaw === '' ? null : Number(exposureRaw);
    if (exposure !== null && (!Number.isFinite(exposure) || exposure < 0)) {
      return fail('An exposure must be zero or more. Leave it blank if you have no number — a blank is honest, a zero is not.', 'exposure');
    }
    const classId = id('sigclass');
    const now = clock();
    const draftRecord = {
      id: classId,
      label,
      status: 'declared',
      currency: (String(clean(input.currency) || 'USD').toUpperCase().slice(0, 6)) || 'USD',
      exposure,
      probabilityPct,
      horizonDays: Number.isFinite(Number(input.horizonDays)) && Number(input.horizonDays) > 0 ? Math.round(Number(input.horizonDays)) : 90,
      pathPersonId,
      ownerId: clean(input.ownerId) && store.state.people.some((p) => p.id === clean(input.ownerId)) ? clean(input.ownerId) : null,
      overrides: {},
      direct: input.direct && input.direct.enabled
        ? {
          enabled: true,
          label: String(clean(input.direct.label) || 'Direct channel').slice(0, 160),
          detectPct: Number(input.direct.detectPct) || null,
          falsePct: Number(input.direct.falsePct) || null,
          lagDays: Number(input.direct.lagDays) || null,
        }
        : { enabled: false },
      note: String(clean(input.note) ?? '').slice(0, 600),
      reviewOn: clean(input.reviewOn) || dayKey(addDays(now, store.state.settings.sigReviewHorizonDays || 90)),
      committedOn: null,
      frozen: null,
      markers: [],
      notes: [],
      history: [{ at: stamp(), type: 'declared', summary: 'Declared as a draft. Nothing is priced against it until it is committed.' }],
      createdAt: stamp(),
      updatedAt: stamp(),
    };
    store.update(
      (draft) => {
        draft.signalClasses = Array.isArray(draft.signalClasses) ? draft.signalClasses : [];
        draft.signalClasses.unshift(draftRecord);
      },
      { type: 'signal.created', entity: 'signalClass', entityId: classId, summary: `Declared signal class “${label.slice(0, 70)}”` },
    );
    return { ok: true, id: classId };
  }

  function updateSignalClass(classId, input = {}) {
    const record = signalClassById(classId);
    if (!record) return fail('That signal class no longer exists.');
    if (record.status === 'retired') return fail('A retired class is history. Declare a new one.', 'classId');
    const patch = {};
    if (input.label !== undefined) {
      const label = String(clean(input.label) ?? '').slice(0, 200);
      if (label.length < 3) return fail('A class needs a name you would recognise in a month.', 'label');
      patch.label = label;
    }
    if (input.currency !== undefined) patch.currency = (String(clean(input.currency) || 'USD').toUpperCase().slice(0, 6)) || 'USD';
    if (input.exposure !== undefined) {
      const raw = clean(input.exposure);
      const value = raw === null || raw === '' ? null : Number(raw);
      if (value !== null && (!Number.isFinite(value) || value < 0)) return fail('An exposure must be zero or more, or blank.', 'exposure');
      if (record.status === 'committed' && record.frozen && value !== record.frozen.exposure) {
        return fail('This class is committed and its exposure is frozen into the prediction being graded. Retire it and declare a new class rather than rewriting the number it is judged against.', 'exposure');
      }
      patch.exposure = value;
    }
    if (input.probabilityPct !== undefined) {
      const p = Number(input.probabilityPct);
      if (!Number.isFinite(p) || p < 0 || p > 100) return fail('A probability has to be between 0 and 100.', 'probabilityPct');
      patch.probabilityPct = p;
    }
    if (input.horizonDays !== undefined) {
      const h = Number(input.horizonDays);
      if (!Number.isFinite(h) || h < 1 || h > 730) return fail('A horizon has to be between 1 and 730 days.', 'horizonDays');
      patch.horizonDays = Math.round(h);
    }
    if (input.pathPersonId !== undefined) {
      const personId = clean(input.pathPersonId);
      if (!personId || !store.state.people.some((p) => p.id === personId && p.status !== 'archived')) {
        return fail('Choose a person on the active roster.', 'pathPersonId');
      }
      patch.pathPersonId = personId;
    }
    if (input.ownerId !== undefined) {
      const ownerId = clean(input.ownerId);
      patch.ownerId = ownerId && store.state.people.some((p) => p.id === ownerId) ? ownerId : null;
    }
    if (input.reviewOn !== undefined) patch.reviewOn = clean(input.reviewOn) || null;
    if (input.note !== undefined) patch.note = String(clean(input.note) ?? '').slice(0, 600);
    if (input.direct !== undefined) {
      patch.direct = input.direct && input.direct.enabled
        ? {
          enabled: true,
          label: String(clean(input.direct.label) || 'Direct channel').slice(0, 160),
          detectPct: Number(input.direct.detectPct) || null,
          falsePct: Number(input.direct.falsePct) || null,
          lagDays: Number(input.direct.lagDays) || null,
        }
        : { enabled: false };
    }
    if (input.overrides !== undefined && input.overrides && typeof input.overrides === 'object') {
      const people = new Set(store.state.people.filter((p) => p.status !== 'archived').map((p) => p.id));
      const overrides = {};
      for (const [personId, value] of Object.entries(input.overrides)) {
        if (!people.has(personId)) continue;
        const pct = Number(value);
        if (!Number.isFinite(pct) || pct <= 0) continue;
        overrides[personId] = Math.min(99, Math.max(5, Math.round(pct)));
      }
      patch.overrides = overrides;
    }
    if (!Object.keys(patch).length) return fail('Nothing changed.');
    store.update(
      (draft) => {
        const row = (draft.signalClasses || []).find((entry) => entry && entry.id === classId);
        if (!row) return;
        Object.assign(row, patch);
        row.updatedAt = stamp();
        row.history = Array.isArray(row.history) ? row.history : [];
        row.history.push({ at: stamp(), type: 'updated', summary: `Edited: ${Object.keys(patch).join(', ')}.` });
        row.history = row.history.slice(-40);
        // A material channel change invalidates the frozen chain: the next
        // commit re-attaches it. The digits themselves are never edited here.
        if (patch.pathPersonId || patch.overrides || patch.direct) {
          row.markers = (row.markers || []).filter((m) => m !== 'chainAttached');
        }
      },
      { type: 'signal.updated', entity: 'signalClass', entityId: classId, summary: `Edited signal class “${String(record.label).slice(0, 70)}”` },
    );
    return { ok: true };
  }

  function commitSignalClass(classId) {
    const record = signalClassById(classId);
    if (!record) return fail('That signal class no longer exists.');
    if (record.status === 'committed') return fail('This class is already committed. Its prediction is frozen; retire it and declare a new one to change it.', 'classId');
    if (record.status === 'retired') return fail('A retired class cannot be re-committed.', 'classId');
    const conventions = signalConventions(store.state.settings);
    const index = buildReportingIndex(store.state.people);
    const reading = readClass(record, store.state, index, conventions, clock());
    if (reading.blockedReason) return fail(reading.blockedReason, 'pathPersonId');
    if (!reading.hops.length) return fail('No path could be built, so there is nothing to commit.', 'pathPersonId');
    const frozen = freezeSignalPrediction({ ...record, committedOn: today() }, reading.reading, reading.chain);
    store.update(
      (draft) => {
        const row = (draft.signalClasses || []).find((entry) => entry && entry.id === classId);
        if (!row) return;
        row.status = 'committed';
        row.committedOn = today();
        row.frozen = frozen;
        row.updatedAt = stamp();
        row.history = Array.isArray(row.history) ? row.history : [];
        row.history.push({
          at: stamp(),
          type: 'committed',
          summary: `Committed on ${today()}: reach ${Math.round(reading.reading.reach * 100)}% over ${reading.reading.hopCount} hop(s), `
            + `${reading.reading.carriedBits.toFixed(2)} of ${reading.reading.sourceBits.toFixed(2)} bits carried, `
            + `lag ${reading.reading.latencyDays} d. This is the number every probe will be graded against.`,
        });
        row.history = row.history.slice(-40);
      },
      { type: SIGNAL_DECLARED_EVENT, entity: 'signalClass', entityId: classId, summary: `Committed signal class “${String(record.label).slice(0, 70)}”` },
    );
    return { ok: true, reading: reading.reading, propagations: store.lastPropagations || [] };
  }

  function retireSignalClass(classId) {
    const record = signalClassById(classId);
    if (!record) return fail('That signal class no longer exists.');
    if (record.status === 'retired') return fail('That class is already retired.', 'classId');
    store.update(
      (draft) => {
        const row = (draft.signalClasses || []).find((entry) => entry && entry.id === classId);
        if (!row) return;
        row.status = 'retired';
        row.updatedAt = stamp();
        row.history = Array.isArray(row.history) ? row.history : [];
        row.history.push({ at: stamp(), type: 'retired', summary: 'Retired. The frozen prediction and every probe stay in the record.' });
        row.history = row.history.slice(-40);
      },
      { type: 'signal.retired', entity: 'signalClass', entityId: classId, summary: `Retired signal class “${String(record.label).slice(0, 70)}”` },
    );
    return { ok: true };
  }

  function deleteSignalClass(classId) {
    const record = signalClassById(classId);
    if (!record) return fail('That signal class no longer exists.');
    if (record.status === 'committed' || record.frozen) {
      return fail('This class carries a frozen prediction that probes are graded against. Retire it instead of deleting it.', 'classId');
    }
    const probes = (store.state.signalProbes || []).filter((p) => p && p.classId === classId);
    if (probes.length) return fail('This class has probes recorded against it, so its history is kept for audit. Retire it instead.', 'classId');
    store.update(
      (draft) => {
        draft.signalClasses = (draft.signalClasses || []).filter((entry) => entry && entry.id !== classId);
        draft.links = (draft.links || []).filter((link) => !(link && ((link.sourceType === 'signal' && link.sourceId === classId) || (link.targetType === 'signal' && link.targetId === classId))));
      },
      { type: 'signal.deleted', entity: 'signalClass', entityId: classId, summary: `Deleted draft signal class “${String(record.label).slice(0, 70)}”` },
    );
    return { ok: true };
  }

  function addSignalProbe(classId, input = {}) {
    const klass = signalClassById(classId);
    if (!klass) return fail('That signal class no longer exists.');
    if (klass.status === 'retired') return fail('A retired class takes no new probes.', 'classId');
    const label = String(clean(input.label) ?? '').slice(0, 240);
    if (label.length < 4) {
      return fail('Describe the fact you already know: “the vendor missed the Tuesday cutover”. A probe is a specific thing, not a mood.', 'label');
    }
    const truth = SIGNAL_TRUTHS.includes(input.truth) ? input.truth : 'event';
    const existsSinceOn = clean(input.existsSinceOn) || today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(existsSinceOn)) return fail('Record the day the fact became true, as YYYY-MM-DD.', 'existsSinceOn');
    if (existsSinceOn > today()) return fail('The fact cannot have existed in the future. Use today or earlier.', 'existsSinceOn');
    const conventions = signalConventions(store.state.settings);
    const index = buildReportingIndex(store.state.people);
    const reading = readClass(klass, store.state, index, conventions, clock());
    const probeId = id('sigprobe');
    store.update(
      (draft) => {
        draft.signalProbes = Array.isArray(draft.signalProbes) ? draft.signalProbes : [];
        draft.signalProbes.unshift({
          id: probeId,
          classId,
          label,
          truth,
          existsSinceOn,
          learnedOn: null,
          learnedVia: null,
          delivered: null,
          latencyDays: null,
          status: 'open',
          // The prediction is frozen at open time, exactly as a forecast is.
          prediction: {
            reach: reading.reading.reach,
            latencyDays: reading.reading.latencyDays,
            frozenOn: today(),
          },
          settledOn: null,
          note: String(clean(input.note) ?? '').slice(0, 600),
          markers: [],
          history: [{ at: stamp(), type: 'opened', summary: `Opened with the declared reach frozen at ${Math.round(reading.reading.reach * 100)}%.` }],
          createdAt: stamp(),
          updatedAt: stamp(),
        });
      },
      { type: 'signal.probe.opened', entity: 'signalClass', entityId: classId, summary: `Opened a probe on “${String(klass.label).slice(0, 60)}”` },
    );
    return { ok: true, id: probeId };
  }

  function settleSignalProbe(probeId, input = {}) {
    const probe = (store.state.signalProbes || []).find((row) => row && row.id === probeId) || null;
    if (!probe) return fail('That probe no longer exists.');
    if (probe.status !== 'open') return fail('This probe is already settled. A settled probe is evidence and is not overwritten.', 'probeId');
    const learnedVia = SIGNAL_LEARNED_VIA.includes(input.learnedVia) ? input.learnedVia : null;
    if (!learnedVia) return fail('Say how you learned about it — through the chain, in a skip-level, from a monitor, by accident, or not at all.', 'learnedVia');
    const learnedOn = learnedVia === 'never' ? null : (clean(input.learnedOn) || today());
    if (learnedOn && !/^\d{4}-\d{2}-\d{2}$/.test(learnedOn)) return fail('The date you learned it must be YYYY-MM-DD.', 'learnedOn');
    if (learnedOn && probe.existsSinceOn && learnedOn < probe.existsSinceOn) {
      return fail('You cannot have learned it before it became true. Check the two dates.', 'learnedOn');
    }
    const latencyDays = learnedOn && probe.existsSinceOn
      ? Math.max(0, Math.round((new Date(`${learnedOn}T00:00:00Z`) - new Date(`${probe.existsSinceOn}T00:00:00Z`)) / 86400000))
      : null;
    // "Delivered" means the escalation chain carried it. A skip-level, a monitor
    // or an accident are all *alternative* channels — the finding is that the
    // chain did not deliver, which is exactly what the probes measure.
    const delivered = learnedVia === 'escalation';
    store.update(
      (draft) => {
        const row = (draft.signalProbes || []).find((entry) => entry && entry.id === probeId);
        if (!row) return;
        row.status = 'settled';
        row.learnedVia = learnedVia;
        row.learnedOn = learnedOn;
        row.delivered = delivered;
        row.latencyDays = latencyDays;
        row.settledOn = today();
        row.note = String(clean(input.note) ?? row.note ?? '').slice(0, 600);
        row.updatedAt = stamp();
        row.history = Array.isArray(row.history) ? row.history : [];
        row.history.push({
          at: stamp(),
          type: 'settled',
          summary: delivered
            ? `The chain delivered it ${latencyDays === null ? '' : `${latencyDays} day(s) later`}. Declared reach was ${Math.round((row.prediction?.reach || 0) * 100)}%.`.trim()
            : `The chain did not deliver it; you learned it via ${learnedVia}. Declared reach was ${Math.round((row.prediction?.reach || 0) * 100)}%.`,
        });
        row.history = row.history.slice(-40);
      },
      { type: SIGNAL_PROBED_EVENT, entity: 'signalClass', entityId: probe.classId, summary: `Settled a probe on class ${String(probe.classId).slice(0, 40)}` },
    );
    return { ok: true, delivered, latencyDays, propagations: store.lastPropagations || [] };
  }

  function abandonSignalProbe(probeId) {
    const probe = (store.state.signalProbes || []).find((row) => row && row.id === probeId) || null;
    if (!probe) return fail('That probe no longer exists.');
    if (probe.status !== 'open') return fail('Only an open probe can be abandoned.', 'probeId');
    store.update(
      (draft) => {
        const row = (draft.signalProbes || []).find((entry) => entry && entry.id === probeId);
        if (!row) return;
        row.status = 'abandoned';
        row.updatedAt = stamp();
        row.history = Array.isArray(row.history) ? row.history : [];
        row.history.push({ at: stamp(), type: 'abandoned', summary: 'Abandoned before settling. It is excluded from every rate on the page.' });
        row.history = row.history.slice(-40);
      },
      { type: 'signal.probe.abandoned', entity: 'signalClass', entityId: probe.classId, summary: 'Abandoned a probe' },
    );
    return { ok: true };
  }

  function adoptSignalLever(classId, leverId, input = {}) {
    const klass = signalClassById(classId);
    if (!klass) return fail('That signal class no longer exists.');
    if (klass.status !== 'committed') return fail('Commit the class first — a lever bought against a draft is an intervention with no baseline.', 'classId');
    const conventions = signalConventions(store.state.settings);
    const index = buildReportingIndex(store.state.people);
    const reading = readClass(klass, store.state, index, conventions, clock());
    const priced = priceLevers(
      {
        hops: reading.hops,
        direct: reading.direct,
        theta: reading.theta,
        exposure: reading.exposure,
        horizonDays: reading.horizonDays,
        hopCount: reading.reading.hopCount,
      },
      conventions,
      { hourValue: input.hourValue === undefined || input.hourValue === '' ? null : Number(input.hourValue) },
    );
    const row = priced.rows.find((entry) => entry.leverId === leverId);
    if (!row) return fail('That lever is not in the catalogue.', 'leverId');
    const ownerId = clean(input.ownerId) || klass.ownerId || null;
    if (!ownerId || !store.state.people.some((p) => p.id === ownerId)) {
      return fail('Name the person who will spend the hours. An intervention with no owner is the reason it has no owner.', 'ownerId');
    }
    const leverRecordId = id('siglever');
    store.update(
      (draft) => {
        draft.signalLevers = Array.isArray(draft.signalLevers) ? draft.signalLevers : [];
        draft.signalLevers.unshift({
          id: leverRecordId,
          classId,
          leverId,
          label: row.label,
          hours: row.hours,
          status: 'active',
          reachBefore: row.reachBefore,
          reachAfter: row.reachAfter,
          latencyBefore: row.latencyBefore,
          latencyAfter: row.latencyAfter,
          value: row.value,
          cost: row.cost,
          ownerId,
          adoptedOn: today(),
          reviewOn: dayKey(addDays(clock(), conventions.reviewHorizonDays)),
          outcome: null,
          markers: [],
          history: [{
            at: stamp(),
            type: 'adopted',
            summary: `Adopted at ${row.hours} h: reach ${Math.round(row.reachBefore * 100)}% → ${Math.round(row.reachAfter * 100)}%, `
              + `lag ${row.latencyBefore} d → ${row.latencyAfter} d. Priced at ${row.value ?? '—'} of expected loss against a ${priced.price} hour value (${priced.priceSource}).`,
          }],
          createdAt: stamp(),
          updatedAt: stamp(),
        });
      },
      { type: SIGNAL_LEVER_EVENT, entity: 'signalLever', entityId: leverRecordId, summary: `Adopted “${String(row.label).slice(0, 60)}”` },
    );
    return { ok: true, id: leverRecordId, lever: row, propagations: store.lastPropagations || [] };
  }

  function retireSignalLever(leverId) {
    const lever = (store.state.signalLevers || []).find((row) => row && row.id === leverId) || null;
    if (!lever) return fail('That lever no longer exists.');
    if (lever.status === 'retired') return fail('That lever is already retired.', 'leverId');
    store.update(
      (draft) => {
        const row = (draft.signalLevers || []).find((entry) => entry && entry.id === leverId);
        if (!row) return;
        row.status = 'retired';
        row.updatedAt = stamp();
        row.history = Array.isArray(row.history) ? row.history : [];
        row.history.push({ at: stamp(), type: 'retired', summary: 'Retired. The expectation it froze stays in the record.' });
        row.history = row.history.slice(-40);
      },
      { type: 'signal.lever.retired', entity: 'signalClass', entityId: lever.classId, summary: 'Retired a lever' },
    );
    return { ok: true };
  }

  function signalBriefText() {
    return signalBrief(store.state, clock());
  }

  Object.assign(api, {
    signalPathPreview,
    addSignalClass,
    updateSignalClass,
    commitSignalClass,
    retireSignalClass,
    deleteSignalClass,
    addSignalProbe,
    settleSignalProbe,
    abandonSignalProbe,
    adoptSignalLever,
    retireSignalLever,
    signalBriefText,
    previewAttentionPlan,
    commitAttentionPlan,
    reviewAttentionPlan,
    abandonAttentionPlan,
    addVoiDecision,
    updateVoiDecision,
    decideVoiDecision,
    settleVoiDecision,
    abandonVoiDecision,
    addInformationRequest,
    settleInformationRequest,
    abandonInformationRequest,
    scanVoi,
    addAutopilotPolicy,
    updateAutopilotPolicy,
    rehearseAutopilotPolicy,
    activateAutopilotPolicy,
    pauseAutopilotPolicy,
    retireAutopilotPolicy,
    deleteAutopilotPolicy,
    autopilotBriefText,
  });

  return Object.fromEntries(Object.entries(api).map(([name, action]) => [name, (...args) =>
    store.writeBlockReason ? fail(store.writeBlockReason) : action(...args),
  ]));
}
