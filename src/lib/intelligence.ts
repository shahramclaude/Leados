import { db } from "@/db";
import {
  leados_people,
  leados_events,
  leados_decisions,
  leados_plans,
} from "@/db/schema";

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

export { DOMAINS } from "@/lib/domains";
export type { Domain } from "@/lib/domains";
import { DOMAINS, type Domain } from "@/lib/domains";

export type Severity = 1 | 2 | 3 | 4 | 5;
export type Urgency = "NOW" | "TODAY" | "THIS_WEEK" | "MONITOR";
export type TemporalMode = "REACTIVE" | "BALANCED" | "STRATEGIC_DRIFT" | "STRUCTURAL_STRESS";

export interface Finding {
  key: string;
  rule: string;
  domain: Domain;
  sev: Severity;
  title: string;
  detail: string;
  personId?: number;
  personName?: string;
}

export interface DomainScore {
  domain: Domain;
  score: number;
  findingCount: number;
}

export interface DecisionView {
  id: number;
  title: string;
  owner: string;
  domain: Domain;
  openDays: number;
  status: "OPEN" | "STALE" | "ESCALATE" | "RESOLVED";
  openedAt: string;
  resolvedAt: string | null;
}

export interface PulseStat {
  moodMean: number;
  loadMean: number;
  series: number[];
  loadSeries: number[];
}

export interface OpenPlan {
  id: number;
  personId: number;
  personName: string;
  goal: string;
  level: string;
  daysSinceCheckin: number;
  lastCheckin: string;
}

export interface Correlation {
  id: string;
  name: string;
  domains: Domain[];
  members: string[];
  combinedSev: Severity;
  description: string;
}

export interface Inference {
  id: string;
  title: string;
  premises: string[];
  confidence: number;
  urgency: Urgency;
  action: string;
  domain: Domain;
}

export interface Belief {
  label: string;
  priorPct: number;
  posteriorPct: number;
  appliedEvidence: string[];
  highRisk: boolean;
}

export interface FlightRisk {
  personId: number;
  personName: string;
  role: string;
  riskScore: number;
  riskLevel: "LOW" | "ELEVATED" | "HIGH";
  moodMean: number;
  loadMean: number;
  daysSinceOneOnOne: number | null;
}

export interface HealthScore {
  overall: number;
  grade: "A" | "B" | "C" | "D" | "F";
  domains: Record<Domain, number>;
  trend: "up" | "down" | "flat";
}

export interface ScenarioResult {
  attritionProbability: number;
  finalMeanEngagement: number;
  p10: number;
  p90: number;
}

export interface Simulation {
  scenarios: {
    STATUS_QUO: ScenarioResult;
    IMPROVE_CADENCE: ScenarioResult;
    ADD_GROWTH_PLAN: ScenarioResult;
    REDUCE_LOAD: ScenarioResult;
  };
  bestIntervention: { name: string; delta: number };
  seeds: number;
}

export interface AttentionItem {
  id: string;
  day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
  title: string;
  domain: Domain;
  rule: string;
  roi: number;
  hours: number;
  cognitiveLoad: number;
  severity: Severity;
  findingKey: string;
}

export interface DeferredItem {
  title: string;
  rule: string;
  reason: string;
}

export interface AttentionPlan {
  sequence: AttentionItem[];
  deferred: DeferredItem[];
  totalHours: number;
  utilizationPct: number;
  cognitiveLoadUsed: number;
}

export interface HighestLeverageAction {
  action: string;
  source: string;
  urgency: Urgency;
}

export interface FeedbackLoop {
  id: string;
  name: string;
  polarity: "REINFORCING" | "BALANCING";
  active: boolean;
}

