import { ensureSeedData, muteAlert, unmuteAlert } from "@/lib/sensing/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSeedData();
  const { id } = await context.params;
  const alertId = Number(id);
  if (!Number.isFinite(alertId)) {
    return Response.json({ error: "invalid alert id" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return Response.json({ error: "a mute reason is required" }, { status: 400 });
  }
  await muteAlert(alertId, reason);
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureSeedData();
  const { id } = await context.params;
  const alertId = Number(id);
  if (!Number.isFinite(alertId)) {
    return Response.json({ error: "invalid alert id" }, { status: 400 });
  }
  await unmuteAlert(alertId);
  return Response.json({ ok: true });
}
