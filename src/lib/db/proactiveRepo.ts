import { db } from "@/db";
import {
  cadenceTicks,
  commitments,
  decisions,
  delegations,
  interruptBudget,
  meetingArtifacts,
  metricSeries,
  proactiveDrafts,
} from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { detectAllMoments, queueWithBudget } from "@/lib/proactiveDraftEngine";
import { canAutoSend } from "@/lib/autonomyKernel";
import { audit, getActionClassByKey, getGrant, recordClassOutcome, toActionClass } from "./autonomyRepo";

async function getOrCreateBudget(personId: string, dateStr: string) {
  const rows = await db
    .select()
    .from(interruptBudget)
    .where(and(eq(interruptBudget.personId, personId), eq(interruptBudget.date, dateStr)));
  if (rows[0]) return rows[0];
  const [created] = await db.insert(interruptBudget).values({ personId, date: dateStr }).returning();
  return created;
}

/**
 * Runs one full detection → draft → queue cycle (Part 25 cadence tick),
 * persists results, and returns the queued drafts for a transcript.
 */
export async function runDetectionCycle(now: Date = new Date()) {
  const dateStr = now.toISOString().slice(0, 10);

  const commitmentRows = await db.select().from(commitments);
  const decisionRows = await db.select().from(decisions);
  const meetingRows = await db.select().from(meetingArtifacts);
  const metricRows = await db.select().from(metricSeries);
  const delegationRows = await db.select().from(delegations);

  const candidates = detectAllMoments({
    commitments: commitmentRows.map((c) => ({ id: c.id, promisorId: c.promisorId, promiseeId: c.promiseeId, content: c.content, dueAt: c.dueAt, status: c.status })),
    decisions: decisionRows.map((d) => ({ id: d.id, title: d.title, ownerId: d.ownerId, status: d.status, lastActivityAt: d.lastActivityAt })),
    meetings: meetingRows
      .filter((m) => !!m.ownerId)
      .map((m) => ({
        id: m.id,
        title: m.title,
        ownerId: m.ownerId as string,
        actionItemCount: Array.isArray(m.actionItems) ? m.actionItems.length : 0,
        occurredAt: m.occurredAt,
      })),
    metrics: metricRows
      .filter((m) => !!m.ownerId)
      .map((m) => ({ metricKey: m.metricKey, ownerId: m.ownerId as string, value: m.value, target: m.target })),
    delegations: delegationRows.map((d) => ({ id: d.id, delegatorId: d.delegatorId, delegateId: d.delegateId, task: d.task, status: d.status, createdAt: d.createdAt, lastCheckinAt: d.lastCheckinAt })),
    now,
  });

  const personIds = Array.from(new Set(candidates.map((c) => c.targetPersonId)));
  const budgetByPerson = new Map();
  for (const pid of personIds) {
    const row = await getOrCreateBudget(pid, dateStr);
    budgetByPerson.set(pid, { personId: pid, date: row.date, cap: row.cap, used: row.used, quietHoursStart: row.quietHoursStart, quietHoursEnd: row.quietHoursEnd });
  }

  const queued = queueWithBudget(candidates, budgetByPerson, now);

  const inserted = [];
  for (const q of queued) {
    const cls = await getActionClassByKey(q.actionClassKey);
    const tier = cls?.tier ?? "T1";
    const [row] = await db
      .insert(proactiveDrafts)
      .values({
        triggerType: q.triggerType,
        surfaceRef: q.surfaceRef,
        draftType: q.draftType,
        targetPersonId: q.targetPersonId,
        draftContent: q.draftContent,
        whyThis: q.whyThis,
        whyNow: q.whyNow,
        stakes: q.stakes,
        actionClassKey: q.actionClassKey,
        autonomyTier: tier,
        batchedCount: q.batchedCount,
        status: "queued",
      })
      .returning();
    inserted.push(row);

    if (q.queuePosition === "immediate") {
      const budgetRow = await getOrCreateBudget(q.targetPersonId, dateStr);
      await db.update(interruptBudget).set({ used: budgetRow.used + 1 }).where(eq(interruptBudget.id, budgetRow.id));
    }
  }

  await db.insert(cadenceTicks).values({
    cadenceKey: "proactive.detect.cycle",
    ranAt: now,
    summary: { candidateCount: candidates.length, queuedCount: queued.length },
  });

  await audit({ actorType: "system", action: "proactive.detect_cycle", entityType: "cadence_tick", details: { candidateCount: candidates.length, queuedCount: queued.length } });

  return { candidates, queued, inserted };
}

export async function listDrafts(status?: string) {
  if (status) {
    return db.select().from(proactiveDrafts).where(eq(proactiveDrafts.status, status)).orderBy(desc(proactiveDrafts.createdAt));
  }
  return db.select().from(proactiveDrafts).orderBy(desc(proactiveDrafts.createdAt));
}

export async function approveDraft(id: string, actorId: string) {
  const rows = await db.select().from(proactiveDrafts).where(eq(proactiveDrafts.id, id));
  const draft = rows[0];
  if (!draft) throw new Error("draft not found");
  await db.update(proactiveDrafts).set({ status: "approved", decidedAt: new Date(), decidedBy: actorId }).where(eq(proactiveDrafts.id, id));
  await recordClassOutcome(draft.actionClassKey, true);
  await audit({ actorType: "human", actorId, action: "proactive_draft.approved", entityType: "proactive_draft", entityId: id });
  return draft;
}

export async function dismissDraft(id: string, actorId: string, reason?: string) {
  const rows = await db.select().from(proactiveDrafts).where(eq(proactiveDrafts.id, id));
  const draft = rows[0];
  if (!draft) throw new Error("draft not found");
  await db.update(proactiveDrafts).set({ status: "dismissed", decidedAt: new Date(), decidedBy: actorId }).where(eq(proactiveDrafts.id, id));
  await recordClassOutcome(draft.actionClassKey, false);
  await audit({ actorType: "human", actorId, action: "proactive_draft.dismissed", entityType: "proactive_draft", entityId: id, details: { reason } });
  return draft;
}

/**
 * The only path that can mark a draft "auto_sent" instead of "approved" —
 * requires canAutoSend() to be true (tier T3+ AND explicit grant). Always
 * audited either way.
 */
export async function attemptAutoSend(id: string) {
  const rows = await db.select().from(proactiveDrafts).where(eq(proactiveDrafts.id, id));
  const draft = rows[0];
  if (!draft) throw new Error("draft not found");
  const clsRow = await getActionClassByKey(draft.actionClassKey);
  if (!clsRow) return { sent: false, reason: "unknown action class" };
  const cls = await toActionClass(clsRow);
  const grantRow = await getGrant(draft.targetPersonId, clsRow.id);
  const grant = grantRow
    ? { personId: grantRow.personId, actionClassKey: draft.actionClassKey, grant: grantRow.grant as "none" | "draft" | "auto_with_notify" | "auto_silent", grantedBy: grantRow.grantedBy, expiresAt: grantRow.expiresAt?.toISOString() ?? null }
    : undefined;
  const decision = canAutoSend(cls, grant);
  await audit({ actorType: "system", action: "proactive_draft.autosend_attempt", entityType: "proactive_draft", entityId: id, details: decision });
  if (!decision.allowed) return { sent: false, reason: decision.reason };
  await db.update(proactiveDrafts).set({ status: "auto_sent", decidedAt: new Date() }).where(eq(proactiveDrafts.id, id));
  await recordClassOutcome(draft.actionClassKey, true);
  return { sent: true, reason: decision.reason };
}
