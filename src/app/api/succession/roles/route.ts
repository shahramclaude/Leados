import { NextRequest } from "next/server";
import { benchRoles } from "@/db/schema";
import { listRows, createRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await listRows(benchRoles, desc(benchRoles.id));
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.roleTitle) return badRequest("roleTitle is required");
  const row = await createRow(benchRoles, {
    roleTitle: body.roleTitle,
    critical: body.critical !== false && body.critical !== "false",
    coverageStatus: body.coverageStatus || "gap",
  });
  return ok(row, 201);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(benchRoles, benchRoles.id, id);
  return ok({ ok: true });
}
