import { NextRequest } from "next/server";
import { partners } from "@/db/schema";
import { listRows, createRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await listRows(partners, desc(partners.id));
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.name || !body.jointValueThesis) return badRequest("name and jointValueThesis are required");
  const row = await createRow(partners, {
    name: body.name,
    kind: body.kind || "channel",
    jointValueThesis: body.jointValueThesis,
    sourcedRevenueUsd: String(body.sourcedRevenueUsd ?? 0),
    influencedRevenueUsd: String(body.influencedRevenueUsd ?? 0),
    enablementCostUsd: String(body.enablementCostUsd ?? 0),
    healthScore: String(body.healthScore ?? 0),
  });
  return ok(row, 201);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(partners, partners.id, id);
  return ok({ ok: true });
}
