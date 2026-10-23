// LEADOS — Part 56: monitoring / assurance checks (Part 38 stand-in).
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { monitoringChecks } from "@/db/schema";

export async function getLatestChecksForSystem(systemKey: string) {
  const rows = await db
    .select()
    .from(monitoringChecks)
    .where(eq(monitoringChecks.systemKey, systemKey))
    .orderBy(desc(monitoringChecks.lastRunAt));
  return rows;
}

export async function getAllLatestChecks() {
  return db.select().from(monitoringChecks).orderBy(desc(monitoringChecks.lastRunAt));
}

/** Worst-status-wins rollup used by the Accountability Console's "monitoring
 * health" column. fail > warn > pass > unknown. */
export function rollupStatus(statuses: Array<"pass" | "warn" | "fail">): "pass" | "warn" | "fail" | "unknown" {
  if (statuses.length === 0) return "unknown";
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warn")) return "warn";
  return "pass";
}
