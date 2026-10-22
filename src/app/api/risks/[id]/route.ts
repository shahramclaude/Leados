import { getRisk, summarizeBeliefs } from "@/lib/risk";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const risk = await getRisk(Number(id));
  if (!risk) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ risk, beliefs: summarizeBeliefs(risk) });
}
