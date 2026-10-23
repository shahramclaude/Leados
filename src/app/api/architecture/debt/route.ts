import { NextRequest } from "next/server";
import { debtItems } from "@/db/schema";
import { listRows, createRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { debtPriority } from "@/lib/leados/calc";
import { desc } from "drizzle-orm";

function augment(row: Record<string, unknown>) {
  return {
    ...row,
    priority: debtPriority(Number(row.interestPerWeek), Number(row.principal), new Date(row.createdAt as string)),
  };
}

export async function GET() {
  const rows = await listRows(debtItems, desc(debtItems.id));
  const augmented = rows.map(augment).sort((a, b) => b.priority - a.priority);
  return ok(augmented);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.className || !body.surface) return badRequest("className and surface are required");
  const row = await createRow(debtItems, {
    className: body.className,
    surface: body.surface,
    interestPerWeek: String(body.interestPerWeek ?? 0),
    principal: String(body.principal ?? 1),
    exitCriteria: body.exitCriteria || "",
  });
  return ok(augment(row), 201);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(debtItems, debtItems.id, id);
  return ok({ ok: true });
}
