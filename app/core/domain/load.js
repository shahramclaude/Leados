/**
 * app/core/domain/load.js — the Cognitive Load & Attention Governor
 * (RULE-LOAD-01..04), Session 52, Schema v34.
 *
 * LeadOS already prices effort (Capacity), exploration (Allocation Governor),
 * continuity (Resilience), decisions (Tempo) and collaboration structure
 * (Influence Network). It never answered the question that silently breaks
 * first-time leaders: *can one human mind actually hold all of this at once?*
 * Workload tools (Float, Toggl, Asana, Runn) answer with booked hours and
 * drag-and-drop heatmaps; people-analytics suites infer burnout from
 * calendar/communication surveillance. This module does neither. It measures
 * cognitive saturation from records the leader already keeps — locally,
 * deterministically, with every weight named and every number traceable.
 *
 * Named, citable theory (product doctrine §0.2):
 *
 *  - Sweller (1988) Cognitive Load Theory, operationalised for organisations
 *    by Skelton & Pais, *Team Topologies* (2019; 2nd ed. 2025): load separates
 *    into INTRINSIC (the inherent complexity of owned work), EXTRANEOUS
 *    (switching, coordination and stewardship overhead that should be
 *    minimised) and GERMANE (the good load of learning — onboarding, growth,
 *    trainee stewardship). Germane load is reported and protected, never
 *    penalised inside the saturation index.
 *  - Little (1961), L = λW, and Kingman's (1961) congestion formula
 *    E[W] ≈ (ρ/(1−ρ))·c·E[T]: per-person work queues, measured from the
 *    person's own completed items. Below the sample floor the queue is
 *    counts-only — a finite wait time is never dressed up from an anecdote.
 *  - Brooks (1975), *The Mythical Man-Month*: communication channels grow as
 *    n(n−1)/2 and adding people to a late system adds coordination load.
 *    The coordination score prices strong-tie degree, stewardship and span.
 *  - Goldratt (1997), Theory of Constraints: the team's throughput is set by
 *    its single most saturated person (the bottleneck), so the report names
 *    one bottleneck rather than colouring every card red.
 *  - Kahneman (1973), attention as a finite capacity: concurrent work beyond
 *    the WIP convention is scored as switching load, not counted as progress.
 *  - Deterministic seeded Monte Carlo (house convention; PERT Beta sampling
 *    from Malcolm et al. 1959): P(this person's committed work exceeds their
 *    own ramp-adjusted supply over the planning horizon), reproducible
 *    machine-to-machine for a fixed seed and auditable by hand.
 *
 * Honesty boundaries, enforced in code:
 *  - Every input is a recorded fact. No calendar telemetry, no keystroke or
 *    message monitoring, no sentiment inference, no attrition prediction,
 *    no rating of the person. This is load on a ROLE, never a performance score.
 *  - Items without a measured PERT triple are counted as unquantified
 *    commitments and excluded from the Monte Carlo — never sampled as zero.
 *  - A future joiner with no horizon supply is reported structurally, not
 *    divided by zero.
 *  - Queue statistics are counts-only below two completed items and only
 *    "learned" at five, matching the house evidence floor.
 *  - The index weights are exported constants rendered in the UI's policy
 *    tab; there is no hidden model and nothing to reverse-engineer.
 *
 * Pure module: no DOM, storage, network or wall-clock globals. The rule
 * receives the same context shape as every other post-commit rule (ADR-0008)
 * and is registered upstream of the decision-tempo rule so the load-shedding
 * DACI decision receives a timing position inside the same transaction.
 */

import { addDays, dayKey, daysBetween, round } from '../time.js';
import { personSupply, pertTriple } from './capacity.js';
import { createSeededRng, sampleBetaPert } from './simulation.js';
import {
  collectAffiliations,
  degreeCentrality,
  graphDensity,
  projectPersonGraph,
  resolveTieFloor,
} from './orgNetwork.js';

export const LOAD_ENGINE_VERSION = 'cognitive-load-2026.10-v1';

/** Completed items a person needs before per-person queue stats are "learned". */
export const LOAD_MIN_THROUGHPUT_SAMPLES = 5;
/** Little's Law needs at least two completions before a rate means anything. */
export const LOAD_MIN_CYCLE_SAMPLES = 2;
/** Default saturation threshold (index ≥ this enters the saturated band). */
export const LOAD_DEFAULT_SATURATION_PCT = 80;
/** Default Monte Carlo overload-probability action threshold. */
export const LOAD_DEFAULT_OVERLOAD_PROB_PCT = 80;
/** Default look-back for per-person throughput measurement. */
export const LOAD_DEFAULT_WINDOW_WEEKS = 8;

/**
 * Kingman variability factor c. The Capacity flow terminal adopts c = 1 as a
 * transparent house convention (Poisson-ish arrivals, modest process
 * variation); the Load Governor uses the same constant so the two terminals
 * never quote different queueing mathematics for the same workspace.
 */
export const LOAD_KINGMAN_VARIABILITY = 1;

/**
 * Saturation index weights. They sum to 1 and are rendered in the Policy tab
 * so the index is an explainable blend, not a black-box score.
 */
export const LOAD_WEIGHTS = Object.freeze({
  utilization: 0.4,
  wip: 0.25,
  coordination: 0.2,
  commitments: 0.15,
});

/**
 * Coordination budget: the raw coordination count (critical stewardships
 * weighted double, plus other stewardships, strong-tie degree and 1.5 per
 * direct report) that maps to a full extraneous-load score. A convention
 * derived from the Team Topologies "one team, one concise team API" stance,
 * not a measured human constant.
 */
export const LOAD_COORDINATION_BUDGET = 10;
/** Active delegations plus open owned cases that map to a full commitment score. */
export const LOAD_COMMITMENT_BUDGET = 6;
/** Twice the WIP convention maps to a maximum switching score. */
export const LOAD_WIP_SATURATION_MULTIPLE = 2;

export const LOAD_BANDS = Object.freeze({
  HEADROOM: 'headroom',
  MANAGED: 'managed',
  ELEVATED: 'elevated',
  SATURATED: 'saturated',
  OVERLOADED: 'overloaded',
});

