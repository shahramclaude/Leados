/**
 * app/core/domain/automation.js — Event-driven Cross-Module Rules & Parallel
 * Propagation Engine.
 *
 * When an Operational Case is registered, updated, escalated from an upstream
 * module, or resolved — or when a linked downstream mitigation completes —
 * this pure rules engine evaluates which LeadOS modules are affected and
 * creates, updates, or links records in parallel inside a single atomic store
 * transaction.
 *
 * Architectural guarantees:
 *  - Pure & deterministic: no DOM, network, wall-clock globals, or storage IO.
 *  - Idempotent & loop-safe: graph-aware checks prevent duplicate Decisions,
 *    Delegations, Goal check-ins, Stakeholder schedules, or Coaching topics
 *    across repeated edits and upstream escalations.
 *  - Privacy-preserving: confidential `conflicts` and anonymous `pulses` are
 *    never read, written, or linked by any rule.
 *  - Transparent & auditable: every propagation returns structured metadata
 *    and appends an explicit `automation.propagated` audit event.
 */

import { addDays, dayKey } from '../time.js';
import {
  FORBIDDEN_LINK_TYPES,
  LINK_ENTITY_TYPES,
  LINK_RELATIONS,
  classifyMendelowStakeholder,
  computeFmea,
  computePertImpact,
  isCaseOpen,
  isFmeaRated,
} from './cases.js';
import {
  buildCapacityModel,
  deliveryForecast,
  rankPortfolio,
  utilisationBand,
} from './capacity.js';
import { ACTIVE_REQUISITION_STATUSES, funnelStats, measurableEffort } from './hiring.js';
import {
  COMMITTED_CHANGE_STATUSES,
  OPEN_CHANGE_STATUSES,
  evaluateForceField,
  evaluateGuidingCoalition,
  evaluateStarAlignment,
  evaluateTopologyAndLoad,
  isChangeCommitted,
  isChangeOpen,
  pertStats,
} from './changes.js';
import { simulatePortfolio } from './simulation.js';
import {
  CALIBRATION_MIN_SAMPLES,
  OPTIMISM_RATIO_THRESHOLD,
  buildCaseForecastSnapshot,
  buildForecastSnapshot,
  caseCapacityReferenceClassAdjustment,
  caseCostCalibration,
  estimateCalibration,
  negotiationSettlementCalibration,
} from './calibration.js';
import {
  HIGH_STAKES_THRESHOLD,
  analyzeNegotiationIssue,
  evaluateNegotiationPrep,
  evaluateNegotiationSettlement,
  isNegotiationOpen,
  normalizeIssueInput,
  normalizeStringLists,
  summarizeNegotiation,
} from './negotiation.js';
import {
  commitmentCalibration as budgetCommitmentCalibration,
  evaluateBudget,
  formatMoney,
} from './finance.js';
import { FORECAST_INTEGRITY_RULES } from './forecastIntegrity.js';
import { TEMPO_RULES } from './decisionTempo.js';
import { RESILIENCE_RULES } from './resilience.js';
import { POWER_RULES } from './power.js';
import { ORG_RULES } from './orgNetwork.js';
import { COMMS_RULES } from './comms.js';
import { ALLOC_RULES } from './allocation.js';
import { LOAD_RULES } from './load.js';
import { PREMISE_RULES } from './premises.js';
import { DYN_RULES } from './dynamics.js';
import { CAP_RULES } from './policyPortfolio.js';
import {
  ADVERSE_STANCES,
  HIGH_SALIENCE_CLASSES,
  classifySalience,
  classifyStanceShift,
  collectEmbeddedStakeholders,
  initiativeVetoRisk,
  matchRegisterStakeholder,
} from './stakeholders.js';

export const AUTOMATION_RULES = [
  {
    id: 'RULE-EW-00',
    name: 'Nominal step-up early-warning scan',
    framework: 'Shewhart (1931) XmR · Benjamini & Hochberg (1995) nominal step-up · Wilson (1927) interval',
    trigger: 'watch.scan / case / delegation / decision / feedback / 1:1 / pulse / goal / negotiation events',
    targetModule: 'watch',
    description: 'Screens reconstructable series using nominal Shewhart rule scores and a BH-style step-up, without claiming verified error-rate control; records suppressed candidates and freezes at most one wholly future-week forecast per series and target.',
  },
  {
    id: 'RULE-EW-01',
    name: 'Confirmed alert → operational case',
    framework: 'Human-in-the-loop escalation (Parasuraman & Riley, 1997) · Reason (1990)',
    trigger: 'watch.triaged (verdict = confirmed)',
    targetModule: 'cases',
    description: 'A statistical signal alone does not open a case; governance rules may create decisions. A recorded human confirmation opens exactly one operational case with its evidence frozen in the summary, linked by a typed escalates-from edge so the case engine can cascade normally.',
  },
  {
    id: 'RULE-EW-02',
    name: 'Untriaged alert → triage decision',
    framework: 'Kahneman (2011) omission neglect · Decision tempo',
    trigger: 'any watchable event while an alert is past its triage deadline',
    targetModule: 'decisions',
    description: 'An alert left open past the policy deadline opens exactly one DACI decision listing the four honest ways to close it, because a signal nobody judges is silently teaching the leader to ignore the next one.',
  },
  {
    id: 'RULE-EW-03',
    name: 'Alert budget exhaustion → monitoring-scope decision',
    framework: 'Alarm fatigue & attention economics (SANS-style precision budgets)',
    trigger: 'scan that suppressed a real candidate for budget',
    targetModule: 'decisions',
    description: 'When the scan suppresses a screening candidate because the budget is spent, exactly one decision about the monitoring scope is opened per window — raise the budget, narrow the series set, tighten q, or accept the blind spot.',
  },
  {
    id: 'RULE-EW-04',
    name: 'Detector precision guard',
    framework: 'Alert-precision measurement (Wilson interval) · Dawes (1979) baselines',
    trigger: 'any watchable event once enough verdicts exist',
    targetModule: 'decisions',
    description: 'When measured alert precision falls below the declared tolerance at the verdict floor, exactly one re-tuning decision is opened per quarter rather than letting a noisy detector quietly train the leader to dismiss it.',
  },
  {
    id: 'RULE-STAKE-01',
    name: 'Mendelow coalition cadence scheduler',
    framework: 'Mendelow (1981) Power × Interest Matrix',
    trigger: 'case.created / case.updated',
    targetModule: 'cases.stakeholders',
    description: 'Assigns communication cadence and next check-in dates for high-power or high-interest stakeholders lacking a schedule.',
  },
  {
    id: 'RULE-DEC-01',
    name: 'Strategic DACI tradeoff decision log',
    framework: 'Bain RAPID / Intuit DACI & Expected-Value Risk Governance',
    trigger: 'case.created / case.updated',
    targetModule: 'decisions',
    description: 'Creates and links a structured DACI Decision record when Action Priority is High, expected exposure >= 10,000, or the case is an escalation/strategic initiative.',
  },
  {
    id: 'RULE-DEL-01',
    name: 'Accountable mitigation delegation',
    framework: 'Situational Leadership & Explicit Authority Levels',
    trigger: 'case.created / case.updated',
    targetModule: 'delegations',
    description: 'Creates and links an accountable mitigation delegation for the active case owner when preventive action or elevated FMEA priority is present.',
  },
  {
    id: 'RULE-GOAL-01',
    name: 'Goal risk & confidence propagation',
    framework: 'OKR Risk Telemetry & Leading Indicators (Doerr, 2018)',
    trigger: 'case.created / case.updated / case.resolved',
    targetModule: 'goals',
    description: 'Links impacted active goals, shifts on-track goals to at-risk under High-priority cases with an explainable check-in, and logs resolution updates.',
  },
  {
    id: 'RULE-COACH-01',
    name: 'Blameless 1:1 support & coaching prep',
    framework: 'Edmondson (1999) Psychological Safety & Reason (1990) Blameless Learning',
    trigger: 'case.created / case.updated',
    targetModule: 'people',
    description: 'Links involved active team members and queues a blameless support/barrier talking point for their next 1:1 without affecting performance ratings.',
  },
  {
    id: 'RULE-COACH-02',
    name: 'Case closure learning → coaching follow-through',
    framework: 'Google SRE blameless postmortems & double-loop learning (Argyris & Schön, 1978)',
    trigger: 'case.resolved / case.reopened',
    targetModule: 'people / 1:1 prep',
    description: 'Transitions only the case-generated, case-ID-tagged 1:1 topic from active support to systemic learning on resolution, and restores it if the case is reopened; employee-authored topics and review ratings are untouched.',
  },
  {
    id: 'RULE-SYNC-DEL-01',
    name: 'Mitigation completion feedback loop',
    framework: 'Closed-Loop Operational Control (Meadows, 2008)',
    trigger: 'delegation.completed',
    targetModule: 'cases',
    description: 'Advances open/mitigating cases to monitoring when all linked mitigation delegations are completed so residual risk can be verified.',
  },
  {
    id: 'RULE-CAP-04',
    name: 'Delegation completion → portfolio delivery',
    framework: 'Closed-Loop Operational Control (Deming PDCA) & WIP Integrity (Little, 1961)',
    trigger: 'delegation.completed',
    targetModule: 'portfolio',
    description: 'Marks explicitly linked, open portfolio work delivered on the recorded delegation completion date, preserving its typed link and freeing capacity without requiring a second update.',
  },
  {
    id: 'RULE-CAP-01',
    name: 'Capacity reserve registration & release',
    framework: 'Capacity Planning & Queueing Theory (Little, 1961; Kingman, 1961)',
    trigger: 'case.created / case.updated / case.resolved',
    targetModule: 'portfolio',
    description: 'Registers (or refreshes) the person-days an open case diverts as a committed capacity reserve, and releases them when the case is resolved — so the operating plan counts reality without a second data entry.',
  },
  {
    id: 'RULE-CAP-02',
    name: 'Over-allocation trade-off decision',
    framework: 'Marginal Analysis & Explicit Deferral (Economics of scarcity)',
    trigger: 'case.created / case.updated',
    targetModule: 'decisions',
    description: 'When committed work exceeds allocatable capacity, opens one DACI decision with the concrete deferral options that would restore feasibility, ranked by value density.',
  },
  {
    id: 'RULE-CAP-03',
    name: 'Portfolio decision → goal impact',
    framework: 'OKR Risk Telemetry (Doerr, 2018) & Opportunity Cost',
    trigger: 'portfolio.decided',
    targetModule: 'goals',
    description: 'Records an explainable check-in on the linked goal when its funded work is deferred or cut, so a capacity decision is never silently detached from the objective it starves.',
  },
  {
    id: 'RULE-CAP-05',
    name: 'Probabilistic tail-risk goal & trade-off propagation',
    framework: 'Beta-PERT Monte Carlo (Malcolm et al., 1959) & Flaw of Averages (Savage, 2009)',
    trigger: 'portfolio.created / portfolio.updated / portfolio.decided / capacity.synced',
    targetModule: 'goals / decisions',
    description: 'Evaluates seeded Beta-PERT Monte Carlo trials: shifts linked active goals to at-risk when joint on-time target confidence drops below 35%, and opens one DACI tail-risk decision when right-skewed PERT variance pushes horizon overload odds ≥ 50% despite a feasible point-estimate mean.',
  },
  {
    id: 'RULE-CAP-06',
    name: 'Settled diverted-days → calibrated case capacity reserve',
    framework: 'Reference-Class Forecasting (Flyvbjerg, 2006), Robust Statistics & Queueing Theory (Little, 1961)',
    trigger: 'case.resolved / case.actuals',
    targetModule: 'portfolio / capacity / decisions / goals',
    description: 'After at least five recorded diverted-days settlements show a median actual/forecast ratio ≥1.25×, sizes open case reserves from the team’s observed capacity reference class (P80 for high-priority cases), then re-evaluates Little’s Law/Kingman load and Monte Carlo tail risk. Source estimates and the immutable calibration baseline are never rewritten.',
  },
  {
    id: 'RULE-HIRE-01',
    name: 'Requisition interview-effort reserve',
    framework: 'Capacity Planning (Little, 1961) & Explicit-Estimate Discipline',
    trigger: 'requisition.opened / requisition.updated / requisition.closed',
    targetModule: 'portfolio',
    description: 'Registers the interviewer effort an active requisition diverts as committed capacity, refreshes it when estimates change, and completes or releases it when the role is filled, cancelled or put on hold. No estimate is ever invented: a requisition without a recorded effort reserves nothing.',
  },
  {
    id: 'RULE-HIRE-02',
    name: 'Offer accepted → roster, onboarding & delivery loop',
    framework: 'Closed-Loop Hiring Handoff (Deming PDCA) & Organizational Socialization (Bauer & Erdogan, 2011)',
    trigger: 'candidate.offer-accepted',
    targetModule: 'people / onboarding / portfolio',
    description: 'Links the accepted candidate to the roster record and its 30-60-90 plan, closes the requisition and its capacity reserve as delivered, and records the typed graph edges so the hire is traceable from requisition to first 90 days.',
  },
  {
    id: 'RULE-HIRE-03',
    name: 'Stalled requisition risk escalation',
    framework: 'Cost of Vacancy & Operational Risk Escalation (Hubbard, 2020)',
    trigger: 'requisition.reviewed',
    targetModule: 'cases',
    description: 'Raises exactly one operational case for a requisition that has stopped moving for the configured window, so vacancy exposure inherits FMEA, PERT financial analysis, stakeholder coalitions, a DACI decision and an accountable delegation instead of sitting in a hiring tab nobody opens.',
  },
  {
    id: 'RULE-ESC-01',
    name: 'Upstream operational escalation',
    framework: 'Cross-Module Incident & Risk Escalation',
    trigger: 'case.escalated',
    targetModule: 'cases',
    description: 'Promotes a blocked delegation, at-risk/off-track goal, or adverse decision into a full Operational Case and fans out parallel downstream links.',
  },
  {
    id: 'RULE-CHG-01',
    name: 'Change transition capacity reserve',
    framework: 'J-Curve Transition Economics (Satir, 1991) & Capacity Planning (Little, 1961)',
    trigger: 'change.created / change.updated / change.statusChanged',
    targetModule: 'portfolio',
    description: 'Registers the person-days an active or stabilising organizational change consumes as a committed capacity reserve, completes it when anchored, and releases it if paused or abandoned.',
  },
  {
    id: 'RULE-CHG-02',
    name: 'Structural change DACI governance',
    framework: 'Intuit DACI & Porter (1996) Strategic Trade-Offs',
    trigger: 'change.created / change.updated',
    targetModule: 'decisions',
    description: 'Creates and links an explicit DACI decision record with non-goals, PERT effort, and review horizon for structural/irreversible team changes.',
  },
  {
    id: 'RULE-CHG-03',
    name: 'Role-transition 30-60-90 & 1:1 support scaffolding',
    framework: 'Watkins (2003) Role Transitions & Edmondson (1999) Psychological Safety',
    trigger: 'change.created / change.updated / change.statusChanged',
    targetModule: 'onboarding / people',
    description: 'Queues blameless 1:1 role-clarity/load check-ins for impacted people and creates linked 30-60-90 role-transition plans when opted in — automatically feeding transition ramps into team capacity.',
  },
  {
    id: 'RULE-CHG-04',
    name: 'Guiding coalition & veto-player briefing cadence',
    framework: 'Kotter (1996) Guiding Coalition & Tsebelis (2002) Veto Players',
    trigger: 'change.created / change.updated',
    targetModule: 'changes.coalition',
    description: 'Schedules briefing checkpoints for Mendelow key players and veto gatekeepers lacking a next briefing date.',
  },
  {
    id: 'RULE-CHG-05',
    name: 'Change blocker → goal risk & anchoring telemetry',
    framework: 'Lewin (1951) Force-Field Equilibrium & OKR Telemetry (Doerr, 2018)',
    trigger: 'change.created / change.updated / change.anchored',
    targetModule: 'goals / decisions',
    description: 'Links strategic goals, flags goals at-risk when an active change hits a force-field stalemate or opposing veto player, and records verified anchoring updates.',
  },
  {
    id: 'RULE-SCN-01',
    name: 'Scenario trade-off commitment & governance propagation',
    framework: 'Scenario Planning (Schoemaker, 1995), Double-Loop Learning (Argyris & Schön, 1978) & DACI Governance',
    trigger: 'scenario.decided / scenario.committed',
    targetModule: 'decisions / portfolio / cases / changes / settings / goals',
    description: 'Links recorded What-If scenario DACI decisions to every governed portfolio commitment, operational case, org change, and requisition via typed graph edges, and — when levers are committed — atomically executes portfolio deferrals/reassignments, case reserve releases, change barrier/status updates, and downstream RULE-CAP-01/03/05 & RULE-CHG-01..05 cascades.',
  },
  {
    id: 'RULE-FCT-01',
    name: 'Funding-time forecast freeze',
    framework: 'Superforecasting & Forecast Scoring (Tetlock & Gardner, 2015) — score the forecast that was made',
    trigger: 'portfolio.created / portfolio.decided',
    targetModule: 'portfolio',
    description: 'When planned work is funded, freezes the PERT effort distribution, expected value and target date into an immutable forecastSnapshot so delivery actuals are scored against what was believed at commitment — later estimate edits cannot rewrite history. Cleared if the item is un-funded, so a later re-funding freezes the new commitment honestly.',
  },
  {
    id: 'RULE-FCT-02',
    name: 'Systematic-optimism governance decision',
    framework: 'Planning Fallacy (Kahneman & Tversky, 1979) & Reference-Class Forecasting (Flyvbjerg, 2006)',
    trigger: 'portfolio.completed / portfolio.actuals',
    targetModule: 'decisions',
    description: 'When at least 5 delivered items have recorded actuals and the median actual/estimate ratio reaches 1.25×, opens one DACI decision with reference-class uplift options (median and P80 ratio uplifts, estimation-practice investigation, or explicit acceptance), linked to the worst overrun. Idempotent while that decision awaits its outcome review.',
  },
  {
    id: 'RULE-FCT-03',
    name: 'Opening case-forecast freeze',
    framework: 'FAIR Quantitative Risk (Freund & Jones, 2015) & Score-the-Forecast-Made (Tetlock, 2005)',
    trigger: 'case.created / case.updated',
    targetModule: 'cases',
    description: 'When an open operational case first carries a measured PERT exposure, diverted-capacity estimate or planned mitigation spend, freezes those opening beliefs (exposure distribution, capacity days, mitigation cost, pre-mitigation FMEA probability) into an immutable forecastSnapshot so settled actuals at resolution are scored against the numbers that drove the escalate/mitigate decision. Later estimate refinement stays legitimate case work; it cannot rewrite the opening call.',
  },
  {
    id: 'RULE-FCT-04',
    name: 'Case-cost under-reserving governance decision',
    framework: 'Actuarial Loss Development & Case-Reserve Adequacy; Reference-Class Forecasting (Flyvbjerg, 2006)',
    trigger: 'case.resolved / case.actuals',
    targetModule: 'decisions',
    description: 'When at least 5 materialised cases have settled actuals and the median realised/assessed exposure ratio reaches 1.25×, opens one DACI decision with reference-class contingency uplifts (median development factor on new case exposures, P80 reserving for High-priority cases, exposure-assessment practice investigation, or explicit self-insured acceptance), linked to the worst under-estimated case. Idempotent while that decision awaits its outcome review.',
  },
  {
    id: 'RULE-NEG-01',
    name: 'Negotiation mandate, provenance & prep propagation',
    framework: 'Fisher & Ury (1981) Principled Negotiation & BATNA; Raiffa (1982) ZOPA; Intuit DACI governance',
    trigger: 'negotiation.created / negotiation.updated',
    targetModule: 'decisions / people / 1:1 prep / graph',
    description: 'Links the negotiation to its originating case, change, requisition, decision or goal via typed edges; for strategic or high-stakes (≥ 25,000 recorded deal value) negotiations creates one idempotent DACI mandate decision (pursue agreement vs execute BATNA); and queues a marked BATNA/ZOPA prep topic on the active owner’s next 1:1. Counterparty estimates are labelled as estimates and never enter performance ratings.',
  },
  {
    id: 'RULE-NEG-02',
    name: 'Agreement terms → owned commitments & decision closeout',
    framework: 'Fisher & Ury (1981) commitment discipline; Deming PDCA closed-loop control; OKR telemetry (Doerr, 2018)',
    trigger: 'negotiation.agreed',
    targetModule: 'delegations / decisions / goals',
    description: 'Converts each agreed term with a recorded owner into an accountable, linked delegation with its due date; terms without an owner are surfaced as explicit ownership gaps rather than silently assigned; closes the mandate decision onto the outcome-review queue; and logs an explainable check-in on any linked goal. Idempotent per agreed term.',
  },
  {
    id: 'RULE-NEG-04',
    name: 'Negotiated commitment delivery feedback',
    framework: 'PDCA closed-loop execution; evidence-based goal check-ins',
    trigger: 'delegation.completed / delegation.returned',
    targetModule: 'negotiations / goals / audit',
    description: 'Records delivery or return against the originating agreement and adds neutral goal telemetry without changing confidence, progress, financial actuals or decision outcomes.',
  },
  {
    id: 'RULE-NEG-03',
    name: 'Impasse → operational escalation case',
    framework: 'Cross-Module Escalation; Fisher & Ury BATNA discipline; AIAG-VDA FMEA & Mendelow coalition management',
    trigger: 'negotiation.impasse',
    targetModule: 'cases',
    description: 'Raises exactly one operational escalation case for a negotiation stuck at impasse, prefilled with the reservation gap (ZOPA analysis), BATNA position and stakes, so the deadlock inherits FMEA priority, a DACI decision, accountable delegation, capacity reserve and blameless coaching through the standard case fan-out. Resuming talks does not close the case; its history stays linked. Idempotent while an open case is linked.',
  },
  {
    id: 'RULE-NEG-05',
    name: 'Returned-commitment recovery & lineage cascade',
    framework: 'Oncken & Wass (1974) Monkey Management; Hersey & Blanchard (1977) Situational Leadership; Leveson (2011) Closed-Loop Fault Recovery; Ohno (1988) Andon Countermeasure before Restart',
    trigger: 'delegation.redelegated / negotiation.term.recovered',
    targetModule: 'delegations / negotiations / 1:1 prep / graph / audit',
    description: 'When a returned delegation or negotiated commitment is explicitly recovered, preserves the returned delegation record immutable in history (stamped with supersededByDelegationId and recoveredOn), creates the successor active delegation with priorDelegationId and recoveryNote, appends the prior owner and return reason to the agreement term’s priorOwners lineage, wires typed follow-up/mitigation links, and queues a 1:1 handover coaching topic for the new owner containing the prior return reason and countermeasure.',
  },
  {
    id: 'RULE-NEG-06',
    name: 'Post-agreement settlement & implementation-shortfall governance',
    framework: 'Williamson (1985) Transaction Cost Economics (Ex-Post Governance); Hart & Moore (1988) Incomplete Contracts; Perold (1988) Implementation Shortfall; Raiffa (1982) BATNA Regret Check',
    trigger: 'negotiation.settled',
    targetModule: 'negotiations / decisions / goals / graph / audit',
    description: 'When an agreed negotiation records ex-post settlement actuals (realised deal value, counterparty delivery, or quantitative term settlements), logs idempotent settlement telemetry on any linked goal and — when the realised outcome breaches the walk-away BATNA, suffers counterparty non-delivery, or incurs material implementation shortfall — opens or updates a linked DACI post-settlement governance decision.',
  },
  {
    id: 'RULE-NEG-07',
    name: 'Settled agreements → direction-aware reference-class calibration',
    framework: 'Flyvbjerg (2006) Reference-Class Forecasting; Perold (1988) Implementation Shortfall; Deming PDCA',
    trigger: 'negotiation.settled',
    targetModule: 'calibration / insights / negotiation preparation',
    description: 'Feeds explicitly recorded deal-level signed-versus-realised values into a derived outside-view cohort segmented by currency and issue direction. Cohorts below n=5 show counts only; a material median shortfall at n≥5 raises NEG-09. No FX conversion, unverified savings claim, or automatic change to future negotiation assumptions is made.',
  },
  {
    id: 'RULE-FIN-01',
    name: 'Envelope forecast breach → DACI trade-off decision',
    framework: 'Budgetary Control & Variance Analysis (Anthony & Govindarajan); Commitment/Encumbrance Accounting (GASB budgetary accounting)',
    trigger: 'budget.created / budget.updated / budget.lineChanged',
    targetModule: 'decisions / graph',
    description: 'When forecast at completion (recorded actuals + open encumbrances, single currency by construction) exceeds the recorded envelope ceiling, opens exactly one linked DACI decision with release/defer options ranked by encumbered amount and the explicit envelope-increase ask. Idempotent while that decision is open; the ceiling and recorded amounts are never rewritten.',
  },
  {
    id: 'RULE-FIN-02',
    name: 'Budget line ↔ funded-work graph, goal telemetry & actuals-due loop',
    framework: 'Closed-Loop Operational Control (Deming PDCA); OKR Telemetry (Doerr, 2018)',
    trigger: 'budget.lineChanged / case.resolved / negotiation.settled / portfolio.delivered',
    targetModule: 'graph / goals / budgets',
    description: 'Links every sourced budget line to the record it funds with a typed `funds` edge and logs a neutral, idempotent funding check-in on linked active goals. In reverse, when a funded case resolves, negotiation settles or portfolio item is delivered, open encumbrances for that source are stamped actuals-due in the same transaction so the spend is recorded from evidence — never copied from the committed figure.',
  },
  {
    id: 'RULE-FIN-03',
    name: 'Recorded actuals → commitment-accuracy reference class',
    framework: 'Flyvbjerg (2006) Reference-Class Forecasting; Planning Fallacy (Kahneman & Tversky, 1979); Deming PDCA',
    trigger: 'budget.actualRecorded',
    targetModule: 'calibration / insights / finance',
    description: 'Feeds each explicitly recorded actual-vs-committed pair into the fifth calibration ledger. Ratios are dimensionless and pool across currencies without FX conversion; below n=5 the ledger is counts-only. A sufficient median overrun raises FIN-04 and yields a clearly-labelled calibrated forecast shown beside — never instead of — the recorded forecast.',
  },
  {
    id: 'RULE-STK-01',
    name: 'Stakeholder register reconciliation & involvement graph',
    framework: 'Mendelow (1981) Power × Interest; Mitchell, Agle & Wood (1997) Stakeholder Salience; Contextual Integrity (Nissenbaum, 2009)',
    trigger: 'case.created / case.updated / change.created / change.updated / negotiation.created / negotiation.updated / stakeholder.created / stakeholder.updated',
    targetModule: 'stakeholders / graph',
    description: 'Matches each embedded case/change/negotiation stakeholder stub to a register record by exact normalized name or internal person link (strict matching — a near-miss stays unmapped, never guessed into an edge) and maintains one idempotent typed `involves` edge per pair. Reverse reconciliation runs when a register record is saved. Unmapped stubs are counted as hygiene findings, not silently invented.',
  },
  {
    id: 'RULE-STK-02',
    name: 'Adverse veto player → alignment DACI decision',
    framework: 'Tsebelis (1995, 2002) Veto Player Theory; Bain RAPID / Intuit DACI',
    trigger: 'stakeholder reconciled on an open case / change / negotiation',
    targetModule: 'decisions / graph',
    description: 'When an open initiative carries a recorded veto player at skeptical/blocker stance (initiative-specific embedded stance overrides the register default), opens exactly one linked DACI alignment decision with package-redesign, direct-alignment and documented-escalation options. Idempotent while that decision stays open; the veto flag and stance are never rewritten.',
  },
  {
    id: 'RULE-STK-03',
    name: 'Adverse stance-shift → high-salience communication response',
    framework: 'Mitchell, Agle & Wood (1997) Dynamic Salience; Lax & Sebenius (2006) Coalition Management',
    trigger: 'stakeholder.stanceLogged',
    targetModule: 'people (1:1 talking points) / stakeholders',
    description: 'A logged adverse shift on a definitive/dominant/dangerous register stakeholder linked to an internal roster entry queues one managed, blameless 1:1 talking point carrying the shift and its context, idempotent per stakeholder. External stakeholders surface through the STK-04 contact-cadence watch instead; no internal record is invented for an external actor.',
  },
  {
    id: 'RULE-STK-04',
    name: 'Salience & contact-cadence watch',
    framework: 'Mendelow (1981) communication cadence; Mitchell et al. (1997) urgency dynamics',
    trigger: 'derived (every render / signal build)',
    targetModule: 'insights / today / stakeholders',
    description: 'Pure read-side rule — writes nothing. Overdue contact on high-salience stakeholders, high-urgency stakeholders without a next contact, and low-confidence veto assessments become STK-03/06/07 signals and Today triage items, so political decay is surfaced without fabricating schedules or meetings.',
  },
  // Schema v26: the forecast-integrity rules live in their own pure module and
  // are registered here so the rule catalog, UI and tests see one spine.
  ...FORECAST_INTEGRITY_RULES,
  // Schema v31: Impact Ledger rules. One scored pre-registered study fans out
  // into typed links, a scale/stop DACI decision, a blameless process check-in
  // and a proposed replication — atomically, idempotently, and only when the
  // evidence actually supports an action.
  {
    id: 'RULE-IMP-01',
    name: 'Link & derive the study',
    description: 'Links a study to the intervention record and the people it touched through the typed graph, and refreshes a live derived verdict without ever rewriting a frozen evaluation.',
    trigger: 'Any impact.* event, or an explicit Impact-ledger scan.',
    effect: 'Typed `evaluates` / `involves` links plus a derived snapshot on the study.',
  },
  {
    id: 'RULE-IMP-02',
    name: 'Decisive evidence becomes an owned decision',
    description: 'A confirmatory study whose record supports or contradicts the pre-registered hypothesis opens exactly one DACI scale/stop/redesign decision. Underpowered and trend-broken studies deliberately open none: "we could not measure it" is not a mandate.',
    trigger: 'Study locked with verdict supported or not-supported and grade confirmatory.',
    effect: 'One DACI decision, one `decides` link.',
  },
  {
    id: 'RULE-IMP-03',
    name: 'Contradicted intervention becomes a blameless prompt',
    description: 'When an intervention that touched people is contradicted by the record, adds one talking point framed around the mechanism rather than the person.',
    trigger: 'Study locked with verdict not-supported and a resolvable intervention record.',
    effect: 'Up to two blameless 1:1 talking points, idempotent.',
  },
  {
    id: 'RULE-IMP-04',
    name: 'Replicate your own win',
    description: 'A supported confirmatory study proposes exactly one replication over a fresh window. One positive result is an anecdote with a p-value; the system asks the leader to try to disprove it.',
    trigger: 'Study locked with verdict supported and grade confirmatory.',
    effect: 'One proposed replication study and a `replicates` link.',
  },
  {
    id: 'RULE-IMP-05',
    name: 'Score your own effect-size optimism',
    description: 'Compares declared effect sizes with realised ones across every evaluable study and reports the median ratio. Leaders who have overestimated by more than a factor of two get told so, with the number attached, because an unexamined optimism prior quietly discredits every future estimate.',
    trigger: 'At least three evaluable studies with a declared magnitude.',
    effect: 'One calibration finding, no write.',
  },
  {
    id: 'RULE-IMP-06',
    name: 'Name the trend that would have been miscredited',
    description: 'When a metric was already drifting before the intervention, shows the drift as a percentage per week next to the estimate it would have inflated. This is the failure mode a naive before/after comparison cannot see and a leader cannot be expected to notice by eye.',
    trigger: 'A study whose pre-period slope is significant at the pre-trend threshold.',
    effect: 'One explanatory finding, no write.',
  },
  // Schema v32: stakeholder comms outbox (RULE-COMMS-01..04). Drafts only;
  // nothing is sent by the app.
  ...COMMS_RULES,
  // Schema v28: decision-tempo post-commit rules (RULE-DLY-01..06).
  ...TEMPO_RULES,
  // Schema v29: operational resilience & continuity rules (RULE-RES-01..06).
  ...RESILIENCE_RULES,
  // Schema v30: coalition & incentive war-room rules (RULE-PWR-01..06).
  ...POWER_RULES,
  // Session 48: influence-network intelligence rules (RULE-ORG-01..05).
  // Additive on Schema v30 — a derived lens, no new record collection.
  ...ORG_RULES,
  // Schema v33: Allocation Governor rules (RULE-ALLOC-01..04). Settled
  // portfolio evidence learns what each ambition horizon returns per
  // person-day; an exploration-floor breach opens one rebalancing decision.
  ...ALLOC_RULES,
  // Schema v34: Cognitive Load & Attention Governor rules (RULE-LOAD-01..04).
  // Recorded commitments, stewardships and collaboration structure become a
  // per-person saturation index, a Monte Carlo overload probability and
  // Little/Kingman queue waits; saturation opens one load-shedding decision.
  ...LOAD_RULES,
  // Schema v35: Premise Sentinel / Assumption Ledger (RULE-PREM-01..04).
  // A declarative sensor registry turns dated facts from every module into
  // append-only, half-life-discounted Bayesian evidence; a signpost breach
  // fans out to a DACI re-decision, delegation and blameless 1:1 prompt.
  ...PREMISE_RULES,
  ...DYN_RULES,
  ...CAP_RULES,
];

