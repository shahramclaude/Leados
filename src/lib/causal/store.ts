/**
 * Persistence for SCMs and causal claims (Part 05, section A: "Store models
 * as data (JSON/DB) so Part 06's digital twin and Part 10's strategy views
 * can compose them.").
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { causalClaims, causalModels } from "@/db/schema";
import { loadModel } from "./dag";
import type { CausalClaim, FalsificationReport, StructuralCausalModel } from "./types";

export async function upsertModel(scm: StructuralCausalModel): Promise<void> {
  loadModel(scm); // re-validate acyclicity before persisting
  await db
    .insert(causalModels)
    .values({
      id: scm.id,
      version: scm.version,
      label: scm.label,
      definition: scm,
    })
    .onConflictDoUpdate({
      target: causalModels.id,
      set: { version: scm.version, label: scm.label, definition: scm },
    });
}

export async function getModel(id: string): Promise<StructuralCausalModel | null> {
  const rows = await db.select().from(causalModels).where(eq(causalModels.id, id)).limit(1);
  if (rows.length === 0) return null;
  return rows[0].definition as StructuralCausalModel;
}

export async function listModels(): Promise<StructuralCausalModel[]> {
  const rows = await db.select().from(causalModels);
  return rows.map((r) => r.definition as StructuralCausalModel);
}

export async function saveClaim(claim: CausalClaim): Promise<void> {
  await db
    .insert(causalClaims)
    .values({
      id: claim.id,
      scmId: claim.scmId,
      label: claim.label,
      estimate: claim.estimate,
      falsification: claim.falsification ?? null,
      asOf: new Date(claim.asOf),
      revalidateBy: new Date(claim.revalidateBy),
    })
    .onConflictDoUpdate({
      target: causalClaims.id,
      set: {
        estimate: claim.estimate,
        falsification: claim.falsification ?? null,
        asOf: new Date(claim.asOf),
        revalidateBy: new Date(claim.revalidateBy),
      },
    });
}

export async function listClaims(): Promise<CausalClaim[]> {
  const rows = await db.select().from(causalClaims);
  return rows.map((r) => ({
    id: r.id,
    scmId: r.scmId,
    label: r.label,
    estimate: r.estimate as CausalClaim["estimate"],
    falsification: (r.falsification as FalsificationReport | null) ?? undefined,
    asOf: r.asOf.toISOString(),
    revalidateBy: r.revalidateBy.toISOString(),
  }));
}
