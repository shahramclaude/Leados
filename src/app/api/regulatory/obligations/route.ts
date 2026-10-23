import { NextRequest } from "next/server";
import { obligations } from "@/db/schema";
import { listRows, createRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await listRows(obligations, desc(obligations.id));
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.clause) return badRequest("clause is required");
  const row = await createRow(obligations, {
    regulatoryItemId: body.regulatoryItemId ? Number(body.regulatoryItemId) : null,
    clause: body.clause,
    controlRefs: body.controlRefs || "",
    status: body.status || "gap",
    owner: body.owner || "unassigned",
  });
  return ok(row, 201);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(obligations, obligations.id, id);
  return ok({ ok: true });
}
