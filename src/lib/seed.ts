import { db } from "@/db";
import * as s from "@/db/schema";
import { sql } from "drizzle-orm";
import { forecastBiasPct, movingAverageForecast } from "@/lib/calculations";

/** Idempotent demo-data seed. Safe to call repeatedly: skips tables that already have rows. */
export async function seedAll() {
  const report: Record<string, string> = {};

  async function seedTable<T>(name: string, table: { id: unknown }, rows: () => Promise<T[]> | T[]) {
    const [{ count }] = await db.execute<{ count: string }>(sql`select count(*)::int as count from ${table}`).then((r) => r.rows as { count: string }[]);
    if (Number(count) > 0) {
      report[name] = `skipped (${count} rows already present)`;
      return;
    }
    const data = await rows();
    if (data.length) await db.insert(table as never).values(data as never[]);
    report[name] = `inserted ${data.length} rows`;
  }

  await seedTable("accounts", s.accounts, () => [
    { name: "Northwind Retail", segment: "enterprise", mrrUsd: "18400.00" },
    { name: "Acme Manufacturing", segment: "mid-market", mrrUsd: "7200.00" },
    { name: "Globex Logistics", segment: "enterprise", mrrUsd: "24100.00" },
    { name: "Initech Services", segment: "smb", mrrUsd: "1850.00" },
    { name: "Umbrella Health", segment: "mid-market", mrrUsd: "9600.00" },
  ]);

  const accountRows = await db.select().from(s.accounts);
  const byName = (n: string) => accountRows.find((a) => a.name === n)!.id;

  await seedTable("opportunities", s.opportunities, () => [
    { name: "Northwind Expansion Q3", account: "Northwind Retail", amountUsd: "84000.00", stage: "negotiate", probability: "0.6500", closeDate: "2026-03-15", owner: "D. Osei" },
    { name: "Acme Renewal", account: "Acme Manufacturing", amountUsd: "36000.00", stage: "propose", probability: "0.4500", closeDate: "2026-02-20", owner: "R. Alvarez" },
    { name: "Globex New Logo", account: "Globex Logistics", amountUsd: "152000.00", stage: "qualify", probability: "0.2500", closeDate: "2026-04-30", owner: "D. Osei" },
    { name: "Initech Upsell", account: "Initech Services", amountUsd: "9000.00", stage: "prospect", probability: "0.1000", closeDate: "2026-05-10", owner: "M. Chen" },
    { name: "Umbrella Platform Add-on", account: "Umbrella Health", amountUsd: "47000.00", stage: "negotiate", probability: "0.7000", closeDate: "2026-02-28", owner: "R. Alvarez" },
    { name: "Northwind Phase 2", account: "Northwind Retail", amountUsd: "61000.00", stage: "closed-won", probability: "1.0000", closeDate: "2025-12-01", owner: "D. Osei" },
  ]);

  const pipelineOpenAmounts = [84000, 36000, 152000, 9000, 47000];
  const histForecast = movingAverageForecast([210000, 225000, 198000, 240000, 231000, 252000], 6);
  await seedTable("revenueForecasts", s.revenueForecasts, () => [
    {
      period: "2026-Q1",
      method: "moving-average",
      p10: String(histForecast.p10),
      p50: String(histForecast.p50),
      p90: String(histForecast.p90),
      honestyLabel: "estimated",
    },
  ]);
  void pipelineOpenAmounts;

  await seedTable("healthScores", s.healthScores, () => [
    { accountId: byName("Northwind Retail"), score: "81.00", band: "healthy", adoption: "88", engagement: "80", support: "90", outcome: "75", explainTop3: ["support (22.5 pts)", "adoption (22.0 pts)", "engagement (20.0 pts)"] },
    { accountId: byName("Acme Manufacturing"), score: "52.00", band: "watch", adoption: "48", engagement: "55", support: "60", outcome: "45", explainTop3: ["support (15.0 pts)", "engagement (13.8 pts)", "adoption (12.0 pts)"] },
    { accountId: byName("Globex Logistics"), score: "33.00", band: "at-risk", adoption: "28", engagement: "30", support: "42", outcome: "32", explainTop3: ["support (10.5 pts)", "outcome (8.0 pts)", "engagement (7.5 pts)"] },
    { accountId: byName("Initech Services"), score: "67.00", band: "watch", adoption: "70", engagement: "65", support: "68", outcome: "64", explainTop3: ["adoption (17.5 pts)", "support (17.0 pts)", "engagement (16.3 pts)"] },
    { accountId: byName("Umbrella Health"), score: "90.00", band: "healthy", adoption: "92", engagement: "91", support: "88", outcome: "89", explainTop3: ["adoption (23.0 pts)", "engagement (22.8 pts)", "outcome (22.3 pts)"] },
  ]);

  await seedTable("churnWarnings", s.churnWarnings, () => [
    { accountId: byName("Globex Logistics"), probability: "0.7200", leadTimeDays: 34, driver: "support ticket volume up 3x vs 90-day baseline", honestyLabel: "association" },
    { accountId: byName("Acme Manufacturing"), probability: "0.4100", leadTimeDays: 51, driver: "feature adoption plateaued for 60 days", honestyLabel: "association" },
  ]);

  await seedTable("voiceItems", s.voiceItems, () => [
    { accountId: byName("Globex Logistics"), source: "ticket", text: "Reports take too long to load during month-end.", topic: "performance", sentiment: "-0.600" },
    { accountId: byName("Northwind Retail"), source: "survey", text: "Forecast accuracy has been excellent this quarter.", topic: "forecasting", sentiment: "0.800" },
    { accountId: byName("Acme Manufacturing"), source: "call", text: "Would like more granular permission controls.", topic: "access-control", sentiment: "0.100" },
    { accountId: byName("Umbrella Health"), source: "review", text: "Onboarding was fast and the mobile briefings are genuinely useful.", topic: "onboarding", sentiment: "0.750" },
  ]);

  const demandSteady = [120, 115, 130, 125, 118, 128];
  const demandIntermittent = [0, 5, 0, 0, 8, 0];
  await seedTable("inventoryItems", s.inventoryItems, () => [
    { sku: "SKU-1001", name: "Steel Bracket A", onHand: 340, reorderPoint: 200, orderUpTo: 600, leadTimeDays: 14, demandHistory: demandSteady, pattern: "steady" },
    { sku: "SKU-2002", name: "Custom Gearbox", onHand: 12, reorderPoint: 5, orderUpTo: 25, leadTimeDays: 45, demandHistory: demandIntermittent, pattern: "intermittent" },
    { sku: "SKU-3003", name: "Packaging Film Roll", onHand: 890, reorderPoint: 500, orderUpTo: 1500, leadTimeDays: 7, demandHistory: [400, 950, 420, 980, 410, 960], pattern: "seasonal" },
  ]);

  const items = await db.select().from(s.inventoryItems);
  await seedTable("demandForecasts", s.demandForecasts, () => {
    return items.map((it) => {
      const fc = movingAverageForecast(it.demandHistory as number[], 6);
      const bias = forecastBiasPct(it.demandHistory as number[], (it.demandHistory as number[]).map(() => fc.p50));
      return {
        itemId: it.id,
        method: "moving-average",
        p50: String(fc.p50),
        p90: String(fc.p90),
        biasPct: String(bias),
      };
    });
  });

  await seedTable("qualityChecks", s.qualityChecks, () => [
    { line: "Assembly Line 2", metric: "weld-strength-n", value: "412.300", centerLine: "410.000", upperLimit: "430.000", lowerLimit: "390.000", violation: false },
    { line: "Assembly Line 2", metric: "weld-strength-n", value: "441.200", centerLine: "410.000", upperLimit: "430.000", lowerLimit: "390.000", violation: true },
    { line: "Packaging Line 1", metric: "seal-temp-c", value: "181.500", centerLine: "180.000", upperLimit: "186.000", lowerLimit: "174.000", violation: false },
  ]);

  await seedTable("decisionRecords", s.decisionRecords, () => [
    {
      question: "Should we raise the enterprise plan floor price for 2026?",
      options: ["Keep current pricing", "Raise floor 12%", "Raise floor 20% with grandfathering"],
      chosen: "Raise floor 12%",
      rationale: "Win-rate at current price is healthy (62%); matched-pair tests on a 12% increase in adjacent segments showed <3pt win-rate impact.",
      dissent: ["R. Alvarez: prefers grandfathering existing accounts for 6 months"],
      reviewDate: "2026-06-01",
    },
  ]);

  await seedTable("commentThreads", s.commentThreads, () => [
    { docRef: "revenue-forecast-2026-q1", quotedText: "p90 band looks too wide given recent accuracy", status: "open", participants: ["D. Osei", "M. Chen"] },
  ]);

  await seedTable("briefings", s.briefings, () => [
    {
      forUser: "D. Osei",
      trigger: "morning",
      items: [
        { kind: "forecast", content: "Q1 revenue forecast: $231k-$273k (80% interval)", priority: 1 },
        { kind: "churn-risk", content: "Globex Logistics churn probability now 72%, lead time 34 days", priority: 2 },
        { kind: "decision", content: "Pricing decision review due 2026-06-01", priority: 3 },
      ],
      readingTimeSec: 45,
      channel: "mobile",
    },
  ]);

  await seedTable("metricRegistry", s.metricRegistry, () => [
    { metricKey: "revenue.forecast.p50", route: "/revenue", formula: "moving-average(trailing 6 periods)", owner: "RevOps", honestyLabel: "estimated", lastReviewed: "2026-01-05" },
    { metricKey: "customer.health.score", route: "/customers", formula: "weighted-sum(adoption,engagement,support,outcome)", owner: "CS Ops", honestyLabel: "estimated", lastReviewed: "2026-01-05" },
    { metricKey: "customer.churn.probability", route: "/customers", formula: "logistic(50 - health_score / 12)", owner: "CS Ops", honestyLabel: "association", lastReviewed: "2026-01-05" },
    { metricKey: "finops.unit_cost.per_feature", route: "/finops", formula: "sum(cost_records.amount) group by feature", owner: "FinOps", honestyLabel: "measured", lastReviewed: "2026-01-05" },
  ]);

  await seedTable("modelCards", s.modelCards, () => [
    { name: "Health Score Weighted Model", kind: "ruleset", purpose: "Summarize account health from 4 weighted components", trainingData: "n/a (deterministic formula, not trained)", knownLimits: "Weights are fixed, not learned; should be recalibrated against observed churn quarterly.", owner: "CS Ops", lastReviewed: "2026-01-05" },
    { name: "Demand Moving-Average Forecaster", kind: "ruleset", purpose: "Short-horizon demand forecast per SKU", trainingData: "n/a (deterministic formula)", knownLimits: "Not suited to strongly seasonal or intermittent series without manual pattern override.", owner: "Ops", lastReviewed: "2026-01-05" },
  ]);

  await seedTable("appeals", s.appeals, () => [
    { subjectRef: "churn-warning:globex-logistics", challenger: "D. Osei", claim: "Churn driver attribution overweights one ticket spike", status: "open", resolution: "" },
  ]);

  await seedTable("extensions", s.extensions, () => [
    { name: "Jira Issue Sync", kind: "integration", capabilities: ["read:scope", "net:egress"], verified: "security", installCount: 3 },
    { name: "Compliance Rule Pack (SOC2 starter)", kind: "rule-pack", capabilities: ["read:scope"], verified: "security+quality", installCount: 7 },
    { name: "Procurement Workflow Template", kind: "workflow-template", capabilities: ["read:scope", "write:scope"], verified: "none", installCount: 1 },
  ]);

  await seedTable("onboardingMissions", s.onboardingMissions, () => [
    { role: "RevOps Lead", objective: "See your first calibrated forecast", steps: [{ action: "Open Revenue Operations", timeMin: 1 }, { action: "Review P10/P50/P90 band", timeMin: 2 }], completionRatePct: "74.00" },
    { role: "CS Manager", objective: "Identify your first at-risk account", steps: [{ action: "Open Customer Success", timeMin: 1 }, { action: "Open an at-risk account's explain drawer", timeMin: 2 }], completionRatePct: "61.00" },
  ]);

  await seedTable("adoptionFunnel", s.adoptionFunnel, () => [
    { stage: "signed-up", role: "RevOps Lead", n: 120, conversionPct: "100.00" },
    { stage: "activated", role: "RevOps Lead", n: 89, conversionPct: "74.20" },
    { stage: "habitual", role: "RevOps Lead", n: 52, conversionPct: "58.40" },
    { stage: "signed-up", role: "CS Manager", n: 95, conversionPct: "100.00" },
    { stage: "activated", role: "CS Manager", n: 58, conversionPct: "61.10" },
  ]);

  await seedTable("costRecords", s.costRecords, () => [
    { dimension: "llm", resource: "gpt-class-model", feature: "revenue-forecast-narrative", amountUsd: "14.2200" },
    { dimension: "llm", resource: "gpt-class-model", feature: "churn-driver-summary", amountUsd: "6.8100" },
    { dimension: "infra", resource: "postgres", feature: "platform", amountUsd: "42.0000" },
    { dimension: "infra", resource: "app-server", feature: "platform", amountUsd: "31.5000" },
  ]);

  await seedTable("sloDefinitions", s.sloDefinitions, () => [
    { name: "API availability", indicator: "availability", targetPct: "99.900", windowDays: 30, owner: "SRE" },
    { name: "API latency (p95 budget)", indicator: "latency", targetPct: "99.000", windowDays: 30, owner: "SRE" },
    { name: "Forecast freshness", indicator: "freshness", targetPct: "98.000", windowDays: 7, owner: "RevOps" },
  ]);
  const slos = await db.select().from(s.sloDefinitions);
  await seedTable("sloMeasurements", s.sloMeasurements, () =>
    slos.map((slo, i) => ({ sloId: slo.id, measuredPct: String([99.95, 98.70, 99.10][i] ?? 99.5) }))
  );

  await seedTable("securityFindings", s.securityFindings, () => [
    { severity: "medium", findingClass: "ai-prompt-injection", description: "Ingested VoC text could attempt to override system instructions via embedded directives.", status: "mitigated", slaDays: 14 },
    { severity: "low", findingClass: "supply-chain", description: "One transitive dependency pending minor version bump for advisory cleanup.", status: "open", slaDays: 30 },
  ]);

  await seedTable("privacyDataFields", s.privacyDataFields, () => [
    { tableName: "accounts", fieldName: "name", category: "identity", lawfulBasis: "contract", retentionDays: 1825, deletionMode: "anonymize" },
    { tableName: "voice_items", fieldName: "text", category: "behavior", lawfulBasis: "legitimate-interest", retentionDays: 730, deletionMode: "hard" },
    { tableName: "dsar_requests", fieldName: "subject_ref", category: "identity", lawfulBasis: "legal-obligation", retentionDays: 2555, deletionMode: "archive" },
  ]);

  await seedTable("dsarRequests", s.dsarRequests, () => [
    { kind: "export", subjectRef: "contact:jane.doe@northwind.example", status: "complete", dueDate: "2026-01-20", scope: ["accounts", "voice_items"] },
  ]);

  await seedTable("gateLedger", s.gateLedger, () => [
    { part: 92, gateId: "G-92-1", statement: "Forecast 80% interval coverage 72-88% over backtest", acceptThreshold: "72-88%", measuredValue: "seeded demo only - not yet backtested over 8 quarters", status: "unknown", dimension: "intelligence" },
    { part: 93, gateId: "G-93-1", statement: "Health top-vs-bottom quartile churn separation >= 3x", acceptThreshold: ">=3x", measuredValue: "not yet measured on held-out data", status: "unknown", dimension: "intelligence" },
    { part: 97, gateId: "G-97-1", statement: "Every surface metric resolves to a registry entry", acceptThreshold: "100%", measuredValue: "4 of 4 seeded metrics registered", status: "pass", dimension: "trust" },
    { part: 100, gateId: "G-100-1", statement: "Automated CI/CD pipeline with canary + rollback drill", acceptThreshold: "present & drilled monthly", measuredValue: "not implemented in this sandbox (no CI runner available)", status: "never-run", dimension: "reliability" },
    { part: 101, gateId: "G-101-1", statement: "IaC with environment parity across local/CI/staging/prod", acceptThreshold: "parity 100%", measuredValue: "single sandboxed environment only; no staging/prod split exists", status: "never-run", dimension: "reliability" },
    { part: 102, gateId: "G-102-1", statement: "SLOs tracked as executable, queryable data", acceptThreshold: ">=1 SLO measured", measuredValue: "3 SLOs defined, 3 measurements recorded", status: "pass", dimension: "reliability" },
    { part: 103, gateId: "G-103-1", statement: "Every cost record carries feature attribution", acceptThreshold: "100%", measuredValue: "4 of 4 seeded cost records attributed", status: "pass", dimension: "economics" },
    { part: 105, gateId: "G-105-1", statement: ">=60 pentest cases executed incl. >=15 AI-surface", acceptThreshold: ">=60 cases, >=15 AI-surface", measuredValue: "2 findings tracked manually; no automated pentest suite in this sandbox", status: "never-run", dimension: "security" },
    { part: 106, gateId: "G-106-1", statement: "Personal-data map covers >=40 fields with lawful basis", acceptThreshold: ">=40 fields", measuredValue: "3 of 40+ fields mapped in this demo seed", status: "fail", dimension: "privacy" },
  ]);

  return report;
}
