// Part 08 — persistence for hand-typed ("asserted") driver overrides. These
// are the Driver Tree's "drag a driver" edits once a user commits them; they
// shadow the evidence-derived/forecast value until real evidence replaces
// them, and the DAG engine marks every downstream number "asserted" for as
// long as the override is active (see `dag.ts` confidence propagation).

import { db } from "@/db";
import { financeDriverOverrides } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { MONTHS } from "./timeline";
import { OverrideMap } from "./dag";

export interface DriverOverrideRow {
  id: number;
  driverId: string;
  month: string;
  value: number;
  assertedBy: string;
  note: string | null;
  createdAt: string;
}

export async function listOverrides(): Promise<DriverOverrideRow[]> {
  const rows = await db.select().from(financeDriverOverrides).orderBy(desc(financeDriverOverrides.createdAt));
  return rows.map((r) => ({
    id: r.id,
    driverId: r.driverId,
    month: r.month,
    value: Number(r.value),
    assertedBy: r.assertedBy,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Loads all persisted overrides and reduces them to the latest value per
 * (driverId, month), converted into the DAG's OverrideMap shape (month index
 * keyed, not month label). */
export async function loadOverrideMap(): Promise<OverrideMap> {
  const rows = await listOverrides();
  const latestPerKey = new Map<string, DriverOverrideRow>();
  for (const row of rows) {
    const key = `${row.driverId}:${row.month}`;
    const existing = latestPerKey.get(key);
    if (!existing || new Date(row.createdAt) > new Date(existing.createdAt)) {
      latestPerKey.set(key, row);
    }
  }
  const map: OverrideMap = {};
  for (const row of latestPerKey.values()) {
    const monthIndex = MONTHS.indexOf(row.month);
    if (monthIndex === -1) continue;
    if (!map[row.driverId]) map[row.driverId] = {};
    map[row.driverId][monthIndex] = row.value;
  }
  return map;
}

export async function saveOverride(input: {
  driverId: string;
  month: string;
  value: number;
  assertedBy?: string;
  note?: string;
}): Promise<DriverOverrideRow> {
  const rows = await db
    .insert(financeDriverOverrides)
    .values({
      driverId: input.driverId,
      month: input.month,
      value: String(input.value),
      assertedBy: input.assertedBy ?? "unknown",
      note: input.note,
    })
    .returning();
  const r = rows[0];
  return {
    id: r.id,
    driverId: r.driverId,
    month: r.month,
    value: Number(r.value),
    assertedBy: r.assertedBy,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function deleteOverride(id: number): Promise<void> {
  await db.delete(financeDriverOverrides).where(eq(financeDriverOverrides.id, id));
}
