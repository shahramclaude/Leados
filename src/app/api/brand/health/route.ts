import { NextRequest } from "next/server";
import { brandHealth } from "@/db/schema";
import { listRows, createRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await listRows(brandHealth, desc(brandHealth.id));
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.metric || body.value === undefined || body.value === "") return badRequest("metric and value are required");
  const row = await createRow(brandHealth, {
    metric: body.metric,
    segment: body.segment || "overall",
    value: String(body.value),
    method: body.method || "survey",
    sampleSize: Number(body.sampleSize) || 0,
    ciLow: body.ciLow ? String(body.ciLow) : null,
    ciHigh: body.ciHigh ? String(body.ciHigh) : null,
    trend: body.trend || "flat",
  });
  return ok(row, 201);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(brandHealth, brandHealth.id, id);
  return ok({ ok: true });
}
