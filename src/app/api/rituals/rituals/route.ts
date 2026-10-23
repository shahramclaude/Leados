import { NextRequest } from "next/server";
import { rituals } from "@/db/schema";
import { listRows, createRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await listRows(rituals, desc(rituals.id));
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.name || !body.owner) return badRequest("name and owner are required");
  const row = await createRow(rituals, {
    name: body.name,
    cadence: body.cadence || "weekly",
    owner: body.owner,
    humanMinutesBudget: String(body.humanMinutesBudget ?? 60),
    onTimeRate: String(body.onTimeRate ?? 1),
    outputQuality: String(body.outputQuality ?? 4),
  });
  return ok(row, 201);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(rituals, rituals.id, id);
  return ok({ ok: true });
}
