// src/lib/boardpack.ts
//
// Exportable board risk report. The spec requires this to integrate with
// "Part 08's board pack" as ONE pack, not two. No board-pack module exists
// anywhere in this sandbox (Part 08 is not present), so this file defines
// the canonical single board-pack generator for the project going forward.
// If Part 08's actual board-pack builder is reinstated later, this risk
// section is designed to be composed into it as one additional section
// (see `buildBoardRiskSection`) rather than shipped as a second, competing
// report.

import { listRisks, summarizeBeliefs, toSimulationInput } from "./risk";
import { simulateRisk, simulatePortfolio, runCorrelationSensitivity } from "./montecarlo";
import { listFindings } from "./findings";
import { latestObservations } from "./appetite";
import { db } from "@/db";
import { controlTests, riskControls, controls, obligationInstances, obligations, policies } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { computeComplianceStatus } from "./complianceStatus";

export interface BoardRiskSection {
  generatedAt: string;
  topRisks: Array<{
    code: string;
    title: string;
    owner: string;
    inherentP95: number;
    residualP95: number;
    currency: string | null;
    likelihoodEvidence: string;
    evidenceCaveat: string;
  }>;
  portfolio: {
    trials: number;
    inherentP95: number;
    residualP95: number;
    residualTVaR99: number;
    currency: string | null;
    correlationAssumption: string;
    tailDependenceCaveat: string;
  };
  correlationSensitivity: Array<{ assumption: string; rho: number; p99: number }>;
  controlAssurance: {
    totalControls: number;
    overdueTests: number;
    recentFailures: number;
    sample: Array<{ controlCode: string; status: string; display: string }>;
  };
  obligations: {
    totalOpenInstances: number;
    breached: number;
    overdue: number;
  };
  appetite: Array<{ metricCode: string; metricName: string; status: string; value: string | null }>;
  openFindings: Array<{ code: string; title: string; severity: string; status: string }>;
  policiesDueForReview: number;
  honestyNotice: string;
}

export async function buildBoardRiskSection(): Promise<BoardRiskSection> {
  const risks = await listRisks();
  const topRiskSims = risks.slice(0, 10).map((r) => {
    const sim = simulateRisk(toSimulationInput(r), 8000, `board-${r.id}`);
    const beliefs = summarizeBeliefs(r);
    return {
      code: r.code,
      title: r.title,
      owner: r.owner,
      inherentP95: sim.inherent.p95,
      residualP95: sim.residual.p95,
      currency: sim.inherent.currency,
      likelihoodEvidence: beliefs.likelihoodEvidence,
      evidenceCaveat:
        beliefs.likelihoodEvidence === "thin"
          ? "Likelihood belief is based on thin evidence (<5 observations); treat the interval, not the point estimate, as the honest answer."
          : "Likelihood belief has at least moderate evidence behind it.",
    };
  });

  const financialRisks = risks.filter((r) => r.impact.kind === "lognormal").map(toSimulationInput);
  const inherentPortfolio = simulatePortfolio({ risks: financialRisks, trials: 8000, mode: "inherent", correlation: "moderate", seedKey: "board-portfolio-inherent" });
  const residualPortfolio = simulatePortfolio({ risks: financialRisks, trials: 8000, mode: "residual", correlation: "moderate", seedKey: "board-portfolio-residual" });
  const sensitivity = runCorrelationSensitivity(financialRisks, 6000, "residual", "board-sensitivity");

  const rcRows = await db
    .select({
      riskControlId: riskControls.id,
      controlCode: controls.code,
      cadenceDays: controls.cadenceDays,
    })
    .from(riskControls)
    .innerJoin(controls, eq(riskControls.controlId, controls.id));

  let overdueTests = 0;
  let recentFailures = 0;
  const sample: BoardRiskSection["controlAssurance"]["sample"] = [];
  for (const rc of rcRows.slice(0, 8)) {
    const [latestTest] = await db
      .select()
      .from(controlTests)
      .where(eq(controlTests.riskControlId, rc.riskControlId))
      .orderBy(desc(controlTests.createdAt))
      .limit(1);
    const status = computeComplianceStatus({
      dueAt: latestTest ? new Date(latestTest.scheduledFor) : null,
      executedAt: latestTest?.executedAt ? new Date(latestTest.executedAt) : null,
      result: (latestTest?.result as "pass" | "fail" | null) ?? null,
      evidenceAuditEventId: latestTest?.evidenceAuditEventId ?? null,
    });
    if (status.label === "overdue_no_evidence") overdueTests++;
    if (status.label === "evidenced_failed") recentFailures++;
    sample.push({ controlCode: rc.controlCode, status: status.label, display: status.display });
  }

  const allTests = await db.select().from(controlTests);
  const overdueTotal = allTests.filter((t) => t.overdue && !t.executedAt).length;

  const obInstances = await db.select().from(obligationInstances);
  const breached = obInstances.filter((i) => i.status === "breached").length;
  const overdueOb = obInstances.filter((i) => i.status === "overdue").length;

  const appetiteRows = await latestObservations();
  const findingsRows = await listFindings();
  const policyRows = await db.select().from(policies);
  const now = Date.now();
  const policiesDue = policyRows.filter((p) => p.nextReviewDueAt && new Date(p.nextReviewDueAt).getTime() < now).length;

  return {
    generatedAt: new Date().toISOString(),
    topRisks: topRiskSims,
    portfolio: {
      trials: inherentPortfolio.trials,
      inherentP95: inherentPortfolio.p95,
      residualP95: residualPortfolio.p95,
      residualTVaR99: residualPortfolio.tvar99,
      currency: inherentPortfolio.currency,
      correlationAssumption: "moderate (rho=0.3 Gaussian copula on occurrence) — see sensitivity table",
      tailDependenceCaveat:
        "Gaussian copula used for correlation UNDERSTATES tail dependence vs. heavy-tailed copulas (t/Clayton). " +
        "Extreme joint loss scenarios (e.g. a single root cause triggering multiple risks simultaneously) are " +
        "likely under-represented in the P99/TVaR99 figures above. Treat these as a lower bound on tail risk.",
    },
    correlationSensitivity: sensitivity.map((s) => ({ assumption: s.assumption, rho: s.rho, p99: s.p99 })),
    controlAssurance: {
      totalControls: rcRows.length,
      overdueTests: overdueTotal,
      recentFailures,
      sample,
    },
    obligations: {
      totalOpenInstances: obInstances.filter((i) => i.status !== "evidenced").length,
      breached,
      overdue: overdueOb,
    },
    appetite: appetiteRows.map((a) => ({
      metricCode: a.metric.code,
      metricName: a.metric.name,
      status: a.latest?.status ?? "no_observation",
      value: a.latest?.value ?? null,
    })),
    openFindings: findingsRows
      .filter((f) => f.status === "open")
      .slice(0, 10)
      .map((f) => ({ code: f.code, title: f.title, severity: f.severity, status: f.status })),
    policiesDueForReview: policiesDue,
    honestyNotice:
      "This report shows modelled distributions with explicit intervals, not point-certainties. " +
      "Compliance statuses are 'evidence of control operation as of a date', sourced from the hash-chained " +
      "audit log — never an unsupported green checkmark. Where evidence is thin, intervals are wide by design.",
  };
}
