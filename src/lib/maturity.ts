// Original scoring engine for this delivery.
//
// Functionally modeled on the *pasted* "LEADOS.lifeStage" brief from this task's
// prompt (12 independent maturity curves, Level 1-5 per dimension, computed from
// event-log coverage). That brief is treated as an UNVERIFIED external spec, not
// as fact about github.com/wbweve/Leados — a direct, same-session inspection of
// the real repo's src/lib (28 files) and src/components (24 files) found no file,
// export, or string resembling "lifeStage", "computeMaturityProfile",
// "DIMENSIONS", or "PEOPLE_SYSTEMS" anywhere in the live app or the loose
// root-level files. See AI-SESSION-LOG.md §2 for the full verification ledger.
//
// Every score function below is written from scratch against this app's own
// OrgEvent log shape; none of this is copied from the pasted brief's JS or from
// any file fetched from the real repo.

import type { DimensionDef, DimensionKey, DimensionResult, MaturityProfile, OrgEvent, PatternResult } from "./types";

function has(events: OrgEvent[], type: string) {
  return events.some((e) => e.type === type);
}
function count(events: OrgEvent[], type: string) {
  return events.filter((e) => e.type === type).length;
}
function distinctOwners(events: OrgEvent[], type: string) {
  return new Set(events.filter((e) => e.type === type && e.personId).map((e) => e.personId)).size;
}

