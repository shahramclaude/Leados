// Part 09-D: recurring 1:1 docs with shared agendas, suggested (never
// auto-sent) talking points, and commitment tracking with a fair
// follow-through score shown identically to both parties.

import { db } from "@/db";
import { oneOnOnes, commitments, people } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { newId } from "./ids";
import { appendEvent } from "./events";
import {
  type Actor,
  canReadOneOnOneShared,
  canReadOneOnOnePrivateNotes,
  assertAccess,
} from "./accessControl";
import type { Explain } from "./explain";
import { buildFlightRiskFeatures } from "./flightRisk";

export interface AgendaItem {
  id: string;
  text: string;
  addedBy: string;
}

export interface SuggestedTalkingPoint {
  text: string;
  reason: string;
}

export interface OneOnOneView {
  id: string;
  managerId: string;
  employeeId: string;
  scheduledAt: string;
  heldAt: string | null;
  status: string;
  agenda: AgendaItem[];
  sharedNotes: unknown[];
  privateNotes: unknown[] | null; // null when caller is not authorized
  commitments: { id: string; ownerId: string; description: string; dueDate: string | null; status: string }[];
}

export async function createOneOnOne(actor: Actor, managerId: string, employeeId: string, scheduledAt: Date) {
  assertAccess(
    actor.id === managerId || actor.globalRole === "hr",
    `actor ${actor.id} may not schedule a 1:1 for ${managerId}`,
  );
  const id = newId("o3");
  await db.insert(oneOnOnes).values({
    id,
    managerId,
    employeeId,
    scheduledAt,
    status: "scheduled",
    agendaJson: [],
    sharedNotesJson: [],
    privateNotesJson: [],
  });
  return id;
}

/** Suggested talking points — surfaced to the manager to pick from; never
 * sent or shown to the employee automatically, and never phrased as fact. */
export async function suggestTalkingPoints(employeeId: string): Promise<SuggestedTalkingPoint[]> {
  const { features } = await buildFlightRiskFeatures(employeeId, new Date());
  const points: SuggestedTalkingPoint[] = [];
  if (features.daysSinceLastOneOnOne > 21) {
    points.push({
      text: "Check in on workload and priorities since it's been a while since your last 1:1.",
      reason: `${Math.round(features.daysSinceLastOneOnOne)} days since the last held 1:1 (signal, not a conclusion).`,
    });
  }
  if (features.growthPlanActivityLast180d === 0) {
    points.push({
      text: "Ask what growth or stretch opportunities they'd like to explore next.",
      reason: "No growth-plan activity recorded in the last 180 days.",
    });
  }
  if (features.commitmentFollowThroughRate < 0.5) {
    points.push({
      text: "Revisit open commitments together and see what support would help close them out.",
      reason: "Commitment follow-through rate below 50% in recorded history.",
    });
  }
  if (features.managerChangedLast90d === 1) {
    points.push({
      text: "Acknowledge the recent manager change and ask how the transition is going.",
      reason: "A manager change was recorded in the last 90 days.",
    });
  }
  if (points.length === 0) {
    points.push({
      text: "No specific signals this cycle — use the time for open-ended career conversation.",
      reason: "No elevated signals found in current data.",
    });
  }
  return points;
}

export async function holdOneOnOne(
  actor: Actor,
  id: string,
  input: { agenda?: AgendaItem[]; sharedNotes?: unknown[]; privateNotes?: unknown[] },
) {
  const [row] = await db.select().from(oneOnOnes).where(eq(oneOnOnes.id, id)).limit(1);
  if (!row) throw new Error("1:1 not found");
  assertAccess(canReadOneOnOneShared(actor, row), `actor ${actor.id} may not update 1:1 ${id}`);
  if (input.privateNotes) {
    assertAccess(
      canReadOneOnOnePrivateNotes(actor, row),
      `actor ${actor.id} may not write private notes on 1:1 ${id}`,
    );
  }

  await db
    .update(oneOnOnes)
    .set({
      heldAt: new Date(),
      status: "held",
      agendaJson: input.agenda ?? row.agendaJson,
      sharedNotesJson: input.sharedNotes ?? row.sharedNotesJson,
      privateNotesJson: input.privateNotes ?? row.privateNotesJson,
    })
    .where(eq(oneOnOnes.id, id));

  await appendEvent({
    type: "ONE_ON_ONE_HELD",
    entityType: "person",
    entityId: row.employeeId,
    actorId: actor.id,
    payload: { oneOnOneId: id },
  });
}

export async function addCommitment(actor: Actor, oneOnOneId: string, ownerId: string, description: string, dueDate?: string) {
  const [row] = await db.select().from(oneOnOnes).where(eq(oneOnOnes.id, oneOnOneId)).limit(1);
  if (!row) throw new Error("1:1 not found");
  assertAccess(canReadOneOnOneShared(actor, row), `actor ${actor.id} may not add commitments on 1:1 ${oneOnOneId}`);

  const id = newId("cmt");
  await db.insert(commitments).values({
    id,
    oneOnOneId,
    ownerId,
    description,
    dueDate: dueDate ?? null,
    status: "open",
  });
  await appendEvent({
    type: "COMMITMENT_CREATED",
    entityType: "person",
    entityId: ownerId,
    actorId: actor.id,
    payload: { commitmentId: id, description },
  });
  return id;
}