const DECISION_EXPOSURE_THRESHOLD = 10_000;

export function cadenceDaysOffset(quadrant, stance) {
  if (quadrant === 'manage-closely' && (stance === 'blocker' || stance === 'skeptical')) return 1;
  if (quadrant === 'manage-closely') return 3;
  if (quadrant === 'keep-satisfied') return 5;
  if (quadrant === 'keep-informed') return 7;
  return 14;
}

function defaultCadenceFor(quadrant, stance) {
  if (quadrant === 'manage-closely' && (stance === 'blocker' || stance === 'skeptical')) return 'immediate';
  if (quadrant === 'manage-closely') return 'weekly';
  if (quadrant === 'keep-satisfied') return 'milestone';
  if (quadrant === 'keep-informed') return 'weekly';
  return 'digest';
}

function addDaysKey(baseDayStr, days, fallbackNow) {
  const anchor = baseDayStr ? new Date(`${baseDayStr}T12:00:00Z`) : fallbackNow;
  return dayKey(addDays(anchor, days));
}

function hasCaseLinkToType(links, caseId, targetType, allowedRelations = null) {
  return (links || []).find((l) => {
    if (!l) return false;
    const relOk = !allowedRelations || allowedRelations.includes(l.relation);
    if (!relOk) return false;
    return (
      (l.sourceType === 'case' && l.sourceId === caseId && l.targetType === targetType) ||
      (l.targetType === 'case' && l.targetId === caseId && l.sourceType === targetType)
    );
  }) || null;
}

function hasExactLink(links, sourceType, sourceId, targetType, targetId, relation) {
  return (links || []).find(
    (l) =>
      l &&
      l.sourceType === sourceType &&
      l.sourceId === sourceId &&
      l.targetType === targetType &&
      l.targetId === targetId &&
      l.relation === relation,
  ) || null;
}

/**
 * Idempotently register a typed edge in `draft.links`, enforcing privacy walls.
 */
export function ensureEntityLink(draft, spec, { idFactory, todayStr, nowIso }) {
  const { sourceType, sourceId, targetType, targetId, relation, ruleId = '', summary = '' } = spec;
  if (
    !LINK_ENTITY_TYPES.includes(sourceType) ||
    !LINK_ENTITY_TYPES.includes(targetType) ||
    FORBIDDEN_LINK_TYPES.includes(sourceType) ||
    FORBIDDEN_LINK_TYPES.includes(targetType) ||
    !LINK_RELATIONS.includes(relation) ||
    !sourceId ||
    !targetId
  ) {
    return { created: false, link: null };
  }
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  const existing = hasExactLink(draft.links, sourceType, sourceId, targetType, targetId, relation);
  if (existing) return { created: false, link: existing };

  const link = {
    id: idFactory('lnk'),
    sourceType,
    sourceId,
    targetType,
    targetId,
    relation,
    ruleId: ruleId || '',
    summary: summary || '',
    createdOn: todayStr,
    createdAt: nowIso,
  };
  draft.links.push(link);
  return { created: true, link };
}

function shouldCreateDecision(caseRecord, fmea, pert, options = {}) {
  if (options.propagateDecision === false) return false;
  if (options.propagateDecision === true) return true;
  return (
    (isFmeaRated(caseRecord.fmea) && fmea.actionPriority === 'high') ||
    caseRecord.kind === 'escalation' ||
    caseRecord.kind === 'initiative' ||
    pert.cost.expected >= DECISION_EXPOSURE_THRESHOLD
  );
}

function shouldCreateDelegation(caseRecord, fmea, owner, options = {}) {
  if (!owner || owner.status === 'archived') return false;
  if (options.propagateDelegation === false) return false;
  if (options.propagateDelegation === true) return true;
  const preventive = (caseRecord?.rca?.preventiveAction || '').trim();
  return Boolean(preventive.length >= 4 || (isFmeaRated(caseRecord.fmea) && (fmea.actionPriority === 'high' || fmea.actionPriority === 'medium')));
}

function coachingPromptForCase(caseRecord, phase = 'active') {
  const shortTitle = (caseRecord.title || 'Operational case').trim().slice(0, 56);
  const ref = `; ref ${caseRecord.id})`;
  return phase === 'resolved'
    ? `Case learning (${shortTitle}${ref}: review which systemic safeguard held, what remains uncertain, and what support is needed next time — not individual blame or performance rating`
    : `Case support (${shortTitle}${ref}: review systemic barriers, capacity trade-offs & air-cover needed`;
}

/**
 * Keep the case-generated 1:1 topic in step with the case lifecycle. The case
 * reference makes this reversible without guessing which employee-authored
 * topic belongs to which case. Existing untagged legacy topics are left alone.
 */
export function syncCaseCoachingPromptPhase(draft, caseRecord, phase, { logEvent = null } = {}) {
  const entries = [];
  if (!draft || !caseRecord || caseRecord.autoPropagate === false || !['active', 'resolved'].includes(phase)) return entries;

  const marker = `; ref ${caseRecord.id})`;
  const activePrompt = coachingPromptForCase(caseRecord, 'active');
  const resolvedPrompt = coachingPromptForCase(caseRecord, 'resolved');
  const personIds = [...new Set([caseRecord.ownerId, ...(caseRecord.involvedPersonIds || [])].filter(Boolean))];
  for (const personId of personIds) {
    const person = (draft.people || []).find((p) => p.id === personId && p.status === 'active');
    if (!person) continue;
    person.talkingPoints = Array.isArray(person.talkingPoints) ? person.talkingPoints : [];
    const activeIndex = person.talkingPoints.findIndex((text) => String(text).startsWith('Case support (') && String(text).includes(marker));
    const resolvedIndex = person.talkingPoints.findIndex((text) => String(text).startsWith('Case learning (') && String(text).includes(marker));
    let action = '';
    if (phase === 'resolved' && activeIndex >= 0) {
      person.talkingPoints[activeIndex] = resolvedPrompt;
      action = 'updated';
    } else if (phase === 'active' && resolvedIndex >= 0) {
      person.talkingPoints[resolvedIndex] = activePrompt;
      action = 'reopened';
    } else if (phase === 'active' && activeIndex < 0 && resolvedIndex < 0 && person.talkingPoints.length < 12) {
      person.talkingPoints.push(activePrompt);
      action = 'queued';
    }
    if (!action) continue;
    const entry = {
      ruleId: 'RULE-COACH-02',
      targetType: 'person',
      targetId: person.id,
      action,
      summary: phase === 'resolved'
        ? `Changed ${person.name}'s case topic to blameless systemic learning`
        : `Restored ${person.name}'s active case-support topic`,
    };
    entries.push(entry);
    if (logEvent) {
      logEvent({
        type: 'automation.propagated',
        entity: 'person',
        entityId: person.id,
        summary: `[RULE-COACH-02] ${entry.summary}`,
      });
    }
  }
  return entries;
}


/* ------------------------------------------------------------------ */
/* Capacity & flow (Schema v16)                                        */
/* ------------------------------------------------------------------ */

/** The reserve entry that represents one case's diverted person-days. */
function findCapacityReserve(draft, caseId) {
  return (draft.portfolio || []).find(
    (p) => p && p.kind === 'capacity-reserve' && p.sourceType === 'case' && p.sourceId === caseId,
  ) || null;
}

function capacityTripleForCase(caseRecord) {
  const fin = caseRecord?.financial || {};
  const o = Math.max(0, Number(fin.capacityDaysOptimistic) || 0);
  const m = Math.max(0, Number(fin.capacityDaysMostLikely) || 0);
  const p = Math.max(0, Number(fin.capacityDaysPessimistic) || 0);
  return { optimistic: o, mostLikely: m, pessimistic: p };
}

function capacityReserveSizing(draft, caseRecord, caseCalibration = null) {
  const base = capacityTripleForCase(caseRecord);
  const calibration = caseCalibration || caseCostCalibration(draft || {});
  const adjustment = caseCapacityReferenceClassAdjustment(base, calibration, {
    highPriority: isFmeaRated(caseRecord?.fmea) && computeFmea(caseRecord?.fmea).actionPriority === 'high',
  });
  return { triple: adjustment?.adjustedTriple || base, adjustment };
}

/**
 * RULE-CAP-01 — keep the operating plan's committed capacity equal to reality.
 *
 * Creating a case with a capacity estimate registers a committed reserve;
 * editing the estimate refreshes it in place (the reserve keeps its id, so
 * history and links survive); resolving the case releases it. Every branch is
 * idempotent: re-running the rules changes nothing when the numbers already
 * agree.
 */
export function syncCaseCapacityReserve(draft, caseRecord, { now, idFactory, todayStr, nowIso, logEvent = null } = {}) {
  return applyCapacityReserve(draft, caseRecord, { now, idFactory, todayStr, nowIso, logEvent });
}

/**
 * RULE-CAP-06: a newly settled case may change the team's diverted-days
 * reference class. Re-size every open case reserve in the same transaction,
 * then re-check deterministic and Monte Carlo plan feasibility.
 */
export function refreshCalibratedCaseCapacityReserves(draft, { now = new Date(), idFactory, logEvent = null, triggerLabel = 'case settlement' } = {}) {
  if (!draft) return [];
  const todayStr = dayKey(now);
  const nowIso = now.toISOString();
  const caseCalibration = caseCostCalibration(draft);
  const propagations = [];
  for (const caseRecord of draft.cases || []) {
    if (!isCaseOpen(caseRecord) || caseRecord.autoPropagate === false) continue;
    const entry = applyCapacityReserve(draft, caseRecord, { now, idFactory, todayStr, nowIso, logEvent, caseCalibration });
    if (!entry) continue;
    if (entry.contributingRuleId === 'RULE-CAP-06') {
      entry.baseRuleId = entry.ruleId;
      entry.ruleId = 'RULE-CAP-06';
      propagations.push(entry);
    } else {
      propagations.push(entry);
    }
    if (logEvent) {
      const ruleId = entry.contributingRuleId || entry.ruleId;
      logEvent({
        type: 'automation.propagated',
        entity: 'portfolio',
        entityId: entry.targetId,
        summary: `[${ruleId}] ${entry.summary} after ${triggerLabel}`,
      });
    }
  }
  const tradeoff = evaluateCapacityTradeoff(draft, {
    now, idFactory, todayStr, nowIso, logEvent, triggerLabel,
  });
  if (tradeoff) propagations.push(tradeoff);
  propagations.push(...evaluateMonteCarloTailRisk(draft, {
    now, idFactory, todayStr, nowIso, logEvent, triggerLabel,
  }));
  return propagations;
}

function applyCapacityReserve(draft, caseRecord, { now, idFactory, todayStr, nowIso, logEvent, caseCalibration = null }) {
  if (caseRecord.autoPropagate === false) return null;
  const { triple, adjustment } = capacityReserveSizing(draft, caseRecord, caseCalibration);
  const expected = (triple.optimistic + 4 * triple.mostLikely + triple.pessimistic) / 6;
  const calibrationNote = adjustment
    ? ` (RULE-CAP-06 ${adjustment.basis} ×${adjustment.factor}, n=${adjustment.n}; base ${adjustment.baseExpected}d)`
    : '';
  const existing = findCapacityReserve(draft, caseRecord.id);

  if (!existing) {
    if (expected <= 0) return null;
    draft.portfolio = Array.isArray(draft.portfolio) ? draft.portfolio : [];
    const reserve = {
      id: idFactory('pf'),
      title: `Capacity reserve: ${caseRecord.title}`.slice(0, 200),
      kind: 'capacity-reserve',
      status: 'open',
      sourceType: 'case',
      sourceId: caseRecord.id,
      ownerId: caseRecord.ownerId || null,
      effortDays: triple,
      value: { optimistic: 0, mostLikely: 0, pessimistic: 0 },
      currency: caseRecord.financial?.currency || 'USD',
      decision: 'funded',
      decisionOn: caseRecord.openedOn || todayStr,
      rationale: `Reserved automatically because the operational case diverts team capacity (RULE-CAP-01).${adjustment ? ` Calibrated from ${adjustment.n} settled cases using ${adjustment.basis} actual/forecast diverted-days ×${adjustment.factor} (RULE-CAP-06); source estimate remains unchanged.` : ''}`,
      targetOn: caseRecord.reviewOn || null,
      createdOn: caseRecord.openedOn || todayStr,
      completedOn: null,
      releasedOn: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    draft.portfolio.push(reserve);
    ensureEntityLink(
      draft,
      {
        sourceType: 'case',
        sourceId: caseRecord.id,
        targetType: 'portfolio',
        targetId: reserve.id,
        relation: 'consumes-capacity',
        ruleId: 'RULE-CAP-01',
        summary: `Reserves ${Math.round(expected * 10) / 10} person-days for this case`,
      },
      { idFactory, todayStr, nowIso },
    );
    return {
      ruleId: 'RULE-CAP-01',
      targetType: 'portfolio',
      targetId: reserve.id,
      action: 'created',
      summary: `Reserved ${Math.round(expected * 10) / 10} person-day(s) of capacity (P90 ${Math.round(triple.pessimistic * 10) / 10})${calibrationNote}`,
      contributingRuleId: adjustment ? 'RULE-CAP-06' : null,
    };
  }

  // Existing reserve: refresh numbers, but never overwrite a released reserve's
  // lifecycle. A reopened case gets it back.
  const sameTriple =
    existing.effortDays?.optimistic === triple.optimistic &&
    existing.effortDays?.mostLikely === triple.mostLikely &&
    existing.effortDays?.pessimistic === triple.pessimistic;
  if (existing.status === 'released') {
    existing.status = 'open';
    existing.releasedOn = null;
    existing.effortDays = triple;
    existing.rationale = `Reserved automatically because the operational case diverts team capacity (RULE-CAP-01).${adjustment ? ` Calibrated from ${adjustment.n} settled cases using ${adjustment.basis} actual/forecast diverted-days ×${adjustment.factor} (RULE-CAP-06); source estimate remains unchanged.` : ''}`;
    existing.targetOn = caseRecord.reviewOn || existing.targetOn;
    existing.updatedAt = nowIso;
    return {
      ruleId: 'RULE-CAP-01',
      targetType: 'portfolio',
      targetId: existing.id,
      action: 'reopened',
      summary: `Reinstated the ${Math.round(expected * 10) / 10} person-day capacity reserve for the reopened case${calibrationNote}`,
      contributingRuleId: adjustment ? 'RULE-CAP-06' : null,
    };
  }
  if (sameTriple) return null;
  existing.effortDays = triple;
  existing.rationale = `Reserved automatically because the operational case diverts team capacity (RULE-CAP-01).${adjustment ? ` Calibrated from ${adjustment.n} settled cases using ${adjustment.basis} actual/forecast diverted-days ×${adjustment.factor} (RULE-CAP-06); source estimate remains unchanged.` : ''}`;
  existing.targetOn = caseRecord.reviewOn || existing.targetOn;
  existing.ownerId = caseRecord.ownerId || existing.ownerId;
  existing.updatedAt = nowIso;
  return {
    ruleId: 'RULE-CAP-01',
    targetType: 'portfolio',
    targetId: existing.id,
    action: 'updated',
    summary: `Updated the capacity reserve to ${Math.round(expected * 10) / 10} person-day(s)${calibrationNote}`,
    contributingRuleId: adjustment ? 'RULE-CAP-06' : null,
  };
}

function capacityDecisionStillOpen(draft) {
  for (const link of draft.links || []) {
    if (!link || (link.ruleId !== 'RULE-CAP-02' && link.ruleId !== 'RULE-CAP-05')) continue;
    const decisionId = link.targetType === 'decision' ? link.targetId : link.sourceType === 'decision' ? link.sourceId : null;
    const decision = decisionId ? (draft.decisions || []).find((d) => d.id === decisionId) : null;
    if (!decision) continue;
    if (!decision.reviewedOn) return true; // already acknowledged and awaiting outcome review
  }
  return false;
}

/**
 * RULE-CAP-02 — when the plan is infeasible, make the trade-off explicit.
 *
 * The engine does not delete work or reshuffle priorities on its own. It opens
 * exactly one DACI decision containing the real numbers and the concrete
 * options that would restore feasibility, ranked by value density, and it does
 * not open another until that decision's outcome has been reviewed.
 */
export function evaluateCapacityTradeoff(draft, { now, idFactory, todayStr, nowIso, logEvent, triggerLabel = 'case' }) {
  const model = buildCapacityModel(draft, { now });
  if (!model.hasTeam || model.utilisation === null) return null;
  if (model.utilisation <= 1) return null;
  if (capacityDecisionStillOpen(draft)) return null;

  const ranking = rankPortfolio(model);
  const forecast = deliveryForecast(model, { now });
  const anchor = model.demand.committed
    .slice()
    .sort((a, b) => b.effort.expected - a.effort.expected)[0];
  if (!anchor) return null;

  const freeing = ranking.releaseCandidates.slice(0, 3);
  const options = freeing.map((item) => ({
    id: idFactory('dopt'),
    label: `Defer “${item.title.slice(0, 90)}” to free ${item.effort.expected} day(s)`,
    pros: item.valueDensity !== null
      ? `Lowest value density in the funded plan (${item.valueDensity.toFixed(2)} value per person-day)`
      : 'Frees capacity without touching the highest-value work',
    cons: item.targetOn ? `Delays a ${item.targetOn} target and forgoes its benefit` : 'Delays this commitment with no new date yet',
  }));
  options.push({
    id: idFactory('dopt'),
    label: 'Hold the plan and accept the queue delay',
    pros: 'No visible de-scoping conversation in this cycle',
    cons: forecast.p80
      ? `Forecast delivery slips to ${forecast.p80} at P80, and wait time grows faster than the added work`
      : 'Committed work exceeds capacity, so the date is unknowable until scope changes',
  });
  if (model.demand.wanted.length) {
    options.push({
      id: idFactory('dopt'),
      label: `Provide capacity: do not start ${model.demand.wanted.length} unfunded item(s) yet`,
      pros: `${model.demand.wantedDays} day(s) of demand stays uncommitted`,
      cons: 'Requires saying no out loud to the requester rather than absorbing it',
    });
  }

  const deficit = Math.round(-model.slackDays);
  const decision = {
    id: idFactory('dec'),
    title: `Capacity trade-off: plan is ${Math.round(model.utilisation * 100)}% committed`.slice(0, 180),
    question: [
      `The operating plan commits ${model.demand.committedDays} person-days against ${model.supply.allocatableDays} allocatable (${Math.round(model.utilisation * 100)}% utilisation, ${model.band.label.toLowerCase()}).`,
      `Deficit: ${deficit} person-day(s) over the ${model.horizonWeeks}-week horizon.`,
      `Committed breakdown: ${model.demand.reserveDays} reserved for incidents/mitigations, ${model.demand.fundedDays} funded planned work, plus operational reserve of ${model.supply.operationalReserveDays} day(s) already excluded from supply.`,
      `Triggered by a ${triggerLabel} event (RULE-CAP-02). Queueing theory says every point of utilisation above 80% costs more lead time than the work it adds (Kingman, 1961): the honest answer is a smaller plan or a later date, not more optimism.`,
    ].join(' ').slice(0, 2000),
    date: todayStr,
    reversibility: 'reversible',
    driver: (draft.settings?.leaderName || '').slice(0, 120),
    approver: (draft.settings?.leaderName || '').slice(0, 120),
    contributors: freeing.map((item) => item.title).join(', ').slice(0, 300),
    informed: '',
    options,
    chosen: '',
    rationale: '',
    reviewOn: addDaysKey(todayStr, (draft.settings?.decisionReviewDays ?? 14), now),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    createdAt: nowIso,
  };
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.push(decision);

  ensureEntityLink(
    draft,
    {
      sourceType: 'decision',
      sourceId: decision.id,
      targetType: 'portfolio',
      targetId: anchor.id,
      relation: 'funds',
      ruleId: 'RULE-CAP-02',
      summary: `Allocates capacity against “${anchor.title.slice(0, 80)}” (current biggest commitment)`,
    },
    { idFactory, todayStr, nowIso },
  );

  const entry = {
    ruleId: 'RULE-CAP-02',
    targetType: 'decision',
    targetId: decision.id,
    action: 'created',
    summary: `Over-allocation (${Math.round(model.utilisation * 100)}%) opened a capacity trade-off decision with ${options.length} options`,
  };
  if (logEvent) {
    logEvent({
      type: 'automation.propagated',
      entity: 'decision',
      entityId: decision.id,
      summary: `[RULE-CAP-02] ${entry.summary}`,
    });
  }
  return entry;
}

/**
 * RULE-CAP-05 — Probabilistic tail-risk goal & trade-off propagation.
 *
 * Deterministic point estimates hide right-skewed Beta-PERT schedule risk (Sam
 * Savage's Flaw of Averages). Using the workspace's deterministic seed:
 *  1. Linked active Goals whose funded portfolio commitment falls below 35%
 *     joint Monte Carlo on-time confidence receive an idempotent `[RULE-CAP-05]`
 *     check-in and shift from `on-track` to `at-risk`.
 *  2. When point-estimate utilisation <= 100% (`RULE-CAP-02` silent) yet Monte
 *     Carlo horizon overload probability >= 50% (`flawOfAveragesTrap` — worse
 *     than a coin flip of fitting inside the horizon), opens one DACI tail-risk
 *     trade-off decision ranked by value density and variance sensitivity.
 */
export function evaluateMonteCarloTailRisk(
  draft,
  { now, idFactory, todayStr, nowIso, logEvent, triggerLabel = 'portfolio' } = {},
) {
  if (!draft) return [];
  const model = buildCapacityModel(draft, { now });
  if (!model.hasTeam || model.utilisation === null) return [];
  const trials = Math.min(draft.settings?.simulationTrials ?? 1000, 1000);
  const sim = simulatePortfolio(draft, { now, trials });
  if (!sim.available) return [];

  const entries = [];
  draft.goals = Array.isArray(draft.goals) ? draft.goals : [];

  // 1. Goal-linked schedule tail risk (< 35% joint Monte Carlo on-time probability)
  for (const t of sim.targetRisks) {
    if (t.sourceType !== 'goal' || !t.sourceId) continue;
    if (t.mcProbability === null || t.mcProbability >= 0.35) continue;
    const goal = draft.goals.find((g) => g && g.id === t.sourceId && g.status !== 'done' && g.status !== 'archived');
    if (!goal) continue;

    ensureEntityLink(
      draft,
      {
        sourceType: 'portfolio',
        sourceId: t.id,
        targetType: 'goal',
        targetId: goal.id,
        relation: 'impacts-goal',
        ruleId: 'RULE-CAP-05',
        summary: `Monte Carlo on-time confidence ${Math.round(t.mcProbability * 100)}% for ${t.targetOn}`,
      },
      { idFactory, todayStr, nowIso },
    );

    goal.checkins = Array.isArray(goal.checkins) ? goal.checkins : [];
    const marker = `[RULE-CAP-05:${t.id}]`;
    const alreadyLogged = goal.checkins.some((chk) => typeof chk?.note === 'string' && chk.note.includes(marker));
    if (!alreadyLogged) {
      const nextConfidence = goal.confidence === 'off-track' ? 'off-track' : 'at-risk';
      goal.confidence = nextConfidence;
      const pctChance = Math.round(t.mcProbability * 100);
      goal.checkins.push({
        id: idFactory('chk'),
        date: todayStr,
        confidence: nextConfidence,
        progressPct: null,
        keyResults: null,
        note: `${marker} Seeded Monte Carlo (${sim.trials} trials, seed ${sim.seed}): funded work “${t.title.slice(0, 80)}” has only ${pctChance}% joint probability of meeting ${t.targetOn} (P80 completion ${t.mcP80Date || 'beyond horizon'}).`,
      });
      const entry = {
        ruleId: 'RULE-CAP-05',
        targetType: 'goal',
        targetId: goal.id,
        action: 'updated',
        summary: `Flagged goal “${goal.title.slice(0, 60)}” at-risk (${pctChance}% Monte Carlo chance of hitting ${t.targetOn})`,
      };
      entries.push(entry);
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'goal',
          entityId: goal.id,
          summary: `[RULE-CAP-05] ${entry.summary}`,
        });
      }
    }
  }

  // 2. Flaw-of-Averages horizon breach (>= 50% overload odds despite <= 100% mean utilisation)
  if (sim.flawOfAveragesTrap && !capacityDecisionStillOpen(draft)) {
    const topDriver = sim.drivers[0] || null;
    const anchor = model.demand.committed
      .slice()
      .sort((a, b) => b.effort.pessimistic - a.effort.pessimistic || b.effort.expected - a.effort.expected)[0];
    if (anchor) {
      const candidateDeferrals = model.demand.committed
        .filter((i) => i.kind !== 'capacity-reserve')
        .slice()
        .sort((a, b) => (a.valueDensity ?? Infinity) - (b.valueDensity ?? Infinity))
        .slice(0, 2);

      const options = candidateDeferrals.map((item) => ({
        id: idFactory('dopt'),
        label: `Defer “${item.title.slice(0, 80)}” (${item.effort.expected}d expected, P90 ${item.effort.p90}d) to restore schedule buffer`,
        pros: item.valueDensity !== null
          ? `Lowest value density (${item.valueDensity.toFixed(2)}/day); protects higher-leverage commitments against right-tail slip`
          : 'Restores horizon slack so right-skewed estimates do not cascade across every commitment',
        cons: item.targetOn ? `Pushes the ${item.targetOn} target out of this horizon` : 'Delays delivery to the next planning cycle',
      }));
      if (topDriver) {
        options.push({
          id: idFactory('dopt'),
          label: `Scope-cap tail driver “${topDriver.title.slice(0, 75)}” (PERT ${topDriver.optimistic}/${topDriver.mostLikely}/${topDriver.pessimistic}d)`,
          pros: `Top variance driver (r = ${topDriver.sensitivityIndex.toFixed(2)}); time-boxing pessimistic scope cuts P80 demand from ${sim.committedDemand.p80}d`,
          cons: 'Requires explicit non-goals or phased delivery before surprises hit',
        });
      }
      options.push({
        id: idFactory('dopt'),
        label: `Hold current scope and communicate P80 date (${sim.bottleneckCompletion.p80 || sim.teamCompletion.p80 || 'slipped'})`,
        pros: 'Avoids immediate scope negotiation',
        cons: `${Math.round(sim.overloadProbability * 100)}% Monte Carlo chance of breaching ${sim.allocatableDays}d allocatable supply`,
      });

      const decision = {
        id: idFactory('dec'),
        title: `Tail-risk capacity trade-off: ${Math.round(sim.overloadProbability * 100)}% horizon overload odds`.slice(0, 180),
        question: [
          `Point-estimate demand (${model.demand.committedDays}d vs ${model.supply.allocatableDays}d allocatable, ${Math.round(model.utilisation * 100)}% mean utilisation) appears feasible on paper,`,
          `but seeded Beta-PERT Monte Carlo (${sim.trials} trials, seed ${sim.seed}) shows P80 demand of ${sim.committedDemand.p80}d (P90 ${sim.committedDemand.p90}d) — a ${Math.round(sim.overloadProbability * 100)}% probability of breaching horizon supply (Savage, 2009 Flaw of Averages).`,
          topDriver ? `Largest variance driver: “${topDriver.title}” (${topDriver.optimistic}/${topDriver.mostLikely}/${topDriver.pessimistic}d).` : '',
          `Triggered on ${triggerLabel} (RULE-CAP-05).`,
        ].filter(Boolean).join(' ').slice(0, 2000),
        date: todayStr,
        reversibility: 'reversible',
        driver: (draft.settings?.leaderName || '').slice(0, 120),
        approver: (draft.settings?.leaderName || '').slice(0, 120),
        contributors: candidateDeferrals.map((i) => i.title).join(', ').slice(0, 300),
        informed: '',
        options,
        chosen: '',
        rationale: '',
        reviewOn: addDaysKey(todayStr, draft.settings?.decisionReviewDays ?? 14, now),
        reviewedOn: null,
        outcome: 'pending',
        outcomeNotes: '',
        createdAt: nowIso,
      };
      draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
      draft.decisions.push(decision);

      ensureEntityLink(
        draft,
        {
          sourceType: 'decision',
          sourceId: decision.id,
          targetType: 'portfolio',
          targetId: anchor.id,
          relation: 'funds',
          ruleId: 'RULE-CAP-05',
          summary: `Addresses ${Math.round(sim.overloadProbability * 100)}% Monte Carlo horizon breach risk`,
        },
        { idFactory, todayStr, nowIso },
      );

      const entry = {
        ruleId: 'RULE-CAP-05',
        targetType: 'decision',
        targetId: decision.id,
        action: 'created',
        summary: `Flaw-of-Averages tail risk (${Math.round(sim.overloadProbability * 100)}% overload odds, P80 ${sim.committedDemand.p80}d > ${sim.allocatableDays}d) opened a DACI trade-off decision`,
      };
      entries.push(entry);
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'decision',
          entityId: decision.id,
          summary: `[RULE-CAP-05] ${entry.summary}`,
        });
      }
    }
  }

  return entries;
}

