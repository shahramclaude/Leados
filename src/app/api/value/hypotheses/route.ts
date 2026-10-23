import { NextRequest } from "next/server";
import { valueHypotheses } from "@/db/schema";
import { listRows, createRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { confidenceLabel } from "@/lib/leados/calc";
import { desc } from "drizzle-orm";

function augment(row: Record<string, unknown>) {
  return { ...row, confidenceLabel: confidenceLabel(String(row.method)) };
}

export async function GET() {
  const rows = await listRows(valueHypotheses, desc(valueHypotheses.id));
  return ok(rows.map(augment));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.capability || !body.mechanism) return badRequest("capability and mechanism are required");
  const row = await createRow(valueHypotheses, {
    capability: body.capability,
    beneficiary: body.beneficiary || "",
    mechanism: body.mechanism,
    metricName: body.metricName || "",
    baseline: String(body.baseline ?? 0),
    target: String(body.target ?? 0),
    method: body.method || "self-report",
    status: body.status || "hypothesized",
  });
  return ok(augment(row), 201);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(valueHypotheses, valueHypotheses.id, id);
  return ok({ ok: true });
}