export interface IntelligenceData {
  findings: Finding[];
  domainScores: DomainScore[];
  decisions: DecisionView[];
  eventCount: number;
  peopleCount: number;
  pulseByPerson: Record<number, PulseStat>;
  openGoals: OpenPlan[];
  openPlans: OpenPlan[];
  correlations: Correlation[];
  inferences: Inference[];
  beliefs: Record<string, Belief>;
  flightRisk: FlightRisk[];
  healthScore: HealthScore;
  temporalMode: TemporalMode;
  orgEntropy: number;
  feedbackLoops: FeedbackLoop[];
  simulation: Simulation;
  attentionPlan: AttentionPlan;
  highestLeverageAction: HighestLeverageAction | null;
  generatedAt: string;
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

const SEV_WEIGHT: Record<Severity, number> = { 1: 2, 2: 5, 3: 9, 4: 15, 5: 22 };
const URGENCY_FOR_SEV: Record<Severity, Urgency> = {
  5: "NOW",
  4: "TODAY",
  3: "THIS_WEEK",
  2: "MONITOR",
  1: "MONITOR",
};

// ────────────────────────────────────────────────────────────────────
// Main computation
// ────────────────────────────────────────────────────────────────────

export async function computeIntelligence(): Promise<IntelligenceData> {
  const now = new Date();

  const [people, events, decisionsRaw, plansRaw] = await Promise.all([
    db.select().from(leados_people),
    db.select().from(leados_events),
    db.select().from(leados_decisions),
    db.select().from(leados_plans),
  ]);

  const activePeople = people.filter((p) => !p.archived);
  const peopleById = new Map(people.map((p) => [p.id, p]));

  // ── Pulse stats per person ──────────────────────────────────────────
  const pulseByPerson: Record<number, PulseStat> = {};
  for (const p of activePeople) {
    const pulses = events
      .filter((e) => e.type === "pulse" && e.personId === p.id)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const moods = pulses.map((e) => Number((e.data as { mood?: number })?.mood ?? 3));
    const loads = pulses.map((e) => Number((e.data as { load?: number })?.load ?? 3));
    const last12Moods = moods.slice(-12);
    const last12Loads = loads.slice(-12);
    pulseByPerson[p.id] = {
      moodMean: mean(last12Moods) || 3,
      loadMean: mean(last12Loads) || 3,
      series: last12Moods,
      loadSeries: last12Loads,
    };
  }

  // ── 1:1 cadence per person ──────────────────────────────────────────
  const lastOneOnOne: Record<number, Date | null> = {};
  for (const p of activePeople) {
    const held = events
      .filter((e) => e.type === "oneonone" && e.personId === p.id && (e.data as { status?: string })?.status !== "skipped")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    lastOneOnOne[p.id] = held[0]?.createdAt ?? null;
  }

  // ── Feedback per person ─────────────────────────────────────────────
  const feedbackByPerson: Record<number, { sentiment: string; createdAt: Date }[]> = {};
  for (const p of activePeople) {
    feedbackByPerson[p.id] = events
      .filter((e) => e.type === "feedback" && e.personId === p.id)
      .map((e) => ({ sentiment: String((e.data as { sentiment?: string })?.sentiment ?? "neutral"), createdAt: e.createdAt }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // ── Growth plans ─────────────────────────────────────────────────────
  const openPlans: OpenPlan[] = plansRaw
    .filter((pl) => pl.status === "active")
    .map((pl) => {
      const person = peopleById.get(pl.personId);
      return {
        id: pl.id,
        personId: pl.personId,
        personName: person?.name ?? "Unknown",
        goal: pl.goal,
        level: pl.level,
        daysSinceCheckin: daysBetween(now, pl.lastCheckin),
        lastCheckin: pl.lastCheckin.toISOString(),
      };
    });

  // ── Decisions ────────────────────────────────────────────────────────
  const decisions: DecisionView[] = decisionsRaw
    .map((d) => {
      const openDays = daysBetween(d.resolvedAt ?? now, d.openedAt);
      let status: DecisionView["status"] = "OPEN";
      if (d.status === "resolved") status = "RESOLVED";
      else if (openDays > 45) status = "ESCALATE";
      else if (openDays > 21) status = "STALE";
      return {
        id: d.id,
        title: d.title,
        owner: d.owner,
        domain: d.domain as Domain,
        openDays,
        status,
        openedAt: d.openedAt.toISOString(),
        resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
      };
    })
    .sort((a, b) => daysBetween(now, new Date(a.openedAt)) - daysBetween(now, new Date(b.openedAt)));

  // ── Findings generation ──────────────────────────────────────────────
  const findings: Finding[] = [];

  for (const p of activePeople) {
    const stat = pulseByPerson[p.id];
    const days = lastOneOnOne[p.id] !== null ? daysBetween(now, lastOneOnOne[p.id] as Date) : null;

    // Mood rules
    if (stat.moodMean < 2.3) {
      findings.push({
        key: `R1-${p.id}`, rule: "R1", domain: "people", sev: 5,
        title: `${p.name}: critical mood decline`,
        detail: `Mood average ${stat.moodMean.toFixed(2)}/5 across recent pulses — sustained depletion.`,
        personId: p.id, personName: p.name,
      });
    } else if (stat.moodMean < 3.0) {
      findings.push({
        key: `R2-${p.id}`, rule: "R2", domain: "people", sev: 3,
        title: `${p.name}: mood trending low`,
        detail: `Mood average ${stat.moodMean.toFixed(2)}/5 — below neutral baseline.`,
        personId: p.id, personName: p.name,
      });
    } else if (stat.moodMean < 3.3) {
      findings.push({
        key: `R13-${p.id}`, rule: "R13", domain: "people", sev: 1,
        title: `${p.name}: mood watch`,
        detail: `Mood average ${stat.moodMean.toFixed(2)}/5 — stable but worth monitoring.`,
        personId: p.id, personName: p.name,
      });
    }

    // Load rules
    if (stat.loadMean > 4.3) {
      findings.push({
        key: `R3-${p.id}`, rule: "R3", domain: "people", sev: 4,
        title: `${p.name}: critical overload`,
        detail: `Load average ${stat.loadMean.toFixed(2)}/5 — sustained overcapacity.`,
        personId: p.id, personName: p.name,
      });
    } else if (stat.loadMean > 3.6) {
      findings.push({
        key: `R4-${p.id}`, rule: "R4", domain: "people", sev: 3,
        title: `${p.name}: elevated load`,
        detail: `Load average ${stat.loadMean.toFixed(2)}/5 — above sustainable range.`,
        personId: p.id, personName: p.name,
      });
    } else if (stat.loadMean > 3.2) {
      findings.push({
        key: `R14-${p.id}`, rule: "R14", domain: "people", sev: 1,
        title: `${p.name}: load watch`,
        detail: `Load average ${stat.loadMean.toFixed(2)}/5 — trending up, not yet critical.`,
        personId: p.id, personName: p.name,
      });
    }

    // Cadence rules
    if (days !== null) {
      if (days > p.cadenceDays * 2) {
        findings.push({
          key: `R5-${p.id}`, rule: "R5", domain: "people", sev: 5,
          title: `${p.name}: 1:1 cadence critically breached`,
          detail: `${days}d since last 1:1 vs ${p.cadenceDays}d target.`,
          personId: p.id, personName: p.name,
        });
      } else if (days > p.cadenceDays * 1.3) {
        findings.push({
          key: `R6-${p.id}`, rule: "R6", domain: "people", sev: 3,
          title: `${p.name}: 1:1 cadence slipping`,
          detail: `${days}d since last 1:1 vs ${p.cadenceDays}d target.`,
          personId: p.id, personName: p.name,
        });
      }
    } else {
      findings.push({
        key: `R5-${p.id}`, rule: "R5", domain: "people", sev: 5,
        title: `${p.name}: no 1:1 on record`,
        detail: `No held 1:1 found for this person.`,
        personId: p.id, personName: p.name,
      });
    }

    // Feedback streak rule
    const fb = feedbackByPerson[p.id] ?? [];
    if (fb.length >= 2 && fb.slice(0, 2).every((f) => f.sentiment === "negative")) {
      findings.push({
        key: `R7-${p.id}`, rule: "R7", domain: "people", sev: 4,
        title: `${p.name}: negative feedback streak`,
        detail: `Last 2 feedback entries both negative — possible process or support issue.`,
        personId: p.id, personName: p.name,
      });
    }
  }

  // Growth plan stalled
  for (const plan of openPlans) {
    if (plan.daysSinceCheckin > 30) {
      findings.push({
        key: `R8-${plan.id}`, rule: "R8", domain: "people", sev: 2,
        title: `${plan.personName}: growth plan stalled`,
        detail: `"${plan.goal}" has not been checked in for ${plan.daysSinceCheckin}d.`,
        personId: plan.personId, personName: plan.personName,
      });
    }
  }

  // Decision rules
  for (const d of decisions) {
    if (d.status === "ESCALATE") {
      findings.push({
        key: `R9-${d.id}`, rule: "R9", domain: d.domain, sev: 5,
        title: `Decision escalating: ${d.title}`,
        detail: `Open ${d.openDays}d, owned by ${d.owner}. Exceeds escalation threshold.`,
      });
    } else if (d.status === "STALE") {
      findings.push({
        key: `R10-${d.id}`, rule: "R10", domain: d.domain, sev: 3,
        title: `Decision going stale: ${d.title}`,
        detail: `Open ${d.openDays}d, owned by ${d.owner}.`,
      });
    }
  }

  // Domain concentration
  const domainCounts: Record<Domain, number> = { people: 0, finance: 0, sales: 0, ops: 0, strategy: 0, gov: 0 };
  for (const f of findings) domainCounts[f.domain]++;
  const totalFindingsSoFar = findings.length || 1;
  if (domainCounts.people / totalFindingsSoFar > 0.5 && findings.length >= 6) {
    findings.push({
      key: "R11-concentration", rule: "R11", domain: "strategy", sev: 3,
      title: "Signal concentration in people domain",
      detail: `${Math.round((domainCounts.people / totalFindingsSoFar) * 100)}% of active findings are people-domain — other functions may be under-instrumented.`,
    });
  }

  // Cross-domain compounding
  const peopleSev4Plus = findings.filter((f) => f.domain === "people" && f.sev >= 4).length;
  const decisionSev4Plus = findings.filter((f) => ["R9", "R10"].includes(f.rule) && f.sev >= 4).length;
  if (peopleSev4Plus >= 2 && decisionSev4Plus >= 1) {
    findings.push({
      key: "R12-compounding", rule: "R12", domain: "gov", sev: 4,
      title: "Compounding organizational stress",
      detail: "Multiple critical people signals are coinciding with escalating governance decisions — risk of cascading failure.",
    });
  }

  findings.sort((a, b) => b.sev - a.sev);

  // ── Domain scores ────────────────────────────────────────────────────
  const domainScores: DomainScore[] = DOMAINS.map((domain) => {
    const domainFindings = findings.filter((f) => f.domain === domain);
    const penalty = domainFindings.reduce((sum, f) => sum + SEV_WEIGHT[f.sev], 0);
    return { domain, score: clamp(100 - penalty, 0, 100), findingCount: domainFindings.length };
  });

  // ── Flight risk ──────────────────────────────────────────────────────
  const flightRisk: FlightRisk[] = activePeople
    .map((p) => {
      const stat = pulseByPerson[p.id];
      const days = lastOneOnOne[p.id] !== null ? daysBetween(now, lastOneOnOne[p.id] as Date) : 90;
      const fb = feedbackByPerson[p.id] ?? [];
      const negRatio = fb.length ? fb.filter((f) => f.sentiment === "negative").length / fb.length : 0;

      const moodComponent = ((5 - stat.moodMean) / 4) * 40;
      const loadComponent = ((stat.loadMean - 1) / 4) * 30;
      const cadenceComponent = Math.min(days / 60, 1) * 20;
      const feedbackComponent = negRatio * 10;
      const riskScore = clamp(Math.round(moodComponent + loadComponent + cadenceComponent + feedbackComponent), 0, 100);
      const riskLevel: FlightRisk["riskLevel"] = riskScore >= 65 ? "HIGH" : riskScore >= 40 ? "ELEVATED" : "LOW";

      return {
        personId: p.id,
        personName: p.name,
        role: p.role,
        riskScore,
        riskLevel,
        moodMean: Number(stat.moodMean.toFixed(2)),
        loadMean: Number(stat.loadMean.toFixed(2)),
        daysSinceOneOnOne: lastOneOnOne[p.id] !== null ? days : null,
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore);

  // ── Health score ──────────────────────────────────────────────────────
  const domainScoreMap = Object.fromEntries(domainScores.map((d) => [d.domain, d.score])) as Record<Domain, number>;
  const overall = Math.round(mean(domainScores.map((d) => d.score)));
  const grade: HealthScore["grade"] = overall >= 90 ? "A" : overall >= 80 ? "B" : overall >= 70 ? "C" : overall >= 60 ? "D" : "F";

  // ── Org entropy (Shannon entropy over finding domain distribution) ───
  const totalF = findings.length || 1;
  let H = 0;
  for (const domain of DOMAINS) {
    const c = domainCounts[domain];
    if (c === 0) continue;
    const pr = c / totalF;
    H -= pr * Math.log2(pr);
  }
  const orgEntropy = clamp(H / Math.log2(DOMAINS.length), 0, 1);

  // ── Temporal mode ────────────────────────────────────────────────────
  const sev5Count = findings.filter((f) => f.sev === 5).length;
  const escalateCount = decisions.filter((d) => d.status === "ESCALATE").length;
  let temporalMode: TemporalMode;
  if (sev5Count >= 2) temporalMode = "REACTIVE";
  else if (escalateCount >= 2) temporalMode = "STRUCTURAL_STRESS";
  else if (orgEntropy > 0.75) temporalMode = "STRATEGIC_DRIFT";
  else temporalMode = "BALANCED";

  const trend: HealthScore["trend"] = temporalMode === "REACTIVE" ? "down" : temporalMode === "BALANCED" ? "up" : "flat";

  const healthScore: HealthScore = { overall, grade, domains: domainScoreMap, trend };

  // ── Feedback loops ───────────────────────────────────────────────────
  const anyHighLoad = flightRisk.some((f) => f.loadMean > 4.3);
  const anyHighFlightRisk = flightRisk.some((f) => f.riskLevel === "HIGH");
  const positiveFeedbackRatio = (() => {
    const all = Object.values(feedbackByPerson).flat();
    if (!all.length) return 0;
    return all.filter((f) => f.sentiment === "positive").length / all.length;
  })();
  const feedbackLoops: FeedbackLoop[] = [
    { id: "loop-overload-attrition", name: "Overload → Attrition → More Overload", polarity: "REINFORCING", active: anyHighLoad && anyHighFlightRisk },
    { id: "loop-feedback-trust", name: "Feedback → Trust → Performance", polarity: "BALANCING", active: positiveFeedbackRatio >= 0.5 },
    { id: "loop-stale-decisions-drift", name: "Stale Decisions → Strategic Drift", polarity: "REINFORCING", active: escalateCount >= 1 },
    { id: "loop-cadence-engagement", name: "1:1 Cadence → Engagement", polarity: "BALANCING", active: flightRisk.some((f) => f.riskLevel === "LOW") },
  ];

  // ── Correlations ─────────────────────────────────────────────────────
  const correlations: Correlation[] = [];
  if (peopleSev4Plus >= 2 && decisionSev4Plus >= 1) {
    const members = [
      ...flightRisk.filter((f) => f.riskLevel !== "LOW").map((f) => f.personName),
      ...decisions.filter((d) => d.status === "ESCALATE").map((d) => d.title),
    ];
    correlations.push({
      id: "corr-compounding-stress",
      name: "Compounding Organizational Stress",
      domains: ["people", "ops", "strategy", "gov"],
      members,
      combinedSev: 5,
      description: "Critical people signals are coinciding with escalating cross-domain decisions — elevated cascading-failure risk.",
    });
  }
  if (domainCounts.people / totalF > 0.5) {
    correlations.push({
      id: "corr-domain-concentration",
      name: "People-Domain Signal Concentration",
      domains: ["people", "strategy"],
      members: activePeople.map((p) => p.name),
      combinedSev: 3,
      description: "The majority of active findings originate from the people domain, suggesting other functions are under-instrumented.",
    });
  }

  // ── Bayesian beliefs (exactly 3) ─────────────────────────────────────
  function bayes(prior: number, evidences: { applies: boolean; lr: number; label: string }[]) {
    let odds = prior / (1 - prior);
    const applied: string[] = [];
    for (const e of evidences) {
      if (e.applies) {
        odds *= e.lr;
        applied.push(`${e.label} (LR ${e.lr.toFixed(1)}×)`);
      }
    }
    const posterior = odds / (1 + odds);
    return { posterior, applied };
  }

  const highFlightRiskCount = flightRisk.filter((f) => f.riskLevel === "HIGH").length;
  const sev4PlusPeopleFindings = findings.filter((f) => f.domain === "people" && f.sev >= 4).length;
  const criticalCadenceBreach = findings.some((f) => f.rule === "R5");

  const attritionBayes = bayes(0.15, [
    { applies: highFlightRiskCount >= 1, lr: 2.2, label: "≥1 person at HIGH flight risk" },
    { applies: sev4PlusPeopleFindings >= 2, lr: 1.7, label: "≥2 critical people findings" },
    { applies: criticalCadenceBreach, lr: 1.5, label: "Critical 1:1 cadence breach" },
  ]);

  const anyLoadCritical = findings.some((f) => f.rule === "R3");
  const sev3PlusLoadCount = findings.filter((f) => ["R3", "R4"].includes(f.rule)).length;
  const anyNegativeFeedback = Object.values(feedbackByPerson).flat().some((f) => f.sentiment === "negative");
  const burnoutBayes = bayes(0.2, [
    { applies: anyLoadCritical, lr: 2.0, label: "Critical sustained overload present" },
    { applies: sev3PlusLoadCount >= 2, lr: 1.5, label: "≥2 people with elevated load" },
    { applies: anyNegativeFeedback, lr: 1.3, label: "Negative feedback on record" },
  ]);

  const domainConcentrationFinding = findings.some((f) => f.rule === "R11");
  const compoundingFinding = findings.some((f) => f.rule === "R12");
  const decisionParalysisBayes = bayes(0.15, [
    { applies: escalateCount >= 2, lr: 2.3, label: "≥2 decisions in ESCALATE state" },
    { applies: domainConcentrationFinding, lr: 1.4, label: "Signal concentration detected" },
    { applies: compoundingFinding, lr: 1.6, label: "Cross-domain compounding detected" },
  ]);

  const beliefs: Record<string, Belief> = {
    attritionRisk: {
      label: "Elevated attrition risk this quarter",
      priorPct: Math.round(0.15 * 100),
      posteriorPct: Math.round(attritionBayes.posterior * 100),
      appliedEvidence: attritionBayes.applied,
      highRisk: attritionBayes.posterior > 0.6,
    },
    burnoutRisk: {
      label: "Team burnout risk from sustained overload",
      priorPct: Math.round(0.2 * 100),
      posteriorPct: Math.round(burnoutBayes.posterior * 100),
      appliedEvidence: burnoutBayes.applied,
      highRisk: burnoutBayes.posterior > 0.6,
    },
    decisionParalysis: {
      label: "Organizational decision paralysis risk",
      priorPct: Math.round(0.15 * 100),
      posteriorPct: Math.round(decisionParalysisBayes.posterior * 100),
      appliedEvidence: decisionParalysisBayes.applied,
      highRisk: decisionParalysisBayes.posterior > 0.6,
    },
  };

  // ── Inferences ───────────────────────────────────────────────────────
  const inferences: Inference[] = [];
  const topFlight = flightRisk[0];
  if (topFlight && topFlight.riskLevel !== "LOW") {
    inferences.push({
      id: "inf-flight-risk",
      title: `${topFlight.personName}'s trajectory points toward disengagement if unaddressed`,
      premises: [
        `Mood average ${topFlight.moodMean}/5`,
        `Load average ${topFlight.loadMean}/5`,
        topFlight.daysSinceOneOnOne != null ? `${topFlight.daysSinceOneOnOne}d since last 1:1` : "No 1:1 on record",
      ],
      confidence: clamp(Math.round(topFlight.riskScore * 1.05), 0, 100),
      urgency: topFlight.riskLevel === "HIGH" ? "NOW" : "TODAY",
      action: `Schedule immediate 1:1 with ${topFlight.personName} and rebalance workload`,
      domain: "people",
    });
  }
  if (escalateCount >= 1) {
    inferences.push({
      id: "inf-decision-backlog",
      title: "Decision backlog will compound into next planning cycle",
      premises: [
        `${escalateCount} decision(s) in ESCALATE state`,
        "Average open decision age exceeds escalation threshold",
      ],
      confidence: 68,
      urgency: "TODAY",
      action: "Force a decision review session this week",
      domain: "gov",
    });
  }
  const negativeFeedbackFinding = findings.find((f) => f.rule === "R7");
  if (negativeFeedbackFinding) {
    inferences.push({
      id: "inf-feedback-pattern",
      title: `${negativeFeedbackFinding.personName}'s feedback pattern suggests a process issue, not a performance issue`,
      premises: ["2+ consecutive negative feedback entries", "No corresponding mood decline for this person"],
      confidence: 55,
      urgency: "THIS_WEEK",
      action: "Audit process friction points in the relevant workflow",
      domain: negativeFeedbackFinding.domain,
    });
  }
  if (domainConcentrationFinding) {
    inferences.push({
      id: "inf-domain-concentration",
      title: "Signal concentration suggests under-invested functions elsewhere",
      premises: [`${Math.round((domainCounts.people / totalF) * 100)}% of findings are people-domain`, "Finance and gov domains show minimal signal"],
      confidence: 45,
      urgency: "THIS_WEEK",
      action: "Increase instrumentation in low-signal domains",
      domain: "strategy",
    });
  }

  // ── Simulation ───────────────────────────────────────────────────────
  const currentEngagement = mean(activePeople.map((p) => ((pulseByPerson[p.id].moodMean - 1) / 4) * 100));
  const highCount = flightRisk.filter((f) => f.riskLevel === "HIGH").length;
  const elevatedCount = flightRisk.filter((f) => f.riskLevel === "ELEVATED").length;
  const statusQuoAttrition = clamp(0.15 + highCount * 0.15 + elevatedCount * 0.07, 0, 0.95);

  function scenario(attrition: number, engagementDelta: number): ScenarioResult {
    const finalMeanEngagement = clamp(Math.round(currentEngagement + engagementDelta), 0, 100);
    return {
      attritionProbability: Number(clamp(attrition, 0, 0.95).toFixed(2)),
      finalMeanEngagement,
      p10: clamp(finalMeanEngagement - 15, 0, 100),
      p90: clamp(finalMeanEngagement + 15, 0, 100),
    };
  }

  const scenarios = {
    STATUS_QUO: scenario(statusQuoAttrition, -5),
    IMPROVE_CADENCE: scenario(statusQuoAttrition - 0.12, 8),
    ADD_GROWTH_PLAN: scenario(statusQuoAttrition - 0.05, 4),
    REDUCE_LOAD: scenario(statusQuoAttrition - 0.18, 12),
  };

  const interventionNames = ["IMPROVE_CADENCE", "ADD_GROWTH_PLAN", "REDUCE_LOAD"] as const;
  let bestName: string = interventionNames[0];
  let bestDelta = scenarios.STATUS_QUO.attritionProbability - scenarios[interventionNames[0]].attritionProbability;
  for (const name of interventionNames) {
    const delta = scenarios.STATUS_QUO.attritionProbability - scenarios[name].attritionProbability;
    if (delta > bestDelta) {
      bestDelta = delta;
      bestName = name;
    }
  }

  const simulation: Simulation = {
    scenarios,
    bestIntervention: { name: bestName, delta: Number(bestDelta.toFixed(2)) },
    seeds: 50,
  };

  // ── Attention plan (simulated-annealing-style greedy allocation) ─────
  const HOURS_BUDGET = 30;
  const LOAD_BUDGET = 40;
  const days: AttentionItem["day"][] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

  const candidates = findings.map((f) => {
    const hours = f.sev === 5 ? 4 : f.sev === 4 ? 3 : f.sev === 3 ? 2 : f.sev === 2 ? 1 : 0.5;
    const cognitiveLoad = Number((hours * 1.2).toFixed(1));
    const roi = Number(((f.sev * f.sev * 5) / hours).toFixed(1));
    return { finding: f, hours, cognitiveLoad, roi };
  });
  candidates.sort((a, b) => b.roi - a.roi);

  const sequence: AttentionItem[] = [];
  const deferred: DeferredItem[] = [];
  let totalHours = 0;
  let cognitiveLoadUsed = 0;
  let dayIdx = 0;
  for (const c of candidates) {
    if (totalHours + c.hours <= HOURS_BUDGET && cognitiveLoadUsed + c.cognitiveLoad <= LOAD_BUDGET) {
      sequence.push({
        id: `item-${c.finding.key}`,
        day: days[dayIdx % days.length],
        title: c.finding.title,
        domain: c.finding.domain,
        rule: c.finding.rule,
        roi: c.roi,
        hours: c.hours,
        cognitiveLoad: c.cognitiveLoad,
        severity: c.finding.sev,
        findingKey: c.finding.key,
      });
      totalHours += c.hours;
      cognitiveLoadUsed += c.cognitiveLoad;
      dayIdx++;
    } else {
      deferred.push({
        title: c.finding.title,
        rule: c.finding.rule,
        reason: "Exceeds this week's hours/cognitive-load budget",
      });
    }
  }

  const attentionPlan: AttentionPlan = {
    sequence,
    deferred,
    totalHours: Number(totalHours.toFixed(1)),
    utilizationPct: Math.round((totalHours / HOURS_BUDGET) * 100),
    cognitiveLoadUsed: Number(cognitiveLoadUsed.toFixed(1)),
  };

  // ── Highest leverage action ───────────────────────────────────────────
  const highestLeverageAction: HighestLeverageAction | null = sequence.length
    ? { action: sequence[0].title, source: `${sequence[0].rule}`, urgency: URGENCY_FOR_SEV[sequence[0].severity] }
    : null;

  return {
    findings,
    domainScores,
    decisions,
    eventCount: events.length,
    peopleCount: activePeople.length,
    pulseByPerson,
    openGoals: openPlans,
    openPlans,
    correlations,
    inferences,
    beliefs,
    flightRisk,
    healthScore,
    temporalMode,
    orgEntropy: Number(orgEntropy.toFixed(3)),
    feedbackLoops,
    simulation,
    attentionPlan,
    highestLeverageAction,
    generatedAt: now.toISOString(),
  };
}
