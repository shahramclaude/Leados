import { db } from "@/db";
import { fitnessWeightPolicies } from "@/db/schema";
import { DIMENSIONS } from "@/lib/fitness/dimensions";
import type { WeightMap } from "@/lib/fitness/types";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(fitnessWeightPolicies).orderBy(desc(fitnessWeightPolicies.version));
  return Response.json({ ok: true, policies: rows });
}

/**
 * POST /api/fitness/policies — create a new DRAFT weight policy.
 * Body: { name: string, rationale: string, weights: WeightMap }
 * A rationale is REQUIRED per the weight-policy honesty rule: no silent
 * reweighting. Activation is a separate, explicit step
 * (POST /api/fitness/policies/:id/activate).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, rationale, weights } = body as { name?: string; rationale?: string; weights?: WeightMap };

    if (!name || !rationale) {
      return Response.json({ ok: false, error: "name and rationale are required." }, { status: 400 });
    }
    if (!weights) {
      return Response.json({ ok: false, error: "weights map is required." }, { status: 400 });
    }

    const missingDims = DIMENSIONS.filter((d) => weights[d.id] === undefined);
    if (missingDims.length > 0) {
      return Response.json(
        { ok: false, error: `Missing weight for dimensions: ${missingDims.map((d) => d.id).join(", ")}` },
        { status: 400 },
      );
    }
    const missingRationale = DIMENSIONS.filter((d) => !weights[d.id]?.rationale);
    if (missingRationale.length > 0) {
      return Response.json(
        {
          ok: false,
          error: `Per-dimension rationale required for: ${missingRationale.map((d) => d.id).join(", ")}`,
        },
        { status: 400 },
      );
    }

    const [latest] = await db
      .select({ version: fitnessWeightPolicies.version })
      .from(fitnessWeightPolicies)
      .orderBy(desc(fitnessWeightPolicies.version))
      .limit(1);
    const nextVersion = (latest?.version ?? 0) + 1;

    const [created] = await db
      .insert(fitnessWeightPolicies)
      .values({
        version: nextVersion,
        name,
        rationale,
        weights,
        status: "draft",
        createdBy: "org-admin",
      })
      .returning();

    return Response.json({ ok: true, policy: created });
  } catch (err) {
    console.error(err);
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "create failed" }, { status: 500 });
  }
}
