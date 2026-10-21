// A. Assumption registry — the single place every financial driver is owned,
// justified, ranged and versioned. financialOS.ts NEVER hardcodes a number;
// it always reads through this module.
import { db } from "@/db";
import { assumptions } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { num } from "@/lib/format";
import type { DriverRange } from "@/lib/simulation";

export type AssumptionRow = Awaited<ReturnType<typeof listActiveAssumptions>>[number];

export async function listActiveAssumptions() {
  return db.select().from(assumptions).where(eq(assumptions.active, true)).orderBy(desc(assumptions.effectiveDate));
}

export async function getAssumption(key: string) {
  const rows = await db
    .select()
    .from(assumptions)
    .where(and(eq(assumptions.key, key), eq(assumptions.active, true)))
    .orderBy(desc(assumptions.version))
    .limit(1);
  return rows[0] ?? null;
}

export async function assumptionsAsMap(): Promise<Record<string, { low: number; base: number; high: number; owner: string; unit: string; rationale: string; label: string }>> {
  const rows = await listActiveAssumptions();
  const map: Record<string, { low: number; base: number; high: number; owner: string; unit: string; rationale: string; label: string }> = {};
  for (const r of rows) {
    map[r.key] = {
      low: num(r.low),
      base: num(r.base),
      high: num(r.high),
      owner: r.owner,
      unit: r.unit,
      rationale: r.rationale,
      label: r.label,
    };
  }
  return map;
}

export async function assumptionsAsDriverRanges(): Promise<DriverRange[]> {
  const rows = await listActiveAssumptions();
  return rows.map((r) => ({ key: r.key, low: num(r.low), base: num(r.base), high: num(r.high) }));
}

/** Creates a new version of an assumption (never mutates history — append-only). */
export async function reviseAssumption(input: {
  key: string;
  label: string;
  category: string;
  owner: string;
  rationale: string;
  unit: string;
  low: number;
  base: number;
  high: number;
  effectiveDate: string;
}) {
  const prior = await getAssumption(input.key);
  if (prior) {
    await db.update(assumptions).set({ active: false }).where(eq(assumptions.id, prior.id));
  }
  const [row] = await db
    .insert(assumptions)
    .values({
      key: input.key,
      label: input.label,
      category: input.category,
      owner: input.owner,
      rationale: input.rationale,
      unit: input.unit,
      low: String(input.low),
      base: String(input.base),
      high: String(input.high),
      version: (prior?.version ?? 0) + 1,
      effectiveDate: input.effectiveDate,
      supersedesId: prior?.id ?? null,
      active: true,
    })
    .returning();
  return row;
}
