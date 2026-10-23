import { db } from "@/db";
import { eq } from "drizzle-orm";
import {
  authorityRights,
  capacityTwin,
  commitments,
  decisions,
  growthGoals,
  interruptBudget,
  meetingArtifacts,
  metricSeries,
  oneOnOnes,
  people,
} from "@/db/schema";
import { defaultRightsRules } from "@/lib/authorityRights";
import { ensureActionClasses } from "./autonomyRepo";

export async function seedDemoData() {
  const existingPeople = await db.select().from(people);
  if (existingPeople.length > 0) {
    return { seeded: false, reason: "data already present" };
  }

  await ensureActionClasses();

  const [amara, ben, cara, dev, elin] = await db
    .insert(people)
    .values([
      { name: "Amara Chen", role: "manager", team: "Platform", email: "amara@leados.dev", powerLevel: 3 },
      { name: "Ben Osei", role: "ic", team: "Platform", email: "ben@leados.dev", powerLevel: 5 },
      { name: "Cara Lindqvist", role: "ic", team: "Platform", email: "cara@leados.dev", powerLevel: 5 },
      { name: "Dev Patel", role: "director", team: "Platform", email: "dev@leados.dev", powerLevel: 1 },
      { name: "Elin Haas", role: "ic", team: "Growth", email: "elin@leados.dev", powerLevel: 5 },
    ])
    .returning();

  // Simple manager wiring: Amara reports to Dev; Ben/Cara report to Amara.
  await db.update(people).set({ managerId: dev.id }).where(eq(people.id, amara.id));
  await db.update(people).set({ managerId: amara.id }).where(eq(people.id, ben.id));
  await db.update(people).set({ managerId: amara.id }).where(eq(people.id, cara.id));

  await db.insert(authorityRights).values(defaultRightsRules());

  const now = new Date();
  const soon = new Date(now.getTime() + 20 * 60 * 60 * 1000);
  const overdue = new Date(now.getTime() - 26 * 60 * 60 * 1000);
  const future = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

  await db.insert(commitments).values([
    { promisorId: ben.id, promiseeId: amara.id, content: "Send the vendor contract redlines", dueAt: overdue, context: { sourceType: "manual", surface: "seed" }, status: "open", confirmed: true },
    { promisorId: cara.id, promiseeId: amara.id, content: "Finish the migration dry-run", dueAt: soon, context: { sourceType: "manual", surface: "seed" }, status: "open", confirmed: true },
    { promisorId: amara.id, promiseeId: dev.id, content: "Review the Q2 staffing plan", dueAt: future, context: { sourceType: "manual", surface: "seed" }, status: "open", confirmed: true },
    { promisorId: elin.id, promiseeId: amara.id, content: "Share growth funnel numbers", dueAt: future, context: { sourceType: "manual", surface: "seed" }, status: "kept", confirmed: true },
  ]);

  await db.insert(decisions).values([
    { title: "Pick the new logging vendor", ownerId: amara.id, status: "stagnating", lastActivityAt: new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000) },
    { title: "Approve Q2 headcount", ownerId: dev.id, status: "active", lastActivityAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000) },
  ]);

  await db.insert(meetingArtifacts).values([
    {
      title: "Platform weekly sync",
      ownerId: amara.id,
      transcriptExcerpt: "Discussed migration risk and vendor options.",
      actionItems: [
        { text: "Ben will send the vendor contract by " + overdue.toISOString().slice(0, 10), promisorName: "Ben Osei", promiseeName: "Amara Chen", dueAtIso: overdue.toISOString().slice(0, 10) },
      ],
      occurredAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
    },
    {
      title: "Growth standup",
      ownerId: elin.id,
      transcriptExcerpt: "Quick status round, no decisions made.",
      actionItems: [],
      occurredAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
    },
  ]);

  await db.insert(oneOnOnes).values([
    {
      managerId: amara.id,
      reportId: cara.id,
      notes: "Talked about migration timeline and growth areas.",
      commitmentsRaw: [
        { text: "Cara commits to finishing the migration script by " + future.toISOString().slice(0, 10), promisorName: "Cara Lindqvist", promiseeName: "Amara Chen", dueAtIso: future.toISOString().slice(0, 10) },
      ],
      occurredAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
    },
  ]);

  await db.insert(capacityTwin).values([
    { personId: ben.id, weekOf: now.toISOString().slice(0, 10), allocatedHours: 32, capacityHours: 40 },
    { personId: cara.id, weekOf: now.toISOString().slice(0, 10), allocatedHours: 38, capacityHours: 40 },
    { personId: elin.id, weekOf: now.toISOString().slice(0, 10), allocatedHours: 20, capacityHours: 40 },
    { personId: amara.id, weekOf: now.toISOString().slice(0, 10), allocatedHours: 25, capacityHours: 40 },
  ]);

  await db.insert(growthGoals).values([
    { personId: ben.id, goalLabel: "Grow into tech lead", relatedSkillTags: ["architecture", "mentoring"] },
    { personId: cara.id, goalLabel: "Build vendor negotiation skills", relatedSkillTags: ["vendor_management", "negotiation"] },
  ]);

  await db.insert(metricSeries).values([
    { metricKey: "platform.uptime_pct", ownerId: amara.id, value: 97.5, target: 99.9 },
    { metricKey: "growth.signup_rate", ownerId: elin.id, value: 4.2, target: 4.0 },
  ]);

  return { seeded: true };
}
