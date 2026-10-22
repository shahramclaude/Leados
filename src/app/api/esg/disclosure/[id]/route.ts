import { db } from "@/db";
import { disclosurePacks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyLineageManifest, LineageManifest } from "@/lib/lineage";
import { loadActivities, loadFactors, loadEnvironmentalMetrics, loadPeopleAggregates, loadGovernanceDecisions } from "@/lib/esgData";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const rows = await db.select().from(disclosurePacks).where(eq(disclosurePacks.id, id));
    const row = rows[0];
    if (!row) {
      return Response.json({ ok: false, error: "disclosure pack not found" }, { status: 404 });
    }

    const [acts, factors, env, people, governance] = await Promise.all([
      loadActivities(),
      loadFactors(),
      loadEnvironmentalMetrics(),
      loadPeopleAggregates(),
      loadGovernanceDecisions(),
    ]);
    const knownRawIds = new Set<string>([
      ...acts.map((a) => a.id),
      ...factors.map((f) => f.id),
      ...env.map((e) => e.id),
      ...people.map((p) => p.id),
      ...governance.map((g) => g.id),
    ]);

    const manifest = row.lineageManifest as LineageManifest;
    const verification = verifyLineageManifest(manifest, knownRawIds);

    return Response.json({
      ok: true,
      data: {
        id: row.id,
        period: row.period,
        standard: row.standard,
        generatedAt: row.generatedAt.toISOString(),
        figures: row.figures,
        gaps: row.gaps,
        lineageManifest: manifest,
        manifestHash: row.manifestHash,
        lineageVerification: verification,
      },
    });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "unknown error" }, { status: 500 });
  }
}