/**
 * RULE-FCT-01 — freeze the forecast at the moment of commitment.
 *
 * Forecast evaluation is only honest if the prediction being scored is the
 * one made *before* the outcome was known (Tetlock, 2005). When planned work
 * is funded, its PERT effort distribution, expected value and target date are
 * copied into an immutable `forecastSnapshot`; delivery actuals are later
 * scored against that snapshot even if the live estimate is edited during
 * execution. Un-funding (deferred/cut/undecided) clears the snapshot via
 * `clearPortfolioForecast` so a future re-funding freezes the new commitment
 * rather than resurrecting a stale belief. Capacity reserves are excluded:
 * their effort is a case's diverted capacity, scored in the case ledger.
 *
 * Mutates the draft item in place; returns a propagation entry or null.
 */
export function freezePortfolioForecast(draft, item, { now = new Date(), todayStr = null, logEvent = null } = {}) {
  if (!draft || !item) return null;
  if (item.status !== 'open' || item.decision !== 'funded') return null;
  if (item.kind === 'capacity-reserve') return null;
  if (item.forecastSnapshot) return null; // already frozen at this commitment
  const fundedOn = todayStr || dayKey(now);
  const snapshot = buildForecastSnapshot(item, fundedOn);
  if (!snapshot) return null; // unestimated work has no forecast to freeze
  item.forecastSnapshot = snapshot;
  const entry = {
    ruleId: 'RULE-FCT-01',
    targetType: 'portfolio',
    targetId: item.id,
    action: 'updated',
    summary: `Froze the funding-time forecast for “${String(item.title || '').slice(0, 60)}” (expected ${snapshot.effortExpected}d · P80 ${snapshot.effortP80}d) so delivery can be scored against it`,
  };
  if (logEvent) {
    logEvent({
      type: 'automation.propagated',
      entity: 'portfolio',
      entityId: item.id,
      summary: `[RULE-FCT-01] ${entry.summary}`,
    });
  }
  return entry;
}

/** Companion to RULE-FCT-01: an un-funded item's commitment no longer exists. */
export function clearPortfolioForecast(item) {
  if (item && item.forecastSnapshot && item.decision !== 'funded' && item.status === 'open') {
    item.forecastSnapshot = null;
    return true;
  }
  return false;
}

function calibrationDecisionStillOpen(draft) {
  for (const link of draft.links || []) {
    if (!link || link.ruleId !== 'RULE-FCT-02') continue;
    const decisionId = link.targetType === 'decision' ? link.targetId : link.sourceType === 'decision' ? link.sourceId : null;
    const decision = decisionId ? (draft.decisions || []).find((d) => d.id === decisionId) : null;
    if (!decision) continue;
    if (!decision.reviewedOn) return true; // acknowledged, awaiting its outcome review
  }
  return false;
}

/**
 * RULE-FCT-02 — when the team's own delivery history proves systematic
 * optimism, make the correction an explicit, owned decision.
 *
 * Triggered after actuals are recorded (portfolio.completed /
 * portfolio.actuals). Requires a real evidence base (≥5 scored items) and a
 * median actual/estimate ratio ≥1.25× — the planning-fallacy signature
 * (Kahneman & Tversky, 1979) — then opens exactly one DACI decision offering
 * Flyvbjerg (2006) reference-class uplifts computed from the observed ratio
 * distribution, an estimation-practice investigation, or explicit acceptance.
 * Idempotent while a previous calibration decision awaits outcome review, so
 * repeated deliveries never stack duplicate governance records.
 */
export function evaluateCalibrationGovernance(draft, { now = new Date(), idFactory, todayStr, nowIso, logEvent = null, triggerLabel = 'portfolio' } = {}) {
  if (!draft || !idFactory) return null;
  const cal = estimateCalibration(draft);
  if (!cal.sufficient || !cal.medianRatio || cal.medianRatio < OPTIMISM_RATIO_THRESHOLD) return null;
  if (calibrationDecisionStillOpen(draft)) return null;

  const worst = cal.pairs.slice().sort((a, b) => b.ratio - a.ratio)[0];
  if (!worst) return null;

  const dayStr = todayStr || dayKey(now);
  const iso = nowIso || now.toISOString();
  const intervalPct = cal.withinRangeRate !== null ? Math.round(cal.withinRangeRate * 100) : null;
  const options = [
    {
      id: idFactory('dopt'),
      label: `Apply the ${cal.medianRatio}× reference-class uplift to new commitments`,
      pros: 'Recentres point forecasts on the team’s own delivery history instead of hope; reversible when the ratio recentres',
      cons: 'Dates get visibly later on paper; expect pushback until the first on-time quarter lands',
    },
    {
      id: idFactory('dopt'),
      label: `Plan dated commitments to the P80 uplift (${cal.ratioP80}×)`,
      pros: 'Four of five historical overruns would have fit inside this budget; protects external promises',
      cons: 'Conservative for internal exploratory work; may invite Parkinson’s-law expansion if applied silently',
    },
    {
      id: idFactory('dopt'),
      label: 'Investigate estimation practice before adjusting numbers',
      pros: intervalPct !== null
        ? `Only ${intervalPct}% of actuals landed inside the optimistic–pessimistic range, suggesting the ranges themselves are the defect`
        : 'Fixes the cause (decomposition, reference classes, premortems) rather than the symptom',
      cons: 'Slower: the next quarter is still planned on optimistic numbers while the practice changes',
    },
    {
      id: idFactory('dopt'),
      label: 'Accept the optimism and re-baseline targets instead',
      pros: 'No process change; honesty about dates is preserved by moving targets openly',
      cons: 'Every future plan keeps absorbing the same invisible overrun; queue delay compounds (Kingman, 1961)',
    },
  ];

  const decision = {
    id: idFactory('dec'),
    title: `Forecast calibration: delivered work runs ${cal.medianRatio}× its estimates`.slice(0, 180),
    question: [
      `Across ${cal.n} delivered plan items with recorded actuals, the median item took ${cal.medianRatio}× its funding-time PERT expectation (mean ${cal.meanRatio}×; P80 ratio ${cal.ratioP80}×).`,
      intervalPct !== null ? `${intervalPct}% of actuals landed inside their optimistic–pessimistic range.` : null,
      cal.schedule.n ? `Only ${Math.round((cal.schedule.onTimeRate ?? 0) * 100)}% of targeted items landed on their target date (median slip ${cal.schedule.medianSlipDays}d).` : null,
      `Worst overrun: “${worst.title.slice(0, 80)}” at ${worst.ratio}× (${worst.actual}d actual vs ${worst.expected}d expected).`,
      `Triggered by a ${triggerLabel} event (RULE-FCT-02). This is the planning fallacy measured on your own record (Kahneman & Tversky, 1979); the evidence-based correction is a reference-class uplift from the observed ratio distribution (Flyvbjerg, 2006), not exhortations to estimate better.`,
    ].filter(Boolean).join(' ').slice(0, 2000),
    date: dayStr,
    reversibility: 'reversible',
    driver: (draft.settings?.leaderName || '').slice(0, 120),
    approver: (draft.settings?.leaderName || '').slice(0, 120),
    contributors: cal.pairs.slice(0, 3).map((p) => p.title).join(', ').slice(0, 300),
    informed: '',
    options,
    chosen: '',
    rationale: '',
    reviewOn: addDaysKey(dayStr, (draft.settings?.decisionReviewDays ?? 14), now),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    createdAt: iso,
  };
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.push(decision);

  ensureEntityLink(
    draft,
    {
      sourceType: 'decision',
      sourceId: decision.id,
      targetType: 'portfolio',
      targetId: worst.itemId,
      relation: 'decides',
      ruleId: 'RULE-FCT-02',
      summary: `Governs estimate calibration evidenced by “${worst.title.slice(0, 80)}” (${worst.ratio}× overrun)`,
    },
    { idFactory, todayStr: dayStr, nowIso: iso },
  );

  const entry = {
    ruleId: 'RULE-FCT-02',
    targetType: 'decision',
    targetId: decision.id,
    action: 'created',
    summary: `Systematic estimation optimism (median ${cal.medianRatio}×, n=${cal.n}) opened a forecast-calibration decision with reference-class uplift options`,
  };
  if (logEvent) {
    logEvent({
      type: 'automation.propagated',
      entity: 'decision',
      entityId: decision.id,
      summary: `[RULE-FCT-02] ${entry.summary}`,
    });
  }
  return entry;
}

/**
 * RULE-FCT-03 — freeze the opening case forecast at first quantification.
 *
 * A case's PERT exposure, diverted-capacity expectation, planned mitigation
 * spend and pre-mitigation FMEA probability are the numbers that drive the
 * escalate / mitigate / accept call (RULE-DEC-01 even thresholds on them).
 * The first time an open case carries a measured leg, those beliefs are
 * copied into an immutable `forecastSnapshot`; settled actuals recorded at
 * resolution are scored against it (FAIR frequency/magnitude legs, spend and
 * diverted-days discipline), never against the estimate as edited once the
 * outcome was known. Deliberately independent of `autoPropagate`: like
 * RULE-FCT-01 this is record-keeping on the case itself, not a cross-module
 * side effect, so opting out of propagation must not disable the memory that
 * makes calibration honest. Resolution-time cases are never frozen —
 * freezing after the outcome is known would be hindsight with a timestamp.
 *
 * Mutates the draft case in place; returns a propagation entry or null.
 */
export function freezeCaseForecast(draft, caseRecord, { now = new Date(), todayStr = null, logEvent = null } = {}) {
  if (!draft || !caseRecord) return null;
  if (!isCaseOpen(caseRecord)) return null;
  if (caseRecord.forecastSnapshot) return null; // opening belief already frozen
  const frozenOn = todayStr || dayKey(now);
  const snapshot = buildCaseForecastSnapshot(caseRecord, frozenOn);
  if (!snapshot) return null; // unquantified case: no forecast to freeze
  caseRecord.forecastSnapshot = snapshot;
  const entry = {
    ruleId: 'RULE-FCT-03',
    targetType: 'case',
    targetId: caseRecord.id,
    action: 'updated',
    summary: `Froze the opening risk forecast for “${String(caseRecord.title || '').slice(0, 60)}” (expected exposure ${snapshot.currency} ${snapshot.costExpected.toLocaleString('en-US')} · ${snapshot.fmeaProbability === null ? 'occurrence not rated' : `assessed probability ${Math.round(Math.min(1, Math.max(0.1, snapshot.fmeaProbability / 10)) * 100)}%`}) so settled actuals can score it`,
  };
  if (logEvent) {
    logEvent({
      type: 'automation.propagated',
      entity: 'case',
      entityId: caseRecord.id,
      summary: `[RULE-FCT-03] ${entry.summary}`,
    });
  }
  return entry;
}

function caseCalibrationDecisionStillOpen(draft) {
  for (const link of draft.links || []) {
    if (!link || link.ruleId !== 'RULE-FCT-04') continue;
    const decisionId = link.targetType === 'decision' ? link.targetId : link.sourceType === 'decision' ? link.sourceId : null;
    const decision = decisionId ? (draft.decisions || []).find((d) => d.id === decisionId) : null;
    if (!decision) continue;
    if (!decision.reviewedOn) return true; // acknowledged, awaiting its outcome review
  }
  return false;
}

/**
 * RULE-FCT-04 — when settled cases prove the exposure reserves deficient,
 * make the correction an explicit, owned decision.
 *
 * Triggered after actuals are recorded (case.resolved with actuals /
 * case.actuals). Requires a real evidence base (≥5 scored materialised
 * cases) and a median realised/assessed exposure ratio ≥1.25× — the
 * actuarial signature of deficient case reserves — then opens exactly one
 * DACI decision offering reference-class contingency uplifts computed from
 * the observed development distribution, an exposure-assessment practice
 * investigation, or explicit self-insured acceptance. Idempotent while a
 * previous case-calibration decision awaits outcome review.
 */
export function evaluateCaseCalibrationGovernance(draft, { now = new Date(), idFactory, todayStr, nowIso, logEvent = null, triggerLabel = 'case' } = {}) {
  if (!draft || !idFactory) return null;
  const cal = caseCostCalibration(draft);
  const exp = cal.exposure;
  if (!exp.sufficient || !exp.medianRatio || exp.medianRatio < OPTIMISM_RATIO_THRESHOLD) return null;
  if (caseCalibrationDecisionStillOpen(draft)) return null;

  const worst = exp.pairs.slice().sort((a, b) => b.exposureRatio - a.exposureRatio)[0];
  if (!worst) return null;

  const dayStr = todayStr || dayKey(now);
  const iso = nowIso || now.toISOString();
  const currency = worst.currency || cal.aggregate.currency || 'USD';
  const intervalPct = exp.withinRangeRate !== null ? Math.round(exp.withinRangeRate * 100) : null;
  const options = [
    {
      id: idFactory('dopt'),
      label: `Apply the ${exp.medianRatio}× reference-class uplift to new case exposure estimates`,
      pros: 'Recentres opening PERT exposures on the team’s own settlement history (the actuarial development factor), instead of re-asserting the inside view',
      cons: 'Assessed exposures grow on paper; RULE-DEC-01 escalation thresholds will fire more often until the ratio recentres',
    },
    {
      id: idFactory('dopt'),
      label: `Reserve High-priority cases at the P80 development factor (${exp.ratioP80}×)`,
      pros: 'Four of five historical settlements would have fit inside this reserve; protects the plan against the fat tail where case costs actually live',
      cons: 'Holds more contingency against every High case, including the contained ones',
    },
    {
      id: idFactory('dopt'),
      label: 'Investigate exposure-assessment practice before adjusting numbers',
      pros: intervalPct !== null
        ? `Only ${intervalPct}% of realised exposures landed inside the optimistic–pessimistic range, suggesting the ranges themselves are the defect (FAIR calibration failure)`
        : 'Fixes the cause (loss-magnitude decomposition, secondary-loss checklists, reference classes) rather than the symptom',
      cons: 'Slower: the next cases are still opened on under-assessed exposures while the practice changes',
    },
    {
      id: idFactory('dopt'),
      label: 'Accept the under-reserving and self-insure explicitly',
      pros: 'No process change; the retained risk is at least named and owned',
      cons: 'Every future materialisation keeps landing as an unplanned draw on capacity and budget',
    },
  ];

  const decision = {
    id: idFactory('dec'),
    title: `Case-cost calibration: materialised risks settle at ${exp.medianRatio}× assessed exposure`.slice(0, 180),
    question: [
      `Across ${exp.n} materialised cases with settled actuals, the median case cost ${exp.medianRatio}× the exposure expected when it was opened (mean ${exp.meanRatio}×; P80 development factor ${exp.ratioP80}×).`,
      intervalPct !== null ? `${intervalPct}% of realised exposures landed inside their optimistic–pessimistic range.` : null,
      cal.occurrence.n ? `Assessed occurrence averaged ${Math.round((cal.occurrence.meanAssessedProbability ?? 0) * 100)}% against ${Math.round((cal.occurrence.observedRate ?? 0) * 100)}% materialised (n=${cal.occurrence.n}; occurrence Brier ${cal.occurrence.brier}).` : null,
      cal.aggregate.developmentFactor !== null ? `Aggregate loss development: ${cal.aggregate.currency} ${Number(cal.aggregate.totalRealised).toLocaleString('en-US')} realised (exposure + mitigation spend) against ${cal.aggregate.currency} ${Number(cal.aggregate.totalExpectedUnmitigated).toLocaleString('en-US')} expected unmitigated loss over ${cal.aggregate.n} complete settlement(s).` : null,
      `Worst under-assessment: “${worst.title.slice(0, 80)}” at ${worst.exposureRatio}× (${currency} ${Number(worst.realisedExposure).toLocaleString('en-US')} realised vs ${currency} ${Number(worst.costExpected).toLocaleString('en-US')} expected, scored against the ${worst.source === 'opening-forecast' ? 'frozen opening forecast' : 'resolution-time estimate'}).`,
      `Triggered by a ${triggerLabel} event (RULE-FCT-04). Case reserves that systematically develop upward are deficient reserves; the evidence-based correction is a reference-class development factor from the settlement history (Flyvbjerg, 2006), not exhortations to assess harder.`,
    ].filter(Boolean).join(' ').slice(0, 2000),
    date: dayStr,
    reversibility: 'reversible',
    driver: (draft.settings?.leaderName || '').slice(0, 120),
    approver: (draft.settings?.leaderName || '').slice(0, 120),
    contributors: exp.pairs.slice(0, 3).map((p) => p.title).join(', ').slice(0, 300),
    informed: '',
    options,
    chosen: '',
    rationale: '',
    reviewOn: addDaysKey(dayStr, (draft.settings?.decisionReviewDays ?? 14), now),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    forecastProbability: null,
    createdAt: iso,
  };
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.push(decision);

  ensureEntityLink(
    draft,
    {
      sourceType: 'decision',
      sourceId: decision.id,
      targetType: 'case',
      targetId: worst.caseId,
      relation: 'decides',
      ruleId: 'RULE-FCT-04',
      summary: `Governs case-cost calibration evidenced by “${worst.title.slice(0, 80)}” (${worst.exposureRatio}× settlement)`,
    },
    { idFactory, todayStr: dayStr, nowIso: iso },
  );

  const entry = {
    ruleId: 'RULE-FCT-04',
    targetType: 'decision',
    targetId: decision.id,
    action: 'created',
    summary: `Systematic case-cost under-reserving (median ${exp.medianRatio}×, n=${exp.n}) opened a case-cost calibration decision with reference-class uplift options`,
  };
  if (logEvent) {
    logEvent({
      type: 'automation.propagated',
      entity: 'decision',
      entityId: decision.id,
      summary: `[RULE-FCT-04] ${entry.summary}`,
    });
  }
  return entry;
}

/**
 * Dry-run preview of parallel cross-module rules for the Case dialog UI.
 * Pure read-only evaluation — never mutates `state`.
 */
export function previewCasePropagations(caseInput = {}, state = {}, { now = new Date(), existingCaseId = null } = {}) {
  const todayStr = dayKey(now);
  const autoPropagate = caseInput.autoPropagate !== false;
  if (!autoPropagate) return [];

  const open = isCaseOpen({ status: caseInput.status || 'open' });
  if (!open) return [];

  const fmea = computeFmea(caseInput.fmea);
  const pert = computePertImpact(caseInput.financial, fmea);
  const links = state.links || [];
  const previews = [];

  // 1. Stakeholder coalition schedules
  const unscheduledStakeholders = (caseInput.stakeholders || []).filter(
    (s) => s && String(s.name || '').trim() && !s.nextCommsOn,
  );
  if (unscheduledStakeholders.length > 0) {
    previews.push({
      ruleId: 'RULE-STAKE-01',
      targetModule: 'Stakeholder coalition',
      action: 'schedule',
      summary: `Schedule communication checkpoints for ${unscheduledStakeholders.length} stakeholder${unscheduledStakeholders.length === 1 ? '' : 's'}`,
      detail: 'Mendelow Power × Interest quadrant sets immediate, weekly, milestone, or digest cadence.',
    });
  }

  // 2. Strategic Decision Log
  const existingDecisionLink = existingCaseId
    ? hasCaseLinkToType(links, existingCaseId, 'decision', ['decides', 'escalates-from'])
    : null;
  if (!existingDecisionLink && shouldCreateDecision(caseInput, fmea, pert, caseInput)) {
    previews.push({
      ruleId: 'RULE-DEC-01',
      targetModule: 'Decisions (DACI)',
      action: 'create',
      summary: `Create linked DACI decision (${fmea.severity >= 8 ? 'irreversible / high-impact' : 'reversible'} framing)`,
      detail: `${fmea.rated ? `FMEA ${fmea.actionPriority.toUpperCase()} (RPN ${fmea.rpn})` : 'FMEA not rated'}${pert.hasFinancialEstimate ? `; ${pert.currency} ${pert.cost.expected.toLocaleString('en-US')} PERT expected exposure` : ''}.`,
    });
  }

  // 3. Accountable Mitigation Delegation
  const owner = caseInput.ownerId ? (state.people || []).find((p) => p.id === caseInput.ownerId) : null;
  const existingDelegationLink = existingCaseId
    ? hasCaseLinkToType(links, existingCaseId, 'delegation', ['mitigates', 'escalates-from'])
    : null;
  if (!existingDelegationLink && shouldCreateDelegation(caseInput, fmea, owner, caseInput)) {
    previews.push({
      ruleId: 'RULE-DEL-01',
      targetModule: 'Delegations',
      action: 'create',
      summary: `Delegate accountable mitigation to ${owner.name}`,
      detail: `Authority calibrated to ${fmea.actionPriority === 'high' ? 'Recommend' : 'Act & inform'} with review date ${caseInput.reviewOn || addDaysKey(todayStr, 14, now)}.`,
    });
  }

  // 4. Goal Risk & Confidence Propagation
  const goal = caseInput.linkedGoalId
    ? (state.goals || []).find((g) => g.id === caseInput.linkedGoalId && g.status === 'active')
    : null;
  if (goal) {
    const willShiftRisk =
      ((fmea.rated && fmea.actionPriority === 'high') || caseInput.kind === 'incident' || caseInput.kind === 'escalation') &&
      goal.confidence === 'on-track';
    previews.push({
      ruleId: 'RULE-GOAL-01',
      targetModule: 'Goals & OKRs',
      action: willShiftRisk ? 'update' : 'link',
      summary: willShiftRisk
        ? `Link goal “${goal.title}” and shift confidence from On track → At risk`
        : `Link active goal “${goal.title}” for risk telemetry`,
      detail: 'Appends an explainable check-in referencing the case and any recorded FMEA rating.',
    });
  }

  // 5. Team Coaching & 1:1 Prep
  const involvedIds = new Set(
    [caseInput.ownerId, ...(caseInput.involvedPersonIds || [])].filter(Boolean),
  );
  const activeInvolved = [...involvedIds]
    .map((pid) => (state.people || []).find((p) => p.id === pid && p.status === 'active'))
    .filter(Boolean);
  if (activeInvolved.length > 0) {
    previews.push({
      ruleId: 'RULE-COACH-01',
      targetModule: '1:1 Prep & People Coaching',
      action: 'update',
      summary: `Queue blameless 1:1 support & barrier check-in for ${activeInvolved.map((p) => p.name).join(', ')}`,
      detail: 'Adds coaching talking point and surfaces the case on printable 1:1 prep sheets (excluded from performance ratings).',
    });
  }

  // 6. Capacity reserve registration
  const baseCapacityTriple = {
    optimistic: Math.max(0, Number(caseInput?.financial?.capacityDaysOptimistic) || 0),
    mostLikely: Math.max(0, Number(caseInput?.financial?.capacityDaysMostLikely) || 0),
    pessimistic: Math.max(0, Number(caseInput?.financial?.capacityDaysPessimistic) || 0),
  };
  const capacityAdjustment = caseCapacityReferenceClassAdjustment(
    baseCapacityTriple,
    caseCostCalibration(state),
    { highPriority: fmea.rated && fmea.actionPriority === 'high' },
  );
  const capacityTriple = capacityAdjustment?.adjustedTriple || baseCapacityTriple;
  const capacityExpected =
    (capacityTriple.optimistic + 4 * capacityTriple.mostLikely + capacityTriple.pessimistic) / 6;
  const baseCapacityExpected =
    (baseCapacityTriple.optimistic + 4 * baseCapacityTriple.mostLikely + baseCapacityTriple.pessimistic) / 6;
  const existingReserve = (state.portfolio || []).find(
    (p) => p.kind === 'capacity-reserve' && p.sourceType === 'case' && p.sourceId === existingCaseId,
  );
  const reserveChanged = existingReserve
    ? existingReserve.effortDays?.mostLikely !== capacityTriple.mostLikely ||
      existingReserve.effortDays?.optimistic !== capacityTriple.optimistic ||
      existingReserve.effortDays?.pessimistic !== capacityTriple.pessimistic
    : capacityExpected > 0;
  if (reserveChanged) {
    previews.push({
      ruleId: 'RULE-CAP-01',
      targetModule: 'Capacity & flow plan',
      action: existingReserve ? 'update' : 'create',
      summary: existingReserve
        ? `Refresh the capacity reserve to ${Math.round(capacityExpected * 10) / 10} person-day(s)${capacityAdjustment ? ` (RULE-CAP-06 ×${capacityAdjustment.factor})` : ''}`
        : `Reserve ${Math.round(capacityExpected * 10) / 10} person-day(s) of team capacity${capacityAdjustment ? ` (RULE-CAP-06 ×${capacityAdjustment.factor})` : ''}`,
      detail: capacityAdjustment
        ? `[RULE-CAP-06] Little’s Law/Kingman utilisation and seeded portfolio Monte Carlo use ${capacityAdjustment.adjustedExpected}d (${capacityAdjustment.basis} ×${capacityAdjustment.factor}, n=${capacityAdjustment.n}) instead of the raw ${baseCapacityExpected.toFixed(1)}d estimate. This is a reserve-only contingency; the case estimate and its forecast-calibration baseline remain unchanged.`
        : 'Little’s Law/Kingman utilisation updates immediately; the reserve is released when the case is resolved. A settled diverted-days reference class is applied only after n≥5 and median under-reserving ≥25%.',
      contributingRuleId: capacityAdjustment ? 'RULE-CAP-06' : null,
    });
  }

  // 7. Over-allocation trade-off decision
  const model = buildCapacityModel(state, { now });
  if (model.hasTeam && model.utilisation !== null) {
    const alreadyReserved = Boolean(existingReserve);
    const projected =
      model.demand.committedDays + (capacityExpected > 0 && !alreadyReserved ? capacityExpected : 0);
    const projectedUtilisation = model.supply.allocatableDays > 0 ? projected / model.supply.allocatableDays : null;
    if (projectedUtilisation !== null && projectedUtilisation > 1) {
      const band = utilisationBand(projectedUtilisation);
      previews.push({
        ruleId: 'RULE-CAP-02',
        targetModule: 'Decisions (DACI)',
        action: 'create',
        summary: `Plan becomes ${Math.round(projectedUtilisation * 100)}% committed — open a trade-off decision`,
        detail: `${band.label}. Options are generated from the lowest value-density committed work (${(projected - model.supply.allocatableDays).toFixed(1)} day deficit) unless an unanswered capacity decision is already open.`,
      });
    }
  }

  return previews;
}

/**
 * Execute parallel cross-module rules inside a `store.update` draft mutation
 * when an Operational Case is created or updated.
 */
