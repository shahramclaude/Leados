import { getEntity, listRelationsForEntity } from "@/lib/knowledgeGraph";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const entity = await getEntity(id);
  if (!entity) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  const relations = await listRelationsForEntity(id, { includeProposed: true });
  return Response.json({ ok: true, entity, relations });
}
