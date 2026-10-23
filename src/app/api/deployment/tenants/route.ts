import { NextRequest } from "next/server";
import { tenants } from "@/db/schema";
import { listRows, createRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await listRows(tenants, desc(tenants.id));
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.name) return badRequest("name is required");
  const row = await createRow(tenants, {
    name: body.name,
    isolation: body.isolation || "row-level",
    usersLimit: Number(body.usersLimit) || 100,
    storageGbLimit: Number(body.storageGbLimit) || 50,
    agentRunsPerDayLimit: Number(body.agentRunsPerDayLimit) || 1000,
    dataResidency: body.dataResidency || "us",
  });
  return ok(row, 201);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(tenants, tenants.id, id);
  return ok({ ok: true });
}