export function propagateCaseEvent(draft, caseRecord, { now = new Date(), idFactory, logEvent = null, options = {} } = {}) {
  const propagations = [];
  if (!draft || !caseRecord || caseRecord.autoPropagate === false) return propagations;
  if (!isCaseOpen(caseRecord)) return propagations;

  const todayStr = dayKey(now);
  const nowIso = now.toISOString();
  const fmea = computeFmea(caseRecord.fmea);
  const ratedFmea = isFmeaRated(caseRecord.fmea);
  const pert = computePertImpact(caseRecord.financial, fmea);
  const defaultReviewOn = caseRecord.reviewOn || addDaysKey(caseRecord.openedOn || todayStr, 14, now);

  // 1. RULE-STAKE-01: Mendelow Stakeholder Cadence & Next Comms Dates
  if (Array.isArray(caseRecord.stakeholders) && caseRecord.stakeholders.length > 0) {
    let scheduledCount = 0;
    for (const s of caseRecord.stakeholders) {
      const classified = classifyMendelowStakeholder(s, todayStr);
      if (!s.commsCadence) s.commsCadence = defaultCadenceFor(classified.quadrant, classified.stance);
      if (!s.nextCommsOn) {
        const offset = cadenceDaysOffset(classified.quadrant, classified.stance);
        s.nextCommsOn = addDaysKey(todayStr, offset, now);
        scheduledCount += 1;
      }
    }
    if (scheduledCount > 0) {
      propagations.push({
        ruleId: 'RULE-STAKE-01',
        targetType: 'case',
        targetId: caseRecord.id,
        action: 'scheduled-comms',
        summary: `Scheduled Mendelow stakeholder briefs (${scheduledCount})`,
      });
    }
  }

  // 2. RULE-DEC-01: Strategic DACI Decision Log
  const existingDecisionLink = hasCaseLinkToType(draft.links, caseRecord.id, 'decision', ['decides', 'escalates-from']);
  if (!existingDecisionLink && shouldCreateDecision(caseRecord, fmea, pert, options)) {
    const contextParts = [
      `Operational case (${caseRecord.kind}): ${caseRecord.summary || caseRecord.title}`,
      ratedFmea
        ? `FMEA: Severity ${fmea.severity}/10 × Probability ${fmea.probability}/10 × Detection ${fmea.detectability}/10 = RPN ${fmea.rpn} (${fmea.actionPriority.toUpperCase()} Action Priority).`
        : 'FMEA has not been rated; arithmetic defaults are not a human assessment.',
    ];
    if (pert.hasFinancialEstimate) {
      contextParts.push(
        `PERT financial exposure: expected ${pert.currency} ${pert.cost.expected.toLocaleString('en-US')} (P10 ${pert.cost.p10.toLocaleString('en-US')} – P90 ${pert.cost.p90.toLocaleString('en-US')}); ${pert.expectedUnmitigatedLoss === null ? 'occurrence not rated; risk-adjusted loss unknown' : `expected unmitigated loss ${pert.currency} ${pert.expectedUnmitigatedLoss.toLocaleString('en-US')}`}.`,
      );
    }
    if (pert.hasCapacityEstimate) {
      contextParts.push(
        `PERT diverted capacity: ${pert.capacity.expected} person-days (P90 ${pert.capacity.p90}d).`,
      );
    }
    if (pert.opportunityCost) {
      contextParts.push(`Opportunity cost / trade-off: ${pert.opportunityCost}`);
    }

    const stakeholdersByPower = (caseRecord.stakeholders || []).slice().sort((a, b) => (b.power || 0) - (a.power || 0));
    const approverName = stakeholdersByPower.find((s) => (s.power || 0) >= 4)?.name || '';
    const contributors = stakeholdersByPower
      .filter((s) => (s.interest || 0) >= 3 && s.name !== approverName)
      .map((s) => s.name);
    const informed = stakeholdersByPower
      .filter((s) => (s.interest || 0) < 3 && s.name !== approverName)
      .map((s) => s.name);

    const ownerPerson = caseRecord.ownerId
      ? (draft.people || []).find((p) => p.id === caseRecord.ownerId)
      : null;

    const decisionOptions = [];
    if ((caseRecord?.rca?.preventiveAction || '').trim()) {
      decisionOptions.push({
        id: idFactory('dopt'),
        label: `Fund systemic mitigation: ${caseRecord.rca.preventiveAction.trim().slice(0, 120)}`,
        pros: pert.hasFinancialEstimate && pert.expectedLossAvoided !== null
          ? `Avoids ~${pert.currency} ${pert.expectedLossAvoided.toLocaleString('en-US')} expected loss`
          : 'Addresses systemic barrier rather than symptoms',
        cons: pert.mitigationCost > 0
          ? `Requires ${pert.currency} ${pert.mitigationCost.toLocaleString('en-US')} investment${pert.opportunityCost ? ` (${pert.opportunityCost})` : ''}`
          : pert.opportunityCost || 'Diverts near-term engineering capacity',
      });
      decisionOptions.push({
        id: idFactory('dopt'),
        label: 'Accept / contain current exposure with manual monitoring only',
        pros: 'Preserves immediate roadmap capacity',
        cons: ratedFmea ? `Retains RPN ${fmea.rpn} (${fmea.actionPriority.toUpperCase()} priority) failure risk` : 'Exposure and priority have not been rated',
      });
    }

    const decision = {
      id: idFactory('dec'),
      title: `Response & trade-off: ${caseRecord.title}`.slice(0, 180),
      question: contextParts.join(' ').slice(0, 2000),
      date: caseRecord.openedOn || todayStr,
      reversibility: fmea.severity >= 8 ? 'irreversible' : 'reversible',
      driver: (ownerPerson?.name || '').slice(0, 120),
      approver: approverName.slice(0, 120),
      contributors: contributors.join(', ').slice(0, 300),
      informed: informed.join(', ').slice(0, 300),
      options: decisionOptions,
      chosen: '',
      rationale: '',
      reviewOn: defaultReviewOn,
      reviewedOn: null,
      outcome: 'pending',
      outcomeNotes: '',
      createdAt: nowIso,
    };
    draft.decisions.push(decision);
    ensureEntityLink(
      draft,
      {
        sourceType: 'case',
        sourceId: caseRecord.id,
        targetType: 'decision',
        targetId: decision.id,
        relation: 'decides',
        ruleId: 'RULE-DEC-01',
        summary: `DACI decision created for ${caseRecord.title}`,
      },
      { idFactory, todayStr, nowIso },
    );
    const entry = {
      ruleId: 'RULE-DEC-01',
      targetType: 'decision',
      targetId: decision.id,
      action: 'created',
      summary: `Auto-created DACI decision “${decision.title.slice(0, 70)}”`,
    };
    propagations.push(entry);
    if (logEvent) {
      logEvent({
        type: 'automation.propagated',
        entity: 'decision',
        entityId: decision.id,
        summary: `[RULE-DEC-01] ${entry.summary}`,
      });
    }
  }

  // 3. RULE-DEL-01: Accountable Mitigation Delegation
  const owner = caseRecord.ownerId
    ? (draft.people || []).find((p) => p.id === caseRecord.ownerId)
    : null;
  const existingDelegationLink = hasCaseLinkToType(draft.links, caseRecord.id, 'delegation', ['mitigates', 'escalates-from']);
  if (!existingDelegationLink && shouldCreateDelegation(caseRecord, fmea, owner, options)) {
    const preventiveText = (caseRecord?.rca?.preventiveAction || '').trim();
    const expectedOutcome = (
      preventiveText ||
      (ratedFmea
        ? `Deliver verified systemic mitigation for “${caseRecord.title}” and lower FMEA Action Priority from ${fmea.actionPriority.toUpperCase()}.`
        : `Investigate “${caseRecord.title}” and deliver verified systemic mitigation; FMEA has not yet been rated.`)
    ).slice(0, 600);
    const supportText = pert.opportunityCost
      ? `Leader air-cover on trade-off (${pert.opportunityCost.slice(0, 140)}) and stakeholder coalition alignment.`
      : 'Leader air-cover on stakeholder alignment, scope protection, and systemic barrier removal.';

    const delegation = {
      id: idFactory('delegation'),
      personId: owner.id,
      title: `Mitigate: ${caseRecord.title}`.slice(0, 160),
      expectedOutcome,
      authority: fmea.actionPriority === 'high' ? 'recommend' : 'act-inform',
      support: supportText,
      delegatedOn: caseRecord.openedOn <= todayStr ? caseRecord.openedOn : todayStr,
      dueOn: defaultReviewOn,
      status: 'active',
      checkins: [],
      completedOn: null,
      completionNote: '',
      returnedOn: null,
      returnReason: '',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    draft.delegations.push(delegation);
    if (caseRecord.status === 'open') {
      caseRecord.status = 'mitigating';
    }
    ensureEntityLink(
      draft,
      {
        sourceType: 'case',
        sourceId: caseRecord.id,
        targetType: 'delegation',
        targetId: delegation.id,
        relation: 'mitigates',
        ruleId: 'RULE-DEL-01',
        summary: `Mitigation delegated to ${owner.name}`,
      },
      { idFactory, todayStr, nowIso },
    );
    const entry = {
      ruleId: 'RULE-DEL-01',
      targetType: 'delegation',
      targetId: delegation.id,
      action: 'created',
      summary: `Auto-delegated mitigation to ${owner.name}`,
    };
    propagations.push(entry);
    if (logEvent) {
      logEvent({
        type: 'automation.propagated',
        entity: 'delegation',
        entityId: delegation.id,
        summary: `[RULE-DEL-01] ${entry.summary}: “${delegation.title.slice(0, 60)}”`,
      });
    }
  }

  // 4. RULE-GOAL-01: Goal Risk & Confidence Propagation
  if (caseRecord.linkedGoalId) {
    const goal = (draft.goals || []).find((g) => g.id === caseRecord.linkedGoalId && g.status === 'active');
    if (goal) {
      const linkRes = ensureEntityLink(
        draft,
        {
          sourceType: 'case',
          sourceId: caseRecord.id,
          targetType: 'goal',
          targetId: goal.id,
          relation: 'impacts-goal',
          ruleId: 'RULE-GOAL-01',
          summary: `Case impacts goal ${goal.title}`,
        },
        { idFactory, todayStr, nowIso },
      );

      const caseTag = `[Case ${caseRecord.id}]`;
      const highImpact =
        (ratedFmea && fmea.actionPriority === 'high') ||
        caseRecord.kind === 'incident' ||
        caseRecord.kind === 'escalation';
      const alreadyLoggedRisk = (goal.checkins || []).some((chk) => String(chk.note || '').includes(caseTag));

      if (highImpact && !alreadyLoggedRisk) {
        const nextConfidence = goal.confidence === 'on-track' ? 'at-risk' : goal.confidence;
        goal.confidence = nextConfidence;
        goal.checkins = Array.isArray(goal.checkins) ? goal.checkins : [];
        goal.checkins.push({
          id: idFactory('chk'),
          date: todayStr,
          confidence: nextConfidence,
          progressPct: null,
          keyResults: null,
          note: `${caseTag} Linked ${caseRecord.kind} “${caseRecord.title.slice(0, 60)}”${ratedFmea ? ` (FMEA ${fmea.actionPriority.toUpperCase()}, RPN ${fmea.rpn})` : ' (FMEA not rated)'}.`,
        });
        const entry = {
          ruleId: 'RULE-GOAL-01',
          targetType: 'goal',
          targetId: goal.id,
          action: 'updated',
          summary: `Updated goal “${goal.title.slice(0, 50)}” (${nextConfidence}) with risk check-in`,
        };
        propagations.push(entry);
        if (logEvent) {
          logEvent({
            type: 'automation.propagated',
            entity: 'goal',
            entityId: goal.id,
            summary: `[RULE-GOAL-01] ${entry.summary}`,
          });
        }
      } else if (linkRes.created) {
        propagations.push({
          ruleId: 'RULE-GOAL-01',
          targetType: 'goal',
          targetId: goal.id,
          action: 'linked',
          summary: `Linked goal “${goal.title.slice(0, 50)}”`,
        });
      }
    }
  }

  // 5. RULE-COACH-01: Blameless Team Coaching & 1:1 Prep
  const involvedIds = [...new Set([caseRecord.ownerId, ...(caseRecord.involvedPersonIds || [])].filter(Boolean))];
  const promptText = coachingPromptForCase(caseRecord, 'active');
  const casePrefix = `Case support (${(caseRecord.title || '').trim().slice(0, 32)}`;
  const promptMarker = `; ref ${caseRecord.id})`;

  for (const personId of involvedIds) {
    const person = (draft.people || []).find((p) => p.id === personId && p.status === 'active');
    if (!person) continue;

    const linkRes = ensureEntityLink(
      draft,
      {
        sourceType: 'case',
        sourceId: caseRecord.id,
        targetType: 'person',
        targetId: person.id,
        relation: 'coaches',
        ruleId: 'RULE-COACH-01',
        summary: `Blameless 1:1 coaching & air-cover for ${person.name}`,
      },
      { idFactory, todayStr, nowIso },
    );

    person.talkingPoints = Array.isArray(person.talkingPoints) ? person.talkingPoints : [];
    const managedIndex = person.talkingPoints.findIndex(
      (tp) => String(tp).startsWith('Case support (') && String(tp).includes(promptMarker),
    );
    const hasLegacyTopic = person.talkingPoints.some(
      (tp) => tp === promptText || (casePrefix.length > 16 && String(tp).startsWith(casePrefix)),
    );
    if (managedIndex >= 0 && person.talkingPoints[managedIndex] !== promptText) {
      person.talkingPoints[managedIndex] = promptText;
      const entry = {
        ruleId: 'RULE-COACH-01',
        targetType: 'person',
        targetId: person.id,
        action: 'refreshed',
        summary: `Refreshed case-linked 1:1 support topic for ${person.name}`,
      };
      propagations.push(entry);
      if (logEvent) logEvent({ type: 'automation.propagated', entity: 'person', entityId: person.id, summary: `[RULE-COACH-01] ${entry.summary}` });
    } else if (!hasLegacyTopic && person.talkingPoints.length < 12) {
      person.talkingPoints.push(promptText);
      const entry = {
        ruleId: 'RULE-COACH-01',
        targetType: 'person',
        targetId: person.id,
        action: 'updated',
        summary: `Queued blameless 1:1 support topic for ${person.name}`,
      };
      propagations.push(entry);
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'person',
          entityId: person.id,
          summary: `[RULE-COACH-01] ${entry.summary}`,
        });
      }
    } else if (linkRes.created) {
      propagations.push({
        ruleId: 'RULE-COACH-01',
        targetType: 'person',
        targetId: person.id,
        action: 'linked',
        summary: `Linked ${person.name} for 1:1 prep context`,
      });
    }
  }

  // 6. RULE-CAP-01: reserve the person-days this case diverts from the plan
  const reserveEntry = applyCapacityReserve(draft, caseRecord, {
    now,
    idFactory,
    todayStr,
    nowIso,
    logEvent,
  });
  if (reserveEntry) {
    propagations.push(reserveEntry);
    if (logEvent) {
      logEvent({
        type: 'automation.propagated',
        entity: 'portfolio',
        entityId: reserveEntry.targetId,
        summary: `[RULE-CAP-01] ${reserveEntry.summary}`,
      });
    }
  }

  // 7. RULE-CAP-02: if the plan is now infeasible, open the trade-off decision
  const tradeoff = evaluateCapacityTradeoff(draft, { now, idFactory, todayStr, nowIso, logEvent });
  if (tradeoff) propagations.push(tradeoff);

  // 8. RULE-STK-01/02: reconcile the stakeholder register and evaluate any
  // adverse veto gate on this case. No-op when the register is empty.
  propagations.push(
    ...reconcileStakeholderInvolvement(draft, 'case', caseRecord.id, { now, idFactory, logEvent }),
  );
  propagations.push(
    ...evaluateStakeholderVetoDecision(draft, 'case', caseRecord.id, { now, idFactory, logEvent }),
  );

  return propagations;
}

/**
 * Propagate resolution telemetry when an Operational Case is resolved/closed.
 */
export function propagateCaseResolution(draft, caseRecord, { now = new Date(), idFactory, logEvent = null } = {}) {
  const propagations = [];
  if (!draft || !caseRecord || caseRecord.autoPropagate === false) return propagations;
  const todayStr = dayKey(now);

  // RULE-COACH-02: an open incident response topic becomes a systemic learning
  // conversation only when the case is actually resolved; never write into reviews.
  propagations.push(...syncCaseCoachingPromptPhase(draft, caseRecord, 'resolved', { logEvent }));

  // RULE-CAP-01: returning diverted capacity to the plan is the whole point of
  // closing a case; leaving the reserve in place would silently shrink the
  // team's apparent capacity forever.
  const reserve = findCapacityReserve(draft, caseRecord.id);
  if (reserve && reserve.status === 'open') {
    const releasedOn = caseRecord.resolvedOn || todayStr;
    reserve.status = 'released';
    reserve.releasedOn = releasedOn;
    reserve.updatedAt = now.toISOString();
    const entry = {
      ruleId: 'RULE-CAP-01',
      targetType: 'portfolio',
      targetId: reserve.id,
      action: 'released',
      summary: `Released the ${reserve.effortDays?.mostLikely ?? 0} person-day capacity reserve back to the plan`,
    };
    propagations.push(entry);
    if (logEvent) {
      logEvent({
        type: 'automation.propagated',
        entity: 'portfolio',
        entityId: reserve.id,
        summary: `[RULE-CAP-01] ${entry.summary}`,
      });
    }
  }

  if (caseRecord.linkedGoalId) {
    const goal = (draft.goals || []).find((g) => g.id === caseRecord.linkedGoalId && g.status === 'active');
    if (goal) {
      const resolvedTag = `[Case ${caseRecord.id} resolved]`;
      const alreadyNoted = (goal.checkins || []).some((chk) => String(chk.note || '').includes(resolvedTag));
      if (!alreadyNoted) {
        goal.checkins = Array.isArray(goal.checkins) ? goal.checkins : [];
        goal.checkins.push({
          id: idFactory('chk'),
          date: caseRecord.resolvedOn || todayStr,
          confidence: goal.confidence,
          progressPct: null,
          keyResults: null,
          note: `${resolvedTag} Operational case “${caseRecord.title.slice(0, 60)}” resolved — review whether goal confidence can return to On track.`,
        });
        const entry = {
          ruleId: 'RULE-GOAL-01',
          targetType: 'goal',
          targetId: goal.id,
          action: 'updated',
          summary: `Logged case resolution check-in on goal “${goal.title.slice(0, 50)}”`,
        };
        propagations.push(entry);
        if (logEvent) {
          logEvent({
            type: 'automation.propagated',
            entity: 'goal',
            entityId: goal.id,
            summary: `[RULE-GOAL-01] ${entry.summary}`,
          });
        }
      }
    }
  }

  return propagations;
}

/**
 * Closed-loop feedback when a mitigation delegation is completed: if all
 * mitigation delegations linked to an open/mitigating Case are now done,
 * advance the Case to `monitoring` for residual FMEA verification.
 */
export function onDelegationCompleted(draft, delegationId, { now = new Date(), idFactory, logEvent = null } = {}) {
  const propagations = [];
  if (!draft || !Array.isArray(draft.links)) return propagations;

  // RULE-CAP-04: a delegation-linked plan item is an explicit statement that
  // this delegated outcome is the planned work. Its verified completion closes
  // that same item; it does not infer effort or affect unrelated work. Keep the
  // graph edge and date so WIP/throughput history remains traceable.
  const delegation = (draft.delegations || []).find((d) => d.id === delegationId);
  if (delegation?.status === 'done') {
    const completedOn = delegation.completedOn || dayKey(now);
    for (const item of draft.portfolio || []) {
      if (
        item?.status !== 'open' ||
        item.sourceType !== 'delegation' ||
        item.sourceId !== delegationId
      ) continue;

      item.status = 'done';
      item.completedOn = completedOn;
      item.updatedAt = now.toISOString();
      ensureEntityLink(
        draft,
        {
          sourceType: 'portfolio',
          sourceId: item.id,
          targetType: 'delegation',
          targetId: delegationId,
          relation: 'funds',
          ruleId: 'RULE-CAP-04',
          summary: `Delegation completion delivered “${item.title.slice(0, 60)}”`,
        },
        { idFactory: idFactory || ((prefix) => `${prefix}-${item.id}-${delegationId}`), todayStr: dayKey(now), nowIso: now.toISOString() },
      );
      const entry = {
        ruleId: 'RULE-CAP-04',
        targetType: 'portfolio',
        targetId: item.id,
        action: 'completed',
        summary: `Marked linked plan item “${item.title.slice(0, 60)}” delivered from delegation completion`,
      };
      propagations.push(entry);
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'portfolio',
          entityId: item.id,
          summary: `[RULE-CAP-04] ${entry.summary}`,
        });
      }
    }
  }

  if (!Array.isArray(draft.cases)) return propagations;
  const caseIds = [
    ...new Set(
      draft.links
        .filter((l) => l && l.sourceType === 'case' && l.targetType === 'delegation' && l.targetId === delegationId && l.relation === 'mitigates')
        .map((l) => l.sourceId),
    ),
  ];

  for (const caseId of caseIds) {
    const caseRecord = draft.cases.find((c) => c.id === caseId);
    if (!caseRecord || !['open', 'mitigating'].includes(caseRecord.status)) continue;

    const allMitigationIds = draft.links
      .filter((l) => l && l.sourceType === 'case' && l.sourceId === caseId && l.targetType === 'delegation' && l.relation === 'mitigates')
      .map((l) => l.targetId);

    const allDone =
      allMitigationIds.length > 0 &&
      allMitigationIds.every((delId) => {
        const del = (draft.delegations || []).find((d) => d.id === delId);
        return del && del.status === 'done';
      });

    if (allDone) {
      caseRecord.status = 'monitoring';
      caseRecord.updatedAt = now.toISOString();
      const entry = {
        ruleId: 'RULE-SYNC-DEL-01',
        targetType: 'case',
        targetId: caseRecord.id,
        action: 'status-monitoring',
        summary: `Mitigation completed — case “${caseRecord.title.slice(0, 60)}” moved to Monitoring`,
      };
      propagations.push(entry);
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'case',
          entityId: caseRecord.id,
          summary: `[RULE-SYNC-DEL-01] ${entry.summary}`,
        });
      }
    }
  }

  return propagations;
}

/**
 * RULE-CAP-03 — a funding decision is never detached from the objective it
 * starves. Deferring or cutting capacity for goal-backed work writes an
 * explainable check-in on that goal; restoring the funding writes the
 * follow-up. Idempotent per decision state.
 */
export function propagatePortfolioDecision(
  draft,
  item,
  { now = new Date(), idFactory, logEvent = null, previousDecision = null } = {},
) {
  const propagations = [];
  if (!draft || !item) return propagations;
  if (item.status !== 'open') return propagations;
  if (!['funded', 'deferred', 'cut'].includes(item.decision)) return propagations;
  // Funding work that was never funded before is not a change of plan, so it
  // writes no goal note. Re-funding work that was deferred or cut is.
  if (item.decision === 'funded' && !['deferred', 'cut'].includes(previousDecision)) return propagations;

  let goal = item.sourceType === 'goal' && item.sourceId
    ? (draft.goals || []).find((g) => g.id === item.sourceId)
    : null;
  if (!goal) {
    const link = (draft.links || []).find(
      (l) => l && l.ruleId !== 'RULE-CAP-02' &&
        ((l.sourceType === 'portfolio' && l.sourceId === item.id && l.targetType === 'goal') ||
          (l.targetType === 'portfolio' && l.targetId === item.id && l.sourceType === 'goal')),
    );
    if (link) {
      const goalId = link.sourceType === 'goal' ? link.sourceId : link.targetId;
      goal = (draft.goals || []).find((g) => g.id === goalId) || null;
    }
  }
  if (!goal) return propagations;

  const todayStr = dayKey(now);
  const nowIso = now.toISOString();
  const tag = `[Portfolio ${item.id} ${item.decision}]`;
  goal.checkins = Array.isArray(goal.checkins) ? goal.checkins : [];
  const already = goal.checkins.some((chk) => String(chk?.note || '').includes(tag));
  if (already) return propagations;

  ensureEntityLink(
    draft,
    {
      sourceType: 'portfolio',
      sourceId: item.id,
      targetType: 'goal',
      targetId: goal.id,
      relation: 'impacts-goal',
      ruleId: 'RULE-CAP-03',
      summary: `${item.decision === 'funded' ? 'Funds' : 'Removes'} capacity for “${goal.title.slice(0, 60)}”`,
    },
    { idFactory, todayStr, nowIso },
  );

  const days = item.effortDays?.mostLikely ?? 0;
  const isLoss = item.decision !== 'funded';
  const wasOnTrack = goal.confidence === 'on-track';
  if (isLoss && wasOnTrack) goal.confidence = 'at-risk';
  const note = isLoss
    ? `${tag} Capacity decision: “${item.title.slice(0, 70)}” was ${item.decision} (${days} person-day(s) freed). Review whether the key result is still achievable inside the current plan.`
    : `${tag} Capacity decision: “${item.title.slice(0, 70)}” is funded again (${days} person-day(s) committed). Re-check the delivery date before promising it.`;
  goal.checkins.push({
    id: idFactory('chk'),
    date: todayStr,
    confidence: goal.confidence,
    progressPct: null,
    keyResults: null,
    note,
  });

  const entry = {
    ruleId: 'RULE-CAP-03',
    targetType: 'goal',
    targetId: goal.id,
    action: 'updated',
    summary: `Logged “${item.title.slice(0, 50)}” ${item.decision} on goal “${goal.title.slice(0, 50)}”`,
  };
  propagations.push(entry);
  if (logEvent) {
    logEvent({
      type: 'automation.propagated',
      entity: 'goal',
      entityId: goal.id,
      summary: `[RULE-CAP-03] ${entry.summary}`,
    });
  }
  return propagations;
}

/**
 * Construct an Operational Case payload from an upstream Delegation, Goal, or
 * Decision so `escalateToCase` can link it (`escalates-from`) and fan out
 * across the rest of LeadOS.
 */
export function buildCaseFromUpstreamEntity(state, { sourceType, sourceId, overrides = {}, now = new Date() } = {}) {
  const todayStr = dayKey(now);
  const reviewDefault = addDaysKey(todayStr, 14, now);

  if (sourceType === 'delegation') {
    const del = (state.delegations || []).find((d) => d.id === sourceId);
    if (!del) return { ok: false, error: 'That delegation no longer exists.' };
    const latestCheckin = (del.checkins || []).at(-1);
    return {
      ok: true,
      payload: {
        kind: 'escalation',
        status: 'open',
        title: overrides.title || `Unblock delegated outcome: ${del.title}`.slice(0, 160),
        summary:
          overrides.summary ||
          `Escalated from delegation “${del.title}”. Expected outcome: ${del.expectedOutcome}${latestCheckin?.note ? ` Latest check-in (${latestCheckin.progress}): ${latestCheckin.note}` : ''}`,
        ownerId: overrides.ownerId !== undefined ? overrides.ownerId : del.personId,
        involvedPersonIds: overrides.involvedPersonIds || [del.personId].filter(Boolean),
        linkedGoalId: overrides.linkedGoalId || null,
        openedOn: overrides.openedOn || todayStr,
        reviewOn: overrides.reviewOn || del.dueOn || reviewDefault,
        fmea: {
          severity: 7,
          probability: 6,
          detectability: 5,
          failureMode: `Delegated outcome “${del.title}” stalls or misses commitment`,
          effect: del.expectedOutcome || 'Downstream delivery delay',
          controls: del.support || '',
          ...(overrides.fmea || {}),
        },
        financial: overrides.financial || {},
        rca: {
          problemStatement: latestCheckin?.note || `Blocked / overdue execution on “${del.title}”`,
          whys: overrides.rca?.whys || [],
          rootCause: overrides.rca?.rootCause || '',
          systemicBarrier: overrides.rca?.systemicBarrier || '',
          preventiveAction: overrides.rca?.preventiveAction || '',
        },
        stakeholders: overrides.stakeholders || [],
        autoPropagate: overrides.autoPropagate !== false,
      },
    };
  }

  if (sourceType === 'goal') {
    const goal = (state.goals || []).find((g) => g.id === sourceId);
    if (!goal) return { ok: false, error: 'That goal no longer exists.' };
    const latestCheckin = (goal.checkins || []).at(-1);
    return {
      ok: true,
      payload: {
        kind: 'risk',
        status: 'open',
        title: overrides.title || `Goal delivery risk: ${goal.title}`.slice(0, 160),
        summary:
          overrides.summary ||
          `Escalated from ${goal.confidence || 'active'} goal “${goal.title}”.${goal.description ? ` ${goal.description}` : ''}${latestCheckin?.note ? ` Latest check-in: ${latestCheckin.note}` : ''}`,
        ownerId: overrides.ownerId !== undefined ? overrides.ownerId : goal.ownerId || null,
        involvedPersonIds: overrides.involvedPersonIds || (goal.ownerId ? [goal.ownerId] : []),
        linkedGoalId: goal.id,
        openedOn: overrides.openedOn || todayStr,
        reviewOn: overrides.reviewOn || reviewDefault,
        fmea: {
          severity: goal.confidence === 'off-track' ? 8 : 7,
          probability: goal.confidence === 'off-track' ? 7 : 5,
          detectability: 5,
          failureMode: `Key results on “${goal.title}” miss target window`,
          effect: 'Strategic objective slips without explicit scope or capacity trade-off',
          controls: 'OKR check-in cadence',
          ...(overrides.fmea || {}),
        },
        financial: overrides.financial || {},
        rca: {
          problemStatement: latestCheckin?.note || `Goal “${goal.title}” is ${goal.confidence}`,
          whys: overrides.rca?.whys || [],
          rootCause: overrides.rca?.rootCause || '',
          systemicBarrier: overrides.rca?.systemicBarrier || '',
          preventiveAction: overrides.rca?.preventiveAction || '',
        },
        stakeholders: overrides.stakeholders || [],
        autoPropagate: overrides.autoPropagate !== false,
      },
    };
  }

  if (sourceType === 'decision') {
    const dec = (state.decisions || []).find((d) => d.id === sourceId);
    if (!dec) return { ok: false, error: 'That decision no longer exists.' };
    const isAdverse = dec.outcome === 'bad' || dec.outcome === 'mixed';
    const matchedDriver = dec.driver
      ? (state.people || []).find((p) => p.name.trim().toLowerCase() === dec.driver.trim().toLowerCase())
      : null;
    const contributorNames = typeof dec.contributors === 'string'
      ? dec.contributors.split(',').map((s) => s.trim()).filter(Boolean)
      : Array.isArray(dec.contributors) ? dec.contributors : [];
    return {
      ok: true,
      payload: {
        kind: isAdverse ? 'incident' : 'initiative',
        status: 'open',
        title: overrides.title || `${isAdverse ? 'Corrective case' : 'Execution case'}: ${dec.title}`.slice(0, 160),
        summary:
          overrides.summary ||
          `Escalated from decision “${dec.title}”${dec.chosen ? ` (chosen: ${dec.chosen})` : ''}.${dec.outcomeNotes ? ` Review notes: ${dec.outcomeNotes}` : dec.question ? ` ${dec.question}` : ''}`,
        ownerId: overrides.ownerId !== undefined ? overrides.ownerId : matchedDriver?.id || null,
        involvedPersonIds: overrides.involvedPersonIds || (matchedDriver ? [matchedDriver.id] : []),
        linkedGoalId: overrides.linkedGoalId || null,
        openedOn: overrides.openedOn || todayStr,
        reviewOn: overrides.reviewOn || reviewDefault,
        fmea: {
          severity: dec.reversibility === 'irreversible' || dec.outcome === 'bad' ? 8 : 6,
          probability: isAdverse ? 7 : 5,
          detectability: 5,
          failureMode: isAdverse
            ? `Adverse decision outcome on “${dec.title}” continues unmitigated`
            : `Execution risk on decision “${dec.title}”`,
          effect: dec.outcomeNotes || dec.question || '',
          controls: dec.rationale || '',
          ...(overrides.fmea || {}),
        },
        financial: overrides.financial || {},
        rca: {
          problemStatement: dec.outcomeNotes || dec.question || dec.title,
          whys: overrides.rca?.whys || [],
          rootCause: overrides.rca?.rootCause || '',
          systemicBarrier: overrides.rca?.systemicBarrier || '',
          preventiveAction: overrides.rca?.preventiveAction || '',
        },
        stakeholders:
          overrides.stakeholders ||
          [
            ...(dec.approver ? [{ name: dec.approver, role: 'Approver (DACI)', power: 5, interest: 4, stance: 'neutral' }] : []),
            ...contributorNames.slice(0, 3).map((name) => ({ name, role: 'Contributor (DACI)', power: 3, interest: 4, stance: 'supportive' })),
          ],
        autoPropagate: overrides.autoPropagate !== false,
      },
    };
  }

  if (sourceType === 'requisition') {
    const req = (state.requisitions || []).find((r) => r.id === sourceId);
    if (!req) return { ok: false, error: 'That requisition no longer exists.' };
    const reqCandidates = (state.candidates || []).filter((c) => c.reqId === req.id);
    const funnel = funnelStats(req, reqCandidates, { now });
    const vacancyLine = funnel.vacancy.measured
      ? ` Recorded vacancy exposure: ${funnel.vacancy.currency} ${funnel.vacancy.cost.toLocaleString('en-US')} over ${funnel.vacancy.days} day(s).`
      : ' No cost of vacancy has been recorded, so exposure is unmeasured.';
    return {
      ok: true,
      payload: {
        kind: 'risk',
        status: 'open',
        title: overrides.title || `Stalled hire: ${req.title}`.slice(0, 160),
        summary:
          overrides.summary ||
          `Requisition “${req.title}” is ${req.status} and has not moved in ${funnel.daysSinceActivity} day(s) against a ${funnel.stallDays}-day window, ${funnel.daysOpen} day(s) after it opened.${vacancyLine} ${funnel.active} candidate(s) still active.`,
        ownerId: overrides.ownerId !== undefined ? overrides.ownerId : null,
        involvedPersonIds: overrides.involvedPersonIds || (req.interviewers || []).slice(0, 6),
        linkedGoalId: overrides.linkedGoalId || null,
        openedOn: overrides.openedOn || todayStr,
        reviewOn: overrides.reviewOn || reviewDefault,
        fmea: {
          severity: 6,
          probability: 8,
          detectability: 4,
          failureMode: `Seat “${req.title}” stays empty past plan`,
          effect: 'Delivered scope is carried by the existing team, which converts a hiring delay into overload and attrition risk',
          controls: `${req.competencies?.length || 0} defined competencies; ${funnel.active} active candidate(s)`,
          ...(overrides.fmea || {}),
        },
        financial: overrides.financial || {},
        rca: {
          problemStatement: `No candidate progression for ${funnel.daysSinceActivity} day(s) on ${req.title}.${funnel.cycleMedianDays !== null ? ` Observed cycle time: ${funnel.cycleMedianDays} day(s).` : ''}`,
          whys: overrides.rca?.whys || [],
          rootCause: overrides.rca?.rootCause || '',
          systemicBarrier: overrides.rca?.systemicBarrier || '',
          preventiveAction: overrides.rca?.preventiveAction || '',
        },
        stakeholders: overrides.stakeholders || [],
        autoPropagate: overrides.autoPropagate !== false,
      },
    };
  }

  return { ok: false, error: 'Unsupported escalation source type.' };
}