export const DIMENSIONS: DimensionDef[] = [
  {
    key: "PEOPLE_SYSTEMS",
    name: "People Systems",
    short: "1:1s, goals, feedback, growth, succession",
    levels: [
      "No formal 1:1 cadence. Goals untracked. Feedback ad-hoc.",
      "Regular 1:1s logged. Some feedback given.",
      "1:1 cadence + goals with named owners + regular feedback.",
      "Growth plans with multi-step progression paths in place.",
      "Succession candidates identified and 360-degree feedback cycles run.",
    ],
    score: (ev) => {
      let s = 1;
      if (has(ev, "oneonone.logged")) s = 2;
      if (has(ev, "feedback.given") && distinctOwners(ev, "goal.created") > 0) s = 3;
      if (ev.some((e) => e.type === "growthplan.created" && Number(e.data?.steps ?? 0) > 1)) s = 4;
      if (has(ev, "succession.candidate") && has(ev, "leadership.360")) s = 5;
      return s;
    },
  },
  {
    key: "FINANCIAL_INTELLIGENCE",
    name: "Financial Intelligence",
    short: "P&L, unit economics, scenarios, cohorts",
    levels: [
      "No financial data logged.",
      "Basic P&L tracked (revenue / cost events).",
      "Unit economics tracked (LTV, CAC, churn).",
      "Scenario planning with modeled forecasts.",
      "Cohort analysis combined with simulation runs.",
    ],
    score: (ev) => {
      let s = 1;
      if (has(ev, "fin.pl.logged")) s = 2;
      if (has(ev, "fin.unit.logged")) s = 3;
      if (has(ev, "fin.scenario.modeled")) s = 4;
      if (has(ev, "fin.cohort.logged") && has(ev, "simulation.run")) s = 5;
      return s;
    },
  },
  {
    key: "OPERATIONAL_MATURITY",
    name: "Operational Maturity",
    short: "Incidents, sprints, blockers, capacity",
    levels: [
      "No operational data tracked.",
      "Incidents logged with basic SLA awareness.",
      "Sprint cadence maintained.",
      "Sprint cadence plus active blocker tracking.",
      "Sustained sprint cadence (6+) with capacity logging.",
    ],
    score: (ev) => {
      let s = 1;
      if (has(ev, "ops.incident.logged")) s = 2;
      if (has(ev, "sprint.review")) s = 3;
      if (has(ev, "sprint.review") && has(ev, "blocker.logged")) s = 4;
      if (count(ev, "sprint.review") >= 6 && has(ev, "ops.capacity.logged")) s = 5;
      return s;
    },
  },
  {
    key: "STRATEGIC_CLARITY",
    name: "Strategic Clarity",
    short: "Goals, OKRs, scenario + wargame planning",
    levels: [
      "No strategic direction documented.",
      "Goals exist outside of an OKR structure.",
      "OKRs defined with key results.",
      "OKRs tracked alongside financial scenario modeling.",
      "OKRs combined with wargaming and disruption analysis.",
    ],
    score: (ev) => {
      let s = 1;
      if (has(ev, "goal.created")) s = 2;
      if (has(ev, "okr.created")) s = 3;
      if (has(ev, "okr.created") && has(ev, "fin.scenario.modeled")) s = 4;
      if (has(ev, "wargame.scenario") && has(ev, "tech.disruption")) s = 5;
      return s;
    },
  },
  {
    key: "GOVERNANCE_MATURITY",
    name: "Governance",
    short: "Board, compliance, regulatory, stakeholders",
    levels: [
      "No governance events tracked.",
      "Board meeting cadence maintained.",
      "Board cadence plus compliance checks.",
      "Cross-jurisdiction regulatory tracking in place.",
      "Stakeholder mapping feeding board-level narrative.",
    ],
    score: (ev) => {
      let s = 1;
      if (has(ev, "exec.board.meeting")) s = 2;
      if (has(ev, "legal.compliance.check")) s = 3;
      if (has(ev, "reg.jurisdiction")) s = 4;
      if (has(ev, "stakeholder.mapped") && has(ev, "board.presented")) s = 5;
      return s;
    },
  },
  {
    key: "ANALYTICAL_MATURITY",
    name: "Analytical / Intelligence",
    short: "Findings, correlation, simulation, wargaming",
    levels: [
      "No analytical capability logged.",
      "Basic findings detected from logged signals.",
      "Correlated patterns detected across 2+ distinct event types.",
      "Simulation runs used to stress-test assumptions.",
      "Wargaming combined with external intelligence signals.",
    ],
    score: (ev) => {
      let s = 1;
      if (ev.length > 0) s = 2;
      const distinctTypes = new Set(ev.map((e) => e.type)).size;
      if (distinctTypes >= 4) s = 3;
      if (has(ev, "simulation.run")) s = 4;
      if (has(ev, "wargame.scenario") && has(ev, "intel.signal")) s = 5;
      return s;
    },
  },
  {
    key: "RESILIENCE_MATURITY",
    name: "Resilience",
    short: "Crisis response, continuity, stress tests",
    levels: [
      "No resilience planning logged.",
      "A crisis response has been logged at least once.",
      "Continuity plans exist for critical processes.",
      "Key-person dependencies mapped and stress-tested.",
      "Two or more crisis postmortems closed the loop into practice.",
    ],
    score: (ev) => {
      let s = 1;
      if (has(ev, "exec.crisis.logged")) s = 2;
      if (has(ev, "continuity.plan")) s = 3;
      if (has(ev, "stress.test.logged") && has(ev, "key.dependency.logged")) s = 4;
      if (count(ev, "crisis.postmortem") >= 2) s = 5;
      return s;
    },
  },
  {
    key: "CULTURE_MATURITY",
    name: "Culture Intelligence",
    short: "Signals, network edges, values, trends",
    levels: [
      "No culture data logged.",
      "Culture signals logged (e.g. psychological safety).",
      "Org network edges logged (who collaborates with whom).",
      "Leadership values tied to logged behavior.",
      "Three or more distinct culture signal types tracked together.",
    ],
    score: (ev) => {
      let s = 1;
      if (has(ev, "culture.signal")) s = 2;
      if (has(ev, "org.network.edge")) s = 3;
      if (has(ev, "leadership.value")) s = 4;
      const cultureTypes = new Set(
        ev.filter((e) => ["culture.signal", "org.network.edge", "leadership.value"].includes(e.type)).map((e) => e.type)
      ).size;
      if (cultureTypes >= 3 && has(ev, "leadership.value")) s = 5;
      return s;
    },
  },
  {
    key: "SELF_AWARENESS_MATURITY",
    name: "Leadership Self-Awareness",
    short: "Reflection, calibration, bias, legacy",
    levels: [
      "No self-awareness data logged.",
      "Reflection entries logged regularly.",
      "Decision calibration tracked alongside 360 feedback.",
      "Cognitive bias flags actively logged.",
      "Avoidance patterns named and a leadership legacy defined.",
    ],
    score: (ev) => {
      let s = 1;
      if (has(ev, "reflection.logged")) s = 2;
      if (has(ev, "decision.calibration") && has(ev, "leadership.360")) s = 3;
      if (has(ev, "bias.flagged")) s = 4;
      if (has(ev, "avoidance.named") && has(ev, "legacy.defined")) s = 5;
      return s;
    },
  },
  {
    key: "INNOVATION_MATURITY",
    name: "Innovation System",
    short: "Experiments, horizon bets, tech landscape",
    levels: [
      "No innovation activity logged.",
      "Experiments logged with a stated hypothesis.",
      "A three-horizon style initiative portfolio is modeled.",
      "External technology disruption actively tracked.",
      "Wargame-informed bets combined with simulation runs.",
    ],
    score: (ev) => {
      let s = 1;
      if (has(ev, "rd.experiment.logged")) s = 2;
      if (ev.some((e) => e.type === "initiative.logged" && e.data?.model)) s = 3;
      if (has(ev, "tech.disruption")) s = 4;
      if (has(ev, "wargame.scenario") && has(ev, "simulation.run")) s = 5;
      return s;
    },
  },
  {
    key: "EXECUTION_MATURITY",
    name: "Execution",
    short: "Commitments, sprints, velocity, escalation",
    levels: [
      "No execution data logged.",
      "Commitments logged with visible ownership.",
      "Sprint cadence combined with blocker resolution.",
      "Four or more sprint cycles completed (velocity trend forming).",
      "Blockers actively escalated — an early-warning habit is in place.",
    ],
    score: (ev) => {
      let s = 1;
      if (has(ev, "commitment.made")) s = 2;
      if (has(ev, "sprint.review") && has(ev, "blocker.logged")) s = 3;
      if (count(ev, "sprint.review") >= 4) s = 4;
      if (has(ev, "blocker.escalated")) s = 5;
      return s;
    },
  },
  {
    key: "MARKET_INTELLIGENCE",
    name: "Market Intelligence",
    short: "Competitors, customers, ecosystem, wargaming",
    levels: [
      "No market intelligence logged.",
      "Competitor moves logged.",
      "Stakeholder mapping combined with customer interviews.",
      "Technology landscape and ecosystem actively monitored.",
      "Wargaming combined with live intelligence signals.",
    ],
    score: (ev) => {
      let s = 1;
      if (has(ev, "competitor.logged")) s = 2;
      if (has(ev, "stakeholder.mapped") && has(ev, "customer.interview")) s = 3;
      if (has(ev, "tech.disruption") && has(ev, "ecosystem.map")) s = 4;
      if (has(ev, "wargame.scenario") && has(ev, "intel.signal")) s = 5;
      return s;
    },
  },
];

