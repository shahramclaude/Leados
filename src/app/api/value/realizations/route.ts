import { NextRequest } from "next/server";
import { benefitRealizations, valueHypotheses } from "@/db/schema";
import { listRows, createRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { confidenceLabel, monteCarloRoi } from "@/lib/leados/calc";
import { db } from "@/db";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  const rows = await listRows(benefitRealizations, desc(benefitRealizations.id));
  const augmented = await Promise.all(
    rows.map(async (row: Record<string, unknown>) => {
      let method = "self-report";
      if (row.hypothesisId) {
        const [h] = await db.select().from(valueHypotheses).where(eq(valueHypotheses.id, Number(row.hypothesisId)));
        if (h) method = h.method;
      }
      const label = confidenceLabel(method);
      const realizedValueUsd = Number(row.realizedValueUsd);
      // Monte Carlo ROI distribution assuming a nominal "investment" equal to
      // 40% of realized value when no explicit investment figure exists —
      // this is a decision-support estimate, not a measured number, and is
      // labeled as such.
      const assumedInvestment = realizedValueUsd * 0.4;
      const roi = monteCarloRoi(assumedInvestment || 1, realizedValueUsd, 30, 4000, Number(row.id) || 1);
      return { ...row, confidenceLabel: label, roi };
    })
  );
  return ok(augmented);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.hypothesisId || body.measured === undefined) return badRequest("hypothesisId and measured are required");
  const row = await createRow(benefitRealizations, {
    hypothesisId: Number(body.hypothesisId),
    measured: String(body.measured),
    ciLow: body.ciLow ? String(body.ciLow) : null,
    ciHigh: body.ciHigh ? String(body.ciHigh) : null,
    realizedValueUsd: String(body.realizedValueUsd ?? 0),
    confidence: body.confidence || "self-reported",
  });
  return ok(row, 201);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(benefitRealizations, benefitRealizations.id, id);
  return ok({ ok: true });
}
