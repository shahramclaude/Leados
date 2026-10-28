/**
 * app/core/domain/dynamics.js — the Operating System Dynamics Lab (Schema v37).
 *
 * Every other module in LeadOS reads the organisation as a *snapshot*: load,
 * allocation, resilience, coalition power, forecast integrity. None of them
 * models the thing that actually determines whether a leader's fixes work:
 * **feedback loops with delays**. This module is the first in the workspace
 * that represents the team as a system of stocks and flows and integrates it
 * forward in time.
 *
 * Named frameworks (Section 0.2 of the product doctrine):
 *  - Forrester (1961) *Industrial Dynamics* and Sterman (2000) *Business
 *    Dynamics*: accumulate stocks, integrate flows, never reason about rates
 *    as if they were levels.
 *  - Meadows (1999) *Leverage Points* and Senge (1990) *The Fifth Discipline*:
 *    system archetypes (Limits to Growth, Shifting the Burden, Fixes that Fail,
 *    Success to the Successful) and an explicit leverage hierarchy — parameters
 *    are the weakest place to intervene, loop structure the strongest.
 *  - Little (1961) / Kingman (1961): a queue's cycle time is WIP ÷ throughput,
 *    and delay explodes as utilisation approaches one. Reused here rather than
 *    re-derived (see `capacity.flowMetrics`).
 *  - Richardson (1995) loop dominance and Ford (1999) behavioural analysis:
 *    a loop is "dominant" when its own flow terms are what is currently moving
 *    the state. Dominance is computed per week from the same tagged terms the
 *    integrator uses — it is measured, not asserted.
 *  - Routh–Hurwitz / linear stability: linearise the system at its initial
 *    state and inspect the eigenvalues. A positive real part means the current
 *    structure diverges from equilibrium at a computable rate; it does not mean
 *    "the team will fail".
 *  - Deming (1986) / Wheeler (1993): separate the system from the noise.
 *
 * Deliberate honesty boundaries, enforced in code:
 *  - Every parameter carries provenance: `measured` (derived from records),
 *    `estimated` (derived from a small sample), or `assumed` (a stated
 *    convention). The report shows the mix; a model built mostly on assumptions
 *    says so before it shows a trajectory.
 *  - This is a *structural* model, not a forecast. It is calibrated by
 *    hindcasting observed weekly WIP and reporting skill against naive
 *    persistence (MASE). When the model is no better than "tomorrow equals
 *    today", the report says exactly that instead of drawing a confident curve.
 *  - No morale, sentiment or attrition prediction is invented from sparse
 *    records. Attrition is a rate the leader can see and edit, not a hidden
 *    score about a person.
 *  - Nothing in this module ranks people. The bottleneck is a *system*
 *    constraint (Goldratt) used as the anchor of a structural decision, never
 *    a performance judgement.
 *
 * Pure module: no DOM, storage, network or ambient clock. The post-commit rule
 * receives the same context shape as every other rule (ADR-0008) and plugs into
 * the shared spine; its DACI decision is created upstream of the decision-tempo
 * rule so it is priced in the same atomic transaction.
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { buildCapacityModel, flowMetrics, pertTriple } from './capacity.js';
import { buildLoadReport } from './load.js';
import { LINK_ENTITY_TYPES, LINK_RELATIONS } from './cases.js';

export const DYN_ENGINE_VERSION = 'os-dynamics-2026.10-v1';

/** Structural claims need a real system: below this, the Lab reports "not yet". */
export const DYN_MIN_PEOPLE = 3;
/** Weeks of dated WIP history needed before a hindcast is shown at all. */
export const DYN_MIN_HISTORY_WEEKS = 8;
/** Share of dated lifecycle records needed for that hindcast to count. */
export const DYN_CALIBRATION_COMPLETENESS_PCT = 80;
/** Dated portfolio records needed before a hindcast is a hindcast. */
export const DYN_CALIBRATION_MIN_RECORDS = 3;
/** Structural risk (0–100) at which RULE-DYN-01 opens a decision. */
export const DYN_STRUCTURAL_RISK_PCT = 65;
/** Assumed-parameter share above which the model is labelled provisional. */
export const DYN_ASSUMED_WARN_PCT = 40;
export const DYN_DEFAULT_HORIZON_WEEKS = 26;
export const DYN_MAX_HORIZON_WEEKS = 52;
export const DYN_MIN_HORIZON_WEEKS = 4;
export const DYN_MC_TRIALS = 200;
export const DYN_MC_CV = 0.25;
/** A single simulated week of a stock. RK4 with one step per week. */
const STEP_WEEKS = 1;

export const DYN_RULE_IDS = Object.freeze({
  STRUCTURE: 'RULE-DYN-01',
  ARCHETYPE: 'RULE-DYN-02',
  EXPERIMENT: 'RULE-DYN-03',
});

export const DYN_RULES = Object.freeze([
  {
    id: DYN_RULE_IDS.STRUCTURE,
    name: 'Dominant reinforcing loop → one DACI structural decision',
    framework: 'Senge (1990) system archetypes; Meadows (1999) leverage hierarchy; Forrester (1961) stock-and-flow',
    trigger: 'dynamics.scan / dynamics.experiment.* when the structural report is material (and, if enabled, portfolio, case and roster events)',
    targetModule: 'decisions',
    description: 'When the simulated structure carries the team away from equilibrium (positive dominant eigenvalue) and a reinforcing loop holds more than half the circulating person-days, opens exactly one idempotent DACI decision framed at four different leverage levels: change a parameter, change a flow, change a stock/delay, or redesign the loop itself. Decision Tempo prices it in the same transaction. Nothing is changed automatically.',
  },
  {
    id: DYN_RULE_IDS.ARCHETYPE,
    name: 'Shifting-the-burden archetype → one blameless 1:1 talking point',
    framework: 'Senge (1990) Shifting the Burden; Meadows (1999) symptomatic vs fundamental fix',
    trigger: 'dynamics.scan / dynamics.experiment.* when the symptom-repair loop outweighs the capacity-building loop for the system constraint',
    targetModule: 'oneonones',
    description: 'Queues one mechanism-framed talking point for the person currently absorbing the symptomatic fix, asking what structural change would remove the need for the fix. Blameless by construction: the topic names the loop, never the person’s effort. Self-clears when the archetype no longer holds.',
  },
  {
    id: DYN_RULE_IDS.EXPERIMENT,
    name: 'Adopted policy experiment → one owned checkpoint delegation',
    framework: 'Popper-style falsification in management; pre-registered expectations (Impact Ledger convention)',
    trigger: 'dynamics.experiment.adopted',
    targetModule: 'delegations',
    description: 'Freezes the predicted end-state at adoption and opens exactly one owned delegation to review the experiment at its checkpoint, carrying the frozen prediction in the delegation so the review compares what was expected with what happened instead of rewriting history.',
  },
]);

export const DYN_LOOPS = Object.freeze([
  {
    id: 'R1',
    name: 'Burnout spiral',
    polarity: 'reinforcing',
    archetype: 'Limits to Growth',
    delayWeeks: 3,
    description: 'Sustained pressure raises errors and drains people, which removes the capacity that was absorbing the pressure. The delay is why it feels fine for a quarter and then is not.',
    fields: 'capacity, quality debt, perceived pressure',
  },
  {
    id: 'R2',
    name: 'Key-person trap',
    polarity: 'reinforcing',
    archetype: 'Success to the Successful',
    delayWeeks: 6,
    description: 'Under pressure, work is routed to whoever reliably handles it. That raises concentration, which makes the next round of pressure land on the same person — the classic success-to-the-successful loop.',
    fields: 'dependency concentration, perceived pressure',
  },
  {
    id: 'R3',
    name: 'Capability growth',
    polarity: 'reinforcing',
    archetype: 'Reinvestment',
    delayWeeks: 8,
    description: 'Slack and mentoring build capability, which raises the ceiling on what the team can absorb. It is slow, easy to starve, and the only reinforcing loop that helps.',
    fields: 'capacity',
  },
  {
    id: 'B1',
    name: 'Backlog drain',
    polarity: 'balancing',
    archetype: 'Balancing',
    delayWeeks: 1,
    description: 'More work in progress means more work available to finish, so throughput rises with WIP — up to the point where coordination eats the gain (Brooks).',
    fields: 'work in progress, throughput',
  },
  {
    id: 'B2',
    name: 'Hiring drag (fixes that fail)',
    polarity: 'balancing',
    archetype: 'Fixes that Fail',
    delayWeeks: 4,
    description: 'Hiring against overloaded capacity borrows capacity from the present: onboarding consumes exactly the senior hours the team was short of. The intended fix arrives after the pain.',
    fields: 'capacity, work in progress',
  },
  {
    id: 'B3',
    name: 'Symptom repair',
    polarity: 'balancing',
    archetype: 'Shifting the Burden',
    delayWeeks: 2,
    description: 'Expending capacity on incidents and rework lowers visible quality debt while consuming the capacity that would have prevented it. Relief now, dependence later.',
    fields: 'quality debt, capacity',
  },
  {
    id: 'B4',
    name: 'Intake renegotiation',
    polarity: 'balancing',
    archetype: 'Drift to Low Performance',
    delayWeeks: 0,
    description: 'When pressure is high the queue is managed quietly by not starting new work. The number improves because the work was never begun — a real loop, and a dangerous one when it is invisible.',
    fields: 'perceived pressure, work in progress',
  },
]);

const LOOP_BY_ID = Object.freeze(Object.fromEntries(DYN_LOOPS.map((loop) => [loop.id, loop])));

export const DYN_LEVERS = Object.freeze([
  {
    key: 'hirePerWeek',
    label: 'Add capacity',
    unit: 'person-days / week',
    min: 0,
    max: 10,
    step: 0.5,
    default: 0,
    leverageClass: 1,
    leverageLabel: 'Parameter — weakest lever',
    mechanism: 'Adds delivery capacity after the onboarding drag is paid. Meadows’ hierarchy puts parameters at the bottom: buying your way out of a structure rarely changes the structure.',
  },
  {
    key: 'wipCapPct',
    label: 'Cap work in progress',
    unit: '% of new intake refused or deferred',
    min: 0,
    max: 60,
    step: 5,
    default: 0,
    leverageClass: 2,
    leverageLabel: 'Flow — changes the rate entering the stock',
    mechanism: 'Throttling intake drains the backlog slowly but immediately lowers cycle time and pressure. It is the cheapest structural move a first-time leader can make.',
  },
  {
    key: 'scopeCutPct',
    label: 'Cut committed scope once',
    unit: '% of current WIP removed at week 0',
    min: 0,
    max: 50,
    step: 5,
    default: 0,
    leverageClass: 2,
    leverageLabel: 'Flow — a one-time stock adjustment',
    mechanism: 'Removes work that is already committed. Fast and honest if the commitment was wrong; it does not change the loop that produced the over-commitment.',
  },
  {
    key: 'reworkInvestment',
    label: 'Invest in prevention',
    unit: 'share of quality-debt capacity redirected to prevention',
    min: 0,
    max: 1,
    step: 0.1,
    default: 0,
    leverageClass: 3,
    leverageLabel: 'Stock — changes what accumulates',
    mechanism: 'Pays down quality debt at its source instead of repairing it. Converts B3 (symptom repair) into a prevention stock, which is the actual Shifting-the-Burden intervention.',
  },
  {
    key: 'delegationShare',
    label: 'Delegate the bottleneck',
    unit: 'share of routing moved off the constraint',
    min: 0,
    max: 1,
    step: 0.1,
    default: 0,
    leverageClass: 4,
    leverageLabel: 'Delay & structure — changes who absorbs the load',
    mechanism: 'Reduces dependency concentration over time by making substitution normal. Attacks R2 at the loop, not at the symptom.',
  },
  {
    key: 'learningShare',
    label: 'Protect learning & mentoring',
    unit: 'share of capacity protected from delivery',
    min: 0,
    max: 0.4,
    step: 0.05,
    default: 0,
    leverageClass: 5,
    leverageLabel: 'Loop structure — strongest lever',
    mechanism: 'Feeds R3, the only reinforcing loop that compounds in your favour. It costs throughput this quarter and raises the ceiling for every quarter after.',
  },
]);

