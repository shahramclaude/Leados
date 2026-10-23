import { NextRequest } from "next/server";
import { processSpecs } from "@/db/schema";
import { listRows, createRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await listRows(processSpecs, desc(processSpecs.id));
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.name || !body.statesList) return badRequest("name and statesList are required");
  const row = await createRow(processSpecs, {
    name: body.name,
    statesList: body.statesList,
    transitions: body.transitions || "",
    invariants: body.invariants || "",
    maxBoundedStates: Number(body.maxBoundedStates) || 5000,
    verdict: "inconclusive-bound",
    statesExplored: 0,
  });
  return ok(row, 201);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(processSpecs, processSpecs.id, id);
  return ok({ ok: true });
}
