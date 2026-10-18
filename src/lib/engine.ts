import { db } from "@/db";
import {
  people,
  oneOnOnes,
  decisions,
  metricDefs,
  metricValues,
  events,
  rules,
  ruleEvaluations,
  insights,
  playbooks,
} from "@/db/schema";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { DOMAINS, isDomain } from "@/lib/domains";
import {
  pageRank,
  mean,
  stdDev,
  zScore,
  mapePoint,
  brierScore,
  weightedTrend,
  clamp,
} from "@/lib/math";
import type {
  IntelligenceReport,
  DomainHealth,
  Finding,
  Domain,
  OrgNetworkReport,
  OrgNetworkNode,
  OrgNetworkEdge,
  DecisionHealthIndex,
  RuleHealth,
  MetricHealth,
  GraphSubgraph,
  GraphNode,
  GraphEdge,
  WeeklyBriefing,
  PriorityItem,
  UpcomingItem,
  Severity,
} from "@/lib/types";

const num = (v: string | number | null): number => {
  if (v === null) return 0;
  return typeof v === "number" ? v : parseFloat(v);
};

// ---------------------------------------------------------------------------
// Rule evaluation refresh — the "autonomous" pass. Reads latest raw data and
// writes fresh rule_evaluations rows. This is what both the autonomous
// runner and the on-demand intelligence endpoint trigger.
// ---------------------------------------------------------------------------
export async function evaluateRules(): Promise<{ evaluated: number; critical: number }> {
  const allRules = await db.select().from(rules);
  const allEvents = await db.select().from(events).where(eq(events.status, "open"));
  const allDecisions = await db.select().from(decisions);
  const allMetricDefs = await db.select().from(metricDefs);
  const allPeople = await db.select().from(people);

  let evaluated = 0;
  let critical = 0;

  for (const rule of allRules) {
    if (!rule.enabled) continue;
    let score = 100;
    let status: "healthy" | "warning" | "critical" = "healthy";
    let detail = "No anomalies detected.";

    if (rule.domain === "risk" || rule.domain === "execution") {
      const relevant = allEvents.filter((e) => e.domain === rule.domain);
      const severe = relevant.filter((e) => e.severity >= 4).length;
      score = clamp(100 - severe * 25 - relevant.length * 5, 0, 100);
      if (severe > 0) {
        status = "critical";
        detail = `${severe} high-severity open event(s) in ${rule.domain}.`;
      } else if (relevant.length > 0) {
        status = "warning";
        detail = `${relevant.length} open event(s) in ${rule.domain}.`;
      }
    } else if (rule.domain === "decisions") {
      const overdue = allDecisions.filter(
        (d) => d.status !== "decided" && d.deadline && new Date(d.deadline) < new Date()
      ).length;
      score = clamp(100 - overdue * 20, 0, 100);
      if (overdue >= 2) {
        status = "critical";
        detail = `${overdue} decisions are overdue.`;
      } else if (overdue === 1) {
        status = "warning";
        detail = "1 decision is overdue.";
      }
    } else if (rule.domain === "metrics") {
      let offTarget = 0;
      for (const def of allMetricDefs) {
        const latest = await db
          .select()
          .from(metricValues)
          .where(eq(metricValues.metricKey, def.key))
          .orderBy(desc(metricValues.recordedAt))
          .limit(1);
        if (latest.length === 0) continue;
        const v = num(latest[0].value);
        const target = num(def.target);
        const mape = mapePoint(v, target);
        if (mape !== null && mape > 20) offTarget++;
      }
      score = clamp(100 - offTarget * 15, 0, 100);
      if (offTarget >= 2) {
        status = "critical";
        detail = `${offTarget} metric(s) deviate >20% from target.`;
      } else if (offTarget === 1) {
        status = "warning";
        detail = "1 metric deviates >20% from target.";
      }
    } else if (rule.domain === "people" || rule.domain === "culture") {
      const now = Date.now();
      const stale = allPeople.filter((p) => {
        if (!p.lastOneOnOneAt) return true;
        const days = (now - new Date(p.lastOneOnOneAt).getTime()) / 86400000;
        return days > 21;
      }).length;
      score = clamp(100 - stale * 15, 0, 100);
      if (stale >= 3) {
        status = "critical";
        detail = `${stale} people overdue for a 1:1 (>21 days).`;
      } else if (stale > 0) {
        status = "warning";
        detail = `${stale} person overdue for a 1:1.`;
      }
    } else {
      const relevant = allEvents.filter((e) => e.domain === rule.domain);
      score = clamp(100 - relevant.length * 10, 0, 100);
      if (relevant.length >= 3) status = "critical";
      else if (relevant.length > 0) status = "warning";
      if (relevant.length > 0) detail = `${relevant.length} open item(s) in ${rule.domain}.`;
    }

    await db.insert(ruleEvaluations).values({
      ruleKey: rule.key,
      status,
      score: String(score),
      detail,
    });
    evaluated++;
    if (status === "critical") critical++;
  }

  return { evaluated, critical };
}

