import { recordRecusal } from "@/lib/conflictOfInterest";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  if (!body.decisionId) return Response.json({ error: '"decisionId" is required' }, { status: 400 });

  try {
    const row = await recordRecusal({ declarationId: Number(id), decisionId: Number(body.decisionId) });
    return Response.json({ recusal: row }, { status: 201 });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 404 });
  }
}
