import { db } from "@/db";
import { evolutionLoops } from "@/db/schema";
import { DIMENSIONS } from "@/lib/fitness/dimensions";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(evolutionLoops).orderBy(desc(evolutionLoops.createdAt));
  return Response.json({ ok: true, loops: rows });
}

/**
 * POST /api/fitness/evolution-loops — register a new hypothesis.
 * Body: { title, dimensionId, hypothesis, relatedExperimentId? }
 * Starts at stage "hypothesis". Nothing executes automatically — see
 * src/lib/fitness/evolutionLoop.ts for the full gated stage machine.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, dimensionId, hypothesis, relatedExperimentId } = body as {
      title?: string;
      dimensionId?: string;
      hypothesis?: string;
      relatedExperimentId?: string;
    };

    if (!title || !dimensionId || !hypothesis) {
      return Response.json({ ok: false, error: "title, dimensionId, hypothesis are required." }, { status: 400 });
    }
    if (!DIMENSIONS.some((d) => d.id === dimensionId)) {
      return Response.json({ ok: false, error: `Unknown dimensionId: ${dimensionId}` }, { status: 400 });
    }

    const [created] = await db
      .insert(evolutionLoops)
      .values({
        title,
        dimensionId,
        hypothesis,
        relatedExperimentId: relatedExperimentId ?? null,
        stage: "hypothesis",
      })
      .returning();

    return Response.json({ ok: true, loop: created });
  } catch (err) {
    console.error(err);
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "create failed" }, { status: 500 });
  }
}
