import { checkProximity, listProximityWarnings } from "@/lib/conflictOfInterest";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const decisionId = url.searchParams.get("decisionId");
  const warnings = await listProximityWarnings(decisionId ? Number(decisionId) : undefined);
  return Response.json({ warnings });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.personId || !body.decisionId) {
    return Response.json({ error: '"personId" and "decisionId" are required' }, { status: 400 });
  }
  try {
    const result = await checkProximity(Number(body.personId), Number(body.decisionId));
    return Response.json({ result });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 404 });
  }
}
