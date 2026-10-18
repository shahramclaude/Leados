// src/lib/seedOrgData.ts
// -----------------------------------------------------------------------
// Demo organizational data + the pipeline that turns it into the knowledge
// graph. Not one of the explicitly requested deliverables, but required so
// the Memory & Knowledge view has real, pattern-rich data to show: a causal
// cycle, a multi-step causal chain, a mutually-connected cluster, and an
// isolated high-severity finding — all generated through the same
// autoIngestEvent pipeline a live system would use.
// -----------------------------------------------------------------------
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  leadosPeople,
  leadosMetrics,
  leadosFindings,
  leadosPlaybooks,
  leadosPlaybookRuns,
  leadosInsights,
} from "@/db/schema";
import {
  addEdge,
  autoIngestEvent,
  detectPatterns,
  generateInsight,
  loadGraph,
  type GraphSubgraph,
  type MemoryNode,
  type OrgEventInput,
} from "./knowledgeGraph";

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function findNode(graph: GraphSubgraph, type: MemoryNode["type"], entityId: string): MemoryNode {
  const node = graph.nodes.find((n) => n.type === type && n.entityId === entityId);
  if (!node) throw new Error(`Seed error: expected node ${type}:${entityId} to exist`);
  return node;
}

export async function ensureSeeded(): Promise<void> {
  const existingPeople = await db.select({ count: sql<number>`count(*)` }).from(leadosPeople);
  if (Number(existingPeople[0]?.count ?? 0) > 0) return;

  // --- 1. Supporting org entities -----------------------------------------
  const [alice] = await db.insert(leadosPeople).values({ name: "Alice Chen", role: "CEO", domain: "People" }).returning();
  const [bob] = await db.insert(leadosPeople).values({ name: "Bob Okafor", role: "CFO", domain: "Finance" }).returning();
  const [carol] = await db.insert(leadosPeople).values({ name: "Carol Ibanez", role: "VP Sales", domain: "Sales" }).returning();
  const [dana] = await db.insert(leadosPeople).values({ name: "Dana Kim", role: "Eng Lead", domain: "Product" }).returning();

  await db.insert(leadosMetrics).values([
    { name: "burn_rate", domain: "Finance", value: 480000, unit: "USD/mo", trend: "up" },
    { name: "win_rate", domain: "Sales", value: 0.22, unit: "ratio", trend: "down" },
    { name: "cac", domain: "Sales", value: 2400, unit: "USD", trend: "up" },
    { name: "nps_score", domain: "Product", value: 38, unit: "score", trend: "flat" },
    { name: "attrition_90d", domain: "People", value: 3, unit: "count", trend: "up" },
  ]);

  const [findingBurn] = await db
    .insert(leadosFindings)
    .values({ title: "Burn rate exceeds plan", domain: "Finance", severity: 5, status: "open", personId: bob.id, metricRef: "burn_rate", ruleId: "burn_rate_high" })
    .returning();
  const [findingWinRate] = await db
    .insert(leadosFindings)
    .values({ title: "Sales win rate declining", domain: "Sales", severity: 4, status: "open", personId: carol.id, metricRef: "win_rate", ruleId: "win_rate_drop" })
    .returning();
  const [findingBacklog] = await db
    .insert(leadosFindings)
    .values({ title: "Support ticket backlog growing", domain: "Product", severity: 3, status: "open", personId: dana.id, ruleId: "support_backlog" })
    .returning();
  const [findingFlightRisk] = await db
    .insert(leadosFindings)
    .values({ title: "Key engineer flight risk", domain: "People", severity: 5, status: "open", personId: alice.id })
    .returning();

  const [pbCash] = await db
    .insert(leadosPlaybooks)
    .values({
      name: "Cash Conservation Playbook",
      domain: "Finance",
      triggerRule: "burn_rate_high",
      steps: ["Freeze non-essential hiring", "Renegotiate top 5 vendor contracts", "Review discretionary spend", "Report runway to board"],
      successRate: 0.78,
    })
    .returning();
  const [pbWinRate] = await db
    .insert(leadosPlaybooks)
    .values({
      name: "Win Rate Recovery Playbook",
      domain: "Sales",
      triggerRule: "win_rate_drop",
      steps: ["Audit lost-deal call recordings", "Retrain on new objection handling", "Adjust competitive pricing", "Re-run win/loss analysis"],
      successRate: 0.42,
    })
    .returning();
  const [pbBacklog] = await db
    .insert(leadosPlaybooks)
    .values({
      name: "Support Backlog Triage",
      domain: "Product",
      triggerRule: "support_backlog",
      steps: ["Triage by severity", "Pull in rotating on-call engineer", "Publish customer-facing status update"],
      successRate: 0.65,
    })
    .returning();

  // --- 2. Ingest a realistic organizational event timeline ----------------
  const graph = await loadGraph();

  const events: OrgEventInput[] = [
    {
      id: "ev-metric-burn-1",
      type: "metric.updated",
      domain: "Finance",
      title: "Burn rate updated",
      summary: "Monthly burn rose to $480k against a $400k plan.",
      personId: bob.id,
      personName: bob.name,
      metricRef: "burn_rate",
      metricValue: 480000,
      occurredAt: daysAgo(20),
    },
    {
      id: "ev-finding-burn",
      type: "finding.created",
      domain: "Finance",
      title: findingBurn.title,
      summary: "Burn rate is 20% over plan for the second straight month.",
      personId: bob.id,
      personName: bob.name,
      metricRef: "burn_rate",
      severity: findingBurn.severity,
      findingId: findingBurn.id,
      occurredAt: daysAgo(19),
    },
    {
      id: "ev-decision-freeze",
      type: "decision.logged",
      domain: "Finance",
      title: "Freeze non-essential hiring",
      summary: "Hiring freeze on all non-revenue roles to protect runway.",
      personId: bob.id,
      personName: bob.name,
      metricRef: "burn_rate",
      decisionId: 1001,
      occurredAt: daysAgo(18),
    },
    {
      id: "ev-finding-burn-resolved",
      type: "finding.resolved",
      domain: "Finance",
      title: findingBurn.title,
      summary: "Hiring freeze brought projected burn back within 5% of plan.",
      personId: bob.id,
      findingId: findingBurn.id,
      decisionId: 1001,
      decisionTitle: "Freeze non-essential hiring",
      occurredAt: daysAgo(17),
    },
    {
      id: "ev-playbook-cash-triggered",
      type: "playbook.triggered",
      domain: "Finance",
      title: pbCash.name,
      summary: "Cash Conservation Playbook executed in response to burn-rate finding.",
      personId: bob.id,
      personName: bob.name,
      playbookId: pbCash.id,
      playbookName: pbCash.name,
      findingId: findingBurn.id,
      findingTitle: findingBurn.title,
      occurredAt: daysAgo(18),
    },
    {
      id: "ev-playbook-cash-completed",
      type: "playbook.completed",
      domain: "Finance",
      title: pbCash.name,
      summary: "All 4 steps of the Cash Conservation Playbook completed.",
      playbookId: pbCash.id,
      playbookName: pbCash.name,
      findingId: findingBurn.id,
      findingTitle: findingBurn.title,
      occurredAt: daysAgo(16),
    },
    {
      id: "ev-metric-cac",
      type: "metric.updated",
      domain: "Sales",
      title: "CAC updated",
      summary: "Customer acquisition cost climbed to $2,400.",
      personId: carol.id,
      personName: carol.name,
      metricRef: "cac",
      metricValue: 2400,
      tags: ["up"],
      occurredAt: daysAgo(12),
    },
    {
      id: "ev-decision-pause-ads",
      type: "decision.logged",
      domain: "Sales",
      title: "Pause paid ads",
      summary: "Paused paid acquisition channels after CAC spiked above target.",
      personId: carol.id,
      personName: carol.name,
      metricRef: "cac",
      decisionId: 1002,
      occurredAt: daysAgo(11),
    },
    {
      id: "ev-finding-lead-drop",
      type: "finding.created",
      domain: "Sales",
      title: "Lead volume dropped",
      summary: "Inbound lead volume fell 35% after paid ads were paused.",
      personId: carol.id,
      personName: carol.name,
      severity: 4,
      findingId: 2001,
      occurredAt: daysAgo(10),
    },
    {
      id: "ev-decision-content",
      type: "decision.logged",
      domain: "Sales",
      title: "Increase content marketing investment",
      summary: "Shifted budget from paid ads into organic content to rebuild pipeline.",
      personId: carol.id,
      personName: carol.name,
      decisionId: 1003,
      occurredAt: daysAgo(9),
    },
    {
      id: "ev-finding-content-recovering",
      type: "finding.created",
      domain: "Sales",
      title: "Content pipeline recovering",
      summary: "Organic lead volume up 18% since the content investment began.",
      personId: carol.id,
      personName: carol.name,
      severity: 2,
      findingId: 2002,
      occurredAt: daysAgo(7),
    },
    {
      id: "ev-metric-winrate",
      type: "metric.updated",
      domain: "Sales",
      title: "Win rate updated",
      summary: "Win rate slipped to 22%, down from a 31% quarterly target.",
      personId: carol.id,
      personName: carol.name,
      metricRef: "win_rate",
      metricValue: 0.22,
      tags: ["down"],
      occurredAt: daysAgo(16),
    },
    {
      id: "ev-finding-winrate",
      type: "finding.created",
      domain: "Sales",
      title: findingWinRate.title,
      summary: "Win rate has declined for three consecutive months.",
      personId: carol.id,
      personName: carol.name,
      metricRef: "win_rate",
      severity: findingWinRate.severity,
      findingId: findingWinRate.id,
      occurredAt: daysAgo(15),
    },
    {
      id: "ev-playbook-winrate-triggered",
      type: "playbook.triggered",
      domain: "Sales",
      title: pbWinRate.name,
      summary: "Win Rate Recovery Playbook triggered but has a weak track record.",
      personId: carol.id,
      personName: carol.name,
      playbookId: pbWinRate.id,
      playbookName: pbWinRate.name,
      findingId: findingWinRate.id,
      findingTitle: findingWinRate.title,
      occurredAt: daysAgo(14),
    },
    {
      id: "ev-finding-pipeline-drought",
      type: "finding.created",
      domain: "Sales",
      title: "Pipeline drought",
      summary: "New qualified pipeline fell to a 6-month low.",
      personId: carol.id,
      personName: carol.name,
      severity: 4,
      findingId: 3001,
      occurredAt: daysAgo(13),
    },
    {
      id: "ev-decision-emergency-push",
      type: "decision.logged",
      domain: "Sales",
      title: "Emergency outbound push",
      summary: "Ordered an all-hands outbound sprint to refill pipeline fast.",
      personId: carol.id,
      personName: carol.name,
      decisionId: 1004,
      occurredAt: daysAgo(13),
    },
    {
      id: "ev-finding-burnout",
      type: "finding.created",
      domain: "Sales",
      title: "Sales team burnout",
      summary: "Attrition risk flagged after a 2-week forced outbound sprint.",
      personId: carol.id,
      personName: carol.name,
      severity: 4,
      findingId: 3002,
      occurredAt: daysAgo(12),
    },
    {
      id: "ev-finding-backlog",
      type: "finding.created",
      domain: "Product",
      title: findingBacklog.title,
      summary: "Open support tickets up 40% week-over-week.",
      personId: dana.id,
      personName: dana.name,
      severity: findingBacklog.severity,
      findingId: findingBacklog.id,
      occurredAt: daysAgo(8),
    },
    {
      id: "ev-playbook-backlog-triggered",
      type: "playbook.triggered",
      domain: "Product",
      title: pbBacklog.name,
      summary: "Support Backlog Triage playbook executed.",
      personId: dana.id,
      personName: dana.name,
      playbookId: pbBacklog.id,
      playbookName: pbBacklog.name,
      findingId: findingBacklog.id,
      findingTitle: findingBacklog.title,
      occurredAt: daysAgo(7),
    },
    {
      id: "ev-playbook-backlog-completed",
      type: "playbook.completed",
      domain: "Product",
      title: pbBacklog.name,
      summary: "Backlog triaged and status page published.",
      playbookId: pbBacklog.id,
      playbookName: pbBacklog.name,
      findingId: findingBacklog.id,
      findingTitle: findingBacklog.title,
      occurredAt: daysAgo(6),
    },
    {
      id: "ev-finding-flight-risk",
      type: "finding.created",
      domain: "People",
      title: findingFlightRisk.title,
      summary: "A senior engineer signaled intent to leave; no retention plan yet exists.",
      personId: alice.id,
      personName: alice.name,
      severity: findingFlightRisk.severity,
      findingId: findingFlightRisk.id,
      occurredAt: daysAgo(6),
    },
    {
      id: "ev-decision-offsite",
      type: "decision.logged",
      domain: "People",
      title: "Quarterly planning offsite",
      summary: "Leadership team met to align Q3 priorities across functions.",
      personId: alice.id,
      personName: alice.name,
      decisionId: 1005,
      occurredAt: daysAgo(5),
    },
  ];

  for (const event of events) {
    await autoIngestEvent(event, graph);
  }

  // --- 3. Manual edges: explicit causal links the ingestion pipeline
  //        doesn't infer on its own (decision->finding, finding->finding),
  //        plus the cross-functional collaboration cluster. ----------------
  const decisionPauseAds = findNode(graph, "decision", "1002");
  const findingLeadDrop = findNode(graph, "finding", "2001");
  const decisionContent = findNode(graph, "decision", "1003");
  const findingContentRecovering = findNode(graph, "finding", "2002");
  const findingPipelineDrought = findNode(graph, "finding", "3001");
  const decisionEmergencyPush = findNode(graph, "decision", "1004");
  const findingBurnout = findNode(graph, "finding", "3002");

  await addEdge(decisionPauseAds.id, findingLeadDrop.id, "caused", 0.9, "Pausing paid ads directly cut inbound lead volume.");
  await addEdge(findingLeadDrop.id, decisionContent.id, "caused", 0.85, "The lead drop forced a pivot to content marketing investment.");
  await addEdge(decisionContent.id, findingContentRecovering.id, "caused", 0.8, "Content investment began recovering the pipeline.");

  // Closed causal loop: drought -> emergency push -> burnout -> drought again
  await addEdge(findingPipelineDrought.id, decisionEmergencyPush.id, "caused", 0.9, "Pipeline drought forced an emergency outbound push.");
  await addEdge(decisionEmergencyPush.id, findingBurnout.id, "caused", 0.8, "The forced outbound sprint burned out the sales team.");
  await addEdge(findingBurnout.id, findingPipelineDrought.id, "caused", 0.7, "Burnout reduced selling capacity, reopening the pipeline drought.");

  const personAlice = findNode(graph, "person", String(alice.id));
  const personBob = findNode(graph, "person", String(bob.id));
  const personCarol = findNode(graph, "person", String(carol.id));
  const decisionOffsite = findNode(graph, "decision", "1005");

  await addEdge(personAlice.id, personBob.id, "informed", 1, "Collaborated in the Q3 planning offsite.");
  await addEdge(personAlice.id, personCarol.id, "informed", 1, "Collaborated in the Q3 planning offsite.");
  await addEdge(personBob.id, personCarol.id, "informed", 1, "Collaborated in the Q3 planning offsite.");
  await addEdge(personBob.id, decisionOffsite.id, "informed", 1, "Contributed finance input to the Q3 planning offsite.");
  await addEdge(personCarol.id, decisionOffsite.id, "informed", 1, "Contributed sales input to the Q3 planning offsite.");

  // --- 4. Playbook run history (for effectiveness reporting) --------------
  await db.insert(leadosPlaybookRuns).values([
    {
      playbookId: pbCash.id,
      triggeredBy: "burn_rate_high",
      personId: bob.id,
      status: "completed",
      stepsTotal: 4,
      stepsDone: 4,
      outcomeScore: 0.9,
      notes: "Hiring freeze + vendor renegotiation brought burn back to plan.",
      startedAt: daysAgo(18),
      completedAt: daysAgo(16),
    },
    {
      playbookId: pbCash.id,
      triggeredBy: "burn_rate_high",
      personId: bob.id,
      status: "completed",
      stepsTotal: 4,
      stepsDone: 3,
      outcomeScore: 0.8,
      notes: "Ran a lighter version of the playbook last quarter; mostly effective.",
      startedAt: daysAgo(95),
      completedAt: daysAgo(90),
    },
    {
      playbookId: pbWinRate.id,
      triggeredBy: "win_rate_drop",
      personId: carol.id,
      status: "completed",
      stepsTotal: 4,
      stepsDone: 3,
      outcomeScore: 0.3,
      notes: "Objection-handling retraining ran, but win rate barely moved.",
      startedAt: daysAgo(14),
      completedAt: daysAgo(8),
    },
    {
      playbookId: pbWinRate.id,
      triggeredBy: "win_rate_drop",
      personId: carol.id,
      status: "abandoned",
      stepsTotal: 4,
      stepsDone: 1,
      outcomeScore: 0.1,
      notes: "Abandoned after lost-deal audit surfaced pricing, not messaging, as the issue.",
      startedAt: daysAgo(60),
      completedAt: null,
    },
    {
      playbookId: pbBacklog.id,
      triggeredBy: "support_backlog",
      personId: dana.id,
      status: "completed",
      stepsTotal: 3,
      stepsDone: 3,
      outcomeScore: 0.7,
      notes: "Backlog cleared within 24 hours.",
      startedAt: daysAgo(7),
      completedAt: daysAgo(6),
    },
  ]);

  // --- 5. Pattern detection -> insights ------------------------------------
  await refreshInsights();
}

/** Re-run pattern detection over the current graph and persist any new insights. */
export async function refreshInsights(): Promise<number> {
  const graph = await loadGraph();
  const patterns = detectPatterns(graph);
  const existing = await db.select({ title: leadosInsights.title }).from(leadosInsights);
  const existingTitles = new Set(existing.map((e) => e.title));

  let inserted = 0;
  for (const pattern of patterns) {
    const insight = generateInsight(pattern);
    if (existingTitles.has(insight.title)) continue;
    await db.insert(leadosInsights).values({
      type: insight.type,
      title: insight.title,
      body: insight.body,
      sourceNodes: insight.sourceNodes,
      confidence: insight.confidence,
      status: "new",
    });
    existingTitles.add(insight.title);
    inserted++;
  }
  return inserted;
}
