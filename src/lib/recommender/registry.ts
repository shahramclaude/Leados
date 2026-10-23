/**
 * Part 51 — Intervention registry: syncs the playbook library (Part 12
 * stand-in) into the `rec_interventions` table and exposes typed reads.
 */

import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { recInterventions } from "@/db/schema";
import { listPlaybooks } from "@/lib/playbooks";
import type { Intervention } from "./types";

function rowToIntervention(row: typeof recInterventions.$inferSelect): Intervention {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    category: row.category,
    play: { playbookId: row.playbookId, source: "playbook_library" },
    applicableContexts: row.applicableContexts as Record<string, string[]>[],
    preconditions: row.preconditions as Intervention["preconditions"],
    cost: { unit: row.costUnit as Intervention["cost"]["unit"], amount: row.costAmount },
    reversibility: row.reversibility as Intervention["reversibility"],
    effort: row.effort as Intervention["effort"],
    evidenceClass: row.priorEvidenceClass as Intervention["evidenceClass"],
  };
}

/** Idempotently syncs the playbook library into the intervention registry. */
export async function ensureInterventionsSeeded(): Promise<void> {
  const playbooks = listPlaybooks();
  for (const pb of playbooks) {
    const existing = await db
      .select({ id: recInterventions.id })
      .from(recInterventions)
      .where(eq(recInterventions.slug, pb.id))
      .limit(1);

    if (existing.length > 0) continue;

    await db.insert(recInterventions).values({
      id: randomUUID(),
      slug: pb.id,
      title: pb.title,
      category: pb.category,
      playbookId: pb.id,
      description: pb.description,
      applicableContexts: pb.applicableContexts,
      preconditions: pb.preconditions,
      costUnit: pb.costUnit,
      costAmount: pb.costAmount,
      reversibility: pb.reversibility,
      effort: pb.effort,
      priorEvidenceClass: pb.priorEvidenceClass,
    });
  }
}

export async function listInterventions(): Promise<Intervention[]> {
  const rows = await db.select().from(recInterventions);
  return rows.map(rowToIntervention);
}

export async function getInterventionBySlug(slug: string): Promise<Intervention | undefined> {
  const rows = await db.select().from(recInterventions).where(eq(recInterventions.slug, slug)).limit(1);
  return rows[0] ? rowToIntervention(rows[0]) : undefined;
}

export async function getInterventionById(id: string): Promise<Intervention | undefined> {
  const rows = await db.select().from(recInterventions).where(eq(recInterventions.id, id)).limit(1);
  return rows[0] ? rowToIntervention(rows[0]) : undefined;
}
