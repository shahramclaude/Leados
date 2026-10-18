import { db } from "@/db";
import {
  people,
  oneOnOnes,
  decisions,
  metricDefs,
  metricValues,
  events,
  rules,
  notifications,
  playbooks,
  insights,
  scenarios,
  settings,
  autonomousRuns,
  ruleEvaluations,
} from "@/db/schema";
import { evaluateRules } from "@/lib/engine";

const DAY = 86400000;

export async function clearAllData(): Promise<void> {
  await db.delete(ruleEvaluations);
  await db.delete(notifications);
  await db.delete(autonomousRuns);
  await db.delete(scenarios);
  await db.delete(insights);
  await db.delete(playbooks);
  await db.delete(metricValues);
  await db.delete(metricDefs);
  await db.delete(events);
  await db.delete(decisions);
  await db.delete(oneOnOnes);
  await db.delete(people);
  await db.delete(rules);
  await db.delete(settings);
}

export async function seedDemoData(): Promise<{ seeded: boolean }> {
  const existingPeople = await db.select().from(people).limit(1);
  if (existingPeople.length > 0) return { seeded: false };

  const now = Date.now();

  const [ceo] = await db
    .insert(people)
    .values({ name: "Alex Rivera", role: "CEO", team: "Leadership", startDate: new Date(now - 900 * DAY), lastOneOnOneAt: new Date(now - 3 * DAY) })
    .returning();
  const [cto] = await db
    .insert(people)
    .values({ name: "Priya Shah", role: "CTO", team: "Engineering", managerId: ceo.id, startDate: new Date(now - 800 * DAY), lastOneOnOneAt: new Date(now - 5 * DAY) })
    .returning();
  const [vpSales] = await db
    .insert(people)
    .values({ name: "Marcus Lee", role: "VP Sales", team: "Sales", managerId: ceo.id, startDate: new Date(now - 600 * DAY), lastOneOnOneAt: new Date(now - 25 * DAY) })
    .returning();
  const [vpProduct] = await db
    .insert(people)
    .values({ name: "Dana Kim", role: "VP Product", team: "Product", managerId: ceo.id, startDate: new Date(now - 500 * DAY), lastOneOnOneAt: new Date(now - 10 * DAY) })
    .returning();

  const engNames = ["Sam Okafor", "Jordan Blake", "Nina Petrova", "Tomás Reyes"];
  const engIds: number[] = [];
  for (const name of engNames) {
    const [p] = await db
      .insert(people)
      .values({
        name,
        role: "Software Engineer",
        team: "Engineering",
        managerId: cto.id,
        startDate: new Date(now - (200 + Math.random() * 300) * DAY),
        lastOneOnOneAt: new Date(now - Math.floor(Math.random() * 30) * DAY),
      })
      .returning();
    engIds.push(p.id);
  }

  const salesNames = ["Elena Cruz", "Will Thompson"];
  for (const name of salesNames) {
    await db.insert(people).values({
      name,
      role: "Account Executive",
      team: "Sales",
      managerId: vpSales.id,
      startDate: new Date(now - 150 * DAY),
      lastOneOnOneAt: new Date(now - 28 * DAY),
    });
  }

  const [pm] = await db
    .insert(people)
    .values({ name: "Harper Nguyen", role: "Product Manager", team: "Product", managerId: vpProduct.id, startDate: new Date(now - 300 * DAY), lastOneOnOneAt: new Date(now - 4 * DAY) })
    .returning();

  await db.insert(oneOnOnes).values([
    { personId: cto.id, occurredAt: new Date(now - 5 * DAY), notes: "Discussed infra scaling plan and on-call rotation fatigue.", sentiment: 1, actionItems: ["Draft on-call rotation v2", "Review infra budget"] },
    { personId: vpSales.id, occurredAt: new Date(now - 25 * DAY), notes: "Pipeline review, enterprise deal slipping.", sentiment: -1, actionItems: ["Follow up with enterprise prospect"] },
    { personId: pm.id, occurredAt: new Date(now - 4 * DAY), notes: "Roadmap prioritization for Q.", sentiment: 2, actionItems: [] },
  ]);

  await db.insert(decisions).values([
    { title: "Adopt usage-based pricing tier", description: "Introduce metered pricing for API usage above plan limits.", owner: "Alex Rivera", domain: "finance", status: "in_review", deadline: new Date(now - 2 * DAY), confidence: 65, impact: 5 },
    { title: "Hire second recruiter", description: "Scale hiring pipeline for engineering.", owner: "Priya Shah", domain: "people", status: "proposed", deadline: new Date(now + 3 * DAY), confidence: 55, impact: 3 },
    { title: "Migrate to new CI provider", description: "Reduce build times and flakiness.", owner: "Priya Shah", domain: "execution", status: "decided", deadline: new Date(now - 20 * DAY), decidedAt: new Date(now - 18 * DAY), confidence: 80, outcomeSuccess: true, impact: 2, createdAt: new Date(now - 40 * DAY) },
    { title: "Expand into EU market", description: "Open EU entity and localize product.", owner: "Marcus Lee", domain: "product", status: "decided", deadline: new Date(now - 60 * DAY), decidedAt: new Date(now - 55 * DAY), confidence: 70, outcomeSuccess: false, impact: 5, createdAt: new Date(now - 90 * DAY) },
    { title: "Sunset legacy API v1", description: "Deprecate v1 endpoints in favor of v2.", owner: "Dana Kim", domain: "product", status: "proposed", deadline: new Date(now + 6 * DAY), confidence: 60, impact: 3 },
  ]);

  const metricDefinitions: Array<{ key: string; label: string; domain: string; unit: string; target: string; benchmark: string; direction: string }> = [
    { key: "mrr", label: "Monthly Recurring Revenue", domain: "finance", unit: "$", target: "480000", benchmark: "450000", direction: "higher_better" },
    { key: "churn", label: "Monthly Churn Rate", domain: "finance", unit: "%", target: "2", benchmark: "3", direction: "lower_better" },
    { key: "nps", label: "Net Promoter Score", domain: "culture", unit: "pts", target: "45", benchmark: "40", direction: "higher_better" },
    { key: "deploy_freq", label: "Deploy Frequency", domain: "execution", unit: "/week", target: "20", benchmark: "15", direction: "higher_better" },
    { key: "runway_months", label: "Runway", domain: "finance", unit: "months", target: "18", benchmark: "12", direction: "higher_better" },
  ];
  for (const def of metricDefinitions) {
    await db.insert(metricDefs).values(def);
    const base = parseFloat(def.target);
    for (let i = 11; i >= 0; i--) {
      const noise = (Math.random() - 0.5) * base * 0.1;
      const drift = def.direction === "higher_better" ? -i * base * 0.01 : i * base * 0.01;
      const value = Math.max(0, base + drift + noise);
      await db.insert(metricValues).values({
        metricKey: def.key,
        value: String(Math.round(value * 100) / 100),
        recordedAt: new Date(now - i * 7 * DAY),
      });
    }
  }

  await db.insert(events).values([
    { type: "incident", domain: "execution", severity: 4, title: "Checkout latency spike", description: "p95 latency exceeded 2s for 40 minutes.", createdAt: new Date(now - 1 * DAY), status: "open", source: "pagerduty" },
    { type: "incident", domain: "risk", severity: 5, title: "Vendor data processing agreement expired", description: "DPA with analytics vendor lapsed; legal exposure.", createdAt: new Date(now - 2 * DAY), status: "open", source: "legal" },
    { type: "feedback", domain: "product", severity: 2, title: "Customer feedback: onboarding confusing", description: "Three enterprise customers flagged onboarding flow as unclear.", createdAt: new Date(now - 6 * DAY), status: "open", source: "csat" },
    { type: "note", domain: "culture", severity: 1, title: "Positive feedback on hackathon", description: "Team enjoyed the Q hackathon event.", createdAt: new Date(now - 10 * DAY), status: "resolved", source: "manual" },
  ]);

  const ruleDefs: Array<{ key: string; name: string; domain: string; weight: string; description: string }> = [
    { key: "r_people_1on1_cadence", name: "1:1 Cadence Health", domain: "people", weight: "1.2", description: "Flags managers whose reports haven't had a 1:1 in 21+ days." },
    { key: "r_people_span", name: "Span of Control", domain: "people", weight: "0.8", description: "Flags managers with too many or too few direct reports." },
    { key: "r_decisions_overdue", name: "Decision Overdue Rate", domain: "decisions", weight: "1.5", description: "Flags decisions past their deadline." },
    { key: "r_decisions_calibration", name: "Decision Calibration", domain: "decisions", weight: "1.0", description: "Flags poor calibration between confidence and outcome." },
    { key: "r_metrics_drift", name: "Metric Target Drift", domain: "metrics", weight: "1.3", description: "Flags metrics deviating >20% from target." },
    { key: "r_execution_incidents", name: "Execution Incident Rate", domain: "execution", weight: "1.4", description: "Flags open execution incidents." },
    { key: "r_finance_runway", name: "Runway Health", domain: "finance", weight: "1.6", description: "Flags runway below 12 months." },
    { key: "r_product_feedback", name: "Product Feedback Volume", domain: "product", weight: "1.0", description: "Flags spikes in negative product feedback." },
    { key: "r_culture_sentiment", name: "Culture Sentiment", domain: "culture", weight: "1.0", description: "Flags declining sentiment trends in 1:1s." },
    { key: "r_risk_open_items", name: "Open Risk Items", domain: "risk", weight: "1.8", description: "Flags unresolved high-severity risk events." },
  ];
  await db.insert(rules).values(ruleDefs);

  await db.insert(playbooks).values([
    { name: "Churn Spike Response", description: "Standard playbook when monthly churn exceeds target by >15%.", domain: "finance", dueDate: new Date(now + 5 * DAY), status: "pending", steps: [{ text: "Pull churned-account exit interviews", done: false }, { text: "Segment churn by cohort", done: false }, { text: "Propose retention offer", done: false }] },
    { name: "Incident Postmortem: Checkout Latency", description: "Run blameless postmortem for the checkout latency incident.", domain: "execution", dueDate: new Date(now + 2 * DAY), status: "active", steps: [{ text: "Collect timeline", done: true }, { text: "Identify root cause", done: false }, { text: "Publish postmortem doc", done: false }] },
    { name: "Manager Reconnect Sprint", description: "Get all overdue 1:1s scheduled within 5 business days.", domain: "people", dueDate: new Date(now + 5 * DAY), status: "pending", steps: [{ text: "List overdue reports", done: true }, { text: "Send calendar holds", done: false }] },
  ]);

  await db.insert(insights).values([
    { title: "Enterprise deals slip when legal review starts late", body: "Across the last 6 decided enterprise deals, those where legal review started <10 days before close slipped 80% of the time.", domain: "decisions", tags: ["sales", "legal", "pattern"] },
    { title: "On-call fatigue correlates with deploy frequency drops", body: "Weeks following a sev4+ incident show a 30% drop in deploy frequency the following week.", domain: "execution", tags: ["incidents", "velocity"] },
    { title: "1:1 cadence drift precedes regretted attrition", body: "In 2 of the last 3 regretted departures, the departing person's 1:1 cadence had slipped past 21 days in the preceding month.", domain: "people", tags: ["retention"] },
  ]);

  await db.insert(scenarios).values([
    {
      name: "Hiring freeze impact on runway",
      assumptions: { headcountDelta: -2, monthlyBurnDelta: -24000, months: 12 },
      results: { projectedRunwayMonths: 21, projectedMrrDelta: -15000 },
    },
  ]);

  await db.insert(settings).values({
    id: 1,
    orgName: "Northwind Labs",
    industry: "saas",
    stage: "series-a",
    teamSize: 9,
    notificationPrefs: {
      people: { enabled: true, minSeverity: 2 },
      decisions: { enabled: true, minSeverity: 2 },
      metrics: { enabled: true, minSeverity: 3 },
      execution: { enabled: true, minSeverity: 3 },
      finance: { enabled: true, minSeverity: 2 },
      product: { enabled: true, minSeverity: 2 },
      culture: { enabled: true, minSeverity: 2 },
      risk: { enabled: true, minSeverity: 1 },
    },
    autonomousEnabled: true,
    autonomousIntervalMinutes: 30,
  });

  await db.insert(autonomousRuns).values({
    startedAt: new Date(now - 60 * 60 * 1000),
    finishedAt: new Date(now - 60 * 60 * 1000 + 4000),
    status: "success",
    summary: "Seed-time baseline evaluation.",
    findingsCount: 0,
  });

  await evaluateRules();

  await db.insert(notifications).values([
    { title: "Vendor DPA expired", message: "The analytics vendor DPA lapsed 2 days ago — legal exposure.", severity: 5, domain: "risk", read: false },
    { title: "Checkout latency incident", message: "p95 latency exceeded 2s for 40 minutes yesterday.", severity: 4, domain: "execution", read: false },
    { title: "Decision overdue", message: "\"Adopt usage-based pricing tier\" is past its deadline.", severity: 4, domain: "decisions", read: false },
    { title: "1:1 overdue", message: "Marcus Lee hasn't had a 1:1 in 25 days.", severity: 3, domain: "people", read: true },
  ]);

  return { seeded: true };
}
