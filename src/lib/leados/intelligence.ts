import { db } from "@/db";
import {
  leados_people,
  leados_events,
  leados_decisions,
  leados_growth_plans,
  leados_work_queue,
} from "@/db/schema";
import { asc, eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — stable within a given seed so the UI
// doesn't jitter wildly between 30s polls.
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

const DOMAINS = ["people", "finance", "sales", "ops", "strategy", "gov"] as const;
type Domain = (typeof DOMAINS)[number];

const DAY = 24 * 60 * 60 * 1000;

const SEV_WEIGHT: Record<number, number> = { 5: 35, 4: 22, 3: 12, 2: 6, 1: 2 };
const SEV_HOURS: Record<number, number> = { 5: 4, 4: 3, 3: 2, 2: 1.5, 1: 1 };
const SEV_URGENCY: Record<number, string> = {
  5: "NOW",
  4: "TODAY",
  3: "THIS_WEEK",
  2: "THIS_WEEK",
  1: "THIS_WEEK",
};

export interface Finding {
  key: string;
  rule: string;
  domain: Domain;
  sev: number;
  title: string;
  detail: string;
  personId?: number;
  personName?: string;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export async function computeIntelligence() {
  const [people, events, decisionsRaw, growthPlans, workQueue] = await Promise.all([
    db.select().from(leados_people).where(eq(leados_people.archived, false)).orderBy(asc(leados_people.name)),
    db.select().from(leados_events),
    db.select().from(leados_decisions),
    db.select().from(leados_growth_plans),
    db.select().from(leados_work_queue),
  ]);

  const now = Date.now();
  const byPersonId = new Map(people.map((p) => [p.id, p]));

  // ---- Pulse aggregation --------------------------------------------------
  const pulseByPerson: Record<string, { moodMean: number; loadMean: number; series: number[]; loadSeries: number[] }> = {};
  const lastOneOnOne: Record<string, number> = {}; // personId -> timestamp
  const lastFeedback: Record<string, number> = {};

  for (const p of people) {
    const pulses = events
      .filter((e) => e.type === "pulse" && e.personId === p.id)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const moods = pulses.map((e) => Number((e.data as any)?.mood ?? 3));
    const loads = pulses.map((e) => Number((e.data as any)?.load ?? 3));
    const moodMean = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : 3;
    const loadMean = loads.length ? loads.reduce((a, b) => a + b, 0) / loads.length : 3;
    pulseByPerson[p.id] = {
      moodMean: Number(moodMean.toFixed(2)),
      loadMean: Number(loadMean.toFixed(2)),
      series: moods.slice(-12).map((m) => Number(m.toFixed(2))),
      loadSeries: loads.slice(-12).map((m) => Number(m.toFixed(2))),
    };

    const ones = events.filter((e) => e.type === "oneonone" && e.personId === p.id);
    if (ones.length) lastOneOnOne[p.id] = Math.max(...ones.map((e) => e.createdAt.getTime()));
    const fb = events.filter((e) => e.type === "feedback" && e.personId === p.id);
    if (fb.length) lastFeedback[p.id] = Math.max(...fb.map((e) => e.createdAt.getTime()));
  }

  // ---- Growth plans ---------------------------------------------------------
  const openPlans = growthPlans
    .filter((g) => g.status === "open")
    .map((g) => {
      const person = g.personId ? byPersonId.get(g.personId) : undefined;
      const daysSinceCheckin = Math.floor((now - g.lastCheckin.getTime()) / DAY);
      return {
        id: g.id,
        personId: g.personId,
        personName: person?.name ?? "Unknown",
        goal: g.goal,
        level: g.level,
        status: g.status,
        lastCheckin: g.lastCheckin.toISOString(),
        daysSinceCheckin,
      };
    });

  // ---- Findings --------------------------------------------------------------
  const findings: Finding[] = [];

  for (const p of people) {
    const pulse = pulseByPerson[p.id];
    const mood = pulse?.moodMean ?? 3;
    const load = pulse?.loadMean ?? 3;

    // MORALE_LOW
    let sev = mood < 2.8 ? 5 : mood < 3.2 ? 4 : mood < 3.6 ? 3 : 0;
    if (sev > 0) {
      findings.push({
        key: `MORALE_LOW:${p.id}`,
        rule: "MORALE_LOW",
        domain: "people",
        sev,
        title: `${p.name} shows sustained low morale`,
        detail: `Mean pulse mood ${mood.toFixed(2)}/5 across recent check-ins.`,
        personId: p.id,
        personName: p.name,
      });
    }

    // LOAD_HIGH
    sev = load > 4.2 ? 5 : load > 3.8 ? 4 : load > 3.4 ? 3 : 0;
    if (sev > 0) {
      findings.push({
        key: `LOAD_HIGH:${p.id}`,
        rule: "LOAD_HIGH",
        domain: "people",
        sev,
        title: `${p.name} is carrying sustained high load`,
        detail: `Mean reported load ${load.toFixed(2)}/5 — risk of burnout if unaddressed.`,
        personId: p.id,
        personName: p.name,
      });
    }

    // CADENCE_SLIP
    const lastOne = lastOneOnOne[p.id];
    const daysSinceOneOnOne = lastOne ? Math.floor((now - lastOne) / DAY) : 999;
    const ratio = daysSinceOneOnOne / p.cadenceDays;
    sev = ratio > 2.5 ? 5 : ratio > 1.8 ? 4 : ratio > 1.3 ? 3 : ratio > 1.0 ? 2 : 0;
    if (sev > 0) {
      findings.push({
        key: `CADENCE_SLIP:${p.id}`,
        rule: "CADENCE_SLIP",
        domain: "people",
        sev,
        title: `1:1 cadence slipping with ${p.name}`,
        detail: `${daysSinceOneOnOne}d since last 1:1, target cadence is ${p.cadenceDays}d.`,
        personId: p.id,
        personName: p.name,
      });
    }
  }

  // GROWTH_STALLED
  for (const plan of openPlans) {
    const sev = plan.daysSinceCheckin > 40 ? 3 : plan.daysSinceCheckin > 25 ? 2 : 0;
    if (sev > 0) {
      findings.push({
        key: `GROWTH_STALLED:${plan.id}`,
        rule: "GROWTH_STALLED",
        domain: "people",
        sev,
        title: `Growth plan stalled for ${plan.personName}`,
        detail: `${plan.daysSinceCheckin}d since last check-in on "${plan.goal}".`,
        personId: plan.personId ?? undefined,
        personName: plan.personName,
      });
    }
  }

  // DECISION_STALE / DECISION_ESCALATE
  const decisions = decisionsRaw.map((d) => {
    const openDays = Math.floor((now - d.openedAt.getTime()) / DAY);
    let status: "OPEN" | "STALE" | "ESCALATE" | "RESOLVED" = "OPEN";
    if (d.status === "resolved") status = "RESOLVED";
    else if (openDays > 45) status = "ESCALATE";
    else if (openDays > 21) status = "STALE";
    return {
      id: d.id,
      title: d.title,
      owner: d.owner,
      domain: d.domain,
      openedAt: d.openedAt.toISOString(),
      resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
      openDays,
      status,
    };
  });

  for (const d of decisions) {
    if (d.status === "ESCALATE") {
      findings.push({
        key: `DECISION_ESCALATE:${d.id}`,
        rule: "DECISION_ESCALATE",
        domain: (d.domain as Domain) ?? "gov",
        sev: 5,
        title: `Decision escalated: ${d.title}`,
        detail: `Open ${d.openDays}d with owner ${d.owner}. Requires executive attention.`,
      });
    } else if (d.status === "STALE") {
      findings.push({
        key: `DECISION_STALE:${d.id}`,
        rule: "DECISION_STALE",
        domain: (d.domain as Domain) ?? "gov",
        sev: 3,
        title: `Decision going stale: ${d.title}`,
        detail: `Open ${d.openDays}d with owner ${d.owner}.`,
      });
    }
  }

  // QUEUE_BACKLOG
  const pendingQueue = workQueue.filter((w) => w.status === "pending");
  const oldPending = pendingQueue.filter((w) => now - w.createdAt.getTime() > 3 * DAY);
  if (oldPending.length >= 2) {
    findings.push({
      key: `QUEUE_BACKLOG`,
      rule: "QUEUE_BACKLOG",
      domain: "ops",
      sev: oldPending.length >= 5 ? 4 : 2,
      title: `Autonomous work queue backlog building`,
      detail: `${oldPending.length} items pending review for 3+ days.`,
    });
  }

  findings.sort((a, b) => b.sev - a.sev);

  // ---- Domain scores ----------------------------------------------------
  const domainPenalty: Record<string, number> = Object.fromEntries(DOMAINS.map((d) => [d, 0]));
  for (const f of findings) {
    domainPenalty[f.domain] = (domainPenalty[f.domain] ?? 0) + (SEV_WEIGHT[f.sev] ?? 0);
  }
  const domainScoresMap: Record<string, number> = {};
  for (const d of DOMAINS) domainScoresMap[d] = clamp(100 - (domainPenalty[d] ?? 0), 0, 100);
  const domainScores = DOMAINS.map((d) => ({
    domain: d,
    score: domainScoresMap[d],
    findingCount: findings.filter((f) => f.domain === d).length,
  }));

  const overall = Math.round(DOMAINS.reduce((a, d) => a + domainScoresMap[d], 0) / DOMAINS.length);
  const grade = overall >= 90 ? "A" : overall >= 80 ? "B" : overall >= 70 ? "C" : overall >= 60 ? "D" : "F";
  const healthScore = { overall, grade, domains: domainScoresMap, trend: 0 };

  // ---- Flight risk --------------------------------------------------------
  const flightRisk = people
    .map((p) => {
      const pulse = pulseByPerson[p.id];
      const mood = pulse?.moodMean ?? 3;
      const load = pulse?.loadMean ?? 3;
      const lastOne = lastOneOnOne[p.id];
      const daysSinceOneOnOne = lastOne ? Math.floor((now - lastOne) / DAY) : 999;
      const moodFactor = clamp((5 - mood) / 4, 0, 1);
      const loadFactor = clamp((load - 1) / 4, 0, 1);
      const cadenceFactor = clamp(daysSinceOneOnOne / (p.cadenceDays * 3), 0, 1);
      const riskScore = Number(clamp(0.4 * moodFactor + 0.35 * loadFactor + 0.25 * cadenceFactor, 0, 1).toFixed(2));
      const riskLevel = riskScore >= 0.65 ? "HIGH" : riskScore >= 0.45 ? "ELEVATED" : riskScore >= 0.25 ? "MODERATE" : "LOW";
      return {
        personId: p.id,
        personName: p.name,
        role: p.role,
        riskScore,
        riskLevel,
        moodMean: mood,
        loadMean: load,
        daysSinceOneOnOne,
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore);

  // ---- Correlations (clusters) --------------------------------------------
  const correlations: Array<{ id: string; name: string; domains: string[]; members: string[]; combinedSev: number; description: string }> = [];
  for (const p of people) {
    const has = (rule: string) => findings.some((f) => f.rule === rule && f.personId === p.id);
    if (has("MORALE_LOW") && has("LOAD_HIGH")) {
      const members = findings.filter((f) => f.personId === p.id && ["MORALE_LOW", "LOAD_HIGH"].includes(f.rule));
      correlations.push({
        id: `CORR_BURNOUT:${p.id}`,
        name: "Burnout Spiral",
        domains: ["people"],
        members: members.map((m) => m.key),
        combinedSev: Math.max(...members.map((m) => m.sev)),
        description: `${p.name}: low morale + high load co-occurring — compounding burnout risk.`,
      });
    }
    if (has("MORALE_LOW") && has("CADENCE_SLIP")) {
      const members = findings.filter((f) => f.personId === p.id && ["MORALE_LOW", "CADENCE_SLIP"].includes(f.rule));
      correlations.push({
        id: `CORR_DISCONNECT:${p.id}`,
        name: "Disconnection Risk",
        domains: ["people"],
        members: members.map((m) => m.key),
        combinedSev: Math.max(...members.map((m) => m.sev)),
        description: `${p.name}: low morale coinciding with reduced 1:1 contact.`,
      });
    }
  }
  for (const d of decisions) {
    if (d.status === "ESCALATE" || d.status === "STALE") {
      const owner = people.find((p) => p.name === d.owner);
      const risk = owner ? flightRisk.find((r) => r.personId === owner.id) : undefined;
      if (risk && (risk.riskLevel === "HIGH" || risk.riskLevel === "ELEVATED")) {
        correlations.push({
          id: `CORR_DECISION_DRAG:${d.id}`,
          name: "Decision Drag → Attrition",
          domains: [d.domain, "people"],
          members: [`DECISION_${d.status}:${d.id}`, `FLIGHT_RISK:${owner!.id}`],
          combinedSev: d.status === "ESCALATE" ? 5 : 3,
          description: `${d.owner}'s stalled decision "${d.title}" correlates with elevated flight risk.`,
        });
      }
    }
  }

  // ---- Forward inference chains (INF-*) -----------------------------------
  const inferences: Array<{ id: string; title: string; premises: string[]; confidence: number; urgency: string; action: string; domain: string }> = [];
  let infCounter = 1;
  for (const p of people) {
    const personFindings = findings.filter((f) => f.personId === p.id);
    const hasMorale = personFindings.some((f) => f.rule === "MORALE_LOW");
    const hasLoad = personFindings.some((f) => f.rule === "LOAD_HIGH");
    const hasCadence = personFindings.some((f) => f.rule === "CADENCE_SLIP");
    const triggers = [hasMorale, hasLoad, hasCadence].filter(Boolean).length;
    if (triggers >= 2) {
      const confidence = clamp(40 + triggers * 18, 0, 97);
      inferences.push({
        id: `INF-${infCounter++}`,
        title: `${p.name} at elevated attrition risk within 60 days`,
        premises: personFindings.map((f) => f.title),
        confidence,
        urgency: triggers === 3 ? "NOW" : "TODAY",
        action: `Schedule an immediate 1:1 with ${p.name} and rebalance workload.`,
        domain: "people",
      });
    }
  }
  const escalatedDecisions = decisions.filter((d) => d.status === "ESCALATE");
  if (escalatedDecisions.length) {
    inferences.push({
      id: `INF-${infCounter++}`,
      title: `Governance drag may delay dependent commitments`,
      premises: escalatedDecisions.map((d) => `${d.title} (open ${d.openDays}d)`),
      confidence: clamp(50 + escalatedDecisions.length * 15, 0, 95),
      urgency: "TODAY",
      action: `Force-resolve escalated decisions in next leadership sync.`,
      domain: "gov",
    });
  }
  const stalledPlans = openPlans.filter((g) => g.daysSinceCheckin > 25);
  if (stalledPlans.length) {
    inferences.push({
      id: `INF-${infCounter++}`,
      title: `Career stagnation risk across ${stalledPlans.length} growth plan(s)`,
      premises: stalledPlans.map((g) => `${g.personName}: ${g.goal} (${g.daysSinceCheckin}d stale)`),
      confidence: clamp(35 + stalledPlans.length * 12, 0, 90),
      urgency: "THIS_WEEK",
      action: `Re-engage growth plan check-ins this week.`,
      domain: "people",
    });
  }

  // ---- Bayesian beliefs ---------------------------------------------------
  function bayes(priorPct: number, evidenceLRs: number[]) {
    const prior = priorPct / 100;
    let odds = prior / (1 - prior);
    for (const lr of evidenceLRs) odds *= lr;
    const posterior = odds / (1 + odds);
    return Math.round(clamp(posterior, 0.01, 0.99) * 100);
  }

  const sev4PlusPeople = findings.filter((f) => f.domain === "people" && f.sev >= 4).length;
  const highFlightCount = flightRisk.filter((r) => r.riskLevel === "HIGH").length;
  const burnoutEvidence: string[] = [];
  const burnoutLRs: number[] = [];
  if (sev4PlusPeople > 0) { burnoutLRs.push(Math.pow(1.6, sev4PlusPeople)); burnoutEvidence.push(`${sev4PlusPeople} high-severity people findings`); }
  if (highFlightCount > 0) { burnoutLRs.push(Math.pow(1.8, highFlightCount)); burnoutEvidence.push(`${highFlightCount} person(s) at HIGH flight risk`); }

  const salesRisk = flightRisk.find((r) => r.role.toLowerCase().includes("sales"));
  const salesEvidence: string[] = [];
  const salesLRs: number[] = [];
  if (salesRisk && (salesRisk.riskLevel === "HIGH" || salesRisk.riskLevel === "ELEVATED")) {
    salesLRs.push(salesRisk.riskLevel === "HIGH" ? 3.2 : 1.9);
    salesEvidence.push(`${salesRisk.personName} flight risk ${salesRisk.riskLevel} (${Math.round(salesRisk.riskScore * 100)}%)`);
  }
  if (domainScoresMap["sales"] < 80) {
    salesLRs.push(1.4);
    salesEvidence.push(`Sales domain health at ${domainScoresMap["sales"]}/100`);
  }

  const staleOrEscalated = decisions.filter((d) => d.status === "STALE" || d.status === "ESCALATE").length;
  const decisionEvidence: string[] = [];
  const decisionLRs: number[] = [];
  if (staleOrEscalated > 0) {
    decisionLRs.push(Math.pow(1.7, staleOrEscalated));
    decisionEvidence.push(`${staleOrEscalated} stale/escalated decision(s)`);
  }

  const beliefs: Record<string, { label: string; priorPct: number; posteriorPct: number; appliedEvidence: string[]; highRisk: boolean }> = {
    TEAM_BURNOUT_RISK: {
      label: "Team burnout risk",
      priorPct: 30,
      posteriorPct: bayes(30, burnoutLRs),
      appliedEvidence: burnoutEvidence,
      highRisk: false,
    },
    SALES_ATTRITION_RISK: {
      label: "Sales attrition risk",
      priorPct: 25,
      posteriorPct: bayes(25, salesLRs),
      appliedEvidence: salesEvidence,
      highRisk: false,
    },
    DECISION_PARALYSIS: {
      label: "Decision paralysis",
      priorPct: 20,
      posteriorPct: bayes(20, decisionLRs),
      appliedEvidence: decisionEvidence,
      highRisk: false,
    },
  };
  for (const k of Object.keys(beliefs)) beliefs[k].highRisk = beliefs[k].posteriorPct >= 60;

  // ---- Org entropy (Shannon entropy over domain finding distribution) ----
  const totalFindings = findings.length;
  let orgEntropy = 0;
  if (totalFindings > 0) {
    let H = 0;
    for (const d of DOMAINS) {
      const count = findings.filter((f) => f.domain === d).length;
      if (count === 0) continue;
      const p = count / totalFindings;
      H -= p * Math.log2(p);
    }
    orgEntropy = Number(clamp(H / Math.log2(DOMAINS.length), 0, 1).toFixed(2));
  }

  // ---- Temporal mode -------------------------------------------------------
  const sev4PlusAll = findings.filter((f) => f.sev >= 4).length;
  const escalateCount = decisions.filter((d) => d.status === "ESCALATE").length;
  const staleCount = decisions.filter((d) => d.status === "STALE").length;
  let temporalMode: "REACTIVE" | "STRUCTURAL_STRESS" | "STRATEGIC_DRIFT" | "BALANCED";
  if (sev4PlusAll >= 4) temporalMode = "REACTIVE";
  else if (escalateCount >= 1 || staleCount >= 2) temporalMode = "STRUCTURAL_STRESS";
  else if (domainScoresMap["strategy"] < 70 || stalledPlans.length >= 2) temporalMode = "STRATEGIC_DRIFT";
  else temporalMode = "BALANCED";

  // ---- Feedback loops -------------------------------------------------------
  const positiveFeedback = events.filter((e) => e.type === "feedback" && (e.data as any)?.sentiment === "positive").length;
  const feedbackLoops = [
    { id: "LOOP-1", name: "Morale → Attrition Risk → Backfill Load → Morale", polarity: "REINFORCING", active: highFlightCount > 0 },
    { id: "LOOP-2", name: "Decision Delay → Blocked Work → Decision Delay", polarity: "REINFORCING", active: escalateCount > 0 },
    { id: "LOOP-3", name: "Recognition → Engagement → Performance → Recognition", polarity: "REINFORCING", active: positiveFeedback > 0 },
    { id: "LOOP-4", name: "Workload ⇄ 1:1 Cadence (self-correcting)", polarity: "BALANCING", active: Object.values(lastOneOnOne).length === people.length },
  ];

  // ---- Simulation (Monte Carlo heuristic, 50 seeds) -----------------------
  const dayKey = new Date().toISOString().slice(0, 10);
  const rand = mulberry32(hashSeed(`leados-sim-${dayKey}`));
  const SEEDS = 50;

  function runScenario(adjust: (r: (typeof flightRisk)[number]) => number) {
    const trialsAttrition: number[] = [];
    const trialsEngagement: number[] = [];
    for (let s = 0; s < SEEDS; s++) {
      let attritionEvents = 0;
      let engagementSum = 0;
      for (const r of flightRisk) {
        const risk = clamp(adjust(r) + (rand() - 0.5) * 0.06, 0, 1);
        if (rand() < risk) attritionEvents++;
        engagementSum += (1 - risk) * 100;
      }
      trialsAttrition.push(attritionEvents / Math.max(1, flightRisk.length));
      trialsEngagement.push(engagementSum / Math.max(1, flightRisk.length));
    }
    trialsEngagement.sort((a, b) => a - b);
    const p10 = trialsEngagement[Math.floor(SEEDS * 0.1)] ?? trialsEngagement[0];
    const p90 = trialsEngagement[Math.floor(SEEDS * 0.9)] ?? trialsEngagement[SEEDS - 1];
    const meanAttrition = trialsAttrition.reduce((a, b) => a + b, 0) / SEEDS;
    const meanEngagement = trialsEngagement.reduce((a, b) => a + b, 0) / SEEDS;
    return {
      attritionProbability: Number(meanAttrition.toFixed(2)),
      finalMeanEngagement: Math.round(meanEngagement),
      engagementP10: Math.round(p10),
      engagementP90: Math.round(p90),
      seeds: SEEDS,
    };
  }

  const scenarios = {
    STATUS_QUO: runScenario((r) => r.riskScore),
    IMPROVE_CADENCE: runScenario((r) => {
      const cadenceFactor = clamp((r.daysSinceOneOnOne / 30) * 0.25, 0, 0.25);
      return clamp(r.riskScore - cadenceFactor * 0.5, 0, 1);
    }),
    ADD_GROWTH_PLAN: runScenario((r) => clamp(r.riskScore - 0.08, 0, 1)),
    REDUCE_LOAD: runScenario((r) => clamp(r.riskScore - (r.loadMean - 1) / 4 * 0.5 * 0.35, 0, 1)),
  };

  const interventions: Array<["IMPROVE_CADENCE" | "ADD_GROWTH_PLAN" | "REDUCE_LOAD", number]> = [
    ["IMPROVE_CADENCE", scenarios.STATUS_QUO.attritionProbability - scenarios.IMPROVE_CADENCE.attritionProbability],
    ["ADD_GROWTH_PLAN", scenarios.STATUS_QUO.attritionProbability - scenarios.ADD_GROWTH_PLAN.attritionProbability],
    ["REDUCE_LOAD", scenarios.STATUS_QUO.attritionProbability - scenarios.REDUCE_LOAD.attritionProbability],
  ];
  interventions.sort((a, b) => b[1] - a[1]);
  const bestIntervention = { name: interventions[0][0], delta: Number(interventions[0][1].toFixed(2)) };

  const simulation = { scenarios, seeds: SEEDS, bestIntervention };

  // ---- Attention plan (greedy / simulated-annealing-flavored packing) ----
  const HOURS_BUDGET = 30;
  const LOAD_BUDGET = 40;
  const candidates = findings
    .map((f) => {
      const hours = SEV_HOURS[f.sev] ?? 2;
      return { f, hours, roi: Number(((f.sev * 10) / hours).toFixed(1)) };
    })
    .sort((a, b) => b.roi - a.roi);

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  let hoursUsed = 0;
  let loadUsed = 0;
  let dayIdx = 0;
  const sequence: Array<{ title: string; rule: string; domain: string; roi: number; timeHours: number; day: string }> = [];
  const deferred: Array<{ title: string; rule: string; domain: string; reason: string }> = [];

  for (const c of candidates) {
    const loadCost = c.f.sev * 2;
    if (hoursUsed + c.hours <= HOURS_BUDGET && loadUsed + loadCost <= LOAD_BUDGET) {
      sequence.push({
        title: c.f.title,
        rule: c.f.rule,
        domain: c.f.domain,
        roi: c.roi,
        timeHours: c.hours,
        day: DAYS[dayIdx % DAYS.length],
      });
      hoursUsed += c.hours;
      loadUsed += loadCost;
      dayIdx++;
    } else {
      deferred.push({ title: c.f.title, rule: c.f.rule, domain: c.f.domain, reason: "weekly budget exceeded" });
    }
  }

  const attentionPlan = {
    sequence,
    deferred,
    totalHours: Number(hoursUsed.toFixed(1)),
    hoursBudget: HOURS_BUDGET,
    utilizationPct: Math.round((hoursUsed / HOURS_BUDGET) * 100),
    cognitiveLoadUsed: loadUsed,
    cognitiveLoadBudget: LOAD_BUDGET,
  };

  // ---- Highest leverage action --------------------------------------------
  let highestLeverageAction: { action: string; source: string; urgency: string } | null = null;
  if (sequence.length > 0) {
    const top = sequence[0];
    const srcFinding = findings.find((f) => f.title === top.title);
    highestLeverageAction = {
      action: top.title,
      source: top.rule,
      urgency: SEV_URGENCY[srcFinding?.sev ?? 3] ?? "THIS_WEEK",
    };
  } else if (findings.length > 0) {
    const top = findings[0];
    highestLeverageAction = { action: top.title, source: top.rule, urgency: SEV_URGENCY[top.sev] ?? "THIS_WEEK" };
  }

  return {
    findings,
    domainScores,
    decisions,
    eventCount: events.length,
    peopleCount: people.length,
    pulseByPerson,
    openGoals: openPlans,
    openPlans,
    correlations,
    inferences,
    beliefs,
    flightRisk,
    healthScore,
    temporalMode,
    orgEntropy,
    feedbackLoops,
    simulation,
    attentionPlan,
    highestLeverageAction,
    generatedAt: new Date().toISOString(),
  };
}
