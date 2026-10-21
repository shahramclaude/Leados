import { db } from "@/db";
import { leads, scoreEvents } from "@/db/schema";
import { computeScore } from "@/lib/scoring";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/leads/:id/score
 * Forces a recomputation of the lead's score using the current rule-v1
 * heuristics, even if no input fields changed (useful after editing the
 * weights in src/lib/scoring.ts and wanting to re-run them against existing
 * data — see docs/how-to-guides.md "Add a scoring rule").
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  const [lead] = await db.select().from(leads).where(eq(leads.id, id));
  if (!lead) return Response.json({ error: "lead not found" }, { status: 404 });

  const { score, breakdown, version } = computeScore({
    email: lead.email,
    company: lead.company,
    source: lead.source,
    notes: lead.notes,
  });

  const [updated] = await db
    .update(leads)
    .set({ score, scoreBreakdown: breakdown, scoreVersion: version, updatedAt: new Date() })
    .where(eq(leads.id, id))
    .returning();

  await db.insert(scoreEvents).values({ leadId: id, score, breakdown, scoreVersion: version, reason: "recomputed" });

  return Response.json({ lead: updated });
}