async function latestEvaluationsByRule(): Promise<Map<string, typeof ruleEvaluations.$inferSelect>> {
  const allRules = await db.select().from(rules);
  const map = new Map<string, typeof ruleEvaluations.$inferSelect>();
  for (const rule of allRules) {
    const rows = await db
      .select()
      .from(ruleEvaluations)
      .where(eq(ruleEvaluations.ruleKey, rule.key))
      .orderBy(desc(ruleEvaluations.evaluatedAt))
      .limit(2);
    if (rows.length > 0) map.set(rule.key, rows[0]);
  }
  return map;
}

export async function getRuleHealthMap(): Promise<Record<string, RuleHealth>> {
  const allRules = await db.select().from(rules);
  const result: Record<string, RuleHealth> = {};
  for (const rule of allRules) {
    const rows = await db
      .select()
      .from(ruleEvaluations)
      .where(eq(ruleEvaluations.ruleKey, rule.key))
      .orderBy(desc(ruleEvaluations.evaluatedAt))
      .limit(1);
    const latest = rows[0];
    result[rule.key] = {
      ruleKey: rule.key,
      name: rule.name,
      domain: rule.domain,
      status: (latest?.status as RuleHealth["status"]) ?? "healthy",
      score: latest ? num(latest.score) : 100,
      weight: num(rule.weight),
      enabled: rule.enabled,
      lastEvaluatedAt: latest ? new Date(latest.evaluatedAt).toISOString() : null,
      detail: latest?.detail ?? "Not yet evaluated.",
    };
  }
  return result;
}

export async function getIntelligenceReport(): Promise<IntelligenceReport> {
  const allRules = await db.select().from(rules);
  const evalMap = await latestEvaluationsByRule();
  const openEvents = await db.select().from(events).where(eq(events.status, "open"));

  const findings: Finding[] = [];
  for (const rule of allRules) {
    const latest = evalMap.get(rule.key);
    if (!latest) continue;
    if (latest.status === "warning" || latest.status === "critical") {
      const severity: Severity = latest.status === "critical" ? 4 : 3;
      findings.push({
        id: `rule-${rule.key}-${latest.id}`,
        domain: isDomain(rule.domain) ? rule.domain : "execution",
        severity,
        title: rule.name,
        detail: latest.detail,
        ruleKey: rule.key,
        createdAt: new Date(latest.evaluatedAt).toISOString(),
      });
    }
  }
  for (const ev of openEvents) {
    findings.push({
      id: `event-${ev.id}`,
      domain: isDomain(ev.domain) ? ev.domain : "execution",
      severity: clamp(ev.severity, 1, 5) as Severity,
      title: ev.title,
      detail: ev.description,
      ruleKey: null,
      createdAt: new Date(ev.createdAt).toISOString(),
    });
  }
  findings.sort((a, b) => b.severity - a.severity);

  const domainHealth: DomainHealth[] = [];
  for (const domain of DOMAINS) {
    const domainRules = allRules.filter((r) => r.domain === domain && r.enabled);
    let scoreSum = 0;
    let weightSum = 0;
    const history: number[] = [];
    for (const r of domainRules) {
      const latest = evalMap.get(r.key);
      const w = num(r.weight);
      const s = latest ? num(latest.score) : 100;
      scoreSum += s * w;
      weightSum += w;
      history.push(s);
    }
    const score = weightSum > 0 ? scoreSum / weightSum : 100;
    const domainFindings = findings.filter((f) => f.domain === domain);
    domainHealth.push({
      domain,
      score: Math.round(score),
      trend: weightedTrend(history.length > 0 ? history : [score]),
      findingCount: domainFindings.length,
      criticalCount: domainFindings.filter((f) => f.severity >= 4).length,
    });
  }

  let weightedTotal = 0;
  let totalWeight = 0;
  for (const dh of domainHealth) {
    const domainRules = allRules.filter((r) => r.domain === dh.domain && r.enabled);
    const w = domainRules.reduce((acc, r) => acc + num(r.weight), 0) || 1;
    weightedTotal += dh.score * w;
    totalWeight += w;
  }
  const orgHealthScore = totalWeight > 0 ? Math.round(weightedTotal / totalWeight) : 100;

  return {
    orgHealthScore,
    domainHealth,
    findings,
    criticalFindingsCount: findings.filter((f) => f.severity >= 4).length,
    generatedAt: new Date().toISOString(),
  };
}

