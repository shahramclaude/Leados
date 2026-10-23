import { publishStatusUpdate, CrisisServiceError } from "@/lib/crisis/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  try {
    const update = await publishStatusUpdate({
      crisisId: id,
      headline: body.headline,
      body: body.body,
      severity: Number(body.severity ?? 3),
      actingRoleKeys: body.actingRoleKeys ?? [],
      actorPersonaId: body.actorPersonaId,
    });
    return Response.json({ update });
  } catch (err) {
    if (err instanceof CrisisServiceError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
