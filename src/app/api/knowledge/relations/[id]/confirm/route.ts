import { confirmRelation } from "@/lib/knowledgeGraph";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const body = await req.json();
    if (!body.confirmedBy || typeof body.accept !== "boolean") {
      return Response.json({ ok: false, error: "confirmedBy and accept (boolean) are required" }, { status: 400 });
    }
    const relation = await confirmRelation(id, body.confirmedBy, body.accept);
    if (!relation) return Response.json({ ok: false, error: "Relation not found" }, { status: 404 });
    return Response.json({ ok: true, relation });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
