import { listRisks, summarizeBeliefs } from "@/lib/risk";

export const dynamic = "force-dynamic";

export async function GET() {
  const risks = await listRisks();
  const payload = risks.map((r) => ({ risk: r, beliefs: summarizeBeliefs(r) }));
  return Response.json({ risks: payload });
}
