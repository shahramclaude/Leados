/**
 * app/core/csv.js — RFC 4180 CSV serializer/parser and purpose-limited,
 * formula-injection-safe workspace exports.
 *
 * Security & privacy invariants:
 *  - OWASP CWE-1236 neutralization: string cells starting with `=`, `+`, `-`,
 *    `@`, tab, CR, LF, or Unicode full-width formula prefixes (`＝`, `＋`,
 *    `－`, `＠`) — whether at index 0 or after leading whitespace — are
 *    prefixed with `'` so Excel, LibreOffice Calc, and Google Sheets treat
 *    them as literal text rather than executable formulas.
 *  - Finite numbers are formatted before formula checks so negative scores or
 *    deltas (e.g. `-4.5`) remain true numeric cells.
 *  - `null` and `undefined` serialize as `""` (empty cell), never `0` or
 *    `"null"`, preserving unknown values honestly.
 *  - Purpose limitation: confidential conflict/coaching records require an
 *    explicit opt-in `conflicts` scope and never appear in roster, activity,
 *    or review exports. Pulse exports expose only anonymity-checked weekly
 *    aggregates (`pulseSummary`), never raw per-response rows or `personId`.
 */

import { addDays, dayKey, daysBetween, weekStart } from './time.js';
import { feedbackLatency } from './domain/feedback.js';
import { observeFidelity } from './domain/fidelity.js';
import { fairnessReading } from './domain/comp.js';
import { goalProgress } from './domain/goals.js';
import { buildReviewEvidence, summarizeReviewEvidence } from './domain/reviews.js';
import { aggregate, comments } from './domain/pulse.js';
import { buildTeamTrends } from './domain/trends.js';
import { followThroughIndex, isOpenAction } from './domain/oneonone.js';
import { deriveDelegationLineage } from './domain/delegations.js';
import { willIndex, growthLinkForDelegation } from './domain/growth.js';
import { planKind } from './domain/onboarding.js';
import { assess, EVIDENCE_DEFINITIONS } from './domain/readiness.js';
import { FORBIDDEN_LINK_TYPES, classifyMendelowStakeholder, resolveLinkedEntity, summarizeCase } from './domain/cases.js';
import { classifySalience } from './domain/stakeholders.js';
import { forecastIntegrityReport } from './domain/forecastIntegrity.js';
import { buildTempoReport, TEMPO_MIN_SAMPLES } from './domain/decisionTempo.js';
import { buildResilienceReport } from './domain/resilience.js';
import { analyzePowerGame } from './domain/power.js';
import { buildNetworkReport } from './domain/orgNetwork.js';
import { buildVoiPortfolio } from './domain/valueOfInformation.js';
import { IMPACT_ENGINE_VERSION } from './domain/impact.js';
import { ALLOC_ENGINE_VERSION, buildAllocationReport } from './domain/allocation.js';
import { DYN_ENGINE_VERSION, buildDynamicsReport } from './domain/dynamics.js';
import { CAP_ENGINE_VERSION, buildCapitalReport } from './domain/policyPortfolio.js';
import { LOAD_ENGINE_VERSION, buildLoadReport } from './domain/load.js';
import { PREMISE_ENGINE_VERSION, buildPremiseReport } from './domain/premises.js';
import { CONTINUITY_ENGINE_VERSION, scoreDrillRecord } from './domain/leaderContinuity.js';
import { MEASUREMENT_ENGINE_VERSION, scorecardIntegrity } from './domain/measurement.js';
import {
  buildReportingIndex,
  conventionsFromSettings as signalConventionsFromSettings,
  readClass,
} from './domain/signalPath.js';
import { EW_ENGINE_VERSION, buildWatchReport } from './domain/earlyWarning.js';
import { PREMISE_CALIBRATION_ENGINE_VERSION, buildPremiseCalibrationReport } from './domain/premiseCalibration.js';
import { PREMISE_TAILS_ENGINE_VERSION, simulatePremiseTails } from './domain/premiseTails.js';
import { PORTFOLIO_DECISION_LABELS, pertTriple } from './domain/capacity.js';
import { transitionReading } from './domain/transition.js';
import {
  buildStructure,
  conventionsFromSettings,
  designPortfolio,
  scoreDesignPrediction,
  structureReading,
} from './domain/orgDesign.js';
import {
  CALIBRATION_MIN_SAMPLES,
  OUTCOME_VALUES,
  caseCostPairs,
  decisionForecastPairs,
  estimatePairs,
  missingActualItems,
  missingCaseActuals,
  negotiationSettlementCalibration,
} from './domain/calibration.js';
import { summarizeNegotiation } from './domain/negotiation.js';
import { evaluateBudget, commitmentCalibration as budgetCommitmentCalibration } from './domain/finance.js';
import {
  CANDIDATE_STAGE_LABELS,
  REQUISITION_REASON_LABELS,
  REQUISITION_STATUS_LABELS,
  assessCandidate,
  retentionReview,
} from './domain/hiring.js';
import {
  CHANGE_KIND_LABELS,
  CHANGE_STATUS_LABELS,
  summarizeChange,
} from './domain/changes.js';
import {
  buildSuggestedScenarios,
  compareScenarios,
  computeSensitivityTornado,
} from './domain/scenarios.js';
import { assessConcern, predictionOutcome } from './domain/performance.js';
import { survivalReport } from './domain/survival.js';
import { waitConventionsFromSettings, waitCostReport } from './domain/waitCost.js';
import { evidenceConventionsFromSettings, evidenceReport } from './domain/evidence.js';
import { PARITY_CHANNEL_KEYS } from './domain/paritySchema.js';
import { parityConventionsFromSettings, parityReport } from './domain/parity.js';

const FORMULA_TRIGGERS = new Set([
  '=', '+', '-', '@',
  '\t', '\r', '\n',
  '\uFF1D', // ＝ full-width equals
  '\uFF0B', // ＋ full-width plus
  '\uFF0D', // － full-width minus
  '\uFF20', // ＠ full-width commercial at
]);

function isFormulaDangerousString(str) {
  if (!str) return false;
  if (FORMULA_TRIGGERS.has(str[0])) return true;
  const trimmed = str.trimStart();
  return Boolean(trimmed && FORMULA_TRIGGERS.has(trimmed[0]));
}

/**
 * Format and escape a single CSV cell according to RFC 4180 + OWASP CWE-1236.
 */