const LEVER_BY_KEY = Object.freeze(Object.fromEntries(DYN_LEVERS.map((lever) => [lever.key, lever])));

export const DYN_PLAYBOOK = Object.freeze([
  {
    key: 'hire-two',
    name: 'Hire two now',
    hypothesis: 'Adding capacity fast enough to outrun the pressure loop.',
    levers: { hirePerWeek: 2 },
  },
  {
    key: 'cap-wip',
    name: 'Cap WIP at 20%',
    hypothesis: 'Lowering intake drains the queue and buys back cycle time before hiring can help.',
    levers: { wipCapPct: 20 },
  },
  {
    key: 'prevent',
    name: 'Invest 40% of repair capacity in prevention',
    hypothesis: 'Attacking the quality debt stock removes the symptomatic loop instead of feeding it.',
    levers: { reworkInvestment: 0.4 },
  },
  {
    key: 'delegate-bottleneck',
    name: 'Delegate the bottleneck',
    hypothesis: 'Making substitution normal breaks the key-person loop rather than working around it.',
    levers: { delegationShare: 0.6 },
  },
  {
    key: 'protect-learning',
    name: 'Protect 15% for learning',
    hypothesis: 'Feeding capability growth raises the ceiling, which is the only compounding fix.',
    levers: { learningShare: 0.15 },
  },
  {
    key: 'stop-work',
    name: 'Cut 20% of committed scope and cap intake',
    hypothesis: 'The fastest relief: remove work now, then stop taking more of the same shape.',
    levers: { scopeCutPct: 20, wipCapPct: 10 },
  },
]);

/* ------------------------------------------------------------ helpers */