/* ------------------------------------------------------------------ */
/* Selection & hiring (Schema v17)                                     */
/* ------------------------------------------------------------------ */

const ZERO_TRIPLE = { optimistic: 0, mostLikely: 0, pessimistic: 0 };

function effortEqual(a, b) {
  return (
    Math.abs((a?.optimistic || 0) - (b?.optimistic || 0)) < 0.005 &&
    Math.abs((a?.mostLikely || 0) - (b?.mostLikely || 0)) < 0.005 &&
    Math.abs((a?.pessimistic || 0) - (b?.pessimistic || 0)) < 0.005
  );
}

function hiringItemTitle(requisition) {
  return `Hiring: ${requisition.title}`.slice(0, 200);
}

/**
 * RULE-HIRE-01 — keep the interviewer-effort reserve in step with the opening.
 *
 * Idempotent: repeated calls refresh the existing item instead of adding a
 * second one. A role with no recorded estimate reserves nothing, and the item
 * is completed (not deleted) when the seat is filled, so the effort appears in
 * the delivered-throughput data the flow metrics use.
 */
export function syncRequisitionCapacity(draft, requisition, { idFactory, todayStr, nowIso, logEvent = null } = {}) {
  if (!draft || !requisition) return null;
  draft.portfolio = Array.isArray(draft.portfolio) ? draft.portfolio : [];
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  const existing = draft.portfolio.find(
    (p) => p && p.sourceType === 'requisition' && p.sourceId === requisition.id,
  ) || null;
  const effort = measurableEffort(requisition.effortDays);
  const active = ACTIVE_REQUISITION_STATUSES.includes(requisition.status);
  let change = null;

  const linkToItem = (item, summary) => ensureEntityLink(
    draft,
    {
      sourceType: 'requisition',
      sourceId: requisition.id,
      targetType: 'portfolio',
      targetId: item.id,
      relation: 'consumes-capacity',
      ruleId: 'RULE-HIRE-01',
      summary,
    },
    { idFactory, todayStr, nowIso },
  );

  if (active && effort) {
    if (!existing) {
      const item = {
        id: idFactory('pf'),
        title: hiringItemTitle(requisition),
        kind: 'hiring',
        status: 'open',
        sourceType: 'requisition',
        sourceId: requisition.id,
        ownerId: null,
        effortDays: { ...effort },
        // Hiring consumes capacity; it does not produce measured value. Leaving
        // value unmeasured keeps it out of the funding boundary rather than
        // pretending a requisition has a revenue estimate.
        value: { ...ZERO_TRIPLE },
        currency: requisition.currency || 'USD',
        decision: 'funded',
        decisionOn: requisition.openedOn && requisition.openedOn <= todayStr ? requisition.openedOn : todayStr,
        rationale: 'Interview effort committed by an open requisition (RULE-HIRE-01). Value is unmeasured: hiring consumes capacity rather than producing measurable revenue.',
        targetOn: requisition.targetStartOn || null,
        createdOn: todayStr,
        completedOn: null,
        releasedOn: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      draft.portfolio.push(item);
      linkToItem(item, `Interview effort for ${requisition.title}`);
      change = { ruleId: 'RULE-HIRE-01', action: 'created', itemId: item.id, title: item.title };
    } else {
      const reopening = existing.status === 'released';
      const needsEffort = !effortEqual(existing.effortDays, effort);
      const needsTarget = (existing.targetOn || null) !== (requisition.targetStartOn || null);
      const needsTitle = existing.title !== hiringItemTitle(requisition);
      if (reopening) {
        existing.status = 'open';
        existing.releasedOn = null;
        existing.completedOn = null;
        existing.decision = 'funded';
        existing.rationale = `${existing.rationale ? `${existing.rationale} · ` : ''}Reinstated when the role reopened (RULE-HIRE-01).`.slice(0, 1000);
        change = { ruleId: 'RULE-HIRE-01', action: 'reinstated', itemId: existing.id, title: existing.title };
      }
      if (needsEffort) existing.effortDays = { ...effort };
      if (needsTarget) existing.targetOn = requisition.targetStartOn || null;
      if (needsTitle) existing.title = hiringItemTitle(requisition);
      if (reopening || needsEffort || needsTarget || needsTitle) existing.updatedAt = nowIso;
      if (!change && (needsEffort || needsTarget)) {
        change = { ruleId: 'RULE-HIRE-01', action: 'refreshed', itemId: existing.id, title: existing.title };
      }
      linkToItem(existing, `Interview effort for ${requisition.title}`);
    }
  } else if (existing && existing.status === 'open') {
    if (requisition.status === 'filled') {
      existing.status = 'done';
      existing.completedOn = requisition.closedOn && requisition.closedOn <= todayStr ? requisition.closedOn : todayStr;
      existing.releasedOn = null;
      existing.rationale = `${existing.rationale ? `${existing.rationale} · ` : ''}Delivered when the seat was filled (RULE-HIRE-01).`.slice(0, 1000);
      change = { ruleId: 'RULE-HIRE-01', action: 'completed', itemId: existing.id, title: existing.title };
    } else {
      existing.status = 'released';
      existing.releasedOn = requisition.closedOn && requisition.closedOn <= todayStr ? requisition.closedOn : todayStr;
      const why = !active
        ? `role ${requisition.status}`
        : 'effort estimate removed';
      existing.rationale = `${existing.rationale ? `${existing.rationale} · ` : ''}Released ${existing.releasedOn}: ${why} (RULE-HIRE-01).`.slice(0, 1000);
      change = { ruleId: 'RULE-HIRE-01', action: 'released', itemId: existing.id, title: existing.title };
    }
    existing.updatedAt = nowIso;
  }

  if (change && logEvent) {
    logEvent({
      type: 'automation.propagated',
      entity: 'requisition',
      entityId: requisition.id,
      summary: `RULE-HIRE-01 ${change.action} interview-effort reserve for “${requisition.title}”: ${change.action === 'released' ? 'capacity released' : change.action === 'completed' ? 'delivered, capacity freed' : 'capacity committed'}`,
    });
  }
  return change;
}

/**
 * RULE-HIRE-02 — an accepted offer closes the loop into people and onboarding.
 *
 * The roster record and its 30-60-90 plan are created by the action that
 * records the acceptance (where name and start-date validation belongs). This
 * rule then guarantees the typed links exist, completes the requisition's
 * capacity reserve as delivered, and writes the audit trail.
 */
export function onCandidateHired(draft, candidateId, { idFactory, todayStr, nowIso, logEvent = null } = {}) {
  if (!draft) return [];
  const candidate = (draft.candidates || []).find((c) => c.id === candidateId);
  if (!candidate || candidate.stage !== 'hired') return [];
  const requisition = (draft.requisitions || []).find((r) => r.id === candidate.reqId);
  if (!requisition) return [];
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  draft.portfolio = Array.isArray(draft.portfolio) ? draft.portfolio : [];
  const entries = [];

  const add = (spec) => {
    const res = ensureEntityLink(draft, { ...spec, ruleId: 'RULE-HIRE-02' }, { idFactory, todayStr, nowIso });
    if (res.created) entries.push({ ruleId: 'RULE-HIRE-02', ...spec });
  };

  add({
    sourceType: 'candidate',
    sourceId: candidate.id,
    targetType: 'requisition',
    targetId: requisition.id,
    relation: 'assessed-for',
    summary: `${candidate.name} assessed for ${requisition.title}`,
  });

  if (candidate.personId) {
    add({
      sourceType: 'requisition',
      sourceId: requisition.id,
      targetType: 'person',
      targetId: candidate.personId,
      relation: 'hires',
      summary: `${requisition.title} → ${candidate.name}`,
    });
    const plans = (draft.onboarding || []).filter(
      (p) => p && p.personId === candidate.personId && p.kind === 'new-hire',
    );
    const plan = candidate.startOn
      ? plans.find((p) => p.startDate === candidate.startOn)
      : plans.sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0];
    if (plan) {
      add({
        sourceType: 'person',
        sourceId: candidate.personId,
        targetType: 'onboarding',
        targetId: plan.id,
        relation: 'onboards',
        summary: `First 90 days for ${candidate.name}`,
      });
    }
  }

  let capacityChange = null;
  const item = draft.portfolio.find(
    (p) => p && p.sourceType === 'requisition' && p.sourceId === requisition.id && p.status === 'open',
  );
  if (item) {
    item.status = 'done';
    item.completedOn = candidate.hiredOn || requisition.closedOn || todayStr;
    item.releasedOn = null;
    item.updatedAt = nowIso;
    item.rationale = `${item.rationale ? `${item.rationale} · ` : ''}Delivered ${item.completedOn}: offer accepted (RULE-HIRE-02).`.slice(0, 1000);
    capacityChange = { action: 'completed', itemId: item.id };
  }

  if (logEvent && (entries.length || capacityChange)) {
    logEvent({
      type: 'automation.propagated',
      entity: 'candidate',
      entityId: candidate.id,
      summary: `RULE-HIRE-02 linked ${candidate.name} to ${requisition.title}${candidate.personId ? ', the roster and the 30-60-90 plan' : ''}${capacityChange ? ', and freed the interview reserve' : ''}`,
    });
  }
  return [...entries, ...(capacityChange ? [{ ruleId: 'RULE-HIRE-02', ...capacityChange }] : [])];
}

/**
 * Text preview of what opening or editing a requisition will do, used by the
 * dialog before anything is saved.
 */
export function previewHiringPropagations(requisitionInput = {}, state = {}) {
  const out = [];
  const effort = measurableEffort(requisitionInput.effortDays);
  const active = ACTIVE_REQUISITION_STATUSES.includes(requisitionInput.status || 'open');
  if (active && effort) {
    out.push(`Reserve ${effort.mostLikely} person-day(s) (PERT ${effort.optimistic}/${effort.mostLikely}/${effort.pessimistic}) of interviewer effort in the capacity plan.`);
  } else if (active) {
    out.push('No effort estimate recorded yet, so no capacity will be reserved. The plan will not guess one.');
  }
  const candidates = requisitionInput.id
    ? (state.candidates || []).filter((c) => c && c.reqId === requisitionInput.id)
    : [];
  if (candidates.length) out.push(`${candidates.length} candidate record(s) stay attached; evidence and decisions are kept.`);
  if (requisitionInput.status === 'filled') out.push('Completing the role marks the interview reserve delivered and frees the capacity.');
  if (requisitionInput.status === 'cancelled' || requisitionInput.status === 'on-hold') out.push('Releasing the role returns its reserved capacity to the plan.');
  return out;
}

/* ------------------------------------------------------------------ */
/* Organizational Design, Team Topologies & Change (Schema v19)       */
/* ------------------------------------------------------------------ */

function changeReserveTitle(change) {
  return `Change transition: ${change.title}`.slice(0, 200);
}

function changeCoachingPrompt(change) {
  const shortTitle = (change.title || 'Organizational change').trim().slice(0, 52);
  return `Change support (${shortTitle}): check role boundaries, cognitive load & transition blockers`;
}

function buildRoleTransitionCheckpointsForChange(startDate, idFactory) {
  const dueAt = (offset) => addDays(startDate, offset);
  const templates = [
    [30, 'clarity', 'Agree the handover inventory for the old role: what stops, what transfers to whom, and by when', 14],
    [30, 'clarity', 'Write down how the new role differs: scope, decision authority and what good looks like at 90 days', 30],
    [60, 'contribution', 'Deliver or jointly review the first scoped early win in the new boundary', 60],
    [60, 'culture', 'Exchange 60-day calibration: which old-boundary habits to drop, and what the new interface expects', 60],
    [90, 'ownership', 'Own the new recurring outcomes end to end without falling back on the old seam', 90],
    [90, 'ownership', 'Reset steady-state goals and GROW development commitments to the new charter', 90],
  ];
  return templates.map(([horizon, category, title, offset]) => ({
    id: idFactory('onbc'),
    horizon,
    category,
    title,
    due: dueAt(offset),
    done: false,
    completedOn: null,
    notes: '',
  }));
}

/**
 * RULE-CHG-01 — synchronize committed transition effort with `#/capacity`.
 * Active/stabilising changes reserve capacity; anchored marks delivered;
 * paused/abandoned/proposed releases an open reserve back to the plan.
 */
export function syncChangeCapacityReserve(draft, change, { idFactory, todayStr, nowIso, logEvent = null }) {
  if (!change || !change.id) return null;
  draft.portfolio = Array.isArray(draft.portfolio) ? draft.portfolio : [];
  draft.links = Array.isArray(draft.links) ? draft.links : [];

  const effort = pertStats(
    change.effortDays?.optimistic,
    change.effortDays?.mostLikely,
    change.effortDays?.pessimistic,
  );
  const committed = isChangeCommitted(change);
  const existing = draft.portfolio.find(
    (p) => p && p.sourceType === 'change' && p.sourceId === change.id,
  ) || null;

  if (committed && effort.measured) {
    const triple = {
      optimistic: effort.optimistic,
      mostLikely: effort.mostLikely,
      pessimistic: effort.pessimistic,
    };
    if (!existing) {
      const item = {
        id: idFactory('pf'),
        title: changeReserveTitle(change),
        kind: 'capacity-reserve',
        status: 'open',
        sourceType: 'change',
        sourceId: change.id,
        ownerId: change.ownerId || null,
        effortDays: triple,
        value: { ...ZERO_TRIPLE },
        currency: change.economics?.currency || 'USD',
        decision: 'funded',
        decisionOn: change.openedOn || todayStr,
        rationale: `Transition capacity reserved for active organizational change “${change.title}” (RULE-CHG-01).`,
        targetOn: change.targetOn || null,
        createdOn: change.openedOn || todayStr,
        completedOn: null,
        releasedOn: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      draft.portfolio.push(item);
      ensureEntityLink(
        draft,
        {
          sourceType: 'change',
          sourceId: change.id,
          targetType: 'portfolio',
          targetId: item.id,
          relation: 'consumes-capacity',
          ruleId: 'RULE-CHG-01',
          summary: `${effort.expected}d transition effort reserved`,
        },
        { idFactory, todayStr, nowIso },
      );
      const entry = {
        ruleId: 'RULE-CHG-01',
        targetType: 'portfolio',
        targetId: item.id,
        action: 'created',
        summary: `Reserved ${effort.expected} person-day(s) of transition capacity for “${change.title}”`,
      };
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'portfolio',
          entityId: item.id,
          summary: `[RULE-CHG-01] ${entry.summary}`,
        });
      }
      return entry;
    }

    const needReopen = existing.status !== 'open';
    const changed =
      needReopen ||
      !effortEqual(existing.effortDays, triple) ||
      existing.title !== changeReserveTitle(change) ||
      existing.ownerId !== (change.ownerId || null) ||
      existing.targetOn !== (change.targetOn || null);

    ensureEntityLink(
      draft,
      {
        sourceType: 'change',
        sourceId: change.id,
        targetType: 'portfolio',
        targetId: existing.id,
        relation: 'consumes-capacity',
        ruleId: 'RULE-CHG-01',
        summary: `${effort.expected}d transition effort reserved`,
      },
      { idFactory, todayStr, nowIso },
    );

    if (!changed) return null;

    existing.title = changeReserveTitle(change);
    existing.status = 'open';
    existing.completedOn = null;
    existing.releasedOn = null;
    existing.ownerId = change.ownerId || null;
    existing.targetOn = change.targetOn || null;
    existing.effortDays = triple;
    existing.decision = 'funded';
    existing.updatedAt = nowIso;

    const entry = {
      ruleId: 'RULE-CHG-01',
      targetType: 'portfolio',
      targetId: existing.id,
      action: needReopen ? 'reopened' : 'updated',
      summary: `Updated transition capacity reserve to ${effort.expected} person-day(s) for “${change.title}”`,
    };
    if (logEvent) {
      logEvent({
        type: 'automation.propagated',
        entity: 'portfolio',
        entityId: existing.id,
        summary: `[RULE-CHG-01] ${entry.summary}`,
      });
    }
    return entry;
  }

  // Non-committed status or zero effort: settle any open reserve.
  if (existing && existing.status === 'open') {
    if (change.status === 'anchored') {
      existing.status = 'done';
      existing.completedOn = change.anchoredOn || todayStr;
      existing.releasedOn = null;
      existing.updatedAt = nowIso;
      const entry = {
        ruleId: 'RULE-CHG-01',
        targetType: 'portfolio',
        targetId: existing.id,
        action: 'completed',
        summary: `Completed transition capacity reserve for anchored change “${change.title}”`,
      };
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'portfolio',
          entityId: existing.id,
          summary: `[RULE-CHG-01] ${entry.summary}`,
        });
      }
      return entry;
    }

    existing.status = 'released';
    existing.releasedOn = todayStr;
    existing.completedOn = null;
    existing.updatedAt = nowIso;
    const entry = {
      ruleId: 'RULE-CHG-01',
      targetType: 'portfolio',
      targetId: existing.id,
      action: 'released',
      summary: `Released transition capacity reserve (${change.status}) for “${change.title}”`,
    };
    if (logEvent) {
      logEvent({
        type: 'automation.propagated',
        entity: 'portfolio',
        entityId: existing.id,
        summary: `[RULE-CHG-01] ${entry.summary}`,
      });
    }
    return entry;
  }

  return null;
}

function hasChangeLinkToType(links, changeId, targetType, allowedRelations = null) {
  return (links || []).find((l) => {
    if (!l) return false;
    const relOk = !allowedRelations || allowedRelations.includes(l.relation);
    if (!relOk) return false;
    return (
      (l.sourceType === 'change' && l.sourceId === changeId && l.targetType === targetType) ||
      (l.targetType === 'change' && l.targetId === changeId && l.sourceType === targetType)
    );
  }) || null;
}

function shouldCreateChangeDecision(change) {
  if (change.autoCreateDecision === false) return false;
  return (
    change.reversibility === 'irreversible' ||
    ['topology', 'reporting-line', 'charter'].includes(change.kind)
  );
}

/**
 * Parallel + vertical cross-module propagation for Organizational Changes.
 * Runs inside a single atomic `store.update` transaction.
 */
export function propagateChangeEvent(draft, change, { now = new Date(), idFactory, logEvent = null } = {}) {
  if (!change || !change.id) return [];
  const todayStr = dayKey(now);
  const nowIso = now.toISOString();
  const propagations = [];

  draft.links = Array.isArray(draft.links) ? draft.links : [];
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.onboarding = Array.isArray(draft.onboarding) ? draft.onboarding : [];
  draft.goals = Array.isArray(draft.goals) ? draft.goals : [];

  const open = isChangeOpen(change);
  const committed = isChangeCommitted(change);

  // 1. RULE-CHG-01: Capacity reserve sync (runs for all statuses so pauses/anchors release/complete).
  const capEntry = syncChangeCapacityReserve(draft, change, { idFactory, todayStr, nowIso, logEvent });
  if (capEntry) propagations.push(capEntry);

  if (!open) return propagations;

  const forceField = evaluateForceField(change);
  const coalition = evaluateGuidingCoalition(change, now);
  const topology = evaluateTopologyAndLoad(change);
  const star = evaluateStarAlignment(change);

  // 2. RULE-CHG-04: Guiding coalition & veto-player briefing cadence.
  let scheduledBriefs = 0;
  for (const stk of change.coalition || []) {
    if (!stk || !String(stk.name || '').trim() || stk.nextBriefOn) continue;
    const isHighPriority = stk.vetoPlayer || (Number(stk.power) >= 4 && Number(stk.interest) >= 3);
    const offset = stk.vetoPlayer && (stk.stance === 'blocker' || stk.stance === 'skeptical')
      ? 2
      : isHighPriority
        ? 7
        : 14;
    stk.nextBriefOn = addDays(todayStr, offset);
    scheduledBriefs += 1;
  }
  if (scheduledBriefs > 0) {
    const entry = {
      ruleId: 'RULE-CHG-04',
      targetType: 'change',
      targetId: change.id,
      action: 'scheduled',
      summary: `Scheduled briefing dates for ${scheduledBriefs} guiding-coalition / veto stakeholder(s)`,
    };
    propagations.push(entry);
    if (logEvent) {
      logEvent({
        type: 'automation.propagated',
        entity: 'change',
        entityId: change.id,
        summary: `[RULE-CHG-04] ${entry.summary}`,
      });
    }
  }

  // 3. RULE-CHG-02: Structural DACI governance decision.
  const existingDecLink = hasChangeLinkToType(draft.links, change.id, 'decision', ['decides']);
  if (!existingDecLink && shouldCreateChangeDecision(change)) {
    const effort = pertStats(
      change.effortDays?.optimistic,
      change.effortDays?.mostLikely,
      change.effortDays?.pessimistic,
    );
    const owner = change.ownerId ? (draft.people || []).find((p) => p.id === change.ownerId) : null;
    const approvers = coalition.vetoPlayers.map((v) => v.name).join(', ') || (draft.settings?.leaderName || '');
    const contributors = coalition.members.filter((m) => !m.vetoPlayer).map((m) => m.name).slice(0, 5).join(', ');
    const reviewDefault = change.reviewOn || addDays(todayStr, draft.settings?.changeReviewDays ?? 21);

    const decision = {
      id: idFactory('dec'),
      title: `Change charter: ${change.title}`.slice(0, 200),
      question: [
        change.summary || `Should we execute and anchor "${change.title}"?`,
        change.nonGoals ? `Explicit non-goals: ${change.nonGoals}` : '',
        topology.handoffsDelta !== null ? `Target blocking-handoff delta: ${topology.handoffsDelta}.` : '',
      ].filter(Boolean).join(' ').slice(0, 2000),
      date: change.openedOn || todayStr,
      reversibility: change.reversibility === 'reversible' ? 'reversible' : 'irreversible',
      driver: (owner?.name || draft.settings?.leaderName || '').slice(0, 120),
      approver: approvers.slice(0, 120),
      contributors: contributors.slice(0, 300),
      informed: (draft.settings?.teamName || '').slice(0, 300),
      options: [
        {
          id: idFactory('dopt'),
          label: `Execute target design (${topology.targetTypeLabel.split(' ')[0]})`,
          pros: change.vision
            ? change.vision.slice(0, 300)
            : 'Reduces cross-team coordination drag and clarifies ownership boundaries',
          cons: effort.measured
            ? `Consumes ${effort.expected} person-days of transition capacity${star.incentiveMismatchWarning ? '; rewards/goals alignment still needed' : ''}`
            : 'Temporary J-curve productivity dip during boundary handoff',
        },
        {
          id: idFactory('dopt'),
          label: 'Keep current boundary and patch local rituals only',
          pros: 'Zero structural handoff disruption this cycle',
          cons: (change.summary || 'Leaves underlying systemic cognitive load and handoff wait intact').slice(0, 300),
        },
      ],
      chosen: committed ? `Execute target design (${topology.targetTypeLabel.split(' ')[0]})` : '',
      rationale: committed ? (change.vision || change.summary || 'Committed into active transition.').slice(0, 1000) : '',
      reviewOn: reviewDefault,
      reviewedOn: null,
      outcome: 'pending',
      outcomeNotes: '',
      createdAt: nowIso,
    };
    draft.decisions.push(decision);
    ensureEntityLink(
      draft,
      {
        sourceType: 'change',
        sourceId: change.id,
        targetType: 'decision',
        targetId: decision.id,
        relation: 'decides',
        ruleId: 'RULE-CHG-02',
        summary: `DACI charter decision for “${change.title}”`,
      },
      { idFactory, todayStr, nowIso },
    );
    const entry = {
      ruleId: 'RULE-CHG-02',
      targetType: 'decision',
      targetId: decision.id,
      action: 'created',
      summary: `Opened linked DACI charter decision “${decision.title}”`,
    };
    propagations.push(entry);
    if (logEvent) {
      logEvent({
        type: 'automation.propagated',
        entity: 'decision',
        entityId: decision.id,
        summary: `[RULE-CHG-02] ${entry.summary}`,
      });
    }
  }

  // 4. RULE-CHG-03: Impacted team members -> 1:1 talking points + opted-in 30-60-90 role transitions.
  const prompt = changeCoachingPrompt(change);
  for (const imp of change.impacts || []) {
    if (!imp || !imp.personId) continue;
    const person = (draft.people || []).find((p) => p.id === imp.personId);
    if (!person || person.status === 'archived') continue;

    // 4a. Blameless 1:1 support prompt + coaches link
    ensureEntityLink(
      draft,
      {
        sourceType: 'change',
        sourceId: change.id,
        targetType: 'person',
        targetId: person.id,
        relation: 'coaches',
        ruleId: 'RULE-CHG-03',
        summary: `1:1 transition support for ${person.name}`,
      },
      { idFactory, todayStr, nowIso },
    );
    person.talkingPoints = Array.isArray(person.talkingPoints) ? person.talkingPoints : [];
    const hasPrompt = person.talkingPoints.some(
      (tp) => String(tp).toLowerCase() === prompt.toLowerCase(),
    );
    if (!hasPrompt && person.talkingPoints.length < 12) {
      person.talkingPoints.push(prompt);
      const entry = {
        ruleId: 'RULE-CHG-03',
        targetType: 'person',
        targetId: person.id,
        action: 'talking-point-queued',
        summary: `Queued 1:1 transition support topic for ${person.name}`,
      };
      propagations.push(entry);
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'person',
          entityId: person.id,
          summary: `[RULE-CHG-03] ${entry.summary}`,
        });
      }
    }

    // 4b. Explicit opt-in 30-60-90 role-transition plan (only when change is active/stabilising)
    if (committed && imp.createTransitionPlan) {
      const existingActivePlan = (draft.onboarding || []).find(
        (p) => p && p.personId === person.id && p.status === 'active',
      );
      if (existingActivePlan) {
        ensureEntityLink(
          draft,
          {
            sourceType: 'change',
            sourceId: change.id,
            targetType: 'onboarding',
            targetId: existingActivePlan.id,
            relation: 'transitions-role',
            ruleId: 'RULE-CHG-03',
            summary: `Role transition linked for ${person.name}`,
          },
          { idFactory, todayStr, nowIso },
        );
      } else {
        const startAnchor = person.startDate && todayStr < person.startDate ? person.startDate : todayStr;
        const transitionLabel = (imp.newRoleLabel || `${person.role || 'Role'} · ${change.title}`).slice(0, 160);
        const plan = {
          id: idFactory('onb'),
          personId: person.id,
          kind: 'role-transition',
          label: transitionLabel,
          startDate: startAnchor,
          buddyId: null,
          buddyName: '',
          roleClarity: (change.vision || change.summary || '').slice(0, 2000),
          earlyWin: '',
          stakeholders: [],
          checkpoints: buildRoleTransitionCheckpointsForChange(startAnchor, idFactory),
          reviews: { 30: null, 60: null, 90: null },
          status: 'active',
          completedOn: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        draft.onboarding.push(plan);
        ensureEntityLink(
          draft,
          {
            sourceType: 'change',
            sourceId: change.id,
            targetType: 'onboarding',
            targetId: plan.id,
            relation: 'transitions-role',
            ruleId: 'RULE-CHG-03',
            summary: `Started 30-60-90 role transition for ${person.name}`,
          },
          { idFactory, todayStr, nowIso },
        );
        const entry = {
          ruleId: 'RULE-CHG-03',
          targetType: 'onboarding',
          targetId: plan.id,
          action: 'created',
          summary: `Created 30-60-90 role-transition plan for ${person.name} (“${transitionLabel}”)`,
        };
        propagations.push(entry);
        if (logEvent) {
          logEvent({
            type: 'automation.propagated',
            entity: 'onboarding',
            entityId: plan.id,
            summary: `[RULE-CHG-03] ${entry.summary}`,
          });
        }
      }
    }
  }

  // 5. RULE-CHG-05: Linked Goal risk telemetry when structural change is blocked.
  if (change.linkedGoalId) {
    const goal = (draft.goals || []).find((g) => g.id === change.linkedGoalId && g.status === 'active');
    if (goal) {
      ensureEntityLink(
        draft,
        {
          sourceType: 'change',
          sourceId: change.id,
          targetType: 'goal',
          targetId: goal.id,
          relation: 'impacts-goal',
          ruleId: 'RULE-CHG-05',
          summary: `Change “${change.title}” backs goal “${goal.title}”`,
        },
        { idFactory, todayStr, nowIso },
      );

      const opposingVeto = coalition.unalignedVetoPlayers.filter(
        (v) => v.stance === 'blocker' || v.stance === 'skeptical',
      );
      const changeBlocked =
        committed &&
        (forceField.equilibrium === 'blocked' ||
          forceField.highTensionStalemate ||
          opposingVeto.length > 0);

      if (changeBlocked) {
        const marker = `[RULE-CHG-05:${change.id}]`;
        goal.checkins = Array.isArray(goal.checkins) ? goal.checkins : [];
        const alreadyLogged = goal.checkins.some((chk) => String(chk.note || '').includes(marker));
        if (!alreadyLogged) {
          const reason = opposingVeto.length
            ? `${opposingVeto.length} opposing/skeptical veto player(s) (${opposingVeto.map((v) => v.name).join(', ')})`
            : forceField.highTensionStalemate
              ? 'high-tension force-field stalemate'
              : `restraining forces (${forceField.effectiveRestrainingSum}) exceed driving forces (${forceField.drivingSum})`;
          if (goal.confidence === 'on-track') goal.confidence = 'at-risk';
          goal.checkins.push({
            id: idFactory('chk'),
            date: todayStr,
            confidence: goal.confidence,
            note: `${marker} Dependent organizational change “${change.title}” faces ${reason}. Mitigate blockers in #/changes/${change.id}.`,
            progressPct: null,
            keyResults: null,
          });
          const entry = {
            ruleId: 'RULE-CHG-05',
            targetType: 'goal',
            targetId: goal.id,
            action: 'flagged-at-risk',
            summary: `Flagged goal “${goal.title}” (${goal.confidence}) due to blocked change “${change.title}”`,
          };
          propagations.push(entry);
          if (logEvent) {
            logEvent({
              type: 'automation.propagated',
              entity: 'goal',
              entityId: goal.id,
              summary: `[RULE-CHG-05] ${entry.summary}`,
            });
          }
        }
      }
    }
  }

  // 6. Vertical cascade (RULE-CAP-02): both RULE-CHG-01 (transition effort reserve)
  // and RULE-CHG-03 (Watkins 30-60-90 transition ramp on active supply) alter the
  // team's net feasibility! Re-evaluate capacity trade-off in the same transaction.
  if (committed) {
    const tradeoff = evaluateCapacityTradeoff(draft, {
      now,
      idFactory,
      todayStr,
      nowIso,
      logEvent,
      triggerLabel: 'organizational change',
    });
    if (tradeoff) propagations.push(tradeoff);
  }

  // RULE-STK-01/02: reconcile coalition members to the register and evaluate
  // any adverse veto gate (Tsebelis) on this change.
  propagations.push(
    ...reconcileStakeholderInvolvement(draft, 'change', change.id, { now, idFactory, logEvent }),
  );
  propagations.push(
    ...evaluateStakeholderVetoDecision(draft, 'change', change.id, { now, idFactory, logEvent }),
  );

  return propagations;
}

