import { db } from "@/db";
import { integrationDifficultyScores } from "@/db/schema";
import { scoreIntegrationDifficulty } from "@/lib/org-design/integrationScore";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dealId = Number(id);
  const body = await req.json();

  const cultureDistance = Number(body.cultureDistance);
  const systemsOverlapPct = Number(body.systemsOverlapPct);
  const talentFlightRisk = Number(body.talentFlightRisk);

  if (![cultureDistance, systemsOverlapPct, talentFlightRisk].every((n) => Number.isFinite(n) && n >= 0 && n <= 100)) {
    return Response.json({ ok: false, error: "cultureDistance, systemsOverlapPct, talentFlightRisk must each be numbers 0..100" }, { status: 400 });
  }

  const explain = scoreIntegrationDifficulty({ cultureDistance, systemsOverlapPct, talentFlightRisk });

  const [row] = await db
    .insert(integrationDifficultyScores)
    .values({
      dealId,
      cultureDistance,
      systemsOverlapPct,
      talentFlightRisk,
      compositeLow: explain.low,
      compositeMid: explain.value,
      compositeHigh: explain.high,
      confidence: explain.confidence,
      rationale: explain.rationale,
    })
    .returning();

  return Response.json({ ok: true, score: row, explain });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dealId = Number(id);
  const rows = await db.select().from(integrationDifficultyScores).where(eq(integrationDifficultyScores.dealId, dealId));
  return Response.json({ ok: true, scores: rows });
}