export async function getOrgNetworkReport(): Promise<OrgNetworkReport> {
  const allPeople = await db.select().from(people);
  const edges: OrgNetworkEdge[] = [];
  for (const p of allPeople) {
    if (p.managerId !== null) {
      edges.push({ source: p.managerId, target: p.id, weight: 1 });
    }
  }

  const nodeIds = allPeople.map((p) => String(p.id));
  const pr = pageRank({
    nodeIds,
    edges: edges.map((e) => ({ source: String(e.source), target: String(e.target), weight: e.weight })),
  });

  const now = Date.now();
  const nodes: OrgNetworkNode[] = allPeople.map((p) => {
    const days = p.lastOneOnOneAt
      ? Math.floor((now - new Date(p.lastOneOnOneAt).getTime()) / 86400000)
      : null;
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      team: p.team,
      managerId: p.managerId,
      centrality: pr.get(String(p.id)) ?? 0,
      isolationRisk: days === null || days > 21,
      daysSinceLastOneOnOne: days,
    };
  });

  const managerCounts = new Map<number, number>();
  for (const p of allPeople) {
    if (p.managerId !== null) {
      managerCounts.set(p.managerId, (managerCounts.get(p.managerId) ?? 0) + 1);
    }
  }
  const spans = Array.from(managerCounts.values());
  const avgSpanOfControl = spans.length > 0 ? mean(spans) : 0;

  let bottleneckPersonId: number | null = null;
  let bestScore = -1;
  for (const n of nodes) {
    const span = managerCounts.get(n.id) ?? 0;
    const combined = n.centrality * 0.6 + (span / Math.max(1, Math.max(...spans, 1))) * 0.4;
    if (span > 0 && combined > bestScore) {
      bestScore = combined;
      bottleneckPersonId = n.id;
    }
  }

  return {
    nodes,
    edges,
    bottleneckPersonId,
    avgSpanOfControl: Math.round(avgSpanOfControl * 10) / 10,
    isolatedCount: nodes.filter((n) => n.isolationRisk).length,
    generatedAt: new Date().toISOString(),
  };
}

export async function getDecisionHealth(): Promise<DecisionHealthIndex> {
  const all = await db.select().from(decisions);
  const now = new Date();
  const overdue = all.filter((d) => d.status !== "decided" && d.deadline && new Date(d.deadline) < now);
  const decided = all.filter((d) => d.decidedAt !== null);
  const cycleTimes = decided.map(
    (d) => (new Date(d.decidedAt as Date).getTime() - new Date(d.createdAt).getTime()) / 86400000
  );
  const avgCycleTimeDays = cycleTimes.length > 0 ? mean(cycleTimes) : 0;

  const withOutcome = all.filter((d) => d.outcomeSuccess !== null);
  const brier = brierScore(
    withOutcome.map((d) => ({
      forecast: clamp(d.confidence, 0, 100) / 100,
      outcome: d.outcomeSuccess ? 1 : (0 as 0 | 1),
    }))
  );

  const overdueRate = all.length > 0 ? overdue.length / all.length : 0;
  const cyclePenalty = clamp((avgCycleTimeDays - 5) * 2, 0, 30);
  const brierPenalty = brier !== null ? brier * 50 : 0;
  const score = clamp(100 - overdueRate * 50 - cyclePenalty - brierPenalty, 0, 100);

  return {
    score: Math.round(score),
    totalDecisions: all.length,
    overdueCount: overdue.length,
    avgCycleTimeDays: Math.round(avgCycleTimeDays * 10) / 10,
    brierScore: brier !== null ? Math.round(brier * 1000) / 1000 : null,
    decidedWithOutcomeCount: withOutcome.length,
    generatedAt: new Date().toISOString(),
  };
}

