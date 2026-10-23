import { checkStatusByLookup } from "@/lib/safeChannel/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.caseRef || !body.lookupSecret) {
    return Response.json({ error: '"caseRef" and "lookupSecret" are required' }, { status: 400 });
  }
  const result = await checkStatusByLookup(body.caseRef, body.lookupSecret);
  if (!result) return Response.json({ error: "No matching case for that reference/secret pair." }, { status: 404 });
  return Response.json({ status: result });
}
