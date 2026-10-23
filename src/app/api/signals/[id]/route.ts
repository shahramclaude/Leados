import { updateSignalStatus } from "@/lib/queries";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["new", "investigating", "resolved", "dismissed"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const signalId = Number(id);
  if (!Number.isInteger(signalId)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  if (!body || !VALID_STATUSES.includes(body.status)) {
    return Response.json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }
  const signal = await updateSignalStatus(signalId, body.status);
  if (!signal) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json({ signal });
}
