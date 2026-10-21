// Part 04 stand-in: calibration ledger. Records predicted distributions
// against what actually happened, so forecasting error is measured, not
// assumed. Feeds delivery-date recalibration (C) and decision retrospectives (D).
import { db } from "@/db";
import { calibrationRecords } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { num } from "@/lib/format";

export async function recordCalibration(input: {
  domain: "delivery" | "decision" | "financial";
  refType: string;
  refId: number;
  predictedP50: string;
  predictedDistribution: unknown;
  actualValue: string;
  actualDate: string;
  errorValue: number;
}) {
  const [row] = await db
    .insert(calibrationRecords)
    .values({
      domain: input.domain,
      refType: input.refType,
      refId: input.refId,
      predictedP50: input.predictedP50,
      predictedDistribution: input.predictedDistribution as object,
      actualValue: input.actualValue,
      actualDate: input.actualDate,
      errorValue: String(input.errorValue),
    })
    .returning();
  return row;
}

export async function calibrationSummary(domain?: "delivery" | "decision" | "financial") {
  const rows = domain
    ? await db.select().from(calibrationRecords).where(eq(calibrationRecords.domain, domain)).orderBy(desc(calibrationRecords.createdAt))
    : await db.select().from(calibrationRecords).orderBy(desc(calibrationRecords.createdAt));

  if (rows.length === 0) {
    return { count: 0, meanAbsoluteError: 0, meanError: 0, rows: [] };
  }
  const errors = rows.map((r) => num(r.errorValue));
  const meanAbsoluteError = errors.reduce((a, b) => a + Math.abs(b), 0) / errors.length;
  const meanError = errors.reduce((a, b) => a + b, 0) / errors.length;
  return { count: rows.length, meanAbsoluteError, meanError, rows };
}
