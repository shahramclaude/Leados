/**
 * scm.ts — Part 05 seam (STAND-IN), DB-backed accessors.
 *
 * The real Leados Part 05 "supply/capacity model" owns hiring-market and
 * vendor data. Part 06 only needs a narrow slice of it to make the `hire`
 * and `price` scenario interventions meaningful: how long it takes to add
 * capacity for a skill, and what it costs. This file provides that slice
 * against the `scm_suppliers` table with sane defaults (see
 * `scmSupply.ts` for the pure, DB-free default table used by code paths —
 * e.g. the Monte Carlo worker thread — that must not require a live DB
 * connection). Replace with a real import once Part 05 lands.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { scmSuppliers } from "@/db/schema";
import { DEFAULT_SUPPLY, defaultSupplyFor, defaultSupplyTable, type SkillSupply } from "@/lib/scmSupply";

export type { SkillSupply };
export { defaultSupplyTable };

export async function getSkillSupply(skill: string): Promise<SkillSupply> {
  const rows = await db.select().from(scmSuppliers).where(eq(scmSuppliers.skill, skill)).limit(1);
  if (rows.length > 0) {
    const r = rows[0];
    return {
      skill: r.skill,
      hourlyCost: r.hourlyCost,
      leadTimeDays: r.leadTimeDays,
      capacityPerMonth: r.capacityPerMonth,
    };
  }
  return defaultSupplyFor(skill);
}

export async function seedDefaultSupply(): Promise<void> {
  for (const s of DEFAULT_SUPPLY) {
    const existing = await db.select().from(scmSuppliers).where(eq(scmSuppliers.skill, s.skill)).limit(1);
    if (existing.length === 0) {
      await db.insert(scmSuppliers).values({
        id: crypto.randomUUID(),
        skill: s.skill,
        hourlyCost: s.hourlyCost,
        leadTimeDays: s.leadTimeDays,
        capacityPerMonth: s.capacityPerMonth,
      });
    }
  }
}