export const LOAD_BAND_LABELS = Object.freeze({
  headroom: 'Headroom',
  managed: 'Managed',
  elevated: 'Elevated',
  saturated: 'Saturated',
  overloaded: 'Overloaded',
});

export const LOAD_RULE_IDS = Object.freeze({
  SHED: 'RULE-LOAD-01',
  WIP: 'RULE-LOAD-02',
  SIZE: 'RULE-LOAD-03',
  GERMANE: 'RULE-LOAD-04',
});

export const LOAD_RULES = Object.freeze([
  {
    id: LOAD_RULE_IDS.SHED,
    name: 'Person enters the saturated band → one DACI load-shedding decision',
    framework: 'Sweller (1988) cognitive load; Skelton & Pais (2019) Team Topologies; Goldratt (1997) constraints; Intuit DACI',
    trigger: 'portfolio.* / delegation.* / dependency.created / dependency.updated / person.archived / person.restored / load.scan',
    targetModule: 'decisions',
    description: 'When a person\'s cognitive saturation index crosses the leader\'s threshold on recorded commitments, opens exactly one idempotent DACI decision with four named ways to shed load — defer the lowest value-density item, reassign the heaviest item to a teammate with headroom, open a hiring requisition, or renegotiate scope/dates. Nothing is reassigned automatically; the human owns the trade-off. The decision flows into Decision Tempo in the same transaction.',
  },
  {
    id: LOAD_RULE_IDS.WIP,
    name: 'Per-person WIP limit breach → one blameless 1:1 talking point',
    framework: 'Little (1961) Little\'s Law; Kanban WIP limits; Kahneman (1973) attention switching',
    trigger: 'portfolio.* / delegation.* / load.scan',
    targetModule: 'people (1:1 talking points)',
    description: 'When the number of open funded commitments owned by a person exceeds the workspace WIP convention, queues one blameless talking point ("stop starting, start finishing", with the actual items named). It clears itself once WIP returns to the limit. Idempotent per person.',
  },
  {
    id: LOAD_RULE_IDS.SIZE,
    name: 'High overload probability within the WIP limit → "few large threads" talking point',
    framework: 'PERT Beta Monte Carlo (Malcolm et al. 1959); Sam Savage (2009) flaw of averages',
    trigger: 'portfolio.* / load.scan',
    targetModule: 'people (1:1 talking points)',
    description: 'When the seeded Monte Carlo puts overload probability at or above the policy threshold while WIP is within convention, the problem is commitment SIZE, not switching: a small number of threads each too large to finish. Queues one talking point proposing to split the heaviest commitment or re-baseline its dates. Mutually exclusive with the WIP-breach prompt and self-clearing.',
  },
  {
    id: LOAD_RULE_IDS.GERMANE,
    name: 'Ramping person under elevated load → protect-the-learning talking point',
    framework: 'Sweller germane load; Team Topologies enabling interactions; onboarding ramp conventions',
    trigger: 'portfolio.* / delegation.* / person.archived / person.restored / load.scan',
    targetModule: 'people (1:1 talking points)',
    description: 'A person still ramping into role (active onboarding/transition plan, supply factor below 1) whose saturation is elevated gets one talking point — to their in-roster manager when one exists, otherwise to themselves — asking that learning time be protected instead of crowded out by delivery. Germane load is never scored as a penalty; this rule guards it. Self-clearing once ramped or back in the managed band.',
  },
]);

/* ------------------------------------------------------------ helpers */

