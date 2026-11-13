/**
 * app/core/schema.js — the data contract.
 *
 * The shape below is the single source of truth for what the application
 * stores. `normalizeState` is the safety net: it is run on every load and on
 * every import, so a partially written blob, an older blob, or a hand-edited
 * file degrades into a valid state plus a list of human-readable warnings
 * instead of a blank screen or a crash.
 *
 * Pure module: no storage access, no clock.
 */

import { normalizeConflicts } from './conflict-schema.js';
// ADR-0083: the Concordance Terminal. Rounds resolve BEFORE links so
// `rolls-up-to`, `re-contracts` and `re-tests` edges validate on reload.
import { normalizeConcordanceRounds, normalizeConcordanceMarkers, normalizeConcordanceSettings } from './domain/concordanceSchema.js';
import { normalizeDisclosureGrants, normalizeDisclosureMarkers, normalizeDisclosureSettings } from './domain/disclosureSchema.js';
// ADR-0085: the Board Room. Memos resolve BEFORE links so `summarizes-span`
// and `escalates-from` provenance edges validate on reload.
import { normalizeBoardMemos, normalizeBoardMarkers, normalizeBoardSettings } from './domain/boardSchema.js';
// ADR-0087: the Attested Commit. Credential enrollments resolve BEFORE links
// and events so nothing validates against an enrollment that was never real.
import { normalizeSeatIdentities, normalizeIdentityMarkers, normalizeIdentitySettings } from './domain/identitySchema.js';
// ADR-0121 (Schema v114): the Duty Coverage Register's fail-closed normalizers.
import { normalizeDutyCovers, normalizeDutyCoverageMarkers, normalizeDutyCoverageSettings } from './domain/dutyCoverageSchema.js';
import { normalizeReportingLines, normalizeMatrixMarkers, normalizeMatrixSettings } from './domain/matrixSchema.js';
import { normalizeOneOnOneHolder, normalizeOneOnOneLineMarkers, normalizeOneOnOneLineSettings } from './domain/oneOnOneLineSchema.js';
import { normalizeHiringLineMarkers, normalizeHiringLinePlans, normalizeHiringLineSettings } from './domain/hiringLineSchema.js';
import { normalizeTransferPriceActs, normalizeTransferPriceMarkers, normalizeTransferPriceSettings } from './domain/transferPriceSchema.js';
import { normalizeDelegationLineActs, normalizeDelegationLineMarkers, normalizeDelegationLineSettings } from './domain/delegationLineSchema.js';
import { normalizeWorkTurnActs, normalizeWorkTurnMarkers, normalizeWorkTurnSettings } from './domain/workTurnSchema.js';
// ADR-0182 (Schema v145): the Automation Pause Permit Register. Fail-closed
// normalizers for dated permits and RULE-PMP-01's marker ledger.
import { normalizePausePermitMarkers, normalizePausePermits, normalizePausePermitSettings } from './domain/pausePermitSchema.js';
// ADR-0180 (Session 246): the settings load receipt — a stored convention the
// loader does not carry is NAMED in a load warning, never dropped in silence —
// and the Leader Calibration conventions in their stored shape.
import { settingsLoadReceipt } from './domain/conventionRegisterSchema.js';
import { normalizeLeaderCalibrationSettings } from './domain/leaderCalibration.js';
// ADR-0143 (Schema v120): the Cross-Line Priority Arbitration's fail-closed
// normalizers. Every stored row is a human act; every score, state and count is
// re-derived on read, so a printed order cannot drift from the integers it ranks.
import {
  normalizePriorityArbitrations,
  normalizePriorityMarkers,
  normalizePrioritySettings,
} from './domain/priorityArbitrationSchema.js';
// ADR-0147 (Schema v122): Matrix Multi-Line Review Stewardship. It adds NO
// collection: a request and an answer live on the review row they are about, so
// they freeze with it at completion. Only the normalizer and two conventions are
// new, and a malformed row is dropped with a printed warning rather than repaired.
import {
  normalizeReviewStewardship,
  normalizeReviewStewardshipSettings,
} from './domain/reviewStewardshipSchema.js';
// ADR-0148 (Schema v123): Matrix Line Consent. A declared share is an ask until
// the manager it was given to accepts or declines it AND the person whose hours
// it takes acknowledges it. The ledger stores ONLY those dated human acts; every
// state, lapse, verdict and total is derived on read.
import {
  normalizeLineConsents,
  normalizeLineConsentMarkers,
  normalizeLineConsentSettings,
} from './domain/lineConsentSchema.js';
// ADR-0144 (Schema v121): the Cross-Line Contradiction Audit's fail-closed
// normalizers. A charter with an unreadable lever is dropped rather than mapped
// to a neighbouring one; a ruling that does not say who must act is dropped
// rather than reconstructed. Nothing derived is stored.
import {
  normalizeAssessmentReconciliationSettings,
} from './domain/assessmentReconciliationSchema.js';
import {
  normalizeStructureHistory,
  normalizeStructureHistoryMarkers,
  normalizeStructureHistorySettings,
} from './domain/structureHistorySchema.js';
// ADR-0184 (Schema v146): Workforce Stock-Flow (Markov manpower) Plan — the
// fail-closed normalizers and the settings resolver.
import {
  normalizeWorkforceFlowActs,
  normalizeWorkforceFlowTargets,
  normalizeWorkforceFlowMarkers,
  normalizeWorkforceFlowSettings,
} from './domain/workforceFlowSchema.js';
import {
  normalizeChangeSaturationActs,
  normalizeChangeSaturationCeilings,
  normalizeChangeSaturationMarkers,
  normalizeChangeSaturationSettings,
} from './domain/changeSaturationSchema.js';
import { normalizeDependencyCycleSettings } from './domain/dependencyCycleSchema.js';
// ADR-0188 (Schema v149): cross-line after-action corroboration & lesson-adoption
// parity. The AAR ledger itself (`retros`) is READ, never rewritten; requests and
// their frozen snapshots normalize before answers resolve, and adoptions are
// independent line acts.
import {
  normalizeAarCorroborationRequests,
  normalizeAarCorroborationResponses,
  normalizeAarAdoptions,
  normalizeAarCorroborationSettings,
} from './domain/aarCorroborationSchema.js';
// ADR-0189 (Schema v149 unchanged): the interface-alignment conventions — the
// dependency window, the ask window and the automation pause. No channel
// default: a channel is a human agreement, so an absent one stays absent.
import { normalizeInterfaceAlignmentSettings } from './domain/interfaceAlignmentSchema.js';
import {
  normalizeStandardWorkChecks,
  normalizeStandardWorkRoutines,
  normalizeStandardWorkSettings,
  normalizeStandardWorkTierActs,
} from './domain/standardWorkSchema.js';
// ADR-0185 (Schema v147): dated Matrix change-impact requests and first-person
// line responses. Request snapshots normalize before their responses resolve.
import {
  normalizeChangeImpactRequests,
  normalizeChangeImpactResponses,
} from './domain/changeImpactSchema.js';
import {
  normalizeOnboardingLineBriefs,
  normalizeOnboardingLineBriefMarkers,
  normalizeOnboardingMatrixSettings,
} from './domain/onboardingMatrixSchema.js';
import {
  normalizeLineExitMarkers,
  normalizeLineExitRemedies,
  normalizeLineExitSettings,
} from './domain/lineExitSchema.js';
import {
  normalizeLineReaffirmationMarkers,
  normalizeLineReaffirmations,
  normalizeLineReaffirmationSettings,
} from './domain/lineReaffirmationSchema.js';
import {
  normalizeAuthorityReaffirmationMarkers,
  normalizeAuthorityReaffirmations,
  normalizeAuthorityReaffirmationSettings,
} from './domain/authorityReaffirmationSchema.js';
import {
  normalizeMatrixInterfaceAgreements,
  normalizeMatrixInterfaceMarkers,
  normalizeMatrixInterfaceSettings,
} from './domain/matrixInterfaceSchema.js';
import { normalizeMatrixRemedies } from './domain/matrixRemedySchema.js';
import {
  normalizeDoaMarkers,
  normalizeDoaSchedule,
  normalizeDoaSettings,
} from './domain/doaScheduleSchema.js';
import {
  normalizeLineMandates,
  normalizeContradictionReviews,
  normalizeContradictionMarkers,
  normalizeContradictionSettings,
} from './domain/contradictionSchema.js';
import { normalizeAbsencePlans } from './domain/dutyAbsenceSchema.js';
import { normalizeStandbyAnswers, normalizeDutyStandbySettings } from './domain/dutyStandbySchema.js';
import { normalizeDutyRehearsals } from './domain/dutyRehearsalSchema.js';
// ADR-0129 (Schema v118): the branch reading hand-off. Two fail-closed ledgers —
// the chief's ask and the branch leader's answer — normalised together so an
// answer from a seat that was never asked cannot survive a reload.
import { normalizeBranchReadingAsks, normalizeBranchReadings } from './domain/branchReadingSchema.js';
import { DUTY_STANDBY_BOUNDS, DUTY_STANDBY_DEFAULTS } from './domain/dutyStandbyRegistry.js';
import { normalizePropagationLineage } from './domain/automationLineage.js';
import { normalizeImpactExecutionSnapshot } from './domain/impactExecution.js';
// ADR-0088: Hoshin Carryover Terminal records, idempotency markers, once-only
// grading rows, and clamped conventions.
import {
  normalizeCarryoverRecords,
  normalizeCarryoverMarkers,
  normalizeCarryoverGradings,
  normalizeCarryoverSettings,
} from './domain/carryoverSchema.js';
import {
  normalizeOperatingModelSettings,
  normalizeOperatingModelMarkers,
  normalizeOperatingModelDecisions,
  normalizeWorkSplits,
} from './domain/operatingModelSchema.js';
import { normalizeStrategyBets, normalizeStrategyTags } from './domain/strategy.js';
import { normalizeRetros } from './domain/learning.js';
import { INTERVENTION_TYPES } from './domain/interventionTypes.js';
import { normalizeFidelityPlans, normalizeImplementationSnapshot } from './domain/fidelitySchema.js';
import { normalizeCompBands, normalizeMeritCycles } from './domain/compSchema.js';
// ADR-0166: the cross-line review-evidence join keeps ONE marker ledger and no
// record of its own. Fail-closed, like every other marker normalizer.
import { normalizeMeritEvidenceMarkers } from './domain/meritEvidenceRegistry.js';
// ADR-0168: the bench-evidence reading's own idempotency ledger. Zero imports in
// `benchEvidenceRegistry.js`, so `schema.js` reads the vocabulary without a cycle.
import { normalizeBenchEvidenceMarkers } from './domain/benchEvidenceRegistry.js';
import { normalizeLineIntakes } from './domain/lineIntakeRegistry.js';
import { normalizeBenchRegressionReadings, normalizeBenchRegressionMarkers } from './domain/benchRegressionRegistry.js';
import { normalizeTransitionPrograms } from './domain/transitionSchema.js';
import { normalizeOrgDesigns } from './domain/orgDesignSchema.js';
import { normalizeVoiDecisions, normalizeVoiStudies } from './domain/valueOfInformationSchema.js';
import { normalizeAttentionPlans } from './domain/attentionMarketSchema.js';
import { normalizeAutopilotPolicies, normalizeAutopilotRuns } from './domain/autopilotSchema.js';
import {
  normalizeSignalClasses,
  normalizeSignalLevers,
  normalizeSignalProbes,
} from './domain/signalPathSchema.js';
import { normalizeWarGame } from './domain/warGame.js';
import { normalizePerformanceConcerns } from './domain/performanceSchema.js';
import { normalizeSurvivalMarkers, normalizeSurvivalReadings } from './domain/survivalSchema.js';
import {
  normalizeWaitCostMarkers,
  normalizeWaitExposures,
  normalizeWaitPrices,
} from './domain/waitCostSchema.js';
import {
  normalizeEvidenceMarkers,
  normalizeEvidenceReviews,
} from './domain/evidenceSchema.js';
import {
  normalizeParityAudits,
  normalizeParityMarkers,
} from './domain/paritySchema.js';
import { normalizeConsequenceReadings, normalizeConsequenceMarkers } from './domain/consequenceSchema.js';
import { normalizeDeferralFrames, normalizeDeferralMarkers } from './domain/deferralOptionSchema.js';
import {
  normalizeCorrelationDeclarations,
  normalizeDeferralPortfolioMarkers,
  normalizeDeferralPortfolioReadings,
} from './domain/deferralPortfolioSchema.js';
import {
  normalizeIntegrityLooks,
  normalizeIntegrityMarkers,
  normalizeIntegrityReviews,
  normalizeSignalVerdicts,
} from './domain/integritySchema.js';
import {
  normalizeCredibilityDeclarations,
  normalizeCredibilityFrames,
  normalizeCredibilityMarkers,
} from './domain/credibilitySchema.js';
import {
  normalizeConfidenceCertificates,
  normalizeConfidenceMarkers,
} from './domain/confidenceSchema.js';
import { normalizeResponsePlans } from './domain/responseSchema.js';
import { normalizeActionBundles } from './domain/actionBundleSchema.js';
import { normalizePortfolioComparisons } from './domain/portfolioComparison.js';
import { normalizeSettlements } from './domain/settlementSchema.js';
import {
  normalizePolicyEvaluations,
  normalizePolicyMarkers,
  normalizeCounterfactualSettings,
} from './domain/counterfactualPolicySchema.js';
import {
  normalizeReliabilityReadings,
  normalizeReliabilityMarkers,
  normalizeReliabilitySettings,
} from './domain/reliabilitySchema.js';
import {
  normalizeCouplingReviews,
  normalizeCouplingSettings,
} from './domain/couplingLedgerSchema.js';
import {
  normalizeSupplyPlans,
  normalizeSupplyMarkers,
  normalizeSupplySettings,
} from './domain/supplySchema.js';
// ADR-0076 (Operating Seat): settings-only. The seat layer stores no new
// collection — the acting position is a declaration, handovers and refusals go
// into the existing append-only event log, provenance reuses existing typed
// links, and every roll-up figure is derived live from the reporting tree and
// the dated records. Nothing here needs a migration.
import { normalizeSeatSettings } from './domain/seatSchema.js';
// ADR-0092: the Differencing Defender. Releases and markers resolve BEFORE links
// so `summarizes-span` / `proves-release` / `protects-release` edges validate on
// reload. A malformed release is dropped rather than reasoned about.
import { normalizeReleases, normalizeMarkers as normalizeDifferencingMarkers, normalizeDifferencesSettings } from './domain/differencingSchema.js';
import { normalizeMissionBriefs, normalizeMissionSettings } from './domain/missionSchema.js';
import { LEADER_ID } from './domain/chain.js';
// ADR-0107: the Outcome Learning Loop (Schema v109, additive). Fail-closed
// normalizers hold ONLY frozen declarations; every score is re-derived on read.
import {
  normalizeOutcomeSettings, OUTCOME_SETTINGS_DEFAULTS,
  normalizeOutcomeContracts, normalizeOutcomeGrades, normalizeOutcomeMarkers,
} from './domain/outcomeSchema.js';
import { normalizeMissionCaptures } from './domain/missionCaptureSchema.js';
import {
  normalizeChainReadings,
  normalizeChainMarkers,
  normalizeChainSettings,
} from './domain/chainSchema.js';
import {
  normalizeSolvencyReadings,
  normalizeSolvencyMarkers,
  normalizeSolvencyRenegotiations,
  normalizeSolvencySettings,
} from './domain/solvencySchema.js';
import {
  normalizeScepticDispositions,
  normalizeScepticMarkers,
  normalizeScepticRounds,
  normalizeScepticSettings,
} from './domain/scepticSchema.js';
import {
  normalizeSuccessionMarkers,
  normalizeSuccessionReadings,
  normalizeSuccessionSettings,
} from './domain/successionSchema.js';
import { normalizeMandates, normalizeMandateSettings } from './domain/mandateSchema.js';
import { normalizeAuthorityCalibrationMarkers, normalizeAuthorityCalibrationSettings } from './domain/authorityCalibrationSchema.js';
// ADR-0081: the Altitude Router. Two bounded, append-only collections and
// clamped conventions (settings). Plans resolve BEFORE links so routing-plan
// nodes can be validated as link sources/targets on reload.
import {
  normalizeRouterPlans,
  normalizeRouterMarkers,
  normalizeRouterSettings,
} from './domain/altitudeRouterSchema.js';
// ADR-0082: the Sealed Spine's settings. Backward compatible (defaults when
// absent), so like ADR-0076's seat settings this needs NO schema bump of its own.
import { normalizeSealSettings } from './domain/sealSchema.js';
// ADR-0084: Hoshin Kanri & Catchball Cascade pacts, append-only rounds,
// idempotency markers, and clamped conventions.
import {
  normalizeCatchballPacts,
  normalizeCatchballRounds,
  normalizeCatchballMarkers,
  normalizeCatchballSettings,
} from './domain/catchballSchema.js';
// ADR-0089: bounded, identity-reduced Strategy Renewal readings and markers.
import {
  normalizeStrategyCycleReadings,
  normalizeStrategyCycleMarkers,
  normalizeStrategyCycleSettings,
} from './domain/strategyCycleSchema.js';
// ADR-0090: the Programme Federation Reading. Frozen, identity-reduced
// assessments of which declared leadership edges actually carry work, plus the
// idempotency markers RULE-FED-01..03 use.
import {
  normalizeFederationAssessments,
  normalizeFederationMarkers,
  normalizeFederationSettings,
} from './domain/federationSchema.js';
// ADR-0094: the Prospective Intervention Contract. Frozen pre-registrations,
// immutable once-only grades and the rules' idempotency markers, plus the
// clamped calibration conventions. A malformed row is dropped, never repaired.
import {
  normalizeProspectiveContracts,
  normalizeProspectiveGrades,
  normalizeProspectiveMarkers,
  normalizeProspectiveSettings,
} from './domain/prospectiveSchema.js';
// ADR-0095: the Robust Allocation Terminal. Declared plans (with a frozen
// solution at adoption) and the rules' idempotency markers, plus the clamped
// conventions. A malformed row is dropped, never repaired.
import {
  normalizeRobustPlans,
  normalizeRobustMarkers,
  normalizeRobustAllocationSettings,
} from './domain/robustAllocationSchema.js';
// ADR-0098: the Internal Clearinghouse. Clearing rounds and rule markers
// resolve before typed links; malformed sealed bids, frozen solutions or
// settlements are dropped rather than repaired into a commitment.
import {
  normalizeClearingRounds,
  normalizeClearingMarkers,
  normalizeClearingSettings,
} from './domain/clearingSchema.js';
// ADR-0099: the Freeze-Line Continuity Audit. Frozen continuity readings and
// rule markers resolve before typed links so `freezes`, `re-projects` and
// `rolls-up-to` edges validate against real ids; a malformed reading is
// dropped, never repaired into a verdict a leader might act on.
import {
  normalizeFreezeReadings,
  normalizeFreezeMarkers,
  normalizeFreezeLineSettings,
} from './domain/freezeLineSchema.js';
// ADR-0100: the Discretion Calibrator. Frozen calibration readings, the
// append-only ladder-adoption ledger and rule markers resolve before typed links,
// and a malformed reading is dropped rather than repaired into a verdict a leader
// might adopt.
import {
  normalizeSpanReadings,
  normalizeSpanAdoptions,
  normalizeSpanMarkers,
  normalizeSpanCalibrationSettings,
  normalizeAdoptedHorizons,
} from './domain/spanCalibrationSchema.js';
// ADR-0101: the Reputational Capital Ledger. Human-entered acts, dated positions
// (guarantees and repairs) and the rules' idempotency markers resolve before
// typed links so `rests-on` and `rolls-up-to` edges validate against real ids. A
// stored DERIVED act is dropped here — it is re-harvested from its source record
// on every read, and a stored copy would go stale while still spending capital
// the source no longer supports.
import {
  normalizeReputationActs,
  normalizeReputationPositions,
  normalizeReputationMarkers,
  normalizeReputationSettings,
} from './domain/reputationalCapitalSchema.js';
// ADR-0102: the Hindsight Lock. Human decisions, their frozen information sets
// and the rule-idempotency ledger behind every process finding.
import {
  normalizeDecisionLocks,
  normalizeHindsightMarkers,
  normalizeHindsightSettings,
} from './domain/hindsightSchema.js';
// ADR-0103 (Schema v105): the Epistemic Ledger. Harvested unknowns, frozen
// belief observations, their once-only grades and the rule-idempotency ledger.
import {
  normalizeEpistemicGrades,
  normalizeEpistemicMarkers,
  normalizeEpistemicObservations,
  normalizeEpistemicSettings,
  normalizeEpistemicUnknowns,
} from './domain/epistemicSchema.js';
// ADR-0104 (Schema v106): the Diligence Ledger. Frozen knowable sets, dated
// consultations, once-only Brier grades, idempotency markers and conventions.
import {
  normalizeDiligenceChecklists,
  normalizeDiligenceConsults,
  normalizeDiligenceGrades,
  normalizeDiligenceMarkers,
  normalizeDiligenceSettings,
} from './domain/diligenceSchema.js';
// ADR-0108 (Schema v110): the Decision-Fit Ledger's fail-closed normalizers and
// declared conventions.
import {
  FIT_SETTINGS_DEFAULTS,
  normalizeFitMarkers,
  normalizeFitProposals,
  normalizeFitReadings,
  normalizeFitSettings,
  normalizeFitSnapshots,
} from './domain/decisionFitSchema.js';
// ADR-0109 (Schema v111): the Jurisdiction Compiler's fail-closed normalizers
// and declared conventions.
import {
  JUR_SETTINGS_DEFAULTS,
  normalizeJurFindings,
  normalizeJurMarkers,
  normalizeJurReadings,
  normalizeJurSettings,
} from './domain/jurisdictionSchema.js';
// ADR-0113 (Schema v112): the 1:1 agenda provenance ledger. Only the lines a
// human FILED are stored; every status, share and interval is re-derived on read
// from the person record and the 1:1 the human already logged.
import {
  AGENDA_SETTINGS_DEFAULTS,
  normalizeAgendaEntries,
  normalizeAgendaMarkers,
  normalizeAgendaSettings,
} from './domain/agendaProvenanceSchema.js';
// The ONE declared retention policy for a person's 1:1 waiting list. Both the
// storage normalizer here and the agenda ledger's eviction reading import it, so
// the cap that stores the list and the cap that is printed about it cannot
// disagree — the defect ADR-0134 records.
import { TALKING_QUEUE_CAP, retainQueue } from './domain/talkingPointPolicy.js';

import { ALTITUDES as SPAN_ALTITUDES } from './domain/chainRegistry.js';
// ADR-0088: the Escalation Economy — the disposition ledger, intervention-rate
// commitments, idempotency markers, and clamped conventions.
import {
  normalizeEscalationRecords,
  normalizeEscalationCommitments,
  normalizeEscalationMarkers,
  normalizeEscalationSettings,
} from './domain/escalationSchema.js';
// ADR-0089: Hoshin Carryover Terminal records, idempotency markers, once-only
// grading rows, and clamped conventions.

// ADR-0085: the Operating Cadence Clock's fail-closed normalizers and clamped
// ADR-0088: Hoshin Carryover Terminal records, idempotency markers, once-only
// grading rows, and clamped conventions.

// ADR-0089: lateral SLA contracts, negotiation rounds and carryover receipts.
import {
  normalizeValueStreamContracts,
  normalizeValueStreamRounds,
  normalizeValueStreamReallocations,
  normalizeValueStreamMarkers,
  normalizeValueStreamSettings,
} from './domain/valueStreamSchema.js';
// ADR-0088 note: the Hoshin Carryover Terminal and the Operating Cadence Clock
// arrive on this tree from main (Sessions 125–127). Their fail-closed
// normalizers and clamped conventions load alongside the Value Stream's own.

// ADR-0087: the Operating Cadence Clock's fail-closed normalizers and clamped
// conventions. A forum, a sitting or a frozen reading that cannot be validated is
// dropped with a warning rather than repaired into something a leader might act on.
import {
  normalizeCadenceForums,
  normalizeCadenceSessions,
  normalizeCadenceReadings,
  normalizeCadenceMarkers,
  normalizeCadenceSettings,
} from './domain/cadenceSchema.js';

// ADR-0088: the Federated Envoy. Three additive collections (the packet
// ledger, the attested artefact ledger and the rule-idempotency markers) and
// five clamped conventions. Like ADR-0076 and ADR-0082 this needs **no schema
// version bump**: an older blob simply has none of these keys, and every one of
// them normalises to "never exchanged a packet", which is the truth rather than
// a fabricated empty exchange.
import {
  normalizeExchangeArtefacts,
  normalizeExchangeMarkers,
  normalizeExchangePackets,
  normalizeEnvoySettings,
} from './domain/envoySchema.js';
import { addDays } from './time.js';
import { validateWatchResponse } from './domain/watchResponse.js';
import {
  MEASUREMENT_STATUSES,
  normalizeMeasurementParams,
  normalizeMeasurementTask,
} from './domain/measurement.js';
import {
  CASE_KINDS,
  CASE_STATUSES,
  FORBIDDEN_LINK_TYPES,
  LINK_ENTITY_COLLECTIONS,
  LINK_ENTITY_TYPES,
  LINK_RELATIONS,
  STAKEHOLDER_CADENCES,
  STAKEHOLDER_STANCES,
} from './domain/cases.js';
import { COMMS_MAX_BODY, COMMS_PURPOSES, COMMS_STATUSES } from './domain/comms.js';
import { CHECKPOINT_STOCKS, scoreCheckpoint } from './domain/checkpointScoring.js';
import {
  PREMISE_CRITICALITIES,
  PREMISE_DIRECTIONS,
  PREMISE_SOURCE_COLLECTIONS,
  PREMISE_SOURCE_TYPES,
  PREMISE_STATUSES,
  evaluatePremiseCore,
} from './domain/premises.js';

import {
  PORTFOLIO_DECISIONS,
  PORTFOLIO_HORIZONS,
  PORTFOLIO_KINDS,
  PORTFOLIO_SOURCE_TYPES,
  PORTFOLIO_STATUSES,
} from './domain/capacity.js';

import {
  CANDIDATE_STAGES,
  EVIDENCE_KIND_BY_ID,
  REQUISITION_REASONS,
  REQUISITION_STATUSES,
} from './domain/hiring.js';

import {
  CHANGE_IMPACT_KINDS,
  CHANGE_KINDS,
  CHANGE_STATUSES,
  FORCE_CATEGORIES,
  FORCE_SIDES,
  KOTTER_STEPS,
  STAR_PILLARS,
  TEAM_TOPOLOGY_TYPES,
  TOPOLOGY_INTERACTION_MODES,
} from './domain/changes.js';

import {
  ESTIMATE_CONFIDENCE,
  NEGOTIATION_ISSUE_DIRECTIONS,
  NEGOTIATION_KINDS,
  NEGOTIATION_STATUSES,
  normalizeIssueInput,
  normalizeStringLists,
} from './domain/negotiation.js';

import {
  BUDGET_CATEGORIES,
  BUDGET_LINE_STATUSES,
  BUDGET_SOURCE_TYPES,
  BUDGET_STATUSES,
} from './domain/finance.js';

import {
  ALLIANCE_KINDS,
  ESTIMATE_CONFIDENCE as STK_ESTIMATE_CONFIDENCE,
  STAKEHOLDER_CATEGORIES,
  STAKEHOLDER_STATUSES,
} from './domain/stakeholders.js';

import {
  DELAY_PROFILES,
  TEMPO_SCHEDULE_STATUSES,
} from './domain/decisionTempo.js';

import {
  DEPENDENCY_CRITICALITIES,
  DEPENDENCY_KINDS,
  DEPENDENCY_STATUSES,
  DRILL_KINDS,
  DRILL_OUTCOMES,
  STEWARD_ROLES,
  SUBSTITUTABILITY_MODES,
} from './domain/resilience.js';

import {
  EW_ALERT_STATUSES,
  EW_MAX_FORECASTS,
  EW_SERIES_BY_ID,
  EW_SUPPRESSION_REASONS,
} from './domain/watchRegistry.js';

import {
  POWER_STATUSES,
  POWER_CELLS,
  POWER_CONFIDENCE,
  POWER_MIN_PLAYERS,
  POWER_DEFAULT_QUOTA_PCT,
  normalizePlayers,
  normalizeCells,
} from './domain/power.js';

export {
  CASE_KINDS,
  CASE_STATUSES,
  LINK_ENTITY_COLLECTIONS,
  LINK_ENTITY_TYPES,
  LINK_RELATIONS,
  STAKEHOLDER_CADENCES,
  STAKEHOLDER_STANCES,
  PORTFOLIO_DECISIONS,
  PORTFOLIO_HORIZONS,
  PORTFOLIO_KINDS,
  PORTFOLIO_SOURCE_TYPES,
  PORTFOLIO_STATUSES,
  CANDIDATE_STAGES,
  REQUISITION_REASONS,
  REQUISITION_STATUSES,
  CHANGE_IMPACT_KINDS,
  CHANGE_KINDS,
  CHANGE_STATUSES,
  FORCE_CATEGORIES,
  FORCE_SIDES,
  KOTTER_STEPS,
  STAR_PILLARS,
  TEAM_TOPOLOGY_TYPES,
  TOPOLOGY_INTERACTION_MODES,
  ESTIMATE_CONFIDENCE,
  NEGOTIATION_ISSUE_DIRECTIONS,
  NEGOTIATION_KINDS,
  NEGOTIATION_STATUSES,
  BUDGET_CATEGORIES,
  BUDGET_LINE_STATUSES,
  BUDGET_SOURCE_TYPES,
  BUDGET_STATUSES,
  STAKEHOLDER_CATEGORIES,
  STAKEHOLDER_STATUSES,
  ALLIANCE_KINDS,
  DEPENDENCY_KINDS,
  DEPENDENCY_CRITICALITIES,
  DEPENDENCY_STATUSES,
  SUBSTITUTABILITY_MODES,
  STEWARD_ROLES,
  DRILL_KINDS,
  DRILL_OUTCOMES,
};

// ADR-0076 (the Operating Seat) was additive WITHOUT a version bump by design:
// it introduced no new stored entity. The
// acting seat is a settings declaration, the handover and every access refusal
// are entries in the existing append-only event log, typed provenance reuses
// the existing `rolls-up-to` relation and existing graph entity types, and the
// roll-up is derived live from `person.managerId` and the dated records. An
// older blob simply opens on the undeclared operator view. A version bump here
// would have forced 78 test files to be rewritten for zero user benefit; the
// honest choice is to add nothing to migrate.
// v114 adds the Duty Coverage Register (ADR-0121, `#/duty-cover`):
// `dutyCovers` records a dated, human declaration of who is answerable for ONE
// duty line when the seat holder is absent, and `dutyCoverageMarkers` the scan
// ledger. Purely additive: eligibility, exercise and concentration are derived
// on read from the reporting tree and the dated records other modules already
// keep, so an upgraded workspace opens with an EMPTY cover ledger — "no duty
// here has a declared cover yet", which is not the claim "every duty is
// covered". Nothing is back-filled: a cover invented at upgrade time would be a
// responsibility no human accepted.
// v115 adds the Dated Absence Plan (ADR-0122, `#/duty-cover?panel=plan`):
// `absencePlans` records a dated, human declaration of when a seat will not be
// there — the window the register was missing. Availability of a declared cover
// during a window, the cover-absent conflict and the cascade are all DERIVED
// on read from the declared covers and absence windows, so an upgraded
// workspace opens with an EMPTY absence ledger: no absence is scheduled at
// upgrade time, because an absence invented at upgrade time would make every
// cover in the span read as unavailable on dates no human declared.
// v119 adds the Matrix Accountability Ledger (ADR-0140, `#/matrix`):
// `reportingLines` records the dated, human declaration that a person is also
// accountable to a second (or third) manager — functional home line plus
// project, product, cross-functional or administrative lines — with an
// allocation in whole hundredths and the decision rights each line holds.
// Purely additive and deliberately EMPTY on upgrade: an existing workspace has
// never declared a second reporting line, so the ledger starts by saying "this
// organisation is recorded as a single chain of command", which is a different
// claim from "nobody here has two managers". Nothing is back-filled: a second
// reporting line invented at upgrade time would be an accountability no human
// accepted, and a 100% allocation invented for every home line would make the
// roll-up close on a number nobody agreed to. Every existing roll-up keeps
// working unchanged: the home line is still `person.managerId`, read through
// the same tree, and a workspace with no declared lines gains no edges.
// v120 adds the Cross-Line Priority Arbitration (ADR-0143, `#/arbitration`):
// `priorityArbitrations` records, per case, the demands two or more lines have
// placed on ONE person's capacity, the two declared integers each line supplied
// (cost of delay and job size), the remaining chain in whole days, the measured
// recommendation, the arbiter's ratified precedence with its effective window and
// review date, every party's own answer, and a POINTER to each obligation it
// issued. `priorityArbitrationMarkers` is the rule's idempotency ledger. Purely
// additive and deliberately EMPTY on upgrade: an existing workspace has never
// opened an arbitration, so the register opens by saying "no cross-line
// contention has been declared here", which is a different claim from "no two
// managers have ever disagreed". Nothing is back-filled: an order invented at
// upgrade time would be a precedence nobody negotiated, and the recommendation
// it would have to invent is not in the record either. Every score, verdict,
// state and capacity total is DERIVED on read, so no printed figure can drift.
// v121 adds the Cross-Line Contradiction Audit (ADR-0144, `#/contradiction`):
// `lineMandates` records ONE declared charter per row — this line, this lever
// from the declared taxonomy, this direction, this share of the scorecard in
// basis points, this claim on one existing envelope, this declared target — and
// `contradictionReviews` records the chief's ruling on a DERIVED finding, with
// the reasoning, the review date, the line told to change, and a POINTER to the
// decision and the obligation the rule issued. `contradictionMarkers` is the
// rule's idempotency ledger. Purely additive and deliberately EMPTY on upgrade:
// an existing workspace has never declared a charter, so the register opens by
// saying "no line charter has been declared here", which is a different claim
// from "no two charters could ever conflict". Nothing is back-filled: a charter
// invented at upgrade time would be an accountability nobody declared, and a
// finding derived from it would be a contradiction nobody has. No finding, no
// severity, no weight total and no queueing multiplier is ever stored — every
// one is re-derived on read from these declarations plus the live matrix.
// v122 adds Matrix Multi-Line Review Stewardship (ADR-0147,
// `#/reviews?panel=stewardship`): an EXISTING review row gains an optional
// `stewardship: { requests: [], answers: [] }` — the dated asks a manager made of
// another line, and the first-person answers (or reasoned declines) that line's
// holder gave. It adds NO collection, no score and no rating: every line state,
// overdue flag, assessor resolution and verdict is re-derived on read from these
// acts plus the live `reportingLines` and the period. Deliberately EMPTY on
// upgrade, and every existing review opens with `stewardship: { requests: [],
// answers: [] }`: an ask back-filled at upgrade time would print as a promise
// somebody made, and an answer back-filled at upgrade time would be words nobody
// said. A single-chain workspace gains no second row, no warning and no change
// to any existing review.
// v123 adds Matrix Line Consent (ADR-0148, `#/matrix?panel=consent`): a declared
// reporting line is an ASK until two humans answer it. `lineConsents` records
// ONLY the dated acts — a line manager's acceptance (with the window it runs to
// and an optional stated basis) or reasoned decline, and the person's own
// acknowledgement that the share is taken from their hours. `lineConsentMarkers`
// is RULE-LCN-01's idempotency ledger. Purely additive and deliberately EMPTY on
// upgrade: no line has been answered by anybody, so an upgraded workspace reads
// "every declared share is still an ask" — which is a different claim from "every
// manager agreed", and it is the honest one. Nothing is back-filled: an
// acceptance invented at upgrade time is consent nobody gave, and an
// acknowledgement invented at upgrade time is a person recorded as committed to
// hours nobody told them about. Every state, lapse, day count, verdict and total
// is DERIVED on read from these acts plus the live matrix, so no printed figure
// can drift from the record that produced it.
// ADR-0159 (Schema v130): Frozen Authority Re-Affirmation (`authorityReaffirmations`,
// `authorityReaffirmationMarkers`). Append-only dated human settlements on
// drifted frozen decisions (`merit-cycle`, `decision`, `board-memo`) plus
// RULE-ACR-01's idempotency ledger. Deliberately EMPTY on upgrade so every
// drifted record reads `unsettled` until a current right holder or joint
// matrix principal answers; no frozen record is ever edited.
// ADR-0162 (Schema v131): Matrix Management-Interface Operating-Agreement
// Register (`matrixInterfaceAgreements`, `matrixInterfaceMarkers`). Append-only
// dated first-person bilateral acts between counterpart managers plus
// RULE-MIA-01's idempotency markers. Deliberately EMPTY on upgrade so no
// interface agreement or escalation route is fabricated without human consent.
// v132 records who held a 1:1, without assigning a holder to old meetings.
// Coverage is derived from the current matrix and is never stored as a score.
// v137 adds the Bench-Claim Evidence Regression Watch (ADR-0172):
// `benchRegressionReadings` (one dated evidence reading per bench claim per
// completed review, never rewritten) plus RULE-BRG-01's idempotency markers.
// Pair verdicts are re-derived on read; a stored verdict would be the drift
// the Bulletproof Reliability Mandate forbids.
// v138 adds the Standing Delegation-of-Authority (DoA) Schedule & Cross-Line
// Limit Conformance ledger (ADR-0174): `doaSchedule` (append-only dated integer-
// cent limits, retirements, and explicit decision pricing) plus `doaMarkers`
// (`RULE-DOA-01`). Starts empty so no standing limit is inferred from title or rank.
// v139 adds the Matrix Pattern Repair Register (ADR-0175): `matrixRemedies`
// (append-only dated acts naming an owner, a remedy and a review date against a
// recurring structural signature). Deliberately EMPTY on upgrade: no remedy, owner
// or review date is ever fabricated; verdicts are re-derived on every read.
// v140 completes Matrix 1:1 Line Coverage (ADR-0164): adds `oneOnOneLineMarkers`
// (`RULE-OOL-01`'s bounded idempotency/observation ledger). Deliberately EMPTY
// on upgrade; existing meetings never gain synthetic `heldById` attribution.
// v141 adds Cross-Line Selection Corroboration (ADR-0176): `hiringLinePlans`
// (append-only dated acts declaring which managers a hire on a requisition will
// report to) and `hiringLineMarkers` (`RULE-HLC-01`'s bounded idempotency ledger).
// Deliberately EMPTY on upgrade: no line plan is ever inferred from a team name,
// an interview panel or a title, so every existing requisition reads `undeclared`.
// v142 adds the Cross-Line Labour Chargeback & Internal Transfer-Price Ledger
// (ADR-0177): `transferPriceActs` (append-only dated two-key acts — propose,
// confirm, retire) and `transferPriceMarkers` (`RULE-TPL-01`'s bounded
// idempotency ledger). Deliberately EMPTY on upgrade: no price is ever inferred
// from pay, a budget line or a title, so every borrowed share-day of every
// existing workspace reads `no agreed price` — refused, never zero.
// v144 adds the Non-Promotable Work Turn Ledger (ADR-0181): `workTurnActs`
// (append-only dated acts declaring one ask non-promotable or promotable) and
// `workTurnMarkers` (`RULE-NPW-01`'s bounded idempotency ledger). Deliberately
// EMPTY on upgrade: no kind is ever inferred from a title, a role or a person,
// so every existing ask reads `not classified` — refused, never guessed.
// v146 adds the Workforce Stock-Flow (Markov manpower) Plan (ADR-0184):
// `workforceFlowActs` (append-only dated MOVE acts — one kind, an origin level,
// a destination level and the day it took effect), `workforceFlowTargets`
// (append-only dated declarations of an intended headcount at a level by a day)
// and `workforceFlowMarkers` (`RULE-WFS-01`'s bounded idempotency ledger).
// Deliberately EMPTY on upgrade: the roster stores TODAY'S level per person and
// nothing about how they reached it, so an upgraded workspace has no recorded
// history and the plan reads `no move has ever been recorded here` — refused,
// never a rate estimated from a snapshot that was never taken.
// v147 adds `changeImpactRequests` (dated, per-line requests with a frozen
// material-impact + active-line snapshot) and `changeImpactResponses` (one
// first-person reviewed/declined act per request, with an explicit valid-through
// date for a review). Both ledgers start empty: no response, line coverage or
// request is inferred from an existing change record.
// v148 adds the Cross-Line Change Saturation & Absorptive-Capacity Ledger
// (ADR-0186): `changeSaturationActs` (append-only dated demand acts — one person,
// one open change that already names them among its impacts, the declaring line,
// a declared weight band and a dated window), `changeSaturationCeilings`
// (append-only dated declarations of the concurrent change weight a person or a
// pool will absorb) and `changeSaturationMarkers` (`RULE-CSA-01`'s bounded
// idempotency ledger). Deliberately EMPTY on upgrade, and no convention defaults
// a capacity: a change record's status, go-live date or effort triple says nothing
// about what the change puts on a person, and a capacity inferred from level, pay
// or meeting load would be a limit its author never agreed to. An upgraded
// workspace therefore opens printing `no capacity declared` — refused, never zero.
export const SCHEMA_VERSION = 150;

// v91 adds the Board Room (ADR-0085, main): a pre-registered disclosure memo whose
// thresholds are declared before the first look.
// v92 adds the Disclosure Compiler (ADR-0086, main): each screen declares its
// posture, and detail is released only by a consented, expiring contract.
// v93 adds the Operating Cadence Clock (`cadenceForums`, `cadenceSessions`,
// `cadenceReadings`, `cadenceMarkers`, ADR-0087): the standing-forum calendar as a
// finite decision machine — declared per-forum decision capacity and service
// time, append-only sittings, and frozen readings of the queue that are graded
// once afterwards. Purely additive: every utilisation, flow time, breach
// probability and constraint is derived on read from the roster and the dated
// records other modules already keep, so an upgraded workspace opens with an
// EMPTY forum register that says no cadence has ever been declared, rather than
// a fabricated meeting calendar. A forum is only ever created by a human.
// v94 adds prospective, identity-reduced Strategy Renewal readings and rule
// markers. It never back-fills a cohort from the current Catchball or bet state.
// v94 adds the Hoshin Carryover Terminal (`carryoverRecords`, `carryoverMarkers`,
// `carryoverGradings`, ADR-0088): one record per Catchball pact settled as
// thesis-invalidated with its frozen resource bundle, settlement and release
// steps, and once-only later gradings. Purely additive: an upgraded workspace
// opens with an EMPTY carryover ledger rather than back-filled settlements.
// v95 adds per-seat authorship attestation (`seatIdentities`, `identityMarkers`,
// ADR-0089): public-half credential enrollments (salt, key fingerprint and an
// HMAC verifier — never key material) and the identity rules' idempotency
// markers. Purely additive: an older workspace attests nothing until someone
// enrolls.
// v94 adds the Escalation Economy (`escalationRecords`, `escalationCommitments`,
// `escalationMarkers`, ADR-0088): whether a decision moment was absorbed where it
// arose or escalated upward, with the queue integrity of the receiving span, the
// escalation yield, the context lost per rung and a graded intervention-rate
// commitment. Purely additive: an upgraded workspace opens with an EMPTY ledger
// that says no decision moment has been recorded, rather than a disposition
// inferred from case titles. A decision moment is only ever logged by a human.
// v95 adds the Hoshin Carryover Terminal (`carryoverRecords`, `carryoverMarkers`,
// `carryoverGradings`, ADR-0089): a first-class record for a Catchball pact
// settled as thesis-invalidated, with resource release, once-only grading and
// calibration. Purely additive: an upgraded workspace opens with an EMPTY
// carryover ledger, because a settlement back-filled from pact titles would claim
// a decision the organisation never actually made.
// v94 adds the Hoshin Carryover Terminal (`carryoverRecords`,
// `carryoverMarkers`, `carryoverGradings`, ADR-0088): one record per Catchball
// pact settled as thesis-invalidated, with governed stop-rule settlement,
// resource release and once-only later grading.
// v95 adds the Value Stream Exchange (`valueStreamContracts`,
// `valueStreamRounds`, `valueStreamReallocations`, `valueStreamMarkers`,
// ADR-0089): bilateral peer-span SLAs, negotiated rounds and immutable
// stop-rule carryover receipts. Both steps are additive: no historical actual,
// grade or financial fact is reconstructed, so an upgraded workspace opens
// with an EMPTY carryover ledger and NO peer contracts rather than an
// operating history that never ran.

// v83 adds the Succession Terminal (`successionReadings`, `successionMarkers`): a
// frozen bench claim per workspace or per span — the probability that at least one
// leadership span will be unable to reabsorb a holder's work before the review
// date, with the exact min-cut certificate it was priced from — plus the
// idempotency markers its five rules use. Every span, blanket, concentration and
// flow test is derived on read from the roster and the dated records other modules
// already keep; only the frozen quote is stored, so an upgraded workspace opens
// with an empty ledger that says the bench has never been certified rather than a
// fabricated org health score.

// v82 adds the Command Chain (`chainReadings`, `chainMarkers`): one altitude axis
// across the whole workspace and one frozen reading per span. Every altitude, span
// dossier, roll-up rate and escalation clock is derived on read from the roster and
// the dated records other modules already keep; only a frozen reading — which makes
// exactly one prospective claim about its own work crossing the next altitude's
// horizon — is stored, so an upgraded workspace opens with an empty ledger that says
// so rather than a fabricated org chart.

// v81 adds the Cross-Examination Terminal (`scepticRounds`, `scepticDispositions`,
// `scepticMarkers`): frozen audits of every claim the workspace makes about
// itself — completion, assessment, prediction, diagnosis, alignment, capacity —
// cross-examined against the record that contains it, plus the append-only ledger
// of human verdicts the whole error-rate model is measured from. Purely additive:
// every claim, contradiction and rate is derived on read from records other
// modules already keep, so an upgraded workspace opens with empty ledgers, no
// fabricated verdict, and a sampling bound that says exactly nothing has been
// examined yet.

// v80 adds the Promise Solvency Terminal (`solvencyReadings`, `solvencyMarkers`,
// `solvencyRenegotiations`): frozen readings of the leader's own promise book —
// the joint breach probability of every dated promise another module already
// keeps, the coverage ratio behind it and the single repair worth making — plus
// the append-only ledger of dates that were moved. Purely additive: every
// exposure, probability and ratio is derived on read from dated records, so an
// upgraded workspace opens with empty ledgers that say exactly that.

// v79 adds the Evidence Supply Chain (`supplyPlans`, `supplyMarkers`): frozen
// plans that commit leader hours to the evidence lines the workspace's own
// records say are starving, plus the idempotency markers. Purely additive: every
// count, rate and fill probability is derived on read from dated records the
// workspace already keeps, so an upgraded workspace opens with an empty plan
// ledger that says exactly that.

// v78 adds the Coupling Ledger (`couplingReviews`, and the `couplingMarkers` tag store it shares): frozen
// audits of the leader's own declared pairwise correlations against the
// realised joint timing of the calls they couple.
// v77 adds the Measurement Reliability Terminal (`reliabilityReadings`,
// `reliabilityMarkers`): frozen readings of the leader's own rating instrument
// — the variance decomposition, the reliability coefficient, the tier count and
// the separation bar in force — plus the observation and rule-idempotency
// markers. Purely additive: no reading is invented for an existing workspace,
// because a reading is a forecast about an instrument and back-filling one would
// be a prediction written after the answer was known. Nothing person-level is
// stored: the frozen record carries counts and coefficients only.
// v76 adds the Counterfactual Policy Terminal (`policyEvaluations`,
// `policyMarkers`): frozen off-policy evaluations of named alternative decision
// policies, and the provenance ledger proving each decision point was captured
// before its outcome was known. Purely additive: no evaluation or marker is
// invented for an existing workspace, because a policy value computed over a
// log written after the outcome is not a counterfactual at all. Every unit,
// propensity, bound and sensitivity figure is re-derived on read from records
// the workspace already keeps.
// v71 adds the Borrowed Evidence Engine (`credibilityFrames`,
// `credibilityDeclarations`, `credibilityMarkers`): frozen borrowing forecasts
// that carry BOTH the borrowed and the own-data estimate for one unit and are
// graded once against what followed, the leader's per-group exchangeability
// rulings, and rule idempotency markers. Purely additive: every borrowed
// estimate is derived on read from ledgers the workspace already keeps, so an
// upgraded workspace opens with no frame and no ruling — back-filling either
// would be a forecast written after its outcome, or a judgement nobody made.
// v70 adds the Signal Integrity Board (`integrityLooks`, `signalVerdicts`,
// `integrityReviews`, `integrityMarkers`): the recorded looks that charge the
// family-wise error budget, the leader's one-way verdicts on surfaced signals
// across every family, and frozen programme reviews with exactly one
// prospective false-discovery claim each. Purely additive: no look, verdict or
// review is invented for an existing workspace, because a verdict is a human
// judgement and a review is a forecast — back-filling either would be an answer
// written after the result was known.
// v69 adds the Deferral Portfolio (`deferralPortfolioReadings`,
// `correlationDeclarations`, `deferralPortfolioMarkers`): frozen aggregate
// book readings with declared pairwise correlations, graded once; the
// correlation declarations are leader assumptions and are never derived or
// back-filled, because co-movement in a leadership record cannot identify
// correlation.
// v68 adds the Deferral Option Terminal (`deferralFrames`, `deferralMarkers`):
// frozen pricing snapshots of the option to wait, one prospective timing
// forecast each, graded once against the recorded decision date. Purely
// additive: no frame is invented for an existing workspace, because a frame is
// a forecast and back-filling one would be a prediction made after the answer
// was known.
// v67 adds the Consequence Lab: frozen, identity-free decision-future readings
// and marker-idempotent cross-module propagation. Old workspaces start empty;
// retrospectively freezing a wait forecast after the decision would be fiction.
// v66 adds the Evidence Terminal (`evidenceReviews`, `evidenceMarkers`):
// frozen, aggregate-only claims about what the pooled evidence said on a date,
// graded afterwards by interval coverage, plus marker idempotency for
// RULE-EBM-01..05. Purely additive: no review is invented for an existing
// workspace, because a review is a prediction and back-filling one would be a
// prediction made after the answer was known.
// v65 adds the Leadership Parity & Standard Consistency Terminal
// (`parityAudits`, `parityMarkers`): frozen and graded parity/consistency
// self-audits and marker idempotency for RULE-PAR-01..05. Purely additive: no
// historical audit or marker is invented for an existing workspace.
// v64 adds the Cost of Waiting Terminal (`waitPrices`, `waitExposures`,
// `waitCostMarkers`): declared weekly delay prices per class of work, frozen
// weekly exposure certificates, and marker idempotency for RULE-WAIT-01..05.
// Purely additive: no price, certificate or marker is invented for an existing
// workspace, because a price the leader never declared would be a cost nobody
// agreed to, and a certificate frozen after the fact would be a prediction
// made after the answer was known.
// v58 adds human-approved, declarative operating agreements and a bounded
// execution ledger. No agreement is inferred or activated from old records.
// v49 adds a bounded, frozen `executionSnapshot` to Impact studies when they
// are scored. It counts exact, post-start matches to the typed source record in
// the retained success-lineage ledger and keeps up to 12 trace navigation IDs.
// It does not prove delivery, exposure, intervention fidelity or causality; an
// absent match is not evidence that no work happened. v48 adds the bounded,
// successful propagation trace (`propagationLineage`). Old workspaces start
// empty; no historical successes are guessed from event summaries. Each trace
// stores event/record types and IDs, rule names and typed edges, capped at 250
// transactions, 32 steps, and 48 targets/edges/events per trace.
// v47 adds the Scorecard Integrity Lab (`scorecards`): the leader's declared
// scorecard — measured tasks with their declared value, effort cost, gaming
// ease, noise and ratchet — plus the prediction frozen at commit and the
// observation recorded at review. Purely additive: no historical scorecard is
// invented, and an old workspace starts with an empty lab that says so.
// v45 adds the Leader Continuity Drill (`continuityDrills`). One record per
// simulated absence window: the stall probabilities frozen when the window
// was opened and the leader's own record of what actually stalled. Purely
// additive: no historical absence is retro-simulated, no drill is invented,
// and the score is re-derived from the stored observations on every load so a
// stored figure can never drift from the record it describes.
// v43 adds the After-Action Review & Learning Ledger (`retros`): one record per
// review of a closed event, carrying the four AAR answers, the dated lessons it
// produced and the state of the change each lesson committed. Purely additive:
// no historical closure is retro-reviewed on migration, because a review
// written today about an event last quarter is a story, not a record — the app
// instead *offers* the review of each dated closure and prints its age.
// v42 adds the Strategy Coherence Terminal: `strategyBets` (the declared theory
// of the business, with explicit shares, refusals and dated stop rules) and
// `strategyTags` (which open records are funded by which bet). Purely additive:
// no historical record is retro-tagged into a strategy, because a tag written
// after the fact would let the say–do gap be improved by relabelling the past
// instead of changing the work. A workspace therefore starts with zero bets and
// says "no strategy declared" rather than inventing one.
// v41 adds `propagationReceipts`: the durable ledger of post-commit rule
// failures. Before it, a rule that threw was written to the audit log and told
// to the user as a warning, and then the transaction simply moved on — the
// downstream artifacts it would have created were lost with no way to ask for
// them again. A receipt keeps the event that triggered the failure and the
// error, so the same propagation can be retried against current state. A
// receipt is bookkeeping, never a claim that the effect happened.
// v40 adds optional, human-supplied Watch response context and frozen first
// observations. Existing forecasts remain legacy; migrations never invent a
// historical observation, a human judgment, or a retroactive forecast vintage.
export const APP_ID = 'leados.lifecycle';
/**
 * Schema v32 — the Stakeholder Comms Outbox (`commsDrafts`).
 *
 * Drafts are generated by RULE-COMMS-01..04 from recorded case facts and never
 * sent by the app. The ledger is append-oriented: a superseded draft keeps its
 * reason and pointer to its replacement. Migration 31→32 is purely additive:
 * no historical stakeholder is retro-messaged, and no outbox is backfilled.
 */

/**
 * Schema v31 — the Impact Ledger (`impactStudies`).
 *
 * A study is a *pre-registered hypothesis* about what an intervention will do
 * to a named workspace vital, plus the window over which it will be judged.
 * Two invariants are enforced here because they are what make the ledger worth
 * anything:
 *
 *  1. `declaredOn` is compared with `windowStart` to derive the study's grade.
 *     Declaring a hypothesis on or before the intervention date is
 *     `confirmatory`; declaring it afterwards is `exploratory` and can never be
 *     counted as confirmation. The grade is derived, never self-declared, so a
 *     retrospective story cannot be promoted by editing a field.
 *  2. A frozen `evaluation` may only exist on a `scored` study with a
 *     `lockedOn` date. An evaluation without a lock is discarded with a
 *     warning — otherwise the record could carry a flattering result that was
 *     never actually committed to.
 *
 * Purely additive: no existing record is converted into a study, and an older
 * workspace starts with an empty ledger and default settings.
 */
/**
 * Schema v30: the Coalition & Incentive War Room gains `powerGames` — exact
 * Banzhaf / Shapley-Shubik voting-power analysis, 2x2 Nash equilibria,
 * mechanism-design incentive alignment and confidence-scored influence scripts,
 * propagated atomically across modules by RULE-PWR-01..06. Purely additive: no
 * existing record is converted into a game.
 *
 * Schema v29: the Operational Resilience, Dependency & Continuity Terminal
 * gains `dependencies` — a typed directed topology of services, external
 * vendors, technical systems and recurring processes with Simchi-Levi TTS/TTR
 * tolerances, verified human stewardship (Bus Factor), exit plans and
 * continuity drill records. Purely additive: unmeasured TTS/TTR, financial
 * exposure and steward verification dates stay `null`, never fabricated zeros.
 */
/**
 * Schema v28: the Decision Tempo & Timing Terminal gains `tempoSchedules` (the
 * human-armed and engine-proposed decision timeboxes) and each decision gains
 * `decidedOn` — the day the call was actually made, stamped once and never
 * rewritten. Purely additive: a historical decided record keeps `decidedOn`
 * null and is counted as *unmeasured*, because inferring the moment of a
 * decision from a later review date would manufacture a latency number.
 */
/**
 * Schema v27: the natural-language Intake Terminal gains an append-only
 * `intakeDrafts` ledger (analyzed → confirmed/dismissed) holding the on-device
 * triage analysis snapshot and the human's acceptance/editing outcomes.
 * Purely additive: no historical record is converted into a draft.
 */
/**
 * Schema v26: a forecast-integrity challenge is a reviewable, append-only
 * outside-view record. It never rewrites the source estimate.
 */
export const FORECAST_CHALLENGE_STATUSES = ['open', 'accepted', 'adapted', 'dismissed'];
export const DECISION_OUTCOMES = ['pending', 'good', 'mixed', 'bad'];

export const LEVELS = ['ic', 'senior', 'lead', 'manager', 'director', 'vp'];
export const LEVEL_LABELS = {
  ic: 'Individual contributor',
  senior: 'Senior IC',
  lead: 'Team lead',
  manager: 'Manager',
  director: 'Director',
  vp: 'VP / Executive',
};

/**
 * Who owes a 1:1 commitment. There are exactly two people in the room, so the
 * vocabulary is deliberately small: the report, the leader, or both.
 *
 * `null` is a first-class value meaning "not recorded". It is never silently
 * replaced with a guess: an unrecorded owner is a real gap in a leader's
 * follow-through system, and the app surfaces it rather than papering over it.
 */
export const ACTION_OWNERS = ['them', 'leader', 'shared'];

export const PULSE_DIMENSIONS = ['safety', 'clarity', 'workload', 'growth'];
export const PULSE_LABELS = {
  safety: 'Psychological safety',
  clarity: 'Clarity of priorities',
  workload: 'Sustainable workload',
  growth: 'Growth & learning',
};
export const PULSE_PROMPTS = {
  safety: 'I can raise problems or mistakes on this team without being penalised.',
  clarity: 'I know what the most important thing to do this week is.',
  workload: 'My workload this week was sustainable.',
  growth: 'I am learning something that matters to my development.',
};

export const CONFIDENCE = ['on-track', 'at-risk', 'off-track'];
export const CONFIDENCE_LABELS = {
  'on-track': 'On track',
  'at-risk': 'At risk',
  'off-track': 'Off track',
};

export const READINESS = ['ready-now', 'ready-later', 'not-ready'];
export const READINESS_LABELS = {
  'ready-now': 'Ready now',
  'ready-later': 'Ready in 1–2 years',
  'not-ready': 'Not yet ready',
};

// Optional, behaviour-anchored manager ratings. There is deliberately no
// self-rating: reflection supplies context, not a second score to average.
export const REVIEW_RATINGS = ['needs-development', 'meets-expectations', 'often-exceeds', 'sets-standard'];
export const REVIEW_RATING_LABELS = {
  'needs-development': 'Needs development',
  'meets-expectations': 'Consistently meets expectations',
  'often-exceeds': 'Often exceeds expectations',
  'sets-standard': 'Sets a new standard',
};

/**
 * Schema v86 — retention ledger enums. They live here, with the other
 * normalisation enums, because the schema normaliser must be able to validate
 * them; the retention domain engine imports them rather than duplicating them.
 */
export const DEPARTURE_TYPES = ['voluntary', 'involuntary', 'unknown'];
export const DEPARTURE_TYPE_LABELS = {
  voluntary: 'Voluntary',
  involuntary: 'Involuntary',
  unknown: 'Not recorded',
};
export const DEPARTURE_REASON_CLASSES = [
  'compensation',
  'growth',
  'manager',
  'workload',
  'role-fit',
  'relocation',
  'life-event',
  'performance',
  'redundancy',
  'other',
  'unknown',
];
export const DEPARTURE_REASON_LABELS = {
  compensation: 'Pay position',
  growth: 'Growth & progression',
  manager: 'Manager relationship',
  workload: 'Workload & sustainability',
  'role-fit': 'Role fit',
  relocation: 'Relocation',
  'life-event': 'Life event',
  performance: 'Performance exit',
  redundancy: 'Redundancy',
  other: 'Other',
  unknown: 'Not recorded',
};
export const RETENTION_PLAN_STATUSES = ['proposed', 'committed', 'declined', 'completed', 'moot'];
export const RETENTION_PLAN_STATUS_LABELS = {
  proposed: 'Proposed',
  committed: 'Committed',
  declined: 'Declined',
  completed: 'Completed',
  moot: 'Moot (person left)',
};
export const RETENTION_INTERVENTION_IDS = ['pay-adjust', 'level-review', 'growth-plan', 'cadence-reset', 'recognition-rhythm', 'load-relief'];


export const ONBOARDING_HORIZONS = [30, 60, 90];
export const ONBOARDING_CATEGORIES = ['clarity', 'connection', 'culture', 'contribution', 'ownership'];
export const ONBOARDING_STATUSES = ['active', 'completed', 'archived'];
// A 30-60-90 plan is onboarding for someone joining the team, a role
// transition for a tenured person moving into a new scope (promotion, lateral
// move, IC -> Lead), or return-to-work ("re-boarding") after extended leave.
// The distinction is recorded, never inferred from tenure, never rewrites
// `person.startDate`, and never stores medical or leave reasons.
export const ONBOARDING_KINDS = ['new-hire', 'role-transition', 'reboarding'];

/** Clamp retention conventions; invalid or non-positive values use the documented default. */
function clampRetentionSetting(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export const DEFAULT_SETTINGS = Object.freeze({
  leaderName: '',
  teamName: 'My team',
  orgName: '',
  oneOnOneCadenceDays: 7,
  feedbackTargetDays: 21,
  // Team conventions, not universal scores: both are user-configurable.
  feedbackLatencyTargetDays: 7,
  recognitionTargetDays: 21,
  goalCheckinDays: 14,
  delegationCheckinDays: 7,
  decisionReviewDays: 14,
  onboardingDays: 90,
  growthReviewDays: 30,
  caseReviewDays: 14,
  changeReviewDays: 21,
  // Negotiation workbench convention (Schema v23): default horizon for the
  // DACI mandate decision's outcome review and the negotiation review queue.
  negotiationReviewDays: 14,
  // Budget & finance convention (Schema v24): forecast utilisation at or
  // above this share of an envelope enters the watch zone. A management
  // convention for timely budgetary control, not a financial standard.
  budgetWatchPct: 80,
  // Forecast integrity (Schema v26): automatic outside-view challenges are
  // on by default but can be paused per workspace. The coverage target is a
  // transparent convention; the engine still reports its finite-sample bound.
  forecastAutoPropagate: true,
  forecastCoveragePct: 80,
  // Decision tempo (Schema v28). These are *management guardrails*, not
  // standards: how long a decision of each McKinsey type may sit open before it
  // counts as decision debt, the money level at which a call is treated as a
  // big bet, and the evidence half-life used by the option-to-wait model.
  tempoDelegatedMaxDays: 7,
  tempoCrossCuttingMaxDays: 21,
  tempoBigBetMaxDays: 45,
  tempoBigBetValue: 50000,
  tempoInfoHalfLifeDays: 14,
  tempoCoveragePct: 80,
  tempoAutoPropagate: true,
  // Retention intelligence conventions (Schema v86).
  retentionHorizonDays: 90,
  retentionRiskThresholdPct: 12,
  retentionRiskIndexThreshold: 1.6,
  retentionEvidenceFloor: 10,
  retentionPriorMonthlyHazardPct: 1.2,
  retentionPriorStrengthMonths: 12,
  retentionRidge: 2,
  retentionReplacementPct: 50,
  retentionPromotionPct: 8,
  retentionReviewDays: 30,
  retentionAttentionHours: 12,
  retentionAutoPropagate: true,
  // Operational resilience & continuity conventions (Schema v29): cadence
  // reminder window for continuity drills (0 disables reminder), HHI warning
  // threshold (DOJ/FTC high-concentration default 2,500), and post-commit
  // propagation toggle.
  resilienceDrillDays: 180,
  resilienceHhiWarn: 2500,
  resilienceAutoPropagate: true,
  // Coalition & Incentive War Room conventions (Schema v30): the default
  // voting quota for a new situation (strict-majority by weight), the staleness
  // window for a committed strategy, the relative robustness margin below which
  // an equilibrium counts as fragile, and the post-commit propagation toggle.
  // These are management conventions, not decision-theory constants.
  powerQuotaPct: 50,
  powerStaleDays: 14,
  powerFragileMargin: 0.1,
  powerAutoPropagate: true,
  // Influence Network Intelligence (Session 48, additive on Schema v30):
  // The collaboration graph is a derived lens — a "tie" must be at least
  // `networkTiePct`% as strong as the team's strongest tie (a relative
  // strong-tie backbone so incidental co-appearance does not hide structure).
  // `networkAutoPropagate` governs automatic fan-out for events that declare
  // rules:['network'] in the shared post-commit spine; an explicit network
  // scan always runs. Both are management conventions, not constants.
  networkTiePct: 50,
  networkAutoPropagate: true,
  // Impact Ledger (Schema v31). These are *design* conventions for an
  // observational evaluation, not statistical laws: the two-sided alpha a
  // placebo test must clear (0.10 by default because weekly workspace series
  // are short and noisy, and 0.05 would make almost every honest study
  // "inconclusive"), the default number of pre-intervention and
  // post-intervention weekly periods, and whether settled studies fan out
  // automatically through the shared post-commit spine.
  impactAlpha: 0.1,
  impactBaselineWeeks: 8,
  impactWindowWeeks: 4,
  impactAutoPropagate: true,
  // Allocation Governor (Schema v33). Management conventions, not laws of
  // portfolio theory: the exploration floor is the minimum share of newly
  // funded effort that must go to exploratory work over the look-back window
  // before RULE-ALLOC-01 opens a rebalancing decision (Nagji & Tuff's
  // ~10% transformational share is the default, and 0 disables the floor
  // check). The window bounds "recent funding behaviour"; settled evidence
  // itself is never windowed away — a bandit that forgets its own history
  // cannot learn. The pause switch mirrors `impactAutoPropagate`.
  allocationExplorationFloorPct: 10,
  allocationWindowDays: 180,
  allocationAutoPropagate: true,
  // Cognitive Load & Attention Governor (Schema v34). Management conventions,
  // not psychological constants: the saturation index that enters the
  // saturated band (Sweller/Team Topologies), the Monte Carlo overload
  // probability that triggers a "few large threads" prompt, the per-person
  // throughput look-back window for Little/Kingman queue statistics, and the
  // post-commit propagation pause switch. The WIP convention itself reuses
  // `wipLimitPerPerson` so the Capacity and Load terminals share one setting.
  loadSaturationPct: 80,
  loadOverloadProbPct: 80,
  loadThroughputWindowWeeks: 8,
  loadAutoPropagate: true,
  // Premise Sentinel / Assumption Ledger (Schema v35). Management conventions,
  // not statistical laws: the posterior belief below which a premise enters
  // the watch band, the lower signpost-breach line, the evidence half-life
  // used by the log-Bayes-factor decay, and the signpost review cadence.
  // `premiseAutoPropagate` pauses governance fan-out only — sensing, belief
  // updates and typed links remain live, and an explicit scan always runs.
  premiseWatchPct: 55,
  premiseBreachPct: 30,
  premiseHalfLifeDays: 90,
  premiseReviewDays: 30,
  premiseAutoPropagate: true,
  // Operating System Dynamics (Schema v37). These are *model conventions*, not
  // empirical constants: the planning horizon the system is integrated over,
  // the number of weeks of capacity that counts as fully committed work, the
  // delay before sustained pressure shows up as errors and departures, how many
  // weeks of repair capacity outstanding quality debt represents, the ramp
  // window during which a hire consumes senior time, the structural-risk score
  // at which RULE-DYN-01 opens a decision, and the post-commit pause switch.
  // An explicit dynamics scan always runs.
  dynamicsHorizonWeeks: 26,
  dynamicsTargetWipWeeks: 4,
  dynamicsPressureLagWeeks: 3,
  dynamicsQualityFixWeeks: 6,
  dynamicsRampWeeks: 12,
  dynamicsStructuralRiskPct: 65,
  dynamicsAutoPropagate: true,
  // Structural Capital Allocation (Schema v38). The improvement budget the
  // leader is willing to spend on structural levers, measured in effort-weeks
  // — a *commitment*, not a measurement. The objective weights are conventions
  // too: they are normalised, shown on screen, and the raw deltas are always
  // reported beside the composite. `capitalAutoPropagate` pauses fan-out on
  // adoption only; an explicit capital event always runs.
  capitalEffortBudget: 12,
  capitalWeightSaturation: 0.35,
  capitalWeightThroughput: 0.25,
  capitalWeightCapacity: 0.2,
  capitalWeightWip: 0.2,
  capitalAutoPropagate: true,
  // Strategy Coherence (Schema v42). Management conventions, not laws:
  // `strategyGapThresholdPct` is the total-variation distance between declared
  // and measured resource shares above which RULE-SCO-02 opens a rebalancing
  // decision; `strategyBlindWipThresholdPct` is the share of post-strategy open
  // work that may sit under no bet at all before SCO-02 signals it;
  // `strategyDriftWindowDays` is the look-back for the recent-flow view, which
  // compares the direction of travel with the standing mix. `0` disables a
  // threshold check by pushing it out of range, which the UI states plainly.
  strategyGapThresholdPct: 20,
  strategyBlindWipThresholdPct: 40,
  strategyDriftWindowDays: 28,
  // After-Action Review & Learning Ledger (Schema v43). `retroWindowDays` is the
  // window in which a closure is expected to have been reviewed;
  // `retroDueDays` is how long after the close a review may sit before it is
  // late; `learningCoverageFloorPct` is the share of dated closures that should
  // carry a review before the app complains. `learningAutoDraft` drafts a review
  // the moment work closes (internal preparation only — it never writes a cause
  // or a lesson), and `learningAutoPropagate` pauses the derived delegations,
  // decisions and talking points without hiding any measurement.
  retroWindowDays: 90,
  retroDueDays: 14,
  learningCoverageFloorPct: 60,
  learningAutoDraft: true,
  learningAutoPropagate: true,
  // Early-Warning Watch. `watchQ` is the nominal BH-style step-up threshold,
  // not a guaranteed false-alert rate for these dependent repeated scans.
  // The budget is the number of alerts the leader will triage per window.
  watchQ: 0.1,
  watchAlertBudget: 4,
  watchWindowDays: 28,
  watchTriageDays: 5,
  watchCooldownDays: 14,
  watchAutoPropagate: true,
  // Selection & hiring conventions (Schema v17). The base rate is an explicit
  // assumption about how often a candidate who clears the bar succeeds — not a
  // validated constant — and the evidence floor is a convention, not a cutoff.
  hiringBaseRate: 0.45,
  hiringStallDays: 30,
  interviewHoursPerStage: 3,
  // Data minimisation (Schema v18). Candidate records are the most sensitive
  // thing this app holds and the least useful once a role is closed. This is a
  // *reminder* window, never a deletion timer: the app tells the leader which
  // records have outlived their usefulness and lets them decide. 0 disables it.
  candidateRetentionDays: 180,
  // Capacity & flow planning conventions (Schema v16). Hours are *focused*
  // hours per person per week: meetings and support are what the operational
  // reserve models, so counting them twice would overstate supply.
  capacityHoursPerWeek: 32,
  planningHorizonWeeks: 4,
  operationalLoadPct: 20,
  wipLimitPerPerson: 2,
  maxReportsPerManager: 8,
  // Seeded Monte Carlo portfolio & J-curve simulation conventions (Schema v20).
  // Fixed default seed makes every stochastic forecast reproducible across
  // sessions and machines; leaders can alter the seed or trial count anytime.
  simulationSeed: 42,
  simulationTrials: 1000,
  // Continuity-coupled ("all-weather") portfolio simulation conventions
  // (additive on Schema v43): management guardrails for when continuity shocks
  // degrade a feasible fair-weather plan enough to open a DACI tradeoff call.
  couplingMinFitPct: 50,
  couplingTailDropPct: 15,
  couplingAutoPropagate: true,
  // Schema v45: leader-continuity conventions. The window is how far ahead the
  // absence is simulated; the fit floor is the minimum recorded cover evidence
  // a deputy needs before a critical item may be handed to them. Both are
  // management conventions, not measured thresholds, and are printed in the UI.
  continuityHorizonDays: 14,
  continuityMinFitPct: 50,
  continuityAutoPropagate: true,
  // Schema v46: how often the stall model assumes ONE shared cause takes a whole
  // recorded team offline at the same time (a bug triage week, a flu, a shared
  // vendor). This is a stress convention, not a measured outage rate, and the
  // page prints it next to the independent model it replaces.
  continuityCommonCausePct: 25,
  continuitySecondShockPct: 10,
  // Schema v47: scorecard-integrity conventions. `measurementMetricCostPct` is
  // the declared value cost of maintaining one extra measured metric, so the
  // redesign search never treats measurement as free. The pause switch gates
  // every RULE-MTX propagation; an explicit scan still runs.
  measurementMetricCostPct: 2,
  measurementAutoPropagate: true,
  // Schema v51: merit & pay-equity conventions. Every one of these is printed
  // on the method card and is a declared management convention rather than a
  // measured constant: the replacement cost multiple of annual pay, the
  // unexplained-gap size (in percentage points) at which a mechanism decision is
  // opened, the four-fifths ratio used as a screen, the smallest group the
  // decomposition will fit, the relative-pay tolerance, the largest single
  // adjustment a policy may propose, the horizon for scoring a frozen retention
  // prediction, and the propagation pause switch. An explicit scan always runs.
  compReplacementMultiplier: 0.5,
  compEquityFlagPp: 5,
  compAdverseImpactRatio: 0.8,
  compMinGroupSize: 5,
  compCompressionTolerancePct: 3,
  compMaxAdjustPct: 20,
  compOutcomeReviewDays: 180,
  compAutoPropagate: true,
  // Schema v52: workforce transition conventions. Every one of these is printed
  // on the method card and is a declared management convention, not a legal
  // opinion: notice days, severance months per year of service and its cap, the
  // four-fifths floor for the selection screen, the smallest group the screen
  // will compare, the survivor load increase at which the plan opens work, the
  // horizon for scoring a frozen prediction, and the propagation pause switch.
  // This app is not a substitute for employment-law advice in any jurisdiction.
  transitionNoticeDays: 60,
  transitionSeveranceMonthsPerYear: 1,
  transitionSeveranceCapMonths: 6,
  transitionImpactRatio: 0.8,
  transitionMinGroupSize: 5,
  transitionSurvivorLoadPct: 40,
  transitionHorizonDays: 365,
  transitionAutoPropagate: true,
  // Schema v53: structural design conventions. A span band is a declared
  // supervisory convention (Graicunas 1933; Urwick 1956), not a law, and it is
  // configurable because a research pod and a shift floor do not share a number.
  // Coordination hours are the *declared* cost of one reporting channel per
  // week; the money figure is derived from recorded pay and is absent — never
  // zero — where no pay exists. `orgAutoPropagate` pauses the derived decisions,
  // tasks and talking points without hiding any measurement.
  orgSpanMin: 3,
  orgSpanMax: 8,
  orgCoordinationHoursPerWeek: 1,
  orgReviewHorizonDays: 120,
  orgAutoPropagate: true,
  // Schema v54: information-value conventions. EVPI is only allowed to open a
  // decision when it clears *both* a money floor and a share of the declared
  // stake, because a $300 question and a $3,000,000 question do not deserve the
  // same interruption. The concentration threshold is how many open frames may
  // rest on one premise before the portfolio is treated as one bet.
  voiBuyInfoThreshold: 2500,
  voiBuyInfoSharePct: 10,
  voiConcentrationThreshold: 3,
  voiNearTiePct: 5,
  voiReviewHorizonDays: 90,
  voiMinScoredFrames: 3,
  voiAutoPropagate: true,
  // Schema v55: Decision Portfolio Engine conventions. The portfolio review
  // interval is how often the engine checks for new coupling, dependency or
  // bottleneck signals (0 = only on demand). The carrying-cost threshold is
  // the weekly delay cost above which a portfolio triage decision is proposed
  // (0 = never auto-propose). Currencies are never summed across the threshold.
  portfolioReviewIntervalDays: 14,
  portfolioCarryCostThreshold: 0,
  portfolioAutoPropagate: true,
  // Schema v56: Leader Probability Calibration conventions. `lcalMinSamples`
  // is the count below which only counts are shown; `lcalVerdictSamples` is
  // the floor for a verdict (over/under/miscalibrated); `lcalOverconfidencePp`
  // is the signed calibration gap (in percentage points) that triggers an
  // overconfidence advisory on new frames.
  lcalMinSamples: 5,
  lcalVerdictSamples: 10,
  lcalOverconfidencePp: 10,
  lcalBadReliability: 0.08,
  lcalWarnReliability: 0.04,
  // Schema v57: Attention Market conventions. `attBudgetHours` is the leader's
  // own attention budget for one horizon — the single binding constraint the
  // optimisation runs against. `attHandoffSharePct` is the share of an item's
  // hours that a hand-off still costs the leader. `attMinSamples` is the floor
  // below which a success probability stays a prior. `attLeaderSharePct` is the
  // declared share of a record's TEAM effort estimate that lands on the leader;
  // it is the one derived hour in the module and it is printed beside every
  // figure it produced.
  attBudgetHours: 12,
  attHandoffSharePct: 25,
  attMinSamples: 4,
  attHorizonDays: 7,
  attLeaderSharePct: 10,
  attHoursPerEffortDay: 6,
  attMinRatioPerHour: 0,
  // Schema v59: Signal Path conventions. Every one of these is a *declared*
  // parameter of the channel model, printed beside the figure it produced.
  // `sigTransmitPct` is the probability that one relay forwards a material
  // signal it holds (the mum effect, Rosen & Tesser 1970); `sigFalseAlarmPct` is
  // the probability it raises an alarm with nothing behind it. Both compound in
  // series, which is why depth hurts twice. `sigBlindFloorPct` is the reach below
  // which a path is called blind; `sigExposureFloor` keeps a trivial case from
  // being linked to a material event class.
  sigTransmitPct: 78,
  sigFalseAlarmPct: 6,
  sigRelayLagDays: 5,
  sigCadenceTargetDays: 7,
  sigCadenceHoursPerHop: 0.5,
  sigSkipLevelPct: 70,
  sigSkipLevelFalsePct: 10,
  sigSkipLevelLagDays: 21,
  sigSkipLevelHoursPerWeek: 0.75,
  sigEscalationPct: 55,
  sigEscalationFalsePct: 14,
  sigEscalationLagDays: 1,
  sigEscalationHours: 2,
  sigReviewLiftPp: 8,
  sigReviewHoursPerHop: 1.5,
  sigMonitoringPct: 65,
  sigMonitoringFalsePct: 12,
  sigMonitoringLagDays: 1,
  sigMonitoringHours: 3,
  sigHourValue: 250,
  sigBlindFloorPct: 50,
  sigBlindDepth: 2,
  sigExposureFloor: 5000,
  sigUnderReachPp: 12,
  sigReviewHorizonDays: 90,
  sigMaxDepth: 8,
  sigAutoPropagate: true,
  // Schema v61: Coupled Load conventions. Every one of these is a *declared*
  // parameter of the coupling model, printed beside the figure it produced.
  // `couplingServiceDays` is the declared mean time one approval takes — it is
  // NOT derived from the decisions it prices, because that would be circular.
  // `couplingBottleneckActors` / `couplingBottleneckDecisions` are the two
  // readings of "shared bottleneck": an approver serving at least this many
  // distinct drivers, or this many decisions in the window, whichever fires.
  // `couplingWindowDays` bounds the arrival-rate look-back. `couplingAutoPropagate`
  // pauses the derived decisions and delegations without hiding any measurement;
  // an explicit scan always runs.
  couplingBottleneckActors: 3,
  couplingBottleneckDecisions: 6,
  couplingHandoffMaxChain: 3,
  couplingDelayThresholdDays: 10,
  couplingMultiplierThreshold: 3,
  couplingServiceDays: 3,
  couplingWindowDays: 30,
  couplingMinObligations: 2,
  // Schema v62: the Coupled Load rule has its own pause. Schema v61 reused
  // `couplingAutoPropagate`, which already belonged to the continuity-coupling
  // module, so pausing one silently paused the other.
  coupledLoadAutoPropagate: true,
  // Schema v62: Performance Recovery conventions. These are declared
  // thresholds, printed beside the refusal or figure each one causes.
  // `perfMinObservations` and the evidence window decide when a record can
  // support a formal plan; `perfSbiFloor` is the minimum specificity an
  // observation needs to be answerable; the rest price the gap.
  perfMinObservations: 3,
  perfEvidenceWindowDays: 90,
  perfReviewHorizonDays: 45,
  perfStaleDays: 14,
  perfReplacementMonths: 4,
  perfEmployerLoadPct: 25,
  perfWorkdaysPerYear: 220,
  perfHourValue: 250,
  perfSbiFloor: 3,
  perfAutoPropagate: true,
  // Schema v63: Delivery Survival conventions. `survHorizonDays` is the forward
  // window the per-item reading is about; `survMinAtRisk` is the number of
  // comparable items that must still be at risk before a conditional
  // probability is printed at all; `survRiskFloorPct` is where a frozen
  // probability becomes owned work; `survAbandonSharePct` is the share of exits
  // that must be abandonments before the *class* (not the item) becomes a
  // decision; `survBiasFloor` is the minimum number of paired declared/actual
  // effort figures before a planning-fallacy ratio is printed; `survHazardBuckets`
  // is a comma-separated set of elapsed-day boundaries for the empirical hazard.
  survHorizonDays: 14,
  survMinAtRisk: 4,
  survRiskFloorPct: 35,
  survAbandonSharePct: 30,
  survStaleDays: 14,
  survBiasFloor: 4,
  survMaxPredictions: 40,
  survHazardBuckets: '7,30',
  survAutoPropagate: true,
  // Schema v64: Cost of Waiting conventions. `waitErosionWeeks` spreads a
  // decision's value at stake into a weekly carrying cost (linear
  // cost-of-delay profile); `waitScenarioWeeks` are the "wait N more weeks"
  // simulation horizons; `waitTriageThreshold` is the weekly overdue priced
  // exposure per currency above which one triage decision opens (0 = any
  // priced overdue exposure, safe because nothing is priced until declared);
  // the rest bound confidence, task, link and certificate caps.
  waitErosionWeeks: 12,
  waitScenarioWeeks: '1,2,4,8',
  waitTriageThreshold: 0,
  waitConfidenceFloor: 5,
  waitMaxTasksPerScan: 5,
  waitMaxPriceTasks: 3,
  waitMaxLinks: 40,
  waitExposureCap: 60,
  waitAutoPropagate: true,
  // Schema v65: Leadership Parity & Standard Consistency conventions.
  // `parityWindowDays` is the rolling measurement window; `parityMinTeam` is
  // the post-ramp headcount floor below which Gini/Atkinson/Theil indices are
  // refused; `parityRampFloorDays` protects recent joiners from deficit flags;
  // `parityGiniWarn` and `parityPromiseGapWarnPp` are declared management
  // conventions printed on the Method tab, never legal standards.
  parityWindowDays: 90,
  parityMinTeam: 4,
  parityRampFloorDays: 30,
  parityGiniWarn: 0.42,
  parityPromiseGapWarnPp: 30,
  parityReviewHorizonDays: 28,
  parityMaxTasksPerScan: 4,
  parityAuditCap: 60,
  parityAutoPropagate: true,
  // Schema v66: Evidence Terminal conventions. `evidenceMinPoolStudies` is the
  // number of pre-registered studies in one (intervention × outcome) cell
  // before the terminal will pool it at all; `evidenceMinHeterogeneity` is the
  // count before τ²/I² are printed; `evidenceMinEggerStudies` gates Egger's
  // intercept test because below ten studies it tests nothing. All are
  // declared conventions printed on the Method tab, not statistical law.
  evidenceMinPoolStudies: 3,
  evidenceMinHeterogeneity: 4,
  evidenceMinEggerStudies: 10,
  evidenceMinResolutions: 6,
  evidenceHorizonDecisions: 6,
  evidenceExploreWeight: 1,
  evidenceAlpha: 0.1,
  evidenceReviewDays: 30,
  evidenceMaxTasksPerScan: 3,
  evidenceMaxCaseLinks: 5,
  evidenceReviewCap: 40,
  evidenceAutoPropagate: true,
  // Schema v67: a coordination threshold, not an automatic decision; a
  // read-side evidence floor that refuses thin or extrapolated curves.
  consequenceTriageWeekly: 1000,
  consequenceMinExits: 3,
  consequenceMaxLinks: 12,
  consequenceReviewCap: 60,
  consequenceAutoPropagate: true,
  // Schema v68: the Deferral Option Terminal's declared conventions. The
  // volatility floor, observation floor and materiality band are labelled
  // conventions, not validated constants.
  deferralMinObservations: 5,
  deferralSigmaFloorPct: 5,
  deferralSteps: 200,
  deferralDiscountPct: 0,
  deferralMaxHorizonDays: 180,
  deferralWatchBandPct: 10,
  deferralMaterialityPct: 1,
  deferralReviewCap: 40,
  deferralAutoPropagate: true,
  // Schema v69: the Deferral Portfolio's declared conventions. Paths, seed,
  // tail level, member cap, concentration convention and the joint-lapse
  // alert band are labelled conventions, not validated constants.
  deferralPortfolioAutoPropagate: true,
  deferralPortfolioMaxMembers: 6,
  deferralPortfolioPaths: 4000,
  deferralPortfolioSeed: 20261031,
  deferralPortfolioGridDays: 1,
  deferralPortfolioTailPct: 90,
  deferralPortfolioConcentrationPct: 60,
  deferralPortfolioJointLapsePp: 10,
  deferralPortfolioReviewCap: 20,
  // Schema v70: the Signal Integrity Board's declared conventions. The alpha is
  // a family-wise error rate, the look plan is what alpha is spent across, and
  // the ρ is a DECLARED positive-dependence convention for the effective number
  // of tests — never an estimate, because a leadership record cannot identify
  // the dependence between its own detectors.
  integrityAutoPropagate: true,
  integrityAlphaPct: 10,
  integrityPlannedLooks: 12,
  integritySpending: 'pocock',
  integrityRhoPct: 30,
  integrityPrecisionFloorPct: 60,
  integrityMinVerdicts: 4,
  integritySpendWarnPct: 80,
  integrityLooksWarnPct: 20,
  integritySurpriseBrier: 0.25,
  integrityHorizonAlerts: 6,
  integrityReviewCap: 20,
  integrityLookCap: 240,
  integrityVerdictCap: 600,
  // Schema v71: the Borrowed Evidence Engine's declared conventions. The
  // decisive probability is the posterior probability a borrowed verdict must
  // reach; the floors are the rates a leader considers acceptable for each
  // group (the detector floor is the Signal Integrity Board's own, read from
  // `integrityPrecisionFloorPct`, so the two modules share one bar).
  credibilityAutoPropagate: true,
  credibilityDecisivePct: 95,
  credibilityMinUnitN: 4,
  credibilityHeterogeneityAlphaPct: 5,
  credibilityI2WarnPct: 50,
  credibilityInfluenceTolerancePct: 15,
  credibilityMinUnits: 3,
  credibilityMinObservations: 8,
  credibilityHorizonN: 8,
  credibilityReviewDays: 28,
  credibilitySkillFloor: 6,
  credibilitySurpriseBrier: 0.25,
  credibilityPremiseFloorPct: 70,
  credibilityDelegationFloorPct: 70,
  credibilityCheckpointDays: 21,
  // Schema v72: Confidence Transport conventions. The floors are deliberately
  // high — a calibration map is only allowed to speak once the record can
  // identify one, and a gain has to be material and separable from noise.
  // Schema v73: Response Studio follow-up is pauseable; provenance is not.
  responseAutoPropagate: true,
  bundleAutoPropagate: true,
  // ADR-0106: evidence-based execution reconciliation is automatic; an explicit
  // scan still works while paused. It never invents a human outcome.
  executionAutoReconcile: true,
  settlementAutoPropagate: true,
  settlementFidelityFloorPct: 75,
  settlementStaleDays: 7,
  // Schema v76: the Counterfactual Policy Terminal. The minimum decision-point
  // count and the materiality band gate every estimate; the robustness bar is
  // the hidden-bias magnitude a finding must survive before it is called
  // supported rather than merely suggestive.
  counterfactualAutoPropagate: true,
  counterfactualMinUnits: 12,
  counterfactualMaterialityPp: 3,
  counterfactualRobustGamma: 2,
  // Schema v77: the Measurement Reliability Terminal. The evidence floor and the
  // two separation bars are the leader's declared conventions, not statistics:
  // `reliabilityIccFloorPct` asks whether the instrument carries signal at all,
  // `reliabilitySeparationPct` how sure a pair-level call must be, and
  // `reliabilityTargetReliabilityPct` is the reliability a decision study aims at.
  // Schema v79: the Evidence Supply Chain. `supplyWindowDays` is the window the
  // arrival rate is measured over, `supplyHorizonDays` the horizon a line must
  // fill inside to count as healthy, `supplyMinutesPerUnit` the leader cost of
  // manufacturing one more unit (the one input the engine cannot derive) and
  // `supplyRequired` the per-line count the consuming instrument needs.
  supplyAutoPropagate: true,
  supplyWindowDays: 180,
  supplyHorizonDays: 56,
  supplyStarvePct: 50,
  supplyBottleneckPct: 40,
  supplyWeeklyHours: 3,
  supplyAbandonDays: 120,
  supplyCaptureRatio: 1,
  supplyPlanCap: 12,
  supplyReviewHorizonDays: 60,
  supplyMaxTasks: 3,
  supplyMinutesPerUnit: {},
  supplyRequired: {},
  // Schema v82: the Command Chain. `chainLeaderAltitude` is the one structural input
  // the engine cannot derive — the workspace leader holds no roster record, so there
  // is no title to read and inferring one from their reports' levels would be
  // inventing a job. The rest are declared conventions: the evidence floor below
  // which a rate is withheld, the materiality bar at which a pooled rate and a mean
  // of unit rates disagree by enough to matter, the drift bar above which the
  // leader's own mix is reported, the span band, and the horizon a frozen reading
  // waits before it can be graded.
  chainAutoPropagate: true,
  chainLeaderAltitude: 'frontline',
  chainFloorN: 4,
  chainDriftPct: 40,
  chainSpanMin: 3,
  chainSpanMax: 8,
  chainMaterialityPp: 5,
  chainWindowDays: 365,
  chainReviewHorizonDays: 60,
  // ADR-0100: the Discretion Calibrator's conventions. `chainAdoptedHorizons` is
  // the one place a human-adopted ladder lives: null means the declared table is
  // in force. The rest are the coverage promise, the floors that refuse a rung,
  // the interval width that makes a verdict meaningless, and the bands an
  // adoption may move a span within.
  spanCalibrationCoveragePct: 85,
  spanCalibrationDecidedFloor: 8,
  spanCalibrationCensoringPct: 60,
  spanCalibrationRiskFloor: 3,
  spanCalibrationCellFloor: 3,
  spanCalibrationMaxWidthPct: 45,
  spanCalibrationReviewDays: 90,
  spanCalibrationAdoptMinPct: 25,
  spanCalibrationAdoptMaxPct: 400,
  spanCalibrationBandPct: 90,
  spanCalibrationAutoPropagate: true,
  chainAdoptedHorizons: null,
  chainAdoptedOn: null,
  chainAdoptedReadingId: null,
  chainMaxTasks: 3,
  chainReadingCap: 16,
  chainMaxDepth: 7,
  // Schema v80: the Promise Solvency Terminal. `solvencyWindowDays` is the window
  // the settlement history is measured over, `solvencyHorizonDays` the horizon a
  // promise is priced inside, `solvencyRhoPct` the DECLARED single-factor
  // correlation that decides how much promises break together, `solvencyAlarmPct`
  // the share of the forward book allowed to be expected to break, and
  // `solvencyOnTimeBarPct` / `solvencyMinHistory` the bar and floor a source must
  // clear before its own record may price anything.
  solvencyAutoPropagate: true,
  solvencyWindowDays: 180,
  solvencyHorizonDays: 56,
  solvencyRhoPct: 30,
  solvencyAlarmPct: 30,
  solvencyOnTimeBarPct: 80,
  solvencyMinHistory: 5,
  solvencyBreachMultiplier: 3,
  solvencyReviewHorizonDays: 60,
  solvencyReadingCap: 12,
  solvencyMaxTasks: 3,
  solvencyMaxMoves: 2,
  solvencyAllowPooling: true,
  // Schema v81: the Cross-Examination Terminal. `scepticTolerancePct` is the share
  // of a family's scored claims that may be refuted before the family counts as
  // failing, `scepticMinScored` the scored claims a family needs before any rate
  // is quoted at all, `scepticDismissalCapPct` the share of this terminal's own
  // findings that may be dismissed before the auditor is put on the record, and
  // `scepticWindowDays` the window the capacity claim is measured over.
  scepticAutoPropagate: true,
  scepticWindowDays: 120,
  scepticTolerancePct: 25,
  scepticMinScored: 4,
  scepticMaxTasks: 3,
  scepticDismissalCapPct: 50,
  scepticReviewHorizonDays: 45,
  scepticRoundCap: 10,
  // Schema v83: the Succession Terminal. `successionConcentrationCapPct` is the
  // share of a span's dated work that may sit behind one holder before the span is
  // called concentrated; `successionMemberFloor` and `successionItemFloor` are the
  // floors below which no span is quoted at all; `successionHeadroomFactor` is the
  // declared multiple of the span's median load a survivor may reach (the overload
  // rule the flow test depends on); `successionTestedFloor` is the number of
  // recorded handovers a span needs before its measured rate replaces the
  // assumption-free estimate; `successionDailyCosts` and
  // `successionTestedHandovers` are the leader's own declarations, normalised
  // fail-closed and dropped when the person leaves the roster.
  successionAutoPropagate: true,
  successionHorizonDays: 365,
  successionConcentrationCapPct: 40,
  successionMemberFloor: 3,
  successionItemFloor: 3,
  successionHeadroomFactor: 1.5,
  successionDiffusionFloor: 5,
  successionMaxTasks: 2,
  successionTestedFloor: 4,
  successionReviewHorizonDays: 60,
  successionReadingCap: 12,
  successionDailyCosts: {},
  successionTestedHandovers: {},
  // ADR-0078: automatic reconciliation of existing authority contracts.
  mandateAutoPropagate: true,
  // Schema v78: the Coupling Ledger. `couplingBlockDays` is the calendar grain a
  // coincidence is measured on, `couplingMinPairs` and
  // `couplingMinExpectedCollisions` are the floors below which a band prints no
  // verdict, and `couplingLiftTolerancePct` is how far from 1 a lift must sit
  // before "the record looks independent" becomes "the record disagrees".
  couplingLedgerAutoPropagate: true,
  couplingBlockDays: 30,
  couplingMinPairs: 4,
  couplingMinExpectedCollisions: 1,
  couplingAlphaPct: 5,
  couplingLiftTolerancePct: 25,
  couplingRotations: 1000,
  couplingReviewHorizonDays: 90,
  couplingReviewCap: 20,
  reliabilityAutoPropagate: true,
  reliabilityMinPersons: 4,
  reliabilityIccFloorPct: 50,
  reliabilitySeparationPct: 90,
  reliabilityTargetReliabilityPct: 80,
  confidenceAutoPropagate: true,
  confidenceMinSamples: 24,
  confidenceMinTrain: 12,
  confidenceMinScored: 16,
  confidenceMaterialBrierPct: 50,
  confidenceGapPct: 15,
  confidenceReviewDays: 42,
  confidenceSkillFloor: 4,
  confidenceShortDays: 14,
  confidenceLongDays: 60,
  confidenceBins: 10,
  confidenceBootstrap: 800,
  confidenceLiveCap: 6,
  confidenceTaskCap: 5,
  // Aggregates (including comments) are suppressed below this many responses.
  // Survey vendors publish floors between 3 and 10; 5 is the most common
  // default (Culture Amp, 15Five); 3 is a documented vendor minimum, not
  // an anonymity guarantee. Five is the default here.
  pulseMinResponses: 5,
  // Idle auto-lock: only meaningful for an encrypted workspace. 0 disables
  // it. An unlocked tab holding sensitive notes is the one situation the
  // passphrase does not protect against, so a sensible locked-by-default
  // window is provided and can be turned off in Settings.
  idleLockMinutes: 30,
  // ADR-0076: the Operating Seat. `activeSeatId === null` is the undeclared
  // single-operator view (full access, no filtering) — the pre-0076 behaviour,
  // preserved. Declaring a seat turns on enforced, altitude-aware access and
  // automatic vertical roll-up. Every other key is a declared convention with
  // a bounded, fail-closed default. See docs/adr/0076-operating-seat.md.
  activeSeatId: null,
  seatAutoPropagate: true,
  seatFloorN: 4,
  missionCellFloor: 5,
  // ADR-0081: The Altitude Router — declared conventions, all clamped.
  routingEvidenceFloor: 2.5,
  routingReliabilityFloorPct: 70,
  routingCalibrationFloorN: 5,
  routingReviewDays: 14,
  routingAutoPropagate: true,
  // ADR-0084: Hoshin Kanri & Catchball Cascade — declared conventions, clamped.
  catchballWatermelonGapPct: 25,
  catchballLeadingFloorPct: 80,
  catchballLaggingFloorPct: 70,
  catchballThesisRedPct: 35,
  catchballFloorN: 5,
  catchballReliabilityFloorPct: 70,
  catchballCellFloor: 3,
  catchballMaxFanout: 4,
  catchballAutoPropagate: true,
  // ADR-0089: Strategy Renewal evidence, suppression and propagation conventions.
  strategyCycleEvidenceFloor: 5,
  strategyCycleCellFloor: 3,
  strategyCycleAutoPropagate: true,
  // ADR-0090: the Programme Federation Reading. `federationWindowDays` is the
  // window a declared edge's carriage is measured over; `federationMinSpans` is
  // the span floor below which a coverage rate is REFUSED rather than printed.
  federationWindowDays: 30,
  federationMinSpans: 5,
  federationCellFloor: 3,
  federationAutoPropagate: true,
  // ADR-0092: the Differencing Defender. `differencesCellFloor` is the small-cell
  // floor the publication planner suppresses against; `differencesWindowReleases`
  // is how many prior releases of a module an audit reasons over;
  // `differencesMinPoints` is the drift floor below which a trend is REFUSED
  // rather than printed.
  differencesCellFloor: 3,
  differencesWindowReleases: 12,
  differencesMinPoints: 8,
  differencesAutoProtect: true,
  differencesAutoPropagate: true,
  // ADR-0088: The Escalation Economy — declared conventions, all clamped. The
  // hourly rates are a DECLARED costing convention for the escalation tax,
  // never an audit of anyone's pay.
  escalationFloorN: 5,
  escalationCellFloor: 5,
  escalationWindowDays: 90,
  escalationYieldFloorPct: 20,
  escalationRateRedPct: 60,
  escalationUtilisationRedPct: 85,
  escalationServiceRatePerWeek: 8,
  escalationServiceScv: 1.25,
  escalationContextLossPerRungPct: 15,
  escalationReturnDays: 10,
  escalationReviewDays: 14,
  escalationHoursPerEscalation: 2.5,
  escalationCurrency: 'USD',
  escalationRateFrontline: 40,
  escalationRateManager: 65,
  escalationRateDirector: 100,
  escalationRateExec: 160,
  escalationRateChief: 250,
  escalationAutoPropagate: true,
  // ADR-0085: the Operating Cadence Clock — declared conventions, clamped on read.
  // ADR-0089: Value Stream Exchange — disclosure and bounded governance.
  valueStreamCellFloor: 3,
  valueStreamMaxDecisions: 4,
  valueStreamAutoPropagate: true,
  // ADR-0087: the Operating Cadence Clock — declared conventions, clamped on read.
  // `cadenceUtilisationTargetPct` is the ρ the calendar is planned against; the
  // planning factor and flow target are named conventions, never fitted.
  cadenceFloorN: 5,
  cadenceCellFloor: 3,
  cadenceUtilisationTargetPct: 85,
  cadencePlanningFactorPct: 130,
  cadenceFlowTargetDays: 14,
  cadenceAutoPropagate: true,
  // ADR-0088: the Federated Envoy — declared conventions, all clamped.
  envoyMaxItems: 60,
  envoyRequireKeyedSignature: true,
  envoyDivergenceReviewDays: 14,
  envoyAttestationRiskFloorPct: 25,
  envoyAutoPropagate: true,
  // ADR-0083: The Concordance Terminal — declared conventions, all clamped.
  concordanceAgreementFloorPct: 60,
  concordanceCellFloor: 5,
  concordanceEvidenceFloor: 3,
  concordanceRetestDays: 21,
  concordanceReviewDays: 14,
  concordanceAutoPropagate: true,
  // ADR-0086: the disclosure compiler's conventions. The cell floor is the
  // small-cell floor the aggregate withholds below; a release may never run
  // longer than 30 days or exceed the per-seat cap, whatever is declared here.
  disclosureCellFloor: 5,
  disclosureMaxDays: 30,
  disclosureMaxActiveGrants: 6,
  disclosureReviewDays: 14,
  disclosureAutoPropagate: true,
  // ADR-0085: the Board Room — declared conventions, all clamped.
  boardCellFloor: 5,
  boardEvidenceFloor: 4,
  boardMaterialityPct: 10,
  boardRecheckDays: 90,
  boardAutoPropagate: true,
  // ADR-0087: The Attested Commit — declared conventions, all clamped.
  // Opt-in like the seal: an unenrolled workspace is byte-for-byte unchanged.
  identityEnabled: false,
  identityAutoPropagate: true,
  identityEnforced: false,
  identityIdleMins: 30,
  seatMaterialityPp: 5,
  seatWindowDays: 90,
  seatMaxLinks: 24,
  seatLedgerOpen: true,
  // ADR-0094: the Prospective Intervention Contract. `prospectiveEvidenceFloor`
  // is the cohort floor below which a grade is REFUSED; `prospectiveCellFloor`
  // suppresses a calibration cell; `prospectiveSkillFloorPct` is the Brier-skill
  // floor that opens a governed calibration decision; `prospectiveReviewDays`
  // bounds the outcome-integrity window. All are clamped on read, never trusted
  // from storage, and every one is a DECLARED convention, never fitted history.
  prospectiveEvidenceFloor: 3,
  prospectiveCellFloor: 4,
  prospectiveSkillFloorPct: 10,
  prospectiveReviewDays: 14,
  prospectiveAutoPropagate: true,
  // ADR-0095: the Robust Allocation Terminal. `robustAllocationCellFloor`
  // suppresses a roll-up altitude row; `robustAllocationReviewDays` bounds the
  // delivery/evidence-integrity window; `robustAllocationMaxCombinations` is the
  // exact-solver grid bound (an over-cap plan is refused, never approximated).
  // All are clamped on read and every one is a DECLARED convention.
  robustAllocationCellFloor: 4,
  robustAllocationReviewDays: 14,
  robustAllocationAutoPropagate: true,
  robustAllocationMaxCombinations: 50000,
  // ADR-0098: Internal Clearinghouse conventions. These are declared
  // governance bounds, not fitted history: they determine when a small cell,
  // an overdue settlement or a resource-mix imbalance may speak upward.
  clearingCellFloor: 3,
  clearingReviewDays: 14,
  clearingAutoPropagate: true,
  clearingMaxCombinations: 250000,
  clearingNodeBudget: 350000,
  clearingMixImbalanceHighPct: 85,
  clearingMixImbalanceLowPct: 50,
  // ADR-0099: the Freeze-Line Continuity Audit. `freezeLineWindowDays` is the
  // window measured on EACH side of a freeze line; `freezeLineMinEdges` is the
  // edge floor below which a verdict is REFUSED; `freezeLineCellFloor` is the
  // small-cell floor for altitude cells; `freezeLineDropPct` is the connected-
  // share drop that makes a line `degraded`.
  freezeLineWindowDays: 30,
  freezeLineMinEdges: 3,
  freezeLineCellFloor: 3,
  freezeLineDropPct: 15,
  freezeLineAutoPropagate: true,
  // ADR-0102: the Hindsight Lock. `hindsightQualityFloor` is the frozen record
  // quality (of 5) at or above which the process axis counts as sound;
  // `hindsightCoveragePct` is the share of the knowable set a decision must have
  // consulted; `hindsightFactFloor` refuses a coverage rate below that many dated
  // facts; `hindsightGapFloor` bounds when a missed-fact finding is worth
  // opening; `hindsightSettledFloor` refuses a resulting share and a p-value
  // below that many graded decisions; `hindsightCellFloor` is the small-cell
  // floor; `hindsightReviewGraceDays` is how long after its own review date a
  // decision may stay ungraded before the spine asks once a week.
  hindsightQualityFloor: 4,
  hindsightCoveragePct: 60,
  hindsightFactFloor: 3,
  hindsightGapFloor: 2,
  hindsightSettledFloor: 8,
  hindsightCellFloor: 3,
  hindsightReviewGraceDays: 14,
  hindsightAutoPropagate: true,
  // ADR-0103: the Epistemic Ledger. `epistemicWindowDays` is how far back the
  // harvest reads the record; `epistemicEscalateDays` is the age at which an
  // unopened danger/defect signal opens one governed decision; `epistemicExpiryDays`
  // is the declared, evidence-bound expiry stamped on every harvested unknown;
  // `epistemicAnswerFloor` refuses an answer rate below that many closed unknowns;
  // `epistemicPairFloor` refuses a kappa and the four-cell table below that many
  // paired beliefs; `epistemicCellFloor` is both the small-cell floor and the
  // measurability floor for a blind class; `epistemicBlindFloor` and
  // `epistemicBlindDarkPct` are the two declared coverage bands; and
  // `epistemicReviewDays` is the horizon on every governed finding it opens.
  epistemicWindowDays: 90,
  epistemicEscalateDays: 14,
  epistemicExpiryDays: 30,
  epistemicAnswerFloor: 5,
  epistemicPairFloor: 8,
  epistemicCellFloor: 3,
  epistemicBlindFloor: 55,
  epistemicBlindDarkPct: 5,
  epistemicReviewDays: 14,
  // ADR-0117: the bounded backlog policy — how many RULE-EPI-02 escalations
  // one owning span may open per ISO week. The over-budget remainder stays
  // queued and is printed (count + renewal week), never silently dropped.
  epistemicEscalateMaxPerWeek: 5,
  epistemicAutoPropagate: true,
  // ADR-0104: the Diligence Ledger. `diligenceKnowableFloor` refuses a coverage
  // rate below that many frozen knowable facts; `diligenceCoverageFloorPct` is
  // the declared diligence floor whose breach opens ONE governed gap decision
  // per span per ISO week; `diligenceClassFloor` refuses a Jeffreys interval
  // below that many facts in a class; `diligenceDarkCeilingPct` declares a class
  // dark when its WHOLE 90% credible upper bound sits below it;
  // `diligenceForecastHorizonDays` bounds the out-of-sample grading window;
  // `diligenceReviewDays` is the review horizon on every governed finding; and
  // `diligenceStaleDays` stops a pending decision from ever being "graded" by
  // an outcome that never arrived. All conventions are printed, never fitted.
  diligenceKnowableFloor: 8,
  diligenceCoverageFloorPct: 70,
  diligenceClassFloor: 6,
  diligenceDarkCeilingPct: 30,
  // A Brier grade needs at least this many scoreable claims. A forecast can
  // declare at most five evidence classes plus one coverage claim, so this
  // floor is deliberately separate from the knowable-facts floor.
  diligenceGradeClaimFloor: 3,
  diligenceForecastHorizonDays: 45,
  diligenceReviewDays: 14,
  diligenceStaleDays: 90,
  diligenceAutoPropagate: true,
  // ADR-0103: the epistemic ledger's own floors are read back by the view so a
  // refused rate always prints the convention that refused it.
  // ADR-0107/0108/0109: the declared, clamped conventions for the Outcome
  // Learning Loop, the Decision-Fit Ledger and the Jurisdiction Compiler. These
  // live in DEFAULT_SETTINGS (not only in the forecast-source lookup) so a fresh
  // workspace's settings object is complete before its first normalize; every
  // figure still comes from the module's own clamped normalizer on read.
  ...OUTCOME_SETTINGS_DEFAULTS,
  ...FIT_SETTINGS_DEFAULTS,
  ...JUR_SETTINGS_DEFAULTS,
  // ADR-0113: the 1:1 agenda provenance ledger's declared conventions — the
  // receipt floor below which no rate prints, and the age at which an unfiled-
  // but-still-open filed line reads as stale. Printed, never fitted.
  ...AGENDA_SETTINGS_DEFAULTS,
  // ADR-0121: the duty-coverage conventions — the window inside which recorded
  // work counts as evidence a stand-in's access is real, and the share above
  // which one hand doing a duty's work reads as a single point of failure.
  ...normalizeDutyCoverageSettings({}),
  // ADR-0127: cover acknowledgement — how many days a named cover has to answer
  // before the ask reads OVERDUE rather than "waiting", and how far ahead the
  // bounded standby window runs when the duty holder has declared no dated
  // absence. Both printed, both clamped, both re-declarable by the same rank-4+/
  // full-access seat that declares the register's other conventions.
  ...normalizeDutyStandbySettings({}, DUTY_STANDBY_BOUNDS, DUTY_STANDBY_DEFAULTS),
  // ADR-0143: the priority-arbitration conventions — the window an agreed
  // precedence runs for, the day it comes back for review, and the declared
  // capacity ceiling a set of sequenced demands is measured against. All three
  // are printed on the Method panel and re-declarable only by a rank-4+
  // full-access seat; none is fitted from the record.
  ...normalizePrioritySettings({}),
  // ADR-0144: the contradiction-audit conventions — the utilisation above which
  // the queueing coupling reads incompatible, the incentive weight below which
  // an opposite-direction pair is immaterial, and the horizon an accepted
  // contradiction comes back on. All are clamped, printed and re-declarable only
  // by a rank-4+ full-access seat; none is fitted from the record.
  ...normalizeContradictionSettings({}),
  // ADR-0147: the review-stewardship conventions — how many days a line holder
  // has to answer an ask before it reads OVERDUE, and whether the stewardship
  // panel opens on the board rather than the first packet. Both printed, both
  // clamped, neither fitted from the record.
  ...normalizeReviewStewardshipSettings({}),
  // ADR-0148: the line-consent conventions — how long an acceptance stands
  // before it must be re-affirmed, how long a line's manager has to answer the
  // ask the rule issues, and how long the person has to acknowledge an
  // acceptance before they are chased. All three printed, all three clamped,
  // none fitted from the record.
  ...normalizeLineConsentSettings({}),
  // ADR-0149: the structure-history convention — how many days after a home-line
  // move the reader keeps drawing attention to it. Clamped, printed, and never
  // fitted from the record.
  ...normalizeStructureHistorySettings({}),
  // ADR-0150: the matrix-onboarding windows — how long a line has to write its
  // brief after the plan starts, and how long a standing brief may go
  // unacknowledged by the person before it reads overdue. Both printed, both
  // clamped, neither fitted from the record.
  ...normalizeOnboardingMatrixSettings({}),
  // ADR-0151: the assessment-reconciliation conventions — the character floor
  // below which an answer reads thin, the ratio above which a thin line beside
  // a substantive one triggers a calibration prompt, and the signal steps that
  // count as divergence. All three printed, all three clamped, none fitted.
  ...normalizeAssessmentReconciliationSettings({}),
  // ADR-0152: the line-exit convention — how many days the manager of an ended
  // line has to settle the obligations it left open. Printed, clamped, never
  // fitted from the record.
  ...normalizeLineExitSettings({}),
  // ADR-0157: the line re-affirmation conventions — how long a re-affirmed term
  // runs by default, how far ahead of its end the question opens, and how long a
  // line's manager has to answer the ask the rule issues. All three printed, all
  // three clamped, none fitted from the record.
  ...normalizeLineReaffirmationSettings({}),
  // ADR-0159: frozen authority re-affirmation due window + automation pause.
  ...normalizeAuthorityReaffirmationSettings({}),
  // ADR-0162: management-interface agreement term, warning window, review ask window + pause.
  ...normalizeMatrixInterfaceSettings({}),
  // ADR-0174: standing delegation-of-authority ratification due window + automation pause.
  ...normalizeDoaSettings({}),
  // Matrix 1:1 coverage: explicit defaults, with no inferred historical holders.
  ...normalizeOneOnOneLineSettings({}),
  ...normalizeHiringLineSettings({}),
  // ADR-0177: transfer-price ask window + automation pause.
  ...normalizeTransferPriceSettings({}),
  // ADR-0178: cross-line ask budget, due window and automation pause.
  ...normalizeDelegationLineSettings({}),
  // ADR-0181: work-turn look-back window, floor, over-turn threshold, ask
  // window and automation pause.
  ...normalizeWorkTurnSettings({}),
  ...normalizePausePermitSettings({}),
  // ADR-0184: stock-flow observation window, projection horizon, exposure floor,
  // ask window and automation pause.
  ...normalizeWorkforceFlowSettings({}),
  // ADR-0186: the saturation read window, the pool disclosure floor, the ask
  // window and the automation pause. NO capacity default: a ceiling is a human
  // declaration, so an unset one stays unset and the register prints the refusal.
  ...normalizeChangeSaturationSettings({}),
  // ADR-0187: dependency-cycle ask window and automation pause (Schema v148 unchanged).
  ...normalizeDependencyCycleSettings({}),
  // ADR-0188: corroboration escalation window, the coverage disclosure floor, the
  // adoption-parity window and the automation pause. No corroboration default:
  // nothing here implies that a line agreed to anything.
  ...normalizeAarCorroborationSettings({}),
  // ADR-0189: the alignment dependency window, the ask window and the
  // automation pause. No channel default: a channel is a human agreement.
  ...normalizeInterfaceAlignmentSettings({}),
  // ADR-0190: leader standard work conventions (window, slot floor, lapse run,
  // tier window, working week, automation switch).
  ...normalizeStandardWorkSettings({}),
});

export const COLLECTIONS = [
  'people',
  'onboarding',
  'managerSupport',
  'oneOnOnes',
  'feedback',
  'goals',
  'delegations',
  'conflicts',
  'growthPlans',
  'pulses',
  'decisions',
  'recognition',
  'readiness',
  'reviews',
  'cases',
  'requisitions',
  'candidates',
  'changes',
  'negotiations',
  'budgets',
  'stakeholders',
  'forecastChallenges',
  'intakeDrafts',
  'tempoSchedules',
  // Schema v86: observed departures and declared retention plans.
  'departures',
  'retentionPlans',
  'dependencies',
  'powerGames',
  'impactStudies',
  'commsDrafts',
  'premises',
  'premiseOutcomes',
  // Schema v37: named structural policy experiments (Operating System Dynamics).
  // Only the *inputs* are stored. Every trajectory is derived live from the
  // records, so a simulation can never drift away from the data it describes.
  'dynamicsExperiments',
  // Schema v38: a funded structural portfolio and the out-of-sample checkpoint
  // that grades the prediction frozen at adoption.
  'capitalPolicies',
  'dynamicsCheckpoints',
  // Schema v39: the Early-Warning Watch. `watchAlerts` is an append-only
  // ledger of every candidate the scan produced — promoted AND suppressed —
  // plus the one-way human verdict on each. `watchForecasts` is the frozen
  // prediction ledger that grades the detector out of sample. Only the frozen
  // numbers are stored; skill is re-derived at read time from the series, so a
  // stored figure can never drift from the data it describes.
  'watchAlerts',
  'watchForecasts',
  // Schema v41: one record per failed post-commit rule invocation. Holds the
  // event that triggered it, the rule, the error and a bounded retry history.
  'propagationReceipts',
  // Schema v42: the declared strategy (bets) and the link table that says which
  // open work each bet is actually funding. No record is tagged automatically.
  'strategyBets',
  'strategyTags',
  // Schema v43: the After-Action Review & Learning Ledger. One record per
  // review; lessons and the state of the change each lesson committed live
  // inside the review, because a lesson without its review has no context and
  // two collections would let them drift apart.
  'retros',
  // Schema v45: one frozen absence-drill record per window. Predictions hold
  // opaque item keys and probabilities only; observed stalls are a human
  // record. Scores are re-derived on load, never trusted from disk.
  'continuityDrills',
  // Schema v47: the scorecard ledger. Each record holds the declared design,
  // the prediction frozen at commit and the single observation recorded at
  // review; every modelled figure is re-derived on load from those inputs.
  'scorecards',
  // Schema v48: bounded successful propagation provenance. It stores rule and
  // event types plus typed IDs/edges only — never the record content itself.
  // Schema v50: the implementation-fidelity ledger. One record per declared
  // intervention: the planned denominators, five dated checkpoints and the
  // human attestations. Observed delivery is NEVER stored — it is re-derived on
  // load from the dated records the leader already keeps, so a plan can never
  // drift away from the evidence it claims to summarise.
  'fidelityPlans',
  // Schema v51: the merit & pay-equity terminal. `compBands` holds the declared
  // band structure (floor, midpoint, ceiling per level and effective date).
  // `meritCycles` holds one record per cycle: the declared budget, the pay
  // decision for each person, the frozen fairness audit and the resolved
  // retention outcomes the model grades itself against. Observed readings are
  // never stored on an open cycle — they are re-derived on load.
  'compBands',
  'meritCycles',
  // Schema v52: the workforce transition terminal. One record per programme: the
  // declared target and criteria weights, the named candidate rows the leader
  // owns, the recorded process gates, the frozen snapshot taken at finalization
  // and the resolved outcomes the survivor convention is graded against. Exit
  // costs, capability, continuity risk and survivor load are NEVER stored on an
  // open programme — they are re-derived on load from the roster, the dependency
  // graph, the succession bench and recorded pay, so a stored figure can never
  // drift away from the record it describes.
  'transitionPrograms',
  // Schema v53: the structural design terminal. One record per declared design:
  // the moves the leader proposes, the conventions the reading used, the
  // previous reporting lines captured at commit and the frozen prediction the
  // design is later graded against. Span, coordination, queue and churn are
  // NEVER stored on a draft — they are re-derived on load from the roster, the
  // decision record and recorded pay, so a stored figure can never drift away
  // from the record it describes.
  'orgDesigns',
  // Schema v54: the Information Value Terminal. `voiDecisions` holds one record
  // per priced decision frame: the declared states with their probabilities, the
  // options, the payoff table, and — once decided — the frozen EVPI the decision
  // was taken under and the realised state it is scored against. `voiStudies`
  // holds one record per declared investigation: what it targets, its own
  // declared sensitivity and specificity, its cost, and the signal that arrived.
  // EVPI, EVSI, posteriors and regret are NEVER stored on an open frame — they
  // are re-derived on load from the payoff table, so a stored figure can never
  // drift away from the numbers it describes.
  'voiDecisions',
  'voiStudies',
  'propagationLineage',
  // Schema v55: Decision Portfolio Engine. Marker array for RULE-DPF-01..04
  // idempotency. Each entry is a string key; the engine checks membership to
  // avoid re-creating coupling links, resolution notes or premise-scan flags.
  'portfolioMarkers',
  // Schema v56: Leader Probability Calibration. Marker array for RULE-LCAL-01..03
  // idempotency. Entries are string keys tracking which settled frames and
  // which declared frames have already received their calibration processing,
  // so re-running the rule on the same event does not duplicate an advisory.
  'calibrationMarkers',
  // Schema v57: the Attention Market. One record per committed plan: the frozen
  // optimisation result (bought set, forgone set with its price, LP bound,
  // shadow price), the prediction it will be graded against, and the review.
  'attentionPlans',
  // Schema v58: declarative operating agreements and their bounded run history.
  'autopilotPolicies',
  'autopilotRuns',
  // Schema v59: the Signal Path. A class is a declared event type with a
  // channel, a probe is the falsifier for that declaration, and a lever is an
  // adopted intervention with its own hours and frozen expectation.
  'signalClasses',
  'signalProbes',
  'signalLevers',
  // Schema v60: the Strategic War-Game Terminal. A war game is a declared
  // strategic exercise with named macro-scenarios, each evaluated by cascading
  // through strategy coherence, attention markets, coalition stability and case
  // severity. The frozen readings capture the baseline and scenario-specific
  // analytical engine outputs at commit time.
  'warGames',
  'warGameMarkers',
  // Schema v61: the Coupled Load Terminal. The coupling graph is a derived read
  // model over decisions, delegations, cases and the roster — it is never
  // stored as a first-class collection. The only persisted state is a marker
  // array for RULE-COUP-01..04 idempotency, so repeated scans converge.
  'couplingMarkers',
  // Schema v62: the Performance Recovery terminal. A concern is the leader's
  // own record of a performance gap and the process they ran about it. It
  // stores no rating, no potential and no protected characteristic.
  'performanceConcerns',
  // Schema v63: the Delivery Survival terminal. Only *frozen predictions* are
  // stored — the Kaplan–Meier curve, the competing-risk incidence and the
  // hazard are derived on every read from records the leader already typed, so
  // a stored curve can never drift from the data that produced it.
  'survivalReadings',
  'survivalMarkers',
  // Schema v64: the Cost of Waiting terminal. Declared weekly delay prices per
  // class (`waitPrices`), append-only frozen weekly exposure certificates
  // (`waitExposures`), and marker idempotency for RULE-WAIT-01..05
  // (`waitCostMarkers`). Every figure is derived on read from records the
  // leader already keeps; the only stored money is what the leader declared.
  'waitPrices',
  'waitExposures',
  'waitCostMarkers',
  // Schema v65: the Leadership Parity & Standard Consistency terminal. Only
  // frozen/graded parity audits (`parityAudits`) and rule markers
  // (`parityMarkers`) are persisted; every Gini, Atkinson, Theil, Wilson and
  // Kendall statistic is derived on read from working records.
  'parityAudits',
  'parityMarkers',
  // Schema v66: frozen evidence reviews (`evidenceReviews`) and rule markers
  // (`evidenceMarkers`) are persisted; every pooled effect, interval, I² and
  // EVSI figure is derived on read from the scored studies behind them.
  'evidenceReviews',
  'evidenceMarkers',
  // Schema v67: frozen decision-future scenarios and idempotency markers.
  'consequenceReadings',
  'consequenceMarkers',
  // Schema v68: frozen deferral frames and idempotency markers.
  'deferralFrames',
  'deferralMarkers',
  // Schema v69: frozen deferral-portfolio readings, the leader's declared
  // pairwise correlations, and rule idempotency markers.
  'deferralPortfolioReadings',
  'correlationDeclarations',
  'deferralPortfolioMarkers',
  // Schema v70: recorded looks, cross-family verdicts, frozen programme
  // reviews and rule idempotency markers. Every precision figure, boundary and
  // survivor count is derived on read from these records.
  'integrityLooks',
  'signalVerdicts',
  'integrityReviews',
  'integrityMarkers',
  // Schema v71: frozen borrowing forecasts, the leader's exchangeability
  // rulings and rule idempotency markers. Every borrowed estimate, credibility
  // weight and graduation date is derived on read.
  'credibilityFrames',
  'credibilityDeclarations',
  'credibilityMarkers',
  // Schema v72: frozen calibration certificates and rule idempotency markers.
  // Every map, band and reliability figure is derived on read; only the frozen
  // certificate and its later grade are stored.
  'confidenceCertificates',
  'confidenceMarkers',
  'responsePlans',
  'actionBundles',
  'settlements',
  // Schema v76: frozen counterfactual policy evaluations and the capture /
  // resolution provenance for every decision point the engine can score.
  'policyEvaluations',
  'policyMarkers',
  // Schema v77: frozen instrument readings (aggregate-only, by contract) and the
  // marker ledger proving each observation, temper, qualification and
  // convergence pass happened once.
  'reliabilityReadings',
  'reliabilityMarkers',
  // Schema v78: frozen coupling reviews (aggregate-only, by contract) and the
  // marker ledger proving each reconciliation, scan and challenge happened once.
  'couplingReviews',
  // Schema v79: frozen evidence-supply plans (aggregate-only, by contract) and
  // the marker ledger proving each capture task, triage decision, retirement
  // prompt and grading task happened once.
  'supplyPlans',
  'supplyMarkers',
  // Schema v80: frozen promise-solvency readings (aggregate-only, by contract),
  // the marker ledger proving each repair, alarm and grading step happened once,
  // and the append-only record of every date that was actually moved.
  'solvencyReadings',
  'solvencyMarkers',
  'solvencyRenegotiations',
  // Schema v82: frozen command-chain readings (aggregate-only, by contract) — one
  // per span, holding counts, defensible rates, and exactly one probability that the
  // span's own work crosses the next altitude's horizon — plus the marker ledger
  // proving each escalation, brief, structural decision, drift decision and grade
  // happened once.
  'chainReadings',
  'chainMarkers',
  // Schema v81: frozen cross-examination rounds (aggregate-only, by contract) and
  // the append-only ledger of human verdicts every contradiction rate is measured
  // from — refuted, held or dismissed, each with the reason that makes it a
  // verdict rather than a click.
  'scepticRounds',
  'scepticDispositions',
  'scepticMarkers',
  // Schema v83: frozen bench readings (aggregate-only by contract — no person name,
  // no rating, no free text survives the export boundary) and the idempotency
  // markers their five rules use.
  'successionReadings',
  'successionMarkers',
  'mandates',
  // Schema v85: Authority Calibration Ledger idempotency markers (system
  // generated — one per governed floor-breach decision, one per cell that
  // first reaches the evidence floor; never authored by a person).
  'authorityCalibrationMarkers',
  // ADR-0080: immutable, identity-free mission brief snapshots.
  'missionBriefs',
  // ADR-0105: a reviewed note-to-case-to-action plan; never an adopted record until its receipt exists.
  'missionCaptures',
  // ADR-0081: reviewed routing plans (each row is also its later grade) and
  // rule-idempotency markers. Additive; no figure is inferred on migration.
  'altitudeRoutingPlans',
  'altitudeRoutingMarkers',
  // ADR-0084: Hoshin Kanri & Catchball Cascade pacts, append-only rounds, and
  // rule-idempotency markers.
  'catchballPacts',
  'catchballRounds',
  'catchballMarkers',
  // ADR-0089: identity-reduced frozen renewal readings and idempotency markers.
  'strategyCycles',
  'strategyCycleMarkers',
  // ADR-0085: the Operating Cadence Clock. Declared standing forums, an
  // ADR-0087: lateral value-stream contracts and stop-rule carryover.
  'valueStreamContracts',
  'valueStreamRounds',
  'valueStreamReallocations',
  'valueStreamMarkers',
  // ADR-0087: the Operating Cadence Clock. Declared standing forums, an
  // append-only sitting log, frozen queue readings graded once afterwards, and
  // rule-idempotency markers. No attendance record, no per-person record and no
  // meeting transcript is stored: a forum is a server with a declared capacity,
  // and the only history kept is what it closed.
  'cadenceForums',
  'cadenceSessions',
  'cadenceReadings',
  'cadenceMarkers',
  // ADR-0083: two-sided expectation rounds (one row per pair per cycle, sealed
  // until both sides are in) and the idempotency markers their three rules use.
  'expectationRounds',
  'concordanceMarkers',
  // ADR-0088: Hoshin Carryover Terminal — one record per Catchball pact
  // ADR-0088: the Escalation Economy — one row per decision moment (absorbed or
  // escalated), Aghion–Tirole intervention-rate commitments, and rule markers.
  'escalationRecords',
  'escalationCommitments',
  'escalationMarkers',
  // ADR-0089: Hoshin Carryover Terminal — one record per Catchball pact
  // ADR-0085: Hoshin Carryover Terminal — one record per Catchball pact
  // settled as thesis-invalidated, idempotency markers, and the once-only
  // later grading rows.
  'carryoverRecords',
  'carryoverMarkers',
  'carryoverGradings',
  // ADR-0086: disclosure release contracts (the only records that can widen a
  // read) and the idempotency markers RULE-DSC-01..02 use.
  'disclosureGrants',
  'disclosureMarkers',
  // ADR-0085: board disclosure memos (declared claims + frozen snapshots) and
  // the idempotency markers their three rules use.
  'boardMemos',
  'boardMarkers',

  // ADR-0088: the Federated Envoy. `exchangePackets` is the ledger of every
  // packet this workspace built, verified, ingested or refused; the stored rows
  // carry the manifest (item hashes and projected fields) so a verification can
  // always be recomputed from the ledger, never from a cached verdict.
  'exchangePackets',
  // `exchangeArtefacts` holds the attested COPIES imported from verified
  // packets. A foreign packet never edits a local record: an imported artefact
  // is an attributed snapshot, and a disagreement opens a decision (RULE-ENV-02).
  'exchangeArtefacts',
  // Rule-idempotency markers (carriage, divergence, attested exposure).
  'exchangeMarkers',
  // ADR-0085: Hoshin Carryover Terminal — one record per Catchball pact
  // Schema v95 (ADR-0089): declared work-type splits (one per level/function),
  // declared collaboration edges, priced portfolio items and the rules' idempotency
  // markers. A workspace with none of these is unmeasured, not zero.
  'omWorkSplits',
  'omEdges',
  'omDecisions',
  'omMarkers',
  // ADR-0088: Hoshin Carryover Terminal — one record per Catchball pact
  // settled as thesis-invalidated, idempotency markers, and the once-only
  // later grading rows.
  'carryoverRecords',
  'carryoverMarkers',
  'carryoverGradings',
  // ADR-0090: the Programme Federation Reading. `federationAssessments` holds
  // frozen, identity-reduced readings of which declared leadership edges
  // measurably carried work; `federationMarkers` is the rule-idempotency ledger
  // (measurement roll-up, one carriage decision per edge per ISO week, and
  // measured reconnections). No measured channel is written by this module.
  'federationAssessments',
  'federationMarkers',
  // ADR-0092: the Differencing Defender. `differenceReleases` is the immutable
  // register of published aggregates (module, day, altitude, geometry — never a
  // span name, person, title or amount); `differenceMarkers` is the rules'
  // idempotency ledger (registration roll-up, determined-value decisions,
  // protection tasks and publication-rhythm findings).
  'differenceReleases',
  'differenceMarkers',
  // ADR-0089: seat credential enrollments (PUBLIC halves only — salt, key
  // fingerprint and an HMAC verifier; never key material) and the identity
  // rules' idempotency markers.
  'seatIdentities',
  'identityMarkers',
  // ADR-0094 / Schema v97: the Prospective Intervention Contract.
  // `prospectiveContracts` freezes the declared probability, threshold, horizon
  // AND the exact cohort of record ids BEFORE the governed work exists.
  // `prospectiveGrades` is an append-only, once-only Brier grade re-derived
  // out of sample from the dated records other modules own. `prospectiveMarkers`
  // is the four shared-post-commit rules' idempotency ledger. No score, rate,
  // interval, name or narrative is persisted: all of it is derived on read.
  'prospectiveContracts',
  'prospectiveGrades',
  'prospectiveMarkers',
  // ADR-0095 / Schema v98: the Robust Allocation Terminal. `robustPlans` holds
  // declared plans (ranges, constraints, and the frozen solved vector at
  // adoption); `robustMarkers` is the four shared-post-commit rules' idempotency
  // ledger. No solution, rate or interval is persisted for a draft: all of it is
  // derived exactly on read.
  'robustPlans',
  'robustMarkers',
  // ADR-0098: sealed clearing rounds (with frozen N+1 solution and
  // once-only settlement) plus the shared post-commit idempotency markers.
  'clearingRounds',
  'clearingMarkers',
  // ADR-0099: the Freeze-Line Continuity Audit. `freezeReadings` holds frozen,
  // identity-reduced continuity readings across each crossed freeze line;
  // `freezeMarkers` is the rule-idempotency ledger (line registration,
  // degraded-line decisions, timing-guard redaction work). Freeze lines
  // themselves are DERIVED from committed/reverted org designs, never stored.
  'freezeReadings',
  'freezeMarkers',
  // Base-commit repair (Session 142): ADR-0100's three calibration ledgers were
  // normalized and migrated but never listed here, so a FRESH workspace created
  // them only on its first normalize pass and the disclosure compiler's
  // "every declared collection exists" check was red on main. Listing them is
  // the fix; nothing about their shape or defaults changes.
  'spanReadings',
  'spanAdoptions',
  'spanMarkers',
  // ADR-0101: the Reputational Capital Ledger. `reputationActs` holds only acts a
  // HUMAN entered (derived acts are re-harvested on read), `reputationPositions`
  // holds dated guarantees and repairs, and `reputationMarkers` is the five
  // shared-post-commit rules' idempotency ledger. No cell, rate, interval or
  // verdict is ever persisted: every figure is re-derived from the record.
  'reputationActs',
  'reputationPositions',
  'reputationMarkers',
  // ADR-0102: the Hindsight Lock. `decisionLocks` holds one frozen information
  // set per decision — the records the link spine had already tied to it on or
  // before the decision date, plus the process quality as the record stood then.
  // `decisionLockMarkers` is the four shared-post-commit rules' idempotency
  // ledger. No coverage rate, quadrant or p-value is ever persisted: every
  // figure is re-derived from the lock and the live links on read.
  'decisionLocks',
  'decisionLockMarkers',
  // ADR-0103: the Epistemic Ledger. `epistemicUnknowns` holds the harvested and
  // declared unknowns (each one a pointer to the record it came from, never a
  // copy of it); `epistemicObservations` holds the frozen belief sets a human
  // declared; `epistemicGrades` holds their once-only grades; `epistemicMarkers`
  // is the five rules' idempotency ledger. No rate, kappa, cell or coverage is
  // ever persisted: every figure is re-derived on read.
  'epistemicUnknowns',
  'epistemicObservations',
  'epistemicGrades',
  'epistemicMarkers',
  // ADR-0104: the Diligence Ledger. `diligenceChecklists` freezes the knowable
  // set (typed POINTERS only) for one decision at the moment it is recorded;
  // `diligenceConsults` is the append-only evidence that a leader looked;
  // `diligenceGrades` holds one out-of-sample Brier grade per pre-declared
  // forecast; `diligenceMarkers` is the four rules' idempotency ledger. No
  // rate, interval, band or grade is persisted: all are re-derived on read.
  'diligenceChecklists',
  'diligenceConsults',
  'diligenceGrades',
  'diligenceMarkers',
  'links',
  'portfolio',
  'events',
  // ADR-0107 (Schema v109): frozen expectations, once-only grades and bounded
  // governance markers. Purely additive; all three start EMPTY on upgrade.
  'outcomeContracts',
  'outcomeGrades',
  // ADR-0108 (Schema v110): the Decision-Fit Ledger. `fitSnapshots` freezes one
  // authority classification per decision (class, floor, owner rung, the priced
  // ladder at freeze time); `fitProposals` records each governed delegation the
  // spine proposed and the contract it opened; `fitReadings` freezes one span
  // reading per rung per period for later grading; `fitMarkers` is the
  // idempotency ledger that makes a rescan converge.
  'fitSnapshots',
  'fitProposals',
  'fitReadings',
  'fitMarkers',
  'outcomeMarkers',
  // ADR-0109 (Schema v111): the Jurisdiction Compiler. `jurFindings` freezes
  // one governance finding per cross-branch objective per ISO week;
  // `jurReadings` freezes one identity-free span reading per rung per week;
  // `jurMarkers` is the idempotency ledger that makes a rescan converge.
  'jurFindings',
  'jurReadings',
  'jurMarkers',
  // ADR-0113 (Schema v112): the 1:1 agenda provenance ledger. `agendaEntries`
  // holds ONLY the lines a human filed ("I will raise this prompt with this
  // person"), copied verbatim so the commitment survives the waiting list being
  // truncated; `agendaMarkers` is the rules' idempotency ledger. The status of
  // every filed line, the queue's provenance counts and the receipt rate are
  // re-derived on read from the person record and the logged 1:1.
  'agendaEntries',
  'agendaMarkers',
  // ADR-0118 (Schema v113): the Portfolio Rehearsal Comparison ledger. One
  // record per human arbitration between two responses that were BOTH replayed
  // through production commands from the same frozen revision: the declared
  // commitment vector, the actual software footprints, where the two collide,
  // the Pareto verdict (or its refusal), the written rationale and the governed
  // decision it opened. No benefit score, no probability and no ranking is ever
  // stored: dominance is re-derived on read from the validated vector.
  'portfolioComparisons',
  // ADR-0121 (Schema v114): the Duty Coverage Register. `dutyCovers` is the
  // dated, human declaration of who is answerable for ONE duty line when the
  // seat holder is absent (with the governed decision that names the consequence
  // and the `prepares-for` edge to the person); `dutyCoverageMarkers` is the
  // rules'/scans' idempotency ledger. Eligibility, exercise and concentration
  // are DERIVED on read from the reporting tree and the dated records — never
  // stored, so no number can drift from the number it reports.
  'dutyCovers',
  'dutyCoverageMarkers',
  // ADR-0122 (Schema v115): the Dated Absence Plan. `absencePlans` is the
  // dated, human declaration of when a seat will not be there — the window
  // (inclusive ISO days), the reason, the governed decision that names what
  // stops during the window, and the `declares-absence-of` edge to the seat.
  // Window availability, the cover-absent conflict and the cascade are DERIVED
  // on read from the declared covers and absence windows — never stored.
  'absencePlans',
  // ADR-0127 (Schema v116): Cover acknowledgement. `dutyStandbyAnswers` holds ONLY
  // the human answer a named cover gave about one declared cover row — accepted or
  // declined, the bounded window it was given for, the answerer's own words, and
  // the governed decision opened when the answer was a refusal. Whether a cover is
  // awaiting, overdue, lapsed or accepted is DERIVED on read from that answer, the
  // ask window and the declared response deadline — never stored, so a consent
  // cannot drift from the dates it was given for, and cannot be extended by a read.
  'dutyStandbyAnswers',
  // ADR-0128 (Schema v117): Explicit rehearsal records. `dutyRehearsals` holds ONLY
  // the dated human attestation that a declared cover practised a specific duty
  // line on a specific day — the mode, the outcome (ready, or gaps found and named
  // in the recorder's words), the seat that was there to observe it, and the
  // governed decision a gaps outcome opened. Whether a rehearsal counts for a
  // given absence is DERIVED on read from the preparation window, the outcome and
  // today (ADR-0125's index) — never stored, so a certification cannot drift from
  // the window it was run for, and a drill that found gaps never becomes a badge.
  'dutyRehearsals',
  // ADR-0129 (Schema v118): the Branch Reading hand-off. `branchReadingAsks` holds
  // ONLY the chief's dated request for a reading of one direct branch — the
  // branch it is about, the seat that asked and why. `branchReadings` holds ONLY
  // the branch leader's answer: the derived band frozen on the day it was given
  // (never a count), their own words, or a refusal with its reason. Whether the
  // ask is asked, overdue, published, declined, lapsed or withdrawn is DERIVED
  // on read from the two ledgers, the declared windows and today — never stored,
  // so a reading cannot silently outlive the window it was given for.
  'branchReadingAsks',
  'branchReadings',
  // ADR-0140 (Schema v119): the Matrix Accountability Ledger. `reportingLines`
  // holds ONLY the dated human declaration that a person is ALSO accountable to
  // a named manager — the kind of line, the allocation in whole hundredths of a
  // person (or null, which is undeclared and never zero), the decision rights
  // that line holds, and the window. `matrixMarkers` is the rule's idempotency
  // ledger. Every total, every span attribution and the reconciliation itself
  // are DERIVED on read from these rows and the roster — never stored, so the
  // roll-up cannot drift from the lines it claims to add up. The home line is
  // NOT copied here: `person.managerId` already records it.
  'reportingLines',
  'matrixMarkers',
  // ADR-0143 (Schema v120): the Cross-Line Priority Arbitration. `priorityArbitrations`
  // holds ONLY human acts — the frozen demands as each line stated them, with the
  // two integers that line declared; the arbiter's ratified precedence, its window
  // and its review date; each party's own answer; and a POINTER to every
  // obligation issued. `priorityArbitrationMarkers` is the rule's idempotency
  // ledger. NOTHING ELSE IS STORED: no rank, no ratio, no score, no state and no
  // capacity total, because every one of those is re-derived on read from these
  // integers. A stored score is a number waiting to disagree with the numbers it
  // claims to rank.
  'priorityArbitrations',
  'priorityArbitrationMarkers',
  // ADR-0144 (Schema v121): the Cross-Line Contradiction Audit. `lineMandates`
  // holds ONLY the dated human declaration of a line's charter — lever,
  // direction, scorecard share in basis points, optional envelope claim and
  // optional declared target. `contradictionReviews` holds ONLY the human ruling
  // on a DERIVED finding, with a POINTER to the decision and obligation issued.
  // `contradictionMarkers` is the rule's idempotency ledger. NOTHING DERIVED IS
  // STORED: no finding, no severity, no contradiction count, no weight total and
  // no queueing multiplier, because every one of those is re-derived on read
  // from these declarations plus the live matrix. A stored severity is a verdict
  // waiting to disagree with the charters it was computed from.
  'lineMandates',
  'contradictionReviews',
  'contradictionMarkers',
  // ADR-0148 (Schema v123): Matrix Line Consent. `lineConsents` holds ONLY the
  // dated human acts on a declared line — which side answered (the line's
  // manager or the person whose hours are taken), whether the answer was an
  // acceptance, a reasoned decline or an acknowledgement, the day it was given,
  // the seat that gave it, and the window an acceptance runs to. The share
  // itself is NEVER copied here: it lives on the declaration and is read from
  // there, so a retune cannot leave a consent row claiming agreement to a number
  // that no longer exists. `lineConsentMarkers` is the rule's idempotency
  // ledger. NOTHING DERIVED IS STORED: no state, no lapse, no day count, no
  // verdict and no total, because every one of those is re-derived on read from
  // these acts and the live matrix. A stored state is a verdict waiting to
  // disagree with the acts it was computed from.
  'lineConsents',
  'lineConsentMarkers',
  // ADR-0149 (Schema v124): Matrix Reorganisation Reconciliation & As-Of
  // Structure Reads. `structureHistory` holds ONLY one dated record per OBSERVED
  // HOME-LINE PERIOD — "from this day until that day (or until further notice)
  // this person's home line was that manager" — with the day it was recorded and
  // the seat that recorded it. The valid-time period and the transaction time are
  // kept as separate fields, because conflating them is how a back-dated
  // correction silently rewrites a period that other stored acts were judged
  // against. `structureHistoryMarkers` is RULE-SHR-01's idempotency ledger.
  // NOTHING DERIVED IS STORED: no span, no depth, no subtree, no changed/held
  // verdict, no act reading and no comparable/uncomparable verdict, because every
  // one of those is re-derived on read from these periods plus the live roster. A
  // stored span is a number waiting to disagree with the structure it describes.
  // Deliberately EMPTY on upgrade: a workspace that has been re-organised before
  // this version has NO recorded past, and the honest reading of those days is
  // `unknown`, never a projection of today's pointer backwards.
  'structureHistory',
  'structureHistoryMarkers',
  // ADR-0150 (Schema v125): Matrix Onboarding Completeness. `onboardingLineBriefs`
  // holds ONLY one dated human STATEMENT per row — "this line expects this of this
  // person, in these words, from this day" — or an explicit decline with a reason,
  // plus the person's own dated acknowledgement of that exact text.
  // `onboardingLineBriefMarkers` is RULE-ONB-01's idempotency ledger.
  // NOTHING DERIVED IS STORED: no line state, no overdue flag, no verdict, no
  // duplicate-plan marker and no coverage total, because every one of those is
  // re-derived on read from these statements plus the live matrix and the plan's
  // start date. A stored state is a verdict waiting to disagree with the record.
  // Deliberately EMPTY on upgrade: no line has written a brief in an existing
  // workspace, and a brief invented at upgrade time would be words nobody said.
  'onboardingLineBriefs',
  'onboardingLineBriefMarkers',
  // ADR-0152 (Schema v127): the Matrix Line-Exit Obligation Register.
  // `lineExitRemedies` holds ONLY one dated human act per open obligation a
  // DATED-OUT line left behind — which ask, whose line, which person, whether
  // the leader RETIRED it (nothing was owed, with a reason) or CARRIED it to a
  // named manager who holds a live line today, and the day it was decided.
  // `lineExitMarkers` is RULE-LEX-01's idempotency ledger.
  // NOTHING DERIVED IS STORED and no obligation is copied here: every
  // obligation, state, window verdict, day count and total is re-derived on read
  // from the asks the workspace already holds plus the dated declarations, so a
  // printed obligation cannot outlive the record that produced it. An ask that
  // was ANSWERED after a remedy was recorded therefore stops being an
  // obligation on its own, and the remedy stays readable as history.
  // Deliberately EMPTY on upgrade: no ended line in an existing workspace has
  // been adjudicated, and the honest reading is "every open obligation of every
  // ended line is still open" — which is exactly what the panel prints.
  'lineExitRemedies',
  'lineExitMarkers',
  // ADR-0157 (Schema v129): Matrix Line Re-Affirmation. `lineReaffirmations`
  // holds ONLY the dated human answers on one declared line — which side
  // answered (the manager who holds the line, or the person whose hours it
  // takes), whether the answer was a re-affirmation (with the term it sets and
  // the share it was given for), a release, an acceptance or an objection, the
  // day it was given and the seat that gave it. The CURRENT share is NEVER
  // copied here: it lives on the declaration and is read from there, so a retune
  // cannot leave an answer claiming agreement to a number that no longer exists.
  // `lineReaffirmationMarkers` is RULE-LRF-01's idempotency ledger. NOTHING
  // DERIVED IS STORED: no state, no lapse, no day count, no verdict and no
  // total, because every one of those is re-derived on read from these answers
  // plus the live matrix. A stored state is a verdict waiting to disagree with
  // the answers it was computed from.
  'lineReaffirmations',
  'lineReaffirmationMarkers',
  // ADR-0159 (Schema v130): Frozen Authority Re-Affirmation. Holds ONLY the
  // dated human answers (`stand-behind` / `refer-reopen`) on drifted frozen
  // decisions plus RULE-ACR-01's idempotency markers. Settlement state,
  // staleness after a subsequent re-org, and reconciled claims are DERIVED on
  // read against the live matrix — never stored.
  'authorityReaffirmations',
  'authorityReaffirmationMarkers',
  // ADR-0162 (Schema v131): Matrix Management-Interface Operating-Agreement
  // Register. Holds ONLY append-only first-person bilateral acts (`affirm` /
  // `retire`) and RULE-MIA-01 markers. Pair state, DAG apex, and coverage are
  // derived on read from the live matrix — never stored.
  'matrixInterfaceAgreements',
  'matrixInterfaceMarkers',
  // ADR-0174 (Schema v138): Standing Delegation-of-Authority Schedule &
  // RULE-DOA-01 ratification markers. Conformance verdicts and covering-seat
  // resolutions are derived on read from the live/as-of matrix — never stored.
  'doaSchedule',
  'doaMarkers',
  // ADR-0166 (Schema v133): the Cross-Line Review-Evidence Join. This collection
  // holds NOTHING BUT the join's rule-idempotency markers: which pay decisions
  // have already been issued one dated ask about an unconsulted line. The join
  // itself stores no row, no state, no rate and no verdict — every figure is
  // re-derived on read from the merit cycle, the review records ADR-0147 already
  // keeps and the dated reporting lines. A stored verdict here would be the exact
  // drift the Bulletproof Reliability Mandate forbids.
  'meritEvidenceMarkers',
  // ADR-0168 (Schema v135): the Cross-Line Bench-Evidence Sufficiency reading.
  // This collection holds NOTHING BUT RULE-BNE-01's idempotency markers: which
  // bench claims have already been given one dated ask about an unconsulted
  // line. The reading itself stores no row, no state, no rate and no verdict —
  // every figure is re-derived on read from the readiness ledger, the review
  // records ADR-0147 already keeps and the dated reporting lines. A stored
  // verdict here would be the exact drift the Bulletproof Reliability Mandate
  // forbids.
  'benchEvidenceMarkers',
  // ADR-0171 (Schema v136): the Matrix Line Intake Gate and Share-Day WIP
  // Ceiling. Holds ONLY dated intake acts recorded through the gate: which line
  // funded what work, dated to its period, consuming how many share-days, with
  // the gate verdict attached. The ceiling itself is NOT stored — every figure
  // is re-derived on read from the dated declarations and intake acts. A stored
  // ceiling would be the exact drift the Bulletproof Reliability Mandate
  // forbids; a stored verdict would be the drift too.
  'lineIntakes',
  // ADR-0172 (Schema v137): the Bench-Claim Evidence Regression Watch.
  // `benchRegressionReadings` holds ONLY dated evidence readings — one per
  // bench claim per completed review (the claim, the review, the window, the
  // evidence state through the shared ADR-0168 precedence, the line counts,
  // the rating at freeze time, the freeze day). A reading is a claim state,
  // never a person score, and is NEVER rewritten once frozen.
  // `benchRegressionMarkers` is RULE-BRG-01's idempotency ledger. Pair verdicts
  // are re-derived on read from frozen previous windows and live later
  // windows; a stored verdict would be the exact drift the Bulletproof
  // Reliability Mandate forbids. Deliberately EMPTY on upgrade: no window has
  // been frozen in an existing workspace, and a history invented at upgrade
  // time would be evidence nobody recorded.
  'benchRegressionReadings',
  'benchRegressionMarkers',
  // ADR-0175 (Schema v139): the Matrix Pattern Repair Register. Holds ONLY the
  // dated first-person remedy acts. No verdict, count or "cleared" flag is stored:
  // a stored verdict would drift from the decision log beneath it.
  'matrixRemedies',
  // ADR-0164 (Schema v140): RULE-OOL-01's bounded silent-line ask and unreadable
  // observation marker ledger. Never stores synthetic holders or inferred state.
  'oneOnOneLineMarkers',
  // ADR-0176 (Schema v141): dated co-hiring line-plan acts and RULE-HLC-01's
  // marker ledger. No line state, verdict or rate is stored.
  'hiringLinePlans',
  'hiringLineMarkers',
  // ADR-0177 (Schema v142): dated two-key transfer-price acts and RULE-TPL-01's
  // marker ledger. No charge, credit, net, agreement state or total is stored.
  'transferPriceActs',
  'transferPriceMarkers',
  // ADR-0178: append-only ask-to-line attribution and RULE-DLA-01 markers.
  'delegationLineActs',
  'delegationLineMarkers',
  // ADR-0181 (Schema v144): append-only work-kind classification acts and
  // RULE-NPW-01's marker ledger. No pool, turn, share or verdict is stored.
  'workTurnActs',
  'workTurnMarkers',
  // ADR-0182 (Schema v145): dated permits authorising the silence of an
  // automatic control, and RULE-PMP-01's marker ledger. No state, reach flag,
  // expiry mark or count is stored — every one is re-derived on read.
  'pausePermits',
  'pausePermitMarkers',
  // ADR-0184 (Schema v146): append-only workforce move acts, intended-shape
  // declarations and RULE-WFS-01's marker ledger. No rate, exposure, projected
  // headcount, wait time or gap is stored — every one is re-derived on read.
  'workforceFlowActs',
  'workforceFlowTargets',
  'workforceFlowMarkers',
  // ADR-0185 (Schema v147): dated Matrix change-impact requests and first-person
  // line responses. No state, currentness, coverage or approval is stored.
  'changeImpactRequests',
  'changeImpactResponses',
  // ADR-0186 (Schema v148): dated change demands per person and line, dated
  // absorptive-capacity ceilings per person or pool, and RULE-CSA-01's marker
  // ledger. No load, exposure, peak, days-over figure, verdict or clearance is
  // stored — every one is re-derived on read.
  'changeSaturationActs',
  'changeSaturationCeilings',
  'changeSaturationMarkers',
  // ADR-0188 (Schema v149): dated corroboration requests per review and line
  // holder, first-person answers, and dated per-line adoption acts. No state,
  // currentness, coverage or parity verdict is stored — every one is re-derived
  // on read. The AAR ledger (`retros`) is read here and never written.
  'aarCorroborationRequests',
  'aarCorroborationResponses',
  'aarAdoptions',
  // ADR-0190 (Schema v150): Leader Standard Work & Tiered Daily Management.
  // Three append-only ledgers — declared routines, first-person checks against
  // one calendar slot each, and first-person tier acts on an escalated
  // abnormality. No adherence, verdict, load or yield figure is stored.
  'standardWorkRoutines',
  'standardWorkChecks',
  'standardWorkTierActs',
];

/** Stable empty state. `now` is an ISO string so the result is a pure value. */
/**
 * `0` disables the retention reminder and must survive normalization intact.
 * Every other value is clamped to a real window; a negative or non-numeric
 * value is treated as "not answered" and gets the default, because clamping it
 * to 0 would switch a privacy reminder off as a side effect of a typo.
 */
function normalizeRetentionWindow(value, fallback) {
  if (value === 0 || value === '0') return 0;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(3650, Math.max(1, n));
}

export function createEmptyState(now = new Date().toISOString()) {
  const state = {
    schemaVersion: SCHEMA_VERSION,
    appId: APP_ID,
    meta: { createdAt: now, updatedAt: now, isDemo: false, revision: 0 },
    settings: { ...DEFAULT_SETTINGS },
  };
  for (const key of COLLECTIONS) state[key] = [];
  return state;
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v, fallback = '') {
  return typeof v === 'string' ? v : fallback;
}

function num(v, fallback) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(v, min, max, fallback) {
  const n = Math.round(num(v, fallback));
  return Math.min(max, Math.max(min, n));
}

/**
 * Schema v38: an objective weight is a share in [0, 1]. A non-numeric value
 * falls back to the documented convention rather than to 0, because silently
 * zeroing one objective would change what the allocator optimises as a side
 * effect of a typo.
 */
function clampWeight(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

/**
 * Schema v33: an FMEA rating the leader has actually recorded, or null when
 * they have not. Before v33 a blank rating was stored as 5, which made
 * "nobody has rated this risk" indistinguishable from a deliberate mid-scale
 * judgement — and quietly fed a fabricated RPN into every downstream view.
 * Existing stored numbers are preserved untouched: the migration cannot know
 * which historical 5s were deliberate, so it does not guess. Only new blanks
 * (and corrupt non-numeric values, which are not ratings at all) become null.
 */
function fmeaRatingOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(10, Math.max(1, Math.round(n))) : null;
}

/**
 * Schema v21: a recorded decision forecast ("P(this works out well)", %).
 * Clamped to 5–95 (Cromwell's rule — 0% and 100% are not defensible
 * probabilities); anything non-numeric stays null, never a defaulted 50.
 */
function normalizeForecastProbability(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(95, Math.max(5, Math.round(n)));
}

function finiteOrNull(v) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function nonNegativeOrNull(v) {
  const n = finiteOrNull(v);
  return n !== null && n >= 0 ? n : null;
}

/**
 * Schema v21: the forecast frozen when a plan item was funded (RULE-FCT-01).
 * Scoring compares recorded actuals against this belief, so the snapshot is
 * validated strictly: without a positive expected effort there is no forecast
 * to score and the whole snapshot is dropped rather than half-kept.
 */
function normalizeForecastSnapshot(raw) {
  if (!isPlainObject(raw)) return null;
  const effortExpected = nonNegativeOrNull(raw.effortExpected);
  if (effortExpected === null || effortExpected <= 0) return null;
  return {
    fundedOn: calendarDayOrNull(raw.fundedOn),
    targetOn: calendarDayOrNull(raw.targetOn),
    effortOptimistic: nonNegativeOrNull(raw.effortOptimistic) ?? 0,
    effortMostLikely: nonNegativeOrNull(raw.effortMostLikely) ?? 0,
    effortPessimistic: nonNegativeOrNull(raw.effortPessimistic) ?? 0,
    effortExpected,
    effortStdDev: nonNegativeOrNull(raw.effortStdDev) ?? 0,
    effortP10: nonNegativeOrNull(raw.effortP10) ?? 0,
    effortP80: nonNegativeOrNull(raw.effortP80) ?? effortExpected,
    effortP90: nonNegativeOrNull(raw.effortP90) ?? effortExpected,
    valueExpected: nonNegativeOrNull(raw.valueExpected),
    currency: (str(raw.currency, 'USD').trim().toUpperCase().slice(0, 6)) || 'USD',
  };
}

/**
 * Schema v22: the forecast frozen when an operational case first carried a
 * measured PERT estimate (RULE-FCT-03) — the case analogue of the funding-time
 * portfolio snapshot. Settled actuals are scored against this opening belief
 * (the numbers that drove the escalate/mitigate decision), not against
 * whatever the estimate was edited into once the outcome was known. Validated
 * strictly: without at least one measurable leg (expected exposure, expected
 * diverted days, or planned mitigation spend) there is no forecast to score
 * and the whole snapshot is dropped rather than half-kept.
 */
function normalizeCaseForecastSnapshot(raw) {
  if (!isPlainObject(raw)) return null;
  const costExpected = nonNegativeOrNull(raw.costExpected) ?? 0;
  const capacityDaysExpected = nonNegativeOrNull(raw.capacityDaysExpected) ?? 0;
  const mitigationCost = nonNegativeOrNull(raw.mitigationCost) ?? 0;
  if (costExpected <= 0 && capacityDaysExpected <= 0 && mitigationCost <= 0) return null;
  const fmeaProbabilityRaw = raw.fmeaProbability === null || raw.fmeaProbability === undefined || raw.fmeaProbability === ''
    ? null
    : Number(raw.fmeaProbability);
  return {
    frozenOn: calendarDayOrNull(raw.frozenOn),
    currency: (str(raw.currency, 'USD').trim().toUpperCase().slice(0, 6)) || 'USD',
    costOptimistic: nonNegativeOrNull(raw.costOptimistic) ?? 0,
    costMostLikely: nonNegativeOrNull(raw.costMostLikely) ?? 0,
    costPessimistic: nonNegativeOrNull(raw.costPessimistic) ?? 0,
    costExpected,
    costStdDev: nonNegativeOrNull(raw.costStdDev) ?? 0,
    costP10: nonNegativeOrNull(raw.costP10) ?? 0,
    costP90: nonNegativeOrNull(raw.costP90) ?? costExpected,
    capacityDaysOptimistic: nonNegativeOrNull(raw.capacityDaysOptimistic) ?? 0,
    capacityDaysMostLikely: nonNegativeOrNull(raw.capacityDaysMostLikely) ?? 0,
    capacityDaysPessimistic: nonNegativeOrNull(raw.capacityDaysPessimistic) ?? 0,
    capacityDaysExpected,
    mitigationCost,
    fmeaProbability: Number.isFinite(fmeaProbabilityRaw)
      ? Math.min(10, Math.max(1, Math.round(fmeaProbabilityRaw)))
      : null,
  };
}

/**
 * Schema v22: settled actuals recorded when an operational case resolves —
 * what the risk actually cost once it settled. `materialised`, realised
 * exposure, mitigation spend and diverted days are independent facts (a risk
 * can be contained before its failure mode fully lands, and mitigation spend
 * exists whether or not it did), so each stays null when unrecorded: unknown
 * is never coerced to zero, because scoring a defaulted "actual" would
 * fabricate the very calibration being measured. An all-empty record is null;
 * actuals only exist on resolved/closed cases (reopening voids a settlement,
 * exactly like it voids the resolution note).
 */
function normalizeCaseActuals(raw, { isClosed, openedOn, resolvedOn, todayDay }) {
  if (!isClosed || !isPlainObject(raw)) return null;
  const materialised = raw.materialised === true ? true : raw.materialised === false ? false : null;
  const realisedExposure = nonNegativeOrNull(raw.realisedExposure);
  const mitigationSpend = nonNegativeOrNull(raw.mitigationSpend);
  const divertedDays = nonNegativeOrNull(raw.divertedDays);
  const note = str(raw.note).trim().slice(0, 600);
  if (
    materialised === null &&
    realisedExposure === null &&
    mitigationSpend === null &&
    divertedDays === null &&
    !note
  ) {
    return null;
  }
  const candidate = calendarDayOrNull(raw.settledOn);
  const settledOn = candidate && candidate >= openedOn && candidate <= todayDay
    ? candidate
    : resolvedOn || todayDay;
  return {
    materialised,
    realisedExposure,
    mitigationSpend,
    divertedDays,
    settledOn,
    note,
  };
}

function isoOrNull(v) {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function dayOrNull(v) {
  if (typeof v !== 'string' || !v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

// Calendar-day fields drive inclusive filtering, chronology and latency. A regex
// alone would accept impossible dates such as 2026-02-31 in a hand-edited import.
function calendarDayOrNull(v) {
  const day = dayOrNull(v);
  if (!day) return null;
  const parsed = new Date(`${day}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : null;
}

/**
 * Normalize settings, coercing and clamping every field so downstream code can
 * treat them as trusted numbers.
 */
/** The declared ladder, as the settings normalizer needs it. */
const DECLARED_HORIZONS = Object.freeze(SPAN_ALTITUDES.reduce((acc, altitude) => {
  acc[altitude.key] = altitude.horizonDays;
  return acc;
}, {}));

export function normalizeSettings(raw) {
  const s = isPlainObject(raw) ? raw : {};
  const d = DEFAULT_SETTINGS;
  return {
    leaderName: str(s.leaderName, d.leaderName).slice(0, 120),
    teamName: str(s.teamName, d.teamName).slice(0, 120) || d.teamName,
    orgName: str(s.orgName, d.orgName).slice(0, 120),
    oneOnOneCadenceDays: clampInt(s.oneOnOneCadenceDays, 1, 90, d.oneOnOneCadenceDays),
    feedbackTargetDays: clampInt(s.feedbackTargetDays, 1, 365, d.feedbackTargetDays),
    feedbackLatencyTargetDays: clampInt(s.feedbackLatencyTargetDays, 1, 90, d.feedbackLatencyTargetDays),
    recognitionTargetDays: clampInt(s.recognitionTargetDays, 1, 365, d.recognitionTargetDays),
    goalCheckinDays: clampInt(s.goalCheckinDays, 1, 180, d.goalCheckinDays),
    delegationCheckinDays: clampInt(s.delegationCheckinDays, 1, 90, d.delegationCheckinDays),
    decisionReviewDays: clampInt(s.decisionReviewDays, 1, 365, d.decisionReviewDays),
    onboardingDays: clampInt(s.onboardingDays, 7, 365, d.onboardingDays),
    growthReviewDays: clampInt(s.growthReviewDays, 1, 365, d.growthReviewDays),
    caseReviewDays: clampInt(s.caseReviewDays, 1, 365, d.caseReviewDays),
    changeReviewDays: clampInt(s.changeReviewDays, 7, 365, d.changeReviewDays),
    negotiationReviewDays: clampInt(s.negotiationReviewDays, 1, 365, d.negotiationReviewDays),
    budgetWatchPct: clampInt(s.budgetWatchPct, 50, 100, d.budgetWatchPct),
    forecastAutoPropagate: s.forecastAutoPropagate !== false,
    forecastCoveragePct: clampInt(s.forecastCoveragePct, 50, 95, d.forecastCoveragePct),
    tempoDelegatedMaxDays: clampInt(s.tempoDelegatedMaxDays, 1, 90, d.tempoDelegatedMaxDays),
    tempoCrossCuttingMaxDays: clampInt(s.tempoCrossCuttingMaxDays, 1, 180, d.tempoCrossCuttingMaxDays),
    tempoBigBetMaxDays: clampInt(s.tempoBigBetMaxDays, 3, 365, d.tempoBigBetMaxDays),
    tempoBigBetValue: clampInt(s.tempoBigBetValue, 1000, 1000000000, d.tempoBigBetValue),
    tempoInfoHalfLifeDays: clampInt(s.tempoInfoHalfLifeDays, 1, 180, d.tempoInfoHalfLifeDays),
    tempoCoveragePct: clampInt(s.tempoCoveragePct, 50, 95, d.tempoCoveragePct),
    retentionHorizonDays: clampRetentionSetting(s.retentionHorizonDays, 30, 730, d.retentionHorizonDays),
    retentionRiskThresholdPct: clampRetentionSetting(s.retentionRiskThresholdPct, 3, 60, d.retentionRiskThresholdPct),
    retentionRiskIndexThreshold: Math.min(5, Math.max(1.05, Number.isFinite(Number(s.retentionRiskIndexThreshold)) && Number(s.retentionRiskIndexThreshold) > 0 ? Number(s.retentionRiskIndexThreshold) : d.retentionRiskIndexThreshold)),
    retentionEvidenceFloor: clampRetentionSetting(s.retentionEvidenceFloor, 3, 500, d.retentionEvidenceFloor),
    retentionPriorMonthlyHazardPct: clampRetentionSetting(Math.round(Number(s.retentionPriorMonthlyHazardPct) * 10), 1, 120, Math.round(d.retentionPriorMonthlyHazardPct * 10)) / 10,
    retentionPriorStrengthMonths: clampRetentionSetting(s.retentionPriorStrengthMonths, 1, 240, d.retentionPriorStrengthMonths),
    retentionRidge: (() => { const n = Number(s.retentionRidge); return !Number.isFinite(n) || n < 0 ? d.retentionRidge : Math.min(200, Math.round(n)); })(),
    retentionReplacementPct: clampRetentionSetting(s.retentionReplacementPct, 10, 300, d.retentionReplacementPct),
    retentionPromotionPct: clampRetentionSetting(s.retentionPromotionPct, 0, 50, d.retentionPromotionPct),
    retentionReviewDays: clampRetentionSetting(s.retentionReviewDays, 7, 365, d.retentionReviewDays),
    retentionAttentionHours: clampRetentionSetting(s.retentionAttentionHours, 1, 200, d.retentionAttentionHours),
    retentionAutoPropagate: s.retentionAutoPropagate !== false,
    tempoAutoPropagate: s.tempoAutoPropagate !== false,
    resilienceDrillDays: normalizeRetentionWindow(s.resilienceDrillDays, d.resilienceDrillDays),
    resilienceHhiWarn: clampInt(s.resilienceHhiWarn, 1000, 9000, d.resilienceHhiWarn),
    resilienceAutoPropagate: s.resilienceAutoPropagate !== false,
    couplingMinFitPct: clampInt(s.couplingMinFitPct, 10, 95, d.couplingMinFitPct),
    couplingTailDropPct: clampInt(s.couplingTailDropPct, 5, 60, d.couplingTailDropPct),
    couplingAutoPropagate: s.couplingAutoPropagate !== false,
    powerQuotaPct: clampInt(s.powerQuotaPct, 1, 100, d.powerQuotaPct),
    powerStaleDays: clampInt(s.powerStaleDays, 1, 365, d.powerStaleDays),
    powerFragileMargin: Math.min(0.5, Math.max(0.02, Math.round(num(s.powerFragileMargin, d.powerFragileMargin) * 100) / 100)),
    powerAutoPropagate: s.powerAutoPropagate !== false,
    // Influence Network Intelligence (Session 48): 0 = show every real tie;
    // higher values focus on the strong-tie backbone. Clamped so a corrupt
    // blob cannot produce an impossible threshold.
    networkTiePct: clampInt(s.networkTiePct, 0, 90, d.networkTiePct),
    networkAutoPropagate: s.networkAutoPropagate !== false,
    impactAlpha: [0.05, 0.1, 0.2].includes(Number(s.impactAlpha)) ? Number(s.impactAlpha) : d.impactAlpha,
    impactBaselineWeeks: clampInt(s.impactBaselineWeeks, 4, 26, d.impactBaselineWeeks),
    impactWindowWeeks: clampInt(s.impactWindowWeeks, 2, 13, d.impactWindowWeeks),
    impactAutoPropagate: s.impactAutoPropagate !== false,
    // Allocation Governor (Schema v33): 0% floor is a deliberate "off" for the
    // starvation check and survives normalization; the window is clamped to
    // a real look-back so a corrupt blob cannot make funding history vanish.
    allocationExplorationFloorPct: clampInt(s.allocationExplorationFloorPct, 0, 50, d.allocationExplorationFloorPct),
    allocationWindowDays: clampInt(s.allocationWindowDays, 30, 730, d.allocationWindowDays),
    allocationAutoPropagate: s.allocationAutoPropagate !== false,
    // Cognitive Load Governor (Schema v34): the saturation threshold and
    // overload-probability threshold are clamped to real bands; an invalid
    // throughput window falls back to eight weeks rather than silently
    // disabling the queue statistics.
    loadSaturationPct: clampInt(s.loadSaturationPct, 50, 100, d.loadSaturationPct),
    loadOverloadProbPct: clampInt(s.loadOverloadProbPct, 50, 99, d.loadOverloadProbPct),
    loadThroughputWindowWeeks: clampInt(s.loadThroughputWindowWeeks, 4, 26, d.loadThroughputWindowWeeks),
    loadAutoPropagate: s.loadAutoPropagate !== false,
    premiseWatchPct: clampInt(s.premiseWatchPct, 10, 90, d.premiseWatchPct),
    premiseBreachPct: clampInt(s.premiseBreachPct, 5, 85, d.premiseBreachPct),
    premiseHalfLifeDays: clampInt(s.premiseHalfLifeDays, 7, 365, d.premiseHalfLifeDays),
    premiseReviewDays: clampInt(s.premiseReviewDays, 7, 180, d.premiseReviewDays),
    premiseAutoPropagate: s.premiseAutoPropagate !== false,
    // Operating System Dynamics (Schema v37): the horizon and the healthy-WIP
    // convention are clamped to bands the integrator can actually reason about;
    // an invalid value falls back to the documented default rather than
    // silently switching the model off.
    dynamicsHorizonWeeks: clampInt(s.dynamicsHorizonWeeks, 4, 52, d.dynamicsHorizonWeeks),
    dynamicsTargetWipWeeks: clampInt(s.dynamicsTargetWipWeeks, 1, 12, d.dynamicsTargetWipWeeks),
    dynamicsPressureLagWeeks: clampInt(s.dynamicsPressureLagWeeks, 1, 12, d.dynamicsPressureLagWeeks),
    dynamicsQualityFixWeeks: clampInt(s.dynamicsQualityFixWeeks, 2, 26, d.dynamicsQualityFixWeeks),
    dynamicsRampWeeks: clampInt(s.dynamicsRampWeeks, 2, 26, d.dynamicsRampWeeks),
    dynamicsStructuralRiskPct: clampInt(s.dynamicsStructuralRiskPct, 30, 95, d.dynamicsStructuralRiskPct),
    dynamicsAutoPropagate: s.dynamicsAutoPropagate !== false,
    // Schema v38: the effort budget is clamped to a range the allocator can
    // enumerate honestly; a typo falls back to the documented default rather
    // than silently spending nothing (or an unbounded amount).
    capitalEffortBudget: clampInt(s.capitalEffortBudget, 1, 40, d.capitalEffortBudget),
    capitalWeightSaturation: clampWeight(s.capitalWeightSaturation, d.capitalWeightSaturation),
    capitalWeightThroughput: clampWeight(s.capitalWeightThroughput, d.capitalWeightThroughput),
    capitalWeightCapacity: clampWeight(s.capitalWeightCapacity, d.capitalWeightCapacity),
    capitalWeightWip: clampWeight(s.capitalWeightWip, d.capitalWeightWip),
    capitalAutoPropagate: s.capitalAutoPropagate !== false,
    strategyGapThresholdPct: clampInt(s.strategyGapThresholdPct, 5, 60, d.strategyGapThresholdPct),
    strategyBlindWipThresholdPct: clampInt(s.strategyBlindWipThresholdPct, 5, 100, d.strategyBlindWipThresholdPct),
    strategyDriftWindowDays: clampInt(s.strategyDriftWindowDays, 7, 90, d.strategyDriftWindowDays),
    strategyAutoPropagate: s.strategyAutoPropagate !== false,
    // Schema v43: the after-action conventions. Every value is clamped to a
    // range the terminal can defend, and a non-numeric value falls back to the
    // documented default rather than to zero — silently zeroing the review
    // allowance would make every review late as a side effect of a typo.
    retroWindowDays: clampInt(s.retroWindowDays, 14, 365, d.retroWindowDays),
    retroDueDays: clampInt(s.retroDueDays, 1, 60, d.retroDueDays),
    learningCoverageFloorPct: clampInt(s.learningCoverageFloorPct, 10, 100, d.learningCoverageFloorPct),
    learningAutoDraft: s.learningAutoDraft !== false,
    learningAutoPropagate: s.learningAutoPropagate !== false,
    // Schema v39: q is a rate in (0, 0.5]; a typo falls back to the documented
    // default rather than to 0, which would silently disable the detector.
    watchQ: (() => {
      const n = Number(s.watchQ);
      if (!Number.isFinite(n)) return d.watchQ;
      return Math.round(Math.min(0.5, Math.max(0.01, n)) * 1000) / 1000;
    })(),
    watchAlertBudget: clampInt(s.watchAlertBudget, 1, 20, d.watchAlertBudget),
    watchWindowDays: clampInt(s.watchWindowDays, 7, 90, d.watchWindowDays),
    watchTriageDays: clampInt(s.watchTriageDays, 1, 30, d.watchTriageDays),
    watchCooldownDays: clampInt(s.watchCooldownDays, 0, 60, d.watchCooldownDays),
    watchAutoPropagate: s.watchAutoPropagate !== false,
    hiringBaseRate: Math.min(0.95, Math.max(0.05, Math.round((Number(s.hiringBaseRate) || d.hiringBaseRate) * 100) / 100)),
    hiringStallDays: clampInt(s.hiringStallDays, 7, 180, d.hiringStallDays),
    interviewHoursPerStage: clampInt(s.interviewHoursPerStage, 1, 12, d.interviewHoursPerStage),
    // Zero is a deliberate "off". Anything invalid (negative, non-numeric)
    // falls back to the default rather than to 0: silently disabling a
    // data-minimisation reminder because of a typo is the wrong failure
    // direction, and the reminder never deletes anything by itself.
    candidateRetentionDays: normalizeRetentionWindow(s.candidateRetentionDays, d.candidateRetentionDays),
    capacityHoursPerWeek: clampInt(s.capacityHoursPerWeek, 1, 60, d.capacityHoursPerWeek),
    planningHorizonWeeks: clampInt(s.planningHorizonWeeks, 1, 26, d.planningHorizonWeeks),
    operationalLoadPct: clampInt(s.operationalLoadPct, 0, 80, d.operationalLoadPct),
    wipLimitPerPerson: clampInt(s.wipLimitPerPerson, 1, 12, d.wipLimitPerPerson),
    maxReportsPerManager: clampInt(s.maxReportsPerManager, 1, 30, d.maxReportsPerManager),
    simulationSeed: clampInt(s.simulationSeed, 1, 999999999, d.simulationSeed),
    simulationTrials: clampInt(s.simulationTrials, 200, 5000, d.simulationTrials),
    continuityHorizonDays: clampInt(s.continuityHorizonDays, 1, 90, d.continuityHorizonDays),
    continuityMinFitPct: clampInt(s.continuityMinFitPct, 1, 100, d.continuityMinFitPct),
    continuityAutoPropagate: s.continuityAutoPropagate !== false,
    continuityCommonCausePct: clampInt(s.continuityCommonCausePct, 0, 100, d.continuityCommonCausePct),
    continuitySecondShockPct: clampInt(s.continuitySecondShockPct, 0, 100, d.continuitySecondShockPct),
    measurementMetricCostPct: clampInt(s.measurementMetricCostPct, 0, 25, d.measurementMetricCostPct),
    measurementAutoPropagate: s.measurementAutoPropagate !== false,
    // Schema v51: merit & pay equity. The replacement multiplier is the only one
    // of these that changes money (it prices a departure), so it is bounded to a
    // defensible range rather than trusted; the rest are thresholds and switches
    // with explicit fallbacks so a corrupt blob cannot silently disable the
    // fairness audit.
    compReplacementMultiplier: Math.min(2, Math.max(0.1, Math.round(num(s.compReplacementMultiplier, d.compReplacementMultiplier) * 100) / 100)),
    compEquityFlagPp: clampInt(s.compEquityFlagPp, 1, 50, d.compEquityFlagPp),
    compAdverseImpactRatio: Math.min(1, Math.max(0.5, Math.round(num(s.compAdverseImpactRatio, d.compAdverseImpactRatio) * 100) / 100)),
    compMinGroupSize: clampInt(s.compMinGroupSize, 3, 50, d.compMinGroupSize),
    compCompressionTolerancePct: clampInt(s.compCompressionTolerancePct, 0, 50, d.compCompressionTolerancePct),
    compMaxAdjustPct: clampInt(s.compMaxAdjustPct, 1, 100, d.compMaxAdjustPct),
    compOutcomeReviewDays: clampInt(s.compOutcomeReviewDays, 30, 730, d.compOutcomeReviewDays),
    compAutoPropagate: s.compAutoPropagate !== false,
    // Schema v52: transition conventions. Bounded to real bands so a typo cannot
    // silently shorten a notice period or make the screen unfalsifiable.
    transitionNoticeDays: clampInt(s.transitionNoticeDays, 1, 365, d.transitionNoticeDays),
    transitionSeveranceMonthsPerYear: Math.min(3, Math.max(0, Math.round(num(s.transitionSeveranceMonthsPerYear, d.transitionSeveranceMonthsPerYear) * 4) / 4)),
    transitionSeveranceCapMonths: clampInt(s.transitionSeveranceCapMonths, 0, 24, d.transitionSeveranceCapMonths),
    transitionImpactRatio: Math.min(1, Math.max(0.5, Math.round(num(s.transitionImpactRatio, d.transitionImpactRatio) * 100) / 100)),
    transitionMinGroupSize: clampInt(s.transitionMinGroupSize, 3, 50, d.transitionMinGroupSize),
    transitionSurvivorLoadPct: clampInt(s.transitionSurvivorLoadPct, 10, 200, d.transitionSurvivorLoadPct),
    transitionHorizonDays: clampInt(s.transitionHorizonDays, 30, 730, d.transitionHorizonDays),
    transitionAutoPropagate: s.transitionAutoPropagate !== false,
    // Schema v53: structural conventions, bounded so a typo cannot make the
    // span band unfalsifiable or switch a measurement off as a side effect.
    orgSpanMin: clampInt(s.orgSpanMin, 1, 30, d.orgSpanMin),
    orgSpanMax: Math.max(clampInt(s.orgSpanMin, 1, 30, d.orgSpanMin) + 1, clampInt(s.orgSpanMax, 2, 40, d.orgSpanMax)),
    orgCoordinationHoursPerWeek: Math.min(12, Math.max(0, Math.round(num(s.orgCoordinationHoursPerWeek, d.orgCoordinationHoursPerWeek) * 10) / 10)),
    orgReviewHorizonDays: clampInt(s.orgReviewHorizonDays, 30, 730, d.orgReviewHorizonDays),
    orgAutoPropagate: s.orgAutoPropagate !== false,
    // Schema v54: information-value conventions, bounded so a typo cannot make
    // every decision look worth interrupting for, or switch a measurement off
    // as a side effect.
    voiBuyInfoThreshold: Math.min(1e9, Math.max(0, num(s.voiBuyInfoThreshold, d.voiBuyInfoThreshold))),
    voiBuyInfoSharePct: clampInt(s.voiBuyInfoSharePct, 0, 100, d.voiBuyInfoSharePct),
    voiConcentrationThreshold: clampInt(s.voiConcentrationThreshold, 2, 50, d.voiConcentrationThreshold),
    voiNearTiePct: clampInt(s.voiNearTiePct, 0, 50, d.voiNearTiePct),
    voiReviewHorizonDays: clampInt(s.voiReviewHorizonDays, 30, 730, d.voiReviewHorizonDays),
    voiMinScoredFrames: clampInt(s.voiMinScoredFrames, 1, 20, d.voiMinScoredFrames),
    voiAutoPropagate: s.voiAutoPropagate !== false,
    // Schema v57: attention-market conventions, bounded so a typo cannot switch
    // the optimisation off or turn the budget into an unbounded week.
    attBudgetHours: Math.min(200, Math.max(0, num(s.attBudgetHours, d.attBudgetHours))),
    attHandoffSharePct: clampInt(s.attHandoffSharePct, 0, 100, d.attHandoffSharePct),
    attMinSamples: clampInt(s.attMinSamples, 1, 50, d.attMinSamples),
    attHorizonDays: clampInt(s.attHorizonDays, 1, 365, d.attHorizonDays),
    attLeaderSharePct: Math.min(100, Math.max(0.5, num(s.attLeaderSharePct, d.attLeaderSharePct))),
    attHoursPerEffortDay: Math.min(24, Math.max(0.5, num(s.attHoursPerEffortDay, d.attHoursPerEffortDay))),
    attMinRatioPerHour: Math.min(1e9, Math.max(0, num(s.attMinRatioPerHour, d.attMinRatioPerHour))),
    // Schema v59: signal-path conventions, bounded so a typo cannot declare a
    // perfect channel or a blind one, and cannot make the blind floor
    // unfalsifiable.
    sigTransmitPct: clampInt(s.sigTransmitPct, 5, 99, d.sigTransmitPct),
    sigFalseAlarmPct: clampInt(s.sigFalseAlarmPct, 0, 99, d.sigFalseAlarmPct),
    sigRelayLagDays: clampInt(s.sigRelayLagDays, 0, 60, d.sigRelayLagDays),
    sigCadenceTargetDays: clampInt(s.sigCadenceTargetDays, 1, 60, d.sigCadenceTargetDays),
    sigCadenceHoursPerHop: Math.min(20, Math.max(0, num(s.sigCadenceHoursPerHop, d.sigCadenceHoursPerHop))),
    sigSkipLevelPct: clampInt(s.sigSkipLevelPct, 1, 99, d.sigSkipLevelPct),
    sigSkipLevelFalsePct: clampInt(s.sigSkipLevelFalsePct, 0, 99, d.sigSkipLevelFalsePct),
    sigSkipLevelLagDays: clampInt(s.sigSkipLevelLagDays, 0, 180, d.sigSkipLevelLagDays),
    sigSkipLevelHoursPerWeek: Math.min(40, Math.max(0, num(s.sigSkipLevelHoursPerWeek, d.sigSkipLevelHoursPerWeek))),
    sigEscalationPct: clampInt(s.sigEscalationPct, 1, 99, d.sigEscalationPct),
    sigEscalationFalsePct: clampInt(s.sigEscalationFalsePct, 0, 99, d.sigEscalationFalsePct),
    sigEscalationLagDays: clampInt(s.sigEscalationLagDays, 0, 90, d.sigEscalationLagDays),
    sigEscalationHours: Math.min(200, Math.max(0, num(s.sigEscalationHours, d.sigEscalationHours))),
    sigReviewLiftPp: clampInt(s.sigReviewLiftPp, 0, 50, d.sigReviewLiftPp),
    sigReviewHoursPerHop: Math.min(40, Math.max(0, num(s.sigReviewHoursPerHop, d.sigReviewHoursPerHop))),
    sigMonitoringPct: clampInt(s.sigMonitoringPct, 1, 99, d.sigMonitoringPct),
    sigMonitoringFalsePct: clampInt(s.sigMonitoringFalsePct, 0, 99, d.sigMonitoringFalsePct),
    sigMonitoringLagDays: clampInt(s.sigMonitoringLagDays, 0, 90, d.sigMonitoringLagDays),
    sigMonitoringHours: Math.min(200, Math.max(0, num(s.sigMonitoringHours, d.sigMonitoringHours))),
    sigHourValue: Math.min(1e7, Math.max(1, num(s.sigHourValue, d.sigHourValue))),
    sigBlindFloorPct: clampInt(s.sigBlindFloorPct, 1, 99, d.sigBlindFloorPct),
    sigBlindDepth: clampInt(s.sigBlindDepth, 1, 20, d.sigBlindDepth),
    sigExposureFloor: Math.min(1e9, Math.max(0, num(s.sigExposureFloor, d.sigExposureFloor))),
    sigUnderReachPp: clampInt(s.sigUnderReachPp, 1, 90, d.sigUnderReachPp),
    sigReviewHorizonDays: clampInt(s.sigReviewHorizonDays, 7, 730, d.sigReviewHorizonDays),
    sigMaxDepth: clampInt(s.sigMaxDepth, 1, 12, d.sigMaxDepth),
    sigAutoPropagate: s.sigAutoPropagate !== false,
    // Schema v61: coupled-load conventions, bounded so a typo cannot declare a
    // one-decision bottleneck, an unbounded wait or an impossible window, and
    // cannot switch the measurement off as a side effect.
    couplingBottleneckActors: clampInt(s.couplingBottleneckActors, 1, 20, d.couplingBottleneckActors),
    couplingBottleneckDecisions: clampInt(s.couplingBottleneckDecisions, 1, 200, d.couplingBottleneckDecisions),
    couplingHandoffMaxChain: clampInt(s.couplingHandoffMaxChain, 1, 12, d.couplingHandoffMaxChain),
    couplingDelayThresholdDays: clampInt(s.couplingDelayThresholdDays, 0, 365, d.couplingDelayThresholdDays),
    couplingMultiplierThreshold: Math.min(100, Math.max(1, num(s.couplingMultiplierThreshold, d.couplingMultiplierThreshold))),
    couplingServiceDays: clampInt(s.couplingServiceDays, 1, 90, d.couplingServiceDays),
    couplingWindowDays: clampInt(s.couplingWindowDays, 1, 365, d.couplingWindowDays),
    couplingMinObligations: clampInt(s.couplingMinObligations, 0, 50, d.couplingMinObligations),
    coupledLoadAutoPropagate: s.coupledLoadAutoPropagate !== false,
    // Schema v62: Performance Recovery conventions, bounded so a typo cannot
    // declare a one-observation plan, an unbounded window or a zero-day
    // review, and cannot switch the audit off as a side effect.
    perfMinObservations: clampInt(s.perfMinObservations, 1, 20, d.perfMinObservations),
    perfEvidenceWindowDays: clampInt(s.perfEvidenceWindowDays, 7, 730, d.perfEvidenceWindowDays),
    perfReviewHorizonDays: clampInt(s.perfReviewHorizonDays, 7, 365, d.perfReviewHorizonDays),
    perfStaleDays: clampInt(s.perfStaleDays, 1, 180, d.perfStaleDays),
    perfReplacementMonths: Math.min(24, Math.max(0, num(s.perfReplacementMonths, d.perfReplacementMonths))),
    perfEmployerLoadPct: clampInt(s.perfEmployerLoadPct, 0, 100, d.perfEmployerLoadPct),
    perfWorkdaysPerYear: clampInt(s.perfWorkdaysPerYear, 100, 366, d.perfWorkdaysPerYear),
    perfHourValue: Math.min(100000, Math.max(0, num(s.perfHourValue, d.perfHourValue))),
    perfSbiFloor: clampInt(s.perfSbiFloor, 0, 4, d.perfSbiFloor),
    perfAutoPropagate: s.perfAutoPropagate !== false,
    // Schema v63: delivery-survival conventions, bounded so a typo cannot
    // declare a one-item sample, a zero-day horizon or a 100% risk floor, and
    // cannot switch the readings off as a side effect.
    survHorizonDays: clampInt(s.survHorizonDays, 1, 180, d.survHorizonDays),
    survMinAtRisk: clampInt(s.survMinAtRisk, 2, 100, d.survMinAtRisk),
    survRiskFloorPct: clampInt(s.survRiskFloorPct, 0, 100, d.survRiskFloorPct),
    survAbandonSharePct: clampInt(s.survAbandonSharePct, 1, 100, d.survAbandonSharePct),
    survStaleDays: clampInt(s.survStaleDays, 1, 365, d.survStaleDays),
    survBiasFloor: clampInt(s.survBiasFloor, 3, 100, d.survBiasFloor),
    survMaxPredictions: clampInt(s.survMaxPredictions, 1, 200, d.survMaxPredictions),
    // The bucket string is validated as a list of ascending positive day
    // boundaries; anything else falls back to the declared default rather than
    // producing a negative-width bucket.
    survHazardBuckets: (() => {
      const raw = String(s.survHazardBuckets ?? d.survHazardBuckets);
      const parts = raw.split(',').map((part) => Number(part.trim())).filter((n) => Number.isFinite(n) && n > 0 && n <= 3650);
      const unique = [...new Set(parts)].sort((a, b) => a - b).slice(0, 4);
      return unique.length ? unique.join(',') : d.survHazardBuckets;
    })(),
    survAutoPropagate: s.survAutoPropagate !== false,
    // Schema v64: cost-of-waiting conventions, bounded so a typo cannot
    // declare a zero-week erosion window, a 1000-week scenario, or an
    // unbounded certificate pile, and cannot switch the rules off as a side
    // effect.
    waitErosionWeeks: clampInt(s.waitErosionWeeks, 1, 52, d.waitErosionWeeks),
    waitScenarioWeeks: (() => {
      const raw = String(s.waitScenarioWeeks ?? d.waitScenarioWeeks);
      const parts = raw.split(',').map((part) => Number(part.trim())).filter((n) => Number.isFinite(n) && n >= 1 && n <= 52);
      const unique = [...new Set(parts)].sort((a, b) => a - b).slice(0, 6);
      return unique.length ? unique.join(',') : d.waitScenarioWeeks;
    })(),
    waitTriageThreshold: Math.min(1e12, Math.max(0, num(s.waitTriageThreshold, d.waitTriageThreshold))),
    waitConfidenceFloor: clampInt(s.waitConfidenceFloor, 2, 100, d.waitConfidenceFloor),
    waitMaxTasksPerScan: clampInt(s.waitMaxTasksPerScan, 0, 10, d.waitMaxTasksPerScan),
    waitMaxPriceTasks: clampInt(s.waitMaxPriceTasks, 0, 10, d.waitMaxPriceTasks),
    waitMaxLinks: clampInt(s.waitMaxLinks, 1, 200, d.waitMaxLinks),
    waitExposureCap: clampInt(s.waitExposureCap, 10, 200, d.waitExposureCap),
    waitAutoPropagate: s.waitAutoPropagate !== false,
    // Schema v65: Leadership Parity & Standard Consistency conventions.
    parityWindowDays: clampInt(s.parityWindowDays, 30, 365, d.parityWindowDays),
    parityMinTeam: clampInt(s.parityMinTeam, 3, 25, d.parityMinTeam),
    parityRampFloorDays: clampInt(s.parityRampFloorDays, 0, 180, d.parityRampFloorDays),
    parityGiniWarn: Math.round(Math.min(0.85, Math.max(0.15, num(s.parityGiniWarn, d.parityGiniWarn))) * 100) / 100,
    parityPromiseGapWarnPp: clampInt(s.parityPromiseGapWarnPp, 10, 80, d.parityPromiseGapWarnPp),
    parityReviewHorizonDays: clampInt(s.parityReviewHorizonDays, 7, 180, d.parityReviewHorizonDays),
    parityMaxTasksPerScan: clampInt(s.parityMaxTasksPerScan, 0, 10, d.parityMaxTasksPerScan),
    parityAuditCap: clampInt(s.parityAuditCap, 10, 200, d.parityAuditCap),
    parityAutoPropagate: s.parityAutoPropagate !== false,
    // Schema v66: Evidence Terminal conventions.
    evidenceMinPoolStudies: clampInt(s.evidenceMinPoolStudies, 2, 20, d.evidenceMinPoolStudies),
    evidenceMinHeterogeneity: clampInt(s.evidenceMinHeterogeneity, 2, 50, d.evidenceMinHeterogeneity),
    evidenceMinEggerStudies: clampInt(s.evidenceMinEggerStudies, 3, 50, d.evidenceMinEggerStudies),
    evidenceMinResolutions: clampInt(s.evidenceMinResolutions, 3, 50, d.evidenceMinResolutions),
    evidenceHorizonDecisions: clampInt(s.evidenceHorizonDecisions, 1, 200, d.evidenceHorizonDecisions),
    evidenceExploreWeight: Math.round(Math.min(5, Math.max(0, num(s.evidenceExploreWeight, d.evidenceExploreWeight))) * 100) / 100,
    evidenceAlpha: [0.2, 0.1, 0.05].includes(Number(s.evidenceAlpha)) ? Number(s.evidenceAlpha) : d.evidenceAlpha,
    evidenceReviewDays: clampInt(s.evidenceReviewDays, 1, 365, d.evidenceReviewDays),
    evidenceMaxTasksPerScan: clampInt(s.evidenceMaxTasksPerScan, 0, 10, d.evidenceMaxTasksPerScan),
    evidenceMaxCaseLinks: clampInt(s.evidenceMaxCaseLinks, 0, 50, d.evidenceMaxCaseLinks),
    evidenceReviewCap: clampInt(s.evidenceReviewCap, 5, 200, d.evidenceReviewCap),
    evidenceAutoPropagate: s.evidenceAutoPropagate !== false,
    // Schema v67: strictly bounded Consequence Lab conventions.
    consequenceTriageWeekly: Math.min(1e12, Math.max(0, num(s.consequenceTriageWeekly, d.consequenceTriageWeekly))),
    consequenceMinExits: clampInt(s.consequenceMinExits, 2, 20, d.consequenceMinExits),
    consequenceMaxLinks: clampInt(s.consequenceMaxLinks, 1, 24, d.consequenceMaxLinks),
    consequenceReviewCap: clampInt(s.consequenceReviewCap, 5, 60, d.consequenceReviewCap),
    consequenceAutoPropagate: s.consequenceAutoPropagate !== false,
    // Schema v68: Deferral Option conventions. The step count is capped so a
    // hand-edited backup cannot block the main thread on a 10,000-step tree.
    deferralMinObservations: clampInt(s.deferralMinObservations, 2, 50, d.deferralMinObservations),
    deferralSigmaFloorPct: clampInt(s.deferralSigmaFloorPct, 1, 200, d.deferralSigmaFloorPct),
    deferralSteps: clampInt(s.deferralSteps, 20, 400, d.deferralSteps),
    deferralDiscountPct: clampInt(s.deferralDiscountPct, 0, 30, d.deferralDiscountPct),
    deferralMaxHorizonDays: clampInt(s.deferralMaxHorizonDays, 7, 730, d.deferralMaxHorizonDays),
    deferralWatchBandPct: clampInt(s.deferralWatchBandPct, 0, 50, d.deferralWatchBandPct),
    deferralMaterialityPct: clampInt(s.deferralMaterialityPct, 1, 25, d.deferralMaterialityPct),
    deferralReviewCap: clampInt(s.deferralReviewCap, 5, 40, d.deferralReviewCap),
    deferralAutoPropagate: s.deferralAutoPropagate !== false,
    deferralPortfolioAutoPropagate: s.deferralPortfolioAutoPropagate !== false,
    deferralPortfolioMaxMembers: clampInt(s.deferralPortfolioMaxMembers, 2, 8, d.deferralPortfolioMaxMembers),
    deferralPortfolioPaths: clampInt(s.deferralPortfolioPaths, 500, 20000, d.deferralPortfolioPaths),
    deferralPortfolioSeed: clampInt(s.deferralPortfolioSeed, 1, 2147483647, d.deferralPortfolioSeed),
    deferralPortfolioGridDays: clampInt(s.deferralPortfolioGridDays, 1, 7, d.deferralPortfolioGridDays),
    deferralPortfolioTailPct: clampInt(s.deferralPortfolioTailPct, 50, 99, d.deferralPortfolioTailPct),
    deferralPortfolioConcentrationPct: clampInt(s.deferralPortfolioConcentrationPct, 10, 100, d.deferralPortfolioConcentrationPct),
    deferralPortfolioJointLapsePp: clampInt(s.deferralPortfolioJointLapsePp, 1, 50, d.deferralPortfolioJointLapsePp),
    deferralPortfolioReviewCap: clampInt(s.deferralPortfolioReviewCap, 5, 20, d.deferralPortfolioReviewCap),
    // Schema v70: the Signal Integrity Board's declared conventions. A typo in
    // a floor is clamped to a declared band, never read as "switch the
    // measurement off"; the spending function falls back to the documented
    // default rather than to an unknown branch.
    integrityAutoPropagate: s.integrityAutoPropagate !== false,
    integrityAlphaPct: clampInt(s.integrityAlphaPct, 1, 50, d.integrityAlphaPct),
    integrityPlannedLooks: clampInt(s.integrityPlannedLooks, 2, 260, d.integrityPlannedLooks),
    integritySpending: s.integritySpending === 'obf' || s.integritySpending === 'pocock'
      ? s.integritySpending : d.integritySpending,
    integrityRhoPct: clampInt(s.integrityRhoPct, 0, 90, d.integrityRhoPct),
    integrityPrecisionFloorPct: clampInt(s.integrityPrecisionFloorPct, 20, 95, d.integrityPrecisionFloorPct),
    integrityMinVerdicts: clampInt(s.integrityMinVerdicts, 2, 40, d.integrityMinVerdicts),
    integritySpendWarnPct: clampInt(s.integritySpendWarnPct, 50, 100, d.integritySpendWarnPct),
    integrityLooksWarnPct: clampInt(s.integrityLooksWarnPct, 5, 90, d.integrityLooksWarnPct),
    integritySurpriseBrier: Math.min(0.49, Math.max(0.05, num(s.integritySurpriseBrier, d.integritySurpriseBrier))),
    integrityHorizonAlerts: clampInt(s.integrityHorizonAlerts, 1, 40, d.integrityHorizonAlerts),
    integrityReviewCap: clampInt(s.integrityReviewCap, 5, 20, d.integrityReviewCap),
    integrityLookCap: clampInt(s.integrityLookCap, 60, 400, d.integrityLookCap),
    integrityVerdictCap: clampInt(s.integrityVerdictCap, 100, 1200, d.integrityVerdictCap),
    // Schema v71: Borrowed Evidence conventions. Every band matches
    // CREDIBILITY_CLAMPS; a typo is clamped into the band, never read as
    // "stop requiring evidence".
    credibilityAutoPropagate: s.credibilityAutoPropagate !== false,
    credibilityDecisivePct: clampInt(s.credibilityDecisivePct, 80, 99, d.credibilityDecisivePct),
    credibilityMinUnitN: clampInt(s.credibilityMinUnitN, 2, 20, d.credibilityMinUnitN),
    credibilityHeterogeneityAlphaPct: clampInt(s.credibilityHeterogeneityAlphaPct, 1, 20, d.credibilityHeterogeneityAlphaPct),
    credibilityI2WarnPct: clampInt(s.credibilityI2WarnPct, 25, 90, d.credibilityI2WarnPct),
    credibilityInfluenceTolerancePct: clampInt(s.credibilityInfluenceTolerancePct, 5, 50, d.credibilityInfluenceTolerancePct),
    credibilityMinUnits: clampInt(s.credibilityMinUnits, 3, 12, d.credibilityMinUnits),
    credibilityMinObservations: clampInt(s.credibilityMinObservations, 4, 200, d.credibilityMinObservations),
    credibilityHorizonN: clampInt(s.credibilityHorizonN, 1, 40, d.credibilityHorizonN),
    credibilityReviewDays: clampInt(s.credibilityReviewDays, 7, 120, d.credibilityReviewDays),
    credibilitySkillFloor: clampInt(s.credibilitySkillFloor, 3, 40, d.credibilitySkillFloor),
    credibilitySurpriseBrier: Math.min(0.49, Math.max(0.05, num(s.credibilitySurpriseBrier, d.credibilitySurpriseBrier))),
    credibilityPremiseFloorPct: clampInt(s.credibilityPremiseFloorPct, 20, 95, d.credibilityPremiseFloorPct),
    credibilityDelegationFloorPct: clampInt(s.credibilityDelegationFloorPct, 20, 95, d.credibilityDelegationFloorPct),
    credibilityCheckpointDays: clampInt(s.credibilityCheckpointDays, 3, 90, d.credibilityCheckpointDays),
    // Schema v72: Confidence Transport conventions. Bands match
    // CONFIDENCE_CLAMPS exactly; a typo is clamped into the band, never read as
    // "stop requiring evidence" or "let an unfitted map speak".
    // Schema v73: only the follow-up write is pauseable.
    responseAutoPropagate: s.responseAutoPropagate !== false,
    bundleAutoPropagate: s.bundleAutoPropagate !== false,
    executionAutoReconcile: s.executionAutoReconcile !== false,
    settlementAutoPropagate: s.settlementAutoPropagate !== false,
    settlementFidelityFloorPct: clampInt(s.settlementFidelityFloorPct, 50, 95, d.settlementFidelityFloorPct),
    settlementStaleDays: clampInt(s.settlementStaleDays, 1, 60, d.settlementStaleDays),
    ...normalizeCounterfactualSettings(s),
    ...normalizeReliabilitySettings(s),
    ...normalizeCouplingSettings(s),
    ...normalizeSupplySettings(s),
    ...normalizeSolvencySettings(s),
    ...normalizeChainSettings(s),
    ...normalizeScepticSettings(s),
    ...normalizeSuccessionSettings(s),
    confidenceAutoPropagate: s.confidenceAutoPropagate !== false,
    confidenceMinSamples: clampInt(s.confidenceMinSamples, 8, 400, d.confidenceMinSamples),
    confidenceMinTrain: clampInt(s.confidenceMinTrain, 4, 200, d.confidenceMinTrain),
    confidenceMinScored: clampInt(s.confidenceMinScored, 6, 400, d.confidenceMinScored),
    confidenceMaterialBrierPct: clampInt(s.confidenceMaterialBrierPct, 0, 500, d.confidenceMaterialBrierPct),
    confidenceGapPct: clampInt(s.confidenceGapPct, 5, 40, d.confidenceGapPct),
    confidenceReviewDays: clampInt(s.confidenceReviewDays, 7, 180, d.confidenceReviewDays),
    confidenceSkillFloor: clampInt(s.confidenceSkillFloor, 2, 40, d.confidenceSkillFloor),
    confidenceShortDays: clampInt(s.confidenceShortDays, 3, 60, d.confidenceShortDays),
    confidenceLongDays: clampInt(s.confidenceLongDays, 30, 365, d.confidenceLongDays),
    confidenceBins: clampInt(s.confidenceBins, 3, 20, d.confidenceBins),
    confidenceBootstrap: clampInt(s.confidenceBootstrap, 100, 4000, d.confidenceBootstrap),
    confidenceLiveCap: clampInt(s.confidenceLiveCap, 1, 20, d.confidenceLiveCap),
    confidenceTaskCap: clampInt(s.confidenceTaskCap, 1, 20, d.confidenceTaskCap),
    // Schema v55: Decision Portfolio Engine conventions.
    portfolioReviewIntervalDays: clampInt(s.portfolioReviewIntervalDays, 0, 365, d.portfolioReviewIntervalDays),
    portfolioCarryCostThreshold: Math.min(1e9, Math.max(0, num(s.portfolioCarryCostThreshold, d.portfolioCarryCostThreshold))),
    portfolioAutoPropagate: s.portfolioAutoPropagate !== false,
    pulseMinResponses: clampInt(s.pulseMinResponses, 3, 25, d.pulseMinResponses),
    idleLockMinutes: clampInt(s.idleLockMinutes, 0, 480, d.idleLockMinutes),
    // ADR-0076: a declared seat must survive reload. Fail-closed: a malformed
    // id is dropped to the undeclared operator view, never coerced into a seat.
    ...normalizeSeatSettings(s),
    ...normalizeMissionSettings(s),
    ...normalizeOutcomeSettings(s),
    ...normalizeMandateSettings(s),
    ...normalizeAuthorityCalibrationSettings(s),
    ...normalizeRouterSettings(s),
    ...normalizeConcordanceSettings(s),
    ...normalizeOperatingModelSettings(s),
    ...normalizeCarryoverSettings(s),
    ...normalizeDisclosureSettings(s),
    ...normalizeJurSettings(s),
    // ADR-0088: the Board Room's declared conventions.
    ...normalizeBoardSettings(s),
    ...normalizeSealSettings(s),
    ...normalizeCatchballSettings(s),
    ...normalizeStrategyCycleSettings(s),
    // ADR-0090: the federation window, span floor and cell floor, clamped.
    ...normalizeFederationSettings(s),
    ...normalizeEscalationSettings(s),
    ...normalizeValueStreamSettings(s),
    ...normalizeCarryoverSettings(s),
    ...normalizeEnvoySettings(s),
    ...normalizeIdentitySettings(s),
    ...normalizeCarryoverSettings(s),
    ...normalizeCadenceSettings(s),
    ...normalizeProspectiveSettings(s),
    ...normalizeRobustAllocationSettings(s),
    ...normalizeClearingSettings(s),
    // ADR-0099: the freeze-line window, edge floor, cell floor and drop
    // threshold, clamped.
    ...normalizeFreezeLineSettings(s),
    // ADR-0100: the calibration conventions, and the adopted ladder — clamped to
    // the declared table's own band and forced strictly increasing, so a
    // hand-edited settings object cannot run a ladder downhill.
    ...normalizeSpanCalibrationSettings(s),
    // ADR-0101: the reputational-capital conventions — window, floors, premium
    // convexity, breach weight, half-life, ask and publishing floor — clamped,
    // plus the declared per-class hazard rates every cell is anchored on.
    ...normalizeReputationSettings(s),
    // ADR-0102: the hindsight-lock conventions — quality floor, coverage share,
    // fact, gap and settled floors, cell floor and review grace — clamped.
    ...normalizeHindsightSettings(s),
    // ADR-0103: the epistemic-ledger conventions — harvest window, escalation
    // age, declared expiry, the four floors and the two coverage bands —
    // clamped and printed, never fitted.
    ...normalizeEpistemicSettings(s),
    // ADR-0104: the diligence-ledger conventions — knowable floor, coverage
    // floor, class floor, dark ceiling, forecast horizon, review horizon and
    // stale horizon — clamped and printed, never fitted from the record.
    ...normalizeDiligenceSettings(s),
    ...normalizeDutyCoverageSettings(s),
    ...normalizeDutyStandbySettings(s, DUTY_STANDBY_BOUNDS, DUTY_STANDBY_DEFAULTS),
    ...normalizePrioritySettings(s),
    // ADR-0144: the contradiction-audit conventions. Listed here because
    // `normalizeSettings` rebuilds the settings object field by field — a key
    // spread into DEFAULT_SETTINGS but not named here would be silently DROPPED
    // on every load, and the printed convention would be a number the record
    // does not hold.
    ...normalizeContradictionSettings(s),
    // ADR-0147: listed here because `normalizeSettings` rebuilds the settings
    // object field by field — a key spread into DEFAULT_SETTINGS but not named
    // here would be silently DROPPED on every load, and the printed answer window
    // would be a number the record does not hold.
    ...normalizeReviewStewardshipSettings(s),
    // ADR-0148: listed here for the same reason — a key spread into
    // DEFAULT_SETTINGS but not named here would be silently DROPPED on every
    // load, and the printed consent windows would be numbers the record does
    // not hold.
    ...normalizeLineConsentSettings(s),
    // ADR-0150: listed here because `normalizeSettings` rebuilds the settings
    // object field by field — a key spread into DEFAULT_SETTINGS but not named
    // here would be silently DROPPED on every load, and the printed onboarding
    // windows would be numbers the record does not hold.
    ...normalizeOnboardingMatrixSettings(s),
    // ADR-0151: listed here because `normalizeSettings` rebuilds the settings
    // object field by field — a key spread into DEFAULT_SETTINGS but not named
    // here would be silently DROPPED on every load, and the printed
    // reconciliation windows would be numbers the record does not hold.
    ...normalizeAssessmentReconciliationSettings(s),
    // ADR-0152: listed here because `normalizeSettings` rebuilds the settings
    // object field by field — a key spread into DEFAULT_SETTINGS but not named
    // here would be silently DROPPED on every load, and the printed settlement
    // window would be a number the record does not hold.
    ...normalizeLineExitSettings(s),
    // ADR-0157: listed here because `normalizeSettings` rebuilds the settings
    // object field by field — a key spread into DEFAULT_SETTINGS but not named
    // here would be silently DROPPED on every load, and the printed term and
    // warning windows would be numbers the record does not hold.
    ...normalizeLineReaffirmationSettings(s),
    ...normalizeAuthorityReaffirmationSettings(s),
    ...normalizeMatrixInterfaceSettings(s),
    ...normalizeDoaSettings(s),
    ...normalizeOneOnOneLineSettings(s),
    ...normalizeHiringLineSettings(s),
    // ADR-0177: named here because this object is rebuilt field by field — a
    // key not listed would be dropped on every load.
    ...normalizeTransferPriceSettings(s),
    ...normalizeAgendaSettings(s),
    // ADR-0180 (Session 246): SIX engines declared conventions this object never
    // named, so every load discarded them — 30 keys, with no warning. Three of
    // them have a setter a leader can reach (`matrixSetConventions`,
    // `differencesSetConventions`, `fitSetConventions`): a paused propagation
    // switch came back ON and a raised disclosure floor fell back to its
    // default at the next reload. Each engine's OWN normalizer is spread here,
    // so the bounds are declared once and the loaded value is exactly the value
    // the engine reads. `tests/app/convention-persistence.test.mjs` now fails
    // the build when any exported `normalize*Settings` is not carried here —
    // the guard the eight comments above asked for and nothing enforced.
    ...normalizeMatrixSettings(s),
    ...normalizeDelegationLineSettings(s),
    ...normalizeWorkTurnSettings(s),
    // ADR-0182: named here because this object is rebuilt field by field — a
    // key not listed would be dropped on every load, and the grace and default
    // windows printed by the register would be numbers the record does not hold.
    ...normalizePausePermitSettings(s),
    // ADR-0184: named here because this object is rebuilt field by field — a key
    // not listed would be dropped on every load, and the exposure floor the
    // register prints would be a number the record does not hold.
    ...normalizeWorkforceFlowSettings(s),
    // ADR-0186: named here for the same reason — the read window and the pool
    // disclosure floor are printed by the panel, so they must be carried.
    ...normalizeChangeSaturationSettings(s),
    // ADR-0188: named here for the same reason — the escalation window and the
    // coverage floor are printed by the panel, so a reload must carry them.
    ...normalizeAarCorroborationSettings(s),
    ...normalizeDependencyCycleSettings(s),
    // ADR-0189: named here because this object is rebuilt field by field — a
    // key not listed would be dropped on every load, and the window the panel
    // prints would be a number the record does not hold.
    ...normalizeInterfaceAlignmentSettings(s),
    ...normalizeStandardWorkSettings(s),
    ...normalizeStructureHistorySettings(s),
    ...normalizeDifferencesSettings(s),
    ...normalizeFitSettings(s),
    ...normalizeLeaderCalibrationSettings(s),
    chainAdoptedHorizons: normalizeAdoptedHorizons(s.chainAdoptedHorizons, DECLARED_HORIZONS),
    chainAdoptedOn: /^\d{4}-\d{2}-\d{2}$/.test(String(s.chainAdoptedOn || '')) ? s.chainAdoptedOn : null,
    chainAdoptedReadingId: typeof s.chainAdoptedReadingId === 'string' && s.chainAdoptedReadingId.trim()
      ? s.chainAdoptedReadingId.trim().slice(0, 80)
      : null,
  };
}

/**
 * Topics a person has asked to raise in a 1:1. One line each, trimmed,
 * de-duplicated, and bounded by the ONE declared retention policy.
 *
 * This function used to keep the FIRST twelve lines and stop, while every rule
 * that writes a prompt appended at the end and bounded itself with
 * `.slice(-30)`. The two caps contradicted each other: the prompt a rule wrote
 * today was the first thing a reload deleted, silently. The policy now lives in
 * `talkingPointPolicy.js` and decides membership by authorship (the person's
 * own lines first, then engine prompts newest-first), so writing a prompt can
 * no longer destroy the prompt just written, and the ledger's eviction badge
 * can name the line the reload will actually take.
 *
 * Stored as a plain string array so it stays readable in an export and survives
 * a copy/paste into the person dialog.
 */
export function normalizeTalkingPoints(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const unique = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const text = raw.trim().replace(/\s+/g, ' ').slice(0, 200);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(text);
  }
  return retainQueue(unique).keep;
}

/**
 * The waiting list as it will ACTUALLY be stored, plus an honest account of
 * every line the declared cap is about to drop. Callers that can print (the
 * person action layer, the agenda ledger) use this to close the silent-loss
 * channel; `normalizeTalkingPoints` keeps its simple contract for the dozens of
 * places that only need the array.
 */
export function applyTalkingPointPolicy(value) {
  if (!Array.isArray(value)) return { kept: [], dropped: [], droppedN: 0, cap: TALKING_QUEUE_CAP, sentence: null };
  const seen = new Set();
  const unique = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const text = raw.trim().replace(/\s+/g, ' ').slice(0, 200);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(text);
  }
  const result = retainQueue(unique);
  return {
    kept: result.keep,
    dropped: result.dropped,
    droppedN: result.droppedN,
    droppedEngineN: result.droppedEngineN,
    droppedPersonN: result.droppedPersonN,
    cap: result.cap,
    sentence: result.droppedN
      ? `${result.droppedN} waiting-list line(s) did not fit the declared ${result.cap}-prompt cap and were not stored. The person’s own topics are kept first and engine prompts survive newest-first.`
      : null,
  };
}

function normalizeAgenda(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(isPlainObject)
    .map((a, i) => ({
      id: str(a.id) || `ag-${i}`,
      text: str(a.text).slice(0, 300),
      done: a.done === true,
      source: str(a.source, 'manual').slice(0, 40),
    }))
    .filter((a) => a.text);
}

/**
 * A 1:1 action carries its own follow-through history so a promise can never
 * be "carried forward" invisibly:
 *   completedInMeetingId  the 1:1 where completion was confirmed face to face
 *                         (null when it was ticked off outside a conversation)
 *   carriedFrom           the exact action this one replaced, when it was
 *                         explicitly moved into a later meeting
 *   carriedTo*            the successor, set on the original at the same time
 *   dropped*              an explicit decision not to do it, with the reason
 *   owner                 who owes it (`them` / `leader` / `shared` / null)
 * A promise can be done, dropped or carried forward — never two at once.
 * `done` wins because a completion is evidence; a stale link is not.
 *
 * `owner` is only written where ownership is meaningful (1:1 actions). A GROW
 * "will" action is the report's by definition, so it is not given the field.
 */
function normalizeActions(items, { withOwner = false } = {}) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(isPlainObject)
    .map((a, i) => {
      const done = a.done === true;
      const dropped = !done && a.dropped === true;
      const carriedFrom = isPlainObject(a.carriedFrom) && str(a.carriedFrom.meetingId) && str(a.carriedFrom.actionId)
        ? { meetingId: str(a.carriedFrom.meetingId), actionId: str(a.carriedFrom.actionId) }
        : null;
      return {
        id: str(a.id) || `ac-${i}`,
        text: str(a.text).slice(0, 300),
        due: dayOrNull(a.due),
        done,
        completedOn: done ? calendarDayOrNull(a.completedOn) : null,
        completedInMeetingId: done ? str(a.completedInMeetingId) || null : null,
        dropped,
        droppedOn: dropped ? calendarDayOrNull(a.droppedOn) : null,
        droppedReason: dropped ? str(a.droppedReason).slice(0, 300) : '',
        droppedInMeetingId: dropped ? str(a.droppedInMeetingId) || null : null,
        personId: str(a.personId),
        // Keep a corrupted value as text so `auditActionOwners` can report the
        // repair rather than silently swallowing it.
        ...(withOwner ? {
          owner: a.owner === null || a.owner === undefined || a.owner === ''
            ? null
            : String(a.owner).trim().toLowerCase() || null,
        } : {}),
        carriedFrom,
        carriedToMeetingId: done || dropped ? null : str(a.carriedToMeetingId) || null,
        carriedToActionId: done || dropped ? null : str(a.carriedToActionId) || null,
      };
    })
    .filter((a) => a.text);
}

/**
 * A GROW "will" commitment carries the same follow-through history as a 1:1
 * promise, scoped to its own plan (a later plan supersedes the earlier one, so
 * a carry never crosses plans):
 *   done / completedOn           delivered, and when
 *   dropped*                     an explicit decision to stop, with the reason
 *   carriedFromId / carriedToId  the promise this one replaced and its successor
 *   completedInReviewId          the development review that closed it
 *   droppedInReviewId            the development review that dropped it
 *   carriedInReviewId            the development review that moved it
 * One commitment is done, dropped or carried forward — never two at once.
 * `done` wins, because a completion is evidence and a stale link is not.
 *
 * There is deliberately no `owner`: a development action belongs to the person
 * whose plan it is by definition.
 */
function normalizeWillActions(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(isPlainObject)
    .map((a, i) => {
      const done = a.done === true;
      const dropped = !done && a.dropped === true;
      return {
        id: str(a.id) || `ac-${i}`,
        text: str(a.text).slice(0, 300),
        due: dayOrNull(a.due),
        // When the commitment was written down. `first_agreed_on` in the export
        // and the "carried N× since" line both derive from it.
        addedOn: calendarDayOrNull(a.addedOn),
        done,
        completedOn: done ? calendarDayOrNull(a.completedOn) : null,
        completedInReviewId: done ? str(a.completedInReviewId) || null : null,
        dropped,
        droppedOn: dropped ? calendarDayOrNull(a.droppedOn) : null,
        droppedReason: dropped ? str(a.droppedReason).slice(0, 300) : '',
        droppedInReviewId: dropped ? str(a.droppedInReviewId) || null : null,
        personId: str(a.personId),
        delegationId: str(a.delegationId) || null,
        carriedFromId: str(a.carriedFromId) || null,
        carriedToId: done || dropped ? null : str(a.carriedToId) || null,
        carriedInReviewId: str(a.carriedInReviewId) || null,
      };
    })
    .filter((a) => a.text);
}

/**
 * Audit explicit GROW commitment → delegation links after both collections
 * have been normalised. A commitment may only link to an existing delegation
 * owned by the same person; missing or cross-person links are cleared with a
 * warning rather than left dangling or matched heuristically.
 */
function auditWillDelegationLinks(plans, delegations, warnings) {
  const byId = new Map(delegations.map((d) => [d.id, d]));
  let cleared = 0;
  for (const plan of plans) {
    for (const action of plan.will) {
      if (!action.delegationId) continue;
      const target = byId.get(action.delegationId);
      if (!target || target.personId !== plan.personId) {
        action.delegationId = null;
        cleared += 1;
      }
    }
  }
  if (cleared) {
    warnings.push(`Growth plans: cleared ${cleared} broken delegation link(s) on development commitments`);
  }
}

/**
 * A recorded development review: the conversation, not the date.
 *
 * `nextReviewOn` is what the two of them agreed to, and it is the only thing
 * that moves a plan's review date legitimately. Pushing `reviewOn` without a
 * review is counted as a deferral instead (see `logGrowthReview` and
 * `GROW-07`), because a plan whose review keeps sliding is not being reviewed.
 */
function normalizeGrowthReviews(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(isPlainObject)
    .map((r, i) => ({
      id: str(r.id) || `grev-${i}`,
      date: calendarDayOrNull(r.date),
      notes: str(r.notes).slice(0, 4000),
      nextReviewOn: calendarDayOrNull(r.nextReviewOn),
      createdAt: isoOrNull(r.createdAt),
    }))
    .filter((r) => r.date);
}

/**
 * Repair carried-forward development chains inside each plan, using the same
 * rule as the 1:1 ledger: a link that cannot be honoured is cleared and the
 * commitment reopens, because losing a development promise silently is the
 * exact failure this ledger exists to prevent.
 */
function repairWillChains(plans, warnings) {
  let reopened = 0;
  let relinked = 0;
  let clearedBackrefs = 0;
  for (const plan of plans) {
    const byId = new Map(plan.will.map((a) => [a.id, a]));
    const seenIds = new Set();
    plan.will = plan.will.filter((action) => {
      if (seenIds.has(action.id)) return false;
      seenIds.add(action.id);
      return true;
    });
    for (const action of plan.will) {
      if (!action.carriedToId) continue;
      const target = byId.get(action.carriedToId);
      if (!target || target === action || (target.carriedFromId && target.carriedFromId !== action.id)) {
        action.carriedToId = null;
        reopened += 1;
        continue;
      }
      if (!target.carriedFromId) {
        target.carriedFromId = action.id;
        relinked += 1;
      }
    }
    for (const action of plan.will) {
      if (!action.carriedFromId) continue;
      const source = byId.get(action.carriedFromId);
      if (!source || source === action || source.done || source.dropped) {
        action.carriedFromId = null;
        clearedBackrefs += 1;
        continue;
      }
      if (!source.carriedToId) {
        source.carriedToId = action.id;
        relinked += 1;
      } else if (source.carriedToId !== action.id) {
        action.carriedFromId = null;
        clearedBackrefs += 1;
      }
    }
    // A cycle would make the chain infinite for anything that walks it.
    for (const action of plan.will) {
      const path = new Set();
      let cursor = action;
      while (cursor?.carriedToId && !path.has(cursor.id)) {
        path.add(cursor.id);
        cursor = byId.get(cursor.carriedToId);
      }
      if (cursor && path.has(cursor.id) && cursor.carriedToId) {
        cursor.carriedToId = null;
        reopened += 1;
      }
    }
  }
  if (reopened) warnings.push(`Growth plans: reopened ${reopened} carried-forward commitment(s) whose successor could not be honoured`);
  if (relinked) warnings.push(`Growth plans: rebuilt ${relinked} carry link(s) from the plan's own history`);
  if (clearedBackrefs) warnings.push(`Growth plans: cleared ${clearedBackrefs} carried-forward reference(s) that could not be honoured`);
}

function normalizeKeyResults(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(isPlainObject)
    .map((k, i) => {
      const start = num(k.start, 0);
      const target = num(k.target, 100);
      const current = num(k.current, start);
      const initialCurrent = k.initialCurrent === null || k.initialCurrent === undefined || typeof k.initialCurrent === 'boolean' || (typeof k.initialCurrent === 'string' && !k.initialCurrent.trim())
        ? null
        : num(k.initialCurrent, null);
      return {
        id: str(k.id) || `kr-${i}`,
        title: str(k.title).slice(0, 200),
        start,
        target,
        current,
        initialCurrent,
        unit: str(k.unit, '').slice(0, 12),
      };
    })
    .filter((k) => k.title);
}

function normalizeScores(raw) {
  const s = isPlainObject(raw) ? raw : {};
  const out = {};
  for (const dim of PULSE_DIMENSIONS) {
    if (s[dim] === null || s[dim] === undefined || typeof s[dim] === 'boolean' || (typeof s[dim] === 'string' && !s[dim].trim())) continue;
    const v = num(s[dim], null);
    if (v === null) continue;
    out[dim] = Math.min(5, Math.max(1, Math.round(v)));
  }
  return out;
}

function normalizeReviewEvidence(items) {
  if (!Array.isArray(items)) return [];
  const types = ['oneonone', 'feedback', 'goal', 'growth', 'recognition', 'delegation'];
  return items
    .filter(isPlainObject)
    .map((item, i) => {
      const sourceType = types.includes(item.sourceType) ? item.sourceType : 'goal';
      const sourceId = str(item.sourceId).slice(0, 200);
      const route = str(item.route);
      return {
        id: str(item.id) || `${sourceType}:${sourceId || i}`,
        sourceType,
        sourceId,
        date: calendarDayOrNull(item.date),
        title: str(item.title).slice(0, 1000),
        detail: str(item.detail).slice(0, 4000),
        meta: str(item.meta).slice(0, 1000),
        basis: str(item.basis).slice(0, 300),
        // Only local fragment routes survive import. This is a second line of
        // defence behind the DOM renderer, which never injects raw HTML.
        route: route.startsWith('#/') ? route.slice(0, 500) : '#/reviews',
        valence: ['positive', 'constructive', 'neutral'].includes(item.valence) ? item.valence : 'neutral',
      };
    })
    .filter((item) => item.sourceId && item.title);
}

function normalizeReflection(raw, prompts) {
  const source = isPlainObject(raw) ? raw : {};
  return Object.fromEntries(prompts.map((key) => [key, str(source[key]).slice(0, 10000)]));
}

function uniqueIds(list, label, warnings) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item.id) {
      warnings.push(`${label}: dropped a record with no id`);
      continue;
    }
    if (seen.has(item.id)) {
      warnings.push(`${label}: dropped a duplicate id (${item.id})`);
      continue;
    }
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function asArray(raw, key, warnings) {
  const value = raw[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warnings.push(`"${key}" was not a list and has been reset to empty`);
    return [];
  }
  return value.filter(isPlainObject);
}

/**
 * Action ids only have to be unique inside their own meeting, but a carry link
 * names a pair, so a duplicated id makes the chain ambiguous. Drop the later
 * duplicate and say so, matching how duplicate record ids are handled.
 */
function dedupeActionIds(meetings, warnings) {
  let dropped = 0;
  for (const meeting of meetings) {
    const seen = new Set();
    meeting.actions = meeting.actions.filter((action) => {
      if (seen.has(action.id)) {
        dropped += 1;
        return false;
      }
      seen.add(action.id);
      return true;
    });
  }
  if (dropped) warnings.push(`1:1s: dropped ${dropped} duplicate action id(s)`);
}

/**
 * Ownership is only meaningful in the vocabulary above. Anything else (a
 * hand-edited file, a value from a future version, `true`) becomes "not
 * recorded" and is reported — quietly guessing who owes a promise would put a
 * fabricated name against a real person's commitment.
 */
function auditActionOwners(meetings, warnings) {
  let cleared = 0;
  for (const meeting of meetings) {
    for (const action of meeting.actions) {
      if (action.owner === null || action.owner === undefined) continue;
      if (ACTION_OWNERS.includes(action.owner)) continue;
      action.owner = null;
      cleared += 1;
    }
  }
  if (cleared) warnings.push(`1:1s: cleared ${cleared} unrecognised commitment owner(s)`);
}

/**
 * Repair carried-forward chains once every meeting has been normalised.
 *
 * An explicit carry is a claim: "this promise moved into that later meeting".
 * If the successor is missing, belongs to another person, moves backwards in
 * time or points back into a cycle, the honest repair is to reopen the
 * original with a warning. Silently keeping a broken link would make the
 * commitment vanish from every open-actions list — the exact failure this
 * feature exists to prevent.
 */
function repairCarryChains(meetings, warnings) {
  const byId = new Map(meetings.map((m) => [m.id, m]));
  const index = new Map();
  for (const meeting of meetings) {
    for (const action of meeting.actions) index.set(`${meeting.id}|${action.id}`, { meeting, action });
  }
  let reopened = 0;
  let relinked = 0;

  for (const meeting of meetings) {
    for (const action of meeting.actions) {
      if (!action.carriedToMeetingId) continue;
      const targetMeeting = byId.get(action.carriedToMeetingId);
      const target = targetMeeting ? targetMeeting.actions.find((a) => a.id === action.carriedToActionId) : null;
      const invalid = !targetMeeting
        || !target
        || targetMeeting.personId !== meeting.personId
        || targetMeeting.date < meeting.date
        || Boolean(target.carriedFrom && (target.carriedFrom.meetingId !== meeting.id || target.carriedFrom.actionId !== action.id));
      if (invalid) {
        action.carriedToMeetingId = null;
        action.carriedToActionId = null;
        reopened += 1;
        continue;
      }
      if (!target.carriedFrom) {
        target.carriedFrom = { meetingId: meeting.id, actionId: action.id };
        relinked += 1;
      }
    }
  }

  // A successor that names its predecessor is itself evidence of a carry. If the
  // forward link is missing (a partial import, a hand-edited file), rebuild it
  // so the original is not counted as open at the same time as its copy.
  let linkedFromBackref = 0;
  let droppedBackref = 0;
  for (const meeting of meetings) {
    for (const action of meeting.actions) {
      if (!action.carriedFrom) continue;
      const from = index.get(`${action.carriedFrom.meetingId}|${action.carriedFrom.actionId}`);
      if (!from || from.meeting.personId !== meeting.personId || from.action.done || from.action.dropped) {
        action.carriedFrom = null;
        droppedBackref += 1;
        continue;
      }
      if (!from.action.carriedToMeetingId) {
        from.action.carriedToMeetingId = meeting.id;
        from.action.carriedToActionId = action.id;
        linkedFromBackref += 1;
      } else if (from.action.carriedToMeetingId !== meeting.id || from.action.carriedToActionId !== action.id) {
        action.carriedFrom = null;
        droppedBackref += 1;
      }
    }
  }

  for (const meeting of meetings) {
    for (const action of meeting.actions) {
      const seen = new Set([`${meeting.id}|${action.id}`]);
      let cursor = { meeting, action };
      while (cursor.action.carriedToMeetingId) {
        const key = `${cursor.action.carriedToMeetingId}|${cursor.action.carriedToActionId}`;
        if (seen.has(key)) {
          cursor.action.carriedToMeetingId = null;
          cursor.action.carriedToActionId = null;
          reopened += 1;
          break;
        }
        seen.add(key);
        const next = index.get(key);
        if (!next) break;
        cursor = next;
      }
    }
  }

  let lostConfirmation = 0;
  for (const meeting of meetings) {
    for (const action of meeting.actions) {
      for (const field of ['completedInMeetingId', 'droppedInMeetingId']) {
        if (!action[field]) continue;
        const ref = byId.get(action[field]);
        if (!ref || ref.personId !== meeting.personId) {
          action[field] = null;
          if (field === 'completedInMeetingId') lostConfirmation += 1;
        }
      }
    }
  }

  if (reopened) {
    warnings.push(`1:1s: reopened ${reopened} carried-forward commitment(s) whose successor link was invalid`);
  }
  if (relinked) warnings.push(`1:1s: rebuilt ${relinked} missing carried-forward link(s)`);
  if (linkedFromBackref) warnings.push(`1:1s: rebuilt ${linkedFromBackref} carry link(s) from a successor's own history`);
  if (droppedBackref) warnings.push(`1:1s: cleared ${droppedBackref} carried-forward reference(s) that could not be honoured`);
  if (lostConfirmation) {
    warnings.push(`1:1s: kept ${lostConfirmation} completed action(s) but cleared a confirmation that pointed at a missing 1:1`);
  }
}

function normalizeOnboardingStakeholders(items, warnings) {
  if (!Array.isArray(items)) return [];
  const seenNames = new Set();
  const seenIds = new Set();
  const out = [];
  for (let i = 0; i < items.length; i += 1) {
    const raw = items[i];
    if (!isPlainObject(raw)) continue;
    const name = str(raw.name).trim().slice(0, 160);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seenNames.has(key)) {
      if (warnings) warnings.push('Onboarding: dropped a duplicate stakeholder entry');
      continue;
    }
    seenNames.add(key);
    let id = str(raw.id) || `onbs-${i}`;
    while (seenIds.has(id)) id = `${id}-${i}`;
    seenIds.add(id);
    const met = raw.met === true;
    out.push({
      id,
      name,
      purpose: str(raw.purpose).trim().slice(0, 300),
      met,
      metOn: met ? calendarDayOrNull(raw.metOn) : null,
    });
  }
  return out;
}

function normalizeOnboardingCheckpoints(items, warnings) {
  if (!Array.isArray(items)) return [];
  const seenIds = new Set();
  const out = [];
  for (let i = 0; i < items.length; i += 1) {
    const raw = items[i];
    if (!isPlainObject(raw)) continue;
    const title = str(raw.title).trim().slice(0, 300);
    if (!title) continue;
    const rawHorizon = Number(raw.horizon);
    const horizon = ONBOARDING_HORIZONS.includes(rawHorizon) ? rawHorizon : 30;
    const category = ONBOARDING_CATEGORIES.includes(raw.category) ? raw.category : 'clarity';
    let id = str(raw.id) || `onbc-${i}`;
    while (seenIds.has(id)) id = `${id}-${i}`;
    seenIds.add(id);
    const done = raw.done === true;
    if (raw.due !== undefined && raw.due !== null && raw.due !== '' && !calendarDayOrNull(raw.due) && warnings) {
      warnings.push('Onboarding: repaired an invalid checkpoint due date');
    }
    out.push({
      id,
      horizon,
      category,
      title,
      due: calendarDayOrNull(raw.due),
      done,
      completedOn: done ? calendarDayOrNull(raw.completedOn) : null,
      notes: str(raw.notes).trim().slice(0, 1000),
    });
  }
  return out;
}

function normalizeOnboardingReviews(raw, startDate, todayDay, warnings, planId) {
  const out = { 30: null, 60: null, 90: null };
  if (!isPlainObject(raw)) return out;
  for (const h of ONBOARDING_HORIZONS) {
    const entry = raw[h] ?? raw[String(h)];
    if (!isPlainObject(entry)) continue;
    const heldOn = calendarDayOrNull(entry.heldOn);
    const summary = str(entry.summary).trim().slice(0, 2000);
    const blockers = str(entry.blockers).trim().slice(0, 2000);
    if (!heldOn && !summary && !blockers) continue;
    if (heldOn && todayDay && heldOn > todayDay) {
      if (warnings) warnings.push(`Onboarding: ignored a future Day ${h} check-in date`);
      continue;
    }
    if (heldOn && startDate && heldOn < startDate) {
      if (warnings) warnings.push(`Onboarding: ignored a Day ${h} check-in date before the start date`);
      continue;
    }
    out[h] = {
      // A stable identity lets explicitly created manager-support commitments
      // point to this exact check-in even if its date/notes are later corrected.
      id: str(entry.id).trim() || `onbr-${planId}-${h}`,
      heldOn,
      summary,
      blockers,
    };
  }
  return out;
}

function normalizeManagerSupport(raw, onboarding, people, now, warnings) {
  const peopleIds = new Set(people.map((person) => person.id));
  const plans = new Map(onboarding.map((plan) => [plan.id, plan]));
  const todayDay = now.slice(0, 10);
  const records = asArray({ managerSupport: raw }, 'managerSupport', warnings).map((item, i) => {
    if (!isPlainObject(item)) return null;
    const planId = str(item.sourcePlanId).trim();
    const checkinId = str(item.sourceCheckinId).trim();
    const horizon = ONBOARDING_HORIZONS.includes(Number(item.sourceHorizon)) ? Number(item.sourceHorizon) : null;
    const sourceHeldOn = calendarDayOrNull(item.sourceHeldOn);
    const plan = plans.get(planId);
    const review = plan && horizon ? plan.reviews?.[horizon] : null;
    if (!plan || plan.personId !== item.personId || !review || review.id !== checkinId) {
      warnings.push(`Manager support: commitment ${str(item.id) || i} has a missing or mismatched source check-in; its recorded source details were preserved.`);
    }
    const status = ['open', 'done', 'dropped', 'carried'].includes(item.status) ? item.status : 'open';
    const createdAt = isoOrNull(item.createdAt) || now;
    const addedOn = calendarDayOrNull(item.addedOn) || createdAt.slice(0, 10) || todayDay;
    return {
      id: str(item.id) || `msup-${i}`,
      personId: str(item.personId),
      text: str(item.text).trim().slice(0, 1000),
      due: calendarDayOrNull(item.due),
      owner: 'leader',
      sourcePlanId: planId || null,
      sourceCheckinId: checkinId || null,
      sourceHorizon: horizon,
      sourceHeldOn,
      addedOn,
      status,
      completedOn: status === 'done' ? calendarDayOrNull(item.completedOn) : null,
      completedInMeetingId: status === 'done' ? (str(item.completedInMeetingId) || null) : null,
      droppedOn: status === 'dropped' ? calendarDayOrNull(item.droppedOn) : null,
      droppedReason: status === 'dropped' ? str(item.droppedReason).trim().slice(0, 500) : '',
      droppedInMeetingId: status === 'dropped' ? (str(item.droppedInMeetingId) || null) : null,
      carriedFromId: str(item.carriedFromId) || null,
      carriedFromMeetingId: str(item.carriedFromMeetingId) || null,
      carriedToId: status === 'carried' ? (str(item.carriedToId) || null) : null,
      carriedOn: status === 'carried' ? calendarDayOrNull(item.carriedOn) : null,
      carriedInMeetingId: status === 'carried' ? (str(item.carriedInMeetingId) || null) : null,
      createdAt,
      updatedAt: isoOrNull(item.updatedAt) || createdAt,
    };
  }).filter(Boolean);
  const valid = records.filter((item) => {
    const ok = peopleIds.has(item.personId) && item.text;
    if (!ok) warnings.push(`Manager support: dropped ${item.id} because its person or commitment text was missing.`);
    return ok;
  });
  return uniqueIds(valid, 'Manager support', warnings);
}

function nonNegativeFinite(v, fallback = 0) {
  const n = num(v, fallback);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : fallback;
}

function normalizePertTriple(rawO, rawM, rawP, label, warnings) {
  const o = nonNegativeFinite(rawO, 0);
  const m = nonNegativeFinite(rawM, 0);
  const p = nonNegativeFinite(rawP, 0);
  if (o > m || m > p) {
    if (warnings) warnings.push(`Operational cases: re-ordered ${label} PERT estimates so optimistic <= most likely <= pessimistic`);
    const sorted = [o, m, p].sort((a, b) => a - b);
    return { o: sorted[0], m: sorted[1], p: sorted[2] };
  }
  return { o, m, p };
}

function normalizeCaseStakeholders(items, warnings) {
  if (!Array.isArray(items)) return [];
  const seenIds = new Set();
  const out = [];
  for (let i = 0; i < items.length; i += 1) {
    const raw = items[i];
    if (!isPlainObject(raw)) continue;
    const name = str(raw.name).trim().slice(0, 160);
    if (!name) continue;
    let id = str(raw.id).trim() || `cstk-${i}`;
    while (seenIds.has(id)) id = `${id}-${i}`;
    seenIds.add(id);
    const power = clampInt(raw.power, 1, 5, 3);
    const interest = clampInt(raw.interest, 1, 5, 3);
    const stance = STAKEHOLDER_STANCES.includes(raw.stance) ? raw.stance : 'neutral';
    const commsCadence = STAKEHOLDER_CADENCES.includes(raw.commsCadence) ? raw.commsCadence : '';
    out.push({
      id,
      name,
      role: str(raw.role).trim().slice(0, 120),
      power,
      interest,
      stance,
      commsCadence,
      lastCommsOn: calendarDayOrNull(raw.lastCommsOn),
      nextCommsOn: calendarDayOrNull(raw.nextCommsOn),
      keyMessage: str(raw.keyMessage).trim().slice(0, 600),
    });
    if (out.length >= 25) break;
  }
  if (items.length > 25 && warnings) {
    warnings.push('Operational cases: trimmed stakeholders above the 25-entry maximum');
  }
  return out;
}

function normalizeCases(raw, state, todayDay, now, warnings) {
  const personIds = new Set(state.people.map((p) => p.id));
  const goalIds = new Set(state.goals.map((g) => g.id));
  let clearedGoalLinks = 0;
  let clearedInvolvedRefs = 0;

  const mapped = asArray({ cases: raw }, 'cases', warnings).map((c, i) => {
    const title = str(c.title).trim().slice(0, 200);
    const kind = CASE_KINDS.includes(c.kind) ? c.kind : 'risk';
    if (c.kind !== undefined && !CASE_KINDS.includes(c.kind)) {
      warnings.push('Operational cases: repaired an unrecognised case type to risk');
    }
    const status = CASE_STATUSES.includes(c.status) ? c.status : 'open';
    if (c.status !== undefined && !CASE_STATUSES.includes(c.status)) {
      warnings.push('Operational cases: repaired an unrecognised case status to open');
    }
    let openedOn = calendarDayOrNull(c.openedOn) || todayDay;
    if (openedOn > todayDay) {
      openedOn = todayDay;
      warnings.push('Operational cases: clamped a future openedOn date to today');
    }
    const isClosed = status === 'resolved' || status === 'closed';
    let resolvedOn = null;
    if (isClosed) {
      const candidate = calendarDayOrNull(c.resolvedOn);
      resolvedOn = candidate && candidate >= openedOn && candidate <= todayDay ? candidate : todayDay;
    }

    const ownerId = str(c.ownerId).trim() || null;
    const rawInvolved = Array.isArray(c.involvedPersonIds) ? c.involvedPersonIds : [];
    const involvedSet = new Set();
    for (const pid of rawInvolved) {
      const cleanPid = str(pid).trim();
      if (!cleanPid) continue;
      if (!personIds.has(cleanPid)) {
        clearedInvolvedRefs += 1;
        continue;
      }
      involvedSet.add(cleanPid);
    }

    let linkedGoalId = str(c.linkedGoalId).trim() || null;
    if (linkedGoalId && !goalIds.has(linkedGoalId)) {
      linkedGoalId = null;
      clearedGoalLinks += 1;
    }

    const rawFmea = isPlainObject(c.fmea) ? c.fmea : {};
    const hasResidual =
      rawFmea.residualSeverity != null &&
      rawFmea.residualProbability != null &&
      rawFmea.residualDetectability != null &&
      Number.isFinite(Number(rawFmea.residualSeverity)) &&
      Number.isFinite(Number(rawFmea.residualProbability)) &&
      Number.isFinite(Number(rawFmea.residualDetectability));

    const fmea = {
      // Schema v33: null means "not rated yet" and is preserved as such.
      severity: fmeaRatingOrNull(rawFmea.severity),
      probability: fmeaRatingOrNull(rawFmea.probability),
      detectability: fmeaRatingOrNull(rawFmea.detectability),
      failureMode: str(rawFmea.failureMode).trim().slice(0, 600),
      effect: str(rawFmea.effect).trim().slice(0, 600),
      controls: str(rawFmea.controls).trim().slice(0, 600),
      residualSeverity: hasResidual ? clampInt(rawFmea.residualSeverity, 1, 10, 5) : null,
      residualProbability: hasResidual ? clampInt(rawFmea.residualProbability, 1, 10, 5) : null,
      residualDetectability: hasResidual ? clampInt(rawFmea.residualDetectability, 1, 10, 5) : null,
    };

    const rawFin = isPlainObject(c.financial) ? c.financial : {};
    const costTriple = normalizePertTriple(rawFin.optimistic, rawFin.mostLikely, rawFin.pessimistic, 'cost', warnings);
    const capTriple = normalizePertTriple(
      rawFin.capacityDaysOptimistic,
      rawFin.capacityDaysMostLikely,
      rawFin.capacityDaysPessimistic,
      'capacity-days',
      warnings,
    );
    const financial = {
      currency: (str(rawFin.currency, 'USD').trim().toUpperCase().slice(0, 6)) || 'USD',
      optimistic: costTriple.o,
      mostLikely: costTriple.m,
      pessimistic: costTriple.p,
      mitigationCost: nonNegativeFinite(rawFin.mitigationCost, 0),
      capacityDaysOptimistic: capTriple.o,
      capacityDaysMostLikely: capTriple.m,
      capacityDaysPessimistic: capTriple.p,
      opportunityCost: str(rawFin.opportunityCost).trim().slice(0, 600),
    };

    const rawRca = isPlainObject(c.rca) ? c.rca : {};
    const whys = Array.isArray(rawRca.whys)
      ? rawRca.whys
          .filter((w) => typeof w === 'string')
          .map((w) => w.trim().slice(0, 500))
          .filter(Boolean)
          .slice(0, 5)
      : [];
    const rca = {
      problemStatement: str(rawRca.problemStatement).trim().slice(0, 1000),
      whys,
      rootCause: str(rawRca.rootCause).trim().slice(0, 1000),
      systemicBarrier: str(rawRca.systemicBarrier).trim().slice(0, 1000),
      preventiveAction: str(rawRca.preventiveAction).trim().slice(0, 1000),
    };

    const createdAt = isoOrNull(c.createdAt) || now;
    const updatedAt = isoOrNull(c.updatedAt) || createdAt;

    return {
      id: str(c.id).trim() || `case-${i}`,
      kind,
      status,
      title,
      summary: str(c.summary).trim().slice(0, 4000),
      ownerId,
      involvedPersonIds: [...involvedSet],
      linkedGoalId,
      openedOn,
      reviewOn: calendarDayOrNull(c.reviewOn),
      resolvedOn,
      resolutionNotes: isClosed ? str(c.resolutionNotes).trim().slice(0, 4000) : '',
      fmea,
      financial,
      // Schema v22: opening-forecast freeze (RULE-FCT-03) and settled actuals
      // (case-cost calibration ledger). Both normalise to null when absent —
      // pre-v22 records gain no invented history.
      forecastSnapshot: normalizeCaseForecastSnapshot(c.forecastSnapshot),
      actuals: normalizeCaseActuals(c.actuals, { isClosed, openedOn, resolvedOn, todayDay }),
      rca,
      stakeholders: normalizeCaseStakeholders(c.stakeholders, warnings),
      autoPropagate: c.autoPropagate !== false,
      createdAt,
      updatedAt,
    };
  });

  const valid = mapped.filter((c) => c.title);
  if (valid.length !== mapped.length) {
    warnings.push(`Operational cases: dropped ${mapped.length - valid.length} record(s) with a missing title`);
  }
  if (clearedGoalLinks) {
    warnings.push(`Operational cases: cleared ${clearedGoalLinks} broken goal link(s)`);
  }
  if (clearedInvolvedRefs) {
    warnings.push(`Operational cases: cleared ${clearedInvolvedRefs} missing involved-person reference(s)`);
  }
  return uniqueIds(valid, 'Operational cases', warnings);
}


/**
 * Schema v16 — the portfolio (operating-plan demand ledger).
 *
 * Each entry is work that consumes team capacity: planned work, a capacity
 * reserve created automatically from an operational case, maintenance, or
 * compliance. Effort and value are three-point PERT estimates; an item with no
 * estimate keeps a blank triple (`0,0,0`) rather than a plausible default, and
 * the capacity model counts it as unmeasured.
 *
 * Provenance (`sourceType`/`sourceId`) is validated against the collection it
 * names, so a portfolio entry can never point at a person who does not exist or
 * a case that was deleted. Dangling provenance degrades to `manual` with a
 * warning instead of silently keeping a lie.
 */
function normalizePortfolio(raw, state, todayDay, now, warnings) {
  const personIds = new Set((state.people || []).filter((p) => p.status !== 'archived').map((p) => p.id));
  const sourceSets = {
    goal: new Set((state.goals || []).map((r) => r.id)),
    case: new Set((state.cases || []).map((r) => r.id)),
    delegation: new Set((state.delegations || []).map((r) => r.id)),
    requisition: new Set((state.requisitions || []).map((r) => r.id)),
    change: new Set((state.changes || []).map((r) => r.id)),
  };
  let repairedSources = 0;
  let clearedOwners = 0;
  let clampedDecisions = 0;
  let repairedHorizons = 0;

  const mapped = asArray({ portfolio: raw }, 'portfolio', warnings).map((item, i) => {
    const title = str(item.title).trim().slice(0, 200);
    const kind = PORTFOLIO_KINDS.includes(item.kind) ? item.kind : 'project';
    if (item.kind !== undefined && !PORTFOLIO_KINDS.includes(item.kind)) {
      warnings.push('Portfolio: repaired an unrecognised item type to planned work');
    }
    let sourceType = PORTFOLIO_SOURCE_TYPES.includes(item.sourceType) ? item.sourceType : 'manual';
    if (item.sourceType !== undefined && !PORTFOLIO_SOURCE_TYPES.includes(item.sourceType)) {
      repairedSources += 1;
      sourceType = 'manual';
    }
    let sourceId = str(item.sourceId).trim() || null;
    if (sourceType !== 'manual') {
      if (!sourceId || !sourceSets[sourceType]?.has(sourceId)) {
        repairedSources += 1;
        sourceType = 'manual';
        sourceId = null;
      }
    } else {
      sourceId = null;
    }

    const effort = normalizePertTriple(
      item.effortDays?.optimistic,
      item.effortDays?.mostLikely,
      item.effortDays?.pessimistic,
      'portfolio effort-day',
      warnings,
    );
    const value = normalizePertTriple(
      item.value?.optimistic,
      item.value?.mostLikely,
      item.value?.pessimistic,
      'portfolio value',
      warnings,
    );

    let ownerId = str(item.ownerId).trim() || null;
    if (ownerId && !personIds.has(ownerId)) {
      ownerId = null;
      clearedOwners += 1;
    }

    let status = PORTFOLIO_STATUSES.includes(item.status) ? item.status : 'open';
    if (item.status !== undefined && !PORTFOLIO_STATUSES.includes(item.status)) {
      warnings.push('Portfolio: repaired an unrecognised item status to open');
    }
    const createdOn = calendarDayOrNull(item.createdOn) || todayDay;
    const completedOn = status === 'done' ? calendarDayOrNull(item.completedOn) : null;
    if (status === 'done' && !completedOn) {
      warnings.push('Portfolio: a delivered item has no recorded completion date, so it is excluded from throughput history');
    }
    const releasedOn = status === 'released' ? calendarDayOrNull(item.releasedOn) : null;

    let decision = PORTFOLIO_DECISIONS.includes(item.decision) ? item.decision : 'undecided';
    if (item.decision !== undefined && !PORTFOLIO_DECISIONS.includes(item.decision)) {
      warnings.push('Portfolio: repaired an unrecognised funding decision to undecided');
    }
    // A capacity reserve is committed by definition: it is work that already
    // exists (an incident's mitigation), not work waiting to be chosen.
    if (kind === 'capacity-reserve' && decision !== 'funded') {
      decision = 'funded';
      clampedDecisions += 1;
    }
    let decisionOn = calendarDayOrNull(item.decisionOn);
    if (decisionOn && decisionOn > todayDay) {
      decisionOn = todayDay;
      warnings.push('Portfolio: clamped a future funding-decision date to today');
    }

    // Schema v33: ambition horizon. An unrecognised value degrades to
    // unclassified (null), never to a guessed horizon: the Allocation
    // Governor measures the explore/exploit mix from this field, and a
    // fabricated classification would fabricate the measurement.
    const horizon = PORTFOLIO_HORIZONS.includes(item.horizon) ? item.horizon : null;
    if (item.horizon !== undefined && item.horizon !== null && !PORTFOLIO_HORIZONS.includes(item.horizon)) {
      repairedHorizons += 1;
    }

    return {
      id: str(item.id).trim() || `pf-${i}`,
      title,
      kind,
      horizon,
      status,
      sourceType,
      sourceId,
      ownerId,
      effortDays: { optimistic: effort.o, mostLikely: effort.m, pessimistic: effort.p },
      value: { optimistic: value.o, mostLikely: value.m, pessimistic: value.p },
      currency: (str(item.currency, 'USD').trim().toUpperCase().slice(0, 6)) || 'USD',
      decision,
      decisionOn,
      rationale: str(item.rationale).trim().slice(0, 1000),
      targetOn: calendarDayOrNull(item.targetOn),
      createdOn,
      completedOn,
      releasedOn,
      // Schema v21: what delivery actually cost/produced (recorded at
      // completion; null = honestly unknown, never back-filled from the
      // estimate), and the forecast frozen at funding time (RULE-FCT-01).
      actualEffortDays: nonNegativeOrNull(item.actualEffortDays),
      actualValue: finiteOrNull(item.actualValue),
      forecastSnapshot: normalizeForecastSnapshot(item.forecastSnapshot),
      createdAt: isoOrNull(item.createdAt) || now,
      updatedAt: isoOrNull(item.updatedAt) || isoOrNull(item.createdAt) || now,
    };
  });

  const valid = mapped.filter((item) => item.title);
  if (valid.length !== mapped.length) {
    warnings.push(`Portfolio: dropped ${mapped.length - valid.length} record(s) with a missing title`);
  }
  if (repairedSources) warnings.push(`Portfolio: reset ${repairedSources} item(s) with missing or invalid source provenance to manual`);
  if (clearedOwners) warnings.push(`Portfolio: cleared ${clearedOwners} owner reference(s) to archived or missing people`);
  if (clampedDecisions) warnings.push(`Portfolio: marked ${clampedDecisions} capacity reserve(s) as funded, because a reserve is committed work`);
  if (repairedHorizons) warnings.push(`Portfolio: cleared ${repairedHorizons} unrecognised ambition horizon(s) to unclassified`);
  return uniqueIds(valid, 'Portfolio', warnings);
}


/* ------------------------------------------------------------------ */
/* Schema v17 — Selection & hiring                                     */
/* ------------------------------------------------------------------ */

const HIRING_DECISION_OUTCOMES = ['pending', 'advance', 'hold', 'hire', 'reject', 'withdraw'];

/**
 * The competencies a role must be able to demonstrate, and whether each is a
 * hard requirement. A role with no competencies cannot be assessed against
 * anything, and every candidate will be reported as having no coverage rather
 * than being scored on vibes.
 */
function normalizeCompetencies(items, warnings) {
  const list = asArray({ competencies: items }, 'competencies', warnings);
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const raw = list[i];
    if (!isPlainObject(raw)) continue;
    const name = str(raw.name).trim().slice(0, 120);
    if (!name) continue;
    out.push({
      id: str(raw.id).trim() || `cmp-${i}`,
      name,
      weight: clampInt(raw.weight, 1, 5, 1),
      // Defaulting to required keeps the gate honest: an unmarked competency is
      // one the role needs, not one that can be quietly skipped.
      required: raw.required !== false,
    });
    if (out.length >= 12) break;
  }
  return uniqueIds(out, 'Requisition competencies', warnings);
}

/**
 * A requisition is a role the team has decided to fill. It carries the
 * competencies to assess, the interviewers whose time it consumes, and the
 * *optional* three-point effort estimate that lets the capacity layer reserve
 * real work. No salary or effort figure is ever inferred.
 */
function normalizeRequisitions(raw, state, todayDay, now, warnings) {
  const personIds = new Set((state.people || []).map((p) => p.id));
  const caseIds = new Set((state.cases || []).map((c) => c.id));
  let repaired = 0;

  const mapped = asArray({ requisitions: raw }, 'requisitions', warnings).map((req, i) => {
    if (!isPlainObject(req)) return null;
    const title = str(req.title).trim().slice(0, 160);
    const status = REQUISITION_STATUSES.includes(req.status) ? req.status : 'open';
    if (req.status !== undefined && !REQUISITION_STATUSES.includes(req.status)) {
      warnings.push('Hiring: repaired an unrecognised requisition status to open');
    }
    const reason = REQUISITION_REASONS.includes(req.reason) ? req.reason : 'growth';
    const openedOn = calendarDayOrNull(req.openedOn) || todayDay;
    const terminal = status === 'filled' || status === 'cancelled';
    let closedOn = calendarDayOrNull(req.closedOn);
    if (terminal && !closedOn) {
      closedOn = todayDay;
      warnings.push(`Hiring: “${title || 'a requisition'}” was closed without a date, so today was recorded`);
    }
    if (!terminal) closedOn = null;

    const effort = normalizePertTriple(
      req.effortDays?.optimistic,
      req.effortDays?.mostLikely,
      req.effortDays?.pessimistic,
      'hiring effort-day',
      warnings,
    );

    const interviewers = [
      ...new Set(
        (Array.isArray(req.interviewers) ? req.interviewers : [])
          .map((pid) => str(pid).trim())
          .filter((pid) => pid && personIds.has(pid)),
      ),
    ];
    if (Array.isArray(req.interviewers) && interviewers.length !== req.interviewers.length) {
      repaired += 1;
    }

    let filledPersonId = str(req.filledPersonId).trim() || null;
    if (filledPersonId && !personIds.has(filledPersonId)) {
      filledPersonId = null;
      repaired += 1;
    }
    let escalatedCaseId = str(req.escalatedCaseId).trim() || null;
    if (escalatedCaseId && !caseIds.has(escalatedCaseId)) {
      escalatedCaseId = null;
      repaired += 1;
    }

    const dailyCost = num(req.dailyVacancyCost, 0);
    return {
      id: str(req.id).trim() || `req-${i}`,
      title,
      team: str(req.team).trim().slice(0, 80),
      level: LEVELS.includes(req.level) ? req.level : 'ic',
      reason,
      status,
      openedOn,
      targetStartOn: calendarDayOrNull(req.targetStartOn),
      closedOn,
      filledPersonId,
      interviewers,
      competencies: normalizeCompetencies(req.competencies, warnings),
      effortDays: { optimistic: effort.o, mostLikely: effort.m, pessimistic: effort.p },
      // A cost of vacancy is only ever what the leader recorded. No salary-band
      // arithmetic is used to invent one.
      dailyVacancyCost: dailyCost > 0 ? Math.round(dailyCost * 100) / 100 : null,
      currency: (str(req.currency, 'USD').trim().toUpperCase().slice(0, 6)) || 'USD',
      notes: str(req.notes).trim().slice(0, 2000),
      autoEscalated: req.autoEscalated === true,
      escalatedCaseId,
      createdAt: isoOrNull(req.createdAt) || now,
      updatedAt: isoOrNull(req.updatedAt) || isoOrNull(req.createdAt) || now,
    };
  });

  const valid = mapped.filter((req) => req && req.title);
  if (valid.length !== mapped.length) {
    warnings.push(`Hiring: dropped ${mapped.length - valid.length} requisition(s) with a missing role title`);
  }
  if (repaired) warnings.push(`Hiring: repaired ${repaired} requisition reference(s) to missing people or cases`);
  return uniqueIds(valid, 'Requisitions', warnings);
}

/**
 * A candidate is a named person in the process, the evidence recorded about
 * them, and the decision. Evidence ratings are 1–5 with a neutral 3; the
 * decision is stored with its rationale so a rejection is explainable later.
 */
function normalizeCandidates(raw, state, todayDay, now, warnings) {
  const reqById = new Map((state.requisitions || []).map((r) => [r.id, r]));
  const personIds = new Set((state.people || []).map((p) => p.id));
  let droppedSignals = 0;
  let repairedSignals = 0;
  let repairedPeople = 0;

  const mapped = asArray({ candidates: raw }, 'candidates', warnings).map((c, i) => {
    if (!isPlainObject(c)) return null;
    const name = str(c.name).trim().slice(0, 120);
    const reqId = str(c.reqId).trim();
    const requisition = reqById.get(reqId);
    const stage = CANDIDATE_STAGES.includes(c.stage) ? c.stage : 'sourced';
    if (c.stage !== undefined && !CANDIDATE_STAGES.includes(c.stage)) {
      warnings.push('Hiring: repaired an unrecognised candidate stage to sourced');
    }
    const competencyIds = new Set((requisition?.competencies || []).map((cmp) => cmp.id));

    const signals = [];
    const rawSignals = Array.isArray(c.signals) ? c.signals : [];
    for (let k = 0; k < rawSignals.length && signals.length < 60; k += 1) {
      const sig = rawSignals[k];
      if (!isPlainObject(sig)) {
        droppedSignals += 1;
        continue;
      }
      if (!EVIDENCE_KIND_BY_ID[sig.kind]) {
        droppedSignals += 1;
        continue;
      }
      const rating = Math.round(num(sig.rating, 0));
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
        droppedSignals += 1;
        continue;
      }
      let competencyId = str(sig.competencyId).trim() || null;
      if (competencyId && !competencyIds.has(competencyId)) {
        competencyId = null;
        repairedSignals += 1;
      }
      let interviewerId = str(sig.interviewerId).trim() || null;
      if (interviewerId && !personIds.has(interviewerId)) {
        interviewerId = null;
        repairedSignals += 1;
      }
      signals.push({
        id: str(sig.id).trim() || `sig-${i}-${k}`,
        kind: sig.kind,
        competencyId,
        rating,
        interviewerId,
        date: calendarDayOrNull(sig.date),
        note: str(sig.note).trim().slice(0, 1000),
      });
    }

    const decisionRaw = isPlainObject(c.decision) ? c.decision : {};
    const outcome = HIRING_DECISION_OUTCOMES.includes(decisionRaw.outcome) ? decisionRaw.outcome : 'pending';

    let personId = str(c.personId).trim() || null;
    if (personId && !personIds.has(personId)) {
      personId = null;
      repairedPeople += 1;
    }

    return {
      id: str(c.id).trim() || `cand-${i}`,
      reqId,
      name,
      stage,
      appliedOn: calendarDayOrNull(c.appliedOn) || todayDay,
      lastActivityOn: calendarDayOrNull(c.lastActivityOn) || calendarDayOrNull(c.appliedOn) || todayDay,
      source: str(c.source).trim().slice(0, 120),
      signals,
      decision: {
        outcome,
        decidedOn: calendarDayOrNull(decisionRaw.decidedOn),
        rationale: str(decisionRaw.rationale).trim().slice(0, 4000),
        evidenceGapAcknowledged: decisionRaw.evidenceGapAcknowledged === true,
      },
      offerOn: calendarDayOrNull(c.offerOn),
      offerAcceptedOn: calendarDayOrNull(c.offerAcceptedOn),
      hiredOn: calendarDayOrNull(c.hiredOn),
      startOn: calendarDayOrNull(c.startOn),
      personId,
      keepInTouch: c.keepInTouch === true,
      createdAt: isoOrNull(c.createdAt) || now,
      updatedAt: isoOrNull(c.updatedAt) || isoOrNull(c.createdAt) || now,
    };
  });

  const valid = mapped.filter((c) => {
    if (!c) return false;
    if (!c.name || !reqById.has(c.reqId)) {
      warnings.push('Hiring: dropped a candidate record with no name or no existing requisition');
      return false;
    }
    return true;
  });
  if (droppedSignals) warnings.push(`Hiring: dropped ${droppedSignals} evidence record(s) with an unknown method or an out-of-range rating`);
  if (repairedSignals) warnings.push(`Hiring: unlinked ${repairedSignals} evidence record(s) from a missing competency or interviewer`);
  if (repairedPeople) warnings.push(`Hiring: cleared ${repairedPeople} candidate link(s) to a person who is no longer in the roster`);
  return uniqueIds(valid, 'Candidates', warnings);
}

/* ------------------------------------------------------------------ */
/* Schema v19 — Organizational Design, Team Topologies & Change       */
/* ------------------------------------------------------------------ */

function normalizeChangeForces(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const out = [];
  for (let i = 0; i < items.length && out.length < 30; i += 1) {
    const raw = items[i];
    if (!isPlainObject(raw)) continue;
    const label = str(raw.label).trim().slice(0, 240);
    if (!label) continue;
    let id = str(raw.id).trim() || `frc-${i}`;
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    out.push({
      id,
      side: FORCE_SIDES.includes(raw.side) ? raw.side : 'restraining',
      label,
      weight: clampInt(raw.weight, 1, 5, 3),
      category: FORCE_CATEGORIES.includes(raw.category) ? raw.category : 'governance',
      mitigation: str(raw.mitigation).trim().slice(0, 500),
      mitigated: raw.mitigated === true,
    });
  }
  return out;
}

function normalizeChangeCoalition(items, personIds) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const out = [];
  for (let i = 0; i < items.length && out.length < 25; i += 1) {
    const raw = items[i];
    if (!isPlainObject(raw)) continue;
    const name = str(raw.name).trim().slice(0, 120);
    if (!name) continue;
    let id = str(raw.id).trim() || `ccoa-${i}`;
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    const rawPid = str(raw.personId).trim() || null;
    out.push({
      id,
      personId: rawPid && personIds.has(rawPid) ? rawPid : null,
      name,
      role: str(raw.role).trim().slice(0, 120),
      power: clampInt(raw.power, 1, 5, 3),
      interest: clampInt(raw.interest, 1, 5, 3),
      stance: STAKEHOLDER_STANCES.includes(raw.stance) ? raw.stance : 'neutral',
      vetoPlayer: raw.vetoPlayer === true,
      keyMessage: str(raw.keyMessage).trim().slice(0, 400),
      lastBriefedOn: calendarDayOrNull(raw.lastBriefedOn),
      nextBriefOn: calendarDayOrNull(raw.nextBriefOn),
    });
  }
  return out;
}

function normalizeChangeImpacts(items, personIds) {
  if (!Array.isArray(items)) return [];
  const seenPersons = new Set();
  const out = [];
  for (let i = 0; i < items.length && out.length < 40; i += 1) {
    const raw = items[i];
    if (!isPlainObject(raw)) continue;
    const personId = str(raw.personId).trim();
    if (!personId || !personIds.has(personId) || seenPersons.has(personId)) continue;
    seenPersons.add(personId);
    out.push({
      id: str(raw.id).trim() || `cimp-${i}`,
      personId,
      impactKind: CHANGE_IMPACT_KINDS.includes(raw.impactKind) ? raw.impactKind : 'scope-shift',
      newRoleLabel: str(raw.newRoleLabel).trim().slice(0, 160),
      createTransitionPlan: raw.createTransitionPlan === true,
    });
  }
  return out;
}

function normalizeChangeWins(items, todayDay) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (let i = 0; i < items.length && out.length < 20; i += 1) {
    const raw = items[i];
    if (!isPlainObject(raw)) continue;
    const text = str(raw.text).trim().slice(0, 300);
    if (!text) continue;
    out.push({
      id: str(raw.id).trim() || `cwin-${i}`,
      text,
      achievedOn: calendarDayOrNull(raw.achievedOn) || todayDay,
      verified: raw.verified !== false,
    });
  }
  return out;
}

function normalizeChangeMetrics(items, todayDay) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (let i = 0; i < items.length && out.length < 10; i += 1) {
    const raw = items[i];
    if (!isPlainObject(raw)) continue;
    const name = str(raw.name).trim().slice(0, 120);
    if (!name) continue;
    const obsRaw = Array.isArray(raw.observations) ? raw.observations : [];
    const observations = [];
    for (let k = 0; k < obsRaw.length && observations.length < 60; k += 1) {
      const o = obsRaw[k];
      if (!isPlainObject(o)) continue;
      const val = Number(o.value);
      if (!Number.isFinite(val)) continue;
      observations.push({
        id: str(o.id).trim() || `cobs-${i}-${k}`,
        date: calendarDayOrNull(o.date) || todayDay,
        value: Math.round(val * 100) / 100,
        phase: o.phase === 'post' ? 'post' : 'baseline',
        note: str(o.note).trim().slice(0, 300),
      });
    }
    out.push({
      id: str(raw.id).trim() || `cmet-${i}`,
      name,
      unit: str(raw.unit).trim().slice(0, 32),
      desirableDirection: raw.desirableDirection === 'higher' ? 'higher' : 'lower',
      observations,
    });
  }
  return out;
}

function normalizeChanges(raw, state, todayDay, now, warnings) {
  const personIds = new Set((state.people || []).map((p) => p.id));
  const goalIds = new Set((state.goals || []).map((g) => g.id));
  let clearedGoals = 0;

  const mapped = asArray({ changes: raw }, 'changes', warnings).map((ch, i) => {
    if (!isPlainObject(ch)) return null;
    const title = str(ch.title).trim().slice(0, 200);
    const kind = CHANGE_KINDS.includes(ch.kind) ? ch.kind : 'topology';
    if (ch.kind !== undefined && !CHANGE_KINDS.includes(ch.kind)) {
      warnings.push('Organizational changes: repaired an unrecognised change type to topology');
    }
    const status = CHANGE_STATUSES.includes(ch.status) ? ch.status : 'proposed';
    if (ch.status !== undefined && !CHANGE_STATUSES.includes(ch.status)) {
      warnings.push('Organizational changes: repaired an unrecognised change status to proposed');
    }

    let openedOn = calendarDayOrNull(ch.openedOn) || todayDay;
    if (openedOn > todayDay) {
      openedOn = todayDay;
      warnings.push('Organizational changes: clamped a future openedOn date to today');
    }
    const anchoredOn = status === 'anchored' ? (calendarDayOrNull(ch.anchoredOn) || todayDay) : null;

    let linkedGoalId = str(ch.linkedGoalId).trim() || null;
    if (linkedGoalId && !goalIds.has(linkedGoalId)) {
      linkedGoalId = null;
      clearedGoals += 1;
    }

    const rawTop = isPlainObject(ch.topology) ? ch.topology : {};
    const loadBeforeRaw = rawTop.cognitiveLoadBefore;
    const loadTargetRaw = rawTop.cognitiveLoadTarget;
    const handoffsBeforeRaw = rawTop.blockingHandoffsBefore;
    const handoffsTargetRaw = rawTop.blockingHandoffsTarget;
    const topology = {
      teamName: str(rawTop.teamName).trim().slice(0, 120),
      currentType: TEAM_TOPOLOGY_TYPES.includes(rawTop.currentType) ? rawTop.currentType : 'stream-aligned',
      targetType: TEAM_TOPOLOGY_TYPES.includes(rawTop.targetType) ? rawTop.targetType : 'stream-aligned',
      interactionMode: TOPOLOGY_INTERACTION_MODES.includes(rawTop.interactionMode)
        ? rawTop.interactionMode
        : 'x-as-a-service',
      cognitiveLoadBefore:
        loadBeforeRaw !== null && loadBeforeRaw !== undefined && loadBeforeRaw !== '' && Number.isFinite(Number(loadBeforeRaw))
          ? clampInt(loadBeforeRaw, 1, 5, 3)
          : null,
      cognitiveLoadTarget:
        loadTargetRaw !== null && loadTargetRaw !== undefined && loadTargetRaw !== '' && Number.isFinite(Number(loadTargetRaw))
          ? clampInt(loadTargetRaw, 1, 5, 2)
          : null,
      blockingHandoffsBefore:
        handoffsBeforeRaw !== null && handoffsBeforeRaw !== undefined && handoffsBeforeRaw !== '' && Number.isFinite(Number(handoffsBeforeRaw))
          ? clampInt(handoffsBeforeRaw, 0, 50, 0)
          : null,
      blockingHandoffsTarget:
        handoffsTargetRaw !== null && handoffsTargetRaw !== undefined && handoffsTargetRaw !== '' && Number.isFinite(Number(handoffsTargetRaw))
          ? clampInt(handoffsTargetRaw, 0, 50, 0)
          : null,
      collaboratingTeamsCount: clampInt(rawTop.collaboratingTeamsCount, 0, 20, 0),
    };

    const rawStar = isPlainObject(ch.star) ? ch.star : {};
    const star = {};
    for (const pillar of STAR_PILLARS) {
      star[pillar] = str(rawStar[pillar]).trim().slice(0, 600);
    }

    const effort = normalizePertTriple(
      ch.effortDays?.optimistic,
      ch.effortDays?.mostLikely,
      ch.effortDays?.pessimistic,
      'change effort-day',
      warnings,
    );

    const rawEcon = isPlainObject(ch.economics) ? ch.economics : {};
    const benefit = normalizePertTriple(
      rawEcon.monthlyBenefit?.optimistic,
      rawEcon.monthlyBenefit?.mostLikely,
      rawEcon.monthlyBenefit?.pessimistic,
      'change monthly benefit',
      warnings,
    );
    const economics = {
      currency: (str(rawEcon.currency, 'USD').trim().toUpperCase().slice(0, 6)) || 'USD',
      transitionCost: nonNegativeFinite(rawEcon.transitionCost, 0),
      monthlyBenefit: { optimistic: benefit.o, mostLikely: benefit.m, pessimistic: benefit.p },
      horizonMonths: clampInt(rawEcon.horizonMonths, 1, 60, 12),
    };

    const kotterStage = KOTTER_STEPS.includes(ch.kotterStage) ? ch.kotterStage : 'urgency';
    const completedSteps = [
      ...new Set(
        (Array.isArray(ch.completedSteps) ? ch.completedSteps : []).filter((s) => KOTTER_STEPS.includes(s)),
      ),
    ];

    const createdAt = isoOrNull(ch.createdAt) || now;
    const updatedAt = isoOrNull(ch.updatedAt) || createdAt;
    const defaultReversibility = ['topology', 'reporting-line'].includes(kind) ? 'irreversible' : 'reversible';

    return {
      id: str(ch.id).trim() || `chg-${i}`,
      title,
      kind,
      status,
      summary: str(ch.summary).trim().slice(0, 2000),
      vision: str(ch.vision).trim().slice(0, 2000),
      nonGoals: str(ch.nonGoals).trim().slice(0, 1200),
      reversibility: ch.reversibility === 'reversible' || ch.reversibility === 'irreversible'
        ? ch.reversibility
        : defaultReversibility,
      ownerId: str(ch.ownerId).trim() || null,
      linkedGoalId,
      openedOn,
      targetOn: calendarDayOrNull(ch.targetOn),
      reviewOn: calendarDayOrNull(ch.reviewOn),
      anchoredOn,
      closedReason: str(ch.closedReason).trim().slice(0, 1500),
      kotterStage,
      completedSteps,
      shortTermWins: normalizeChangeWins(ch.shortTermWins, todayDay),
      topology,
      forces: normalizeChangeForces(ch.forces),
      star,
      coalition: normalizeChangeCoalition(ch.coalition, personIds),
      impacts: normalizeChangeImpacts(ch.impacts, personIds),
      effortDays: { optimistic: effort.o, mostLikely: effort.m, pessimistic: effort.p },
      economics,
      metrics: normalizeChangeMetrics(ch.metrics, todayDay),
      autoCreateDecision: ch.autoCreateDecision !== false,
      createdAt,
      updatedAt,
    };
  });

  const valid = mapped.filter((ch) => ch && ch.title);
  if (valid.length !== mapped.length) {
    warnings.push(`Organizational changes: dropped ${mapped.length - valid.length} record(s) with a missing title`);
  }
  if (clearedGoals) {
    warnings.push(`Organizational changes: cleared ${clearedGoals} broken goal link(s)`);
  }
  return uniqueIds(valid, 'Organizational changes', warnings);
}

function normalizeNegotiationSettlement(raw, status, openedOn, closedOn, todayDay, warnings) {
  if (status !== 'agreed' || !isPlainObject(raw)) {
    if (isPlainObject(raw) && status !== 'agreed') {
      warnings.push('Negotiations: cleared settlement actuals on a negotiation that is not agreed');
    }
    return null;
  }
  const hasRealised = raw.realisedValue !== null && raw.realisedValue !== undefined && raw.realisedValue !== '';
  const realisedNum = hasRealised ? Number(raw.realisedValue) : NaN;
  const realisedValue = Number.isFinite(realisedNum) && realisedNum >= 0
    ? Math.round(realisedNum * 100) / 100
    : null;
  if (hasRealised && realisedValue === null) {
    warnings.push('Negotiations: dropped an invalid or negative realised settlement value');
  }
  const counterpartyDelivered = typeof raw.counterpartyDelivered === 'boolean' ? raw.counterpartyDelivered : null;
  const note = str(raw.note).trim().slice(0, 2000);
  if (realisedValue === null && counterpartyDelivered === null && !note) {
    return null;
  }
  const anchor = closedOn || openedOn || todayDay;
  let settledOn = calendarDayOrNull(raw.settledOn) || anchor;
  if (settledOn < anchor) {
    settledOn = anchor;
    warnings.push('Negotiations: clamped a settlement date that predated the agreement close');
  } else if (settledOn > todayDay) {
    settledOn = todayDay;
    warnings.push('Negotiations: clamped a future settlement date to today');
  }
  return {
    settledOn,
    realisedValue,
    counterpartyDelivered,
    note,
  };
}

function repairDelegationRecoveryChains(delegations, warnings) {
  const byId = new Map(delegations.map((d) => [d.id, d]));
  const claimedPrior = new Set();
  let repaired = 0;

  // 1. Validate priorDelegationId on successor delegations (must exist, be
  // returned, not self, not claimed twice, and not form a cycle).
  for (const d of delegations) {
    if (!d.priorDelegationId) continue;
    const prior = byId.get(d.priorDelegationId);
    if (!prior || prior.id === d.id || prior.status !== 'returned' || claimedPrior.has(prior.id)) {
      d.priorDelegationId = null;
      repaired += 1;
      continue;
    }
    // Check for cycle walking backwards
    const visited = new Set([d.id]);
    let cursor = prior;
    let cyclic = false;
    while (cursor) {
      if (visited.has(cursor.id)) {
        cyclic = true;
        break;
      }
      visited.add(cursor.id);
      cursor = cursor.priorDelegationId ? byId.get(cursor.priorDelegationId) : null;
    }
    if (cyclic) {
      d.priorDelegationId = null;
      repaired += 1;
      continue;
    }
    claimedPrior.add(prior.id);
  }

  // 2. Reconcile forward supersededByDelegationId on returned delegations.
  const childByPriorId = new Map();
  for (const d of delegations) {
    if (d.priorDelegationId) childByPriorId.set(d.priorDelegationId, d);
  }

  for (const d of delegations) {
    if (d.status !== 'returned') {
      if (d.supersededByDelegationId || d.recoveredOn) {
        d.supersededByDelegationId = null;
        d.recoveredOn = null;
        repaired += 1;
      }
      continue;
    }
    let child = childByPriorId.get(d.id) || null;
    if (!child && d.supersededByDelegationId) {
      const candidate = byId.get(d.supersededByDelegationId);
      if (candidate && candidate.id !== d.id && !candidate.priorDelegationId && !claimedPrior.has(d.id)) {
        // Check cycle before adopting forward link
        const visited = new Set([candidate.id]);
        let cursor = d;
        let cyclic = false;
        while (cursor) {
          if (visited.has(cursor.id)) {
            cyclic = true;
            break;
          }
          visited.add(cursor.id);
          cursor = cursor.priorDelegationId ? byId.get(cursor.priorDelegationId) : null;
        }
        if (!cyclic) {
          candidate.priorDelegationId = d.id;
          claimedPrior.add(d.id);
          childByPriorId.set(d.id, candidate);
          child = candidate;
        }
      }
    }
    if (child) {
      d.supersededByDelegationId = child.id;
      const fallbackRecovered = child.delegatedOn && child.delegatedOn >= d.returnedOn ? child.delegatedOn : d.returnedOn;
      d.recoveredOn = d.recoveredOn && d.recoveredOn >= d.returnedOn ? d.recoveredOn : fallbackRecovered;
    } else if (d.supersededByDelegationId || d.recoveredOn) {
      d.supersededByDelegationId = null;
      d.recoveredOn = null;
      repaired += 1;
    }
  }

  if (repaired) {
    warnings.push(`Delegations: repaired ${repaired} broken, non-returned or cyclic recovery link(s)`);
  }
}

/**
 * Schema v23 — Negotiation Workbench collection. Counterparty reservation
 * prices and confidences are explicitly estimates; normalization never fills
 * missing numeric fields with guesses. Additive: pre-v23 workspaces gain an
 * empty list via the 22 → 23 migration.
 */
function normalizeNegotiations(raw, state, todayDay, now, warnings) {
  const personIds = new Set(state.people.map((p) => p.id));
  const goalIds = new Set(state.goals.map((g) => g.id));
  let clearedGoalLinks = 0;

  const mapped = asArray({ negotiations: raw }, 'negotiations', warnings).map((n, i) => {
    const title = str(n.title).trim().slice(0, 200);
    const kind = NEGOTIATION_KINDS.includes(n.kind) ? n.kind : 'other';
    if (n.kind !== undefined && !NEGOTIATION_KINDS.includes(n.kind)) {
      warnings.push('Negotiations: repaired an unrecognised negotiation kind to other');
    }
    const status = NEGOTIATION_STATUSES.includes(n.status) ? n.status : 'preparing';
    if (n.status !== undefined && !NEGOTIATION_STATUSES.includes(n.status)) {
      warnings.push('Negotiations: repaired an unrecognised status to preparing');
    }

    let openedOn = calendarDayOrNull(n.openedOn) || todayDay;
    if (openedOn > todayDay) {
      openedOn = todayDay;
      warnings.push('Negotiations: clamped a future opened date to today');
    }
    const nextSessionOn = (() => {
      const day = calendarDayOrNull(n.nextSessionOn);
      return day && day >= openedOn ? day : null;
    })();
    const reviewOn = (() => {
      const day = calendarDayOrNull(n.reviewOn);
      return day && day >= openedOn ? day : null;
    })();
    const isClosed = status === 'agreed' || status === 'withdrawn';
    let closedOn = null;
    if (isClosed) {
      const candidate = calendarDayOrNull(n.closedOn);
      closedOn = candidate && candidate >= openedOn && candidate <= todayDay ? candidate : todayDay;
    }

    let linkedGoalId = str(n.linkedGoalId).trim() || null;
    if (linkedGoalId && !goalIds.has(linkedGoalId)) {
      linkedGoalId = null;
      clearedGoalLinks += 1;
    }

    const sourceType = LINK_ENTITY_TYPES.includes(n.sourceType) && !FORBIDDEN_LINK_TYPES.includes(n.sourceType)
      ? n.sourceType
      : null;
    const sourceId = sourceType ? str(n.sourceId).trim() || null : null;

    const stakesNum = Number(n.stakesValue);
    const stakesValue = Number.isFinite(stakesNum) && stakesNum >= 0 ? Math.round(stakesNum * 100) / 100 : null;
    const batnaNum = Number(n.ourBatnaValue);
    const ourBatnaValue = Number.isFinite(batnaNum) && batnaNum >= 0 ? Math.round(batnaNum * 100) / 100 : null;

    const issues = (Array.isArray(n.issues) ? n.issues : [])
      .slice(0, 12)
      .map((issue, index) => normalizeIssueInput(issue, index));
    if (issues.some((issue) => !issue.name)) {
      warnings.push('Negotiations: one or more issues are unnamed; name them before relying on ZOPA analysis');
    }

    const lists = normalizeStringLists(n);
    const agreedTerms = (Array.isArray(n.agreedTerms) ? n.agreedTerms : []).slice(0, 20).map((t, index) => {
      const term = isPlainObject(t) ? t : {};
      const ownerId = str(term.ownerId).trim();
      const agreedNum = term.agreedValue !== null && term.agreedValue !== undefined && term.agreedValue !== '' ? Number(term.agreedValue) : NaN;
      const settledNum = status === 'agreed' && term.settledValue !== null && term.settledValue !== undefined && term.settledValue !== '' ? Number(term.settledValue) : NaN;
      const priorOwners = (Array.isArray(term.priorOwners) ? term.priorOwners : [])
        .filter(isPlainObject)
        .slice(0, 10)
        .map((po) => {
          const pid = str(po.ownerId).trim();
          return {
            ownerId: pid && personIds.has(pid) ? pid : null,
            delegationId: str(po.delegationId).trim() || null,
            returnedOn: calendarDayOrNull(po.returnedOn),
            returnReason: str(po.returnReason).trim().slice(0, 600),
            recoveredOn: calendarDayOrNull(po.recoveredOn),
          };
        })
        .filter((po) => po.ownerId || po.delegationId || po.returnReason);
      return {
        id: str(term.id).trim() || `negterm-${i + 1}-${index + 1}`,
        issueId: str(term.issueId).trim() || null,
        text: str(term.text).trim().slice(0, 600),
        ownerId: ownerId && personIds.has(ownerId) ? ownerId : null,
        dueOn: calendarDayOrNull(term.dueOn),
        agreedValue: Number.isFinite(agreedNum) ? Math.round(agreedNum * 100) / 100 : null,
        settledValue: Number.isFinite(settledNum) ? Math.round(settledNum * 100) / 100 : null,
        unit: str(term.unit).trim().slice(0, 12),
        priorOwners,
      };
    }).filter((t) => t.text);

    const settlement = normalizeNegotiationSettlement(n.settlement, status, openedOn, closedOn, todayDay, warnings);

    return {
      id: str(n.id).trim() || `neg-${i + 1}`,
      title,
      kind,
      status,
      counterparty: str(n.counterparty).trim().slice(0, 160),
      counterpartyRole: str(n.counterpartyRole).trim().slice(0, 120),
      ownerId: str(n.ownerId).trim() || null,
      linkedGoalId,
      sourceType,
      sourceId,
      openedOn,
      nextSessionOn,
      reviewOn,
      closedOn,
      strategic: Boolean(n.strategic),
      stakesValue,
      stakesCurrency: (str(n.stakesCurrency, 'USD').trim().toUpperCase().slice(0, 6)) || 'USD',
      ourBatnaDescription: str(n.ourBatnaDescription).trim().slice(0, 2000),
      ourBatnaValue,
      ourBatnaUnit: str(n.ourBatnaUnit).trim().slice(0, 12),
      theirBatnaEstimate: str(n.theirBatnaEstimate).trim().slice(0, 2000),
      ourInterests: lists.ourInterests,
      theirInterests: lists.theirInterests,
      objectiveCriteria: lists.objectiveCriteria,
      options: lists.options,
      issues,
      agreedTerms,
      settlement,
      outcomeNotes: str(n.outcomeNotes).trim().slice(0, 4000),
      notes: str(n.notes).trim().slice(0, 4000),
      escalationCaseId: str(n.escalationCaseId).trim() || null,
      autoPropagate: n.autoPropagate !== false,
      createdAt: isoOrNull(n.createdAt) || now,
      updatedAt: isoOrNull(n.updatedAt) || isoOrNull(n.createdAt) || now,
    };
  });

  const valid = mapped.filter((record) => record.title);
  if (valid.length !== mapped.length) {
    warnings.push(`Negotiations: dropped ${mapped.length - valid.length} record(s) with a missing title`);
  }
  if (clearedGoalLinks) {
    warnings.push(`Negotiations: cleared ${clearedGoalLinks} broken goal link(s)`);
  }
  return uniqueIds(valid, 'Negotiations', warnings);
}

/**
 * Schema v24: budget envelopes & financial commitment lines. Normalisation
 * never invents an amount: a missing committed figure stays null (unpriced),
 * a missing actual stays null (a visible actuals gap), and a line whose
 * funded source record no longer exists keeps its money figures while only
 * the dead source pointer is cleared — deleting a goal must not delete the
 * record that money was committed.
 */
/**
 * A money field is absent (null) or a number. `null` must NOT be coerced to 0:
 * in the budget ledger "blank" and "zero" are different facts — an unpriced
 * commitment is not a commitment of nothing, and a spend with no recorded actual
 * is not a spend of nothing (ADR-0136).
 */
function moneyOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  return nonNegativeOrNull(v);
}

function normalizeBudgets(raw, state, todayDay, now, warnings) {
  const personIds = new Set(state.people.map((p) => p.id));
  const sourceIds = {
    case: new Set((state.cases || []).map((r) => r.id)),
    negotiation: new Set((state.negotiations || []).map((r) => r.id)),
    portfolio: new Set((state.portfolio || []).map((r) => r.id)),
    requisition: new Set((state.requisitions || []).map((r) => r.id)),
    goal: new Set((state.goals || []).map((r) => r.id)),
    decision: new Set((state.decisions || []).map((r) => r.id)),
    change: new Set((state.changes || []).map((r) => r.id)),
  };
  let clearedSources = 0;

  const mapped = asArray({ budgets: raw }, 'budgets', warnings).map((b, i) => {
    const status = BUDGET_STATUSES.includes(b.status) ? b.status : 'active';
    if (b.status !== undefined && !BUDGET_STATUSES.includes(b.status)) {
      warnings.push('Budgets: repaired an unrecognised budget status to active');
    }
    const startsOn = calendarDayOrNull(b.startsOn);
    let endsOn = calendarDayOrNull(b.endsOn);
    if (startsOn && endsOn && endsOn < startsOn) {
      endsOn = null;
      warnings.push('Budgets: cleared a period end date that preceded its start date');
    }
    const rawLimit = moneyOrNull(b.limit);
    const ownerIdRaw = str(b.ownerId).trim();

    const lines = (Array.isArray(b.lines) ? b.lines : []).slice(0, 120).map((rawLine, j) => {
      const line = isPlainObject(rawLine) ? rawLine : {};
      const lineStatus = BUDGET_LINE_STATUSES.includes(line.status) ? line.status : 'planned';
      const category = BUDGET_CATEGORIES.includes(line.category) ? line.category : 'other';
      let sourceType = BUDGET_SOURCE_TYPES.includes(line.sourceType) ? line.sourceType : null;
      let sourceId = sourceType ? str(line.sourceId).trim() || null : null;
      if (sourceType && (!sourceId || !sourceIds[sourceType]?.has(sourceId))) {
        sourceType = null;
        sourceId = null;
        clearedSources += 1;
      }
      const ownerRaw = str(line.ownerId).trim();
      let spentOn = lineStatus === 'spent' ? calendarDayOrNull(line.spentOn) : null;
      if (spentOn && spentOn > todayDay) spentOn = todayDay;
      return {
        id: str(line.id).trim() || `bline-${i + 1}-${j + 1}`,
        title: str(line.title).trim().slice(0, 200),
        category,
        status: lineStatus,
        // ADR-0136 (defect): an ABSENT amount is null, never 0. `Number(null)`
        // is 0, so a blank commitment was normalised into a priced commitment of
        // zero and a spent line with no recorded actual into a spend of zero —
        // which made `evaluateBudget`'s "spent without actual" and "unpriced
        // open line" branches unreachable after the first reload, and scored a
        // fake perfect underspend in the commitment-calibration ledger.
        committedAmount: moneyOrNull(line.committedAmount),
        // An actual only exists once money has landed; on any other status a
        // stray figure would be scored as spend that never happened.
        actualAmount: lineStatus === 'spent' ? moneyOrNull(line.actualAmount) : null,
        committedOn: calendarDayOrNull(line.committedOn),
        expectedOn: calendarDayOrNull(line.expectedOn),
        spentOn,
        releasedOn: lineStatus === 'released' ? calendarDayOrNull(line.releasedOn) : null,
        releasedReason: lineStatus === 'released' ? str(line.releasedReason).trim().slice(0, 600) : '',
        actualsDueOn: lineStatus === 'committed' ? calendarDayOrNull(line.actualsDueOn) : null,
        sourceType,
        sourceId,
        ownerId: ownerRaw && personIds.has(ownerRaw) ? ownerRaw : null,
        note: str(line.note).trim().slice(0, 1000),
      };
    }).filter((l) => l.title);

    return {
      id: str(b.id).trim() || `bud-${i + 1}`,
      name: str(b.name).trim().slice(0, 160),
      currency: (str(b.currency, 'USD').trim().toUpperCase().slice(0, 6)) || 'USD',
      // Zero or blank means "tracking-only envelope, no ceiling recorded" —
      // never a ceiling of zero that every commitment would "breach".
      limit: rawLimit !== null && rawLimit > 0 ? rawLimit : null,
      periodLabel: str(b.periodLabel).trim().slice(0, 80),
      startsOn,
      endsOn,
      status,
      ownerId: ownerIdRaw && personIds.has(ownerIdRaw) ? ownerIdRaw : null,
      note: str(b.note).trim().slice(0, 2000),
      lines,
      autoPropagate: b.autoPropagate !== false,
      createdAt: isoOrNull(b.createdAt) || now,
      updatedAt: isoOrNull(b.updatedAt) || isoOrNull(b.createdAt) || now,
    };
  });

  const valid = mapped.filter((record) => record.name);
  if (valid.length !== mapped.length) {
    warnings.push(`Budgets: dropped ${mapped.length - valid.length} record(s) with a missing name`);
  }
  if (clearedSources) {
    warnings.push(`Budgets: cleared ${clearedSources} budget-line source link(s) to records that no longer exist (amounts kept)`);
  }
  return uniqueIds(valid, 'Budgets', warnings);
}

/**
 * Schema v25: the Stakeholder Influence Register. Normalisation repairs
 * rather than rejects: unknown enums fall back to documented defaults with a
 * warning, ratings clamp to 1..5, dangling alliance targets and person links
 * are cleared (never invented), stance-history dates in the future clamp to
 * today, and a blank-name record is dropped with a counted warning. No
 * salience class, veto flag, stance or contact date is ever fabricated.
 */
function normalizeStakeholders(raw, state, todayDay, now, warnings) {
  const personIds = new Set((state.people || []).map((p) => p.id));
  let clearedPersonLinks = 0;
  let clearedAllianceLinks = 0;

  const mapped = asArray({ stakeholders: raw }, 'stakeholders', warnings).map((s, i) => {
    const name = str(s.name).trim().slice(0, 120);
    const category = STAKEHOLDER_CATEGORIES.includes(s.category) ? s.category : 'other';
    if (s.category !== undefined && !STAKEHOLDER_CATEGORIES.includes(s.category)) {
      warnings.push('Stakeholders: repaired an unrecognised category to other');
    }
    const status = STAKEHOLDER_STATUSES.includes(s.status) ? s.status : 'active';
    if (s.status !== undefined && !STAKEHOLDER_STATUSES.includes(s.status)) {
      warnings.push('Stakeholders: repaired an unrecognised status to active');
    }
    const stance = STAKEHOLDER_STANCES.includes(s.stance) ? s.stance : 'neutral';
    if (s.stance !== undefined && !STAKEHOLDER_STANCES.includes(s.stance)) {
      warnings.push('Stakeholders: repaired an unrecognised stance to neutral');
    }
    const estimateConfidence = STK_ESTIMATE_CONFIDENCE.includes(s.estimateConfidence)
      ? s.estimateConfidence
      : 'medium';
    const commsCadence = STAKEHOLDER_CADENCES.includes(s.commsCadence) ? s.commsCadence : 'weekly';

    let personId = str(s.personId).trim() || null;
    if (personId && !personIds.has(personId)) {
      personId = null;
      clearedPersonLinks += 1;
    }

    let lastContactOn = calendarDayOrNull(s.lastContactOn);
    if (lastContactOn && lastContactOn > todayDay) {
      lastContactOn = todayDay;
      warnings.push('Stakeholders: clamped a future last-contact date to today');
    }
    let nextContactOn = calendarDayOrNull(s.nextContactOn);
    if (nextContactOn && lastContactOn && nextContactOn < lastContactOn) {
      nextContactOn = null;
    }

    const idSet = new Set((Array.isArray(raw) ? raw : []).map((r) => str(r?.id).trim()).filter(Boolean));
    const alliances = (Array.isArray(s.alliances) ? s.alliances : [])
      .slice(0, 25)
      .map((edge, j) => {
        if (!isPlainObject(edge)) return null;
        const targetId = str(edge.targetId).trim();
        const kind = ALLIANCE_KINDS.includes(edge.kind) ? edge.kind : 'alliance';
        return {
          id: str(edge.id).trim() || `stkall-${i + 1}-${j + 1}`,
          targetId,
          kind,
          strength: clampInt(edge.strength, 1, 5, 3),
        };
      })
      .filter((edge) => {
        if (!edge || !edge.targetId || edge.targetId === str(s.id).trim() || !idSet.has(edge.targetId)) {
          clearedAllianceLinks += 1;
          return false;
        }
        return true;
      });

    const stanceHistory = (Array.isArray(s.stanceHistory) ? s.stanceHistory : [])
      .slice(0, 50)
      .map((entry, j) => {
        if (!isPlainObject(entry)) return null;
        let on = calendarDayOrNull(entry.on);
        if (!on) return null;
        if (on > todayDay) on = todayDay;
        const sourceType = LINK_ENTITY_TYPES.includes(entry.sourceType) &&
          !FORBIDDEN_LINK_TYPES.includes(entry.sourceType)
          ? entry.sourceType
          : null;
        return {
          id: str(entry.id).trim() || `stkhist-${i + 1}-${j + 1}`,
          on,
          stance: STAKEHOLDER_STANCES.includes(entry.stance) ? entry.stance : 'neutral',
          context: str(entry.context).trim().slice(0, 600),
          sourceType,
          sourceId: sourceType ? str(entry.sourceId).trim() || null : null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(a.on).localeCompare(String(b.on)));

    const contactLog = (Array.isArray(s.contactLog) ? s.contactLog : [])
      .slice(0, 50)
      .map((entry, j) => {
        if (!isPlainObject(entry)) return null;
        let on = calendarDayOrNull(entry.on);
        if (!on) return null;
        if (on > todayDay) on = todayDay;
        return {
          id: str(entry.id).trim() || `stkcontact-${i + 1}-${j + 1}`,
          on,
          note: str(entry.note).trim().slice(0, 600),
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(a.on).localeCompare(String(b.on)));

    const tags = (Array.isArray(s.tags) ? s.tags : [])
      .map((t) => str(t).trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 8);

    return {
      id: str(s.id).trim() || `stk-${i + 1}`,
      name,
      org: str(s.org).trim().slice(0, 120),
      role: str(s.role).trim().slice(0, 120),
      personId,
      category,
      power: clampInt(s.power, 1, 5, 3),
      interest: clampInt(s.interest, 1, 5, 3),
      legitimacy: clampInt(s.legitimacy, 1, 5, 3),
      urgency: clampInt(s.urgency, 1, 5, 3),
      vetoPlayer: s.vetoPlayer === true,
      vetoBasis: str(s.vetoBasis).trim().slice(0, 400),
      stance,
      estimateConfidence,
      influenceNotes: str(s.influenceNotes).trim().slice(0, 2000),
      preferredComms: str(s.preferredComms).trim().slice(0, 200),
      keyMessage: str(s.keyMessage).trim().slice(0, 600),
      commsCadence,
      lastContactOn,
      nextContactOn,
      alliances,
      stanceHistory,
      contactLog,
      tags,
      status,
      autoPropagate: s.autoPropagate !== false,
      createdAt: isoOrNull(s.createdAt) || now,
      updatedAt: isoOrNull(s.updatedAt) || isoOrNull(s.createdAt) || now,
    };
  });

  const valid = mapped.filter((record) => record.name);
  if (valid.length !== mapped.length) {
    warnings.push(`Stakeholders: dropped ${mapped.length - valid.length} record(s) with a missing name`);
  }
  if (clearedPersonLinks) warnings.push(`Stakeholders: cleared ${clearedPersonLinks} broken roster link(s)`);
  if (clearedAllianceLinks) warnings.push(`Stakeholders: dropped ${clearedAllianceLinks} dangling or self-referencing alliance edge(s)`);
  return uniqueIds(valid, 'Stakeholders', warnings);
}

/**
 * Schema v26: normalize forecast-integrity challenges.
 *
 * A challenge is derived evidence, not a second estimate the leader typed.
 * Corrupt rows are repaired or dropped with a counted warning; a dangling
 * source pointer is never kept as a phantom graph node. The recorded forecast,
 * the reference-class central value and the conformal band are stored
 * separately so the original promise can never be silently rewritten.
 */
const FORECAST_SOURCE_COLLECTIONS = Object.freeze({
  case: 'cases',
  decision: 'decisions',
  portfolio: 'portfolio',
  budget: 'budgets',
  negotiation: 'negotiations',
  // ADR-0107: declared, clamped conventions for the Outcome Learning Loop.
  // Every one is printed in-product and refused below its own floor; none is
  // fitted from the workspace's own outcomes.
  ...OUTCOME_SETTINGS_DEFAULTS,
  // ADR-0108: declared, clamped conventions for the Decision-Fit Ledger. Every
  // one is printed in-product with its bound; none is fitted from the record.
  ...FIT_SETTINGS_DEFAULTS,
  // ADR-0109: declared, clamped conventions for the Jurisdiction Compiler.
  // Every one is printed in-product with its bound; none is fitted from the
  // record. A refused governance route is never stored as a zero.
  ...JUR_SETTINGS_DEFAULTS,

});

function normalizeForecastChallenges(raw, state, todayDay, now, warnings) {
  const mapped = asArray({ forecastChallenges: raw }, 'forecastChallenges', warnings).map((c, i) => {
    const sourceType = str(c.sourceType).trim();
    const sourceId = str(c.sourceId).trim();
    const collection = FORECAST_SOURCE_COLLECTIONS[sourceType];
    const sourceExists = Boolean(collection && (state[collection] || []).some((r) => r.id === sourceId));
    const status = FORECAST_CHALLENGE_STATUSES.includes(c.status) ? c.status : 'open';
    if (c.status !== undefined && !FORECAST_CHALLENGE_STATUSES.includes(c.status)) {
      warnings.push('Forecast challenges: repaired an unrecognised response status to open');
    }
    const numberOrNull = (value) => {
      if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };
    const history = (Array.isArray(c.history) ? c.history : [])
      .slice(-20)
      .map((entry, j) => (isPlainObject(entry) ? {
        id: str(entry.id).trim() || `fchist-${i + 1}-${j + 1}`,
        on: calendarDayOrNull(entry.on),
        action: str(entry.action).slice(0, 40),
        evidenceN: numberOrNull(entry.evidenceN),
        medianRatio: numberOrNull(entry.medianRatio),
        bandLow: numberOrNull(entry.bandLow),
        bandHigh: numberOrNull(entry.bandHigh),
      } : null))
      .filter((entry) => entry && entry.on);
    return {
      id: str(c.id).trim() || `fc-${i + 1}`,
      atomKey: str(c.atomKey).trim().slice(0, 240),
      classKey: str(c.classKey).trim().slice(0, 160),
      ledger: str(c.ledger).trim().slice(0, 60),
      quantity: str(c.quantity).trim().slice(0, 60),
      quantityLabel: str(c.quantityLabel).trim().slice(0, 120),
      sourceType,
      sourceId,
      sourceRef: str(c.sourceRef).trim() || null,
      sourceRoute: str(c.sourceRoute).trim().slice(0, 240),
      title: str(c.title).trim().slice(0, 180),
      recordedForecast: numberOrNull(c.recordedForecast),
      unit: str(c.unit).trim().slice(0, 20),
      currency: str(c.currency).trim().slice(0, 6) || null,
      direction: ['minimize', 'maximize'].includes(c.direction) ? c.direction : null,
      forecastOn: calendarDayOrNull(c.forecastOn),
      medianRatio: numberOrNull(c.medianRatio),
      referenceClassCentral: numberOrNull(c.referenceClassCentral),
      bandLow: numberOrNull(c.bandLow),
      bandHigh: numberOrNull(c.bandHigh),
      coverageBound: numberOrNull(c.coverageBound),
      coverageTarget: numberOrNull(c.coverageTarget),
      evidenceN: numberOrNull(c.evidenceN),
      signP: numberOrNull(c.signP),
      biasDirection: ['optimistic', 'padded', 'balanced'].includes(c.biasDirection) ? c.biasDirection : 'balanced',
      confidence: ['high', 'medium', 'low', 'insufficient'].includes(c.confidence) ? c.confidence : 'insufficient',
      bandScope: ['class', 'mixed-quantity-global'].includes(c.bandScope) ? c.bandScope : 'class',
      fingerprint: str(c.fingerprint).trim().slice(0, 300),
      status,
      responseNote: str(c.responseNote).trim().slice(0, 2000),
      respondedOn: status === 'open' ? null : calendarDayOrNull(c.respondedOn),
      history,
      ruleId: str(c.ruleId).trim().slice(0, 40),
      createdOn: calendarDayOrNull(c.createdOn) || todayDay,
      createdAt: isoOrNull(c.createdAt) || now,
      updatedAt: isoOrNull(c.updatedAt) || isoOrNull(c.createdAt) || now,
      sourceExists,
    };
  });
  const valid = mapped.filter((c) => {
    if (c.atomKey && c.recordedForecast !== null && c.sourceExists) return true;
    warnings.push('Forecast challenges: dropped a challenge with no scorable forecast or no surviving source record');
    return false;
  }).map(({ sourceExists, ...record }) => record);
  return uniqueIds(valid, 'Forecast challenges', warnings);
}

/**
 * Schema v27 — normalize natural-language intake drafts.
 *
 * The triage analysis is an engine-produced snapshot, not user-typed fields, so
 * it is retained as a bounded opaque object rather than re-validated field by
 * field. The draft ledger itself is repaired strictly: unknown statuses return
 * to `analyzed`, a dangling confirmed-case pointer is cleared with a warning
 * (never invented), and free text is capped at the engine's own 8,000-char
 * intake limit so a hand-edited blob cannot grow the store without bound.
 */
const INTAKE_DRAFT_STATUSES_V27 = ['analyzed', 'confirmed', 'dismissed'];

function normalizeIntakeDrafts(raw, state, now, warnings) {
  const mapped = asArray({ intakeDrafts: raw }, 'intakeDrafts', warnings).map((d, i) => {
    if (!isPlainObject(d)) return null;
    const status = INTAKE_DRAFT_STATUSES_V27.includes(d.status) ? d.status : 'analyzed';
    if (d.status !== undefined && !INTAKE_DRAFT_STATUSES_V27.includes(d.status)) {
      warnings.push('Intake drafts: repaired an unrecognised draft status to analyzed');
    }
    const sourceText = str(d.sourceText).slice(0, 8000);
    if (!sourceText.trim()) {
      warnings.push('Intake drafts: dropped a draft with no source text');
      return null;
    }
    const confirmedCaseId = str(d.confirmedCaseId);
    let casePointer = confirmedCaseId || null;
    if (casePointer && !(state.cases || []).some((c) => c.id === casePointer)) {
      warnings.push('Intake drafts: cleared a confirmed-case pointer whose case no longer exists');
      casePointer = null;
    }
    const outcomes = isPlainObject(d.outcomes)
      ? {
          primaryCategory: str(d.outcomes.primaryCategory).slice(0, 40) || null,
          primaryAccepted: d.outcomes.primaryAccepted === true,
          confidenceBand: ['high', 'medium', 'low'].includes(d.outcomes.confidenceBand)
            ? d.outcomes.confidenceBand
            : null,
          entityOffered: Math.max(0, Math.round(num(d.outcomes.entityOffered, 0))),
          entityAccepted: Math.max(0, Math.round(num(d.outcomes.entityAccepted, 0))),
          editedFields: Array.isArray(d.outcomes.editedFields)
            ? d.outcomes.editedFields.map((v) => str(v).slice(0, 60)).filter(Boolean).slice(0, 20)
            : [],
          rejectedRouteIds: Array.isArray(d.outcomes.rejectedRouteIds)
            ? d.outcomes.rejectedRouteIds.map((v) => str(v).slice(0, 60)).filter(Boolean).slice(0, 20)
            : [],
        }
      : null;
    return {
      id: str(d.id).trim() || `intake-${i + 1}`,
      createdAt: isoOrNull(d.createdAt) || now,
      updatedAt: isoOrNull(d.updatedAt) || isoOrNull(d.createdAt) || now,
      status,
      sourceText,
      engineVersion: str(d.engineVersion).slice(0, 40) || 'unknown',
      analysis: isPlainObject(d.analysis) ? d.analysis : null,
      confirmedCaseId: casePointer,
      outcomes,
      dismissReason: str(d.dismissReason).slice(0, 300),
    };
  });
  return uniqueIds(mapped.filter(Boolean), 'Intake drafts', warnings);
}

/**
 * Schema v28 — the recorded moment of a decision. Rules: only a calendar day, it
 * cannot precede the day the decision was logged, and it cannot be in the
 * future. Anything else is cleared with a warning so a hand-edited blob cannot
 * manufacture a flattering latency.
 */
function normalizeDecidedOn(value, loggedOn, now) {
  const day = calendarDayOrNull(value);
  if (!day) return null;
  if (loggedOn && day < loggedOn) return null;
  const today = String(now).slice(0, 10);
  if (day > today) return null;
  return day;
}

const TEMPO_SCHEMA_MAX_AMOUNT = 1_000_000_000_000;

function tempoAmountOrNull(value) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > TEMPO_SCHEMA_MAX_AMOUNT) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Schema v28 — decision timeboxes.
 *
 * A timebox is the leader's explicit timing position on one decision: the delay
 * profile, the believed edge of the leading option, how unsure that edge is,
 * the evidence plan and the decide-by date. Normalisation repairs enums and
 * clamps numbers, but never invents an economic input: a missing edge stays
 * null, a missing rate stays derived. A timebox whose decision no longer exists
 * is dropped with a warning (it can never be re-pointed by guessing).
 */
function normalizeTempoSchedules(raw, state, todayDay, now, warnings) {
  const decisionIds = new Set((state.decisions || []).map((d) => d.id));
  let droppedOrphans = 0;
  let clearedDates = 0;

  const mapped = asArray({ tempoSchedules: raw }, 'tempoSchedules', warnings).map((s, i) => {
    if (!isPlainObject(s)) return null;
    const decisionId = str(s.decisionId).trim();
    if (!decisionId || !decisionIds.has(decisionId)) {
      droppedOrphans += 1;
      return null;
    }
    const status = TEMPO_SCHEDULE_STATUSES.includes(s.status) ? s.status : 'proposed';
    if (s.status !== undefined && !TEMPO_SCHEDULE_STATUSES.includes(s.status)) {
      warnings.push('Tempo timeboxes: repaired an unrecognised status to proposed');
    }
    const profile = DELAY_PROFILES.includes(s.profile) ? s.profile : 'linear';
    if (s.profile !== undefined && !DELAY_PROFILES.includes(s.profile)) {
      warnings.push('Tempo timeboxes: repaired an unrecognised delay profile to linear');
    }
    const dayOrFallback = (value, fallback = null) => {
      const day = calendarDayOrNull(value);
      if (value && !day) clearedDates += 1;
      return day || fallback;
    };
    const pct = (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return null;
      return Math.min(100, Math.max(0, Math.round(n)));
    };
    const positiveOrNull = (value) => {
      const n = tempoAmountOrNull(value);
      return n !== null && n > 0 ? n : null;
    };
    const history = (Array.isArray(s.history) ? s.history : [])
      .filter(isPlainObject)
      .slice(-30)
      .map((entry) => ({
        on: dayOrFallback(entry.on),
        action: str(entry.action).slice(0, 40),
        note: str(entry.note).slice(0, 400),
        plannedWaitDays: Number.isFinite(Number(entry.plannedWaitDays)) ? Math.round(Number(entry.plannedWaitDays)) : null,
        realizedLatencyDays: Number.isFinite(Number(entry.realizedLatencyDays)) ? Math.round(Number(entry.realizedLatencyDays)) : null,
      }))
      .filter((entry) => entry.on);
    return {
      id: str(s.id).trim() || `tempo-${i + 1}`,
      decisionId,
      status,
      profile,
      currency: str(s.currency).trim().toUpperCase().slice(0, 6) || null,
      valueAtStakeOverride: positiveOrNull(s.valueAtStakeOverride),
      derivedAmount: tempoAmountOrNull(s.derivedAmount),
      derivedAt: dayOrFallback(s.derivedAt),
      derivedTermCount: Math.max(0, Math.round(num(s.derivedTermCount, 0))),
      delayCostPerWeek: positiveOrNull(s.delayCostPerWeek),
      windowWeeks: Math.min(260, Math.max(1, Math.round(num(s.windowWeeks, 12)))),
      deadlineDays: Math.min(3650, Math.max(0, Math.round(num(s.deadlineDays, 21)))),
      advantageAmount: positiveOrNull(s.advantageAmount),
      uncertaintyPct: pct(s.uncertaintyPct),
      halfLifeDays: Math.min(3650, Math.max(1, Math.round(num(s.halfLifeDays, 14)))),
      infoWeeks: s.infoWeeks === null || s.infoWeeks === undefined || s.infoWeeks === '' ? null : Math.min(52, Math.max(0, Math.round(num(s.infoWeeks, 0)))),
      infoCostAmount: tempoAmountOrNull(s.infoCostAmount) ?? 0,
      infoCostNote: str(s.infoCostNote).slice(0, 300),
      decideBy: dayOrFallback(s.decideBy),
      plannedTempoDays: Math.min(3650, Math.max(0, Math.round(num(s.plannedTempoDays, 21)))),
      decisionType: ['delegated', 'cross-cutting', 'big-bet'].includes(s.decisionType) ? s.decisionType : null,
      notes: str(s.notes).slice(0, 2000),
      createdOn: dayOrFallback(s.createdOn, todayDay) || todayDay,
      createdAt: isoOrNull(s.createdAt) || now,
      updatedAt: isoOrNull(s.updatedAt) || isoOrNull(s.createdAt) || now,
      armedOn: dayOrFallback(s.armedOn),
      settledOn: dayOrFallback(s.settledOn),
      abandonedOn: dayOrFallback(s.abandonedOn),
      abandonReason: str(s.abandonReason).slice(0, 600),
      realizedLatencyDays: Number.isFinite(Number(s.realizedLatencyDays)) ? Math.max(0, Math.round(Number(s.realizedLatencyDays))) : null,
      resolvedChoice: str(s.resolvedChoice).slice(0, 200),
      history,
    };
  });
  if (droppedOrphans) warnings.push(`Tempo timeboxes: dropped ${droppedOrphans} timebox(es) whose decision no longer exists`);
  if (clearedDates) warnings.push(`Tempo timeboxes: cleared ${clearedDates} invalid date(s)`);
  // One live timebox per decision is an invariant, not a convention. Two armed
  // dates for one call would double-count both the value at stake and the
  // carrying cost. The newest live record wins (it holds the latest human
  // intent); earlier live records are demoted to abandoned with a written
  // reason instead of being deleted, so the audit trail stays intact.
  const liveByDecision = new Map();
  const kept = [];
  const demoted = [];
  // A commitment always outranks a suggestion; among equals the newest wins.
  const rank = (s) => (s.status === 'armed' ? 0 : 1);
  const ordered = mapped
    .filter(Boolean)
    .sort((a, b) => rank(a) - rank(b) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
  for (const schedule of ordered) {
    if (schedule.status === 'settled' || schedule.status === 'abandoned') {
      kept.push(schedule);
      continue;
    }
    const winner = liveByDecision.get(schedule.decisionId);
    if (!winner) {
      liveByDecision.set(schedule.decisionId, schedule);
      kept.push(schedule);
      continue;
    }
    demoted.push({
      ...schedule,
      status: 'abandoned',
      abandonedOn: schedule.abandonedOn || schedule.updatedAt.slice(0, 10),
      abandonReason: `Superseded by the live timebox ${winner.id} during import: one decision cannot hold two live decide-by dates.`,
      history: [
        ...schedule.history,
        { on: schedule.updatedAt.slice(0, 10), action: 'abandoned', note: `Superseded by ${winner.id} (one live timebox per decision)`, plannedWaitDays: null, realizedLatencyDays: null },
      ].slice(-30),
    });
  }
  if (demoted.length) warnings.push(`Tempo timeboxes: closed ${demoted.length} duplicate live timebox(es) so each decision keeps one decide-by date`);
  return uniqueIds([...kept, ...demoted], 'Tempo timeboxes', warnings);
}

/**
 * Schema v29 — Operational Resilience, Dependency & Continuity nodes.
 *
 * Repairs invalid enums, clamps durations/amounts without ever turning missing
 * `null` inputs into fabricated `0`s, strips self-loops and missing upstream
 * pointers, and preserves bounded drill & audit history.
 */
function normalizeDependencies(raw, state, todayDay, now, warnings) {
  const personIds = new Set((state.people || []).map((p) => p.id));
  const goalIds = new Set((state.goals || []).map((g) => g.id));
  const budgetIds = new Set((state.budgets || []).map((b) => b.id));
  const negotiationIds = new Set((state.negotiations || []).map((n) => n.id));
  const stakeholderIds = new Set((state.stakeholders || []).map((s) => s.id));
  const portfolioIds = new Set((state.portfolio || []).map((p) => p.id));
  const caseIds = new Set((state.cases || []).map((c) => c.id));

  const nonNegOrNull = (value, max = TEMPO_SCHEMA_MAX_AMOUNT) => {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n < 0 || n > max) return null;
    return Math.round(n * 100) / 100;
  };

  let droppedNonObjects = 0;
  let clearedDates = 0;
  const dayOrFallback = (value, fallback = null) => {
    const day = calendarDayOrNull(value);
    if (value && !day) clearedDates += 1;
    return day || fallback;
  };

  const prelim = asArray({ dependencies: raw }, 'dependencies', warnings)
    .map((d, i) => {
      if (!isPlainObject(d)) {
        droppedNonObjects += 1;
        return null;
      }
      const kind = DEPENDENCY_KINDS.includes(d.kind) ? d.kind : 'service';
      if (d.kind !== undefined && !DEPENDENCY_KINDS.includes(d.kind)) {
        warnings.push('Dependencies: repaired an unrecognised dependency kind to service');
      }
      const criticality = DEPENDENCY_CRITICALITIES.includes(d.criticality) ? d.criticality : 'important';
      if (d.criticality !== undefined && !DEPENDENCY_CRITICALITIES.includes(d.criticality)) {
        warnings.push('Dependencies: repaired an unrecognised criticality to important');
      }
      const status = DEPENDENCY_STATUSES.includes(d.status) ? d.status : 'active';
      if (d.status !== undefined && !DEPENDENCY_STATUSES.includes(d.status)) {
        warnings.push('Dependencies: repaired an unrecognised status to active');
      }
      const substitutability = SUBSTITUTABILITY_MODES.includes(d.substitutability) ? d.substitutability : 'none';
      if (d.substitutability !== undefined && !SUBSTITUTABILITY_MODES.includes(d.substitutability)) {
        warnings.push('Dependencies: repaired an unrecognised substitutability mode to none');
      }

      const seenStewards = new Set();
      const stewards = (Array.isArray(d.stewards) ? d.stewards : [])
        .filter(isPlainObject)
        .map((st) => {
          const personId = str(st.personId).trim();
          if (!personId || !personIds.has(personId) || seenStewards.has(personId)) return null;
          seenStewards.add(personId);
          const role = STEWARD_ROLES.includes(st.role) ? st.role : 'backup';
          return {
            personId,
            role,
            verifiedOn: dayOrFallback(st.verifiedOn, null),
            notes: str(st.notes).slice(0, 300),
          };
        })
        .filter(Boolean);

      const drills = (Array.isArray(d.drills) ? d.drills : [])
        .filter(isPlainObject)
        .slice(-50)
        .map((dr, j) => ({
          id: str(dr.id).trim() || `drl-${i + 1}-${j + 1}`,
          date: dayOrFallback(dr.date, todayDay),
          kind: DRILL_KINDS.includes(dr.kind) ? dr.kind : 'tabletop',
          scenario: str(dr.scenario).slice(0, 500),
          estimatedTtrDays: nonNegOrNull(dr.estimatedTtrDays, 3650),
          realizedTtrDays: nonNegOrNull(dr.realizedTtrDays, 3650),
          outcome: DRILL_OUTCOMES.includes(dr.outcome) ? dr.outcome : 'within-tolerance',
          gapNote: str(dr.gapNote).slice(0, 800),
          linkedCaseId: str(dr.linkedCaseId).trim() && caseIds.has(str(dr.linkedCaseId).trim())
            ? str(dr.linkedCaseId).trim()
            : null,
          recordedAt: isoOrNull(dr.recordedAt) || now,
        }));

      const history = (Array.isArray(d.history) ? d.history : [])
        .filter(isPlainObject)
        .slice(-40)
        .map((h) => ({
          on: dayOrFallback(h.on),
          action: str(h.action).slice(0, 50),
          note: str(h.note).slice(0, 400),
        }))
        .filter((h) => h.on);

      const linkedGoalIds = [...new Set(
        (Array.isArray(d.linkedGoalIds) ? d.linkedGoalIds : [])
          .map((gid) => str(gid).trim())
          .filter((gid) => gid && goalIds.has(gid)),
      )];

      const rawBudgetId = str(d.linkedBudgetId).trim();
      const rawNegId = str(d.linkedNegotiationId).trim();
      const rawStkId = str(d.linkedStakeholderId).trim();
      const rawPortId = str(d.linkedPortfolioId).trim();

      return {
        id: str(d.id).trim() || `dep-${i + 1}`,
        name: str(d.name, 'Unnamed dependency').trim().slice(0, 180) || 'Unnamed dependency',
        kind,
        criticality,
        status,
        summary: str(d.summary).slice(0, 2000),
        ttsDays: nonNegOrNull(d.ttsDays, 3650),
        ttrDays: nonNegOrNull(d.ttrDays, 3650),
        substitutability,
        warmSwitchDays: nonNegOrNull(d.warmSwitchDays, 3650),
        exitPlanSummary: str(d.exitPlanSummary).slice(0, 2000),
        currency: str(d.currency, 'USD').trim().toUpperCase().slice(0, 6) || 'USD',
        dailyImpactOverride: nonNegOrNull(d.dailyImpactOverride),
        derivedDailyImpact: nonNegOrNull(d.derivedDailyImpact),
        derivedCurrency: str(d.derivedCurrency).trim().toUpperCase().slice(0, 6),
        annualSpend: nonNegOrNull(d.annualSpend),
        annualFailureProb: nonNegOrNull(d.annualFailureProb, 100),
        mitigationCost: nonNegOrNull(d.mitigationCost),
        rawUpstreamIds: Array.isArray(d.upstreamIds) ? d.upstreamIds.map((u) => str(u).trim()).filter(Boolean) : [],
        upstreamIds: [],
        stewards,
        linkedGoalIds,
        linkedBudgetId: rawBudgetId && budgetIds.has(rawBudgetId) ? rawBudgetId : null,
        linkedNegotiationId: rawNegId && negotiationIds.has(rawNegId) ? rawNegId : null,
        linkedStakeholderId: rawStkId && stakeholderIds.has(rawStkId) ? rawStkId : null,
        linkedPortfolioId: rawPortId && portfolioIds.has(rawPortId) ? rawPortId : null,
        drills,
        history,
        autoPropagate: d.autoPropagate !== false,
        createdOn: dayOrFallback(d.createdOn, todayDay),
        reviewOn: dayOrFallback(d.reviewOn, null),
        retiredOn: status === 'retired' ? dayOrFallback(d.retiredOn, todayDay) : null,
        retiredReason: status === 'retired' ? str(d.retiredReason).slice(0, 400) : '',
        createdAt: isoOrNull(d.createdAt) || now,
        updatedAt: isoOrNull(d.updatedAt) || now,
      };
    })
    .filter(Boolean);

  if (droppedNonObjects) warnings.push(`Dependencies: dropped ${droppedNonObjects} invalid item(s)`);
  if (clearedDates) warnings.push(`Dependencies: repaired or cleared ${clearedDates} invalid calendar date(s)`);

  const deduped = uniqueIds(prelim, 'Dependencies', warnings);
  const validDepIds = new Set(deduped.map((d) => d.id));
  let prunedEdges = 0;
  for (const dep of deduped) {
    const seenUp = new Set();
    const cleanUp = [];
    for (const upId of dep.rawUpstreamIds) {
      if (upId === dep.id || !validDepIds.has(upId) || seenUp.has(upId)) {
        prunedEdges += 1;
        continue;
      }
      seenUp.add(upId);
      cleanUp.push(upId);
    }
    delete dep.rawUpstreamIds;
    dep.upstreamIds = cleanUp;
  }
  if (prunedEdges) warnings.push(`Dependencies: pruned ${prunedEdges} self-loop or missing upstream pointer(s)`);
  return deduped;
}

function entityIdSetsForLinks(state) {
  const idSets = {};
  for (const entityType of LINK_ENTITY_TYPES) {
    if (entityType === 'lesson') {
      idSets.lesson = new Set((state.retros || []).flatMap((retro) =>
        (Array.isArray(retro?.lessons) ? retro.lessons : []).map((lesson) => lesson?.id))
        .filter((id) => typeof id === 'string' && id));
      continue;
    }
    if (entityType === 'series') {
      idSets.series = new Set(EW_SERIES_BY_ID.keys());
      continue;
    }
    const collection = LINK_ENTITY_COLLECTIONS[entityType];
    const rows = collection && Array.isArray(state[collection]) ? state[collection] : [];
    idSets[entityType] = new Set(rows.map((row) => row?.id).filter((id) => typeof id === 'string' && id));
  }
  // ADR-0107: the enterprise root seat is a virtual node in the reporting
  // tree. Execution, Mission and Outcome rules legitimately write typed
  // `rolls-up-to` edges to it; treating it as a broken person pointer produced
  // repair warnings on every reload and blocked a second rehearsal.
  if (idSets.person) idSets.person.add(LEADER_ID);
  return idSets;
}


/**
 * Schema v32 — normalize Stakeholder Comms Outbox drafts.
 *
 * A draft must reference a case that still exists; an orphan is dropped with a
 * warning rather than re-parented. Status and purpose fall back to the safe
 * values (`draft`, `brief`) when unrecognised, so a hand-edited blob can never
 * present an unapproved message as sent. `sent` without a date keeps its status
 * but is flagged, because the send date is the evidence for the closure rule.
 */
export function normalizeCommsDrafts(raw, state, now, warnings) {
  const caseIds = new Set((state.cases || []).map((c) => c.id));
  const todayDay = now.slice(0, 10);
  const mapped = asArray({ commsDrafts: raw }, 'commsDrafts', warnings).map((d, i) => {
    if (!isPlainObject(d)) return null;
    const caseId = str(d.caseId).trim();
    if (!caseId || !caseIds.has(caseId)) {
      warnings.push('Comms drafts: dropped a draft whose operational case no longer exists');
      return null;
    }
    const body = str(d.body).slice(0, COMMS_MAX_BODY);
    if (!body.trim()) {
      warnings.push('Comms drafts: dropped a draft with no body text');
      return null;
    }
    const purpose = COMMS_PURPOSES.includes(d.purpose) ? d.purpose : 'brief';
    if (purpose !== d.purpose) warnings.push('Comms drafts: repaired an unrecognised purpose to a status brief');
    let status = COMMS_STATUSES.includes(d.status) ? d.status : 'draft';
    if (status !== d.status) warnings.push('Comms drafts: repaired an unrecognised status to awaiting approval');
    let sentOn = calendarDayOrNull(d.sentOn);
    if (status === 'sent' && !sentOn) {
      warnings.push('Comms drafts: a draft marked sent had no send date, so it was returned to awaiting approval');
      status = 'draft';
    }
    const createdOn = calendarDayOrNull(d.createdOn) || todayDay;
    const readinessNum = Number(d.readiness);
    return {
      id: str(d.id).trim() || `comms-${i + 1}`,
      caseId,
      stakeholderKey: str(d.stakeholderKey).trim() || `name:${str(d.stakeholderName).trim().toLowerCase()}`,
      stakeholderName: str(d.stakeholderName).trim().slice(0, 120) || 'Unnamed stakeholder',
      purpose,
      status,
      subject: str(d.subject).trim().slice(0, 160),
      body,
      missing: Array.isArray(d.missing)
        ? d.missing.map((x) => str(x).trim().slice(0, 80)).filter(Boolean).slice(0, 10)
        : [],
      readiness: Number.isFinite(readinessNum) ? Math.min(1, Math.max(0, readinessNum)) : 0,
      fingerprint: str(d.fingerprint),
      engineVersion: str(d.engineVersion).slice(0, 40),
      edited: d.edited === true,
      createdOn,
      createdAt: isoOrNull(d.createdAt) || now,
      approvedOn: calendarDayOrNull(d.approvedOn),
      approvedAcknowledgedGaps: Math.max(0, Math.round(Number(d.approvedAcknowledgedGaps) || 0)),
      sentOn,
      channel: str(d.channel).trim().slice(0, 80),
      supersedesId: str(d.supersedesId).trim() || null,
      supersededById: str(d.supersededById).trim() || null,
      supersededReason: str(d.supersededReason).trim().slice(0, 300),
      supersededOn: calendarDayOrNull(d.supersededOn),
      dismissedReason: str(d.dismissedReason).trim().slice(0, 400),
      updatedAt: isoOrNull(d.updatedAt) || now,
    };
  }).filter(Boolean);
  return uniqueIds(mapped, 'Comms drafts', warnings);
}

/**
 * Schema v30 — Coalition & Incentive War Room games. Normalization is strict:
 * a game needs a title and at least two named players (a voting game needs a
 * coalition to be meaningful). All foreign keys are validated against the
 * records already normalized above; dangling pointers are cleared with a
 * warning rather than crashing a later view. Payoffs/weights are coerced by the
 * pure engine helpers so a hand-edited blob cannot inject NaN or Infinity.
 */
function normalizePowerGames(raw, state, now, warnings) {
  const list = asArray({ powerGames: raw }, 'powerGames', warnings);
  const caseIds = new Set((state.cases || []).map((r) => r.id));
  const decisionIds = new Set((state.decisions || []).map((r) => r.id));
  const negotiationIds = new Set((state.negotiations || []).map((r) => r.id));
  const goalIds = new Set((state.goals || []).map((r) => r.id));
  const stakeholderIds = new Set((state.stakeholders || []).map((r) => r.id));
  const personIds = new Set((state.people || []).map((r) => r.id));
  const cleanIds = (arr, valid) => (Array.isArray(arr)
    ? [...new Set(arr.filter((x) => typeof x === 'string' && valid.has(x)))].slice(0, 20)
    : []);
  const mapped = list.map((g, i) => {
    if (!isPlainObject(g)) return null;
    const title = str(g.title).trim().slice(0, 180);
    if (!title) {
      warnings.push('Power games: dropped a game with no title');
      return null;
    }
    let players = normalizePlayers(g.players);
    if (players.length < POWER_MIN_PLAYERS) {
      warnings.push('Power games: dropped a game with fewer than two named players');
      return null;
    }
    const seen = new Set();
    players = players.map((pl, k) => {
      let pid = pl.id || `pl${k + 1}`;
      if (seen.has(pid)) pid = `pl${k + 1}-g${i}`;
      seen.add(pid);
      return {
        ...pl,
        id: pid,
        stakeholderId: stakeholderIds.has(pl.stakeholderId) ? pl.stakeholderId : null,
        personId: personIds.has(pl.personId) ? pl.personId : null,
      };
    });
    if (g.status !== undefined && !POWER_STATUSES.includes(g.status)) {
      warnings.push('Power games: repaired an unrecognised status to modeling');
    }
    if (g.stressRadius != null && !(typeof g.stressRadius === 'number' && Number.isFinite(g.stressRadius) && g.stressRadius >= 0 && g.stressRadius <= 100)) {
      warnings.push('Power games: invalid payoff uncertainty disabled; supply a valid 0–100 utility-unit bound');
    }
    const createdAt = isoOrNull(g.createdAt) || now;
    const counterpartyId = players.some((pl) => pl.id === g.counterpartyId) ? g.counterpartyId : players[0].id;
    const derived = isPlainObject(g.derived) ? {
      verdict: str(g.derived.verdict).slice(0, 40),
      verdictLabel: str(g.derived.verdictLabel).slice(0, 60),
      confidenceBand: ['low', 'medium', 'high'].includes(g.derived.confidenceBand) ? g.derived.confidenceBand : 'low',
      alignmentCost: finiteOrNull(g.derived.alignmentCost),
      robustness: finiteOrNull(g.derived.robustness),
      stressRadius: finiteOrNull(g.derived.stressRadius),
      stressNeedsReview: g.derived.stressNeedsReview === true,
      coalitionFeasible: g.derived.coalitionFeasible === true,
      targetIsNE: g.derived.targetIsNE === true,
      issues: Array.isArray(g.derived.issues) ? g.derived.issues.filter((x) => typeof x === 'string').slice(0, 20) : [],
      engineVersion: str(g.derived.engineVersion).slice(0, 40),
    } : null;
    return {
      id: str(g.id).trim() || `power-${i + 1}`,
      title,
      context: str(g.context).slice(0, 4000),
      status: POWER_STATUSES.includes(g.status) ? g.status : 'modeling',
      players,
      quotaPct: clampInt(g.quotaPct, 1, 100, POWER_DEFAULT_QUOTA_PCT),
      counterpartyId,
      strategies: {
        leader: [str(g.strategies?.leader?.[0]).slice(0, 60) || 'Strategy A', str(g.strategies?.leader?.[1]).slice(0, 60) || 'Strategy B'],
        rival: [str(g.strategies?.rival?.[0]).slice(0, 60) || 'Response A', str(g.strategies?.rival?.[1]).slice(0, 60) || 'Response B'],
      },
      stressRadius: typeof g.stressRadius === 'number' && Number.isFinite(g.stressRadius) && g.stressRadius >= 0 && g.stressRadius <= 100 ? g.stressRadius : null,
      cells: normalizeCells(g.cells),
      targetCell: POWER_CELLS.includes(g.targetCell) ? g.targetCell : '00',
      estimateConfidence: POWER_CONFIDENCE.includes(g.estimateConfidence) ? g.estimateConfidence : 'low',
      linkedStakeholderIds: cleanIds(g.linkedStakeholderIds, stakeholderIds),
      linkedCaseId: caseIds.has(g.linkedCaseId) ? g.linkedCaseId : null,
      linkedDecisionId: decisionIds.has(g.linkedDecisionId) ? g.linkedDecisionId : null,
      linkedNegotiationId: negotiationIds.has(g.linkedNegotiationId) ? g.linkedNegotiationId : null,
      linkedGoalIds: cleanIds(g.linkedGoalIds, goalIds),
      ownerId: personIds.has(g.ownerId) ? g.ownerId : null,
      realizedCell: POWER_CELLS.includes(g.realizedCell) ? g.realizedCell : null,
      settledOn: calendarDayOrNull(g.settledOn),
      notes: str(g.notes).slice(0, 2000),
      derived,
      history: Array.isArray(g.history)
        ? g.history.filter(isPlainObject).map((h) => ({ on: calendarDayOrNull(h.on), action: str(h.action).slice(0, 40), note: str(h.note).slice(0, 400) })).slice(-40)
        : [],
      autoPropagate: g.autoPropagate !== false,
      createdOn: calendarDayOrNull(g.createdOn) || createdAt.slice(0, 10) || null,
      createdAt,
      updatedAt: isoOrNull(g.updatedAt) || createdAt,
    };
  });
  return uniqueIds(mapped.filter(Boolean), 'Power games', warnings);
}

/**
 * Schema v45: normalize the leader-continuity drill ledger.
 *
 * A drill is the only place this app stores a *prediction* and a *human
 * observation* together. Both are normalised conservatively:
 *
 *  - the prediction keeps an opaque item key (`kind|sourceType|sourceId`) and a
 *    probability in [0, 1]. No title, note or person name is copied in;
 *  - observed stalls can only name keys that were actually predicted. An
 *    observed stall outside the frozen set is counted separately as
 *    `unexpectedStalls`, because silently adding it would change the
 *    denominator of the score after the fact;
 *  - a stored score is ignored. Every score in the product is re-derived from
 *    these two lists on load.
 */
function normalizeContinuityDrills(raw, now, warnings) {
  const list = asArray({ continuityDrills: raw }, 'continuityDrills', warnings);
  const out = [];
  const seenIds = new Set();
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const startOn = calendarDayOrNull(item.startOn);
    const endOn = calendarDayOrNull(item.endOn);
    if (!startOn || !endOn || endOn < startOn) {
      warnings.push('Leader continuity: dropped a drill with missing or inverted dates');
      continue;
    }
    const id = str(item.id).trim().slice(0, 80) || `lcd-${i}`;
    if (seenIds.has(id)) {
      warnings.push('Leader continuity: dropped a drill with a duplicate id');
      continue;
    }
    seenIds.add(id);
    const predictions = [];
    const keys = new Set();
    for (const row of Array.isArray(item.predictions) ? item.predictions : []) {
      if (!isPlainObject(row)) continue;
      const key = str(row.key).trim().slice(0, 120);
      const probability = Number(row.pStall);
      if (!key || !Number.isFinite(probability) || probability < 0 || probability > 1 || keys.has(key)) continue;
      keys.add(key);
      predictions.push({
        key,
        pStall: Math.round(probability * 10000) / 10000,
        dueOn: calendarDayOrNull(row.dueOn),
      });
      if (predictions.length >= 60) break;
    }
    const observedKeys = (Array.isArray(item.observedKeys) ? item.observedKeys : [])
      .filter((key) => typeof key === 'string' && keys.has(key))
      .slice(0, 60);
    const unexpectedKinds = (Array.isArray(item.unexpectedKinds) ? item.unexpectedKinds : [])
      .filter((kind) => typeof kind === 'string' && ['decides', 'reviews', 'unblocks', 'converses', 'engages', 'guards'].includes(kind))
      .slice(0, 6);
    const status = item.status === 'closed' ? 'closed' : 'open';
    if (status === 'closed' && !predictions.length) {
      warnings.push('Leader continuity: kept a closed drill with no frozen prediction; it is not scored');
    }
    out.push({
      id,
      startOn,
      endOn,
      status,
      horizonDays: clampInt(item.horizonDays, 1, 90, 14),
      note: str(item.note).trim().slice(0, 1000),
      predictions,
      observedKeys,
      unexpectedStalls: clampInt(item.unexpectedStalls, 0, 50, 0),
      unexpectedKinds,
      createdAt: isoOrNull(item.createdAt) || now,
      closedAt: status === 'closed' ? isoOrNull(item.closedAt) || now : null,
    });
  }
  return out;
}

function normalizeLinks(raw, state, todayDay, now, warnings) {
  const idSets = entityIdSetsForLinks(state);
  let droppedForbidden = 0;
  let droppedInvalid = 0;
  let retainedMissingMitigations = 0;
  const seenEdges = new Set();
  const valid = [];

  const list = asArray({ links: raw }, 'links', warnings);
  for (let i = 0; i < list.length; i += 1) {
    const l = list[i];
    if (!isPlainObject(l)) {
      droppedInvalid += 1;
      continue;
    }
    const sourceType = str(l.sourceType).trim();
    const targetType = str(l.targetType).trim();
    const sourceId = str(l.sourceId).trim();
    const targetId = str(l.targetId).trim();
    const relation = str(l.relation).trim();

    if (FORBIDDEN_LINK_TYPES.includes(sourceType) || FORBIDDEN_LINK_TYPES.includes(targetType)) {
      droppedForbidden += 1;
      continue;
    }
    if (
      !LINK_ENTITY_TYPES.includes(sourceType) ||
      !LINK_ENTITY_TYPES.includes(targetType) ||
      !LINK_RELATIONS.includes(relation) ||
      !sourceId ||
      !targetId ||
      (sourceType === targetType && sourceId === targetId)
    ) {
      droppedInvalid += 1;
      continue;
    }

    const sourceExists = idSets[sourceType]?.has(sourceId);
    const targetExists = idSets[targetType]?.has(targetId);
    // A missing mitigation must remain visible across reloads: dropping it
    // could falsely satisfy the all-mitigations-completed gate. Preserve only
    // well-formed edges with a surviving case and a missing delegation.
    const missingMitigation = relation === 'mitigates' && (
      (sourceType === 'case' && sourceExists && targetType === 'delegation' && !targetExists) ||
      (targetType === 'case' && targetExists && sourceType === 'delegation' && !sourceExists)
    );
    if ((!sourceExists || !targetExists) && !missingMitigation) { droppedInvalid += 1; continue; }
    const edgeKey = `${sourceType}:${sourceId}|${relation}|${targetType}:${targetId}`;
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);
    if (missingMitigation) retainedMissingMitigations += 1;

    const createdAt = isoOrNull(l.createdAt) || now;
    valid.push({
      id: str(l.id).trim() || `lnk-${i}`,
      sourceType,
      sourceId,
      targetType,
      targetId,
      relation,
      ruleId: str(l.ruleId).trim().slice(0, 40),
      summary: str(l.summary).trim().slice(0, 300),
      createdOn: calendarDayOrNull(l.createdOn) || createdAt.slice(0, 10) || todayDay,
      createdAt,
    });
  }

  if (retainedMissingMitigations) warnings.push(`Cross-module links: retained ${retainedMissingMitigations} missing mitigation link(s) for review`);
  if (droppedForbidden) {
    warnings.push(`Cross-module links: dropped ${droppedForbidden} forbidden confidential or anonymous link(s)`);
  }
  if (droppedInvalid) {
    warnings.push(`Cross-module links: cleared ${droppedInvalid} broken or unrecognised link(s)`);
  }
  return uniqueIds(valid, 'Cross-module links', warnings);
}

/* ------------------------------------------------------- Impact Ledger (v31) */

export const IMPACT_STATUSES = ['running', 'scored', 'abandoned'];
export const IMPACT_STATUS_LABELS = {
  running: 'Running',
  scored: 'Scored',
  abandoned: 'Abandoned',
};

/**
 * The intervention taxonomy lives in the schema, not in `domain/impact.js`,
 * because it is part of the stored data contract. `entityType` names an
 * existing LeadOS collection so RULE-IMP-01 can open a typed graph link
 * instead of inventing a parallel relationship vocabulary.
 */
export const IMPACT_INTERVENTION_TYPES = INTERVENTION_TYPES;
export const IMPACT_INTERVENTION_IDS = IMPACT_INTERVENTION_TYPES.map((t) => t.id);
export const IMPACT_ALPHAS = [0.05, 0.1, 0.2];

/**
 * Schema v35 — normalize the Assumption Ledger.
 *
 * A premise is an append-only governance record: observations and review
 * history are never rewritten from titles, and an unrecognised status is
 * recomputed from the dated evidence rather than trusted. Corrupt source
 * references are removed with a warning (never re-parented), so a hand-edited
 * blob cannot create a link to an imaginary record. Belief/status are derived
 * by the same pure engine the UI and the post-commit rule use.
 */
export function normalizePremises(raw, state, now, settings, warnings) {
  const todayDay = now.slice(0, 10);
  const decisionIds = new Set((state.decisions || []).map((d) => d.id));
  const peopleIds = new Set((state.people || []).map((p) => p.id));
  const sourceIds = {};
  for (const type of PREMISE_SOURCE_TYPES) {
    const collection = PREMISE_SOURCE_COLLECTIONS[type];
    sourceIds[type] = new Set((state[collection] || []).map((r) => r && r.id).filter(Boolean));
  }
  return asArray({ premises: raw }, 'premises', warnings).map((item, i) => {
    if (!isPlainObject(item)) return null;
    const createdAt = isoOrNull(item.createdAt) || now;
    const createdDay = createdAt.slice(0, 10);
    let decisionId = str(item.decisionId).trim() || null;
    if (decisionId && !decisionIds.has(decisionId)) {
      warnings.push(`Premises: premise ${str(item.id) || i} referenced a missing decision; the anchor was cleared.`);
      decisionId = null;
    }
    let ownerId = str(item.ownerId).trim() || null;
    if (ownerId && !peopleIds.has(ownerId)) {
      warnings.push(`Premises: premise ${str(item.id) || i} referenced a missing signpost owner; the owner was cleared.`);
      ownerId = null;
    }
    const refs = [];
    for (const ref of Array.isArray(item.sourceRefs) ? item.sourceRefs : []) {
      if (!isPlainObject(ref)) continue;
      const sourceType = str(ref.sourceType).trim();
      const sourceId = str(ref.sourceId).trim();
      if (!PREMISE_SOURCE_TYPES.includes(sourceType) || !sourceId) continue;
      if (!sourceIds[sourceType]?.has(sourceId)) {
        warnings.push(`Premises: dropped an evidence reference to a missing ${sourceType} record.`);
        continue;
      }
      const key = `${sourceType}:${sourceId}`;
      if (!refs.some((r) => `${r.sourceType}:${r.sourceId}` === key)) refs.push({ sourceType, sourceId });
      if (refs.length >= 12) break;
    }
    const observations = (Array.isArray(item.observations) ? item.observations : [])
      .filter(isPlainObject)
      .slice(-120)
      .map((o, j) => {
        const direction = PREMISE_DIRECTIONS.includes(o.direction) ? o.direction : null;
        const lr = Number(o.likelihoodRatio);
        const likelihoodRatio = Number.isFinite(lr) ? Math.min(20, Math.max(1.01, lr)) : null;
        let observedOn = calendarDayOrNull(o.observedOn);
        if (!observedOn) {
          observedOn = isoOrNull(o.createdAt)?.slice(0, 10) || createdDay;
          warnings.push(`Premises: observation ${j + 1} had no valid date; it was anchored to its creation date.`);
        }
        if (!direction || likelihoodRatio === null) return null;
        const key = str(o.key).trim() || `${str(o.sensorId) || 'sensor'}:${j + 1}`;
        return {
          id: str(o.id).trim() || key,
          key,
          sensorId: str(o.sensorId).slice(0, 60) || 'manual',
          sensorLabel: str(o.sensorLabel).slice(0, 120),
          sourceType: str(o.sourceType).slice(0, 40),
          sourceId: str(o.sourceId).slice(0, 120),
          sourceRoute: str(o.sourceRoute).slice(0, 240),
          title: str(o.title).trim().slice(0, 160),
          summary: str(o.summary).trim().slice(0, 300),
          direction,
          likelihoodRatio: Math.round(likelihoodRatio * 100) / 100,
          observedOn: observedOn > todayDay ? todayDay : observedOn,
          createdAt: isoOrNull(o.createdAt) || now,
        };
      }).filter(Boolean);
    const seen = new Set();
    const uniqueObservations = observations.filter((o) => {
      if (seen.has(o.key)) return false;
      seen.add(o.key);
      return true;
    });
    const watchPct = clampInt(item.watchPct, 10, 90, settings.premiseWatchPct ?? 55);
    const breachPct = clampInt(item.breachPct, 5, Math.min(85, watchPct - 5), settings.premiseBreachPct ?? 30);
    const candidate = {
      id: str(item.id).trim() || `premise-${i + 1}`,
      title: str(item.title).trim().slice(0, 160) || 'Untitled premise',
      statement: str(item.statement).trim().slice(0, 1200),
      signpost: str(item.signpost).trim().slice(0, 600),
      decisionId,
      ownerId,
      criticality: PREMISE_CRITICALITIES.includes(item.criticality) ? item.criticality : 'load-bearing',
      priorPct: clampInt(item.priorPct, 5, 95, 70),
      watchPct,
      breachPct,
      halfLifeDays: clampInt(item.halfLifeDays, 7, 365, settings.premiseHalfLifeDays ?? 90),
      reviewBy: calendarDayOrNull(item.reviewBy) || addDays(createdDay, settings.premiseReviewDays ?? 30),
      lastReviewedOn: calendarDayOrNull(item.lastReviewedOn),
      acknowledgedOn: calendarDayOrNull(item.acknowledgedOn),
      acknowledgedAt: isoOrNull(item.acknowledgedAt),
      humanDisposition: ['reaffirmed', 'retired'].includes(item.humanDisposition) ? item.humanDisposition : null,
      sourceRefs: refs,
      observations: uniqueObservations,
      history: (Array.isArray(item.history) ? item.history : [])
        .filter(isPlainObject)
        .slice(-60)
        .map((h) => ({
          at: isoOrNull(h.at) || createdAt,
          type: str(h.type).slice(0, 40),
          summary: str(h.summary).slice(0, 400),
        })),
      status: PREMISE_STATUSES.includes(item.status) ? item.status : 'unobserved',
      reviewCycle: clampInt(item.reviewCycle, 0, 9999, 0),
      posteriorPct: null,
      logBayesFactor: 0,
      autoPropagate: item.autoPropagate !== false,
      createdAt,
      updatedAt: isoOrNull(item.updatedAt) || createdAt,
    };
    const evaluation = evaluatePremiseCore(candidate, { now, settings });
    candidate.status = evaluation.status;
    candidate.posteriorPct = evaluation.posteriorPct;
    candidate.logBayesFactor = evaluation.logBayesFactor;
    return candidate;
  }).filter(Boolean);
}

/** Schema v36: append-only, explicitly human-assessed premise outcomes. */
export function normalizePremiseOutcomes(raw, state, now, warnings) {
  const premiseById = new Map((state.premises || []).map((premise) => [premise.id, premise]));
  const todayDay = now.slice(0, 10);
  const definitivePremises = new Set();
  const rows = asArray({ premiseOutcomes: raw }, 'premiseOutcomes', warnings).map((item, i) => {
    if (!isPlainObject(item)) return null;
    const premiseId = str(item.premiseId).trim();
    const premise = premiseById.get(premiseId);
    if (!premise) {
      warnings.push('Premise outcomes: dropped an outcome whose premise no longer exists.');
      return null;
    }
    const verdict = ['held', 'failed', 'inconclusive'].includes(item.verdict) ? item.verdict : null;
    if (!verdict) {
      warnings.push('Premise outcomes: dropped an outcome with an unrecognized verdict.');
      return null;
    }
    let settledOn = calendarDayOrNull(item.settledOn);
    if (!settledOn || settledOn < String(premise.createdAt || '').slice(0, 10)) {
      warnings.push('Premise outcomes: dropped an outcome with an invalid date or a date before its premise was registered.');
      return null;
    }
    if (settledOn > todayDay) {
      warnings.push('Premise outcomes: a future settlement date was capped to today.');
      settledOn = todayDay;
    }
    if (verdict !== 'inconclusive' && definitivePremises.has(premiseId)) {
      warnings.push('Premise outcomes: dropped a second conclusive outcome for the same premise.');
      return null;
    }
    if (verdict !== 'inconclusive') definitivePremises.add(premiseId);
    const createdAt = isoOrNull(item.createdAt) || now;
    return {
      id: str(item.id).trim() || `premise-outcome-${i + 1}`,
      premiseId,
      verdict,
      settledOn,
      note: str(item.note).trim().slice(0, 600),
      createdAt,
    };
  }).filter(Boolean);
  return uniqueIds(rows, 'Premise outcomes', warnings);
}

/**
 * A study record.
 *
 * `windowStart` is the day the intervention began and is the interruption date
 * for every estimator. It is deliberately *not* inferred from `createdAt`: a
 * study written today about an intervention that started three weeks ago must
 * say so, because that difference decides whether the result is confirmatory
 * or exploratory.
 */
export function normalizeImpactStudies(raw, state, now, warnings) {
  const todayDay = now.slice(0, 10);
  return asArray({ impactStudies: raw }, 'impactStudies', warnings).map((item, i) => {
    if (!isPlainObject(item)) return null;
    const createdAt = isoOrNull(item.createdAt) || now;
    let windowStart = calendarDayOrNull(item.windowStart);
    if (!windowStart) {
      windowStart = createdAt.slice(0, 10);
      warnings.push(`Impact studies: study ${str(item.id) || i} had no intervention date, so it was anchored to the day it was created.`);
    }
    if (windowStart > todayDay) {
      warnings.push(`Impact studies: study ${str(item.id) || i} was anchored to a future intervention date; the record was preserved but cannot be evaluated yet.`);
    }
    const declaredOn = calendarDayOrNull(item.declaredOn) || createdAt.slice(0, 10);
    const lockedOn = calendarDayOrNull(item.lockedOn);
    let status = IMPACT_STATUSES.includes(item.status) ? item.status : 'running';
    if (status === 'scored' && !lockedOn) {
      // A "scored" study with no lock has no frozen result; demote rather than
      // pretend the evaluation happened.
      status = 'running';
      warnings.push(`Impact studies: study ${str(item.id) || i} was marked scored without a lock date, so it was reopened.`);
    }
    if (status === 'abandoned') status = 'abandoned';
    const evaluation = status === 'scored' && lockedOn && isPlainObject(item.evaluation)
      ? item.evaluation
      : null;
    if (isPlainObject(item.evaluation) && !evaluation) {
      warnings.push(`Impact studies: study ${str(item.id) || i} carried an evaluation with no lock; the result was discarded because it was never committed to.`);
    }
    const interventionType = IMPACT_INTERVENTION_IDS.includes(item.interventionType) ? item.interventionType : 'other';
    const interventionId = str(item.interventionId).trim() || null;
    const interventionSpec = IMPACT_INTERVENTION_TYPES.find((type) => type.id === interventionType);
    const interventionCollection = interventionSpec?.entityType
      ? LINK_ENTITY_COLLECTIONS[interventionSpec.entityType]
      : null;
    if (interventionId && interventionCollection
      && !(state?.[interventionCollection] || []).some((record) => record?.id === interventionId)) {
      warnings.push(`Impact studies: study ${str(item.id) || i} points to a missing ${interventionSpec.entityType} record; the historical pointer was kept but cannot resolve.`);
    }
    if (interventionId && !interventionCollection) {
      warnings.push(`Impact studies: study ${str(item.id) || i} has an intervention ID for a type without an individual typed record; the label was kept.`);
    }
    const executionSnapshot = status === 'scored' && lockedOn
      ? normalizeImpactExecutionSnapshot(item.executionSnapshot, { interventionType })
      : null;
    // Schema v50: the implementation reading frozen by RULE-FID-05 at the same
    // moment the study was scored. Preserved as frozen counts/ratios; it is
    // never recomputed from today's records.
    const implementationSnapshot = status === 'scored' && lockedOn
      ? normalizeImplementationSnapshot(item.implementationSnapshot)
      : null;
    if (isPlainObject(item.implementationSnapshot) && !implementationSnapshot) {
      warnings.push(`Impact studies: study ${str(item.id) || i} carried an invalid implementation snapshot; it was discarded rather than reconstructed.`);
    }
    if (isPlainObject(item.executionSnapshot) && status === 'scored' && lockedOn && !executionSnapshot) {
      warnings.push(`Impact studies: study ${str(item.id) || i} had an invalid execution snapshot; it was discarded rather than reconstructed.`);
    }
    if (item.executionSnapshot && status !== 'scored') {
      warnings.push(`Impact studies: study ${str(item.id) || i} carried an execution snapshot before scoring; it was discarded.`);
    }
    const expectedEffectRaw = num(item.expectedEffect, NaN);
    const expectedConfidenceRaw = num(item.expectedConfidence, NaN);
    return {
      id: str(item.id) || `impact-${i}`,
      title: str(item.title).trim().slice(0, 160) || 'Untitled study',
      hypothesis: str(item.hypothesis).trim().slice(0, 2000),
      vitalId: str(item.vitalId).slice(0, 60),
      interventionType,
      interventionId,
      interventionLabel: str(item.interventionLabel).trim().slice(0, 160),
      executionSnapshot,
      implementationSnapshot,
      windowStart,
      baselineWeeks: clampInt(item.baselineWeeks, 4, 26, 8),
      windowWeeks: clampInt(item.windowWeeks, 2, 13, 4),
      alpha: IMPACT_ALPHAS.includes(Number(item.alpha)) ? Number(item.alpha) : 0.1,
      expectedEffect: Number.isFinite(expectedEffectRaw) && expectedEffectRaw >= 0 ? round4(expectedEffectRaw) : null,
      expectedConfidence: Number.isFinite(expectedConfidenceRaw) && expectedConfidenceRaw >= 50 && expectedConfidenceRaw <= 95
        ? Math.round(expectedConfidenceRaw)
        : null,
      declaredOn,
      status,
      lockedOn: status === 'scored' ? lockedOn : null,
      verdict: status === 'scored' && str(item.verdict) ? str(item.verdict).slice(0, 40) : null,
      evaluation,
      notes: str(item.notes).trim().slice(0, 4000),
      outcomeNotes: str(item.outcomeNotes).trim().slice(0, 4000),
      autoPropagate: item.autoPropagate !== false,
      // Set only by RULE-IMP-04. Never accepted from a form: a study cannot
      // declare itself a replication of a result that does not exist yet.
      replicationOfId: str(item.replicationOfId) || null,
      history: asArray({ history: item.history }, 'history', warnings)
        .filter(isPlainObject)
        .slice(-60)
        .map((h) => ({
          at: isoOrNull(h.at) || createdAt,
          type: str(h.type).slice(0, 40),
          summary: str(h.summary).slice(0, 400),
        })),
      createdAt,
      updatedAt: isoOrNull(item.updatedAt) || createdAt,
    };
  }).filter(Boolean);
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

/**
 * Coerce an arbitrary object into the current schema.
 * @returns {{ state: object, warnings: string[] }}
 */
/**
 * Schema v41 — the propagation receipt ledger.
 *
 * A receipt is written by the engine when a post-commit rule throws. It is
 * bookkeeping, not evidence: it records that a propagation was attempted and
 * lost, and it holds only the event that triggered it (type, entity, entityId)
 * and the rule's own error message. It never holds record content, so it cannot
 * become a second, unredacted copy of the workspace behind the export and
 * conflict-privacy boundaries.
 *
 * Everything is bounded: the ledger keeps the newest 50 receipts, each with at
 * most 20 retry attempts, because an unbounded failure log is its own outage.
 */
const PROPAGATION_RECEIPT_CAP = 50;
const PROPAGATION_ATTEMPT_CAP = 20;

function normalizePropagationReceipts(value, now, warnings) {
  const rows = asArray({ propagationReceipts: value }, 'propagationReceipts', warnings);
  const out = [];
  const seen = new Set();
  for (const item of rows) {
    if (!isPlainObject(item)) continue;
    const id = str(item.id).slice(0, 60);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const status = ['open', 'retried', 'resolved', 'dismissed'].includes(item.status) ? item.status : 'open';
    const attempts = [];
    for (const attempt of Array.isArray(item.attempts) ? item.attempts : []) {
      if (!isPlainObject(attempt)) continue;
      attempts.push({
        at: isoOrNull(attempt.at) || now,
        outcome: str(attempt.outcome).slice(0, 40) || 'unknown',
        detail: str(attempt.detail).slice(0, 300),
      });
      if (attempts.length >= PROPAGATION_ATTEMPT_CAP) break;
    }
    out.push({
      id,
      at: isoOrNull(item.at) || now,
      rule: str(item.rule).slice(0, 80) || 'anonymous',
      eventType: str(item.eventType).slice(0, 80),
      entity: str(item.entity).slice(0, 40),
      entityId: str(item.entityId).slice(0, 60),
      error: str(item.error).slice(0, 300),
      status,
      attempts,
      resolvedAt: isoOrNull(item.resolvedAt),
    });
    if (out.length >= PROPAGATION_RECEIPT_CAP) break;
  }
  return out;
}

/**
 * Schema v86: optional retention pay data. Every field is independently optional and a
 * partially-recorded band is preserved as recorded rather than completed from an
 * assumption. A currency is required for any figure to be usable, because a
 * number without a currency cannot enter a total.
 */
function normalizeCompensation(raw, warnings) {
  if (!isPlainObject(raw)) return null;
  const currency = str(raw.currency).trim().toUpperCase().slice(0, 4);
  const annualCost = nonNegativeOrNull(raw.annualCost);
  const bandMin = nonNegativeOrNull(raw.bandMin);
  const bandMax = nonNegativeOrNull(raw.bandMax);
  const effectiveOn = calendarDayOrNull(raw.effectiveOn);
  if (annualCost === null && bandMin === null && bandMax === null && !effectiveOn) return null;
  if (annualCost !== null && !currency) {
    warnings.push('People: a recorded annual cost without a currency was kept but cannot be priced into any total');
  }
  if (bandMin !== null && bandMax !== null && bandMin > bandMax) {
    warnings.push('People: a pay band was recorded with its minimum above its maximum; both figures were kept as recorded so the error stays visible');
  }
  return {
    currency: currency || null,
    annualCost,
    bandMin,
    bandMax,
    effectiveOn,
  };
}

/**
 * Schema v86: the departure ledger. A departure is a recorded fact with a last
 * day, an exit type and a reason class. Free-text exit notes are local-only and
 * deliberately excluded from every CSV scope.
 *
 * Records without a last day are dropped with a warning: an undated departure
 * cannot contribute exposure or event time, and inventing a date would corrupt
 * the survival estimates it feeds.
 */
function normalizeDepartures(raw, state, todayDay, now, warnings) {
  const personIds = new Set((state.people || []).map((p) => p.id));
  const list = asArray({ departures: raw }, 'departures', warnings).map((d, i) => {
    const personId = str(d.personId).trim();
    const lastDay = calendarDayOrNull(d.lastDay);
    if (!personId || !personIds.has(personId)) {
      warnings.push('Departures: a record pointing at a team member who no longer exists was dropped');
      return null;
    }
    if (!lastDay) {
      warnings.push('Departures: a record without a valid last day was dropped — an undated exit cannot contribute survival evidence');
      return null;
    }
    if (lastDay > todayDay) {
      warnings.push('Departures: a last day in the future was dropped');
      return null;
    }
    const type = DEPARTURE_TYPES.includes(d.type) ? d.type : 'unknown';
    if (d.type !== undefined && !DEPARTURE_TYPES.includes(d.type)) {
      warnings.push('Departures: an unrecognised exit type was recorded as unknown rather than guessed');
    }
    const reasonClass = DEPARTURE_REASON_CLASSES.includes(d.reasonClass) ? d.reasonClass : 'unknown';
    const person = (state.people || []).find((p) => p.id === personId);
    if (person?.startDate && lastDay < person.startDate) {
      warnings.push('Departures: a last day before the recorded start date was dropped');
      return null;
    }
    return {
      id: str(d.id) || `departure-${i}`,
      personId,
      lastDay,
      type,
      reasonClass,
      // Tri-state: true = recorded as regrettable, false = recorded as not,
      // null = nobody recorded it. The engine never infers this from a rating.
      regrettable: d.regrettable === true ? true : d.regrettable === false ? false : null,
      exitNote: str(d.exitNote).slice(0, 4000),
      replacementCostOverride: nonNegativeOrNull(d.replacementCostOverride),
      currency: str(d.currency).trim().toUpperCase().slice(0, 4) || null,
      knowledgeTransferOn: calendarDayOrNull(d.knowledgeTransferOn),
      continuityCaseId: str(d.continuityCaseId) || null,
      continuityHandled: d.continuityHandled === true,
      recordedAt: isoOrNull(d.recordedAt) || now,
    };
  }).filter(Boolean);
  const seen = new Set();
  const unique = [];
  for (const record of list) {
    // One departure per person: a person leaves once. A second record is not a
    // second exit, and keeping both would double-count event time.
    if (seen.has(record.personId)) {
      warnings.push('Departures: a second departure for the same person was dropped — one person leaves once');
      continue;
    }
    seen.add(record.personId);
    unique.push(record);
  }
  return uniqueIds(unique, 'Departures', warnings);
}

const RETENTION_PLAN_STATUS_SET = RETENTION_PLAN_STATUSES;

/**
 * Schema v86: retention plans. A `proposed` plan is the engine's suggestion and
 * carries no spend; a `committed` plan is the leader's decision and records the
 * cost that was actually committed. Committed cost is never recomputed from the
 * current estimate — a commitment is a fact about the past.
 */
function normalizeRetentionPlans(raw, state, todayDay, now, warnings) {
  const personIds = new Set((state.people || []).map((p) => p.id));
  const decisionIds = new Set((state.decisions || []).map((d) => d.id));
  const budgetIds = new Set((state.budgets || []).map((b) => b.id));
  const caseIds = new Set((state.cases || []).map((c) => c.id));
  const list = asArray({ retentionPlans: raw }, 'retentionPlans', warnings).map((p, i) => {
    const personId = str(p.personId).trim();
    if (!personId || !personIds.has(personId)) {
      warnings.push('Retention: a plan pointing at a team member who no longer exists was dropped');
      return null;
    }
    const status = RETENTION_PLAN_STATUS_SET.includes(p.status) ? p.status : 'proposed';
    if (p.status !== undefined && !RETENTION_PLAN_STATUS_SET.includes(p.status)) {
      warnings.push('Retention: an unrecognised plan status was treated as proposed');
    }
    const interventions = Array.isArray(p.interventions)
      ? p.interventions
          .filter(isPlainObject)
          .filter((item) => RETENTION_INTERVENTION_IDS.includes(item.id))
          .slice(0, 8)
          .map((item) => ({
            id: item.id,
            label: str(item.label).slice(0, 120),
            hours: nonNegativeOrNull(item.hours) ?? 0,
            moneyCost: nonNegativeOrNull(item.moneyCost) ?? 0,
            currency: str(item.currency).trim().toUpperCase().slice(0, 4) || null,
            hazardReduction: nonNegativeOrNull(item.hazardReduction),
            blockedReason: str(item.blockedReason).slice(0, 240),
            doneOn: calendarDayOrNull(item.doneOn),
          }))
      : [];
    const committedOn = status === 'committed' || status === 'completed' ? calendarDayOrNull(p.committedOn) : null;
    if (status === 'committed' && !committedOn) {
      warnings.push('Retention: a committed plan without a commitment date was returned to proposed — a commitment has a date');
    }
    const effectiveStatus = status === 'committed' && !committedOn ? 'proposed' : status;
    return {
      id: str(p.id) || `retention-${i}`,
      personId,
      status: effectiveStatus,
      source: str(p.source).slice(0, 40) || 'manual',
      proposedOn: calendarDayOrNull(p.proposedOn) || todayDay,
      committedOn,
      reviewOn: calendarDayOrNull(p.reviewOn),
      horizonDays: clampInt(p.horizonDays, 7, 730, 90),
      // The probability recorded at proposal time. Calibration scores this
      // number against what actually happened; it is never refreshed later.
      predictedRisk: nonNegativeOrNull(p.predictedRisk),
      predictedBand: str(p.predictedBand).slice(0, 20),
      mode: p.mode === 'pooled' ? 'pooled' : 'prior',
      rationale: str(p.rationale).slice(0, 2000),
      interventions,
      committedCost: nonNegativeOrNull(p.committedCost) ?? 0,
      currency: str(p.currency).trim().toUpperCase().slice(0, 4) || null,
      budgetId: budgetIds.has(str(p.budgetId)) ? str(p.budgetId) : null,
      decisionId: decisionIds.has(str(p.decisionId)) ? str(p.decisionId) : null,
      caseId: caseIds.has(str(p.caseId)) ? str(p.caseId) : null,
      closedOn: calendarDayOrNull(p.closedOn),
      closeReason: str(p.closeReason).slice(0, 500),
      createdAt: isoOrNull(p.createdAt) || now,
      updatedAt: isoOrNull(p.updatedAt) || now,
      history: Array.isArray(p.history)
        ? p.history.filter(isPlainObject).slice(-30).map((h) => ({
            on: calendarDayOrNull(h.on) || todayDay,
            action: str(h.action).slice(0, 40),
            note: str(h.note).slice(0, 500),
          }))
        : [],
    };
  }).filter(Boolean);
  return uniqueIds(list, 'Retention plans', warnings);
}


export function normalizeState(raw, { now: normalizationTime = new Date() } = {}) {
  const warnings = [];
  if (!isPlainObject(raw)) {
    return {
      state: createEmptyState(),
      warnings: ['The file did not contain a LeadOS data object; started from an empty workspace.'],
    };
  }

  const now = normalizationTime.toISOString();
  const state = createEmptyState(now);
  state.schemaVersion = SCHEMA_VERSION;
  state.settings = normalizeSettings(raw.settings);
  // ADR-0180: every stored settings key is carried, retired, or NAMED. A key
  // this version does not recognise used to vanish here without a word; the
  // leader now reads its name in the load banner.
  const settingsReceipt = settingsLoadReceipt(raw.settings, state.settings);
  if (settingsReceipt.warning) warnings.push(settingsReceipt.warning);
  if (raw.settings?.pulseMinResponses !== undefined && Number(raw.settings.pulseMinResponses) !== state.settings.pulseMinResponses) {
    warnings.push('Pulse privacy floor was repaired to the supported range of 3–25 responses; the default is 5.');
  }
  state.meta = {
    createdAt: isoOrNull(raw.meta?.createdAt) || now,
    updatedAt: isoOrNull(raw.meta?.updatedAt) || now,
    isDemo: raw.meta?.isDemo === true,
    revision: Math.max(0, Math.round(num(raw.meta?.revision, 0))),
  };

  const people = asArray(raw, 'people', warnings).map((p, i) => {
    // ADR-0134: a truncated waiting list is a failure the leader must see, not
    // a quiet repair. `applyTalkingPointPolicy` returns exactly what the cap
    // refused; a dropped line is counted and named by authorship so the reload
    // banner can say whether it was an engine prompt or the person's own words.
    const queue = applyTalkingPointPolicy(p.talkingPoints);
    if (queue.droppedN) {
      warnings.push(`1:1 waiting lists: ${queue.droppedN} line(s) on “${str(p.name).trim().slice(0, 60) || 'a person'}” did not fit the declared ${queue.cap}-prompt cap (${queue.droppedEngineN} engine prompt(s), ${queue.droppedPersonN} the person’s own). Capacity is declared, not accidental: the person’s own topics are kept first and engine prompts survive newest-first, and nothing was removed without this notice.`);
    }
    return {
    id: str(p.id) || `person-${i}`,
    name: str(p.name).trim().slice(0, 120),
    role: str(p.role).slice(0, 120),
    level: LEVELS.includes(p.level) ? p.level : 'ic',
    team: str(p.team).slice(0, 80),
    managerId: p.managerId ? str(p.managerId) : null,
    startDate: dayOrNull(p.startDate),
    lastPromotionOn: dayOrNull(p.lastPromotionOn),
    compensation: normalizeCompensation(p.compensation, warnings),
    focus: str(p.focus).slice(0, 300),
    talkingPoints: queue.kept,
    status: p.status === 'archived' ? 'archived' : 'active',
    createdAt: isoOrNull(p.createdAt) || now,
    archivedAt: isoOrNull(p.archivedAt),
    };
  });
  state.people = uniqueIds(people.filter((p) => p.name), 'People', warnings);

  const holderCounters = { cleared: 0 };
  const oneOnOnes = asArray(raw, 'oneOnOnes', warnings).map((m, i) => ({
    id: str(m.id) || `oo-${i}`,
    personId: str(m.personId),
    date: calendarDayOrNull(m.date) || now.slice(0, 10),
    // Legacy normalization requires a display date. Preserve the fact that it
    // was repaired so a line-coverage reading never treats that day as proof.
    dateUncertain: m.dateUncertain === true || !calendarDayOrNull(m.date),
    ...normalizeOneOnOneHolder(m, holderCounters),
    status: ['held', 'skipped', 'moved'].includes(m.status) ? m.status : 'held',
    mood: m.mood === null || m.mood === undefined ? null : clampInt(m.mood, 1, 5, 3),
    agenda: normalizeAgenda(m.agenda),
    // ADR-0106: exact prompts covered in a held 1:1. Historical meetings have
    // no such proof ([]), so a deleted talking point is never back-filled as coaching.
    resolvedTopics: normalizeTalkingPoints(m.resolvedTopics),
    notes: str(m.notes).slice(0, 20000),
    actions: normalizeActions(m.actions, { withOwner: true }),
    createdAt: isoOrNull(m.createdAt) || now,
  }));
  state.oneOnOnes = uniqueIds(oneOnOnes, '1:1s', warnings);
  if (holderCounters.cleared) warnings.push(`${holderCounters.cleared} 1:1 holder attribution(s) could not be validated and were cleared; no manager was inferred.`);
  const uncertainMeetingDates = state.oneOnOnes.filter((meeting) => meeting.dateUncertain).length;
  if (uncertainMeetingDates) warnings.push(`${uncertainMeetingDates} 1:1 date(s) were missing or invalid; their displayed fallback dates are not evidence of when a meeting was held.`);
  dedupeActionIds(state.oneOnOnes, warnings);
  repairCarryChains(state.oneOnOnes, warnings);
  auditActionOwners(state.oneOnOnes, warnings);

  const rawFeedback = asArray(raw, 'feedback', warnings);
  const feedback = rawFeedback.map((f, i) => ({
    id: str(f.id) || `fb-${i}`,
    personId: str(f.personId),
    direction: f.direction === 'received' ? 'received' : 'given',
    kind: f.kind === 'constructive' ? 'constructive' : 'praise',
    situation: str(f.situation).slice(0, 2000),
    behavior: str(f.behavior).slice(0, 2000),
    impact: str(f.impact).slice(0, 2000),
    tags: Array.isArray(f.tags) ? f.tags.filter((t) => typeof t === 'string').slice(0, 8) : [],
    date: calendarDayOrNull(f.date) || now.slice(0, 10),
    observedOn: calendarDayOrNull(f.observedOn),
    followUpOn: dayOrNull(f.followUpOn),
    followUpDone: f.followUpDone === true,
    followUpCompletedOn: f.followUpDone === true ? calendarDayOrNull(f.followUpCompletedOn) : null,
    createdAt: isoOrNull(f.createdAt) || now,
    authoredById: str(f.authoredById) || null,
    authoredByBasis: f.authoredByBasis === 'seat' ? 'seat' : null,
    authoredAt: isoOrNull(f.authoredAt),
  }));
  state.feedback = uniqueIds(feedback, 'Feedback', warnings);
  const invalidObservations = rawFeedback.filter((f) => f.observedOn && !calendarDayOrNull(f.observedOn)).length;
  if (invalidObservations) warnings.push(`Feedback: ${invalidObservations} invalid observation date(s) were left unmeasured`);
  const reversedObservations = state.feedback.filter((f) => f.observedOn && f.observedOn > f.date).length;
  if (reversedObservations) warnings.push(`Feedback: ${reversedObservations} observation date(s) are after the conversation and need correction`);

  const rawGoals = asArray(raw, 'goals', warnings);
  const invalidGoalAuthorship = rawGoals.filter((g) => g.coAuthored !== null && g.coAuthored !== undefined && typeof g.coAuthored !== 'boolean').length;
  if (invalidGoalAuthorship) warnings.push(`Goals: ${invalidGoalAuthorship} invalid authorship value(s) were left unknown`);
  const goals = rawGoals.map((g, i) => {
    const status = ['active', 'done', 'dropped'].includes(g.status) ? g.status : 'active';
    return {
      id: str(g.id) || `goal-${i}`,
      sourceReviewId: str(g.sourceReviewId) || null,
      title: str(g.title).slice(0, 200),
      description: str(g.description).slice(0, 4000),
      ownerId: g.ownerId ? str(g.ownerId) : null,
      scope: g.scope === 'team' ? 'team' : 'person',
      // Tri-state: true = co-authored, false = explicitly leader-set, null = unknown/N/A.
      coAuthored: g.ownerId ? (g.coAuthored === true ? true : g.coAuthored === false ? false : null) : null,
      dueDate: dayOrNull(g.dueDate),
      keyResults: normalizeKeyResults(g.keyResults),
      confidence: CONFIDENCE.includes(g.confidence) ? g.confidence : 'on-track',
      initialConfidence: CONFIDENCE.includes(g.initialConfidence) ? g.initialConfidence : null,
      status,
      completedOn: status === 'done' ? calendarDayOrNull(g.completedOn) : null,
      krUpdatedOn: calendarDayOrNull(g.krUpdatedOn),
      checkins: Array.isArray(g.checkins)
        ? g.checkins
            .filter(isPlainObject)
            .map((c, k) => ({
              id: str(c.id) || `chk-${k}`,
              date: dayOrNull(c.date) || now.slice(0, 10),
              note: str(c.note).slice(0, 2000),
              confidence: CONFIDENCE.includes(c.confidence) ? c.confidence : 'on-track',
              progressPct: typeof c.progressPct === 'number' && Number.isFinite(c.progressPct)
                ? Math.min(100, Math.max(0, Math.round(c.progressPct)))
                : null,
              keyResults: Array.isArray(c.keyResults)
                ? c.keyResults
                    .filter((kr) => isPlainObject(kr) && str(kr.id) && typeof kr.current === 'number' && Number.isFinite(kr.current))
                    .map((kr) => ({ id: str(kr.id), current: kr.current }))
                : null,
            }))
        : [],
      createdAt: isoOrNull(g.createdAt) || now,
    };
  });
  state.goals = uniqueIds(goals.filter((g) => g.title), 'Goals', warnings);

  let droppedDelegationCheckins = 0;
  const delegations = asArray(raw, 'delegations', warnings).map((d, i) => {
    const delegatedOn = calendarDayOrNull(d.delegatedOn);
    const status = ['active', 'done', 'returned'].includes(d.status) ? d.status : 'active';
    const completedOn = status === 'done' ? calendarDayOrNull(d.completedOn) : null;
    const returnedOn = status === 'returned' ? calendarDayOrNull(d.returnedOn) : null;
    const terminalOn = completedOn || returnedOn;
    const rawCheckins = Array.isArray(d.checkins) ? d.checkins.filter(isPlainObject) : [];
    const checkins = rawCheckins.map((c, k) => ({
      id: str(c.id) || `dchk-${k}`,
      date: calendarDayOrNull(c.date),
      progress: c.progress === 'blocked' ? 'blocked' : c.progress === 'on-track' ? 'on-track' : '',
      note: str(c.note).slice(0, 4000),
      createdAt: isoOrNull(c.createdAt),
    })).filter((c) => c.date && c.note && c.progress && (!delegatedOn || c.date >= delegatedOn) && (!terminalOn || c.date <= terminalOn));
    droppedDelegationCheckins += rawCheckins.length - checkins.length;
    return {
      id: str(d.id) || `delegation-${i}`,
      personId: str(d.personId),
      title: str(d.title).trim().slice(0, 200),
      expectedOutcome: str(d.expectedOutcome).slice(0, 4000),
      authority: ['recommend', 'agree', 'act-inform', 'own'].includes(d.authority) ? d.authority : '',
      support: str(d.support).slice(0, 4000),
      delegatedOn,
      dueOn: calendarDayOrNull(d.dueOn),
      status,
      checkins,
      completedOn,
      completionNote: status === 'done' ? str(d.completionNote).slice(0, 4000) : '',
      sourceNegotiationId: str(d.sourceNegotiationId) || null,
      sourceTermId: str(d.sourceTermId) || null,
      priorDelegationId: str(d.priorDelegationId) || null,
      supersededByDelegationId: status === 'returned' ? str(d.supersededByDelegationId) || null : null,
      recoveredOn: status === 'returned' ? calendarDayOrNull(d.recoveredOn) : null,
      recoveryNote: str(d.recoveryNote).slice(0, 4000),
      returnedOn,
      returnReason: status === 'returned' ? str(d.returnReason).slice(0, 4000) : '',
      createdAt: isoOrNull(d.createdAt) || now,
      updatedAt: isoOrNull(d.updatedAt) || isoOrNull(d.createdAt) || now,
    };
  });
  const validDelegations = delegations.filter((d) =>
    d.title && d.personId && d.delegatedOn
    && (!d.dueOn || d.dueOn >= d.delegatedOn)
    && (d.status !== 'done' || d.completedOn)
    && (d.status !== 'returned' || d.returnedOn)
    && (!d.completedOn || d.completedOn >= d.delegatedOn)
    && (!d.returnedOn || d.returnedOn >= d.delegatedOn),
  );
  if (validDelegations.length !== delegations.length) {
    warnings.push(`Delegations: dropped ${delegations.length - validDelegations.length} record(s) with a missing title, owner, terminal date or inconsistent dates`);
  }
  if (droppedDelegationCheckins) warnings.push(`Delegations: dropped ${droppedDelegationCheckins} incomplete, invalid or post-terminal check-in(s)`);
  state.delegations = uniqueIds(validDelegations, 'Delegations', warnings);
  repairDelegationRecoveryChains(state.delegations, warnings);

  state.conflicts = normalizeConflicts(raw.conflicts, warnings, now);

  const growthPlans = asArray(raw, 'growthPlans', warnings).map((p, i) => {
    const status = p.status === 'done' ? 'done' : 'active';
    return {
      id: str(p.id) || `gp-${i}`,
      sourceReviewId: str(p.sourceReviewId) || null,
      personId: str(p.personId),
      goal: str(p.goal).slice(0, 2000),
      reality: str(p.reality).slice(0, 2000),
      options: Array.isArray(p.options)
        ? p.options.filter(isPlainObject).map((o, k) => ({ id: str(o.id) || `opt-${k}`, text: str(o.text).slice(0, 400) })).filter((o) => o.text)
        : [],
      will: normalizeWillActions(p.will),
      competencies: Array.isArray(p.competencies)
        ? p.competencies.filter((c) => typeof c === 'string').slice(0, 12)
        : [],
      reviewOn: dayOrNull(p.reviewOn),
      reviews: normalizeGrowthReviews(p.reviews),
      // Deferrals count pushes of the review date since the last held review.
      // A hand-edited negative or absurd value is clamped, not trusted.
      reviewDeferrals: clampInt(p.reviewDeferrals, 0, 99, 0),
      reviewMovedOn: calendarDayOrNull(p.reviewMovedOn),
      status,
      closedOn: status === 'done' ? calendarDayOrNull(p.closedOn) : null,
      stagesUpdatedOn: calendarDayOrNull(p.stagesUpdatedOn),
      createdAt: isoOrNull(p.createdAt) || now,
    };
  });
  repairWillChains(growthPlans, warnings);
  state.growthPlans = uniqueIds(growthPlans.filter((p) => p.goal), 'Growth plans', warnings);
  auditWillDelegationLinks(state.growthPlans, state.delegations, warnings);

  const pulses = asArray(raw, 'pulses', warnings).map((p, i) => ({
    id: str(p.id) || `pulse-${i}`,
    date: dayOrNull(p.date) || now.slice(0, 10),
    // Anonymous responses never store a personId — enforced here, not in the UI.
    personId: p.anonymity === 'anonymous' ? null : p.personId ? str(p.personId) : null,
    anonymity: p.anonymity === 'named' && p.personId ? 'named' : 'anonymous',
    scores: normalizeScores(p.scores),
    comment: str(p.comment).slice(0, 2000),
    createdAt: isoOrNull(p.createdAt) || now,
  }));
  state.pulses = uniqueIds(pulses, 'Pulse responses', warnings);

  let clearedUndecidedReviews = 0;
  const decisions = asArray(raw, 'decisions', warnings).map((d, i) => {
    const chosen = str(d.chosen).trim().slice(0, 300);
    const rawReviewedOn = dayOrNull(d.reviewedOn);
    const rawOutcome = DECISION_OUTCOMES.includes(d.outcome) ? d.outcome : 'pending';
    const rawOutcomeNotes = str(d.outcomeNotes).slice(0, 4000);
    const invalidUndecidedReview = !chosen && Boolean(rawReviewedOn || rawOutcome !== 'pending' || rawOutcomeNotes.trim());
    if (invalidUndecidedReview) clearedUndecidedReviews += 1;
    return {
      id: str(d.id) || `dec-${i}`,
      title: str(d.title).trim().slice(0, 200),
      question: str(d.question).slice(0, 2000),
      date: dayOrNull(d.date) || now.slice(0, 10),
      reversibility: d.reversibility === 'irreversible' ? 'irreversible' : 'reversible',
      driver: str(d.driver).slice(0, 120),
      approver: str(d.approver).slice(0, 120),
      contributors: str(d.contributors).slice(0, 300),
      informed: str(d.informed).slice(0, 300),
      options: Array.isArray(d.options)
        ? d.options
            .filter(isPlainObject)
            .map((o, k) => ({
              id: str(o.id) || `dopt-${k}`,
              label: str(o.label).slice(0, 300),
              pros: str(o.pros).slice(0, 1000),
              cons: str(o.cons).slice(0, 1000),
            }))
            .filter((o) => o.label)
        : [],
      chosen,
      rationale: str(d.rationale).slice(0, 4000),
      reviewOn: dayOrNull(d.reviewOn),
      reviewedOn: chosen ? rawReviewedOn : null,
      outcome: chosen ? rawOutcome : 'pending',
      outcomeNotes: chosen ? rawOutcomeNotes : '',
      // Schema v21: the probability recorded when the call was made ("P(this
      // works out well)"), clamped to 5–95 per Cromwell's rule. A forecast on
      // an undecided record is meaningless and is dropped, mirroring the
      // outcome-review clearing above. Unknown stays null — never 50%.
      forecastProbability: chosen ? normalizeForecastProbability(d.forecastProbability) : null,
      // Schema v28: the day the call was actually made. Stamped once by the app
      // and never rewritten; an undecided record cannot have one, a legacy
      // decided record keeps null (counted as unmeasured, never inferred).
      decidedOn: chosen ? normalizeDecidedOn(d.decidedOn, dayOrNull(d.date), now) : null,
      createdAt: isoOrNull(d.createdAt) || now,
      // Schema v55: Decision Portfolio Engine. Append-only notes from
      // RULE-DPF-02 (resolution cascade) and RULE-DPF-03 (premise scan).
      // Each entry is a dated flag, not a status change. Capped at 20 per
      // decision to prevent unbounded growth.
      portfolioNotes: Array.isArray(d.portfolioNotes)
        ? d.portfolioNotes
            .filter((n) => isPlainObject(n) && typeof n.note === 'string')
            .slice(-20)
            .map((n) => ({
              at: isoOrNull(n.at) || now,
              note: str(n.note).slice(0, 500),
              sourceDecisionId: typeof n.sourceDecisionId === 'string' ? n.sourceDecisionId : null,
              sourcePremiseId: typeof n.sourcePremiseId === 'string' ? n.sourcePremiseId : null,
            }))
        : [],
    };
  });
  if (clearedUndecidedReviews) {
    warnings.push(`Decisions: cleared ${clearedUndecidedReviews} outcome review(s) on undecided decision(s)`);
  }
  state.decisions = uniqueIds(decisions.filter((d) => d.title), 'Decisions', warnings);

  const recognition = asArray(raw, 'recognition', warnings).map((r, i) => ({
    id: str(r.id) || `rec-${i}`,
    personId: str(r.personId),
    what: str(r.what).slice(0, 2000),
    values: Array.isArray(r.values) ? r.values.filter((v) => typeof v === 'string').slice(0, 8) : [],
    visibility: r.visibility === 'private' ? 'private' : 'public',
    date: dayOrNull(r.date) || now.slice(0, 10),
    createdAt: isoOrNull(r.createdAt) || now,
  }));
  state.recognition = uniqueIds(recognition.filter((r) => r.what), 'Recognition', warnings);

  const readiness = asArray(raw, 'readiness', warnings).map((r, i) => ({
    id: str(r.id) || `rd-${i}`,
    personId: str(r.personId),
    seat: str(r.seat).slice(0, 160),
    rating: READINESS.includes(r.rating) ? r.rating : 'not-ready',
    notes: str(r.notes).slice(0, 1200),
    updatedAt: isoOrNull(r.updatedAt) || now,
  }));
  state.readiness = uniqueIds(readiness.filter((r) => r.personId && r.seat), 'Readiness', warnings);

  const reviews = asArray(raw, 'reviews', warnings).map((review, i) => {
    const status = review.status === 'complete' ? 'complete' : 'draft';
    const updatedAt = isoOrNull(review.updatedAt) || isoOrNull(review.createdAt) || now;
    return {
      id: str(review.id) || `review-${i}`,
      personId: str(review.personId),
      periodStart: calendarDayOrNull(review.periodStart),
      periodEnd: calendarDayOrNull(review.periodEnd),
      status,
      selfReflection: normalizeReflection(review.selfReflection, ['achievements', 'challenges', 'growth', 'support']),
      selfReflectionRecordedAt: isoOrNull(review.selfReflectionRecordedAt),
      manager: {
        ...normalizeReflection(review.manager, ['achievements', 'development', 'nextSteps']),
        rating: REVIEW_RATINGS.includes(review.manager?.rating) ? review.manager.rating : '',
      },
      evidence: normalizeReviewEvidence(review.evidence),
      // ADR-0147 (Schema v122): the matrix's asks and answers about THIS review.
      // Stored on the review so they freeze with it at completion. A malformed
      // ask or answer is dropped with a printed warning, never repaired: an
      // answer invented at load time would be words nobody said.
      stewardship: normalizeReviewStewardship(review.stewardship, warnings),
      // Schema v77: append-only instrument notes (RULE-REL-03). A note about the
      // rating, never a change to it — the rating itself is untouched above.
      instrumentNotes: Array.isArray(review.instrumentNotes)
        ? review.instrumentNotes
            .filter((n) => isPlainObject(n) && typeof n.text === 'string')
            .slice(-6)
            .map((n) => ({
              at: isoOrNull(n.at) || updatedAt,
              source: str(n.source).slice(0, 40),
              text: str(n.text).slice(0, 600),
            }))
        : [],
      evidenceCapturedAt: isoOrNull(review.evidenceCapturedAt) || updatedAt,
      createdAt: isoOrNull(review.createdAt) || now,
      updatedAt,
      completedAt: status === 'complete' ? isoOrNull(review.completedAt) || updatedAt : null,
    };
  });
  const validReviews = reviews.filter((r) => r.personId && r.periodStart && r.periodEnd && r.periodStart <= r.periodEnd);
  if (validReviews.length !== reviews.length) warnings.push(`Reviews: dropped ${reviews.length - validReviews.length} record(s) with a missing person or invalid period`);
  state.reviews = uniqueIds(validReviews, 'Reviews', warnings);

  // Review-origin links are created only by an explicit completed-review
  // handoff. Keep valid links even if that review is later reopened for a
  // correction; clear only missing or cross-person references.
  const reviewById = new Map(state.reviews.map((review) => [review.id, review]));
  let repairedReviewLinks = 0;
  for (const record of [...state.goals, ...state.growthPlans]) {
    if (!record.sourceReviewId) continue;
    const source = reviewById.get(record.sourceReviewId);
    if (!source || source.personId !== (record.ownerId || record.personId)) {
      record.sourceReviewId = null;
      repairedReviewLinks += 1;
    }
  }
  if (repairedReviewLinks) warnings.push(`Review follow-through: cleared ${repairedReviewLinks} missing or cross-person source link(s)`);

  const todayDay = now.slice(0, 10);
  const onboarding = asArray(raw, 'onboarding', warnings).map((plan, i) => {
    const personId = str(plan.personId);
    const startDate = calendarDayOrNull(plan.startDate);
    let status = ONBOARDING_STATUSES.includes(plan.status) ? plan.status : 'active';
    // Pre-v10 plans could only be new-joiner onboarding. An unrecognised kind
    // therefore falls back to 'new-hire' with a warning rather than being
    // guessed into a role transition the file never claimed.
    const kind = ONBOARDING_KINDS.includes(plan.kind) ? plan.kind : 'new-hire';
    if (plan.kind !== undefined && !ONBOARDING_KINDS.includes(plan.kind)) {
      warnings.push('Onboarding: an unrecognised plan type was treated as new-joiner onboarding');
    }
    const label = str(plan.label).trim().slice(0, 160);
    if (kind === 'role-transition' && !label) {
      warnings.push('Onboarding: a role-transition plan does not name the new role or scope yet');
    }
    const createdAt = isoOrNull(plan.createdAt) || now;
    const updatedAt = isoOrNull(plan.updatedAt) || createdAt;
    const planId = str(plan.id) || `onb-${i}`;
    const reviewsObj = normalizeOnboardingReviews(plan.reviews, startDate, todayDay, warnings, planId);
    if (status === 'completed' && !reviewsObj[90]?.heldOn) {
      status = 'active';
      warnings.push('Onboarding: reopened a completed plan whose Day 90 check-in was missing or invalid');
    }
    let buddyId = str(plan.buddyId) || null;
    if (buddyId && buddyId === personId) {
      buddyId = null;
      warnings.push('Onboarding: cleared a self-assigned buddy reference');
    }
    return {
      id: planId,
      personId,
      kind,
      label,
      startDate,
      buddyId,
      buddyName: str(plan.buddyName).trim().slice(0, 120),
      roleClarity: str(plan.roleClarity).trim().slice(0, 2000),
      earlyWin: str(plan.earlyWin).trim().slice(0, 2000),
      stakeholders: normalizeOnboardingStakeholders(plan.stakeholders, warnings),
      checkpoints: normalizeOnboardingCheckpoints(plan.checkpoints, warnings),
      reviews: reviewsObj,
      status,
      completedOn: status === 'completed' ? calendarDayOrNull(plan.completedOn) : null,
      createdAt,
      updatedAt,
    };
  });
  const validOnboarding = onboarding.filter((p) => p.personId && p.startDate);
  if (validOnboarding.length !== onboarding.length) {
    warnings.push(`Onboarding: dropped ${onboarding.length - validOnboarding.length} record(s) with a missing person or invalid start date`);
  }
  state.onboarding = uniqueIds(validOnboarding, 'Onboarding', warnings);
  state.managerSupport = normalizeManagerSupport(raw.managerSupport, state.onboarding, state.people, now, warnings);
  state.cases = normalizeCases(raw.cases, state, todayDay, now, warnings);
  state.requisitions = normalizeRequisitions(raw.requisitions, state, todayDay, now, warnings);
  state.candidates = normalizeCandidates(raw.candidates, state, todayDay, now, warnings);
  state.changes = normalizeChanges(raw.changes, state, todayDay, now, warnings);
  // ADR-0185: requests resolve before responses. The snapshot is retained even
  // after the live impact or reporting line changes; changeImpact.js derives it
  // stale and stops counting its response as current without deleting history.
  // ADR-0188 (Schema v149): requests freeze their snapshot first, so an answer
  // that points at a request the loader refused is dropped rather than orphaned.
  state.aarCorroborationRequests = normalizeAarCorroborationRequests(
    raw.aarCorroborationRequests, warnings, todayDay,
  );
  state.aarCorroborationResponses = normalizeAarCorroborationResponses(
    raw.aarCorroborationResponses, state.aarCorroborationRequests, warnings, todayDay,
  );
  state.aarAdoptions = normalizeAarAdoptions(raw.aarAdoptions, warnings, todayDay);
  state.standardWorkRoutines = normalizeStandardWorkRoutines(raw.standardWorkRoutines, warnings);
  state.standardWorkChecks = normalizeStandardWorkChecks(raw.standardWorkChecks, state.standardWorkRoutines, warnings);
  state.standardWorkTierActs = normalizeStandardWorkTierActs(raw.standardWorkTierActs, state.standardWorkChecks, warnings);
  state.changeImpactRequests = normalizeChangeImpactRequests(raw.changeImpactRequests, warnings, todayDay);
  state.changeImpactResponses = normalizeChangeImpactResponses(
    raw.changeImpactResponses,
    state.changeImpactRequests,
    warnings,
    todayDay,
  );
  state.negotiations = normalizeNegotiations(raw.negotiations, state, todayDay, now, warnings);
  // Portfolio must run AFTER cases, requisitions, and changes so sourceType
  // provenance (`case`, `requisition`, `change`) resolves against populated
  // collections rather than degrading valid reserves to `manual` on reload.
  state.portfolio = normalizePortfolio(raw.portfolio, state, todayDay, now, warnings);
  // Budgets run after every fundable collection so line source pointers
  // resolve against populated records instead of being cleared on reload.
  state.budgets = normalizeBudgets(raw.budgets, state, todayDay, now, warnings);
  // Register runs after people (person links) and before links (involves
  // edges resolve against it).
  state.stakeholders = normalizeStakeholders(raw.stakeholders, state, todayDay, now, warnings);
  // Challenges resolve against every source collection above, then links
  // resolve against both source records and the challenge ids.
  state.forecastChallenges = normalizeForecastChallenges(raw.forecastChallenges, state, todayDay, now, warnings);
  // Schema v27: intake drafts are an append-only triage ledger. They normalize
  // after people/goals/cases so confirmed-case pointers can be verified.
  state.intakeDrafts = normalizeIntakeDrafts(raw.intakeDrafts, state, now, warnings);
  // Schema v28: decision timeboxes resolve against the decision ledger above,
  // then links resolve against both decisions and timeboxes.
  state.tempoSchedules = normalizeTempoSchedules(raw.tempoSchedules, state, todayDay, now, warnings);
  state.departures = normalizeDepartures(raw.departures, state, todayDay, now, warnings);
  state.retentionPlans = normalizeRetentionPlans(raw.retentionPlans, state, todayDay, now, warnings);
  // Schema v29: operational dependencies resolve against people, goals,
  // budgets, negotiations, stakeholders, portfolio and cases before links.
  state.dependencies = normalizeDependencies(raw.dependencies, state, todayDay, now, warnings);
  // Schema v30: war-room games resolve against people, cases, decisions,
  // negotiations, goals and stakeholders above, then links resolve against
  // both the games and their source records.
  state.powerGames = normalizePowerGames(raw.powerGames, state, now, warnings);
  state.impactStudies = normalizeImpactStudies(raw.impactStudies, state, now, warnings);
  // Schema v50: a fidelity plan resolves its owner against the roster, its
  // source against the same typed registry the Impact ledger uses, and its
  // optional study pointer against the studies normalized on the line above.
  state.fidelityPlans = normalizeFidelityPlans(raw.fidelityPlans, state, now, warnings);
  // Schema v51: bands normalize before cycles so a cycle's band positioning can
  // be re-derived on load; a frozen audit is validated for range and preserved
  // exactly, never recomputed from today's records.
  state.compBands = normalizeCompBands(raw.compBands, now, warnings);
  state.meritCycles = normalizeMeritCycles(raw.meritCycles, state, now, warnings);
  state.transitionPrograms = normalizeTransitionPrograms(raw.transitionPrograms, state, now, warnings);
  // Schema v53: a structural design resolves its moves against the normalized
  // roster above. Dangling references are kept as history and flagged, never
  // repaired; a frozen snapshot is validated and preserved exactly.
  state.orgDesigns = normalizeOrgDesigns(raw.orgDesigns, state, now, warnings);
  // Schema v32: outbox drafts resolve against cases above; links resolve last.
  state.commsDrafts = normalizeCommsDrafts(raw.commsDrafts, state, now, warnings);
  // Schema v35: assumptions normalize after every evidence-source collection
  // and before links, so the typed premise graph resolves on the same load.
  state.premises = normalizePremises(raw.premises, state, now, state.settings, warnings);
  state.premiseOutcomes = normalizePremiseOutcomes(raw.premiseOutcomes, state, now, warnings);
  // Schema v54: decision frames normalize AFTER the premise ledger, because a
  // frame's states resolve their premise pointers against it — normalizing them
  // earlier would clear every pointer on the grounds that premises did not exist
  // yet. Investigations follow their frames for the same reason. A frozen
  // snapshot is validated for range and preserved exactly, never recomputed.
  state.voiDecisions = normalizeVoiDecisions(raw.voiDecisions, state, now, warnings);
  state.voiStudies = normalizeVoiStudies(raw.voiStudies, state, now, warnings);
  // Schema v57: a committed attention plan is a prediction held to its own
  // numbers. The frozen result is preserved exactly; only its types and its
  // dead pointers are repaired.
  state.attentionPlans = normalizeAttentionPlans(raw.attentionPlans, state, now, warnings);
  // Schema v37: structural experiments resolve their owner against the active
  // roster above, then links resolve against both experiments and records.
  state.dynamicsExperiments = normalizeDynamicsExperiments(raw.dynamicsExperiments, state, now, warnings);
  // Schema v38: portfolios resolve their owner against the active roster and
  // their levers against the same bounds the dynamics lab uses; checkpoints
  // resolve their subject against the portfolios and experiments above, and
  // their stored score is re-derived from the recorded observation on every
  // load rather than trusted from disk.
  state.capitalPolicies = normalizeCapitalPolicies(raw.capitalPolicies, state, now, warnings);
  state.dynamicsCheckpoints = normalizeDynamicsCheckpoints(raw.dynamicsCheckpoints, state, now, warnings);
  // Schema v39: the watch ledger resolves against nothing but itself and the
  // series registry, so it can run after every collection it cites.
  state.watchAlerts = normalizeWatchAlerts(raw.watchAlerts, state, todayDay, now, warnings);
  state.watchForecasts = normalizeWatchForecasts(raw.watchForecasts, state, todayDay, now, warnings);
  // Schema v41: receipts cite an event and a rule name only; they hold no
  // record content, so they resolve against nothing else in the workspace.
  state.propagationReceipts = normalizePropagationReceipts(raw.propagationReceipts, now, warnings);
  // Schema v42: bets resolve their owner against the active roster, and tags
  // resolve against both the bets above and the open records they cite. Both
  // run before links so the typed strategy graph resolves on the same load.
  state.strategyBets = normalizeStrategyBets(raw.strategyBets, state, now, warnings);
  state.strategyTags = normalizeStrategyTags(raw.strategyTags, state, now, warnings);
  // Schema v43: a review resolves against the closed record it cites (and the
  // roster for its lesson owners), so it runs after every subject collection and
  // before links. A review whose subject has vanished keeps its own text and
  // becomes detached rather than pointing at nothing.
  state.retros = normalizeRetros(raw.retros, state, now, warnings);
  // Schema v45: drills cite opaque item keys only, so they resolve against no
  // other collection. A prediction whose source record has since vanished keeps
  // its frozen number and is labelled unresolved by the report rather than
  // dropped, because dropping it would remove evidence from the score.
  state.continuityDrills = normalizeContinuityDrills(raw.continuityDrills, now, warnings);
  // Schema v47: a scorecard cites its owner against the roster and holds no
  // other reference, so it normalizes after the roster and before links. A
  // frozen prediction and a recorded observation are kept exactly as written;
  // every derived figure is recomputed from them at read time.
  state.scorecards = normalizeScorecards(raw.scorecards, state, now, warnings);
  state.propagationLineage = normalizePropagationLineage(raw.propagationLineage, now, warnings);
  // Schema v55: portfolio markers are string keys for RULE-DPF idempotency.
  // Each marker is at most 200 chars; the array is capped at 2000 to prevent
  // unbounded growth on long-lived workspaces.
  state.portfolioMarkers = Array.isArray(raw.portfolioMarkers)
    ? raw.portfolioMarkers
        .filter((m) => typeof m === 'string' && m.length > 0)
        .map((m) => m.slice(0, 200))
        .slice(0, 2000)
    : [];
  // Schema v56: calibration markers are string keys for RULE-LCAL idempotency
  // with the same 200-char / 2000-entry cap as portfolio markers.
  state.calibrationMarkers = Array.isArray(raw.calibrationMarkers)
    ? raw.calibrationMarkers
        .filter((m) => typeof m === 'string' && m.length > 0)
        .map((m) => m.slice(0, 200))
        .slice(0, 2000)
    : [];
  state.autopilotPolicies = normalizeAutopilotPolicies(raw.autopilotPolicies, state, now, warnings);
  state.autopilotRuns = normalizeAutopilotRuns(raw.autopilotRuns, state, now, warnings);
  // Schema v59: classes first — probes and levers reference a class id, so a
  // class dropped as unreadable must take its orphans with it in the same pass.
  state.signalClasses = normalizeSignalClasses(raw.signalClasses, state, now, warnings);
  state.signalProbes = normalizeSignalProbes(raw.signalProbes, state, now, warnings);
  state.signalLevers = normalizeSignalLevers(raw.signalLevers, state, now, warnings);
  // Schema v60: war games. Each is a declared strategic exercise with scenarios.
  state.warGames = Array.isArray(raw.warGames)
    ? raw.warGames.map((wg) => normalizeWarGame(wg, state, now, warnings)).slice(0, 50)
    : [];
  state.warGameMarkers = Array.isArray(raw.warGameMarkers)
    ? raw.warGameMarkers.filter((m) => typeof m === 'string' && m.length > 0).map((m) => m.slice(0, 200)).slice(0, 200)
    : [];
  // Schema v61: coupling-rule idempotency markers. Fail-closed: a non-string
  // entry is dropped rather than coerced, and the list is bounded, so a corrupt
  // or oversized marker array cannot change what the rule commits.
  state.couplingMarkers = Array.isArray(raw.couplingMarkers)
    ? raw.couplingMarkers.filter((m) => typeof m === 'string' && m.length > 0).map((m) => m.slice(0, 200)).slice(0, 200)
    : [];
  // Schema v62: performance concerns. Fail-closed per record: an unreadable
  // concern is dropped with a warning, a dangling person pointer is cleared
  // rather than followed, and a frozen prediction is read back as stored.
  state.performanceConcerns = normalizePerformanceConcerns(raw.performanceConcerns, state, now, warnings);
  // Schema v63: frozen survival readings. Fail-closed per record: a reading
  // that froze no item prediction is dropped, a dangling source is marked
  // missing rather than deleted (the prediction still happened), and a reading
  // claiming a grade it does not have is repaired downward to `frozen`.
  state.survivalReadings = normalizeSurvivalReadings(raw.survivalReadings, state, now, warnings);
  state.survivalMarkers = normalizeSurvivalMarkers(raw.survivalMarkers);
  // Schema v64: cost-of-waiting records. Fail-closed per record: an unreadable
  // price or certificate is dropped with a warning, never repaired silently,
  // because the stored money is exactly what the leader declared.
  state.waitPrices = normalizeWaitPrices(raw.waitPrices, warnings);
  state.waitExposures = normalizeWaitExposures(raw.waitExposures, warnings);
  state.waitCostMarkers = normalizeWaitCostMarkers(raw.waitCostMarkers);
  // Schema v65: frozen parity & standard-consistency audits. Fail-closed per
  // record; a record claiming `graded` without a valid grade object is repaired
  // downward to `frozen` with a warning.
  state.parityAudits = normalizeParityAudits(raw.parityAudits, now, warnings);
  state.parityMarkers = normalizeParityMarkers(raw.parityMarkers);
  // Schema v66: frozen evidence reviews. Fail-closed per record: a frozen cell
  // with no pooled estimate is dropped (a count is not a prediction), and a
  // review claiming a grade it does not carry is repaired downward to frozen.
  state.evidenceReviews = normalizeEvidenceReviews(raw.evidenceReviews, now, warnings);
  state.evidenceMarkers = normalizeEvidenceMarkers(raw.evidenceMarkers);
  state.consequenceReadings = normalizeConsequenceReadings(raw.consequenceReadings, now, warnings);
  state.consequenceMarkers = normalizeConsequenceMarkers(raw.consequenceMarkers);
  // Schema v68: frozen deferral frames. Fail-closed per record: a frame without
  // a currency, stake or volatility is dropped rather than repaired to zero,
  // and a frame claiming a grade without an outcome returns to frozen.
  state.deferralFrames = normalizeDeferralFrames(raw.deferralFrames, warnings);
  state.deferralMarkers = normalizeDeferralMarkers(raw.deferralMarkers);
  // Schema v69: frozen deferral-portfolio readings and the leader's declared
  // pairwise correlations. Fail-closed per record: a reading without its one
  // frozen probability is dropped, and a declared ρ outside [−0.99, 0.99] is
  // dropped rather than clamped into a different assumption.
  state.deferralPortfolioReadings = normalizeDeferralPortfolioReadings(raw.deferralPortfolioReadings, warnings);
  state.correlationDeclarations = normalizeCorrelationDeclarations(raw.correlationDeclarations, warnings);
  state.deferralPortfolioMarkers = normalizeDeferralPortfolioMarkers(raw.deferralPortfolioMarkers);
  // Schema v70: recorded looks, verdicts and frozen reviews. Fail-closed per
  // record: a look that tested nothing is not a look, a verdict outside the four
  // legal words is dropped rather than coerced, and a review that claims a grade
  // without an outcome returns to frozen.
  state.integrityLooks = normalizeIntegrityLooks(raw.integrityLooks, warnings);
  state.signalVerdicts = normalizeSignalVerdicts(raw.signalVerdicts, warnings);
  state.integrityReviews = normalizeIntegrityReviews(raw.integrityReviews, warnings);
  state.integrityMarkers = normalizeIntegrityMarkers(raw.integrityMarkers);
  // Schema v71: borrowing frames, exchangeability rulings and markers.
  state.credibilityFrames = normalizeCredibilityFrames(raw.credibilityFrames, warnings);
  state.credibilityDeclarations = normalizeCredibilityDeclarations(raw.credibilityDeclarations, warnings);
  state.credibilityMarkers = normalizeCredibilityMarkers(raw.credibilityMarkers);
  // Schema v72: frozen calibration certificates. Fail-closed per record: a
  // sigmoid without coefficients and an isotonic map without blocks are both
  // dropped rather than reconstructed, and a certificate that claims a grade
  // without an outcome returns to frozen.
  state.confidenceCertificates = normalizeConfidenceCertificates(raw.confidenceCertificates, warnings);
  state.confidenceMarkers = normalizeConfidenceMarkers(raw.confidenceMarkers);
  // Schema v73: response receipts resolve after intake and cases, before links.
  state.responsePlans = normalizeResponsePlans(raw.responsePlans, state, now, warnings);
  state.actionBundles = normalizeActionBundles(raw.actionBundles, state, now, warnings);
  // ADR-0118: portfolio rehearsal comparisons resolve AFTER their bundles and
  // decisions, so a receipt can only be kept when the two candidates and the
  // arbitration it names still exist. A receipt whose rationale, bundles or
  // decision is missing is DROPPED with a warning — never repaired into a
  // comparison a reader might treat as evidence of a deliberation.
  state.portfolioComparisons = normalizePortfolioComparisons(raw.portfolioComparisons, state, now, warnings, { collections: COLLECTIONS });
  // Schema v75: loop settlement & attribution receipts resolve before links so
  // `settles-loop`, `exonerates-delivery` and `flags-bottleneck` edges validate.
  state.settlements = normalizeSettlements(raw.settlements, state, now, warnings);
  // Schema v76: frozen counterfactual policy evaluations resolve before links so
  // `evaluates-policy` and `grounds-practice` edges validate against real nodes.
  state.policyEvaluations = normalizePolicyEvaluations(raw.policyEvaluations, warnings);
  state.policyMarkers = normalizePolicyMarkers(raw.policyMarkers, warnings);
  state.reliabilityReadings = normalizeReliabilityReadings(raw.reliabilityReadings, warnings);
  state.reliabilityMarkers = normalizeReliabilityMarkers(raw.reliabilityMarkers, warnings);
  // Schema v78: frozen coupling reviews resolve before links so
  // `calibrates-coupling` and `measures-coupling` edges validate against real
  // member calls and premises.
  state.couplingReviews = normalizeCouplingReviews(raw.couplingReviews, warnings);
  // Schema v79: frozen supply plans resolve before links so `supplies-evidence`,
  // `unblocks-judgement` and `retires-question` edges validate against real
  // plans, tasks and open records.
  state.supplyPlans = normalizeSupplyPlans(raw.supplyPlans, warnings);
  state.supplyMarkers = normalizeSupplyMarkers(raw.supplyMarkers, warnings);
  // Schema v80: frozen promise readings resolve before links so
  // `endangers-promise`, `underwrites-commitment` and `renegotiates` edges
  // validate against real readings, real promises and real tasks.
  state.scepticRounds = normalizeScepticRounds(raw.scepticRounds, warnings);
  state.scepticDispositions = normalizeScepticDispositions(raw.scepticDispositions, warnings);
  state.scepticMarkers = normalizeScepticMarkers(raw.scepticMarkers, warnings);
  state.solvencyReadings = normalizeSolvencyReadings(raw.solvencyReadings, warnings);
  state.solvencyMarkers = normalizeSolvencyMarkers(raw.solvencyMarkers, warnings);
  state.solvencyRenegotiations = normalizeSolvencyRenegotiations(raw.solvencyRenegotiations, warnings);
  // Schema v82: frozen chain readings resolve before links so `rolls-up-to` and
  // `escalates-to` edges validate against real readings and real leaders.
  state.chainReadings = normalizeChainReadings(raw.chainReadings, warnings, {
    cap: state.settings?.chainReadingCap,
  });
  state.chainMarkers = normalizeChainMarkers(raw.chainMarkers, warnings);
  // Schema v83: frozen bench readings resolve before links so `benches-for`,
  // `certifies-gap`, `understudies-for` and `hedges-departure` edges validate
  // against real readings, real spans and real obligations.
  state.successionReadings = normalizeSuccessionReadings(raw.successionReadings, warnings);
  state.successionMarkers = normalizeSuccessionMarkers(raw.successionMarkers);
  state.mandates = normalizeMandates(raw.mandates, warnings);
  state.authorityCalibrationMarkers = normalizeAuthorityCalibrationMarkers(raw.authorityCalibrationMarkers, warnings);
  state.missionBriefs = normalizeMissionBriefs(raw.missionBriefs, warnings);
  state.missionCaptures = normalizeMissionCaptures(raw.missionCaptures, state, warnings, { now: new Date(now) });
  // ADR-0081: routing plans/markers resolve before links so `routes-through`,
  // `discloses-to`, `grades-routing` and `rolls-up-to` edges validate against
  // real plan ids. A hostile or malformed plan is dropped, never repaired.
  state.altitudeRoutingPlans = normalizeRouterPlans(raw.altitudeRoutingPlans, warnings);
  state.altitudeRoutingMarkers = normalizeRouterMarkers(raw.altitudeRoutingMarkers);
  // ADR-0084: Hoshin Catchball pacts and rounds resolve before links so
  // `deploys-strategy`, `cascades-to`, `counters-upward`, `trades-off`, and
  // `rolls-up-to` edges validate against real pact and round ids.
  state.catchballPacts = normalizeCatchballPacts(raw.catchballPacts, warnings);
  state.catchballRounds = normalizeCatchballRounds(raw.catchballRounds, warnings);
  state.catchballMarkers = normalizeCatchballMarkers(raw.catchballMarkers);
  // ADR-0089: resolve frozen cycles after their Catchball cohort sources and
  // before typed links, while keeping raw cohort IDs out of scoped projections.
  state.strategyCycles = normalizeStrategyCycleReadings(raw.strategyCycles, warnings);
  state.strategyCycleMarkers = normalizeStrategyCycleMarkers(raw.strategyCycleMarkers);
  // ADR-0090: assessments and markers resolve before typed links so
  // `summarizes-span` and `reconnects` edges validate against real assessment
  // ids. A malformed assessment is dropped, never repaired.
  state.federationAssessments = normalizeFederationAssessments(raw.federationAssessments, warnings);
  state.federationMarkers = normalizeFederationMarkers(raw.federationMarkers);
  // ADR-0092: releases and markers resolve before typed links so
  // `summarizes-span`, `proves-release` and `protects-release` edges validate
  // against real release ids. A malformed release is dropped, never repaired.
  state.differenceReleases = normalizeReleases(raw.differenceReleases, warnings);
  state.differenceMarkers = normalizeDifferencingMarkers(raw.differenceMarkers);
  // ADR-0094: contracts, once-only grades and rule markers resolve before the
  // typed links so `pre-registers`, `grades-outcome`, `tracks-followup` and
  // `rolls-up-to` edges validate against real ids. A malformed contract, a
  // duplicate grade and an inconsistent marker are DROPPED with a warning;
  // nothing is repaired into a reading a leader might act on.
  state.prospectiveContracts = normalizeProspectiveContracts(raw.prospectiveContracts, warnings);
  state.prospectiveGrades = normalizeProspectiveGrades(raw.prospectiveGrades, warnings);
  state.prospectiveMarkers = normalizeProspectiveMarkers(raw.prospectiveMarkers);
  // ADR-0095: plans and rule markers resolve before the typed links so
  // `allocates`, `consumes-capacity`, `rests-on` and `rolls-up-to` edges validate
  // against real ids. A malformed plan (or an adopted plan with no frozen
  // solution) is DROPPED with a warning; nothing is repaired into a commitment a
  // leader might act on.
  state.robustPlans = normalizeRobustPlans(raw.robustPlans, warnings);
  state.robustMarkers = normalizeRobustMarkers(raw.robustMarkers);
  // ADR-0098: clearing rounds and markers resolve before typed links so
  // `clears-bid`, `prices-externality` and `rolls-up-to` edges cannot point at
  // a malformed or half-frozen resource commitment.
  state.clearingRounds = normalizeClearingRounds(raw.clearingRounds, warnings);
  state.clearingMarkers = normalizeClearingMarkers(raw.clearingMarkers);
  // ADR-0099: continuity readings and markers resolve before typed links so
  // `freezes` / `re-projects` / `rolls-up-to` edges validate against real
  // reading ids. A malformed reading or duplicate marker is DROPPED with a
  // warning; nothing is repaired into a verdict.
  state.freezeReadings = normalizeFreezeReadings(raw.freezeReadings, warnings, { now: new Date() });
  state.freezeMarkers = normalizeFreezeMarkers(raw.freezeMarkers);
  // ADR-0100: calibration readings, the ladder-adoption ledger and rule markers
  // resolve before typed links so `calibrates` / `rolls-up-to` edges validate
  // against real ids. A malformed reading or undated adoption is DROPPED with a
  // warning; nothing is repaired into a ladder a leader might route on.
  state.spanReadings = normalizeSpanReadings(raw.spanReadings, warnings, { now: new Date() });
  state.reputationActs = normalizeReputationActs(raw.reputationActs, warnings, { now: new Date() });
  state.reputationPositions = normalizeReputationPositions(raw.reputationPositions, warnings, { now: new Date() });
  state.reputationMarkers = normalizeReputationMarkers(raw.reputationMarkers);
  // ADR-0102: decision locks resolve before typed links so the `locks` /
  // `consults` / `rolls-up-to` edges validate against real lock ids. A malformed
  // lock, a duplicate, or one dated in the future is DROPPED with a warning —
  // never repaired into an information set a leader might be shown.
  state.decisionLocks = normalizeDecisionLocks(raw.decisionLocks, warnings, { now: new Date() });
  state.decisionLockMarkers = normalizeHindsightMarkers(raw.decisionLockMarkers);
  // ADR-0103: epistemic unknowns, frozen belief observations and their grades
  // resolve BEFORE typed links so the `rests-on` / `rolls-up-to` / `informs`
  // edges validate against real ids. A row claiming a resolution without its
  // day, its answer or its dismissal reason is DROPPED with a warning — never
  // repaired into a claim a reader might act on.
  state.epistemicUnknowns = normalizeEpistemicUnknowns(raw.epistemicUnknowns, warnings, { now: new Date() });
  state.epistemicObservations = normalizeEpistemicObservations(raw.epistemicObservations, warnings, { now: new Date() });
  state.epistemicGrades = normalizeEpistemicGrades(raw.epistemicGrades);
  state.epistemicMarkers = normalizeEpistemicMarkers(raw.epistemicMarkers);
  // ADR-0104: frozen frontiers, consultations and once-only grades resolve
  // BEFORE typed links so `diligence-for`, `deliberates-on` and
  // `grades-diligence` edges validate against real ids. A checklist without its
  // decision, its decision date or its freeze date, and a "ruled-out" consult
  // without a reason, are DROPPED with a warning — never repaired into a claim
  // that somebody looked when the record cannot prove it.
  // ADR-0107: frozen expectations, once-only grades and markers resolve BEFORE
  // typed links so `rests-on`, `grades-outcome` and `rolls-up-to` edges
  // validate against real ids. A malformed contract, a grade without its
  // outcome value or a duplicate marker is DROPPED with a warning.
  state.outcomeContracts = normalizeOutcomeContracts(raw.outcomeContracts, warnings);
  state.outcomeGrades = normalizeOutcomeGrades(raw.outcomeGrades, warnings);
  state.outcomeMarkers = normalizeOutcomeMarkers(raw.outcomeMarkers);
  // ADR-0108: the Decision-Fit Ledger resolves before typed links for the same
  // reason — every `rests-on` / `rolls-up-to` edge it writes must validate
  // against a real snapshot, proposal or reading id.
  state.fitSnapshots = normalizeFitSnapshots(raw.fitSnapshots, warnings);
  state.fitProposals = normalizeFitProposals(raw.fitProposals, warnings);
  state.fitReadings = normalizeFitReadings(raw.fitReadings, warnings);
  state.fitMarkers = normalizeFitMarkers(raw.fitMarkers);
  // ADR-0109: the Jurisdiction Compiler resolves BEFORE typed links for the
  // same reason — every `spans-work` / `governs-mandate` / `rolls-up-to` edge
  // it writes must validate against a real finding, decision or reading id.
  // A finding without a resolvable ancestor, a priced route or a printed
  // refusal is DROPPED with a warning, never repaired into a recommendation.
  state.jurFindings = normalizeJurFindings(raw.jurFindings, warnings);
  state.jurReadings = normalizeJurReadings(raw.jurReadings, warnings);
  state.jurMarkers = normalizeJurMarkers(raw.jurMarkers);
  // ADR-0113: the 1:1 agenda provenance ledger resolves before typed links —
  // a `prepares-for` edge from a filed line must validate against a real entry
  // id. A filing without a prompt, a person or a valid day is DROPPED with a
  // warning, never repaired into a promise a leader might believe they made.
  state.agendaEntries = normalizeAgendaEntries(raw.agendaEntries, warnings);
  state.agendaMarkers = normalizeAgendaMarkers(raw.agendaMarkers, warnings);
  state.diligenceChecklists = normalizeDiligenceChecklists(raw.diligenceChecklists, warnings);
  state.diligenceConsults = normalizeDiligenceConsults(raw.diligenceConsults, warnings, { now: new Date() });
  state.diligenceGrades = normalizeDiligenceGrades(raw.diligenceGrades);
  state.diligenceMarkers = normalizeDiligenceMarkers(raw.diligenceMarkers);
  state.spanAdoptions = normalizeSpanAdoptions(raw.spanAdoptions, warnings);
  state.spanMarkers = normalizeSpanMarkers(raw.spanMarkers);
  // ADR-0085: the Operating Cadence Clock. A malformed forum, a sitting with no
  // ADR-0088: carryover records resolve after pacts so `carries-over` and
  // ADR-0089: resolve peer contracts and immutable receipts before typed links.
  state.valueStreamContracts = normalizeValueStreamContracts(raw.valueStreamContracts, warnings);
  state.valueStreamRounds = normalizeValueStreamRounds(raw.valueStreamRounds, warnings);
  state.valueStreamReallocations = normalizeValueStreamReallocations(raw.valueStreamReallocations, warnings);
  state.valueStreamMarkers = normalizeValueStreamMarkers(raw.valueStreamMarkers);
  // ADR-0085: carryover records resolve after pacts so `carries-over` and
  // `settles` edges validate against real pact and bet ids.
  state.carryoverRecords = normalizeCarryoverRecords(raw.carryoverRecords, warnings);
  state.carryoverMarkers = normalizeCarryoverMarkers(raw.carryoverMarkers, warnings);
  state.carryoverGradings = normalizeCarryoverGradings(raw.carryoverGradings, warnings);
  // ADR-0087: the Operating Cadence Clock. A malformed forum, a sitting with no
  // ADR-0085: the Operating Cadence Clock. A malformed forum, a sitting with no
  // date and a reading with no frozen figure are all dropped with a warning;
  // none is repaired into something a leader might act on.
  state.cadenceForums = normalizeCadenceForums(raw.cadenceForums, warnings);
  state.cadenceSessions = normalizeCadenceSessions(raw.cadenceSessions, warnings);
  state.cadenceReadings = normalizeCadenceReadings(raw.cadenceReadings, warnings);
  state.cadenceMarkers = normalizeCadenceMarkers(raw.cadenceMarkers);
  state.settings = { ...state.settings, ...normalizeCadenceSettings({ ...DEFAULT_SETTINGS, ...(raw.settings || {}) }) };
  // ADR-0085: carryover records resolve after pacts so `carries-over` and
  // `settles` edges validate against real pact and bet ids.
  state.carryoverRecords = normalizeCarryoverRecords(raw.carryoverRecords, warnings);
  state.carryoverMarkers = normalizeCarryoverMarkers(raw.carryoverMarkers, warnings);
  state.carryoverGradings = normalizeCarryoverGradings(raw.carryoverGradings, warnings);
  // ADR-0083: rounds resolve before links so `rolls-up-to`, `re-contracts` and
  // `re-tests` edges validate against real round ids. A malformed round is
  // dropped; a round claiming to be closed with one side is reopened.
  state.expectationRounds = normalizeConcordanceRounds(raw.expectationRounds, warnings);
  state.concordanceMarkers = normalizeConcordanceMarkers(raw.concordanceMarkers, warnings);
  state.omWorkSplits = normalizeWorkSplits(raw.omWorkSplits, warnings);
  state.omDecisions = normalizeOperatingModelDecisions(raw.omDecisions, warnings);
  state.omMarkers = normalizeOperatingModelMarkers(raw.omMarkers, warnings);
  // Collaboration edges are validated against the roster AFTER people resolve, so
  // an edge to an archived person is dropped rather than left dangling.
  {
    const ids = new Set(state.people.map((p) => p && p.id).filter(Boolean));
    const rawEdges = Array.isArray(raw.omEdges) ? raw.omEdges : [];
    const seen = new Set();
    const kept = [];
    let dropped = 0;
    for (const edge of rawEdges) {
      if (!isPlainObject(edge)) { dropped += 1; continue; }
      const fromId = str(edge.fromId);
      const toId = str(edge.toId);
      const key = fromId < toId ? `${fromId}|${toId}` : `${toId}|${fromId}`;
      if (!fromId || !toId || fromId === toId || seen.has(key)) { dropped += 1; continue; }
      seen.add(key);
      kept.push({
        id: str(edge.id) || `ome-${kept.length}`,
        fromId,
        toId,
        weight: clampInt(edge.weight, 1, 5, 1),
        kind: ['sync', 'handoff', 'review', 'escalation'].includes(edge.kind) ? edge.kind : 'sync',
        unitCrossing: edge.unitCrossing === true,
        note: str(edge.note).slice(0, 200),
        declaredOn: dayOrNull(edge.declaredOn),
        createdAt: isoOrNull(edge.createdAt),
      });
    }
    void ids;
    if (dropped) warnings.push(`Operating model: ${dropped} collaboration edge(s) were malformed, duplicated or self-referential and were dropped.`);
    state.omEdges = kept;
  }
  // ADR-0088: escalation records and commitments resolve before links so
  // `escalates-to`, `originates-from`, `reconciles-authority` and `rolls-up-to`
  // edges validate against real ids. A row that contradicts its own disposition
  // (an escalation with no receiver, an absorption with one) is dropped, never
  // repaired, because repairing it would fabricate the escalation rate.
  state.escalationRecords = normalizeEscalationRecords(raw.escalationRecords, warnings);
  state.escalationCommitments = normalizeEscalationCommitments(raw.escalationCommitments, warnings);
  state.escalationMarkers = normalizeEscalationMarkers(raw.escalationMarkers);
  // ADR-0089: carryover records resolve after pacts so `carries-over` and
  // `settles` edges validate against real pact and bet ids.
  state.carryoverRecords = normalizeCarryoverRecords(raw.carryoverRecords, warnings);
  state.carryoverMarkers = normalizeCarryoverMarkers(raw.carryoverMarkers, warnings);
  state.carryoverGradings = normalizeCarryoverGradings(raw.carryoverGradings, warnings);
  // ADR-0086: grants resolve before links so `discloses-to`, `consented-by`,
  // `authorizes` and `tracks-followup` edges validate against real grant ids.
  // An expired grant loads as expired; it never loads as live authority.
  state.disclosureGrants = normalizeDisclosureGrants(raw.disclosureGrants, warnings, { now, today: todayDay });
  state.disclosureMarkers = normalizeDisclosureMarkers(raw.disclosureMarkers, warnings);
  // ADR-0085: memos resolve before links so `summarizes-span`/`escalates-from`
  // provenance edges validate against real memo ids. A memo claiming to be
  // committed without a snapshot is reopened as a draft.
  state.boardMemos = normalizeBoardMemos(raw.boardMemos, warnings);
  state.boardMarkers = normalizeBoardMarkers(raw.boardMarkers, warnings);
  // ADR-0087: credential enrollments resolve before links; a malformed
  // enrollment is dropped, never repaired.
  state.seatIdentities = normalizeSeatIdentities(raw.seatIdentities, warnings);
  state.identityMarkers = normalizeIdentityMarkers(raw.identityMarkers);
  // ADR-0121: a malformed cover row is dropped with a warning, never repaired —
  // an invented stand-in is an invented responsibility. Resolved BEFORE links so
  // the `prepares-for` provenance edge validates against a real cover id.
  state.dutyCovers = normalizeDutyCovers(raw.dutyCovers, warnings);
  state.dutyCoverageMarkers = normalizeDutyCoverageMarkers(raw.dutyCoverageMarkers);
  state.reportingLines = normalizeReportingLines(raw.reportingLines, warnings);
  state.matrixMarkers = normalizeMatrixMarkers(raw.matrixMarkers);
  // ADR-0143: an arbitration case is about a person on THIS roster, and its
  // agreement must name every frozen demand exactly once. Resolved BEFORE links
  // so the `concerns`, `decides` and `issues-obligation` provenance edges
  // validate against real row ids. A case whose frame is unreadable is dropped
  // whole with a printed warning: half-loading it would put demands into a span
  // whose capacity the read model cannot resolve, and an unreadable agreement is
  // not an agreement.
  state.priorityArbitrations = normalizePriorityArbitrations(raw.priorityArbitrations, state.people, warnings);
  state.priorityArbitrationMarkers = normalizePriorityMarkers(raw.priorityArbitrationMarkers);
  // ADR-0144: a charter names a line manager and a lever from the declared
  // taxonomy; a row that cannot be read is dropped with a warning rather than
  // mapped to a neighbouring lever, because a guessed lever manufactures a
  // contradiction nobody declared. Resolved BEFORE links so the `concerns`,
  // `decides` and `issues-obligation` provenance edges validate against real
  // review ids.
  state.lineMandates = normalizeLineMandates(raw.lineMandates, warnings);
  state.contradictionReviews = normalizeContradictionReviews(raw.contradictionReviews, warnings);
  state.contradictionMarkers = normalizeContradictionMarkers(raw.contradictionMarkers);
  // ADR-0148: a consent act must name its side, its outcome and its day; one
  // that does not is DROPPED with a printed warning, never repaired. An
  // acceptance invented at load time is consent nobody gave. An acceptance
  // without an expiry is dropped too: a consent that can never lapse is the
  // state this module exists to expose, never to fabricate.
  state.lineConsents = normalizeLineConsents(raw.lineConsents, warnings);
  state.lineConsentMarkers = normalizeLineConsentMarkers(raw.lineConsentMarkers);
  // ADR-0149: a home-line period must name its person, its manager, its start day
  // and its recording day; one that does not is DROPPED with a printed warning,
  // never repaired. A period invented at load time is a past that never happened,
  // and it would be indistinguishable from one that did. A record made before the
  // period it describes began is dropped too: a planned move is recorded on the
  // day it takes effect, never early.
  state.structureHistory = normalizeStructureHistory(raw.structureHistory, warnings);
  state.structureHistoryMarkers = normalizeStructureHistoryMarkers(raw.structureHistoryMarkers);
  // ADR-0150: a line brief must name its plan, person, line, manager, day and
  // outcome, and must either SAY what the line expects or state why it has
  // nothing to say; one that does not is DROPPED with a printed warning, never
  // repaired. A brief invented at load time is words nobody said, and an
  // acknowledgement invented at load time is a person recorded as told when they
  // were not.
  state.onboardingLineBriefs = normalizeOnboardingLineBriefs(raw.onboardingLineBriefs, warnings);
  state.onboardingLineBriefMarkers = normalizeOnboardingLineBriefMarkers(raw.onboardingLineBriefMarkers, warnings);
  // ADR-0152: a remedy must name the obligation, the line, the person, the
  // manager, the outcome and the day, must state WHY, and a carry must name the
  // manager who now owes the work; one that does not is DROPPED with a printed
  // warning, never repaired. A retirement invented at load time would close an
  // obligation nobody settled, and a carry invented at load time would hand work
  // to a manager who never took it.
  state.lineExitRemedies = normalizeLineExitRemedies(raw.lineExitRemedies, warnings);
  state.lineExitMarkers = normalizeLineExitMarkers(raw.lineExitMarkers);
  // ADR-0157: an answer must name its side, its outcome, its day and — for a
  // re-affirmation — the term it sets. One that does not is DROPPED with a
  // printed warning, never repaired. A renewal invented at load time is an
  // agreement nobody gave, and a renewal with no end date cannot be told apart
  // from one nobody revisited: both are the exact states this module exists to
  // expose, never to fabricate.
  state.lineReaffirmations = normalizeLineReaffirmations(raw.lineReaffirmations, warnings);
  state.lineReaffirmationMarkers = normalizeLineReaffirmationMarkers(raw.lineReaffirmationMarkers);
  // ADR-0159: malformed settlements are dropped with a printed warning, never
  // repaired — an invented sign-off on a drifted frozen decision is fabricated
  // audit evidence.
  state.authorityReaffirmations = normalizeAuthorityReaffirmations(raw.authorityReaffirmations, warnings);
  state.authorityReaffirmationMarkers = normalizeAuthorityReaffirmationMarkers(raw.authorityReaffirmationMarkers);
  // ADR-0162: malformed or side-forged bilateral operating agreements are
  // dropped with a printed warning, never repaired into synthetic consent.
  state.matrixInterfaceAgreements = normalizeMatrixInterfaceAgreements(raw.matrixInterfaceAgreements, warnings);
  state.matrixInterfaceMarkers = normalizeMatrixInterfaceMarkers(raw.matrixInterfaceMarkers);
  // ADR-0174: malformed standing-authority schedule acts are dropped with a
  // printed warning — never repaired into synthetic signing authority.
  state.doaSchedule = normalizeDoaSchedule(raw.doaSchedule, warnings);
  state.doaMarkers = normalizeDoaMarkers(raw.doaMarkers);
  // ADR-0166: the review-evidence join's idempotency ledger. A malformed marker is
  // dropped so the ask it guarded can be issued again — never repaired into a
  // plausible-looking marker that would suppress it.
  state.meritEvidenceMarkers = normalizeMeritEvidenceMarkers(raw.meritEvidenceMarkers);
  // ADR-0168: the bench-evidence rule's idempotency ledger. A malformed marker is
  // dropped so the ask it guarded can be issued again — never repaired into a
  // plausible-looking marker that would suppress it.
  state.benchEvidenceMarkers = normalizeBenchEvidenceMarkers(raw.benchEvidenceMarkers);
  // ADR-0171: malformed intake-act rows are dropped with a warning, never
  // repaired — an invented intake is an invented claim on someone's ceiling.
  state.lineIntakes = normalizeLineIntakes(raw.lineIntakes);
  // ADR-0172: a malformed frozen reading is dropped, never repaired — a
  // repaired "previous window" would be a history nobody recorded. A malformed
  // marker is dropped so the ask it guarded can be issued again.
  state.benchRegressionReadings = normalizeBenchRegressionReadings(raw.benchRegressionReadings);
  state.benchRegressionMarkers = normalizeBenchRegressionMarkers(raw.benchRegressionMarkers);
  // ADR-0175: malformed remedy rows are dropped with a counted warning, never repaired.
  state.matrixRemedies = normalizeMatrixRemedies(raw.matrixRemedies, warnings);
  // ADR-0164 (Schema v140): RULE-OOL-01's bounded idempotency & observation ledger.
  state.oneOnOneLineMarkers = normalizeOneOnOneLineMarkers(raw.oneOnOneLineMarkers);
  // ADR-0176 (Schema v141): malformed line-plan acts are dropped with a counted
  // warning, never repaired into a plan nobody declared.
  state.hiringLinePlans = normalizeHiringLinePlans(raw.hiringLinePlans, state, warnings);
  state.hiringLineMarkers = normalizeHiringLineMarkers(raw.hiringLineMarkers);
  // ADR-0177 (Schema v142): a malformed price act, a key signed from the wrong
  // seat or side, or a confirmation whose terms differ from its proposal is
  // dropped with a counted warning — never repaired into a price nobody agreed.
  state.transferPriceActs = normalizeTransferPriceActs(raw.transferPriceActs, warnings);
  state.transferPriceMarkers = normalizeTransferPriceMarkers(raw.transferPriceMarkers);
  state.delegationLineActs = normalizeDelegationLineActs(raw.delegationLineActs, state, warnings);
  state.delegationLineMarkers = normalizeDelegationLineMarkers(raw.delegationLineMarkers);
  // ADR-0181 (Schema v144): a malformed classification act, an act naming a
  // kind outside the closed list, or one naming a person other than the ask's
  // owner is dropped with a counted warning — never repaired into a kind
  // nobody declared. Resolved after delegations so the owner check is real.
  state.workTurnActs = normalizeWorkTurnActs(raw.workTurnActs, state, warnings);
  state.workTurnMarkers = normalizeWorkTurnMarkers(raw.workTurnMarkers);
  // ADR-0182 (Schema v145): a malformed permit, one whose reason or compensating
  // measure is below the declared floor, one naming a switch this workspace does
  // not declare, or one whose window is unusable is dropped with a counted
  // warning — never repaired into an authority nobody granted.
  // The declared set is read from the settings just normalized: a permit naming
  // a key this workspace does not carry is an authority over a switch that gates
  // nothing, and is dropped rather than printed as a governed control.
  state.pausePermits = normalizePausePermits(raw.pausePermits, Object.keys(state.settings || {})
    .filter((key) => typeof state.settings[key] === 'boolean'), warnings);
  state.pausePermitMarkers = normalizePausePermitMarkers(raw.pausePermitMarkers);
  // ADR-0184 (Schema v146): a move act that is not a declared kind, names an
  // unknown level, contradicts its own declared direction, lands on a day that
  // has not arrived, or duplicates a person-day is dropped with a counted
  // warning — never repaired into a transition that never happened. Resolved
  // AFTER people so the person and start-day checks are real. Targets whose
  // horizon has already passed are dropped separately: an intended shape is a
  // plan, not a note about the past.
  state.workforceFlowActs = normalizeWorkforceFlowActs(raw.workforceFlowActs, state, now.slice(0, 10), warnings);
  state.workforceFlowTargets = normalizeWorkforceFlowTargets(raw.workforceFlowTargets, now.slice(0, 10), warnings);
  state.workforceFlowMarkers = normalizeWorkforceFlowMarkers(raw.workforceFlowMarkers);
  // ADR-0186 (Schema v148): a demand act that names a change this workspace does
  // not hold, names a person the change never claimed as impacted, contradicts a
  // declared band or window, or duplicates one line's statement about one change is
  // dropped with a counted warning — never repaired into a burden nobody declared.
  // Resolved AFTER people, changes and reporting lines so the person, impact and
  // (at the action) line checks are real. A ceiling whose whole window has passed
  // SURVIVES the reload — only the door refuses to create one, because expiry is a
  // state time produces, and the register prints it as expired history rather than
  // letting an expired limit disappear and read as no limit was ever set.
  state.changeSaturationActs = normalizeChangeSaturationActs(raw.changeSaturationActs, state, now.slice(0, 10), warnings);
  state.changeSaturationCeilings = normalizeChangeSaturationCeilings(raw.changeSaturationCeilings, state, now.slice(0, 10), warnings);
  state.changeSaturationMarkers = normalizeChangeSaturationMarkers(raw.changeSaturationMarkers);
  // ADR-0122: a malformed absence row is dropped with a warning, never repaired —
  // an invented absence is an invented unavailability for every cover in the span.
  // Resolved BEFORE links so the `declares-absence-of` provenance edge validates
  // against a real absence id.
  state.absencePlans = normalizeAbsencePlans(raw.absencePlans, warnings);
  // ADR-0127: an answer is only ever the named cover's own. The normalizer sees
  // the cover ledger at the same time so a hand-edited file cannot record consent
  // on someone else's behalf, and a malformed answer is dropped rather than
  // repaired into a plausible-looking yes. Resolved BEFORE links so the
  // `accepts-standby-for` provenance edge validates against a real answer id.
  state.dutyStandbyAnswers = normalizeStandbyAnswers(raw.dutyStandbyAnswers, state.dutyCovers, warnings);
  // ADR-0128: a rehearsal is only ever attested by a seat that could have been
  // there — the holder, the cover, or a leadership ancestor of the holder. The
  // normalizer sees the cover ledger AND the roster at the same time so a
  // hand-edited file cannot invent an observer, a rehearsal cannot be recorded
  // before it happened, and a malformed attestation is dropped rather than
  // repaired into plausible-looking evidence. Resolved BEFORE links so the
  // `attests-rehearsal-of` provenance edge validates against a real row id.
  state.dutyRehearsals = normalizeDutyRehearsals(raw.dutyRehearsals, state.dutyCovers, state.people, warnings);
  // ADR-0129: an ask is about a branch on THIS roster and an answer belongs to
  // the branch that was asked. The answers are resolved against the asks at the
  // same time so a hand-edited file cannot publish a reading for a branch that
  // never asked for one, record an answer dated before its ask, or invent a band
  // outside the declared vocabulary. Both resolve BEFORE links so the
  // `requests-reading-from` and `answers-reading-ask` provenance edges validate
  // against real row ids.
  state.branchReadingAsks = normalizeBranchReadingAsks(raw.branchReadingAsks, state.people, warnings);
  state.branchReadings = normalizeBranchReadings(raw.branchReadings, state.branchReadingAsks, warnings);
  state.links = normalizeLinks(raw.links, state, todayDay, now, warnings);
  state.boardMarkers = normalizeBoardMarkers(raw.boardMarkers, warnings);
  // ADR-0085: packets and attested artefacts resolve before links so `carries`,
  // `reconciles` and `tracks-followup` edges validate against real packet ids.
  // A packet row this build cannot fully account for is dropped with a warning;
  // a payload field outside the declared whitelist never survives ingestion.
  state.exchangePackets = normalizeExchangePackets(raw.exchangePackets, warnings);
  state.exchangeArtefacts = normalizeExchangeArtefacts(raw.exchangeArtefacts, warnings);
  state.exchangeMarkers = normalizeExchangeMarkers(raw.exchangeMarkers);
  state.links = normalizeLinks(raw.links, state, todayDay, now, warnings);

  const events = asArray(raw, 'events', warnings).map((e, i) => ({
    id: str(e.id) || `ev-${i}`,
    ts: isoOrNull(e.ts) || now,
    type: str(e.type, 'unknown').slice(0, 60),
    entity: str(e.entity).slice(0, 40),
    entityId: str(e.entityId),
    summary: str(e.summary).slice(0, 300),
  }));
  state.events = uniqueIds(events, 'Event log', warnings);

  // Referential integrity: records pointing at people who no longer exist are
  // kept (history matters) but counted so the UI can say so honestly.
  const personIds = new Set(state.people.map((p) => p.id));
  const orphanChecks = [
    ['onboarding', (r) => r.personId],
    ['oneOnOnes', (r) => r.personId],
    ['feedback', (r) => r.personId],
    ['delegations', (r) => r.personId],
    ['growthPlans', (r) => r.personId],
    ['recognition', (r) => r.personId],
    ['readiness', (r) => r.personId],
    ['reviews', (r) => r.personId],
    ['cases', (r) => r.ownerId],
    ['changes', (r) => r.ownerId],
    ['negotiations', (r) => r.ownerId],
    ['budgets', (r) => r.ownerId],
    ['stakeholders', (r) => r.personId],
  ];
  for (const [key, getter] of orphanChecks) {
    const orphans = state[key].filter((r) => getter(r) && !personIds.has(getter(r))).length;
    if (orphans) warnings.push(`${key}: ${orphans} record(s) reference a person who is no longer in the roster`);
  }

  return { state, warnings };
}


/**
 * Schema v37 — named structural policy experiments.
 *
 * Only the levers, the horizon and the leader's own falsifiable expectation are
 * stored. Validation is deliberately strict about meaning: an experiment that
 * moves no lever is rejected, an owner who no longer exists is cleared rather
 * than silently kept, and a retirement is recorded rather than deleted so the
 * history of what was tried survives.
 */
const DYN_LEVER_BOUNDS = {
  hirePerWeek: [0, 10],
  wipCapPct: [0, 60],
  scopeCutPct: [0, 50],
  reworkInvestment: [0, 1],
  delegationShare: [0, 1],
  learningShare: [0, 0.4],
};
const DYN_EXPERIMENT_STATUSES = ['draft', 'adopted', 'retired'];

export function normalizeDynamicsExperiments(raw, state, now, warnings) {
  const activePersonIds = new Set((state.people || []).filter((p) => p.status !== 'archived').map((p) => p.id));
  const seen = new Set();
  const out = [];
  for (const item of asArray({ dynamicsExperiments: raw }, 'dynamicsExperiments', warnings)) {
    if (!isPlainObject(item)) continue;
    const id = str(item.id) || `dyn-${out.length + 1}`;
    if (seen.has(id)) {
      warnings.push(`Dynamics experiments: dropped a duplicate id (${id})`);
      continue;
    }
    const name = str(item.name).replace(/\s+/g, ' ').trim().slice(0, 140);
    if (name.length < 3) {
      warnings.push('Dynamics experiments: dropped an experiment with no usable name');
      continue;
    }
    seen.add(id);
    const levers = {};
    let touched = 0;
    for (const [key, [lo, hi]] of Object.entries(DYN_LEVER_BOUNDS)) {
      const value = Math.min(hi, Math.max(lo, num(item.levers?.[key], 0)));
      levers[key] = Math.round(value * 1000) / 1000;
      if (levers[key] > 0) touched += 1;
    }
    if (!touched) {
      warnings.push(`Dynamics experiments: “${name}” moved no lever, so it was kept as a draft with no policy`);
    }
    let ownerId = str(item.ownerId) || null;
    if (ownerId && !activePersonIds.has(ownerId)) {
      warnings.push(`Dynamics experiments: cleared an owner who is no longer on the active roster (“${name}”)`);
      ownerId = null;
    }
    const createdAt = isoOrNull(item.createdAt) || now;
    const status = DYN_EXPERIMENT_STATUSES.includes(item.status) ? item.status : 'draft';
    let adoptedOn = calendarDayOrNull(item.adoptedOn);
    if (status === 'adopted' && !adoptedOn) {
      // Adoption is a commitment, and a commitment needs a date. Demoting is
      // the honest repair: an undated adoption would let a prediction be
      // frozen retroactively.
      warnings.push(`Dynamics experiments: “${name}” was marked adopted without an adoption date, so it was reopened as a draft`);
    }
    if (status !== 'adopted') adoptedOn = null;
    const predicted = isPlainObject(item.predicted) && status === 'adopted'
      ? {
          endSaturationPct: num(item.predicted.endSaturationPct, null),
          endWipDays: num(item.predicted.endWipDays, null),
          endCapacityPerWeek: num(item.predicted.endCapacityPerWeek, null),
          endDependencyPct: num(item.predicted.endDependencyPct, null),
          horizonWeeks: num(item.predicted.horizonWeeks, null),
          // Schema v38: the do-nothing baseline frozen beside the prediction.
          // Historical experiments adopted before v38 have no baseline, so the
          // value stays null and their checkpoints report absolute error only.
          baseline: isPlainObject(item.predicted.baseline)
            ? {
                endSaturationPct: num(item.predicted.baseline.endSaturationPct, null),
                endWipDays: num(item.predicted.baseline.endWipDays, null),
                endCapacityPerWeek: num(item.predicted.baseline.endCapacityPerWeek, null),
                endDependencyPct: num(item.predicted.baseline.endDependencyPct, null),
              }
            : null,
          frozenAt: isoOrNull(item.predicted.frozenAt),
          engineVersion: str(item.predicted.engineVersion).slice(0, 60),
        }
      : null;
    out.push({
      id,
      name,
      hypothesis: str(item.hypothesis).replace(/\s+/g, ' ').trim().slice(0, 600),
      levers,
      horizonWeeks: clampInt(item.horizonWeeks, 4, 52, 26),
      ownerId,
      checkpointOn: calendarDayOrNull(item.checkpointOn),
      status: status === 'adopted' && !adoptedOn ? 'draft' : status,
      adoptedOn,
      predicted,
      notes: str(item.notes).replace(/\s+/g, ' ').trim().slice(0, 1200),
      createdOn: calendarDayOrNull(item.createdOn) || createdAt.slice(0, 10),
      createdAt,
      updatedAt: isoOrNull(item.updatedAt) || createdAt,
    });
  }
  return out;
}

/* ------------------------------------------------- schema v38 normalizers */

const CAP_POLICY_STATUSES = ['draft', 'adopted', 'retired'];
const DEFAULT_CAP_WEIGHTS = Object.freeze({
  saturation: 0.35, throughput: 0.25, capacity: 0.2, wip: 0.2,
});

function normalizeCapWeights(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const weights = {};
  let total = 0;
  for (const [key, fallback] of Object.entries(DEFAULT_CAP_WEIGHTS)) {
    const value = clampWeight(source[key], fallback);
    weights[key] = value;
    total += value;
  }
  if (total <= 0) return { ...DEFAULT_CAP_WEIGHTS };
  const out = {};
  for (const key of Object.keys(weights)) out[key] = Math.round((weights[key] / total) * 100) / 100;
  return out;
}

/**
 * Schema v38: a funded structural portfolio stores only inputs plus the
 * prediction frozen at adoption. A stored `adopted` status without an adoption
 * date is demoted to a draft, exactly as the dynamics experiment normalizer
 * does — an undated commitment would let a prediction be frozen retroactively.
 */
export function normalizeCapitalPolicies(raw, state, now, warnings) {
  const activePersonIds = new Set((state.people || []).filter((p) => p.status !== 'archived').map((p) => p.id));
  const seen = new Set();
  const out = [];
  for (const item of asArray({ capitalPolicies: raw }, 'capitalPolicies', warnings)) {
    if (!isPlainObject(item)) continue;
    const id = str(item.id) || `cap-${out.length + 1}`;
    if (seen.has(id)) {
      warnings.push(`Capital portfolios: dropped a duplicate id (${id})`);
      continue;
    }
    const name = str(item.name).replace(/\s+/g, ' ').trim().slice(0, 140);
    if (name.length < 3) {
      warnings.push('Capital portfolios: dropped a portfolio with no usable name');
      continue;
    }
    seen.add(id);
    const levers = {};
    let touched = 0;
    for (const [key, [lo, hi]] of Object.entries(DYN_LEVER_BOUNDS)) {
      const value = Math.min(hi, Math.max(lo, num(item.levers?.[key], 0)));
      levers[key] = Math.round(value * 1000) / 1000;
      if (levers[key] > 0) touched += 1;
    }
    if (!touched) {
      warnings.push(`Capital portfolios: “${name}” funds no lever, so it was kept as a draft`);
    }
    let ownerId = str(item.ownerId) || null;
    if (ownerId && !activePersonIds.has(ownerId)) {
      warnings.push(`Capital portfolios: cleared an owner who is no longer on the active roster (“${name}”)`);
      ownerId = null;
    }
    const createdAt = isoOrNull(item.createdAt) || now;
    let status = CAP_POLICY_STATUSES.includes(item.status) ? item.status : 'draft';
    let adoptedOn = calendarDayOrNull(item.adoptedOn);
    if (status === 'adopted' && !adoptedOn) {
      warnings.push(`Capital portfolios: “${name}” was marked adopted without an adoption date, so it was reopened as a draft`);
      status = 'draft';
    }
    if (status !== 'adopted') adoptedOn = null;
    const predicted = isPlainObject(item.predicted) && status === 'adopted'
      ? {
          endSaturationPct: num(item.predicted.endSaturationPct, null),
          endWipDays: num(item.predicted.endWipDays, null),
          endCapacityPerWeek: num(item.predicted.endCapacityPerWeek, null),
          endDependencyPct: num(item.predicted.endDependencyPct, null),
          throughputDays: num(item.predicted.throughputDays, null),
          effort: num(item.predicted.effort, null),
          horizonWeeks: num(item.predicted.horizonWeeks, null),
          baseline: isPlainObject(item.predicted.baseline)
            ? {
                endSaturationPct: num(item.predicted.baseline.endSaturationPct, null),
                endWipDays: num(item.predicted.baseline.endWipDays, null),
                endCapacityPerWeek: num(item.predicted.baseline.endCapacityPerWeek, null),
                endDependencyPct: num(item.predicted.baseline.endDependencyPct, null),
              }
            : null,
          attribution: Array.isArray(item.predicted.attribution)
            ? item.predicted.attribution.filter(isPlainObject).slice(0, 8).map((row) => ({
                key: str(row.key).slice(0, 40),
                label: str(row.label).slice(0, 120),
                marginal: num(row.marginal, null),
                sharePct: num(row.sharePct, null),
              }))
            : [],
          trustGrade: str(item.predicted.trustGrade).slice(0, 40) || null,
          trustLabel: str(item.predicted.trustLabel).slice(0, 80) || null,
          trustMeaning: str(item.predicted.trustMeaning).slice(0, 400) || null,
          frozenAt: isoOrNull(item.predicted.frozenAt),
          engineVersion: str(item.predicted.engineVersion).slice(0, 60),
        }
      : null;
    out.push({
      id,
      name,
      hypothesis: str(item.hypothesis).replace(/\s+/g, ' ').trim().slice(0, 600),
      levers,
      budgetUnits: clampInt(item.budgetUnits, 1, 40, 12),
      weights: normalizeCapWeights(item.weights),
      horizonWeeks: clampInt(item.horizonWeeks, 4, 52, 26),
      ownerId,
      checkpointOn: calendarDayOrNull(item.checkpointOn),
      status,
      adoptedOn,
      predicted,
      notes: str(item.notes).replace(/\s+/g, ' ').trim().slice(0, 1200),
      createdOn: calendarDayOrNull(item.createdOn) || createdAt.slice(0, 10),
      createdAt,
      updatedAt: isoOrNull(item.updatedAt) || createdAt,
    });
  }
  return out;
}

/**
 * Schema v38: a checkpoint is an observation, not a verdict. The stored score is
 * therefore re-derived from the recorded observation and the subject's frozen
 * prediction on every load; a hand-edited skill value cannot survive a reload.
 * One checkpoint per subject per date is allowed — two observations on the same
 * day are one observation, and counting both would inflate the sample.
 */
export function normalizeDynamicsCheckpoints(raw, state, now, warnings) {
  const policies = new Map((state.capitalPolicies || []).map((row) => [row.id, row]));
  const experiments = new Map((state.dynamicsExperiments || []).map((row) => [row.id, row]));
  const seen = new Set();
  const seenSubjectDate = new Set();
  const out = [];
  for (const item of asArray({ dynamicsCheckpoints: raw }, 'dynamicsCheckpoints', warnings)) {
    if (!isPlainObject(item)) continue;
    const id = str(item.id) || `chk-${out.length + 1}`;
    if (seen.has(id)) {
      warnings.push(`Checkpoints: dropped a duplicate id (${id})`);
      continue;
    }
    const subjectType = item.subjectType === 'experiment' ? 'experiment' : item.subjectType === 'policy' ? 'policy' : null;
    const subjectId = str(item.subjectId);
    const subject = subjectType === 'policy' ? policies.get(subjectId) : subjectType === 'experiment' ? experiments.get(subjectId) : null;
    if (!subject) {
      warnings.push(`Checkpoints: dropped a checkpoint whose ${subjectType || 'unknown'} subject no longer exists`);
      continue;
    }
    const recordedOn = calendarDayOrNull(item.recordedOn);
    if (!recordedOn) {
      warnings.push('Checkpoints: dropped an undated checkpoint');
      continue;
    }
    const key = `${subjectType}:${subjectId}:${recordedOn}`;
    if (seenSubjectDate.has(key)) {
      warnings.push(`Checkpoints: dropped a second checkpoint for the same subject on ${recordedOn}`);
      continue;
    }
    const observed = {};
    let recorded = 0;
    for (const stock of CHECKPOINT_STOCKS) {
      const rawValue = item.observed?.[stock.key];
      if (rawValue === '' || rawValue === null || rawValue === undefined) continue;
      const value = Number(rawValue);
      if (!Number.isFinite(value) || value < stock.min || value > stock.max) {
        warnings.push(`Checkpoints: dropped an out-of-range ${stock.key} on ${recordedOn}`);
        continue;
      }
      observed[stock.key] = Math.round(value * 100) / 100;
      recorded += 1;
    }
    if (!recorded) {
      warnings.push(`Checkpoints: dropped a checkpoint with no usable observations (${recordedOn})`);
      continue;
    }
    seen.add(id);
    seenSubjectDate.add(key);
    const createdAt = isoOrNull(item.createdAt) || now;
    out.push({
      id,
      subjectType,
      subjectId,
      recordedOn,
      observed,
      scoring: scoreCheckpoint(subject.predicted, observed),
      note: str(item.note).replace(/\s+/g, ' ').trim().slice(0, 600),
      createdOn: calendarDayOrNull(item.createdOn) || recordedOn,
      createdAt,
    });
  }
  return out.sort((a, b) => String(a.recordedOn).localeCompare(String(b.recordedOn)) || String(a.id).localeCompare(String(b.id)));
}


/**
 * Schema v39 — the Early-Warning Watch ledgers.
 *
 * These normalisers repair rather than trust, and they repair in the *honest*
 * direction. An alert with an unreadable status becomes `open` (a human is
 * asked), never `confirmed` (an action is taken). An alert whose series is not
 * in the registry is dropped, because nothing can be re-derived about it. A
 * verdict without a date takes its detection date and says so in the warnings,
 * because the alternative — inventing "today" — would put a human judgement on
 * a day they never made it. A frozen prediction missing any of its five numbers
 * is dropped entirely: half a prediction is not a prediction, and keeping it
 * would let a later score be computed against a baseline that never existed.
 */
export function normalizeWatchAlerts(raw, state, todayDay, now, warnings) {
  const caseIds = new Set((state.cases || []).map((c) => c && c.id));
  const decisionIds = new Set((state.decisions || []).map((d) => d && d.id));
  const seenIds = new Set();
  const seenKeys = new Set();
  const out = [];
  for (const item of asArray({ watchAlerts: raw }, 'watchAlerts', warnings)) {
    if (!isPlainObject(item)) continue;
    const seriesId = str(item.seriesId).trim();
    if (!EW_SERIES_BY_ID.has(seriesId)) {
      warnings.push('Early-warning alerts: dropped an alert for a series that is not monitored');
      continue;
    }
    let detectedOn = calendarDayOrNull(item.detectedOn);
    if (!detectedOn) {
      warnings.push('Early-warning alerts: dropped an undated alert');
      continue;
    }
    if (detectedOn > todayDay) {
      detectedOn = todayDay;
      warnings.push('Early-warning alerts: clamped a future alert date to today');
    }
    const key = `${seriesId}|${detectedOn}`;
    if (seenKeys.has(key)) {
      warnings.push('Early-warning alerts: dropped a second alert for the same series and day');
      continue;
    }
    seenKeys.add(key);
    const id = str(item.id).trim() || `ew-${out.length + 1}`;
    if (seenIds.has(id)) {
      warnings.push(`Early-warning alerts: dropped a duplicate id (${id})`);
      continue;
    }
    seenIds.add(id);

    let status = EW_ALERT_STATUSES.includes(item.status) ? item.status : 'open';
    if (item.status !== undefined && !EW_ALERT_STATUSES.includes(item.status)) {
      warnings.push('Early-warning alerts: repaired an unrecognised status to open so a human is asked');
    }
    const suppressedReason = status === 'suppressed'
      ? (Object.hasOwn(EW_SUPPRESSION_REASONS, str(item.suppressedReason)) ? str(item.suppressedReason) : 'cooldown')
      : null;

    let triagedOn = calendarDayOrNull(item.triagedOn);
    if (status === 'open' || status === 'suppressed') {
      triagedOn = null;
    } else if (!triagedOn) {
      triagedOn = detectedOn;
      warnings.push('Early-warning alerts: a verdict had no date, so it takes the detection date');
    } else if (triagedOn < detectedOn) {
      triagedOn = detectedOn;
      warnings.push('Early-warning alerts: clamped a verdict date to the detection date');
    }

    let frozen = null;
    if (isPlainObject(item.frozen)) {
      const dueOn = calendarDayOrNull(item.frozen.dueOn);
      const point = item.frozen.point == null || item.frozen.point === '' ? null : finiteOrNull(item.frozen.point);
      const lo = item.frozen.lo == null || item.frozen.lo === '' ? null : finiteOrNull(item.frozen.lo);
      const hi = item.frozen.hi == null || item.frozen.hi === '' ? null : finiteOrNull(item.frozen.hi);
      const baselinePoint = item.frozen.baselinePoint == null || item.frozen.baselinePoint === '' ? null : finiteOrNull(item.frozen.baselinePoint);
      const sigma = item.frozen.sigma == null || item.frozen.sigma === '' ? null : nonNegativeOrNull(item.frozen.sigma);
      if (dueOn && point !== null && lo !== null && hi !== null
        && baselinePoint !== null && sigma !== null && hi >= lo) {
        frozen = { dueOn, point, lo, hi, baselinePoint, sigma,
          method: str(item.frozen.method).slice(0, 40) || 'xmR-centreline' };
      } else {
        warnings.push('Early-warning alerts: dropped an unusable frozen prediction (a prediction with missing numbers cannot be scored)');
      }
    }

    const linkedCaseId = str(item.linkedCaseId).trim();
    const linkedDecisionId = str(item.linkedDecisionId).trim();
    let responseContext = null;
    if (isPlainObject(item.responseContext)) {
      const response = validateWatchResponse(item.responseContext, state, { repairReferences: true });
      if (response.ok) {
        responseContext = response.value;
        if (response.repairedReferences) warnings.push('Watch response: cleared a deleted or inactive reference');
      } else {
        warnings.push(`Watch response: ignored invalid response context (${response.error})`);
      }
    }
    out.push({
      id,
      seriesId,
      detectedOn,
      detectedAt: isoOrNull(item.detectedAt) || now,
      status,
      rule: str(item.rule).slice(0, 40) || null,
      polarity: ['adverse', 'favorable', 'neutral'].includes(item.polarity) ? item.polarity : 'adverse',
      severity: clampInt(item.severity, 1, 4, 3),
      pValue: (() => {
        const p = finiteOrNull(item.pValue);
        return p === null ? null : Math.min(1, Math.max(0, p));
      })(),
      bhRank: Number.isFinite(Number(item.bhRank)) && Number(item.bhRank) >= 1 ? Math.round(Number(item.bhRank)) : null,
      bhThreshold: finiteOrNull(item.bhThreshold),
      m: Number.isFinite(Number(item.m)) && Number(item.m) >= 1 ? Math.round(Number(item.m)) : null,
      q: (() => {
        const q = finiteOrNull(item.q);
        return q === null ? null : Math.min(1, Math.max(0, q));
      })(),
      latestValue: finiteOrNull(item.latestValue),
      mean: finiteOrNull(item.mean),
      unpl: finiteOrNull(item.unpl),
      lnpl: finiteOrNull(item.lnpl),
      sigma: nonNegativeOrNull(item.sigma),
      summary: str(item.summary).replace(/\s+/g, ' ').trim().slice(0, 300),
      frozen,
      triagedOn,
      verdictNote: str(item.verdictNote).replace(/\s+/g, ' ').trim().slice(0, 600),
      responseContext,
      linkedCaseId: linkedCaseId && caseIds.has(linkedCaseId) ? linkedCaseId : null,
      linkedDecisionId: linkedDecisionId && decisionIds.has(linkedDecisionId) ? linkedDecisionId : null,
      suppressedReason,
    });
  }
  return out.sort((a, b) => a.detectedOn.localeCompare(b.detectedOn) || a.id.localeCompare(b.id));
}

export function normalizeWatchForecasts(raw, state, todayDay, now, warnings) {
  const seenIds = new Set();
  const seenKeys = new Set();
  const out = [];
  for (const item of asArray({ watchForecasts: raw }, 'watchForecasts', warnings)) {
    if (!isPlainObject(item)) continue;
    const seriesId = str(item.seriesId).trim();
    if (!EW_SERIES_BY_ID.has(seriesId)) {
      warnings.push('Early-warning forecasts: dropped a prediction for a series that is not monitored');
      continue;
    }
    const issuedOn = calendarDayOrNull(item.issuedOn);
    const dueOn = calendarDayOrNull(item.dueOn);
    if (!issuedOn || !dueOn) {
      warnings.push('Early-warning forecasts: dropped a prediction without an issue or due date');
      continue;
    }
    if (dueOn <= issuedOn) {
      // Preserve historical data, but the report excludes this invalid window.
      warnings.push('Early-warning forecasts: retained an invalid historical timing window as unscorable');
    }
    const method = str(item.method).slice(0, 40) || 'xmR-centreline';
    const key = method === 'xmR-full-week-v2' ? `${seriesId}|${dueOn}|v2` : `${seriesId}|${issuedOn}|legacy`;
    if (seenKeys.has(key)) {
      warnings.push('Early-warning forecasts: dropped a duplicate prediction for the same series and target');
      continue;
    }
    const id = str(item.id).trim() || `ewf-${out.length + 1}`;
    if (seenIds.has(id)) continue;
    const point = item.point == null || item.point === '' ? null : finiteOrNull(item.point);
    const lo = item.lo == null || item.lo === '' ? null : finiteOrNull(item.lo);
    const hi = item.hi == null || item.hi === '' ? null : finiteOrNull(item.hi);
    const baselinePoint = item.baselinePoint == null || item.baselinePoint === '' ? null : finiteOrNull(item.baselinePoint);
    if (point === null || lo === null || hi === null || baselinePoint === null || hi < lo) {
      warnings.push('Early-warning forecasts: dropped a prediction with missing or inverted numbers');
      continue;
    }
    let observation = null;
    if (isPlainObject(item.observation)) {
      const value = item.observation.value === null || item.observation.value === undefined || item.observation.value === ''
        ? null : finiteOrNull(item.observation.value);
      const capturedOn = calendarDayOrNull(item.observation.capturedOn);
      if (method === 'xmR-full-week-v2' && value !== null && capturedOn && capturedOn > dueOn && capturedOn <= todayDay) {
        observation = { value, capturedOn };
      } else {
        warnings.push('Early-warning forecasts: discarded an invalid observation');
      }
    }
    seenKeys.add(key);
    seenIds.add(id);
    out.push({
      id,
      seriesId,
      issuedOn,
      issuedAt: isoOrNull(item.issuedAt) || now,
      dueOn,
      point,
      lo,
      hi,
      baselinePoint,
      sigma: nonNegativeOrNull(item.sigma),
      method,
      observation,
    });
  }
  out.sort((a, b) => a.issuedOn.localeCompare(b.issuedOn) || a.seriesId.localeCompare(b.seriesId));
  if (out.length > EW_MAX_FORECASTS) {
    warnings.push(`Early-warning forecasts: pruned ${out.length - EW_MAX_FORECASTS} of the oldest frozen predictions (the ledger is capped at ${EW_MAX_FORECASTS})`);
    return out.slice(-EW_MAX_FORECASTS);
  }
  return out;
}


/**
 * Schema v47: one declared scorecard.
 *
 * The record stores ONLY what a human declared — the tasks, the parameters, the
 * prediction frozen at commit and the observation recorded at review. Every
 * modelled number (effort shares, Goodhart indices, redesign values) is derived
 * from those inputs on read, so a stored figure can never drift away from the
 * declaration that produced it.
 */
function normalizeScorecards(raw, state, now, warnings) {
  const list = asArray({ scorecards: raw }, 'scorecards', warnings);
  const personIds = new Set((state.people || []).map((p) => p.id));
  const out = [];
  const seen = new Set();

  const cleanPrediction = (prediction) => {
    if (!isPlainObject(prediction)) return null;
    const numberOrNull = (value, min = -1e9, max = 1e9) => {
      const n = Number(value);
      return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : null;
    };
    const worst = isPlainObject(prediction.worstMetric)
      ? {
          id: str(prediction.worstMetric.id).slice(0, 80),
          name: str(prediction.worstMetric.name).slice(0, 160),
          goodhartIndex: numberOrNull(prediction.worstMetric.goodhartIndex, 0, 100),
        }
      : null;
    return {
      engineVersion: str(prediction.engineVersion).slice(0, 60) || 'unknown',
      efficiencyPct: numberOrNull(prediction.efficiencyPct, 0, 100),
      valueDelivered: numberOrNull(prediction.valueDelivered, 0, 1000),
      gamingSharePct: numberOrNull(prediction.gamingSharePct, 0, 100),
      unmeasuredNeglectPct: numberOrNull(prediction.unmeasuredNeglectPct, 0, 100),
      riskPremiumPct: numberOrNull(prediction.riskPremiumPct, 0, 100),
      goodhartIndex: numberOrNull(prediction.goodhartIndex, 0, 100),
      worstMetric: worst && worst.name ? worst : null,
      falsifierGamingPct: numberOrNull(prediction.falsifierGamingPct, 0, 100),
      recommendedDesign: str(prediction.recommendedDesign).slice(0, 40) || 'current',
      recommendedLift: numberOrNull(prediction.recommendedLift, -1000, 1000),
    };
  };

  const cleanObservation = (observation, status) => {
    if (!isPlainObject(observation)) return null;
    const recordedOn = calendarDayOrNull(observation.recordedOn);
    if (!recordedOn) return null;
    const pct = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? Math.round(Math.min(100, Math.max(0, n)) * 10) / 10 : null;
    };
    return {
      recordedOn,
      gamingSharePct: pct(observation.gamingSharePct) ?? 0,
      metricMovedPct: pct(observation.metricMovedPct) ?? 0,
      trueOutcomePct: pct(observation.trueOutcomePct) ?? 0,
      note: str(observation.note).trim().slice(0, 600),
      source: ['conversation', 'review', 'metric', 'audit', 'other'].includes(observation.source)
        ? observation.source
        : 'other',
      recordedAt: isoOrNull(observation.recordedAt) || now,
    };
  };

  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (!isPlainObject(item)) continue;
    const title = str(item.title).trim().slice(0, 200);
    if (!title) {
      warnings.push('Scorecards: dropped a record with no title');
      continue;
    }
    const id = str(item.id).trim().slice(0, 80) || `sc-${i}`;
    if (seen.has(id)) {
      warnings.push('Scorecards: dropped a record with a duplicate id');
      continue;
    }
    seen.add(id);

    const tasks = [];
    const taskIds = new Set();
    let droppedTasks = 0;
    for (const row of Array.isArray(item.tasks) ? item.tasks : []) {
      if (!isPlainObject(row)) { droppedTasks += 1; continue; }
      const task = normalizeMeasurementTask(row);
      if (!task.name) { droppedTasks += 1; continue; }
      const taskId = task.id || `task-${tasks.length + 1}`;
      if (taskIds.has(taskId)) { droppedTasks += 1; continue; }
      taskIds.add(taskId);
      tasks.push({ ...task, id: taskId });
      if (tasks.length >= 12) break;
    }
    if (droppedTasks) warnings.push(`Scorecards: dropped ${droppedTasks} task row(s) with no name or a duplicate id on “${title}”`);
    if (!tasks.length) {
      warnings.push(`Scorecards: dropped “${title}” because it declares no tasks`);
      continue;
    }
    const measured = tasks.filter((t) => t.kind === 'measured');
    if (!measured.length) {
      warnings.push(`Scorecards: “${title}” declares no measured task; the lab cannot model an incentive with nothing rewarded`);
      continue;
    }
    // Declared weights are renormalized on read, but a card where every
    // measured weight is zero is reported rather than silently equal-weighted.
    if (measured.every((t) => t.weightPct === 0)) {
      warnings.push(`Scorecards: “${title}” declares no reward weight on any measured task; the lab equal-weights them and says so`);
    }

    const params = normalizeMeasurementParams(item);
    const status = MEASUREMENT_STATUSES.includes(item.status) ? item.status : 'draft';
    const frozenRaw = isPlainObject(item.frozen) ? item.frozen : null;
    const prediction = frozenRaw ? cleanPrediction(frozenRaw.prediction) : null;
    const frozen = prediction
      ? { at: isoOrNull(frozenRaw.at) || now, prediction }
      : null;
    const observation = cleanObservation(item.observation);

    out.push({
      id,
      title,
      objective: str(item.objective).trim().slice(0, 600),
      ownerId: personIds.has(item.ownerId) ? item.ownerId : null,
      status,
      ...params,
      reviewOn: calendarDayOrNull(item.reviewOn),
      tasks,
      frozen,
      observation,
      committedAt: ['committed', 'reviewed'].includes(status) ? isoOrNull(item.committedAt) || now : null,
      reviewedAt: status === 'reviewed' ? isoOrNull(item.reviewedAt) || now : null,
      createdAt: isoOrNull(item.createdAt) || now,
      updatedAt: isoOrNull(item.updatedAt) || now,
      history: (Array.isArray(item.history) ? item.history : [])
        .filter((row) => isPlainObject(row) && typeof row.summary === 'string')
        .slice(-60)
        .map((row) => ({
          at: isoOrNull(row.at) || now,
          type: str(row.type).slice(0, 40) || 'updated',
          summary: str(row.summary).slice(0, 300),
        })),
    });
  }
  return out;
}

/**
 * Migration table. Each entry takes the previous version's object and returns
 * the next one. Migrations add records, nullable context and provenance without
 * changing the storage key, so an existing workspace upgrades in place.
 * Unknown historical dates, snapshots, authorship and source links stay null,
 * never inferred from titles or other text.
 */
export const MIGRATIONS = {
  // 147 → 148: ADR-0186 adds three EMPTY collections and four declared conventions.
  // No demand, band, window or ceiling is back-filled from the change records that
  // already exist: the impacts a change carries say WHO moved, never what the
  // move cost them, and inventing a capacity at upgrade time would fabricate the
  // one declaration this register exists to hold a human to.
  // 149 → 150: ADR-0190 adds three EMPTY ledgers and six declared conventions.
  // No routine is inferred from one-on-ones, meetings, walks or audits already on
  // record: a routine is a standard a leader DECLARED, and inventing one at
  // upgrade time would make people owe slots nobody agreed to.
  149: (v149) => ({
    ...v149,
    schemaVersion: 150,
    standardWorkRoutines: Array.isArray(v149.standardWorkRoutines) ? v149.standardWorkRoutines : [],
    standardWorkChecks: Array.isArray(v149.standardWorkChecks) ? v149.standardWorkChecks : [],
    standardWorkTierActs: Array.isArray(v149.standardWorkTierActs) ? v149.standardWorkTierActs : [],
    settings: { ...(v149.settings || {}), ...normalizeStandardWorkSettings(v149.settings || {}) },
  }),
  // 148 → 149: ADR-0188 adds three EMPTY collections and four declared
  // conventions. A workspace already holds after-action reviews, and every one of
  // them was authored inside a single line. No corroboration, no adoption and no
  // parity verdict is back-filled: inventing agreement at upgrade time is the
  // exact fabrication this register exists to make impossible.
  148: (v148) => ({
    ...v148,
    schemaVersion: 149,
    aarCorroborationRequests: Array.isArray(v148.aarCorroborationRequests) ? v148.aarCorroborationRequests : [],
    aarCorroborationResponses: Array.isArray(v148.aarCorroborationResponses) ? v148.aarCorroborationResponses : [],
    aarAdoptions: Array.isArray(v148.aarAdoptions) ? v148.aarAdoptions : [],
    settings: { ...(v148.settings || {}), ...normalizeAarCorroborationSettings(v148.settings || {}) },
  }),
  147: (v147) => ({
    ...v147,
    schemaVersion: 148,
    changeSaturationActs: Array.isArray(v147.changeSaturationActs) ? v147.changeSaturationActs : [],
    changeSaturationCeilings: Array.isArray(v147.changeSaturationCeilings) ? v147.changeSaturationCeilings : [],
    changeSaturationMarkers: Array.isArray(v147.changeSaturationMarkers) ? v147.changeSaturationMarkers : [],
    settings: { ...(v147.settings || {}), ...normalizeChangeSaturationSettings(v147.settings || {}) },
  }),
  // 146 → 147: ADR-0185 adds two EMPTY append-only ledgers. Existing changes
  // carry no line review requests or first-person answers; no historical
  // coverage is back-filled from the roster or the general change record.
  146: (v146) => ({
    ...v146,
    schemaVersion: 147,
    changeImpactRequests: Array.isArray(v146.changeImpactRequests) ? v146.changeImpactRequests : [],
    changeImpactResponses: Array.isArray(v146.changeImpactResponses) ? v146.changeImpactResponses : [],
  }),
  // 144 → 145: ADR-0182 adds two EMPTY collections and four declared
  // conventions. No switch value changes: a workspace already running with a
  // control off keeps it off, and that pause simply reads `unpermitted` until
  // somebody puts an authority on it. Nothing is fabricated.
  // ADR-0184: additive 145 → 146. An existing workspace has a roster full of
  // levels it reached by some unrecorded history, so all three ledgers start
  // EMPTY — "no move has ever been recorded here", which is a different claim
  // from "nobody has ever been promoted". Nothing is back-filled: a history
  // invented at upgrade time would fabricate the very transition counts this
  // module is careful to earn.
  145: (v145) => ({
    ...v145,
    schemaVersion: 146,
    workforceFlowActs: Array.isArray(v145.workforceFlowActs) ? v145.workforceFlowActs : [],
    workforceFlowTargets: Array.isArray(v145.workforceFlowTargets) ? v145.workforceFlowTargets : [],
    workforceFlowMarkers: Array.isArray(v145.workforceFlowMarkers) ? v145.workforceFlowMarkers : [],
    settings: { ...(v145.settings || {}), ...normalizeWorkforceFlowSettings(v145.settings || {}) },
  }),
  144: (v144) => ({
    ...v144,
    schemaVersion: 145,
    pausePermits: Array.isArray(v144.pausePermits) ? v144.pausePermits : [],
    pausePermitMarkers: Array.isArray(v144.pausePermitMarkers) ? v144.pausePermitMarkers : [],
    settings: { ...(v144.settings || {}), ...normalizePausePermitSettings(v144.settings || {}) },
  }),
  // 143 → 144: ADR-0181 adds two EMPTY collections. No ask, person or reporting
  // line changes and no kind is fabricated: every existing ask reads
  // `not classified` until a manager who reaches the person declares one.
  143: (v143) => ({
    ...v143,
    schemaVersion: 144,
    workTurnActs: Array.isArray(v143.workTurnActs) ? v143.workTurnActs : [],
    workTurnMarkers: Array.isArray(v143.workTurnMarkers) ? v143.workTurnMarkers : [],
  }),
  // 142 → 143: attribution starts empty; no existing ask is guessed onto a line.
  142: (v142) => ({ ...v142, schemaVersion: 143, delegationLineActs: Array.isArray(v142.delegationLineActs) ? v142.delegationLineActs : [], delegationLineMarkers: Array.isArray(v142.delegationLineMarkers) ? v142.delegationLineMarkers : [] }),
  // 141 → 142: ADR-0177 adds two EMPTY collections. No reporting line, share,
  // budget or person changes, and no price is fabricated: every borrowed
  // share-day reads `no agreed price` until two managers sign one.
  141: (v141) => ({
    ...v141,
    schemaVersion: 142,
    transferPriceActs: Array.isArray(v141.transferPriceActs) ? v141.transferPriceActs : [],
    transferPriceMarkers: Array.isArray(v141.transferPriceMarkers) ? v141.transferPriceMarkers : [],
  }),
  // 140 → 141: ADR-0176 adds two EMPTY collections. No requisition, candidate,
  // evidence record or reporting line changes; no line plan is fabricated.
  140: (v140) => ({
    ...v140,
    schemaVersion: 141,
    hiringLinePlans: Array.isArray(v140.hiringLinePlans) ? v140.hiringLinePlans : [],
    hiringLineMarkers: Array.isArray(v140.hiringLineMarkers) ? v140.hiringLineMarkers : [],
  }),
  // 139 → 140: ADR-0164 completes Matrix 1:1 Line Coverage by adding
  // `oneOnOneLineMarkers` (`RULE-OOL-01`). Starts empty on upgrade; existing
  // meetings keep their `heldById: null` rather than fabricating attribution.
  139: (v139) => ({
    ...v139,
    schemaVersion: 140,
    oneOnOneLineMarkers: Array.isArray(v139.oneOnOneLineMarkers) ? v139.oneOnOneLineMarkers : [],
  }),
  // 138 → 139: ADR-0175 adds ONE collection (`matrixRemedies`) and no record.
  // Nothing about an existing pattern, decision, line or owner changes; the
  // migration is an empty append.
  138: (v138) => ({
    ...v138,
    schemaVersion: 139,
    matrixRemedies: Array.isArray(v138.matrixRemedies) ? v138.matrixRemedies : [],
  }),
  // 134 → 135: ADR-0168 adds ONE marker collection and no record. Nothing about an
  // existing readiness rating, review, line or seating changes, so the migration is
  // an empty append and every existing workspace reads exactly as before.
  134: (v134) => ({
    ...v134,
    schemaVersion: 135,
    benchEvidenceMarkers: Array.isArray(v134.benchEvidenceMarkers) ? v134.benchEvidenceMarkers : [],
  }),
  // 135 → 136: ADR-0171 adds the lineIntakes collection. Every existing workspace
  // reads exactly as before: the gate ledger starts empty and every ceiling is
  // re-derived on read from the dated declarations already kept.
  135: (v135) => ({
    ...v135,
    schemaVersion: 136,
    lineIntakes: Array.isArray(v135.lineIntakes) ? v135.lineIntakes : [],
  }),
  // 136 → 137: ADR-0172 adds the benchRegressionReadings and
  // benchRegressionMarkers collections. Every existing workspace reads exactly
  // as before: the watch ledger starts empty (no window has been frozen, so
  // every pair reads `uncomparable` until the scan freezes history) and every
  // pair verdict is re-derived on read.
  136: (v136) => ({
    ...v136,
    schemaVersion: 137,
    benchRegressionReadings: Array.isArray(v136.benchRegressionReadings) ? v136.benchRegressionReadings : [],
    benchRegressionMarkers: Array.isArray(v136.benchRegressionMarkers) ? v136.benchRegressionMarkers : [],
  }),
  // 137 → 138: ADR-0174 adds `doaSchedule` and `doaMarkers` plus clamped DoA
  // ratification conventions. Both ledgers start empty so no standing signing
  // limit is invented from job title or rank on upgrade.
  137: (v137) => ({
    ...v137,
    schemaVersion: 138,
    doaSchedule: Array.isArray(v137.doaSchedule) ? v137.doaSchedule : [],
    doaMarkers: Array.isArray(v137.doaMarkers) ? v137.doaMarkers : [],
    settings: isPlainObject(v137.settings)
      ? { ...v137.settings, ...normalizeDoaSettings(v137.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  // 133 → 134: feedback author attribution is additive. Historical notes stay
  // explicitly unattributed; no manager or room is inferred during migration.
  133: (v133) => ({
    ...v133,
    schemaVersion: 134,
    feedback: Array.isArray(v133.feedback) ? v133.feedback.map((item) => (isPlainObject(item)
      ? { ...item, authoredById: item.authoredById ?? null, authoredByBasis: item.authoredByBasis ?? null, authoredAt: item.authoredAt ?? null }
      : item)) : [],
  }),
  // 132 → 133: ADR-0166 adds ONE marker collection and no record. Nothing about
  // an existing pay decision, review, line or rating changes, so the migration is
  // an empty append and every existing workspace reads exactly as before.
  132: (v132) => ({
    ...v132,
    schemaVersion: 133,
    meritEvidenceMarkers: Array.isArray(v132.meritEvidenceMarkers) ? v132.meritEvidenceMarkers : [],
  }),
  // 131 → 132: no old meeting acquires an invented holder. Preserve any
  // already-present attribution for validation by normalizeState; otherwise
  // its three fields remain explicitly unknown.
  131: (v131) => ({
    ...v131,
    schemaVersion: 132,
    oneOnOnes: Array.isArray(v131.oneOnOnes)
      ? v131.oneOnOnes.map((m) => (isPlainObject(m)
        ? { ...m, heldById: m.heldById ?? null, heldByBasis: m.heldByBasis ?? null, heldByAt: m.heldByAt ?? null }
        : m))
      : [],
    settings: isPlainObject(v131.settings)
      ? { ...v131.settings, ...normalizeOneOnOneLineSettings(v131.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0107: additive 108 → 109. An existing workspace has adopted bundles
  // but NO frozen expectation, so all three ledgers start EMPTY — "no response
  // has been pre-registered here yet", which is a different claim from "every
  // past response was unforecast". Nothing is back-filled: RULE-OLN-01 freezes
  // each adopted bundle on the next root commit or explicit scan, and every
  // score, interval and outside view is derived on read. Inventing a forecast
  // at upgrade time would be hindsight dressed as foresight.
  108: (v108) => ({
    ...v108,
    schemaVersion: 110,
    outcomeContracts: Array.isArray(v108.outcomeContracts) ? v108.outcomeContracts : [],
    outcomeGrades: Array.isArray(v108.outcomeGrades) ? v108.outcomeGrades : [],
    outcomeMarkers: Array.isArray(v108.outcomeMarkers) ? v108.outcomeMarkers : [],
    settings: isPlainObject(v108.settings)
      ? { ...v108.settings, ...normalizeOutcomeSettings(v108.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0108: additive 109 → 110. An existing workspace has decisions but no
  // frozen authority classification, so all four ledgers start EMPTY — "nobody
  // has priced this workspace's authority yet", which is a different claim from
  // "every past call sat at the right rung". Nothing is back-filled:
  // RULE-FIT-01 freezes each open decision on the next root commit or explicit
  // scan, and every price, deficit, share and interval is re-derived on read.
  // Back-filling a classification at upgrade time would pretend a priced
  // judgement happened in the past that no human made.
  109: (v109) => ({
    ...v109,
    schemaVersion: 110,
    fitSnapshots: Array.isArray(v109.fitSnapshots) ? v109.fitSnapshots : [],
    fitProposals: Array.isArray(v109.fitProposals) ? v109.fitProposals : [],
    fitReadings: Array.isArray(v109.fitReadings) ? v109.fitReadings : [],
    fitMarkers: Array.isArray(v109.fitMarkers) ? v109.fitMarkers : [],
    settings: isPlainObject(v109.settings)
      ? { ...v109.settings, ...normalizeFitSettings(v109.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0109: additive 110 → 111. An existing workspace already holds work
  // records that name objectives, but it has never computed WHO can resolve a
  // cross-branch one, so all three ledgers start EMPTY — "no jurisdiction gap
  // has been priced here yet", a different claim from "every objective has a
  // mandate holder". Nothing is back-filled: RULE-JUR-01 detects each gap on
  // the next root work write or explicit scan, and every coalition, cost,
  // interval and grade is re-derived on read. Back-filling a governance finding
  // at upgrade time would pretend a boundary decision happened in the past that
  // no human made.
  110: (v110) => ({
    ...v110,
    schemaVersion: 111,
    jurFindings: Array.isArray(v110.jurFindings) ? v110.jurFindings : [],
    jurReadings: Array.isArray(v110.jurReadings) ? v110.jurReadings : [],
    jurMarkers: Array.isArray(v110.jurMarkers) ? v110.jurMarkers : [],
    settings: isPlainObject(v110.settings)
      ? { ...v110.settings, ...normalizeJurSettings(v110.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0118: additive 112 → 113. An existing workspace has reviewed action
  // bundles and rehearsed them one at a time, but it has never recorded a
  // side-by-side arbitration, so the ledger starts EMPTY — "no portfolio
  // response has been compared here yet", which is a different claim from
  // "every choice between alternatives was justified". Nothing is back-filled:
  // a comparison is only valid for the revision and day it was rehearsed on, so
  // inventing one at upgrade time would fabricate evidence that never existed.
  112: (v112) => ({
    ...v112,
    schemaVersion: 113,
    portfolioComparisons: Array.isArray(v112.portfolioComparisons) ? v112.portfolioComparisons : [],
  }),
  // ADR-0121: additive 113 → 114. An existing workspace has duty lines
  // declared (they were always derived from the altitude table) but has never
  // declared a stand-in for any of them, so the cover ledger starts EMPTY.
  // "No duty here has a declared cover yet" is a different claim from "every
  // duty is covered", and inventing a cover at upgrade time would fabricate a
  // responsibility no human accepted. Exercise, eligibility and concentration
  // are derived from records that already exist, so nothing needs back-filling.
  113: (v113) => ({
    ...v113,
    schemaVersion: 114,
    dutyCovers: Array.isArray(v113.dutyCovers) ? v113.dutyCovers : [],
    dutyCoverageMarkers: Array.isArray(v113.dutyCoverageMarkers) ? v113.dutyCoverageMarkers : [],
    settings: isPlainObject(v113.settings)
      ? { ...v113.settings, ...normalizeDutyCoverageSettings(v113.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0122: additive 114 → 115. An existing workspace may hold declared
  // covers but has never declared an absence window, so the absence ledger
  // starts EMPTY. "No absence has been declared here yet" is a different claim
  // from "every absence is covered", and inventing an absence at upgrade time
  // would make every declared cover read as unavailable on dates no human
  // declared. Availability, conflict and cascade are derived from the records
  // that already exist, so nothing needs back-filling.
  114: (v114) => ({
    ...v114,
    schemaVersion: 115,
    absencePlans: Array.isArray(v114.absencePlans) ? v114.absencePlans : [],
  }),
  // ADR-0127: additive 115 → 116. An existing workspace holds declared covers it
  // has never asked anyone to acknowledge, so the answer ledger starts EMPTY.
  // "Nobody has answered yet" is a different claim from "everyone agreed", and
  // back-filling an acceptance at upgrade time would fabricate the consent that
  // this module exists to record. Every pre-existing cover therefore reads
  // `awaiting` or `overdue` the moment the workspace opens, which is the truthful
  // state: the ask has been outstanding since the day it was declared.
  // The two new conventions are clamped in at upgrade time so the printed numbers
  // exist before anyone re-declares them.
  115: (v115) => ({
    ...v115,
    schemaVersion: 116,
    dutyStandbyAnswers: Array.isArray(v115.dutyStandbyAnswers) ? v115.dutyStandbyAnswers : [],
    settings: isPlainObject(v115.settings)
      ? { ...v115.settings, ...normalizeDutyStandbySettings(v115.settings, DUTY_STANDBY_BOUNDS, DUTY_STANDBY_DEFAULTS) }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0128: additive 116 → 117. An existing workspace may hold declared covers
  // whose exercise was only ever INFERRED from dated work, but no cover has an
  // explicit rehearsal attestation, so the ledger starts EMPTY. "No rehearsal was
  // recorded here yet" is a different claim from "every cover is rehearsed", and
  // back-filling an attestation at upgrade time would fabricate the observation
  // this module exists to record. Every pre-existing exercise reading therefore
  // stays exactly what ADR-0125 made it — inferred, and printed as inferred —
  // until a seat that was there records the practice itself. Nothing to clamp:
  // the module adds no convention, only a ledger and two derived statuses.
  116: (v116) => ({
    ...v116,
    schemaVersion: 117,
    dutyRehearsals: Array.isArray(v116.dutyRehearsals) ? v116.dutyRehearsals : [],
  }),
  // ADR-0129: additive 117 → 118. An existing workspace may hold withheld branch
  // cells it has never asked a single question about, so both ledgers start
  // EMPTY. "No reading has been requested here yet" is a different claim from
  // "every branch is holding", and back-filling an ask or an answer at upgrade
  // time would fabricate both a question nobody asked and a disclosure nobody
  // authorised. Every withheld cell therefore opens reading `not-asked`, which
  // is the truthful state and is printed as such rather than as a blank. The two
  // new conventions are clamped in so the printed windows exist before anyone
  // re-declares them; a value already set survives, clamped to its bound.
  117: (v117) => ({
    ...v117,
    schemaVersion: 118,
    branchReadingAsks: Array.isArray(v117.branchReadingAsks) ? v117.branchReadingAsks : [],
    branchReadings: Array.isArray(v117.branchReadings) ? v117.branchReadings : [],
    settings: isPlainObject(v117.settings)
      ? { ...v117.settings, ...normalizeDutyCoverageSettings(v117.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0140: additive 118 → 119. An existing workspace has never declared a
  // second reporting line, so both ledgers start EMPTY — "this organisation is
  // recorded as a single chain of command", which is a different claim from
  // "nobody here reports to two managers". The three conventions are clamped in
  // at upgrade time so the printed numbers exist before anyone re-declares
  // them; no line, no allocation and no decision right is invented, because an
  // accountability invented at upgrade time is an accountability nobody
  // accepted.
  118: (v118) => ({
    ...v118,
    schemaVersion: 119,
    reportingLines: Array.isArray(v118.reportingLines) ? v118.reportingLines : [],
    matrixMarkers: Array.isArray(v118.matrixMarkers) ? v118.matrixMarkers : [],
    settings: isPlainObject(v118.settings)
      ? { ...v118.settings, ...normalizeMatrixSettings(v118.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0143: additive 119 → 120. An existing workspace has never opened a
  // cross-line arbitration, so both ledgers start EMPTY — "no cross-line
  // contention has been declared here", which is a different claim from "no two
  // managers have ever disagreed". The three conventions are clamped in so the
  // printed numbers exist before anyone re-declares them. No case, no demand, no
  // order and no obligation is invented: a precedence back-filled at upgrade time
  // would be a decision no arbiter made, and it would issue work to somebody who
  // never received it.
  119: (v119) => ({
    ...v119,
    schemaVersion: 120,
    priorityArbitrations: Array.isArray(v119.priorityArbitrations) ? v119.priorityArbitrations : [],
    priorityArbitrationMarkers: Array.isArray(v119.priorityArbitrationMarkers) ? v119.priorityArbitrationMarkers : [],
    settings: isPlainObject(v119.settings)
      ? { ...v119.settings, ...normalizePrioritySettings(v119.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0144: additive 120 → 121. An existing workspace has never declared a
  // line charter, so all three ledgers start EMPTY — "no charter has been
  // declared here", which is a different claim from "no two charters conflict".
  // The four conventions are clamped in so the printed numbers exist before
  // anyone re-declares them. No charter, no finding and no ruling is invented: a
  // charter back-filled at upgrade time would be an accountability nobody
  // accepted, and a finding derived from it would be a contradiction nobody has.
  120: (v120) => ({
    ...v120,
    schemaVersion: 121,
    lineMandates: Array.isArray(v120.lineMandates) ? v120.lineMandates : [],
    contradictionReviews: Array.isArray(v120.contradictionReviews) ? v120.contradictionReviews : [],
    contradictionMarkers: Array.isArray(v120.contradictionMarkers) ? v120.contradictionMarkers : [],
    settings: isPlainObject(v120.settings)
      ? { ...v120.settings, ...normalizeContradictionSettings(v120.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0147: additive 121 → 122. No collection is added and nothing is
  // back-filled. Every EXISTING review gains an empty `stewardship`
  // {requests, answers} so the read model can distinguish "nobody asked this
  // line" from "this review predates the question" — and the honest reading of an
  // upgraded workspace is the former, because no human has asked anybody yet. A
  // request invented at upgrade time would print as a promise somebody made; an
  // answer invented at upgrade time would be words nobody said. The two new
  // conventions are clamped in so the printed answer window exists before anyone
  // re-declares it.
  // ADR-0148: additive 122 → 123. An existing workspace has declared lines but
  // has never recorded an acceptance of one, so both ledgers start EMPTY — "no
  // declared share has been answered yet", which is a different claim from
  // "every manager agreed". The three conventions are clamped in so the printed
  // windows exist before anyone re-declares them. No acceptance, no
  // acknowledgement and no expiry is invented: consent back-filled at upgrade
  // time would be an agreement nobody made, and an acknowledgement back-filled
  // at upgrade time would be a person recorded as told when they were not.
  // ADR-0151: additive 125 → 126. No collection is added and no answer is
  // re-rated. Existing reviews whose lines already answered gain no signal —
  // they read `unrated-pair` rather than a false divergence, because a signal
  // back-filled at upgrade time would be a coarse judgement the line holder
  // never made, and re-rating a packet that was signed without it would make
  // the record claim a comparison that never happened. The three new
  // conventions are clamped in so the printed floor exists before anyone
  // re-declares it.
  // ADR-0153: additive 127 → 128. No collection is added, no brief is rewritten
  // and no mark is invented for one. Existing briefs gain the three OPTIONAL role
  // marks as EMPTY — a domain set nobody declared, no decision right, no criteria
  // standing — so every upgraded line reads `unscoped-line` in the Role Clarity
  // lens instead of a plausible comparison nobody made. A mark back-filled at
  // upgrade time would be a coarse judgement the line holder never declared.
  // ADR-0157: additive 128 → 129. No collection is added to an existing
  // workspace's answers and none is re-pointed. The answer ledger starts EMPTY,
  // which reads as "no line has ever been re-affirmed" — the honest state of a
  // workspace that upgraded: a renewal back-filled at upgrade time would be an
  // agreement nobody gave, and a term invented by a migration is precisely the
  // inheritance-by-silence this module exists to name. The three new conventions
  // are clamped in so the printed windows exist before anyone re-declares them.
  // ADR-0159: additive 129 → 130. No frozen record is touched and no settlement
  // is back-filled. Both ledgers start EMPTY so every drifted frozen decision
  // honestly reads `unsettled` until a human with current matrix standing
  // stands behind it or refers it to a governed re-decision.
  // ADR-0162: additive 130 → 131. No bilateral management-interface agreement
  // is invented or backfilled on upgrade: both ledgers start EMPTY so every
  // active counterpart pair honestly reads `unagreed` (or `structurally-unresolvable`
  // on a diamond tie) until both counterparts sign dated terms.
  130: (v130) => ({
    ...v130,
    schemaVersion: 131,
    matrixInterfaceAgreements: Array.isArray(v130.matrixInterfaceAgreements) ? v130.matrixInterfaceAgreements : [],
    matrixInterfaceMarkers: Array.isArray(v130.matrixInterfaceMarkers) ? v130.matrixInterfaceMarkers : [],
    settings: isPlainObject(v130.settings)
      ? { ...v130.settings, ...normalizeMatrixInterfaceSettings(v130.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  129: (v129) => ({
    ...v129,
    schemaVersion: 130,
    authorityReaffirmations: Array.isArray(v129.authorityReaffirmations) ? v129.authorityReaffirmations : [],
    authorityReaffirmationMarkers: Array.isArray(v129.authorityReaffirmationMarkers) ? v129.authorityReaffirmationMarkers : [],
    settings: isPlainObject(v129.settings)
      ? { ...v129.settings, ...normalizeAuthorityReaffirmationSettings(v129.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  128: (v128) => ({
    ...v128,
    schemaVersion: 129,
    lineReaffirmations: Array.isArray(v128.lineReaffirmations) ? v128.lineReaffirmations : [],
    lineReaffirmationMarkers: Array.isArray(v128.lineReaffirmationMarkers) ? v128.lineReaffirmationMarkers : [],
    settings: isPlainObject(v128.settings)
      ? { ...v128.settings, ...normalizeLineReaffirmationSettings(v128.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  127: (v127) => ({
    ...v127,
    schemaVersion: 128,
    onboardingLineBriefs: Array.isArray(v127.onboardingLineBriefs)
      ? v127.onboardingLineBriefs.map((brief) => (isPlainObject(brief)
          ? { ...brief, domains: [], decisionRight: '', criteria: '' }
          : brief))
      : [],
  }),
  // ADR-0152: additive 126 → 127. No collection is added to an existing
  // workspace's obligations and none is re-pointed. The remedy ledger starts
  // EMPTY, which reads as "no ended line has been adjudicated yet" — the honest
  // state of a workspace that upgraded: an obligation retired at upgrade time
  // would be a promise closed by a migration, and a carry back-filled at upgrade
  // time would be work handed to a manager who never took it. The one new
  // convention is clamped in so the printed settlement window exists before
  // anyone re-declares it.
  126: (v126) => ({
    ...v126,
    schemaVersion: 127,
    lineExitRemedies: Array.isArray(v126.lineExitRemedies) ? v126.lineExitRemedies : [],
    lineExitMarkers: Array.isArray(v126.lineExitMarkers) ? v126.lineExitMarkers : [],
    settings: isPlainObject(v126.settings)
      ? { ...v126.settings, ...normalizeLineExitSettings(v126.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  125: (v125) => ({
    ...v125,
    schemaVersion: 126,
    reviews: Array.isArray(v125.reviews)
      ? v125.reviews.map((review) => (isPlainObject(review)
          ? { ...review, stewardship: normalizeReviewStewardship(review.stewardship, []) }
          : review))
      : [],
    settings: isPlainObject(v125.settings)
      ? { ...v125.settings, ...normalizeAssessmentReconciliationSettings(v125.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0150: additive 124 → 125. An existing workspace has plans and declared
  // lines but no line brief of any kind, so the ledger starts EMPTY — "no line has
  // written its onboarding brief yet", which is a different claim from "every line
  // agreed". A brief back-filled at upgrade time would be words nobody said, and an
  // acknowledgement back-filled at upgrade time would be a person recorded as
  // having agreed to something they were never shown. The two conventions are
  // clamped in so the printed windows exist before anyone re-declares them.
  124: (v124) => ({
    ...v124,
    schemaVersion: 125,
    onboardingLineBriefs: Array.isArray(v124.onboardingLineBriefs) ? v124.onboardingLineBriefs : [],
    onboardingLineBriefMarkers: Array.isArray(v124.onboardingLineBriefMarkers) ? v124.onboardingLineBriefMarkers : [],
    settings: isPlainObject(v124.settings)
      ? { ...v124.settings, ...normalizeOnboardingMatrixSettings(v124.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  123: (v123) => ({
    ...v123,
    schemaVersion: 124,
    structureHistory: Array.isArray(v123.structureHistory) ? v123.structureHistory : [],
    structureHistoryMarkers: Array.isArray(v123.structureHistoryMarkers) ? v123.structureHistoryMarkers : [],
    settings: isPlainObject(v123.settings)
      ? { ...v123.settings, ...normalizeStructureHistorySettings(v123.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  122: (v122) => ({
    ...v122,
    schemaVersion: 123,
    lineConsents: Array.isArray(v122.lineConsents) ? v122.lineConsents : [],
    lineConsentMarkers: Array.isArray(v122.lineConsentMarkers) ? v122.lineConsentMarkers : [],
    settings: isPlainObject(v122.settings)
      ? { ...v122.settings, ...normalizeLineConsentSettings(v122.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  121: (v121) => ({
    ...v121,
    schemaVersion: 122,
    reviews: Array.isArray(v121.reviews)
      ? v121.reviews.map((review) => (isPlainObject(review)
          ? { ...review, stewardship: normalizeReviewStewardship(review.stewardship, []) }
          : review))
      : [],
    settings: isPlainObject(v121.settings)
      ? { ...v121.settings, ...normalizeReviewStewardshipSettings(v121.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0113: additive 111 → 112. An existing workspace is full of prompts it
  // never classified and has never filed one by hand, so both ledgers start
  // EMPTY — "nothing has been committed to an agenda here yet", which is a
  // different claim from "every prompt was raised". Nothing is back-filled:
  // provenance is DERIVED on read from the declared family table, and a receipt
  // is derived from a 1:1 the human logged before this upgrade. Inventing a
  // filing at upgrade time would record a promise no one made.
  111: (v111) => ({
    ...v111,
    schemaVersion: 112,
    agendaEntries: Array.isArray(v111.agendaEntries) ? v111.agendaEntries : [],
    agendaMarkers: Array.isArray(v111.agendaMarkers) ? v111.agendaMarkers : [],
    settings: isPlainObject(v111.settings)
      ? { ...v111.settings, ...normalizeAgendaSettings(v111.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0099: additive 100 → 101. No freeze line is inferred for an existing
  // workspace and no continuity reading is back-filled: every committed design
  // is DETECTED on read as a freeze line, and the frozen reading ledger starts
  // empty, which honestly means "no continuity reading has been frozen yet".
  // Existing settings are preserved and the new keys get declared defaults.
  // ADR-0100: additive 101 → 102. An existing workspace has not calibrated a
  // ladder, so all three ledgers start empty — an empty ledger means "nobody has
  // measured the ladder here yet", a different claim from "the ladder is right".
  // No adoption is invented: `chainAdoptedHorizons` is null, which is the declared
  // table, so every existing escalation clock reads exactly as it did on v101.
  // ADR-0101: additive 102 → 103. An existing workspace has not recorded a
  // reputational act by hand and has not offered a guarantee, so all three
  // ledgers start EMPTY — an empty ledger means "nobody has priced a promise here
  // yet", a different claim from "everyone is solvent". `reputationActs` is NOT
  // back-filled from the delegation ledger: a back-filled act would look like a
  // human judgement this upgrade never made, and the harvester re-reads those
  // records on every render anyway.
  // ADR-0102: additive 103 → 104. An existing workspace has decisions but no
  // locks, so both ledgers start EMPTY — an empty ledger means "no information
  // set has been frozen here yet", which is a different claim from "every
  // decision rested on the full record". Nothing is back-filled: the spine
  // freezes every decision on the next commit and every figure is derived on
  // read, so a back-filled lock at upgrade time would only pretend the freeze
  // happened when it did not.
  // ADR-0104: additive 105 → 106. An existing workspace has decisions but no
  // frozen frontiers, so all four ledgers start EMPTY — "no knowable set has
  // been frozen here yet", a different claim from "every decision was fully
  // diligent". Nothing is back-filled: RULE-DLG-01 freezes each decision on
  // the next commit, and every interval, band and grade is derived on read.
  // Inventing a frontier at upgrade time would pretend a look happened in the
  // past that the record cannot prove.
  // ADR-0105: additive, empty on upgrade. No historical note is reclassified,
  // and no existing case is pretending to have passed a human review it never had.
  107: (v107) => ({
    ...v107,
    schemaVersion: 108,
    // Additive proof fields. Empty means unmeasured, never a fabricated completion.
    oneOnOnes: Array.isArray(v107.oneOnOnes) ? v107.oneOnOnes.map((m) => m && typeof m === 'object' ? { ...m, resolvedTopics: Array.isArray(m.resolvedTopics) ? m.resolvedTopics : [] } : m) : [],
    actionBundles: Array.isArray(v107.actionBundles) ? v107.actionBundles.map((b) => b && typeof b === 'object' ? { ...b, execution: b.execution ?? null } : b) : [],
  }),
  106: (v106) => ({ ...v106, schemaVersion: 107, missionCaptures: Array.isArray(v106.missionCaptures) ? v106.missionCaptures : [] }),
  105: (v105) => ({
    ...v105,
    schemaVersion: 106,
    diligenceChecklists: Array.isArray(v105.diligenceChecklists) ? v105.diligenceChecklists : [],
    diligenceConsults: Array.isArray(v105.diligenceConsults) ? v105.diligenceConsults : [],
    diligenceGrades: Array.isArray(v105.diligenceGrades) ? v105.diligenceGrades : [],
    diligenceMarkers: Array.isArray(v105.diligenceMarkers) ? v105.diligenceMarkers : [],
    settings: isPlainObject(v105.settings)
      ? { ...v105.settings, ...normalizeDiligenceSettings(v105.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  104: (v104) => ({
    ...v104,
    schemaVersion: 105,
    epistemicUnknowns: Array.isArray(v104.epistemicUnknowns) ? v104.epistemicUnknowns : [],
    epistemicObservations: Array.isArray(v104.epistemicObservations) ? v104.epistemicObservations : [],
    epistemicGrades: Array.isArray(v104.epistemicGrades) ? v104.epistemicGrades : [],
    epistemicMarkers: Array.isArray(v104.epistemicMarkers) ? v104.epistemicMarkers : [],
    settings: isPlainObject(v104.settings)
      ? { ...v104.settings, ...normalizeEpistemicSettings(v104.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  103: (v103) => ({
    ...v103,
    schemaVersion: 104,
    decisionLocks: Array.isArray(v103.decisionLocks) ? v103.decisionLocks : [],
    decisionLockMarkers: Array.isArray(v103.decisionLockMarkers) ? v103.decisionLockMarkers : [],
    settings: isPlainObject(v103.settings)
      ? { ...v103.settings, ...normalizeHindsightSettings(v103.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  102: (v102) => ({
    ...v102,
    schemaVersion: 103,
    reputationActs: Array.isArray(v102.reputationActs) ? v102.reputationActs : [],
    reputationPositions: Array.isArray(v102.reputationPositions) ? v102.reputationPositions : [],
    reputationMarkers: Array.isArray(v102.reputationMarkers) ? v102.reputationMarkers : [],
    settings: isPlainObject(v102.settings)
      ? { ...v102.settings, ...normalizeReputationSettings(v102.settings) }
      : { ...DEFAULT_SETTINGS },
  }),
  101: (v101) => ({
    ...v101,
    schemaVersion: 102,
    spanReadings: Array.isArray(v101.spanReadings) ? v101.spanReadings : [],
    spanAdoptions: Array.isArray(v101.spanAdoptions) ? v101.spanAdoptions : [],
    spanMarkers: Array.isArray(v101.spanMarkers) ? v101.spanMarkers : [],
    settings: isPlainObject(v101.settings)
      ? {
        ...v101.settings,
        spanCalibrationCoveragePct: v101.settings.spanCalibrationCoveragePct ?? 85,
        spanCalibrationDecidedFloor: v101.settings.spanCalibrationDecidedFloor ?? 8,
        spanCalibrationCensoringPct: v101.settings.spanCalibrationCensoringPct ?? 60,
        spanCalibrationRiskFloor: v101.settings.spanCalibrationRiskFloor ?? 3,
        spanCalibrationCellFloor: v101.settings.spanCalibrationCellFloor ?? 3,
        spanCalibrationMaxWidthPct: v101.settings.spanCalibrationMaxWidthPct ?? 45,
        spanCalibrationReviewDays: v101.settings.spanCalibrationReviewDays ?? 90,
        spanCalibrationAdoptMinPct: v101.settings.spanCalibrationAdoptMinPct ?? 25,
        spanCalibrationAdoptMaxPct: v101.settings.spanCalibrationAdoptMaxPct ?? 400,
        spanCalibrationBandPct: v101.settings.spanCalibrationBandPct ?? 90,
        spanCalibrationAutoPropagate: v101.settings.spanCalibrationAutoPropagate !== false,
        chainAdoptedHorizons: v101.settings.chainAdoptedHorizons ?? null,
        chainAdoptedOn: v101.settings.chainAdoptedOn ?? null,
        chainAdoptedReadingId: v101.settings.chainAdoptedReadingId ?? null,
      }
      : { ...DEFAULT_SETTINGS },
  }),
  100: (v100) => ({
    ...v100,
    schemaVersion: 101,
    freezeReadings: Array.isArray(v100.freezeReadings) ? v100.freezeReadings : [],
    freezeMarkers: Array.isArray(v100.freezeMarkers) ? v100.freezeMarkers : [],
    settings: isPlainObject(v100.settings)
      ? {
        ...v100.settings,
        freezeLineWindowDays: v100.settings.freezeLineWindowDays ?? 30,
        freezeLineMinEdges: v100.settings.freezeLineMinEdges ?? 3,
        freezeLineCellFloor: v100.settings.freezeLineCellFloor ?? 3,
        freezeLineDropPct: v100.settings.freezeLineDropPct ?? 15,
        freezeLineAutoPropagate: v100.settings.freezeLineAutoPropagate !== false,
      }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0098: additive 99 → 100. No historical clearing decision is inferred;
  // upgraded workspaces start with empty clearing ledgers and only the declared
  // conventions. Existing settings are preserved and new keys get defaults.
  99: (v99) => ({
    ...v99,
    schemaVersion: 100,
    clearingRounds: Array.isArray(v99.clearingRounds) ? v99.clearingRounds : [],
    clearingMarkers: Array.isArray(v99.clearingMarkers) ? v99.clearingMarkers : [],
    settings: isPlainObject(v99.settings)
      ? {
        ...v99.settings,
        clearingCellFloor: v99.settings.clearingCellFloor ?? 3,
        clearingReviewDays: v99.settings.clearingReviewDays ?? 14,
        clearingAutoPropagate: v99.settings.clearingAutoPropagate !== false,
        clearingMaxCombinations: v99.settings.clearingMaxCombinations ?? 250000,
        clearingNodeBudget: v99.settings.clearingNodeBudget ?? 350000,
        clearingMixImbalanceHighPct: v99.settings.clearingMixImbalanceHighPct ?? 85,
        clearingMixImbalanceLowPct: v99.settings.clearingMixImbalanceLowPct ?? 50,
      }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0097: additive 98 → 99. No new collection: a plan MAY now carry
  // `supersedesId` (a human-declared revision), an action MAY carry
  // `evidenceInstrumentKey` (which prospective instrument grades its premise),
  // and a frozen solution MAY carry its provenance certificate; every field is
  // optional and fail-closed, so nothing is invented for an existing workspace
  // and no v98-era adoption changes meaning (its legacy certificate reads
  // engine 'enumeration', certified by construction). The only new setting is
  // the declared branch-and-bound node budget, with a printed default.
  98: (v98) => ({
    ...v98,
    schemaVersion: 99,
    settings: isPlainObject(v98.settings)
      ? {
        ...v98.settings,
        robustAllocationNodeBudget: v98.settings.robustAllocationNodeBudget ?? 250000,
      }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0095: additive 97 → 98. An existing workspace has NOT modelled a robust
  // allocation, so both ledgers start empty — an empty ledger means "no
  // allocation has been declared here yet", a different (and honest) claim from
  // "an allocation was solved and funded nothing". No effect range, segment
  // size, solution or commitment is inferred from pre-existing records. Every
  // value below is a declared convention with a printed default.
  97: (v97) => ({
    ...v97,
    schemaVersion: 98,
    robustPlans: Array.isArray(v97.robustPlans) ? v97.robustPlans : [],
    robustMarkers: Array.isArray(v97.robustMarkers) ? v97.robustMarkers : [],
    settings: isPlainObject(v97.settings)
      ? {
        ...v97.settings,
        robustAllocationCellFloor: v97.settings.robustAllocationCellFloor ?? 4,
        robustAllocationReviewDays: v97.settings.robustAllocationReviewDays ?? 14,
        robustAllocationAutoPropagate: v97.settings.robustAllocationAutoPropagate !== false,
        robustAllocationMaxCombinations: v97.settings.robustAllocationMaxCombinations ?? 50000,
      }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0094: additive 96 → 97. An existing workspace has NOT pre-registered
  // anything, so all three ledgers start empty — an empty ledger means "no bet
  // has been frozen here yet", which is a different (and honest) claim from
  // "a bet was frozen and missed". No probability, cohort, outcome or score is
  // inferred from pre-existing cases, delegations, decisions or 1:1s. Every
  // value below is a declared convention with a printed default.
  96: (v96) => ({
    ...v96,
    schemaVersion: 97,
    prospectiveContracts: Array.isArray(v96.prospectiveContracts) ? v96.prospectiveContracts : [],
    prospectiveGrades: Array.isArray(v96.prospectiveGrades) ? v96.prospectiveGrades : [],
    prospectiveMarkers: Array.isArray(v96.prospectiveMarkers) ? v96.prospectiveMarkers : [],
    settings: isPlainObject(v96.settings)
      ? {
        ...v96.settings,
        prospectiveEvidenceFloor: v96.settings.prospectiveEvidenceFloor ?? 3,
        prospectiveCellFloor: v96.settings.prospectiveCellFloor ?? 4,
        prospectiveSkillFloorPct: v96.settings.prospectiveSkillFloorPct ?? 10,
        prospectiveReviewDays: v96.settings.prospectiveReviewDays ?? 14,
        prospectiveAutoPropagate: v96.settings.prospectiveAutoPropagate !== false,
      }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0092: additive 95 → 96. No publication is invented for an existing
  // workspace and no aggregate is retro-audited into the register: an empty
  // register means "nothing has been published from here yet", which is not the
  // same claim as "nothing published was unsafe". Every value below is a
  // convention with a printed default, never inferred history.
  95: (v95) => ({
    ...v95,
    schemaVersion: 96,
    differenceReleases: Array.isArray(v95.differenceReleases) ? v95.differenceReleases : [],
    differenceMarkers: Array.isArray(v95.differenceMarkers) ? v95.differenceMarkers : [],
    settings: isPlainObject(v95.settings)
      ? {
        ...v95.settings,
        differencesCellFloor: v95.settings.differencesCellFloor ?? 3,
        differencesWindowReleases: v95.settings.differencesWindowReleases ?? 12,
        differencesMinPoints: v95.settings.differencesMinPoints ?? 8,
        differencesAutoProtect: v95.settings.differencesAutoProtect !== false,
        differencesAutoPropagate: v95.settings.differencesAutoPropagate !== false,
      }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0090: additive 94 → 95. No carriage is inferred for an existing
  // workspace and no reporting line is touched: every pre-existing edge reads
  // as measured from the artefacts other modules already wrote, and the frozen
  // assessment ledger starts empty.
  94: (v94) => ({
    ...v94,
    schemaVersion: 95,
    federationAssessments: Array.isArray(v94.federationAssessments) ? v94.federationAssessments : [],
    federationMarkers: Array.isArray(v94.federationMarkers) ? v94.federationMarkers : [],
    seatIdentities: Array.isArray(v94.seatIdentities) ? v94.seatIdentities : [],
    identityMarkers: Array.isArray(v94.identityMarkers) ? v94.identityMarkers : [],
    valueStreamContracts: Array.isArray(v94.valueStreamContracts) ? v94.valueStreamContracts : [],
    valueStreamRounds: Array.isArray(v94.valueStreamRounds) ? v94.valueStreamRounds : [],
    valueStreamReallocations: Array.isArray(v94.valueStreamReallocations) ? v94.valueStreamReallocations : [],
    valueStreamMarkers: Array.isArray(v94.valueStreamMarkers) ? v94.valueStreamMarkers : [],
    settings: isPlainObject(v94.settings)
      ? {
        ...v94.settings,
        federationWindowDays: v94.settings.federationWindowDays ?? 30,
        federationMinSpans: v94.settings.federationMinSpans ?? 5,
        federationCellFloor: v94.settings.federationCellFloor ?? 3,
        federationAutoPropagate: v94.settings.federationAutoPropagate !== false,
        identityEnabled: v94.settings.identityEnabled === true,
        identityAutoPropagate: v94.settings.identityAutoPropagate !== false,
        identityEnforced: v94.settings.identityEnforced === true,
        identityIdleMins: v94.settings.identityIdleMins ?? 30,
        valueStreamCellFloor: v94.settings.valueStreamCellFloor ?? 3,
        valueStreamMaxDecisions: v94.settings.valueStreamMaxDecisions ?? 4,
        valueStreamAutoPropagate: v94.settings.valueStreamAutoPropagate !== false,
      }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0089: additive 93 → 94. No history is inferred from current bets or
  // pacts; existing workspaces receive empty prospective-cycle ledgers.
  93: (v93) => ({
    ...v93,
    schemaVersion: 94,
    strategyCycles: Array.isArray(v93.strategyCycles) ? v93.strategyCycles : [],
    strategyCycleMarkers: Array.isArray(v93.strategyCycleMarkers) ? v93.strategyCycleMarkers : [],
    omWorkSplits: Array.isArray(v93.omWorkSplits) ? v93.omWorkSplits : [],
    omEdges: Array.isArray(v93.omEdges) ? v93.omEdges : [],
    omDecisions: Array.isArray(v93.omDecisions) ? v93.omDecisions : [],
    omMarkers: Array.isArray(v93.omMarkers) ? v93.omMarkers : [],
    escalationRecords: Array.isArray(v93.escalationRecords) ? v93.escalationRecords : [],
    escalationCommitments: Array.isArray(v93.escalationCommitments) ? v93.escalationCommitments : [],
    escalationMarkers: Array.isArray(v93.escalationMarkers) ? v93.escalationMarkers : [],
    carryoverRecords: Array.isArray(v93.carryoverRecords) ? v93.carryoverRecords : [],
    carryoverMarkers: Array.isArray(v93.carryoverMarkers) ? v93.carryoverMarkers : [],
    carryoverGradings: Array.isArray(v93.carryoverGradings) ? v93.carryoverGradings : [],
    settings: isPlainObject(v93.settings)
      ? {
        ...v93.settings,
        strategyCycleEvidenceFloor: v93.settings.strategyCycleEvidenceFloor ?? 5,
        strategyCycleCellFloor: v93.settings.strategyCycleCellFloor ?? 3,
        strategyCycleAutoPropagate: v93.settings.strategyCycleAutoPropagate !== false,
        omDeepWorkHoursPerDay: v93.settings.omDeepWorkHoursPerDay ?? 4.5,
        omWorkDaysPerWeek: v93.settings.omWorkDaysPerWeek ?? 5,
        omCoordinationHoursPerWeek: v93.settings.omCoordinationHoursPerWeek ?? 1.5,
        omDelegationHoursPerWeek: v93.settings.omDelegationHoursPerWeek ?? 2.5,
        omAbstentionHoursPerWeek: v93.settings.omAbstentionHoursPerWeek ?? 1.5,
        omEdgeMinutes: v93.settings.omEdgeMinutes ?? 30,
        omReliefWeeks: v93.settings.omReliefWeeks ?? 1.5,
        omAbstentionWeightPct: v93.settings.omAbstentionWeightPct ?? 30,
        omCrossWavePct: v93.settings.omCrossWavePct ?? 25,
        omConcurrentEdges: v93.settings.omConcurrentEdges ?? 2,
        omMaxWave: v93.settings.omMaxWave ?? 16,
        omCellFloor: v93.settings.omCellFloor ?? 3,
        omUtilizationCeilPct: v93.settings.omUtilizationCeilPct ?? 95,
        omContinuityFloor: v93.settings.omContinuityFloor ?? 3,
        omReviewDays: v93.settings.omReviewDays ?? 21,
        omAutoPropagate: v93.settings.omAutoPropagate !== false,
        omLabourRatePerHour: v93.settings.omLabourRatePerHour ?? 60,
        omCurrency: v93.settings.omCurrency ?? 'USD',
        escalationWindowDays: v93.settings.escalationWindowDays ?? 28,
        escalationCellFloor: v93.settings.escalationCellFloor ?? 5,
        escalationYieldFloorPct: v93.settings.escalationYieldFloorPct ?? 60,
        escalationSaturationPct: v93.settings.escalationSaturationPct ?? 85,
        escalationReviewDays: v93.settings.escalationReviewDays ?? 14,
        escalationAutoPropagate: v93.settings.escalationAutoPropagate !== false,
        carryoverCellFloor: v93.settings.carryoverCellFloor ?? 5,
        carryoverReliabilityFloorPct: v93.settings.carryoverReliabilityFloorPct ?? 60,
        carryoverGradingDelayDays: v93.settings.carryoverGradingDelayDays ?? 14,
        carryoverDecisionReviewDays: v93.settings.carryoverDecisionReviewDays ?? 14,
        carryoverAutoPropagate: v93.settings.carryoverAutoPropagate !== false,
      }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0086: additive 91 → 92. No existing record is rewritten. An older
  // workspace simply has an empty release ledger and the declared conventions;
  // the compiler derives every posture from the module manifests, so no stored
  // permission table has to be migrated.
  91: (v91) => ({
    ...v91,
    schemaVersion: 92,
    disclosureGrants: Array.isArray(v91.disclosureGrants) ? v91.disclosureGrants : [],
    disclosureMarkers: Array.isArray(v91.disclosureMarkers) ? v91.disclosureMarkers : [],
    settings: isPlainObject(v91.settings)
      ? {
        ...v91.settings,
        disclosureCellFloor: v91.settings.disclosureCellFloor ?? 5,
        disclosureMaxDays: v91.settings.disclosureMaxDays ?? 30,
        disclosureMaxActiveGrants: v91.settings.disclosureMaxActiveGrants ?? 6,
        disclosureReviewDays: v91.settings.disclosureReviewDays ?? 14,
        disclosureAutoPropagate: v91.settings.disclosureAutoPropagate !== false,
      }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0086: additive 90 → 91. No existing record is rewritten: an older
  // workspace simply has an empty memo ledger and the declared conventions.
  // A memo is only ever created by a human opening one.
  90: (v90) => ({
    ...v90,
    schemaVersion: 91,
    // v90 → 91 was merged from two branches on main; both additive sets belong in
    // the one migration, or an upgraded workspace loses one of them.
    boardMemos: Array.isArray(v90.boardMemos) ? v90.boardMemos : [],
    boardMarkers: Array.isArray(v90.boardMarkers) ? v90.boardMarkers : [],
    carryoverRecords: Array.isArray(v90.carryoverRecords) ? v90.carryoverRecords : [],
    carryoverMarkers: Array.isArray(v90.carryoverMarkers) ? v90.carryoverMarkers : [],
    carryoverGradings: Array.isArray(v90.carryoverGradings) ? v90.carryoverGradings : [],
    settings: isPlainObject(v90.settings)
      ? {
        ...v90.settings,
        boardCellFloor: v90.settings.boardCellFloor ?? 5,
        boardEvidenceFloor: v90.settings.boardEvidenceFloor ?? 4,
        boardMaterialityPct: v90.settings.boardMaterialityPct ?? 10,
        boardRecheckDays: v90.settings.boardRecheckDays ?? 90,
        boardAutoPropagate: v90.settings.boardAutoPropagate !== false,
        carryoverCellFloor: v90.settings.carryoverCellFloor ?? 5,
        carryoverReliabilityFloorPct: v90.settings.carryoverReliabilityFloorPct ?? 60,
        carryoverGradingDelayDays: v90.settings.carryoverGradingDelayDays ?? 14,
        carryoverDecisionReviewDays: v90.settings.carryoverDecisionReviewDays ?? 14,
        carryoverAutoPropagate: v90.settings.carryoverAutoPropagate !== false,
      }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0083: additive 88 → 89. No existing record is rewritten: an older
  // workspace simply has an empty round ledger and the declared conventions.
  // A round is only ever created by a human opening one.
  88: (v88) => ({
    ...v88,
    schemaVersion: 89,
    expectationRounds: Array.isArray(v88.expectationRounds) ? v88.expectationRounds : [],
    concordanceMarkers: Array.isArray(v88.concordanceMarkers) ? v88.concordanceMarkers : [],
    settings: isPlainObject(v88.settings)
      ? {
        ...v88.settings,
        concordanceAgreementFloorPct: v88.settings.concordanceAgreementFloorPct ?? 60,
        concordanceCellFloor: v88.settings.concordanceCellFloor ?? 5,
        concordanceEvidenceFloor: v88.settings.concordanceEvidenceFloor ?? 3,
        concordanceRetestDays: v88.settings.concordanceRetestDays ?? 21,
        concordanceReviewDays: v88.settings.concordanceReviewDays ?? 14,
        concordanceAutoPropagate: v88.settings.concordanceAutoPropagate !== false,
      }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0084: additive 89 → 90. Adds Hoshin Kanri & Catchball Cascade pacts,
  // append-only rounds, idempotency markers, and clamped conventions without
  // fabricating historical cascades.
  89: (v89) => ({
    ...v89,
    schemaVersion: 90,
    catchballPacts: Array.isArray(v89.catchballPacts) ? v89.catchballPacts : [],
    catchballRounds: Array.isArray(v89.catchballRounds) ? v89.catchballRounds : [],
    catchballMarkers: Array.isArray(v89.catchballMarkers) ? v89.catchballMarkers : [],
    settings: isPlainObject(v89.settings)
      ? {
        ...v89.settings,
        catchballWatermelonGapPct: v89.settings.catchballWatermelonGapPct ?? 25,
        catchballLeadingFloorPct: v89.settings.catchballLeadingFloorPct ?? 80,
        catchballLaggingFloorPct: v89.settings.catchballLaggingFloorPct ?? 70,
        catchballThesisRedPct: v89.settings.catchballThesisRedPct ?? 35,
        catchballFloorN: v89.settings.catchballFloorN ?? 5,
        catchballReliabilityFloorPct: v89.settings.catchballReliabilityFloorPct ?? 70,
        catchballCellFloor: v89.settings.catchballCellFloor ?? 3,
        catchballMaxFanout: v89.settings.catchballMaxFanout ?? 4,
        catchballAutoPropagate: v89.settings.catchballAutoPropagate !== false,
      }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0087: additive 92 → 93. The Operating Cadence Clock adds a forum
  // register, a sitting log, frozen readings and idempotency markers. Nothing
  // historical is invented: an upgraded workspace opens with NO forums, because
  // a meeting calendar back-filled from records would claim a cadence the
  // organisation never actually ran.
  92: (v92) => ({
    ...v92,
    schemaVersion: 93,
    cadenceForums: Array.isArray(v92.cadenceForums) ? v92.cadenceForums : [],
    cadenceSessions: Array.isArray(v92.cadenceSessions) ? v92.cadenceSessions : [],
    cadenceReadings: Array.isArray(v92.cadenceReadings) ? v92.cadenceReadings : [],
    cadenceMarkers: Array.isArray(v92.cadenceMarkers) ? v92.cadenceMarkers : [],
    settings: isPlainObject(v92.settings)
      ? {
        ...v92.settings,
        cadenceFloorN: v92.settings.cadenceFloorN ?? 5,
        cadenceCellFloor: v92.settings.cadenceCellFloor ?? 3,
        cadenceUtilisationTargetPct: v92.settings.cadenceUtilisationTargetPct ?? 85,
        cadencePlanningFactorPct: v92.settings.cadencePlanningFactorPct ?? 130,
        cadenceFlowTargetDays: v92.settings.cadenceFlowTargetDays ?? 14,
        cadenceAutoPropagate: v92.settings.cadenceAutoPropagate !== false,
      }
      : { ...DEFAULT_SETTINGS },
  }),
  // ADR-0081: additive 87 → 88. No existing record is rewritten: an older
  // workspace simply has an empty routing ledger and the declared conventions.
  // Normalizers remain fail-closed on malformed rows (see altitudeRouterSchema).
  87: (v87) => ({
    ...v87,
    schemaVersion: 88,
    altitudeRoutingPlans: Array.isArray(v87.altitudeRoutingPlans) ? v87.altitudeRoutingPlans : [],
    altitudeRoutingMarkers: Array.isArray(v87.altitudeRoutingMarkers) ? v87.altitudeRoutingMarkers : [],
    settings: isPlainObject(v87.settings)
      ? {
        ...v87.settings,
        routingEvidenceFloor: v87.settings.routingEvidenceFloor ?? 2.5,
        routingReliabilityFloorPct: v87.settings.routingReliabilityFloorPct ?? 70,
        routingCalibrationFloorN: v87.settings.routingCalibrationFloorN ?? 5,
        routingReviewDays: v87.settings.routingReviewDays ?? 14,
        routingAutoPropagate: v87.settings.routingAutoPropagate !== false,
      }
      : { ...DEFAULT_SETTINGS },
  }),
  85: (v85) => ({
    ...v85, schemaVersion: 86,
    departures: Array.isArray(v85.departures) ? v85.departures : [],
    retentionPlans: Array.isArray(v85.retentionPlans) ? v85.retentionPlans : [],
    settings: isPlainObject(v85.settings)
      ? { ...v85.settings, retentionHorizonDays: v85.settings.retentionHorizonDays ?? 90, retentionRiskThresholdPct: v85.settings.retentionRiskThresholdPct ?? 12, retentionRiskIndexThreshold: v85.settings.retentionRiskIndexThreshold ?? 1.6, retentionEvidenceFloor: v85.settings.retentionEvidenceFloor ?? 10, retentionPriorMonthlyHazardPct: v85.settings.retentionPriorMonthlyHazardPct ?? 1.2, retentionPriorStrengthMonths: v85.settings.retentionPriorStrengthMonths ?? 12, retentionRidge: v85.settings.retentionRidge ?? 2, retentionReplacementPct: v85.settings.retentionReplacementPct ?? 50, retentionPromotionPct: v85.settings.retentionPromotionPct ?? 8, retentionReviewDays: v85.settings.retentionReviewDays ?? 30, retentionAttentionHours: v85.settings.retentionAttentionHours ?? 12, retentionAutoPropagate: v85.settings.retentionAutoPropagate !== false }
      : { ...DEFAULT_SETTINGS },
  }),
  86: (v86) => ({ ...v86, schemaVersion: 87, missionBriefs: Array.isArray(v86.missionBriefs) ? v86.missionBriefs : [], settings: { ...v86.settings, missionCellFloor: v86.settings?.missionCellFloor ?? 5 } }),
  84: (v84) => ({ ...v84, schemaVersion: 85, authorityCalibrationMarkers: [] }),
  83: (v83) => ({ ...v83, schemaVersion: 84, mandates: [] }),
  82: (v82) => ({
    ...v82,
    schemaVersion: 83,
    // v83 is additive: no bench reading, probability or certificate is fabricated
    // on upgrade. Every span, blanket, concentration index and flow test is derived
    // on read from the roster and the dated records other modules already keep, so
    // an upgraded workspace opens with an empty reading ledger — and the terminal
    // says the bench has never been certified, which is exactly true.
    successionReadings: [],
    successionMarkers: [],
  }),
  81: (v81) => ({
    ...v81,
    schemaVersion: 82,
    // v82 is additive: no altitude, span, rate or escalation clock is fabricated on
    // upgrade. Every one of them is derived on read from the roster and the dated
    // records the workspace already keeps, so an upgraded workspace opens with an
    // empty reading ledger and a chain it can actually see.
    chainReadings: [],
    chainMarkers: [],
  }),
  80: (v80) => ({
    ...v80,
    schemaVersion: 81,
    // v81 is additive: no historical round, verdict or contradiction rate is
    // fabricated on upgrade. Every claim, contradiction and family rate is derived
    // on read from records other modules already keep, so an upgraded workspace
    // opens with empty ledgers and a sampling bound that says nothing has been
    // examined yet — which is exactly what is true.
    scepticRounds: [],
    scepticDispositions: [],
    scepticMarkers: [],
  }),
  79: (v79) => ({
    ...v79,
    schemaVersion: 80,
    // v80 is additive: no historical reading, promise price or moved date is
    // fabricated on upgrade. Every exposure, probability and ratio is derived on
    // read from dated records the workspace already keeps, so an upgraded
    // workspace opens with empty ledgers that say exactly that.
    solvencyReadings: [],
    solvencyMarkers: [],
    solvencyRenegotiations: [],
  }),
  78: (v78) => ({
    ...v78,
    schemaVersion: 79,
    // v79 is additive: no historical plan, capture task or Brier grade is
    // fabricated on upgrade. Every count, arrival rate and fill probability is
    // derived on read from dated records the workspace already keeps, so an
    // upgraded workspace opens with an empty plan ledger that says so.
    supplyPlans: [],
    supplyMarkers: [],
  }),
  77: (v77) => ({
    ...v77,
    schemaVersion: 78,
    // v78 is additive: no historical review, band verdict or contradiction is
    // fabricated on upgrade. Every collision count, rotation p-value and
    // model reference is derived on read from decision dates the workspace
    // already keeps, so an upgraded workspace opens with an empty ledger that
    // says exactly that.
    couplingReviews: [],
    couplingMarkers: [],
  }),
  76: (v76) => ({
    ...v76,
    schemaVersion: 77,
    // v77 is additive: no historical instrument reading, observation marker or
    // separation tier is fabricated on upgrade. Every coefficient is derived on
    // read from reviews the workspace already keeps, so an upgraded workspace
    // opens with an empty ledger that says so.
    reliabilityReadings: [],
    reliabilityMarkers: [],
  }),
  75: (v75) => ({
    ...v75,
    schemaVersion: 76,
    // v76 is additive: no historical policy evaluation, decision-point capture
    // or resolution marker is fabricated on upgrade. Every value, bound and
    // sensitivity figure is derived on read from records the workspace already
    // keeps, so an upgraded workspace opens with an empty ledger that says so.
    policyEvaluations: [],
    policyMarkers: [],
  }),
  74: (v74) => ({
    ...v74,
    schemaVersion: 75,
    // v75 is additive: no historical loop forecast or settlement receipt is
    // fabricated on upgrade. Live loops are derived on read from existing
    // bundles, response plans and coordinated cases.
    settlements: [],
  }),
  73: (v73) => ({ ...v73, schemaVersion: 74, actionBundles: [] }),
  72: (v72) => ({
    ...v72,
    schemaVersion: 73,
    // No historical rehearsal or adoption is inferred on upgrade.
    responsePlans: [],
  }),
  71: (v71) => ({
    ...v71,
    schemaVersion: 72,
    // v72 is additive. A certificate is a forecast frozen on demand and a marker
    // is rule bookkeeping; neither existed before this version, so neither is
    // invented on upgrade. Every map, reliability figure and verdict is computed
    // on read from records already held, so an existing workspace opens with an
    // empty ledger and says so.
    confidenceCertificates: [],
    confidenceMarkers: [],
  }),
  70: (v70) => ({
    ...v70,
    schemaVersion: 71,
    // v71 is additive. A frame is a forecast and a declaration is a judgement;
    // neither existed before this version, so neither is invented on upgrade.
    // Every borrowed estimate is computed on read from records already held.
    credibilityFrames: [],
    credibilityDeclarations: [],
    credibilityMarkers: [],
  }),
  69: (v69) => ({
    ...v69,
    schemaVersion: 70,
    // v70 is additive and retrospective in the only direction that is honest:
    // a look, a verdict and a review are all records of something a person did
    // or a scan observed. None is invented on upgrade, so an existing workspace
    // opens with an empty ledger and says so.
    integrityLooks: [],
    signalVerdicts: [],
    integrityReviews: [],
    integrityMarkers: [],
  }),
  68: (v68) => ({
    ...v68,
    schemaVersion: 69,
    // v69 is additive: a portfolio reading is a forecast written on demand,
    // and a correlation is a leader's declaration, never a derived quantity.
    // Empty lists are correct — back-filling either would be a prediction or
    // an assumption made after the answer was known.
    deferralPortfolioReadings: [],
    correlationDeclarations: [],
    deferralPortfolioMarkers: [],
  }),
  67: (v67) => ({
    ...v67,
    schemaVersion: 68,
    // v68 is additive: a deferral frame is a forecast written on demand, and
    // every figure it contains is recomputed on read from records that already
    // exist. An empty list is correct — back-filling a frame would be a
    // prediction made after the outcome was known.
    deferralFrames: [],
    deferralMarkers: [],
  }),
  66: (v66) => ({
    ...v66,
    schemaVersion: 67,
    // No historical forecast or typed link is invented on upgrade.
    consequenceReadings: [],
    consequenceMarkers: [],
  }),
  65: (v65) => ({
    ...v65,
    schemaVersion: 66,
    // v66 is additive and backward-looking by construction: a review is a
    // frozen claim written on demand, and every figure it would contain is
    // recomputed on read from the scored studies already in the workspace. An
    // empty review list is correct — freezing one retroactively would be a
    // prediction made after the answer was known.
    evidenceReviews: [],
    evidenceMarkers: [],
  }),
  64: (v64) => ({
    ...v64,
    schemaVersion: 65,
    // v65 is additive: LMX disparity, promise reliability and standard
    // consistency are derived on read from existing records, and a parity
    // audit is only meaningful when explicitly frozen by the leader.
    parityAudits: [],
    parityMarkers: [],
  }),
  63: (v63) => ({
    ...v63,
    schemaVersion: 64,
    // v64 is additive and backward-looking by construction: the priced wait
    // is computed from records that already exist, so an upgrade changes no
    // figure. An empty price list is correct — a weekly price the leader never
    // declared would be a cost nobody agreed to — and an empty certificate
    // list is correct, because a certificate frozen after the fact would be a
    // prediction made after the answer was known.
    waitPrices: [],
    waitExposures: [],
    waitCostMarkers: [],
  }),
  62: (v62) => ({
    ...v62,
    schemaVersion: 63,
    // v63 is additive and backward-looking by construction: the curve is
    // computed from records that already exist, so an upgrade changes no
    // reading and hides no item. An empty frozen-reading list is correct — a
    // prediction cannot be back-filled, because back-filling it would be a
    // prediction made after the answer was known.
    survivalReadings: [],
    survivalMarkers: [],
  }),
  61: (v61) => ({
    ...v61,
    schemaVersion: 62,
    // v62 is additive. A workspace written before this version never recorded
    // a performance concern, and seeding one would invent both the gap and
    // the evidence. The Coupled Load pause gets its own key and inherits the
    // old shared value so nobody's setting flips as a side effect of the
    // upgrade.
    performanceConcerns: [],
    // Schema v63: nothing is frozen for a workspace that has never frozen one.
    survivalReadings: [],
    survivalMarkers: [],
    settings: {
      ...(v61.settings || {}),
      coupledLoadAutoPropagate: (v61.settings?.coupledLoadAutoPropagate
        ?? v61.settings?.couplingAutoPropagate) !== false,
    },
  }),
  60: (v60) => ({
    ...v60,
    schemaVersion: 61,
    // v61 is additive. A workspace written before this version never ran the
    // Coupled Load rules, and the coupling graph is a derived read model over
    // decisions, delegations, cases and the roster — so there is nothing to
    // reconstruct. The only new persisted state is a marker array for
    // RULE-COUP-01..04 idempotency. An empty marker list is correct, not a
    // prompt to invent coupling.
    couplingMarkers: [],
  }),
  59: (v59) => ({
    ...v59,
    schemaVersion: 60,
    // v60 is additive. A workspace written before this version never declared
    // a war game. Scenarios are external shocks, not predictions; an empty
    // list is a visible prompt: the terminal still renders because every
    // reading (strategy gap, attention market, coalition stability) is computed
    // on load from records that already exist.
    warGames: [],
    warGameMarkers: [],
  }),
  58: (v58) => ({
    ...v58,
    schemaVersion: 59,
    // v59 is additive. A workspace written before this version never declared a
    // signal class, never planted a probe and never adopted a lever. Seeding a
    // path from the current roster would invent the declaration *and* the
    // exposure it prices, which are the only two things the module is for. An
    // empty list is a visible prompt: the terminal still renders, because every
    // roster-derived reading (depths, blind nodes, peer reach) is computed on
    // load from records that already exist.
    signalClasses: [],
    signalProbes: [],
    signalLevers: [],
  }),
  57: (v57) => ({ ...v57, schemaVersion: 58, autopilotPolicies: [], autopilotRuns: [] }),
  56: (v56) => ({
    ...v56,
    schemaVersion: 57,
    // v57 is additive. A workspace written before this version never committed
    // an attention plan, and a plan is a *prediction* — an hour budget, a chosen
    // set and a forgone set committed before anyone acted. Reconstructing one
    // from the current open queue would invent the budget and the choice, which
    // is the only thing the record is for. An empty list is a visible prompt;
    // the terminal still renders, because its market is derived on load.
    attentionPlans: [],
  }),
  55: (v55) => ({
    ...v55,
    schemaVersion: 56,
    // v56 is additive. The Leader Probability Calibration engine (ADR-0044)
    // reads settled voiDecisions and derives every calibration figure
    // (Brier, Murphy decomposition, reliability bins, Wilson intervals,
    // PSI drift, per-topic breakdown) on load from the frozen probability
    // snapshots already stored on each outcome. It does not invent a sample,
    // a verdict, an adjustment or a forecast for an existing workspace. The
    // only new persisted state is a marker array for RULE-LCAL-01..03
    // idempotency.
    calibrationMarkers: [],
  }),
  54: (v54) => ({
    ...v54,
    schemaVersion: 55,
    // v55 is additive. The Decision Portfolio Engine (ADR-0043) reads from
    // existing decisions, premises, typed links and tempo schedules — it does
    // not invent a decision, a coupling or a dependency for an existing
    // workspace. The only new persisted state is a marker array for
    // RULE-DPF-01..04 idempotency and optional portfolio notes on decisions.
    portfolioMarkers: [],
  }),
  53: (v53) => ({
    ...v53,
    schemaVersion: 54,
    // v54 is additive. A workspace written before this version never declared a
    // priced decision frame, and inventing one from the decision ledger would
    // invent the states, the probabilities and the payoffs — the three numbers
    // every figure in the terminal is derived from. An empty frame list is a
    // visible prompt, not a plausible default.
    voiDecisions: [],
    voiStudies: [],
  }),
  52: (v52) => ({
    ...v52,
    schemaVersion: 53,
    // v53 is additive. A workspace written before this version never declared a
    // structural design, and a reorg is a set of *proposed* reporting lines
    // committed before anyone was told. Inferring one from the current manager
    // column would invent the design, its rationale and its prediction, which is
    // the one thing this module exists to prevent.
    orgDesigns: [],
  }),
  51: (v51) => ({
    ...v51,
    schemaVersion: 52,
    // v52 is additive. A workspace written before this version never declared a
    // transition programme, and a programme is a set of named people plus a
    // target committed BEFORE anyone was told. Inferring one from archived
    // people would invent the criteria, the target and the decision, which is
    // exactly what this module exists to prevent.
    transitionPrograms: [],
  }),
  50: (v50) => ({
    ...v50,
    schemaVersion: 51,
    // v51 is additive. A workspace written before this version has no declared
    // bands and no merit cycle, and inventing one from the roster would invent
    // both the pay figures and the comparison — the two things this module
    // exists to keep honest. An empty band list is a visible prompt, not a
    // silently plausible default.
    compBands: [],
    meritCycles: [],
  }),
  49: (v49) => ({
    ...v49,
    schemaVersion: 50,
    // v50 is additive. A workspace written before this version never declared
    // an implementation plan, and a plan is nothing but a denominator and five
    // checkpoints committed BEFORE the delivery happened. Reconstructing one
    // from completed records would invent both the denominator and the
    // prediction, which is the one thing this ledger exists to prevent.
    fidelityPlans: [],
  }),
  48: (v48) => ({
    ...v48,
    schemaVersion: 49,
    // v49 only records execution provenance when a leader scores a study after
    // migration. Existing locked studies receive no inferred/backfilled
    // snapshot; bounded traces may be incomplete, so absence is never inferred.
    impactStudies: (Array.isArray(v48.impactStudies) ? v48.impactStudies : []).map((study) => (
      study && typeof study === 'object' && !Array.isArray(study)
        ? { ...study, executionSnapshot: null }
        : study
    )),
  }),
  47: (v47) => ({
    ...v47,
    schemaVersion: 48,
    // v48 is additive: earlier workspaces have no successful rule trace to
    // reconstruct. Guessing lineage from audit summaries would be incomplete,
    // so retain an empty ledger until a new post-commit rule actually applies.
    propagationLineage: [],
  }),
  46: (v46) => ({
    ...v46,
    schemaVersion: 47,
    // v47 is purely additive. A workspace written before this version never
    // declared a scorecard, so it starts with an empty lab. Inventing a
    // scorecard from historical goals would fabricate both the declared
    // parameters and the frozen prediction, and the entire point of the ledger
    // is that the prediction was made before the evidence arrived.
    scorecards: Array.isArray(v46.scorecards) ? v46.scorecards : [],
    settings: isPlainObject(v46.settings)
      ? {
          ...v46.settings,
          measurementMetricCostPct: v46.settings.measurementMetricCostPct ?? 2,
          measurementAutoPropagate: v46.settings.measurementAutoPropagate !== false,
        }
      : { ...DEFAULT_SETTINGS },
  }),
  45: (v45) => ({
    ...v45,
    schemaVersion: 46,
    // v46 is purely additive: one stress convention. Existing drills keep their
    // frozen predictions — they were scored against the independent model, and
    // rewriting them to the correlated one would make the ledger retroactive.
    settings: isPlainObject(v45.settings)
      ? {
          ...v45.settings,
          continuityCommonCausePct: v45.settings.continuityCommonCausePct ?? 25,
          continuitySecondShockPct: v45.settings.continuitySecondShockPct ?? 10,
        }
      : { ...DEFAULT_SETTINGS },
  }),
  44: (v44) => ({
    ...v44,
    schemaVersion: 45,
    // v45 is purely additive. A workspace written before this version never
    // simulated an absence and never held a drill, so it starts with an empty
    // ledger. Retro-simulating a past holiday would invent both the prediction
    // and the observation, and the drill ledger is nothing but those two.
    continuityDrills: Array.isArray(v44.continuityDrills) ? v44.continuityDrills : [],
    settings: isPlainObject(v44.settings)
      ? {
          ...v44.settings,
          continuityHorizonDays: v44.settings.continuityHorizonDays ?? 14,
          continuityMinFitPct: v44.settings.continuityMinFitPct ?? 50,
          continuityAutoPropagate: v44.settings.continuityAutoPropagate !== false,
        }
      : { ...DEFAULT_SETTINGS },
  }),
  43: (v43) => ({
    ...v43,
    schemaVersion: 44,
    // v44 adds optional evidence references to applied lessons. Historical
    // application claims receive no fabricated corroboration; normalization
    // supplies an empty evidence list and the UI says "unverified".
  }),
  42: (v42) => ({
    ...v42,
    schemaVersion: 43,
    // v43 is purely additive. Work that closed before this version was never
    // reviewed by this app, and inventing a review — even an empty one — would
    // both fabricate the record and make the coverage number meaningless. The
    // terminal instead lists every dated closure as awaiting review, with its
    // age, so nothing is hidden and nothing is fabricated.
    retros: Array.isArray(v42.retros) ? v42.retros : [],
  }),
  41: (v41) => ({
    ...v41,
    schemaVersion: 42,
    // v42 is purely additive. A workspace written before this version declared
    // no strategy, so there is nothing to migrate into a bet and nothing to
    // tag. Inventing either would manufacture both the declared share and the
    // measured share, and the gap between them would be fiction.
    strategyBets: Array.isArray(v41.strategyBets) ? v41.strategyBets : [],
    strategyTags: Array.isArray(v41.strategyTags) ? v41.strategyTags : [],
  }),
  39: (v39) => ({
    ...v39,
    schemaVersion: 40,
    // Both new fields are optional. In particular, historical predictions
    // remain legacy and are never presented as verified prospective evidence.
  }),
  40: (v40) => ({
    ...v40,
    schemaVersion: 41,
    // v41 is purely additive. A workspace written before this version never
    // recorded a rule failure, so it starts with an empty receipt ledger.
    // Nothing is retro-invented: there is no way to know which past rules
    // failed, and guessing would fabricate an audit trail.
    propagationReceipts: Array.isArray(v40.propagationReceipts) ? v40.propagationReceipts : [],
  }),
  38: (v38) => ({
    ...v38,
    schemaVersion: 39,
    // v39 adds the Early-Warning Watch. Purely additive: no historical signal
    // is retro-promoted, no verdict is invented for an alert nobody saw, and no
    // prediction is back-filled for a week that has already passed. An older
    // workspace starts with an empty ledger and the new conventions take their
    // defaults through normalizeSettings.
    watchAlerts: Array.isArray(v38.watchAlerts) ? v38.watchAlerts : [],
    watchForecasts: Array.isArray(v38.watchForecasts) ? v38.watchForecasts : [],
  }),
  37: (v37) => ({
    ...v37,
    schemaVersion: 38,
    // v38 adds funded structural portfolios and their out-of-sample
    // checkpoints. Purely additive: no historical record is retro-priced, no
    // effort cost is invented for a past decision, and no checkpoint is
    // fabricated for an experiment that was never graded. Existing settings
    // keep their own values; the new budget conventions take their defaults
    // through normalizeSettings.
    capitalPolicies: Array.isArray(v37.capitalPolicies) ? v37.capitalPolicies : [],
    dynamicsCheckpoints: Array.isArray(v37.dynamicsCheckpoints) ? v37.dynamicsCheckpoints : [],
  }),
  36: (v36) => ({
    ...v36,
    schemaVersion: 37,
    // v37 adds named structural policy experiments. Purely additive: no
    // historical record is retro-modelled, no parameter is inferred from a
    // title, and every trajectory stays a derived read model rather than a
    // stored prediction. Existing settings keep their own values; the new
    // model conventions take their defaults through normalizeSettings.
    dynamicsExperiments: Array.isArray(v36.dynamicsExperiments) ? v36.dynamicsExperiments : [],
  }),
  35: (v35) => ({
    ...v35,
    schemaVersion: 36,
    // v36 adds explicitly assessed premise outcomes. No historic premise is
    // retro-labelled true/false; scoring starts only after a human records a
    // dated held/failed/inconclusive assessment.
    premiseOutcomes: Array.isArray(v35.premiseOutcomes) ? v35.premiseOutcomes : [],
  }),
  34: (v34) => ({
    ...v34,
    schemaVersion: 35,
    // v35 adds the Premise Sentinel / Assumption Ledger. Purely additive:
    // no historical decision is retro-assigned a premise and no belief is
    // back-filled. Existing settings keep their own values; the five new
    // policy keys take defaults through normalizeSettings below.
    premises: Array.isArray(v34.premises) ? v34.premises : [],
    settings: isPlainObject(v34.settings)
      ? {
          ...v34.settings,
          premiseWatchPct: v34.settings.premiseWatchPct ?? 55,
          premiseBreachPct: v34.settings.premiseBreachPct ?? 30,
          premiseHalfLifeDays: v34.settings.premiseHalfLifeDays ?? 90,
          premiseReviewDays: v34.settings.premiseReviewDays ?? 30,
          premiseAutoPropagate: v34.settings.premiseAutoPropagate !== false,
        }
      : { ...DEFAULT_SETTINGS },
  }),
  33: (v33) => ({
    ...v33,
    schemaVersion: 34,
    // v34 adds the Cognitive Load & Attention Governor. Purely additive and
    // fully derived: no person is assigned a load rating, no saturation index
    // is persisted (every figure is recomputed from recorded commitments),
    // and the new settings take their defaults through normalizeSettings.
    settings: isPlainObject(v33.settings)
      ? {
          ...v33.settings,
          loadSaturationPct: v33.settings.loadSaturationPct ?? 80,
          loadOverloadProbPct: v33.settings.loadOverloadProbPct ?? 80,
          loadThroughputWindowWeeks: v33.settings.loadThroughputWindowWeeks ?? 8,
          loadAutoPropagate: v33.settings.loadAutoPropagate !== false,
        }
      : { ...DEFAULT_SETTINGS },
  }),
  32: (v32) => ({
    ...v32,
    schemaVersion: 33,
    // v33 adds the Allocation Governor and honest "unrated" FMEA cases.
    // Purely additive: no portfolio item is retro-classified into an ambition
    // horizon (existing items stay unclassified until the leader classifies
    // them), no historical case rating is rewritten (a stored 5 from before
    // v33 cannot be told apart from a deliberate 5, so it is kept), and the
    // new settings take their defaults through normalizeSettings.
  }),
  31: (v31) => ({
    ...v31,
    schemaVersion: 32,
    // v32 adds the Stakeholder Comms Outbox. Purely additive: no existing
    // stakeholder is retro-messaged and no historical case is backfilled.
    commsDrafts: Array.isArray(v31.commsDrafts) ? v31.commsDrafts : [],
  }),
  30: (v30) => ({
    ...v30,
    schemaVersion: 31,
    // v31 adds the Impact Ledger. Purely additive: no historical intervention
    // is retro-labelled as pre-registered, and older workspaces start with an
    // empty study ledger and the default evaluation design conventions.
    impactStudies: Array.isArray(v30.impactStudies) ? v30.impactStudies : [],
    settings: isPlainObject(v30.settings)
      ? {
          ...v30.settings,
          impactAlpha: v30.settings.impactAlpha ?? 0.1,
          impactBaselineWeeks: v30.settings.impactBaselineWeeks ?? 8,
          impactWindowWeeks: v30.settings.impactWindowWeeks ?? 4,
          impactAutoPropagate: v30.settings.impactAutoPropagate !== false,
        }
      : { ...DEFAULT_SETTINGS },
  }),
  29: (v29) => ({
    ...v29,
    schemaVersion: 30,
    // v30 adds the Coalition & Incentive War Room. Purely additive: no existing
    // case, decision or stakeholder is converted into a game; older workspaces
    // simply start with an empty ledger and default war-room settings.
    powerGames: Array.isArray(v29.powerGames) ? v29.powerGames : [],
    settings: isPlainObject(v29.settings)
      ? {
          ...v29.settings,
          powerQuotaPct: v29.settings.powerQuotaPct ?? 50,
          powerStaleDays: v29.settings.powerStaleDays ?? 14,
          powerFragileMargin: v29.settings.powerFragileMargin ?? 0.1,
          powerAutoPropagate: v29.settings.powerAutoPropagate !== false,
        }
      : { ...DEFAULT_SETTINGS },
  }),
  28: (v28) => ({
    ...v28,
    schemaVersion: 29,
    // v29 adds the Operational Resilience, Dependency & Continuity Terminal.
    // Purely additive: no dependency, TTS/TTR tolerance, steward verification
    // or continuity drill is invented from existing prose or tasks.
    dependencies: Array.isArray(v28.dependencies) ? v28.dependencies : [],
    settings: isPlainObject(v28.settings)
      ? {
          ...v28.settings,
          resilienceDrillDays: v28.settings.resilienceDrillDays ?? 180,
          resilienceHhiWarn: v28.settings.resilienceHhiWarn ?? 2500,
          resilienceAutoPropagate: v28.settings.resilienceAutoPropagate !== false,
        }
      : { ...DEFAULT_SETTINGS },
  }),
  27: (v27) => ({
    ...v27,
    schemaVersion: 28,
    // v28 adds the Decision Tempo & Timing Terminal. Purely additive: no
    // existing decided record receives a decidedOn date (that moment was never
    // recorded and reconstructing it would fabricate latency evidence), no
    // timebox is invented, and the workspace starts with an empty timebox
    // ledger which RULE-DLY-03 may then propose into.
    tempoSchedules: Array.isArray(v27.tempoSchedules) ? v27.tempoSchedules : [],
    // Decisions are left exactly as stored: `decidedOn` is a *measured* moment,
    // so normalizeState adds it as null and never reconstructs it from a date.
    settings: isPlainObject(v27.settings)
      ? {
          ...v27.settings,
          tempoDelegatedMaxDays: v27.settings.tempoDelegatedMaxDays ?? 7,
          tempoCrossCuttingMaxDays: v27.settings.tempoCrossCuttingMaxDays ?? 21,
          tempoBigBetMaxDays: v27.settings.tempoBigBetMaxDays ?? 45,
          tempoBigBetValue: v27.settings.tempoBigBetValue ?? 50000,
          tempoInfoHalfLifeDays: v27.settings.tempoInfoHalfLifeDays ?? 14,
          tempoCoveragePct: v27.settings.tempoCoveragePct ?? 80,
          tempoAutoPropagate: v27.settings.tempoAutoPropagate !== false,
        }
      : { ...DEFAULT_SETTINGS },
  }),
  26: (v26) => ({
    ...v26,
    schemaVersion: 27,
    // v27 adds the natural-language Intake Terminal draft ledger. Purely
    // additive: no existing note, case or event is converted into a draft, so
    // older workspaces simply start with an empty triage queue.
    intakeDrafts: Array.isArray(v26.intakeDrafts) ? v26.intakeDrafts : [],
  }),
  25: (v25) => ({
    ...v25,
    schemaVersion: 26,
    // v26 adds the cross-ledger Forecast Integrity Terminal. Purely additive:
    // no historical estimate is converted into a challenge, no outcome is
    // invented, and no source forecast is rewritten. Older workspaces start
    // with an empty challenge ledger; RULE-FCI-01 derives challenges from the
    // next outcome event or an explicit scan.
    forecastChallenges: Array.isArray(v25.forecastChallenges) ? v25.forecastChallenges : [],
    settings: isPlainObject(v25.settings)
      ? {
          ...v25.settings,
          forecastAutoPropagate: v25.settings.forecastAutoPropagate !== false,
          forecastCoveragePct: v25.settings.forecastCoveragePct ?? 80,
        }
      : { ...DEFAULT_SETTINGS },
  }),
  24: (v24) => ({
    ...v24,
    schemaVersion: 25,
    // v25 adds the Stakeholder Influence Register (Mitchell/Agle/Wood
    // salience, Tsebelis veto players, coalition network). Purely additive:
    // existing embedded case/change/negotiation stakeholder stubs are NOT
    // converted into register records — a named political actor the leader
    // never explicitly registered would be invented data. Older workspaces
    // start with an empty register and reconcile through RULE-STK-01.
    stakeholders: Array.isArray(v24.stakeholders) ? v24.stakeholders : [],
  }),
  23: (v23) => ({
    ...v23,
    schemaVersion: 24,
    // v24 adds Budget & Financial Commitments (commitment/encumbrance
    // accounting: planned, committed, spent and released lines inside a
    // single-currency envelope). Purely additive: existing case exposures,
    // portfolio values and negotiation stakes are NOT converted into budget
    // lines — an envelope or commitment the leader never recorded would be
    // invented financial data. Older workspaces start with no budgets.
    budgets: Array.isArray(v23.budgets) ? v23.budgets : [],
    settings: isPlainObject(v23.settings)
      ? { ...v23.settings, budgetWatchPct: v23.settings.budgetWatchPct ?? 80 }
      : { ...DEFAULT_SETTINGS },
  }),
  22: (v22) => ({
    ...v22,
    schemaVersion: 23,
    // v23 adds the Negotiation Workbench (BATNA/ZOPA prep, mandate decisions,
    // agreement commitments and impasse escalation). Purely additive: older
    // workspaces start with no negotiations, and every new field is nullable
    // or defaulted, so normalization never invents reservation prices,
    // counterparty estimates, stakes or commitments that were not recorded.
    negotiations: Array.isArray(v22.negotiations) ? v22.negotiations : [],
  }),
  21: (v21) => ({
    ...v21,
    schemaVersion: 22,
    // v22 completes the third forecast-calibration ledger: operational cases
    // gain an opening-forecast `forecastSnapshot` (RULE-FCT-03) and settled
    // `actuals` recorded at resolution. All additive and normalised to null
    // for pre-existing records — cases resolved before v22 keep an honestly
    // unscored history that falls back to the resolution-time estimate when
    // actuals are backfilled, and is labelled as such.
  }),
  20: (v20) => ({
    ...v20,
    schemaVersion: 21,
    // v21 adds forecast calibration: decisions gain an optional recorded
    // `forecastProbability` and plan items gain `actualEffortDays`,
    // `actualValue` and a funding-time `forecastSnapshot`. All are additive
    // and normalised to null for pre-existing records — no historical
    // forecast or actual is invented, because scoring a number nobody
    // recorded at the time would corrupt the calibration record.
  }),
  19: (v19) => ({
    ...v19,
    schemaVersion: 20,
    settings: isPlainObject(v19.settings)
      ? {
          ...v19.settings,
          simulationSeed: v19.settings.simulationSeed ?? 42,
          simulationTrials: v19.settings.simulationTrials ?? 1000,
        }
      : { ...DEFAULT_SETTINGS },
    // v20 adds deterministic seeded Monte Carlo simulation settings across
    // Capacity & Organizational Change J-Curves, plus pre-export retention &
    // contextual-integrity governance. No synthetic records are invented.
  }),
  18: (v18) => ({
    ...v18,
    schemaVersion: 19,
    settings: isPlainObject(v18.settings)
      ? { ...v18.settings, changeReviewDays: v18.settings.changeReviewDays ?? 21 }
      : { ...DEFAULT_SETTINGS },
    // v19 adds Organizational Design, Team Topologies & Change Execution.
    // Existing role transitions, cases, and decisions are NOT converted into
    // invented change records; the collection starts empty until recorded.
    changes: Array.isArray(v18.changes) ? v18.changes : [],
  }),
  17: (v17) => ({
    ...v17,
    schemaVersion: 18,
    settings: isPlainObject(v17.settings)
      ? { ...v17.settings, candidateRetentionDays: v17.settings.candidateRetentionDays ?? 180 }
      : { ...DEFAULT_SETTINGS },
    // v18 adds a data-minimisation *reminder* for candidate records. It does
    // not delete anything and does not add a field to existing candidates: a
    // retention clock has to start from a date that was actually recorded, and
    // the reviewer reads that from `decidedOn` / `updatedOn` at review time.
  }),
  16: (v16) => ({
    ...v16,
    schemaVersion: 17,
    settings: isPlainObject(v16.settings)
      ? {
          ...v16.settings,
          hiringBaseRate: v16.settings.hiringBaseRate ?? 0.45,
          hiringStallDays: v16.settings.hiringStallDays ?? 30,
          interviewHoursPerStage: v16.settings.interviewHoursPerStage ?? 3,
        }
      : { hiringBaseRate: 0.45, hiringStallDays: 30, interviewHoursPerStage: 3 },
    // v17 adds selection and hiring. Existing people, cases and portfolio items
    // are NOT converted into requisitions or candidates: a role the leader never
    // opened would be invented data, and so would evidence nobody recorded.
    requisitions: Array.isArray(v16.requisitions) ? v16.requisitions : [],
    candidates: Array.isArray(v16.candidates) ? v16.candidates : [],
  }),
  15: (v15) => ({
    ...v15,
    schemaVersion: 16,
    settings: isPlainObject(v15.settings)
      ? {
          ...v15.settings,
          capacityHoursPerWeek: v15.settings.capacityHoursPerWeek ?? 32,
          planningHorizonWeeks: v15.settings.planningHorizonWeeks ?? 4,
          operationalLoadPct: v15.settings.operationalLoadPct ?? 20,
          wipLimitPerPerson: v15.settings.wipLimitPerPerson ?? 2,
        }
      : { capacityHoursPerWeek: 32, planningHorizonWeeks: 4, operationalLoadPct: 20, wipLimitPerPerson: 2 },
    // v16 adds the operating-plan portfolio ledger. Existing goals, cases and
    // delegations are NOT auto-converted into portfolio items: an effort or
    // value estimate the leader never gave would be invented data. Open cases
    // with recorded capacity days still count as implicit capacity reserves.
    portfolio: Array.isArray(v15.portfolio) ? v15.portfolio : [],
  }),
  14: (v14) => ({
    ...v14,
    schemaVersion: 15,
    settings: isPlainObject(v14.settings)
      ? { ...v14.settings, caseReviewDays: v14.settings.caseReviewDays ?? 14 }
      : { caseReviewDays: 14 },
    // v15 adds cross-domain Operational Cases and typed Cross-Module Links.
    // Existing records are never guessed into fabricated cases or links.
    cases: Array.isArray(v14.cases) ? v14.cases : [],
    links: Array.isArray(v14.links) ? v14.links : [],
  }),
  13: (v13) => ({
    ...v13,
    schemaVersion: 14,
    // v14 introduces a separate manager-owned support ledger. Existing
    // 1:1 actions and check-ins are not transformed or inferred into it.
    managerSupport: Array.isArray(v13.managerSupport) ? v13.managerSupport : [],
  }),
  12: (v12) => ({
    ...v12,
    schemaVersion: 13,
    goals: Array.isArray(v12.goals)
      ? v12.goals.map((goal) => (isPlainObject(goal)
          ? { ...goal, sourceReviewId: typeof goal.sourceReviewId === 'string' && goal.sourceReviewId.trim() ? goal.sourceReviewId.trim() : null }
          : goal))
      : v12.goals,
    growthPlans: Array.isArray(v12.growthPlans)
      ? v12.growthPlans.map((plan) => (isPlainObject(plan)
          ? { ...plan, sourceReviewId: typeof plan.sourceReviewId === 'string' && plan.sourceReviewId.trim() ? plan.sourceReviewId.trim() : null }
          : plan))
      : v12.growthPlans,
  }),
  11: (v11) => ({
    ...v11,
    schemaVersion: 12,
    growthPlans: Array.isArray(v11.growthPlans)
      ? v11.growthPlans.map((plan) => (isPlainObject(plan)
          ? {
              ...plan,
              will: Array.isArray(plan.will)
                ? plan.will.map((w) => (isPlainObject(w)
                    ? {
                        ...w,
                        // v12 adds explicit GROW commitment → delegation links.
                        // Earlier workspaces never stored this relationship, so
                        // `null` is preserved honestly rather than guessed from
                        // title text.
                        delegationId: typeof w.delegationId === 'string' && w.delegationId.trim()
                          ? w.delegationId.trim()
                          : null,
                      }
                    : w))
                : plan.will,
            }
          : plan))
      : v11.growthPlans,
  }),
  10: (v10) => ({
    ...v10,
    schemaVersion: 11,
    onboarding: Array.isArray(v10.onboarding)
      ? v10.onboarding.map((plan) => (isPlainObject(plan)
          ? {
              ...plan,
              // v11 adds 'reboarding' (return-to-work after extended leave)
              // without storing leave reasons or medical detail. Existing
              // 'new-hire' and 'role-transition' plans stay intact; any unknown
              // kind defaults honestly to 'new-hire'.
              kind: ONBOARDING_KINDS.includes(plan.kind) ? plan.kind : 'new-hire',
              label: typeof plan.label === 'string' ? plan.label : '',
            }
          : plan))
      : v10.onboarding,
    readiness: Array.isArray(v10.readiness)
      ? v10.readiness.map((rec) => (isPlainObject(rec)
          ? {
              ...rec,
              notes: typeof rec.notes === 'string' ? rec.notes : '',
            }
          : rec))
      : v10.readiness,
  }),
  9: (v9) => ({
    ...v9,
    schemaVersion: 10,
    onboarding: Array.isArray(v9.onboarding)
      ? v9.onboarding.map((plan) => (isPlainObject(plan)
          ? {
              ...plan,
              // v9 knew only one kind of 30-60-90 plan — new-joiner
              // onboarding — so every pre-v10 plan is honestly a 'new-hire'
              // plan with no transition label. A file already relabelled v10
              // keeps a valid kind/label instead of losing them.
              kind: ['new-hire', 'role-transition'].includes(plan.kind) ? plan.kind : 'new-hire',
              label: typeof plan.label === 'string' ? plan.label : '',
            }
          : plan))
      : v9.onboarding,
  }),
  8: (v8) => ({
    ...v8,
    schemaVersion: 9,
    growthPlans: Array.isArray(v8.growthPlans)
      ? v8.growthPlans.map((plan) => (isPlainObject(plan)
          ? {
              ...plan,
              reviews: Array.isArray(plan.reviews) ? plan.reviews : [],
              reviewDeferrals: typeof plan.reviewDeferrals === 'number' ? plan.reviewDeferrals : 0,
              reviewMovedOn: typeof plan.reviewMovedOn === 'string' ? plan.reviewMovedOn : null,
              will: Array.isArray(plan.will)
                ? plan.will.map((w) => (isPlainObject(w)
                    ? {
                        ...w,
                        // v8 could only say done or not-done, and it never asked
                        // whether a commitment had been moved or abandoned, so
                        // those stay empty rather than being invented.
                        addedOn: typeof w.addedOn === 'string' ? w.addedOn : null,
                        dropped: w.dropped === true,
                        droppedOn: typeof w.droppedOn === 'string' ? w.droppedOn : null,
                        droppedReason: typeof w.droppedReason === 'string' ? w.droppedReason : '',
                        droppedInReviewId: typeof w.droppedInReviewId === 'string' ? w.droppedInReviewId : null,
                        completedInReviewId: typeof w.completedInReviewId === 'string' ? w.completedInReviewId : null,
                        carriedFromId: typeof w.carriedFromId === 'string' ? w.carriedFromId : null,
                        carriedToId: typeof w.carriedToId === 'string' ? w.carriedToId : null,
                        carriedInReviewId: typeof w.carriedInReviewId === 'string' ? w.carriedInReviewId : null,
                      }
                    : w))
                : plan.will,
            }
          : plan))
      : v8.growthPlans,
  }),
  7: (v7) => ({
    ...v7,
    schemaVersion: 8,
    oneOnOnes: Array.isArray(v7.oneOnOnes)
      ? v7.oneOnOnes.map((meeting) => (isPlainObject(meeting)
          ? {
              ...meeting,
              actions: Array.isArray(meeting.actions)
                ? meeting.actions.map((action) => (isPlainObject(action)
                    ? {
                        ...action,
                        // v7 never asked who owed a promise, so `null` is the
                        // honest value. A file already relabelled v8 keeps a
                        // valid owner rather than losing it.
                        owner: ACTION_OWNERS.includes(action.owner) ? action.owner : null,
                      }
                    : action))
                : meeting.actions,
            }
          : meeting))
      : v7.oneOnOnes,
  }),
  6: (v6) => ({
    ...v6,
    schemaVersion: 7,
    oneOnOnes: Array.isArray(v6.oneOnOnes)
      ? v6.oneOnOnes.map((meeting) => (isPlainObject(meeting)
          ? {
              ...meeting,
              actions: Array.isArray(meeting.actions)
                ? meeting.actions.map((action) => (isPlainObject(action)
                    ? {
                        ...action,
                        completedInMeetingId: action.done === true && typeof action.completedInMeetingId === 'string'
                          ? action.completedInMeetingId
                          : null,
                        // v6 could not express these, so there is nothing to
                        // invent — but a relabelled v7 file keeps what it has.
                        carriedFrom: isPlainObject(action.carriedFrom) ? action.carriedFrom : null,
                        carriedToMeetingId: typeof action.carriedToMeetingId === 'string' ? action.carriedToMeetingId : null,
                        carriedToActionId: typeof action.carriedToActionId === 'string' ? action.carriedToActionId : null,
                        dropped: action.dropped === true,
                        droppedOn: typeof action.droppedOn === 'string' ? action.droppedOn : null,
                        droppedReason: typeof action.droppedReason === 'string' ? action.droppedReason : '',
                        droppedInMeetingId: typeof action.droppedInMeetingId === 'string' ? action.droppedInMeetingId : null,
                      }
                    : action))
                : meeting.actions,
            }
          : meeting))
      : v6.oneOnOnes,
  }),
  5: (v5) => ({
    ...v5,
    schemaVersion: 6,
    onboarding: Array.isArray(v5.onboarding) ? v5.onboarding : [],
  }),
  4: (v4) => ({
    ...v4,
    schemaVersion: 5,
    feedback: Array.isArray(v4.feedback)
      ? v4.feedback.map((item) => (isPlainObject(item)
          ? {
              ...item,
              followUpCompletedOn: item.followUpDone === true && typeof item.followUpCompletedOn === 'string' ? item.followUpCompletedOn : null,
            }
          : item))
      : v4.feedback,
    goals: Array.isArray(v4.goals)
      ? v4.goals.map((goal) => {
          if (!isPlainObject(goal)) return goal;
          const hasCheckins = Array.isArray(goal.checkins) && goal.checkins.length > 0;
          return {
            ...goal,
            initialConfidence: CONFIDENCE.includes(goal.initialConfidence)
              ? goal.initialConfidence
              : !hasCheckins && CONFIDENCE.includes(goal.confidence)
                ? goal.confidence
                : null,
            completedOn: goal.status === 'done' && typeof goal.completedOn === 'string' ? goal.completedOn : null,
            krUpdatedOn: typeof goal.krUpdatedOn === 'string' ? goal.krUpdatedOn : null,
            keyResults: Array.isArray(goal.keyResults)
              ? goal.keyResults.map((kr) => (isPlainObject(kr)
                  ? {
                      ...kr,
                      initialCurrent: typeof kr.initialCurrent === 'number' && Number.isFinite(kr.initialCurrent)
                        ? kr.initialCurrent
                        : !hasCheckins && typeof kr.current === 'number' && Number.isFinite(kr.current)
                          ? kr.current
                          : null,
                    }
                  : kr))
              : goal.keyResults,
            checkins: Array.isArray(goal.checkins)
              ? goal.checkins.map((c) => (isPlainObject(c)
                  ? {
                      ...c,
                      progressPct: typeof c.progressPct === 'number' && Number.isFinite(c.progressPct) ? c.progressPct : null,
                      keyResults: Array.isArray(c.keyResults) ? c.keyResults : null,
                    }
                  : c))
              : goal.checkins,
          };
        })
      : v4.goals,
    growthPlans: Array.isArray(v4.growthPlans)
      ? v4.growthPlans.map((plan) => (isPlainObject(plan)
          ? {
              ...plan,
              closedOn: plan.status === 'done' && typeof plan.closedOn === 'string' ? plan.closedOn : null,
              stagesUpdatedOn: typeof plan.stagesUpdatedOn === 'string' ? plan.stagesUpdatedOn : null,
              will: Array.isArray(plan.will)
                ? plan.will.map((w) => (isPlainObject(w)
                    ? {
                        ...w,
                        completedOn: w.done === true && typeof w.completedOn === 'string' ? w.completedOn : null,
                      }
                    : w))
                : plan.will,
            }
          : plan))
      : v4.growthPlans,
  }),
  3: (v3) => ({ ...v3, schemaVersion: 4, conflicts: Array.isArray(v3.conflicts) ? v3.conflicts : [] }),
  1: (v1) => ({ ...v1, schemaVersion: 2, reviews: Array.isArray(v1.reviews) ? v1.reviews : [] }),
  2: (v2) => ({
    ...v2,
    schemaVersion: 3,
    settings: {
      ...v2.settings,
      feedbackLatencyTargetDays: v2.settings?.feedbackLatencyTargetDays ?? 7,
      delegationCheckinDays: v2.settings?.delegationCheckinDays ?? 7,
    },
    feedback: Array.isArray(v2.feedback)
      ? v2.feedback.map((item) => ({ ...item, observedOn: typeof item.observedOn === 'string' ? item.observedOn : null }))
      : [],
    goals: Array.isArray(v2.goals)
      ? v2.goals.map((goal) => ({
          ...goal,
          coAuthored: goal.ownerId && typeof goal.coAuthored === 'boolean' ? goal.coAuthored : null,
        }))
      : [],
    delegations: Array.isArray(v2.delegations) ? v2.delegations : [],
  }),
};

/** Apply migrations until the blob is current. Returns { raw, applied }. */
export function migrate(raw) {
  let current = isPlainObject(raw) ? { ...raw } : raw;
  const applied = [];
  if (!isPlainObject(current)) return { raw: current, applied };
  let version = Number.isFinite(current.schemaVersion) ? current.schemaVersion : 1;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) break;
    current = step(current);
    applied.push(`${version} → ${version + 1}`);
    version += 1;
  }
  return { raw: current, applied };
}
