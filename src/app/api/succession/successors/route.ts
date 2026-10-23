import { NextRequest } from "next/server";
import { successors } from "@/db/schema";
import { listRows, createRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { effectiveReadiness } from "@/lib/leados/calc";
import { desc } from "drizzle-orm";

// Sponsorship without evidence cannot create readiness: readiness always
// renders through effectiveReadiness(), which downgrades to "unknown" when
// there is no evidence on file — regardless of what is claimed verbally.
function augment(row: Record<string, unknown>) {
  return { ...row, effectiveReadiness: effectiveReadiness(String(row.readiness), row.evidenceNotes as string | null) };
}

export async function GET() {
  const rows = await listRows(successors, desc(successors.id));
  return ok(rows.map(augment));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.benchRoleId || !body.personName) return badRequest("benchRoleId and personName are required");
  const row = await createRow(successors, {
    benchRoleId: Number(body.benchRoleId),
    personName: body.personName,
    readiness: body.readiness || "ready-3yr+",
    evidenceNotes: body.evidenceNotes || "",
    developmentGaps: body.developmentGaps || "",
  });
  return ok(augment(row), 201);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(successors, successors.id, id);
  return ok({ ok: true });
}