/**
 * Lifecycle status propagation when anchoring, pausing, or abandoning a change.
 */
export function propagateChangeStatus(draft, change, { now = new Date(), idFactory, logEvent = null } = {}) {
  if (!change || !change.id) return [];
  const todayStr = dayKey(now);
  const nowIso = now.toISOString();
  const propagations = [];

  if (OPEN_CHANGE_STATUSES.includes(change.status)) {
    return propagateChangeEvent(draft, change, { now, idFactory, logEvent });
  }

  const capEntry = syncChangeCapacityReserve(draft, change, { idFactory, todayStr, nowIso, logEvent });
  if (capEntry) propagations.push(capEntry);

  if (change.status === 'anchored') {
    // Update linked Goal with anchored verification note
    if (change.linkedGoalId) {
      const goal = (draft.goals || []).find((g) => g.id === change.linkedGoalId && g.status === 'active');
      if (goal) {
        const marker = `[RULE-CHG-05:anchored:${change.id}]`;
        goal.checkins = Array.isArray(goal.checkins) ? goal.checkins : [];
        if (!goal.checkins.some((c) => String(c.note || '').includes(marker))) {
          goal.checkins.push({
            id: idFactory('chk'),
            date: change.anchoredOn || todayStr,
            confidence: goal.confidence,
            note: `${marker} Dependent organizational change “${change.title}” anchored in practice.${change.closedReason ? ` ${change.closedReason}` : ''}`,
            progressPct: null,
            keyResults: null,
          });
          propagations.push({
            ruleId: 'RULE-CHG-05',
            targetType: 'goal',
            targetId: goal.id,
            action: 'anchored-checkin',
            summary: `Logged anchoring verification on goal “${goal.title}”`,
          });
        }
      }
    }

    // Ensure linked DACI decision has a review date scheduled to evaluate the outcome
    const decLink = hasChangeLinkToType(draft.links || [], change.id, 'decision', ['decides']);
    if (decLink) {
      const decId = decLink.sourceType === 'decision' ? decLink.sourceId : decLink.targetId;
      const dec = (draft.decisions || []).find((d) => d.id === decId);
      if (dec) {
        if (!dec.chosen) {
          dec.chosen = dec.options?.[0]?.label || `Execute ${change.title}`;
          dec.rationale = dec.rationale || change.closedReason || 'Change anchored in operating rhythm.';
        }
        if (!dec.reviewOn) {
          dec.reviewOn = addDays(change.anchoredOn || todayStr, draft.settings?.decisionReviewDays ?? 14);
        }
      }
    }
  }

  return propagations;
}

/**
 * Dry-run preview of cross-module propagations for the Change dialog UI.
 * Pure read-only evaluation — never mutates `state`.
 */
export function previewChangePropagations(changeInput = {}, state = {}, { now = new Date(), existingChangeId = null } = {}) {
  const status = changeInput.status || 'proposed';
  const open = OPEN_CHANGE_STATUSES.includes(status);
  const committed = COMMITTED_CHANGE_STATUSES.includes(status);
  const effort = pertStats(
    changeInput.effortDays?.optimistic,
    changeInput.effortDays?.mostLikely,
    changeInput.effortDays?.pessimistic,
  );
  const links = state.links || [];
  const previews = [];

  if (committed && effort.measured) {
    previews.push({
      ruleId: 'RULE-CHG-01',
      targetModule: 'Capacity & flow',
      action: 'reserve',
      summary: `Reserve ${effort.expected} person-day(s) (P10 ${effort.p10}–P90 ${effort.p90}) in the operating plan`,
      detail: 'If this pushes committed work above allocatable supply, RULE-CAP-02 opens a trade-off decision automatically.',
    });
  } else if (open && !committed && effort.measured) {
    previews.push({
      ruleId: 'RULE-CHG-01',
      targetModule: 'Capacity & flow',
      action: 'hold',
      summary: `${effort.expected} person-day(s) estimated — capacity will be reserved once status moves from Proposed to Active`,
      detail: 'Proposed designs do not consume committed team capacity until activated.',
    });
  }

  const existingDec = existingChangeId
    ? hasChangeLinkToType(links, existingChangeId, 'decision', ['decides'])
    : null;
  if (open && !existingDec && shouldCreateChangeDecision(changeInput)) {
    previews.push({
      ruleId: 'RULE-CHG-02',
      targetModule: 'Decisions (DACI)',
      action: 'create',
      summary: 'Create & link DACI charter decision with explicit non-goals and review date',
      detail: 'Structural / irreversible boundary changes require explicit DACI governance.',
    });
  }

  const impacts = Array.isArray(changeInput.impacts) ? changeInput.impacts : [];
  const validImpacts = impacts.filter((i) => i && i.personId);
  const transitionOptIns = validImpacts.filter((i) => i.createTransitionPlan);
  if (open && validImpacts.length > 0) {
    previews.push({
      ruleId: 'RULE-CHG-03',
      targetModule: '1:1s & 30-60-90 Transitions',
      action: 'scaffold',
      summary: `Queue 1:1 support topics for ${validImpacts.length} person(s)${committed && transitionOptIns.length ? ` and start ${transitionOptIns.length} 30-60-90 role-transition plan(s)` : ''}`,
      detail: transitionOptIns.length && !committed
        ? `${transitionOptIns.length} opted-in 30-60-90 transition plan(s) will start as soon as the change becomes Active.`
        : 'Role-transition ramps automatically adjust team capacity supply (#/capacity).',
    });
  }

  const unscheduled = (changeInput.coalition || []).filter((s) => s && String(s.name || '').trim() && !s.nextBriefOn);
  if (open && unscheduled.length > 0) {
    previews.push({
      ruleId: 'RULE-CHG-04',
      targetModule: 'Guiding coalition',
      action: 'schedule',
      summary: `Schedule briefing dates for ${unscheduled.length} coalition / veto stakeholder(s)`,
      detail: 'Veto players and high-power actors receive tighter briefing cadences.',
    });
  }

  if (open && changeInput.linkedGoalId) {
    const goal = (state.goals || []).find((g) => g.id === changeInput.linkedGoalId);
    if (goal) {
      const ff = evaluateForceField(changeInput);
      const coal = evaluateGuidingCoalition(changeInput, now);
      const blocked = committed && (
        ff.equilibrium === 'blocked' ||
        ff.highTensionStalemate ||
        coal.unalignedVetoPlayers.some((v) => v.stance === 'blocker' || v.stance === 'skeptical')
      );
      previews.push({
        ruleId: 'RULE-CHG-05',
        targetModule: 'Goals (OKRs)',
        action: blocked ? 'flag-at-risk' : 'link',
        summary: blocked
          ? `Link goal “${goal.title}” and log at-risk check-in (blocked force-field / veto player)`
          : `Link goal “${goal.title}” to track structural dependency`,
        detail: 'Keeps strategic objectives honest about organizational dependencies.',
      });
    }
  }

  return previews;
}

/**
 * Escalate an unmitigated restraining force on an Organizational Change into a
 * full Operational Case (`#/cases`) with FMEA, 5-Whys, and stakeholder links.
 */
export function buildCaseFromRestrainingForce(state, { changeId, forceId, now = new Date() } = {}) {
  const change = (state?.changes || []).find((c) => c.id === changeId);
  if (!change) return { ok: false, error: 'That organizational change no longer exists.' };
  const force = (change.forces || []).find((f) => f.id === forceId && f.side === 'restraining');
  if (!force) return { ok: false, error: 'Choose a restraining force to escalate.' };

  const todayStr = dayKey(now);
  const severity = Math.min(10, Math.max(4, Number(force.weight || 3) * 2));
  return {
    ok: true,
    payload: {
      kind: 'risk',
      status: 'open',
      title: `Change blocker: ${force.label}`.slice(0, 180),
      summary: `Escalated from restraining force (${force.weight}/5, ${force.category}) blocking organizational change “${change.title}”.${force.mitigation ? ` Proposed mitigation: ${force.mitigation}` : ''}`,
      ownerId: change.ownerId || null,
      involvedPersonIds: (change.impacts || []).map((i) => i.personId).slice(0, 6),
      linkedGoalId: change.linkedGoalId || null,
      openedOn: todayStr,
      reviewOn: addDays(todayStr, state?.settings?.caseReviewDays ?? 14),
      fmea: {
        severity,
        probability: force.mitigated ? 4 : 7,
        detectability: 5,
        failureMode: force.label,
        effect: `Stalls or reverses organizational change “${change.title}”`,
        controls: force.mitigation || 'No mitigation control in place yet',
      },
      financial: {},
      rca: {
        problemStatement: `Restraining force “${force.label}” (${force.weight}/5) is blocking “${change.title}”.`,
        whys: [],
        rootCause: '',
        systemicBarrier: '',
        preventiveAction: force.mitigation || '',
      },
      stakeholders: (change.coalition || []).slice(0, 6).map((s) => ({
        name: s.name,
        role: s.role,
        power: s.power,
        interest: s.interest,
        stance: s.stance,
        keyMessage: s.keyMessage,
      })),
      autoPropagate: true,
    },
  };
}

/**
 * Hand off a systemic Operational Case (`#/cases/:id`) into a structured
 * Organizational Change (`#/changes`) when the 5-Whys / Swiss-Cheese guardrail
 * requires redesigning team boundaries, charter, or operating rituals.
 */
export function buildChangeFromCase(state, { caseId, now = new Date() } = {}) {
  const c = (state?.cases || []).find((x) => x.id === caseId);
  if (!c) return { ok: false, error: 'That operational case no longer exists.' };
  const todayStr = dayKey(now);
  return {
    ok: true,
    payload: {
      title: `Systemic redesign: ${c.title}`.slice(0, 180),
      kind: 'process',
      status: 'proposed',
      summary: c.rca?.problemStatement || c.summary || `Originated from operational case “${c.title}”.`,
      vision: c.rca?.systemicBarrier || c.rca?.preventiveAction || '',
      nonGoals: c.financial?.opportunityCost || '',
      reversibility: 'reversible',
      ownerId: c.ownerId || null,
      linkedGoalId: c.linkedGoalId || null,
      openedOn: todayStr,
      reviewOn: addDays(todayStr, state?.settings?.changeReviewDays ?? 21),
      kotterStage: 'urgency',
      completedSteps: ['urgency'],
      topology: {
        teamName: state?.settings?.teamName || '',
        currentType: 'stream-aligned',
        targetType: 'stream-aligned',
        interactionMode: 'x-as-a-service',
      },
      forces: [
        {
          side: 'driving',
          label: `Eliminate recurring failure mode: ${(c.fmea?.failureMode || c.title).slice(0, 160)}`,
          weight: Math.min(5, Math.max(3, Math.ceil((c.fmea?.severity || 6) / 2))),
          category: 'governance',
          mitigation: c.rca?.preventiveAction || '',
          mitigated: false,
        },
      ],
      coalition: (c.stakeholders || []).slice(0, 8).map((s) => ({
        name: s.name,
        role: s.role,
        power: s.power,
        interest: s.interest,
        stance: s.stance,
        vetoPlayer: Number(s.power) >= 5,
        keyMessage: s.keyMessage || '',
      })),
      impacts: (c.involvedPersonIds || []).slice(0, 6).map((pid) => ({
        personId: pid,
        impactKind: 'topology-interface',
        newRoleLabel: '',
        createTransitionPlan: false,
      })),
      effortDays: {
        optimistic: c.financial?.capacityDaysOptimistic || 0,
        mostLikely: c.financial?.capacityDaysMostLikely || 0,
        pessimistic: c.financial?.capacityDaysPessimistic || 0,
      },
      autoCreateDecision: true,
    },
  };
}

/**
 * RULE-SCN-01 — Scenario trade-off commitment & parallel cross-module propagation.
 *
 * Bridges non-persisted counterfactual scenario evaluation (`#/scenarios`) into
 * durable workspace governance:
 *  1. Wires typed `state.links` edges (`funds`, `mitigates`, `decides`) from the
 *     recorded DACI decision (`decisionId`) to every referenced portfolio item,
 *     operational case, organizational change, and requisition.
 *  2. When `commitLevers === true`, atomically applies the chosen counterfactual
 *     levers into the live workspace (`settings`, `portfolio`, `cases`, `changes`)
 *     and cascades downstream rules (`RULE-CAP-01`, `RULE-CAP-03`, `RULE-CAP-05`,
 *     `RULE-CHG-01..05`) in the same transaction.
 */
export function propagateScenarioCommitment(
  draft,
  {
    decisionId,
    scenarioSpec = {},
    commitLevers = false,
    now = new Date(),
    idFactory,
    logEvent = null,
  } = {},
) {
  const propagations = [];
  if (!draft || !decisionId) return propagations;
  const todayStr = dayKey(now);
  const nowIso = now.toISOString();
  const levers = scenarioSpec?.levers || {};

  const recordEdge = (targetType, targetId, relation, summary) => {
    const res = ensureEntityLink(
      draft,
      {
        sourceType: 'decision',
        sourceId: decisionId,
        targetType,
        targetId,
        relation,
        ruleId: 'RULE-SCN-01',
        summary,
      },
      { idFactory, todayStr, nowIso },
    );
    if (res.created) {
      const entry = {
        ruleId: 'RULE-SCN-01',
        targetType,
        targetId,
        action: 'linked',
        summary,
      };
      propagations.push(entry);
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: targetType,
          entityId: targetId,
          summary: `[RULE-SCN-01] ${summary}`,
        });
      }
    }
  };

  // 1. Settings adjustments (Double-Loop governing parameters)
  if (commitLevers && levers.settingsPatch && typeof levers.settingsPatch === 'object') {
    draft.settings = { ...(draft.settings || {}) };
    const sp = levers.settingsPatch;
    const applied = [];
    if (sp.operationalLoadPct !== undefined && sp.operationalLoadPct !== null) {
      const v = Math.min(80, Math.max(0, Math.round(Number(sp.operationalLoadPct))));
      if (Number.isFinite(v) && v !== draft.settings.operationalLoadPct) {
        draft.settings.operationalLoadPct = v;
        applied.push(`operationalLoadPct=${v}%`);
      }
    }
    if (sp.planningHorizonWeeks !== undefined && sp.planningHorizonWeeks !== null) {
      const v = Math.min(26, Math.max(1, Math.round(Number(sp.planningHorizonWeeks))));
      if (Number.isFinite(v) && v !== draft.settings.planningHorizonWeeks) {
        draft.settings.planningHorizonWeeks = v;
        applied.push(`planningHorizonWeeks=${v}w`);
      }
    }
    if (sp.capacityHoursPerWeek !== undefined && sp.capacityHoursPerWeek !== null) {
      const v = Math.min(60, Math.max(4, Math.round(Number(sp.capacityHoursPerWeek))));
      if (Number.isFinite(v) && v !== draft.settings.capacityHoursPerWeek) {
        draft.settings.capacityHoursPerWeek = v;
        applied.push(`capacityHoursPerWeek=${v}h`);
      }
    }
    if (sp.wipLimitPerPerson !== undefined && sp.wipLimitPerPerson !== null) {
      const v = Math.min(12, Math.max(1, Math.round(Number(sp.wipLimitPerPerson))));
      if (Number.isFinite(v) && v !== draft.settings.wipLimitPerPerson) {
        draft.settings.wipLimitPerPerson = v;
        applied.push(`wipLimitPerPerson=${v}`);
      }
    }
    if (applied.length) {
      const summary = `Updated operating parameters (${applied.join(', ')}) from scenario commitment`;
      propagations.push({
        ruleId: 'RULE-SCN-01',
        targetType: 'settings',
        targetId: 'settings',
        action: 'updated',
        summary,
      });
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'settings',
          entityId: 'settings',
          summary: `[RULE-SCN-01] ${summary}`,
        });
      }
    }
  }

  // 2. Portfolio funding, reassignment, and scope levers
  if (Array.isArray(levers.portfolioDecisions)) {
    draft.portfolio = Array.isArray(draft.portfolio) ? draft.portfolio : [];
    for (const pd of levers.portfolioDecisions) {
      if (!pd || !pd.itemId) continue;
      const item = draft.portfolio.find((i) => i && i.id === pd.itemId);
      if (!item) continue;

      recordEdge(
        'portfolio',
        item.id,
        'funds',
        `Scenario trade-off governs “${item.title.slice(0, 70)}”`,
      );

      if (commitLevers) {
        const prevDecision = item.decision;
        let touched = false;
        // Canonicalise at the commitment boundary: the sandbox projection
        // only ever evaluates PORTFOLIO_DECISIONS values, so anything else
        // arriving here (e.g. the legacy lever label 'wanted') must map to
        // its canonical equivalent rather than being written verbatim into
        // live state and silently diverging from what was evaluated.
        const nextDecision = pd.decision === 'wanted' ? 'undecided' : pd.decision;
        if (nextDecision && ['funded', 'deferred', 'cut', 'undecided'].includes(nextDecision) && nextDecision !== item.decision) {
          item.decision = nextDecision;
          item.decisionOn = todayStr;
          item.rationale = `Committed via scenario “${(scenarioSpec.name || 'Scenario').slice(0, 80)}”`;
          touched = true;
        }
        if (pd.ownerId !== undefined && (pd.ownerId || null) !== (item.ownerId || null)) {
          item.ownerId = pd.ownerId || null;
          touched = true;
        }
        if (pd.effortMultiplier !== undefined && Number.isFinite(Number(pd.effortMultiplier)) && Math.abs(Number(pd.effortMultiplier) - 1) > 1e-6 && item.effortDays) {
          const m = Math.min(3, Math.max(0.1, Number(pd.effortMultiplier)));
          item.effortDays = {
            optimistic: Math.round((Number(item.effortDays.optimistic) || 0) * m * 100) / 100,
            mostLikely: Math.round((Number(item.effortDays.mostLikely) || 0) * m * 100) / 100,
            pessimistic: Math.round((Number(item.effortDays.pessimistic) || 0) * m * 100) / 100,
          };
          touched = true;
        }
        if (touched) {
          item.updatedAt = nowIso;
          const summary = `Applied scenario lever to portfolio item “${item.title.slice(0, 60)}” (${item.decision})`;
          propagations.push({
            ruleId: 'RULE-SCN-01',
            targetType: 'portfolio',
            targetId: item.id,
            action: 'updated',
            summary,
          });
          if (logEvent) {
            logEvent({
              type: 'automation.propagated',
              entity: 'portfolio',
              entityId: item.id,
              summary: `[RULE-SCN-01] ${summary}`,
            });
          }
          if (item.decision !== prevDecision) {
            const cap03 = propagatePortfolioDecision(draft, item, {
              now,
              idFactory,
              logEvent,
              previousDecision: prevDecision,
            });
            propagations.push(...cap03);
          }
        }
      }
    }
  }

  // 3. Hypothetical items committed as real portfolio commitments
  if (commitLevers && Array.isArray(levers.hypotheticalItems)) {
    draft.portfolio = Array.isArray(draft.portfolio) ? draft.portfolio : [];
    for (const hyp of levers.hypotheticalItems) {
      if (!hyp || !String(hyp.title || '').trim()) continue;
      const opt = Math.max(0, Number(hyp.effortDays?.optimistic ?? hyp.optimistic ?? 3));
      const ml = Math.max(opt, Number(hyp.effortDays?.mostLikely ?? hyp.mostLikely ?? 5));
      const pess = Math.max(ml, Number(hyp.effortDays?.pessimistic ?? hyp.pessimistic ?? 9));
      const valExpected = Number(hyp.valueExpected ?? hyp.value?.mostLikely ?? 0);
      const createdItem = {
        id: idFactory('pf'),
        title: String(hyp.title).trim().slice(0, 140),
        kind: hyp.kind || 'project',
        status: 'open',
        decision: hyp.decision === 'wanted'
          ? 'undecided'
          : (hyp.decision && ['funded', 'deferred', 'cut', 'undecided'].includes(hyp.decision) ? hyp.decision : 'funded'),
        decisionOn: todayStr,
        rationale: `Committed from What-If scenario “${(scenarioSpec.name || 'Scenario').slice(0, 80)}”`,
        ownerId: hyp.ownerId || null,
        // 'decision' is not a portfolio source type; scenario provenance is
        // carried by the RULE-SCN-01 graph edge and the rationale, and a
        // non-canonical sourceType would be silently repaired on reload.
        sourceType: 'manual',
        sourceId: null,
        effortDays: { optimistic: opt, mostLikely: ml, pessimistic: pess },
        value: valExpected > 0
          ? { optimistic: Math.round(valExpected * 0.8), mostLikely: Math.round(valExpected), pessimistic: Math.round(valExpected * 1.2) }
          : { optimistic: 0, mostLikely: 0, pessimistic: 0 },
        currency: hyp.currency || 'USD',
        targetOn: hyp.targetOn || null,
        createdOn: todayStr,
        actualEffortDays: null,
        actualValue: null,
        forecastSnapshot: null,
        updatedAt: nowIso,
      };
      draft.portfolio.push(createdItem);
      // RULE-FCT-01: a hypothetical item committed as funded work gets the
      // same frozen forecast as any other funding commitment.
      const frozeHyp = freezePortfolioForecast(draft, createdItem, { now, todayStr, logEvent });
      if (frozeHyp) propagations.push(frozeHyp);
      recordEdge('portfolio', createdItem.id, 'funds', `Committed hypothetical scope “${createdItem.title.slice(0, 60)}”`);
      const summary = `Created portfolio commitment “${createdItem.title.slice(0, 60)}” (${ml}d most-likely)`;
      propagations.push({
        ruleId: 'RULE-SCN-01',
        targetType: 'portfolio',
        targetId: createdItem.id,
        action: 'created',
        summary,
      });
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'portfolio',
          entityId: createdItem.id,
          summary: `[RULE-SCN-01] ${summary}`,
        });
      }
    }
  }

  // 4. Operational Case mitigation levers
  if (Array.isArray(levers.caseMitigations)) {
    for (const rawEntry of levers.caseMitigations) {
      const caseId = typeof rawEntry === 'string' ? rawEntry : rawEntry?.caseId;
      if (!caseId) continue;
      const c = (draft.cases || []).find((x) => x && x.id === caseId);
      if (!c) continue;
      recordEdge('case', c.id, 'mitigates', `Scenario decision targets operational case “${c.title.slice(0, 60)}”`);

      if (commitLevers && !['resolved', 'closed'].includes(c.status)) {
        c.status = 'resolved';
        c.resolvedOn = todayStr;
        c.fmea = { ...(c.fmea || {}) };
        // Committing a scenario is not a human residual-risk assessment.
        c.updatedAt = nowIso;
        const summary = `Resolved operational case “${c.title.slice(0, 60)}” via scenario commitment`;
        propagations.push({
          ruleId: 'RULE-SCN-01',
          targetType: 'case',
          targetId: c.id,
          action: 'updated',
          summary,
        });
        if (logEvent) {
          logEvent({
            type: 'automation.propagated',
            entity: 'case',
            entityId: c.id,
            summary: `[RULE-SCN-01] ${summary}`,
          });
        }
        const resProps = propagateCaseResolution(draft, c, { now, idFactory, logEvent });
        propagations.push(...resProps);
      }
    }
  }

  // 5. Organizational Change & Coalition levers
  if (Array.isArray(levers.changeActions)) {
    for (const ca of levers.changeActions) {
      if (!ca || !ca.changeId) continue;
      const chg = (draft.changes || []).find((x) => x && x.id === ca.changeId);
      if (!chg) continue;
      recordEdge('change', chg.id, 'decides', `Scenario decision governs org change “${chg.title.slice(0, 60)}”`);

      if (commitLevers) {
        const action = ca.action || 'pause';
        let touched = false;
        if (action === 'pause' && chg.status !== 'paused') {
          chg.status = 'paused';
          touched = true;
        } else if (action === 'activate' && chg.status !== 'active') {
          chg.status = 'active';
          touched = true;
        } else if (action === 'align-coalition') {
          chg.coalition = (chg.coalition || []).map((m) => {
            if (m && (m.stance === 'blocker' || m.stance === 'skeptical' || (m.vetoPlayer && m.stance !== 'champion'))) {
              touched = true;
              return { ...m, stance: 'supportive' };
            }
            return m;
          });
        } else if (action === 'mitigate-barriers') {
          chg.forces = (chg.forces || []).map((f) => {
            if (f && f.side === 'restraining' && !f.mitigated) {
              touched = true;
              return { ...f, mitigated: true };
            }
            return f;
          });
        }
        if (touched) {
          chg.updatedAt = nowIso;
          const summary = `Applied scenario lever (${action}) on org change “${chg.title.slice(0, 60)}”`;
          propagations.push({
            ruleId: 'RULE-SCN-01',
            targetType: 'change',
            targetId: chg.id,
            action: 'updated',
            summary,
          });
          if (logEvent) {
            logEvent({
              type: 'automation.propagated',
              entity: 'change',
              entityId: chg.id,
              summary: `[RULE-SCN-01] ${summary}`,
            });
          }
          const chgProps = propagateChangeStatus(draft, chg, { now, idFactory, logEvent });
          propagations.push(...chgProps);
        }
      }
    }
  }

  // 6. Requisition hiring levers (linked via typed edge; actual candidate hires go through acceptOffer)
  if (Array.isArray(levers.hiringActions)) {
    for (const ha of levers.hiringActions) {
      if (!ha || !ha.reqId) continue;
      const req = (draft.requisitions || []).find((r) => r && r.id === ha.reqId);
      if (!req) continue;
      recordEdge(
        'requisition',
        req.id,
        'decides',
        `Scenario hiring plan references requisition “${req.title.slice(0, 60)}”`,
      );
    }
  }

  // 7. Vertical cascade: re-evaluate Monte Carlo tail risk (RULE-CAP-05) after committed plan shift
  if (commitLevers) {
    const mcEntries = evaluateMonteCarloTailRisk(draft, {
      now,
      idFactory,
      todayStr,
      nowIso,
      logEvent,
      triggerLabel: 'scenario commitment',
    });
    propagations.push(...mcEntries);
  }

  return propagations;
}

// ============================================================================
// Negotiation Workbench — RULE-NEG-01 / RULE-NEG-02 / RULE-NEG-03
// Fisher & Ury (1981) principled negotiation, Raiffa (1982) ZOPA, Lax &
// Sebenius (2006) value creation/claiming. Pure functions over the draft
// state: no DOM, storage or wall-clock access.
// ============================================================================

function hasNegotiationLinkToType(links, negotiationId, targetType, allowedRelations = null) {
  return (links || []).some(
    (l) =>
      l.sourceType === 'negotiation' &&
      l.sourceId === negotiationId &&
      l.targetType === targetType &&
      (!allowedRelations || allowedRelations.includes(l.relation)),
  );
}

function negotiationPromptText(record) {
  const title = (record.title || '').trim();
  return `Negotiation prep (${title.slice(0, 32)}; ref ${record.id}): confirm our BATNA and reservation prices, map the counterparty's interests and estimated reservation point with a confidence label, and rehearse objective criteria before the next session.`;
}

/**
 * RULE-NEG-01 — provenance edges, high-stakes DACI mandate decision, and an
 * owner 1:1 prep topic. Idempotent: repeated saves update the managed topic
 * but never duplicate decisions, links or talking points.
 */
