// POST /api/dev/seed  — (re)generates demo users + domain signals + drives
//                        them through the notification/attention pipeline so
//                        the cockpit and notification drawer have real data
//                        to show. Development/demo convenience only.
// DELETE /api/dev/seed — wipes all seeded/demo data for a clean slate (used
//                        by load/reconnect tests to start from zero).

import { db } from "@/db";
import {
  agentRuns,
  approvals,
  attentionBudget,
  attentionDecisions,
  comments,
  events,
  findings,
  metricAnomalies,
  notificationFeedback,
  notificationPreferences,
  notifications,
  presence,
  quietHours,
  tasks,
  userState,
  users,
} from "@/db/schema";
import { DEMO_USER_EMAIL, DEMO_USER_NAME } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { publishEvent } from "@/lib/eventBus";
import { eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

const EXTRA_USERS = [
  { name: "Alice Reviewer", email: "alice@leados.app" },
  { name: "Bob Analyst", email: "bob@leados.app" },
];

async function ensureUsers() {
  const emails = [DEMO_USER_EMAIL, ...EXTRA_USERS.map((u) => u.email)];
  const existing = await db.select().from(users).where(inArray(users.email, emails));
  const existingEmails = new Set(existing.map((u) => u.email));

  const toInsert = [{ name: DEMO_USER_NAME, email: DEMO_USER_EMAIL }, ...EXTRA_USERS].filter(
    (u) => !existingEmails.has(u.email),
  );
  if (toInsert.length > 0) {
    await db.insert(users).values(toInsert.map((u) => ({ ...u, timezone: "UTC" })));
  }
  return db.select().from(users).where(inArray(users.email, emails));
}

export async function DELETE() {
  await db.delete(attentionDecisions);
  await db.delete(notificationFeedback);
  await db.delete(notifications);
  await db.delete(events);
  await db.delete(comments);
  await db.delete(presence);
  await db.delete(attentionBudget);
  await db.delete(notificationPreferences);
  await db.delete(quietHours);
  await db.delete(userState);
  await db.delete(tasks);
  await db.delete(approvals);
  await db.delete(findings);
  await db.delete(metricAnomalies);
  await db.delete(agentRuns);
  await db.delete(users);
  return Response.json({ ok: true });
}

export async function POST() {
  const allUsers = await ensureUsers();
  const demo = allUsers.find((u) => u.email === DEMO_USER_EMAIL)!;
  const alice = allUsers.find((u) => u.email === "alice@leados.app")!;

  // Let severity-5 "security" interrupts through for the demo user so the
  // interrupt path is actually exercised end to end.
  await db
    .insert(notificationPreferences)
    .values({ userId: demo.id, domain: "security", channel: "in_app", enabled: true, allowInterrupt: true })
    .onConflictDoNothing();

  const [finding1] = await db
    .insert(findings)
    .values({
      title: "Unusual login pattern detected",
      domain: "security",
      severity: 5,
      summary: "12 failed logins from a new region within 3 minutes, followed by a success.",
      evidence: { ipRegion: "unknown-region", attempts: 12, windowSeconds: 180 },
    })
    .returning();

  const [finding2] = await db
    .insert(findings)
    .values({
      title: "Pipeline conversion dropped 18%",
      domain: "revenue",
      severity: 4,
      summary: "Week-over-week conversion on the enterprise funnel fell 18%, concentrated in EMEA.",
      evidence: { region: "EMEA", wowDeltaPct: -18 },
    })
    .returning();

  const [approval1] = await db
    .insert(approvals)
    .values({
      title: "Approve automated remediation: rotate exposed API key",
      domain: "security",
      severity: 5,
      status: "pending",
      entityType: "finding",
      entityId: finding1.id,
      requestedBy: "remediation-agent",
      evidence: { action: "rotate_key", risk: "low", blastRadius: "single-service" },
    })
    .returning();

  const [approval2] = await db
    .insert(approvals)
    .values({
      title: "Approve discount exception for enterprise renewal",
      domain: "revenue",
      severity: 3,
      status: "pending",
      entityType: "finding",
      entityId: finding2.id,
      requestedBy: "deal-desk-agent",
      evidence: { discountPct: 12, accountTier: "enterprise" },
    })
    .returning();

  const [task1] = await db
    .insert(tasks)
    .values({
      title: "Review EMEA funnel drop-off with growth team",
      domain: "revenue",
      severity: 3,
      status: "open",
      assigneeId: alice.id,
      dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    })
    .returning();

  const [anomaly1] = await db
    .insert(metricAnomalies)
    .values({
      metric: "api_error_rate",
      domain: "reliability",
      severity: 3,
      delta: "4.2",
      description: "API error rate is 4.2x the 7-day baseline on the payments service.",
    })
    .returning();

  const [run1] = await db
    .insert(agentRuns)
    .values({ agentName: "remediation-agent", domain: "security", status: "running", progress: 40 })
    .returning();

  // Drive each signal through the real notification + attention pipeline so
  // dedup / routing / explainability are all exercised with real data.
  await createNotification({
    userId: demo.id,
    type: "finding.created",
    domain: finding1.domain,
    severity: finding1.severity,
    title: finding1.title,
    body: finding1.summary,
    entityType: "finding",
    entityId: finding1.id,
    dedupKey: `finding:${finding1.id}`,
  });
  await createNotification({
    userId: demo.id,
    type: "finding.created",
    domain: finding2.domain,
    severity: finding2.severity,
    title: finding2.title,
    body: finding2.summary,
    entityType: "finding",
    entityId: finding2.id,
    dedupKey: `finding:${finding2.id}`,
  });
  await createNotification({
    userId: demo.id,
    type: "approval.pending",
    domain: approval1.domain,
    severity: approval1.severity,
    title: approval1.title,
    body: `Requested by ${approval1.requestedBy}`,
    entityType: "approval",
    entityId: approval1.id,
    dedupKey: `approval:${approval1.id}`,
  });
  await createNotification({
    userId: demo.id,
    type: "approval.pending",
    domain: approval2.domain,
    severity: approval2.severity,
    title: approval2.title,
    body: `Requested by ${approval2.requestedBy}`,
    entityType: "approval",
    entityId: approval2.id,
    dedupKey: `approval:${approval2.id}`,
  });
  await createNotification({
    userId: demo.id,
    type: "metric.anomaly",
    domain: anomaly1.domain,
    severity: anomaly1.severity,
    title: `${anomaly1.metric} anomaly`,
    body: anomaly1.description,
    entityType: "metric_anomaly",
    entityId: anomaly1.id,
    dedupKey: `anomaly:${anomaly1.metric}`,
  });

  await publishEvent({
    userId: demo.id,
    type: "agent_run.progress",
    domain: run1.domain,
    severity: 1,
    entityType: "agent_run",
    entityId: run1.id,
    payload: { agentName: run1.agentName, progress: run1.progress },
  });

  await publishEvent({
    userId: demo.id,
    type: "task.created",
    domain: task1.domain,
    severity: task1.severity,
    entityType: "task",
    entityId: task1.id,
    payload: { title: task1.title, assignee: alice.name },
  });

  return Response.json({
    ok: true,
    users: allUsers.map((u) => ({ id: u.id, name: u.name, email: u.email })),
    seeded: { findings: 2, approvals: 2, tasks: 1, anomalies: 1, agentRuns: 1 },
  });
}
