import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  causalChains as causalChainsTable,
  decisions as decisionsTable,
  domainScores as domainScoresTable,
  findings as findingsTable,
  hypotheses as hypothesesTable,
  people as peopleTable,
  riskItems as riskItemsTable,
  ruleEvaluations as ruleEvaluationsTable,
} from "@/db/schema";
import {
  DOMAINS,
  type CausalChain,
  type DecisionItem,
  type Domain,
  type DomainScore,
  type Finding,
  type HeatmapCell,
  type OrchestratorResult,
  type PersonRisk,
  type RiskItem,
  type RuleEvaluation,
  type Severity,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Rule catalogue — two rules per domain. Each rule has a base health score
// that gets perturbed by a deterministic-ish wave + noise on every
// orchestrator pass, simulating a "live" signal feed without needing a real
// upstream data source.
// ---------------------------------------------------------------------------
interface RuleDefinition {
  key: string;
  domain: Domain;
  title: string;
  description: string;
  baseScore: number;
  amplitude: number;
  playbook?: string;
}

export const RULES: RuleDefinition[] = [
  {
    key: "people.flight_risk_cluster",
    domain: "people",
    title: "Flight-risk cluster forming on core team",
    description: "Multiple high performers show declining engagement + cadence gaps simultaneously.",
    baseScore: 58,
    amplitude: 22,
    playbook: "retain-core-talent",
  },
  {
    key: "people.burnout_trend",
    domain: "people",
    title: "Burnout index trending up org-wide",
    description: "After-hours activity and PTO deferrals climbing across two+ teams.",
    baseScore: 64,
    amplitude: 18,
    playbook: "burnout-intervention",
  },
  {
    key: "risk.customer_concentration",
    domain: "risk",
    title: "Revenue concentration in top 3 accounts",
    description: "Top accounts now represent an outsized share of pipeline-weighted revenue.",
    baseScore: 52,
    amplitude: 20,
    playbook: "diversify-revenue-base",
  },
  {
    key: "risk.vendor_dependency",
    domain: "risk",
    title: "Single vendor dependency on critical path",
    description: "No redundancy for a vendor that gates production releases.",
    baseScore: 60,
    amplitude: 16,
  },
  {
    key: "pipeline.stalled_deals",
    domain: "pipeline",
    title: "Stalled deals piling up mid-funnel",
    description: "Deals sitting >21 days in the same stage without logged activity.",
    baseScore: 55,
    amplitude: 24,
    playbook: "unstick-stalled-deals",
  },
  {
    key: "pipeline.coverage_gap",
    domain: "pipeline",
    title: "Pipeline coverage below target ratio",
    description: "Coverage ratio has dropped under 3x quota for the current quarter.",
    baseScore: 61,
    amplitude: 19,
  },
  {
    key: "finance.burn_acceleration",
    domain: "finance",
    title: "Burn rate accelerating vs. plan",
    description: "Monthly burn is outpacing the board-approved plan by a widening margin.",
    baseScore: 57,
    amplitude: 21,
    playbook: "burn-rate-reset",
  },
  {
    key: "finance.revenue_at_risk",
    domain: "finance",
    title: "Revenue-at-risk from churn exposure",
    description: "Forecasted revenue exposed to accounts with elevated churn signals.",
    baseScore: 59,
    amplitude: 20,
  },
  {
    key: "product.velocity_decline",
    domain: "product",
    title: "Shipping velocity declining sprint over sprint",
    description: "Story points completed trending down for three consecutive sprints.",
    baseScore: 63,
    amplitude: 17,
  },
  {
    key: "product.tech_debt_drag",
    domain: "product",
    title: "Tech debt drag on roadmap commitments",
    description: "Unplanned work consuming a growing share of sprint capacity.",
    baseScore: 60,
    amplitude: 15,
    playbook: "tech-debt-paydown",
  },
  {
    key: "customer.nps_decline",
    domain: "customer",
    title: "NPS decline among enterprise tier",
    description: "Net promoter score for enterprise accounts fell across two survey cycles.",
    baseScore: 56,
    amplitude: 20,
  },
  {
    key: "customer.support_backlog",
    domain: "customer",
    title: "Support backlog aging past SLA",
    description: "A growing share of tickets breach first-response SLA thresholds.",
    baseScore: 58,
    amplitude: 18,
    playbook: "support-backlog-triage",
  },
  {
    key: "strategy.okr_drift",
    domain: "strategy",
    title: "OKR drift from quarterly priorities",
    description: "Team-level initiatives diverging from the stated top-3 company OKRs.",
    baseScore: 62,
    amplitude: 16,
  },
  {
    key: "strategy.competitive_pressure",
    domain: "strategy",
    title: "Competitive pressure intensifying in core segment",
    description: "Win-rate against the top competitor has dropped meaningfully.",
    baseScore: 57,
    amplitude: 19,
  },
  {
    key: "operations.incident_frequency",
    domain: "operations",
    title: "Production incident frequency rising",
    description: "Sev-2+ incidents per week trending above the rolling baseline.",
    baseScore: 54,
    amplitude: 23,
    playbook: "incident-response-hardening",
  },
  {
    key: "operations.onboarding_latency",
    domain: "operations",
    title: "Customer onboarding latency increasing",
    description: "Time-to-first-value for new accounts is slipping past target.",
    baseScore: 61,
    amplitude: 17,
  },
];

export const PLAYBOOKS: Record<string, string> = RULES.reduce((acc, rule) => {
  if (rule.playbook) acc[rule.key] = rule.playbook;
  return acc;
}, {} as Record<string, string>);

// Cross-domain causal chains: when the member rules are all currently
// "unhealthy" (score < 60), we flag an amplified cascade.
interface CausalChainDefinition {
  id: string;
  description: string;
  ruleKeys: string[];
  amplificationFactor: number;
}

export const CAUSAL_CHAINS: CausalChainDefinition[] = [
  {
    id: "chain.sales-to-cash",
    description:
      "Stalled deals + thin pipeline coverage are compounding revenue-at-risk exposure.",
    ruleKeys: ["pipeline.stalled_deals", "pipeline.coverage_gap", "finance.revenue_at_risk"],
    amplificationFactor: 1.6,
  },
  {
    id: "chain.talent-drain",
    description:
      "Rising burnout is feeding a flight-risk cluster, which threatens shipping velocity.",
    ruleKeys: ["people.burnout_trend", "people.flight_risk_cluster", "product.velocity_decline"],
    amplificationFactor: 1.45,
  },
  {
    id: "chain.customer-erosion",
    description:
      "Support backlog aging is dragging NPS down, which widens customer concentration risk.",
    ruleKeys: ["customer.support_backlog", "customer.nps_decline", "risk.customer_concentration"],
    amplificationFactor: 1.35,
  },
  {
    id: "chain.reliability-spiral",
    description:
      "Incident frequency is slowing onboarding, adding friction to competitive positioning.",
    ruleKeys: [
      "operations.incident_frequency",
      "operations.onboarding_latency",
      "strategy.competitive_pressure",
    ],
    amplificationFactor: 1.3,
  },
];

const PEOPLE_SEED = [
  { name: "Maya Chen", role: "VP Engineering", flightRiskProbability: 0.42, burnoutIndex: 71, cadenceHealth: 54 },
  { name: "Diego Alvarez", role: "Staff Engineer", flightRiskProbability: 0.61, burnoutIndex: 78, cadenceHealth: 38 },
  { name: "Priya Narayanan", role: "Head of Product", flightRiskProbability: 0.35, burnoutIndex: 58, cadenceHealth: 70 },
  { name: "Jordan Lee", role: "Sales Director", flightRiskProbability: 0.47, burnoutIndex: 63, cadenceHealth: 61 },
  { name: "Ola Fagbemi", role: "Customer Success Lead", flightRiskProbability: 0.28, burnoutIndex: 49, cadenceHealth: 82 },
  { name: "Sam Whitfield", role: "Finance Manager", flightRiskProbability: 0.22, burnoutIndex: 44, cadenceHealth: 88 },
];

const DECISION_SEED = [
  { title: "Approve Q3 pricing restructure", owner: "Priya Narayanan", daysOpen: 28, dueInDays: -4 },
  { title: "Sign renewed vendor SLA", owner: "Sam Whitfield", daysOpen: 12, dueInDays: 3 },
  { title: "Greenlight platform re-architecture", owner: "Maya Chen", daysOpen: 40, dueInDays: -12 },
  { title: "Finalize enterprise onboarding playbook", owner: "Ola Fagbemi", daysOpen: 9, dueInDays: 5 },
  { title: "Approve headcount plan for Q4", owner: "Jordan Lee", daysOpen: 21, dueInDays: -1 },
  { title: "Ratify incident response escalation policy", owner: "Diego Alvarez", daysOpen: 6, dueInDays: 8 },
];

const HYPOTHESIS_SEED = [
  {
    statement: "Burnout spike is driven by on-call rotation imbalance, not headcount.",
    domain: "people" as Domain,
    daysToResolveBy: 6,
  },
  {
    statement: "Stalled mid-funnel deals correlate with a pricing objection, not lead quality.",
    domain: "pipeline" as Domain,
    daysToResolveBy: 4,
  },
  {
    statement: "NPS decline is concentrated in accounts onboarded in the last 90 days.",
    domain: "customer" as Domain,
    daysToResolveBy: 9,
  },
];

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function seededNoise(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function scoreToSeverity(score: number): Severity {
  if (score < 40) return 5;
  if (score < 50) return 4;
  if (score < 65) return 3;
  if (score < 80) return 2;
  return 1;
}

async function ensureSeeded(): Promise<void> {
  const [{ count: peopleCount }] = (await db
    .select({ count: sql<number>`count(*)::int` })
    .from(peopleTable)) as { count: number }[];

  if (!peopleCount) {
    await db.insert(peopleTable).values(
      PEOPLE_SEED.map((p) => ({
        name: p.name,
        role: p.role,
        flightRiskProbability: p.flightRiskProbability,
        burnoutIndex: p.burnoutIndex,
        cadenceHealth: p.cadenceHealth,
        lastOneOnOneAt: new Date(Date.now() - Math.round(Math.random() * 14) * 86400000),
      })),
    );
  }

  const [{ count: decisionCount }] = (await db
    .select({ count: sql<number>`count(*)::int` })
    .from(decisionsTable)) as { count: number }[];

  if (!decisionCount) {
    const now = Date.now();
    await db.insert(decisionsTable).values(
      DECISION_SEED.map((d) => {
        const dueAt = new Date(now + d.dueInDays * 86400000);
        const overdue = dueAt.getTime() < now;
        return {
          title: d.title,
          owner: d.owner,
          status: overdue ? ("overdue" as const) : ("open" as const),
          openedAt: new Date(now - d.daysOpen * 86400000),
          dueAt,
          cycleTimeDays: null,
        };
      }),
    );
  }

  const [{ count: chainCount }] = (await db
    .select({ count: sql<number>`count(*)::int` })
    .from(causalChainsTable)) as { count: number }[];

  if (!chainCount) {
    await db.insert(causalChainsTable).values(
      CAUSAL_CHAINS.map((c) => ({
        id: c.id,
        description: c.description,
        ruleKeys: c.ruleKeys,
        amplificationFactor: c.amplificationFactor,
      })),
    );
  }

  const [{ count: hypothesisCount }] = (await db
    .select({ count: sql<number>`count(*)::int` })
    .from(hypothesesTable)) as { count: number }[];

  if (!hypothesisCount) {
    const now = Date.now();
    await db.insert(hypothesesTable).values(
      HYPOTHESIS_SEED.map((h) => ({
        statement: h.statement,
        domain: h.domain,
        status: "open" as const,
        openedAt: new Date(now - 2 * 86400000),
        resolveBy: new Date(now + h.daysToResolveBy * 86400000),
      })),
    );
  }
}

/**
 * Runs one orchestrator pass: scores every rule, persists a rule_evaluations
 * row + domain_scores snapshot, regenerates active findings, and returns the
 * full OrchestratorResult. `ruleSubset` lets the SSE loop recompute only a
 * handful of rules per tick to simulate a live trickle of findings.
 */
export async function runOrchestrator(options?: { ruleSubset?: string[] }): Promise<OrchestratorResult> {
  await ensureSeeded();

  const now = new Date();
  const tick = Math.floor(now.getTime() / 60000); // minute resolution wave
  const rulesToRun = options?.ruleSubset
    ? RULES.filter((r) => options.ruleSubset!.includes(r.key))
    : RULES;

  const newFindings: Omit<typeof findingsTable.$inferInsert, "id">[] = [];
  const ruleEvalRows: (typeof ruleEvaluationsTable.$inferInsert)[] = [];

  for (const rule of rulesToRun) {
    const wave = Math.sin(tick / 12 + rule.baseScore) * rule.amplitude * 0.5;
    const noise = (seededNoise(tick * 0.17 + rule.baseScore) - 0.5) * rule.amplitude * 0.6;
    const score = clamp(Math.round(rule.baseScore + wave + noise));
    const severity = scoreToSeverity(score);

    ruleEvalRows.push({
      ruleKey: rule.key,
      domain: rule.domain,
      title: rule.title,
      score,
      severity,
      evaluatedAt: now,
    });

    if (severity >= 3) {
      newFindings.push({
        ruleKey: rule.key,
        domain: rule.domain,
        severity,
        title: rule.title,
        description: rule.description,
        probability: clamp((100 - score) / 100 + 0.15, 0, 0.97),
        causalChainId: null,
        amplificationFactor: null,
        dismissed: false,
        createdAt: now,
      });
    }
  }

  // Attach causal chain metadata to any newly generated findings whose rule
  // participates in a chain where every member rule is currently unhealthy.
  if (ruleEvalRows.length) {
    const latestScores = new Map(ruleEvalRows.map((r) => [r.ruleKey, r.score]));
    for (const chain of CAUSAL_CHAINS) {
      const allUnhealthy = chain.ruleKeys.every((key) => {
        const score = latestScores.get(key);
        return score === undefined || score < 68;
      });
      if (!allUnhealthy) continue;
      for (const finding of newFindings) {
        if (chain.ruleKeys.includes(finding.ruleKey)) {
          finding.causalChainId = chain.id;
          finding.amplificationFactor = chain.amplificationFactor;
        }
      }
    }
  }

  if (ruleEvalRows.length) {
    await db.insert(ruleEvaluationsTable).values(ruleEvalRows);
  }
  if (newFindings.length) {
    await db.insert(findingsTable).values(newFindings);
  }

  // Domain score snapshot = average of the most recent score per rule in
  // that domain (across this run plus any rules not refreshed this tick).
  const latestPerRule = new Map<string, { domain: Domain; score: number }>();
  const recentEvals = await db
    .select()
    .from(ruleEvaluationsTable)
    .orderBy(desc(ruleEvaluationsTable.evaluatedAt))
    .limit(200);
  for (const row of recentEvals) {
    if (!latestPerRule.has(row.ruleKey)) {
      latestPerRule.set(row.ruleKey, { domain: row.domain, score: row.score });
    }
  }

  const domainScoreRows: (typeof domainScoresTable.$inferInsert)[] = [];
  for (const domain of DOMAINS) {
    const scoresForDomain = [...latestPerRule.values()].filter((v) => v.domain === domain).map((v) => v.score);
    const avg = scoresForDomain.length
      ? scoresForDomain.reduce((a, b) => a + b, 0) / scoresForDomain.length
      : 70;
    domainScoreRows.push({ domain, score: Math.round(avg), recordedAt: now });
  }
  await db.insert(domainScoresTable).values(domainScoreRows);

  return buildResult(now);
}

async function buildResult(now: Date): Promise<OrchestratorResult> {
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

  const [domainScoreRows, ruleEvalRows, findingRows, chainRows, riskRows, peopleRows, decisionRows] =
    await Promise.all([
      db.select().from(domainScoresTable).where(gte(domainScoresTable.recordedAt, sevenDaysAgo)),
      db
        .select()
        .from(ruleEvaluationsTable)
        .where(gte(ruleEvaluationsTable.evaluatedAt, sevenDaysAgo))
        .orderBy(desc(ruleEvaluationsTable.evaluatedAt)),
      db
        .select()
        .from(findingsTable)
        .where(and(eq(findingsTable.dismissed, false), gte(findingsTable.createdAt, sevenDaysAgo)))
        .orderBy(desc(findingsTable.createdAt))
        .limit(100),
      db.select().from(causalChainsTable),
      db.select().from(riskItemsTable),
      db.select().from(peopleTable),
      db.select().from(decisionsTable),
    ]);

  // --- domain scores (current vs 7-day-prior) ---
  const byDomainChrono = new Map<Domain, { score: number; recordedAt: Date }[]>();
  for (const row of domainScoreRows) {
    const list = byDomainChrono.get(row.domain) ?? [];
    list.push({ score: row.score, recordedAt: row.recordedAt });
    byDomainChrono.set(row.domain, list);
  }
  const domainScores: DomainScore[] = DOMAINS.map((domain) => {
    const list = (byDomainChrono.get(domain) ?? []).sort(
      (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
    );
    const current = list.at(-1)?.score ?? 70;
    const prior = list[0]?.score ?? current;
    return { domain, score: current, priorScore: prior };
  });
  const orgHealthScore = Math.round(domainScores.reduce((a, d) => a + d.score, 0) / domainScores.length);
  const priorOrgHealthScore = Math.round(
    domainScores.reduce((a, d) => a + d.priorScore, 0) / domainScores.length,
  );

  // --- rule evaluations with 7-value history for sparklines ---
  const byRuleChrono = new Map<string, RuleEvaluation>();
  const historyByRule = new Map<string, number[]>();
  for (const row of [...ruleEvalRows].sort((a, b) => a.evaluatedAt.getTime() - b.evaluatedAt.getTime())) {
    const hist = historyByRule.get(row.ruleKey) ?? [];
    hist.push(row.score);
    historyByRule.set(row.ruleKey, hist.slice(-7));
    byRuleChrono.set(row.ruleKey, {
      ruleKey: row.ruleKey,
      domain: row.domain,
      title: row.title,
      score: row.score,
      severity: row.severity as Severity,
      history: historyByRule.get(row.ruleKey)!,
      evaluatedAt: row.evaluatedAt.toISOString(),
    });
  }
  const ruleEvaluations = [...byRuleChrono.values()];

  // --- heatmap: domain x day -> max severity ---
  const heatmapMap = new Map<string, Severity>();
  for (const row of ruleEvalRows) {
    const day = row.evaluatedAt.toISOString().slice(0, 10);
    const key = `${row.domain}__${day}`;
    const existing = heatmapMap.get(key) ?? 0;
    if ((row.severity as Severity) > existing) heatmapMap.set(key, row.severity as Severity);
  }
  const heatmap: HeatmapCell[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
    for (const domain of DOMAINS) {
      const sev = heatmapMap.get(`${domain}__${day}`) ?? 0;
      heatmap.push({ domain, date: day, maxSeverity: sev });
    }
  }

  const findingsResult: Finding[] = findingRows.map((f) => ({
    id: f.id,
    ruleKey: f.ruleKey,
    domain: f.domain,
    severity: f.severity as Severity,
    title: f.title,
    description: f.description,
    probability: f.probability,
    causalChainId: f.causalChainId,
    amplificationFactor: f.amplificationFactor,
    dismissed: f.dismissed,
    createdAt: f.createdAt.toISOString(),
  }));

  const causalChains: CausalChain[] = chainRows.map((c) => ({
    id: c.id,
    description: c.description,
    ruleKeys: c.ruleKeys,
    amplificationFactor: c.amplificationFactor,
  }));

  const risks: RiskItem[] = [
    ...riskRows.map((r) => ({
      id: r.id,
      title: r.title,
      domain: r.domain,
      probability: r.probability,
      impact: r.impact,
      amplificationFactor: r.amplificationFactor,
      causalChainId: r.causalChainId,
    })),
    ...findingsResult
      .filter((f) => f.domain === "risk" || f.causalChainId)
      .slice(0, 5)
      .map((f, idx) => ({
        id: -(idx + 1),
        title: f.title,
        domain: f.domain,
        probability: f.probability ?? 0.5,
        impact: f.severity * 20,
        amplificationFactor: f.amplificationFactor,
        causalChainId: f.causalChainId,
      })),
  ]
    .sort((a, b) => b.probability * b.impact - a.probability * a.impact)
    .slice(0, 5);

  const peopleResult: PersonRisk[] = peopleRows
    .map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      flightRiskProbability: p.flightRiskProbability,
      burnoutIndex: p.burnoutIndex,
      cadenceHealth: p.cadenceHealth,
      lastOneOnOneAt: p.lastOneOnOneAt ? p.lastOneOnOneAt.toISOString() : null,
    }))
    .sort((a, b) => b.flightRiskProbability - a.flightRiskProbability);

  const decisionsResult: DecisionItem[] = decisionRows.map((d) => {
    const overdue = d.status !== "resolved" && d.dueAt.getTime() < now.getTime();
    return {
      id: d.id,
      title: d.title,
      owner: d.owner,
      status: overdue ? "overdue" : d.status,
      openedAt: d.openedAt.toISOString(),
      dueAt: d.dueAt.toISOString(),
      resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
      cycleTimeDays: d.cycleTimeDays,
      overdue,
    };
  });

  const resolvedCycleTimes = decisionsResult
    .filter((d) => d.cycleTimeDays !== null)
    .map((d) => d.cycleTimeDays as number);
  const overdueCount = decisionsResult.filter((d) => d.overdue).length;
  const decisionHealthIndex = Math.round(
    clamp(100 - overdueCount * 15 - (decisionsResult.length ? 0 : 0)),
  );
  const cycleTimeTrend =
    resolvedCycleTimes.length > 0
      ? resolvedCycleTimes.slice(-7)
      : [12, 14, 11, 16, 13, 15, decisionsResult.length ? 17 : 12];

  return {
    generatedAt: now.toISOString(),
    orgHealthScore,
    priorOrgHealthScore,
    domainScores,
    findings: findingsResult,
    ruleEvaluations,
    causalChains,
    risks,
    people: peopleResult,
    decisions: decisionsResult,
    decisionHealthIndex,
    cycleTimeTrend,
    heatmap,
    playbooks: PLAYBOOKS,
  };
}

/** Fetches the latest persisted state without running new rule evaluations. */
export async function getLatestOrchestratorResult(): Promise<OrchestratorResult> {
  await ensureSeeded();
  const [{ count }] = (await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ruleEvaluationsTable)) as { count: number }[];
  if (!count) {
    return runOrchestrator();
  }
  return buildResult(new Date());
}

/** Picks a small rolling subset of rules for the SSE trickle-update loop. */
export function pickRuleSubset(size = 3): string[] {
  const shuffled = [...RULES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, size).map((r) => r.key);
}
