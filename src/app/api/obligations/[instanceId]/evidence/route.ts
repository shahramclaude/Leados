import { recordObligationEvidence } from "@/lib/obligations";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ instanceId: string }> }) {
  const { instanceId } = await context.params;
  let actor = "compliance-officer";
  let note = "Evidence recorded via Obligation Calendar.";
  try {
    const body = await req.json();
    if (typeof body?.actor === "string") actor = body.actor;
    if (typeof body?.note === "string") note = body.note;
  } catch {
    // defaults
  }
  const evidence = await recordObligationEvidence(Number(instanceId), actor, note);
  return Response.json({ evidence });
}
