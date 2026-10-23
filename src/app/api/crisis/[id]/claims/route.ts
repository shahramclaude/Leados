import { submitClaim, addClaimSource } from "@/lib/crisis/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  if (body.claimId && body.addSource) {
    const result = await addClaimSource(body.claimId, body.addSource);
    return Response.json(result);
  }

  const result = await submitClaim(id, body.statement, body.sources ?? []);
  return Response.json(result);
}
