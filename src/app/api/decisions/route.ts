import { SEEDED_DECISIONS } from "@/lib/intelligence/decisions";
import { rankDecisionsByVoi } from "@/lib/intelligence/decisionEngine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const ranked = rankDecisionsByVoi(SEEDED_DECISIONS);
    const decisionsById = Object.fromEntries(SEEDED_DECISIONS.map((d) => [d.id, d]));
    const payload = ranked.map((r) => ({
      ...r,
      description: decisionsById[r.decisionId]?.description,
      actions: decisionsById[r.decisionId]?.actions,
      states: decisionsById[r.decisionId]?.states,
      stateConfidenceClass: decisionsById[r.decisionId]?.stateConfidenceClass,
    }));
    return Response.json({ decisions: payload });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
