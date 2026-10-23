import { NextRequest } from "next/server";
import { charterStatements } from "@/db/schema";
import { listRows, createRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await listRows(charterStatements, desc(charterStatements.id));
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.statement || !body.enforcementRef) {
    return badRequest("statement and enforcementRef are required — an untestable charter statement is rejected.");
  }
  const row = await createRow(charterStatements, {
    statement: body.statement,
    statementClass: body.statementClass || "does",
    enforcementRef: body.enforcementRef,
    verified: body.verified === true || body.verified === "true",
  });
  return ok(row, 201);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(charterStatements, charterStatements.id, id);
  return ok({ ok: true });
}