export async function resolveCommitment(actor: Actor, commitmentId: string, status: "kept" | "slipped") {
  const [row] = await db.select().from(commitments).where(eq(commitments.id, commitmentId)).limit(1);
  if (!row) throw new Error("Commitment not found");
  const [oneOnOne] = await db.select().from(oneOnOnes).where(eq(oneOnOnes.id, row.oneOnOneId)).limit(1);
  if (!oneOnOne) throw new Error("Parent 1:1 not found");
  assertAccess(canReadOneOnOneShared(actor, oneOnOne), `actor ${actor.id} may not resolve commitment ${commitmentId}`);

  await db.update(commitments).set({ status, resolvedAt: new Date() }).where(eq(commitments.id, commitmentId));
  await appendEvent({
    type: "COMMITMENT_RESOLVED",
    entityType: "person",
    entityId: row.ownerId,
    actorId: actor.id,
    payload: { commitmentId, status },
  });
}

export interface FollowThroughScore {
  ownerId: string;
  kept: number;
  slipped: number;
  open: number;
  rate: Explain<number>;
}

/**
 * Follow-through is computed identically regardless of whether the owner is
 * the manager or the employee, and is shown to both parties the same way —
 * this function is the single source of truth to prevent a UI from
 * presenting asymmetric framing for the same underlying numbers.
 */
export async function followThroughScore(ownerId: string): Promise<FollowThroughScore> {
  const rows = await db.select().from(commitments).where(eq(commitments.ownerId, ownerId));
  const kept = rows.filter((r) => r.status === "kept").length;
  const slipped = rows.filter((r) => r.status === "slipped").length;
  const open = rows.filter((r) => r.status === "open").length;
  const resolved = kept + slipped;
  const rateValue = resolved > 0 ? kept / resolved : 0.5;
  const width = Math.max(0.1, 0.4 - Math.min(0.3, resolved * 0.04));

  return {
    ownerId,
    kept,
    slipped,
    open,
    rate: {
      value: Number(rateValue.toFixed(3)),
      method: "Kept commitments ÷ (kept + slipped) resolved commitments, from 1:1 commitment tracking.",
      inputs: ["commitments.status"],
      confidence: {
        low: Number(Math.max(0, rateValue - width / 2).toFixed(3)),
        high: Number(Math.min(1, rateValue + width / 2).toFixed(3)),
        level: 0.8,
      },
      uncertaintyNote:
        resolved < 3
          ? "Based on fewer than 3 resolved commitments — treat as low-confidence."
          : "Based on recorded commitments only; does not capture commitments made outside LEADOS.",
      lawfulPurpose: "Mutual accountability tracking shown symmetrically to manager and employee.",
      asOf: new Date().toISOString(),
    },
  };
}

export async function getOneOnOne(actor: Actor, id: string): Promise<OneOnOneView> {
  const [row] = await db.select().from(oneOnOnes).where(eq(oneOnOnes.id, id)).limit(1);
  if (!row) throw new Error("1:1 not found");
  assertAccess(canReadOneOnOneShared(actor, row), `actor ${actor.id} may not read 1:1 ${id}`);

  const commitmentRows = await db.select().from(commitments).where(eq(commitments.oneOnOneId, id));
  const canSeePrivate = canReadOneOnOnePrivateNotes(actor, row);

  return {
    id: row.id,
    managerId: row.managerId,
    employeeId: row.employeeId,
    scheduledAt: row.scheduledAt.toISOString(),
    heldAt: row.heldAt ? row.heldAt.toISOString() : null,
    status: row.status,
    agenda: row.agendaJson as AgendaItem[],
    sharedNotes: row.sharedNotesJson as unknown[],
    privateNotes: canSeePrivate ? (row.privateNotesJson as unknown[]) : null,
    commitments: commitmentRows.map((c) => ({
      id: c.id,
      ownerId: c.ownerId,
      description: c.description,
      dueDate: c.dueDate,
      status: c.status,
    })),
  };
}

export async function listOneOnOnesForPair(actor: Actor, managerId: string, employeeId: string) {
  const rows = await db
    .select()
    .from(oneOnOnes)
    .where(and(eq(oneOnOnes.managerId, managerId), eq(oneOnOnes.employeeId, employeeId)))
    .orderBy(desc(oneOnOnes.scheduledAt));
  if (rows.length > 0) {
    assertAccess(canReadOneOnOneShared(actor, rows[0]), `actor ${actor.id} may not list 1:1s for this pair`);
  }
  return Promise.all(rows.map((r) => getOneOnOne(actor, r.id)));
}

export async function listOneOnOnesForEmployee(actor: Actor, employeeId: string) {
  const [person] = await db.select().from(people).where(eq(people.id, employeeId)).limit(1);
  if (!person) throw new Error("Person not found");
  const rows = await db.select().from(oneOnOnes).where(eq(oneOnOnes.employeeId, employeeId)).orderBy(desc(oneOnOnes.scheduledAt));
  return Promise.all(
    rows
      .filter((r) => canReadOneOnOneShared(actor, r))
      .map((r) => getOneOnOne(actor, r.id)),
  );
}