export function escapeCsvCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  let text = String(value);
  if (text.length === 0) return '';
  if (isFormulaDangerousString(text)) {
    text = `'${text}`;
  }
  const needsQuotes = /[",\r\n]/.test(text) || /^\s|\s$/.test(text);
  if (!needsQuotes) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Serialize column headers (`[{ key, header }]` or string keys) and row objects
 * or arrays into an RFC 4180 CRLF CSV string.
 */
export function serializeCsv(columns, rows) {
  const normalizedCols = columns.map((col) => (
    typeof col === 'string' ? { key: col, header: col } : col
  ));
  const lines = [
    normalizedCols.map((col) => escapeCsvCell(col.header)).join(','),
  ];
  for (const row of rows) {
    const cells = Array.isArray(row)
      ? normalizedCols.map((_, idx) => escapeCsvCell(row[idx]))
      : normalizedCols.map((col) => escapeCsvCell(row[col.key]));
    lines.push(cells.join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * RFC 4180 state-machine parser returning `{ headers, rows }` for round-trip
 * verification and spreadsheet import inspection.
 */
export function parseCsv(text) {
  const input = String(text ?? '');
  if (!input.length) return { headers: [], rows: [] };
  const records = [];
  let record = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\r') {
      if (input[i + 1] === '\n') i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else if (ch === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (inQuotes || field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  if (!records.length) return { headers: [], rows: [] };
  const [headers, ...rows] = records;
  return { headers, rows };
}

export const CSV_EXPORTS = [
  {
    key: 'people',
    label: 'Team roster',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'people',
    description: 'Active and archived team members, roles, start dates, focus areas, and 1:1 talking points.',
  },
  {
    key: 'onboarding',
    label: 'Onboarding, transitions & return to work (30-60-90 plans)',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'onboarding-plans',
    description: '30-60-90 scaffolding for new joiners, internal role transitions, and return-to-work plans (plan_kind / plan_label), peer buddies, stakeholder introduction coverage, phase check-ins, and checkpoints.',
  },
  {
    key: 'oneOnOnes',
    label: '1:1 meetings',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'one-on-ones',
    description: 'Logged 1:1 conversations, status, energy, summaries, wins, blockers, and action counts.',
  },
  {
    key: 'actions',
    label: 'Commitments & follow-ups',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'commitments',
    description: 'Open and completed 1:1 actions, manager-owned 30-60-90 check-in follow-ups, GROW development commitments and feedback follow-ups, with source provenance, due and completion dates.',
  },
  {
    key: 'feedback',
    label: 'Feedback & SBI log',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'feedback',
    description: 'Praise and constructive SBI notes, direction, observed-to-discussed latency, and follow-up dates.',
  },
  {
    key: 'goals',
    label: 'Goals & key results',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'goals-key-results',
    description: 'Goals, co-authorship status, confidence, overall progress, and one row per key result.',
  },
  {
    key: 'delegations',
    label: 'Delegations',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'delegations',
    description: 'Delegated outcomes, authority levels, support commitments, check-in progress, and completion or return notes.',
  },
  {
    key: 'growthPlans',
    label: 'Development plans (GROW)',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'growth-plans',
    description: 'Active and closed GROW plans, review dates, competency focus, and commitment completion counts.',
  },
  {
    key: 'recognition',
    label: 'Recognition log',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'recognition',
    description: 'Specific recognition entries, visibility, and team values reinforced.',
  },
  {
    key: 'readiness',
    label: 'Succession & readiness',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'readiness',
    description: 'Succession seats, candidates, readiness ratings, behavioural evidence counts, and active 30-60-90 transition status.',
  },
  {
    key: 'decisions',
    label: 'Decision log (DACI)',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'decisions',
    description: 'Team decisions, reversibility, DACI roles, rationale, review dates, and outcomes.',
  },
  {
    key: 'cases',
    label: 'Operational cases (FMEA, PERT & RCA)',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'operational-cases',
    description: 'Cross-domain operational cases with FMEA Action Priority & RPN, 3-point PERT financial and capacity distributions, risk-adjusted ROI, 5-Whys systemic barriers, and stakeholder coalition balance.',
  },
  {
    key: 'changes',
    label: 'Organizational design, topologies & change execution',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'org-design-changes',
    description: 'Team Topologies splits/charters, Kotter 8-step progression, Lewin force-field equilibrium, cognitive load, Galbraith Star alignment, Mendelow/veto coalition, PERT effort, and Shewhart XmR telemetry.',
  },
  {
    key: 'negotiations',
    label: 'Negotiation workbench (BATNA, ZOPA & agreements)',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'negotiations',
    description: 'Negotiation records with Fisher & Ury prep completeness, BATNA positions, Raiffa ZOPA coverage across measured issues, reservation gaps, agreed terms and ownership gaps, and impasse escalation links.',
  },
  {
    key: 'finance',
    label: 'Budget envelopes & financial commitments (encumbrance ledger)',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'budget-finance',
    description: 'Budget envelopes with recorded actuals, open encumbrances, planned pipeline and forecast at completion per envelope (each in its own currency, never converted or summed across envelopes), plus one row per commitment line with its funded record and actual-vs-committed ratio.',
  },
  {
    key: 'portfolio',
    label: 'Capacity plan & portfolio allocation',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'capacity-portfolio',
    description: 'Operating-plan demand ledger: three-point effort and value estimates, funding decision and rationale, target and delivery dates, source provenance, and value density per person-day.',
  },
  {
    key: 'hiring',
    label: 'Selection & hiring (requisitions, evidence, decisions)',
    group: 'operational',
    sensitive: true,
    filenameSlug: 'selection-hiring',
    description: 'Open and closed roles, competencies, interview effort, recorded evidence with method and rater, candidate stage, decision and rationale. Contains named candidate data — keep it to the process it was collected for and delete it when the process ends.',
  },
  {
    key: 'caseLinks',
    label: 'Cross-module relationship graph',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'cross-module-links',
    description: 'Typed operational links connecting cases, DACI decisions, delegations, goals, and 1:1 coaching support (excludes confidential conflicts and anonymous pulses).',
  },
  {
    key: 'reviews',
    label: 'Calibration & review packets',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'review-packets',
    description: 'Dated review packets, evidence-span coverage, recency share, and calibration notes (excludes confidential conflicts and raw pulses).',
  },
  {
    key: 'pulseSummary',
    label: 'Pulse weekly summary (anonymity-safe)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'pulse-weekly-summary',
    description: 'Weekly aggregated pulse averages and comments strictly enforcing minimum response count and unanimity suppression; never exports individual rows.',
  },
  {
    key: 'healthTrends',
    label: 'Team health & habit trends (12 weeks)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'team-health-trends',
    description: 'Fortnightly checkpoint series across all five health dimensions, feedback latency, and delegation follow-through.',
  },
  {
    key: 'sensitivity',
    label: 'Scenario comparison & tornado sensitivity (CRN)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'scenario-sensitivity',
    description: 'Common-Random-Numbers counterfactual scenario comparison (Pareto frontier, Brooks’s Law diagnostics, delta overload odds, delta P80 days) and One-at-a-Time Tornado sensitivity rankings.',
  },
  {
    key: 'calibration',
    label: 'Forecast calibration (Brier & estimate accuracy)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'forecast-calibration',
    description: 'Scored predictions vs outcomes across five calibration ledgers: decision forecasts with per-decision Brier contributions, delivered-work forecast-vs-actual ratios scored against funding-time snapshots, settled case exposure/occurrence scores against opening forecasts, direction- and currency-segmented negotiation settlement actuals/reference classes, budget commitment actual-vs-encumbered ratios, and missing actuals.',
  },
  {
    key: 'stakeholders',
    label: 'Stakeholder influence register (Mendelow, salience & veto players)',
    group: 'sensitive',
    sensitive: true,
    filenameSlug: 'stakeholder-register',
    description: 'Named political assessments: power/interest/legitimacy/urgency ratings, Mitchell-Agle-Wood salience class, Tsebelis veto flags and bases, candid stances, briefing notes and contact history. Contextual-integrity governed — scrub stances before sharing upwards.',
  },
  {
    key: 'forecasts',
    label: 'Forecast integrity (atoms, conformal classes & challenges)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'forecast-integrity',
    description: 'Purpose-limited cross-ledger prediction atoms with recorded forecasts, explicit actuals, dimensionless ratios and Brier contributions; class-level conformal bands, exact sign tests and evidence floors; and outside-view challenge responses. Contains no conflict records, no raw pulse responses and no inferred actuals or FX conversion.',
  },
  {
    key: 'conflicts',
    label: 'Difficult situations & coaching notes (Confidential)',
    group: 'sensitive',
    sensitive: true,
    filenameSlug: 'confidential-conflicts',
    description: 'Private mediation and coaching preparation notes. Contains sensitive interpersonal records — handle with restricted access.',
  },
  {
    key: 'decisionTempo',
    label: 'Decision tempo (cost of delay, EVSI & measured latency)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'decision-tempo',
    description: 'Per-decision timing position: McKinsey decision type, derived value at stake by currency, cost of delay per week, CD3 rank, preposterior value of information, optimal wait and switch probability, plus the workspace’s own measured latency band per decision type with its finite-sample coverage bound. Deliberately contains no decision titles, no free text and no person names.',
  },
  {
    key: 'intakeCalibration',
    label: 'Intake triage calibration (no free text)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'intake-calibration',
    description: 'Per-draft triage outcomes for calibrating the on-device natural-language engine: confidence band, primary category, whether the human accepted it, entity offer/acceptance counts and edited fields. By design it contains no source notes, no person names and no dismiss reasons.',
  },
  {
    key: 'resilience',
    label: 'Operational resilience, dependencies & continuity drills',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'operational-resilience',
    description: 'Directed dependency topology (services, vendors, systems, processes), Simchi-Levi TTS/TTR survival shortfalls, currency-segmented Risk Exposure Index (REI), verified Bus Factor, Williamson hold-up scores, exit plans and continuity drill calibration. Excludes confidential conflicts and raw pulse rows.',
  },
  {
    key: 'powerStrategy',
    label: 'Coalition & incentive strategy (no names or free text)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'coalition-incentive-strategy',
    description: 'Per-situation computational political-economy telemetry: quota and weighted voting power, exact Banzhaf/Shapley-Shubik concentration, minimum-winning-coalition and veto/dummy counts, 2x2 pure/mixed Nash equilibria, mechanism-design alignment cost and incentive compatibility, equilibrium robustness and confidence band, coordination loss and price of anarchy, and realised outcomes. Deliberately contains no titles, person or stakeholder names, and no free-text notes — counts and dimensionless scores only.',
  },
  {
    key: 'networkTopology',
    label: 'Influence network topology (no names or free text)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'influence-network-topology',
    description: 'Anonymous per-person structural telemetry from the derived collaboration graph: weighted PageRank influence, Freeman degree/betweenness/closeness centrality, Burt network constraint, clustering coefficient, structural-role flag counts, node-removal efficiency loss and fragmentation, and network-level density/centralization/component counts. Deliberately contains NO person names, NO titles and NO free-text — dimensionless scores and integer counts only, keyed by an opaque sequential node index.',
  },
  {
    key: 'impact',
    label: 'Intervention impact ledger (no titles or hypotheses)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'intervention-impact-ledger',
    description: 'Per-study evaluation telemetry: pre-registration grade, observed period counts, segmented level shift and HAC error, minimum detectable effect, placebo statistics, breakdown trend and verdict, plus the frozen scoring-time count of exact typed-source matches in retained successful lineage. The execution fields are status/counts only: NO source IDs, trace IDs, study titles, hypothesis text, free-text notes or names. A zero matching count is not evidence that an intervention did not happen.',
  },
  {
    // CSV scope #33 (Schema v33, Allocation Governor). Arm-level aggregates
    // only: what each ambition horizon has learned per currency. No item
    // titles, no owner names, no free text — the learning table, not the work.
    key: 'allocation',
    label: 'Allocation governor arms (aggregates only, no titles or names)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'allocation-governor-arms',
    description: 'Per currency × ambition-horizon learning aggregates from settled portfolio evidence: settled bet count, settled effort days, mean and median recorded value per person-day, the UCB1 exploration bonus and index (blank below the n=5 evidence floor — counts only, never an invented return), the arm verdict, the exploration floor policy and the recent funded exploratory share. Currencies are never converted or summed. Contains NO item titles, NO rationales and NO names.',
  },
  {
    // CSV scope #34 (Schema v34, Cognitive Load Governor). Per-person load
    // telemetry keyed by opaque sequence codes — no names, no roles, no free
    // text — so a leader can move the numbers into a spreadsheet without
    // exporting identifiable personnel data.
    key: 'load',
    label: 'Cognitive load governor (opaque person codes, no names)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'cognitive-load-governor',
    description: 'Per-person cognitive-load telemetry: saturation band and index with its four transparent component scores, the seeded Monte Carlo overload probability, WIP against the shared convention, per-person throughput, median cycle time, Kingman utilisation and expected queue wait with the evidence confidence, coordination inputs (strong-tie degree, reports, critical stewardships), the ramping flag and the bottleneck flag. People appear only as opaque sequence codes — NO names, NO roles and NO free text.',
  },
  {
    // CSV scope #35 (Schema v35, Premise Sentinel). Belief telemetry only:
    // opaque premise codes, no titles, statements, signposts, owner names,
    // observation text or source free text.
    key: 'premises',
    label: 'Assumption ledger belief telemetry (opaque codes, no free text)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'assumption-ledger-telemetry',
    description: 'Per-premise pre-registration and evidence telemetry: status, prior/posterior belief, watch and breach policy, log Bayes factor, dated evidence counts by direction, discounted weight and information gain in bits, confidence and Wald-style boundary verdict, typed scope size, pending sensor observations and stale-review flag. Premises appear only as opaque sequential codes — NO titles, NO statements, NO notes, NO names and NO source free text.',
  },
  {
    // CSV scope #36: reliability metrics and opaque premise sample rows only.
    // Outcome notes, premise titles, source text and people never leave here.
    key: 'premiseCalibration',
    label: 'Assumption sensor calibration (opaque premise codes, no notes)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'assumption-sensor-calibration',
    description: 'Outcome-scored sensor reliability: sensor id, opaque premise code, settlement date, implied forecast, human-assessed binary outcome, distinct source count, per-sensor sample count, Brier score, calibration gap, directional accuracy and forecast-mix PSI when both cohorts meet the floor. Excludes premise titles, outcome notes, source text, names and identifiable record IDs.',
  },
  {
    // CSV scope #37 (Session 55): paired tail telemetry under opaque codes.
    key: 'premiseTails',
    label: 'Assumption-aware scenario tails (opaque codes, no free text)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'assumption-aware-tails',
    description: 'Paired baseline vs premise-coupled Monte Carlo telemetry: opaque premise code, status, posterior belief, failure-stress probability, shock convention, coupled item count, leave-one-out P90 tail contribution, evidence cluster count and largest-source weight share. NO titles, NO statements, NO names, NO source free text. Belief-weighted stress, not an actuarial forecast.',
  },
  {
    // CSV scope #38 (Schema v37, Operating System Dynamics). Model telemetry
    // only: opaque experiment codes, lever values and modelled outcomes. No
    // names, no hypotheses, no free-text notes — the numbers, not the story.
    key: 'dynamics',
    label: 'Operating system dynamics (opaque experiment codes, no free text)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'operating-system-dynamics',
    description: 'Structural model telemetry: opaque experiment code, status, horizon, the six policy lever values, the frozen prediction (adopted experiments only), the currently modelled end-state saturation/WIP/capacity/dependency, the modelled deltas against doing nothing, the verdict, the structural-risk score, the loop holding the most measured gain, and the share of model parameters that are stated conventions rather than measurements. NO experiment names, NO hypotheses, NO notes and NO people. A structural model, not a forecast.',
  },
  {
    // CSV scope #39 (Schema v38, Structural Capital Allocation). Telemetry at
    // the same grain as scope #38: opaque portfolio and checkpoint codes,
    // numeric levers, effort, modelled deltas, attributed shares and skill
    // scores. No portfolio names, no hypotheses, no notes, no owners.
    key: 'capital',
    label: 'Structural capital allocation (opaque portfolio codes, no free text)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'structural-capital-allocation',
    description: 'Allocation telemetry: opaque portfolio code, status, effort budget and allocation, the six lever values, the composite score and its four weighted components, modelled end-state deltas against doing nothing, exact-Shapley attributed marginal gain per lever, worst-case regret and win rate across the seeded parameter draws, the model trust grade, and — per checkpoint — an opaque checkpoint code, its scored skill and its verdict. NO portfolio names, NO hypotheses, NO notes and NO people. Attribution inside a model, not observed causality.',
  },
  {
    // CSV scope #40 (Schema v39, Early-Warning Watch). Detector telemetry at
    // the same grain as scopes #38/#39: an opaque alert code, the monitored
    // series (a fixed vocabulary, not a person), the statistics that promoted
    // it, the frozen prediction and its realised error. No alert summaries, no
    // verdict notes, no linked case titles — the numbers, not the narrative.
    key: 'watch',
    label: 'Early-warning watch (opaque alert codes, no free text)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'early-warning-watch',
    description: 'Detection telemetry: opaque alert and series codes, nominal screening scores and ranks, frozen forecasts, provenance and first-capture scoring status. Legacy/demo and late observations are excluded from skill. NO alert summaries, verdict notes, response context, free text or people.',
  },
  {
    // CSV scope #41 (Schema v45, Leader Continuity Drill). Model telemetry at
    // the drill grain: opaque drill and item codes, the frozen probability, the
    // observed outcome and the re-derived score. No titles, no notes, no names
    // and no deputy identifiers — the numbers, not the narrative.
    key: 'continuity',
    label: 'Leader continuity drills (opaque codes, no free text)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'leader-continuity-drills',
    description: 'Absence-drill telemetry: opaque drill code, window, status, per-item opaque code with frozen stall probability and observed outcome, then the re-derived Brier score, base rate, skill score, precision/recall, unpredicted-stall count and the counts-only flag. NO obligation titles, notes, deputy names or source identifiers.',
  },
  {
    key: 'scorecardIntegrity',
    label: 'Scorecard integrity (modelled incentive distortion)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'scorecard-integrity',
    description: 'Per-scorecard modelled effort under the declared incentive model: genuine value against first-best, cosmetic (gaming) share, Goodhart index, the frozen prediction, the recorded observation and its error. Opaque scorecard codes only — NO task names, NO objective text, NO observation notes and NO person identifiers.',
  },
  {
    // CSV scope #43 (Schema v48): aggregate successful automation telemetry by
    // types only. No transaction-level row codes or workspace IDs are exported.
    key: 'propagationLineage',
    label: 'Successful propagation lineage (counts and types only)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'propagation-lineage',
    description: 'Aggregated rule-step counts by source/event/rule and changed module/entity/link types. Includes counts of transactions, rule steps, created/updated/removed records, added typed links, emitted events and omissions. NO transaction IDs, revisions, timestamps, entity IDs, titles, names, summaries, notes, score inputs or record bodies.',
  },
  {
    // CSV scope #44 (Schema v50, Implementation Fidelity Ledger). Delivery
    // telemetry at the plan grain: opaque plan codes, the intervention type,
    // the declared denominators, the five derived stage ratios, the multiplied
    // exposure, the grade, coverage, attestation-agreement counts and the
    // attached impact study's frozen implementation reading. No plan titles, no
    // attestation notes, no intervention labels, no names and no IDs.
    key: 'fidelity',
    label: 'Implementation fidelity (opaque plan codes, no free text)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'implementation-fidelity',
    description: 'Per-plan delivery telemetry under opaque sequential codes: intervention type, declared population and planned units, window length, the derived reach/dose/quality/sustain ratios, the multiplied exposure, the weighted fidelity index, evidence coverage, the grade id, attested-versus-recorded agreement counts (concordant, optimistic, conservative), overdue checkpoint count, settlement state, and — when the plan informs a scored impact study — the frozen implementation snapshot (exposure, index, and the Bloom-adjusted per-complier effect). NO plan titles, NO intervention labels, NO attestation notes, NO free text and NO record identifiers. Delivery, not effectiveness; a rule trace is never counted as delivery.',
  },
  {
    // CSV scope #45 (Schema v51, Merit & Pay-Equity Terminal). Ratios, counts
    // and model outputs at the cycle grain. Absolute salaries are deliberately
    // excluded: a pay figure is the most sensitive content this workspace holds,
    // and every question this scope answers — band integrity, the decomposition,
    // the four-fifths screen, budget use — is answerable in percentages.
    key: 'merit',
    label: 'Merit & pay equity (ratios and counts, no salaries)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'merit-pay-equity',
    description: 'Per-cycle compensation telemetry under opaque cycle codes: status, currency, budget kind and its share of payroll, spend and budget use, row counts with and without pay, band integrity counts and mean compa-ratio per level, the Oaxaca–Blinder gap/explained/unexplained percentages with the interval on the adjusted gap, the four-fifths ratio and flag, compression and external-premium counts, modelled expected departures and replacement exposure, and the calibration Brier score with its base rate. NO salaries, NO absolute pay figures, NO person names, NO notes, NO cycle labels and NO record identifiers.',
  },
  {
    key: 'transition',
    label: 'Workforce transition (ratios and counts, never a named exit)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'workforce-transition',
    description: 'Per-programme transition telemetry under opaque programme codes: status, kind, declared headcount target and cost ceiling presence, named-exit and unpriced counts, aggregate cash cost and replacement exposure, capability-lost percentage, the selection-screen group count, comparability ratio, threshold, reliability and flag (never group labels or group sizes), the cheapest compliant swap count and its cost delta, weight-robustness core/knife-edge counts and draw count, sole-holder blocker and hand-over counts, survivor load medians and flagged count, the Pareto-frontier path names or a single-dominant marker (never a recommendation), and the resolved-prediction count. NO person names, NO person identifiers, NO group codes, NO notes, NO programme labels, NO individual exit cost, NO individual departure probability and NO protected characteristic.',
  },
  {
    key: 'orgdesign',
    label: 'Structural design (counts and ratios, never a name)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'structural-design',
    description: 'Per-design structural telemetry under opaque design codes: status, move count, declared span band and coordination hours, people moving, layers before and after, max span before and after, units over band before and after, coordination channels and hours before and after, priced share of channels, annual coordination cost presence and magnitude, measured manager count, median service days, median measured P80 wait, modelled median P80 wait, the Pareto frontier marker and the scored median absolute percentage error with its scored-manager count. NO person names, NO person identifiers, NO manager identifiers, NO design labels, NO purpose text, NO notes, NO individual pay and NO individual wait.',
  },
  {
    key: 'voi',
    label: 'Information value (decision frames & investigations)',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'information-value',
    description: 'Telemetry at the grain of one decision frame and one investigation, under opaque positional codes: frame status, declared state and option counts, priced cell count and share, the probability sum, whether the arithmetic was refused and why (a machine code, not free text), EVPI as a share of the declared stake, whether a near-tie was detected, whether the expected-value and minimax-regret choices disagree, investigation count, open and overdue counts, each investigation status with its declared sensitivity, specificity, cost and realised likelihood ratio, EVSI and net value as shares of the EVPI ceiling, the break-even sensitivity, the concentration index and the count of frames that flip under the declared premise stress. NO labels, NO question text, NO free notes, NO person names or identifiers, NO premise titles, NO currency amounts and NO individual payoff — a frame is exported as D01, D02 and an investigation as D01-I01.',
  },
  {
    key: 'autopilot',
    label: 'Operating agreements (governance telemetry)',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'operating-agreements',
    description: 'Governance telemetry at the grain of one operating agreement, under opaque positional codes: status, source module, trigger event, version, condition and action counts, action vocabulary used, activation budget used and allowed, lifetime matched events, and retained runs by outcome. NO agreement names, NO purpose text, NO condition values, NO action text, NO record identifiers and NO person names — an agreement is exported as G01.',
  },
  {
    key: 'attention',
    label: 'Attention market (weekly allocation telemetry)',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'attention-market',
    description: 'Derived telemetry at the grain of one committed plan, under opaque positional codes: the plan status, the currency code, the budget, the allocated and unspent hours, whether the budget bound, the price of the next hour, the search mode, the gap to the bound, the count of obligations bought, handed off and knowingly forgone, the priced and unpriced counts and hours, the priceable share of the queue, the delegate-pool capacity, load and Lagrangian price, and, once reviewed, the attainment share, the realised and contradicted counts and the Brier score. NO plan labels, NO obligation titles, NO record identifiers, NO person names and NO absolute money amounts — a plan is exported as P01 and its obligations are counts only.',
  },
  {
    key: 'signalPath',
    label: 'Signal path (escalation channel telemetry)',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'signal-path',
    description: 'Channel telemetry at the grain of one declared event class, under opaque positional codes: status, currency code, hop count, declared reach, false-alarm rate, conditional lag in days, information carried and source information in bits, blind-floor verdict, declared prior and horizon, expected-loss ratio, whether the prediction is frozen, and — once probes settle — settled event and quiet probe counts, observed delivery count, observed lag median, the d-prime reading and the Brier score. NO class labels, NO origin or owner names, NO case titles, NO record identifiers and NO absolute money amounts — a class is exported as S01 and its exposure as a ratio against the declared prior.',
  },
  {
    key: 'performance',
    label: 'Performance recovery (due-process audit)',
    group: 'people',
    sensitive: true,
    filenameSlug: 'performance-recovery',
    description: 'One row per performance concern, under opaque codes: the concern code, the person code, status, where and when the expectation was recorded, the observation count, how many are inside the evidence window and specific enough to answer, distinct dates, conversation and support counts, the diagnosed cause and its confidence, the six due-process verdicts as a met-count, whether a formal plan is supported, the frozen probability and its scored outcome, and the carrying cost as a daily figure. NO concern labels, NO person names, NO observation text, NO conversation notes, NO support notes and NO override text — a concern is exported as PC01 and a person as P01. The free text is where a person is described; it does not leave the workspace in a spreadsheet.',
  },
  {
    key: 'survival',
    label: 'Delivery survival (time-to-finish statistics)',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'delivery-survival',
    description: 'One row per class of dated work, under an opaque class code: the item count, completions, abandonments and censored (still-open) items, the Kaplan–Meier median time to any exit, the Aalen–Johansen completion incidence at 50% and its bracket, the abandonment share of exits, the empirical hazard per elapsed-time bucket, the bucket rate ratio with its interval, and the declared-versus-actual effort ratio with its exact sign-test p-value. NO item titles, NO record identifiers, NO person names, NO owner references and NO source routes — a class is exported as C01 and every figure is an aggregate over at least the declared at-risk floor.',
  },
  {
    // CSV scope #54 (Schema v64).
    key: 'waitcost',
    label: 'Cost of waiting (delay-pricing aggregates)',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'cost-of-waiting',
    description: 'One row per class of work × currency plus one ALL row per currency, under opaque class codes: open, priced, overdue-priced and unpriced-overdue item counts, the weekly exposure and its overdue share, the top-item concentration share within the currency, and for each declared scenario horizon the legacy endpoint-only LOWER BOUND (header `scenario_Xw_expected` retained for compatibility) with the number of items the curve could answer. The field is NOT expected time-integrated carrying cost; the Consequence Lab computes that separately. Scenario figures are blanked below the declared at-risk floor. NO item titles, NO record identifiers, NO owner references, NO person names and NO source routes — a class is exported as C01 and money only in its three-letter currency code.',
  },
  {
    // CSV scope #55 (Schema v65).
    key: 'parity',
    label: 'Leadership parity & standard consistency (channel aggregates)',
    group: 'operational',
    sensitive: false,
    filenameSlug: 'leadership-parity',
    description: 'Aggregate self-audit rows only: one row per managerial-capital channel (C-COACH, C-FEEDBACK, C-AUTH, C-SPONSOR) plus team-level PROMISE-LEDGER and STANDARD-AUDIT summary rows. Exports post-ramp eligible headcount, finite-sample-corrected Gini, Atkinson (ε=0.5), additive Theil T, within-cohort disparity vs between-cohort variety, team leader-promise fulfillment with 95% Wilson bounds, and standard-consistency inversion counts. NO person names, NO person IDs, NO concern/review IDs and NO item titles — figures below the declared team/sample floors are left blank, never zero.',
  },
  {
    // CSV scope #56 (Schema v66, Evidence Terminal). Two blocks of aggregates
    // under opaque positional codes: one row per pooled (intervention ×
    // outcome) cell and one row per resolved-probability source. A cell that
    // has not reached the pooling floor exports its counts and a blank pooled
    // estimate — a count is not a finding, and a blank is not a zero.
    key: 'evidence',
    label: 'Evidence synthesis (pooled aggregates, no study content)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'evidence-synthesis',
    description: 'Per-cell meta-analysis telemetry under opaque codes: intervention code (IT01..) and outcome code (OB01..), study and pre-registered counts, replication and independent-result counts, the random-effects pooled estimate with the wider of the DerSimonian–Laird and Hartung–Knapp interval, τ², Q with its p-value, I², the Egger intercept flag, the verdict code and the priced value of one more trial. Then one row per resolved-prediction source (RS01..): resolved count, realised rate with Wilson bounds, Brier against the base-rate reference, skill, and calibration-in-the-large z. NO study titles, NO hypotheses, NO outcome notes, NO person names, NO person identifiers, NO case or decision identifiers and NO free text of any kind. Below the declared floors the statistic is blank, never zero.',
  },
  {
    // CSV scope #57 (Schema v67). No decision titles, IDs, person fields,
    // context links or individual forecasts: aggregates by horizon × currency.
    key: 'consequences',
    label: 'Decision consequences (aggregate future and calibration telemetry)',
    group: 'analytics',
    sensitive: false,
    filenameSlug: 'decision-consequences',
    description: 'One aggregate row per frozen horizon × currency (UNPRICED is its own bucket): frozen, priced, graded and graph-cap counts. Mean probability, mean Brier, expected money and graph reach are BLANK below five records in their relevant bucket, never zero. NO decision title, ID, person, note, stakeholder stance, source edge or individual prediction. Opaque aggregates are not a guarantee of anonymity.',
  },
];

function personLookup(state) {
  const map = new Map();
  for (const p of state.people || []) map.set(p.id, p.name);
  return (id) => (id ? map.get(id) || '' : '');
}

function buildScopeTable(state, scope, now) {
  const nameOf = personLookup(state);
  const today = dayKey(now);

  switch (scope) {
    case 'people': {
      const columns = [
        { key: 'person_id', header: 'person_id' },
        { key: 'name', header: 'name' },
        { key: 'role', header: 'role' },
        { key: 'level', header: 'level' },
        { key: 'team', header: 'team' },
        { key: 'manager_id', header: 'manager_id' },
        { key: 'status', header: 'status' },
        { key: 'start_date', header: 'start_date' },
        { key: 'archived_at', header: 'archived_at' },
        { key: 'focus', header: 'focus' },
        { key: 'talking_points', header: 'talking_points' },
      ];
      const rows = (state.people || []).map((p) => ({
        person_id: p.id,
        name: p.name,
        role: p.role,
        level: p.level || '',
        team: p.team || '',
        manager_id: p.managerId,
        status: p.status,
        start_date: p.startDate,
        archived_at: p.archivedAt ? p.archivedAt.slice(0, 10) : null,
        focus: p.focus,
        talking_points: (p.talkingPoints || []).join('; '),
      }));
      return { columns, rows };
    }

    case 'onboarding': {
      const columns = [
        { key: 'plan_id', header: 'plan_id' },
        { key: 'plan_kind', header: 'plan_kind' },
        { key: 'plan_label', header: 'plan_label' },
        { key: 'person_id', header: 'person_id' },
        { key: 'person_name', header: 'person_name' },
        { key: 'start_date', header: 'start_date' },
        { key: 'status', header: 'status' },
        { key: 'completed_on', header: 'completed_on' },
        { key: 'buddy_name', header: 'buddy_name' },
        { key: 'role_clarity', header: 'role_clarity' },
        { key: 'early_win', header: 'early_win' },
        { key: 'stakeholders_met', header: 'stakeholders_met' },
        { key: 'stakeholders_total', header: 'stakeholders_total' },
        { key: 'day30_checkin_on', header: 'day30_checkin_on' },
        { key: 'day60_checkin_on', header: 'day60_checkin_on' },
        { key: 'day90_checkin_on', header: 'day90_checkin_on' },
        { key: 'checkpoint_id', header: 'checkpoint_id' },
        { key: 'horizon_days', header: 'horizon_days' },
        { key: 'category', header: 'category' },
        { key: 'checkpoint_title', header: 'checkpoint_title' },
        { key: 'checkpoint_due', header: 'checkpoint_due' },
        { key: 'checkpoint_done', header: 'checkpoint_done' },
        { key: 'checkpoint_completed_on', header: 'checkpoint_completed_on' },
        { key: 'checkpoint_notes', header: 'checkpoint_notes' },
      ];
      const rows = [];
      for (const plan of state.onboarding || []) {
        const buddyDisplay = plan.buddyId ? (nameOf(plan.buddyId) || plan.buddyName || '') : (plan.buddyName || '');
        const stakeholders = plan.stakeholders || [];
        const base = {
          plan_id: plan.id,
          plan_kind: planKind(plan),
          plan_label: plan.label || '',
          person_id: plan.personId,
          person_name: nameOf(plan.personId),
          start_date: plan.startDate,
          status: plan.status,
          completed_on: plan.completedOn,
          buddy_name: buddyDisplay,
          role_clarity: plan.roleClarity,
          early_win: plan.earlyWin,
          stakeholders_met: stakeholders.filter((s) => s.met).length,
          stakeholders_total: stakeholders.length,
          day30_checkin_on: plan.reviews?.[30]?.heldOn || null,
          day60_checkin_on: plan.reviews?.[60]?.heldOn || null,
          day90_checkin_on: plan.reviews?.[90]?.heldOn || null,
        };
        const cps = plan.checkpoints || [];
        if (!cps.length) {
          rows.push({
            ...base,
            checkpoint_id: null,
            horizon_days: null,
            category: null,
            checkpoint_title: null,
            checkpoint_due: null,
            checkpoint_done: null,
            checkpoint_completed_on: null,
            checkpoint_notes: null,
          });
        } else {
          for (const cp of cps) {
            rows.push({
              ...base,
              checkpoint_id: cp.id,
              horizon_days: cp.horizon,
              category: cp.category,
              checkpoint_title: cp.title,
              checkpoint_due: cp.due,
              checkpoint_done: Boolean(cp.done),
              checkpoint_completed_on: cp.completedOn,
              checkpoint_notes: cp.notes,
            });
          }
        }
      }
      return { columns, rows };
    }

    case 'oneOnOnes': {
      const columns = [
        { key: 'meeting_id', header: 'meeting_id' },
        { key: 'date', header: 'date' },
        { key: 'person_id', header: 'person_id' },
        { key: 'person_name', header: 'person_name' },
        { key: 'status', header: 'status' },
        { key: 'mood', header: 'mood' },
        { key: 'agenda_topics', header: 'agenda_topics' },
        { key: 'notes', header: 'notes' },
        { key: 'open_actions', header: 'open_actions' },
        { key: 'completed_actions', header: 'completed_actions' },
        { key: 'carried_in', header: 'carried_in' },
        { key: 'carried_out', header: 'carried_out' },
        { key: 'dropped_actions', header: 'dropped_actions' },
      ];
      const rows = (state.oneOnOnes || [])
        .slice()
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .map((m) => {
          const actions = m.actions || [];
          return {
            meeting_id: m.id,
            date: m.date,
            person_id: m.personId,
            person_name: nameOf(m.personId),
            status: m.status,
            mood: m.mood,
            agenda_topics: (m.agenda || []).map((item) => item.text).filter(Boolean).join('; '),
            notes: m.notes,
            // A promise that was carried forward or dropped is not open: the
            // successor (or the decision) is the live record.
            open_actions: actions.filter(isOpenAction).length,
            completed_actions: actions.filter((a) => a.done).length,
            carried_in: actions.filter((a) => a.carriedFrom).length,
            carried_out: actions.filter((a) => !a.done && !a.dropped && a.carriedToMeetingId).length,
            dropped_actions: actions.filter((a) => a.dropped).length,
          };
        });
      return { columns, rows };
    }

    case 'actions': {
      const columns = [
        { key: 'source_type', header: 'source_type' },
        { key: 'source_id', header: 'source_id' },
        { key: 'source_date', header: 'source_date' },
        { key: 'person_id', header: 'person_id' },
        { key: 'person_name', header: 'person_name' },
        { key: 'commitment', header: 'commitment' },
        { key: 'due_on', header: 'due_on' },
        { key: 'owner', header: 'owner' },
        { key: 'done', header: 'done' },
        { key: 'completed_on', header: 'completed_on' },
        { key: 'state', header: 'state' },
        { key: 'carried_forward_count', header: 'carried_forward_count' },
        { key: 'first_agreed_on', header: 'first_agreed_on' },
        { key: 'confirmed_in_meeting', header: 'confirmed_in_meeting' },
        { key: 'linked_delegation_id', header: 'linked_delegation_id' },
        { key: 'source_checkin_id', header: 'source_checkin_id' },
        { key: 'source_plan_id', header: 'source_plan_id' },
        { key: 'source_horizon', header: 'source_horizon' },
        { key: 'source_held_on', header: 'source_held_on' },
        { key: 'carried_from_id', header: 'carried_from_id' },
      ];
      const rows = [];
      const followThrough = followThroughIndex(state);
      for (const m of state.oneOnOnes || []) {
        for (const a of m.actions || []) {
          const info = followThrough.get(`${m.id}|${a.id}`) || { depth: 0, firstAgreedOn: m.date };
          rows.push({
            source_type: '1:1 action',
            source_id: m.id,
            source_date: m.date,
            person_id: m.personId,
            person_name: nameOf(m.personId),
            commitment: a.text,
            due_on: a.due,
            // Empty, not a guess: only 1:1 actions carry a recorded owner, and
            // an unrecorded one stays blank in the export too.
            owner: a.owner || null,
            done: Boolean(a.done),
            completed_on: a.completedOn,
            state: a.done ? 'done' : a.dropped ? 'dropped' : a.carriedToMeetingId ? 'carried-forward' : 'open',
            carried_forward_count: info.depth,
            first_agreed_on: info.firstAgreedOn,
            confirmed_in_meeting: a.completedInMeetingId || null,
          });
        }
      }
      const supportLookup = new Map((state.managerSupport || []).map((record) => [record.id, record]));
      for (const record of state.managerSupport || []) {
        let origin = record;
        let carriedForwardCount = 0;
        const seen = new Set([record.id]);
        while (origin.carriedFromId && supportLookup.has(origin.carriedFromId) && !seen.has(origin.carriedFromId)) {
          origin = supportLookup.get(origin.carriedFromId);
          seen.add(origin.id);
          carriedForwardCount += 1;
        }
        rows.push({
          source_type: 'Manager support',
          source_id: record.id,
          source_date: record.addedOn,
          person_id: record.personId,
          person_name: nameOf(record.personId),
          commitment: record.text,
          due_on: record.due,
          owner: 'leader',
          done: record.status === 'done',
          completed_on: record.completedOn,
          state: record.status === 'carried' ? 'carried-forward' : record.status,
          carried_forward_count: carriedForwardCount,
          first_agreed_on: origin.addedOn,
          confirmed_in_meeting: record.completedInMeetingId || null,
          source_checkin_id: record.sourceCheckinId,
          source_plan_id: record.sourcePlanId,
          source_horizon: record.sourceHorizon,
          source_held_on: record.sourceHeldOn,
          carried_from_id: record.carriedFromId,
        });
      }
      for (const p of state.growthPlans || []) {
        const chain = willIndex(p);
        for (const w of p.will || []) {
          const info = chain.get(w.id) || { depth: 0, firstAgreedOn: w.addedOn || null };
          rows.push({
            source_type: 'GROW commitment',
            source_id: p.id,
            source_date: (p.createdAt || '').slice(0, 10) || null,
            person_id: p.personId,
            person_name: nameOf(p.personId),
            commitment: w.text,
            due_on: w.due,
            done: Boolean(w.done),
            completed_on: w.completedOn,
            state: w.done ? 'done' : w.dropped ? 'dropped' : w.carriedToId ? 'carried-forward' : 'open',
            carried_forward_count: info.depth,
            first_agreed_on: info.firstAgreedOn,
            confirmed_in_meeting: null,
            linked_delegation_id: w.delegationId || null,
          });
        }
      }
      for (const f of state.feedback || []) {
        if (!f.followUpOn && !f.followUpDone) continue;
        rows.push({
          source_type: 'Feedback follow-up',
          source_id: f.id,
          source_date: f.date,
          person_id: f.personId,
          person_name: nameOf(f.personId),
          commitment: f.situation ? `Follow up: ${f.situation}` : `Follow up on ${f.kind} feedback`,
          due_on: f.followUpOn,
          done: Boolean(f.followUpDone),
          completed_on: f.followUpCompletedOn,
        });
      }
      for (const plan of state.onboarding || []) {
        const kind = planKind(plan);
        const sourcePrefix = kind === 'role-transition'
          ? 'Role transition'
          : kind === 'reboarding'
            ? 'Return to work'
            : 'Onboarding';
        for (const cp of plan.checkpoints || []) {
          rows.push({
            source_type: `${sourcePrefix} Day ${cp.horizon}`,
            source_id: plan.id,
            source_date: plan.startDate,
            person_id: plan.personId,
            person_name: nameOf(plan.personId),
            commitment: cp.title,
            due_on: cp.due,
            done: Boolean(cp.done),
            completed_on: cp.completedOn,
          });
        }
      }
      return { columns, rows };
    }

    case 'feedback': {
      const columns = [
        { key: 'feedback_id', header: 'feedback_id' },
        { key: 'date', header: 'date' },
        { key: 'observed_on', header: 'observed_on' },
        { key: 'latency_days', header: 'latency_days' },
        { key: 'latency_status', header: 'latency_status' },
        { key: 'person_id', header: 'person_id' },
        { key: 'person_name', header: 'person_name' },
        { key: 'direction', header: 'direction' },
        { key: 'kind', header: 'kind' },
        { key: 'situation', header: 'situation' },
        { key: 'behavior', header: 'behavior' },
        { key: 'impact', header: 'impact' },
        { key: 'tags', header: 'tags' },
        { key: 'follow_up_on', header: 'follow_up_on' },
        { key: 'follow_up_done', header: 'follow_up_done' },
        { key: 'follow_up_completed_on', header: 'follow_up_completed_on' },
      ];
      const rows = (state.feedback || [])
        .slice()
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .map((f) => {
          const lat = feedbackLatency(f);
          const latencyStatus = f.direction !== 'given'
            ? 'not-applicable'
            : lat.status === 'measured'
              ? 'measured'
              : lat.status === 'invalid'
                ? 'invalid-order'
                : 'unmeasured';
          return {
            feedback_id: f.id,
            date: f.date,
            observed_on: f.observedOn,
            latency_days: f.direction === 'given' && lat.status === 'measured' ? lat.days : null,
            latency_status: latencyStatus,
            person_id: f.personId,
            person_name: nameOf(f.personId),
            direction: f.direction,
            kind: f.kind,
            situation: f.situation,
            behavior: f.behavior,
            impact: f.impact,
            tags: (f.tags || []).join('; '),
            follow_up_on: f.followUpOn,
            follow_up_done: Boolean(f.followUpDone),
            follow_up_completed_on: f.followUpCompletedOn,
          };
        });
      return { columns, rows };
    }

    case 'goals': {
      const columns = [
        { key: 'goal_id', header: 'goal_id' },
        { key: 'source_review_id', header: 'source_review_id' },
        { key: 'goal_title', header: 'goal_title' },
        { key: 'scope', header: 'scope' },
        { key: 'owner_id', header: 'owner_id' },
        { key: 'owner_name', header: 'owner_name' },
        { key: 'co_authored', header: 'co_authored' },
        { key: 'status', header: 'status' },
        { key: 'confidence', header: 'confidence' },
        { key: 'due_date', header: 'due_date' },
        { key: 'completed_on', header: 'completed_on' },
        { key: 'goal_progress_pct', header: 'goal_progress_pct' },
        { key: 'checkin_count', header: 'checkin_count' },
        { key: 'last_checkin_on', header: 'last_checkin_on' },
        { key: 'kr_id', header: 'kr_id' },
        { key: 'kr_title', header: 'kr_title' },
        { key: 'kr_start', header: 'kr_start' },
        { key: 'kr_target', header: 'kr_target' },
        { key: 'kr_current', header: 'kr_current' },
        { key: 'kr_unit', header: 'kr_unit' },
      ];
      const rows = [];
      for (const g of state.goals || []) {
        const progress = goalProgress(g);
        const checkins = (g.checkins || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const lastCheckin = checkins.length ? checkins[checkins.length - 1].date : null;
        const base = {
          goal_id: g.id,
          source_review_id: g.sourceReviewId,
          goal_title: g.title,
          scope: g.scope,
          owner_id: g.ownerId,
          owner_name: nameOf(g.ownerId),
          co_authored: g.coAuthored === true ? 'yes' : g.coAuthored === false ? 'no' : null,
          status: g.status,
          confidence: g.confidence,
          due_date: g.dueDate,
          completed_on: g.completedOn,
          goal_progress_pct: progress,
          checkin_count: checkins.length,
          last_checkin_on: lastCheckin,
        };
        if (!(g.keyResults || []).length) {
          rows.push({
            ...base,
            kr_id: null,
            kr_title: null,
            kr_start: null,
            kr_target: null,
            kr_current: null,
            kr_unit: null,
          });
        } else {
          for (const kr of g.keyResults) {
            rows.push({
              ...base,
              kr_id: kr.id,
              kr_title: kr.title,
              kr_start: kr.start,
              kr_target: kr.target,
              kr_current: kr.current,
              kr_unit: kr.unit,
            });
          }
        }
      }
      return { columns, rows };
    }

    case 'delegations': {
      const columns = [
        { key: 'delegation_id', header: 'delegation_id' },
        { key: 'person_id', header: 'person_id' },
        { key: 'person_name', header: 'person_name' },
        { key: 'title', header: 'title' },
        { key: 'authority_level', header: 'authority_level' },
        { key: 'status', header: 'status' },
        { key: 'delegated_on', header: 'delegated_on' },
        { key: 'due_on', header: 'due_on' },
        { key: 'last_checkin_on', header: 'last_checkin_on' },
        { key: 'last_progress', header: 'last_progress' },
        { key: 'completed_on', header: 'completed_on' },
        { key: 'returned_on', header: 'returned_on' },
        { key: 'expected_outcome', header: 'expected_outcome' },
        { key: 'support', header: 'support' },
        { key: 'completion_or_return_note', header: 'completion_or_return_note' },
        { key: 'linked_growth_plan_id', header: 'linked_growth_plan_id' },
        { key: 'prior_delegation_id', header: 'prior_delegation_id' },
        { key: 'superseded_by_delegation_id', header: 'superseded_by_delegation_id' },
        { key: 'recovered_on', header: 'recovered_on' },
        { key: 'recovery_note', header: 'recovery_note' },
        { key: 'attempt_number', header: 'attempt_number' },
        { key: 'source_negotiation_id', header: 'source_negotiation_id' },
        { key: 'source_term_id', header: 'source_term_id' },
      ];
      const rows = (state.delegations || []).map((d) => {
        const sortedCheckins = (d.checkins || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const latest = sortedCheckins.length ? sortedCheckins[sortedCheckins.length - 1] : null;
        const link = growthLinkForDelegation(state, d.id);
        const lineage = deriveDelegationLineage(state, d.id);
        return {
          delegation_id: d.id,
          person_id: d.personId,
          person_name: nameOf(d.personId),
          title: d.title,
          authority_level: d.authority,
          status: d.status,
          delegated_on: d.delegatedOn,
          due_on: d.dueOn,
          last_checkin_on: latest ? latest.date : null,
          last_progress: latest ? latest.progress : null,
          completed_on: d.completedOn,
          returned_on: d.returnedOn,
          expected_outcome: d.expectedOutcome,
          support: d.support,
          completion_or_return_note: d.status === 'returned' ? d.returnReason : d.completionNote,
          linked_growth_plan_id: link?.plan?.id || null,
          prior_delegation_id: d.priorDelegationId || null,
          superseded_by_delegation_id: d.supersededByDelegationId || null,
          recovered_on: d.recoveredOn || null,
          recovery_note: d.recoveryNote || null,
          attempt_number: lineage.attemptNumber,
          source_negotiation_id: d.sourceNegotiationId || null,
          source_term_id: d.sourceTermId || null,
        };
      });
      return { columns, rows };
    }

    case 'growthPlans': {
      const columns = [
        { key: 'plan_id', header: 'plan_id' },
        { key: 'source_review_id', header: 'source_review_id' },
        { key: 'person_id', header: 'person_id' },
        { key: 'person_name', header: 'person_name' },
        { key: 'status', header: 'status' },
        { key: 'created_on', header: 'created_on' },
        { key: 'review_on', header: 'review_on' },
        { key: 'closed_on', header: 'closed_on' },
        { key: 'goal', header: 'goal' },
        { key: 'reality', header: 'reality' },
        { key: 'options_count', header: 'options_count' },
        { key: 'will_total', header: 'will_total' },
        { key: 'will_completed', header: 'will_completed' },
        { key: 'will_open', header: 'will_open' },
        { key: 'will_carried', header: 'will_carried' },
        { key: 'will_dropped', header: 'will_dropped' },
        { key: 'will_linked_delegations', header: 'will_linked_delegations' },
        { key: 'reviews_held', header: 'reviews_held' },
        { key: 'last_reviewed_on', header: 'last_reviewed_on' },
        { key: 'review_deferrals', header: 'review_deferrals' },
        { key: 'competencies', header: 'competencies' },
      ];
      const rows = (state.growthPlans || []).map((p) => {
        // `will_total` stays the number of rows on record; the split below is
        // what the leader can act on and is never derived from a guess.
        const will = p.will || [];
        const live = will.filter((w) => !w.carriedToId);
        const open = live.filter((w) => !w.done && !w.dropped);
        const reviews = (p.reviews || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
        return {
          plan_id: p.id,
          source_review_id: p.sourceReviewId,
          person_id: p.personId,
          person_name: nameOf(p.personId),
          status: p.status,
          created_on: (p.createdAt || '').slice(0, 10) || null,
          review_on: p.reviewOn,
          closed_on: p.closedOn,
          goal: p.goal,
          reality: p.reality,
          options_count: (p.options || []).length,
          will_total: will.length,
          will_completed: will.filter((w) => w.done).length,
          will_open: open.length,
          will_carried: will.filter((w) => w.carriedToId).length,
          will_dropped: will.filter((w) => w.dropped).length,
          will_linked_delegations: live.filter((w) => !w.dropped && w.delegationId).length,
          reviews_held: (p.reviews || []).length,
          last_reviewed_on: reviews[0]?.date || null,
          review_deferrals: p.reviewDeferrals || 0,
          competencies: (p.competencies || []).join('; '),
        };
      });
      return { columns, rows };
    }

    case 'recognition': {
      const columns = [
        { key: 'recognition_id', header: 'recognition_id' },
        { key: 'date', header: 'date' },
        { key: 'person_id', header: 'person_id' },
        { key: 'person_name', header: 'person_name' },
        { key: 'visibility', header: 'visibility' },
        { key: 'what', header: 'what' },
        { key: 'values', header: 'values' },
      ];
      const rows = (state.recognition || [])
        .slice()
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .map((r) => ({
          recognition_id: r.id,
          date: r.date,
          person_id: r.personId,
          person_name: nameOf(r.personId),
          visibility: r.visibility === 'public' ? 'public' : 'private',
          what: r.what,
          values: (r.values || []).join('; '),
        }));
      return { columns, rows };
    }

    case 'readiness': {
      const columns = [
        { key: 'readiness_id', header: 'readiness_id' },
        { key: 'seat', header: 'seat' },
        { key: 'person_id', header: 'person_id' },
        { key: 'person_name', header: 'person_name' },
        { key: 'person_role', header: 'person_role' },
        { key: 'rating', header: 'rating' },
        { key: 'rating_label', header: 'rating_label' },
        { key: 'evidence_supported', header: 'evidence_supported' },
        { key: 'evidence_met_count', header: 'evidence_met_count' },
        { key: 'evidence_total', header: 'evidence_total' },
        { key: 'active_transition_label', header: 'active_transition_label' },
        { key: 'warning', header: 'warning' },
        { key: 'notes', header: 'notes' },
        { key: 'updated_on', header: 'updated_on' },
      ];
      const peopleById = new Map((state.people || []).map((p) => [p.id, p]));
      const rows = (state.readiness || [])
        .slice()
        .sort((a, b) => String(a.seat || '').localeCompare(String(b.seat || '')) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
        .map((rec) => {
          const person = peopleById.get(rec.personId) || null;
          const assessment = assess(state, rec.personId, now, state.settings, rec.seat);
          const activeTransition = (state.onboarding || []).find(
            (p) => p.personId === rec.personId && p.status === 'active' && planKind(p) === 'role-transition',
          );
          return {
            readiness_id: rec.id,
            seat: rec.seat || '',
            person_id: rec.personId,
            person_name: nameOf(rec.personId),
            person_role: person?.role || '',
            rating: rec.rating,
            rating_label: assessment.label,
            evidence_supported: Boolean(assessment.supported),
            evidence_met_count: assessment.evidence.metCount,
            evidence_total: EVIDENCE_DEFINITIONS.length,
            active_transition_label: activeTransition ? (activeTransition.label || 'Role transition') : null,
            warning: assessment.warning || null,
            notes: rec.notes || '',
            updated_on: (rec.updatedAt || '').slice(0, 10) || null,
          };
        });
      return { columns, rows };
    }

    case 'decisions': {
      const columns = [
        { key: 'decision_id', header: 'decision_id' },
        { key: 'date', header: 'date' },
        { key: 'title', header: 'title' },
        { key: 'question', header: 'question' },
        { key: 'reversibility', header: 'reversibility' },
        { key: 'driver', header: 'driver' },
        { key: 'approver', header: 'approver' },
        { key: 'contributors', header: 'contributors' },
        { key: 'informed', header: 'informed' },
        { key: 'chosen', header: 'chosen' },
        { key: 'rationale', header: 'rationale' },
        { key: 'forecast_probability_pct', header: 'forecast_probability_pct' },
        { key: 'brier_contribution', header: 'brier_contribution' },
        { key: 'review_on', header: 'review_on' },
        { key: 'reviewed_on', header: 'reviewed_on' },
        { key: 'outcome', header: 'outcome' },
        { key: 'outcome_notes', header: 'outcome_notes' },
      ];
      const rows = (state.decisions || [])
        .slice()
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .map((d) => ({
          decision_id: d.id,
          date: d.date,
          title: d.title,
          question: d.question,
          reversibility: d.reversibility,
          driver: d.driver,
          approver: d.approver,
          contributors: d.contributors,
          informed: d.informed,
          chosen: d.chosen,
          rationale: d.rationale,
          forecast_probability_pct: d.forecastProbability ?? '',
          brier_contribution: d.reviewedOn && d.forecastProbability !== null && d.forecastProbability !== undefined && OUTCOME_VALUES[d.outcome] !== undefined
            ? Math.round((((d.forecastProbability / 100) - OUTCOME_VALUES[d.outcome]) ** 2) * 10000) / 10000
            : '',
          review_on: d.reviewOn,
          reviewed_on: d.reviewedOn,
          outcome: d.outcome,
          outcome_notes: d.outcomeNotes,
        }));
      return { columns, rows };
    }

    case 'calibration': {
      // One row per scored (or unscorable) prediction. Decision rows carry the
      // stated probability vs the reviewed outcome with its Brier
      // contribution; estimate rows carry the funding-time forecast vs the
      // recorded actual; missing-actual rows make the evidence gap explicit
      // instead of silently absent.
      const columns = [
        { key: 'record_type', header: 'record_type' },
        { key: 'record_id', header: 'record_id' },
        { key: 'title', header: 'title' },
        { key: 'forecast_made_on', header: 'forecast_made_on' },
        { key: 'outcome_on', header: 'outcome_on' },
        { key: 'forecast', header: 'forecast' },
        { key: 'actual_or_outcome', header: 'actual_or_outcome' },
        { key: 'score', header: 'score' },
        { key: 'scored_against', header: 'scored_against' },
      ];
      const rows = [];
      for (const pair of decisionForecastPairs(state)) {
        rows.push({
          record_type: 'decision-forecast',
          record_id: pair.decisionId,
          title: pair.title,
          forecast_made_on: pair.date || '',
          outcome_on: pair.reviewedOn,
          forecast: `${Math.round(pair.p * 100)}%`,
          actual_or_outcome: pair.outcome,
          score: pair.brier,
          scored_against: 'brier (lower is better)',
        });
      }
      for (const pair of estimatePairs(state)) {
        rows.push({
          record_type: 'effort-estimate',
          record_id: pair.itemId,
          title: pair.title,
          forecast_made_on: '',
          outcome_on: pair.completedOn || '',
          forecast: `${pair.expected}d`,
          actual_or_outcome: `${pair.actual}d`,
          score: pair.ratio,
          scored_against: `${pair.source} ratio (1.0 is exact)`,
        });
      }
      for (const missing of missingActualItems(state)) {
        rows.push({
          record_type: 'missing-actual',
          record_id: missing.itemId,
          title: missing.title,
          forecast_made_on: '',
          outcome_on: missing.completedOn || '',
          forecast: `${missing.expected}d`,
          actual_or_outcome: 'not recorded',
          score: '',
          scored_against: 'unscorable until actuals are recorded',
        });
      }
      // Schema v22 case-cost ledger: one row per settled case, split by FAIR
      // leg — magnitude (realised vs assessed exposure) and frequency
      // (assessed probability vs materialisation, Brier-scored) — plus the
      // resolved cases whose forecasts remain unscored.
      for (const pair of caseCostPairs(state)) {
        if (pair.exposureRatio !== null) {
          rows.push({
            record_type: 'case-exposure',
            record_id: pair.caseId,
            title: pair.title,
            forecast_made_on: pair.openedOn || '',
            outcome_on: pair.settledOn || '',
            forecast: `${pair.currency} ${pair.costExpected}`,
            actual_or_outcome: `${pair.currency} ${pair.realisedExposure}`,
            score: pair.exposureRatio,
            scored_against: `${pair.source} ratio (1.0 is exact)`,
          });
        }
        if (pair.occurrenceBrier !== null) {
          rows.push({
            record_type: 'case-occurrence',
            record_id: pair.caseId,
            title: pair.title,
            forecast_made_on: pair.openedOn || '',
            outcome_on: pair.settledOn || '',
            forecast: `${Math.round(pair.assessedProbability * 100)}%`,
            actual_or_outcome: pair.materialised ? 'materialised' : 'did not materialise',
            score: pair.occurrenceBrier,
            scored_against: 'brier (lower is better)',
          });
        }
      }
      for (const missing of missingCaseActuals(state)) {
        rows.push({
          record_type: 'case-missing-actuals',
          record_id: missing.caseId,
          title: missing.title,
          forecast_made_on: '',
          outcome_on: missing.resolvedOn || '',
          forecast: missing.costExpected !== null ? `${missing.currency} ${missing.costExpected}` : '',
          actual_or_outcome: 'not recorded',
          score: '',
          scored_against: 'unscorable until settled actuals are recorded',
        });
      }

      // Session 38: ex-post deal values use the recorded agreement and its
      // explicit realised value, with no FX conversion and no invented savings.
      const negotiationCal = negotiationSettlementCalibration(state);
      for (const pair of negotiationCal.pairs) {
        rows.push({
          record_type: 'negotiation-settlement',
          record_id: pair.negotiationId,
          title: pair.title,
          forecast_made_on: pair.agreedOn || '',
          outcome_on: pair.settledOn || '',
          forecast: `${pair.currency} ${pair.agreedValue}`,
          actual_or_outcome: `${pair.currency} ${pair.realisedValue}`,
          score: pair.favorableVariancePct,
          scored_against: `${pair.direction}-direction variance % (positive is favorable)`,
        });
      }
      for (const cohort of negotiationCal.cohorts) {
        rows.push({
          record_type: 'negotiation-reference-class',
          record_id: cohort.cohortKey,
          title: `Settlement reference class · ${cohort.currency} · ${cohort.direction}`,
          forecast_made_on: '',
          outcome_on: cohort.pairs.at(-1)?.settledOn || '',
          forecast: `${cohort.n} comparable settlement(s)`,
          actual_or_outcome: cohort.verdict.label,
          score: cohort.sufficient ? cohort.medianShortfallPct : '',
          scored_against: cohort.sufficient
            ? `median directional shortfall %; P80 ${cohort.p80ShortfallPct}% · n=${cohort.n}`
            : `counts only below n=${CALIBRATION_MIN_SAMPLES} · n=${cohort.n}`,
        });
      }
      for (const missing of negotiationCal.missingItems) {
        rows.push({
          record_type: 'negotiation-missing-actual',
          record_id: missing.negotiationId,
          title: missing.title,
          forecast_made_on: '',
          outcome_on: missing.settledOn || '',
          forecast: '',
          actual_or_outcome: 'not comparable',
          score: '',
          scored_against: missing.reason,
        });
      }

      // Schema v24 fifth ledger: budget commitment accuracy. Ratios are
      // dimensionless and pool across currencies; the exported amount pair
      // always stays inside its own envelope currency.
      const commitCal = budgetCommitmentCalibration(state);
      for (const pair of commitCal.pairs) {
        rows.push({
          record_type: 'budget-commitment',
          record_id: pair.lineId,
          title: `${pair.budgetName}: ${pair.title}`,
          forecast_made_on: '',
          outcome_on: pair.spentOn || '',
          forecast: `${pair.currency} ${pair.committedAmount}`,
          actual_or_outcome: `${pair.currency} ${pair.actualAmount}`,
          score: pair.ratio,
          scored_against: 'actual/committed ratio (1.0 is exact)',
        });
      }
      if (commitCal.n) {
        rows.push({
          record_type: 'budget-reference-class',
          record_id: 'budget-commitments',
          title: 'Budget commitment reference class',
          forecast_made_on: '',
          outcome_on: commitCal.pairs.at(-1)?.spentOn || '',
          forecast: `${commitCal.n} scored commitment(s)`,
          actual_or_outcome: commitCal.sufficient
            ? `Median ${commitCal.medianRatio}x (P80 ${commitCal.p80Ratio}x)`
            : 'Counts only — no median until the floor is met',
          score: commitCal.sufficient ? commitCal.medianRatio : '',
          scored_against: commitCal.sufficient
            ? `median actual/committed ratio · n=${commitCal.n}`
            : `counts only below n=${commitCal.minSamples} · n=${commitCal.n}`,
        });
      }
      for (const missing of commitCal.missingItems) {
        rows.push({
          record_type: 'budget-missing-actual',
          record_id: missing.lineId,
          title: `${missing.budgetName}: ${missing.title}`,
          forecast_made_on: '',
          outcome_on: '',
          forecast: '',
          actual_or_outcome: 'not comparable',
          score: '',
          scored_against: missing.reason,
        });
      }
      return { columns, rows };
    }

    case 'reviews': {
      const columns = [
        { key: 'review_id', header: 'review_id' },
        { key: 'period_start', header: 'period_start' },
        { key: 'period_end', header: 'period_end' },
        { key: 'person_id', header: 'person_id' },
        { key: 'person_name', header: 'person_name' },
        { key: 'status', header: 'status' },
        { key: 'updated_on', header: 'updated_on' },
        { key: 'completed_on', header: 'completed_on' },
        { key: 'evidence_items', header: 'evidence_items' },
        { key: 'dated_evidence', header: 'dated_evidence' },
        { key: 'source_types', header: 'source_types' },
        { key: 'early_half_evidence', header: 'early_half_evidence' },
        { key: 'late_half_evidence', header: 'late_half_evidence' },
        { key: 'rating', header: 'rating' },
        { key: 'manager_achievements', header: 'manager_achievements' },
        { key: 'manager_development', header: 'manager_development' },
        { key: 'manager_next_steps', header: 'manager_next_steps' },
        { key: 'self_achievements', header: 'self_achievements' },
        { key: 'self_challenges', header: 'self_challenges' },
        { key: 'self_growth', header: 'self_growth' },
        { key: 'self_support', header: 'self_support' },
      ];
      const rows = (state.reviews || []).map((r) => {
        const evidence = r.status === 'complete' && Array.isArray(r.evidence) && r.evidence.length
          ? r.evidence
          : buildReviewEvidence(state, r.personId, r.periodStart, r.periodEnd);
        const summary = summarizeReviewEvidence(evidence, r.periodStart, r.periodEnd);
        return {
          review_id: r.id,
          period_start: r.periodStart,
          period_end: r.periodEnd,
          person_id: r.personId,
          person_name: nameOf(r.personId),
          status: r.status,
          updated_on: (r.updatedAt || '').slice(0, 10) || null,
          completed_on: r.completedAt ? r.completedAt.slice(0, 10) : null,
          evidence_items: summary.total,
          dated_evidence: summary.dated,
          source_types: summary.sourceTypes,
          early_half_evidence: summary.early,
          late_half_evidence: summary.late,
          rating: r.manager?.rating || null,
          manager_achievements: r.manager?.achievements || '',
          manager_development: r.manager?.development || '',
          manager_next_steps: r.manager?.nextSteps || '',
          self_achievements: r.selfReflection?.achievements || '',
          self_challenges: r.selfReflection?.challenges || '',
          self_growth: r.selfReflection?.growth || '',
          self_support: r.selfReflection?.support || '',
        };
      });
      return { columns, rows };
    }

    case 'pulseSummary': {
      const columns = [
        { key: 'week_start', header: 'week_start' },
        { key: 'week_end', header: 'week_end' },
        { key: 'responses_total', header: 'responses_total' },
        { key: 'usable_responses', header: 'usable_responses' },
        { key: 'incomplete_responses', header: 'incomplete_responses' },
        { key: 'min_required', header: 'min_required' },
        { key: 'privacy_status', header: 'privacy_status' },
        { key: 'blocked_reason', header: 'blocked_reason' },
        { key: 'overall_avg', header: 'overall_avg' },
        { key: 'safety_avg', header: 'safety_avg' },
        { key: 'clarity_avg', header: 'clarity_avg' },
        { key: 'workload_avg', header: 'workload_avg' },
        { key: 'growth_avg', header: 'growth_avg' },
        { key: 'comments_status', header: 'comments_status' },
        { key: 'released_comments', header: 'released_comments' },
      ];
      const pulseDates = (state.pulses || [])
        .map((p) => p.date)
        .filter((d) => d && d <= today)
        .sort();
      const rows = [];
      if (pulseDates.length > 0) {
        const firstWeek = weekStart(pulseDates[0]);
        const currentWeek = weekStart(today);
        for (let wk = firstWeek; wk <= currentWeek; wk = addDays(wk, 7)) {
          const wkEnd = addDays(wk, 6);
          const effectiveEnd = wkEnd > today ? today : wkEnd;
          const windowDays = wkEnd > today
            ? Math.max(1, Math.round((new Date(`${today}T00:00:00Z`) - new Date(`${wk}T00:00:00Z`)) / 86400000) + 1)
            : 7;
          const agg = aggregate(state, effectiveEnd, { windowDays });
          if (agg.n === 0) continue;
          const released = agg.blocked ? [] : comments(state, effectiveEnd, windowDays);
          const rawCommentCount = (state.pulses || []).filter(
            (p) => p.date >= wk && p.date <= effectiveEnd && (p.comment || '').trim().length > 0,
          ).length;
          const commentsStatus = rawCommentCount === 0
            ? 'none'
            : released.length > 0
              ? 'released'
              : 'suppressed';
          rows.push({
            week_start: wk,
            week_end: effectiveEnd,
            responses_total: agg.n,
            usable_responses: agg.usableResponses,
            incomplete_responses: agg.incompleteResponses,
            min_required: agg.minRequired,
            privacy_status: agg.blocked ? 'suppressed' : 'released',
            blocked_reason: agg.blockedReason,
            overall_avg: agg.blocked ? null : agg.overall,
            safety_avg: agg.blocked ? null : agg.dimensions.safety.avg,
            clarity_avg: agg.blocked ? null : agg.dimensions.clarity.avg,
            workload_avg: agg.blocked ? null : agg.dimensions.workload.avg,
            growth_avg: agg.blocked ? null : agg.dimensions.growth.avg,
            comments_status: commentsStatus,
            released_comments: released.length ? released.map((c) => c.comment).join(' | ') : null,
          });
        }
      }
      return { columns, rows };
    }

    case 'healthTrends': {
      const columns = [
        { key: 'period_start', header: 'period_start' },
        { key: 'period_end', header: 'period_end' },
        { key: 'status', header: 'status' },
        { key: 'overall_score', header: 'overall_score' },
        { key: 'coverage', header: 'coverage' },
        { key: 'fidelity', header: 'fidelity' },
        { key: 'cadence_score', header: 'cadence_score' },
        { key: 'feedback_score', header: 'feedback_score' },
        { key: 'clarity_score', header: 'clarity_score' },
        { key: 'growth_score', header: 'growth_score' },
        { key: 'wellbeing_score', header: 'wellbeing_score' },
        { key: 'wellbeing_status', header: 'wellbeing_status' },
        { key: 'feedback_latency_avg_days', header: 'feedback_latency_avg_days' },
        { key: 'feedback_latency_samples', header: 'feedback_latency_samples' },
        { key: 'delegation_follow_through_pct', header: 'delegation_follow_through_pct' },
        { key: 'delegation_evaluated', header: 'delegation_evaluated' },
      ];
      const trends = buildTeamTrends(state, now, { horizon: '12w' });
      const rows = trends.points.map((pt, idx) => {
        const lat = trends.latency.points[idx];
        const del = trends.delegations.points[idx];
        return {
          period_start: pt.periodStart,
          period_end: pt.periodEnd,
          status: pt.status,
          overall_score: pt.overall,
          coverage: pt.status === 'measured' ? pt.coverage : null,
          fidelity: pt.fidelity,
          cadence_score: pt.dimensions.cadence.score,
          feedback_score: pt.dimensions.feedback.score,
          clarity_score: pt.dimensions.clarity.score,
          growth_score: pt.dimensions.growth.score,
          wellbeing_score: pt.dimensions.wellbeing.score,
          wellbeing_status: pt.dimensions.wellbeing.status,
          feedback_latency_avg_days: lat.averageDays,
          feedback_latency_samples: lat.measured,
          delegation_follow_through_pct: del.followThroughPct,
          delegation_evaluated: del.evaluated,
        };
      });
      return { columns, rows };
    }

    case 'cases': {
      const columns = [
        { key: 'case_id', header: 'case_id' },
        { key: 'kind', header: 'kind' },
        { key: 'status', header: 'status' },
        { key: 'title', header: 'title' },
        { key: 'owner_name', header: 'owner_name' },
        { key: 'linked_goal', header: 'linked_goal' },
        { key: 'opened_on', header: 'opened_on' },
        { key: 'review_on', header: 'review_on' },
        { key: 'resolved_on', header: 'resolved_on' },
        { key: 'fmea_severity', header: 'fmea_severity' },
        { key: 'fmea_probability', header: 'fmea_probability' },
        { key: 'fmea_detectability', header: 'fmea_detectability' },
        { key: 'fmea_rpn', header: 'fmea_rpn' },
        { key: 'fmea_action_priority', header: 'fmea_action_priority' },
        { key: 'fmea_residual_rpn', header: 'fmea_residual_rpn' },
        { key: 'pert_currency', header: 'pert_currency' },
        { key: 'pert_cost_expected', header: 'pert_cost_expected' },
        { key: 'pert_cost_p10', header: 'pert_cost_p10' },
        { key: 'pert_cost_p90', header: 'pert_cost_p90' },
        { key: 'expected_unmitigated_loss', header: 'expected_unmitigated_loss' },
        { key: 'mitigation_cost', header: 'mitigation_cost' },
        { key: 'net_risk_adjusted_value', header: 'net_risk_adjusted_value' },
        { key: 'mitigation_roi', header: 'mitigation_roi' },
        { key: 'pert_capacity_days_expected', header: 'pert_capacity_days_expected' },
        { key: 'opportunity_cost', header: 'opportunity_cost' },
        { key: 'root_cause', header: 'root_cause' },
        { key: 'systemic_barrier', header: 'systemic_barrier' },
        { key: 'preventive_action', header: 'preventive_action' },
        { key: 'stakeholder_count', header: 'stakeholder_count' },
        { key: 'coalition_net_power', header: 'coalition_net_power' },
        { key: 'linked_records_count', header: 'linked_records_count' },
        { key: 'actuals_materialised', header: 'actuals_materialised' },
        { key: 'actual_realised_exposure', header: 'actual_realised_exposure' },
        { key: 'actual_mitigation_spend', header: 'actual_mitigation_spend' },
        { key: 'actual_diverted_days', header: 'actual_diverted_days' },
        { key: 'exposure_ratio', header: 'exposure_ratio' },
        { key: 'spend_ratio', header: 'spend_ratio' },
        { key: 'diverted_days_ratio', header: 'diverted_days_ratio' },
        { key: 'occurrence_brier', header: 'occurrence_brier' },
        { key: 'forecast_source', header: 'forecast_source' },
        { key: 'settled_on', header: 'settled_on' },
      ];
      const scoredByCase = new Map(caseCostPairs(state).map((p) => [p.caseId, p]));
      const rows = (state.cases || []).map((c) => {
        const s = summarizeCase(c, state, now);
        const pair = scoredByCase.get(c.id) || null;
        return {
          case_id: c.id,
          kind: c.kind,
          status: c.status,
          title: c.title,
          owner_name: s.owner ? s.owner.name : null,
          linked_goal: s.linkedGoal ? s.linkedGoal.title : null,
          opened_on: c.openedOn,
          review_on: c.reviewOn,
          resolved_on: c.resolvedOn,
          fmea_severity: c.fmea?.severity ?? null,
          fmea_probability: c.fmea?.probability ?? null,
          fmea_detectability: c.fmea?.detectability ?? null,
          fmea_rpn: s.fmea.rated ? s.fmea.rpn : null,
          fmea_action_priority: s.fmea.rated ? s.fmea.actionPriority : null,
          fmea_residual_rpn: s.fmea.hasResidual ? s.fmea.residualRpn : null,
          pert_currency: s.pert.hasFinancialEstimate ? s.pert.currency : null,
          pert_cost_expected: s.pert.hasFinancialEstimate ? s.pert.cost.expected : null,
          pert_cost_p10: s.pert.hasFinancialEstimate ? s.pert.cost.p10 : null,
          pert_cost_p90: s.pert.hasFinancialEstimate ? s.pert.cost.p90 : null,
          expected_unmitigated_loss: s.pert.hasFinancialEstimate ? s.pert.expectedUnmitigatedLoss : null,
          mitigation_cost: s.pert.mitigationCost > 0 ? s.pert.mitigationCost : null,
          net_risk_adjusted_value: s.pert.hasFinancialEstimate ? s.pert.netRiskAdjustedValue : null,
          mitigation_roi: s.pert.mitigationRoi,
          pert_capacity_days_expected: s.pert.hasCapacityEstimate ? s.pert.capacity.expected : null,
          opportunity_cost: s.pert.opportunityCost || null,
          root_cause: s.rca.rootCause || null,
          systemic_barrier: s.rca.systemicBarrier || null,
          preventive_action: s.rca.preventiveAction || null,
          stakeholder_count: s.coalition.total,
          coalition_net_power: s.coalition.total > 0 ? s.coalition.netPowerBalance : null,
          linked_records_count: s.links.length,
          actuals_materialised: pair ? (pair.materialised === null ? null : pair.materialised ? 'yes' : 'no') : null,
          actual_realised_exposure: pair ? pair.realisedExposure : null,
          actual_mitigation_spend: pair ? pair.mitigationSpend : null,
          actual_diverted_days: pair ? pair.divertedDays : null,
          exposure_ratio: pair ? pair.exposureRatio : null,
          spend_ratio: pair ? pair.spendRatio : null,
          diverted_days_ratio: pair ? pair.daysRatio : null,
          occurrence_brier: pair ? pair.occurrenceBrier : null,
          forecast_source: pair ? pair.source : null,
          settled_on: pair ? pair.settledOn : null,
        };
      });
      return { columns, rows };
    }

    case 'portfolio': {
      const columns = [
        { key: 'item_id', header: 'item_id' },
        { key: 'title', header: 'title' },
        { key: 'kind', header: 'kind' },
        { key: 'status', header: 'status' },
        { key: 'decision', header: 'decision' },
        { key: 'decision_on', header: 'decision_on' },
        { key: 'rationale', header: 'rationale' },
        { key: 'source_type', header: 'source_type' },
        { key: 'source_id', header: 'source_id' },
        { key: 'owner_name', header: 'owner_name' },
        { key: 'effort_days_optimistic', header: 'effort_days_optimistic' },
        { key: 'effort_days_most_likely', header: 'effort_days_most_likely' },
        { key: 'effort_days_pessimistic', header: 'effort_days_pessimistic' },
        { key: 'effort_days_pert_expected', header: 'effort_days_pert_expected' },
        { key: 'value_currency', header: 'value_currency' },
        { key: 'value_optimistic', header: 'value_optimistic' },
        { key: 'value_most_likely', header: 'value_most_likely' },
        { key: 'value_pessimistic', header: 'value_pessimistic' },
        { key: 'value_pert_expected', header: 'value_pert_expected' },
        { key: 'value_density_per_person_day', header: 'value_density_per_person_day' },
        { key: 'created_on', header: 'created_on' },
        { key: 'target_on', header: 'target_on' },
        { key: 'completed_on', header: 'completed_on' },
        { key: 'released_on', header: 'released_on' },
      ];
      const rows = (state.portfolio || []).map((item) => {
        const effort = pertTriple(item.effortDays);
        const value = pertTriple(item.value);
        return {
          item_id: item.id,
          title: item.title,
          kind: item.kind,
          status: item.status,
          decision: PORTFOLIO_DECISION_LABELS[item.decision] || item.decision,
          decision_on: item.decisionOn,
          rationale: item.rationale,
          source_type: item.sourceType,
          source_id: item.sourceId,
          owner_name: item.ownerId ? nameOf(item.ownerId) : null,
          effort_days_optimistic: effort.optimistic,
          effort_days_most_likely: effort.mostLikely,
          effort_days_pessimistic: effort.pessimistic,
          effort_days_pert_expected: effort.expected,
          value_currency: value.measured ? item.currency : null,
          value_optimistic: value.measured ? value.optimistic : null,
          value_most_likely: value.measured ? value.mostLikely : null,
          value_pessimistic: value.measured ? value.pessimistic : null,
          value_pert_expected: value.measured ? value.expected : null,
          value_density_per_person_day: value.measured && effort.expected > 0
            ? Math.round((value.expected / effort.expected) * 100) / 100
            : null,
          created_on: item.createdOn,
          target_on: item.targetOn,
          completed_on: item.completedOn,
          released_on: item.releasedOn,
        };
      });
      return { columns, rows };
    }


    case 'hiring': {
      const columns = [
        { key: 'record_type', header: 'record_type' },
        { key: 'requisition_id', header: 'requisition_id' },
        { key: 'role', header: 'role' },
        { key: 'status', header: 'status' },
        { key: 'reason', header: 'reason' },
        { key: 'opened_on', header: 'opened_on' },
        { key: 'target_start_on', header: 'target_start_on' },
        { key: 'closed_on', header: 'closed_on' },
        { key: 'competencies', header: 'competencies' },
        { key: 'interview_effort_most_likely_days', header: 'interview_effort_most_likely_days' },
        { key: 'daily_vacancy_cost', header: 'daily_vacancy_cost' },
        { key: 'candidate_id', header: 'candidate_id' },
        { key: 'candidate_name', header: 'candidate_name' },
        { key: 'candidate_stage', header: 'candidate_stage' },
        { key: 'applied_on', header: 'applied_on' },
        { key: 'evidence_count', header: 'evidence_count' },
        { key: 'evidence_kinds', header: 'evidence_kinds' },
        { key: 'evidence_weight', header: 'evidence_weight' },
        { key: 'competency_coverage_pct', header: 'competency_coverage_pct' },
        { key: 'decision_outcome', header: 'decision_outcome' },
        { key: 'decided_on', header: 'decided_on' },
        { key: 'decision_rationale', header: 'decision_rationale' },
        { key: 'evidence_gap_acknowledged', header: 'evidence_gap_acknowledged' },
        { key: 'start_on', header: 'start_on' },
        { key: 'hired_person', header: 'hired_person' },
      ];
      const rows = [];
      // Index once: `filter` inside the requisition loop is O(roles × candidates).
      const candidatesByReq = new Map();
      for (const candidate of state.candidates || []) {
        if (!candidate) continue;
        const bucket = candidatesByReq.get(candidate.reqId);
        if (bucket) bucket.push(candidate);
        else candidatesByReq.set(candidate.reqId, [candidate]);
      }
      for (const req of state.requisitions || []) {
        const base = {
          requisition_id: req.id,
          role: req.title,
          status: REQUISITION_STATUS_LABELS[req.status] || req.status,
          reason: REQUISITION_REASON_LABELS[req.reason] || req.reason,
          opened_on: req.openedOn,
          target_start_on: req.targetStartOn,
          closed_on: req.closedOn,
          competencies: (req.competencies || []).map((c) => `${c.name} (w${c.weight}${c.required ? '' : ', optional'})`).join('; '),
          interview_effort_most_likely_days: req.effortDays?.mostLikely ?? null,
          daily_vacancy_cost: req.dailyVacancyCost ?? null,
        };
        rows.push({ ...base, record_type: 'requisition' });
        for (const candidate of candidatesByReq.get(req.id) || []) {
          // Assessed without a prior override: the export states the raw
          // evidence weight, which is a fact about the record, not a verdict.
          const assessment = assessCandidate(candidate, req, { prior: state.settings?.hiringBaseRate });
          rows.push({
            ...base,
            record_type: 'candidate',
            candidate_id: candidate.id,
            candidate_name: candidate.name,
            candidate_stage: CANDIDATE_STAGE_LABELS[candidate.stage] || candidate.stage,
            applied_on: candidate.appliedOn,
            evidence_count: candidate.signals.length,
            evidence_kinds: [...new Set(candidate.signals.map((sig) => sig.kind))].join('; '),
            evidence_weight: Math.round(assessment.audit.totalWeight * 100) / 100,
            competency_coverage_pct: assessment.coverage.pct,
            decision_outcome: candidate.decision?.outcome || 'pending',
            decided_on: candidate.decision?.decidedOn || null,
            decision_rationale: candidate.decision?.rationale || '',
            evidence_gap_acknowledged: candidate.decision?.evidenceGapAcknowledged === true,
            start_on: candidate.startOn,
            hired_person: candidate.personId ? nameOf(candidate.personId) : null,
          });
        }
      }
      return { columns, rows };
    }

    case 'caseLinks': {
      const columns = [
        { key: 'link_id', header: 'link_id' },
        { key: 'source_type', header: 'source_type' },
        { key: 'source_id', header: 'source_id' },
        { key: 'source_title', header: 'source_title' },
        { key: 'relation', header: 'relation' },
        { key: 'target_type', header: 'target_type' },
        { key: 'target_id', header: 'target_id' },
        { key: 'target_title', header: 'target_title' },
        { key: 'rule_id', header: 'rule_id' },
        { key: 'created_on', header: 'created_on' },
        { key: 'summary', header: 'summary' },
      ];
      const rows = (state.links || [])
        .filter((l) => l && !FORBIDDEN_LINK_TYPES.includes(l.sourceType) && !FORBIDDEN_LINK_TYPES.includes(l.targetType))
        .map((l) => {
          const src = resolveLinkedEntity(state, l.sourceType, l.sourceId);
          const dst = resolveLinkedEntity(state, l.targetType, l.targetId);
          if (!src || !dst) return null;
          return {
            link_id: l.id,
            source_type: l.sourceType,
            source_id: l.sourceId,
            source_title: src.title,
            relation: l.relation,
            target_type: l.targetType,
            target_id: l.targetId,
            target_title: dst.title,
            rule_id: l.ruleId || null,
            created_on: l.createdOn || null,
            summary: l.summary || null,
          };
        })
        .filter(Boolean);
      return { columns, rows };
    }

    case 'conflicts': {
      const columns = [
        { key: 'conflict_id', header: 'conflict_id' },
        { key: 'title', header: 'title' },
        { key: 'opened_on', header: 'opened_on' },
        { key: 'updated_on', header: 'updated_on' },
        { key: 'status', header: 'status' },
        { key: 'safety', header: 'safety' },
        { key: 'coordinator', header: 'coordinator' },
        { key: 'participants', header: 'participants' },
        { key: 'summary', header: 'summary' },
        { key: 'process', header: 'process' },
        { key: 'sharing_boundary', header: 'sharing_boundary' },
        { key: 'agreements_count', header: 'agreements_count' },
        { key: 'commitments_total', header: 'commitments_total' },
        { key: 'commitments_completed', header: 'commitments_completed' },
        { key: 'next_follow_up_on', header: 'next_follow_up_on' },
        { key: 'latest_follow_up_outcome', header: 'latest_follow_up_outcome' },
      ];
      const rows = (state.conflicts || []).map((c) => {
        const agreements = c.agreements || [];
        const allCommitments = agreements.flatMap((a) => a.actions || []);
        const followUps = (c.followUps || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const latestFollowUp = followUps.length ? followUps[followUps.length - 1] : null;
        return {
          conflict_id: c.id,
          title: c.title,
          opened_on: c.openedOn,
          updated_on: (c.updatedAt || '').slice(0, 10) || null,
          status: c.status,
          safety: c.safety,
          coordinator: c.coordinator,
          participants: (c.participants || []).map((p) => `${p.name} (${p.participation})`).join('; '),
          summary: c.summary,
          process: c.process,
          sharing_boundary: c.sharing,
          agreements_count: agreements.length,
          commitments_total: allCommitments.length,
          commitments_completed: allCommitments.filter((act) => Boolean(act.completedOn)).length,
          next_follow_up_on: c.nextFollowUpOn,
          latest_follow_up_outcome: latestFollowUp ? latestFollowUp.outcome : null,
        };
      });
      return { columns, rows };
    }

    case 'changes': {
      const columns = [
        { key: 'change_id', header: 'change_id' },
        { key: 'title', header: 'title' },
        { key: 'kind', header: 'kind' },
        { key: 'status', header: 'status' },
        { key: 'owner_name', header: 'owner_name' },
        { key: 'opened_on', header: 'opened_on' },
        { key: 'target_on', header: 'target_on' },
        { key: 'review_on', header: 'review_on' },
        { key: 'anchored_on', header: 'anchored_on' },
        { key: 'reversibility', header: 'reversibility' },
        { key: 'kotter_stage', header: 'kotter_stage' },
        { key: 'kotter_progress_pct', header: 'kotter_progress_pct' },
        { key: 'kotter_skipped_steps', header: 'kotter_skipped_steps' },
        { key: 'current_topology', header: 'current_topology' },
        { key: 'target_topology', header: 'target_topology' },
        { key: 'interaction_mode', header: 'interaction_mode' },
        { key: 'cognitive_load_total', header: 'cognitive_load_total' },
        { key: 'blocking_handoffs_delta', header: 'blocking_handoffs_delta' },
        { key: 'driving_forces_sum', header: 'driving_forces_sum' },
        { key: 'restraining_forces_effective', header: 'restraining_forces_effective' },
        { key: 'force_field_equilibrium', header: 'force_field_equilibrium' },
        { key: 'star_aligned_points', header: 'star_aligned_points' },
        { key: 'veto_players_aligned', header: 'veto_players_aligned' },
        { key: 'effort_pert_expected_days', header: 'effort_pert_expected_days' },
        { key: 'risk_adjusted_roi_pct', header: 'risk_adjusted_roi_pct' },
        { key: 'verified_xmr_shifts', header: 'verified_xmr_shifts' },
        { key: 'impacted_people', header: 'impacted_people' },
        { key: 'vision', header: 'vision' },
        { key: 'non_goals', header: 'non_goals' },
      ];
      const rows = (state.changes || []).map((c) => {
        const s = summarizeChange(c, state, now);
        return {
          change_id: c.id,
          title: c.title,
          kind: CHANGE_KIND_LABELS[c.kind] || c.kind,
          status: CHANGE_STATUS_LABELS[c.status] || c.status,
          owner_name: nameOf(c.ownerId) || null,
          opened_on: c.openedOn,
          target_on: c.targetOn,
          review_on: c.reviewOn,
          anchored_on: c.anchoredOn,
          reversibility: c.reversibility,
          kotter_stage: s.kotter.currentMeta.label,
          kotter_progress_pct: Math.round((s.kotter.completedCount / 8) * 100),
          kotter_skipped_steps: s.kotter.skippedSteps.map((x) => x.label).join('; ') || null,
          current_topology: s.topology.currentTypeLabel,
          target_topology: s.topology.targetTypeLabel,
          interaction_mode: s.topology.interactionModeLabel,
          cognitive_load_total: s.topology.cognitiveLoadTarget,
          blocking_handoffs_delta: s.topology.handoffsDelta,
          driving_forces_sum: s.forceField.drivingSum,
          restraining_forces_effective: s.forceField.effectiveRestrainingSum,
          force_field_equilibrium: s.forceField.equilibrium,
          star_aligned_points: s.star.alignedCount,
          veto_players_aligned: s.coalition.vetoPlayers.length
            ? `${s.coalition.vetoPlayers.length - s.coalition.unalignedVetoPlayers.length}/${s.coalition.vetoPlayers.length}`
            : null,
          effort_pert_expected_days: s.economics.effort.measured ? s.economics.effort.expected : null,
          risk_adjusted_roi_pct: s.economics.riskAdjustedNetBenefit,
          verified_xmr_shifts: s.metrics.verifiedShiftCount,
          impacted_people: (c.impacts || []).map((i) => nameOf(i.personId)).filter(Boolean).join('; ') || null,
          vision: c.vision || null,
          non_goals: c.nonGoals || null,
        };
      });
      return { columns, rows };
    }

    case 'negotiations': {
      const columns = [
        { key: 'negotiation_id', header: 'negotiation_id' },
        { key: 'kind', header: 'kind' },
        { key: 'status', header: 'status' },
        { key: 'title', header: 'title' },
        { key: 'counterparty', header: 'counterparty' },
        { key: 'counterparty_role', header: 'counterparty_role' },
        { key: 'owner_name', header: 'owner_name' },
        { key: 'linked_goal', header: 'linked_goal' },
        { key: 'source_type', header: 'source_type' },
        { key: 'opened_on', header: 'opened_on' },
        { key: 'next_session_on', header: 'next_session_on' },
        { key: 'review_on', header: 'review_on' },
        { key: 'closed_on', header: 'closed_on' },
        { key: 'strategic', header: 'strategic' },
        { key: 'stakes_currency', header: 'stakes_currency' },
        { key: 'stakes_value', header: 'stakes_value' },
        { key: 'batna_description', header: 'batna_description' },
        { key: 'batna_value', header: 'batna_value' },
        { key: 'counterparty_batna_estimate', header: 'counterparty_batna_estimate' },
        { key: 'issue_count', header: 'issue_count' },
        { key: 'zopa_issue_count', header: 'zopa_issue_count' },
        { key: 'no_zopa_issue_count', header: 'no_zopa_issue_count' },
        { key: 'incomplete_issue_count', header: 'incomplete_issue_count' },
        { key: 'weighted_zopa_coverage_pct', header: 'weighted_zopa_coverage_pct' },
        { key: 'prep_completeness_pct', header: 'prep_completeness_pct' },
        { key: 'prep_blockers', header: 'prep_blockers' },
        { key: 'our_interests', header: 'our_interests' },
        { key: 'their_interests', header: 'their_interests' },
        { key: 'objective_criteria', header: 'objective_criteria' },
        { key: 'package_options', header: 'package_options' },
        { key: 'agreed_terms_count', header: 'agreed_terms_count' },
        { key: 'owned_terms_count', header: 'owned_terms_count' },
        { key: 'unowned_terms_count', header: 'unowned_terms_count' },
        { key: 'returned_terms_count', header: 'returned_terms_count' },
        { key: 'recovered_terms_count', header: 'recovered_terms_count' },
        { key: 'settled_on', header: 'settled_on' },
        { key: 'realised_value', header: 'realised_value' },
        { key: 'realisation_ratio', header: 'realisation_ratio' },
        { key: 'counterparty_delivered', header: 'counterparty_delivered' },
        { key: 'batna_breached', header: 'batna_breached' },
        { key: 'settlement_note', header: 'settlement_note' },
        { key: 'escalation_case_id', header: 'escalation_case_id' },
        { key: 'linked_records_count', header: 'linked_records_count' },
      ];
      const nameOf = (personId) => (state.people || []).find((p) => p.id === personId)?.name || null;
      const rows = (state.negotiations || []).map((n) => {
        const s = summarizeNegotiation(n, state, now);
        const terms = n.agreedTerms || [];
        const se = s.settlementEvaluation;
        return {
          negotiation_id: n.id,
          kind: n.kind,
          status: n.status,
          title: n.title,
          counterparty: n.counterparty || null,
          counterparty_role: n.counterpartyRole || null,
          owner_name: n.ownerId ? nameOf(n.ownerId) : null,
          linked_goal: s.links.some((l) => l.peer.type === 'goal')
            ? (state.goals || []).find((g) => g.id === n.linkedGoalId)?.title || null
            : null,
          source_type: n.sourceType || null,
          opened_on: n.openedOn,
          next_session_on: n.nextSessionOn,
          review_on: n.reviewOn,
          closed_on: n.closedOn,
          strategic: n.strategic ? 'yes' : 'no',
          stakes_currency: n.stakesValue !== null ? n.stakesCurrency : null,
          stakes_value: n.stakesValue,
          batna_description: n.ourBatnaDescription || null,
          batna_value: n.ourBatnaValue,
          counterparty_batna_estimate: n.theirBatnaEstimate || null,
          issue_count: s.analyses.length,
          zopa_issue_count: s.analyses.filter((a) => a.status === 'zopa').length,
          no_zopa_issue_count: s.blockingGaps.length,
          incomplete_issue_count: s.incompleteIssues.length,
          weighted_zopa_coverage_pct: s.zopaCoveragePct,
          prep_completeness_pct: s.prep.completenessPct,
          prep_blockers: s.prep.blockers.join('; ') || null,
          our_interests: (n.ourInterests || []).join('; ') || null,
          their_interests: (n.theirInterests || []).join('; ') || null,
          objective_criteria: (n.objectiveCriteria || []).join('; ') || null,
          package_options: (n.options || []).join('; ') || null,
          agreed_terms_count: terms.length,
          owned_terms_count: terms.filter((t) => t.ownerId).length,
          unowned_terms_count: terms.filter((t) => !t.ownerId).length,
          returned_terms_count: s.delivery?.returned ?? 0,
          recovered_terms_count: s.delivery?.recovered ?? 0,
          settled_on: se?.settledOn || null,
          realised_value: se?.realisedValue ?? null,
          realisation_ratio: se?.realisationRatio ?? null,
          counterparty_delivered: se?.counterpartyDelivered === true ? 'yes' : se?.counterpartyDelivered === false ? 'no' : null,
          batna_breached: se?.settled ? (se.batnaBreached ? 'yes' : 'no') : null,
          settlement_note: se?.note || null,
          escalation_case_id: n.escalationCaseId,
          linked_records_count: s.links.length,
        };
      });
      return { columns, rows };
    }

    case 'sensitivity': {
      const columns = [
        { key: 'record_type', header: 'record_type' },
        { key: 'id', header: 'id' },
        { key: 'label', header: 'label' },
        { key: 'category', header: 'category' },
        { key: 'pareto_optimal', header: 'pareto_optimal' },
        { key: 'brooks_law_trap', header: 'brooks_law_trap' },
        { key: 'overload_probability_pct', header: 'overload_probability_pct' },
        { key: 'delta_overload_pct_pts', header: 'delta_overload_pct_pts' },
        { key: 'effective_p80_days', header: 'effective_p80_days' },
        { key: 'delta_p80_days', header: 'delta_p80_days' },
        { key: 'p80_swing_days', header: 'p80_swing_days' },
        { key: 'overload_swing_pct_pts', header: 'overload_swing_pct_pts' },
        { key: 'net_risk_adjusted_value', header: 'net_risk_adjusted_value' },
        { key: 'delta_net_value', header: 'delta_net_value' },
        { key: 'currency', header: 'currency' },
        { key: 'favorable_case', header: 'favorable_case' },
        { key: 'adverse_case', header: 'adverse_case' },
        { key: 'seed', header: 'seed' },
        { key: 'trials', header: 'trials' },
      ];
      const fastTrials = (state.portfolio || []).length > 60 ? 200 : 400;
      const presets = buildSuggestedScenarios(state, { now }).slice(0, (state.portfolio || []).length > 60 ? 2 : 5);
      const cmp = compareScenarios(state, presets, { now, trials: fastTrials });
      const tornado = computeSensitivityTornado(state, { now, trials: fastTrials, maxItems: (state.portfolio || []).length > 60 ? 3 : 5 });

      const rows = [];
      for (const s of cmp.scenarios) {
        rows.push({
          record_type: s.isBaseline ? 'baseline' : 'scenario',
          id: s.id,
          label: s.name,
          category: s.category,
          pareto_optimal: s.paretoOptimal,
          brooks_law_trap: s.brooksLawTrap,
          overload_probability_pct: Math.round((s.monteCarlo.overloadProbability ?? 0) * 100),
          delta_overload_pct_pts: Math.round((s.deltas.overloadProbability ?? 0) * 100),
          effective_p80_days: s.monteCarlo.effectiveP80Days,
          delta_p80_days: s.deltas.effectiveP80Days,
          p80_swing_days: null,
          overload_swing_pct_pts: null,
          net_risk_adjusted_value: s.economics.measured ? s.economics.netRiskAdjustedValue : null,
          delta_net_value: s.economics.measured ? s.deltas.netRiskAdjustedValue : null,
          currency: s.economics.currency,
          favorable_case: null,
          adverse_case: s.appliedLevers.map((l) => l.summary).join('; ') || null,
          seed: cmp.seed,
          trials: cmp.trials,
        });
      }
      if (tornado.available) {
        for (const b of tornado.bars) {
          rows.push({
            record_type: 'sensitivity_driver',
            id: b.id,
            label: b.label,
            category: b.category,
            pareto_optimal: null,
            brooks_law_trap: null,
            overload_probability_pct: Math.round((b.baselineOverloadProb ?? 0) * 100),
            delta_overload_pct_pts: null,
            effective_p80_days: b.baselineP80Days,
            delta_p80_days: null,
            p80_swing_days: b.p80SwingDays,
            overload_swing_pct_pts: b.overloadSwingPct,
            net_risk_adjusted_value: null,
            delta_net_value: b.valueSwing,
            currency: tornado.currency,
            favorable_case: `${b.favorableLabel} (${b.deltaFavorableP80Days <= 0 ? '' : '+'}${b.deltaFavorableP80Days}d P80)`,
            adverse_case: `${b.adverseLabel} (${b.deltaAdverseP80Days <= 0 ? '' : '+'}${b.deltaAdverseP80Days}d P80)`,
            seed: tornado.seed,
            trials: tornado.trials,
          });
        }
      }
      return { columns, rows };
    }

    case 'finance': {
      // One row per commitment line, envelope figures repeated from the same
      // evaluated snapshot. Budgets with no lines still export one row so an
      // empty envelope is visible rather than silently absent. Every amount
      // stays in its own envelope currency — rows are never summed in-file.
      const columns = [
        { key: 'budget_id', header: 'budget_id' },
        { key: 'budget_name', header: 'budget_name' },
        { key: 'budget_status', header: 'budget_status' },
        { key: 'currency', header: 'currency' },
        { key: 'ceiling', header: 'ceiling' },
        { key: 'period_label', header: 'period_label' },
        { key: 'period_starts_on', header: 'period_starts_on' },
        { key: 'period_ends_on', header: 'period_ends_on' },
        { key: 'owner_name', header: 'owner_name' },
        { key: 'spent_recorded_actuals', header: 'spent_recorded_actuals' },
        { key: 'committed_open', header: 'committed_open' },
        { key: 'planned_pipeline', header: 'planned_pipeline' },
        { key: 'forecast_at_completion', header: 'forecast_at_completion' },
        { key: 'forecast_utilisation_pct', header: 'forecast_utilisation_pct' },
        { key: 'remaining_vs_ceiling', header: 'remaining_vs_ceiling' },
        { key: 'forecast_state', header: 'forecast_state' },
        { key: 'line_id', header: 'line_id' },
        { key: 'line_title', header: 'line_title' },
        { key: 'line_category', header: 'line_category' },
        { key: 'line_status', header: 'line_status' },
        { key: 'committed_amount', header: 'committed_amount' },
        { key: 'actual_amount', header: 'actual_amount' },
        { key: 'actual_vs_committed_ratio', header: 'actual_vs_committed_ratio' },
        { key: 'committed_on', header: 'committed_on' },
        { key: 'expected_on', header: 'expected_on' },
        { key: 'spent_on', header: 'spent_on' },
        { key: 'released_on', header: 'released_on' },
        { key: 'actuals_due_on', header: 'actuals_due_on' },
        { key: 'funds_type', header: 'funds_type' },
        { key: 'funds_title', header: 'funds_title' },
        { key: 'line_owner_name', header: 'line_owner_name' },
        { key: 'line_note', header: 'line_note' },
      ];
      const rows = [];
      for (const budget of state.budgets || []) {
        const ev = evaluateBudget(budget, now, { watchPct: state.settings?.budgetWatchPct });
        const base = {
          budget_id: budget.id,
          budget_name: budget.name,
          budget_status: budget.status,
          currency: budget.currency,
          ceiling: ev.limit,
          period_label: budget.periodLabel || null,
          period_starts_on: budget.startsOn,
          period_ends_on: budget.endsOn,
          owner_name: budget.ownerId ? nameOf(budget.ownerId) || null : null,
          spent_recorded_actuals: ev.spentKnown,
          committed_open: ev.committedOpen,
          planned_pipeline: ev.plannedPipeline,
          forecast_at_completion: ev.forecastAtCompletion,
          forecast_utilisation_pct: ev.forecastUtilisation === null ? null : Math.round(ev.forecastUtilisation * 100),
          remaining_vs_ceiling: ev.remainingVsLimit,
          forecast_state: ev.breach ? 'breach' : ev.watch ? 'watch' : ev.pipelineBreach ? 'pipeline-breach' : ev.hasLimit ? 'within-ceiling' : 'tracking-only',
        };
        const lines = budget.lines || [];
        if (!lines.length) {
          rows.push({ ...base, line_id: null, line_title: null, line_category: null, line_status: null, committed_amount: null, actual_amount: null, actual_vs_committed_ratio: null, committed_on: null, expected_on: null, spent_on: null, released_on: null, actuals_due_on: null, funds_type: null, funds_title: null, line_owner_name: null, line_note: null });
          continue;
        }
        for (const line of lines) {
          const src = line.sourceType && line.sourceId ? resolveLinkedEntity(state, line.sourceType, line.sourceId) : null;
          rows.push({
            ...base,
            line_id: line.id,
            line_title: line.title,
            line_category: line.category,
            line_status: line.status,
            committed_amount: line.committedAmount,
            actual_amount: line.actualAmount,
            actual_vs_committed_ratio: line.status === 'spent' && line.committedAmount > 0 && line.actualAmount !== null
              ? Math.round((line.actualAmount / line.committedAmount) * 100) / 100
              : null,
            committed_on: line.committedOn,
            expected_on: line.expectedOn,
            spent_on: line.spentOn,
            released_on: line.releasedOn,
            actuals_due_on: line.actualsDueOn,
            funds_type: line.sourceType,
            funds_title: src?.title || null,
            line_owner_name: line.ownerId ? nameOf(line.ownerId) || null : null,
            line_note: line.note || null,
          });
        }
      }
      return { columns, rows };
    }

    case 'stakeholders': {
      // One row per register record with derived Mendelow quadrant and
      // Mitchell-Agle-Wood salience. All free text passes the shared
      // CWE-1236 neutralizer via serializeCsv; nulls stay empty cells.
      const columns = [
        { key: 'stakeholder_id', header: 'stakeholder_id' },
        { key: 'name', header: 'name' },
        { key: 'org', header: 'org' },
        { key: 'role', header: 'role' },
        { key: 'linked_person_name', header: 'linked_person_name' },
        { key: 'category', header: 'category' },
        { key: 'status', header: 'status' },
        { key: 'power_1_5', header: 'power_1_5' },
        { key: 'interest_1_5', header: 'interest_1_5' },
        { key: 'mendelow_quadrant', header: 'mendelow_quadrant' },
        { key: 'legitimacy_1_5', header: 'legitimacy_1_5' },
        { key: 'urgency_1_5', header: 'urgency_1_5' },
        { key: 'salience_class', header: 'salience_class' },
        { key: 'salience_score_3_15', header: 'salience_score_3_15' },
        { key: 'confidence_adjusted_salience', header: 'confidence_adjusted_salience' },
        { key: 'estimate_confidence', header: 'estimate_confidence' },
        { key: 'veto_player', header: 'veto_player' },
        { key: 'veto_basis', header: 'veto_basis' },
        { key: 'stance', header: 'stance' },
        { key: 'comms_cadence', header: 'comms_cadence' },
        { key: 'last_contact_on', header: 'last_contact_on' },
        { key: 'next_contact_on', header: 'next_contact_on' },
        { key: 'alliance_edges', header: 'alliance_edges' },
        { key: 'opposition_edges', header: 'opposition_edges' },
        { key: 'influence_edges', header: 'influence_edges' },
        { key: 'stance_history_entries', header: 'stance_history_entries' },
        { key: 'latest_stance_on', header: 'latest_stance_on' },
        { key: 'contact_log_entries', header: 'contact_log_entries' },
        { key: 'tags', header: 'tags' },
        { key: 'key_message', header: 'key_message' },
        { key: 'preferred_comms', header: 'preferred_comms' },
        { key: 'influence_notes', header: 'influence_notes' },
      ];
      const rows = (state.stakeholders || []).map((s) => {
        const salience = classifySalience(s);
        const mendelow = classifyMendelowStakeholder({
          power: s.power,
          interest: s.interest,
          stance: s.stance,
          commsCadence: s.commsCadence,
          nextCommsOn: s.nextContactOn,
          lastCommsOn: s.lastContactOn,
        });
        const edges = (kind) => (s.alliances || []).filter((e) => e.kind === kind).length;
        const history = (s.stanceHistory || []).slice().sort((a, b) => String(b.on).localeCompare(String(a.on)));
        return {
          stakeholder_id: s.id,
          name: s.name,
          org: s.org || null,
          role: s.role || null,
          linked_person_name: s.personId ? nameOf(s.personId) || null : null,
          category: s.category,
          status: s.status,
          power_1_5: s.power,
          interest_1_5: s.interest,
          mendelow_quadrant: mendelow.quadrant,
          legitimacy_1_5: s.legitimacy,
          urgency_1_5: s.urgency,
          salience_class: salience.salienceClass,
          salience_score_3_15: salience.salienceScore,
          confidence_adjusted_salience: salience.expectedSalienceScore,
          estimate_confidence: s.estimateConfidence,
          veto_player: s.vetoPlayer ? 'yes' : 'no',
          veto_basis: s.vetoBasis || null,
          stance: s.stance,
          comms_cadence: s.commsCadence,
          last_contact_on: s.lastContactOn,
          next_contact_on: s.nextContactOn,
          alliance_edges: edges('alliance'),
          opposition_edges: edges('opposition'),
          influence_edges: edges('influences'),
          stance_history_entries: (s.stanceHistory || []).length,
          latest_stance_on: history[0]?.on || null,
          contact_log_entries: (s.contactLog || []).length,
          tags: (s.tags || []).join('; '),
          key_message: s.keyMessage || null,
          preferred_comms: s.preferredComms || null,
          influence_notes: s.influenceNotes || null,
        };
      });
      return { columns, rows };
    }

    case 'forecasts': {
      const report = forecastIntegrityReport(state, now);
      const columns = [
        { key: 'row_type', header: 'row_type' },
        { key: 'record_key', header: 'record_key' },
        { key: 'ledger', header: 'ledger' },
        { key: 'class_key', header: 'class_key' },
        { key: 'source_type', header: 'source_type' },
        { key: 'source_id', header: 'source_id' },
        { key: 'title', header: 'title' },
        { key: 'quantity', header: 'quantity' },
        { key: 'status', header: 'status' },
        { key: 'forecast', header: 'forecast' },
        { key: 'actual', header: 'actual' },
        { key: 'ratio', header: 'actual_over_forecast' },
        { key: 'brier', header: 'brier_contribution' },
        { key: 'unit', header: 'unit' },
        { key: 'currency', header: 'currency' },
        { key: 'direction', header: 'direction' },
        { key: 'forecast_on', header: 'forecast_on' },
        { key: 'actual_on', header: 'actual_on' },
        { key: 'evidence_n', header: 'evidence_n' },
        { key: 'median_ratio', header: 'median_ratio' },
        { key: 'sign_p', header: 'sign_test_p' },
        { key: 'band_low_factor', header: 'band_low_factor' },
        { key: 'band_high_factor', header: 'band_high_factor' },
        { key: 'coverage_bound', header: 'coverage_bound' },
        { key: 'confidence', header: 'confidence' },
        { key: 'band_scope', header: 'band_scope' },
        { key: 'verdict', header: 'verdict' },
        { key: 'response', header: 'response' },
        { key: 'note', header: 'note' },
        { key: 'rule_id', header: 'rule_id' },
      ];
      const base = () => Object.fromEntries(columns.map((c) => [c.key, null]));
      const rows = [];
      for (const a of report.atoms) {
        rows.push({
          ...base(),
          row_type: 'atom',
          record_key: a.key,
          ledger: a.ledger,
          class_key: a.classKey,
          source_type: a.sourceType,
          source_id: a.sourceId,
          title: a.title,
          quantity: a.quantity,
          status: a.status,
          forecast: a.forecast,
          actual: a.actual,
          ratio: a.ratio,
          brier: a.family === 'probability' && a.status === 'scored' ? (a.forecast - a.actual) ** 2 : null,
          unit: a.unit,
          currency: a.currency,
          direction: a.direction,
          forecast_on: a.forecastOn,
          actual_on: a.actualOn,
          note: a.evidenceSource,
          rule_id: 'RULE-FCI-04',
        });
      }
      for (const cls of report.classes) {
        rows.push({
          ...base(),
          row_type: 'class',
          record_key: cls.key,
          ledger: cls.ledger,
          class_key: cls.key,
          title: cls.label,
          status: cls.biasFlag ? cls.biasDirection : 'balanced',
          unit: cls.unit,
          evidence_n: cls.n,
          median_ratio: cls.medianRatio,
          sign_p: cls.signP,
          band_low_factor: cls.band.lowFactor,
          band_high_factor: cls.band.highFactor,
          coverage_bound: cls.band.coverageBound,
          confidence: cls.confidence,
          verdict: cls.verdict.label,
          note: cls.band.reason || cls.verdict.detail,
          rule_id: 'RULE-FCI-01',
        });
      }
      for (const gap of report.missingActuals) {
        rows.push({
          ...base(),
          row_type: 'missing_actual',
          record_key: `${gap.sourceType}:${gap.sourceId}`,
          ledger: gap.ledger,
          source_type: gap.sourceType,
          source_id: gap.sourceId,
          title: gap.title,
          status: 'missing',
          note: gap.reason,
          rule_id: 'RULE-FCI-03',
        });
      }
      for (const c of state.forecastChallenges || []) {
        rows.push({
          ...base(),
          row_type: 'challenge',
          record_key: c.id,
          ledger: c.ledger,
          class_key: c.classKey,
          source_type: c.sourceType,
          source_id: c.sourceId,
          title: c.title,
          quantity: c.quantity,
          status: c.status,
          forecast: c.recordedForecast,
          unit: c.unit,
          currency: c.currency,
          direction: c.direction,
          forecast_on: c.forecastOn,
          evidence_n: c.evidenceN,
          median_ratio: c.medianRatio,
          sign_p: c.signP,
          band_low_factor: c.bandLow !== null && c.recordedForecast ? c.bandLow / c.recordedForecast : null,
          band_high_factor: c.bandHigh !== null && c.recordedForecast ? c.bandHigh / c.recordedForecast : null,
          coverage_bound: c.coverageBound,
          confidence: c.confidence,
          band_scope: c.bandScope || 'class',
          verdict: c.biasDirection,
          response: c.status,
          note: [c.note, c.responseNote].filter(Boolean).join(' | '),
          rule_id: c.ruleId,
        });
      }
      rows.push({
        ...base(),
        row_type: 'brief',
        record_key: report.generatedOn,
        title: 'Board-ready forecast integrity brief',
        verdict: report.verdict.label,
        note: report.boardBrief.replace(/\s+/g, ' ').slice(0, 1000),
        rule_id: 'RULE-FCI-04',
      });
      return { columns, rows };
    }

    // Schema v28 — decision tempo. Data-minimised by design: decision titles,
    // rationale, notes and names stay out, so the timing economics can be
    // audited or shared without exporting the substance of the calls.
    case 'decisionTempo': {
      const report = buildTempoReport(state, { now });
      const columns = [
        { key: 'row_type', header: 'row_type' },
        { key: 'record_key', header: 'record_key' },
        { key: 'decision_type', header: 'decision_type' },
        { key: 'reversibility', header: 'reversibility' },
        { key: 'status', header: 'status' },
        { key: 'age_days', header: 'age_days' },
        { key: 'decide_by', header: 'decide_by' },
        { key: 'debt_days', header: 'debt_days' },
        { key: 'value_at_stake', header: 'value_at_stake' },
        { key: 'currency', header: 'currency' },
        { key: 'delay_profile', header: 'delay_profile' },
        { key: 'cost_per_week', header: 'cost_per_week' },
        { key: 'cd3', header: 'cd3' },
        { key: 'evsi_at_best', header: 'evsi_at_best' },
        { key: 'optimal_wait_days', header: 'optimal_wait_days' },
        { key: 'net_gain_from_waiting', header: 'net_gain_from_waiting' },
        { key: 'switch_probability', header: 'switch_probability' },
        { key: 'verdict', header: 'verdict' },
        { key: 'measured_n', header: 'measured_n' },
        { key: 'median_latency_days', header: 'median_latency_days' },
        { key: 'p80_latency_days', header: 'p80_latency_days' },
        { key: 'coverage_bound', header: 'coverage_bound' },
        { key: 'guardrail_days', header: 'guardrail_days' },
        { key: 'realized_latency_days', header: 'realized_latency_days' },
        { key: 'rule_id', header: 'rule_id' },
      ];
      const rows = report.rows.map((row) => ({
        row_type: 'open_decision',
        record_key: row.decision.id,
        decision_type: row.timing.type,
        reversibility: row.decision.reversibility || '',
        status: row.schedule ? row.schedule.status : 'untimed',
        age_days: row.timing.ageDays,
        decide_by: row.timing.decideBy || '',
        debt_days: row.debtDays,
        value_at_stake: row.timing.priced ? row.timing.amount : '',
        currency: row.timing.priced ? row.timing.currency : '',
        delay_profile: row.timing.profile,
        cost_per_week: row.timing.priced ? row.timing.ratePerWeek : '',
        cd3: row.cd3,
        evsi_at_best: row.timing.canPriceInformation ? row.timing.bestPlan.evsi : '',
        optimal_wait_days: row.timing.canPriceInformation ? row.timing.bestPlan.day : '',
        net_gain_from_waiting: row.timing.gainFromBestPlan === null ? '' : row.timing.gainFromBestPlan,
        switch_probability: row.timing.bestPlan?.switchProbability ?? '',
        verdict: row.timing.verdict,
        measured_n: '',
        median_latency_days: '',
        p80_latency_days: '',
        coverage_bound: '',
        guardrail_days: row.timing.guardrailDays,
        realized_latency_days: '',
        rule_id: 'RULE-DLY-06',
      }));
      for (const type of report.latency.rows) {
        rows.push({
          row_type: 'latency_band',
          record_key: type.type,
          decision_type: type.type,
          reversibility: '',
          status: type.band.sufficient ? 'measured' : `counts-only (n<${TEMPO_MIN_SAMPLES})`,
          age_days: '',
          decide_by: '',
          debt_days: '',
          value_at_stake: '',
          currency: '',
          delay_profile: '',
          cost_per_week: '',
          cd3: '',
          evsi_at_best: '',
          optimal_wait_days: '',
          net_gain_from_waiting: '',
          switch_probability: '',
          verdict: type.breach ? 'breach' : 'inside-guardrail',
          measured_n: type.band.n,
          median_latency_days: type.band.medianDays ?? '',
          p80_latency_days: type.band.p80Days ?? '',
          coverage_bound: type.band.coverageBound ?? '',
          guardrail_days: type.guardrailDays,
          realized_latency_days: '',
          rule_id: 'RULE-DLY-05',
        });
      }
      for (const schedule of state.tempoSchedules || []) {
        if (schedule.status !== 'settled') continue;
        const decision = (state.decisions || []).find((d) => d.id === schedule.decisionId);
        rows.push({
          row_type: 'settled_timebox',
          record_key: schedule.id,
          decision_type: schedule.decisionType || '',
          reversibility: decision?.reversibility || '',
          status: schedule.status,
          age_days: '',
          decide_by: schedule.decideBy || '',
          debt_days: '',
          value_at_stake: schedule.valueAtStakeOverride ?? schedule.derivedAmount ?? '',
          currency: schedule.currency || '',
          delay_profile: schedule.profile,
          cost_per_week: '',
          cd3: '',
          evsi_at_best: '',
          optimal_wait_days: '',
          net_gain_from_waiting: '',
          switch_probability: '',
          verdict: 'settled',
          measured_n: '',
          median_latency_days: '',
          p80_latency_days: '',
          coverage_bound: '',
          guardrail_days: schedule.plannedTempoDays ?? '',
          realized_latency_days: schedule.realizedLatencyDays ?? '',
          rule_id: 'RULE-DLY-01',
        });
      }
      return { columns, rows };
    }

    // Schema v27 — RULE-INTAKE-07 calibration export. Deliberately contains
    // no free text: source notes, people and dismiss reasons stay out so the
    // engine's agreement rates can be audited without exporting HR content.
    case 'intakeCalibration': {
      const columns = [
        { key: 'draft_id', header: 'draft_id' },
        { key: 'created_on', header: 'created_on' },
        { key: 'status', header: 'status' },
        { key: 'engine_version', header: 'engine_version' },
        { key: 'primary_category', header: 'primary_category' },
        { key: 'confidence_band', header: 'confidence_band' },
        { key: 'primary_accepted', header: 'primary_accepted' },
        { key: 'entities_offered', header: 'entities_offered' },
        { key: 'entities_accepted', header: 'entities_accepted' },
        { key: 'edited_fields', header: 'edited_fields' },
        { key: 'rejected_routes', header: 'rejected_routes' },
        { key: 'confirmed_case_id', header: 'confirmed_case_id' },
        { key: 'rule_id', header: 'rule_id' },
      ];
      const rows = (state.intakeDrafts || [])
        .slice()
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .map((d) => ({
          draft_id: d.id,
          created_on: (d.createdAt || '').slice(0, 10),
          status: d.status,
          engine_version: d.engineVersion || '',
          primary_category: d.outcomes?.primaryCategory || d.analysis?.primaryCategoryId || '',
          confidence_band: d.outcomes?.confidenceBand || d.analysis?.confidenceBand || '',
          primary_accepted: d.outcomes ? (d.outcomes.primaryAccepted ? 'yes' : 'no') : '',
          entities_offered: d.outcomes?.entityOffered ?? '',
          entities_accepted: d.outcomes?.entityAccepted ?? '',
          edited_fields: (d.outcomes?.editedFields || []).join('; '),
          rejected_routes: (d.outcomes?.rejectedRouteIds || []).join('; '),
          confirmed_case_id: d.confirmedCaseId || '',
          rule_id: 'RULE-INTAKE-07',
        }));
      return { columns, rows };
    }

    case 'resilience': {
      const report = buildResilienceReport(state, now);
      const columns = [
        { key: 'dependency_id', header: 'dependency_id' },
        { key: 'name', header: 'name' },
        { key: 'kind', header: 'kind' },
        { key: 'criticality', header: 'criticality' },
        { key: 'status', header: 'status' },
        { key: 'tier', header: 'tier' },
        { key: 'tts_days', header: 'tts_days' },
        { key: 'ttr_days', header: 'ttr_days' },
        { key: 'effective_ttr_days', header: 'effective_ttr_days' },
        { key: 'substitutability', header: 'substitutability' },
        { key: 'cascading_shortfall_days', header: 'cascading_shortfall_days' },
        { key: 'bus_factor', header: 'bus_factor' },
        { key: 'in_training_stewards', header: 'in_training_stewards' },
        { key: 'verified_steward_names', header: 'verified_steward_names' },
        { key: 'upstream_ids', header: 'upstream_ids' },
        { key: 'downstream_count', header: 'downstream_count' },
        { key: 'common_mode_choke_point', header: 'common_mode_choke_point' },
        { key: 'sub_tier_choke_point', header: 'sub_tier_choke_point' },
        { key: 'currency', header: 'currency' },
        { key: 'daily_impact', header: 'daily_impact' },
        { key: 'blast_radius_exposure', header: 'blast_radius_exposure' },
        { key: 'rei_index', header: 'rei_index' },
        { key: 'holdup_score', header: 'holdup_score' },
        { key: 'holdup_level', header: 'holdup_level' },
        { key: 'drill_count', header: 'drill_count' },
        { key: 'last_drill_on', header: 'last_drill_on' },
        { key: 'last_drill_outcome', header: 'last_drill_outcome' },
        { key: 'exit_plan_summary', header: 'exit_plan_summary' },
      ];
      const rows = report.allRows.map((r) => ({
        dependency_id: r.dependency.id,
        name: r.dependency.name,
        kind: r.dependency.kind,
        criticality: r.dependency.criticality,
        status: r.dependency.status,
        tier: r.metrics.tier,
        tts_days: r.metrics.ttsDays,
        ttr_days: r.metrics.ttrDays,
        effective_ttr_days: r.metrics.effectiveTtrDays,
        substitutability: r.dependency.substitutability,
        cascading_shortfall_days: r.metrics.cascadingShortfallDays,
        bus_factor: r.stewardship.busFactor,
        in_training_stewards: r.stewardship.inTrainingCount,
        verified_steward_names: r.stewardship.qualifiedStewards.map((s) => s.personName).join('; '),
        upstream_ids: (r.dependency.upstreamIds || []).join('; '),
        downstream_count: r.metrics.downstreamCount,
        common_mode_choke_point: r.metrics.isCommonModeChokePoint ? 'yes' : 'no',
        sub_tier_choke_point: r.metrics.isSubTierChokePoint ? 'yes' : 'no',
        currency: r.valuation.priced ? r.valuation.currency : null,
        daily_impact: r.valuation.dailyImpact,
        blast_radius_exposure: r.metrics.primaryBlastExposure,
        rei_index: r.metrics.rei,
        holdup_score: r.holdUp.applicable ? r.holdUp.score : null,
        holdup_level: r.holdUp.applicable ? r.holdUp.level : null,
        drill_count: r.drills.length,
        last_drill_on: r.lastDrill ? r.lastDrill.date : null,
        last_drill_outcome: r.lastDrill ? r.lastDrill.outcome : null,
        exit_plan_summary: r.dependency.exitPlanSummary || '',
      }));
      return { columns, rows };
    }

    case 'powerStrategy': {
      const columns = [
        { key: 'game_id', header: 'game_id' },
        { key: 'status', header: 'status' },
        { key: 'verdict', header: 'verdict' },
        { key: 'confidence_band', header: 'confidence_band' },
        { key: 'player_count', header: 'player_count' },
        { key: 'quota_pct', header: 'quota_pct' },
        { key: 'quota_votes', header: 'quota_votes' },
        { key: 'total_votes', header: 'total_votes' },
        { key: 'coalition_feasible', header: 'coalition_feasible' },
        { key: 'min_winning_coalitions', header: 'min_winning_coalitions' },
        { key: 'veto_player_count', header: 'veto_player_count' },
        { key: 'dummy_player_count', header: 'dummy_player_count' },
        { key: 'power_hhi', header: 'power_hhi' },
        { key: 'banzhaf_max', header: 'banzhaf_max' },
        { key: 'shapley_max', header: 'shapley_max' },
        { key: 'target_cell', header: 'target_cell' },
        { key: 'target_is_nash', header: 'target_is_nash' },
        { key: 'pure_nash_count', header: 'pure_nash_count' },
        { key: 'has_pure_nash', header: 'has_pure_nash' },
        { key: 'mixed_p', header: 'mixed_p' },
        { key: 'mixed_q', header: 'mixed_q' },
        { key: 'alignment_cost', header: 'alignment_cost' },
        { key: 'leader_headroom', header: 'leader_headroom' },
        { key: 'incentive_feasible', header: 'incentive_feasible' },
        { key: 'robustness', header: 'robustness' },
        { key: 'robustness_band', header: 'robustness_band' },
        { key: 'coordination_loss', header: 'coordination_loss' },
        { key: 'price_of_anarchy', header: 'price_of_anarchy' },
        { key: 'realised_cell', header: 'realised_cell' },
        { key: 'engine_version', header: 'engine_version' },
      ];
      const settings = state.settings || {};
      const rows = (state.powerGames || []).map((g) => {
        const a = analyzePowerGame({ ...g, settingsStaleDays: settings.powerStaleDays, settingsFragileMargin: settings.powerFragileMargin }, state, now);
        const v = a.voting; const sol = a.game2x2;
        return {
          game_id: g.id,
          status: a.status,
          verdict: a.verdict,
          confidence_band: a.confidenceBand,
          player_count: v.players.length,
          quota_pct: v.quotaPct,
          quota_votes: v.quota,
          total_votes: v.total,
          coalition_feasible: v.coalitionFeasible ? 1 : 0,
          min_winning_coalitions: v.minimumWinningCoalitions.length,
          veto_player_count: v.players.filter((p) => p.veto).length,
          dummy_player_count: v.players.filter((p) => p.dummy).length,
          power_hhi: v.powerHhi,
          banzhaf_max: Math.max(...v.players.map((p) => p.banzhaf)),
          shapley_max: Math.max(...v.players.map((p) => p.shapleyShubik)),
          target_cell: a.targetCell,
          target_is_nash: a.targetIsNE ? 1 : 0,
          pure_nash_count: sol.pureNE.length,
          has_pure_nash: sol.hasPureNE ? 1 : 0,
          mixed_p: sol.mixed ? sol.mixed.pLeaderRow0 : null,
          mixed_q: sol.mixed ? sol.mixed.qRivalCol0 : null,
          alignment_cost: a.alignment.alignmentCost,
          leader_headroom: a.alignment.leaderHeadroom,
          incentive_feasible: a.alignment.feasible ? 1 : 0,
          robustness: a.robustness.relativeRobustness,
          robustness_band: a.robustness.band,
          coordination_loss: sol.coordinationLoss,
          price_of_anarchy: sol.priceOfAnarchy,
          realised_cell: g.realizedCell || null,
          engine_version: a.engineVersion,
        };
      });
      return { columns, rows };
    }

    case 'impact': {
      // Data-minimised impact telemetry. A pre-registered hypothesis is one of
      // the most sensitive things in the workspace — it reveals what the leader
      // intended, before they knew the answer — so this scope ships the
      // statistics and never the sentence. Execution snapshots add only bounded
      // status/counts; source IDs, trace IDs, titles and free text stay out.
      const columns = [
        { key: 'study_index', header: 'study_index' },
        { key: 'vital_id', header: 'vital_id' },
        { key: 'grade', header: 'grade' },
        { key: 'status', header: 'status' },
        { key: 'baseline_weeks', header: 'baseline_weeks' },
        { key: 'window_weeks', header: 'window_weeks' },
        { key: 'alpha', header: 'alpha' },
        { key: 'expected_effect', header: 'expected_effect' },
        { key: 'expected_confidence', header: 'expected_confidence' },
        { key: 'verdict', header: 'verdict' },
        { key: 'execution_status', header: 'execution_status' },
        { key: 'matching_transactions', header: 'matching_transactions' },
        { key: 'matching_root_transactions', header: 'matching_root_transactions' },
        { key: 'matching_step_events', header: 'matching_step_events' },
        { key: 'execution_rule_steps', header: 'execution_rule_steps' },
        { key: 'execution_changed_targets', header: 'execution_changed_targets' },
        { key: 'execution_new_typed_links', header: 'execution_new_typed_links' },
        { key: 'execution_emitted_events', header: 'execution_emitted_events' },
        { key: 'execution_truncated_transactions', header: 'execution_truncated_transactions' },
        { key: 'execution_trace_refs_omitted', header: 'execution_trace_refs_omitted' },
        { key: 'pre_periods', header: 'pre_periods' },
        { key: 'post_periods', header: 'post_periods' },
        { key: 'level_shift', header: 'level_shift' },
        { key: 'se_level', header: 'se_level' },
        { key: 'mde', header: 'mde' },
        { key: 'p_level', header: 'p_level' },
        { key: 'pre_trend_p', header: 'pre_trend_p' },
        { key: 'placebo_p', header: 'placebo_p' },
        { key: 'placebo_source', header: 'placebo_source' },
        { key: 'placebo_resolution', header: 'placebo_resolution' },
        { key: 'breakdown_pct_per_week', header: 'breakdown_pct_per_week' },
        { key: 'effect_ratio', header: 'effect_ratio' },
        { key: 'engine_version', header: 'engine_version' },
      ];
      const studies = Array.isArray(state.impactStudies) ? state.impactStudies : [];
      const rows = studies.map((studyRow, i) => {
        const ev = studyRow.status === 'scored' && studyRow.evaluation
          ? studyRow.evaluation
          : null;
        return {
          study_index: i + 1,
          vital_id: studyRow.vitalId || '',
          grade: ev?.grade || (studyRow.declaredOn && studyRow.windowStart && studyRow.declaredOn <= studyRow.windowStart ? 'confirmatory' : 'exploratory'),
          status: studyRow.status || 'running',
          baseline_weeks: studyRow.baselineWeeks ?? null,
          window_weeks: studyRow.windowWeeks ?? null,
          alpha: studyRow.alpha ?? null,
          expected_effect: studyRow.expectedEffect ?? null,
          expected_confidence: studyRow.expectedConfidence ?? null,
          verdict: studyRow.verdict || ev?.verdict || '',
          execution_status: studyRow.executionSnapshot?.status
            || (studyRow.status === 'scored' ? 'not-recorded' : 'pending'),
          matching_transactions: studyRow.executionSnapshot?.matchingTransactionCount ?? null,
          matching_root_transactions: studyRow.executionSnapshot?.matchingRootTransactions ?? null,
          matching_step_events: studyRow.executionSnapshot?.matchingStepEvents ?? null,
          execution_rule_steps: studyRow.executionSnapshot?.appliedRuleSteps ?? null,
          execution_changed_targets: studyRow.executionSnapshot?.changedTargetReferences ?? null,
          execution_new_typed_links: studyRow.executionSnapshot?.newTypedLinkReferences ?? null,
          execution_emitted_events: studyRow.executionSnapshot?.emittedEventReferences ?? null,
          execution_truncated_transactions: studyRow.executionSnapshot?.truncatedTransactions ?? null,
          execution_trace_refs_omitted: studyRow.executionSnapshot?.omittedTraceReferences ?? null,
          pre_periods: ev?.its?.nPre ?? null,
          post_periods: ev?.its?.nPost ?? null,
          level_shift: ev?.estimate ?? null,
          se_level: ev?.its?.seLevel ?? null,
          mde: ev?.its?.mde ?? null,
          p_level: ev?.its?.pLevel ?? null,
          pre_trend_p: ev?.preTrend?.p ?? null,
          placebo_p: ev?.placeboP ?? null,
          placebo_source: ev?.placeboSource || '',
          placebo_resolution: ev?.placeboResolution ?? null,
          breakdown_pct_per_week: ev?.breakdown?.pctOfPreMean ?? null,
          effect_ratio: ev?.effectRatio ?? null,
          engine_version: IMPACT_ENGINE_VERSION,
        };
      });
      return { columns, rows };
    }

    case 'networkTopology': {
      // Data-minimised ONA telemetry: dimensionless scores + integer counts,
      // keyed by an opaque node index. No names, titles or free text ever leave
      // the app through this scope (contextual-integrity / k-anonymity posture).
      const columns = [
        { key: 'node_index', header: 'node_index' },
        { key: 'degree', header: 'degree' },
        { key: 'degree_norm', header: 'degree_norm' },
        { key: 'tie_strength', header: 'tie_strength' },
        { key: 'pagerank', header: 'pagerank' },
        { key: 'betweenness', header: 'betweenness' },
        { key: 'closeness', header: 'closeness' },
        { key: 'burt_constraint', header: 'burt_constraint' },
        { key: 'clustering', header: 'clustering' },
        { key: 'contexts', header: 'contexts' },
        { key: 'is_isolated', header: 'is_isolated' },
        { key: 'is_broker', header: 'is_broker' },
        { key: 'is_bridge', header: 'is_bridge' },
        { key: 'is_key_person', header: 'is_key_person' },
        { key: 'primary_steward_of', header: 'primary_steward_of' },
        { key: 'unverified_backups', header: 'unverified_backups' },
        { key: 'removal_fragments_by', header: 'removal_fragments_by' },
        { key: 'removal_efficiency_loss', header: 'removal_efficiency_loss' },
        { key: 'removal_isolates', header: 'removal_isolates' },
        { key: 'tie_floor', header: 'tie_floor' },
        { key: 'network_density', header: 'network_density' },
        { key: 'network_centralization', header: 'network_centralization' },
        { key: 'network_components', header: 'network_components' },
        { key: 'engine_version', header: 'engine_version' },
      ];
      const report = buildNetworkReport(state, now);
      if (!report.ok) return { columns, rows: [] };
      const a = report.analysis; const m = a.metrics;
      const rows = a.perPerson.map((p, i) => ({
        node_index: i + 1,
        degree: p.degree,
        degree_norm: p.degreeNorm,
        tie_strength: p.strength,
        pagerank: p.pageRank,
        betweenness: p.betweenness,
        closeness: p.closeness,
        burt_constraint: p.constraint,
        clustering: p.clustering,
        contexts: p.contextCount,
        is_isolated: p.flags.includes('isolated') ? 1 : 0,
        is_broker: p.flags.includes('broker') ? 1 : 0,
        is_bridge: p.flags.includes('bridge') ? 1 : 0,
        is_key_person: p.keyPerson ? 1 : 0,
        primary_steward_of: p.stewardship.primaryOf,
        unverified_backups: p.stewardship.unverifiedBackup,
        removal_fragments_by: p.impact.fragmentsBy,
        removal_efficiency_loss: p.impact.efficiencyLoss,
        removal_isolates: p.impact.isolatesAfter,
        tie_floor: a.tieFloor,
        network_density: m.density,
        network_centralization: m.betweennessCentralization,
        network_components: m.componentCount,
        engine_version: a.engineVersion,
      }));
      return { columns, rows };
    }

    case 'allocation': {
      // CSV scope #33: the learned arm table. Aggregates by construction —
      // buildAllocationReport never exposes titles or people at this grain.
      const report = buildAllocationReport(state, now);
      const columns = [
        { key: 'currency', header: 'currency' },
        { key: 'horizon', header: 'horizon' },
        { key: 'settled_bets', header: 'settled_bets' },
        { key: 'settled_effort_days', header: 'settled_effort_days' },
        { key: 'mean_value_per_day', header: 'mean_value_per_day' },
        { key: 'median_value_per_day', header: 'median_value_per_day' },
        { key: 'exploration_bonus_per_day', header: 'exploration_bonus_per_day' },
        { key: 'ucb_index_per_day', header: 'ucb_index_per_day' },
        { key: 'verdict', header: 'verdict' },
        { key: 'is_next_marginal_day', header: 'is_next_marginal_day' },
        { key: 'hindsight_regret', header: 'hindsight_regret' },
        { key: 'exploration_floor_pct', header: 'exploration_floor_pct' },
        { key: 'funded_window_days', header: 'funded_window_days' },
        { key: 'funded_exploratory_share_pct', header: 'funded_exploratory_share_pct' },
        { key: 'exploration_starved', header: 'exploration_starved' },
        { key: 'engine_version', header: 'engine_version' },
      ];
      const rows = [];
      for (const block of report.armsByCurrency) {
        for (const arm of block.arms) {
          rows.push({
            currency: block.currency,
            horizon: arm.horizon,
            settled_bets: arm.n,
            settled_effort_days: arm.settledEffortDays,
            mean_value_per_day: arm.meanReward ?? '',
            median_value_per_day: arm.medianReward ?? '',
            exploration_bonus_per_day: arm.explorationBonus ?? '',
            ucb_index_per_day: arm.ucb ?? '',
            verdict: arm.verdict,
            is_next_marginal_day: block.leader && block.leader.horizon === arm.horizon ? 1 : 0,
            hindsight_regret: block.hindsightRegret ?? '',
            exploration_floor_pct: report.policy.floorPct,
            funded_window_days: report.policy.windowDays,
            funded_exploratory_share_pct: report.fundedFlow.explorationSharePct ?? '',
            exploration_starved: report.fundedFlow.starvation ? 1 : 0,
            engine_version: ALLOC_ENGINE_VERSION,
          });
        }
      }
      return { columns, rows };
    }

    case 'capital': {
      // CSV scope #39: allocation telemetry under opaque codes. The report is
      // the same read model the terminal shows, so the export cannot be more
      // certain than the screen — and the trust grade travels with every row.
      const report = buildCapitalReport(state, now);
      const columns = [
        { key: 'engine_version', header: 'engine_version' },
        { key: 'row_kind', header: 'row_kind' },
        { key: 'code', header: 'code' },
        { key: 'status', header: 'status' },
        { key: 'budget_effort_weeks', header: 'budget_effort_weeks' },
        { key: 'allocated_effort_weeks', header: 'allocated_effort_weeks' },
        { key: 'composite_score', header: 'composite_score' },
        { key: 'score_saturation', header: 'score_saturation' },
        { key: 'score_throughput', header: 'score_throughput' },
        { key: 'score_capacity', header: 'score_capacity' },
        { key: 'score_wip', header: 'score_wip' },
        { key: 'hire_pd_per_week', header: 'hire_pd_per_week' },
        { key: 'wip_cap_pct', header: 'wip_cap_pct' },
        { key: 'scope_cut_pct', header: 'scope_cut_pct' },
        { key: 'rework_investment', header: 'rework_investment' },
        { key: 'delegation_share', header: 'delegation_share' },
        { key: 'learning_share', header: 'learning_share' },
        { key: 'modelled_delta_saturation_pts', header: 'modelled_delta_saturation_pts' },
        { key: 'modelled_delta_throughput_days', header: 'modelled_delta_throughput_days' },
        { key: 'modelled_delta_capacity_pd_week', header: 'modelled_delta_capacity_pd_week' },
        { key: 'top_attributed_lever', header: 'top_attributed_lever' },
        { key: 'top_attributed_share_pct', header: 'top_attributed_share_pct' },
        { key: 'worst_case_regret', header: 'worst_case_regret' },
        { key: 'win_rate_pct', header: 'win_rate_pct' },
        { key: 'model_trust_grade', header: 'model_trust_grade' },
        { key: 'checkpoint_skill', header: 'checkpoint_skill' },
        { key: 'checkpoint_verdict', header: 'checkpoint_verdict' },
        { key: 'adequate', header: 'adequate' },
      ];
      if (!report.adequate) {
        return {
          columns,
          rows: [{ engine_version: CAP_ENGINE_VERSION, row_kind: 'unavailable', code: '', status: '', adequate: 0 }],
        };
      }
      const top = report.attribution?.contributions?.[0] || null;
      const baseRow = {
        engine_version: CAP_ENGINE_VERSION,
        budget_effort_weeks: report.budgetUnits,
        allocated_effort_weeks: report.allocation?.effort ?? '',
        composite_score: report.allocation?.score ?? '',
        score_saturation: report.objective?.parts?.saturation ?? '',
        score_throughput: report.objective?.parts?.throughput ?? '',
        score_capacity: report.objective?.parts?.capacity ?? '',
        score_wip: report.objective?.parts?.wip ?? '',
        top_attributed_lever: top?.key ?? '',
        top_attributed_share_pct: top?.sharePct ?? '',
        worst_case_regret: report.robustness?.portfolio?.maxRegret ?? '',
        win_rate_pct: report.robustness?.portfolio?.winRatePct ?? '',
        model_trust_grade: report.trust?.grade ?? '',
        checkpoint_skill: '',
        checkpoint_verdict: '',
        adequate: 1,
      };
      const rows = [];
      rows.push({
        ...baseRow,
        row_kind: 'recommendation',
        code: 'cap-rec-01',
        status: report.trust?.recommendation || '',
        ...Object.fromEntries(Object.entries(report.allocation?.levers || {}).map(([key, value]) => {
          const column = {
            hirePerWeek: 'hire_pd_per_week',
            wipCapPct: 'wip_cap_pct',
            scopeCutPct: 'scope_cut_pct',
            reworkInvestment: 'rework_investment',
            delegationShare: 'delegation_share',
            learningShare: 'learning_share',
          }[key];
          return column ? [column, value] : [key, value];
        })),
        modelled_delta_saturation_pts: report.evaluation?.delta?.saturationPct ?? '',
        modelled_delta_throughput_days: report.evaluation?.delta?.throughputDays ?? '',
        modelled_delta_capacity_pd_week: report.evaluation?.delta?.capacityPerWeek ?? '',
      });
      report.policies.forEach((policy, index) => {
        rows.push({
          ...baseRow,
          row_kind: 'portfolio',
          code: `cap-${String(index + 1).padStart(2, '0')}`,
          status: policy.status,
          budget_effort_weeks: policy.budgetUnits,
          allocated_effort_weeks: policy.effort,
          composite_score: policy.objective?.score ?? '',
          hire_pd_per_week: policy.levers?.hirePerWeek ?? 0,
          wip_cap_pct: policy.levers?.wipCapPct ?? 0,
          scope_cut_pct: policy.levers?.scopeCutPct ?? 0,
          rework_investment: policy.levers?.reworkInvestment ?? 0,
          delegation_share: policy.levers?.delegationShare ?? 0,
          learning_share: policy.levers?.learningShare ?? 0,
          modelled_delta_saturation_pts: policy.evaluation?.delta?.saturationPct ?? '',
          modelled_delta_throughput_days: policy.evaluation?.delta?.throughputDays ?? '',
          modelled_delta_capacity_pd_week: policy.evaluation?.delta?.capacityPerWeek ?? '',
          checkpoint_skill: policy.scoring?.skill ?? '',
          checkpoint_verdict: policy.scoring?.verdict ?? '',
        });
      });
      report.checkpoints.forEach((checkpoint, index) => {
        rows.push({
          ...baseRow,
          row_kind: 'checkpoint',
          code: `chk-${String(index + 1).padStart(2, '0')}`,
          status: checkpoint.subjectType,
          composite_score: '',
          hire_pd_per_week: '',
          wip_cap_pct: '',
          scope_cut_pct: '',
          rework_investment: '',
          delegation_share: '',
          learning_share: '',
          modelled_delta_saturation_pts: '',
          modelled_delta_throughput_days: '',
          modelled_delta_capacity_pd_week: '',
          checkpoint_skill: checkpoint.scoring?.skill ?? '',
          checkpoint_verdict: checkpoint.scoring?.verdict ?? '',
        });
      });
      return { columns, rows };
    }

    case 'watch': {
      // CSV scope #40: detector telemetry under opaque codes. The report is the
      // same read model the terminal renders, so this export cannot be more
      // certain than the screen — including its refusal to report precision or
      // skill below the evidence floor.
      const report = buildWatchReport(state, now);
      const columns = [
        { key: 'engine_version', header: 'engine_version' },
        { key: 'row_kind', header: 'row_kind' },
        { key: 'code', header: 'code' },
        { key: 'series', header: 'series' },
        { key: 'status', header: 'status' },
        { key: 'rule', header: 'rule' },
        { key: 'p_value', header: 'p_value' },
        { key: 'bh_rank', header: 'bh_rank' },
        { key: 'bh_m', header: 'bh_m' },
        { key: 'fdr_q', header: 'fdr_q' },
        { key: 'severity', header: 'severity' },
        { key: 'latest_value', header: 'latest_value' },
        { key: 'centre_line', header: 'centre_line' },
        { key: 'lower_limit', header: 'lower_limit' },
        { key: 'upper_limit', header: 'upper_limit' },
        { key: 'age_days', header: 'age_days' },
        { key: 'suppressed_reason', header: 'suppressed_reason' },
        { key: 'frozen_point', header: 'frozen_point' },
        { key: 'frozen_lo', header: 'frozen_lo' },
        { key: 'frozen_hi', header: 'frozen_hi' },
        { key: 'frozen_baseline', header: 'frozen_baseline' },
        { key: 'frozen_due_on', header: 'frozen_due_on' },
        { key: 'observed_value', header: 'observed_value' },
        { key: 'abs_error_model', header: 'abs_error_model' },
        { key: 'abs_error_naive', header: 'abs_error_naive' },
        { key: 'skill', header: 'skill' },
        { key: 'direction_hit', header: 'direction_hit' },
        { key: 'forecast_method', header: 'forecast_method' },
        { key: 'issued_on', header: 'issued_on' },
        { key: 'captured_on', header: 'captured_on' },
        { key: 'source_revised', header: 'source_revised' },
        { key: 'scoring_reason', header: 'scoring_reason' },
      ];
      const blank = {
        engine_version: EW_ENGINE_VERSION,
        rule: '',
        p_value: '',
        bh_rank: '',
        bh_m: '',
        fdr_q: '',
        severity: '',
        latest_value: '',
        centre_line: '',
        lower_limit: '',
        upper_limit: '',
        age_days: '',
        suppressed_reason: '',
        frozen_point: '',
        frozen_lo: '',
        frozen_hi: '',
        frozen_baseline: '',
        frozen_due_on: '',
        observed_value: '',
        abs_error_model: '',
        abs_error_naive: '',
        skill: '',
        direction_hit: '',
        forecast_method: '', issued_on: '', captured_on: '', source_revised: '', scoring_reason: '',
      };
      const rows = [];
      report.alerts.forEach((alert, index) => {
        const scoring = alert.scoredForecast || {};
        rows.push({
          ...blank,
          row_kind: 'alert',
          code: `ew-${String(index + 1).padStart(3, '0')}`,
          series: alert.seriesId,
          status: alert.status,
          rule: alert.rule || '',
          p_value: alert.pValue === null || alert.pValue === undefined ? '' : alert.pValue,
          bh_rank: alert.bhRank ?? '',
          bh_m: alert.m ?? '',
          fdr_q: alert.q ?? '',
          severity: alert.severity ?? '',
          latest_value: alert.latestValue ?? '',
          centre_line: alert.mean ?? '',
          lower_limit: alert.lnpl ?? '',
          upper_limit: alert.unpl ?? '',
          age_days: alert.ageDays ?? '',
          suppressed_reason: alert.suppressedReason || '',
          frozen_point: alert.frozen?.point ?? '',
          frozen_lo: alert.frozen?.lo ?? '',
          frozen_hi: alert.frozen?.hi ?? '',
          frozen_baseline: alert.frozen?.baselinePoint ?? '',
          frozen_due_on: alert.frozen?.dueOn ?? '',
          observed_value: scoring.observed ?? '',
          abs_error_model: scoring.absErrorModel ?? '',
          abs_error_naive: scoring.absErrorNaive ?? '',
          skill: scoring.skill ?? '',
          direction_hit: scoring.directionHit === true ? 1 : (scoring.directionHit === false ? 0 : ''),
          forecast_method: alert.frozen?.method || '', captured_on: scoring.capturedOn || '',
          source_revised: scoring.revised === true ? 1 : '', scoring_reason: scoring.reason || '',
        });
      });
      report.forecasts.forEach((forecast, index) => {
        const scoring = forecast.scoring || {};
        rows.push({
          ...blank,
          row_kind: 'forecast',
          code: `ewf-${String(index + 1).padStart(3, '0')}`,
          series: forecast.seriesId,
          status: scoring.scored === true ? 'scored' : (scoring.reason || 'pending'),
          fdr_q: report.policy.q,
          frozen_point: forecast.point ?? '',
          frozen_lo: forecast.lo ?? '',
          frozen_hi: forecast.hi ?? '',
          frozen_baseline: forecast.baselinePoint ?? '',
          frozen_due_on: forecast.dueOn || '',
          observed_value: scoring.observed ?? '',
          abs_error_model: scoring.absErrorModel ?? '',
          abs_error_naive: scoring.absErrorNaive ?? '',
          skill: scoring.skill ?? '',
          direction_hit: scoring.directionHit === true ? 1 : (scoring.directionHit === false ? 0 : ''),
          forecast_method: forecast.method || '', issued_on: forecast.issuedOn || '',
          captured_on: scoring.capturedOn || '', source_revised: scoring.revised === true ? 1 : '',
          scoring_reason: scoring.reason || '',
        });
      });
      if (!rows.length) {
        rows.push({ ...blank, row_kind: 'unavailable', code: '', series: '', status: 'no-alerts-or-forecasts' });
      }
      return { columns, rows };
    }

    case 'dynamics': {
      // CSV scope #38: model telemetry under opaque codes. `buildDynamicsReport`
      // never exposes names at this grain, and the report itself carries the
      // provenance split so an export cannot look more certain than the model.
      const report = buildDynamicsReport(state, now);
      const columns = [
        { key: 'engine_version', header: 'engine_version' },
        { key: 'record_code', header: 'record_code' },
        { key: 'status', header: 'status' },
        { key: 'horizon_weeks', header: 'horizon_weeks' },
        { key: 'hire_pd_per_week', header: 'hire_pd_per_week' },
        { key: 'wip_cap_pct', header: 'wip_cap_pct' },
        { key: 'scope_cut_pct', header: 'scope_cut_pct' },
        { key: 'rework_investment', header: 'rework_investment' },
        { key: 'delegation_share', header: 'delegation_share' },
        { key: 'learning_share', header: 'learning_share' },
        { key: 'predicted_end_saturation_pct', header: 'predicted_end_saturation_pct' },
        { key: 'modelled_end_saturation_pct', header: 'modelled_end_saturation_pct' },
        { key: 'modelled_delta_saturation_pts', header: 'modelled_delta_saturation_pts' },
        { key: 'modelled_end_wip_days', header: 'modelled_end_wip_days' },
        { key: 'modelled_delta_wip_days', header: 'modelled_delta_wip_days' },
        { key: 'verdict', header: 'verdict' },
        { key: 'structural_risk_pct', header: 'structural_risk_pct' },
        { key: 'dominant_loop', header: 'dominant_loop' },
        { key: 'assumed_parameter_pct', header: 'assumed_parameter_pct' },
        { key: 'adequate', header: 'adequate' },
      ];
      const rows = report.adequate
        ? report.experiments.map((experiment, index) => ({
            engine_version: DYN_ENGINE_VERSION,
            record_code: `dyn-${String(index + 1).padStart(2, '0')}`,
            status: experiment.status,
            horizon_weeks: experiment.horizonWeeks,
            hire_pd_per_week: experiment.levers?.hirePerWeek ?? 0,
            wip_cap_pct: experiment.levers?.wipCapPct ?? 0,
            scope_cut_pct: experiment.levers?.scopeCutPct ?? 0,
            rework_investment: experiment.levers?.reworkInvestment ?? 0,
            delegation_share: experiment.levers?.delegationShare ?? 0,
            learning_share: experiment.levers?.learningShare ?? 0,
            predicted_end_saturation_pct: experiment.predicted?.endSaturationPct ?? '',
            modelled_end_saturation_pct: experiment.evaluation?.scenario?.summary?.endSaturationPct ?? '',
            modelled_delta_saturation_pts: experiment.evaluation?.delta?.saturationPct ?? '',
            modelled_end_wip_days: experiment.evaluation?.scenario?.summary?.endWipDays ?? '',
            modelled_delta_wip_days: experiment.evaluation?.delta?.wipDays ?? '',
            verdict: experiment.evaluation?.verdict ?? '',
            structural_risk_pct: report.structuralRiskPct,
            dominant_loop: report.simulation?.summary?.dominantOverall ?? '',
            assumed_parameter_pct: report.provenance?.assumedPct ?? '',
            adequate: 1,
          }))
        : [{
            engine_version: DYN_ENGINE_VERSION,
            record_code: 'model',
            status: 'not-adequate',
            adequate: 0,
            assumed_parameter_pct: report.model?.provenance?.assumedPct ?? '',
          }];
      return { columns, rows };
    }

    case 'load': {
      // CSV scope #34: one row per active person under an opaque code. The
      // deterministic id sort makes the codes reproducible across exports
      // without ever emitting a name, role or free-text field.
      const report = buildLoadReport(state, now);
      const ordered = [...report.people].sort((a, b) => a.personId.localeCompare(b.personId));
      const codeById = new Map(ordered.map((p, i) => [p.personId, `load_person_${i + 1}`]));
      const columns = [
        { key: 'person_code', header: 'person_code' },
        { key: 'band', header: 'band' },
        { key: 'saturation_index', header: 'saturation_index' },
        { key: 'utilization_score', header: 'utilization_score' },
        { key: 'wip_score', header: 'wip_score' },
        { key: 'coordination_score', header: 'coordination_score' },
        { key: 'commitment_score', header: 'commitment_score' },
        { key: 'overload_probability', header: 'overload_probability' },
        { key: 'wip', header: 'wip' },
        { key: 'wip_limit', header: 'wip_limit' },
        { key: 'throughput_per_week', header: 'throughput_per_week' },
        { key: 'median_cycle_days', header: 'median_cycle_days' },
        { key: 'utilization_rho', header: 'utilization_rho' },
        { key: 'expected_wait_weeks', header: 'expected_wait_weeks' },
        { key: 'queue_confidence', header: 'queue_confidence' },
        { key: 'strong_tie_degree', header: 'strong_tie_degree' },
        { key: 'direct_reports', header: 'direct_reports' },
        { key: 'critical_stewardships', header: 'critical_stewardships' },
        { key: 'ramping', header: 'ramping' },
        { key: 'unquantified_commitments', header: 'unquantified_commitments' },
        { key: 'is_system_constraint', header: 'is_system_constraint' },
        { key: 'saturation_threshold_pct', header: 'saturation_threshold_pct' },
        { key: 'overload_threshold_pct', header: 'overload_threshold_pct' },
        { key: 'engine_version', header: 'engine_version' },
      ];
      const rows = ordered.map((p) => ({
        person_code: codeById.get(p.personId),
        band: p.band,
        saturation_index: p.index,
        utilization_score: p.scores.utilization,
        wip_score: p.scores.wip,
        coordination_score: p.scores.coordination,
        commitment_score: p.scores.commitments,
        overload_probability: p.mc.overloadProbability ?? '',
        wip: p.queue.wip,
        wip_limit: p.queue.wipLimit,
        throughput_per_week: p.queue.throughputPerWeek ?? '',
        median_cycle_days: p.queue.medianCycleDays ?? '',
        utilization_rho: p.queue.rho ?? '',
        expected_wait_weeks: p.queue.waitWeeks ?? '',
        queue_confidence: p.queue.confidence,
        strong_tie_degree: p.coordination.strongTieDegree,
        direct_reports: p.coordination.directReports,
        critical_stewardships: p.coordination.criticalStewardships,
        ramping: p.germane.ramping ? 1 : 0,
        unquantified_commitments: p.effort.unquantifiedCount,
        is_system_constraint: p.bottleneck ? 1 : 0,
        saturation_threshold_pct: report.policy.saturationPct,
        overload_threshold_pct: report.policy.overloadProbPct,
        engine_version: LOAD_ENGINE_VERSION,
      }));
      return { columns, rows };
    }

    case 'premises': {
      // CSV scope #35: one row per premise under an opaque code. Belief math
      // only — no titles, signposts, notes, people names or source text.
      const report = buildPremiseReport(state, now);
      const ordered = [...report.premises].sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const codeById = new Map(ordered.map((p, i) => [p.id, `premise_${i + 1}`]));
      const columns = [
        { key: 'premise_code', header: 'premise_code' },
        { key: 'status', header: 'status' },
        { key: 'criticality', header: 'criticality' },
        { key: 'prior_pct', header: 'prior_pct' },
        { key: 'posterior_pct', header: 'posterior_pct' },
        { key: 'watch_pct', header: 'watch_pct' },
        { key: 'breach_pct', header: 'breach_pct' },
        { key: 'log_bayes_factor', header: 'log_bayes_factor' },
        { key: 'bayes_factor', header: 'bayes_factor' },
        { key: 'evidence_count', header: 'evidence_count' },
        { key: 'support_count', header: 'support_count' },
        { key: 'against_count', header: 'against_count' },
        { key: 'discounted_weight_bits', header: 'discounted_weight_bits' },
        { key: 'information_gain_bits', header: 'information_gain_bits' },
        { key: 'confidence', header: 'confidence' },
        { key: 'sprt_verdict', header: 'sprt_verdict' },
        { key: 'scope_count', header: 'scope_count' },
        { key: 'pending_observations', header: 'pending_observations' },
        { key: 'stale_review', header: 'stale_review' },
        { key: 'half_life_days', header: 'half_life_days' },
        { key: 'policy_watch_pct', header: 'policy_watch_pct' },
        { key: 'policy_breach_pct', header: 'policy_breach_pct' },
        { key: 'engine_version', header: 'engine_version' },
      ];
      const rows = ordered.map((p) => ({
        premise_code: codeById.get(p.id),
        status: p.evaluation.status,
        criticality: p.criticality,
        prior_pct: p.evaluation.priorPct,
        posterior_pct: p.evaluation.posteriorPct,
        watch_pct: p.evaluation.watchPct,
        breach_pct: p.evaluation.breachPct,
        log_bayes_factor: p.evaluation.logBayesFactor,
        bayes_factor: p.evaluation.bayesFactor,
        evidence_count: p.evaluation.evidenceCount,
        support_count: p.evaluation.supportCount,
        against_count: p.evaluation.againstCount,
        discounted_weight_bits: p.evaluation.discountedWeightBits,
        information_gain_bits: p.evaluation.informationGainBits,
        confidence: p.evaluation.confidence,
        sprt_verdict: p.evaluation.sprtVerdict,
        scope_count: p.scopeCount,
        pending_observations: p.pendingCount,
        stale_review: p.reviewOverdue ? 1 : 0,
        half_life_days: p.evaluation.halfLifeDays,
        policy_watch_pct: report.policy.watchPct,
        policy_breach_pct: report.policy.breachPct,
        engine_version: PREMISE_ENGINE_VERSION,
      }));
      return { columns, rows };
    }

    case 'continuity': {
      // CSV scope #41: opaque drill and item codes only. A drill's free-text
      // note and every source title stay in the workspace.
      const drills = [...(state.continuityDrills || [])].sort((a, b) => String(a.startOn).localeCompare(String(b.startOn)));
      const codeById = new Map(drills.map((drill, index) => [drill.id, `drill_${index + 1}`]));
      const columns = [
        { key: 'drill_code', header: 'drill_code' },
        { key: 'start_on', header: 'start_on' },
        { key: 'end_on', header: 'end_on' },
        { key: 'status', header: 'status' },
        { key: 'item_code', header: 'item_code' },
        { key: 'stall_class', header: 'stall_class' },
        { key: 'frozen_probability', header: 'frozen_probability' },
        { key: 'observed_stall', header: 'observed_stall' },
        { key: 'drill_predictions', header: 'drill_predictions' },
        { key: 'drill_observed', header: 'drill_observed' },
        { key: 'unpredicted_stalls', header: 'unpredicted_stalls' },
        { key: 'brier_score', header: 'brier_score' },
        { key: 'base_rate', header: 'base_rate' },
        { key: 'brier_skill_score', header: 'brier_skill_score' },
        { key: 'precision_pct', header: 'precision_pct' },
        { key: 'recall_pct', header: 'recall_pct' },
        { key: 'outcome_mechanism', header: 'outcome_mechanism' },
        { key: 'model_misses', header: 'model_misses' },
        { key: 'implementation_drops', header: 'implementation_drops' },
        { key: 'execution_conditioned_brier', header: 'execution_conditioned_brier' },
        { key: 'counts_only', header: 'counts_only' },
        { key: 'engine_version', header: 'engine_version' },
      ];
      const rows = drills.flatMap((drill) => {
        const score = drill.status === 'closed' ? scoreDrillRecord(drill, { state, now }) : null;
        const mechanismByKey = new Map((score?.rows || []).map((r) => [r.key, r.mechanism]));
        const observed = new Set(drill.observedKeys || []);
        const items = (drill.predictions || []).slice().sort((a, b) => String(a.key).localeCompare(String(b.key)));
        if (!items.length) {
          return [{
            drill_code: codeById.get(drill.id),
            start_on: drill.startOn,
            end_on: drill.endOn,
            status: drill.status,
            item_code: null,
            stall_class: null,
            frozen_probability: null,
            observed_stall: null,
            drill_predictions: 0,
            drill_observed: 0,
            unpredicted_stalls: drill.unexpectedStalls || 0,
            brier_score: null,
            base_rate: null,
            brier_skill_score: null,
            precision_pct: null,
            recall_pct: null,
            outcome_mechanism: null,
            model_misses: null,
            implementation_drops: null,
            execution_conditioned_brier: null,
            counts_only: true,
            engine_version: CONTINUITY_ENGINE_VERSION,
          }];
        }
        return items.map((prediction, index) => ({
          drill_code: codeById.get(drill.id),
          start_on: drill.startOn,
          end_on: drill.endOn,
          status: drill.status,
          item_code: `item_${index + 1}`,
          stall_class: String(prediction.key).split('|')[0] || null,
          frozen_probability: prediction.pStall,
          observed_stall: drill.status === 'closed' ? (observed.has(prediction.key) ? 1 : 0) : null,
          drill_predictions: score?.n ?? items.length,
          drill_observed: score?.hits ?? null,
          unpredicted_stalls: drill.unexpectedStalls || 0,
          brier_score: score?.brier ?? null,
          base_rate: score?.baseRate ?? null,
          brier_skill_score: score?.skill ?? null,
          precision_pct: score?.precisionPct ?? null,
          recall_pct: score?.recallPct ?? null,
          outcome_mechanism: drill.status === 'closed' ? (mechanismByKey.get(prediction.key) || null) : null,
          model_misses: score?.attribution?.modelMissKeys?.length ?? null,
          implementation_drops: score?.attribution?.implementationDropKeys?.length ?? null,
          execution_conditioned_brier: score?.attribution?.executionConditionedBrier ?? null,
          counts_only: score ? score.countsOnly : true,
          engine_version: CONTINUITY_ENGINE_VERSION,
        }));
      });
      return { columns, rows };
    }

    case 'premiseCalibration': {
      // CSV scope #36: repeated sensor/premise rows have an opaque premise code;
      // never include human-entered notes or titles.
      const report = buildPremiseCalibrationReport(state);
      const ordered = [...new Set(report.sensors.flatMap((sensor) => sensor.samples.map((sample) => sample.premiseId)))].sort();
      const codeById = new Map(ordered.map((id, index) => [id, `premise_${index + 1}`]));
      const columns = [
        { key: 'sensor_id', header: 'sensor_id' },
        { key: 'premise_code', header: 'premise_code' },
        { key: 'settled_on', header: 'settled_on' },
        { key: 'forecast_probability', header: 'forecast_probability' },
        { key: 'observed_held', header: 'observed_held' },
        { key: 'distinct_sources', header: 'distinct_sources' },
        { key: 'sensor_sample_count', header: 'sensor_sample_count' },
        { key: 'brier_score', header: 'brier_score' },
        { key: 'calibration_gap', header: 'calibration_gap' },
        { key: 'directional_accuracy', header: 'directional_accuracy' },
        { key: 'forecast_mix_psi', header: 'forecast_mix_psi' },
        { key: 'engine_version', header: 'engine_version' },
      ];
      const rows = report.sensors.flatMap((sensor) => sensor.samples.map((sample) => ({
        sensor_id: sample.sensorId,
        premise_code: codeById.get(sample.premiseId),
        settled_on: sample.settledOn,
        forecast_probability: sample.forecast,
        observed_held: sample.observed,
        distinct_sources: sample.sourceCount,
        sensor_sample_count: sensor.count,
        brier_score: sensor.brier,
        calibration_gap: sensor.calibrationGap,
        directional_accuracy: sensor.accuracy,
        forecast_mix_psi: sensor.drift?.psi ?? null,
        engine_version: PREMISE_CALIBRATION_ENGINE_VERSION,
      })));
      return { columns, rows };
    }

    case 'premiseTails': {
      // CSV scope #37: numeric tail telemetry only, opaque premise codes.
      const sim = simulatePremiseTails(state, { now });
      const ordered = [...(sim.contributions || [])].sort((a, b) => String(a.premiseId).localeCompare(String(b.premiseId)));
      const codeById = new Map(ordered.map((c, i) => [c.premiseId, `premise_${i + 1}`]));
      const columns = [
        { key: 'premise_code', header: 'premise_code' },
        { key: 'status', header: 'status' },
        { key: 'posterior_pct', header: 'posterior_pct' },
        { key: 'failure_probability', header: 'failure_probability' },
        { key: 'shock', header: 'shock' },
        { key: 'coupled_items', header: 'coupled_items' },
        { key: 'tail_contribution_days', header: 'tail_contribution_days' },
        { key: 'baseline_p90', header: 'baseline_p90' },
        { key: 'coupled_p90', header: 'coupled_p90' },
        { key: 'widening_pct', header: 'widening_pct' },
        { key: 'pseudo_replicated', header: 'pseudo_replicated' },
        { key: 'largest_source_share', header: 'largest_source_share' },
        { key: 'engine_version', header: 'engine_version' },
      ];
      const rows = ordered.map((c) => ({
        premise_code: codeById.get(c.premiseId),
        status: c.status, posterior_pct: c.posteriorPct,
        failure_probability: c.failureProbability, shock: c.shock,
        coupled_items: c.itemCount, tail_contribution_days: c.tailContributionDays,
        baseline_p90: sim.baseline?.p90 ?? null, coupled_p90: sim.coupled?.p90 ?? null,
        widening_pct: sim.delta?.wideningPct ?? null,
        pseudo_replicated: c.pseudoReplicated ? 1 : 0,
        largest_source_share: c.largestSourceShare,
        engine_version: PREMISE_TAILS_ENGINE_VERSION,
      }));
      return { columns, rows };
    }

    case 'scorecardIntegrity': {
      // CSV scope #42: modelled incentive distortion with zero free text. Task
      // names, objectives and observation notes stay in the workspace; a
      // scorecard is identified by a stable opaque code.
      const cards = [...(state.scorecards || [])].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      const codeById = new Map(cards.map((row, index) => [row.id, `scorecard_${index + 1}`]));
      const columns = [
        { key: 'scorecard_code', header: 'scorecard_code' },
        { key: 'status', header: 'status' },
        { key: 'review_on', header: 'review_on' },
        { key: 'stakes_pct', header: 'stakes_pct' },
        { key: 'detection_pct', header: 'detection_pct' },
        { key: 'uncounted_floor_pct', header: 'uncounted_floor_pct' },
        { key: 'measured_tasks', header: 'measured_tasks' },
        { key: 'uncounted_tasks', header: 'uncounted_tasks' },
        { key: 'modelled_efficiency_pct', header: 'modelled_efficiency_pct' },
        { key: 'modelled_gaming_share_pct', header: 'modelled_gaming_share_pct' },
        { key: 'goodhart_index', header: 'goodhart_index' },
        { key: 'worst_metric_goodhart', header: 'worst_metric_goodhart' },
        { key: 'recommended_design', header: 'recommended_design' },
        { key: 'recommended_lift', header: 'recommended_lift' },
        { key: 'frozen_efficiency_pct', header: 'frozen_efficiency_pct' },
        { key: 'frozen_gaming_pct', header: 'frozen_gaming_pct' },
        { key: 'falsifier_margin_pp', header: 'falsifier_margin_pp' },
        { key: 'observed_gaming_pct', header: 'observed_gaming_pct' },
        { key: 'observation_error_pp', header: 'observation_error_pp' },
        { key: 'cosmetic_gap_pp', header: 'cosmetic_gap_pp' },
        { key: 'engine_version', header: 'engine_version' },
      ];
      const rows = cards.map((row) => {
        const integrity = scorecardIntegrity(row);
        const score = integrity.observationScore;
        return {
          scorecard_code: codeById.get(row.id),
          status: row.status,
          review_on: row.reviewOn || null,
          stakes_pct: integrity.equilibrium.params.stakesPct,
          detection_pct: integrity.equilibrium.params.detectionPct,
          uncounted_floor_pct: integrity.equilibrium.params.professionalismPct,
          measured_tasks: integrity.equilibrium.counts.measured,
          uncounted_tasks: integrity.equilibrium.counts.uncounted ?? integrity.equilibrium.counts.unmeasured,
          modelled_efficiency_pct: integrity.equilibrium.efficiencyPct,
          modelled_gaming_share_pct: integrity.equilibrium.gamingSharePct,
          goodhart_index: integrity.goodhart.portfolioIndex,
          worst_metric_goodhart: integrity.goodhart.worst ? integrity.goodhart.worst.goodhartIndex : null,
          recommended_design: integrity.ranking.recommend ? integrity.ranking.best.id : 'current',
          recommended_lift: integrity.ranking.recommend ? integrity.ranking.lift : 0,
          frozen_efficiency_pct: row.frozen?.prediction?.efficiencyPct ?? null,
          frozen_gaming_pct: row.frozen?.prediction?.gamingSharePct ?? null,
          falsifier_margin_pp: row.frozen?.prediction?.falsifierMarginPp ?? null,
          observed_gaming_pct: score ? score.observedGamingPct : null,
          observation_error_pp: score ? score.errorPp : null,
          cosmetic_gap_pp: score ? score.cosmeticGapPp : null,
          engine_version: MEASUREMENT_ENGINE_VERSION,
        };
      });
      return { columns, rows };
    }

    case 'propagationLineage': {
      // CSV scope #43 is aggregated by type and count. The workspace-local JSON
      // backup is the only export that carries exact lineage references.
      const columns = [
        { key: 'source_event_type', header: 'source_event_type' },
        { key: 'source_entity_type', header: 'source_entity_type' },
        { key: 'rule_type', header: 'rule_type' },
        { key: 'event_type', header: 'event_type' },
        { key: 'changed_modules', header: 'changed_modules' },
        { key: 'changed_record_types', header: 'changed_record_types' },
        { key: 'typed_link_types', header: 'typed_link_types' },
        { key: 'emitted_event_types', header: 'emitted_event_types' },
        { key: 'transactions', header: 'transactions' },
        { key: 'rule_steps', header: 'rule_steps' },
        { key: 'created_records', header: 'created_records' },
        { key: 'updated_records', header: 'updated_records' },
        { key: 'removed_records', header: 'removed_records' },
        { key: 'typed_links_added', header: 'typed_links_added' },
        { key: 'emitted_events', header: 'emitted_events' },
        { key: 'truncated_transactions', header: 'truncated_transactions' },
        { key: 'omitted_targets', header: 'omitted_targets' },
        { key: 'omitted_links', header: 'omitted_links' },
        { key: 'omitted_events', header: 'omitted_events' },
      ];
      const groups = new Map();
      for (const trace of Array.isArray(state.propagationLineage) ? state.propagationLineage : []) {
        for (const step of Array.isArray(trace.steps) ? trace.steps : []) {
          const targets = Array.isArray(step.targets) ? step.targets : [];
          const links = Array.isArray(step.links) ? step.links : [];
          const emitted = Array.isArray(step.emitted) ? step.emitted : [];
          const dimensions = {
            source_event_type: trace.rootEvent?.type || '',
            source_entity_type: trace.rootEvent?.entity || '',
            rule_type: step.rule || '',
            event_type: step.event?.type || '',
            changed_modules: [...new Set(Array.isArray(step.changedCollections) ? step.changedCollections : [])].sort().join('|'),
            changed_record_types: [...new Set(targets.map((target) => target?.type).filter(Boolean))].sort().join('|'),
            typed_link_types: [...new Set(links.map((link) => `${link?.sourceType || ''}:${link?.relation || ''}:${link?.targetType || ''}`))].sort().join('|'),
            emitted_event_types: [...new Set(emitted.map((event) => event?.type).filter(Boolean))].sort().join('|'),
          };
          const key = JSON.stringify(dimensions);
          let group = groups.get(key);
          if (!group) {
            group = {
              ...dimensions,
              transactionIds: new Set(),
              truncatedTransactionIds: new Set(),
              rule_steps: 0,
              created_records: 0,
              updated_records: 0,
              removed_records: 0,
              typed_links_added: 0,
              emitted_events: 0,
              omitted_targets: 0,
              omitted_links: 0,
              omitted_events: 0,
            };
            groups.set(key, group);
          }
          group.transactionIds.add(trace.id);
          if (Number(trace.truncatedSteps) > 0) group.truncatedTransactionIds.add(trace.id);
          group.rule_steps += 1;
          group.created_records += targets.filter((target) => target?.change === 'created').length;
          group.updated_records += targets.filter((target) => target?.change === 'updated').length;
          group.removed_records += targets.filter((target) => target?.change === 'removed').length;
          group.typed_links_added += links.length;
          group.emitted_events += emitted.length;
          group.omitted_targets += Number(step.omittedTargets) || 0;
          group.omitted_links += Number(step.omittedLinks) || 0;
          group.omitted_events += Number(step.omittedEvents) || 0;
        }
      }
      const rows = [...groups.values()].map((group) => {
        const { transactionIds, truncatedTransactionIds, ...row } = group;
        return {
          ...row,
          transactions: transactionIds.size,
          truncated_transactions: truncatedTransactionIds.size,
        };
      }).sort((a, b) => [a.source_event_type, a.rule_type, a.event_type].join('|')
        .localeCompare([b.source_event_type, b.rule_type, b.event_type].join('|')));
      return { columns, rows };
    }

    case 'fidelity': {
      // CSV scope #44. Delivery telemetry at the plan grain: opaque plan codes
      // and derived ratios only. Titles, intervention labels, attestation notes
      // and record IDs never leave the workspace through this scope.
      const columns = [
        { key: 'plan_code', header: 'plan_code' },
        { key: 'intervention_type', header: 'intervention_type' },
        { key: 'status', header: 'status' },
        { key: 'window_days', header: 'window_days' },
        { key: 'population_source', header: 'population_source' },
        { key: 'planned_units', header: 'planned_units' },
        { key: 'delivered_units', header: 'delivered_units' },
        { key: 'reach_pct', header: 'reach_pct' },
        { key: 'dose_pct', header: 'dose_pct' },
        { key: 'delivery_quality_pct', header: 'delivery_quality_pct' },
        { key: 'sustain_pct', header: 'sustain_pct' },
        { key: 'adaptation_score_pct', header: 'adaptation_score_pct' },
        { key: 'fidelity_index_pct', header: 'fidelity_index_pct' },
        { key: 'evidence_coverage_pct', header: 'evidence_coverage_pct' },
        { key: 'grade', header: 'grade' },
        { key: 'exposure_pct', header: 'exposure_pct' },
        { key: 'under_exposed', header: 'under_exposed' },
        { key: 'attested_stages', header: 'attested_stages' },
        { key: 'agreement_concordant', header: 'agreement_concordant' },
        { key: 'agreement_optimistic', header: 'agreement_optimistic' },
        { key: 'agreement_conservative', header: 'agreement_conservative' },
        { key: 'overdue_checkpoints', header: 'overdue_checkpoints' },
        { key: 'settled', header: 'settled' },
        { key: 'settled_exposure_pct', header: 'settled_exposure_pct' },
        { key: 'study_implementation_status', header: 'study_implementation_status' },
        { key: 'study_exposure_pct', header: 'study_exposure_pct' },
        { key: 'study_per_complier_effect', header: 'study_per_complier_effect' },
        { key: 'study_dilution_factor', header: 'study_dilution_factor' },
      ];
      const today = dayKey(now);
      const rows = (state.fidelityPlans || []).map((plan, index) => {
        const reading = observeFidelity(plan, state, now);
        const study = plan.studyId
          ? (state.impactStudies || []).find((row) => row && row.id === plan.studyId)
          : null;
        const snapshot = study?.implementationSnapshot || null;
        const agreementCount = (kind) => reading.stages.filter((row) => row.agreement === kind).length;
        return {
          plan_code: `P${String(index + 1).padStart(3, '0')}`,
          intervention_type: plan.interventionType,
          status: plan.status,
          window_days: reading.window.days ?? '',
          population_source: reading.population.source,
          planned_units: reading.plannedUnits ?? '',
          delivered_units: reading.unitCount,
          reach_pct: reading.components.reachPct ?? '',
          dose_pct: reading.components.dosePct ?? '',
          delivery_quality_pct: reading.components.fidelityPct ?? '',
          sustain_pct: reading.components.sustainPct ?? '',
          adaptation_score_pct: reading.stages.find((row) => row.key === 'adaptation')?.score === null
            || reading.stages.find((row) => row.key === 'adaptation')?.score === undefined
            ? ''
            : Math.round(reading.stages.find((row) => row.key === 'adaptation').score * 1000) / 10,
          fidelity_index_pct: reading.index === null ? '' : Math.round(reading.index * 1000) / 10,
          evidence_coverage_pct: Math.round(reading.coverage * 1000) / 10,
          grade: reading.grade.id,
          exposure_pct: reading.exposurePct ?? '',
          under_exposed: reading.underExposed === null ? '' : (reading.underExposed ? 'yes' : 'no'),
          attested_stages: reading.stages.filter((row) => row.attested).length,
          agreement_concordant: agreementCount('concordant'),
          agreement_optimistic: agreementCount('optimistic'),
          agreement_conservative: agreementCount('conservative'),
          overdue_checkpoints: (plan.stages || []).filter((stage) => stage
            && stage.targetOn
            && !stage.attested
            && plan.status === 'active'
            && stage.targetOn < today).length,
          settled: plan.status === 'settled' ? 'yes' : 'no',
          settled_exposure_pct: plan.settlement?.exposurePct ?? '',
          study_implementation_status: snapshot?.status ?? '',
          study_exposure_pct: snapshot?.exposurePct ?? '',
          study_per_complier_effect: snapshot?.perComplierEffect ?? '',
          study_dilution_factor: snapshot?.dilutionFactor ?? '',
        };
      });
      return { columns, rows };
    }

    case 'transition': {
      const columns = [
        { key: 'programme_code', header: 'programme_code' },
        { key: 'status', header: 'status' },
        { key: 'kind', header: 'kind' },
        { key: 'currency', header: 'currency' },
        { key: 'effective_in_days', header: 'effective_in_days' },
        { key: 'dimension', header: 'dimension' },
        { key: 'target_headcount', header: 'target_headcount' },
        { key: 'has_cost_ceiling', header: 'has_cost_ceiling' },
        { key: 'named_exits', header: 'named_exits' },
        { key: 'unpriced_exits', header: 'unpriced_exits' },
        { key: 'cash_cost', header: 'cash_cost' },
        { key: 'replacement_exposure', header: 'replacement_exposure' },
        { key: 'capability_lost_pct', header: 'capability_lost_pct' },
        { key: 'screen_status', header: 'screen_status' },
        { key: 'screen_group_count', header: 'screen_group_count' },
        { key: 'screen_ratio', header: 'screen_ratio' },
        { key: 'screen_threshold', header: 'screen_threshold' },
        { key: 'screen_flagged', header: 'screen_flagged' },
        { key: 'screen_reliable', header: 'screen_reliable' },
        { key: 'compliant_swaps', header: 'compliant_swaps' },
        { key: 'compliant_cost_delta', header: 'compliant_cost_delta' },
        { key: 'stability_draws', header: 'stability_draws' },
        { key: 'stability_core', header: 'stability_core' },
        { key: 'stability_knife_edge', header: 'stability_knife_edge' },
        { key: 'sole_holder_blockers', header: 'sole_holder_blockers' },
        { key: 'handovers_required', header: 'handovers_required' },
        { key: 'survivor_load_before_median', header: 'survivor_load_before_median' },
        { key: 'survivor_load_after_median', header: 'survivor_load_after_median' },
        { key: 'survivor_flagged', header: 'survivor_flagged' },
        { key: 'pareto_frontier', header: 'pareto_frontier' },
        { key: 'resolved_predictions', header: 'resolved_predictions' },
      ];
      const rows = (state.transitionPrograms || []).map((program, index) => {
        const reading = transitionReading(state, program, now, { depth: 'fast' });
        return {
          // Opaque, positional, and stable for the life of the export: the code
          // exists so two rows can be told apart, not so a reader can identify
          // which reduction this was.
          programme_code: `P${String(index + 1).padStart(2, '0')}`,
          status: program.status,
          kind: program.kind,
          currency: program.currency,
          effective_in_days: daysBetween(today, program.effectiveOn) ?? '',
          dimension: program.dimension,
          target_headcount: program.target?.headcount ?? 0,
          has_cost_ceiling: Number.isFinite(Number(program.target?.costCeiling)) ? 'yes' : 'no',
          named_exits: reading.plan.proposed.length,
          unpriced_exits: reading.plan.unpriced,
          cash_cost: reading.plan.cost,
          replacement_exposure: reading.plan.replacementExposure,
          capability_lost_pct: reading.plan.capabilityLostPct,
          screen_status: reading.screen.status,
          screen_group_count: reading.screen.groups?.length ?? 0,
          screen_ratio: reading.screen.ratio ?? '',
          screen_threshold: reading.screen.threshold ?? '',
          screen_flagged: reading.screen.flagged ? 'yes' : 'no',
          screen_reliable: reading.screen.reliable ? 'yes' : 'no',
          compliant_swaps: reading.compliance?.swaps?.length ?? '',
          compliant_cost_delta: reading.compliance?.costDelta ?? '',
          stability_draws: reading.robustness?.draws ?? 0,
          stability_core: reading.robustness?.core?.length ?? 0,
          stability_knife_edge: reading.robustness?.knifeEdge?.length ?? 0,
          sole_holder_blockers: reading.continuity.blockers.length,
          handovers_required: reading.continuity.atRisk.length,
          survivor_load_before_median: reading.survivors.beforeMedian ?? '',
          survivor_load_after_median: reading.survivors.afterMedian ?? '',
          survivor_flagged: reading.survivors.flagged.length,
          // Which paths survive Pareto dominance, or `none` when one path
          // dominates. This is not a recommendation: the export must never be
          // read as "the system chose the redundancy path".
          pareto_frontier: (reading.options.frontier || []).join('|') || 'single-dominant',
          resolved_predictions: (program.outcomes || []).length,
        };
      });
      return { columns, rows };
    }

    case 'autopilot': {
      // CSV scope #50. Governance telemetry at the agreement grain. An
      // agreement's name, purpose, thresholds and action text name the
      // leader's own people, cases and thresholds, so none of them leave the
      // workspace through this scope — only vocabulary codes and counts.
      const apColumns = [
        { key: 'agreement_code', header: 'agreement_code' },
        { key: 'status', header: 'status' },
        { key: 'source_type', header: 'source_type' },
        { key: 'trigger_event', header: 'trigger_event' },
        { key: 'version', header: 'version' },
        { key: 'condition_count', header: 'condition_count' },
        { key: 'action_count', header: 'action_count' },
        { key: 'action_types', header: 'action_types' },
        { key: 'budget_used', header: 'budget_used' },
        { key: 'budget_max', header: 'budget_max' },
        { key: 'lifetime_runs', header: 'lifetime_runs' },
        { key: 'runs_applied', header: 'runs_applied' },
        { key: 'runs_reused', header: 'runs_reused' },
        { key: 'runs_blocked', header: 'runs_blocked' },
        { key: 'has_pause_reason', header: 'has_pause_reason' },
      ];
      const apPolicies = Array.isArray(state.autopilotPolicies) ? state.autopilotPolicies : [];
      const apRuns = Array.isArray(state.autopilotRuns) ? state.autopilotRuns : [];
      const apRows = apPolicies.map((policy, index) => {
        const mine = apRuns.filter((run) => run && run.policyId === policy.id);
        return {
          agreement_code: `G${String(index + 1).padStart(2, '0')}`,
          status: policy.status || '',
          source_type: policy.sourceType || '',
          trigger_event: policy.trigger || '',
          version: policy.version ?? '',
          condition_count: (policy.conditions || []).length,
          action_count: (policy.actions || []).length,
          action_types: (policy.actions || []).map((a) => a.type).join('|'),
          budget_used: policy.activationRunCount ?? '',
          budget_max: policy.maxRuns ?? '',
          lifetime_runs: policy.runCount ?? '',
          runs_applied: mine.filter((r) => r.status === 'applied').length,
          runs_reused: mine.filter((r) => r.status === 'reused').length,
          runs_blocked: mine.filter((r) => r.status === 'blocked').length,
          has_pause_reason: policy.pausedReason ? 'yes' : 'no',
        };
      });
      return { columns: apColumns, rows: apRows };
    }

    case 'signalPath': {
      // CSV scope #51. Channel telemetry at the class grain. The class label,
      // the origin person, the relays, the case titles that landed on the path
      // and every absolute amount stay in the workspace: a signal class names
      // the leader's own team composition and their own exposure. It leaves as
      // S01 with ratios, counts and bits — never a name and never a figure that
      // could be read as the leader's own risk appetite in money.
      const columns = [
        { key: 'class_code', header: 'class_code' },
        { key: 'status', header: 'status' },
        { key: 'currency_code', header: 'currency_code' },
        { key: 'hop_count', header: 'hop_count' },
        { key: 'declared_reach_pct', header: 'declared_reach_pct' },
        { key: 'false_alarm_pct', header: 'false_alarm_pct' },
        { key: 'conditional_lag_days', header: 'conditional_lag_days' },
        { key: 'carried_bits', header: 'carried_bits' },
        { key: 'source_bits', header: 'source_bits' },
        { key: 'lost_bits', header: 'lost_bits' },
        { key: 'below_blind_floor', header: 'below_blind_floor' },
        { key: 'declared_prior_pct', header: 'declared_prior_pct' },
        { key: 'horizon_days', header: 'horizon_days' },
        { key: 'exposure_declared', header: 'exposure_declared' },
        { key: 'expected_loss_ratio', header: 'expected_loss_ratio' },
        { key: 'prediction_frozen', header: 'prediction_frozen' },
        { key: 'probes_settled', header: 'probes_settled' },
        { key: 'event_probes', header: 'event_probes' },
        { key: 'quiet_probes', header: 'quiet_probes' },
        { key: 'delivered_count', header: 'delivered_count' },
        { key: 'observed_reach_pct', header: 'observed_reach_pct' },
        { key: 'observed_lag_median_days', header: 'observed_lag_median_days' },
        { key: 'd_prime', header: 'd_prime' },
        { key: 'brier_score', header: 'brier_score' },
      ];
      const classes = Array.isArray(state.signalClasses) ? state.signalClasses : [];
      const probes = Array.isArray(state.signalProbes) ? state.signalProbes : [];
      const conventions = signalConventionsFromSettings(state.settings);
      const index = buildReportingIndex(state.people || []);
      const rows = classes.map((klass, index_) => {
        const reading = readClass(klass, state, index, conventions, now);
        const mine = probes.filter((p) => p && p.classId === klass.id);
        const settled = mine.filter((p) => p.status === 'settled');
        const events = settled.filter((p) => p.truth === 'event');
        const delivered = events.filter((p) => p.delivered === true);
        const quiet = settled.filter((p) => p.truth === 'none');
        const exposure = reading.reading.exposure;
        const loss = reading.reading.expectedLoss;
        return {
          class_code: `S${String(index_ + 1).padStart(2, '0')}`,
          status: klass.status || '',
          currency_code: klass.currency || '',
          hop_count: reading.reading.hopCount,
          declared_reach_pct: Math.round(reading.reading.reach * 1000) / 10,
          false_alarm_pct: Math.round(reading.reading.falseAlarm * 1000) / 10,
          conditional_lag_days: reading.reading.latencyDays,
          carried_bits: reading.reading.carriedBits,
          source_bits: reading.reading.sourceBits,
          lost_bits: reading.reading.lostBits,
          below_blind_floor: reading.reading.reach < (state.settings?.sigBlindFloorPct ?? 50) / 100 ? 'yes' : 'no',
          declared_prior_pct: klass.probabilityPct,
          horizon_days: klass.horizonDays,
          exposure_declared: exposure === null ? 'no' : 'yes',
          expected_loss_ratio: exposure === null || exposure <= 0 || loss === null
            ? ''
            : Math.round((loss / exposure) * 1000) / 1000,
          prediction_frozen: klass.frozen ? 'yes' : 'no',
          probes_settled: settled.length,
          event_probes: events.length,
          quiet_probes: quiet.length,
          delivered_count: delivered.length,
          observed_reach_pct: events.length ? Math.round((delivered.length / events.length) * 1000) / 10 : '',
          observed_lag_median_days: reading.observed.medianLatency ?? '',
          d_prime: reading.observed.sensitivity ? reading.observed.sensitivity.dPrime : '',
          brier_score: reading.observed.brier ? reading.observed.brier.score : '',
        };
      });
      return { columns, rows };
    }
    case 'attention': {
      // CSV scope #49. Derived telemetry at the plan grain. The plan label, the
      // obligation titles, the record pointers, the delegate names and every
      // absolute amount stay in the workspace: an allocation plan names the
      // leader's own negotiation, their own dependency and their own report, and
      // a row that leaked any of those would be a disclosure dressed as a metric.
      const columns = [
        { key: 'plan_code', header: 'plan_code' },
        { key: 'status', header: 'status' },
        { key: 'currency_code', header: 'currency_code' },
        { key: 'budget_hours', header: 'budget_hours' },
        { key: 'allocated_hours', header: 'allocated_hours' },
        { key: 'unspent_hours', header: 'unspent_hours' },
        { key: 'budget_binding', header: 'budget_binding' },
        { key: 'next_hour_value', header: 'next_hour_value' },
        { key: 'solver_mode', header: 'solver_mode' },
        { key: 'optimal', header: 'optimal' },
        { key: 'gap_to_bound_pct', header: 'gap_to_bound_pct' },
        { key: 'bought_count', header: 'bought_count' },
        { key: 'handed_off_count', header: 'handed_off_count' },
        { key: 'forgone_count', header: 'forgone_count' },
        { key: 'priced_obligations', header: 'priced_obligations' },
        { key: 'unpriced_obligations', header: 'unpriced_obligations' },
        { key: 'unpriced_hours', header: 'unpriced_hours' },
        { key: 'priceable_share_pct', header: 'priceable_share_pct' },
        { key: 'delegate_pool_hours', header: 'delegate_pool_hours' },
        { key: 'delegate_load_hours', header: 'delegate_load_hours' },
        { key: 'delegate_binding', header: 'delegate_binding' },
        { key: 'reviewed', header: 'reviewed' },
        { key: 'attainment_pct', header: 'attainment_pct' },
        { key: 'realised_items', header: 'realised_items' },
        { key: 'contradicted_items', header: 'contradicted_items' },
        { key: 'open_items', header: 'open_items' },
        { key: 'unmeasured_items', header: 'unmeasured_items' },
        { key: 'brier_score', header: 'brier_score' },
      ];
      const plans = Array.isArray(state.attentionPlans) ? state.attentionPlans : [];
      const rows = plans.map((plan, index) => {
        const result = plan.result || {};
        const review = plan.review || null;
        const items = Array.isArray(result.items) ? result.items : [];
        return {
          plan_code: `P${String(index + 1).padStart(2, '0')}`,
          status: plan.status || '',
          currency_code: result.currency || '',
          budget_hours: result.budgetHours ?? '',
          allocated_hours: result.usedHours ?? '',
          unspent_hours: result.leftHours ?? '',
          budget_binding: result.saturated === true ? 'yes' : 'no',
          next_hour_value: result.shadowPrice ?? '',
          solver_mode: result.solverMode || '',
          optimal: result.optimal === true ? 'yes' : 'no',
          gap_to_bound_pct: result.gapPct ?? '',
          bought_count: items.length,
          handed_off_count: items.filter((row) => row && row.mode === 'delegate').length,
          forgone_count: (result.forgone || []).length,
          priced_obligations: '',
          unpriced_obligations: result.unpricedCount ?? '',
          unpriced_hours: result.unpricedHours ?? '',
          priceable_share_pct: result.coveragePct ?? '',
          delegate_pool_hours: result.delegateCapacity ?? '',
          delegate_load_hours: result.delegateHoursUsed ?? '',
          delegate_binding: result.delegateBinding === true ? 'yes' : 'no',
          reviewed: review ? 'yes' : 'no',
          attainment_pct: review?.attainmentPct ?? '',
          realised_items: review?.counts?.realised ?? '',
          contradicted_items: review?.counts?.contradicted ?? '',
          open_items: review?.counts?.open ?? '',
          unmeasured_items: review?.counts?.unmeasured ?? '',
          brier_score: review?.brier ?? '',
        };
      });
      return { columns, rows };
    }

    case 'voi': {
      // CSV scope #48. Ratios and counts under opaque positional codes. The
      // payoff table, the frame label, the question and the premise title never
      // leave the workspace through this scope: an EVPI with a name attached is
      // a disclosure about a negotiation, and an absolute amount is a number
      // that is meaningful only beside the currency it was declared in.
      const columns = [
        { key: 'frame_code', header: 'frame_code' },
        { key: 'status', header: 'status' },
        { key: 'states', header: 'states' },
        { key: 'options', header: 'options' },
        { key: 'priced_cells', header: 'priced_cells' },
        { key: 'total_cells', header: 'total_cells' },
        { key: 'priced_share_pct', header: 'priced_share_pct' },
        { key: 'probability_sum_pct', header: 'probability_sum_pct' },
        { key: 'arithmetic', header: 'arithmetic' },
        { key: 'refusal_codes', header: 'refusal_codes' },
        { key: 'evpi_share_of_stake_pct', header: 'evpi_share_of_stake_pct' },
        { key: 'near_tie', header: 'near_tie' },
        { key: 'robust_differs_from_expected', header: 'robust_differs_from_expected' },
        { key: 'premise_states', header: 'premise_states' },
        { key: 'investigations', header: 'investigations' },
        { key: 'investigation_code', header: 'investigation_code' },
        { key: 'investigation_status', header: 'investigation_status' },
        { key: 'overdue', header: 'overdue' },
        { key: 'sensitivity_pct', header: 'sensitivity_pct' },
        { key: 'specificity_pct', header: 'specificity_pct' },
        { key: 'cost_present', header: 'cost_present' },
        { key: 'evsi_share_of_evpi_pct', header: 'evsi_share_of_evpi_pct' },
        { key: 'net_value_positive', header: 'net_value_positive' },
        { key: 'break_even_sensitivity_pct', header: 'break_even_sensitivity_pct' },
        { key: 'signal', header: 'signal' },
        { key: 'likelihood_ratio', header: 'likelihood_ratio' },
      ];
      const portfolio = buildVoiPortfolio(state, now);
      const refusalCode = (row) => {
        if (row.evaluated.probabilitiesOk && row.evaluated.missingCells === 0) return '';
        if (!row.evaluated.probabilitiesOk) return 'probability-sum';
        return 'unpriced-cells';
      };
      const rows = [];
      portfolio.frames.forEach((row, index) => {
        const frameCode = `D${String(index + 1).padStart(2, '0')}`;
        const base = {
          frame_code: frameCode,
          status: row.frame.status,
          states: (row.frame.states || []).length,
          options: (row.frame.options || []).length,
          priced_cells: row.evaluated.pricedCells,
          total_cells: row.evaluated.totalCells,
          priced_share_pct: row.evaluated.totalCells
            ? Math.round((row.evaluated.pricedCells / row.evaluated.totalCells) * 1000) / 10
            : '',
          probability_sum_pct: row.evaluated.probabilitySum,
          arithmetic: row.evaluated.priced ? 'priced' : 'refused',
          refusal_codes: refusalCode(row),
          evpi_share_of_stake_pct: row.evaluated.evpiShareOfStakePct ?? '',
          near_tie: row.evaluated.nearTie ? 'yes' : 'no',
          robust_differs_from_expected: row.evaluated.robustChoiceDiffersFromExpected ? 'yes' : 'no',
          premise_states: (row.frame.states || []).filter((state) => state.premiseId).length,
        };
        if (!row.studies.length) {
          rows.push({
            ...base,
            investigation_code: '',
            investigation_status: '',
            overdue: '',
            sensitivity_pct: '',
            specificity_pct: '',
            cost_present: '',
            evsi_share_of_evpi_pct: '',
            net_value_positive: '',
            break_even_sensitivity_pct: '',
            signal: '',
            likelihood_ratio: '',
          });
          return;
        }
        row.studies.forEach((study, studyIndex) => {
          const reading = study.reading;
          rows.push({
            ...base,
            investigation_code: `${frameCode}-I${String(studyIndex + 1).padStart(2, '0')}`,
            investigation_status: study.study.status,
            overdue: study.overdue ? 'yes' : 'no',
            sensitivity_pct: study.study.sensitivityPct,
            specificity_pct: study.study.specificityPct,
            cost_present: Number(study.study.cost) > 0 ? 'yes' : 'no',
            // EVSI relative to the frame's own EVPI ceiling, never in currency.
            evsi_share_of_evpi_pct: reading.ok && reading.efficiencyPct !== null ? reading.efficiencyPct : '',
            net_value_positive: reading.ok ? (reading.netValue > 0 ? 'yes' : 'no') : '',
            break_even_sensitivity_pct: reading.ok ? (reading.breakEvenSensitivityPct ?? '') : '',
            signal: study.study.result?.signal || '',
            likelihood_ratio: study.study.result?.lr ?? '',
          });
        });
      });
      return { columns, rows };
    }

    case 'orgdesign': {
      // CSV scope #47. Counts and ratios only: no names, no identifiers, no
      // free text. A structural export that named people would be a target list.
      const columns = [
        { key: 'design_code', header: 'design_code' },
        { key: 'status', header: 'status' },
        { key: 'moves', header: 'moves' },
        { key: 'people_moving', header: 'people_moving' },
        { key: 'span_min', header: 'span_min' },
        { key: 'span_max', header: 'span_max' },
        { key: 'coordination_hours_per_channel', header: 'coordination_hours_per_channel' },
        { key: 'layers_before', header: 'layers_before' },
        { key: 'layers_after', header: 'layers_after' },
        { key: 'max_span_before', header: 'max_span_before' },
        { key: 'max_span_after', header: 'max_span_after' },
        { key: 'over_band_before', header: 'over_band_before' },
        { key: 'over_band_after', header: 'over_band_after' },
        { key: 'channels_before', header: 'channels_before' },
        { key: 'channels_after', header: 'channels_after' },
        { key: 'coordination_hours_before', header: 'coordination_hours_before' },
        { key: 'coordination_hours_after', header: 'coordination_hours_after' },
        { key: 'priced_share_pct', header: 'priced_share_pct' },
        { key: 'annual_cost_present', header: 'annual_cost_present' },
        { key: 'annual_cost', header: 'annual_cost' },
        { key: 'measured_managers', header: 'measured_managers' },
        { key: 'median_service_days', header: 'median_service_days' },
        { key: 'median_wait_p80_weeks', header: 'median_wait_p80_weeks' },
        { key: 'modelled_wait_p80_weeks', header: 'modelled_wait_p80_weeks' },
        { key: 'on_frontier', header: 'on_frontier' },
        { key: 'scored_managers', header: 'scored_managers' },
        { key: 'median_ape_pct', header: 'median_ape_pct' },
      ];
      const portfolio = designPortfolio(state, now);
      const frontierIds = new Set(portfolio.frontier.rows.filter((row) => row.frontier).map((row) => row.designId));
      const rows = portfolio.simulations.map((sim, index) => {
        const score = scoreDesignPrediction(state, sim.design, { now });
        return {
          // Opaque, positional and stable for the life of the export.
          design_code: `D${String(index + 1).padStart(2, '0')}`,
          status: sim.design.status,
          moves: (sim.design.moves || []).length,
          people_moving: sim.delta.moved,
          span_min: sim.proposed.conventions.spanMin,
          span_max: sim.proposed.conventions.spanMax,
          coordination_hours_per_channel: sim.proposed.conventions.coordinationHoursPerWeek,
          layers_before: sim.baseline.layers,
          layers_after: sim.proposed.layers,
          max_span_before: sim.baseline.span.max ?? '',
          max_span_after: sim.proposed.span.max ?? '',
          over_band_before: sim.baseline.span.overBandCount,
          over_band_after: sim.proposed.span.overBandCount,
          channels_before: sim.baseline.coordination.channels,
          channels_after: sim.proposed.coordination.channels,
          coordination_hours_before: sim.baseline.coordination.hoursPerWeek,
          coordination_hours_after: sim.proposed.coordination.hoursPerWeek,
          priced_share_pct: Math.round(sim.proposed.coordination.pricedShare * 1000) / 10,
          annual_cost_present: sim.proposed.coordination.annualCost === null ? 'no' : 'yes',
          annual_cost: sim.proposed.coordination.annualCost ?? '',
          measured_managers: sim.proposed.queue.measuredCount,
          median_service_days: sim.proposed.queue.medianServiceDays ?? '',
          median_wait_p80_weeks: sim.proposed.queue.medianP80Weeks ?? '',
          modelled_wait_p80_weeks: sim.delta.modelledWaitP80Weeks ?? '',
          on_frontier: frontierIds.has(sim.designId) ? 'yes' : 'no',
          scored_managers: score.scoredCount ?? '',
          median_ape_pct: score.medianApePct ?? '',
        };
      });
      // The live structure is exported once with an empty design code, so a
      // workspace with no design still has a reading — but never an invented one.
      if (!rows.length) {
        const live = structureReading(state, buildStructure(state), { now, conventions: conventionsFromSettings(state) });
        rows.push({
          design_code: '',
          status: 'live-structure',
          moves: 0,
          people_moving: 0,
          span_min: live.conventions.spanMin,
          span_max: live.conventions.spanMax,
          coordination_hours_per_channel: live.conventions.coordinationHoursPerWeek,
          layers_before: '',
          layers_after: live.layers,
          max_span_before: '',
          max_span_after: live.span.max ?? '',
          over_band_before: '',
          over_band_after: live.span.overBandCount,
          channels_before: '',
          channels_after: live.coordination.channels,
          coordination_hours_before: '',
          coordination_hours_after: live.coordination.hoursPerWeek,
          priced_share_pct: Math.round(live.coordination.pricedShare * 1000) / 10,
          annual_cost_present: live.coordination.annualCost === null ? 'no' : 'yes',
          annual_cost: live.coordination.annualCost ?? '',
          measured_managers: live.queue.measuredCount,
          median_service_days: live.queue.medianServiceDays ?? '',
          median_wait_p80_weeks: live.queue.medianP80Weeks ?? '',
          modelled_wait_p80_weeks: '',
          on_frontier: '',
          scored_managers: '',
          median_ape_pct: '',
        });
      }
      return { columns, rows };
    }

    case 'merit': {
      // CSV scope #45. Ratios and counts only: no absolute pay, no names, no
      // notes, no cycle labels.
      const columns = [
        { key: 'cycle_code', header: 'cycle_code' },
        { key: 'status', header: 'status' },
        { key: 'currency', header: 'currency' },
        { key: 'budget_kind', header: 'budget_kind' },
        { key: 'budget_pct_of_payroll', header: 'budget_pct_of_payroll' },
        { key: 'budget_use_pct', header: 'budget_use_pct' },
        { key: 'rows', header: 'rows' },
        { key: 'rows_without_pay', header: 'rows_without_pay' },
        { key: 'rows_without_band', header: 'rows_without_band' },
        { key: 'below_floor', header: 'below_floor' },
        { key: 'above_ceiling', header: 'above_ceiling' },
        { key: 'mean_compa_ratio', header: 'mean_compa_ratio' },
        { key: 'gap_pct', header: 'gap_pct' },
        { key: 'explained_pct', header: 'explained_pct' },
        { key: 'unexplained_pct', header: 'unexplained_pct' },
        { key: 'unexplained_ci_low_pct', header: 'unexplained_ci_low_pct' },
        { key: 'unexplained_ci_high_pct', header: 'unexplained_ci_high_pct' },
        { key: 'four_fifths_ratio', header: 'four_fifths_ratio' },
        { key: 'four_fifths_flagged', header: 'four_fifths_flagged' },
        { key: 'compression_findings', header: 'compression_findings' },
        { key: 'external_premium_findings', header: 'external_premium_findings' },
        { key: 'expected_departures', header: 'expected_departures' },
        { key: 'replacement_exposure', header: 'replacement_exposure' },
        { key: 'calibration_brier', header: 'calibration_brier' },
        { key: 'calibration_base_brier', header: 'calibration_base_brier' },
        { key: 'calibration_n', header: 'calibration_n' },
      ];
      const rows = (state.meritCycles || []).map((cycle, index) => {
        const reading = fairnessReading(state, cycle, now);
        const meanCompa = reading.integrity.levels.length
          ? reading.integrity.levels.reduce((acc, level) => acc + (level.meanCompa ?? 0), 0) / reading.integrity.levels.length
          : null;
        const outcomes = new Map((cycle.outcomes || []).map((outcome) => [outcome.personId, outcome]));
        const resolved = (cycle.audit?.predictions || [])
          .map((prediction) => {
            const outcome = outcomes.get(prediction.personId);
            if (!outcome || outcome.departed === null || !Number.isFinite(Number(prediction.departurePct))) return null;
            return { p: Number(prediction.departurePct) / 100, observed: outcome.departed ? 1 : 0 };
          })
          .filter(Boolean);
        const brier = resolved.length
          ? resolved.reduce((acc, row) => acc + (row.p - row.observed) ** 2, 0) / resolved.length
          : null;
        const baseRate = resolved.length
          ? resolved.reduce((acc, row) => acc + row.observed, 0) / resolved.length
          : null;
        const baseBrier = resolved.length
          ? resolved.reduce((acc, row) => acc + (baseRate - row.observed) ** 2, 0) / resolved.length
          : null;
        const decomposition = reading.decomposition;
        const impact = reading.impact;
        return {
          cycle_code: `C${String(index + 1).padStart(3, '0')}`,
          status: cycle.status,
          currency: cycle.currency,
          budget_kind: reading.budget.kind,
          budget_pct_of_payroll: reading.budget.pctOfPayroll ?? '',
          budget_use_pct: reading.budget.amount > 0 ? Math.round((reading.spent / reading.budget.amount) * 1000) / 10 : '',
          rows: reading.rows.length,
          rows_without_pay: reading.integrity.counts.withoutPay,
          rows_without_band: reading.integrity.counts.noBand,
          below_floor: reading.integrity.counts.belowFloor,
          above_ceiling: reading.integrity.counts.aboveCeiling,
          mean_compa_ratio: meanCompa === null ? '' : Math.round(meanCompa * 1000) / 1000,
          gap_pct: decomposition.status === 'ok' ? decomposition.gapPct : '',
          explained_pct: decomposition.status === 'ok' ? decomposition.explainedPct : '',
          unexplained_pct: decomposition.status === 'ok' ? decomposition.unexplainedPct : '',
          unexplained_ci_low_pct: decomposition.status === 'ok' && decomposition.interval?.unexplainedPct
            ? decomposition.interval.unexplainedPct[0]
            : '',
          unexplained_ci_high_pct: decomposition.status === 'ok' && decomposition.interval?.unexplainedPct
            ? decomposition.interval.unexplainedPct[1]
            : '',
          four_fifths_ratio: impact.status === 'ok' ? impact.ratio : '',
          four_fifths_flagged: impact.status === 'ok' ? (impact.flagged ? 'yes' : 'no') : '',
          compression_findings: reading.compression.filter((finding) => finding.kind === 'inversion').length,
          external_premium_findings: reading.compression.filter((finding) => finding.kind === 'loyalty-penalty').length,
          expected_departures: reading.expectedDepartures,
          replacement_exposure: Math.round(reading.replacementExposure || 0),
          calibration_brier: brier === null ? '' : Math.round(brier * 1000) / 1000,
          calibration_base_brier: baseBrier === null ? '' : Math.round(baseBrier * 1000) / 1000,
          calibration_n: resolved.length,
        };
      });
      return { columns, rows };
    }

    case 'performance': {
      // CSV scope #52. The audit leaves as facts, never as prose. A leader can
      // hand this to a people partner to show the process was run; the notes in
      // which a person is described stay behind, because a spreadsheet is the
      // last place a claim about someone should travel.
      const columns = [
        { key: 'concern_code', header: 'concern_code' },
        { key: 'person_code', header: 'person_code' },
        { key: 'status', header: 'status' },
        { key: 'expectation_source', header: 'expectation_source' },
        { key: 'expectation_dated', header: 'expectation_dated' },
        { key: 'observations', header: 'observations' },
        { key: 'live_observations', header: 'live_observations' },
        { key: 'distinct_dates', header: 'distinct_dates' },
        { key: 'specific_observations', header: 'specific_observations' },
        { key: 'outside_window', header: 'outside_window' },
        { key: 'two_way_conversations', header: 'two_way_conversations' },
        { key: 'supports_given', header: 'supports_given' },
        { key: 'cause', header: 'cause' },
        { key: 'cause_confidence', header: 'cause_confidence' },
        { key: 'justice_met', header: 'justice_met' },
        { key: 'justice_total', header: 'justice_total' },
        { key: 'can_formal_plan', header: 'can_formal_plan' },
        { key: 'plan_state', header: 'plan_state' },
        { key: 'objectives', header: 'objectives' },
        { key: 'review_on', header: 'review_on' },
        { key: 'prediction_pct', header: 'prediction_pct' },
        { key: 'verdict', header: 'verdict' },
        { key: 'brier', header: 'brier' },
        { key: 'priced', header: 'priced' },
        { key: 'currency', header: 'currency' },
        { key: 'carrying_cost_per_day', header: 'carrying_cost_per_day' },
        { key: 'replacement_cost', header: 'replacement_cost' },
        { key: 'break_even_days', header: 'break_even_days' },
      ];
      const concerns = Array.isArray(state.performanceConcerns) ? state.performanceConcerns : [];
      const personOrder = [...new Set(concerns.map((row) => row.personId).filter(Boolean))];
      const personCode = new Map(personOrder.map((id, i) => [id, `P${String(i + 1).padStart(2, '0')}`]));
      const rows = concerns.map((concern, index) => {
        const assessment = assessConcern(state, concern, now, state.settings || {});
        const plan = concern.plan || null;
        const outcome = concern.outcome && concern.outcome.verdict ? concern.outcome : null;
        const prediction = plan && plan.prediction ? plan.prediction : null;
        // The Brier score is the engine's, not a second implementation here:
        // one definition of "scored" is the only way the CSV and the page can
        // never disagree about the leader's calibration.
        const scored = predictionOutcome(concern);
        return {
          concern_code: `PC${String(index + 1).padStart(2, '0')}`,
          person_code: personCode.get(concern.personId) || '',
          status: concern.status,
          expectation_source: concern.standard?.source || 'none',
          expectation_dated: concern.standard?.recordedOn ? 'yes' : 'no',
          observations: assessment.evidence.total,
          live_observations: assessment.evidence.liveCount,
          distinct_dates: assessment.evidence.distinctDates,
          specific_observations: assessment.evidence.specificCount,
          outside_window: assessment.evidence.staleCount,
          two_way_conversations: (concern.conversations || []).filter((c) => c.kind === 'two-way').length,
          supports_given: (concern.supports || []).filter((c) => c.kind !== 'none').length,
          cause: assessment.diagnosis.primary,
          cause_confidence: assessment.diagnosis.confidence,
          justice_met: assessment.justice.metCount,
          justice_total: assessment.justice.total,
          can_formal_plan: assessment.canFormalPlan ? 'yes' : 'no',
          plan_state: assessment.plan.state,
          objectives: plan ? (plan.objectives || []).length : 0,
          review_on: plan ? plan.reviewOn || '' : '',
          prediction_pct: prediction ? prediction.probabilityPct : '',
          verdict: outcome ? outcome.verdict : '',
          brier: scored ? scored.brier : '',
          priced: assessment.economics.priced ? 'yes' : 'no',
          currency: assessment.economics.currency || '',
          carrying_cost_per_day: assessment.economics.priced ? Math.round(assessment.economics.totalDaily * 100) / 100 : '',
          replacement_cost: assessment.economics.replacementCost === null ? '' : Math.round(assessment.economics.replacementCost),
          break_even_days: assessment.economics.breakEvenDays === null ? '' : assessment.economics.breakEvenDays,
        };
      });
      return { columns, rows };
    }

    case 'survival': {
      // CSV scope #53. Aggregates only. A class leaves as a code and a set of
      // distributions; the items behind it, their titles and their owners never
      // leave the workspace in a spreadsheet. A class whose sample is below the
      // declared at-risk floor exports its counts and nothing else, because a
      // "median" over three items is a single item wearing a statistic.
      const columns = [
        { key: 'class_code', header: 'class_code' },
        { key: 'unit', header: 'unit' },
        { key: 'items', header: 'items' },
        { key: 'completed', header: 'completed' },
        { key: 'abandoned', header: 'abandoned' },
        { key: 'censored', header: 'censored' },
        { key: 'exits', header: 'exits' },
        { key: 'median_exit_days', header: 'median_exit_days' },
        { key: 'median_exit_lo', header: 'median_exit_lo' },
        { key: 'median_exit_hi', header: 'median_exit_hi' },
        { key: 'completion_incidence_50_days', header: 'completion_incidence_50_days' },
        { key: 'completion_incidence_lo', header: 'completion_incidence_lo' },
        { key: 'completion_incidence_hi', header: 'completion_incidence_hi' },
        { key: 'abandon_share_pct', header: 'abandon_share_pct' },
        { key: 'hazard_first_rate', header: 'hazard_first_rate' },
        { key: 'hazard_last_rate', header: 'hazard_last_rate' },
        { key: 'hazard_rate_ratio', header: 'hazard_rate_ratio' },
        { key: 'hazard_ratio_lo', header: 'hazard_ratio_lo' },
        { key: 'hazard_ratio_hi', header: 'hazard_ratio_hi' },
        { key: 'effort_pairs', header: 'effort_pairs' },
        { key: 'effort_median_ratio', header: 'effort_median_ratio' },
        { key: 'effort_sign_test_p', header: 'effort_sign_test_p' },
      ];
      const report = survivalReport(state, now, state.settings || {});
      const rows = report.classes.map((klass, index) => {
        const readable = klass.evidenceFloorMet;
        const medianExit = klass.median;
        const quantile = klass.completionQuantile;
        const first = klass.hazard.buckets[0];
        const last = klass.hazard.buckets[klass.hazard.buckets.length - 1];
        return {
          class_code: `C${String(index + 1).padStart(2, '0')}`,
          unit: klass.unit,
          items: klass.counts.total,
          completed: klass.counts.completed,
          abandoned: klass.counts.abandoned,
          censored: klass.counts.censored,
          exits: klass.counts.exits,
          median_exit_days: readable && medianExit.reached ? medianExit.days : '',
          median_exit_lo: readable && medianExit.reached ? medianExit.lo : '',
          median_exit_hi: readable && medianExit.reached ? (medianExit.hi ?? '') : '',
          completion_incidence_50_days: readable && quantile.reached ? quantile.days : '',
          completion_incidence_lo: readable && quantile.reached ? quantile.lo : '',
          completion_incidence_hi: readable && quantile.reached ? (quantile.hi ?? '') : '',
          abandon_share_pct: klass.abandonSharePct === null ? '' : klass.abandonSharePct,
          hazard_first_rate: first && first.rate !== null ? first.rate : '',
          hazard_last_rate: last && last.rate !== null ? last.rate : '',
          hazard_rate_ratio: klass.hazard.ratio ? klass.hazard.ratio.value : '',
          hazard_ratio_lo: klass.hazard.ratio ? klass.hazard.ratio.lo : '',
          hazard_ratio_hi: klass.hazard.ratio ? klass.hazard.ratio.hi : '',
          effort_pairs: klass.bias.available ? klass.bias.n : '',
          effort_median_ratio: klass.bias.available ? klass.bias.medianRatio : '',
          effort_sign_test_p: klass.bias.available ? klass.bias.p : '',
        };
      });
      return { columns, rows };
    }

    case 'waitcost': {
      // CSV scope #54. Aggregates only, one row per class × currency plus one
      // ALL row per currency. The declared prices are the leader's own numbers,
      // so amounts leave in their three-letter currency; everything that
      // identifies an item, an owner or a record does not leave at all, and a
      // scenario the curve could not answer is blank, not zero.
      const conventions = waitConventionsFromSettings(state.settings || {});
      const report = waitCostReport(state, now, state.settings || {});
      const classIndex = new Map(report.survival.classes.map((klass, index) => [klass.key, index]));
      const baseColumns = [
        { key: 'class_code', header: 'class_code' },
        { key: 'currency_code', header: 'currency_code' },
        { key: 'open_items', header: 'open_items' },
        { key: 'priced_items', header: 'priced_items' },
        { key: 'overdue_priced_items', header: 'overdue_priced_items' },
        { key: 'unpriced_overdue_items', header: 'unpriced_overdue_items' },
        { key: 'weekly_exposure', header: 'weekly_exposure' },
        { key: 'weekly_exposure_overdue', header: 'weekly_exposure_overdue' },
        { key: 'top_item_share_pct', header: 'top_item_share_pct' },
        { key: 'scenario_semantics', header: 'scenario_semantics' },
      ];
      const scenarioColumns = conventions.scenarioWeeks.map((w) => ({
        key: `scenario_${w}w_expected`,
        header: `scenario_${w}w_expected`,
      }));
      const coveredColumns = conventions.scenarioWeeks.map((w) => ({
        key: `scenario_${w}w_covered`,
        header: `scenario_${w}w_covered`,
      }));
      const columns = [...baseColumns, ...scenarioColumns, ...coveredColumns];

      const rows = [];
      const groups = new Map();
      for (const row of report.rows) {
        const currency = row.price.priced ? row.price.currency : '—';
        const key = `${row.item.kind}:${currency}`;
        if (!groups.has(key)) {
          groups.set(key, {
            kind: row.item.kind,
            currency,
            open: 0,
            priced: 0,
            overduePriced: 0,
            unpricedOverdue: 0,
            weeklyExposure: 0,
            weeklyExposureOverdue: 0,
            topAmount: 0,
            scenarios: new Map(conventions.scenarioWeeks.map((w) => [w, { expected: 0, covered: 0 }])),
          });
        }
        const bucket = groups.get(key);
        bucket.open += 1;
        if (row.price.priced) {
          bucket.priced += 1;
          bucket.weeklyExposure += row.price.weeklyAmount;
          if (row.overdue) {
            bucket.overduePriced += 1;
            bucket.weeklyExposureOverdue += row.price.weeklyAmount;
            bucket.topAmount = Math.max(bucket.topAmount, row.price.weeklyAmount);
          }
          for (const scenario of row.scenarios) {
            const cell = bucket.scenarios.get(scenario.weeks);
            if (cell && scenario.available) {
              cell.expected += scenario.expectedAdditionalCost;
              cell.covered += 1;
            }
          }
        } else if (row.overdue) {
          bucket.unpricedOverdue += 1;
        }
      }
      for (const bucket of groups.values()) {
        const index = classIndex.get(bucket.kind);
        const code = `C${String((index ?? 0) + 1).padStart(2, '0')}`;
        const rowOut = {
          class_code: code,
          currency_code: bucket.currency,
          open_items: bucket.open,
          priced_items: bucket.priced,
          overdue_priced_items: bucket.overduePriced,
          unpriced_overdue_items: bucket.unpricedOverdue,
          weekly_exposure: Math.round(bucket.weeklyExposure * 100) / 100,
          weekly_exposure_overdue: Math.round(bucket.weeklyExposureOverdue * 100) / 100,
          scenario_semantics: 'endpoint_lower_bound_legacy',
          top_item_share_pct: bucket.weeklyExposureOverdue > 0
            ? Math.round((bucket.topAmount / bucket.weeklyExposureOverdue) * 1000) / 10
            : '',
        };
        for (const w of conventions.scenarioWeeks) {
          const cell = bucket.scenarios.get(w);
          const readable = cell && cell.covered >= conventions.minAtRisk;
          rowOut[`scenario_${w}w_expected`] = readable ? Math.round(cell.expected * 100) / 100 : '';
          rowOut[`scenario_${w}w_covered`] = cell ? cell.covered : '';
        }
        rows.push(rowOut);
      }
      // One ALL row per currency, matching the on-screen per-currency totals.
      for (const total of report.totals) {
        const rowOut = {
          class_code: 'ALL',
          currency_code: total.currency,
          open_items: report.rows.filter((row) => row.price.currency === total.currency).length,
          priced_items: total.pricedItems,
          overdue_priced_items: total.overduePricedItems,
          unpriced_overdue_items: '',
          weekly_exposure: total.weeklyExposure,
          weekly_exposure_overdue: total.weeklyExposureOverdue,
          top_item_share_pct: total.topItemShare,
          scenario_semantics: 'endpoint_lower_bound_legacy',
        };
        for (const scenario of total.scenarios) {
          const readable = scenario.coveredRows >= conventions.minAtRisk;
          rowOut[`scenario_${scenario.weeks}w_expected`] = readable ? scenario.expectedAdditionalCost : '';
          rowOut[`scenario_${scenario.weeks}w_covered`] = scenario.coveredRows;
        }
        rows.push(rowOut);
      }
      return { columns, rows };
    }

    case 'parity': {
      // CSV scope #55 (Schema v65). Aggregate-only self-audit rows: four
      // managerial-capital channels + PROMISE-LEDGER + STANDARD-AUDIT. Zero
      // person names, zero IDs, zero free text; withheld statistics export as
      // blank strings, never zero.
      const conventions = parityConventionsFromSettings(state.settings || {});
      const report = parityReport(state, now, conventions);
      const columns = [
        { key: 'segment_code', header: 'segment_code' },
        { key: 'eligible_post_ramp', header: 'eligible_post_ramp' },
        { key: 'ramp_protected', header: 'ramp_protected' },
        { key: 'zero_receipt_count', header: 'zero_receipt_count' },
        { key: 'gini_corrected_pct', header: 'gini_corrected_pct' },
        { key: 'atkinson_05_pct', header: 'atkinson_05_pct' },
        { key: 'theil_total', header: 'theil_total' },
        { key: 'theil_within', header: 'theil_within' },
        { key: 'theil_between', header: 'theil_between' },
        { key: 'within_share_pct', header: 'within_share_pct' },
        { key: 'promise_fulfillment_pct', header: 'promise_fulfillment_pct' },
        { key: 'promise_wilson_low_pct', header: 'promise_wilson_low_pct' },
        { key: 'promise_wilson_high_pct', header: 'promise_wilson_high_pct' },
        { key: 'promise_gap_pp', header: 'promise_gap_pp' },
        { key: 'overdue_leader_promises', header: 'overdue_leader_promises' },
        { key: 'standard_inversions', header: 'standard_inversions' },
        { key: 'review_kendall_tau_b', header: 'review_kendall_tau_b' },
      ];
      const rows = PARITY_CHANNEL_KEYS.map((key) => {
        const ch = report.channels[key];
        return {
          segment_code: ch.code,
          eligible_post_ramp: ch.eligibleCount,
          ramp_protected: report.counts.rampProtected,
          zero_receipt_count: ch.zeroCount,
          gini_corrected_pct: ch.available ? ch.giniPct : '',
          atkinson_05_pct: ch.available ? ch.atkinsonPct : '',
          theil_total: ch.available ? ch.theil : '',
          theil_within: ch.available ? ch.withinTheil : '',
          theil_between: ch.available ? ch.betweenTheil : '',
          within_share_pct: ch.available && ch.withinSharePct !== null ? ch.withinSharePct : '',
          promise_fulfillment_pct: '',
          promise_wilson_low_pct: '',
          promise_wilson_high_pct: '',
          promise_gap_pp: '',
          overdue_leader_promises: '',
          standard_inversions: '',
          review_kendall_tau_b: '',
        };
      });
      rows.push({
        segment_code: 'PROMISE-LEDGER',
        eligible_post_ramp: report.counts.eligiblePostRamp,
        ramp_protected: report.counts.rampProtected,
        zero_receipt_count: '',
        gini_corrected_pct: '',
        atkinson_05_pct: '',
        theil_total: '',
        theil_within: '',
        theil_between: '',
        within_share_pct: '',
        promise_fulfillment_pct: report.promises.overallFulfillmentPct ?? '',
        promise_wilson_low_pct: report.promises.overallWilsonLowPct ?? '',
        promise_wilson_high_pct: report.promises.overallWilsonHighPct ?? '',
        promise_gap_pp: report.promises.promiseGapPp ?? '',
        overdue_leader_promises: report.promises.totalOverdueOpen,
        standard_inversions: '',
        review_kendall_tau_b: '',
      });
      rows.push({
        segment_code: 'STANDARD-AUDIT',
        eligible_post_ramp: report.counts.eligiblePostRamp,
        ramp_protected: report.counts.rampProtected,
        zero_receipt_count: report.counts.fringe,
        gini_corrected_pct: '',
        atkinson_05_pct: '',
        theil_total: '',
        theil_within: report.withinTheilMean ?? '',
        theil_between: '',
        within_share_pct: '',
        promise_fulfillment_pct: '',
        promise_wilson_low_pct: '',
        promise_wilson_high_pct: '',
        promise_gap_pp: '',
        overdue_leader_promises: '',
        standard_inversions: report.standardConsistency.inversionsCount,
        review_kendall_tau_b: report.standardConsistency.reviews.available ? report.standardConsistency.reviews.tauB : '',
      });
      return { columns, rows };
    }

    case 'consequences': {
      const columns = [
        { key: 'horizon_weeks', header: 'horizon_weeks' },
        { key: 'currency_code', header: 'currency_code' },
        { key: 'frozen_count', header: 'frozen_count' },
        { key: 'priced_count', header: 'priced_count' },
        { key: 'graded_count', header: 'graded_count' },
        { key: 'graph_capped_count', header: 'graph_capped_count' },
        { key: 'mean_still_open_pct', header: 'mean_still_open_pct' },
        { key: 'mean_brier', header: 'mean_brier' },
        { key: 'total_expected_cost', header: 'total_expected_cost' },
        { key: 'mean_direct_neighbours', header: 'mean_direct_neighbours' },
        { key: 'mean_second_order', header: 'mean_second_order' },
      ];
      const groups = new Map();
      for (const reading of state.consequenceReadings || []) {
        const currency = reading.price?.currency || 'UNPRICED';
        const key = `${reading.horizonWeeks}|${currency}`;
        if (!groups.has(key)) groups.set(key, { weeks: reading.horizonWeeks, currency, items: [] });
        groups.get(key).items.push(reading);
      }
      const round4 = (v) => Math.round(v * 10000) / 10000;
      const rows = [...groups.values()].sort((a, b) => a.weeks - b.weeks || a.currency.localeCompare(b.currency)).map((group) => {
        const entries = group.items;
        const priced = entries.filter((r) => r.price && Number.isFinite(r.expectedCost));
        const predictions = entries.filter((r) => Number.isFinite(r.predictedStillOpenPct));
        const graded = entries.filter((r) => r.graded && Number.isFinite(r.graded.brier));
        const enough = entries.length >= 5;
        return {
          horizon_weeks: group.weeks,
          currency_code: group.currency,
          frozen_count: entries.length,
          priced_count: priced.length,
          graded_count: graded.length,
          graph_capped_count: entries.filter((r) => r.graphSnapshot?.truncated).length,
          mean_still_open_pct: predictions.length >= 5
            ? round4(predictions.reduce((n, r) => n + r.predictedStillOpenPct, 0) / predictions.length) : '',
          mean_brier: graded.length >= 5 ? round4(graded.reduce((n, r) => n + r.graded.brier, 0) / graded.length) : '',
          total_expected_cost: priced.length >= 5 ? round4(priced.reduce((n, r) => n + r.expectedCost, 0)) : '',
          mean_direct_neighbours: enough ? round4(entries.reduce((n, r) => n + (r.graphSnapshot?.direct || 0), 0) / entries.length) : '',
          mean_second_order: enough ? round4(entries.reduce((n, r) => n + (r.graphSnapshot?.secondOrder || 0), 0) / entries.length) : '',
        };
      });
      return { columns, rows };
    }

    case 'evidence': {
      // CSV scope #56 (Schema v66, Evidence Terminal). Aggregate-only, opaque
      // codes, blanks below every declared floor. Nothing that identifies a
      // study, a person or a piece of prose leaves the workspace.
      const conventions = evidenceConventionsFromSettings(state.settings || {});
      const report = evidenceReport(state, now, state.settings || {});
      const interventionIds = [...new Set(report.effects.cells.map((c) => c.interventionType))]
        .sort((a, b) => String(a).localeCompare(String(b)));
      const outcomeIds = [...new Set(report.effects.cells.map((c) => c.outcomeId))]
        .sort((a, b) => String(a || '').localeCompare(String(b || '')));
      const itCode = (id) => `IT${String(interventionIds.indexOf(id) + 1).padStart(2, '0')}`;
      const obCode = (id) => `OB${String(outcomeIds.indexOf(id) + 1).padStart(2, '0')}`;

      const columns = [
        { key: 'row_kind', header: 'row_kind' },
        { key: 'cell_code', header: 'cell_code' },
        { key: 'intervention_code', header: 'intervention_code' },
        { key: 'outcome_code', header: 'outcome_code' },
        { key: 'studies', header: 'studies' },
        { key: 'pre_registered', header: 'pre_registered' },
        { key: 'retrospective', header: 'retrospective' },
        { key: 'independent_results', header: 'independent_results' },
        { key: 'replications', header: 'replications' },
        { key: 'pooled_effect_pct', header: 'pooled_effect_pct' },
        { key: 'ci_lo_pct', header: 'ci_lo_pct' },
        { key: 'ci_hi_pct', header: 'ci_hi_pct' },
        { key: 'hk_lo_pct', header: 'hk_lo_pct' },
        { key: 'hk_hi_pct', header: 'hk_hi_pct' },
        { key: 'tau2', header: 'tau2' },
        { key: 'q', header: 'q' },
        { key: 'q_p', header: 'q_p' },
        { key: 'i2_pct', header: 'i2_pct' },
        { key: 'heterogeneity_reportable', header: 'heterogeneity_reportable' },
        { key: 'egger_asymmetric', header: 'egger_asymmetric' },
        { key: 'within_study_noise', header: 'within_study_noise' },
        { key: 'evsi_one_more_trial', header: 'evsi_one_more_trial' },
        { key: 'evpi_ceiling', header: 'evpi_ceiling' },
        { key: 'verdict_code', header: 'verdict_code' },
        { key: 'resolved', header: 'resolved' },
        { key: 'realised_rate_pct', header: 'realised_rate_pct' },
        { key: 'wilson_lo_pct', header: 'wilson_lo_pct' },
        { key: 'wilson_hi_pct', header: 'wilson_hi_pct' },
        { key: 'brier', header: 'brier' },
        { key: 'reference_brier', header: 'reference_brier' },
        { key: 'brier_skill', header: 'brier_skill' },
        { key: 'calibration_z', header: 'calibration_z' },
      ];

      const rows = [];
      report.effects.cells.forEach((cell, index) => {
        const pool = cell.pool;
        const rank = (report.recommendation?.rows || [])
          .find((row) => row.interventionType === cell.interventionType);
        rows.push({
          row_kind: 'EFFECT_CELL',
          cell_code: `EBM-C${String(index + 1).padStart(2, '0')}`,
          intervention_code: itCode(cell.interventionType),
          outcome_code: obCode(cell.outcomeId),
          studies: cell.n,
          pre_registered: cell.nConfirmatory,
          retrospective: cell.nExploratory,
          independent_results: cell.roots,
          replications: cell.replications,
          pooled_effect_pct: pool ? pool.pooled : '',
          ci_lo_pct: pool ? pool.ciLo : '',
          ci_hi_pct: pool ? pool.ciHi : '',
          hk_lo_pct: pool ? pool.hkLo : '',
          hk_hi_pct: pool ? pool.hkHi : '',
          tau2: pool && pool.heterogeneity.reportable ? pool.heterogeneity.tau2 : '',
          q: pool && pool.heterogeneity.reportable ? pool.heterogeneity.q : '',
          q_p: pool && pool.heterogeneity.reportable ? pool.heterogeneity.pQ : '',
          i2_pct: pool && pool.heterogeneity.reportable ? pool.heterogeneity.i2 : '',
          heterogeneity_reportable: pool ? (pool.heterogeneity.reportable ? 1 : 0) : 0,
          egger_asymmetric: cell.egger ? (cell.egger.asymmetric ? 1 : 0) : '',
          within_study_noise: cell.noise === null ? '' : cell.noise,
          evsi_one_more_trial: rank && Number.isFinite(rank.evsi) ? rank.evsi : '',
          evpi_ceiling: rank && Number.isFinite(rank.evpi) ? rank.evpi : '',
          verdict_code: cell.verdict,
          resolved: '',
          realised_rate_pct: '',
          wilson_lo_pct: '',
          wilson_hi_pct: '',
          brier: '',
          reference_brier: '',
          brier_skill: '',
          calibration_z: '',
        });
      });
      report.resolutions.cells.forEach((cell, index) => {
        rows.push({
          row_kind: 'RESOLUTION_SOURCE',
          cell_code: `EBM-R${String(index + 1).padStart(2, '0')}`,
          intervention_code: '',
          outcome_code: `RS${String(index + 1).padStart(2, '0')}`,
          studies: '',
          pre_registered: '',
          retrospective: '',
          independent_results: '',
          replications: '',
          pooled_effect_pct: '',
          ci_lo_pct: '',
          ci_hi_pct: '',
          hk_lo_pct: '',
          hk_hi_pct: '',
          tau2: '',
          q: '',
          q_p: '',
          i2_pct: '',
          heterogeneity_reportable: '',
          egger_asymmetric: '',
          within_study_noise: '',
          evsi_one_more_trial: '',
          evpi_ceiling: '',
          verdict_code: cell.scored ? '' : 'below-floor',
          resolved: cell.n,
          realised_rate_pct: cell.scored ? cell.observedRatePct : '',
          wilson_lo_pct: cell.scored ? cell.wilson.lo : '',
          wilson_hi_pct: cell.scored ? cell.wilson.hi : '',
          brier: cell.scored ? cell.brier : '',
          reference_brier: cell.scored ? cell.referenceBrier : '',
          brier_skill: cell.scored ? cell.skill : '',
          calibration_z: cell.scored ? cell.calibrationZ : '',
        });
      });
      return { columns, rows };
    }

    default:
      return null;
  }
}

/**
 * Generate a scoped, formula-injection-safe CSV export from `state`.
 */
export function exportWorkspaceCsv(
  state,
  scope,
  {
    now = new Date(),
    pruneOverdueCandidates = false,
    redactStakeholderStances = false,
  } = {},
) {
  const descriptor = CSV_EXPORTS.find((item) => item.key === scope);
  if (!descriptor) {
    return {
      ok: false,
      reason: 'unknown-scope',
      error: `Unknown CSV export scope "${scope}".`,
    };
  }
  let effectiveState = state;
  let omitted = null;

  if (pruneOverdueCandidates && scope === 'hiring') {
    const review = retentionReview(state, { now, settings: state?.settings || {} });
    const dueIds = new Set(review.due.map((r) => r.candidate.id));
    effectiveState = {
      ...effectiveState,
      candidates: (effectiveState.candidates || []).filter((c) => !dueIds.has(c.id)),
    };
    omitted = { ...(omitted || {}), overdueCandidatesOmitted: dueIds.size };
  }

  if (redactStakeholderStances && (scope === 'cases' || scope === 'changes' || scope === 'stakeholders')) {
    let scrubbed = 0;
    effectiveState = {
      ...effectiveState,
      stakeholders: scope === 'stakeholders'
        ? (effectiveState.stakeholders || []).map((s) => {
            const sensitive = (s?.stance && s.stance !== 'neutral') || s?.vetoPlayer === true ||
              Boolean(String(s?.keyMessage || s?.influenceNotes || '').trim());
            if (sensitive) scrubbed += 1;
            return {
              ...s,
              stance: 'neutral',
              vetoPlayer: false,
              keyMessage: '',
              influenceNotes: '',
              vetoBasis: '',
              stanceHistory: (s.stanceHistory || []).map((e) => ({ ...e, stance: 'neutral', context: '' })),
            };
          })
        : effectiveState.stakeholders,
      cases: scope === 'cases'
        ? (effectiveState.cases || []).map((c) => ({
            ...c,
            stakeholders: Array.isArray(c.stakeholders)
              ? c.stakeholders.map((s) => {
                  const hasMsg = Boolean(String(s?.keyMessage || s?.notes || '').trim());
                  if ((s?.stance && s.stance !== 'neutral') || hasMsg) scrubbed += 1;
                  return { ...s, stance: 'neutral', keyMessage: '', notes: '' };
                })
              : [],
          }))
        : effectiveState.cases,
      changes: scope === 'changes'
        ? (effectiveState.changes || []).map((chg) => ({
            ...chg,
            coalition: Array.isArray(chg.coalition)
              ? chg.coalition.map((m) => {
                  if ((m?.stance && m.stance !== 'neutral') || Boolean(m?.vetoPlayer) || Boolean(String(m?.keyMessage || '').trim())) scrubbed += 1;
                  return { ...m, stance: 'neutral', vetoPlayer: false, keyMessage: '' };
                })
              : [],
          }))
        : effectiveState.changes,
    };
    omitted = { ...(omitted || {}), stakeholderRecordsScrubbed: scrubbed };
  }

  const built = buildScopeTable(effectiveState, scope, now);
  const csv = serializeCsv(built.columns, built.rows);
  const today = dayKey(now);
  return {
    ok: true,
    scope: descriptor.key,
    label: descriptor.label,
    sensitive: descriptor.sensitive,
    filename: `leados-${descriptor.filenameSlug}-${today}.csv`,
    rowCount: built.rows.length,
    columnCount: built.columns.length,
    csv,
    ...(omitted ? { omitted } : {}),
  };
}