function round2(n) {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function clampText(value, max) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Deterministic 32-bit PRNG (mulberry32). Seeded, so a run is reproducible. */
export function mulberry32(seed) {
  let a = (Number(seed) >>> 0) || 0x9e3779b9;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller from a seeded uniform stream, for lognormal parameter draws. */
function gaussian(rand) {
  const u = Math.max(1e-9, rand());
  const v = Math.max(1e-9, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function quantile(sortedValues, q) {
  if (!sortedValues.length) return null;
  const pos = clamp(q, 0, 1) * (sortedValues.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (pos - lo);
}

/* ------------------------------------------------------------ derivation */

function provenance(value, source, note) {
  return { value, source, note };
}

/**
 * Derive the model's parameters and starting stocks from records the leader
 * already keeps. Every value carries provenance; nothing is presented as
 * measured when it is a convention.
 */
export function deriveDynamicsModel(state = {}, now = new Date()) {
  const settings = state.settings || {};
  const today = dayKey(now);
  const activePeople = (Array.isArray(state.people) ? state.people : [])
    .filter((p) => p && p.status !== 'archived');
  const capModel = buildCapacityModel(state, { now, settings });
  const horizonWeeks = Math.max(1, Number(capModel.horizonWeeks) || 4);
  const flow = flowMetrics(state, capModel, { now, windowWeeks: 8 });
  const load = buildLoadReport(state, now);
  const params = {};
  const sources = {};

  const record = (key, value, source, note) => {
    params[key] = value;
    sources[key] = provenance(value, source, note);
    return value;
  };

  /* ----- capacity (pd/week) ----- */
  const allocatableDays = Number(capModel.supply?.allocatableDays) || 0;
  const capacityPerWeek = Math.max(0, allocatableDays / horizonWeeks);
  record('capacityPerWeek', round2(capacityPerWeek), capacityPerWeek > 0 ? 'measured' : 'assumed',
    capacityPerWeek > 0
      ? `${allocatableDays} allocatable person-days over a ${horizonWeeks}-week planning horizon.`
      : 'No capacity on record; a zero-capacity system cannot be simulated.');

  /* ----- work in progress (pd) ----- */
  const wipDays = Math.max(0, Number(capModel.demand?.committedDays) || 0);
  record('wipDays', round2(wipDays), wipDays > 0 ? 'measured' : 'assumed',
    wipDays > 0
      ? `Expected effort of ${capModel.demand?.committed?.length ?? 0} committed item(s).`
      : 'No committed work on record; WIP starts at zero.');

  /* ----- quality debt & rework generation from incident reserves ----- */
  const incidentReserves = (Array.isArray(state.portfolio) ? state.portfolio : []).filter((item) => {
    if (!item || item.kind !== 'capacity-reserve' || item.status !== 'open') return false;
    if (item.sourceType === 'case') {
      const kase = (state.cases || []).find((c) => c && c.id === item.sourceId);
      return Boolean(kase && kase.kind === 'incident');
    }
    return false;
  });
  const incidentReserveDays = incidentReserves.reduce((sum, item) => sum + (pertTriple(item.effortDays).expected || 0), 0);
  const incidentPerWeek = incidentReserveDays / horizonWeeks;
  const reworkGenRate = capacityPerWeek > 0
    ? clamp(incidentPerWeek / capacityPerWeek, 0.02, 0.6)
    : 0.05;
  record('reworkGenRate', round2(reworkGenRate), incidentReserves.length ? 'measured' : 'assumed',
    incidentReserves.length
      ? `${incidentReserves.length} open incident reserve(s) worth ${round2(incidentReserveDays)} person-days.`
      : 'No incident reserves on record: using a 5% convention for rework generated under pressure.');
  const qualityFixWeeks = clamp(num(settings.dynamicsQualityFixWeeks, 6), 2, 26);
  record('qualityFixWeeks', qualityFixWeeks, 'assumed',
    'Convention: how many weeks of repair capacity outstanding quality debt represents.');

  /* ----- demand (pd/week) ----- */
  const windowStart = addDays(today, -84);
  const created = (Array.isArray(state.portfolio) ? state.portfolio : [])
    .filter((item) => item && item.createdOn && item.createdOn >= windowStart && item.createdOn <= today);
  const createdDays = created.reduce((sum, item) => sum + (pertTriple(item.effortDays).expected || 0), 0);
  const arrivalPerWeek = created.length >= 2 ? createdDays / 12 : null;
  // A committed plan is itself a statement of intended throughput: if these
  // items are to be delivered inside the planning horizon, that is the demand
  // the system is actually being asked to absorb. Taking the larger of the
  // measured arrival rate and that planned rate is the honest reading — an
  // under-stated arrival history must not make a fully committed team look idle.
  const plannedPerWeek = wipDays / horizonWeeks;
  const demandPerWeek = Math.max(arrivalPerWeek || 0, plannedPerWeek);
  record('demandPerWeek', round2(demandPerWeek), arrivalPerWeek !== null ? 'estimated' : 'assumed',
    arrivalPerWeek !== null
      ? `Measured arrivals ${round2(arrivalPerWeek)} pd/week (${created.length} item(s) in 12 weeks) and planned clearance ${round2(plannedPerWeek)} pd/week; the larger is used.`
      : `Too few dated arrivals: demand is the planned clearance rate of committed work (${round2(plannedPerWeek)} pd/week).`);
  record('plannedPerWeek', round2(plannedPerWeek), 'measured',
    'Committed effort spread across the planning horizon — what the plan asks the team to absorb.');

  /* ----- throughput envelope ----- */
  const measuredThroughput = Number(flow.throughputPerWeek) > 0 ? Number(flow.throughputPerWeek) : null;
  const wipHalf = Math.max(1, capacityPerWeek * 0.75);
  record('wipHalf', round2(wipHalf), 'assumed',
    'Convention: the WIP level (in person-days) at which delivery runs at half of available capacity.');
  record('measuredThroughputPerWeek', measuredThroughput === null ? null : round2(measuredThroughput),
    measuredThroughput === null ? 'assumed' : 'measured',
    measuredThroughput === null
      ? 'Fewer than two items delivered in the window: no completion rate is claimed.'
      : `${flow.completedInWindow} item(s) delivered in ${flow.windowWeeks} weeks.`);

  /* ----- attrition ----- */
  const recentArchived = activePeople.length
    ? (Array.isArray(state.people) ? state.people : []).filter((p) => p && p.status === 'archived'
      && p.archivedAt && daysBetween(String(p.archivedAt).slice(0, 10), today) <= 182)
    : [];
  const measuredAttr = activePeople.length
    ? recentArchived.length / Math.max(1, activePeople.length + recentArchived.length) / 26
    : null;
  const attritionPerWeek = measuredAttr !== null ? clamp(measuredAttr, 0, 0.05) : 0.004;
  record('attritionPerWeek', Number(attritionPerWeek.toFixed(5)), measuredAttr !== null ? 'estimated' : 'assumed',
    measuredAttr !== null
      ? `${recentArchived.length} departure(s) in the last 26 weeks against a roster of ${activePeople.length}.`
      : 'No departure history: a 0.4%-per-week baseline convention is used and labelled.');
  record('overloadAttrition', 0.03, 'assumed',
    'Convention: additional weekly attrition per unit of squared overload. This is a structural assumption, not a prediction about any person.');
  record('growthRate', 0.004, 'assumed',
    'Convention: baseline capability growth per week when capacity is not at its ceiling.');
  record('capacityCeilingMultiple', 1.5, 'assumed',
    'Convention: the ceiling capability could reach with slack and mentoring is 1.5× current capacity.');
  record('rampWeeks', clamp(num(settings.dynamicsRampWeeks, 12), 2, 26), 'assumed',
    'Convention: weeks a new joiner consumes senior time before contributing (the ramp window in the Capacity terminal).');
  record('onboardingDragPd', 2.5, 'assumed',
    'Convention: senior person-days consumed per new person-day/week of hired capacity (Brooks; ramp scaffolding). It is the price of the fix, not a fact about any hire.');
  record('pressureLagWeeks', clamp(num(settings.dynamicsPressureLagWeeks, 3), 1, 12), 'assumed',
    'Convention: how many weeks before sustained pressure shows up as errors and departures.');
  record('dependencyRouting', 0.3, 'assumed',
    'Convention: the share of overload that gets routed to the person already carrying the constraint.');
  record('dependencyDecay', 0.1, 'assumed',
    'Convention: how quickly concentration decays when work is deliberately spread.');
  record('targetWipWeeks', clamp(num(settings.dynamicsTargetWipWeeks, 4), 1, 12), 'assumed',
    'Convention: weeks of delivery capacity that counts as fully committed work in progress. It defaults to the planning horizon, which is also what the Capacity terminal assumes when it measures utilisation.');
  record('demandRelaxation', 0.35, 'assumed',
    'Convention: how much new intake is quietly deferred per unit of overload. The queue is often managed by not starting work; making that visible is the point.');
  record('qualityDebtIncidence', 0.06, 'assumed',
    'Convention: weekly share of outstanding quality debt that turns into new incident work.');

  /* ----- dependency concentration ----- */
  const stewardship = new Map();
  const activeDeps = (Array.isArray(state.dependencies) ? state.dependencies : [])
    .filter((d) => d && !['retired', 'decommissioned'].includes(d.status)
      && ['critical', 'important'].includes(d.criticality));
  for (const dep of activeDeps) {
    for (const steward of Array.isArray(dep.stewards) ? dep.stewards : []) {
      if (!steward || steward.role !== 'primary' || !steward.personId) continue;
      if (!activePeople.some((p) => p.id === steward.personId)) continue;
      stewardship.set(steward.personId, (stewardship.get(steward.personId) || 0) + 1);
    }
  }
  const stewardTotal = [...stewardship.values()].reduce((s, v) => s + v, 0);
  const ownerCounts = new Map();
  const committedItems = (capModel.demand?.committed || []).filter((i) => i && i.ownerId);
  const committedEffort = committedItems.reduce((sum, i) => sum + (i.effort?.expected || 0), 0);
  for (const item of committedItems) {
    ownerCounts.set(item.ownerId, (ownerCounts.get(item.ownerId) || 0) + (item.effort?.expected || 0));
  }
  const topOwner = Math.max(0, ...[...ownerCounts.values()]);
  const ownerConcentration = committedEffort > 0 ? topOwner / committedEffort : 0;
  const stewardConcentration = stewardTotal > 0 ? Math.max(0, ...stewardship.values()) / stewardTotal : 0;
  const hasConcentrationEvidence = stewardTotal > 0 || committedEffort > 0;
  const dependency = hasConcentrationEvidence
    ? clamp((stewardConcentration + ownerConcentration) / 2, 0, 1)
    : 0.3;
  record('dependency', round2(dependency), hasConcentrationEvidence ? 'measured' : 'assumed',
    hasConcentrationEvidence
      ? `Top person holds ${Math.round(stewardConcentration * 100)}% of critical stewardships and ${Math.round(ownerConcentration * 100)}% of committed effort.`
      : 'No steward or owner data yet: concentration starts at a 30% convention.');

  /* ----- pressure = WIP measured in weeks of capacity ----- */
  const utilisation = Number.isFinite(flow.utilisation) ? Number(flow.utilisation) : null;
  const wipWeeks = capacityPerWeek > 0 ? wipDays / capacityPerWeek : null;
  const pressure = wipWeeks !== null && capacityPerWeek > 0
    ? clamp(wipWeeks / params.targetWipWeeks, 0, 3)
    : 0.5;
  record('pressure', round2(pressure), wipWeeks !== null ? 'measured' : 'assumed',
    wipWeeks !== null
      ? `${round2(wipWeeks)} weeks of work in progress against a ${params.targetWipWeeks}-week healthy target, so pressure is ${Math.round(pressure * 100)}% (100% = fully committed, above that = overloaded). Utilisation from the Capacity terminal: ${utilisation === null ? 'not measurable' : `${Math.round(utilisation * 100)}%`}.`
      : 'No committed effort against capacity yet: pressure is a convention.');

  /* ----- quality debt stock ----- */
  const qualityDebt = incidentPerWeek * qualityFixWeeks;
  record('qualityDebt', round2(qualityDebt), incidentReserves.length ? 'measured' : 'assumed',
    incidentReserves.length
      ? `${round2(incidentPerWeek)} person-days/week of incident repair × ${qualityFixWeeks} weeks of repayment.`
      : 'No incident history: quality debt starts at zero rather than invented.');

  /* ----- mean load index as an independent cross-check ----- */
  const meanLoadIndex = load.team?.meanIndex ?? null;
  const derivedSources = Object.values(sources);
  const assumed = derivedSources.filter((s) => s.source === 'assumed').length;
  const measured = derivedSources.filter((s) => s.source === 'measured').length;

  return {
    engineVersion: DYN_ENGINE_VERSION,
    today,
    params,
    sources,
    stocks: {
      capacity: Math.max(0, params.capacityPerWeek),
      wip: Math.max(0, params.wipDays),
      qualityDebt: Math.max(0, params.qualityDebt),
      pressure: Math.max(0, params.pressure),
      dependency: clamp(params.dependency, 0, 1),
    },
    context: {
      activePeople: activePeople.length,
      capacityPerWeek: round2(capacityPerWeek),
      wipDays: round2(wipDays),
      wipWeeks: wipWeeks === null ? null : round2(wipWeeks),
      utilisation: utilisation === null ? null : round2(utilisation),
      meanLoadIndex,
      horizonWeeks,
      incidentReserves: incidentReserves.length,
      incidentReserveDays: round2(incidentReserveDays),
      throughputPerWeek: measuredThroughput === null ? null : round2(measuredThroughput),
      littleCycleWeeks: flow.littleCycleWeeks ?? null,
      bottleneckId: load.team?.bottleneckId ?? null,
      hasTeam: capModel.hasTeam,
    },
    provenance: {
      measured,
      estimated: derivedSources.filter((s) => s.source === 'estimated').length,
      assumed,
      assumedPct: Math.round((assumed / Math.max(1, derivedSources.length)) * 100),
    },
    adequate: activePeople.length >= DYN_MIN_PEOPLE && capacityPerWeek > 0,
    empty: activePeople.length === 0,
  };
}

/* ------------------------------------------------------------ integrator */

/**
 * The derivative of the state vector, with every term tagged by the loop that
 * owns it. Tagging is what makes loop dominance measurable rather than a story
 * told after the fact.
 */
export function derivatives(stock, p, levers = {}, floorCapacity = 0, t = 0) {
  const cap = Math.max(0, stock.capacity);
  const wip = Math.max(0, stock.wip);
  const quality = Math.max(0, stock.qualityDebt);
  const pressure = Math.max(0, stock.pressure);
  const dependency = clamp(stock.dependency, 0, 1);

  const targetWip = Math.max(1e-6, cap * p.targetWipWeeks);
  const rawPressure = cap > 0.01 ? wip / targetWip : 3;
  const overload = Math.max(0, pressure - 1);
  const learningShare = clamp(num(levers.learningShare, 0), 0, 0.4);
  const delegationShare = clamp(num(levers.delegationShare, 0), 0, 1);
  const reworkInvestment = clamp(num(levers.reworkInvestment, 0), 0, 1);
  const wipCapPct = clamp(num(levers.wipCapPct, 0), 0, 60) / 100;
  const hirePerWeek = Math.max(0, num(levers.hirePerWeek, 0));

  // R3 — capability growth: logistic toward a ceiling, fed by protected slack.
  const ceiling = Math.max(1, cap * p.capacityCeilingMultiple);
  const growth = cap * (p.growthRate + learningShare * 0.06) * Math.max(0, 1 - cap / ceiling);

  // B2 — hiring drag: onboarding consumes senior capacity *during the ramp*.
  // The cost is temporary by construction; a permanent drag would make hiring
  // monotonically destructive, which is not what happens in a real team.
  const rampWeeks = clamp(num(p.rampWeeks, 12), 2, 26);
  const onboardingDrag = hirePerWeek * p.onboardingDragPd * (t < rampWeeks ? 1 : 0);
  const hireInflow = hirePerWeek;

  // R1 — attrition and rework respond to *perceived* pressure (the delay).
  const attrition = cap * (p.attritionPerWeek + p.overloadAttrition * overload * overload);
  const reworkGenerated = (p.reworkGenRate * cap * Math.min(overload, 2)
    + quality * p.qualityDebtIncidence) * (1 - reworkInvestment);

  // B3 — symptom repair: paying down debt costs delivery capacity.
  const symptomRepair = (quality / p.qualityFixWeeks) * (1 + 2 * reworkInvestment);

  // R2 — key-person routing raises concentration when pressure is high.
  const depRoute = p.dependencyRouting * clamp(overload, 0, 2) * (1 - delegationShare) * (1 - dependency);
  const depDecay = p.dependencyDecay * dependency * (1 + 2 * delegationShare);

  // B4 — intake renegotiation: high pressure quietly defers new commitments.
  const intake = p.demandPerWeek * (1 - wipCapPct) * (1 - clamp(p.demandRelaxation * overload, 0, 0.8));

  // Delivery capacity after everything the system takes off the top.
  const dependencyLoss = cap * dependency * 0.25;
  const learningCost = cap * learningShare * 0.5;
  const deliveryCapacity = Math.max(0, cap + hireInflow - onboardingDrag - symptomRepair - learningCost - dependencyLoss);
  const wipShare = wip / (wip + p.wipHalf);
  const throughput = deliveryCapacity * wipShare;

  // A capacity floor keeps the linear extrapolation inside the range where it
  // means anything: organisations do not vanish in 26 weeks, and pretending
  // otherwise turns a model into a horror story.
  const effectiveGrowth = floorCapacity > 0 && cap <= floorCapacity + 1e-9
    ? Math.max(0, growth)
    : growth;
  const netCapacity = effectiveGrowth + hireInflow - onboardingDrag - attrition;
  const flooredCapacity = floorCapacity > 0 && cap + netCapacity < floorCapacity && netCapacity < 0
    ? floorCapacity - cap
    : netCapacity;

  const d = {
    capacity: flooredCapacity,
    wip: intake + reworkGenerated - throughput,
    qualityDebt: reworkGenerated - symptomRepair,
    pressure: (rawPressure - pressure) / p.pressureLagWeeks,
    dependency: depRoute - depDecay,
    _flows: {
      growth: effectiveGrowth, hireInflow, onboardingDrag, attrition, reworkGenerated,
      symptomRepair, throughput, intake, depRoute, depDecay, learningCost,
      deliveryCapacity, rawPressure, overload, wipShare, dependencyLoss,
      // True when the capacity floor, not the model, is holding the stock up.
      floorActive: Math.abs(flooredCapacity - netCapacity) > 1e-12,
    },
  };
  return d;
}

/** Flow magnitude each loop is currently circulating, in person-days/week. */
export function loopActivation(stock, p, levers = {}, floorCapacity = 0, t = 0) {
  const d = derivatives(stock, p, levers, floorCapacity, t);
  const f = d._flows;
  const cap = Math.max(1e-9, stock.capacity);
  const activation = {
    R1: Math.abs(f.attrition) + Math.abs(f.reworkGenerated),
    R2: (Math.abs(f.depRoute) + Math.abs(f.depDecay)) * cap,
    R3: Math.abs(f.growth),
    B1: Math.abs(f.throughput) * Math.max(0.05, f.wipShare),
    B2: Math.abs(f.onboardingDrag),
    B3: Math.abs(f.symptomRepair),
    B4: Math.abs(Math.max(0, p.demandPerWeek - f.intake)) * Math.max(0.1, f.overload),
  };
  activation.total = Object.values(activation).reduce((sum, v) => sum + v, 0);
  return activation;
}

/**
 * Loop *gain* — how strongly each loop's own flow responds to its own driving
 * stock. This is what dominance should mean: the throughput flow is always the
 * largest flow in the system, but a flow is not a feedback. Gain is measured by
 * a central-difference elasticity, so a loop that is structurally present but
 * currently inactive (no overload, no debt) correctly scores near zero.
 */
export function loopGains(stock, p, levers = {}, floorCapacity = 0, t = 0) {
  const gainOf = (driver, key, extract) => {
    const h = Math.max(1e-4, Math.abs(driver) * 1e-3);
    const up = derivatives({ ...stock, [key]: Math.max(0, driver + h) }, p, levers, floorCapacity, t)._flows;
    const down = derivatives({ ...stock, [key]: Math.max(0, driver - h) }, p, levers, floorCapacity, t)._flows;
    return Math.abs((extract(up) - extract(down)) / (2 * h)) * Math.abs(driver);
  };
  const gains = {
    R1: gainOf(stock.pressure, 'pressure', (f) => f.attrition + f.reworkGenerated),
    R2: gainOf(stock.pressure, 'pressure', (f) => f.depRoute * Math.max(1, stock.capacity))
      + gainOf(stock.dependency, 'dependency', (f) => (f.depDecay - f.depRoute) * Math.max(1, stock.capacity)),
    R3: gainOf(stock.capacity, 'capacity', (f) => f.growth),
    B1: gainOf(stock.wip, 'wip', (f) => f.throughput),
    // B2 is a parameter loop: its strength is the drag relative to capacity.
    B2: Math.abs(derivatives(stock, p, levers, floorCapacity, t)._flows.onboardingDrag),
    B3: gainOf(stock.qualityDebt, 'qualityDebt', (f) => f.symptomRepair),
    B4: gainOf(stock.pressure, 'pressure', (f) => f.intake),
  };
  gains.total = Object.values(gains).reduce((sum, v) => sum + v, 0);
  return gains;
}

/**
 * The RK4 step. Integration is bounded: capacity never falls below 40% of its
 * starting value (the linear extrapolation is meaningless past that), pressure
 * saturates at 3× a fully committed team, and stocks are clamped at zero. Every
 * clamp is counted so a saturated run is visible instead of silently confident.
 */
function rk4Step(stock, p, levers, floorCapacity, t = 0) {
  const h = STEP_WEEKS;
  const add = (s, k, scale) => ({
    capacity: s.capacity + k.capacity * scale,
    wip: s.wip + k.wip * scale,
    qualityDebt: s.qualityDebt + k.qualityDebt * scale,
    pressure: s.pressure + k.pressure * scale,
    dependency: s.dependency + k.dependency * scale,
  });
  const k1 = derivatives(stock, p, levers, floorCapacity, t);
  const k2 = derivatives(add(stock, k1, h / 2), p, levers, floorCapacity, t);
  const k3 = derivatives(add(stock, k2, h / 2), p, levers, floorCapacity, t);
  const k4 = derivatives(add(stock, k3, h), p, levers, floorCapacity, t);
  return {
    capacity: stock.capacity + (h / 6) * (k1.capacity + 2 * k2.capacity + 2 * k3.capacity + k4.capacity),
    wip: stock.wip + (h / 6) * (k1.wip + 2 * k2.wip + 2 * k3.wip + k4.wip),
    qualityDebt: stock.qualityDebt + (h / 6) * (k1.qualityDebt + 2 * k2.qualityDebt + 2 * k3.qualityDebt + k4.qualityDebt),
    pressure: stock.pressure + (h / 6) * (k1.pressure + 2 * k2.pressure + 2 * k3.pressure + k4.pressure),
    dependency: stock.dependency + (h / 6) * (k1.dependency + 2 * k2.dependency + 2 * k3.dependency + k4.dependency),
  };
}

function boundState(next, floorCapacity) {
  return {
    capacity: Math.max(floorCapacity, next.capacity),
    wip: Math.max(0, next.wip),
    qualityDebt: Math.max(0, next.qualityDebt),
    pressure: clamp(next.pressure, 0, 3),
    dependency: clamp(next.dependency, 0, 1),
  };
}

/**
 * Integrate the system forward with RK4 and record the whole trajectory, the
 * loop-gain dominance stack per week, and every clamp that fired.
 */
export function simulate(stock, params, levers = {}, { weeks = DYN_DEFAULT_HORIZON_WEEKS } = {}) {
  const horizon = clamp(Math.round(num(weeks, DYN_DEFAULT_HORIZON_WEEKS)), DYN_MIN_HORIZON_WEEKS, DYN_MAX_HORIZON_WEEKS);
  const scopeCut = clamp(num(levers.scopeCutPct, 0), 0, 50) / 100;
  const floorCapacity = Math.max(0, stock.capacity) * 0.4;
  let current = boundState({
    capacity: Math.max(0, stock.capacity),
    wip: Math.max(0, stock.wip) * (1 - scopeCut),
    qualityDebt: Math.max(0, stock.qualityDebt),
    pressure: Math.max(0, stock.pressure),
    dependency: clamp(stock.dependency, 0, 1),
  }, floorCapacity);

  const row = (week) => {
    const flows = derivatives(current, params, levers, floorCapacity, week)._flows;
    return {
      week,
      capacity: round2(current.capacity),
      wip: round2(current.wip),
      qualityDebt: round2(current.qualityDebt),
      pressure: round2(current.pressure),
      dependency: round2(current.dependency),
      saturationPct: Math.round(current.pressure * 100),
      weeksOfWip: round2(current.capacity > 0 ? current.wip / current.capacity : 0),
      throughput: round2(flows.throughput),
    };
  };

  const trajectory = [row(0)];
  const dominance = [];
  let clampedWeeks = 0;
  let cumulativeThroughput = 0;

  for (let week = 1; week <= horizon; week += 1) {
    dominance.push(summarizeGains(current, params, levers, floorCapacity, week - 1));
    const stepFlows = derivatives(current, params, levers, floorCapacity, week - 1)._flows;
    const next = rk4Step(current, params, levers, floorCapacity, week - 1);
    const bounded = boundState(next, floorCapacity);
    if (stepFlows.floorActive
      || Math.abs(bounded.wip - next.wip) > 1e-6
      || Math.abs(bounded.qualityDebt - next.qualityDebt) > 1e-6
      || Math.abs(bounded.capacity - next.capacity) > 1e-6) {
      clampedWeeks += 1;
    }
    current = bounded;
    cumulativeThroughput += derivatives(current, params, levers, floorCapacity, week)._flows.throughput;
    trajectory.push(row(week));
  }

  const start = trajectory[0];
  const end = trajectory[trajectory.length - 1];
  const meanSharePct = Object.fromEntries(DYN_LOOPS.map((loop) => [
    loop.id,
    Math.round(dominance.reduce((sum, r) => sum + (r.shares.find((sh) => sh.id === loop.id)?.sharePct ?? 0), 0) / Math.max(1, dominance.length)),
  ]));
  const dominantOverall = [...DYN_LOOPS.map((l) => ({ id: l.id, share: meanSharePct[l.id] }))]
    .sort((a, b) => b.share - a.share || a.id.localeCompare(b.id))[0]?.id ?? null;
  const dominanceShiftWeek = (() => {
    const first = dominance[0];
    if (!first || !first.dominant) return null;
    // A one-week wobble between two nearly-tied loops is not a regime change.
    const idx = dominance.findIndex((r, i) => i > 1
      && r.dominant !== first.dominant
      && r.dominantSharePct >= 25
      && dominance[i + 1]?.dominant === r.dominant);
    return idx === -1 ? null : dominance[idx].week;
  })();
  const peakPressure = trajectory.reduce((m, r) => Math.max(m, r.pressure), 0);

  return {
    horizonWeeks: horizon,
    trajectory,
    dominance,
    clampedWeeks,
    summary: {
      startSaturationPct: start.saturationPct,
      endSaturationPct: end.saturationPct,
      peakSaturationPct: Math.round(peakPressure * 100),
      endWipDays: end.wip,
      startCapacityPerWeek: start.capacity,
      endCapacityPerWeek: end.capacity,
      capacityChangePct: start.capacity > 0
        ? Math.round(((end.capacity - start.capacity) / start.capacity) * 100)
        : 0,
      endQualityDebtDays: end.qualityDebt,
      endDependencyPct: Math.round(end.dependency * 100),
      endWeeksOfWip: end.weeksOfWip,
      cumulativeThroughputDays: round2(cumulativeThroughput),
      saturationDeltaPct: end.saturationPct - start.saturationPct,
      wipDeltaDays: round2(end.wip - start.wip),
      capacityDeltaPerWeek: round2(end.capacity - start.capacity),
      dominantLoop: dominance[0]?.dominant ?? null,
      dominantLoopEnd: dominance[dominance.length - 1]?.dominant ?? null,
      dominanceShiftWeek,
      meanSharePct,
      dominantOverall,
      hasSaturationClamp: clampedWeeks > 0,
    },
  };
}

function summarizeGains(stock, p, levers, floorCapacity, week) {
  const gains = loopGains(stock, p, levers, floorCapacity, week);
  const activation = loopActivation(stock, p, levers, floorCapacity, week);
  const entries = DYN_LOOPS.map((loop) => ({
    id: loop.id,
    name: loop.name,
    polarity: loop.polarity,
    gain: round2(gains[loop.id] || 0),
    activation: round2(activation[loop.id] || 0),
  }));
  const total = gains.total > 0 ? gains.total : 0;
  const ranked = [...entries].sort((a, b) => b.gain - a.gain || a.id.localeCompare(b.id));
  return {
    week,
    totalGain: round2(total),
    shares: entries.map((e) => ({ ...e, sharePct: total > 0 ? Math.round((e.gain / total) * 100) : 0 })),
    dominant: total > 0 ? ranked[0].id : null,
    dominantSharePct: total > 0 ? Math.round((ranked[0].gain / total) * 100) : 0,
  };
}

/* ------------------------------------------------------------ stability */

/** Numeric Jacobian of the four-and-a-half-dimensional system at a point. */
export function jacobian(stock, params, levers = {}, epsilon = 1e-4) {
  const base = derivatives(stock, params, levers);
  const keys = ['capacity', 'wip', 'qualityDebt', 'pressure', 'dependency'];
  const rows = keys.map(() => []);
  for (const key of keys) {
    const bump = { ...stock, [key]: stock[key] + epsilon };
    const shifted = derivatives(bump, params, levers);
    for (const outKey of keys) rows[keys.indexOf(outKey)].push((shifted[outKey] - base[outKey]) / epsilon);
  }
  return rows;
}

/** Faddeev–LeVerrier characteristic polynomial coefficients, highest first. */
export function characteristicPolynomial(matrix) {
  const n = matrix.length;
  if (!n) return [1];
  const identity = matrix.map((row, i) => row.map((_, j) => (i === j ? 1 : 0)));
  const multiply = (a, b) => a.map((row, i) => b[0].map((_, j) => row.reduce((sum, v, k) => sum + v * b[k][j], 0)));
  const trace = (a) => a.reduce((sum, row, i) => sum + row[i], 0);
  const coeffs = [1];
  let current = matrix.map((row) => [...row]);
  for (let k = 1; k <= n; k += 1) {
    const c = -trace(current) / k;
    coeffs.push(c);
    const adjusted = current.map((row) => [...row]);
    for (let i = 0; i < n; i += 1) adjusted[i][i] += c;
    current = multiply(matrix, adjusted);
  }
  // coeffs[0]·λ^n + coeffs[1]·λ^(n−1) + … + coeffs[n] = 0
  return coeffs;
}

function evalPoly(coeffs, z) {
  let re = 0;
  let im = 0;
  for (const c of coeffs) {
    const nextRe = re * z.re - im * z.im + c;
    const nextIm = re * z.im + im * z.re;
    re = nextRe;
    im = nextIm;
  }
  return { re, im };
}

/**
 * Durand–Kerner root finder for a real polynomial. Deterministic initial
 * guesses on a circle; converges for the small (≤6) polynomials this model
 * produces.
 */
export function polynomialRoots(coeffs, { iterations = 200 } = {}) {
  const a = coeffs.map((c) => Number(c) || 0);
  while (a.length > 1 && Math.abs(a[0]) < 1e-12) a.shift();
  const degree = a.length - 1;
  if (degree < 1) return [];
  const monic = a.map((c) => c / a[0]);
  const radius = 1 + Math.max(...monic.slice(1).map((c) => Math.abs(c)));
  const roots = Array.from({ length: degree }, (_, i) => ({
    re: radius * Math.cos((2 * Math.PI * i) / degree + 0.4),
    im: radius * Math.sin((2 * Math.PI * i) / degree + 0.4),
  }));
  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < degree; i += 1) {
      const numerator = evalPoly(monic, roots[i]);
      let denomRe = 1;
      let denomIm = 0;
      for (let j = 0; j < degree; j += 1) {
        if (i === j) continue;
        const diffRe = roots[i].re - roots[j].re;
        const diffIm = roots[i].im - roots[j].im;
        // multiply the running denominator by the complex difference
        const nextRe = denomRe * diffRe - denomIm * diffIm;
        const nextIm = denomRe * diffIm + denomIm * diffRe;
        denomRe = nextRe;
        denomIm = nextIm;
      }
      const mag = denomRe * denomRe + denomIm * denomIm;
      if (mag < 1e-12) continue;
      const divRe = (numerator.re * denomRe + numerator.im * denomIm) / mag;
      const divIm = (numerator.im * denomRe - numerator.re * denomIm) / mag;
      roots[i] = { re: roots[i].re - divRe, im: roots[i].im - divIm };
    }
  }
  return roots
    .map((z) => ({ re: Math.round(z.re * 1e6) / 1e6, im: Math.round(z.im * 1e6) / 1e6 }))
    .sort((a, b) => b.re - a.re || Math.abs(b.im) - Math.abs(a.im));
}

/**
 * Linear stability of the current structure. A positive real part means the
 * system diverges from equilibrium at rate λ; the characteristic time is 1/λ.
 * This is a property of the *model as configured*, not a prophecy.
 */
export function stabilityAnalysis(stock, params, levers = {}) {
  const J = jacobian(stock, params, levers);
  if (!J.length) return { ok: false, reason: 'No state to linearise.' };
  const coeffs = characteristicPolynomial(J);
  const roots = polynomialRoots(coeffs);
  const leading = roots[0] || null;
  const realParts = roots.map((r) => r.re);
  const maxReal = realParts.length ? Math.max(...realParts) : null;
  const complex = roots.some((r) => Math.abs(r.im) > 1e-3);
  return {
    ok: true,
    jacobian: J.map((row) => row.map((v) => Math.round(v * 1e4) / 1e4)),
    coefficients: coeffs.map((c) => Math.round(c * 1e6) / 1e6),
    eigenvalues: roots,
    maxRealPart: maxReal,
    characteristicTimeWeeks: maxReal !== null && Math.abs(maxReal) > 1e-6 ? Math.round((1 / Math.abs(maxReal)) * 10) / 10 : null,
    complex,
    verdict: maxReal === null
      ? 'unknown'
      : maxReal > 0.02 ? 'divergent' : maxReal > 0.002 ? 'weakly divergent' : maxReal < -0.002 ? 'self-correcting' : 'marginal',
    note: maxReal !== null && maxReal > 0.02
      ? 'The current structure amplifies a disturbance instead of absorbing it. The loop, not the person, is the unit of repair.'
      : maxReal !== null && maxReal > 0.002
        ? 'The structure is only weakly self-correcting: it returns toward equilibrium so slowly that a quarter of drift looks permanent.'
        : 'The current structure absorbs a disturbance and returns toward equilibrium. Policy still matters, but the system is not running away from you.',
  };
}

/* ------------------------------------------------------------ archetypes */

const ARCHETYPE_TEXT = {
  'limits-to-growth': {
    label: 'Limits to Growth',
    summary: 'A reinforcing engine is pushing against a limit the team has stopped investing in. Growth slows, then reverses, while effort stays high.',
    repair: 'Remove or raise the limit (capacity ceiling, quality debt) before spending more energy on the engine.',
  },
  'shifting-the-burden': {
    label: 'Shifting the Burden',
    summary: 'A fast symptomatic fix is carrying the system while the fundamental capacity fix starves. Relief now, dependence later.',
    repair: 'Keep the symptomatic fix only as a bridge, and attach a dated structural commitment to it.',
  },
  'fixes-that-fail': {
    label: 'Fixes that Fail',
    summary: 'The intervention is generating the problem it was meant to solve, with a delay long enough to escape blame.',
    repair: 'Make the delay explicit: measure the drag the fix introduces, and plan for the dip it creates.',
  },
  'success-to-the-successful': {
    label: 'Success to the Successful',
    summary: 'Routing work to whoever already handles it concentrates capability, which makes the next round of work land in the same place.',
    repair: 'Change the allocation rule, not the allocator: make substitution a designed property.',
  },
  reinvestment: {
    label: 'Reinvestment',
    summary: 'Capability growth dominates: slack is being converted into a higher ceiling, which is the only loop that compounds.',
    repair: 'Protect it. This is the loop every other intervention should serve.',
  },
  balancing: {
    label: 'Balancing',
    summary: 'The system is correcting itself. Throughput is tracking the incoming work and pressure is being absorbed.',
    repair: 'Leave the structure alone and watch for the loop that will take over when the slack is gone.',
  },
};

/**
 * Archetype detection from measured loop gain over the whole horizon, not from
 * a dropdown and not from a single snapshot. Every claim carries the evidence
 * lines that produced it and rests on the model's own provenance.
 */
export function detectArchetypes(model, simulation, stability) {
  const findings = [];
  const dominance = simulation.dominance || [];
  if (!dominance.length) return { findings, dominant: null, confidence: 'none', reinforcingSharePct: 0 };
  const mean = simulation.summary.meanSharePct || {};
  const share = (id) => mean[id] ?? 0;
  const overall = simulation.summary.dominantOverall;
  const reinforcingShare = DYN_LOOPS
    .filter((loop) => loop.polarity === 'reinforcing')
    .reduce((sum, loop) => sum + share(loop.id), 0);
  const endOverloaded = simulation.summary.endSaturationPct >= 100;
  const growthStarved = share('R3') < 12;

  if (share('B3') + share('B2') >= 35 && growthStarved && (reinforcingShare >= 30 || endOverloaded)) {
    findings.push({
      id: 'shifting-the-burden',
      ...ARCHETYPE_TEXT['shifting-the-burden'],
      evidence: [
        `Symptom loops (quality repair + hiring drag) hold ${Math.round(share('B3') + share('B2'))}% of measured loop gain.`,
        `Capability growth holds ${share('R3')}%.`,
        `Saturation ends at ${simulation.summary.endSaturationPct}%.`,
      ],
      severity: endOverloaded ? 4 : 3,
    });
  }
  if (share('B2') >= 20 && share('R1') >= 20 && simulation.summary.endSaturationPct >= simulation.summary.startSaturationPct) {
    findings.push({
      id: 'fixes-that-fail',
      ...ARCHETYPE_TEXT['fixes-that-fail'],
      evidence: [
        `Hiring drag holds ${share('B2')}% of measured loop gain.`,
        `The burnout loop holds ${share('R1')}%.`,
        `Saturation moves ${simulation.summary.startSaturationPct}% → ${simulation.summary.endSaturationPct}%.`,
      ],
      severity: 3,
    });
  }
  if (share('R2') >= 20 && (model.stocks.dependency >= 0.4 || simulation.summary.endDependencyPct >= 55)) {
    findings.push({
      id: 'success-to-the-successful',
      ...ARCHETYPE_TEXT['success-to-the-successful'],
      evidence: [
        `The key-person loop holds ${share('R2')}% of measured loop gain.`,
        `Dependency concentration is ${Math.round(model.stocks.dependency * 100)}% and ends at ${simulation.summary.endDependencyPct}%.`,
      ],
      severity: 3,
    });
  }
  // Limits to Growth is about the *limit*, which in this model is the capacity
  // stock. Requiring the burnout loop alone to hold 20% of gain missed the most
  // common real shape: capacity erodes while intake deferral absorbs the
  // pressure, so the reinforcing share is split across R1 and R2.
  const eroding = simulation.summary.capacityChangePct <= -8;
  if ((share('R1') >= 20 && growthStarved && (endOverloaded || share('R1') >= 25))
    || (eroding && growthStarved && reinforcingShare >= 20 && endOverloaded)) {
    findings.push({
      id: 'limits-to-growth',
      ...ARCHETYPE_TEXT['limits-to-growth'],
      evidence: [
        `The burnout loop holds ${share('R1')}%; reinforcing loops together hold ${reinforcingShare}%.`,
        `Capability growth contributes ${share('R3')}%, and capacity moves ${simulation.summary.startCapacityPerWeek} → ${simulation.summary.endCapacityPerWeek} person-days/week (${simulation.summary.capacityChangePct}%).`,
        stability?.ok
          ? `Largest real eigenvalue ${stability.maxRealPart?.toFixed(4)} → ${stability.verdict} (characteristic time ${stability.characteristicTimeWeeks ?? '—'} weeks).`
          : 'Stability not evaluated.',
      ],
      severity: endOverloaded ? 4 : 3,
    });
  }
  if (overall === 'R3' && reinforcingShare >= 40) {
    findings.push({
      id: 'reinvestment',
      ...ARCHETYPE_TEXT.reinvestment,
      evidence: [
        `Capability growth holds ${share('R3')}% of measured loop gain across the horizon.`,
        `Saturation is ${Math.round(model.stocks.pressure * 100)}% with ${model.context.wipWeeks ?? '—'} weeks of work in progress.`,
      ],
      severity: 1,
    });
  }
  if (!findings.length) {
    findings.push({
      id: 'balancing',
      ...ARCHETYPE_TEXT.balancing,
      evidence: [
        `Dominant loop across the horizon: ${overall ?? 'none'} (${share(overall) ?? 0}% of gain).`,
        `Saturation ${simulation.summary.startSaturationPct}% → ${simulation.summary.endSaturationPct}% over ${simulation.horizonWeeks} weeks.`,
      ],
      severity: endOverloaded ? 2 : 1,
    });
  }

  const confidence = model.provenance.assumedPct >= DYN_ASSUMED_WARN_PCT
    ? 'provisional'
    : model.context.activePeople >= 5 ? 'structural' : 'thin';
  return {
    findings: findings.sort((a, b) => b.severity - a.severity),
    dominant: overall,
    confidence,
    reinforcingSharePct: reinforcingShare,
  };
}

/* ------------------------------------------------------------ policies */

function leversFrom(spec = {}) {
  const out = {};
  for (const lever of DYN_LEVERS) {
    out[lever.key] = clamp(num(spec?.[lever.key], lever.default), lever.min, lever.max);
  }
  return out;
}

/** Run one policy against the derived model and compare it with doing nothing. */
export function evaluatePolicy(model, levers = {}, { weeks = DYN_DEFAULT_HORIZON_WEEKS } = {}) {
  const clean = leversFrom(levers);
  const baseline = simulate(model.stocks, model.params, {}, { weeks });
  const scenario = simulate(model.stocks, model.params, clean, { weeks });
  const stability = stabilityAnalysis(model.stocks, model.params, clean);
  const pull = DYN_LEVERS
    .filter((lever) => clean[lever.key] > 0)
    .map((lever) => ({
      key: lever.key,
      label: lever.label,
      value: clean[lever.key],
      unit: lever.unit,
      leverageClass: lever.leverageClass,
      leverageLabel: lever.leverageLabel,
    }));
  const strongest = pull.slice().sort((a, b) => b.leverageClass - a.leverageClass)[0] || null;
  const delta = {
    saturationPct: scenario.summary.endSaturationPct - baseline.summary.endSaturationPct,
    wipDays: round2(scenario.summary.endWipDays - baseline.summary.endWipDays),
    capacityPerWeek: round2(scenario.summary.endCapacityPerWeek - baseline.summary.endCapacityPerWeek),
    throughputDays: round2(scenario.summary.cumulativeThroughputDays - baseline.summary.cumulativeThroughputDays),
    dependencyPct: scenario.summary.endDependencyPct - baseline.summary.endDependencyPct,
  };
  const verdict = (() => {
    const better = delta.saturationPct < -2 && delta.throughputDays >= -5;
    const worse = delta.saturationPct > 2;
    // A structural investment that costs throughput now and raises the ceiling
    // later is not a failed policy; it is a policy with a delay. The test is the
    // capacity stock itself, not the lever's label — a self-described "systemic"
    // move that leaves capacity flat is not an investment.
    // The test is the capacity stock itself, not the lever's label: a
    // self-described systemic move that leaves capacity flat is not an investment.
    const structuralBet = delta.capacityPerWeek > 0.05;
    if (better) return 'improves';
    if (worse) return structuralBet ? 'investment' : 'worsens';
    // No material change in perceived pressure this horizon: judge the structure.
    // A ceiling-raising bet paid for out of this horizon's throughput is an
    // investment, and the invoice is reported either way.
    if (structuralBet) return delta.throughputDays < -5 ? 'investment' : 'improves';
    if (delta.capacityPerWeek > 0.05 && delta.wipDays <= 0) return 'improves';
    return 'neutral';
  })();
  return {
    levers: clean,
    pull,
    strongestLeverage: strongest,
    baseline,
    scenario,
    stability,
    delta,
    verdict,
    structural: verdict === 'improves' && delta.wipDays <= 0 && scenario.summary.endSaturationPct < 100,
  };
}

/** Monte Carlo over parameter uncertainty with a seeded, reproducible draw. */
export function monteCarloPolicy(model, levers = {}, {
  weeks = DYN_DEFAULT_HORIZON_WEEKS,
  trials = DYN_MC_TRIALS,
  seed = 42,
  cv = DYN_MC_CV,
} = {}) {
  const rand = mulberry32(seed);
  const clean = leversFrom(levers);
  const saturation = [];
  const wip = [];
  const throughput = [];
  const keys = ['growthRate', 'overloadAttrition', 'reworkGenRate', 'onboardingDragPd', 'dependencyRouting', 'pressureLagWeeks'];
  for (let t = 0; t < trials; t += 1) {
    const params = { ...model.params };
    for (const key of keys) {
      const base = Math.max(1e-6, Number(params[key]) || 1e-6);
      const drift = Math.exp(gaussian(rand) * cv - (cv * cv) / 2);
      params[key] = base * drift;
    }
    const run = simulate(model.stocks, params, clean, { weeks });
    saturation.push(run.summary.endSaturationPct);
    wip.push(run.summary.endWipDays);
    throughput.push(run.summary.cumulativeThroughputDays);
  }
  const sorted = (values) => [...values].sort((a, b) => a - b);
  const band = (values) => {
    const s = sorted(values);
    return {
      p50: round2(quantile(s, 0.5)),
      p80: round2(quantile(s, 0.8)),
      p90: round2(quantile(s, 0.9)),
      min: round2(s[0]),
      max: round2(s[s.length - 1]),
    };
  };
  return {
    seed,
    trials,
    cv,
    assumedKeys: keys,
    saturationPct: band(saturation),
    wipDays: band(wip),
    throughputDays: band(throughput),
    note: `Seeded ${seed} lognormal parameter draws (CV ${cv}) on ${keys.length} structural coefficients. This is sensitivity to the model's assumptions, not a probability of the future.`,
  };
}

/* ------------------------------------------------------------ calibration */

/**
 * Reconstruct weekly work-in-progress from dated portfolio lifecycle records.
 *
 * This is deliberately narrow: only records with a valid creation date and a
 * valid completion (or release) date contribute, and every gap is counted.
 * A partially dated ledger therefore produces a completeness figure instead of
 * a confident line — the defect the previous session found in the anomaly
 * terminal, not repeated here.
 */
export function observedWipSeries(state = {}, now = new Date(), { weeks = 16 } = {}) {
  const today = dayKey(now);
  const all = (Array.isArray(state.portfolio) ? state.portfolio : []).filter(Boolean);
  const items = all
    .map((i) => (i.createdOn ? i : (i.createdAt ? { ...i, createdOn: String(i.createdAt).slice(0, 10) } : null)))
    .filter((i) => i && i.createdOn);
  const closedWithoutDate = all.filter((i) => i.status === 'done' && !i.completedOn && !i.releasedOn).length;
  const completenessPct = all.length
    ? clamp(Math.round(((items.length - closedWithoutDate) / all.length) * 100), 0, 100)
    : 0;
  const series = [];
  for (let w = weeks - 1; w >= 0; w -= 1) {
    const weekEnd = addDays(today, -w * 7);
    const weekStart = addDays(weekEnd, -6);
    let total = 0;
    let counted = 0;
    for (const item of items) {
      const created = item.createdOn;
      const closed = item.completedOn || item.releasedOn || null;
      const effort = pertTriple(item.effortDays).expected || 0;
      if (!created || created > weekEnd) continue;
      if (closed && closed < weekStart) continue;
      // Done without a delivery date is an evidence gap: excluded and counted,
      // never dated by guesswork and never interpolated.
      if (!closed && item.status === 'done') continue;
      // A item closed mid-week carries half a week of exposure rather than
      // being pretended open or closed for all seven days.
      total += closed && closed >= weekStart && closed <= weekEnd ? effort * 0.5 : effort;
      counted += 1;
    }
    series.push({ weekStart, weekEnd, wipDays: round2(total), records: counted });
  }
  return {
    series,
    weeks: series.length,
    completenessPct,
    undatedRecords: all.length - items.length,
    closedWithoutDate,
    recordsConsidered: all.length,
    usableObservations: series.reduce((sum, row) => sum + row.records, 0),
    weeksWithData: series.filter((row) => row.records > 0).length,
    note: 'Weekly WIP is reconstructed from dated portfolio lifecycle records. Undated closures are excluded rather than interpolated, and completeness is measured over records, not over item-weeks.',
  };
}

/**
 * Hindcast the model against the observed series and score it against naive
 * persistence. A model that cannot beat "tomorrow equals today" earns no
 * authority, and this function says so out loud.
 */
export function calibrateDynamics(model, state = {}, now = new Date(), { weeks = 16 } = {}) {
  const observed = observedWipSeries(state, now, { weeks });
  const minWeeksWithData = DYN_MIN_HISTORY_WEEKS - 2;
  if (observed.series.length < DYN_MIN_HISTORY_WEEKS
    || observed.completenessPct < DYN_CALIBRATION_COMPLETENESS_PCT
    || observed.recordsConsidered < DYN_CALIBRATION_MIN_RECORDS
    || observed.weeksWithData < minWeeksWithData) {
    const reason = observed.series.length < DYN_MIN_HISTORY_WEEKS
      ? `Only ${observed.series.length} week(s) of dated history are available; at least ${DYN_MIN_HISTORY_WEEKS} are needed.`
      : observed.completenessPct < DYN_CALIBRATION_COMPLETENESS_PCT
        ? `Only ${observed.completenessPct}% of portfolio records carry dated lifecycle information; ${DYN_CALIBRATION_COMPLETENESS_PCT}% is the floor for a hindcast.`
        : observed.recordsConsidered < DYN_CALIBRATION_MIN_RECORDS
          ? `Only ${observed.recordsConsidered} dated portfolio record${observed.recordsConsidered === 1 ? ' exists' : 's exist'}; ${DYN_CALIBRATION_MIN_RECORDS} are needed before a fit means anything.`
          : `Only ${observed.weeksWithData} of the last ${observed.weeks} weeks have dated work in progress; ${minWeeksWithData} are needed, and gaps are never interpolated.`;
    return {
      status: 'insufficient',
      observed,
      reason,
      skill: null,
      mase: null,
    };
  }
  const start = observed.series[0];
  const initial = { ...model.stocks, wip: Math.max(0, start.wipDays) };
  const horizon = observed.series.length - 1;
  const run = simulate(initial, model.params, {}, { weeks: Math.max(DYN_MIN_HORIZON_WEEKS, horizon) });
  const predicted = run.trajectory.slice(0, observed.series.length).map((row) => row.wip);
  const actual = observed.series.map((row) => row.wipDays);
  const errors = predicted.map((p, i) => p - actual[i]);
  const rmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length);
  const naiveErrors = actual.slice(1).map((value, i) => actual[i] - value);
  const naiveRmse = Math.sqrt(naiveErrors.reduce((s, e) => s + e * e, 0) / naiveErrors.length);
  const mase = naiveRmse > 0 ? rmse / naiveRmse : null;
  const skill = naiveRmse > 0 ? Math.round((1 - (rmse * rmse) / (naiveRmse * naiveRmse)) * 100) / 100 : null;
  const bias = errors.reduce((s, e) => s + e, 0) / errors.length;
  return {
    status: 'scored',
    observed,
    horizonWeeks: horizon,
    predicted,
    actual,
    rmse: round2(rmse),
    naiveRmse: round2(naiveRmse),
    mase: mase === null ? null : Math.round(mase * 100) / 100,
    skill,
    bias: round2(bias),
    verdict: skill === null
      ? 'undefined'
      : skill > 0.2 ? 'informative' : skill > 0 ? 'marginal' : 'no-better-than-persistence',
    note: 'Parameters are held at their current estimates across the whole hindcast. This measures structural consistency, not forecasting power.',
  };
}

/* ------------------------------------------------------------ report */

function policyRows(model, weeks) {
  const baseline = simulate(model.stocks, model.params, {}, { weeks });
  const rows = DYN_PLAYBOOK.map((entry) => {
    const evaluation = evaluatePolicy(model, entry.levers, { weeks });
    return {
      key: entry.key,
      name: entry.name,
      hypothesis: entry.hypothesis,
      levers: entry.levers,
      pull: evaluation.pull,
      strongestLeverage: evaluation.strongestLeverage,
      delta: evaluation.delta,
      verdict: evaluation.verdict,
      structural: evaluation.structural,
      scenario: evaluation.scenario,
      baseline: evaluation.baseline,
      endSaturationPct: evaluation.scenario.summary.endSaturationPct,
      endWipDays: evaluation.scenario.summary.endWipDays,
    };
  });
  const ranked = [...rows].sort((a, b) => {
    const aScore = a.delta.saturationPct + (a.structural ? -5 : 0);
    const bScore = b.delta.saturationPct + (b.structural ? -5 : 0);
    return aScore - bScore;
  });
  return { baseline, rows, ranked, best: ranked[0] || null };
}

/**
 * Reports are derived, and deriving one costs a load report, a capacity model,
 * seven policy simulations and a hindcast. A render asks for the same report
 * several times (nav badge, page, signals), so it is memoised.
 *
 * Invalidation contract: the cache is keyed by the *state object identity* plus
 * a fingerprint of its revision, update stamp, the day and the collection
 * lengths. Every real write goes through `store.update`, which replaces the
 * state object and bumps the revision, so a cached report can never describe a
 * different set of records. Callers that mutate a state object in place must
 * change its length or revision to be seen — the app never does, and the tests
 * construct fresh states per case.
 */
const REPORT_CACHE = new WeakMap();

function reportFingerprint(state, now) {
  return [
    state.meta?.revision ?? 0,
    state.meta?.updatedAt ?? '',
    dayKey(now),
    state.people?.length ?? 0,
    state.portfolio?.length ?? 0,
    state.cases?.length ?? 0,
    state.dependencies?.length ?? 0,
    state.onboarding?.length ?? 0,
    state.delegations?.length ?? 0,
    state.requisitions?.length ?? 0,
    state.dynamicsExperiments?.length ?? 0,
    state.settings?.dynamicsHorizonWeeks ?? '',
    state.settings?.dynamicsTargetWipWeeks ?? '',
    state.settings?.dynamicsStructuralRiskPct ?? '',
  ].join('|');
}

export function buildDynamicsReport(state = {}, now = new Date()) {
  if (state && typeof state === 'object') {
    const fingerprint = reportFingerprint(state, now);
    const cached = REPORT_CACHE.get(state);
    if (cached && cached.fingerprint === fingerprint) return cached.report;
    const report = computeDynamicsReport(state, now);
    REPORT_CACHE.set(state, { fingerprint, report });
    return report;
  }
  return computeDynamicsReport(state, now);
}

function computeDynamicsReport(state = {}, now = new Date()) {
  const model = deriveDynamicsModel(state, now);
  const settings = state.settings || {};
  const horizonWeeks = clamp(
    Math.round(num(settings.dynamicsHorizonWeeks, DYN_DEFAULT_HORIZON_WEEKS)),
    DYN_MIN_HORIZON_WEEKS,
    DYN_MAX_HORIZON_WEEKS,
  );
  if (!model.adequate) {
    return {
      engineVersion: DYN_ENGINE_VERSION,
      today: model.today,
      model,
      adequate: false,
      reason: model.empty
        ? 'No people on the roster yet, so there is no system to simulate. Add the team first — the Lab models people, work and quality, not placeholders.'
        : `The Lab needs at least ${DYN_MIN_PEOPLE} active people and a measured capacity to say anything structural. Currently ${model.context.activePeople} active person(s) and ${model.context.capacityPerWeek} person-days/week.`,
      horizonWeeks,
      simulation: null,
      stability: null,
      archetypes: null,
      policies: null,
      calibration: null,
      experiments: [],
      totals: { attention: 0, experiments: 0, adopted: 0 },
      structuralRiskPct: 0,
    };
  }

  const baseline = simulate(model.stocks, model.params, {}, { weeks: horizonWeeks });
  const stability = stabilityAnalysis(model.stocks, model.params, {});
  const archetypes = detectArchetypes(model, baseline, stability);
  const policies = policyRows(model, horizonWeeks);
  const calibration = calibrateDynamics(model, state, now);
  const experiments = (Array.isArray(state.dynamicsExperiments) ? state.dynamicsExperiments : [])
    .filter(Boolean)
    .map((experiment) => {
      const evaluation = evaluatePolicy(model, experiment.levers, { weeks: experiment.horizonWeeks || horizonWeeks });
      return {
        ...experiment,
        evaluation,
        checkpointDue: experiment.status === 'adopted' && experiment.checkpointOn && experiment.checkpointOn <= model.today,
      };
    });
  const structuralRiskPct = structuralRisk(model, baseline, stability, archetypes);
  const adopted = experiments.filter((e) => e.status === 'adopted');
  const attention = (structuralRiskPct >= DYN_STRUCTURAL_RISK_PCT ? 1 : 0)
    + experiments.filter((e) => e.checkpointDue).length
    + (model.provenance.assumedPct >= DYN_ASSUMED_WARN_PCT ? 1 : 0);

  return {
    engineVersion: DYN_ENGINE_VERSION,
    today: model.today,
    model,
    adequate: true,
    reason: null,
    horizonWeeks,
    simulation: baseline,
    stability,
    archetypes,
    policies,
    calibration,
    experiments,
    adopted,
    structuralRiskPct,
    loops: DYN_LOOPS.map((loop) => {
      const share = baseline.dominance[0]?.shares.find((s) => s.id === loop.id) ?? null;
      return {
        ...loop,
        activation: share?.activation ?? 0,
        sharePct: share?.sharePct ?? 0,
        dominant: baseline.dominance[0]?.dominant === loop.id,
      };
    }),
    provenance: model.provenance,
    totals: {
      attention,
      experiments: experiments.length,
      adopted: adopted.length,
      dueCheckpoints: experiments.filter((e) => e.checkpointDue).length,
    },
  };
}

/** Risk is a weighted composite of the signals the model can defend. */
function structuralRisk(model, simulation, stability, archetypes) {
  let score = 0;
  const endPressure = simulation.summary.endSaturationPct;
  if (endPressure >= 150) score += 35;
  else if (endPressure >= 120) score += 28;
  else if (endPressure >= 100) score += 20;
  else if (endPressure >= 85) score += 10;
  const drift = simulation.summary.saturationDeltaPct;
  if (drift >= 40) score += 15;
  else if (drift >= 20) score += 8;
  else if (drift >= 8) score += 4;
  const reinforcing = archetypes?.reinforcingSharePct ?? 0;
  if (reinforcing >= 40) score += 20;
  else if (reinforcing >= 25) score += 12;
  else if (reinforcing >= 15) score += 5;
  if (model.stocks.dependency >= 0.6) score += 10;
  else if (model.stocks.dependency >= 0.4) score += 5;
  if (stability?.ok && stability.maxRealPart > 0.02) score += 15;
  else if (stability?.ok && stability.maxRealPart > 0.002) score += 7;
  if (archetypes?.findings?.some((f) => f.severity >= 4)) score += 10;
  return clamp(Math.round(score), 0, 100);
}

export function dynamicsAttentionCount(state = {}, now = new Date()) {
  const report = buildDynamicsReport(state, now);
  return report.totals ? report.totals.attention : 0;
}

/* ------------------------------------------------------------ brief */

export function dynamicsBrief(state = {}, now = new Date()) {
  const report = buildDynamicsReport(state, now);
  const lines = [];
  lines.push(`# Operating system dynamics brief — ${report.today}`);
  lines.push('');
  if (!report.adequate) {
    lines.push(report.reason);
    return lines.join('\n');
  }
  const m = report.model;
  const s = report.simulation;
  lines.push(`## Structure (${report.horizonWeeks}-week horizon, ${s.horizonWeeks} integrated)`)
  lines.push(`- Capacity: ${m.stocks.capacity} person-days/week; work in progress: ${m.stocks.wip} person-days (${m.context.wipWeeks ?? '—'} weeks).`)
  lines.push(`- Current saturation: ${Math.round(m.stocks.pressure * 100)}% → ${s.summary.endSaturationPct}% at week ${s.horizonWeeks} (peak ${s.summary.peakSaturationPct}%).`)
  lines.push(`- Dependency concentration: ${Math.round(m.stocks.dependency * 100)}% → ${s.summary.endDependencyPct}%.`)
  lines.push(`- Structural risk: ${report.structuralRiskPct}/100. Dominant loop: ${s.summary.dominantLoop ?? '—'} at week 0, ${s.summary.dominantLoopEnd ?? '—'} at the end.`);
  lines.push(`- Stability: ${report.stability.verdict} (largest real eigenvalue ${report.stability.maxRealPart?.toFixed(3)}; characteristic time ${report.stability.characteristicTimeWeeks ?? '—'} weeks).`);
  lines.push('');
  lines.push('## Archetypes detected');
  for (const finding of report.archetypes.findings) {
    lines.push(`- **${finding.label}** (severity ${finding.severity}): ${finding.summary}`);
    lines.push(`  Repair: ${finding.repair}`);
    for (const line of finding.evidence) lines.push(`  - ${line}`);
  }
  lines.push('');
  lines.push('## Policy experiments (ranked by end-state saturation)');
  for (const row of report.policies.ranked) {
    lines.push(`- ${row.name}: saturation ${row.delta.saturationPct > 0 ? '+' : ''}${row.delta.saturationPct} pts, WIP ${row.delta.wipDays > 0 ? '+' : ''}${row.delta.wipDays}d, throughput ${row.delta.throughputDays > 0 ? '+' : ''}${row.delta.throughputDays}d → ${row.verdict}${row.structural ? ' (structural)' : ''}.`);
  }
  lines.push('');
  lines.push('## Model provenance');
  lines.push(`- ${report.provenance.measured} measured, ${report.provenance.estimated} estimated, ${report.provenance.assumed} assumed (${report.provenance.assumedPct}% assumed).`);
  const cal = report.calibration;
  if (cal && cal.status === 'scored') {
    lines.push(`- Hindcast skill: ${cal.skill} (MASE ${cal.mase}) against naive persistence over ${cal.horizonWeeks} weeks — ${cal.verdict}.`);
  } else if (cal) {
    lines.push(`- Hindcast not scored: ${cal.reason}`);
  }
  lines.push('');
  lines.push('Caveats: this is a structural model of loops and delays, not a forecast. Parameters marked assumed are conventions, not measurements. Nothing here is a judgement about a person; the bottleneck is a system constraint.');
  return lines.join('\n');
}

/* ------------------------------------------------------------ payloads */

export function normalizeDynamicsExperimentPayload(data = {}) {
  const name = clampText(data.name, 140);
  const hypothesis = clampText(data.hypothesis, 600);
  if (name.length < 3) return { ok: false, error: 'Name the experiment in at least 3 characters.', field: 'name' };
  if (hypothesis.length < 10) return { ok: false, error: 'Write the falsifiable expectation in at least 10 characters.', field: 'hypothesis' };
  const levers = {};
  let touched = 0;
  for (const lever of DYN_LEVERS) {
    const raw = data.levers?.[lever.key];
    const value = clamp(num(raw, lever.default), lever.min, lever.max);
    levers[lever.key] = value;
    if (value > 0) touched += 1;
  }
  if (!touched) return { ok: false, error: 'Move at least one lever — an experiment that changes nothing tests nothing.', field: 'levers' };
  const horizonWeeks = clamp(Math.round(num(data.horizonWeeks, DYN_DEFAULT_HORIZON_WEEKS)), DYN_MIN_HORIZON_WEEKS, DYN_MAX_HORIZON_WEEKS);
  const ownerId = data.ownerId ? String(data.ownerId) : null;
  return {
    ok: true,
    value: {
      name,
      hypothesis,
      levers,
      horizonWeeks,
      ownerId,
      checkpointOn: data.checkpointOn ? String(data.checkpointOn).slice(0, 10) : null,
      notes: clampText(data.notes, 1200),
    },
  };
}

/* ------------------------------------------------------------ rule */

function pushLink(draft, { sourceType, sourceId, targetType, targetId, relation, ruleId, summary }, ctx) {
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  const exists = draft.links.some((l) => l && l.sourceType === sourceType && l.sourceId === sourceId
    && l.targetType === targetType && l.targetId === targetId && l.relation === relation);
  if (exists) return false;
  draft.links.push({
    id: ctx.idFactory('lnk'),
    sourceType,
    sourceId,
    targetType,
    targetId,
    relation,
    ruleId,
    summary: clampText(summary, 300),
    createdOn: ctx.todayStr,
    createdAt: ctx.nowIso,
  });
  return true;
}

function note(ctx, ruleId, action, targetType, targetId, summary, out) {
  out.push({ ruleId, action, targetType, targetId, summary: clampText(summary, 300) });
  if (ctx.logEvent) {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${ruleId}] ${clampText(summary, 280)}`.slice(0, 300),
    });
  }
}

function talkingPointExists(draft, personId, marker) {
  const person = (draft.people || []).find((p) => p && p.id === personId);
  return Boolean(person && (person.talkingPoints || []).some((t) => String(t).includes(marker)));
}

/**
 * Talking points are normalized to 200 characters on every load, so the
 * idempotency marker must lead the string. Putting it at the end silently
 * dropped it on the next reload and made the rule duplicate its own prompts.
 */
function addTalkingPoint(draft, personId, text, marker) {
  const person = (draft.people || []).find((p) => p && p.id === personId && p.status !== 'archived');
  if (!person) return false;
  const composed = `${marker} ${text}`.slice(0, 200);
  person.talkingPoints = [...(Array.isArray(person.talkingPoints) ? person.talkingPoints : []), composed].slice(-12);
  return true;
}

function decisionExists(draft, marker) {
  return (draft.decisions || []).some((d) => d && String(d.question || '').includes(marker));
}

function delegationExists(draft, marker) {
  return (draft.delegations || []).some((d) => d && `${d.title || ''} ${d.expectedOutcome || ''} ${d.support || ''}`.includes(marker));
}

function markerFor(ruleId, entityId = '') {
  return `[${ruleId}${entityId ? `:${entityId}` : ''}]`;
}

/**
 * Post-commit rule (ADR-0008). Runs the structural report on the committed
 * draft — which is what makes the propagation automatic rather than a button —
 * and creates at most one decision, one talking point and one checkpoint per
 * experiment per transaction. Every action is idempotent via markers, so a
 * repeated scan converges instead of accumulating decisions.
 */
export function dynamicsRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const type = event.type;
  const isDynamics = type.startsWith('dynamics.');
  // The Lab may also answer operational changes, but only when the workspace
  // has left that on. An explicit dynamics.* scan always runs.
  const autoTriggers = [
    'portfolio.decision', 'portfolio.completed', 'portfolio.created',
    'person.archived', 'person.restored',
    'case.created', 'case.resolved',
    'requisition.created', 'requisition.updated',
  ];
  const force = ctx.force === true || event.force === true;
  if (!isDynamics && !force) {
    if (draft.settings?.dynamicsAutoPropagate === false) return [];
    if (!autoTriggers.includes(type)) return [];
  }

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const runCtx = {
    now,
    todayStr: dayKey(now),
    nowIso: now.toISOString(),
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
    logEvent: ctx.logEvent,
  };
  const report = buildDynamicsReport(draft, now);
  if (!report.adequate) return [];
  const out = [];

  /* ----- RULE-DYN-01 — structural risk → one DACI structural decision ----- */
  const structureMarker = markerFor(DYN_RULE_IDS.STRUCTURE);
  if (report.structuralRiskPct >= DYN_STRUCTURAL_RISK_PCT && !decisionExists(draft, structureMarker)) {
    const dominant = report.simulation.summary.dominantLoop;
    const loop = LOOP_BY_ID[dominant] || DYN_LOOPS[0];
    const top = report.policies.ranked[0];
    const archetype = report.archetypes.findings[0];
    draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
    const decision = {
      id: runCtx.idFactory('dec'),
      title: `Redesign the ${loop.name.toLowerCase()} loop`.slice(0, 180),
      question: [
        `The system, as currently structured, carries structural risk ${report.structuralRiskPct}/100: saturation moves ${report.simulation.summary.startSaturationPct}% → ${report.simulation.summary.endSaturationPct}% over ${report.horizonWeeks} weeks, the ${loop.name} loop is dominant (${report.simulation.dominance[0]?.dominantSharePct ?? 0}% of circulating person-days), and the largest real eigenvalue is ${report.stability.maxRealPart?.toFixed(3)} (${report.stability.verdict}).`,
        archetype ? `Closest archetype: ${archetype.label}. ${archetype.repair}` : '',
        top ? `The strongest modelled policy is “${top.name}”: ${top.delta.saturationPct > 0 ? '+' : ''}${top.delta.saturationPct} saturation points, ${top.delta.wipDays > 0 ? '+' : ''}${top.delta.wipDays} person-days of WIP.` : '',
        'Choose the level at which to intervene.',
        structureMarker,
      ].filter(Boolean).join(' ').slice(0, 2000),
      date: runCtx.todayStr,
      reversibility: 'reversible',
      driver: (draft.settings?.leaderName || '').slice(0, 120),
      approver: '', contributors: '', informed: '',
      options: [
        {
          id: runCtx.idFactory('dopt'),
          label: `Change a parameter: ${top ? top.name : 'add capacity'}`,
          pros: 'Fastest to start and easiest to reverse; measurable next week.',
          cons: 'Meadows’ weakest leverage — the loop that produced the overload is unchanged.',
        },
        {
          id: runCtx.idFactory('dopt'),
          label: 'Change a flow: throttle intake and cap work in progress',
          pros: 'Lowers cycle time and pressure without hiring; the backlog drains instead of growing.',
          cons: 'Requires saying no to something, and the queue is visible to stakeholders.',
        },
        {
          id: runCtx.idFactory('dopt'),
          label: 'Change a stock or delay: pay down quality debt / dependency at the source',
          pros: 'Removes the symptomatic loop rather than feeding it; compounds.',
          cons: 'Costs delivery capacity this quarter before it returns anything.',
        },
        {
          id: runCtx.idFactory('dopt'),
          label: 'Redesign the loop: make substitution and learning structural',
          pros: 'Strongest leverage — changes the rules that decide where work lands.',
          cons: 'Slowest to show, hardest to defend in a quarter-driven review.',
        },
      ],
      chosen: '', rationale: '', reviewOn: null, reviewedOn: null,
      outcome: 'pending', outcomeNotes: '', createdAt: runCtx.nowIso,
    };
    draft.decisions.push(decision);
    // Anchor the decision to the system constraint when the load governor can
    // name one, otherwise to the experiment the leader is already running. The
    // link target type must match the anchor: a person is not an experiment.
    const bottleneck = report.model.context.bottleneckId;
    const anchorExperiment = draft.dynamicsExperiments?.[0]?.id ?? null;
    if (bottleneck && (draft.people || []).some((p) => p && p.id === bottleneck)) {
      pushLink(draft, {
        sourceType: 'person', sourceId: bottleneck, targetType: 'decision', targetId: decision.id,
        relation: 'coaches', ruleId: DYN_RULE_IDS.STRUCTURE,
        summary: `System constraint anchoring the structural decision ${structureMarker}`,
      }, runCtx);
    } else if (anchorExperiment) {
      pushLink(draft, {
        sourceType: 'dynamics', sourceId: anchorExperiment, targetType: 'decision', targetId: decision.id,
        relation: 'decides', ruleId: DYN_RULE_IDS.STRUCTURE,
        summary: `Structural experiment anchoring the decision ${structureMarker}`,
      }, runCtx);
    }
    note(ctx, DYN_RULE_IDS.STRUCTURE, 'created', 'decision', decision.id,
      `Opened structural DACI decision: risk ${report.structuralRiskPct}/100, dominant loop ${loop.name} (feeds Decision Tempo)`, out);
  }

  /* ----- RULE-DYN-02 — shifting the burden → one blameless talking point ----- */
  const burden = report.archetypes.findings.find((f) => f.id === 'shifting-the-burden' || f.id === 'success-to-the-successful');
  const bottleneckId = report.model.context.bottleneckId;
  if (burden && bottleneckId) {
    const burdenMarker = markerFor(DYN_RULE_IDS.ARCHETYPE, burden.id);
    if (!talkingPointExists(draft, bottleneckId, burdenMarker)) {
      const loop = LOOP_BY_ID[report.simulation.summary.dominantLoop];
      const added = addTalkingPoint(draft, bottleneckId,
        `System note, not a performance point: “${burden.label}” is the pattern. What structural change removes the need for the fix we keep applying?`,
        burdenMarker);
      if (added) {
        note(ctx, DYN_RULE_IDS.ARCHETYPE, 'updated', 'person', bottleneckId,
          `Queued a blameless ${burden.label} talking point for the system constraint`, out);
      }
    }
  } else if (!burden) {
    // Self-clearing: the prompt disappears when the archetype no longer holds.
    for (const person of draft.people || []) {
      if (!person || !Array.isArray(person.talkingPoints)) continue;
      const stale = person.talkingPoints.filter((t) => String(t).includes(`[${DYN_RULE_IDS.ARCHETYPE}:`));
      if (stale.length) {
        person.talkingPoints = person.talkingPoints.filter((t) => !String(t).includes(`[${DYN_RULE_IDS.ARCHETYPE}:`));
        note(ctx, DYN_RULE_IDS.ARCHETYPE, 'updated', 'person', person.id,
          'Cleared a talking point whose archetype no longer holds', out);
      }
    }
  }

  /* ----- RULE-DYN-03 — adopted experiment → one owned checkpoint ----- */
  const experimentId = type.startsWith('dynamics.experiment') ? event.entityId : null;
  if (experimentId) {
    const experiment = (draft.dynamicsExperiments || []).find((row) => row && row.id === experimentId);
    if (experiment && experiment.status === 'adopted') {
      const checkpointMarker = markerFor(DYN_RULE_IDS.EXPERIMENT, experiment.id);
      const owner = (draft.people || []).find((p) => p && p.id === experiment.ownerId && p.status !== 'archived');
      if (owner && !delegationExists(draft, checkpointMarker)) {
        draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
        const frozen = experiment.predicted || {};
        const due = experiment.checkpointOn || dayKey(addDays(runCtx.todayStr, Math.min(14, experiment.horizonWeeks * 7 || 14)));
        const delegation = {
          id: runCtx.idFactory('delegation'),
          personId: owner.id,
          title: `Run the “${clampText(experiment.name, 90)}” systems checkpoint`.slice(0, 160),
          expectedOutcome: `At the checkpoint, compare the observed trajectory with the frozen prediction (${frozen.endSaturationPct ?? '—'}% saturation at week ${frozen.horizonWeeks ?? '—'}) and record what actually moved.`.slice(0, 600),
          authority: 'recommend',
          support: `This is a structural experiment, not a delivery target. The prediction was frozen at adoption on ${experiment.adoptedOn || '—'} so the review cannot rewrite it afterwards. ${checkpointMarker}`.slice(0, 1200),
          delegatedOn: runCtx.todayStr,
          dueOn: due,
          status: 'active',
          checkins: [], completedOn: null, completionNote: '', returnedOn: null, returnReason: '',
          createdAt: runCtx.nowIso, updatedAt: runCtx.nowIso,
        };
        draft.delegations.push(delegation);
        pushLink(draft, {
          sourceType: 'dynamics', sourceId: experiment.id, targetType: 'delegation', targetId: delegation.id,
          relation: 'tracks-followup', ruleId: DYN_RULE_IDS.EXPERIMENT,
          summary: `Checkpoint for a structural experiment ${checkpointMarker}`,
        }, runCtx);
        note(ctx, DYN_RULE_IDS.EXPERIMENT, 'created', 'delegation', delegation.id,
          `Opened an owned checkpoint for “${clampText(experiment.name, 80)}” with the prediction frozen`, out);
      }
    }
  }

  return out;
}

/* ------------------------------------------------------------ signals */

export function dynamicsSignals(state = {}, now = new Date()) {
  if (!Array.isArray(state.dynamicsExperiments) || !state.dynamicsExperiments.length) {
    // Even with no experiments, the Lab can still see a structural risk.
    const report = buildDynamicsReport(state, now);
    if (!report.adequate || report.structuralRiskPct < DYN_STRUCTURAL_RISK_PCT) return [];
    return [structureSignal(report)];
  }
  const report = buildDynamicsReport(state, now);
  if (!report.adequate) return [];
  const signals = [];
  if (report.structuralRiskPct >= DYN_STRUCTURAL_RISK_PCT) signals.push(structureSignal(report));

  const shift = report.simulation.summary.dominanceShiftWeek;
  if (shift !== null && shift > 0) {
    const from = LOOP_BY_ID[report.simulation.summary.dominantLoop];
    const to = LOOP_BY_ID[report.simulation.summary.dominantLoopEnd];
    signals.push({
      ruleId: 'DYN-02',
      domain: 'System dynamics',
      title: `Loop dominance flips at week ${shift}: ${from?.name ?? '—'} → ${to?.name ?? '—'}`,
      detail: 'The loop that owns the system changes over the horizon. A policy judged on the first weeks is judged on the wrong loop: the fix that helps now can be what hands control to a reinforcing loop later.',
      severity: 2,
      confidence: 'medium',
      evidence: [
        `Dominant at week 0: ${from?.name ?? '—'} (${report.simulation.dominance[0]?.dominantSharePct ?? 0}%).`,
        `Dominant at week ${report.simulation.horizonWeeks}: ${to?.name ?? '—'}.`,
      ],
      action: { label: 'Inspect the loop stack', route: '#/dynamics?tab=loops' },
    });
  }

  const due = report.experiments.filter((e) => e.checkpointDue);
  if (due.length) {
    signals.push({
      ruleId: 'DYN-03',
      domain: 'System dynamics',
      title: `${due.length} systems experiment checkpoint${due.length === 1 ? '' : 's'} passed without review`,
      detail: 'An adopted experiment with an unreviewed checkpoint is a prediction nobody graded. Compare the frozen expectation with what actually happened before the memory of it softens.',
      severity: 3,
      confidence: 'high',
      evidence: due.slice(0, 3).map((e) => `“${e.name}” — checkpoint ${e.checkpointOn}`),
      action: { label: 'Open the policy lab', route: '#/dynamics?tab=lab' },
    });
  }

  if (report.provenance.assumedPct >= DYN_ASSUMED_WARN_PCT) {
    signals.push({
      ruleId: 'DYN-04',
      domain: 'System dynamics',
      title: `${report.provenance.assumedPct}% of the model's parameters are conventions, not measurements`,
      detail: 'The trajectory is only as good as its weakest assumption. Recording delivery actuals, incident reserves and departures converts conventions into measurements — there is no other way to earn the curve.',
      severity: 2,
      confidence: 'high',
      evidence: [
        `${report.provenance.measured} measured · ${report.provenance.estimated} estimated · ${report.provenance.assumed} assumed`,
        report.calibration?.status === 'scored' ? `Hindcast skill ${report.calibration.skill}` : (report.calibration?.reason || 'Not enough dated history to hindcast.'),
      ],
      action: { label: 'See what is assumed', route: '#/dynamics?tab=calibration' },
    });
  }

  if (report.calibration?.status === 'scored' && report.calibration.skill !== null && report.calibration.skill <= 0) {
    signals.push({
      ruleId: 'DYN-05',
      domain: 'System dynamics',
      title: 'The model is no better than “tomorrow equals today” on your own history',
      detail: `Hindcast skill ${report.calibration.skill} (MASE ${report.calibration.mase}) over ${report.calibration.horizonWeeks} weeks. The structure may be wrong, or the ledger too thin. Either way, treat the curves as a way to ask better questions, not as a forecast.`,
      severity: 2,
      confidence: 'high',
      evidence: [
        `Model RMSE ${report.calibration.rmse} person-days vs naive ${report.calibration.naiveRmse}.`,
        `Completeness ${report.calibration.observed.completenessPct}% of dated lifecycle records.`,
      ],
      action: { label: 'Open calibration', route: '#/dynamics?tab=calibration' },
    });
  }
  return signals;
}

function structureSignal(report) {
  const loop = LOOP_BY_ID[report.simulation.summary.dominantLoop];
  const archetype = report.archetypes.findings[0];
  return {
    ruleId: 'DYN-01',
    domain: 'System dynamics',
    title: `Structural risk ${report.structuralRiskPct}/100: the ${(loop?.name || 'dominant').toLowerCase()} loop owns the system`,
    detail: `${archetype ? `${archetype.label}. ${archetype.summary}` : 'A reinforcing loop dominates.'} Saturation is modelled to move ${report.simulation.summary.startSaturationPct}% → ${report.simulation.summary.endSaturationPct}% over ${report.horizonWeeks} weeks. Structural fixes and effort are not substitutes.`,
    severity: report.structuralRiskPct >= 80 ? 4 : 3,
    confidence: report.provenance.assumedPct >= DYN_ASSUMED_WARN_PCT ? 'medium' : 'high',
    evidence: [
      `Dominant loop at week 0: ${loop?.name ?? '—'} (${report.simulation.dominance[0]?.dominantSharePct ?? 0}% of circulating person-days).`,
      `Largest real eigenvalue ${report.stability.maxRealPart?.toFixed(3)} → ${report.stability.verdict}.`,
      `Assumed parameters: ${report.provenance.assumedPct}%.`,
    ],
    action: { label: 'Open the dynamics lab', route: '#/dynamics' },
  };
}

/* ------------------------------------------------------------ catalogue glue */

/** Rule ids this module contributes to the exported rule catalogue. */
export const DYNAMICS_RULE_IDS = Object.freeze([DYN_RULE_IDS.STRUCTURE, DYN_RULE_IDS.ARCHETYPE, DYN_RULE_IDS.EXPERIMENT]);

/** Entity types and relations this module introduces, asserted by the tests. */
export const DYNAMICS_LINK_ENTITY = 'dynamics';
export const DYNAMICS_LINK_RELATIONS = Object.freeze(['tests', 'tracks-followup']);

export function dynamicsLinkTypesSupported() {
  return LINK_ENTITY_TYPES.includes(DYNAMICS_LINK_ENTITY)
    && DYNAMICS_LINK_RELATIONS.every((relation) => LINK_RELATIONS.includes(relation));
}
