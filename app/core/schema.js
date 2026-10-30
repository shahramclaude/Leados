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
import { normalizePropagationLineage } from './domain/automationLineage.js';
import { normalizeImpactExecutionSnapshot } from './domain/impactExecution.js';
import { normalizeStrategyBets, normalizeStrategyTags } from './domain/strategy.js';
import { normalizeRetros } from './domain/learning.js';
import { INTERVENTION_TYPES } from './domain/interventionTypes.js';
import { normalizeFidelityPlans, normalizeImplementationSnapshot } from './domain/fidelitySchema.js';
import { normalizeCompBands, normalizeMeritCycles } from './domain/compSchema.js';
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

export const SCHEMA_VERSION = 51;
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

export const ONBOARDING_HORIZONS = [30, 60, 90];
export const ONBOARDING_CATEGORIES = ['clarity', 'connection', 'culture', 'contribution', 'ownership'];
export const ONBOARDING_STATUSES = ['active', 'completed', 'archived'];
// A 30-60-90 plan is onboarding for someone joining the team, a role
// transition for a tenured person moving into a new scope (promotion, lateral
// move, IC -> Lead), or return-to-work ("re-boarding") after extended leave.
// The distinction is recorded, never inferred from tenure, never rewrites
// `person.startDate`, and never stores medical or leave reasons.
export const ONBOARDING_KINDS = ['new-hire', 'role-transition', 'reboarding'];

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
  'propagationLineage',
  'links',
  'portfolio',
  'events',
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
    pulseMinResponses: clampInt(s.pulseMinResponses, 3, 25, d.pulseMinResponses),
    idleLockMinutes: clampInt(s.idleLockMinutes, 0, 480, d.idleLockMinutes),
  };
}

/**
 * Topics a person has asked to raise in a 1:1. One line each, trimmed, capped
 * and de-duplicated. Stored as a plain string array so it stays readable in an
 * export and survives a copy/paste into the person dialog.
 */
export function normalizeTalkingPoints(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const text = raw.trim().replace(/\s+/g, ' ').slice(0, 200);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= 12) break;
  }
  return out;
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
    const rawLimit = nonNegativeOrNull(b.limit);
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
        committedAmount: nonNegativeOrNull(line.committedAmount),
        // An actual only exists once money has landed; on any other status a
        // stray figure would be scored as spend that never happened.
        actualAmount: lineStatus === 'spent' ? nonNegativeOrNull(line.actualAmount) : null,
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
  if (raw.settings?.pulseMinResponses !== undefined && Number(raw.settings.pulseMinResponses) !== state.settings.pulseMinResponses) {
    warnings.push('Pulse privacy floor was repaired to the supported range of 3–25 responses; the default is 5.');
  }
  state.meta = {
    createdAt: isoOrNull(raw.meta?.createdAt) || now,
    updatedAt: isoOrNull(raw.meta?.updatedAt) || now,
    isDemo: raw.meta?.isDemo === true,
    revision: Math.max(0, Math.round(num(raw.meta?.revision, 0))),
  };

  const people = asArray(raw, 'people', warnings).map((p, i) => ({
    id: str(p.id) || `person-${i}`,
    name: str(p.name).trim().slice(0, 120),
    role: str(p.role).slice(0, 120),
    level: LEVELS.includes(p.level) ? p.level : 'ic',
    team: str(p.team).slice(0, 80),
    managerId: p.managerId ? str(p.managerId) : null,
    startDate: dayOrNull(p.startDate),
    focus: str(p.focus).slice(0, 300),
    talkingPoints: normalizeTalkingPoints(p.talkingPoints),
    status: p.status === 'archived' ? 'archived' : 'active',
    createdAt: isoOrNull(p.createdAt) || now,
    archivedAt: isoOrNull(p.archivedAt),
  }));
  state.people = uniqueIds(people.filter((p) => p.name), 'People', warnings);

  const oneOnOnes = asArray(raw, 'oneOnOnes', warnings).map((m, i) => ({
    id: str(m.id) || `oo-${i}`,
    personId: str(m.personId),
    date: dayOrNull(m.date) || now.slice(0, 10),
    status: ['held', 'skipped', 'moved'].includes(m.status) ? m.status : 'held',
    mood: m.mood === null || m.mood === undefined ? null : clampInt(m.mood, 1, 5, 3),
    agenda: normalizeAgenda(m.agenda),
    notes: str(m.notes).slice(0, 20000),
    actions: normalizeActions(m.actions, { withOwner: true }),
    createdAt: isoOrNull(m.createdAt) || now,
  }));
  state.oneOnOnes = uniqueIds(oneOnOnes, '1:1s', warnings);
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
  // Schema v32: outbox drafts resolve against cases above; links resolve last.
  state.commsDrafts = normalizeCommsDrafts(raw.commsDrafts, state, now, warnings);
  // Schema v35: assumptions normalize after every evidence-source collection
  // and before links, so the typed premise graph resolves on the same load.
  state.premises = normalizePremises(raw.premises, state, now, state.settings, warnings);
  state.premiseOutcomes = normalizePremiseOutcomes(raw.premiseOutcomes, state, now, warnings);
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
