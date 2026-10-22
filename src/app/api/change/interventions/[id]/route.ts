import { getIntervention, listInterventionResults } from "@/lib/change/repository";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const intervention = await getIntervention(id);
  if (!intervention) {
    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  }
  const results = await listInterventionResults(id);
  return Response.json({ ok: true, intervention, results });
}
