import { declareConflict, listDeclarations } from "@/lib/conflictOfInterest";
import { actorFromHeaders } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const declarations = await listDeclarations();
  return Response.json({ declarations });
}

export async function POST(req: Request) {
  const actor = actorFromHeaders(req.headers);
  const body = await req.json();
  if (!body.interestDescription || !body.relatedEntity) {
    return Response.json({ error: '"interestDescription" and "relatedEntity" are required' }, { status: 400 });
  }
  const personId = actor.personId ?? body.personId;
  if (!personId) return Response.json({ error: "personId required (x-actor-id header or body.personId)" }, { status: 400 });

  const row = await declareConflict({
    personId,
    interestDescription: body.interestDescription,
    relatedEntity: body.relatedEntity,
  });
  return Response.json({ declaration: row }, { status: 201 });
}