function describePattern(mean: number, variance: number): PatternResult {
  if (mean >= 4)
    return {
      name: "ADVANCED_LEADER",
      description:
        "High maturity across most dimensions. The event log is dense enough to generate compound intelligence. Focus: deepen the one or two weakest dimensions rather than spreading further.",
    };
  if (mean >= 3 && variance < 1)
    return {
      name: "BALANCED_PRACTITIONER",
      description:
        "Consistent mid-level maturity across dimensions, no severe gaps but no outstanding depth either. Focus: pick two or three dimensions and push them deliberately to Level 5.",
    };
  if (mean >= 3 && variance >= 1)
    return {
      name: "SPECIALIST",
      description:
        "High maturity in some dimensions, low in others. Deep capability in the focus areas; real blind spots elsewhere. Focus: check whether the low dimensions are creating silent risk.",
    };
  if (mean >= 2)
    return {
      name: "EMERGING_PRACTITIONER",
      description:
        "Capabilities are being built across dimensions and the event log is growing. Focus: log consistently across three or four event types to unlock the next level in each.",
    };
  return {
    name: "BEGINNING",
    description:
      "The log is new or sparse. Every dimension starts at Level 1 until events are recorded. Focus: establish a daily logging habit — the scores only ever reflect what has been logged.",
  };
}

export function computeMaturityProfile(events: OrgEvent[]): MaturityProfile {
  const dims = {} as Record<DimensionKey, DimensionResult>;

  for (const d of DIMENSIONS) {
    const score = Math.max(1, Math.min(5, d.score(events)));
    dims[d.key] = {
      key: d.key,
      name: d.name,
      score,
      maxScore: 5,
      label: d.levels[score - 1],
      nextLevel: score < 5 ? d.levels[score] : "Maximum modeled maturity reached.",
      gap: 5 - score,
    };
  }

  const scores = Object.values(dims).map((d) => d.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, s) => a + (s - mean) ** 2, 0) / scores.length;

  const priorityGaps = Object.values(dims)
    .filter((d) => d.score < 3)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((d) => ({ key: d.key, name: d.name, score: d.score, gap: d.gap }));

  return {
    dimensions: dims,
    meanMaturity: Math.round(mean * 10) / 10,
    variance: Math.round(variance * 100) / 100,
    pattern: describePattern(mean, variance),
    priorityGaps,
  };
}