export function propagateNegotiationEvent(draft, record, { now = new Date(), idFactory, logEvent = null, options = {} } = {}) {
  const propagations = [];
  if (!record || record.autoPropagate === false) return propagations;
  if (!isNegotiationOpen(record)) return propagations;

  const todayStr = dayKey(now);
  const nowIso = now.toISOString();
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.people = Array.isArray(draft.people) ? draft.people : [];

  // 1. Provenance: typed edge back to the originating operational record.
  if (
    record.sourceType &&
    record.sourceId &&
    LINK_ENTITY_TYPES.includes(record.sourceType) &&
    !FORBIDDEN_LINK_TYPES.includes(record.sourceType)
  ) {
    const res = ensureEntityLink(
      draft,
      {
        sourceType: 'negotiation',
        sourceId: record.id,
        targetType: record.sourceType,
        targetId: record.sourceId,
        relation: 'negotiates',
        ruleId: 'RULE-NEG-01',
        summary: `Negotiation workstream for ${record.sourceType}`,
      },
      { idFactory, todayStr, nowIso },
    );
    if (res.created) {
      propagations.push({
        ruleId: 'RULE-NEG-01',
        targetType: record.sourceType,
        targetId: record.sourceId,
        action: 'linked',
        summary: `Linked negotiation to its originating ${record.sourceType}`,
      });
    }
  }

  // 2. Impacted goal edge (telemetry check-in happens at agreement time).
  if (record.linkedGoalId) {
    const goal = (draft.goals || []).find((g) => g.id === record.linkedGoalId);
    if (goal) {
      ensureEntityLink(
        draft,
        {
          sourceType: 'negotiation',
          sourceId: record.id,
          targetType: 'goal',
          targetId: goal.id,
          relation: 'impacts-goal',
          ruleId: 'RULE-NEG-01',
          summary: `Negotiation impacts goal ${goal.title}`,
        },
        { idFactory, todayStr, nowIso },
      );
    }
  }

  const summary = summarizeNegotiation(record, draft, now);

  // 3. High-stakes mandate decision: pursue agreement vs execute the BATNA.
  if (summary.highStakes && !hasNegotiationLinkToType(draft.links, record.id, 'decision', ['decides'])) {
    const zopaText = summary.zopaCoveragePct === null
      ? 'No reservation prices recorded yet, so no ZOPA can be computed.'
      : `Weighted ZOPA coverage across issues: ${summary.zopaCoveragePct}%.`;
    const gapText = summary.primaryGap
      ? ` Highest-weight reservation gap: “${summary.primaryGap.name}” (${summary.primaryGap.gap} ${summary.primaryGap.unit || ''}).`
      : '';
    const batnaText = record.ourBatnaDescription || 'No BATNA recorded yet — define the walk-away course before choosing it.';
    const stakesLine = record.stakesValue !== null
      ? `Recorded deal value ${record.stakesCurrency} ${record.stakesValue.toLocaleString('en-US')}. `
      : '';

    const decision = {
      id: idFactory('dec'),
      title: `Negotiation mandate: ${record.title}`.slice(0, 180),
      question:
        `Negotiation (${record.kind}) with ${record.counterparty || 'an unrecorded counterparty'}. ${stakesLine}${zopaText}${gapText} Prep completeness ${summary.prep.completenessPct}% (Fisher & Ury/BATNA, Raiffa ZOPA).`.slice(0, 2000),
      date: record.openedOn || todayStr,
      reversibility: record.strategic ? 'irreversible' : 'reversible',
      driver: (draft.people.find((p) => p.id === record.ownerId)?.name || '').slice(0, 120),
      approver: '',
      contributors: '',
      informed: '',
      options: [
        {
          id: idFactory('dopt'),
          label: 'Pursue a negotiated agreement within the recorded reservation prices',
          pros: zopaText,
          cons: 'Conceding value inside the ZOPA; requires disciplined objective criteria at the table.',
        },
        {
          id: idFactory('dopt'),
          label: 'Walk away and execute the BATNA',
          pros: batnaText.slice(0, 600),
          cons: 'Foregoes the recorded deal value and the relationship outcome; only rational if no package beats the BATNA.',
        },
      ],
      chosen: '',
      rationale: '',
      reviewOn: record.reviewOn || addDays(todayStr, draft.settings?.negotiationReviewDays ?? 14),
      reviewedOn: null,
      outcome: 'pending',
      outcomeNotes: '',
      createdAt: nowIso,
    };
    draft.decisions.push(decision);
    ensureEntityLink(
      draft,
      {
        sourceType: 'negotiation',
        sourceId: record.id,
        targetType: 'decision',
        targetId: decision.id,
        relation: 'decides',
        ruleId: 'RULE-NEG-01',
        summary: `DACI mandate decision created for ${record.title}`,
      },
      { idFactory, todayStr, nowIso },
    );
    propagations.push({
      ruleId: 'RULE-NEG-01',
      targetType: 'decision',
      targetId: decision.id,
      action: 'created',
      summary: `Auto-created DACI mandate decision “${decision.title.slice(0, 70)}”`,
    });
    if (logEvent) {
      logEvent({
        type: 'automation.propagated',
        entity: 'decision',
        entityId: decision.id,
        summary: `[RULE-NEG-01] ${decision.title.slice(0, 120)}`,
      });
    }
  }

  // 4. Blameless owner prep topic for the next 1:1.
  if (record.ownerId) {
    const person = draft.people.find((p) => p.id === record.ownerId && p.status === 'active');
    if (person) {
      ensureEntityLink(
        draft,
        {
          sourceType: 'negotiation',
          sourceId: record.id,
          targetType: 'person',
          targetId: person.id,
          relation: 'coaches',
          ruleId: 'RULE-NEG-01',
          summary: `Negotiation prep & air-cover for ${person.name}`,
        },
        { idFactory, todayStr, nowIso },
      );

      const promptText = negotiationPromptText(record);
      const promptMarker = `; ref ${record.id})`;
      person.talkingPoints = Array.isArray(person.talkingPoints) ? person.talkingPoints : [];
      const managedIndex = person.talkingPoints.findIndex(
        (tp) => String(tp).startsWith('Negotiation prep (') && String(tp).includes(promptMarker),
      );
      if (managedIndex >= 0 && person.talkingPoints[managedIndex] !== promptText) {
        person.talkingPoints[managedIndex] = promptText;
        propagations.push({
          ruleId: 'RULE-NEG-01',
          targetType: 'person',
          targetId: person.id,
          action: 'refreshed',
          summary: `Refreshed negotiation prep topic for ${person.name}`,
        });
      } else if (managedIndex < 0 && !person.talkingPoints.some((tp) => String(tp) === promptText) && person.talkingPoints.length < 12) {
        person.talkingPoints.push(promptText);
        propagations.push({
          ruleId: 'RULE-NEG-01',
          targetType: 'person',
          targetId: person.id,
          action: 'updated',
          summary: `Queued negotiation prep topic for ${person.name}`,
        });
        if (logEvent) {
          logEvent({
            type: 'automation.propagated',
            entity: 'person',
            entityId: person.id,
            summary: `[RULE-NEG-01] Negotiation prep topic queued for ${person.name}`,
          });
        }
      }
    }
  }

  // RULE-STK-01/02: reconcile the counterparty to the register and evaluate
  // any recorded veto gate on this negotiation.
  propagations.push(
    ...reconcileStakeholderInvolvement(draft, 'negotiation', record.id, { now, idFactory, logEvent }),
  );
  propagations.push(
    ...evaluateStakeholderVetoDecision(draft, 'negotiation', record.id, { now, idFactory, logEvent }),
  );

  return propagations;
}

/**
 * RULE-NEG-02 — agreement closeout. Terms with owners become tracked
 * delegations; ownerless terms are reported as gaps (the app never invents an
 * owner); the mandate decision joins the outcome-review queue; linked goals
 * receive one explainable telemetry check-in.
 */
export function propagateNegotiationAgreement(draft, record, { now = new Date(), idFactory, logEvent = null } = {}) {
  const propagations = [];
  if (!record) return propagations;

  const todayStr = dayKey(now);
  const nowIso = now.toISOString();
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.people = Array.isArray(draft.people) ? draft.people : [];

  const terms = Array.isArray(record.agreedTerms) ? record.agreedTerms : [];

  // 1. Agreed terms -> accountable delegations or explicit ownership gaps.
  for (const term of terms) {
    const person = term.ownerId
      ? draft.people.find((p) => p.id === term.ownerId && p.status === 'active')
      : null;
    if (!person) {
      propagations.push({
        ruleId: 'RULE-NEG-02',
        targetType: 'negotiation',
        targetId: record.id,
        action: 'ownership-gap',
        summary: `Agreed term has no active owner: ${(term.text || '').slice(0, 90)}`,
      });
      continue;
    }
    const termDelegations = draft.delegations.filter(
      (d) => d.sourceNegotiationId === record.id && d.sourceTermId === term.id,
    );
    const activeOrDone = termDelegations.find((d) => !d.supersededByDelegationId && d.status !== 'returned');
    if (activeOrDone) continue;
    const unrecoveredReturned = termDelegations.find((d) => !d.supersededByDelegationId && d.status === 'returned');
    if (unrecoveredReturned && unrecoveredReturned.personId === person.id) {
      // Same owner as the returned delegation: do not silently re-open or
      // re-delegate without an explicit recovery action and countermeasure.
      continue;
    }

    const delegation = {
      id: idFactory('delegation'),
      personId: person.id,
      title: `Negotiated commitment: ${(term.text || record.title).slice(0, 120)}`,
      expectedOutcome: (term.text || '').slice(0, 600),
      authority: 'act-inform',
      support: `Leader air-cover on the agreement reached in “${record.title}” (${record.closedOn || todayStr}).`,
      delegatedOn: record.closedOn && record.closedOn <= todayStr ? record.closedOn : todayStr,
      dueOn: term.dueOn || record.reviewOn || null,
      status: 'active',
      checkins: [],
      completedOn: null,
      completionNote: '',
      returnedOn: null,
      returnReason: '',
      sourceNegotiationId: record.id,
      sourceTermId: term.id,
      priorDelegationId: unrecoveredReturned ? unrecoveredReturned.id : null,
      supersededByDelegationId: null,
      recoveredOn: null,
      recoveryNote: unrecoveredReturned ? `Re-assigned to ${person.name} in agreement update.` : '',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    draft.delegations.push(delegation);
    if (unrecoveredReturned) {
      propagations.push(
        ...propagateReturnedDelegationRecovery(draft, unrecoveredReturned, delegation, {
          now,
          idFactory,
          logEvent,
        }),
      );
      continue;
    }
    ensureEntityLink(
      draft,
      {
        sourceType: 'negotiation',
        sourceId: record.id,
        targetType: 'delegation',
        targetId: delegation.id,
        relation: 'tracks-followup',
        ruleId: 'RULE-NEG-02',
        summary: `Agreed term delegated to ${person.name}`,
      },
      { idFactory, todayStr, nowIso },
    );
    propagations.push({
      ruleId: 'RULE-NEG-02',
      targetType: 'delegation',
      targetId: delegation.id,
      action: 'created',
      summary: `Created commitment delegation for ${person.name}`,
    });
    if (logEvent) {
      logEvent({
        type: 'automation.propagated',
        entity: 'delegation',
        entityId: delegation.id,
        summary: `[RULE-NEG-02] Negotiated commitment delegated to ${person.name}: “${delegation.title.slice(0, 60)}”`,
      });
    }
  }

  // 2. Mandate decision -> chosen option, then the normal outcome-review queue.
  const mandateLink = draft.links.find(
    (l) =>
      l.sourceType === 'negotiation' &&
      l.sourceId === record.id &&
      l.targetType === 'decision' &&
      l.relation === 'decides',
  );
  if (mandateLink) {
    const decision = draft.decisions.find((d) => d.id === mandateLink.targetId);
    if (decision && !decision.chosen) {
      const chosenLabel = 'Record negotiated agreement and execute its commitments';
      if (!decision.options.some((o) => o.label === chosenLabel)) {
        decision.options.push({
          id: idFactory('dopt'),
          label: chosenLabel,
          pros: `${terms.length} agreed term(s) recorded on ${record.closedOn || todayStr}`,
          cons: 'Execution risk now carried through tracked commitment delegations',
        });
      }
      decision.chosen = chosenLabel;
      decision.rationale = `Agreement reached on ${record.closedOn || todayStr}. ${record.outcomeNotes || ''}`.slice(0, 2000);
      if (!decision.reviewOn) {
        decision.reviewOn = addDays(todayStr, draft.settings?.decisionReviewDays ?? 14);
      }
      propagations.push({
        ruleId: 'RULE-NEG-02',
        targetType: 'decision',
        targetId: decision.id,
        action: 'updated',
        summary: 'Mandate decision recorded as agreed and placed on the outcome-review queue',
      });
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'decision',
          entityId: decision.id,
          summary: `[RULE-NEG-02] Mandate decision for “${record.title.slice(0, 60)}” closed onto review queue`,
        });
      }
    }
  }

  // 3. Linked goal: one neutral telemetry check-in (no confidence rewrite —
  // an agreement is evidence of movement, not a measurement of the goal).
  if (record.linkedGoalId) {
    const goal = (draft.goals || []).find((g) => g.id === record.linkedGoalId && g.status === 'active');
    const tag = `[Negotiation ${record.id}]`;
    if (goal && !(goal.checkins || []).some((c) => String(c.note || '').includes(tag))) {
      goal.checkins = Array.isArray(goal.checkins) ? goal.checkins : [];
      goal.checkins.push({
        id: idFactory('chk'),
        date: todayStr,
        confidence: goal.confidence,
        progressPct: null,
        keyResults: null,
        note: `${tag} Negotiation “${record.title.slice(0, 60)}” reached agreement with ${record.counterparty || 'counterparty'} (${terms.length} term${terms.length === 1 ? '' : 's'}).`,
      });
      propagations.push({
        ruleId: 'RULE-NEG-02',
        targetType: 'goal',
        targetId: goal.id,
        action: 'updated',
        summary: `Logged agreement check-in on goal “${goal.title.slice(0, 50)}”`,
      });
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'goal',
          entityId: goal.id,
          summary: `[RULE-NEG-02] Agreement telemetry logged on goal ${goal.title.slice(0, 60)}`,
        });
      }
    }
  }

  return propagations;
}

/**
 * RULE-NEG-03 — pure builder for the operational case an impasse raises.
 * Mirrors buildCaseFromRestrainingForce: returns an addCase-shaped payload;
 * the action layer runs it through the normal case fan-out, so FMEA, DACI,
 * delegation, capacity and coaching rules all apply without duplicated logic.
 */
export function buildCaseFromNegotiationImpasse(state, { negotiationId, now = new Date() } = {}) {
  const record = (state?.negotiations || []).find((n) => n.id === negotiationId);
  if (!record) return { ok: false, error: 'That negotiation no longer exists.' };
  if (record.status !== 'impasse') {
    return { ok: false, error: 'Only a negotiation at impasse can be escalated into an operational case.' };
  }
  const summary = summarizeNegotiation(record, state, now);
  const todayStr = dayKey(now);

  const gapText = summary.primaryGap
    ? ` Reservation gap on “${summary.primaryGap.name}”: ${summary.primaryGap.gap} ${summary.primaryGap.unit || ''} — no ZOPA at the recorded estimates.`
    : '';
  const stakesText = record.stakesValue !== null
    ? ` Recorded deal value: ${record.stakesCurrency} ${record.stakesValue.toLocaleString('en-US')}.`
    : '';
  const batnaLine = record.ourBatnaDescription
    ? ` BATNA: ${record.ourBatnaDescription}`
    : ' No BATNA recorded — defining the walk-away course is the first escalation task.';

  return {
    ok: true,
    payload: {
      kind: 'escalation',
      status: 'open',
      title: `Negotiation impasse: ${record.title}`.slice(0, 180),
      summary:
        `Escalated from negotiation “${record.title}” with counterparty ${record.counterparty || 'unrecorded'}.${gapText}${stakesText}${batnaLine}`.slice(0, 4000),
      ownerId: record.ownerId || null,
      involvedPersonIds: [],
      linkedGoalId: record.linkedGoalId || null,
      openedOn: todayStr,
      reviewOn: addDays(todayStr, state?.settings?.caseReviewDays ?? 14),
      fmea: {
        severity: summary.highStakes ? 8 : 6,
        probability: 6,
        detectability: 5,
        failureMode: `Impasse in “${record.title}”`,
        effect: `Blocked ${record.kind} negotiation with ${record.counterparty || 'the counterparty'}`,
        controls: record.ourBatnaDescription || 'No BATNA control recorded',
      },
      financial: {},
      rca: {
        problemStatement: (
          record.notes ||
          `Negotiation “${record.title}” reached impasse; reservation prices do not overlap at current estimates.`
        ).slice(0, 1000),
        whys: [],
        rootCause: '',
        systemicBarrier: '',
        preventiveAction: record.ourBatnaDescription || '',
      },
      stakeholders: [],
      autoPropagate: true,
    },
  };
}

/** Build a throwaway record for dry-run previews without touching the state. */
function assemblePreviewNegotiation(input, fallbackId) {
  const issues = (Array.isArray(input.issues) ? input.issues : []).map((issue, index) =>
    normalizeIssueInput(issue, index),
  );
  const lists = normalizeStringLists(input);
  const stakesNum = Number(input.stakesValue);
  return {
    id: input.id || fallbackId,
    title: String(input.title || 'Untitled negotiation'),
    kind: input.kind || 'other',
    status: input.status || 'preparing',
    counterparty: String(input.counterparty || ''),
    ownerId: input.ownerId || null,
    linkedGoalId: input.linkedGoalId || null,
    sourceType: input.sourceType || null,
    sourceId: input.sourceId || null,
    openedOn: input.openedOn || null,
    nextSessionOn: input.nextSessionOn || null,
    reviewOn: input.reviewOn || null,
    closedOn: input.closedOn || null,
    strategic: Boolean(input.strategic),
    stakesValue: Number.isFinite(stakesNum) && stakesNum >= 0 ? stakesNum : null,
    stakesCurrency: input.stakesCurrency || 'USD',
    ourBatnaDescription: String(input.ourBatnaDescription || ''),
    ourBatnaValue: Number.isFinite(Number(input.ourBatnaValue)) ? Number(input.ourBatnaValue) : null,
    ourBatnaUnit: String(input.ourBatnaUnit || ''),
    issues,
    ...lists,
    agreedTerms: Array.isArray(input.agreedTerms) ? input.agreedTerms : [],
    autoPropagate: input.autoPropagate !== false,
  };
}

/**
 * Dry-run of the negotiation rules, mirroring previewCasePropagations. Pure:
 * the dialog renders this before any write. Existing links/topics are checked
 * so the preview matches the idempotent behaviour of the real transaction.
 */
export function previewNegotiationPropagations(input = {}, state = {}, { now = new Date(), existingNegotiationId = null } = {}) {
  const previews = [];
  if (input.autoPropagate === false) return previews;
  const record = assemblePreviewNegotiation(input, existingNegotiationId || 'neg-preview');
  const summary = summarizeNegotiation(record, state, now);
  const links = state.links || [];
  const existingId = existingNegotiationId || record.id;

  if (record.sourceType && record.sourceId) {
    previews.push({
      ruleId: 'RULE-NEG-01',
      targetModule: 'relationship graph',
      summary: `Link to originating ${record.sourceType}`,
      detail: 'A typed provenance edge connects this negotiation to the record it came from.',
    });
  }
  if (record.linkedGoalId) {
    previews.push({
      ruleId: 'RULE-NEG-01',
      targetModule: 'goals',
      summary: 'Link the impacted goal',
      detail: 'Agreement will later log an explainable telemetry check-in on the goal.',
    });
  }
  const alreadyMandated = hasNegotiationLinkToType(links, existingId, 'decision', ['decides']);
  if (summary.highStakes && !alreadyMandated) {
    previews.push({
      ruleId: 'RULE-NEG-01',
      targetModule: 'decisions',
      summary: 'Create DACI mandate decision (pursue agreement vs execute BATNA)',
      detail:
        record.stakesValue !== null
          ? `Recorded deal value ${record.stakesCurrency} ${record.stakesValue.toLocaleString('en-US')} meets the ${HIGH_STAKES_THRESHOLD.toLocaleString('en-US')} high-stakes convention${record.strategic ? ' (also marked strategic)' : ''}.`
          : 'Marked strategic: the mandate trade-off deserves an explicit, reviewable decision.',
    });
  }
  if (record.ownerId) {
    const owner = (state.people || []).find((p) => p.id === record.ownerId && p.status === 'active');
    const alreadyQueued = owner
      ? (owner.talkingPoints || []).some((tp) => String(tp).includes(`; ref ${existingId})`))
      : false;
    if (owner && !alreadyQueued && isNegotiationOpen(record)) {
      previews.push({
        ruleId: 'RULE-NEG-01',
        targetModule: '1:1 prep',
        summary: `Queue a BATNA/ZOPA prep topic for ${owner.name}`,
        detail: 'A marked, blameless talking point appears on the next prep sheet; ratings are never touched.',
      });
    }
  }
  if (record.status === 'agreed' || (Array.isArray(record.agreedTerms) && record.agreedTerms.length)) {
    const owned = (record.agreedTerms || []).filter((t) => t && t.ownerId).length;
    const unowned = (record.agreedTerms || []).length - owned;
    if (owned > 0) {
      previews.push({
        ruleId: 'RULE-NEG-02',
        targetModule: 'delegations',
        summary: `Create ${owned} commitment delegation${owned === 1 ? '' : 's'} from agreed terms`,
        detail: 'Each owned term becomes an accountable delegation with its due date and a typed follow-up link.',
      });
    }
    if (unowned > 0) {
      previews.push({
        ruleId: 'RULE-NEG-02',
        targetModule: 'negotiations',
        summary: `${unowned} agreed term${unowned === 1 ? '' : 's'} still need an owner`,
        detail: 'Ownerless terms are surfaced as gaps; LeadOS never assigns ownership itself.',
      });
    }
  }
  if (record.status === 'impasse') {
    const openCaseLink = links.find((l) => {
      if (l.sourceType !== 'case' || l.targetType !== 'negotiation' || l.targetId !== existingId) return false;
      const linkedCase = (state.cases || []).find((c) => c.id === l.sourceId);
      return Boolean(linkedCase && isCaseOpen(linkedCase));
    });
    if (!openCaseLink) {
      previews.push({
        ruleId: 'RULE-NEG-03',
        targetModule: 'cases',
        summary: 'Raise an operational escalation case',
        detail: 'The impasse inherits FMEA priority, DACI governance, delegation, capacity and coaching through the standard case fan-out.',
      });
    }
  }
  return previews;
}

/** RULE-NEG-04: reverse feedback, transaction-local and replay-safe. */
export function propagateNegotiationDelivery(draft, delegation, { now = new Date(), idFactory, logEvent } = {}) {
  const record = (draft.negotiations || []).find((n) => n.id === delegation?.sourceNegotiationId);
  if (!record || record.autoPropagate === false || !['done', 'returned'].includes(delegation.status)
    || !(record.agreedTerms || []).some((t) => t.id === delegation.sourceTermId)) return [];
  const marker = `[Delivery ${delegation.id}:${delegation.status}]`;
  if ((draft.events || []).some((e) => e.entityId === record.id && String(e.summary).includes(marker))) return [];
  const summary = `${marker} ${delegation.status === 'done' ? 'Delivered' : 'Returned to leader'}: ${delegation.title.slice(0, 120)}`;
  const results = [{ ruleId: 'RULE-NEG-04', targetType: 'negotiation', targetId: record.id, action: 'updated', summary }];
  if (logEvent) logEvent({ type: 'negotiation.delivery', entity: 'negotiation', entityId: record.id, summary });
  const goal = (draft.goals || []).find((g) => g.id === record.linkedGoalId && g.status === 'active');
  if (goal && !(goal.checkins || []).some((c) => String(c.note).includes(marker))) {
    goal.checkins = goal.checkins || [];
    goal.checkins.push({ id: idFactory('chk'), date: dayKey(now), confidence: goal.confidence,
      progressPct: null, keyResults: null, note: `${summary}. Negotiation: ${record.title.slice(0, 120)}. Delivery evidence is not a measured goal result.` });
    results.push({ ruleId: 'RULE-NEG-04', targetType: 'goal', targetId: goal.id, action: 'updated', summary });
    if (logEvent) logEvent({ type: 'automation.propagated', entity: 'goal', targetId: goal.id, entityId: goal.id, summary: `[RULE-NEG-04] ${summary}` });
  }
  return results;
}

/**
 * RULE-NEG-05 — Returned-commitment recovery & lineage cascade.
 *
 * Keeps `oldDelegation` immutable in history (`status: 'returned'`), links it
 * forward via `supersededByDelegationId` & `recoveredOn`, links `newDelegation`
 * backward via `priorDelegationId`, updates the originating negotiation term's
 * `ownerId`, `dueOn` and `priorOwners` lineage (when sourced from a negotiation),
 * preserves upstream case/negotiation graph links, and queues a 1:1 handover
 * coaching topic for the new owner carrying the prior return reason and
 * countermeasure.
 */
export function propagateReturnedDelegationRecovery(
  draft,
  oldDelegation,
  newDelegation,
  { now = new Date(), idFactory, logEvent } = {},
) {
  if (!draft || !oldDelegation || !newDelegation) return [];
  const todayStr = newDelegation.delegatedOn || dayKey(now);
  const nowIso = now.toISOString();
  const propagations = [];

  oldDelegation.supersededByDelegationId = newDelegation.id;
  oldDelegation.recoveredOn = todayStr;
  oldDelegation.updatedAt = nowIso;
  newDelegation.priorDelegationId = oldDelegation.id;

  const priorOwner = (draft.people || []).find((p) => p.id === oldDelegation.personId) || null;
  const newOwner = (draft.people || []).find((p) => p.id === newDelegation.personId) || null;
  const priorName = priorOwner?.name || 'prior owner';
  const newName = newOwner?.name || 'new owner';

  propagations.push({
    ruleId: 'RULE-NEG-05',
    targetType: 'delegation',
    targetId: newDelegation.id,
    action: 'created',
    summary: `Recovered returned delegation (${priorName} → ${newName}) preserving lineage`,
  });

  // 1. Copy upstream case mitigation links so case -> delegation traceability survives handoff.
  const upstreamCaseLinks = (draft.links || []).filter(
    (l) => l && l.sourceType === 'case' && l.targetType === 'delegation' && l.targetId === oldDelegation.id,
  );
  for (const link of upstreamCaseLinks) {
    ensureEntityLink(
      draft,
      {
        sourceType: 'case',
        sourceId: link.sourceId,
        targetType: 'delegation',
        targetId: newDelegation.id,
        relation: link.relation || 'mitigates',
        ruleId: 'RULE-NEG-05',
        summary: `Recovered mitigation delegation assigned to ${newName}`,
      },
      { idFactory, todayStr, nowIso },
    );
  }

  // 2. If sourced from an agreed negotiation term, update term ownership, due date,
  // and append prior owner to term.priorOwners while preserving history.
  if (oldDelegation.sourceNegotiationId) {
    const negotiation = (draft.negotiations || []).find((n) => n.id === oldDelegation.sourceNegotiationId);
    if (negotiation) {
      const term = (negotiation.agreedTerms || []).find((t) => t.id === oldDelegation.sourceTermId);
      if (term) {
        term.priorOwners = Array.isArray(term.priorOwners) ? term.priorOwners : [];
        if (!term.priorOwners.some((po) => po && po.delegationId === oldDelegation.id)) {
          term.priorOwners.push({
            ownerId: oldDelegation.personId || null,
            delegationId: oldDelegation.id,
            returnedOn: oldDelegation.returnedOn || todayStr,
            returnReason: (oldDelegation.returnReason || '').slice(0, 600),
            recoveredOn: todayStr,
          });
        }
        term.ownerId = newDelegation.personId;
        if (newDelegation.dueOn) term.dueOn = newDelegation.dueOn;
      }
      const noteLine = `[Recovered ${todayStr}] Term “${(term?.text || newDelegation.title).slice(0, 80)}” re-delegated from ${priorName} to ${newName}${newDelegation.recoveryNote ? ` (${newDelegation.recoveryNote.slice(0, 120)})` : ''}.`;
      if (!String(negotiation.outcomeNotes || '').includes(`[Recovered ${todayStr}]`) || !String(negotiation.outcomeNotes || '').includes(newDelegation.id)) {
        negotiation.outcomeNotes = [negotiation.outcomeNotes, noteLine].filter(Boolean).join('\n').slice(0, 4000);
      }
      negotiation.updatedAt = nowIso;

      ensureEntityLink(
        draft,
        {
          sourceType: 'negotiation',
          sourceId: negotiation.id,
          targetType: 'delegation',
          targetId: newDelegation.id,
          relation: 'tracks-followup',
          ruleId: 'RULE-NEG-05',
          summary: `Recovered term commitment delegated to ${newName}`,
        },
        { idFactory, todayStr, nowIso },
      );

      propagations.push({
        ruleId: 'RULE-NEG-05',
        targetType: 'negotiation',
        targetId: negotiation.id,
        action: 'updated',
        summary: `Updated agreement term lineage (${priorName} → ${newName}) on “${negotiation.title.slice(0, 50)}”`,
      });
    }
  }

  // 3. Queue a blameless 1:1 handover topic on the new owner so the prior return
  // reason and countermeasure are discussed before execution restarts.
  if (newOwner && newOwner.status === 'active') {
    newOwner.talkingPoints = Array.isArray(newOwner.talkingPoints) ? newOwner.talkingPoints : [];
    const refTag = `; ref ${newDelegation.id})`;
    const alreadyQueued = newOwner.talkingPoints.some((tp) => String(tp).includes(refTag));
    if (!alreadyQueued && newOwner.talkingPoints.length < 12) {
      const reasonSnippet = (oldDelegation.returnReason || 'returned to leader').slice(0, 80);
      const fixSnippet = (newDelegation.recoveryNote || newDelegation.support || 'updated support boundary').slice(0, 80);
      const topic = `Delegation recovery (${newDelegation.title.slice(0, 48)}${refTag}: previously returned by ${priorName} (${reasonSnippet}) — confirm countermeasure & authority (${fixSnippet})`;
      newOwner.talkingPoints.push(topic);
      propagations.push({
        ruleId: 'RULE-NEG-05',
        targetType: 'person',
        targetId: newOwner.id,
        action: 'updated',
        summary: `Queued 1:1 handover topic for ${newName} with prior return context`,
      });
    }
  }

  if (logEvent) {
    logEvent({
      type: 'automation.propagated',
      entity: 'delegation',
      entityId: newDelegation.id,
      summary: `[RULE-NEG-05] Recovered returned commitment “${newDelegation.title.slice(0, 60)}” (${priorName} → ${newName})`,
    });
  }

  return propagations;
}

/**
 * RULE-NEG-06 — Post-agreement settlement & implementation-shortfall governance.
 *
 * Evaluates ex-post settlement actuals against the signed agreement and walk-away
 * BATNA (Williamson 1985; Hart & Moore 1988; Perold 1988; Raiffa 1982). Logs an
 * idempotent settlement check-in on any linked goal and opens/updates a linked
 * DACI review decision when the settlement breaches the BATNA, experiences
 * counterparty non-delivery, or suffers material implementation shortfall.
 */
