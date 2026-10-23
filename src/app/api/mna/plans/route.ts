import { NextRequest } from "next/server";
import { integrationPlans } from "@/db/schema";
import { listRows, createRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await listRows(integrationPlans, desc(integrationPlans.id));
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.dealName) return badRequest("dealName is required");
  const row = await createRow(integrationPlans, {
    dealName: body.dealName,
    archetype: body.archetype || "tuck-in",
    day1ChecklistTotal: Number(body.day1ChecklistTotal) || 0,
    day1ChecklistDone: Number(body.day1ChecklistDone) || 0,
    rollbackPlan: body.rollbackPlan || "",
    status: body.status || "planning",
  });
  return ok(row, 201);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(integrationPlans, integrationPlans.id, id);
  return ok({ ok: true });
}
