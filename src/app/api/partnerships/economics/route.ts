import { NextRequest } from "next/server";
import { channelEconomics } from "@/db/schema";
import { listRows, createRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await listRows(channelEconomics, desc(channelEconomics.id));
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.channel) return badRequest("channel is required");
  const row = await createRow(channelEconomics, {
    partnerId: body.partnerId ? Number(body.partnerId) : null,
    channel: body.channel,
    cac: String(body.cac ?? 0),
    ltv: String(body.ltv ?? 0),
    paybackMonths: String(body.paybackMonths ?? 0),
    cannibalizationFactor: String(body.cannibalizationFactor ?? 0),
    attributionMethod: body.attributionMethod || "first-touch",
    honesty: body.honesty || "modeled",
  });
  return ok(row, 201);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(channelEconomics, channelEconomics.id, id);
  return ok({ ok: true });
}
