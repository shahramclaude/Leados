import { getActorFromRequest } from "@/lib/auth";
import { contributeResearchMetric, readResearchAggregate } from "@/lib/leaderState/research";

export const dynamic = "force-dynamic";

/**
 * GET returns an aggregate only — never raw contributions — and only when
 * the cohort has at least K_ANONYMITY_THRESHOLD distinct contributors.
 * No actor/auth is required to read an aggregate because, by construction,
 * it can never reveal an individual's data once the k-anonymity gate holds.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cohortKey = url.searchParams.get("cohortKey");
  const metricType = url.searchParams.get("metricType");
  if (!cohortKey || !metricType) {
    return Response.json({ error: "cohortKey and metricType query parameters are required" }, { status: 400 });
  }
  const result = await readResearchAggregate(cohortKey, metricType);
  return Response.json({ result });
}

export async function POST(req: Request) {
  const actor = getActorFromRequest(req);
  if (!actor) return Response.json({ error: "missing x-user-id" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { cohortKey, metricType, metricValue } = body ?? {};
  if (typeof cohortKey !== "string" || typeof metricType !== "string" || typeof metricValue !== "number") {
    return Response.json(
      { error: "cohortKey (string), metricType (string), metricValue (number) are required" },
      { status: 400 },
    );
  }

  const contribution = await contributeResearchMetric(actor, actor.userId, { cohortKey, metricType, metricValue });
  return Response.json({ contribution }, { status: 201 });
}
