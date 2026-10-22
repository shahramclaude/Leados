// LEADOS — Part 38 / Part 14 compatibility shim: notification delivery.
//
// Real Part 14 is expected to fan these out to email/Slack/in-app. Here we
// just durably record the notification (so the UI and tests have something
// real to assert against) and mark it delivered. No external network calls
// are made — documented in Blind Spots as "delivery to humans is simulated".

import { db } from "@/db";
import { findings, notifications } from "@/db/schema";

export async function createFinding(input: {
  checkId?: string;
  source: string;
  severity: "info" | "warn" | "high" | "critical";
  title: string;
  description: string;
}) {
  const [finding] = await db
    .insert(findings)
    .values({
      checkId: input.checkId,
      source: input.source,
      severity: input.severity,
      title: input.title,
      description: input.description,
      status: "open",
    })
    .returning();
  return finding;
}

export async function notify(input: {
  channel?: string;
  severity: string;
  title: string;
  body: string;
  findingId?: number;
}) {
  const [row] = await db
    .insert(notifications)
    .values({
      channel: input.channel ?? "ops",
      severity: input.severity,
      title: input.title,
      body: input.body,
      findingId: input.findingId,
      deliveredAt: new Date(),
    })
    .returning();
  return row;
}

export async function escalate(input: {
  checkId: string;
  severity: "high" | "critical";
  title: string;
  description: string;
}) {
  const finding = await createFinding({
    checkId: input.checkId,
    source: "assurance-system",
    severity: input.severity,
    title: input.title,
    description: input.description,
  });
  const note = await notify({
    severity: input.severity,
    title: input.title,
    body: input.description,
    findingId: finding.id,
  });
  return { finding, notification: note };
}