export function propagateNegotiationSettlement(
  draft,
  record,
  { now = new Date(), idFactory, logEvent } = {},
) {
  if (!draft || !record || record.autoPropagate === false || record.status !== 'agreed') return [];
  const evaluation = evaluateNegotiationSettlement(record);
  if (!evaluation.settled) return [];

  const todayStr = evaluation.settledOn || dayKey(now);
  const nowIso = now.toISOString();
  const propagations = [];

  // 1. Linked goal telemetry check-in (idempotent per settlement state/date).
  if (record.linkedGoalId) {
    const goal = (draft.goals || []).find((g) => g.id === record.linkedGoalId && g.status === 'active');
    const marker = `[RULE-NEG-06:${record.id}:${todayStr}:${evaluation.status}]`;
    if (goal && !(goal.checkins || []).some((c) => String(c.note || '').includes(marker))) {
      goal.checkins = Array.isArray(goal.checkins) ? goal.checkins : [];
      if (evaluation.adverseGovernanceTrigger && goal.confidence === 'on-track') {
        goal.confidence = 'at-risk';
      }
      const valuePhrase = evaluation.realisedValue !== null
        ? `realised ${evaluation.stakesCurrency} ${evaluation.realisedValue.toLocaleString('en-US')}${evaluation.stakesValue !== null ? ` vs ${evaluation.stakesValue.toLocaleString('en-US')} agreed` : ''}`
        : `${evaluation.scoredTermCount} quantitative term(s) settled`;
      const breachPhrase = evaluation.batnaBreached
        ? ' — walk-away BATNA breached'
        : evaluation.counterpartyBreach
          ? ' — counterparty delivery shortfall'
          : evaluation.shortfallPct > 0
            ? ` — ${evaluation.shortfallPct}% implementation shortfall`
            : ' — settled on agreed terms';
      goal.checkins.push({
        id: idFactory('chk'),
        date: todayStr,
        confidence: goal.confidence,
        progressPct: null,
        keyResults: null,
        note: `${marker} Agreement settlement on “${record.title.slice(0, 60)}”: ${valuePhrase}${breachPhrase}.`,
      });
      propagations.push({
        ruleId: 'RULE-NEG-06',
        targetType: 'goal',
        targetId: goal.id,
        action: 'updated',
        summary: `Logged settlement check-in on goal “${goal.title.slice(0, 50)}” (${evaluation.status})`,
      });
    }
  }

  // 2. Adverse settlement or BATNA breach -> open or update a linked DACI governance decision.
  if (evaluation.adverseGovernanceTrigger) {
    draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
    const titlePrefix = `Settlement review: ${record.title}`.slice(0, 180);
    let decision = draft.decisions.find(
      (d) =>
        d.title === titlePrefix ||
        (draft.links || []).some(
          (l) =>
            l.sourceType === 'negotiation' &&
            l.sourceId === record.id &&
            l.targetType === 'decision' &&
            l.targetId === d.id &&
            l.ruleId === 'RULE-NEG-06',
        ),
    );
    const owner = (draft.people || []).find((p) => p.id === record.ownerId) || null;
    const reasonDetail = evaluation.batnaBreached
      ? `Realised outcome breached the walk-away BATNA (${evaluation.batnaValue} ${evaluation.batnaUnit}).`
      : evaluation.counterpartyBreach
        ? `Counterparty ${record.counterparty || ''} did not deliver the agreed terms.`
        : `Implementation shortfall of ${evaluation.shortfallPct}% against the signed agreement.`;

    if (!decision) {
      decision = {
        id: idFactory('dec'),
        title: titlePrefix,
        question: `How should we respond to the adverse settlement on “${record.title}”? ${reasonDetail} ${evaluation.note || ''}`.trim().slice(0, 2000),
        date: todayStr,
        reversibility: 'reversible',
        driver: owner?.name || '',
        approver: draft.settings?.leaderName || '',
        contributors: record.counterparty || '',
        informed: '',
        options: [
          {
            id: idFactory('dopt'),
            label: 'Execute walk-away BATNA or fallback alternative',
            pros: record.ourBatnaDescription || 'Caps further implementation shortfall',
            cons: 'Switching cost and transition coordination',
          },
          {
            id: idFactory('dopt'),
            label: 'Invoke contract remediation / renegotiate counterparty terms',
            pros: 'Recovers unfulfilled commitment value without full replacement',
            cons: 'Requires counterparty compliance and follow-up monitoring',
          },
          {
            id: idFactory('dopt'),
            label: 'Accept realised variance and recalibrate future reservation prices',
            pros: 'Closes the loop immediately with honest reference-class evidence',
            cons: 'Absorbs the shortfall within the current operating plan',
          },
        ],
        chosen: '',
        rationale: '',
        reviewOn: addDays(todayStr, draft.settings?.decisionReviewDays ?? 14),
        reviewedOn: null,
        outcome: 'pending',
        outcomeNotes: '',
        forecastProbability: null,
        createdAt: nowIso,
      };
      draft.decisions.push(decision);
      ensureEntityLink(
        draft,
        {
          sourceType: 'negotiation',
          sourceId: record.id,
          targetType: 'decision',
          targetId: decision.id,
          relation: 'decides',
          ruleId: 'RULE-NEG-06',
          summary: `Adverse settlement governance: ${reasonDetail.slice(0, 120)}`,
        },
        { idFactory, todayStr, nowIso },
      );
      propagations.push({
        ruleId: 'RULE-NEG-06',
        targetType: 'decision',
        targetId: decision.id,
        action: 'created',
        summary: `Opened DACI settlement review decision (${evaluation.status})`,
      });
    } else {
      decision.question = `How should we respond to the adverse settlement on “${record.title}”? ${reasonDetail} ${evaluation.note || ''}`.trim().slice(0, 2000);
      propagations.push({
        ruleId: 'RULE-NEG-06',
        targetType: 'decision',
        targetId: decision.id,
        action: 'updated',
        summary: `Updated DACI settlement review decision (${evaluation.status})`,
      });
    }
  }

  if (propagations.length && logEvent) {
    logEvent({
      type: 'automation.propagated',
      entity: 'negotiation',
      entityId: record.id,
      summary: `[RULE-NEG-06] Settlement evaluated for “${record.title.slice(0, 60)}” (${evaluation.status})`,
    });
  }

  return propagations;
}

/**
 * RULE-NEG-07 — settle → update the derived outside-view calibration cohort.
 *
 * The cohort is a read model, not a second copy of negotiation records. This
 * event rule records that the projection was refreshed in the same safe-write
 * transaction as RULE-NEG-06; the source values stay on the negotiation and
 * are segmented by currency and issue direction in calibration.js.
 */
export function propagateNegotiationSettlementCalibration(
  draft,
  record,
  { logEvent = null } = {},
) {
  if (!draft || !record || record.autoPropagate === false || record.status !== 'agreed') return [];
  const evaluation = evaluateNegotiationSettlement(record);
  if (!evaluation.settled) return [];

  const calibration = negotiationSettlementCalibration(draft);
  const cohort = calibration.cohorts.find((item) => item.pairs.some((pair) => pair.negotiationId === record.id));
  const missing = calibration.missingItems.find((item) => item.negotiationId === record.id);
  if (!cohort && !missing) return [];

  const entry = cohort
    ? {
        ruleId: 'RULE-NEG-07',
        targetType: 'calibration',
        targetId: cohort.cohortKey,
        action: 'updated',
        summary: cohort.sufficient
          ? `Refreshed ${cohort.currency}/${cohort.direction} settlement reference class (n=${cohort.n}; median directional variance ${cohort.medianFavorableVariancePct}%)`
          : `Added to ${cohort.currency}/${cohort.direction} settlement reference class (${cohort.n}/${CALIBRATION_MIN_SAMPLES}; counts only)`,
      }
    : {
        ruleId: 'RULE-NEG-07',
        targetType: 'calibration',
        targetId: `unscored:${record.id}`,
        action: 'recorded-unscored',
        summary: `Kept “${String(record.title || '').slice(0, 60)}” in the settlement actuals follow-up queue: ${missing.reason}`,
      };

  const eventSummary = `[RULE-NEG-07] ${entry.summary}`;
  const alreadyLogged = (draft.events || []).some((event) => (
    event.type === 'automation.propagated'
      && event.entity === 'negotiation'
      && event.entityId === record.id
      && event.summary === eventSummary
  ));
  if (logEvent && !alreadyLogged) {
    logEvent({
      type: 'automation.propagated',
      entity: 'negotiation',
      entityId: record.id,
      summary: eventSummary,
    });
  }
  return [entry];
}

/* ------------------------------------------------------------------ */
/* Budget & financial commitments (Schema v24)                         */
/* ------------------------------------------------------------------ */

function openBudgetBreachDecision(draft, budgetId) {
  const link = (draft.links || []).find(
    (l) => l.sourceType === 'budget' && l.sourceId === budgetId && l.targetType === 'decision'
      && l.relation === 'decides' && l.ruleId === 'RULE-FIN-01',
  );
  if (!link) return null;
  const decision = (draft.decisions || []).find((d) => d.id === link.targetId);
  if (!decision) return null;
  return decision.outcome === 'pending' && !decision.chosen ? decision : null;
}

/**
 * RULE-FIN-02 (forward) + RULE-FIN-01 — run inside every budget write.
 * Links sourced lines to the work they fund, logs neutral goal funding
 * telemetry, and opens one DACI trade-off when the recorded forecast
 * breaches the recorded ceiling. Never edits amounts, ceilings, goal
 * confidence, or any performance record.
 */
export function propagateBudgetEvent(draft, budget, { now = new Date(), idFactory, logEvent = null } = {}) {
  const propagations = [];
  if (!draft || !budget || budget.autoPropagate === false) return propagations;
  const todayStr = dayKey(now);
  const nowIso = now.toISOString();
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.goals = Array.isArray(draft.goals) ? draft.goals : [];

  for (const line of budget.lines || []) {
    if (!line.sourceType || !line.sourceId) continue;
    const res = ensureEntityLink(
      draft,
      {
        sourceType: 'budget',
        sourceId: budget.id,
        targetType: line.sourceType,
        targetId: line.sourceId,
        relation: 'funds',
        ruleId: 'RULE-FIN-02',
        summary: `Budget funds ${line.sourceType}: ${line.title}`.slice(0, 300),
      },
      { idFactory, todayStr, nowIso },
    );
    if (res.created) {
      propagations.push({
        ruleId: 'RULE-FIN-02',
        targetType: line.sourceType,
        targetId: line.sourceId,
        action: 'linked',
        summary: `Linked budget “${budget.name.slice(0, 50)}” to the ${line.sourceType} it funds (“${line.title.slice(0, 50)}”)`,
      });
    }

    // Goal funding telemetry: one neutral check-in per line per lifecycle
    // state. Money committed is evidence of resourcing, not a measurement
    // of the goal, so confidence and progress are never touched.
    if (line.sourceType === 'goal' && (line.status === 'committed' || line.status === 'spent')) {
      const goal = draft.goals.find((g) => g.id === line.sourceId && g.status === 'active');
      const marker = `[RULE-FIN-02:${line.id}:${line.status}]`;
      if (goal && !(goal.checkins || []).some((c) => String(c.note || '').includes(marker))) {
        goal.checkins = Array.isArray(goal.checkins) ? goal.checkins : [];
        const amount = line.status === 'spent' ? line.actualAmount : line.committedAmount;
        const amountText = amount !== null && amount !== undefined
          ? formatMoney(budget.currency, amount)
          : 'an unpriced amount';
        goal.checkins.push({
          id: idFactory('chk'),
          date: todayStr,
          confidence: goal.confidence,
          progressPct: null,
          keyResults: null,
          note: line.status === 'spent'
            ? `${marker} Budget “${budget.name.slice(0, 50)}”: recorded actual spend of ${amountText} on “${line.title.slice(0, 60)}”.`
            : `${marker} Budget “${budget.name.slice(0, 50)}”: committed ${amountText} for “${line.title.slice(0, 60)}”.`,
        });
        propagations.push({
          ruleId: 'RULE-FIN-02',
          targetType: 'goal',
          targetId: goal.id,
          action: 'updated',
          summary: `Logged budget ${line.status === 'spent' ? 'spend' : 'commitment'} on goal “${goal.title.slice(0, 50)}”`,
        });
        if (logEvent) {
          logEvent({
            type: 'automation.propagated',
            entity: 'goal',
            entityId: goal.id,
            summary: `[RULE-FIN-02] Budget funding telemetry logged on goal ${goal.title.slice(0, 60)}`,
          });
        }
      }
    }
  }

  // RULE-FIN-01: forecast breach -> exactly one open DACI trade-off.
  const evaluation = evaluateBudget(budget, now, { watchPct: draft.settings?.budgetWatchPct });
  if (budget.status === 'active' && evaluation.breach && !openBudgetBreachDecision(draft, budget.id)) {
    const overage = Math.round((evaluation.forecastAtCompletion - evaluation.limit) * 100) / 100;
    const releaseCandidates = (budget.lines || [])
      .filter((l) => l.status === 'committed' && l.committedAmount !== null && l.committedAmount > 0)
      .sort((a, b) => b.committedAmount - a.committedAmount)
      .slice(0, 2);
    const options = releaseCandidates.map((line) => ({
      id: idFactory('dopt'),
      label: `Release or defer “${line.title.slice(0, 80)}” (${formatMoney(budget.currency, line.committedAmount)} encumbered)`,
      pros: `Returns ${formatMoney(budget.currency, line.committedAmount)} of budget authority toward the ${formatMoney(budget.currency, overage)} forecast overage`,
      cons: 'The funded work loses its recorded resourcing; update the linked record rather than letting it proceed unfunded',
    }));
    options.push({
      id: idFactory('dopt'),
      label: `Request an envelope increase of at least ${formatMoney(budget.currency, overage)}`,
      pros: 'Keeps every recorded commitment funded if the value case for each still holds',
      cons: 'Requires approval outside this workspace; until granted the forecast remains a breach, not a plan',
    });
    options.push({
      id: idFactory('dopt'),
      label: 'Hold all commitments and accept the breach explicitly',
      pros: 'No immediate disruption to funded work',
      cons: `Forecast spend of ${formatMoney(budget.currency, evaluation.forecastAtCompletion)} against a ${formatMoney(budget.currency, evaluation.limit)} ceiling is then a chosen position, not a surprise`,
    });
    const owner = (draft.people || []).find((p) => p.id === budget.ownerId);
    const decision = {
      id: idFactory('dec'),
      title: `Budget forecast breach: ${budget.name}`.slice(0, 180),
      question: [
        `Envelope “${budget.name}” (${budget.currency}, ceiling ${formatMoney(budget.currency, evaluation.limit)}) forecasts ${formatMoney(budget.currency, evaluation.forecastAtCompletion)} at completion:`,
        `${formatMoney(budget.currency, evaluation.spentKnown)} recorded actuals + ${formatMoney(budget.currency, evaluation.committedOpen)} open commitments.`,
        evaluation.forecastUnderstated ? 'The forecast is understated: some lines are unpriced or spent without a recorded actual.' : '',
        'Triggered by RULE-FIN-01 (budgetary control: act on the forecast while release is still possible).',
      ].filter(Boolean).join(' ').slice(0, 2000),
      date: todayStr,
      reversibility: 'reversible',
      driver: (owner?.name || draft.settings?.leaderName || '').slice(0, 120),
      approver: (draft.settings?.leaderName || '').slice(0, 120),
      contributors: releaseCandidates.map((l) => l.title).join(', ').slice(0, 300),
      informed: '',
      options,
      chosen: '',
      rationale: '',
      reviewOn: addDaysKey(todayStr, draft.settings?.decisionReviewDays ?? 14, now),
      reviewedOn: null,
      outcome: 'pending',
      outcomeNotes: '',
      createdAt: nowIso,
    };
    draft.decisions.push(decision);
    ensureEntityLink(
      draft,
      {
        sourceType: 'budget',
        sourceId: budget.id,
        targetType: 'decision',
        targetId: decision.id,
        relation: 'decides',
        ruleId: 'RULE-FIN-01',
        summary: `Forecast-breach trade-off decision for ${budget.name}`,
      },
      { idFactory, todayStr, nowIso },
    );
    propagations.push({
      ruleId: 'RULE-FIN-01',
      targetType: 'decision',
      targetId: decision.id,
      action: 'created',
      summary: `Auto-created DACI trade-off “${decision.title.slice(0, 70)}”`,
    });
    if (logEvent) {
      logEvent({
        type: 'automation.propagated',
        entity: 'decision',
        entityId: decision.id,
        summary: `[RULE-FIN-01] ${decision.title.slice(0, 120)}`,
      });
    }
  }

  return propagations;
}

/**
 * RULE-FIN-03 — a recorded actual joins (or visibly fails to join) the
 * commitment-accuracy reference class. The ledger is derived, so this emits
 * typed propagation metadata plus an idempotent audit event only.
 */
export function propagateBudgetActual(draft, budget, line, { logEvent = null } = {}) {
  if (!draft || !budget || !line || budget.autoPropagate === false) return [];
  const cal = budgetCommitmentCalibration(draft);
  const pair = cal.pairs.find((p) => p.budgetId === budget.id && p.lineId === line.id);
  const missing = cal.missingItems.find((m) => m.budgetId === budget.id && m.lineId === line.id);
  if (!pair && !missing) return [];
  const entry = pair
    ? {
        ruleId: 'RULE-FIN-03',
        targetType: 'calibration',
        targetId: 'budget-commitments',
        action: 'updated',
        summary: cal.sufficient
          ? `Scored “${line.title.slice(0, 50)}” at ${pair.ratio}× its committed amount; commitment reference class n=${cal.n}, median ${cal.medianRatio}×`
          : `Scored “${line.title.slice(0, 50)}” at ${pair.ratio}× its committed amount (${cal.n}/${cal.minSamples} pairs; counts only)`,
      }
    : {
        ruleId: 'RULE-FIN-03',
        targetType: 'calibration',
        targetId: `unscored:${line.id}`,
        action: 'recorded-unscored',
        summary: `Kept “${line.title.slice(0, 60)}” in the commitment actuals follow-up queue: ${missing.reason}`,
      };
  const eventSummary = `[RULE-FIN-03] ${entry.summary}`;
  const alreadyLogged = (draft.events || []).some((event) => (
    event.type === 'automation.propagated'
      && event.entity === 'budget'
      && event.entityId === budget.id
      && event.summary === eventSummary
  ));
  if (logEvent && !alreadyLogged) {
    logEvent({
      type: 'automation.propagated',
      entity: 'budget',
      entityId: budget.id,
      summary: eventSummary,
    });
  }
  return [entry];
}

/**
 * RULE-FIN-02 (reverse) — funded work finished, so its encumbrances should
 * now be settled with evidence. Stamps `actualsDueOn` once per line inside
 * the completing module's own transaction; never writes an amount.
 */
export function propagateSourceCompletionToBudgets(draft, sourceType, sourceId, { now = new Date(), logEvent = null } = {}) {
  const propagations = [];
  if (!draft || !sourceType || !sourceId) return propagations;
  const todayStr = dayKey(now);
  for (const budget of draft.budgets || []) {
    if (budget.status !== 'active' || budget.autoPropagate === false) continue;
    for (const line of budget.lines || []) {
      if (line.status !== 'committed' || line.sourceType !== sourceType || line.sourceId !== sourceId) continue;
      if (line.actualsDueOn) continue;
      line.actualsDueOn = todayStr;
      budget.updatedAt = now.toISOString();
      const summary = `Marked “${line.title.slice(0, 55)}” in budget “${budget.name.slice(0, 45)}” actuals-due: its funded ${sourceType} completed`;
      propagations.push({
        ruleId: 'RULE-FIN-02',
        targetType: 'budget',
        targetId: budget.id,
        action: 'actuals-due',
        summary,
      });
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'budget',
          entityId: budget.id,
          summary: `[RULE-FIN-02] ${summary}`,
        });
      }
    }
  }
  return propagations;
}

/* ==========================================================================
 * Stakeholder Influence Register (Schema v25) — RULE-STK-01..04
 * Political-science propagation: register reconciliation, Tsebelis veto
 * alignment decisions, stance-shift response, and read-side cadence watch.
 * ========================================================================== */

const STK_SOURCE_COLLECTIONS = Object.freeze({
  case: 'cases',
  change: 'changes',
  negotiation: 'negotiations',
});

function stkSourceRecord(draft, sourceType, sourceId) {
  const key = STK_SOURCE_COLLECTIONS[sourceType];
  if (!key) return null;
  return (draft[key] || []).find((r) => r.id === sourceId) || null;
}

function stkStubsForSource(draft, sourceType, sourceId) {
  return collectEmbeddedStakeholders(draft).filter(
    (s) => s.sourceType === sourceType && s.sourceId === sourceId,
  );
}

/** Stable marker so RULE-STK-02 never duplicates its own decision and can
 * coexist with RULE-DEC-01 / RULE-CHG-02 decisions on the same source. */
function stkDecisionMarker(sourceType, sourceId) {
  return `[RULE-STK-02:${sourceType}:${sourceId}]`;
}

function hasStakeholderAlignmentDecision(draft, sourceType, sourceId) {
  const marker = stkDecisionMarker(sourceType, sourceId);
  return (draft.decisions || []).some((d) => String(d.question || '').includes(marker));
}

/**
 * RULE-STK-01 — reconcile embedded stakeholder stubs against the register and
 * maintain idempotent typed `involves` edges. Strict matching only: a stub
 * with no register record is counted as unmapped, never force-linked.
 */
export function reconcileStakeholderInvolvement(
  draft,
  sourceType,
  sourceId,
  { now = new Date(), idFactory, logEvent = null } = {},
) {
  const propagations = [];
  if (!draft || !sourceType || !sourceId || !STK_SOURCE_COLLECTIONS[sourceType]) return propagations;
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  const todayStr = dayKey(now);
  const nowIso = now.toISOString();
  const register = Array.isArray(draft.stakeholders) ? draft.stakeholders : [];

  const seenNames = new Set();
  for (const stub of stkStubsForSource(draft, sourceType, sourceId)) {
    const nameKey = String(stub.name || '').trim().toLowerCase();
    if (!nameKey || seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);
    const reg = matchRegisterStakeholder(register, { name: stub.name, personId: stub.personId });
    if (!reg) continue;
    const res = ensureEntityLink(
      draft,
      {
        sourceType,
        sourceId,
        targetType: 'stakeholder',
        targetId: reg.id,
        relation: 'involves',
        ruleId: 'RULE-STK-01',
        summary: `Stakeholder involvement: ${reg.name}`,
      },
      { idFactory, todayStr, nowIso },
    );
    if (res.created) {
      propagations.push({
        ruleId: 'RULE-STK-01',
        targetType: 'stakeholder',
        targetId: reg.id,
        action: 'linked',
        summary: `Linked register stakeholder “${reg.name}” to the ${sourceType}`,
      });
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'stakeholder',
          entityId: reg.id,
          summary: `[RULE-STK-01] involvement edge → ${sourceType} ${sourceId}`,
        });
      }
    }
  }
  return propagations;
}

/**
 * RULE-STK-02 — an open initiative facing an adverse veto player gets exactly
 * one alignment DACI decision. Initiative-specific embedded stances override
 * the register default via initiativeVetoRisk; no stance is ever rewritten.
 */
export function evaluateStakeholderVetoDecision(
  draft,
  sourceType,
  sourceId,
  { now = new Date(), idFactory, logEvent = null } = {},
) {
  const propagations = [];
  if (!draft || !sourceType || !sourceId) return propagations;
  const source = stkSourceRecord(draft, sourceType, sourceId);
  if (!source || source.autoPropagate === false) return propagations;
  if (hasStakeholderAlignmentDecision(draft, sourceType, sourceId)) return propagations;

  const risk = initiativeVetoRisk(draft, sourceType, sourceId);
  if (risk.opposingVetoCount === 0) return propagations;

  const todayStr = dayKey(now);
  const nowIso = now.toISOString();
  const reviewDays = Number(draft.settings?.decisionReviewDays) || 14;
  const names = risk.contributors
    .filter((c) => ADVERSE_STANCES.includes(c.stance))
    .map((c) => `${c.name} (${c.stanceLabel}, power ${c.power})`)
    .join('; ');
  const marker = stkDecisionMarker(sourceType, sourceId);

  const decision = {
    id: idFactory('dec'),
    title: `Veto alignment: ${String(source.title || sourceType).slice(0, 140)}`.slice(0, 180),
    question:
      `${marker} Tsebelis veto analysis: ${risk.opposingVetoCount} of ${risk.vetoCount} recorded veto player(s) adverse — ${names}. ` +
      `Change-difficulty heuristic ${risk.difficulty}/100 (band: ${risk.band.label}, confidence: ${risk.confidence}). ${risk.rationale}`.slice(0, 2000),
    date: todayStr,
    reversibility: risk.band.id === 'blocked' ? 'irreversible' : 'reversible',
    driver: (draft.people || []).find((p) => p.id === source.ownerId)?.name || '',
    approver: '',
    contributors: '',
    informed: '',
    options: [
      {
        id: idFactory('dopt'),
        label: 'Redesign the package to satisfy or remove the veto concern',
        pros: 'Widens the win-set without an authority fight; preserves the relationship and the gate.',
        cons: 'Costs scope, time or budget and may dilute the original objective.',
      },
      {
        id: idFactory('dopt'),
        label: 'Open a direct alignment conversation with objective criteria',
        pros: 'Converts opposition through legitimacy and evidence (Fisher & Ury principled persuasion).',
        cons: 'Spends political capital and requires a credible alternative if the gate holds.',
      },
      {
        id: idFactory('dopt'),
        label: 'Escalate with documented trade-offs and explicitly accept the risk',
        pros: 'Keeps momentum with a governance-visible, reviewable choice rather than a silent override.',
        cons: 'Overrides a recorded veto gate; the modelled win-set is empty or narrow and reversal is costly.',
      },
    ],
    chosen: '',
    rationale: '',
    reviewOn: addDays(todayStr, reviewDays),
    reviewedOn: null,
    outcome: 'pending',
    outcomeNotes: '',
    createdAt: nowIso,
  };
  draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
  draft.decisions.push(decision);
  ensureEntityLink(
    draft,
    {
      sourceType,
      sourceId,
      targetType: 'decision',
      targetId: decision.id,
      relation: 'decides',
      ruleId: 'RULE-STK-02',
      summary: `Veto alignment decision for ${source.title || sourceType}`,
    },
    { idFactory, todayStr, nowIso },
  );
  propagations.push({
    ruleId: 'RULE-STK-02',
    targetType: 'decision',
    targetId: decision.id,
    action: 'created',
    summary: `Auto-created veto alignment DACI decision “${decision.title.slice(0, 70)}” (difficulty ${risk.difficulty}/100)`,
  });
  if (logEvent) {
    logEvent({
      type: 'automation.propagated',
      entity: 'decision',
      entityId: decision.id,
      summary: `[RULE-STK-02] ${decision.title.slice(0, 120)}`,
    });
  }
  return propagations;
}

/**
 * RULE-STK-03 — an adverse stance shift on a high-salience internal
 * stakeholder queues one managed, blameless 1:1 talking point. External
 * stakeholders have no roster record and are handled by the read-side watch.
 */
export function propagateStakeholderStanceShift(
  draft,
  record,
  prevStance,
  entry,
  { now = new Date(), idFactory, logEvent = null } = {},
) {
  const propagations = [];
  if (!draft || !record || !entry) return propagations;
  const shift = classifyStanceShift(prevStance, entry.stance);
  if (!shift.adverse) return propagations;
  const salience = classifySalience(record);
  if (!HIGH_SALIENCE_CLASSES.includes(salience.salienceClass)) return propagations;

  const todayStr = dayKey(now);
  const nowIso = now.toISOString();
  const person = record.personId
    ? (draft.people || []).find((p) => p.id === record.personId && p.status === 'active')
    : null;
  if (person) {
    ensureEntityLink(
      draft,
      {
        sourceType: 'stakeholder',
        sourceId: record.id,
        targetType: 'person',
        targetId: person.id,
        relation: 'coaches',
        ruleId: 'RULE-STK-03',
        summary: `Stakeholder stewardship for ${record.name}`,
      },
      { idFactory, todayStr, nowIso },
    );
    const marker = `; ref ${record.id})`;
    const contextPart = entry.context ? `: ${String(entry.context).slice(0, 160)}` : '';
    const promptText =
      `Stakeholder shift (${record.name} moved ${prevStance} → ${entry.stance}${contextPart} — understand the concern, protect the coalition, no blame${marker}`;
    person.talkingPoints = Array.isArray(person.talkingPoints) ? person.talkingPoints : [];
    const managedIndex = person.talkingPoints.findIndex(
      (tp) => String(tp).startsWith('Stakeholder shift (') && String(tp).includes(marker),
    );
    if (managedIndex >= 0 && person.talkingPoints[managedIndex] !== promptText) {
      person.talkingPoints[managedIndex] = promptText;
      propagations.push({
        ruleId: 'RULE-STK-03',
        targetType: 'person',
        targetId: person.id,
        action: 'refreshed',
        summary: `Refreshed stance-shift topic for ${person.name}`,
      });
    } else if (managedIndex < 0 && person.talkingPoints.length < 12) {
      person.talkingPoints.push(promptText);
      propagations.push({
        ruleId: 'RULE-STK-03',
        targetType: 'person',
        targetId: person.id,
        action: 'updated',
        summary: `Queued stance-shift 1:1 topic for ${person.name}`,
      });
      if (logEvent) {
        logEvent({
          type: 'automation.propagated',
          entity: 'person',
          entityId: person.id,
          summary: `[RULE-STK-03] stance-shift topic for ${record.name}`,
        });
      }
    }
  }
  return propagations;
}

/**
 * RULE-STK-01/02 (reverse direction) — when a register record is saved, find
 * every embedded stub that matches it across open initiatives, reconcile the
 * involvement edges and re-evaluate veto alignment for each.
 */
export function propagateStakeholderEvent(
  draft,
  record,
  { now = new Date(), idFactory, logEvent = null } = {},
) {
  const propagations = [];
  if (!draft || !record || record.autoPropagate === false) return propagations;
  const register = Array.isArray(draft.stakeholders) ? draft.stakeholders : [];
  const sources = new Map();
  for (const stub of collectEmbeddedStakeholders(draft)) {
    const match = matchRegisterStakeholder(register, { name: stub.name, personId: stub.personId });
    if (match && match.id === record.id) {
      sources.set(`${stub.sourceType}:${stub.sourceId}`, { sourceType: stub.sourceType, sourceId: stub.sourceId });
    }
  }
  for (const { sourceType, sourceId } of sources.values()) {
    propagations.push(
      ...reconcileStakeholderInvolvement(draft, sourceType, sourceId, { now, idFactory, logEvent }),
    );
    propagations.push(
      ...evaluateStakeholderVetoDecision(draft, sourceType, sourceId, { now, idFactory, logEvent }),
    );
  }

  // Stewardship edge for an internal high-salience register entry.
  if (record.personId) {
    const person = (draft.people || []).find((p) => p.id === record.personId && p.status === 'active');
    if (person) {
      const todayStr = dayKey(now);
      const nowIso = now.toISOString();
      ensureEntityLink(
        draft,
        {
          sourceType: 'stakeholder',
          sourceId: record.id,
          targetType: 'person',
          targetId: person.id,
          relation: 'coaches',
          ruleId: 'RULE-STK-03',
          summary: `Stakeholder stewardship for ${record.name}`,
        },
        { idFactory, todayStr, nowIso },
      );
    }
  }
  return propagations;
}

/** Dry-run used by the register dialog so the leader sees propagation before saving. */
export function previewStakeholderPropagations(
  candidate,
  state = {},
  { now = new Date(), existingStakeholderId = null } = {},
) {
  const previews = [];
  const draft = JSON.parse(JSON.stringify(state || {}));
  draft.stakeholders = Array.isArray(draft.stakeholders) ? draft.stakeholders : [];
  const record = { ...candidate, id: existingStakeholderId || candidate.id || 'stk-preview' };
  if (!existingStakeholderId) draft.stakeholders.push(record);
  else {
    const idx = draft.stakeholders.findIndex((s) => s.id === existingStakeholderId);
    if (idx >= 0) draft.stakeholders[idx] = record;
    else draft.stakeholders.push(record);
  }
  let seq = 0;
  const previewIdFactory = (prefix) => `${prefix}-preview-${++seq}`;
  const effects = propagateStakeholderEvent(draft, record, { now, idFactory: previewIdFactory });
  for (const effect of effects) {
    previews.push({
      ruleId: effect.ruleId,
      targetModule: effect.targetType,
      summary: effect.summary,
      detail: effect.action,
    });
  }
  if (record.vetoPlayer === true) {
    const risks = vetoRisksForPreview(draft, record);
    for (const risk of risks) {
      if (risk.risk.opposingVetoCount > 0) {
        previews.push({
          ruleId: 'RULE-STK-02',
          targetModule: 'decisions',
          summary: `Veto alignment decision may open on “${risk.title}”`,
          detail: `Difficulty heuristic ${risk.risk.difficulty}/100 (${risk.risk.band.label}) once the initiative is saved with this stance.`,
        });
      }
    }
  }
  return previews;
}

function vetoRisksForPreview(draft, record) {
  const out = [];
  for (const sourceType of Object.keys(STK_SOURCE_COLLECTIONS)) {
    for (const item of draft[STK_SOURCE_COLLECTIONS[sourceType]] || []) {
      const stub = collectEmbeddedStakeholders(draft).find(
        (s) => s.sourceType === sourceType && s.sourceId === item.id &&
          matchRegisterStakeholder(draft.stakeholders, { name: s.name, personId: s.personId })?.id === record.id,
      );
      if (!stub) continue;
      out.push({ sourceType, sourceId: item.id, title: item.title, risk: initiativeVetoRisk(draft, sourceType, item.id) });
    }
  }
  return out;
}
