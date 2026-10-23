import { recordSignal, aggregateForCase } from "@/lib/antiRetaliation";
import { actorFromHeaders, ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const caseId = url.searchParams.get("caseId");
  if (!caseId) return Response.json({ error: '"caseId" query param is required' }, { status: 400 });
  const result = await aggregateForCase(Number(caseId));
  return Response.json({ result });
}

export async function POST(req: Request) {
  const actor = actorFromHeaders(req.headers);
  // Only HR/ombudsman/ethics roles record signals — this is an internal
  // monitoring input, not a public endpoint.
  const allowed: string[] = [ROLES.HR_MANAGER, ROLES.OMBUDSMAN, ROLES.ETHICS_OFFICER];
  if (!actor.role || !allowed.includes(actor.role)) {
    return Response.json({ error: "Not authorized to record anti-retaliation signals." }, { status: 403 });
  }

  const body = await req.json();
  if (!body.caseId || !body.personIdentifier || !body.signalType) {
    return Response.json({ error: '"caseId", "personIdentifier", and "signalType" are required' }, { status: 400 });
  }

  const row = await recordSignal({
    caseId: Number(body.caseId),
    personIdentifier: body.personIdentifier,
    signalType: body.signalType,
    recordedByPersonId: actor.personId ?? undefined,
  });
  return Response.json({ signal: { id: row.id, signalType: row.signalType } }, { status: 201 });
}
