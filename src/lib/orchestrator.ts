import { DOMAINS } from "./types";
import type {
  DomainKey,
  DomainHealth,
  Finding,
  OrchestratorResult,
  PersonSummary,
  DecisionSummary,
  ScenarioSummary,
  BlockerSummary,
  HypothesisSummary,
  OkrSummary,
  ProjectSummary,
  NotificationSummary,
  Severity,
} from "./types";
import type { OrchestrationDataset, OneOnOneRow } from "./dataset";
import { computeFlightRiskScores } from "./flightRisk";
import { computeOneOnOneQuality } from "./oneOnOne";
import { computeOkrScore, computeOkrStatus } from "./okr";
import { computeDeliveryConfidence } from "./delivery";
import { runMonteCarloRunway } from "./monteCarlo";
import { detectCycle, computeCriticalPath, type ProjectNode } from "./criticalPath";

function daysBetween(now: Date, then: Date): number {
  return Math.max(0, Math.round((now.getTime() - then.getTime()) / 86_400_000));
}

const MONTE_CARLO_ITERATIONS = 1000;

/**
 * Pure orchestration pass: given a fully-materialized OrchestrationDataset
 * (whether it came from Postgres via fetchOrchestrationDataset(), or from a
 * hand-built mock in a self-test), computes every derived view model in one
 * pass with no I/O. This is the single source of truth every API route and
 * every self-test calls into — there is exactly one orchestration algorithm
 * in the whole app.
 */