export async function getMetricHealthMap(): Promise<Record<string, MetricHealth>> {
  const defs = await db.select().from(metricDefs);
  const result: Record<string, MetricHealth> = {};
  for (const def of defs) {
    const rows = await db
      .select()
      .from(metricValues)
      .where(eq(metricValues.metricKey, def.key))
      .orderBy(desc(metricValues.recordedAt))
      .limit(12);
    const values = rows.map((r) => num(r.value)).reverse();
    const current = values.length > 0 ? values[values.length - 1] : null;
    const target = num(def.target);
    const m = mean(values);
    const sd = stdDev(values);
    const z = current !== null ? zScore(current, m, sd) : null;
    const mape = current !== null ? mapePoint(current, target) : null;
    const trend = weightedTrend(values);

    let status: MetricHealth["status"] = "healthy";
    if (mape !== null) {
      const higherBetter = def.direction === "higher_better";
      const missingTarget = higherBetter ? (current ?? 0) < target : (current ?? 0) > target;
      if (mape > 30 && missingTarget) status = "critical";
      else if (mape > 15 && missingTarget) status = "warning";
    }

    result[def.key] = {
      key: def.key,
      label: def.label,
      domain: def.domain,
      currentValue: current,
      target,
      benchmark: num(def.benchmark),
      zScore: z !== null ? Math.round(z * 100) / 100 : null,
      mapeVsTarget: mape !== null ? Math.round(mape * 10) / 10 : null,
      trend,
      status,
    };
  }
  return result;
}

export async function getGraphSubgraph(): Promise<GraphSubgraph> {
  const allPeople = await db.select().from(people);
  const allDecisions = await db.select().from(decisions).orderBy(desc(decisions.createdAt)).limit(15);
  const allMetricDefs = await db.select().from(metricDefs);
  const allInsights = await db.select().from(insights).orderBy(desc(insights.createdAt)).limit(15);
  const allPlaybooks = await db.select().from(playbooks).limit(15);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  allPeople.forEach((p) => nodes.push({ id: `person-${p.id}`, type: "person", label: p.name, importance: 0 }));
  allDecisions.forEach((d) => nodes.push({ id: `decision-${d.id}`, type: "decision", label: d.title, importance: 0 }));
  allMetricDefs.forEach((m) => nodes.push({ id: `metric-${m.key}`, type: "metric", label: m.label, importance: 0 }));
  allInsights.forEach((i) => nodes.push({ id: `insight-${i.id}`, type: "insight", label: i.title, importance: 0 }));
  allPlaybooks.forEach((pb) => nodes.push({ id: `playbook-${pb.id}`, type: "playbook", label: pb.name, importance: 0 }));

  for (const d of allDecisions) {
    const owner = allPeople.find((p) => p.name === d.owner);
    if (owner) edges.push({ source: `person-${owner.id}`, target: `decision-${d.id}`, relation: "owns" });
    const metric = allMetricDefs.find((m) => m.domain === d.domain);
    if (metric) edges.push({ source: `decision-${d.id}`, target: `metric-${metric.key}`, relation: "impacts" });
  }
  for (const i of allInsights) {
    const metric = allMetricDefs.find((m) => m.domain === i.domain);
    if (metric) edges.push({ source: `insight-${i.id}`, target: `metric-${metric.key}`, relation: "explains" });
    const pb = allPlaybooks.find((p) => p.domain === i.domain);
    if (pb) edges.push({ source: `insight-${i.id}`, target: `playbook-${pb.id}`, relation: "informs" });
  }
  for (const pb of allPlaybooks) {
    const metric = allMetricDefs.find((m) => m.domain === pb.domain);
    if (metric) edges.push({ source: `playbook-${pb.id}`, target: `metric-${metric.key}`, relation: "targets" });
  }

  const pr = pageRank({
    nodeIds: nodes.map((n) => n.id),
    edges: edges.map((e) => ({ source: e.source, target: e.target, weight: 1 })),
  });
  nodes.forEach((n) => {
    n.importance = Math.round((pr.get(n.id) ?? 0) * 1000) / 1000;
  });
  nodes.sort((a, b) => b.importance - a.importance);

  return { nodes: nodes.slice(0, 40), edges, generatedAt: new Date().toISOString() };
}