function round2(n) {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function clampText(value, max) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function valueDensity(item) {
  const effort = pertTriple(item?.effortDays || {});
  const value = pertTriple(item?.value || {});
  if (!effort.measured || effort.expected <= 0 || !value.measured) return null;
  return round2(value.expected / effort.expected);
}

/** Band from an index and the leader's saturation threshold. */
export function bandForIndex(index, saturationPct = LOAD_DEFAULT_SATURATION_PCT) {
  if (index >= 95) return LOAD_BANDS.OVERLOADED;
  if (index >= saturationPct) return LOAD_BANDS.SATURATED;
  if (index >= 65) return LOAD_BANDS.ELEVATED;
  if (index >= 40) return LOAD_BANDS.MANAGED;
  return LOAD_BANDS.HEADROOM;
}

function scoreBand(score) {
  return clamp(Math.round(score), 0, 100);
}

/* ------------------------------------------------------------ coordination inputs */

/**
 * Stewardship load per person from the resilience dependency ledger.
 * Critical-dependency primary stewardship counts double: continuity
 * obligations carry on-call weight as well as coordination weight.
 */
function stewardshipByPerson(state) {
  const map = new Map();
  for (const dep of Array.isArray(state.dependencies) ? state.dependencies : []) {
    if (!dep || dep.status === 'retired' || !Array.isArray(dep.stewards)) continue;
    const critical = dep.criticality === 'critical';
    for (const st of dep.stewards) {
      if (!st || !st.personId) continue;
      const entry = map.get(st.personId) || {
        criticalPrimary: 0, otherPrimary: 0, backup: 0, trainee: 0, total: 0,
      };
      if (st.role === 'primary') {
        if (critical) entry.criticalPrimary += 1;
        else entry.otherPrimary += 1;
      } else if (st.role === 'trainee') {
        entry.trainee += 1;
      } else {
        entry.backup += 1;
      }
      entry.total += 1;
      map.set(st.personId, entry);
    }
  }
  return map;
}

/** Strong-tie degree per person, reusing the Influence Network projection. */
function networkDegreeByPerson(state, settings) {
  const affiliations = collectAffiliations(state);
  if (!affiliations.people || affiliations.people.length < 2) return new Map();
  const tie = resolveTieFloor(affiliations, settings);
  const graph = projectPersonGraph(affiliations, { minShared: tie.floor });
  const degrees = degreeCentrality(graph);
  const out = new Map();
  for (const [id, measure] of degrees.entries()) out.set(id, measure.degree);
  out.__density = graphDensity(graph);
  return out;
}

function reportsByManager(state) {
  const map = new Map();
  for (const p of Array.isArray(state.people) ? state.people : []) {
    if (!p || p.status === 'archived' || !p.managerId) continue;
    map.set(p.managerId, (map.get(p.managerId) || 0) + 1);
  }
  return map;
}

/* ------------------------------------------------------------ per-person measurement */

function openFundedItems(state, personId) {
  return (Array.isArray(state.portfolio) ? state.portfolio : [])
    .filter((i) => i && i.status === 'open' && i.decision === 'funded' && i.ownerId === personId);
}

function completedItemsFor(state, personId, windowStart) {
  return (Array.isArray(state.portfolio) ? state.portfolio : [])
    .filter((i) => i && i.status === 'done' && i.ownerId === personId
      && i.completedOn && i.completedOn >= windowStart);
}

/**
 * Deterministic Monte Carlo overload probability for one person's measured
 * open commitments against their own ramp-adjusted allocatable supply.
 * Independent, reproducible stream per person via a namespaced string seed.
 * Items without a measured triple are counted by the caller, never sampled.
 */
function monteCarloOverload(items, allocatableDays, settings, personId) {
  const measured = items.filter((i) => pertTriple(i.effortDays || {}).measured);
  if (!measured.length) {
    return { trials: 0, overloadProbability: null, measuredCount: 0, unquantifiedCount: items.length, expectedEffortDays: 0 };
  }
  const trials = clamp(Math.round(Number(settings.simulationTrials) || 1000), 200, 5000);
  const rng = createSeededRng(`${settings.simulationSeed ?? 42}:load:${personId}`);
  let overloads = 0;
  let expectedEffortDays = 0;
  for (const item of measured) expectedEffortDays += pertTriple(item.effortDays || {}).expected;
  for (let t = 0; t < trials; t += 1) {
    let sampled = 0;
    for (const item of measured) {
      const triple = pertTriple(item.effortDays || {});
      sampled += sampleBetaPert(rng, triple);
    }
    if (sampled > allocatableDays) overloads += 1;
  }
  return {
    trials,
    overloadProbability: round2(overloads / trials),
    measuredCount: measured.length,
    unquantifiedCount: items.length - measured.length,
    expectedEffortDays: round2(expectedEffortDays),
  };
}

function perPersonQueue(state, person, items, supply, settings, today) {
  const windowWeeks = clamp(Math.round(Number(settings.loadThroughputWindowWeeks) || LOAD_DEFAULT_WINDOW_WEEKS), 4, 26);
  const windowStart = addDays(today, -windowWeeks * 7);
  const completed = completedItemsFor(state, person.id, windowStart);
  const samples = completed.length;
  const throughputPerWeek = samples ? round2(samples / windowWeeks) : null;
  const durations = completed
    .map((i) => {
      const start = i.createdOn || (i.createdAt || '').slice(0, 10);
      return start && i.completedOn ? daysBetween(start, i.completedOn) : null;
    })
    .filter((d) => typeof d === 'number' && d >= 0);
  const medianCycleDays = durations.length ? round2(median(durations)) : null;

  const wip = items.length;
  const littleCycleWeeks = samples >= LOAD_MIN_CYCLE_SAMPLES && throughputPerWeek > 0
    ? round2(wip / throughputPerWeek) : null;

  const reserveShare = clamp(Number(settings.operationalLoadPct) ?? 20, 0, 80) / 100;
  const allocatable = round2(Math.max(0, supply.availableDays * (1 - reserveShare)));
  const measuredEffort = items.reduce(
    (sum, i) => sum + (pertTriple(i.effortDays || {}).measured ? pertTriple(i.effortDays || {}).expected : 0), 0,
  );
  const rawRho = allocatable > 0 ? measuredEffort / allocatable : null;
  const unstable = rawRho !== null && rawRho >= 1;
  const rho = rawRho === null ? null : round2(rawRho);
  let waitWeeks = null;
  if (rho !== null && rho > 0 && rho < 1 && littleCycleWeeks !== null) {
    waitWeeks = round2((rho / (1 - rho)) * LOAD_KINGMAN_VARIABILITY * littleCycleWeeks);
  }
  let confidence = 'counts-only';
  if (samples >= LOAD_MIN_THROUGHPUT_SAMPLES) confidence = 'high';
  else if (samples >= LOAD_MIN_CYCLE_SAMPLES) confidence = 'provisional';
  return {
    windowWeeks, windowStart, samples, throughputPerWeek, medianCycleDays,
    wip, littleCycleWeeks, rho, waitWeeks, unstable, confidence,
  };
}

/**
 * The full load picture, derived live from records. Nothing is persisted:
 * saturation, queueing and coordination are recomputed every call so the
 * terminal cannot drift from the underlying facts.
 */
export function buildLoadReport(state = {}, now = new Date()) {
  const today = dayKey(now);
  const settings = state.settings || {};
  const saturationPct = clamp(Math.round(Number(settings.loadSaturationPct) || LOAD_DEFAULT_SATURATION_PCT), 50, 100);
  const overloadProbPct = clamp(Math.round(Number(settings.loadOverloadProbPct) || LOAD_DEFAULT_OVERLOAD_PROB_PCT), 50, 99);
  const wipLimit = Math.max(1, Math.round(Number(settings.wipLimitPerPerson) || 2));
  const horizonWeeks = Math.min(26, Math.max(1, Math.round(Number(settings.planningHorizonWeeks) || 4)));
  const reserveShare = clamp(Number(settings.operationalLoadPct) ?? 20, 0, 80) / 100;

  const activePeople = (Array.isArray(state.people) ? state.people : [])
    .filter((p) => p && p.status !== 'archived')
    .sort((a, b) => a.id.localeCompare(b.id));

  const stewardship = stewardshipByPerson(state);
  const degreeMap = activePeople.length >= 2 ? networkDegreeByPerson(state, settings) : new Map();
  const networkDensity = activePeople.length >= 2 ? (degreeMap.__density ?? 0) : 0;
  const reportsMap = reportsByManager(state);

  const people = activePeople.map((person) => {
    const supply = personSupply(person, state, { now, settings, horizonWeeks });
    const allocatableDays = round2(Math.max(0, supply.availableDays * (1 - reserveShare)));
    const items = openFundedItems(state, person.id);
    const mc = monteCarloOverload(items, allocatableDays, settings, person.id);

    // Intrinsic: measured complexity of open funded work.
    const expectedEffortDays = mc.expectedEffortDays;
    const utilization = allocatableDays > 0 ? expectedEffortDays / allocatableDays : null;
    const utilizationScore = allocatableDays <= 0
      ? (expectedEffortDays > 0 ? 100 : 0)
      : scoreBand(100 * utilization);

    // Extraneous (switching): WIP against the workspace convention.
    const wip = items.length;
    const wipScore = scoreBand(100 * wip / (LOAD_WIP_SATURATION_MULTIPLE * wipLimit));

    // Extraneous (coordination): stewardship, strong-tie degree and span.
    const st = stewardship.get(person.id) || { criticalPrimary: 0, otherPrimary: 0, backup: 0, trainee: 0, total: 0 };
    const strongTieDegree = degreeMap.get(person.id) || 0;
    const directReports = reportsMap.get(person.id) || 0;
    const rawCoordination = st.criticalPrimary * 2 + st.otherPrimary + st.backup + strongTieDegree + directReports * 1.5;
    const coordinationScore = scoreBand(100 * rawCoordination / LOAD_COORDINATION_BUDGET);

    // Other open commitments the person is accountable for.
    const activeDelegations = (Array.isArray(state.delegations) ? state.delegations : [])
      .filter((d) => d && d.status === 'active' && d.personId === person.id).length;
    const openCases = (Array.isArray(state.cases) ? state.cases : [])
      .filter((c) => c && ['open', 'mitigating'].includes(c.status) && c.ownerId === person.id).length;
    const commitmentScore = scoreBand(100 * (activeDelegations + openCases) / LOAD_COMMITMENT_BUDGET);

    const index = clamp(Math.round(
      LOAD_WEIGHTS.utilization * utilizationScore
      + LOAD_WEIGHTS.wip * wipScore
      + LOAD_WEIGHTS.coordination * coordinationScore
      + LOAD_WEIGHTS.commitments * commitmentScore,
    ), 0, 100);
    const band = bandForIndex(index, saturationPct);

    // Germane: learning load. Reported and protected, never in the index.
    const onboardingPlan = (Array.isArray(state.onboarding) ? state.onboarding : [])
      .find((p) => p && p.personId === person.id && p.status === 'active') || null;
    const growthPlanCount = (Array.isArray(state.growthPlans) ? state.growthPlans : [])
      .filter((g) => g && g.personId === person.id && g.status !== 'done').length;
    const germane = {
      onboarding: Boolean(onboardingPlan),
      onboardingKind: onboardingPlan ? (onboardingPlan.kind || 'onboarding') : null,
      growthPlanCount,
      traineeStewardships: st.trainee,
      rampFactor: supply.rampFactor,
      rampKey: supply.rampKey,
      ramping: supply.rampFactor < 1,
    };

    const queue = perPersonQueue(state, person, items, supply, settings, today);

    // Confidence lattice: the structural index is always shown; the
    // probabilistic and queueing claims carry their own evidence floors.
    let confidence = 'counts-only';
    if (mc.measuredCount >= 2 && queue.samples >= LOAD_MIN_THROUGHPUT_SAMPLES) confidence = 'high';
    else if (mc.measuredCount >= 1) confidence = 'medium';

    const mcFlagged = mc.overloadProbability !== null
      && mc.overloadProbability * 100 >= overloadProbPct;

    return {
      personId: person.id,
      name: person.name,
      role: person.role || '',
      team: person.team || '',
      managerId: person.managerId || null,
      band,
      index,
      confidence,
      scores: {
        utilization: utilizationScore,
        wip: wipScore,
        coordination: coordinationScore,
        commitments: commitmentScore,
      },
      effort: {
        expectedEffortDays,
        allocatableDays,
        availableDays: supply.availableDays,
        utilization: utilization === null ? null : round2(utilization),
        measuredItemCount: mc.measuredCount,
        unquantifiedCount: mc.unquantifiedCount,
        headroomDays: round2(allocatableDays - expectedEffortDays),
      },
      mc: {
        trials: mc.trials,
        overloadProbability: mc.overloadProbability,
        flagged: mcFlagged,
      },
      queue: {
        ...queue,
        wipLimit,
      },
      coordination: {
        strongTieDegree,
        directReports,
        criticalStewardships: st.criticalPrimary,
        otherStewardships: st.otherPrimary + st.backup,
        rawCoordination: round2(rawCoordination),
      },
      commitments: {
        activeDelegations,
        openCases,
      },
      germane,
      bottleneck: false,
    };
  });

  // Goldratt: name exactly one system constraint. Ties break on overload
  // probability, then WIP, then id — deterministic, never arbitrary.
  let bottleneckId = null;
  if (people.length) {
    const ranked = [...people].sort((a, b) => {
      if (b.index !== a.index) return b.index - a.index;
      const pa = a.mc.overloadProbability ?? -1;
      const pb = b.mc.overloadProbability ?? -1;
      if (pb !== pa) return pb - pa;
      if (b.queue.wip !== a.queue.wip) return b.queue.wip - a.queue.wip;
      return a.personId.localeCompare(b.personId);
    });
    bottleneckId = ranked[0].index > 0 ? ranked[0].personId : null;
    for (const p of people) p.bottleneck = p.personId === bottleneckId;
  }

  const bandCounts = Object.values(LOAD_BANDS).reduce((acc, band) => {
    acc[band] = people.filter((p) => p.band === band).length;
    return acc;
  }, {});
  const totalWip = people.reduce((s, p) => s + p.queue.wip, 0);
  const totalWipLimit = wipLimit * people.length;
  const meanIndex = people.length
    ? Math.round(people.reduce((s, p) => s + p.index, 0) / people.length) : null;

  return {
    engineVersion: LOAD_ENGINE_VERSION,
    today,
    policy: {
      saturationPct,
      overloadProbPct,
      windowWeeks: clamp(Math.round(Number(settings.loadThroughputWindowWeeks) || LOAD_DEFAULT_WINDOW_WEEKS), 4, 26),
      wipLimit,
      horizonWeeks,
      operationalLoadPct: clamp(Math.round(Number(settings.operationalLoadPct) ?? 20), 0, 80),
      autoPropagate: settings.loadAutoPropagate !== false,
      simulationSeed: settings.simulationSeed ?? 42,
      simulationTrials: clamp(Math.round(Number(settings.simulationTrials) || 1000), 200, 5000),
      weights: { ...LOAD_WEIGHTS },
    },
    people,
    team: {
      activeCount: people.length,
      bandCounts,
      saturatedOrWorse: bandCounts.saturated + bandCounts.overloaded,
      brooksChannels: people.length > 1 ? (people.length * (people.length - 1)) / 2 : 0,
      networkDensity,
      totalWip,
      totalWipLimit,
      wipBreach: totalWip > totalWipLimit,
      meanIndex,
      bottleneckId,
      mcFlaggedCount: people.filter((p) => p.mc.flagged).length,
    },
    totals: {
      attention: bandCounts.saturated + bandCounts.overloaded,
      wipBreaches: people.filter((p) => p.queue.wip > wipLimit).length,
      mcFlags: people.filter((p) => p.mc.flagged).length,
      rampingAtRisk: people.filter((p) => p.germane.ramping && ['elevated', 'saturated', 'overloaded'].includes(p.band)).length,
    },
    empty: activePeople.length === 0,
  };
}

export function loadAttentionCount(state = {}, now = new Date()) {
  return buildLoadReport(state, now).totals.attention;
}

/* ------------------------------------------------------------ brief */

/** Deterministic, board-ready summary. Every number traces to a record. */
export function loadBrief(state = {}, now = new Date()) {
  const r = buildLoadReport(state, now);
  const lines = [];
  lines.push(`# Cognitive Load & Attention Governor brief — ${r.today}`);
  lines.push('');
  lines.push(`Policy: saturation threshold index ${r.policy.saturationPct}; Monte Carlo overload action threshold P≥${r.policy.overloadProbPct}%; WIP convention ${r.policy.wipLimit} open funded commitment(s) per person; throughput window ${r.policy.windowWeeks} weeks; auto-propagation ${r.policy.autoPropagate ? 'on' : 'PAUSED'}.`);
  lines.push('');
  if (r.empty) {
    lines.push('No active people in the roster. Cognitive load is measured from records, so there is nothing to report until the team is added.');
    return lines.join('\n');
  }
  lines.push('## Team saturation');
  lines.push(`- ${r.team.activeCount} active person/people; mean saturation index ${r.team.meanIndex}; Brooks communication channels ${r.team.brooksChannels}; strong-tie network density ${r.team.networkDensity}.`);
  lines.push(`- Bands: headroom ${r.team.bandCounts.headroom} · managed ${r.team.bandCounts.managed} · elevated ${r.team.bandCounts.elevated} · saturated ${r.team.bandCounts.saturated} · overloaded ${r.team.bandCounts.overloaded}.`);
  lines.push(`- Open funded WIP ${r.team.totalWip} vs team limit ${r.team.totalWipLimit}${r.team.wipBreach ? ' (BREACH)' : ''}; ${r.team.mcFlaggedCount} person/people cross the Monte Carlo overload threshold.`);
  if (r.team.bottleneckId) {
    const b = r.people.find((p) => p.personId === r.team.bottleneckId);
    lines.push(`- System constraint (Goldratt): ${b.name} at index ${b.index} (${LOAD_BAND_LABELS[b.band]}). Relieving anyone else first cannot raise team throughput.`);
  }
  lines.push('');
  lines.push('## Per-person load (sorted by saturation)');
  for (const p of [...r.people].sort((a, b) => b.index - a.index || a.personId.localeCompare(b.personId))) {
    const prob = p.mc.overloadProbability === null ? 'no measured effort' : `P(overload) ${Math.round(p.mc.overloadProbability * 100)}%`;
    const wait = p.queue.waitWeeks === null ? 'queue waits counts-only' : `Kingman wait ~${p.queue.waitWeeks} week(s)`;
    lines.push(`- ${p.name} — ${LOAD_BAND_LABELS[p.band]} (index ${p.index}, ${p.confidence}): ${p.queue.wip} WIP vs limit ${p.queue.wipLimit}, ${p.effort.expectedEffortDays} expected days vs ${p.effort.allocatableDays} allocatable, ${prob}, ${wait}; coordination raw ${p.coordination.rawCoordination} (${p.coordination.criticalStewardships} critical stewardship(s), degree ${p.coordination.strongTieDegree}, ${p.coordination.directReports} report(s)).`);
    if (p.effort.unquantifiedCount > 0) lines.push(`  · ${p.effort.unquantifiedCount} open commitment(s) lack a measured effort estimate and are excluded from the Monte Carlo — counted, never sampled as zero.`);
    if (p.germane.ramping) lines.push(`  · Ramping (${p.germane.rampKey}, supply factor ${p.germane.rampFactor}): germane learning load is protected, not penalised.`);
  }
  lines.push('');
  lines.push('Caveats: this is load on a role, not a performance rating. Inputs are recorded commitments, stewardships and collaboration structure — no message, calendar or screen monitoring. The saturation index blends four transparent, policy-tab weights; the Monte Carlo is deterministic for the configured seed; queue statistics are counts-only below two completed items and learned at five. Low cognitive load can mean under-utilisation, and high load can be a deliberate short spike — the governor surfaces the structure, the leader decides.');
  return lines.join('\n');
}

/* ------------------------------------------------------------ propagation helpers */

function decisionExists(draft, marker) {
  return (draft.decisions || []).some((d) => d && String(d.question || '').includes(marker));
}

function talkingPointExists(draft, personId, marker) {
  const p = (draft.people || []).find((x) => x && x.id === personId);
  return Boolean(p && (p.talkingPoints || []).some((t) => String(t).includes(marker)));
}

function addTalkingPoint(draft, personId, text, marker) {
  const p = (draft.people || []).find((x) => x && x.id === personId && x.status !== 'archived');
  if (!p) return false;
  // normalizeTalkingPoints truncates each point to 200 characters on every
  // load. The idempotency marker sits at the end, so bound the text here to
  // guarantee the marker survives a normalize/reload cycle instead of being
  // sliced off and silently duplicating the prompt on the next scan.
  const maxText = 200 - marker.length - 1;
  const safeText = clampText(text, Math.max(40, maxText));
  p.talkingPoints = [...(Array.isArray(p.talkingPoints) ? p.talkingPoints : []), `${safeText} ${marker}`].slice(-30);
  return true;
}

function removeTalkingPoint(draft, personId, marker) {
  const p = (draft.people || []).find((x) => x && x.id === personId);
  if (!p || !Array.isArray(p.talkingPoints)) return false;
  const next = p.talkingPoints.filter((t) => !String(t).includes(marker));
  if (next.length === p.talkingPoints.length) return false;
  p.talkingPoints = next;
  return true;
}

function personActive(draft, personId) {
  return Boolean(personId && (draft.people || []).some((p) => p && p.id === personId && p.status !== 'archived'));
}

function pushLink(draft, { sourceType, sourceId, targetType, targetId, relation, ruleId, summary }, ctx) {
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  const exists = draft.links.some(
    (l) => l && l.sourceType === sourceType && l.sourceId === sourceId
      && l.targetType === targetType && l.targetId === targetId && l.relation === relation,
  );
  if (exists) return false;
  draft.links.push({
    id: ctx.idFactory('lnk'),
    sourceType, sourceId, targetType, targetId, relation, ruleId,
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

/* ------------------------------------------------------------ the rule */

const LOAD_TRIGGER_PREFIXES = ['portfolio.', 'delegation.', 'dependency.'];
const LOAD_TRIGGER_EXACT = new Set(['person.archived', 'person.restored', 'load.scan']);

/**
 * Post-commit rule (ADR-0008). Dispatches on load-bearing events and on an
 * explicit `load.scan`. All four sub-rules are idempotent via markers, so
 * repeated scans and unrelated writes converge instead of duplicating work.
 * Pausing automation blocks event-triggered fan-out; an explicit scan always
 * runs (the human asked for it), matching the Influence Network convention.
 */
export function loadRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const triggered = LOAD_TRIGGER_PREFIXES.some((p) => event.type.startsWith(p))
    || LOAD_TRIGGER_EXACT.has(event.type);
  if (!triggered) return [];
  if (draft.settings?.loadAutoPropagate === false && event.type !== 'load.scan') return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const runCtx = {
    now,
    todayStr: dayKey(now),
    nowIso: now.toISOString(),
    idFactory: ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`),
    logEvent: ctx.logEvent,
  };
  const out = [];
  const report = buildLoadReport(draft, now);
  const wipLimit = report.policy.wipLimit;

  for (const person of report.people) {
    const marker01 = `[${LOAD_RULE_IDS.SHED}:${person.personId}]`;
    const saturated = person.band === LOAD_BANDS.SATURATED || person.band === LOAD_BANDS.OVERLOADED;

    /* ----- RULE-LOAD-01 — saturation → one DACI load-shedding decision ----- */
    if (saturated && person.queue.wip >= 1 && !decisionExists(draft, marker01)) {
      const portfolio = (draft.portfolio || []).filter(
        (i) => i && i.status === 'open' && i.decision === 'funded' && i.ownerId === person.personId,
      );
      const withEffort = portfolio
        .map((i) => ({ item: i, expected: pertTriple(i.effortDays || {}).expected, density: valueDensity(i) }))
        .sort((a, b) => b.expected - a.expected);
      const heaviest = withEffort[0] || null;
      const densityRanked = [...withEffort]
        .filter((x) => x.density !== null)
        .sort((a, b) => a.density - b.density);
      const lowestDensity = densityRanked[0] || null;
      const teammate = report.people
        .filter((p) => p.personId !== person.personId
          && (p.band === LOAD_BANDS.HEADROOM || p.band === LOAD_BANDS.MANAGED))
        .sort((a, b) => a.index - b.index || a.personId.localeCompare(b.personId))[0] || null;

      const question = [
        `${person.name} is in the ${LOAD_BAND_LABELS[person.band].toLowerCase()} band: cognitive saturation index ${person.index} (threshold ${report.policy.saturationPct}), ${person.queue.wip} open funded commitment(s), ${person.effort.expectedEffortDays} expected person-days against ${person.effort.allocatableDays} allocatable over ${report.policy.horizonWeeks} week(s)`,
        person.mc.overloadProbability === null
          ? 'and no measured effort estimates for the Monte Carlo.'
          : `and a seeded Monte Carlo overload probability of ${Math.round(person.mc.overloadProbability * 100)}%.`,
        'Cognitive overload is a system design problem, not a motivation problem. Choose how to shed the load',
        marker01,
      ].join(' ');

      const options = [
        {
          id: runCtx.idFactory('dopt'),
          label: lowestDensity
            ? `Defer/cut “${clampText(lowestDensity.item.title, 70)}” — lowest value density (${lowestDensity.density}/day)`
            : 'Defer or cut the lowest value-density open commitment',
          pros: 'Removes the weakest return on the constrained attention first',
          cons: 'A deferred commitment still has a stakeholder who must be told',
        },
        {
          id: runCtx.idFactory('dopt'),
          label: teammate && heaviest
            ? `Reassign “${clampText(heaviest.item.title, 60)}” to ${teammate.name} (${LOAD_BAND_LABELS[teammate.band].toLowerCase()}, index ${teammate.index})`
            : 'Reassign the heaviest commitment — no teammate currently has headroom, which is itself a hiring signal',
          pros: 'Moves work to measured capacity instead of wishing the calendar were bigger',
          cons: 'Reassignment carries hand-off cost and needs the owner\'s agreement',
        },
        {
          id: runCtx.idFactory('dopt'),
          label: 'Open a hiring requisition for this role',
          pros: 'Adds structural capacity if the load is persistent rather than a spike',
          cons: 'Slowest lever; only honest if the demand survives the next planning cycle',
        },
        {
          id: runCtx.idFactory('dopt'),
          label: heaviest
            ? `Renegotiate scope or dates on “${clampText(heaviest.item.title, 70)}”`
            : 'Renegotiate scope or dates on the heaviest commitment',
          pros: 'Preserves the commitment while fitting it to real cognitive capacity',
          cons: 'Reopens an agreed expectation and may need stakeholder sign-off',
        },
      ];

      const decision = {
        id: runCtx.idFactory('dec'),
        title: `Shed load for ${person.name}: saturation index ${person.index}`.slice(0, 180),
        question: question.slice(0, 2000),
        date: runCtx.todayStr,
        reversibility: 'reversible',
        driver: clampText(draft.settings?.leaderName || '', 120),
        approver: '',
        contributors: person.name,
        informed: '',
        options,
        chosen: '', rationale: '', reviewOn: null, reviewedOn: null,
        outcome: 'pending', outcomeNotes: '', createdAt: runCtx.nowIso,
      };
      draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
      draft.decisions.push(decision);

      pushLink(draft, {
        sourceType: 'person', sourceId: person.personId, targetType: 'decision', targetId: decision.id,
        relation: 'involves', ruleId: LOAD_RULE_IDS.SHED,
        summary: `Load-shedding DACI decision for saturation index ${person.index} ${marker01}`,
      }, runCtx);
      if (heaviest) {
        pushLink(draft, {
          sourceType: 'portfolio', sourceId: heaviest.item.id, targetType: 'decision', targetId: decision.id,
          relation: 'decides', ruleId: LOAD_RULE_IDS.SHED,
          summary: `Heaviest open commitment driving the saturation ${marker01}`,
        }, runCtx);
      }
      note(ctx, LOAD_RULE_IDS.SHED, 'created', 'decision', decision.id,
        `Opened DACI load-shedding decision for ${clampText(person.name, 60)} (index ${person.index}, band ${person.band}); feeds Decision Tempo`, out);
    }

    /* ----- RULE-LOAD-02 — WIP breach → blameless switching talking point ----- */
    const marker02 = `[${LOAD_RULE_IDS.WIP}:${person.personId}]`;
    if (person.queue.wip > wipLimit) {
      if (!talkingPointExists(draft, person.personId, marker02)) {
        const added = addTalkingPoint(draft, person.personId,
          `WIP check: ${person.queue.wip} open funded commitments vs the ${wipLimit}-item convention. Little's Law: more threads means longer waits on each. Let's pause one so something finishes — stop starting, start finishing.`,
          marker02);
        if (added) note(ctx, LOAD_RULE_IDS.WIP, 'updated', 'person', person.personId,
          `Queued a WIP-limit talking point for ${clampText(person.name, 60)} (${person.queue.wip} > ${wipLimit})`, out);
      }
    } else if (talkingPointExists(draft, person.personId, marker02)) {
      if (removeTalkingPoint(draft, person.personId, marker02)) {
        note(ctx, LOAD_RULE_IDS.WIP, 'updated', 'person', person.personId,
          `Cleared the resolved WIP-limit talking point for ${clampText(person.name, 60)}`, out);
      }
    }

    /* ----- RULE-LOAD-03 — size risk inside the WIP limit ----- */
    const marker03 = `[${LOAD_RULE_IDS.SIZE}:${person.personId}]`;
    const sizeCondition = person.mc.flagged && person.queue.wip <= wipLimit
      && person.mc.overloadProbability !== null;
    if (sizeCondition) {
      if (!talkingPointExists(draft, person.personId, marker03)) {
        const added = addTalkingPoint(draft, person.personId,
          `Size check: within the WIP limit, the Monte Carlo still puts P(overload) at ${Math.round(person.mc.overloadProbability * 100)}%. Split the largest thread or re-baseline its dates to recorded throughput.`,
          marker03);
        if (added) note(ctx, LOAD_RULE_IDS.SIZE, 'updated', 'person', person.personId,
          `Queued a commitment-size talking point for ${clampText(person.name, 60)} (P(overload) ${Math.round(person.mc.overloadProbability * 100)}% within WIP limit)`, out);
      }
    } else if (talkingPointExists(draft, person.personId, marker03)) {
      if (removeTalkingPoint(draft, person.personId, marker03)) {
        note(ctx, LOAD_RULE_IDS.SIZE, 'updated', 'person', person.personId,
          `Cleared the resolved commitment-size talking point for ${clampText(person.name, 60)}`, out);
      }
    }

    /* ----- RULE-LOAD-04 — protect germane load while ramping ----- */
    const marker04 = `[${LOAD_RULE_IDS.GERMANE}:${person.personId}]`;
    const elevated = ['elevated', 'saturated', 'overloaded'].includes(person.band);
    if (person.germane.ramping && elevated) {
      const manager = person.managerId && (draft.people || [])
        .find((p) => p && p.id === person.managerId && p.status !== 'archived');
      const targetId = manager ? manager.id : person.personId;
      if (personActive(draft, targetId) && !talkingPointExists(draft, targetId, marker04)) {
        const added = addTalkingPoint(draft, targetId,
          `Protect the learning curve: ${clampText(person.name, 40)} is still ramping (${person.germane.rampKey}, factor ${person.germane.rampFactor}) yet sits in the ${LOAD_BAND_LABELS[person.band].toLowerCase()} band. What commitment can we move so learning time is protected?`,
          marker04);
        if (added) note(ctx, LOAD_RULE_IDS.GERMANE, 'updated', 'person', targetId,
          `Queued a protect-the-learning talking point for ramping ${clampText(person.name, 60)} → ${manager ? manager.name : person.name}`, out);
      }
    } else if (talkingPointExists(draft, person.personId, marker04)
      || (person.managerId && talkingPointExists(draft, person.managerId, marker04))) {
      const ownerId = talkingPointExists(draft, person.managerId || '', marker04) ? person.managerId : person.personId;
      if (removeTalkingPoint(draft, ownerId, marker04)) {
        note(ctx, LOAD_RULE_IDS.GERMANE, 'updated', 'person', ownerId,
          `Cleared the resolved learning-protection talking point for ${clampText(person.name, 60)}`, out);
      }
    }
  }

  return out;
}

/* ------------------------------------------------------------ signals */

/**
 * Human-facing signals. Mirrors the shape of every other domain signal
 * function so the Insights feed can merge them unchanged.
 */
export function loadSignals(state = {}, now = new Date()) {
  const people = Array.isArray(state.people) ? state.people.filter((p) => p.status !== 'archived') : [];
  if (!people.length) return [];
  const r = buildLoadReport(state, now);
  if (r.empty) return [];
  const signals = [];
  const saturated = r.people.filter((p) => ['saturated', 'overloaded'].includes(p.band));
  const overloaded = r.people.filter((p) => p.band === 'overloaded');

  if (saturated.length) {
    const worst = [...saturated].sort((a, b) => b.index - a.index)[0];
    signals.push({
      ruleId: 'LOAD-01',
      domain: 'Load & attention',
      title: `${saturated.length} person/people in the saturated band — ${overloaded.length ? `${overloaded.length} overloaded` : 'cognitive capacity is the binding constraint'}`,
      detail: `Sweller and Team Topologies treat exceeded cognitive capacity as a system design failure, not an effort problem. The Governor opened (or will open on the next scan) a DACI load-shedding decision per saturated person with four explicit options. Highest: ${worst.name} at index ${worst.index}.`,
      severity: overloaded.length ? 4 : 3,
      confidence: worst.confidence === 'high' ? 'high' : 'medium',
      evidence: saturated.slice(0, 4).map((p) => `${p.name}: index ${p.index}, ${p.queue.wip} WIP, ${p.effort.expectedEffortDays}d expected vs ${p.effort.allocatableDays}d allocatable`),
      action: { label: 'Open the Load Governor', route: '#/load?tab=board' },
    });
  }

  const wipBreaches = r.people.filter((p) => p.queue.wip > r.policy.wipLimit);
  if (wipBreaches.length) {
    signals.push({
      ruleId: 'LOAD-02',
      domain: 'Load & attention',
      title: `${wipBreaches.length} person/people exceed the ${r.policy.wipLimit}-item WIP convention`,
      detail: 'Little\'s Law: with fixed throughput, adding work-in-process only lengthens the wait on every existing item. Blameless 1:1 talking points name the threads to pause so something can finish.',
      severity: 3,
      confidence: 'high',
      evidence: wipBreaches.slice(0, 4).map((p) => `${p.name}: ${p.queue.wip} open funded commitments vs limit ${r.policy.wipLimit}`),
      action: { label: 'Review the queue lab', route: '#/load?tab=queues' },
    });
  }

  const sizeRisk = r.people.filter((p) => p.mc.flagged && p.queue.wip <= r.policy.wipLimit);
  if (sizeRisk.length) {
    signals.push({
      ruleId: 'LOAD-03',
      domain: 'Load & attention',
      title: `${sizeRisk.length} person/people show high overload probability despite WIP within convention`,
      detail: `The seeded Monte Carlo (P≥${r.policy.overloadProbPct}%) flags commitments that are individually too large to fit ramp-adjusted supply. Splitting the largest thread beats starting another one.`,
      severity: 3,
      confidence: 'medium',
      evidence: sizeRisk.slice(0, 4).map((p) => `${p.name}: P(overload) ${p.mc.overloadProbability === null ? '—' : Math.round(p.mc.overloadProbability * 100)}% across ${p.queue.wip} thread(s)`),
      action: { label: 'Inspect the saturation board', route: '#/load?tab=board' },
    });
  }

  if (r.totals.rampingAtRisk > 0) {
    const ramping = r.people.filter((p) => p.germane.ramping && ['elevated', 'saturated', 'overloaded'].includes(p.band));
    signals.push({
      ruleId: 'LOAD-04',
      domain: 'Load & attention',
      title: `${r.totals.rampingAtRisk} ramping team member(s) carry elevated load while still learning the role`,
      detail: 'Germane (learning) load is productive but fragile: crowding it out with delivery pressure is how new hires and role-transitioners quietly fail to ramp. A talking point asks the manager to protect the learning time.',
      severity: 3,
      confidence: 'high',
      evidence: ramping.slice(0, 4).map((p) => `${p.name}: ${p.germane.rampKey}, factor ${p.germane.rampFactor}, band ${LOAD_BAND_LABELS[p.band]}`),
      action: { label: 'See the saturation board', route: '#/load?tab=board' },
    });
  }

  const bottleneck = r.team.bottleneckId
    ? r.people.find((p) => p.personId === r.team.bottleneckId) : null;
  if (bottleneck && bottleneck.scores.coordination >= 80 && bottleneck.index >= 65) {
    signals.push({
      ruleId: 'LOAD-05',
      domain: 'Load & attention',
      title: `${bottleneck.name} is the system constraint and carries heavy coordination load`,
      detail: `Goldratt: optimising anyone else cannot raise team throughput while this person is the bottleneck. Coordination score ${bottleneck.scores.coordination}/100 from ${bottleneck.coordination.criticalStewardships} critical stewardship(s), strong-tie degree ${bottleneck.coordination.strongTieDegree} and ${bottleneck.coordination.directReports} direct report(s). Brooks\'s law warns that adding people here adds channels before it adds output.`,
      severity: 2,
      confidence: 'medium',
      evidence: [`Saturation index ${bottleneck.index}; raw coordination ${bottleneck.coordination.rawCoordination} vs budget ${LOAD_COORDINATION_BUDGET}`],
      action: { label: 'Open the coordination tab', route: '#/load?tab=coordination' },
    });
  }

  return signals;
}
