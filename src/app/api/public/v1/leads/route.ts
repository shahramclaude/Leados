import { db } from "@/db";
import { leads } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requirePublicOrgId } from "@/lib/tenant";
import { assertRouteRegistered } from "@/lib/registry";
import { handleRouteError } from "@/lib/api-response";
import { makeExplain } from "@/lib/explain";

export const dynamic = "force-dynamic";

// Public API surface (Part 16). Two independent gates must both pass before
// any row is returned: (1) the route itself must be listed in the registry
// (Part 19), and (2) the caller's API key must resolve to exactly one org
// (Part 15 tenant scoping) — the response can never span tenants.
export async function GET(req: Request) {
  try {
    assertRouteRegistered("/api/public/v1/leads");
    const orgId = await requirePublicOrgId(req);
    const rows = await db.select().from(leads).where(eq(leads.orgId, orgId)).orderBy(desc(leads.createdAt)).limit(50);
    const data = rows.map((lead) => ({
      id: lead.id,
      name: lead.name,
      company: lead.company,
      stage: lead.stage,
      score: makeExplain({
        value: lead.score ? Number(lead.score) : 0,
        confidence: lead.scoreConfidence ? Number(lead.scoreConfidence) : 0,
        basis: lead.score ? ["most recent internal scoring run"] : ["no score computed yet"],
        generatedBy: "system",
      }),
    }));
    return Response.json({ ok: true, leads: data });
  } catch (err) {
    return handleRouteError(err);
  }
}
