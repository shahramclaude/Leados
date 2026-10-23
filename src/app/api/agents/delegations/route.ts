import { NextRequest } from "next/server";
import { delegations } from "@/db/schema";
import { listRows, createRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await listRows(delegations, desc(delegations.id));
  // Active tool access is denied the instant revokedAt is set — this is the
  // same check an enforcement middleware would run before any tool call.
  return ok(rows.map((r: Record<string, unknown>) => ({ ...r, toolAccessActive: !r.revokedAt })));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.agentRoleId || !body.fromPerson || !body.task) {
    return badRequest("agentRoleId, fromPerson and task are required");
  }
  const row = await createRow(delegations, {
    agentRoleId: Number(body.agentRoleId),
    fromPerson: body.fromPerson,
    task: body.task,
    budgetUsd: String(body.budgetUsd ?? 0),
    windowLabel: body.windowLabel || "",
    grantedTools: body.grantedTools || "",
  });
  return ok(row, 201);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(delegations, delegations.id, id);
  return ok({ ok: true });
}
