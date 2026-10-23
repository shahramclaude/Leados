// LEADOS — Part 56: fairness reporting (Part 09 stand-in).
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { fairnessReports } from "@/db/schema";

export async function getFairnessReportsForSystem(systemKey: string) {
  return db
    .select()
    .from(fairnessReports)
    .where(eq(fairnessReports.systemKey, systemKey))
    .orderBy(desc(fairnessReports.generatedAt));
}

export async function getAllFairnessReports() {
  return db.select().from(fairnessReports).orderBy(desc(fairnessReports.generatedAt));
}

export function disparityRatio(valueA: number, valueB: number): number {
  if (valueA === 0 || valueB === 0) return Infinity;
  const hi = Math.max(valueA, valueB);
  const lo = Math.min(valueA, valueB);
  return Number((hi / lo).toFixed(3));
}
