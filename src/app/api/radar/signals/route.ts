import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { crisisElevations, externalSignals, externalSources } from "@/db/schema";
import { scoreSignal } from "@/lib/radar/signals";
import { sensingNotAvailableNotice } from "@/lib/seams/part13-sensing";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const segmentId = searchParams.get("segmentId");

  const signals = await db
    .select({
      id: externalSignals.id,
      title: externalSignals.title,
      summary: externalSignals.summary,
      signalType: externalSignals.signalType,
      severity: externalSignals.severity,
      evidenceClass: externalSignals.evidenceClass,
      publishedAt: externalSignals.publishedAt,
      escalated: externalSignals.escalated,
      escalationRef: externalSignals.escalationRef,
      sourceName: externalSources.name,
      reliabilityClass: externalSources.reliabilityClass,
      reliabilityScore: externalSources.reliabilityScore,
    })
    .from(externalSignals)
    .innerJoin(externalSources, eq(externalSignals.sourceId, externalSources.id))
    .where(segmentId ? eq(externalSignals.segmentId, Number(segmentId)) : undefined)
    .orderBy(desc(externalSignals.publishedAt));

  return Response.json({ signals, notice: sensingNotAvailableNotice() });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { sourceId, segmentId, title, summary, signalType, severity, publishedAt } = body ?? {};

  if (!sourceId || !title || !summary || !signalType || !severity || !publishedAt) {
    return Response.json(
      { error: "sourceId, title, summary, signalType, severity, publishedAt are required" },
      { status: 400 },
    );
  }

  const [source] = await db.select().from(externalSources).where(eq(externalSources.id, sourceId)).limit(1);
  if (!source) {
    return Response.json({ error: `source ${sourceId} not found` }, { status: 404 });
  }

  const scored = scoreSignal(
    {
      sourceName: source.name,
      sourceType: source.sourceType as "news" | "registry" | "licensed_dataset" | "regulator",
      title,
      summary,
      signalType,
      severityHint: severity,
      publishedAt,
    },
    source.reliabilityScore,
  );

  const [inserted] = await db
    .insert(externalSignals)
    .values({
      sourceId,
      segmentId: segmentId ?? null,
      title: scored.title,
      summary: scored.summary,
      signalType: scored.signalType,
      severity: scored.severity,
      evidenceClass: scored.evidenceClass,
      publishedAt: new Date(publishedAt),
      escalated: scored.elevation.elevate,
    })
    .returning();

  let elevation = null;
  if (scored.elevation.elevate) {
    const [row] = await db
      .insert(crisisElevations)
      .values({
        signalId: inserted.id,
        reason: scored.elevation.reason,
        thresholdBreached: scored.elevation.thresholdBreached,
      })
      .returning();
    await db.update(externalSignals).set({ escalationRef: row.id }).where(eq(externalSignals.id, inserted.id));
    elevation = row;
  }

  return Response.json({ signal: inserted, scored, elevation });
}
