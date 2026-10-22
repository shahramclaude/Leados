import { getConsentMap, listParticipants, setConsent } from "@/lib/consent/consent";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const participants = await listParticipants(id);
  const consentMap = await getConsentMap(id);
  return Response.json({
    participants: participants.map((p) => ({ ...p, consentStatus: consentMap.get(p.id) ?? p.consentStatus })),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await params;
  const body = await request.json().catch(() => ({}));
  const { participantId, status } = body as { participantId?: string; status?: string };
  if (!participantId || !["pending", "opted_in", "opted_out"].includes(status ?? "")) {
    return Response.json({ error: "participantId and valid status are required" }, { status: 400 });
  }
  const updated = await setConsent(participantId, status as "pending" | "opted_in" | "opted_out");
  return Response.json({ participant: updated });
}