export async function getWeeklyBriefing(): Promise<WeeklyBriefing> {
  const intelligence = await getIntelligenceReport();
  const decisionHealth = await getDecisionHealth();
  const orgNetwork = await getOrgNetworkReport();

  const worstDomain = [...intelligence.domainHealth].sort((a, b) => a.score - b.score)[0];
  const bestDomain = [...intelligence.domainHealth].sort((a, b) => b.score - a.score)[0];

  const executiveSummary =
    `Org health is ${intelligence.orgHealthScore}/100 with ${intelligence.criticalFindingsCount} ` +
    `critical finding(s) open. ${worstDomain ? `${worstDomain.domain} is the weakest domain at ${worstDomain.score}/100` : ""}` +
    `${bestDomain ? `, while ${bestDomain.domain} leads at ${bestDomain.score}/100.` : "."} ` +
    `Decision health sits at ${decisionHealth.score}/100 with ${decisionHealth.overdueCount} overdue decision(s) ` +
    `and an average cycle time of ${decisionHealth.avgCycleTimeDays} days. ` +
    `${orgNetwork.isolatedCount} team member(s) are at risk of isolation (no 1:1 in 21+ days).`;

  const highlights: string[] = [];
  if (bestDomain) highlights.push(`${bestDomain.domain} trending ${bestDomain.trend} at ${bestDomain.score}/100.`);
  if (decisionHealth.decidedWithOutcomeCount > 0 && decisionHealth.brierScore !== null) {
    highlights.push(`Decision calibration (Brier score) is ${decisionHealth.brierScore} across ${decisionHealth.decidedWithOutcomeCount} resolved decisions.`);
  }
  highlights.push(`Average span of control is ${orgNetwork.avgSpanOfControl} direct reports per manager.`);

  const risks: string[] = [];
  intelligence.findings
    .filter((f) => f.severity >= 4)
    .slice(0, 5)
    .forEach((f) => risks.push(`[${f.domain}] ${f.title} — ${f.detail}`));
  if (orgNetwork.isolatedCount > 0) {
    risks.push(`${orgNetwork.isolatedCount} people overdue for a 1:1.`);
  }
  if (decisionHealth.overdueCount > 0) {
    risks.push(`${decisionHealth.overdueCount} decisions past their deadline.`);
  }

  return { executiveSummary, highlights, risks, generatedAt: new Date().toISOString() };
}

export async function getPriorityQueue(): Promise<PriorityItem[]> {
  const intelligence = await getIntelligenceReport();
  const allDecisions = await db.select().from(decisions);
  const now = new Date();

  const items: PriorityItem[] = [];

  intelligence.findings.slice(0, 10).forEach((f) => {
    items.push({
      id: `finding-${f.id}`,
      domain: f.domain,
      severity: f.severity,
      title: f.title,
      context: f.detail,
      suggestedAction: f.severity >= 4 ? "Investigate immediately" : "Review this week",
      sourceType: "finding",
      sourceId: f.id,
    });
  });

  allDecisions
    .filter((d) => d.status !== "decided" && d.deadline && new Date(d.deadline) < now)
    .forEach((d) => {
      items.push({
        id: `decision-${d.id}`,
        domain: isDomain(d.domain) ? d.domain : "decisions",
        severity: 4,
        title: `Overdue decision: ${d.title}`,
        context: `Owned by ${d.owner}, was due ${new Date(d.deadline as Date).toLocaleDateString()}.`,
        suggestedAction: "Make the call or re-scope deadline",
        sourceType: "decision",
        sourceId: String(d.id),
      });
    });

  items.sort((a, b) => b.severity - a.severity);
  return items.slice(0, 5);
}

export async function getUpcoming(): Promise<UpcomingItem[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 7 * 86400000);
  const items: UpcomingItem[] = [];

  const allPeople = await db.select().from(people);
  allPeople.forEach((p) => {
    const days = p.lastOneOnOneAt
      ? (now.getTime() - new Date(p.lastOneOnOneAt).getTime()) / 86400000
      : Infinity;
    if (days > 14) {
      items.push({
        id: `1on1-${p.id}`,
        date: now.toISOString(),
        type: "one_on_one",
        title: `1:1 with ${p.name} overdue`,
        overdue: true,
      });
    }
  });

  const allDecisions = await db.select().from(decisions);
  allDecisions
    .filter((d) => d.status !== "decided" && d.deadline)
    .forEach((d) => {
      const deadline = new Date(d.deadline as Date);
      if (deadline <= horizon) {
        items.push({
          id: `decision-${d.id}`,
          date: deadline.toISOString(),
          type: "decision",
          title: d.title,
          overdue: deadline < now,
        });
      }
    });

  const allPlaybooks = await db.select().from(playbooks);
  allPlaybooks
    .filter((p) => p.status !== "done" && p.dueDate)
    .forEach((p) => {
      const due = new Date(p.dueDate as Date);
      if (due <= horizon) {
        items.push({
          id: `playbook-${p.id}`,
          date: due.toISOString(),
          type: "playbook",
          title: p.name,
          overdue: due < now,
        });
      }
    });

  items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return items;
}
