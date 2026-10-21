import { getModelCard } from "@/lib/intelligence/modelCards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const card = getModelCard(id);
  if (!card) return Response.json({ error: "Model card not found" }, { status: 404 });
  return Response.json({ modelCard: card });
}