export function runFullOrchestration(dataset: OrchestrationDataset): OrchestratorResult {
  const now = dataset.now ?? new Date();

  // --- People: flight risk + 1:1 quality -----------------------------------
  const flightRiskScores = computeFlightRiskScores(
    dataset.events.map((e) => ({ personId: e.personId, type: e.type, weight: e.weight, createdAt: e.createdAt }))
  );
  const flightRiskByPerson = new Map(flightRiskScores.map((f) => [f.personId, f.score]));

  const oneOnOnesByPerson = new Map<string, OneOnOneRow[]>();
  for (const o of dataset.oneOnOnes) {
    const list = oneOnOnesByPerson.get(o.personId) ?? [];
    list.push(o);
    oneOnOnesByPerson.set(o.personId, list);
  }

  const people: PersonSummary[] = dataset.people.map((p) => {
    const sessions = (oneOnOnesByPerson.get(p.id) ?? [])
      .slice()
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
    const last = sessions[0] as OneOnOneRow | undefined;
    const daysSinceLastOneOnOne = last ? daysBetween(now, new Date(last.occurredAt)) : null;
    const oneOnOneQuality = computeOneOnOneQuality({
      daysSinceLast: daysSinceLastOneOnOne,
      actionItemsTotal: last?.actionItemsTotal ?? 0,
      actionItemsCompleted: last?.actionItemsCompleted ?? 0,
    });
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      team: p.team,
      flightRisk: flightRiskByPerson.get(p.id) ?? 0,
      oneOnOneQuality,
      daysSinceLastOneOnOne,
    };
  });
  const peopleById = new Map(dataset.people.map((p) => [p.id, p]));

  // --- Straight pass-throughs -----------------------------------------------
  const decisions: DecisionSummary[] = dataset.decisions.map((d) => ({ ...d }));
  const scenarios: ScenarioSummary[] = dataset.scenarios.map((s) => ({ ...s }));
  const blockers: BlockerSummary[] = dataset.blockers.map((b) => ({ ...b }));
  const notifications: NotificationSummary[] = dataset.notifications.map((n) => ({ ...n }));

  // --- Projects: critical path + delivery confidence -------------------------
  const projectNodes: ProjectNode[] = dataset.projects.map((p) => ({
    id: p.id,
    durationDays: 7,
    dependsOn: p.dependsOn,
  }));
  const { hasCycle } = detectCycle(projectNodes);
  const criticalPath = hasCycle ? [] : computeCriticalPath(projectNodes);

  const blockersByProject = new Map<string, number>();
  for (const b of dataset.blockers) {
    if (b.status === "open" && b.projectId) {
      blockersByProject.set(b.projectId, (blockersByProject.get(b.projectId) ?? 0) + 1);
    }
  }
  const overdueByProject = new Map<string, number>();
  for (const m of dataset.milestones) {
    if (!m.completed && new Date(m.dueDate).getTime() < now.getTime()) {
      overdueByProject.set(m.projectId, (overdueByProject.get(m.projectId) ?? 0) + 1);
    }
  }
  const projects: ProjectSummary[] = dataset.projects.map((p) => {
    const overdueMilestones = overdueByProject.get(p.id) ?? 0;
    const criticalBlockers = blockersByProject.get(p.id) ?? 0;
    return {
      id: p.id,
      name: p.name,
      deliveryConfidence: computeDeliveryConfidence({ overdueMilestones, criticalBlockers }),
      overdueMilestones,
      criticalBlockers,
    };
  });

  // --- Hypotheses -------------------------------------------------------------
  const hypotheses: HypothesisSummary[] = dataset.hypotheses.map((h) => ({
    id: h.id,
    personId: h.personId,
    personName: peopleById.get(h.personId)?.name ?? "Unknown",
    type: h.type,
    title: h.title,
    sev: h.sev,
    status: h.status,
    createdAt: h.createdAt,
  }));

  // --- OKRs ---------------------------------------------------------------------
  const okrs: OkrSummary[] = dataset.okrs.map((o) => {
    const score = computeOkrScore(o.progress, o.timeElapsed);
    return {
      id: o.id,
      title: o.title,
      domain: o.domain,
      progress: o.progress,
      timeElapsed: o.timeElapsed,
      score,
      status: computeOkrStatus(score),
    };
  });

  // --- Finance / runway -----------------------------------------------------
  const monteCarlo = dataset.finance
    ? runMonteCarloRunway(
        dataset.finance.startingCash,
        dataset.finance.monthlyBurn,
        dataset.finance.burnStdDev,
        dataset.finance.monthlyRevenue,
        dataset.finance.revenueGrowthRate,
        MONTE_CARLO_ITERATIONS
      )
    : null;

  // --- Findings aggregation ---------------------------------------------------
  const findings: Finding[] = [];
  let findingSeq = 0;
  const pushFinding = (
    domain: DomainKey,
    sev: Severity,
    title: string,
    detail: string,
    status: "open" | "resolved" = "open"
  ) => {
    findingSeq += 1;
    findings.push({ id: `finding-${findingSeq}`, domain, sev, title, detail, status, createdAt: now.toISOString() });
  };

  for (const d of decisions) {
    if (d.status === "open" && d.sev >= 3) {
      pushFinding(d.domain, d.sev, `Open decision: ${d.title}`, "Unresolved decision pending leadership input.");
    }
  }
  for (const s of scenarios) {
    if (s.status === "active" && s.sev >= 3) {
      pushFinding(s.domain, s.sev, `Active scenario: ${s.title}`, "Scenario is live and needs monitoring.");
    }
  }
  for (const b of blockers) {
    if (b.status === "open") {
      pushFinding(b.domain, b.sev, `Open blocker: ${b.title}`, "Execution blocker is unresolved.");
    }
  }
  for (const h of hypotheses) {
    if (h.status === "open" && h.sev >= 3) {
      pushFinding("hypotheses", h.sev, h.title, `Hypothesis about ${h.personName}.`);
    }
  }
  for (const o of okrs) {
    if (o.status !== "on_track") {
      pushFinding(o.domain, o.status === "off_track" ? 5 : 3, `OKR at risk: ${o.title}`, `Pacing score ${(o.score * 100).toFixed(0)}%.`);
    }
  }
  for (const p of people) {
    if (p.flightRisk >= 0.7) {
      pushFinding("people", p.flightRisk >= 0.85 ? 5 : 4, `${p.name}: elevated flight risk`, `Flight risk score ${(p.flightRisk * 100).toFixed(0)}%.`);
    }
  }
  for (const pr of projects) {
    if (pr.deliveryConfidence < 50) {
      pushFinding("execution", pr.deliveryConfidence < 25 ? 5 : 4, `${pr.name}: low delivery confidence`, `Confidence ${pr.deliveryConfidence}%.`);
    }
  }
  if (monteCarlo && monteCarlo.p10 < 6) {
    pushFinding("financial", 5, "Runway risk: p10 scenario under 6 months", `p10 runway is ${monteCarlo.p10.toFixed(1)} months.`);
  }
  for (const n of notifications) {
    if (!n.read && n.sev >= 4) {
      pushFinding(n.domain, n.sev, n.title, n.message);
    }
  }

  // --- Domain health ------------------------------------------------------------
  const domainHealth = {} as Record<DomainKey, DomainHealth>;
  for (const domain of DOMAINS) {
    const domainFindings = findings.filter((f) => f.domain === domain && f.status === "open");
    const penalty = domainFindings.reduce((sum, f) => sum + f.sev * 8, 0);
    const score = Math.max(0, Math.min(100, 100 - penalty));
    const criticalFindings = domainFindings.filter((f) => f.sev >= 4).length;
    domainHealth[domain] = {
      domain,
      score,
      status: score >= 70 ? "healthy" : score >= 40 ? "at_risk" : "critical",
      criticalFindings,
      findingCount: domainFindings.length,
    };
  }

  // Cockpit = organization-wide rollup (avg score / sum of critical findings
  // across every real domain), rather than owning findings of its own.
  const rollupDomains: DomainKey[] = DOMAINS.filter((d) => d !== "cockpit" && d !== "about" && d !== "signals");
  const avgScore = rollupDomains.reduce((sum, d) => sum + domainHealth[d].score, 0) / rollupDomains.length;
  const cockpitCritical = rollupDomains.reduce((sum, d) => sum + domainHealth[d].criticalFindings, 0);
  domainHealth.cockpit = {
    domain: "cockpit",
    score: Math.round(avgScore),
    status: avgScore >= 70 ? "healthy" : avgScore >= 40 ? "at_risk" : "critical",
    criticalFindings: cockpitCritical,
    findingCount: findings.filter((f) => f.status === "open").length,
  };

  // Signal Board = worst-case alarm surface across every real domain.
  const worstScore = Math.min(...rollupDomains.map((d) => domainHealth[d].score));
  domainHealth.signals = {
    domain: "signals",
    score: worstScore,
    status: worstScore >= 70 ? "healthy" : worstScore >= 40 ? "at_risk" : "critical",
    criticalFindings: cockpitCritical,
    findingCount: findings.filter((f) => f.status === "open" && rollupDomains.includes(f.domain)).length,
  };

  return {
    generatedAt: now.toISOString(),
    domainHealth,
    findings,
    people,
    decisions,
    scenarios,
    blockers,
    hypotheses,
    okrs,
    projects,
    criticalPath,
    notifications,
    monteCarlo,
  };
}
